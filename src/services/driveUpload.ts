/**
 * Google Drive 圖檔上傳與公開連結管理服務
 *
 * 需配合 OAuth Scope: https://www.googleapis.com/auth/drive.file
 * 遵循最小權限原則：自動在 Google Drive 建立專屬「PesMath_Journal_Assets」資料夾，
 * 並將所有文章圖檔集中存放於該資料夾中，保持雲端硬碟整潔。
 */

export interface DriveUploadResult {
  fileId: string;
  name: string;
  directImageUrl: string;
  downloadUrl: string;
  webViewLink: string;
}

// 記憶體快取已建立的專屬資料夾 ID，避免重複查詢
let cachedFolderId: string | null = null;
const cachedSubfolderIds = new Map<string, string>();

async function getOrCreateFolder(
  folderName: string,
  accessToken: string,
  parentId?: string,
  description?: string,
): Promise<string> {
  const cacheKey = `${parentId || 'root'}::${folderName}`;
  const existing = cachedSubfolderIds.get(cacheKey);
  if (existing) return existing;

  const escapedName = folderName.replace(/'/g, "\\'");
  const parentClause = parentId ? ` and '${parentId}' in parents` : '';

  try {
    const searchRes = await fetch(
      `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(
        `name = '${escapedName}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false${parentClause}`,
      )}&fields=files(id,name)`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      },
    );

    if (searchRes.ok) {
      const searchData = await searchRes.json();
      if (searchData.files && searchData.files.length > 0) {
        const foundId = searchData.files[0].id as string;
        cachedSubfolderIds.set(cacheKey, foundId);
        return foundId;
      }
    }

    const createPayload: Record<string, unknown> = {
      name: folderName,
      mimeType: 'application/vnd.google-apps.folder',
      description:
        description || 'PesMath 數學教學社群期刊系統專屬圖檔與附件資料夾',
    };
    if (parentId) {
      createPayload.parents = [parentId];
    }

    const createRes = await fetch('https://www.googleapis.com/drive/v3/files', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(createPayload),
    });

    if (createRes.ok) {
      const folderData = await createRes.json();
      const createdId = folderData.id as string;
      cachedSubfolderIds.set(cacheKey, createdId);
      return createdId;
    }
  } catch (err) {
    console.warn(`Could not auto-create Drive folder "${folderName}":`, err);
  }

  return '';
}

async function getOrCreatePesMathFolder(accessToken: string): Promise<string> {
  if (cachedFolderId) return cachedFolderId;
  const folderId = await getOrCreateFolder(
    'PesMath_Journal_Assets',
    accessToken,
  );
  if (folderId) {
    cachedFolderId = folderId;
  }
  return folderId;
}

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function inferUploadMimeType(file: File): string {
  if (file.type && file.type.trim()) return file.type;
  const lower = file.name.toLowerCase();
  if (lower.endsWith('.pdf')) return 'application/pdf';
  if (lower.endsWith('.epub')) return 'application/epub+zip';
  if (lower.endsWith('.md') || lower.endsWith('.markdown')) {
    return 'text/markdown; charset=utf-8';
  }
  if (lower.endsWith('.html') || lower.endsWith('.htm')) {
    return 'text/html; charset=utf-8';
  }
  if (lower.endsWith('.txt')) return 'text/plain; charset=utf-8';
  if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg';
  if (lower.endsWith('.webp')) return 'image/webp';
  if (lower.endsWith('.svg')) return 'image/svg+xml';
  if (lower.endsWith('.png')) return 'image/png';
  return 'application/octet-stream';
}

async function uploadResumableToFolder(
  file: File,
  accessToken: string,
  metadata: Record<string, unknown>,
): Promise<{id: string; name?: string; webViewLink?: string}> {
  const mimeType = inferUploadMimeType(file);
  const initRes = await fetch(
    'https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&fields=id,name,webViewLink',
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json; charset=UTF-8',
        'X-Upload-Content-Type': mimeType,
        'X-Upload-Content-Length': String(file.size || 0),
      },
      body: JSON.stringify(metadata),
    },
  );

  if (!initRes.ok) {
    const errorJson = await initRes.json().catch(() => ({}));
    throw new Error(
      errorJson?.error?.message ||
        `Google Drive 建立上傳工作階段失敗 (HTTP ${initRes.status})。`,
    );
  }

  const uploadUrl = initRes.headers.get('Location');
  if (!uploadUrl) {
    throw new Error('Google Drive 未回傳 Resumable Upload 上傳位置。');
  }

  const putRes = await fetch(uploadUrl, {
    method: 'PUT',
    headers: {
      'Content-Type': mimeType,
    },
    body: file,
  });

  if (!putRes.ok) {
    const errorJson = await putRes.json().catch(() => ({}));
    throw new Error(
      errorJson?.error?.message ||
        `Google Drive Resumable 上傳失敗 (HTTP ${putRes.status})。`,
    );
  }

  return putRes.json();
}

async function uploadMultipartToFolder(
  file: File,
  accessToken: string,
  folderId: string,
  filePrefix: string,
  description: string,
): Promise<DriveUploadResult> {
  const safeBaseName = file.name.replace(/[^\w.\-\u4e00-\u9fff]/g, '_');
  const cleanName = `${filePrefix}_${Date.now()}_${safeBaseName}`;
  const mimeType = inferUploadMimeType(file);
  const metadata: Record<string, unknown> = {
    name: cleanName,
    mimeType,
    description,
  };

  if (folderId) {
    metadata.parents = [folderId];
  }

  const attemptUploadOnce = async (): Promise<{
    id: string;
    name?: string;
    webViewLink?: string;
  }> => {
    // Files > 3.5MB use resumable upload (multipart API hard-caps at 5MB)
    if (file.size > 3.5 * 1024 * 1024) {
      return uploadResumableToFolder(file, accessToken, metadata);
    }

    const boundary = `-------PesMathDriveBoundary${Date.now().toString(36)}`;
    const delimiter = `\r\n--${boundary}\r\n`;
    const closeDelimiter = `\r\n--${boundary}--`;

    const metadataPart =
      delimiter +
      'Content-Type: application/json; charset=UTF-8\r\n\r\n' +
      JSON.stringify(metadata) +
      '\r\n';

    const fileHeader =
      `--${boundary}\r\n` +
      `Content-Type: ${mimeType}\r\n\r\n`;

    const multipartBlob = new Blob(
      [metadataPart, fileHeader, file, closeDelimiter],
      {type: `multipart/related; boundary=${boundary}`},
    );

    const uploadRes = await fetch(
      'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,webViewLink',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
        body: multipartBlob,
      },
    );

    if (!uploadRes.ok) {
      const errorJson = await uploadRes.json().catch(() => ({}));
      const status = uploadRes.status;
      if (status === 413 || status === 400) {
        return uploadResumableToFolder(file, accessToken, metadata);
      }
      throw new Error(
        errorJson?.error?.message ||
          `Google Drive 上傳失敗 (HTTP ${status})。請確認已同意 Google Drive 存取權限。`,
      );
    }

    return uploadRes.json();
  };

  let fileData: {id: string; name?: string; webViewLink?: string} | null = null;
  let lastError: unknown = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      fileData = await attemptUploadOnce();
      break;
    } catch (err) {
      lastError = err;
      const msg = err instanceof Error ? err.message : '';
      const isTransient =
        msg.includes('429') ||
        msg.includes('500') ||
        msg.includes('502') ||
        msg.includes('503') ||
        msg.toLowerCase().includes('rate') ||
        msg.toLowerCase().includes('network') ||
        msg.toLowerCase().includes('failed to fetch');
      if (!isTransient || attempt === 2) {
        throw err;
      }
      await sleep(700 * (attempt + 1));
    }
  }

  if (!fileData?.id) {
    throw lastError instanceof Error
      ? lastError
      : new Error('Google Drive 未回傳檔案編號。');
  }

  const fileId = fileData.id;

  try {
    const permRes = await fetch(
      `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}/permissions`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          role: 'reader',
          type: 'anyone',
        }),
      },
    );
    if (!permRes.ok) {
      console.warn(
        'Could not set public permission on drive file',
        await permRes.text(),
      );
    }
  } catch (err) {
    console.warn('Failed to set public reader permission:', err);
  }

  const directImageUrl = `https://lh3.googleusercontent.com/d/${fileId}`;
  const downloadUrl = `https://drive.google.com/uc?export=download&id=${fileId}`;
  const webViewLink =
    fileData.webViewLink || `https://drive.google.com/file/d/${fileId}/view`;

  return {
    fileId,
    name: fileData.name || cleanName,
    directImageUrl,
    downloadUrl,
    webViewLink,
  };
}

