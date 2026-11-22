import React, {useMemo, useState} from 'react';
import {marked} from 'marked';
import {
  ArrowLeft,
  ArrowRight,
  CalendarCheck,
  Check,
  Copy,
  Edit3,
  ExternalLink,
  Eye,
  FileText,
  Lock,
  Maximize2,
  MonitorPlay,
  Presentation,
  QrCode,
  ShieldCheck,
  X,
} from 'lucide-react';
import {JournalPost} from '../types/journal';
import {inferEmbedProvider} from '../services/sheetsDb';
import {SCHOOL_DOMAIN} from '../services/googleAuth';
import {
  extractGoogleDriveFileId,
  formatCategoryDisplay,
  normalizeDriveImageUrl,
  normalizeMarkdownDriveImages,
} from '../utils/postFormatting';

interface ArticleReaderModalProps {
  post: JournalPost | null;
  allPosts: JournalPost[];
  canEdit: boolean;
  isLocked?: boolean;
  isSchoolAuthorized?: boolean;
  onRequestSchoolSignIn?: () => void;
  onOpenMeetingCheckin?: (linkedPostSlug?: string) => void;
  onClose: () => void;
  onSelectPost: (post: JournalPost) => void;
  onEditPost: (post: JournalPost) => void;
  onOpenFullEmbed?: (url: string, title: string, initialTab?: 'map' | 'gallery') => void;
  onOpenShareQr?: () => void;
  onGenerateDeck?: (post: JournalPost) => void;
  onExportMeetingMinutes?: (post: JournalPost) => void;
  disableEscapeClose?: boolean;
}

function sanitizeHtml(html: string): string {
  const basicClean = html
    .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, '')
    .replace(/\son\w+="[^"]*"/gi, '')
    .replace(/\son\w+='[^']*'/gi, '')
    .replace(/javascript:/gi, '');

  if (typeof DOMParser === 'undefined') {
    return basicClean;
  }

  try {
    const doc = new DOMParser().parseFromString(basicClean, 'text/html');
    doc.querySelectorAll('script, style, noscript').forEach((el) => el.remove());

    doc.querySelectorAll('img').forEach((img) => {
      img.removeAttribute('width');
      img.removeAttribute('height');
      img.removeAttribute('style');
      img.setAttribute('referrerpolicy', 'no-referrer');
    });

    doc.querySelectorAll('iframe, video, embed, object').forEach((el) => {
      el.removeAttribute('width');
      el.removeAttribute('height');
      el.removeAttribute('style');

      const parent = el.parentElement;
      const insideAspectVideo = parent?.classList.contains('aspect-video');
      if (el.tagName.toLowerCase() === 'iframe') {
        if (insideAspectVideo && parent) {
          parent.classList.add('max-w-full');
          el.setAttribute('class', 'w-full h-full border-0');
        } else if (!parent?.classList.contains('journal-embed-frame')) {
          const wrapper = doc.createElement('div');
          wrapper.setAttribute('class', 'journal-embed-frame');
          el.parentNode?.insertBefore(wrapper, el);
          wrapper.appendChild(el);
        }
      }
    });

    doc.querySelectorAll('table').forEach((table) => {
      table.removeAttribute('width');
      table.removeAttribute('style');
      table.querySelectorAll('td, th, col').forEach((cell) => {
        cell.removeAttribute('width');
        cell.removeAttribute('style');
      });
      if (!table.parentElement?.classList.contains('journal-table-wrap')) {
        const wrapper = doc.createElement('div');
        wrapper.setAttribute('class', 'journal-table-wrap');
        table.parentNode?.insertBefore(wrapper, table);
        wrapper.appendChild(table);
      }
    });

    doc.querySelectorAll('[style]').forEach((el) => {
      const styleVal = el.getAttribute('style') || '';
      if (/\b(?:min-)?width\s*:/i.test(styleVal)) {
        el.removeAttribute('style');
      }
    });

    return doc.body.innerHTML;
  } catch {
    return basicClean;
  }
}

