/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {User} from 'firebase/auth';
import {
  ArrowUpRight,
  BookOpen,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  FileText,
  GalleryHorizontalEnd,
  Layers,
  LayoutGrid,
  List,
  MonitorPlay,
  RefreshCw,
  Search,
  Sheet,
} from 'lucide-react';
import {ArticleCard} from './components/ArticleCard';
import {ArticleReaderModal} from './components/ArticleReaderModal';
import {ConfirmActionModal} from './components/ConfirmActionModal';
import {
  InteractiveEmbedModal,
  XimenScratchTab,
} from './components/InteractiveEmbedModal';
import {DrawerTab, SheetsCmsDrawer} from './components/SheetsCmsDrawer';
import {TopicSwipeDeckModal} from './components/TopicSwipeDeckModal';
import {TopicSwipeFeed} from './components/TopicSwipeFeed';
import {updateDynamicFavicon} from './utils/dynamicFavicon';
import {
  formatCategoryDisplay,
  getCategoryAccent,
  groupPostsByTopic,
  parseCategories,
} from './utils/postFormatting';
import {
  DEFAULT_PUBLIC_SHEET_ID,
  DEFAULT_PUBLIC_SHEET_TAB,
  DEFAULT_SITE_SETTINGS,
  INITIAL_SITE_SETTINGS,
  saveSiteConfig,
} from './config/siteConfig';
import firebaseConfig from '../firebase-applet-config.json';
import {SEED_POSTS} from './data/seedPosts';
import {
  auth,
  getAccessToken,
  googleSignIn,
  initAuth,
  logout,
} from './services/googleAuth';
import {
  saveSharedSiteConfig,
  subscribeSharedSiteConfig,
} from './services/firestoreSync';
import {
  appendPostToSheet,
  batchAppendPostsToSheet,
  createAndSeedJournalSheet,
  deletePostFromSheet,
  fetchPostsFromPublicGviz,
  fetchPostsFromSheetsApi,
  fetchSiteSettingsFromPublicGviz,
  fetchSiteSettingsFromSheetsApi,
  fetchSpreadsheetMeta,
  saveSiteSettingsToSheet,
  updatePostInSheet,
} from './services/sheetsDb';
import {
  ConfirmActionState,
  DataSourceMode,
  JournalPost,
  SiteSettings,
  SpreadsheetMeta,
} from './types/journal';

const PUBLIC_SHEET_STORAGE_KEY = 'pesmath_public_sheet_id';

