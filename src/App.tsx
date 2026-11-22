/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {User} from 'firebase/auth';
import {
  AlertTriangle,
  ArrowUpRight,
  BellRing,
  BookOpen,
  CalendarCheck,
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  Copy,
  Download,
  ExternalLink,
  FileText,
  GalleryHorizontalEnd,
  GraduationCap,
  Layers,
  LayoutGrid,
  List,
  Lock,
  Maximize2,
  MonitorPlay,
  PenTool,
  Pin,
  QrCode,
  RefreshCw,
  Search,
  Sheet,
  ShieldCheck,
  UserCheck,
  X,
} from 'lucide-react';
import QRCode from 'qrcode';
import {ArticleCard} from './components/ArticleCard';
import {ArticleDeckModal} from './components/ArticleDeckModal';
import {ArticleReaderModal} from './components/ArticleReaderModal';
import {ConfirmActionModal} from './components/ConfirmActionModal';
import {FeaturedSpotlight} from './components/FeaturedSpotlight';
import {
  Class403Tab,
  InteractiveEmbedModal,
  InteractiveStageTab,
  XimenScratchTab,
} from './components/InteractiveEmbedModal';
import {MeetingCheckinModal} from './components/MeetingCheckinModal';
import {SchoolAccessModal} from './components/SchoolAccessModal';
import {DrawerTab, SheetsCmsDrawer} from './components/SheetsCmsDrawer';
import {StandaloneParentCheckinPage} from './components/StandaloneParentCheckinPage';
import {TopicSwipeDeckModal} from './components/TopicSwipeDeckModal';
import {TopicSwipeFeed} from './components/TopicSwipeFeed';
import {updateDynamicFavicon} from './utils/dynamicFavicon';
import {
  formatCategoryDisplay,
  groupPostsByTopic,
  isPostLocked,
  normalizeAcademicYear,
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
  checkIsTeacherAdmin,
  getAccessToken,
  googleSignIn,
  initAuth,
  isOwnerAdminEmail,
  isSchoolMemberAuthorized,
  logout,
  schoolGoogleSignIn,
} from './services/googleAuth';
import {
  saveSharedSiteConfig,
  subscribeSharedSiteConfig,
} from './services/firestoreSync';
import {
  buildDirectCheckinUrl,
  getMeetingCheckinCountdown,
  getMeetingCheckinWindowState,
  getUnauthedMeetingNotice,
  MeetingCheckin,
  MeetingSession,
  subscribeMeetings,
  subscribeMyCheckins,
} from './services/meetingCheckinDb';
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
const HIDDEN_OFFICIAL_ASSETS_STORAGE_KEY =
  'pesmath_ximen_hidden_official_assets_v1';

function readLocalHiddenOfficialAssetIds(): string[] {
  try {
    const raw = localStorage.getItem(HIDDEN_OFFICIAL_ASSETS_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed.filter((id): id is string => typeof id === 'string');
    }
  } catch {
    // ignore storage errors
  }
  return [];
}

