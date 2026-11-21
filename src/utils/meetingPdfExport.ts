import {jsPDF} from 'jspdf';
import {
  isValidSignatureDataUrl,
  MeetingCheckin,
  MeetingSession,
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
  name: 140,
  email: 240,
  note: 200,
  signature: 270,
  time: 190,
} as const;

const FONT_FAMILY =
  '"Noto Sans TC", "PingFang TC", "Microsoft JhengHei", "Heiti TC", sans-serif';

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

function drawTableHeader(ctx: CanvasRenderingContext2D, y: number): number {
  const headerH = 48;
  ctx.fillStyle = '#F5F2EB';
  ctx.fillRect(MARGIN_X, y, CONTENT_W, headerH);
  ctx.strokeStyle = '#D6D3D1';
  ctx.lineWidth = 1.5;
  ctx.strokeRect(MARGIN_X, y, CONTENT_W, headerH);

  const cols: Array<{label: string; w: number; center?: boolean}> = [
    {label: '#', w: COL_WIDTHS.index, center: true},
    {label: '教師姓名', w: COL_WIDTHS.name},
    {label: '校內帳號信箱', w: COL_WIDTHS.email},
    {label: '職務 / 年段備註', w: COL_WIDTHS.note},
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
  checkins: MeetingCheckin[],
): Promise<Blob> {
  // Preload all valid signature images concurrently
  const loadedSignatures = await Promise.all(
    checkins.map((rec) =>
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
    '臺北市西門國小數學領域教師社群 · PesMath 會議出席簽到表',
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
  ctx.fillText(`會議時間：${meeting.meetingDate}`, MARGIN_X + halfW + 12, y + 28);
  ctx.fillText(
    `會議地點：${meeting.location || '校內共備會議'}`,
    MARGIN_X + 20,
    y + 64,
  );
  ctx.fillText(
    `總簽到人數：${checkins.length} 位教師`,
    MARGIN_X + halfW + 12,
    y + 64,
  );
  y += metaH + 22;

  y = drawTableHeader(ctx, y);

  // Render rows with automatic A4 pagination
  const rowH = 86;
  for (let idx = 0; idx < checkins.length; idx++) {
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
      ctx.fillText(`會議簽到表（續）｜${meeting.title}`, MARGIN_X, y);
      y += 34;
      y = drawTableHeader(ctx, y);
    }

    const rec = checkins[idx];
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
      COL_WIDTHS.name,
      COL_WIDTHS.email,
      COL_WIDTHS.note,
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

    // Cell 2: Name
    x += COL_WIDTHS.index;
    ctx.fillStyle = '#1C1917';
    ctx.font = `700 20px ${FONT_FAMILY}`;
    ctx.textAlign = 'left';
    const nameLines = wrapTextLines(ctx, rec.userName, COL_WIDTHS.name - 24, 2);
    const nameStartY = y + rowH / 2 - ((nameLines.length - 1) * 24) / 2;
    nameLines.forEach((line, i) => {
      ctx.fillText(line, x + 12, nameStartY + i * 24);
    });

    // Cell 3: Email
    x += COL_WIDTHS.name;
    ctx.fillStyle = '#57534E';
    ctx.font = `400 16px ${FONT_FAMILY}`;
    const emailLines = wrapTextLines(
      ctx,
      rec.userEmail,
      COL_WIDTHS.email - 24,
      2,
    );
    const emailStartY = y + rowH / 2 - ((emailLines.length - 1) * 20) / 2;
    emailLines.forEach((line, i) => {
      ctx.fillText(line, x + 12, emailStartY + i * 20);
    });

    // Cell 4: Note
    x += COL_WIDTHS.email;
    ctx.fillStyle = '#292524';
    ctx.font = `400 18px ${FONT_FAMILY}`;
    const noteLines = wrapTextLines(
      ctx,
      rec.roleOrNote || '—',
      COL_WIDTHS.note - 24,
      2,
    );
    const noteStartY = y + rowH / 2 - ((noteLines.length - 1) * 22) / 2;
    noteLines.forEach((line, i) => {
      ctx.fillText(line, x + 12, noteStartY + i * 22);
    });

    // Cell 5: Handwritten Signature Image
    x += COL_WIDTHS.note;
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
