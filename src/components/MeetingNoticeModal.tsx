import React, {useEffect, useMemo, useState} from 'react';
import {createPortal} from 'react-dom';
import QRCode from 'qrcode';
import {Download, Printer, X} from 'lucide-react';
import {SCHOOL_DOMAIN} from '../services/googleAuth';
import {
  buildDirectCheckinUrl,
  MeetingSession,
} from '../services/meetingCheckinDb';
import {JournalPost} from '../types/journal';
import {jsPDF} from 'jspdf';
import {triggerSafeBlobDownload} from '../utils/meetingPdfExport';

type NoticeLayoutMode = '6up' | '4up';

interface MeetingNoticeModalProps {
  meeting: MeetingSession | null;
  posts?: JournalPost[];
  onOpenLinkedPost?: (slug: string) => void;
  onClose: () => void;
}

const loadImage = (src: string): Promise<HTMLImageElement> => {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(img);
    img.src = src;
  });
};

const fitTextToWidth = (
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
): string => {
  if (ctx.measureText(text).width <= maxWidth) return text;
  let truncated = text;
  while (truncated.length > 1 && ctx.measureText(`${truncated}…`).width > maxWidth) {
    truncated = truncated.slice(0, -1);
  }
  return `${truncated}…`;
};

const wrapTextLines = (
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  maxLines: number,
): string[] => {
  const chars = Array.from(text.trim());
  if (chars.length === 0) return [''];
  const lines: string[] = [];
  let current = '';

  for (let i = 0; i < chars.length; i++) {
    const ch = chars[i];
    const test = current + ch;
    if (ctx.measureText(test).width > maxWidth && current.length > 0) {
      if (lines.length + 1 === maxLines) {
        const remaining = current + chars.slice(i).join('');
        lines.push(fitTextToWidth(ctx, remaining, maxWidth));
        return lines;
      }
      lines.push(current);
      current = ch;
    } else {
      current = test;
    }
  }
  if (current) {
    lines.push(current);
  }
  return lines.slice(0, maxLines);
};

