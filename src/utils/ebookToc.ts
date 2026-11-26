import {ResourceGradeBand, TeachingResource} from '../types/journal';

export interface EbookTocEntry {
  id: string;
  order?: string;
  category?: string;
  grade?: string;
  title: string;
  designer?: string;
  startPage: number;
  endPage?: number;
  pageNote?: string;
  bookPageNote?: string;
  resourceKind?: string;
  level?: number;
}

export interface EbookCrossTopicStrand {
  id: string;
  label: string;
  description: string;
  chapterOrders: string[];
}

export interface EbookTocBookMeta {
  sourceLabel: string;
  entries: EbookTocEntry[];
  categoryDescriptions?: Record<string, string>;
  crossTopicStrands?: EbookCrossTopicStrand[];
}

export interface PdfOutlineLike {
  id: string;
  title: string;
  pageNumber: number | null;
  level: number;
}

export type PedagogicalTypeGroup =
  | '探究教學篇'
  | '形成性評量篇'
  | '導覽與附錄';

export function mapChapterGradeToGradeBand(grade?: string): ResourceGradeBand {
  const g = (grade || '').trim();
  if (g === '一年級' || g === '二年級') return '低年級 (1-2)';
  if (g === '三年級' || g === '四年級') return '中年級 (3-4)';
  if (g === '五年級' || g === '六年級') return '高年級 (5-6)';
  return '跨年級通用';
}

export function getPedagogicalTypeGroup(
  category?: string,
): PedagogicalTypeGroup {
  const c = (category || '').trim();
  if (c.startsWith('探究教學篇')) return '探究教學篇';
  if (c.startsWith('形成性評量篇')) return '形成性評量篇';
  return '導覽與附錄';
}

export function isConstructedResponseBookResource(
  resource?: Pick<TeachingResource, 'id' | 'title'> | null,
): boolean {
  if (!resource) return false;
  if (resource.id === 'res-constructed-response-math-ebook') return true;
  const normalizedTitle = (resource.title || '').replace(/\s+/g, '');
  return normalizedTitle.includes('建構反應題融入數學領域素養教學活動設計');
}

