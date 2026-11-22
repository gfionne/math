import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import QRCode from 'qrcode';
import {
  AlertCircle,
  Check,
  ChevronLeft,
  ChevronRight,
  Download,
  Edit3,
  FileText,
  Loader2,
  Maximize2,
  Minimize2,
  Presentation,
  QrCode,
  RefreshCw,
  StickyNote,
  X,
} from 'lucide-react';
import {JournalPost} from '../types/journal';
import {findPresetDeckForPost} from '../config/presetDecks';
import {auth} from '../services/googleAuth';
import {
  formatCategoryDisplay,
  normalizeDriveImageUrl,
} from '../utils/postFormatting';
import {
  ArticleSlideItem,
  AudienceStyle,
  exportArticleDeckPdf,
  GeneratedArticleDeck,
} from '../utils/slideDeckExport';

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

interface ArticleDeckModalProps {
  post: JournalPost | null;
  siteTitle: string;
  onClose: () => void;
}

const STYLE_OPTIONS: Array<{id: AudienceStyle; label: string; hint: string}> = [
  {id: 'teaching', label: '公開授課分享', hint: '單元脈絡、課堂流程與評量總結'},
  {id: 'co-prep', label: '領域共備精華', hint: '教材分析、迷思概念與教學設計'},
  {id: 'executive', label: '精簡摘要報告', hint: '5～6 頁高效率核心重點總覽'},
];