const drawBalancedNoticeCard = (
  ctx: CanvasRenderingContext2D,
  cardX: number,
  cardY: number,
  cardW: number,
  cardH: number,
  mode: NoticeLayoutMode,
  meeting: MeetingSession,
  linkedPost: JournalPost | null,
  q1Img: HTMLImageElement | null,
  q2Img: HTMLImageElement | null,
  timeWindowText: string,
) => {
  const isSixUp = mode === '6up';
  const padX = isSixUp ? 16 : 22;
  const padBottom = isSixUp ? 8 : 12;
  const innerW = cardW - padX * 2;
  const centerX = cardX + cardW / 2;

  ctx.save();

  // Outer card background & crisp grayscale-friendly frame
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(cardX, cardY, cardW, cardH);
  ctx.strokeStyle = '#000000';
  ctx.lineWidth = 2;
  ctx.strokeRect(cardX, cardY, cardW, cardH);

  // Subtle top bar tint for clean editorial header
  const headerH = isSixUp ? 72 : 98;
  ctx.fillStyle = '#F5F5F4';
  ctx.fillRect(cardX + 1, cardY + 1, cardW - 2, headerH);
  ctx.strokeStyle = '#000000';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(cardX, cardY + headerH);
  ctx.lineTo(cardX + cardW, cardY + headerH);
  ctx.stroke();

  ctx.fillStyle = '#171717';
  ctx.font = `700 ${isSixUp ? 16 : 20}px "Noto Sans TC", sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(
    fitTextToWidth(
      ctx,
      '臺北市西門國小 · 數學領域～AI領航 徜徉酷數',
      cardW - 20,
    ),
    centerX,
    cardY + (isSixUp ? 20 : 28),
  );

  ctx.fillStyle = '#000000';
  ctx.font = `800 ${isSixUp ? 24 : 29}px "Noto Sans TC", sans-serif`;
  ctx.fillText(
    fitTextToWidth(
      ctx,
      meeting.audience === 'parent'
        ? '學校日家長 · 開會暨簽到通知單'
        : '開會暨簽到通知單',
      cardW - 20,
    ),
    centerX,
    cardY + (isSixUp ? 50 : 68),
  );

  // Footer dimensions anchored cleanly at card bottom
  const footerH = isSixUp ? 64 : 84;
  const footerTopY = cardY + cardH - padBottom - footerH;

  ctx.strokeStyle = '#404040';
  ctx.lineWidth = 1.25;
  ctx.beginPath();
  ctx.moveTo(cardX + padX, footerTopY);
  ctx.lineTo(cardX + cardW - padX, footerTopY);
  ctx.stroke();

  ctx.fillStyle = '#000000';
  ctx.font = `700 ${isSixUp ? 16 : 19}px "Noto Sans TC", sans-serif`;
  ctx.fillText(
    fitTextToWidth(
      ctx,
      `掃碼或登入 @${SCHOOL_DOMAIN} 完成線上簽到／請假`,
      innerW,
    ),
    centerX,
    footerTopY + (isSixUp ? 21 : 28),
  );

  ctx.fillStyle = '#000000';
  ctx.font = `800 ${isSixUp ? 17.5 : 21}px "Noto Sans TC", sans-serif`;
  ctx.fillText(
    fitTextToWidth(ctx, '領召：黃佩詩　403教室（分機：5207）', innerW),
    centerX,
    footerTopY + (isSixUp ? 48 : 62),
  );

  // Middle zone: Title + Info Box + QR Section dynamically spaced to fill the card evenly
  const bodyTop = cardY + headerH + (isSixUp ? 10 : 16);
  const bodyBottom = footerTopY - (isSixUp ? 8 : 14);
  const availableBodyH = bodyBottom - bodyTop;

  // 1. Meeting Title (wrap up to 2 lines cleanly)
  ctx.fillStyle = '#000000';
  ctx.font = `800 ${isSixUp ? 22 : 27}px "Noto Sans TC", sans-serif`;
  const titleLines = wrapTextLines(ctx, meeting.title, innerW, 2);
  const titleLineH = isSixUp ? 28 : 35;
  const titleBlockH = titleLines.length * titleLineH;

  const academicYearLabel = meeting.academicYear.includes('學年度')
    ? meeting.academicYear
    : `${meeting.academicYear}學年度`;

  // 2. Metadata Info Box with larger, bold black typography
  const infoLines: Array<{label: string; value: string}> = [
    {
      label: '開會時間',
      value: `${academicYearLabel}・${meeting.meetingDate}`,
    },
    {label: '簽到開放', value: timeWindowText},
    {label: '開會地點', value: meeting.location || '西門國小會議室'},
  ];
  if (linkedPost) {
    infoLines.push({label: '相關文章', value: linkedPost.title});
  }

  const infoRowH = isSixUp ? 29 : 40;
  const infoPadY = isSixUp ? 8 : 13;
  const infoBoxH = infoPadY * 2 + infoLines.length * infoRowH;

  // 3. QR Section height fills remaining space proportionally
  const minGaps = isSixUp ? 16 : 28;
  const maxQrAreaH = availableBodyH - titleBlockH - infoBoxH - minGaps;
  const hasTwoQr = Boolean(linkedPost && q2Img);

  const labelBandH = isSixUp ? 28 : 34;
  const qrSize = Math.max(
    isSixUp ? 86 : 124,
    Math.min(
      isSixUp ? 148 : 206,
      maxQrAreaH - labelBandH - (isSixUp ? 10 : 14),
    ),
  );
  const qrAreaH = qrSize + labelBandH + (isSixUp ? 8 : 12);

  // Distribute extra vertical gap cleanly so there is zero overlap or bottom void
  const leftover = Math.max(0, availableBodyH - titleBlockH - infoBoxH - qrAreaH);
  const gap1 = Math.max(6, Math.round(leftover * 0.34));
  const gap2 = Math.max(8, Math.round(leftover * 0.42));

  // Draw Title
  let curY = bodyTop;
  ctx.fillStyle = '#000000';
  ctx.font = `800 ${isSixUp ? 22 : 27}px "Noto Sans TC", sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  titleLines.forEach((line, idx) => {
    ctx.fillText(line, centerX, curY + titleLineH * idx + titleLineH / 2);
  });
  curY += titleBlockH + gap1;

  // Draw Info Box
  const infoX = cardX + padX;
  ctx.fillStyle = '#FAFAFA';
  ctx.fillRect(infoX, curY, innerW, infoBoxH);
  ctx.strokeStyle = '#525252';
  ctx.lineWidth = 1.5;
  ctx.strokeRect(infoX, curY, innerW, infoBoxH);

  const infoPadX = isSixUp ? 12 : 16;
  const infoFontSize = isSixUp ? 17.5 : 22;
  infoLines.forEach((row, idx) => {
    const rowY = curY + infoPadY + idx * infoRowH + infoRowH / 2;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';

    ctx.fillStyle = '#171717';
    ctx.font = `800 ${infoFontSize}px "Noto Sans TC", sans-serif`;
    const labelStr = `${row.label}：`;
    const labelW = ctx.measureText(labelStr).width;
    ctx.fillText(labelStr, infoX + infoPadX, rowY);

    ctx.fillStyle = '#000000';
    ctx.font = `700 ${infoFontSize}px "Noto Sans TC", sans-serif`;
    const valFitted = fitTextToWidth(
      ctx,
      row.value,
      innerW - infoPadX * 2 - labelW,
    );
    ctx.fillText(valFitted, infoX + infoPadX + labelW, rowY);
  });

  curY += infoBoxH + gap2;

  // Draw QR Code Area
  if (hasTwoQr && q1Img && q2Img) {
    const qrGap = isSixUp ? 16 : 24;
    const boxW = Math.min(isSixUp ? 236 : 254, (innerW - qrGap) / 2);
    const startX = centerX - (boxW * 2 + qrGap) / 2;

    // Left: Checkin QR
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(startX, curY, boxW, qrAreaH);
    ctx.strokeStyle = '#171717';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(startX, curY, boxW, qrAreaH);
    ctx.drawImage(
      q1Img,
      startX + (boxW - qrSize) / 2,
      curY + (isSixUp ? 5 : 7),
      qrSize,
      qrSize,
    );
    ctx.fillStyle = '#000000';
    ctx.font = `800 ${isSixUp ? 17.5 : 20.5}px "Noto Sans TC", sans-serif`;
    ctx.textAlign = 'center';
    ctx.fillText(
      '【1】手機線上簽到',
      startX + boxW / 2,
      curY + qrSize + (isSixUp ? 20 : 25),
    );

    // Right: Linked Article QR
    const startX2 = startX + boxW + qrGap;
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(startX2, curY, boxW, qrAreaH);
    ctx.strokeRect(startX2, curY, boxW, qrAreaH);
    ctx.drawImage(
      q2Img,
      startX2 + (boxW - qrSize) / 2,
      curY + (isSixUp ? 5 : 7),
      qrSize,
      qrSize,
    );
    ctx.fillStyle = '#000000';
    ctx.font = `800 ${isSixUp ? 17.5 : 20.5}px "Noto Sans TC", sans-serif`;
    ctx.textAlign = 'center';
    ctx.fillText(
      '【2】相關文章閱讀',
      startX2 + boxW / 2,
      curY + qrSize + (isSixUp ? 20 : 25),
    );
  } else if (q1Img) {
    // Single QR: clean side-by-side QR + step instructions box for balanced visual density
    const qrBoxSize = Math.max(qrSize + 14, isSixUp ? 168 : 210);
    const guideBoxW = innerW - qrBoxSize - (isSixUp ? 14 : 20);
    const leftX = cardX + padX;

    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(leftX, curY, qrBoxSize, qrAreaH);
    ctx.strokeStyle = '#171717';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(leftX, curY, qrBoxSize, qrAreaH);
    ctx.drawImage(
      q1Img,
      leftX + (qrBoxSize - qrSize) / 2,
      curY + (isSixUp ? 5 : 7),
      qrSize,
      qrSize,
    );
    ctx.fillStyle = '#000000';
    ctx.font = `800 ${isSixUp ? 17 : 20}px "Noto Sans TC", sans-serif`;
    ctx.textAlign = 'center';
    ctx.fillText(
      '手機掃碼簽到',
      leftX + qrBoxSize / 2,
      curY + qrSize + (isSixUp ? 20 : 25),
    );

    // Right instruction panel
    const rightX = leftX + qrBoxSize + (isSixUp ? 14 : 20);
    ctx.fillStyle = '#FAFAFA';
    ctx.fillRect(rightX, curY, guideBoxW, qrAreaH);
    ctx.strokeStyle = '#737373';
    ctx.lineWidth = 1.25;
    ctx.strokeRect(rightX, curY, guideBoxW, qrAreaH);

    ctx.textAlign = 'left';
    ctx.fillStyle = '#000000';
    ctx.font = `800 ${isSixUp ? 17.5 : 21}px "Noto Sans TC", sans-serif`;
    const gPadX = isSixUp ? 14 : 18;
    const stepSpacing = Math.round(qrAreaH / 4.2);
    const gStartY = curY + Math.round(qrAreaH * 0.22);
    ctx.fillText('簽到步驟說明：', rightX + gPadX, gStartY);

    ctx.font = `700 ${isSixUp ? 16 : 19}px "Noto Sans TC", sans-serif`;
    ctx.fillStyle = '#171717';
    ctx.fillText(
      fitTextToWidth(ctx, '1. 手機掃描左側 QR Code', guideBoxW - gPadX * 2),
      rightX + gPadX,
      gStartY + stepSpacing,
    );
    ctx.fillText(
      fitTextToWidth(
        ctx,
        meeting.audience === 'parent'
          ? '2. 免登入即可填寫簽名'
          : `2. 登入 @${SCHOOL_DOMAIN}`,
        guideBoxW - gPadX * 2,
      ),
      rightX + gPadX,
      gStartY + stepSpacing * 2,
    );
    ctx.fillText(
      fitTextToWidth(
        ctx,
        meeting.audience === 'parent'
          ? '3. 送出即完成出席登記'
          : '3. 完成親筆簽名或請假',
        guideBoxW - gPadX * 2,
      ),
      rightX + gPadX,
      gStartY + stepSpacing * 3,
    );
  }

  ctx.restore();
};

