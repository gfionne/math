import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import HTMLFlipBook from 'react-pageflip';
import {
  BookOpen,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  ExternalLink,
  FileText,
  Maximize2,
  MonitorPlay,
  Sun,
} from 'lucide-react';
import {JournalPost} from '../types/journal';
import {
  formatCategoryDisplay,
  normalizeDriveImageUrl,
} from '../utils/postFormatting';

interface FlipBookBoundsRect {
  left: number;
  top: number;
  width: number;
  height: number;
  pageWidth: number;
}

interface FlipBookControllerInternal {
  isPointOnCorners?: (pt: {x: number; y: number}) => boolean;
  flipPrev?: (corner?: 'top' | 'bottom') => void;
  flip?: (pt: {x: number; y: number}) => void;
  __pesPatchedLeftFlip?: boolean;
}

interface FlipBookRenderInternal {
  getRect: () => FlipBookBoundsRect;
  getOrientation: () => 'portrait' | 'landscape';
  convertToBook: (pt: {x: number; y: number}) => {x: number; y: number};
}

interface FlipBookApi {
  flipNext: (corner?: 'top' | 'bottom') => void;
  flipPrev: (corner?: 'top' | 'bottom') => void;
  flip: (page: number, corner?: 'top' | 'bottom') => void;
  turnToPage: (page: number) => void;
  getPageCount: () => number;
  getCurrentPageIndex: () => number;
  getOrientation: () => 'portrait' | 'landscape';
  getFlipController?: () => FlipBookControllerInternal | undefined;
  getRender?: () => FlipBookRenderInternal | undefined;
}

interface FlipBookComponentRef {
  pageFlip: () => FlipBookApi | undefined;
}

interface ArticleFlipBookProps {
  post: JournalPost;
  sanitizedHtml: string;
  embedMeta?: {provider: string; domain?: string} | null;
  onOpenFullEmbed?: (url: string, title: string, initialTab?: 'map' | 'gallery') => void;
}

type BookPaperTheme = 'paper' | 'sepia';

interface PaginatedSection {
  html: string;
  headingTitle?: string;
}

const PAGE_WEIGHT_BUDGET = 340;

function estimateElementWeight(el: Element): number {
  const tag = el.tagName.toUpperCase();
  const text = (el.textContent || '').trim();
  const textLen = text.length;

  if (tag === 'H1') return 64;
  if (tag === 'H2') return 54;
  if (tag === 'H3' || tag === 'H4') return 42;
  if (tag === 'HR') return 22;

  if (
    tag === 'IMG' ||
    el.classList.contains('journal-embed-frame') ||
    el.querySelector('img, iframe, video')
  ) {
    return 225 + (textLen > 0 ? Math.min(80, Math.ceil(textLen / 28) * 18) : 0);
  }

  if (tag === 'TABLE' || el.classList.contains('journal-table-wrap')) {
    const rowCount = el.querySelectorAll('tr').length || 2;
    return Math.min(330, 50 + rowCount * 32);
  }

  if (tag === 'PRE') {
    const lines = Math.max(2, text.split('\n').length);
    return Math.min(320, 42 + lines * 20);
  }

  if (tag === 'BLOCKQUOTE') {
    return Math.max(56, Math.ceil(textLen / 24) * 24 + 26);
  }

  if (tag === 'UL' || tag === 'OL') {
    const items = Array.from(el.children);
    return items.reduce((sum, li) => {
      const liLen = (li.textContent || '').trim().length;
      return sum + Math.max(28, Math.ceil(liLen / 26) * 21 + 10);
    }, 18);
  }

  return Math.max(34, Math.ceil(textLen / 28) * 22 + 16);
}

