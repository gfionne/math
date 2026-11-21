import React, {useEffect, useMemo, useState} from 'react';
import {
  AlertCircle,
  CheckCircle2,
  ClipboardCheck,
  Clock,
  MapPin,
  Plus,
  UserCheck,
} from 'lucide-react';
import {
  getMeetingCheckinWindowState,
  isValidSignatureDataUrl,
  MeetingSession,
  submitParentCheckin,
  subscribeParentMeetings,
} from '../services/meetingCheckinDb';
import {SignaturePad} from './SignaturePad';

const PARENT_RECEIPTS_STORAGE_KEY = 'pesmath_parent_checkin_receipts_v1';
const PARENT_RELATION_PRESETS = ['爸爸', '媽媽', '阿公 / 阿嬤', '監護人'] as const;

interface ParentDeviceReceipt {
  id: string;
  meetingId: string;
  meetingTitle: string;
  studentClassAndSeat: string;
  parentName: string;
  relationshipOrNote: string;
  signatureDataUrl: string;
  checkedInAtMs: number;
}

interface StandaloneParentCheckinPageProps {
  initialMeetingId?: string;
}

function readParentReceipts(): ParentDeviceReceipt[] {
  try {
    const raw = localStorage.getItem(PARENT_RECEIPTS_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed.filter(
        (item): item is ParentDeviceReceipt =>
          Boolean(item && typeof item.id === 'string' && item.meetingId),
      );
    }
  } catch {
    // ignore storage errors
  }
  return [];
}

function saveParentReceipts(list: ParentDeviceReceipt[]): void {
  try {
    localStorage.setItem(
      PARENT_RECEIPTS_STORAGE_KEY,
      JSON.stringify(list.slice(0, 20)),
    );
  } catch {
    // ignore storage errors
  }
}

