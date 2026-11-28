import React from 'react';
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
}

export const TopicSwipeFeed: React.FC<TopicSwipeFeedProps> = ({
  groups,
  onSelectPost,
  onOpenImmersive,
  isFilteredToSingleCategory,
  onResetCategoryFilter,
  checkPostLocked,
}) => {
  return (
    <div className="space-y-10">
      {isFilteredToSingleCategory && (
        <div className="flex items-center justify-between gap-3 px-4 py-2.5 bg-white border border-stone-200 rounded-xl text-xs text-stone-700">
          <span>
            目前僅顯示單一專欄主題，切換回全部主題即可瀏覽所有期刊專欄。
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

      <div className="space-y-11">
        {groups.map((group, topicIndex) => {
          const accent = getCategoryAccent(group.topic);
          return (
            <HorizontalCardTray
              key={group.topic}
              id={`swipe-topic-${topicIndex}`}
              sectionIndex={topicIndex + 1}
              title={group.topic}
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