function MainKnowledgeBaseApp() {
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
  const [isTeacherAdmin, setIsTeacherAdmin] = useState(false);
  const [hasAccessToken, setHasAccessToken] = useState(false);
  const [isSigningIn, setIsSigningIn] = useState(false);
  const [galleryAuthError, setGalleryAuthError] = useState<string | null>(null);
  const [hiddenOfficialAssetIds, setHiddenOfficialAssetIds] = useState<string[]>(
    () => readLocalHiddenOfficialAssetIds(),
  );

  // Filter & View State
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedYear, setSelectedYear] = useState<string>('全部年度');
  const [selectedCategory, setSelectedCategory] = useState<string>('全部分類');
  const [viewMode, setViewMode] = useState<'swipe' | 'grid' | 'list'>('swipe');
  const [includeDrafts, setIncludeDrafts] = useState(false);

  // Modals & Drawers
  const [activePost, setActivePost] = useState<JournalPost | null>(null);
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
    initialTab: InteractiveStageTab;
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
  const [schoolAccessPrompt, setSchoolAccessPrompt] = useState<{
    isOpen: boolean;
    reasonTitle?: string;
    reasonDescription?: string;
  }>({isOpen: false});
  const [meetingCheckinState, setMeetingCheckinState] = useState<{
    isOpen: boolean;
    linkedPostSlug?: string;
    audienceMode?: 'parent' | 'teacher';
    meetingId?: string;
  }>({isOpen: false});
  const [liveTeacherSessions, setLiveTeacherSessions] = useState<
    MeetingSession[]
  >([]);
  const [myTeacherCheckins, setMyTeacherCheckins] = useState<MeetingCheckin[]>(
    [],
  );
  const [meetingQrDataUrls, setMeetingQrDataUrls] = useState<
    Record<string, string>
  >({});
  const [viewingEnlargedQrMeeting, setViewingEnlargedQrMeeting] =
    useState<MeetingSession | null>(null);
  const [copiedTeacherLinkMeetingId, setCopiedTeacherLinkMeetingId] = useState<
    string | null
  >(null);
  const [checkinClockMs, setCheckinClockMs] = useState<number>(() =>
    Date.now(),
  );
  const [siteQrMode, setSiteQrMode] = useState<'closed' | 'modal' | 'pinned'>(
    'closed',
  );
  const [siteQrTargetMode, setSiteQrTargetMode] = useState<'home' | 'current'>(
    'home',
  );
  const [siteQrDataUrl, setSiteQrDataUrl] = useState<string>('');
  const [copiedSiteUrl, setCopiedSiteUrl] = useState(false);
  const [customQrTarget, setCustomQrTarget] = useState<{
    url: string;
    title: string;
  } | null>(null);
  const [deckModalPost, setDeckModalPost] = useState<JournalPost | null>(null);
  const handledQueryStageRef = useRef(false);

  const isSchoolAuthorized = useMemo(
    () => isSchoolMemberAuthorized(user, isTeacherAdmin),
    [user, isTeacherAdmin],
  );
  const lockedCategories = siteSettings.lockedCategories ?? [];
  const lockedNavOptions = siteSettings.lockedNavOptions ?? ['meeting-checkin'];
  const isXimenLocked =
    !isSchoolAuthorized && lockedNavOptions.includes('ximen-stage');
  const isClass403Locked =
    !isSchoolAuthorized && lockedNavOptions.includes('class-403');

  const checkPostLocked = useCallback(
    (post: JournalPost) =>
      isPostLocked(post, lockedCategories, isSchoolAuthorized),
    [lockedCategories, isSchoolAuthorized],
  );

  const openSchoolAccessModal = useCallback(
    (reasonTitle?: string, reasonDescription?: string) => {
      setGalleryAuthError(null);
      setSchoolAccessPrompt({
        isOpen: true,
        reasonTitle,
        reasonDescription,
      });
    },
    [],
  );

  const openXimenStage = useCallback(
    (tab: XimenScratchTab = 'map') => {
      if (isXimenLocked) {
        openSchoolAccessModal(
          '百年西門互動學習網已鎖定',
          '此選項已設定為 @hmes.tp.edu.tw 校內登入後使用，請先登入您的學校 Google 帳號。',
        );
        return;
      }
      setInteractiveStage({
        isOpen: true,
        url: './ximen-scratch.html',
        title: '百年西門 Scratch 舞台秀互動學習網',
        initialTab: tab,
      });
    },
    [isXimenLocked, openSchoolAccessModal],
  );

  const openClass403Stage = useCallback(
    (tab: Class403Tab = 'agenda') => {
      if (isClass403Locked) {
        openSchoolAccessModal(
          '403 班級網站已鎖定',
          '此選項已設定為 @hmes.tp.edu.tw 校內登入後使用，請先登入您的學校 Google 帳號。',
        );
        return;
      }
      setInteractiveStage({
        isOpen: true,
        url: './class-403.html',
        title: '四年 3 班 (403) 班級網站｜Pes Class 115',
        initialTab: tab,
      });
    },
    [isClass403Locked, openSchoolAccessModal],
  );

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

  // Verify whether the signed-in Firebase user is an authorized teacher/admin
  useEffect(() => {
    let active = true;
    if (!user) {
      setIsTeacherAdmin(false);
      return;
    }
    if (user.emailVerified && isOwnerAdminEmail(user.email)) {
      setIsTeacherAdmin(true);
      return;
    }
    void checkIsTeacherAdmin(user).then((result) => {
      if (active) setIsTeacherAdmin(result);
    });
    return () => {
      active = false;
    };
  }, [user]);

  // Detect whether any teacher meeting is open, scheduled, or has a countdown timer
  const hasTimedTeacherSession = useMemo(
    () =>
      liveTeacherSessions.some((m) => {
        if (!m.isOpen) return false;
        return m.checkinEndAtMs !== null || m.checkinStartAtMs !== null;
      }),
    [liveTeacherSessions],
  );

  useEffect(() => {
    setCheckinClockMs(Date.now());
    const intervalMs = hasTimedTeacherSession ? 1000 : 30000;
    const timer = window.setInterval(() => {
      setCheckinClockMs(Date.now());
    }, intervalMs);
    return () => window.clearInterval(timer);
  }, [hasTimedTeacherSession]);

  // Always subscribe to teacher meetings regardless of login state so all teachers receive live notices
  useEffect(() => {
    const unsubTeachers = subscribeMeetings(
      (sessions) => {
        setLiveTeacherSessions(sessions);
      },
      (err) => {
        console.warn('Teacher sessions subscription notice:', err);
      },
    );
    return () => unsubTeachers();
  }, []);

  // Subscribe to personal check-ins only when user is logged in
  useEffect(() => {
    if (!isSchoolAuthorized || !user?.uid) {
      setMyTeacherCheckins([]);
      return;
    }
    const unsubMyCheckins = subscribeMyCheckins(
      user.uid,
      setMyTeacherCheckins,
    );
    return () => unsubMyCheckins();
  }, [isSchoolAuthorized, user?.uid]);

  const activeOpenTeacherSessions = useMemo(
    () =>
      liveTeacherSessions.filter(
        (m) => getMeetingCheckinWindowState(m, checkinClockMs).status === 'open',
      ),
    [liveTeacherSessions, checkinClockMs],
  );

  const checkedTeacherMeetingIds = useMemo(
    () => new Set(myTeacherCheckins.map((item) => item.meetingId)),
    [myTeacherCheckins],
  );

  const uncheckedOpenTeacherSessions = useMemo(
    () =>
      activeOpenTeacherSessions.filter(
        (m) => !checkedTeacherMeetingIds.has(m.id),
      ),
    [activeOpenTeacherSessions, checkedTeacherMeetingIds],
  );

  const checkedOpenTeacherSessions = useMemo(
    () =>
      activeOpenTeacherSessions.filter((m) =>
        checkedTeacherMeetingIds.has(m.id),
      ),
    [activeOpenTeacherSessions, checkedTeacherMeetingIds],
  );

  // Compute notice bar for unauthenticated visitors (active open meeting or upcoming meeting starting within 1 day)
  const unauthedNotice = useMemo(() => {
    if (isSchoolAuthorized) return null;
    return getUnauthedMeetingNotice(liveTeacherSessions, checkinClockMs);
  }, [isSchoolAuthorized, liveTeacherSessions, checkinClockMs]);

  // Automatically generate QR codes for active and upcoming notice meetings
  useEffect(() => {
    const targetSessions = [...activeOpenTeacherSessions];
    if (
      unauthedNotice?.meeting &&
      !targetSessions.some((m) => m.id === unauthedNotice.meeting.id)
    ) {
      targetSessions.push(unauthedNotice.meeting);
    }
    if (targetSessions.length === 0) return;
    targetSessions.forEach((session) => {
      if (meetingQrDataUrls[session.id]) return;
      const directUrl = buildDirectCheckinUrl('teacher', session.id);
      void QRCode.toDataURL(directUrl, {
        margin: 1,
        width: 220,
        errorCorrectionLevel: 'M',
        color: {dark: '#1E3A8A', light: '#FFFFFF'},
      })
        .then((dataUrl) => {
          setMeetingQrDataUrls((prev) => ({...prev, [session.id]: dataUrl}));
        })
        .catch((err) => {
          console.error('Failed to generate teacher meeting QR code:', err);
        });
    });
  }, [activeOpenTeacherSessions, unauthedNotice?.meeting, meetingQrDataUrls]);

  const handleCopyTeacherLink = useCallback((meetingId: string) => {
    const url = buildDirectCheckinUrl('teacher', meetingId);
    void navigator.clipboard.writeText(url).then(() => {
      setCopiedTeacherLinkMeetingId(meetingId);
      setTimeout(() => {
        setCopiedTeacherLinkMeetingId(null);
      }, 2500);
    });
  }, []);

  const siteShareUrls = useMemo(() => {
    if (typeof window === 'undefined') {
      return {homeUrl: '', currentUrl: '', hasDistinctCurrent: false};
    }
    const homeUrl = `${window.location.origin}${window.location.pathname}`;
    const currentUrl = customQrTarget?.url
      ? customQrTarget.url
      : activePost
        ? `${window.location.origin}${window.location.pathname}${window.location.search}#post=${encodeURIComponent(activePost.slug)}`
        : interactiveStage.isOpen && interactiveStage.url
          ? new URL(interactiveStage.url, window.location.href).toString()
          : window.location.href;
    const hasDistinctCurrent =
      Boolean(customQrTarget?.url) ||
      Boolean(activePost) ||
      interactiveStage.isOpen ||
      (currentUrl !== homeUrl && currentUrl !== `${homeUrl}#top`);
    return {homeUrl, currentUrl, hasDistinctCurrent};
  }, [activePost, interactiveStage.isOpen, interactiveStage.url, siteQrMode, customQrTarget]);

  const activeSiteShareUrl =
    siteQrTargetMode === 'current' && siteShareUrls.hasDistinctCurrent
      ? siteShareUrls.currentUrl
      : siteShareUrls.homeUrl;

  useEffect(() => {
    if (siteQrMode !== 'modal') return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setSiteQrMode('closed');
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [siteQrMode]);

  useEffect(() => {
    if (siteQrMode === 'closed' || !activeSiteShareUrl) return;
    let cancelled = false;
    void QRCode.toDataURL(activeSiteShareUrl, {
      margin: 2,
      width: 360,
      errorCorrectionLevel: 'M',
      color: {dark: '#1E3A8A', light: '#FFFFFF'},
    })
      .then((dataUrl) => {
        if (!cancelled) {
          setSiteQrDataUrl(dataUrl);
        }
      })
      .catch((err) => {
        console.error('Failed to generate site QR code:', err);
      });
    return () => {
      cancelled = true;
    };
  }, [siteQrMode, activeSiteShareUrl]);

  const handleCopySiteUrl = useCallback(() => {
    if (!activeSiteShareUrl) return;
    void navigator.clipboard.writeText(activeSiteShareUrl).then(() => {
      setCopiedSiteUrl(true);
      setTimeout(() => {
        setCopiedSiteUrl(false);
      }, 2200);
    });
  }, [activeSiteShareUrl]);

  const handleDownloadSiteQr = useCallback(() => {
    if (!siteQrDataUrl) return;
    const link = document.createElement('a');
    link.href = siteQrDataUrl;
    link.download =
      siteQrTargetMode === 'current' && activePost
        ? `${activePost.slug}-qrcode.png`
        : 'pesmath-qrcode.png';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }, [siteQrDataUrl, siteQrTargetMode, activePost]);

  const applyRemoteSettingsIfEnabled = useCallback(
    (remote: Partial<SiteSettings> | null, fallbackSpreadsheetTitle?: string) => {
      setSiteSettings((prev) => {
        if (!prev.autoTitleFromSheet) return prev;
        if (remote) {
          const remoteHeading = (remote.heroHeading ?? '').trim();
          const isLegacyHeading =
            remoteHeading.toLowerCase() === 'math knowledge';
          const remoteDesc = (remote.heroDescription ?? '').trim();
          const isLegacyDesc =
            remoteDesc.startsWith('彙整pes數學教育上的106-115學年度領域會議紀錄') ||
            remoteDesc.startsWith('彙整歷學年度領域會議紀錄');
          return {
            ...prev,
            ...remote,
            ...(isLegacyHeading
              ? {heroHeading: INITIAL_SITE_SETTINGS.heroHeading}
              : {}),
            ...(isLegacyDesc
              ? {heroDescription: INITIAL_SITE_SETTINGS.heroDescription}
              : {}),
          };
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
    if (!handledQueryStageRef.current) {
      handledQueryStageRef.current = true;
      const ximenParam = params.get('ximen');
      const class403Param = params.get('class403');
      const checkinParam = params.get('checkin');
      const meetingParam = params.get('meeting');
      if (
        ximenParam === 'map' ||
        ximenParam === 'gallery' ||
        ximenParam === 'blocks' ||
        ximenParam === 'naming'
      ) {
        openXimenStage(ximenParam);
      } else if (
        class403Param === 'agenda' ||
        class403Param === 'news' ||
        class403Param === 'resources' ||
        class403Param === 'contact' ||
        class403Param === 'comments'
      ) {
        openClass403Stage(class403Param);
      } else if (checkinParam === 'teacher' || meetingParam) {
        setMeetingCheckinState({
          isOpen: true,
          audienceMode: 'teacher',
          meetingId: meetingParam || undefined,
        });
      }
    }

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
  }, [loadPublicSheet, openXimenStage, openClass403Stage]);

  // Real-time Firestore listener so edits on either AI Studio or GitHub Pages sync immediately
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const sheetParam = params.get('sheet');

    const unsubscribe = subscribeSharedSiteConfig(
      (cloudCfg) => {
        if (!cloudCfg) return;

        const cloudHeading = (cloudCfg.heroHeading ?? '').trim();
        const cloudDesc = (cloudCfg.heroDescription ?? '').trim();
        const isLegacyCloudHeading =
          !cloudHeading || cloudHeading.toLowerCase() === 'math knowledge';
        const isLegacyCloudDesc =
          !cloudDesc ||
          cloudDesc.startsWith('彙整pes數學教育上的106-115學年度領域會議紀錄') ||
          cloudDesc.startsWith('彙整歷學年度領域會議紀錄');

        setSiteSettings({
          siteTitle: cloudCfg.siteTitle,
          siteSubtitle: cloudCfg.siteSubtitle,
          heroHeading: isLegacyCloudHeading
            ? INITIAL_SITE_SETTINGS.heroHeading
            : cloudCfg.heroHeading,
          heroDescription: isLegacyCloudDesc
            ? INITIAL_SITE_SETTINGS.heroDescription
            : cloudCfg.heroDescription,
          autoDynamicTitle: cloudCfg.autoDynamicTitle,
          autoTitleFromSheet: cloudCfg.autoTitleFromSheet,
          lockedCategories: cloudCfg.lockedCategories ?? [],
          lockedNavOptions: cloudCfg.lockedNavOptions ?? ['meeting-checkin'],
        });

        if (cloudCfg.hiddenOfficialAssetIds !== undefined) {
          setHiddenOfficialAssetIds(cloudCfg.hiddenOfficialAssetIds);
          try {
            localStorage.setItem(
              HIDDEN_OFFICIAL_ASSETS_STORAGE_KEY,
              JSON.stringify(cloudCfg.hiddenOfficialAssetIds),
            );
          } catch {
            // ignore storage errors
          }
        }

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
        if (activePost.summary && !checkPostLocked(activePost)) {
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

  useEffect(() => {
    const bar = categoryBarRef.current;
    if (!bar) return;
    const activeEl = bar.querySelector('[data-active="true"]') as HTMLElement | null;
    if (!activeEl) return;
    const targetLeft =
      activeEl.offsetLeft - (bar.clientWidth - activeEl.offsetWidth) / 2;
    bar.scrollTo({
      left: Math.max(0, targetLeft),
      behavior: 'smooth',
    });
  }, [selectedCategory]);

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
      if (!includeDrafts && p.status === 'Draft') return;
      const norm = normalizeAcademicYear(p.academicYear);
      if (norm) set.add(norm);
    });
    const sorted = Array.from(set).sort((a, b) => {
      const na = parseInt(a.match(/\d+/)?.[0] || '0', 10);
      const nb = parseInt(b.match(/\d+/)?.[0] || '0', 10);
      return nb - na || b.localeCompare(a);
    });
    return ['全部年度', ...sorted];
  }, [posts, includeDrafts]);

  const availableCategories = useMemo(() => {
    const set = new Set<string>();
    posts.forEach((p) => {
      if (!includeDrafts && p.status === 'Draft') return;
      parseCategories(p.category).forEach((cat) => set.add(cat));
    });
    return ['全部分類', ...Array.from(set)];
  }, [posts, includeDrafts]);

  const filteredPosts = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return posts
      .filter((p) => {
        if (!includeDrafts && p.status === 'Draft') return false;
        if (
          selectedYear !== '全部年度' &&
          normalizeAcademicYear(p.academicYear) !== selectedYear
        ) {
          return false;
        }
        if (
          selectedCategory !== '全部分類' &&
          !parseCategories(p.category).includes(selectedCategory)
        ) {
          return false;
        }
        if (q) {
          const locked = checkPostLocked(p);
          const haystack = (
            locked
              ? [p.title, p.author, p.category, p.academicYear]
              : [
                  p.title,
                  p.summary,
                  p.content,
                  p.author,
                  p.category,
                  p.academicYear,
                ]
          )
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
  }, [
    posts,
    includeDrafts,
    selectedYear,
    selectedCategory,
    searchQuery,
    checkPostLocked,
  ]);

  const featuredSpotlightPosts = useMemo(() => {
    const published = posts.filter((p) => p.status !== 'Draft');
    const flagged = published.filter((p) => p.isFeatured);
    const pool = flagged.length > 0 ? flagged : published.length > 0 ? published : posts;
    return pool.slice(0, 4);
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
      if (
        selectedYear !== '全部年度' &&
        normalizeAcademicYear(p.academicYear) !== selectedYear
      ) {
        continue;
      }
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
      const norm = normalizeAcademicYear(p.academicYear);
      if (norm) {
        counts.set(norm, (counts.get(norm) ?? 0) + 1);
      }
    }
    counts.set('全部年度', total);
    return counts;
  }, [posts, includeDrafts]);

  // Auth handlers
  const handleSignIn = async () => {
    setIsSigningIn(true);
    setSyncError(null);
    setGalleryAuthError(null);
    try {
      const result = await googleSignIn();
      if (result) {
        setUser(result.user);
        setHasAccessToken(true);
        const teacherVerified = await checkIsTeacherAdmin(result.user);
        setIsTeacherAdmin(teacherVerified);
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
      const formatted =
        rawMsg.includes('access_denied') ||
        code === 'auth/popup-closed-by-user' ||
        code === 'auth/cancelled-popup-request'
          ? `Google 登入未完成（${code || 'access_denied'}）。若看到「應用程式目前處於測試階段 / 錯誤 403：access_denied」，請至 Google Cloud Console（專案 ${firebaseConfig.projectId}）的 OAuth 同意畫面 → 目標對象（Audience）→ 測試人員（Test users）加入您的 Gmail 帳號後重試。`
          : rawMsg || 'Google 登入授權失敗，請再試一次。';
      setSyncError(formatted);
      setGalleryAuthError(formatted);
    } finally {
      setIsSigningIn(false);
    }
  };

  const handleSchoolSignIn = async () => {
    setIsSigningIn(true);
    setGalleryAuthError(null);
    try {
      const authedMember = await schoolGoogleSignIn();
      setUser(authedMember);
      setHasAccessToken(false);
      const teacherVerified = await checkIsTeacherAdmin(authedMember);
      setIsTeacherAdmin(teacherVerified);
      setSchoolAccessPrompt((prev) =>
        prev.isOpen ? {...prev, isOpen: false} : prev,
      );
    } catch (err: any) {
      const rawMsg = err?.message || '';
      const code = err?.code || '';
      if (
        rawMsg.includes('access_denied') ||
        code === 'auth/popup-closed-by-user' ||
        code === 'auth/cancelled-popup-request'
      ) {
        setGalleryAuthError(
          `學校帳號登入未完成（${code || 'access_denied'}）。若顯示 403 access_denied，請確認您選用的是 @hmes.tp.edu.tw 帳號，或請管理老師至 Google Cloud Console 確認 OAuth 發布狀態。`,
        );
      } else {
        setGalleryAuthError(
          rawMsg || '學校網域帳號登入失敗，請使用 @hmes.tp.edu.tw 帳號重試。',
        );
      }
    } finally {
      setIsSigningIn(false);
    }
  };

  const handleStudentSignIn = handleSchoolSignIn;

  const handleSignOut = async () => {
    await logout();
    setUser(null);
    setIsTeacherAdmin(false);
    setHasAccessToken(false);
    setGalleryAuthError(null);
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
          hiddenOfficialAssetIds,
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
          hiddenOfficialAssetIds,
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
          void saveSiteConfig({
            spreadsheetId: sheetMeta.spreadsheetId,
            tabName: sheetMeta.activeTab,
            ...nextSettings,
          });
          if (auth.currentUser) {
            try {
              await saveSharedSiteConfig({
                spreadsheetId: sheetMeta.spreadsheetId,
                tabName: sheetMeta.activeTab,
                ...nextSettings,
                hiddenOfficialAssetIds,
              });
            } catch (cloudErr: any) {
              console.warn('Firestore 雲端設定同步略過：', cloudErr);
            }
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
    <div className="min-h-screen flex flex-col bg-[#FBF9F5] text-[#1C1917] overflow-x-clip">
      {/* Responsive Navigation Bar (Single-row on lg+, 2-row compact on mobile/tablet) */}
      <header className="sticky top-0 z-30 bg-[#FBF9F5]/95 backdrop-blur-sm border-b border-stone-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <div className="h-14 lg:h-16 flex items-center justify-between gap-3 min-w-0">
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
              className="font-editorial text-base sm:text-xl font-bold tracking-tight text-stone-950 truncate min-w-0"
            >
              {siteSettings.siteTitle}
            </a>

            {/* Zone 2: Desktop Single-line Text Nav Links */}
            <nav className="hidden lg:flex items-center gap-1.5 text-sm font-medium text-stone-600 shrink-0">
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
                className={`px-2.5 py-1.5 rounded-lg inline-flex items-center gap-1.5 hover:bg-[#1E3A8A]/8 hover:text-[#1E3A8A] active:scale-[0.97] transition-all whitespace-nowrap shrink-0 ${
                  immersiveSwipe.isOpen
                    ? 'text-[#1E3A8A] bg-[#1E3A8A]/8 font-semibold'
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
                className="px-2.5 py-1.5 rounded-lg hover:bg-stone-200/60 hover:text-stone-950 active:scale-[0.97] transition-all whitespace-nowrap shrink-0"
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
                className="px-2.5 py-1.5 rounded-lg hover:bg-stone-200/60 hover:text-stone-950 active:scale-[0.97] transition-all whitespace-nowrap shrink-0"
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
                className="px-2.5 py-1.5 rounded-lg hover:bg-stone-200/60 hover:text-stone-950 active:scale-[0.97] transition-all whitespace-nowrap shrink-0"
              >
                學力檢測
              </button>
              <button
                type="button"
                onClick={() => openXimenStage('map')}
                className={`px-2.5 py-1.5 rounded-lg inline-flex items-center gap-1 hover:bg-[#1E3A8A]/8 hover:text-[#1E3A8A] active:scale-[0.97] transition-all whitespace-nowrap shrink-0 ${
                  interactiveStage.isOpen &&
                  interactiveStage.url.includes('ximen-scratch.html')
                    ? 'text-[#1E3A8A] bg-[#1E3A8A]/8 font-semibold'
                    : ''
                }`}
              >
                {isXimenLocked && <Lock className="w-3 h-3 text-amber-700" />}
                <span>互動專題</span>
              </button>
              <button
                type="button"
                onClick={() => openClass403Stage('agenda')}
                className={`px-2.5 py-1.5 rounded-lg inline-flex items-center gap-1.5 hover:bg-[#1E3A8A]/8 hover:text-[#1E3A8A] active:scale-[0.97] transition-all whitespace-nowrap shrink-0 ${
                  interactiveStage.isOpen &&
                  interactiveStage.url.includes('class-403.html')
                    ? 'text-[#1E3A8A] bg-[#1E3A8A]/8 font-semibold'
                    : 'text-stone-700'
                }`}
              >
                {isClass403Locked ? (
                  <Lock className="w-3.5 h-3.5 text-amber-700" />
                ) : (
                  <GraduationCap className="w-3.5 h-3.5 text-[#1E3A8A]" />
                )}
                <span>403 班級網站</span>
              </button>
            </nav>

            {/* Zone 3: Primary Account / Admin CTA + Site QR */}
            <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
              <button
                type="button"
                onClick={() => {
                  setCustomQrTarget(null);
                  setSiteQrMode((prev) =>
                    prev === 'modal' ? 'closed' : 'modal',
                  );
                }}
                title="顯示本網頁 QR Code，方便現場簡報時聽眾掃碼進入"
                aria-label="顯示本網頁 QR Code"
                className={`px-2 sm:px-2.5 py-1.5 text-xs font-medium rounded-lg border inline-flex items-center gap-1.5 transition-all whitespace-nowrap shrink-0 ${
                  siteQrMode !== 'closed'
                    ? 'bg-[#1E3A8A] text-white border-[#1E3A8A] shadow-xs'
                    : 'bg-white text-stone-700 border-stone-300 hover:border-[#1E3A8A]/50 hover:text-[#1E3A8A] hover:bg-[#F7F4EE]'
                }`}
              >
                <QrCode className="w-3.5 h-3.5 shrink-0" />
                <span className="hidden sm:inline">網頁 QR</span>
              </button>
              {user && hasAccessToken ? (
                <div className="flex items-center gap-1.5 sm:gap-2">
                  {isTeacherAdmin && (
                    <button
                      type="button"
                      onClick={() =>
                        setMeetingCheckinState({
                          isOpen: true,
                          audienceMode: 'teacher',
                        })
                      }
                      className="px-2.5 sm:px-3 py-1.5 text-xs font-medium text-[#1E3A8A] bg-[#1E3A8A]/8 border border-[#1E3A8A]/25 rounded-lg hover:bg-[#1E3A8A] hover:text-white inline-flex items-center gap-1.5 transition-all whitespace-nowrap shrink-0"
                    >
                      <CalendarCheck className="w-3.5 h-3.5 shrink-0" />
                      <span className="hidden sm:inline">會議／QR管理</span>
                      <span className="sm:hidden">會議</span>
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => openDrawer('editor')}
                    className="px-3 sm:px-3.5 py-1.5 text-xs font-medium text-white bg-[#1E3A8A] rounded-lg hover:bg-[#172554] hover:shadow-sm active:scale-[0.97] transition-all whitespace-nowrap shrink-0"
                  >
                    管理後台
                  </button>
                  <button
                    type="button"
                    onClick={handleSignOut}
                    className="px-2 sm:px-2.5 py-1.5 text-xs font-medium text-stone-600 rounded-lg hover:bg-stone-200/60 hover:text-stone-900 active:scale-[0.97] transition-all whitespace-nowrap shrink-0"
                  >
                    登出
                  </button>
                </div>
              ) : isSchoolAuthorized ? (
                <div className="flex items-center gap-1.5 sm:gap-2">
                  <button
                    type="button"
                    onClick={() => openSchoolAccessModal()}
                    className="px-2.5 sm:px-3 py-1.5 text-xs font-medium text-[#1E3A8A] bg-[#1E3A8A]/8 border border-[#1E3A8A]/25 rounded-lg hover:bg-[#1E3A8A]/12 inline-flex items-center gap-1.5 transition-all whitespace-nowrap shrink-0"
                  >
                    <ShieldCheck className="w-3.5 h-3.5 shrink-0" />
                    <span className="hidden sm:inline">已驗證教師</span>
                    <span className="sm:hidden">已驗證</span>
                  </button>
                  {isTeacherAdmin && (
                    <>
                      <button
                        type="button"
                        onClick={() =>
                          setMeetingCheckinState({
                            isOpen: true,
                            audienceMode: 'teacher',
                          })
                        }
                        className="px-2.5 py-1.5 text-xs font-medium text-[#1E3A8A] bg-white border border-[#1E3A8A]/30 rounded-lg hover:bg-[#1E3A8A]/8 inline-flex items-center gap-1 transition-all whitespace-nowrap shrink-0"
                      >
                        <CalendarCheck className="w-3.5 h-3.5 shrink-0" />
                        <span>會議／QR</span>
                      </button>
                      <button
                        type="button"
                        onClick={handleSignIn}
                        disabled={isSigningIn}
                        className="px-2.5 py-1.5 text-xs font-medium text-white bg-[#1E3A8A] rounded-lg hover:bg-[#172554] transition-all whitespace-nowrap shrink-0"
                      >
                        後台授權
                      </button>
                    </>
                  )}
                  <button
                    type="button"
                    onClick={handleSignOut}
                    className="px-2 py-1.5 text-xs font-medium text-stone-600 rounded-lg hover:bg-stone-200/60 hover:text-stone-900 transition-all whitespace-nowrap shrink-0"
                  >
                    登出
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => openSchoolAccessModal()}
                  disabled={isSigningIn}
                  className="px-3 sm:px-3.5 py-1.5 text-xs font-medium text-stone-700 bg-white border border-stone-300 rounded-lg hover:border-[#1E3A8A]/50 hover:text-[#1E3A8A] hover:bg-[#F7F4EE] hover:shadow-xs active:scale-[0.97] inline-flex items-center gap-1.5 transition-all whitespace-nowrap shrink-0"
                >
                  <Lock className="w-3.5 h-3.5 text-[#1E3A8A]" />
                  <span>{isSigningIn ? '登入中...' : '教師／管理員登入'}</span>
                </button>
              )}
            </div>
          </div>

          {/* Mobile & Tablet Compact Scrollable Quick Nav */}
          <nav
            aria-label="行動版快速導覽"
            className="flex lg:hidden items-center gap-1.5 overflow-x-auto pb-2 pt-1.5 border-t border-stone-200/70 text-xs sm:text-sm font-medium text-stone-600"
          >
            <button
              type="button"
              onClick={() => {
                setSelectedYear('全部年度');
                setSelectedCategory('全部分類');
                setSearchQuery('');
                setViewMode('swipe');
                setImmersiveSwipe({isOpen: true, topicIndex: 0, cardIndex: 0});
              }}
              className={`px-2.5 py-1 rounded-lg inline-flex items-center gap-1 hover:bg-[#1E3A8A]/8 hover:text-[#1E3A8A] active:scale-[0.97] transition-all whitespace-nowrap shrink-0 ${
                immersiveSwipe.isOpen
                  ? 'text-[#1E3A8A] bg-[#1E3A8A]/8 font-semibold'
                  : 'text-stone-800 font-medium'
              }`}
            >
              <GalleryHorizontalEnd className="w-3.5 h-3.5 text-[#1E3A8A]" />
              <span>滑動快覽</span>
            </button>
            <button
              type="button"
              onClick={() => openClass403Stage('agenda')}
              className={`px-2.5 py-1 rounded-lg inline-flex items-center gap-1 hover:bg-[#1E3A8A]/8 hover:text-[#1E3A8A] active:scale-[0.97] transition-all whitespace-nowrap shrink-0 ${
                interactiveStage.isOpen &&
                interactiveStage.url.includes('class-403.html')
                  ? 'text-[#1E3A8A] bg-[#1E3A8A]/8 font-semibold'
                  : 'text-stone-700'
              }`}
            >
              {isClass403Locked ? (
                <Lock className="w-3 h-3 text-amber-700" />
              ) : (
                <GraduationCap className="w-3.5 h-3.5 text-[#1E3A8A]" />
              )}
              <span>403 班網</span>
            </button>
            <button
              type="button"
              onClick={() => openXimenStage('map')}
              className={`px-2.5 py-1 rounded-lg inline-flex items-center gap-1 hover:bg-[#1E3A8A]/8 hover:text-[#1E3A8A] active:scale-[0.97] transition-all whitespace-nowrap shrink-0 ${
                interactiveStage.isOpen &&
                interactiveStage.url.includes('ximen-scratch.html')
                  ? 'text-[#1E3A8A] bg-[#1E3A8A]/8 font-semibold'
                  : ''
              }`}
            >
              {isXimenLocked && <Lock className="w-3 h-3 text-amber-700" />}
              <span>互動專題</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setSelectedCategory('全部分類');
                setViewMode('grid');
                scrollToSection('journal-catalog');
              }}
              className="px-2.5 py-1 rounded-lg hover:bg-stone-200/60 hover:text-stone-950 active:scale-[0.97] transition-all whitespace-nowrap shrink-0"
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
              className="px-2.5 py-1 rounded-lg hover:bg-stone-200/60 hover:text-stone-950 active:scale-[0.97] transition-all whitespace-nowrap shrink-0"
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
              className="px-2.5 py-1 rounded-lg hover:bg-stone-200/60 hover:text-stone-950 active:scale-[0.97] transition-all whitespace-nowrap shrink-0"
            >
              學力檢測
            </button>
          </nav>
        </div>
      </header>

      {/* Unauthenticated Teacher Meeting Notice Banner: ONLY rendered when NOT logged in to remind teachers of active or upcoming meetings (starts 1 day ahead) */}
      {!isSchoolAuthorized && unauthedNotice && (
        <aside
          aria-label="校內會議簽到快訊"
          className={`border-b transition-colors px-4 sm:px-6 py-2.5 sm:py-3 shadow-2xs ${
            unauthedNotice.status === 'urgent'
              ? 'bg-red-600 text-white border-red-700'
              : unauthedNotice.status === 'open'
                ? 'bg-[#1E3A8A] text-white border-[#172554]'
                : 'bg-amber-50 text-amber-950 border-amber-200'
          }`}
        >
          <div className="max-w-7xl mx-auto flex flex-col md:flex-row md:items-center justify-between gap-3 text-xs sm:text-sm">
            <div className="flex items-start sm:items-center gap-2.5 min-w-0">
              <div
                className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${
                  unauthedNotice.status === 'urgent'
                    ? 'bg-white text-red-600'
                    : unauthedNotice.status === 'open'
                      ? 'bg-white text-[#1E3A8A]'
                      : 'bg-amber-200 text-amber-900'
                }`}
              >
                {unauthedNotice.status === 'urgent' ? (
                  <AlertTriangle className="w-4 h-4" />
                ) : unauthedNotice.status === 'open' ? (
                  <CalendarCheck className="w-4 h-4" />
                ) : (
                  <Clock className="w-4 h-4" />
                )}
              </div>

              <div className="space-y-0.5 min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span
                    className={`text-[11px] font-bold px-2 py-0.5 rounded ${
                      unauthedNotice.status === 'urgent'
                        ? 'bg-white text-red-700'
                        : unauthedNotice.status === 'open'
                          ? 'bg-white/20 text-white'
                          : 'bg-amber-200/90 text-amber-950'
                    }`}
                  >
                    {unauthedNotice.badgeLabel}
                  </span>
                  <span className="font-editorial text-sm sm:text-base font-bold break-words">
                    {unauthedNotice.meeting.title}
                  </span>
                </div>

                <div
                  className={`flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs ${
                    unauthedNotice.status === 'urgent' ||
                    unauthedNotice.status === 'open'
                      ? 'text-white/90'
                      : 'text-amber-800'
                  }`}
                >
                  <span>{unauthedNotice.detailText}</span>
                  {unauthedNotice.meeting.location && (
                    <>
                      <span aria-hidden="true" className="opacity-60">
                        ·
                      </span>
                      <span>地點：{unauthedNotice.meeting.location}</span>
                    </>
                  )}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0 self-end md:self-auto pt-1 md:pt-0">
              <button
                type="button"
                onClick={() =>
                  setViewingEnlargedQrMeeting(unauthedNotice.meeting)
                }
                className={`px-3 py-1.5 text-xs font-semibold rounded-lg inline-flex items-center gap-1.5 transition-all whitespace-nowrap ${
                  unauthedNotice.status === 'urgent' ||
                  unauthedNotice.status === 'open'
                    ? 'bg-white/15 hover:bg-white/25 text-white border border-white/30'
                    : 'bg-white hover:bg-amber-100/60 text-amber-900 border border-amber-300'
                }`}
              >
                <QrCode className="w-3.5 h-3.5" />
                <span>手機掃碼 QR</span>
              </button>

              {unauthedNotice.isUpcomingNotStarted ? (
                <button
                  type="button"
                  onClick={() =>
                    openSchoolAccessModal(
                      '明日／即將召開會議預告',
                      `「${unauthedNotice.meeting.title}」目前尚未開放簽到，將於預定時間開放。校內教師可先登入 @hmes.tp.edu.tw 帳號備妥。`,
                    )
                  }
                  className="px-3.5 py-1.5 text-xs font-bold text-amber-950 bg-amber-200 hover:bg-amber-300 rounded-lg inline-flex items-center gap-1.5 transition-all whitespace-nowrap shadow-2xs"
                >
                  <Lock className="w-3.5 h-3.5" />
                  <span>預先登入帳號</span>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() =>
                    openSchoolAccessModal(
                      '教師社群會議簽到',
                      `目前正開放「${unauthedNotice.meeting.title}」線上親筆簽名，請先以學校 Google 帳號 (@hmes.tp.edu.tw) 登入完成簽到。`,
                    )
                  }
                  className={`px-3.5 py-1.5 text-xs font-bold rounded-lg inline-flex items-center gap-1.5 transition-all whitespace-nowrap shadow-2xs ${
                    unauthedNotice.status === 'urgent'
                      ? 'bg-white text-red-600 hover:bg-stone-100'
                      : 'bg-white text-[#1E3A8A] hover:bg-stone-100'
                  }`}
                >
                  <Lock className="w-3.5 h-3.5" />
                  <span>登入 @hmes 簽名</span>
                </button>
              )}
            </div>
          </div>
        </aside>
      )}

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
        {/* Top Priority Teacher Meeting Check-In Notification Card (First card inside Knowledge Base when logged in & open) */}
        {isSchoolAuthorized && activeOpenTeacherSessions.length > 0 && (
          <section
            aria-label="教師社群會議簽名通知"
            className="bg-[#FBF9F5] border-b border-stone-200 px-4 sm:px-6 pt-4 pb-4"
          >
            <div className="max-w-7xl mx-auto">
              {uncheckedOpenTeacherSessions.length > 0
                ? (() => {
                    const targetMeeting = uncheckedOpenTeacherSessions[0];
                    const countdown = getMeetingCheckinCountdown(
                      targetMeeting,
                      checkinClockMs,
                    );
                    const isUrgent = Boolean(countdown?.isUrgent);

                    return (
                      <div
                        className={`bg-white border-2 rounded-2xl p-4 sm:p-5 shadow-sm flex flex-col lg:flex-row lg:items-center justify-between gap-4 sm:gap-6 ${
                          isUrgent ? 'border-red-600' : 'border-[#1E3A8A]'
                        }`}
                      >
                        <div className="flex items-start gap-3.5 min-w-0 flex-1">
                          <div
                            className={`w-11 h-11 rounded-xl text-white flex items-center justify-center shrink-0 ${
                              isUrgent ? 'bg-red-600' : 'bg-[#1E3A8A]'
                            }`}
                          >
                            {isUrgent ? (
                              <AlertTriangle className="w-5 h-5" />
                            ) : (
                              <BellRing className="w-5 h-5" />
                            )}
                          </div>
                          <div className="space-y-1 min-w-0">
                            <div className="flex flex-wrap items-center gap-2 text-xs">
                              <span
                                className={`px-2 py-0.5 rounded-md text-white font-semibold whitespace-nowrap ${
                                  isUrgent ? 'bg-red-600' : 'bg-[#1E3A8A]'
                                }`}
                              >
                                {isUrgent
                                  ? '簽到即將截止 · 尚未簽到'
                                  : '會議簽名通知 · 尚未簽到'}
                              </span>
                              <span
                                className={`font-medium ${
                                  isUrgent
                                    ? 'text-red-600 font-semibold'
                                    : 'text-[#1E3A8A]'
                                }`}
                              >
                                目前有 {uncheckedOpenTeacherSessions.length}{' '}
                                場會議開放手寫簽名
                              </span>
                            </div>
                            <h2 className="font-editorial text-lg sm:text-xl font-bold text-stone-950 break-words">
                              {targetMeeting.title}
                            </h2>
                            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-stone-600">
                              <span className="font-mono-tabular font-medium text-stone-700">
                                {targetMeeting.meetingDate}
                              </span>
                              {targetMeeting.location && (
                                <span>地點：{targetMeeting.location}</span>
                              )}
                              {targetMeeting.checkinEndAtMs !== null && (
                                <span className="inline-flex items-center gap-1 text-stone-700 font-medium">
                                  <Clock className="w-3.5 h-3.5 shrink-0 text-stone-500" />
                                  <span>
                                    簽名截止：
                                    {new Date(
                                      targetMeeting.checkinEndAtMs,
                                    ).toLocaleString('zh-TW', {
                                      month: '2-digit',
                                      day: '2-digit',
                                      hour: '2-digit',
                                      minute: '2-digit',
                                      hour12: false,
                                    })}
                                  </span>
                                </span>
                              )}
                            </div>

                            {countdown && (
                              <div
                                className={`pt-0.5 flex flex-wrap items-center gap-1.5 font-mono-tabular ${
                                  countdown.isUrgent
                                    ? 'text-sm sm:text-base font-bold text-red-600'
                                    : 'text-xs sm:text-sm font-semibold text-[#1E3A8A]'
                                }`}
                              >
                                {countdown.isUrgent ? (
                                  <AlertTriangle className="w-4 h-4 shrink-0 text-red-600" />
                                ) : (
                                  <Clock className="w-3.5 h-3.5 shrink-0 text-[#1E3A8A]" />
                                )}
                                <span>
                                  倒數計時：{countdown.formattedText}
                                  {countdown.isUrgent
                                    ? '（簽到即將結束，請盡速簽名！）'
                                    : ''}
                                </span>
                              </div>
                            )}
                          </div>
                        </div>

                        {/* Inline Phone Scan QR Code Box + Primary CTA */}
                        <div className="flex flex-col sm:flex-row lg:flex-row items-stretch sm:items-center gap-3 shrink-0">
                          <div className="bg-[#F8FAFC] border border-stone-200 rounded-xl p-2.5 flex items-center gap-3">
                            <div className="w-18 h-18 sm:w-20 sm:h-20 bg-white border border-stone-200 rounded-lg p-1 flex items-center justify-center shrink-0 shadow-2xs">
                              {meetingQrDataUrls[targetMeeting.id] ? (
                                <img
                                  src={meetingQrDataUrls[targetMeeting.id]}
                                  alt={`${targetMeeting.title} 手機簽到 QR Code`}
                                  className="w-full h-full object-contain"
                                />
                              ) : (
                                <span className="text-[10px] text-stone-400">
                                  QR 產生中
                                </span>
                              )}
                            </div>
                            <div className="space-y-1 text-left min-w-[110px]">
                              <div className="text-xs font-semibold text-[#1E3A8A] flex items-center gap-1">
                                <QrCode className="w-3.5 h-3.5 shrink-0" />
                                <span>手機掃碼簽名</span>
                              </div>
                              <p className="text-[11px] text-stone-500 leading-tight">
                                相機對準即可在手機親筆簽名
                              </p>
                              <div className="flex items-center gap-2 pt-0.5">
                                <button
                                  type="button"
                                  onClick={() =>
                                    setViewingEnlargedQrMeeting(targetMeeting)
                                  }
                                  className="text-[11px] font-semibold text-[#1E3A8A] hover:underline"
                                >
                                  點擊放大
                                </button>
                                <span className="text-stone-300">·</span>
                                <button
                                  type="button"
                                  onClick={() =>
                                    handleCopyTeacherLink(targetMeeting.id)
                                  }
                                  className="text-[11px] font-medium text-stone-600 hover:text-stone-900"
                                >
                                  {copiedTeacherLinkMeetingId ===
                                  targetMeeting.id
                                    ? '已複製！'
                                    : '複製網址'}
                                </button>
                              </div>
                            </div>
                          </div>

                          <button
                            type="button"
                            onClick={() =>
                              setMeetingCheckinState({
                                isOpen: true,
                                audienceMode: 'teacher',
                                meetingId: targetMeeting.id,
                              })
                            }
                            className={`min-h-[46px] px-5 py-2.5 text-sm font-semibold text-white rounded-xl active:scale-[0.98] inline-flex items-center justify-center gap-2 transition-all shadow-xs whitespace-nowrap shrink-0 ${
                              isUrgent
                                ? 'bg-red-600 hover:bg-red-700'
                                : 'bg-[#1E3A8A] hover:bg-[#172554]'
                            }`}
                          >
                            <PenTool className="w-4 h-4 shrink-0" />
                            <span>立即手寫簽名簽到</span>
                          </button>
                        </div>
                      </div>
                    );
                  })()
                : (() => {
                    const signedMeeting = checkedOpenTeacherSessions[0];
                    const countdown = getMeetingCheckinCountdown(
                      signedMeeting,
                      checkinClockMs,
                    );
                    const isUrgent = Boolean(countdown?.isUrgent);

                    return (
                      <div className="bg-emerald-50/80 border border-emerald-200 rounded-2xl p-4 sm:p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                        <div className="flex items-start sm:items-center gap-3 min-w-0 flex-1">
                          <div className="w-10 h-10 rounded-xl bg-emerald-700 text-white flex items-center justify-center shrink-0">
                            <CheckCircle2 className="w-5 h-5" />
                          </div>
                          <div className="space-y-0.5 min-w-0">
                            <div className="text-xs font-semibold text-emerald-900">
                              本日開放會議已完成簽到（共{' '}
                              {checkedOpenTeacherSessions.length} 場）
                            </div>
                            <div className="font-editorial text-base sm:text-lg font-bold text-stone-950 truncate">
                              {signedMeeting.title}
                            </div>
                            {countdown && (
                              <div
                                className={`flex flex-wrap items-center gap-1.5 text-xs font-mono-tabular ${
                                  isUrgent
                                    ? 'font-bold text-red-600'
                                    : 'font-medium text-emerald-900'
                                }`}
                              >
                                {isUrgent ? (
                                  <AlertTriangle className="w-3.5 h-3.5 shrink-0 text-red-600" />
                                ) : (
                                  <Clock className="w-3.5 h-3.5 shrink-0 text-emerald-700" />
                                )}
                                <span>
                                  簽到結束倒數：{countdown.formattedText}
                                  {isUrgent ? '（即將截止修改）' : ''}
                                </span>
                              </div>
                            )}
                          </div>
                        </div>

                        <div className="flex flex-wrap items-center gap-2 shrink-0">
                          <button
                            type="button"
                            onClick={() =>
                              setViewingEnlargedQrMeeting(signedMeeting)
                            }
                            className="min-h-[38px] px-3.5 py-2 text-xs font-semibold text-[#1E3A8A] bg-white border border-[#1E3A8A]/30 rounded-xl hover:bg-[#1E3A8A]/8 inline-flex items-center justify-center gap-1.5 transition-colors whitespace-nowrap shrink-0 shadow-2xs"
                          >
                            <QrCode className="w-3.5 h-3.5 shrink-0" />
                            <span>查看簽到 QR 碼</span>
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              setMeetingCheckinState({
                                isOpen: true,
                                audienceMode: 'teacher',
                                meetingId: signedMeeting.id,
                              })
                            }
                            className="min-h-[38px] px-4 py-2 text-xs font-semibold text-emerald-950 bg-white border border-emerald-300 rounded-xl hover:bg-emerald-100/70 inline-flex items-center justify-center gap-1.5 transition-colors whitespace-nowrap shrink-0"
                          >
                            <CalendarCheck className="w-3.5 h-3.5 shrink-0" />
                            <span>檢視 / 修改簽名</span>
                          </button>
                        </div>
                      </div>
                    );
                  })()}
            </div>
          </section>
        )}

        {/* Editorial Masthead + Prominent First-Screen Search + Compact Featured Spotlight */}
        <section className="border-b border-stone-200 bg-white">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 sm:py-7 lg:py-9">
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 lg:gap-8 items-stretch">
              {/* Left Column: Brand Masthead, Prominent Search & Top Topic Quick Links */}
              <div className="lg:col-span-7 min-w-0 flex flex-col justify-center gap-5">
                <div className="space-y-2.5 min-w-0">
                  {siteSettings.siteSubtitle.trim() && (
                    <p className="text-xs font-mono-tabular tracking-widest uppercase text-stone-500 break-words">
                      {siteSettings.siteSubtitle}
                    </p>
                  )}
                  <h1 className="font-editorial text-2xl sm:text-4xl lg:text-[42px] font-semibold text-stone-950 leading-[1.2] text-balance break-words">
                    {siteSettings.heroHeading}
                  </h1>
                  {siteSettings.heroDescription.trim() && (
                    <p className="text-sm sm:text-base text-stone-600 leading-relaxed max-w-2xl break-words">
                      {siteSettings.heroDescription}
                    </p>
                  )}
                </div>

                {/* First-Screen Unified Search & Academic Year Bar */}
                <div className="space-y-3 min-w-0">
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      scrollToSection('journal-catalog');
                    }}
                    className="bg-[#FBF9F5] border border-stone-300 rounded-xl p-1.5 flex flex-col sm:flex-row sm:items-center gap-2 shadow-xs focus-within:ring-2 focus-within:ring-[#1E3A8A] focus-within:border-[#1E3A8A] focus-within:bg-white transition-all min-w-0"
                  >
                    <div className="relative flex-1 min-w-0">
                      <Search className="w-4 h-4 text-stone-500 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                      <input
                        type="search"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        placeholder={`搜尋 ${posts.length} 篇教案、學力檢測、會議紀錄或作者...`}
                        className="w-full h-10 pl-9 pr-3 text-sm text-stone-900 placeholder:text-stone-400 bg-transparent focus:outline-none min-w-0"
                      />
                    </div>

                    <div className="flex items-center gap-2 sm:border-l sm:border-stone-200 sm:pl-2 min-w-0 shrink-0">
                      <select
                        id="academic-year-select"
                        aria-label="篩選學年度"
                        value={selectedYear}
                        onChange={(e) => setSelectedYear(e.target.value)}
                        className="flex-1 sm:flex-initial min-w-0 h-10 pl-2.5 pr-7 text-xs font-medium text-stone-800 bg-white border border-stone-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1E3A8A] cursor-pointer"
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
                            className={`px-2.5 py-1 rounded-md border transition-all duration-150 active:scale-[0.97] whitespace-nowrap ${
                              selectedCategory === cat
                                ? 'bg-[#1E3A8A] text-white border-[#1E3A8A] shadow-xs'
                                : 'bg-[#F7F4EE] text-stone-700 border-stone-200 hover:-translate-y-0.5 hover:border-[#1E3A8A]/50 hover:bg-white hover:text-[#1E3A8A] hover:shadow-xs'
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

              {/* Right Column: Curated Featured Spotlight Showcase */}
              {featuredSpotlightPosts.length > 0 ? (
                <div className="lg:col-span-5 min-w-0 flex">
                  <FeaturedSpotlight
                    posts={featuredSpotlightPosts}
                    onSelectPost={(post) => setActivePost(post)}
                    checkPostLocked={checkPostLocked}
                  />
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

        {/* Integrated Interactive Topic, Class 403 & Community Meeting Check-In Hub */}
        <section
          aria-label="跨域互動專題與社群會議入口展示"
          className="border-b border-stone-200 bg-[#F7F4EE]"
        >
          <div className="max-w-7xl mx-auto px-4 sm:px-6 py-5 space-y-4">
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
              {/* Left Hub: Ximen Scratch Interactive Learning Site */}
              <div className="min-w-0 bg-white/85 border border-stone-200 rounded-xl p-4 sm:p-5 flex flex-col justify-between gap-4 hover:border-[#1E3A8A]/40 hover:shadow-sm transition-all">
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
                    {isXimenLocked && (
                      <>
                        <span aria-hidden="true" className="text-stone-400">
                          ·
                        </span>
                        <span className="inline-flex items-center gap-1 font-semibold text-amber-800">
                          <Lock className="w-3 h-3" />
                          <span>限 @hmes.tp.edu.tw</span>
                        </span>
                      </>
                    )}
                  </div>
                  <h2 className="font-editorial text-lg font-bold text-stone-950">
                    百年西門 Scratch 舞台秀互動學習網
                  </h2>
                  <p className="text-xs sm:text-sm text-stone-600 leading-relaxed">
                    提供西門町互動商圈地圖座標微調、標準圖庫匯出、Scratch 3.0 積木步驟與分班命名檢核表。
                  </p>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
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
                        className="min-h-[34px] px-2.5 py-1 text-xs font-medium text-stone-700 bg-[#FBF9F5] border border-stone-200 rounded-lg hover:-translate-y-0.5 hover:border-[#1E3A8A] hover:text-[#1E3A8A] hover:bg-white hover:shadow-xs active:scale-[0.97] transition-all whitespace-nowrap shrink-0"
                      >
                        {tab.label}
                      </button>
                    ))}
                  </div>

                  <div className="flex flex-wrap items-center gap-1.5 max-w-full">
                    <button
                      type="button"
                      onClick={() => openXimenStage('map')}
                      className="min-h-[34px] px-3 py-1 text-xs font-semibold text-white bg-[#1E3A8A] rounded-lg hover:-translate-y-0.5 hover:bg-[#172554] hover:shadow-sm active:scale-[0.97] inline-flex items-center gap-1.5 transition-all whitespace-nowrap shrink-0"
                    >
                      {isXimenLocked ? (
                        <Lock className="w-3.5 h-3.5" />
                      ) : (
                        <MonitorPlay className="w-3.5 h-3.5" />
                      )}
                      <span>{isXimenLocked ? '登入解鎖' : '開啟學習網'}</span>
                    </button>

                    {!isXimenLocked && (
                      <a
                        href="./ximen-scratch.html"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="min-h-[34px] px-2.5 py-1 text-xs font-medium text-stone-700 bg-white border border-stone-300 rounded-lg hover:-translate-y-0.5 hover:bg-stone-50 hover:border-stone-400 hover:shadow-xs active:scale-[0.97] inline-flex items-center gap-1 transition-all whitespace-nowrap shrink-0"
                      >
                        <span>獨立分頁</span>
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    )}
                  </div>
                </div>
              </div>

              {/* Right Hub: Class 403 Website (Pes Class 115) */}
              <div className="min-w-0 bg-white/85 border border-stone-200 rounded-xl p-4 sm:p-5 flex flex-col justify-between gap-4 hover:border-[#1E3A8A]/40 hover:shadow-sm transition-all">
                <div className="space-y-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs">
                    <span className="font-semibold text-[#1E3A8A]">
                      四年 3 班專屬班務系統
                    </span>
                    <span aria-hidden="true" className="text-stone-400">
                      ·
                    </span>
                    <span className="font-mono-tabular text-stone-600">
                      Pes Class 115 · 分機 5207
                    </span>
                    {isClass403Locked && (
                      <>
                        <span aria-hidden="true" className="text-stone-400">
                          ·
                        </span>
                        <span className="inline-flex items-center gap-1 font-semibold text-amber-800">
                          <Lock className="w-3 h-3" />
                          <span>限 @hmes.tp.edu.tw</span>
                        </span>
                      </>
                    )}
                  </div>
                  <h2 className="font-editorial text-lg font-bold text-stone-950">
                    403 班級網站與互動聯絡簿
                  </h2>
                  <p className="text-xs sm:text-sm text-stone-600 leading-relaxed">
                    每日作業與服裝提醒、雙模式行事曆、線上學習資源與請假表單下載、每週課表及班級交流留言板。
                  </p>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    {(
                      [
                        {id: 'agenda', label: '互動聯絡簿'},
                        {id: 'news', label: '公告行事曆'},
                        {id: 'resources', label: '學習資源庫'},
                        {id: 'contact', label: '課表與聯絡'},
                      ] as const
                    ).map((tab) => (
                      <button
                        key={tab.id}
                        type="button"
                        onClick={() => openClass403Stage(tab.id)}
                        className="min-h-[34px] px-2.5 py-1 text-xs font-medium text-stone-700 bg-[#FBF9F5] border border-stone-200 rounded-lg hover:-translate-y-0.5 hover:border-[#1E3A8A] hover:text-[#1E3A8A] hover:bg-white hover:shadow-xs active:scale-[0.97] transition-all whitespace-nowrap shrink-0"
                      >
                        {tab.label}
                      </button>
                    ))}
                  </div>

                  <div className="flex flex-wrap items-center gap-1.5 max-w-full">
                    <button
                      type="button"
                      onClick={() => openClass403Stage('agenda')}
                      className="min-h-[34px] px-3 py-1 text-xs font-semibold text-white bg-[#1E3A8A] rounded-lg hover:-translate-y-0.5 hover:bg-[#172554] hover:shadow-sm active:scale-[0.97] inline-flex items-center gap-1.5 transition-all whitespace-nowrap shrink-0"
                    >
                      {isClass403Locked ? (
                        <Lock className="w-3.5 h-3.5" />
                      ) : (
                        <GraduationCap className="w-3.5 h-3.5" />
                      )}
                      <span>{isClass403Locked ? '登入解鎖' : '開啟 403 班網'}</span>
                    </button>

                    {!isClass403Locked && (
                      <a
                        href="./class-403.html"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="min-h-[34px] px-2.5 py-1 text-xs font-medium text-stone-700 bg-white border border-stone-300 rounded-lg hover:-translate-y-0.5 hover:bg-stone-50 hover:border-stone-400 hover:shadow-xs active:scale-[0.97] inline-flex items-center gap-1 transition-all whitespace-nowrap shrink-0"
                      >
                        <span>獨立分頁</span>
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    )}
                  </div>
                </div>
              </div>
            </div>

          </div>
        </section>

        {/* Journal Catalog & Single-Line Channel Bar */}
        <section id="journal-catalog" className="max-w-7xl mx-auto px-4 sm:px-6 py-8 lg:py-10 space-y-6 min-w-0">
          {/* Unified Channel Tabs + View Mode Switcher Row (No Redundant Middle Search Box) */}
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 border-b border-stone-200 pb-2 min-w-0">
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
                      data-active={isActive ? 'true' : undefined}
                      onClick={() => setSelectedCategory(cat)}
                      className={`px-3 py-2 text-sm border-b-2 rounded-t-md transition-all whitespace-nowrap shrink-0 inline-flex items-baseline gap-1.5 active:scale-[0.98] ${
                        isActive
                          ? 'border-[#1E3A8A] text-[#1E3A8A] bg-[#1E3A8A]/5 font-semibold'
                          : 'border-transparent text-stone-600 hover:text-[#1E3A8A] hover:bg-stone-200/50 hover:border-stone-300 font-medium'
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
                className="hidden sm:flex min-h-[40px] min-w-[32px] items-center justify-center rounded-md text-stone-500 hover:text-stone-900 hover:bg-stone-200/50 transition-colors shrink-0"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>

            {/* Right Controls: Draft Toggle + View Mode Switcher */}
            <div className="flex flex-wrap items-center justify-between sm:justify-end gap-2 sm:gap-3 min-w-0 pb-1 lg:pb-0">
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

              <div className="flex items-center gap-1 p-1 bg-[#F7F4EE] border border-stone-200 rounded-lg max-w-full overflow-x-auto no-scrollbar">
                <button
                  type="button"
                  onClick={() => setViewMode('swipe')}
                  className={`px-2.5 sm:px-3 py-1.5 text-xs font-medium rounded-md inline-flex items-center gap-1.5 transition-all active:scale-[0.97] whitespace-nowrap shrink-0 ${
                    viewMode === 'swipe'
                      ? 'bg-white text-[#1E3A8A] font-semibold shadow-xs'
                      : 'text-stone-600 hover:text-stone-950 hover:bg-white/70'
                  }`}
                >
                  <Layers className="w-3.5 h-3.5" />
                  <span>主題滑動</span>
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode('grid')}
                  className={`px-2.5 sm:px-3 py-1.5 text-xs font-medium rounded-md inline-flex items-center gap-1.5 transition-all active:scale-[0.97] whitespace-nowrap shrink-0 ${
                    viewMode === 'grid'
                      ? 'bg-white text-[#1E3A8A] font-semibold shadow-xs'
                      : 'text-stone-600 hover:text-stone-950 hover:bg-white/70'
                  }`}
                >
                  <LayoutGrid className="w-3.5 h-3.5" />
                  <span>卡片排版</span>
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode('list')}
                  className={`px-2.5 sm:px-3 py-1.5 text-xs font-medium rounded-md inline-flex items-center gap-1.5 transition-all active:scale-[0.97] whitespace-nowrap shrink-0 ${
                    viewMode === 'list'
                      ? 'bg-white text-[#1E3A8A] font-semibold shadow-xs'
                      : 'text-stone-600 hover:text-stone-950 hover:bg-white/70'
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
              checkPostLocked={checkPostLocked}
            />
          ) : viewMode === 'grid' ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {filteredPosts.map((post, idx) => (
                <ArticleCard
                  key={`${post.slug}-${post.rowIndex ?? idx}`}
                  post={post}
                  onSelect={(p) => setActivePost(p)}
                  isLocked={checkPostLocked(post)}
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
                    {filteredPosts.map((post, idx) => {
                      const locked = checkPostLocked(post);
                      return (
                        <tr
                          key={`${post.slug}-${post.rowIndex ?? idx}`}
                          onClick={() => setActivePost(post)}
                          className="group cursor-pointer hover:bg-[#F3EFE6] transition-colors"
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
                              onClick={(e) => {
                                e.stopPropagation();
                                setActivePost(post);
                              }}
                              className="text-left font-medium text-stone-900 group-hover:text-[#1E3A8A] inline-flex items-center gap-1.5 transition-colors"
                            >
                              {locked && (
                                <Lock className="w-3.5 h-3.5 text-amber-700 shrink-0" />
                              )}
                              <span>{post.title}</span>
                            </button>
                          </td>
                          <td className="py-3.5 px-4 text-xs text-stone-500 whitespace-nowrap">
                            {locked ? (
                              <span className="inline-flex items-center gap-1 text-amber-800 font-medium">
                                <Lock className="w-3 h-3" />
                                <span>校內限定</span>
                              </span>
                            ) : post.embedUrl ? (
                              <a
                                href={post.embedUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                onClick={(e) => e.stopPropagation()}
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
                              onClick={(e) => {
                                e.stopPropagation();
                                setActivePost(post);
                              }}
                              className="text-xs font-semibold text-[#1E3A8A] px-2.5 py-1 rounded-md group-hover:bg-[#1E3A8A] group-hover:text-white inline-flex items-center gap-1 transition-all"
                            >
                              {locked && <Lock className="w-3 h-3" />}
                              <span>{locked ? '登入解鎖' : '閱讀全文'}</span>
                              <ArrowUpRight className="w-3.5 h-3.5 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
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
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <span>© {new Date().getFullYear()} pes 版權所有 · All Rights Reserved.</span>
              <span className="text-stone-300" aria-hidden="true">|</span>
              <span>
                聯絡信箱：
                <a
                  href="mailto:pes@hmes.tp.edu.tw"
                  className="text-stone-700 hover:text-[#1E3A8A] underline decoration-stone-300 hover:decoration-[#1E3A8A] underline-offset-2 transition-colors"
                >
                  pes@hmes.tp.edu.tw
                </a>
              </span>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-4">
            {isTeacherAdmin ? (
              <button
                type="button"
                onClick={() =>
                  setMeetingCheckinState({isOpen: true, audienceMode: 'teacher'})
                }
                className="inline-flex items-center gap-1.5 text-[#1E3A8A] hover:underline font-medium"
              >
                <CalendarCheck className="w-3.5 h-3.5" />
                <span>管理會議與 QR Code</span>
              </button>
            ) : isSchoolAuthorized ? (
              <button
                type="button"
                onClick={() =>
                  setMeetingCheckinState({isOpen: true, audienceMode: 'teacher'})
                }
                className="inline-flex items-center gap-1.5 text-stone-700 hover:text-[#1E3A8A] font-medium"
              >
                <CalendarCheck className="w-3.5 h-3.5" />
                <span>我的會議簽到紀錄</span>
              </button>
            ) : null}
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
            ) : isSchoolAuthorized ? (
              <>
                {isTeacherAdmin && (
                  <button
                    type="button"
                    onClick={handleSignIn}
                    disabled={isSigningIn}
                    className="inline-flex items-center gap-1.5 text-stone-700 hover:text-[#1E3A8A] font-medium"
                  >
                    <Sheet className="w-3.5 h-3.5" />
                    <span>管理後台授權</span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={handleSignOut}
                  className="text-stone-500 hover:text-stone-900"
                >
                  登出（{user?.email}）
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={() => openSchoolAccessModal()}
                disabled={isSigningIn}
                className="inline-flex items-center gap-1.5 text-stone-600 hover:text-[#1E3A8A] font-medium transition-colors"
              >
                <Lock className="w-3.5 h-3.5" />
                <span>{isSigningIn ? '登入中...' : '社群教師登入'}</span>
              </button>
            )}
          </div>
        </div>
      </footer>

      {/* 2D Topic & Card Swipe Reader Deck */}
      <TopicSwipeDeckModal
        isOpen={immersiveSwipe.isOpen}
        isSuspended={
          Boolean(activePost) ||
          interactiveStage.isOpen ||
          schoolAccessPrompt.isOpen ||
          meetingCheckinState.isOpen
        }
        groups={topicGroups}
        initialTopicIndex={immersiveSwipe.topicIndex}
        initialCardIndex={immersiveSwipe.cardIndex}
        checkPostLocked={checkPostLocked}
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
        isLocked={activePost ? checkPostLocked(activePost) : false}
        isSchoolAuthorized={isSchoolAuthorized}
        onRequestSchoolSignIn={() =>
          openSchoolAccessModal(
            '登入 @hmes.tp.edu.tw 解鎖文章',
            activePost
              ? `即將解鎖校內限定文章：「${activePost.title}」`
              : undefined,
          )
        }
        onOpenMeetingCheckin={(linkedSlug) => {
          setActivePost(null);
          setMeetingCheckinState({
            isOpen: true,
            linkedPostSlug: linkedSlug,
            audienceMode: 'teacher',
          });
        }}
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
        onOpenFullEmbed={(url, title, tab = 'map') => {
          setActivePost(null);
          setInteractiveStage({
            isOpen: true,
            url,
            title,
            initialTab: tab,
          });
        }}
        onOpenShareQr={() => {
          setCustomQrTarget(null);
          setSiteQrTargetMode('current');
          setSiteQrMode('modal');
        }}
        onGenerateDeck={(targetPost) => setDeckModalPost(targetPost)}
        disableEscapeClose={siteQrMode === 'modal' || Boolean(deckModalPost)}
      />

      <ArticleDeckModal
        post={deckModalPost}
        siteTitle={siteSettings.siteTitle}
        onClose={() => setDeckModalPost(null)}
      />

      {/* Full-Viewport Interactive HTML Stage Modal */}
      <InteractiveEmbedModal
        isOpen={interactiveStage.isOpen}
        url={interactiveStage.url}
        title={interactiveStage.title}
        initialTab={interactiveStage.initialTab}
        onClose={() => {
          setCustomQrTarget(null);
          setInteractiveStage((prev) => ({...prev, isOpen: false}));
        }}
        onOpenShareQr={(url, label) => {
          setCustomQrTarget({url, title: label});
          setSiteQrTargetMode('current');
          setSiteQrMode('modal');
        }}
        disableEscapeClose={siteQrMode === 'modal'}
        user={user}
        isTeacher={isTeacherAdmin}
        hasAccessToken={hasAccessToken}
        isSigningIn={isSigningIn}
        authError={galleryAuthError}
        onClearAuthError={() => setGalleryAuthError(null)}
        onTeacherSignIn={handleSignIn}
        onStudentSignIn={handleStudentSignIn}
        onSignOut={handleSignOut}
        hiddenOfficialAssetIds={hiddenOfficialAssetIds}
        onUpdateHiddenOfficialAssets={async (nextIds) => {
          setHiddenOfficialAssetIds(nextIds);
          try {
            localStorage.setItem(
              HIDDEN_OFFICIAL_ASSETS_STORAGE_KEY,
              JSON.stringify(nextIds),
            );
          } catch {
            // ignore storage error
          }
          if (auth.currentUser && isTeacherAdmin) {
            try {
              const activeId = sheetMeta?.spreadsheetId || publicSheetId || '';
              const activeTab = sheetMeta?.activeTab || publicTabName || 'Posts';
              await saveSharedSiteConfig({
                spreadsheetId: activeId,
                tabName: activeTab,
                ...siteSettings,
                hiddenOfficialAssetIds: nextIds,
              });
              return {synced: true};
            } catch (err) {
              return {
                synced: false,
                errorMessage:
                  err instanceof Error ? err.message : '雲端同步失敗',
              };
            }
          }
          return {synced: false};
        }}
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
          setPosts(
            imported.map((p) => ({
              ...p,
              academicYear:
                normalizeAcademicYear(p.academicYear) || p.academicYear,
            })),
          );
          setDataSourceMode('local-json');
          setSheetMeta(null);
        }}
        onBatchImportPosts={handleBatchImportPosts}
        siteSettings={siteSettings}
        onSaveSiteSettings={handleSaveSiteSettings}
        onSyncSettingsToSheet={handleSyncSettingsToSheet}
        onPublishDefaultSpreadsheet={handlePublishDefaultSpreadsheet}
      />

      {/* @hmes.tp.edu.tw Community Teacher & Admin Access Modal */}
      <SchoolAccessModal
        isOpen={schoolAccessPrompt.isOpen}
        reasonTitle={schoolAccessPrompt.reasonTitle}
        reasonDescription={schoolAccessPrompt.reasonDescription}
        user={user}
        isSchoolAuthorized={isSchoolAuthorized}
        isTeacherAdmin={isTeacherAdmin}
        isSigningIn={isSigningIn}
        authError={galleryAuthError}
        onClearAuthError={() => setGalleryAuthError(null)}
        onSchoolSignIn={handleSchoolSignIn}
        onAdminSignIn={async () => {
          await handleSignIn();
          setSchoolAccessPrompt((prev) => ({...prev, isOpen: false}));
        }}
        onSignOut={handleSignOut}
        onClose={() => setSchoolAccessPrompt({isOpen: false})}
      />

      {/* Community Meeting Check-In Hub Modal */}
      <MeetingCheckinModal
        isOpen={meetingCheckinState.isOpen}
        initialLinkedPostSlug={meetingCheckinState.linkedPostSlug}
        initialAudienceMode={meetingCheckinState.audienceMode}
        initialMeetingId={meetingCheckinState.meetingId}
        onClose={() => setMeetingCheckinState({isOpen: false})}
        user={user}
        isTeacherAdmin={isTeacherAdmin}
        isSchoolAuthorized={isSchoolAuthorized}
        isSigningIn={isSigningIn}
        authError={galleryAuthError}
        onClearAuthError={() => setGalleryAuthError(null)}
        onSchoolSignIn={handleSchoolSignIn}
        onAdminSignIn={handleSignIn}
        onSignOut={handleSignOut}
        posts={posts}
        onOpenLinkedPost={(slug) => {
          const found = posts.find((p) => p.slug === slug);
          if (found) {
            setMeetingCheckinState({isOpen: false});
            setActivePost(found);
          }
        }}
      />

      {/* Mandatory Explicit Confirmation Dialog for Mutating / Destructive Operations */}
      <ConfirmActionModal
        state={confirmState}
        onClose={() => setConfirmState(null)}
      />

      {/* Teacher Meeting Quick Scan / Enlarge QR Code Modal */}
      {viewingEnlargedQrMeeting && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="qr-enlarge-title"
          className="fixed inset-0 z-50 bg-stone-950/60 backdrop-blur-xs flex items-center justify-center p-4"
        >
          <div className="bg-white rounded-2xl shadow-xl border border-stone-200 max-w-sm w-full p-6 space-y-4 text-center animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between pb-2 border-b border-stone-100">
              <div className="flex items-center gap-1.5 text-xs font-bold text-[#1E3A8A]">
                <QrCode className="w-4 h-4 shrink-0" />
                <span id="qr-enlarge-title">手機掃碼簽到 QR Code</span>
              </div>
              <button
                type="button"
                onClick={() => setViewingEnlargedQrMeeting(null)}
                className="p-1 rounded-lg text-stone-400 hover:text-stone-700 hover:bg-stone-100 transition-colors"
                aria-label="關閉"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-1">
              <h3 className="font-editorial text-base sm:text-lg font-bold text-stone-950 leading-snug">
                {viewingEnlargedQrMeeting.title}
              </h3>
              <p className="text-xs text-stone-500 font-mono-tabular">
                {viewingEnlargedQrMeeting.meetingDate}
                {viewingEnlargedQrMeeting.location
                  ? ` · ${viewingEnlargedQrMeeting.location}`
                  : ''}
              </p>
            </div>

            <div className="w-56 h-56 mx-auto bg-white border border-stone-200 rounded-2xl p-3 shadow-xs flex items-center justify-center">
              {meetingQrDataUrls[viewingEnlargedQrMeeting.id] ? (
                <img
                  src={meetingQrDataUrls[viewingEnlargedQrMeeting.id]}
                  alt={`${viewingEnlargedQrMeeting.title} 簽到 QR Code`}
                  className="w-full h-full object-contain"
                />
              ) : (
                <span className="text-xs text-stone-400">QR 碼產生中...</span>
              )}
            </div>

            <p className="text-xs text-stone-600 leading-relaxed bg-[#F8FAFC] border border-stone-200/80 rounded-xl p-3 text-left">
              {getMeetingCheckinWindowState(
                viewingEnlargedQrMeeting,
                checkinClockMs,
              ).status === 'not-started'
                ? '此會議目前為預告狀態，尚未正式開放簽名。您可先用手機掃碼預先登入學校 @hmes.tp.edu.tw 帳號，待開放時間即可直接親筆簽名。'
                : '以手機相機或 LINE 掃描此碼，登入學校 @hmes.tp.edu.tw 帳號後即可立即手寫親筆簽名，完成會議簽到。'}
            </p>

            <div className="flex items-center gap-2 pt-1">
              <button
                type="button"
                onClick={() =>
                  handleCopyTeacherLink(viewingEnlargedQrMeeting.id)
                }
                className="flex-1 py-2 px-3 text-xs font-semibold text-[#1E3A8A] bg-[#1E3A8A]/8 hover:bg-[#1E3A8A]/15 border border-[#1E3A8A]/20 rounded-xl inline-flex items-center justify-center gap-1.5 transition-colors"
              >
                {copiedTeacherLinkMeetingId ===
                viewingEnlargedQrMeeting.id ? (
                  <>
                    <Check className="w-3.5 h-3.5" />
                    <span>已複製直達連結</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5" />
                    <span>複製簽到連結</span>
                  </>
                )}
              </button>
              <button
                type="button"
                onClick={() => setViewingEnlargedQrMeeting(null)}
                className="py-2 px-4 text-xs font-medium text-stone-700 bg-white border border-stone-300 rounded-xl hover:bg-stone-50 transition-colors"
              >
                關閉
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Presenter / Audience Site QR Code Projection Modal */}
      {siteQrMode === 'modal' && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="site-qr-modal-title"
          onClick={() => setSiteQrMode('closed')}
          className="fixed inset-0 z-[70] bg-stone-950/60 backdrop-blur-xs flex items-center justify-center p-4"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="bg-white rounded-2xl shadow-2xl border border-stone-200 max-w-md w-full p-5 sm:p-6 space-y-4 text-center"
          >
            <div className="flex items-center justify-between pb-2.5 border-b border-stone-100">
              <div className="flex items-center gap-2 text-xs font-bold text-[#1E3A8A]">
                <QrCode className="w-4 h-4 shrink-0" />
                <span id="site-qr-modal-title">
                  {siteQrTargetMode === 'current' && activePost
                    ? '現場簡報 · 掃碼直達本文章'
                    : siteQrTargetMode === 'current' && (customQrTarget || interactiveStage.isOpen)
                      ? '現場簡報 · 掃碼直達目前頁面'
                      : '現場簡報 · 掃碼進入本網頁'}
                </span>
              </div>
              <button
                type="button"
                onClick={() => setSiteQrMode('closed')}
                className="p-1 rounded-lg text-stone-400 hover:text-stone-700 hover:bg-stone-100 transition-colors"
                aria-label="關閉 QR Code 視窗"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-1">
              <h3 className="font-editorial text-lg font-bold text-stone-950 leading-snug line-clamp-2">
                {siteQrTargetMode === 'current' && activePost
                  ? activePost.title
                  : siteQrTargetMode === 'current' && (customQrTarget?.title || interactiveStage.isOpen)
                    ? customQrTarget?.title || interactiveStage.title
                    : siteSettings.siteTitle}
              </h3>
              <p className="text-xs text-stone-500">
                {siteQrTargetMode === 'current' && activePost
                  ? '請聽眾開啟手機相機或 LINE 掃描條碼，即可直接開啟本篇文章'
                  : siteQrTargetMode === 'current' && (customQrTarget || interactiveStage.isOpen)
                    ? '請聽眾開啟手機相機或 LINE 掃描條碼，即可直接進入此頁面'
                    : '請聽眾開啟手機相機或 LINE 掃描條碼，即可立即瀏覽本知識庫網頁'}
              </p>
            </div>

            {siteShareUrls.hasDistinctCurrent && (
              <div className="inline-flex p-1 rounded-xl bg-[#F7F4EE] border border-stone-200 text-xs">
                <button
                  type="button"
                  onClick={() => setSiteQrTargetMode('home')}
                  className={`px-3 py-1 rounded-lg font-medium transition-colors ${
                    siteQrTargetMode === 'home'
                      ? 'bg-white text-[#1E3A8A] shadow-2xs'
                      : 'text-stone-600 hover:text-stone-900'
                  }`}
                >
                  網站首頁
                </button>
                <button
                  type="button"
                  onClick={() => setSiteQrTargetMode('current')}
                  className={`px-3 py-1 rounded-lg font-medium transition-colors ${
                    siteQrTargetMode === 'current'
                      ? 'bg-white text-[#1E3A8A] shadow-2xs'
                      : 'text-stone-600 hover:text-stone-900'
                  }`}
                >
                  {activePost ? '目前文章直達' : '目前頁面直達'}
                </button>
              </div>
            )}

            <div className="w-60 h-60 sm:w-64 sm:h-64 mx-auto bg-white border border-stone-200 rounded-2xl p-3 shadow-xs flex items-center justify-center">
              {siteQrDataUrl ? (
                <img
                  src={siteQrDataUrl}
                  alt={`${siteSettings.siteTitle} 網頁 QR Code`}
                  className="w-full h-full object-contain"
                />
              ) : (
                <span className="text-xs text-stone-400">QR 碼產生中...</span>
              )}
            </div>

            <div className="px-3 py-2 bg-[#F8FAFC] border border-stone-200/80 rounded-xl text-[11px] font-mono-tabular text-stone-600 break-all select-all">
              {activeSiteShareUrl}
            </div>

            <div className="space-y-2 pt-1">
              <button
                type="button"
                onClick={() => setSiteQrMode('pinned')}
                className="w-full py-2.5 px-4 text-xs font-semibold text-white bg-[#1E3A8A] hover:bg-[#172554] rounded-xl inline-flex items-center justify-center gap-1.5 transition-colors shadow-xs"
              >
                <Pin className="w-3.5 h-3.5 shrink-0" />
                <span>釘選於畫面角落（邊講解操作邊展示 QR 碼）</span>
              </button>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleCopySiteUrl}
                  className="flex-1 py-2 px-3 text-xs font-semibold text-[#1E3A8A] bg-[#1E3A8A]/8 hover:bg-[#1E3A8A]/15 border border-[#1E3A8A]/20 rounded-xl inline-flex items-center justify-center gap-1.5 transition-colors"
                >
                  {copiedSiteUrl ? (
                    <>
                      <Check className="w-3.5 h-3.5" />
                      <span>已複製網址</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5" />
                      <span>複製網址</span>
                    </>
                  )}
                </button>
                <button
                  type="button"
                  onClick={handleDownloadSiteQr}
                  disabled={!siteQrDataUrl}
                  className="flex-1 py-2 px-3 text-xs font-semibold text-stone-700 bg-white hover:bg-stone-50 border border-stone-300 rounded-xl inline-flex items-center justify-center gap-1.5 transition-colors disabled:opacity-50"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>下載 QR 圖檔</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Pinned Corner QR Card (for continuous scanning while presenter navigates the page) */}
      {siteQrMode === 'pinned' && (
        <aside
          aria-label="固定顯示網頁 QR Code"
          className={`fixed bottom-4 ${
            interactiveStage.isOpen && interactiveStage.url.includes('class-403.html')
              ? 'left-4'
              : 'right-4'
          } z-[60] w-44 sm:w-48 bg-white/95 backdrop-blur-md border border-[#1E3A8A]/30 rounded-2xl shadow-2xl p-3 space-y-2 print:hidden`}
        >
          <div className="flex items-center justify-between gap-1">
            <span className="text-[11px] font-bold text-[#1E3A8A] inline-flex items-center gap-1 truncate">
              <QrCode className="w-3 h-3 shrink-0" />
              <span>
                {siteQrTargetMode === 'current' && activePost
                  ? '掃碼直達本文章'
                  : siteQrTargetMode === 'current' && (customQrTarget || interactiveStage.isOpen)
                    ? '掃碼進入此頁面'
                    : '掃碼進入本網頁'}
              </span>
            </span>
            <div className="flex items-center gap-0.5 shrink-0">
              <button
                type="button"
                onClick={() => setSiteQrMode('modal')}
                className="p-1 rounded-md text-stone-500 hover:text-[#1E3A8A] hover:bg-stone-100 transition-colors"
                title="放大 QR Code"
                aria-label="放大 QR Code"
              >
                <Maximize2 className="w-3 h-3" />
              </button>
              <button
                type="button"
                onClick={() => setSiteQrMode('closed')}
                className="p-1 rounded-md text-stone-500 hover:text-stone-900 hover:bg-stone-100 transition-colors"
                title="關閉角落 QR Code"
                aria-label="關閉角落 QR Code"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          <button
            type="button"
            onClick={() => setSiteQrMode('modal')}
            className="w-36 h-36 sm:w-40 sm:h-40 mx-auto bg-white border border-stone-200 rounded-xl p-1.5 flex items-center justify-center hover:border-[#1E3A8A]/50 transition-colors"
            title="點擊放大顯示"
          >
            {siteQrDataUrl ? (
              <img
                src={siteQrDataUrl}
                alt="掃碼進入本網頁 QR Code"
                className="w-full h-full object-contain"
              />
            ) : (
              <span className="text-[11px] text-stone-400">產生中...</span>
            )}
          </button>

          <p className="text-[10px] text-stone-500 text-center truncate px-1">
            {siteQrTargetMode === 'current' && activePost
              ? activePost.title
              : siteQrTargetMode === 'current' && (customQrTarget?.title || interactiveStage.isOpen)
                ? customQrTarget?.title || interactiveStage.title
                : siteSettings.siteTitle}
          </p>
        </aside>
      )}
    </div>
  );
}

export default function App() {
  const initialRoute = useMemo(() => {
    const params = new URLSearchParams(window.location.search);
    const checkinParam = params.get('checkin');
    const meetingParam = params.get('meeting') || undefined;
    return {
      isStandaloneParent: checkinParam === 'parent',
      meetingId: meetingParam,
    };
  }, []);

  if (initialRoute.isStandaloneParent) {
    return (
      <StandaloneParentCheckinPage initialMeetingId={initialRoute.meetingId} />
    );
  }

  return <MainKnowledgeBaseApp />;
}
