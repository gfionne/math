import {
  collection,
  deleteDoc,
  doc,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  Timestamp,
  Unsubscribe,
} from 'firebase/firestore';
import {auth, db} from './googleAuth';
import {
  handleFirestoreError,
  isFirestoreQuotaError,
  OperationType,
} from './firestoreSync';

const GALLERY_COLLECTION = 'ximenGalleryItems';
const GALLERY_CACHE_KEY = 'pesmath_ximen_gallery_cache_v1';

export interface XimenGalleryItem {
  id: string;
  name: string;
  fileName: string;
  folderName: string;
  imageUrl: string;
  downloadUrl: string;
  driveFileId: string;
  mimeType: string;
  sizeBytes: number;
  uploadedByName: string;
  uploadedByUid: string;
  createdAtMs: number;
}

export interface CreateXimenGalleryItemInput {
  name: string;
  fileName: string;
  folderName: string;
  imageUrl: string;
  downloadUrl: string;
  driveFileId: string;
  mimeType: string;
  sizeBytes: number;
}

let memoryCachedItems: XimenGalleryItem[] | null = null;

function readGalleryCache(): XimenGalleryItem[] {
  if (memoryCachedItems) return memoryCachedItems;
  try {
    const raw = localStorage.getItem(GALLERY_CACHE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      memoryCachedItems = parsed;
      return parsed;
    }
  } catch {
    // ignore storage errors
  }
  return [];
}

function writeGalleryCache(items: XimenGalleryItem[]): void {
  memoryCachedItems = items;
  try {
    // Prefer caching lightweight HTTPS items cleanly; skip huge Base64 strings if storage is tight
    const compactItems = items.filter(
      (item) => !item.imageUrl.startsWith('data:') || item.imageUrl.length < 60_000,
    );
    localStorage.setItem(GALLERY_CACHE_KEY, JSON.stringify(compactItems.slice(0, 150)));
  } catch {
    // ignore localStorage quota errors
  }
}

function generateGalleryDocId(): string {
  const randomSuffix = Math.random().toString(36).slice(2, 10);
  return `ximen_${Date.now()}_${randomSuffix}`;
}

function toTimestampMs(raw: unknown): number {
  if (raw instanceof Timestamp) {
    return raw.toMillis();
  }
  if (
    raw &&
    typeof raw === 'object' &&
    'toMillis' in raw &&
    typeof (raw as {toMillis: () => number}).toMillis === 'function'
  ) {
    return (raw as {toMillis: () => number}).toMillis();
  }
  return Date.now();
}

function formatFriendlyGalleryError(err: unknown, fallbackMsg: string): Error {
  if (isFirestoreQuotaError(err)) {
    return new Error(
      'Firestore_QUOTA_EXCEEDED: 雲端資料庫今日免費讀取額度已達上限（將於明日自動重設，或可至 Firebase Console 檢視資料庫額度）。',
    );
  }
  if (err instanceof Error) {
    return err;
  }
  return new Error(fallbackMsg);
}

/**
 * Subscribes in real time to Ximen Scratch Gallery Center items (bounded to 200 items + cached).
 * Caller must ensure the user is authenticated as a teacher or verified @hmes.tp.edu.tw member.
 */
export function subscribeXimenGalleryItems(
  onUpdate: (items: XimenGalleryItem[]) => void,
  onError?: (err: Error) => void,
): Unsubscribe {
  if (!auth.currentUser) {
    onUpdate([]);
    return () => {};
  }

  const cached = readGalleryCache();
  if (cached.length > 0) {
    onUpdate(cached);
  }

  const q = query(
    collection(db, GALLERY_COLLECTION),
    orderBy('createdAt', 'desc'),
    limit(200),
  );

  return onSnapshot(
    q,
    (snapshot) => {
      const items: XimenGalleryItem[] = snapshot.docs.map((docSnap) => {
        const d = docSnap.data();
        return {
          id: docSnap.id,
          name: String(d.name ?? ''),
          fileName: String(d.fileName ?? ''),
          folderName: String(d.folderName ?? ''),
          imageUrl: String(d.imageUrl ?? ''),
          downloadUrl: String(d.downloadUrl ?? ''),
          driveFileId: String(d.driveFileId ?? ''),
          mimeType: String(d.mimeType ?? 'image/png'),
          sizeBytes: Number(d.sizeBytes ?? 0),
          uploadedByName: String(d.uploadedByName ?? '領域教師'),
          uploadedByUid: String(d.uploadedByUid ?? ''),
          createdAtMs: toTimestampMs(d.createdAt),
        };
      });
      writeGalleryCache(items);
      onUpdate(items);
    },
    (error) => {
      try {
        handleFirestoreError(error, OperationType.LIST, GALLERY_COLLECTION);
      } catch (wrapped) {
        onError?.(formatFriendlyGalleryError(wrapped, '載入圖庫資料失敗。'));
      }
    },
  );
}

