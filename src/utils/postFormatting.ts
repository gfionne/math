import {JournalPost} from '../types/journal';

export interface TopicGroup {
  topic: string;
  posts: JournalPost[];
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
