import React, {useEffect, useMemo, useRef, useState} from 'react';
import {createPortal} from 'react-dom';
import {User} from 'firebase/auth';
import QRCode from 'qrcode';
import {
  AlertCircle,
  AlertTriangle,
  BookOpen,
  CalendarCheck,
  Check,
  CheckCircle2,
  ClipboardCheck,
  Clock,
  Copy,
  Download,
  ExternalLink,
  FileText,
  History,
  Lock,
  LogOut,
  MapPin,
  PenTool,
  Plus,
  Printer,
  QrCode,
  Search,
  ShieldCheck,
  Trash2,
  UserCheck,
  Users,
  Video,
  X,
} from 'lucide-react';
import {SCHOOL_DOMAIN} from '../services/googleAuth';
import {
  buildMeetingCheckinsCsv,
  buildPrintableMeetingSheetHtml,
  cancelMeetingCheckin,
  cleanupOrphanedCheckinsForAdmin,
  createMeetingSession,
  deleteMeetingSession,
  deleteParentCheckinForAdmin,
  getMeetingCheckinCountdown,
  getMeetingCheckinWindowState,
  isValidSignatureDataUrl,
  MeetingCheckin,
  MeetingSession,
  migrateLegacyParentMeetingsForAdmin,
  ParentCheckin,
  submitMeetingCheckin,
  submitParentCheckin,
  subscribeAllCheckinsForAdmin,
  subscribeAllParentCheckinsForAdmin,
  subscribeMeetings,
  subscribeMyCheckins,
  subscribeParentMeetings,
  updateMeetingSession,
  updateMyCheckinNote,
} from '../services/meetingCheckinDb';
import {SignaturePad} from './SignaturePad';
import {
  generateMeetingAttendancePdfBlob,
  triggerSafeBlobDownload,
} from '../utils/meetingPdfExport';
import {JournalPost} from '../types/journal';
import {ACADEMIC_YEAR_OPTIONS} from '../data/seedPosts';

const TEACHER_NOTE_STORAGE_KEY = 'pesmath_teacher_checkin_note_v1';
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

interface MeetingCheckinModalProps {
  isOpen: boolean;
  initialLinkedPostSlug?: string;
  initialAudienceMode?: 'parent' | 'teacher';
  initialMeetingId?: string;
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
type ViewTrack = 'parent' | 'teacher';
type SessionFilter = 'all' | 'open';

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

function readParentReceipts(): ParentDeviceReceipt[] {
  try {
    const raw = localStorage.getItem(PARENT_RECEIPTS_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (item): item is ParentDeviceReceipt =>
        Boolean(item) &&
        typeof item.id === 'string' &&
        typeof item.meetingId === 'string' &&
        typeof item.studentClassAndSeat === 'string' &&
        typeof item.parentName === 'string',
    );
  } catch {
    return [];
  }
}

function saveParentReceipts(list: ParentDeviceReceipt[]): void {
  try {
    localStorage.setItem(
      PARENT_RECEIPTS_STORAGE_KEY,
      JSON.stringify(list.slice(0, 40)),
    );
  } catch {
    // ignore storage errors
  }
}

function toDateTimeLocalValue(ms: number | null | undefined): string {
  if (typeof ms !== 'number' || !Number.isFinite(ms)) return '';
  const d = new Date(ms);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function parseDateTimeLocalValue(raw: string): number | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const parsed = new Date(trimmed).getTime();
  return Number.isFinite(parsed) ? parsed : null;
}

function buildDirectCheckinUrl(
  audience: 'parent' | 'teacher',
  meetingId: string,
): string {
  if (typeof window === 'undefined') {
    return `?checkin=${audience}&meeting=${meetingId}`;
  }
  const url = new URL(window.location.href);
  url.search = '';
  url.hash = '';
  url.searchParams.set('checkin', audience);
  url.searchParams.set('meeting', meetingId);
  return url.toString();
}

export const MeetingCheckinModal: React.FC<MeetingCheckinModalProps> = ({
  isOpen,
  initialLinkedPostSlug,
  initialAudienceMode,
  initialMeetingId,
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
  const [viewTrack, setViewTrack] = useState<ViewTrack>(
    initialAudienceMode ?? (isSchoolAuthorized ? 'teacher' : 'parent'),
  );
  const [activeTab, setActiveTab] = useState<ModalTab>('sessions');
  const [meetings, setMeetings] = useState<MeetingSession[]>([]);
  const [parentMeetings, setParentMeetings] = useState<MeetingSession[]>([]);
  const [myCheckins, setMyCheckins] = useState<MeetingCheckin[]>([]);
  const [allCheckins, setAllCheckins] = useState<MeetingCheckin[]>([]);
  const [allParentCheckins, setAllParentCheckins] = useState<ParentCheckin[]>(
    [],
  );
  const [isLoadingMeetings, setIsLoadingMeetings] = useState(false);
  const [dbError, setDbError] = useState<string | null>(null);
  const [statusBanner, setStatusBanner] = useState<string | null>(null);

  // Teacher check-in inputs
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
  const [sessionFilter, setSessionFilter] = useState<SessionFilter>('all');

  // Login-free School Day parent check-in state
  const [parentStudentByMeeting, setParentStudentByMeeting] = useState<
    Record<string, string>
  >({});
  const [parentNameByMeeting, setParentNameByMeeting] = useState<
    Record<string, string>
  >({});
  const [parentRelationByMeeting, setParentRelationByMeeting] = useState<
    Record<string, string>
  >({});
  const [parentSigByMeeting, setParentSigByMeeting] = useState<
    Record<string, string | null>
  >({});
  const [submittingParentMeetingId, setSubmittingParentMeetingId] = useState<
    string | null
  >(null);
  const [expandedParentMeetingId, setExpandedParentMeetingId] = useState<
    string | null
  >(null);
  const [parentPadResetNonce, setParentPadResetNonce] = useState<
    Record<string, number>
  >({});
  const [showAnotherParentForm, setShowAnotherParentForm] = useState<
    Record<string, boolean>
  >({});
  const [parentReceipts, setParentReceipts] = useState<ParentDeviceReceipt[]>(
    () => readParentReceipts(),
  );

  // Admin Create Session Form (scoped strictly by current viewTrack)
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
  const [linkedPostSearch, setLinkedPostSearch] = useState('');
  const [newIsOpen, setNewIsOpen] = useState(true);
  const [newCheckinStartLocal, setNewCheckinStartLocal] = useState('');
  const [newCheckinEndLocal, setNewCheckinEndLocal] = useState('');
  const [isCreatingSession, setIsCreatingSession] = useState(false);

  // Live clock ticker for automatic window opening/closing
  const [nowMs, setNowMs] = useState<number>(() => Date.now());

  // Admin Roster Inspection, QR Sharing, Schedule Edit & Delete Confirmation
  const [expandedRosterMeetingId, setExpandedRosterMeetingId] = useState<
    string | null
  >(null);
  const [expandedQrMeetingId, setExpandedQrMeetingId] = useState<string | null>(
    null,
  );
  const [qrDataUrlByMeeting, setQrDataUrlByMeeting] = useState<
    Record<string, string>
  >({});
  const [copiedLinkMeetingId, setCopiedLinkMeetingId] = useState<string | null>(
    null,
  );
  const [editingScheduleMeetingId, setEditingScheduleMeetingId] = useState<
    string | null
  >(null);
  const [editStartLocal, setEditStartLocal] = useState('');
  const [editEndLocal, setEditEndLocal] = useState('');
  const [isSavingSchedule, setIsSavingSchedule] = useState(false);
  const [confirmDeleteMeetingId, setConfirmDeleteMeetingId] = useState<
    string | null
  >(null);
  const [deletingMeetingId, setDeletingMeetingId] = useState<string | null>(
    null,
  );
  const [confirmDeleteParentCheckinId, setConfirmDeleteParentCheckinId] =
    useState<string | null>(null);

  // Printable Roster Preview & Real PDF Export State
  const [previewRoster, setPreviewRoster] = useState<{
    meeting: MeetingSession;
    teacherCheckins: MeetingCheckin[];
    parentCheckins: ParentCheckin[];
  } | null>(null);
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);
  const [pdfNotice, setPdfNotice] = useState<string | null>(null);
  const [readyPdfDownload, setReadyPdfDownload] = useState<{
    url: string;
    filename: string;
  } | null>(null);

  const hasMigratedLegacyRef = useRef(false);

  useEffect(() => {
    if (!isOpen) return;
    setNowMs(Date.now());
    const timer = window.setInterval(() => {
      setNowMs(Date.now());
    }, 1000);
    return () => window.clearInterval(timer);
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    setDbError(null);
    setStatusBanner(null);
    setSessionFilter('all');
    setActiveTab('sessions');
    setExpandedRosterMeetingId(null);
    setExpandedQrMeetingId(null);
    setEditingScheduleMeetingId(null);
    setConfirmDeleteMeetingId(null);

    const nextTrack: ViewTrack =
      initialAudienceMode ?? (isSchoolAuthorized ? 'teacher' : 'parent');
    setViewTrack(nextTrack);

    if (nextTrack === 'parent') {
      setNewLocation('西門國小各班教室 / 視聽教室');
    } else {
      setNewLocation('西門國小 會議室 / Google Meet');
    }
    if (initialLinkedPostSlug) {
      setNewLinkedSlug(initialLinkedPostSlug);
    }
  }, [
    isOpen,
    initialAudienceMode,
    initialLinkedPostSlug,
    isSchoolAuthorized,
  ]);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (previewRoster) {
          setPreviewRoster(null);
        } else {
          onClose();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose, previewRoster]);

  useEffect(() => {
    return () => {
      if (readyPdfDownload?.url) {
        URL.revokeObjectURL(readyPdfDownload.url);
      }
      document.body.classList.remove('printing-attendance-sheet');
    };
  }, [readyPdfDownload]);

  useEffect(() => {
    if (user?.displayName && !customNameInput) {
      setCustomNameInput(user.displayName);
    }
  }, [user?.displayName]);

  // One-time migration when an admin loads the modal to move any legacy parent session out of /meetings
  useEffect(() => {
    if (!isOpen || !isTeacherAdmin || hasMigratedLegacyRef.current) return;
    hasMigratedLegacyRef.current = true;
    void migrateLegacyParentMeetingsForAdmin();
  }, [isOpen, isTeacherAdmin]);

  // Strictly attach subscriptions ONLY for the active track (`parent` vs `teacher`)
  useEffect(() => {
    if (!isOpen) {
      setMeetings([]);
      setParentMeetings([]);
      setMyCheckins([]);
      setAllCheckins([]);
      setAllParentCheckins([]);
      setIsLoadingMeetings(false);
      return;
    }

    setDbError(null);

    if (viewTrack === 'parent') {
      setMeetings([]);
      setMyCheckins([]);
      setAllCheckins([]);
      setIsLoadingMeetings(true);

      const unsubParents = subscribeParentMeetings(
        (list) => {
          setParentMeetings(list);
          setIsLoadingMeetings(false);
        },
        (err) => {
          setIsLoadingMeetings(false);
          setDbError(err.message);
        },
      );

      let unsubAdminParents: (() => void) | undefined;
      if (isSchoolAuthorized && isTeacherAdmin && user) {
        unsubAdminParents = subscribeAllParentCheckinsForAdmin(
          (list) => {
            setAllParentCheckins(list);
          },
          (err) => {
            setDbError(err.message);
          },
        );
      } else {
        setAllParentCheckins([]);
      }

      return () => {
        unsubParents();
        unsubAdminParents?.();
      };
    }

    // Teacher Community Track
    setParentMeetings([]);
    setAllParentCheckins([]);

    if (!isSchoolAuthorized || !user) {
      setMeetings([]);
      setMyCheckins([]);
      setAllCheckins([]);
      setIsLoadingMeetings(false);
      return;
    }

    setIsLoadingMeetings(true);

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

    let unsubAdminTeachers: (() => void) | undefined;
    if (isTeacherAdmin) {
      unsubAdminTeachers = subscribeAllCheckinsForAdmin(
        (list) => {
          setAllCheckins(list);
        },
        (err) => {
          setDbError(err.message);
        },
      );
    } else {
      setAllCheckins([]);
    }

    return () => {
      unsubMeetings();
      unsubMy();
      unsubAdminTeachers?.();
    };
  }, [isOpen, viewTrack, isSchoolAuthorized, isTeacherAdmin, user]);

  // Generate QR codes lazily whenever an admin opens any session's QR drawer (parent or teacher)
  useEffect(() => {
    if (!expandedQrMeetingId) {
      return;
    }
    const cacheKey = `${viewTrack}:${expandedQrMeetingId}`;
    if (qrDataUrlByMeeting[cacheKey]) {
      return;
    }
    const targetUrl = buildDirectCheckinUrl(viewTrack, expandedQrMeetingId);
    let active = true;
    void QRCode.toDataURL(targetUrl, {
      width: 320,
      margin: 2,
      color: {
        dark: viewTrack === 'parent' ? '#065F46' : '#1E3A8A',
        light: '#FFFFFF',
      },
    })
      .then((dataUrl) => {
        if (active) {
          setQrDataUrlByMeeting((prev) => ({
            ...prev,
            [cacheKey]: dataUrl,
          }));
        }
      })
      .catch(() => {
        // ignore QR generation failure
      });
    return () => {
      active = false;
    };
  }, [expandedQrMeetingId, viewTrack, qrDataUrlByMeeting]);

  const checkedOrphanIdsRef = useRef<Set<string>>(new Set());

  const activeTeacherMeetingIdSet = useMemo(
    () => new Set(meetings.map((m) => m.id)),
    [meetings],
  );

  const activeParentMeetingIdSet = useMemo(
    () => new Set(parentMeetings.map((m) => m.id)),
    [parentMeetings],
  );

  // Only surface teacher check-ins whose parent teacher meeting still exists
  const activeMyCheckins = useMemo(() => {
    if (isLoadingMeetings) return [];
    return myCheckins.filter((item) =>
      activeTeacherMeetingIdSet.has(item.meetingId),
    );
  }, [isLoadingMeetings, myCheckins, activeTeacherMeetingIdSet]);

  const myCheckinByMeetingId = useMemo(() => {
    const map = new Map<string, MeetingCheckin>();
    for (const item of activeMyCheckins) {
      map.set(item.meetingId, item);
    }
    return map;
  }, [activeMyCheckins]);

