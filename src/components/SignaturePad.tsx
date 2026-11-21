import React, {useCallback, useEffect, useRef, useState} from 'react';
import {PenTool, RotateCcw, Undo2} from 'lucide-react';

interface Point {
  x: number; // normalized 0..1 relative to canvas CSS width
  y: number; // normalized 0..1 relative to canvas CSS height
}

interface Stroke {
  color: string;
  points: Point[];
}

interface SignaturePadProps {
  onChange: (dataUrl: string | null) => void;
  disabled?: boolean;
  signerLabel?: string;
  heightClassName?: string;
}

const INK_COLORS = [
  {id: 'ink-black', label: '簽字黑', value: '#111827'},
  {id: 'ink-navy', label: '鋼筆藍', value: '#1E3A8A'},
] as const;

const EXPORT_WIDTH = 560;
const EXPORT_HEIGHT = 210;
const MAX_SIGNATURE_DATA_URL_LEN = 190000;

function drawStrokesToContext(
  ctx: CanvasRenderingContext2D,
  strokes: Stroke[],
  width: number,
  height: number,
  lineWidth: number,
) {
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.lineWidth = lineWidth;

  for (const stroke of strokes) {
    if (stroke.points.length === 0) continue;
    ctx.strokeStyle = stroke.color;
    ctx.fillStyle = stroke.color;

    if (stroke.points.length === 1) {
      const pt = stroke.points[0];
      ctx.beginPath();
      ctx.arc(pt.x * width, pt.y * height, lineWidth * 0.65, 0, Math.PI * 2);
      ctx.fill();
      continue;
    }

    ctx.beginPath();
    const first = stroke.points[0];
    ctx.moveTo(first.x * width, first.y * height);

    for (let i = 1; i < stroke.points.length - 1; i++) {
      const curr = stroke.points[i];
      const next = stroke.points[i + 1];
      const midX = ((curr.x + next.x) / 2) * width;
      const midY = ((curr.y + next.y) / 2) * height;
      ctx.quadraticCurveTo(curr.x * width, curr.y * height, midX, midY);
    }

    const last = stroke.points[stroke.points.length - 1];
    ctx.lineTo(last.x * width, last.y * height);
    ctx.stroke();
  }
}

function exportSignatureDataUrl(strokes: Stroke[]): string | null {
  const hasRealStroke = strokes.some((s) => s.points.length >= 1);
  if (!hasRealStroke) return null;

  const offscreen = document.createElement('canvas');
  offscreen.width = EXPORT_WIDTH;
  offscreen.height = EXPORT_HEIGHT;
  const ctx = offscreen.getContext('2d');
  if (!ctx) return null;

  ctx.clearRect(0, 0, EXPORT_WIDTH, EXPORT_HEIGHT);
  drawStrokesToContext(ctx, strokes, EXPORT_WIDTH, EXPORT_HEIGHT, 3.2);

  let dataUrl = offscreen.toDataURL('image/png');
  if (dataUrl.length <= MAX_SIGNATURE_DATA_URL_LEN) {
    return dataUrl;
  }

  // Fallback to compact JPEG on white background if extraordinarily dense strokes exceed limit
  ctx.globalCompositeOperation = 'destination-over';
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, EXPORT_WIDTH, EXPORT_HEIGHT);
  ctx.globalCompositeOperation = 'source-over';

  dataUrl = offscreen.toDataURL('image/jpeg', 0.85);
  if (dataUrl.length <= MAX_SIGNATURE_DATA_URL_LEN) {
    return dataUrl;
  }
  return offscreen.toDataURL('image/jpeg', 0.65);
}