function formatDateTime(ms: number): string {
  return new Date(ms).toLocaleString('zh-TW', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

export const StandaloneParentCheckinPage: React.FC<
  StandaloneParentCheckinPageProps
> = ({initialMeetingId}) => {
  const [parentMeetings, setParentMeetings] = useState<MeetingSession[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [dbError, setDbError] = useState<string | null>(null);
  const [statusBanner, setStatusBanner] = useState<string | null>(null);
  const [nowMs, setNowMs] = useState<number>(() => Date.now());

  const [selectedMeetingId, setSelectedMeetingId] = useState<string | null>(
    initialMeetingId || null,
  );
  const [studentByMeeting, setStudentByMeeting] = useState<
    Record<string, string>
  >({});
  const [parentNameByMeeting, setParentNameByMeeting] = useState<
    Record<string, string>
  >({});
  const [relationByMeeting, setRelationByMeeting] = useState<
    Record<string, string>
  >({});
  const [sigByMeeting, setSigByMeeting] = useState<
    Record<string, string | null>
  >({});
  const [padResetNonce, setPadResetNonce] = useState<Record<string, number>>(
    {},
  );
  const [submittingMeetingId, setSubmittingMeetingId] = useState<string | null>(
    null,
  );
  const [parentReceipts, setParentReceipts] = useState<ParentDeviceReceipt[]>(
    () => readParentReceipts(),
  );
  const [showAnotherForm, setShowAnotherForm] = useState<
    Record<string, boolean>
  >({});

  useEffect(() => {
    document.title = '臺北市西門國小｜學校日家長線上簽到';
    const timer = window.setInterval(() => {
      setNowMs(Date.now());
    }, 30000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    setIsLoading(true);
    setDbError(null);
    const unsub = subscribeParentMeetings(
      (list) => {
        setParentMeetings(list);
        setIsLoading(false);
      },
      (err) => {
        setDbError(err.message);
        setIsLoading(false);
      },
    );
    return () => unsub();
  }, []);

  // Auto-select target session from QR code or first open session
  useEffect(() => {
    if (parentMeetings.length === 0) return;
    if (
      initialMeetingId &&
      parentMeetings.some((m) => m.id === initialMeetingId)
    ) {
      setSelectedMeetingId(initialMeetingId);
      return;
    }
    if (
      selectedMeetingId &&
      parentMeetings.some((m) => m.id === selectedMeetingId)
    ) {
      return;
    }
    const firstOpen = parentMeetings.find(
      (m) => getMeetingCheckinWindowState(m, nowMs).status === 'open',
    );
    setSelectedMeetingId(
      firstOpen ? firstOpen.id : parentMeetings[0]?.id ?? null,
    );
  }, [parentMeetings, initialMeetingId, selectedMeetingId, nowMs]);

  const receiptsByMeeting = useMemo(() => {
    const map = new Map<string, ParentDeviceReceipt[]>();
    for (const rec of parentReceipts) {
      const list = map.get(rec.meetingId);
      if (list) list.push(rec);
      else map.set(rec.meetingId, [rec]);
    }
    return map;
  }, [parentReceipts]);

  const targetSession = useMemo(() => {
    if (!selectedMeetingId) return parentMeetings[0] ?? null;
    return (
      parentMeetings.find((m) => m.id === selectedMeetingId) ??
      parentMeetings[0] ??
      null
    );
  }, [parentMeetings, selectedMeetingId]);

  const otherOpenSessions = useMemo(
    () =>
      parentMeetings.filter(
        (m) =>
          m.id !== targetSession?.id &&
          getMeetingCheckinWindowState(m, nowMs).status === 'open',
      ),
    [parentMeetings, targetSession?.id, nowMs],
  );

  const handleSubmit = async (meeting: MeetingSession) => {
    const studentVal = (studentByMeeting[meeting.id] || '').trim();
    const parentVal = (parentNameByMeeting[meeting.id] || '').trim();
    const relationVal = (relationByMeeting[meeting.id] || '').trim();
    const sigVal = sigByMeeting[meeting.id] || null;

    if (!studentVal) {
      setDbError('請填寫「學生班級座號或姓名」。');
      return;
    }
    if (!parentVal) {
      setDbError('請填寫「家長姓名或稱謂」。');
      return;
    }
    if (!isValidSignatureDataUrl(sigVal)) {
      setDbError('請先於簽名框內親自手寫簽名後再送出。');
      return;
    }

    setSubmittingMeetingId(meeting.id);
    setDbError(null);
    setStatusBanner(null);

    try {
      const {id: receiptId, checkedInAtMs} = await submitParentCheckin({
        meetingId: meeting.id,
        meetingTitle: meeting.title,
        studentClassAndSeat: studentVal,
        parentName: parentVal,
        relationshipOrNote: relationVal,
        signatureDataUrl: sigVal,
      });
      const nextReceipt: ParentDeviceReceipt = {
        id: receiptId,
        meetingId: meeting.id,
        meetingTitle: meeting.title,
        studentClassAndSeat: studentVal,
        parentName: parentVal,
        relationshipOrNote: relationVal,
        signatureDataUrl: sigVal,
        checkedInAtMs,
      };
      const updatedReceipts = [nextReceipt, ...parentReceipts];
      setParentReceipts(updatedReceipts);
      saveParentReceipts(updatedReceipts);

      setStudentByMeeting((prev) => ({...prev, [meeting.id]: ''}));
      setParentNameByMeeting((prev) => ({...prev, [meeting.id]: ''}));
      setRelationByMeeting((prev) => ({...prev, [meeting.id]: ''}));
      setSigByMeeting((prev) => ({...prev, [meeting.id]: null}));
      setPadResetNonce((prev) => ({
        ...prev,
        [meeting.id]: (prev[meeting.id] || 0) + 1,
      }));
      setShowAnotherForm((prev) => ({...prev, [meeting.id]: false}));
      setStatusBanner(
        `已完成「${meeting.title}」家長報到簽名（${studentVal}）！`,
      );
    } catch (err: any) {
      setDbError(err?.message || '送出家長簽到失敗，請稍後再試。');
    } finally {
      setSubmittingMeetingId(null);
    }
  };

  return (
    <div className="min-h-screen bg-[#FBF9F5] text-stone-900 flex flex-col">
      {/* Standalone Institutional School Day Header (Zero knowledge-base links or teacher UI) */}
      <header className="bg-white border-b border-stone-200 px-4 sm:px-6 py-4">
        <div className="max-w-2xl mx-auto flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-800 border border-emerald-200 flex items-center justify-center shrink-0">
              <UserCheck className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <p className="text-[11px] font-medium text-emerald-800 tracking-wide">
                臺北市西門國小 · 學校日親師活動
              </p>
              <h1 className="font-editorial text-lg sm:text-xl font-bold text-stone-950 truncate">
                家長免登入線上簽到
              </h1>
            </div>
          </div>

          <span className="text-xs font-medium text-stone-500 whitespace-nowrap shrink-0">
            無需帳號・手寫即完成
          </span>
        </div>
      </header>

      <main className="flex-1 px-4 sm:px-6 py-6 sm:py-8">
        <div className="max-w-2xl mx-auto space-y-4">
          {dbError && (
            <div
              role="alert"
              className="p-3.5 rounded-xl bg-red-50 border border-red-200 text-red-900 text-xs sm:text-sm flex items-start justify-between gap-3"
            >
              <div className="flex items-start gap-2 min-w-0">
                <AlertCircle className="w-4 h-4 text-red-700 shrink-0 mt-0.5" />
                <span className="break-words">{dbError}</span>
              </div>
              <button
                type="button"
                onClick={() => setDbError(null)}
                className="text-xs font-medium text-red-700 hover:underline shrink-0"
              >
                關閉
              </button>
            </div>
          )}

          {statusBanner && (
            <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-950 text-xs sm:text-sm flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 min-w-0">
                <CheckCircle2 className="w-4 h-4 text-emerald-700 shrink-0" />
                <span>{statusBanner}</span>
              </div>
              <button
                type="button"
                onClick={() => setStatusBanner(null)}
                className="text-xs font-medium text-emerald-800 hover:underline shrink-0"
              >
                關閉
              </button>
            </div>
          )}

          {isLoading ? (
            <div className="bg-white border border-stone-200 rounded-2xl p-10 text-center text-sm text-stone-500">
              正在載入學校日簽到場次...
            </div>
          ) : !targetSession ? (
            <div className="bg-white border border-stone-200 rounded-2xl p-8 sm:p-10 text-center space-y-3">
              <UserCheck className="w-10 h-10 text-stone-400 mx-auto" />
              <h2 className="font-editorial text-xl font-bold text-stone-900">
                目前尚未開放學校日家長簽到場次
              </h2>
              <p className="text-xs sm:text-sm text-stone-600 max-w-md mx-auto leading-relaxed">
                請向現場班級導師確認活動是否已開放簽到，或重新掃描教室提供的 QR Code。
              </p>
            </div>
          ) : (
            (() => {
              const meeting = targetSession;
              const windowState = getMeetingCheckinWindowState(meeting, nowMs);
              const isCurrentlySignable = windowState.status === 'open';
              const receipts = receiptsByMeeting.get(meeting.id) || [];
              const hasReceipt = receipts.length > 0;
              const wantsForm =
                !hasReceipt || Boolean(showAnotherForm[meeting.id]);
              const studentVal = studentByMeeting[meeting.id] || '';
              const parentVal = parentNameByMeeting[meeting.id] || '';
              const relationVal = relationByMeeting[meeting.id] || '';
              const sigVal = sigByMeeting[meeting.id] || null;
              const isSigReady = isValidSignatureDataUrl(sigVal);

              return (
                <>
                  {initialMeetingId && meeting.id !== initialMeetingId && (
                    <div className="p-3.5 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-xs">
                      您掃描的原場次已結束或不存在，已為您顯示目前可用的家長簽到場次。
                    </div>
                  )}

                  <article className="bg-white border border-stone-200 rounded-2xl p-5 sm:p-6 space-y-5 shadow-xs">
                    <div className="space-y-2 border-b border-stone-100 pb-4">
                      <div className="flex flex-wrap items-center gap-2 text-xs">
                        <span
                          className={`font-semibold ${
                            windowState.status === 'open'
                              ? 'text-emerald-800'
                              : windowState.status === 'not-started'
                                ? 'text-amber-800'
                                : 'text-stone-500'
                          }`}
                        >
                          {windowState.badgeLabel}
                        </span>
                        <span aria-hidden="true" className="text-stone-300">
                          ·
                        </span>
                        <span className="font-mono-tabular text-stone-600">
                          {meeting.meetingDate}
                        </span>
                        {meeting.academicYear && (
                          <>
                            <span aria-hidden="true" className="text-stone-300">
                              ·
                            </span>
                            <span className="font-mono-tabular text-stone-600">
                              {meeting.academicYear}
                            </span>
                          </>
                        )}
                      </div>

                      <h2 className="font-editorial text-xl sm:text-2xl font-bold text-stone-950 leading-snug break-words">
                        {meeting.title}
                      </h2>

                      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-stone-600">
                        {meeting.location && (
                          <span className="inline-flex items-center gap-1">
                            <MapPin className="w-3.5 h-3.5 text-stone-400 shrink-0" />
                            <span>{meeting.location}</span>
                          </span>
                        )}
                        {(meeting.checkinStartAtMs !== null ||
                          meeting.checkinEndAtMs !== null) && (
                          <span className="inline-flex items-center gap-1 text-emerald-900 font-medium">
                            <Clock className="w-3.5 h-3.5 shrink-0" />
                            <span>
                              開放時段：
                              {meeting.checkinStartAtMs !== null
                                ? formatDateTime(meeting.checkinStartAtMs)
                                : '立即開放'}
                              {' ～ '}
                              {meeting.checkinEndAtMs !== null
                                ? formatDateTime(meeting.checkinEndAtMs)
                                : '活動結束'}
                            </span>
                          </span>
                        )}
                      </div>
                    </div>

                    {meeting.agendaSummary && (
                      <p className="text-xs sm:text-sm text-stone-700 leading-relaxed whitespace-pre-line bg-[#FBF9F5] border border-stone-200/80 rounded-xl p-3.5">
                        {meeting.agendaSummary}
                      </p>
                    )}

                    {/* Local confirmation receipt(s) */}
                    {hasReceipt && (
                      <div className="space-y-2.5">
                        {receipts.map((rec) => (
                          <div
                            key={rec.id}
                            className="bg-emerald-50/80 border border-emerald-200 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                          >
                            <div className="space-y-1 min-w-0">
                              <div className="flex items-center gap-1.5 text-sm font-bold text-emerald-900">
                                <CheckCircle2 className="w-4 h-4 text-emerald-700 shrink-0" />
                                <span>本裝置已完成家長簽到！</span>
                              </div>
                              <div className="text-xs sm:text-sm text-stone-800">
                                學生：<strong>{rec.studentClassAndSeat}</strong>{' '}
                                · 家長：<strong>{rec.parentName}</strong>
                                {rec.relationshipOrNote
                                  ? `（${rec.relationshipOrNote}）`
                                  : ''}
                              </div>
                              <div className="text-[11px] font-mono-tabular text-stone-600">
                                簽到時間：{formatDateTime(rec.checkedInAtMs)}
                              </div>
                            </div>
                            {isValidSignatureDataUrl(rec.signatureDataUrl) && (
                              <div className="shrink-0 bg-white border border-emerald-200 rounded-lg px-2.5 py-1 self-start sm:self-center">
                                <img
                                  src={rec.signatureDataUrl}
                                  alt={`${rec.parentName}親筆簽名`}
                                  className="h-12 w-28 object-contain"
                                />
                              </div>
                            )}
                          </div>
                        ))}

                        {isCurrentlySignable && !wantsForm && (
                          <div className="flex justify-end pt-1">
                            <button
                              type="button"
                              onClick={() =>
                                setShowAnotherForm((prev) => ({
                                  ...prev,
                                  [meeting.id]: true,
                                }))
                              }
                              className="px-4 py-2 text-xs font-semibold text-emerald-900 bg-emerald-50 border border-emerald-200 rounded-xl hover:bg-emerald-100 inline-flex items-center gap-1.5"
                            >
                              <Plus className="w-3.5 h-3.5" />
                              <span>再為另一位學生／家長簽到</span>
                            </button>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Standalone Parent Form */}
                    {isCurrentlySignable ? (
                      wantsForm && (
                        <div className="space-y-4 pt-1">
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                            <div className="space-y-1">
                              <label
                                htmlFor={`standalone-student-${meeting.id}`}
                                className="block text-xs font-semibold text-stone-800"
                              >
                                1. 學生班級座號或姓名 *
                              </label>
                              <input
                                id={`standalone-student-${meeting.id}`}
                                type="text"
                                maxLength={80}
                                value={studentVal}
                                onChange={(e) =>
                                  setStudentByMeeting((prev) => ({
                                    ...prev,
                                    [meeting.id]: e.target.value,
                                  }))
                                }
                                placeholder="例如：403 班 12 號 王小明"
                                className="w-full h-11 px-3.5 text-sm bg-white border border-stone-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-700"
                              />
                            </div>

                            <div className="space-y-1">
                              <label
                                htmlFor={`standalone-parent-${meeting.id}`}
                                className="block text-xs font-semibold text-stone-800"
                              >
                                2. 家長姓名或稱謂 *
                              </label>
                              <input
                                id={`standalone-parent-${meeting.id}`}
                                type="text"
                                maxLength={80}
                                value={parentVal}
                                onChange={(e) =>
                                  setParentNameByMeeting((prev) => ({
                                    ...prev,
                                    [meeting.id]: e.target.value,
                                  }))
                                }
                                placeholder="例如：王爸爸、陳媽媽"
                                className="w-full h-11 px-3.5 text-sm bg-white border border-stone-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-700"
                              />
                            </div>
                          </div>

                          <div className="space-y-1.5">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <label
                                htmlFor={`standalone-relation-${meeting.id}`}
                                className="block text-xs font-medium text-stone-700"
                              >
                                3. 與學生關係 / 給老師的備註（選填）
                              </label>
                              <div className="flex flex-wrap items-center gap-1.5">
                                {PARENT_RELATION_PRESETS.map((preset) => (
                                  <button
                                    key={preset}
                                    type="button"
                                    onClick={() =>
                                      setRelationByMeeting((prev) => ({
                                        ...prev,
                                        [meeting.id]: preset,
                                      }))
                                    }
                                    className={`px-2 py-0.5 text-[11px] rounded-md border transition-colors ${
                                      relationVal === preset
                                        ? 'bg-emerald-700 text-white border-emerald-700'
                                        : 'bg-white text-stone-600 border-stone-300 hover:border-emerald-700/50'
                                    }`}
                                  >
                                    {preset}
                                  </button>
                                ))}
                              </div>
                            </div>
                            <input
                              id={`standalone-relation-${meeting.id}`}
                              type="text"
                              maxLength={120}
                              value={relationVal}
                              onChange={(e) =>
                                setRelationByMeeting((prev) => ({
                                  ...prev,
                                  [meeting.id]: e.target.value,
                                }))
                              }
                              placeholder="選填，例如：媽媽"
                              className="w-full h-10 px-3.5 text-xs sm:text-sm bg-white border border-stone-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-700"
                            />
                          </div>

                          <SignaturePad
                            key={`${meeting.id}-${padResetNonce[meeting.id] || 0}`}
                            signerLabel={parentVal.trim() || '家長親筆簽名'}
                            disabled={submittingMeetingId === meeting.id}
                            onChange={(dataUrl) =>
                              setSigByMeeting((prev) => ({
                                ...prev,
                                [meeting.id]: dataUrl,
                              }))
                            }
                          />

                          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-1">
                            <span className="text-xs text-stone-600">
                              {isSigReady ? (
                                <span className="text-emerald-800 font-semibold">
                                  ✓ 已完成手寫簽名，點擊按鈕即可送出。
                                </span>
                              ) : (
                                <span>{windowState.detailText}</span>
                              )}
                            </span>

                            <div className="flex items-center gap-2 shrink-0">
                              {hasReceipt && (
                                <button
                                  type="button"
                                  onClick={() =>
                                    setShowAnotherForm((prev) => ({
                                      ...prev,
                                      [meeting.id]: false,
                                    }))
                                  }
                                  className="px-3.5 py-2.5 text-xs font-medium text-stone-600 bg-white border border-stone-300 rounded-xl hover:bg-stone-50"
                                >
                                  取消
                                </button>
                              )}
                              <button
                                type="button"
                                disabled={
                                  submittingMeetingId === meeting.id ||
                                  !studentVal.trim() ||
                                  !parentVal.trim() ||
                                  !isSigReady
                                }
                                onClick={() => handleSubmit(meeting)}
                                className="w-full sm:w-auto min-h-[46px] px-6 py-2.5 text-sm font-semibold text-white bg-emerald-700 hover:bg-emerald-800 disabled:opacity-45 rounded-xl inline-flex items-center justify-center gap-2 transition-colors whitespace-nowrap"
                              >
                                <ClipboardCheck className="w-4 h-4" />
                                <span>
                                  {submittingMeetingId === meeting.id
                                    ? '簽到送出中...'
                                    : '確認簽名並送出家長簽到'}
                                </span>
                              </button>
                            </div>
                          </div>
                        </div>
                      )
                    ) : (
                      <div
                        className={`flex items-center gap-2 text-xs sm:text-sm px-4 py-3 rounded-xl border ${
                          windowState.status === 'not-started'
                            ? 'bg-amber-50 border-amber-200 text-amber-900 font-medium'
                            : 'bg-stone-50 border-stone-200 text-stone-600'
                        }`}
                      >
                        <Clock className="w-4 h-4 shrink-0" />
                        <span>{windowState.detailText}</span>
                      </div>
                    )}
                  </article>

                  {/* Optional switcher ONLY when other open parent sessions also exist */}
                  {otherOpenSessions.length > 0 && (
                    <div className="bg-white border border-stone-200 rounded-xl p-4 space-y-2.5">
                      <div className="text-xs font-semibold text-stone-700">
                        切換其他開放中的學校日場次
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {otherOpenSessions.map((other) => (
                          <button
                            key={other.id}
                            type="button"
                            onClick={() => setSelectedMeetingId(other.id)}
                            className="px-3 py-1.5 text-xs font-medium text-emerald-900 bg-emerald-50 border border-emerald-200 rounded-lg hover:bg-emerald-100 transition-colors"
                          >
                            {other.title}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              );
            })()
          )}
        </div>
      </main>

      <footer className="py-5 px-4 text-center text-xs text-stone-500">
        臺北市西門國小 · 學校日家長簽到專頁（簽到資料僅供導師／管理教師查閱）
      </footer>
    </div>
  );
};
