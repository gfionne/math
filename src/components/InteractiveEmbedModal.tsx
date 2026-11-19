import React, {useEffect, useMemo, useState} from 'react';
import {ArrowLeft, ExternalLink, MonitorPlay, X} from 'lucide-react';

export type XimenScratchTab = 'map' | 'gallery' | 'blocks' | 'naming';

const XIMEN_TABS: Array<{id: XimenScratchTab; label: string}> = [
  {id: 'map', label: '互動商圈地圖'},
  {id: 'gallery', label: '專案圖庫中心'},
  {id: 'blocks', label: 'Scratch 積木教學'},
  {id: 'naming', label: '命名規範與檢核'},
];

interface InteractiveEmbedModalProps {
  isOpen: boolean;
  url: string;
  title: string;
  initialTab?: XimenScratchTab;
  onClose: () => void;
}

function buildTabbedUrl(rawUrl: string, tab: XimenScratchTab): string {
  try {
    const base =
      typeof window !== 'undefined' ? window.location.href : 'http://localhost/';
    const resolved = new URL(rawUrl, base);
    resolved.searchParams.set('tab', tab);
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
}) => {
  const [activeTab, setActiveTab] = useState<XimenScratchTab>(initialTab);

  useEffect(() => {
    if (isOpen) {
      setActiveTab(initialTab);
    }
  }, [isOpen, initialTab, url]);

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

  const isXimenSite = useMemo(() => {
    return url.includes('ximen-scratch.html');
  }, [url]);

  const iframeSrc = useMemo(() => {
    if (!isXimenSite) return url;
    return buildTabbedUrl(url, activeTab);
  }, [url, isXimenSite, activeTab]);

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
              className="min-h-[40px] px-3 py-1.5 text-xs sm:text-sm font-medium text-stone-700 hover:text-stone-950 hover:bg-stone-100 rounded-lg inline-flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>返回知識庫</span>
            </button>

            <div className="hidden sm:block h-4 w-px bg-stone-200 shrink-0" />

            <div className="flex items-center gap-2 min-w-0">
              <MonitorPlay className="w-4 h-4 text-[#1E3A8A] shrink-0" />
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
              className="hidden lg:flex items-center gap-1 p-1 bg-[#F7F4EE] border border-stone-200 rounded-lg"
            >
              {XIMEN_TABS.map((tab) => {
                const isActive = activeTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setActiveTab(tab.id)}
                    className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                      isActive
                        ? 'bg-white text-[#1E3A8A] font-semibold shadow-2xs'
                        : 'text-stone-600 hover:text-stone-950'
                    }`}
                  >
                    {tab.label}
                  </button>
                );
              })}
            </nav>
          )}

          <div className="flex items-center gap-2 shrink-0">
            <a
              href={iframeSrc}
              target="_blank"
              rel="noopener noreferrer"
              className="min-h-[40px] px-3.5 py-2 text-xs font-medium text-white bg-[#1E3A8A] rounded-lg hover:bg-[#172554] inline-flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0"
            >
              <span>獨立分頁開啟</span>
              <ExternalLink className="w-3.5 h-3.5" />
            </a>
            <button
              type="button"
              onClick={onClose}
              aria-label="關閉互動學習網"
              className="min-h-[40px] min-w-[40px] flex items-center justify-center text-stone-500 hover:text-stone-950 hover:bg-stone-100 rounded-lg transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </header>

        {/* Embedded Interactive Site Viewport */}
        <div className="flex-1 min-h-0 bg-white">
          <iframe
            key={iframeSrc}
            src={iframeSrc}
            title={title}
            className="w-full h-full border-0 bg-white"
          />
        </div>
      </div>
    </div>
  );
};
