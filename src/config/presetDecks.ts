import {JournalPost} from '../types/journal';

export interface PresetSlideMeta {
  pageNumber: number;
  title: string;
  subtitle?: string;
}

export interface PresetDeckConfig {
  id: string;
  pdfUrl: string;
  downloadFileName: string;
  deckTitle: string;
  slides: PresetSlideMeta[];
  matchesPost: (post: JournalPost) => boolean;
}

export const PRESET_ARTICLE_DECKS: PresetDeckConfig[] = [
  {
    id: '1151125-cross-domain-math',
    pdfUrl: './assets/aistudio/_________4__6772eea7.pdf',
    downloadFileName: '1151125領域會議_跨域玩數學_AI賦能與STEAM新視界.pdf',
    deckTitle: '跨域玩數學：AI賦能與STEAM新視界',
    matchesPost: (post: JournalPost) => {
      const normalized = `${post.title || ''} ${post.slug || ''}`.replace(
        /\s+/g,
        '',
      );
      return (
        normalized.includes('1151125') ||
        normalized.includes('跨域數學新視界') ||
        (normalized.includes('領域會議') && normalized.includes('跨域數學'))
      );
    },
    slides: [
      {
        pageNumber: 1,
        title: '跨域玩數學：AI賦能與STEAM新視界',
        subtitle: '從數位教室到自然與藝術的無界探索',
      },
      {
        pageNumber: 2,
        title: '數學：理解世界的終極濾鏡',
        subtitle: '不只是計算，更是跨越領域的通用語言',
      },
      {
        pageNumber: 3,
        title: '創新教學法：情境化與協作學習的完美循環',
        subtitle: '四年級「除法」教案拆解：皮克敏探索隊物資分配任務',
      },
      {
        pageNumber: 4,
        title: '跨界魔法 I：演化背後的數學精算師',
        subtitle: '空間配置最佳化（Voronoi圖）與生存機率最大化（週期蟬質數）',
      },
      {
        pageNumber: 5,
        title: '跨界魔法 II：生命的縮放定律與常數',
        subtitle: '韋伯定律與哺乳動物一生約 10 億次心跳的終極方程式',
      },
      {
        pageNumber: 6,
        title: '跨界魔法 III：藝術裡的座標與錯視',
        subtitle: '達文西透視玻璃板、笛卡兒直角座標與霍爾拜因變形畫',
      },
      {
        pageNumber: 7,
        title: '跨界魔法 IV：名畫中的極致密碼學',
        subtitle: '杜勒《憂鬱 I》與 34 幻方 (Magic Square) 的浪漫簽名',
      },
      {
        pageNumber: 8,
        title: '數學即生活，生活即數學',
        subtitle: '保持好奇，動手求證：這就是不可取代的 STEAM 數學力',
      },
    ],
  },
];

export function findPresetDeckForPost(
  post: JournalPost | null,
): PresetDeckConfig | null {
  if (!post) return null;
  return PRESET_ARTICLE_DECKS.find((preset) => preset.matchesPost(post)) ?? null;
}
