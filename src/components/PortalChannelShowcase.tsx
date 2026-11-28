import React, {useMemo, useRef} from 'react';
import {
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
  searchQuery: string;
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
  posts,
  filteredPosts,
  featuredPosts,
  topicGroups,
  availableCategories,
  categoryCounts,
  selectedCategory,
  onSelectCategory,
  selectedYear,
  searchQuery,
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
  const categoryBarRef = useRef<HTMLDivElement | null>(null);

  const visibleResources = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return resources
      .filter((r) => isTeacherAdmin || r.isPublic)
      .filter((r) => {
        if (
          activeChannel === 'resources' &&
          resourceGradeFilter !== '全部年段' &&
          r.gradeBand !== resourceGradeFilter
        ) {
          return false;
        }
        if (q) {
          const hay = [
            r.title,
            r.summary,
            r.topicTags,
            r.gradeBand,
            r.resourceType,
            r.author,
          ]
            .join(' ')
            .toLowerCase();
          return hay.includes(q);
        }
        return true;
      })
      .sort((a, b) => {
        if (a.isPinned !== b.isPinned) return a.isPinned ? -1 : 1;
        return b.publishedAt.localeCompare(a.publishedAt);
      });
  }, [resources, isTeacherAdmin, activeChannel, resourceGradeFilter, searchQuery]);

  const resourceTypeGroups = useMemo(() => {
    const map = new Map<string, TeachingResource[]>();
    for (const res of visibleResources) {
      const key = res.resourceType || '其他資源';
      const arr = map.get(key);
      if (arr) arr.push(res);
      else map.set(key, [res]);
    }
    return Array.from(map.entries()).map(([type, items]) => ({type, items}));
  }, [visibleResources]);

  const publishedAssessmentQuestions = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return assessmentQuestions
      .filter((item) => item.isPublished)
      .filter((item) => {
        if (!q) return true;
        const hay = [
          item.grade,
          item.unitTitle,
          item.domainTopic,
          item.stem,
          item.cognitiveLevel,
        ]
          .join(' ')
          .toLowerCase();
        return hay.includes(q);
      });
  }, [assessmentQuestions, searchQuery]);

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

  const channelDeck = useMemo(
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
        searchQuery,
        selectedCategory,
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
      searchQuery,
      selectedCategory,
      isXimenLocked,
      isClass403Locked,
      onSelectPost,
      onOpenResourcesHub,
      onOpenAssessmentBank,
      onOpenXimenStage,
      onOpenClass403Stage,
    ],
  );

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

  const renderJournalSubControlsAndContent = () => (
    <div className="space-y-6">
      {/* Journal Topic Sub-Bar + View Mode Switcher */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 border-b border-stone-200 pb-2 min-w-0">
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
                  onClick={() => onSelectCategory(cat)}
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

        <div className="flex flex-wrap items-center justify-between sm:justify-end gap-2 sm:gap-3 min-w-0 pb-1 lg:pb-0">
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
              onClick={() => onChangeViewMode('swipe')}
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
              onClick={() => onChangeViewMode('grid')}
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
              onClick={() => onChangeViewMode('list')}
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
              onClick={onResetFilters}
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
              onOpenQuickSwipeDeck(
                channelDeck.scopeLabel,
                channelDeck.groups,
                0,
                0,
              )
            }
            className="min-h-[40px] px-3.5 py-2 text-xs font-medium text-white bg-[#1E3A8A] rounded-lg hover:bg-[#172554] inline-flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0"
          >
            <GalleryHorizontalEnd className="w-3.5 h-3.5" />
            <span>開啟大卡片滑動模式</span>
          </button>
        )}
      </div>

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
              您的專屬試算表結構已就緒，現在可以立即撰寫第一篇期刊文章，或透過管理後台批次匯入既有文章。
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
              找不到符合條件的期刊文章
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
              channelDeck.scopeLabel,
              channelDeck.groups,
              topicIndex,
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
                  <th className="py-3.5 px-5 text-right whitespace-nowrap">操作</th>
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
    </div>
  );

  return (
    <section
      id="portal-showcase"
      className="max-w-7xl mx-auto px-4 sm:px-6 py-6 sm:py-8 space-y-8 min-w-0"
    >
      {/* Top Major Channels Bar ("上面大類項") */}
      <div className="bg-white border border-stone-200 rounded-2xl p-2 sm:p-2.5 shadow-[0_2px_10px_rgba(28,25,23,0.04)] flex flex-col sm:flex-row sm:items-center justify-between gap-2 min-w-0">
        <div
          role="tablist"
          aria-label="網站主要大類項"
          className="flex items-center gap-1.5 overflow-x-auto no-scrollbar scroll-smooth min-w-0"
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
                type="button"
                role="tab"
                aria-selected={isActive}
                onClick={() => onSelectChannel(tab.id)}
                className={`min-h-[40px] px-3.5 py-2 text-xs sm:text-sm rounded-xl transition-all whitespace-nowrap shrink-0 inline-flex items-center gap-1.5 active:scale-[0.98] ${
                  isActive
                    ? 'bg-[#1E3A8A] text-white font-semibold shadow-xs'
                    : 'text-stone-700 hover:bg-[#F7F4EE] hover:text-[#1E3A8A] font-medium'
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
                      isActive ? 'text-blue-100' : 'text-stone-400'
                    }`}
                  >
                    {tabCount}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        <div className="flex items-center justify-between sm:justify-end gap-2 pt-1 sm:pt-0 border-t sm:border-t-0 border-stone-100 shrink-0">
          <span className="text-[11px] text-stone-500 sm:hidden pl-1">
            左右滑動卡片 · 上下瀏覽專區
          </span>
          <button
            type="button"
            onClick={() =>
              onOpenQuickSwipeDeck(
                channelDeck.scopeLabel,
                channelDeck.groups,
                0,
                0,
              )
            }
            disabled={channelDeck.groups.length === 0}
            title={`開啟「${channelDeck.scopeLabel}」大卡片滑動瀏覽`}
            className="min-h-[38px] px-3 py-1.5 text-xs font-semibold text-[#1E3A8A] bg-[#F7F4EE] border border-stone-200 rounded-xl hover:bg-[#1E3A8A] hover:text-white hover:border-[#1E3A8A] disabled:opacity-40 inline-flex items-center gap-1.5 transition-all whitespace-nowrap shrink-0"
          >
            <GalleryHorizontalEnd className="w-3.5 h-3.5 shrink-0" />
            <span>滑動快覽</span>
          </button>
        </div>
      </div>

      {/* CHANNEL 1: ALL OVERVIEW (Vertical Sections × Horizontal Swipeable Card Trays) */}
      {activeChannel === 'all' && (
        <div className="space-y-11">
          {/* 01 Featured Spotlight Cards */}
          {featuredPosts.length > 0 &&
            searchQuery.trim() === '' &&
            selectedCategory === '全部分類' && (
              <HorizontalCardTray
                sectionIndex={1}
                title="本期焦點精選"
                subtitle="左右滑動瀏覽推薦"
                itemCount={featuredPosts.length}
                itemUnitLabel="篇焦點"
                onOpenQuickSwipe={(cardIdx) =>
                  onOpenQuickSwipeDeck(
                    channelDeck.scopeLabel,
                    channelDeck.groups,
                    channelDeck.allChannelOffsets.featuredIdx ?? 0,
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
                      onClick={() => onSelectChannel('journal')}
                      className="min-h-[36px] px-3 py-1.5 text-xs font-semibold text-stone-700 bg-white border border-stone-300/80 rounded-lg hover:border-[#1E3A8A]/50 hover:text-[#1E3A8A] inline-flex items-center gap-1 transition-all whitespace-nowrap shrink-0"
                    >
                      <span>全部專欄</span>
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
            )}

          {/* 02 Teaching Resources & Ebooks */}
          {visibleResources.length > 0 && (
            <HorizontalCardTray
              sectionIndex={2}
              title="教學資源與電子書"
              subtitle="教案、學習單與全本電子書"
              accentTextClass="text-amber-800"
              accentBarClass="bg-amber-700"
              itemCount={visibleResources.length}
              itemUnitLabel="項資源"
              onOpenQuickSwipe={(cardIdx) =>
                onOpenQuickSwipeDeck(
                  channelDeck.scopeLabel,
                  channelDeck.groups,
                  channelDeck.allChannelOffsets.resourcesIdx ?? 0,
                  cardIdx,
                )
              }
              headerActions={
                <>
                  <button
                    type="button"
                    onClick={() => onOpenResourcesHub()}
                    className="min-h-[36px] px-3 py-1.5 text-xs font-semibold text-white bg-[#1E3A8A] rounded-lg hover:bg-[#172554] inline-flex items-center gap-1.5 transition-all whitespace-nowrap shrink-0"
                  >
                    <BookOpen className="w-3.5 h-3.5" />
                    <span>開啟資源庫</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => onSelectChannel('resources')}
                    className="min-h-[36px] px-3 py-1.5 text-xs font-semibold text-stone-700 bg-white border border-stone-300/80 rounded-lg hover:border-[#1E3A8A]/50 hover:text-[#1E3A8A] inline-flex items-center gap-1 transition-all whitespace-nowrap shrink-0"
                  >
                    <span>看更多</span>
                    <ChevronRight className="w-3.5 h-3.5" />
                  </button>
                </>
              }
            >
              {visibleResources.map((res) => renderResourceCard(res))}
            </HorizontalCardTray>
          )}

          {/* 03 Elementary Math Assessment Bank */}
          {publishedAssessmentQuestions.length > 0 && (
            <HorizontalCardTray
              sectionIndex={3}
              title="學力檢測互動題庫"
              subtitle={`同步分頁：${assessmentTabName}`}
              accentTextClass="text-emerald-800"
              accentBarClass="bg-emerald-700"
              itemCount={assessmentGradeGroups.length + 1}
              itemUnitLabel="組練習卡片"
              onOpenQuickSwipe={(cardIdx) =>
                onOpenQuickSwipeDeck(
                  channelDeck.scopeLabel,
                  channelDeck.groups,
                  channelDeck.allChannelOffsets.assessmentIdx ?? 0,
                  cardIdx,
                )
              }
              headerActions={
                <>
                  <button
                    type="button"
                    onClick={() => onOpenAssessmentBank(null)}
                    className="min-h-[36px] px-3 py-1.5 text-xs font-semibold text-white bg-[#1E3A8A] rounded-lg hover:bg-[#172554] inline-flex items-center gap-1.5 transition-all whitespace-nowrap shrink-0"
                  >
                    <ClipboardCheck className="w-3.5 h-3.5" />
                    <span>開始練習</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => onSelectChannel('assessment')}
                    className="min-h-[36px] px-3 py-1.5 text-xs font-semibold text-stone-700 bg-white border border-stone-300/80 rounded-lg hover:border-[#1E3A8A]/50 hover:text-[#1E3A8A] inline-flex items-center gap-1 transition-all whitespace-nowrap shrink-0"
                  >
                    <span>題庫導覽</span>
                    <ChevronRight className="w-3.5 h-3.5" />
                  </button>
                </>
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
          )}

          {/* 04 Interactive Topics & Class 403 Cards */}
          {searchQuery.trim() === '' && (
            <HorizontalCardTray
              sectionIndex={4}
              title="互動專題 × 403 班網"
              subtitle="校園實作網與班務入口"
              accentTextClass="text-sky-800"
              accentBarClass="bg-sky-700"
              itemCount={XIMEN_CARDS.length + CLASS403_CARDS.length}
              itemUnitLabel="個互動模組"
              onOpenQuickSwipe={(cardIdx) =>
                onOpenQuickSwipeDeck(
                  channelDeck.scopeLabel,
                  channelDeck.groups,
                  channelDeck.allChannelOffsets.interactiveIdx ?? 0,
                  cardIdx,
                )
              }
              headerActions={
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => onSelectChannel('ximen')}
                    className="min-h-[36px] px-3 py-1.5 text-xs font-semibold text-stone-700 bg-white border border-stone-300/80 rounded-lg hover:border-[#1E3A8A]/50 hover:text-[#1E3A8A] inline-flex items-center gap-1 transition-all whitespace-nowrap shrink-0"
                  >
                    <span>互動專題</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => onSelectChannel('class403')}
                    className="min-h-[36px] px-3 py-1.5 text-xs font-semibold text-stone-700 bg-white border border-stone-300/80 rounded-lg hover:border-[#1E3A8A]/50 hover:text-[#1E3A8A] inline-flex items-center gap-1 transition-all whitespace-nowrap shrink-0"
                  >
                    <span>403 班網</span>
                  </button>
                </div>
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
              {CLASS403_CARDS.map((card) =>
                renderInteractiveStageCard(
                  card,
                  isClass403Locked,
                  () => onOpenClass403Stage(card.id),
                  '403 班級網站',
                ),
              )}
            </HorizontalCardTray>
          )}

          {/* 05+ Journal Catalog Vertical Topic Feed */}
          <div id="journal-catalog" className="pt-2 space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="space-y-0.5">
                <div className="text-xs font-mono-tabular font-semibold text-[#1E3A8A]">
                  期刊專欄分區瀏覽
                </div>
                <h2 className="font-editorial text-xl sm:text-2xl font-bold text-stone-950">
                  各主題教學專欄與共備紀錄
                </h2>
              </div>
              <button
                type="button"
                onClick={() => onSelectChannel('journal')}
                className="min-h-[38px] px-3.5 py-2 text-xs font-semibold text-[#1E3A8A] bg-white border border-stone-300 rounded-lg hover:bg-[#1E3A8A] hover:text-white hover:border-[#1E3A8A] inline-flex items-center gap-1.5 transition-all whitespace-nowrap shrink-0"
              >
                <span>依分類篩選 / 列表檢視</span>
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>

            {filteredPosts.length === 0 ? (
              <div className="bg-white border border-stone-200 rounded-xl p-10 text-center space-y-3">
                <BookOpen className="w-7 h-7 text-stone-400 mx-auto" />
                <p className="text-sm text-stone-600">
                  找不到符合「{searchQuery || selectedYear}」的期刊文章。
                </p>
                <button
                  type="button"
                  onClick={onResetFilters}
                  className="px-4 py-2 text-xs font-semibold text-white bg-[#1E3A8A] rounded-lg hover:bg-[#172554]"
                >
                  重設篩選條件
                </button>
              </div>
            ) : (
              <TopicSwipeFeed
                groups={topicGroups}
                onSelectPost={onSelectPost}
                onOpenImmersive={(topicIndex, cardIndex) =>
                  onOpenQuickSwipeDeck(
                    channelDeck.scopeLabel,
                    channelDeck.groups,
                    channelDeck.allChannelOffsets.journalStartIdx + topicIndex,
                    cardIndex,
                  )
                }
                isFilteredToSingleCategory={selectedCategory !== '全部分類'}
                onResetCategoryFilter={() => onSelectCategory('全部分類')}
                checkPostLocked={checkPostLocked}
              />
            )}
          </div>
        </div>
      )}

      {/* CHANNEL 2: JOURNAL COLUMNS */}
      {activeChannel === 'journal' && (
        <div id="journal-catalog">{renderJournalSubControlsAndContent()}</div>
      )}

      {/* CHANNEL 3: TEACHING RESOURCES */}
      {activeChannel === 'resources' && (
        <div className="space-y-8">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-stone-200 pb-4">
            <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar">
              {RESOURCE_GRADE_OPTIONS.map((opt) => {
                const active = resourceGradeFilter === opt;
                return (
                  <button
                    key={opt}
                    type="button"
                    onClick={() => onChangeResourceGradeFilter(opt)}
                    className={`min-h-[38px] px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors whitespace-nowrap shrink-0 ${
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

            <button
              type="button"
              onClick={() => onOpenResourcesHub()}
              className="min-h-[40px] px-4 py-2 text-xs font-semibold text-white bg-[#1E3A8A] rounded-lg hover:bg-[#172554] inline-flex items-center justify-center gap-1.5 whitespace-nowrap shrink-0"
            >
              <BookOpen className="w-4 h-4" />
              <span>開啟完整教學資源庫與電子書索引</span>
            </button>
          </div>

          {resourceTypeGroups.length === 0 ? (
            <div className="bg-white border border-stone-200 rounded-xl p-10 text-center space-y-3">
              <BookOpen className="w-7 h-7 text-stone-400 mx-auto" />
              <p className="text-sm text-stone-600">
                目前篩選條件下尚無教學資源。
              </p>
              <button
                type="button"
                onClick={() => {
                  onChangeResourceGradeFilter('全部年段');
                  onResetFilters();
                }}
                className="px-4 py-2 text-xs font-semibold text-white bg-[#1E3A8A] rounded-lg hover:bg-[#172554]"
              >
                顯示全部教學資源
              </button>
            </div>
          ) : (
            <div className="space-y-10">
              {resourceTypeGroups.map((grp, idx) => (
                <HorizontalCardTray
                  key={grp.type}
                  sectionIndex={idx + 1}
                  title={grp.type}
                  accentTextClass="text-amber-800"
                  accentBarClass="bg-amber-700"
                  itemCount={grp.items.length}
                  itemUnitLabel="筆資源"
                  onOpenQuickSwipe={(cardIdx) =>
                    onOpenQuickSwipeDeck(
                      channelDeck.scopeLabel,
                      channelDeck.groups,
                      idx,
                      cardIdx,
                    )
                  }
                >
                  {grp.items.map((res) => renderResourceCard(res))}
                </HorizontalCardTray>
              ))}
            </div>
          )}
        </div>
      )}

      {/* CHANNEL 4: ASSESSMENT BANK */}
      {activeChannel === 'assessment' && (
        <div className="space-y-8">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-stone-200 pb-4">
            <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar">
              <button
                type="button"
                onClick={() => onChangeAssessmentGradeFilter('全部年級')}
                className={`min-h-[38px] px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors whitespace-nowrap shrink-0 ${
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
                  className={`min-h-[38px] px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors whitespace-nowrap shrink-0 ${
                    assessmentGradeFilter === grade
                      ? 'bg-[#1E3A8A] text-white border-[#1E3A8A] font-semibold'
                      : 'bg-white text-stone-700 border-stone-200 hover:border-[#1E3A8A]/40 hover:text-[#1E3A8A]'
                  }`}
                >
                  {grade} ({items.length})
                </button>
              ))}
            </div>

            <button
              type="button"
              onClick={() =>
                onOpenAssessmentBank(
                  assessmentGradeFilter === '全部年級'
                    ? null
                    : assessmentGradeFilter,
                )
              }
              className="min-h-[40px] px-4 py-2 text-xs font-semibold text-white bg-[#1E3A8A] rounded-lg hover:bg-[#172554] inline-flex items-center justify-center gap-1.5 whitespace-nowrap shrink-0"
            >
              <ClipboardCheck className="w-4 h-4" />
              <span>進入互動題庫開始練習</span>
            </button>
          </div>

          {assessmentGradeFilter === '全部年級' ? (
            assessmentGradeGroups.length === 0 ? (
              <div className="bg-white border border-stone-200 rounded-xl p-10 text-center space-y-3">
                <ClipboardCheck className="w-7 h-7 text-stone-400 mx-auto" />
                <p className="text-sm text-stone-600">
                  目前搜尋條件下尚無已發佈的測驗題目。
                </p>
              </div>
            ) : (
              <div className="space-y-10">
                {assessmentGradeGroups.map(({grade, items}, idx) => (
                  <HorizontalCardTray
                    key={grade}
                    sectionIndex={idx + 1}
                    title={`${grade}學力檢測`}
                    subtitle={`同步分頁：${assessmentTabName}`}
                    accentTextClass="text-emerald-800"
                    accentBarClass="bg-emerald-700"
                    itemCount={items.length}
                    itemUnitLabel="題精選"
                    onOpenQuickSwipe={(cardIdx) =>
                      onOpenQuickSwipeDeck(
                        channelDeck.scopeLabel,
                        channelDeck.groups,
                        idx,
                        cardIdx,
                      )
                    }
                    headerActions={
                      <button
                        type="button"
                        onClick={() => onOpenAssessmentBank(grade)}
                        className="min-h-[36px] px-3 py-1.5 text-xs font-semibold text-white bg-[#1E3A8A] rounded-lg hover:bg-[#172554] inline-flex items-center gap-1 transition-all whitespace-nowrap shrink-0"
                      >
                        <span>開始練習 {grade}</span>
                      </button>
                    }
                  >
                    {items.map((q, qIdx) =>
                      renderAssessmentQuestionCard(q, qIdx),
                    )}
                  </HorizontalCardTray>
                ))}
              </div>
            )
          ) : (
            <div className="space-y-10">
              {assessmentCognitiveGroups.map(({level, items}, idx) => (
                <HorizontalCardTray
                  key={`${assessmentGradeFilter}-${level}`}
                  sectionIndex={idx + 1}
                  title={`${assessmentGradeFilter} · ${level}`}
                  subtitle={`同步分頁：${assessmentTabName}`}
                  accentTextClass="text-emerald-800"
                  accentBarClass="bg-emerald-700"
                  itemCount={items.length}
                  itemUnitLabel="題可練習"
                  onOpenQuickSwipe={(cardIdx) =>
                    onOpenQuickSwipeDeck(
                      channelDeck.scopeLabel,
                      channelDeck.groups,
                      idx,
                      cardIdx,
                    )
                  }
                >
                  {items.map((q, qIdx) => renderAssessmentQuestionCard(q, qIdx))}
                </HorizontalCardTray>
              ))}
            </div>
          )}
        </div>
      )}

      {/* CHANNEL 5: XIMEN SCRATCH INTERACTIVE TOPIC */}
      {activeChannel === 'ximen' && (
        <HorizontalCardTray
          sectionIndex={1}
          title="百年西門 Scratch 舞台秀互動學習網"
          subtitle="401–404 年段實作資源"
          itemCount={XIMEN_CARDS.length}
          itemUnitLabel="個功能模組"
          onOpenQuickSwipe={(cardIdx) =>
            onOpenQuickSwipeDeck(
              channelDeck.scopeLabel,
              channelDeck.groups,
              0,
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
      )}

      {/* CHANNEL 6: CLASS 403 WEBSITE */}
      {activeChannel === 'class403' && (
        <HorizontalCardTray
          sectionIndex={1}
          title="403 班級網站與互動聯絡簿"
          subtitle="Pes Class 115 · 分機 5207"
          itemCount={CLASS403_CARDS.length}
          itemUnitLabel="項班務系統"
          onOpenQuickSwipe={(cardIdx) =>
            onOpenQuickSwipeDeck(
              channelDeck.scopeLabel,
              channelDeck.groups,
              0,
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
      )}
    </section>
  );
};
