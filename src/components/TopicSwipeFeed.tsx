import React, {useEffect, useState} from 'react';
import {JournalPost} from '../types/journal';
import {getCategoryAccent, TopicGroup} from '../utils/postFormatting';
import {ArticleCard} from './ArticleCard';
import {HorizontalCardTray} from './HorizontalCardTray';

interface TopicSwipeFeedProps {
  groups: TopicGroup[];
  onSelectPost: (post: JournalPost) => void;
  onOpenImmersive: (topicIndex: number, cardIndex: number) => void;
  isFilteredToSingleCategory: boolean;
  onResetCategoryFilter: () => void;
  checkPostLocked?: (post: JournalPost) => boolean;
  isJournalActive?: boolean;
}

export const TopicSwipeFeed: React.FC<TopicSwipeFeedProps> = ({
  groups,
  onSelectPost,
  onOpenImmersive,
  isFilteredToSingleCategory,
  onResetCategoryFilter,
  checkPostLocked,
  isJournalActive = true,
}) => {
  const [activeTopicIdx, setActiveTopicIdx] = useState(0);

  useEffect(() => {
    if (activeTopicIdx >= groups.length) {
      setActiveTopicIdx(0);
    }
  }, [groups.length, activeTopicIdx]);

  useEffect(() => {
    if (!isJournalActive || groups.length <= 1) return;

    let rafId = 0;
    const updateActiveTopic = () => {
      rafId = 0;
      const focalY = Math.min(340, window.innerHeight * 0.42);
      let matched = 0;
      for (let i = 0; i < groups.length; i++) {
        const el = document.getElementById(`swipe-topic-${i}`);
        if (!el) continue;
        if (el.getBoundingClientRect().top <= focalY) {
          matched = i;
        }
      }
      setActiveTopicIdx((prev) => (prev === matched ? prev : matched));
    };

    const onScroll = () => {
      if (rafId) return;
      rafId = window.requestAnimationFrame(updateActiveTopic);
    };

    updateActiveTopic();
    window.addEventListener('scroll', onScroll, {passive: true});
    return () => {
      window.removeEventListener('scroll', onScroll);
      if (rafId) window.cancelAnimationFrame(rafId);
    };
  }, [groups.length, isJournalActive]);

  return (
    <div className="space-y-8">
      {isFilteredToSingleCategory && (
        <div className="flex items-center justify-between gap-3 px-4 py-2.5 bg-white border border-stone-200 rounded-xl text-xs text-stone-700">
          <span>
            目前僅顯示單一主題，切換回全部主題即可瀏覽所有領域社群文章。
          </span>
          <button
            type="button"
            onClick={onResetCategoryFilter}
            className="font-semibold text-[#1E3A8A] hover:underline whitespace-nowrap shrink-0"
          >
            顯示全部主題
          </button>
        </div>
      )}

      <div className="space-y-8">
        {groups.map((group, topicIndex) => {
          const accent = getCategoryAccent(group.topic);
          return (
            <HorizontalCardTray
              key={group.topic}
              id={`swipe-topic-${topicIndex}`}
              sectionIndex={topicIndex + 1}
              title={group.topic}
              layer="nested"
              isActiveSection={isJournalActive && topicIndex === activeTopicIdx}
              dimInactive={isJournalActive && groups.length > 1}
              accentTextClass={accent.textClass}
              accentBarClass={accent.barClass}
              itemCount={group.posts.length}
              itemUnitLabel="篇文章"
              quickSwipeLabel="滑動快覽"
              onOpenQuickSwipe={(cardIdx) =>
                onOpenImmersive(topicIndex, cardIdx)
              }
            >
              {group.posts.map((post, idx) => (
                <div
                  key={`${post.slug}-${post.rowIndex ?? idx}`}
                  className="w-[78vw] sm:w-[305px] lg:w-[325px] snap-start shrink-0 flex"
                >
                  <div className="w-full flex flex-col">
                    <ArticleCard
                      post={post}
                      onSelect={onSelectPost}
                      isLocked={
                        checkPostLocked ? checkPostLocked(post) : false
                      }
                    />
                  </div>
                </div>
              ))}
            </HorizontalCardTray>
          );
        })}
      </div>
    </div>
  );
};
