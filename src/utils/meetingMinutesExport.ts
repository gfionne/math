import {jsPDF} from 'jspdf';
import {
  isTeacherOnLeaveStatus,
  isValidSignatureDataUrl,
  MeetingCheckin,
  MeetingSession,
  normalizeTeacherAttendanceStatus,
} from '../services/meetingCheckinDb';
import {JournalPost} from '../types/journal';
import {formatCategoryDisplay} from './postFormatting';

export interface MeetingMinutesConfig {
  schoolName: string;
  docCategory: string;
  meetingTitle: string;
  academicYear: string;
  meetingDate: string;
  location: string;
  chairperson: string;
  recorder: string;
  attendanceSummary: string;
  leaveSummary: string;
  includeAttachmentSheet: boolean;
  linkedMeeting: MeetingSession | null;
  linkedCheckins: MeetingCheckin[];
}

export type MinutesBlock =
  | {type: 'heading'; level: 2 | 3; text: string}
  | {type: 'paragraph'; text: string}
  | {type: 'bullet'; text: string}
  | {type: 'numbered'; index: string; text: string}
  | {type: 'quote'; text: string}
  | {type: 'table'; headers: string[]; rows: string[][]}
  | {type: 'divider'};

export interface AttendanceSummaryForMinutes {
  total: number;
  presentCount: number;
  leaveCount: number;
  attendanceSummary: string;
  leaveSummary: string;
}

export function summarizeTeacherAttendanceForMinutes(
  checkins: MeetingCheckin[],
): AttendanceSummaryForMinutes {
  if (checkins.length === 0) {
    return {
      total: 0,
      presentCount: 0,
      leaveCount: 0,
      attendanceSummary: '應到：＿＿ 人｜實到：＿＿ 人（如現場紙本簽到）',
      leaveSummary: '無（或請手動填寫公假／事假／病假教師名單）',
    };
  }

  const presentNames: string[] = [];
  const leaveItems: string[] = [];

  for (const rec of checkins) {
    const status = normalizeTeacherAttendanceStatus(rec.attendanceStatus);
    if (isTeacherOnLeaveStatus(status)) {
      const reason = rec.leaveNote.trim();
      leaveItems.push(
        reason ? `${rec.userName}（${status}：${reason}）` : `${rec.userName}（${status}）`,
      );
    } else {
      presentNames.push(rec.userName);
    }
  }

  const presentCount = presentNames.length;
  const leaveCount = leaveItems.length;
  const total = checkins.length;

  const attendanceSummary = `實到 ${presentCount} 人（${presentNames.join('、') || '無'}）｜請假 ${leaveCount} 人｜合計紀錄 ${total} 人`;
  const leaveSummary =
    leaveCount > 0 ? leaveItems.join('；') : '全員出席，無教師請假紀錄。';

  return {
    total,
    presentCount,
    leaveCount,
    attendanceSummary,
    leaveSummary,
  };
}

function decodeHtmlEntities(input: string): string {
  return input
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'");
}

function cleanInlineMarkdown(raw: string): string {
  let s = decodeHtmlEntities(raw);
  // Convert markdown images to descriptive label
  s = s.replace(/!\[([^\]]*)\]\([^)]+\)/g, (_, alt) =>
    alt && alt.trim() ? `[附圖：${alt.trim()}]` : '[附圖]',
  );
  // Convert markdown links [text](url) -> text (url) if url differs
  s = s.replace(/\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g, (_, label, url) => {
    const cleanLabel = label.trim();
    if (!cleanLabel || cleanLabel === url.trim()) return url.trim();
    return `${cleanLabel}（${url.trim()}）`;
  });
  // Strip inline HTML tags cleanly
  s = s.replace(/<br\s*\/?>/gi, ' ').replace(/<[^>]+>/g, '');
  // Strip bold / italic / code / strikethrough markers
  s = s
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/__([^_]+)__/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/~~([^~]+)~~/g, '$1');
  return s.replace(/\s+/g, ' ').trim();
}

function splitMarkdownTableRow(line: string): string[] {
  const trimmed = line.trim().replace(/^\|/, '').replace(/\|$/, '');
  return trimmed.split('|').map((cell) => cleanInlineMarkdown(cell));
}

function isMarkdownTableSeparator(line: string): boolean {
  const trimmed = line.trim();
  if (!trimmed.includes('|') && !trimmed.includes('-')) return false;
  return /^\|?(\s*:?-{2,}:?\s*\|)+\s*:?-{2,}:?\s*\|?$/.test(trimmed);
}

