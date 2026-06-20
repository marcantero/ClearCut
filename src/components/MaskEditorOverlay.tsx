import { useRef, useState, useEffect, useCallback, useLayoutEffect } from 'react';
import { useMaskEditor, BrushMode } from '../lib/useMaskEditor';
import { refineMask } from '../lib/refineMask';

interface MaskEditorOverlayProps {
  originalImageData: ImageData;
  aiResultImageData: ImageData;
  onRefined: (refined: ImageData) => void;
}

const BRUSH_SIZES = [8, 16, 32, 56, 80];

export function MaskEditorOverlay({
  originalImageData,
  aiResultImageData,
  onRefined,
}: MaskEditorOverlayProps) {
  const [brushSize, setBrushSize] = useState(24);
  const [brushMode, setBrushMode] = useState<BrushMode>('restore');

  // Main canvas displaying the refined result in real-time
  const displayCanvasRef = useRef<HTMLCanvasElement | null>(null);

  // Ref to access getCorrectionMask inside the onStroke callback
  const getCorrectionMaskRef = useRef<(() => ImageData | null) | null>(null);
  // Ref to prevent onStroke from capturing an old closure of onRefined
  const onRefinedRef = useRef(onRefined);
  useLayoutEffect(() => { onRefinedRef.current = onRefined; }, [onRefined]);

  // Draws the current result on the display canvas
  const drawResultOnDisplay = useCallback((result: ImageData) => {
    const canvas = displayCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    canvas.width  = result.width;
    canvas.height = result.height;

    // Dark checkerboard to visualize transparency
    const TILE = 16;
    for (let y = 0; y < canvas.height; y += TILE) {
      for (let x = 0; x < canvas.width; x += TILE) {
        ctx.fillStyle = (x / TILE + y / TILE) % 2 === 0 ? '#334155' : '#1e293b';
        ctx.fillRect(x, y, TILE, TILE);
      }
    }
    ctx.putImageData(result, 0, 0);
  }, []);

  // Initial draw when AI result arrives
  useEffect(() => {
    // Resize the overlay canvas when the image changes
    if (overlayCanvasRef.current) {
      overlayCanvasRef.current.width = aiResultImageData.width;
      overlayCanvasRef.current.height = aiResultImageData.height;
      console.log('[MaskEditorOverlay] overlay canvas resized to:', aiResultImageData.width, 'x', aiResultImageData.height);
    }
    
    drawResultOnDisplay(aiResultImageData);
    
    // Initialize the overlay canvas with a test stroke to verify it works
    const oCanvas = overlayCanvasRef.current;
    if (oCanvas) {
      const oCtx = oCanvas.getContext('2d');
      if (oCtx) {
        // Draw a test line to see that the canvas works
        oCtx.strokeStyle = 'rgba(100,100,100,0.3)';
        oCtx.lineWidth = 2;
        oCtx.setLineDash([5, 5]);
        oCtx.strokeRect(0, 0, oCanvas.width, oCanvas.height);
        console.log('[MaskEditorOverlay] canvas overlay initialized with border');
      }
    }
  }, [aiResultImageData, drawResultOnDisplay]);

  // Callback called on each stroke segment → applies refineMask and updates display
  const handleStroke = useCallback(() => {
    console.log('[MaskEditorOverlay] handleStroke called');
    const correctionMask = getCorrectionMaskRef.current?.();
    if (!correctionMask) {
      console.warn('[MaskEditorOverlay] correctionMask is null');
      return;
    }

    console.log('[MaskEditorOverlay] refineMask called, aiResultImageData:', aiResultImageData?.width, 'x', aiResultImageData?.height);
    const refined = refineMask(aiResultImageData, originalImageData, correctionMask);
    console.log('[MaskEditorOverlay] refineMask returned:', refined?.width, 'x', refined?.height);

    // Update the display canvas in real-time
    drawResultOnDisplay(refined);

    // Notify parent (update processedSrc for download)
    onRefinedRef.current(refined);
  }, [aiResultImageData, originalImageData, drawResultOnDisplay]);

  const {
    canvasRef: overlayCanvasRef,
    hasEdits,
    onPointerDown,
    onPointerMove,
    onPointerUp,
    onPointerLeave,
    getCorrectionMask,
    clearEdits,
  } = useMaskEditor({
    width: aiResultImageData.width,
    height: aiResultImageData.height,
    brushSize,
    brushMode,
    onStroke: handleStroke,
  });

  useLayoutEffect(() => {
    getCorrectionMaskRef.current = getCorrectionMask;
  }, [getCorrectionMask]);

  const handleClear = () => {
    clearEdits();
    drawResultOnDisplay(aiResultImageData);
    onRefinedRef.current(aiResultImageData);
  };

  // Cursor SVG dinàmic
  const cursorSize  = Math.max(16, Math.min(72, brushSize));
  const half        = cursorSize / 2;
  const color       = brushMode === 'restore' ? 'white' : '%23f87171';
  const fillOpacity = brushMode === 'restore' ? '0.12' : '0.10';
  const cursorSvg   = `data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='${cursorSize}' height='${cursorSize}'%3E%3Ccircle cx='${half}' cy='${half}' r='${half - 1}' stroke='${color}' stroke-width='1.5' fill='${color}' fill-opacity='${fillOpacity}'/%3E%3C/svg%3E`;
  const cursorStyle = `url("${cursorSvg}") ${half} ${half}, crosshair`;

  return (
    <div className="flex flex-col gap-3">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-slate-800/80 bg-slate-900/70 px-4 py-2.5 text-xs backdrop-blur">
        {/* Mode toggle */}
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
                <span
                  className="rounded-full bg-current"
                  style={{
                    width:  Math.max(4, Math.min(16, size / 5)),
                    height: Math.max(4, Math.min(16, size / 5)),
                  }}
                />
              </button>
            ))}
          </div>
        </div>

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

      {/* Canvas stack */}
      <div
        className="relative overflow-hidden rounded-2xl border border-slate-800/60 shadow-[0_16px_60px_rgba(0,0,0,0.8)]"
        style={{ touchAction: 'none' }}
      >
        {/* Layer 1: refined result (updated in real-time) */}
        <canvas
          ref={displayCanvasRef}
          className="block w-full"
        />

        {/* Layer 2: user painting overlay (green/transparent) */}
        <canvas
          ref={overlayCanvasRef}
          className="absolute inset-0 w-full h-full"
          style={{ cursor: cursorStyle, touchAction: 'none' }}
          onMouseDown={onPointerDown}
          onMouseMove={onPointerMove}
          onMouseUp={onPointerUp}
          onMouseLeave={onPointerLeave}
        />

        {/* Mode badge */}
        <div className="pointer-events-none absolute bottom-3 right-3">
          <span
            className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-medium backdrop-blur-sm transition-all ${
              brushMode === 'restore'
                ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200'
                : 'border-rose-500/30 bg-rose-500/10 text-rose-300'
            }`}
          >
            <span
              className={`h-1.5 w-1.5 rounded-full ${
                brushMode === 'restore' ? 'bg-emerald-400' : 'bg-rose-400'
              }`}
            />
            {brushMode === 'restore' ? "Restoring from original" : 'Erasing area'}
          </span>
        </div>
      </div>

      <p className="text-center text-[10px] text-slate-500">
        Restore recovers pixels from the original image · Erase removes areas from the AI result
      </p>
    </div>
  );
}