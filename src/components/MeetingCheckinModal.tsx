import React, {useEffect, useMemo, useState} from 'react';
import {User} from 'firebase/auth';
import {
  AlertCircle,
  BookOpen,
  CalendarCheck,
  CheckCircle2,
  ClipboardCheck,
  Download,
  ExternalLink,
  FileText,
  History,
  Lock,
  LogOut,
  MapPin,
  PenTool,
  Plus,
  ShieldCheck,
  Trash2,
  Users,
  Video,
  X,
} from 'lucide-react';
import {SCHOOL_DOMAIN} from '../services/googleAuth';
import {
  buildMeetingCheckinsCsv,
  buildPrintableMeetingSheetHtml,
  cancelMeetingCheckin,
  createMeetingSession,
  deleteMeetingSession,
  isValidSignatureDataUrl,
  MeetingCheckin,
  MeetingSession,
  submitMeetingCheckin,
  subscribeAllCheckinsForAdmin,
  subscribeMeetings,
  subscribeMyCheckins,
  updateMeetingSession,
  updateMyCheckinNote,
} from '../services/meetingCheckinDb';
import {SignaturePad} from './SignaturePad';
import {JournalPost} from '../types/journal';
import {ACADEMIC_YEAR_OPTIONS} from '../data/seedPosts';

const TEACHER_NOTE_STORAGE_KEY = 'pesmath_teacher_checkin_note_v1';

interface MeetingCheckinModalProps {
  isOpen: boolean;
  initialLinkedPostSlug?: string;
  onClose: () => void;
  user: User | null;
  isTeacherAdmin: boolean;
  isSchoolAuthorized: boolean;
  isSigningIn: boolean;
  authError: string | null;
  onClearAuthError: () => void;
  onSchoolSignIn: () => void;
  onAdminSignIn: () => void;
  onSignOut: () => void;
  posts: JournalPost[];
  onOpenLinkedPost: (slug: string) => void;
}

type ModalTab = 'sessions' | 'my-history' | 'admin';

function readSavedTeacherNote(): string {
  try {
    return localStorage.getItem(TEACHER_NOTE_STORAGE_KEY) || '';
  } catch {
    return '';
  }
}

function saveTeacherNote(note: string): void {
  try {
    localStorage.setItem(TEACHER_NOTE_STORAGE_KEY, note);
  } catch {
    // ignore storage errors
  }
}