/**
 * 將圖片檔案上傳至登入教師的 Google 雲端硬碟指定資料夾 (PesMath_Journal_Assets)，並設為公開檢視
 */
export async function uploadImageToGoogleDrive(
  file: File,
  accessToken: string,
): Promise<DriveUploadResult> {
  if (!accessToken) {
    throw new Error('未取得 Google 授權憑證，請先登入 Google 帳號。');
  }
  const folderId = await getOrCreatePesMathFolder(accessToken);
  return uploadMultipartToFolder(
    file,
    accessToken,
    folderId,
    'pesmath',
    '由 PesMath 教學期刊發布系統上傳之文章圖檔',
  );
}

/**
 * 將百年西門 Scratch 圖庫中心圖片上傳至 PesMath_Journal_Assets/XimenScratchGallery/{folderName}
 */
export async function uploadGalleryImageToDrive(
  file: File,
  accessToken: string,
  folderName?: string,
): Promise<DriveUploadResult> {
  if (!accessToken) {
    throw new Error('未取得教師 Google Drive 授權憑證，請重新以教師帳號登入。');
  }

  const rootFolderId = await getOrCreatePesMathFolder(accessToken);
  let targetFolderId = rootFolderId;

  if (rootFolderId) {
    const galleryRootId = await getOrCreateFolder(
      'XimenScratchGallery',
      accessToken,
      rootFolderId,
      '百年西門 Scratch 舞台秀互動學習網圖庫中心素材',
    );
    if (galleryRootId) {
      targetFolderId = galleryRootId;
      const cleanedSubfolder = (folderName ?? '')
        .trim()
        .replace(/[<>:"|?*]/g, '_')
        .slice(0, 80);
      if (cleanedSubfolder) {
        const subId = await getOrCreateFolder(
          cleanedSubfolder,
          accessToken,
          galleryRootId,
          `百年西門圖庫資料夾：${cleanedSubfolder}`,
        );
        if (subId) {
          targetFolderId = subId;
        }
      }
    }
  }

  return uploadMultipartToFolder(
    file,
    accessToken,
    targetFolderId,
    'ximen',
    '由百年西門 Scratch 舞台秀互動學習網圖庫中心上傳之教學素材',
  );
}

/**
 * 將大型 PDF、電子書（EPUB/MD）或教案檔案上傳至 Google Drive
 * 存放路徑：PesMath_Journal_Assets/TeachingResources/{categoryFolder}，並設為任何知道連結者皆可檢視
 */
export async function uploadTeachingResourceFileToDrive(
  file: File,
  accessToken: string,
  categoryFolder?: string,
): Promise<DriveUploadResult> {
  if (!accessToken) {
    throw new Error('未取得 Google Drive 授權憑證，請先完成 Google 帳號授權。');
  }

  const rootFolderId = await getOrCreatePesMathFolder(accessToken);
  let targetFolderId = rootFolderId;

  if (rootFolderId) {
    const resourcesRootId = await getOrCreateFolder(
      'TeachingResources',
      accessToken,
      rootFolderId,
      'PesMath 國小數學教學資源平台 PDF / 電子書 / 教案檔案庫',
    );
    if (resourcesRootId) {
      targetFolderId = resourcesRootId;
      const cleanedSubfolder = (categoryFolder ?? '')
        .trim()
        .replace(/[<>:"/\\|?*]/g, '_')
        .slice(0, 80);
      if (cleanedSubfolder) {
        const subId = await getOrCreateFolder(
          cleanedSubfolder,
          accessToken,
          resourcesRootId,
          `教學資源分類資料夾：${cleanedSubfolder}`,
        );
        if (subId) {
          targetFolderId = subId;
        }
      }
    }
  }

  return uploadMultipartToFolder(
    file,
    accessToken,
    targetFolderId,
    'resource',
    '由 PesMath 國小數學教學資源平台上傳之教學 PDF / 電子書檔案',
  );
}

/**
 * 刪除教師先前透過本系統上傳至 Google Drive 的圖檔（最佳化清理，若權限不足或已刪除不阻斷 Firestore 移除）
 */
export async function deleteDriveFile(
  fileId: string,
  accessToken: string | null,
): Promise<boolean> {
  if (!fileId || !accessToken) return false;
  try {
    const res = await fetch(
      `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}`,
      {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      },
    );
    return res.ok || res.status === 404;
  } catch {
    return false;
  }
}