export default function App() {
  // Data & Source State
  const [posts, setPosts] = useState<JournalPost[]>(SEED_POSTS);
  const [dataSourceMode, setDataSourceMode] = useState<DataSourceMode>('seed');
  const [sheetMeta, setSheetMeta] = useState<SpreadsheetMeta | null>(null);
  const [publicSheetId, setPublicSheetId] = useState<string>('');
  const [publicTabName, setPublicTabName] = useState<string | undefined>(
    undefined,
  );
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [siteSettings, setSiteSettings] = useState<SiteSettings>(() => {
    try {
      localStorage.removeItem('pesmath_site_settings');
    } catch {
      // Ignore storage error
    }
    return INITIAL_SITE_SETTINGS;
  });
  const lastCloudSheetKeyRef = useRef<string>('');
  const lastFocusRefreshRef = useRef<number>(0);
  const categoryBarRef = useRef<HTMLDivElement | null>(null);

  // Auth State (Access token kept strictly in memory via googleAuth.ts)
  const [user, setUser] = useState<User | null>(null);
  const [hasAccessToken, setHasAccessToken] = useState(false);
  const [isSigningIn, setIsSigningIn] = useState(false);

  // Filter & View State
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedYear, setSelectedYear] = useState<string>('全部年度');
  const [selectedCategory, setSelectedCategory] = useState<string>('全部分類');
  const [viewMode, setViewMode] = useState<'swipe' | 'grid' | 'list'>('swipe');
  const [includeDrafts, setIncludeDrafts] = useState(false);

  // Modals & Drawers
  const [activePost, setActivePost] = useState<JournalPost | null>(null);
  const [spotlightImgFailed, setSpotlightImgFailed] = useState(false);
  const [immersiveSwipe, setImmersiveSwipe] = useState<{
    isOpen: boolean;
    topicIndex: number;
    cardIndex: number;
  }>({
    isOpen: false,
    topicIndex: 0,
    cardIndex: 0,
  });
  const [interactiveStage, setInteractiveStage] = useState<{
    isOpen: boolean;
    url: string;
    title: string;
    initialTab: XimenScratchTab;
  }>({
    isOpen: false,
    url: './ximen-scratch.html',
    title: '百年西門 Scratch 舞台秀互動學習網',
    initialTab: 'map',
  });
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [drawerInitialTab, setDrawerInitialTab] = useState<DrawerTab>('sheets');
  const [editingPost, setEditingPost] = useState<JournalPost | null>(null);
  const [confirmState, setConfirmState] = useState<ConfirmActionState | null>(
    null,
  );

  const openXimenStage = useCallback((tab: XimenScratchTab = 'map') => {
    setInteractiveStage({
      isOpen: true,
      url: './ximen-scratch.html',
      title: '百年西門 Scratch 舞台秀互動學習網',
      initialTab: tab,
    });
  }, []);

  // Initialize Firebase Auth listener
  useEffect(() => {
    const unsubscribe = initAuth(
      (authedUser, token) => {
        setUser(authedUser);
        setHasAccessToken(Boolean(token));
      },
      (maybeUser) => {
        setUser(maybeUser);
        setHasAccessToken(false);
      },
    );
    return () => unsubscribe();
  }, []);

  const applyRemoteSettingsIfEnabled = useCallback(
    (remote: Partial<SiteSettings> | null, fallbackSpreadsheetTitle?: string) => {
      setSiteSettings((prev) => {
        if (!prev.autoTitleFromSheet) return prev;
        if (remote) {
          return {...prev, ...remote};
        }
        if (
          fallbackSpreadsheetTitle &&
          fallbackSpreadsheetTitle !== 'PesMath 數學教學社群資料庫' &&
          prev.siteTitle === DEFAULT_SITE_SETTINGS.siteTitle
        ) {
          return {...prev, siteTitle: fallbackSpreadsheetTitle};
        }
        return prev;
      });
    },
    [],
  );

  // Load public Google Sheet from URL query parameter (?sheet=ID) or saved config
  const loadPublicSheet = useCallback(
    async (spreadsheetId: string, tabName?: string) => {
      if (!spreadsheetId) return;
      setIsSyncing(true);
      setSyncError(null);
      try {
        const [fetched, remoteSettings] = await Promise.all([
          fetchPostsFromPublicGviz(spreadsheetId, tabName),
          fetchSiteSettingsFromPublicGviz(spreadsheetId),
        ]);
        setPosts(fetched);
        setPublicSheetId(spreadsheetId);
        setPublicTabName(tabName);
        setSheetMeta(null);
        setDataSourceMode('sheets-public');
        localStorage.setItem(PUBLIC_SHEET_STORAGE_KEY, spreadsheetId);
        applyRemoteSettingsIfEnabled(remoteSettings);
      } catch (err: any) {
        setSyncError(err?.message || '讀取公開試算表失敗。');
      } finally {
        setIsSyncing(false);
      }
    },
    [applyRemoteSettingsIfEnabled],
  );

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const sheetParam = params.get('sheet');
    if (sheetParam) {
      loadPublicSheet(sheetParam);
    } else if (DEFAULT_PUBLIC_SHEET_ID) {
      loadPublicSheet(DEFAULT_PUBLIC_SHEET_ID, DEFAULT_PUBLIC_SHEET_TAB);
    } else {
      const savedSheetId = localStorage.getItem(PUBLIC_SHEET_STORAGE_KEY);
      if (
        savedSheetId &&
        savedSheetId !== '1TYrCzrvZgxwd9nxygksgpUOSJVRb1L3aXCxtDIo4_4E'
      ) {
        loadPublicSheet(savedSheetId);
      } else if (savedSheetId === '1TYrCzrvZgxwd9nxygksgpUOSJVRb1L3aXCxtDIo4_4E') {
        localStorage.removeItem(PUBLIC_SHEET_STORAGE_KEY);
      }
    }
  }, [loadPublicSheet]);

  // Real-time Firestore listener so edits on either AI Studio or GitHub Pages sync immediately
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const sheetParam = params.get('sheet');

    const unsubscribe = subscribeSharedSiteConfig(
      (cloudCfg) => {
        if (!cloudCfg) return;

        setSiteSettings({
          siteTitle: cloudCfg.siteTitle,
          siteSubtitle: cloudCfg.siteSubtitle,
          heroHeading: cloudCfg.heroHeading,
          heroDescription: cloudCfg.heroDescription,
          autoDynamicTitle: cloudCfg.autoDynamicTitle,
          autoTitleFromSheet: cloudCfg.autoTitleFromSheet,
        });

        if (!sheetParam && cloudCfg.spreadsheetId) {
          const nextKey = `${cloudCfg.spreadsheetId}|${cloudCfg.tabName}`;
          if (lastCloudSheetKeyRef.current !== nextKey) {
            lastCloudSheetKeyRef.current = nextKey;
            const token = getAccessToken();
            if (token) {
              void (async () => {
                try {
                  const meta = await fetchSpreadsheetMeta(
                    cloudCfg.spreadsheetId,
                    token,
                  );
                  const targetTab = cloudCfg.tabName || meta.activeTab;
                  const fetched = await fetchPostsFromSheetsApi(
                    meta.spreadsheetId,
                    targetTab,
                    token,
                  );
                  setSheetMeta({...meta, activeTab: targetTab});
                  setPosts(fetched);
                  setPublicSheetId(meta.spreadsheetId);
                  setDataSourceMode('sheets-api');
                  localStorage.setItem(
                    PUBLIC_SHEET_STORAGE_KEY,
                    meta.spreadsheetId,
                  );
                } catch {
                  await loadPublicSheet(
                    cloudCfg.spreadsheetId,
                    cloudCfg.tabName,
                  );
                }
              })();
            } else {
              void loadPublicSheet(cloudCfg.spreadsheetId, cloudCfg.tabName);
            }
          }
        }
      },
      (err) => {
        console.warn('Shared Firestore config listener notice:', err.message);
      },
    );

    return () => unsubscribe();
  }, [loadPublicSheet]);

  useEffect(() => {
    updateDynamicFavicon(posts.length, dataSourceMode);
  }, [posts.length, dataSourceMode]);

  // Automatically update browser <title> and meta tags based on active post, filters, and site settings
  useEffect(() => {
    const baseTitle = siteSettings.siteTitle.trim() || DEFAULT_SITE_SETTINGS.siteTitle;
    const baseSubtitle = siteSettings.siteSubtitle.trim();

    let nextTitle = baseTitle;
    let nextDesc = siteSettings.heroDescription.trim() || DEFAULT_SITE_SETTINGS.heroDescription;

    if (siteSettings.autoDynamicTitle) {
      if (activePost) {
        nextTitle = `${activePost.title} | ${baseTitle}`;
        if (activePost.summary) {
          nextDesc = activePost.summary;
        }
      } else if (searchQuery.trim()) {
        nextTitle = `搜尋「${searchQuery.trim()}」 | ${baseTitle}`;
      } else if (selectedYear !== '全部年度' || selectedCategory !== '全部分類') {
        const parts = [
          selectedYear !== '全部年度' ? selectedYear : '',
          selectedCategory !== '全部分類' ? selectedCategory : '',
        ].filter(Boolean);
        nextTitle = `${parts.join(' · ')} | ${baseTitle}`;
      } else if (baseSubtitle) {
        nextTitle = `${baseTitle} | ${baseSubtitle}`;
      }
    } else if (baseSubtitle) {
      nextTitle = `${baseTitle} | ${baseSubtitle}`;
    }

    document.title = nextTitle;

    const setMeta = (selector: string, content: string) => {
      const el = document.querySelector(selector);
      if (el) el.setAttribute('content', content);
    };
    setMeta('meta[property="og:title"]', nextTitle);
    setMeta('meta[name="description"]', nextDesc);
    setMeta('meta[property="og:description"]', nextDesc);
  }, [
    siteSettings,
    activePost,
    selectedCategory,
    selectedYear,
    searchQuery,
  ]);

  // Deep-link hash support (#post=slug)
  useEffect(() => {
    const hash = window.location.hash;
    if (hash.startsWith('#post=')) {
      const slug = decodeURIComponent(hash.slice('#post='.length));
      const found = posts.find((p) => p.slug === slug);
      if (found) setActivePost(found);
    }
  }, [posts]);

  // Derived filter options
  const availableYears = useMemo(() => {
    const set = new Set<string>();
    posts.forEach((p) => {
      if (p.academicYear) set.add(p.academicYear);
    });
    return ['全部年度', ...Array.from(set)];
  }, [posts]);

  const availableCategories = useMemo(() => {
    const set = new Set<string>();
    posts.forEach((p) => {
      parseCategories(p.category).forEach((cat) => set.add(cat));
    });
    return ['全部分類', ...Array.from(set)];
  }, [posts]);

  const filteredPosts = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return posts
      .filter((p) => {
        if (!includeDrafts && p.status === 'Draft') return false;
        if (selectedYear !== '全部年度' && p.academicYear !== selectedYear) {
          return false;
        }
        if (
          selectedCategory !== '全部分類' &&
          !parseCategories(p.category).includes(selectedCategory)
        ) {
          return false;
        }
        if (q) {
          const haystack = [
            p.title,
            p.summary,
            p.content,
            p.author,
            p.category,
            p.academicYear,
          ]
            .join(' ')
            .toLowerCase();
          return haystack.includes(q);
        }
        return true;
      })
      .sort((a, b) => {
        if (a.isFeatured !== b.isFeatured) return a.isFeatured ? -1 : 1;
        return b.publishedAt.localeCompare(a.publishedAt);
      });
  }, [posts, includeDrafts, selectedYear, selectedCategory, searchQuery]);

  const featuredSpotlightPost = useMemo(() => {
    return (
      posts.find((p) => p.status !== 'Draft' && p.isFeatured) ||
      posts.find((p) => p.status !== 'Draft') ||
      posts[0] ||
      null
    );
  }, [posts]);

  const embedCount = useMemo(
    () => posts.filter((p) => Boolean(p.embedUrl)).length,
    [posts],
  );

  const topicGroups = useMemo(
    () => groupPostsByTopic(filteredPosts, selectedCategory),
    [filteredPosts, selectedCategory],
  );

  const categoryCounts = useMemo(() => {
    const counts = new Map<string, number>();
    let total = 0;
    for (const p of posts) {
      if (!includeDrafts && p.status === 'Draft') continue;
      if (selectedYear !== '全部年度' && p.academicYear !== selectedYear) continue;
      total++;
      parseCategories(p.category).forEach((cat) => {
        counts.set(cat, (counts.get(cat) ?? 0) + 1);
      });
    }
    counts.set('全部分類', total);
    return counts;
  }, [posts, includeDrafts, selectedYear]);

  const yearCounts = useMemo(() => {
    const counts = new Map<string, number>();
    let total = 0;
    for (const p of posts) {
      if (!includeDrafts && p.status === 'Draft') continue;
      total++;
      if (p.academicYear) {
        counts.set(p.academicYear, (counts.get(p.academicYear) ?? 0) + 1);
      }
    }
    counts.set('全部年度', total);
    return counts;
  }, [posts, includeDrafts]);

  // Auth handlers
  const handleSignIn = async () => {
    setIsSigningIn(true);
    setSyncError(null);
    try {
      const result = await googleSignIn();
      if (result) {
        setUser(result.user);
        setHasAccessToken(true);
        const targetId = publicSheetId || DEFAULT_PUBLIC_SHEET_ID;
        if (targetId && dataSourceMode !== 'sheets-api') {
          try {
            const meta = await fetchSpreadsheetMeta(targetId, result.accessToken);
            const [fetched, remoteSettings] = await Promise.all([
              fetchPostsFromSheetsApi(
                meta.spreadsheetId,
                meta.activeTab,
                result.accessToken,
              ),
              fetchSiteSettingsFromSheetsApi(
                meta.spreadsheetId,
                meta.tabs,
                result.accessToken,
              ),
            ]);
            setSheetMeta(meta);
            setPosts(fetched);
            setPublicSheetId(meta.spreadsheetId);
            setDataSourceMode('sheets-api');
            applyRemoteSettingsIfEnabled(remoteSettings, meta.title);
          } catch {
            // Keep existing view if signed-in account lacks permission on the public sheet
          }
        }
      }
    } catch (err: any) {
      const rawMsg = err?.message || '';
      const code = err?.code || '';
      if (
        rawMsg.includes('access_denied') ||
        code === 'auth/popup-closed-by-user' ||
        code === 'auth/cancelled-popup-request'
      ) {
        setSyncError(
          `Google 登入未完成（${code || 'access_denied'}）。若看到「應用程式目前處於測試階段 / 錯誤 403：access_denied」，請至 Google Cloud Console（專案 ${firebaseConfig.projectId}）的 OAuth 同意畫面 → 目標對象（Audience）→ 測試人員（Test users）加入您的 Gmail 帳號後重試。`,
        );
      } else {
        setSyncError(rawMsg || 'Google 登入授權失敗，請再試一次。');
      }
    } finally {
      setIsSigningIn(false);
    }
  };

  const handleSignOut = async () => {
    await logout();
    setUser(null);
    setHasAccessToken(false);
    if (dataSourceMode === 'sheets-api') {
      setDataSourceMode(publicSheetId ? 'sheets-public' : 'seed');
    }
  };

  // Sheets API Connection Handlers
  const handleConnectSheetApi = async (spreadsheetId: string) => {
    const token = getAccessToken();
    if (!token) {
      setSyncError('請先點擊「Sign in with Google」完成授權後再連線。');
      return;
    }
    setIsSyncing(true);
    setSyncError(null);
    try {
      const meta = await fetchSpreadsheetMeta(spreadsheetId, token);
      const [fetched, remoteSettings] = await Promise.all([
        fetchPostsFromSheetsApi(meta.spreadsheetId, meta.activeTab, token),
        fetchSiteSettingsFromSheetsApi(meta.spreadsheetId, meta.tabs, token),
      ]);
      setSheetMeta(meta);
      setPosts(fetched);
      setPublicSheetId(meta.spreadsheetId);
      setDataSourceMode('sheets-api');
      localStorage.setItem(PUBLIC_SHEET_STORAGE_KEY, meta.spreadsheetId);
      applyRemoteSettingsIfEnabled(remoteSettings, meta.title);
    } catch (err: any) {
      setSyncError(err?.message || '連線 Google Sheet API 失敗。');
    } finally {
      setIsSyncing(false);
    }
  };

  const handleSwitchSheetTab = async (tabName: string) => {
    const token = getAccessToken();
    if (!token || !sheetMeta) return;
    setIsSyncing(true);
    setSyncError(null);
    try {
      const fetched = await fetchPostsFromSheetsApi(
        sheetMeta.spreadsheetId,
        tabName,
        token,
      );
      setSheetMeta({...sheetMeta, activeTab: tabName});
      setPosts(fetched);
    } catch (err: any) {
      setSyncError(err?.message || '切換工作表分頁失敗。');
    } finally {
      setIsSyncing(false);
    }
  };

  const handleRefreshSync = async () => {
    if (dataSourceMode === 'sheets-api' && sheetMeta) {
      const token = getAccessToken();
      if (!token) {
        setSyncError('授權工作階段已過期，請重新登入 Google。');
        return;
      }
      setIsSyncing(true);
      setSyncError(null);
      try {
        const [fetched, remoteSettings] = await Promise.all([
          fetchPostsFromSheetsApi(
            sheetMeta.spreadsheetId,
            sheetMeta.activeTab,
            token,
          ),
          fetchSiteSettingsFromSheetsApi(
            sheetMeta.spreadsheetId,
            sheetMeta.tabs,
            token,
          ),
        ]);
        setPosts(fetched);
        applyRemoteSettingsIfEnabled(remoteSettings, sheetMeta.title);
      } catch (err: any) {
        setSyncError(err?.message || '重新同步 Google Sheet 失敗。');
      } finally {
        setIsSyncing(false);
      }
    } else if (dataSourceMode === 'sheets-public' && publicSheetId) {
      await loadPublicSheet(publicSheetId, publicTabName);
    }
  };

  // Auto-refresh Google Sheet posts when switching back to this browser tab
  useEffect(() => {
    const onVisibilityChange = () => {
      if (document.visibilityState !== 'visible') return;
      const now = Date.now();
      if (now - lastFocusRefreshRef.current < 10000) return;
      lastFocusRefreshRef.current = now;
      if (
        dataSourceMode === 'sheets-api' ||
        dataSourceMode === 'sheets-public'
      ) {
        void handleRefreshSync();
      }
    };
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () =>
      document.removeEventListener('visibilitychange', onVisibilityChange);
  });

  const handleCreateNewSheet = (withSeed: boolean = true) => {
    const token = getAccessToken();
    if (!token) {
      setSyncError('請先登入 Google 帳號以建立新的試算表資料庫。');
      return;
    }
    const initialPosts = withSeed ? SEED_POSTS : [];
    setConfirmState({
      isOpen: true,
      title: withSeed
        ? '建立並初始化 Google Sheet 資料庫（含示範文章）'
        : '建立全新空白 Google Sheet 資料庫（從零開始）',
      description: withSeed
        ? '系統將在您的 Google 雲端硬碟建立名為「PesMath 數學教學社群資料庫」的新試算表，並寫入示範文章作為初始結構。'
        : '系統將在您的 Google 雲端硬碟建立只含標準欄位標題（Slug, Title, Summary, Content...）的空白試算表，方便您直接撰寫或匯入自己的全部內容。',
      details: [
        '工作表分頁名稱：Posts',
        withSeed
          ? `寫入初始文章數量：${SEED_POSTS.length} 筆`
          : '寫入初始文章數量：0 筆（空白資料庫）',
      ],
      confirmLabel: withSeed ? '確認建立並寫入示範資料' : '確認建立空白試算表',
      isDestructive: false,
      onConfirm: async () => {
        setIsSyncing(true);
        setSyncError(null);
        try {
          const {meta, posts: createdPosts} = await createAndSeedJournalSheet(
            token,
            initialPosts,
          );
          setSheetMeta(meta);
          setPosts(createdPosts);
          setPublicSheetId(meta.spreadsheetId);
          setDataSourceMode('sheets-api');
          localStorage.setItem(PUBLIC_SHEET_STORAGE_KEY, meta.spreadsheetId);
        } catch (err: any) {
          setSyncError(err?.message || '建立試算表失敗。');
        } finally {
          setIsSyncing(false);
        }
      },
    });
  };

  const handleSavePost = (post: JournalPost, isNew: boolean) => {
    if (dataSourceMode === 'sheets-api' && sheetMeta) {
      const token = getAccessToken();
      if (!token) {
        setSyncError('授權工作階段已過期，請重新登入 Google。');
        return;
      }

      setConfirmState({
        isOpen: true,
        title: isNew
          ? '確認新增文章至 Google Sheet？'
          : '確認更新 Google Sheet 文章內容？',
        description: isNew
          ? `即將在試算表「${sheetMeta.title}」的「${sheetMeta.activeTab}」分頁新增一筆文章資料列。`
          : `即將覆寫試算表「${sheetMeta.title}」第 ${post.rowIndex} 列的現有文章內容。`,
        details: [
          `文章標題：${post.title}`,
          `學年度與分類：${post.academicYear} · ${post.category}`,
          `發布狀態：${post.status}`,
        ],
        confirmLabel: isNew ? '確認寫入試算表' : '確認更新資料列',
        isDestructive: false,
        onConfirm: async () => {
          setIsSyncing(true);
          setSyncError(null);
          try {
            if (isNew || !post.rowIndex) {
              await appendPostToSheet(
                sheetMeta.spreadsheetId,
                sheetMeta.activeTab,
                post,
                token,
              );
            } else {
              await updatePostInSheet(
                sheetMeta.spreadsheetId,
                sheetMeta.activeTab,
                post.rowIndex,
                post,
                token,
              );
            }
            const refreshed = await fetchPostsFromSheetsApi(
              sheetMeta.spreadsheetId,
              sheetMeta.activeTab,
              token,
            );
            setPosts(refreshed);
            setEditingPost(null);
          } catch (err: any) {
            setSyncError(err?.message || '寫入 Google Sheet 失敗。');
          } finally {
            setIsSyncing(false);
          }
        },
      });
    } else {
      // Session-only update when browsing local seed or JSON snapshot
      setPosts((prev) => {
        if (isNew) {
          return [post, ...prev];
        }
        return prev.map((item) => (item.slug === post.slug ? post : item));
      });
      setEditingPost(null);
    }
  };

  const handleDeletePost = (post: JournalPost) => {
    const isSheetsApi = dataSourceMode === 'sheets-api' && sheetMeta;
    const activeTabObj = sheetMeta?.tabs.find(
      (t) => t.title === sheetMeta.activeTab,
    );

    setConfirmState({
      isOpen: true,
      title: isSheetsApi
        ? '確認從 Google Sheet 永久刪除此文章？'
        : '確認從目前清單移除此文章？',
      description: isSheetsApi
        ? `此操作將會從試算表「${sheetMeta?.title}」直接刪除第 ${post.rowIndex} 列資料，刪除後無法自動復原。`
        : '此操作將從目前的靜態展示清單中移除該篇文章（不會影響外部檔案）。',
      details: [
        `文章標題：${post.title}`,
        `索引代碼：${post.slug}`,
      ],
      confirmLabel: '確認刪除',
      isDestructive: true,
      onConfirm: async () => {
        if (isSheetsApi && sheetMeta && activeTabObj && post.rowIndex) {
          const token = getAccessToken();
          if (!token) {
            setSyncError('授權工作階段已過期，請重新登入 Google。');
            return;
          }
          setIsSyncing(true);
          setSyncError(null);
          try {
            await deletePostFromSheet(
              sheetMeta.spreadsheetId,
              activeTabObj.sheetId,
              post.rowIndex,
              token,
            );
            const refreshed = await fetchPostsFromSheetsApi(
              sheetMeta.spreadsheetId,
              sheetMeta.activeTab,
              token,
            );
            setPosts(refreshed);
            if (activePost?.slug === post.slug) {
              setActivePost(null);
            }
          } catch (err: any) {
            setSyncError(err?.message || '刪除 Google Sheet 資料列失敗。');
          } finally {
            setIsSyncing(false);
          }
        } else {
          setPosts((prev) => prev.filter((item) => item.slug !== post.slug));
          if (activePost?.slug === post.slug) {
            setActivePost(null);
          }
        }
      },
    });
  };

  const handleBatchImportPosts = (importedPosts: JournalPost[]) => {
    if (importedPosts.length === 0) return;

    if (dataSourceMode === 'sheets-api' && sheetMeta) {
      const token = getAccessToken();
      if (!token) {
        setSyncError('授權工作階段已過期，請重新登入 Google。');
        return;
      }

      setConfirmState({
        isOpen: true,
        title: `確認批次匯入 ${importedPosts.length} 篇文章至 Google Sheet？`,
        description: `即將把從 RSS / Blogger 選取的文章附加至試算表「${sheetMeta.title}」的「${sheetMeta.activeTab}」分頁。`,
        details: [
          `匯入文章數量：${importedPosts.length} 篇`,
          `首篇範例：${importedPosts[0].title}`,
        ],
        confirmLabel: `確認寫入 ${importedPosts.length} 篇文章`,
        isDestructive: false,
        onConfirm: async () => {
          setIsSyncing(true);
          setSyncError(null);
          try {
            await batchAppendPostsToSheet(
              sheetMeta.spreadsheetId,
              sheetMeta.activeTab,
              importedPosts,
              token,
            );
            const refreshed = await fetchPostsFromSheetsApi(
              sheetMeta.spreadsheetId,
              sheetMeta.activeTab,
              token,
            );
            setPosts(refreshed);
          } catch (err: any) {
            setSyncError(err?.message || '批次寫入 Google Sheet 失敗。');
          } finally {
            setIsSyncing(false);
          }
        },
      });
    } else {
      setPosts((prev) => {
        const existingSlugs = new Set(prev.map((p) => p.slug));
        const uniqueIncoming = importedPosts.filter(
          (p) => !existingSlugs.has(p.slug),
        );
        return [...uniqueIncoming, ...prev];
      });
      setDataSourceMode('local-json');
      setIsDrawerOpen(false);
    }
  };

  const handleSaveSiteSettings = async (
    nextSettings: SiteSettings,
  ): Promise<{success: boolean; message: string}> => {
    setSiteSettings(nextSettings);
    const activeId = sheetMeta?.spreadsheetId || publicSheetId || '';
    const activeTab = sheetMeta?.activeTab || publicTabName || 'Posts';

    let cloudSynced = false;
    let cloudErrorMsg = '';
    if (auth.currentUser) {
      try {
        await saveSharedSiteConfig({
          spreadsheetId: activeId,
          tabName: activeTab,
          ...nextSettings,
        });
        cloudSynced = true;
      } catch (err: any) {
        cloudErrorMsg = err?.message || '雲端即時同步失敗';
      }
    }

    const localRes = await saveSiteConfig({
      spreadsheetId: activeId || undefined,
      tabName: activeTab,
      ...nextSettings,
    });

    if (cloudSynced) {
      return {
        success: true,
        message: localRes.persistedToRepo
          ? '已即時同步至雲端資料庫（AI Studio 與 GitHub Pages 會同時變動！），並已寫入 site-config.json。'
          : '已即時同步至雲端資料庫！AI Studio 與 GitHub Pages 正式網站會立刻同時變動，無需重新布版。',
      };
    }

    if (cloudErrorMsg) {
      return {
        success: true,
        message: `已更新目前畫面，但雲端同步遇到權限提示（${cloudErrorMsg}）。請確認您是使用核准的管理員 Gmail 登入。`,
      };
    }

    return localRes;
  };

  const handlePublishDefaultSpreadsheet = async (
    spreadsheetId: string,
    tabName: string,
  ): Promise<{success: boolean; message: string}> => {
    const cleanId = spreadsheetId.trim();
    const cleanTab = tabName.trim() || 'Posts';
    if (!cleanId) {
      return {success: false, message: '請先輸入或連線有效的 Google 試算表 ID。'};
    }
    lastCloudSheetKeyRef.current = `${cleanId}|${cleanTab}`;

    let cloudSynced = false;
    let cloudErrorMsg = '';
    if (auth.currentUser) {
      try {
        await saveSharedSiteConfig({
          spreadsheetId: cleanId,
          tabName: cleanTab,
          ...siteSettings,
        });
        cloudSynced = true;
      } catch (err: any) {
        cloudErrorMsg = err?.message || '雲端同步失敗';
      }
    }

    const localRes = await saveSiteConfig({
      spreadsheetId: cleanId,
      tabName: cleanTab,
      ...siteSettings,
    });

    if (cloudSynced) {
      return {
        success: true,
        message: localRes.persistedToRepo
          ? '已設為雲端即時預設（AI Studio 與 GitHub Pages 會同時自動載入此試算表！）並已更新 site-config.json。'
          : '已設為雲端即時預設！AI Studio 與 GitHub Pages 正式網站已同步切換至此試算表。',
      };
    }

    if (cloudErrorMsg) {
      return {
        success: false,
        message: `雲端同步失敗：${cloudErrorMsg}`,
      };
    }

    return localRes;
  };

  const handleSyncSettingsToSheet = (nextSettings: SiteSettings) => {
    if (dataSourceMode !== 'sheets-api' || !sheetMeta) {
      setSyncError('請先於「Google Sheets 連線」分頁連線可寫入的試算表。');
      return;
    }
    const token = getAccessToken();
    if (!token) {
      setSyncError('授權工作階段已過期，請重新登入 Google。');
      return;
    }

    setConfirmState({
      isOpen: true,
      title: '確認將網頁標題設定同步寫入 Google Sheet 並即時發布？',
      description: `系統將在試算表「${sheetMeta.title}」的「Settings」分頁更新網站標題，並同步至雲端即時設定，讓 AI Studio 與 GitHub Pages 同時變動。`,
      details: [
        `網站標題：${nextSettings.siteTitle}`,
        `社群副標題：${nextSettings.siteSubtitle}`,
        `首頁主標語：${nextSettings.heroHeading}`,
      ],
      confirmLabel: '確認寫入並同步兩端',
      isDestructive: false,
      onConfirm: async () => {
        setIsSyncing(true);
        setSyncError(null);
        try {
          const updatedTabs = await saveSiteSettingsToSheet(
            sheetMeta.spreadsheetId,
            nextSettings,
            sheetMeta.tabs,
            token,
          );
          setSheetMeta({...sheetMeta, tabs: updatedTabs});
          setSiteSettings(nextSettings);
          if (auth.currentUser) {
            await saveSharedSiteConfig({
              spreadsheetId: sheetMeta.spreadsheetId,
              tabName: sheetMeta.activeTab,
              ...nextSettings,
            });
          }
        } catch (err: any) {
          setSyncError(err?.message || '寫入 Settings 分頁失敗。');
        } finally {
          setIsSyncing(false);
        }
      },
    });
  };

  const openDrawer = (tab: DrawerTab, postToEdit: JournalPost | null = null) => {
    if (!user || !hasAccessToken) {
      handleSignIn();
      return;
    }
    setDrawerInitialTab(tab);
    setEditingPost(postToEdit);
    setIsDrawerOpen(true);
  };

  const scrollToSection = (id: string) => {
    const el = document.getElementById(id);
    if (el) {
      el.scrollIntoView({behavior: 'smooth', block: 'start'});
    }
  };

  const dataSourceLabel =
    dataSourceMode === 'sheets-api'
      ? `Google Sheets API (${sheetMeta?.title || '已連線'})`
      : dataSourceMode === 'sheets-public'
      ? '公開 Google Sheet (唯讀即時同步)'
      : dataSourceMode === 'local-json'
      ? '匯入 JSON 靜態資料集'
      : '內建示範資料庫 (可即時切換試算表)';

  return (
    <div className="min-h-screen flex flex-col bg-[#FBF9F5] text-[#1C1917]">
      {/* Strict 3-Zone Top Navigation Bar */}
      <header className="sticky top-0 z-30 bg-[#FBF9F5]/95 backdrop-blur-sm border-b border-stone-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-3 md:gap-8">
          {/* Zone 1: Single-line Brand Wordmark */}
          <a
            href="#top"
            onClick={(e) => {
              e.preventDefault();
              setSelectedYear('全部年度');
              setSelectedCategory('全部分類');
              setViewMode('swipe');
              window.scrollTo({top: 0, behavior: 'smooth'});
            }}
            className="font-editorial text-lg sm:text-xl font-bold tracking-tight text-stone-950 whitespace-nowrap shrink-0"
          >
            {siteSettings.siteTitle}
          </a>

          {/* Zone 2: 5 Single-line Text Nav Links */}
          <nav className="flex items-center gap-4 md:gap-7 text-sm font-medium text-stone-600">
            <button
              type="button"
              onClick={() => {
                setSelectedYear('全部年度');
                setSelectedCategory('全部分類');
                setSearchQuery('');
                setViewMode('swipe');
                setImmersiveSwipe({isOpen: true, topicIndex: 0, cardIndex: 0});
              }}
              title="像 LINE 新聞一樣：左右滑看同主題文章，上下滑切換不同主題"
              className={`inline-flex items-center gap-1.5 hover:text-[#1E3A8A] hover:underline underline-offset-4 transition-colors whitespace-nowrap shrink-0 ${
                immersiveSwipe.isOpen
                  ? 'text-[#1E3A8A] font-semibold'
                  : 'text-stone-800 font-medium'
              }`}
            >
              <GalleryHorizontalEnd className="w-3.5 h-3.5 text-[#1E3A8A]" />
              <span>滑動快覽</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setSelectedCategory('全部分類');
                setViewMode('grid');
                scrollToSection('journal-catalog');
              }}
              className="hidden md:inline-block hover:text-stone-950 hover:underline underline-offset-4 transition-colors whitespace-nowrap shrink-0"
            >
              期刊專欄
            </button>
            <button
              type="button"
              onClick={() => {
                setSelectedCategory('教學資源');
                setViewMode('grid');
                scrollToSection('journal-catalog');
              }}
              className="hidden md:inline-block hover:text-stone-950 hover:underline underline-offset-4 transition-colors whitespace-nowrap shrink-0"
            >
              教學資源
            </button>
            <button
              type="button"
              onClick={() => {
                setSelectedCategory('學力檢測');
                setViewMode('grid');
                scrollToSection('journal-catalog');
              }}
              className="hidden md:inline-block hover:text-stone-950 hover:underline underline-offset-4 transition-colors whitespace-nowrap shrink-0"
            >
              學力檢測
            </button>
            <button
              type="button"
              onClick={() => openXimenStage('map')}
              className={`hidden md:inline-block hover:text-[#1E3A8A] hover:underline underline-offset-4 transition-colors whitespace-nowrap shrink-0 ${
                interactiveStage.isOpen
                  ? 'text-[#1E3A8A] font-semibold'
                  : ''
              }`}
            >
              互動專題
            </button>
          </nav>

          {/* Zone 3: 1 Primary CTA */}
          <div className="flex items-center shrink-0">
            {user && hasAccessToken ? (
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => openDrawer('editor')}
                  className="px-3.5 py-1.5 text-xs font-medium text-white bg-[#1E3A8A] rounded-lg hover:bg-[#172554] transition-colors whitespace-nowrap shrink-0"
                >
                  管理後台
                </button>
                <button
                  type="button"
                  onClick={handleSignOut}
                  className="px-2.5 py-1.5 text-xs font-medium text-stone-600 hover:text-stone-900 transition-colors whitespace-nowrap shrink-0"
                >
                  登出
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={handleSignIn}
                disabled={isSigningIn}
                className="px-3.5 py-1.5 text-xs font-medium text-stone-700 bg-white border border-stone-300 rounded-lg hover:bg-stone-50 transition-colors whitespace-nowrap shrink-0"
              >
                {isSigningIn ? '登入中...' : '教師登入'}
              </button>
            )}
          </div>
        </div>
      </header>

      {syncError && !isDrawerOpen && (
        <div
          role="alert"
          className="bg-red-50 border-b border-red-200 text-red-900 px-6 py-3"
        >
          <div className="max-w-7xl mx-auto flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs leading-relaxed">
            <div className="space-y-1">
              <div className="font-semibold">登入或試算表連線提示</div>
              <div>{syncError}</div>
              {syncError.includes('Google Cloud Console') && (
                <div>
                  <a
                    href={`https://console.cloud.google.com/auth/audience?project=${encodeURIComponent(firebaseConfig.projectId)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 font-medium text-[#1E3A8A] underline underline-offset-2"
                  >
                    <span>前往 Google Cloud Console 新增測試人員（Test users）</span>
                    <ExternalLink className="w-3 h-3" />
                  </a>
                </div>
              )}
            </div>
            <button
              type="button"
              onClick={() => setSyncError(null)}
              className="px-3 py-1.5 text-xs font-medium text-red-800 bg-white border border-red-200 rounded-md hover:bg-red-100/60 self-start sm:self-center shrink-0"
            >
              關閉提示
            </button>
          </div>
        </div>
      )}

      <main id="top" className="flex-1">
        {/* Editorial Masthead + Prominent First-Screen Search + Compact Featured Spotlight */}
        <section className="border-b border-stone-200 bg-white">
          <div className="max-w-7xl mx-auto px-6 py-7 lg:py-9">
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
              {/* Left Column: Brand Masthead, Prominent Search & Top Topic Quick Links */}
              <div className="lg:col-span-7 flex flex-col justify-center gap-5">
                <div className="space-y-2.5">
                  {siteSettings.siteSubtitle.trim() && (
                    <p className="text-xs font-mono-tabular tracking-widest uppercase text-stone-500">
                      {siteSettings.siteSubtitle}
                    </p>
                  )}
                  <h1 className="font-editorial text-3xl sm:text-4xl lg:text-[42px] font-semibold text-stone-950 leading-[1.18] text-balance">
                    {siteSettings.heroHeading}
                  </h1>
                  {siteSettings.heroDescription.trim() && (
                    <p className="text-sm sm:text-base text-stone-600 leading-relaxed max-w-2xl">
                      {siteSettings.heroDescription}
                    </p>
                  )}
                </div>

                {/* First-Screen Unified Search & Academic Year Bar */}
                <div className="space-y-3">
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      scrollToSection('journal-catalog');
                    }}
                    className="bg-[#FBF9F5] border border-stone-300 rounded-xl p-1.5 flex flex-col sm:flex-row sm:items-center gap-2 shadow-xs focus-within:ring-2 focus-within:ring-[#1E3A8A] focus-within:border-[#1E3A8A] focus-within:bg-white transition-all"
                  >
                    <div className="relative flex-1 min-w-0">
                      <Search className="w-4 h-4 text-stone-500 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                      <input
                        type="search"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        placeholder={`搜尋 ${posts.length} 篇教案、學力檢測、會議紀錄或作者...`}
                        className="w-full h-10 pl-9 pr-3 text-sm text-stone-900 placeholder:text-stone-400 bg-transparent focus:outline-none"
                      />
                    </div>

                    <div className="flex items-center gap-2 sm:border-l sm:border-stone-200 sm:pl-2 shrink-0">
                      <select
                        id="academic-year-select"
                        aria-label="篩選學年度"
                        value={selectedYear}
                        onChange={(e) => setSelectedYear(e.target.value)}
                        className="h-10 pl-2.5 pr-7 text-xs font-medium text-stone-800 bg-white border border-stone-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1E3A8A] cursor-pointer"
                      >
                        {availableYears.map((yr) => (
                          <option key={yr} value={yr}>
                            {yr} ({yearCounts.get(yr) ?? 0})
                          </option>
                        ))}
                      </select>

                      <button
                        type="submit"
                        className="h-10 px-4 text-xs font-semibold text-white bg-[#1E3A8A] rounded-lg hover:bg-[#172554] transition-colors whitespace-nowrap shrink-0"
                      >
                        搜尋文章
                      </button>
                    </div>
                  </form>

                  {/* Quick Topic Shortcuts (Populates Left Column Purposefully & Speeds Discovery) */}
                  {availableCategories.length > 1 && (
                    <div className="flex flex-wrap items-center gap-1.5 text-xs">
                      <span className="text-stone-500 mr-1">常用分類：</span>
                      {availableCategories
                        .filter((cat) => cat !== '全部分類')
                        .sort(
                          (a, b) =>
                            (categoryCounts.get(b) ?? 0) -
                            (categoryCounts.get(a) ?? 0),
                        )
                        .slice(0, 5)
                        .map((cat) => (
                          <button
                            key={cat}
                            type="button"
                            onClick={() => {
                              setSelectedCategory(cat);
                              scrollToSection('journal-catalog');
                            }}
                            className={`px-2.5 py-1 rounded-md border transition-colors whitespace-nowrap ${
                              selectedCategory === cat
                                ? 'bg-[#1E3A8A] text-white border-[#1E3A8A]'
                                : 'bg-[#F7F4EE] text-stone-700 border-stone-200 hover:border-stone-300 hover:text-stone-950'
                            }`}
                          >
                            {cat} ({categoryCounts.get(cat) ?? 0})
                          </button>
                        ))}
                    </div>
                  )}

                  {(searchQuery.trim() !== '' ||
                    selectedYear !== '全部年度' ||
                    selectedCategory !== '全部分類') && (
                    <div className="flex flex-wrap items-center gap-3 text-xs text-stone-600 px-1">
                      <span className="font-mono-tabular font-medium text-stone-800">
                        符合條件：{filteredPosts.length} 篇
                      </span>
                      <button
                        type="button"
                        onClick={() => scrollToSection('journal-catalog')}
                        className="font-medium text-[#1E3A8A] hover:underline"
                      >
                        查看篩選結果 ↓
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setSearchQuery('');
                          setSelectedYear('全部年度');
                          setSelectedCategory('全部分類');
                        }}
                        className="text-stone-500 hover:text-stone-900 hover:underline"
                      >
                        清除條件
                      </button>
                    </div>
                  )}
                </div>
              </div>

              {/* Right Column: Compact Featured Spotlight */}
              {featuredSpotlightPost ? (
                <div className="lg:col-span-5 flex">
                  <article className="w-full bg-[#FBF9F5] border border-stone-200 rounded-xl overflow-hidden flex flex-col justify-between">
                    <div
                      className={`h-1 w-full shrink-0 ${
                        getCategoryAccent(featuredSpotlightPost.category).barClass
                      }`}
                    />
                    {featuredSpotlightPost.coverImageUrl && !spotlightImgFailed && (
                      <button
                        type="button"
                        onClick={() => setActivePost(featuredSpotlightPost)}
                        className="h-36 w-full bg-stone-100 border-b border-stone-200 overflow-hidden text-left shrink-0 group focus-visible:outline-none"
                      >
                        <img
                          src={featuredSpotlightPost.coverImageUrl}
                          alt={featuredSpotlightPost.title}
                          referrerPolicy="no-referrer"
                          onError={() => setSpotlightImgFailed(true)}
                          className="w-full h-full object-cover object-top transition-transform duration-500 group-hover:scale-[1.03]"
                        />
                      </button>
                    )}

                    <div className="p-5 flex-1 flex flex-col justify-between gap-3">
                      <div className="space-y-2">
                        <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                          <span className="font-bold text-[#1E3A8A]">
                            本期焦點
                            {featuredSpotlightPost.category
                              ? ` · ${formatCategoryDisplay(featuredSpotlightPost.category)}`
                              : ''}
                          </span>
                          <span className="font-mono-tabular text-stone-500">
                            {featuredSpotlightPost.academicYear}
                          </span>
                        </div>

                        <h2 className="font-editorial text-lg sm:text-xl font-bold text-stone-950 leading-snug line-clamp-2">
                          <button
                            type="button"
                            onClick={() => setActivePost(featuredSpotlightPost)}
                            className="text-left hover:text-[#1E3A8A] transition-colors"
                          >
                            {featuredSpotlightPost.title}
                          </button>
                        </h2>

                        <p className="text-xs sm:text-sm text-stone-600 leading-relaxed line-clamp-2">
                          {featuredSpotlightPost.summary}
                        </p>
                      </div>

                      <div className="pt-3 border-t border-stone-200/80 flex items-center justify-between gap-3 text-xs">
                        <span className="text-stone-500 truncate">
                          {featuredSpotlightPost.author}
                        </span>
                        <button
                          type="button"
                          onClick={() => setActivePost(featuredSpotlightPost)}
                          className="font-semibold text-[#1E3A8A] hover:underline inline-flex items-center gap-1 whitespace-nowrap shrink-0"
                        >
                          <span>閱讀全文</span>
                          <ArrowUpRight className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  </article>
                </div>
              ) : null}
            </div>

            {/* Compact 4-Column Operational Utility Strip */}
            <div className="mt-7 pt-6 border-t border-stone-200 grid grid-cols-2 lg:grid-cols-4 gap-6">
              <div>
                <div className="text-xs text-stone-500">收錄期刊與紀錄</div>
                <div className="font-mono-tabular text-xl sm:text-2xl font-semibold text-stone-950 mt-0.5">
                  {posts.length} 篇
                </div>
              </div>
              <div>
                <div className="text-xs text-stone-500">涵蓋學年度跨距</div>
                <div className="font-mono-tabular text-xl sm:text-2xl font-semibold text-stone-950 mt-0.5">
                  {Math.max(1, availableYears.length - 1)} 個學年
                </div>
              </div>
              <div>
                <div className="text-xs text-stone-500">雲端附件與表單</div>
                <div className="font-mono-tabular text-xl sm:text-2xl font-semibold text-stone-950 mt-0.5">
                  {embedCount} 筆資源
                </div>
              </div>
              <div>
                <div className="text-xs text-stone-500 flex items-center justify-between gap-2">
                  <span>{user && hasAccessToken ? '資料庫來源狀態' : '資料庫狀態'}</span>
                  {user &&
                    hasAccessToken &&
                    (dataSourceMode === 'sheets-api' ||
                      dataSourceMode === 'sheets-public') && (
                      <button
                        type="button"
                        onClick={handleRefreshSync}
                        disabled={isSyncing}
                        className="text-[#1E3A8A] hover:underline inline-flex items-center gap-1 text-xs font-medium"
                      >
                        <RefreshCw
                          className={`w-3 h-3 ${isSyncing ? 'animate-spin' : ''}`}
                        />
                        <span>同步</span>
                      </button>
                    )}
                </div>
                <div className="text-sm font-semibold text-stone-900 mt-1 truncate">
                  {user && hasAccessToken
                    ? dataSourceLabel
                    : '雲端即時連線（最新期刊）'}
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Integrated Interactive Topic Showcase Strip */}
        <section
          aria-label="跨域互動專題展示"
          className="border-b border-stone-200 bg-[#F7F4EE]"
        >
          <div className="max-w-7xl mx-auto px-6 py-5 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
            <div className="space-y-1 min-w-0">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs">
                <span className="font-semibold text-[#1E3A8A]">
                  跨領域互動學習專題
                </span>
                <span aria-hidden="true" className="text-stone-400">
                  ·
                </span>
                <span className="font-mono-tabular text-stone-600">
                  401–404 年段實作資源
                </span>
              </div>
              <h2 className="font-editorial text-lg sm:text-xl font-bold text-stone-950">
                百年西門 Scratch 舞台秀互動學習網
              </h2>
              <p className="text-xs sm:text-sm text-stone-600 leading-relaxed">
                提供西門町互動商圈地圖座標微調、標準圖庫匯出、Scratch 3.0 積木步驟與分班命名檢核表。
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2 shrink-0">
              <div className="flex flex-wrap items-center gap-1.5">
                {(
                  [
                    {id: 'map', label: '互動地圖'},
                    {id: 'gallery', label: '專案圖庫'},
                    {id: 'blocks', label: '積木教學'},
                    {id: 'naming', label: '命名檢核'},
                  ] as const
                ).map((tab) => (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => openXimenStage(tab.id)}
                    className="min-h-[38px] px-3 py-1.5 text-xs font-medium text-stone-700 bg-white border border-stone-200 rounded-lg hover:border-[#1E3A8A] hover:text-[#1E3A8A] transition-colors whitespace-nowrap shrink-0"
                  >
                    {tab.label}
                  </button>
                ))}
              </div>

              <button
                type="button"
                onClick={() => openXimenStage('map')}
                className="min-h-[38px] px-4 py-1.5 text-xs font-semibold text-white bg-[#1E3A8A] rounded-lg hover:bg-[#172554] inline-flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0"
              >
                <MonitorPlay className="w-3.5 h-3.5" />
                <span>開啟互動學習網</span>
              </button>

              <a
                href="./ximen-scratch.html"
                target="_blank"
                rel="noopener noreferrer"
                className="min-h-[38px] px-3 py-1.5 text-xs font-medium text-stone-700 bg-white border border-stone-300 rounded-lg hover:bg-stone-50 inline-flex items-center gap-1 transition-colors whitespace-nowrap shrink-0"
              >
                <span>獨立分頁</span>
                <ExternalLink className="w-3.5 h-3.5" />
              </a>
            </div>
          </div>
        </section>

        {/* Journal Catalog & Single-Line Channel Bar */}
        <section id="journal-catalog" className="max-w-7xl mx-auto px-6 py-8 lg:py-10 space-y-6">
          {/* Unified Channel Tabs + View Mode Switcher Row (No Redundant Middle Search Box) */}
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 border-b border-stone-200 pb-2">
            {/* Horizontal Scrollable Topic Channel Strip */}
            <div className="flex-1 min-w-0 flex items-center">
              <button
                type="button"
                onClick={() =>
                  categoryBarRef.current?.scrollBy({left: -220, behavior: 'smooth'})
                }
                aria-label="向左捲動專欄分類"
                className="hidden sm:flex min-h-[40px] min-w-[32px] items-center justify-center text-stone-500 hover:text-stone-900 shrink-0"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>

              <div
                ref={categoryBarRef}
                className="flex-1 flex items-center gap-1 overflow-x-auto no-scrollbar scroll-smooth"
              >
                {availableCategories.map((cat) => {
                  const isActive = selectedCategory === cat;
                  const count = categoryCounts.get(cat) ?? 0;
                  return (
                    <button
                      key={cat}
                      type="button"
                      onClick={() => setSelectedCategory(cat)}
                      className={`px-3 py-2 text-sm border-b-2 transition-colors whitespace-nowrap shrink-0 inline-flex items-baseline gap-1.5 ${
                        isActive
                          ? 'border-[#1E3A8A] text-[#1E3A8A] font-semibold'
                          : 'border-transparent text-stone-600 hover:text-stone-950 font-medium'
                      }`}
                    >
                      <span>{cat === '全部分類' ? '全部主題' : cat}</span>
                      <span
                        className={`font-mono-tabular text-xs ${
                          isActive ? 'text-[#1E3A8A]/80' : 'text-stone-400'
                        }`}
                      >
                        {count}
                      </span>
                    </button>
                  );
                })}
              </div>

              <button
                type="button"
                onClick={() =>
                  categoryBarRef.current?.scrollBy({left: 220, behavior: 'smooth'})
                }
                aria-label="向右捲動專欄分類"
                className="hidden sm:flex min-h-[40px] min-w-[32px] items-center justify-center text-stone-500 hover:text-stone-900 shrink-0"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>

            {/* Right Controls: Draft Toggle + View Mode Switcher */}
            <div className="flex items-center justify-between sm:justify-end gap-3 shrink-0 pb-1 lg:pb-0">
              {user && hasAccessToken && (
                <label className="inline-flex items-center gap-1.5 text-xs font-medium text-stone-600 cursor-pointer whitespace-nowrap">
                  <input
                    type="checkbox"
                    checked={includeDrafts}
                    onChange={(e) => setIncludeDrafts(e.target.checked)}
                    className="rounded border-stone-300 text-[#1E3A8A] focus:ring-[#1E3A8A]"
                  />
                  <span>顯示草稿</span>
                </label>
              )}

              <div className="flex items-center gap-1 p-1 bg-[#F7F4EE] border border-stone-200 rounded-lg">
                <button
                  type="button"
                  onClick={() => setViewMode('swipe')}
                  className={`px-3 py-1.5 text-xs font-medium rounded-md inline-flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0 ${
                    viewMode === 'swipe'
                      ? 'bg-white text-stone-950 shadow-xs'
                      : 'text-stone-600 hover:text-stone-900'
                  }`}
                >
                  <Layers className="w-3.5 h-3.5" />
                  <span>主題滑動</span>
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode('grid')}
                  className={`px-3 py-1.5 text-xs font-medium rounded-md inline-flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0 ${
                    viewMode === 'grid'
                      ? 'bg-white text-stone-950 shadow-xs'
                      : 'text-stone-600 hover:text-stone-900'
                  }`}
                >
                  <LayoutGrid className="w-3.5 h-3.5" />
                  <span>卡片排版</span>
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode('list')}
                  className={`px-3 py-1.5 text-xs font-medium rounded-md inline-flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0 ${
                    viewMode === 'list'
                      ? 'bg-white text-stone-950 shadow-xs'
                      : 'text-stone-600 hover:text-stone-900'
                  }`}
                >
                  <List className="w-3.5 h-3.5" />
                  <span>目錄清單</span>
                </button>
              </div>
            </div>
          </div>

          {/* Results Header */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-baseline gap-3">
              <h2 className="font-editorial text-xl font-semibold text-stone-900">
                {selectedCategory === '全部分類' ? '所有期刊文章' : selectedCategory}
                {selectedYear !== '全部年度' ? ` · ${selectedYear}` : ''}
              </h2>
              <span className="text-xs font-mono-tabular text-stone-500">
                共 {filteredPosts.length} 篇
              </span>
              {(selectedCategory !== '全部分類' ||
                selectedYear !== '全部年度' ||
                searchQuery.trim() !== '') && (
                <button
                  type="button"
                  onClick={() => {
                    setSearchQuery('');
                    setSelectedYear('全部年度');
                    setSelectedCategory('全部分類');
                  }}
                  className="text-xs font-medium text-[#1E3A8A] hover:underline"
                >
                  重設篩選
                </button>
              )}
            </div>

            {viewMode === 'swipe' && filteredPosts.length > 0 && (
              <button
                type="button"
                onClick={() =>
                  setImmersiveSwipe({isOpen: true, topicIndex: 0, cardIndex: 0})
                }
                className="min-h-[40px] px-3.5 py-2 text-xs font-medium text-white bg-[#1E3A8A] rounded-lg hover:bg-[#172554] inline-flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0"
              >
                <GalleryHorizontalEnd className="w-3.5 h-3.5" />
                <span>開啟大卡片滑動模式</span>
              </button>
            )}
          </div>

          {/* Empty State */}
          {filteredPosts.length === 0 ? (
            posts.length === 0 ? (
              <div className="bg-white border border-stone-200 rounded-xl p-12 text-center space-y-4">
                <BookOpen className="w-8 h-8 text-[#1E3A8A] mx-auto" />
                <h3 className="font-editorial text-lg font-medium text-stone-900">
                  此資料庫目前尚未建立文章
                </h3>
                <p className="text-sm text-stone-600 max-w-md mx-auto">
                  您的專屬試算表結構已就緒，現在可以立即撰寫第一篇期刊文章，或透過管理後台批次匯入既有文章。
                </p>
                <div className="flex flex-wrap items-center justify-center gap-3">
                  <button
                    type="button"
                    onClick={() => openDrawer('editor')}
                    className="px-4 py-2 text-xs font-medium text-white bg-[#1E3A8A] rounded-lg hover:bg-[#172554] transition-colors"
                  >
                    立即新增第一篇文章
                  </button>
                  <button
                    type="button"
                    onClick={() => openDrawer('rss')}
                    className="px-4 py-2 text-xs font-medium text-stone-700 bg-white border border-stone-300 rounded-lg hover:bg-stone-50 transition-colors"
                  >
                    從 RSS / Blogger 匯入
                  </button>
                </div>
              </div>
            ) : (
              <div className="bg-white border border-stone-200 rounded-xl p-12 text-center space-y-3">
                <BookOpen className="w-8 h-8 text-stone-400 mx-auto" />
                <h3 className="font-editorial text-lg font-medium text-stone-900">
                  找不到符合條件的期刊文章
                </h3>
                <p className="text-sm text-stone-600 max-w-md mx-auto">
                  請嘗試清除關鍵字或切換其他學年度與分類標籤。
                </p>
                <button
                  type="button"
                  onClick={() => {
                    setSearchQuery('');
                    setSelectedYear('全部年度');
                    setSelectedCategory('全部分類');
                  }}
                  className="px-4 py-2 text-xs font-medium text-white bg-[#1E3A8A] rounded-lg hover:bg-[#172554] transition-colors"
                >
                  重設所有篩選條件
                </button>
              </div>
            )
          ) : viewMode === 'swipe' ? (
            <TopicSwipeFeed
              groups={topicGroups}
              onSelectPost={(p) => setActivePost(p)}
              onOpenImmersive={(topicIndex, cardIndex) =>
                setImmersiveSwipe({isOpen: true, topicIndex, cardIndex})
              }
              isFilteredToSingleCategory={selectedCategory !== '全部分類'}
              onResetCategoryFilter={() => setSelectedCategory('全部分類')}
            />
          ) : viewMode === 'grid' ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {filteredPosts.map((post, idx) => (
                <ArticleCard
                  key={`${post.slug}-${post.rowIndex ?? idx}`}
                  post={post}
                  onSelect={(p) => setActivePost(p)}
                />
              ))}
            </div>
          ) : (
            /* Chronological Archive Table View */
            <div className="bg-white border border-stone-200 rounded-xl overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-[#F7F4EE] border-b border-stone-200 text-xs font-semibold text-stone-700">
                      <th className="py-3.5 px-5 whitespace-nowrap">學年度</th>
                      <th className="py-3.5 px-4 whitespace-nowrap">發布日期</th>
                      <th className="py-3.5 px-4 whitespace-nowrap">分類</th>
                      <th className="py-3.5 px-4">文章標題</th>
                      <th className="py-3.5 px-4 whitespace-nowrap">雲端資源</th>
                      <th className="py-3.5 px-5 text-right whitespace-nowrap">
                        操作
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-stone-100 text-sm">
                    {filteredPosts.map((post, idx) => (
                      <tr
                        key={`${post.slug}-${post.rowIndex ?? idx}`}
                        className="hover:bg-[#FBF9F5] transition-colors"
                      >
                        <td className="py-3.5 px-5 font-mono-tabular text-xs text-stone-600 whitespace-nowrap">
                          {post.academicYear}
                        </td>
                        <td className="py-3.5 px-4 font-mono-tabular text-xs text-stone-500 whitespace-nowrap">
                          {post.publishedAt}
                        </td>
                        <td className="py-3.5 px-4 text-xs text-stone-700 whitespace-nowrap">
                          {formatCategoryDisplay(post.category)}
                        </td>
                        <td className="py-3.5 px-4">
                          <button
                            type="button"
                            onClick={() => setActivePost(post)}
                            className="text-left font-medium text-stone-900 hover:text-[#1E3A8A] transition-colors"
                          >
                            {post.title}
                          </button>
                        </td>
                        <td className="py-3.5 px-4 text-xs text-stone-500 whitespace-nowrap">
                          {post.embedUrl ? (
                            <a
                              href={post.embedUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 text-[#1E3A8A] hover:underline"
                            >
                              <FileText className="w-3.5 h-3.5" />
                              <span>開啟附件</span>
                            </a>
                          ) : (
                            <span>—</span>
                          )}
                        </td>
                        <td className="py-3.5 px-5 text-right whitespace-nowrap">
                          <button
                            type="button"
                            onClick={() => setActivePost(post)}
                            className="text-xs font-medium text-[#1E3A8A] hover:underline"
                          >
                            閱讀全文
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </section>
      </main>

      {/* Clean Institutional Footer */}
      <footer className="border-t border-stone-200 bg-white mt-12">
        <div className="max-w-7xl mx-auto px-6 py-8 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 text-xs text-stone-500">
          <div className="space-y-1">
            <div className="font-editorial text-sm font-semibold text-stone-900">
              {siteSettings.siteTitle} | {siteSettings.siteSubtitle}
            </div>
            <div>
              支援靜態 GitHub Pages 託管 · 可連結 Google Sheets 試算表作為即時資料庫
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-4">
            {user && hasAccessToken ? (
              <>
                <button
                  type="button"
                  onClick={() => openDrawer('sheets')}
                  className="inline-flex items-center gap-1.5 text-stone-700 hover:text-[#1E3A8A] font-medium"
                >
                  <Sheet className="w-3.5 h-3.5" />
                  <span>管理後台與連線設定</span>
                </button>
                <button
                  type="button"
                  onClick={handleSignOut}
                  className="text-stone-500 hover:text-stone-900"
                >
                  登出
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={handleSignIn}
                disabled={isSigningIn}
                className="text-stone-600 hover:text-[#1E3A8A] font-medium transition-colors"
              >
                {isSigningIn ? '登入中...' : '社群教師登入'}
              </button>
            )}
          </div>
        </div>
      </footer>

      {/* 2D Topic & Card Swipe Reader Deck */}
      <TopicSwipeDeckModal
        isOpen={immersiveSwipe.isOpen}
        isSuspended={Boolean(activePost) || interactiveStage.isOpen}
        groups={topicGroups}
        initialTopicIndex={immersiveSwipe.topicIndex}
        initialCardIndex={immersiveSwipe.cardIndex}
        onClose={() =>
          setImmersiveSwipe((prev) => ({...prev, isOpen: false}))
        }
        onSelectPost={(p) => setActivePost(p)}
      />

      {/* Article Full-Text Reader Modal */}
      <ArticleReaderModal
        post={activePost}
        allPosts={filteredPosts}
        canEdit={Boolean(user && hasAccessToken)}
        onClose={() => {
          setActivePost(null);
          if (window.location.hash.startsWith('#post=')) {
            history.replaceState(null, '', window.location.pathname + window.location.search);
          }
        }}
        onSelectPost={(p) => setActivePost(p)}
        onEditPost={(p) => {
          setActivePost(null);
          openDrawer('editor', p);
        }}
        onOpenFullEmbed={(url, title) => {
          setActivePost(null);
          setInteractiveStage({
            isOpen: true,
            url,
            title,
            initialTab: 'map',
          });
        }}
      />

      {/* Full-Viewport Interactive HTML Stage Modal */}
      <InteractiveEmbedModal
        isOpen={interactiveStage.isOpen}
        url={interactiveStage.url}
        title={interactiveStage.title}
        initialTab={interactiveStage.initialTab}
        onClose={() =>
          setInteractiveStage((prev) => ({...prev, isOpen: false}))
        }
      />

      {/* Google Sheets CMS & Architecture Drawer */}
      <SheetsCmsDrawer
        isOpen={isDrawerOpen}
        initialTab={drawerInitialTab}
        editingPost={editingPost}
        onClose={() => setIsDrawerOpen(false)}
        user={user}
        hasAccessToken={hasAccessToken}
        isSigningIn={isSigningIn}
        onSignIn={handleSignIn}
        onSignOut={handleSignOut}
        dataSourceMode={dataSourceMode}
        sheetMeta={sheetMeta}
        publicSheetId={publicSheetId}
        isSyncing={isSyncing}
        syncError={syncError}
        posts={posts}
        onCreateNewSheet={handleCreateNewSheet}
        onConnectSheetApi={handleConnectSheetApi}
        onConnectPublicSheet={loadPublicSheet}
        onSwitchSheetTab={handleSwitchSheetTab}
        onRefreshSync={handleRefreshSync}
        onResetToSeed={() => {
          setPosts(SEED_POSTS);
          setSheetMeta(null);
          setDataSourceMode('seed');
          setSyncError(null);
        }}
        onSavePost={handleSavePost}
        onDeletePost={handleDeletePost}
        onImportJsonPosts={(imported) => {
          setPosts(imported);
          setDataSourceMode('local-json');
          setSheetMeta(null);
        }}
        onBatchImportPosts={handleBatchImportPosts}
        siteSettings={siteSettings}
        onSaveSiteSettings={handleSaveSiteSettings}
        onSyncSettingsToSheet={handleSyncSettingsToSheet}
        onPublishDefaultSpreadsheet={handlePublishDefaultSpreadsheet}
      />

      {/* Mandatory Explicit Confirmation Dialog for Mutating / Destructive Operations */}
      <ConfirmActionModal
        state={confirmState}
        onClose={() => setConfirmState(null)}
      />
    </div>
  );
}