export const CONSTRUCTED_RESPONSE_BOOK_META: EbookTocBookMeta = {
  sourceLabel: '篇章結構目錄（20 篇）',
  categoryDescriptions: {
    導覽與前言: '封面、序、專文、目次與篇名頁索引（PDF 1～11）。',
    '探究教學篇（擴展式）':
      '以單一核心問題為起點，透過引入、探索、分享討論與結論四階段逐步追問延伸（01～06 篇，涵蓋二、四、五、六年級）。',
    '探究教學篇（題組式）':
      '以環環相扣的題組任務引導學生逐題探索與對話表徵（07～08 篇，聚焦四年級分數概念）。',
    形成性評量篇:
      '運用建構反應題進行「先評量、後討論」形成性評量與教學整合（09～18 篇，涵蓋一、三、四、五年級），含評閱標準、學生常見錯誤分析與解題舉隅。',
    書末版權與附錄:
      '全書出版資訊、編撰群與臺北市國民教育輔導團國小數學領域輔導小組名單。',
  },
  crossTopicStrands: [
    {
      id: 'strand-fraction-division',
      label: '分數、除法與比率',
      description:
        '從四年級「兩數相除是分數」、「畫圖表徵分數」、「分數」、「分數為兩整數相除結果」延伸至五年級「比率與百分率（折扣問題）」',
      chapterOrders: ['03', '07', '08', '13', '17'],
    },
    {
      id: 'strand-estimation-ops',
      label: '運算規則／估算／去零餘數',
      description:
        '串聯四年級「四捨五入」、「取概數」、「整數四則」與五年級「連除併式」、「去零除法」餘數還原',
      chapterOrders: ['02', '05', '11', '12', '16'],
    },
    {
      id: 'strand-geometry-measure',
      label: '幾何構成與測量',
      description:
        '橫跨三至五年級「周界和周長」、「周長與面積」、「角度」、「容積的應用」與「扇形」構成要素判斷',
      chapterOrders: ['04', '10', '14', '15', '18'],
    },
    {
      id: 'strand-data-strategy',
      label: '資料整理與解題策略',
      description: '一年級「分類整理」基礎到六年級「怎樣解題」多元解題策略表達',
      chapterOrders: ['06', '09'],
    },
  ],
  entries: [
    {
      id: 'cr-00',
      order: '00',
      category: '導覽與前言',
      grade: '通用',
      title: '封面、序、專文、目次、篇名頁',
      designer: '—',
      startPage: 1,
      endPage: 11,
      pageNote: '1～11',
      bookPageNote: '前導頁',
      resourceKind: '導讀與目錄索引',
    },
    {
      id: 'cr-01',
      order: '01',
      category: '探究教學篇（擴展式）',
      grade: '二年級',
      title: '錢幣換算',
      designer: '李孟柔',
      startPage: 12,
      endPage: 24,
      pageNote: '12～24',
      bookPageNote: '原書 001～013',
      resourceKind: '探究教案、學習單與教學資源',
    },
    {
      id: 'cr-02',
      order: '02',
      category: '探究教學篇（擴展式）',
      grade: '四年級',
      title: '四捨五入',
      designer: '翁嘉聲',
      startPage: 25,
      endPage: 35,
      pageNote: '25～35',
      bookPageNote: '原書 014～024',
      resourceKind: '探究教案、學習單與教學資源',
    },
    {
      id: 'cr-03',
      order: '03',
      category: '探究教學篇（擴展式）',
      grade: '四年級',
      title: '兩數相除是分數',
      designer: '孫德蘭',
      startPage: 36,
      endPage: 44,
      pageNote: '36～44',
      bookPageNote: '原書 025～033',
      resourceKind: '探究教案、學習單與教學資源',
    },
    {
      id: 'cr-04',
      order: '04',
      category: '探究教學篇（擴展式）',
      grade: '五年級',
      title: '容積的應用',
      designer: '石玫芳',
      startPage: 45,
      endPage: 53,
      pageNote: '45～53',
      bookPageNote: '原書 034～042',
      resourceKind: '探究教案、學習單與教學資源',
    },
    {
      id: 'cr-05',
      order: '05',
      category: '探究教學篇（擴展式）',
      grade: '五年級',
      title: '連除併式',
      designer: '李孟柔',
      startPage: 54,
      endPage: 66,
      pageNote: '54～66',
      bookPageNote: '原書 043～055',
      resourceKind: '探究教案、學習單與教學資源',
    },
    {
      id: 'cr-06',
      order: '06',
      category: '探究教學篇（擴展式）',
      grade: '六年級',
      title: '怎樣解題',
      designer: '陳滄智、石玫芳',
      startPage: 67,
      endPage: 79,
      pageNote: '67～79',
      bookPageNote: '原書 056～068',
      resourceKind: '探究教案、學習單與教學資源',
    },
    {
      id: 'cr-07',
      order: '07',
      category: '探究教學篇（題組式）',
      grade: '四年級',
      title: '畫圖表徵分數',
      designer: '石玫芳',
      startPage: 82,
      endPage: 90,
      pageNote: '82～90',
      bookPageNote: '原書 071～079',
      resourceKind: '題組式探究教案、學習單與資源',
    },
    {
      id: 'cr-08',
      order: '08',
      category: '探究教學篇（題組式）',
      grade: '四年級',
      title: '分數',
      designer: '曾婉菁',
      startPage: 91,
      endPage: 101,
      pageNote: '91～101',
      bookPageNote: '原書 080～090',
      resourceKind: '題組式探究教案、學習單與資源',
    },
    {
      id: 'cr-09',
      order: '09',
      category: '形成性評量篇',
      grade: '一年級',
      title: '分類整理',
      designer: '林旭霓',
      startPage: 104,
      endPage: 113,
      pageNote: '104～113',
      bookPageNote: '原書 093～102',
      resourceKind: '形成性評量題組、評量說明與附件',
    },
    {
      id: 'cr-10',
      order: '10',
      category: '形成性評量篇',
      grade: '三年級',
      title: '周界和周長',
      designer: '孫德蘭',
      startPage: 114,
      endPage: 124,
      pageNote: '114～124',
      bookPageNote: '原書 103～113',
      resourceKind: '形成性評量題組、評量說明與附件',
    },
    {
      id: 'cr-11',
      order: '11',
      category: '形成性評量篇',
      grade: '四年級',
      title: '取概數',
      designer: '房昔梅',
      startPage: 125,
      endPage: 136,
      pageNote: '125～136',
      bookPageNote: '原書 114～125',
      resourceKind: '形成性評量題組、評量說明與附件',
    },
    {
      id: 'cr-12',
      order: '12',
      category: '形成性評量篇',
      grade: '四年級',
      title: '整數四則',
      designer: '張雅文',
      startPage: 137,
      endPage: 148,
      pageNote: '137～148',
      bookPageNote: '原書 126～137',
      resourceKind: '形成性評量題組、評量說明與附件',
    },
    {
      id: 'cr-13',
      order: '13',
      category: '形成性評量篇',
      grade: '四年級',
      title: '分數為兩整數相除結果',
      designer: '駱美如',
      startPage: 149,
      endPage: 158,
      pageNote: '149～158',
      bookPageNote: '原書 138～147',
      resourceKind: '形成性評量題組、評量說明與附件',
    },
    {
      id: 'cr-14',
      order: '14',
      category: '形成性評量篇',
      grade: '四年級',
      title: '周長與面積',
      designer: '石玫芳',
      startPage: 159,
      endPage: 169,
      pageNote: '159～169',
      bookPageNote: '原書 148～158',
      resourceKind: '形成性評量題組、評量說明與附件',
    },
    {
      id: 'cr-15',
      order: '15',
      category: '形成性評量篇',
      grade: '四年級',
      title: '角度',
      designer: '胡詩菁',
      startPage: 170,
      endPage: 182,
      pageNote: '170～182',
      bookPageNote: '原書 159～171',
      resourceKind: '形成性評量題組、評量說明與附件',
    },
    {
      id: 'cr-16',
      order: '16',
      category: '形成性評量篇',
      grade: '五年級',
      title: '去零除法（101年度基測附件與解題舉隅）',
      designer: '李孟柔',
      startPage: 183,
      endPage: 195,
      pageNote: '183～195',
      bookPageNote: '原書 172～184',
      resourceKind: '形成性評量教案、檢測結果說明與解題舉隅',
    },
    {
      id: 'cr-17',
      order: '17',
      category: '形成性評量篇',
      grade: '五年級',
      title: '比率與百分率（折扣問題，康軒版第5節）',
      designer: '孫德蘭（指導：鍾靜）',
      startPage: 196,
      endPage: 206,
      pageNote: '196～206',
      bookPageNote: '原書 185～195',
      resourceKind: '形成性評量教案、評量單與101基測附件',
    },
    {
      id: 'cr-18',
      order: '18',
      category: '形成性評量篇',
      grade: '五年級',
      title: '扇形（冰淇淋外包裝判斷，南一版第1節）',
      designer: '吳欣悅（指導：鍾靜）',
      startPage: 207,
      endPage: 217,
      pageNote: '207～217',
      bookPageNote: '原書 196～206',
      resourceKind: '形成性評量教案、評量單與自編試題附件',
    },
    {
      id: 'cr-19',
      order: '19',
      category: '書末版權與附錄',
      grade: '通用',
      title: '版權頁與臺北市國小數學輔導小組名單',
      designer: '陳滄智等',
      startPage: 218,
      endPage: 219,
      pageNote: '218～219',
      bookPageNote: '原書 207～208',
      resourceKind: '出版資訊與輔導團名單',
    },
  ],
};

