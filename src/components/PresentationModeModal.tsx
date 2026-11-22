import React, {useCallback, useEffect, useMemo, useState} from 'react';
import QRCode from 'qrcode';
import {
  ArrowRight,
  Check,
  ChevronLeft,
  ChevronRight,
  Copy,
  FileText,
  Lock,
  Maximize2,
  Minimize2,
  MonitorPlay,
  Pause,
  Play,
  Presentation,
  QrCode,
  Table2,
  Video,
  X,
} from 'lucide-react';
import {JournalPost} from '../types/journal';
import {inferEmbedProvider} from '../services/sheetsDb';
import {
  estimateReadMinutes,
  formatCategoryDisplay,
  normalizeDriveImageUrl,
} from '../utils/postFormatting';

const ROTATION_INTERVAL_MS = 15000;

interface PresentationModeModalProps {
  isOpen: boolean;
  posts: JournalPost[];
  siteTitle: string;
  checkPostLocked?: (post: JournalPost) => boolean;
  onClose: () => void;
  onSelectPost: (post: JournalPost) => void;
}

export const PresentationModeModal: React.FC<PresentationModeModalProps> = ({
  isOpen,
  posts,
  siteTitle,
  checkPostLocked,
  onClose,
  onSelectPost,
}) => {
  const [activeIndex, setActiveIndex] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const [remainingMs, setRemainingMs] = useState(ROTATION_INTERVAL_MS);
  const [failedImageSlugs, setFailedImageSlugs] = useState<
    Record<string, boolean>
  >({});
  const [qrState, setQrState] = useState<{url: string; dataUrl: string} | null>(
    null,
  );
  const [copiedUrl, setCopiedUrl] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);

  // Reset state cleanly whenever entering Presentation Mode
  useEffect(() => {
    if (!isOpen) return;
    setActiveIndex(0);
    setIsPaused(false);
    setRemainingMs(ROTATION_INTERVAL_MS);
    setCopiedUrl(false);
  }, [isOpen]);

  // Keep activeIndex in bounds if posts array changes
  useEffect(() => {
    if (posts.length > 0 && activeIndex >= posts.length) {
      setActiveIndex(0);
      setRemainingMs(ROTATION_INTERVAL_MS);
    }
  }, [posts.length, activeIndex]);

  // Track native browser fullscreen changes
  useEffect(() => {
    if (!isOpen) return;
    const handleFsChange = () => {
      setIsFullscreen(Boolean(document.fullscreenElement));
    };
    document.addEventListener('fullscreenchange', handleFsChange);
    return () => {
      document.removeEventListener('fullscreenchange', handleFsChange);
    };
  }, [isOpen]);

  const handleClose = useCallback(() => {
    if (document.fullscreenElement) {
      void document.exitFullscreen().catch(() => {
        // Ignore fullscreen exit errors
      });
    }
    onClose();
  }, [onClose]);

  const goToIndex = useCallback(
    (nextIndex: number) => {
      if (posts.length === 0) return;
      const normalized =
        ((nextIndex % posts.length) + posts.length) % posts.length;
      setActiveIndex(normalized);
      setRemainingMs(ROTATION_INTERVAL_MS);
      setCopiedUrl(false);
    },
    [posts.length],
  );

  const handlePrev = useCallback(() => {
    goToIndex(activeIndex - 1);
  }, [activeIndex, goToIndex]);

  const handleNext = useCallback(() => {
    goToIndex(activeIndex + 1);
  }, [activeIndex, goToIndex]);

  const togglePause = useCallback(() => {
    setIsPaused((prev) => !prev);
  }, []);

  const toggleFullscreen = useCallback(() => {
    if (typeof document === 'undefined') return;
    if (document.fullscreenElement) {
      void document.exitFullscreen().catch(() => {
        // Ignore if blocked
      });
    } else {
      void document.documentElement.requestFullscreen?.().catch(() => {
        // Ignore if embedded sandbox blocks fullscreen
      });
    }
  }, []);

  // 15-second auto-carousel timer using wall-clock timestamps to prevent drift
  useEffect(() => {
    if (!isOpen || isPaused || posts.length <= 1) return;

    let lastTick = Date.now();
    const timer = window.setInterval(() => {
      const now = Date.now();
      const delta = now - lastTick;
      lastTick = now;

      setRemainingMs((prev) => {
        const next = prev - delta;
        if (next <= 0) {
          setActiveIndex((idx) => (idx + 1) % posts.length);
          setCopiedUrl(false);
          return ROTATION_INTERVAL_MS;
        }
        return next;
      });
    }, 100);

    return () => window.clearInterval(timer);
  }, [isOpen, isPaused, posts.length, activeIndex]);

  // Keyboard shortcuts for presenter remote / keyboard control
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        handleClose();
      } else if (e.key === 'ArrowRight' || e.key === 'PageDown') {
        e.preventDefault();
        handleNext();
      } else if (e.key === 'ArrowLeft' || e.key === 'PageUp') {
        e.preventDefault();
        handlePrev();
      } else if (e.key === ' ') {
        const target = e.target as HTMLElement | null;
        if (target?.tagName !== 'BUTTON' && target?.tagName !== 'A') {
          e.preventDefault();
          togglePause();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, handleClose, handleNext, handlePrev, togglePause]);

  const currentPost = posts[activeIndex] ?? posts[0] ?? null;

  const currentShareUrl = useMemo(() => {
    if (typeof window === 'undefined' || !currentPost) return '';
    return `${window.location.origin}${window.location.pathname}${window.location.search}#post=${encodeURIComponent(currentPost.slug)}`;
  }, [currentPost]);

  // Generate QR code synced strictly to the currently displayed slide's article
  useEffect(() => {
    if (!isOpen || !currentShareUrl) return;
    let cancelled = false;
    void QRCode.toDataURL(currentShareUrl, {
      margin: 2,
      width: 420,
      errorCorrectionLevel: 'M',
      color: {dark: '#0C1D47', light: '#FFFFFF'},
    })
      .then((dataUrl) => {
        if (!cancelled) {
          setQrState({url: currentShareUrl, dataUrl});
        }
      })
      .catch((err) => {
        console.error('Failed to generate presentation QR code:', err);
      });
    return () => {
      cancelled = true;
    };
  }, [isOpen, currentShareUrl]);

  const handleCopySlideUrl = useCallback(() => {
    if (!currentShareUrl) return;
    void navigator.clipboard.writeText(currentShareUrl).then(() => {
      setCopiedUrl(true);
      setTimeout(() => setCopiedUrl(false), 2000);
    });
  }, [currentShareUrl]);

  if (!isOpen || !currentPost) return null;

  const isLocked = checkPostLocked ? checkPostLocked(currentPost) : false;
  const normalizedCover = normalizeDriveImageUrl(currentPost.coverImageUrl);
  const hasCover = Boolean(
    !isLocked && normalizedCover && !failedImageSlugs[currentPost.slug],
  );
  const embedMeta = currentPost.embedUrl
    ? inferEmbedProvider(currentPost.embedUrl)
    : null;
  const readMins = estimateReadMinutes(
    currentPost.content || currentPost.summary,
  );
  const categoryText = formatCategoryDisplay(currentPost.category);
  const secondsLeft = Math.max(1, Math.ceil(remainingMs / 1000));
  const progressFraction =
    posts.length > 1
      ? Math.min(1, Math.max(0, 1 - remainingMs / ROTATION_INTERVAL_MS))
      : 1;
  const activeQrDataUrl =
    qrState && qrState.url === currentShareUrl ? qrState.dataUrl : '';

  const renderEmbedIcon = () => {
    if (!embedMeta)
      return <FileText className="w-4 h-4 text-[#1E3A8A] shrink-0" />;
    if (embedMeta.provider === '站內互動網頁') {
      return <MonitorPlay className="w-4 h-4 text-[#1E3A8A] shrink-0" />;
    }
    if (embedMeta.provider === 'Google Meet') {
      return <Video className="w-4 h-4 text-[#1E3A8A] shrink-0" />;
    }
    if (embedMeta.provider === 'Google Sheets') {
      return <Table2 className="w-4 h-4 text-[#1E3A8A] shrink-0" />;
    }
    return <FileText className="w-4 h-4 text-[#1E3A8A] shrink-0" />;
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="簡報投影輪播模式"
      className="fixed inset-0 z-[80] w-screen h-screen bg-[#081433] text-[#FBF9F5] flex flex-col overflow-y-auto lg:overflow-hidden"
    >
      {/* Top Presenter Control Header */}
      <header className="px-4 sm:px-8 py-3 bg-[#060F27]/95 border-b border-white/10 flex flex-wrap items-center justify-between gap-3 shrink-0">
        <div className="flex items-center gap-2.5 min-w-0">
          <Presentation className="w-4 h-4 sm:w-5 sm:h-5 text-[#FDE68A] shrink-0" />
          <span className="font-editorial text-sm sm:text-base font-bold text-white truncate">
            {siteTitle}
          </span>
          <span aria-hidden="true" className="text-white/35 hidden sm:inline">
            ·
          </span>
          <span className="text-xs sm:text-sm text-blue-200/90 whitespace-nowrap hidden sm:inline">
            簡報模式（本期焦點自動輪播）
          </span>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {posts.length > 1 && (
            <>
              <div className="flex items-center gap-1 text-xs font-mono-tabular text-blue-100/95 px-2.5 py-1.5 rounded-lg bg-white/8 border border-white/12 whitespace-nowrap">
                <span>
                  {String(activeIndex + 1).padStart(2, '0')} /{' '}
                  {String(posts.length).padStart(2, '0')}
                </span>
                <span aria-hidden="true" className="text-white/35 mx-1">
                  ·
                </span>
                <span className="text-[#FDE68A]">
                  {isPaused ? '已暫停' : `${secondsLeft}s`}
                </span>
              </div>

              <button
                type="button"
                onClick={handlePrev}
                aria-label="上一篇焦點文章"
                title="上一篇（← 鍵）"
                className="p-2 rounded-lg bg-white/8 border border-white/12 text-white hover:bg-white/18 transition-colors"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>

              <button
                type="button"
                onClick={togglePause}
                aria-label={isPaused ? '繼續輪播' : '暫停輪播'}
                title={isPaused ? '繼續自動輪播（空白鍵）' : '暫停輪播（空白鍵）'}
                className="px-3 py-1.5 rounded-lg bg-white/8 border border-white/12 text-xs font-medium text-white hover:bg-white/18 inline-flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0"
              >
                {isPaused ? (
                  <>
                    <Play className="w-3.5 h-3.5 text-[#FDE68A]" />
                    <span>繼續</span>
                  </>
                ) : (
                  <>
                    <Pause className="w-3.5 h-3.5 text-[#FDE68A]" />
                    <span>暫停</span>
                  </>
                )}
              </button>

              <button
                type="button"
                onClick={handleNext}
                aria-label="下一篇焦點文章"
                title="下一篇（→ 鍵）"
                className="p-2 rounded-lg bg-white/8 border border-white/12 text-white hover:bg-white/18 transition-colors"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </>
          )}

          <button
            type="button"
            onClick={toggleFullscreen}
            aria-label={isFullscreen ? '退出全螢幕' : '切換全螢幕'}
            title={isFullscreen ? '退出全螢幕' : '切換瀏覽器全螢幕投影'}
            className="hidden sm:inline-flex px-3 py-1.5 rounded-lg bg-white/8 border border-white/12 text-xs font-medium text-white hover:bg-white/18 items-center gap-1.5 transition-colors whitespace-nowrap shrink-0"
          >
            {isFullscreen ? (
              <>
                <Minimize2 className="w-3.5 h-3.5" />
                <span>退出全螢幕</span>
              </>
            ) : (
              <>
                <Maximize2 className="w-3.5 h-3.5" />
                <span>全螢幕</span>
              </>
            )}
          </button>

          <button
            type="button"
            onClick={handleClose}
            className="px-3 py-1.5 rounded-lg bg-[#FBF9F5] text-[#081433] hover:bg-[#FDE68A] text-xs font-bold inline-flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0"
          >
            <X className="w-3.5 h-3.5" />
            <span>結束簡報</span>
          </button>
        </div>
      </header>

      {/* 15-Second Auto-Advance Hairline Progress Bar */}
      <div
        aria-hidden="true"
        className="h-1 w-full bg-white/10 shrink-0 overflow-hidden"
      >
        <div
          className="h-full w-full bg-gradient-to-r from-[#F59E0B] via-[#FDE68A] to-[#93C5FD] origin-left"
          style={{transform: `scaleX(${progressFraction})`}}
        />
      </div>

      {/* Main Projector Stage */}
      <main className="flex-1 min-h-0 w-full max-w-[1380px] mx-auto px-4 sm:px-8 py-4 sm:py-6 grid grid-cols-1 lg:grid-cols-12 gap-5 lg:gap-7 items-stretch">
        {/* Left 8 Columns: High-Contrast Archival Slide Card */}
        <article
          key={currentPost.slug}
          onClick={() => {
            handleClose();
            onSelectPost(currentPost);
          }}
          className="lg:col-span-8 min-w-0 bg-[#FBF9F5] text-stone-950 rounded-2xl border border-stone-200/80 shadow-2xl overflow-hidden flex flex-col cursor-pointer group"
        >
          {/* Slide Hero Stage */}
          <div className="relative h-48 sm:h-60 lg:h-[42%] lg:min-h-[210px] lg:max-h-[320px] w-full shrink-0 overflow-hidden bg-[#0A183D] border-b border-stone-200">
            {hasCover ? (
              <>
                <img
                  src={normalizedCover}
                  alt={currentPost.title}
                  draggable={false}
                  referrerPolicy="no-referrer"
                  onError={() =>
                    setFailedImageSlugs((prev) => ({
                      ...prev,
                      [currentPost.slug]: true,
                    }))
                  }
                  className="w-full h-full object-cover object-top transition-transform duration-700 ease-out group-hover:scale-[1.03]"
                />
                <div
                  aria-hidden="true"
                  className="absolute inset-0 bg-gradient-to-t from-[#081433]/90 via-[#081433]/25 to-[#081433]/40"
                />
              </>
            ) : (
              <div aria-hidden="true" className="absolute inset-0">
                <svg
                  viewBox="0 0 800 320"
                  className="w-full h-full object-cover"
                  preserveAspectRatio="xMidYMid slice"
                >
                  <defs>
                    <pattern
                      id="pres-blueprint-grid"
                      width="32"
                      height="32"
                      patternUnits="userSpaceOnUse"
                    >
                      <path
                        d="M 32 0 L 0 0 0 32"
                        fill="none"
                        stroke="rgba(147, 197, 253, 0.14)"
                        strokeWidth="1"
                      />
                    </pattern>
                    <radialGradient
                      id="pres-blueprint-glow"
                      cx="74%"
                      cy="44%"
                      r="55%"
                    >
                      <stop
                        offset="0%"
                        stopColor="rgba(253, 230, 138, 0.28)"
                      />
                      <stop
                        offset="55%"
                        stopColor="rgba(59, 130, 246, 0.14)"
                      />
                      <stop offset="100%" stopColor="rgba(10, 24, 61, 0)" />
                    </radialGradient>
                  </defs>
                  <rect width="800" height="320" fill="#0A183D" />
                  <rect
                    width="800"
                    height="320"
                    fill="url(#pres-blueprint-grid)"
                  />
                  <rect
                    width="800"
                    height="320"
                    fill="url(#pres-blueprint-glow)"
                  />
                  <circle
                    cx="590"
                    cy="155"
                    r="112"
                    fill="none"
                    stroke="rgba(253, 230, 138, 0.36)"
                    strokeWidth="1.5"
                  />
                  <circle
                    cx="590"
                    cy="155"
                    r="72"
                    fill="none"
                    stroke="rgba(147, 197, 253, 0.34)"
                    strokeWidth="1.2"
                    strokeDasharray="6 6"
                  />
                  <polygon
                    points="590,56 676,204 504,204"
                    fill="rgba(253, 230, 138, 0.08)"
                    stroke="rgba(253, 230, 138, 0.6)"
                    strokeWidth="1.5"
                  />
                  <line
                    x1="80"
                    y1="230"
                    x2="720"
                    y2="82"
                    stroke="rgba(147, 197, 253, 0.24)"
                    strokeWidth="1.2"
                  />
                </svg>
                <div className="absolute inset-0 bg-gradient-to-t from-[#081433]/80 via-transparent to-[#081433]/30" />
              </div>
            )}

            {/* Clean Unboxed Slide Metadata Strip */}
            <div className="absolute inset-x-0 top-0 px-5 sm:px-8 pt-4 sm:pt-5 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs sm:text-sm">
              <span className="font-bold tracking-wide text-[#FDE68A]">
                本期焦點
              </span>
              {categoryText && (
                <>
                  <span aria-hidden="true" className="text-white/45">
                    ·
                  </span>
                  <span className="font-medium text-white/95">
                    {categoryText}
                  </span>
                </>
              )}
              <span aria-hidden="true" className="text-white/45">
                ·
              </span>
              <span className="font-mono-tabular text-blue-100">
                {currentPost.academicYear}
              </span>
              {isLocked && (
                <>
                  <span aria-hidden="true" className="text-white/45">
                    ·
                  </span>
                  <span className="inline-flex items-center gap-1 font-semibold text-[#FDE68A]">
                    <Lock className="w-3.5 h-3.5" />
                    <span>校內限定</span>
                  </span>
                </>
              )}
            </div>
          </div>

          {/* Slide Text Content */}
          <div className="p-6 sm:p-8 lg:p-10 flex-1 min-h-0 flex flex-col justify-between gap-5">
            <div className="space-y-4 min-w-0">
              <h1 className="font-editorial text-2xl sm:text-3xl lg:text-[34px] font-bold text-stone-950 leading-[1.28] text-balance line-clamp-3 group-hover:text-[#1E3A8A] transition-colors">
                {currentPost.title}
              </h1>

              {isLocked ? (
                <div className="space-y-3">
                  <p className="text-base sm:text-lg text-stone-700 leading-[1.65]">
                    此篇為校內社群限定專題，請掃描右側 QR Code 後登入
                    @hmes.tp.edu.tw 學校帳號，即可閱讀完整摘要與教學附件。
                  </p>
                </div>
              ) : (
                <>
                  <p className="text-base sm:text-lg lg:text-[19px] text-stone-700 leading-[1.68] line-clamp-4">
                    {currentPost.summary ||
                      '點擊閱讀本期精選專欄全文，探索西門數學教育實踐、共備紀錄與課堂教學資源。'}
                  </p>

                  {currentPost.embedUrl && embedMeta && (
                    <div className="pt-1">
                      <div className="px-4 py-3 rounded-xl bg-[#F2EDE4] border border-stone-200/90 flex items-center justify-between gap-3 text-sm text-stone-800">
                        <div className="flex items-center gap-2.5 min-w-0">
                          {renderEmbedIcon()}
                          <span className="font-semibold text-[#1E3A8A] whitespace-nowrap">
                            {embedMeta.provider}
                          </span>
                          <span aria-hidden="true" className="text-stone-400">
                            ·
                          </span>
                          <span className="truncate font-medium">
                            {currentPost.embedLabel || '附帶隨課互動網頁與雲端教材'}
                          </span>
                        </div>
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>

            {/* Slide Footer */}
            <div className="pt-4 border-t border-stone-200 flex flex-wrap items-center justify-between gap-3 text-xs sm:text-sm text-stone-600">
              <div className="flex items-center gap-2 min-w-0 truncate">
                <span className="font-semibold text-stone-900">
                  {currentPost.author}
                </span>
                <span aria-hidden="true" className="text-stone-400">
                  ·
                </span>
                <span className="font-mono-tabular">
                  {currentPost.publishedAt}
                </span>
                <span aria-hidden="true" className="text-stone-400">
                  ·
                </span>
                <span>
                  {isLocked ? '限 @hmes.tp.edu.tw' : `${readMins} 分鐘閱讀`}
                </span>
              </div>

              <span className="px-4 py-2 rounded-lg bg-[#1E3A8A] text-white font-semibold group-hover:bg-[#172554] inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 transition-colors">
                <span>開啟此篇文章</span>
                <ArrowRight className="w-4 h-4" />
              </span>
            </div>
          </div>
        </article>

        {/* Right 4 Columns: Audience Live-Synced QR Code Companion */}
        <aside className="lg:col-span-4 min-w-0 bg-[#0F2354] border border-[#2B4B9E] rounded-2xl p-6 sm:p-7 flex flex-col justify-between items-center text-center shadow-2xl gap-5">
          <div className="space-y-1.5">
            <div className="inline-flex items-center gap-1.5 text-xs sm:text-sm font-bold tracking-wide text-[#FDE68A]">
              <QrCode className="w-4 h-4 shrink-0" />
              <span>手機掃碼 · 閱讀本篇焦點</span>
            </div>
            <p className="text-xs sm:text-sm text-blue-100/85">
              掃描下方 QR Code 即可直接前往目前輪播的文章
            </p>
          </div>

          <div className="w-52 h-52 sm:w-60 sm:h-60 xl:w-64 xl:h-64 bg-white rounded-2xl p-4 shadow-2xl flex items-center justify-center shrink-0">
            {activeQrDataUrl ? (
              <img
                src={activeQrDataUrl}
                alt={`掃碼前往「${currentPost.title}」QR Code`}
                className="w-full h-full object-contain"
              />
            ) : (
              <span className="text-xs text-stone-400">QR 碼產生中...</span>
            )}
          </div>

          <div className="w-full space-y-3.5">
            <div className="space-y-1">
              <div className="text-[11px] font-mono-tabular text-blue-200/80">
                當前輪播目標（{String(activeIndex + 1).padStart(2, '0')} /{' '}
                {String(posts.length).padStart(2, '0')}）
              </div>
              <div className="text-sm sm:text-base font-bold text-white line-clamp-2 leading-snug px-1">
                {currentPost.title}
              </div>
            </div>

            <div className="flex items-center justify-center gap-2">
              <button
                type="button"
                onClick={handleCopySlideUrl}
                className="px-3.5 py-2 rounded-lg bg-white/10 hover:bg-white/18 border border-white/20 text-xs font-medium text-white inline-flex items-center gap-1.5 transition-colors whitespace-nowrap"
              >
                {copiedUrl ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-[#FDE68A]" />
                    <span>已複製文章連結</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5" />
                    <span>複製此篇連結</span>
                  </>
                )}
              </button>
            </div>

            {posts.length > 1 && (
              <div
                className="pt-2 border-t border-white/15 flex items-center justify-center gap-1.5 flex-wrap"
                aria-label="選擇輪播文章"
              >
                {posts.map((item, idx) => (
                  <button
                    key={item.slug}
                    type="button"
                    onClick={() => goToIndex(idx)}
                    title={item.title}
                    className={`px-2.5 py-1 rounded-md text-xs font-mono-tabular font-semibold transition-colors ${
                      idx === activeIndex
                        ? 'bg-[#FDE68A] text-[#081433]'
                        : 'bg-white/8 text-blue-100/85 hover:bg-white/18'
                    }`}
                  >
                    {String(idx + 1).padStart(2, '0')}
                  </button>
                ))}
              </div>
            )}
          </div>
        </aside>
      </main>
    </div>
  );
};
