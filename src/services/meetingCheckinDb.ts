import {
  collection,
  deleteDoc,
  doc,
  DocumentReference,
  getDoc,
  getDocs,
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
  writeBatch,
} from 'firebase/firestore';
import {auth, db} from './googleAuth';
import {
  handleFirestoreError,
  isFirestoreQuotaError,
  OperationType,
} from './firestoreSync';

const MEETINGS_COLLECTION = 'meetings';
const PARENT_MEETINGS_COLLECTION = 'parentMeetings';
const CHECKINS_COLLECTION = 'meetingCheckins';
const PARENT_CHECKINS_COLLECTION = 'parentCheckins';

export type MeetingAudience = 'teacher' | 'parent';

export interface MeetingSession {
  id: string;
  title: string;
  meetingDate: string;
  academicYear: string;
  location: string;
  agendaSummary: string;
  meetUrl: string;
  linkedPostSlug: string;
  audience: MeetingAudience;
  isOpen: boolean;
  checkinStartAtMs: number | null;
  checkinEndAtMs: number | null;
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
  signatureDataUrl: string;
  checkedInAtMs: number;
  updatedAtMs: number;
}

export interface ParentCheckin {
  id: string;
  meetingId: string;
  meetingTitle: string;
  studentClassAndSeat: string;
  parentName: string;
  relationshipOrNote: string;
  signatureDataUrl: string;
  checkedInAtMs: number;
  updatedAtMs: number;
}

const SIGNATURE_DATA_URL_REGEX =
  /^data:image\/(png|webp|jpeg);base64,[A-Za-z0-9+/=]+$/;

export function isValidSignatureDataUrl(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.length >= 22 &&
    value.length <= 200000 &&
    SIGNATURE_DATA_URL_REGEX.test(value)
  );
}

export interface CreateMeetingSessionInput {
  title: string;
  meetingDate: string;
  academicYear: string;
  location: string;
  agendaSummary: string;
  meetUrl: string;
  linkedPostSlug: string;
  audience?: MeetingAudience;
  isOpen: boolean;
  checkinStartAtMs?: number | null;
  checkinEndAtMs?: number | null;
}

export type MeetingWindowStatus = 'open' | 'not-started' | 'ended' | 'closed';

export interface MeetingWindowState {
  status: MeetingWindowStatus;
  badgeLabel: string;
  detailText: string;
}

