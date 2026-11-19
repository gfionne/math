import {JournalPost} from '../types/journal';

export interface TopicGroup {
  topic: string;
  posts: JournalPost[];
}

export interface CategoryAccent {
  textClass: string;
  barClass: string;
}

const CATEGORY_PALETTE: CategoryAccent[] = [
  {textClass: 'text-[#1E3A8A]', barClass: 'bg-[#1E3A8A]'}, // Deep Lapis
  {textClass: 'text-[#14532D]', barClass: 'bg-[#14532D]'}, // Forest Ink
  {textClass: 'text-[#9A3412]', barClass: 'bg-[#9A3412]'}, // Terracotta
  {textClass: 'text-[#115E59]', barClass: 'bg-[#115E59]'}, // Deep Teal
  {textClass: 'text-[#78350F]', barClass: 'bg-[#78350F]'}, // Bronze
  {textClass: 'text-[#4C1D95]', barClass: 'bg-[#4C1D95]'}, // Deep Plum
];

export function getCategoryAccent(category?: string): CategoryAccent {
  const key = (category || '').trim();
  if (!key) return CATEGORY_PALETTE[0];
  let hash = 0;
  for (let i = 0; i < key.length; i++) {
    hash = (hash * 31 + key.charCodeAt(i)) >>> 0;
  }
  return CATEGORY_PALETTE[hash % CATEGORY_PALETTE.length];
}

export function estimateReadMinutes(content: string): number {
  const chars = content.replace(/\s+/g, '').length;
  return Math.max(1, Math.round(chars / 320));
}

export function groupPostsByTopic(posts: JournalPost[]): TopicGroup[] {
  const map = new Map<string, JournalPost[]>();
  for (const post of posts) {
    const topic = post.category?.trim() || '綜合專欄';
    const list = map.get(topic);
    if (list) {
      list.push(post);
    } else {
      map.set(topic, [post]);
    }
  }
  return Array.from(map.entries()).map(([topic, topicPosts]) => ({
    topic,
    posts: topicPosts,
  }));
}