  // Clean up orphaned check-ins scoped to the active track only
  useEffect(() => {
    if (!isOpen || !isTeacherAdmin || isLoadingMeetings) return;

    const listToCheck =
      viewTrack === 'parent' ? allParentCheckins : allCheckins;
    const validSet =
      viewTrack === 'parent'
        ? activeParentMeetingIdSet
        : activeTeacherMeetingIdSet;

    if (listToCheck.length === 0) return;

    const candidates = Array.from(
      new Set(
        listToCheck
          .map((c) => c.meetingId)
          .filter(
            (id) =>
              Boolean(id) &&
              !validSet.has(id) &&
              !checkedOrphanIdsRef.current.has(id),
          ),
      ),
    );
    if (candidates.length === 0) return;

    for (const id of candidates) {
      checkedOrphanIdsRef.current.add(id);
    }
    void cleanupOrphanedCheckinsForAdmin(candidates);
  }, [
    isOpen,
    viewTrack,
    isTeacherAdmin,
    isLoadingMeetings,
    allCheckins,
    allParentCheckins,
    activeTeacherMeetingIdSet,
    activeParentMeetingIdSet,
  ]);

  const checkinsByMeetingIdForAdmin = useMemo(() => {
    const map = new Map<string, MeetingCheckin[]>();
    for (const item of allCheckins) {
      const list = map.get(item.meetingId);
      if (list) list.push(item);
      else map.set(item.meetingId, [item]);
    }
    return map;
  }, [allCheckins]);

  const parentCheckinsByMeetingIdForAdmin = useMemo(() => {
    const map = new Map<string, ParentCheckin[]>();
    for (const item of allParentCheckins) {
      const list = map.get(item.meetingId);
      if (list) list.push(item);
      else map.set(item.meetingId, [item]);
    }
    return map;
  }, [allParentCheckins]);

  const orderedParentMeetings = useMemo(() => {
    let base = parentMeetings;
    if (isTeacherAdmin && sessionFilter === 'open') {
      base = parentMeetings.filter(
        (m) => getMeetingCheckinWindowState(m, nowMs).status === 'open',
      );
    }
    if (!initialMeetingId) return base;
    return [...base].sort((a, b) => {
      if (a.id === initialMeetingId && b.id !== initialMeetingId) return -1;
      if (b.id === initialMeetingId && a.id !== initialMeetingId) return 1;
      return 0;
    });
  }, [parentMeetings, initialMeetingId, isTeacherAdmin, sessionFilter, nowMs]);

  const openParentMeetingsCount = useMemo(
    () =>
      parentMeetings.filter(
        (m) => getMeetingCheckinWindowState(m, nowMs).status === 'open',
      ).length,
    [parentMeetings, nowMs],
  );

  const parentReceiptsByMeeting = useMemo(() => {
    const map = new Map<string, ParentDeviceReceipt[]>();
    for (const rec of parentReceipts) {
      const list = map.get(rec.meetingId);
      if (list) list.push(rec);
      else map.set(rec.meetingId, [rec]);
    }
    return map;
  }, [parentReceipts]);

  const displayedTeacherMeetings = useMemo(() => {
    const base =
      sessionFilter === 'open'
        ? meetings.filter(
            (m) => getMeetingCheckinWindowState(m, nowMs).status === 'open',
          )
        : meetings;
    if (!initialMeetingId) return base;
    return [...base].sort((a, b) => {
      if (a.id === initialMeetingId && b.id !== initialMeetingId) return -1;
      if (b.id === initialMeetingId && a.id !== initialMeetingId) return 1;
      return 0;
    });
  }, [meetings, sessionFilter, nowMs, initialMeetingId]);

  const openTeacherMeetingsCount = useMemo(
    () =>
      meetings.filter(
        (m) => getMeetingCheckinWindowState(m, nowMs).status === 'open',
      ).length,
    [meetings, nowMs],
  );

  // Auto-expand the first open parent meeting for non-admin parents
  useEffect(() => {
    if (!isOpen || viewTrack !== 'parent' || isTeacherAdmin) return;
    if (
      initialMeetingId &&
      orderedParentMeetings.some((m) => m.id === initialMeetingId)
    ) {
      setExpandedParentMeetingId(initialMeetingId);
      return;
    }
    if (
      expandedParentMeetingId &&
      orderedParentMeetings.some((m) => m.id === expandedParentMeetingId)
    ) {
      return;
    }
    const firstOpen = orderedParentMeetings.find(
      (m) => getMeetingCheckinWindowState(m, nowMs).status === 'open',
    );
    setExpandedParentMeetingId(
      firstOpen ? firstOpen.id : orderedParentMeetings[0]?.id ?? null,
    );
  }, [
    isOpen,
    viewTrack,
    isTeacherAdmin,
    orderedParentMeetings,
    initialMeetingId,
    expandedParentMeetingId,
    nowMs,
  ]);

  // Auto-open signature pad for the initialMeetingId (if open & unchecked) or first open unchecked-in teacher meeting
  useEffect(() => {
    if (!isOpen || viewTrack !== 'teacher' || !isSchoolAuthorized) return;
    if (activeSigningMeetingId) {
      const stillOpenUnchecked = meetings.some(
        (m) =>
          m.id === activeSigningMeetingId &&
          getMeetingCheckinWindowState(m, nowMs).status === 'open' &&
          !myCheckinByMeetingId.has(m.id),
      );
      if (stillOpenUnchecked) return;
    }
    const targetInitial = initialMeetingId
      ? meetings.find(
          (m) =>
            m.id === initialMeetingId &&
            getMeetingCheckinWindowState(m, nowMs).status === 'open' &&
            !myCheckinByMeetingId.has(m.id),
        )
      : undefined;
    const nextOpen =
      targetInitial ??
      meetings.find(
        (m) =>
          getMeetingCheckinWindowState(m, nowMs).status === 'open' &&
          !myCheckinByMeetingId.has(m.id),
      );
    setActiveSigningMeetingId(nextOpen ? nextOpen.id : null);
  }, [
    isOpen,
    viewTrack,
    isSchoolAuthorized,
    meetings,
    myCheckinByMeetingId,
    activeSigningMeetingId,
    initialMeetingId,
    nowMs,
  ]);

  const sortedAllPostsForLinking = useMemo(() => {
    return [...posts].sort((a, b) =>
      (b.publishedAt || '').localeCompare(a.publishedAt || ''),
    );
  }, [posts]);

  const meetingPostsForLinking = useMemo(() => {
    const q = linkedPostSearch.trim().toLowerCase();
    if (!q) return sortedAllPostsForLinking;
    return sortedAllPostsForLinking.filter(
      (p) =>
        p.slug === newLinkedSlug ||
        p.title.toLowerCase().includes(q) ||
        (p.category || '').toLowerCase().includes(q) ||
        (p.academicYear || '').toLowerCase().includes(q),
    );
  }, [sortedAllPostsForLinking, linkedPostSearch, newLinkedSlug]);

  if (!isOpen) return null;

  const switchAdminTrack = (nextTrack: ViewTrack) => {
    if (!isTeacherAdmin) return;
    setDbError(null);
    setStatusBanner(null);
    setSessionFilter('all');
    setActiveTab('sessions');
    setExpandedRosterMeetingId(null);
    setExpandedQrMeetingId(null);
    setExpandedParentMeetingId(null);
    setEditingScheduleMeetingId(null);
    setConfirmDeleteMeetingId(null);
    setViewTrack(nextTrack);
    setNewTitle('');
    setNewAgenda('');
    setNewMeetUrl('');
    setNewCheckinStartLocal('');
    setNewCheckinEndLocal('');
    setNewLocation(
      nextTrack === 'parent'
        ? '西門國小各班教室 / 視聽教室'
        : '西門國小 會議室 / Google Meet',
    );
  };

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

  const handleParentCheckinSubmit = async (meeting: MeetingSession) => {
    const studentVal = (parentStudentByMeeting[meeting.id] || '').trim();
    const parentVal = (parentNameByMeeting[meeting.id] || '').trim();
    const relationVal = (parentRelationByMeeting[meeting.id] || '').trim();
    const sigUrl = parentSigByMeeting[meeting.id] || '';

    if (!studentVal) {
      setDbError('請填寫學生班級座號或學生姓名（例如：403 班 12 號 王小明）。');
      return;
    }
    if (!parentVal) {
      setDbError('請填寫家長姓名或稱謂（例如：王爸爸、陳媽媽）。');
      return;
    }
    if (!isValidSignatureDataUrl(sigUrl)) {
      setDbError('請先在「親自手寫簽名區」親筆簽名後，再送出簽到。');
      return;
    }

    setDbError(null);
    setStatusBanner(null);
    setSubmittingParentMeetingId(meeting.id);
    try {
      const res = await submitParentCheckin({
        meetingId: meeting.id,
        meetingTitle: meeting.title,
        studentClassAndSeat: studentVal,
        parentName: parentVal,
        relationshipOrNote: relationVal,
        signatureDataUrl: sigUrl,
      });

      const nextReceipt: ParentDeviceReceipt = {
        id: res.id,
        meetingId: meeting.id,
        meetingTitle: meeting.title,
        studentClassAndSeat: studentVal,
        parentName: parentVal,
        relationshipOrNote: relationVal,
        signatureDataUrl: sigUrl,
        checkedInAtMs: res.checkedInAtMs,
      };
      const updatedReceipts = [nextReceipt, ...parentReceipts];
      setParentReceipts(updatedReceipts);
      saveParentReceipts(updatedReceipts);

      setParentStudentByMeeting((prev) => ({...prev, [meeting.id]: ''}));
      setParentNameByMeeting((prev) => ({...prev, [meeting.id]: ''}));
      setParentRelationByMeeting((prev) => ({...prev, [meeting.id]: ''}));
      setParentSigByMeeting((prev) => ({...prev, [meeting.id]: null}));
      setParentPadResetNonce((prev) => ({
        ...prev,
        [meeting.id]: (prev[meeting.id] || 0) + 1,
      }));
      setShowAnotherParentForm((prev) => ({...prev, [meeting.id]: false}));
      setStatusBanner(
        `已完成「${meeting.title}」家長簽到（${studentVal} · ${parentVal}）！感謝您的蒞臨。`,
      );
    } catch (err: any) {
      setDbError(err?.message || '送出家長簽到失敗，請再試一次。');
    } finally {
      setSubmittingParentMeetingId(null);
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

  const handleDeleteParentCheckin = async (rec: ParentCheckin) => {
    if (!isTeacherAdmin) return;
    setDbError(null);
    try {
      await deleteParentCheckinForAdmin(rec.id);
      setConfirmDeleteParentCheckinId(null);
      setStatusBanner(
        `已移除「${rec.studentClassAndSeat} · ${rec.parentName}」的家長簽到紀錄。`,
      );
    } catch (err: any) {
      setDbError(err?.message || '移除家長簽到紀錄失敗。');
    }
  };

  const handleCreateSession = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isTeacherAdmin) return;
    const startMs = parseDateTimeLocalValue(newCheckinStartLocal);
    const endMs = parseDateTimeLocalValue(newCheckinEndLocal);
    if (startMs !== null && endMs !== null && endMs <= startMs) {
      setDbError('簽名截止時間必須晚於開放開始時間。');
      return;
    }

    const audience = viewTrack === 'parent' ? 'parent' : 'teacher';
    setIsCreatingSession(true);
    setDbError(null);
    setStatusBanner(null);
    try {
      const createdId = await createMeetingSession({
        title: newTitle,
        meetingDate: newDate,
        academicYear: newYear,
        location: newLocation,
        agendaSummary: newAgenda,
        meetUrl: newMeetUrl,
        linkedPostSlug: audience === 'teacher' ? newLinkedSlug : '',
        audience,
        isOpen: newIsOpen,
        checkinStartAtMs: startMs,
        checkinEndAtMs: endMs,
      });
      setNewTitle('');
      setNewAgenda('');
      setNewMeetUrl('');
      setNewLinkedSlug('');
      setNewCheckinStartLocal('');
      setNewCheckinEndLocal('');
      setSessionFilter('all');
      setActiveTab('sessions');
      setExpandedQrMeetingId(createdId);
      if (audience === 'parent') {
        setStatusBanner(
          '已建立「學校日／家長免登入」場次，並已開啟專屬掃碼 QR Code 與直達網址。',
        );
      } else {
        setStatusBanner(
          '已成功建立教師社群會議場次，並已產生專屬掃碼 QR Code 與直達網址！',
        );
      }
    } catch (err: any) {
      setDbError(err?.message || '建立場次失敗。');
    } finally {
      setIsCreatingSession(false);
    }
  };

  const handleSaveMeetingSchedule = async (meeting: MeetingSession) => {
    if (!isTeacherAdmin) return;
    const startMs = parseDateTimeLocalValue(editStartLocal);
    const endMs = parseDateTimeLocalValue(editEndLocal);
    if (startMs !== null && endMs !== null && endMs <= startMs) {
      setDbError('簽名截止時間必須晚於開放開始時間。');
      return;
    }

    setIsSavingSchedule(true);
    setDbError(null);
    try {
      await updateMeetingSession(
        meeting.id,
        {
          isOpen: true,
          checkinStartAtMs: startMs,
          checkinEndAtMs: endMs,
        },
        meeting.audience,
      );
      setEditingScheduleMeetingId(null);
      setStatusBanner(
        startMs !== null || endMs !== null
          ? `已更新「${meeting.title}」的開放簽名時段。`
          : `已將「${meeting.title}」設為不限時段開放簽名。`,
      );
    } catch (err: any) {
      setDbError(err?.message || '更新開放簽名時間失敗。');
    } finally {
      setIsSavingSchedule(false);
    }
  };

  const handleToggleMeetingOpen = async (meeting: MeetingSession) => {
    if (!isTeacherAdmin) return;
    setDbError(null);
    try {
      await updateMeetingSession(
        meeting.id,
        {isOpen: !meeting.isOpen},
        meeting.audience,
      );
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
      await deleteMeetingSession(meeting.id, meeting.audience);
      setConfirmDeleteMeetingId(null);
      setStatusBanner(
        `已刪除場次「${meeting.title}」並同步清除所有相關簽到與簽名紀錄。`,
      );
    } catch (err: any) {
      setDbError(err?.message || '刪除場次失敗。');
    } finally {
      setDeletingMeetingId(null);
    }
  };

