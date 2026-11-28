import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {
  ArrowUp,
  ArrowUpRight,
  BookOpen,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  ClipboardCheck,
  ExternalLink,
  FileText,
  FolderOpen,
  GalleryHorizontalEnd,
  GraduationCap,
  Layers,
  LayoutGrid,
  List,
  Lock,
  Map as MapIcon,
  MessageSquare,
  MonitorPlay,
  Presentation,
  Puzzle,
  Search,
  Sparkles,
} from 'lucide-react';
import {
  AssessmentQuestion,
  JournalPost,
  ResourceGradeBand,
  TeachingResource,
} from '../types/journal';
import {formatCategoryDisplay, TopicGroup} from '../utils/postFormatting';
import {
  buildChannelSwipeDeck,
  CLASS403_CARDS,
  Class403TabId,
  groupAssessmentByCognitive,
  InteractiveModuleCardMeta,
  PORTAL_MAJOR_CHANNELS,
  PortalMajorChannel,
  sortAssessmentGradeGroups,
  SwipeDeckGroup,
  XIMEN_CARDS,
  XimenTabId,
} from '../utils/swipeDeckBuilder';
import {ArticleCard} from './ArticleCard';
import {HorizontalCardTray} from './HorizontalCardTray';
import {TopicSwipeFeed} from './TopicSwipeFeed';

export {PORTAL_MAJOR_CHANNELS};
export type {PortalMajorChannel};

interface PortalChannelShowcaseProps {
  activeChannel: PortalMajorChannel;
  onSelectChannel: (channel: PortalMajorChannel) => void;
  channelJumpRequest?: {channel: PortalMajorChannel; nonce: number} | null;
  // Journal state
  posts: JournalPost[];
  filteredPosts: JournalPost[];
  featuredPosts: JournalPost[];
  topicGroups: TopicGroup[];
  availableCategories: string[];
  categoryCounts: Map<string, number>;
  selectedCategory: string;
  onSelectCategory: (cat: string) => void;
  selectedYear: string;
  onSelectYear: (year: string) => void;
  availableYears: string[];
  yearCounts: Map<string, number>;
  searchQuery: string;
  onSearchQueryChange: (query: string) => void;
  onResetFilters: () => void;
  viewMode: 'swipe' | 'grid' | 'list';
  onChangeViewMode: (mode: 'swipe' | 'grid' | 'list') => void;
  onSelectPost: (post: JournalPost) => void;
  checkPostLocked: (post: JournalPost) => boolean;
  onOpenQuickSwipeDeck: (
    scopeLabel: string,
    groups: SwipeDeckGroup[],
    topicIndex: number,
    cardIndex: number,
  ) => void;
  onOpenPresentationMode: () => void;
  includeDrafts: boolean;
  onToggleIncludeDrafts: (checked: boolean) => void;
  canShowDraftsToggle: boolean;
  onOpenEditor: () => void;
  onOpenRssImport: () => void;
  // Teaching Resources state
  resources: TeachingResource[];
  resourceGradeFilter: '全部年段' | ResourceGradeBand;
  onChangeResourceGradeFilter: (grade: '全部年段' | ResourceGradeBand) => void;
  isTeacherAdmin: boolean;
  onOpenResourcesHub: (initialResource?: TeachingResource) => void;
  // Assessment Bank state
  assessmentQuestions: AssessmentQuestion[];
  assessmentGradeFilter: string;
  onChangeAssessmentGradeFilter: (grade: string) => void;
  assessmentTabName: string;
  onOpenAssessmentBank: (
    initialGrade?: string | null,
    initialQuestionId?: string | null,
  ) => void;
  // Interactive Stages state
  isXimenLocked: boolean;
  isClass403Locked: boolean;
  onOpenXimenStage: (tab: XimenTabId) => void;
  onOpenClass403Stage: (tab: Class403TabId) => void;
}

const RESOURCE_GRADE_OPTIONS: Array<'全部年段' | ResourceGradeBand> = [
  '全部年段',
  '低年級 (1-2)',
  '中年級 (3-4)',
  '高年級 (5-6)',
  '跨年級通用',
];

function renderInteractiveIcon(
  iconKey: InteractiveModuleCardMeta<string>['iconKey'],
): React.ReactNode {
  switch (iconKey) {
    case 'map':
      return <MapIcon className="w-4 h-4 text-[#1E3A8A]" />;
    case 'sparkles':
      return <Sparkles className="w-4 h-4 text-[#1E3A8A]" />;
    case 'puzzle':
      return <Puzzle className="w-4 h-4 text-[#1E3A8A]" />;
    case 'clipboard':
      return <ClipboardCheck className="w-4 h-4 text-[#1E3A8A]" />;
    case 'book':
      return <BookOpen className="w-4 h-4 text-[#1E3A8A]" />;
    case 'calendar':
      return <CalendarDays className="w-4 h-4 text-[#1E3A8A]" />;
    case 'folder':
      return <FolderOpen className="w-4 h-4 text-[#1E3A8A]" />;
    case 'message':
      return <MessageSquare className="w-4 h-4 text-[#1E3A8A]" />;
  }
}

