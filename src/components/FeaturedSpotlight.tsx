import React, {useEffect, useState} from 'react';
import {
  ArrowUpRight,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  FileText,
  Lock,
  MonitorPlay,
  Table2,
  Video,
} from 'lucide-react';
import {JournalPost} from '../types/journal';
import {inferEmbedProvider} from '../services/sheetsDb';
import {
  estimateReadMinutes,
  formatCategoryDisplay,
} from '../utils/postFormatting';

interface FeaturedSpotlightProps {
  posts: JournalPost[];
  onSelectPost: (post: JournalPost) => void;
  checkPostLocked?: (post: JournalPost) => boolean;
}

export const FeaturedSpotlight: React.FC<FeaturedSpotlightProps> = ({
  posts,
  onSelectPost,
  checkPostLocked,
}) => {
  const [activeIndex, setActiveIndex] = useState(0);
  const [failedImageSlugs, setFailedImageSlugs] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (activeIndex >= posts.length) {
      setActiveIndex(0);
    }
  }, [posts.length, activeIndex]);

  if (posts.length === 0) return null;

  const currentPost = posts[activeIndex] ?? posts[0];
  const isLocked = checkPostLocked ? checkPostLocked(currentPost) : false;
  const hasCover = Boolean(
    !isLocked && currentPost.coverImageUrl && !failedImageSlugs[currentPost.slug],
  );
  const embedMeta = currentPost.embedUrl
    ? inferEmbedProvider(currentPost.embedUrl)
    : null;
  const readMins = estimateReadMinutes(
    currentPost.content || currentPost.summary,
  );
  const categoryText = formatCategoryDisplay(currentPost.category);

  const handlePrev = (e: React.MouseEvent) => {
    e.stopPropagation();
    setActiveIndex((prev) => (prev - 1 + posts.length) % posts.length);
  };

  const handleNext = (e: React.MouseEvent) => {
    e.stopPropagation();
    setActiveIndex((prev) => (prev + 1) % posts.length);
  };

  const renderEmbedIcon = () => {
    if (!embedMeta) return <FileText className="w-4 h-4 text-[#FDE68A] shrink-0" />;
    if (embedMeta.provider === '站內互動網頁') {
      return <MonitorPlay className="w-4 h-4 text-[#FDE68A] shrink-0" />;
    }
    if (embedMeta.provider === 'Google Meet') {
      return <Video className="w-4 h-4 text-[#FDE68A] shrink-0" />;
    }
    if (embedMeta.provider === 'Google Sheets') {
      return <Table2 className="w-4 h-4 text-[#FDE68A] shrink-0" />;
    }
    return <FileText className="w-4 h-4 text-[#FDE68A] shrink-0" />;
  };

  return (
    <article
      onClick={() => onSelectPost(currentPost)}
      className="group relative w-full h-full min-w-0 cursor-pointer rounded-2xl overflow-hidden flex flex-col justify-between bg-[linear-gradient(155deg,#0C1D47_0%,#152F6E_54%,#1E3A8A_100%)] text-[#FBF9F5] border border-[#2B4B9E] shadow-[0_18px_40px_-14px_rgba(15,35,84,0.45)] transition-all duration-200 ease-out hover:-translate-y-1 hover:border-[#FDE68A]/65 hover:shadow-[0_24px_48px_-12px_rgba(15,35,84,0.58)] active:translate-y-0 active:scale-[0.995]"
    >
      {/* Top Curatorial Brass-Gold Hairline Accent */}
      <div className="h-1 w-full shrink-0 bg-gradient-to-r from-[#F59E0B] via-[#FDE68A] to-[#93C5FD]" />

      {/* Top Visual Exhibition Stage */}
      <div className="relative h-40 sm:h-44 w-full shrink-0 overflow-hidden border-b border-white/15 bg-[#0A183D]">
        {hasCover ? (
          <>
            <img
              src={currentPost.coverImageUrl}
              alt={currentPost.title}
              draggable={false}
              referrerPolicy="no-referrer"
              onError={() =>
                setFailedImageSlugs((prev) => ({
                  ...prev,
                  [currentPost.slug]: true,
                }))
              }
              className="w-full h-full object-cover object-top transition-transform duration-500 ease-out group-hover:scale-[1.05]"
            />
            <div
              aria-hidden="true"
              className="absolute inset-0 bg-gradient-to-t from-[#0C1D47] via-[#0C1D47]/40 to-[#0C1D47]/20"
            />
          </>
        ) : (
          /* Geometric Mathematical Blueprint Visual Stage when post has no cover image */
          <div
            aria-hidden="true"
            className="absolute inset-0 transition-transform duration-500 ease-out group-hover:scale-[1.03]"
          >
            <svg
              viewBox="0 0 480 220"
              className="w-full h-full object-cover opacity-85"
              preserveAspectRatio="xMidYMid slice"
            >
              <defs>
                <pattern
                  id="pesmath-blueprint-grid"
                  width="24"
                  height="24"
                  patternUnits="userSpaceOnUse"
                >
                  <path
                    d="M 24 0 L 0 0 0 24"
                    fill="none"
                    stroke="rgba(147, 197, 253, 0.14)"
                    strokeWidth="0.75"
                  />
                </pattern>
                <radialGradient id="pesmath-blueprint-glow" cx="72%" cy="42%" r="58%">
                  <stop offset="0%" stopColor="rgba(253, 230, 138, 0.24)" />
                  <stop offset="55%" stopColor="rgba(59, 130, 246, 0.14)" />
                  <stop offset="100%" stopColor="rgba(10, 24, 61, 0)" />
                </radialGradient>
              </defs>
              <rect width="480" height="220" fill="#0A183D" />
              <rect width="480" height="220" fill="url(#pesmath-blueprint-grid)" />
              <rect width="480" height="220" fill="url(#pesmath-blueprint-glow)" />

              {/* Golden-ratio concentric arcs & polyhedral vectors */}
              <circle
                cx="340"
                cy="98"
                r="74"
                fill="none"
                stroke="rgba(253, 230, 138, 0.34)"
                strokeWidth="1.2"
              />
              <circle
                cx="340"
                cy="98"
                r="46"
                fill="none"
                stroke="rgba(147, 197, 253, 0.32)"
                strokeWidth="1"
                strokeDasharray="4 4"
              />
              <polygon
                points="340,34 396,130 284,130"
                fill="rgba(253, 230, 138, 0.08)"
                stroke="rgba(253, 230, 138, 0.55)"
                strokeWidth="1.25"
              />
              <line
                x1="340"
                y1="34"
                x2="340"
                y2="162"
                stroke="rgba(191, 219, 254, 0.26)"
                strokeWidth="1"
              />
              <line
                x1="44"
                y1="158"
                x2="436"
                y2="52"
                stroke="rgba(147, 197, 253, 0.22)"
                strokeWidth="1"
              />
              <circle cx="340" cy="34" r="3" fill="#FDE68A" />
              <circle cx="396" cy="130" r="3" fill="#93C5FD" />
              <circle cx="284" cy="130" r="3" fill="#93C5FD" />
              <circle cx="212" cy="113" r="3.5" fill="#FDE68A" />
            </svg>
            <div className="absolute inset-0 bg-gradient-to-t from-[#0C1D47] via-[#0C1D47]/25 to-transparent" />
          </div>
        )}

        {/* Top Bar Overlay inside Stage: Curatorial Kicker + Switcher */}
        <div className="absolute inset-x-0 top-0 p-4 flex items-center justify-between gap-3">
          <div className="min-w-0 flex items-center gap-2 text-xs">
            <span className="font-bold tracking-wide text-[#FDE68A] whitespace-nowrap">
              本期焦點
            </span>
            {categoryText && (
              <>
                <span aria-hidden="true" className="text-white/45">
                  ·
                </span>
                <span className="font-medium text-white/95 truncate">
                  {categoryText}
                </span>
              </>
            )}
            {isLocked && (
              <>
                <span aria-hidden="true" className="text-white/45">
                  ·
                </span>
                <span className="inline-flex items-center gap-1 font-semibold text-[#FDE68A] whitespace-nowrap shrink-0">
                  <Lock className="w-3 h-3" />
                  <span>校內限定</span>
                </span>
              </>
            )}
          </div>

          {posts.length > 1 && (
            <div
              className="flex items-center gap-1 shrink-0"
              onClick={(e) => e.stopPropagation()}
            >
              <button
                type="button"
                onClick={handlePrev}
                aria-label="上一篇焦點文章"
                className="w-7 h-7 rounded-md bg-[#0A183D]/75 border border-white/20 text-white/90 hover:bg-white hover:text-[#0C1D47] flex items-center justify-center transition-colors"
              >
                <ChevronLeft className="w-3.5 h-3.5" />
              </button>
              <span className="px-1.5 text-[11px] font-mono-tabular text-white/90 select-none">
                {String(activeIndex + 1).padStart(2, '0')}/
                {String(posts.length).padStart(2, '0')}
              </span>
              <button
                type="button"
                onClick={handleNext}
                aria-label="下一篇焦點文章"
                className="w-7 h-7 rounded-md bg-[#0A183D]/75 border border-white/20 text-white/90 hover:bg-white hover:text-[#0C1D47] flex items-center justify-center transition-colors"
              >
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
        </div>

        {/* Bottom Caption Overlay inside Stage */}
        <div className="absolute inset-x-0 bottom-0 px-4 pb-3 flex items-center justify-between gap-2 text-xs">
          <span className="font-mono-tabular text-blue-100/95">
            {currentPost.academicYear}
            <span aria-hidden="true" className="mx-1.5 text-white/40">
              ·
            </span>
            {isLocked ? '限 @hmes.tp.edu.tw' : `${readMins} 分鐘閱讀`}
          </span>
          {!isLocked && embedMeta && (
            <span className="font-medium text-[#FDE68A] inline-flex items-center gap-1 truncate">
              {renderEmbedIcon()}
              <span className="truncate">{embedMeta.provider}</span>
            </span>
          )}
        </div>
      </div>

      {/* Main Content Area */}
      <div className="p-5 sm:p-6 flex-1 flex flex-col justify-between gap-4">
        <div className="space-y-2.5 min-w-0">
          <h2 className="font-editorial text-xl sm:text-[22px] font-bold text-white leading-[1.35] text-balance line-clamp-2">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onSelectPost(currentPost);
              }}
              className="text-left group-hover:text-[#FDE68A] transition-colors focus-visible:outline-none focus-visible:underline"
            >
              {currentPost.title}
            </button>
          </h2>

          {isLocked ? (
            <>
              <p className="text-xs sm:text-sm text-blue-100/90 leading-relaxed line-clamp-2 sm:line-clamp-3">
                此篇為校內社群限定專題，需登入 @hmes.tp.edu.tw 學校帳號後方可檢視完整摘要、內文與雲端教學附件。
              </p>
              <div className="pt-1">
                <div className="px-3 py-2 rounded-lg bg-white/10 border border-white/15 flex items-center gap-2 text-xs text-[#FDE68A]">
                  <Lock className="w-3.5 h-3.5 shrink-0" />
                  <span className="truncate font-medium">
                    @hmes.tp.edu.tw 校內限定閱讀內容
                  </span>
                </div>
              </div>
            </>
          ) : (
            <>
              <p className="text-xs sm:text-sm text-blue-100/90 leading-relaxed line-clamp-2 sm:line-clamp-3">
                {currentPost.summary ||
                  '點擊進入本期專欄全文，探索西門數學教育實踐、共備紀錄與互動學習資源。'}
              </p>

              {currentPost.embedUrl && (
                <div className="pt-1">
                  <div className="px-3 py-2 rounded-lg bg-white/10 border border-white/15 flex items-center justify-between gap-2.5 text-xs text-blue-50 group-hover:bg-white/15 group-hover:border-[#FDE68A]/40 transition-colors">
                    <div className="flex items-center gap-2 min-w-0">
                      {renderEmbedIcon()}
                      <span className="truncate font-medium">
                        {currentPost.embedLabel || '開啟隨附互動資源與雲端教材'}
                      </span>
                    </div>
                    <ExternalLink className="w-3.5 h-3.5 text-blue-200/80 shrink-0" />
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer Attribution & High-Contrast Primary Read CTA */}
        <div className="pt-3.5 border-t border-white/15 flex items-center justify-between gap-3 text-xs">
          <div className="text-blue-200/90 truncate min-w-0">
            <span className="font-medium text-white/95">{currentPost.author}</span>
            <span aria-hidden="true" className="mx-1.5 text-white/40">
              ·
            </span>
            <span className="font-mono-tabular">{currentPost.publishedAt}</span>
          </div>

          <span className="px-3.5 py-2 rounded-lg font-semibold text-[#0C1D47] bg-[#FBF9F5] group-hover:bg-[#FDE68A] inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 shadow-xs transition-all duration-200">
            {isLocked && <Lock className="w-3.5 h-3.5" />}
            <span>{isLocked ? '登入解鎖' : '點擊閱讀焦點'}</span>
            <ArrowUpRight className="w-3.5 h-3.5 transition-transform duration-200 group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
          </span>
        </div>
      </div>
    </article>
  );
};
