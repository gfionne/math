import {TeachingResource} from '../types/journal';

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
  footnote?: string;
}

export interface PdfOutlineLike {
  id: string;
  title: string;
  pageNumber: number | null;
  level: number;
}

export const CONSTRUCTED_RESPONSE_BOOK_META: EbookTocBookMeta = {
  sourceLabel: '篇章結構目錄（20 篇）',
  footnote:
    '註：全書 219 頁已完整對齊原書頁碼（PDF 頁碼＝原書頁碼＋11），涵蓋 00 導覽前言、01～08 探究教學篇、09～18 形成性評量與五年級素養教案，以及 19 版權與臺北市國小數學輔導團名錄。',
  categoryDescriptions: {
    導覽與前言: '封面、序、專文、目次與篇名索引。',
    '探究教學篇（擴展式）':
      '以單一核心問題為起點逐步延伸追問，適合整節或多節課深度概念建構。',
    '探究教學篇（題組式）':
      '以環環相扣的題組任務引導學生逐步深入，聚焦四年級分數表徵與概念理解。',
    形成性評量篇:
      '搭配建構反應題型與五年級素養教案／附件，於課堂即時蒐集學生迷思概念與思考歷程，提供評閱標準與解題舉隅。',
    書末版權與附錄: '全書出版資訊、編撰群與臺北市國民教育輔導團國小數學領域輔導小組名單。',
  },
  crossTopicStrands: [
    {
      id: 'strand-fraction-division',
      label: '分數、除法與比率',
      description:
        '從四年級「兩數相除是分數」、「畫圖表徵分數」、「分數」、「分數為兩整數相除結果」延伸至五年級「比率與百分率」折扣問題',
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
      startPage: 80,
      endPage: 90,
      pageNote: '80～90',
      bookPageNote: '原書 069～079',
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
      endPage: 102,
      pageNote: '91～102',
      bookPageNote: '原書 080～091',
      resourceKind: '題組式探究教案、學習單與資源',
    },
    {
      id: 'cr-09',
      order: '09',
      category: '形成性評量篇',
      grade: '一年級',
      title: '分類整理',
      designer: '林旭霓',
      startPage: 103,
      endPage: 113,
      pageNote: '103～113',
      bookPageNote: '原書 092～102',
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
      pageNote: '169（接170）～182',
      bookPageNote: '原書 158（接159）～171',
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
      resourceKind: '教學活動設計、評量單、檢測結果說明與解題舉隅',
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
      resourceKind: '教學活動設計、評量單、101基測附件',
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
      resourceKind: '教學活動設計、評量單、自編試題附件',
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
      resourceKind: '出版資訊、編撰與輔導團名單',
    },
  ],
};

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
