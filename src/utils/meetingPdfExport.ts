import {jsPDF} from 'jspdf';
import {
  isValidSignatureDataUrl,
  MeetingCheckin,
  MeetingSession,
  ParentCheckin,
} from '../services/meetingCheckinDb';

const PAGE_W = 1240;
const PAGE_H = 1754;
const MARGIN_X = 72;
const MARGIN_TOP = 72;
const FOOTER_Y = 1696;
const CONTENT_BOTTOM = 1645;
const CONTENT_W = PAGE_W - MARGIN_X * 2; // 1096

const COL_WIDTHS = {
  index: 56,
  col1: 165,
  col2: 215,
  col3: 200,
  signature: 270,
  time: 190,
} as const;

const FONT_FAMILY =
  '"Noto Sans TC", "PingFang TC", "Microsoft JhengHei", "Heiti TC", sans-serif';

interface NormalizedAttendanceRow {
  col1: string;
  col2: string;
  col3: string;
  signatureDataUrl: string;
  checkedInAtMs: number;
}

function loadImage(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

function wrapTextLines(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  maxLines = 4,
): string[] {
  const clean = String(text ?? '').replace(/\s+/g, ' ').trim();
  if (!clean) return ['—'];

  const lines: string[] = [];
  let current = '';

  for (const ch of Array.from(clean)) {
    const next = current + ch;
    if (ctx.measureText(next).width > maxWidth && current.length > 0) {
      lines.push(current);
      current = ch;
      if (lines.length >= maxLines) {
        break;
      }
    } else {
      current = next;
    }
  }

  if (lines.length < maxLines && current) {
    lines.push(current);
  } else if (lines.length === maxLines && current) {
    const last = lines[maxLines - 1];
    lines[maxLines - 1] =
      last.length > 2 ? `${last.slice(0, -1)}…` : `${last}…`;
  }

  return lines;
}

function drawTableHeader(
  ctx: CanvasRenderingContext2D,
  y: number,
  isParent: boolean,
): number {
  const headerH = 48;
  ctx.fillStyle = '#F5F2EB';
  ctx.fillRect(MARGIN_X, y, CONTENT_W, headerH);
  ctx.strokeStyle = '#D6D3D1';
  ctx.lineWidth = 1.5;
  ctx.strokeRect(MARGIN_X, y, CONTENT_W, headerH);

  const cols: Array<{label: string; w: number; center?: boolean}> = isParent
    ? [
        {label: '#', w: COL_WIDTHS.index, center: true},
        {label: '學生班級 / 姓名', w: COL_WIDTHS.col1},
        {label: '家長姓名', w: COL_WIDTHS.col2},
        {label: '關係 / 備註', w: COL_WIDTHS.col3},
        {label: '親自手寫簽名', w: COL_WIDTHS.signature, center: true},
        {label: '簽到時間', w: COL_WIDTHS.time},
      ]
    : [
        {label: '#', w: COL_WIDTHS.index, center: true},
        {label: '教師姓名', w: COL_WIDTHS.col1},
        {label: '校內帳號信箱', w: COL_WIDTHS.col2},
        {label: '職務 / 年段備註', w: COL_WIDTHS.col3},
        {label: '親自手寫簽名', w: COL_WIDTHS.signature, center: true},
        {label: '簽到時間', w: COL_WIDTHS.time},
      ];

  ctx.fillStyle = '#1C1917';
  ctx.font = `700 20px ${FONT_FAMILY}`;
  ctx.textBaseline = 'middle';

  let x = MARGIN_X;
  for (let i = 0; i < cols.length; i++) {
    const col = cols[i];
    if (i > 0) {
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x, y + headerH);
      ctx.stroke();
    }
    if (col.center) {
      ctx.textAlign = 'center';
      ctx.fillText(col.label, x + col.w / 2, y + headerH / 2);
    } else {
      ctx.textAlign = 'left';
      ctx.fillText(col.label, x + 14, y + headerH / 2);
    }
    x += col.w;
  }

  ctx.textAlign = 'left';
  return y + headerH;
}