function toEmbeddableUrl(url: string): string | null {
  const trimmed = url.trim();
  if (!trimmed) return null;
  try {
    const base =
      typeof window !== 'undefined' ? window.location.href : 'http://localhost/';
    const parsed = new URL(trimmed, base);
    if (
      (typeof window !== 'undefined' &&
        parsed.origin === window.location.origin &&
        /\.html?$/i.test(parsed.pathname)) ||
      trimmed.startsWith('./') ||
      trimmed.startsWith('/')
    ) {
      return `${parsed.pathname}${parsed.search}${parsed.hash}`;
    }

    if (parsed.hostname.includes('drive.google.com')) {
      const folderMatch = parsed.pathname.match(/\/folders\/([a-zA-Z0-9_-]+)/i);
      if (folderMatch && folderMatch[1]) {
        return `https://drive.google.com/embeddedfolderview?id=${folderMatch[1]}#list`;
      }
      const fileId = extractGoogleDriveFileId(trimmed);
      if (fileId) {
        return `https://drive.google.com/file/d/${fileId}/preview`;
      }
    }

    if (parsed.hostname.includes('docs.google.com')) {
      if (parsed.pathname.includes('/forms/')) {
        if (!trimmed.includes('embedded=true')) {
          return trimmed.includes('?') ? `${trimmed}&embedded=true` : `${trimmed}?embedded=true`;
        }
        return trimmed;
      }
      const docMatch = parsed.pathname.match(
        /\/(document|spreadsheets|presentation)\/(?:u\/\d+\/)?d\/([a-zA-Z0-9_-]+)/i,
      );
      if (docMatch && docMatch[1] && docMatch[2]) {
        return `https://docs.google.com/${docMatch[1]}/d/${docMatch[2]}/preview`;
      }
    }

    if (parsed.pathname.endsWith('/preview')) {
      return trimmed;
    }
    return null;
  } catch {
    return null;
  }
}

