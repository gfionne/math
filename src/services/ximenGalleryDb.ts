import {
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  Timestamp,
  Unsubscribe,
} from 'firebase/firestore';
import {auth, db} from './googleAuth';
import {handleFirestoreError, OperationType} from './firestoreSync';

const GALLERY_COLLECTION = 'ximenGalleryItems';

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

/**
 * Subscribes in real time to Ximen Scratch Gallery Center items.
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

  const q = query(
    collection(db, GALLERY_COLLECTION),
    orderBy('createdAt', 'desc'),
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
      onUpdate(items);
    },
    (error) => {
      try {
        handleFirestoreError(error, OperationType.LIST, GALLERY_COLLECTION);
      } catch (wrapped) {
        onError?.(wrapped as Error);
      }
    },
  );
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

  const safeImageUrl = input.imageUrl.trim().slice(0, 500);
  const safeDownloadUrl = input.downloadUrl.trim().slice(0, 500);
  if (
    !safeImageUrl.startsWith('https://') ||
    !safeDownloadUrl.startsWith('https://')
  ) {
    throw new Error('圖片網址格式無效，必須為 HTTPS 連結。');
  }

  const payload = {
    name: (input.name.trim() || input.fileName.trim() || '未命名圖片').slice(
      0,
      200,
    ),
    fileName: (input.fileName.trim() || 'image.png').slice(0, 200),
    folderName: input.folderName.trim().slice(0, 120),
    imageUrl: safeImageUrl,
    downloadUrl: safeDownloadUrl,
    driveFileId: input.driveFileId.trim().slice(0, 200),
    mimeType: (input.mimeType.trim() || 'image/png').slice(0, 100),
    sizeBytes: Math.min(
      52428800,
      Math.max(0, Math.floor(Number(input.sizeBytes) || 0)),
    ),
    uploadedByName: (currentUser.displayName?.trim() || '領域教師').slice(
      0,
      100,
    ),
    uploadedByUid: currentUser.uid.slice(0, 128),
    createdAt: serverTimestamp(),
  };

  try {
    await setDoc(doc(db, GALLERY_COLLECTION, id), payload);
    return id;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, docPath);
  }
}

export async function deleteXimenGalleryItem(id: string): Promise<void> {
  if (!auth.currentUser) {
    throw new Error('請先以教師帳號登入後再刪除圖片。');
  }
  const docPath = `${GALLERY_COLLECTION}/${id}`;
  try {
    await deleteDoc(doc(db, GALLERY_COLLECTION, id));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, docPath);
  }
}