export const ArticleDeckModal: React.FC<ArticleDeckModalProps> = ({
  post,
  siteTitle,
  onClose,
}) => {
  const presetDeck = useMemo(() => findPresetDeckForPost(post), [post]);

  const [viewSource, setViewSource] = useState<'preset' | 'ai'>('preset');
  const [audienceStyle, setAudienceStyle] =
    useState<AudienceStyle>('teaching');
  const [deck, setDeck] = useState<GeneratedArticleDeck | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isExportingPdf, setIsExportingPdf] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showNotes, setShowNotes] = useState(true);
  const [showCornerQr, setShowCornerQr] = useState(false);
  const [isEditingSlide, setIsEditingSlide] = useState(false);
  const [qrDataUrl, setQrDataUrl] = useState('');
  const [coverBroken, setCoverBroken] = useState(false);

  // Preset PDF Deck rendering states
  const [pdfPageCount, setPdfPageCount] = useState(0);
  const [pdfLoading, setPdfLoading] = useState(false);
  const [pdfError, setPdfError] = useState<string | null>(null);
  const [pdfSlides, setPdfSlides] = useState<Record<number, string>>({});
  const [pdfThumbs, setPdfThumbs] = useState<Record<number, string>>({});

  const cacheRef = useRef<Record<string, GeneratedArticleDeck>>({});
  const abortRef = useRef<AbortController | null>(null);
  const stageContainerRef = useRef<HTMLDivElement | null>(null);
  const pdfDocRef = useRef<pdfjsLib.PDFDocumentProxy | null>(null);
  const renderedSlideCacheRef = useRef<Record<string, string>>({});
  const renderedThumbCacheRef = useRef<Record<string, string>>({});

  const effectiveSource: 'preset' | 'ai' =
    presetDeck && viewSource === 'preset' ? 'preset' : 'ai';

  const shareUrl = useMemo(() => {
    if (typeof window === 'undefined' || !post) return '';
    return `${window.location.origin}${window.location.pathname}${window.location.search}#post=${encodeURIComponent(post.slug)}`;
  }, [post]);

  useEffect(() => {
    if (!post || !shareUrl) return;
    let cancelled = false;
    void QRCode.toDataURL(shareUrl, {
      margin: 2,
      width: 320,
      errorCorrectionLevel: 'M',
      color: {dark: '#0C1D47', light: '#FFFFFF'},
    })
      .then((url) => {
        if (!cancelled) setQrDataUrl(url);
      })
      .catch(() => {
        // ignore qr generation error
      });
    return () => {
      cancelled = true;
    };
  }, [post, shareUrl]);

  // Reset source & active slide whenever switching posts
  useEffect(() => {
    setCoverBroken(false);
    setActiveIndex(0);
    setIsEditingSlide(false);
    setErrorMsg(null);
    setPdfError(null);
    if (presetDeck) {
      setViewSource('preset');
      setShowCornerQr(false);
    } else {
      setViewSource('ai');
      setShowCornerQr(true);
    }
  }, [post?.slug, presetDeck]);

  // Load and render preset PDF document when in preset mode
  useEffect(() => {
    if (!post || effectiveSource !== 'preset' || !presetDeck) {
      return;
    }

    let cancelled = false;
    setPdfLoading(true);
    setPdfError(null);
    setPdfSlides({});
    setPdfThumbs({});
    setPdfPageCount(presetDeck.slides.length);

    const loadingTask = pdfjsLib.getDocument({url: presetDeck.pdfUrl});

    void loadingTask.promise
      .then(async (doc) => {
        if (cancelled) {
          void doc.cleanup().catch(() => {});
          return;
        }
        pdfDocRef.current = doc;
        setPdfPageCount(doc.numPages);
        setPdfLoading(false);

        const renderPageToDataUrl = async (
          pageNum: number,
          targetWidth: number,
        ): Promise<string> => {
          const page = await doc.getPage(pageNum);
          const baseViewport = page.getViewport({scale: 1});
          const scale = targetWidth / baseViewport.width;
          const viewport = page.getViewport({scale});
          const canvas = document.createElement('canvas');
          canvas.width = Math.round(viewport.width);
          canvas.height = Math.round(viewport.height);
          const ctx = canvas.getContext('2d');
          if (!ctx) return '';
          await page.render({canvas, canvasContext: ctx, viewport}).promise;
          return canvas.toDataURL('image/jpeg', 0.92);
        };

        // Render slide 1 immediately, then thumbnails and remaining slides sequentially
        const firstUrl =
          renderedSlideCacheRef.current[`${presetDeck.id}:1`] ||
          (await renderPageToDataUrl(1, 1600));
        if (!cancelled && firstUrl) {
          renderedSlideCacheRef.current[`${presetDeck.id}:1`] = firstUrl;
          setPdfSlides((prev) => ({...prev, 1: firstUrl}));
        }

        for (let p = 1; p <= doc.numPages; p++) {
          if (cancelled) return;
          const thumbKey = `${presetDeck.id}:${p}`;
          const thumbUrl =
            renderedThumbCacheRef.current[thumbKey] ||
            (await renderPageToDataUrl(p, 300));
          if (!cancelled && thumbUrl) {
            renderedThumbCacheRef.current[thumbKey] = thumbUrl;
            setPdfThumbs((prev) => ({...prev, [p]: thumbUrl}));
          }
        }
      })
      .catch((err) => {
        if (cancelled) return;
        console.error('Failed to load preset presentation PDF:', err);
        setPdfError('無法載入預設簡報 PDF，請嘗試重新整理或改用下載檢視。');
        setPdfLoading(false);
      });

    return () => {
      cancelled = true;
      void loadingTask.destroy().catch(() => {});
      if (pdfDocRef.current) {
        void pdfDocRef.current.cleanup().catch(() => {});
        pdfDocRef.current = null;
      }
    };
  }, [post, effectiveSource, presetDeck]);

  // Render active PDF page at high resolution on demand when navigating slides
  useEffect(() => {
    if (effectiveSource !== 'preset' || !presetDeck) return;
    const doc = pdfDocRef.current;
    if (!doc) return;

    const targetPage = activeIndex + 1;
    if (targetPage < 1 || targetPage > doc.numPages) return;

    const cacheKey = `${presetDeck.id}:${targetPage}`;
    if (renderedSlideCacheRef.current[cacheKey]) {
      setPdfSlides((prev) =>
        prev[targetPage]
          ? prev
          : {...prev, [targetPage]: renderedSlideCacheRef.current[cacheKey]},
      );
      return;
    }

    let cancelled = false;
    void (async () => {
      try {
        const page = await doc.getPage(targetPage);
        if (cancelled) return;
        const baseViewport = page.getViewport({scale: 1});
        const scale = 1600 / baseViewport.width;
        const viewport = page.getViewport({scale});
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(viewport.width);
        canvas.height = Math.round(viewport.height);
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        await page.render({canvas, canvasContext: ctx, viewport}).promise;
        if (cancelled) return;
        const dataUrl = canvas.toDataURL('image/jpeg', 0.92);
        renderedSlideCacheRef.current[cacheKey] = dataUrl;
        setPdfSlides((prev) => ({...prev, [targetPage]: dataUrl}));
      } catch {
        // ignore transient page render cancellation
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [effectiveSource, presetDeck, activeIndex, pdfPageCount]);

  const generateDeck = useCallback(
    async (
      targetPost: JournalPost,
      style: AudienceStyle,
      forceRefresh = false,
    ) => {
      const cacheKey = `${targetPost.slug}::${style}`;
      if (!forceRefresh && cacheRef.current[cacheKey]) {
        setDeck(cacheRef.current[cacheKey]);
        setActiveIndex(0);
        setErrorMsg(null);
        setIsLoading(false);
        setIsEditingSlide(false);
        return;
      }

      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      setIsLoading(true);
      setErrorMsg(null);
      setIsEditingSlide(false);

      try {
        const idToken = await auth.currentUser?.getIdToken();
        if (!idToken) {
          throw new Error(
            '此功能僅限已登入之管理者使用，請先登入管理者帳號。',
          );
        }

        const response = await fetch('/api/ai/generate-slides', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${idToken}`,
          },
          signal: controller.signal,
          body: JSON.stringify({
            title: targetPost.title,
            summary: targetPost.summary,
            content: targetPost.content,
            author: targetPost.author,
            academicYear: targetPost.academicYear,
            category: formatCategoryDisplay(targetPost.category),
            publishedAt: targetPost.publishedAt,
            embedLabel: targetPost.embedLabel,
            audienceStyle: style,
          }),
        });

        const contentType = response.headers.get('content-type') || '';
        if (!contentType.includes('application/json')) {
          throw new Error(
            '目前所在的靜態網址環境未啟用後端 AI 服務，請於 AI Studio 預覽或全端伺服器環境中使用「AI 重新整理文字版」功能。',
          );
        }

        const payload = (await response.json()) as Partial<GeneratedArticleDeck> & {
          error?: string;
        };

        if (!response.ok || payload.error) {
          throw new Error(
            payload.error || `伺服器回應錯誤（${response.status}）`,
          );
        }

        if (!Array.isArray(payload.slides) || payload.slides.length === 0) {
          throw new Error('AI 未產生任何投影片，請點擊「重新生成」再試。');
        }

        const readyDeck: GeneratedArticleDeck = {
          deckTitle: payload.deckTitle || targetPost.title,
          deckSubtitle:
            payload.deckSubtitle ||
            targetPost.summary ||
            `${siteTitle} · 單篇教學精華簡報`,
          slides: payload.slides,
        };

        cacheRef.current[cacheKey] = readyDeck;
        setDeck(readyDeck);
        setActiveIndex(0);
      } catch (err: unknown) {
        if ((err as {name?: string})?.name === 'AbortError') return;
        setErrorMsg(
          err instanceof Error ? err.message : '生成簡報時發生錯誤，請稍後再試。',
        );
      } finally {
        if (abortRef.current === controller) {
          setIsLoading(false);
        }
      }
    },
    [siteTitle],
  );

  // Trigger AI generation only when in AI mode
  useEffect(() => {
    if (!post) {
      abortRef.current?.abort();
      setDeck(null);
      setErrorMsg(null);
      setIsLoading(false);
      setIsEditingSlide(false);
      return;
    }
    if (effectiveSource !== 'ai') {
      abortRef.current?.abort();
      setIsLoading(false);
      return;
    }
    void generateDeck(post, audienceStyle, false);
    return () => {
      abortRef.current?.abort();
    };
  }, [post, effectiveSource, audienceStyle, generateDeck]);

  // Track browser fullscreen state
  useEffect(() => {
    if (!post) return;
    const handleFsChange = () => {
      setIsFullscreen(Boolean(document.fullscreenElement));
    };
    document.addEventListener('fullscreenchange', handleFsChange);
    return () => {
      document.removeEventListener('fullscreenchange', handleFsChange);
    };
  }, [post]);

  const handleClose = useCallback(() => {
    if (document.fullscreenElement) {
      void document.exitFullscreen().catch(() => {});
    }
    onClose();
  }, [onClose]);

  const toggleFullscreen = useCallback(() => {
    const target = stageContainerRef.current || document.documentElement;
    if (document.fullscreenElement) {
      void document.exitFullscreen().catch(() => {});
    } else {
      void target.requestFullscreen?.().catch(() => {});
    }
  }, []);

  const totalSlides =
    effectiveSource === 'preset'
      ? pdfPageCount || presetDeck?.slides.length || 0
      : deck?.slides.length ?? 0;

  const goToSlide = useCallback(
    (nextIdx: number) => {
      if (totalSlides === 0) return;
      const bounded = Math.max(0, Math.min(totalSlides - 1, nextIdx));
      setActiveIndex(bounded);
      setIsEditingSlide(false);
    },
    [totalSlides],
  );

  // Keyboard navigation
  useEffect(() => {
    if (!post) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const inEditableField =
        target?.tagName === 'INPUT' ||
        target?.tagName === 'TEXTAREA' ||
        target?.isContentEditable;

      if (e.key === 'Escape') {
        e.stopPropagation();
        if (isEditingSlide) {
          setIsEditingSlide(false);
        } else {
          handleClose();
        }
        return;
      }

      if (inEditableField || totalSlides === 0) return;

      if (e.key === 'ArrowRight' || e.key === 'PageDown') {
        e.preventDefault();
        goToSlide(activeIndex + 1);
      } else if (e.key === 'ArrowLeft' || e.key === 'PageUp') {
        e.preventDefault();
        goToSlide(activeIndex - 1);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [post, isEditingSlide, totalSlides, activeIndex, goToSlide, handleClose]);

  const updateCurrentSlide = useCallback(
    (patch: Partial<ArticleSlideItem>) => {
      if (!post) return;
      setDeck((prev) => {
        if (!prev) return prev;
        const nextSlides = prev.slides.map((s, idx) =>
          idx === activeIndex ? {...s, ...patch} : s,
        );
        const updated = {...prev, slides: nextSlides};
        cacheRef.current[`${post.slug}::${audienceStyle}`] = updated;
        return updated;
      });
    },
    [post, activeIndex, audienceStyle],
  );

  const handleDownloadPdf = useCallback(async () => {
    if (!post || isExportingPdf) return;
    if (effectiveSource === 'preset' && presetDeck) {
      const link = document.createElement('a');
      link.href = presetDeck.pdfUrl;
      link.download = presetDeck.downloadFileName;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      return;
    }
    if (!deck) return;
    setIsExportingPdf(true);
    try {
      await exportArticleDeckPdf(deck, post, siteTitle, qrDataUrl);
    } finally {
      setIsExportingPdf(false);
    }
  }, [
    post,
    isExportingPdf,
    effectiveSource,
    presetDeck,
    deck,
    siteTitle,
    qrDataUrl,
  ]);

  if (!post) return null;

  const currentSlide = deck?.slides[activeIndex] ?? null;
  const normalizedCover = normalizeDriveImageUrl(post.coverImageUrl);
  const hasCover = Boolean(normalizedCover && !coverBroken);
  const categoryText = formatCategoryDisplay(post.category);
  const activePresetPage = activeIndex + 1;
  const activePresetSlideMeta = presetDeck?.slides[activeIndex];
  const activePresetImage = pdfSlides[activePresetPage] || '';

  const showToolbarActions =
    effectiveSource === 'preset'
      ? Boolean(presetDeck && !pdfError)
      : Boolean(currentSlide && !isLoading);

  return (
    <div
      ref={stageContainerRef}
      role="dialog"
      aria-modal="true"
      aria-label="期刊簡報投影工作台"
      className="fixed inset-0 z-[75] bg-[#081433] text-[#FBF9F5] flex flex-col overflow-hidden"
    >
      {/* Top Studio Control Header */}
      <header className="px-3.5 sm:px-6 py-2.5 bg-[#060F27] border-b border-white/12 flex flex-wrap items-center justify-between gap-2.5 shrink-0">
        <div className="flex items-center gap-2.5 min-w-0">
          <Presentation className="w-4 h-4 sm:w-5 sm:h-5 text-[#FDE68A] shrink-0" />
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-xs sm:text-sm font-bold text-white truncate">
              <span>
                {effectiveSource === 'preset' ? '期刊簡報投影' : 'AI 簡報工作台'}
              </span>
              <span aria-hidden="true" className="text-white/35">
                ·
              </span>
              <span className="font-normal text-blue-200/90 truncate max-w-[180px] sm:max-w-[300px]">
                {post.title}
              </span>
            </div>
          </div>
        </div>

        {/* Mode Switcher: Preset Deck vs AI Style Options */}
        <div className="flex flex-wrap items-center gap-2 max-w-full">
          {presetDeck && (
            <div
              className="flex items-center gap-1 p-1 rounded-lg bg-white/8 border border-white/12"
              role="group"
              aria-label="簡報來源切換"
            >
              <button
                type="button"
                onClick={() => {
                  setViewSource('preset');
                  setActiveIndex(0);
                  setIsEditingSlide(false);
                }}
                className={`px-2.5 py-1 text-xs rounded-md transition-colors whitespace-nowrap ${
                  effectiveSource === 'preset'
                    ? 'bg-[#FDE68A] text-[#081433] font-bold'
                    : 'text-blue-100/85 hover:text-white hover:bg-white/10'
                }`}
              >
                精選圖文簡報 ({presetDeck.slides.length}頁)
              </button>
              <button
                type="button"
                onClick={() => {
                  setViewSource('ai');
                  setActiveIndex(0);
                }}
                className={`px-2.5 py-1 text-xs rounded-md transition-colors whitespace-nowrap ${
                  effectiveSource === 'ai'
                    ? 'bg-[#FDE68A] text-[#081433] font-bold'
                    : 'text-blue-100/85 hover:text-white hover:bg-white/10'
                }`}
              >
                AI 生成文字版
              </button>
            </div>
          )}

          {effectiveSource === 'ai' && (
            <div
              className="flex items-center gap-1 p-1 rounded-lg bg-white/8 border border-white/12 overflow-x-auto max-w-full"
              role="group"
              aria-label="簡報整理風格"
            >
              {STYLE_OPTIONS.map((opt) => {
                const active = audienceStyle === opt.id;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    disabled={isLoading}
                    onClick={() => setAudienceStyle(opt.id)}
                    title={opt.hint}
                    className={`px-2.5 py-1 text-xs rounded-md transition-colors whitespace-nowrap shrink-0 ${
                      active
                        ? 'bg-[#FDE68A] text-[#081433] font-bold'
                        : 'text-blue-100/85 hover:text-white hover:bg-white/10'
                    } disabled:opacity-60`}
                  >
                    {opt.label}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Action Toolbar */}
        <div className="flex flex-wrap items-center gap-1.5 sm:gap-2 shrink-0">
          {effectiveSource === 'ai' && (
            <button
              type="button"
              disabled={isLoading}
              onClick={() => void generateDeck(post, audienceStyle, true)}
              title="重新呼叫 AI 整理此篇期刊簡報"
              className="px-2.5 py-1.5 rounded-lg bg-white/8 hover:bg-white/18 border border-white/15 text-xs font-medium text-white inline-flex items-center gap-1.5 transition-colors disabled:opacity-50 whitespace-nowrap"
            >
              <RefreshCw
                className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`}
              />
              <span className="hidden sm:inline">重新生成</span>
            </button>
          )}

          {showToolbarActions && (
            <>
              {effectiveSource === 'ai' && (
                <>
                  <button
                    type="button"
                    onClick={() => setIsEditingSlide((v) => !v)}
                    className={`px-2.5 py-1.5 rounded-lg border text-xs font-medium inline-flex items-center gap-1.5 transition-colors whitespace-nowrap ${
                      isEditingSlide
                        ? 'bg-[#FDE68A] text-[#081433] border-[#FDE68A] font-bold'
                        : 'bg-white/8 hover:bg-white/18 border-white/15 text-white'
                    }`}
                  >
                    <Edit3 className="w-3.5 h-3.5" />
                    <span className="hidden md:inline">
                      {isEditingSlide ? '完成微調' : '微調此頁'}
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setShowNotes((v) => !v)}
                    className={`px-2.5 py-1.5 rounded-lg border text-xs font-medium inline-flex items-center gap-1.5 transition-colors whitespace-nowrap ${
                      showNotes
                        ? 'bg-white/20 border-white/30 text-white'
                        : 'bg-white/8 hover:bg-white/18 border-white/15 text-blue-100/80'
                    }`}
                  >
                    <StickyNote className="w-3.5 h-3.5" />
                    <span className="hidden lg:inline">講稿</span>
                  </button>
                </>
              )}

              <button
                type="button"
                onClick={() => setShowCornerQr((v) => !v)}
                title="切換顯示文章 QR Code"
                className={`px-2.5 py-1.5 rounded-lg border text-xs font-medium inline-flex items-center gap-1.5 transition-colors whitespace-nowrap ${
                  showCornerQr
                    ? 'bg-white/20 border-white/30 text-[#FDE68A]'
                    : 'bg-white/8 hover:bg-white/18 border-white/15 text-white'
                }`}
              >
                <QrCode className="w-3.5 h-3.5" />
                <span className="hidden lg:inline">文章 QR</span>
              </button>

              <button
                type="button"
                disabled={isExportingPdf}
                onClick={() => void handleDownloadPdf()}
                className="px-2.5 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 border border-white/20 text-xs font-medium text-white inline-flex items-center gap-1.5 transition-colors disabled:opacity-50 whitespace-nowrap"
              >
                <Download className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">
                  {isExportingPdf
                    ? '匯出中...'
                    : effectiveSource === 'preset'
                      ? '下載原版 PDF'
                      : '匯出 PDF'}
                </span>
              </button>

              <button
                type="button"
                onClick={toggleFullscreen}
                className="hidden sm:inline-flex px-2.5 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 border border-white/20 text-xs font-medium text-white items-center gap-1.5 transition-colors whitespace-nowrap"
              >
                {isFullscreen ? (
                  <>
                    <Minimize2 className="w-3.5 h-3.5" />
                    <span>退出全螢幕</span>
                  </>
                ) : (
                  <>
                    <Maximize2 className="w-3.5 h-3.5" />
                    <span>全螢幕投影</span>
                  </>
                )}
              </button>
            </>
          )}

          <button
            type="button"
            onClick={handleClose}
            className="px-3 py-1.5 rounded-lg bg-[#FBF9F5] text-[#081433] hover:bg-[#FDE68A] text-xs font-bold inline-flex items-center gap-1.5 transition-colors whitespace-nowrap"
          >
            <X className="w-3.5 h-3.5" />
            <span>返回文章</span>
          </button>
        </div>
      </header>

      {/* Main Studio Body */}
      <div className="flex-1 min-h-0 flex flex-col lg:flex-row overflow-hidden">
        {/* Preset PDF Filmstrip Sidebar */}
        {effectiveSource === 'preset' &&
          presetDeck &&
          !isFullscreen &&
          !pdfError && (
            <aside
              aria-label="簡報頁面縮圖目錄"
              className="lg:w-64 shrink-0 bg-[#060F27]/75 border-b lg:border-b-0 lg:border-r border-white/10 p-2.5 sm:p-3 flex lg:flex-col gap-2.5 overflow-x-auto lg:overflow-y-auto"
            >
              {Array.from(
                {length: pdfPageCount || presetDeck.slides.length},
                (_, idx) => {
                  const pageNum = idx + 1;
                  const meta = presetDeck.slides[idx];
                  const thumbUrl = pdfThumbs[pageNum];
                  const isActive = idx === activeIndex;
                  return (
                    <button
                      key={pageNum}
                      type="button"
                      onClick={() => goToSlide(idx)}
                      className={`min-w-[164px] lg:min-w-0 w-auto lg:w-full text-left p-2 rounded-xl border transition-all shrink-0 space-y-1.5 ${
                        isActive
                          ? 'bg-[#1E3A8A]/70 border-[#FDE68A] shadow-md'
                          : 'bg-white/5 border-white/10 hover:bg-white/10'
                      }`}
                    >
                      <div className="aspect-[16/9] w-full rounded-lg overflow-hidden bg-[#0A183D] border border-white/10 flex items-center justify-center">
                        {thumbUrl ? (
                          <img
                            src={thumbUrl}
                            alt={`第 ${pageNum} 頁縮圖`}
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <FileText className="w-5 h-5 text-blue-200/40" />
                        )}
                      </div>
                      <div className="flex items-start gap-1.5 px-0.5">
                        <span
                          className={`text-[11px] font-mono-tabular shrink-0 ${
                            isActive
                              ? 'text-[#FDE68A] font-bold'
                              : 'text-blue-200/75'
                          }`}
                        >
                          {String(pageNum).padStart(2, '0')}
                        </span>
                        <span className="text-[11px] font-semibold text-white line-clamp-2 leading-snug">
                          {meta?.title || `第 ${pageNum} 頁`}
                        </span>
                      </div>
                    </button>
                  );
                },
              )}
            </aside>
          )}

        {/* AI Generated Slide Filmstrip Sidebar */}
        {effectiveSource === 'ai' && !isFullscreen && deck && !isLoading && (
          <aside
            aria-label="投影片頁面目錄"
            className="lg:w-64 shrink-0 bg-[#060F27]/75 border-b lg:border-b-0 lg:border-r border-white/10 p-2.5 sm:p-3 flex lg:flex-col gap-2 overflow-x-auto lg:overflow-y-auto"
          >
            {deck.slides.map((slide, idx) => {
              const isActive = idx === activeIndex;
              return (
                <button
                  key={`${idx}-${slide.heading}`}
                  type="button"
                  onClick={() => goToSlide(idx)}
                  className={`min-w-[168px] lg:min-w-0 w-auto lg:w-full text-left p-2.5 rounded-xl border transition-all shrink-0 ${
                    isActive
                      ? 'bg-[#1E3A8A]/70 border-[#FDE68A] shadow-md'
                      : 'bg-white/5 border-white/10 hover:bg-white/10'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2 text-[11px] font-mono-tabular mb-1">
                    <span
                      className={
                        isActive ? 'text-[#FDE68A] font-bold' : 'text-blue-200/75'
                      }
                    >
                      {String(idx + 1).padStart(2, '0')}
                    </span>
                    <span className="text-[10px] text-blue-100/70 truncate">
                      {slide.kicker}
                    </span>
                  </div>
                  <div className="text-xs font-semibold text-white line-clamp-2 leading-snug">
                    {slide.heading}
                  </div>
                </button>
              );
            })}
          </aside>
        )}

        {/* Center Projector Viewport */}
        <main className="flex-1 min-w-0 min-h-0 flex flex-col justify-between p-3 sm:p-6 lg:p-8 overflow-y-auto">
          {effectiveSource === 'preset' && presetDeck ? (
            pdfError ? (
              <div className="flex-1 flex flex-col items-center justify-center text-center max-w-lg mx-auto space-y-4 py-12">
                <div className="w-12 h-12 rounded-2xl bg-rose-500/20 border border-rose-400/40 flex items-center justify-center text-rose-200">
                  <AlertCircle className="w-6 h-6" />
                </div>
                <p className="text-sm text-blue-100/90 leading-relaxed">
                  {pdfError}
                </p>
                <a
                  href={presetDeck.pdfUrl}
                  download={presetDeck.downloadFileName}
                  className="px-4 py-2 rounded-lg bg-[#FDE68A] text-[#081433] text-xs font-bold inline-flex items-center gap-1.5"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>直接下載原版 PDF</span>
                </a>
              </div>
            ) : (
              <div className="flex-1 min-h-0 flex flex-col justify-center gap-4 max-w-6xl w-full mx-auto">
                <div className="relative rounded-2xl border border-white/15 bg-[#0A183D] shadow-2xl overflow-hidden aspect-[16/9] w-full flex items-center justify-center">
                  {activePresetImage ? (
                    <img
                      src={activePresetImage}
                      alt={
                        activePresetSlideMeta?.title ||
                        `第 ${activePresetPage} 頁簡報`
                      }
                      className="w-full h-full object-contain bg-[#0A183D]"
                    />
                  ) : (
                    <div className="flex flex-col items-center gap-3 text-blue-200">
                      <Loader2 className="w-7 h-7 animate-spin text-[#FDE68A]" />
                      <span className="text-xs sm:text-sm">
                        {pdfLoading
                          ? '正在載入精選圖文簡報...'
                          : `正在繪製第 ${activePresetPage} 頁投影片...`}
                      </span>
                    </div>
                  )}

                  {showCornerQr && qrDataUrl && (
                    <div className="hidden sm:block absolute bottom-4 right-4 bg-white/95 backdrop-blur-md border border-stone-200 rounded-2xl p-2.5 text-center shadow-2xl w-32 sm:w-36 space-y-1">
                      <img
                        src={qrDataUrl}
                        alt="文章原文 QR Code"
                        className="w-24 h-24 sm:w-28 sm:h-28 mx-auto object-contain"
                      />
                      <div className="text-[10px] font-bold text-[#1E3A8A]">
                        掃碼看文章原文
                      </div>
                    </div>
                  )}
                </div>

                <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
                  <div className="flex-1 bg-[#0F2354] border border-[#2B4B9E] rounded-xl px-4 py-2.5 text-xs sm:text-sm text-blue-100 leading-relaxed min-w-0">
                    <span className="font-bold text-[#FDE68A] mr-2">
                      第 {String(activePresetPage).padStart(2, '0')} 頁：
                    </span>
                    <span className="font-semibold text-white">
                      {activePresetSlideMeta?.title || presetDeck.deckTitle}
                    </span>
                    {activePresetSlideMeta?.subtitle && (
                      <span className="text-blue-200/80 ml-2 hidden md:inline">
                        — {activePresetSlideMeta.subtitle}
                      </span>
                    )}
                  </div>

                  <div className="flex items-center justify-end gap-2 shrink-0">
                    <button
                      type="button"
                      disabled={activeIndex <= 0}
                      onClick={() => goToSlide(activeIndex - 1)}
                      className="px-3.5 py-2 rounded-lg bg-white/10 hover:bg-white/20 border border-white/15 text-xs font-semibold text-white inline-flex items-center gap-1.5 disabled:opacity-35 transition-colors"
                    >
                      <ChevronLeft className="w-4 h-4" />
                      <span>上一頁</span>
                    </button>
                    <span className="px-2.5 text-xs font-mono-tabular text-[#FDE68A] font-bold">
                      {String(activePresetPage).padStart(2, '0')} /{' '}
                      {String(totalSlides).padStart(2, '0')}
                    </span>
                    <button
                      type="button"
                      disabled={activeIndex >= totalSlides - 1}
                      onClick={() => goToSlide(activeIndex + 1)}
                      className="px-3.5 py-2 rounded-lg bg-[#FDE68A] hover:bg-amber-200 text-xs font-bold text-[#081433] inline-flex items-center gap-1.5 disabled:opacity-35 transition-colors"
                    >
                      <span>下一頁</span>
                      <ChevronRight className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            )
          ) : isLoading ? (
            <div className="flex-1 flex flex-col items-center justify-center text-center max-w-md mx-auto space-y-4 py-12">
              <div className="w-14 h-14 rounded-2xl bg-[#1E3A8A]/50 border border-[#93C5FD]/30 flex items-center justify-center">
                <Loader2 className="w-7 h-7 text-[#FDE68A] animate-spin" />
              </div>
              <div className="space-y-1.5">
                <h3 className="font-editorial text-xl font-bold text-white">
                  AI 正在整理期刊為簡報結構
                </h3>
                <p className="text-sm text-blue-200/85 leading-relaxed">
                  正在分析「{post.title}」的教學脈絡、重點步驟與課堂亮點，自動編排為適合現場投影的簡報...
                </p>
              </div>
            </div>
          ) : errorMsg ? (
            <div className="flex-1 flex flex-col items-center justify-center text-center max-w-lg mx-auto space-y-4 py-12">
              <div className="w-12 h-12 rounded-2xl bg-rose-500/20 border border-rose-400/40 flex items-center justify-center text-rose-200">
                <AlertCircle className="w-6 h-6" />
              </div>
              <div className="space-y-2">
                <h3 className="text-lg font-bold text-white">
                  無法自動生成簡報
                </h3>
                <p className="text-sm text-blue-100/90 leading-relaxed">
                  {errorMsg}
                </p>
              </div>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => void generateDeck(post, audienceStyle, true)}
                  className="px-4 py-2 rounded-lg bg-[#FDE68A] text-[#081433] text-xs font-bold hover:bg-amber-200 inline-flex items-center gap-1.5 transition-colors"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  <span>再試一次</span>
                </button>
                <button
                  type="button"
                  onClick={handleClose}
                  className="px-4 py-2 rounded-lg bg-white/10 text-white border border-white/20 text-xs font-medium hover:bg-white/20 transition-colors"
                >
                  返回文章閱讀
                </button>
              </div>
            </div>
          ) : currentSlide && deck ? (
            <div className="flex-1 min-h-0 flex flex-col justify-center gap-4 max-w-6xl w-full mx-auto">
              {/* 16:9 Slide Canvas */}
              {isEditingSlide ? (
                <div className="bg-[#FBF9F5] text-stone-950 rounded-2xl border border-stone-200 shadow-2xl p-5 sm:p-8 space-y-4">
                  <div className="flex items-center justify-between pb-3 border-b border-stone-200">
                    <div className="text-sm font-bold text-[#1E3A8A]">
                      微調第 {activeIndex + 1} 頁投影片內容
                    </div>
                    <button
                      type="button"
                      onClick={() => setIsEditingSlide(false)}
                      className="px-3 py-1.5 rounded-lg bg-[#1E3A8A] text-white text-xs font-semibold inline-flex items-center gap-1.5"
                    >
                      <Check className="w-3.5 h-3.5" />
                      <span>套用預覽</span>
                    </button>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <label className="text-xs font-semibold text-stone-700">
                        段落標籤
                      </label>
                      <input
                        type="text"
                        value={currentSlide.kicker}
                        onChange={(e) =>
                          updateCurrentSlide({kicker: e.target.value})
                        }
                        className="w-full px-3 py-2 text-sm bg-white border border-stone-300 rounded-lg focus:outline-none focus:border-[#1E3A8A]"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-xs font-semibold text-stone-700">
                        投影片標題
                      </label>
                      <input
                        type="text"
                        value={currentSlide.heading}
                        onChange={(e) =>
                          updateCurrentSlide({heading: e.target.value})
                        }
                        className="w-full px-3 py-2 text-sm bg-white border border-stone-300 rounded-lg focus:outline-none focus:border-[#1E3A8A]"
                      />
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-stone-700">
                      投影重點條列（每行一條）
                    </label>
                    <textarea
                      rows={5}
                      value={currentSlide.bullets.join('\n')}
                      onChange={(e) =>
                        updateCurrentSlide({
                          bullets: e.target.value
                            .split('\n')
                            .map((line) => line.trim()),
                        })
                      }
                      className="w-full px-3 py-2 text-sm bg-white border border-stone-300 rounded-lg focus:outline-none focus:border-[#1E3A8A]"
                    />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <label className="text-xs font-semibold text-stone-700">
                        教學亮點／提問框（選填）
                      </label>
                      <input
                        type="text"
                        value={currentSlide.highlightBox}
                        onChange={(e) =>
                          updateCurrentSlide({highlightBox: e.target.value})
                        }
                        className="w-full px-3 py-2 text-sm bg-white border border-stone-300 rounded-lg focus:outline-none focus:border-[#1E3A8A]"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-xs font-semibold text-stone-700">
                        講者備忘講稿
                      </label>
                      <input
                        type="text"
                        value={currentSlide.speakerNotes}
                        onChange={(e) =>
                          updateCurrentSlide({speakerNotes: e.target.value})
                        }
                        className="w-full px-3 py-2 text-sm bg-white border border-stone-300 rounded-lg focus:outline-none focus:border-[#1E3A8A]"
                      />
                    </div>
                  </div>
                </div>
              ) : activeIndex === 0 || currentSlide.slideType === 'cover' ? (
                /* Cover Slide Layout */
                <section className="relative rounded-2xl border border-white/15 bg-[#0A183D] shadow-2xl overflow-hidden min-h-[420px] sm:min-h-[500px] lg:aspect-[16/9] flex flex-col justify-between p-6 sm:p-10 lg:p-12">
                  {hasCover && (
                    <div aria-hidden="true" className="absolute inset-0">
                      <img
                        src={normalizedCover}
                        alt=""
                        referrerPolicy="no-referrer"
                        onError={() => setCoverBroken(true)}
                        className="w-full h-full object-cover object-center opacity-25"
                      />
                      <div className="absolute inset-0 bg-gradient-to-r from-[#081433] via-[#081433]/92 to-[#081433]/75" />
                    </div>
                  )}

                  <div className="relative z-10 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs sm:text-sm text-[#FDE68A] font-semibold">
                    <span>{siteTitle}</span>
                    <span aria-hidden="true" className="text-white/40">
                      ·
                    </span>
                    <span className="font-mono-tabular text-blue-100">
                      {post.academicYear}
                    </span>
                    {categoryText && (
                      <>
                        <span aria-hidden="true" className="text-white/40">
                          ·
                        </span>
                        <span className="text-blue-100 font-normal">
                          {categoryText}
                        </span>
                      </>
                    )}
                  </div>

                  <div className="relative z-10 grid grid-cols-1 lg:grid-cols-12 gap-6 items-center my-auto py-4">
                    <div
                      className={`${
                        showCornerQr && qrDataUrl
                          ? 'lg:col-span-8'
                          : 'lg:col-span-12'
                      } space-y-4`}
                    >
                      <h1 className="font-editorial text-2xl sm:text-4xl lg:text-[42px] font-bold text-white leading-[1.24] text-balance">
                        {deck.deckTitle || currentSlide.heading}
                      </h1>
                      <p className="text-base sm:text-lg text-blue-100/90 leading-relaxed max-w-3xl">
                        {deck.deckSubtitle}
                      </p>

                      {currentSlide.bullets.filter(Boolean).length > 0 && (
                        <ul className="pt-2 space-y-2.5">
                          {currentSlide.bullets
                            .filter(Boolean)
                            .slice(0, 4)
                            .map((item, idx) => (
                              <li
                                key={idx}
                                className="flex items-start gap-2.5 text-sm sm:text-base text-stone-100"
                              >
                                <span
                                  aria-hidden="true"
                                  className="mt-2 w-1.5 h-1.5 rounded-full bg-[#FDE68A] shrink-0"
                                />
                                <span>{item}</span>
                              </li>
                            ))}
                        </ul>
                      )}
                    </div>

                    {showCornerQr && qrDataUrl && (
                      <div className="lg:col-span-4 flex justify-start lg:justify-end">
                        <div className="bg-white rounded-2xl p-3.5 text-center shadow-xl w-44 sm:w-48 space-y-2">
                          <img
                            src={qrDataUrl}
                            alt={`掃碼開啟「${post.title}」`}
                            className="w-36 h-36 sm:w-40 sm:h-40 mx-auto object-contain"
                          />
                          <div className="text-[11px] font-bold text-[#1E3A8A]">
                            掃碼閱讀期刊原文
                          </div>
                        </div>
                      </div>
                    )}
                  </div>

                  <footer className="relative z-10 pt-4 border-t border-white/15 flex flex-wrap items-center justify-between gap-2 text-xs sm:text-sm text-blue-200/85">
                    <div>
                      撰稿與彙整：{post.author || 'Pes'} · {post.publishedAt}
                    </div>
                    <div className="font-mono-tabular font-bold text-[#FDE68A]">
                      01 / {String(totalSlides).padStart(2, '0')}
                    </div>
                  </footer>
                </section>
              ) : (
                /* Content Slide Layout */
                <section className="relative rounded-2xl border border-stone-200 bg-[#FBF9F5] text-stone-950 shadow-2xl overflow-hidden min-h-[420px] sm:min-h-[500px] lg:aspect-[16/9] flex flex-col justify-between p-6 sm:p-10 lg:p-12">
                  <div className="space-y-3 pb-4 border-b border-stone-200">
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-xs sm:text-sm font-bold tracking-wide text-[#1E3A8A]">
                        {currentSlide.kicker}
                      </span>
                      <span className="text-xs font-mono-tabular text-stone-500">
                        {post.academicYear} · {categoryText}
                      </span>
                    </div>
                    <h2 className="font-editorial text-xl sm:text-3xl lg:text-[34px] font-bold text-stone-950 leading-[1.28] text-balance">
                      {currentSlide.heading}
                    </h2>
                  </div>

                  <div className="my-auto py-5 grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
                    <div
                      className={
                        showCornerQr && qrDataUrl
                          ? 'lg:col-span-9 space-y-4'
                          : 'lg:col-span-12 space-y-4'
                      }
                    >
                      <ul className="space-y-3.5 sm:space-y-4">
                        {currentSlide.bullets
                          .filter(Boolean)
                          .map((bullet, idx) => (
                            <li
                              key={idx}
                              className="flex items-start gap-3 text-base sm:text-lg lg:text-[20px] text-stone-800 leading-[1.55]"
                            >
                              {currentSlide.slideType === 'steps' ? (
                                <span className="mt-0.5 w-6 h-6 sm:w-7 sm:h-7 rounded-lg bg-[#1E3A8A] text-white text-xs sm:text-sm font-mono-tabular font-bold flex items-center justify-center shrink-0">
                                  {idx + 1}
                                </span>
                              ) : (
                                <span
                                  aria-hidden="true"
                                  className="mt-2.5 w-2 h-2 rounded-full bg-[#1E3A8A] shrink-0"
                                />
                              )}
                              <span>{bullet}</span>
                            </li>
                          ))}
                      </ul>

                      {currentSlide.highlightBox && (
                        <div className="mt-4 p-4 sm:p-5 rounded-xl bg-[#F2EDE4] border border-stone-200 space-y-1">
                          <div className="text-xs font-bold text-[#92400E]">
                            教學亮點與思考提問
                          </div>
                          <p className="text-sm sm:text-base font-semibold text-stone-900 leading-relaxed">
                            {currentSlide.highlightBox}
                          </p>
                        </div>
                      )}
                    </div>

                    {showCornerQr && qrDataUrl && (
                      <div className="hidden lg:flex lg:col-span-3 justify-end self-end">
                        <div className="bg-white border border-stone-200 rounded-xl p-2.5 text-center shadow-xs w-36 space-y-1.5">
                          <img
                            src={qrDataUrl}
                            alt="文章原文 QR Code"
                            className="w-28 h-28 mx-auto object-contain"
                          />
                          <div className="text-[10px] font-bold text-[#1E3A8A]">
                            掃碼看原文與附件
                          </div>
                        </div>
                      </div>
                    )}
                  </div>

                  <footer className="pt-3.5 border-t border-stone-200 flex items-center justify-between gap-3 text-xs sm:text-sm text-stone-500">
                    <span className="truncate">
                      {siteTitle} · {post.title}
                    </span>
                    <span className="font-mono-tabular font-bold text-[#1E3A8A] shrink-0">
                      {String(activeIndex + 1).padStart(2, '0')} /{' '}
                      {String(totalSlides).padStart(2, '0')}
                    </span>
                  </footer>
                </section>
              )}

              {/* Bottom Navigation & Speaker Notes Bar */}
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
                {showNotes && currentSlide.speakerNotes ? (
                  <div className="flex-1 bg-[#0F2354] border border-[#2B4B9E] rounded-xl px-4 py-2.5 text-xs sm:text-sm text-blue-100 leading-relaxed">
                    <span className="font-bold text-[#FDE68A] mr-2">
                      講者備忘：
                    </span>
                    <span>{currentSlide.speakerNotes}</span>
                  </div>
                ) : (
                  <div className="text-xs text-blue-200/70">
                    提示：可用鍵盤 ← / → 方向鍵切換投影片，Esc 返回文章
                  </div>
                )}

                <div className="flex items-center justify-end gap-2 shrink-0">
                  <button
                    type="button"
                    disabled={activeIndex <= 0}
                    onClick={() => goToSlide(activeIndex - 1)}
                    className="px-3.5 py-2 rounded-lg bg-white/10 hover:bg-white/20 border border-white/15 text-xs font-semibold text-white inline-flex items-center gap-1.5 disabled:opacity-35 transition-colors"
                  >
                    <ChevronLeft className="w-4 h-4" />
                    <span>上一頁</span>
                  </button>
                  <span className="px-2.5 text-xs font-mono-tabular text-[#FDE68A] font-bold">
                    {String(activeIndex + 1).padStart(2, '0')} /{' '}
                    {String(totalSlides).padStart(2, '0')}
                  </span>
                  <button
                    type="button"
                    disabled={activeIndex >= totalSlides - 1}
                    onClick={() => goToSlide(activeIndex + 1)}
                    className="px-3.5 py-2 rounded-lg bg-[#FDE68A] hover:bg-amber-200 text-xs font-bold text-[#081433] inline-flex items-center gap-1.5 disabled:opacity-35 transition-colors"
                  >
                    <span>下一頁</span>
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          ) : null}
        </main>
      </div>
    </div>
  );
};
