import React, {useCallback, useEffect, useRef, useState} from 'react';
import {ChevronLeft, ChevronRight, GalleryHorizontalEnd} from 'lucide-react';

interface HorizontalCardTrayProps {
  id?: string;
  sectionIndex: number;
  title: string;
  subtitle?: string;
  accentTextClass?: string;
  accentBarClass?: string;
  itemCount: number;
  itemUnitLabel?: string;
  onOpenQuickSwipe?: (activeCardIdx: number) => void;
  quickSwipeLabel?: string;
  headerActions?: React.ReactNode;
  footerSlot?: React.ReactNode;
  isActiveSection?: boolean;
  dimInactive?: boolean;
  layer?: 'channel' | 'nested';
  autoAdvanceMs?: number;
  onUserInteract?: () => void;
  variant?: 'standard' | 'spotlight';
  children: React.ReactNode;
}

function getNestedActiveClasses(accentBarClass: string): {
  cardFrame: string;
  traySurface: string;
  statusTag: string;
  badgeBg: string;
} {
  switch (accentBarClass) {
    case 'bg-[#14532D]':
      return {
        cardFrame:
          'bg-white border-2 border-[#14532D] ring-2 ring-[#14532D]/12 shadow-md',
        traySurface: 'bg-[#F0F7F3] border-[#14532D]/25',
        statusTag: 'bg-emerald-50 text-[#14532D]',
        badgeBg: 'bg-[#14532D]',
      };
    case 'bg-[#9A3412]':
      return {
        cardFrame:
          'bg-white border-2 border-[#9A3412] ring-2 ring-[#9A3412]/12 shadow-md',
        traySurface: 'bg-[#FDF4EF] border-[#9A3412]/25',
        statusTag: 'bg-orange-50 text-[#9A3412]',
        badgeBg: 'bg-[#9A3412]',
      };
    case 'bg-[#115E59]':
      return {
        cardFrame:
          'bg-white border-2 border-[#115E59] ring-2 ring-[#115E59]/12 shadow-md',
        traySurface: 'bg-[#EFF7F6] border-[#115E59]/25',
        statusTag: 'bg-teal-50 text-[#115E59]',
        badgeBg: 'bg-[#115E59]',
      };
    case 'bg-[#78350F]':
      return {
        cardFrame:
          'bg-white border-2 border-[#78350F] ring-2 ring-[#78350F]/12 shadow-md',
        traySurface: 'bg-[#FBF6EE] border-[#78350F]/25',
        statusTag: 'bg-amber-50 text-[#78350F]',
        badgeBg: 'bg-[#78350F]',
      };
    case 'bg-[#4C1D95]':
      return {
        cardFrame:
          'bg-white border-2 border-[#4C1D95] ring-2 ring-[#4C1D95]/12 shadow-md',
        traySurface: 'bg-[#F6F2FB] border-[#4C1D95]/25',
        statusTag: 'bg-violet-50 text-[#4C1D95]',
        badgeBg: 'bg-[#4C1D95]',
      };
    case 'bg-amber-700':
    default:
      return {
        cardFrame:
          'bg-white border-2 border-amber-700 ring-2 ring-amber-700/12 shadow-md',
        traySurface: 'bg-[#FAF5EB] border-amber-700/25',
        statusTag: 'bg-amber-50 text-amber-800',
        badgeBg: 'bg-amber-700',
      };
  }
}

