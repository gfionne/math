import React, {useEffect, useMemo, useRef, useState} from 'react';
import {User} from 'firebase/auth';
import {
  AlertCircle,
  CheckCircle2,
  Download,
  FolderOpen,
  FolderUp,
  ImagePlus,
  Lock,
  LogOut,
  Map as MapIcon,
  RefreshCw,
  ShieldCheck,
  Trash2,
  Upload,
} from 'lucide-react';
import {isHmesStudentEmail, SCHOOL_DOMAIN} from '../services/googleAuth';
import {
  deleteDriveFile,
  uploadGalleryImageToDrive,
} from '../services/driveUpload';
import {
  createXimenGalleryItem,
  deleteXimenGalleryItem,
  subscribeXimenGalleryItems,
  XimenGalleryItem,
} from '../services/ximenGalleryDb';
import {getAccessToken} from '../services/googleAuth';
import {
  OFFICIAL_XIMEN_ASSETS,
  OfficialXimenAsset,
} from '../utils/ximenOfficialAssets';

interface XimenGalleryPanelProps {
  user: User | null;
  isTeacher: boolean;
  hasAccessToken: boolean;
  isSigningIn: boolean;
  authError: string | null;
  onClearAuthError: () => void;
  onTeacherSignIn: () => void;
  onStudentSignIn: () => void;
  onSignOut: () => void;
  onApplyMapBackground: (imageUrl: string, displayName: string) => void;
}

const IMAGE_EXTENSIONS_RE = /\.(png|jpe?g|gif|webp|svg|bmp|avif)$/i;

function isSupportedImageFile(file: File): boolean {
  if (!file || file.name.startsWith('.')) return false;
  if (file.type && file.type.startsWith('image/')) return true;
  return IMAGE_EXTENSIONS_RE.test(file.name);
}

function formatBytes(bytes: number): string {
  if (!bytes || bytes <= 0) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function extractRelativeFolder(file: File, fallbackFolder: string): string {
  const rel = (file as File & {webkitRelativePath?: string}).webkitRelativePath;
  if (rel && rel.includes('/')) {
    const parts = rel.split('/').filter(Boolean);
    if (parts.length > 1) {
      parts.pop(); // remove filename
      const dirPath = parts.join('/').slice(0, 120);
      if (fallbackFolder.trim()) {
        return `${fallbackFolder.trim()}/${dirPath}`.slice(0, 120);
      }
      return dirPath;
    }
  }
  return fallbackFolder.trim().slice(0, 120);
}

const OfficialAssetCard: React.FC<{
  asset: OfficialXimenAsset;
  onDownloaded: (msg: string) => void;
}> = ({asset, onDownloaded}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    asset.draw(ctx, asset.width, asset.height);
  }, [asset]);

  const handleDownload = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    try {
      const dataUrl = canvas.toDataURL('image/png');
      const a = document.createElement('a');
      a.href = dataUrl;
      a.download = asset.filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      onDownloaded(`已開始下載「${asset.filename}」`);
    } catch {
      onDownloaded('無法自動觸發下載，請於圖片上按右鍵選擇「另存圖片」。');
    }
  };

  return (
    <div className="bg-white rounded-xl border border-stone-200 overflow-hidden flex flex-col justify-between hover:border-stone-300 transition-colors">
      <div className="h-40 p-4 flex items-center justify-center bg-[radial-gradient(#cbd5e1_1px,transparent_1px)] [background-size:14px_14px] bg-stone-50 border-b border-stone-100">
        <canvas
          ref={canvasRef}
          width={asset.width}
          height={asset.height}
          className="max-h-full max-w-full object-contain drop-shadow-xs"
        />
      </div>
      <div className="p-3.5 space-y-2.5">
        <div>
          <h4 className="font-semibold text-stone-900 text-sm truncate">
            {asset.title}
          </h4>
          <p className="text-xs text-stone-500 mt-0.5 truncate">
            {asset.sizeText}
          </p>
        </div>
        <button
          type="button"
          onClick={handleDownload}
          className="w-full min-h-[36px] bg-[#1E3A8A] hover:bg-[#172554] text-white text-xs font-semibold py-2 px-3 rounded-lg transition-colors inline-flex items-center justify-center gap-1.5"
        >
          <Download className="w-3.5 h-3.5" />
          <span>下載 PNG 圖檔</span>
        </button>
      </div>
    </div>
  );
};