export const ArticleReaderModal: React.FC<ArticleReaderModalProps> = ({
  post,
  allPosts,
  canEdit,
  isLocked = false,
  isSchoolAuthorized = false,
  onRequestSchoolSignIn,
  onOpenMeetingCheckin,
  onClose,
  onSelectPost,
  onEditPost,
  onOpenFullEmbed,
  onOpenShareQr,
  onGenerateDeck,
  onExportMeetingMinutes,
  disableEscapeClose = false,
}) => {
  const [copied, setCopied] = useState(false);
  const [showInlineEmbed, setShowInlineEmbed] = useState(false);

  React.useEffect(() => {
    setShowInlineEmbed(false);
  }, [post?.slug]);

  const renderedHtml = useMemo(() => {
    if (!post || isLocked) return '';
    const rawContent = normalizeMarkdownDriveImages(post.content || post.summary || '');
    const raw = marked.parse(rawContent, {
      async: false,
      gfm: true,
      breaks: true,
    }) as string;
    return sanitizeHtml(raw);
  }, [post, isLocked]);

  React.useEffect(() => {
    if (!post || disableEscapeClose) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [post, disableEscapeClose, onClose]);

  React.useEffect(() => {
    if (!post || !showInlineEmbed || !onOpenFullEmbed || !post.embedUrl) return;
    const handleMessage = (event: MessageEvent) => {
      if (event.origin !== window.location.origin) return;
      const data = event.data as {type?: string; tab?: string} | null;
      if (data?.type === 'XIMEN_OPEN_TAB' && data.tab === 'gallery') {
        onOpenFullEmbed(
          post.embedUrl!,
          post.embedLabel || post.title,
          'gallery',
        );
      }
    };
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [post, showInlineEmbed, onOpenFullEmbed]);

  if (!post) return null;

  const currentIdx = allPosts.findIndex((p) => p.slug === post.slug);
  const prevPost = currentIdx > 0 ? allPosts[currentIdx - 1] : null;
  const nextPost =
    currentIdx >= 0 && currentIdx < allPosts.length - 1
      ? allPosts[currentIdx + 1]
      : null;

  const embedMeta = post.embedUrl ? inferEmbedProvider(post.embedUrl) : null;
  const inlineEmbedUrl = post.embedUrl ? toEmbeddableUrl(post.embedUrl) : null;

  const handleCopyPermalink = async () => {
    const url = new URL(window.location.href);
    url.hash = `post=${encodeURIComponent(post.slug)}`;
    try {
      await navigator.clipboard.writeText(url.toString());
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard fallback ignored cleanly
    }
  };



  return (
    <div
      className="fixed inset-0 z-50 overflow-y-auto bg-stone-950/50 backdrop-blur-xs flex justify-center p-2.5 sm:p-6 md:p-10"
      role="dialog"
      aria-modal="true"
      aria-labelledby="reader-article-title"
      onClick={onClose}
    >
      <div className="w-full max-w-4xl min-w-0 my-auto flex justify-center">
        <article
          className="w-full max-w-4xl min-w-0 bg-[#FBF9F5] border border-stone-200 rounded-xl shadow-2xl overflow-x-hidden overflow-y-auto flex flex-col max-h-[92vh]"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Top Reader Utility Bar */}
          <div className="px-4 sm:px-10 py-3 sm:py-4 bg-white border-b border-stone-200 flex flex-wrap items-center justify-between gap-2 sm:gap-4 shrink-0">
            <button
              type="button"
              onClick={onClose}
              className="inline-flex items-center gap-1.5 sm:gap-2 text-xs sm:text-sm font-medium text-stone-700 hover:text-stone-950 transition-colors whitespace-nowrap shrink-0"
            >
              <ArrowLeft className="w-4 h-4 shrink-0" />
              <span>返回期刊目錄</span>
            </button>

            <div className="flex flex-wrap items-center justify-end gap-1.5 sm:gap-2 shrink-0">
              <button
                type="button"
                onClick={handleCopyPermalink}
                className="px-2.5 sm:px-3 py-1.5 text-xs font-medium text-stone-700 bg-white border border-stone-200 rounded-lg hover:bg-stone-50 inline-flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0"
              >
                {copied ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-emerald-700 shrink-0" />
                    <span>已複製連結</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5 shrink-0" />
                    <span>複製分享連結</span>
                  </>
                )}
              </button>

              {onGenerateDeck && !isLocked && (
                <button
                  type="button"
                  onClick={() => onGenerateDeck(post)}
                  title="開啟精選簡報或利用 AI 整理此篇期刊重點生成投影簡報"
                  className="px-2.5 sm:px-3 py-1.5 text-xs font-semibold text-white bg-[#1E3A8A] border border-[#1E3A8A] rounded-lg hover:bg-[#172554] inline-flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0 shadow-2xs"
                >
                  <Presentation className="w-3.5 h-3.5 shrink-0 text-[#FDE68A]" />
                  <span>AI 簡報</span>
                </button>
              )}

              {onExportMeetingMinutes && !isLocked && (
                <button
                  type="button"
                  onClick={() => onExportMeetingMinutes(post)}
                  title="將此篇期刊匯出為正式會議記錄格式（含核章欄與連動簽到表）"
                  className="px-2.5 sm:px-3 py-1.5 text-xs font-semibold text-[#1E3A8A] bg-[#F7F4EE] border border-[#1E3A8A]/30 rounded-lg hover:bg-[#EBE6DF] inline-flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0"
                >
                  <FileText className="w-3.5 h-3.5 shrink-0" />
                  <span>輸出會議記錄</span>
                </button>
              )}

              {onOpenShareQr && (
                <button
                  type="button"
                  onClick={onOpenShareQr}
                  title="產生此文章的 QR Code（可投影放大或釘選於畫面角落）"
                  className="px-2.5 sm:px-3 py-1.5 text-xs font-medium text-[#1E3A8A] bg-[#1E3A8A]/5 border border-[#1E3A8A]/25 rounded-lg hover:bg-[#1E3A8A]/10 inline-flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0"
                >
                  <QrCode className="w-3.5 h-3.5 shrink-0" />
                  <span>QR Code</span>
                </button>
              )}

              {canEdit && (
                <button
                  type="button"
                  onClick={() => onEditPost(post)}
                  className="px-2.5 sm:px-3 py-1.5 text-xs font-medium text-[#1E3A8A] bg-white border border-[#1E3A8A]/30 rounded-lg hover:bg-[#1E3A8A]/5 inline-flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0"
                >
                  <Edit3 className="w-3.5 h-3.5 shrink-0" />
                  <span>編輯文章</span>
                </button>
              )}

              <button
                type="button"
                onClick={onClose}
                className="p-2 text-stone-500 hover:text-stone-900 rounded-lg hover:bg-stone-100 transition-colors shrink-0"
                aria-label="關閉文章"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Meeting Check-In Action Banner at Top of Domain Meeting Articles */}
          {onOpenMeetingCheckin && post.category.includes('領域會議') && (
            <section
              aria-label="領域共備會議線上簽到"
              className="px-4 sm:px-12 py-3.5 sm:py-4 bg-[#F7F4EE] border-b border-[#1E3A8A]/20 min-w-0 shrink-0"
            >
              <div className="bg-white border border-[#1E3A8A]/25 rounded-xl p-3.5 sm:p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-2xs">
                <div className="space-y-1 min-w-0">
                  <div className="text-xs sm:text-sm font-bold text-[#1E3A8A] inline-flex items-center gap-1.5">
                    <CalendarCheck className="w-4 h-4 shrink-0" />
                    <span>領域共備會議線上簽到</span>
                  </div>
                  <p className="text-xs text-stone-600 leading-relaxed">
                    {isSchoolAuthorized
                      ? '您已完成社群身份驗證，請點擊右側按鍵開啟「會議簽到專區」完成本場次出席簽到或請假登記。'
                      : `歡迎使用 @${SCHOOL_DOMAIN} 學校帳號登入，即可於線上完成本場會議簽到。`}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => onOpenMeetingCheckin(post.slug)}
                  className="w-full sm:w-auto px-4 py-2 text-xs font-semibold text-white bg-[#1E3A8A] rounded-lg hover:bg-[#172554] inline-flex items-center justify-center gap-1.5 whitespace-nowrap shrink-0 transition-colors"
                >
                  <CalendarCheck className="w-3.5 h-3.5 shrink-0" />
                  <span>前往會議簽到</span>
                </button>
              </div>
            </section>
          )}

          {/* Article Header */}
          <header className="px-4 sm:px-12 pt-6 sm:pt-12 pb-6 sm:pb-8 bg-white border-b border-stone-200 min-w-0">
            <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs text-stone-500 mb-4">
              <span className="font-mono-tabular font-medium text-[#1E3A8A]">
                {post.academicYear}
              </span>
              <span aria-hidden="true">·</span>
              <span>{formatCategoryDisplay(post.category)}</span>
              <span aria-hidden="true">·</span>
              <span className="font-mono-tabular">{post.publishedAt}</span>
              {post.isFeatured && (
                <>
                  <span aria-hidden="true">·</span>
                  <span className="font-semibold text-stone-800">精選專題</span>
                </>
              )}
              {post.status === 'Draft' && (
                <>
                  <span aria-hidden="true">·</span>
                  <span className="font-semibold text-amber-800">草稿預覽</span>
                </>
              )}
              {(post.status === 'Restricted' || isLocked) && (
                <>
                  <span aria-hidden="true">·</span>
                  <span className="inline-flex items-center gap-1 font-semibold text-[#1E3A8A]">
                    <Lock className="w-3 h-3" />
                    <span>校內限定（@{SCHOOL_DOMAIN}）</span>
                  </span>
                </>
              )}
            </div>

            <h1
              id="reader-article-title"
              className="font-editorial text-2xl sm:text-4xl font-semibold text-stone-950 leading-tight text-balance"
            >
              {post.title}
            </h1>

            {post.summary && !isLocked && (
              <p className="mt-4 text-base sm:text-lg text-stone-600 leading-relaxed max-w-2xl">
                {post.summary}
              </p>
            )}

            <dl className="mt-6 pt-6 border-t border-stone-100 grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs">
              <div>
                <dt className="text-stone-400 mb-0.5">撰稿與彙整</dt>
                <dd className="font-medium text-stone-800">{post.author}</dd>
              </div>
              <div>
                <dt className="text-stone-400 mb-0.5">所屬學年度</dt>
                <dd className="font-mono-tabular font-medium text-stone-800">
                  {post.academicYear}
                </dd>
              </div>
              <div>
                <dt className="text-stone-400 mb-0.5">期刊分類</dt>
                <dd className="font-medium text-stone-800">
                  {formatCategoryDisplay(post.category)}
                </dd>
              </div>
              <div>
                <dt className="text-stone-400 mb-0.5">索引代號</dt>
                <dd className="font-mono-tabular text-stone-700 truncate">
                  {post.slug}
                </dd>
              </div>
            </dl>
          </header>

          {isLocked ? (
            <div className="px-4 sm:px-12 py-10 sm:py-14 bg-white min-w-0">
              <div className="max-w-xl mx-auto bg-[#F7F4EE] border border-stone-200 rounded-2xl p-6 sm:p-8 text-center space-y-4">
                <div className="w-12 h-12 rounded-xl bg-white border border-stone-200 flex items-center justify-center mx-auto text-[#1E3A8A] shadow-2xs">
                  <Lock className="w-6 h-6" />
                </div>
                <div className="space-y-1.5">
                  <div className="text-xs font-mono-tabular font-semibold text-[#1E3A8A]">
                    校內社群權限保護 · @{SCHOOL_DOMAIN}
                  </div>
                  <h2 className="font-editorial text-xl font-bold text-stone-950">
                    此文章已鎖定，限本校社群教師登入觀看
                  </h2>
                  <p className="text-xs sm:text-sm text-stone-600 leading-relaxed">
                    本篇內容可能包含領域共備紀錄、會議議程或校內教學資料，請使用您的{' '}
                    <span className="font-mono-tabular font-semibold text-stone-900">
                      @{SCHOOL_DOMAIN}
                    </span>{' '}
                    Google 帳號登入即可立即解鎖閱讀全文與附件。
                  </p>
                </div>

                {onRequestSchoolSignIn && (
                  <div className="pt-2">
                    <button
                      type="button"
                      onClick={onRequestSchoolSignIn}
                      className="w-full sm:w-auto px-5 py-2.5 text-xs sm:text-sm font-semibold text-white bg-[#1E3A8A] rounded-lg hover:bg-[#172554] inline-flex items-center justify-center gap-2 transition-colors"
                    >
                      <ShieldCheck className="w-4 h-4 shrink-0" />
                      <span>使用 @{SCHOOL_DOMAIN} 帳號登入解鎖</span>
                    </button>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <>
              {/* Optional Cover Image */}
              {post.coverImageUrl && (
                <figure className="bg-[#F7F4EE] border-b border-stone-200 px-4 sm:px-12 py-5 sm:py-6 min-w-0">
                  <div className="aspect-[16/9] w-full overflow-hidden rounded-lg border border-stone-200 bg-stone-100">
                    <img
                      src={normalizeDriveImageUrl(post.coverImageUrl)}
                      alt={post.title}
                      referrerPolicy="no-referrer"
                      className="w-full h-full object-cover"
                    />
                  </div>
                  <figcaption className="mt-2.5 text-xs text-stone-500 font-editorial italic">
                    圖說 — {post.title}
                  </figcaption>
                </figure>
              )}

              {/* Main Markdown Reading Body */}
              <div className="px-4 sm:px-12 py-6 sm:py-10 bg-white min-w-0">
                <div
                  className="journal-prose max-w-2xl w-full min-w-0 mx-auto"
                  dangerouslySetInnerHTML={{__html: renderedHtml}}
                />

                {/* Embedded Google Drive / Meet / Forms / Interactive HTML Attachment */}
                {post.embedUrl && embedMeta && (
                  <section className="max-w-2xl mx-auto mt-10 pt-8 border-t border-stone-200 min-w-0">
                    <h2 className="font-editorial text-lg font-semibold text-stone-900 mb-4">
                      {embedMeta.provider === '站內互動網頁'
                        ? '站內互動學習舞台與教學資源'
                        : '相關雲端附件與教學資源'}
                    </h2>
                    <div className="bg-[#F7F4EE] border border-stone-200 rounded-xl p-3.5 sm:p-5 space-y-4 min-w-0 max-w-full overflow-hidden">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 min-w-0">
                        <div className="flex items-start gap-3 min-w-0">
                          <div className="w-10 h-10 rounded-lg bg-white border border-stone-200 flex items-center justify-center shrink-0">
                            {embedMeta.provider === '站內互動網頁' ? (
                              <MonitorPlay className="w-5 h-5 text-[#1E3A8A]" />
                            ) : (
                              <FileText className="w-5 h-5 text-[#1E3A8A]" />
                            )}
                          </div>
                          <div className="min-w-0">
                            <div className="text-xs font-mono-tabular text-stone-500 truncate">
                              {embedMeta.provider}
                              {embedMeta.domain ? ` · ${embedMeta.domain}` : ''}
                            </div>
                            <div className="text-sm font-semibold text-stone-900 mt-0.5 break-words">
                              {post.embedLabel || post.title}
                            </div>
                          </div>
                        </div>

                        <div className="flex flex-wrap items-center gap-2 shrink-0">
                          {inlineEmbedUrl && (
                            <button
                              type="button"
                              onClick={() => setShowInlineEmbed((v) => !v)}
                              className="px-3.5 py-2 text-xs font-medium text-stone-800 bg-white border border-stone-300 rounded-lg hover:bg-stone-50 inline-flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0"
                            >
                              <Eye className="w-3.5 h-3.5" />
                              <span>
                                {showInlineEmbed
                                  ? '收合預覽'
                                  : embedMeta.provider === '站內互動網頁'
                                  ? '原地展開互動'
                                  : '內嵌預覽'}
                              </span>
                            </button>
                          )}
                          {embedMeta.provider === '站內互動網頁' &&
                            onOpenFullEmbed && (
                              <button
                                type="button"
                                onClick={() =>
                                  onOpenFullEmbed(
                                    post.embedUrl!,
                                    post.embedLabel || post.title,
                                  )
                                }
                                className="px-3.5 py-2 text-xs font-medium text-[#1E3A8A] bg-white border border-[#1E3A8A]/30 rounded-lg hover:bg-[#1E3A8A]/5 inline-flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0"
                              >
                                <Maximize2 className="w-3.5 h-3.5" />
                                <span>全螢幕舞台</span>
                              </button>
                            )}
                          <a
                            href={post.embedUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="px-3.5 py-2 text-xs font-medium text-white bg-[#1E3A8A] rounded-lg hover:bg-[#172554] inline-flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0"
                          >
                            <span>
                              {embedMeta.provider === '站內互動網頁'
                                ? '獨立分頁開啟'
                                : '開啟原始連結'}
                            </span>
                            <ExternalLink className="w-3.5 h-3.5" />
                          </a>
                        </div>
                      </div>

                      {showInlineEmbed && inlineEmbedUrl && (
                        <div className="pt-3 border-t border-stone-200 min-w-0 max-w-full space-y-2">
                          <div className="w-full max-w-full min-w-0 overflow-x-auto rounded-lg border border-stone-200 bg-white">
                            <iframe
                              src={inlineEmbedUrl}
                              title={post.embedLabel || post.title}
                              className={`block w-full max-w-full min-w-0 ${
                                embedMeta.provider === '站內互動網頁'
                                  ? 'h-[560px]'
                                  : 'h-[420px] sm:h-[460px]'
                              } bg-white`}
                              loading="lazy"
                            />
                          </div>
                          {embedMeta.provider !== '站內互動網頁' && (
                            <p className="text-[11px] text-stone-500 leading-relaxed">
                              若手機預覽畫面顯示裁切、「檔案不存在」或需要登入權限，請點擊上方「開啟原始連結」直接於 Google 雲端硬碟開啟檢視。
                            </p>
                          )}
                        </div>
                      )}
                    </div>
                  </section>
                )}
              </div>
            </>
          )}

          {/* Footer Navigation Between Articles */}
          <footer className="px-4 sm:px-12 py-5 sm:py-6 bg-[#F7F4EE] border-t border-stone-200 grid grid-cols-1 sm:grid-cols-2 gap-4 min-w-0">
            <div>
              {prevPost && (
                <button
                  type="button"
                  onClick={() => {
                    setShowInlineEmbed(false);
                    onSelectPost(prevPost);
                  }}
                  className="text-left group w-full p-3 rounded-lg bg-white border border-stone-200 hover:border-stone-300 transition-colors"
                >
                  <div className="text-xs text-stone-500 flex items-center gap-1 mb-1">
                    <ArrowLeft className="w-3 h-3" />
                    <span>上一篇文章</span>
                  </div>
                  <div className="text-sm font-medium text-stone-900 group-hover:text-[#1E3A8A] line-clamp-1">
                    {prevPost.title}
                  </div>
                </button>
              )}
            </div>
            <div>
              {nextPost && (
                <button
                  type="button"
                  onClick={() => {
                    setShowInlineEmbed(false);
                    onSelectPost(nextPost);
                  }}
                  className="text-right group w-full p-3 rounded-lg bg-white border border-stone-200 hover:border-stone-300 transition-colors"
                >
                  <div className="text-xs text-stone-500 flex items-center justify-end gap-1 mb-1">
                    <span>下一篇文章</span>
                    <ArrowRight className="w-3 h-3" />
                  </div>
                  <div className="text-sm font-medium text-stone-900 group-hover:text-[#1E3A8A] line-clamp-1">
                    {nextPost.title}
                  </div>
                </button>
              )}
            </div>
          </footer>
        </article>
      </div>
    </div>
  );
};
