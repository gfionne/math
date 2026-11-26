import {
  doc,
  getDocFromServer,
  onSnapshot,
  serverTimestamp,
  setDoc,
  Unsubscribe,
} from 'firebase/firestore';
import {auth, db} from './googleAuth';
import {SiteSettings} from '../types/journal';

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function isFirestoreQuotaError(error: unknown): boolean {
  const msg = error instanceof Error ? error.message : String(error ?? '');
  const lower = msg.toLowerCase();
  return (
    lower.includes('quota exceeded') ||
    lower.includes('quota limit exceeded') ||
    lower.includes('resource-exhausted') ||
    lower.includes('free daily read units')
  );
}

export function handleFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null,
): never {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo:
        auth.currentUser?.providerData?.map((provider) => ({
          providerId: provider.providerId,
          email: provider.email,
        })) || [],
    },
    operationType,
    path,
  };
  if (isFirestoreQuotaError(error)) {
    console.warn('Firestore Quota Notice: ', JSON.stringify(errInfo));
  } else {
    console.error('Firestore Error: ', JSON.stringify(errInfo));
  }
  throw new Error(JSON.stringify(errInfo));
}

export interface SharedCloudSiteConfig extends SiteSettings {
  spreadsheetId: string;
  tabName: string;
  hiddenOfficialAssetIds?: string[];
  lockedCategories?: string[];
  lockedNavOptions?: string[];
}

const SITE_CONFIG_COLLECTION = 'siteConfig';
const SITE_CONFIG_DOC_ID = 'main';
const SITE_CONFIG_PATH = `${SITE_CONFIG_COLLECTION}/${SITE_CONFIG_DOC_ID}`;
const SITE_CONFIG_CACHE_KEY = 'pesmath_shared_site_config_cache_v1';

function readCachedSharedSiteConfig(): SharedCloudSiteConfig | null {
  try {
    const raw = localStorage.getItem(SITE_CONFIG_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object') {
      return parsed as SharedCloudSiteConfig;
    }
  } catch {
    // ignore storage errors
  }
  return null;
}

function writeCachedSharedSiteConfig(config: SharedCloudSiteConfig): void {
  try {
    localStorage.setItem(SITE_CONFIG_CACHE_KEY, JSON.stringify(config));
  } catch {
    // ignore storage errors
  }
}

function isTransientOfflineError(error: unknown): boolean {
  const msg = error instanceof Error ? error.message.toLowerCase() : String(error ?? '').toLowerCase();
  return msg.includes('the client is offline') || msg.includes('unavailable');
}

async function testConnection() {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    if (typeof window !== 'undefined') {
      window.addEventListener(
        'online',
        () => {
          void testConnection();
        },
        {once: true},
      );
    }
    return;
  }
  const probe = async () => {
    await getDocFromServer(doc(db, 'test', 'connection'));
  };
  try {
    await probe();
  } catch (error) {
    if (isTransientOfflineError(error)) {
      await new Promise((resolve) => setTimeout(resolve, 2000));
      try {
        await probe();
      } catch (retryError) {
        if (isTransientOfflineError(retryError)) {
          console.warn(
            'Firestore temporarily unreachable (offline/network timeout); retrying automatically when network stabilizes.',
          );
        }
      }
    }
  }
}
if (typeof window !== 'undefined') {
  window.setTimeout(() => {
    void testConnection();
  }, 500);
} else {
  void testConnection();
}

/**
 * Subscribes in real time to shared site configuration (spreadsheetId, tabName, siteTitle, etc.)
 * so updates made in either AI Studio or GitHub Pages immediately reflect across both environments.
 */
