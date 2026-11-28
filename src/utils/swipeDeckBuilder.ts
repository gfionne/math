import {ASSESSMENT_COGNITIVE_LEVELS, ASSESSMENT_GRADES} from '../data/seedAssessments';
import {inferEmbedProvider} from '../services/sheetsDb';
import {
  AssessmentQuestion,
  JournalPost,
  TeachingResource,
} from '../types/journal';
import {
  estimateReadMinutes,
  formatCategoryDisplay,
  getCategoryAccent,
  TopicGroup,
} from './postFormatting';

export type PortalMajorChannel =
  | 'all'
  | 'journal'
  | 'resources'
  | 'assessment'
  | 'ximen'
  | 'class403';

export interface PortalChannelTabMeta {
  id: PortalMajorChannel;
  label: string;
}

export const PORTAL_MAJOR_CHANNELS: PortalChannelTabMeta[] = [
  {id: 'all', label: '全部精選'},
  {id: 'journal', label: '領域社群'},
  {id: 'resources', label: '教學資源'},
  {id: 'assessment', label: '檢測題庫'},
  {id: 'ximen', label: '互動專題'},
  {id: 'class403', label: '403 班網'},
];

export type XimenTabId = 'map' | 'gallery' | 'blocks' | 'naming';
export type Class403TabId = 'agenda' | 'news' | 'resources' | 'contact';

export interface InteractiveModuleCardMeta<TId extends string> {
  id: TId;
  indexLabel: string;
  title: string;
  kicker: string;
  summary: string;
  actionLabel: string;
  iconKey:
    | 'map'
    | 'sparkles'
    | 'puzzle'
    | 'clipboard'
    | 'book'
    | 'calendar'
    | 'folder'
    | 'message';
}

export const XIMEN_CARDS: InteractiveModuleCardMeta<XimenTabId>[] = [
  {
    id: 'map',
    indexLabel: '01 · 地理探索',
    title: '西門町互動商圈地圖',
    kicker: '座標定位 × 地標探索',
    summary:
      '搭配空間座標與導覽點位微調，引導學生認識西門町歷史街區與文化地標。',
    actionLabel: '開啟互動地圖',
    iconKey: 'map',
  },
  {
    id: 'gallery',
    indexLabel: '02 · 視覺素材',
    title: '專案標準圖庫與匯出',
    kicker: '角色背景 × 素材整理',
    summary:
      '彙整百年西門主題角色與場景標準素材，可直接檢視並匯出使用於 Scratch 專案。',
    actionLabel: '瀏覽專案圖庫',
    iconKey: 'sparkles',
  },
  {
    id: 'blocks',
    indexLabel: '03 · 程式實作',
    title: 'Scratch 3.0 積木步驟教學',
    kicker: '事件控制 × 互動敘事',
    summary:
      '提供分步驟積木組合指引與舞台互動邏輯示範，幫助課堂快速完成程式實作。',
    actionLabel: '查看積木教學',
    iconKey: 'puzzle',
  },
  {
    id: 'naming',
    indexLabel: '04 · 班級規範',
    title: '分班作品命名檢核表',
    kicker: '401–404 年段作業檢核',
    summary:
      '快速對照各班級命名規則與繳交格式，確保全學年專案匯整整齊一致。',
    actionLabel: '開啟命名檢核',
    iconKey: 'clipboard',
  },
];

