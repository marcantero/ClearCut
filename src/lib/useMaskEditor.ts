import { useCallback, useEffect, useRef, useState } from 'react';

export type BrushMode = 'restore' | 'erase';

interface UseMaskEditorOptions {
  width: number;
  height: number;
  brushSize: number;
  brushMode: BrushMode;
  /** Cridat a cada segment de traç (temps real) i al final del traç */
  onStroke?: () => void;
}

/**
 * Two internal hidden canvases:
 *   restoreCanvas → white pixels where user wants to restore from original
 *   eraseCanvas   → black pixels where user wants to erase from AI result
 *
 * getCorrectionMask() merges both into a single ImageData that refineMask() understands:
 *   white (255,255,255,255) → RESTORE
 *   black (0,0,0,255)       → ERASE
 *   transparent (a=0)       → no correction
 */
export function useMaskEditor({
  width,
  height,
  brushSize,
  brushMode,
  onStroke,
}: UseMaskEditorOptions) {
  // Visible canvas (semitransparent overlay that user sees)
  const overlayCanvasRef = useRef<HTMLCanvasElement | null>(null);
  // Hidden canvases to accumulate masks
  const restoreCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const eraseCanvasRef   = useRef<HTMLCanvasElement | null>(null);

  const isDrawingRef = useRef(false);
  const lastPosRef   = useRef<{ x: number; y: number } | null>(null);
  const [hasEdits, setHasEdits] = useState(false);

  // Initialize / resize all canvases when dimensions change
  useEffect(() => {
    if (width === 0 || height === 0) return;

    console.log('[useMaskEditor] dimension useEffect, resizing to:', width, 'x', height);
    for (const ref of [overlayCanvasRef, restoreCanvasRef, eraseCanvasRef]) {
      const c = ref.current;
      if (!c) {
        console.log('[useMaskEditor] canvas ref is null, skipping');
        continue;
      }
      c.width  = width;
      c.height = height;
    }
    setHasEdits(false);
  }, [width, height]);

  // Create hidden canvases once and resize
  useEffect(() => {
    console.log('[useMaskEditor] creating hidden canvases');
    restoreCanvasRef.current = document.createElement('canvas');
    eraseCanvasRef.current   = document.createElement('canvas');
    
    // Resize immediately after creating them
    if (width > 0 && height > 0) {
      if (restoreCanvasRef.current) {
        restoreCanvasRef.current.width = width;
        restoreCanvasRef.current.height = height;
      }
      if (eraseCanvasRef.current) {
        eraseCanvasRef.current.width = width;
        eraseCanvasRef.current.height = height;
      }
    }
  }, [width, height]);

  const getScaledPos = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      const canvas = overlayCanvasRef.current;
      if (!canvas) return null;
      const rect   = canvas.getBoundingClientRect();
      const scaleX = canvas.width  / rect.width;
      const scaleY = canvas.height / rect.height;
      return {
        x: (e.clientX - rect.left) * scaleX,
        y: (e.clientY - rect.top)  * scaleY,
      };
    },
    []
  );

  const paintSegment = useCallback(
    (from: { x: number; y: number }, to: { x: number; y: number }) => {
      console.log('[paintSegment] called, mode:', brushMode, 'from:', from, 'to:', to);
      
      // ── Hidden canvas (real mask) ──────────────────────────────────────
      const maskCanvas = brushMode === 'restore'
        ? restoreCanvasRef.current
        : eraseCanvasRef.current;

      if (!maskCanvas) {
        console.warn('[paintSegment] maskCanvas is null!', 'mode:', brushMode, 'restoreCanvas:', restoreCanvasRef.current, 'eraseCanvas:', eraseCanvasRef.current);
        return;
      }

      console.log('[paintSegment] maskCanvas exists, size:', maskCanvas.width, 'x', maskCanvas.height);
      
      const mCtx = maskCanvas.getContext('2d');
      if (mCtx) {
        mCtx.save();
        mCtx.globalCompositeOperation = 'source-over';
        mCtx.lineCap   = 'round';
        mCtx.lineJoin  = 'round';
        mCtx.lineWidth = brushSize;
        mCtx.strokeStyle = brushMode === 'restore'
          ? 'rgba(255,255,255,1)'
          : 'rgba(0,0,0,1)';
        mCtx.beginPath();
        mCtx.moveTo(from.x, from.y);
        mCtx.lineTo(to.x,   to.y);
        mCtx.stroke();
        mCtx.restore();
        console.log('[paintSegment] stroke drawn on maskCanvas');
      }

      // ── Visible overlay (feedback for user) ──────────────────────────
      const oCanvas = overlayCanvasRef.current;
      if (oCanvas) {
        const oCtx = oCanvas.getContext('2d');
        if (oCtx) {
          oCtx.save();
          oCtx.lineCap   = 'round';
          oCtx.lineJoin  = 'round';
          oCtx.lineWidth = brushSize;

          if (brushMode === 'restore') {
            // Green semitransparent → area to be restored
            oCtx.globalCompositeOperation = 'source-over';
            oCtx.strokeStyle = 'rgba(52,211,153,0.45)';
          } else {
            // Red semitransparent → area to be erased
            // destination-out to "punch" the overlay and see what's below
            oCtx.globalCompositeOperation = 'destination-out';
            oCtx.strokeStyle = 'rgba(0,0,0,1)';
          }

          oCtx.beginPath();
          oCtx.moveTo(from.x, from.y);
          oCtx.lineTo(to.x,   to.y);
          oCtx.stroke();
          oCtx.restore();
          console.log('[paintSegment] overlay stroke drawn');
        }
      }
    },
    [brushSize, brushMode]
  );

  const onPointerDown = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      console.log('[useMaskEditor] onPointerDown fired');
      isDrawingRef.current = true;
      const pos = getScaledPos(e);
      if (!pos) {
        console.log('[useMaskEditor] getScaledPos returned null');
        return;
      }
      console.log('[useMaskEditor] painting at', pos, 'mode:', brushMode);
      lastPosRef.current = pos;
      paintSegment(pos, pos);
      setHasEdits(true);
      onStroke?.();
    },
    [getScaledPos, paintSegment, onStroke, brushMode]
  );

  const onPointerMove = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      if (!isDrawingRef.current) return;
      const pos = getScaledPos(e);
      if (!pos || !lastPosRef.current) return;
      paintSegment(lastPosRef.current, pos);
      lastPosRef.current = pos;
      setHasEdits(true);
      onStroke?.();          // ← temps real: dispara refineMask a cada segment
    },
    [getScaledPos, paintSegment, onStroke]
  );

  const onPointerUp = useCallback(() => {
    isDrawingRef.current   = false;
    lastPosRef.current     = null;
  }, []);

  const onPointerLeave = useCallback(() => {
    isDrawingRef.current = false;
    lastPosRef.current   = null;
  }, []);

  /**
   * Merges restoreCanvas (white) + eraseCanvas (black) into a single ImageData.
   * Priority: erase > restore > none.
   */
  const getCorrectionMask = useCallback((): ImageData | null => {
    const rCanvas = restoreCanvasRef.current;
    const eCanvas = eraseCanvasRef.current;
    if (!rCanvas || !eCanvas || rCanvas.width === 0) {
      console.warn('[getCorrectionMask] canvas is null or empty');
      return null;
    }

    const { width: w, height: h } = rCanvas;
    const out  = new ImageData(w, h);

    const rCtx = rCanvas.getContext('2d');
    const eCtx = eCanvas.getContext('2d');
    if (!rCtx || !eCtx) {
      console.warn('[getCorrectionMask] context is null');
      return null;
    }

    const rData = rCtx.getImageData(0, 0, w, h).data;
    const eData = eCtx.getImageData(0, 0, w, h).data;
    const o     = out.data;

    let restoreCount = 0, eraseCount = 0;

    for (let i = 0; i < o.length; i += 4) {
      const hasErase   = eData[i + 3] > 0;
      const hasRestore = rData[i + 3] > 0;

      if (hasErase) {
        // Negre opac → ERASE
        o[i] = 0; o[i+1] = 0; o[i+2] = 0; o[i+3] = 255;
        eraseCount++;
      } else if (hasRestore) {
        // Blanc opac → RESTORE
        o[i] = 255; o[i+1] = 255; o[i+2] = 255; o[i+3] = 255;
        restoreCount++;
      }
      // sinó: transparent (a=0), sense canvi
    }

    console.log('[getCorrectionMask] created mask, restore pixels:', restoreCount, 'erase pixels:', eraseCount);
    return out;
  }, []);

  const clearEdits = useCallback(() => {
    for (const ref of [overlayCanvasRef, restoreCanvasRef, eraseCanvasRef]) {
      const c = ref.current;
      if (!c) continue;
      const ctx = c.getContext('2d');
      ctx?.clearRect(0, 0, c.width, c.height);
    }
    setHasEdits(false);
  }, []);

  return {
    canvasRef: overlayCanvasRef,
    hasEdits,
    onPointerDown,
    onPointerMove,
    onPointerUp,
    onPointerLeave,
    getCorrectionMask,
    clearEdits,
  };
} 