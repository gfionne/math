import React, {useEffect, useMemo, useState} from 'react';
import {
  ArrowLeft,
  BookOpen,
  Check,
  ChevronDown,
  ChevronUp,
  CloudUpload,
  Download,
  Edit3,
  ExternalLink,
  FileText,
  FileUp,
  FolderOpen,
  Globe,
  Layers,
  LayoutGrid,
  List,
  Loader2,
  Lock,
  MonitorPlay,
  Plus,
  QrCode,
  RefreshCw,
  Search,
  Sparkles,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import {
  RESOURCE_GRADE_BANDS,
  RESOURCE_SOURCE_ORIGINS,
  RESOURCE_TYPES,
  SUGGESTED_TOPIC_TAGS,
} from '../data/seedResources';
import {DriveUploadResult} from '../services/driveUpload';
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
import {
  CONSTRUCTED_RESPONSE_BOOK_META,
  EbookTocEntry,
  enrichTeachingResourceMetadata,
  getPedagogicalTypeGroup,
  isConstructedResponseBookResource,
  mapChapterGradeToGradeBand,
} from '../utils/ebookToc';
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
  onUploadResourceFile?: (
    file: File,
    categoryFolder?: string,
  ) => Promise<DriveUploadResult>;
  onOpenPost: (post: JournalPost) => void;
  onOpenEmbedStage: (url: string, title: string) => void;
  onOpenShareQr: (url: string, title: string) => void;
  initialOpenResource?: TeachingResource | null;
  onConsumeInitialResource?: () => void;
  disableEscapeClose?: boolean;
}

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