export const CLASS403_CARDS: InteractiveModuleCardMeta<Class403TabId>[] = [
  {
    id: 'agenda',
    indexLabel: '01 · 每日聯繫',
    title: '403 互動聯絡簿與作業提醒',
    kicker: '當日作業 × 服裝攜帶提醒',
    summary:
      '即時查看每日功課、學習用品與重要事項通知，方便親師生同步掌握進度。',
    actionLabel: '開啟聯絡簿',
    iconKey: 'book',
  },
  {
    id: 'news',
    indexLabel: '02 · 時程規劃',
    title: '班級雙模式公告與行事曆',
    kicker: '月曆檢視 × 條列公告',
    summary:
      '整合校務活動、段考期程與班級重要日程，支援月曆與清單快速切換瀏覽。',
    actionLabel: '檢視行事曆',
    iconKey: 'calendar',
  },
  {
    id: 'resources',
    indexLabel: '03 · 自學資源',
    title: '403 學習資源庫與表單下載',
    kicker: '各科補充 × 請假表單',
    summary:
      '提供班級常用學習網站連結、複習教材與家長請假表單線上查閱與下載。',
    actionLabel: '開啟學習資源',
    iconKey: 'folder',
  },
  {
    id: 'contact',
    indexLabel: '04 · 班級聯繫',
    title: '每週課表與親師交流聯絡',
    kicker: '分機 5207 × 留言互動',
    summary:
      '完整呈現每週作息課表、導師聯絡資訊與班級留言板，建立即時親師溝通橋樑。',
    actionLabel: '查看課表聯絡',
    iconKey: 'message',
  },
];

export interface SwipeDeckCard {
  id: string;
  accentBarClass: string;
  accentTextClass: string;
  categoryLabel: string;
  metaPrimary?: string;
  metaSecondary?: string;
  title: string;
  summary: string;
  footerLeft: string;
  actionLabel: string;
  isLocked?: boolean;
  lockedTitle?: string;
  lockedSubtitle?: string;
  coverImageUrl?: string;
  embedUrl?: string;
  embedLabel?: string;
  embedProvider?: string;
  onAction: () => void;
}

export interface SwipeDeckGroup {
  id: string;
  topic: string;
  accentBarClass: string;
  accentTextClass: string;
  cards: SwipeDeckCard[];
}

export interface BuildSwipeDeckParams {
  activeChannel: PortalMajorChannel;
  featuredPosts: JournalPost[];
  topicGroups: TopicGroup[];
  checkPostLocked: (post: JournalPost) => boolean;
  visibleResources: TeachingResource[];
  publishedAssessmentQuestions: AssessmentQuestion[];
  assessmentGradeFilter: string;
  assessmentTabName: string;
  isXimenLocked: boolean;
  isClass403Locked: boolean;
  onSelectPost: (post: JournalPost) => void;
  onOpenResourcesHub: (resource?: TeachingResource) => void;
  onOpenAssessmentBank: (grade?: string | null, questionId?: string | null) => void;
  onOpenXimenStage: (tab: XimenTabId) => void;
  onOpenClass403Stage: (tab: Class403TabId) => void;
}

export interface BuiltChannelSwipeDeck {
  scopeLabel: string;
  groups: SwipeDeckGroup[];
  allChannelOffsets: {
    featuredIdx: number | null;
    journalStartIdx: number;
    resourcesIdx: number | null;
    assessmentIdx: number | null;
    ximenIdx: number | null;
    class403Idx: number | null;
  };
}

function mapJournalPostToDeckCard(
  post: JournalPost,
  groupTopic: string,
  checkPostLocked: (post: JournalPost) => boolean,
  onSelectPost: (post: JournalPost) => void,
): SwipeDeckCard {
  const isLocked = checkPostLocked(post);
  const accent = getCategoryAccent(post.category || groupTopic);
  const readMins = estimateReadMinutes(post.content || post.summary);
  const embedMeta = post.embedUrl ? inferEmbedProvider(post.embedUrl) : null;
  return {
    id: `post-${post.slug}-${post.rowIndex ?? post.publishedAt}`,
    accentBarClass: accent.barClass,
    accentTextClass: accent.textClass,
    categoryLabel: formatCategoryDisplay(post.category, groupTopic),
    metaPrimary: post.academicYear,
    metaSecondary: isLocked ? '校內限定' : `${readMins} 分鐘閱讀`,
    title: post.title,
    summary: isLocked
      ? '此篇文章為社群／校內限定內容，已暫時隱藏完整內文與雲端附件，請登入 @hmes.tp.edu.tw 帳號解鎖觀看。'
      : post.summary || '點擊「閱讀全文」檢視完整教案內容、數學探究脈絡與社群紀錄。',
    footerLeft: `${post.author} · ${post.publishedAt}`,
    actionLabel: isLocked ? '登入解鎖' : '閱讀全文',
    isLocked,
    lockedTitle: '校內限定 · @hmes.tp.edu.tw',
    lockedSubtitle: '需登入學校社群帳號方可解鎖閱讀',
    coverImageUrl: post.coverImageUrl,
    embedUrl: post.embedUrl,
    embedLabel: post.embedLabel || '檢視雲端教案與附件',
    embedProvider: embedMeta?.provider,
    onAction: () => onSelectPost(post),
  };
}