const textEncoder = new TextEncoder();

function truncateUtf8(value: string, maxBytes: number): string {
  const trimmed = value.trim();
  if (textEncoder.encode(trimmed).length <= maxBytes) return trimmed;
  let result = '';
  let byteCount = 0;
  for (const ch of trimmed) {
    const chBytes = textEncoder.encode(ch).length;
    if (byteCount + chBytes > maxBytes) break;
    result += ch;
    byteCount += chBytes;
  }
  return result;
}

/**
 * Creates a gallery item document in Firestore with strict payload boundaries
 * matching firebase-blueprint.json (XimenGalleryItem) and firestore.rules.
 */
export async function createXimenGalleryItem(
  input: CreateXimenGalleryItemInput,
): Promise<string> {
  const currentUser = auth.currentUser;
  if (!currentUser) {
    throw new Error('請先以教師帳號登入後再上傳圖庫圖片。');
  }

  const id = generateGalleryDocId();
  const docPath = `${GALLERY_COLLECTION}/${id}`;

  const safeImageUrl = input.imageUrl.trim();
  const safeDownloadUrl = input.downloadUrl.trim();
  if (
    !(safeImageUrl.startsWith('https://') || safeImageUrl.startsWith('data:image/')) ||
    !(safeDownloadUrl.startsWith('https://') || safeDownloadUrl.startsWith('data:image/'))
  ) {
    throw new Error('圖片格式無效，必須為 HTTPS 連結或圖片 Data URL。');
  }

  if (
    textEncoder.encode(safeImageUrl).length > 900000 ||
    textEncoder.encode(safeDownloadUrl).length > 900000 ||
    textEncoder.encode(safeImageUrl).length +
      textEncoder.encode(safeDownloadUrl).length >
      950000
  ) {
    throw new Error('圖片壓縮後仍超過雲端資料庫單筆 1MB 上限，請縮小圖片解析度或啟用 Google Drive 上傳權限。');
  }

  const safeName =
    truncateUtf8(input.name || input.fileName || '未命名圖片', 200) || '未命名圖片';
  const safeFileName =
    truncateUtf8(input.fileName || 'image.png', 200) || 'image.png';
  const safeFolderName = truncateUtf8(input.folderName || '', 120);
  const safeDriveFileId =
    truncateUtf8(input.driveFileId || `local_${Date.now()}`, 200) ||
    `local_${Date.now()}`;
  const safeMimeType =
    truncateUtf8(input.mimeType || 'image/png', 100) || 'image/png';
  const safeUploaderName =
    truncateUtf8(currentUser.displayName || '領域教師', 100) || '領域教師';
  const safeSizeBytes = Math.min(
    52428800,
    Math.max(0, Math.floor(Number(input.sizeBytes) || 0)),
  );

  const payload = {
    name: safeName,
    fileName: safeFileName,
    folderName: safeFolderName,
    imageUrl: safeImageUrl,
    downloadUrl: safeDownloadUrl,
    driveFileId: safeDriveFileId,
    mimeType: safeMimeType,
    sizeBytes: safeSizeBytes,
    uploadedByName: safeUploaderName,
    uploadedByUid: currentUser.uid.slice(0, 128),
    createdAt: serverTimestamp(),
  };

  try {
    await setDoc(doc(db, GALLERY_COLLECTION, id), payload);
    const createdItem: XimenGalleryItem = {
      id,
      name: safeName,
      fileName: safeFileName,
      folderName: safeFolderName,
      imageUrl: safeImageUrl,
      downloadUrl: safeDownloadUrl,
      driveFileId: safeDriveFileId,
      mimeType: safeMimeType,
      sizeBytes: safeSizeBytes,
      uploadedByName: safeUploaderName,
      uploadedByUid: currentUser.uid.slice(0, 128),
      createdAtMs: Date.now(),
    };
    const nextCache = [
      createdItem,
      ...readGalleryCache().filter((item) => item.id !== id),
    ];
    writeGalleryCache(nextCache);
    return id;
  } catch (error) {
    try {
      handleFirestoreError(error, OperationType.CREATE, docPath);
    } catch (wrapped) {
      throw formatFriendlyGalleryError(wrapped, '寫入圖庫資料庫失敗。');
    }
  }
}

export async function deleteXimenGalleryItem(id: string): Promise<void> {
  if (!auth.currentUser) {
    throw new Error('請先以教師帳號登入後再刪除圖片。');
  }
  const docPath = `${GALLERY_COLLECTION}/${id}`;
  try {
    await deleteDoc(doc(db, GALLERY_COLLECTION, id));
    const nextCache = readGalleryCache().filter((item) => item.id !== id);
    writeGalleryCache(nextCache);
  } catch (error) {
    try {
      handleFirestoreError(error, OperationType.DELETE, docPath);
    } catch (wrapped) {
      throw formatFriendlyGalleryError(wrapped, '刪除圖庫資料失敗。');
    }
  }
}