export const MeetingNoticeModal: React.FC<MeetingNoticeModalProps> = ({
  meeting,
  posts = [],
  onOpenLinkedPost,
  onClose,
}) => {
  const [layoutMode, setLayoutMode] = useState<NoticeLayoutMode>('6up');
  const [qrDataUrl, setQrDataUrl] = useState<string>('');
  const [articleQrDataUrl, setArticleQrDataUrl] = useState<string>('');
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);
  const [noticeMessage, setNoticeMessage] = useState<string | null>(null);

  const checkinUrl = useMemo(() => {
    if (!meeting) return '';
    return buildDirectCheckinUrl(meeting.audience, meeting.id);
  }, [meeting]);

  const linkedPost = useMemo(() => {
    if (!meeting?.linkedPostSlug || !posts.length) return null;
    return posts.find((p) => p.slug === meeting.linkedPostSlug) || null;
  }, [meeting?.linkedPostSlug, posts]);

  const articleUrl = useMemo(() => {
    if (!meeting?.linkedPostSlug) return '';
    if (typeof window !== 'undefined') {
      return `${window.location.origin}${window.location.pathname}#post=${encodeURIComponent(meeting.linkedPostSlug)}`;
    }
    return `#post=${meeting.linkedPostSlug}`;
  }, [meeting?.linkedPostSlug]);

  const timeWindowText = useMemo(() => {
    if (!meeting) return '';
    if (!meeting.checkinStartAtMs && !meeting.checkinEndAtMs) {
      return `依排定時間：${meeting.meetingDate}`;
    }
    const fmt = (ms: number) => {
      const d = new Date(ms);
      const m = d.getMonth() + 1;
      const day = d.getDate();
      const hr = String(d.getHours()).padStart(2, '0');
      const min = String(d.getMinutes()).padStart(2, '0');
      return `${m}/${day} ${hr}:${min}`;
    };
    if (meeting.checkinStartAtMs && meeting.checkinEndAtMs) {
      return `${fmt(meeting.checkinStartAtMs)} ~ ${fmt(meeting.checkinEndAtMs)}`;
    }
    if (meeting.checkinStartAtMs) {
      return `自 ${fmt(meeting.checkinStartAtMs)} 起開放`;
    }
    return `至 ${fmt(meeting.checkinEndAtMs!)} 截止`;
  }, [meeting]);

  useEffect(() => {
    if (!checkinUrl) return;
    let active = true;
    void QRCode.toDataURL(checkinUrl, {
      width: 320,
      margin: 2,
      color: {
        dark: '#000000',
        light: '#FFFFFF',
      },
    })
      .then((url) => {
        if (active) setQrDataUrl(url);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [checkinUrl]);

  useEffect(() => {
    if (!articleUrl) return;
    let active = true;
    void QRCode.toDataURL(articleUrl, {
      width: 320,
      margin: 2,
      color: {
        dark: '#000000',
        light: '#FFFFFF',
      },
    })
      .then((url) => {
        if (active) setArticleQrDataUrl(url);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [articleUrl]);

  useEffect(() => {
    if (!meeting) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [meeting, onClose]);

  useEffect(() => {
    return () => {
      document.body.classList.remove('printing-quarter-notice');
      document.getElementById('notice-print-page-style')?.remove();
    };
  }, []);

  if (!meeting || typeof document === 'undefined') return null;

  const handleNativePrint = () => {
    document.body.classList.add('printing-quarter-notice');

    // Dynamically scope @page orientation so other print modals stay A4 portrait
    const existing = document.getElementById('notice-print-page-style');
    if (existing) existing.remove();
    const pageStyle = document.createElement('style');
    pageStyle.id = 'notice-print-page-style';
    pageStyle.textContent =
      layoutMode === '6up'
        ? '@media print { @page { size: A4 landscape; margin: 0; } }'
        : '@media print { @page { size: A4 portrait; margin: 0; } }';
    document.head.appendChild(pageStyle);

    const cleanup = () => {
      document.body.classList.remove('printing-quarter-notice');
      document.getElementById('notice-print-page-style')?.remove();
      window.removeEventListener('afterprint', cleanup);
    };
    window.addEventListener('afterprint', cleanup);
    try {
      window.print();
      setNoticeMessage(
        layoutMode === '6up'
          ? '已送出 A4 橫式 6 份（3×2）灰階通知單列印請求。'
          : '已送出 A4 直式 4 份（2×2）灰階通知單列印請求。',
      );
    } catch {
      cleanup();
      setNoticeMessage('此瀏覽環境不支援直接呼叫列印，請點選「下載 PDF」。');
    }
    window.setTimeout(cleanup, 3000);
  };

  const handleDownloadNoticePdf = async () => {
    setIsGeneratingPdf(true);
    setNoticeMessage(null);
    try {
      const isSixUp = layoutMode === '6up';
      const canvas = document.createElement('canvas');
      canvas.width = isSixUp ? 1754 : 1240;
      canvas.height = isSixUp ? 1240 : 1754;
      const ctx = canvas.getContext('2d')!;
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      const cols = isSixUp ? 3 : 2;
      const rows = 2;
      const cardW = isSixUp ? 536 : 555;
      const cardH = isSixUp ? 570 : 812;
      const colGap = isSixUp ? 30 : 36;
      const rowGap = isSixUp ? 30 : 36;
      const startX = (canvas.width - (cardW * cols + colGap * (cols - 1))) / 2;
      const startY = (canvas.height - (cardH * rows + rowGap * (rows - 1))) / 2;

      const q1Img = qrDataUrl ? await loadImage(qrDataUrl) : null;
      const q2Img =
        linkedPost && articleQrDataUrl ? await loadImage(articleQrDataUrl) : null;

      // Subtle dashed cut guides across margins for easy paper cutting
      ctx.save();
      ctx.strokeStyle = '#D4D4D4';
      ctx.lineWidth = 1;
      ctx.setLineDash([6, 6]);
      for (let c = 1; c < cols; c++) {
        const cutX = startX + c * cardW + (c - 0.5) * colGap;
        ctx.beginPath();
        ctx.moveTo(cutX, 16);
        ctx.lineTo(cutX, canvas.height - 16);
        ctx.stroke();
      }
      const cutY = startY + cardH + rowGap / 2;
      ctx.beginPath();
      ctx.moveTo(16, cutY);
      ctx.lineTo(canvas.width - 16, cutY);
      ctx.stroke();
      ctx.restore();

      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const cx = startX + c * (cardW + colGap);
          const cy = startY + r * (cardH + rowGap);
          drawBalancedNoticeCard(
            ctx,
            cx,
            cy,
            cardW,
            cardH,
            layoutMode,
            meeting,
            linkedPost,
            q1Img,
            q2Img,
            timeWindowText,
          );
        }
      }

      const pdf = new jsPDF({
        orientation: isSixUp ? 'landscape' : 'portrait',
        unit: 'mm',
        format: 'a4',
        compress: true,
      });
      const imgData = canvas.toDataURL('image/jpeg', 0.94);
      pdf.addImage(
        imgData,
        'JPEG',
        0,
        0,
        isSixUp ? 297 : 210,
        isSixUp ? 210 : 297,
        undefined,
        'FAST',
      );
      const blob = pdf.output('blob');
      const safeFile = meeting.title.replace(/[\\/:*?"<>|]/g, '_').slice(0, 35);
      const labelSuffix = isSixUp ? 'A4橫式6份' : 'A4直式4份';
      triggerSafeBlobDownload(blob, `會議通知單_${labelSuffix}_${safeFile}.pdf`);
      setNoticeMessage(
        isSixUp
          ? '已成功產生 A4 橫式 6 份通知單 PDF 檔！可直接灰階列印後裁切發放。'
          : '已成功產生 A4 直式 4 份通知單 PDF 檔！可直接灰階列印後裁切發放。',
      );
    } catch (err: any) {
      setNoticeMessage(err?.message || '產生通知單 PDF 失敗，請改用系統列印。');
    } finally {
      setIsGeneratingPdf(false);
    }
  };

  const isSixUp = layoutMode === '6up';

  const renderHtmlCard = (
    compactForSixUp: boolean,
    isScreenPreview = false,
  ) => (
    <>
      {/* Header */}
      <div
        className={`bg-stone-100 border-b-2 border-stone-900 text-center shrink-0 ${
          isScreenPreview
            ? 'px-4 py-3'
            : compactForSixUp
              ? 'px-3 py-1.5'
              : 'px-4 py-2.5'
        }`}
      >
        <div
          className={`font-bold tracking-wide text-stone-900 ${
            isScreenPreview
              ? 'text-sm sm:text-[15px]'
              : compactForSixUp
                ? 'text-[12.5px] leading-tight'
                : 'text-[15px] leading-tight'
          }`}
        >
          臺北市西門國小 · 數學領域～AI領航 徜徉酷數
        </div>
        <div
          className={`font-editorial font-extrabold tracking-wide text-black mt-0.5 ${
            isScreenPreview
              ? 'text-xl sm:text-[22px]'
              : compactForSixUp
                ? 'text-[18px] leading-tight'
                : 'text-[22px] leading-tight'
          }`}
        >
          {meeting.audience === 'parent'
            ? '學校日家長 · 開會暨簽到通知單'
            : '開會暨簽到通知單'}
        </div>
      </div>

      {/* Inner Body */}
      <div
        className={`flex-1 min-h-0 flex flex-col justify-between ${
          isScreenPreview
            ? 'px-4 py-3.5 gap-3'
            : compactForSixUp
              ? 'px-3 py-2 gap-1.5'
              : 'px-4 py-3 gap-2.5'
        }`}
      >
        {/* Title */}
        <div className="text-center px-1 shrink-0">
          <h2
            className={`font-editorial font-extrabold text-black leading-snug line-clamp-2 ${
              isScreenPreview
                ? 'text-lg sm:text-[20px]'
                : compactForSixUp
                  ? 'text-[16.5px] leading-tight'
                  : 'text-[20px] leading-snug'
            }`}
          >
            {meeting.title}
          </h2>
        </div>

        {/* Info Box */}
        <div
          className={`bg-stone-50 border border-stone-400 rounded-md text-left text-black shrink-0 ${
            isScreenPreview
              ? 'px-3.5 py-2.5 space-y-2 text-[15px] leading-snug'
              : compactForSixUp
                ? 'px-2.5 py-1.5 space-y-1 text-[13px] leading-tight'
                : 'px-3.5 py-2.5 space-y-1.5 text-[15px] leading-snug'
          }`}
        >
          <div className="flex items-baseline gap-1 min-w-0">
            <strong className="font-extrabold text-stone-900 shrink-0">
              開會時間：
            </strong>
            <span
              className={`font-bold text-black ${isScreenPreview ? 'break-words' : 'truncate'}`}
            >
              {meeting.academicYear.includes('學年度')
                ? meeting.academicYear
                : `${meeting.academicYear}學年度`}
              ・{meeting.meetingDate}
            </span>
          </div>
          <div className="flex items-baseline gap-1 min-w-0">
            <strong className="font-extrabold text-stone-900 shrink-0">
              簽到開放：
            </strong>
            <span
              className={`font-extrabold text-black ${isScreenPreview ? 'break-words' : 'truncate'}`}
            >
              {timeWindowText}
            </span>
          </div>
          <div className="flex items-baseline gap-1 min-w-0">
            <strong className="font-extrabold text-stone-900 shrink-0">
              開會地點：
            </strong>
            <span
              className={`font-bold text-black ${isScreenPreview ? 'break-words' : 'truncate'}`}
            >
              {meeting.location || '西門國小會議室'}
            </span>
          </div>
          {linkedPost && (
            <div className="pt-1 border-t border-stone-300 flex items-baseline gap-1 min-w-0">
              <strong className="font-extrabold text-stone-900 shrink-0">
                相關文章：
              </strong>
              <span
                className={`font-extrabold underline cursor-pointer text-black ${isScreenPreview ? 'break-words' : 'truncate'}`}
                onClick={() => {
                  if (onOpenLinkedPost && meeting.linkedPostSlug) {
                    onClose();
                    onOpenLinkedPost(meeting.linkedPostSlug);
                  }
                }}
              >
                {linkedPost.title}
              </span>
            </div>
          )}
        </div>

        {/* QR Code Area */}
        {linkedPost ? (
          <div className="grid grid-cols-2 gap-2.5 shrink-0">
            <div className="bg-white border-[1.5px] border-stone-900 rounded-md p-1.5 text-center flex flex-col items-center justify-center">
              <div
                className={`flex items-center justify-center ${
                  isScreenPreview
                    ? 'w-28 h-28 sm:w-32 sm:h-32'
                    : compactForSixUp
                      ? 'w-[70px] h-[70px]'
                      : 'w-28 h-28'
                }`}
              >
                {qrDataUrl ? (
                  <img
                    src={qrDataUrl}
                    alt="簽到 QR Code"
                    className="w-full h-full object-contain grayscale contrast-200"
                  />
                ) : (
                  <span className="text-xs text-stone-400">產生中...</span>
                )}
              </div>
              <div
                className={`font-extrabold text-black mt-1 ${
                  isScreenPreview
                    ? 'text-sm sm:text-[15px]'
                    : compactForSixUp
                      ? 'text-[12.5px]'
                      : 'text-[15px]'
                }`}
              >
                【1】手機線上簽到
              </div>
            </div>

            <div className="bg-white border-[1.5px] border-stone-900 rounded-md p-1.5 text-center flex flex-col items-center justify-center">
              <div
                className={`flex items-center justify-center ${
                  isScreenPreview
                    ? 'w-28 h-28 sm:w-32 sm:h-32'
                    : compactForSixUp
                      ? 'w-[70px] h-[70px]'
                      : 'w-28 h-28'
                }`}
              >
                {articleQrDataUrl ? (
                  <img
                    src={articleQrDataUrl}
                    alt="相關文章 QR Code"
                    className="w-full h-full object-contain grayscale contrast-200"
                  />
                ) : (
                  <span className="text-xs text-stone-400">產生中...</span>
                )}
              </div>
              <div
                className={`font-extrabold text-black mt-1 ${
                  isScreenPreview
                    ? 'text-sm sm:text-[15px]'
                    : compactForSixUp
                      ? 'text-[12.5px]'
                      : 'text-[15px]'
                }`}
              >
                【2】相關文章閱讀
              </div>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-[auto_1fr] gap-2.5 items-stretch shrink-0">
            <div className="bg-white border-[1.5px] border-stone-900 rounded-md p-1.5 text-center flex flex-col items-center justify-center">
              <div
                className={`flex items-center justify-center ${
                  isScreenPreview
                    ? 'w-28 h-28 sm:w-32 sm:h-32'
                    : compactForSixUp
                      ? 'w-[70px] h-[70px]'
                      : 'w-28 h-28'
                }`}
              >
                {qrDataUrl ? (
                  <img
                    src={qrDataUrl}
                    alt="簽到 QR Code"
                    className="w-full h-full object-contain grayscale contrast-200"
                  />
                ) : (
                  <span className="text-xs text-stone-400">產生中...</span>
                )}
              </div>
              <div
                className={`font-extrabold text-black mt-1 ${
                  isScreenPreview
                    ? 'text-sm'
                    : compactForSixUp
                      ? 'text-[12.5px]'
                      : 'text-[14.5px]'
                }`}
              >
                手機掃碼簽到
              </div>
            </div>

            <div
              className={`bg-stone-50 border border-stone-400 rounded-md flex flex-col justify-center text-left text-black font-semibold ${
                isScreenPreview
                  ? 'px-3.5 py-2.5 space-y-2 text-sm'
                  : compactForSixUp
                    ? 'px-2.5 py-1.5 space-y-1 text-[12.5px] leading-tight'
                    : 'px-3.5 py-2.5 space-y-1.5 text-[14.5px]'
              }`}
            >
              <div className="font-extrabold text-black">簽到步驟說明：</div>
              <div>1. 手機掃描左側 QR Code</div>
              <div>
                2.{' '}
                {meeting.audience === 'parent'
                  ? '免登入即可填寫簽名'
                  : `登入 @${SCHOOL_DOMAIN}`}
              </div>
              <div>
                3.{' '}
                {meeting.audience === 'parent'
                  ? '送出即完成出席登記'
                  : '完成親筆簽名或請假'}
              </div>
            </div>
          </div>
        )}

        {/* Footer */}
        <div
          className={`text-center border-t border-stone-500 shrink-0 ${
            isScreenPreview
              ? 'pt-2.5 space-y-1'
              : compactForSixUp
                ? 'pt-1.5 space-y-0.5'
                : 'pt-2 space-y-1'
          }`}
        >
          <div
            className={`font-bold text-black ${
              isScreenPreview
                ? 'text-sm sm:text-[15px]'
                : compactForSixUp
                  ? 'text-[12px] leading-tight'
                  : 'text-[14.5px]'
            }`}
          >
            掃碼或登入 @{SCHOOL_DOMAIN} 完成線上簽到／請假
          </div>
          <div
            className={`font-extrabold text-black tracking-wide ${
              isScreenPreview
                ? 'text-[15px] sm:text-base'
                : compactForSixUp
                  ? 'text-[13px] leading-tight'
                  : 'text-[15.5px]'
            }`}
          >
            領召：黃佩詩　403教室（分機：5207）
          </div>
        </div>
      </div>
    </>
  );

  return createPortal(
    <div
      id="printable-quarter-notice-portal"
      className="fixed inset-0 z-[75] overflow-y-auto bg-stone-950/75 backdrop-blur-xs p-3 sm:p-6 flex flex-col items-center justify-center"
      role="dialog"
      aria-modal="true"
      aria-label="多份合印黑白會議通知單預覽與列印"
      onClick={onClose}
    >
      {/* Top Toolbar */}
      <div
        className="no-print w-full max-w-2xl bg-white border border-stone-200 rounded-xl shadow-lg p-3.5 sm:p-4 mb-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shrink-0"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="min-w-0 space-y-1">
          <div className="text-xs font-semibold text-stone-800">
            省墨黑白列印版 · 單張 A4 可印 {isSixUp ? '6 份（橫式 3×2）' : '4 份（直式 2×2）'}
          </div>
          <div className="text-sm font-bold text-stone-950 truncate">
            {meeting.title}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* 4-up vs 6-up Layout Switcher */}
          <div
            className="inline-flex bg-stone-100 border border-stone-300 rounded-lg p-0.5"
            role="group"
            aria-label="每張 A4 列印份數"
          >
            <button
              type="button"
              onClick={() => setLayoutMode('6up')}
              className={`px-2.5 py-1.5 text-xs font-semibold rounded-md transition-colors ${
                isSixUp
                  ? 'bg-stone-900 text-white shadow-2xs'
                  : 'text-stone-700 hover:text-stone-950'
              }`}
            >
              6份 (A4橫式)
            </button>
            <button
              type="button"
              onClick={() => setLayoutMode('4up')}
              className={`px-2.5 py-1.5 text-xs font-semibold rounded-md transition-colors ${
                !isSixUp
                  ? 'bg-stone-900 text-white shadow-2xs'
                  : 'text-stone-700 hover:text-stone-950'
              }`}
            >
              4份 (A4直式)
            </button>
          </div>

          <button
            type="button"
            disabled={isGeneratingPdf}
            onClick={handleDownloadNoticePdf}
            className="px-3 py-2 text-xs font-semibold text-white bg-stone-900 hover:bg-stone-800 disabled:opacity-60 rounded-lg inline-flex items-center gap-1.5"
          >
            <Download className="w-3.5 h-3.5" />
            <span>
              {isGeneratingPdf
                ? '產製 PDF...'
                : isSixUp
                  ? '下載 6份 PDF'
                  : '下載 4份 PDF'}
            </span>
          </button>

          <button
            type="button"
            onClick={handleNativePrint}
            className="px-3 py-2 text-xs font-semibold text-stone-900 bg-stone-100 border border-stone-300 hover:bg-stone-200 rounded-lg inline-flex items-center gap-1.5"
          >
            <Printer className="w-3.5 h-3.5 text-stone-900" />
            <span>直接列印</span>
          </button>

          <button
            type="button"
            onClick={onClose}
            aria-label="關閉"
            className="p-2 text-stone-500 hover:text-stone-900 hover:bg-stone-100 rounded-lg"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {noticeMessage && (
        <div className="no-print w-full max-w-2xl bg-stone-100 border border-stone-300 text-stone-900 rounded-lg px-3 py-2 text-xs mb-3 text-center">
          {noticeMessage}
        </div>
      )}

      {/* Screen Preview: Clear High-Contrast Single Card */}
      <div
        className="no-print max-h-[75vh] overflow-y-auto p-2 w-full flex flex-col items-center"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="text-center text-xs text-stone-300 mb-2">
          {isSixUp
            ? '單張通知卡預覽（輸出時將於單張橫式 A4 自動排列 6 份，並附虛線裁切線）'
            : '單張通知卡預覽（輸出時將於單張直式 A4 自動排列 4 份，並附虛線裁切線）'}
        </div>
        <div
          id="printable-quarter-notice-card"
          className={`bg-white border-2 border-stone-900 rounded-md shadow-2xl flex flex-col text-black font-sans mx-auto overflow-hidden w-full ${
            isSixUp ? 'max-w-[440px]' : 'max-w-[460px]'
          }`}
        >
          {renderHtmlCard(isSixUp, true)}
        </div>
      </div>

      {/* Hidden Print Grid Container for window.print() */}
      <div className="print-only-grid hidden">
        <div
          className={
            isSixUp
              ? 'notice-grid-print-landscape'
              : 'notice-grid-print-portrait'
          }
        >
          {[...Array(isSixUp ? 6 : 4)].map((_, i) => (
            <div
              key={i}
              className={
                isSixUp
                  ? 'printable-landscape-card-item'
                  : 'printable-portrait-card-item'
              }
            >
              {renderHtmlCard(isSixUp)}
            </div>
          ))}
        </div>
      </div>
    </div>,
    document.body,
  );
};