function mapResourceToDeckCard(
  res: TeachingResource,
  onOpenResourcesHub: (resource?: TeachingResource) => void,
): SwipeDeckCard {
  const isEbook =
    res.resourceType === '電子書' || /\.pdf(\b|$)/i.test(res.resourceUrl || '');
  return {
    id: `res-${res.id}`,
    accentBarClass: isEbook ? 'bg-[#1E3A8A]' : 'bg-amber-700',
    accentTextClass: isEbook ? 'text-[#1E3A8A]' : 'text-amber-800',
    categoryLabel: res.resourceType,
    metaPrimary: res.gradeBand,
    metaSecondary: res.isPinned ? '置頂精選' : res.sourceOrigin || '教學資源',
    title: res.title,
    summary:
      res.summary ||
      (res.topicTags
        ? `單元主題：${res.topicTags}。點擊開啟完整教材說明與互動閱覽。`
        : '點擊開啟完整教材說明與互動電子書閱覽。'),
    footerLeft: `${res.author} · ${res.publishedAt}`,
    actionLabel: isEbook ? '閱讀電子書' : '開啟資源',
    embedUrl:
      res.resourceUrl && /^https?:\/\//i.test(res.resourceUrl)
        ? res.resourceUrl
        : undefined,
    embedLabel: isEbook ? '電子書連結 / 檢視文件' : '資源原始連結',
    embedProvider: isEbook ? '數位電子書' : '雲端教學資源',
    onAction: () => onOpenResourcesHub(res),
  };
}

function mapAssessmentToDeckCard(
  q: AssessmentQuestion,
  idx: number,
  onOpenAssessmentBank: (grade?: string | null, questionId?: string | null) => void,
): SwipeDeckCard {
  const typeLabel = q.questionType === 'single-choice' ? '單選題' : '建構反應題';
  const validOptions = q.options.filter((opt) => opt.trim() !== '');
  const optionPreview =
    q.questionType === 'single-choice' && validOptions.length > 0
      ? `\n\n選項預覽：${validOptions
          .map((opt, i) => `(${String.fromCharCode(65 + i)}) ${opt}`)
          .join('　')}`
      : '';

  return {
    id: `assess-${q.id}`,
    accentBarClass: 'bg-emerald-700',
    accentTextClass: 'text-emerald-800',
    categoryLabel: `${q.grade} · ${q.domainTopic}`,
    metaPrimary: q.unitTitle || '數學素養評量',
    metaSecondary: `${typeLabel} · ${q.cognitiveLevel}`,
    title: `第 ${idx + 1} 題｜${q.stem}`,
    summary: `${q.hint ? `解題提示：${q.hint}` : '點擊「前往作答練習」進入互動試題作答與即時解析診斷。'}${optionPreview}`,
    footerLeft: `難度：${q.difficulty} · ${q.author}`,
    actionLabel: '前往作答練習',
    coverImageUrl: q.imageUrl || undefined,
    onAction: () => onOpenAssessmentBank(q.grade, q.id),
  };
}

function mapInteractiveModuleToDeckCard<TId extends string>(
  item: InteractiveModuleCardMeta<TId>,
  systemLabel: string,
  isLocked: boolean,
  onOpen: () => void,
): SwipeDeckCard {
  return {
    id: `${systemLabel}-${item.id}`,
    accentBarClass: 'bg-[#1E3A8A]',
    accentTextClass: 'text-[#1E3A8A]',
    categoryLabel: `${systemLabel} · ${item.indexLabel}`,
    metaPrimary: item.kicker,
    metaSecondary: isLocked ? '限 @hmes.tp.edu.tw' : '互動模組',
    title: item.title,
    summary: item.summary,
    footerLeft: systemLabel,
    actionLabel: isLocked ? '登入解鎖' : item.actionLabel,
    isLocked,
    lockedTitle: '校內限定 · @hmes.tp.edu.tw',
    lockedSubtitle: `登入學校社群帳號即可開啟「${item.title}」`,
    onAction: onOpen,
  };
}

