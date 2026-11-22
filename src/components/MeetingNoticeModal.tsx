import React, {useEffect, useMemo, useState} from 'react';
import {createPortal} from 'react-dom';
import QRCode from 'qrcode';
import {
  Calendar,
  Check,
  Copy,
  Download,
  MapPin,
  Printer,
  QrCode,
  Users,
  Video,
  X,
} from 'lucide-react';
import {SCHOOL_DOMAIN} from '../services/googleAuth';
import {
  buildDirectCheckinUrl,
  MeetingSession,
} from '../services/meetingCheckinDb';
import {jsPDF} from 'jspdf';
import {triggerSafeBlobDownload} from '../utils/meetingPdfExport';

interface MeetingNoticeModalProps {
  meeting: MeetingSession | null;
  onClose: () => void;
}

export const MeetingNoticeModal: React.FC<MeetingNoticeModalProps> = ({
  meeting,
  onClose,
}) => {
  const [qrDataUrl, setQrDataUrl] = useState<string>('');
  const [copiedLink, setCopiedLink] = useState(false);
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);
  const [noticeMessage, setNoticeMessage] = useState<string | null>(null);

  const checkinUrl = useMemo(() => {
    if (!meeting) return '';
    return buildDirectCheckinUrl(meeting.audience, meeting.id);
  }, [meeting]);

  useEffect(() => {
    if (!checkinUrl) return;
    let active = true;
    void QRCode.toDataURL(checkinUrl, {
      width: 320,
      margin: 2,
      color: {
        dark: '#1E3A8A',
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
      setNoticeMessage('已送出 1/4 A4 通知單列印請求（可設定 A4 4合1或單張列印）。');
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
      // Create high-res A4 canvas packing 1/4 A4 notice
      const canvas = document.createElement('canvas');
      canvas.width = 1240;
      canvas.height = 1754;
      const ctx = canvas.getContext('2d')!;
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(0, 0, 1240, 1754);

      // Draw a clean quarter A4 card frame (top-left or centered 1/4)
      const cardW = 540;
      const cardH = 760;
      const cardX = (1240 - cardW) / 2;
      const cardY = 120;

      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(cardX, cardY, cardW, cardH);
      ctx.strokeStyle = '#1E3A8A';
      ctx.lineWidth = 3;
      ctx.strokeRect(cardX, cardY, cardW, cardH);

      // Header background
      ctx.fillStyle = '#1E3A8A';
      ctx.fillRect(cardX, cardY, cardW, 84);

      ctx.fillStyle = '#FFFFFF';
      ctx.font = '700 24px "Noto Sans TC", sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('臺北市西門國小 · 會議與簽到通知單', cardX + cardW / 2, cardY + 42);

      // Title & Metadata
      let ty = cardY + 110;
      ctx.fillStyle = '#1C1917';
      ctx.font = '700 26px "Noto Sans TC", sans-serif';
      ctx.textAlign = 'center';
      
      const titleClean = meeting.title;
      ctx.fillText(titleClean.length > 22 ? `${titleClean.slice(0, 22)}…` : titleClean, cardX + cardW / 2, ty);
      ty += 45;

      ctx.fillStyle = '#44403C';
      ctx.font = '500 18px "Noto Sans TC", sans-serif';
      ctx.fillText(`學年度：${meeting.academicYear}`, cardX + cardW / 2, ty);
      ty += 30;
      ctx.fillText(`時間：${meeting.meetingDate}`, cardX + cardW / 2, ty);
      ty += 30;
      ctx.fillText(`地點：${meeting.location || '西門國小會議室'}`, cardX + cardW / 2, ty);
      ty += 45;

      // Draw QR Code image if loaded
      if (qrDataUrl) {
        const qrImg = new Image();
        await new Promise((resolve) => {
          qrImg.onload = resolve;
          qrImg.onerror = resolve;
          qrImg.src = qrDataUrl;
        });
        const qrSize = 240;
        ctx.drawImage(
          qrImg,
          cardX + (cardW - qrSize) / 2,
          ty,
          qrSize,
          qrSize,
        );
        ty += qrSize + 25;
      }

      ctx.fillStyle = '#1E3A8A';
      ctx.font = '700 17px "Noto Sans TC", sans-serif';
      ctx.fillText(`請使用手機掃描 QR Code 或登入 @${SCHOOL_DOMAIN}`, cardX + cardW / 2, ty);
      ty += 26;
      ctx.fillStyle = '#57534E';
      ctx.font = '400 15px "Noto Sans TC", sans-serif';
      ctx.fillText('完成線上親筆簽名與請假登記', cardX + cardW / 2, ty);

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
      triggerSafeBlobDownload(blob, `會議通知單_14A4_${safeFile}.pdf`);
      setNoticeMessage('已成功產生 1/4 A4 會議通知單 PDF 檔！');
    } catch (err: any) {
      setNoticeMessage(err?.message || '產生通知單 PDF 失敗，請改用系統列印。');
    } finally {
      setIsGeneratingPdf(false);
    }
  };

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
          <div className="text-xs font-semibold text-[#1E3A8A]">
            直式 A4 大小的 1/4 通知單（便條／發放卡片格式）
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
            className="px-3 py-2 text-xs font-semibold text-white bg-[#1E3A8A] hover:bg-[#172554] disabled:opacity-60 rounded-lg inline-flex items-center gap-1.5"
          >
            <Download className="w-3.5 h-3.5" />
            <span>{isGeneratingPdf ? '產製 PDF...' : '下載 PDF'}</span>
          </button>

          <button
            type="button"
            onClick={handleNativePrint}
            className="px-3 py-2 text-xs font-semibold text-stone-800 bg-[#F7F4EE] border border-stone-300 hover:bg-stone-200/70 rounded-lg inline-flex items-center gap-1.5"
          >
            <Printer className="w-3.5 h-3.5 text-[#1E3A8A]" />
            <span>列印通知單</span>
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
        <div className="no-print w-full max-w-xl bg-emerald-50 border border-emerald-200 text-emerald-950 rounded-lg px-3 py-2 text-xs mb-3 text-center">
          {noticeMessage}
        </div>
      )}

      {/* Printable 1/4 A4 Notice Card Container */}
      <div
        id="printable-quarter-notice-card"
        className="w-[105mm] min-h-[148.5mm] bg-white border-2 border-[#1E3A8A] rounded-xl shadow-2xl p-5 flex flex-col justify-between text-stone-900"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="space-y-3">
          <div className="bg-[#1E3A8A] text-white -mx-5 -mt-5 p-3.5 text-center rounded-t-lg space-y-0.5">
            <div className="text-[11px] font-bold tracking-widest uppercase opacity-90">
              臺北市西門國民小學
            </div>
            <div className="font-editorial text-base font-bold">
              {meeting.audience === 'parent' ? '學校日家長簽到通知單' : '教師社群會議簽到通知單'}
            </div>
          </div>

          <div className="space-y-1.5 pt-1 text-center">
            <h2 className="font-editorial text-base sm:text-lg font-bold text-stone-950 leading-snug">
              {meeting.title}
            </h2>
            <div className="text-xs text-stone-600 space-y-0.5">
              <div><strong>學年度：</strong>{meeting.academicYear}</div>
              <div><strong>時間：</strong>{meeting.meetingDate}</div>
              <div><strong>地點：</strong>{meeting.location || '西門國小會議室'}</div>
            </div>
          </div>

          <div className="w-40 h-40 mx-auto bg-white border border-stone-200 rounded-xl p-2 shadow-2xs flex items-center justify-center">
            {qrDataUrl ? (
              <img
                src={qrDataUrl}
                alt="簽到 QR Code"
                className="w-full h-full object-contain"
              />
            ) : (
              <span className="text-[11px] text-stone-400">QR 碼產生中...</span>
            )}
          </div>
        </div>

        <div className="text-center space-y-1.5 pt-2 border-t border-stone-200">
          <div className="text-xs font-bold text-[#1E3A8A]">
            請用手機掃描 QR Code 或登入 @{SCHOOL_DOMAIN}
          </div>
          <p className="text-[11px] text-stone-500 leading-tight">
            開啟線上簽到專區，完成親筆簽名與請假登記。
          </p>
        </div>
      </div>
    </div>,
    document.body,
  );
};
