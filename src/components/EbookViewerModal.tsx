import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import {
  AlertCircle,
  ArrowLeft,
  Bookmark,
  BookOpen,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Columns2,
  Download,
  ExternalLink,
  FileText,
  List,
  Loader2,
  Maximize2,
  Minimize2,
  Moon,
  PanelLeft,
  QrCode,
  RefreshCw,
  RotateCcw,
  Rows3,
  Search,
  Square,
  StickyNote,
  Sun,
  Type,
  X,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import {TeachingResource} from '../types/journal';
import {getAccessToken} from '../services/googleAuth';
import {
  EbookTocEntry,
  findActiveTocEntry,
  resolveBookTocMeta,
} from '../utils/ebookToc';
import {
  EbookReadingTheme,
  LoadedEbookEpub,
  parseEpubBuffer,
} from '../utils/epubLoader';

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

function getPdfjsAssetBaseUrl(folder: 'cmaps' | 'standard_fonts'): string {
  if (typeof window === 'undefined') return `./pdfjs/${folder}/`;
  const base =
    typeof document !== 'undefined' && document.baseURI
      ? document.baseURI
      : window.location.href;
  return new URL(`pdfjs/${folder}/`, base).toString();
}

const LOCAL_DRIVE_PDF_MIRRORS: Record<string, string> = {
  '1QGX7XWqy3ZmtElQZQ9JCyCl2EYelTufv':
    './assets/ebooks/constructed-response-math.pdf',
};

interface EbookViewerModalProps {
  resource: TeachingResource | null;
  initialPage?: number | null;
  onClose: () => void;
  onOpenShareQr?: (url: string, title: string) => void;
  hubShareUrl?: string;
  renderNotes?: (content: string) => React.ReactNode;
}

type ViewerMode = 'pdf' | 'epub' | 'markdown' | 'iframe' | 'notes-only';
type PdfViewLayout = 'single' | 'spread' | 'scroll';
type SidebarTab = 'toc' | 'thumbs' | 'bookmarks';
type TocGroupMode = 'order' | 'grade' | 'category';

interface ResolvedEbookSource {
  mode: ViewerMode;
  embedUrl: string;
  rawUrl: string;
  formatLabel: string;
  downloadUrl?: string;
  downloadExt?: string;
  driveFileId?: string;
  fallbackPreviewUrl?: string;
}

interface PdfOutlineNode {
  id: string;
  title: string;
  pageNumber: number | null;
  level: number;
}

interface SearchHitItem {
  id: string;
  targetType: 'pdf-page' | 'epub-chapter' | 'md-block' | 'notes';
  pageOrIndex: number;
  label: string;
  snippet: string;
  blockAnchorId?: string;
}

function extractDriveFileId(url: string): string | null {
  const pathMatch = url.match(/\/file\/d\/([a-zA-Z0-9_-]+)/i);
  if (pathMatch?.[1]) return pathMatch[1];
  try {
    const parsed = new URL(url);
    const idParam = parsed.searchParams.get('id');
    if (idParam && /^[a-zA-Z0-9_-]+$/.test(idParam)) return idParam;
  } catch {
    // ignore
  }
  return null;
}

function isSafeMediaOrLinkUrl(raw: string, baseUrl?: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  try {
    const fallbackBase =
      typeof window !== 'undefined' ? window.location.href : 'http://localhost/';
    const parsed = new URL(trimmed, baseUrl || fallbackBase);
    if (
      parsed.protocol === 'http:' ||
      parsed.protocol === 'https:' ||
      parsed.protocol === 'data:' ||
      parsed.protocol === 'blob:'
    ) {
      return parsed.toString();
    }
    return null;
  } catch {
    return null;
  }
}

function resolveEbookSource(
  rawUrl?: string,
  resourceTitle?: string,
): ResolvedEbookSource {
  const trimmed = (rawUrl || '').trim();
  if (!trimmed) {
    return {
      mode: 'notes-only',
      embedUrl: '',
      rawUrl: '',
      formatLabel: '電子書導讀',
    };
  }

  if (trimmed.startsWith('data:application/pdf')) {
    return {
      mode: 'pdf',
      embedUrl: trimmed,
      rawUrl: trimmed,
      formatLabel: 'PDF 電子書',
      downloadUrl: trimmed,
      downloadExt: 'pdf',
    };
  }

  try {
    const base =
      typeof window !== 'undefined' ? window.location.href : 'http://localhost/';
    const parsed = new URL(trimmed, base);
    if (
      parsed.protocol !== 'http:' &&
      parsed.protocol !== 'https:' &&
      parsed.protocol !== 'blob:'
    ) {
      return {
        mode: 'notes-only',
        embedUrl: '',
        rawUrl: '',
        formatLabel: '電子書導讀',
      };
    }

    if (
      parsed.hostname.includes('drive.google.com') ||
      parsed.hostname.includes('drive.usercontent.google.com')
    ) {
      const fileId = extractDriveFileId(trimmed);
      if (fileId) {
        const normalizedTitle = (resourceTitle || '').replace(/\s+/g, '');
        const isConstructedResponseTitle = normalizedTitle.includes(
          '建構反應題融入數學領域素養教學活動設計',
        );
        const mirroredLocalUrl = isConstructedResponseTitle
          ? LOCAL_DRIVE_PDF_MIRRORS[fileId]
          : undefined;
        const directDownloadUrl = `https://drive.usercontent.google.com/download?id=${encodeURIComponent(fileId)}&export=download&confirm=t`;
        return {
          mode: 'pdf',
          embedUrl: mirroredLocalUrl || directDownloadUrl,
          rawUrl: trimmed,
          formatLabel: '雲端 PDF 電子書',
          downloadUrl: mirroredLocalUrl || directDownloadUrl,
          downloadExt: 'pdf',
          driveFileId: fileId,
          fallbackPreviewUrl: `https://drive.google.com/file/d/${encodeURIComponent(fileId)}/preview`,
        };
      }
    }

    if (parsed.hostname.includes('docs.google.com')) {
      const docMatch = parsed.pathname.match(
        /\/(document|spreadsheets|presentation)\/(?:u\/\d+\/)?d\/([a-zA-Z0-9_-]+)/i,
      );
      if (docMatch?.[1] && docMatch?.[2]) {
        return {
          mode: 'iframe',
          embedUrl: `https://docs.google.com/${docMatch[1]}/d/${docMatch[2]}/preview`,
          rawUrl: trimmed,
          formatLabel: '線上文件檢視',
        };
      }
    }

    const sameOriginUrl =
      typeof window !== 'undefined' && parsed.origin === window.location.origin
        ? `${parsed.pathname}${parsed.search}${parsed.hash}`
        : trimmed;

    if (/\.pdf$/i.test(parsed.pathname)) {
      return {
        mode: 'pdf',
        embedUrl: sameOriginUrl,
        rawUrl: sameOriginUrl,
        formatLabel: 'PDF 閱讀器',
        downloadUrl: sameOriginUrl,
        downloadExt: 'pdf',
      };
    }

    if (/\.epub$/i.test(parsed.pathname)) {
      return {
        mode: 'epub',
        embedUrl: sameOriginUrl,
        rawUrl: sameOriginUrl,
        formatLabel: 'EPUB 電子書',
        downloadUrl: sameOriginUrl,
        downloadExt: 'epub',
      };
    }

    if (/\.(md|markdown)$/i.test(parsed.pathname)) {
      return {
        mode: 'markdown',
        embedUrl: sameOriginUrl,
        rawUrl: sameOriginUrl,
        formatLabel: 'Markdown 文件',
        downloadUrl: sameOriginUrl,
        downloadExt: 'md',
      };
    }

    return {
      mode: 'iframe',
      embedUrl: sameOriginUrl,
      rawUrl: sameOriginUrl,
      formatLabel: 'HTML5 電子書',
    };
  } catch {
    return {
      mode: 'notes-only',
      embedUrl: '',
      rawUrl: '',
      formatLabel: '電子書導讀',
    };
  }
}

interface MarkdownHeadingItem {
  id: string;
  level: 1 | 2 | 3;
  text: string;
}

function extractMarkdownHeadings(content: string): MarkdownHeadingItem[] {
  const headings: MarkdownHeadingItem[] = [];
  const lines = content.split(/\r?\n/);
  let inFence = false;
  let idx = 0;

  for (const rawLine of lines) {
    const trimmed = rawLine.trim();
    if (trimmed.startsWith('```')) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;
    const match = trimmed.match(/^(#{1,3})\s+(.+)$/);
    if (match) {
      const level = match[1].length as 1 | 2 | 3;
      const text = match[2].replace(/\s*#+\s*$/, '').trim();
      headings.push({id: `md-heading-${idx++}`, level, text});
    }
  }
  return headings;
}

function renderHighlightedSegment(
  text: string,
  highlightQuery?: string,
): React.ReactNode {
  const needle = (highlightQuery || '').trim();
  if (!needle) return text;
  const lowerText = text.toLowerCase();
  const lowerNeedle = needle.toLowerCase();
  if (!lowerText.includes(lowerNeedle)) return text;

  const nodes: React.ReactNode[] = [];
  let cursor = 0;
  let hitIdx = lowerText.indexOf(lowerNeedle, cursor);
  let k = 0;
  while (hitIdx !== -1) {
    if (hitIdx > cursor) {
      nodes.push(text.slice(cursor, hitIdx));
    }
    nodes.push(
      <mark
        key={`hl-${k++}`}
        className="bg-amber-200 text-stone-950 px-0.5 rounded-xs"
      >
        {text.slice(hitIdx, hitIdx + needle.length)}
      </mark>,
    );
    cursor = hitIdx + needle.length;
    hitIdx = lowerText.indexOf(lowerNeedle, cursor);
  }
  if (cursor < text.length) {
    nodes.push(text.slice(cursor));
  }
  return <>{nodes}</>;
}

function buildSnippet(text: string, query: string, radius = 36): string {
  const clean = text.replace(/\s+/g, ' ').trim();
  const idx = clean.toLowerCase().indexOf(query.trim().toLowerCase());
  if (idx === -1) return clean.slice(0, radius * 2);
  const start = Math.max(0, idx - radius);
  const end = Math.min(clean.length, idx + query.length + radius);
  return `${start > 0 ? '…' : ''}${clean.slice(start, end)}${end < clean.length ? '…' : ''}`;
}

function renderInlineMarkdown(
  text: string,
  baseUrl?: string,
  highlightQuery?: string,
  isDark = false,
): React.ReactNode[] {
  const parts: React.ReactNode[] = [];
  const regex =
    /(!\[[^\]]*\]\([^)]+\)|\[[^\]]+\]\([^)]+\)|`[^`]+`|\*\*[^*]+\*\*|\*[^*]+\*)/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let keyCounter = 0;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(
        <React.Fragment key={`t-${keyCounter++}`}>
          {renderHighlightedSegment(
            text.slice(lastIndex, match.index),
            highlightQuery,
          )}
        </React.Fragment>,
      );
    }
    const token = match[0];
    if (token.startsWith('![')) {
      const imgMatch = token.match(/^!\[([^\]]*)\]\(([^)]+)\)$/);
      if (imgMatch) {
        const safeSrc = isSafeMediaOrLinkUrl(imgMatch[2], baseUrl);
        if (safeSrc) {
          parts.push(
            <img
              key={`img-${keyCounter++}`}
              src={safeSrc}
              alt={imgMatch[1] || '電子書插圖'}
              referrerPolicy="no-referrer"
              className="max-w-full h-auto rounded-lg border border-stone-200 my-3 mx-auto block"
            />,
          );
        }
      }
    } else if (token.startsWith('[')) {
      const linkMatch = token.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
      if (linkMatch) {
        const safeHref = isSafeMediaOrLinkUrl(linkMatch[2], baseUrl);
        if (safeHref) {
          parts.push(
            <a
              key={`a-${keyCounter++}`}
              href={safeHref}
              target="_blank"
              rel="noopener noreferrer"
              className={`underline underline-offset-2 ${
                isDark
                  ? 'text-blue-300 hover:text-blue-200'
                  : 'text-[#1E3A8A] hover:text-[#172554]'
              }`}
            >
              {renderHighlightedSegment(linkMatch[1], highlightQuery)}
            </a>,
          );
        } else {
          parts.push(linkMatch[1]);
        }
      }
    } else if (token.startsWith('`') && token.endsWith('`')) {
      parts.push(
        <code
          key={`c-${keyCounter++}`}
          className={`px-1.5 py-0.5 mx-0.5 rounded border font-mono-tabular text-[0.88em] ${
            isDark
              ? 'bg-zinc-800 border-zinc-700 text-blue-300'
              : 'bg-[#F7F4EE] border-stone-200 text-[#1E3A8A]'
          }`}
        >
          {renderHighlightedSegment(token.slice(1, -1), highlightQuery)}
        </code>,
      );
    } else if (token.startsWith('**') && token.endsWith('**')) {
      parts.push(
        <strong
          key={`b-${keyCounter++}`}
          className={`font-semibold ${isDark ? 'text-white' : 'text-stone-950'}`}
        >
          {renderHighlightedSegment(token.slice(2, -2), highlightQuery)}
        </strong>,
      );
    } else if (token.startsWith('*') && token.endsWith('*')) {
      parts.push(
        <em key={`i-${keyCounter++}`} className="italic">
          {renderHighlightedSegment(token.slice(1, -1), highlightQuery)}
        </em>,
      );
    }
    lastIndex = match.index + token.length;
  }

  if (lastIndex < text.length) {
    parts.push(
      <React.Fragment key={`t-${keyCounter++}`}>
        {renderHighlightedSegment(text.slice(lastIndex), highlightQuery)}
      </React.Fragment>,
    );
  }
  return parts;
}

const MarkdownBookView: React.FC<{
  content: string;
  baseUrl?: string;
  fontSizePx: number;
  theme: EbookReadingTheme;
  highlightQuery?: string;
}> = ({content, baseUrl, fontSizePx, theme, highlightQuery}) => {
  const isDark = theme === 'dark';
  const lines = content.split(/\r?\n/);
  const blocks: React.ReactNode[] = [];
  let listState: {ordered: boolean; items: Array<{text: string; lineIdx: number}>} | null = null;
  let quoteLines: Array<{text: string; lineIdx: number}> = [];
  let codeFence: {lang: string; lines: string[]; startLineIdx: number} | null = null;
  let tableRows: {rows: string[][]; startLineIdx: number} | null = null;
  let keyIdx = 0;
  let headingCounter = 0;

  const textBodyClass = isDark ? 'text-stone-200' : 'text-stone-800';
  const borderClass = isDark ? 'border-zinc-700' : 'border-stone-200';
  const headingClass = isDark ? 'text-stone-100' : 'text-stone-950';
  const h3Class = isDark ? 'text-blue-300' : 'text-[#1E3A8A]';

  const flushList = () => {
    if (!listState) return;
    const Tag = listState.ordered ? 'ol' : 'ul';
    const firstLine = listState.items[0]?.lineIdx ?? 0;
    blocks.push(
      <Tag
        key={`list-${keyIdx++}`}
        id={`md-line-${firstLine}`}
        className={`my-3.5 pl-6 space-y-1.5 leading-relaxed scroll-mt-6 ${textBodyClass} ${
          listState.ordered ? 'list-decimal' : 'list-disc'
        }`}
      >
        {listState.items.map((item, idx) => (
          <li key={idx} id={`md-line-${item.lineIdx}`} className="scroll-mt-6">
            {renderInlineMarkdown(item.text, baseUrl, highlightQuery, isDark)}
          </li>
        ))}
      </Tag>,
    );
    listState = null;
  };

  const flushQuote = () => {
    if (quoteLines.length === 0) return;
    const firstLine = quoteLines[0].lineIdx;
    blocks.push(
      <blockquote
        key={`q-${keyIdx++}`}
        id={`md-line-${firstLine}`}
        className={`my-4 py-3 px-4 border-y italic space-y-1.5 scroll-mt-6 ${
          isDark
            ? 'border-zinc-700 bg-zinc-800/60 text-stone-300'
            : 'border-stone-200 bg-[#FBF9F5] text-stone-700'
        }`}
      >
        {quoteLines.map((q, idx) => (
          <p key={idx} id={`md-line-${q.lineIdx}`} className="scroll-mt-6">
            {renderInlineMarkdown(q.text, baseUrl, highlightQuery, isDark)}
          </p>
        ))}
      </blockquote>,
    );
    quoteLines = [];
  };

  const flushTable = () => {
    if (!tableRows || tableRows.rows.length === 0) return;
    const header = tableRows.rows[0];
    const bodyStart =
      tableRows.rows.length > 1 &&
      tableRows.rows[1].every((cell) => /^:?-{2,}:?$/.test(cell.trim()))
        ? 2
        : 1;
    const body = tableRows.rows.slice(bodyStart);
    blocks.push(
      <div
        key={`tbl-${keyIdx++}`}
        id={`md-line-${tableRows.startLineIdx}`}
        className={`my-4 overflow-x-auto border rounded-lg scroll-mt-6 ${borderClass}`}
      >
        <table className="w-full border-collapse text-sm font-mono-tabular">
          <thead className={isDark ? 'bg-zinc-800' : 'bg-[#F7F4EE]'}>
            <tr>
              {header.map((cell, idx) => (
                <th
                  key={idx}
                  className={`text-left font-semibold px-3 py-2 border-b ${borderClass} ${headingClass}`}
                >
                  {renderInlineMarkdown(cell.trim(), baseUrl, highlightQuery, isDark)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {body.map((row, rIdx) => (
              <tr
                key={rIdx}
                className={`border-b last:border-0 ${
                  isDark ? 'border-zinc-800' : 'border-stone-100'
                }`}
              >
                {header.map((_, cIdx) => (
                  <td key={cIdx} className={`px-3 py-2 ${textBodyClass}`}>
                    {renderInlineMarkdown(
                      (row[cIdx] || '').trim(),
                      baseUrl,
                      highlightQuery,
                      isDark,
                    )}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>,
    );
    tableRows = null;
  };

  for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
    const rawLine = lines[lineIdx];
    const trimmed = rawLine.trim();

    if (trimmed.startsWith('```')) {
      flushList();
      flushQuote();
      flushTable();
      if (codeFence) {
        blocks.push(
          <pre
            key={`code-${keyIdx++}`}
            id={`md-line-${codeFence.startLineIdx}`}
            className="my-4 p-4 rounded-xl bg-stone-900 text-stone-100 overflow-x-auto text-[0.85em] font-mono-tabular leading-relaxed scroll-mt-6"
          >
            <code>{codeFence.lines.join('\n')}</code>
          </pre>,
        );
        codeFence = null;
      } else {
        codeFence = {lang: trimmed.slice(3).trim(), lines: [], startLineIdx: lineIdx};
      }
      continue;
    }

    if (codeFence) {
      codeFence.lines.push(rawLine);
      continue;
    }

    if (!trimmed) {
      flushList();
      flushQuote();
      flushTable();
      continue;
    }

    if (/^(-{3,}|\*{3,}|_{3,})$/.test(trimmed)) {
      flushList();
      flushQuote();
      flushTable();
      blocks.push(<hr key={`hr-${keyIdx++}`} className={`my-6 ${borderClass}`} />);
      continue;
    }

    if (trimmed.startsWith('|') && trimmed.endsWith('|')) {
      flushList();
      flushQuote();
      const cells = trimmed.slice(1, -1).split('|');
      if (!tableRows) tableRows = {rows: [], startLineIdx: lineIdx};
      tableRows.rows.push(cells);
      continue;
    }
    flushTable();

    if (trimmed.startsWith('>')) {
      flushList();
      quoteLines.push({text: trimmed.replace(/^>\s?/, ''), lineIdx});
      continue;
    }
    flushQuote();

    const headingMatch = trimmed.match(/^(#{1,3})\s+(.+)$/);
    if (headingMatch) {
      flushList();
      const level = headingMatch[1].length;
      const headingText = headingMatch[2].replace(/\s*#+\s*$/, '').trim();
      const id = `md-heading-${headingCounter++}`;
      if (level === 1) {
        blocks.push(
          <h1
            key={id}
            id={id}
            data-line={lineIdx}
            className={`font-editorial text-[1.6em] font-bold mt-8 mb-4 pb-2 border-b scroll-mt-6 ${headingClass} ${borderClass}`}
          >
            {renderInlineMarkdown(headingText, baseUrl, highlightQuery, isDark)}
          </h1>,
        );
      } else if (level === 2) {
        blocks.push(
          <h2
            key={id}
            id={id}
            data-line={lineIdx}
            className={`font-editorial text-[1.3em] font-bold mt-7 mb-3 pb-1.5 border-b scroll-mt-6 ${headingClass} ${borderClass}`}
          >
            {renderInlineMarkdown(headingText, baseUrl, highlightQuery, isDark)}
          </h2>,
        );
      } else {
        blocks.push(
          <h3
            key={id}
            id={id}
            data-line={lineIdx}
            className={`font-editorial text-[1.12em] font-bold mt-5 mb-2 scroll-mt-6 ${h3Class}`}
          >
            {renderInlineMarkdown(headingText, baseUrl, highlightQuery, isDark)}
          </h3>,
        );
      }
      continue;
    }

    const ulMatch = trimmed.match(/^[-*•]\s+(.*)$/);
    if (ulMatch) {
      if (listState && listState.ordered) flushList();
      if (!listState) listState = {ordered: false, items: []};
      listState.items.push({text: ulMatch[1], lineIdx});
      continue;
    }

    const olMatch = trimmed.match(/^\d+\.\s+(.*)$/);
    if (olMatch) {
      if (listState && !listState.ordered) flushList();
      if (!listState) listState = {ordered: true, items: []};
      listState.items.push({text: olMatch[1], lineIdx});
      continue;
    }

    flushList();
    blocks.push(
      <p
        key={`p-${keyIdx++}`}
        id={`md-line-${lineIdx}`}
        className={`my-3 leading-[1.85] scroll-mt-6 ${textBodyClass}`}
      >
        {renderInlineMarkdown(trimmed, baseUrl, highlightQuery, isDark)}
      </p>,
    );
  }

  flushList();
  flushQuote();
  flushTable();
  if (codeFence) {
    blocks.push(
      <pre
        key={`code-${keyIdx++}`}
        id={`md-line-${codeFence.startLineIdx}`}
        className="my-4 p-4 rounded-xl bg-stone-900 text-stone-100 overflow-x-auto text-[0.85em] font-mono-tabular leading-relaxed scroll-mt-6"
      >
        <code>{codeFence.lines.join('\n')}</code>
      </pre>,
    );
  }

  return (
    <div style={{fontSize: `${fontSizePx}px`}} className="leading-[1.85]">
      {blocks}
    </div>
  );
};

interface PdfPageCanvasProps {
  pdfDoc: pdfjsLib.PDFDocumentProxy;
  pageNumber: number;
  targetWidth: number;
  targetHeight: number;
  zoomFactor: number;
  theme?: EbookReadingTheme;
  spineEdge?: 'none' | 'left-page' | 'right-page';
  lazyVisibleOnly?: boolean;
}

const PdfPageCanvas: React.FC<PdfPageCanvasProps> = ({
  pdfDoc,
  pageNumber,
  targetWidth,
  targetHeight,
  zoomFactor,
  theme = 'paper',
  spineEdge = 'none',
  lazyVisibleOnly = false,
}) => {
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [rendering, setRendering] = useState(true);
  const [shouldRender, setShouldRender] = useState(!lazyVisibleOnly);

  useEffect(() => {
    if (!lazyVisibleOnly) {
      setShouldRender(true);
      return;
    }
    const el = wrapperRef.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setShouldRender(true);
          obs.disconnect();
        }
      },
      {rootMargin: '420px 0px'},
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [lazyVisibleOnly]);

  useEffect(() => {
    if (!shouldRender) return;
    let cancelled = false;
    let renderTask: ReturnType<pdfjsLib.PDFPageProxy['render']> | null = null;
    setRendering(true);

    void (async () => {
      try {
        const page = await pdfDoc.getPage(pageNumber);
        if (cancelled) return;

        const baseViewport = page.getViewport({scale: 1});
        const fitWidthScale = targetWidth / baseViewport.width;
        const fitHeightScale = targetHeight / baseViewport.height;
        const fitScale = Math.max(
          0.25,
          Math.min(fitWidthScale, fitHeightScale),
        );
        const cssScale = fitScale * zoomFactor;
        const nativeDpr =
          typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1;

        // Supersample canvas backing store so CJK serif strokes & thin table lines
        // stay crisp on high-DPI Retina screens, 1x desktop monitors, and mobile pinch-zoom.
        const oversampleDpr = Math.max(nativeDpr, 2.5);
        const minRenderScale = lazyVisibleOnly ? 2.4 : 3.2;
        let renderScale = Math.max(cssScale * oversampleDpr, minRenderScale);

        // Keep backing canvas within browser (especially iOS Safari) per-canvas limits.
        const maxDim = lazyVisibleOnly ? 2800 : 3600;
        const maxPixels = lazyVisibleOnly ? 6_500_000 : 11_000_000;
        const rawWidth = baseViewport.width * renderScale;
        const rawHeight = baseViewport.height * renderScale;
        if (rawWidth > maxDim || rawHeight > maxDim) {
          renderScale *= Math.min(maxDim / rawWidth, maxDim / rawHeight);
        }
        const totalPixels =
          baseViewport.width * renderScale * (baseViewport.height * renderScale);
        if (totalPixels > maxPixels) {
          renderScale *= Math.sqrt(maxPixels / totalPixels);
        }

        const cssViewport = page.getViewport({scale: cssScale});
        const renderViewport = page.getViewport({scale: renderScale});

        const canvas = canvasRef.current;
        if (!canvas || cancelled) return;

        const cssWidth = Math.max(1, Math.round(cssViewport.width));
        const cssHeight = Math.max(1, Math.round(cssViewport.height));
        canvas.width = Math.max(1, Math.round(renderViewport.width));
        canvas.height = Math.max(1, Math.round(renderViewport.height));
        canvas.style.width = `${cssWidth}px`;
        canvas.style.height = `${cssHeight}px`;

        const ctx =
          canvas.getContext('2d', {alpha: false}) || canvas.getContext('2d');
        if (!ctx) return;

        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        renderTask = page.render({
          canvas,
          canvasContext: ctx,
          viewport: renderViewport,
        });
        await renderTask.promise;
        if (!cancelled) {
          setRendering(false);
        }
      } catch (err: unknown) {
        const name = (err as {name?: string})?.name;
        if (name !== 'RenderingCancelledException' && !cancelled) {
          setRendering(false);
        }
      }
    })();

    return () => {
      cancelled = true;
      try {
        renderTask?.cancel();
      } catch {
        // ignore cancel failure
      }
    };
  }, [
    pdfDoc,
    pageNumber,
    targetWidth,
    targetHeight,
    zoomFactor,
    shouldRender,
    lazyVisibleOnly,
  ]);

  const filterStyle: React.CSSProperties =
    theme === 'sepia'
      ? {filter: 'sepia(0.18) brightness(0.98)'}
      : theme === 'dark'
        ? {filter: 'brightness(0.88) contrast(1.04)'}
        : {};

  const roundedClass =
    spineEdge === 'left-page'
      ? 'rounded-l-md rounded-r-none border-r-0'
      : spineEdge === 'right-page'
        ? 'rounded-r-md rounded-l-none border-l-0'
        : 'rounded-lg';

  return (
    <div
      ref={wrapperRef}
      style={{
        minHeight: lazyVisibleOnly && !shouldRender ? Math.min(targetHeight, 540) : undefined,
        minWidth: lazyVisibleOnly && !shouldRender ? Math.min(targetWidth, 400) : undefined,
      }}
      className={`relative bg-white border overflow-hidden flex items-center justify-center shrink-0 ${roundedClass} ${
        theme === 'dark'
          ? 'border-zinc-700 shadow-2xl'
          : 'border-stone-300 shadow-[0_8px_24px_rgba(28,25,23,0.12)]'
      }`}
    >
      <canvas ref={canvasRef} style={filterStyle} className="block" />
      {/* Book Spine Gutter Shadow for Facing Spread */}
      {spineEdge === 'left-page' && (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-y-0 right-0 w-7 bg-gradient-to-l from-black/15 via-black/5 to-transparent"
        />
      )}
      {spineEdge === 'right-page' && (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-y-0 left-0 w-7 bg-gradient-to-r from-black/15 via-black/5 to-transparent"
        />
      )}
      {rendering && (
        <div className="absolute inset-0 bg-white/75 flex items-center justify-center">
          <Loader2 className="w-5 h-5 animate-spin text-[#1E3A8A]" />
        </div>
      )}
    </div>
  );
};