export const HorizontalCardTray: React.FC<HorizontalCardTrayProps> = ({
  id,
  sectionIndex,
  title,
  subtitle,
  accentTextClass = 'text-[#1E3A8A]',
  accentBarClass = 'bg-[#1E3A8A]',
  itemCount,
  itemUnitLabel = '張卡片',
  onOpenQuickSwipe,
  quickSwipeLabel = '滑動快覽',
  headerActions,
  footerSlot,
  isActiveSection = false,
  dimInactive = true,
  layer = 'channel',
  autoAdvanceMs,
  onUserInteract,
  variant = 'standard',
  children,
}) => {
  const railRef = useRef<HTMLDivElement | null>(null);
  const [activeCardIdx, setActiveCardIdx] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [isHoverOrTouchPaused, setIsHoverOrTouchPaused] = useState(false);
  const [interactionNonce, setInteractionNonce] = useState(0);
  const activeCardIdxRef = useRef(0);
  const programmaticScrollUntilRef = useRef(0);
  const autoAdvanceUntilRef = useRef(0);

  const dragStateRef = useRef<{
    isDown: boolean;
    startX: number;
    startScrollLeft: number;
    hasDragged: boolean;
  }>({isDown: false, startX: 0, startScrollLeft: 0, hasDragged: false});

  useEffect(() => {
    activeCardIdxRef.current = activeCardIdx;
  }, [activeCardIdx]);

  useEffect(() => {
    if (activeCardIdx >= itemCount && itemCount > 0) {
      setActiveCardIdx(0);
      activeCardIdxRef.current = 0;
    }
  }, [itemCount, activeCardIdx]);

  const handleScroll = useCallback(() => {
    if (Date.now() < programmaticScrollUntilRef.current) return;
    const rail = railRef.current;
    if (!rail) return;
    const cards = Array.from(rail.children) as HTMLElement[];
    if (cards.length === 0) return;

    const baseOffset = cards[0].offsetLeft;
    const railLeft = rail.scrollLeft;
    let closestIdx = 0;
    let minDiff = Infinity;
    for (let i = 0; i < cards.length; i++) {
      const diff = Math.abs(cards[i].offsetLeft - baseOffset - railLeft);
      if (diff < minDiff) {
        minDiff = diff;
        closestIdx = i;
      }
    }
    setActiveCardIdx(closestIdx);
    activeCardIdxRef.current = closestIdx;
    if (Date.now() >= autoAdvanceUntilRef.current) {
      onUserInteract?.();
    }
  }, [onUserInteract]);

  const scrollToCard = useCallback((index: number, isUserAction = false) => {
    const rail = railRef.current;
    if (!rail) return;
    const cards = Array.from(rail.children) as HTMLElement[];
    if (cards.length === 0) return;
    const clamped = Math.max(0, Math.min(cards.length - 1, index));
    const target = cards[clamped];
    if (!target) return;
    const baseOffset = cards[0].offsetLeft;
    const maxScrollLeft = Math.max(0, rail.scrollWidth - rail.clientWidth);
    const targetLeft = Math.min(
      maxScrollLeft,
      Math.max(0, target.offsetLeft - baseOffset),
    );
    programmaticScrollUntilRef.current = Date.now() + 650;
    if (!isUserAction) {
      autoAdvanceUntilRef.current = Date.now() + 750;
    }
    rail.scrollTo({
      left: targetLeft,
      behavior: 'smooth',
    });
    setActiveCardIdx(clamped);
    activeCardIdxRef.current = clamped;
    if (isUserAction) {
      setInteractionNonce((n) => n + 1);
      onUserInteract?.();
    }
  }, [onUserInteract]);

  useEffect(() => {
    if (!autoAdvanceMs || autoAdvanceMs <= 0 || itemCount <= 1) return;
    if (isHoverOrTouchPaused || isDragging) return;
    if (
      typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    ) {
      return;
    }

    const timer = window.setInterval(() => {
      if (typeof document !== 'undefined' && document.hidden) return;
      const nextIdx = (activeCardIdxRef.current + 1) % itemCount;
      scrollToCard(nextIdx, false);
    }, autoAdvanceMs);

    return () => window.clearInterval(timer);
  }, [
    autoAdvanceMs,
    itemCount,
    isHoverOrTouchPaused,
    isDragging,
    interactionNonce,
    scrollToCard,
  ]);

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.pointerType !== 'mouse' || e.button !== 0) return;
    const rail = railRef.current;
    if (!rail) return;
    dragStateRef.current = {
      isDown: true,
      startX: e.clientX,
      startScrollLeft: rail.scrollLeft,
      hasDragged: false,
    };
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const st = dragStateRef.current;
    if (!st.isDown) return;
    const dx = e.clientX - st.startX;
    if (Math.abs(dx) > 6 && !st.hasDragged) {
      st.hasDragged = true;
      setIsDragging(true);
    }
    if (st.hasDragged && railRef.current) {
      railRef.current.scrollLeft = st.startScrollLeft - dx;
    }
  };

  const handlePointerUpOrCancel = () => {
    const st = dragStateRef.current;
    if (!st.isDown) return;
    st.isDown = false;
    const didDrag = st.hasDragged;
    setIsDragging(false);

    if (didDrag && railRef.current) {
      const rail = railRef.current;
      const cards = Array.from(rail.children) as HTMLElement[];
      if (cards.length > 0) {
        const baseOffset = cards[0].offsetLeft;
        let closestIdx = 0;
        let minDiff = Infinity;
        for (let i = 0; i < cards.length; i++) {
          const diff = Math.abs(cards[i].offsetLeft - baseOffset - rail.scrollLeft);
          if (diff < minDiff) {
            minDiff = diff;
            closestIdx = i;
          }
        }
        scrollToCard(closestIdx, true);
      }
      setTimeout(() => {
        dragStateRef.current.hasDragged = false;
      }, 0);
    } else {
      st.hasDragged = false;
    }
  };

  const handleClickCapture = (e: React.MouseEvent) => {
    if (dragStateRef.current.hasDragged) {
      e.preventDefault();
      e.stopPropagation();
    }
  };

  const sectionNumber = String(sectionIndex).padStart(2, '0');
  const canGoPrev = activeCardIdx > 0;
  const canGoNext = activeCardIdx < itemCount - 1;
  const childArray = React.Children.toArray(children);
  const nestedTheme =
    layer === 'nested' ? getNestedActiveClasses(accentBarClass) : null;
  const isSpotlight = variant === 'spotlight';

  return (
    <section
      id={id}
      className={`scroll-mt-32 rounded-2xl overflow-hidden min-w-0 max-w-full transition-all duration-300 ${
        isSpotlight
          ? isActiveSection
            ? 'bg-[linear-gradient(155deg,#0B1B42_0%,#132B66_55%,#1E3A8A_100%)] text-[#FBF9F5] border-2 border-[#FDE68A] ring-4 ring-[#FDE68A]/20 shadow-[0_24px_56px_-14px_rgba(11,27,66,0.58)] opacity-100'
            : 'bg-[linear-gradient(155deg,#0B1B42_0%,#132B66_55%,#1E3A8A_100%)] text-[#FBF9F5] border border-[#2B4B9E] shadow-[0_18px_40px_-14px_rgba(11,27,66,0.42)] opacity-95 hover:opacity-100'
          : `px-3.5 sm:px-5 py-5 space-y-4 ${
              isActiveSection
                ? nestedTheme
                  ? `${nestedTheme.cardFrame} opacity-100`
                  : 'bg-white border-2 border-[#1E3A8A] ring-4 ring-[#1E3A8A]/10 shadow-[0_18px_40px_-12px_rgba(30,58,138,0.24)] opacity-100'
                : dimInactive
                  ? layer === 'nested'
                    ? 'bg-white/80 border border-stone-200/90 opacity-75 hover:opacity-100'
                    : 'bg-[#F5F2EB]/65 border border-stone-200/80 opacity-65 hover:opacity-95'
                  : 'bg-white/75 border border-stone-200/90 opacity-100'
            }`
      }`}
    >
      {isSpotlight && (
        <div className="h-1.5 w-full bg-gradient-to-r from-[#D97706] via-[#FDE68A] to-[#93C5FD]" />
      )}

      <div
        className={
          isSpotlight ? 'px-3.5 sm:px-6 pt-4 pb-5 sm:py-6 space-y-4 sm:space-y-5' : 'space-y-4'
        }
      >
        {/* Editorial Section Header */}
        <div className="flex flex-wrap items-center justify-between gap-3 min-w-0">
          <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1.5 min-w-0">
            <span
              className={`font-mono-tabular text-sm font-bold transition-all ${
                isSpotlight
                  ? 'px-2.5 py-0.5 rounded-md bg-[#FDE68A] text-[#0B1B42] shadow-xs'
                  : isActiveSection
                    ? `px-2.5 py-0.5 rounded-md ${
                        nestedTheme ? nestedTheme.badgeBg : accentBarClass
                      } text-white shadow-2xs`
                    : accentTextClass
              }`}
            >
              {sectionNumber}
            </span>
            <h3
              className={`font-editorial font-bold break-words ${
                isSpotlight
                  ? 'text-2xl sm:text-[28px] text-white tracking-tight'
                  : 'text-xl sm:text-2xl text-stone-950'
              }`}
            >
              {title}
            </h3>
            {isActiveSection && (
              <span
                className={`text-[11px] font-bold tracking-wide px-2 py-0.5 rounded ${
                  isSpotlight
                    ? 'bg-[#FDE68A]/18 text-[#FDE68A] border border-[#FDE68A]/35'
                    : nestedTheme
                      ? nestedTheme.statusTag
                      : `bg-[#1E3A8A]/10 ${accentTextClass}`
                }`}
              >
                目前顯示
              </span>
            )}
            {itemCount > 0 && (
              <span
                className={`text-xs font-mono-tabular ${
                  isSpotlight ? 'text-blue-100/90' : 'text-stone-500'
                }`}
              >
                {itemCount > 1 ? (
                  <>
                    <strong
                      className={`font-bold ${
                        isSpotlight ? 'text-[#FDE68A]' : accentTextClass
                      }`}
                    >
                      第 {activeCardIdx + 1}/{itemCount} 張
                    </strong>
                    {' · '}
                  </>
                ) : (
                  <>
                    共 {itemCount} {itemUnitLabel}
                  </>
                )}
                {itemCount > 1 && subtitle
                  ? subtitle
                  : itemCount === 1 && subtitle
                    ? ` · ${subtitle}`
                    : ''}
              </span>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-1.5 sm:gap-2 min-w-0 max-w-full">
            {onOpenQuickSwipe && itemCount > 0 && (
              <button
                type="button"
                onClick={() => onOpenQuickSwipe(activeCardIdx)}
                className={`min-h-[36px] px-2.5 sm:px-3 py-1.5 text-xs font-semibold rounded-lg active:scale-[0.97] inline-flex items-center gap-1.5 transition-all whitespace-nowrap shrink-0 ${
                  isSpotlight
                    ? 'text-[#FDE68A] bg-[#091536]/80 border border-[#FDE68A]/45 hover:bg-[#FDE68A] hover:text-[#0B1B42]'
                    : 'text-[#1E3A8A] bg-white border border-stone-300/80 hover:bg-[#1E3A8A] hover:text-white hover:border-[#1E3A8A] hover:shadow-xs'
                }`}
              >
                <GalleryHorizontalEnd className="w-3.5 h-3.5" />
                <span>{quickSwipeLabel}</span>
              </button>
            )}
            {headerActions}

            {itemCount > 1 && (
              <div className="flex items-center gap-1 shrink-0">
                <button
                  type="button"
                  onClick={() => scrollToCard(activeCardIdx - 1, true)}
                  disabled={!canGoPrev}
                  aria-label={`上一張 ${title}`}
                  className={`min-h-[36px] min-w-[36px] flex items-center justify-center rounded-lg border active:scale-[0.96] disabled:opacity-35 disabled:cursor-not-allowed transition-all ${
                    isSpotlight
                      ? 'border-white/25 bg-[#091536]/75 text-white hover:bg-[#FDE68A] hover:text-[#0B1B42] hover:border-[#FDE68A]'
                      : 'border-stone-300/80 bg-white text-stone-700 hover:bg-[#F7F4EE] hover:border-[#1E3A8A]/50 hover:text-[#1E3A8A]'
                  }`}
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={() => scrollToCard(activeCardIdx + 1, true)}
                  disabled={!canGoNext}
                  aria-label={`下一張 ${title}`}
                  className={`min-h-[36px] min-w-[36px] flex items-center justify-center rounded-lg border active:scale-[0.96] disabled:opacity-35 disabled:cursor-not-allowed transition-all ${
                    isSpotlight
                      ? 'border-white/25 bg-[#091536]/75 text-white hover:bg-[#FDE68A] hover:text-[#0B1B42] hover:border-[#FDE68A]'
                      : 'border-stone-300/80 bg-white text-stone-700 hover:bg-[#F7F4EE] hover:border-[#1E3A8A]/50 hover:text-[#1E3A8A]'
                  }`}
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Warm Limestone / Active Spotlight Swipeable Card Tray */}
        <div
          onMouseEnter={() => setIsHoverOrTouchPaused(true)}
          onMouseLeave={() => setIsHoverOrTouchPaused(false)}
          onTouchStart={() => setIsHoverOrTouchPaused(true)}
          onTouchEnd={() => {
            setIsHoverOrTouchPaused(false);
            setInteractionNonce((n) => n + 1);
          }}
          onTouchCancel={() => {
            setIsHoverOrTouchPaused(false);
            setInteractionNonce((n) => n + 1);
          }}
          className={`border rounded-2xl p-3 sm:p-5 relative min-w-0 max-w-full overflow-hidden transition-colors duration-300 ${
            isSpotlight
              ? 'bg-[#091536]/65 border-white/15'
              : isActiveSection
                ? nestedTheme
                  ? nestedTheme.traySurface
                  : 'bg-[#EBF0FA]/80 border-[#1E3A8A]/25'
                : 'bg-[#EFECE4]/90 border-stone-200/90'
          }`}
        >
          <div
            ref={railRef}
            data-card-rail="true"
            onScroll={handleScroll}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUpOrCancel}
            onPointerCancel={handlePointerUpOrCancel}
            onClickCapture={handleClickCapture}
            className={`flex gap-3.5 sm:gap-5 overflow-x-auto no-scrollbar pb-1 pt-1 select-none items-stretch ${
              isDragging
                ? 'cursor-grabbing'
                : 'snap-x snap-mandatory scroll-smooth cursor-grab'
            }`}
          >
            {childArray.map((child, idx) => {
              if (!React.isValidElement<{className?: string}>(child)) {
                return child;
              }
              const isFocus = idx === activeCardIdx;
              const focusCls =
                itemCount > 1
                  ? isFocus
                    ? isSpotlight
                      ? 'transition-all duration-300 ease-out scale-100 opacity-100 rounded-xl ring-2 ring-[#FDE68A]/90 shadow-[0_18px_36px_-10px_rgba(0,0,0,0.45)]'
                      : 'transition-all duration-300 ease-out scale-100 opacity-100'
                    : isSpotlight
                      ? 'transition-all duration-300 ease-out scale-[0.96] opacity-80'
                      : 'transition-all duration-300 ease-out scale-[0.96] opacity-80'
                  : '';
              return React.cloneElement(child, {
                className: `${child.props.className || ''} ${focusCls}`.trim(),
              });
            })}
          </div>

          {/* Left & Right Peek Gradient Cues */}
          {canGoPrev && (
            <div
              aria-hidden="true"
              className={`pointer-events-none absolute inset-y-0 left-0 w-7 bg-gradient-to-r ${
                isSpotlight ? 'from-[#091536]/90' : 'from-[#EFECE4]/90'
              } to-transparent`}
            />
          )}
          {canGoNext && (
            <div
              aria-hidden="true"
              className={`pointer-events-none absolute inset-y-0 right-0 w-9 bg-gradient-to-l ${
                isSpotlight ? 'from-[#091536]/90' : 'from-[#EFECE4]/90'
              } to-transparent`}
            />
          )}

          {canGoNext && (
            <button
              type="button"
              onClick={() => scrollToCard(activeCardIdx + 1, true)}
              aria-label={`往左滑動下一張 ${title}`}
              className={`hidden md:flex absolute right-3 top-1/2 -translate-y-1/2 min-h-[42px] min-w-[42px] items-center justify-center rounded-full border shadow-md opacity-95 hover:opacity-100 hover:scale-110 active:scale-95 transition-all z-10 ${
                isSpotlight
                  ? 'bg-[#0B1B42]/95 border-[#FDE68A]/55 text-[#FDE68A] hover:bg-[#FDE68A] hover:text-[#0B1B42]'
                  : 'bg-white border-stone-300 text-stone-900 hover:border-[#1E3A8A] hover:text-[#1E3A8A]'
              }`}
            >
              <ChevronRight className="w-5 h-5" />
            </button>
          )}
          {canGoPrev && (
            <button
              type="button"
              onClick={() => scrollToCard(activeCardIdx - 1, true)}
              aria-label={`往右滑動上一張 ${title}`}
              className={`hidden md:flex absolute left-3 top-1/2 -translate-y-1/2 min-h-[42px] min-w-[42px] items-center justify-center rounded-full border shadow-md opacity-95 hover:opacity-100 hover:scale-110 active:scale-95 transition-all z-10 ${
                isSpotlight
                  ? 'bg-[#0B1B42]/95 border-[#FDE68A]/55 text-[#FDE68A] hover:bg-[#FDE68A] hover:text-[#0B1B42]'
                  : 'bg-white border-stone-300 text-stone-900 hover:border-[#1E3A8A] hover:text-[#1E3A8A]'
              }`}
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
          )}
        </div>

        {/* Clickable Progress Segments + Live Position Readout */}
        {itemCount > 1 && (
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar">
              {Array.from({length: itemCount}, (_, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => scrollToCard(idx, true)}
                  aria-label={`切換至第 ${idx + 1} 張卡片`}
                  className="py-1 px-0.5 flex items-center focus-visible:outline-none"
                >
                  <span
                    className={`block h-2 rounded-full transition-all duration-200 ${
                      idx === activeCardIdx
                        ? isSpotlight
                          ? 'w-10 bg-[#FDE68A]'
                          : `w-9 ${accentBarClass}`
                        : isSpotlight
                          ? 'w-2.5 bg-white/25 hover:bg-white/50'
                          : 'w-2.5 bg-stone-300 hover:bg-stone-400'
                    }`}
                  />
                </button>
              ))}
            </div>
            <span
              className={`text-[11px] font-mono-tabular whitespace-nowrap shrink-0 ${
                isSpotlight ? 'text-blue-100/90' : 'text-stone-500'
              }`}
            >
              第{' '}
              <strong
                className={`font-bold ${
                  isSpotlight ? 'text-[#FDE68A]' : accentTextClass
                }`}
              >
                {activeCardIdx + 1}
              </strong>{' '}
              / {itemCount} 張 · 左右滑動卡片
            </span>
          </div>
        )}

        {footerSlot}
      </div>
    </section>
  );
};