export const MeetingCheckinModal: React.FC<MeetingCheckinModalProps> = ({
  isOpen,
  initialLinkedPostSlug,
  onClose,
  user,
  isTeacherAdmin,
  isSchoolAuthorized,
  isSigningIn,
  authError,
  onClearAuthError,
  onSchoolSignIn,
  onAdminSignIn,
  onSignOut,
  posts,
  onOpenLinkedPost,
}) => {
  const [activeTab, setActiveTab] = useState<ModalTab>('sessions');
  const [meetings, setMeetings] = useState<MeetingSession[]>([]);
  const [myCheckins, setMyCheckins] = useState<MeetingCheckin[]>([]);
  const [allCheckins, setAllCheckins] = useState<MeetingCheckin[]>([]);
  const [isLoadingMeetings, setIsLoadingMeetings] = useState(false);
  const [dbError, setDbError] = useState<string | null>(null);
  const [statusBanner, setStatusBanner] = useState<string | null>(null);

  const [teacherNoteInput, setTeacherNoteInput] = useState<string>(() =>
    readSavedTeacherNote(),
  );
  const [customNameInput, setCustomNameInput] = useState<string>('');
  const [submittingMeetingId, setSubmittingMeetingId] = useState<string | null>(
    null,
  );
  const [activeSigningMeetingId, setActiveSigningMeetingId] = useState<
    string | null
  >(null);
  const [signatureDraftByMeeting, setSignatureDraftByMeeting] = useState<
    Record<string, string | null>
  >({});
  const [editingCheckinId, setEditingCheckinId] = useState<string | null>(null);
  const [editingNoteDraft, setEditingNoteDraft] = useState<string>('');
  const [editingSignatureDraft, setEditingSignatureDraft] = useState<
    string | null
  >(null);
  const [showEditSignaturePad, setShowEditSignaturePad] = useState(false);
  const [confirmCancelId, setConfirmCancelId] = useState<string | null>(null);
  const [sessionFilter, setSessionFilter] = useState<'all' | 'open'>('all');

  // Admin Create Meeting Form
  const [newTitle, setNewTitle] = useState('');
  const [newDate, setNewDate] = useState(() => {
    const now = new Date();
    const yyyy = now.getFullYear();
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const dd = String(now.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd} 13:30`;
  });
  const [newYear, setNewYear] = useState('114 學年度');
  const [newLocation, setNewLocation] = useState('西門國小 會議室 / Google Meet');
  const [newAgenda, setNewAgenda] = useState('');
  const [newMeetUrl, setNewMeetUrl] = useState('');
  const [newLinkedSlug, setNewLinkedSlug] = useState('');
  const [newIsOpen, setNewIsOpen] = useState(true);
  const [isCreatingSession, setIsCreatingSession] = useState(false);

  // Admin Roster Inspection & Delete Confirmation
  const [expandedRosterMeetingId, setExpandedRosterMeetingId] = useState<
    string | null
  >(null);
  const [confirmDeleteMeetingId, setConfirmDeleteMeetingId] = useState<
    string | null
  >(null);
  const [deletingMeetingId, setDeletingMeetingId] = useState<string | null>(
    null,
  );

  useEffect(() => {
    if (!isOpen) return;
    setDbError(null);
    setStatusBanner(null);
    if (initialLinkedPostSlug) {
      setNewLinkedSlug(initialLinkedPostSlug);
    }
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, initialLinkedPostSlug, onClose]);

  useEffect(() => {
    if (user?.displayName && !customNameInput) {
      setCustomNameInput(user.displayName);
    }
  }, [user?.displayName]);

  // Attach Firestore subscriptions ONLY when modal is open AND user is verified
  useEffect(() => {
    if (!isOpen || !isSchoolAuthorized || !user) {
      setMeetings([]);
      setMyCheckins([]);
      setAllCheckins([]);
      setIsLoadingMeetings(false);
      return;
    }

    setIsLoadingMeetings(true);
    setDbError(null);

    const unsubMeetings = subscribeMeetings(
      (list) => {
        setMeetings(list);
        setIsLoadingMeetings(false);
      },
      (err) => {
        setIsLoadingMeetings(false);
        setDbError(err.message);
      },
    );

    const unsubMy = subscribeMyCheckins(
      user.uid,
      (list) => {
        setMyCheckins(list);
      },
      (err) => {
        setDbError(err.message);
      },
    );

    let unsubAdmin: (() => void) | undefined;
    if (isTeacherAdmin) {
      unsubAdmin = subscribeAllCheckinsForAdmin(
        (list) => {
          setAllCheckins(list);
        },
        (err) => {
          setDbError(err.message);
        },
      );
    }

    return () => {
      unsubMeetings();
      unsubMy();
      unsubAdmin?.();
    };
  }, [isOpen, isSchoolAuthorized, isTeacherAdmin, user]);

  const myCheckinByMeetingId = useMemo(() => {
    const map = new Map<string, MeetingCheckin>();
    for (const item of myCheckins) {
      map.set(item.meetingId, item);
    }
    return map;
  }, [myCheckins]);

  const checkinsByMeetingIdForAdmin = useMemo(() => {
    const map = new Map<string, MeetingCheckin[]>();
    for (const item of allCheckins) {
      const list = map.get(item.meetingId);
      if (list) list.push(item);
      else map.set(item.meetingId, [item]);
    }
    return map;
  }, [allCheckins]);

  const displayedMeetings = useMemo(() => {
    if (sessionFilter === 'open') {
      return meetings.filter((m) => m.isOpen);
    }
    return meetings;
  }, [meetings, sessionFilter]);

  const openMeetingsCount = useMemo(
    () => meetings.filter((m) => m.isOpen).length,
    [meetings],
  );

  // Auto-open signature pad for the first open unchecked-in meeting so teachers can sign right away
  useEffect(() => {
    if (!isOpen || !isSchoolAuthorized) return;
    if (activeSigningMeetingId) {
      const stillOpenUnchecked = meetings.some(
        (m) =>
          m.id === activeSigningMeetingId &&
          m.isOpen &&
          !myCheckinByMeetingId.has(m.id),
      );
      if (stillOpenUnchecked) return;
    }
    const nextOpen = meetings.find(
      (m) => m.isOpen && !myCheckinByMeetingId.has(m.id),
    );
    setActiveSigningMeetingId(nextOpen ? nextOpen.id : null);
  }, [
    isOpen,
    isSchoolAuthorized,
    meetings,
    myCheckinByMeetingId,
    activeSigningMeetingId,
  ]);

  const meetingPostsForLinking = useMemo(() => {
    return posts.slice(0, 60);
  }, [posts]);

  if (!isOpen) return null;

  const handleCheckin = async (meeting: MeetingSession) => {
    const sigUrl = signatureDraftByMeeting[meeting.id] || '';
    if (!isValidSignatureDataUrl(sigUrl)) {
      setActiveSigningMeetingId(meeting.id);
      setDbError('請先在「親自手寫簽名區」書寫您的簽名後，再送出會議簽到。');
      return;
    }

    setDbError(null);
    setStatusBanner(null);
    setSubmittingMeetingId(meeting.id);
    try {
      saveTeacherNote(teacherNoteInput.trim());
      await submitMeetingCheckin({
        meetingId: meeting.id,
        meetingTitle: meeting.title,
        roleOrNote: teacherNoteInput.trim(),
        signatureDataUrl: sigUrl,
        customDisplayName: customNameInput.trim() || undefined,
      });
      setSignatureDraftByMeeting((prev) => {
        const next = {...prev};
        delete next[meeting.id];
        return next;
      });
      setStatusBanner(`已完成「${meeting.title}」手寫簽名與出席簽到！`);
    } catch (err: any) {
      setDbError(err?.message || '簽到失敗，請再試一次。');
    } finally {
      setSubmittingMeetingId(null);
    }
  };

  const handleUpdateNote = async (checkin: MeetingCheckin) => {
    const needsSignature = !isValidSignatureDataUrl(checkin.signatureDataUrl);
    const shouldIncludeSig = showEditSignaturePad || needsSignature;
    const nextSig = shouldIncludeSig
      ? editingSignatureDraft || undefined
      : undefined;

    if (shouldIncludeSig && !isValidSignatureDataUrl(nextSig)) {
      setDbError('請先在下方畫布完成親自手寫簽名後再儲存。');
      return;
    }

    setDbError(null);
    try {
      await updateMyCheckinNote({
        checkinId: checkin.id,
        roleOrNote: editingNoteDraft.trim(),
        signatureDataUrl: nextSig,
      });
      saveTeacherNote(editingNoteDraft.trim());
      setEditingCheckinId(null);
      setEditingSignatureDraft(null);
      setShowEditSignaturePad(false);
      setStatusBanner(
        nextSig
          ? '已更新您的簽到備註與親自手寫簽名。'
          : '已更新您的簽到職務 / 備註。',
      );
    } catch (err: any) {
      setDbError(err?.message || '更新備註與簽名失敗。');
    }
  };

  const handleCancelCheckin = async (checkin: MeetingCheckin) => {
    setDbError(null);
    try {
      await cancelMeetingCheckin(checkin.id);
      setConfirmCancelId(null);
      setStatusBanner(`已取消「${checkin.meetingTitle}」的簽到紀錄。`);
    } catch (err: any) {
      setDbError(err?.message || '取消簽到失敗。');
    }
  };

  const handleCreateSession = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isTeacherAdmin) return;
    setIsCreatingSession(true);
    setDbError(null);
    setStatusBanner(null);
    try {
      await createMeetingSession({
        title: newTitle,
        meetingDate: newDate,
        academicYear: newYear,
        location: newLocation,
        agendaSummary: newAgenda,
        meetUrl: newMeetUrl,
        linkedPostSlug: newLinkedSlug,
        isOpen: newIsOpen,
      });
      setNewTitle('');
      setNewAgenda('');
      setNewMeetUrl('');
      setNewLinkedSlug('');
      setActiveTab('sessions');
      setStatusBanner('已成功建立新的社群會議簽到場次！');
    } catch (err: any) {
      setDbError(err?.message || '建立會議場次失敗。');
    } finally {
      setIsCreatingSession(false);
    }
  };

  const handleToggleMeetingOpen = async (meeting: MeetingSession) => {
    if (!isTeacherAdmin) return;
    setDbError(null);
    try {
      await updateMeetingSession(meeting.id, {isOpen: !meeting.isOpen});
      setStatusBanner(
        !meeting.isOpen
          ? `已重新開放「${meeting.title}」簽到。`
          : `已截止「${meeting.title}」簽到。`,
      );
    } catch (err: any) {
      setDbError(err?.message || '變更場次簽到狀態失敗。');
    }
  };

  const handleDeleteMeeting = async (meeting: MeetingSession) => {
    if (!isTeacherAdmin) return;
    setDeletingMeetingId(meeting.id);
    setDbError(null);
    try {
      await deleteMeetingSession(meeting.id);
      setConfirmDeleteMeetingId(null);
      setStatusBanner(`已刪除會議場次「${meeting.title}」。`);
    } catch (err: any) {
      setDbError(err?.message || '刪除會議場次失敗。');
    } finally {
      setDeletingMeetingId(null);
    }
  };

  const handleExportCsv = (
    meeting: MeetingSession,
    checkins: MeetingCheckin[],
  ) => {
    const csv = buildMeetingCheckinsCsv(meeting, checkins);
    const blob = new Blob([csv], {type: 'text/csv;charset=utf-8;'});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const safeFile = meeting.title.replace(/[\\/:*?"<>|]/g, '_').slice(0, 40);
    a.download = `會議簽到名冊_${safeFile}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    setStatusBanner(`已匯出「${meeting.title}」簽到名冊 CSV (${checkins.length} 人)。`);
  };

  const handleExportPrintableSheet = (
    meeting: MeetingSession,
    checkins: MeetingCheckin[],
  ) => {
    const html = buildPrintableMeetingSheetHtml(meeting, checkins);
    const blob = new Blob([html], {type: 'text/html;charset=utf-8;'});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const safeFile = meeting.title.replace(/[\\/:*?"<>|]/g, '_').slice(0, 40);
    a.download = `會議簽到表_含親筆簽名_${safeFile}.html`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    setStatusBanner(
      `已下載「${meeting.title}」含親筆簽名簽到表（開啟檔案即可直接列印或另存 PDF）。`,
    );
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

  return (
    <div
      className="fixed inset-0 z-50 overflow-y-auto bg-stone-950/60 backdrop-blur-xs flex justify-center p-2.5 sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-labelledby="meeting-checkin-modal-title"
      onClick={onClose}
    >
      <div
        className="w-full max-w-4xl min-w-0 my-auto bg-[#FBF9F5] border border-stone-200 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Top Header */}
        <header className="px-4 sm:px-6 py-4 bg-white border-b border-stone-200 flex items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-[#1E3A8A]/10 text-[#1E3A8A] flex items-center justify-center shrink-0">
              {isSchoolAuthorized ? (
                <CalendarCheck className="w-5 h-5" />
              ) : (
                <Lock className="w-5 h-5" />
              )}
            </div>
            <div className="min-w-0">
              <p className="text-[11px] font-mono-tabular uppercase tracking-wider text-[#1E3A8A] font-semibold">
                HMES Community Check-In
              </p>
              <h2
                id="meeting-checkin-modal-title"
                className="font-editorial text-lg sm:text-xl font-bold text-stone-950 truncate"
              >
                社群會議簽到與校內共備專區
              </h2>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="關閉會議簽到視窗"
            className="p-2 text-stone-500 hover:text-stone-900 rounded-lg hover:bg-stone-100 transition-colors shrink-0"
          >
            <X className="w-5 h-5" />
          </button>
        </header>

        {/* Body */}
        <div className="flex-1 overflow-y-auto overflow-x-hidden p-4 sm:p-6 space-y-5">
          {!isSchoolAuthorized ? (
            <div className="max-w-2xl mx-auto bg-white border border-stone-200 rounded-2xl p-6 sm:p-8 space-y-5">
              <div className="space-y-2">
                <div className="text-xs font-mono-tabular font-semibold text-[#1E3A8A]">
                  此選項已鎖定 · 需登入 @{SCHOOL_DOMAIN}
                </div>
                <h3 className="font-editorial text-xl font-bold text-stone-950">
                  登入校內教師帳號以檢視會議議程並完成簽到
                </h3>
                <p className="text-sm text-stone-600 leading-relaxed">
                  社群共備會議場次、會議室連結與教師線上簽到僅開放西門國小{' '}
                  <span className="font-mono-tabular font-semibold text-[#1E3A8A]">
                    @{SCHOOL_DOMAIN}
                  </span>{' '}
                  帳號與授權管理教師存取。
                </p>
              </div>

              {user && (
                <div
                  role="alert"
                  className="p-4 rounded-xl bg-amber-50 border border-amber-200 text-amber-950 text-xs sm:text-sm flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                >
                  <div className="flex items-start gap-2 min-w-0">
                    <AlertCircle className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
                    <div className="min-w-0 break-all">
                      目前登入的是 <span className="font-mono-tabular font-semibold">{user.email}</span>，非 @{SCHOOL_DOMAIN} 帳號或授權管理員。
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={onSignOut}
                    className="px-3 py-1.5 text-xs font-semibold text-amber-950 bg-white border border-amber-300 rounded-lg hover:bg-amber-100 whitespace-nowrap shrink-0 self-start sm:self-center"
                  >
                    登出切換帳號
                  </button>
                </div>
              )}

              {authError && (
                <div
                  role="alert"
                  className="p-3.5 rounded-xl bg-red-50 border border-red-200 text-red-900 text-xs flex items-start justify-between gap-3"
                >
                  <span className="leading-relaxed">{authError}</span>
                  <button
                    type="button"
                    onClick={onClearAuthError}
                    className="text-red-700 hover:underline shrink-0"
                  >
                    關閉
                  </button>
                </div>
              )}

              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
                <button
                  type="button"
                  onClick={onSchoolSignIn}
                  disabled={isSigningIn}
                  className="flex-1 min-h-[44px] px-5 py-2.5 text-sm font-semibold text-white bg-[#1E3A8A] hover:bg-[#172554] disabled:opacity-60 rounded-xl transition-colors inline-flex items-center justify-center gap-2 text-center leading-snug"
                >
                  <ShieldCheck className="w-4 h-4 shrink-0" />
                  <span>
                    {isSigningIn
                      ? 'Google 驗證中...'
                      : `使用 @${SCHOOL_DOMAIN} 帳號登入簽到`}
                  </span>
                </button>
                <button
                  type="button"
                  onClick={onAdminSignIn}
                  disabled={isSigningIn}
                  className="min-h-[44px] px-4 py-2.5 text-xs sm:text-sm font-semibold text-stone-800 bg-white border border-stone-300 hover:bg-stone-50 disabled:opacity-60 rounded-xl transition-colors inline-flex items-center justify-center gap-2 text-center leading-snug"
                >
                  <span>管理教師登入</span>
                </button>
              </div>
            </div>
          ) : (
            <>
              {/* Identity Bar */}
              <section className="bg-white border border-stone-200 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="space-y-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    <span className="font-semibold text-[#1E3A8A]">
                      {isTeacherAdmin
                        ? '已啟用：管理教師模式（可建立場次與匯出名冊）'
                        : `已驗證：@${SCHOOL_DOMAIN} 社群教師`}
                    </span>
                    <span aria-hidden="true" className="text-stone-300">
                      ·
                    </span>
                    <span className="font-mono-tabular text-stone-600">
                      我的簽到 {myCheckins.length} 場
                    </span>
                  </div>
                  <div className="text-sm font-medium text-stone-900 truncate">
                    {user?.displayName || '社群教師'}{' '}
                    <span className="font-mono-tabular text-xs text-stone-500">
                      ({user?.email})
                    </span>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={onSignOut}
                  className="min-h-[38px] px-3 py-1.5 text-xs font-medium text-stone-700 bg-white border border-stone-300 hover:bg-stone-50 rounded-lg inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 self-start sm:self-center"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  <span>切換帳號 / 登出</span>
                </button>
              </section>

              {/* Feedback Banners */}
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

              {/* Navigation Tabs inside Check-in Hub (High-Clarity Tab Bar) */}
              <div className="space-y-3">
                <div
                  role="tablist"
                  aria-label="會議簽到功能頁籤"
                  className={`grid gap-2 ${
                    isTeacherAdmin ? 'grid-cols-1 sm:grid-cols-3' : 'grid-cols-1 sm:grid-cols-2'
                  }`}
                >
                  <button
                    type="button"
                    role="tab"
                    aria-selected={activeTab === 'sessions'}
                    onClick={() => setActiveTab('sessions')}
                    className={`px-4 py-3 rounded-xl border-2 text-left transition-all flex items-center justify-between gap-2 ${
                      activeTab === 'sessions'
                        ? 'bg-[#1E3A8A] text-white border-[#1E3A8A] shadow-sm'
                        : 'bg-white text-stone-700 border-stone-200 hover:border-[#1E3A8A]/45 hover:text-[#1E3A8A]'
                    }`}
                  >
                    <span className="inline-flex items-center gap-2 min-w-0">
                      <PenTool className="w-4 h-4 shrink-0" />
                      <span className="text-xs sm:text-sm font-bold truncate">
                        會議場次與手寫簽到
                      </span>
                    </span>
                    <span
                      className={`px-2 py-0.5 text-[11px] font-mono-tabular font-semibold rounded-md shrink-0 ${
                        activeTab === 'sessions'
                          ? 'bg-white/20 text-white'
                          : openMeetingsCount > 0
                            ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                            : 'bg-stone-100 text-stone-600'
                      }`}
                    >
                      {openMeetingsCount > 0
                        ? `${openMeetingsCount} 場開放`
                        : `${meetings.length} 場`}
                    </span>
                  </button>

                  <button
                    type="button"
                    role="tab"
                    aria-selected={activeTab === 'my-history'}
                    onClick={() => setActiveTab('my-history')}
                    className={`px-4 py-3 rounded-xl border-2 text-left transition-all flex items-center justify-between gap-2 ${
                      activeTab === 'my-history'
                        ? 'bg-[#1E3A8A] text-white border-[#1E3A8A] shadow-sm'
                        : 'bg-white text-stone-700 border-stone-200 hover:border-[#1E3A8A]/45 hover:text-[#1E3A8A]'
                    }`}
                  >
                    <span className="inline-flex items-center gap-2 min-w-0">
                      <History className="w-4 h-4 shrink-0" />
                      <span className="text-xs sm:text-sm font-bold truncate">
                        我的簽到與簽名紀錄
                      </span>
                    </span>
                    <span
                      className={`px-2 py-0.5 text-[11px] font-mono-tabular font-semibold rounded-md shrink-0 ${
                        activeTab === 'my-history'
                          ? 'bg-white/20 text-white'
                          : 'bg-stone-100 text-stone-700'
                      }`}
                    >
                      {myCheckins.length} 筆
                    </span>
                  </button>

                  {isTeacherAdmin && (
                    <button
                      type="button"
                      role="tab"
                      aria-selected={activeTab === 'admin'}
                      onClick={() => setActiveTab('admin')}
                      className={`px-4 py-3 rounded-xl border-2 text-left transition-all flex items-center justify-between gap-2 ${
                        activeTab === 'admin'
                          ? 'bg-[#1E3A8A] text-white border-[#1E3A8A] shadow-sm'
                          : 'bg-white text-stone-700 border-stone-200 hover:border-[#1E3A8A]/45 hover:text-[#1E3A8A]'
                      }`}
                    >
                      <span className="inline-flex items-center gap-2 min-w-0">
                        <Plus className="w-4 h-4 shrink-0" />
                        <span className="text-xs sm:text-sm font-bold truncate">
                          建立新會議場次
                        </span>
                      </span>
                      <span
                        className={`px-2 py-0.5 text-[11px] font-semibold rounded-md shrink-0 ${
                          activeTab === 'admin'
                            ? 'bg-white/20 text-white'
                            : 'bg-[#1E3A8A]/8 text-[#1E3A8A]'
                        }`}
                      >
                        管理專用
                      </span>
                    </button>
                  )}
                </div>

                {activeTab === 'sessions' && meetings.length > 0 && (
                  <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                    <span className="text-stone-600">
                      請選擇下方開放中的會議場次，並於<strong className="text-[#1E3A8A]">親自手寫簽名區</strong>完成書寫送出。
                    </span>
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => setSessionFilter('all')}
                        className={`px-2.5 py-1 rounded-md border ${
                          sessionFilter === 'all'
                            ? 'bg-[#1E3A8A] text-white border-[#1E3A8A]'
                            : 'bg-white text-stone-600 border-stone-200 hover:bg-stone-50'
                        }`}
                      >
                        全部場次 ({meetings.length})
                      </button>
                      <button
                        type="button"
                        onClick={() => setSessionFilter('open')}
                        className={`px-2.5 py-1 rounded-md border ${
                          sessionFilter === 'open'
                            ? 'bg-[#1E3A8A] text-white border-[#1E3A8A]'
                            : 'bg-white text-stone-600 border-stone-200 hover:bg-stone-50'
                        }`}
                      >
                        僅看開放簽到 ({openMeetingsCount})
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* Tab 1: Active & Past Meeting Sessions */}
              {activeTab === 'sessions' && (
                <div className="space-y-4">
                  {/* Quick Teacher Profile Bar for 1-click check-in */}
                  <div className="bg-white border border-stone-200 rounded-xl p-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <label
                        htmlFor="checkin-teacher-name"
                        className="block text-xs font-medium text-stone-700"
                      >
                        簽到顯示姓名（可調整）
                      </label>
                      <input
                        id="checkin-teacher-name"
                        type="text"
                        maxLength={100}
                        value={customNameInput}
                        onChange={(e) => setCustomNameInput(e.target.value)}
                        placeholder={user?.displayName || '請輸入老師姓名'}
                        className="w-full h-9 px-3 text-xs sm:text-sm bg-[#FBF9F5] border border-stone-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1E3A8A] focus:bg-white"
                      />
                    </div>
                    <div className="space-y-1">
                      <label
                        htmlFor="checkin-teacher-note"
                        className="block text-xs font-medium text-stone-700"
                      >
                        職務 / 年段備註（選填，簽到自動帶入）
                      </label>
                      <input
                        id="checkin-teacher-note"
                        type="text"
                        maxLength={120}
                        value={teacherNoteInput}
                        onChange={(e) => setTeacherNoteInput(e.target.value)}
                        placeholder="例如：四年級導師、數學領域教師"
                        className="w-full h-9 px-3 text-xs sm:text-sm bg-[#FBF9F5] border border-stone-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1E3A8A] focus:bg-white"
                      />
                    </div>
                  </div>

                  {isLoadingMeetings ? (
                    <div className="bg-white border border-stone-200 rounded-xl p-8 text-center text-sm text-stone-500">
                      正在載入社群會議場次...
                    </div>
                  ) : displayedMeetings.length === 0 ? (
                    <div className="bg-white border border-stone-200 rounded-xl p-8 text-center space-y-3">
                      <CalendarCheck className="w-8 h-8 text-stone-400 mx-auto" />
                      <h3 className="font-editorial text-lg font-semibold text-stone-900">
                        目前尚無{sessionFilter === 'open' ? '開放簽到中的' : ''}會議場次
                      </h3>
                      <p className="text-xs sm:text-sm text-stone-600 max-w-md mx-auto">
                        {isTeacherAdmin
                          ? '您是授權管理教師，可點擊上方「建立會議場次」新增本次領域共備或社群會議。'
                          : '請等待領域召集教師開啟新會議場次後再進行簽到。'}
                      </p>
                      {isTeacherAdmin && (
                        <button
                          type="button"
                          onClick={() => setActiveTab('admin')}
                          className="px-4 py-2 text-xs font-semibold text-white bg-[#1E3A8A] rounded-lg hover:bg-[#172554] inline-flex items-center gap-1.5"
                        >
                          <Plus className="w-3.5 h-3.5" />
                          <span>立即建立第一個會議場次</span>
                        </button>
                      )}
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {displayedMeetings.map((meeting) => {
                        const myRecord = myCheckinByMeetingId.get(meeting.id);
                        const adminRoster = isTeacherAdmin
                          ? checkinsByMeetingIdForAdmin.get(meeting.id) || []
                          : [];
                        const isRosterExpanded =
                          expandedRosterMeetingId === meeting.id;
                        const isEditingThis =
                          myRecord && editingCheckinId === myRecord.id;

                        return (
                          <article
                            key={meeting.id}
                            className="bg-white border border-stone-200 rounded-xl p-4 sm:p-5 space-y-4"
                          >
                            <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                              <div className="space-y-1.5 min-w-0">
                                <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs">
                                  <span
                                    className={`font-semibold ${
                                      meeting.isOpen
                                        ? 'text-emerald-800'
                                        : 'text-stone-500'
                                    }`}
                                  >
                                    {meeting.isOpen ? '開放簽到中' : '已截止簽到'}
                                  </span>
                                  <span aria-hidden="true" className="text-stone-300">
                                    ·
                                  </span>
                                  <span className="font-mono-tabular font-medium text-[#1E3A8A]">
                                    {meeting.academicYear}
                                  </span>
                                  <span aria-hidden="true" className="text-stone-300">
                                    ·
                                  </span>
                                  <span className="font-mono-tabular text-stone-600">
                                    {meeting.meetingDate}
                                  </span>
                                </div>

                                <h3 className="font-editorial text-lg font-bold text-stone-950 break-words">
                                  {meeting.title}
                                </h3>

                                {meeting.location && (
                                  <div className="flex items-center gap-1.5 text-xs text-stone-600">
                                    <MapPin className="w-3.5 h-3.5 text-stone-400 shrink-0" />
                                    <span>{meeting.location}</span>
                                  </div>
                                )}
                              </div>

                              {/* Quick Links */}
                              <div className="flex flex-wrap items-center gap-2 shrink-0">
                                {meeting.linkedPostSlug && (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      onClose();
                                      onOpenLinkedPost(meeting.linkedPostSlug);
                                    }}
                                    className="px-3 py-1.5 text-xs font-medium text-[#1E3A8A] bg-[#F7F4EE] border border-stone-200 rounded-lg hover:bg-stone-200/70 inline-flex items-center gap-1.5"
                                  >
                                    <BookOpen className="w-3.5 h-3.5" />
                                    <span>閱讀關聯會議紀錄</span>
                                  </button>
                                )}
                                {meeting.meetUrl && (
                                  <a
                                    href={meeting.meetUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="px-3 py-1.5 text-xs font-medium text-stone-800 bg-white border border-stone-300 rounded-lg hover:bg-stone-50 inline-flex items-center gap-1.5"
                                  >
                                    <Video className="w-3.5 h-3.5 text-[#1E3A8A]" />
                                    <span>會議室 / 簡報</span>
                                    <ExternalLink className="w-3 h-3" />
                                  </a>
                                )}
                              </div>
                            </div>

                            {meeting.agendaSummary && (
                              <p className="text-xs sm:text-sm text-stone-700 leading-relaxed whitespace-pre-line bg-[#FBF9F5] border border-stone-200/80 rounded-lg p-3.5">
                                {meeting.agendaSummary}
                              </p>
                            )}

                            {/* Check-in Action Bar + Handwritten Signature Pad */}
                            <div className="pt-3 border-t border-stone-100 space-y-3">
                              {myRecord ? (
                                <div className="space-y-3">
                                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-emerald-50/60 border border-emerald-200/80 rounded-xl p-3.5">
                                    <div className="space-y-1.5 min-w-0">
                                      <div className="flex flex-wrap items-center gap-2 text-xs sm:text-sm text-emerald-900 font-semibold">
                                        <CheckCircle2 className="w-4 h-4 text-emerald-700 shrink-0" />
                                        <span>您已完成此場次簽到</span>
                                        <span className="font-mono-tabular text-xs font-normal text-stone-600">
                                          ({formatDateTime(myRecord.checkedInAtMs)})
                                        </span>
                                      </div>

                                      <div className="flex flex-wrap items-center gap-2 text-xs text-stone-700">
                                        <span>
                                          簽到姓名：{myRecord.userName}
                                          {myRecord.roleOrNote
                                            ? ` · 備註：${myRecord.roleOrNote}`
                                            : ''}
                                        </span>
                                      </div>

                                      {!isEditingThis && meeting.isOpen && (
                                        <div className="flex flex-wrap items-center gap-3 text-xs pt-0.5">
                                          <button
                                            type="button"
                                            onClick={() => {
                                              setEditingCheckinId(myRecord.id);
                                              setEditingNoteDraft(
                                                myRecord.roleOrNote,
                                              );
                                              setEditingSignatureDraft(null);
                                              setShowEditSignaturePad(
                                                !isValidSignatureDataUrl(
                                                  myRecord.signatureDataUrl,
                                                ),
                                              );
                                            }}
                                            className="text-[#1E3A8A] hover:underline font-semibold"
                                          >
                                            修改備註 / 重簽名
                                          </button>
                                          {confirmCancelId === myRecord.id ? (
                                            <span className="inline-flex items-center gap-1.5">
                                              <button
                                                type="button"
                                                onClick={() =>
                                                  handleCancelCheckin(myRecord)
                                                }
                                                className="text-red-700 font-semibold hover:underline"
                                              >
                                                確認取消簽到
                                              </button>
                                              <button
                                                type="button"
                                                onClick={() =>
                                                  setConfirmCancelId(null)
                                                }
                                                className="text-stone-500 hover:underline"
                                              >
                                                保留
                                              </button>
                                            </span>
                                          ) : (
                                            <button
                                              type="button"
                                              onClick={() =>
                                                setConfirmCancelId(myRecord.id)
                                              }
                                              className="text-stone-500 hover:text-red-700 hover:underline"
                                            >
                                              取消簽到
                                            </button>
                                          )}
                                        </div>
                                      )}
                                    </div>

                                    {isValidSignatureDataUrl(
                                      myRecord.signatureDataUrl,
                                    ) ? (
                                      <div className="shrink-0 bg-white border border-stone-200 rounded-lg px-3 py-1.5 flex flex-col items-center gap-1">
                                        <span className="text-[10px] font-medium text-stone-500">
                                          本人親筆簽名存證
                                        </span>
                                        <img
                                          src={myRecord.signatureDataUrl}
                                          alt={`${myRecord.userName}親筆簽名`}
                                          className="h-12 w-32 object-contain"
                                        />
                                      </div>
                                    ) : (
                                      <div className="shrink-0 text-[11px] text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-1.5">
                                        尚未附親筆簽名（點「修改備註 / 重簽名」可補簽）
                                      </div>
                                    )}
                                  </div>

                                  {isEditingThis && (
                                    <div className="bg-[#FBF9F5] border border-stone-200 rounded-xl p-4 space-y-3">
                                      <div className="flex flex-wrap items-center gap-2">
                                        <input
                                          type="text"
                                          maxLength={120}
                                          value={editingNoteDraft}
                                          onChange={(e) =>
                                            setEditingNoteDraft(e.target.value)
                                          }
                                          placeholder="職務或年段備註"
                                          className="flex-1 min-w-[200px] h-9 px-3 text-xs bg-white border border-stone-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1E3A8A]"
                                        />
                                        {isValidSignatureDataUrl(
                                          myRecord.signatureDataUrl,
                                        ) && (
                                          <label className="inline-flex items-center gap-1.5 text-xs font-medium text-stone-700 cursor-pointer px-2 py-1">
                                            <input
                                              type="checkbox"
                                              checked={showEditSignaturePad}
                                              onChange={(e) => {
                                                setShowEditSignaturePad(
                                                  e.target.checked,
                                                );
                                                if (!e.target.checked) {
                                                  setEditingSignatureDraft(
                                                    null,
                                                  );
                                                }
                                              }}
                                              className="rounded border-stone-300 text-[#1E3A8A]"
                                            />
                                            <span>重新手寫簽名</span>
                                          </label>
                                        )}
                                      </div>

                                      {(showEditSignaturePad ||
                                        !isValidSignatureDataUrl(
                                          myRecord.signatureDataUrl,
                                        )) && (
                                        <SignaturePad
                                          signerLabel={
                                            customNameInput.trim() ||
                                            myRecord.userName
                                          }
                                          onChange={setEditingSignatureDraft}
                                        />
                                      )}

                                      <div className="flex flex-wrap items-center justify-end gap-2">
                                        <button
                                          type="button"
                                          onClick={() => {
                                            setEditingCheckinId(null);
                                            setEditingSignatureDraft(null);
                                            setShowEditSignaturePad(false);
                                          }}
                                          className="px-3 py-1.5 text-xs font-medium text-stone-600 bg-white border border-stone-300 rounded-lg hover:bg-stone-100"
                                        >
                                          取消
                                        </button>
                                        <button
                                          type="button"
                                          onClick={() =>
                                            handleUpdateNote(myRecord)
                                          }
                                          className="px-4 py-1.5 text-xs font-semibold text-white bg-[#1E3A8A] rounded-lg hover:bg-[#172554]"
                                        >
                                          儲存變更
                                        </button>
                                      </div>
                                    </div>
                                  )}
                                </div>
                              ) : meeting.isOpen ? (
                                (() => {
                                  const isPadExpanded =
                                    activeSigningMeetingId === meeting.id;
                                  const currentSigDraft =
                                    signatureDraftByMeeting[meeting.id] || null;
                                  const isSigReady =
                                    isValidSignatureDataUrl(currentSigDraft);

                                  return isPadExpanded ? (
                                    <div className="bg-[#FBF9F5] border border-[#1E3A8A]/25 rounded-xl p-4 space-y-3.5">
                                      <SignaturePad
                                        signerLabel={
                                          customNameInput.trim() ||
                                          user?.displayName ||
                                          user?.email?.split('@')[0]
                                        }
                                        disabled={
                                          submittingMeetingId === meeting.id
                                        }
                                        onChange={(dataUrl) =>
                                          setSignatureDraftByMeeting(
                                            (prev) => ({
                                              ...prev,
                                              [meeting.id]: dataUrl,
                                            }),
                                          )
                                        }
                                      />

                                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 pt-1">
                                        <span className="text-xs text-stone-600">
                                          {isSigReady ? (
                                            <span className="text-emerald-800 font-semibold">
                                              ✓ 已擷取您的親筆簽名，點擊右側按鈕即可送出簽到。
                                            </span>
                                          ) : (
                                            <span>
                                              需先完成親自手寫簽名（系統會保存筆跡並記錄時間戳記）。
                                            </span>
                                          )}
                                        </span>

                                        <div className="flex items-center gap-2 shrink-0">
                                          <button
                                            type="button"
                                            onClick={() =>
                                              setActiveSigningMeetingId(null)
                                            }
                                            className="px-3 py-2 text-xs font-medium text-stone-600 bg-white border border-stone-300 rounded-lg hover:bg-stone-50"
                                          >
                                            收合
                                          </button>
                                          <button
                                            type="button"
                                            disabled={
                                              submittingMeetingId ===
                                                meeting.id || !isSigReady
                                            }
                                            onClick={() =>
                                              handleCheckin(meeting)
                                            }
                                            className="min-h-[40px] px-4 py-2 text-xs sm:text-sm font-semibold text-white bg-[#1E3A8A] hover:bg-[#172554] disabled:opacity-50 rounded-lg inline-flex items-center justify-center gap-1.5 transition-colors whitespace-nowrap"
                                          >
                                            <ClipboardCheck className="w-4 h-4" />
                                            <span>
                                              {submittingMeetingId ===
                                              meeting.id
                                                ? '簽名上傳簽到中...'
                                                : '確認手寫簽名並完成簽到'}
                                            </span>
                                          </button>
                                        </div>
                                      </div>
                                    </div>
                                  ) : (
                                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                                      <span className="text-xs text-stone-600">
                                        本場次採「親自手寫簽名」認證出席（帳號：{user?.email}）。
                                      </span>
                                      <button
                                        type="button"
                                        onClick={() =>
                                          setActiveSigningMeetingId(meeting.id)
                                        }
                                        className="w-full sm:w-auto min-h-[40px] px-4 py-2 text-xs sm:text-sm font-semibold text-white bg-[#1E3A8A] hover:bg-[#172554] rounded-lg inline-flex items-center justify-center gap-1.5 transition-colors whitespace-nowrap shrink-0"
                                      >
                                        <PenTool className="w-4 h-4" />
                                        <span>展開手寫簽名板進行簽到</span>
                                      </button>
                                    </div>
                                  );
                                })()
                              ) : (
                                <span className="text-xs text-stone-500">
                                  此場次簽到已截止，您未留存本場簽到紀錄。
                                </span>
                              )}
                            </div>

                            {/* Admin Controls & Attendance Roster */}
                            {isTeacherAdmin && (
                              <div className="pt-3 border-t border-stone-200/80 space-y-3">
                                <div className="flex flex-wrap items-center justify-between gap-2">
                                  <div className="flex flex-wrap items-center gap-2">
                                    <button
                                      type="button"
                                      onClick={() =>
                                        setExpandedRosterMeetingId(
                                          isRosterExpanded ? null : meeting.id,
                                        )
                                      }
                                      className="px-3 py-1.5 text-xs font-semibold text-stone-800 bg-[#F7F4EE] border border-stone-200 rounded-lg hover:bg-stone-200/70 inline-flex items-center gap-1.5"
                                    >
                                      <Users className="w-3.5 h-3.5 text-[#1E3A8A]" />
                                      <span>
                                        {isRosterExpanded ? '收合簽到名單' : '檢視簽到名單'} (
                                        {adminRoster.length} 人)
                                      </span>
                                    </button>

                                    <button
                                      type="button"
                                      disabled={adminRoster.length === 0}
                                      onClick={() =>
                                        handleExportPrintableSheet(
                                          meeting,
                                          adminRoster,
                                        )
                                      }
                                      className="px-3 py-1.5 text-xs font-semibold text-white bg-[#1E3A8A] rounded-lg hover:bg-[#172554] disabled:opacity-40 inline-flex items-center gap-1.5"
                                    >
                                      <FileText className="w-3.5 h-3.5" />
                                      <span>匯出含簽名簽到表 (可印 PDF)</span>
                                    </button>

                                    <button
                                      type="button"
                                      disabled={adminRoster.length === 0}
                                      onClick={() =>
                                        handleExportCsv(meeting, adminRoster)
                                      }
                                      className="px-3 py-1.5 text-xs font-medium text-[#1E3A8A] bg-white border border-[#1E3A8A]/30 rounded-lg hover:bg-[#1E3A8A]/5 disabled:opacity-40 inline-flex items-center gap-1.5"
                                    >
                                      <Download className="w-3.5 h-3.5" />
                                      <span>匯出 CSV</span>
                                    </button>
                                  </div>

                                  <div className="flex flex-wrap items-center gap-2">
                                    <button
                                      type="button"
                                      onClick={() =>
                                        handleToggleMeetingOpen(meeting)
                                      }
                                      className="px-3 py-1.5 text-xs font-medium text-stone-700 bg-white border border-stone-300 rounded-lg hover:bg-stone-50"
                                    >
                                      {meeting.isOpen ? '關閉簽到' : '重新開放簽到'}
                                    </button>

                                    {confirmDeleteMeetingId === meeting.id ? (
                                      <div className="inline-flex items-center gap-1.5">
                                        <button
                                          type="button"
                                          disabled={deletingMeetingId === meeting.id}
                                          onClick={() =>
                                            handleDeleteMeeting(meeting)
                                          }
                                          className="px-2.5 py-1.5 text-xs font-semibold text-white bg-red-600 hover:bg-red-700 rounded-lg"
                                        >
                                          確認刪除場次
                                        </button>
                                        <button
                                          type="button"
                                          onClick={() =>
                                            setConfirmDeleteMeetingId(null)
                                          }
                                          className="px-2.5 py-1.5 text-xs text-stone-600 bg-stone-100 rounded-lg"
                                        >
                                          取消
                                        </button>
                                      </div>
                                    ) : (
                                      <button
                                        type="button"
                                        onClick={() =>
                                          setConfirmDeleteMeetingId(meeting.id)
                                        }
                                        className="p-1.5 text-stone-500 hover:text-red-700 rounded-lg hover:bg-red-50 transition-colors"
                                        aria-label={`刪除 ${meeting.title}`}
                                      >
                                        <Trash2 className="w-4 h-4" />
                                      </button>
                                    )}
                                  </div>
                                </div>

                                {isRosterExpanded && (
                                  <div className="bg-[#F7F4EE] border border-stone-200 rounded-xl overflow-hidden">
                                    {adminRoster.length === 0 ? (
                                      <div className="p-4 text-xs text-stone-500 text-center">
                                        目前尚無教師簽到此場次。
                                      </div>
                                    ) : (
                                      <div className="overflow-x-auto">
                                        <table className="w-full text-left border-collapse text-xs">
                                          <thead>
                                            <tr className="border-b border-stone-200 text-stone-600 bg-white/60">
                                              <th className="py-2.5 px-3 font-semibold">#</th>
                                              <th className="py-2.5 px-3 font-semibold">教師姓名</th>
                                              <th className="py-2.5 px-3 font-semibold">信箱</th>
                                              <th className="py-2.5 px-3 font-semibold">職務備註</th>
                                              <th className="py-2.5 px-3 font-semibold">親自手寫簽名</th>
                                              <th className="py-2.5 px-3 font-semibold">簽到時間</th>
                                            </tr>
                                          </thead>
                                          <tbody className="divide-y divide-stone-200/70">
                                            {adminRoster.map((rec, idx) => (
                                              <tr key={rec.id} className="bg-white/50">
                                                <td className="py-2 px-3 font-mono-tabular text-stone-500">
                                                  {idx + 1}
                                                </td>
                                                <td className="py-2 px-3 font-medium text-stone-900">
                                                  {rec.userName}
                                                </td>
                                                <td className="py-2 px-3 font-mono-tabular text-stone-600">
                                                  {rec.userEmail}
                                                </td>
                                                <td className="py-2 px-3 text-stone-700">
                                                  {rec.roleOrNote || '—'}
                                                </td>
                                                <td className="py-2 px-3">
                                                  {isValidSignatureDataUrl(
                                                    rec.signatureDataUrl,
                                                  ) ? (
                                                    <div className="inline-flex bg-white border border-stone-200 rounded px-2 py-1">
                                                      <img
                                                        src={
                                                          rec.signatureDataUrl
                                                        }
                                                        alt={`${rec.userName}親筆簽名`}
                                                        className="h-9 w-24 object-contain"
                                                      />
                                                    </div>
                                                  ) : (
                                                    <span className="text-[11px] text-stone-400">
                                                      未附簽名
                                                    </span>
                                                  )}
                                                </td>
                                                <td className="py-2 px-3 font-mono-tabular text-stone-600 whitespace-nowrap">
                                                  {formatDateTime(rec.checkedInAtMs)}
                                                </td>
                                              </tr>
                                            ))}
                                          </tbody>
                                        </table>
                                      </div>
                                    )}
                                  </div>
                                )}
                              </div>
                            )}
                          </article>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              {/* Tab 2: Personal Check-in History */}
              {activeTab === 'my-history' && (
                <div className="bg-white border border-stone-200 rounded-xl overflow-hidden">
                  {myCheckins.length === 0 ? (
                    <div className="p-8 text-center text-sm text-stone-500">
                      您目前尚無任何會議簽到紀錄。
                    </div>
                  ) : (
                    <div className="divide-y divide-stone-100">
                      {myCheckins.map((item) => (
                        <div
                          key={item.id}
                          className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                        >
                          <div className="min-w-0 space-y-1">
                            <div className="text-sm font-semibold text-stone-950 truncate">
                              {item.meetingTitle}
                            </div>
                            <div className="text-xs text-stone-600">
                              姓名：{item.userName}
                              {item.roleOrNote ? ` · 備註：${item.roleOrNote}` : ''}
                            </div>
                            <div className="text-xs font-mono-tabular text-emerald-800 font-medium">
                              已簽到 · {formatDateTime(item.checkedInAtMs)}
                            </div>
                          </div>
                          {isValidSignatureDataUrl(item.signatureDataUrl) ? (
                            <div className="shrink-0 bg-[#FBF9F5] border border-stone-200 rounded-lg px-2.5 py-1.5 self-start sm:self-center">
                              <img
                                src={item.signatureDataUrl}
                                alt={`${item.userName}親筆簽名`}
                                className="h-10 w-28 object-contain"
                              />
                            </div>
                          ) : (
                            <span className="text-[11px] text-stone-400 shrink-0">
                              早期無簽名檔紀錄
                            </span>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Tab 3: Admin Create Session */}
              {activeTab === 'admin' && isTeacherAdmin && (
                <form
                  onSubmit={handleCreateSession}
                  className="bg-white border border-stone-200 rounded-xl p-5 sm:p-6 space-y-4"
                >
                  <div className="border-b border-stone-100 pb-3">
                    <h3 className="font-editorial text-base font-bold text-stone-950">
                      建立新的社群會議簽到場次
                    </h3>
                    <p className="text-xs text-stone-500 mt-0.5">
                      僅供登入 @{SCHOOL_DOMAIN} 的社群教師與管理員檢視並完成簽到。
                    </p>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="sm:col-span-2 space-y-1">
                      <label className="block text-xs font-medium text-stone-700">
                        會議名稱 *
                      </label>
                      <input
                        type="text"
                        required
                        maxLength={160}
                        value={newTitle}
                        onChange={(e) => setNewTitle(e.target.value)}
                        placeholder="例如：114 學年度第 1 學期數學領域期初共備會議"
                        className="w-full px-3.5 py-2 text-sm border border-stone-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1E3A8A]"
                      />
                    </div>

                    <div className="space-y-1">
                      <label className="block text-xs font-medium text-stone-700">
                        會議日期與時間 *
                      </label>
                      <input
                        type="text"
                        required
                        maxLength={40}
                        value={newDate}
                        onChange={(e) => setNewDate(e.target.value)}
                        placeholder="2025-09-10 13:30"
                        className="w-full px-3.5 py-2 text-sm font-mono-tabular border border-stone-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1E3A8A]"
                      />
                    </div>

                    <div className="space-y-1">
                      <label className="block text-xs font-medium text-stone-700">
                        所屬學年度
                      </label>
                      <input
                        type="text"
                        list="meeting-year-options"
                        maxLength={40}
                        value={newYear}
                        onChange={(e) => setNewYear(e.target.value)}
                        className="w-full px-3.5 py-2 text-sm border border-stone-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1E3A8A]"
                      />
                      <datalist id="meeting-year-options">
                        {ACADEMIC_YEAR_OPTIONS.map((yr) => (
                          <option key={yr} value={yr} />
                        ))}
                      </datalist>
                    </div>

                    <div className="space-y-1">
                      <label className="block text-xs font-medium text-stone-700">
                        會議地點 / 線上方式
                      </label>
                      <input
                        type="text"
                        maxLength={160}
                        value={newLocation}
                        onChange={(e) => setNewLocation(e.target.value)}
                        placeholder="例如：西門國小 3F 會議室"
                        className="w-full px-3.5 py-2 text-sm border border-stone-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1E3A8A]"
                      />
                    </div>

                    <div className="space-y-1">
                      <label className="block text-xs font-medium text-stone-700">
                        線上會議室或簡報連結（選填，限 https://）
                      </label>
                      <input
                        type="url"
                        maxLength={500}
                        value={newMeetUrl}
                        onChange={(e) => setNewMeetUrl(e.target.value)}
                        placeholder="https://meet.google.com/..."
                        className="w-full px-3.5 py-2 text-sm border border-stone-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1E3A8A]"
                      />
                    </div>

                    <div className="sm:col-span-2 space-y-1">
                      <label className="block text-xs font-medium text-stone-700">
                        關聯知識庫會議文章（選填，方便老師從會議文章一鍵跳轉簽到）
                      </label>
                      <select
                        value={newLinkedSlug}
                        onChange={(e) => setNewLinkedSlug(e.target.value)}
                        className="w-full px-3.5 py-2 text-sm bg-white border border-stone-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1E3A8A]"
                      >
                        <option value="">（不關聯特定文章）</option>
                        {meetingPostsForLinking.map((p) => (
                          <option key={p.slug} value={p.slug}>
                            [{p.academicYear}] {p.title}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="sm:col-span-2 space-y-1">
                      <label className="block text-xs font-medium text-stone-700">
                        議程摘要與校內備註（僅限校內登入教師閱讀）
                      </label>
                      <textarea
                        rows={3}
                        maxLength={1000}
                        value={newAgenda}
                        onChange={(e) => setNewAgenda(e.target.value)}
                        placeholder="輸入本次會議討論議題、共備教材準備事項或校內注意事項..."
                        className="w-full px-3.5 py-2 text-sm border border-stone-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1E3A8A]"
                      />
                    </div>

                    <div className="sm:col-span-2 flex flex-wrap items-center justify-between gap-3 pt-1">
                      <label className="inline-flex items-center gap-2 text-xs font-medium text-stone-700 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={newIsOpen}
                          onChange={(e) => setNewIsOpen(e.target.checked)}
                          className="rounded border-stone-300 text-[#1E3A8A]"
                        />
                        <span>建立後立即開放簽到</span>
                      </label>

                      <button
                        type="submit"
                        disabled={isCreatingSession || !newTitle.trim()}
                        className="w-full sm:w-auto px-5 py-2.5 text-xs sm:text-sm font-semibold text-white bg-[#1E3A8A] hover:bg-[#172554] disabled:opacity-60 rounded-xl transition-colors"
                      >
                        {isCreatingSession ? '建立場次中...' : '發布會議簽到場次'}
                      </button>
                    </div>
                  </div>
                </form>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
};