export function sortAssessmentGradeGroups(
  questions: AssessmentQuestion[],
): Array<{grade: string; items: AssessmentQuestion[]}> {
  const order = [...ASSESSMENT_GRADES] as string[];
  const map = new Map<string, AssessmentQuestion[]>();
  for (const item of questions) {
    const g = item.grade || '未分年級';
    const arr = map.get(g);
    if (arr) arr.push(item);
    else map.set(g, [item]);
  }
  return Array.from(map.entries())
    .sort((a, b) => {
      const ia = order.indexOf(a[0]);
      const ib = order.indexOf(b[0]);
      if (ia !== -1 && ib !== -1) return ia - ib;
      if (ia !== -1) return -1;
      if (ib !== -1) return 1;
      return a[0].localeCompare(b[0], 'zh-Hant');
    })
    .map(([grade, items]) => ({grade, items}));
}

export function groupAssessmentByCognitive(
  questions: AssessmentQuestion[],
): Array<{level: string; items: AssessmentQuestion[]}> {
  const order = [...ASSESSMENT_COGNITIVE_LEVELS] as string[];
  const map = new Map<string, AssessmentQuestion[]>();
  for (const item of questions) {
    const lv = item.cognitiveLevel || '概念理解';
    const arr = map.get(lv);
    if (arr) arr.push(item);
    else map.set(lv, [item]);
  }
  return Array.from(map.entries())
    .sort((a, b) => {
      const ia = order.indexOf(a[0]);
      const ib = order.indexOf(b[0]);
      return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
    })
    .map(([level, items]) => ({level, items}));
}