function isPdfOrDriveFileUrl(rawUrl?: string): boolean {
  if (!rawUrl) return false;
  const trimmed = rawUrl.trim();
  if (!trimmed) return false;
  if (/^data:application\/pdf/i.test(trimmed)) return true;
  if (/\.pdf(?:[?#].*)?$/i.test(trimmed)) return true;
  try {
    const base =
      typeof window !== 'undefined' ? window.location.href : 'http://localhost/';
    const parsed = new URL(trimmed, base);
    if (/\.pdf$/i.test(parsed.pathname)) return true;
    if (parsed.hostname.includes('drive.google.com')) {
      if (parsed.pathname.includes('/folders/')) return false;
      if (/\/file\/d\/[a-zA-Z0-9_-]+/i.test(parsed.pathname)) return true;
      const idParam = parsed.searchParams.get('id');
      if (idParam && /^[a-zA-Z0-9_-]+$/.test(idParam)) return true;
    }
  } catch {
    return false;
  }
  return false;
}

function isEmbeddedReaderDocumentUrl(rawUrl?: string): boolean {
  if (!rawUrl) return false;
  const trimmed = rawUrl.trim();
  if (isPdfOrDriveFileUrl(trimmed)) return true;
  return /\.(epub|md|markdown)(?:[?#].*)?$/i.test(trimmed);
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

type HubViewMode = 'directory' | 'cards';

const CATEGORY_META: Array<{
  id: Exclude<TypeFilter, '全部類型'>;
  shortLabel: string;
  fullLabel: string;
}> = [
  {id: '自製教案 / 學習單', shortLabel: '教案學習單', fullLabel: '自製教案 / 學習單'},
  {id: '電子書', shortLabel: '電子書', fullLabel: '數位電子書'},
  {id: '數位互動工具', shortLabel: '互動工具', fullLabel: '數位互動工具'},
  {id: '研習心得筆記', shortLabel: '研習筆記', fullLabel: '研習心得筆記'},
  {id: '公開好站精選', shortLabel: '公開好站', fullLabel: '公開好站精選'},
  {id: '期刊教學資源', shortLabel: '領域社群', fullLabel: '領域社群教學資源'},
];

function getShortGradeLabel(grade: ResourceGradeBand): string {
  if (grade === '低年級 (1-2)') return '低年級';
  if (grade === '中年級 (3-4)') return '中年級';
  if (grade === '高年級 (5-6)') return '高年級';
  return '跨年級';
}

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
  onUploadResourceFile,
  onOpenPost,
  onOpenEmbedStage,
  onOpenShareQr,
  initialOpenResource = null,
  onConsumeInitialResource,
  disableEscapeClose = false,
}) => {
  const [gradeFilter, setGradeFilter] = useState<GradeFilter>('全部年段');
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('全部類型');
  const [searchQuery, setSearchQuery] = useState('');
  const [viewMode, setViewMode] = useState<HubViewMode>('directory');

  // Reader & Editor Sub-modals
  const [readingResource, setReadingResource] =
    useState<TeachingResource | null>(null);
  const [viewingEbook, setViewingEbook] = useState<TeachingResource | null>(
    null,
  );
  const [viewingEbookInitialPage, setViewingEbookInitialPage] = useState<
    number | null
  >(null);
  const [editorState, setEditorState] = useState<{
    isOpen: boolean;
    isNew: boolean;
    draft: TeachingResource;
  }>({
    isOpen: false,
    isNew: true,
    draft: createEmptyResourceForm(defaultAuthorName),
  });
  const [stagedFile, setStagedFile] = useState<File | null>(null);
  const [isDraggingQuickDrop, setIsDraggingQuickDrop] = useState(false);
  const [isDraggingModalDrop, setIsDraggingModalDrop] = useState(false);
  const [showAdvancedFields, setShowAdvancedFields] = useState(false);
  const [isSavingDraft, setIsSavingDraft] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [isSyncingSeedBatch, setIsSyncingSeedBatch] = useState(false);
  const [isUploadingFile, setIsUploadingFile] = useState(false);
  const [uploadNotice, setUploadNotice] = useState<string | null>(null);
  const resourceFileInputRef = React.useRef<HTMLInputElement | null>(null);
  const quickDropFileInputRef = React.useRef<HTMLInputElement | null>(null);

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

  useEffect(() => {
    if (!isOpen || !initialOpenResource) return;
    const enriched = enrichTeachingResourceMetadata(initialOpenResource);
    const isPdfOrEbook =
      enriched.resourceType === '電子書' ||
      /\.pdf(\?|#|$)/i.test(enriched.resourceUrl || '');
    if (isPdfOrEbook) {
      setReadingResource(null);
      setViewingEbookInitialPage(null);
      setViewingEbook(enriched);
    } else {
      setViewingEbook(null);
      setReadingResource(enriched);
    }
    onConsumeInitialResource?.();
  }, [isOpen, initialOpenResource, onConsumeInitialResource]);

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
    return resources
      .filter((r) => isTeacherAdmin || r.isPublic)
      .map((r) => enrichTeachingResourceMetadata(r));
  }, [resources, isTeacherAdmin]);

  const constructedResponseBook = useMemo(
    () =>
      visibleCustomResources.find((r) =>
        isConstructedResponseBookResource(r),
      ) ?? null,
    [visibleCustomResources],
  );

  // Per-category counts for single-click category tabs
  const typeCounts = useMemo(() => {
    const counts: Record<TypeFilter, number> = {
      全部類型: visibleCustomResources.length + journalTeachingPosts.length,
      '自製教案 / 學習單': 0,
      數位互動工具: 0,
      電子書: 0,
      研習心得筆記: 0,
      公開好站精選: 0,
      期刊教學資源: journalTeachingPosts.length,
    };
    for (const r of visibleCustomResources) {
      counts[r.resourceType] = (counts[r.resourceType] ?? 0) + 1;
    }
    return counts;
  }, [visibleCustomResources, journalTeachingPosts.length]);

  // Build unified filtered entries
  const filteredEntries = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const list: UnifiedResourceEntry[] = [];

    if (typeFilter !== '期刊教學資源') {
      for (const r of visibleCustomResources) {
        const isCrBook = isConstructedResponseBookResource(r);
        if (gradeFilter !== '全部年段' && r.gradeBand !== gradeFilter) {
          const matchesChapterGrade =
            isCrBook &&
            CONSTRUCTED_RESPONSE_BOOK_META.entries.some(
              (ch) => mapChapterGradeToGradeBand(ch.grade) === gradeFilter,
            );
          if (!matchesChapterGrade) continue;
        }
        if (typeFilter !== '全部類型' && r.resourceType !== typeFilter) continue;
        if (q) {
          const chapterHaystack = isCrBook
            ? CONSTRUCTED_RESPONSE_BOOK_META.entries
                .map((ch) =>
                  [
                    ch.order || '',
                    ch.category || '',
                    ch.grade || '',
                    ch.title,
                    ch.designer || '',
                    ch.resourceKind || '',
                    ch.pageNote || '',
                    ch.bookPageNote || '',
                  ].join(' '),
                )
                .join(' ')
            : '';
          const haystack = [
            r.title,
            r.summary,
            r.topicTags,
            r.author,
            r.gradeBand,
            r.resourceType,
            r.sourceOrigin,
            r.content || '',
            chapterHaystack,
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

    if (typeFilter === '全部類型' || typeFilter === '期刊教學資源') {
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
    gradeFilter,
    typeFilter,
    searchQuery,
    visibleCustomResources,
    journalTeachingPosts,
    checkPostLocked,
  ]);

  // Group filtered entries by category for the at-a-glance directory view
  const groupedDirectorySections = useMemo(() => {
    const bucketMap = new Map<
      Exclude<TypeFilter, '全部類型'>,
      UnifiedResourceEntry[]
    >();
    for (const meta of CATEGORY_META) {
      bucketMap.set(meta.id, []);
    }
    for (const entry of filteredEntries) {
      const catId: Exclude<TypeFilter, '全部類型'> =
        entry.kind === 'journal'
          ? '期刊教學資源'
          : entry.resource.resourceType;
      const list = bucketMap.get(catId);
      if (list) {
        list.push(entry);
      } else {
        bucketMap.set(catId, [entry]);
      }
    }
    return CATEGORY_META.map((meta) => ({
      ...meta,
      entries: bucketMap.get(meta.id) || [],
    })).filter((sec) => sec.entries.length > 0);
  }, [filteredEntries]);

  const filteredChapterCatalog = useMemo(() => {
    if (!constructedResponseBook) return [];
    const q = searchQuery.trim().toLowerCase();
    return CONSTRUCTED_RESPONSE_BOOK_META.entries.filter((entry) => {
      const cat = entry.category || '';
      const isAppdx = cat === '導覽與前言' || cat === '書末版權與附錄';
      if (isAppdx) return false;

      if (gradeFilter !== '全部年段') {
        const entryBand = mapChapterGradeToGradeBand(entry.grade);
        if (entryBand !== gradeFilter) return false;
      }

      if (q) {
        const hay = [
          entry.order || '',
          entry.category || '',
          entry.grade || '',
          mapChapterGradeToGradeBand(entry.grade),
          entry.title,
          entry.designer || '',
          entry.resourceKind || '',
          entry.pageNote || '',
          entry.bookPageNote || '',
        ]
          .join(' ')
          .toLowerCase();
        if (!hay.includes(q)) return false;
      }

      return true;
    });
  }, [constructedResponseBook, gradeFilter, searchQuery]);

  const groupedChapterCatalog = useMemo(() => {
    const order = [
      '探究教學篇（擴展式）',
      '探究教學篇（題組式）',
      '形成性評量篇',
      '導覽與前言',
      '書末版權與附錄',
    ];
    const map = new Map<string, EbookTocEntry[]>();
    for (const entry of filteredChapterCatalog) {
      const cat = entry.category || '其他';
      const arr = map.get(cat);
      if (arr) arr.push(entry);
      else map.set(cat, [entry]);
    }
    return Array.from(map.entries())
      .sort(([a], [b]) => {
        const ia = order.indexOf(a);
        const ib = order.indexOf(b);
        return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
      })
      .map(([category, entries]) => ({
        category,
        pedagogicalGroup: getPedagogicalTypeGroup(category),
        description: CONSTRUCTED_RESPONSE_BOOK_META.categoryDescriptions?.[category],
        entries,
      }));
  }, [filteredChapterCatalog]);

  if (!isOpen) return null;

  const openEbookAtPage = (res: TeachingResource, startPage?: number) => {
    setViewingEbookInitialPage(startPage && startPage > 1 ? startPage : null);
    setViewingEbook(res);
  };

  const hubShareUrl =
    typeof window !== 'undefined'
      ? `${window.location.origin}${window.location.pathname}${
          spreadsheetId
            ? `?sheet=${encodeURIComponent(spreadsheetId)}&tab=resources`
            : '?tab=resources'
        }`
      : '';

  const hasActiveFilters =
    gradeFilter !== '全部年段' ||
    typeFilter !== '全部類型' ||
    searchQuery.trim() !== '';

  const stageSelectedFileIntoDraft = (file: File) => {
    const maxBytes = 50 * 1024 * 1024;
    if (file.size > maxBytes) {
      setFormError('檔案超過 50MB 上限，請壓縮後再上傳或改用 Google Drive 分享連結。');
      return false;
    }
    const lower = file.name.toLowerCase();
    const cleanNameWithoutExt = file.name.replace(/\.[^.]+$/, '');
    const sizeMb = (file.size / (1024 * 1024)).toFixed(1);
    const inferredType: ResourceType = lower.endsWith('.epub')
      ? '電子書'
      : lower.endsWith('.html') || lower.endsWith('.htm')
        ? '數位互動工具'
        : lower.endsWith('.md') || lower.endsWith('.markdown')
          ? '研習心得筆記'
          : '自製教案 / 學習單';

    setFormError(null);
    setStagedFile(file);
    setUploadNotice(
      `已選取「${file.name}」（${sizeMb} MB）— 選好分類與年段後按「一鍵上傳並發布」即可完成！`,
    );
    setEditorState((prev) => ({
      ...prev,
      draft: {
        ...prev.draft,
        title: prev.draft.title.trim() ? prev.draft.title : cleanNameWithoutExt,
        resourceType: prev.isNew ? inferredType : prev.draft.resourceType,
      },
    }));
    return true;
  };

  const handleOpenCreateModal = (initialFile?: File) => {
    setFormError(null);
    setUploadNotice(null);
    setStagedFile(null);
    setShowAdvancedFields(false);
    const baseDraft = createEmptyResourceForm(
      defaultAuthorName || '黃佩詩 老師',
    );
    if (initialFile) {
      const maxBytes = 50 * 1024 * 1024;
      if (initialFile.size > maxBytes) {
        setFormError(
          '檔案超過 50MB 上限，請壓縮後再上傳或改用 Google Drive 分享連結。',
        );
      } else {
        const lower = initialFile.name.toLowerCase();
        const cleanNameWithoutExt = initialFile.name.replace(/\.[^.]+$/, '');
        const sizeMb = (initialFile.size / (1024 * 1024)).toFixed(1);
        baseDraft.title = cleanNameWithoutExt;
        baseDraft.resourceType = lower.endsWith('.epub')
          ? '電子書'
          : lower.endsWith('.html') || lower.endsWith('.htm')
            ? '數位互動工具'
            : lower.endsWith('.md') || lower.endsWith('.markdown')
              ? '研習心得筆記'
              : '自製教案 / 學習單';
        setStagedFile(initialFile);
        setUploadNotice(
          `已選取「${initialFile.name}」（${sizeMb} MB）— 請點選下方分類與年段，再按「一鍵上傳並發布」。`,
        );
      }
    }
    setEditorState({
      isOpen: true,
      isNew: true,
      draft: baseDraft,
    });
  };

  const handleOpenEditModal = (res: TeachingResource) => {
    setFormError(null);
    setUploadNotice(null);
    setStagedFile(null);
    setShowAdvancedFields(
      Boolean(res.content?.trim() || res.topicTags?.trim()),
    );
    setEditorState({
      isOpen: true,
      isNew: false,
      draft: {...res},
    });
  };

  const handleQuickDropFileChange = (
    e: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    handleOpenCreateModal(file);
  };

  const handleResourceFileChange = (
    e: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    stageSelectedFileIntoDraft(file);
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
    if (!cleanTitle) {
      setFormError('請填寫資源標題（或直接選取 PDF 檔案自動帶入檔名）。');
      return;
    }

    let cleanUrl = (editorState.draft.resourceUrl || '').trim();
    if (cleanUrl && !isSafeExternalOrLocalUrl(cleanUrl)) {
      setFormError('資源連結網址須以 https://、http:// 或站內相對路徑（./）開頭。');
      return;
    }

    setIsSavingDraft(true);
    try {
      if (stagedFile && onUploadResourceFile) {
        setIsUploadingFile(true);
        try {
          const folderLabel = editorState.draft.gradeBand || '教學資源';
          const uploaded = await onUploadResourceFile(stagedFile, folderLabel);
          cleanUrl = uploaded.webViewLink;
        } finally {
          setIsUploadingFile(false);
        }
      }

      const fallbackSummary = `${editorState.draft.gradeBand}｜${editorState.draft.resourceType}：${cleanTitle}`;
      const cleanSummary =
        editorState.draft.summary.trim() || fallbackSummary;

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

      await onSaveResource(payload, editorState.isNew);
      setStagedFile(null);
      setUploadNotice(null);
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

  const renderDirectoryRow = (entry: UnifiedResourceEntry) => {
    if (entry.kind === 'resource') {
      const res = entry.resource;
      const hasValidUrl = isSafeExternalOrLocalUrl(res.resourceUrl);
      const isInteractive = isInternalInteractiveHtmlUrl(res.resourceUrl);
      const isEbook = res.resourceType === '電子書';
      const isPdfFile = isPdfOrDriveFileUrl(res.resourceUrl);
      const isReaderDocument = isEmbeddedReaderDocumentUrl(res.resourceUrl);
      const openInEbookReader =
        (isEbook && (hasValidUrl || Boolean(res.content))) ||
        (hasValidUrl && isReaderDocument);
      const resolvedShareUrl =
        hasValidUrl && !isInteractive && typeof window !== 'undefined'
          ? new URL(res.resourceUrl!, window.location.href).toString()
          : hubShareUrl;
      const formatTag = isPdfFile
        ? 'PDF'
        : isEbook
          ? '電子書'
          : isInteractive
            ? '互動'
            : res.resourceType === '公開好站精選'
              ? '網站'
              : res.resourceType === '研習心得筆記'
                ? '筆記'
                : '教案';

      const handlePrimaryTitleClick = () => {
        if (openInEbookReader) {
          setViewingEbook(res);
        } else if (isInteractive && hasValidUrl) {
          onOpenEmbedStage(res.resourceUrl!, res.title);
        } else if (res.content) {
          setReadingResource(res);
        } else if (hasValidUrl && typeof window !== 'undefined') {
          window.open(res.resourceUrl, '_blank', 'noopener,noreferrer');
        }
      };

      return (
        <div
          key={entry.key}
          className="px-4 py-3.5 hover:bg-[#FBF9F5] transition-colors flex flex-col sm:flex-row sm:items-center justify-between gap-3"
        >
          <div className="min-w-0 flex-1 space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <span
                className={`px-2 py-0.5 text-[11px] font-bold rounded border shrink-0 ${
                  isPdfFile || isEbook
                    ? 'bg-[#1E3A8A]/8 text-[#1E3A8A] border-[#1E3A8A]/25'
                    : isInteractive
                      ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                      : 'bg-stone-100 text-stone-700 border-stone-200'
                }`}
              >
                {formatTag}
              </span>
              <span className="text-xs font-semibold text-stone-700 shrink-0">
                {getShortGradeLabel(res.gradeBand)}
              </span>
              {res.isPinned && (
                <span className="text-xs font-semibold text-[#9A3412] inline-flex items-center gap-0.5 shrink-0">
                  <Sparkles className="w-3 h-3" />
                  精選
                </span>
              )}
              {!res.isPublic && (
                <span className="text-xs font-semibold text-amber-800 shrink-0">
                  草稿
                </span>
              )}
              <button
                type="button"
                onClick={handlePrimaryTitleClick}
                className="text-left font-editorial text-base sm:text-[17px] font-bold text-stone-950 hover:text-[#1E3A8A] transition-colors leading-snug"
              >
                {res.title}
              </button>
            </div>

            <div className="flex flex-wrap items-center gap-x-2.5 gap-y-0.5 text-xs text-stone-500">
              <span className="line-clamp-1 text-stone-600">{res.summary}</span>
              <span className="hidden md:inline text-stone-300">|</span>
              <span className="hidden md:inline shrink-0">{res.author}</span>
              <span className="hidden md:inline font-mono-tabular shrink-0">
                {res.publishedAt}
              </span>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-1.5 shrink-0">
            {openInEbookReader ? (
              <button
                type="button"
                onClick={() => setViewingEbook(res)}
                className="min-h-[36px] px-3 py-1.5 text-xs font-semibold text-white bg-[#1E3A8A] rounded-lg hover:bg-[#172554] inline-flex items-center gap-1.5 transition-colors whitespace-nowrap"
              >
                <BookOpen className="w-3.5 h-3.5 shrink-0" />
                <span>
                  {isEbook
                    ? '閱讀電子書'
                    : isPdfFile
                      ? '站內閱讀 PDF'
                      : '開啟文件'}
                </span>
              </button>
            ) : (
              hasValidUrl &&
              (isInteractive ? (
                <button
                  type="button"
                  onClick={() =>
                    onOpenEmbedStage(res.resourceUrl!, res.title)
                  }
                  className="min-h-[36px] px-3 py-1.5 text-xs font-semibold text-white bg-[#1E3A8A] rounded-lg hover:bg-[#172554] inline-flex items-center gap-1.5 transition-colors whitespace-nowrap"
                >
                  <MonitorPlay className="w-3.5 h-3.5 shrink-0" />
                  <span>進入互動工具</span>
                </button>
              ) : (
                <a
                  href={res.resourceUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="min-h-[36px] px-3 py-1.5 text-xs font-semibold text-white bg-[#1E3A8A] rounded-lg hover:bg-[#172554] inline-flex items-center gap-1.5 transition-colors whitespace-nowrap"
                >
                  <ExternalLink className="w-3.5 h-3.5 shrink-0" />
                  <span>開啟連結</span>
                </a>
              ))
            )}

            {res.content && (
              <button
                type="button"
                onClick={() => setReadingResource(res)}
                className="min-h-[36px] px-2.5 py-1.5 text-xs font-semibold text-stone-800 bg-[#F7F4EE] border border-stone-200 rounded-lg hover:bg-stone-200/70 inline-flex items-center gap-1 transition-colors whitespace-nowrap"
              >
                <FileText className="w-3.5 h-3.5 shrink-0" />
                <span>說明</span>
              </button>
            )}

            <button
              type="button"
              onClick={() => onOpenShareQr(resolvedShareUrl, res.title)}
              className="min-h-[36px] min-w-[36px] p-1.5 text-stone-600 bg-white border border-stone-200 rounded-lg hover:text-[#1E3A8A] hover:border-[#1E3A8A]/40 inline-flex items-center justify-center transition-colors"
              title="分享此資源 QR Code"
              aria-label={`分享 ${res.title} QR Code`}
            >
              <QrCode className="w-3.5 h-3.5" />
            </button>

            {isTeacherAdmin && (
              <>
                <button
                  type="button"
                  onClick={() => handleOpenEditModal(res)}
                  className="min-h-[36px] min-w-[36px] p-1.5 text-stone-700 bg-white border border-stone-200 rounded-lg hover:bg-stone-50 inline-flex items-center justify-center transition-colors"
                  title="編輯此資源"
                  aria-label={`編輯 ${res.title}`}
                >
                  <Edit3 className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => onDeleteResource(res)}
                  className="min-h-[36px] min-w-[36px] p-1.5 text-red-700 bg-white border border-red-200 rounded-lg hover:bg-red-50 inline-flex items-center justify-center transition-colors"
                  title="刪除此資源"
                  aria-label={`刪除 ${res.title}`}
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </>
            )}
          </div>
        </div>
      );
    }

    const post = entry.post;
    const locked = checkPostLocked(post);
    const hasEmbed = isSafeExternalOrLocalUrl(post.embedUrl);
    const isInteractivePost = isInternalInteractiveHtmlUrl(post.embedUrl);

    return (
      <div
        key={entry.key}
        className="px-4 py-3.5 hover:bg-[#FBF9F5] transition-colors flex flex-col sm:flex-row sm:items-center justify-between gap-3"
      >
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="px-2 py-0.5 text-[11px] font-bold rounded border bg-[#14532D]/8 text-[#14532D] border-[#14532D]/25 shrink-0">
              領域社群
            </span>
            <span className="text-xs font-semibold text-stone-700 shrink-0">
              {post.academicYear}
            </span>
            {post.isFeatured && (
              <span className="text-xs font-semibold text-[#9A3412] shrink-0">
                精選
              </span>
            )}
            {locked && (
              <span className="text-xs font-semibold text-amber-800 inline-flex items-center gap-1 shrink-0">
                <Lock className="w-3 h-3" />
                校內限定
              </span>
            )}
            <button
              type="button"
              onClick={() => onOpenPost(post)}
              className="text-left font-editorial text-base sm:text-[17px] font-bold text-stone-950 hover:text-[#1E3A8A] transition-colors leading-snug"
            >
              {post.title}
            </button>
          </div>
          <div className="flex flex-wrap items-center gap-x-2.5 gap-y-0.5 text-xs text-stone-500">
            <span className="line-clamp-1 text-stone-600">
              {locked
                ? '登入校內帳號後即可檢視完整內容。'
                : post.summary}
            </span>
            <span className="hidden md:inline text-stone-300">|</span>
            <span className="hidden md:inline shrink-0">{post.author}</span>
            <span className="hidden md:inline font-mono-tabular shrink-0">
              {post.publishedAt}
            </span>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-1.5 shrink-0">
          <button
            type="button"
            onClick={() => onOpenPost(post)}
            className="min-h-[36px] px-3 py-1.5 text-xs font-semibold text-white bg-[#1E3A8A] rounded-lg hover:bg-[#172554] inline-flex items-center gap-1.5 transition-colors whitespace-nowrap"
          >
            <BookOpen className="w-3.5 h-3.5 shrink-0" />
            <span>閱讀全文</span>
          </button>

          {!locked &&
            hasEmbed &&
            (isInteractivePost ? (
              <button
                type="button"
                onClick={() => onOpenEmbedStage(post.embedUrl!, post.title)}
                className="min-h-[36px] px-2.5 py-1.5 text-xs font-semibold text-stone-800 bg-[#F7F4EE] border border-stone-200 rounded-lg hover:bg-stone-200/70 inline-flex items-center gap-1 transition-colors whitespace-nowrap"
              >
                <MonitorPlay className="w-3.5 h-3.5 shrink-0" />
                <span>互動舞台</span>
              </button>
            ) : isEmbeddedReaderDocumentUrl(post.embedUrl) ? (
              <button
                type="button"
                onClick={() =>
                  setViewingEbook({
                    id: post.slug,
                    title: post.title,
                    gradeBand: '跨年級通用',
                    resourceType: '自製教案 / 學習單',
                    sourceOrigin: '原創自製',
                    topicTags: post.category,
                    summary: post.summary,
                    content: post.content || '',
                    resourceUrl: post.embedUrl || '',
                    author: post.author,
                    publishedAt: post.publishedAt,
                    isPinned: Boolean(post.isFeatured),
                    isPublic: post.status === 'Published',
                  })
                }
                className="min-h-[36px] px-2.5 py-1.5 text-xs font-semibold text-stone-800 bg-[#F7F4EE] border border-stone-200 rounded-lg hover:bg-stone-200/70 inline-flex items-center gap-1 transition-colors whitespace-nowrap"
              >
                <FileText className="w-3.5 h-3.5 shrink-0" />
                <span>
                  {isPdfOrDriveFileUrl(post.embedUrl)
                    ? '閱讀 PDF'
                    : '閱讀附件'}
                </span>
              </button>
            ) : (
              <a
                href={post.embedUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="min-h-[36px] px-2.5 py-1.5 text-xs font-semibold text-stone-800 bg-[#F7F4EE] border border-stone-200 rounded-lg hover:bg-stone-200/70 inline-flex items-center gap-1 transition-colors whitespace-nowrap"
              >
                <ExternalLink className="w-3.5 h-3.5 shrink-0" />
                <span>附件</span>
              </a>
            ))}
        </div>
      </div>
    );
  };

  return (
    <div
      className="fixed inset-0 z-[45] bg-[#FBF9F5] flex flex-col overflow-hidden"
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
                公開免登入瀏覽 · 整合自製教案、數位互動工具、研習心得筆記與領域社群教學資源
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <button
              type="button"
              onClick={() =>
                onOpenShareQr(hubShareUrl, '國小數學教學資源平台')
              }
              className="min-h-[38px] px-2.5 py-1.5 text-xs font-medium text-stone-700 bg-white border border-stone-300 rounded-lg hover:border-[#1E3A8A]/50 hover:text-[#1E3A8A] inline-flex items-center gap-1.5 transition-colors whitespace-nowrap"
              title="產生本平台專屬 QR Code 供老師掃碼使用"
            >
              <QrCode className="w-4 h-4 shrink-0" />
              <span className="hidden md:inline">平台 QR</span>
            </button>

            <button
              type="button"
              onClick={onRefreshSync}
              disabled={isSyncing}
              className="min-h-[38px] px-2.5 py-1.5 text-xs font-medium text-stone-700 bg-white border border-stone-300 rounded-lg hover:bg-stone-50 inline-flex items-center gap-1.5 transition-colors whitespace-nowrap disabled:opacity-50"
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
                  className="min-h-[38px] px-2.5 py-1.5 text-xs font-medium text-stone-700 bg-white border border-stone-300 rounded-lg hover:bg-stone-50 inline-flex items-center gap-1.5 transition-colors whitespace-nowrap"
                  title="下載目前公開教學資源清單 CSV"
                >
                  <Download className="w-3.5 h-3.5 shrink-0" />
                  <span className="hidden sm:inline">匯出清冊</span>
                </button>

                <button
                  type="button"
                  onClick={() => handleOpenCreateModal()}
                  className="min-h-[38px] px-3.5 py-1.5 text-xs sm:text-sm font-semibold text-white bg-[#1E3A8A] rounded-lg hover:bg-[#172554] inline-flex items-center gap-1.5 transition-colors shadow-2xs whitespace-nowrap"
                >
                  <Plus className="w-4 h-4 shrink-0" />
                  <span>新增 / 傳 PDF</span>
                </button>
              </>
            )}

            <button
              type="button"
              onClick={onClose}
              className="min-h-[38px] min-w-[38px] p-1.5 text-stone-500 hover:text-stone-900 hover:bg-stone-100 rounded-lg inline-flex items-center justify-center transition-colors"
              aria-label="關閉教學資源平台"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>
      </header>

      {/* Main Scrollable Area */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-4 sm:py-5 space-y-4">
          {/* Compact Admin Notices & Errors */}
          {syncError && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-xs text-red-900">
              {syncError}
            </div>
          )}

          {isTeacherAdmin && !hasRemoteResourcesTab && (
            <div className="px-4 py-2.5 bg-[#F7F4EE] border border-stone-200 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 text-xs text-stone-700">
              <span>
                尚未建立試算表 <code className="font-mono-tabular bg-white px-1 py-0.5 rounded border border-stone-200">Resources</code> 分頁，目前使用精選與本機資料。
              </span>
              {hasAccessToken && spreadsheetId ? (
                <button
                  type="button"
                  onClick={handleTriggerSeedSync}
                  disabled={isSyncingSeedBatch || isSyncing}
                  className="min-h-[34px] px-3 py-1.5 text-xs font-semibold text-white bg-[#1E3A8A] rounded-lg hover:bg-[#172554] disabled:bg-stone-400 inline-flex items-center justify-center gap-1.5 whitespace-nowrap shrink-0"
                >
                  <CloudUpload className="w-3.5 h-3.5 shrink-0" />
                  <span>
                    {isSyncingSeedBatch ? '建立同步中...' : '一鍵建立並同步'}
                  </span>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={onRequestSheetsAuth}
                  className="min-h-[34px] px-3 py-1.5 text-xs font-semibold text-[#1E3A8A] bg-white border border-[#1E3A8A]/30 rounded-lg hover:bg-[#1E3A8A]/5 inline-flex items-center justify-center gap-1.5 whitespace-nowrap shrink-0"
                >
                  <Layers className="w-3.5 h-3.5 shrink-0" />
                  <span>授權 Google 試算表</span>
                </button>
              )}
            </div>
          )}

          {isTeacherAdmin &&
            hasRemoteResourcesTab &&
            !hasAccessToken &&
            Boolean(spreadsheetId) && (
              <div className="px-4 py-2.5 bg-amber-50/90 border border-amber-200 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 text-xs text-amber-950">
                <span>
                  重新整理後需重新授權 Google 寫入權限，才可上傳或發布新資源。
                </span>
                <button
                  type="button"
                  onClick={onRequestSheetsAuth}
                  className="min-h-[34px] px-3 py-1.5 text-xs font-semibold text-[#1E3A8A] bg-white border border-[#1E3A8A]/30 rounded-lg hover:bg-[#1E3A8A]/5 inline-flex items-center justify-center gap-1.5 whitespace-nowrap shrink-0"
                >
                  <Layers className="w-3.5 h-3.5 shrink-0" />
                  <span>立即授權寫入</span>
                </button>
              </div>
            )}

          {/* Admin 1-Step Quick PDF Drop & Categorize Strip */}
          {isTeacherAdmin && onUploadResourceFile && (
            <div
              onDragOver={(e) => {
                e.preventDefault();
                setIsDraggingQuickDrop(true);
              }}
              onDragLeave={() => setIsDraggingQuickDrop(false)}
              onDrop={(e) => {
                e.preventDefault();
                setIsDraggingQuickDrop(false);
                const droppedFile = e.dataTransfer.files?.[0];
                if (droppedFile) {
                  handleOpenCreateModal(droppedFile);
                }
              }}
              className={`rounded-xl border border-dashed px-4 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3 transition-colors ${
                isDraggingQuickDrop
                  ? 'bg-[#1E3A8A]/8 border-[#1E3A8A]'
                  : 'bg-white border-stone-300 hover:border-[#1E3A8A]/50'
              }`}
            >
              <input
                ref={quickDropFileInputRef}
                type="file"
                accept=".pdf,.epub,.md,.markdown,.html,.htm"
                onChange={handleQuickDropFileChange}
                className="hidden"
              />
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-9 h-9 rounded-lg bg-[#1E3A8A]/10 text-[#1E3A8A] flex items-center justify-center shrink-0">
                  <FileUp className="w-4 h-4" />
                </div>
                <div className="min-w-0">
                  <div className="text-xs sm:text-sm font-bold text-stone-900">
                    快速放入 PDF／電子書檔案並分類（支援 10MB+ 大檔）
                  </div>
                  <div className="text-xs text-stone-500 truncate">
                    拖曳檔案到這裡，或點右側按鈕選取檔案 → 自動帶入標題 → 點選分類與年段即可發布
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => quickDropFileInputRef.current?.click()}
                className="min-h-[36px] px-3.5 py-1.5 text-xs font-semibold text-[#1E3A8A] bg-[#F7F4EE] border border-[#1E3A8A]/30 rounded-lg hover:bg-[#1E3A8A] hover:text-white inline-flex items-center justify-center gap-1.5 whitespace-nowrap shrink-0 transition-colors"
              >
                <Upload className="w-3.5 h-3.5 shrink-0" />
                <span>選取檔案快速上架</span>
              </button>
            </div>
          )}

          {/* Compact Search, Filter & View-Mode Bar */}
          <section className="bg-white border border-stone-200 rounded-2xl p-3.5 sm:p-4 space-y-3">
            {/* Top Row: Search + View Mode Switcher */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
              <div className="relative flex-1">
                <Search className="w-4 h-4 text-stone-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="搜尋資源標題、單元關鍵字或作者..."
                  aria-label="搜尋教學資源"
                  className="w-full min-h-[38px] pl-10 pr-9 py-1.5 text-sm bg-[#FBF9F5] border border-stone-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1E3A8A]"
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

              <div className="flex items-center justify-between sm:justify-end gap-2 shrink-0">
                <span className="text-xs font-mono-tabular text-stone-500 px-1">
                  共 {filteredEntries.length} 筆
                </span>

                <div
                  className="inline-flex bg-[#F7F4EE] border border-stone-200 rounded-lg p-0.5"
                  role="group"
                  aria-label="切換瀏覽檢視模式"
                >
                  <button
                    type="button"
                    onClick={() => setViewMode('directory')}
                    className={`min-h-[32px] px-2.5 py-1 text-xs font-semibold rounded-md inline-flex items-center gap-1 transition-colors ${
                      viewMode === 'directory'
                        ? 'bg-white text-[#1E3A8A] shadow-2xs'
                        : 'text-stone-600 hover:text-stone-950'
                    }`}
                  >
                    <List className="w-3.5 h-3.5" />
                    <span>一目了然目錄</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setViewMode('cards')}
                    className={`min-h-[32px] px-2.5 py-1 text-xs font-semibold rounded-md inline-flex items-center gap-1 transition-colors ${
                      viewMode === 'cards'
                        ? 'bg-white text-[#1E3A8A] shadow-2xs'
                        : 'text-stone-600 hover:text-stone-950'
                    }`}
                  >
                    <LayoutGrid className="w-3.5 h-3.5" />
                    <span>圖文卡片</span>
                  </button>
                </div>
              </div>
            </div>

            {/* Second Row: Non-empty Category Chips + Compact Grade Filter */}
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-2.5 pt-2.5 border-t border-stone-100">
              <div
                className="flex flex-wrap items-center gap-1.5"
                role="tablist"
                aria-label="資源分類篩選"
              >
                <button
                  type="button"
                  role="tab"
                  aria-selected={typeFilter === '全部類型'}
                  onClick={() => setTypeFilter('全部類型')}
                  className={`min-h-[34px] px-3 py-1 text-xs font-semibold rounded-lg border inline-flex items-center gap-1 transition-colors whitespace-nowrap ${
                    typeFilter === '全部類型'
                      ? 'bg-[#1E3A8A] text-white border-[#1E3A8A]'
                      : 'bg-[#F7F4EE] text-stone-700 border-stone-200 hover:text-stone-950'
                  }`}
                >
                  <span>全部分類</span>
                  <span
                    className={`font-mono-tabular text-[11px] ${
                      typeFilter === '全部類型'
                        ? 'text-blue-100'
                        : 'text-stone-500'
                    }`}
                  >
                    ({typeCounts['全部類型']})
                  </span>
                </button>

                {CATEGORY_META.filter(
                  (meta) => (typeCounts[meta.id] ?? 0) > 0 || typeFilter === meta.id,
                ).map((meta) => {
                  const count = typeCounts[meta.id] ?? 0;
                  const isActive = typeFilter === meta.id;
                  return (
                    <button
                      key={meta.id}
                      type="button"
                      role="tab"
                      aria-selected={isActive}
                      onClick={() => setTypeFilter(meta.id)}
                      className={`min-h-[34px] px-3 py-1 text-xs font-medium rounded-lg border inline-flex items-center gap-1 transition-colors whitespace-nowrap ${
                        isActive
                          ? 'bg-[#1E3A8A] text-white border-[#1E3A8A]'
                          : 'bg-white text-stone-700 border-stone-200 hover:border-stone-400'
                      }`}
                    >
                      <span>{meta.shortLabel}</span>
                      <span
                        className={`font-mono-tabular text-[11px] ${
                          isActive ? 'text-blue-100' : 'text-stone-500'
                        }`}
                      >
                        ({count})
                      </span>
                    </button>
                  );
                })}
              </div>

              <div className="flex flex-wrap items-center gap-1.5 shrink-0">
                <span className="text-xs text-stone-500">年段：</span>
                {(['全部年段', ...RESOURCE_GRADE_BANDS] as GradeFilter[]).map(
                  (grade) => (
                    <button
                      key={grade}
                      type="button"
                      onClick={() => setGradeFilter(grade)}
                      className={`min-h-[32px] px-2.5 py-1 text-xs font-medium rounded-lg border transition-colors whitespace-nowrap ${
                        gradeFilter === grade
                          ? 'bg-stone-900 text-white border-stone-900'
                          : 'bg-white text-stone-700 border-stone-200 hover:border-stone-400'
                      }`}
                    >
                      {grade === '全部年段' ? '全部' : getShortGradeLabel(grade)}
                    </button>
                  ),
                )}

                {hasActiveFilters && (
                  <button
                    type="button"
                    onClick={() => {
                      setGradeFilter('全部年段');
                      setTypeFilter('全部類型');
                      setSearchQuery('');
                    }}
                    className="min-h-[32px] px-2 py-1 text-xs font-medium text-[#1E3A8A] hover:underline whitespace-nowrap"
                  >
                    重設
                  </button>
                )}
              </div>
            </div>
          </section>

          {/* Resources Listing: Grouped Directory (Default) or Cards */}
          {filteredEntries.length === 0 ? (
            !(
              constructedResponseBook &&
              (typeFilter === '全部類型' ||
                typeFilter === '電子書' ||
                typeFilter === '自製教案 / 學習單') &&
              filteredChapterCatalog.length > 0
            ) && (
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
            )
          ) : viewMode === 'directory' ? (
            <div className="space-y-4">
              {groupedDirectorySections.map((section) => (
                <section
                  key={section.id}
                  className="bg-white border border-stone-200 rounded-2xl overflow-hidden"
                >
                  <div className="px-4 py-2.5 bg-[#F7F4EE] border-b border-stone-200 flex items-center justify-between gap-2">
                    <h2 className="font-editorial text-sm sm:text-base font-bold text-stone-950">
                      {section.fullLabel}
                    </h2>
                    <span className="text-xs font-mono-tabular font-semibold text-stone-600">
                      {section.entries.length} 筆
                    </span>
                  </div>
                  <div className="divide-y divide-stone-100">
                    {section.entries.map((entry) => renderDirectoryRow(entry))}
                  </div>
                </section>
              ))}
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
                  const isPdfFile = isPdfOrDriveFileUrl(res.resourceUrl);
                  const isReaderDocument = isEmbeddedReaderDocumentUrl(
                    res.resourceUrl,
                  );
                  const openInEbookReader =
                    (isEbook && (hasValidUrl || Boolean(res.content))) ||
                    (hasValidUrl && isReaderDocument);
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
                          {openInEbookReader ? (
                            <button
                              type="button"
                              onClick={() => setViewingEbook(res)}
                              className="text-left hover:text-[#1E3A8A] transition-colors"
                            >
                              {res.title}
                            </button>
                          ) : res.content ? (
                            <button
                              type="button"
                              onClick={() => setReadingResource(res)}
                              className="text-left hover:text-[#1E3A8A] transition-colors"
                            >
                              {res.title}
                            </button>
                          ) : (
                            res.title
                          )}
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
                              <span>
                                {isEbook
                                  ? '閱讀電子書'
                                  : isPdfFile
                                    ? '站內閱讀 PDF'
                                    : '站內開啟文件'}
                              </span>
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
                          領域社群教學資源文章
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
                          ) : isEmbeddedReaderDocumentUrl(post.embedUrl) ? (
                            <button
                              type="button"
                              onClick={() =>
                                setViewingEbook({
                                  id: post.slug,
                                  title: post.title,
                                  gradeBand: '跨年級通用',
                                  resourceType: '自製教案 / 學習單',
                                  sourceOrigin: '原創自製',
                                  topicTags: post.category,
                                  summary: post.summary,
                                  content: post.content || '',
                                  resourceUrl: post.embedUrl || '',
                                  author: post.author,
                                  publishedAt: post.publishedAt,
                                  isPinned: Boolean(post.isFeatured),
                                  isPublic: post.status === 'Published',
                                })
                              }
                              className="min-h-[38px] px-3 py-1.5 text-xs font-semibold text-stone-800 bg-[#F7F4EE] border border-stone-200 rounded-lg hover:bg-stone-200/70 inline-flex items-center gap-1.5 transition-colors"
                            >
                              <FileText className="w-3.5 h-3.5 shrink-0" />
                              <span>
                                {isPdfOrDriveFileUrl(post.embedUrl)
                                  ? '站內閱讀 PDF'
                                  : '站內閱讀附件'}
                              </span>
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

          {/* Structured Chapter Classification Architecture for Constructed Response Math Ebook */}
          {constructedResponseBook &&
            (typeFilter === '全部類型' ||
              typeFilter === '電子書' ||
              typeFilter === '自製教案 / 學習單') &&
            groupedChapterCatalog.length > 0 && (
              <section className="bg-white border border-stone-200 rounded-2xl overflow-hidden">
                <div className="divide-y divide-stone-200">
                  {groupedChapterCatalog.map((group) => (
                    <div key={group.category}>
                        <div className="px-4 sm:px-5 py-2 bg-[#F7F4EE]/60 border-b border-stone-100 flex flex-col sm:flex-row sm:items-center justify-between gap-1">
                          <div className="min-w-0">
                            <span className="text-xs font-bold text-stone-900">
                              {group.category}
                            </span>
                            {group.description && (
                              <span className="text-xs text-stone-500 ml-2 hidden md:inline">
                                — {group.description}
                              </span>
                            )}
                          </div>
                          <span className="text-[11px] font-mono-tabular font-semibold text-stone-500 shrink-0">
                            {group.entries.length} 篇
                          </span>
                        </div>
                        <div className="divide-y divide-stone-100">
                          {group.entries.map((entry) => {
                            const mappedBand = mapChapterGradeToGradeBand(
                              entry.grade,
                            );
                            const pedagogicalGroup = getPedagogicalTypeGroup(
                              entry.category,
                            );
                            return (
                              <div
                                key={entry.id}
                                className="px-4 sm:px-5 py-2.5 hover:bg-[#FBF9F5] transition-colors flex flex-col sm:flex-row sm:items-center justify-between gap-2.5"
                              >
                                <div className="min-w-0 flex-1 space-y-0.5">
                                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                                    <span className="font-mono-tabular text-xs font-bold text-stone-400 shrink-0">
                                      {entry.order}
                                    </span>
                                    <span
                                      className={`px-1.5 py-0.5 text-[11px] font-semibold rounded border shrink-0 ${
                                        pedagogicalGroup === '探究教學篇'
                                          ? 'bg-[#1E3A8A]/8 text-[#1E3A8A] border-[#1E3A8A]/20'
                                          : pedagogicalGroup === '形成性評量篇'
                                            ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                                            : 'bg-stone-100 text-stone-700 border-stone-200'
                                      }`}
                                    >
                                      {entry.category}
                                    </span>
                                    <span className="text-xs font-semibold text-stone-800 shrink-0">
                                      {entry.grade === '通用'
                                        ? '跨年級通用'
                                        : `${entry.grade} · ${getShortGradeLabel(mappedBand)}`}
                                    </span>
                                    <button
                                      type="button"
                                      onClick={() =>
                                        openEbookAtPage(
                                          constructedResponseBook,
                                          entry.startPage,
                                        )
                                      }
                                      className="text-left font-editorial text-sm sm:text-[15px] font-bold text-stone-950 hover:text-[#1E3A8A] transition-colors"
                                    >
                                      {entry.title}
                                    </button>
                                  </div>
                                  <div className="flex flex-wrap items-center gap-x-2.5 gap-y-0.5 text-xs text-stone-500">
                                    {entry.designer && entry.designer !== '—' && (
                                      <span>設計者：{entry.designer}</span>
                                    )}
                                    {entry.resourceKind && (
                                      <span>{entry.resourceKind}</span>
                                    )}
                                    <span className="font-mono-tabular text-stone-600">
                                      PDF P.{entry.pageNote || entry.startPage}
                                      {entry.bookPageNote
                                        ? `（${entry.bookPageNote}）`
                                        : ''}
                                    </span>
                                  </div>
                                </div>

                                <button
                                  type="button"
                                  onClick={() =>
                                    openEbookAtPage(
                                      constructedResponseBook,
                                      entry.startPage,
                                    )
                                  }
                                  className="min-h-[34px] px-3 py-1 text-xs font-semibold text-[#1E3A8A] bg-[#F7F4EE] border border-[#1E3A8A]/25 rounded-lg hover:bg-[#1E3A8A] hover:text-white inline-flex items-center justify-center gap-1.5 transition-colors whitespace-nowrap shrink-0"
                                >
                                  <BookOpen className="w-3.5 h-3.5 shrink-0" />
                                  <span className="font-mono-tabular">
                                    直達 P.{entry.startPage}
                                  </span>
                                </button>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                </div>
              </section>
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
                        : isPdfOrDriveFileUrl(readingResource.resourceUrl)
                          ? '站內閱讀 PDF'
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

      {/* Sub-Modal: Streamlined Admin Add / Edit Resource & Quick PDF Upload */}
      {editorState.isOpen && isTeacherAdmin && (
        <div
          className="fixed inset-0 z-50 bg-stone-950/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-6"
          role="dialog"
          aria-modal="true"
          aria-labelledby="resource-editor-title"
          onClick={() => setEditorState((prev) => ({...prev, isOpen: false}))}
        >
          <div
            className="bg-white border border-stone-200 rounded-2xl shadow-2xl max-w-xl w-full max-h-[90vh] flex flex-col overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-5 py-4 border-b border-stone-200 flex items-center justify-between gap-3 shrink-0">
              <div>
                <h2
                  id="resource-editor-title"
                  className="font-editorial text-lg font-bold text-stone-950"
                >
                  {editorState.isNew
                    ? '快速上架教學資源 / PDF'
                    : '編輯教學資源內容'}
                </h2>
                <p className="text-xs text-stone-500 mt-0.5">
                  {!spreadsheetId
                    ? '尚未連結試算表，將儲存於本機瀏覽器'
                    : hasAccessToken
                      ? '發布後將自動上傳檔案（若有）並寫入雲端「Resources」分頁'
                      : '按下「發布」時將先引導您授權 Google 帳號，一次完成上傳與寫入'}
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

              {/* Step 1: Drop / Select File or Paste URL */}
              {onUploadResourceFile && (
                <div
                  onDragOver={(e) => {
                    e.preventDefault();
                    setIsDraggingModalDrop(true);
                  }}
                  onDragLeave={() => setIsDraggingModalDrop(false)}
                  onDrop={(e) => {
                    e.preventDefault();
                    setIsDraggingModalDrop(false);
                    const f = e.dataTransfer.files?.[0];
                    if (f) stageSelectedFileIntoDraft(f);
                  }}
                  className={`p-3.5 rounded-xl border-2 border-dashed transition-colors space-y-2 ${
                    isDraggingModalDrop
                      ? 'bg-[#1E3A8A]/8 border-[#1E3A8A]'
                      : stagedFile
                        ? 'bg-emerald-50/70 border-emerald-400'
                        : 'bg-[#F7F4EE] border-stone-300'
                  }`}
                >
                  <input
                    ref={resourceFileInputRef}
                    type="file"
                    accept=".pdf,.epub,.md,.markdown,.html,.htm"
                    onChange={handleResourceFileChange}
                    className="hidden"
                  />
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-xs font-bold text-stone-900">
                        {stagedFile
                          ? `已選檔案：${stagedFile.name}`
                          : '第 1 步：選取或拖曳 PDF / EPUB 檔案（支援 10MB+）'}
                      </div>
                      <div className="text-[11px] text-stone-600 mt-0.5">
                        {stagedFile
                          ? `${(stagedFile.size / (1024 * 1024)).toFixed(1)} MB · 發布時自動依「適用年段」歸檔至 Google 雲端硬碟`
                          : '選好檔案即自動帶入標題；若要貼外部網址亦可直接在下方輸入'}
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      {stagedFile && (
                        <button
                          type="button"
                          onClick={() => {
                            setStagedFile(null);
                            setUploadNotice(null);
                          }}
                          className="min-h-[34px] px-2.5 py-1 text-xs font-medium text-stone-600 bg-white border border-stone-300 rounded-lg hover:bg-stone-50"
                        >
                          取消選檔
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => resourceFileInputRef.current?.click()}
                        disabled={isUploadingFile || isSavingDraft}
                        className="min-h-[34px] px-3 py-1.5 text-xs font-semibold text-white bg-[#1E3A8A] rounded-lg hover:bg-[#172554] disabled:opacity-50 inline-flex items-center gap-1.5 whitespace-nowrap"
                      >
                        <Upload className="w-3.5 h-3.5 shrink-0" />
                        <span>{stagedFile ? '更換檔案' : '選擇 PDF'}</span>
                      </button>
                    </div>
                  </div>
                  {uploadNotice && (
                    <div className="text-[11px] text-emerald-900 font-medium">
                      {uploadNotice}
                    </div>
                  )}
                </div>
              )}

              {/* Step 2: One-Tap Category & Grade Chips */}
              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-bold text-stone-800 mb-1.5">
                    第 2 步：選擇分類 *
                  </label>
                  <div className="flex flex-wrap gap-1.5">
                    {RESOURCE_TYPES.map((t) => {
                      const active = editorState.draft.resourceType === t;
                      return (
                        <button
                          key={t}
                          type="button"
                          onClick={() =>
                            setEditorState((prev) => ({
                              ...prev,
                              draft: {...prev.draft, resourceType: t},
                            }))
                          }
                          className={`min-h-[36px] px-3 py-1.5 text-xs font-semibold rounded-lg border transition-colors ${
                            active
                              ? 'bg-[#1E3A8A] text-white border-[#1E3A8A]'
                              : 'bg-white text-stone-700 border-stone-300 hover:border-stone-500'
                          }`}
                        >
                          {t}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-stone-800 mb-1.5">
                    適用年段 *
                  </label>
                  <div className="flex flex-wrap gap-1.5">
                    {RESOURCE_GRADE_BANDS.map((g) => {
                      const active = editorState.draft.gradeBand === g;
                      return (
                        <button
                          key={g}
                          type="button"
                          onClick={() =>
                            setEditorState((prev) => ({
                              ...prev,
                              draft: {...prev.draft, gradeBand: g},
                            }))
                          }
                          className={`min-h-[36px] px-3 py-1.5 text-xs font-semibold rounded-lg border transition-colors ${
                            active
                              ? 'bg-stone-900 text-white border-stone-900'
                              : 'bg-white text-stone-700 border-stone-300 hover:border-stone-500'
                          }`}
                        >
                          {g}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* Step 3: Title & Link */}
              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-bold text-stone-800 mb-1">
                    第 3 步：資源標題 *
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
                    placeholder="選檔後自動帶入檔名，亦可自行修改"
                    className="w-full min-h-[40px] px-3.5 py-2 text-sm border border-stone-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1E3A8A]"
                  />
                </div>

                {!stagedFile && (
                  <div>
                    <label className="block text-xs font-medium text-stone-700 mb-1">
                      外部網址或雲端連結（若未選擇上方本地檔案，可貼網址）
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
                        placeholder="https://drive.google.com/... 或 GeoGebra / .epub 連結"
                        className="w-full min-h-[38px] pl-10 pr-3.5 py-1.5 text-sm font-mono-tabular border border-stone-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1E3A8A]"
                      />
                    </div>
                  </div>
                )}

                <div>
                  <label className="block text-xs font-medium text-stone-700 mb-1">
                    一句話簡介（選填，留白將自動由分類與標題產生）
                  </label>
                  <input
                    type="text"
                    value={editorState.draft.summary}
                    onChange={(e) =>
                      setEditorState((prev) => ({
                        ...prev,
                        draft: {...prev.draft, summary: e.target.value},
                      }))
                    }
                    placeholder="例如：四年級分數大小比較課堂學習單與解答"
                    className="w-full min-h-[38px] px-3.5 py-1.5 text-sm border border-stone-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1E3A8A]"
                  />
                </div>
              </div>

              {/* Collapsible Advanced Options */}
              <div className="border-t border-stone-200 pt-3">
                <button
                  type="button"
                  onClick={() => setShowAdvancedFields((v) => !v)}
                  className="text-xs font-semibold text-stone-600 hover:text-stone-950 inline-flex items-center gap-1"
                >
                  {showAdvancedFields ? (
                    <ChevronUp className="w-4 h-4" />
                  ) : (
                    <ChevronDown className="w-4 h-4" />
                  )}
                  <span>更多進階設定（主題標籤、詳細筆記、來源、置頂）</span>
                </button>

                {showAdvancedFields && (
                  <div className="mt-3 space-y-3.5">
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
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
                                sourceOrigin: e.target
                                  .value as ResourceSourceOrigin,
                              },
                            }))
                          }
                          className="w-full min-h-[38px] px-2.5 py-1.5 text-xs border border-stone-300 rounded-lg bg-white"
                        >
                          {RESOURCE_SOURCE_ORIGINS.map((s) => (
                            <option key={s} value={s}>
                              {s}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-stone-700 mb-1">
                          作者／整理者
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
                          className="w-full min-h-[38px] px-3 py-1.5 text-xs border border-stone-300 rounded-lg"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-stone-700 mb-1">
                          發布日期
                        </label>
                        <input
                          type="date"
                          value={editorState.draft.publishedAt}
                          onChange={(e) =>
                            setEditorState((prev) => ({
                              ...prev,
                              draft: {
                                ...prev.draft,
                                publishedAt: e.target.value,
                              },
                            }))
                          }
                          className="w-full min-h-[38px] px-2.5 py-1.5 text-xs font-mono-tabular border border-stone-300 rounded-lg"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-stone-700 mb-1">
                        數學單元標籤
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
                        placeholder="逗號分隔，例如：分數與小數, 學習單"
                        className="w-full min-h-[38px] px-3 py-1.5 text-xs border border-stone-300 rounded-lg"
                      />
                      <div className="flex flex-wrap gap-1.5 mt-1.5">
                        {SUGGESTED_TOPIC_TAGS.map((tag) => {
                          const selected = parseTopicTags(
                            editorState.draft.topicTags,
                          ).includes(tag);
                          return (
                            <button
                              key={tag}
                              type="button"
                              onClick={() => handleToggleTagInDraft(tag)}
                              className={`px-2 py-1 text-[11px] rounded border transition-colors ${
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
                        詳細教學說明／筆記（支援簡易 Markdown）
                      </label>
                      <textarea
                        rows={4}
                        value={editorState.draft.content || ''}
                        onChange={(e) =>
                          setEditorState((prev) => ({
                            ...prev,
                            draft: {...prev.draft, content: e.target.value},
                          }))
                        }
                        placeholder="## 課堂應用建議..."
                        className="w-full px-3 py-2 text-xs border border-stone-300 rounded-lg leading-relaxed"
                      />
                    </div>

                    <div className="flex flex-wrap items-center gap-5 text-xs text-stone-700">
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
                        <span>公開免登入瀏覽</span>
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
                        <span>置頂精選</span>
                      </label>
                    </div>
                  </div>
                )}
              </div>

              <div className="pt-3 border-t border-stone-200 flex items-center justify-end gap-2">
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
                  {isUploadingFile ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>檔案上傳雲端中...</span>
                    </>
                  ) : isSavingDraft ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>寫入目錄中...</span>
                    </>
                  ) : (
                    <>
                      <Check className="w-4 h-4" />
                      <span>
                        {stagedFile
                          ? '一鍵上傳並發布'
                          : editorState.isNew
                            ? '立即發布資源'
                            : '儲存變更'}
                      </span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      {/* Sub-Modal: Embedded Lightweight PDF / HTML5 Ebook Viewer */}
      <EbookViewerModal
        resource={viewingEbook}
        initialPage={viewingEbookInitialPage}
        onClose={() => {
          setViewingEbook(null);
          setViewingEbookInitialPage(null);
        }}
        onOpenShareQr={onOpenShareQr}
        hubShareUrl={hubShareUrl}
        renderNotes={(content) => <SafeMarkdownNotes content={content} />}
      />
    </div>
  );
};
