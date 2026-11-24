import React, {useEffect, useMemo, useState} from 'react';
import {
  ArrowLeft,
  BookOpen,
  Check,
  CloudUpload,
  Download,
  Edit3,
  ExternalLink,
  FileText,
  FolderOpen,
  Globe,
  Layers,
  Lock,
  MonitorPlay,
  Plus,
  QrCode,
  RefreshCw,
  Search,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react';
import {
  RESOURCE_GRADE_BANDS,
  RESOURCE_SOURCE_ORIGINS,
  RESOURCE_TYPES,
  SUGGESTED_TOPIC_TAGS,
} from '../data/seedResources';
import {exportResourcesAsCsv} from '../services/resourcesDb';
import {
  JournalPost,
  ResourceGradeBand,
  ResourceSourceOrigin,
  ResourceType,
  TeachingResource,
} from '../types/journal';
import {
  formatCategoryDisplay,
  parseCategories,
} from '../utils/postFormatting';
import {EbookViewerModal} from './EbookViewerModal';

interface TeachingResourcesHubModalProps {
  isOpen: boolean;
  onClose: () => void;
  resources: TeachingResource[];
  posts: JournalPost[];
  checkPostLocked: (post: JournalPost) => boolean;
  hasRemoteResourcesTab: boolean;
  spreadsheetId: string;
  isSyncing: boolean;
  syncError: string | null;
  isTeacherAdmin: boolean;
  hasAccessToken: boolean;
  defaultAuthorName?: string;
  onRefreshSync: () => void;
  onRequestSheetsAuth: () => void;
  onSyncSeedToSheet: () => Promise<void>;
  onSaveResource: (
    resource: TeachingResource,
    isNew: boolean,
  ) => Promise<void>;
  onDeleteResource: (resource: TeachingResource) => void;
  onOpenPost: (post: JournalPost) => void;
  onOpenEmbedStage: (url: string, title: string) => void;
  onOpenShareQr: (url: string, title: string) => void;
  disableEscapeClose?: boolean;
}

type SourceScopeFilter = 'all' | 'custom' | 'journal';
type GradeFilter = '全部年段' | ResourceGradeBand;
type TypeFilter = '全部類型' | ResourceType | '期刊教學資源';

type UnifiedResourceEntry =
  | {
      kind: 'resource';
      key: string;
      sortPinned: boolean;
      sortDate: string;
      resource: TeachingResource;
    }
  | {
      kind: 'journal';
      key: string;
      sortPinned: boolean;
      sortDate: string;
      post: JournalPost;
    };

function isSafeExternalOrLocalUrl(rawUrl?: string): boolean {
  if (!rawUrl) return false;
  const trimmed = rawUrl.trim();
  if (!trimmed) return false;
  if (trimmed.startsWith('./') || trimmed.startsWith('/')) return true;
  try {
    const parsed = new URL(trimmed);
    return parsed.protocol === 'https:' || parsed.protocol === 'http:';
  } catch {
    return false;
  }
}

function isInternalInteractiveHtmlUrl(rawUrl?: string): boolean {
  if (!rawUrl) return false;
  const trimmed = rawUrl.trim();
  return (
    trimmed.includes('ximen-scratch.html') ||
    trimmed.includes('class-403.html')
  );
}

function isEmbeddedReaderDocumentUrl(rawUrl?: string): boolean {
  if (!rawUrl) return false;
  return /\.(epub|md|markdown)(?:[?#].*)?$/i.test(rawUrl.trim());
}

function parseTopicTags(raw: string): string[] {
  if (!raw) return [];
  return raw
    .split(/[,，、;；|/]+/)
    .map((t) => t.trim())
    .filter(Boolean);
}

/**
 * Pure-React safe inline Markdown formatter (bold, inline code, safe links) without raw HTML injection.
 */
function renderSafeInline(text: string): React.ReactNode[] {
  const parts: React.ReactNode[] = [];
  const regex = /(\*\*[^*]+\*\*|`[^`]+`|\[[^\]]+\]\([^)]+\))/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let keyCounter = 0;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index));
    }
    const token = match[0];
    if (token.startsWith('**') && token.endsWith('**')) {
      parts.push(
        <strong key={`b-${keyCounter++}`} className="font-semibold text-stone-950">
          {token.slice(2, -2)}
        </strong>,
      );
    } else if (token.startsWith('`') && token.endsWith('`')) {
      parts.push(
        <code
          key={`c-${keyCounter++}`}
          className="px-1.5 py-0.5 mx-0.5 rounded bg-[#F7F4EE] border border-stone-200 font-mono-tabular text-[0.9em] text-[#1E3A8A]"
        >
          {token.slice(1, -1)}
        </code>,
      );
    } else if (token.startsWith('[')) {
      const linkMatch = token.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
      if (linkMatch && isSafeExternalOrLocalUrl(linkMatch[2])) {
        parts.push(
          <a
            key={`a-${keyCounter++}`}
            href={linkMatch[2]}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[#1E3A8A] underline underline-offset-2 hover:text-[#172554]"
          >
            {linkMatch[1]}
          </a>,
        );
      } else {
        parts.push(token);
      }
    }
    lastIndex = match.index + token.length;
  }

  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }
  return parts;
}

function SafeMarkdownNotes({content}: {content: string}) {
  const lines = content.split(/\r?\n/);
  const blocks: React.ReactNode[] = [];
  let listItems: {ordered: boolean; items: string[]} | null = null;
  let keyIdx = 0;

  const flushList = () => {
    if (!listItems) return;
    const Tag = listItems.ordered ? 'ol' : 'ul';
    blocks.push(
      <Tag
        key={`list-${keyIdx++}`}
        className={`my-3 pl-5 space-y-1.5 text-sm sm:text-[15px] text-stone-700 leading-relaxed ${
          listItems.ordered ? 'list-decimal' : 'list-disc'
        }`}
      >
        {listItems.items.map((item, i) => (
          <li key={i}>{renderSafeInline(item)}</li>
        ))}
      </Tag>,
    );
    listItems = null;
  };

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) {
      flushList();
      continue;
    }

    if (line.startsWith('### ')) {
      flushList();
      blocks.push(
        <h4
          key={`h4-${keyIdx++}`}
          className="font-editorial text-base font-bold text-stone-900 mt-5 mb-2"
        >
          {renderSafeInline(line.slice(4))}
        </h4>,
      );
      continue;
    }

    if (line.startsWith('## ') || line.startsWith('# ')) {
      flushList();
      const headingText = line.startsWith('## ') ? line.slice(3) : line.slice(2);
      blocks.push(
        <h3
          key={`h3-${keyIdx++}`}
          className="font-editorial text-lg font-bold text-stone-950 mt-6 mb-2.5 pb-1.5 border-b border-stone-200"
        >
          {renderSafeInline(headingText)}
        </h3>,
      );
      continue;
    }

    const unorderedMatch = line.match(/^[-*•]\s+(.*)$/);
    if (unorderedMatch) {
      if (listItems && listItems.ordered) flushList();
      if (!listItems) listItems = {ordered: false, items: []};
      listItems.items.push(unorderedMatch[1]);
      continue;
    }

    const orderedMatch = line.match(/^\d+\.\s+(.*)$/);
    if (orderedMatch) {
      if (listItems && !listItems.ordered) flushList();
      if (!listItems) listItems = {ordered: true, items: []};
      listItems.items.push(orderedMatch[1]);
      continue;
    }

    flushList();
    blocks.push(
      <p
        key={`p-${keyIdx++}`}
        className="text-sm sm:text-[15px] text-stone-700 leading-relaxed my-2.5"
      >
        {renderSafeInline(line)}
      </p>,
    );
  }

  flushList();
  return <div>{blocks}</div>;
}

const createEmptyResourceForm = (defaultAuthor = 'PesMath 數學領域社群'): TeachingResource => ({
  id: '',
  title: '',
  gradeBand: '中年級 (3-4)',
  resourceType: '自製教案 / 學習單',
  sourceOrigin: '原創自製',
  topicTags: '',
  summary: '',
  content: '',
  resourceUrl: '',
  author: defaultAuthor,
  publishedAt: new Date().toISOString().slice(0, 10),
  isPublic: true,
  isPinned: false,
});

export const TeachingResourcesHubModal: React.FC<
  TeachingResourcesHubModalProps
> = ({
  isOpen,
  onClose,
  resources,
  posts,
  checkPostLocked,
  hasRemoteResourcesTab,
  spreadsheetId,
  isSyncing,
  syncError,
  isTeacherAdmin,
  hasAccessToken,
  defaultAuthorName,
  onRefreshSync,
  onRequestSheetsAuth,
  onSyncSeedToSheet,
  onSaveResource,
  onDeleteResource,
  onOpenPost,
  onOpenEmbedStage,
  onOpenShareQr,
  disableEscapeClose = false,
}) => {
  const [sourceScope, setSourceScope] = useState<SourceScopeFilter>('all');
  const [gradeFilter, setGradeFilter] = useState<GradeFilter>('全部年段');
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('全部類型');
  const [searchQuery, setSearchQuery] = useState('');

  // Reader & Editor Sub-modals
  const [readingResource, setReadingResource] =
    useState<TeachingResource | null>(null);
  const [viewingEbook, setViewingEbook] = useState<TeachingResource | null>(
    null,
  );
  const [editorState, setEditorState] = useState<{
    isOpen: boolean;
    isNew: boolean;
    draft: TeachingResource;
  }>({
    isOpen: false,
    isNew: true,
    draft: createEmptyResourceForm(defaultAuthorName),
  });
  const [isSavingDraft, setIsSavingDraft] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [isSyncingSeedBatch, setIsSyncingSeedBatch] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (disableEscapeClose) return;
        if (editorState.isOpen) {
          setEditorState((prev) => ({...prev, isOpen: false}));
          return;
        }
        if (viewingEbook) {
          setViewingEbook(null);
          return;
        }
        if (readingResource) {
          setReadingResource(null);
          return;
        }
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [
    isOpen,
    disableEscapeClose,
    editorState.isOpen,
    viewingEbook,
    readingResource,
    onClose,
  ]);

  // Filter journal posts belonging to Teaching Resources category
  const journalTeachingPosts = useMemo(() => {
    return posts.filter((p) => {
      if (!isTeacherAdmin && p.status === 'Draft') return false;
      const cats = parseCategories(p.category);
      return cats.some(
        (c) => c === '教學資源' || c === '教學資源類' || c.includes('教學資源'),
      );
    });
  }, [posts, isTeacherAdmin]);

  // Visible custom resources (public for elementary teachers; drafts also visible to admin)
  const visibleCustomResources = useMemo(() => {
    return resources.filter((r) => isTeacherAdmin || r.isPublic);
  }, [resources, isTeacherAdmin]);

  // Build unified filtered entries
  const filteredEntries = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const list: UnifiedResourceEntry[] = [];

    if (sourceScope !== 'journal' && typeFilter !== '期刊教學資源') {
      for (const r of visibleCustomResources) {
        if (gradeFilter !== '全部年段' && r.gradeBand !== gradeFilter) continue;
        if (typeFilter !== '全部類型' && r.resourceType !== typeFilter) continue;
        if (q) {
          const haystack = [
            r.title,
            r.summary,
            r.topicTags,
            r.author,
            r.gradeBand,
            r.resourceType,
            r.sourceOrigin,
            r.content || '',
          ]
            .join(' ')
            .toLowerCase();
          if (!haystack.includes(q)) continue;
        }
        list.push({
          kind: 'resource',
          key: `res:${r.id}`,
          sortPinned: r.isPinned,
          sortDate: r.publishedAt || '1970-01-01',
          resource: r,
        });
      }
    }

    if (
      sourceScope !== 'custom' &&
      (typeFilter === '全部類型' || typeFilter === '期刊教學資源')
    ) {
      for (const post of journalTeachingPosts) {
        // If user selected a specific grade band, match keywords heuristically in title/summary or include if cross-grade
        if (gradeFilter !== '全部年段') {
          if (gradeFilter === '低年級 (1-2)') {
            const text = `${post.title} ${post.summary}`;
            if (!/[低一二]年級|1-2|小一|小二/.test(text)) continue;
          } else if (gradeFilter === '中年級 (3-4)') {
            const text = `${post.title} ${post.summary}`;
            if (!/[中三四]年級|3-4|401|402|403|404/.test(text)) continue;
          } else if (gradeFilter === '高年級 (5-6)') {
            const text = `${post.title} ${post.summary}`;
            if (!/[高五六]年級|5-6|小五|小六/.test(text)) continue;
          }
        }
        if (q) {
          const locked = checkPostLocked(post);
          const haystack = (
            locked
              ? [post.title, post.author, post.category, post.academicYear]
              : [
                  post.title,
                  post.summary,
                  post.content,
                  post.author,
                  post.category,
                  post.academicYear,
                ]
          )
            .join(' ')
            .toLowerCase();
          if (!haystack.includes(q)) continue;
        }
        list.push({
          kind: 'journal',
          key: `post:${post.slug}`,
          sortPinned: post.isFeatured,
          sortDate: post.publishedAt || '1970-01-01',
          post,
        });
      }
    }

    return list.sort((a, b) => {
      if (a.sortPinned !== b.sortPinned) return a.sortPinned ? -1 : 1;
      return b.sortDate.localeCompare(a.sortDate);
    });
  }, [
    sourceScope,
    gradeFilter,
    typeFilter,
    searchQuery,
    visibleCustomResources,
    journalTeachingPosts,
    checkPostLocked,
  ]);

  if (!isOpen) return null;

  const hubShareUrl =
    typeof window !== 'undefined'
      ? `${window.location.origin}${window.location.pathname}${
          spreadsheetId ? `?sheet=${encodeURIComponent(spreadsheetId)}&tab=resources` : '?tab=resources'
        }`
      : '';

  const hasActiveFilters =
    sourceScope !== 'all' ||
    gradeFilter !== '全部年段' ||
    typeFilter !== '全部類型' ||
    searchQuery.trim() !== '';

  const handleOpenCreateModal = () => {
    setFormError(null);
    setEditorState({
      isOpen: true,
      isNew: true,
      draft: createEmptyResourceForm(defaultAuthorName || '黃佩詩 老師'),
    });
  };

  const handleOpenEditModal = (res: TeachingResource) => {
    setFormError(null);
    setEditorState({
      isOpen: true,
      isNew: false,
      draft: {...res},
    });
  };

  const handleToggleTagInDraft = (tag: string) => {
    const existing = parseTopicTags(editorState.draft.topicTags);
    const exists = existing.includes(tag);
    const next = exists
      ? existing.filter((t) => t !== tag)
      : [...existing, tag];
    setEditorState((prev) => ({
      ...prev,
      draft: {...prev.draft, topicTags: next.join(', ')},
    }));
  };

  const handleSubmitResource = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    const cleanTitle = editorState.draft.title.trim();
    const cleanSummary = editorState.draft.summary.trim();
    const cleanUrl = (editorState.draft.resourceUrl || '').trim();

    if (!cleanTitle) {
      setFormError('請填寫資源標題。');
      return;
    }
    if (!cleanSummary) {
      setFormError('請填寫資源簡介說明。');
      return;
    }
    if (cleanUrl && !isSafeExternalOrLocalUrl(cleanUrl)) {
      setFormError('資源連結網址須以 https://、http:// 或站內相對路徑（./）開頭。');
      return;
    }

    const cleanId =
      editorState.draft.id.trim() || `res-${Date.now().toString(36)}`;

    const payload: TeachingResource = {
      ...editorState.draft,
      id: cleanId,
      title: cleanTitle,
      summary: cleanSummary,
      content: editorState.draft.content?.trim() || '',
      resourceUrl: cleanUrl || '',
      author: editorState.draft.author.trim() || 'PesMath 數學領域社群',
      topicTags: parseTopicTags(editorState.draft.topicTags).join(', '),
    };

    setIsSavingDraft(true);
    try {
      await onSaveResource(payload, editorState.isNew);
      setEditorState((prev) => ({...prev, isOpen: false}));
      if (readingResource && readingResource.id === payload.id) {
        setReadingResource(payload);
      }
      if (viewingEbook && viewingEbook.id === payload.id) {
        setViewingEbook(payload);
      }
    } catch (err: any) {
      setFormError(err?.message || '儲存教學資源失敗，請再試一次。');
    } finally {
      setIsSavingDraft(false);
    }
  };

  const handleExportCsv = () => {
    const csv = exportResourcesAsCsv(visibleCustomResources);
    const blob = new Blob([csv], {type: 'text/csv;charset=utf-8;'});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `pesmath-teaching-resources-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleTriggerSeedSync = async () => {
    setIsSyncingSeedBatch(true);
    try {
      await onSyncSeedToSheet();
    } finally {
      setIsSyncingSeedBatch(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-40 bg-[#FBF9F5] flex flex-col overflow-hidden"
      role="dialog"
      aria-modal="true"
      aria-labelledby="resources-hub-title"
    >
      {/* Top Bar */}
      <header className="bg-white border-b border-stone-200 px-4 sm:px-6 py-3 shrink-0">
        <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={onClose}
              className="min-h-[40px] px-3 py-2 text-xs sm:text-sm font-medium text-stone-700 bg-[#F7F4EE] border border-stone-200 rounded-lg hover:bg-stone-200/70 hover:text-stone-950 inline-flex items-center gap-1.5 transition-colors shrink-0"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>返回期刊首頁</span>
            </button>
            <div className="min-w-0">
              <h1
                id="resources-hub-title"
                className="font-editorial text-lg sm:text-xl font-bold text-stone-950 truncate"
              >
                國小數學教學資源平台
              </h1>
              <p className="text-xs text-stone-500 hidden sm:block truncate">
                公開免登入瀏覽 · 整合自製教案、數位互動工具、研習心得筆記與期刊教學資源
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <button
              type="button"
              onClick={() =>
                onOpenShareQr(hubShareUrl, '國小數學教學資源平台')
              }
              className="min-h-[40px] px-3 py-1.5 text-xs font-medium text-stone-700 bg-white border border-stone-300 rounded-lg hover:border-[#1E3A8A]/50 hover:text-[#1E3A8A] inline-flex items-center gap-1.5 transition-colors whitespace-nowrap"
              title="產生本平台專屬 QR Code 供老師掃碼使用"
            >
              <QrCode className="w-4 h-4 shrink-0" />
              <span className="hidden md:inline">平台 QR</span>
            </button>

            <button
              type="button"
              onClick={onRefreshSync}
              disabled={isSyncing}
              className="min-h-[40px] px-3 py-1.5 text-xs font-medium text-stone-700 bg-white border border-stone-300 rounded-lg hover:bg-stone-50 inline-flex items-center gap-1.5 transition-colors whitespace-nowrap disabled:opacity-50"
            >
              <RefreshCw
                className={`w-3.5 h-3.5 shrink-0 ${
                  isSyncing ? 'animate-spin' : ''
                }`}
              />
              <span className="hidden md:inline">重新同步</span>
            </button>

            {isTeacherAdmin && (
              <>
                <button
                  type="button"
                  onClick={handleExportCsv}
                  className="min-h-[40px] px-3 py-1.5 text-xs font-medium text-stone-700 bg-white border border-stone-300 rounded-lg hover:bg-stone-50 inline-flex items-center gap-1.5 transition-colors whitespace-nowrap"
                  title="下載目前公開教學資源清單 CSV"
                >
                  <Download className="w-3.5 h-3.5 shrink-0" />
                  <span className="hidden sm:inline">匯出清冊</span>
                </button>

                <button
                  type="button"
                  onClick={handleOpenCreateModal}
                  className="min-h-[40px] px-3.5 py-1.5 text-xs sm:text-sm font-semibold text-white bg-[#1E3A8A] rounded-lg hover:bg-[#172554] inline-flex items-center gap-1.5 transition-colors shadow-2xs whitespace-nowrap"
                >
                  <Plus className="w-4 h-4 shrink-0" />
                  <span>新增資源</span>
                </button>
              </>
            )}

            <button
              type="button"
              onClick={onClose}
              className="min-h-[40px] min-w-[40px] p-2 text-stone-500 hover:text-stone-900 hover:bg-stone-100 rounded-lg inline-flex items-center justify-center transition-colors"
              aria-label="關閉教學資源平台"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>
      </header>

      {/* Main Scrollable Area */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 sm:py-8 space-y-6">
          {/* Overview Strip + Admin Sync Callout */}
          <section className="bg-white border border-stone-200 rounded-2xl p-5 sm:p-6 space-y-4">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
              <div className="space-y-1.5 max-w-3xl">
                <div className="text-xs font-semibold tracking-wider text-[#1E3A8A] uppercase">
                  OPEN ELEMENTARY MATH RESOURCES · 國小教師共備與教學百寶箱
                </div>
                <h2 className="font-editorial text-xl sm:text-2xl font-bold text-stone-950 leading-snug">
                  獨立教學資源庫 × 期刊分類自動匯流
                </h2>
                <p className="text-sm text-stone-600 leading-relaxed">
                  專為國小教師打造的公開資源園地：完整收錄原創教案學習單、數位互動操作工具、研習實務筆記與精選公開好站，並即時同步主站「教學資源」分類文章。所有公開內容無需登入即可自由瀏覽與分享。
                </p>
              </div>

              <div className="grid grid-cols-3 gap-3 sm:gap-4 shrink-0 border-t lg:border-t-0 lg:border-l border-stone-200 pt-4 lg:pt-0 lg:pl-6">
                <div>
                  <div className="text-xs text-stone-500">公開資源總數</div>
                  <div className="font-mono-tabular text-2xl font-bold text-stone-950 mt-0.5">
                    {visibleCustomResources.length + journalTeachingPosts.length}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-stone-500">教案 / 研習</div>
                  <div className="font-mono-tabular text-2xl font-bold text-[#1E3A8A] mt-0.5">
                    {visibleCustomResources.length}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-stone-500">期刊彙整</div>
                  <div className="font-mono-tabular text-2xl font-bold text-stone-800 mt-0.5">
                    {journalTeachingPosts.length}
                  </div>
                </div>
              </div>
            </div>

            {syncError && (
              <div className="p-3.5 bg-red-50 border border-red-200 rounded-xl text-xs text-red-900">
                {syncError}
              </div>
            )}

            {isTeacherAdmin && !hasRemoteResourcesTab && (
              <div className="p-4 bg-[#F7F4EE] border border-stone-200 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="space-y-0.5 text-xs text-stone-700 leading-relaxed">
                  <div className="font-semibold text-stone-950">
                    尚未於 Google 試算表偵測到「Resources」專屬分頁
                  </div>
                  <div>
                    目前顯示為精選初始資源與本機暫存。點擊右側按鈕即可直接在您連結的試算表自動建立{' '}
                    <code className="font-mono-tabular bg-white px-1.5 py-0.5 rounded border border-stone-200">
                      Resources
                    </code>{' '}
                    分頁，並寫入現有資料，完全不消耗 Firestore 每日讀取額度。
                  </div>
                </div>
                {hasAccessToken && spreadsheetId ? (
                  <button
                    type="button"
                    onClick={handleTriggerSeedSync}
                    disabled={isSyncingSeedBatch || isSyncing}
                    className="min-h-[40px] px-4 py-2 text-xs font-semibold text-white bg-[#1E3A8A] rounded-lg hover:bg-[#172554] disabled:bg-stone-400 inline-flex items-center justify-center gap-1.5 whitespace-nowrap shrink-0 transition-colors"
                  >
                    <CloudUpload className="w-4 h-4 shrink-0" />
                    <span>
                      {isSyncingSeedBatch
                        ? '建立並寫入中...'
                        : '建立 Resources 分頁並同步資料'}
                    </span>
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={onRequestSheetsAuth}
                    className="min-h-[40px] px-4 py-2 text-xs font-semibold text-[#1E3A8A] bg-white border border-[#1E3A8A]/30 rounded-lg hover:bg-[#1E3A8A]/5 inline-flex items-center justify-center gap-1.5 whitespace-nowrap shrink-0 transition-colors"
                  >
                    <Layers className="w-4 h-4 shrink-0" />
                    <span>授權 Google Sheets 寫入權限</span>
                  </button>
                )}
              </div>
            )}
          </section>

          {/* Filter & Search Toolbar */}
          <section className="bg-white border border-stone-200 rounded-2xl p-4 sm:p-5 space-y-4">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
              {/* Source Scope Tabs */}
              <div
                className="flex flex-wrap items-center gap-1.5"
                role="tablist"
                aria-label="資源來源篩選"
              >
                {(
                  [
                    {
                      id: 'all',
                      label: `全部資源 (${
                        visibleCustomResources.length +
                        journalTeachingPosts.length
                      })`,
                    },
                    {
                      id: 'custom',
                      label: `教案・電子書・工具・筆記 (${visibleCustomResources.length})`,
                    },
                    {
                      id: 'journal',
                      label: `期刊教學資源專欄 (${journalTeachingPosts.length})`,
                    },
                  ] as Array<{id: SourceScopeFilter; label: string}>
                ).map((tab) => (
                  <button
                    key={tab.id}
                    type="button"
                    role="tab"
                    aria-selected={sourceScope === tab.id}
                    onClick={() => setSourceScope(tab.id)}
                    className={`min-h-[40px] px-3.5 py-2 text-xs font-medium rounded-lg border transition-colors whitespace-nowrap ${
                      sourceScope === tab.id
                        ? 'bg-[#1E3A8A] text-white border-[#1E3A8A]'
                        : 'bg-[#F7F4EE] text-stone-700 border-stone-200 hover:text-stone-950 hover:border-stone-300'
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>

              {/* Search Box */}
              <div className="relative w-full lg:w-80">
                <Search className="w-4 h-4 text-stone-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="搜尋單元、教案、研習關鍵字或作者..."
                  aria-label="搜尋教學資源"
                  className="w-full min-h-[40px] pl-10 pr-9 py-2 text-sm bg-[#FBF9F5] border border-stone-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1E3A8A]"
                />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => setSearchQuery('')}
                    aria-label="清除搜尋"
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-stone-400 hover:text-stone-700"
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>
            </div>

            {/* Grade Band & Type Filters */}
            <div className="pt-3 border-t border-stone-100 flex flex-col md:flex-row md:items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-xs font-medium text-stone-500 mr-1">
                  適用年段：
                </span>
                {(['全部年段', ...RESOURCE_GRADE_BANDS] as GradeFilter[]).map(
                  (grade) => (
                    <button
                      key={grade}
                      type="button"
                      onClick={() => setGradeFilter(grade)}
                      className={`min-h-[36px] px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors whitespace-nowrap ${
                        gradeFilter === grade
                          ? 'bg-stone-900 text-white border-stone-900'
                          : 'bg-white text-stone-700 border-stone-200 hover:border-stone-400'
                      }`}
                    >
                      {grade}
                    </button>
                  ),
                )}
              </div>

              <div className="flex items-center gap-2">
                <label
                  htmlFor="resource-type-select"
                  className="text-xs font-medium text-stone-500 whitespace-nowrap"
                >
                  資源類型：
                </label>
                <select
                  id="resource-type-select"
                  value={typeFilter}
                  onChange={(e) => setTypeFilter(e.target.value as TypeFilter)}
                  className="min-h-[36px] px-3 py-1.5 text-xs font-medium bg-white border border-stone-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1E3A8A]"
                >
                  <option value="全部類型">全部類型</option>
                  {RESOURCE_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                  <option value="期刊教學資源">期刊教學資源文章</option>
                </select>

                {hasActiveFilters && (
                  <button
                    type="button"
                    onClick={() => {
                      setSourceScope('all');
                      setGradeFilter('全部年段');
                      setTypeFilter('全部類型');
                      setSearchQuery('');
                    }}
                    className="min-h-[36px] px-2.5 py-1.5 text-xs font-medium text-[#1E3A8A] hover:underline whitespace-nowrap"
                  >
                    重設篩選
                  </button>
                )}
              </div>
            </div>
          </section>

          {/* Resource Cards Grid */}
          {filteredEntries.length === 0 ? (
            <div className="bg-white border border-stone-200 rounded-2xl p-10 text-center space-y-3">
              <FolderOpen className="w-8 h-8 text-stone-400 mx-auto" />
              <div className="font-editorial text-lg font-semibold text-stone-900">
                找不到符合條件的教學資源
              </div>
              <p className="text-sm text-stone-500 max-w-md mx-auto">
                請試著放寬年段或資源類型篩選條件，或清除搜尋關鍵字查看全部公開教案與研習筆記。
              </p>
              {hasActiveFilters && (
                <button
                  type="button"
                  onClick={() => {
                    setSourceScope('all');
                    setGradeFilter('全部年段');
                    setTypeFilter('全部類型');
                    setSearchQuery('');
                  }}
                  className="min-h-[40px] px-4 py-2 text-xs font-semibold text-white bg-[#1E3A8A] rounded-lg hover:bg-[#172554] transition-colors"
                >
                  顯示全部教學資源
                </button>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
              {filteredEntries.map((entry) => {
                if (entry.kind === 'resource') {
                  const res = entry.resource;
                  const tags = parseTopicTags(res.topicTags);
                  const hasValidUrl = isSafeExternalOrLocalUrl(res.resourceUrl);
                  const isInteractive = isInternalInteractiveHtmlUrl(
                    res.resourceUrl,
                  );
                  const isEbook = res.resourceType === '電子書';
                  const isEpubOrMdFile = isEmbeddedReaderDocumentUrl(
                    res.resourceUrl,
                  );
                  const openInEbookReader =
                    (isEbook && (hasValidUrl || Boolean(res.content))) ||
                    (hasValidUrl && isEpubOrMdFile);
                  const resolvedShareUrl =
                    hasValidUrl && !isInteractive && typeof window !== 'undefined'
                      ? new URL(res.resourceUrl!, window.location.href).toString()
                      : hubShareUrl;

                  return (
                    <article
                      key={entry.key}
                      className="bg-white border border-stone-200 rounded-2xl p-5 flex flex-col justify-between gap-4 hover:border-stone-300 hover:shadow-sm transition-all"
                    >
                      <div className="space-y-3">
                        {/* Clean Editorial Typographic Metadata Row (Zero Pill Discipline) */}
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs font-medium text-stone-500">
                          <span className="text-[#1E3A8A] font-semibold">
                            {res.gradeBand}
                          </span>
                          <span aria-hidden="true">·</span>
                          <span>{res.resourceType}</span>
                          <span aria-hidden="true">·</span>
                          <span>{res.sourceOrigin}</span>
                          {res.isPinned && (
                            <>
                              <span aria-hidden="true">·</span>
                              <span className="text-[#9A3412] font-semibold inline-flex items-center gap-1">
                                <Sparkles className="w-3 h-3" />
                                <span>精選</span>
                              </span>
                            </>
                          )}
                          {!res.isPublic && (
                            <>
                              <span aria-hidden="true">·</span>
                              <span className="text-amber-800 font-semibold">
                                草稿（僅管理員可見）
                              </span>
                            </>
                          )}
                        </div>

                        <h3 className="font-editorial text-lg font-bold text-stone-950 leading-snug">
                          {res.title}
                        </h3>

                        <p className="text-sm text-stone-600 leading-relaxed line-clamp-3">
                          {res.summary}
                        </p>

                        {tags.length > 0 && (
                          <div className="text-xs text-stone-500 flex flex-wrap gap-x-2.5 gap-y-1 pt-0.5">
                            {tags.map((tag) => (
                              <span key={tag}>#{tag}</span>
                            ))}
                          </div>
                        )}
                      </div>

                      <div className="pt-3 border-t border-stone-100 space-y-3">
                        <div className="flex items-center justify-between gap-2 text-xs text-stone-500">
                          <span className="truncate">{res.author}</span>
                          <span className="font-mono-tabular shrink-0">
                            {res.publishedAt}
                          </span>
                        </div>

                        <div className="flex flex-wrap items-center gap-2">
                          {res.content && (
                            <button
                              type="button"
                              onClick={() => setReadingResource(res)}
                              className="min-h-[38px] px-3 py-1.5 text-xs font-semibold text-stone-800 bg-[#F7F4EE] border border-stone-200 rounded-lg hover:bg-stone-200/70 inline-flex items-center gap-1.5 transition-colors"
                            >
                              <FileText className="w-3.5 h-3.5 shrink-0" />
                              <span>心得 / 說明</span>
                            </button>
                          )}

                          {openInEbookReader ? (
                            <button
                              type="button"
                              onClick={() => setViewingEbook(res)}
                              className="min-h-[38px] px-3 py-1.5 text-xs font-semibold text-white bg-[#1E3A8A] rounded-lg hover:bg-[#172554] inline-flex items-center gap-1.5 transition-colors"
                            >
                              <BookOpen className="w-3.5 h-3.5 shrink-0" />
                              <span>{isEbook ? '閱讀電子書' : '站內開啟文件'}</span>
                            </button>
                          ) : (
                            hasValidUrl &&
                            (isInteractive ? (
                              <button
                                type="button"
                                onClick={() =>
                                  onOpenEmbedStage(
                                    res.resourceUrl!,
                                    res.title,
                                  )
                                }
                                className="min-h-[38px] px-3 py-1.5 text-xs font-semibold text-white bg-[#1E3A8A] rounded-lg hover:bg-[#172554] inline-flex items-center gap-1.5 transition-colors"
                              >
                                <MonitorPlay className="w-3.5 h-3.5 shrink-0" />
                                <span>進入互動工具</span>
                              </button>
                            ) : (
                              <a
                                href={res.resourceUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="min-h-[38px] px-3 py-1.5 text-xs font-semibold text-white bg-[#1E3A8A] rounded-lg hover:bg-[#172554] inline-flex items-center gap-1.5 transition-colors"
                              >
                                <ExternalLink className="w-3.5 h-3.5 shrink-0" />
                                <span>開啟資源連結</span>
                              </a>
                            ))
                          )}

                          <button
                            type="button"
                            onClick={() =>
                              onOpenShareQr(resolvedShareUrl, res.title)
                            }
                            className="min-h-[38px] min-w-[38px] px-2.5 py-1.5 text-xs font-medium text-stone-600 bg-white border border-stone-200 rounded-lg hover:text-[#1E3A8A] hover:border-[#1E3A8A]/40 inline-flex items-center justify-center transition-colors"
                            title="分享此資源 QR Code"
                            aria-label={`分享 ${res.title} QR Code`}
                          >
                            <QrCode className="w-3.5 h-3.5" />
                          </button>

                          {isTeacherAdmin && (
                            <div className="ml-auto flex items-center gap-1.5">
                              <button
                                type="button"
                                onClick={() => handleOpenEditModal(res)}
                                className="min-h-[38px] px-2.5 py-1.5 text-xs font-medium text-stone-700 bg-white border border-stone-200 rounded-lg hover:bg-stone-50 inline-flex items-center gap-1 transition-colors"
                                aria-label={`編輯 ${res.title}`}
                              >
                                <Edit3 className="w-3.5 h-3.5" />
                                <span>編輯</span>
                              </button>
                              <button
                                type="button"
                                onClick={() => onDeleteResource(res)}
                                className="min-h-[38px] min-w-[38px] px-2 py-1.5 text-xs font-medium text-red-700 bg-white border border-red-200 rounded-lg hover:bg-red-50 inline-flex items-center justify-center transition-colors"
                                aria-label={`刪除 ${res.title}`}
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    </article>
                  );
                }

                // JournalPost entry synced from '教學資源' category
                const post = entry.post;
                const locked = checkPostLocked(post);
                const hasEmbed = isSafeExternalOrLocalUrl(post.embedUrl);
                const isInteractivePost = isInternalInteractiveHtmlUrl(
                  post.embedUrl,
                );

                return (
                  <article
                    key={entry.key}
                    className="bg-white border border-stone-200 rounded-2xl p-5 flex flex-col justify-between gap-4 hover:border-stone-300 hover:shadow-sm transition-all"
                  >
                    <div className="space-y-3">
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs font-medium text-stone-500">
                        <span className="text-[#14532D] font-semibold">
                          期刊教學資源文章
                        </span>
                        <span aria-hidden="true">·</span>
                        <span>{post.academicYear}</span>
                        <span aria-hidden="true">·</span>
                        <span>{formatCategoryDisplay(post.category)}</span>
                        {post.isFeatured && (
                          <>
                            <span aria-hidden="true">·</span>
                            <span className="text-[#9A3412] font-semibold">
                              精選
                            </span>
                          </>
                        )}
                        {locked && (
                          <>
                            <span aria-hidden="true">·</span>
                            <span className="text-amber-800 font-semibold inline-flex items-center gap-1">
                              <Lock className="w-3 h-3" />
                              校內限定
                            </span>
                          </>
                        )}
                      </div>

                      <h3 className="font-editorial text-lg font-bold text-stone-950 leading-snug">
                        {post.title}
                      </h3>

                      <p className="text-sm text-stone-600 leading-relaxed line-clamp-3">
                        {locked
                          ? '此期刊資源已設定為校內帳號限定檢視，登入後即可閱讀完整內容。'
                          : post.summary}
                      </p>
                    </div>

                    <div className="pt-3 border-t border-stone-100 space-y-3">
                      <div className="flex items-center justify-between gap-2 text-xs text-stone-500">
                        <span className="truncate">{post.author}</span>
                        <span className="font-mono-tabular shrink-0">
                          {post.publishedAt}
                        </span>
                      </div>

                      <div className="flex flex-wrap items-center gap-2">
                        <button
                          type="button"
                          onClick={() => onOpenPost(post)}
                          className="min-h-[38px] px-3 py-1.5 text-xs font-semibold text-white bg-[#1E3A8A] rounded-lg hover:bg-[#172554] inline-flex items-center gap-1.5 transition-colors"
                        >
                          <BookOpen className="w-3.5 h-3.5 shrink-0" />
                          <span>閱讀期刊全文</span>
                        </button>

                        {!locked &&
                          hasEmbed &&
                          (isInteractivePost ? (
                            <button
                              type="button"
                              onClick={() =>
                                onOpenEmbedStage(post.embedUrl!, post.title)
                              }
                              className="min-h-[38px] px-3 py-1.5 text-xs font-semibold text-stone-800 bg-[#F7F4EE] border border-stone-200 rounded-lg hover:bg-stone-200/70 inline-flex items-center gap-1.5 transition-colors"
                            >
                              <MonitorPlay className="w-3.5 h-3.5 shrink-0" />
                              <span>開啟互動舞台</span>
                            </button>
                          ) : (
                            <a
                              href={post.embedUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="min-h-[38px] px-3 py-1.5 text-xs font-semibold text-stone-800 bg-[#F7F4EE] border border-stone-200 rounded-lg hover:bg-stone-200/70 inline-flex items-center gap-1.5 transition-colors"
                            >
                              <ExternalLink className="w-3.5 h-3.5 shrink-0" />
                              <span>附件資源</span>
                            </a>
                          ))}
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Sub-Modal: Resource Detail / Reflection Reader */}
      {readingResource && (
        <div
          className="fixed inset-0 z-50 bg-stone-950/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-6"
          role="dialog"
          aria-modal="true"
          aria-labelledby="resource-detail-title"
          onClick={() => setReadingResource(null)}
        >
          <div
            className="bg-white border border-stone-200 rounded-2xl shadow-2xl max-w-2xl w-full max-h-[88vh] flex flex-col overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-5 py-4 border-b border-stone-200 flex items-center justify-between gap-3 shrink-0">
              <div className="text-xs font-medium text-stone-500 truncate">
                <span className="text-[#1E3A8A] font-semibold">
                  {readingResource.gradeBand}
                </span>
                <span className="mx-1.5">·</span>
                <span>{readingResource.resourceType}</span>
                <span className="mx-1.5">·</span>
                <span>{readingResource.sourceOrigin}</span>
              </div>
              <button
                type="button"
                onClick={() => setReadingResource(null)}
                className="min-h-[36px] min-w-[36px] p-1.5 text-stone-500 hover:text-stone-900 hover:bg-stone-100 rounded-lg inline-flex items-center justify-center"
                aria-label="關閉詳情"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-5 sm:px-7 py-5 space-y-4">
              <h2
                id="resource-detail-title"
                className="font-editorial text-xl sm:text-2xl font-bold text-stone-950 leading-snug"
              >
                {readingResource.title}
              </h2>

              <div className="text-xs text-stone-500 flex flex-wrap items-center gap-x-3 gap-y-1 pb-3 border-b border-stone-100">
                <span>提供者：{readingResource.author}</span>
                <span className="font-mono-tabular">
                  更新日期：{readingResource.publishedAt}
                </span>
                {parseTopicTags(readingResource.topicTags).length > 0 && (
                  <span>
                    單元標籤：
                    {parseTopicTags(readingResource.topicTags)
                      .map((t) => `#${t}`)
                      .join(' ')}
                  </span>
                )}
              </div>

              <div className="p-4 bg-[#F7F4EE] border border-stone-200 rounded-xl text-sm text-stone-800 leading-relaxed">
                {readingResource.summary}
              </div>

              {readingResource.content ? (
                <SafeMarkdownNotes content={readingResource.content} />
              ) : (
                <p className="text-sm text-stone-500">
                  此資源未額外填寫詳細教學心得筆記，您可直接點擊下方連結開啟資源使用。
                </p>
              )}
            </div>

            <div className="px-5 py-3.5 bg-[#FBF9F5] border-t border-stone-200 flex flex-wrap items-center justify-between gap-2 shrink-0">
              <div className="flex flex-wrap items-center gap-2">
                {((readingResource.resourceType === '電子書' &&
                  (isSafeExternalOrLocalUrl(readingResource.resourceUrl) ||
                    Boolean(readingResource.content))) ||
                  (isSafeExternalOrLocalUrl(readingResource.resourceUrl) &&
                    isEmbeddedReaderDocumentUrl(readingResource.resourceUrl))) ? (
                  <button
                    type="button"
                    onClick={() => {
                      const target = readingResource;
                      setReadingResource(null);
                      setViewingEbook(target);
                    }}
                    className="min-h-[40px] px-4 py-2 text-xs font-semibold text-white bg-[#1E3A8A] rounded-lg hover:bg-[#172554] inline-flex items-center gap-1.5 transition-colors"
                  >
                    <BookOpen className="w-4 h-4" />
                    <span>
                      {readingResource.resourceType === '電子書'
                        ? '開啟內嵌電子書閱讀器'
                        : '站內閱讀文件'}
                    </span>
                  </button>
                ) : (
                  isSafeExternalOrLocalUrl(readingResource.resourceUrl) &&
                  (isInternalInteractiveHtmlUrl(readingResource.resourceUrl) ? (
                    <button
                      type="button"
                      onClick={() => {
                        const target = readingResource;
                        setReadingResource(null);
                        onOpenEmbedStage(target.resourceUrl!, target.title);
                      }}
                      className="min-h-[40px] px-4 py-2 text-xs font-semibold text-white bg-[#1E3A8A] rounded-lg hover:bg-[#172554] inline-flex items-center gap-1.5 transition-colors"
                    >
                      <MonitorPlay className="w-4 h-4" />
                      <span>進入互動工具</span>
                    </button>
                  ) : (
                    <a
                      href={readingResource.resourceUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="min-h-[40px] px-4 py-2 text-xs font-semibold text-white bg-[#1E3A8A] rounded-lg hover:bg-[#172554] inline-flex items-center gap-1.5 transition-colors"
                    >
                      <ExternalLink className="w-4 h-4" />
                      <span>開啟資源連結</span>
                    </a>
                  ))
                )}

                <button
                  type="button"
                  onClick={() =>
                    onOpenShareQr(
                      isSafeExternalOrLocalUrl(readingResource.resourceUrl) &&
                        !isInternalInteractiveHtmlUrl(
                          readingResource.resourceUrl,
                        ) &&
                        typeof window !== 'undefined'
                        ? new URL(
                            readingResource.resourceUrl!,
                            window.location.href,
                          ).toString()
                        : hubShareUrl,
                      readingResource.title,
                    )
                  }
                  className="min-h-[40px] px-3 py-2 text-xs font-medium text-stone-700 bg-white border border-stone-300 rounded-lg hover:bg-stone-50 inline-flex items-center gap-1.5"
                >
                  <QrCode className="w-4 h-4" />
                  <span>QR 分享</span>
                </button>
              </div>

              {isTeacherAdmin && (
                <button
                  type="button"
                  onClick={() => {
                    const target = readingResource;
                    setReadingResource(null);
                    handleOpenEditModal(target);
                  }}
                  className="min-h-[40px] px-3.5 py-2 text-xs font-medium text-stone-800 bg-white border border-stone-300 rounded-lg hover:bg-stone-50 inline-flex items-center gap-1.5"
                >
                  <Edit3 className="w-3.5 h-3.5" />
                  <span>編輯此資源</span>
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Sub-Modal: Admin Add / Edit Resource Form */}
      {editorState.isOpen && isTeacherAdmin && (
        <div
          className="fixed inset-0 z-50 bg-stone-950/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-6"
          role="dialog"
          aria-modal="true"
          aria-labelledby="resource-editor-title"
          onClick={() => setEditorState((prev) => ({...prev, isOpen: false}))}
        >
          <div
            className="bg-white border border-stone-200 rounded-2xl shadow-2xl max-w-2xl w-full max-h-[90vh] flex flex-col overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-5 py-4 border-b border-stone-200 flex items-center justify-between gap-3 shrink-0">
              <div>
                <h2
                  id="resource-editor-title"
                  className="font-editorial text-lg font-bold text-stone-950"
                >
                  {editorState.isNew
                    ? '新增國小數學教學資源'
                    : '編輯教學資源內容'}
                </h2>
                <p className="text-xs text-stone-500 mt-0.5">
                  儲存後將寫入 Google 試算表「Resources」分頁（若尚未登入寫入授權則暫存於本機）
                </p>
              </div>
              <button
                type="button"
                onClick={() =>
                  setEditorState((prev) => ({...prev, isOpen: false}))
                }
                className="min-h-[36px] min-w-[36px] p-1.5 text-stone-500 hover:text-stone-900 hover:bg-stone-100 rounded-lg inline-flex items-center justify-center"
                aria-label="關閉表單"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form
              onSubmit={handleSubmitResource}
              className="flex-1 overflow-y-auto p-5 space-y-4"
            >
              {formError && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-xs text-red-900">
                  {formError}
                </div>
              )}

              <div>
                <label className="block text-xs font-medium text-stone-700 mb-1">
                  資源標題 *
                </label>
                <input
                  type="text"
                  required
                  value={editorState.draft.title}
                  onChange={(e) =>
                    setEditorState((prev) => ({
                      ...prev,
                      draft: {...prev.draft, title: e.target.value},
                    }))
                  }
                  placeholder="例如：五年級異分母分數加減視覺化學習單／研習筆記"
                  className="w-full min-h-[40px] px-3.5 py-2 text-sm border border-stone-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1E3A8A]"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-medium text-stone-700 mb-1">
                    適用年段
                  </label>
                  <select
                    value={editorState.draft.gradeBand}
                    onChange={(e) =>
                      setEditorState((prev) => ({
                        ...prev,
                        draft: {
                          ...prev.draft,
                          gradeBand: e.target.value as ResourceGradeBand,
                        },
                      }))
                    }
                    className="w-full min-h-[40px] px-3 py-2 text-sm border border-stone-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-[#1E3A8A]"
                  >
                    {RESOURCE_GRADE_BANDS.map((g) => (
                      <option key={g} value={g}>
                        {g}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium text-stone-700 mb-1">
                    資源類型
                  </label>
                  <select
                    value={editorState.draft.resourceType}
                    onChange={(e) =>
                      setEditorState((prev) => ({
                        ...prev,
                        draft: {
                          ...prev.draft,
                          resourceType: e.target.value as ResourceType,
                        },
                      }))
                    }
                    className="w-full min-h-[40px] px-3 py-2 text-sm border border-stone-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-[#1E3A8A]"
                  >
                    {RESOURCE_TYPES.map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium text-stone-700 mb-1">
                    資源來源屬性
                  </label>
                  <select
                    value={editorState.draft.sourceOrigin}
                    onChange={(e) =>
                      setEditorState((prev) => ({
                        ...prev,
                        draft: {
                          ...prev.draft,
                          sourceOrigin: e.target.value as ResourceSourceOrigin,
                        },
                      }))
                    }
                    className="w-full min-h-[40px] px-3 py-2 text-sm border border-stone-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-[#1E3A8A]"
                  >
                    {RESOURCE_SOURCE_ORIGINS.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-stone-700 mb-1">
                    作者／分享整理者
                  </label>
                  <input
                    type="text"
                    value={editorState.draft.author}
                    onChange={(e) =>
                      setEditorState((prev) => ({
                        ...prev,
                        draft: {...prev.draft, author: e.target.value},
                      }))
                    }
                    className="w-full min-h-[40px] px-3.5 py-2 text-sm border border-stone-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1E3A8A]"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-stone-700 mb-1">
                    發布／更新日期
                  </label>
                  <input
                    type="date"
                    value={editorState.draft.publishedAt}
                    onChange={(e) =>
                      setEditorState((prev) => ({
                        ...prev,
                        draft: {...prev.draft, publishedAt: e.target.value},
                      }))
                    }
                    className="w-full min-h-[40px] px-3.5 py-2 text-sm font-mono-tabular border border-stone-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1E3A8A]"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-stone-700 mb-1">
                  {editorState.draft.resourceType === '電子書'
                    ? '電子書檔案或網頁連結（支援 PDF .pdf、EPUB .epub、Markdown .md、HTML5 .html 或 Google 雲端硬碟連結，將內嵌於平台閱讀）'
                    : '資源連結網址（選填：Google 雲端硬碟、GeoGebra、外部網站、.epub/.md 檔案或站內互動工具）'}
                </label>
                <div className="relative">
                  <Globe className="w-4 h-4 text-stone-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    type="text"
                    value={editorState.draft.resourceUrl || ''}
                    onChange={(e) =>
                      setEditorState((prev) => ({
                        ...prev,
                        draft: {...prev.draft, resourceUrl: e.target.value},
                      }))
                    }
                    placeholder={
                      editorState.draft.resourceType === '電子書'
                        ? './assets/.../book.epub 或 .pdf / .md / .html 或 Google Drive 連結'
                        : 'https://drive.google.com/... 或 ./docs/lesson.md'
                    }
                    className="w-full min-h-[40px] pl-10 pr-3.5 py-2 text-sm font-mono-tabular border border-stone-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1E3A8A]"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-stone-700 mb-1">
                  數學單元與主題標籤（逗號分隔）
                </label>
                <input
                  type="text"
                  value={editorState.draft.topicTags}
                  onChange={(e) =>
                    setEditorState((prev) => ({
                      ...prev,
                      draft: {...prev.draft, topicTags: e.target.value},
                    }))
                  }
                  placeholder="例如：分數與小數, 幾何與空間, 學習單"
                  className="w-full min-h-[40px] px-3.5 py-2 text-sm border border-stone-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1E3A8A]"
                />
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {SUGGESTED_TOPIC_TAGS.map((tag) => {
                    const selected = parseTopicTags(
                      editorState.draft.topicTags,
                    ).includes(tag);
                    return (
                      <button
                        key={tag}
                        type="button"
                        onClick={() => handleToggleTagInDraft(tag)}
                        className={`px-2.5 py-1 text-xs rounded-md border transition-colors ${
                          selected
                            ? 'bg-[#1E3A8A] text-white border-[#1E3A8A]'
                            : 'bg-[#F7F4EE] text-stone-700 border-stone-200 hover:border-stone-400'
                        }`}
                      >
                        {selected ? '✓ ' : '+ '}
                        {tag}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-stone-700 mb-1">
                  卡片簡介說明 *
                </label>
                <textarea
                  required
                  rows={2}
                  value={editorState.draft.summary}
                  onChange={(e) =>
                    setEditorState((prev) => ({
                      ...prev,
                      draft: {...prev.draft, summary: e.target.value},
                    }))
                  }
                  placeholder="簡要說明此教案、工具或研習筆記的教學亮點與適用情境（顯示於資源卡片上）"
                  className="w-full px-3.5 py-2 text-sm border border-stone-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1E3A8A]"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-stone-700 mb-1">
                  詳細教學實施說明／研習心得筆記（選填，支援簡易 Markdown：## 標題、- 條列、**粗體**）
                </label>
                <textarea
                  rows={6}
                  value={editorState.draft.content || ''}
                  onChange={(e) =>
                    setEditorState((prev) => ({
                      ...prev,
                      draft: {...prev.draft, content: e.target.value},
                    }))
                  }
                  placeholder={`## 課堂應用建議\n1. 先引導學生觀察...\n2. 分組操作重點...`}
                  className="w-full px-3.5 py-2 text-sm border border-stone-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1E3A8A] leading-relaxed"
                />
              </div>

              <div className="pt-2 flex flex-wrap items-center gap-6 text-xs sm:text-sm text-stone-700">
                <label className="inline-flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={editorState.draft.isPublic}
                    onChange={(e) =>
                      setEditorState((prev) => ({
                        ...prev,
                        draft: {...prev.draft, isPublic: e.target.checked},
                      }))
                    }
                    className="w-4 h-4 accent-[#1E3A8A]"
                  />
                  <span>公開提供給所有國小教師瀏覽（免登入）</span>
                </label>

                <label className="inline-flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={editorState.draft.isPinned}
                    onChange={(e) =>
                      setEditorState((prev) => ({
                        ...prev,
                        draft: {...prev.draft, isPinned: e.target.checked},
                      }))
                    }
                    className="w-4 h-4 accent-[#1E3A8A]"
                  />
                  <span>置頂為平台精選推薦</span>
                </label>
              </div>

              <div className="pt-4 border-t border-stone-200 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() =>
                    setEditorState((prev) => ({...prev, isOpen: false}))
                  }
                  className="min-h-[40px] px-4 py-2 text-xs font-medium text-stone-700 bg-white border border-stone-300 rounded-lg hover:bg-stone-50"
                >
                  取消
                </button>
                <button
                  type="submit"
                  disabled={isSavingDraft}
                  className="min-h-[40px] px-5 py-2 text-xs sm:text-sm font-semibold text-white bg-[#1E3A8A] rounded-lg hover:bg-[#172554] disabled:bg-stone-400 inline-flex items-center gap-1.5 transition-colors"
                >
                  <Check className="w-4 h-4" />
                  <span>
                    {isSavingDraft
                      ? '儲存同步中...'
                      : editorState.isNew
                        ? '確認發布資源'
                        : '儲存變更'}
                  </span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      {/* Sub-Modal: Embedded Lightweight PDF / HTML5 Ebook Viewer */}
      <EbookViewerModal
        resource={viewingEbook}
        onClose={() => setViewingEbook(null)}
        onOpenShareQr={onOpenShareQr}
        hubShareUrl={hubShareUrl}
        renderNotes={(content) => <SafeMarkdownNotes content={content} />}
      />
    </div>
  );
};
