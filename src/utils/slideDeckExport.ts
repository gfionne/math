import {jsPDF} from 'jspdf';
import {JournalPost} from '../types/journal';
import {formatCategoryDisplay} from './postFormatting';

export type AudienceStyle = 'teaching' | 'co-prep' | 'executive';

export interface ArticleSlideItem {
  slideType: 'cover' | 'overview' | 'steps' | 'highlights' | 'takeaway';
  kicker: string;
  heading: string;
  bullets: string[];
  highlightBox: string;
  speakerNotes: string;
}

export interface GeneratedArticleDeck {
  deckTitle: string;
  deckSubtitle: string;
  slides: ArticleSlideItem[];
}

const SLIDE_W = 1600;
const SLIDE_H = 900;
const FONT_SANS =
  '"Noto Sans TC", "PingFang TC", "Microsoft JhengHei", "Heiti TC", sans-serif';
const FONT_SERIF =
  '"Noto Serif TC", "Songti TC", "PMingLiU", serif';

function loadImage(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

function wrapLines(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  maxLines: number,
): string[] {
  const clean = String(text ?? '').replace(/\s+/g, ' ').trim();
  if (!clean) return [];

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

function drawRoundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

export async function exportArticleDeckPdf(
  deck: GeneratedArticleDeck,
  post: JournalPost,
  siteTitle: string,
  qrDataUrl?: string,
): Promise<void> {
  const qrImg = qrDataUrl ? await loadImage(qrDataUrl) : null;
  const pdf = new jsPDF({
    orientation: 'landscape',
    unit: 'px',
    format: [SLIDE_W, SLIDE_H],
    compress: true,
  });

  const categoryText = formatCategoryDisplay(post.category);
  const total = deck.slides.length;

  for (let i = 0; i < total; i++) {
    const slide = deck.slides[i];
    const canvas = document.createElement('canvas');
    canvas.width = SLIDE_W;
    canvas.height = SLIDE_H;
    const ctx = canvas.getContext('2d');
    if (!ctx) continue;

    if (i === 0 || slide.slideType === 'cover') {
      // Deep editorial navy cover slide
      ctx.fillStyle = '#081433';
      ctx.fillRect(0, 0, SLIDE_W, SLIDE_H);

      // Subtle architectural grid lines
      ctx.strokeStyle = 'rgba(147, 197, 253, 0.08)';
      ctx.lineWidth = 1;
      for (let gx = 0; gx <= SLIDE_W; gx += 64) {
        ctx.beginPath();
        ctx.moveTo(gx, 0);
        ctx.lineTo(gx, SLIDE_H);
        ctx.stroke();
      }
      for (let gy = 0; gy <= SLIDE_H; gy += 64) {
        ctx.beginPath();
        ctx.moveTo(0, gy);
        ctx.lineTo(SLIDE_W, gy);
        ctx.stroke();
      }

      // Top metadata strip
      ctx.fillStyle = '#FDE68A';
      ctx.font = `700 22px ${FONT_SANS}`;
      const metaLine = [siteTitle, post.academicYear, categoryText]
        .filter(Boolean)
        .join('  ·  ');
      ctx.fillText(metaLine, 96, 110);

      // Cover title
      const maxTitleW = qrImg ? 1040 : 1400;
      ctx.fillStyle = '#FBF9F5';
      ctx.font = `700 58px ${FONT_SERIF}`;
      const titleLines = wrapLines(ctx, deck.deckTitle || slide.heading, maxTitleW, 3);
      let curY = 210;
      for (const line of titleLines) {
        ctx.fillText(line, 96, curY);
        curY += 78;
      }

      // Subtitle
      ctx.fillStyle = '#BFDBFE';
      ctx.font = `500 28px ${FONT_SANS}`;
      const subLines = wrapLines(ctx, deck.deckSubtitle, maxTitleW, 2);
      curY += 16;
      for (const line of subLines) {
        ctx.fillText(line, 96, curY);
        curY += 42;
      }

      // Cover key focus points
      curY += 36;
      for (const bullet of slide.bullets.slice(0, 3)) {
        ctx.fillStyle = '#FDE68A';
        ctx.beginPath();
        ctx.arc(108, curY - 9, 6, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = '#F8FAFC';
        ctx.font = `500 26px ${FONT_SANS}`;
        const bLines = wrapLines(ctx, bullet, maxTitleW - 44, 2);
        for (const bLine of bLines) {
          ctx.fillText(bLine, 134, curY);
          curY += 38;
        }
        curY += 10;
      }

      // QR card on right
      if (qrImg) {
        drawRoundedRect(ctx, 1216, 220, 288, 360, 24);
        ctx.fillStyle = '#FFFFFF';
        ctx.fill();
        ctx.drawImage(qrImg, 1248, 248, 224, 224);
        ctx.fillStyle = '#1E3A8A';
        ctx.font = `700 20px ${FONT_SANS}`;
        ctx.textAlign = 'center';
        ctx.fillText('掃碼閱讀期刊原文', 1360, 520);
        ctx.fillStyle = '#64748B';
        ctx.font = `500 16px ${FONT_SANS}`;
        ctx.fillText(post.slug, 1360, 550);
        ctx.textAlign = 'left';
      }

      // Footer
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.16)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(96, 800);
      ctx.lineTo(1504, 800);
      ctx.stroke();

      ctx.fillStyle = '#93C5FD';
      ctx.font = `500 20px ${FONT_SANS}`;
      ctx.fillText(
        `撰稿與彙整：${post.author || 'Pes'}   ·   ${post.publishedAt || ''}`,
        96,
        844,
      );
      ctx.textAlign = 'right';
      ctx.fillText(`01 / ${String(total).padStart(2, '0')}`, 1504, 844);
      ctx.textAlign = 'left';
    } else {
      // Warm archival paper content slide
      ctx.fillStyle = '#FBF9F5';
      ctx.fillRect(0, 0, SLIDE_W, SLIDE_H);

      // Top navy hairline bar
      ctx.fillStyle = '#1E3A8A';
      ctx.fillRect(0, 0, SLIDE_W, 10);

      // Kicker
      ctx.fillStyle = '#1E3A8A';
      ctx.font = `700 22px ${FONT_SANS}`;
      ctx.fillText(slide.kicker, 96, 94);

      // Slide Heading
      ctx.fillStyle = '#0C0A09';
      ctx.font = `700 46px ${FONT_SERIF}`;
      const headLines = wrapLines(ctx, slide.heading, 1408, 2);
      let curY = 160;
      for (const hLine of headLines) {
        ctx.fillText(hLine, 96, curY);
        curY += 62;
      }

      // Hairline divider
      ctx.strokeStyle = '#E7E5E4';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(96, curY + 8);
      ctx.lineTo(1504, curY + 8);
      ctx.stroke();

      curY += 66;
      const isSteps = slide.slideType === 'steps';

      // Bullets
      const bullets = slide.bullets.slice(0, 5);
      for (let bIdx = 0; bIdx < bullets.length; bIdx++) {
        if (isSteps) {
          drawRoundedRect(ctx, 96, curY - 30, 40, 40, 10);
          ctx.fillStyle = '#1E3A8A';
          ctx.fill();
          ctx.fillStyle = '#FFFFFF';
          ctx.font = `700 20px ${FONT_SANS}`;
          ctx.textAlign = 'center';
          ctx.fillText(String(bIdx + 1), 116, curY - 3);
          ctx.textAlign = 'left';
        } else {
          ctx.fillStyle = '#1E3A8A';
          ctx.beginPath();
          ctx.arc(112, curY - 10, 7, 0, Math.PI * 2);
          ctx.fill();
        }

        ctx.fillStyle = '#292524';
        ctx.font = `500 28px ${FONT_SANS}`;
        const bLines = wrapLines(ctx, bullets[bIdx], 1320, 2);
        for (const bLine of bLines) {
          ctx.fillText(bLine, 160, curY);
          curY += 42;
        }
        curY += 22;
      }

      // Highlight callout box at bottom if present
      if (slide.highlightBox) {
        const boxY = Math.max(curY + 8, 650);
        if (boxY < 755) {
          drawRoundedRect(ctx, 96, boxY, 1408, 108, 16);
          ctx.fillStyle = '#F2EDE4';
          ctx.fill();
          ctx.strokeStyle = '#D6D3D1';
          ctx.lineWidth = 1.5;
          ctx.stroke();

          ctx.fillStyle = '#92400E';
          ctx.font = `700 18px ${FONT_SANS}`;
          ctx.fillText('教學亮點與思考提問', 128, boxY + 38);

          ctx.fillStyle = '#1C1917';
          ctx.font = `600 24px ${FONT_SANS}`;
          const hlLines = wrapLines(ctx, slide.highlightBox, 1344, 2);
          let hlY = boxY + 74;
          for (const hl of hlLines) {
            ctx.fillText(hl, 128, hlY);
            hlY += 32;
          }
        }
      }

      // Slide Footer
      ctx.strokeStyle = '#E7E5E4';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(96, 810);
      ctx.lineTo(1504, 810);
      ctx.stroke();

      ctx.fillStyle = '#78716C';
      ctx.font = `500 18px ${FONT_SANS}`;
      ctx.fillText(`${siteTitle}  ·  ${post.title}`, 96, 850);
      ctx.textAlign = 'right';
      ctx.fillStyle = '#1E3A8A';
      ctx.font = `700 20px ${FONT_SANS}`;
      ctx.fillText(
        `${String(i + 1).padStart(2, '0')} / ${String(total).padStart(2, '0')}`,
        1504,
        850,
      );
      ctx.textAlign = 'left';
    }

    const imgData = canvas.toDataURL('image/jpeg', 0.92);
    if (i > 0) {
      pdf.addPage([SLIDE_W, SLIDE_H], 'landscape');
    }
    pdf.addImage(imgData, 'JPEG', 0, 0, SLIDE_W, SLIDE_H);
  }

  const safeFileName = `${(post.slug || 'article').replace(/[^a-zA-Z0-9_-]/g, '_')}-slides.pdf`;
  pdf.save(safeFileName);
}