export const PortalChannelShowcase: React.FC<PortalChannelShowcaseProps> = ({
  activeChannel,
  onSelectChannel,
  channelJumpRequest,
  posts,
  filteredPosts,
  featuredPosts,
  topicGroups,
  availableCategories,
  categoryCounts,
  selectedCategory,
  onSelectCategory,
  selectedYear,
  onSelectYear,
  availableYears,
  yearCounts,
  searchQuery,
  onSearchQueryChange,
  onResetFilters,
  viewMode,
  onChangeViewMode,
  onSelectPost,
  checkPostLocked,
  onOpenQuickSwipeDeck,
  onOpenPresentationMode,
  includeDrafts,
  onToggleIncludeDrafts,
  canShowDraftsToggle,
  onOpenEditor,
  onOpenRssImport,
  resources,
  resourceGradeFilter,
  onChangeResourceGradeFilter,
  isTeacherAdmin,
  onOpenResourcesHub,
  assessmentQuestions,
  assessmentGradeFilter,
  onChangeAssessmentGradeFilter,
  assessmentTabName,
  onOpenAssessmentBank,
  isXimenLocked,
  isClass403Locked,
  onOpenXimenStage,
  onOpenClass403Stage,
}) => {
  const stickyBarRef = useRef<HTMLDivElement | null>(null);
  const channelListRef = useRef<HTMLDivElement | null>(null);
  const categoryBarRef = useRef<HTMLDivElement | null>(null);
  const journalSubBarRef = useRef<HTMLDivElement | null>(null);
  const journalFeedTopRef = useRef<HTMLDivElement | null>(null);
  const channelTabRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const activeChannelRef = useRef<PortalMajorChannel>(activeChannel);
  const programmaticScrollLockUntilRef = useRef<number>(0);
  const lastHandledJumpNonceRef = useRef<number>(0);

  const scrollToJournalFeedIfStuck = useCallback(() => {
    const subBarEl = journalSubBarRef.current;
    const feedEl = journalFeedTopRef.current;
    if (!subBarEl || !feedEl) return;
    const stickyThreshold = window.innerWidth >= 1024 ? 126 : 118;
    const subBarRect = subBarEl.getBoundingClientRect();
    if (subBarRect.top <= stickyThreshold) {
      const feedTop = feedEl.getBoundingClientRect().top + window.scrollY;
      const desiredOffset = stickyThreshold + subBarRect.height + 10;
      const targetY = Math.max(0, feedTop - desiredOffset);
      if (window.scrollY > targetY + 4) {
        window.scrollTo({top: targetY, behavior: 'smooth'});
      }
    }
  }, []);

  activeChannelRef.current = activeChannel;

  const activeChannelIndex = Math.max(
    0,
    PORTAL_MAJOR_CHANNELS.findIndex((c) => c.id === activeChannel),
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

  const assessmentGradeGroups = useMemo(
    () => sortAssessmentGradeGroups(publishedAssessmentQuestions),
    [publishedAssessmentQuestions],
  );

  const assessmentCognitiveGroups = useMemo(() => {
    if (assessmentGradeFilter === '全部年級') return [];
    const filtered = publishedAssessmentQuestions.filter(
      (q) => q.grade === assessmentGradeFilter,
    );
    return groupAssessmentByCognitive(filtered);
  }, [publishedAssessmentQuestions, assessmentGradeFilter]);

  const fullOverviewDeck = useMemo(
    () =>
      buildChannelSwipeDeck({
        activeChannel: 'all',
        featuredPosts,
        topicGroups,
        checkPostLocked,
        visibleResources,
        publishedAssessmentQuestions,
        assessmentGradeFilter,
        assessmentTabName,
        isXimenLocked,
        isClass403Locked,
        onSelectPost,
        onOpenResourcesHub,
        onOpenAssessmentBank,
        onOpenXimenStage,
        onOpenClass403Stage,
      }),
    [
      featuredPosts,
      topicGroups,
      checkPostLocked,
      visibleResources,
      publishedAssessmentQuestions,
      assessmentGradeFilter,
      assessmentTabName,
      isXimenLocked,
      isClass403Locked,
      onSelectPost,
      onOpenResourcesHub,
      onOpenAssessmentBank,
      onOpenXimenStage,
      onOpenClass403Stage,
    ],
  );

  const currentChannelDeck = useMemo(
    () =>
      buildChannelSwipeDeck({
        activeChannel,
        featuredPosts,
        topicGroups,
        checkPostLocked,
        visibleResources,
        publishedAssessmentQuestions,
        assessmentGradeFilter,
        assessmentTabName,
        isXimenLocked,
        isClass403Locked,
        onSelectPost,
        onOpenResourcesHub,
        onOpenAssessmentBank,
        onOpenXimenStage,
        onOpenClass403Stage,
      }),
    [
      activeChannel,
      featuredPosts,
      topicGroups,
      checkPostLocked,
      visibleResources,
      publishedAssessmentQuestions,
      assessmentGradeFilter,
      assessmentTabName,
      isXimenLocked,
      isClass403Locked,
      onSelectPost,
      onOpenResourcesHub,
      onOpenAssessmentBank,
      onOpenXimenStage,
      onOpenClass403Stage,
    ],
  );

  const sectionDescriptors = useMemo(() => {
    const list: Array<{domId: string; channel: PortalMajorChannel}> = [];
    if (featuredPosts.length > 0) {
      list.push({domId: 'sec-all', channel: 'all'});
    }
    list.push({domId: 'sec-journal', channel: 'journal'});
    list.push({domId: 'sec-resources', channel: 'resources'});
    list.push({domId: 'sec-assessment', channel: 'assessment'});
    list.push({domId: 'sec-ximen', channel: 'ximen'});
    list.push({domId: 'sec-class403', channel: 'class403'});
    return list;
  }, [featuredPosts.length]);

  const scrollToChannel = useCallback(
    (channel: PortalMajorChannel) => {
      programmaticScrollLockUntilRef.current = Date.now() + 750;
      onSelectChannel(channel);

      const fallbackId =
        channel === 'all' && featuredPosts.length === 0
          ? 'sec-journal'
          : `sec-${channel}`;
      const targetEl =
        document.getElementById(fallbackId) ||
        document.getElementById('portal-showcase');
      if (!targetEl) return;

      const showcaseEl = document.getElementById('portal-showcase');
      const isLg = window.matchMedia('(min-width: 1024px)').matches;
      const headerHeight = isLg ? 64 : 56;
      const stickyBarHeight = stickyBarRef.current?.offsetHeight ?? 45;
      const dockTop = headerHeight + stickyBarHeight + 16;

      const targetY =
        targetEl.getBoundingClientRect().top + window.scrollY - dockTop;
      const showcaseDockY = showcaseEl
        ? showcaseEl.getBoundingClientRect().top + window.scrollY - headerHeight
        : 0;

      const finalY = Math.max(0, Math.max(showcaseDockY, targetY));
      window.scrollTo({
        top: finalY,
        behavior: 'smooth',
      });
    },
    [featuredPosts.length, onSelectChannel],
  );

  // Sync desktop header channel clicks through the exact same smooth docking scroll
  useEffect(() => {
    if (
      !channelJumpRequest ||
      channelJumpRequest.nonce === lastHandledJumpNonceRef.current
    ) {
      return;
    }
    lastHandledJumpNonceRef.current = channelJumpRequest.nonce;
    scrollToChannel(channelJumpRequest.channel);
  }, [channelJumpRequest, scrollToChannel]);

  // Keep the active tab cleanly centered inside the horizontal tab bar ONLY (never touching vertical scroll)
  useEffect(() => {
    const list = channelListRef.current;
    const activeTabEl = channelTabRefs.current[activeChannel];
    if (!list || !activeTabEl) return;

    const targetLeft =
      activeTabEl.offsetLeft - list.clientWidth / 2 + activeTabEl.offsetWidth / 2;
    list.scrollTo({
      left: Math.max(0, targetLeft),
      behavior: 'smooth',
    });
  }, [activeChannel]);

  // Bi-directional scroll-spy: vertical scrolling updates activeChannel in real time
  useEffect(() => {
    if (sectionDescriptors.length === 0) return;

    let rafId = 0;

    const updateActiveFromScroll = () => {
      rafId = 0;
      if (Date.now() < programmaticScrollLockUntilRef.current) return;

      const scrollBottom = window.innerHeight + window.scrollY;
      const docHeight = document.documentElement.scrollHeight;
      if (docHeight > window.innerHeight && scrollBottom >= docHeight - 36) {
        const lastChannel =
          sectionDescriptors[sectionDescriptors.length - 1].channel;
        if (activeChannelRef.current !== lastChannel) {
          onSelectChannel(lastChannel);
        }
        return;
      }

      const stickyBottom =
        stickyBarRef.current?.getBoundingClientRect().bottom ?? 108;
      const triggerLine = stickyBottom + 60;

      let matchedChannel: PortalMajorChannel = sectionDescriptors[0].channel;
      for (let i = 0; i < sectionDescriptors.length; i++) {
        const el = document.getElementById(sectionDescriptors[i].domId);
        if (!el) continue;
        if (el.getBoundingClientRect().top <= triggerLine) {
          matchedChannel = sectionDescriptors[i].channel;
        }
      }

      if (matchedChannel !== activeChannelRef.current) {
        onSelectChannel(matchedChannel);
      }
    };

    const onScroll = () => {
      if (rafId) return;
      rafId = window.requestAnimationFrame(updateActiveFromScroll);
    };

    const cancelProgrammaticLock = () => {
      programmaticScrollLockUntilRef.current = 0;
    };

    window.addEventListener('scroll', onScroll, {passive: true});
    window.addEventListener('touchstart', cancelProgrammaticLock, {passive: true});
    window.addEventListener('wheel', cancelProgrammaticLock, {passive: true});

    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('touchstart', cancelProgrammaticLock);
      window.removeEventListener('wheel', cancelProgrammaticLock);
      if (rafId) window.cancelAnimationFrame(rafId);
    };
  }, [sectionDescriptors, onSelectChannel]);

  const prevChannelMeta =
    activeChannelIndex > 0 ? PORTAL_MAJOR_CHANNELS[activeChannelIndex - 1] : null;
  const nextChannelMeta =
    activeChannelIndex < PORTAL_MAJOR_CHANNELS.length - 1
      ? PORTAL_MAJOR_CHANNELS[activeChannelIndex + 1]
      : null;

  const renderResourceCard = (res: TeachingResource) => {
    const isEbook =
      res.resourceType === '電子書' ||
      /\.pdf(\b|$)/i.test(res.resourceUrl || '');
    return (
      <div
        key={res.id}
        className="w-[78vw] sm:w-[305px] lg:w-[325px] snap-start shrink-0 flex"
      >
        <article
          onClick={() => onOpenResourcesHub(res)}
          className="group w-full h-full cursor-pointer bg-white border border-stone-300/85 rounded-xl overflow-hidden flex flex-col justify-between shadow-[0_2px_10px_rgba(28,25,23,0.05)] transition-all duration-200 ease-out hover:-translate-y-1 hover:border-[#1E3A8A]/50 hover:shadow-[0_14px_28px_-6px_rgba(30,58,138,0.16)] active:scale-[0.99]"
        >
          <div>
            <div
              className={`h-1 w-full ${isEbook ? 'bg-[#1E3A8A]' : 'bg-amber-700'}`}
            />
            <div className="p-5 space-y-2.5">
              <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-stone-100 text-xs">
                <span className="font-bold text-[#1E3A8A] truncate">
                  {res.resourceType}
                </span>
                <span className="font-mono-tabular text-stone-500 whitespace-nowrap shrink-0">
                  {res.gradeBand}
                  {res.isPinned ? ' · 置頂精選' : ''}
                </span>
              </div>

              <h4 className="font-editorial text-[19px] font-bold text-stone-950 leading-[1.35] line-clamp-2 group-hover:text-[#1E3A8A] transition-colors">
                {res.title}
              </h4>

              <p className="text-sm text-stone-700 leading-[1.65] line-clamp-3">
                {res.summary || '點擊開啟完整教材說明與互動電子書閱覽。'}
              </p>

              {res.topicTags && (
                <div className="text-xs text-stone-500 truncate pt-0.5">
                  {res.topicTags}
                </div>
              )}
            </div>
          </div>

          <div className="px-5 pb-5 pt-3 border-t border-stone-200/80 flex items-center justify-between gap-3 text-xs">
            <span className="text-stone-500 truncate">
              <span className="font-medium text-stone-700">{res.author}</span>
              <span aria-hidden="true" className="mx-1.5">
                ·
              </span>
              <span className="font-mono-tabular">{res.publishedAt}</span>
            </span>
            <span className="font-semibold text-[#1E3A8A] inline-flex items-center gap-1 whitespace-nowrap shrink-0">
              <span>{isEbook ? '閱讀電子書' : '開啟資源'}</span>
              <ArrowUpRight className="w-3.5 h-3.5 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
            </span>
          </div>
        </article>
      </div>
    );
  };

  const renderInteractiveStageCard = (
    item: InteractiveModuleCardMeta<string>,
    isLocked: boolean,
    onOpen: () => void,
    systemLabel: string,
  ) => (
    <div
      key={`${systemLabel}-${item.id}`}
      className="w-[78vw] sm:w-[305px] lg:w-[325px] snap-start shrink-0 flex"
    >
      <article
        onClick={onOpen}
        className="group w-full h-full cursor-pointer bg-white border border-stone-300/85 rounded-xl overflow-hidden flex flex-col justify-between shadow-[0_2px_10px_rgba(28,25,23,0.05)] transition-all duration-200 ease-out hover:-translate-y-1 hover:border-[#1E3A8A]/50 hover:shadow-[0_14px_28px_-6px_rgba(30,58,138,0.16)] active:scale-[0.99]"
      >
        <div>
          <div className="h-1 w-full bg-[#1E3A8A]" />
          <div className="p-5 space-y-2.5">
            <div className="flex items-center justify-between gap-2 pb-2 border-b border-stone-100 text-xs">
              <span className="font-mono-tabular font-bold text-[#1E3A8A] truncate">
                {item.indexLabel}
              </span>
              <span className="text-stone-500 whitespace-nowrap shrink-0 inline-flex items-center gap-1">
                {isLocked && <Lock className="w-3 h-3 text-amber-700" />}
                <span>{isLocked ? '限 @hmes' : systemLabel}</span>
              </span>
            </div>

            <div className="flex items-start gap-3">
              <div className="w-9 h-9 rounded-lg bg-[#F7F4EE] border border-stone-200 flex items-center justify-center shrink-0 mt-0.5">
                {renderInteractiveIcon(item.iconKey)}
              </div>
              <div className="min-w-0 flex-1 space-y-1">
                <div className="text-xs text-stone-500 truncate">
                  {item.kicker}
                </div>
                <h4 className="font-editorial text-[18px] font-bold text-stone-950 leading-[1.35] group-hover:text-[#1E3A8A] transition-colors">
                  {item.title}
                </h4>
              </div>
            </div>

            <p className="text-sm text-stone-700 leading-[1.65] line-clamp-3">
              {item.summary}
            </p>
          </div>
        </div>

        <div className="px-5 pb-5 pt-3 border-t border-stone-200/80 flex items-center justify-between gap-3 text-xs">
          <span className="text-stone-500 truncate">{systemLabel}</span>
          <span className="font-semibold text-[#1E3A8A] inline-flex items-center gap-1 whitespace-nowrap shrink-0">
            {isLocked && <Lock className="w-3 h-3" />}
            <span>{isLocked ? '登入解鎖' : item.actionLabel}</span>
            <ArrowUpRight className="w-3.5 h-3.5 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
          </span>
        </div>
      </article>
    </div>
  );

  const renderAssessmentQuestionCard = (q: AssessmentQuestion, idx: number) => (
    <div
      key={q.id}
      className="w-[78vw] sm:w-[305px] lg:w-[325px] snap-start shrink-0 flex"
    >
      <article
        onClick={() => onOpenAssessmentBank(q.grade, q.id)}
        className="group w-full h-full cursor-pointer bg-white border border-stone-300/85 rounded-xl overflow-hidden flex flex-col justify-between shadow-[0_2px_10px_rgba(28,25,23,0.05)] transition-all duration-200 ease-out hover:-translate-y-1 hover:border-[#1E3A8A]/50 hover:shadow-[0_14px_28px_-6px_rgba(30,58,138,0.16)] active:scale-[0.99]"
      >
        <div>
          <div className="h-1 w-full bg-emerald-700" />
          <div className="p-5 space-y-2.5">
            <div className="flex items-center justify-between gap-2 pb-2 border-b border-stone-100 text-xs">
              <span className="font-bold text-emerald-800 truncate">
                {q.grade} · {q.domainTopic}
              </span>
              <span className="font-mono-tabular text-stone-500 whitespace-nowrap shrink-0">
                #{idx + 1} · {q.cognitiveLevel}
              </span>
            </div>
            <div className="text-xs font-medium text-stone-500">
              {q.unitTitle || '數學素養評量'} ·{' '}
              {q.questionType === 'single-choice' ? '單選題' : '建構反應題'}
            </div>
            <h4 className="font-editorial text-[17px] font-bold text-stone-950 leading-[1.45] line-clamp-4 group-hover:text-[#1E3A8A] transition-colors">
              {q.stem}
            </h4>
          </div>
        </div>
        <div className="px-5 pb-5 pt-3 border-t border-stone-200/80 flex items-center justify-between text-xs">
          <span className="text-stone-500">難度：{q.difficulty}</span>
          <span className="font-semibold text-[#1E3A8A] inline-flex items-center gap-1">
            <span>前往作答</span>
            <ArrowUpRight className="w-3.5 h-3.5" />
          </span>
        </div>
      </article>
    </div>
  );

  return (
    <section
      id="portal-showcase"
      aria-label="分區知識頻道與卡片展示"
      className="max-w-7xl mx-auto px-4 sm:px-6 pt-0 pb-8 space-y-5 sm:space-y-6 min-w-0 scroll-mt-[56px] lg:scroll-mt-[64px]"
    >
      {/* Sleek Single-Row Sticky Major Channel Bar — docks flush under <header> when scrolling up */}
      <div
        ref={stickyBarRef}
        className="sticky top-[56px] lg:top-[64px] -mt-px z-20 -mx-4 sm:mx-0 px-4 sm:px-0 py-1.5 bg-[#FBF9F5]/95 backdrop-blur-md border-b border-stone-200"
      >
        <div className="flex items-center justify-between gap-3 min-w-0">
          <div
            ref={channelListRef}
            role="tablist"
            aria-label="網站主要大類項"
            className="flex-1 flex items-center gap-1.5 overflow-x-auto no-scrollbar scroll-smooth min-w-0 py-0.5"
          >
            {PORTAL_MAJOR_CHANNELS.map((tab) => {
              const isActive = activeChannel === tab.id;
              const tabCount =
                tab.id === 'journal'
                  ? filteredPosts.length
                  : tab.id === 'resources'
                    ? visibleResources.length
                    : tab.id === 'assessment'
                      ? publishedAssessmentQuestions.length
                      : null;

              return (
                <button
                  key={tab.id}
                  ref={(el) => {
                    channelTabRefs.current[tab.id] = el;
                  }}
                  type="button"
                  role="tab"
                  aria-selected={isActive}
                  onClick={() => scrollToChannel(tab.id)}
                  className={`min-h-[38px] px-3 sm:px-3.5 py-1.5 text-xs sm:text-sm rounded-lg transition-all whitespace-nowrap shrink-0 inline-flex items-center gap-1.5 active:scale-[0.97] ${
                    isActive
                      ? 'bg-[#1E3A8A] text-white font-bold shadow-sm'
                      : 'text-stone-600 hover:text-[#1E3A8A] hover:bg-stone-200/70 font-medium'
                  }`}
                >
                  {tab.id === 'ximen' && isXimenLocked && (
                    <Lock
                      className={`w-3.5 h-3.5 shrink-0 ${
                        isActive ? 'text-amber-200' : 'text-amber-700'
                      }`}
                    />
                  )}
                  {tab.id === 'class403' && isClass403Locked && (
                    <Lock
                      className={`w-3.5 h-3.5 shrink-0 ${
                        isActive ? 'text-amber-200' : 'text-amber-700'
                      }`}
                    />
                  )}
                  <span>{tab.label}</span>
                  {tabCount !== null && (
                    <span
                      className={`font-mono-tabular text-[11px] ${
                        isActive ? 'text-blue-100 font-semibold' : 'text-stone-400'
                      }`}
                    >
                      {tabCount}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          <button
            type="button"
            onClick={() =>
              onOpenQuickSwipeDeck(
                currentChannelDeck.scopeLabel,
                currentChannelDeck.groups,
                0,
                0,
              )
            }
            disabled={currentChannelDeck.groups.length === 0}
            title={`開啟「${currentChannelDeck.scopeLabel}」大卡片滑動瀏覽`}
            className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-[#1E3A8A] bg-white border border-stone-200 rounded-lg hover:bg-[#1E3A8A] hover:text-white hover:border-[#1E3A8A] disabled:opacity-40 transition-all whitespace-nowrap shrink-0"
          >
            <GalleryHorizontalEnd className="w-3.5 h-3.5 shrink-0" />
            <span>滑動快覽</span>
          </button>
        </div>
      </div>

      {/* Unified Vertical Sections in exact PORTAL_MAJOR_CHANNELS order */}
      <div className="space-y-10 sm:space-y-12">
        {/* 01: 全部精選 — Featured Spotlight Cards */}
        {featuredPosts.length > 0 && (
          <div id="sec-all" className="scroll-mt-[114px] lg:scroll-mt-[122px]">
            <HorizontalCardTray
              sectionIndex={1}
              title="本期焦點精選"
              subtitle="每 4 秒自動切換 · 左右滑動推薦"
              isActiveSection={activeChannel === 'all'}
              autoAdvanceMs={4000}
              itemCount={featuredPosts.length}
              itemUnitLabel="篇焦點"
              onOpenQuickSwipe={(cardIdx) =>
                onOpenQuickSwipeDeck(
                  fullOverviewDeck.scopeLabel,
                  fullOverviewDeck.groups,
                  fullOverviewDeck.allChannelOffsets.featuredIdx ?? 0,
                  cardIdx,
                )
              }
              headerActions={
                <>
                  <button
                    type="button"
                    onClick={onOpenPresentationMode}
                    className="min-h-[36px] px-3 py-1.5 text-xs font-semibold text-[#1E3A8A] bg-white border border-stone-300/80 rounded-lg hover:bg-[#1E3A8A] hover:text-white hover:border-[#1E3A8A] inline-flex items-center gap-1.5 transition-all whitespace-nowrap shrink-0"
                  >
                    <Presentation className="w-3.5 h-3.5" />
                    <span>簡報模式</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => scrollToChannel('journal')}
                    className="min-h-[36px] px-3 py-1.5 text-xs font-semibold text-stone-700 bg-white border border-stone-300/80 rounded-lg hover:border-[#1E3A8A]/50 hover:text-[#1E3A8A] inline-flex items-center gap-1 transition-all whitespace-nowrap shrink-0"
                  >
                    <span>領域社群</span>
                    <ChevronRight className="w-3.5 h-3.5" />
                  </button>
                </>
              }
            >
              {featuredPosts.map((post, idx) => (
                <div
                  key={`spotlight-${post.slug}-${post.rowIndex ?? idx}`}
                  className="w-[78vw] sm:w-[305px] lg:w-[325px] snap-start shrink-0 flex"
                >
                  <div className="w-full flex flex-col">
                    <ArticleCard
                      post={post}
                      onSelect={onSelectPost}
                      isLocked={checkPostLocked(post)}
                    />
                  </div>
                </div>
              ))}
            </HorizontalCardTray>
          </div>
        )}

        {/* 02: 領域社群 — Scoped Search + Topic Card Trays */}
        <section
          id="sec-journal"
          className={`scroll-mt-[114px] lg:scroll-mt-[122px] rounded-2xl px-3 sm:px-5 py-5 space-y-5 border transition-all duration-300 ${
            activeChannel === 'journal'
              ? 'bg-white border-[#1E3A8A]/30 border-t-2 border-t-[#1E3A8A] shadow-[0_10px_28px_-10px_rgba(30,58,138,0.18)]'
              : 'bg-transparent border-transparent border-t-stone-200/90'
          }`}
        >
          <div className="flex flex-wrap items-baseline justify-between gap-3">
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <span className="font-mono-tabular text-sm font-bold text-[#1E3A8A]">
                02
              </span>
              <h2 className="font-editorial text-xl sm:text-2xl font-bold text-stone-950">
                領域社群
              </h2>
              <span className="text-xs font-mono-tabular text-stone-500">
                共 {filteredPosts.length} 篇文章 · 分區滑動與搜尋篩選
              </span>
            </div>

            {viewMode === 'swipe' && filteredPosts.length > 0 && (
              <button
                type="button"
                onClick={() =>
                  onOpenQuickSwipeDeck(
                    fullOverviewDeck.scopeLabel,
                    fullOverviewDeck.groups,
                    fullOverviewDeck.allChannelOffsets.journalStartIdx,
                    0,
                  )
                }
                className="min-h-[36px] px-3 py-1.5 text-xs font-semibold text-white bg-[#1E3A8A] rounded-lg hover:bg-[#172554] inline-flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0"
              >
                <GalleryHorizontalEnd className="w-3.5 h-3.5" />
                <span>開啟大卡片滑動模式</span>
              </button>
            )}
          </div>

          {/* Journal-Scoped Search & Academic Year Filter Bar */}
          <div className="bg-white border border-stone-200 rounded-2xl p-2.5 sm:p-3 shadow-2xs">
            <form
              onSubmit={(e) => e.preventDefault()}
              className="bg-[#FBF9F5] border border-stone-300 rounded-xl p-1.5 flex flex-col sm:flex-row sm:items-center gap-2 focus-within:ring-2 focus-within:ring-[#1E3A8A] focus-within:border-[#1E3A8A] focus-within:bg-white transition-all min-w-0"
            >
              <div className="relative flex-1 min-w-0">
                <Search className="w-4 h-4 text-stone-500 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="search"
                  value={searchQuery}
                  onChange={(e) => onSearchQueryChange(e.target.value)}
                  placeholder={`搜尋 ${posts.length} 篇領域社群文章、教案、會議紀錄或作者...`}
                  aria-label="搜尋領域社群文章"
                  className="w-full h-10 pl-9 pr-3 text-sm text-stone-900 placeholder:text-stone-400 bg-transparent focus:outline-none min-w-0"
                />
              </div>

              <div className="flex items-center gap-2 sm:border-l sm:border-stone-200 sm:pl-2 min-w-0 shrink-0">
                <select
                  id="academic-year-select"
                  aria-label="篩選領域社群學年度"
                  value={selectedYear}
                  onChange={(e) => onSelectYear(e.target.value)}
                  className="flex-1 sm:flex-initial min-w-0 h-10 pl-2.5 pr-7 text-xs font-medium text-stone-800 bg-white border border-stone-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1E3A8A] cursor-pointer"
                >
                  {availableYears.map((yr) => (
                    <option key={yr} value={yr}>
                      {yr} ({yearCounts.get(yr) ?? 0})
                    </option>
                  ))}
                </select>

                {(searchQuery.trim() !== '' ||
                  selectedYear !== '全部年度' ||
                  selectedCategory !== '全部分類') && (
                  <button
                    type="button"
                    onClick={onResetFilters}
                    className="h-10 px-3 text-xs font-medium text-stone-600 bg-white border border-stone-200 rounded-lg hover:text-[#1E3A8A] hover:border-[#1E3A8A]/40 transition-colors whitespace-nowrap shrink-0"
                  >
                    清除條件
                  </button>
                )}

                <button
                  type="submit"
                  className="h-10 px-4 text-xs font-semibold text-white bg-[#1E3A8A] rounded-lg hover:bg-[#172554] transition-colors whitespace-nowrap shrink-0"
                >
                  搜尋文章
                </button>
              </div>
            </form>
          </div>

          {/* Journal Topic Sub-Bar + View Mode Switcher (sticky below major channel bar while scrolling 領域社群) */}
          <div
            ref={journalSubBarRef}
            className={`sticky top-[110px] lg:top-[118px] z-10 -mx-3 sm:-mx-5 px-3 sm:px-5 pt-2 pb-2.5 flex flex-col lg:flex-row lg:items-center justify-between gap-2.5 sm:gap-3 border-b border-stone-200 backdrop-blur-md transition-colors min-w-0 ${
              activeChannel === 'journal'
                ? 'bg-white/95 shadow-[0_6px_16px_-10px_rgba(30,58,138,0.14)]'
                : 'bg-[#FBF9F5]/95 shadow-[0_6px_16px_-10px_rgba(28,25,23,0.10)]'
            }`}
          >
            <div className="flex-1 min-w-0 flex items-center">
              <button
                type="button"
                onClick={() =>
                  categoryBarRef.current?.scrollBy({left: -220, behavior: 'smooth'})
                }
                aria-label="向左捲動領域社群分類"
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
                      onClick={() => {
                        onSelectCategory(cat);
                        requestAnimationFrame(scrollToJournalFeedIfStuck);
                      }}
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
                aria-label="向右捲動領域社群分類"
                className="hidden sm:flex min-h-[40px] min-w-[32px] items-center justify-center rounded-md text-stone-500 hover:text-stone-900 hover:bg-stone-200/50 transition-colors shrink-0"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>

            <div className="flex flex-wrap items-center justify-between sm:justify-end gap-2 sm:gap-3 min-w-0 pb-0.5 lg:pb-0">
              {canShowDraftsToggle && (
                <label className="inline-flex items-center gap-1.5 text-xs font-medium text-stone-600 cursor-pointer whitespace-nowrap">
                  <input
                    type="checkbox"
                    checked={includeDrafts}
                    onChange={(e) => onToggleIncludeDrafts(e.target.checked)}
                    className="rounded border-stone-300 text-[#1E3A8A] focus:ring-[#1E3A8A]"
                  />
                  <span>顯示草稿</span>
                </label>
              )}

              <div className="flex items-center gap-1 p-1 bg-[#F7F4EE] border border-stone-200 rounded-lg max-w-full overflow-x-auto no-scrollbar">
                <button
                  type="button"
                  onClick={() => {
                    onChangeViewMode('swipe');
                    requestAnimationFrame(scrollToJournalFeedIfStuck);
                  }}
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
                  onClick={() => {
                    onChangeViewMode('grid');
                    requestAnimationFrame(scrollToJournalFeedIfStuck);
                  }}
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
                  onClick={() => {
                    onChangeViewMode('list');
                    requestAnimationFrame(scrollToJournalFeedIfStuck);
                  }}
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

          <div ref={journalFeedTopRef} className="h-0" aria-hidden="true" />

          {selectedCategory === '學力檢測' && (
            <div className="bg-white border border-stone-200 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="space-y-0.5">
                <div className="text-xs font-semibold text-[#1E3A8A]">
                  學力檢測線上互動練習
                </div>
                <p className="text-sm text-stone-700">
                  除了閱讀學力檢測分析文章，也可讓學生直接開啟「學力檢測互動題庫」進行即時練習與診斷。
                </p>
              </div>
              <button
                type="button"
                onClick={() => onOpenAssessmentBank(null)}
                className="min-h-[38px] px-4 py-2 text-xs font-semibold text-white bg-[#1E3A8A] rounded-lg hover:bg-[#172554] inline-flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0"
              >
                <ClipboardCheck className="w-3.5 h-3.5" />
                <span>開啟學力檢測互動題庫</span>
              </button>
            </div>
          )}

          {/* Journal Feed Output */}
          {filteredPosts.length === 0 ? (
            posts.length === 0 ? (
              <div className="bg-white border border-stone-200 rounded-xl p-12 text-center space-y-4">
                <BookOpen className="w-8 h-8 text-[#1E3A8A] mx-auto" />
                <h3 className="font-editorial text-lg font-medium text-stone-900">
                  此資料庫目前尚未建立文章
                </h3>
                <p className="text-sm text-stone-600 max-w-md mx-auto">
                  您的專屬試算表結構已就緒，現在可以立即撰寫第一篇領域社群文章，或透過管理後台批次匯入既有文章。
                </p>
                <div className="flex flex-wrap items-center justify-center gap-3">
                  <button
                    type="button"
                    onClick={onOpenEditor}
                    className="px-4 py-2 text-xs font-medium text-white bg-[#1E3A8A] rounded-lg hover:bg-[#172554] transition-colors"
                  >
                    立即新增第一篇文章
                  </button>
                  <button
                    type="button"
                    onClick={onOpenRssImport}
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
                  找不到符合條件的領域社群文章
                </h3>
                <p className="text-sm text-stone-600 max-w-md mx-auto">
                  請嘗試清除關鍵字或切換其他學年度與分類標籤。
                </p>
                <button
                  type="button"
                  onClick={onResetFilters}
                  className="px-4 py-2 text-xs font-medium text-white bg-[#1E3A8A] rounded-lg hover:bg-[#172554] transition-colors"
                >
                  重設所有篩選條件
                </button>
              </div>
            )
          ) : viewMode === 'swipe' ? (
            <TopicSwipeFeed
              groups={topicGroups}
              onSelectPost={onSelectPost}
              onOpenImmersive={(topicIndex, cardIndex) =>
                onOpenQuickSwipeDeck(
                  fullOverviewDeck.scopeLabel,
                  fullOverviewDeck.groups,
                  fullOverviewDeck.allChannelOffsets.journalStartIdx + topicIndex,
                  cardIndex,
                )
              }
              isFilteredToSingleCategory={selectedCategory !== '全部分類'}
              onResetCategoryFilter={() => onSelectCategory('全部分類')}
              checkPostLocked={checkPostLocked}
            />
          ) : viewMode === 'grid' ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {filteredPosts.map((post, idx) => (
                <ArticleCard
                  key={`${post.slug}-${post.rowIndex ?? idx}`}
                  post={post}
                  onSelect={onSelectPost}
                  isLocked={checkPostLocked(post)}
                />
              ))}
            </div>
          ) : (
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
                          onClick={() => onSelectPost(post)}
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
                                onSelectPost(post);
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
                                onSelectPost(post);
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

        {/* 03: 教學資源 — Teaching Resources & Ebooks */}
        <section
          id="sec-resources"
          className="scroll-mt-[114px] lg:scroll-mt-[122px] space-y-4"
        >
          {visibleResources.length > 0 ? (
            <HorizontalCardTray
              sectionIndex={3}
              title="教學資源與電子書"
              subtitle="教案、學習單與全本電子書"
              isActiveSection={activeChannel === 'resources'}
              accentTextClass="text-amber-800"
              accentBarClass="bg-amber-700"
              itemCount={visibleResources.length}
              itemUnitLabel="項資源"
              onOpenQuickSwipe={(cardIdx) =>
                onOpenQuickSwipeDeck(
                  fullOverviewDeck.scopeLabel,
                  fullOverviewDeck.groups,
                  fullOverviewDeck.allChannelOffsets.resourcesIdx ?? 0,
                  cardIdx,
                )
              }
              headerActions={
                <button
                  type="button"
                  onClick={() => onOpenResourcesHub()}
                  className="min-h-[36px] px-3 py-1.5 text-xs font-semibold text-white bg-[#1E3A8A] rounded-lg hover:bg-[#172554] inline-flex items-center gap-1.5 transition-all whitespace-nowrap shrink-0"
                >
                  <BookOpen className="w-3.5 h-3.5" />
                  <span>開啟資源庫與電子書索引</span>
                </button>
              }
            >
              {visibleResources.map((res) => renderResourceCard(res))}
            </HorizontalCardTray>
          ) : (
            <div className="border-t border-stone-200/90 pt-5 space-y-4">
              <div className="flex items-baseline gap-3">
                <span className="font-mono-tabular text-sm font-bold text-amber-800">
                  03
                </span>
                <h3 className="font-editorial text-xl sm:text-2xl font-bold text-stone-950">
                  教學資源與電子書
                </h3>
              </div>
              <div className="bg-white border border-stone-200 rounded-xl p-8 text-center space-y-3">
                <BookOpen className="w-7 h-7 text-stone-400 mx-auto" />
                <p className="text-sm text-stone-600">
                  目前年段篩選條件下尚無教學資源。
                </p>
                <button
                  type="button"
                  onClick={() => onChangeResourceGradeFilter('全部年段')}
                  className="px-4 py-2 text-xs font-semibold text-white bg-[#1E3A8A] rounded-lg hover:bg-[#172554]"
                >
                  顯示全部教學資源
                </button>
              </div>
            </div>
          )}

          {/* Inline Grade-Band Filter Strip */}
          <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pb-1">
            {RESOURCE_GRADE_OPTIONS.map((opt) => {
              const active = resourceGradeFilter === opt;
              return (
                <button
                  key={opt}
                  type="button"
                  onClick={() => onChangeResourceGradeFilter(opt)}
                  className={`min-h-[36px] px-3 py-1 text-xs font-medium rounded-lg border transition-colors whitespace-nowrap shrink-0 ${
                    active
                      ? 'bg-[#1E3A8A] text-white border-[#1E3A8A] font-semibold'
                      : 'bg-white text-stone-700 border-stone-200 hover:border-[#1E3A8A]/40 hover:text-[#1E3A8A]'
                  }`}
                >
                  {opt}
                </button>
              );
            })}
          </div>
        </section>

        {/* 04: 檢測題庫 — Elementary Math Assessment Bank */}
        <section
          id="sec-assessment"
          className="scroll-mt-[114px] lg:scroll-mt-[122px] space-y-4"
        >
          {publishedAssessmentQuestions.length === 0 ? (
            <div className="border-t border-stone-200/90 pt-5 space-y-4">
              <div className="flex items-baseline gap-3">
                <span className="font-mono-tabular text-sm font-bold text-emerald-800">
                  04
                </span>
                <h3 className="font-editorial text-xl sm:text-2xl font-bold text-stone-950">
                  學力檢測互動題庫
                </h3>
              </div>
              <div className="bg-white border border-stone-200 rounded-xl p-8 text-center space-y-3">
                <ClipboardCheck className="w-7 h-7 text-stone-400 mx-auto" />
                <p className="text-sm text-stone-600">
                  目前尚無已發佈的測驗題目。
                </p>
              </div>
            </div>
          ) : assessmentGradeFilter === '全部年級' ? (
            <HorizontalCardTray
              sectionIndex={4}
              title="學力檢測互動題庫"
              subtitle={`同步分頁：${assessmentTabName}`}
              isActiveSection={activeChannel === 'assessment'}
              accentTextClass="text-emerald-800"
              accentBarClass="bg-emerald-700"
              itemCount={assessmentGradeGroups.length + 1}
              itemUnitLabel="組練習卡片"
              onOpenQuickSwipe={(cardIdx) =>
                onOpenQuickSwipeDeck(
                  fullOverviewDeck.scopeLabel,
                  fullOverviewDeck.groups,
                  fullOverviewDeck.allChannelOffsets.assessmentIdx ?? 0,
                  cardIdx,
                )
              }
              headerActions={
                <button
                  type="button"
                  onClick={() => onOpenAssessmentBank(null)}
                  className="min-h-[36px] px-3 py-1.5 text-xs font-semibold text-white bg-[#1E3A8A] rounded-lg hover:bg-[#172554] inline-flex items-center gap-1.5 transition-all whitespace-nowrap shrink-0"
                >
                  <ClipboardCheck className="w-3.5 h-3.5" />
                  <span>進入互動題庫開始練習</span>
                </button>
              }
            >
              <div className="w-[78vw] sm:w-[305px] lg:w-[325px] snap-start shrink-0 flex">
                <article
                  onClick={() => onOpenAssessmentBank(null)}
                  className="group w-full h-full cursor-pointer bg-white border border-stone-300/85 rounded-xl overflow-hidden flex flex-col justify-between shadow-[0_2px_10px_rgba(28,25,23,0.05)] transition-all duration-200 ease-out hover:-translate-y-1 hover:border-[#1E3A8A]/50 hover:shadow-[0_14px_28px_-6px_rgba(30,58,138,0.16)] active:scale-[0.99]"
                >
                  <div>
                    <div className="h-1 w-full bg-emerald-700" />
                    <div className="p-5 space-y-2.5">
                      <div className="flex items-center justify-between pb-2 border-b border-stone-100 text-xs">
                        <span className="font-bold text-emerald-800">
                          全題庫綜合練習
                        </span>
                        <span className="font-mono-tabular text-stone-500">
                          共 {publishedAssessmentQuestions.length} 題
                        </span>
                      </div>
                      <h4 className="font-editorial text-[19px] font-bold text-stone-950 leading-[1.35] group-hover:text-[#1E3A8A] transition-colors">
                        國小學力檢測跨年級互動挑戰
                      </h4>
                      <p className="text-sm text-stone-700 leading-[1.65] line-clamp-3">
                        涵蓋單選題與建構反應題，作答後立即獲得迷思診斷解析與錯題複習。
                      </p>
                    </div>
                  </div>
                  <div className="px-5 pb-5 pt-3 border-t border-stone-200/80 flex items-center justify-between text-xs">
                    <span className="text-stone-500">概念理解 · 情境應用</span>
                    <span className="font-semibold text-[#1E3A8A] inline-flex items-center gap-1">
                      <span>立即練習</span>
                      <ArrowUpRight className="w-3.5 h-3.5" />
                    </span>
                  </div>
                </article>
              </div>

              {assessmentGradeGroups.map(({grade, items}) => {
                const sampleUnits = Array.from(
                  new Set(items.map((i) => i.unitTitle).filter(Boolean)),
                ).slice(0, 3);
                return (
                  <div
                    key={`assess-grade-${grade}`}
                    className="w-[78vw] sm:w-[305px] lg:w-[325px] snap-start shrink-0 flex"
                  >
                    <article
                      onClick={() => onOpenAssessmentBank(grade)}
                      className="group w-full h-full cursor-pointer bg-white border border-stone-300/85 rounded-xl overflow-hidden flex flex-col justify-between shadow-[0_2px_10px_rgba(28,25,23,0.05)] transition-all duration-200 ease-out hover:-translate-y-1 hover:border-[#1E3A8A]/50 hover:shadow-[0_14px_28px_-6px_rgba(30,58,138,0.16)] active:scale-[0.99]"
                    >
                      <div>
                        <div className="h-1 w-full bg-[#1E3A8A]" />
                        <div className="p-5 space-y-2.5">
                          <div className="flex items-center justify-between pb-2 border-b border-stone-100 text-xs">
                            <span className="font-bold text-[#1E3A8A]">
                              {grade}專區
                            </span>
                            <span className="font-mono-tabular text-stone-500">
                              {items.length} 題精選
                            </span>
                          </div>
                          <h4 className="font-editorial text-[19px] font-bold text-stone-950 leading-[1.35] group-hover:text-[#1E3A8A] transition-colors">
                            {grade}數學學力檢測題庫
                          </h4>
                          <p className="text-sm text-stone-700 leading-[1.65] line-clamp-3">
                            {sampleUnits.length > 0
                              ? `精選單元：${sampleUnits.join('、')}等概念理解與實作檢測題組。`
                              : items[0]?.stem || '點擊進入年級互動練習與即時解析。'}
                          </p>
                        </div>
                      </div>
                      <div className="px-5 pb-5 pt-3 border-t border-stone-200/80 flex items-center justify-between text-xs">
                        <span className="text-stone-500">即時回饋 · 錯題複習</span>
                        <span className="font-semibold text-[#1E3A8A] inline-flex items-center gap-1">
                          <span>練習 {grade}</span>
                          <ArrowUpRight className="w-3.5 h-3.5" />
                        </span>
                      </div>
                    </article>
                  </div>
                );
              })}
            </HorizontalCardTray>
          ) : (
            <div className="space-y-8">
              {assessmentCognitiveGroups.map(({level, items}, idx) => (
                <HorizontalCardTray
                  key={`${assessmentGradeFilter}-${level}`}
                  sectionIndex={4}
                  title={`${assessmentGradeFilter} · ${level}`}
                  subtitle={`同步分頁：${assessmentTabName}`}
                  isActiveSection={activeChannel === 'assessment' && idx === 0}
                  accentTextClass="text-emerald-800"
                  accentBarClass="bg-emerald-700"
                  itemCount={items.length}
                  itemUnitLabel="題可練習"
                  onOpenQuickSwipe={(cardIdx) =>
                    onOpenQuickSwipeDeck(
                      `${assessmentGradeFilter}檢測題庫 · 滑動快覽`,
                      assessmentCognitiveGroups.map((g) => ({
                        id: `assess-cog-${assessmentGradeFilter}-${g.level}`,
                        topic: `${assessmentGradeFilter} · ${g.level}`,
                        accentBarClass: 'bg-emerald-700',
                        accentTextClass: 'text-emerald-800',
                        cards: g.items.map((q, qIdx) => ({
                          id: `assess-${q.id}`,
                          accentBarClass: 'bg-emerald-700',
                          accentTextClass: 'text-emerald-800',
                          categoryLabel: `${q.grade} · ${q.domainTopic}`,
                          metaPrimary: q.unitTitle || '數學素養評量',
                          metaSecondary: `${
                            q.questionType === 'single-choice'
                              ? '單選題'
                              : '建構反應題'
                          } · ${q.cognitiveLevel}`,
                          title: `第 ${qIdx + 1} 題｜${q.stem}`,
                          summary: q.hint
                            ? `解題提示：${q.hint}`
                            : '點擊「前往作答練習」進入互動試題作答與即時解析診斷。',
                          footerLeft: `難度：${q.difficulty} · ${q.author}`,
                          actionLabel: '前往作答練習',
                          coverImageUrl: q.imageUrl || undefined,
                          onAction: () => onOpenAssessmentBank(q.grade, q.id),
                        })),
                      })),
                      idx,
                      cardIdx,
                    )
                  }
                  headerActions={
                    idx === 0 ? (
                      <button
                        type="button"
                        onClick={() => onOpenAssessmentBank(assessmentGradeFilter)}
                        className="min-h-[36px] px-3 py-1.5 text-xs font-semibold text-white bg-[#1E3A8A] rounded-lg hover:bg-[#172554] inline-flex items-center gap-1.5 transition-all whitespace-nowrap shrink-0"
                      >
                        <ClipboardCheck className="w-3.5 h-3.5" />
                        <span>練習 {assessmentGradeFilter}</span>
                      </button>
                    ) : undefined
                  }
                >
                  {items.map((q, qIdx) => renderAssessmentQuestionCard(q, qIdx))}
                </HorizontalCardTray>
              ))}
            </div>
          )}

          {/* Inline Grade Filter Strip */}
          {publishedAssessmentQuestions.length > 0 && (
            <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pb-1">
              <button
                type="button"
                onClick={() => onChangeAssessmentGradeFilter('全部年級')}
                className={`min-h-[36px] px-3 py-1 text-xs font-medium rounded-lg border transition-colors whitespace-nowrap shrink-0 ${
                  assessmentGradeFilter === '全部年級'
                    ? 'bg-[#1E3A8A] text-white border-[#1E3A8A] font-semibold'
                    : 'bg-white text-stone-700 border-stone-200 hover:border-[#1E3A8A]/40 hover:text-[#1E3A8A]'
                }`}
              >
                全部年級 ({publishedAssessmentQuestions.length})
              </button>
              {assessmentGradeGroups.map(({grade, items}) => (
                <button
                  key={grade}
                  type="button"
                  onClick={() => onChangeAssessmentGradeFilter(grade)}
                  className={`min-h-[36px] px-3 py-1 text-xs font-medium rounded-lg border transition-colors whitespace-nowrap shrink-0 ${
                    assessmentGradeFilter === grade
                      ? 'bg-[#1E3A8A] text-white border-[#1E3A8A] font-semibold'
                      : 'bg-white text-stone-700 border-stone-200 hover:border-[#1E3A8A]/40 hover:text-[#1E3A8A]'
                  }`}
                >
                  {grade} ({items.length})
                </button>
              ))}
            </div>
          )}
        </section>

        {/* 05: 互動專題 — Ximen Scratch Interactive Topics */}
        <section
          id="sec-ximen"
          className="scroll-mt-[114px] lg:scroll-mt-[122px]"
        >
          <HorizontalCardTray
            sectionIndex={5}
            title="百年西門 Scratch 舞台秀互動學習網"
            subtitle="401–404 年段實作資源"
            isActiveSection={activeChannel === 'ximen'}
            accentTextClass="text-sky-800"
            accentBarClass="bg-sky-700"
            itemCount={XIMEN_CARDS.length}
            itemUnitLabel="個功能模組"
            onOpenQuickSwipe={(cardIdx) =>
              onOpenQuickSwipeDeck(
                fullOverviewDeck.scopeLabel,
                fullOverviewDeck.groups,
                fullOverviewDeck.allChannelOffsets.ximenIdx ?? 0,
                cardIdx,
              )
            }
            headerActions={
              <>
                <button
                  type="button"
                  onClick={() => onOpenXimenStage('map')}
                  className="min-h-[36px] px-3.5 py-1.5 text-xs font-semibold text-white bg-[#1E3A8A] rounded-lg hover:bg-[#172554] inline-flex items-center gap-1.5 transition-all whitespace-nowrap shrink-0"
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
                    className="min-h-[36px] px-3 py-1.5 text-xs font-medium text-stone-700 bg-white border border-stone-300 rounded-lg hover:bg-stone-50 inline-flex items-center gap-1 transition-all whitespace-nowrap shrink-0"
                  >
                    <span>獨立分頁</span>
                    <ExternalLink className="w-3 h-3" />
                  </a>
                )}
              </>
            }
          >
            {XIMEN_CARDS.map((card) =>
              renderInteractiveStageCard(
                card,
                isXimenLocked,
                () => onOpenXimenStage(card.id),
                '百年西門 Scratch',
              ),
            )}
          </HorizontalCardTray>
        </section>

        {/* 06: 403 班網 — Class 403 Website */}
        <section
          id="sec-class403"
          className="scroll-mt-[114px] lg:scroll-mt-[122px]"
        >
          <HorizontalCardTray
            sectionIndex={6}
            title="403 班級網站與互動聯絡簿"
            subtitle="Pes Class 115 · 分機 5207"
            isActiveSection={activeChannel === 'class403'}
            itemCount={CLASS403_CARDS.length}
            itemUnitLabel="項班務系統"
            onOpenQuickSwipe={(cardIdx) =>
              onOpenQuickSwipeDeck(
                fullOverviewDeck.scopeLabel,
                fullOverviewDeck.groups,
                fullOverviewDeck.allChannelOffsets.class403Idx ?? 0,
                cardIdx,
              )
            }
            headerActions={
              <>
                <button
                  type="button"
                  onClick={() => onOpenClass403Stage('agenda')}
                  className="min-h-[36px] px-3.5 py-1.5 text-xs font-semibold text-white bg-[#1E3A8A] rounded-lg hover:bg-[#172554] inline-flex items-center gap-1.5 transition-all whitespace-nowrap shrink-0"
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
                    className="min-h-[36px] px-3 py-1.5 text-xs font-medium text-stone-700 bg-white border border-stone-300 rounded-lg hover:bg-stone-50 inline-flex items-center gap-1 transition-all whitespace-nowrap shrink-0"
                  >
                    <span>獨立分頁</span>
                    <ExternalLink className="w-3 h-3" />
                  </a>
                )}
              </>
            }
          >
            {CLASS403_CARDS.map((card) =>
              renderInteractiveStageCard(
                card,
                isClass403Locked,
                () => onOpenClass403Stage(card.id),
                '403 班級網站',
              ),
            )}
          </HorizontalCardTray>
        </section>
      </div>

      {/* Bottom Theme Navigation Bar */}
      <div className="border-t border-stone-200 pt-5 flex items-center justify-between gap-3">
        {prevChannelMeta ? (
          <button
            type="button"
            onClick={() => scrollToChannel(prevChannelMeta.id)}
            className="min-h-[42px] px-3.5 py-2 text-xs font-semibold text-stone-700 bg-white border border-stone-300/80 rounded-xl hover:border-[#1E3A8A]/50 hover:text-[#1E3A8A] inline-flex items-center gap-1.5 transition-all"
          >
            <ChevronLeft className="w-4 h-4 shrink-0" />
            <span>上一主題：{prevChannelMeta.label}</span>
          </button>
        ) : (
          <span className="text-xs text-stone-400">
            {PORTAL_MAJOR_CHANNELS[0].label}
          </span>
        )}

        <span className="text-xs font-mono-tabular text-stone-500">
          {String(activeChannelIndex + 1).padStart(2, '0')} /{' '}
          {String(PORTAL_MAJOR_CHANNELS.length).padStart(2, '0')}
        </span>

        {nextChannelMeta ? (
          <button
            type="button"
            onClick={() => scrollToChannel(nextChannelMeta.id)}
            className="min-h-[42px] px-3.5 py-2 text-xs font-semibold text-white bg-[#1E3A8A] rounded-xl hover:bg-[#172554] inline-flex items-center gap-1.5 transition-all"
          >
            <span>下一主題：{nextChannelMeta.label}</span>
            <ChevronRight className="w-4 h-4 shrink-0" />
          </button>
        ) : (
          <button
            type="button"
            onClick={() => scrollToChannel('all')}
            className="min-h-[42px] px-3.5 py-2 text-xs font-semibold text-[#1E3A8A] bg-white border border-[#1E3A8A]/35 rounded-xl hover:bg-[#1E3A8A] hover:text-white inline-flex items-center gap-1.5 transition-all"
          >
            <ArrowUp className="w-4 h-4 shrink-0" />
            <span>回到全部精選</span>
          </button>
        )}
      </div>
    </section>
  );
};
