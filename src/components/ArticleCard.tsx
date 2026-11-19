import React, {useState} from 'react';
import {ArrowUpRight, ExternalLink, FileText, Video, Table2} from 'lucide-react';
import {JournalPost} from '../types/journal';
import {inferEmbedProvider} from '../services/sheetsDb';
import {estimateReadMinutes, getCategoryAccent} from '../utils/postFormatting';

interface ArticleCardProps {
  post: JournalPost;
  onSelect: (post: JournalPost) => void;
}

export const ArticleCard: React.FC<ArticleCardProps> = ({post, onSelect}) => {
  const [imgFailed, setImgFailed] = useState(false);
  const embedMeta = post.embedUrl ? inferEmbedProvider(post.embedUrl) : null;
  const readMins = estimateReadMinutes(post.content || post.summary);
  const hasCover = Boolean(post.coverImageUrl && !imgFailed);
  const accent = getCategoryAccent(post.category);

  const renderEmbedIcon = () => {
    if (!embedMeta) return <FileText className="w-4 h-4 text-[#1E3A8A]" />;
    if (embedMeta.provider === 'Google Meet') {
      return <Video className="w-4 h-4 text-[#1E3A8A]" />;
    }
    if (embedMeta.provider === 'Google Sheets') {
      return <Table2 className="w-4 h-4 text-[#1E3A8A]" />;
    }
    return <FileText className="w-4 h-4 text-[#1E3A8A]" />;
  };

  return (
    <article className="group h-full bg-white border border-stone-300/85 rounded-xl overflow-hidden flex flex-col shadow-[0_2px_10px_rgba(28,25,23,0.05)] transition-all duration-200 hover:border-stone-400 hover:shadow-[0_8px_22px_rgba(28,25,23,0.10)]">
      {/* Subtle 3px Top Category Color Rule for Instant Visual Grouping */}
      <div className={`h-1 w-full shrink-0 ${accent.barClass}`} />

      {/* Clear Image OR Attachment Slot (No Blurry Duplicate-Title Boxes) */}
      {hasCover ? (
        <button
          type="button"
          onClick={() => onSelect(post)}
          className="text-left w-full shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#1E3A8A]"
        >
          <div className="aspect-[16/9] w-full bg-stone-100 overflow-hidden border-b border-stone-200">
            <img
              src={post.coverImageUrl}
              alt={post.title}
              draggable={false}
              referrerPolicy="no-referrer"
              onError={() => setImgFailed(true)}
              className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
            />
          </div>
        </button>
      ) : post.embedUrl && embedMeta ? (
        <button
          type="button"
          onClick={() => onSelect(post)}
          className="text-left w-full shrink-0 bg-[#F7F4EE] border-b border-stone-200 px-5 py-4 flex items-center gap-3 hover:bg-[#EFEAE0] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#1E3A8A]"
        >
          <div className="w-10 h-10 rounded-lg bg-white border border-stone-200 flex items-center justify-center shrink-0">
            {renderEmbedIcon()}
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-[11px] font-mono-tabular uppercase tracking-wider text-stone-500">
              {embedMeta.provider}
            </div>
            <div className="text-sm font-semibold text-stone-900 truncate mt-0.5">
              {post.embedLabel || '檢視雲端教案與附件'}
            </div>
          </div>
          <ExternalLink className="w-4 h-4 text-stone-400 group-hover:text-[#1E3A8A] shrink-0 transition-colors" />
        </button>
      ) : null}

      {/* Card Body: Sharp Category Kicker + Crisp Headline + High-Legibility Excerpt */}
      <div className="p-5 flex-1 flex flex-col justify-between gap-4">
        <div className="space-y-2.5">
          {/* Unboxed High-Contrast Category & Metadata Row */}
          <div className="flex items-center justify-between gap-2 pb-2 border-b border-stone-100 text-xs">
            <span className={`font-bold tracking-wide truncate ${accent.textClass}`}>
              {post.category || '綜合專欄'}
            </span>
            <div className="flex items-center gap-1.5 text-stone-500 font-mono-tabular whitespace-nowrap shrink-0">
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
              <span aria-hidden="true">·</span>
              <span>{readMins}分</span>
            </div>
          </div>

          <h3 className="font-editorial text-[19px] font-bold text-stone-950 leading-[1.35] text-balance line-clamp-2">
            <button
              type="button"
              onClick={() => onSelect(post)}
              className="text-left hover:text-[#1E3A8A] transition-colors focus-visible:outline-none focus-visible:underline"
            >
              {post.title}
            </button>
          </h3>

          <p
            className={`text-sm text-stone-700 leading-[1.65] ${
              hasCover ? 'line-clamp-3' : 'line-clamp-5'
            }`}
          >
            {post.summary || '點擊「閱讀全文」檢視完整教案與社群會議紀錄。'}
          </p>
        </div>

        <div className="pt-3.5 border-t border-stone-200/80 flex items-center justify-between gap-4 text-xs">
          <div className="text-stone-500 truncate">
            <span className="font-medium text-stone-700">{post.author}</span>
            <span className="mx-1.5" aria-hidden="true">·</span>
            <span className="font-mono-tabular">{post.publishedAt}</span>
          </div>
          <button
            type="button"
            onClick={() => onSelect(post)}
            className="font-semibold text-[#1E3A8A] hover:text-[#172554] inline-flex items-center gap-1 whitespace-nowrap shrink-0"
          >
            <span>閱讀全文</span>
            <ArrowUpRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </article>
  );
};