export const CONSTRUCTED_RESPONSE_CANONICAL_TAGS =
  '探究教學篇, 形成性評量篇, 建構反應題, 素養導向, 分數與小數, 幾何與空間, 比率與百分率';

export const CONSTRUCTED_RESPONSE_CANONICAL_SUMMARY =
  '全書 219 頁收錄 1～6 年級共 18 篇教學設計，精確劃分為「探究教學篇（擴展式 6 篇、題組式 2 篇）」與「形成性評量篇（10 篇）」，支援依資源類型、年級與數學單元直達對應 PDF 頁碼。';

export const CONSTRUCTED_RESPONSE_CANONICAL_CONTENT = `## 全書篇章分類架構與年級單元映射（全書 219 頁）

本書依教學型態精確劃分為三大教學模組與前後附錄，並已完成 1～6 年級單元與 PDF／原書頁碼對齊：

### 一、探究教學篇 — 擴展式（01～06 篇｜PDF 12～79 頁／原書 001～068 頁）
* **01 二年級｜錢幣換算**（李孟柔 · PDF 12～24／原書 001～013）
* **02 四年級｜四捨五入**（翁嘉聲 · PDF 25～35／原書 014～024）
* **03 四年級｜兩數相除是分數**（孫德蘭 · PDF 36～44／原書 025～033）
* **04 五年級｜容積的應用**（石玫芳 · PDF 45～53／原書 034～042）
* **05 五年級｜連除併式**（李孟柔 · PDF 54～66／原書 043～055）
* **06 六年級｜怎樣解題**（陳滄智、石玫芳 · PDF 67～79／原書 056～068）

### 二、探究教學篇 — 題組式（07～08 篇｜PDF 82～101 頁／原書 071～090 頁）
* **07 四年級｜畫圖表徵分數**（石玫芳 · PDF 82～90／原書 071～079）
* **08 四年級｜分數**（曾婉菁 · PDF 91～101／原書 080～090）

### 三、形成性評量篇（09～18 篇｜PDF 104～217 頁／原書 093～206 頁）
* **09 一年級｜分類整理**（林旭霓 · PDF 104～113／原書 093～102）
* **10 三年級｜周界和周長**（孫德蘭 · PDF 114～124／原書 103～113）
* **11 四年級｜取概數**（房昔梅 · PDF 125～136／原書 114～125）
* **12 四年級｜整數四則**（張雅文 · PDF 137～148／原書 126～137）
* **13 四年級｜分數為兩整數相除結果**（駱美如 · PDF 149～158／原書 138～147）
* **14 四年級｜周長與面積**（石玫芳 · PDF 159～169／原書 148～158）
* **15 四年級｜角度**（胡詩菁 · PDF 170～182／原書 159～171）
* **16 五年級｜去零除法**（李孟柔 · PDF 183～195／原書 172～184）
* **17 五年級｜比率與百分率（折扣問題）**（孫德蘭 · PDF 196～206／原書 185～195）
* **18 五年級｜扇形（冰淇淋外包裝判斷）**（吳欣悅 · PDF 207～217／原書 196～206）

### 四、導覽前言與書末附錄（00、19｜PDF 1～11、218～219 頁）
* **00 通用｜封面、序、專文、目次、篇名頁**（PDF 1～11）
* **19 通用｜版權頁與臺北市國小數學輔導小組名單**（PDF 218～219／原書 207～208）`;