async function flattenPdfOutline(
  pdfDoc: pdfjsLib.PDFDocumentProxy,
): Promise<PdfOutlineNode[]> {
  try {
    const rawOutline = await pdfDoc.getOutline();
    if (!rawOutline || rawOutline.length === 0) return [];
    const results: PdfOutlineNode[] = [];
    let counter = 0;

    const resolvePage = async (dest: unknown): Promise<number | null> => {
      try {
        let destArr: unknown[] | null = null;
        if (typeof dest === 'string') {
          destArr = await pdfDoc.getDestination(dest);
        } else if (Array.isArray(dest)) {
          destArr = dest;
        }
        if (destArr && destArr[0]) {
          const idx = await pdfDoc.getPageIndex(
            destArr[0] as Parameters<pdfjsLib.PDFDocumentProxy['getPageIndex']>[0],
          );
          return idx + 1;
        }
      } catch {
        // ignore unresolvable outline destination
      }
      return null;
    };

    const walk = async (
      nodes: typeof rawOutline,
      level: number,
    ): Promise<void> => {
      for (const node of nodes) {
        if (results.length >= 120) break;
        const pageNumber = node.dest ? await resolvePage(node.dest) : null;
        results.push({
          id: `outline-${counter++}`,
          title: (node.title || '未命名章節').trim(),
          pageNumber,
          level,
        });
        if (node.items && node.items.length > 0 && level < 3) {
          await walk(node.items, level + 1);
        }
      }
    };

    await walk(rawOutline, 0);
    return results;
  } catch {
    return [];
  }
}

