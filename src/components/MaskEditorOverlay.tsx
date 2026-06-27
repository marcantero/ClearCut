import { useRef, useState, useEffect, useCallback, useLayoutEffect } from 'react';
import { useMaskEditor, BrushMode } from '../lib/useMaskEditor';
import { useSmartBrush } from '../lib/useSmartBrush';
import { refineMask } from '../lib/refineMask';

interface MaskEditorOverlayProps {
  originalImageData: ImageData;
  aiResultImageData: ImageData;
  onRefined: (refined: ImageData) => void;
}

type ActiveTool = 'brush' | 'smart';

const BRUSH_SIZES = [8, 16, 32, 56, 80];
const TOLERANCE_PRESETS = [
  { label: 'Exact',  value: 8   },
  { label: 'Low',    value: 25  },
  { label: 'Med',    value: 55  },
  { label: 'High',   value: 90  },
  { label: 'Max',    value: 140 },
] as const;

export function MaskEditorOverlay({
  originalImageData,
  aiResultImageData,
  onRefined,
}: MaskEditorOverlayProps) {
  const [brushSize,  setBrushSize]  = useState(32);
  const [brushMode,  setBrushMode]  = useState<BrushMode>('restore');
  const [activeTool, setActiveTool] = useState<ActiveTool>('brush');
  const [tolerance,  setTolerance]  = useState(55);

  const displayCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const getCorrectionMaskRef = useRef<(() => ImageData | null) | null>(null);
  const onRefinedRef = useRef(onRefined);
  useLayoutEffect(() => { onRefinedRef.current = onRefined; }, [onRefined]);

  // Per al smart brush: globalVisited es crea en onPointerDown i dura fins onPointerUp
  const strokeVisitedRef = useRef<Uint8Array | null>(null);
  // Throttle: nombre de frames acumulats sense disparar refineMask
  const pendingFrameRef  = useRef<number | null>(null);

  const drawResultOnDisplay = useCallback((result: ImageData) => {
    const canvas = displayCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    canvas.width  = result.width;
    canvas.height = result.height;
    const TILE = 16;
    for (let y = 0; y < canvas.height; y += TILE)
      for (let x = 0; x < canvas.width; x += TILE) {
        ctx.fillStyle = (x / TILE + y / TILE) % 2 === 0 ? '#334155' : '#1e293b';
        ctx.fillRect(x, y, TILE, TILE);
      }
    ctx.putImageData(result, 0, 0);
  }, []);

  useEffect(() => {
    if (overlayCanvasRef.current) {
      overlayCanvasRef.current.width  = aiResultImageData.width;
      overlayCanvasRef.current.height = aiResultImageData.height;
    }
    drawResultOnDisplay(aiResultImageData);
  }, [aiResultImageData, drawResultOnDisplay]);

  // ── refineMask + notificació al pare ──────────────────────────────────────
  const applyRefinement = useCallback(() => {
    const correctionMask = getCorrectionMaskRef.current?.();
    if (!correctionMask) return;
    const refined = refineMask(aiResultImageData, originalImageData, correctionMask);
    drawResultOnDisplay(refined);
    onRefinedRef.current(refined);
  }, [aiResultImageData, originalImageData, drawResultOnDisplay]);

  // Callback per al pinzell normal (dispara en cada segment, ja era així)
  const handleBrushStroke = useCallback(() => {
    applyRefinement();
  }, [applyRefinement]);

  // ── useMaskEditor (pinzell clàssic) ───────────────────────────────────────
  const {
    canvasRef: overlayCanvasRef,
    hasEdits,
    onPointerDown:  brushPointerDown,
    onPointerMove:  brushPointerMove,
    onPointerUp:    brushPointerUp,
    onPointerLeave: brushPointerLeave,
    getCorrectionMask,
    clearEdits,
    getHiddenCanvases,
    notifyExternalEdit,
  } = useMaskEditor({
    width:    aiResultImageData.width,
    height:   aiResultImageData.height,
    brushSize,
    brushMode,
    onStroke: activeTool === 'brush' ? handleBrushStroke : undefined,
  });

  useLayoutEffect(() => {
    getCorrectionMaskRef.current = getCorrectionMask;
  }, [getCorrectionMask]);

  // ── useSmartBrush (pinzell intel·ligent) ──────────────────────────────────
  const { fillAt, createStrokeState, getScaledPos } = useSmartBrush();

  // Throttle del refineMask per al smart brush:
  // acumula fills a cada onPointerMove, però refineMask es dispara
  // en el proper rAF (màxim 60 vegades/s), no en cada píxel
  const scheduleRefinement = useCallback(() => {
    if (pendingFrameRef.current !== null) return; // ja programat
    pendingFrameRef.current = requestAnimationFrame(() => {
      pendingFrameRef.current = null;
      applyRefinement();
    });
  }, [applyRefinement]);

  const smartPointerDown = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      const canvas = overlayCanvasRef.current;
      if (!canvas) return;

      // Crear globalVisited per a aquest stroke
      strokeVisitedRef.current = createStrokeState(
        aiResultImageData.width,
        aiResultImageData.height,
      );

      const pos = getScaledPos(e, canvas);
      const { restoreCanvas, eraseCanvas } = getHiddenCanvases();
      const maskCanvas = brushMode === 'restore' ? restoreCanvas : eraseCanvas;
      if (!maskCanvas) return;

      fillAt(
        originalImageData,   // mostreig des de la imatge original (té RGB reals)
        maskCanvas,
        canvas,
        pos.x, pos.y,
        brushSize,           // radi espacial = brushSize de la UI
        tolerance,
        brushMode,
        strokeVisitedRef.current,
      );

      notifyExternalEdit();
      scheduleRefinement();
    },
    [
      overlayCanvasRef, createStrokeState, aiResultImageData,
      getScaledPos, getHiddenCanvases, brushMode, fillAt,
      originalImageData, brushSize, tolerance,
      notifyExternalEdit, scheduleRefinement,
    ],
  );

  const smartPointerMove = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      if (!strokeVisitedRef.current) return; // no estem dibuixant
      const canvas = overlayCanvasRef.current;
      if (!canvas) return;

      const pos = getScaledPos(e, canvas);
      const { restoreCanvas, eraseCanvas } = getHiddenCanvases();
      const maskCanvas = brushMode === 'restore' ? restoreCanvas : eraseCanvas;
      if (!maskCanvas) return;

      fillAt(
        originalImageData,
        maskCanvas,
        canvas,
        pos.x, pos.y,
        brushSize,
        tolerance,
        brushMode,
        strokeVisitedRef.current,
      );

      notifyExternalEdit();
      scheduleRefinement();
    },
    [
      overlayCanvasRef, getScaledPos, getHiddenCanvases, brushMode,
      fillAt, originalImageData, brushSize, tolerance,
      notifyExternalEdit, scheduleRefinement,
    ],
  );

  const smartPointerUp = useCallback(() => {
    strokeVisitedRef.current = null;
    // Garantir que el darrer frame de refinament s'aplica
    if (pendingFrameRef.current !== null) {
      cancelAnimationFrame(pendingFrameRef.current);
      pendingFrameRef.current = null;
    }
    applyRefinement();
  }, [applyRefinement]);

  const smartPointerLeave = useCallback(() => {
    strokeVisitedRef.current = null;
  }, []);

  // ── Routing d'events al canvas ────────────────────────────────────────────
  const canvasProps =
    activeTool === 'brush'
      ? {
          onMouseDown:  brushPointerDown,
          onMouseMove:  brushPointerMove,
          onMouseUp:    brushPointerUp,
          onMouseLeave: brushPointerLeave,
        }
      : {
          onMouseDown:  smartPointerDown,
          onMouseMove:  smartPointerMove,
          onMouseUp:    smartPointerUp,
          onMouseLeave: smartPointerLeave,
        };

  const handleClear = () => {
    clearEdits();
    drawResultOnDisplay(aiResultImageData);
    onRefinedRef.current(aiResultImageData);
  };

  // ── Cursors ───────────────────────────────────────────────────────────────
  const getCursor = (): string => {
    const sz   = Math.max(16, Math.min(96, brushSize * 2));
    const half = sz / 2;

    if (activeTool === 'brush') {
      const col = brushMode === 'restore' ? 'white' : '%23f87171';
      const fop = brushMode === 'restore' ? '0.12'  : '0.10';
      const svg = `data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='${sz}' height='${sz}'%3E%3Ccircle cx='${half}' cy='${half}' r='${half - 1}' stroke='${col}' stroke-width='1.5' fill='${col}' fill-opacity='${fop}'/%3E%3C/svg%3E`;
      return `url("${svg}") ${half} ${half}, crosshair`;
    }

    // Smart brush: cercle sòlid amb creu central
    const col = brushMode === 'restore' ? '%2334d399' : '%23f87171';
    const svg = `data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='${sz}' height='${sz}'%3E%3Ccircle cx='${half}' cy='${half}' r='${half - 1}' stroke='${col}' stroke-width='2' stroke-dasharray='4 3' fill='${col}' fill-opacity='0.08'/%3E%3Cline x1='${half}' y1='${half - 4}' x2='${half}' y2='${half + 4}' stroke='${col}' stroke-width='1.5'/%3E%3Cline x1='${half - 4}' y1='${half}' x2='${half + 4}' y2='${half}' stroke='${col}' stroke-width='1.5'/%3E%3C/svg%3E`;
    return `url("${svg}") ${half} ${half}, crosshair`;
  };

  return (
    <div className="flex flex-col gap-3">
      {/* ── Toolbar ──────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-slate-800/80 bg-slate-900/70 px-4 py-2.5 text-xs backdrop-blur">

        {/* Restore / Erase */}
        <div className="flex items-center gap-1 rounded-xl border border-slate-700/60 bg-slate-950/60 p-1">
          <button
            type="button"
            onClick={() => setBrushMode('restore')}
            className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 font-medium transition-all ${
              brushMode === 'restore'
                ? 'bg-emerald-500/20 text-emerald-200 shadow-inner'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <span>✦</span> Restore
          </button>
          <button
            type="button"
            onClick={() => setBrushMode('erase')}
            className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 font-medium transition-all ${
              brushMode === 'erase'
                ? 'bg-rose-500/20 text-rose-300 shadow-inner'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <span>◌</span> Erase
          </button>
        </div>

        {/* Brush / Smart */}
        <div className="flex items-center gap-1 rounded-xl border border-slate-700/60 bg-slate-950/60 p-1">
          <button
            type="button"
            onClick={() => setActiveTool('brush')}
            title="Pinzell lliure"
            className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 font-medium transition-all ${
              activeTool === 'brush'
                ? 'bg-cyan-500/20 text-cyan-200 shadow-inner'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/>
            </svg>
            Brush
          </button>
          <button
            type="button"
            onClick={() => setActiveTool('smart')}
            title="Pinzell intel·ligent — selecciona per color"
            className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 font-medium transition-all ${
              activeTool === 'smart'
                ? 'bg-cyan-500/20 text-cyan-200 shadow-inner'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            {/* Spark / magic wand icon */}
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275Z"/>
            </svg>
            Smart
          </button>
        </div>

        {/* Brush size */}
        <div className="flex items-center gap-2 text-slate-400">
          <span className="text-[10px] uppercase tracking-wider">Size</span>
          <div className="flex items-center gap-1">
            {BRUSH_SIZES.map((size) => (
              <button
                key={size}
                type="button"
                onClick={() => setBrushSize(size)}
                className={`flex items-center justify-center rounded-full transition-all ${
                  brushSize === size
                    ? 'border border-cyan-400/60 bg-cyan-400/15 text-cyan-300'
                    : 'border border-transparent text-slate-500 hover:text-slate-300'
                }`}
                style={{ width: 28, height: 28 }}
                title={`${size}px`}
              >
                <span className="rounded-full bg-current" style={{
                  width:  Math.max(4, Math.min(16, size / 5)),
                  height: Math.max(4, Math.min(16, size / 5)),
                }} />
              </button>
            ))}
          </div>
        </div>

        {/* Tolerance — only in smart mode */}
        {activeTool === 'smart' && (
          <div className="flex items-center gap-2 text-slate-400">
            <span className="text-[10px] uppercase tracking-wider">Tolerance</span>
            <div className="flex items-center gap-1">
              {TOLERANCE_PRESETS.map(({ label, value }) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setTolerance(value)}
                  title={`RGB distance ≤ ${value}`}
                  className={`rounded-lg px-2.5 py-1 text-[10px] font-medium transition-all ${
                    tolerance === value
                      ? 'bg-cyan-400/15 text-cyan-200 border border-cyan-400/60'
                      : 'border border-transparent text-slate-500 hover:text-slate-300 hover:border-slate-700'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        )}

        {hasEdits && (
          <button
            type="button"
            onClick={handleClear}
            className="ml-auto rounded-lg border border-slate-700/60 bg-slate-950/60 px-3 py-1.5 text-[10px] font-medium uppercase tracking-wider text-slate-400 transition hover:border-rose-500/40 hover:text-rose-300"
          >
            Clear
          </button>
        )}
      </div>

      {/* ── Canvas stack ─────────────────────────────────────────────────── */}
      <div
        className="relative overflow-hidden rounded-2xl border border-slate-800/60 shadow-[0_16px_60px_rgba(0,0,0,0.8)]"
        style={{ touchAction: 'none' }}
      >
        <canvas ref={displayCanvasRef} className="block w-full" />

        <canvas
          ref={overlayCanvasRef}
          className="absolute inset-0 w-full h-full"
          style={{ cursor: getCursor(), touchAction: 'none' }}
          {...canvasProps}
        />

        {/* Mode badge */}
        <div className="pointer-events-none absolute bottom-3 right-3">
          <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-medium backdrop-blur-sm transition-all ${
            brushMode === 'restore'
              ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200'
              : 'border-rose-500/30 bg-rose-500/10 text-rose-300'
          }`}>
            <span className={`h-1.5 w-1.5 rounded-full ${brushMode === 'restore' ? 'bg-emerald-400' : 'bg-rose-400'}`} />
            {brushMode === 'restore' ? 'Restoring from original' : 'Erasing area'}
          </span>
        </div>
      </div>

      <p className="text-center text-[10px] text-slate-500">
        {activeTool === 'brush'
          ? 'Restore recovers pixels from the original · Erase removes areas from the AI result'
          : 'Smart brush selects similar colours as you paint · adjust tolerance for finer or broader edges'}
      </p>
    </div>
  );
}