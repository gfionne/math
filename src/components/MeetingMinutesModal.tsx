import React, {useEffect, useMemo, useState} from 'react';
import {createPortal} from 'react-dom';
import {
  CheckSquare,
  Download,
  FileSpreadsheet,
  FileText,
  Printer,
  Settings2,
  Users,
  X,
} from 'lucide-react';
import {
  isTeacherOnLeaveStatus,
  isValidSignatureDataUrl,
  MeetingCheckin,
  MeetingSession,
  normalizeTeacherAttendanceStatus,
  subscribeAllCheckinsForAdmin,
  subscribeMeetings,
} from '../services/meetingCheckinDb';
import {JournalPost} from '../types/journal';
import {
  buildPrintableMeetingMinutesHtml,
  generateMeetingMinutesPdfBlob,
  MeetingMinutesConfig,
  parseJournalMarkdownToMinutesBlocks,
  summarizeTeacherAttendanceForMinutes,
} from '../utils/meetingMinutesExport';
import {triggerSafeBlobDownload} from '../utils/meetingPdfExport';
import {formatCategoryDisplay} from '../utils/postFormatting';

interface MeetingMinutesModalProps {
  post: JournalPost | null;
  onClose: () => void;
}

export const MeetingMinutesModal: React.FC<MeetingMinutesModalProps> = ({
  post,
  onClose,
}) => {
  const [sessions, setSessions] = useState<MeetingSession[]>([]);
  const [allCheckins, setAllCheckins] = useState<MeetingCheckin[]>([]);
  const [selectedMeetingId, setSelectedMeetingId] = useState<string>('');
  const [hasAutoMatchedSession, setHasAutoMatchedSession] = useState(false);

  const [schoolName, setSchoolName] = useState('臺北市萬華區西門國民小學');
  const [docCategory, setDocCategory] = useState(
    '領域教學研究會／教師專業學習社群會議記錄',
  );
  const [meetingTitle, setMeetingTitle] = useState('');
  const [academicYear, setAcademicYear] = useState('');
  const [meetingDate, setMeetingDate] = useState('');
  const [location, setLocation] = useState('本校會議室 / 線上共備');
  const [chairperson, setChairperson] = useState('數學領域召集人');
  const [recorder, setRecorder] = useState('');
  const [attendanceSummary, setAttendanceSummary] = useState(
    '應到：＿＿ 人｜實到：＿＿ 人（如附簽到表）',
  );
  const [leaveSummary, setLeaveSummary] = useState('');
  const [includeAttachmentSheet, setIncludeAttachmentSheet] = useState(true);
  const [showEditorPanel, setShowEditorPanel] = useState(true);

  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);
  const [exportNotice, setExportNotice] = useState<string | null>(null);
  const [readyPdfDownload, setReadyPdfDownload] = useState<{
    url: string;
    filename: string;
  } | null>(null);

  // Reset form fields whenever a new post is selected
  useEffect(() => {
    if (!post) return;
    setMeetingTitle(post.title);
    setAcademicYear(post.academicYear || '114 學年度');
    setMeetingDate(post.publishedAt || '');
    setLocation('本校會議室 / 線上共備');
    setChairperson('數學領域召集人');
    setRecorder(post.author || '紀錄教師');
    setAttendanceSummary('應到：＿＿ 人｜實到：＿＿ 人（如現場紙本簽到）');
    setLeaveSummary('');
    setSelectedMeetingId('');
    setHasAutoMatchedSession(false);
    setIncludeAttachmentSheet(true);
    setExportNotice(null);
    if (readyPdfDownload?.url) {
      URL.revokeObjectURL(readyPdfDownload.url);
      setReadyPdfDownload(null);
    }
  }, [post?.slug]);

  // Subscribe to teacher meetings & check-ins while modal is open (admin-only modal)
  useEffect(() => {
    if (!post) {
      setSessions([]);
      setAllCheckins([]);
      return;
    }

    const unsubMeetings = subscribeMeetings(
      (list) => setSessions(list),
      () => {},
    );
    const unsubCheckins = subscribeAllCheckinsForAdmin(
      (list) => setAllCheckins(list),
      () => {},
    );

    return () => {
      unsubMeetings();
      unsubCheckins();
    };
  }, [post]);

  // Auto-match linked meeting session once sessions load
  useEffect(() => {
    if (!post || hasAutoMatchedSession || sessions.length === 0) return;
    const matched = sessions.find((s) => s.linkedPostSlug === post.slug);
    if (matched) {
      setSelectedMeetingId(matched.id);
    }
    setHasAutoMatchedSession(true);
  }, [post, sessions, hasAutoMatchedSession]);

  const linkedMeeting = useMemo(
    () => sessions.find((s) => s.id === selectedMeetingId) ?? null,
    [sessions, selectedMeetingId],
  );

  const linkedCheckins = useMemo(() => {
    if (!selectedMeetingId) return [];
    return allCheckins
      .filter((c) => c.meetingId === selectedMeetingId)
      .sort((a, b) => a.checkedInAtMs - b.checkedInAtMs);
  }, [allCheckins, selectedMeetingId]);

  // Sync attendance stats & session info when user picks a linked meeting session
  useEffect(() => {
    if (!post) return;
    if (!linkedMeeting) {
      return;
    }
    if (linkedMeeting.meetingDate) {
      setMeetingDate(linkedMeeting.meetingDate);
    }
    if (linkedMeeting.location) {
      setLocation(linkedMeeting.location);
    }
    if (linkedMeeting.createdByName) {
      setChairperson(linkedMeeting.createdByName);
    }
    const stats = summarizeTeacherAttendanceForMinutes(linkedCheckins);
    setAttendanceSummary(stats.attendanceSummary);
    setLeaveSummary(stats.leaveSummary);
  }, [post, linkedMeeting, linkedCheckins]);

  useEffect(() => {
    if (!post) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [post, onClose]);

  useEffect(() => {
    return () => {
      if (readyPdfDownload?.url) {
        URL.revokeObjectURL(readyPdfDownload.url);
      }
      document.body.classList.remove('printing-meeting-minutes');
    };
  }, [readyPdfDownload]);

  const parsedBlocks = useMemo(
    () => (post ? parseJournalMarkdownToMinutesBlocks(post) : []),
    [post],
  );

  if (!post || typeof document === 'undefined') return null;

  const currentConfig: MeetingMinutesConfig = {
    schoolName: schoolName.trim() || '臺北市萬華區西門國民小學',
    docCategory:
      docCategory.trim() || '領域教學研究會／教師專業學習社群會議記錄',
    meetingTitle: meetingTitle.trim() || post.title,
    academicYear: academicYear.trim() || post.academicYear,
    meetingDate: meetingDate.trim() || post.publishedAt,
    location: location.trim() || '本校會議室',
    chairperson: chairperson.trim() || '領域召集人',
    recorder: recorder.trim() || post.author || '紀錄教師',
    attendanceSummary: attendanceSummary.trim() || '—',
    leaveSummary: leaveSummary.trim(),
    includeAttachmentSheet: Boolean(
      includeAttachmentSheet && linkedMeeting && linkedCheckins.length > 0,
    ),
    linkedMeeting,
    linkedCheckins,
  };

  const safeFileBase = (currentConfig.meetingTitle || '會議記錄')
    .replace(/[\\/:*?"<>|]/g, '_')
    .slice(0, 42);

  const handleDownloadPdf = async () => {
    setIsGeneratingPdf(true);
    setExportNotice(null);
    try {
      const pdfBlob = await generateMeetingMinutesPdfBlob(post, currentConfig);
      const filename = `會議記錄_${safeFileBase}.pdf`;
      const downloadUrl = URL.createObjectURL(pdfBlob);
      if (readyPdfDownload?.url) {
        URL.revokeObjectURL(readyPdfDownload.url);
      }
      setReadyPdfDownload({url: downloadUrl, filename});
      triggerSafeBlobDownload(pdfBlob, filename);
      setExportNotice(
        '已產生正式 A4 會議記錄 PDF 檔；若瀏覽器未自動儲存，可點右側「手動下載 PDF 檔」。',
      );
    } catch (err: any) {
      setExportNotice(
        err?.message || '產生 PDF 失敗，請改用「系統列印 / 另存 PDF」或「下載 Word 檔」。',
      );
    } finally {
      setIsGeneratingPdf(false);
    }
  };

  const handleNativePrint = () => {
    document.body.classList.add('printing-meeting-minutes');
    const cleanup = () => {
      document.body.classList.remove('printing-meeting-minutes');
      window.removeEventListener('afterprint', cleanup);
    };
    window.addEventListener('afterprint', cleanup);
    try {
      window.print();
      setExportNotice('已送出系統列印請求（含頁首核章欄與附錄簽到表）。');
    } catch {
      cleanup();
      setExportNotice('此瀏覽環境不支援直接呼叫列印，請點選「直接下載 PDF 檔」。');
    }
    window.setTimeout(cleanup, 3000);
  };

  const handleDownloadWord = () => {
    const html = buildPrintableMeetingMinutesHtml(post, currentConfig, {
      forWord: true,
    });
    const blob = new Blob(['\uFEFF' + html], {
      type: 'application/msword;charset=utf-8',
    });
    triggerSafeBlobDownload(blob, `會議記錄_${safeFileBase}.doc`);
    setExportNotice('已下載 Word 可編輯文件（.doc），可直接以 Word 或 Google 文件微調後列印核章。');
  };

  const handleDownloadHtml = () => {
    const html = buildPrintableMeetingMinutesHtml(post, currentConfig, {
      forWord: false,
    });
    const blob = new Blob([html], {type: 'text/html;charset=utf-8;'});
    triggerSafeBlobDownload(blob, `會議記錄_${safeFileBase}.html`);
    setExportNotice('已下載離線可列印 HTML 會議記錄檔案。');
  };

  const formatDateTime = (ms: number) =>
    new Date(ms).toLocaleString('zh-TW', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });

  const hasExplicitLeaves = linkedCheckins.some((c) =>
    isTeacherOnLeaveStatus(normalizeTeacherAttendanceStatus(c.attendanceStatus)),
  );

  return createPortal(
    <div
      id="printable-meeting-minutes-portal"
      className="fixed inset-0 z-[75] overflow-y-auto bg-stone-950/75 backdrop-blur-xs p-3 sm:p-6 flex flex-col items-center"
      role="dialog"
      aria-modal="true"
      aria-label="會議記錄輸出與核章預覽"
      onClick={onClose}
    >
      {/* Top Action Toolbar (Hidden when printing) */}
      <div
        className="no-print w-full max-w-6xl bg-white border border-stone-200 rounded-xl shadow-lg p-3.5 sm:p-4 mb-4 space-y-3 shrink-0"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="text-xs font-semibold text-[#1E3A8A]">
              管理者專屬功能 · 期刊一鍵轉正式會議記錄（含核章欄）
            </div>
            <div className="text-sm sm:text-base font-bold text-stone-950 truncate">
              {currentConfig.meetingTitle}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setShowEditorPanel((prev) => !prev)}
              className={`px-3 py-2 text-xs font-medium border rounded-lg inline-flex items-center gap-1.5 transition-colors ${
                showEditorPanel
                  ? 'bg-[#1E3A8A]/8 text-[#1E3A8A] border-[#1E3A8A]/30'
                  : 'bg-white text-stone-700 border-stone-300 hover:bg-stone-50'
              }`}
            >
              <Settings2 className="w-3.5 h-3.5" />
              <span>{showEditorPanel ? '收合欄位設定' : '調整會議欄位 / 連動簽到表'}</span>
            </button>

            <button
              type="button"
              disabled={isGeneratingPdf}
              onClick={handleDownloadPdf}
              className="px-3.5 py-2 text-xs font-semibold text-white bg-[#1E3A8A] hover:bg-[#172554] disabled:opacity-60 rounded-lg inline-flex items-center gap-1.5"
            >
              <Download className="w-3.5 h-3.5" />
              <span>
                {isGeneratingPdf ? '產製 PDF 中...' : '直接下載 PDF 檔'}
              </span>
            </button>

            <button
              type="button"
              onClick={handleDownloadWord}
              className="px-3 py-2 text-xs font-semibold text-stone-800 bg-[#F7F4EE] border border-stone-300 hover:bg-stone-200/70 rounded-lg inline-flex items-center gap-1.5"
            >
              <FileSpreadsheet className="w-3.5 h-3.5 text-[#1E3A8A]" />
              <span>下載 Word (.doc)</span>
            </button>

            <button
              type="button"
              onClick={handleNativePrint}
              className="px-3 py-2 text-xs font-semibold text-stone-800 bg-white border border-stone-300 hover:bg-stone-50 rounded-lg inline-flex items-center gap-1.5"
            >
              <Printer className="w-3.5 h-3.5 text-[#1E3A8A]" />
              <span>系統列印 / 另存 PDF</span>
            </button>

            <button
              type="button"
              onClick={handleDownloadHtml}
              className="px-3 py-2 text-xs font-medium text-stone-700 bg-white border border-stone-300 hover:bg-stone-50 rounded-lg inline-flex items-center gap-1.5"
            >
              <FileText className="w-3.5 h-3.5" />
              <span>HTML</span>
            </button>

            <button
              type="button"
              onClick={onClose}
              aria-label="關閉視窗"
              className="p-2 text-stone-500 hover:text-stone-900 hover:bg-stone-100 rounded-lg"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {(exportNotice || readyPdfDownload) && (
          <div className="flex flex-wrap items-center justify-between gap-2 bg-emerald-50 border border-emerald-200 text-emerald-950 rounded-lg px-3 py-2 text-xs">
            <span>{exportNotice}</span>
            {readyPdfDownload && (
              <a
                href={readyPdfDownload.url}
                download={readyPdfDownload.filename}
                className="px-2.5 py-1 bg-[#1E3A8A] text-white font-semibold rounded-md hover:bg-[#172554] shrink-0"
              >
                手動下載 PDF 檔
              </a>
            )}
          </div>
        )}
      </div>

      {/* Main Split Body: Left Quick Editor (no-print) + Right Formal A4 Preview */}
      <div
        className="w-full max-w-6xl flex flex-col lg:flex-row items-start gap-5"
        onClick={(e) => e.stopPropagation()}
      >
        {showEditorPanel && (
          <aside className="no-print w-full lg:w-[340px] shrink-0 bg-white border border-stone-200 rounded-xl shadow-lg p-4 sm:p-5 space-y-4">
            <div className="border-b border-stone-100 pb-2.5">
              <h3 className="font-editorial text-base font-bold text-stone-950">
                會議記錄表頭與簽到連動
              </h3>
              <p className="text-[11px] text-stone-500 mt-0.5 leading-relaxed">
                修改下方欄位會即時反映於右側正式公文預覽，並同步套用至 PDF、Word 與列印格式。
              </p>
            </div>

            {/* Linked Teacher Check-in Session Selector */}
            <div className="bg-[#FAF8F5] border border-stone-200 rounded-lg p-3 space-y-2">
              <label className="flex items-center gap-1.5 text-xs font-bold text-[#1E3A8A]">
                <Users className="w-3.5 h-3.5" />
                <span>帶入教師線上簽到與請假紀錄</span>
              </label>
              <select
                value={selectedMeetingId}
                onChange={(e) => {
                  const nextId = e.target.value;
                  setSelectedMeetingId(nextId);
                  if (!nextId) {
                    setAttendanceSummary(
                      '應到：＿＿ 人｜實到：＿＿ 人（如現場紙本簽到）',
                    );
                    setLeaveSummary('');
                  }
                }}
                className="w-full px-2.5 py-1.5 text-xs bg-white border border-stone-300 rounded-md focus:outline-none focus:ring-2 focus:ring-[#1E3A8A]"
              >
                <option value="">（不帶入線上簽到場次／手動填寫）</option>
                {sessions.map((s) => {
                  const cnt = allCheckins.filter(
                    (c) => c.meetingId === s.id,
                  ).length;
                  return (
                    <option key={s.id} value={s.id}>
                      {s.linkedPostSlug === post.slug ? '★ [已關聯] ' : ''}
                      {s.title}（{s.meetingDate} · {cnt} 筆）
                    </option>
                  );
                })}
              </select>

              {linkedMeeting && (
                <label className="flex items-start gap-2 text-[11px] text-stone-700 cursor-pointer pt-1">
                  <input
                    type="checkbox"
                    checked={includeAttachmentSheet}
                    onChange={(e) => setIncludeAttachmentSheet(e.target.checked)}
                    className="mt-0.5 rounded border-stone-300 text-[#1E3A8A]"
                  />
                  <span>
                    在會議記錄末頁附錄此場次的「教師出席與請假簽到明細表（含親筆簽名與核章欄）」（共{' '}
                    {linkedCheckins.length} 筆）
                  </span>
                </label>
              )}
            </div>

            <div className="space-y-2.5 text-xs">
              <div>
                <label className="block font-medium text-stone-700 mb-1">
                  學校 / 機關全銜
                </label>
                <input
                  type="text"
                  value={schoolName}
                  onChange={(e) => setSchoolName(e.target.value)}
                  className="w-full px-3 py-1.5 border border-stone-300 rounded-md focus:outline-none focus:ring-2 focus:ring-[#1E3A8A]"
                />
              </div>

              <div>
                <label className="block font-medium text-stone-700 mb-1">
                  會議記錄文件標題
                </label>
                <input
                  type="text"
                  value={docCategory}
                  onChange={(e) => setDocCategory(e.target.value)}
                  className="w-full px-3 py-1.5 border border-stone-300 rounded-md focus:outline-none focus:ring-2 focus:ring-[#1E3A8A]"
                />
              </div>

              <div>
                <label className="block font-medium text-stone-700 mb-1">
                  會議名稱
                </label>
                <input
                  type="text"
                  value={meetingTitle}
                  onChange={(e) => setMeetingTitle(e.target.value)}
                  className="w-full px-3 py-1.5 border border-stone-300 rounded-md focus:outline-none focus:ring-2 focus:ring-[#1E3A8A]"
                />
              </div>

              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label className="block font-medium text-stone-700 mb-1">
                    學年度
                  </label>
                  <input
                    type="text"
                    value={academicYear}
                    onChange={(e) => setAcademicYear(e.target.value)}
                    className="w-full px-3 py-1.5 border border-stone-300 rounded-md focus:outline-none focus:ring-2 focus:ring-[#1E3A8A]"
                  />
                </div>
                <div>
                  <label className="block font-medium text-stone-700 mb-1">
                    會議時間
                  </label>
                  <input
                    type="text"
                    value={meetingDate}
                    onChange={(e) => setMeetingDate(e.target.value)}
                    className="w-full px-3 py-1.5 font-mono-tabular border border-stone-300 rounded-md focus:outline-none focus:ring-2 focus:ring-[#1E3A8A]"
                  />
                </div>
              </div>

              <div>
                <label className="block font-medium text-stone-700 mb-1">
                  會議地點
                </label>
                <input
                  type="text"
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  className="w-full px-3 py-1.5 border border-stone-300 rounded-md focus:outline-none focus:ring-2 focus:ring-[#1E3A8A]"
                />
              </div>

              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label className="block font-medium text-stone-700 mb-1">
                    主席 / 召集人
                  </label>
                  <input
                    type="text"
                    value={chairperson}
                    onChange={(e) => setChairperson(e.target.value)}
                    className="w-full px-3 py-1.5 border border-stone-300 rounded-md focus:outline-none focus:ring-2 focus:ring-[#1E3A8A]"
                  />
                </div>
                <div>
                  <label className="block font-medium text-stone-700 mb-1">
                    會議紀錄
                  </label>
                  <input
                    type="text"
                    value={recorder}
                    onChange={(e) => setRecorder(e.target.value)}
                    className="w-full px-3 py-1.5 border border-stone-300 rounded-md focus:outline-none focus:ring-2 focus:ring-[#1E3A8A]"
                  />
                </div>
              </div>

              <div>
                <label className="block font-medium text-stone-700 mb-1">
                  出席統計說明
                </label>
                <textarea
                  rows={2}
                  value={attendanceSummary}
                  onChange={(e) => setAttendanceSummary(e.target.value)}
                  className="w-full px-3 py-1.5 border border-stone-300 rounded-md focus:outline-none focus:ring-2 focus:ring-[#1E3A8A]"
                />
              </div>

              <div>
                <label className="block font-medium text-stone-700 mb-1">
                  請假人員與假別備註（選填）
                </label>
                <textarea
                  rows={2}
                  value={leaveSummary}
                  onChange={(e) => setLeaveSummary(e.target.value)}
                  placeholder="例如：王老師（公假：研習）、陳老師（事假）"
                  className="w-full px-3 py-1.5 border border-stone-300 rounded-md focus:outline-none focus:ring-2 focus:ring-[#1E3A8A]"
                />
              </div>
            </div>

            <div className="pt-1 flex items-center gap-1.5 text-[11px] text-stone-500">
              <CheckSquare className="w-3.5 h-3.5 text-[#1E3A8A] shrink-0" />
              <span>已自動於文末加入：紀錄、教學組長、教務主任、校長核章欄</span>
            </div>
          </aside>
        )}

        {/* Right: Formal Printable A4 Meeting Minutes Sheet */}
        <div
          id="printable-meeting-minutes-card"
          className="flex-1 min-w-0 w-full bg-white border border-stone-200 rounded-xl shadow-xl p-6 sm:p-10 space-y-5 text-stone-900"
        >
          {/* Header */}
          <div className="text-center space-y-1 border-b-2 border-[#1E3A8A] pb-3.5">
            <div className="font-editorial text-xl sm:text-2xl font-bold tracking-wider text-stone-950">
              {currentConfig.schoolName}
            </div>
            <div className="text-sm sm:text-base font-bold text-[#1E3A8A]">
              {currentConfig.docCategory}
            </div>
          </div>

          {/* Metadata Table */}
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-xs sm:text-[13px]">
              <tbody>
                <tr>
                  <td className="w-28 border border-stone-400 bg-[#F5F2EB] py-2 px-2.5 text-center font-bold text-stone-900">
                    會議名稱
                  </td>
                  <td
                    colSpan={3}
                    className="border border-stone-400 py-2 px-3 font-bold text-stone-950"
                  >
                    {currentConfig.meetingTitle}
                  </td>
                </tr>
                <tr>
                  <td className="border border-stone-400 bg-[#F5F2EB] py-2 px-2.5 text-center font-bold text-stone-900">
                    學年度
                  </td>
                  <td className="border border-stone-400 py-2 px-3 font-mono-tabular">
                    {currentConfig.academicYear}
                  </td>
                  <td className="w-28 border border-stone-400 bg-[#F5F2EB] py-2 px-2.5 text-center font-bold text-stone-900">
                    會議時間
                  </td>
                  <td className="border border-stone-400 py-2 px-3 font-mono-tabular">
                    {currentConfig.meetingDate}
                  </td>
                </tr>
                <tr>
                  <td className="border border-stone-400 bg-[#F5F2EB] py-2 px-2.5 text-center font-bold text-stone-900">
                    會議地點
                  </td>
                  <td className="border border-stone-400 py-2 px-3">
                    {currentConfig.location}
                  </td>
                  <td className="border border-stone-400 bg-[#F5F2EB] py-2 px-2.5 text-center font-bold text-stone-900">
                    主席 / 召集人
                  </td>
                  <td className="border border-stone-400 py-2 px-3">
                    {currentConfig.chairperson}
                  </td>
                </tr>
                <tr>
                  <td className="border border-stone-400 bg-[#F5F2EB] py-2 px-2.5 text-center font-bold text-stone-900">
                    會議紀錄
                  </td>
                  <td className="border border-stone-400 py-2 px-3">
                    {currentConfig.recorder}
                  </td>
                  <td className="border border-stone-400 bg-[#F5F2EB] py-2 px-2.5 text-center font-bold text-stone-900">
                    專題分類
                  </td>
                  <td className="border border-stone-400 py-2 px-3">
                    {formatCategoryDisplay(post.category)}
                  </td>
                </tr>
                <tr>
                  <td className="border border-stone-400 bg-[#F5F2EB] py-2 px-2.5 text-center font-bold text-stone-900">
                    出席統計
                  </td>
                  <td colSpan={3} className="border border-stone-400 py-2 px-3">
                    {currentConfig.attendanceSummary}
                  </td>
                </tr>
                {currentConfig.leaveSummary && (
                  <tr>
                    <td className="border border-stone-400 bg-[#F5F2EB] py-2 px-2.5 text-center font-bold text-stone-900">
                      請假明細
                    </td>
                    <td
                      colSpan={3}
                      className={`border border-stone-400 py-2 px-3 ${
                        hasExplicitLeaves ? 'bg-amber-50/70' : ''
                      }`}
                    >
                      {currentConfig.leaveSummary}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Section I: Summary */}
          {post.summary && post.summary.trim() && (
            <section className="space-y-2">
              <h3 className="bg-[#F5F2EB] border border-stone-300 border-l-4 border-l-[#1E3A8A] px-3 py-1.5 text-sm font-bold text-stone-950">
                壹、會議摘要與討論緣起
              </h3>
              <p className="text-sm text-stone-800 leading-relaxed px-1">
                {post.summary}
              </p>
            </section>
          )}

          {/* Section II: Parsed Body */}
          <section className="space-y-2.5">
            <h3 className="bg-[#F5F2EB] border border-stone-300 border-l-4 border-l-[#1E3A8A] px-3 py-1.5 text-sm font-bold text-stone-950">
              {post.summary && post.summary.trim()
                ? '貳、會議內容與決議事項'
                : '壹、會議內容與決議事項'}
            </h3>

            <div className="space-y-2.5 px-1 text-sm leading-relaxed text-stone-800">
              {parsedBlocks.map((block, idx) => {
                if (block.type === 'divider') {
                  return <hr key={idx} className="border-stone-200 my-3" />;
                }
                if (block.type === 'heading') {
                  return block.level === 2 ? (
                    <h4
                      key={idx}
                      className="text-base font-bold text-[#1E3A8A] pt-2"
                    >
                      {block.text}
                    </h4>
                  ) : (
                    <h5
                      key={idx}
                      className="text-sm font-bold text-stone-900 pt-1"
                    >
                      {block.text}
                    </h5>
                  );
                }
                if (block.type === 'paragraph') {
                  return <p key={idx}>{block.text}</p>;
                }
                if (block.type === 'bullet') {
                  return (
                    <div key={idx} className="flex items-start gap-2 pl-2">
                      <span className="text-[#1E3A8A] font-bold">•</span>
                      <span>{block.text}</span>
                    </div>
                  );
                }
                if (block.type === 'numbered') {
                  return (
                    <div key={idx} className="flex items-start gap-2 pl-2">
                      <span className="text-[#1E3A8A] font-bold font-mono-tabular">
                        {block.index}.
                      </span>
                      <span>{block.text}</span>
                    </div>
                  );
                }
                if (block.type === 'quote') {
                  return (
                    <div
                      key={idx}
                      className="bg-[#FAF8F5] border border-stone-300 rounded-md px-3.5 py-2.5 text-stone-700 text-[13px]"
                    >
                      {block.text}
                    </div>
                  );
                }
                if (block.type === 'table') {
                  return (
                    <div key={idx} className="overflow-x-auto py-1">
                      <table className="w-full border-collapse text-xs">
                        <thead>
                          <tr className="bg-[#F5F2EB]">
                            {block.headers.map((h, hIdx) => (
                              <th
                                key={hIdx}
                                className="border border-stone-300 py-1.5 px-2.5 text-left font-bold text-stone-900"
                              >
                                {h}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {block.rows.map((r, rIdx) => (
                            <tr key={rIdx}>
                              {block.headers.map((_, cIdx) => (
                                <td
                                  key={cIdx}
                                  className="border border-stone-300 py-1.5 px-2.5 text-stone-700"
                                >
                                  {r[cIdx] || ''}
                                </td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  );
                }
                return null;
              })}
            </div>
          </section>

          {/* Optional Attachment Link */}
          {post.embedUrl && (
            <section className="space-y-1.5">
              <h3 className="bg-[#F5F2EB] border border-stone-300 border-l-4 border-l-[#1E3A8A] px-3 py-1.5 text-sm font-bold text-stone-950">
                {post.summary && post.summary.trim()
                  ? '參、相關附件與參考連結'
                  : '貳、相關附件與參考連結'}
              </h3>
              <p className="text-xs text-[#1E3A8A] break-all px-1">
                {post.embedLabel || '雲端附件 / 教材資料'}：{post.embedUrl}
              </p>
            </section>
          )}

          {/* Approval Stamp Block */}
          <div className="pt-4 avoid-break">
            <table className="w-full border-collapse text-xs sm:text-sm">
              <thead>
                <tr className="bg-[#F5F2EB] text-stone-900">
                  <th className="w-1/4 border border-stone-400 py-2 px-3 text-center font-bold">
                    紀錄
                  </th>
                  <th className="w-1/4 border border-stone-400 py-2 px-3 text-center font-bold">
                    教學組長
                  </th>
                  <th className="w-1/4 border border-stone-400 py-2 px-3 text-center font-bold">
                    教務主任
                  </th>
                  <th className="w-1/4 border border-stone-400 py-2 px-3 text-center font-bold">
                    校長
                  </th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td className="h-20 border border-stone-400 bg-white" />
                  <td className="h-20 border border-stone-400 bg-white" />
                  <td className="h-20 border border-stone-400 bg-white" />
                  <td className="h-20 border border-stone-400 bg-white" />
                </tr>
              </tbody>
            </table>
          </div>

          {/* Optional Attached Teacher Attendance & Leave Roster */}
          {currentConfig.includeAttachmentSheet &&
            currentConfig.linkedMeeting && (
              <div className="pt-6 border-t-2 border-dashed border-stone-300 space-y-3">
                <div>
                  <div className="text-xs font-bold text-[#1E3A8A]">
                    附件：教師出席與請假簽到明細表
                  </div>
                  <h4 className="font-editorial text-base font-bold text-stone-950">
                    {currentConfig.linkedMeeting.title ||
                      currentConfig.meetingTitle}
                  </h4>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="bg-[#F5F2EB] text-stone-800">
                        <th className="border border-stone-300 py-2 px-2 text-center w-9">
                          #
                        </th>
                        <th className="border border-stone-300 py-2 px-2.5">
                          教師姓名
                        </th>
                        <th className="border border-stone-300 py-2 px-2.5">
                          校內帳號信箱
                        </th>
                        <th className="border border-stone-300 py-2 px-2.5">
                          狀態 / 職務與請假備註
                        </th>
                        <th className="border border-stone-300 py-2 px-2.5 text-center w-36">
                          親筆簽名 / 請假別
                        </th>
                        <th className="border border-stone-300 py-2 px-2.5">
                          簽到時間
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {currentConfig.linkedCheckins.map((rec, idx) => {
                        const status = normalizeTeacherAttendanceStatus(
                          rec.attendanceStatus,
                        );
                        const isLeave = isTeacherOnLeaveStatus(status);
                        const noteParts = [
                          status,
                          rec.roleOrNote.trim(),
                          rec.leaveNote.trim(),
                        ].filter(Boolean);
                        return (
                          <tr
                            key={rec.id}
                            className={isLeave ? 'bg-amber-50/70' : undefined}
                          >
                            <td className="border border-stone-300 py-1.5 px-2 text-center font-mono-tabular text-stone-600">
                              {idx + 1}
                            </td>
                            <td className="border border-stone-300 py-1.5 px-2.5 font-semibold text-stone-950">
                              {rec.userName}
                            </td>
                            <td className="border border-stone-300 py-1.5 px-2.5 font-mono-tabular text-stone-600 break-all">
                              {rec.userEmail || '（管理員代登）'}
                            </td>
                            <td className="border border-stone-300 py-1.5 px-2.5 text-stone-700">
                              {noteParts.join('｜') || '—'}
                            </td>
                            <td className="border border-stone-300 py-1 px-2 text-center bg-white">
                              {isValidSignatureDataUrl(rec.signatureDataUrl) ? (
                                <img
                                  src={rec.signatureDataUrl}
                                  alt={`${rec.userName}親筆簽名`}
                                  className="h-10 w-28 object-contain mx-auto"
                                />
                              ) : isLeave ? (
                                <span className="inline-block px-2 py-0.5 text-[11px] font-bold text-amber-900 bg-amber-50 border border-amber-200 rounded-md">
                                  請假：{status}
                                </span>
                              ) : (
                                <span className="text-[11px] text-stone-400">
                                  （未附簽名）
                                </span>
                              )}
                            </td>
                            <td className="border border-stone-300 py-1.5 px-2.5 font-mono-tabular text-stone-600 whitespace-nowrap">
                              {formatDateTime(rec.checkedInAtMs)}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                <div className="pt-2 avoid-break">
                  <table className="w-full border-collapse text-xs">
                    <thead>
                      <tr className="bg-[#F5F2EB] text-stone-900">
                        <th className="w-1/3 border border-stone-300 py-2 px-3 text-center font-bold">
                          教學組長
                        </th>
                        <th className="w-1/3 border border-stone-300 py-2 px-3 text-center font-bold">
                          教務主任
                        </th>
                        <th className="w-1/3 border border-stone-300 py-2 px-3 text-center font-bold">
                          校長
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr>
                        <td className="h-20 border border-stone-300 bg-white" />
                        <td className="h-20 border border-stone-300 bg-white" />
                        <td className="h-20 border border-stone-300 bg-white" />
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            )}
        </div>
      </div>
    </div>,
    document.body,
  );
};
