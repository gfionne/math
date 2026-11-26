export type PostStatus = 'Published' | 'Draft' | 'Restricted';

export type NavLockOptionId = 'meeting-checkin' | 'class-403' | 'ximen-stage';

export interface EmbedResource {
  url: string;
  label: string;
  provider: 'Google Drive' | 'Google Meet' | 'Google Forms' | 'Google Sheets' | 'External';
}

export interface JournalPost {
  slug: string;
  title: string;
  summary: string;
  content: string;
  category: string;
  academicYear: string;
  publishedAt: string;
  author: string;
  isFeatured: boolean;
  status: PostStatus;
  coverImageUrl?: string;
  embedUrl?: string;
  embedLabel?: string;
  rowIndex?: number; // 1-based row index inside Google Sheet (header is row 1)
}

export type DataSourceMode = 'seed' | 'sheets-api' | 'sheets-public' | 'local-json';

export interface SpreadsheetTabInfo {
  sheetId: number;
  title: string;
}

export interface SpreadsheetMeta {
  spreadsheetId: string;
  title: string;
  tabs: SpreadsheetTabInfo[];
  activeTab: string;
}

export interface ConfirmActionState {
  isOpen: boolean;
  title: string;
  description: string;
  details?: string[];
  confirmLabel: string;
  isDestructive?: boolean;
  onConfirm: () => Promise<void> | void;
}

export interface SiteSettings {
  siteTitle: string;
  siteSubtitle: string;
  heroHeading: string;
  heroDescription: string;
  autoDynamicTitle: boolean;
  autoTitleFromSheet: boolean;
  lockedCategories?: string[];
  lockedNavOptions?: string[];
}

export type ResourceGradeBand =
  | '低年級 (1-2)'
  | '中年級 (3-4)'
  | '高年級 (5-6)'
  | '跨年級通用';

export type ResourceType =
  | '自製教案 / 學習單'
  | '數位互動工具'
  | '電子書'
  | '研習心得筆記'
  | '公開好站精選';

export type ResourceSourceOrigin = '原創自製' | '研習筆記' | '公開精選';

export interface TeachingResource {
  id: string;
  title: string;
  gradeBand: ResourceGradeBand;
  resourceType: ResourceType;
  sourceOrigin: ResourceSourceOrigin;
  topicTags: string;
  summary: string;
  content?: string;
  resourceUrl?: string;
  author: string;
  publishedAt: string;
  isPublic: boolean;
  isPinned: boolean;
  rowIndex?: number; // 1-based row index inside Google Sheet 'Resources' tab
}

export type AssessmentQuestionType = 'single-choice' | 'constructed-response';

export type AssessmentCognitiveLevel = '概念理解' | '程序執行' | '情境應用';

export type AssessmentDifficulty = '基礎' | '中等' | '進階';

export interface AssessmentQuestion {
  id: string;
  academicYear: string;
  grade: string;
  domainTopic: string;
  unitTitle: string;
  cognitiveLevel: AssessmentCognitiveLevel;
  questionType: AssessmentQuestionType;
  stem: string;
  options: string[];
  correctAnswer: string;
  explanation: string;
  hint?: string;
  imageUrl?: string;
  difficulty: AssessmentDifficulty;
  author: string;
  isPublished: boolean;
  rowIndex?: number; // 1-based row index inside Google Sheet assessment tab
}