export function parseJournalMarkdownToMinutesBlocks(
  post: JournalPost,
): MinutesBlock[] {
  const raw = (post.content || '').replace(/\r\n/g, '\n').trim();
  if (!raw) {
    return post.summary
      ? [{type: 'paragraph', text: cleanInlineMarkdown(post.summary)}]
      : [];
  }

  // Remove fenced code block wrappers while preserving readable lines
  const sanitized = raw
    .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?>[\s\S]*?<\/style>/gi, '')
    .replace(/```[^\n]*\n([\s\S]*?)```/g, '$1');

  const lines = sanitized.split('\n');
  const blocks: MinutesBlock[] = [];
  let paragraphBuf: string[] = [];

  const flushParagraph = () => {
    if (paragraphBuf.length === 0) return;
    const joined = cleanInlineMarkdown(paragraphBuf.join(' '));
    if (joined) {
      blocks.push({type: 'paragraph', text: joined});
    }
    paragraphBuf = [];
  };

  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();

    if (!trimmed) {
      flushParagraph();
      i++;
      continue;
    }

    // Horizontal rule
    if (/^([-*_]){3,}$/.test(trimmed)) {
      flushParagraph();
      blocks.push({type: 'divider'});
      i++;
      continue;
    }

    // Markdown table detection
    if (
      trimmed.includes('|') &&
      i + 1 < lines.length &&
      isMarkdownTableSeparator(lines[i + 1])
    ) {
      flushParagraph();
      const headers = splitMarkdownTableRow(trimmed);
      i += 2; // skip header + separator
      const rows: string[][] = [];
      while (i < lines.length && lines[i].trim().includes('|')) {
        const rowCells = splitMarkdownTableRow(lines[i]);
        if (rowCells.some(Boolean)) {
          rows.push(rowCells);
        }
        i++;
      }
      if (headers.length > 0) {
        blocks.push({type: 'table', headers, rows});
      }
      continue;
    }

    // Headings
    const headingMatch = trimmed.match(/^(#{1,4})\s+(.+)$/);
    if (headingMatch) {
      flushParagraph();
      const level = headingMatch[1].length <= 2 ? 2 : 3;
      const text = cleanInlineMarkdown(headingMatch[2]);
      if (text) {
        blocks.push({type: 'heading', level, text});
      }
      i++;
      continue;
    }

    // Blockquote
    if (/^>\s?/.test(trimmed)) {
      flushParagraph();
      const quoteLines: string[] = [];
      while (i < lines.length && /^>\s?/.test(lines[i].trim())) {
        quoteLines.push(lines[i].trim().replace(/^>\s?/, ''));
        i++;
      }
      const text = cleanInlineMarkdown(quoteLines.join(' '));
      if (text) {
        blocks.push({type: 'quote', text});
      }
      continue;
    }

    // Bullet list
    const bulletMatch = trimmed.match(/^[-*+•]\s+(.+)$/);
    if (bulletMatch) {
      flushParagraph();
      const text = cleanInlineMarkdown(bulletMatch[1]);
      if (text) {
        blocks.push({type: 'bullet', text});
      }
      i++;
      continue;
    }

    // Ordered list
    const orderedMatch = trimmed.match(/^(\d+[.)、])\s*(.+)$/);
    if (orderedMatch) {
      flushParagraph();
      const text = cleanInlineMarkdown(orderedMatch[2]);
      if (text) {
        blocks.push({
          type: 'numbered',
          index: orderedMatch[1].replace(/[.)、]+$/, ''),
          text,
        });
      }
      i++;
      continue;
    }

    paragraphBuf.push(trimmed);
    i++;
  }

  flushParagraph();
  return blocks;
}

// ============================================================================
// High-DPI A4 Canvas -> jsPDF Meeting Minutes Generator
// ============================================================================

const PAGE_W = 1240;
const PAGE_H = 1754;
const MARGIN_X = 82;
const MARGIN_TOP = 76;
const FOOTER_Y = 1696;
const CONTENT_BOTTOM = 1638;
const CONTENT_W = PAGE_W - MARGIN_X * 2; // 1076

const FONT_FAMILY =
  '"Noto Sans TC", "PingFang TC", "Microsoft JhengHei", "Heiti TC", sans-serif';
const SERIF_FAMILY =
  '"Noto Serif TC", "PMingLiU", "Songti TC", "Noto Sans TC", serif';

function createA4Page(): {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
} {
  const canvas = document.createElement('canvas');
  canvas.width = PAGE_W;
  canvas.height = PAGE_H;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, PAGE_W, PAGE_H);
  return {canvas, ctx};
}