export const EbookViewerModal: React.FC<EbookViewerModalProps> = ({
  resource,
  initialPage = null,
  onClose,
  onOpenShareQr,
  hubShareUrl = '',
  renderNotes,
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const stageRef = useRef<HTMLDivElement | null>(null);
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const touchStartRef = useRef<{x: number; y: number} | null>(null);
  const pendingPageRef = useRef<number | null>(null);
  const pdfTextCacheRef = useRef<Map<number, string>>(new Map());
  const epubTextCacheRef = useRef<Map<number, string>>(new Map());

  const source = useMemo(
    () => resolveEbookSource(resource?.resourceUrl, resource?.title),
    [resource?.resourceUrl, resource?.title],
  );

  // Reading Theme & Layout states
  const [readingTheme, setReadingTheme] = useState<EbookReadingTheme>('paper');
  const [pdfLayout, setPdfLayout] = useState<PdfViewLayout>(() =>
    typeof window !== 'undefined' && window.innerWidth >= 1024
      ? 'spread'
      : 'single',
  );
  const [flipState, setFlipState] = useState<{
    dir: 'next' | 'prev' | 'none';
    key: number;
  }>({dir: 'none', key: 0});

  // PDF states
  const [pdfDoc, setPdfDoc] = useState<pdfjsLib.PDFDocumentProxy | null>(null);
  const [pdfOutline, setPdfOutline] = useState<PdfOutlineNode[]>([]);
  const [numPages, setNumPages] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageInput, setPageInput] = useState('1');
  const [pdfLoading, setPdfLoading] = useState(false);
  const [pdfLoadProgress, setPdfLoadProgress] = useState<{
    loaded: number;
    total: number;
  } | null>(null);
  const [queuedTargetPage, setQueuedTargetPage] = useState<number | null>(null);
  const [pdfCorsFallback, setPdfCorsFallback] = useState(false);
  const [pdfError, setPdfError] = useState<string | null>(null);
  const [zoomFactor, setZoomFactor] = useState(1);
  const [showSidebar, setShowSidebar] = useState(false);
  const [sidebarTab, setSidebarTab] = useState<SidebarTab>('thumbs');
  const [thumbs, setThumbs] = useState<Record<number, string>>({});
  const [stageSize, setStageSize] = useState({width: 960, height: 640});

  // Sidebar Quick TOC Navigation states
  const [tocGroupMode, setTocGroupMode] = useState<TocGroupMode>('order');
  const [tocFilterQuery, setTocFilterQuery] = useState('');
  const [activeStrandId, setActiveStrandId] = useState<string | null>(null);
  const [selectedTocId, setSelectedTocId] = useState<string | null>(null);
  const [iframeTargetPage, setIframeTargetPage] = useState<number | null>(null);

  // EPUB states
  const [epubBook, setEpubBook] = useState<LoadedEbookEpub | null>(null);
  const [epubLoading, setEpubLoading] = useState(false);
  const [epubError, setEpubError] = useState<string | null>(null);
  const [epubChapterIdx, setEpubChapterIdx] = useState(0);
  const [epubChapterSrcDoc, setEpubChapterSrcDoc] = useState('');
  const [epubChapterRendering, setEpubChapterRendering] = useState(false);

  // Markdown file states
  const [mdText, setMdText] = useState('');
  const [mdLoading, setMdLoading] = useState(false);
  const [mdError, setMdError] = useState<string | null>(null);

  // Typography font size for EPUB & Markdown
  const [readerFontSize, setReaderFontSize] = useState<15 | 18 | 21>(18);

  // HTML5 / iframe states
  const [iframeKey, setIframeKey] = useState(0);
  const [iframeLoading, setIframeLoading] = useState(true);

  // Search & Bookmarks & Drawers
  const [showSearchDrawer, setShowSearchDrawer] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [submittedSearchQuery, setSubmittedSearchQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [searchProgress, setSearchProgress] = useState('');
  const [searchHits, setSearchHits] = useState<SearchHitItem[]>([]);
  const [activeHitIdx, setActiveHitIdx] = useState(-1);

  const [bookmarks, setBookmarks] = useState<number[]>([]);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showNotesDrawer, setShowNotesDrawer] = useState(false);

  const activeMode: ViewerMode =
    source.mode === 'pdf' && pdfCorsFallback ? 'iframe' : source.mode;

  const mdHeadings = useMemo(
    () => (activeMode === 'markdown' && mdText ? extractMarkdownHeadings(mdText) : []),
    [activeMode, mdText],
  );

  const bookTocMeta = useMemo(
    () => resolveBookTocMeta(resource ?? null, pdfOutline),
    [resource, pdfOutline],
  );

  const hasRichChapterMetadata = useMemo(
    () => bookTocMeta.entries.some((entry) => Boolean(entry.grade || entry.category)),
    [bookTocMeta.entries],
  );

  const filteredTocEntries = useMemo(() => {
    let base = bookTocMeta.entries;
    if (activeStrandId && bookTocMeta.crossTopicStrands) {
      const strand = bookTocMeta.crossTopicStrands.find(
        (s) => s.id === activeStrandId,
      );
      if (strand) {
        const orderSet = new Set(strand.chapterOrders);
        base = base.filter((e) => e.order && orderSet.has(e.order));
      }
    }
    const q = tocFilterQuery.trim().toLowerCase();
    if (!q) return base;
    return base.filter((entry) => {
      const haystack = [
        entry.order || '',
        entry.title,
        entry.grade || '',
        entry.category || '',
        entry.designer || '',
        entry.resourceKind || '',
        entry.pageNote || '',
        entry.bookPageNote || '',
        String(entry.startPage),
      ]
        .join(' ')
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [bookTocMeta, activeStrandId, tocFilterQuery]);

  const groupedTocSections = useMemo(() => {
    if (!hasRichChapterMetadata || tocGroupMode === 'order') {
      return [
        {
          key: 'all',
          label: bookTocMeta.sourceLabel,
          description: undefined as string | undefined,
          entries: filteredTocEntries,
        },
      ];
    }

    const buckets = new Map<string, EbookTocEntry[]>();
    for (const entry of filteredTocEntries) {
      const rawKey =
        tocGroupMode === 'grade'
          ? entry.grade || '通用'
          : entry.category || '其他篇章';
      const list = buckets.get(rawKey);
      if (list) list.push(entry);
      else buckets.set(rawKey, [entry]);
    }

    if (tocGroupMode === 'grade') {
      const gradeOrder = [
        '通用',
        '一年級',
        '二年級',
        '三年級',
        '四年級',
        '五年級',
        '六年級',
      ];
      const orderedKeys = [
        ...gradeOrder.filter((g) => buckets.has(g)),
        ...Array.from(buckets.keys()).filter((k) => !gradeOrder.includes(k)),
      ];
      return orderedKeys.map((k) => ({
        key: `grade-${k}`,
        label: k === '通用' ? '導覽與通用索引' : k,
        description: undefined as string | undefined,
        entries: buckets.get(k) || [],
      }));
    }

    return Array.from(buckets.entries()).map(([cat, list]) => ({
      key: `cat-${cat}`,
      label: cat,
      description: bookTocMeta.categoryDescriptions?.[cat],
      entries: list,
    }));
  }, [hasRichChapterMetadata, tocGroupMode, filteredTocEntries, bookTocMeta]);

  // Load saved bookmarks for this resource
  useEffect(() => {
    if (!resource?.id || typeof window === 'undefined') {
      setBookmarks([]);
      return;
    }
    try {
      const raw = window.localStorage.getItem(`pesmath_ebook_bookmarks_${resource.id}`);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          setBookmarks(
            parsed.filter((n): n is number => typeof n === 'number' && n > 0),
          );
          return;
        }
      }
    } catch {
      // ignore localStorage read errors
    }
    setBookmarks([]);
  }, [resource?.id]);

  const persistBookmarks = useCallback(
    (next: number[]) => {
      setBookmarks(next);
      if (!resource?.id || typeof window === 'undefined') return;
      try {
        window.localStorage.setItem(
          `pesmath_ebook_bookmarks_${resource.id}`,
          JSON.stringify(next),
        );
      } catch {
        // ignore storage quota errors
      }
    },
    [resource?.id],
  );

  // Reset state when opening a new ebook resource
  useEffect(() => {
    if (!resource) return;
    const initialToc = resolveBookTocMeta(resource, []);
    const isDesktop =
      typeof window !== 'undefined' ? window.innerWidth >= 1024 : true;
    const shouldAutoOpenToc =
      initialToc.entries.length > 0 && isDesktop;

    const targetStartPage =
      initialPage && initialPage > 1 ? Math.floor(initialPage) : 1;
    const matchedInitialToc =
      targetStartPage > 1
        ? findActiveTocEntry(initialToc.entries, targetStartPage)
        : initialToc.entries[0] ?? null;

    setCurrentPage(targetStartPage);
    setPageInput(String(targetStartPage));
    pendingPageRef.current = targetStartPage > 1 ? targetStartPage : null;
    setQueuedTargetPage(targetStartPage > 1 ? targetStartPage : null);
    setPdfLoadProgress(null);
    setZoomFactor(1);
    setPdfCorsFallback(false);
    setPdfError(null);
    setPdfOutline([]);
    setThumbs({});
    setShowSidebar(shouldAutoOpenToc);
    setSidebarTab(initialToc.entries.length > 0 ? 'toc' : 'thumbs');
    setTocGroupMode('order');
    setTocFilterQuery('');
    setActiveStrandId(null);
    setSelectedTocId(matchedInitialToc?.id ?? null);
    setIframeTargetPage(targetStartPage > 1 ? targetStartPage : null);
    setShowNotesDrawer(false);
    setShowSearchDrawer(false);
    setSearchQuery('');
    setSubmittedSearchQuery('');
    setSearchHits([]);
    setActiveHitIdx(-1);
    setSearchProgress('');
    setFlipState({dir: 'none', key: 0});
    pdfTextCacheRef.current.clear();
    epubTextCacheRef.current.clear();
    setEpubBook(null);
    setEpubError(null);
    setEpubChapterIdx(0);
    setEpubChapterSrcDoc('');
    setMdText('');
    setMdError(null);
    setIframeKey((k) => k + 1);
    setIframeLoading(true);
  }, [resource?.id, resource?.resourceUrl, initialPage]);

  // Keep pageInput synced with currentPage
  useEffect(() => {
    setPageInput(String(currentPage));
  }, [currentPage]);

  // Safety timeout for iframe loading spinner
  useEffect(() => {
    if (!resource || activeMode !== 'iframe') return;
    setIframeLoading(true);
    const timer = window.setTimeout(() => {
      setIframeLoading(false);
    }, 3500);
    return () => window.clearTimeout(timer);
  }, [resource, activeMode, iframeKey]);

  // Track stage viewport dimensions for fit-to-screen PDF scaling
  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const updateSize = () => {
      const rect = el.getBoundingClientRect();
      if (rect.width > 120 && rect.height > 120) {
        setStageSize({width: rect.width, height: rect.height});
      }
    };
    updateSize();
    const observer = new ResizeObserver(updateSize);
    observer.observe(el);
    return () => observer.disconnect();
  }, [resource, showSidebar, showNotesDrawer, showSearchDrawer, activeMode]);

  // Load PDF document when in PDF mode (supports direct Drive CORS stream + authenticated Drive API + optional server proxy)
  useEffect(() => {
    if (!resource || source.mode !== 'pdf' || pdfCorsFallback) {
      setPdfDoc(null);
      setPdfOutline([]);
      setNumPages(0);
      setPdfLoading(false);
      setPdfLoadProgress(null);
      return;
    }

    let cancelled = false;
    let activeLoadingTask: pdfjsLib.PDFDocumentLoadingTask | null = null;
    setPdfLoading(true);
    setPdfLoadProgress(null);
    setPdfError(null);
    setPdfDoc(null);
    setPdfOutline([]);
    setNumPages(0);
    pdfTextCacheRef.current.clear();

    const cMapUrl = getPdfjsAssetBaseUrl('cmaps');
    const standardFontDataUrl = getPdfjsAssetBaseUrl('standard_fonts');

    const candidates: Array<{
      url: string;
      httpHeaders?: Record<string, string>;
    }> = [{url: source.embedUrl}];

    if (source.driveFileId) {
      const remoteDownloadUrl = `https://drive.usercontent.google.com/download?id=${encodeURIComponent(
        source.driveFileId,
      )}&export=download&confirm=t`;
      if (source.embedUrl !== remoteDownloadUrl) {
        candidates.push({url: remoteDownloadUrl});
      }
      const oauthToken = getAccessToken();
      if (oauthToken) {
        candidates.push({
          url: `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(
            source.driveFileId,
          )}?alt=media`,
          httpHeaders: {Authorization: `Bearer ${oauthToken}`},
        });
      }
      const isStaticGithubPages =
        typeof window !== 'undefined' &&
        window.location.hostname.toLowerCase().endsWith('github.io');
      if (!isStaticGithubPages) {
        candidates.push({
          url: `./api/drive-pdf/${encodeURIComponent(source.driveFileId)}`,
        });
      }
    }

    void (async () => {
      let loadedDoc: pdfjsLib.PDFDocumentProxy | null = null;
      let lastErr: unknown = null;

      for (const candidate of candidates) {
        if (cancelled) return;
        setPdfLoadProgress(null);
        const task = pdfjsLib.getDocument({
          url: candidate.url,
          httpHeaders: candidate.httpHeaders,
          cMapUrl,
          cMapPacked: true,
          standardFontDataUrl,
        });
        activeLoadingTask = task;

        task.onProgress = ({
          loaded,
          total,
        }: {
          loaded: number;
          total: number;
        }) => {
          if (cancelled) return;
          setPdfLoadProgress({loaded, total});
        };

        try {
          const doc = await task.promise;
          if (cancelled) {
            void doc.cleanup().catch(() => {});
            return;
          }
          loadedDoc = doc;
          break;
        } catch (err) {
          lastErr = err;
          void task.destroy().catch(() => {});
        }
      }

      if (cancelled) return;

      if (!loadedDoc) {
        console.warn(
          'PDF.js load failed across all candidates, switching to embedded frame fallback:',
          lastErr,
        );
        const errStatus = (lastErr as {status?: number})?.status;
        const errName = (lastErr as {name?: string})?.name || '';
        const isPermissionOrHtmlError =
          errStatus === 401 ||
          errStatus === 403 ||
          errName === 'InvalidPDFException';
        setPdfLoading(false);
        setPdfLoadProgress(null);
        setPdfCorsFallback(true);
        setPdfError(
          source.driveFileId
            ? isPermissionOrHtmlError
              ? '此雲端 PDF 尚未設為公開檢視或非標準 PDF 格式，已切換為 Google 雲端預覽框。'
              : '受限於手機或靜態網站對 Google 雲端硬碟的跨網域安全原則（CORP），目前改以 Google 雲端預覽框開啟；請直接於預覽框切換頁碼或點「另開檔案」。'
            : '無法透過輕量 Canvas 解析此遠端 PDF（可能受限於跨網域 CORS 設定），已自動切換為內嵌文件框預覽。',
        );
        return;
      }

      setPdfDoc(loadedDoc);
      setNumPages(loadedDoc.numPages);
      setPdfLoading(false);
      setPdfLoadProgress(null);

      const requestedPage = pendingPageRef.current;
      if (requestedPage !== null) {
        const clampedTarget = Math.max(
          1,
          Math.min(loadedDoc.numPages, requestedPage),
        );
        pendingPageRef.current = null;
        setQueuedTargetPage(null);
        setCurrentPage(clampedTarget);
        setPageInput(String(clampedTarget));
        window.setTimeout(() => {
          const targetEl = document.getElementById(
            `pdf-scroll-page-${clampedTarget}`,
          );
          targetEl?.scrollIntoView({behavior: 'smooth', block: 'start'});
        }, 80);
      }

      const outline = await flattenPdfOutline(loadedDoc);
      if (!cancelled) {
        setPdfOutline(outline);
        const mergedToc = resolveBookTocMeta(resource, outline);
        if (mergedToc.entries.length > 0) {
          setSidebarTab('toc');
          if (typeof window !== 'undefined' && window.innerWidth >= 1024) {
            setShowSidebar(true);
          }
        } else {
          setSidebarTab('thumbs');
        }
      }
    })();

    return () => {
      cancelled = true;
      if (activeLoadingTask) {
        void activeLoadingTask.destroy().catch(() => {});
      }
    };
  }, [
    resource,
    source.mode,
    source.embedUrl,
    source.driveFileId,
    pdfCorsFallback,
  ]);

  // Cleanup pdfDoc when replaced or unmounted
  useEffect(() => {
    return () => {
      if (pdfDoc) {
        void pdfDoc.cleanup().catch(() => {});
      }
    };
  }, [pdfDoc]);

  // Load EPUB archive when in EPUB mode
  useEffect(() => {
    if (!resource || source.mode !== 'epub') {
      setEpubBook(null);
      setEpubLoading(false);
      return;
    }

    let cancelled = false;
    const controller = new AbortController();
    setEpubLoading(true);
    setEpubError(null);
    epubTextCacheRef.current.clear();

    void (async () => {
      try {
        const res = await fetch(source.embedUrl, {signal: controller.signal});
        if (!res.ok) {
          throw new Error(`讀取 EPUB 檔案失敗 (HTTP ${res.status})`);
        }
        const buffer = await res.arrayBuffer();
        if (cancelled) return;
        const parsed = await parseEpubBuffer(buffer);
        if (cancelled) return;
        setEpubBook(parsed);
        setEpubChapterIdx(0);
        setShowSidebar(parsed.chapters.length > 1);
        setSidebarTab('toc');
        setEpubLoading(false);
      } catch (err: unknown) {
        if (cancelled || (err as {name?: string})?.name === 'AbortError') return;
        const msg =
          err instanceof Error
            ? err.message
            : '無法讀取此 EPUB 檔案，可能因跨網域 CORS 限制或檔案格式不完整。';
        setEpubError(msg);
        setEpubLoading(false);
      }
    })();

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [resource, source.mode, source.embedUrl]);

  // Render active EPUB chapter HTML with theme + search highlights
  useEffect(() => {
    if (!epubBook || activeMode !== 'epub') return;
    const chapter = epubBook.chapters[epubChapterIdx];
    if (!chapter) return;

    let cancelled = false;
    setEpubChapterRendering(true);

    void epubBook
      .renderChapterSrcDoc(chapter.href, readerFontSize, {
        theme: readingTheme,
        highlightQuery: submittedSearchQuery,
      })
      .then((srcDoc) => {
        if (cancelled) return;
        setEpubChapterSrcDoc(srcDoc);
        setEpubChapterRendering(false);
      })
      .catch(() => {
        if (!cancelled) {
          setEpubChapterRendering(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [
    epubBook,
    activeMode,
    epubChapterIdx,
    readerFontSize,
    readingTheme,
    submittedSearchQuery,
  ]);

  // Load Markdown file when in Markdown mode
  useEffect(() => {
    if (!resource || source.mode !== 'markdown') {
      setMdText('');
      setMdLoading(false);
      return;
    }

    let cancelled = false;
    const controller = new AbortController();
    setMdLoading(true);
    setMdError(null);

    void (async () => {
      try {
        const res = await fetch(source.embedUrl, {signal: controller.signal});
        if (!res.ok) {
          throw new Error(`讀取 Markdown 檔案失敗 (HTTP ${res.status})`);
        }
        const text = await res.text();
        if (cancelled) return;
        setMdText(text);
        setMdLoading(false);
      } catch (err: unknown) {
        if (cancelled || (err as {name?: string})?.name === 'AbortError') return;
        const msg =
          err instanceof Error
            ? err.message
            : '無法讀取此 Markdown 檔案（可能因跨網域 CORS 限制）。';
        setMdError(msg);
        setMdLoading(false);
      }
    })();

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [resource, source.mode, source.embedUrl]);

  // Lazy-render thumbnails only when thumbs sidebar tab is open in PDF mode
  useEffect(() => {
    if (
      !showSidebar ||
      sidebarTab !== 'thumbs' ||
      !pdfDoc ||
      activeMode !== 'pdf'
    ) {
      return;
    }
    let cancelled = false;

    void (async () => {
      for (let p = 1; p <= pdfDoc.numPages; p++) {
        if (cancelled) return;
        if (thumbs[p]) continue;
        try {
          const page = await pdfDoc.getPage(p);
          if (cancelled) return;
          const base = page.getViewport({scale: 1});
          const viewport = page.getViewport({scale: 360 / base.width});
          const canvas = document.createElement('canvas');
          canvas.width = Math.round(viewport.width);
          canvas.height = Math.round(viewport.height);
          const ctx =
            canvas.getContext('2d', {alpha: false}) || canvas.getContext('2d');
          if (!ctx) continue;
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(0, 0, canvas.width, canvas.height);
          await page.render({canvas, canvasContext: ctx, viewport}).promise;
          if (cancelled) return;
          const url = canvas.toDataURL('image/jpeg', 0.88);
          setThumbs((prev) => (prev[p] ? prev : {...prev, [p]: url}));
        } catch {
          // ignore thumbnail error
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [showSidebar, sidebarTab, pdfDoc, activeMode, thumbs]);

  // Track fullscreen state (native Fullscreen API + CSS expanded fallback)
  useEffect(() => {
    if (!resource) return;
    const onFsChange = () => {
      setIsFullscreen(Boolean(document.fullscreenElement));
    };
    document.addEventListener('fullscreenchange', onFsChange);
    return () => document.removeEventListener('fullscreenchange', onFsChange);
  }, [resource]);

  const handleClose = useCallback(() => {
    setIsFullscreen(false);
    if (document.fullscreenElement) {
      void document.exitFullscreen().catch(() => {});
    }
    onClose();
  }, [onClose]);

  const toggleFullscreen = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    if (document.fullscreenElement) {
      void document.exitFullscreen().catch(() => {});
      setIsFullscreen(false);
      return;
    }
    if (isFullscreen) {
      setIsFullscreen(false);
      return;
    }
    if (typeof el.requestFullscreen === 'function') {
      void el
        .requestFullscreen()
        .then(() => {
          setIsFullscreen(true);
        })
        .catch(() => {
          setIsFullscreen(true);
        });
    } else {
      setIsFullscreen(true);
    }
  }, [isFullscreen]);

  const canSpread =
    activeMode === 'pdf' && stageSize.width >= 768 && numPages > 1;
  const effectivePdfLayout: PdfViewLayout =
    pdfLayout === 'spread' && !canSpread ? 'single' : pdfLayout;
  const isSpreadActive = effectivePdfLayout === 'spread';
  const stepAmount = isSpreadActive ? 2 : 1;

  const goToPage = useCallback(
    (target: number) => {
      if (numPages <= 0) return;
      const clamped = Math.max(1, Math.min(numPages, target));
      if (effectivePdfLayout === 'scroll') {
        setCurrentPage(clamped);
        const targetEl = document.getElementById(`pdf-scroll-page-${clamped}`);
        targetEl?.scrollIntoView({behavior: 'smooth', block: 'start'});
        return;
      }
      if (clamped !== currentPage) {
        setFlipState((prev) => ({
          dir: clamped > currentPage ? 'next' : 'prev',
          key: prev.key + 1,
        }));
      }
      setCurrentPage(clamped);
    },
    [numPages, currentPage, effectivePdfLayout],
  );

  const goToEpubChapter = useCallback(
    (targetIdx: number) => {
      if (!epubBook) return;
      const clamped = Math.max(
        0,
        Math.min(epubBook.chapters.length - 1, targetIdx),
      );
      if (clamped !== epubChapterIdx) {
        setFlipState((prev) => ({
          dir: clamped > epubChapterIdx ? 'next' : 'prev',
          key: prev.key + 1,
        }));
      }
      setEpubChapterIdx(clamped);
    },
    [epubBook, epubChapterIdx],
  );

  const toggleCurrentBookmark = useCallback(() => {
    const unit =
      activeMode === 'pdf'
        ? currentPage
        : activeMode === 'epub'
          ? epubChapterIdx + 1
          : 0;
    if (unit <= 0) return;
    const exists = bookmarks.includes(unit);
    const next = exists
      ? bookmarks.filter((b) => b !== unit)
      : [...bookmarks, unit].sort((a, b) => a - b);
    persistBookmarks(next);
  }, [activeMode, currentPage, epubChapterIdx, bookmarks, persistBookmarks]);

  const jumpToSearchHit = useCallback(
    (hit: SearchHitItem, hitIndex: number) => {
      setActiveHitIdx(hitIndex);
      if (hit.targetType === 'pdf-page') {
        goToPage(hit.pageOrIndex);
      } else if (hit.targetType === 'epub-chapter') {
        goToEpubChapter(hit.pageOrIndex);
      } else if (hit.targetType === 'md-block' && hit.blockAnchorId) {
        const el = document.getElementById(hit.blockAnchorId);
        el?.scrollIntoView({behavior: 'smooth', block: 'center'});
      } else if (hit.targetType === 'notes') {
        setShowNotesDrawer(true);
      }
    },
    [goToPage, goToEpubChapter],
  );

  const runBookSearch = useCallback(
    async (rawQuery: string) => {
      const q = rawQuery.trim();
      setSubmittedSearchQuery(q);
      setActiveHitIdx(-1);
      if (!q) {
        setSearchHits([]);
        setSearchProgress('');
        return;
      }

      const lowerQ = q.toLowerCase();
      setIsSearching(true);
      setSearchHits([]);

      try {
        const hits: SearchHitItem[] = [];

        if (activeMode === 'pdf' && pdfDoc) {
          for (let p = 1; p <= pdfDoc.numPages; p++) {
            setSearchProgress(`正在搜尋第 ${p} / ${pdfDoc.numPages} 頁…`);
            let pageText = pdfTextCacheRef.current.get(p);
            if (pageText === undefined) {
              const page = await pdfDoc.getPage(p);
              const tc = await page.getTextContent();
              pageText = tc.items
                .map((item) => ('str' in item ? item.str : ''))
                .join(' ')
                .replace(/\s+/g, ' ')
                .trim();
              pdfTextCacheRef.current.set(p, pageText);
            }
            if (pageText.toLowerCase().includes(lowerQ)) {
              hits.push({
                id: `pdf-hit-${p}`,
                targetType: 'pdf-page',
                pageOrIndex: p,
                label: `第 ${p} 頁`,
                snippet: buildSnippet(pageText, q),
              });
            }
          }
        } else if (activeMode === 'epub' && epubBook) {
          for (let idx = 0; idx < epubBook.chapters.length; idx++) {
            const chap = epubBook.chapters[idx];
            setSearchProgress(
              `正在搜尋第 ${idx + 1} / ${epubBook.chapters.length} 章…`,
            );
            let chapText = epubTextCacheRef.current.get(idx);
            if (chapText === undefined) {
              chapText = await epubBook.getChapterPlainText(chap.href);
              epubTextCacheRef.current.set(idx, chapText);
            }
            if (chapText.toLowerCase().includes(lowerQ)) {
              hits.push({
                id: `epub-hit-${idx}`,
                targetType: 'epub-chapter',
                pageOrIndex: idx,
                label: `${chap.index + 1}. ${chap.title}`,
                snippet: buildSnippet(chapText, q),
              });
            }
          }
        } else if (activeMode === 'markdown' && mdText) {
          const lines = mdText.split(/\r?\n/);
          let currentHeading = '文件開頭';
          let headingCounter = 0;
          lines.forEach((rawLine, lineIdx) => {
            const trimmed = rawLine.trim();
            const headingMatch = trimmed.match(/^(#{1,3})\s+(.+)$/);
            if (headingMatch) {
              currentHeading = headingMatch[2].replace(/\s*#+\s*$/, '').trim();
              const headingAnchor = `md-heading-${headingCounter++}`;
              if (trimmed.toLowerCase().includes(lowerQ)) {
                hits.push({
                  id: `md-hit-${lineIdx}`,
                  targetType: 'md-block',
                  pageOrIndex: lineIdx,
                  label: currentHeading,
                  snippet: buildSnippet(currentHeading, q),
                  blockAnchorId: headingAnchor,
                });
              }
              return;
            }
            if (trimmed && trimmed.toLowerCase().includes(lowerQ)) {
              hits.push({
                id: `md-hit-${lineIdx}`,
                targetType: 'md-block',
                pageOrIndex: lineIdx,
                label: currentHeading,
                snippet: buildSnippet(trimmed, q),
                blockAnchorId: `md-line-${lineIdx}`,
              });
            }
          });
        }

        if (resource?.content && resource.content.toLowerCase().includes(lowerQ)) {
          hits.push({
            id: 'notes-hit',
            targetType: 'notes',
            pageOrIndex: 0,
            label: '教學導讀筆記',
            snippet: buildSnippet(resource.content, q),
          });
        }

        setSearchHits(hits);
        setSearchProgress('');
        if (hits.length > 0) {
          jumpToSearchHit(hits[0], 0);
        }
      } finally {
        setIsSearching(false);
      }
    },
    [activeMode, pdfDoc, epubBook, mdText, resource?.content, jumpToSearchHit],
  );

  // Keyboard navigation + Ctrl/Cmd+F search shortcut
  useEffect(() => {
    if (!resource) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'f') {
        e.preventDefault();
        setShowSearchDrawer(true);
        window.setTimeout(() => searchInputRef.current?.focus(), 40);
        return;
      }

      const target = e.target as HTMLElement | null;
      if (
        target?.tagName === 'INPUT' ||
        target?.tagName === 'TEXTAREA' ||
        target?.isContentEditable
      ) {
        return;
      }
      if (activeMode === 'pdf' && numPages > 0 && effectivePdfLayout !== 'scroll') {
        if (e.key === 'ArrowRight' || e.key === 'PageDown') {
          e.preventDefault();
          goToPage(currentPage + stepAmount);
        } else if (e.key === 'ArrowLeft' || e.key === 'PageUp') {
          e.preventDefault();
          goToPage(currentPage - stepAmount);
        }
      } else if (activeMode === 'epub' && epubBook && epubBook.chapters.length > 0) {
        if (e.key === 'ArrowRight' || e.key === 'PageDown') {
          e.preventDefault();
          goToEpubChapter(epubChapterIdx + 1);
        } else if (e.key === 'ArrowLeft' || e.key === 'PageUp') {
          e.preventDefault();
          goToEpubChapter(epubChapterIdx - 1);
        }
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [
    resource,
    activeMode,
    effectivePdfLayout,
    numPages,
    currentPage,
    stepAmount,
    goToPage,
    epubBook,
    epubChapterIdx,
    goToEpubChapter,
  ]);

  const secondPage =
    isSpreadActive && currentPage + 1 <= numPages ? currentPage + 1 : null;
  const hasStructuredToc = bookTocMeta.entries.length > 0;

  const activeTocEntry = useMemo(() => {
    if (!hasStructuredToc) return null;
    if (activeMode === 'pdf' && numPages > 0) {
      return findActiveTocEntry(bookTocMeta.entries, currentPage, secondPage);
    }
    return (
      bookTocMeta.entries.find((e) => e.id === selectedTocId) ||
      bookTocMeta.entries[0] ||
      null
    );
  }, [
    hasStructuredToc,
    activeMode,
    numPages,
    bookTocMeta.entries,
    currentPage,
    secondPage,
    selectedTocId,
  ]);

  const resolvedIframeSrc = useMemo(() => {
    const baseIframeUrl = source.fallbackPreviewUrl || source.embedUrl;
    if (activeMode !== 'iframe' || !baseIframeUrl) return baseIframeUrl;
    if (source.driveFileId) return baseIframeUrl;
    if (!iframeTargetPage || iframeTargetPage <= 0) return baseIframeUrl;
    const baseWithoutHash = baseIframeUrl.split('#')[0];
    return `${baseWithoutHash}#page=${iframeTargetPage}`;
  }, [
    activeMode,
    source.embedUrl,
    source.fallbackPreviewUrl,
    source.driveFileId,
    iframeTargetPage,
  ]);

  if (!resource) return null;

  const isDark = readingTheme === 'dark';

  const horizontalPadding = isSpreadActive
    ? 88
    : stageSize.width < 640
      ? 18
      : 56;
  const verticalPadding = stageSize.width < 640 ? 20 : 40;
  const pageTargetWidth = isSpreadActive
    ? Math.max(220, (stageSize.width - horizontalPadding - 12) / 2)
    : Math.max(240, stageSize.width - horizontalPadding);
  const pageTargetHeight =
    effectivePdfLayout === 'scroll'
      ? Math.max(360, stageSize.height - 24)
      : Math.max(280, stageSize.height - verticalPadding);

  const handlePageInputSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = parseInt(pageInput, 10);
    if (!Number.isNaN(parsed)) {
      goToPage(parsed);
    } else {
      setPageInput(String(currentPage));
    }
  };

  const resolvedMdBaseUrl =
    activeMode === 'markdown' && source.embedUrl && typeof window !== 'undefined'
      ? new URL(source.embedUrl, window.location.href).toString()
      : undefined;

  const activeTocIndex = activeTocEntry
    ? bookTocMeta.entries.findIndex((e) => e.id === activeTocEntry.id)
    : -1;

  const handleSelectTocEntry = (entry: EbookTocEntry) => {
    setSelectedTocId(entry.id);
    if (activeMode === 'pdf') {
      if (numPages > 0) {
        pendingPageRef.current = null;
        setQueuedTargetPage(null);
        goToPage(entry.startPage);
      } else {
        pendingPageRef.current = entry.startPage;
        setQueuedTargetPage(entry.startPage);
      }
    } else if (activeMode === 'iframe') {
      setIframeTargetPage(entry.startPage);
      if (!source.driveFileId) {
        setIframeLoading(true);
        setIframeKey((k) => k + 1);
      }
    } else if (activeMode === 'notes-only') {
      const topCard = document.getElementById('notes-selected-chapter-card');
      topCard?.scrollIntoView({behavior: 'smooth', block: 'nearest'});
    }
    if (typeof window !== 'undefined' && window.innerWidth < 768) {
      setShowSidebar(false);
    }
  };

  const showTocButton =
    hasStructuredToc ||
    (activeMode === 'pdf' && numPages > 0) ||
    (activeMode === 'epub' && Boolean(epubBook && epubBook.chapters.length > 0)) ||
    (activeMode === 'markdown' && mdHeadings.length > 0);

  const canBookmark =
    (activeMode === 'pdf' && numPages > 0) ||
    (activeMode === 'epub' && Boolean(epubBook && epubBook.chapters.length > 0));
  const currentUnitNumber =
    activeMode === 'pdf'
      ? currentPage
      : activeMode === 'epub'
        ? epubChapterIdx + 1
        : 0;
  const isCurrentBookmarked =
    canBookmark && bookmarks.includes(currentUnitNumber);

  const canSearchContent =
    (activeMode === 'pdf' && numPages > 0) ||
    (activeMode === 'epub' && Boolean(epubBook)) ||
    (activeMode === 'markdown' && Boolean(mdText)) ||
    Boolean(resource.content);

  const totalUnits =
    activeMode === 'pdf'
      ? numPages
      : activeMode === 'epub' && epubBook
        ? epubBook.chapters.length
        : 0;
  const progressPercent =
    totalUnits > 0 ? Math.round((currentUnitNumber / totalUnits) * 100) : 0;

  const isPrevDisabled =
    activeMode === 'pdf' ? currentPage <= 1 : epubChapterIdx <= 0;
  const isNextDisabled =
    activeMode === 'pdf'
      ? isSpreadActive
        ? currentPage + 1 >= numPages
        : currentPage >= numPages
      : !epubBook || epubChapterIdx >= epubBook.chapters.length - 1;

  const flipAnimationClass =
    flipState.dir === 'next'
      ? 'animate-book-flip-next'
      : flipState.dir === 'prev'
        ? 'animate-book-flip-prev'
        : '';

  const stageBgClass =
    readingTheme === 'dark'
      ? 'bg-[#141417]'
      : readingTheme === 'sepia'
        ? 'bg-[#EAE0CC]'
        : 'bg-[#EFECE6]';

  const chromeBgClass = isDark
    ? 'bg-zinc-900 border-zinc-800 text-stone-100'
    : readingTheme === 'sepia'
      ? 'bg-[#FBF5E6] border-[#DFD2B5] text-stone-900'
      : 'bg-white border-stone-200 text-stone-900';

  const subtlePanelClass = isDark
    ? 'bg-zinc-800 border-zinc-700 text-stone-200'
    : 'bg-[#F7F4EE] border-stone-200 text-stone-700';

  const btnNeutralClass = isDark
    ? 'bg-zinc-800 border-zinc-700 text-stone-200 hover:bg-zinc-700'
    : 'bg-white border-stone-200 text-stone-700 hover:bg-stone-50';

  const handleStageTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length !== 1) {
      touchStartRef.current = null;
      return;
    }
    touchStartRef.current = {
      x: e.touches[0].clientX,
      y: e.touches[0].clientY,
    };
  };

  const handleStageTouchEnd = (e: React.TouchEvent) => {
    const start = touchStartRef.current;
    touchStartRef.current = null;
    if (!start || e.changedTouches.length !== 1) return;
    if (effectivePdfLayout === 'scroll' && activeMode === 'pdf') return;
    const viewportZoomed =
      typeof window !== 'undefined' &&
      (window.visualViewport?.scale ?? 1) > 1.05;
    if ((activeMode === 'pdf' && zoomFactor > 1.05) || viewportZoomed) return;
    const dx = e.changedTouches[0].clientX - start.x;
    const dy = e.changedTouches[0].clientY - start.y;
    if (Math.abs(dx) < 52 || Math.abs(dx) < Math.abs(dy) * 1.4) return;
    if (dx < 0 && !isNextDisabled) {
      if (activeMode === 'pdf') goToPage(currentPage + stepAmount);
      else if (activeMode === 'epub') goToEpubChapter(epubChapterIdx + 1);
    } else if (dx > 0 && !isPrevDisabled) {
      if (activeMode === 'pdf') goToPage(currentPage - stepAmount);
      else if (activeMode === 'epub') goToEpubChapter(epubChapterIdx - 1);
    }
  };

  return (
    <div
      ref={containerRef}
      className={`fixed inset-0 flex flex-col overflow-hidden ${
        isDark ? 'bg-zinc-950' : 'bg-[#FBF9F5]'
      } ${isFullscreen ? 'z-[80]' : 'z-50'}`}
      role="dialog"
      aria-modal="true"
      aria-labelledby="ebook-viewer-title"
    >
      {/* Top Reader Control Bar */}
      <header className={`border-b px-3 sm:px-5 py-2 shrink-0 ${chromeBgClass}`}>
        <div className="max-w-[1440px] mx-auto flex flex-wrap items-center justify-between gap-2">
          {/* Left: Back + Title + Clean Unboxed Metadata */}
          <div className="flex items-center gap-2.5 min-w-0">
            <button
              type="button"
              onClick={handleClose}
              className={`min-h-[38px] px-3 py-1.5 text-xs sm:text-sm font-medium border rounded-lg inline-flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0 ${subtlePanelClass}`}
            >
              <ArrowLeft className="w-4 h-4" />
              <span className="hidden sm:inline">返回資源列表</span>
              <span className="sm:hidden">返回</span>
            </button>

            <div className="min-w-0">
              <div className="flex items-center gap-2 min-w-0">
                <BookOpen
                  className={`w-4 h-4 shrink-0 hidden sm:block ${
                    isDark ? 'text-blue-400' : 'text-[#1E3A8A]'
                  }`}
                />
                <h2
                  id="ebook-viewer-title"
                  className={`font-editorial text-sm sm:text-base font-bold truncate max-w-[160px] sm:max-w-[280px] lg:max-w-[360px] ${
                    isDark ? 'text-white' : 'text-stone-950'
                  }`}
                >
                  {resource.title}
                </h2>
              </div>
              <div
                className={`hidden md:flex items-center gap-1.5 text-xs ${
                  isDark ? 'text-stone-400' : 'text-stone-500'
                }`}
              >
                <span
                  className={`font-semibold ${
                    isDark ? 'text-blue-400' : 'text-[#1E3A8A]'
                  }`}
                >
                  {source.formatLabel}
                </span>
                <span aria-hidden="true">·</span>
                <span>{resource.gradeBand}</span>
                {activeMode === 'pdf' && numPages > 0 && (
                  <>
                    <span aria-hidden="true">·</span>
                    <span className="font-mono-tabular">共 {numPages} 頁</span>
                  </>
                )}
                {activeMode === 'epub' && epubBook && (
                  <>
                    <span aria-hidden="true">·</span>
                    <span className="font-mono-tabular">
                      共 {epubBook.chapters.length} 章
                    </span>
                  </>
                )}
              </div>
            </div>
          </div>

          {/* Center / Right Controls */}
          <div className="flex flex-wrap items-center gap-1.5">
            {/* TOC / Sidebar toggle */}
            {showTocButton && (
              <button
                type="button"
                onClick={() => setShowSidebar((v) => !v)}
                className={`min-h-[38px] px-2.5 py-1.5 text-xs font-medium rounded-lg border inline-flex items-center gap-1.5 transition-colors whitespace-nowrap ${
                  showSidebar
                    ? 'bg-[#1E3A8A] text-white border-[#1E3A8A]'
                    : btnNeutralClass
                }`}
                title="開啟或關閉目錄 / 縮圖 / 書籤"
              >
                {activeMode === 'pdf' ? (
                  <PanelLeft className="w-3.5 h-3.5 shrink-0" />
                ) : (
                  <List className="w-3.5 h-3.5 shrink-0" />
                )}
                <span className="hidden lg:inline">目錄</span>
              </button>
            )}

            {/* Full-Text Search Button */}
            {canSearchContent && (
              <button
                type="button"
                onClick={() => {
                  setShowSearchDrawer((prev) => {
                    const next = !prev;
                    if (next) {
                      window.setTimeout(() => searchInputRef.current?.focus(), 40);
                    }
                    return next;
                  });
                }}
                className={`min-h-[38px] px-2.5 py-1.5 text-xs font-medium rounded-lg border inline-flex items-center gap-1.5 transition-colors whitespace-nowrap ${
                  showSearchDrawer
                    ? 'bg-[#1E3A8A] text-white border-[#1E3A8A]'
                    : btnNeutralClass
                }`}
                title="全文關鍵字查詢 (Ctrl+F)"
              >
                <Search className="w-3.5 h-3.5 shrink-0" />
                <span className="hidden sm:inline">查詢</span>
              </button>
            )}

            {/* PDF Reading Style (Single / Spread Book / Continuous Scroll) + Zoom */}
            {activeMode === 'pdf' && numPages > 0 && (
              <>
                <div
                  className={`flex items-center gap-0.5 p-0.5 border rounded-lg ${subtlePanelClass}`}
                  role="group"
                  aria-label="電子書展示樣式"
                >
                  <button
                    type="button"
                    onClick={() => setPdfLayout('single')}
                    className={`min-h-[32px] px-2 py-1 text-xs font-medium rounded-md inline-flex items-center gap-1 transition-colors whitespace-nowrap ${
                      effectivePdfLayout === 'single'
                        ? isDark
                          ? 'bg-zinc-950 text-blue-300 font-semibold'
                          : 'bg-white text-[#1E3A8A] font-semibold shadow-2xs'
                        : isDark
                          ? 'text-stone-300 hover:text-white'
                          : 'text-stone-600 hover:text-stone-950'
                    }`}
                    title="單頁翻頁閱讀"
                  >
                    <Square className="w-3.5 h-3.5" />
                    <span className="hidden md:inline">單頁</span>
                  </button>
                  {canSpread && (
                    <button
                      type="button"
                      onClick={() => setPdfLayout('spread')}
                      className={`min-h-[32px] px-2 py-1 text-xs font-medium rounded-md inline-flex items-center gap-1 transition-colors whitespace-nowrap ${
                        effectivePdfLayout === 'spread'
                          ? isDark
                            ? 'bg-zinc-950 text-blue-300 font-semibold'
                            : 'bg-white text-[#1E3A8A] font-semibold shadow-2xs'
                          : isDark
                            ? 'text-stone-300 hover:text-white'
                            : 'text-stone-600 hover:text-stone-950'
                      }`}
                      title="雙頁書本翻頁模式"
                    >
                      <Columns2 className="w-3.5 h-3.5" />
                      <span className="hidden md:inline">雙頁</span>
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setPdfLayout('scroll')}
                    className={`min-h-[32px] px-2 py-1 text-xs font-medium rounded-md inline-flex items-center gap-1 transition-colors whitespace-nowrap ${
                      effectivePdfLayout === 'scroll'
                        ? isDark
                          ? 'bg-zinc-950 text-blue-300 font-semibold'
                          : 'bg-white text-[#1E3A8A] font-semibold shadow-2xs'
                        : isDark
                          ? 'text-stone-300 hover:text-white'
                          : 'text-stone-600 hover:text-stone-950'
                    }`}
                    title="連續直向捲動閱讀"
                  >
                    <Rows3 className="w-3.5 h-3.5" />
                    <span className="hidden md:inline">捲動</span>
                  </button>
                </div>

                {/* Zoom controls */}
                <div
                  className={`flex items-center gap-0.5 p-0.5 border rounded-lg ${subtlePanelClass}`}
                >
                  <button
                    type="button"
                    disabled={zoomFactor <= 0.75}
                    onClick={() =>
                      setZoomFactor((z) =>
                        Math.max(0.75, +(z - 0.25).toFixed(2)),
                      )
                    }
                    aria-label="縮小"
                    className="min-h-[32px] min-w-[30px] sm:min-w-[32px] rounded-md hover:bg-black/5 disabled:opacity-35 inline-flex items-center justify-center"
                  >
                    <ZoomOut className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setZoomFactor(1)}
                    title="重設為自動適應視窗大小"
                    className="min-h-[32px] px-1.5 sm:px-2 text-xs font-mono-tabular font-medium hover:bg-black/5 rounded-md whitespace-nowrap"
                  >
                    {Math.round(zoomFactor * 100)}%
                  </button>
                  <button
                    type="button"
                    disabled={zoomFactor >= 3}
                    onClick={() =>
                      setZoomFactor((z) =>
                        Math.min(3, +(z + 0.25).toFixed(2)),
                      )
                    }
                    aria-label="放大"
                    className="min-h-[32px] min-w-[30px] sm:min-w-[32px] rounded-md hover:bg-black/5 disabled:opacity-35 inline-flex items-center justify-center"
                  >
                    <ZoomIn className="w-3.5 h-3.5" />
                  </button>
                </div>
              </>
            )}

            {/* Font size selector for EPUB and Markdown books */}
            {((activeMode === 'epub' && epubBook) ||
              (activeMode === 'markdown' && mdText)) && (
              <div
                className={`hidden sm:flex items-center gap-0.5 p-0.5 border rounded-lg ${subtlePanelClass}`}
                role="group"
                aria-label="閱讀字級調整"
              >
                <span className="px-1.5 opacity-60">
                  <Type className="w-3.5 h-3.5" />
                </span>
                {(
                  [
                    {size: 15, label: '小'},
                    {size: 18, label: '中'},
                    {size: 21, label: '大'},
                  ] as const
                ).map((opt) => (
                  <button
                    key={opt.size}
                    type="button"
                    onClick={() => setReaderFontSize(opt.size)}
                    className={`min-h-[32px] px-2 text-xs rounded-md transition-colors ${
                      readerFontSize === opt.size
                        ? isDark
                          ? 'bg-zinc-950 text-blue-300 font-semibold'
                          : 'bg-white text-[#1E3A8A] font-semibold shadow-2xs'
                        : ''
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            )}

            {/* Reading Theme Switcher (Paper / Sepia / Night) */}
            {activeMode !== 'notes-only' && (
              <div
                className={`flex items-center gap-0.5 p-0.5 border rounded-lg ${subtlePanelClass}`}
                role="group"
                aria-label="閱讀色調主題"
              >
                <button
                  type="button"
                  onClick={() => setReadingTheme('paper')}
                  title="米白紙本樣式"
                  aria-label="米白紙本樣式"
                  className={`min-h-[32px] px-2 py-1 text-xs rounded-md inline-flex items-center gap-1 transition-colors whitespace-nowrap ${
                    readingTheme === 'paper'
                      ? isDark
                        ? 'bg-zinc-950 text-blue-300 font-semibold'
                        : 'bg-white text-[#1E3A8A] font-semibold shadow-2xs'
                      : ''
                  }`}
                >
                  <Sun className="w-3.5 h-3.5" />
                  <span className="hidden xl:inline">紙本</span>
                </button>
                <button
                  type="button"
                  onClick={() => setReadingTheme('sepia')}
                  title="暖黃護眼樣式"
                  aria-label="暖黃護眼樣式"
                  className={`min-h-[32px] px-2 py-1 text-xs rounded-md inline-flex items-center gap-1 transition-colors whitespace-nowrap ${
                    readingTheme === 'sepia'
                      ? 'bg-[#FBF5E6] text-[#7C2D12] font-semibold shadow-2xs'
                      : ''
                  }`}
                >
                  <span className="w-3 h-3 rounded-full bg-[#E6D3A7] border border-amber-700/40 shrink-0" />
                  <span className="hidden xl:inline">護眼</span>
                </button>
                <button
                  type="button"
                  onClick={() => setReadingTheme('dark')}
                  title="夜間深色樣式"
                  aria-label="夜間深色樣式"
                  className={`min-h-[32px] px-2 py-1 text-xs rounded-md inline-flex items-center gap-1 transition-colors whitespace-nowrap ${
                    readingTheme === 'dark'
                      ? 'bg-zinc-950 text-blue-300 font-semibold shadow-2xs'
                      : ''
                  }`}
                >
                  <Moon className="w-3.5 h-3.5" />
                  <span className="hidden xl:inline">夜間</span>
                </button>
              </div>
            )}

            {/* Bookmark Toggle */}
            {canBookmark && (
              <button
                type="button"
                onClick={toggleCurrentBookmark}
                className={`min-h-[38px] min-w-[38px] px-2.5 py-1.5 text-xs font-medium rounded-lg border inline-flex items-center justify-center gap-1 transition-colors whitespace-nowrap ${
                  isCurrentBookmarked
                    ? 'bg-amber-600 text-white border-amber-600'
                    : btnNeutralClass
                }`}
                title={isCurrentBookmarked ? '移除此頁書籤' : '將目前頁面加入書籤'}
                aria-label={isCurrentBookmarked ? '移除書籤' : '加入書籤'}
              >
                <Bookmark
                  className="w-3.5 h-3.5 shrink-0"
                  fill={isCurrentBookmarked ? 'currentColor' : 'none'}
                />
              </button>
            )}

            {/* HTML5 / iframe reload button */}
            {activeMode === 'iframe' && (
              <button
                type="button"
                onClick={() => {
                  setIframeLoading(true);
                  setIframeKey((k) => k + 1);
                }}
                className={`min-h-[38px] px-2.5 py-1.5 text-xs font-medium border rounded-lg inline-flex items-center gap-1.5 whitespace-nowrap ${btnNeutralClass}`}
                title="重新載入電子書頁面"
              >
                <RotateCcw className="w-3.5 h-3.5 shrink-0" />
                <span className="hidden lg:inline">重載</span>
              </button>
            )}

            {/* Teaching Notes Toggle */}
            {resource.content && activeMode !== 'notes-only' && (
              <button
                type="button"
                onClick={() => setShowNotesDrawer((v) => !v)}
                className={`min-h-[38px] px-2.5 py-1.5 text-xs font-medium rounded-lg border inline-flex items-center gap-1.5 transition-colors whitespace-nowrap ${
                  showNotesDrawer
                    ? 'bg-[#1E3A8A] text-white border-[#1E3A8A]'
                    : btnNeutralClass
                }`}
              >
                <StickyNote className="w-3.5 h-3.5 shrink-0" />
                <span className="hidden xl:inline">教學導讀</span>
              </button>
            )}

            {/* Fullscreen toggle */}
            <button
              type="button"
              onClick={toggleFullscreen}
              className={`inline-flex min-h-[38px] px-2.5 py-1.5 text-xs font-medium rounded-lg border items-center gap-1.5 whitespace-nowrap transition-colors ${
                isFullscreen
                  ? 'bg-[#1E3A8A] text-white border-[#1E3A8A]'
                  : btnNeutralClass
              }`}
              title={isFullscreen ? '退出全螢幕' : '全螢幕閱讀'}
              aria-pressed={isFullscreen}
            >
              {isFullscreen ? (
                <Minimize2 className="w-3.5 h-3.5 shrink-0" />
              ) : (
                <Maximize2 className="w-3.5 h-3.5 shrink-0" />
              )}
              <span className="hidden xl:inline">
                {isFullscreen ? '退出' : '全螢幕'}
              </span>
            </button>

            {/* Share QR */}
            {onOpenShareQr && (
              <button
                type="button"
                onClick={() =>
                  onOpenShareQr(source.rawUrl || hubShareUrl, resource.title)
                }
                className={`min-h-[38px] min-w-[38px] px-2.5 py-1.5 text-xs font-medium border rounded-lg inline-flex items-center justify-center ${btnNeutralClass}`}
                title="分享資源 QR Code"
                aria-label="分享資源 QR Code"
              >
                <QrCode className="w-3.5 h-3.5" />
              </button>
            )}

            {/* Direct Download button */}
            {source.downloadUrl && (
              <a
                href={source.downloadUrl}
                target="_blank"
                rel="noopener noreferrer"
                download={
                  source.downloadExt
                    ? `${resource.title}.${source.downloadExt}`
                    : undefined
                }
                className="min-h-[38px] px-2.5 py-1.5 text-xs font-semibold text-white bg-[#1E3A8A] rounded-lg hover:bg-[#172554] inline-flex items-center gap-1.5 whitespace-nowrap transition-colors"
                title={`下載原檔 (.${source.downloadExt || 'file'})`}
              >
                <Download className="w-3.5 h-3.5 shrink-0" />
                <span className="hidden sm:inline">下載</span>
              </a>
            )}

            {/* External Fallback */}
            {source.rawUrl && (!source.downloadUrl || activeMode === 'iframe') && (
              <a
                href={source.rawUrl}
                target="_blank"
                rel="noopener noreferrer"
                className={`min-h-[38px] px-2.5 py-1.5 text-xs font-medium border rounded-lg inline-flex items-center gap-1.5 whitespace-nowrap ${btnNeutralClass}`}
                title="於新分頁開啟原始頁面"
              >
                <ExternalLink className="w-3.5 h-3.5 shrink-0" />
                <span className="hidden lg:inline">另開</span>
              </a>
            )}

            <button
              type="button"
              onClick={handleClose}
              className={`min-h-[38px] min-w-[38px] p-1.5 rounded-lg inline-flex items-center justify-center ${
                isDark
                  ? 'text-stone-400 hover:text-white hover:bg-zinc-800'
                  : 'text-stone-500 hover:text-stone-900 hover:bg-stone-100'
              }`}
              aria-label="關閉電子書檢視器"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>
      </header>

      {/* Main Reader Body */}
      <div className="flex-1 min-h-0 flex overflow-hidden relative">
        {/* Mobile Sidebar Backdrop */}
        {showSidebar && showTocButton && (
          <div
            aria-hidden="true"
            onClick={() => setShowSidebar(false)}
            className="absolute inset-0 z-20 bg-stone-950/35 md:hidden"
          />
        )}

        {/* Left Sidebar: Quick Chapter TOC / Thumbnails / Bookmarks */}
        {showSidebar && showTocButton && (
          <aside
            aria-label="電子書快速目錄導航"
            className={`absolute inset-y-0 left-0 z-30 w-[85vw] max-w-[330px] md:static md:w-72 lg:w-80 shrink-0 border-r flex flex-col overflow-hidden shadow-xl md:shadow-none ${chromeBgClass}`}
          >
            {/* Sidebar Tab Switcher */}
            <div
              className={`p-2 border-b flex items-center gap-1 shrink-0 ${
                isDark ? 'border-zinc-800' : 'border-stone-200'
              }`}
            >
              <button
                type="button"
                onClick={() => setSidebarTab('toc')}
                className={`flex-1 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                  sidebarTab === 'toc'
                    ? 'bg-[#1E3A8A] text-white'
                    : isDark
                      ? 'text-stone-300 hover:bg-zinc-800'
                      : 'text-stone-600 hover:bg-[#F7F4EE]'
                }`}
              >
                {activeMode === 'epub'
                  ? '章節'
                  : activeMode === 'markdown'
                    ? '大綱'
                    : hasStructuredToc
                      ? `快速目錄 (${bookTocMeta.entries.length})`
                      : '目錄'}
              </button>
              {activeMode === 'pdf' && (
                <button
                  type="button"
                  onClick={() => setSidebarTab('thumbs')}
                  className={`flex-1 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                    sidebarTab === 'thumbs'
                      ? 'bg-[#1E3A8A] text-white'
                      : isDark
                        ? 'text-stone-300 hover:bg-zinc-800'
                        : 'text-stone-600 hover:bg-[#F7F4EE]'
                  }`}
                >
                  縮圖
                </button>
              )}
              {canBookmark && (
                <button
                  type="button"
                  onClick={() => setSidebarTab('bookmarks')}
                  className={`flex-1 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                    sidebarTab === 'bookmarks'
                      ? 'bg-[#1E3A8A] text-white'
                      : isDark
                        ? 'text-stone-300 hover:bg-zinc-800'
                        : 'text-stone-600 hover:bg-[#F7F4EE]'
                  }`}
                >
                  書籤 ({bookmarks.length})
                </button>
              )}
              <button
                type="button"
                onClick={() => setShowSidebar(false)}
                aria-label="收合側邊目錄"
                className="md:hidden min-h-[30px] min-w-[30px] inline-flex items-center justify-center rounded-md opacity-70 hover:opacity-100"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Quick Chapter Filter & Grouping Controls for Structured / PDF TOC */}
            {sidebarTab === 'toc' &&
              (hasStructuredToc || activeMode === 'pdf') &&
              (activeMode === 'pdf' ||
                activeMode === 'iframe' ||
                activeMode === 'notes-only') && (
                <div
                  className={`p-2.5 border-b space-y-2 shrink-0 ${
                    isDark ? 'border-zinc-800' : 'border-stone-200'
                  }`}
                >
                  {hasStructuredToc && (
                    <div className="relative">
                      <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 opacity-50 pointer-events-none" />
                      <input
                        type="text"
                        value={tocFilterQuery}
                        onChange={(e) => setTocFilterQuery(e.target.value)}
                        placeholder="篩選章節、年級、主題或頁碼…"
                        aria-label="篩選快速目錄"
                        className={`w-full pl-8 pr-7 py-1.5 text-xs border rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1E3A8A] ${
                          isDark
                            ? 'bg-zinc-800 border-zinc-700 text-white placeholder:text-stone-400'
                            : 'bg-[#FBF9F5] border-stone-300 text-stone-900 placeholder:text-stone-400'
                        }`}
                      />
                      {tocFilterQuery && (
                        <button
                          type="button"
                          onClick={() => setTocFilterQuery('')}
                          aria-label="清除目錄篩選"
                          className="absolute right-2 top-1/2 -translate-y-1/2 opacity-55 hover:opacity-100"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  )}

                  {hasRichChapterMetadata && (
                    <div
                      className={`grid grid-cols-3 gap-0.5 p-0.5 border rounded-lg ${subtlePanelClass}`}
                      role="group"
                      aria-label="目錄分群檢視方式"
                    >
                      {(
                        [
                          {id: 'order', label: '原書次序'},
                          {id: 'grade', label: '依年級'},
                          {id: 'category', label: '依篇別'},
                        ] as const
                      ).map((opt) => (
                        <button
                          key={opt.id}
                          type="button"
                          onClick={() => setTocGroupMode(opt.id)}
                          className={`py-1 text-[11px] font-medium rounded-md transition-colors whitespace-nowrap ${
                            tocGroupMode === opt.id
                              ? isDark
                                ? 'bg-zinc-950 text-blue-300 font-semibold'
                                : 'bg-white text-[#1E3A8A] font-semibold shadow-2xs'
                              : isDark
                                ? 'text-stone-300 hover:text-white'
                                : 'text-stone-600 hover:text-stone-950'
                          }`}
                        >
                          {opt.label}
                        </button>
                      ))}
                    </div>
                  )}

                  {bookTocMeta.crossTopicStrands &&
                    bookTocMeta.crossTopicStrands.length > 0 && (
                      <div className="space-y-1">
                        <div className="flex items-center justify-between text-[11px] opacity-70 px-0.5">
                          <span>跨年級備課脈絡</span>
                          {activeStrandId && (
                            <button
                              type="button"
                              onClick={() => setActiveStrandId(null)}
                              className="text-[#1E3A8A] dark:text-blue-300 hover:underline font-medium"
                            >
                              顯示全部
                            </button>
                          )}
                        </div>
                        <div className="flex flex-wrap gap-1">
                          {bookTocMeta.crossTopicStrands.map((strand) => {
                            const selected = activeStrandId === strand.id;
                            return (
                              <button
                                key={strand.id}
                                type="button"
                                title={strand.description}
                                onClick={() =>
                                  setActiveStrandId((prev) =>
                                    prev === strand.id ? null : strand.id,
                                  )
                                }
                                className={`px-2 py-1 text-[11px] rounded-md border transition-colors whitespace-nowrap ${
                                  selected
                                    ? 'bg-[#1E3A8A] text-white border-[#1E3A8A] font-semibold'
                                    : isDark
                                      ? 'bg-zinc-800 border-zinc-700 text-stone-200 hover:border-zinc-500'
                                      : 'bg-white border-stone-200 text-stone-700 hover:border-stone-400'
                                }`}
                              >
                                {strand.label}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    )}
                </div>
              )}

            {/* Sidebar Tab Body */}
            <div className="flex-1 overflow-y-auto p-2.5 space-y-2">
              {/* Structured / PDF TOC (works across PDF, iframe Drive PDF, and notes-only) */}
              {sidebarTab === 'toc' &&
                (activeMode === 'pdf' ||
                  activeMode === 'iframe' ||
                  activeMode === 'notes-only') && (
                  <>
                    {hasStructuredToc ? (
                      filteredTocEntries.length > 0 ? (
                        <div className="space-y-3">
                          {groupedTocSections.map((section) => (
                            <div key={section.key} className="space-y-1">
                              {(tocGroupMode !== 'order' ||
                                groupedTocSections.length > 1) && (
                                <div
                                  className={`px-2 py-1.5 rounded-md border text-[11px] space-y-0.5 ${subtlePanelClass}`}
                                >
                                  <div className="flex items-center justify-between gap-2 font-semibold">
                                    <span>{section.label}</span>
                                    <span className="font-mono-tabular opacity-75">
                                      {section.entries.length} 篇
                                    </span>
                                  </div>
                                  {section.description && (
                                    <p className="text-[11px] opacity-75 leading-snug">
                                      {section.description}
                                    </p>
                                  )}
                                </div>
                              )}

                              {section.entries.map((entry) => {
                                const isActive =
                                  activeTocEntry?.id === entry.id;
                                const pageLabel = entry.pageNote
                                  ? `P.${entry.pageNote}`
                                  : `P.${entry.startPage}`;
                                const metaLine = [
                                  entry.grade && entry.grade !== '通用'
                                    ? entry.grade
                                    : null,
                                  entry.designer && entry.designer !== '—'
                                    ? entry.designer
                                    : null,
                                  entry.bookPageNote || null,
                                  tocGroupMode !== 'category' && entry.category
                                    ? entry.category
                                    : null,
                                ]
                                  .filter(Boolean)
                                  .join(' · ');

                                return (
                                  <button
                                    key={entry.id}
                                    type="button"
                                    onClick={() => handleSelectTocEntry(entry)}
                                    style={
                                      entry.level
                                        ? {
                                            paddingLeft: `${10 + entry.level * 12}px`,
                                          }
                                        : undefined
                                    }
                                    className={`w-full text-left px-2.5 py-2 rounded-lg border text-xs leading-snug transition-colors space-y-1 ${
                                      isActive
                                        ? isDark
                                          ? 'bg-blue-500/20 border-blue-400/50 text-blue-200 font-semibold'
                                          : 'bg-[#1E3A8A]/10 border-[#1E3A8A]/35 text-[#1E3A8A] font-semibold'
                                        : isDark
                                          ? 'border-transparent text-stone-200 hover:bg-zinc-800'
                                          : 'border-transparent text-stone-800 hover:bg-[#F7F4EE]'
                                    }`}
                                  >
                                    <div className="flex items-start justify-between gap-2">
                                      <span className="min-w-0 flex-1">
                                        {entry.order && (
                                          <span className="font-mono-tabular text-[11px] opacity-60 mr-1.5">
                                            {entry.order}
                                          </span>
                                        )}
                                        <span>{entry.title}</span>
                                      </span>
                                      <span
                                        className={`font-mono-tabular text-[11px] shrink-0 ${
                                          isActive
                                            ? 'opacity-95'
                                            : 'opacity-60'
                                        }`}
                                      >
                                        {pageLabel}
                                      </span>
                                    </div>
                                    {metaLine && (
                                      <div
                                        className={`text-[11px] font-normal truncate ${
                                          isDark
                                            ? 'text-stone-400'
                                            : 'text-stone-500'
                                        }`}
                                      >
                                        {metaLine}
                                      </div>
                                    )}
                                  </button>
                                );
                              })}
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="py-6 px-3 text-center space-y-2">
                          <p
                            className={`text-xs ${
                              isDark ? 'text-stone-400' : 'text-stone-500'
                            }`}
                          >
                            找不到符合篩選條件的章節。
                          </p>
                          <button
                            type="button"
                            onClick={() => {
                              setTocFilterQuery('');
                              setActiveStrandId(null);
                            }}
                            className="text-xs font-semibold text-[#1E3A8A] dark:text-blue-300 hover:underline"
                          >
                            清除篩選條件
                          </button>
                        </div>
                      )
                    ) : (
                      <div className="py-6 px-3 text-center space-y-3">
                        <p
                          className={`text-xs leading-relaxed ${
                            isDark ? 'text-stone-400' : 'text-stone-500'
                          }`}
                        >
                          此 PDF 未內建書籤大綱，可直接瀏覽頁面縮圖或使用頁碼跳轉。
                        </p>
                        {activeMode === 'pdf' && (
                          <button
                            type="button"
                            onClick={() => setSidebarTab('thumbs')}
                            className="px-3 py-1.5 text-xs font-semibold text-white bg-[#1E3A8A] rounded-lg hover:bg-[#172554]"
                          >
                            切換至頁面縮圖
                          </button>
                        )}
                      </div>
                    )}
                  </>
                )}

              {/* PDF: Page Thumbnails */}
              {activeMode === 'pdf' && sidebarTab === 'thumbs' && (
                <div className="space-y-2.5">
                  {Array.from({length: numPages}, (_, i) => i + 1).map(
                    (pageNum) => {
                      const isSelected =
                        pageNum === currentPage ||
                        (secondPage !== null && pageNum === secondPage);
                      const isMarked = bookmarks.includes(pageNum);
                      const thumb = thumbs[pageNum];
                      return (
                        <button
                          key={pageNum}
                          type="button"
                          onClick={() => goToPage(pageNum)}
                          className={`w-full text-left p-1.5 rounded-lg border transition-colors space-y-1.5 relative ${
                            isSelected
                              ? 'bg-[#1E3A8A]/10 border-[#1E3A8A]'
                              : isDark
                                ? 'bg-zinc-800/70 border-zinc-700 hover:border-zinc-500'
                                : 'bg-[#FBF9F5] border-stone-200 hover:border-stone-300'
                          }`}
                        >
                          {isMarked && (
                            <span
                              title="已加書籤"
                              className="absolute top-2.5 right-2.5 text-amber-600"
                            >
                              <Bookmark className="w-3.5 h-3.5" fill="currentColor" />
                            </span>
                          )}
                          <div className="aspect-[3/4] w-full rounded bg-stone-100 overflow-hidden flex items-center justify-center border border-stone-200/70">
                            {thumb ? (
                              <img
                                src={thumb}
                                alt={`第 ${pageNum} 頁縮圖`}
                                className="w-full h-full object-contain bg-white"
                              />
                            ) : (
                              <FileText className="w-5 h-5 text-stone-300" />
                            )}
                          </div>
                          <div
                            className={`text-xs font-mono-tabular text-center ${
                              isSelected
                                ? isDark
                                  ? 'text-blue-300 font-bold'
                                  : 'text-[#1E3A8A] font-bold'
                                : isDark
                                  ? 'text-stone-400'
                                  : 'text-stone-500'
                            }`}
                          >
                            第 {pageNum} 頁
                          </div>
                        </button>
                      );
                    },
                  )}
                </div>
              )}

              {/* EPUB: Chapters */}
              {activeMode === 'epub' && epubBook && sidebarTab === 'toc' && (
                <>
                  <div
                    className={`px-2 pb-2 mb-1 border-b ${
                      isDark ? 'border-zinc-800' : 'border-stone-100'
                    }`}
                  >
                    <div className="text-xs font-semibold truncate">
                      {epubBook.title}
                    </div>
                    {epubBook.creator && (
                      <div className="text-[11px] opacity-65 truncate mt-0.5">
                        {epubBook.creator}
                      </div>
                    )}
                  </div>
                  {epubBook.chapters.map((chap) => {
                    const isActive = chap.index === epubChapterIdx;
                    const isMarked = bookmarks.includes(chap.index + 1);
                    return (
                      <button
                        key={`${chap.id}-${chap.index}`}
                        type="button"
                        onClick={() => goToEpubChapter(chap.index)}
                        className={`w-full text-left px-2.5 py-2 rounded-lg text-xs leading-snug flex items-start justify-between gap-2 transition-colors ${
                          isActive
                            ? isDark
                              ? 'bg-blue-500/20 text-blue-300 font-semibold'
                              : 'bg-[#1E3A8A]/12 text-[#1E3A8A] font-semibold'
                            : isDark
                              ? 'text-stone-200 hover:bg-zinc-800'
                              : 'text-stone-700 hover:bg-[#F7F4EE]'
                        }`}
                      >
                        <span className="min-w-0">
                          <span className="font-mono-tabular text-[11px] opacity-55 mr-1.5">
                            {String(chap.index + 1).padStart(2, '0')}
                          </span>
                          <span>{chap.title}</span>
                        </span>
                        {isMarked && (
                          <Bookmark
                            className="w-3 h-3 text-amber-600 shrink-0 mt-0.5"
                            fill="currentColor"
                          />
                        )}
                      </button>
                    );
                  })}
                </>
              )}

              {/* Markdown: Headings Outline */}
              {activeMode === 'markdown' && sidebarTab === 'toc' && (
                <>
                  {mdHeadings.map((h) => (
                    <button
                      key={h.id}
                      type="button"
                      onClick={() => {
                        const targetEl = document.getElementById(h.id);
                        targetEl?.scrollIntoView({
                          behavior: 'smooth',
                          block: 'start',
                        });
                      }}
                      className={`w-full text-left py-1.5 pr-2 rounded-md text-xs transition-colors line-clamp-2 ${
                        isDark
                          ? 'text-stone-200 hover:bg-zinc-800'
                          : 'text-stone-700 hover:bg-[#F7F4EE] hover:text-[#1E3A8A]'
                      } ${
                        h.level === 1
                          ? 'pl-2 font-semibold'
                          : h.level === 2
                            ? 'pl-4'
                            : 'pl-6 opacity-75'
                      }`}
                    >
                      {h.text}
                    </button>
                  ))}
                </>
              )}

              {/* Bookmarks List */}
              {canBookmark && sidebarTab === 'bookmarks' && (
                <>
                  {bookmarks.length === 0 ? (
                    <div className="py-8 px-3 text-center space-y-2">
                      <Bookmark className="w-6 h-6 mx-auto opacity-30" />
                      <p
                        className={`text-xs leading-relaxed ${
                          isDark ? 'text-stone-400' : 'text-stone-500'
                        }`}
                      >
                        尚未加入任何書籤。閱讀時點擊上方「書籤」圖示，即可儲存重點頁碼。
                      </p>
                    </div>
                  ) : (
                    bookmarks.map((unit) => {
                      const isCurrent = unit === currentUnitNumber;
                      const label =
                        activeMode === 'epub' && epubBook
                          ? epubBook.chapters[unit - 1]?.title || `第 ${unit} 章`
                          : `第 ${unit} 頁`;
                      return (
                        <div
                          key={unit}
                          className={`flex items-center justify-between gap-1 rounded-lg border px-2.5 py-2 ${
                            isCurrent
                              ? isDark
                                ? 'border-blue-400 bg-blue-500/15'
                                : 'border-[#1E3A8A] bg-[#1E3A8A]/10'
                              : isDark
                                ? 'border-zinc-700 bg-zinc-800/50'
                                : 'border-stone-200 bg-[#FBF9F5]'
                          }`}
                        >
                          <button
                            type="button"
                            onClick={() => {
                              if (activeMode === 'pdf') goToPage(unit);
                              else if (activeMode === 'epub')
                                goToEpubChapter(unit - 1);
                            }}
                            className="flex-1 text-left text-xs font-semibold truncate"
                          >
                            {activeMode === 'epub'
                              ? `第 ${unit} 章 · ${label}`
                              : label}
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              persistBookmarks(
                                bookmarks.filter((b) => b !== unit),
                              )
                            }
                            aria-label={`移除書籤 ${label}`}
                            className="p-1 opacity-60 hover:opacity-100 rounded"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      );
                    })
                  )}
                </>
              )}
            </div>
          </aside>
        )}

        {/* Center Ebook Stage */}
        <main
          ref={stageRef}
          onTouchStart={handleStageTouchStart}
          onTouchEnd={handleStageTouchEnd}
          className={`flex-1 min-w-0 min-h-0 relative flex flex-col overflow-hidden transition-colors ${stageBgClass}`}
        >
          {/* Active Chapter Breadcrumb & Quick Prev/Next Chapter Strip */}
          {activeTocEntry &&
            (activeMode === 'pdf' || activeMode === 'iframe') && (
              <div
                className={`px-3 sm:px-4 py-1.5 border-b flex items-center justify-between gap-2 text-xs shrink-0 ${chromeBgClass}`}
              >
                <div className="flex items-center gap-2 min-w-0">
                  {!showSidebar && (
                    <button
                      type="button"
                      onClick={() => {
                        setSidebarTab('toc');
                        setShowSidebar(true);
                      }}
                      className={`px-2 py-1 rounded border text-[11px] font-medium inline-flex items-center gap-1 shrink-0 ${btnNeutralClass}`}
                    >
                      <PanelLeft className="w-3 h-3" />
                      <span>展開目錄</span>
                    </button>
                  )}
                  <span className="truncate">
                    <span className="font-semibold">
                      {activeTocEntry.order ? `${activeTocEntry.order} · ` : ''}
                      {activeTocEntry.title}
                    </span>
                    {(() => {
                      const subMeta = [
                        activeTocEntry.grade && activeTocEntry.grade !== '通用'
                          ? activeTocEntry.grade
                          : null,
                        activeTocEntry.designer &&
                        activeTocEntry.designer !== '—'
                          ? activeTocEntry.designer
                          : null,
                        activeTocEntry.bookPageNote || null,
                      ]
                        .filter(Boolean)
                        .join(' · ');
                      return subMeta ? (
                        <span className="opacity-70 ml-1.5 hidden sm:inline">
                          （{subMeta}）
                        </span>
                      ) : null;
                    })()}
                  </span>
                  <span className="font-mono-tabular text-[11px] opacity-75 shrink-0">
                    P.{activeTocEntry.pageNote || activeTocEntry.startPage}
                  </span>
                </div>

                {bookTocMeta.entries.length > 1 && (
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      type="button"
                      disabled={activeTocIndex <= 0}
                      onClick={() => {
                        if (activeTocIndex > 0) {
                          handleSelectTocEntry(
                            bookTocMeta.entries[activeTocIndex - 1],
                          );
                        }
                      }}
                      className={`px-2 py-0.5 rounded border text-[11px] disabled:opacity-35 whitespace-nowrap ${btnNeutralClass}`}
                    >
                      上一篇
                    </button>
                    <button
                      type="button"
                      disabled={
                        activeTocIndex === -1 ||
                        activeTocIndex >= bookTocMeta.entries.length - 1
                      }
                      onClick={() => {
                        if (
                          activeTocIndex >= 0 &&
                          activeTocIndex < bookTocMeta.entries.length - 1
                        ) {
                          handleSelectTocEntry(
                            bookTocMeta.entries[activeTocIndex + 1],
                          );
                        }
                      }}
                      className={`px-2 py-0.5 rounded border text-[11px] disabled:opacity-35 whitespace-nowrap ${btnNeutralClass}`}
                    >
                      下一篇
                    </button>
                  </div>
                )}
              </div>
            )}

          {pdfError && activeMode === 'iframe' && (
            <div className="px-3 sm:px-4 py-2 bg-amber-50 border-b border-amber-200 text-xs text-amber-900 flex flex-wrap items-center justify-between gap-2 shrink-0">
              <span className="inline-flex items-center gap-1.5">
                <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                <span>{pdfError}</span>
              </span>
              <div className="flex items-center gap-3 shrink-0">
                <button
                  type="button"
                  onClick={() => {
                    setPdfCorsFallback(false);
                    setPdfError(null);
                  }}
                  className="font-semibold text-[#1E3A8A] underline underline-offset-2"
                >
                  重試站內直連閱讀
                </button>
                {source.rawUrl && (
                  <a
                    href={source.rawUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-semibold text-[#1E3A8A] underline underline-offset-2"
                  >
                    另開檔案
                  </a>
                )}
              </div>
            </div>
          )}

          {/* Mode 1: PDF */}
          {activeMode === 'pdf' && (
            <div className="flex-1 min-h-0 relative flex flex-col overflow-hidden">
              {pdfLoading ? (
                <div
                  className={`flex-1 flex flex-col items-center justify-center gap-3 px-6 text-center ${
                    isDark ? 'text-stone-300' : 'text-stone-600'
                  }`}
                >
                  <Loader2 className="w-7 h-7 animate-spin text-[#1E3A8A]" />
                  <div className="space-y-1.5 max-w-xs w-full">
                    <div className="text-sm font-medium">
                      {pdfLoadProgress && pdfLoadProgress.total > 0
                        ? `正在載入電子書… ${Math.min(
                            100,
                            Math.round(
                              (pdfLoadProgress.loaded / pdfLoadProgress.total) *
                                100,
                            ),
                          )}%`
                        : pdfLoadProgress && pdfLoadProgress.loaded > 0
                          ? `正在下載電子書（${(
                              pdfLoadProgress.loaded /
                              (1024 * 1024)
                            ).toFixed(1)} MB）…`
                          : '正在連線並解析電子書書頁…'}
                    </div>
                    {pdfLoadProgress && pdfLoadProgress.total > 0 && (
                      <>
                        <div className="w-full h-1.5 rounded-full bg-stone-300/60 overflow-hidden">
                          <div
                            className="h-full bg-[#1E3A8A] transition-all duration-200"
                            style={{
                              width: `${Math.min(
                                100,
                                Math.round(
                                  (pdfLoadProgress.loaded /
                                    pdfLoadProgress.total) *
                                    100,
                                ),
                              )}%`,
                            }}
                          />
                        </div>
                        <div className="text-[11px] font-mono-tabular opacity-75">
                          {(pdfLoadProgress.loaded / (1024 * 1024)).toFixed(1)}{' '}
                          /{' '}
                          {(pdfLoadProgress.total / (1024 * 1024)).toFixed(1)}{' '}
                          MB
                        </div>
                      </>
                    )}
                    {queuedTargetPage !== null && (
                      <div className="text-xs font-medium text-[#1E3A8A] dark:text-blue-300 pt-1">
                        載入完成後將自動跳至第{' '}
                        <span className="font-mono-tabular font-bold">
                          {queuedTargetPage}
                        </span>{' '}
                        頁
                      </div>
                    )}
                  </div>
                </div>
              ) : pdfDoc && effectivePdfLayout === 'scroll' ? (
                <div className="flex-1 overflow-auto px-2 sm:px-4 py-4 sm:py-6">
                  <div className="w-max min-w-full flex flex-col items-center gap-5">
                    {Array.from({length: numPages}, (_, i) => i + 1).map(
                      (pageNum) => (
                        <div
                          key={pageNum}
                          id={`pdf-scroll-page-${pageNum}`}
                          onClick={() => setCurrentPage(pageNum)}
                          className="flex flex-col items-center gap-1.5 scroll-mt-4"
                        >
                          <PdfPageCanvas
                            pdfDoc={pdfDoc}
                            pageNumber={pageNum}
                            targetWidth={pageTargetWidth}
                            targetHeight={pageTargetHeight}
                            zoomFactor={zoomFactor}
                            theme={readingTheme}
                            lazyVisibleOnly
                          />
                          <span
                            className={`text-xs font-mono-tabular ${
                              isDark ? 'text-stone-400' : 'text-stone-500'
                            }`}
                          >
                            第 {pageNum} 頁 / 共 {numPages} 頁
                          </span>
                        </div>
                      ),
                    )}
                  </div>
                </div>
              ) : pdfDoc ? (
                <div className="flex-1 min-h-0 relative flex overflow-auto p-2 sm:p-6">
                  {/* Left Floating Page-Turn Edge Button */}
                  <button
                    type="button"
                    disabled={isPrevDisabled}
                    onClick={() => goToPage(currentPage - stepAmount)}
                    aria-label="上一頁"
                    title="翻至上一頁 (←)"
                    className={`hidden sm:flex absolute left-3 top-1/2 -translate-y-1/2 z-20 w-11 h-11 rounded-full border items-center justify-center shadow-md transition-all disabled:opacity-25 disabled:pointer-events-none ${
                      isDark
                        ? 'bg-zinc-900/90 border-zinc-700 text-stone-100 hover:bg-zinc-800'
                        : 'bg-white/90 border-stone-200 text-stone-800 hover:bg-white hover:scale-105'
                    }`}
                  >
                    <ChevronLeft className="w-5 h-5" />
                  </button>

                  {/* Book Spread / Single Page Leaf with 3D Flip Animation */}
                  <div
                    key={flipState.key}
                    className={`flex items-center justify-center m-auto min-h-min ${
                      isSpreadActive && secondPage !== null ? 'gap-0' : 'gap-4'
                    } ${flipAnimationClass}`}
                  >
                    <PdfPageCanvas
                      pdfDoc={pdfDoc}
                      pageNumber={currentPage}
                      targetWidth={pageTargetWidth}
                      targetHeight={pageTargetHeight}
                      zoomFactor={zoomFactor}
                      theme={readingTheme}
                      spineEdge={
                        isSpreadActive && secondPage !== null
                          ? 'left-page'
                          : 'none'
                      }
                    />
                    {secondPage !== null && (
                      <PdfPageCanvas
                        pdfDoc={pdfDoc}
                        pageNumber={secondPage}
                        targetWidth={pageTargetWidth}
                        targetHeight={pageTargetHeight}
                        zoomFactor={zoomFactor}
                        theme={readingTheme}
                        spineEdge="right-page"
                      />
                    )}
                  </div>

                  {/* Right Floating Page-Turn Edge Button */}
                  <button
                    type="button"
                    disabled={isNextDisabled}
                    onClick={() => goToPage(currentPage + stepAmount)}
                    aria-label="下一頁"
                    title="翻至下一頁 (→)"
                    className={`hidden sm:flex absolute right-3 top-1/2 -translate-y-1/2 z-20 w-11 h-11 rounded-full border items-center justify-center shadow-md transition-all disabled:opacity-25 disabled:pointer-events-none ${
                      isDark
                        ? 'bg-zinc-900/90 border-zinc-700 text-stone-100 hover:bg-zinc-800'
                        : 'bg-white/90 border-stone-200 text-stone-800 hover:bg-white hover:scale-105'
                    }`}
                  >
                    <ChevronRight className="w-5 h-5" />
                  </button>
                </div>
              ) : null}
            </div>
          )}

          {/* Mode 2: EPUB */}
          {activeMode === 'epub' && (
            <div className="flex-1 min-h-0 relative flex flex-col">
              {epubLoading ? (
                <div
                  className={`flex-1 flex flex-col items-center justify-center gap-3 ${stageBgClass}`}
                >
                  <Loader2 className="w-7 h-7 animate-spin text-[#1E3A8A]" />
                  <span
                    className={`text-sm font-medium ${
                      isDark ? 'text-stone-300' : 'text-stone-600'
                    }`}
                  >
                    正在解析 EPUB 電子書章節…
                  </span>
                </div>
              ) : epubError ? (
                <div
                  className={`flex-1 flex flex-col items-center justify-center p-6 text-center ${stageBgClass}`}
                >
                  <div className="max-w-md bg-white border border-stone-200 rounded-2xl p-6 space-y-3 shadow-sm">
                    <AlertCircle className="w-8 h-8 text-amber-700 mx-auto" />
                    <div className="font-editorial text-lg font-bold text-stone-950">
                      無法於瀏覽器內嵌開啟此 EPUB
                    </div>
                    <p className="text-xs text-stone-600 leading-relaxed">
                      {epubError}
                    </p>
                    {source.rawUrl && (
                      <a
                        href={source.rawUrl}
                        download={`${resource.title}.epub`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="min-h-[40px] px-4 py-2 text-xs font-semibold text-white bg-[#1E3A8A] rounded-lg hover:bg-[#172554] inline-flex items-center gap-1.5"
                      >
                        <Download className="w-4 h-4" />
                        <span>下載 EPUB 原檔</span>
                      </a>
                    )}
                  </div>
                </div>
              ) : epubBook ? (
                <div
                  key={flipState.key}
                  className={`flex-1 min-h-0 relative ${flipAnimationClass}`}
                >
                  {epubChapterRendering && (
                    <div className="absolute inset-0 z-10 bg-black/10 flex items-center justify-center pointer-events-none">
                      <Loader2 className="w-6 h-6 animate-spin text-[#1E3A8A]" />
                    </div>
                  )}
                  <iframe
                    title={`${resource.title} - ${
                      epubBook.chapters[epubChapterIdx]?.title || 'EPUB'
                    }`}
                    sandbox=""
                    srcDoc={epubChapterSrcDoc}
                    className="w-full h-full border-0"
                  />
                  {epubBook.chapters.length > 1 && (
                    <>
                      <button
                        type="button"
                        disabled={isPrevDisabled}
                        onClick={() => goToEpubChapter(epubChapterIdx - 1)}
                        aria-label="上一章"
                        className={`hidden sm:flex absolute left-3 top-1/2 -translate-y-1/2 z-20 w-10 h-10 rounded-full border items-center justify-center shadow-md transition-all disabled:opacity-25 disabled:pointer-events-none ${
                          isDark
                            ? 'bg-zinc-900/90 border-zinc-700 text-stone-100 hover:bg-zinc-800'
                            : 'bg-white/90 border-stone-200 text-stone-800 hover:bg-white'
                        }`}
                      >
                        <ChevronLeft className="w-5 h-5" />
                      </button>
                      <button
                        type="button"
                        disabled={isNextDisabled}
                        onClick={() => goToEpubChapter(epubChapterIdx + 1)}
                        aria-label="下一章"
                        className={`hidden sm:flex absolute right-3 top-1/2 -translate-y-1/2 z-20 w-10 h-10 rounded-full border items-center justify-center shadow-md transition-all disabled:opacity-25 disabled:pointer-events-none ${
                          isDark
                            ? 'bg-zinc-900/90 border-zinc-700 text-stone-100 hover:bg-zinc-800'
                            : 'bg-white/90 border-stone-200 text-stone-800 hover:bg-white'
                        }`}
                      >
                        <ChevronRight className="w-5 h-5" />
                      </button>
                    </>
                  )}
                </div>
              ) : null}
            </div>
          )}

          {/* Mode 3: Markdown (.md) File */}
          {activeMode === 'markdown' && (
            <div className="flex-1 overflow-y-auto p-4 sm:p-8">
              {mdLoading ? (
                <div className="h-full flex flex-col items-center justify-center gap-3 text-stone-600">
                  <Loader2 className="w-7 h-7 animate-spin text-[#1E3A8A]" />
                  <span className="text-sm font-medium">
                    正在載入 Markdown 文件…
                  </span>
                </div>
              ) : mdError ? (
                <div className="h-full flex flex-col items-center justify-center p-4 text-center">
                  <div className="max-w-md bg-white border border-stone-200 rounded-2xl p-6 space-y-3 shadow-sm">
                    <AlertCircle className="w-8 h-8 text-amber-700 mx-auto" />
                    <div className="font-editorial text-lg font-bold text-stone-950">
                      無法於站內直接載入此 Markdown 檔
                    </div>
                    <p className="text-xs text-stone-600 leading-relaxed">
                      {mdError}
                    </p>
                    {source.rawUrl && (
                      <a
                        href={source.rawUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="min-h-[40px] px-4 py-2 text-xs font-semibold text-white bg-[#1E3A8A] rounded-lg hover:bg-[#172554] inline-flex items-center gap-1.5"
                      >
                        <ExternalLink className="w-4 h-4" />
                        <span>直接開啟或下載檔案</span>
                      </a>
                    )}
                  </div>
                </div>
              ) : (
                <article
                  className={`max-w-3xl mx-auto border rounded-2xl p-6 sm:p-10 shadow-sm ${
                    isDark
                      ? 'bg-[#18191D] border-zinc-800'
                      : readingTheme === 'sepia'
                        ? 'bg-[#FBF5E6] border-[#DFD2B5]'
                        : 'bg-white border-stone-200'
                  }`}
                >
                  <MarkdownBookView
                    content={mdText}
                    baseUrl={resolvedMdBaseUrl}
                    fontSizePx={readerFontSize}
                    theme={readingTheme}
                    highlightQuery={submittedSearchQuery}
                  />
                </article>
              )}
            </div>
          )}

          {/* Mode 4: HTML5 / Cloud Drive Embed */}
          {activeMode === 'iframe' && (
            <div className="flex-1 min-h-0 relative bg-white flex flex-col">
              {iframeTargetPage !== null && (
                <div className="px-3 py-1.5 bg-[#F7F4EE] border-b border-stone-200 text-[11px] text-stone-700 flex items-center justify-between gap-2 shrink-0">
                  <span>
                    已選取章節起始頁碼：第{' '}
                    <strong className="font-mono-tabular text-[#1E3A8A]">
                      {iframeTargetPage}
                    </strong>{' '}
                    頁（Google 雲端預覽框受限於外部網域安全性，請於下方預覽框切換頁碼）
                  </span>
                </div>
              )}
              <div className="flex-1 min-h-0 relative">
                {iframeLoading && (
                  <div className="absolute inset-0 z-10 bg-[#FBF9F5]/90 flex flex-col items-center justify-center gap-3 text-stone-600 pointer-events-none">
                    <Loader2 className="w-7 h-7 animate-spin text-[#1E3A8A]" />
                    <span className="text-sm font-medium">
                      正在開啟內嵌電子書檢視器…
                    </span>
                  </div>
                )}
                <iframe
                  key={`${resolvedIframeSrc}-${iframeKey}`}
                  src={resolvedIframeSrc}
                  title={resource.title}
                  onLoad={() => setIframeLoading(false)}
                  allowFullScreen
                  style={
                    readingTheme === 'dark'
                      ? {filter: 'brightness(0.92)'}
                      : readingTheme === 'sepia'
                        ? {filter: 'sepia(0.12)'}
                        : undefined
                  }
                  className="w-full h-full border-0 bg-white"
                />
              </div>
            </div>
          )}

          {/* Mode 5: Notes-only fallback */}
          {activeMode === 'notes-only' && (
            <div className="flex-1 overflow-y-auto p-4 sm:p-8">
              <div className="max-w-3xl mx-auto bg-white border border-stone-200 rounded-2xl p-6 sm:p-10 shadow-sm space-y-5">
                {activeTocEntry && (
                  <div
                    id="notes-selected-chapter-card"
                    className="p-4 rounded-xl bg-[#F7F4EE] border border-stone-200 space-y-1.5 scroll-mt-4"
                  >
                    <div className="text-xs font-medium text-stone-500 flex flex-wrap items-center justify-between gap-2">
                      <span>
                        {[
                          activeTocEntry.order
                            ? `篇章 ${activeTocEntry.order}`
                            : null,
                          activeTocEntry.category,
                          activeTocEntry.grade !== '通用'
                            ? activeTocEntry.grade
                            : null,
                        ]
                          .filter(Boolean)
                          .join(' · ')}
                      </span>
                      <span className="font-mono-tabular font-semibold text-[#1E3A8A]">
                        PDF 第 {activeTocEntry.pageNote || activeTocEntry.startPage} 頁
                        {activeTocEntry.bookPageNote
                          ? `（${activeTocEntry.bookPageNote}）`
                          : ''}
                      </span>
                    </div>
                    <div className="font-editorial text-lg font-bold text-stone-950">
                      {activeTocEntry.title}
                    </div>
                    <div className="text-xs text-stone-600 flex flex-wrap items-center gap-x-3 gap-y-1">
                      {activeTocEntry.designer &&
                        activeTocEntry.designer !== '—' && (
                          <span>設計者：{activeTocEntry.designer}</span>
                        )}
                      {activeTocEntry.resourceKind && (
                        <span>資源型態：{activeTocEntry.resourceKind}</span>
                      )}
                    </div>
                  </div>
                )}

                <div className="pb-4 border-b border-stone-200 space-y-2">
                  <div className="text-xs font-medium text-stone-500">
                    <span className="text-[#1E3A8A] font-semibold">
                      {resource.gradeBand}
                    </span>
                    <span className="mx-1.5">·</span>
                    <span>{resource.author}</span>
                    <span className="mx-1.5">·</span>
                    <span className="font-mono-tabular">
                      {resource.publishedAt}
                    </span>
                  </div>
                  <h3 className="font-editorial text-2xl font-bold text-stone-950">
                    {resource.title}
                  </h3>
                  <p className="text-sm text-stone-600 leading-relaxed">
                    {resource.summary}
                  </p>
                </div>

                {resource.content ? (
                  renderNotes ? (
                    renderNotes(resource.content)
                  ) : (
                    <div className="text-sm text-stone-700 whitespace-pre-wrap leading-relaxed">
                      {resource.content}
                    </div>
                  )
                ) : (
                  <div className="py-8 text-center text-sm text-stone-500 space-y-2">
                    <RefreshCw className="w-6 h-6 text-stone-300 mx-auto" />
                    <p>此電子書尚未設定檔案或網頁連結。</p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Bottom Scrubber & Quick Page-Jump Bar (PDF & EPUB multi-unit books) */}
          {totalUnits > 1 && (
            <footer
              className={`border-t px-3 sm:px-5 py-2 shrink-0 ${chromeBgClass}`}
            >
              <div className="max-w-4xl mx-auto flex flex-wrap items-center gap-2 sm:gap-3">
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    type="button"
                    disabled={isPrevDisabled}
                    onClick={() =>
                      activeMode === 'pdf'
                        ? goToPage(1)
                        : goToEpubChapter(0)
                    }
                    aria-label="跳至第一頁"
                    title="首頁 / 第一章"
                    className="min-h-[34px] min-w-[34px] rounded-md hover:bg-black/5 disabled:opacity-30 inline-flex items-center justify-center"
                  >
                    <ChevronsLeft className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    disabled={isPrevDisabled}
                    onClick={() =>
                      activeMode === 'pdf'
                        ? goToPage(currentPage - stepAmount)
                        : goToEpubChapter(epubChapterIdx - 1)
                    }
                    aria-label={activeMode === 'pdf' ? '上一頁' : '上一章'}
                    className="min-h-[34px] min-w-[34px] rounded-md hover:bg-black/5 disabled:opacity-30 inline-flex items-center justify-center"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                </div>

                {/* Progress Range Slider */}
                <div className="flex-1 min-w-[120px] flex items-center gap-2.5">
                  <input
                    type="range"
                    min={1}
                    max={totalUnits}
                    value={currentUnitNumber}
                    onChange={(e) => {
                      const val = parseInt(e.target.value, 10);
                      if (activeMode === 'pdf') goToPage(val);
                      else if (activeMode === 'epub') goToEpubChapter(val - 1);
                    }}
                    aria-label={
                      activeMode === 'pdf' ? '快速拖曳跳頁軸' : '快速切換章節軸'
                    }
                    className="w-full accent-[#1E3A8A] cursor-pointer h-1.5"
                  />
                  <span className="text-xs font-mono-tabular opacity-70 w-10 text-right shrink-0">
                    {progressPercent}%
                  </span>
                </div>

                <div className="flex items-center gap-1 shrink-0">
                  <button
                    type="button"
                    disabled={isNextDisabled}
                    onClick={() =>
                      activeMode === 'pdf'
                        ? goToPage(currentPage + stepAmount)
                        : goToEpubChapter(epubChapterIdx + 1)
                    }
                    aria-label={activeMode === 'pdf' ? '下一頁' : '下一章'}
                    className="min-h-[34px] min-w-[34px] rounded-md hover:bg-black/5 disabled:opacity-30 inline-flex items-center justify-center"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    disabled={isNextDisabled}
                    onClick={() =>
                      activeMode === 'pdf'
                        ? goToPage(numPages)
                        : epubBook &&
                          goToEpubChapter(epubBook.chapters.length - 1)
                    }
                    aria-label="跳至最後一頁"
                    title="末頁 / 最末章"
                    className="min-h-[34px] min-w-[34px] rounded-md hover:bg-black/5 disabled:opacity-30 inline-flex items-center justify-center"
                  >
                    <ChevronsRight className="w-4 h-4" />
                  </button>
                </div>

                {/* Quick Page / Chapter Jump Input */}
                {activeMode === 'pdf' ? (
                  <form
                    onSubmit={handlePageInputSubmit}
                    className="flex items-center gap-1.5 text-xs font-mono-tabular shrink-0"
                  >
                    <span className="opacity-70">跳至</span>
                    <input
                      type="text"
                      inputMode="numeric"
                      aria-label="輸入跳轉頁碼"
                      value={pageInput}
                      onChange={(e) => setPageInput(e.target.value)}
                      onBlur={handlePageInputSubmit}
                      className={`w-11 text-center py-1 border rounded text-xs font-semibold focus:outline-none focus:ring-1 focus:ring-[#1E3A8A] ${
                        isDark
                          ? 'bg-zinc-800 border-zinc-700 text-white'
                          : 'bg-white border-stone-300 text-stone-950'
                      }`}
                    />
                    <span className="opacity-70">/ {numPages} 頁</span>
                  </form>
                ) : (
                  <span className="text-xs font-mono-tabular opacity-75 shrink-0">
                    第 {currentUnitNumber} / {totalUnits} 章
                  </span>
                )}
              </div>
            </footer>
          )}
        </main>

        {/* Right Drawer: Full-Text Search & Jump Results */}
        {showSearchDrawer && (
          <aside
            aria-label="電子書全文查詢"
            className={`w-80 sm:w-96 max-w-full shrink-0 border-l flex flex-col overflow-hidden ${chromeBgClass}`}
          >
            <div
              className={`px-4 py-3 border-b flex items-center justify-between gap-2 shrink-0 ${
                isDark ? 'border-zinc-800' : 'border-stone-200'
              }`}
            >
              <span className="font-editorial text-sm font-bold">
                全文查詢與快速跳頁
              </span>
              <button
                type="button"
                onClick={() => setShowSearchDrawer(false)}
                className="p-1 opacity-70 hover:opacity-100 rounded-md"
                aria-label="關閉搜尋面板"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                void runBookSearch(searchQuery);
              }}
              className={`p-3 border-b space-y-2 shrink-0 ${
                isDark ? 'border-zinc-800' : 'border-stone-200'
              }`}
            >
              <div className="flex items-center gap-1.5">
                <div className="relative flex-1">
                  <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 opacity-50" />
                  <input
                    ref={searchInputRef}
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="輸入數學概念、單元或關鍵字…"
                    className={`w-full pl-8 pr-7 py-2 text-xs border rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1E3A8A] ${
                      isDark
                        ? 'bg-zinc-800 border-zinc-700 text-white placeholder:text-stone-400'
                        : 'bg-[#FBF9F5] border-stone-300 text-stone-900 placeholder:text-stone-400'
                    }`}
                  />
                  {searchQuery && (
                    <button
                      type="button"
                      onClick={() => {
                        setSearchQuery('');
                        setSubmittedSearchQuery('');
                        setSearchHits([]);
                        setActiveHitIdx(-1);
                      }}
                      aria-label="清除搜尋"
                      className="absolute right-2 top-1/2 -translate-y-1/2 opacity-50 hover:opacity-100"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
                <button
                  type="submit"
                  disabled={isSearching || !searchQuery.trim()}
                  className="min-h-[34px] px-3 py-1.5 text-xs font-semibold text-white bg-[#1E3A8A] rounded-lg hover:bg-[#172554] disabled:opacity-45 shrink-0"
                >
                  {isSearching ? '搜尋中' : '查詢'}
                </button>
              </div>

              {searchHits.length > 0 && (
                <div className="flex items-center justify-between text-xs pt-1">
                  <span className="font-mono-tabular opacity-75">
                    找到 {searchHits.length} 處符合結果
                    {activeHitIdx >= 0
                      ? `（第 ${activeHitIdx + 1} 筆）`
                      : ''}
                  </span>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => {
                        const prevIdx =
                          activeHitIdx <= 0
                            ? searchHits.length - 1
                            : activeHitIdx - 1;
                        jumpToSearchHit(searchHits[prevIdx], prevIdx);
                      }}
                      className={`px-2 py-1 rounded border text-[11px] ${btnNeutralClass}`}
                    >
                      上一筆
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        const nextIdx = (activeHitIdx + 1) % searchHits.length;
                        jumpToSearchHit(searchHits[nextIdx], nextIdx);
                      }}
                      className={`px-2 py-1 rounded border text-[11px] ${btnNeutralClass}`}
                    >
                      下一筆
                    </button>
                  </div>
                </div>
              )}
            </form>

            <div className="flex-1 overflow-y-auto p-3 space-y-2">
              {isSearching ? (
                <div className="py-10 flex flex-col items-center gap-2 text-xs opacity-75">
                  <Loader2 className="w-5 h-5 animate-spin text-[#1E3A8A]" />
                  <span>{searchProgress || '正在建立內文索引…'}</span>
                </div>
              ) : submittedSearchQuery && searchHits.length === 0 ? (
                <div className="py-8 px-3 text-center text-xs opacity-70 space-y-1.5">
                  <p>找不到符合「{submittedSearchQuery}」的內容。</p>
                  {activeMode === 'iframe' && (
                    <p className="text-[11px] opacity-80">
                      提示：Google 雲端硬碟預覽框請直接使用框內右上角搜尋或下載後查詢。
                    </p>
                  )}
                </div>
              ) : searchHits.length > 0 ? (
                searchHits.map((hit, idx) => {
                  const isActive = idx === activeHitIdx;
                  return (
                    <button
                      key={hit.id}
                      type="button"
                      onClick={() => jumpToSearchHit(hit, idx)}
                      className={`w-full text-left p-2.5 rounded-xl border transition-colors space-y-1 ${
                        isActive
                          ? isDark
                            ? 'border-blue-400 bg-blue-500/15'
                            : 'border-[#1E3A8A] bg-[#1E3A8A]/10'
                          : isDark
                            ? 'border-zinc-700 bg-zinc-800/60 hover:border-zinc-500'
                            : 'border-stone-200 bg-[#FBF9F5] hover:border-stone-300'
                      }`}
                    >
                      <div
                        className={`text-xs font-semibold flex items-center justify-between gap-2 ${
                          isDark ? 'text-blue-300' : 'text-[#1E3A8A]'
                        }`}
                      >
                        <span className="truncate">{hit.label}</span>
                        <span className="text-[11px] font-normal opacity-75 shrink-0">
                          點此跳轉
                        </span>
                      </div>
                      <p
                        className={`text-xs leading-relaxed line-clamp-3 ${
                          isDark ? 'text-stone-300' : 'text-stone-600'
                        }`}
                      >
                        {renderHighlightedSegment(
                          hit.snippet,
                          submittedSearchQuery,
                        )}
                      </p>
                    </button>
                  );
                })
              ) : (
                <div className="py-8 px-3 text-center text-xs opacity-65 leading-relaxed space-y-1.5">
                  <p>輸入關鍵字後按 Enter 或點擊「查詢」。</p>
                  <p>支援 PDF 全書文字、EPUB 全章節、Markdown 文件與教學導讀查詢。</p>
                </div>
              )}
            </div>
          </aside>
        )}

        {/* Right Drawer: Optional Teaching Notes Side Panel */}
        {showNotesDrawer && resource.content && activeMode !== 'notes-only' && (
          <aside
            aria-label="電子書教學導讀"
            className={`w-80 sm:w-96 max-w-full shrink-0 border-l flex flex-col overflow-hidden ${chromeBgClass}`}
          >
            <div
              className={`px-4 py-3 border-b flex items-center justify-between gap-2 shrink-0 ${
                isDark ? 'border-zinc-800' : 'border-stone-200'
              }`}
            >
              <span className="font-editorial text-sm font-bold">
                教學導讀與使用說明
              </span>
              <button
                type="button"
                onClick={() => setShowNotesDrawer(false)}
                className="p-1 opacity-70 hover:opacity-100 rounded-md"
                aria-label="收起教學導讀"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-3">
              <div
                className={`p-3 border rounded-xl text-xs leading-relaxed ${subtlePanelClass}`}
              >
                {resource.summary}
              </div>
              {renderNotes ? (
                renderNotes(resource.content)
              ) : (
                <div className="text-sm whitespace-pre-wrap leading-relaxed">
                  {resource.content}
                </div>
              )}
            </div>
          </aside>
        )}
      </div>
    </div>
  );
};
