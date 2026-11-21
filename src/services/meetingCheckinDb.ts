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
        '會議簽到失敗，請確認此場次目前仍為「開放簽到中」且已完成親筆簽名。',
      );
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
  checkins: MeetingCheckin[],
): string {
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
  checkins: MeetingCheckin[],
): string {
  const rowsHtml = checkins
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

  return `<!DOCTYPE html>
<html lang="zh-Hant">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>會議簽到表｜${escapeHtml(meeting.title)}</title>
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
    td.name { width: 110px; font-weight: 600; }
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
    <span style="font-size:13px;color:#44403c;">西門國小數學社群 · 含親筆手寫簽名簽到表（可直接列印或存為 PDF）</span>
    <button type="button" class="toolbar-btn" onclick="window.print()">列印 / 另存為 PDF</button>
  </div>
  <div class="sheet">
    <div class="school">臺北市西門國小數學領域教師社群 · PesMath 會議出席簽到表</div>
    <h1>${escapeHtml(meeting.title)}</h1>
    <div class="meta">
      <div><strong>學年度：</strong>${escapeHtml(meeting.academicYear)}</div>
      <div><strong>會議時間：</strong>${escapeHtml(meeting.meetingDate)}</div>
      <div><strong>會議地點：</strong>${escapeHtml(meeting.location || '校內共備會議')}</div>
      <div><strong>簽到人數：</strong>${checkins.length} 位教師</div>
    </div>
    <table>
      <thead>
        <tr>
          <th style="text-align:center;">#</th>
          <th>教師姓名</th>
          <th>校內帳號信箱</th>
          <th>職務 / 年段備註</th>
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
