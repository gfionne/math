import React, {useCallback, useEffect, useRef, useState} from 'react';
import {
  ArrowDown,
  ArrowRight,
  ChevronLeft,
  ChevronRight,
  Compass,
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
  checkPostLocked?: (post: JournalPost) => boolean;
}

interface TopicCarouselRowProps {
  group: TopicGroup;
  nextGroup?: TopicGroup;
  topicIndex: number;
  totalSteps: number;
  onSelectPost: (post: JournalPost) => void;
  onOpenImmersive: (topicIndex: number, cardIndex: number) => void;
  onJumpToStep: (targetIdx: number) => void;
  checkPostLocked?: (post: JournalPost) => boolean;
}

function getTeachingStageGuide(
  topic: string,
  index: number,
  total: number,
): string {
  if (/社群計畫|計畫/.test(topic)) {
    return '先掌握年度教學願景與社群共備主軸';
  }
  if (/夥伴教師|共備/.test(topic)) {
    return '參考夥伴教師協作分工與觀議課實務';
  }
  if (/會議紀錄|領域會議/.test(topic)) {
    return '了解領域會議共識、備課脈絡與教學調整';
  }
  if (/學力檢測|評量/.test(topic)) {
    return '檢視評量重點、學生迷思診斷與教學回饋';
  }
  if (/STEAM|跨域|趣味數學/.test(topic)) {
    return '探索情境導入、動手實作與數位工具整合';
  }
  if (/教學資源|教案/.test(topic)) {
    return '取用課堂教材、學習單與實際教學流程';
  }
  if (/成果報告|發表/.test(topic)) {
    return '回顧教學實踐歷程、學生表現與成果彙整';
  }
  if (index === 0) return '從本主題啟程，建立整體教學與社群脈絡';
  if (index === total - 1 && total > 1) return '整合學習成果與回顧教學實踐';
  return '延續前一步驟，循序深化課堂教學應用';
}

