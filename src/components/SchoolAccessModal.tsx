import React from 'react';
import {User} from 'firebase/auth';
import {
  AlertCircle,
  CalendarCheck,
  CheckCircle2,
  Lock,
  LogOut,
  ShieldCheck,
  Sheet,
  X,
} from 'lucide-react';
import {SCHOOL_DOMAIN} from '../services/googleAuth';

interface SchoolAccessModalProps {
  isOpen: boolean;
  reasonTitle?: string;
  reasonDescription?: string;
  user: User | null;
  isSchoolAuthorized: boolean;
  isTeacherAdmin: boolean;
  isSigningIn: boolean;
  authError: string | null;
  onClearAuthError: () => void;
  onSchoolSignIn: () => void;
  onAdminSignIn: () => void;
  onSignOut: () => void;
  onClose: () => void;
}

export const SchoolAccessModal: React.FC<SchoolAccessModalProps> = ({
  isOpen,
  reasonTitle,
  reasonDescription,
  user,
  isSchoolAuthorized,
  isTeacherAdmin,
  isSigningIn,
  authError,
  onClearAuthError,
  onSchoolSignIn,
  onAdminSignIn,
  onSignOut,
  onClose,
}) => {
  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 overflow-y-auto bg-stone-950/55 backdrop-blur-xs flex items-center justify-center p-3 sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-labelledby="school-access-modal-title"
      onClick={onClose}
    >
      <div
        className="w-full max-w-xl bg-[#FBF9F5] border border-stone-200 rounded-2xl shadow-2xl overflow-hidden my-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-5 sm:px-6 py-4 bg-white border-b border-stone-200 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-9 h-9 rounded-lg bg-[#1E3A8A]/10 text-[#1E3A8A] flex items-center justify-center shrink-0">
              {isSchoolAuthorized ? (
                <ShieldCheck className="w-5 h-5" />
              ) : (
                <Lock className="w-5 h-5" />
              )}
            </div>
            <div className="min-w-0">
              <p className="text-[11px] font-mono-tabular uppercase tracking-wider text-[#1E3A8A] font-semibold">
                HMES Community Access
              </p>
              <h2
                id="school-access-modal-title"
                className="font-editorial text-base sm:text-lg font-bold text-stone-950 truncate"
              >
                {reasonTitle || '西門社群教師驗證與校內權限'}
              </h2>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="關閉視窗"
            className="p-2 text-stone-500 hover:text-stone-900 rounded-lg hover:bg-stone-100 transition-colors shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 sm:p-6 space-y-5">
          <p className="text-xs sm:text-sm text-stone-700 leading-relaxed">
            {reasonDescription ||
              `為保護校內教師社群會議資料、限定教案與簽到紀錄，網站部分選項與專欄已上鎖。請使用 @${SCHOOL_DOMAIN} 學校帳號登入，即可立即解鎖觀看與使用會議簽到功能。`}
          </p>

          {isSchoolAuthorized && user ? (
            <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-950 space-y-2 text-xs sm:text-sm">
              <div className="flex items-center gap-2 font-semibold">
                <CheckCircle2 className="w-4 h-4 text-emerald-700 shrink-0" />
                <span>
                  已完成校內社群帳號驗證
                  {isTeacherAdmin ? '（管理教師權限）' : `（@${SCHOOL_DOMAIN}）`}
                </span>
              </div>
              <p className="text-xs text-emerald-900">
                目前登入：<span className="font-mono-tabular font-semibold">{user.email}</span>
              </p>
            </div>
          ) : user ? (
            <div
              role="alert"
              className="p-4 rounded-xl bg-amber-50 border border-amber-200 text-amber-950 text-xs sm:text-sm flex flex-col sm:flex-row sm:items-center justify-between gap-3"
            >
              <div className="flex items-start gap-2.5 min-w-0">
                <AlertCircle className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
                <div className="min-w-0">
                  <div className="font-semibold">目前登入帳號非校內驗證網域</div>
                  <div className="mt-0.5 text-amber-900 break-all">
                    您目前登入的是 <span className="font-mono-tabular font-semibold">{user.email}</span>，需切換為{' '}
                    <span className="font-mono-tabular font-semibold">@{SCHOOL_DOMAIN}</span> 帳號或授權管理員才能解鎖。
                  </div>
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
          ) : null}

          {authError && (
            <div
              role="alert"
              className="p-3.5 rounded-xl bg-red-50 border border-red-200 text-red-900 text-xs flex items-start justify-between gap-3"
            >
              <div className="flex items-start gap-2 min-w-0">
                <AlertCircle className="w-4 h-4 text-red-700 shrink-0 mt-0.5" />
                <span className="leading-relaxed break-words">{authError}</span>
              </div>
              <button
                type="button"
                onClick={onClearAuthError}
                className="text-red-700 hover:underline shrink-0"
              >
                關閉
              </button>
            </div>
          )}

          {!isSchoolAuthorized && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              <div className="p-4 rounded-xl bg-white border border-[#1E3A8A]/25 flex flex-col justify-between gap-4">
                <div className="space-y-1.5">
                  <div className="flex items-center gap-1.5 font-bold text-stone-950 text-sm">
                    <CalendarCheck className="w-4 h-4 text-[#1E3A8A] shrink-0" />
                    <span>方法一：社群教師登入</span>
                  </div>
                  <p className="text-xs text-stone-600 leading-relaxed">
                    使用 <span className="font-mono-tabular font-semibold text-[#1E3A8A]">@{SCHOOL_DOMAIN}</span> 學校帳號，即可解鎖校內文章並進行教師會議簽到。
                  </p>
                </div>
                <button
                  type="button"
                  onClick={onSchoolSignIn}
                  disabled={isSigningIn}
                  className="w-full min-h-[42px] px-3.5 py-2 text-xs sm:text-sm font-semibold text-white bg-[#1E3A8A] hover:bg-[#172554] disabled:opacity-60 rounded-xl transition-colors inline-flex items-center justify-center gap-1.5"
                >
                  <ShieldCheck className="w-4 h-4 shrink-0" />
                  <span>{isSigningIn ? '登入驗證中...' : `@${SCHOOL_DOMAIN} 教師登入`}</span>
                </button>
              </div>

              <div className="p-4 rounded-xl bg-white border border-stone-200 flex flex-col justify-between gap-4">
                <div className="space-y-1.5">
                  <div className="flex items-center gap-1.5 font-bold text-stone-950 text-sm">
                    <Sheet className="w-4 h-4 text-stone-700 shrink-0" />
                    <span>方法二：網站管理員登入</span>
                  </div>
                  <p className="text-xs text-stone-600 leading-relaxed">
                    限授權管理員使用，可開啟會議／學校日場次、產生簽到 QR Code、匯出 PDF 與編輯網站。
                  </p>
                </div>
                <button
                  type="button"
                  onClick={onAdminSignIn}
                  disabled={isSigningIn}
                  className="w-full min-h-[42px] px-3.5 py-2 text-xs sm:text-sm font-semibold text-stone-800 bg-[#FBF9F5] border border-stone-300 hover:bg-stone-100 disabled:opacity-60 rounded-xl transition-colors inline-flex items-center justify-center gap-1.5"
                >
                  <Sheet className="w-4 h-4 text-[#1E3A8A] shrink-0" />
                  <span>管理員帳號登入</span>
                </button>
              </div>
            </div>
          )}

          {isSchoolAuthorized && (
            <div className="flex flex-wrap items-center justify-end gap-2.5 pt-1">
              {!isTeacherAdmin && (
                <button
                  type="button"
                  onClick={onAdminSignIn}
                  disabled={isSigningIn}
                  className="min-h-[40px] px-4 py-2 text-xs font-semibold text-stone-800 bg-white border border-stone-300 hover:bg-stone-50 disabled:opacity-60 rounded-xl transition-colors inline-flex items-center justify-center gap-1.5"
                >
                  <Sheet className="w-4 h-4 text-[#1E3A8A] shrink-0" />
                  <span>切換為管理員後台授權</span>
                </button>
              )}
              {user && (
                <button
                  type="button"
                  onClick={onSignOut}
                  className="min-h-[40px] px-3.5 py-2 text-xs font-medium text-stone-600 bg-stone-100 hover:bg-stone-200 rounded-xl transition-colors inline-flex items-center justify-center gap-1.5"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  <span>登出</span>
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