  const handleCopyDirectLink = async (
    audience: 'parent' | 'teacher',
    meetingId: string,
  ) => {
    const directUrl = buildDirectCheckinUrl(audience, meetingId);
    try {
      await navigator.clipboard.writeText(directUrl);
      setCopiedLinkMeetingId(meetingId);
      setStatusBanner(
        audience === 'parent'
          ? '已複製「家長免登入簽到直達網址」，可直接貼到班級通知或 LINE 群組！'
          : '已複製「教師會議簽到直達網址」，可貼給與會教師或搭配 QR Code 投影！',
      );
      window.setTimeout(() => {
        setCopiedLinkMeetingId((curr) => (curr === meetingId ? null : curr));
      }, 2500);
    } catch {
      setStatusBanner(`簽到直達網址：${directUrl}`);
    }
  };

  const handleDownloadQrPng = (meeting: MeetingSession) => {
    const cacheKey = `${meeting.audience}:${meeting.id}`;
    const dataUrl = qrDataUrlByMeeting[cacheKey];
    if (!dataUrl) return;
    const safeFile = meeting.title.replace(/[\\/:*?"<>|]/g, '_').slice(0, 40);
    const prefix =
      meeting.audience === 'parent' ? '家長簽到QRCode' : '教師會議簽到QRCode';
    const a = document.createElement('a');
    a.href = dataUrl;
    a.download = `${prefix}_${safeFile}.png`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const handleExportCsv = (
    meeting: MeetingSession,
    teacherCheckins: MeetingCheckin[],
    parentCheckins: ParentCheckin[],
  ) => {
    const csv = buildMeetingCheckinsCsv(meeting, teacherCheckins, parentCheckins);
    const count =
      meeting.audience === 'parent'
        ? parentCheckins.length
        : teacherCheckins.length;
    const blob = new Blob([csv], {type: 'text/csv;charset=utf-8;'});
    const safeFile = meeting.title.replace(/[\\/:*?"<>|]/g, '_').slice(0, 40);
    const prefix =
      meeting.audience === 'parent' ? '學校日家長簽到名冊' : '會議簽到名冊';
    triggerSafeBlobDownload(blob, `${prefix}_${safeFile}.csv`);
    setStatusBanner(`已匯出「${meeting.title}」簽到名冊 CSV (${count} 筆)。`);
  };

  const handleOpenPrintablePreview = (
    meeting: MeetingSession,
    teacherCheckins: MeetingCheckin[],
    parentCheckins: ParentCheckin[],
  ) => {
    if (readyPdfDownload?.url) {
      URL.revokeObjectURL(readyPdfDownload.url);
    }
    setReadyPdfDownload(null);
    setPdfNotice(null);
    setPreviewRoster({meeting, teacherCheckins, parentCheckins});
  };

  const handleDownloadRealPdf = async () => {
    if (!previewRoster) return;
    setIsGeneratingPdf(true);
    setPdfNotice(null);
    try {
      const pdfBlob = await generateMeetingAttendancePdfBlob(
        previewRoster.meeting,
        previewRoster.teacherCheckins,
        previewRoster.parentCheckins,
      );
      const safeFile = previewRoster.meeting.title
        .replace(/[\\/:*?"<>|]/g, '_')
        .slice(0, 40);
      const prefix =
        previewRoster.meeting.audience === 'parent'
          ? '家長簽到表_含親筆簽名'
          : '會議簽到表_含親筆簽名';
      const filename = `${prefix}_${safeFile}.pdf`;
      const downloadUrl = URL.createObjectURL(pdfBlob);
      if (readyPdfDownload?.url) {
        URL.revokeObjectURL(readyPdfDownload.url);
      }
      setReadyPdfDownload({url: downloadUrl, filename});

      const a = document.createElement('a');
      a.href = downloadUrl;
      a.download = filename;
      a.rel = 'noopener noreferrer';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);

      const count =
        previewRoster.meeting.audience === 'parent'
          ? previewRoster.parentCheckins.length
          : previewRoster.teacherCheckins.length;
      setPdfNotice(
        `已產生 PDF 檔案（${count} 筆簽名）；若未自動儲存，可點擊右側「手動下載 PDF」。`,
      );
    } catch (err: any) {
      setPdfNotice(
        err?.message ||
          '產生 PDF 失敗，請改用「系統列印 / 另存 PDF」或「下載 HTML」。',
      );
    } finally {
      setIsGeneratingPdf(false);
    }
  };

  const handleNativePrintSheet = () => {
    if (!previewRoster) return;
    document.body.classList.add('printing-attendance-sheet');
    const cleanup = () => {
      document.body.classList.remove('printing-attendance-sheet');
      window.removeEventListener('afterprint', cleanup);
    };
    window.addEventListener('afterprint', cleanup);
    try {
      window.print();
      setPdfNotice(
        '已送出系統列印請求；若預覽視窗受瀏覽器限制未彈出，請點左側「直接下載 PDF 檔」。',
      );
    } catch {
      cleanup();
      setPdfNotice(
        '此瀏覽環境不支援直接呼叫系統列印，請點左側「直接下載 PDF 檔」。',
      );
    }
    window.setTimeout(cleanup, 3000);
  };

  const handleDownloadOfflineHtml = () => {
    if (!previewRoster) return;
    const html = buildPrintableMeetingSheetHtml(
      previewRoster.meeting,
      previewRoster.teacherCheckins,
      previewRoster.parentCheckins,
    );
    const blob = new Blob([html], {type: 'text/html;charset=utf-8;'});
    const safeFile = previewRoster.meeting.title
      .replace(/[\\/:*?"<>|]/g, '_')
      .slice(0, 40);
    triggerSafeBlobDownload(blob, `簽到表_含親筆簽名_${safeFile}.html`);
    setPdfNotice('已送出離線可列印 HTML 檔案下載。');
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

  const renderParentCheckinForm = (
    meeting: MeetingSession,
    allowInlineClose = true,
  ) => {
    const windowState = getMeetingCheckinWindowState(meeting, nowMs);
    const isCurrentlySignable = windowState.status === 'open';
    const receiptsForThis = parentReceiptsByMeeting.get(meeting.id) || [];
    const hasDeviceReceipt = receiptsForThis.length > 0;
    const wantsForm =
      !hasDeviceReceipt || Boolean(showAnotherParentForm[meeting.id]);
    const isExpanded =
      expandedParentMeetingId === meeting.id ||
      !allowInlineClose ||
      orderedParentMeetings.length === 1;
    const currentSig = parentSigByMeeting[meeting.id] || null;
    const isSigReady = isValidSignatureDataUrl(currentSig);
    const studentVal = parentStudentByMeeting[meeting.id] || '';
    const parentVal = parentNameByMeeting[meeting.id] || '';
    const relationVal = parentRelationByMeeting[meeting.id] || '';

    return (
      <article
        key={meeting.id}
        className={`bg-white border rounded-2xl p-4 sm:p-5 space-y-4 transition-all ${
          initialMeetingId === meeting.id
            ? 'border-emerald-700 ring-2 ring-emerald-700/15 shadow-sm'
            : 'border-stone-200'
        }`}
      >
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
          <div className="space-y-1.5 min-w-0">
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span className="px-2 py-0.5 rounded-md font-semibold bg-emerald-50 text-emerald-800 border border-emerald-200">
                學校日 / 家長免登入
              </span>
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
            </div>

            <h3 className="font-editorial text-lg sm:text-xl font-bold text-stone-950 break-words">
              {meeting.title}
            </h3>

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
                      : '結束前皆可'}
                  </span>
                </span>
              )}
            </div>
          </div>

          {allowInlineClose && orderedParentMeetings.length > 1 && (
            <button
              type="button"
              onClick={() =>
                setExpandedParentMeetingId(isExpanded ? null : meeting.id)
              }
              className="px-3 py-1.5 text-xs font-semibold text-emerald-900 bg-emerald-50 border border-emerald-200 rounded-lg hover:bg-emerald-100 shrink-0 self-start"
            >
              {isExpanded ? '收合簽到表' : '點此填寫簽到'}
            </button>
          )}
        </div>

        {meeting.agendaSummary && (
          <p className="text-xs sm:text-sm text-stone-700 leading-relaxed whitespace-pre-line bg-[#FBF9F5] border border-stone-200/80 rounded-xl p-3.5">
            {meeting.agendaSummary}
          </p>
        )}

        {/* Local confirmation receipt(s) saved on this parent's device */}
        {hasDeviceReceipt && (
          <div className="space-y-2">
            {receiptsForThis.map((rec) => (
              <div
                key={rec.id}
                className="bg-emerald-50/75 border border-emerald-200 rounded-xl p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
              >
                <div className="space-y-1 min-w-0">
                  <div className="flex items-center gap-1.5 text-xs sm:text-sm font-bold text-emerald-900">
                    <CheckCircle2 className="w-4 h-4 text-emerald-700 shrink-0" />
                    <span>本裝置已完成家長簽到！</span>
                  </div>
                  <div className="text-xs text-stone-800">
                    學生：<strong>{rec.studentClassAndSeat}</strong> · 家長：
                    <strong>{rec.parentName}</strong>
                    {rec.relationshipOrNote
                      ? `（${rec.relationshipOrNote}）`
                      : ''}
                  </div>
                  <div className="text-[11px] font-mono-tabular text-stone-600">
                    簽到時間：{formatDateTime(rec.checkedInAtMs)}
                  </div>
                </div>
                {isValidSignatureDataUrl(rec.signatureDataUrl) && (
                  <div className="shrink-0 bg-white border border-emerald-200/80 rounded-lg px-2.5 py-1 self-start sm:self-center">
                    <img
                      src={rec.signatureDataUrl}
                      alt={`${rec.parentName}親筆簽名`}
                      className="h-11 w-28 object-contain"
                    />
                  </div>
                )}
              </div>
            ))}

            {isCurrentlySignable && !wantsForm && (
              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={() =>
                    setShowAnotherParentForm((prev) => ({
                      ...prev,
                      [meeting.id]: true,
                    }))
                  }
                  className="px-3.5 py-2 text-xs font-semibold text-[#1E3A8A] bg-[#FBF9F5] border border-[#1E3A8A]/30 rounded-lg hover:bg-white inline-flex items-center gap-1.5"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>再為另一位學生／家長簽到</span>
                </button>
              </div>
            )}
          </div>
        )}

        {/* Login-free simple Parent Form */}
        {isExpanded &&
          (isCurrentlySignable ? (
            wantsForm && (
              <div className="bg-[#FBF9F5] border border-emerald-700/25 rounded-xl p-4 sm:p-5 space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                  <div className="space-y-1">
                    <label
                      htmlFor={`parent-student-${meeting.id}`}
                      className="block text-xs font-semibold text-stone-800"
                    >
                      學生班級座號或姓名 *
                    </label>
                    <input
                      id={`parent-student-${meeting.id}`}
                      type="text"
                      maxLength={80}
                      value={studentVal}
                      onChange={(e) =>
                        setParentStudentByMeeting((prev) => ({
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
                      htmlFor={`parent-name-${meeting.id}`}
                      className="block text-xs font-semibold text-stone-800"
                    >
                      家長姓名或稱謂 *
                    </label>
                    <input
                      id={`parent-name-${meeting.id}`}
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
                      htmlFor={`parent-relation-${meeting.id}`}
                      className="block text-xs font-medium text-stone-700"
                    >
                      與學生關係 / 想給老師的備註（選填）
                    </label>
                    <div className="flex flex-wrap items-center gap-1.5">
                      {PARENT_RELATION_PRESETS.map((preset) => (
                        <button
                          key={preset}
                          type="button"
                          onClick={() =>
                            setParentRelationByMeeting((prev) => ({
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
                    id={`parent-relation-${meeting.id}`}
                    type="text"
                    maxLength={120}
                    value={relationVal}
                    onChange={(e) =>
                      setParentRelationByMeeting((prev) => ({
                        ...prev,
                        [meeting.id]: e.target.value,
                      }))
                    }
                    placeholder="選填，例如：媽媽、希望了解暑期學習資源"
                    className="w-full h-10 px-3.5 text-xs sm:text-sm bg-white border border-stone-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-700"
                  />
                </div>

                <SignaturePad
                  key={`${meeting.id}-${parentPadResetNonce[meeting.id] || 0}`}
                  signerLabel={parentVal.trim() || '家長親筆簽名'}
                  disabled={submittingParentMeetingId === meeting.id}
                  onChange={(dataUrl) =>
                    setParentSigByMeeting((prev) => ({
                      ...prev,
                      [meeting.id]: dataUrl,
                    }))
                  }
                />

                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 pt-1">
                  <span className="text-xs text-stone-600">
                    {isSigReady ? (
                      <span className="text-emerald-800 font-semibold">
                        ✓ 已完成手寫簽名，點擊右側按鈕即可送出。
                      </span>
                    ) : (
                      <span>{windowState.detailText}（免登入 Google 帳號）</span>
                    )}
                  </span>

                  <div className="flex items-center gap-2 shrink-0">
                    {hasDeviceReceipt && (
                      <button
                        type="button"
                        onClick={() =>
                          setShowAnotherParentForm((prev) => ({
                            ...prev,
                            [meeting.id]: false,
                          }))
                        }
                        className="px-3 py-2 text-xs font-medium text-stone-600 bg-white border border-stone-300 rounded-xl hover:bg-stone-50"
                      >
                        取消
                      </button>
                    )}
                    <button
                      type="button"
                      disabled={
                        submittingParentMeetingId === meeting.id ||
                        !studentVal.trim() ||
                        !parentVal.trim() ||
                        !isSigReady
                      }
                      onClick={() => handleParentCheckinSubmit(meeting)}
                      className="w-full sm:w-auto min-h-[44px] px-5 py-2.5 text-sm font-semibold text-white bg-emerald-700 hover:bg-emerald-800 disabled:opacity-45 rounded-xl inline-flex items-center justify-center gap-2 transition-colors whitespace-nowrap"
                    >
                      <ClipboardCheck className="w-4 h-4" />
                      <span>
                        {submittingParentMeetingId === meeting.id
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
              className={`flex items-center gap-2 text-xs px-3.5 py-2.5 rounded-xl border ${
                windowState.status === 'not-started'
                  ? 'bg-amber-50 border-amber-200 text-amber-900 font-medium'
                  : 'bg-stone-50 border-stone-200 text-stone-600'
              }`}
            >
              <Clock className="w-3.5 h-3.5 shrink-0" />
              <span>{windowState.detailText}</span>
            </div>
          ))}
      </article>
    );
  };

  const renderAdminScheduleAndDeleteControls = (meeting: MeetingSession) => {
    const isEditingSchedule = editingScheduleMeetingId === meeting.id;
    return (
      <>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => {
              if (isEditingSchedule) {
                setEditingScheduleMeetingId(null);
              } else {
                setEditingScheduleMeetingId(meeting.id);
                setEditStartLocal(
                  toDateTimeLocalValue(meeting.checkinStartAtMs),
                );
                setEditEndLocal(toDateTimeLocalValue(meeting.checkinEndAtMs));
              }
            }}
            className={`px-3 py-1.5 text-xs font-medium border rounded-lg inline-flex items-center gap-1.5 ${
              isEditingSchedule
                ? 'bg-[#1E3A8A]/10 text-[#1E3A8A] border-[#1E3A8A]/40 font-semibold'
                : 'bg-white text-stone-700 border-stone-300 hover:bg-stone-50'
            }`}
          >
            <Clock className="w-3.5 h-3.5 text-[#1E3A8A]" />
            <span>設定開放簽名時間</span>
          </button>

          <button
            type="button"
            onClick={() => handleToggleMeetingOpen(meeting)}
            className="px-3 py-1.5 text-xs font-medium text-stone-700 bg-white border border-stone-300 rounded-lg hover:bg-stone-50"
          >
            {meeting.isOpen ? '關閉簽到' : '重新開放簽到'}
          </button>

          {confirmDeleteMeetingId === meeting.id ? (
            <div className="inline-flex items-center gap-1.5">
              <button
                type="button"
                disabled={deletingMeetingId === meeting.id}
                onClick={() => handleDeleteMeeting(meeting)}
                className="px-2.5 py-1.5 text-xs font-semibold text-white bg-red-600 hover:bg-red-700 rounded-lg"
              >
                確認刪除（含簽名紀錄）
              </button>
              <button
                type="button"
                onClick={() => setConfirmDeleteMeetingId(null)}
                className="px-2.5 py-1.5 text-xs text-stone-600 bg-stone-100 rounded-lg"
              >
                取消
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setConfirmDeleteMeetingId(meeting.id)}
              className="p-1.5 text-stone-500 hover:text-red-700 rounded-lg hover:bg-red-50 transition-colors"
              aria-label={`刪除 ${meeting.title}`}
            >
              <Trash2 className="w-4 h-4" />
            </button>
          )}
        </div>
      </>
    );
  };

  const renderAdminScheduleEditor = (meeting: MeetingSession) => {
    if (editingScheduleMeetingId !== meeting.id) return null;
    return (
      <div className="bg-[#FBF9F5] border border-[#1E3A8A]/25 rounded-xl p-4 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-xs font-semibold text-[#1E3A8A] inline-flex items-center gap-1.5">
            <Clock className="w-3.5 h-3.5" />
            <span>調整「{meeting.title}」開放簽名時段</span>
          </span>
          <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
            <button
              type="button"
              onClick={() => {
                const start = Date.now();
                setEditStartLocal(toDateTimeLocalValue(start));
                setEditEndLocal(
                  toDateTimeLocalValue(start + 2 * 60 * 60 * 1000),
                );
              }}
              className="px-2 py-1 bg-white border border-stone-300 rounded-md hover:border-[#1E3A8A] hover:text-[#1E3A8A]"
            >
              立即起開放 2 小時
            </button>
            <button
              type="button"
              onClick={() => {
                setEditStartLocal('');
                setEditEndLocal('');
              }}
              className="px-2 py-1 bg-white border border-stone-300 rounded-md hover:border-stone-400 text-stone-600"
            >
              清除時限（改為不限時）
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 min-w-0">
          <div className="space-y-1 min-w-0 max-w-full overflow-hidden">
            <label className="block text-[11px] font-medium text-stone-700">
              開放簽名開始時間（留白＝立即開放）
            </label>
            <input
              type="datetime-local"
              value={editStartLocal}
              onChange={(e) => setEditStartLocal(e.target.value)}
              className="w-full min-w-0 max-w-full block h-9 px-3 text-xs font-mono-tabular bg-white border border-stone-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1E3A8A]"
            />
          </div>
          <div className="space-y-1 min-w-0 max-w-full overflow-hidden">
            <label className="block text-[11px] font-medium text-stone-700">
              簽名截止時間（留白＝手動關閉前皆可簽）
            </label>
            <input
              type="datetime-local"
              value={editEndLocal}
              onChange={(e) => setEditEndLocal(e.target.value)}
              className="w-full min-w-0 max-w-full block h-9 px-3 text-xs font-mono-tabular bg-white border border-stone-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1E3A8A]"
            />
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-end gap-2">
          <button
            type="button"
            onClick={() => setEditingScheduleMeetingId(null)}
            className="px-3 py-1.5 text-xs font-medium text-stone-600 bg-white border border-stone-300 rounded-lg hover:bg-stone-100"
          >
            取消
          </button>
          <button
            type="button"
            disabled={isSavingSchedule}
            onClick={() => handleSaveMeetingSchedule(meeting)}
            className="px-4 py-1.5 text-xs font-semibold text-white bg-[#1E3A8A] rounded-lg hover:bg-[#172554] disabled:opacity-60"
          >
            {isSavingSchedule ? '儲存中...' : '儲存簽名時間設定'}
          </button>
        </div>
      </div>
    );
  };

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
        {/* Top Header strictly scoped to current viewTrack */}
        <header className="px-4 sm:px-6 py-4 bg-white border-b border-stone-200 flex items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div
              className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                viewTrack === 'parent'
                  ? 'bg-emerald-50 text-emerald-800'
                  : 'bg-[#1E3A8A]/10 text-[#1E3A8A]'
              }`}
            >
              {viewTrack === 'parent' ? (
                <UserCheck className="w-5 h-5" />
              ) : (
                <CalendarCheck className="w-5 h-5" />
              )}
            </div>
            <div className="min-w-0">
              <p
                className={`text-[11px] font-mono-tabular uppercase tracking-wider font-semibold ${
                  viewTrack === 'parent' ? 'text-emerald-800' : 'text-[#1E3A8A]'
                }`}
              >
                {viewTrack === 'parent'
                  ? 'HMES SCHOOL DAY PARENT CHECK-IN'
                  : 'HMES MATH COMMUNITY CHECK-IN'}
              </p>
              <h2
                id="meeting-checkin-modal-title"
                className="font-editorial text-lg sm:text-xl font-bold text-stone-950 truncate"
              >
                {viewTrack === 'parent'
                  ? '學校日／親師活動家長簽到系統'
                  : '教師社群會議簽到與親筆簽名系統'}
              </h2>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="關閉簽到視窗"
            className="p-2 text-stone-500 hover:text-stone-900 rounded-lg hover:bg-stone-100 transition-colors shrink-0"
          >
            <X className="w-5 h-5" />
          </button>
        </header>

        {/* Body */}
        <div className="flex-1 overflow-y-auto overflow-x-hidden p-4 sm:p-6 space-y-5">
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

          {/* ==================== TRACK 1: SCHOOL DAY PARENT CHECK-IN ==================== */}
          {viewTrack === 'parent' ? (
            !isTeacherAdmin ? (
              /* Pure Login-Free Parent View (even if a non-admin teacher opens Parent Check-in, they see ONLY the parent check-in experience) */
              <div className="space-y-4">
                <div className="bg-white border border-emerald-200/80 rounded-xl p-4 text-xs sm:text-sm text-stone-700 leading-relaxed flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div>
                    <strong className="text-emerald-900">
                      家長免登入快速簽到：
                    </strong>
                    無需註冊或登入帳號，填寫學生班級座號／姓名與家長稱謂並親筆簽名即可完成。
                  </div>
                  <span className="px-2.5 py-1 rounded-md text-xs font-mono-tabular font-semibold bg-emerald-50 text-emerald-800 border border-emerald-200 shrink-0 self-start sm:self-center">
                    {openParentMeetingsCount > 0
                      ? `${openParentMeetingsCount} 場開放中`
                      : `${parentMeetings.length} 場活動`}
                  </span>
                </div>

                {isLoadingMeetings ? (
                  <div className="bg-white border border-stone-200 rounded-2xl p-8 text-center text-sm text-stone-500">
                    正在載入學校日與家長活動場次...
                  </div>
                ) : orderedParentMeetings.length === 0 ? (
                  <div className="bg-white border border-stone-200 rounded-2xl p-8 text-center space-y-3">
                    <UserCheck className="w-8 h-8 text-stone-400 mx-auto" />
                    <h3 className="font-editorial text-lg font-semibold text-stone-900">
                      目前尚未開放學校日／家長簽到場次
                    </h3>
                    <p className="text-xs sm:text-sm text-stone-600 max-w-md mx-auto">
                      目前無進行中的學校日活動，請稍後再試或向班級導師確認簽到 QR Code。
                    </p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {orderedParentMeetings.map((meeting) =>
                      renderParentCheckinForm(meeting, true),
                    )}
                  </div>
                )}
              </div>
            ) : (
              /* Admin-only Parent Session Management View (isolated completely from Teacher Meetings) */
              <div className="space-y-5">
                <section className="bg-white border border-emerald-200 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="space-y-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2 text-xs">
                      <span className="font-semibold text-emerald-900">
                        管理教師模式 · 學校日家長場次專區（與教師社群資料完全隔離）
                      </span>
                    </div>
                    <div className="text-sm font-medium text-stone-900 truncate">
                      {user?.displayName || '管理教師'}{' '}
                      <span className="font-mono-tabular text-xs text-stone-500">
                        ({user?.email})
                      </span>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => switchAdminTrack('teacher')}
                      className="min-h-[38px] px-3 py-1.5 text-xs font-semibold text-[#1E3A8A] bg-[#1E3A8A]/8 border border-[#1E3A8A]/25 hover:bg-[#1E3A8A] hover:text-white rounded-lg inline-flex items-center gap-1.5 transition-colors whitespace-nowrap"
                    >
                      <CalendarCheck className="w-3.5 h-3.5" />
                      <span>切換至：教師會議管理</span>
                    </button>
                    <button
                      type="button"
                      onClick={onSignOut}
                      className="min-h-[38px] px-3 py-1.5 text-xs font-medium text-stone-700 bg-white border border-stone-300 hover:bg-stone-50 rounded-lg inline-flex items-center gap-1.5 whitespace-nowrap"
                    >
                      <LogOut className="w-3.5 h-3.5" />
                      <span>登出</span>
                    </button>
                  </div>
                </section>

                <div className="space-y-3">
                  <div
                    role="tablist"
                    aria-label="家長簽到管理頁籤"
                    className="grid grid-cols-1 sm:grid-cols-2 gap-2"
                  >
                    <button
                      type="button"
                      role="tab"
                      aria-selected={activeTab === 'sessions'}
                      onClick={() => setActiveTab('sessions')}
                      className={`px-4 py-3 rounded-xl border-2 text-left transition-all flex items-center justify-between gap-2 ${
                        activeTab === 'sessions'
                          ? 'bg-emerald-800 text-white border-emerald-800 shadow-sm'
                          : 'bg-white text-stone-700 border-stone-200 hover:border-emerald-700/45 hover:text-emerald-900'
                      }`}
                    >
                      <span className="inline-flex items-center gap-2 min-w-0">
                        <UserCheck className="w-4 h-4 shrink-0" />
                        <span className="text-xs sm:text-sm font-bold truncate">
                          學校日家長場次與名冊
                        </span>
                      </span>
                      <span
                        className={`px-2 py-0.5 text-[11px] font-mono-tabular font-semibold rounded-md shrink-0 ${
                          activeTab === 'sessions'
                            ? 'bg-white/20 text-white'
                            : 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                        }`}
                      >
                        {openParentMeetingsCount > 0
                          ? `${openParentMeetingsCount} 場開放`
                          : `${parentMeetings.length} 場`}
                      </span>
                    </button>

                    <button
                      type="button"
                      role="tab"
                      aria-selected={activeTab === 'admin'}
                      onClick={() => setActiveTab('admin')}
                      className={`px-4 py-3 rounded-xl border-2 text-left transition-all flex items-center justify-between gap-2 ${
                        activeTab === 'admin'
                          ? 'bg-emerald-800 text-white border-emerald-800 shadow-sm'
                          : 'bg-white text-stone-700 border-stone-200 hover:border-emerald-700/45 hover:text-emerald-900'
                      }`}
                    >
                      <span className="inline-flex items-center gap-2 min-w-0">
                        <Plus className="w-4 h-4 shrink-0" />
                        <span className="text-xs sm:text-sm font-bold truncate">
                          建立新學校日家長場次
                        </span>
                      </span>
                      <span
                        className={`px-2 py-0.5 text-[11px] font-semibold rounded-md shrink-0 ${
                          activeTab === 'admin'
                            ? 'bg-white/20 text-white'
                            : 'bg-emerald-50 text-emerald-800'
                        }`}
                      >
                        免登入 QR
                      </span>
                    </button>
                  </div>

                  {activeTab === 'sessions' && parentMeetings.length > 0 && (
                    <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                      <span className="text-stone-600">
                        此區僅管理「學校日／家長免登入」場次與家長簽到名冊（教師無法看見此區內容）。
                      </span>
                      <div className="flex flex-wrap items-center gap-1.5">
                        {(
                          [
                            {
                              id: 'all',
                              label: `全部 (${parentMeetings.length})`,
                            },
                            {
                              id: 'open',
                              label: `開放中 (${openParentMeetingsCount})`,
                            },
                          ] as const
                        ).map((f) => (
                          <button
                            key={f.id}
                            type="button"
                            onClick={() => setSessionFilter(f.id)}
                            className={`px-2.5 py-1 rounded-md border transition-colors ${
                              sessionFilter === f.id
                                ? 'bg-emerald-800 text-white border-emerald-800'
                                : 'bg-white text-stone-600 border-stone-200 hover:bg-stone-50'
                            }`}
                          >
                            {f.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {activeTab === 'sessions' &&
                  (isLoadingMeetings ? (
                    <div className="bg-white border border-stone-200 rounded-xl p-8 text-center text-sm text-stone-500">
                      正在載入學校日家長場次...
                    </div>
                  ) : orderedParentMeetings.length === 0 ? (
                    <div className="bg-white border border-stone-200 rounded-xl p-8 text-center space-y-3">
                      <UserCheck className="w-8 h-8 text-stone-400 mx-auto" />
                      <h3 className="font-editorial text-lg font-semibold text-stone-900">
                        尚未建立學校日家長簽到場次
                      </h3>
                      <p className="text-xs sm:text-sm text-stone-600 max-w-md mx-auto">
                        點擊上方「建立新學校日家長場次」即可快速發布免登入家長簽到與現場掃碼 QR Code。
                      </p>
                      <button
                        type="button"
                        onClick={() => setActiveTab('admin')}
                        className="px-4 py-2 text-xs font-semibold text-white bg-emerald-800 rounded-lg hover:bg-emerald-900 inline-flex items-center gap-1.5"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        <span>立即建立學校日場次</span>
                      </button>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {orderedParentMeetings.map((meeting) => {
                        const windowState = getMeetingCheckinWindowState(
                          meeting,
                          nowMs,
                        );
                        const adminParentRoster =
                          parentCheckinsByMeetingIdForAdmin.get(meeting.id) || [];
                        const isRosterExpanded =
                          expandedRosterMeetingId === meeting.id;
                        const isQrExpanded = expandedQrMeetingId === meeting.id;
                        const isParentFormPreviewOpen =
                          expandedParentMeetingId === meeting.id;

                        return (
                          <article
                            key={meeting.id}
                            className="bg-white border border-stone-200 rounded-xl p-4 sm:p-5 space-y-4"
                          >
                            <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                              <div className="space-y-1.5 min-w-0">
                                <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
                                  <span className="px-2 py-0.5 rounded-md font-semibold border bg-emerald-50 text-emerald-800 border-emerald-200">
                                    學校日・家長免登入
                                  </span>
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
                                  <span
                                    aria-hidden="true"
                                    className="text-stone-300"
                                  >
                                    ·
                                  </span>
                                  <span className="font-mono-tabular font-medium text-emerald-900">
                                    {meeting.academicYear}
                                  </span>
                                  <span
                                    aria-hidden="true"
                                    className="text-stone-300"
                                  >
                                    ·
                                  </span>
                                  <span className="font-mono-tabular text-stone-600">
                                    {meeting.meetingDate}
                                  </span>
                                </div>

                                <h3 className="font-editorial text-lg font-bold text-stone-950 break-words">
                                  {meeting.title}
                                </h3>

                                {(meeting.checkinStartAtMs !== null ||
                                  meeting.checkinEndAtMs !== null) && (
                                  <div className="inline-flex flex-wrap items-center gap-1.5 text-xs text-emerald-900 bg-emerald-50 border border-emerald-200 rounded-md px-2.5 py-1">
                                    <Clock className="w-3.5 h-3.5 shrink-0" />
                                    <span>
                                      開放簽名時段：
                                      {meeting.checkinStartAtMs !== null
                                        ? formatDateTime(
                                            meeting.checkinStartAtMs,
                                          )
                                        : '立即開放'}
                                      {' ～ '}
                                      {meeting.checkinEndAtMs !== null
                                        ? formatDateTime(meeting.checkinEndAtMs)
                                        : '不限截止'}
                                    </span>
                                  </div>
                                )}

                                {meeting.location && (
                                  <div className="flex items-center gap-1.5 text-xs text-stone-600">
                                    <MapPin className="w-3.5 h-3.5 text-stone-400 shrink-0" />
                                    <span>{meeting.location}</span>
                                  </div>
                                )}
                              </div>

                              {meeting.meetUrl && (
                                <a
                                  href={meeting.meetUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="px-3 py-1.5 text-xs font-medium text-stone-800 bg-white border border-stone-300 rounded-lg hover:bg-stone-50 inline-flex items-center gap-1.5 shrink-0 self-start"
                                >
                                  <Video className="w-3.5 h-3.5 text-emerald-800" />
                                  <span>活動簡報 / 連結</span>
                                  <ExternalLink className="w-3 h-3" />
                                </a>
                              )}
                            </div>

                            {meeting.agendaSummary && (
                              <p className="text-xs sm:text-sm text-stone-700 leading-relaxed whitespace-pre-line bg-[#FBF9F5] border border-stone-200/80 rounded-lg p-3.5">
                                {meeting.agendaSummary}
                              </p>
                            )}

                            {/* Field-assist preview toggle */}
                            <div className="pt-3 border-t border-stone-100 space-y-3">
                              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                                <span className="text-xs text-stone-600">
                                  教室現場平板可展開表單協助未帶手機之家長完成簽到。
                                </span>
                                <button
                                  type="button"
                                  onClick={() =>
                                    setExpandedParentMeetingId(
                                      isParentFormPreviewOpen
                                        ? null
                                        : meeting.id,
                                    )
                                  }
                                  className="px-3 py-1.5 text-xs font-semibold text-emerald-900 bg-emerald-50 border border-emerald-200 rounded-lg hover:bg-emerald-100 inline-flex items-center gap-1.5 self-start sm:self-center shrink-0"
                                >
                                  <PenTool className="w-3.5 h-3.5" />
                                  <span>
                                    {isParentFormPreviewOpen
                                      ? '收合現場代填表單'
                                      : '展開現場代填表單'}
                                  </span>
                                </button>
                              </div>

                              {isParentFormPreviewOpen &&
                                renderParentCheckinForm(meeting, false)}
                            </div>

                            {/* Admin Controls for Parent Session */}
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
                                    <Users className="w-3.5 h-3.5 text-emerald-800" />
                                    <span>
                                      {isRosterExpanded
                                        ? '收合家長名冊'
                                        : '檢視家長名冊'}{' '}
                                      ({adminParentRoster.length} 人)
                                    </span>
                                  </button>

                                  <button
                                    type="button"
                                    disabled={adminParentRoster.length === 0}
                                    onClick={() =>
                                      handleOpenPrintablePreview(
                                        meeting,
                                        [],
                                        adminParentRoster,
                                      )
                                    }
                                    className="px-3 py-1.5 text-xs font-semibold text-white bg-emerald-800 rounded-lg hover:bg-emerald-900 disabled:opacity-40 inline-flex items-center gap-1.5"
                                  >
                                    <Printer className="w-3.5 h-3.5" />
                                    <span>預覽與印出簽名 PDF</span>
                                  </button>

                                  <button
                                    type="button"
                                    disabled={adminParentRoster.length === 0}
                                    onClick={() =>
                                      handleExportCsv(
                                        meeting,
                                        [],
                                        adminParentRoster,
                                      )
                                    }
                                    className="px-3 py-1.5 text-xs font-medium text-emerald-900 bg-white border border-emerald-700/30 rounded-lg hover:bg-emerald-50 disabled:opacity-40 inline-flex items-center gap-1.5"
                                  >
                                    <Download className="w-3.5 h-3.5" />
                                    <span>匯出 CSV</span>
                                  </button>

                                  <button
                                    type="button"
                                    onClick={() =>
                                      setExpandedQrMeetingId(
                                        isQrExpanded ? null : meeting.id,
                                      )
                                    }
                                    className={`px-3 py-1.5 text-xs font-semibold border rounded-lg inline-flex items-center gap-1.5 ${
                                      isQrExpanded
                                        ? 'bg-[#1E3A8A] text-white border-[#1E3A8A]'
                                        : 'bg-[#1E3A8A]/8 text-[#1E3A8A] border-[#1E3A8A]/25 hover:bg-[#1E3A8A]/15'
                                    }`}
                                  >
                                    <QrCode className="w-3.5 h-3.5" />
                                    <span>家長掃碼 QR / 網址</span>
                                  </button>
                                </div>

                                {renderAdminScheduleAndDeleteControls(meeting)}
                              </div>

                              {isQrExpanded && (
                                <div className="bg-emerald-50/50 border border-emerald-200 rounded-xl p-4 flex flex-col sm:flex-row items-center gap-4">
                                  <div className="w-36 h-36 bg-white border border-emerald-200 rounded-xl p-2 flex items-center justify-center shrink-0">
                                    {qrDataUrlByMeeting[`parent:${meeting.id}`] ? (
                                      <img
                                        src={
                                          qrDataUrlByMeeting[
                                            `parent:${meeting.id}`
                                          ]
                                        }
                                        alt={`${meeting.title} 家長免登入簽到 QR Code`}
                                        className="w-full h-full object-contain"
                                      />
                                    ) : (
                                      <span className="text-[11px] text-stone-400">
                                        產生 QR Code 中...
                                      </span>
                                    )}
                                  </div>
                                  <div className="flex-1 min-w-0 space-y-2.5 text-xs">
                                    <div className="font-bold text-emerald-950 text-sm">
                                      學校日現場掃碼 · 家長免登入獨立簽到專頁
                                    </div>
                                    <p className="text-stone-700 leading-relaxed">
                                      家長用手機掃描此 QR Code 或點擊連結，將開啟獨立的學校日簽到專頁（不需進入數學知識庫網頁，也不需登入帳號），填寫學生班級姓名與親筆簽名即可完成。
                                    </p>
                                    <div className="font-mono-tabular text-[11px] bg-white border border-stone-200 rounded-lg px-2.5 py-1.5 text-stone-600 break-all">
                                      {buildDirectCheckinUrl('parent', meeting.id)}
                                    </div>
                                    <div className="flex flex-wrap items-center gap-2">
                                      <button
                                        type="button"
                                        onClick={() =>
                                          handleCopyDirectLink(
                                            'parent',
                                            meeting.id,
                                          )
                                        }
                                        className="px-3 py-1.5 text-xs font-semibold text-white bg-emerald-800 rounded-lg hover:bg-emerald-900 inline-flex items-center gap-1.5"
                                      >
                                        {copiedLinkMeetingId === meeting.id ? (
                                          <Check className="w-3.5 h-3.5" />
                                        ) : (
                                          <Copy className="w-3.5 h-3.5" />
                                        )}
                                        <span>
                                          {copiedLinkMeetingId === meeting.id
                                            ? '已複製直達連結'
                                            : '複製家長簽到網址'}
                                        </span>
                                      </button>
                                      <a
                                        href={buildDirectCheckinUrl(
                                          'parent',
                                          meeting.id,
                                        )}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="px-3 py-1.5 text-xs font-semibold text-emerald-950 bg-white border border-emerald-300 rounded-lg hover:bg-emerald-100/70 inline-flex items-center gap-1.5"
                                      >
                                        <ExternalLink className="w-3.5 h-3.5" />
                                        <span>開啟獨立家長簽到頁</span>
                                      </a>
                                      {qrDataUrlByMeeting[
                                        `parent:${meeting.id}`
                                      ] && (
                                        <button
                                          type="button"
                                          onClick={() =>
                                            handleDownloadQrPng(meeting)
                                          }
                                          className="px-3 py-1.5 text-xs font-medium text-emerald-950 bg-white border border-emerald-300 rounded-lg hover:bg-emerald-100/70 inline-flex items-center gap-1.5"
                                        >
                                          <Download className="w-3.5 h-3.5" />
                                          <span>下載 QR Code 圖檔</span>
                                        </button>
                                      )}
                                    </div>
                                  </div>
                                </div>
                              )}

                              {renderAdminScheduleEditor(meeting)}

                              {isRosterExpanded && (
                                <div className="bg-[#F7F4EE] border border-stone-200 rounded-xl overflow-hidden">
                                  {adminParentRoster.length === 0 ? (
                                    <div className="p-4 text-xs text-stone-500 text-center">
                                      目前尚無家長簽到此場次。
                                    </div>
                                  ) : (
                                    <div className="overflow-x-auto">
                                      <table className="w-full text-left border-collapse text-xs">
                                        <thead>
                                          <tr className="border-b border-stone-200 text-stone-600 bg-white/60">
                                            <th className="py-2.5 px-3 font-semibold">#</th>
                                            <th className="py-2.5 px-3 font-semibold">
                                              學生班級 / 姓名
                                            </th>
                                            <th className="py-2.5 px-3 font-semibold">
                                              家長姓名
                                            </th>
                                            <th className="py-2.5 px-3 font-semibold">
                                              關係 / 備註
                                            </th>
                                            <th className="py-2.5 px-3 font-semibold">
                                              親自手寫簽名
                                            </th>
                                            <th className="py-2.5 px-3 font-semibold">
                                              簽到時間
                                            </th>
                                            <th className="py-2.5 px-3 font-semibold text-right">
                                              管理
                                            </th>
                                          </tr>
                                        </thead>
                                        <tbody className="divide-y divide-stone-200/70">
                                          {adminParentRoster.map((rec, idx) => (
                                            <tr key={rec.id} className="bg-white/50">
                                              <td className="py-2 px-3 font-mono-tabular text-stone-500">
                                                {idx + 1}
                                              </td>
                                              <td className="py-2 px-3 font-semibold text-stone-900">
                                                {rec.studentClassAndSeat}
                                              </td>
                                              <td className="py-2 px-3 font-medium text-stone-900">
                                                {rec.parentName}
                                              </td>
                                              <td className="py-2 px-3 text-stone-700">
                                                {rec.relationshipOrNote || '—'}
                                              </td>
                                              <td className="py-2 px-3">
                                                {isValidSignatureDataUrl(
                                                  rec.signatureDataUrl,
                                                ) ? (
                                                  <div className="inline-flex bg-white border border-stone-200 rounded px-2 py-1">
                                                    <img
                                                      src={rec.signatureDataUrl}
                                                      alt={`${rec.parentName}親筆簽名`}
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
                                              <td className="py-2 px-3 text-right whitespace-nowrap">
                                                {confirmDeleteParentCheckinId ===
                                                rec.id ? (
                                                  <span className="inline-flex items-center gap-1.5">
                                                    <button
                                                      type="button"
                                                      onClick={() =>
                                                        handleDeleteParentCheckin(
                                                          rec,
                                                        )
                                                      }
                                                      className="text-red-700 font-semibold hover:underline"
                                                    >
                                                      確認移除
                                                    </button>
                                                    <button
                                                      type="button"
                                                      onClick={() =>
                                                        setConfirmDeleteParentCheckinId(
                                                          null,
                                                        )
                                                      }
                                                      className="text-stone-500 hover:underline"
                                                    >
                                                      取消
                                                    </button>
                                                  </span>
                                                ) : (
                                                  <button
                                                    type="button"
                                                    onClick={() =>
                                                      setConfirmDeleteParentCheckinId(
                                                        rec.id,
                                                      )
                                                    }
                                                    className="text-stone-400 hover:text-red-700"
                                                    aria-label={`移除 ${rec.parentName} 簽到紀錄`}
                                                  >
                                                    <Trash2 className="w-3.5 h-3.5" />
                                                  </button>
                                                )}
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
                          </article>
                        );
                      })}
                    </div>
                  ))}

                {activeTab === 'admin' && (
                  <form
                    onSubmit={handleCreateSession}
                    className="bg-white border border-stone-200 rounded-xl p-4 sm:p-6 space-y-4 min-w-0 max-w-full overflow-hidden"
                  >
                    <div className="border-b border-stone-100 pb-3 flex flex-wrap items-center justify-between gap-2 min-w-0">
                      <div className="min-w-0">
                        <h3 className="font-editorial text-base font-bold text-stone-950">
                          建立學校日／家長免登入簽到場次
                        </h3>
                        <p className="text-xs text-stone-500 mt-0.5">
                          發布後將自動產生 QR Code 與免登入直達連結（教師會議頁面不會顯示此場次）。
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          setNewTitle('114 學年度第 1 學期學校日家長簽到');
                          setNewLocation('西門國小各班教室 / 視聽教室');
                          setNewAgenda(
                            '歡迎各位家長蒞臨西門國小學校日！請填寫學生班級座號／姓名與家長稱謂並親筆簽名，無需登入帳號。',
                          );
                        }}
                        className="px-3 py-1.5 text-xs font-medium text-emerald-900 bg-emerald-50 border border-emerald-200 rounded-lg hover:bg-emerald-100"
                      >
                        帶入學校日預設範本
                      </button>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 min-w-0">
                      <div className="sm:col-span-2 min-w-0 space-y-1">
                        <label className="block text-xs font-medium text-stone-700">
                          活動 / 學校日名稱 *
                        </label>
                        <input
                          type="text"
                          required
                          maxLength={160}
                          value={newTitle}
                          onChange={(e) => setNewTitle(e.target.value)}
                          placeholder="例如：114 學年度第 1 學期學校日家長簽到（403 班）"
                          className="w-full px-3.5 py-2 text-sm border border-stone-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-700"
                        />
                      </div>

                      <div className="space-y-1">
                        <label className="block text-xs font-medium text-stone-700">
                          日期與時間 *
                        </label>
                        <input
                          type="text"
                          required
                          maxLength={40}
                          value={newDate}
                          onChange={(e) => setNewDate(e.target.value)}
                          placeholder="2025-09-10 09:00"
                          className="w-full px-3.5 py-2 text-sm font-mono-tabular border border-stone-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-700"
                        />
                      </div>

                      <div className="space-y-1">
                        <label className="block text-xs font-medium text-stone-700">
                          所屬學年度
                        </label>
                        <input
                          type="text"
                          list="parent-year-options"
                          maxLength={40}
                          value={newYear}
                          onChange={(e) => setNewYear(e.target.value)}
                          className="w-full px-3.5 py-2 text-sm border border-stone-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-700"
                        />
                        <datalist id="parent-year-options">
                          {ACADEMIC_YEAR_OPTIONS.map((yr) => (
                            <option key={yr} value={yr} />
                          ))}
                        </datalist>
                      </div>

                      <div className="space-y-1">
                        <label className="block text-xs font-medium text-stone-700">
                          地點 / 教室名稱
                        </label>
                        <input
                          type="text"
                          maxLength={160}
                          value={newLocation}
                          onChange={(e) => setNewLocation(e.target.value)}
                          placeholder="例如：西門國小各班教室 / 視聽教室"
                          className="w-full px-3.5 py-2 text-sm border border-stone-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-700"
                        />
                      </div>

                      <div className="space-y-1">
                        <label className="block text-xs font-medium text-stone-700">
                          活動簡報 / 線上說明連結（選填，限 https://）
                        </label>
                        <input
                          type="url"
                          maxLength={500}
                          value={newMeetUrl}
                          onChange={(e) => setNewMeetUrl(e.target.value)}
                          placeholder="https://..."
                          className="w-full px-3.5 py-2 text-sm border border-stone-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-700"
                        />
                      </div>

                      <div className="sm:col-span-2 space-y-1">
                        <label className="block text-xs font-medium text-stone-700">
                          學校日給家長的歡迎提醒（公開於家長簽到頁）
                        </label>
                        <textarea
                          rows={3}
                          maxLength={1000}
                          value={newAgenda}
                          onChange={(e) => setNewAgenda(e.target.value)}
                          placeholder="例如：歡迎家長蒞臨！請填入學生班級座號姓名與家長稱謂後親筆簽名..."
                          className="w-full px-3.5 py-2 text-sm border border-stone-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-700"
                        />
                      </div>

                      <div className="sm:col-span-2 min-w-0 max-w-full bg-[#FBF9F5] border border-stone-200 rounded-xl p-3.5 sm:p-4 space-y-3 overflow-hidden">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-900">
                            <Clock className="w-3.5 h-3.5" />
                            <span>開放手寫簽名時段設定（選填，留白代表不限時段）</span>
                          </div>
                          <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
                            <button
                              type="button"
                              onClick={() => {
                                const start = Date.now();
                                setNewCheckinStartLocal(
                                  toDateTimeLocalValue(start),
                                );
                                setNewCheckinEndLocal(
                                  toDateTimeLocalValue(
                                    start + 4 * 60 * 60 * 1000,
                                  ),
                                );
                              }}
                              className="px-2 py-1 bg-white border border-stone-300 rounded-md hover:border-emerald-700 hover:text-emerald-900"
                            >
                              學校日開放 4 小時
                            </button>
                            {(newCheckinStartLocal || newCheckinEndLocal) && (
                              <button
                                type="button"
                                onClick={() => {
                                  setNewCheckinStartLocal('');
                                  setNewCheckinEndLocal('');
                                }}
                                className="px-2 py-1 bg-white border border-stone-300 rounded-md text-stone-600 hover:border-stone-400"
                              >
                                清除時限
                              </button>
                            )}
                          </div>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 min-w-0">
                          <div className="space-y-1 min-w-0 max-w-full overflow-hidden">
                            <label className="block text-xs font-medium text-stone-700">
                              開放簽名開始時間
                            </label>
                            <input
                              type="datetime-local"
                              value={newCheckinStartLocal}
                              onChange={(e) =>
                                setNewCheckinStartLocal(e.target.value)
                              }
                              className="w-full min-w-0 max-w-full block h-9 px-3 text-xs sm:text-sm font-mono-tabular bg-white border border-stone-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-700"
                            />
                          </div>
                          <div className="space-y-1 min-w-0 max-w-full overflow-hidden">
                            <label className="block text-xs font-medium text-stone-700">
                              簽名截止時間
                            </label>
                            <input
                              type="datetime-local"
                              value={newCheckinEndLocal}
                              onChange={(e) =>
                                setNewCheckinEndLocal(e.target.value)
                              }
                              className="w-full min-w-0 max-w-full block h-9 px-3 text-xs sm:text-sm font-mono-tabular bg-white border border-stone-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-700"
                            />
                          </div>
                        </div>
                      </div>

                      <div className="sm:col-span-2 flex flex-wrap items-center justify-between gap-3 pt-1">
                        <label className="inline-flex items-center gap-2 text-xs font-medium text-stone-700 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={newIsOpen}
                            onChange={(e) => setNewIsOpen(e.target.checked)}
                            className="rounded border-stone-300 text-emerald-700"
                          />
                          <span>啟用此場次家長簽到功能</span>
                        </label>

                        <button
                          type="submit"
                          disabled={isCreatingSession || !newTitle.trim()}
                          className="w-full sm:w-auto px-5 py-2.5 text-xs sm:text-sm font-semibold text-white bg-emerald-800 hover:bg-emerald-900 disabled:opacity-60 rounded-xl transition-colors"
                        >
                          {isCreatingSession
                            ? '建立場次中...'
                            : '發布學校日家長簽到（並產生 QR Code）'}
                        </button>
                      </div>
                    </div>
                  </form>
                )}
              </div>
            )
          ) : /* ==================== TRACK 2: TEACHER COMMUNITY MEETINGS ==================== */
          !isSchoolAuthorized ? (
            /* Clean & Simple Teacher Sign-in Gate (Zero parent sessions or clutter shown) */
            <div className="max-w-lg mx-auto bg-white border border-stone-200 rounded-2xl p-6 sm:p-8 space-y-5 text-center">
              <div className="w-12 h-12 rounded-2xl bg-[#1E3A8A]/10 text-[#1E3A8A] flex items-center justify-center mx-auto">
                <ShieldCheck className="w-6 h-6" />
              </div>

              <div className="space-y-1.5">
                <h3 className="font-editorial text-xl font-bold text-stone-950">
                  教師會議簽到登入
                </h3>
                <p className="text-xs sm:text-sm text-stone-600 leading-relaxed">
                  請登入西門國小{' '}
                  <span className="font-mono-tabular font-semibold text-[#1E3A8A]">
                    @{SCHOOL_DOMAIN}
                  </span>{' '}
                  Google 帳號，登入後即可直接手寫簽名完成報到。
                </p>
              </div>

              {user && (
                <div
                  role="alert"
                  className="p-3.5 rounded-xl bg-amber-50 border border-amber-200 text-amber-950 text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-left"
                >
                  <div className="min-w-0 break-all">
                    目前帳號 <span className="font-mono-tabular font-semibold">{user.email}</span> 非校內驗證網域。
                  </div>
                  <button
                    type="button"
                    onClick={onSignOut}
                    className="px-2.5 py-1 text-xs font-semibold text-amber-950 bg-white border border-amber-300 rounded-lg hover:bg-amber-100 whitespace-nowrap shrink-0 self-start sm:self-center"
                  >
                    登出切換
                  </button>
                </div>
              )}

              {authError && (
                <div
                  role="alert"
                  className="p-3 rounded-xl bg-red-50 border border-red-200 text-red-900 text-xs flex items-start justify-between gap-3 text-left"
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

              <div className="space-y-2.5 pt-1">
                <button
                  type="button"
                  onClick={onSchoolSignIn}
                  disabled={isSigningIn}
                  className="w-full min-h-[46px] px-5 py-3 text-sm font-semibold text-white bg-[#1E3A8A] hover:bg-[#172554] disabled:opacity-60 rounded-xl transition-colors inline-flex items-center justify-center gap-2"
                >
                  <ShieldCheck className="w-4 h-4 shrink-0" />
                  <span>
                    {isSigningIn
                      ? 'Google 驗證中...'
                      : `使用 @${SCHOOL_DOMAIN} 教師帳號登入`}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={onAdminSignIn}
                  disabled={isSigningIn}
                  className="w-full py-2 text-xs font-medium text-stone-500 hover:text-[#1E3A8A] transition-colors"
                >
                  管理員登入（建立會議與匯出名冊）
                </button>
              </div>
            </div>
          ) : (
            /* Authenticated Teacher Community View (strictly teacher sessions only; NO parent data) */
            <>
              <section className="bg-white border border-stone-200 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="space-y-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    <span className="font-semibold text-[#1E3A8A]">
                      {isTeacherAdmin
                        ? '管理教師模式 · 教師社群會議專區'
                        : `已驗證：@${SCHOOL_DOMAIN} 社群教師`}
                    </span>
                    <span aria-hidden="true" className="text-stone-300">
                      ·
                    </span>
                    <span className="font-mono-tabular text-stone-600">
                      我的簽到 {activeMyCheckins.length} 場
                    </span>
                  </div>
                  <div className="text-sm font-medium text-stone-900 truncate">
                    {user?.displayName || '社群教師'}{' '}
                    <span className="font-mono-tabular text-xs text-stone-500">
                      ({user?.email})
                    </span>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2 shrink-0">
                  {isTeacherAdmin && (
                    <button
                      type="button"
                      onClick={() => switchAdminTrack('parent')}
                      className="min-h-[38px] px-3 py-1.5 text-xs font-semibold text-emerald-900 bg-emerald-50 border border-emerald-200 hover:bg-emerald-100 rounded-lg inline-flex items-center gap-1.5 transition-colors whitespace-nowrap"
                    >
                      <UserCheck className="w-3.5 h-3.5" />
                      <span>切換至：學校日家長場次管理</span>
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={onSignOut}
                    className="min-h-[38px] px-3 py-1.5 text-xs font-medium text-stone-700 bg-white border border-stone-300 hover:bg-stone-50 rounded-lg inline-flex items-center gap-1.5 whitespace-nowrap"
                  >
                    <LogOut className="w-3.5 h-3.5" />
                    <span>切換帳號 / 登出</span>
                  </button>
                </div>
              </section>

              {/* Teacher Check-in Navigation Tabs */}
              <div className="space-y-3">
                <div
                  role="tablist"
                  aria-label="教師會議簽到功能頁籤"
                  className={`grid gap-2 ${
                    isTeacherAdmin
                      ? 'grid-cols-1 sm:grid-cols-3'
                      : 'grid-cols-1 sm:grid-cols-2'
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
                        教師會議場次與簽名
                      </span>
                    </span>
                    <span
                      className={`px-2 py-0.5 text-[11px] font-mono-tabular font-semibold rounded-md shrink-0 ${
                        activeTab === 'sessions'
                          ? 'bg-white/20 text-white'
                          : openTeacherMeetingsCount > 0
                            ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                            : 'bg-stone-100 text-stone-600'
                      }`}
                    >
                      {openTeacherMeetingsCount > 0
                        ? `${openTeacherMeetingsCount} 場開放`
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
                      {activeMyCheckins.length} 筆
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
                          建立新教師會議
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
                      點擊「展開手寫簽名板進行簽到」並親自簽名送出，即完成教師會議簽到。
                    </span>
                    <div className="flex items-center gap-1.5">
                      {(
                        [
                          {id: 'all', label: `全部 (${meetings.length})`},
                          {
                            id: 'open',
                            label: `開放中 (${openTeacherMeetingsCount})`,
                          },
                        ] as const
                      ).map((f) => (
                        <button
                          key={f.id}
                          type="button"
                          onClick={() => setSessionFilter(f.id)}
                          className={`px-2.5 py-1 rounded-md border transition-colors ${
                            sessionFilter === f.id
                              ? 'bg-[#1E3A8A] text-white border-[#1E3A8A]'
                              : 'bg-white text-stone-600 border-stone-200 hover:bg-stone-50'
                          }`}
                        >
                          {f.label}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Tab 1: Teacher Meeting Sessions */}
              {activeTab === 'sessions' && (
                <div className="space-y-4">
                  <div className="bg-white border border-stone-200 rounded-xl p-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <label
                        htmlFor="checkin-teacher-name"
                        className="block text-xs font-medium text-stone-700"
                      >
                        教師簽到顯示姓名（可調整）
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
                        職務 / 年段備註（選填，簽到時自動帶入）
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
                      正在載入教師社群會議場次...
                    </div>
                  ) : displayedTeacherMeetings.length === 0 ? (
                    <div className="bg-white border border-stone-200 rounded-xl p-8 text-center space-y-3">
                      <CalendarCheck className="w-8 h-8 text-stone-400 mx-auto" />
                      <h3 className="font-editorial text-lg font-semibold text-stone-900">
                        {sessionFilter === 'open'
                          ? '目前沒有開放簽名中的教師會議'
                          : '尚未建立任何教師社群會議場次'}
                      </h3>
                      <p className="text-xs sm:text-sm text-stone-600 max-w-md mx-auto">
                        {isTeacherAdmin
                          ? '您是授權管理教師，可點擊上方「建立新教師會議」新增本次領域共備或研習場次。'
                          : '目前沒有已發布的教師社群會議場次，請等待領域召集教師開啟新場次。'}
                      </p>
                      {isTeacherAdmin && (
                        <button
                          type="button"
                          onClick={() => setActiveTab('admin')}
                          className="px-4 py-2 text-xs font-semibold text-white bg-[#1E3A8A] rounded-lg hover:bg-[#172554] inline-flex items-center gap-1.5"
                        >
                          <Plus className="w-3.5 h-3.5" />
                          <span>立即建立教師會議場次</span>
                        </button>
                      )}
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {displayedTeacherMeetings.map((meeting) => {
                        const myRecord = myCheckinByMeetingId.get(meeting.id);
                        const windowState = getMeetingCheckinWindowState(
                          meeting,
                          nowMs,
                        );
                        const countdown = getMeetingCheckinCountdown(
                          meeting,
                          nowMs,
                        );
                        const isCurrentlySignable =
                          windowState.status === 'open';
                        const adminTeacherRoster = isTeacherAdmin
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
                                <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
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
                                  <span
                                    aria-hidden="true"
                                    className="text-stone-300"
                                  >
                                    ·
                                  </span>
                                  <span className="font-mono-tabular font-medium text-[#1E3A8A]">
                                    {meeting.academicYear}
                                  </span>
                                  <span
                                    aria-hidden="true"
                                    className="text-stone-300"
                                  >
                                    ·
                                  </span>
                                  <span className="font-mono-tabular text-stone-600">
                                    {meeting.meetingDate}
                                  </span>
                                </div>

                                <h3 className="font-editorial text-lg font-bold text-stone-950 break-words">
                                  {meeting.title}
                                </h3>

                                {(meeting.checkinStartAtMs !== null ||
                                  meeting.checkinEndAtMs !== null) && (
                                  <div className="flex flex-wrap items-center gap-2">
                                    <div className="inline-flex flex-wrap items-center gap-1.5 text-xs text-[#1E3A8A] bg-[#1E3A8A]/6 border border-[#1E3A8A]/15 rounded-md px-2.5 py-1">
                                      <Clock className="w-3.5 h-3.5 shrink-0" />
                                      <span>
                                        開放簽名時段：
                                        {meeting.checkinStartAtMs !== null
                                          ? formatDateTime(
                                              meeting.checkinStartAtMs,
                                            )
                                          : '立即開放'}
                                        {' ～ '}
                                        {meeting.checkinEndAtMs !== null
                                          ? formatDateTime(
                                              meeting.checkinEndAtMs,
                                            )
                                          : '不限截止'}
                                      </span>
                                    </div>

                                    {countdown && (
                                      <div
                                        className={`inline-flex items-center gap-1.5 text-xs font-mono-tabular rounded-md px-2.5 py-1 ${
                                          countdown.isUrgent
                                            ? 'bg-red-50 border border-red-200 text-red-600 font-bold'
                                            : 'bg-stone-50 border border-stone-200 text-[#1E3A8A] font-semibold'
                                        }`}
                                      >
                                        {countdown.isUrgent ? (
                                          <AlertTriangle className="w-3.5 h-3.5 shrink-0 text-red-600" />
                                        ) : (
                                          <Clock className="w-3.5 h-3.5 shrink-0 text-[#1E3A8A]" />
                                        )}
                                        <span>
                                          倒數計時：{countdown.formattedText}
                                          {countdown.isUrgent
                                            ? '（即將截止，請盡速簽名）'
                                            : ''}
                                        </span>
                                      </div>
                                    )}
                                  </div>
                                )}

                                {meeting.location && (
                                  <div className="flex items-center gap-1.5 text-xs text-stone-600">
                                    <MapPin className="w-3.5 h-3.5 text-stone-400 shrink-0" />
                                    <span>{meeting.location}</span>
                                  </div>
                                )}
                              </div>

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
                                    <span>會議室</span>
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

                            {/* Teacher Check-in Action & Handwritten Signature */}
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

                                      {!isEditingThis && isCurrentlySignable && (
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
                                                  setEditingSignatureDraft(null);
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
                              ) : isCurrentlySignable ? (
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
                                          setSignatureDraftByMeeting((prev) => ({
                                            ...prev,
                                            [meeting.id]: dataUrl,
                                          }))
                                        }
                                      />

                                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 pt-1">
                                        <span className="text-xs text-stone-600">
                                          {isSigReady ? (
                                            <span className="text-emerald-800 font-semibold">
                                              ✓ 已擷取您的親筆簽名，點擊右側按鈕即可送出簽到。
                                            </span>
                                          ) : (
                                            <span>{windowState.detailText}</span>
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
                                              {submittingMeetingId === meeting.id
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
                                        {windowState.detailText}（帳號：{user?.email}）
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
                                <div
                                  className={`flex items-center gap-2 text-xs px-3 py-2 rounded-lg border ${
                                    windowState.status === 'not-started'
                                      ? 'bg-amber-50 border-amber-200 text-amber-900 font-medium'
                                      : 'bg-stone-50 border-stone-200 text-stone-600'
                                  }`}
                                >
                                  <Clock className="w-3.5 h-3.5 shrink-0" />
                                  <span>{windowState.detailText}</span>
                                </div>
                              )}
                            </div>

                            {/* Admin Controls for Teacher Session */}
                            {isTeacherAdmin && (() => {
                              const isTeacherQrExpanded =
                                expandedQrMeetingId === meeting.id;
                              return (
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
                                        {isRosterExpanded
                                          ? '收合教師名單'
                                          : '檢視簽到名單'}{' '}
                                        ({adminTeacherRoster.length} 人)
                                      </span>
                                    </button>

                                    <button
                                      type="button"
                                      disabled={adminTeacherRoster.length === 0}
                                      onClick={() =>
                                        handleOpenPrintablePreview(
                                          meeting,
                                          adminTeacherRoster,
                                          [],
                                        )
                                      }
                                      className="px-3 py-1.5 text-xs font-semibold text-white bg-[#1E3A8A] rounded-lg hover:bg-[#172554] disabled:opacity-40 inline-flex items-center gap-1.5"
                                    >
                                      <Printer className="w-3.5 h-3.5" />
                                      <span>預覽與印出簽名 PDF</span>
                                    </button>

                                    <button
                                      type="button"
                                      disabled={adminTeacherRoster.length === 0}
                                      onClick={() =>
                                        handleExportCsv(
                                          meeting,
                                          adminTeacherRoster,
                                          [],
                                        )
                                      }
                                      className="px-3 py-1.5 text-xs font-medium text-[#1E3A8A] bg-white border border-[#1E3A8A]/30 rounded-lg hover:bg-[#1E3A8A]/5 disabled:opacity-40 inline-flex items-center gap-1.5"
                                    >
                                      <Download className="w-3.5 h-3.5" />
                                      <span>匯出 CSV</span>
                                    </button>

                                    <button
                                      type="button"
                                      onClick={() =>
                                        setExpandedQrMeetingId(
                                          isTeacherQrExpanded
                                            ? null
                                            : meeting.id,
                                        )
                                      }
                                      className={`px-3 py-1.5 text-xs font-semibold border rounded-lg inline-flex items-center gap-1.5 ${
                                        isTeacherQrExpanded
                                          ? 'bg-[#1E3A8A] text-white border-[#1E3A8A]'
                                          : 'bg-[#1E3A8A]/8 text-[#1E3A8A] border-[#1E3A8A]/25 hover:bg-[#1E3A8A]/15'
                                      }`}
                                    >
                                      <QrCode className="w-3.5 h-3.5" />
                                      <span>會議掃碼 QR / 網址</span>
                                    </button>
                                  </div>

                                  {renderAdminScheduleAndDeleteControls(meeting)}
                                </div>

                                {isTeacherQrExpanded && (
                                  <div className="bg-[#1E3A8A]/[0.03] border border-[#1E3A8A]/20 rounded-xl p-4 flex flex-col sm:flex-row items-center gap-4">
                                    <div className="w-36 h-36 bg-white border border-stone-200 rounded-xl p-2 flex items-center justify-center shrink-0">
                                      {qrDataUrlByMeeting[
                                        `teacher:${meeting.id}`
                                      ] ? (
                                        <img
                                          src={
                                            qrDataUrlByMeeting[
                                              `teacher:${meeting.id}`
                                            ]
                                          }
                                          alt={`${meeting.title} 教師會議簽到 QR Code`}
                                          className="w-full h-full object-contain"
                                        />
                                      ) : (
                                        <span className="text-[11px] text-stone-400">
                                          產生 QR Code 中...
                                        </span>
                                      )}
                                    </div>
                                    <div className="flex-1 min-w-0 space-y-2.5 text-xs">
                                      <div className="font-bold text-[#1E3A8A] text-sm">
                                        教師社群會議現場掃碼 · 專屬簽到連結
                                      </div>
                                      <p className="text-stone-700 leading-relaxed">
                                        教師掃描此 QR Code 後，系統將導引使用 @{SCHOOL_DOMAIN} 帳號登入並直接展開本場次手寫簽名板（校外人士與家長無法檢視此會議）。
                                      </p>
                                      <div className="font-mono-tabular text-[11px] bg-white border border-stone-200 rounded-lg px-2.5 py-1.5 text-stone-600 break-all">
                                        {buildDirectCheckinUrl(
                                          'teacher',
                                          meeting.id,
                                        )}
                                      </div>
                                      <div className="flex flex-wrap items-center gap-2">
                                        <button
                                          type="button"
                                          onClick={() =>
                                            handleCopyDirectLink(
                                              'teacher',
                                              meeting.id,
                                            )
                                          }
                                          className="px-3 py-1.5 text-xs font-semibold text-white bg-[#1E3A8A] rounded-lg hover:bg-[#172554] inline-flex items-center gap-1.5"
                                        >
                                          {copiedLinkMeetingId === meeting.id ? (
                                            <Check className="w-3.5 h-3.5" />
                                          ) : (
                                            <Copy className="w-3.5 h-3.5" />
                                          )}
                                          <span>
                                            {copiedLinkMeetingId === meeting.id
                                              ? '已複製直達連結'
                                              : '複製教師簽到網址'}
                                          </span>
                                        </button>
                                        {qrDataUrlByMeeting[
                                          `teacher:${meeting.id}`
                                        ] && (
                                          <button
                                            type="button"
                                            onClick={() =>
                                              handleDownloadQrPng(meeting)
                                            }
                                            className="px-3 py-1.5 text-xs font-medium text-[#1E3A8A] bg-white border border-[#1E3A8A]/30 rounded-lg hover:bg-[#1E3A8A]/5 inline-flex items-center gap-1.5"
                                          >
                                            <Download className="w-3.5 h-3.5" />
                                            <span>下載 QR Code 圖檔</span>
                                          </button>
                                        )}
                                      </div>
                                    </div>
                                  </div>
                                )}

                                {renderAdminScheduleEditor(meeting)}

                                {isRosterExpanded && (
                                  <div className="bg-[#F7F4EE] border border-stone-200 rounded-xl overflow-hidden">
                                    {adminTeacherRoster.length === 0 ? (
                                      <div className="p-4 text-xs text-stone-500 text-center">
                                        目前尚無教師簽到此場次。
                                      </div>
                                    ) : (
                                      <div className="overflow-x-auto">
                                        <table className="w-full text-left border-collapse text-xs">
                                          <thead>
                                            <tr className="border-b border-stone-200 text-stone-600 bg-white/60">
                                              <th className="py-2.5 px-3 font-semibold">#</th>
                                              <th className="py-2.5 px-3 font-semibold">
                                                教師姓名
                                              </th>
                                              <th className="py-2.5 px-3 font-semibold">
                                                信箱
                                              </th>
                                              <th className="py-2.5 px-3 font-semibold">
                                                職務備註
                                              </th>
                                              <th className="py-2.5 px-3 font-semibold">
                                                親自手寫簽名
                                              </th>
                                              <th className="py-2.5 px-3 font-semibold">
                                                簽到時間
                                              </th>
                                            </tr>
                                          </thead>
                                          <tbody className="divide-y divide-stone-200/70">
                                            {adminTeacherRoster.map(
                                              (rec, idx) => (
                                                <tr
                                                  key={rec.id}
                                                  className="bg-white/50"
                                                >
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
                                                    {formatDateTime(
                                                      rec.checkedInAtMs,
                                                    )}
                                                  </td>
                                                </tr>
                                              ),
                                            )}
                                          </tbody>
                                        </table>
                                      </div>
                                    )}
                                  </div>
                                )}
                              </div>
                              );
                            })()}
                          </article>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              {/* Tab 2: Personal Teacher Check-in History */}
              {activeTab === 'my-history' && (
                <div className="bg-white border border-stone-200 rounded-xl overflow-hidden">
                  {activeMyCheckins.length === 0 ? (
                    <div className="p-8 text-center text-sm text-stone-500">
                      您目前尚無任何教師會議簽到紀錄。
                    </div>
                  ) : (
                    <div className="divide-y divide-stone-100">
                      {activeMyCheckins.map((item) => (
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
                              {item.roleOrNote
                                ? ` · 備註：${item.roleOrNote}`
                                : ''}
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

              {/* Tab 3: Admin Create Teacher Meeting Session */}
              {activeTab === 'admin' && isTeacherAdmin && (
                <form
                  onSubmit={handleCreateSession}
                  className="bg-white border border-stone-200 rounded-xl p-4 sm:p-6 space-y-4 min-w-0 max-w-full overflow-hidden"
                >
                  <div className="border-b border-stone-100 pb-3 min-w-0">
                    <h3 className="font-editorial text-base font-bold text-stone-950">
                      建立新的教師社群會議場次
                    </h3>
                    <p className="text-xs text-stone-500 mt-0.5">
                      僅限登入 @{SCHOOL_DOMAIN} 帳號之社群教師檢視與簽到（家長端完全看不見）。
                    </p>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 min-w-0">
                    <div className="sm:col-span-2 min-w-0 space-y-1">
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
                        會議地點 / 教室
                      </label>
                      <input
                        type="text"
                        maxLength={160}
                        value={newLocation}
                        onChange={(e) => setNewLocation(e.target.value)}
                        placeholder="例如：西門國小 會議室 / Google Meet"
                        className="w-full px-3.5 py-2 text-sm border border-stone-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1E3A8A]"
                      />
                    </div>

                    <div className="space-y-1">
                      <label className="block text-xs font-medium text-stone-700">
                        線上會議室連結（選填，限 https://）
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

                    <div className="sm:col-span-2 min-w-0 space-y-1.5">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <label className="block text-xs font-medium text-stone-700">
                          關聯知識庫文章／會議資料（選填，可選取全部 {posts.length} 篇文章）
                        </label>
                        <span className="text-[11px] font-mono-tabular text-stone-500">
                          {linkedPostSearch.trim()
                            ? `符合 ${meetingPostsForLinking.length} / ${posts.length} 篇`
                            : `共 ${posts.length} 篇可關聯`}
                        </span>
                      </div>
                      <p className="text-[11px] text-stone-500 leading-relaxed">
                        選擇後，教師於簽到時可直接點擊「檢視關聯文章」開啟對應的議程、教案或公開授課紀錄；若無對應文章可維持「不關聯特定文章」。
                      </p>
                      <div className="relative flex items-center">
                        <Search className="w-3.5 h-3.5 text-stone-400 absolute left-3 pointer-events-none" />
                        <input
                          type="text"
                          value={linkedPostSearch}
                          onChange={(e) => setLinkedPostSearch(e.target.value)}
                          placeholder="輸入關鍵字篩選文章（標題、分類或學年度）..."
                          className="w-full min-w-0 max-w-full pl-8 pr-8 py-1.5 text-xs bg-[#FBF9F5] border border-stone-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1E3A8A]"
                        />
                        {linkedPostSearch && (
                          <button
                            type="button"
                            onClick={() => setLinkedPostSearch('')}
                            className="absolute right-2 text-stone-400 hover:text-stone-700 p-0.5"
                            aria-label="清除搜尋"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                      <select
                        value={newLinkedSlug}
                        onChange={(e) => setNewLinkedSlug(e.target.value)}
                        className="w-full min-w-0 max-w-full px-3.5 py-2 text-sm bg-white border border-stone-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1E3A8A]"
                      >
                        <option value="">（不關聯特定文章）</option>
                        {meetingPostsForLinking.map((p) => (
                          <option key={p.slug} value={p.slug}>
                            [{p.academicYear} · {p.category || '未分類'}] {p.title}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="sm:col-span-2 min-w-0 space-y-1">
                      <label className="block text-xs font-medium text-stone-700">
                        議程摘要與校內備註（僅限校內登入教師閱讀）
                      </label>
                      <textarea
                        rows={3}
                        maxLength={1000}
                        value={newAgenda}
                        onChange={(e) => setNewAgenda(e.target.value)}
                        placeholder="輸入本次會議討論議題、共備教材準備事項或校內注意事項..."
                        className="w-full min-w-0 max-w-full px-3.5 py-2 text-sm border border-stone-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1E3A8A]"
                      />
                    </div>

                    <div className="sm:col-span-2 min-w-0 max-w-full bg-[#FBF9F5] border border-stone-200 rounded-xl p-3.5 sm:p-4 space-y-3 overflow-hidden">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#1E3A8A]">
                          <Clock className="w-3.5 h-3.5" />
                          <span>開放手寫簽名時段設定（選填，留白代表不限時段）</span>
                        </div>
                        <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
                          <button
                            type="button"
                            onClick={() => {
                              const start = Date.now();
                              setNewCheckinStartLocal(
                                toDateTimeLocalValue(start),
                              );
                              setNewCheckinEndLocal(
                                toDateTimeLocalValue(
                                  start + 2 * 60 * 60 * 1000,
                                ),
                              );
                            }}
                            className="px-2 py-1 bg-white border border-stone-300 rounded-md hover:border-[#1E3A8A] hover:text-[#1E3A8A]"
                          >
                            現在起開放 2 小時
                          </button>
                          {(newCheckinStartLocal || newCheckinEndLocal) && (
                            <button
                              type="button"
                              onClick={() => {
                                setNewCheckinStartLocal('');
                                setNewCheckinEndLocal('');
                              }}
                              className="px-2 py-1 bg-white border border-stone-300 rounded-md text-stone-600 hover:border-stone-400"
                            >
                              清除時限
                            </button>
                          )}
                        </div>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 min-w-0">
                        <div className="space-y-1 min-w-0 max-w-full overflow-hidden">
                          <label className="block text-xs font-medium text-stone-700">
                            開放簽名開始時間
                          </label>
                          <input
                            type="datetime-local"
                            value={newCheckinStartLocal}
                            onChange={(e) =>
                              setNewCheckinStartLocal(e.target.value)
                            }
                            className="w-full min-w-0 max-w-full block h-9 px-3 text-xs sm:text-sm font-mono-tabular bg-white border border-stone-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1E3A8A]"
                          />
                        </div>
                        <div className="space-y-1 min-w-0 max-w-full overflow-hidden">
                          <label className="block text-xs font-medium text-stone-700">
                            簽名截止時間
                          </label>
                          <input
                            type="datetime-local"
                            value={newCheckinEndLocal}
                            onChange={(e) =>
                              setNewCheckinEndLocal(e.target.value)
                            }
                            className="w-full min-w-0 max-w-full block h-9 px-3 text-xs sm:text-sm font-mono-tabular bg-white border border-stone-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1E3A8A]"
                          />
                        </div>
                      </div>
                    </div>

                    <div className="sm:col-span-2 flex flex-wrap items-center justify-between gap-3 pt-1">
                      <label className="inline-flex items-center gap-2 text-xs font-medium text-stone-700 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={newIsOpen}
                          onChange={(e) => setNewIsOpen(e.target.checked)}
                          className="rounded border-stone-300 text-[#1E3A8A]"
                        />
                        <span>啟用此場次教師簽到功能</span>
                      </label>

                      <button
                        type="submit"
                        disabled={isCreatingSession || !newTitle.trim()}
                        className="w-full sm:w-auto px-5 py-2.5 text-xs sm:text-sm font-semibold text-white bg-[#1E3A8A] hover:bg-[#172554] disabled:opacity-60 rounded-xl transition-colors"
                      >
                        {isCreatingSession
                          ? '建立場次中...'
                          : '發布教師會議簽到場次'}
                      </button>
                    </div>
                  </div>
                </form>
              )}
            </>
          )}
        </div>
      </div>

      {previewRoster &&
        typeof document !== 'undefined' &&
        createPortal(
          <div
            id="printable-attendance-sheet-portal"
            className="fixed inset-0 z-[70] overflow-y-auto bg-stone-950/75 backdrop-blur-xs p-3 sm:p-6 flex flex-col items-center"
            role="dialog"
            aria-modal="true"
            aria-label="簽名簽到表預覽與列印"
            onClick={() => setPreviewRoster(null)}
          >
            <div
              className="no-print w-full max-w-4xl bg-white border border-stone-200 rounded-xl shadow-lg p-3.5 sm:p-4 mb-4 space-y-2.5 shrink-0"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex flex-wrap items-center justify-between gap-2.5">
                <div className="min-w-0">
                  <div className="text-xs font-semibold text-[#1E3A8A]">
                    {previewRoster.meeting.audience === 'parent'
                      ? '學校日家長 · 含親自手寫簽名 A4 簽到表預覽'
                      : '教師社群會議 · 含親自手寫簽名 A4 簽到表預覽'}
                  </div>
                  <div className="text-sm font-bold text-stone-950 truncate">
                    {previewRoster.meeting.title}（
                    {previewRoster.meeting.audience === 'parent'
                      ? previewRoster.parentCheckins.length
                      : previewRoster.teacherCheckins.length}{' '}
                    人）
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    disabled={isGeneratingPdf}
                    onClick={handleDownloadRealPdf}
                    className="px-3.5 py-2 text-xs font-semibold text-white bg-[#1E3A8A] hover:bg-[#172554] disabled:opacity-60 rounded-lg inline-flex items-center gap-1.5"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>
                      {isGeneratingPdf ? '正在產生 PDF...' : '直接下載 PDF 檔'}
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={handleNativePrintSheet}
                    className="px-3.5 py-2 text-xs font-semibold text-stone-800 bg-[#F7F4EE] border border-stone-300 hover:bg-stone-200/70 rounded-lg inline-flex items-center gap-1.5"
                  >
                    <Printer className="w-3.5 h-3.5 text-[#1E3A8A]" />
                    <span>系統列印 / 另存 PDF</span>
                  </button>

                  <button
                    type="button"
                    onClick={handleDownloadOfflineHtml}
                    className="px-3 py-2 text-xs font-medium text-stone-700 bg-white border border-stone-300 hover:bg-stone-50 rounded-lg inline-flex items-center gap-1.5"
                  >
                    <FileText className="w-3.5 h-3.5" />
                    <span>下載 HTML</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setPreviewRoster(null)}
                    aria-label="關閉預覽"
                    className="p-2 text-stone-500 hover:text-stone-900 hover:bg-stone-100 rounded-lg"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {(pdfNotice || readyPdfDownload) && (
                <div className="flex flex-wrap items-center justify-between gap-2 bg-emerald-50 border border-emerald-200 text-emerald-950 rounded-lg px-3 py-2 text-xs">
                  <span>{pdfNotice}</span>
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

            <div
              id="printable-attendance-sheet-card"
              className="w-full max-w-4xl bg-white border border-stone-200 rounded-xl shadow-xl p-5 sm:p-8 space-y-5 text-stone-900"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="space-y-1.5 border-b border-stone-200 pb-4">
                <div className="text-xs font-bold tracking-wider text-[#1E3A8A]">
                  {previewRoster.meeting.audience === 'parent'
                    ? '臺北市西門國小 · 學校日／親師活動家長出席簽到表'
                    : '臺北市西門國小數學領域教師社群 · PesMath 會議出席簽到表'}
                </div>
                <h2 className="font-editorial text-xl sm:text-2xl font-bold text-stone-950">
                  {previewRoster.meeting.title}
                </h2>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs bg-[#FAF8F5] border border-stone-200 rounded-lg p-3.5 text-stone-700">
                <div>
                  <strong className="text-stone-900">學年度：</strong>
                  {previewRoster.meeting.academicYear}
                </div>
                <div>
                  <strong className="text-stone-900">活動時間：</strong>
                  {previewRoster.meeting.meetingDate}
                </div>
                <div>
                  <strong className="text-stone-900">地點：</strong>
                  {previewRoster.meeting.location || '西門國小'}
                </div>
                <div>
                  <strong className="text-stone-900">總簽到人數：</strong>
                  {previewRoster.meeting.audience === 'parent'
                    ? `${previewRoster.parentCheckins.length} 位家長`
                    : `${previewRoster.teacherCheckins.length} 位教師`}
                </div>
              </div>

              <div className="overflow-x-auto">
                {previewRoster.meeting.audience === 'parent' ? (
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="bg-[#F5F2EB] text-stone-800">
                        <th className="border border-stone-300 py-2.5 px-2.5 text-center w-10">
                          #
                        </th>
                        <th className="border border-stone-300 py-2.5 px-3">
                          學生班級 / 姓名
                        </th>
                        <th className="border border-stone-300 py-2.5 px-3">
                          家長姓名
                        </th>
                        <th className="border border-stone-300 py-2.5 px-3">
                          關係 / 備註
                        </th>
                        <th className="border border-stone-300 py-2.5 px-3 text-center w-40">
                          親自手寫簽名
                        </th>
                        <th className="border border-stone-300 py-2.5 px-3">
                          簽到時間
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {previewRoster.parentCheckins.map((rec, idx) => (
                        <tr key={rec.id}>
                          <td className="border border-stone-300 py-2 px-2.5 text-center font-mono-tabular text-stone-600">
                            {idx + 1}
                          </td>
                          <td className="border border-stone-300 py-2 px-3 font-semibold text-stone-950">
                            {rec.studentClassAndSeat}
                          </td>
                          <td className="border border-stone-300 py-2 px-3 font-semibold text-stone-900">
                            {rec.parentName}
                          </td>
                          <td className="border border-stone-300 py-2 px-3 text-stone-700">
                            {rec.relationshipOrNote || '—'}
                          </td>
                          <td className="border border-stone-300 py-1.5 px-2 text-center bg-white">
                            {isValidSignatureDataUrl(rec.signatureDataUrl) ? (
                              <img
                                src={rec.signatureDataUrl}
                                alt={`${rec.parentName}親筆簽名`}
                                className="h-12 w-32 object-contain mx-auto"
                              />
                            ) : (
                              <span className="text-[11px] text-stone-400">
                                （未附簽名）
                              </span>
                            )}
                          </td>
                          <td className="border border-stone-300 py-2 px-3 font-mono-tabular text-stone-600 whitespace-nowrap">
                            {formatDateTime(rec.checkedInAtMs)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : (
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="bg-[#F5F2EB] text-stone-800">
                        <th className="border border-stone-300 py-2.5 px-2.5 text-center w-10">
                          #
                        </th>
                        <th className="border border-stone-300 py-2.5 px-3">
                          教師姓名
                        </th>
                        <th className="border border-stone-300 py-2.5 px-3">
                          校內帳號信箱
                        </th>
                        <th className="border border-stone-300 py-2.5 px-3">
                          職務 / 年段備註
                        </th>
                        <th className="border border-stone-300 py-2.5 px-3 text-center w-40">
                          親自手寫簽名
                        </th>
                        <th className="border border-stone-300 py-2.5 px-3">
                          簽到時間
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {previewRoster.teacherCheckins.map((rec, idx) => (
                        <tr key={rec.id}>
                          <td className="border border-stone-300 py-2 px-2.5 text-center font-mono-tabular text-stone-600">
                            {idx + 1}
                          </td>
                          <td className="border border-stone-300 py-2 px-3 font-semibold text-stone-950">
                            {rec.userName}
                          </td>
                          <td className="border border-stone-300 py-2 px-3 font-mono-tabular text-stone-600 break-all">
                            {rec.userEmail}
                          </td>
                          <td className="border border-stone-300 py-2 px-3 text-stone-700">
                            {rec.roleOrNote || '—'}
                          </td>
                          <td className="border border-stone-300 py-1.5 px-2 text-center bg-white">
                            {isValidSignatureDataUrl(rec.signatureDataUrl) ? (
                              <img
                                src={rec.signatureDataUrl}
                                alt={`${rec.userName}親筆簽名`}
                                className="h-12 w-32 object-contain mx-auto"
                              />
                            ) : (
                              <span className="text-[11px] text-stone-400">
                                （未附簽名）
                              </span>
                            )}
                          </td>
                          <td className="border border-stone-300 py-2 px-3 font-mono-tabular text-stone-600 whitespace-nowrap">
                            {formatDateTime(rec.checkedInAtMs)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
};