const TopicCarouselRow: React.FC<TopicCarouselRowProps> = ({
  group,
  nextGroup,
  topicIndex,
  totalSteps,
  onSelectPost,
  onOpenImmersive,
  onJumpToStep,
  checkPostLocked,
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
  const isLastStep = topicIndex === totalSteps - 1;
  const stageGuide = getTeachingStageGuide(
    group.topic,
    topicIndex,
    totalSteps,
  );

  return (
    <section
      id={`swipe-topic-${topicIndex}`}
      className="scroll-mt-36 sm:scroll-mt-40 flex items-stretch gap-3 sm:gap-5 min-w-0 max-w-full"
    >
      {/* Left Vertical Flowchart Spine (Tablet/Desktop sm+) */}
      <div
        className="hidden sm:flex flex-col items-center w-11 shrink-0 pt-1"
        aria-hidden="true"
      >
        <div
          className={`w-11 h-11 rounded-xl ${accent.barClass} text-white font-mono-tabular text-sm font-bold flex items-center justify-center shadow-xs shrink-0`}
        >
          {sectionNumber}
        </div>
        {!isLastStep && (
          <div className="flex-1 flex flex-col items-center py-2 min-h-[36px]">
            <div className="w-0.5 flex-1 bg-[repeating-linear-gradient(to_bottom,#d6d3d1_0,#d6d3d1_5px,transparent_5px,transparent_10px)]" />
            <ArrowDown className="w-4 h-4 text-stone-400 -mt-0.5 shrink-0" />
          </div>
        )}
      </div>

      {/* Main Flowchart Step Card Container */}
      <div className="flex-1 min-w-0 max-w-full pb-2 sm:pb-6">
        <div className="bg-white border border-stone-200/95 rounded-2xl p-4 sm:p-6 shadow-[0_2px_10px_rgba(28,25,23,0.03)] space-y-4 min-w-0">
          {/* Step Node Header */}
          <div className="flex flex-wrap items-start justify-between gap-3 min-w-0">
            <div className="flex items-start gap-3 min-w-0 flex-1">
              {/* Mobile Inline Step Node */}
              <div
                className={`sm:hidden w-9 h-9 rounded-lg ${accent.barClass} text-white font-mono-tabular text-xs font-bold flex items-center justify-center shrink-0 mt-0.5`}
              >
                {sectionNumber}
              </div>

              <div className="space-y-1 min-w-0">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs font-mono-tabular text-stone-500">
                  <span className={`font-semibold ${accent.textClass}`}>
                    步驟 {sectionNumber} / 共{' '}
                    {String(totalSteps).padStart(2, '0')} 步
                  </span>
                  <span aria-hidden="true">·</span>
                  <span>{stageGuide}</span>
                </div>

                <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 min-w-0">
                  <h3 className="font-editorial text-xl sm:text-2xl font-bold text-stone-950 break-words">
                    {group.topic}
                  </h3>
                  <span className="text-xs font-mono-tabular text-stone-500">
                    共 {group.posts.length} 篇 ·{' '}
                    <strong className={`${accent.textClass} font-bold`}>
                      目前第 {activeCardIdx + 1}/{group.posts.length} 篇
                    </strong>
                  </span>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={() => onOpenImmersive(topicIndex, activeCardIdx)}
                className="min-h-[38px] px-3 py-1.5 text-xs font-semibold text-[#1E3A8A] bg-white border border-stone-300/80 rounded-lg hover:bg-[#1E3A8A] hover:text-white hover:border-[#1E3A8A] hover:shadow-xs active:scale-[0.97] inline-flex items-center gap-1.5 transition-all whitespace-nowrap shrink-0"
              >
                <GalleryHorizontalEnd className="w-3.5 h-3.5" />
                <span>大卡片快覽</span>
              </button>

              {group.posts.length > 1 && (
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => scrollToCard(activeCardIdx - 1)}
                    disabled={!canGoPrev}
                    aria-label={`上一篇 ${group.topic}`}
                    className="min-h-[38px] min-w-[38px] flex items-center justify-center rounded-lg border border-stone-300/80 bg-white text-stone-700 hover:bg-[#F7F4EE] hover:border-[#1E3A8A]/50 hover:text-[#1E3A8A] active:scale-[0.96] disabled:opacity-35 disabled:cursor-not-allowed transition-all"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => scrollToCard(activeCardIdx + 1)}
                    disabled={!canGoNext}
                    aria-label={`下一篇 ${group.topic}`}
                    className="min-h-[38px] min-w-[38px] flex items-center justify-center rounded-lg border border-stone-300/80 bg-white text-stone-700 hover:bg-[#F7F4EE] hover:border-[#1E3A8A]/50 hover:text-[#1E3A8A] active:scale-[0.96] disabled:opacity-35 disabled:cursor-not-allowed transition-all"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Horizontal Sequence Flow Tray Inside This Step */}
          <div className="bg-[#EFECE4] border border-stone-200/90 rounded-xl p-3 sm:p-4 relative min-w-0 max-w-full overflow-hidden">
            <div
              ref={railRef}
              onScroll={handleScroll}
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUpOrCancel}
              onPointerCancel={handlePointerUpOrCancel}
              onClickCapture={handleClickCapture}
              className={`flex gap-3 sm:gap-4 overflow-x-auto no-scrollbar pb-1 pt-0.5 select-none items-stretch ${
                isDragging
                  ? 'cursor-grabbing'
                  : 'snap-x snap-mandatory scroll-smooth cursor-grab'
              }`}
            >
              {group.posts.map((post, idx) => {
                const subStepCode = `${sectionNumber}-${idx + 1}`;
                const hasNextCard = idx < group.posts.length - 1;
                const isFocusCard = idx === activeCardIdx;
                return (
                  <div
                    key={`${post.slug}-${post.rowIndex ?? idx}`}
                    className={`w-[78vw] sm:w-[305px] lg:w-[325px] snap-start shrink-0 flex flex-col gap-2 transition-all duration-300 ease-out ${
                      group.posts.length > 1
                        ? isFocusCard
                          ? 'scale-100 opacity-100'
                          : 'scale-[0.96] opacity-80'
                        : ''
                    }`}
                  >
                    {/* Sub-step Sequence Indicator Above Card */}
                    <div className="flex items-center gap-2 px-1 text-[11px] font-mono-tabular text-stone-500">
                      <span className={`font-bold ${accent.textClass}`}>
                        {subStepCode}
                      </span>
                      <span className="h-px flex-1 border-t border-dashed border-stone-300" />
                      {hasNextCard ? (
                        <ArrowRight
                          className="w-3.5 h-3.5 text-stone-400 shrink-0"
                          aria-hidden="true"
                        />
                      ) : (
                        <span className="text-stone-400 whitespace-nowrap">
                          本節末篇
                        </span>
                      )}
                    </div>

                    <div className="w-full flex-1 flex flex-col">
                      <ArticleCard
                        post={post}
                        onSelect={onSelectPost}
                        isLocked={checkPostLocked ? checkPostLocked(post) : false}
                      />
                    </div>
                  </div>
                );
              })}
            </div>

            {canGoPrev && (
              <div
                aria-hidden="true"
                className="pointer-events-none absolute inset-y-0 left-0 w-7 bg-gradient-to-r from-[#EFECE4]/90 to-transparent"
              />
            )}
            {canGoNext && (
              <div
                aria-hidden="true"
                className="pointer-events-none absolute inset-y-0 right-0 w-9 bg-gradient-to-l from-[#EFECE4]/90 to-transparent"
              />
            )}

            {canGoNext && (
              <button
                type="button"
                onClick={() => scrollToCard(activeCardIdx + 1)}
                aria-label="往左滑動下一篇"
                className="hidden md:flex absolute right-3 top-1/2 -translate-y-1/2 min-h-[42px] min-w-[42px] items-center justify-center rounded-full bg-white border border-stone-300 text-stone-900 shadow-md opacity-95 hover:opacity-100 hover:border-[#1E3A8A] hover:text-[#1E3A8A] hover:scale-110 active:scale-95 transition-all"
              >
                <ChevronRight className="w-5 h-5" />
              </button>
            )}
            {canGoPrev && (
              <button
                type="button"
                onClick={() => scrollToCard(activeCardIdx - 1)}
                aria-label="往右滑動上一篇"
                className="hidden md:flex absolute left-3 top-1/2 -translate-y-1/2 min-h-[42px] min-w-[42px] items-center justify-center rounded-full bg-white border border-stone-300 text-stone-900 shadow-md opacity-95 hover:opacity-100 hover:border-[#1E3A8A] hover:text-[#1E3A8A] hover:scale-110 active:scale-95 transition-all"
              >
                <ChevronLeft className="w-5 h-5" />
              </button>
            )}
          </div>

          {/* Interactive Step-by-Step Card Sequence Bar */}
          {group.posts.length > 1 && (
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div className="flex items-center gap-1 overflow-x-auto no-scrollbar py-0.5">
                {group.posts.map((post, idx) => {
                  const isActiveCard = idx === activeCardIdx;
                  return (
                    <React.Fragment key={`${post.slug}-seg-${post.rowIndex ?? idx}`}>
                      <button
                        type="button"
                        onClick={() => scrollToCard(idx)}
                        aria-label={`切換至第 ${idx + 1} 篇：${post.title}`}
                        className={`min-w-[28px] h-7 px-2 rounded-md font-mono-tabular text-[11px] font-semibold transition-all shrink-0 ${
                          isActiveCard
                            ? `${accent.barClass} text-white shadow-2xs`
                            : 'bg-[#F7F4EE] text-stone-600 hover:text-stone-950 hover:bg-stone-200/70'
                        }`}
                      >
                        {idx + 1}
                      </button>
                      {idx < group.posts.length - 1 && (
                        <span
                          aria-hidden="true"
                          className="w-2.5 h-px bg-stone-300 shrink-0"
                        />
                      )}
                    </React.Fragment>
                  );
                })}
              </div>

              {nextGroup && (
                <button
                  type="button"
                  onClick={() => onJumpToStep(topicIndex + 1)}
                  className="text-xs font-medium text-stone-600 hover:text-[#1E3A8A] inline-flex items-center gap-1 transition-colors whitespace-nowrap shrink-0"
                >
                  <span>
                    下一步：{String(topicIndex + 2).padStart(2, '0')} ·{' '}
                    {nextGroup.topic}
                  </span>
                  <ArrowDown className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          )}

          {group.posts.length === 1 && nextGroup && (
            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => onJumpToStep(topicIndex + 1)}
                className="text-xs font-medium text-stone-600 hover:text-[#1E3A8A] inline-flex items-center gap-1 transition-colors whitespace-nowrap shrink-0"
              >
                <span>
                  下一步：{String(topicIndex + 2).padStart(2, '0')} ·{' '}
                  {nextGroup.topic}
                </span>
                <ArrowDown className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
        </div>

        {/* Mobile Flowchart Connector Arrow Between Steps */}
        {!isLastStep && (
          <div
            className="sm:hidden flex flex-col items-center py-2.5"
            aria-hidden="true"
          >
            <div className="w-0.5 h-4 bg-[repeating-linear-gradient(to_bottom,#d6d3d1_0,#d6d3d1_4px,transparent_4px,transparent_8px)]" />
            <ArrowDown className="w-4 h-4 text-stone-400 -mt-0.5" />
          </div>
        )}
      </div>
    </section>
  );
};

export const TopicSwipeFeed: React.FC<TopicSwipeFeedProps> = ({
  groups,
  onSelectPost,
  onOpenImmersive,
  isFilteredToSingleCategory,
  onResetCategoryFilter,
  checkPostLocked,
}) => {
  const [activeStepIdx, setActiveStepIdx] = useState(0);
  const flowNodeRefs = useRef<(HTMLButtonElement | null)[]>([]);

  useEffect(() => {
    if (groups.length <= 1) return;
    let rafId = 0;
    const updateStepFromScroll = () => {
      rafId = 0;
      let nextIdx = 0;
      for (let i = 0; i < groups.length; i++) {
        const el = document.getElementById(`swipe-topic-${i}`);
        if (!el) continue;
        const rect = el.getBoundingClientRect();
        if (rect.top <= 240) {
          nextIdx = i;
        }
      }
      setActiveStepIdx((prev) => (prev === nextIdx ? prev : nextIdx));
    };
    const onScroll = () => {
      if (rafId) return;
      rafId = window.requestAnimationFrame(updateStepFromScroll);
    };
    window.addEventListener('scroll', onScroll, {passive: true});
    return () => {
      window.removeEventListener('scroll', onScroll);
      if (rafId) window.cancelAnimationFrame(rafId);
    };
  }, [groups.length]);

  useEffect(() => {
    const btn = flowNodeRefs.current[activeStepIdx];
    if (btn) {
      btn.scrollIntoView({
        behavior: 'smooth',
        inline: 'nearest',
        block: 'nearest',
      });
    }
  }, [activeStepIdx]);

  const handleJumpToStep = useCallback((idx: number) => {
    setActiveStepIdx(idx);
    const el = document.getElementById(`swipe-topic-${idx}`);
    if (el) {
      el.scrollIntoView({behavior: 'smooth', block: 'start'});
    }
  }, []);

  return (
    <div className="space-y-6">
      {isFilteredToSingleCategory && (
        <div className="flex items-center justify-between gap-3 px-4 py-2.5 bg-white border border-stone-200 rounded-xl text-xs text-stone-700">
          <span>
            目前僅顯示單一教學步驟，切換回全部主題即可檢視完整教學流程圖。
          </span>
          <button
            type="button"
            onClick={onResetCategoryFilter}
            className="font-semibold text-[#1E3A8A] hover:underline whitespace-nowrap shrink-0"
          >
            展開完整教學流程
          </button>
        </div>
      )}

      {/* Top Horizontal Flowchart Path Overview (Visible when 2+ steps) */}
      {groups.length > 1 && (
        <div className="bg-white border border-stone-200 rounded-2xl p-4 sm:p-5 space-y-3 shadow-[0_2px_10px_rgba(28,25,23,0.03)]">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-xs font-semibold text-[#1E3A8A]">
              <Compass className="w-4 h-4 shrink-0" />
              <span>教師初訪閱讀路線 · 教學步驟流程圖</span>
            </div>
            <span className="text-xs font-mono-tabular text-stone-500">
              目前步驟 {String(activeStepIdx + 1).padStart(2, '0')} / {String(groups.length).padStart(2, '0')} · 點擊節點快速跳轉
            </span>
          </div>

          <div
            role="navigation"
            aria-label="教學順序步驟流程圖"
            className="flex items-center gap-2 overflow-x-auto no-scrollbar pb-1"
          >
            {groups.map((group, idx) => {
              const stepNum = String(idx + 1).padStart(2, '0');
              const isSelected = activeStepIdx === idx;
              return (
                <React.Fragment key={`flow-node-${group.topic}`}>
                  <button
                    ref={(el) => {
                      flowNodeRefs.current[idx] = el;
                    }}
                    type="button"
                    onClick={() => handleJumpToStep(idx)}
                    className={`min-h-[44px] px-3.5 py-2 rounded-xl border text-left transition-all shrink-0 inline-flex items-center gap-2.5 active:scale-[0.98] ${
                      isSelected
                        ? 'bg-[#1E3A8A] text-white border-[#1E3A8A] shadow-xs'
                        : 'bg-[#FBF9F5] text-stone-800 border-stone-200 hover:border-[#1E3A8A]/50 hover:bg-white'
                    }`}
                  >
                    <span
                      className={`w-6 h-6 rounded-md font-mono-tabular text-[11px] font-bold flex items-center justify-center shrink-0 ${
                        isSelected
                          ? 'bg-white/20 text-white'
                          : 'bg-[#1E3A8A]/10 text-[#1E3A8A]'
                      }`}
                    >
                      {stepNum}
                    </span>
                    <span className="flex flex-col leading-tight">
                      <span className="text-xs font-semibold whitespace-nowrap">
                        {group.topic}
                      </span>
                      <span
                        className={`text-[11px] font-mono-tabular whitespace-nowrap ${
                          isSelected ? 'text-blue-100' : 'text-stone-500'
                        }`}
                      >
                        {group.posts.length} 篇資源
                      </span>
                    </span>
                  </button>

                  {idx < groups.length - 1 && (
                    <div
                      className="flex items-center shrink-0 text-stone-400"
                      aria-hidden="true"
                    >
                      <span className="w-3 h-px border-t border-dashed border-stone-300" />
                      <ArrowRight className="w-4 h-4 text-stone-400 shrink-0" />
                    </div>
                  )}
                </React.Fragment>
              );
            })}
          </div>
        </div>
      )}

      {/* Vertical Connected Flowchart Steps */}
      <div className="space-y-1 sm:space-y-0">
        {groups.map((group, idx) => (
          <TopicCarouselRow
            key={group.topic}
            group={group}
            nextGroup={groups[idx + 1]}
            topicIndex={idx}
            totalSteps={groups.length}
            onSelectPost={onSelectPost}
            onOpenImmersive={onOpenImmersive}
            onJumpToStep={handleJumpToStep}
            checkPostLocked={checkPostLocked}
          />
        ))}
      </div>
    </div>
  );
};
