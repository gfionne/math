import {initializeApp, getApps, getApp} from 'firebase/app';
import {
  getAuth,
  signInWithPopup,
  GoogleAuthProvider,
  onAuthStateChanged,
  User,
} from 'firebase/auth';
import {doc, getDoc, getFirestore} from 'firebase/firestore';
import firebaseConfig from '../../firebase-applet-config.json';

export const app =
  getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);

export const OWNER_ADMIN_EMAIL = 'g.fionne@gmail.com';
export const SCHOOL_DOMAIN = 'hmes.tp.edu.tw';
export const CLASS_403_ADMIN_EMAILS = [
  'g.fionne@gmail.com',
  'pes@hmes.tp.edu.tw',
] as const;

const provider = new GoogleAuthProvider();
provider.setCustomParameters({
  prompt: 'select_account',
});

// Combined Google Workspace scopes (Google Sheets database + Google Drive file upload)
export const WORKSPACE_SCOPES = [
  'https://www.googleapis.com/auth/spreadsheets',
  'https://www.googleapis.com/auth/drive.file',
];
export const SHEETS_SCOPES = WORKSPACE_SCOPES;
for (const scope of WORKSPACE_SCOPES) {
  provider.addScope(scope);
}

// Clean Google provider with zero Workspace scopes for @hmes.tp.edu.tw students
const studentProvider = new GoogleAuthProvider();
studentProvider.setCustomParameters({
  hd: SCHOOL_DOMAIN,
  prompt: 'select_account',
});

// In-memory cache ONLY (never stored in localStorage/sessionStorage)
let cachedAccessToken: string | null = null;
let isSigningIn = false;

export function isOwnerAdminEmail(email?: string | null): boolean {
  return (email ?? '').trim().toLowerCase() === OWNER_ADMIN_EMAIL;
}

export function isClass403AdminEmail(email?: string | null): boolean {
  const normalized = (email ?? '').trim().toLowerCase();
  return (CLASS_403_ADMIN_EMAILS as readonly string[]).includes(normalized);
}

export function isHmesStudentEmail(email?: string | null): boolean {
  const normalized = (email ?? '').trim().toLowerCase();
  return /^[^@]+@hmes\.tp\.edu\.tw$/.test(normalized);
}

export async function checkIsTeacherAdmin(user: User | null): Promise<boolean> {
  if (!user || !user.emailVerified) return false;
  if (isOwnerAdminEmail(user.email)) return true;
  try {
    const snap = await getDoc(doc(db, 'admins', user.uid));
    return snap.exists();
  } catch {
    return false;
  }
}

export const initAuth = (
  onAuthSuccess?: (user: User, token: string) => void,
  onAuthFailure?: (user: User | null) => void,
) => {
  return onAuthStateChanged(auth, (user: User | null) => {
    if (user) {
      if (cachedAccessToken) {
        onAuthSuccess?.(user, cachedAccessToken);
      } else if (!isSigningIn) {
        cachedAccessToken = null;
        onAuthFailure?.(user);
      }
    } else {
      cachedAccessToken = null;
      onAuthFailure?.(null);
    }
  });
};

export const googleSignIn = async (): Promise<{
  user: User;
  accessToken: string;
} | null> => {
  try {
    isSigningIn = true;
    const result = await signInWithPopup(auth, provider);
    const credential = GoogleAuthProvider.credentialFromResult(result);
    if (!credential?.accessToken) {
      throw new Error('未能取得 Google Workspace 授權存取權杖，請再試一次。');
    }
    cachedAccessToken = credential.accessToken;
    return {user: result.user, accessToken: cachedAccessToken};
  } finally {
    isSigningIn = false;
  }
};

export const studentGoogleSignIn = async (): Promise<User> => {
  try {
    isSigningIn = true;
    const result = await signInWithPopup(auth, studentProvider);
    const signedUser = result.user;
    const isTeacher = await checkIsTeacherAdmin(signedUser);
    const isSchoolStudent = isHmesStudentEmail(signedUser.email);

    if (!isTeacher && !isSchoolStudent) {
      const emailLabel = signedUser.email || '未知帳號';
      await auth.signOut();
      cachedAccessToken = null;
      throw new Error(
        `您目前選擇的帳號（${emailLabel}）非 @${SCHOOL_DOMAIN} 學校網域帳號，請改用 @${SCHOOL_DOMAIN} 信箱重新登入。`,
      );
    }

    cachedAccessToken = null;
    return signedUser;
  } finally {
    isSigningIn = false;
  }
};

export const getAccessToken = (): string | null => cachedAccessToken;

export const logout = async (): Promise<void> => {
  await auth.signOut();
  cachedAccessToken = null;
};
