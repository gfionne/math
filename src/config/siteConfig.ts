import siteConfig from '../../site-config.json';
import {SiteSettings} from '../types/journal';

export const DEFAULT_SITE_SETTINGS: SiteSettings = {
  siteTitle: 'PesMath 數學期刊',
  siteSubtitle: 'PesMath 數學教學社群 · 期刊與知識專欄',
  heroHeading: '數學教案、研究專欄與領域共備知識庫',
  heroDescription:
    '彙整歷學年度領域會議紀錄、趣味數學桌遊與繪本實作、學力檢測數據分析及雲端教案資源。支援純靜態 GitHub Pages 部署與 Google Sheets 即時動態存取。',
  autoDynamicTitle: true,
  autoTitleFromSheet: true,
};

const rawConfig = siteConfig as Partial<{
  spreadsheetId: string;
  tabName: string;
  siteTitle: string;
  siteSubtitle: string;
  heroHeading: string;
  heroDescription: string;
  autoDynamicTitle: boolean;
  autoTitleFromSheet: boolean;
}>;

/**
 * 全站預設 Google Sheet 資料庫與網站標題設定
 *
 * 存放在專案最外層的 /site-config.json
 * 開發時可由介面一鍵更新，部署時直接與程式碼推上 GitHub Pages！
 */
export const DEFAULT_PUBLIC_SHEET_ID: string =
  import.meta.env.VITE_DEFAULT_SHEET_ID || rawConfig.spreadsheetId || '';

export const DEFAULT_PUBLIC_SHEET_TAB: string | undefined =
  import.meta.env.VITE_DEFAULT_SHEET_TAB || rawConfig.tabName || 'Posts';

export const INITIAL_SITE_SETTINGS: SiteSettings = {
  siteTitle: rawConfig.siteTitle || DEFAULT_SITE_SETTINGS.siteTitle,
  siteSubtitle: rawConfig.siteSubtitle || DEFAULT_SITE_SETTINGS.siteSubtitle,
  heroHeading: rawConfig.heroHeading || DEFAULT_SITE_SETTINGS.heroHeading,
  heroDescription:
    rawConfig.heroDescription || DEFAULT_SITE_SETTINGS.heroDescription,
  autoDynamicTitle:
    rawConfig.autoDynamicTitle ?? DEFAULT_SITE_SETTINGS.autoDynamicTitle,
  autoTitleFromSheet:
    rawConfig.autoTitleFromSheet ?? DEFAULT_SITE_SETTINGS.autoTitleFromSheet,
};

export const BUNDLED_SITE_CONFIG = {
  spreadsheetId: rawConfig.spreadsheetId || '',
  tabName: rawConfig.tabName || 'Posts',
  ...INITIAL_SITE_SETTINGS,
};

export interface SaveSiteConfigPayload {
  spreadsheetId?: string;
  tabName?: string;
  siteTitle?: string;
  siteSubtitle?: string;
  heroHeading?: string;
  heroDescription?: string;
  autoDynamicTitle?: boolean;
  autoTitleFromSheet?: boolean;
}

/**
 * 儲存全站設定至專案根目錄的 site-config.json
 */
export async function saveSiteConfig(
  payload: SaveSiteConfigPayload,
): Promise<{success: boolean; message: string}> {
  const nextConfig = {
    spreadsheetId: (
      payload.spreadsheetId ?? BUNDLED_SITE_CONFIG.spreadsheetId
    ).trim(),
    tabName: (payload.tabName ?? BUNDLED_SITE_CONFIG.tabName).trim() || 'Posts',
    siteTitle: (payload.siteTitle ?? INITIAL_SITE_SETTINGS.siteTitle).trim() || DEFAULT_SITE_SETTINGS.siteTitle,
    siteSubtitle:
      (payload.siteSubtitle ?? INITIAL_SITE_SETTINGS.siteSubtitle).trim() ||
      DEFAULT_SITE_SETTINGS.siteSubtitle,
    heroHeading:
      (payload.heroHeading ?? INITIAL_SITE_SETTINGS.heroHeading).trim() ||
      DEFAULT_SITE_SETTINGS.heroHeading,
    heroDescription:
      (payload.heroDescription ?? INITIAL_SITE_SETTINGS.heroDescription).trim() ||
      DEFAULT_SITE_SETTINGS.heroDescription,
    autoDynamicTitle:
      payload.autoDynamicTitle ?? INITIAL_SITE_SETTINGS.autoDynamicTitle,
    autoTitleFromSheet:
      payload.autoTitleFromSheet ?? INITIAL_SITE_SETTINGS.autoTitleFromSheet,
  };

  try {
    const res = await fetch('/api/save-site-config', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify(nextConfig),
    });
    if (res.ok) {
      return {
        success: true,
        message:
          '已成功更新專案根目錄 site-config.json！網頁標題與設定已即時套用，Push to GitHub 後將自動同步上線。',
      };
    }
    const errData = await res.json().catch(() => ({}));
    throw new Error(errData.error || `HTTP ${res.status}`);
  } catch (_err) {
    const jsonStr = JSON.stringify(nextConfig, null, 2) + '\n';
    const blob = new Blob([jsonStr], {type: 'application/json'});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'site-config.json';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    return {
      success: true,
      message: '已為您下載 site-config.json，放入專案根目錄後推上 Git 即可生效！',
    };
  }
}
