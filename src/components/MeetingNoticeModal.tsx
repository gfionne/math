import React, {useEffect, useMemo, useState} from 'react';
import {createPortal} from 'react-dom';
import QRCode from 'qrcode';
import {
  Calendar,
  Check,
  Copy,
  Download,
  ExternalLink,
  MapPin,
  Printer,
  QrCode,
  Users,
  Video,
  X,
  BookOpen,
} from 'lucide-react';
import {SCHOOL_DOMAIN} from '../services/googleAuth';
import {
  buildDirectCheckinUrl,
  MeetingSession,
} from '../services/meetingCheckinDb';
import {JournalPost} from '../types/journal';
import {jsPDF} from 'jspdf';
import {triggerSafeBlobDownload} from '../utils/meetingPdfExport';

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

const drawSingleNoticeCard = (
  ctx: CanvasRenderingContext2D,
  cardX: number,
  cardY: number,
  cardW: number,
  cardH: number,
  meeting: MeetingSession,
  linkedPost: JournalPost | null,
  q1Img: HTMLImageElement | null,
  q2Img: HTMLImageElement | null,
  timeWindowText: string,
) => {
  ctx.save();
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(cardX, cardY, cardW, cardH);
  ctx.strokeStyle = '#000000';
  ctx.lineWidth = 2;
  ctx.strokeRect(cardX, cardY, cardW, cardH);

  // Toner-saving clean header (White background with thick bottom black border)
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(cardX, cardY, cardW, 68);
  ctx.strokeStyle = '#000000';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(cardX, cardY + 68);
  ctx.lineTo(cardX + cardW, cardY + 68);
  ctx.stroke();

  ctx.fillStyle = '#000000';
  ctx.font = '700 13px "Noto Sans TC", sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('臺北市西門國小 · 數學領域～AI領航 徜徉酷數', cardX + cardW / 2, cardY + 22);
  ctx.font = '700 15px "Noto Sans TC", sans-serif';
  ctx.fillText(meeting.audience === 'parent' ? '學校日家長 · 開會暨簽到通知單' : '開會暨簽到通知單', cardX + cardW / 2, cardY + 46);

  // Title & Metadata
  let ty = cardY + 82;
  ctx.fillStyle = '#000000';
  ctx.font = '700 16px "Noto Sans TC", sans-serif';
  ctx.textAlign = 'center';

  const titleClean = meeting.title;
  ctx.fillText(titleClean.length > 26 ? `${titleClean.slice(0, 26)}…` : titleClean, cardX + cardW / 2, ty);
  ty += 24;

  ctx.fillStyle = '#171717';
  ctx.font = '600 11px "Noto Sans TC", sans-serif';
  ctx.fillText(`學年度：${meeting.academicYear} | 開會：${meeting.meetingDate}`, cardX + cardW / 2, ty);
  ty += 16;
  ctx.fillText(`簽到開放：${timeWindowText}`, cardX + cardW / 2, ty);
  ty += 16;
  ctx.fillText(`地點：${meeting.location || '西門國小會議室'}`, cardX + cardW / 2, ty);
  ty += 20;

  if (linkedPost) {
    ctx.fillStyle = '#000000';
    ctx.font = '700 11px "Noto Sans TC", sans-serif';
    ctx.fillText(`相關文章：${linkedPost.title.length > 30 ? `${linkedPost.title.slice(0, 30)}…` : linkedPost.title}`, cardX + cardW / 2, ty);
    ty += 20;
  }

  // QR Codes
  const hasTwoQr = Boolean(linkedPost && q2Img);
  const qrSize = hasTwoQr ? 92 : 110;

  if (hasTwoQr && q1Img && q2Img) {
    const boxW = 104;
    const startX = cardX + (cardW - (boxW * 2 + 16)) / 2;

    // Checkin QR Box
    ctx.fillStyle = '#FAFAFA';
    ctx.fillRect(startX, ty, boxW, qrSize + 22);
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 1;
    ctx.strokeRect(startX, ty, boxW, qrSize + 22);
    ctx.drawImage(q1Img, startX + (boxW - qrSize) / 2, ty + 3, qrSize, qrSize);
    ctx.fillStyle = '#000000';
    ctx.font = '700 10px "Noto Sans TC", sans-serif';
    ctx.fillText('【1】手機簽到', startX + boxW / 2, ty + qrSize + 14);

    // Article QR Box
    const startX2 = startX + boxW + 16;
    ctx.fillStyle = '#FAFAFA';
    ctx.fillRect(startX2, ty, boxW, qrSize + 22);
    ctx.strokeRect(startX2, ty, boxW, qrSize + 22);
    ctx.drawImage(q2Img, startX2 + (boxW - qrSize) / 2, ty + 3, qrSize, qrSize);
    ctx.fillText('【2】相關文章', startX2 + boxW / 2, ty + qrSize + 14);

    ty += qrSize + 30;
  } else if (q1Img) {
    ctx.drawImage(q1Img, cardX + (cardW - qrSize) / 2, ty, qrSize, qrSize);
    ty += qrSize + 8;
  }

  // Footer text and contact
  ctx.fillStyle = '#000000';
  ctx.font = '700 10px "Noto Sans TC", sans-serif';
  ctx.fillText(`請使用手機掃描 QR Code 或登入 @${SCHOOL_DOMAIN}`, cardX + cardW / 2, ty);
  ty += 14;
  ctx.font = '500 9px "Noto Sans TC", sans-serif';
  ctx.fillText('完成線上親筆簽名、請假登記與期刊文章閱讀', cardX + cardW / 2, ty);
  ty += 15;

  ctx.font = '700 10px "Noto Sans TC", sans-serif';
  ctx.fillText('領召：黃佩詩   403教室 (分機：5207)', cardX + cardW / 2, ty);

  ctx.restore();
};