export const XimenGalleryPanel: React.FC<XimenGalleryPanelProps> = ({
  user,
  isTeacher,
  hasAccessToken,
  isSigningIn,
  authError,
  onClearAuthError,
  onTeacherSignIn,
  onStudentSignIn,
  onSignOut,
  onApplyMapBackground,
}) => {
  const isSchoolStudent = Boolean(
    user && user.emailVerified && isHmesStudentEmail(user.email),
  );
  const canViewAndDownload = Boolean(user && (isTeacher || isSchoolStudent));

  const [galleryItems, setGalleryItems] = useState<XimenGalleryItem[]>([]);
  const [isLoadingItems, setIsLoadingItems] = useState(false);
  const [galleryError, setGalleryError] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  // Teacher Upload Controls
  const [customAssetName, setCustomAssetName] = useState('');
  const [folderLabelInput, setFolderLabelInput] = useState('');
  const [uploadProgress, setUploadProgress] = useState<{
    current: number;
    total: number;
    currentFileName: string;
  } | null>(null);

  // Filter & Delete Confirmation States
  const [activeFolder, setActiveFolder] = useState<string>('ALL');
  const [searchKeyword, setSearchKeyword] = useState('');
  const [confirmDeleteItemId, setConfirmDeleteItemId] = useState<string | null>(
    null,
  );
  const [deletingItemId, setDeletingItemId] = useState<string | null>(null);
  const [confirmDeleteFolder, setConfirmDeleteFolder] = useState<string | null>(
    null,
  );
  const [isDeletingFolder, setIsDeletingFolder] = useState(false);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);

  const singleOrMultiFileInputRef = useRef<HTMLInputElement | null>(null);
  const folderInputRef = useRef<HTMLInputElement | null>(null);

  // Attach webkitdirectory / directory attributes imperatively for strict React 19 TS safety
  useEffect(() => {
    const el = folderInputRef.current;
    if (!el) return;
    el.setAttribute('webkitdirectory', '');
    el.setAttribute('directory', '');
  }, [isTeacher, canViewAndDownload]);

  // Real-time Firestore listener ONLY when authenticated as teacher or @hmes.tp.edu.tw student
  useEffect(() => {
    if (!canViewAndDownload) {
      setGalleryItems([]);
      setIsLoadingItems(false);
      return;
    }

    setIsLoadingItems(true);
    setGalleryError(null);
    const unsubscribe = subscribeXimenGalleryItems(
      (items) => {
        setGalleryItems(items);
        setIsLoadingItems(false);
      },
      (err) => {
        setIsLoadingItems(false);
        setGalleryError(err.message || '載入圖庫資料失敗。');
      },
    );

    return () => unsubscribe();
  }, [canViewAndDownload, user?.uid]);

  const folderSummaries = useMemo(() => {
    const counts = new Map<string, number>();
    let uncategorizedCount = 0;

    for (const item of galleryItems) {
      const f = item.folderName.trim();
      if (!f) {
        uncategorizedCount++;
      } else {
        counts.set(f, (counts.get(f) ?? 0) + 1);
      }
    }

    const sortedFolders = Array.from(counts.entries()).sort((a, b) =>
      a[0].localeCompare(b[0], 'zh-Hant'),
    );

    return {
      total: galleryItems.length,
      uncategorizedCount,
      folders: sortedFolders,
    };
  }, [galleryItems]);

  const filteredUploadedItems = useMemo(() => {
    if (activeFolder === 'OFFICIAL') return [];
    const kw = searchKeyword.trim().toLowerCase();
    return galleryItems.filter((item) => {
      if (activeFolder === 'UNCATEGORIZED') {
        if (item.folderName.trim() !== '') return false;
      } else if (activeFolder !== 'ALL') {
        if (item.folderName.trim() !== activeFolder) return false;
      }
      if (kw) {
        const hay =
          `${item.name} ${item.fileName} ${item.folderName}`.toLowerCase();
        return hay.includes(kw);
      }
      return true;
    });
  }, [galleryItems, activeFolder, searchKeyword]);

  const filteredOfficialAssets = useMemo(() => {
    if (activeFolder !== 'ALL' && activeFolder !== 'OFFICIAL') return [];
    const kw = searchKeyword.trim().toLowerCase();
    if (!kw) return OFFICIAL_XIMEN_ASSETS;
    return OFFICIAL_XIMEN_ASSETS.filter(
      (a) =>
        a.title.toLowerCase().includes(kw) ||
        a.filename.toLowerCase().includes(kw),
    );
  }, [activeFolder, searchKeyword]);

  const handleUploadFiles = async (
    fileList: FileList | null,
    isFolderMode: boolean,
  ) => {
    if (!fileList || fileList.length === 0) return;
    if (!isTeacher) {
      setGalleryError('僅限教師帳號權限可上傳圖庫圖片或資料夾。');
      return;
    }

    const token = getAccessToken();
    if (!token) {
      setGalleryError(
        '目前尚未取得 Google Drive 上傳權杖，請點擊上方「重新授權雲端硬碟」完成教師登入。',
      );
      return;
    }

    const allFiles = Array.from(fileList);
    const imageFiles = allFiles.filter(isSupportedImageFile);
    const skippedCount = allFiles.length - imageFiles.length;

    if (imageFiles.length === 0) {
      setGalleryError(
        '所選項目中沒有可識別的圖片檔（支援 PNG、JPG、GIF、WEBP、SVG）。',
      );
      return;
    }

    setGalleryError(null);
    setStatusMessage(null);
    let uploadedCount = 0;
    const failedNames: string[] = [];

    for (let i = 0; i < imageFiles.length; i++) {
      const file = imageFiles[i];
      setUploadProgress({
        current: i + 1,
        total: imageFiles.length,
        currentFileName: file.name,
      });

      const resolvedFolder = isFolderMode
        ? extractRelativeFolder(file, folderLabelInput)
        : folderLabelInput.trim().slice(0, 120);

      const displayName =
        !isFolderMode && imageFiles.length === 1 && customAssetName.trim()
          ? customAssetName.trim()
          : file.name.replace(/\.[^.]+$/, '') || file.name;

      try {
        const driveRes = await uploadGalleryImageToDrive(
          file,
          token,
          resolvedFolder,
        );
        await createXimenGalleryItem({
          name: displayName,
          fileName: file.name,
          folderName: resolvedFolder,
          imageUrl: driveRes.directImageUrl,
          downloadUrl: driveRes.downloadUrl,
          driveFileId: driveRes.fileId,
          mimeType: file.type || 'image/png',
          sizeBytes: file.size || 0,
        });
        uploadedCount++;
      } catch (err: any) {
        failedNames.push(`${file.name} (${err?.message || '上傳失敗'})`);
      }
    }

    setUploadProgress(null);
    if (!isFolderMode) {
      setCustomAssetName('');
    }
    if (singleOrMultiFileInputRef.current) {
      singleOrMultiFileInputRef.current.value = '';
    }
    if (folderInputRef.current) {
      folderInputRef.current.value = '';
    }

    if (uploadedCount > 0) {
      const skipNote =
        skippedCount > 0 ? `（已自動略過 ${skippedCount} 個非圖片檔案）` : '';
      setStatusMessage(
        `已成功上傳 ${uploadedCount} 張圖片至「百年西門專案圖庫中心」${skipNote}。`,
      );
    }
    if (failedNames.length > 0) {
      setGalleryError(
        `部分檔案上傳失敗：${failedNames.slice(0, 3).join('；')}${
          failedNames.length > 3 ? ` 等共 ${failedNames.length} 筆` : ''
        }`,
      );
    }
  };

  const handleDeleteItem = async (item: XimenGalleryItem) => {
    if (!isTeacher) return;
    setDeletingItemId(item.id);
    setGalleryError(null);
    try {
      const token = getAccessToken();
      if (item.driveFileId && token) {
        await deleteDriveFile(item.driveFileId, token);
      }
      await deleteXimenGalleryItem(item.id);
      setConfirmDeleteItemId(null);
      setStatusMessage(`已從圖庫刪除「${item.name}」。`);
    } catch (err: any) {
      setGalleryError(err?.message || '刪除圖片失敗，請確認教師管理權限。');
    } finally {
      setDeletingItemId(null);
    }
  };

  const handleDeleteFolder = async (folderName: string) => {
    if (!isTeacher) return;
    const targets = galleryItems.filter(
      (item) => item.folderName.trim() === folderName,
    );
    if (targets.length === 0) {
      setConfirmDeleteFolder(null);
      return;
    }

    setIsDeletingFolder(true);
    setGalleryError(null);
    const token = getAccessToken();
    let deletedCount = 0;

    for (const item of targets) {
      try {
        if (item.driveFileId && token) {
          await deleteDriveFile(item.driveFileId, token);
        }
        await deleteXimenGalleryItem(item.id);
        deletedCount++;
      } catch {
        // continue deleting remaining items
      }
    }

    setIsDeletingFolder(false);
    setConfirmDeleteFolder(null);
    setActiveFolder('ALL');
    setStatusMessage(`已刪除資料夾「${folderName}」共 ${deletedCount} 張圖片。`);
  };

  const handleDownloadItem = async (item: XimenGalleryItem) => {
    setDownloadingId(item.id);
    try {
      const response = await fetch(item.imageUrl, {mode: 'cors'});
      if (!response.ok) {
        throw new Error('HTTP error');
      }
      const blob = await response.blob();
      const blobUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = blobUrl;
      a.download = item.fileName || `${item.name}.png`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(blobUrl), 1500);
      setStatusMessage(`已開始下載「${item.fileName || item.name}」。`);
    } catch {
      // Cross-origin fallback via Drive direct export download link
      const a = document.createElement('a');
      a.href = item.downloadUrl;
      a.download = item.fileName || `${item.name}.png`;
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setStatusMessage(`已開啟「${item.fileName || item.name}」雲端下載連結。`);
    } finally {
      setDownloadingId(null);
    }
  };

  // =========================================================================
  // Auth Gate for Non-School / Signed-Out Visitors
  // =========================================================================
  if (!canViewAndDownload) {
    return (
      <div className="h-full overflow-y-auto bg-[#FBF9F5] p-4 sm:p-8 flex items-center justify-center">
        <div className="w-full max-w-2xl bg-white border border-stone-200 rounded-2xl shadow-sm p-6 sm:p-10 space-y-6">
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 rounded-xl bg-[#1E3A8A]/10 text-[#1E3A8A] flex items-center justify-center shrink-0">
              <Lock className="w-6 h-6" />
            </div>
            <div className="space-y-1.5">
              <p className="text-xs font-mono-tabular tracking-wider uppercase text-[#1E3A8A] font-semibold">
                HMES Institutional Access Control
              </p>
              <h3 className="font-editorial text-xl sm:text-2xl font-bold text-stone-950">
                百年西門專案圖庫中心 · 校內帳號驗證
              </h3>
              <p className="text-sm text-stone-600 leading-relaxed">
                為保護校內教學素材與學生創作圖檔，圖庫中心採用分級權限管理：
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs leading-relaxed">
            <div className="p-4 rounded-xl bg-[#F7F4EE] border border-stone-200 space-y-1.5">
              <div className="font-bold text-stone-900 text-sm">
                學生瀏覽與下載權限
              </div>
              <p className="text-stone-600">
                請使用學校機構網域{' '}
                <span className="font-mono-tabular font-semibold text-[#1E3A8A]">
                  @{SCHOOL_DOMAIN}
                </span>{' '}
                Google 帳號登入，即可瀏覽資料夾並下載圖庫素材與官方 PNG 元件。
              </p>
            </div>
            <div className="p-4 rounded-xl bg-[#F7F4EE] border border-stone-200 space-y-1.5">
              <div className="font-bold text-stone-900 text-sm">
                教師上傳與管理權限
              </div>
              <p className="text-stone-600">
                社群管理教師登入後，可上傳單張圖片、批次上傳整個資料夾，並可刪除或整理圖庫圖片。
              </p>
            </div>
          </div>

          {user && (
            <div
              role="alert"
              className="p-4 rounded-xl bg-amber-50 border border-amber-200 text-amber-950 text-xs sm:text-sm flex flex-col sm:flex-row sm:items-center justify-between gap-3"
            >
              <div className="flex items-start gap-2.5">
                <AlertCircle className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
                <div>
                  <div className="font-semibold">
                    目前登入帳號不具圖庫存取網域權限
                  </div>
                  <div className="mt-0.5 text-amber-800">
                    您目前登入的是{' '}
                    <span className="font-mono-tabular font-semibold">
                      {user.email || '未識別帳號'}
                    </span>
                    ，非 @{SCHOOL_DOMAIN} 學生帳號或授權教師。
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={onSignOut}
                className="px-3 py-1.5 text-xs font-semibold text-amber-950 bg-white border border-amber-300 rounded-lg hover:bg-amber-100 whitespace-nowrap shrink-0"
              >
                登出切換帳號
              </button>
            </div>
          )}

          {authError && (
            <div
              role="alert"
              className="p-3.5 rounded-xl bg-red-50 border border-red-200 text-red-900 text-xs flex items-start justify-between gap-3"
            >
              <div className="flex items-start gap-2">
                <AlertCircle className="w-4 h-4 text-red-700 shrink-0 mt-0.5" />
                <span>{authError}</span>
              </div>
              <button
                type="button"
                onClick={onClearAuthError}
                className="text-red-700 hover:underline shrink-0"
              >
                關閉
              </button>
            </div>
          )}

          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 pt-2">
            <button
              type="button"
              onClick={onStudentSignIn}
              disabled={isSigningIn}
              className="flex-1 min-h-[44px] px-5 py-2.5 text-sm font-semibold text-white bg-[#1E3A8A] hover:bg-[#172554] disabled:opacity-60 rounded-xl transition-colors inline-flex items-center justify-center gap-2"
            >
              <ShieldCheck className="w-4 h-4" />
              <span>
                {isSigningIn
                  ? '驗證登入中...'
                  : `學生登入（@${SCHOOL_DOMAIN}）`}
              </span>
            </button>
            <button
              type="button"
              onClick={onTeacherSignIn}
              disabled={isSigningIn}
              className="min-h-[44px] px-5 py-2.5 text-sm font-semibold text-stone-800 bg-white border border-stone-300 hover:bg-stone-50 disabled:opacity-60 rounded-xl transition-colors inline-flex items-center justify-center gap-2"
            >
              <Upload className="w-4 h-4 text-[#1E3A8A]" />
              <span>教師管理登入</span>
            </button>
          </div>
        </div>
      </div>
    );
  }

  // =========================================================================
  // Authorized Gallery Workspace (Teachers + @hmes.tp.edu.tw Students)
  // =========================================================================
  return (
    <div className="h-full overflow-y-auto bg-[#FBF9F5]">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 space-y-6">
        {/* Identity & Role Status Bar */}
        <section className="bg-white border border-stone-200 rounded-xl p-4 sm:p-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="font-editorial text-lg sm:text-xl font-bold text-stone-950">
                百年西門專案圖庫中心
              </h3>
              <span
                className={`text-xs font-semibold px-2.5 py-0.5 rounded-md border ${
                  isTeacher
                    ? 'bg-[#1E3A8A]/10 text-[#1E3A8A] border-[#1E3A8A]/20'
                    : 'bg-emerald-50 text-emerald-800 border-emerald-200'
                }`}
              >
                {isTeacher
                  ? '教師管理模式（上傳 / 刪除 / 下載）'
                  : `校內學生模式（@${SCHOOL_DOMAIN} 檢視 / 下載）`}
              </span>
            </div>
            <p className="text-xs sm:text-sm text-stone-600">
              目前登入帳號：
              <span className="font-mono-tabular font-medium text-stone-900">
                {user?.email}
              </span>
              {!isTeacher && (
                <span className="ml-2 text-stone-500">
                  · 可依資料夾瀏覽並下載高畫質圖檔至 Scratch 專題使用
                </span>
              )}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            {isTeacher && !hasAccessToken && (
              <button
                type="button"
                onClick={onTeacherSignIn}
                disabled={isSigningIn}
                className="min-h-[38px] px-3.5 py-1.5 text-xs font-semibold text-white bg-[#1E3A8A] hover:bg-[#172554] rounded-lg inline-flex items-center gap-1.5 transition-colors"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>啟用雲端硬碟上傳權限</span>
              </button>
            )}
            <button
              type="button"
              onClick={onSignOut}
              className="min-h-[38px] px-3.5 py-1.5 text-xs font-medium text-stone-700 bg-white border border-stone-300 hover:bg-stone-50 rounded-lg inline-flex items-center gap-1.5 transition-colors"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>切換帳號 / 登出</span>
            </button>
          </div>
        </section>

        {/* Feedback Banners */}
        {(galleryError || authError) && (
          <div
            role="alert"
            className="bg-red-50 border border-red-200 text-red-900 rounded-xl px-4 py-3 text-xs sm:text-sm flex items-start justify-between gap-3"
          >
            <div className="flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-red-700 shrink-0 mt-0.5" />
              <span>{galleryError || authError}</span>
            </div>
            <button
              type="button"
              onClick={() => {
                setGalleryError(null);
                onClearAuthError();
              }}
              className="text-xs font-medium text-red-700 hover:underline shrink-0"
            >
              關閉
            </button>
          </div>
        )}

        {statusMessage && (
          <div className="bg-emerald-50 border border-emerald-200 text-emerald-900 rounded-xl px-4 py-3 text-xs sm:text-sm flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-700 shrink-0" />
              <span>{statusMessage}</span>
            </div>
            <button
              type="button"
              onClick={() => setStatusMessage(null)}
              className="text-xs font-medium text-emerald-800 hover:underline shrink-0"
            >
              關閉
            </button>
          </div>
        )}

        {/* Teacher-Only Upload Studio (Single/Multi-image + Entire Folder) */}
        {isTeacher && (
          <section className="bg-white border border-stone-200 rounded-xl p-5 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <h4 className="font-editorial text-base font-bold text-stone-950">
                  教師圖庫上傳與資料夾管理
                </h4>
                <p className="text-xs text-stone-500 mt-0.5">
                  支援單張 / 多張圖檔上傳，或直接選取本機「整個資料夾」批次匯入（自動保留資料夾分類架構）。
                </p>
              </div>
              {!hasAccessToken && (
                <span className="text-xs font-medium text-amber-800 bg-amber-50 border border-amber-200 px-2.5 py-1 rounded-md">
                  請先點擊右上方「啟用雲端硬碟上傳權限」
                </span>
              )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-end">
              <div className="md:col-span-4 space-y-1">
                <label
                  htmlFor="ximen-folder-label"
                  className="block text-xs font-medium text-stone-700"
                >
                  指定分類資料夾名稱（選填）
                </label>
                <input
                  id="ximen-folder-label"
                  type="text"
                  value={folderLabelInput}
                  onChange={(e) => setFolderLabelInput(e.target.value)}
                  maxLength={80}
                  placeholder="例如：401電影街素材、背景圖集"
                  className="w-full h-10 px-3 text-xs sm:text-sm bg-[#FBF9F5] border border-stone-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1E3A8A] focus:bg-white"
                />
              </div>

              <div className="md:col-span-3 space-y-1">
                <label
                  htmlFor="ximen-asset-name"
                  className="block text-xs font-medium text-stone-700"
                >
                  單張圖片顯示名稱（選填）
                </label>
                <input
                  id="ximen-asset-name"
                  type="text"
                  value={customAssetName}
                  onChange={(e) => setCustomAssetName(e.target.value)}
                  maxLength={120}
                  placeholder="留白則自動使用檔名"
                  className="w-full h-10 px-3 text-xs sm:text-sm bg-[#FBF9F5] border border-stone-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1E3A8A] focus:bg-white"
                />
              </div>

              <div className="md:col-span-5 flex flex-wrap items-center gap-2">
                <label
                  className={`flex-1 min-w-[140px] h-10 px-3.5 rounded-lg text-xs font-semibold inline-flex items-center justify-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap ${
                    uploadProgress || !hasAccessToken
                      ? 'bg-stone-200 text-stone-500 cursor-not-allowed'
                      : 'bg-[#1E3A8A] hover:bg-[#172554] text-white'
                  }`}
                >
                  <ImagePlus className="w-4 h-4 shrink-0" />
                  <span>上傳圖片（可多選）</span>
                  <input
                    ref={singleOrMultiFileInputRef}
                    type="file"
                    accept="image/*"
                    multiple
                    disabled={Boolean(uploadProgress) || !hasAccessToken}
                    onChange={(e) => handleUploadFiles(e.target.files, false)}
                    className="hidden"
                  />
                </label>

                <label
                  className={`flex-1 min-w-[140px] h-10 px-3.5 rounded-lg text-xs font-semibold inline-flex items-center justify-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap border ${
                    uploadProgress || !hasAccessToken
                      ? 'bg-stone-100 text-stone-400 border-stone-200 cursor-not-allowed'
                      : 'bg-[#F7F4EE] hover:bg-stone-200/70 text-stone-900 border-stone-300'
                  }`}
                >
                  <FolderUp className="w-4 h-4 shrink-0 text-[#1E3A8A]" />
                  <span>上傳整個資料夾</span>
                  <input
                    ref={folderInputRef}
                    type="file"
                    accept="image/*"
                    multiple
                    disabled={Boolean(uploadProgress) || !hasAccessToken}
                    onChange={(e) => handleUploadFiles(e.target.files, true)}
                    className="hidden"
                  />
                </label>
              </div>
            </div>

            {uploadProgress && (
              <div className="bg-[#F7F4EE] border border-stone-200 rounded-lg p-3 space-y-2">
                <div className="flex items-center justify-between text-xs font-medium text-stone-800">
                  <span className="truncate">
                    正在上傳：{uploadProgress.currentFileName}
                  </span>
                  <span className="font-mono-tabular shrink-0 ml-2">
                    {uploadProgress.current} / {uploadProgress.total}
                  </span>
                </div>
                <div className="w-full h-2 bg-stone-200 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-[#1E3A8A] transition-all duration-300"
                    style={{
                      width: `${Math.round(
                        (uploadProgress.current / uploadProgress.total) * 100,
                      )}%`,
                    }}
                  />
                </div>
              </div>
            )}
          </section>
        )}

        {/* Folder Filter & Search Toolbar */}
        <section className="space-y-3">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-1.5">
              <button
                type="button"
                onClick={() => setActiveFolder('ALL')}
                className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors whitespace-nowrap ${
                  activeFolder === 'ALL'
                    ? 'bg-[#1E3A8A] text-white border-[#1E3A8A]'
                    : 'bg-white text-stone-700 border-stone-200 hover:border-stone-300'
                }`}
              >
                全部圖庫 ({folderSummaries.total + OFFICIAL_XIMEN_ASSETS.length})
              </button>

              {folderSummaries.folders.map(([folder, count]) => (
                <button
                  key={folder}
                  type="button"
                  onClick={() => setActiveFolder(folder)}
                  className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors inline-flex items-center gap-1.5 whitespace-nowrap ${
                    activeFolder === folder
                      ? 'bg-[#1E3A8A] text-white border-[#1E3A8A]'
                      : 'bg-white text-stone-700 border-stone-200 hover:border-stone-300'
                  }`}
                >
                  <FolderOpen className="w-3.5 h-3.5" />
                  <span>
                    {folder} ({count})
                  </span>
                </button>
              ))}

              {folderSummaries.uncategorizedCount > 0 && (
                <button
                  type="button"
                  onClick={() => setActiveFolder('UNCATEGORIZED')}
                  className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors whitespace-nowrap ${
                    activeFolder === 'UNCATEGORIZED'
                      ? 'bg-[#1E3A8A] text-white border-[#1E3A8A]'
                      : 'bg-white text-stone-700 border-stone-200 hover:border-stone-300'
                  }`}
                >
                  未分類圖片 ({folderSummaries.uncategorizedCount})
                </button>
              )}

              <button
                type="button"
                onClick={() => setActiveFolder('OFFICIAL')}
                className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors whitespace-nowrap ${
                  activeFolder === 'OFFICIAL'
                    ? 'bg-[#1E3A8A] text-white border-[#1E3A8A]'
                    : 'bg-white text-stone-700 border-stone-200 hover:border-stone-300'
                }`}
              >
                官方標準元件 ({OFFICIAL_XIMEN_ASSETS.length})
              </button>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <input
                type="search"
                value={searchKeyword}
                onChange={(e) => setSearchKeyword(e.target.value)}
                placeholder="篩選圖片或資料夾名稱..."
                className="h-9 px-3 text-xs bg-white border border-stone-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1E3A8A] w-full sm:w-56"
              />
            </div>
          </div>

          {/* Bulk Folder Delete Bar (Teacher only, when viewing a specific folder) */}
          {isTeacher &&
            activeFolder !== 'ALL' &&
            activeFolder !== 'UNCATEGORIZED' &&
            activeFolder !== 'OFFICIAL' &&
            filteredUploadedItems.length > 0 && (
              <div className="bg-white border border-stone-200 rounded-xl px-4 py-2.5 flex flex-wrap items-center justify-between gap-3">
                <div className="text-xs text-stone-700 flex items-center gap-2">
                  <FolderOpen className="w-4 h-4 text-[#1E3A8A]" />
                  <span>
                    資料夾「<strong>{activeFolder}</strong>」共{' '}
                    {filteredUploadedItems.length} 張圖片
                  </span>
                </div>
                {confirmDeleteFolder === activeFolder ? (
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-medium text-red-700">
                      確定要刪除此資料夾內全部圖片嗎？
                    </span>
                    <button
                      type="button"
                      disabled={isDeletingFolder}
                      onClick={() => handleDeleteFolder(activeFolder)}
                      className="px-3 py-1 text-xs font-semibold text-white bg-red-600 hover:bg-red-700 rounded-md disabled:opacity-60"
                    >
                      {isDeletingFolder ? '刪除中...' : '確認刪除整個資料夾'}
                    </button>
                    <button
                      type="button"
                      disabled={isDeletingFolder}
                      onClick={() => setConfirmDeleteFolder(null)}
                      className="px-2.5 py-1 text-xs font-medium text-stone-600 bg-stone-100 hover:bg-stone-200 rounded-md"
                    >
                      取消
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setConfirmDeleteFolder(activeFolder)}
                    className="px-3 py-1 text-xs font-medium text-red-700 bg-red-50 hover:bg-red-100 border border-red-200 rounded-lg inline-flex items-center gap-1"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>刪除整個資料夾</span>
                  </button>
                )}
              </div>
            )}
        </section>

        {/* Uploaded Teacher Gallery Grid */}
        {activeFolder !== 'OFFICIAL' && (
          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="font-editorial text-base font-bold text-stone-950">
                教師上傳圖庫素材（{filteredUploadedItems.length} 張）
              </h4>
              {isLoadingItems && (
                <span className="text-xs text-stone-500">載入圖庫中...</span>
              )}
            </div>

            {filteredUploadedItems.length === 0 ? (
              <div className="bg-white border border-stone-200 rounded-xl p-8 text-center space-y-2">
                <p className="text-sm font-medium text-stone-700">
                  {galleryItems.length === 0
                    ? '目前尚未有教師上傳的專案圖片。'
                    : '找不到符合條件的上傳圖片。'}
                </p>
                {isTeacher && galleryItems.length === 0 && (
                  <p className="text-xs text-stone-500">
                    請使用上方「上傳圖片」或「上傳整個資料夾」按鈕新增百年西門教學圖庫素材。
                  </p>
                )}
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                {filteredUploadedItems.map((item) => {
                  const isConfirming = confirmDeleteItemId === item.id;
                  const isDeleting = deletingItemId === item.id;

                  return (
                    <div
                      key={item.id}
                      className="bg-white rounded-xl border border-stone-200 overflow-hidden flex flex-col justify-between hover:border-stone-300 transition-colors"
                    >
                      <div className="h-44 p-3 flex items-center justify-center bg-[radial-gradient(#cbd5e1_1px,transparent_1px)] [background-size:14px_14px] bg-stone-50 border-b border-stone-100 relative">
                        <img
                          src={item.imageUrl}
                          alt={item.name}
                          referrerPolicy="no-referrer"
                          className="max-h-full max-w-full object-contain rounded"
                        />
                        {item.folderName && (
                          <span className="absolute top-2 left-2 max-w-[85%] truncate px-2 py-0.5 text-[11px] font-medium bg-white/95 text-stone-700 border border-stone-200 rounded-md">
                            {item.folderName}
                          </span>
                        )}
                      </div>

                      <div className="p-3.5 space-y-2.5">
                        <div className="min-w-0">
                          <h5
                            className="font-semibold text-stone-900 text-sm truncate"
                            title={item.name}
                          >
                            {item.name}
                          </h5>
                          <div className="flex items-center justify-between gap-2 text-[11px] text-stone-500 mt-0.5">
                            <span className="truncate">{item.fileName}</span>
                            <span className="font-mono-tabular shrink-0">
                              {formatBytes(item.sizeBytes)}
                            </span>
                          </div>
                        </div>

                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            disabled={downloadingId === item.id}
                            onClick={() => handleDownloadItem(item)}
                            className="flex-1 min-h-[36px] bg-[#1E3A8A] hover:bg-[#172554] disabled:opacity-60 text-white text-xs font-semibold py-1.5 px-2.5 rounded-lg inline-flex items-center justify-center gap-1 transition-colors"
                          >
                            <Download className="w-3.5 h-3.5" />
                            <span>
                              {downloadingId === item.id ? '下載中...' : '下載'}
                            </span>
                          </button>

                          <button
                            type="button"
                            onClick={() =>
                              onApplyMapBackground(item.imageUrl, item.name)
                            }
                            title="套用至互動商圈地圖底圖預覽"
                            className="min-h-[36px] px-2.5 py-1.5 text-xs font-medium text-stone-700 bg-[#F7F4EE] hover:bg-stone-200/70 border border-stone-200 rounded-lg inline-flex items-center gap-1 transition-colors whitespace-nowrap"
                          >
                            <MapIcon className="w-3.5 h-3.5 text-[#1E3A8A]" />
                            <span>設為底圖</span>
                          </button>
                        </div>

                        {isTeacher && (
                          <div className="pt-2 border-t border-stone-100">
                            {isConfirming ? (
                              <div className="flex items-center justify-between gap-1.5 text-xs">
                                <span className="text-red-700 font-medium">
                                  確定刪除？
                                </span>
                                <div className="flex items-center gap-1.5">
                                  <button
                                    type="button"
                                    disabled={isDeleting}
                                    onClick={() => handleDeleteItem(item)}
                                    className="px-2.5 py-1 text-xs font-semibold text-white bg-red-600 hover:bg-red-700 rounded-md disabled:opacity-60"
                                  >
                                    {isDeleting ? '刪除中' : '確認'}
                                  </button>
                                  <button
                                    type="button"
                                    disabled={isDeleting}
                                    onClick={() => setConfirmDeleteItemId(null)}
                                    className="px-2 py-1 text-xs font-medium text-stone-600 bg-stone-100 hover:bg-stone-200 rounded-md"
                                  >
                                    取消
                                  </button>
                                </div>
                              </div>
                            ) : (
                              <button
                                type="button"
                                onClick={() => setConfirmDeleteItemId(item.id)}
                                className="w-full py-1.5 text-xs font-medium text-red-700 hover:bg-red-50 rounded-lg inline-flex items-center justify-center gap-1 transition-colors"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                                <span>刪除圖片</span>
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        )}

        {/* Official 12 Standard Scratch Components */}
        {filteredOfficialAssets.length > 0 && (
          <section className="space-y-3 pt-2">
            <h4 className="font-editorial text-base font-bold text-stone-950">
              官方標準舞台與按鈕圖庫（{filteredOfficialAssets.length} 項標準元件）
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
              {filteredOfficialAssets.map((asset) => (
                <OfficialAssetCard
                  key={asset.id}
                  asset={asset}
                  onDownloaded={(msg) => setStatusMessage(msg)}
                />
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  );
};