function formatScheduleDateTime(ms: number): string {
  return new Date(ms).toLocaleString('zh-TW', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

export function getMeetingCheckinWindowState(
  meeting: MeetingSession,
  nowMs = Date.now(),
): MeetingWindowState {
  const signerLabel =
    meeting.audience === 'parent' ? '家長親自手寫簽名' : '校內教師親自手寫簽名';

  if (!meeting.isOpen) {
    return {
      status: 'closed',
      badgeLabel: '已關閉簽到',
      detailText: '管理教師目前已手動關閉此場次簽到。',
    };
  }
  if (meeting.checkinStartAtMs !== null && nowMs < meeting.checkinStartAtMs) {
    return {
      status: 'not-started',
      badgeLabel: '尚未到開放時間',
      detailText: `將於 ${formatScheduleDateTime(meeting.checkinStartAtMs)} 開放${signerLabel}。`,
    };
  }
  if (meeting.checkinEndAtMs !== null && nowMs > meeting.checkinEndAtMs) {
    return {
      status: 'ended',
      badgeLabel: '簽名時間已截止',
      detailText: `本場次已於 ${formatScheduleDateTime(meeting.checkinEndAtMs)} 截止簽名。`,
    };
  }
  if (meeting.checkinEndAtMs !== null) {
    return {
      status: 'open',
      badgeLabel: '開放簽名中',
      detailText: `開放手寫簽名至 ${formatScheduleDateTime(meeting.checkinEndAtMs)} 止。`,
    };
  }
  return {
    status: 'open',
    badgeLabel: '開放簽名中',
    detailText: `目前開放${signerLabel}。`,
  };
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

function toOptionalTimestampMs(raw: unknown): number | null {
  if (raw === null || raw === undefined) return null;
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
  return null;
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

function generateParentCheckinId(): string {
  const rand = Math.random().toString(36).slice(2, 10);
  return `par_${Date.now()}_${rand}`;
}

function mapDocToMeetingSession(
  id: string,
  d: Record<string, unknown>,
): MeetingSession {
  const rawAudience = d.audience === 'parent' ? 'parent' : 'teacher';
  return {
    id,
    title: String(d.title ?? ''),
    meetingDate: String(d.meetingDate ?? ''),
    academicYear: String(d.academicYear ?? ''),
    location: String(d.location ?? ''),
    agendaSummary: String(d.agendaSummary ?? ''),
    meetUrl: String(d.meetUrl ?? ''),
    linkedPostSlug: String(d.linkedPostSlug ?? ''),
    audience: rawAudience,
    isOpen: Boolean(d.isOpen),
    checkinStartAtMs: toOptionalTimestampMs(d.checkinStartAt),
    checkinEndAtMs: toOptionalTimestampMs(d.checkinEndAt),
    createdByName: String(d.createdByName ?? '領域召集教師'),
    createdByUid: String(d.createdByUid ?? ''),
    createdAtMs: toTimestampMs(d.createdAt),
    updatedAtMs: toTimestampMs(d.updatedAt),
  };
}

function sortMeetingSessions(items: MeetingSession[]): MeetingSession[] {
  const nowMs = Date.now();
  const rank = (m: MeetingSession) => {
    const s = getMeetingCheckinWindowState(m, nowMs).status;
    if (s === 'open') return 0;
    if (s === 'not-started') return 1;
    return 2;
  };
  return [...items].sort((a, b) => {
    const rDiff = rank(a) - rank(b);
    if (rDiff !== 0) return rDiff;
    return (
      b.meetingDate.localeCompare(a.meetingDate) || b.createdAtMs - a.createdAtMs
    );
  });
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
      // Strictly exclude any legacy audience=='parent' documents so teachers never see parent sessions
      const items = snapshot.docs
        .map((snap) =>
          mapDocToMeetingSession(
            snap.id,
            snap.data() as Record<string, unknown>,
          ),
        )
        .filter((m) => m.audience !== 'parent');
      onUpdate(sortMeetingSessions(items));
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

/**
 * Public real-time subscription strictly scoped to School Day / parent sessions (`parentMeetings`
 * plus any legacy `audience == 'parent'` sessions pending admin migration) so parents can sign in
 * without logging in and without ever seeing teacher community meetings.
 */
export function subscribeParentMeetings(
  onUpdate: (sessions: MeetingSession[]) => void,
  onError?: (err: Error) => void,
): Unsubscribe {
  let dedicatedItems: MeetingSession[] = [];
  let legacyItems: MeetingSession[] = [];

  const emitMerged = () => {
    const byId = new Map<string, MeetingSession>();
    for (const item of legacyItems) {
      byId.set(item.id, {...item, audience: 'parent'});
    }
    for (const item of dedicatedItems) {
      byId.set(item.id, {...item, audience: 'parent'});
    }
    onUpdate(sortMeetingSessions(Array.from(byId.values())));
  };

  const qDedicated = query(
    collection(db, PARENT_MEETINGS_COLLECTION),
    where('audience', '==', 'parent'),
    limit(50),
  );
  const qLegacy = query(
    collection(db, MEETINGS_COLLECTION),
    where('audience', '==', 'parent'),
    limit(50),
  );

  const unsubDedicated = onSnapshot(
    qDedicated,
    (snapshot) => {
      dedicatedItems = snapshot.docs.map((snap) =>
        mapDocToMeetingSession(snap.id, snap.data() as Record<string, unknown>),
      );
      emitMerged();
    },
    (error) => {
      try {
        handleFirestoreError(
          error,
          OperationType.LIST,
          PARENT_MEETINGS_COLLECTION,
        );
      } catch (wrapped) {
        onError?.(
          formatFriendlyMeetingError(wrapped, '讀取學校日家長簽到場次失敗。'),
        );
      }
    },
  );

  const unsubLegacy = onSnapshot(
    qLegacy,
    (snapshot) => {
      legacyItems = snapshot.docs.map((snap) =>
        mapDocToMeetingSession(snap.id, snap.data() as Record<string, unknown>),
      );
      emitMerged();
    },
    () => {
      // Legacy fallback only; ignore if empty/unreadable
    },
  );

  return () => {
    unsubDedicated();
    unsubLegacy();
  };
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
          signatureDataUrl: isValidSignatureDataUrl(d.signatureDataUrl)
            ? d.signatureDataUrl
            : '',
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
          signatureDataUrl: isValidSignatureDataUrl(d.signatureDataUrl)
            ? d.signatureDataUrl
            : '',
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
          formatFriendlyMeetingError(wrapped, '讀取全體教師簽到名冊失敗。'),
        );
      }
    },
  );
}

export function subscribeAllParentCheckinsForAdmin(
  onUpdate: (checkins: ParentCheckin[]) => void,
  onError?: (err: Error) => void,
): Unsubscribe {
  if (!auth.currentUser) {
    onUpdate([]);
    return () => {};
  }

  const q = query(collection(db, PARENT_CHECKINS_COLLECTION), limit(800));

  return onSnapshot(
    q,
    (snapshot) => {
      const items: ParentCheckin[] = snapshot.docs.map((snap) => {
        const d = snap.data();
        return {
          id: snap.id,
          meetingId: String(d.meetingId ?? ''),
          meetingTitle: String(d.meetingTitle ?? ''),
          studentClassAndSeat: String(d.studentClassAndSeat ?? ''),
          parentName: String(d.parentName ?? ''),
          relationshipOrNote: String(d.relationshipOrNote ?? ''),
          signatureDataUrl: isValidSignatureDataUrl(d.signatureDataUrl)
            ? d.signatureDataUrl
            : '',
          checkedInAtMs: toTimestampMs(d.checkedInAt),
          updatedAtMs: toTimestampMs(d.updatedAt),
        };
      });
      items.sort((a, b) => b.checkedInAtMs - a.checkedInAtMs);
      onUpdate(items);
    },
    (error) => {
      try {
        handleFirestoreError(
          error,
          OperationType.LIST,
          PARENT_CHECKINS_COLLECTION,
        );
      } catch (wrapped) {
        onError?.(
          formatFriendlyMeetingError(wrapped, '讀取學校日家長簽到名冊失敗。'),
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
  const safeAudience: MeetingAudience =
    input.audience === 'parent' ? 'parent' : 'teacher';
  const safeCreatorName = truncateChars(
    currentUser.displayName || currentUser.email || '領域召集教師',
    100,
  );

  if (!safeTitle || safeDate.length < 4) {
    throw new Error('請填寫活動／會議名稱與有效的日期時間。');
  }

  const startMs =
    typeof input.checkinStartAtMs === 'number' &&
    Number.isFinite(input.checkinStartAtMs)
      ? input.checkinStartAtMs
      : null;
  const endMs =
    typeof input.checkinEndAtMs === 'number' &&
    Number.isFinite(input.checkinEndAtMs)
      ? input.checkinEndAtMs
      : null;
  if (startMs !== null && endMs !== null && endMs <= startMs) {
    throw new Error('簽名截止時間必須晚於開放開始時間。');
  }

  const id = generateMeetingId();
  const targetCollection =
    safeAudience === 'parent'
      ? PARENT_MEETINGS_COLLECTION
      : MEETINGS_COLLECTION;
  const docPath = `${targetCollection}/${id}`;
  const payload = {
    title: safeTitle,
    meetingDate: safeDate,
    academicYear: safeYear,
    location: safeLocation,
    agendaSummary: safeAgenda,
    meetUrl: safeMeetUrl,
    linkedPostSlug: safeSlug,
    audience: safeAudience,
    isOpen: Boolean(input.isOpen),
    checkinStartAt: startMs !== null ? Timestamp.fromMillis(startMs) : null,
    checkinEndAt: endMs !== null ? Timestamp.fromMillis(endMs) : null,
    createdByName: safeCreatorName,
    createdByUid: currentUser.uid.slice(0, 128),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };

  try {
    await setDoc(doc(db, targetCollection, id), payload);
    return id;
  } catch (error) {
    try {
      handleFirestoreError(error, OperationType.CREATE, docPath);
    } catch (wrapped) {
      throw formatFriendlyMeetingError(wrapped, '建立簽到場次失敗。');
    }
  }
}

async function resolveMeetingCollectionForAdmin(
  meetingId: string,
  audienceHint?: MeetingAudience,
): Promise<string> {
  if (audienceHint === 'parent') {
    const dedicatedSnap = await getDoc(
      doc(db, PARENT_MEETINGS_COLLECTION, meetingId),
    );
    if (dedicatedSnap.exists()) return PARENT_MEETINGS_COLLECTION;
    return MEETINGS_COLLECTION;
  }
  const parentSnap = await getDoc(
    doc(db, PARENT_MEETINGS_COLLECTION, meetingId),
  );
  if (parentSnap.exists()) return PARENT_MEETINGS_COLLECTION;
  return MEETINGS_COLLECTION;
}

export async function updateMeetingSession(
  meetingId: string,
  updates: Partial<CreateMeetingSessionInput>,
  audienceHint?: MeetingAudience,
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
    if (!t) throw new Error('場次名稱不可為空。');
    sanitized.title = t;
  }
  if (updates.meetingDate !== undefined) {
    const d = truncateChars(updates.meetingDate, 40);
    if (d.length < 4) throw new Error('請填寫有效的活動日期時間。');
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
  if (updates.audience !== undefined) {
    sanitized.audience = updates.audience === 'parent' ? 'parent' : 'teacher';
  }
  if (updates.isOpen !== undefined) {
    sanitized.isOpen = Boolean(updates.isOpen);
  }

  if (
    updates.checkinStartAtMs !== undefined ||
    updates.checkinEndAtMs !== undefined
  ) {
    const startMs =
      typeof updates.checkinStartAtMs === 'number' &&
      Number.isFinite(updates.checkinStartAtMs)
        ? updates.checkinStartAtMs
        : null;
    const endMs =
      typeof updates.checkinEndAtMs === 'number' &&
      Number.isFinite(updates.checkinEndAtMs)
        ? updates.checkinEndAtMs
        : null;
    if (startMs !== null && endMs !== null && endMs <= startMs) {
      throw new Error('簽名截止時間必須晚於開放開始時間。');
    }
    if (updates.checkinStartAtMs !== undefined) {
      sanitized.checkinStartAt =
        startMs !== null ? Timestamp.fromMillis(startMs) : null;
    }
    if (updates.checkinEndAtMs !== undefined) {
      sanitized.checkinEndAt =
        endMs !== null ? Timestamp.fromMillis(endMs) : null;
    }
  }

  const targetCollection = await resolveMeetingCollectionForAdmin(
    meetingId,
    audienceHint,
  );
  const docPath = `${targetCollection}/${meetingId}`;
  try {
    await updateDoc(doc(db, targetCollection, meetingId), sanitized);
  } catch (error) {
    try {
      handleFirestoreError(error, OperationType.UPDATE, docPath);
    } catch (wrapped) {
      throw formatFriendlyMeetingError(wrapped, '更新場次設定失敗。');
    }
  }
}

async function batchDeleteDocumentRefs(refs: DocumentReference[]): Promise<void> {
  const BATCH_LIMIT = 400;
  for (let i = 0; i < refs.length; i += BATCH_LIMIT) {
    const chunk = refs.slice(i, i + BATCH_LIMIT);
    const batch = writeBatch(db);
    for (const ref of chunk) {
      batch.delete(ref);
    }
    await batch.commit();
  }
}

export async function deleteMeetingSession(
  meetingId: string,
  audienceHint?: MeetingAudience,
): Promise<void> {
  if (!auth.currentUser) {
    throw new Error('請先登入管理教師帳號。');
  }
  const safeMeetingId = meetingId.trim();
  const targetCollection = await resolveMeetingCollectionForAdmin(
    safeMeetingId,
    audienceHint,
  );
  const docPath = `${targetCollection}/${safeMeetingId}`;
  try {
    const [teacherSnap, parentSnap, dedicatedSnap, legacySnap] =
      await Promise.all([
        getDocs(
          query(
            collection(db, CHECKINS_COLLECTION),
            where('meetingId', '==', safeMeetingId),
          ),
        ),
        getDocs(
          query(
            collection(db, PARENT_CHECKINS_COLLECTION),
            where('meetingId', '==', safeMeetingId),
          ),
        ),
        getDoc(doc(db, PARENT_MEETINGS_COLLECTION, safeMeetingId)),
        getDoc(doc(db, MEETINGS_COLLECTION, safeMeetingId)),
      ]);
    const refsToDelete: DocumentReference[] = [
      ...teacherSnap.docs.map((snap) => snap.ref),
      ...parentSnap.docs.map((snap) => snap.ref),
    ];
    if (dedicatedSnap.exists()) {
      refsToDelete.push(dedicatedSnap.ref);
    }
    if (legacySnap.exists()) {
      refsToDelete.push(legacySnap.ref);
    }
    await batchDeleteDocumentRefs(refsToDelete);
  } catch (error) {
    try {
      handleFirestoreError(error, OperationType.DELETE, docPath);
    } catch (wrapped) {
      throw formatFriendlyMeetingError(
        wrapped,
        '刪除場次及關聯簽到紀錄失敗。',
      );
    }
  }
}

export async function migrateLegacyParentMeetingsForAdmin(): Promise<number> {
  const currentUser = auth.currentUser;
  if (!currentUser) return 0;

  try {
    const legacySnap = await getDocs(
      query(
        collection(db, MEETINGS_COLLECTION),
        where('audience', '==', 'parent'),
      ),
    );
    if (legacySnap.empty) return 0;

    let migratedCount = 0;
    for (const snap of legacySnap.docs) {
      const data = snap.data();
      const targetRef = doc(db, PARENT_MEETINGS_COLLECTION, snap.id);
      const existingDedicated = await getDoc(targetRef);
      if (!existingDedicated.exists()) {
        await setDoc(targetRef, {
          title: truncateChars(String(data.title ?? ''), 160) || '學校日家長簽到',
          meetingDate: truncateChars(String(data.meetingDate ?? ''), 40) || '2026-01-01',
          academicYear: truncateChars(String(data.academicYear ?? '114 學年度'), 40),
          location: truncateChars(String(data.location ?? ''), 160),
          agendaSummary: truncateChars(String(data.agendaSummary ?? ''), 1000),
          meetUrl: truncateChars(String(data.meetUrl ?? ''), 500),
          linkedPostSlug: truncateChars(String(data.linkedPostSlug ?? ''), 160),
          audience: 'parent',
          isOpen: Boolean(data.isOpen),
          checkinStartAt: data.checkinStartAt ?? null,
          checkinEndAt: data.checkinEndAt ?? null,
          createdByName: truncateChars(
            String(
              data.createdByName ||
                currentUser.displayName ||
                currentUser.email ||
                '領域召集教師',
            ),
            100,
          ),
          createdByUid: currentUser.uid.slice(0, 128),
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      }
      await deleteDoc(snap.ref);
      migratedCount += 1;
    }
    return migratedCount;
  } catch {
    return 0;
  }
}

export async function cleanupOrphanedCheckinsForAdmin(
  candidateMeetingIds: string[],
): Promise<number> {
  if (!auth.currentUser || candidateMeetingIds.length === 0) {
    return 0;
  }

  const uniqueIds = Array.from(
    new Set(candidateMeetingIds.map((id) => id.trim()).filter(Boolean)),
  );
  let deletedCount = 0;

  for (const meetingId of uniqueIds) {
    try {
      const [teacherDocSnap, parentDocSnap] = await Promise.all([
        getDoc(doc(db, MEETINGS_COLLECTION, meetingId)),
        getDoc(doc(db, PARENT_MEETINGS_COLLECTION, meetingId)),
      ]);
      if (teacherDocSnap.exists() || parentDocSnap.exists()) {
        continue;
      }

      const [orphanTeacherSnap, orphanParentSnap] = await Promise.all([
        getDocs(
          query(
            collection(db, CHECKINS_COLLECTION),
            where('meetingId', '==', meetingId),
          ),
        ),
        getDocs(
          query(
            collection(db, PARENT_CHECKINS_COLLECTION),
            where('meetingId', '==', meetingId),
          ),
        ),
      ]);
      const refs = [
        ...orphanTeacherSnap.docs.map((snap) => snap.ref),
        ...orphanParentSnap.docs.map((snap) => snap.ref),
      ];
      if (refs.length === 0) {
        continue;
      }
      await batchDeleteDocumentRefs(refs);
      deletedCount += refs.length;
    } catch {
      // Best-effort cleanup of historical orphaned records; ignore transient read/delete failures
    }
  }

  return deletedCount;
}

export async function submitMeetingCheckin(params: {
  meetingId: string;
  meetingTitle: string;
  roleOrNote: string;
  signatureDataUrl: string;
  customDisplayName?: string;
}): Promise<string> {
  const currentUser = auth.currentUser;
  if (!currentUser || !currentUser.email) {
    throw new Error('請先登入 @hmes.tp.edu.tw 校內帳號後再進行會議簽到。');
  }

  if (!isValidSignatureDataUrl(params.signatureDataUrl)) {
    throw new Error('請先於簽名框內完成親自手寫簽名後再送出簽到。');
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
    signatureDataUrl: params.signatureDataUrl,
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
        '會議簽到失敗，請確認此場次目前仍為「開放簽名中」且已完成親筆簽名。',
      );
    }
  }
}

export async function submitParentCheckin(params: {
  meetingId: string;
  meetingTitle: string;
  studentClassAndSeat: string;
  parentName: string;
  relationshipOrNote: string;
  signatureDataUrl: string;
}): Promise<{id: string; checkedInAtMs: number}> {
  const safeMeetingId = params.meetingId.trim().slice(0, 90);
  if (!safeMeetingId) {
    throw new Error('找不到對應的學校日活動場次。');
  }

  const safeStudent = truncateChars(params.studentClassAndSeat, 80);
  const safeParent = truncateChars(params.parentName, 80);
  const safeRelation = truncateChars(params.relationshipOrNote || '', 120);
  const safeTitle =
    truncateChars(params.meetingTitle || '學校日家長簽到', 160) ||
    '學校日家長簽到';

  if (!safeStudent) {
    throw new Error('請填寫學生班級座號或學生姓名。');
  }
  if (!safeParent) {
    throw new Error('請填寫家長姓名或稱謂（例如：王爸爸、陳媽媽）。');
  }
  if (!isValidSignatureDataUrl(params.signatureDataUrl)) {
    throw new Error('請先於簽名框內親筆簽名後再送出簽到。');
  }

  const checkinId = generateParentCheckinId();
  const docPath = `${PARENT_CHECKINS_COLLECTION}/${checkinId}`;
  const payload = {
    meetingId: safeMeetingId,
    meetingTitle: safeTitle,
    studentClassAndSeat: safeStudent,
    parentName: safeParent,
    relationshipOrNote: safeRelation,
    signatureDataUrl: params.signatureDataUrl,
    checkedInAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };

  try {
    await setDoc(doc(db, PARENT_CHECKINS_COLLECTION, checkinId), payload);
    return {id: checkinId, checkedInAtMs: Date.now()};
  } catch (error) {
    try {
      handleFirestoreError(error, OperationType.CREATE, docPath);
    } catch (wrapped) {
      throw formatFriendlyMeetingError(
        wrapped,
        '送出家長簽到失敗，請確認本場次目前仍為「開放簽名中」且已完成親筆簽名。',
      );
    }
  }
}

export async function deleteParentCheckinForAdmin(
  checkinId: string,
): Promise<void> {
  if (!auth.currentUser) {
    throw new Error('請先登入管理教師帳號。');
  }
  const docPath = `${PARENT_CHECKINS_COLLECTION}/${checkinId}`;
  try {
    await deleteDoc(doc(db, PARENT_CHECKINS_COLLECTION, checkinId));
  } catch (error) {
    try {
      handleFirestoreError(error, OperationType.DELETE, docPath);
    } catch (wrapped) {
      throw formatFriendlyMeetingError(wrapped, '刪除家長簽到紀錄失敗。');
    }
  }
}

export async function updateMyCheckinNote(params: {
  checkinId: string;
  roleOrNote: string;
  userName?: string;
  signatureDataUrl?: string;
}): Promise<void> {
  const currentUser = auth.currentUser;
  if (!currentUser) {
    throw new Error('請先登入帳號後再修改簽到資料。');
  }

  const updates: Record<string, unknown> = {
    roleOrNote: truncateChars(params.roleOrNote || '', 120),
    updatedAt: serverTimestamp(),
  };
  if (params.userName !== undefined && params.userName.trim()) {
    updates.userName = truncateChars(params.userName, 100);
  }
  if (params.signatureDataUrl !== undefined) {
    if (!isValidSignatureDataUrl(params.signatureDataUrl)) {
      throw new Error('手寫簽名影像格式無效，請重新簽署後儲存。');
    }
    updates.signatureDataUrl = params.signatureDataUrl;
  }

  const docPath = `${CHECKINS_COLLECTION}/${params.checkinId}`;
  try {
    await updateDoc(doc(db, CHECKINS_COLLECTION, params.checkinId), updates);
  } catch (error) {
    try {
      handleFirestoreError(error, OperationType.UPDATE, docPath);
    } catch (wrapped) {
      throw formatFriendlyMeetingError(wrapped, '更新簽到備註或簽名失敗。');
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
  teacherCheckins: MeetingCheckin[],
  parentCheckins: ParentCheckin[] = [],
): string {
  if (meeting.audience === 'parent') {
    const headers = [
      '序號',
      '活動名稱',
      '活動時間',
      '學生班級 / 座號 / 姓名',
      '家長姓名或稱謂',
      '關係 / 備註',
      '親自手寫簽名狀態',
      '簽到時間',
    ];
    const rows = parentCheckins.map((item, idx) => {
      const dt = new Date(item.checkedInAtMs).toLocaleString('zh-TW', {
        hour12: false,
      });
      return [
        String(idx + 1),
        meeting.title,
        meeting.meetingDate,
        item.studentClassAndSeat,
        item.parentName,
        item.relationshipOrNote,
        isValidSignatureDataUrl(item.signatureDataUrl)
          ? '已親自手寫簽名'
          : '尚未附簽名',
        dt,
      ]
        .map(escapeSafeCsvCell)
        .join(',');
    });
    return '\uFEFF' + [headers.map(escapeSafeCsvCell).join(','), ...rows].join('\n');
  }

  const headers = [
    '序號',
    '會議名稱',
    '會議時間',
    '教師姓名',
    '校內信箱',
    '職務或年段備註',
    '親自手寫簽名狀態',
    '簽到時間',
  ];
  const rows = teacherCheckins.map((item, idx) => {
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
      isValidSignatureDataUrl(item.signatureDataUrl)
        ? '已親自手寫簽名'
        : '尚未附簽名',
      dt,
    ]
      .map(escapeSafeCsvCell)
      .join(',');
  });

  return '\uFEFF' + [headers.map(escapeSafeCsvCell).join(','), ...rows].join('\n');
}

function escapeHtml(raw: string): string {
  return String(raw ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function buildPrintableMeetingSheetHtml(
  meeting: MeetingSession,
  teacherCheckins: MeetingCheckin[],
  parentCheckins: ParentCheckin[] = [],
): string {
  const isParent = meeting.audience === 'parent';
  const count = isParent ? parentCheckins.length : teacherCheckins.length;

  const rowsHtml = isParent
    ? parentCheckins
        .map((item, idx) => {
          const dt = new Date(item.checkedInAtMs).toLocaleString('zh-TW', {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            hour12: false,
          });
          const sigCell = isValidSignatureDataUrl(item.signatureDataUrl)
            ? `<img src="${item.signatureDataUrl}" alt="${escapeHtml(item.parentName)}親筆簽名" class="sig-img" />`
            : '<span class="muted">（尚未附手寫簽名）</span>';
          return `
        <tr>
          <td class="num">${idx + 1}</td>
          <td class="name">${escapeHtml(item.studentClassAndSeat)}</td>
          <td class="name">${escapeHtml(item.parentName)}</td>
          <td class="note">${escapeHtml(item.relationshipOrNote || '—')}</td>
          <td class="sig">${sigCell}</td>
          <td class="time">${escapeHtml(dt)}</td>
        </tr>`;
        })
        .join('\n')
    : teacherCheckins
        .map((item, idx) => {
          const dt = new Date(item.checkedInAtMs).toLocaleString('zh-TW', {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            hour12: false,
          });
          const sigCell = isValidSignatureDataUrl(item.signatureDataUrl)
            ? `<img src="${item.signatureDataUrl}" alt="${escapeHtml(item.userName)}親筆簽名" class="sig-img" />`
            : '<span class="muted">（尚未附手寫簽名）</span>';
          return `
        <tr>
          <td class="num">${idx + 1}</td>
          <td class="name">${escapeHtml(item.userName)}</td>
          <td class="email">${escapeHtml(item.userEmail)}</td>
          <td class="note">${escapeHtml(item.roleOrNote || '—')}</td>
          <td class="sig">${sigCell}</td>
          <td class="time">${escapeHtml(dt)}</td>
        </tr>`;
        })
        .join('\n');

  const schoolBanner = isParent
    ? '臺北市西門國小 · 學校日／親師活動家長出席簽到表'
    : '臺北市西門國小數學領域教師社群 · PesMath 會議出席簽到表';
  const countUnit = isParent ? '位家長' : '位教師';
  const colHeaders = isParent
    ? ['學生班級 / 姓名', '家長姓名', '關係 / 備註']
    : ['教師姓名', '校內帳號信箱', '職務 / 年段備註'];

  return `<!DOCTYPE html>
<html lang="zh-Hant">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>簽到表｜${escapeHtml(meeting.title)}</title>
  <style>
    @page { size: A4 portrait; margin: 14mm; }
    * { box-sizing: border-box; }
    body {
      font-family: "Noto Sans TC", "PingFang TC", "Microsoft JhengHei", sans-serif;
      color: #1c1917;
      background: #f5f5f4;
      margin: 0;
      padding: 20px;
    }
    .toolbar {
      max-width: 900px;
      margin: 0 auto 14px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 12px;
      background: #ffffff;
      border: 1px solid #d6d3d1;
      border-radius: 10px;
      padding: 10px 16px;
    }
    .toolbar-btn {
      background: #1e3a8a;
      color: #ffffff;
      border: none;
      border-radius: 8px;
      padding: 8px 16px;
      font-size: 13px;
      font-weight: 600;
      cursor: pointer;
    }
    .sheet {
      max-width: 900px;
      margin: 0 auto;
      background: #ffffff;
      border: 1px solid #d6d3d1;
      border-radius: 10px;
      padding: 24px 28px;
    }
    .school { font-size: 12px; color: #1e3a8a; font-weight: 700; letter-spacing: 0.08em; }
    h1 { font-size: 20px; margin: 6px 0 12px; }
    .meta {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 6px 16px;
      font-size: 12px;
      color: #44403c;
      background: #fafaf9;
      border: 1px solid #e7e5e4;
      border-radius: 8px;
      padding: 10px 14px;
      margin-bottom: 16px;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      font-size: 12px;
    }
    th, td {
      border: 1px solid #d6d3d1;
      padding: 8px 10px;
      vertical-align: middle;
      text-align: left;
    }
    th {
      background: #f5f5f4;
      font-weight: 700;
      color: #292524;
    }
    td.num { width: 42px; text-align: center; font-variant-numeric: tabular-nums; }
    td.name { width: 140px; font-weight: 600; }
    td.email { width: 190px; font-size: 11px; color: #57534e; word-break: break-all; }
    td.note { width: 140px; }
    td.sig { width: 170px; background: #ffffff; text-align: center; }
    td.time { width: 125px; font-size: 11px; font-variant-numeric: tabular-nums; }
    .sig-img {
      max-width: 150px;
      max-height: 54px;
      object-fit: contain;
      display: inline-block;
    }
    .muted { color: #a8a29e; font-size: 11px; }
    @media print {
      body { background: #ffffff; padding: 0; }
      .toolbar { display: none; }
      .sheet { border: none; border-radius: 0; padding: 0; max-width: none; }
    }
  </style>
</head>
<body>
  <div class="toolbar">
    <span style="font-size:13px;color:#44403c;">${escapeHtml(schoolBanner)}（可直接列印或存為 PDF）</span>
    <button type="button" class="toolbar-btn" onclick="window.print()">列印 / 另存為 PDF</button>
  </div>
  <div class="sheet">
    <div class="school">${escapeHtml(schoolBanner)}</div>
    <h1>${escapeHtml(meeting.title)}</h1>
    <div class="meta">
      <div><strong>學年度：</strong>${escapeHtml(meeting.academicYear)}</div>
      <div><strong>活動時間：</strong>${escapeHtml(meeting.meetingDate)}</div>
      <div><strong>地點：</strong>${escapeHtml(meeting.location || '西門國小')}</div>
      <div><strong>簽到人數：</strong>${count} ${countUnit}</div>
    </div>
    <table>
      <thead>
        <tr>
          <th style="text-align:center;">#</th>
          <th>${escapeHtml(colHeaders[0])}</th>
          <th>${escapeHtml(colHeaders[1])}</th>
          <th>${escapeHtml(colHeaders[2])}</th>
          <th style="text-align:center;">親自手寫簽名</th>
          <th>簽到時間</th>
        </tr>
      </thead>
      <tbody>
        ${rowsHtml}
      </tbody>
    </table>
  </div>
</body>
</html>`;
}
