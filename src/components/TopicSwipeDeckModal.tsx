import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {
  ArrowDown,
  ArrowUp,
  ArrowUpRight,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  FileText,
  Lock,
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
  normalizeDriveImageUrl,
  TopicGroup,
} from '../utils/postFormatting';
import {SwipeDeckCard, SwipeDeckGroup} from '../utils/swipeDeckBuilder';

interface TopicSwipeDeckModalProps {
  isOpen: boolean;
  isSuspended?: boolean;
  scopeLabel?: string;
  deckGroups?: SwipeDeckGroup[];
  groups?: TopicGroup[];
  initialTopicIndex: number;
  initialCardIndex: number;
  onClose: () => void;
  onSelectPost?: (post: JournalPost) => void;
  checkPostLocked?: (post: JournalPost) => boolean;
}

export const TopicSwipeDeckModal: React.FC<TopicSwipeDeckModalProps> = ({
  isOpen,
  isSuspended = false,
  scopeLabel,
  deckGroups,
  groups = [],
  initialTopicIndex,
  initialCardIndex,
  onClose,
  onSelectPost,
  checkPostLocked,
}) => {
  const railRef = useRef<HTMLDivElement | null>(null);
  const mobileStripRef = useRef<HTMLDivElement | null>(null);
  const dotStripRef = useRef<HTMLDivElement | null>(null);
  const mobileTabRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const desktopTabRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const dotItemRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const [activeTopicIdx, setActiveTopicIdx] = useState(initialTopicIndex);
  const [activeCardIdx, setActiveCardIdx] = useState(initialCardIndex);
  const [topicTransitionDir, setTopicTransitionDir] = useState<
    'up' | 'down' | null
  >(null);
  const [isDragging, setIsDragging] = useState(false);
  const [failedImages, setFailedImages] = useState<Record<string, boolean>>({});
  const lastTopicSwitchRef = useRef<number>(0);

  const resolvedGroups = useMemo<SwipeDeckGroup[]>(() => {
    if (deckGroups && deckGroups.length > 0) return deckGroups;
    return groups.map((g) => {
      const topicAccent = getCategoryAccent(g.topic);
      return {
        id: `legacy-${g.topic}`,
        topic: g.topic,
        accentBarClass: topicAccent.barClass,
        accentTextClass: topicAccent.textClass,
        cards: g.posts.map((post, idx) => {
          const isLocked = checkPostLocked ? checkPostLocked(post) : false;
          const cardAccent = getCategoryAccent(post.category || g.topic);
          const readMins = estimateReadMinutes(post.content || post.summary);
          const embedMeta = post.embedUrl
            ? inferEmbedProvider(post.embedUrl)
            : null;
          return {
            id: `${post.slug}-${post.rowIndex ?? idx}`,
            accentBarClass: cardAccent.barClass,
            accentTextClass: cardAccent.textClass,
            categoryLabel: formatCategoryDisplay(post.category, g.topic),
            metaPrimary: post.academicYear,
            metaSecondary: isLocked ? '校內限定' : `${readMins} 分鐘閱讀`,
            title: post.title,
            summary: isLocked
              ? '此篇文章為社群／校內限定內容，已暫時隱藏完整內文與雲端附件，請登入 @hmes.tp.edu.tw 帳號解鎖觀看。'
              : post.summary ||
                '點擊「閱讀全文」檢視完整教案內容、數學探究脈絡與社群紀錄。',
            footerLeft: `${post.author} · ${post.publishedAt}`,
            actionLabel: isLocked ? '登入解鎖' : '閱讀全文',
            isLocked,
            lockedTitle: '校內限定 · @hmes.tp.edu.tw',
            lockedSubtitle: '需登入學校社群帳號方可解鎖閱讀',
            coverImageUrl: post.coverImageUrl,
            embedUrl: post.embedUrl,
            embedLabel: post.embedLabel || '檢視雲端教案與附件',
            embedProvider: embedMeta?.provider,
            onAction: () => onSelectPost?.(post),
          };
        }),
      };
    });
  }, [deckGroups, groups, checkPostLocked, onSelectPost]);

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

  const safeTopicIdx = Math.max(
    0,
    Math.min(resolvedGroups.length - 1, activeTopicIdx),
  );
  const currentGroup = resolvedGroups[safeTopicIdx];
  const currentCards: SwipeDeckCard[] = currentGroup?.cards || [];
  const safeCardIdx = Math.max(
    0,
    Math.min(currentCards.length - 1, activeCardIdx),
  );

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
      const clamped = Math.max(
        0,
        Math.min(resolvedGroups.length - 1, nextTopicIdx),
      );
      if (clamped === safeTopicIdx) return;
      const now = Date.now();
      lastTopicSwitchRef.current = now;
      setTopicTransitionDir(clamped > safeTopicIdx ? 'up' : 'down');
      setActiveTopicIdx(clamped);
      setActiveCardIdx(0);
      requestAnimationFrame(() => {
        scrollToCard(0, 'auto');
      });
    },
    [resolvedGroups.length, safeTopicIdx, scrollToCard],
  );

  useEffect(() => {
    if (!isOpen) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const clampedTopic = Math.max(
      0,
      Math.min(resolvedGroups.length - 1, initialTopicIndex),
    );
    const maxCard = Math.max(
      0,
      (resolvedGroups[clampedTopic]?.cards.length ?? 1) - 1,
    );
    const clampedCard = Math.max(0, Math.min(maxCard, initialCardIndex));

    setTopicTransitionDir(null);
    setActiveTopicIdx(clampedTopic);
    setActiveCardIdx(clampedCard);

    const raf = requestAnimationFrame(() => {
      scrollToCard(clampedCard, 'auto');
    });

    return () => {
      cancelAnimationFrame(raf);
      document.body.style.overflow = prevOverflow;
    };
  }, [isOpen, initialTopicIndex, initialCardIndex, resolvedGroups, scrollToCard]);

  // Keep active topic tab & top progress dot smoothly centered/visible
  useEffect(() => {
    if (!isOpen) return;
    const raf = requestAnimationFrame(() => {
      const strip = mobileStripRef.current;
      const mobileBtn = mobileTabRefs.current[safeTopicIdx];
      if (strip && mobileBtn) {
        const targetLeft =
          mobileBtn.offsetLeft -
          (strip.clientWidth - mobileBtn.offsetWidth) / 2;
        strip.scrollTo({
          left: Math.max(0, targetLeft),
          behavior: 'smooth',
        });
      }
      const dotStrip = dotStripRef.current;
      const dotBtn = dotItemRefs.current[safeTopicIdx];
      if (dotStrip && dotBtn) {
        const targetLeft =
          dotBtn.offsetLeft -
          (dotStrip.clientWidth - dotBtn.offsetWidth) / 2;
        dotStrip.scrollTo({
          left: Math.max(0, targetLeft),
          behavior: 'smooth',
        });
      }
      const desktopBtn = desktopTabRefs.current[safeTopicIdx];
      desktopBtn?.scrollIntoView({block: 'nearest', behavior: 'smooth'});
    });
    return () => cancelAnimationFrame(raf);
  }, [isOpen, safeTopicIdx]);

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

  if (!isOpen || resolvedGroups.length === 0 || !currentGroup) return null;

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

    if (Math.abs(dy) > 45 && Math.abs(dy) > Math.abs(dx) * 1.25) {
      if (dy < 0 && safeTopicIdx < resolvedGroups.length - 1) {
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
      if (e.deltaY > 0 && safeTopicIdx < resolvedGroups.length - 1) {
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

  const prevTopic = safeTopicIdx > 0 ? resolvedGroups[safeTopicIdx - 1] : null;
  const nextTopic =
    safeTopicIdx < resolvedGroups.length - 1
      ? resolvedGroups[safeTopicIdx + 1]
      : null;
  const hasMultipleTopics = resolvedGroups.length > 1;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={scopeLabel || '滑動快覽模式'}
      className="fixed inset-0 z-40 bg-[#EAE5DB] flex flex-col"
    >
      {/* Top Bar */}
      <header className="h-14 shrink-0 border-b border-stone-200 bg-white px-3.5 sm:px-6 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 sm:gap-3 min-w-0">
          <span
            className={`font-mono-tabular text-xs font-bold whitespace-nowrap shrink-0 ${currentGroup.accentTextClass}`}
          >
            {String(safeTopicIdx + 1).padStart(2, '0')} /{' '}
            {String(resolvedGroups.length).padStart(2, '0')}
          </span>
          <h2 className="font-editorial text-base sm:text-lg font-bold text-stone-950 truncate">
            {currentGroup.topic}
          </h2>
          <span className="text-xs font-mono-tabular text-stone-500 whitespace-nowrap shrink-0">
            · {safeCardIdx + 1}/{currentCards.length} 張
          </span>
          {scopeLabel && (
            <span className="hidden md:inline text-xs text-stone-500 whitespace-nowrap shrink-0">
              · {scopeLabel}
            </span>
          )}
        </div>

        <button
          type="button"
          onClick={onClose}
          className="min-h-[38px] px-3 py-1.5 text-xs font-medium text-stone-800 bg-[#F7F4EE] border border-stone-300/80 rounded-lg hover:bg-stone-200/70 inline-flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0"
        >
          <X className="w-4 h-4" />
          <span>回到頁面</span>
        </button>
      </header>

      {/* Top Dot-Style Group Progress Bar (indicates vertical group position) */}
      {hasMultipleTopics && (
        <div
          role="navigation"
          aria-label="分組進度圓點指示列"
          className="shrink-0 bg-[#FBF9F5] border-b border-stone-200 px-3.5 sm:px-6 py-1.5 flex items-center justify-center gap-3 min-w-0"
        >
          <span className="hidden sm:inline text-[11px] font-medium text-stone-500 whitespace-nowrap shrink-0">
            分組進度
          </span>
          <div
            ref={dotStripRef}
            className="flex items-center gap-2 overflow-x-auto no-scrollbar scroll-smooth py-0.5 px-1 max-w-full"
          >
            {resolvedGroups.map((g, idx) => {
              const isAct = idx === safeTopicIdx;
              const isPassed = idx < safeTopicIdx;
              return (
                <button
                  key={`${g.id}-dot`}
                  ref={(el) => {
                    dotItemRefs.current[idx] = el;
                  }}
                  type="button"
                  onClick={() => switchTopic(idx)}
                  aria-label={`跳至第 ${idx + 1} 組：${g.topic}`}
                  aria-current={isAct ? 'step' : undefined}
                  title={`${String(idx + 1).padStart(2, '0')} · ${g.topic}（${g.cards.length} 張）`}
                  className="p-1 -m-0.5 flex items-center justify-center shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1E3A8A] rounded-full group"
                >
                  <span
                    className={`block rounded-full transition-all duration-200 ${
                      isAct
                        ? `w-3 h-3 ${g.accentBarClass} ring-2 ring-offset-1 ring-[#1E3A8A]/30 shadow-2xs`
                        : isPassed
                          ? 'w-2 h-2 bg-stone-500 group-hover:bg-stone-700'
                          : 'w-2 h-2 bg-stone-300 group-hover:bg-stone-400'
                    }`}
                  />
                </button>
              );
            })}
          </div>
          <span
            className={`text-[11px] font-mono-tabular font-semibold whitespace-nowrap shrink-0 ${currentGroup.accentTextClass}`}
          >
            {safeTopicIdx + 1} / {resolvedGroups.length}
          </span>
        </div>
      )}

      {/* Mobile / Tablet Group Strip (when multiple groups exist) */}
      {hasMultipleTopics && (
        <div
          ref={mobileStripRef}
          className="lg:hidden shrink-0 bg-white border-b border-stone-200 px-3 py-2 flex items-center gap-1.5 overflow-x-auto no-scrollbar scroll-smooth"
        >
          {resolvedGroups.map((g, idx) => {
            const isAct = idx === safeTopicIdx;
            return (
              <button
                key={g.id}
                ref={(el) => {
                  mobileTabRefs.current[idx] = el;
                }}
                type="button"
                onClick={() => switchTopic(idx)}
                aria-current={isAct ? 'true' : undefined}
                className={`min-h-[36px] px-3 py-1.5 text-xs rounded-lg transition-all whitespace-nowrap shrink-0 ${
                  isAct
                    ? `${g.accentBarClass} text-white font-semibold shadow-sm ring-2 ring-offset-1 ring-[#1E3A8A]/25`
                    : 'bg-[#F7F4EE] text-stone-700 hover:bg-stone-200/70 font-medium'
                }`}
              >
                {g.topic} ({g.cards.length})
              </button>
            );
          })}
        </div>
      )}

      {/* Main 2-Pane Body */}
      <div className="flex-1 min-h-0 flex">
        {/* Desktop Left Group Rail */}
        <aside className="hidden lg:flex w-64 shrink-0 border-r border-stone-200 bg-white flex-col justify-between p-4">
          <div className="space-y-1 overflow-y-auto pr-1">
            <div className="px-3 pb-2 text-xs font-semibold text-stone-500">
              {scopeLabel || '架構分區瀏覽'}
            </div>
            {resolvedGroups.map((g, idx) => {
              const isActive = idx === safeTopicIdx;
              return (
                <button
                  key={g.id}
                  ref={(el) => {
                    desktopTabRefs.current[idx] = el;
                  }}
                  type="button"
                  onClick={() => switchTopic(idx)}
                  className={`w-full text-left px-3 py-2.5 rounded-lg text-sm transition-colors flex items-center justify-between gap-2 ${
                    isActive
                      ? `bg-[#F7F4EE] ${g.accentTextClass} font-bold`
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
                    {g.cards.length}
                  </span>
                </button>
              );
            })}
          </div>

          <div className="pt-4 border-t border-stone-100 text-xs text-stone-500 space-y-1 px-2">
            <div>← → 左右拖曳或滑動卡片</div>
            {hasMultipleTopics && <div>↑ ↓ 上下滾動或點擊切換分區</div>}
          </div>
        </aside>

        {/* Interactive 2D Card Stage */}
        <div
          onTouchStart={handleTouchStart}
          onTouchEnd={handleTouchEnd}
          onWheel={handleWheel}
          className="flex-1 min-w-0 flex flex-col justify-between relative overflow-hidden"
        >
          <div
            key={currentGroup.id}
            className={`flex-1 min-h-0 flex flex-col justify-between ${
              topicTransitionDir === 'up'
                ? 'animate-topic-slide-up'
                : topicTransitionDir === 'down'
                  ? 'animate-topic-slide-down'
                  : ''
            }`}
          >
            {/* Story-Style Progress Bars + Compact Card Controls */}
            <div className="max-w-2xl w-full mx-auto px-4 sm:px-5 pt-3 pb-1 shrink-0 space-y-1.5">
              <div className="flex items-center gap-1.5">
                {currentCards.map((c, idx) => (
                  <button
                    key={`${c.id}-bar-${idx}`}
                    type="button"
                    onClick={() => scrollToCard(idx)}
                    aria-label={`跳至第 ${idx + 1} 張：${c.title}`}
                    className="flex-1 py-1.5 focus-visible:outline-none group"
                  >
                    <span
                      className={`block h-1.5 w-full rounded-full transition-all ${
                        idx === safeCardIdx
                          ? `${currentGroup.accentBarClass} scale-y-125`
                          : idx < safeCardIdx
                            ? 'bg-stone-500/60'
                            : 'bg-stone-400/40 group-hover:bg-stone-400'
                      }`}
                    />
                  </button>
                ))}
              </div>

              {currentCards.length > 1 && (
                <div className="flex items-center justify-between text-[11px] text-stone-600">
                  <span className="font-medium truncate">
                    左右滑動切換卡片（共 {currentCards.length} 張）
                  </span>
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      type="button"
                      onClick={() => scrollToCard(safeCardIdx - 1)}
                      disabled={safeCardIdx <= 0}
                      aria-label="上一張卡片"
                      className="w-7 h-7 rounded-md bg-white/85 border border-stone-300/80 text-stone-800 flex items-center justify-center disabled:opacity-35 hover:bg-white transition-colors"
                    >
                      <ChevronLeft className="w-3.5 h-3.5" />
                    </button>
                    <span className="font-mono-tabular px-1.5 font-semibold text-stone-800">
                      {safeCardIdx + 1}/{currentCards.length}
                    </span>
                    <button
                      type="button"
                      onClick={() => scrollToCard(safeCardIdx + 1)}
                      disabled={safeCardIdx >= currentCards.length - 1}
                      aria-label="下一張卡片"
                      className="w-7 h-7 rounded-md bg-white/85 border border-stone-300/80 text-stone-800 flex items-center justify-center disabled:opacity-35 hover:bg-white transition-colors"
                    >
                      <ChevronRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              )}
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
                className={`w-full h-full flex items-center gap-3.5 sm:gap-6 overflow-x-auto no-scrollbar px-[9vw] sm:px-[14%] lg:px-[16%] py-2 select-none ${
                  isDragging
                    ? 'cursor-grabbing'
                    : 'snap-x snap-mandatory scroll-smooth cursor-grab'
                }`}
              >
                {currentCards.map((card, idx) => {
                  const isActive = idx === safeCardIdx;
                  const normalizedCover = normalizeDriveImageUrl(
                    card.coverImageUrl,
                  );
                  const hasCover = Boolean(
                    !card.isLocked &&
                      normalizedCover &&
                      !failedImages[card.id],
                  );
                  const embedMeta = card.embedUrl
                    ? inferEmbedProvider(card.embedUrl)
                    : null;
                  const providerLabel =
                    card.embedProvider || embedMeta?.provider;

                  return (
                    <div
                      key={`${card.id}-card-${idx}`}
                      onClick={() => {
                        if (!isActive) {
                          scrollToCard(idx);
                        }
                      }}
                      className={`w-[82vw] sm:w-[72%] md:w-[68%] max-w-2xl h-full max-h-[600px] snap-center shrink-0 flex items-center transition-all duration-200 ${
                        isActive
                          ? 'opacity-100 scale-100'
                          : 'opacity-60 scale-[0.92] hover:opacity-85 cursor-pointer'
                      }`}
                    >
                      <article className="w-full h-full bg-white border border-stone-300 rounded-2xl overflow-hidden shadow-lg flex flex-col">
                        {/* Top Category / Channel Accent Bar */}
                        <div
                          className={`h-1.5 w-full shrink-0 ${card.accentBarClass}`}
                        />

                        {/* Lock Banner OR Cover Image OR Cloud Attachment Banner */}
                        {card.isLocked ? (
                          <button
                            type="button"
                            onClick={() => {
                              if (isActive) card.onAction();
                            }}
                            className="w-full bg-[#F7F4EE] border-b border-stone-200 px-6 py-4 flex items-center gap-3.5 text-left shrink-0 hover:bg-[#EFEAE0] transition-colors"
                          >
                            <div className="w-10 h-10 rounded-lg bg-white border border-stone-200 flex items-center justify-center shrink-0">
                              <Lock className="w-4 h-4 text-[#1E3A8A]" />
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="text-[11px] font-mono-tabular uppercase tracking-wider text-stone-500">
                                {card.lockedTitle || '校內限定 · @hmes.tp.edu.tw'}
                              </div>
                              <div className="text-sm font-semibold text-stone-900 truncate mt-0.5">
                                {card.lockedSubtitle ||
                                  '需登入學校社群帳號方可解鎖閱讀'}
                              </div>
                            </div>
                          </button>
                        ) : hasCover ? (
                          <button
                            type="button"
                            onClick={() => {
                              if (isActive) card.onAction();
                            }}
                            className="h-[36%] min-h-[160px] max-h-[250px] w-full bg-stone-100 border-b border-stone-200 overflow-hidden text-left shrink-0 group focus-visible:outline-none"
                          >
                            <img
                              src={normalizedCover}
                              alt={card.title}
                              draggable={false}
                              referrerPolicy="no-referrer"
                              onError={() =>
                                setFailedImages((prev) => ({
                                  ...prev,
                                  [card.id]: true,
                                }))
                              }
                              className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-[1.02]"
                            />
                          </button>
                        ) : card.embedUrl && providerLabel ? (
                          <button
                            type="button"
                            onClick={() => {
                              if (isActive) card.onAction();
                            }}
                            className="w-full bg-[#F7F4EE] border-b border-stone-200 px-6 py-4 flex items-center gap-3.5 text-left shrink-0 hover:bg-[#EFEAE0] transition-colors"
                          >
                            <div className="w-10 h-10 rounded-lg bg-white border border-stone-200 flex items-center justify-center shrink-0">
                              {renderEmbedIcon(providerLabel)}
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="text-[11px] font-mono-tabular uppercase tracking-wider text-stone-500">
                                {providerLabel}
                              </div>
                              <div className="text-sm font-semibold text-stone-900 truncate mt-0.5">
                                {card.embedLabel || '檢視雲端教案與附件'}
                              </div>
                            </div>
                            <ExternalLink className="w-4 h-4 text-stone-400 shrink-0" />
                          </button>
                        ) : null}

                        <div className="p-6 sm:p-7 flex-1 min-h-0 flex flex-col justify-between gap-4 overflow-y-auto">
                          <div className="space-y-3">
                            <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1 pb-2.5 border-b border-stone-100 text-xs">
                              <span
                                className={`font-bold tracking-wide truncate min-w-0 ${card.accentTextClass}`}
                              >
                                {card.categoryLabel}
                              </span>
                              <div className="flex items-center gap-1.5 text-stone-500 font-mono-tabular whitespace-nowrap shrink-0">
                                {card.metaPrimary && (
                                  <span>{card.metaPrimary}</span>
                                )}
                                {card.metaPrimary && card.metaSecondary && (
                                  <span aria-hidden="true">·</span>
                                )}
                                {card.metaSecondary && (
                                  <span className="font-sans">
                                    {card.metaSecondary}
                                  </span>
                                )}
                                {(card.metaPrimary || card.metaSecondary) && (
                                  <span aria-hidden="true">·</span>
                                )}
                                <span>
                                  {idx + 1} / {currentCards.length}
                                </span>
                              </div>
                            </div>

                            <h3 className="font-editorial text-xl sm:text-2xl font-bold text-stone-950 leading-snug text-balance">
                              <button
                                type="button"
                                onClick={() => {
                                  if (isActive) card.onAction();
                                }}
                                className="text-left hover:text-[#1E3A8A] transition-colors"
                              >
                                {card.title}
                              </button>
                            </h3>

                            <p
                              className={`text-sm sm:text-base text-stone-700 leading-[1.7] whitespace-pre-line ${
                                hasCover ? 'line-clamp-4' : 'line-clamp-6'
                              }`}
                            >
                              {card.summary}
                            </p>
                          </div>

                          <div className="pt-4 border-t border-stone-200/80 flex flex-wrap items-center justify-between gap-3 shrink-0">
                            <div className="text-xs text-stone-500 truncate max-w-[60%]">
                              <span className="font-medium text-stone-700">
                                {card.footerLeft}
                              </span>
                            </div>

                            <div className="flex items-center gap-2">
                              {!card.isLocked &&
                                card.embedUrl &&
                                /^https?:\/\//i.test(card.embedUrl) &&
                                isActive && (
                                  <a
                                    href={card.embedUrl}
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
                                    card.onAction();
                                  } else {
                                    scrollToCard(idx);
                                  }
                                }}
                                className="min-h-[40px] px-4 py-2 text-xs font-semibold text-white bg-[#1E3A8A] rounded-lg hover:bg-[#172554] inline-flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0"
                              >
                                {card.isLocked && isActive && (
                                  <Lock className="w-3.5 h-3.5" />
                                )}
                                <span>
                                  {isActive ? card.actionLabel : '看這張'}
                                </span>
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
                  aria-label="上一張卡片"
                  className="hidden sm:flex absolute left-4 top-1/2 -translate-y-1/2 min-h-[44px] min-w-[44px] items-center justify-center rounded-full bg-white border border-stone-300 text-stone-900 shadow-md hover:bg-stone-50 transition-all"
                >
                  <ChevronLeft className="w-5 h-5" />
                </button>
              )}
              {safeCardIdx < currentCards.length - 1 && (
                <button
                  type="button"
                  onClick={() => scrollToCard(safeCardIdx + 1)}
                  aria-label="下一張卡片"
                  className="hidden sm:flex absolute right-4 top-1/2 -translate-y-1/2 min-h-[44px] min-w-[44px] items-center justify-center rounded-full bg-white border border-stone-300 text-stone-900 shadow-md hover:bg-stone-50 transition-all"
                >
                  <ChevronRight className="w-5 h-5" />
                </button>
              )}
            </div>
          </div>

          {/* Bottom Topic / Architecture Switcher Dock */}
          <div className="shrink-0 border-t border-stone-200 bg-white px-3 sm:px-6 py-2.5 flex items-center justify-between gap-2 sm:gap-3 min-w-0">
            {prevTopic ? (
              <button
                type="button"
                onClick={() => switchTopic(safeTopicIdx - 1)}
                className="min-h-[40px] max-w-[48%] min-w-0 px-2.5 sm:px-3 py-1.5 text-xs font-medium text-stone-700 bg-[#F7F4EE] border border-stone-300/80 rounded-lg hover:bg-stone-200/70 inline-flex items-center gap-1.5"
              >
                <ArrowUp className="w-3.5 h-3.5 shrink-0" />
                <span className="truncate">上個分區：{prevTopic.topic}</span>
              </button>
            ) : (
              <span className="text-xs text-stone-400 truncate">
                {hasMultipleTopics ? '已是第一個分區' : currentGroup.topic}
              </span>
            )}

            <span className="hidden md:inline text-xs text-stone-500 font-mono-tabular shrink-0">
              {currentGroup.topic} · 第 {safeCardIdx + 1} / {currentCards.length}{' '}
              張
            </span>

            {nextTopic ? (
              <button
                type="button"
                onClick={() => switchTopic(safeTopicIdx + 1)}
                className="min-h-[40px] max-w-[48%] min-w-0 px-2.5 sm:px-3.5 py-1.5 text-xs font-semibold text-[#1E3A8A] bg-[#F7F4EE] border border-stone-300/80 rounded-lg hover:bg-[#1E3A8A] hover:text-white inline-flex items-center gap-1.5 transition-colors"
              >
                <span className="truncate">
                  下個分區：{nextTopic.topic}（{nextTopic.cards.length} 張）
                </span>
                <ArrowDown className="w-3.5 h-3.5 shrink-0" />
              </button>
            ) : (
              <span className="text-xs text-stone-400 truncate">
                {hasMultipleTopics ? '已是最後一個分區' : '左右滑動即可瀏覽'}
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