export function enrichTeachingResourceMetadata(
  resource: TeachingResource,
): TeachingResource {
  if (!isConstructedResponseBookResource(resource)) {
    return resource;
  }

  const rawSummary = (resource.summary || '').trim();
  const isOutdatedPlaceholderSummary =
    !rawSummary ||
    rawSummary.startsWith('跨年級通用｜電子書：') ||
    rawSummary.includes('20 區間') ||
    rawSummary.includes('形成性評量／素養教案');

  const rawContent = (resource.content || '').trim();
  const isOutdatedContent =
    !rawContent ||
    rawContent.includes('本文件為一套數學科建構反應題的教學活動設計指南') ||
    rawContent.includes('形成性評量篇與五年級素養教案') ||
    rawContent.includes('暫歸');

  const existingTags = (resource.topicTags || '')
    .split(/[,，、;；|/]+/)
    .map((t) => t.trim())
    .filter(Boolean);
  const canonicalTags = CONSTRUCTED_RESPONSE_CANONICAL_TAGS.split(',').map(
    (t) => t.trim(),
  );
  const mergedTags = Array.from(new Set([...canonicalTags, ...existingTags])).join(
    ', ',
  );

  return {
    ...resource,
    summary: isOutdatedPlaceholderSummary
      ? CONSTRUCTED_RESPONSE_CANONICAL_SUMMARY
      : rawSummary,
    content: isOutdatedContent
      ? CONSTRUCTED_RESPONSE_CANONICAL_CONTENT
      : rawContent,
    topicTags: mergedTags,
  };
}

