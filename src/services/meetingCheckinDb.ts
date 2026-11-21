import {
  collection,
  deleteDoc,
  doc,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  Timestamp,
  Unsubscribe,
  updateDoc,
  where,
} from 'firebase/firestore';
import {auth, db} from './googleAuth';
import {
  handleFirestoreError,
  isFirestoreQuotaError,
  OperationType,
} from './firestoreSync';

const MEETINGS_COLLECTION = 'meetings';
const CHECKINS_COLLECTION = 'meetingCheckins';

export interface MeetingSession {
  id: string;
  title: string;
  meetingDate: string;
  academicYear: string;
  location: string;
  agendaSummary: string;
  meetUrl: string;
  linkedPostSlug: string;
  isOpen: boolean;
  createdByName: string;
  createdByUid: string;
  createdAtMs: number;
  updatedAtMs: number;
}

export interface MeetingCheckin {
  id: string;
  meetingId: string;
  meetingTitle: string;
  userUid: string;
  userName: string;
  userEmail: string;
  roleOrNote: string;
  checkedInAtMs: number;
  updatedAtMs: number;
}

export interface CreateMeetingSessionInput {
  title: string;
  meetingDate: string;
  academicYear: string;
  location: string;
  agendaSummary: string;
  meetUrl: string;
  linkedPostSlug: string;
  isOpen: boolean;
}

function truncateChars(value: string, maxLength: number): string {
  const trimmed = value.trim();
  if (trimmed.length <= maxLength) return trimmed;
  return trimmed.slice(0, maxLength);
}

function toTimestampMs(raw: unknown): number {
  if (raw instanceof Timestamp) {
    return raw.toMillis();
  }
  if (
    raw &&
    typeof raw === 'object' &&
    'toMillis' in raw &&
    typeof (raw as {toMillis: () => number}).toMillis === 'function'
  ) {
    return (raw as {toMillis: () => number}).toMillis();
  }
  return Date.now();
}

function formatFriendlyMeetingError(err: unknown, fallback: string): Error {
  if (isFirestoreQuotaError(err)) {
    return new Error(
      'Firestore_QUOTA_EXCEEDED: 雲端資料庫今日免費讀取或寫入額度已達上限（將於明日自動重設）。',
    );
  }
  if (err instanceof Error) return err;
  return new Error(fallback);
}

function generateMeetingId(): string {
  const rand = Math.random().toString(36).slice(2, 8);
  return `mtg_${Date.now()}_${rand}`;
}

export function subscribeMeetings(
  onUpdate: (sessions: MeetingSession[]) => void,
  onError?: (err: Error) => void,
): Unsubscribe {
  if (!auth.currentUser) {
    onUpdate([]);
    return () => {};
  }

  const q = query(
    collection(db, MEETINGS_COLLECTION),
    orderBy('createdAt', 'desc'),
    limit(100),
  );

  return onSnapshot(
    q,
    (snapshot) => {
      const items: MeetingSession[] = snapshot.docs.map((snap) => {
        const d = snap.data();
        return {
          id: snap.id,
          title: String(d.title ?? ''),
          meetingDate: String(d.meetingDate ?? ''),
          academicYear: String(d.academicYear ?? ''),
          location: String(d.location ?? ''),
          agendaSummary: String(d.agendaSummary ?? ''),
          meetUrl: String(d.meetUrl ?? ''),
          linkedPostSlug: String(d.linkedPostSlug ?? ''),
          isOpen: Boolean(d.isOpen),
          createdByName: String(d.createdByName ?? '領域召集教師'),
          createdByUid: String(d.createdByUid ?? ''),
          createdAtMs: toTimestampMs(d.createdAt),
          updatedAtMs: toTimestampMs(d.updatedAt),
        };
      });
      items.sort((a, b) => {
        if (a.isOpen !== b.isOpen) return a.isOpen ? -1 : 1;
        return b.meetingDate.localeCompare(a.meetingDate) || b.createdAtMs - a.createdAtMs;
      });
      onUpdate(items);
    },
    (error) => {
      try {
        handleFirestoreError(error, OperationType.LIST, MEETINGS_COLLECTION);
      } catch (wrapped) {
        onError?.(
          formatFriendlyMeetingError(wrapped, '讀取社群會議場次失敗。'),
        );
      }
    },
  );
}