function paginateHtmlIntoPages(sanitizedHtml: string): PaginatedSection[] {
  const trimmed = sanitizedHtml.trim();
  if (!trimmed) {
    return [{html: '<p>本篇內容尚無詳細內文。</p>'}];
  }

  if (typeof DOMParser === 'undefined') {
    return [{html: trimmed}];
  }

  try {
    const doc = new DOMParser().parseFromString(trimmed, 'text/html');
    const nodes = Array.from(doc.body.children);
    if (nodes.length === 0) {
      return [{html: trimmed}];
    }

    const pages: PaginatedSection[] = [];
    let currentChunks: string[] = [];
    let currentWeight = 0;
    let currentSectionHeading = '';
    let pageFirstHeading: string | undefined;

    const flushPage = () => {
      if (currentChunks.length === 0) return;
      pages.push({
        html: currentChunks.join(''),
        headingTitle: pageFirstHeading || currentSectionHeading || undefined,
      });
      currentChunks = [];
      currentWeight = 0;
      pageFirstHeading = undefined;
    };

    for (let i = 0; i < nodes.length; i++) {
      const el = nodes[i];
      const tag = el.tagName.toUpperCase();
      const isHeading = tag === 'H1' || tag === 'H2' || tag === 'H3';

      if (isHeading) {
        const headingText = (el.textContent || '').trim();
        if (headingText) {
          currentSectionHeading = headingText;
          if (!pageFirstHeading && currentChunks.length === 0) {
            pageFirstHeading = headingText;
          }
        }
      }

      if ((tag === 'UL' || tag === 'OL') && el.children.length > 1) {
        const listItems = Array.from(el.children);
        const totalListWeight = estimateElementWeight(el);

        if (currentWeight + totalListWeight > PAGE_WEIGHT_BUDGET && totalListWeight > 150) {
          const isOrdered = tag === 'OL';
          let runningStart = isOrdered
            ? parseInt(el.getAttribute('start') || '1', 10) || 1
            : 1;
          let itemSlice: Element[] = [];
          let sliceWeight = 18;

          const flushListSlice = () => {
            if (itemSlice.length === 0) return;
            const cloneList = doc.createElement(tag.toLowerCase());
            Array.from(el.attributes).forEach((attr) => {
              if (attr.name !== 'start') {
                cloneList.setAttribute(attr.name, attr.value);
              }
            });
            if (isOrdered && runningStart > 1) {
              cloneList.setAttribute('start', String(runningStart));
            }
            itemSlice.forEach((item) => cloneList.appendChild(item.cloneNode(true)));
            currentChunks.push(cloneList.outerHTML);
            currentWeight += sliceWeight;
            runningStart += itemSlice.length;
            itemSlice = [];
            sliceWeight = 18;
          };

          for (const li of listItems) {
            const liLen = (li.textContent || '').trim().length;
            const liWeight = Math.max(28, Math.ceil(liLen / 26) * 21 + 10);

            if (
              currentChunks.length > 0 &&
              currentWeight + sliceWeight + liWeight > PAGE_WEIGHT_BUDGET &&
              itemSlice.length === 0
            ) {
              flushPage();
            }

            if (
              itemSlice.length > 0 &&
              currentWeight + sliceWeight + liWeight > PAGE_WEIGHT_BUDGET
            ) {
              flushListSlice();
              flushPage();
            }

            itemSlice.push(li);
            sliceWeight += liWeight;
          }

          flushListSlice();
          continue;
        }
      }

      const blockWeight = estimateElementWeight(el);

      if (isHeading && currentChunks.length > 0 && currentWeight + blockWeight > PAGE_WEIGHT_BUDGET - 64) {
        flushPage();
        pageFirstHeading = (el.textContent || '').trim() || undefined;
      } else if (currentChunks.length > 0 && currentWeight + blockWeight > PAGE_WEIGHT_BUDGET) {
        flushPage();
      }

      if (!pageFirstHeading && currentChunks.length === 0 && currentSectionHeading) {
        pageFirstHeading = currentSectionHeading;
      }

      currentChunks.push(el.outerHTML);
      currentWeight += blockWeight;
    }

    flushPage();

    if (pages.length === 0) {
      return [{html: trimmed}];
    }

    return pages;
  } catch {
    return [{html: trimmed}];
  }
}

