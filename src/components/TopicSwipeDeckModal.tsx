import React, {useCallback, useEffect, useRef, useState} from 'react';
import {
  ArrowDown,
  ArrowUp,
  ArrowUpRight,
  BookOpen,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  FileText,
  Table2,
  Video,
  X,
} from 'lucide-react';
import {JournalPost} from '../types/journal';
import {inferEmbedProvider} from '../services/sheetsDb';
import {estimateReadMinutes, TopicGroup} from '../utils/postFormatting';

interface TopicSwipeDeckModalProps {
  isOpen: boolean;
  isSuspended?: boolean;
  groups: TopicGroup[];
  initialTopicIndex: number;
  initialCardIndex: number;
  onClose: () => void;
  onSelectPost: (post: JournalPost) => void;
}

export const TopicSwipeDeckModal: React.FC<TopicSwipeDeckModalProps> = ({
  isOpen,
  isSuspended = false,
  groups,
  initialTopicIndex,
  initialCardIndex,
  onClose,
  onSelectPost,
}) => {
  const verticalRef = useRef<HTMLDivElement | null>(null);
  const horizontalRefs = useRef<Record<number, HTMLDivElement | null>>({});
  const [activeTopicIdx, setActiveTopicIdx] = useState(initialTopicIndex);
  const [cardIndices, setCardIndices] = useState<Record<number, number>>({});
  const [failedImages, setFailedImages] = useState<Record<string, boolean>>({});

  const safeTopicIdx = Math.max(
    0,
    Math.min(groups.length - 1, activeTopicIdx),
  );
  const currentGroup = groups[safeTopicIdx];
  const currentCardIdx = cardIndices[safeTopicIdx] ?? 0;

  const scrollToTopic = useCallback(
    (topicIdx: number, behavior: ScrollBehavior = 'smooth') => {
      const container = verticalRef.current;
      if (!container) return;
      const clamped = Math.max(0, Math.min(groups.length - 1, topicIdx));
      container.scrollTo({
        top: clamped * container.clientHeight,
        behavior,
      });
      setActiveTopicIdx(clamped);
    },
    [groups.length],
  );

  const scrollToCardInTopic = useCallback(
    (
      topicIdx: number,
      cardIdx: number,
      behavior: ScrollBehavior = 'smooth',
    ) => {
      const container = horizontalRefs.current[topicIdx];
      const group = groups[topicIdx];
      if (!container || !group) return;
      const clamped = Math.max(0, Math.min(group.posts.length - 1, cardIdx));
      container.scrollTo({
        left: clamped * container.clientWidth,
        behavior,
      });
      setCardIndices((prev) => ({...prev, [topicIdx]: clamped}));
    },
    [groups],
  );

  // Sync initial scroll position & lock background page scroll
  useEffect(() => {
    if (!isOpen) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const clampedTopic = Math.max(
      0,
      Math.min(groups.length - 1, initialTopicIndex),
    );
    const maxCard = Math.max(
      0,
      (groups[clampedTopic]?.posts.length ?? 1) - 1,
    );
    const clampedCard = Math.max(0, Math.min(maxCard, initialCardIndex));

    setActiveTopicIdx(clampedTopic);
    setCardIndices((prev) => ({...prev, [clampedTopic]: clampedCard}));

    const raf = requestAnimationFrame(() => {
      scrollToTopic(clampedTopic, 'auto');
      scrollToCardInTopic(clampedTopic, clampedCard, 'auto');
    });

    return () => {
      cancelAnimationFrame(raf);
      document.body.style.overflow = prevOverflow;
    };
  }, [
    isOpen,
    initialTopicIndex,
    initialCardIndex,
    groups,
    scrollToTopic,
    scrollToCardInTopic,
  ]);

  // Keyboard arrow navigation (Left/Right: same topic, Up/Down: switch topic, Esc: close)
  useEffect(() => {
    if (!isOpen || isSuspended) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        scrollToCardInTopic(safeTopicIdx, currentCardIdx + 1);
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        scrollToCardInTopic(safeTopicIdx, currentCardIdx - 1);
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        scrollToTopic(safeTopicIdx + 1);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        scrollToTopic(safeTopicIdx - 1);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [
    isOpen,
    isSuspended,
    onClose,
    safeTopicIdx,
    currentCardIdx,
    scrollToCardInTopic,
    scrollToTopic,
  ]);

  if (!isOpen || groups.length === 0 || !currentGroup) return null;

  const handleVerticalScroll = () => {
    const container = verticalRef.current;
    if (!container || container.clientHeight === 0) return;
    const nextIdx = Math.round(container.scrollTop / container.clientHeight);
    if (nextIdx !== activeTopicIdx && nextIdx >= 0 && nextIdx < groups.length) {
      setActiveTopicIdx(nextIdx);
    }
  };

  const handleHorizontalScroll = (topicIdx: number) => {
    const container = horizontalRefs.current[topicIdx];
    const group = groups[topicIdx];
    if (!container || !group || container.clientWidth === 0) return;
    const nextIdx = Math.round(container.scrollLeft / container.clientWidth);
    const clamped = Math.max(0, Math.min(group.posts.length - 1, nextIdx));
    setCardIndices((prev) =>
      prev[topicIdx] === clamped ? prev : {...prev, [topicIdx]: clamped},
    );
  };

  const renderEmbedIcon = (provider: string) => {
    if (provider === 'Google Meet') {
      return <Video className="w-5 h-5 text-[#1E3A8A]" />;
    }
    if (provider === 'Google Sheets') {
      return <Table2 className="w-5 h-5 text-[#1E3A8A]" />;
    }
    return <FileText className="w-5 h-5 text-[#1E3A8A]" />;
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="主題卡片滑動閱讀模式"
      className="fixed inset-0 z-40 bg-[#FBF9F5] flex flex-col"
    >
      {/* Compact Top Navigation Strip */}
      <header className="h-14 shrink-0 border-b border-stone-200 bg-white/95 backdrop-blur-sm px-4 sm:px-6 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3 min-w-0">
          <span className="font-mono-tabular text-xs font-semibold text-[#1E3A8A] whitespace-nowrap shrink-0">
            主題 {String(safeTopicIdx + 1).padStart(2, '0')} /{' '}
            {String(groups.length).padStart(2, '0')}
          </span>
          <h2 className="font-editorial text-base sm:text-lg font-semibold text-stone-950 truncate">
            {currentGroup.topic}
          </h2>
        </div>

        {/* Quick Topic Switcher on Tablet/Desktop */}
        <div className="hidden lg:flex items-center gap-1 overflow-x-auto no-scrollbar max-w-xl">
          {groups.map((g, idx) => (
            <button
              key={g.topic}
              type="button"
              onClick={() => scrollToTopic(idx)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                idx === safeTopicIdx
                  ? 'bg-[#1E3A8A] text-white'
                  : 'text-stone-600 hover:bg-stone-100'
              }`}
            >
              {g.topic}
            </button>
          ))}
        </div>

        <button
          type="button"
          onClick={onClose}
          className="min-h-[40px] px-3 py-1.5 text-xs font-medium text-stone-700 bg-[#F7F4EE] border border-stone-200 rounded-lg hover:bg-stone-200/70 inline-flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0"
        >
          <X className="w-4 h-4" />
          <span>離開滑動模式</span>
        </button>
      </header>

      {/* Vertical Snap Deck: Different Topics (Swipe Down / Up) */}
      <div
        ref={verticalRef}
        onScroll={handleVerticalScroll}
        className="flex-1 overflow-y-auto snap-y snap-mandatory scroll-smooth no-scrollbar relative"
      >
        {groups.map((group, topicIdx) => {
          const activeIdx = cardIndices[topicIdx] ?? 0;
          const nextPost =
            activeIdx < group.posts.length - 1
              ? group.posts[activeIdx + 1]
              : null;
          const nextTopic =
            topicIdx < groups.length - 1 ? groups[topicIdx + 1] : null;
          const prevTopic = topicIdx > 0 ? groups[topicIdx - 1] : null;

          return (
            <section
              key={group.topic}
              className="h-full w-full snap-start snap-always shrink-0 flex flex-col justify-between py-3 sm:py-5 relative"
            >
              {/* Horizontal Snap Rail: Same Topic (Swipe Left / Right) */}
              <div
                ref={(el) => {
                  horizontalRefs.current[topicIdx] = el;
                }}
                onScroll={() => handleHorizontalScroll(topicIdx)}
                className="flex-1 min-h-0 flex overflow-x-auto snap-x snap-mandatory scroll-smooth no-scrollbar"
              >
                {group.posts.map((post, cardIdx) => {
                  const hasCover = Boolean(
                    post.coverImageUrl && !failedImages[post.slug],
                  );
                  const embedMeta = post.embedUrl
                    ? inferEmbedProvider(post.embedUrl)
                    : null;
                  const readMins = estimateReadMinutes(
                    post.content || post.summary,
                  );

                  return (
                    <div
                      key={post.slug}
                      className="w-full h-full snap-start snap-always shrink-0 px-4 sm:px-16 flex items-center justify-center"
                    >
                      <article className="w-full max-w-2xl max-h-full bg-white border border-stone-200 rounded-2xl overflow-hidden shadow-sm flex flex-col">
                        {/* Visual Slot */}
                        {hasCover ? (
                          <button
                            type="button"
                            onClick={() => onSelectPost(post)}
                            className="h-[26vh] min-h-[160px] max-h-[260px] w-full bg-[#EBE6DF] border-b border-stone-200 overflow-hidden text-left shrink-0 group focus-visible:outline-none"
                          >
                            <img
                              src={post.coverImageUrl}
                              alt={post.title}
                              referrerPolicy="no-referrer"
                              onError={() =>
                                setFailedImages((prev) => ({
                                  ...prev,
                                  [post.slug]: true,
                                }))
                              }
                              className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-[1.02]"
                            />
                          </button>
                        ) : post.embedUrl && embedMeta ? (
                          <button
                            type="button"
                            onClick={() => onSelectPost(post)}
                            className="h-[22vh] min-h-[140px] max-h-[210px] w-full bg-[#F7F4EE] border-b border-stone-200 p-6 flex flex-col justify-between text-left shrink-0"
                          >
                            <div className="flex items-center justify-between text-xs text-stone-500 w-full">
                              <span className="font-mono-tabular uppercase tracking-wider">
                                {embedMeta.provider}
                              </span>
                              <ExternalLink className="w-4 h-4 text-stone-400" />
                            </div>
                            <div className="bg-white border border-stone-200 rounded-lg px-4 py-3 flex items-center gap-3 w-full">
                              <div className="w-10 h-10 rounded-md bg-[#FBF9F5] border border-stone-200 flex items-center justify-center shrink-0">
                                {renderEmbedIcon(embedMeta.provider)}
                              </div>
                              <div className="min-w-0 flex-1">
                                <div className="text-sm font-medium text-stone-900 truncate">
                                  {post.embedLabel || post.title}
                                </div>
                                <div className="text-xs text-stone-500 truncate mt-0.5">
                                  {embedMeta.domain || '雲端嵌入文件'}
                                </div>
                              </div>
                            </div>
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => onSelectPost(post)}
                            className="h-[20vh] min-h-[130px] max-h-[190px] w-full bg-[#F7F4EE] border-b border-stone-200 p-6 flex flex-col justify-between text-left shrink-0"
                          >
                            <div className="flex items-center justify-between w-full text-xs font-mono-tabular text-stone-500">
                              <span>
                                {post.academicYear} · {group.topic}
                              </span>
                              <BookOpen className="w-4 h-4 text-stone-400" />
                            </div>
                            <div className="font-editorial text-lg font-medium text-stone-800 line-clamp-2">
                              {post.title}
                            </div>
                          </button>
                        )}

                        {/* Card Editorial Content */}
                        <div className="p-5 sm:p-7 flex-1 min-h-0 flex flex-col justify-between gap-4 overflow-y-auto">
                          <div className="space-y-3">
                            <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-stone-500">
                              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                                <span className="font-semibold text-[#1E3A8A]">
                                  {group.topic}
                                </span>
                                <span aria-hidden="true">·</span>
                                <span className="font-mono-tabular">
                                  {post.academicYear}
                                </span>
                                <span aria-hidden="true">·</span>
                                <span>{readMins} 分鐘閱讀</span>
                              </div>
                              <span className="font-mono-tabular text-stone-500">
                                第 {cardIdx + 1} / {group.posts.length} 篇
                              </span>
                            </div>

                            <h3 className="font-editorial text-xl sm:text-3xl font-semibold text-stone-950 leading-snug text-balance">
                              <button
                                type="button"
                                onClick={() => onSelectPost(post)}
                                className="text-left hover:text-[#1E3A8A] transition-colors"
                              >
                                {post.title}
                              </button>
                            </h3>

                            <p className="text-sm sm:text-base text-stone-600 leading-relaxed line-clamp-4">
                              {post.summary ||
                                '點擊「閱讀全文」檢視完整教案內容、數學探究脈絡與社群紀錄。'}
                            </p>
                          </div>

                          <div className="pt-4 border-t border-stone-100 flex flex-wrap items-center justify-between gap-3 shrink-0">
                            <div className="text-xs text-stone-500">
                              <span>{post.author}</span>
                              <span className="mx-1.5" aria-hidden="true">
                                ·
                              </span>
                              <span className="font-mono-tabular">
                                {post.publishedAt}
                              </span>
                            </div>

                            <div className="flex items-center gap-2">
                              {post.embedUrl && (
                                <a
                                  href={post.embedUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="min-h-[40px] px-3 py-2 text-xs font-medium text-stone-700 bg-[#F7F4EE] border border-stone-200 rounded-lg hover:bg-stone-200/70 inline-flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0"
                                >
                                  <span>雲端附件</span>
                                  <ExternalLink className="w-3.5 h-3.5" />
                                </a>
                              )}
                              <button
                                type="button"
                                onClick={() => onSelectPost(post)}
                                className="min-h-[40px] px-4 py-2 text-xs font-medium text-white bg-[#1E3A8A] rounded-lg hover:bg-[#172554] inline-flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0"
                              >
                                <span>閱讀全文</span>
                                <ArrowUpRight className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>
                        </div>
                      </article>
                    </div>
                  );
                })}
              </div>

              {/* Desktop Side Arrows for Same-Topic Card Switching */}
              {group.posts.length > 1 && (
                <>
                  <button
                    type="button"
                    onClick={() => scrollToCardInTopic(topicIdx, activeIdx - 1)}
                    disabled={activeIdx <= 0}
                    aria-label="同主題上一篇"
                    className="hidden md:flex absolute left-4 top-1/2 -translate-y-1/2 min-h-[44px] min-w-[44px] items-center justify-center rounded-full bg-white border border-stone-200 text-stone-700 shadow-sm hover:bg-stone-50 disabled:opacity-25 disabled:cursor-not-allowed transition-colors"
                  >
                    <ChevronLeft className="w-5 h-5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => scrollToCardInTopic(topicIdx, activeIdx + 1)}
                    disabled={activeIdx >= group.posts.length - 1}
                    aria-label="同主題下一篇"
                    className="hidden md:flex absolute right-4 top-1/2 -translate-y-1/2 min-h-[44px] min-w-[44px] items-center justify-center rounded-full bg-white border border-stone-200 text-stone-700 shadow-sm hover:bg-stone-50 disabled:opacity-25 disabled:cursor-not-allowed transition-colors"
                  >
                    <ChevronRight className="w-5 h-5" />
                  </button>
                </>
              )}

              {/* Bottom 2D Swipe Navigation Footer */}
              <div className="max-w-2xl w-full mx-auto px-4 pt-2 flex flex-col sm:flex-row sm:items-center justify-between gap-2 shrink-0">
                {/* Horizontal Card Dots + Next Article Cue */}
                <div className="flex items-center gap-3 min-w-0">
                  <div className="flex items-center gap-1.5 shrink-0">
                    {group.posts.map((p, idx) => (
                      <button
                        key={p.slug}
                        type="button"
                        onClick={() => scrollToCardInTopic(topicIdx, idx)}
                        aria-label={`跳至第 ${idx + 1} 篇`}
                        className="py-1.5 flex items-center"
                      >
                        <span
                          className={`block h-1.5 rounded-full transition-all ${
                            idx === activeIdx
                              ? 'w-6 bg-[#1E3A8A]'
                              : 'w-2 bg-stone-300 hover:bg-stone-400'
                          }`}
                        />
                      </button>
                    ))}
                  </div>
                  {nextPost ? (
                    <button
                      type="button"
                      onClick={() =>
                        scrollToCardInTopic(topicIdx, activeIdx + 1)
                      }
                      className="text-xs text-stone-600 hover:text-[#1E3A8A] truncate text-left"
                    >
                      ← 左滑看下篇：{nextPost.title}
                    </button>
                  ) : (
                    <span className="text-xs text-stone-400 truncate">
                      已達「{group.topic}」最後一篇
                    </span>
                  )}
                </div>

                {/* Vertical Topic Switch Controls */}
                <div className="flex items-center gap-2 shrink-0">
                  {prevTopic && (
                    <button
                      type="button"
                      onClick={() => scrollToTopic(topicIdx - 1)}
                      className="min-h-[36px] px-2.5 py-1 text-xs font-medium text-stone-600 bg-white border border-stone-200 rounded-md hover:bg-stone-50 inline-flex items-center gap-1 whitespace-nowrap"
                    >
                      <ArrowUp className="w-3.5 h-3.5" />
                      <span>{prevTopic.topic}</span>
                    </button>
                  )}
                  {nextTopic && (
                    <button
                      type="button"
                      onClick={() => scrollToTopic(topicIdx + 1)}
                      className="min-h-[36px] px-2.5 py-1 text-xs font-medium text-[#1E3A8A] bg-white border border-stone-200 rounded-md hover:bg-[#F7F4EE] inline-flex items-center gap-1 whitespace-nowrap"
                    >
                      <ArrowDown className="w-3.5 h-3.5" />
                      <span>下滑換主題：{nextTopic.topic}</span>
                    </button>
                  )}
                </div>
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
};