export function subscribeMyCheckins(
  userUid: string,
  onUpdate: (checkins: MeetingCheckin[]) => void,
  onError?: (err: Error) => void,
): Unsubscribe {
  if (!auth.currentUser || !userUid) {
    onUpdate([]);
    return () => {};
  }

  const q = query(
    collection(db, CHECKINS_COLLECTION),
    where('userUid', '==', userUid),
    limit(200),
  );

  return onSnapshot(
    q,
    (snapshot) => {
      const items: MeetingCheckin[] = snapshot.docs.map((snap) => {
        const d = snap.data();
        return {
          id: snap.id,
          meetingId: String(d.meetingId ?? ''),
          meetingTitle: String(d.meetingTitle ?? ''),
          userUid: String(d.userUid ?? ''),
          userName: String(d.userName ?? ''),
          userEmail: String(d.userEmail ?? ''),
          roleOrNote: String(d.roleOrNote ?? ''),
          checkedInAtMs: toTimestampMs(d.checkedInAt),
          updatedAtMs: toTimestampMs(d.updatedAt),
        };
      });
      items.sort((a, b) => b.checkedInAtMs - a.checkedInAtMs);
      onUpdate(items);
    },
    (error) => {
      try {
        handleFirestoreError(error, OperationType.LIST, CHECKINS_COLLECTION);
      } catch (wrapped) {
        onError?.(
          formatFriendlyMeetingError(wrapped, '讀取個人會議簽到紀錄失敗。'),
        );
      }
    },
  );
}

export function subscribeAllCheckinsForAdmin(
  onUpdate: (checkins: MeetingCheckin[]) => void,
  onError?: (err: Error) => void,
): Unsubscribe {
  if (!auth.currentUser) {
    onUpdate([]);
    return () => {};
  }

  const q = query(collection(db, CHECKINS_COLLECTION), limit(500));

  return onSnapshot(
    q,
    (snapshot) => {
      const items: MeetingCheckin[] = snapshot.docs.map((snap) => {
        const d = snap.data();
        return {
          id: snap.id,
          meetingId: String(d.meetingId ?? ''),
          meetingTitle: String(d.meetingTitle ?? ''),
          userUid: String(d.userUid ?? ''),
          userName: String(d.userName ?? ''),
          userEmail: String(d.userEmail ?? ''),
          roleOrNote: String(d.roleOrNote ?? ''),
          checkedInAtMs: toTimestampMs(d.checkedInAt),
          updatedAtMs: toTimestampMs(d.updatedAt),
        };
      });
      items.sort((a, b) => b.checkedInAtMs - a.checkedInAtMs);
      onUpdate(items);
    },
    (error) => {
      try {
        handleFirestoreError(error, OperationType.LIST, CHECKINS_COLLECTION);
      } catch (wrapped) {
        onError?.(
          formatFriendlyMeetingError(wrapped, '讀取全體會議簽到名冊失敗。'),
        );
      }
    },
  );
}

