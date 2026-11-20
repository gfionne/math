import React, {useEffect, useMemo, useRef, useState} from 'react';
import {User} from 'firebase/auth';
import {
  ArrowLeft,
  ExternalLink,
  GraduationCap,
  MonitorPlay,
  X,
} from 'lucide-react';
import {XimenGalleryPanel} from './XimenGalleryPanel';

export type XimenScratchTab = 'map' | 'gallery' | 'blocks' | 'naming';
export type Class403Tab =
  | 'agenda'
  | 'news'
  | 'resources'
  | 'contact'
  | 'comments';
export type InteractiveStageTab = XimenScratchTab | Class403Tab;

const XIMEN_TABS: Array<{id: XimenScratchTab; label: string}> = [
  {id: 'map', label: '互動商圈地圖'},
  {id: 'gallery', label: '專案圖庫中心'},
  {id: 'blocks', label: 'Scratch 積木教學'},
  {id: 'naming', label: '命名規範與檢核'},
];

const CLASS403_TABS: Array<{id: Class403Tab; label: string}> = [
  {id: 'agenda', label: '互動聯絡簿'},
  {id: 'news', label: '公告與行事曆'},
  {id: 'resources', label: '學習資源庫'},
  {id: 'contact', label: '聯絡與課表'},
  {id: 'comments', label: '班級留言板'},
];

const isXimenTab = (tab: string): tab is XimenScratchTab =>
  tab === 'map' || tab === 'gallery' || tab === 'blocks' || tab === 'naming';

const isClass403Tab = (tab: string): tab is Class403Tab =>
  tab === 'agenda' ||
  tab === 'news' ||
  tab === 'resources' ||
  tab === 'contact' ||
  tab === 'comments';

interface InteractiveEmbedModalProps {
  isOpen: boolean;
  url: string;
  title: string;
  initialTab?: InteractiveStageTab;
  onClose: () => void;
  user: User | null;
  isTeacher: boolean;
  hasAccessToken: boolean;
  isSigningIn: boolean;
  authError: string | null;
  onClearAuthError: () => void;
  onTeacherSignIn: () => void;
  onStudentSignIn: () => void;
  onSignOut: () => void;
  hiddenOfficialAssetIds: string[];
  onUpdateHiddenOfficialAssets: (
    nextIds: string[],
  ) => Promise<{synced: boolean; errorMessage?: string}>;
}

function buildTabbedUrl(
  rawUrl: string,
  tab: string,
  mapBg?: {url: string; name: string} | null,
): string {
  try {
    const base =
      typeof window !== 'undefined' ? window.location.href : 'http://localhost/';
    const resolved = new URL(rawUrl, base);
    resolved.searchParams.set('tab', tab);
    if (tab === 'map' && mapBg?.url) {
      resolved.searchParams.set('mapBg', mapBg.url);
      resolved.searchParams.set('mapName', mapBg.name);
    } else {
      resolved.searchParams.delete('mapBg');
      resolved.searchParams.delete('mapName');
    }
    if (
      typeof window !== 'undefined' &&
      resolved.origin === window.location.origin
    ) {
      return `${resolved.pathname}${resolved.search}${resolved.hash}`;
    }
    return resolved.toString();
  } catch {
    return rawUrl;
  }
}