export const SignaturePad: React.FC<SignaturePadProps> = ({
  onChange,
  disabled = false,
  signerLabel,
  heightClassName = 'h-40 sm:h-44',
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const strokesRef = useRef<Stroke[]>([]);
  const activeStrokeRef = useRef<Stroke | null>(null);
  const activePointerIdRef = useRef<number | null>(null);

  const [inkColor, setInkColor] = useState<string>(INK_COLORS[0].value);
  const [strokeCount, setStrokeCount] = useState(0);

  const renderCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
    const targetW = Math.round(rect.width * dpr);
    const targetH = Math.round(rect.height * dpr);
    if (canvas.width !== targetW || canvas.height !== targetH) {
      canvas.width = targetW;
      canvas.height = targetH;
    }

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, rect.width, rect.height);

    const allStrokes = activeStrokeRef.current
      ? [...strokesRef.current, activeStrokeRef.current]
      : strokesRef.current;
    drawStrokesToContext(ctx, allStrokes, rect.width, rect.height, 2.8);
  }, []);

  useEffect(() => {
    renderCanvas();
    const el = containerRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => {
      renderCanvas();
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [renderCanvas]);

  const getNormalizedPoint = (
    e: React.PointerEvent<HTMLCanvasElement>,
  ): Point => {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    const x = Math.max(0, Math.min(1, (e.clientX - rect.left) / (rect.width || 1)));
    const y = Math.max(0, Math.min(1, (e.clientY - rect.top) / (rect.height || 1)));
    return {x, y};
  };

  const commitActiveStroke = () => {
    const current = activeStrokeRef.current;
    activeStrokeRef.current = null;
    activePointerIdRef.current = null;
    if (!current || current.points.length === 0) return;
    strokesRef.current = [...strokesRef.current, current];
    setStrokeCount(strokesRef.current.length);
    renderCanvas();
    onChange(exportSignatureDataUrl(strokesRef.current));
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (disabled) return;
    if (e.button !== 0 && e.pointerType === 'mouse') return;
    e.preventDefault();
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // ignore if capture is unsupported
    }
    activePointerIdRef.current = e.pointerId;
    const pt = getNormalizedPoint(e);
    activeStrokeRef.current = {
      color: inkColor,
      points: [pt],
    };
    renderCanvas();
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (disabled) return;
    if (
      activePointerIdRef.current !== e.pointerId ||
      !activeStrokeRef.current
    ) {
      return;
    }
    e.preventDefault();
    const pt = getNormalizedPoint(e);
    const pts = activeStrokeRef.current.points;
    const prev = pts[pts.length - 1];
    // Filter tiny sub-pixel jitter while keeping quick curves responsive
    if (!prev || Math.hypot(pt.x - prev.x, pt.y - prev.y) > 0.002) {
      pts.push(pt);
      renderCanvas();
    }
  };

  const handlePointerUpOrCancel = (
    e: React.PointerEvent<HTMLCanvasElement>,
  ) => {
    if (activePointerIdRef.current !== e.pointerId) return;
    try {
      if (e.currentTarget.hasPointerCapture(e.pointerId)) {
        e.currentTarget.releasePointerCapture(e.pointerId);
      }
    } catch {
      // ignore
    }
    commitActiveStroke();
  };

  const handleUndo = () => {
    if (disabled || strokesRef.current.length === 0) return;
    strokesRef.current = strokesRef.current.slice(0, -1);
    setStrokeCount(strokesRef.current.length);
    renderCanvas();
    onChange(exportSignatureDataUrl(strokesRef.current));
  };

  const handleClear = () => {
    if (disabled) return;
    strokesRef.current = [];
    activeStrokeRef.current = null;
    activePointerIdRef.current = null;
    setStrokeCount(0);
    renderCanvas();
    onChange(null);
  };

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="inline-flex items-center gap-1.5 text-xs font-semibold text-stone-800">
          <PenTool className="w-3.5 h-3.5 text-[#1E3A8A]" />
          <span>
            親自手寫簽名區{signerLabel ? `（${signerLabel}）` : ''} *
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          <div
            className="inline-flex items-center gap-1 bg-stone-100 p-0.5 rounded-lg border border-stone-200"
            role="group"
            aria-label="選擇筆跡墨水顏色"
          >
            {INK_COLORS.map((c) => {
              const selected = inkColor === c.value;
              return (
                <button
                  key={c.id}
                  type="button"
                  disabled={disabled}
                  onClick={() => setInkColor(c.value)}
                  className={`px-2 py-1 text-[11px] font-medium rounded-md inline-flex items-center gap-1 transition-colors ${
                    selected
                      ? 'bg-white text-stone-900 shadow-2xs font-semibold'
                      : 'text-stone-600 hover:text-stone-900'
                  }`}
                >
                  <span
                    className="w-2.5 h-2.5 rounded-full border border-black/15"
                    style={{backgroundColor: c.value}}
                  />
                  <span>{c.label}</span>
                </button>
              );
            })}
          </div>

          <button
            type="button"
            disabled={disabled || strokeCount === 0}
            onClick={handleUndo}
            className="px-2.5 py-1 text-[11px] font-medium text-stone-700 bg-white border border-stone-300 rounded-lg hover:bg-stone-50 disabled:opacity-40 inline-flex items-center gap-1 transition-colors"
          >
            <Undo2 className="w-3 h-3" />
            <span>復原一筆</span>
          </button>

          <button
            type="button"
            disabled={disabled || strokeCount === 0}
            onClick={handleClear}
            className="px-2.5 py-1 text-[11px] font-medium text-stone-700 bg-white border border-stone-300 rounded-lg hover:bg-stone-50 disabled:opacity-40 inline-flex items-center gap-1 transition-colors"
          >
            <RotateCcw className="w-3 h-3" />
            <span>清除重簽</span>
          </button>
        </div>
      </div>

      <div
        ref={containerRef}
        className={`relative w-full ${heightClassName} rounded-xl border-2 border-dashed transition-colors overflow-hidden bg-white select-none ${
          strokeCount > 0
            ? 'border-[#1E3A8A]/45'
            : 'border-stone-300 hover:border-[#1E3A8A]/40'
        } ${disabled ? 'opacity-60 pointer-events-none' : ''}`}
      >
        {/* Guide Baseline */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-5 bottom-7 border-b border-stone-200/90"
        />

        {strokeCount === 0 && (
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-1 text-stone-400 px-4 text-center"
          >
            <span className="text-sm font-medium text-stone-500">
              請使用滑鼠、觸控螢幕或觸控筆在此處親筆簽名
            </span>
            <span className="text-[11px] text-stone-400">
              支援手機與平板直覺書寫，完成簽名後即可送出簽到
            </span>
          </div>
        )}

        <canvas
          ref={canvasRef}
          style={{touchAction: 'none'}}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUpOrCancel}
          onPointerCancel={handlePointerUpOrCancel}
          aria-label="教師親自手寫簽名畫布"
          className="w-full h-full block cursor-crosshair"
        />

        {strokeCount > 0 && (
          <span className="pointer-events-none absolute right-2.5 bottom-1.5 text-[10px] font-mono-tabular text-[#1E3A8A]/70 bg-white/85 px-1.5 py-0.5 rounded">
            已書寫 {strokeCount} 筆
          </span>
        )}
      </div>
    </div>
  );
};
