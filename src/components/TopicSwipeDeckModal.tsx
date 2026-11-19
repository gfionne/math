import React, {useCallback, useEffect, useRef, useState} from 'react';
import {
  ArrowDown,
  ArrowUp,
  ArrowUpRight,
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
import {
  estimateReadMinutes,
  formatCategoryDisplay,
  getCategoryAccent,
  TopicGroup,
} from '../utils/postFormatting';

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
  const railRef = useRef<HTMLDivElement | null>(null);
  const [activeTopicIdx, setActiveTopicIdx] = useState(initialTopicIndex);
  const [activeCardIdx, setActiveCardIdx] = useState(initialCardIndex);
  const [isDragging, setIsDragging] = useState(false);
  const [failedImages, setFailedImages] = useState<Record<string, boolean>>({});
  const lastTopicSwitchRef = useRef<number>(0);

  const dragRef = useRef<{
    isDown: boolean;
    startX: number;
    startY: number;
    startScrollLeft: number;
    hasDragged: boolean;
  }>({
    isDown: false,
    startX: 0,
    startY: 0,
    startScrollLeft: 0,
    hasDragged: false,
  });

  const touchStartRef = useRef<{x: number; y: number} | null>(null);

  const safeTopicIdx = Math.max(0, Math.min(groups.length - 1, activeTopicIdx));
  const currentGroup = groups[safeTopicIdx];
  const currentPosts = currentGroup?.posts || [];
  const safeCardIdx = Math.max(0, Math.min(currentPosts.length - 1, activeCardIdx));

  const scrollToCard = useCallback(
    (cardIdx: number, behavior: ScrollBehavior = 'smooth') => {
      const rail = railRef.current;
      if (!rail) return;
      const cards = Array.from(rail.children) as HTMLElement[];
      const clamped = Math.max(0, Math.min(cards.length - 1, cardIdx));
      const target = cards[clamped];
      if (!target) return;
      const targetLeft =
        target.offsetLeft - (rail.clientWidth - target.clientWidth) / 2;
      rail.scrollTo({
        left: Math.max(0, targetLeft),
        behavior,
      });
      setActiveCardIdx(clamped);
    },
    [],
  );

  const switchTopic = useCallback(
    (nextTopicIdx: number) => {
      const clamped = Math.max(0, Math.min(groups.length - 1, nextTopicIdx));
      if (clamped === safeTopicIdx) return;
      const now = Date.now();
      lastTopicSwitchRef.current = now;
      setActiveTopicIdx(clamped);
      setActiveCardIdx(0);
      requestAnimationFrame(() => {
        scrollToCard(0, 'auto');
      });
    },
    [groups.length, safeTopicIdx, scrollToCard],
  );

  useEffect(() => {
    if (!isOpen) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const clampedTopic = Math.max(
      0,
      Math.min(groups.length - 1, initialTopicIndex),
    );
    const maxCard = Math.max(0, (groups[clampedTopic]?.posts.length ?? 1) - 1);
    const clampedCard = Math.max(0, Math.min(maxCard, initialCardIndex));

    setActiveTopicIdx(clampedTopic);
    setActiveCardIdx(clampedCard);

    const raf = requestAnimationFrame(() => {
      scrollToCard(clampedCard, 'auto');
    });

    return () => {
      cancelAnimationFrame(raf);
      document.body.style.overflow = prevOverflow;
    };
  }, [isOpen, initialTopicIndex, initialCardIndex, groups, scrollToCard]);

  useEffect(() => {
    if (!isOpen || isSuspended) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        scrollToCard(safeCardIdx + 1);
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        scrollToCard(safeCardIdx - 1);
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        switchTopic(safeTopicIdx + 1);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        switchTopic(safeTopicIdx - 1);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [
    isOpen,
    isSuspended,
    onClose,
    safeCardIdx,
    safeTopicIdx,
    scrollToCard,
    switchTopic,
  ]);

  if (!isOpen || groups.length === 0 || !currentGroup) return null;

  const handleRailScroll = () => {
    const rail = railRef.current;
    if (!rail) return;
    const cards = Array.from(rail.children) as HTMLElement[];
    if (cards.length === 0) return;

    const railCenter = rail.scrollLeft + rail.clientWidth / 2;
    let closestIdx = 0;
    let minDiff = Infinity;
    for (let i = 0; i < cards.length; i++) {
      const cardCenter = cards[i].offsetLeft + cards[i].clientWidth / 2;
      const diff = Math.abs(cardCenter - railCenter);
      if (diff < minDiff) {
        minDiff = diff;
        closestIdx = i;
      }
    }
    if (closestIdx !== activeCardIdx) {
      setActiveCardIdx(closestIdx);
    }
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.pointerType !== 'mouse' || e.button !== 0) return;
    const rail = railRef.current;
    if (!rail) return;
    dragRef.current = {
      isDown: true,
      startX: e.clientX,
      startY: e.clientY,
      startScrollLeft: rail.scrollLeft,
      hasDragged: false,
    };
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const st = dragRef.current;
    if (!st.isDown) return;
    const dx = e.clientX - st.startX;
    if (Math.abs(dx) > 6 && !st.hasDragged) {
      st.hasDragged = true;
      setIsDragging(true);
    }
    if (st.hasDragged && railRef.current) {
      railRef.current.scrollLeft = st.startScrollLeft - dx;
    }
  };

  const handlePointerUpOrCancel = () => {
    const st = dragRef.current;
    if (!st.isDown) return;
    st.isDown = false;
    const didDrag = st.hasDragged;
    setIsDragging(false);

    if (didDrag && railRef.current) {
      const rail = railRef.current;
      const cards = Array.from(rail.children) as HTMLElement[];
      const railCenter = rail.scrollLeft + rail.clientWidth / 2;
      let closestIdx = 0;
      let minDiff = Infinity;
      for (let i = 0; i < cards.length; i++) {
        const cardCenter = cards[i].offsetLeft + cards[i].clientWidth / 2;
        const diff = Math.abs(cardCenter - railCenter);
        if (diff < minDiff) {
          minDiff = diff;
          closestIdx = i;
        }
      }
      scrollToCard(closestIdx, 'smooth');
      setTimeout(() => {
        dragRef.current.hasDragged = false;
      }, 0);
    } else {
      st.hasDragged = false;
    }
  };

  const handleClickCapture = (e: React.MouseEvent) => {
    if (dragRef.current.hasDragged) {
      e.preventDefault();
      e.stopPropagation();
    }
  };

  const handleTouchStart = (e: React.TouchEvent<HTMLDivElement>) => {
    if (e.touches.length !== 1) return;
    touchStartRef.current = {
      x: e.touches[0].clientX,
      y: e.touches[0].clientY,
    };
  };

  const handleTouchEnd = (e: React.TouchEvent<HTMLDivElement>) => {
    if (!touchStartRef.current || e.changedTouches.length !== 1) return;
    const dx = e.changedTouches[0].clientX - touchStartRef.current.x;
    const dy = e.changedTouches[0].clientY - touchStartRef.current.y;
    touchStartRef.current = null;

    if (Math.abs(dy) > 60 && Math.abs(dy) > Math.abs(dx) * 1.4) {
      if (dy < 0 && safeTopicIdx < groups.length - 1) {
        switchTopic(safeTopicIdx + 1);
      } else if (dy > 0 && safeTopicIdx > 0) {
        switchTopic(safeTopicIdx - 1);
      }
    }
  };

  const handleWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    if (
      Math.abs(e.deltaY) > 28 &&
      Math.abs(e.deltaY) > Math.abs(e.deltaX) * 1.3
    ) {
      const now = Date.now();
      if (now - lastTopicSwitchRef.current < 450) return;
      if (e.deltaY > 0 && safeTopicIdx < groups.length - 1) {
        switchTopic(safeTopicIdx + 1);
      } else if (e.deltaY < 0 && safeTopicIdx > 0) {
        switchTopic(safeTopicIdx - 1);
      }
    }
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

  const topicAccent = getCategoryAccent(currentGroup.topic);
  const prevTopic = safeTopicIdx > 0 ? groups[safeTopicIdx - 1] : null;
  const nextTopic =
    safeTopicIdx < groups.length - 1 ? groups[safeTopicIdx + 1] : null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="主題卡片快覽模式"
      className="fixed inset-0 z-40 bg-[#EAE5DB] flex flex-col"
    >
      {/* Top Bar */}
      <header className="h-14 shrink-0 border-b border-stone-200 bg-white px-4 sm:px-6 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3 min-w-0">
          <span
            className={`font-mono-tabular text-xs font-bold whitespace-nowrap shrink-0 ${topicAccent.textClass}`}
          >
            {String(safeTopicIdx + 1).padStart(2, '0')} /{' '}
            {String(groups.length).padStart(2, '0')}
          </span>
          <h2 className="font-editorial text-base sm:text-lg font-bold text-stone-950 truncate">
            {currentGroup.topic}
          </h2>
          <span className="hidden sm:inline text-xs font-mono-tabular text-stone-500">
            · 第 {safeCardIdx + 1} / {currentPosts.length} 篇
          </span>
        </div>

        <button
          type="button"
          onClick={onClose}
          className="min-h-[40px] px-3.5 py-1.5 text-xs font-medium text-stone-800 bg-[#F7F4EE] border border-stone-300/80 rounded-lg hover:bg-stone-200/70 inline-flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0"
        >
          <X className="w-4 h-4" />
          <span>回到首頁</span>
        </button>
      </header>

      {/* Mobile / Tablet Topic Channel Strip */}
      <div className="lg:hidden shrink-0 bg-white border-b border-stone-200 px-3 py-2 flex items-center gap-1.5 overflow-x-auto no-scrollbar">
        {groups.map((g, idx) => {
          const isAct = idx === safeTopicIdx;
          const acc = getCategoryAccent(g.topic);
          return (
            <button
              key={g.topic}
              type="button"
              onClick={() => switchTopic(idx)}
              className={`min-h-[36px] px-3 py-1.5 text-xs rounded-lg transition-colors whitespace-nowrap shrink-0 ${
                isAct
                  ? `${acc.barClass} text-white font-semibold`
                  : 'bg-[#F7F4EE] text-stone-700 hover:bg-stone-200/70 font-medium'
              }`}
            >
              {g.topic} ({g.posts.length})
            </button>
          );
        })}
      </div>

      {/* Main 2-Pane Body */}
      <div className="flex-1 min-h-0 flex">
        {/* Desktop Left Topic Channel Rail */}
        <aside className="hidden lg:flex w-64 shrink-0 border-r border-stone-200 bg-white flex-col justify-between p-4">
          <div className="space-y-1 overflow-y-auto pr-1">
            <div className="px-3 pb-2 text-xs font-semibold text-stone-500">
              所有專欄主題（上下切換）
            </div>
            {groups.map((g, idx) => {
              const isActive = idx === safeTopicIdx;
              const acc = getCategoryAccent(g.topic);
              return (
                <button
                  key={g.topic}
                  type="button"
                  onClick={() => switchTopic(idx)}
                  className={`w-full text-left px-3 py-2.5 rounded-lg text-sm transition-colors flex items-center justify-between gap-2 ${
                    isActive
                      ? `bg-[#F7F4EE] ${acc.textClass} font-bold`
                      : 'text-stone-700 hover:bg-stone-50 font-medium'
                  }`}
                >
                  <span className="truncate">
                    <span className="font-mono-tabular text-xs mr-2 opacity-65">
                      {String(idx + 1).padStart(2, '0')}
                    </span>
                    {g.topic}
                  </span>
                  <span className="font-mono-tabular text-xs text-stone-500 shrink-0">
                    {g.posts.length}
                  </span>
                </button>
              );
            })}
          </div>

          <div className="pt-4 border-t border-stone-100 text-xs text-stone-500 space-y-1 px-2">
            <div>← → 左右拖曳或滑動同主題文章</div>
            <div>↑ ↓ 上下滾動或點擊切換主題</div>
          </div>
        </aside>

        {/* Interactive 2D Card Stage */}
        <div
          onTouchStart={handleTouchStart}
          onTouchEnd={handleTouchEnd}
          onWheel={handleWheel}
          className="flex-1 min-w-0 flex flex-col justify-between relative overflow-hidden"
        >
          {/* Story-Style Progress Bars */}
          <div className="max-w-2xl w-full mx-auto px-5 pt-4 pb-1 flex items-center gap-1.5 shrink-0">
            {currentPosts.map((p, idx) => (
              <button
                key={`${p.slug}-bar-${p.rowIndex ?? idx}`}
                type="button"
                onClick={() => scrollToCard(idx)}
                aria-label={`跳至第 ${idx + 1} 篇：${p.title}`}
                className="flex-1 py-2 focus-visible:outline-none group"
              >
                <span
                  className={`block h-1.5 w-full rounded-full transition-colors ${
                    idx === safeCardIdx
                      ? topicAccent.barClass
                      : idx < safeCardIdx
                      ? 'bg-stone-500/60'
                      : 'bg-stone-400/40 group-hover:bg-stone-400'
                  }`}
                />
              </button>
            ))}
          </div>

          {/* Peekable Horizontal Card Carousel */}
          <div className="flex-1 min-h-0 relative flex items-center">
            <div
              ref={railRef}
              onScroll={handleRailScroll}
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUpOrCancel}
              onPointerCancel={handlePointerUpOrCancel}
              onClickCapture={handleClickCapture}
              className={`w-full h-full flex items-center gap-4 sm:gap-6 overflow-x-auto no-scrollbar px-[7vw] sm:px-[14%] lg:px-[16%] py-2 select-none ${
                isDragging
                  ? 'cursor-grabbing'
                  : 'snap-x snap-mandatory scroll-smooth cursor-grab'
              }`}
            >
              {currentPosts.map((post, idx) => {
                const isActive = idx === safeCardIdx;
                const hasCover = Boolean(
                  post.coverImageUrl && !failedImages[post.slug],
                );
                const embedMeta = post.embedUrl
                  ? inferEmbedProvider(post.embedUrl)
                  : null;
                const readMins = estimateReadMinutes(
                  post.content || post.summary,
                );
                const cardAccent = getCategoryAccent(post.category || currentGroup.topic);

                return (
                  <div
                    key={`${post.slug}-card-${post.rowIndex ?? idx}`}
                    onClick={() => {
                      if (!isActive) {
                        scrollToCard(idx);
                      }
                    }}
                    className={`w-[86vw] sm:w-[72%] md:w-[68%] max-w-2xl h-full max-h-[600px] snap-center shrink-0 flex items-center transition-all duration-200 ${
                      isActive
                        ? 'opacity-100 scale-100'
                        : 'opacity-55 scale-[0.94] hover:opacity-80 cursor-pointer'
                    }`}
                  >
                    <article className="w-full h-full bg-white border border-stone-300 rounded-2xl overflow-hidden shadow-lg flex flex-col">
                      {/* Distinct Top Category Accent Bar */}
                      <div className={`h-1.5 w-full shrink-0 ${cardAccent.barClass}`} />

                      {/* Crisp Image OR Attachment Banner (No Duplicate-Title Blur Box) */}
                      {hasCover ? (
                        <button
                          type="button"
                          onClick={() => {
                            if (isActive) onSelectPost(post);
                          }}
                          className="h-[36%] min-h-[160px] max-h-[250px] w-full bg-stone-100 border-b border-stone-200 overflow-hidden text-left shrink-0 group focus-visible:outline-none"
                        >
                          <img
                            src={post.coverImageUrl}
                            alt={post.title}
                            draggable={false}
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
                          onClick={() => {
                            if (isActive) onSelectPost(post);
                          }}
                          className="w-full bg-[#F7F4EE] border-b border-stone-200 px-6 py-4 flex items-center gap-3.5 text-left shrink-0 hover:bg-[#EFEAE0] transition-colors"
                        >
                          <div className="w-10 h-10 rounded-lg bg-white border border-stone-200 flex items-center justify-center shrink-0">
                            {renderEmbedIcon(embedMeta.provider)}
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="text-[11px] font-mono-tabular uppercase tracking-wider text-stone-500">
                              {embedMeta.provider}
                            </div>
                            <div className="text-sm font-semibold text-stone-900 truncate mt-0.5">
                              {post.embedLabel || '檢視雲端教案與附件'}
                            </div>
                          </div>
                          <ExternalLink className="w-4 h-4 text-stone-400 shrink-0" />
                        </button>
                      ) : null}

                      <div className="p-6 sm:p-7 flex-1 min-h-0 flex flex-col justify-between gap-4 overflow-y-auto">
                        <div className="space-y-3">
                          <div className="flex items-center justify-between gap-2 pb-2.5 border-b border-stone-100 text-xs">
                            <span className={`font-bold tracking-wide ${cardAccent.textClass}`}>
                              {formatCategoryDisplay(post.category, currentGroup.topic)}
                            </span>
                            <div className="flex items-center gap-2 text-stone-500 font-mono-tabular">
                              <span>{post.academicYear}</span>
                              <span aria-hidden="true">·</span>
                              <span>{readMins} 分鐘閱讀</span>
                              <span aria-hidden="true">·</span>
                              <span>
                                {idx + 1} / {currentPosts.length}
                              </span>
                            </div>
                          </div>

                          <h3 className="font-editorial text-xl sm:text-2xl font-bold text-stone-950 leading-snug text-balance">
                            <button
                              type="button"
                              onClick={() => {
                                if (isActive) onSelectPost(post);
                              }}
                              className="text-left hover:text-[#1E3A8A] transition-colors"
                            >
                              {post.title}
                            </button>
                          </h3>

                          <p
                            className={`text-sm sm:text-base text-stone-700 leading-[1.7] ${
                              hasCover ? 'line-clamp-4' : 'line-clamp-6'
                            }`}
                          >
                            {post.summary ||
                              '點擊「閱讀全文」檢視完整教案內容、數學探究脈絡與社群紀錄。'}
                          </p>
                        </div>

                        <div className="pt-4 border-t border-stone-200/80 flex flex-wrap items-center justify-between gap-3 shrink-0">
                          <div className="text-xs text-stone-500">
                            <span className="font-medium text-stone-700">
                              {post.author}
                            </span>
                            <span className="mx-1.5" aria-hidden="true">
                              ·
                            </span>
                            <span className="font-mono-tabular">
                              {post.publishedAt}
                            </span>
                          </div>

                          <div className="flex items-center gap-2">
                            {post.embedUrl && isActive && (
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
                              onClick={() => {
                                if (isActive) {
                                  onSelectPost(post);
                                } else {
                                  scrollToCard(idx);
                                }
                              }}
                              className="min-h-[40px] px-4 py-2 text-xs font-semibold text-white bg-[#1E3A8A] rounded-lg hover:bg-[#172554] inline-flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0"
                            >
                              <span>{isActive ? '閱讀全文' : '看這篇'}</span>
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

            {safeCardIdx > 0 && (
              <button
                type="button"
                onClick={() => scrollToCard(safeCardIdx - 1)}
                aria-label="同主題上一篇"
                className="hidden sm:flex absolute left-4 top-1/2 -translate-y-1/2 min-h-[44px] min-w-[44px] items-center justify-center rounded-full bg-white border border-stone-300 text-stone-900 shadow-md hover:bg-stone-50 transition-all"
              >
                <ChevronLeft className="w-5 h-5" />
              </button>
            )}
            {safeCardIdx < currentPosts.length - 1 && (
              <button
                type="button"
                onClick={() => scrollToCard(safeCardIdx + 1)}
                aria-label="同主題下一篇"
                className="hidden sm:flex absolute right-4 top-1/2 -translate-y-1/2 min-h-[44px] min-w-[44px] items-center justify-center rounded-full bg-white border border-stone-300 text-stone-900 shadow-md hover:bg-stone-50 transition-all"
              >
                <ChevronRight className="w-5 h-5" />
              </button>
            )}
          </div>

          {/* Bottom Topic Switcher Dock */}
          <div className="shrink-0 border-t border-stone-200 bg-white px-4 sm:px-6 py-2.5 flex items-center justify-between gap-3">
            {prevTopic ? (
              <button
                type="button"
                onClick={() => switchTopic(safeTopicIdx - 1)}
                className="min-h-[40px] px-3 py-1.5 text-xs font-medium text-stone-700 bg-[#F7F4EE] border border-stone-300/80 rounded-lg hover:bg-stone-200/70 inline-flex items-center gap-1.5 whitespace-nowrap"
              >
                <ArrowUp className="w-3.5 h-3.5" />
                <span>上個主題：{prevTopic.topic}</span>
              </button>
            ) : (
              <span className="text-xs text-stone-400">已是第一個主題</span>
            )}

            <span className="hidden md:inline text-xs text-stone-500 font-mono-tabular">
              {currentGroup.topic} · 第 {safeCardIdx + 1} / {currentPosts.length} 篇
            </span>

            {nextTopic ? (
              <button
                type="button"
                onClick={() => switchTopic(safeTopicIdx + 1)}
                className="min-h-[40px] px-3.5 py-1.5 text-xs font-semibold text-[#1E3A8A] bg-[#F7F4EE] border border-stone-300/80 rounded-lg hover:bg-[#1E3A8A] hover:text-white inline-flex items-center gap-1.5 transition-colors whitespace-nowrap"
              >
                <span>
                  下個主題：{nextTopic.topic}（{nextTopic.posts.length} 篇）
                </span>
                <ArrowDown className="w-3.5 h-3.5" />
              </button>
            ) : (
              <span className="text-xs text-stone-400">已是最後一個主題</span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