export const InteractiveEmbedModal: React.FC<InteractiveEmbedModalProps> = ({
  isOpen,
  url,
  title,
  initialTab = 'map',
  onClose,
  user,
  isTeacher,
  hasAccessToken,
  isSigningIn,
  authError,
  onClearAuthError,
  onTeacherSignIn,
  onStudentSignIn,
  onSignOut,
  hiddenOfficialAssetIds,
  onUpdateHiddenOfficialAssets,
}) => {
  const isXimenSite = useMemo(() => url.includes('ximen-scratch.html'), [url]);
  const isClass403Site = useMemo(() => url.includes('class-403.html'), [url]);

  const [activeTab, setActiveTab] = useState<XimenScratchTab>(
    isXimenTab(initialTab) ? initialTab : 'map',
  );
  const [activeClassTab, setActiveClassTab] = useState<Class403Tab>(
    isClass403Tab(initialTab) ? initialTab : 'agenda',
  );
  const [classIframeSeedTab, setClassIframeSeedTab] =
    useState<Class403Tab>('agenda');
  const [customMapBg, setCustomMapBg] = useState<{
    url: string;
    name: string;
  } | null>(null);
  const iframeRef = useRef<HTMLIFrameElement | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    if (isXimenSite) {
      setActiveTab(isXimenTab(initialTab) ? initialTab : 'map');
    } else if (isClass403Site) {
      const nextClassTab = isClass403Tab(initialTab) ? initialTab : 'agenda';
      setActiveClassTab(nextClassTab);
      setClassIframeSeedTab(nextClassTab);
    }
  }, [isOpen, initialTab, url, isXimenSite, isClass403Site]);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  useEffect(() => {
    if (!isOpen) return;
    const handleMessage = (event: MessageEvent) => {
      if (event.origin !== window.location.origin) return;
      const data = event.data as {type?: string; tab?: string} | null;
      if (data?.type === 'XIMEN_OPEN_TAB' && data.tab === 'gallery') {
        setActiveTab('gallery');
      }
      if (
        data?.type === 'CLASS403_TAB_CHANGED' &&
        typeof data.tab === 'string' &&
        isClass403Tab(data.tab)
      ) {
        setActiveClassTab(data.tab);
      }
    };
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [isOpen]);

  const handleSelectClassTab = (tab: Class403Tab) => {
    setActiveClassTab(tab);
    try {
      iframeRef.current?.contentWindow?.postMessage(
        {type: 'CLASS403_SWITCH_TAB', tab},
        window.location.origin,
      );
    } catch {
      setClassIframeSeedTab(tab);
    }
  };

  const iframeSrc = useMemo(() => {
    if (isXimenSite) {
      const safeTab = activeTab === 'gallery' ? 'map' : activeTab;
      return buildTabbedUrl(url, safeTab, customMapBg);
    }
    if (isClass403Site) {
      return buildTabbedUrl(url, classIframeSeedTab);
    }
    return url;
  }, [url, isXimenSite, isClass403Site, activeTab, customMapBg, classIframeSeedTab]);

  const standaloneHref = useMemo(() => {
    if (isXimenSite) {
      if (activeTab === 'gallery') {
        return './?ximen=gallery';
      }
      return iframeSrc;
    }
    if (isClass403Site) {
      return buildTabbedUrl(url, activeClassTab);
    }
    return url;
  }, [isXimenSite, isClass403Site, activeTab, activeClassTab, url, iframeSrc]);

  if (!isOpen || !url) return null;

  return (
    <div
      className="fixed inset-0 z-50 bg-stone-950/65 backdrop-blur-xs flex flex-col p-2 sm:p-4 md:p-5"
      role="dialog"
      aria-modal="true"
      aria-labelledby="interactive-embed-title"
      onClick={onClose}
    >
      <div
        className="w-full h-full max-w-[1440px] mx-auto bg-[#FBF9F5] border border-stone-300 rounded-xl shadow-2xl overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Top Control Bar */}
        <header className="px-4 sm:px-6 py-3 bg-white border-b border-stone-200 flex flex-wrap items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={onClose}
              className="min-h-[40px] px-3 py-1.5 text-xs sm:text-sm font-medium text-stone-700 hover:text-[#1E3A8A] hover:bg-stone-100 active:scale-[0.97] rounded-lg inline-flex items-center gap-1.5 transition-all whitespace-nowrap shrink-0"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>返回知識庫</span>
            </button>

            <div className="hidden sm:block h-4 w-px bg-stone-200 shrink-0" />

            <div className="flex items-center gap-2 min-w-0">
              {isClass403Site ? (
                <GraduationCap className="w-4 h-4 text-[#1E3A8A] shrink-0" />
              ) : (
                <MonitorPlay className="w-4 h-4 text-[#1E3A8A] shrink-0" />
              )}
              <h2
                id="interactive-embed-title"
                className="font-editorial text-sm sm:text-base font-semibold text-stone-950 truncate"
              >
                {title}
              </h2>
            </div>
          </div>

          {/* Direct Section Switcher for 西門 Scratch Learning Site */}
          {isXimenSite && (
            <nav
              aria-label="互動學習網分頁切換"
              className="flex items-center gap-1 p-1 bg-[#F7F4EE] border border-stone-200 rounded-lg overflow-x-auto max-w-full"
            >
              {XIMEN_TABS.map((tab) => {
                const isActive = activeTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setActiveTab(tab.id)}
                    className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all active:scale-[0.97] whitespace-nowrap shrink-0 ${
                      isActive
                        ? 'bg-white text-[#1E3A8A] font-semibold shadow-2xs'
                        : 'text-stone-600 hover:text-stone-950 hover:bg-white/60'
                    }`}
                  >
                    {tab.label}
                  </button>
                );
              })}
            </nav>
          )}

          {/* Direct Section Switcher for 403 Class Website */}
          {isClass403Site && (
            <nav
              aria-label="403班級網站分頁切換"
              className="flex items-center gap-1 p-1 bg-[#F7F4EE] border border-stone-200 rounded-lg overflow-x-auto max-w-full"
            >
              {CLASS403_TABS.map((tab) => {
                const isActive = activeClassTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => handleSelectClassTab(tab.id)}
                    className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all active:scale-[0.97] whitespace-nowrap shrink-0 ${
                      isActive
                        ? 'bg-white text-[#1E3A8A] font-semibold shadow-2xs'
                        : 'text-stone-600 hover:text-stone-950 hover:bg-white/60'
                    }`}
                  >
                    {tab.label}
                  </button>
                );
              })}
            </nav>
          )}

          <div className="flex items-center gap-2 shrink-0">
            {(!isXimenSite || activeTab !== 'gallery') && (
              <a
                href={standaloneHref}
                target="_blank"
                rel="noopener noreferrer"
                className="min-h-[40px] px-3.5 py-2 text-xs font-medium text-white bg-[#1E3A8A] rounded-lg hover:bg-[#172554] active:scale-[0.97] inline-flex items-center gap-1.5 transition-all whitespace-nowrap shrink-0"
              >
                <span>獨立分頁開啟</span>
                <ExternalLink className="w-3.5 h-3.5" />
              </a>
            )}
            <button
              type="button"
              onClick={onClose}
              aria-label="關閉視窗"
              className="min-h-[40px] min-w-[40px] flex items-center justify-center text-stone-500 hover:text-stone-950 hover:bg-stone-100 active:scale-[0.95] rounded-lg transition-all"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </header>

        {/* Embedded Interactive Site Viewport or Role-Gated React Gallery Center */}
        <div className="flex-1 min-h-0 bg-white relative">
          {isXimenSite && (
            <div
              className={
                activeTab === 'gallery' ? 'h-full w-full block' : 'hidden'
              }
            >
              <XimenGalleryPanel
                user={user}
                isTeacher={isTeacher}
                hasAccessToken={hasAccessToken}
                isSigningIn={isSigningIn}
                authError={authError}
                onClearAuthError={onClearAuthError}
                onTeacherSignIn={onTeacherSignIn}
                onStudentSignIn={onStudentSignIn}
                onSignOut={onSignOut}
                hiddenOfficialAssetIds={hiddenOfficialAssetIds}
                onUpdateHiddenOfficialAssets={onUpdateHiddenOfficialAssets}
                onApplyMapBackground={(imageUrl, displayName) => {
                  setCustomMapBg({url: imageUrl, name: displayName});
                  setActiveTab('map');
                  setTimeout(() => {
                    try {
                      iframeRef.current?.contentWindow?.postMessage(
                        {
                          type: 'XIMEN_SET_MAP_BG',
                          url: imageUrl,
                          name: displayName,
                        },
                        window.location.origin,
                      );
                    } catch {
                      // Fallback handled via query params on iframe src update
                    }
                  }, 150);
                }}
              />
            </div>
          )}
          {(!isXimenSite || activeTab !== 'gallery') && (
            <iframe
              ref={iframeRef}
              key={iframeSrc}
              src={iframeSrc}
              title={title}
              className="w-full h-full border-0 bg-white"
            />
          )}
        </div>
      </div>
    </div>
  );
};

