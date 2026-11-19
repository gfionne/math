import React, {useCallback, useRef, useState} from 'react';
import {
  ChevronLeft,
  ChevronRight,
  Layers,
  Maximize2,
  MoveHorizontal,
  MoveVertical,
} from 'lucide-react';
import {JournalPost} from '../types/journal';
import {TopicGroup} from '../utils/postFormatting';
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

  const sectionNumber = String(topicIndex + 1).padStart(2, '0');

  return (
    <section
      id={`swipe-topic-${topicIndex}`}
      className="scroll-mt-24 space-y-4 pt-2"
    >
      {/* Topic Header Row */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-stone-200 pb-3">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 min-w-0">
          <span className="font-mono-tabular text-xs font-semibold text-[#1E3A8A]">
            {sectionNumber}
          </span>
          <h3 className="font-editorial text-xl sm:text-2xl font-semibold text-stone-950 truncate">
            {group.topic}
          </h3>
          <span className="text-xs font-mono-tabular text-stone-500">
            共 {group.posts.length} 篇 · 第 {activeCardIdx + 1} /{' '}
            {group.posts.length} 篇
          </span>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => onOpenImmersive(topicIndex, activeCardIdx)}
            className="min-h-[40px] px-3 py-1.5 text-xs font-medium text-[#1E3A8A] bg-white border border-stone-200 rounded-lg hover:bg-[#F7F4EE] inline-flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0"
          >
            <Maximize2 className="w-3.5 h-3.5" />
            <span>全螢幕滑動</span>
          </button>

          {group.posts.length > 1 && (
            <div className="hidden sm:flex items-center gap-1">
              <button
                type="button"
                onClick={() => scrollToCard(activeCardIdx - 1)}
                disabled={activeCardIdx <= 0}
                aria-label={`上一篇 ${group.topic}`}
                className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-lg border border-stone-200 bg-white text-stone-700 hover:bg-stone-50 disabled:opacity-35 disabled:cursor-not-allowed transition-colors"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => scrollToCard(activeCardIdx + 1)}
                disabled={activeCardIdx >= group.posts.length - 1}
                aria-label={`下一篇 ${group.topic}`}
                className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-lg border border-stone-200 bg-white text-stone-700 hover:bg-stone-50 disabled:opacity-35 disabled:cursor-not-allowed transition-colors"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Horizontal Snap Card Rail (Same Topic: Swipe Left) */}
      <div
        ref={railRef}
        onScroll={handleScroll}
        className="flex gap-5 overflow-x-auto snap-x snap-mandatory scroll-smooth no-scrollbar pb-2 -mx-2 px-2"
      >
        {group.posts.map((post) => (
          <div
            key={post.slug}
            className="w-[84vw] sm:w-[350px] lg:w-[370px] snap-start shrink-0 flex"
          >
            <div className="w-full flex flex-col">
              <ArticleCard post={post} onSelect={onSelectPost} />
            </div>
          </div>
        ))}
      </div>

      {/* Card Progress Indicators */}
      {group.posts.length > 1 && (
        <div className="flex items-center justify-between gap-4 pt-1">
          <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar">
            {group.posts.map((post, idx) => (
              <button
                key={post.slug}
                type="button"
                onClick={() => scrollToCard(idx)}
                aria-label={`切換至第 ${idx + 1} 篇：${post.title}`}
                className="py-2 px-0.5 flex items-center focus-visible:outline-none"
              >
                <span
                  className={`block h-1.5 rounded-full transition-all duration-200 ${
                    idx === activeCardIdx
                      ? 'w-7 bg-[#1E3A8A]'
                      : 'w-2 bg-stone-300 hover:bg-stone-400'
                  }`}
                />
              </button>
            ))}
          </div>
          <span className="text-xs text-stone-500 whitespace-nowrap shrink-0">
            向左滑動切換同主題文章 →
          </span>
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
  const jumpToTopic = (topicIndex: number) => {
    const el = document.getElementById(`swipe-topic-${topicIndex}`);
    if (el) {
      el.scrollIntoView({behavior: 'smooth', block: 'start'});
    }
  };

  return (
    <div className="space-y-8">
      {/* Swipe Guide & Quick Topic Jump Bar */}
      <div className="bg-white border border-stone-200 rounded-xl p-4 sm:p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="space-y-1.5">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs font-medium text-stone-700">
            <span className="inline-flex items-center gap-1.5 text-[#1E3A8A] font-semibold">
              <MoveHorizontal className="w-4 h-4" />
              <span>同一主題：向左滑動卡片</span>
            </span>
            <span className="text-stone-300" aria-hidden="true">
              |
            </span>
            <span className="inline-flex items-center gap-1.5 text-stone-700">
              <MoveVertical className="w-4 h-4 text-stone-500" />
              <span>不同主題：向下滑動切換（共 {groups.length} 個主題）</span>
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-1.5 pt-1">
            {groups.map((g, idx) => (
              <button
                key={g.topic}
                type="button"
                onClick={() => jumpToTopic(idx)}
                className="min-h-[36px] px-2.5 py-1 text-xs font-medium text-stone-700 bg-[#F7F4EE] hover:bg-stone-200/70 rounded-md transition-colors whitespace-nowrap shrink-0"
              >
                {String(idx + 1).padStart(2, '0')} · {g.topic} ({g.posts.length})
              </button>
            ))}
            {isFilteredToSingleCategory && (
              <button
                type="button"
                onClick={onResetCategoryFilter}
                className="min-h-[36px] px-2.5 py-1 text-xs font-medium text-[#1E3A8A] hover:underline whitespace-nowrap shrink-0"
              >
                顯示全部主題以向下切換
              </button>
            )}
          </div>
        </div>

        <button
          type="button"
          onClick={() => onOpenImmersive(0, 0)}
          className="min-h-[44px] px-4 py-2 text-xs font-medium text-white bg-[#1E3A8A] rounded-lg hover:bg-[#172554] inline-flex items-center justify-center gap-2 transition-colors whitespace-nowrap shrink-0"
        >
          <Layers className="w-4 h-4" />
          <span>進入全螢幕卡片滑動模式</span>
        </button>
      </div>

      {/* Vertical Stack of Topic Carousels (Different Topics: Scroll Down) */}
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