function parsePageRangeToken(raw: string): {
  startPage: number;
  endPage?: number;
  pageNote: string;
} | null {
  const cleaned = raw.replace(/\*\*/g, '').trim();
  // Support forms like: "169（接170）～182", "183～219*", "12-24", "第 1–3 頁", "P.25"
  const contMatch = cleaned.match(/(\d+)\s*[（(]接\s*(\d+)[)）]\s*[～~–\-－—]\s*(\d+)/);
  if (contMatch) {
    const startPage = parseInt(contMatch[2], 10);
    const endPage = parseInt(contMatch[3], 10);
    if (startPage > 0) {
      return {startPage, endPage, pageNote: cleaned};
    }
  }
  const rangeMatch = cleaned.match(/(\d+)\s*[～~–\-－—]\s*(\d+)/);
  if (rangeMatch) {
    const startPage = parseInt(rangeMatch[1], 10);
    const endPage = parseInt(rangeMatch[2], 10);
    if (startPage > 0) {
      return {
        startPage,
        endPage: endPage >= startPage ? endPage : undefined,
        pageNote: cleaned,
      };
    }
  }
  const singleMatch = cleaned.match(/(\d+)/);
  if (singleMatch) {
    const startPage = parseInt(singleMatch[1], 10);
    if (startPage > 0) {
      return {startPage, pageNote: String(startPage)};
    }
  }
  return null;
}

/**
 * Parses page-indexed chapter entries from a resource's Markdown content:
 * 1) Markdown tables containing page range columns (e.g. | 01 | 探究教學篇 | 二年級 | 錢幣換算 | 李孟柔 | 12～24 | ...)
 * 2) Bullet or numbered lines with explicit page markers (e.g. "1. **第 1–3 頁**：..." or "- P.12 錢幣換算")
 */