export const MeetingNoticeModal: React.FC<MeetingNoticeModalProps> = ({
  meeting,
  posts = [],
  onOpenLinkedPost,
  onClose,
}) => {
  const [qrDataUrl, setQrDataUrl] = useState<string>('');
  const [articleQrDataUrl, setArticleQrDataUrl] = useState<string>('');
  const [copiedLink, setCopiedLink] = useState(false);
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
    };
  }, []);

  if (!meeting || typeof document === 'undefined') return null;

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(checkinUrl);
      setCopiedLink(true);
      setNoticeMessage('已複製會議簽到直達連結！');
      window.setTimeout(() => setCopiedLink(false), 2000);
    } catch {
      setNoticeMessage(`直達連結：${checkinUrl}`);
    }
  };

  const handleNativePrint = () => {
    document.body.classList.add('printing-quarter-notice');
    const cleanup = () => {
      document.body.classList.remove('printing-quarter-notice');
      window.removeEventListener('afterprint', cleanup);
    };
    window.addEventListener('afterprint', cleanup);
    try {
      window.print();
      setNoticeMessage('已送出 1/4 A4 4合1黑白通知單列印請求。');
    } catch {
      cleanup();
      setNoticeMessage('此瀏覽環境不支援直接呼叫列印。');
    }
    window.setTimeout(cleanup, 3000);
  };

  const handleDownloadNoticePdf = async () => {
    setIsGeneratingPdf(true);
    setNoticeMessage(null);
    try {
      const canvas = document.createElement('canvas');
      canvas.width = 1240;
      canvas.height = 1754; // A4 portrait dimensions at ~150 DPI
      const ctx = canvas.getContext('2d')!;
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(0, 0, 1240, 1754);

      // Draw 4 identical cards in a 2x2 grid on A4 canvas
      const cardW = 560;
      const cardH = 810;
      const colGap = 40;
      const rowGap = 40;
      const startX = (1240 - (cardW * 2 + colGap)) / 2;
      const startY = (1754 - (cardH * 2 + rowGap)) / 2;

      const q1Img = qrDataUrl ? await loadImage(qrDataUrl) : null;
      const q2Img = linkedPost && articleQrDataUrl ? await loadImage(articleQrDataUrl) : null;

      for (let r = 0; r < 2; r++) {
        for (let c = 0; c < 2; c++) {
          const cx = startX + c * (cardW + colGap);
          const cy = startY + r * (cardH + rowGap);
          drawSingleNoticeCard(ctx, cx, cy, cardW, cardH, meeting, linkedPost, q1Img, q2Img, timeWindowText);
        }
      }

      const pdf = new jsPDF({
        orientation: 'portrait',
        unit: 'mm',
        format: 'a4',
        compress: true,
      });
      const imgData = canvas.toDataURL('image/jpeg', 0.92);
      pdf.addImage(imgData, 'JPEG', 0, 0, 210, 297, undefined, 'FAST');
      const blob = pdf.output('blob');
      const safeFile = meeting.title.replace(/[\\/:*?"<>|]/g, '_').slice(0, 35);
      triggerSafeBlobDownload(blob, `會議通知單_4合1A4_${safeFile}.pdf`);
      setNoticeMessage('已成功產生 4合1 A4 會議通知單 PDF 檔（內含4個重複版面）！');
    } catch (err: any) {
      setNoticeMessage(err?.message || '產生通知單 PDF 失敗，請改用系統列印。');
    } finally {
      setIsGeneratingPdf(false);
    }
  };

  const renderCardContent = () => (
    <div className="space-y-2">
      <div className="border-b-2 border-black pb-1.5 text-center space-y-0.5">
        <div className="text-[10px] sm:text-[11px] font-bold tracking-widest uppercase text-black">
          臺北市西門國民小學 · 數學領域～AI領航 徜徉酷數
        </div>
        <div className="font-editorial text-sm sm:text-base font-extrabold tracking-wide text-black">
          開會暨簽到通知單
        </div>
      </div>

      <div className="space-y-1 text-center">
        <h2 className="font-editorial text-sm sm:text-base font-extrabold text-black leading-snug">
          {meeting.title}
        </h2>
        <div className="text-[10px] sm:text-[11px] text-stone-900 space-y-0.5 text-left bg-stone-50 border border-stone-300 rounded-md p-2">
          <div><strong>學年度：</strong>{meeting.academicYear}</div>
          <div><strong>開會時間：</strong>{meeting.meetingDate}</div>
          <div><strong>簽到開放：</strong><span className="font-bold underline">{timeWindowText}</span></div>
          <div><strong>地點：</strong>{meeting.location || '西門國小會議室'}</div>
          {linkedPost && (
            <div className="pt-0.5 border-t border-stone-300 truncate text-[10px] sm:text-[11px]">
              <strong>相關文章：</strong>
              <span className="font-bold underline cursor-pointer" onClick={() => {
                if (onOpenLinkedPost && meeting.linkedPostSlug) {
                  onClose();
                  onOpenLinkedPost(meeting.linkedPostSlug);
                }
              }}>
                {linkedPost.title}
              </span>
            </div>
          )}
        </div>
      </div>

      <div className={`grid gap-1.5 ${linkedPost && articleQrDataUrl ? 'grid-cols-2' : 'grid-cols-1'}`}>
        <div className="bg-white border border-black rounded-lg p-1 text-center">
          <div className="w-24 h-24 sm:w-28 sm:h-28 mx-auto flex items-center justify-center">
            {qrDataUrl ? (
              <img
                src={qrDataUrl}
                alt="簽到 QR Code"
                className="w-full h-full object-contain grayscale contrast-200"
              />
            ) : (
              <span className="text-[10px] text-stone-400">產生中...</span>
            )}
          </div>
          <div className="text-[10px] font-bold text-black mt-0.5">
            【1】手機線上簽到
          </div>
        </div>

        {linkedPost && (
          <div className="bg-white border border-black rounded-lg p-1 text-center">
            <div className="w-24 h-24 sm:w-28 sm:h-28 mx-auto flex items-center justify-center">
              {articleQrDataUrl ? (
                <img
                  src={articleQrDataUrl}
                  alt="相關文章 QR Code"
                  className="w-full h-full object-contain grayscale contrast-200"
                />
              ) : (
                <span className="text-[10px] text-stone-400">產生中...</span>
              )}
            </div>
            <div className="text-[10px] font-bold text-black mt-0.5">
              【2】相關文章閱讀
            </div>
          </div>
        )}
      </div>
    </div>
  );

  const renderCardFooter = () => (
    <div className="text-center space-y-0.5 pt-1.5 border-t border-black">
      <div className="text-[10px] sm:text-[11px] font-bold text-black">
        請使用手機掃描 QR Code 或登入 @{SCHOOL_DOMAIN}
      </div>
      <p className="text-[9px] sm:text-[10px] text-stone-700 leading-tight">
        完成線上親筆簽名、請假登記與期刊文章閱讀。
      </p>
      <div className="text-[10px] sm:text-[11px] font-extrabold text-black tracking-wide">
        領召：黃佩詩 &nbsp; 403教室 (分機：5207)
      </div>
    </div>
  );

  return createPortal(
    <div
      id="printable-quarter-notice-portal"
      className="fixed inset-0 z-[75] overflow-y-auto bg-stone-950/75 backdrop-blur-xs p-3 sm:p-6 flex flex-col items-center justify-center"
      role="dialog"
      aria-modal="true"
      aria-label="1/4 A4 會議通知單預覽與列印"
      onClick={onClose}
    >
      <div
        className="no-print w-full max-w-xl bg-white border border-stone-200 rounded-xl shadow-lg p-3.5 sm:p-4 mb-4 flex flex-wrap items-center justify-between gap-2.5 shrink-0"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="min-w-0">
          <div className="text-xs font-semibold text-stone-900">
            直式 A4 4合1黑白通知單（單頁含4個重複版面）
          </div>
          <div className="text-sm font-bold text-stone-950 truncate">
            {meeting.title}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            disabled={isGeneratingPdf}
            onClick={handleDownloadNoticePdf}
            className="px-3 py-2 text-xs font-semibold text-white bg-stone-900 hover:bg-stone-800 disabled:opacity-60 rounded-lg inline-flex items-center gap-1.5"
          >
            <Download className="w-3.5 h-3.5" />
            <span>{isGeneratingPdf ? '產製 PDF...' : '下載 4合1 PDF'}</span>
          </button>

          <button
            type="button"
            onClick={handleNativePrint}
            className="px-3 py-2 text-xs font-semibold text-stone-900 bg-stone-100 border border-stone-300 hover:bg-stone-200 rounded-lg inline-flex items-center gap-1.5"
          >
            <Printer className="w-3.5 h-3.5 text-stone-900" />
            <span>列印 4合1 A4</span>
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
        <div className="no-print w-full max-w-xl bg-stone-100 border border-stone-300 text-stone-900 rounded-lg px-3 py-2 text-xs mb-3 text-center">
          {noticeMessage}
        </div>
      )}

      {/* Screen Preview: compact single card */}
      <div className="no-print max-h-[75vh] overflow-y-auto p-2">
        <div className="text-center text-xs text-stone-300 mb-2">
          （下方為預覽畫面；點擊上方「下載 4合1 PDF」或「列印 4合1 A4」將自動在單張 A4 紙排版 4 個重複版面）
        </div>
        <div
          id="printable-quarter-notice-card"
          className="w-[105mm] h-[148.5mm] bg-white border-2 border-black rounded-lg shadow-2xl p-4 flex flex-col justify-between text-black font-sans mx-auto overflow-hidden"
          onClick={(e) => e.stopPropagation()}
        >
          {renderCardContent()}
          {renderCardFooter()}
        </div>
      </div>

      {/* Hidden print container with 4 identical cards in 2x2 grid layout for window.print() */}
      <div className="print-only-grid hidden">
        <div className="notice-grid-print">
          <div className="printable-quarter-notice-card-item" style={{border: '1.5px solid black', padding: '12px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', boxSizing: 'border-box', background: '#fff', height: '148.5mm', overflow: 'hidden'}}>
            {renderCardContent()}
            {renderCardFooter()}
          </div>
          <div className="printable-quarter-notice-card-item" style={{border: '1.5px solid black', padding: '12px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', boxSizing: 'border-box', background: '#fff', height: '148.5mm', overflow: 'hidden'}}>
            {renderCardContent()}
            {renderCardFooter()}
          </div>
          <div className="printable-quarter-notice-card-item" style={{border: '1.5px solid black', padding: '12px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', boxSizing: 'border-box', background: '#fff', height: '148.5mm', overflow: 'hidden'}}>
            {renderCardContent()}
            {renderCardFooter()}
          </div>
          <div className="printable-quarter-notice-card-item" style={{border: '1.5px solid black', padding: '12px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', boxSizing: 'border-box', background: '#fff', height: '148.5mm', overflow: 'hidden'}}>
            {renderCardContent()}
            {renderCardFooter()}
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
};