function createA4PageCanvas(): {
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

export async function generateMeetingAttendancePdfBlob(
  meeting: MeetingSession,
  teacherCheckins: MeetingCheckin[],
  parentCheckins: ParentCheckin[] = [],
): Promise<Blob> {
  const isParent = meeting.audience === 'parent';
  const rows: NormalizedAttendanceRow[] = isParent
    ? parentCheckins.map((rec) => ({
        col1: rec.studentClassAndSeat,
        col2: rec.parentName,
        col3: rec.relationshipOrNote,
        signatureDataUrl: rec.signatureDataUrl,
        checkedInAtMs: rec.checkedInAtMs,
      }))
    : teacherCheckins.map((rec) => ({
        col1: rec.userName,
        col2: rec.userEmail,
        col3: rec.roleOrNote,
        signatureDataUrl: rec.signatureDataUrl,
        checkedInAtMs: rec.checkedInAtMs,
      }));

  // Preload all valid signature images concurrently
  const loadedSignatures = await Promise.all(
    rows.map((rec) =>
      isValidSignatureDataUrl(rec.signatureDataUrl)
        ? loadImage(rec.signatureDataUrl)
        : Promise.resolve(null),
    ),
  );

  const pages: HTMLCanvasElement[] = [];
  let {canvas, ctx} = createA4PageCanvas();
  let y = MARGIN_TOP;

  // Page 1 Header
  ctx.fillStyle = '#1E3A8A';
  ctx.font = `700 20px ${FONT_FAMILY}`;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.fillText(
    isParent
      ? '臺北市西門國小 · 學校日／親師活動家長出席簽到表'
      : '臺北市西門國小數學領域教師社群 · PesMath 會議出席簽到表',
    MARGIN_X,
    y,
  );
  y += 34;

  ctx.fillStyle = '#1C1917';
  ctx.font = `700 32px ${FONT_FAMILY}`;
  const titleLines = wrapTextLines(ctx, meeting.title, CONTENT_W, 3);
  for (const line of titleLines) {
    ctx.fillText(line, MARGIN_X, y);
    y += 42;
  }
  y += 10;

  // Metadata Box
  const metaH = 92;
  ctx.fillStyle = '#FAF8F5';
  ctx.fillRect(MARGIN_X, y, CONTENT_W, metaH);
  ctx.strokeStyle = '#E7E5E4';
  ctx.lineWidth = 1.5;
  ctx.strokeRect(MARGIN_X, y, CONTENT_W, metaH);

  ctx.fillStyle = '#44403C';
  ctx.font = `500 19px ${FONT_FAMILY}`;
  ctx.textBaseline = 'middle';
  const halfW = CONTENT_W / 2;
  ctx.fillText(`學年度：${meeting.academicYear}`, MARGIN_X + 20, y + 28);
  ctx.fillText(`活動時間：${meeting.meetingDate}`, MARGIN_X + halfW + 12, y + 28);
  ctx.fillText(
    `活動地點：${meeting.location || '西門國小'}`,
    MARGIN_X + 20,
    y + 64,
  );
  ctx.fillText(
    `總簽到人數：${rows.length} ${isParent ? '位家長' : '位教師'}`,
    MARGIN_X + halfW + 12,
    y + 64,
  );
  y += metaH + 22;

  y = drawTableHeader(ctx, y, isParent);

  // Render rows with automatic A4 pagination
  const rowH = 86;
  for (let idx = 0; idx < rows.length; idx++) {
    if (y + rowH > CONTENT_BOTTOM) {
      pages.push(canvas);
      const nextPage = createA4PageCanvas();
      canvas = nextPage.canvas;
      ctx = nextPage.ctx;
      y = MARGIN_TOP;

      ctx.fillStyle = '#57534E';
      ctx.font = `600 18px ${FONT_FAMILY}`;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      ctx.fillText(`簽到表（續）｜${meeting.title}`, MARGIN_X, y);
      y += 34;
      y = drawTableHeader(ctx, y, isParent);
    }

    const rec = rows[idx];
    const sigImg = loadedSignatures[idx];
    const dt = new Date(rec.checkedInAtMs).toLocaleString('zh-TW', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });

    // Row Box
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(MARGIN_X, y, CONTENT_W, rowH);
    ctx.strokeStyle = '#D6D3D1';
    ctx.lineWidth = 1.2;
    ctx.strokeRect(MARGIN_X, y, CONTENT_W, rowH);

    let x = MARGIN_X;
    const widths = [
      COL_WIDTHS.index,
      COL_WIDTHS.col1,
      COL_WIDTHS.col2,
      COL_WIDTHS.col3,
      COL_WIDTHS.signature,
      COL_WIDTHS.time,
    ];
    for (let c = 1; c < widths.length; c++) {
      x += widths[c - 1];
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x, y + rowH);
      ctx.stroke();
    }

    // Cell 1: Index
    x = MARGIN_X;
    ctx.fillStyle = '#57534E';
    ctx.font = `600 19px ${FONT_FAMILY}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(idx + 1), x + COL_WIDTHS.index / 2, y + rowH / 2);

    // Cell 2: Teacher Name OR Student Class/Name
    x += COL_WIDTHS.index;
    ctx.fillStyle = '#1C1917';
    ctx.font = `700 20px ${FONT_FAMILY}`;
    ctx.textAlign = 'left';
    const col1Lines = wrapTextLines(ctx, rec.col1, COL_WIDTHS.col1 - 24, 2);
    const col1StartY = y + rowH / 2 - ((col1Lines.length - 1) * 24) / 2;
    col1Lines.forEach((line, i) => {
      ctx.fillText(line, x + 12, col1StartY + i * 24);
    });

    // Cell 3: School Email OR Parent Name
    x += COL_WIDTHS.col1;
    ctx.fillStyle = isParent ? '#1C1917' : '#57534E';
    ctx.font = isParent
      ? `700 20px ${FONT_FAMILY}`
      : `400 16px ${FONT_FAMILY}`;
    const col2Lines = wrapTextLines(ctx, rec.col2, COL_WIDTHS.col2 - 24, 2);
    const col2StartY = y + rowH / 2 - ((col2Lines.length - 1) * 22) / 2;
    col2Lines.forEach((line, i) => {
      ctx.fillText(line, x + 12, col2StartY + i * 22);
    });

    // Cell 4: Note / Relationship
    x += COL_WIDTHS.col2;
    ctx.fillStyle = '#292524';
    ctx.font = `400 18px ${FONT_FAMILY}`;
    const col3Lines = wrapTextLines(
      ctx,
      rec.col3 || '—',
      COL_WIDTHS.col3 - 24,
      2,
    );
    const col3StartY = y + rowH / 2 - ((col3Lines.length - 1) * 22) / 2;
    col3Lines.forEach((line, i) => {
      ctx.fillText(line, x + 12, col3StartY + i * 22);
    });

    // Cell 5: Handwritten Signature Image
    x += COL_WIDTHS.col3;
    if (sigImg) {
      const boxW = COL_WIDTHS.signature - 28;
      const boxH = rowH - 18;
      const scale = Math.min(boxW / sigImg.width, boxH / sigImg.height, 1);
      const drawW = sigImg.width * scale;
      const drawH = sigImg.height * scale;
      const drawX = x + (COL_WIDTHS.signature - drawW) / 2;
      const drawY = y + (rowH - drawH) / 2;
      ctx.drawImage(sigImg, drawX, drawY, drawW, drawH);
    } else {
      ctx.fillStyle = '#A8A29E';
      ctx.font = `400 16px ${FONT_FAMILY}`;
      ctx.textAlign = 'center';
      ctx.fillText('（未附簽名）', x + COL_WIDTHS.signature / 2, y + rowH / 2);
      ctx.textAlign = 'left';
    }

    // Cell 6: Timestamp
    x += COL_WIDTHS.signature;
    ctx.fillStyle = '#44403C';
    ctx.font = `400 17px ${FONT_FAMILY}`;
    const timeLines = wrapTextLines(ctx, dt, COL_WIDTHS.time - 24, 2);
    const timeStartY = y + rowH / 2 - ((timeLines.length - 1) * 21) / 2;
    timeLines.forEach((line, i) => {
      ctx.fillText(line, x + 12, timeStartY + i * 21);
    });

    y += rowH;
  }

  pages.push(canvas);

  // Stamp footers on all pages
  const exportTime = new Date().toLocaleString('zh-TW', {hour12: false});
  const totalPages = pages.length;
  pages.forEach((pageCanvas, idx) => {
    const pCtx = pageCanvas.getContext('2d')!;
    pCtx.fillStyle = '#78716C';
    pCtx.font = `400 16px ${FONT_FAMILY}`;
    pCtx.textBaseline = 'middle';
    pCtx.textAlign = 'left';
    pCtx.fillText(`匯出時間：${exportTime}`, MARGIN_X, FOOTER_Y);
    pCtx.textAlign = 'right';
    pCtx.fillText(
      `第 ${idx + 1} / ${totalPages} 頁`,
      PAGE_W - MARGIN_X,
      FOOTER_Y,
    );
  });

  // Assemble multi-page A4 PDF
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

export function triggerSafeBlobDownload(blob: Blob, filename: string): string {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.rel = 'noopener noreferrer';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  window.setTimeout(() => {
    URL.revokeObjectURL(url);
  }, 60000);
  return url;
}