export const ArticleFlipBook: React.FC<ArticleFlipBookProps> = ({
  post,
  sanitizedHtml,
  embedMeta,
  onOpenFullEmbed,
}) => {
  const flipBookRef = useRef<FlipBookComponentRef | null>(null);
  const stageContainerRef = useRef<HTMLDivElement | null>(null);

  const [paperTheme, setPaperTheme] = useState<BookPaperTheme>('paper');
  const [currentPageIdx, setCurrentPageIdx] = useState(0);
  const [orientation, setOrientation] = useState<'portrait' | 'landscape'>('landscape');
  const [flipStateLabel, setFlipStateLabel] = useState<string>('read');
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);

  const contentPages = useMemo(
    () => paginateHtmlIntoPages(sanitizedHtml),
    [sanitizedHtml],
  );

  // Front cover (1) + content pages (N) + optional blank filler so back cover lands naturally + back cover (1)
  const totalBookPages = contentPages.length + 2;

  useEffect(() => {
    setCurrentPageIdx(0);
  }, [post.slug]);

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    setPrefersReducedMotion(mq.matches);
    const onChange = (e: MediaQueryListEvent) => setPrefersReducedMotion(e.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  const handleFlip = useCallback((e: {data?: number}) => {
    if (typeof e?.data === 'number') {
      setCurrentPageIdx(e.data);
    }
  }, []);

  /**
   * Upstream `page-flip` hardcodes `flipPrev()` at `{ x: 10, y }` and checks
   * `isPointOnCorners()` against `bookPt.x < threshold`. In portrait mode (where
   * `bounds.left = -pageWidth`) or vertically-fitted landscape (`bounds.left > 0`),
   * left corners map to `bookPt.x >= pageWidth`, silently breaking left-side taps,
   * swipes, and `flipPrev()`. Patch the controller once per instance.
   */
  const ensureLeftFlipPatched = useCallback(() => {
    const pf = flipBookRef.current?.pageFlip();
    const controller = pf?.getFlipController?.();
    const render = pf?.getRender?.();
    if (!controller || !render || controller.__pesPatchedLeftFlip) return;

    controller.__pesPatchedLeftFlip = true;

    controller.isPointOnCorners = (pt: {x: number; y: number}) => {
      const bounds = render.getRect();
      const pageWidth = bounds.pageWidth;
      const threshold =
        Math.sqrt(pageWidth * pageWidth + bounds.height * bounds.height) / 5;
      const bookPt = render.convertToBook(pt);
      const isPortrait = render.getOrientation() === 'portrait';
      const leftStart = isPortrait ? pageWidth : 0;

      const inYCorner =
        bookPt.y > 0 &&
        bookPt.y < bounds.height &&
        (bookPt.y < threshold || bookPt.y > bounds.height - threshold);
      const inLeftCorner =
        bookPt.x >= leftStart && bookPt.x < leftStart + threshold;
      const inRightCorner =
        bookPt.x > bounds.width - threshold && bookPt.x <= bounds.width;

      return inYCorner && (inLeftCorner || inRightCorner);
    };

    controller.flipPrev = (corner: 'top' | 'bottom' = 'top') => {
      const bounds = render.getRect();
      const isPortrait = render.getOrientation() === 'portrait';
      const targetX = isPortrait
        ? bounds.left + bounds.pageWidth + 10
        : bounds.left + 10;
      const targetY = corner === 'top' ? 1 : Math.max(1, bounds.height - 2);
      controller.flip?.({x: targetX, y: targetY});
    };
  }, []);

  const handleInit = useCallback(
    (e: {data?: {page?: number; mode?: 'portrait' | 'landscape'}}) => {
      ensureLeftFlipPatched();
      if (typeof e?.data?.page === 'number') {
        setCurrentPageIdx(e.data.page);
      }
      if (e?.data?.mode === 'portrait' || e?.data?.mode === 'landscape') {
        setOrientation(e.data.mode);
      }
    },
    [ensureLeftFlipPatched],
  );

  const handleOrientationChange = useCallback(
    (e: {data?: 'portrait' | 'landscape'}) => {
      ensureLeftFlipPatched();
      if (e?.data === 'portrait' || e?.data === 'landscape') {
        setOrientation(e.data);
      }
    },
    [ensureLeftFlipPatched],
  );

  const handleStateChange = useCallback((e: {data?: string}) => {
    if (typeof e?.data === 'string') {
      setFlipStateLabel(e.data);
    }
  }, []);

  const flipPrev = useCallback(
    (corner: 'top' | 'bottom' = 'bottom') => {
      ensureLeftFlipPatched();
      flipBookRef.current?.pageFlip()?.flipPrev(corner);
    },
    [ensureLeftFlipPatched],
  );

  const flipNext = useCallback(
    (corner: 'top' | 'bottom' = 'bottom') => {
      ensureLeftFlipPatched();
      flipBookRef.current?.pageFlip()?.flipNext(corner);
    },
    [ensureLeftFlipPatched],
  );

  const flipToPage = useCallback(
    (targetPage: number, corner: 'top' | 'bottom' = 'bottom') => {
      ensureLeftFlipPatched();
      const clamped = Math.max(0, Math.min(totalBookPages - 1, targetPage));
      flipBookRef.current?.pageFlip()?.flip(clamped, corner);
    },
    [ensureLeftFlipPatched, totalBookPages],
  );

  // Keyboard navigation inside flipbook mode
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (
        target?.tagName === 'INPUT' ||
        target?.tagName === 'TEXTAREA' ||
        target?.tagName === 'SELECT' ||
        target?.isContentEditable
      ) {
        return;
      }
      if (e.key === 'ArrowRight' || e.key === 'PageDown') {
        e.preventDefault();
        flipNext('bottom');
      } else if (e.key === 'ArrowLeft' || e.key === 'PageUp') {
        e.preventDefault();
        flipPrev('bottom');
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [flipNext, flipPrev]);

  const isSepia = paperTheme === 'sepia';
  const paperSurfaceClass = isSepia
    ? 'bg-[#FBF5E6] text-stone-900 border-[#DECFAF]'
    : 'bg-[#FFFDF9] text-stone-900 border-stone-200';
  const stageSurfaceClass = isSepia
    ? 'bg-[#EAE0CC]'
    : 'bg-[#EDEAE2]';

  // Memoize pages array so HTMLFlipBook does not needlessly invoke updateFromHtml on state updates
  const bookPageElements = useMemo(() => {
    const pages: React.ReactElement[] = [];

    // Page 0: Hardcover Front Cover
    pages.push(
      <div
        key={`cover-front-${post.slug}`}
        data-density="hard"
        className="w-full h-full bg-[#162756] text-white border border-[#0F1B3D] shadow-inner relative overflow-hidden flex flex-col justify-between p-6 sm:p-8 select-none"
      >
        {/* Spine crease highlight */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-y-0 left-0 w-5 bg-gradient-to-r from-black/35 via-white/10 to-transparent"
        />

        <div className="relative z-10 space-y-4 pl-2">
          <div className="flex flex-wrap items-center gap-2 text-[11px] font-mono-tabular text-blue-200 tracking-wide">
            <span>{post.academicYear}</span>
            <span aria-hidden="true">·</span>
            <span>{formatCategoryDisplay(post.category)}</span>
            <span aria-hidden="true">·</span>
            <span>{post.publishedAt}</span>
          </div>

          <h2 className="font-editorial text-xl sm:text-2xl font-bold leading-snug text-white text-balance">
            {post.title}
          </h2>

          {post.summary && (
            <p className="text-xs sm:text-sm text-blue-100/90 leading-relaxed line-clamp-4">
              {post.summary}
            </p>
          )}
        </div>

        {post.coverImageUrl && (
          <div className="relative z-10 pl-2 my-3">
            <div className="aspect-[16/9] w-full overflow-hidden rounded-lg border border-white/15 bg-black/20">
              <img
                src={normalizeDriveImageUrl(post.coverImageUrl)}
                alt={post.title}
                referrerPolicy="no-referrer"
                className="w-full h-full object-cover"
              />
            </div>
          </div>
        )}

        <div className="relative z-10 pl-2 pt-4 border-t border-white/15 flex items-end justify-between gap-3">
          <div className="text-xs text-blue-100/85 space-y-0.5">
            <div className="text-[11px] text-blue-200/75">撰稿與彙整</div>
            <div className="font-semibold text-white">{post.author}</div>
          </div>
          <div className="text-right text-[11px] text-amber-200 font-medium flex items-center gap-1">
            <span>點擊右下書角翻頁</span>
            <ChevronRight className="w-3.5 h-3.5" />
          </div>
        </div>
      </div>,
    );

    // Content Pages 1..N
    contentPages.forEach((section, idx) => {
      const pageNumber = idx + 1;
      const isLeftInSpread = pageNumber % 2 === 1;

      pages.push(
        <div
          key={`content-page-${post.slug}-${pageNumber}`}
          data-density="soft"
          className={`w-full h-full border relative overflow-hidden flex flex-col px-6 sm:px-8 pt-5 pb-6 ${paperSurfaceClass}`}
        >
          {/* Subtle inner gutter shadow along the spine */}
          <div
            aria-hidden="true"
            className={`pointer-events-none absolute inset-y-0 w-7 ${
              isLeftInSpread
                ? 'right-0 bg-gradient-to-l from-stone-900/[0.06] to-transparent'
                : 'left-0 bg-gradient-to-r from-stone-900/[0.06] to-transparent'
            }`}
          />

          {/* Subtle dog-ear corner visual indicators (left corner always shown on mobile portrait) */}
          <div
            aria-hidden="true"
            className={`pointer-events-none absolute bottom-0 left-0 w-6 h-6 bg-gradient-to-tr from-stone-400/20 via-stone-300/10 to-transparent ${
              isLeftInSpread ? '' : 'lg:hidden'
            }`}
          />
          <div
            aria-hidden="true"
            className={`pointer-events-none absolute bottom-0 right-0 w-6 h-6 bg-gradient-to-tl from-stone-400/20 via-stone-300/10 to-transparent ${
              isLeftInSpread ? 'lg:hidden' : ''
            }`}
          />

          {/* Running Header */}
          <div
            className={`relative z-10 pb-2.5 mb-3 border-b flex items-center justify-between gap-2 text-[11px] shrink-0 ${
              isSepia
                ? 'border-[#DFD2B5] text-stone-600'
                : 'border-stone-200/90 text-stone-500'
            }`}
          >
            <span className="truncate font-medium max-w-[65%]">
              {section.headingTitle || post.title}
            </span>
            <span className="font-mono-tabular shrink-0">
              {post.academicYear}
            </span>
          </div>

          {/* Scrollable safe prose container inside page */}
          <div
            onMouseDown={(e) => {
              const target = e.target as HTMLElement | null;
              if (target?.closest('a, button')) {
                e.stopPropagation();
              }
            }}
            className="relative z-10 flex-1 min-h-0 overflow-y-auto pr-1"
          >
            <div
              className="journal-prose journal-flipbook-prose w-full min-w-0"
              dangerouslySetInnerHTML={{__html: section.html}}
            />
          </div>

          {/* Running Footer / Folio */}
          <div
            className={`relative z-10 pt-2.5 mt-2 border-t flex items-center justify-between text-[11px] font-mono-tabular shrink-0 ${
              isSepia
                ? 'border-[#DFD2B5] text-stone-600'
                : 'border-stone-200/80 text-stone-500'
            }`}
          >
            <span className={isLeftInSpread ? '' : 'lg:hidden'}>
              ← 點擊左角翻回
            </span>
            {!isLeftInSpread && (
              <span className="hidden lg:inline">{post.author}</span>
            )}
            <span className="font-semibold text-stone-700">
              第 {pageNumber} 頁
            </span>
            {isLeftInSpread && (
              <span className="hidden lg:inline">{post.author}</span>
            )}
            <span className={isLeftInSpread ? 'lg:hidden' : ''}>
              點擊右角翻頁 →
            </span>
          </div>
        </div>,
      );
    });

    // Final Hardcover Back Cover / Resource Colophon
    pages.push(
      <div
        key={`cover-back-${post.slug}`}
        data-density="hard"
        className={`w-full h-full border relative overflow-hidden flex flex-col justify-between p-6 sm:p-8 ${
          isSepia
            ? 'bg-[#F5EBD4] text-stone-900 border-[#D8C7A4]'
            : 'bg-[#F7F4EE] text-stone-900 border-stone-300'
        }`}
      >
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-y-0 right-0 w-4 bg-gradient-to-l from-black/[0.06] to-transparent"
        />

        <div className="relative z-10 space-y-4">
          <div className="text-xs font-mono-tabular text-[#1E3A8A] font-semibold">
            電子書閱讀完畢 · 教學延伸附件
          </div>
          <h3 className="font-editorial text-xl font-bold text-stone-950">
            {post.title}
          </h3>
          <p className="text-xs sm:text-sm text-stone-600 leading-relaxed">
            {post.summary || '感謝閱讀本篇教學資源電子書。您可點擊書角翻回上一頁，或於下方開啟相關教材連結。'}
          </p>

          {post.embedUrl && embedMeta && (
            <div
              onMouseDown={(e) => e.stopPropagation()}
              className="mt-4 bg-white border border-stone-200 rounded-xl p-4 space-y-3 shadow-2xs"
            >
              <div className="flex items-start gap-2.5">
                <div className="w-9 h-9 rounded-lg bg-[#F7F4EE] border border-stone-200 flex items-center justify-center shrink-0">
                  {embedMeta.provider === '站內互動網頁' ? (
                    <MonitorPlay className="w-4 h-4 text-[#1E3A8A]" />
                  ) : (
                    <FileText className="w-4 h-4 text-[#1E3A8A]" />
                  )}
                </div>
                <div className="min-w-0">
                  <div className="text-[11px] font-mono-tabular text-stone-500">
                    {embedMeta.provider}
                  </div>
                  <div className="text-xs font-semibold text-stone-900 break-words">
                    {post.embedLabel || post.title}
                  </div>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {embedMeta.provider === '站內互動網頁' && onOpenFullEmbed && (
                  <button
                    type="button"
                    onClick={() =>
                      onOpenFullEmbed(
                        post.embedUrl!,
                        post.embedLabel || post.title,
                      )
                    }
                    className="px-3 py-1.5 text-xs font-medium text-[#1E3A8A] bg-[#F7F4EE] border border-[#1E3A8A]/30 rounded-lg hover:bg-[#EBE6DF] inline-flex items-center gap-1.5"
                  >
                    <Maximize2 className="w-3.5 h-3.5" />
                    <span>全螢幕舞台</span>
                  </button>
                )}
                <a
                  href={post.embedUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-3 py-1.5 text-xs font-medium text-white bg-[#1E3A8A] rounded-lg hover:bg-[#172554] inline-flex items-center gap-1.5"
                >
                  <span>開啟資源連結</span>
                  <ExternalLink className="w-3.5 h-3.5" />
                </a>
              </div>
            </div>
          )}
        </div>

        <div
          onMouseDown={(e) => e.stopPropagation()}
          className="relative z-10 pt-4 border-t border-stone-300/70 flex items-center justify-between gap-2 text-xs"
        >
          <span className="font-mono-tabular text-stone-500">
            西門國小數學社群
          </span>
          <button
            type="button"
            onClick={() => flipToPage(0, 'bottom')}
            className="px-3 py-1.5 text-xs font-semibold text-[#1E3A8A] bg-white border border-[#1E3A8A]/25 rounded-lg hover:bg-[#1E3A8A]/5 inline-flex items-center gap-1.5"
          >
            <BookOpen className="w-3.5 h-3.5" />
            <span>回到電子書封面</span>
          </button>
        </div>
      </div>,
    );

    return pages;
  }, [
    post.slug,
    post.academicYear,
    post.category,
    post.publishedAt,
    post.title,
    post.summary,
    post.coverImageUrl,
    post.author,
    post.embedUrl,
    post.embedLabel,
    contentPages,
    paperSurfaceClass,
    isSepia,
    embedMeta,
    onOpenFullEmbed,
    flipToPage,
  ]);

  const progressPercent =
    totalBookPages > 1
      ? Math.round((currentPageIdx / (totalBookPages - 1)) * 100)
      : 100;

  const isAtStart = currentPageIdx <= 0;
  const isAtEnd =
    orientation === 'landscape'
      ? currentPageIdx >= totalBookPages - 2
      : currentPageIdx >= totalBookPages - 1;

  const currentSpreadLabel = (() => {
    if (currentPageIdx === 0) return '封面';
    if (currentPageIdx >= totalBookPages - 1) return '封底與附件';
    if (orientation === 'landscape') {
      const rightIdx = currentPageIdx + 1;
      if (rightIdx < totalBookPages - 1) {
        return `第 ${currentPageIdx}–${rightIdx} 頁`;
      }
      return `第 ${currentPageIdx} 頁`;
    }
    return `第 ${currentPageIdx} 頁`;
  })();

  return (
    <div className="flex flex-col">
      {/* Compact E-book Reader Toolbar */}
      <div className="px-4 sm:px-8 py-2.5 bg-white border-b border-stone-200 flex flex-wrap items-center justify-between gap-2 text-xs">
        <div className="flex items-center gap-2 text-stone-600">
          <BookOpen className="w-4 h-4 text-[#1E3A8A] shrink-0" />
          <span className="font-semibold text-stone-900">擬真翻頁電子書模式</span>
          <span className="hidden md:inline text-stone-500">
            · 滑鼠移至書角可預覽摺角，點擊書角或左右拖曳即可翻頁
          </span>
        </div>

        <div className="flex items-center gap-2">
          {/* Paper / Sepia Switcher */}
          <div
            className="flex items-center gap-0.5 p-0.5 bg-[#F7F4EE] border border-stone-200 rounded-lg"
            role="group"
            aria-label="電子書紙張色調"
          >
            <button
              type="button"
              onClick={() => setPaperTheme('paper')}
              className={`px-2.5 py-1 rounded-md text-xs font-medium inline-flex items-center gap-1 transition-colors whitespace-nowrap ${
                paperTheme === 'paper'
                  ? 'bg-white text-[#1E3A8A] font-semibold shadow-2xs'
                  : 'text-stone-600 hover:text-stone-900'
              }`}
            >
              <Sun className="w-3.5 h-3.5" />
              <span>紙本白</span>
            </button>
            <button
              type="button"
              onClick={() => setPaperTheme('sepia')}
              className={`px-2.5 py-1 rounded-md text-xs font-medium inline-flex items-center gap-1 transition-colors whitespace-nowrap ${
                paperTheme === 'sepia'
                  ? 'bg-[#FBF5E6] text-[#7C2D12] font-semibold shadow-2xs'
                  : 'text-stone-600 hover:text-stone-900'
              }`}
            >
              <span className="w-2.5 h-2.5 rounded-full bg-[#E6D3A7] border border-amber-700/40 shrink-0" />
              <span>護眼黃</span>
            </button>
          </div>
        </div>
      </div>

      {/* FlipBook Interactive Stage */}
      <div
        ref={stageContainerRef}
        className={`relative px-3 sm:px-8 py-6 sm:py-8 flex items-center justify-center overflow-hidden transition-colors ${stageSurfaceClass}`}
      >
        {/* Left Floating Corner-Flip Control */}
        <button
          type="button"
          disabled={isAtStart}
          onClick={() => flipPrev('bottom')}
          aria-label="翻至上一頁"
          title="翻至上一頁 (←)"
          className="flex absolute left-1.5 sm:left-3 top-1/2 -translate-y-1/2 z-20 w-8 h-8 sm:w-10 sm:h-10 rounded-full bg-white/90 border border-stone-200 text-stone-800 items-center justify-center shadow-md hover:bg-white hover:scale-105 transition-all disabled:opacity-25 disabled:pointer-events-none"
        >
          <ChevronLeft className="w-4 h-4 sm:w-5 sm:h-5" />
        </button>

        <div className="w-full max-w-[940px] flex justify-center items-center">
          <HTMLFlipBook
            key={`flipbook-${post.slug}`}
            ref={flipBookRef}
            width={450}
            height={590}
            size="stretch"
            minWidth={280}
            maxWidth={470}
            minHeight={430}
            maxHeight={620}
            startPage={0}
            drawShadow={true}
            flippingTime={prefersReducedMotion ? 1 : 750}
            usePortrait={true}
            startZIndex={0}
            autoSize={true}
            maxShadowOpacity={0.42}
            showCover={true}
            mobileScrollSupport={true}
            swipeDistance={28}
            clickEventForward={true}
            useMouseEvents={true}
            showPageCorners={true}
            disableFlipByClick={true}
            renderOnlyPageLengthChange={true}
            onFlip={handleFlip}
            onInit={handleInit}
            onChangeOrientation={handleOrientationChange}
            onChangeState={handleStateChange}
            className="mx-auto shadow-2xl rounded-sm"
            style={{margin: '0 auto'}}
          >
            {bookPageElements}
          </HTMLFlipBook>
        </div>

        {/* Right Floating Corner-Flip Control */}
        <button
          type="button"
          disabled={isAtEnd}
          onClick={() => flipNext('bottom')}
          aria-label="翻至下一頁"
          title="翻至下一頁 (→)"
          className="flex absolute right-1.5 sm:right-3 top-1/2 -translate-y-1/2 z-20 w-8 h-8 sm:w-10 sm:h-10 rounded-full bg-white/90 border border-stone-200 text-stone-800 items-center justify-center shadow-md hover:bg-white hover:scale-105 transition-all disabled:opacity-25 disabled:pointer-events-none"
        >
          <ChevronRight className="w-4 h-4 sm:w-5 sm:h-5" />
        </button>
      </div>

      {/* Bottom Flipbook Navigation & Page-Scrubber Bar */}
      <div className="px-4 sm:px-8 py-3 bg-white border-t border-stone-200 flex flex-wrap items-center justify-between gap-3 text-xs">
        <div className="flex items-center gap-1 shrink-0">
          <button
            type="button"
            disabled={isAtStart}
            onClick={() => flipToPage(0, 'top')}
            aria-label="跳至封面"
            title="跳至封面"
            className="min-h-[34px] min-w-[34px] rounded-lg border border-stone-200 text-stone-700 hover:bg-stone-50 disabled:opacity-35 inline-flex items-center justify-center"
          >
            <ChevronsLeft className="w-4 h-4" />
          </button>
          <button
            type="button"
            disabled={isAtStart}
            onClick={() => flipPrev('bottom')}
            className="min-h-[34px] px-2.5 rounded-lg border border-stone-200 text-stone-700 hover:bg-stone-50 disabled:opacity-35 inline-flex items-center gap-1 font-medium whitespace-nowrap"
          >
            <ChevronLeft className="w-3.5 h-3.5" />
            <span>上一頁</span>
          </button>
        </div>

        <div className="flex-1 min-w-[140px] max-w-sm flex items-center gap-2.5">
          <input
            type="range"
            min={0}
            max={Math.max(0, totalBookPages - 1)}
            value={currentPageIdx}
            onChange={(e) => {
              const target = parseInt(e.target.value, 10);
              if (!Number.isNaN(target)) {
                flipToPage(target, 'bottom');
              }
            }}
            aria-label="快速翻閱頁碼滑桿"
            className="w-full accent-[#1E3A8A] cursor-pointer h-1.5"
          />
          <span className="font-mono-tabular text-stone-500 w-10 text-right shrink-0">
            {progressPercent}%
          </span>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <span
            className="font-mono-tabular text-stone-700 font-medium whitespace-nowrap"
            data-flip-state={flipStateLabel}
          >
            {currentSpreadLabel} / 共 {contentPages.length} 內頁
          </span>
          <div className="flex items-center gap-1">
            <button
              type="button"
              disabled={isAtEnd}
              onClick={() => flipNext('bottom')}
              className="min-h-[34px] px-2.5 rounded-lg border border-stone-200 text-stone-700 hover:bg-stone-50 disabled:opacity-35 inline-flex items-center gap-1 font-medium whitespace-nowrap"
            >
              <span>下一頁</span>
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              disabled={isAtEnd}
              onClick={() => flipToPage(totalBookPages - 1, 'bottom')}
              aria-label="跳至封底"
              title="跳至封底"
              className="min-h-[34px] min-w-[34px] rounded-lg border border-stone-200 text-stone-700 hover:bg-stone-50 disabled:opacity-35 inline-flex items-center justify-center"
            >
              <ChevronsRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