export function parseTocEntriesFromContent(content?: string): EbookTocEntry[] {
  if (!content || !content.trim()) return [];
  const lines = content.split(/\r?\n/);
  const entries: EbookTocEntry[] = [];
  const seenKeys = new Set<string>();

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    // Case 1: Markdown table row
    if (line.startsWith('|') && line.endsWith('|')) {
      const cells = line
        .slice(1, -1)
        .split('|')
        .map((c) => c.trim());
      if (cells.length >= 3) {
        if (cells.every((c) => /^:?-{2,}:?$/.test(c))) continue;
        if (
          cells.some((c) => /^(次序|單元主題|PDF\s*頁碼|頁碼|章節)$/i.test(c))
        ) {
          continue;
        }
        // Locate a cell that looks like a page number or range
        const pageCellIdx = cells.findIndex(
          (c) =>
            /^\d{1,4}(?:\s*[（(]接\s*\d+[)）])?(?:\s*[～~–\-－—]\s*\d{1,4})?\*?$/.test(
              c,
            ) || /^(?:p\.?\s*|第\s*)\d+/i.test(c),
        );
        // Avoid matching the leading "00"/"01" order column when a later range column exists
        let resolvedPageIdx = pageCellIdx;
        for (let cIdx = cells.length - 1; cIdx >= 0; cIdx--) {
          if (
            /\d+\s*[～~–\-－—]\s*\d+/.test(cells[cIdx]) ||
            /^(?:p\.?\s*|第\s*)\d+/i.test(cells[cIdx])
          ) {
            resolvedPageIdx = cIdx;
            break;
          }
        }
        if (resolvedPageIdx > 0) {
          const parsedRange = parsePageRangeToken(cells[resolvedPageIdx]);
          if (parsedRange) {
            const hasOrderCol = /^\d{1,2}$/.test(cells[0]);
            const order = hasOrderCol ? cells[0].padStart(2, '0') : undefined;
            const category =
              cells.length >= 6 && hasOrderCol ? cells[1] : undefined;
            const grade =
              cells.length >= 6 && hasOrderCol ? cells[2] : undefined;
            const title =
              cells.length >= 6 && hasOrderCol
                ? cells[3]
                : cells[resolvedPageIdx === 1 ? 0 : 1] || cells[0];
            const designer =
              cells.length >= 6 && hasOrderCol ? cells[4] : undefined;
            const resourceKind =
              cells.length >= 7 && hasOrderCol ? cells[6] : undefined;

            const cleanTitle = title.replace(/\*\*/g, '').trim();
            if (cleanTitle) {
              const dedupeKey = `${parsedRange.startPage}::${cleanTitle}`;
              if (!seenKeys.has(dedupeKey)) {
                seenKeys.add(dedupeKey);
                entries.push({
                  id: `parsed-tbl-${i}`,
                  order,
                  category: category || undefined,
                  grade: grade === '—' ? '通用' : grade || undefined,
                  title: cleanTitle,
                  designer: designer || undefined,
                  startPage: parsedRange.startPage,
                  endPage: parsedRange.endPage,
                  pageNote: parsedRange.pageNote,
                  resourceKind: resourceKind || undefined,
                });
              }
            }
          }
        }
      }
      continue;
    }

    // Case 2: Numbered / bulleted lines mentioning "第 X 頁" / "第 X–Y 頁" / "P.X"
    const bulletMatch = line.match(
      /^(?:\d+[.)、]\s*|[-*•]\s*)(?:\*\*)?(?:第\s*(\d+(?:\s*[–\-～~]\s*\d+)?)\s*頁|P\.?\s*(\d+(?:\s*[–\-～~]\s*\d+)?))(?:\*\*)?\s*[：:｜|—\-\s]+(.+)$/i,
    );
    if (bulletMatch) {
      const pageToken = bulletMatch[1] || bulletMatch[2];
      const rawTitle = bulletMatch[3]
        .replace(/\*\*/g, '')
        .replace(/`/g, '')
        .trim();
      const parsedRange = parsePageRangeToken(pageToken);
      if (parsedRange && rawTitle) {
        const dedupeKey = `${parsedRange.startPage}::${rawTitle}`;
        if (!seenKeys.has(dedupeKey)) {
          seenKeys.add(dedupeKey);
          entries.push({
            id: `parsed-line-${i}`,
            title: rawTitle,
            startPage: parsedRange.startPage,
            endPage: parsedRange.endPage,
            pageNote: parsedRange.pageNote,
          });
        }
      }
    }
  }

  return entries.sort((a, b) => a.startPage - b.startPage);
}

export function resolveBookTocMeta(
  resource: TeachingResource | null,
  pdfOutline: PdfOutlineLike[],
): EbookTocBookMeta {
  if (!resource) {
    return {sourceLabel: '目錄', entries: []};
  }

  const normalizedTitle = (resource.title || '').replace(/\s+/g, '');
  const isConstructedResponseBook =
    resource.id === 'res-constructed-response-math-ebook' ||
    normalizedTitle.includes('建構反應題融入數學領域素養教學活動設計');

  if (isConstructedResponseBook) {
    return CONSTRUCTED_RESPONSE_BOOK_META;
  }

  const parsedFromContent = parseTocEntriesFromContent(resource.content);
  if (parsedFromContent.length > 0) {
    return {
      sourceLabel: '導讀章節目錄',
      entries: parsedFromContent,
    };
  }

  if (pdfOutline.length > 0) {
    const mapped: EbookTocEntry[] = pdfOutline
      .filter((node) => node.pageNumber !== null && node.pageNumber > 0)
      .map((node) => ({
        id: node.id,
        title: node.title,
        startPage: node.pageNumber as number,
        pageNote: String(node.pageNumber),
        level: node.level,
      }));
    if (mapped.length > 0) {
      return {
        sourceLabel: 'PDF 書籤大綱',
        entries: mapped,
      };
    }
  }

  return {sourceLabel: '目錄', entries: []};
}

export function findActiveTocEntry(
  entries: EbookTocEntry[],
  pageNumber: number,
  secondPageNumber?: number | null,
): EbookTocEntry | null {
  if (entries.length === 0 || pageNumber <= 0) return null;

  const sorted = [...entries].sort((a, b) => a.startPage - b.startPage);
  const checkPage = (p: number): EbookTocEntry | null => {
    // Prefer exact [startPage, endPage] range match
    for (const entry of sorted) {
      if (
        entry.endPage !== undefined &&
        p >= entry.startPage &&
        p <= entry.endPage
      ) {
        return entry;
      }
    }
    // Otherwise pick the last entry with startPage <= p
    let best: EbookTocEntry | null = null;
    for (const entry of sorted) {
      if (entry.startPage <= p) {
        best = entry;
      } else {
        break;
      }
    }
    return best;
  };

  return (
    checkPage(pageNumber) ||
    (secondPageNumber ? checkPage(secondPageNumber) : null)
  );
}
