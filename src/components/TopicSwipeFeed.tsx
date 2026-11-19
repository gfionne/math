import React, {useCallback, useRef, useState} from 'react';
import {
  ChevronLeft,
  ChevronRight,
  GalleryHorizontalEnd,
} from 'lucide-react';
import {JournalPost} from '../types/journal';
import {getCategoryAccent, TopicGroup} from '../utils/postFormatting';
import {ArticleCard} from './ArticleCard';

interface TopicSwipeFeedProps {
  groups: TopicGroup[];
  onSelectPost: (post: JournalPost) => void;
  onOpenImmersive: (topicIndex: number, cardIndex: number) => void;
  isFilteredToSingleCategory: boolean;
  onResetCategoryFilter: () => void;
}

interface TopicCarouselRowProps {
  group: TopicGroup;
  topicIndex: number;
  onSelectPost: (post: JournalPost) => void;
  onOpenImmersive: (topicIndex: number, cardIndex: number) => void;
}

const TopicCarouselRow: React.FC<TopicCarouselRowProps> = ({
  group,
  topicIndex,
  onSelectPost,
  onOpenImmersive,
}) => {
  const railRef = useRef<HTMLDivElement | null>(null);
  const [activeCardIdx, setActiveCardIdx] = useState(0);
  const [isDragging, setIsDragging] = useState(false);

  const dragStateRef = useRef<{
    isDown: boolean;
    startX: number;
    startScrollLeft: number;
    hasDragged: boolean;
  }>({isDown: false, startX: 0, startScrollLeft: 0, hasDragged: false});

  const handleScroll = useCallback(() => {
    const rail = railRef.current;
    if (!rail) return;
    const cards = Array.from(rail.children) as HTMLElement[];
    if (cards.length === 0) return;

    const railLeft = rail.scrollLeft;
    let closestIdx = 0;
    let minDiff = Infinity;
    for (let i = 0; i < cards.length; i++) {
      const diff = Math.abs(cards[i].offsetLeft - railLeft);
      if (diff < minDiff) {
        minDiff = diff;
        closestIdx = i;
      }
    }
    setActiveCardIdx(closestIdx);
  }, []);

  const scrollToCard = useCallback((index: number) => {
    const rail = railRef.current;
    if (!rail) return;
    const cards = Array.from(rail.children) as HTMLElement[];
    const clamped = Math.max(0, Math.min(cards.length - 1, index));
    const target = cards[clamped];
    if (!target) return;
    rail.scrollTo({
      left: target.offsetLeft,
      behavior: 'smooth',
    });
    setActiveCardIdx(clamped);
  }, []);

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.pointerType !== 'mouse' || e.button !== 0) return;
    const rail = railRef.current;
    if (!rail) return;
    dragStateRef.current = {
      isDown: true,
      startX: e.clientX,
      startScrollLeft: rail.scrollLeft,
      hasDragged: false,
    };
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const st = dragStateRef.current;
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
    const st = dragStateRef.current;
    if (!st.isDown) return;
    st.isDown = false;
    const didDrag = st.hasDragged;
    setIsDragging(false);

    if (didDrag && railRef.current) {
      const rail = railRef.current;
      const cards = Array.from(rail.children) as HTMLElement[];
      let closestIdx = 0;
      let minDiff = Infinity;
      for (let i = 0; i < cards.length; i++) {
        const diff = Math.abs(cards[i].offsetLeft - rail.scrollLeft);
        if (diff < minDiff) {
          minDiff = diff;
          closestIdx = i;
        }
      }
      const target = cards[closestIdx];
      if (target) {
        rail.scrollTo({left: target.offsetLeft, behavior: 'smooth'});
      }
      setTimeout(() => {
        dragStateRef.current.hasDragged = false;
      }, 0);
    } else {
      st.hasDragged = false;
    }
  };

  const handleClickCapture = (e: React.MouseEvent) => {
    if (dragStateRef.current.hasDragged) {
      e.preventDefault();
      e.stopPropagation();
    }
  };

  const sectionNumber = String(topicIndex + 1).padStart(2, '0');
  const accent = getCategoryAccent(group.topic);
  const canGoPrev = activeCardIdx > 0;
  const canGoNext = activeCardIdx < group.posts.length - 1;

  return (
    <section
      id={`swipe-topic-${topicIndex}`}
      className="scroll-mt-24 border-t-2 border-stone-900 pt-5 space-y-4"
    >
      {/* Clear Editorial Topic Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 min-w-0">
          <span
            className={`font-mono-tabular text-sm font-bold ${accent.textClass}`}
          >
            {sectionNumber}
          </span>
          <h3 className="font-editorial text-xl sm:text-2xl font-bold text-stone-950 truncate">
            {group.topic}
          </h3>
          <span className="text-xs font-mono-tabular text-stone-500">
            共 {group.posts.length} 篇 · 目前第 {activeCardIdx + 1} 篇
          </span>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => onOpenImmersive(topicIndex, activeCardIdx)}
            className="min-h-[36px] px-3 py-1.5 text-xs font-semibold text-[#1E3A8A] bg-white border border-stone-300/80 rounded-lg hover:bg-[#F7F4EE] inline-flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0"
          >
            <GalleryHorizontalEnd className="w-3.5 h-3.5" />
            <span>大卡片快覽</span>
          </button>

          {group.posts.length > 1 && (
            <div className="hidden sm:flex items-center gap-1">
              <button
                type="button"
                onClick={() => scrollToCard(activeCardIdx - 1)}
                disabled={!canGoPrev}
                aria-label={`上一篇 ${group.topic}`}
                className="min-h-[36px] min-w-[36px] flex items-center justify-center rounded-lg border border-stone-300/80 bg-white text-stone-700 hover:bg-stone-50 disabled:opacity-35 disabled:cursor-not-allowed transition-colors"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => scrollToCard(activeCardIdx + 1)}
                disabled={!canGoNext}
                aria-label={`下一篇 ${group.topic}`}
                className="min-h-[36px] min-w-[36px] flex items-center justify-center rounded-lg border border-stone-300/80 bg-white text-stone-700 hover:bg-stone-50 disabled:opacity-35 disabled:cursor-not-allowed transition-colors"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Distinct Warm Limestone Tray Making White Cards Stand Out Clearly */}
      <div className="bg-[#EFECE4] border border-stone-200/90 rounded-2xl p-3.5 sm:p-5 relative">
        <div
          ref={railRef}
          onScroll={handleScroll}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUpOrCancel}
          onPointerCancel={handlePointerUpOrCancel}
          onClickCapture={handleClickCapture}
          className={`flex gap-4 sm:gap-5 overflow-x-auto no-scrollbar pb-1 select-none items-stretch ${
            isDragging
              ? 'cursor-grabbing'
              : 'snap-x snap-mandatory scroll-smooth cursor-grab'
          }`}
        >
          {group.posts.map((post, idx) => (
            <div
              key={`${post.slug}-${post.rowIndex ?? idx}`}
              className="w-[78vw] sm:w-[305px] lg:w-[325px] snap-start shrink-0 flex"
            >
              <div className="w-full flex flex-col">
                <ArticleCard post={post} onSelect={onSelectPost} />
              </div>
            </div>
          ))}
        </div>

        {canGoNext && (
          <button
            type="button"
            onClick={() => scrollToCard(activeCardIdx + 1)}
            aria-label="往左滑動下一篇"
            className="hidden md:flex absolute right-3 top-1/2 -translate-y-1/2 min-h-[42px] min-w-[42px] items-center justify-center rounded-full bg-white border border-stone-300 text-stone-900 shadow-md opacity-90 hover:opacity-100 hover:scale-105 transition-all"
          >
            <ChevronRight className="w-5 h-5" />
          </button>
        )}
        {canGoPrev && (
          <button
            type="button"
            onClick={() => scrollToCard(activeCardIdx - 1)}
            aria-label="往右滑動上一篇"
            className="hidden md:flex absolute left-3 top-1/2 -translate-y-1/2 min-h-[42px] min-w-[42px] items-center justify-center rounded-full bg-white border border-stone-300 text-stone-900 shadow-md opacity-90 hover:opacity-100 hover:scale-105 transition-all"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
        )}
      </div>

      {/* Clickable Progress Segments */}
      {group.posts.length > 1 && (
        <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar">
          {group.posts.map((post, idx) => (
            <button
              key={`${post.slug}-seg-${post.rowIndex ?? idx}`}
              type="button"
              onClick={() => scrollToCard(idx)}
              aria-label={`切換至第 ${idx + 1} 篇：${post.title}`}
              className="py-1 px-0.5 flex items-center focus-visible:outline-none"
            >
              <span
                className={`block h-1.5 rounded-full transition-all duration-200 ${
                  idx === activeCardIdx
                    ? `w-7 ${accent.barClass}`
                    : 'w-2.5 bg-stone-300 hover:bg-stone-400'
                }`}
              />
            </button>
          ))}
        </div>
      )}
    </section>
  );
};

export const TopicSwipeFeed: React.FC<TopicSwipeFeedProps> = ({
  groups,
  onSelectPost,
  onOpenImmersive,
  isFilteredToSingleCategory,
  onResetCategoryFilter,
}) => {
  return (
    <div className="space-y-10">
      {isFilteredToSingleCategory && (
        <div className="flex items-center justify-between gap-3 px-4 py-2.5 bg-white border border-stone-200 rounded-lg text-xs text-stone-700">
          <span>目前僅顯示單一專欄主題，切換回全部主題即可上下瀏覽所有分類。</span>
          <button
            type="button"
            onClick={onResetCategoryFilter}
            className="font-semibold text-[#1E3A8A] hover:underline whitespace-nowrap shrink-0"
          >
            查看全部主題
          </button>
        </div>
      )}

      <div className="space-y-12">
        {groups.map((group, idx) => (
          <TopicCarouselRow
            key={group.topic}
            group={group}
            topicIndex={idx}
            onSelectPost={onSelectPost}
            onOpenImmersive={onOpenImmersive}
          />
        ))}
      </div>
    </div>
  );
};
