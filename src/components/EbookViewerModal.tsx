import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import {
  AlertCircle,
  ArrowLeft,
  BookOpen,
  ChevronLeft,
  ChevronRight,
  Columns2,
  Download,
  ExternalLink,
  FileText,
  Loader2,
  Maximize2,
  Minimize2,
  PanelLeft,
  QrCode,
  RefreshCw,
  RotateCcw,
  Square,
  StickyNote,
  X,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import {TeachingResource} from '../types/journal';

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

interface EbookViewerModalProps {
  resource: TeachingResource | null;
  onClose: () => void;
  onOpenShareQr?: (url: string, title: string) => void;
  hubShareUrl?: string;
  renderNotes?: (content: string) => React.ReactNode;
}

type ViewerMode = 'pdf' | 'iframe' | 'notes-only';

interface ResolvedEbookSource {
  mode: ViewerMode;
  embedUrl: string;
  rawUrl: string;
  formatLabel: string;
  isPdfDownloadable: boolean;
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

function resolveEbookSource(rawUrl?: string): ResolvedEbookSource {
  const trimmed = (rawUrl || '').trim();
  if (!trimmed) {
    return {
      mode: 'notes-only',
      embedUrl: '',
      rawUrl: '',
      formatLabel: '電子書導讀',
      isPdfDownloadable: false,
    };
  }

  if (trimmed.startsWith('data:application/pdf')) {
    return {
      mode: 'pdf',
      embedUrl: trimmed,
      rawUrl: trimmed,
      formatLabel: 'PDF 電子書',
      isPdfDownloadable: true,
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
        isPdfDownloadable: false,
      };
    }

    if (parsed.hostname.includes('drive.google.com')) {
      const fileId = extractDriveFileId(trimmed);
      if (fileId) {
        return {
          mode: 'iframe',
          embedUrl: `https://drive.google.com/file/d/${fileId}/preview`,
          rawUrl: trimmed,
          formatLabel: '雲端 PDF 電子書',
          isPdfDownloadable: false,
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
          formatLabel: '線上電子書',
          isPdfDownloadable: false,
        };
      }
    }

    if (/\.pdf$/i.test(parsed.pathname)) {
      const sameOriginRelative =
        typeof window !== 'undefined' &&
        parsed.origin === window.location.origin
          ? `${parsed.pathname}${parsed.search}${parsed.hash}`
          : trimmed;
      return {
        mode: 'pdf',
        embedUrl: sameOriginRelative,
        rawUrl: sameOriginRelative,
        formatLabel: 'PDF 電子書',
        isPdfDownloadable: true,
      };
    }

    const sameOriginHtml =
      typeof window !== 'undefined' && parsed.origin === window.location.origin
        ? `${parsed.pathname}${parsed.search}${parsed.hash}`
        : trimmed;

    return {
      mode: 'iframe',
      embedUrl: sameOriginHtml,
      rawUrl: sameOriginHtml,
      formatLabel: 'HTML5 電子書',
      isPdfDownloadable: false,
    };
  } catch {
    return {
      mode: 'notes-only',
      embedUrl: '',
      rawUrl: '',
      formatLabel: '電子書導讀',
      isPdfDownloadable: false,
    };
  }
}

interface PdfPageCanvasProps {
  pdfDoc: pdfjsLib.PDFDocumentProxy;
  pageNumber: number;
  targetWidth: number;
  targetHeight: number;
  zoomFactor: number;
}

const PdfPageCanvas: React.FC<PdfPageCanvasProps> = ({
  pdfDoc,
  pageNumber,
  targetWidth,
  targetHeight,
  zoomFactor,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [rendering, setRendering] = useState(true);

  useEffect(() => {
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
        const dpr = Math.min(window.devicePixelRatio || 1, 2);

        const cssViewport = page.getViewport({scale: cssScale});
        const renderViewport = page.getViewport({scale: cssScale * dpr});

        const canvas = canvasRef.current;
        if (!canvas || cancelled) return;

        canvas.width = Math.max(1, Math.floor(renderViewport.width));
        canvas.height = Math.max(1, Math.floor(renderViewport.height));
        canvas.style.width = `${Math.floor(cssViewport.width)}px`;
        canvas.style.height = `${Math.floor(cssViewport.height)}px`;

        const ctx = canvas.getContext('2d');
        if (!ctx) return;

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
  }, [pdfDoc, pageNumber, targetWidth, targetHeight, zoomFactor]);

  return (
    <div className="relative bg-white border border-stone-200 rounded-lg shadow-md overflow-hidden flex items-center justify-center shrink-0">
      <canvas ref={canvasRef} className="block" />
      {rendering && (
        <div className="absolute inset-0 bg-white/75 flex items-center justify-center">
          <Loader2 className="w-5 h-5 animate-spin text-[#1E3A8A]" />
        </div>
      )}
    </div>
  );
};

export const EbookViewerModal: React.FC<EbookViewerModalProps> = ({
  resource,
  onClose,
  onOpenShareQr,
  hubShareUrl = '',
  renderNotes,
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const stageRef = useRef<HTMLDivElement | null>(null);

  const source = useMemo(
    () => resolveEbookSource(resource?.resourceUrl),
    [resource?.resourceUrl],
  );

  // PDF states
  const [pdfDoc, setPdfDoc] = useState<pdfjsLib.PDFDocumentProxy | null>(null);
  const [numPages, setNumPages] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageInput, setPageInput] = useState('1');
  const [pdfLoading, setPdfLoading] = useState(false);
  const [pdfCorsFallback, setPdfCorsFallback] = useState(false);
  const [pdfError, setPdfError] = useState<string | null>(null);
  const [zoomFactor, setZoomFactor] = useState(1);
  const [spreadMode, setSpreadMode] = useState<'single' | 'spread'>('single');
  const [showSidebar, setShowSidebar] = useState(false);
  const [thumbs, setThumbs] = useState<Record<number, string>>({});
  const [stageSize, setStageSize] = useState({width: 960, height: 640});

  // HTML5 / iframe states
  const [iframeKey, setIframeKey] = useState(0);
  const [iframeLoading, setIframeLoading] = useState(true);

  // Shared UI states
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showNotesDrawer, setShowNotesDrawer] = useState(false);

  const activeMode: ViewerMode =
    source.mode === 'pdf' && pdfCorsFallback ? 'iframe' : source.mode;

  // Reset state when opening a new ebook resource
  useEffect(() => {
    if (!resource) return;
    setCurrentPage(1);
    setPageInput('1');
    setZoomFactor(1);
    setPdfCorsFallback(false);
    setPdfError(null);
    setThumbs({});
    setShowSidebar(false);
    setShowNotesDrawer(false);
    setIframeKey((k) => k + 1);
    setIframeLoading(true);
  }, [resource?.id, resource?.resourceUrl]);

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
  }, [resource, showSidebar, showNotesDrawer, activeMode]);

  // Load PDF document when in PDF mode
  useEffect(() => {
    if (!resource || source.mode !== 'pdf' || pdfCorsFallback) {
      setPdfDoc(null);
      setNumPages(0);
      setPdfLoading(false);
      return;
    }

    let cancelled = false;
    setPdfLoading(true);
    setPdfError(null);
    setPdfDoc(null);
    setNumPages(0);

    const loadingTask = pdfjsLib.getDocument({url: source.embedUrl});

    void loadingTask.promise
      .then((doc) => {
        if (cancelled) {
          void doc.cleanup().catch(() => {});
          return;
        }
        setPdfDoc(doc);
        setNumPages(doc.numPages);
        setPdfLoading(false);
      })
      .catch((err) => {
        if (cancelled) return;
        console.warn('PDF.js load failed, switching to embedded frame fallback:', err);
        setPdfLoading(false);
        setPdfCorsFallback(true);
        setPdfError(
          '無法透過輕量 Canvas 解析此遠端 PDF（可能受限於跨網域 CORS 設定），已自動切換為內嵌文件框預覽。',
        );
      });

    return () => {
      cancelled = true;
      void loadingTask.destroy().catch(() => {});
    };
  }, [resource, source.mode, source.embedUrl, pdfCorsFallback]);

  // Cleanup pdfDoc when replaced or unmounted
  useEffect(() => {
    return () => {
      if (pdfDoc) {
        void pdfDoc.cleanup().catch(() => {});
      }
    };
  }, [pdfDoc]);

  // Lazy-render thumbnails only when sidebar is opened
  useEffect(() => {
    if (!showSidebar || !pdfDoc || activeMode !== 'pdf') return;
    let cancelled = false;

    void (async () => {
      for (let p = 1; p <= pdfDoc.numPages; p++) {
        if (cancelled) return;
        if (thumbs[p]) continue;
        try {
          const page = await pdfDoc.getPage(p);
          if (cancelled) return;
          const base = page.getViewport({scale: 1});
          const viewport = page.getViewport({scale: 200 / base.width});
          const canvas = document.createElement('canvas');
          canvas.width = Math.round(viewport.width);
          canvas.height = Math.round(viewport.height);
          const ctx = canvas.getContext('2d');
          if (!ctx) continue;
          await page.render({canvas, canvasContext: ctx, viewport}).promise;
          if (cancelled) return;
          const url = canvas.toDataURL('image/jpeg', 0.85);
          setThumbs((prev) => (prev[p] ? prev : {...prev, [p]: url}));
        } catch {
          // ignore thumbnail error
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [showSidebar, pdfDoc, activeMode, thumbs]);

  // Track fullscreen state
  useEffect(() => {
    if (!resource) return;
    const onFsChange = () => {
      setIsFullscreen(Boolean(document.fullscreenElement));
    };
    document.addEventListener('fullscreenchange', onFsChange);
    return () => document.removeEventListener('fullscreenchange', onFsChange);
  }, [resource]);

  const handleClose = useCallback(() => {
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
    } else {
      void el.requestFullscreen?.().catch(() => {});
    }
  }, []);

  const stepAmount = spreadMode === 'spread' && stageSize.width >= 768 ? 2 : 1;

  const goToPage = useCallback(
    (target: number) => {
      if (numPages <= 0) return;
      const clamped = Math.max(1, Math.min(numPages, target));
      setCurrentPage(clamped);
    },
    [numPages],
  );

  // Keyboard navigation for PDF pages
  useEffect(() => {
    if (!resource || activeMode !== 'pdf' || numPages <= 0) return;
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (
        target?.tagName === 'INPUT' ||
        target?.tagName === 'TEXTAREA' ||
        target?.isContentEditable
      ) {
        return;
      }
      if (e.key === 'ArrowRight' || e.key === 'PageDown') {
        e.preventDefault();
        goToPage(currentPage + stepAmount);
      } else if (e.key === 'ArrowLeft' || e.key === 'PageUp') {
        e.preventDefault();
        goToPage(currentPage - stepAmount);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [resource, activeMode, numPages, currentPage, stepAmount, goToPage]);

  if (!resource) return null;

  const canSpread = activeMode === 'pdf' && stageSize.width >= 768 && numPages > 1;
  const isSpreadActive = canSpread && spreadMode === 'spread';
  const secondPage =
    isSpreadActive && currentPage + 1 <= numPages ? currentPage + 1 : null;

  const horizontalPadding = isSpreadActive ? 64 : 40;
  const verticalPadding = 40;
  const pageTargetWidth = isSpreadActive
    ? Math.max(220, (stageSize.width - horizontalPadding - 16) / 2)
    : Math.max(240, stageSize.width - horizontalPadding);
  const pageTargetHeight = Math.max(280, stageSize.height - verticalPadding);

  const handlePageInputSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = parseInt(pageInput, 10);
    if (!Number.isNaN(parsed)) {
      goToPage(parsed);
    } else {
      setPageInput(String(currentPage));
    }
  };

  return (
    <div
      ref={containerRef}
      className="fixed inset-0 z-50 bg-[#FBF9F5] flex flex-col overflow-hidden"
      role="dialog"
      aria-modal="true"
      aria-labelledby="ebook-viewer-title"
    >
      {/* Top Reader Control Bar */}
      <header className="bg-white border-b border-stone-200 px-3 sm:px-5 py-2.5 shrink-0">
        <div className="max-w-[1440px] mx-auto flex flex-wrap items-center justify-between gap-2.5">
          {/* Left: Back + Title + Clean Unboxed Metadata */}
          <div className="flex items-center gap-2.5 min-w-0">
            <button
              type="button"
              onClick={handleClose}
              className="min-h-[40px] px-3 py-1.5 text-xs sm:text-sm font-medium text-stone-700 bg-[#F7F4EE] border border-stone-200 rounded-lg hover:bg-stone-200/70 hover:text-stone-950 inline-flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>返回資源列表</span>
            </button>

            <div className="min-w-0">
              <div className="flex items-center gap-2 min-w-0">
                <BookOpen className="w-4 h-4 text-[#1E3A8A] shrink-0 hidden sm:block" />
                <h2
                  id="ebook-viewer-title"
                  className="font-editorial text-sm sm:text-base font-bold text-stone-950 truncate max-w-[200px] sm:max-w-[360px] lg:max-w-[460px]"
                >
                  {resource.title}
                </h2>
              </div>
              <div className="hidden sm:flex items-center gap-1.5 text-xs text-stone-500">
                <span className="text-[#1E3A8A] font-semibold">
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
              </div>
            </div>
          </div>

          {/* Center / Right Controls */}
          <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
            {/* PDF-specific lightweight reader controls */}
            {activeMode === 'pdf' && numPages > 0 && (
              <>
                <button
                  type="button"
                  onClick={() => setShowSidebar((v) => !v)}
                  className={`min-h-[38px] px-2.5 py-1.5 text-xs font-medium rounded-lg border inline-flex items-center gap-1.5 transition-colors whitespace-nowrap ${
                    showSidebar
                      ? 'bg-[#1E3A8A] text-white border-[#1E3A8A]'
                      : 'bg-white text-stone-700 border-stone-200 hover:bg-stone-50'
                  }`}
                  title="開啟或關閉頁面縮圖目錄"
                >
                  <PanelLeft className="w-3.5 h-3.5 shrink-0" />
                  <span className="hidden md:inline">目錄</span>
                </button>

                {/* Page Navigation */}
                <div className="flex items-center gap-1 bg-[#F7F4EE] border border-stone-200 rounded-lg p-0.5">
                  <button
                    type="button"
                    disabled={currentPage <= 1}
                    onClick={() => goToPage(currentPage - stepAmount)}
                    aria-label="上一頁"
                    className="min-h-[34px] min-w-[34px] px-2 rounded-md text-stone-700 hover:bg-white disabled:opacity-35 inline-flex items-center justify-center transition-colors"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>

                  <form
                    onSubmit={handlePageInputSubmit}
                    className="flex items-center gap-1 px-1 text-xs font-mono-tabular text-stone-700"
                  >
                    <input
                      type="text"
                      inputMode="numeric"
                      aria-label="頁碼"
                      value={pageInput}
                      onChange={(e) => setPageInput(e.target.value)}
                      onBlur={handlePageInputSubmit}
                      className="w-9 text-center py-0.5 bg-white border border-stone-200 rounded text-xs font-semibold text-stone-950 focus:outline-none focus:ring-1 focus:ring-[#1E3A8A]"
                    />
                    <span className="text-stone-400">/</span>
                    <span>{numPages}</span>
                  </form>

                  <button
                    type="button"
                    disabled={
                      isSpreadActive
                        ? currentPage + 1 >= numPages
                        : currentPage >= numPages
                    }
                    onClick={() => goToPage(currentPage + stepAmount)}
                    aria-label="下一頁"
                    className="min-h-[34px] min-w-[34px] px-2 rounded-md text-stone-700 hover:bg-white disabled:opacity-35 inline-flex items-center justify-center transition-colors"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>

                {/* Single vs Spread toggle on tablet/desktop */}
                {canSpread && (
                  <div
                    className="hidden md:flex items-center gap-0.5 p-0.5 bg-[#F7F4EE] border border-stone-200 rounded-lg"
                    role="group"
                    aria-label="閱讀排版模式"
                  >
                    <button
                      type="button"
                      onClick={() => setSpreadMode('single')}
                      className={`min-h-[34px] px-2.5 py-1 text-xs font-medium rounded-md inline-flex items-center gap-1 transition-colors whitespace-nowrap ${
                        spreadMode === 'single'
                          ? 'bg-white text-[#1E3A8A] font-semibold shadow-2xs'
                          : 'text-stone-600 hover:text-stone-950'
                      }`}
                      title="單頁檢視"
                    >
                      <Square className="w-3.5 h-3.5" />
                      <span>單頁</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setSpreadMode('spread')}
                      className={`min-h-[34px] px-2.5 py-1 text-xs font-medium rounded-md inline-flex items-center gap-1 transition-colors whitespace-nowrap ${
                        spreadMode === 'spread'
                          ? 'bg-white text-[#1E3A8A] font-semibold shadow-2xs'
                          : 'text-stone-600 hover:text-stone-950'
                      }`}
                      title="雙頁跨頁閱讀"
                    >
                      <Columns2 className="w-3.5 h-3.5" />
                      <span>雙頁</span>
                    </button>
                  </div>
                )}

                {/* Zoom Controls */}
                <div className="hidden sm:flex items-center gap-0.5 p-0.5 bg-[#F7F4EE] border border-stone-200 rounded-lg">
                  <button
                    type="button"
                    disabled={zoomFactor <= 0.75}
                    onClick={() =>
                      setZoomFactor((z) => Math.max(0.75, +(z - 0.25).toFixed(2)))
                    }
                    aria-label="縮小"
                    className="min-h-[34px] min-w-[34px] rounded-md text-stone-700 hover:bg-white disabled:opacity-35 inline-flex items-center justify-center"
                  >
                    <ZoomOut className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setZoomFactor(1)}
                    title="重設為自動適應視窗大小"
                    className="min-h-[34px] px-2 text-xs font-mono-tabular font-medium text-stone-700 hover:bg-white rounded-md whitespace-nowrap"
                  >
                    {Math.round(zoomFactor * 100)}%
                  </button>
                  <button
                    type="button"
                    disabled={zoomFactor >= 2.25}
                    onClick={() =>
                      setZoomFactor((z) => Math.min(2.25, +(z + 0.25).toFixed(2)))
                    }
                    aria-label="放大"
                    className="min-h-[34px] min-w-[34px] rounded-md text-stone-700 hover:bg-white disabled:opacity-35 inline-flex items-center justify-center"
                  >
                    <ZoomIn className="w-3.5 h-3.5" />
                  </button>
                </div>
              </>
            )}

            {/* HTML5 / iframe reload button */}
            {activeMode === 'iframe' && (
              <button
                type="button"
                onClick={() => {
                  setIframeLoading(true);
                  setIframeKey((k) => k + 1);
                }}
                className="min-h-[38px] px-2.5 py-1.5 text-xs font-medium text-stone-700 bg-white border border-stone-200 rounded-lg hover:bg-stone-50 inline-flex items-center gap-1.5 whitespace-nowrap"
                title="重新載入電子書頁面"
              >
                <RotateCcw className="w-3.5 h-3.5 shrink-0" />
                <span className="hidden sm:inline">重載</span>
              </button>
            )}

            {/* Teaching Notes Toggle when markdown notes exist */}
            {resource.content && activeMode !== 'notes-only' && (
              <button
                type="button"
                onClick={() => setShowNotesDrawer((v) => !v)}
                className={`min-h-[38px] px-2.5 py-1.5 text-xs font-medium rounded-lg border inline-flex items-center gap-1.5 transition-colors whitespace-nowrap ${
                  showNotesDrawer
                    ? 'bg-[#1E3A8A] text-white border-[#1E3A8A]'
                    : 'bg-white text-stone-700 border-stone-200 hover:bg-stone-50'
                }`}
              >
                <StickyNote className="w-3.5 h-3.5 shrink-0" />
                <span className="hidden md:inline">教學導讀</span>
              </button>
            )}

            {/* Fullscreen toggle */}
            <button
              type="button"
              onClick={toggleFullscreen}
              className="hidden sm:inline-flex min-h-[38px] px-2.5 py-1.5 text-xs font-medium text-stone-700 bg-white border border-stone-200 rounded-lg hover:bg-stone-50 items-center gap-1.5 whitespace-nowrap"
              title={isFullscreen ? '退出全螢幕' : '全螢幕閱讀'}
            >
              {isFullscreen ? (
                <Minimize2 className="w-3.5 h-3.5 shrink-0" />
              ) : (
                <Maximize2 className="w-3.5 h-3.5 shrink-0" />
              )}
              <span className="hidden lg:inline">
                {isFullscreen ? '退出全螢幕' : '全螢幕'}
              </span>
            </button>

            {/* Share QR */}
            {onOpenShareQr && (
              <button
                type="button"
                onClick={() =>
                  onOpenShareQr(source.rawUrl || hubShareUrl, resource.title)
                }
                className="min-h-[38px] min-w-[38px] px-2.5 py-1.5 text-xs font-medium text-stone-700 bg-white border border-stone-200 rounded-lg hover:text-[#1E3A8A] hover:border-[#1E3A8A]/40 inline-flex items-center justify-center"
                title="分享電子書 QR Code"
                aria-label="分享電子書 QR Code"
              >
                <QrCode className="w-3.5 h-3.5" />
              </button>
            )}

            {/* Download PDF or External Fallback Escape Hatch */}
            {source.rawUrl && (
              <a
                href={source.rawUrl}
                target="_blank"
                rel="noopener noreferrer"
                download={source.isPdfDownloadable ? `${resource.title}.pdf` : undefined}
                className="min-h-[38px] px-2.5 py-1.5 text-xs font-medium text-stone-700 bg-white border border-stone-200 rounded-lg hover:bg-stone-50 inline-flex items-center gap-1.5 whitespace-nowrap"
                title={
                  source.isPdfDownloadable
                    ? '下載或另開 PDF 原檔'
                    : '若內嵌網頁無法顯示，可於新分頁開啟'
                }
              >
                {source.isPdfDownloadable ? (
                  <>
                    <Download className="w-3.5 h-3.5 shrink-0" />
                    <span className="hidden md:inline">下載</span>
                  </>
                ) : (
                  <>
                    <ExternalLink className="w-3.5 h-3.5 shrink-0" />
                    <span className="hidden md:inline">另開原頁</span>
                  </>
                )}
              </a>
            )}

            <button
              type="button"
              onClick={handleClose}
              className="min-h-[38px] min-w-[38px] p-1.5 text-stone-500 hover:text-stone-900 hover:bg-stone-100 rounded-lg inline-flex items-center justify-center"
              aria-label="關閉電子書檢視器"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>
      </header>

      {/* Main Reader Body */}
      <div className="flex-1 min-h-0 flex overflow-hidden relative">
        {/* Optional PDF Thumbnail Sidebar */}
        {activeMode === 'pdf' && showSidebar && numPages > 0 && (
          <aside
            aria-label="電子書頁面縮圖"
            className="w-44 sm:w-52 shrink-0 bg-white border-r border-stone-200 p-3 overflow-y-auto space-y-2.5"
          >
            {Array.from({length: numPages}, (_, i) => i + 1).map((pageNum) => {
              const isSelected =
                pageNum === currentPage ||
                (secondPage !== null && pageNum === secondPage);
              const thumb = thumbs[pageNum];
              return (
                <button
                  key={pageNum}
                  type="button"
                  onClick={() => goToPage(pageNum)}
                  className={`w-full text-left p-1.5 rounded-lg border transition-colors space-y-1.5 ${
                    isSelected
                      ? 'bg-[#1E3A8A]/8 border-[#1E3A8A]'
                      : 'bg-[#FBF9F5] border-stone-200 hover:border-stone-300'
                  }`}
                >
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
                        ? 'text-[#1E3A8A] font-bold'
                        : 'text-stone-500'
                    }`}
                  >
                    第 {pageNum} 頁
                  </div>
                </button>
              );
            })}
          </aside>
        )}

        {/* Center Ebook Stage */}
        <main
          ref={stageRef}
          className="flex-1 min-w-0 min-h-0 bg-[#EFECE6] relative flex flex-col overflow-hidden"
        >
          {pdfError && activeMode === 'iframe' && (
            <div className="px-4 py-2 bg-amber-50 border-b border-amber-200 text-xs text-amber-900 flex flex-wrap items-center justify-between gap-2 shrink-0">
              <span className="inline-flex items-center gap-1.5">
                <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                <span>{pdfError}</span>
              </span>
              {source.rawUrl && (
                <a
                  href={source.rawUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-semibold text-[#1E3A8A] underline underline-offset-2"
                >
                  直接下載或另開檔案
                </a>
              )}
            </div>
          )}

          {activeMode === 'pdf' && (
            <div className="flex-1 overflow-auto p-4 sm:p-5 flex items-center justify-center">
              {pdfLoading ? (
                <div className="flex flex-col items-center gap-3 text-stone-600">
                  <Loader2 className="w-7 h-7 animate-spin text-[#1E3A8A]" />
                  <span className="text-sm font-medium">
                    正在載入 PDF 電子書...
                  </span>
                </div>
              ) : pdfDoc ? (
                <div className="flex items-center justify-center gap-4 min-h-min my-auto">
                  <PdfPageCanvas
                    pdfDoc={pdfDoc}
                    pageNumber={currentPage}
                    targetWidth={pageTargetWidth}
                    targetHeight={pageTargetHeight}
                    zoomFactor={zoomFactor}
                  />
                  {secondPage !== null && (
                    <PdfPageCanvas
                      pdfDoc={pdfDoc}
                      pageNumber={secondPage}
                      targetWidth={pageTargetWidth}
                      targetHeight={pageTargetHeight}
                      zoomFactor={zoomFactor}
                    />
                  )}
                </div>
              ) : null}
            </div>
          )}

          {activeMode === 'iframe' && (
            <div className="flex-1 min-h-0 relative bg-white">
              {iframeLoading && (
                <div className="absolute inset-0 z-10 bg-[#FBF9F5]/90 flex flex-col items-center justify-center gap-3 text-stone-600 pointer-events-none">
                  <Loader2 className="w-7 h-7 animate-spin text-[#1E3A8A]" />
                  <span className="text-sm font-medium">
                    正在開啟內嵌電子書檢視器...
                  </span>
                </div>
              )}
              <iframe
                key={`${source.embedUrl}-${iframeKey}`}
                src={source.embedUrl}
                title={resource.title}
                onLoad={() => setIframeLoading(false)}
                allowFullScreen
                className="w-full h-full border-0 bg-white"
              />
            </div>
          )}

          {activeMode === 'notes-only' && (
            <div className="flex-1 overflow-y-auto p-4 sm:p-8">
              <div className="max-w-3xl mx-auto bg-white border border-stone-200 rounded-2xl p-6 sm:p-10 shadow-sm space-y-5">
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
                    <p>此電子書尚未設定 PDF 或 HTML5 檔案連結。</p>
                  </div>
                )}
              </div>
            </div>
          )}
        </main>

        {/* Optional Teaching Notes Side Panel */}
        {showNotesDrawer && resource.content && activeMode !== 'notes-only' && (
          <aside
            aria-label="電子書教學導讀"
            className="w-80 sm:w-96 max-w-full shrink-0 bg-white border-l border-stone-200 flex flex-col overflow-hidden"
          >
            <div className="px-4 py-3 border-b border-stone-200 flex items-center justify-between gap-2 shrink-0">
              <span className="font-editorial text-sm font-bold text-stone-950">
                教學導讀與使用說明
              </span>
              <button
                type="button"
                onClick={() => setShowNotesDrawer(false)}
                className="p-1 text-stone-500 hover:text-stone-900 rounded-md"
                aria-label="收起教學導讀"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-3">
              <div className="p-3 bg-[#F7F4EE] border border-stone-200 rounded-xl text-xs text-stone-700 leading-relaxed">
                {resource.summary}
              </div>
              {renderNotes ? (
                renderNotes(resource.content)
              ) : (
                <div className="text-sm text-stone-700 whitespace-pre-wrap leading-relaxed">
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
