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

/**
 * Splits a post's Category string (e.g. "STEAM, 教學資源" or "STEAM、探究教學")
 * into deduplicated individual category names.
 */
export function parseCategories(categoryStr?: string): string[] {
  if (!categoryStr) return [];
  const parts = categoryStr
    .split(/[,，、;；|/]+/)
    .map((s) => s.trim())
    .filter(Boolean);
  const unique: string[] = [];
  const seen = new Set<string>();
  for (const part of parts) {
    if (!seen.has(part)) {
      seen.add(part);
      unique.push(part);
    }
  }
  return unique;
}

export function formatCategories(categories: string[]): string {
  const unique: string[] = [];
  const seen = new Set<string>();
  for (const raw of categories) {
    const trimmed = raw.trim();
    if (trimmed && !seen.has(trimmed)) {
      seen.add(trimmed);
      unique.push(trimmed);
    }
  }
  return unique.join(', ');
}

export function getPrimaryCategory(categoryStr?: string): string {
  return parseCategories(categoryStr)[0] || '綜合專欄';
}

export function formatCategoryDisplay(
  categoryStr?: string,
  fallback = '綜合專欄',
): string {
  const list = parseCategories(categoryStr);
  return list.length > 0 ? list.join(' · ') : fallback;
}

export function getCategoryAccent(category?: string): CategoryAccent {
  const key = getPrimaryCategory(category);
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

export function groupPostsByTopic(
  posts: JournalPost[],
  selectedCategory?: string,
): TopicGroup[] {
  const map = new Map<string, JournalPost[]>();
  const activeFilter =
    selectedCategory && selectedCategory !== '全部分類'
      ? selectedCategory.trim()
      : '';

  for (const post of posts) {
    const categories = parseCategories(post.category);
    const topics = activeFilter
      ? [activeFilter]
      : categories.length > 0
      ? categories
      : ['綜合專欄'];

    for (const topic of topics) {
      const list = map.get(topic);
      if (list) {
        list.push(post);
      } else {
        map.set(topic, [post]);
      }
    }
  }

  return Array.from(map.entries()).map(([topic, topicPosts]) => ({
    topic,
    posts: topicPosts,
  }));
}