export function buildChannelSwipeDeck(
  params: BuildSwipeDeckParams,
): BuiltChannelSwipeDeck {
  const {
    activeChannel,
    featuredPosts,
    topicGroups,
    checkPostLocked,
    visibleResources,
    publishedAssessmentQuestions,
    assessmentGradeFilter,
    isXimenLocked,
    isClass403Locked,
    onSelectPost,
    onOpenResourcesHub,
    onOpenAssessmentBank,
    onOpenXimenStage,
    onOpenClass403Stage,
  } = params;

  const emptyOffsets = {
    featuredIdx: null,
    journalStartIdx: 0,
    resourcesIdx: null,
    assessmentIdx: null,
    ximenIdx: null,
    class403Idx: null,
  };

  if (activeChannel === 'journal') {
    const groups: SwipeDeckGroup[] = topicGroups.map((g) => {
      const acc = getCategoryAccent(g.topic);
      return {
        id: `journal-${g.topic}`,
        topic: g.topic,
        accentBarClass: acc.barClass,
        accentTextClass: acc.textClass,
        cards: g.posts.map((p) =>
          mapJournalPostToDeckCard(p, g.topic, checkPostLocked, onSelectPost),
        ),
      };
    });
    return {
      scopeLabel: '領域社群 · 滑動快覽',
      groups,
      allChannelOffsets: emptyOffsets,
    };
  }

  if (activeChannel === 'resources') {
    const typeMap = new Map<string, TeachingResource[]>();
    for (const res of visibleResources) {
      const key = res.resourceType || '其他資源';
      const arr = typeMap.get(key);
      if (arr) arr.push(res);
      else typeMap.set(key, [res]);
    }
    const groups: SwipeDeckGroup[] = Array.from(typeMap.entries()).map(
      ([type, items]) => ({
        id: `resources-${type}`,
        topic: type,
        accentBarClass: type === '電子書' ? 'bg-[#1E3A8A]' : 'bg-amber-700',
        accentTextClass: type === '電子書' ? 'text-[#1E3A8A]' : 'text-amber-800',
        cards: items.map((res) =>
          mapResourceToDeckCard(res, onOpenResourcesHub),
        ),
      }),
    );
    return {
      scopeLabel: '教學資源 · 滑動快覽',
      groups,
      allChannelOffsets: emptyOffsets,
    };
  }

  if (activeChannel === 'assessment') {
    if (assessmentGradeFilter === '全部年級') {
      const gradeGroups = sortAssessmentGradeGroups(publishedAssessmentQuestions);
      const groups: SwipeDeckGroup[] = gradeGroups.map(({grade, items}) => ({
        id: `assess-grade-${grade}`,
        topic: `${grade}學力檢測`,
        accentBarClass: 'bg-emerald-700',
        accentTextClass: 'text-emerald-800',
        cards: items.map((q, idx) =>
          mapAssessmentToDeckCard(q, idx, onOpenAssessmentBank),
        ),
      }));
      return {
        scopeLabel: '檢測題庫 · 滑動快覽',
        groups,
        allChannelOffsets: emptyOffsets,
      };
    }

    const gradeFiltered = publishedAssessmentQuestions.filter(
      (q) => q.grade === assessmentGradeFilter,
    );
    const cogGroups = groupAssessmentByCognitive(gradeFiltered);
    const groups: SwipeDeckGroup[] = cogGroups.map(({level, items}) => ({
      id: `assess-cog-${assessmentGradeFilter}-${level}`,
      topic: `${assessmentGradeFilter} · ${level}`,
      accentBarClass: 'bg-emerald-700',
      accentTextClass: 'text-emerald-800',
      cards: items.map((q, idx) =>
        mapAssessmentToDeckCard(q, idx, onOpenAssessmentBank),
      ),
    }));
    return {
      scopeLabel: `${assessmentGradeFilter}檢測題庫 · 滑動快覽`,
      groups,
      allChannelOffsets: emptyOffsets,
    };
  }

  if (activeChannel === 'ximen') {
    return {
      scopeLabel: '互動專題 · 滑動快覽',
      groups: [
        {
          id: 'ximen-stage',
          topic: '百年西門 Scratch 舞台秀',
          accentBarClass: 'bg-sky-700',
          accentTextClass: 'text-sky-800',
          cards: XIMEN_CARDS.map((card) =>
            mapInteractiveModuleToDeckCard(
              card,
              '百年西門 Scratch',
              isXimenLocked,
              () => onOpenXimenStage(card.id),
            ),
          ),
        },
      ],
      allChannelOffsets: emptyOffsets,
    };
  }

  if (activeChannel === 'class403') {
    return {
      scopeLabel: '403 班網 · 滑動快覽',
      groups: [
        {
          id: 'class403-stage',
          topic: '403 班級網站與互動聯絡簿',
          accentBarClass: 'bg-[#1E3A8A]',
          accentTextClass: 'text-[#1E3A8A]',
          cards: CLASS403_CARDS.map((card) =>
            mapInteractiveModuleToDeckCard(
              card,
              '403 班級網站',
              isClass403Locked,
              () => onOpenClass403Stage(card.id),
            ),
          ),
        },
      ],
      allChannelOffsets: emptyOffsets,
    };
  }

  // Default: 'all' overview spanning every architecture section in exact PORTAL_MAJOR_CHANNELS order
  const groups: SwipeDeckGroup[] = [];
  const offsets = {
    featuredIdx: null as number | null,
    journalStartIdx: 0,
    resourcesIdx: null as number | null,
    assessmentIdx: null as number | null,
    ximenIdx: null as number | null,
    class403Idx: null as number | null,
  };

  if (featuredPosts.length > 0) {
    offsets.featuredIdx = groups.length;
    groups.push({
      id: 'all-featured',
      topic: '本期焦點精選',
      accentBarClass: 'bg-[#1E3A8A]',
      accentTextClass: 'text-[#1E3A8A]',
      cards: featuredPosts.map((p) =>
        mapJournalPostToDeckCard(p, '本期焦點', checkPostLocked, onSelectPost),
      ),
    });
  }

  offsets.journalStartIdx = groups.length;
  for (const g of topicGroups) {
    const acc = getCategoryAccent(g.topic);
    groups.push({
      id: `all-journal-${g.topic}`,
      topic: g.topic,
      accentBarClass: acc.barClass,
      accentTextClass: acc.textClass,
      cards: g.posts.map((p) =>
        mapJournalPostToDeckCard(p, g.topic, checkPostLocked, onSelectPost),
      ),
    });
  }

  if (visibleResources.length > 0) {
    offsets.resourcesIdx = groups.length;
    groups.push({
      id: 'all-resources',
      topic: '教學資源與電子書',
      accentBarClass: 'bg-amber-700',
      accentTextClass: 'text-amber-800',
      cards: visibleResources.map((res) =>
        mapResourceToDeckCard(res, onOpenResourcesHub),
      ),
    });
  }

  if (publishedAssessmentQuestions.length > 0) {
    offsets.assessmentIdx = groups.length;
    const gradeGroups = sortAssessmentGradeGroups(publishedAssessmentQuestions);
    const overviewCard: SwipeDeckCard = {
      id: 'assess-all-entry',
      accentBarClass: 'bg-emerald-700',
      accentTextClass: 'text-emerald-800',
      categoryLabel: '全題庫綜合練習',
      metaPrimary: `共 ${publishedAssessmentQuestions.length} 題`,
      metaSecondary: '單選題 · 建構反應題',
      title: '國小學力檢測跨年級互動挑戰',
      summary:
        '涵蓋一至六年級數學素養試題與建構反應題，作答後立即獲得迷思診斷解析與錯題複習。',
      footerLeft: '概念理解 · 程序執行 · 情境應用',
      actionLabel: '立即練習',
      onAction: () => onOpenAssessmentBank(null, null),
    };
    const gradeCards: SwipeDeckCard[] = gradeGroups.map(({grade, items}) => {
      const sampleUnits = Array.from(
        new Set(items.map((i) => i.unitTitle).filter(Boolean)),
      ).slice(0, 3);
      return {
        id: `assess-grade-card-${grade}`,
        accentBarClass: 'bg-[#1E3A8A]',
        accentTextClass: 'text-[#1E3A8A]',
        categoryLabel: `${grade}專區`,
        metaPrimary: `${items.length} 題精選`,
        metaSecondary: '即時回饋 · 錯題複習',
        title: `${grade}數學學力檢測題庫`,
        summary:
          sampleUnits.length > 0
            ? `精選單元：${sampleUnits.join('、')}等概念理解與實作檢測題組。`
            : items[0]?.stem || '點擊進入年級互動練習與即時解析。',
        footerLeft: `${grade}素養檢測題組`,
        actionLabel: `練習 ${grade}`,
        onAction: () => onOpenAssessmentBank(grade, null),
      };
    });
    groups.push({
      id: 'all-assessment',
      topic: '學力檢測互動題庫',
      accentBarClass: 'bg-emerald-700',
      accentTextClass: 'text-emerald-800',
      cards: [overviewCard, ...gradeCards],
    });
  }

  offsets.ximenIdx = groups.length;
  groups.push({
    id: 'all-ximen',
    topic: '百年西門 Scratch 互動專題',
    accentBarClass: 'bg-sky-700',
    accentTextClass: 'text-sky-800',
    cards: XIMEN_CARDS.map((c) =>
      mapInteractiveModuleToDeckCard(
        c,
        '百年西門 Scratch',
        isXimenLocked,
        () => onOpenXimenStage(c.id),
      ),
    ),
  });

  offsets.class403Idx = groups.length;
  groups.push({
    id: 'all-class403',
    topic: '403 班級網站與聯絡簿',
    accentBarClass: 'bg-[#1E3A8A]',
    accentTextClass: 'text-[#1E3A8A]',
    cards: CLASS403_CARDS.map((c) =>
      mapInteractiveModuleToDeckCard(
        c,
        '403 班級網站',
        isClass403Locked,
        () => onOpenClass403Stage(c.id),
      ),
    ),
  });

  return {
    scopeLabel: '全部精選 · 全架構快覽',
    groups,
    allChannelOffsets: offsets,
  };
}