export function subscribeSharedSiteConfig(
  onUpdate: (config: SharedCloudSiteConfig | null) => void,
  onError?: (err: Error) => void,
): Unsubscribe {
  const cached = readCachedSharedSiteConfig();
  if (cached) {
    onUpdate(cached);
  }

  const ref = doc(db, SITE_CONFIG_COLLECTION, SITE_CONFIG_DOC_ID);
  return onSnapshot(
    ref,
    (snap) => {
      if (!snap.exists()) {
        onUpdate(null);
        return;
      }
      const d = snap.data();
      const hiddenIds = Array.isArray(d.hiddenOfficialAssetIds)
        ? d.hiddenOfficialAssetIds
            .filter((id): id is string => typeof id === 'string')
            .map((id) => id.trim().slice(0, 64))
            .filter(Boolean)
            .slice(0, 50)
        : undefined;

      const lockedCats = Array.isArray(d.lockedCategories)
        ? d.lockedCategories
            .filter((c): c is string => typeof c === 'string')
            .map((c) => c.trim().slice(0, 60))
            .filter(Boolean)
            .slice(0, 20)
        : undefined;

      const lockedNavs = Array.isArray(d.lockedNavOptions)
        ? d.lockedNavOptions
            .filter((n): n is string => typeof n === 'string')
            .map((n) => n.trim().slice(0, 40))
            .filter(Boolean)
            .slice(0, 10)
        : undefined;

      const nextConfig: SharedCloudSiteConfig = {
        spreadsheetId: String(d.spreadsheetId ?? ''),
        tabName: String(d.tabName ?? 'Posts') || 'Posts',
        siteTitle: String(d.siteTitle ?? 'PesMath 數學知識庫'),
        siteSubtitle: String(d.siteSubtitle ?? ''),
        heroHeading: String(d.heroHeading ?? ''),
        heroDescription: String(d.heroDescription ?? ''),
        autoDynamicTitle: Boolean(d.autoDynamicTitle ?? true),
        autoTitleFromSheet: Boolean(d.autoTitleFromSheet ?? true),
        ...(hiddenIds !== undefined ? {hiddenOfficialAssetIds: hiddenIds} : {}),
        ...(lockedCats !== undefined ? {lockedCategories: lockedCats} : {}),
        ...(lockedNavs !== undefined ? {lockedNavOptions: lockedNavs} : {}),
      };
      writeCachedSharedSiteConfig(nextConfig);
      onUpdate(nextConfig);
    },
    (error) => {
      try {
        handleFirestoreError(error, OperationType.GET, SITE_CONFIG_PATH);
      } catch (wrapped) {
        onError?.(wrapped as Error);
      }
    },
  );
}

/**
 * Persists shared site configuration to Firestore with strict payload boundary validation
 * matching firebase-blueprint.json and firestore.rules.
 */
export async function saveSharedSiteConfig(
  config: SharedCloudSiteConfig,
): Promise<void> {
  const uid = auth.currentUser?.uid;
  if (!uid) {
    throw new Error('請先完成 Google 登入授權，才能同步設定至雲端資料庫。');
  }

  const sanitizedHiddenIds = Array.isArray(config.hiddenOfficialAssetIds)
    ? Array.from(
        new Set(
          config.hiddenOfficialAssetIds
            .map((id) => String(id).trim().slice(0, 64))
            .filter(Boolean),
        ),
      ).slice(0, 50)
    : undefined;

  const sanitizedLockedCategories = Array.isArray(config.lockedCategories)
    ? Array.from(
        new Set(
          config.lockedCategories
            .map((c) => String(c).trim().slice(0, 60))
            .filter(Boolean),
        ),
      ).slice(0, 20)
    : undefined;

  const sanitizedLockedNavOptions = Array.isArray(config.lockedNavOptions)
    ? Array.from(
        new Set(
          config.lockedNavOptions
            .map((n) => String(n).trim().slice(0, 40))
            .filter(Boolean),
        ),
      ).slice(0, 10)
    : undefined;

  const payload: Record<string, unknown> = {
    spreadsheetId: config.spreadsheetId.trim().slice(0, 200),
    tabName: (config.tabName.trim() || 'Posts').slice(0, 100),
    siteTitle: (config.siteTitle.trim() || 'PesMath 數學知識庫').slice(0, 120),
    siteSubtitle: config.siteSubtitle.trim().slice(0, 200),
    heroHeading: config.heroHeading.trim().slice(0, 200),
    heroDescription: config.heroDescription.trim().slice(0, 1000),
    autoDynamicTitle: Boolean(config.autoDynamicTitle),
    autoTitleFromSheet: Boolean(config.autoTitleFromSheet),
    updatedAt: serverTimestamp(),
    updatedByUid: uid,
  };

  if (sanitizedHiddenIds !== undefined) {
    payload.hiddenOfficialAssetIds = sanitizedHiddenIds;
  }
  if (sanitizedLockedCategories !== undefined) {
    payload.lockedCategories = sanitizedLockedCategories;
  }
  if (sanitizedLockedNavOptions !== undefined) {
    payload.lockedNavOptions = sanitizedLockedNavOptions;
  }

  writeCachedSharedSiteConfig(config);

  const timeoutError = new Error(
    '雲端即時設定資料庫暫時無回應（可能已達今日免費讀取／寫入額度上限），設定已寫入 Google Sheet 與本機快取。',
  );

  let timerId: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      setDoc(doc(db, SITE_CONFIG_COLLECTION, SITE_CONFIG_DOC_ID), payload),
      new Promise<never>((_, reject) => {
        timerId = setTimeout(() => reject(timeoutError), 5000);
      }),
    ]);
  } catch (error) {
    if (error === timeoutError) {
      throw timeoutError;
    }
    handleFirestoreError(error, OperationType.WRITE, SITE_CONFIG_PATH);
  } finally {
    if (timerId !== undefined) {
      clearTimeout(timerId);
    }
  }
}
