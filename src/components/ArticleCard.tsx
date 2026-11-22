import React, {useState} from 'react';
import {
  ArrowUpRight,
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
  extractGoogleDriveFileId,
  formatCategoryDisplay,
  getCategoryAccent,
  getDriveThumbnailFallbackUrl,
  normalizeDriveImageUrl,
} from '../utils/postFormatting';

interface ArticleCardProps {
  post: JournalPost;
  onSelect: (post: JournalPost) => void;
  isLocked?: boolean;
}

export const ArticleCard: React.FC<ArticleCardProps> = ({
  post,
  onSelect,
  isLocked = false,
}) => {
  const [imgFailed, setImgFailed] = useState(false);
  const [triedThumbnail, setTriedThumbnail] = useState(false);

  const driveId = extractGoogleDriveFileId(post.coverImageUrl);
  const normalizedCover = normalizeDriveImageUrl(post.coverImageUrl);
  const currentImgSrc =
    triedThumbnail && driveId
      ? getDriveThumbnailFallbackUrl(driveId)
      : normalizedCover;

  const embedMeta = post.embedUrl ? inferEmbedProvider(post.embedUrl) : null;
  const readMins = estimateReadMinutes(post.content || post.summary);
  const hasCover = Boolean(!isLocked && normalizedCover && !imgFailed);
  const accent = getCategoryAccent(post.category);

  const renderEmbedIcon = () => {
    if (!embedMeta) return <FileText className="w-4 h-4 text-[#1E3A8A]" />;
    if (embedMeta.provider === '站內互動網頁') {
      return <MonitorPlay className="w-4 h-4 text-[#1E3A8A]" />;
    }
    if (embedMeta.provider === 'Google Meet') {
      return <Video className="w-4 h-4 text-[#1E3A8A]" />;
    }
    if (embedMeta.provider === 'Google Sheets') {
      return <Table2 className="w-4 h-4 text-[#1E3A8A]" />;
    }
    return <FileText className="w-4 h-4 text-[#1E3A8A]" />;
  };

  return (
    <article
      onClick={() => onSelect(post)}
      className="group h-full cursor-pointer bg-white border border-stone-300/85 rounded-xl overflow-hidden flex flex-col shadow-[0_2px_10px_rgba(28,25,23,0.05)] transition-all duration-200 ease-out hover:-translate-y-1 hover:border-[#1E3A8A]/50 hover:shadow-[0_14px_28px_-6px_rgba(30,58,138,0.16)] active:translate-y-0 active:scale-[0.99]"
    >
      {/* Top Category Color Rule that subtly accentuates on hover */}
      <div
        className={`h-1 group-hover:h-1.5 w-full shrink-0 transition-all duration-200 ${accent.barClass}`}
      />

      {/* Clear Image OR Attachment Slot */}
      {isLocked ? (
        <div className="w-full shrink-0 bg-[#F7F4EE] border-b border-stone-200 px-5 py-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-white border border-amber-200 flex items-center justify-center shrink-0">
            <Lock className="w-4 h-4 text-amber-800" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-[11px] font-mono-tabular uppercase tracking-wider text-amber-800 font-semibold">
              @hmes.tp.edu.tw 校內限定
            </div>
            <div className="text-sm font-semibold text-stone-900 truncate mt-0.5">
              需登入社群教師帳號解鎖觀看
            </div>
          </div>
        </div>
      ) : hasCover ? (
        <div className="aspect-[16/9] w-full bg-stone-100 overflow-hidden border-b border-stone-200 shrink-0">
          <img
            src={currentImgSrc}
            alt={post.title}
            draggable={false}
            referrerPolicy="no-referrer"
            onError={() => {
              if (driveId && !triedThumbnail) {
                setTriedThumbnail(true);
              } else {
                setImgFailed(true);
              }
            }}
            className="w-full h-full object-cover object-top transition-transform duration-300 group-hover:scale-[1.04]"
          />
        </div>
      ) : post.embedUrl && embedMeta ? (
        <div className="w-full shrink-0 bg-[#F7F4EE] border-b border-stone-200 px-5 py-4 flex items-center gap-3 group-hover:bg-[#EFEAE0] transition-colors">
          <div className="w-10 h-10 rounded-lg bg-white border border-stone-200 group-hover:border-[#1E3A8A]/35 flex items-center justify-center shrink-0 transition-colors">
            {renderEmbedIcon()}
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-[11px] font-mono-tabular uppercase tracking-wider text-stone-500">
              {embedMeta.provider}
            </div>
            <div className="text-sm font-semibold text-stone-900 group-hover:text-[#1E3A8A] truncate mt-0.5 transition-colors">
              {post.embedLabel || '檢視雲端教案與附件'}
            </div>
          </div>
          <ExternalLink className="w-4 h-4 text-stone-400 group-hover:text-[#1E3A8A] group-hover:translate-x-0.5 group-hover:-translate-y-0.5 shrink-0 transition-all" />
        </div>
      ) : null}

      {/* Card Body: Sharp Category Kicker + Crisp Headline + High-Legibility Excerpt */}
      <div className="p-5 flex-1 flex flex-col justify-between gap-4">
        <div className="space-y-2.5">
          {/* Unboxed High-Contrast Category & Metadata Row */}
          <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1 pb-2 border-b border-stone-100 text-xs min-w-0">
            <span className={`font-bold tracking-wide truncate min-w-0 ${accent.textClass}`}>
              {formatCategoryDisplay(post.category)}
            </span>
            <div className="flex items-center gap-1.5 text-stone-500 font-mono-tabular whitespace-nowrap shrink-0">
              {isLocked && (
                <>
                  <span className="font-sans font-semibold text-amber-800 inline-flex items-center gap-1">
                    <Lock className="w-3 h-3" />
                    <span>已鎖定</span>
                  </span>
                  <span aria-hidden="true">·</span>
                </>
              )}
              {post.isFeatured && (
                <>
                  <span className="font-sans font-semibold text-[#1E3A8A]">精選</span>
                  <span aria-hidden="true">·</span>
                </>
              )}
              {post.status === 'Draft' && (
                <>
                  <span className="font-sans font-semibold text-amber-800">草稿</span>
                  <span aria-hidden="true">·</span>
                </>
              )}
              <span>{post.academicYear}</span>
              {!isLocked && (
                <>
                  <span aria-hidden="true">·</span>
                  <span className="font-sans">{readMins} 分鐘閱讀</span>
                </>
              )}
            </div>
          </div>

          <h3 className="font-editorial text-[19px] font-bold text-stone-950 leading-[1.35] text-balance line-clamp-2">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onSelect(post);
              }}
              className="text-left group-hover:text-[#1E3A8A] transition-colors focus-visible:outline-none focus-visible:underline"
            >
              {post.title}
            </button>
          </h3>

          <p
            className={`text-sm text-stone-700 leading-[1.65] ${
              hasCover ? 'line-clamp-3' : 'line-clamp-5'
            }`}
          >
            {isLocked
              ? '此篇內容已設定為西門社群教師校內限定，需登入 @hmes.tp.edu.tw 學校帳號後方可檢視完整內文與隨附雲端資源。'
              : post.summary || '點擊「閱讀全文」檢視完整教案與社群會議紀錄。'}
          </p>
        </div>

        <div className="pt-3.5 border-t border-stone-200/80 flex items-center justify-between gap-4 text-xs">
          <div className="text-stone-500 truncate">
            <span className="font-medium text-stone-700">{post.author}</span>
            <span className="mx-1.5" aria-hidden="true">·</span>
            <span className="font-mono-tabular">{post.publishedAt}</span>
          </div>
          <span className="font-semibold text-[#1E3A8A] px-2 py-1 -mr-2 rounded-md group-hover:bg-[#1E3A8A] group-hover:text-white inline-flex items-center gap-1 whitespace-nowrap shrink-0 transition-all duration-200">
            {isLocked ? (
              <>
                <Lock className="w-3.5 h-3.5" />
                <span>登入解鎖</span>
              </>
            ) : (
              <>
                <span>閱讀全文</span>
                <ArrowUpRight className="w-3.5 h-3.5 transition-transform duration-200 group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
              </>
            )}
          </span>
        </div>
      </div>
    </article>
  );
};