export async function createMeetingSession(
  input: CreateMeetingSessionInput,
): Promise<string> {
  const currentUser = auth.currentUser;
  if (!currentUser) {
    throw new Error('請先登入管理教師帳號。');
  }

  const safeTitle = truncateChars(input.title, 160);
  const safeDate = truncateChars(input.meetingDate, 40);
  const safeYear = truncateChars(input.academicYear || '114 學年度', 40);
  const safeLocation = truncateChars(input.location, 160);
  const safeAgenda = truncateChars(input.agendaSummary, 1000);
  const rawMeetUrl = input.meetUrl.trim();
  if (rawMeetUrl && !rawMeetUrl.startsWith('https://')) {
    throw new Error('線上會議或資料連結僅接受 https:// 開頭之安全網址。');
  }
  const safeMeetUrl = truncateChars(rawMeetUrl, 500);
  const safeSlug = truncateChars(input.linkedPostSlug, 160);
  const safeCreatorName = truncateChars(
    currentUser.displayName || currentUser.email || '領域召集教師',
    100,
  );

  if (!safeTitle || safeDate.length < 4) {
    throw new Error('請填寫會議名稱與有效的日期時間。');
  }

  const id = generateMeetingId();
  const docPath = `${MEETINGS_COLLECTION}/${id}`;
  const payload = {
    title: safeTitle,
    meetingDate: safeDate,
    academicYear: safeYear,
    location: safeLocation,
    agendaSummary: safeAgenda,
    meetUrl: safeMeetUrl,
    linkedPostSlug: safeSlug,
    isOpen: Boolean(input.isOpen),
    createdByName: safeCreatorName,
    createdByUid: currentUser.uid.slice(0, 128),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };

  try {
    await setDoc(doc(db, MEETINGS_COLLECTION, id), payload);
    return id;
  } catch (error) {
    try {
      handleFirestoreError(error, OperationType.CREATE, docPath);
    } catch (wrapped) {
      throw formatFriendlyMeetingError(wrapped, '建立會議簽到場次失敗。');
    }
  }
}

export async function updateMeetingSession(
  meetingId: string,
  updates: Partial<CreateMeetingSessionInput>,
): Promise<void> {
  const currentUser = auth.currentUser;
  if (!currentUser) {
    throw new Error('請先登入管理教師帳號。');
  }

  const sanitized: Record<string, unknown> = {
    updatedAt: serverTimestamp(),
  };
  if (updates.title !== undefined) {
    const t = truncateChars(updates.title, 160);
    if (!t) throw new Error('會議名稱不可為空。');
    sanitized.title = t;
  }
  if (updates.meetingDate !== undefined) {
    const d = truncateChars(updates.meetingDate, 40);
    if (d.length < 4) throw new Error('請填寫有效的會議日期時間。');
    sanitized.meetingDate = d;
  }
  if (updates.academicYear !== undefined) {
    sanitized.academicYear = truncateChars(
      updates.academicYear || '114 學年度',
      40,
    );
  }
  if (updates.location !== undefined) {
    sanitized.location = truncateChars(updates.location, 160);
  }
  if (updates.agendaSummary !== undefined) {
    sanitized.agendaSummary = truncateChars(updates.agendaSummary, 1000);
  }
  if (updates.meetUrl !== undefined) {
    const u = updates.meetUrl.trim();
    if (u && !u.startsWith('https://')) {
      throw new Error('線上會議或資料連結僅接受 https:// 開頭之安全網址。');
    }
    sanitized.meetUrl = truncateChars(u, 500);
  }
  if (updates.linkedPostSlug !== undefined) {
    sanitized.linkedPostSlug = truncateChars(updates.linkedPostSlug, 160);
  }
  if (updates.isOpen !== undefined) {
    sanitized.isOpen = Boolean(updates.isOpen);
  }

  const docPath = `${MEETINGS_COLLECTION}/${meetingId}`;
  try {
    await updateDoc(doc(db, MEETINGS_COLLECTION, meetingId), sanitized);
  } catch (error) {
    try {
      handleFirestoreError(error, OperationType.UPDATE, docPath);
    } catch (wrapped) {
      throw formatFriendlyMeetingError(wrapped, '更新會議場次失敗。');
    }
  }
}

export async function deleteMeetingSession(meetingId: string): Promise<void> {
  if (!auth.currentUser) {
    throw new Error('請先登入管理教師帳號。');
  }
  const docPath = `${MEETINGS_COLLECTION}/${meetingId}`;
  try {
    await deleteDoc(doc(db, MEETINGS_COLLECTION, meetingId));
  } catch (error) {
    try {
      handleFirestoreError(error, OperationType.DELETE, docPath);
    } catch (wrapped) {
      throw formatFriendlyMeetingError(wrapped, '刪除會議場次失敗。');
    }
  }
}