function loadImage(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

function wrapTextUnbounded(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
): string[] {
  const clean = String(text ?? '').replace(/\s+/g, ' ').trim();
  if (!clean) return [''];
  const lines: string[] = [];
  let current = '';
  for (const ch of Array.from(clean)) {
    const next = current + ch;
    if (ctx.measureText(next).width > maxWidth && current.length > 0) {
      lines.push(current);
      current = ch;
    } else {
      current = next;
    }
  }
  if (current) lines.push(current);
  return lines;
}

export async function generateMeetingMinutesPdfBlob(
  post: JournalPost,
  config: MeetingMinutesConfig,
): Promise<Blob> {
  const pages: HTMLCanvasElement[] = [];
  let {canvas, ctx} = createA4Page();
  let y = MARGIN_TOP;

  const ensureSpace = (neededH: number, contHeaderTitle?: string) => {
    if (y + neededH <= CONTENT_BOTTOM) return;
    pages.push(canvas);
    const next = createA4Page();
    canvas = next.canvas;
    ctx = next.ctx;
    y = MARGIN_TOP;

    ctx.fillStyle = '#57534E';
    ctx.font = `600 17px ${FONT_FAMILY}`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText(
      contHeaderTitle || `${config.schoolName} · 會議記錄（續）｜${config.meetingTitle}`,
      MARGIN_X,
      y,
    );
    y += 28;
    ctx.strokeStyle = '#D6D3D1';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(MARGIN_X, y);
    ctx.lineTo(MARGIN_X + CONTENT_W, y);
    ctx.stroke();
    y += 18;
  };

  // 1. Institutional Meeting Minutes Header
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.fillStyle = '#1C1917';
  ctx.font = `700 28px ${SERIF_FAMILY}`;
  ctx.fillText(config.schoolName || '臺北市萬華區西門國民小學', PAGE_W / 2, y);
  y += 40;

  ctx.fillStyle = '#1E3A8A';
  ctx.font = `700 21px ${FONT_FAMILY}`;
  ctx.fillText(
    config.docCategory || '領域教學研究會／教師專業學習社群會議記錄',
    PAGE_W / 2,
    y,
  );
  y += 38;

  // Double horizontal rule under header
  ctx.strokeStyle = '#1E3A8A';
  ctx.lineWidth = 2.2;
  ctx.beginPath();
  ctx.moveTo(MARGIN_X, y);
  ctx.lineTo(MARGIN_X + CONTENT_W, y);
  ctx.stroke();
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(MARGIN_X, y + 5);
  ctx.lineTo(MARGIN_X + CONTENT_W, y + 5);
  ctx.stroke();
  y += 22;

  // 2. Formal Meeting Info Table
  const drawMetaFullRow = (
    label: string,
    value: string,
    tintBg = false,
  ) => {
    const labelW = 165;
    const valW = CONTENT_W - labelW;
    ctx.font = `500 18px ${FONT_FAMILY}`;
    const lines = wrapTextUnbounded(ctx, value || '—', valW - 28);
    const rowH = Math.max(46, lines.length * 26 + 20);
    ensureSpace(rowH);

    ctx.fillStyle = '#F5F2EB';
    ctx.fillRect(MARGIN_X, y, labelW, rowH);
    ctx.fillStyle = tintBg ? '#FFFBEB' : '#FFFFFF';
    ctx.fillRect(MARGIN_X + labelW, y, valW, rowH);

    ctx.strokeStyle = '#A8A29E';
    ctx.lineWidth = 1.2;
    ctx.strokeRect(MARGIN_X, y, CONTENT_W, rowH);
    ctx.beginPath();
    ctx.moveTo(MARGIN_X + labelW, y);
    ctx.lineTo(MARGIN_X + labelW, y + rowH);
    ctx.stroke();

    ctx.fillStyle = '#1C1917';
    ctx.font = `700 18px ${FONT_FAMILY}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, MARGIN_X + labelW / 2, y + rowH / 2);

    ctx.textAlign = 'left';
    ctx.font = `500 18px ${FONT_FAMILY}`;
    const startY = y + rowH / 2 - ((lines.length - 1) * 26) / 2;
    lines.forEach((line, idx) => {
      ctx.fillText(line, MARGIN_X + labelW + 14, startY + idx * 26);
    });
    y += rowH;
  };

  const drawMetaPairRow = (
    label1: string,
    val1: string,
    label2: string,
    val2: string,
  ) => {
    const halfW = CONTENT_W / 2;
    const labelW = 165;
    const valW = halfW - labelW;
    ctx.font = `500 18px ${FONT_FAMILY}`;
    const lines1 = wrapTextUnbounded(ctx, val1 || '—', valW - 24);
    const lines2 = wrapTextUnbounded(ctx, val2 || '—', valW - 24);
    const maxLines = Math.max(lines1.length, lines2.length);
    const rowH = Math.max(46, maxLines * 26 + 20);
    ensureSpace(rowH);

    ctx.fillStyle = '#F5F2EB';
    ctx.fillRect(MARGIN_X, y, labelW, rowH);
    ctx.fillRect(MARGIN_X + halfW, y, labelW, rowH);
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(MARGIN_X + labelW, y, valW, rowH);
    ctx.fillRect(MARGIN_X + halfW + labelW, y, valW, rowH);

    ctx.strokeStyle = '#A8A29E';
    ctx.lineWidth = 1.2;
    ctx.strokeRect(MARGIN_X, y, CONTENT_W, rowH);
    [
      MARGIN_X + labelW,
      MARGIN_X + halfW,
      MARGIN_X + halfW + labelW,
    ].forEach((xPos) => {
      ctx.beginPath();
      ctx.moveTo(xPos, y);
      ctx.lineTo(xPos, y + rowH);
      ctx.stroke();
    });

    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#1C1917';
    ctx.font = `700 18px ${FONT_FAMILY}`;
    ctx.textAlign = 'center';
    ctx.fillText(label1, MARGIN_X + labelW / 2, y + rowH / 2);
    ctx.fillText(label2, MARGIN_X + halfW + labelW / 2, y + rowH / 2);

    ctx.textAlign = 'left';
    ctx.font = `500 18px ${FONT_FAMILY}`;
    const startY1 = y + rowH / 2 - ((lines1.length - 1) * 26) / 2;
    lines1.forEach((line, idx) => {
      ctx.fillText(line, MARGIN_X + labelW + 12, startY1 + idx * 26);
    });
    const startY2 = y + rowH / 2 - ((lines2.length - 1) * 26) / 2;
    lines2.forEach((line, idx) => {
      ctx.fillText(line, MARGIN_X + halfW + labelW + 12, startY2 + idx * 26);
    });
    y += rowH;
  };

  drawMetaFullRow('會議名稱', config.meetingTitle || post.title);
  drawMetaPairRow(
    '學年度',
    config.academicYear || post.academicYear,
    '會議時間',
    config.meetingDate || post.publishedAt,
  );
  drawMetaPairRow(
    '會議地點',
    config.location || '本校會議室',
    '主席 / 召集人',
    config.chairperson || '領域召集人',
  );
  drawMetaPairRow(
    '會議紀錄',
    config.recorder || post.author || '紀錄教師',
    '專題分類',
    formatCategoryDisplay(post.category),
  );
  drawMetaFullRow('出席統計', config.attendanceSummary);
  if (config.leaveSummary.trim()) {
    const hasExplicitLeaves = config.linkedCheckins.some((c) =>
      isTeacherOnLeaveStatus(normalizeTeacherAttendanceStatus(c.attendanceStatus)),
    );
    drawMetaFullRow('請假明細', config.leaveSummary, hasExplicitLeaves);
  }

  y += 28;

  const drawSectionBanner = (title: string) => {
    ensureSpace(58);
    ctx.fillStyle = '#F5F2EB';
    ctx.fillRect(MARGIN_X, y, CONTENT_W, 40);
    ctx.fillStyle = '#1E3A8A';
    ctx.fillRect(MARGIN_X, y, 6, 40);
    ctx.strokeStyle = '#D6D3D1';
    ctx.lineWidth = 1;
    ctx.strokeRect(MARGIN_X, y, CONTENT_W, 40);

    ctx.fillStyle = '#1C1917';
    ctx.font = `700 20px ${FONT_FAMILY}`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(title, MARGIN_X + 18, y + 20);
    y += 54;
  };

  // 3. Section I: Summary
  if (post.summary && post.summary.trim()) {
    drawSectionBanner('壹、會議摘要與討論緣起');
    ctx.font = `400 19px ${FONT_FAMILY}`;
    ctx.fillStyle = '#292524';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    const sumLines = wrapTextUnbounded(
      ctx,
      cleanInlineMarkdown(post.summary),
      CONTENT_W - 12,
    );
    for (const line of sumLines) {
      ensureSpace(32);
      ctx.fillText(line, MARGIN_X + 6, y);
      y += 30;
    }
    y += 18;
  }

  // 4. Section II: Content Blocks
  drawSectionBanner(
    post.summary && post.summary.trim()
      ? '貳、會議內容與決議事項'
      : '壹、會議內容與決議事項',
  );

  const blocks = parseJournalMarkdownToMinutesBlocks(post);
  for (const block of blocks) {
    if (block.type === 'divider') {
      ensureSpace(22);
      ctx.strokeStyle = '#E7E5E4';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(MARGIN_X, y + 8);
      ctx.lineTo(MARGIN_X + CONTENT_W, y + 8);
      ctx.stroke();
      y += 20;
      continue;
    }

    if (block.type === 'heading') {
      const isH2 = block.level === 2;
      ctx.font = `700 ${isH2 ? 22 : 19}px ${FONT_FAMILY}`;
      const lines = wrapTextUnbounded(ctx, block.text, CONTENT_W - 8);
      ensureSpace(lines.length * 32 + 18);
      y += 8;
      ctx.fillStyle = isH2 ? '#1E3A8A' : '#1C1917';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      for (const line of lines) {
        ctx.fillText(line, MARGIN_X + 4, y);
        y += 30;
      }
      y += 8;
      continue;
    }

    if (block.type === 'paragraph') {
      ctx.font = `400 19px ${FONT_FAMILY}`;
      ctx.fillStyle = '#292524';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      const lines = wrapTextUnbounded(ctx, block.text, CONTENT_W - 12);
      for (const line of lines) {
        ensureSpace(32);
        ctx.fillText(line, MARGIN_X + 6, y);
        y += 30;
      }
      y += 12;
      continue;
    }

    if (block.type === 'bullet' || block.type === 'numbered') {
      const marker =
        block.type === 'bullet' ? '•' : `${block.index}.`;
      const indent = 36;
      ctx.font = `400 19px ${FONT_FAMILY}`;
      const lines = wrapTextUnbounded(
        ctx,
        block.text,
        CONTENT_W - indent - 8,
      );
      ensureSpace(Math.min(lines.length, 2) * 30 + 8);
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      ctx.fillStyle = '#1E3A8A';
      ctx.font = `700 19px ${FONT_FAMILY}`;
      ctx.fillText(marker, MARGIN_X + 10, y);

      ctx.fillStyle = '#292524';
      ctx.font = `400 19px ${FONT_FAMILY}`;
      lines.forEach((line, idx) => {
        if (idx > 0) ensureSpace(30);
        ctx.fillText(line, MARGIN_X + indent, y);
        y += 29;
      });
      y += 6;
      continue;
    }

    if (block.type === 'quote') {
      ctx.font = `500 18px ${FONT_FAMILY}`;
      const lines = wrapTextUnbounded(ctx, block.text, CONTENT_W - 44);
      const boxH = lines.length * 28 + 22;
      ensureSpace(boxH + 10);
      ctx.fillStyle = '#FAF8F5';
      ctx.fillRect(MARGIN_X + 8, y, CONTENT_W - 16, boxH);
      ctx.strokeStyle = '#D6D3D1';
      ctx.lineWidth = 1;
      ctx.strokeRect(MARGIN_X + 8, y, CONTENT_W - 16, boxH);

      ctx.fillStyle = '#44403C';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      let qy = y + 12;
      for (const line of lines) {
        ctx.fillText(line, MARGIN_X + 24, qy);
        qy += 28;
      }
      y += boxH + 12;
      continue;
    }

    if (block.type === 'table') {
      const colCount = Math.max(1, block.headers.length);
      const colW = CONTENT_W / colCount;
      const drawTableRow = (cells: string[], isHeader: boolean) => {
        ctx.font = `${isHeader ? '700' : '400'} 17px ${FONT_FAMILY}`;
        const cellLinesList = Array.from({length: colCount}, (_, cIdx) =>
          wrapTextUnbounded(ctx, cells[cIdx] || '', colW - 20),
        );
        const maxCellLines = Math.max(
          1,
          ...cellLinesList.map((arr) => arr.length),
        );
        const rH = Math.max(40, maxCellLines * 24 + 16);
        ensureSpace(rH);

        ctx.fillStyle = isHeader ? '#F5F2EB' : '#FFFFFF';
        ctx.fillRect(MARGIN_X, y, CONTENT_W, rH);
        ctx.strokeStyle = '#D6D3D1';
        ctx.lineWidth = 1.2;
        ctx.strokeRect(MARGIN_X, y, CONTENT_W, rH);

        ctx.fillStyle = '#1C1917';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'top';

        for (let c = 0; c < colCount; c++) {
          const cx = MARGIN_X + c * colW;
          if (c > 0) {
            ctx.beginPath();
            ctx.moveTo(cx, y);
            ctx.lineTo(cx, y + rH);
            ctx.stroke();
          }
          const lines = cellLinesList[c];
          lines.forEach((ln, lIdx) => {
            ctx.fillText(ln, cx + 10, y + 10 + lIdx * 24);
          });
        }
        y += rH;
      };

      drawTableRow(block.headers, true);
      for (const row of block.rows) {
        drawTableRow(row, false);
      }
      y += 14;
    }
  }

  // 5. Optional Attachment Link Section
  if (post.embedUrl) {
    const labelTitle =
      post.summary && post.summary.trim()
        ? '參、相關附件與參考連結'
        : '貳、相關附件與參考連結';
    drawSectionBanner(labelTitle);
    const linkText = `${post.embedLabel || '雲端附件 / 教材資料'}：${post.embedUrl}`;
    ctx.font = `400 17px ${FONT_FAMILY}`;
    ctx.fillStyle = '#1E3A8A';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    const linkLines = wrapTextUnbounded(ctx, linkText, CONTENT_W - 12);
    for (const line of linkLines) {
      ensureSpace(28);
      ctx.fillText(line, MARGIN_X + 6, y);
      y += 26;
    }
    y += 12;
  }

  // 6. Official Minutes Approval Stamp Block (紀錄、教學組長、教務主任、校長)
  const stampHeaderH = 40;
  const stampBoxH = 104;
  const stampTotalH = stampHeaderH + stampBoxH;
  ensureSpace(stampTotalH + 28);
  y += 22;

  const stampRoles = ['紀錄', '教學組長', '教務主任', '校長'] as const;
  const colW = CONTENT_W / stampRoles.length;

  ctx.fillStyle = '#F5F2EB';
  ctx.fillRect(MARGIN_X, y, CONTENT_W, stampHeaderH);
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(MARGIN_X, y + stampHeaderH, CONTENT_W, stampBoxH);
  ctx.strokeStyle = '#78716C';
  ctx.lineWidth = 1.5;
  ctx.strokeRect(MARGIN_X, y, CONTENT_W, stampTotalH);

  ctx.beginPath();
  ctx.moveTo(MARGIN_X, y + stampHeaderH);
  ctx.lineTo(MARGIN_X + CONTENT_W, y + stampHeaderH);
  ctx.stroke();

  ctx.font = `700 19px ${FONT_FAMILY}`;
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'center';
  stampRoles.forEach((role, idx) => {
    const colX = MARGIN_X + idx * colW;
    if (idx > 0) {
      ctx.beginPath();
      ctx.moveTo(colX, y);
      ctx.lineTo(colX, y + stampTotalH);
      ctx.stroke();
    }
    ctx.fillStyle = '#1C1917';
    ctx.fillText(role, colX + colW / 2, y + stampHeaderH / 2);
  });
  ctx.textAlign = 'left';

  // 7. Optional Attached Teacher Attendance & Leave Roster Page(s)
  if (config.includeAttachmentSheet && config.linkedMeeting) {
    pages.push(canvas);
    const attPage = createA4Page();
    canvas = attPage.canvas;
    ctx = attPage.ctx;
    y = MARGIN_TOP;

    const mtg = config.linkedMeeting;
    const checkins = config.linkedCheckins;
    const loadedSigs = await Promise.all(
      checkins.map((rec) =>
        isValidSignatureDataUrl(rec.signatureDataUrl)
          ? loadImage(rec.signatureDataUrl)
          : Promise.resolve(null),
      ),
    );

    ctx.fillStyle = '#1E3A8A';
    ctx.font = `700 19px ${FONT_FAMILY}`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText(
      `附件：${config.schoolName} 教師出席與請假簽到明細表`,
      MARGIN_X,
      y,
    );
    y += 32;

    ctx.fillStyle = '#1C1917';
    ctx.font = `700 26px ${FONT_FAMILY}`;
    ctx.fillText(mtg.title || config.meetingTitle, MARGIN_X, y);
    y += 40;

    const attCols = [52, 160, 200, 240, 234, 190]; // total = 1076
    const drawAttHeader = () => {
      const h = 44;
      ctx.fillStyle = '#F5F2EB';
      ctx.fillRect(MARGIN_X, y, CONTENT_W, h);
      ctx.strokeStyle = '#A8A29E';
      ctx.lineWidth = 1.4;
      ctx.strokeRect(MARGIN_X, y, CONTENT_W, h);

      const titles = [
        '#',
        '教師姓名',
        '校內帳號信箱',
        '狀態 / 職務與請假備註',
        '親筆簽名 / 請假別',
        '簽到時間',
      ];
      ctx.fillStyle = '#1C1917';
      ctx.font = `700 18px ${FONT_FAMILY}`;
      ctx.textBaseline = 'middle';
      let cx = MARGIN_X;
      titles.forEach((title, idx) => {
        if (idx > 0) {
          ctx.beginPath();
          ctx.moveTo(cx, y);
          ctx.lineTo(cx, y + h);
          ctx.stroke();
        }
        if (idx === 0 || idx === 4) {
          ctx.textAlign = 'center';
          ctx.fillText(title, cx + attCols[idx] / 2, y + h / 2);
        } else {
          ctx.textAlign = 'left';
          ctx.fillText(title, cx + 10, y + h / 2);
        }
        cx += attCols[idx];
      });
      ctx.textAlign = 'left';
      y += h;
    };

    drawAttHeader();

    const rowH = 80;
    for (let idx = 0; idx < checkins.length; idx++) {
      if (y + rowH > CONTENT_BOTTOM) {
        pages.push(canvas);
        const nextAtt = createA4Page();
        canvas = nextAtt.canvas;
        ctx = nextAtt.ctx;
        y = MARGIN_TOP;
        ctx.fillStyle = '#57534E';
        ctx.font = `600 17px ${FONT_FAMILY}`;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'top';
        ctx.fillText(`附件：教師出席與請假簽到明細表（續）｜${mtg.title}`, MARGIN_X, y);
        y += 32;
        drawAttHeader();
      }

      const rec = checkins[idx];
      const sigImg = loadedSigs[idx];
      const status = normalizeTeacherAttendanceStatus(rec.attendanceStatus);
      const isLeave = isTeacherOnLeaveStatus(status);
      const noteText =
        [status, rec.roleOrNote.trim(), rec.leaveNote.trim()]
          .filter(Boolean)
          .join('｜') || '—';
      const dt = new Date(rec.checkedInAtMs).toLocaleString('zh-TW', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      });

      ctx.fillStyle = isLeave ? '#FFFBEB' : '#FFFFFF';
      ctx.fillRect(MARGIN_X, y, CONTENT_W, rowH);
      ctx.strokeStyle = '#D6D3D1';
      ctx.lineWidth = 1.2;
      ctx.strokeRect(MARGIN_X, y, CONTENT_W, rowH);

      let cx = MARGIN_X;
      for (let c = 1; c < attCols.length; c++) {
        cx += attCols[c - 1];
        ctx.beginPath();
        ctx.moveTo(cx, y);
        ctx.lineTo(cx, y + rowH);
        ctx.stroke();
      }

      cx = MARGIN_X;
      ctx.textBaseline = 'middle';
      ctx.textAlign = 'center';
      ctx.fillStyle = '#57534E';
      ctx.font = `600 18px ${FONT_FAMILY}`;
      ctx.fillText(String(idx + 1), cx + attCols[0] / 2, y + rowH / 2);

      cx += attCols[0];
      ctx.textAlign = 'left';
      ctx.fillStyle = '#1C1917';
      ctx.font = `700 18px ${FONT_FAMILY}`;
      ctx.fillText(rec.userName, cx + 10, y + rowH / 2);

      cx += attCols[1];
      ctx.fillStyle = '#57534E';
      ctx.font = `400 15px ${FONT_FAMILY}`;
      const emailLines = wrapTextUnbounded(
        ctx,
        rec.userEmail || '（管理員代登）',
        attCols[2] - 18,
      ).slice(0, 2);
      const eStart = y + rowH / 2 - ((emailLines.length - 1) * 20) / 2;
      emailLines.forEach((ln, i) => ctx.fillText(ln, cx + 9, eStart + i * 20));

      cx += attCols[2];
      ctx.fillStyle = '#292524';
      ctx.font = `400 16px ${FONT_FAMILY}`;
      const nLines = wrapTextUnbounded(ctx, noteText, attCols[3] - 18).slice(0, 2);
      const nStart = y + rowH / 2 - ((nLines.length - 1) * 21) / 2;
      nLines.forEach((ln, i) => ctx.fillText(ln, cx + 9, nStart + i * 21));

      cx += attCols[3];
      if (sigImg) {
        const bw = attCols[4] - 24;
        const bh = rowH - 16;
        const scale = Math.min(bw / sigImg.width, bh / sigImg.height, 1);
        const dw = sigImg.width * scale;
        const dh = sigImg.height * scale;
        ctx.drawImage(
          sigImg,
          cx + (attCols[4] - dw) / 2,
          y + (rowH - dh) / 2,
          dw,
          dh,
        );
      } else if (isLeave) {
        ctx.fillStyle = '#92400E';
        ctx.font = `700 16px ${FONT_FAMILY}`;
        ctx.textAlign = 'center';
        ctx.fillText(`請假：${status}`, cx + attCols[4] / 2, y + rowH / 2);
        ctx.textAlign = 'left';
      } else {
        ctx.fillStyle = '#A8A29E';
        ctx.font = `400 15px ${FONT_FAMILY}`;
        ctx.textAlign = 'center';
        ctx.fillText('（未附簽名）', cx + attCols[4] / 2, y + rowH / 2);
        ctx.textAlign = 'left';
      }

      cx += attCols[4];
      ctx.fillStyle = '#44403C';
      ctx.font = `400 15px ${FONT_FAMILY}`;
      const tLines = wrapTextUnbounded(ctx, dt, attCols[5] - 18).slice(0, 2);
      const tStart = y + rowH / 2 - ((tLines.length - 1) * 20) / 2;
      tLines.forEach((ln, i) => ctx.fillText(ln, cx + 9, tStart + i * 20));

      y += rowH;
    }

    // Approval Stamp on Attachment Sheet too (教學組長、教務主任、校長)
    const attStampH = 140;
    if (y + attStampH + 24 > CONTENT_BOTTOM) {
      pages.push(canvas);
      const nextAtt = createA4Page();
      canvas = nextAtt.canvas;
      ctx = nextAtt.ctx;
      y = MARGIN_TOP;
    } else {
      y += 24;
    }
    const attRoles = ['教學組長', '教務主任', '校長'] as const;
    const attColW = CONTENT_W / attRoles.length;
    ctx.fillStyle = '#F5F2EB';
    ctx.fillRect(MARGIN_X, y, CONTENT_W, 38);
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(MARGIN_X, y + 38, CONTENT_W, 100);
    ctx.strokeStyle = '#78716C';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(MARGIN_X, y, CONTENT_W, 138);
    ctx.beginPath();
    ctx.moveTo(MARGIN_X, y + 38);
    ctx.lineTo(MARGIN_X + CONTENT_W, y + 38);
    ctx.stroke();
    ctx.font = `700 19px ${FONT_FAMILY}`;
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'center';
    attRoles.forEach((role, idx) => {
      const colX = MARGIN_X + idx * attColW;
      if (idx > 0) {
        ctx.beginPath();
        ctx.moveTo(colX, y);
        ctx.lineTo(colX, y + 138);
        ctx.stroke();
      }
      ctx.fillStyle = '#1C1917';
      ctx.fillText(role, colX + attColW / 2, y + 19);
    });
    ctx.textAlign = 'left';
  }

  pages.push(canvas);

  // Stamp page footers
  const exportTime = new Date().toLocaleString('zh-TW', {hour12: false});
  const totalPages = pages.length;
  pages.forEach((pageCanvas, idx) => {
    const pCtx = pageCanvas.getContext('2d')!;
    pCtx.fillStyle = '#78716C';
    pCtx.font = `400 16px ${FONT_FAMILY}`;
    pCtx.textBaseline = 'middle';
    pCtx.textAlign = 'left';
    pCtx.fillText(`會議記錄產製時間：${exportTime}`, MARGIN_X, FOOTER_Y);
    pCtx.textAlign = 'right';
    pCtx.fillText(`第 ${idx + 1} / ${totalPages} 頁`, PAGE_W - MARGIN_X, FOOTER_Y);
  });

  const pdf = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
    compress: true,
  });

  pages.forEach((pageCanvas, idx) => {
    if (idx > 0) pdf.addPage();
    const imgData = pageCanvas.toDataURL('image/jpeg', 0.92);
    pdf.addImage(imgData, 'JPEG', 0, 0, 210, 297, undefined, 'FAST');
  });

  return pdf.output('blob');
}

// ============================================================================
// Standalone Printable HTML & Word (.doc) Export
// ============================================================================

function escapeHtml(raw: string): string {
  return String(raw ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function buildPrintableMeetingMinutesHtml(
  post: JournalPost,
  config: MeetingMinutesConfig,
  options?: {forWord?: boolean},
): string {
  const forWord = Boolean(options?.forWord);
  const blocks = parseJournalMarkdownToMinutesBlocks(post);

  const renderBlocksHtml = () => {
    const parts: string[] = [];
    let i = 0;
    while (i < blocks.length) {
      const b = blocks[i];
      if (b.type === 'bullet') {
        const items: string[] = [];
        while (i < blocks.length && blocks[i].type === 'bullet') {
          items.push(`<li>${escapeHtml((blocks[i] as {type: 'bullet'; text: string}).text)}</li>`);
          i++;
        }
        parts.push(`<ul>${items.join('')}</ul>`);
        continue;
      }
      if (b.type === 'numbered') {
        const items: string[] = [];
        while (i < blocks.length && blocks[i].type === 'numbered') {
          items.push(`<li>${escapeHtml((blocks[i] as {type: 'numbered'; text: string}).text)}</li>`);
          i++;
        }
        parts.push(`<ol>${items.join('')}</ol>`);
        continue;
      }
      if (b.type === 'heading') {
        parts.push(
          b.level === 2
            ? `<h3 class="sec-h2">${escapeHtml(b.text)}</h3>`
            : `<h4 class="sec-h3">${escapeHtml(b.text)}</h4>`,
        );
      } else if (b.type === 'paragraph') {
        parts.push(`<p>${escapeHtml(b.text)}</p>`);
      } else if (b.type === 'quote') {
        parts.push(`<blockquote>${escapeHtml(b.text)}</blockquote>`);
      } else if (b.type === 'divider') {
        parts.push(`<hr class="sec-hr" />`);
      } else if (b.type === 'table') {
        const ths = b.headers.map((h) => `<th>${escapeHtml(h)}</th>`).join('');
        const trs = b.rows
          .map(
            (r) =>
              `<tr>${b.headers
                .map((_, cIdx) => `<td>${escapeHtml(r[cIdx] || '')}</td>`)
                .join('')}</tr>`,
          )
          .join('');
        parts.push(
          `<table class="content-table"><thead><tr>${ths}</tr></thead><tbody>${trs}</tbody></table>`,
        );
      }
      i++;
    }
    return parts.join('\n');
  };

  const summaryHtml =
    post.summary && post.summary.trim()
      ? `<div class="section-banner">壹、會議摘要與討論緣起</div><p>${escapeHtml(cleanInlineMarkdown(post.summary))}</p>`
      : '';

  const bodyBanner =
    post.summary && post.summary.trim()
      ? '貳、會議內容與決議事項'
      : '壹、會議內容與決議事項';

  const embedHtml = post.embedUrl
    ? `<div class="section-banner">${
        post.summary && post.summary.trim()
          ? '參、相關附件與參考連結'
          : '貳、相關附件與參考連結'
      }</div><p>${escapeHtml(post.embedLabel || '雲端附件 / 教材資料')}：${escapeHtml(post.embedUrl)}</p>`
    : '';

  const attachmentHtml =
    config.includeAttachmentSheet && config.linkedMeeting
      ? (() => {
          const rows = config.linkedCheckins
            .map((rec, idx) => {
              const status = normalizeTeacherAttendanceStatus(
                rec.attendanceStatus,
              );
              const isLeave = isTeacherOnLeaveStatus(status);
              const noteStr = [status, rec.roleOrNote, rec.leaveNote]
                .filter((x) => Boolean(x && x.trim()))
                .join('｜');
              const dt = new Date(rec.checkedInAtMs).toLocaleString('zh-TW', {
                year: 'numeric',
                month: '2-digit',
                day: '2-digit',
                hour: '2-digit',
                minute: '2-digit',
                hour12: false,
              });
              const sigCell = isValidSignatureDataUrl(rec.signatureDataUrl)
                ? `<img src="${rec.signatureDataUrl}" alt="${escapeHtml(rec.userName)}" class="sig-img" />`
                : isLeave
                  ? `<span class="leave-badge">請假：${escapeHtml(status)}</span>`
                  : '<span class="muted">（未附簽名）</span>';
              return `<tr class="${isLeave ? 'leave-row' : ''}">
                <td class="center">${idx + 1}</td>
                <td><strong>${escapeHtml(rec.userName)}</strong></td>
                <td class="small">${escapeHtml(rec.userEmail || '（管理員代登）')}</td>
                <td>${escapeHtml(noteStr || '—')}</td>
                <td class="center">${sigCell}</td>
                <td class="small">${escapeHtml(dt)}</td>
              </tr>`;
            })
            .join('\n');

          return `
          <div style="page-break-before: always; margin-top: 28px;">
            <div class="school-sub" style="text-align:left;">附件：教師出席與請假簽到明細表</div>
            <h2 style="margin:4px 0 12px; font-size:18px;">${escapeHtml(config.linkedMeeting.title || config.meetingTitle)}</h2>
            <table class="content-table">
              <thead>
                <tr>
                  <th class="center" style="width:36px;">#</th>
                  <th style="width:100px;">教師姓名</th>
                  <th style="width:160px;">校內帳號信箱</th>
                  <th>狀態 / 職務與請假備註</th>
                  <th class="center" style="width:140px;">親筆簽名 / 請假別</th>
                  <th style="width:115px;">簽到時間</th>
                </tr>
              </thead>
              <tbody>${rows}</tbody>
            </table>
            <table class="approval-table" style="margin-top:20px;">
              <thead>
                <tr><th>教學組長</th><th>教務主任</th><th>校長</th></tr>
              </thead>
              <tbody>
                <tr><td class="seal"></td><td class="seal"></td><td class="seal"></td></tr>
              </tbody>
            </table>
          </div>`;
        })()
      : '';

  const htmlOpen = forWord
    ? `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40">`
    : `<html lang="zh-Hant">`;

  return `<!DOCTYPE html>
${htmlOpen}
<head>
  <meta charset="UTF-8" />
  <title>會議記錄｜${escapeHtml(config.meetingTitle)}</title>
  <style>
    @page { size: A4 portrait; margin: 16mm; }
    * { box-sizing: border-box; }
    body {
      font-family: "Noto Sans TC", "PingFang TC", "Microsoft JhengHei", "PMingLiU", sans-serif;
      color: #1c1917;
      background: ${forWord ? '#ffffff' : '#f5f5f4'};
      margin: 0;
      padding: ${forWord ? '0' : '20px'};
      line-height: 1.7;
      font-size: 13px;
    }
    .toolbar {
      max-width: 860px;
      margin: 0 auto 14px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      background: #ffffff;
      border: 1px solid #d6d3d1;
      border-radius: 10px;
      padding: 10px 16px;
    }
    .toolbar-btn {
      background: #1e3a8a;
      color: #ffffff;
      border: none;
      border-radius: 8px;
      padding: 8px 16px;
      font-size: 13px;
      font-weight: 600;
      cursor: pointer;
    }
    .sheet {
      max-width: 860px;
      margin: 0 auto;
      background: #ffffff;
      border: ${forWord ? 'none' : '1px solid #d6d3d1'};
      border-radius: ${forWord ? '0' : '10px'};
      padding: ${forWord ? '0' : '28px 34px'};
    }
    .school-title {
      text-align: center;
      font-size: 20px;
      font-weight: 700;
      color: #1c1917;
      letter-spacing: 0.06em;
    }
    .school-sub {
      text-align: center;
      font-size: 14px;
      font-weight: 700;
      color: #1e3a8a;
      margin-top: 4px;
      margin-bottom: 12px;
    }
    .header-line {
      border-top: 2px solid #1e3a8a;
      border-bottom: 1px solid #1e3a8a;
      height: 4px;
      margin-bottom: 16px;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 16px;
      font-size: 12.5px;
    }
    th, td {
      border: 1px solid #a8a29e;
      padding: 7px 10px;
      vertical-align: middle;
    }
    .meta-table td.label {
      width: 115px;
      background: #f5f2eb;
      font-weight: 700;
      text-align: center;
      color: #1c1917;
    }
    .meta-table tr.leave-highlight td.val {
      background: #fffbeb;
    }
    .section-banner {
      background: #f5f2eb;
      border: 1px solid #d6d3d1;
      border-left: 5px solid #1e3a8a;
      padding: 6px 12px;
      font-weight: 700;
      font-size: 14px;
      color: #1c1917;
      margin: 18px 0 10px;
    }
    h3.sec-h2 { font-size: 15px; color: #1e3a8a; margin: 14px 0 6px; }
    h4.sec-h3 { font-size: 13.5px; color: #1c1917; margin: 10px 0 4px; }
    p { margin: 0 0 8px; }
    ul, ol { margin: 4px 0 10px; padding-left: 22px; }
    li { margin-bottom: 4px; }
    blockquote {
      margin: 10px 0;
      padding: 8px 14px;
      background: #faf8f5;
      border: 1px solid #d6d3d1;
      color: #44403c;
    }
    .content-table th {
      background: #f5f2eb;
      font-weight: 700;
      text-align: left;
    }
    .leave-row { background: #fffbeb; }
    .center { text-align: center; }
    .small { font-size: 11px; color: #57534e; }
    .sig-img { max-width: 125px; max-height: 46px; object-fit: contain; }
    .leave-badge {
      display: inline-block;
      padding: 2px 6px;
      font-size: 11px;
      font-weight: 700;
      color: #92400e;
      background: #fef3c7;
      border: 1px solid #fcd34d;
    }
    .muted { color: #a8a29e; font-size: 11px; }
    .approval-table {
      margin-top: 24px;
      break-inside: avoid;
      page-break-inside: avoid;
    }
    .approval-table th {
      width: 25%;
      background: #f5f2eb;
      text-align: center;
      font-weight: 700;
      padding: 7px 10px;
    }
    .approval-table td.seal {
      height: 76px;
      background: #ffffff;
    }
    @media print {
      body { background: #ffffff; padding: 0; }
      .toolbar { display: none; }
      .sheet { border: none; border-radius: 0; padding: 0; max-width: none; }
    }
  </style>
</head>
<body>
  ${
    forWord
      ? ''
      : `<div class="toolbar">
    <span style="font-size:13px;color:#44403c;">${escapeHtml(config.schoolName)} · 正式會議記錄格式（可直接列印或存為 PDF）</span>
    <button type="button" class="toolbar-btn" onclick="window.print()">列印 / 另存為 PDF</button>
  </div>`
  }
  <div class="sheet">
    <div class="school-title">${escapeHtml(config.schoolName)}</div>
    <div class="school-sub">${escapeHtml(config.docCategory)}</div>
    <div class="header-line"></div>

    <table class="meta-table">
      <tbody>
        <tr>
          <td class="label">會議名稱</td>
          <td colspan="3"><strong>${escapeHtml(config.meetingTitle)}</strong></td>
        </tr>
        <tr>
          <td class="label">學年度</td>
          <td>${escapeHtml(config.academicYear)}</td>
          <td class="label">會議時間</td>
          <td>${escapeHtml(config.meetingDate)}</td>
        </tr>
        <tr>
          <td class="label">會議地點</td>
          <td>${escapeHtml(config.location)}</td>
          <td class="label">主席 / 召集人</td>
          <td>${escapeHtml(config.chairperson)}</td>
        </tr>
        <tr>
          <td class="label">會議紀錄</td>
          <td>${escapeHtml(config.recorder)}</td>
          <td class="label">專題分類</td>
          <td>${escapeHtml(formatCategoryDisplay(post.category))}</td>
        </tr>
        <tr>
          <td class="label">出席統計</td>
          <td colspan="3">${escapeHtml(config.attendanceSummary)}</td>
        </tr>
        ${
          config.leaveSummary.trim()
            ? `<tr class="${
                config.linkedCheckins.some((c) =>
                  isTeacherOnLeaveStatus(
                    normalizeTeacherAttendanceStatus(c.attendanceStatus),
                  ),
                )
                  ? 'leave-highlight'
                  : ''
              }">
          <td class="label">請假明細</td>
          <td class="val" colspan="3">${escapeHtml(config.leaveSummary)}</td>
        </tr>`
            : ''
        }
      </tbody>
    </table>

    ${summaryHtml}
    <div class="section-banner">${escapeHtml(bodyBanner)}</div>
    ${renderBlocksHtml()}
    ${embedHtml}

    <table class="approval-table">
      <thead>
        <tr>
          <th>紀錄</th>
          <th>教學組長</th>
          <th>教務主任</th>
          <th>校長</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td class="seal"></td>
          <td class="seal"></td>
          <td class="seal"></td>
          <td class="seal"></td>
        </tr>
      </tbody>
    </table>

    ${attachmentHtml}
  </div>
</body>
</html>`;
}
