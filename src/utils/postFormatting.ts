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
 * Normalizes academic year strings (e.g. "114學年度", "114 學年", "１１４", "114  學年度")
 * into a consistent "114 學年度" format so spacing/style differences don't split counts.
 */
export function normalizeAcademicYear(raw?: string): string {
  if (!raw) return '';
  const halfWidth = raw
    .replace(/[０-９]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0xfee0))
    .replace(/\u3000/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!halfWidth) return '';

  const singleMatch = halfWidth.match(/^(\d{2,3})\s*(?:學年度|學年)?$/);
  if (singleMatch) {
    return `${singleMatch[1]} 學年度`;
  }

  const rangeMatch = halfWidth.match(
    /^(\d{2,3})\s*[-~～—]\s*(\d{2,3})\s*(?:學年度|學年)?$/,
  );
  if (rangeMatch) {
    return `${rangeMatch[1]}-${rangeMatch[2]} 學年度`;
  }

  return halfWidth.replace(/\s*(學年度|學年)\s*$/, ' 學年度').trim();
}

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

const TEACHING_TOPIC_FLOW_ORDER = [
  '社群計畫',
  '夥伴教師',
  '會議紀錄',
  '探究教學',
  '趣味數學',
  'STEAM',
  '教學資源',
  '學力檢測',
  '成果報告',
  '綜合專欄',
];

function getTopicFlowRank(topic: string): number {
  const exactIdx = TEACHING_TOPIC_FLOW_ORDER.indexOf(topic);
  if (exactIdx !== -1) return exactIdx;
  const fuzzyIdx = TEACHING_TOPIC_FLOW_ORDER.findIndex((key) =>
    topic.includes(key),
  );
  return fuzzyIdx !== -1 ? fuzzyIdx : TEACHING_TOPIC_FLOW_ORDER.length;
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

  return Array.from(map.entries())
    .map(([topic, topicPosts]) => ({
      topic,
      posts: topicPosts,
    }))
    .sort((a, b) => {
      const rankDiff = getTopicFlowRank(a.topic) - getTopicFlowRank(b.topic);
      if (rankDiff !== 0) return rankDiff;
      return b.posts.length - a.posts.length;
    });
}

export function isPostLocked(
  post: JournalPost,
  lockedCategories: string[] = [],
  isSchoolAuthorized = false,
): boolean {
  if (isSchoolAuthorized) return false;
  if (post.status === 'Restricted') return true;
  if (lockedCategories.length === 0) return false;
  const postCats = parseCategories(post.category);
  return postCats.some((cat) => lockedCategories.includes(cat));
}

/**
 * Extracts a Google Drive File ID from various Drive URL formats:
 * - https://drive.google.com/file/d/{id}/view...
 * - https://drive.google.com/file/d/{id}
 * - https://drive.google.com/open?id={id}
 * - https://drive.google.com/uc?id={id}
 * - https://drive.google.com/uc?export=view&id={id}
 * - https://drive.google.com/thumbnail?id={id}
 * - https://lh3.googleusercontent.com/d/{id}
 * - https://docs.google.com/file/d/{id}
 */
export function extractGoogleDriveFileId(url?: string): string | null {
  if (!url) return null;
  const str = url.trim();
  if (!str) return null;

  // 1. /file/d/{id}
  const fileDMatch = str.match(/\/file\/d\/([a-zA-Z0-9_-]+)/i);
  if (fileDMatch && fileDMatch[1]) return fileDMatch[1];

  // 2. lh3.googleusercontent.com/d/{id}
  const lh3Match = str.match(/lh3\.googleusercontent\.com\/d\/([a-zA-Z0-9_-]+)/i);
  if (lh3Match && lh3Match[1]) return lh3Match[1];

  // 3. Query param id={id}
  const idMatch = str.match(/[?&]id=([a-zA-Z0-9_-]+)/i);
  if (idMatch && idMatch[1]) return idMatch[1];

  return null;
}

/**
 * Normalizes any image URL (especially Google Drive links) into a direct image CDN URL.
 * Google Drive viewer links (file/d/...) serve HTML which breaks <img> tags.
 * This converts them to Google's direct image CDN (lh3.googleusercontent.com/d/{id}).
 */
export function normalizeDriveImageUrl(url?: string): string {
  if (!url) return '';
  const trimmed = url.trim();
  if (!trimmed) return '';

  const fileId = extractGoogleDriveFileId(trimmed);
  if (fileId) {
    return `https://lh3.googleusercontent.com/d/${fileId}`;
  }

  if (trimmed.startsWith('/src/assets/')) {
    return `.${trimmed}`;
  }

  return trimmed;
}

/**
 * Secondary fallback thumbnail URL for Google Drive images in case lh3 CDN is restricted.
 */
export function getDriveThumbnailFallbackUrl(fileIdOrUrl: string, size = 'w1200'): string {
  const fileId = extractGoogleDriveFileId(fileIdOrUrl) || fileIdOrUrl.trim();
  if (!fileId) return '';
  return `https://drive.google.com/thumbnail?id=${encodeURIComponent(fileId)}&sz=${size}`;
}

/**
 * Normalizes Google Drive file/d/... links inside Markdown content to direct image URLs.
 */
export function normalizeMarkdownDriveImages(markdown: string): string {
  if (!markdown) return '';
  return markdown.replace(
    /!\[(.*?)\]\((https:\/\/(?:drive|docs)\.google\.com\/file\/d\/([a-zA-Z0-9_-]+)[^)]*)\)/gi,
    (_, alt, __, id) => `![${alt}](https://lh3.googleusercontent.com/d/${id})`
  );
}


