/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {User} from 'firebase/auth';
import {
  AlertTriangle,
  BellRing,
  CalendarCheck,
  Check,
  CheckCircle2,
  Clock,
  Copy,
  Download,
  ExternalLink,
  GalleryHorizontalEnd,
  Lock,
  Maximize2,
  PenTool,
  Pin,
  QrCode,
  Sheet,
  ShieldCheck,
  UserCheck,
  X,
} from 'lucide-react';
import QRCode from 'qrcode';
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
import {MeetingMinutesModal} from './components/MeetingMinutesModal';
import {
  PORTAL_MAJOR_CHANNELS,
  PortalChannelShowcase,
  PortalMajorChannel,
} from './components/PortalChannelShowcase';
import {PresentationModeModal} from './components/PresentationModeModal';
import {SchoolAccessModal} from './components/SchoolAccessModal';
import {DrawerTab, SheetsCmsDrawer} from './components/SheetsCmsDrawer';
import {StandaloneParentCheckinPage} from './components/StandaloneParentCheckinPage';
import {TeachingResourcesHubModal} from './components/TeachingResourcesHubModal';
import {AssessmentBankModal} from './components/AssessmentBankModal';
import {TopicSwipeDeckModal} from './components/TopicSwipeDeckModal';
import {updateDynamicFavicon} from './utils/dynamicFavicon';
import {
  buildChannelSwipeDeck,
  SwipeDeckGroup,
} from './utils/swipeDeckBuilder';
import {
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
import {SEED_TEACHING_RESOURCES} from './data/seedResources';
import {SEED_ASSESSMENT_QUESTIONS} from './data/seedAssessments';
import {
  auth,
  checkIsTeacherAdmin,
  clearAccessToken,
  getAccessToken,
  googleSignIn,
  initAuth,
  isOwnerAdminEmail,
  isSchoolMemberAuthorized,
  logout,
  schoolGoogleSignIn,
} from './services/googleAuth';
import {
  DriveUploadResult,
  uploadTeachingResourceFileToDrive,
} from './services/driveUpload';
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
  appendResourceToSheet,
  batchAppendResourcesToSheet,
  deleteResourceFromSheet,
  ensureResourcesTabExists,
  fetchResourcesFromPublicGviz,
  fetchResourcesFromSheetsApi,
  findResourcesTab,
  readLocalResourcesCache,
  updateResourceInSheet,
  writeLocalResourcesCache,
} from './services/resourcesDb';
import {
  appendAssessmentQuestionToSheet,
  batchAppendAssessmentQuestionsToSheet,
  DEFAULT_ASSESSMENT_TAB_NAME,
  deleteAssessmentQuestionFromSheet,
  ensureAssessmentTabExists,
  fetchAssessmentFromPublicGviz,
  fetchAssessmentFromSheetsApi,
  findAssessmentTab,
  readLocalAssessmentsCache,
  readSelectedAssessmentTabPreference,
  updateAssessmentQuestionInSheet,
  writeLocalAssessmentsCache,
  writeSelectedAssessmentTabPreference,
} from './services/assessmentDb';
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
  AssessmentQuestion,
  ConfirmActionState,
  DataSourceMode,
  JournalPost,
  ResourceGradeBand,
  SiteSettings,
  SpreadsheetMeta,
  TeachingResource,
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
  const [activePortalChannel, setActivePortalChannel] =
    useState<PortalMajorChannel>('all');
  const [channelJumpRequest, setChannelJumpRequest] = useState<{
    channel: PortalMajorChannel;
    nonce: number;
  } | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedYear, setSelectedYear] = useState<string>('全部年度');
  const [selectedCategory, setSelectedCategory] = useState<string>('全部分類');
  const [viewMode, setViewMode] = useState<'swipe' | 'grid' | 'list'>('swipe');
  const [includeDrafts, setIncludeDrafts] = useState(false);

  const [resourceGradeFilter, setResourceGradeFilter] = useState<
    '全部年段' | ResourceGradeBand
  >('全部年段');
  const [assessmentGradeFilter, setAssessmentGradeFilter] =
    useState<string>('全部年級');

  // Modals & Drawers
  const [activePost, setActivePost] = useState<JournalPost | null>(null);
  const [immersiveSwipe, setImmersiveSwipe] = useState<{
    isOpen: boolean;
    scopeLabel?: string;
    groups?: SwipeDeckGroup[];
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
  const [minutesModalPost, setMinutesModalPost] = useState<JournalPost | null>(
    null,
  );
  const [resources, setResources] = useState<TeachingResource[]>(
    () => readLocalResourcesCache(DEFAULT_PUBLIC_SHEET_ID) || SEED_TEACHING_RESOURCES,
  );
  const [hasRemoteResourcesTab, setHasRemoteResourcesTab] = useState(false);
  const [isResourcesHubOpen, setIsResourcesHubOpen] = useState(false);
  const [pendingOpenResource, setPendingOpenResource] =
    useState<TeachingResource | null>(null);
  const [assessmentTabName, setAssessmentTabName] = useState<string>(() =>
    readSelectedAssessmentTabPreference(DEFAULT_PUBLIC_SHEET_ID),
  );
  const [assessmentQuestions, setAssessmentQuestions] = useState<
    AssessmentQuestion[]
  >(() => {
    const preferredTab = readSelectedAssessmentTabPreference(
      DEFAULT_PUBLIC_SHEET_ID,
    );
    return (
      readLocalAssessmentsCache(DEFAULT_PUBLIC_SHEET_ID, preferredTab) ||
      SEED_ASSESSMENT_QUESTIONS
    );
  });
  const [hasRemoteAssessmentTab, setHasRemoteAssessmentTab] = useState(false);
  const [isAssessmentBankOpen, setIsAssessmentBankOpen] = useState(false);
  const [pendingAssessmentGrade, setPendingAssessmentGrade] = useState<
    string | null
  >(null);
  const [pendingAssessmentQuestionId, setPendingAssessmentQuestionId] =
    useState<string | null>(null);
  const [isPresentationModeOpen, setIsPresentationModeOpen] = useState(false);
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
    const activeSheetId = sheetMeta?.spreadsheetId || publicSheetId;
    const resourcesUrl = `${window.location.origin}${window.location.pathname}${
      activeSheetId
        ? `?sheet=${encodeURIComponent(activeSheetId)}&tab=resources`
        : '?tab=resources'
    }`;
    const assessmentUrl = `${window.location.origin}${window.location.pathname}${
      activeSheetId
        ? `?sheet=${encodeURIComponent(activeSheetId)}&tab=assessment`
        : '?tab=assessment'
    }`;
    const currentUrl = customQrTarget?.url
      ? customQrTarget.url
      : activePost
        ? `${window.location.origin}${window.location.pathname}${window.location.search}#post=${encodeURIComponent(activePost.slug)}`
        : interactiveStage.isOpen && interactiveStage.url
          ? new URL(interactiveStage.url, window.location.href).toString()
          : isAssessmentBankOpen
            ? assessmentUrl
            : isResourcesHubOpen
              ? resourcesUrl
              : window.location.href;
    const hasDistinctCurrent =
      Boolean(customQrTarget?.url) ||
      Boolean(activePost) ||
      interactiveStage.isOpen ||
      isAssessmentBankOpen ||
      isResourcesHubOpen ||
      (currentUrl !== homeUrl && currentUrl !== `${homeUrl}#top`);
    return {homeUrl, currentUrl, hasDistinctCurrent};
  }, [
    activePost,
    interactiveStage.isOpen,
    interactiveStage.url,
    isAssessmentBankOpen,
    isResourcesHubOpen,
    sheetMeta?.spreadsheetId,
    publicSheetId,
    siteQrMode,
    customQrTarget,
  ]);

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

  const applyLoadedResources = useCallback(
    (
      spreadsheetId: string,
      resData: {hasTab: boolean; resources: TeachingResource[]},
    ) => {
      if (resData.hasTab) {
        setHasRemoteResourcesTab(true);
        setResources(resData.resources);
        writeLocalResourcesCache(spreadsheetId, resData.resources);
      } else {
        setHasRemoteResourcesTab(false);
        const cached = readLocalResourcesCache(spreadsheetId);
        setResources(
          cached && cached.length > 0 ? cached : SEED_TEACHING_RESOURCES,
        );
      }
    },
    [],
  );

  const applyLoadedAssessments = useCallback(
    (
      spreadsheetId: string,
      assessData: {
        hasTab: boolean;
        tabName: string;
        questions: AssessmentQuestion[];
      },
    ) => {
      if (assessData.hasTab) {
        setHasRemoteAssessmentTab(true);
        setAssessmentTabName(assessData.tabName);
        setAssessmentQuestions(assessData.questions);
        writeLocalAssessmentsCache(
          spreadsheetId,
          assessData.tabName,
          assessData.questions,
        );
      } else {
        setHasRemoteAssessmentTab(false);
        const preferredTab = readSelectedAssessmentTabPreference(spreadsheetId);
        setAssessmentTabName(preferredTab);
        const cached = readLocalAssessmentsCache(spreadsheetId, preferredTab);
        setAssessmentQuestions(
          cached && cached.length > 0 ? cached : SEED_ASSESSMENT_QUESTIONS,
        );
      }
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
        const preferredAssessTab =
          readSelectedAssessmentTabPreference(spreadsheetId);
        const [fetched, remoteSettings, resData, assessData] = await Promise.all([
          fetchPostsFromPublicGviz(spreadsheetId, tabName),
          fetchSiteSettingsFromPublicGviz(spreadsheetId),
          fetchResourcesFromPublicGviz(spreadsheetId),
          fetchAssessmentFromPublicGviz(spreadsheetId, preferredAssessTab),
        ]);
        setPosts(fetched);
        setPublicSheetId(spreadsheetId);
        setPublicTabName(tabName);
        setSheetMeta(null);
        setDataSourceMode('sheets-public');
        localStorage.setItem(PUBLIC_SHEET_STORAGE_KEY, spreadsheetId);
        applyRemoteSettingsIfEnabled(remoteSettings);
        applyLoadedResources(spreadsheetId, resData);
        applyLoadedAssessments(spreadsheetId, assessData);
      } catch (err: any) {
        setSyncError(err?.message || '讀取公開試算表失敗。');
      } finally {
        setIsSyncing(false);
      }
    },
    [applyRemoteSettingsIfEnabled, applyLoadedResources, applyLoadedAssessments],
  );

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (!handledQueryStageRef.current) {
      handledQueryStageRef.current = true;
      const ximenParam = params.get('ximen');
      const class403Param = params.get('class403');
      const checkinParam = params.get('checkin');
      const meetingParam = params.get('meeting');
      const tabParam = params.get('tab');
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
      } else if (
        tabParam === 'resources' ||
        window.location.hash === '#resources'
      ) {
        setIsResourcesHubOpen(true);
      } else if (
        tabParam === 'assessment' ||
        window.location.hash === '#assessment'
      ) {
        setIsAssessmentBankOpen(true);
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
                  const preferredAssessTab = readSelectedAssessmentTabPreference(
                    meta.spreadsheetId,
                  );
                  const [fetched, resData, assessData] = await Promise.all([
                    fetchPostsFromSheetsApi(
                      meta.spreadsheetId,
                      targetTab,
                      token,
                    ),
                    fetchResourcesFromSheetsApi(
                      meta.spreadsheetId,
                      meta.tabs,
                      token,
                    ),
                    fetchAssessmentFromSheetsApi(
                      meta.spreadsheetId,
                      meta.tabs,
                      token,
                      preferredAssessTab,
                    ),
                  ]);
                  setSheetMeta({...meta, activeTab: targetTab});
                  setPosts(fetched);
                  setPublicSheetId(meta.spreadsheetId);
                  setDataSourceMode('sheets-api');
                  localStorage.setItem(
                    PUBLIC_SHEET_STORAGE_KEY,
                    meta.spreadsheetId,
                  );
                  applyLoadedResources(meta.spreadsheetId, resData);
                  applyLoadedAssessments(meta.spreadsheetId, assessData);
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
  }, [loadPublicSheet, applyLoadedResources, applyLoadedAssessments]);

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

  const topicGroups = useMemo(
    () => groupPostsByTopic(filteredPosts, selectedCategory),
    [filteredPosts, selectedCategory],
  );

  const visibleResources = useMemo(() => {
    return resources
      .filter((r) => isTeacherAdmin || r.isPublic)
      .filter((r) => {
        if (
          resourceGradeFilter !== '全部年段' &&
          r.gradeBand !== resourceGradeFilter
        ) {
          return false;
        }
        return true;
      })
      .sort((a, b) => {
        if (a.isPinned !== b.isPinned) return a.isPinned ? -1 : 1;
        return b.publishedAt.localeCompare(a.publishedAt);
      });
  }, [resources, isTeacherAdmin, resourceGradeFilter]);

  const publishedAssessmentQuestions = useMemo(
    () => assessmentQuestions.filter((item) => item.isPublished),
    [assessmentQuestions],
  );

  const handleOpenResourcesHub = useCallback(
    (initialResource?: TeachingResource) => {
      setPendingOpenResource(initialResource ?? null);
      setIsResourcesHubOpen(true);
    },
    [],
  );

  const handleOpenAssessmentBank = useCallback(
    (initialGrade?: string | null, initialQuestionId?: string | null) => {
      setPendingAssessmentGrade(initialGrade ?? null);
      setPendingAssessmentQuestionId(initialQuestionId ?? null);
      setIsAssessmentBankOpen(true);
    },
    [],
  );

  const activeChannelSwipeDeck = useMemo(
    () =>
      buildChannelSwipeDeck({
        activeChannel: activePortalChannel,
        featuredPosts: featuredSpotlightPosts,
        topicGroups,
        checkPostLocked,
        visibleResources,
        publishedAssessmentQuestions,
        assessmentGradeFilter,
        assessmentTabName,
        isXimenLocked,
        isClass403Locked,
        onSelectPost: setActivePost,
        onOpenResourcesHub: handleOpenResourcesHub,
        onOpenAssessmentBank: handleOpenAssessmentBank,
        onOpenXimenStage: openXimenStage,
        onOpenClass403Stage: openClass403Stage,
      }),
    [
      activePortalChannel,
      featuredSpotlightPosts,
      topicGroups,
      checkPostLocked,
      visibleResources,
      publishedAssessmentQuestions,
      assessmentGradeFilter,
      assessmentTabName,
      isXimenLocked,
      isClass403Locked,
      handleOpenResourcesHub,
      handleOpenAssessmentBank,
      openXimenStage,
      openClass403Stage,
    ],
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
  const handleSignIn = async (): Promise<{
    user: User;
    accessToken: string;
  } | null> => {
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
            const preferredAssessTab = readSelectedAssessmentTabPreference(
              meta.spreadsheetId,
            );
            const [fetched, remoteSettings, resData, assessData] =
              await Promise.all([
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
                fetchResourcesFromSheetsApi(
                  meta.spreadsheetId,
                  meta.tabs,
                  result.accessToken,
                ),
                fetchAssessmentFromSheetsApi(
                  meta.spreadsheetId,
                  meta.tabs,
                  result.accessToken,
                  preferredAssessTab,
                ),
              ]);
            setSheetMeta(meta);
            setPosts(fetched);
            setPublicSheetId(meta.spreadsheetId);
            setDataSourceMode('sheets-api');
            applyRemoteSettingsIfEnabled(remoteSettings, meta.title);
            applyLoadedResources(meta.spreadsheetId, resData);
            applyLoadedAssessments(meta.spreadsheetId, assessData);
          } catch {
            // Keep existing view if signed-in account lacks permission on the public sheet
          }
        }
        return result;
      }
      return null;
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
      return null;
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
    setDeckModalPost(null);
    setMinutesModalPost(null);
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
      const preferredAssessTab = readSelectedAssessmentTabPreference(
        meta.spreadsheetId,
      );
      const [fetched, remoteSettings, resData, assessData] = await Promise.all([
        fetchPostsFromSheetsApi(meta.spreadsheetId, meta.activeTab, token),
        fetchSiteSettingsFromSheetsApi(meta.spreadsheetId, meta.tabs, token),
        fetchResourcesFromSheetsApi(meta.spreadsheetId, meta.tabs, token),
        fetchAssessmentFromSheetsApi(
          meta.spreadsheetId,
          meta.tabs,
          token,
          preferredAssessTab,
        ),
      ]);
      setSheetMeta(meta);
      setPosts(fetched);
      setPublicSheetId(meta.spreadsheetId);
      setDataSourceMode('sheets-api');
      localStorage.setItem(PUBLIC_SHEET_STORAGE_KEY, meta.spreadsheetId);
      applyRemoteSettingsIfEnabled(remoteSettings, meta.title);
      applyLoadedResources(meta.spreadsheetId, resData);
      applyLoadedAssessments(meta.spreadsheetId, assessData);
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
        const [fetched, remoteSettings, resData, assessData] = await Promise.all([
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
          fetchResourcesFromSheetsApi(
            sheetMeta.spreadsheetId,
            sheetMeta.tabs,
            token,
          ),
          fetchAssessmentFromSheetsApi(
            sheetMeta.spreadsheetId,
            sheetMeta.tabs,
            token,
            assessmentTabName,
          ),
        ]);
        setPosts(fetched);
        applyRemoteSettingsIfEnabled(remoteSettings, sheetMeta.title);
        applyLoadedResources(sheetMeta.spreadsheetId, resData);
        applyLoadedAssessments(sheetMeta.spreadsheetId, assessData);
      } catch (err: any) {
        const msg = err?.message || '';
        if (
          msg.includes('401') ||
          msg.toLowerCase().includes('invalid authentication credentials') ||
          msg.toLowerCase().includes('unauthenticated') ||
          msg.toLowerCase().includes('invalid credentials')
        ) {
          clearAccessToken();
          setHasAccessToken(false);
          setSyncError('Google Sheets 授權工作階段已過期，請重新授權登入後再試。');
        } else {
          setSyncError(msg || '重新同步 Google Sheet 失敗。');
        }
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

  const isSheetsAuthExpired = (err: unknown): boolean => {
    const msg = (
      err instanceof Error ? err.message : String(err ?? '')
    ).toLowerCase();
    return (
      msg.includes('401') ||
      msg.includes('unauthenticated') ||
      msg.includes('invalid authentication credentials') ||
      msg.includes('invalid credentials')
    );
  };

  const handleSyncSeedResourcesToSheet = async () => {
    const targetId =
      sheetMeta?.spreadsheetId || publicSheetId || DEFAULT_PUBLIC_SHEET_ID;
    if (!targetId) {
      setSyncError('尚未連結目標 Google 試算表。');
      return;
    }
    let token = getAccessToken();
    if (!token) {
      const authResult = await handleSignIn();
      token = authResult?.accessToken || getAccessToken();
    }
    if (!token) {
      setSyncError('請先登入並授權 Google Sheets 寫入權限後，再同步資源分頁。');
      return;
    }
    setIsSyncing(true);
    setSyncError(null);
    try {
      const activeMeta =
        sheetMeta && sheetMeta.spreadsheetId === targetId
          ? sheetMeta
          : await fetchSpreadsheetMeta(targetId, token);
      const ensured = await ensureResourcesTabExists(
        activeMeta.spreadsheetId,
        activeMeta.tabs,
        token,
      );
      const existingRemote = await fetchResourcesFromSheetsApi(
        activeMeta.spreadsheetId,
        ensured.tabs,
        token,
      );
      if (existingRemote.resources.length === 0 && resources.length > 0) {
        await batchAppendResourcesToSheet(
          activeMeta.spreadsheetId,
          ensured.tabName,
          resources,
          token,
          existingRemote.headerRow,
        );
      }
      const refreshed = await fetchResourcesFromSheetsApi(
        activeMeta.spreadsheetId,
        ensured.tabs,
        token,
      );
      setSheetMeta({
        ...activeMeta,
        activeTab: publicTabName || activeMeta.activeTab,
        tabs: ensured.tabs,
      });
      setDataSourceMode('sheets-api');
      setHasRemoteResourcesTab(true);
      setResources(refreshed.resources);
      writeLocalResourcesCache(activeMeta.spreadsheetId, refreshed.resources);
    } catch (err: any) {
      if (isSheetsAuthExpired(err)) {
        clearAccessToken();
        setHasAccessToken(false);
        setSyncError(
          'Google Sheets 登入授權已過期，請重新點擊「授權 Google Sheets 寫入權限」後再試一次。',
        );
      } else {
        setSyncError(err?.message || '建立並寫入 Resources 分頁失敗。');
      }
    } finally {
      setIsSyncing(false);
    }
  };

  const handleSaveResource = async (
    resource: TeachingResource,
    isNew: boolean,
  ) => {
    const targetId =
      sheetMeta?.spreadsheetId || publicSheetId || DEFAULT_PUBLIC_SHEET_ID;
    let token = getAccessToken();

    if (targetId) {
      if (!token) {
        const authResult = await handleSignIn();
        token = authResult?.accessToken || getAccessToken();
        if (!token) {
          throw new Error(
            '尚未完成 Google Sheets 寫入授權，本次資源尚未儲存至雲端試算表（為避免重新整理後遺失，請完成 Google 授權後再點擊「確認發布資源」，表單內容已保留）。',
          );
        }
      }

      setIsSyncing(true);
      setSyncError(null);
      try {
        const activeMeta =
          sheetMeta && sheetMeta.spreadsheetId === targetId
            ? sheetMeta
            : await fetchSpreadsheetMeta(targetId, token);
        const ensured = await ensureResourcesTabExists(
          activeMeta.spreadsheetId,
          activeMeta.tabs,
          token,
        );
        const existingRemote = await fetchResourcesFromSheetsApi(
          activeMeta.spreadsheetId,
          ensured.tabs,
          token,
        );

        // If tab was newly created just now, keep any other existing local items synced too
        if (ensured.createdNow) {
          const existingLocal = resources.filter((r) => r.id !== resource.id);
          if (existingLocal.length > 0) {
            await batchAppendResourcesToSheet(
              activeMeta.spreadsheetId,
              ensured.tabName,
              existingLocal,
              token,
              existingRemote.headerRow,
            );
          }
          await appendResourceToSheet(
            activeMeta.spreadsheetId,
            ensured.tabName,
            resource,
            token,
            existingRemote.headerRow,
          );
        } else {
          const matchedRow =
            !isNew && resource.rowIndex
              ? resource.rowIndex
              : existingRemote.resources.find((r) => r.id === resource.id)
                  ?.rowIndex;

          if (isNew || !matchedRow) {
            await appendResourceToSheet(
              activeMeta.spreadsheetId,
              ensured.tabName,
              resource,
              token,
              existingRemote.headerRow,
            );
          } else {
            await updateResourceInSheet(
              activeMeta.spreadsheetId,
              ensured.tabName,
              matchedRow,
              resource,
              token,
              existingRemote.headerRow,
            );
          }
        }

        const refreshed = await fetchResourcesFromSheetsApi(
          activeMeta.spreadsheetId,
          ensured.tabs,
          token,
        );
        setSheetMeta({
          ...activeMeta,
          activeTab: publicTabName || activeMeta.activeTab,
          tabs: ensured.tabs,
        });
        setDataSourceMode('sheets-api');
        setHasRemoteResourcesTab(true);
        setResources(refreshed.resources);
        writeLocalResourcesCache(activeMeta.spreadsheetId, refreshed.resources);
        return;
      } catch (err: any) {
        if (isSheetsAuthExpired(err)) {
          clearAccessToken();
          setHasAccessToken(false);
          throw new Error(
            'Google Sheets 登入授權已過期，請重新授權 Google 帳號後再點擊「確認發布資源」（表單內容已保留）。',
          );
        }
        throw err;
      } finally {
        setIsSyncing(false);
      }
    }

    // Fallback: only used when no Google Sheet is configured at all
    setResources((prev) => {
      const next = isNew
        ? [resource, ...prev]
        : prev.map((item) => (item.id === resource.id ? resource : item));
      writeLocalResourcesCache(targetId, next);
      return next;
    });
  };

  const handleDeleteResource = (resource: TeachingResource) => {
    const targetId =
      sheetMeta?.spreadsheetId || publicSheetId || DEFAULT_PUBLIC_SHEET_ID;
    const isRemoteSheetTarget = Boolean(
      targetId && (hasRemoteResourcesTab || sheetMeta),
    );

    setConfirmState({
      isOpen: true,
      title: isRemoteSheetTarget
        ? '確認從 Google Sheet 刪除此教學資源？'
        : '確認從教學資源清單移除此項目？',
      description: isRemoteSheetTarget
        ? `即將自 Google 試算表「${sheetMeta?.title || 'Resources'}」分頁永久刪除這筆教學資源（若重新整理後尚未取得寫入授權，確認時將先跳出 Google 授權視窗）。`
        : '此操作將從目前的本機資源列表中移除該項目。',
      details: [
        `資源標題：${resource.title}`,
        `年段與類型：${resource.gradeBand} · ${resource.resourceType}`,
      ],
      confirmLabel: '確認刪除',
      isDestructive: true,
      onConfirm: async () => {
        if (isRemoteSheetTarget && targetId) {
          let token = getAccessToken();
          if (!token) {
            const authResult = await handleSignIn();
            token = authResult?.accessToken || getAccessToken();
          }
          if (!token) {
            setSyncError(
              '尚未完成 Google Sheets 寫入授權，已取消刪除以確保與雲端試算表一致。',
            );
            return;
          }

          setIsSyncing(true);
          setSyncError(null);
          try {
            const activeMeta =
              sheetMeta && sheetMeta.spreadsheetId === targetId
                ? sheetMeta
                : await fetchSpreadsheetMeta(targetId, token);
            const resTab = findResourcesTab(activeMeta.tabs);
            if (!resTab) {
              throw new Error('找不到「Resources」教學資源分頁。');
            }
            const existingRemote = await fetchResourcesFromSheetsApi(
              activeMeta.spreadsheetId,
              activeMeta.tabs,
              token,
            );
            const targetRowIndex =
              resource.rowIndex ||
              existingRemote.resources.find((r) => r.id === resource.id)
                ?.rowIndex;
            if (!targetRowIndex) {
              throw new Error(
                '在 Google Sheet 中找不到此資源列，請按「重新同步」後再試。',
              );
            }
            await deleteResourceFromSheet(
              activeMeta.spreadsheetId,
              resTab.sheetId,
              targetRowIndex,
              token,
            );
            const refreshed = await fetchResourcesFromSheetsApi(
              activeMeta.spreadsheetId,
              activeMeta.tabs,
              token,
            );
            setSheetMeta({
              ...activeMeta,
              activeTab: publicTabName || activeMeta.activeTab,
            });
            setDataSourceMode('sheets-api');
            setResources(refreshed.resources);
            writeLocalResourcesCache(
              activeMeta.spreadsheetId,
              refreshed.resources,
            );
          } catch (err: any) {
            if (isSheetsAuthExpired(err)) {
              clearAccessToken();
              setHasAccessToken(false);
              setSyncError(
                'Google Sheets 登入授權已過期，請重新授權後再試一次。',
              );
            } else {
              setSyncError(err?.message || '刪除 Google Sheet 教學資源失敗。');
            }
          } finally {
            setIsSyncing(false);
          }
        } else {
          setResources((prev) => {
            const next = prev.filter((item) => item.id !== resource.id);
            writeLocalResourcesCache(targetId, next);
            return next;
          });
        }
      },
    });
  };

  const handleUploadResourceFile = async (
    file: File,
    categoryFolder?: string,
  ): Promise<DriveUploadResult> => {
    let token = getAccessToken();
    if (!token) {
      const authResult = await handleSignIn();
      token = authResult?.accessToken || getAccessToken();
      if (!token) {
        throw new Error(
          '請先完成 Google 帳號授權，才能上傳檔案至 Google 雲端硬碟。',
        );
      }
    }
    try {
      return await uploadTeachingResourceFileToDrive(
        file,
        token,
        categoryFolder,
      );
    } catch (err: any) {
      if (isSheetsAuthExpired(err)) {
        clearAccessToken();
        setHasAccessToken(false);
        throw new Error('Google 授權已過期，請重新授權後再上傳檔案。');
      }
      throw err;
    }
  };

  const handleSelectAssessmentTab = async (tabName: string) => {
    const cleanTab = tabName.trim() || DEFAULT_ASSESSMENT_TAB_NAME;
    const targetId =
      sheetMeta?.spreadsheetId || publicSheetId || DEFAULT_PUBLIC_SHEET_ID;
    writeSelectedAssessmentTabPreference(targetId, cleanTab);
    setAssessmentTabName(cleanTab);
    if (!targetId) return;

    setIsSyncing(true);
    setSyncError(null);
    try {
      const token = getAccessToken();
      if (token) {
        const activeMeta =
          sheetMeta && sheetMeta.spreadsheetId === targetId
            ? sheetMeta
            : await fetchSpreadsheetMeta(targetId, token);
        const assessData = await fetchAssessmentFromSheetsApi(
          activeMeta.spreadsheetId,
          activeMeta.tabs,
          token,
          cleanTab,
        );
        setSheetMeta({
          ...activeMeta,
          activeTab: publicTabName || activeMeta.activeTab,
        });
        applyLoadedAssessments(activeMeta.spreadsheetId, assessData);
      } else {
        const assessData = await fetchAssessmentFromPublicGviz(
          targetId,
          cleanTab,
        );
        applyLoadedAssessments(targetId, assessData);
      }
    } catch (err: any) {
      setSyncError(err?.message || `讀取「${cleanTab}」題庫分頁失敗。`);
    } finally {
      setIsSyncing(false);
    }
  };

  const handleSyncSeedAssessmentsToSheet = (tabName: string) => {
    const cleanTab = tabName.trim() || DEFAULT_ASSESSMENT_TAB_NAME;
    const targetId =
      sheetMeta?.spreadsheetId || publicSheetId || DEFAULT_PUBLIC_SHEET_ID;
    if (!targetId) {
      setSyncError('尚未連結目標 Google 試算表。');
      return;
    }

    setConfirmState({
      isOpen: true,
      title: `確認在 Google Sheet 建立「${cleanTab}」題庫分頁？`,
      description: `系統將在目標 Google 試算表中確認或新建「${cleanTab}」分頁並寫入標準欄位表頭；若該分頁目前為空，將寫入 ${SEED_ASSESSMENT_QUESTIONS.length} 題示範學力檢測試題。`,
      details: [
        `試算表 ID：${targetId}`,
        `目標分頁名稱：${cleanTab}`,
        `寫入範例題數：${SEED_ASSESSMENT_QUESTIONS.length} 題（單選題＋建構反應題）`,
      ],
      confirmLabel: '確認建立並同步',
      isDestructive: false,
      onConfirm: async () => {
        let token = getAccessToken();
        if (!token) {
          const authResult = await handleSignIn();
          token = authResult?.accessToken || getAccessToken();
        }
        if (!token) {
          setSyncError('請先完成 Google Sheets 寫入授權，再同步題庫分頁。');
          return;
        }
        setIsSyncing(true);
        setSyncError(null);
        try {
          const activeMeta =
            sheetMeta && sheetMeta.spreadsheetId === targetId
              ? sheetMeta
              : await fetchSpreadsheetMeta(targetId, token);
          const ensured = await ensureAssessmentTabExists(
            activeMeta.spreadsheetId,
            activeMeta.tabs,
            cleanTab,
            token,
          );
          const existingRemote = await fetchAssessmentFromSheetsApi(
            activeMeta.spreadsheetId,
            ensured.tabs,
            token,
            ensured.tabName,
          );
          if (existingRemote.questions.length === 0) {
            await batchAppendAssessmentQuestionsToSheet(
              activeMeta.spreadsheetId,
              ensured.tabName,
              SEED_ASSESSMENT_QUESTIONS,
              token,
              existingRemote.headerRow,
            );
          }
          const refreshed = await fetchAssessmentFromSheetsApi(
            activeMeta.spreadsheetId,
            ensured.tabs,
            token,
            ensured.tabName,
          );
          writeSelectedAssessmentTabPreference(
            activeMeta.spreadsheetId,
            ensured.tabName,
          );
          setSheetMeta({
            ...activeMeta,
            activeTab: publicTabName || activeMeta.activeTab,
            tabs: ensured.tabs,
          });
          setDataSourceMode('sheets-api');
          applyLoadedAssessments(activeMeta.spreadsheetId, refreshed);
        } catch (err: any) {
          if (isSheetsAuthExpired(err)) {
            clearAccessToken();
            setHasAccessToken(false);
            setSyncError('Google Sheets 授權已過期，請重新登入後再試。');
          } else {
            setSyncError(err?.message || `寫入「${cleanTab}」題庫分頁失敗。`);
          }
        } finally {
          setIsSyncing(false);
        }
      },
    });
  };

  const handleSaveAssessmentQuestion = async (
    question: AssessmentQuestion,
    isNew: boolean,
    tabName: string,
    onSaved?: () => void,
  ) => {
    const cleanTab = tabName.trim() || DEFAULT_ASSESSMENT_TAB_NAME;
    const targetId =
      sheetMeta?.spreadsheetId || publicSheetId || DEFAULT_PUBLIC_SHEET_ID;

    if (!targetId) {
      setAssessmentQuestions((prev) => {
        const next = isNew
          ? [question, ...prev]
          : prev.map((q) => (q.id === question.id ? question : q));
        writeLocalAssessmentsCache(targetId, cleanTab, next);
        return next;
      });
      onSaved?.();
      return;
    }

    let token = getAccessToken();
    if (!token) {
      const authResult = await handleSignIn();
      token = authResult?.accessToken || getAccessToken();
      if (!token) {
        throw new Error(
          '尚未完成 Google Sheets 寫入授權，請先完成授權後再儲存至試算表分頁。',
        );
      }
    }

    setConfirmState({
      isOpen: true,
      title: isNew
        ? `確認新增試題至 Google Sheet「${cleanTab}」分頁？`
        : `確認更新 Google Sheet「${cleanTab}」分頁試題？`,
      description: isNew
        ? `即將在試算表「${sheetMeta?.title || targetId}」的「${cleanTab}」分頁新增一筆試題資料列（若該分頁尚未存在，將自動建立表頭）。`
        : `即將覆寫「${cleanTab}」分頁第 ${question.rowIndex || '目標'} 列的現有試題內容。`,
      details: [
        `年級與單元：${question.grade} · ${question.unitTitle}`,
        `認知層次／題型：${question.cognitiveLevel} · ${
          question.questionType === 'single-choice' ? '單選題' : '建構反應題'
        }`,
        `公開狀態：${question.isPublished ? '立即公開給學生練習' : '草稿'}`,
      ],
      confirmLabel: isNew ? '確認寫入題庫' : '確認覆寫更新',
      isDestructive: false,
      onConfirm: async () => {
        const activeToken = getAccessToken();
        if (!activeToken) {
          setSyncError('Google Sheets 授權已過期，請重新登入後再試。');
          return;
        }
        setIsSyncing(true);
        setSyncError(null);
        try {
          const activeMeta =
            sheetMeta && sheetMeta.spreadsheetId === targetId
              ? sheetMeta
              : await fetchSpreadsheetMeta(targetId, activeToken);
          const ensured = await ensureAssessmentTabExists(
            activeMeta.spreadsheetId,
            activeMeta.tabs,
            cleanTab,
            activeToken,
          );
          const existingRemote = await fetchAssessmentFromSheetsApi(
            activeMeta.spreadsheetId,
            ensured.tabs,
            activeToken,
            ensured.tabName,
          );

          if (ensured.createdNow) {
            const existingLocal = assessmentQuestions.filter(
              (item) => item.id !== question.id,
            );
            if (existingLocal.length > 0) {
              await batchAppendAssessmentQuestionsToSheet(
                activeMeta.spreadsheetId,
                ensured.tabName,
                existingLocal,
                activeToken,
                existingRemote.headerRow,
              );
            }
            await appendAssessmentQuestionToSheet(
              activeMeta.spreadsheetId,
              ensured.tabName,
              question,
              activeToken,
              existingRemote.headerRow,
            );
          } else {
            const matchedRow =
              !isNew && question.rowIndex
                ? question.rowIndex
                : existingRemote.questions.find((item) => item.id === question.id)
                    ?.rowIndex;
            if (isNew || !matchedRow) {
              await appendAssessmentQuestionToSheet(
                activeMeta.spreadsheetId,
                ensured.tabName,
                question,
                activeToken,
                existingRemote.headerRow,
              );
            } else {
              await updateAssessmentQuestionInSheet(
                activeMeta.spreadsheetId,
                ensured.tabName,
                matchedRow,
                question,
                activeToken,
                existingRemote.headerRow,
              );
            }
          }

          const refreshed = await fetchAssessmentFromSheetsApi(
            activeMeta.spreadsheetId,
            ensured.tabs,
            activeToken,
            ensured.tabName,
          );
          writeSelectedAssessmentTabPreference(
            activeMeta.spreadsheetId,
            ensured.tabName,
          );
          setSheetMeta({
            ...activeMeta,
            activeTab: publicTabName || activeMeta.activeTab,
            tabs: ensured.tabs,
          });
          setDataSourceMode('sheets-api');
          applyLoadedAssessments(activeMeta.spreadsheetId, refreshed);
          onSaved?.();
        } catch (err: any) {
          if (isSheetsAuthExpired(err)) {
            clearAccessToken();
            setHasAccessToken(false);
            setSyncError('Google Sheets 授權已過期，請重新登入後再儲存。');
          } else {
            setSyncError(err?.message || '儲存試題至 Google Sheet 失敗。');
          }
        } finally {
          setIsSyncing(false);
        }
      },
    });
  };

  const handleDeleteAssessmentQuestion = (
    question: AssessmentQuestion,
    tabName: string,
  ) => {
    const cleanTab = tabName.trim() || DEFAULT_ASSESSMENT_TAB_NAME;
    const targetId =
      sheetMeta?.spreadsheetId || publicSheetId || DEFAULT_PUBLIC_SHEET_ID;
    const isRemoteTarget = Boolean(
      targetId && (hasRemoteAssessmentTab || sheetMeta),
    );

    setConfirmState({
      isOpen: true,
      title: isRemoteTarget
        ? `確認從 Google Sheet「${cleanTab}」刪除此試題？`
        : '確認從目前題庫移除此試題？',
      description: isRemoteTarget
        ? `即將自 Google 試算表「${cleanTab}」分頁永久刪除這筆題目資料列，刪除後無法復原。`
        : '此操作將從本機題庫清單中移除該試題。',
      details: [
        `年級與單元：${question.grade} · ${question.unitTitle}`,
        `題幹摘要：${question.stem.slice(0, 60)}${question.stem.length > 60 ? '…' : ''}`,
      ],
      confirmLabel: '確認刪除試題',
      isDestructive: true,
      onConfirm: async () => {
        if (isRemoteTarget && targetId) {
          let token = getAccessToken();
          if (!token) {
            const authResult = await handleSignIn();
            token = authResult?.accessToken || getAccessToken();
          }
          if (!token) {
            setSyncError('尚未完成 Google Sheets 寫入授權，已取消刪除。');
            return;
          }
          setIsSyncing(true);
          setSyncError(null);
          try {
            const activeMeta =
              sheetMeta && sheetMeta.spreadsheetId === targetId
                ? sheetMeta
                : await fetchSpreadsheetMeta(targetId, token);
            const targetTabObj = findAssessmentTab(activeMeta.tabs, cleanTab);
            if (!targetTabObj) {
              throw new Error(`找不到「${cleanTab}」題庫分頁。`);
            }
            const existingRemote = await fetchAssessmentFromSheetsApi(
              activeMeta.spreadsheetId,
              activeMeta.tabs,
              token,
              targetTabObj.title,
            );
            const targetRowIndex =
              question.rowIndex ||
              existingRemote.questions.find((item) => item.id === question.id)
                ?.rowIndex;
            if (!targetRowIndex) {
              throw new Error('在 Google Sheet 中找不到該試題列，請先重新同步。');
            }
            await deleteAssessmentQuestionFromSheet(
              activeMeta.spreadsheetId,
              targetTabObj.sheetId,
              targetRowIndex,
              token,
            );
            const refreshed = await fetchAssessmentFromSheetsApi(
              activeMeta.spreadsheetId,
              activeMeta.tabs,
              token,
              targetTabObj.title,
            );
            setSheetMeta({
              ...activeMeta,
              activeTab: publicTabName || activeMeta.activeTab,
            });
            setDataSourceMode('sheets-api');
            applyLoadedAssessments(activeMeta.spreadsheetId, refreshed);
          } catch (err: any) {
            if (isSheetsAuthExpired(err)) {
              clearAccessToken();
              setHasAccessToken(false);
              setSyncError('Google Sheets 授權已過期，請重新登入後再試。');
            } else {
              setSyncError(err?.message || '刪除 Google Sheet 試題失敗。');
            }
          } finally {
            setIsSyncing(false);
          }
        } else {
          setAssessmentQuestions((prev) => {
            const next = prev.filter((item) => item.id !== question.id);
            writeLocalAssessmentsCache(targetId, cleanTab, next);
            return next;
          });
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

  const selectPortalChannel = (channel: PortalMajorChannel) => {
    setActivePortalChannel(channel);
    if (channel === 'journal') {
      setSelectedCategory('全部分類');
    }
    setChannelJumpRequest((prev) => ({
      channel,
      nonce: (prev?.nonce ?? 0) + 1,
    }));
  };

  return (
    <div className="min-h-screen flex flex-col bg-[#FBF9F5] text-[#1C1917] overflow-x-clip">
      {/* Strictly Single-Row Responsive Navigation Bar */}
      <header className="sticky top-0 z-30 bg-[#FBF9F5]/95 backdrop-blur-sm border-b border-stone-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <div className="h-14 lg:h-16 flex items-center justify-between gap-3 min-w-0">
            {/* Zone 1: Single-line Brand Wordmark */}
            <a
              href="#top"
              onClick={(e) => {
                e.preventDefault();
                setActivePortalChannel('all');
                setSelectedYear('全部年度');
                setSelectedCategory('全部分類');
                setViewMode('swipe');
                window.scrollTo({top: 0, behavior: 'smooth'});
              }}
              className="font-editorial text-base sm:text-xl font-bold tracking-tight text-stone-950 truncate min-w-0"
            >
              {siteSettings.siteTitle}
            </a>

            {/* Zone 2: Desktop Single-line Major Channel Nav Links */}
            <nav
              aria-label="主頻道切換"
              className="hidden lg:flex items-center gap-1 text-xs xl:text-sm font-medium text-stone-600 shrink-0"
            >
              {PORTAL_MAJOR_CHANNELS.map((ch) => {
                const isActive = activePortalChannel === ch.id;
                const locked =
                  (ch.id === 'ximen' && isXimenLocked) ||
                  (ch.id === 'class403' && isClass403Locked);
                return (
                  <button
                    key={ch.id}
                    type="button"
                    onClick={() => selectPortalChannel(ch.id)}
                    className={`px-2.5 py-1.5 rounded-lg inline-flex items-center gap-1 active:scale-[0.97] transition-all whitespace-nowrap shrink-0 ${
                      isActive
                        ? 'bg-[#1E3A8A] text-white font-semibold shadow-xs'
                        : 'text-stone-700 hover:bg-stone-200/60 hover:text-stone-950'
                    }`}
                  >
                    {locked && (
                      <Lock
                        className={`w-3 h-3 shrink-0 ${
                          isActive ? 'text-amber-200' : 'text-amber-700'
                        }`}
                      />
                    )}
                    <span>{ch.label}</span>
                  </button>
                );
              })}
              <button
                type="button"
                onClick={() => {
                  setImmersiveSwipe({
                    isOpen: true,
                    scopeLabel: activeChannelSwipeDeck.scopeLabel,
                    groups: activeChannelSwipeDeck.groups,
                    topicIndex: 0,
                    cardIndex: 0,
                  });
                }}
                title="針對目前架構分區開啟滑動快覽：左右滑看同組內容、上下滑切換分組"
                className={`ml-0.5 px-2.5 py-1.5 rounded-lg inline-flex items-center gap-1.5 hover:bg-[#1E3A8A]/8 hover:text-[#1E3A8A] active:scale-[0.97] transition-all whitespace-nowrap shrink-0 ${
                  immersiveSwipe.isOpen
                    ? 'text-[#1E3A8A] bg-[#1E3A8A]/8 font-semibold'
                    : 'text-stone-800 font-medium'
                }`}
              >
                <GalleryHorizontalEnd className="w-3.5 h-3.5 text-[#1E3A8A]" />
                <span>滑動快覽</span>
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

        {/* Compact Editorial Masthead + Desktop Featured Spotlight */}
        <section className="border-b border-stone-200 bg-white">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 py-4 sm:py-5 lg:py-6">
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 lg:gap-8 items-center">
              {/* Left Column: Brand Masthead */}
              <div
                className={`${
                  featuredSpotlightPosts.length > 0 ? 'lg:col-span-7' : 'lg:col-span-12'
                } min-w-0 flex flex-col justify-center gap-2`}
              >
                {siteSettings.siteSubtitle.trim() && (
                  <p className="text-xs font-mono-tabular tracking-widest uppercase text-stone-500 break-words">
                    {siteSettings.siteSubtitle}
                  </p>
                )}
                <h1 className="font-editorial text-2xl sm:text-4xl lg:text-[40px] font-semibold text-stone-950 leading-[1.2] text-balance break-words">
                  {siteSettings.heroHeading}
                </h1>
                {siteSettings.heroDescription.trim() && (
                  <p className="text-sm sm:text-base text-stone-600 leading-relaxed max-w-2xl break-words">
                    {siteSettings.heroDescription}
                  </p>
                )}
              </div>

              {/* Right Column: Curated Featured Spotlight Showcase (Desktop lg+ only to keep mobile channel bar above the fold) */}
              {featuredSpotlightPosts.length > 0 ? (
                <div className="hidden lg:flex lg:col-span-5 min-w-0">
                  <FeaturedSpotlight
                    posts={featuredSpotlightPosts}
                    onSelectPost={(post) => setActivePost(post)}
                    checkPostLocked={checkPostLocked}
                  />
                </div>
              ) : null}
            </div>
          </div>
        </section>

        {/* Top Major Channel Bar + Vertical Sections × Horizontal Swipeable Card Trays */}
        <PortalChannelShowcase
          activeChannel={activePortalChannel}
          onSelectChannel={setActivePortalChannel}
          channelJumpRequest={channelJumpRequest}
            posts={posts}
            filteredPosts={filteredPosts}
            featuredPosts={featuredSpotlightPosts}
            topicGroups={topicGroups}
            availableCategories={availableCategories}
            categoryCounts={categoryCounts}
            selectedCategory={selectedCategory}
            onSelectCategory={setSelectedCategory}
            selectedYear={selectedYear}
            onSelectYear={setSelectedYear}
            availableYears={availableYears}
            yearCounts={yearCounts}
            searchQuery={searchQuery}
            onSearchQueryChange={setSearchQuery}
            onResetFilters={() => {
              setSearchQuery('');
              setSelectedYear('全部年度');
              setSelectedCategory('全部分類');
            }}
            viewMode={viewMode}
            onChangeViewMode={setViewMode}
            onSelectPost={(p) => setActivePost(p)}
            checkPostLocked={checkPostLocked}
            onOpenQuickSwipeDeck={(scopeLabel, groups, topicIndex, cardIndex) =>
              setImmersiveSwipe({
                isOpen: true,
                scopeLabel,
                groups,
                topicIndex,
                cardIndex,
              })
            }
            onOpenPresentationMode={() => setIsPresentationModeOpen(true)}
            includeDrafts={includeDrafts}
            onToggleIncludeDrafts={setIncludeDrafts}
            canShowDraftsToggle={Boolean(user && hasAccessToken)}
            onOpenEditor={() => openDrawer('editor')}
            onOpenRssImport={() => openDrawer('rss')}
            resources={resources}
            resourceGradeFilter={resourceGradeFilter}
            onChangeResourceGradeFilter={setResourceGradeFilter}
            isTeacherAdmin={isTeacherAdmin}
            onOpenResourcesHub={handleOpenResourcesHub}
            assessmentQuestions={assessmentQuestions}
            assessmentGradeFilter={assessmentGradeFilter}
            onChangeAssessmentGradeFilter={setAssessmentGradeFilter}
            assessmentTabName={assessmentTabName}
            onOpenAssessmentBank={handleOpenAssessmentBank}
            isXimenLocked={isXimenLocked}
            isClass403Locked={isClass403Locked}
            onOpenXimenStage={(tab) => openXimenStage(tab)}
            onOpenClass403Stage={(tab) => openClass403Stage(tab)}
          />
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
          isResourcesHubOpen ||
          isAssessmentBankOpen ||
          isPresentationModeOpen ||
          schoolAccessPrompt.isOpen ||
          meetingCheckinState.isOpen
        }
        scopeLabel={immersiveSwipe.scopeLabel}
        deckGroups={immersiveSwipe.groups}
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
        onGenerateDeck={
          isTeacherAdmin ? (targetPost) => setDeckModalPost(targetPost) : undefined
        }
        onExportMeetingMinutes={
          isTeacherAdmin ? (targetPost) => setMinutesModalPost(targetPost) : undefined
        }
        disableEscapeClose={
          siteQrMode === 'modal' ||
          Boolean(isTeacherAdmin && deckModalPost) ||
          Boolean(isTeacherAdmin && minutesModalPost)
        }
      />

      <ArticleDeckModal
        post={isTeacherAdmin ? deckModalPost : null}
        siteTitle={siteSettings.siteTitle}
        onClose={() => setDeckModalPost(null)}
      />

      <MeetingMinutesModal
        post={isTeacherAdmin ? minutesModalPost : null}
        onClose={() => setMinutesModalPost(null)}
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

      {/* Standalone Elementary Teaching Resources Platform Modal */}
      <TeachingResourcesHubModal
        isOpen={isResourcesHubOpen}
        onClose={() => {
          setCustomQrTarget(null);
          setPendingOpenResource(null);
          setIsResourcesHubOpen(false);
          if (window.location.hash === '#resources') {
            history.replaceState(
              null,
              '',
              window.location.pathname + window.location.search,
            );
          }
        }}
        resources={resources}
        posts={posts}
        checkPostLocked={checkPostLocked}
        hasRemoteResourcesTab={hasRemoteResourcesTab}
        spreadsheetId={sheetMeta?.spreadsheetId || publicSheetId || DEFAULT_PUBLIC_SHEET_ID}
        isSyncing={isSyncing}
        syncError={syncError}
        isTeacherAdmin={isTeacherAdmin}
        hasAccessToken={hasAccessToken}
        defaultAuthorName={user?.displayName || '黃佩詩 老師'}
        onRefreshSync={handleRefreshSync}
        onRequestSheetsAuth={handleSignIn}
        onSyncSeedToSheet={handleSyncSeedResourcesToSheet}
        onSaveResource={handleSaveResource}
        onDeleteResource={handleDeleteResource}
        onUploadResourceFile={handleUploadResourceFile}
        onOpenPost={(targetPost) => setActivePost(targetPost)}
        onOpenEmbedStage={(url, title) => {
          if (url.includes('ximen-scratch.html')) {
            openXimenStage('map');
          } else if (url.includes('class-403.html')) {
            openClass403Stage('agenda');
          } else {
            setInteractiveStage({
              isOpen: true,
              url,
              title,
              initialTab: 'map',
            });
          }
        }}
        onOpenShareQr={(url, title) => {
          setCustomQrTarget({url, title});
          setSiteQrTargetMode('current');
          setSiteQrMode('modal');
        }}
        initialOpenResource={pendingOpenResource}
        onConsumeInitialResource={() => setPendingOpenResource(null)}
        disableEscapeClose={
          siteQrMode === 'modal' ||
          Boolean(activePost) ||
          interactiveStage.isOpen ||
          Boolean(confirmState?.isOpen)
        }
      />

      {/* Interactive Elementary Math Assessment Question Bank Modal */}
      <AssessmentBankModal
        isOpen={isAssessmentBankOpen}
        onClose={() => {
          setCustomQrTarget(null);
          setPendingAssessmentGrade(null);
          setPendingAssessmentQuestionId(null);
          setIsAssessmentBankOpen(false);
          if (window.location.hash === '#assessment') {
            history.replaceState(
              null,
              '',
              window.location.pathname + window.location.search,
            );
          }
        }}
        questions={assessmentQuestions}
        activeTabName={assessmentTabName}
        availableTabs={sheetMeta?.tabs ?? []}
        hasRemoteAssessmentTab={hasRemoteAssessmentTab}
        spreadsheetId={
          sheetMeta?.spreadsheetId || publicSheetId || DEFAULT_PUBLIC_SHEET_ID
        }
        spreadsheetTitle={sheetMeta?.title}
        isSyncing={isSyncing}
        syncError={syncError}
        isTeacherAdmin={isTeacherAdmin}
        hasAccessToken={hasAccessToken}
        defaultAuthorName={user?.displayName || '黃佩詩 老師'}
        onRefreshSync={handleRefreshSync}
        onSelectAssessmentTab={handleSelectAssessmentTab}
        onRequestSheetsAuth={handleSignIn}
        onSyncSeedToSheet={handleSyncSeedAssessmentsToSheet}
        onSaveQuestion={handleSaveAssessmentQuestion}
        onDeleteQuestion={handleDeleteAssessmentQuestion}
        onUploadDiagramFile={handleUploadResourceFile}
        onOpenShareQr={(url, title) => {
          setCustomQrTarget({url, title});
          setSiteQrTargetMode('current');
          setSiteQrMode('modal');
        }}
        initialGradeFilter={pendingAssessmentGrade}
        initialQuestionId={pendingAssessmentQuestionId}
        onConsumeInitialGrade={() => {
          setPendingAssessmentGrade(null);
          setPendingAssessmentQuestionId(null);
        }}
        disableEscapeClose={
          siteQrMode === 'modal' || Boolean(confirmState?.isOpen)
        }
      />

      <PresentationModeModal
        isOpen={isPresentationModeOpen}
        posts={
          featuredSpotlightPosts.length > 0
            ? featuredSpotlightPosts
            : filteredPosts
        }
        siteTitle={siteSettings.siteTitle}
        checkPostLocked={checkPostLocked}
        onClose={() => setIsPresentationModeOpen(false)}
        onSelectPost={(targetPost) => {
          setIsPresentationModeOpen(false);
          setActivePost(targetPost);
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