export async function submitMeetingCheckin(params: {
  meetingId: string;
  meetingTitle: string;
  roleOrNote: string;
  customDisplayName?: string;
}): Promise<string> {
  const currentUser = auth.currentUser;
  if (!currentUser || !currentUser.email) {
    throw new Error('請先登入 @hmes.tp.edu.tw 校內帳號後再進行會議簽到。');
  }

  const safeMeetingId = params.meetingId.trim().slice(0, 90);
  const checkinId = `${safeMeetingId}_${currentUser.uid}`;
  const docPath = `${CHECKINS_COLLECTION}/${checkinId}`;

  const safeTitle = truncateChars(params.meetingTitle || '社群會議', 160) || '社群會議';
  const fallbackName = currentUser.email.split('@')[0] || '社群教師';
  const safeName =
    truncateChars(
      params.customDisplayName || currentUser.displayName || fallbackName,
      100,
    ) || fallbackName;
  const safeEmail = truncateChars(currentUser.email, 200);
  const safeNote = truncateChars(params.roleOrNote || '', 120);

  const payload = {
    meetingId: safeMeetingId,
    meetingTitle: safeTitle,
    userUid: currentUser.uid.slice(0, 128),
    userName: safeName,
    userEmail: safeEmail,
    roleOrNote: safeNote,
    checkedInAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };

  try {
    await setDoc(doc(db, CHECKINS_COLLECTION, checkinId), payload);
    return checkinId;
  } catch (error) {
    try {
      handleFirestoreError(error, OperationType.CREATE, docPath);
    } catch (wrapped) {
      throw formatFriendlyMeetingError(
        wrapped,
        '會議簽到失敗，請確認此場次目前仍為「開放簽到中」且已使用 @hmes.tp.edu.tw 帳號登入。',
      );
    }
  }
}

export async function updateMyCheckinNote(params: {
  checkinId: string;
  roleOrNote: string;
  userName?: string;
}): Promise<void> {
  const currentUser = auth.currentUser;
  if (!currentUser) {
    throw new Error('請先登入帳號後再修改簽到備註。');
  }

  const updates: Record<string, unknown> = {
    roleOrNote: truncateChars(params.roleOrNote || '', 120),
    updatedAt: serverTimestamp(),
  };
  if (params.userName !== undefined && params.userName.trim()) {
    updates.userName = truncateChars(params.userName, 100);
  }

  const docPath = `${CHECKINS_COLLECTION}/${params.checkinId}`;
  try {
    await updateDoc(doc(db, CHECKINS_COLLECTION, params.checkinId), updates);
  } catch (error) {
    try {
      handleFirestoreError(error, OperationType.UPDATE, docPath);
    } catch (wrapped) {
      throw formatFriendlyMeetingError(wrapped, '更新簽到備註失敗。');
    }
  }
}

export async function cancelMeetingCheckin(checkinId: string): Promise<void> {
  if (!auth.currentUser) {
    throw new Error('請先登入帳號。');
  }
  const docPath = `${CHECKINS_COLLECTION}/${checkinId}`;
  try {
    await deleteDoc(doc(db, CHECKINS_COLLECTION, checkinId));
  } catch (error) {
    try {
      handleFirestoreError(error, OperationType.DELETE, docPath);
    } catch (wrapped) {
      throw formatFriendlyMeetingError(wrapped, '取消簽到失敗。');
    }
  }
}

function escapeSafeCsvCell(raw: string): string {
  const str = String(raw ?? '');
  const neutralized = /^[=+\-@\t\r]/.test(str) ? `'${str}` : str;
  return `"${neutralized.replace(/"/g, '""')}"`;
}

export function buildMeetingCheckinsCsv(
  meeting: MeetingSession,
  checkins: MeetingCheckin[],
): string {
  const headers = [
    '序號',
    '會議名稱',
    '會議時間',
    '教師姓名',
    '校內信箱',
    '職務或年段備註',
    '簽到時間',
  ];
  const rows = checkins.map((item, idx) => {
    const dt = new Date(item.checkedInAtMs).toLocaleString('zh-TW', {
      hour12: false,
    });
    return [
      String(idx + 1),
      meeting.title,
      meeting.meetingDate,
      item.userName,
      item.userEmail,
      item.roleOrNote,
      dt,
    ]
      .map(escapeSafeCsvCell)
      .join(',');
  });

  return '\uFEFF' + [headers.map(escapeSafeCsvCell).join(','), ...rows].join('\n');
}
