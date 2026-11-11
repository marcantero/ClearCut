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
  { label: 'Exact', value: 8   },
  { label: 'Low',   value: 25  },
  { label: 'Med',   value: 55  },
  { label: 'High',  value: 90  },
  { label: 'Max',   value: 140 },
] as const;

/**
 * Undo/redo snapshot. Each mask canvas only ever holds one colour (restore = white,
 * erase = black, overlay = green tint), so storing the alpha channel (1 byte/px instead
 * of 4) is lossless and cuts history memory by 4×.
 */
const MIN_ZOOM = 1;
const MAX_ZOOM = 8;
const ZOOM_STEP = 1.25;

type View = { zoom: number; x: number; y: number };
const FIT_VIEW: View = { zoom: 1, x: 0, y: 0 };

type HistoryStep = { restore: Uint8Array; erase: Uint8Array; overlay: Uint8Array };

const RESTORE_RGB: RGB = [255, 255, 255];
const ERASE_RGB: RGB   = [0, 0, 0];
const OVERLAY_RGB: RGB = [52, 211, 153]; // must match the smart brush overlay colour

type RGB = [number, number, number];

function readAlpha(canvas: HTMLCanvasElement): Uint8Array | null {
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
  const alpha = new Uint8Array(canvas.width * canvas.height);
  for (let i = 0, j = 3; i < alpha.length; i++, j += 4) alpha[i] = data[j];
  return alpha;
}

function writeAlpha(canvas: HTMLCanvasElement, alpha: Uint8Array, [r, g, b]: RGB) {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const img = new ImageData(canvas.width, canvas.height);
  const d = img.data;
  for (let i = 0, j = 0; i < alpha.length; i++, j += 4) {
    const a = alpha[i];
    if (a === 0) continue;
    d[j] = r; d[j + 1] = g; d[j + 2] = b; d[j + 3] = a;
  }
  ctx.putImageData(img, 0, 0);
}

export function MaskEditorOverlay({
  originalImageData,
  aiResultImageData,
  onRefined,
}: MaskEditorOverlayProps) {
  const [brushSize,  setBrushSize]  = useState(32);
  const [brushMode,  setBrushMode]  = useState<BrushMode>('restore');
  const [activeTool, setActiveTool] = useState<ActiveTool>('brush');
  const [tolerance,  setTolerance]  = useState(55);

  const historyRef       = useRef<HistoryStep[]>([]);
  const historyIndexRef  = useRef<number>(-1);
  const isPointerDownRef = useRef(false);
  const [historyState, setHistoryState] = useState({ canUndo: false, canRedo: false });

  const displayCanvasRef     = useRef<HTMLCanvasElement | null>(null);
  const getCorrectionMaskRef = useRef<(() => ImageData | null) | null>(null);
  const onRefinedRef         = useRef(onRefined);
  const originalCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const tempResultCanvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const c = document.createElement('canvas');
    c.width = originalImageData.width;
    c.height = originalImageData.height;
    c.getContext('2d')?.putImageData(originalImageData, 0, 0);
    originalCanvasRef.current = c;
  }, [originalImageData]);

  useLayoutEffect(() => { onRefinedRef.current = onRefined; }, [onRefined]);

  const strokeVisitedRef = useRef<Uint8Array | null>(null);
  const pendingFrameRef  = useRef<number | null>(null);

  const syncHistoryUI = useCallback(() => {
    setHistoryState({
      canUndo: historyIndexRef.current > 0,
      canRedo: historyIndexRef.current < historyRef.current.length - 1,
    });
  }, []);

  const drawResultOnDisplay = useCallback((result: ImageData) => {
    const canvas = displayCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    canvas.width  = result.width;
    canvas.height = result.height;

    const isDark = document.documentElement.classList.contains('dark');
    const tileColorA = isDark ? '#1a2235' : '#ffffff';
    const tileColorB = isDark ? '#111827' : '#f1f5f9';

    const TILE = 14;
    for (let y = 0; y < canvas.height; y += TILE) {
      for (let x = 0; x < canvas.width; x += TILE) {
        ctx.fillStyle = (x / TILE + y / TILE) % 2 === 0 ? tileColorA : tileColorB;
        ctx.fillRect(x, y, TILE, TILE);
      }
    }

    if (originalCanvasRef.current) {
      ctx.save();
      ctx.globalAlpha = isDark ? 0.25 : 0.15;
      ctx.filter = 'grayscale(100%)';
      ctx.drawImage(originalCanvasRef.current, 0, 0);
      ctx.restore();
    }

    if (!tempResultCanvasRef.current) {
      tempResultCanvasRef.current = document.createElement('canvas');
    }
    const tempCanvas = tempResultCanvasRef.current;
    tempCanvas.width = result.width;
    tempCanvas.height = result.height;
    tempCanvas.getContext('2d')?.putImageData(result, 0, 0);

    ctx.drawImage(tempCanvas, 0, 0);
  }, []);

  useEffect(() => {
    if (overlayCanvasRef.current) {
      overlayCanvasRef.current.width  = aiResultImageData.width;
      overlayCanvasRef.current.height = aiResultImageData.height;
    }
    drawResultOnDisplay(aiResultImageData);
    // overlayCanvasRef is a stable ref from useMaskEditor (declared below), so it can't
    // be listed here without a temporal-dead-zone error, and doesn't need to be.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aiResultImageData, drawResultOnDisplay]);

  const applyRefinement = useCallback(() => {
    const mask = getCorrectionMaskRef.current?.();
    if (!mask) return;
    const refined = refineMask(aiResultImageData, originalImageData, mask);
    drawResultOnDisplay(refined);
    onRefinedRef.current(refined);
  }, [aiResultImageData, originalImageData, drawResultOnDisplay]);

  useEffect(() => {
    const observer = new MutationObserver(() => { applyRefinement(); });
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    return () => observer.disconnect();
  }, [applyRefinement]);

  // Refinement reads both masks and recomposes the whole image, so it runs at most
  // once per animation frame while painting, and is flushed when the stroke ends.
  const scheduleRefinement = useCallback(() => {
    if (pendingFrameRef.current !== null) return;
    pendingFrameRef.current = requestAnimationFrame(() => {
      pendingFrameRef.current = null;
      applyRefinement();
    });
  }, [applyRefinement]);

  const flushRefinement = useCallback(() => {
    if (pendingFrameRef.current !== null) {
      cancelAnimationFrame(pendingFrameRef.current);
      pendingFrameRef.current = null;
    }
    applyRefinement();
  }, [applyRefinement]);

  useEffect(() => () => {
    if (pendingFrameRef.current !== null) cancelAnimationFrame(pendingFrameRef.current);
  }, []);

  const handleBrushStroke = scheduleRefinement;

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

  useLayoutEffect(() => { getCorrectionMaskRef.current = getCorrectionMask; }, [getCorrectionMask]);

  const captureSnapshot = useCallback(() => {
    const { restoreCanvas, eraseCanvas } = getHiddenCanvases();
    const overlayCanvas = overlayCanvasRef.current;
    if (!restoreCanvas || !eraseCanvas || !overlayCanvas || restoreCanvas.width === 0) return;

    const restore = readAlpha(restoreCanvas);
    const erase   = readAlpha(eraseCanvas);
    const overlay = readAlpha(overlayCanvas);
    if (!restore || !erase || !overlay) return;
    const step: HistoryStep = { restore, erase, overlay };

    const currIdx = historyIndexRef.current;
    const nextHistory = historyRef.current.slice(0, currIdx + 1);
    nextHistory.push(step);
    if (nextHistory.length > 20) nextHistory.shift();

    historyRef.current      = nextHistory;
    historyIndexRef.current = nextHistory.length - 1;
    syncHistoryUI();
  }, [getHiddenCanvases, overlayCanvasRef, syncHistoryUI]);

  useEffect(() => {
    const { restoreCanvas, eraseCanvas } = getHiddenCanvases();
    const overlayCanvas = overlayCanvasRef.current;
    if (!restoreCanvas || !eraseCanvas || !overlayCanvas || restoreCanvas.width === 0) return;
    const restore = readAlpha(restoreCanvas);
    const erase   = readAlpha(eraseCanvas);
    const overlay = readAlpha(overlayCanvas);
    if (!restore || !erase || !overlay) return;
    const step0: HistoryStep = { restore, erase, overlay };

    historyRef.current      = [step0];
    historyIndexRef.current = 0;
    syncHistoryUI();
  }, [aiResultImageData, getHiddenCanvases, overlayCanvasRef, syncHistoryUI]);

  const applyHistoryStep = useCallback((targetIndex: number) => {
    const step = historyRef.current[targetIndex];
    if (!step) return;
    const { restoreCanvas, eraseCanvas } = getHiddenCanvases();
    const overlayCanvas = overlayCanvasRef.current;

    if (restoreCanvas) writeAlpha(restoreCanvas, step.restore, RESTORE_RGB);
    if (eraseCanvas)   writeAlpha(eraseCanvas, step.erase, ERASE_RGB);
    if (overlayCanvas) writeAlpha(overlayCanvas, step.overlay, OVERLAY_RGB);

    historyIndexRef.current = targetIndex;
    syncHistoryUI();
    notifyExternalEdit();

    const mask = getCorrectionMaskRef.current?.();
    if (mask) {
      const refined = refineMask(aiResultImageData, originalImageData, mask);
      drawResultOnDisplay(refined);
      onRefinedRef.current(refined);
    } else {
      drawResultOnDisplay(aiResultImageData);
      onRefinedRef.current(aiResultImageData);
    }
  }, [getHiddenCanvases, overlayCanvasRef, syncHistoryUI, notifyExternalEdit, aiResultImageData, originalImageData, drawResultOnDisplay]);

  const undo = useCallback(() => {
    if (historyIndexRef.current <= 0) return;
    applyHistoryStep(historyIndexRef.current - 1);
  }, [applyHistoryStep]);

  const redo = useCallback(() => {
    if (historyIndexRef.current >= historyRef.current.length - 1) return;
    applyHistoryStep(historyIndexRef.current + 1);
  }, [applyHistoryStep]);

  // ── View: zoom & pan ──────────────────────────────────────────────────────
  const stageRef = useRef<HTMLDivElement | null>(null);
  const [view, setView] = useState<View>(FIT_VIEW);
  const [handTool, setHandTool] = useState(false);
  const [spaceHeld, setSpaceHeld] = useState(false);
  const [isPanning, setIsPanning] = useState(false);
  const panRef = useRef<{ pointerId: number; startX: number; startY: number; originX: number; originY: number } | null>(null);
  const drawingPointerRef = useRef<number | null>(null);
  const panMode = handTool || spaceHeld;

  /** Zooms by `factor`, keeping the point under (clientX, clientY) fixed. */
  const zoomAt = useCallback((factor: number, clientX?: number, clientY?: number) => {
    const stage = stageRef.current;
    if (!stage) return;
    const rect = stage.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const px = (clientX ?? cx) - cx;
    const py = (clientY ?? cy) - cy;
    setView((v) => {
      const zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, v.zoom * factor));
      if (zoom === MIN_ZOOM) return FIT_VIEW;
      const k = zoom / v.zoom;
      return { zoom, x: px - k * (px - v.x), y: py - k * (py - v.y) };
    });
  }, []);

  const resetView = useCallback(() => setView(FIT_VIEW), []);

  // Wheel zoom. Attached natively because React's wheel listener is passive.
  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      zoomAt(Math.exp(-e.deltaY * 0.0015), e.clientX, e.clientY);
    };
    stage.addEventListener('wheel', onWheel, { passive: false });
    return () => stage.removeEventListener('wheel', onWheel);
  }, [zoomAt]);

  // On-screen size of one image pixel, so the cursor matches the real brush size.
  const [displayScale, setDisplayScale] = useState(1);
  const measureDisplayScale = useCallback(() => {
    const canvas = overlayCanvasRef.current;
    if (!canvas || canvas.width === 0) return;
    setDisplayScale(canvas.getBoundingClientRect().width / canvas.width);
  }, [overlayCanvasRef]);
  useLayoutEffect(() => { measureDisplayScale(); }, [view, aiResultImageData, measureDisplayScale]);
  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    const observer = new ResizeObserver(measureDisplayScale);
    observer.observe(stage);
    return () => observer.disconnect();
  }, [measureDisplayScale]);

  // ── Keyboard shortcuts ───────────────────────────────────────────────────
  useEffect(() => {
    const isTyping = (target: EventTarget | null) =>
      target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement;
    const isControl = (target: EventTarget | null) =>
      target instanceof HTMLButtonElement || (target instanceof HTMLElement && target.getAttribute('role') === 'button');

    const handleKeyDown = (e: KeyboardEvent) => {
      if (isTyping(e.target)) return;

      if (e.ctrlKey || e.metaKey) {
        const key = e.key.toLowerCase();
        if (key === 'z') {
          e.preventDefault();
          if (e.shiftKey) redo();
          else undo();
        } else if (key === 'y') {
          e.preventDefault();
          redo();
        }
        return;
      }
      if (e.altKey) return;

      if (e.key === ' ') {
        // Keep Space working on focused buttons for keyboard users.
        if (isControl(e.target)) return;
        e.preventDefault();
        if (!e.repeat) setSpaceHeld(true);
        return;
      }

      switch (e.key.toLowerCase()) {
        case 'b': setActiveTool('brush'); break;
        case 's': setActiveTool('smart'); break;
        case 'r': setBrushMode('restore'); break;
        case 'e': setBrushMode('erase'); break;
        case 'x': setBrushMode((m) => (m === 'restore' ? 'erase' : 'restore')); break;
        case 'h': setHandTool((h) => !h); break;
        case '[':
          setBrushSize((size) => BRUSH_SIZES[Math.max(0, BRUSH_SIZES.indexOf(size) - 1)] ?? size);
          break;
        case ']':
          setBrushSize((size) => BRUSH_SIZES[Math.min(BRUSH_SIZES.length - 1, BRUSH_SIZES.indexOf(size) + 1)] ?? size);
          break;
        case '+':
        case '=': zoomAt(ZOOM_STEP); break;
        case '-':
        case '_': zoomAt(1 / ZOOM_STEP); break;
        case '0': resetView(); break;
        default: return;
      }
      e.preventDefault();
    };
    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.key === ' ') setSpaceHeld(false);
    };
    const handleBlur = () => setSpaceHeld(false);

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    window.addEventListener('blur', handleBlur);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      window.removeEventListener('blur', handleBlur);
    };
  }, [undo, redo, zoomAt, resetView]);

  const handleBrushDown = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    isPointerDownRef.current = true;
    brushPointerDown(e);
  }, [brushPointerDown]);

  const handleBrushUp = useCallback(() => {
    if (isPointerDownRef.current) {
      isPointerDownRef.current = false;
      brushPointerUp();
      flushRefinement();
      captureSnapshot();
    } else brushPointerUp();
  }, [brushPointerUp, flushRefinement, captureSnapshot]);

  const handleBrushLeave = useCallback(() => {
    if (isPointerDownRef.current) {
      isPointerDownRef.current = false;
      brushPointerLeave();
      flushRefinement();
      captureSnapshot();
    } else brushPointerLeave();
  }, [brushPointerLeave, flushRefinement, captureSnapshot]);

  const { fillAt, createStrokeState, getScaledPos } = useSmartBrush();

  const handleSmartDown = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    isPointerDownRef.current = true;
    const canvas = overlayCanvasRef.current;
    if (!canvas) return;
    
    strokeVisitedRef.current = createStrokeState(aiResultImageData.width, aiResultImageData.height);
    const pos = getScaledPos(e, canvas);
    const { restoreCanvas, eraseCanvas } = getHiddenCanvases();
    
    const maskCanvas = brushMode === 'restore' ? restoreCanvas : eraseCanvas;
    const oppositeCanvas = brushMode === 'restore' ? eraseCanvas : restoreCanvas;
    if (!maskCanvas || !oppositeCanvas) return;

    fillAt(originalImageData, maskCanvas, canvas, pos.x, pos.y, brushSize, tolerance, brushMode, strokeVisitedRef.current);
    
    const oppCtx = oppositeCanvas.getContext('2d');
    if (oppCtx) {
      oppCtx.save();
      oppCtx.globalCompositeOperation = 'destination-out';
      oppCtx.drawImage(maskCanvas, 0, 0);
      oppCtx.restore();
    }
    notifyExternalEdit();
    scheduleRefinement();
  }, [overlayCanvasRef, createStrokeState, aiResultImageData, getScaledPos, getHiddenCanvases, brushMode, fillAt, originalImageData, brushSize, tolerance, notifyExternalEdit, scheduleRefinement]);
  
  const smartPointerMove = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!strokeVisitedRef.current) return;
    const canvas = overlayCanvasRef.current;
    if (!canvas) return;
    const pos = getScaledPos(e, canvas);
    const { restoreCanvas, eraseCanvas } = getHiddenCanvases();
    
    const maskCanvas = brushMode === 'restore' ? restoreCanvas : eraseCanvas;
    const oppositeCanvas = brushMode === 'restore' ? eraseCanvas : restoreCanvas;
    if (!maskCanvas || !oppositeCanvas) return;

    fillAt(originalImageData, maskCanvas, canvas, pos.x, pos.y, brushSize, tolerance, brushMode, strokeVisitedRef.current);
    
    const oppCtx = oppositeCanvas.getContext('2d');
    if (oppCtx) {
      oppCtx.save();
      oppCtx.globalCompositeOperation = 'destination-out';
      oppCtx.drawImage(maskCanvas, 0, 0);
      oppCtx.restore();
    }
    notifyExternalEdit();
    scheduleRefinement();
  }, [overlayCanvasRef, getScaledPos, getHiddenCanvases, brushMode, fillAt, originalImageData, brushSize, tolerance, notifyExternalEdit, scheduleRefinement]);

  const handleSmartUp = useCallback(() => {
    strokeVisitedRef.current = null;
    flushRefinement();
    if (isPointerDownRef.current) {
      isPointerDownRef.current = false;
      captureSnapshot();
    }
  }, [flushRefinement, captureSnapshot]);

  const handleSmartLeave = useCallback(() => {
    strokeVisitedRef.current = null;
    if (isPointerDownRef.current) {
      isPointerDownRef.current = false;
      flushRefinement();
      captureSnapshot();
    }
  }, [flushRefinement, captureSnapshot]);

  // ── Pointer dispatch: pan or paint ───────────────────────────────────────
  // Pointer Events cover mouse, touch and pen. The canvas captures the pointer, so a
  // stroke continues (and ends cleanly) even if the pointer leaves the canvas.
  const tool = activeTool === 'brush'
    ? { down: handleBrushDown, move: brushPointerMove, up: handleBrushUp, cancel: handleBrushLeave }
    : { down: handleSmartDown, move: smartPointerMove, up: handleSmartUp, cancel: handleSmartLeave };

  const onCanvasPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const isMiddle = e.pointerType === 'mouse' && e.button === 1;
    if (e.pointerType === 'mouse' && e.button !== 0 && !isMiddle) return;

    if (panMode || isMiddle) {
      e.preventDefault();
      e.currentTarget.setPointerCapture(e.pointerId);
      panRef.current = { pointerId: e.pointerId, startX: e.clientX, startY: e.clientY, originX: view.x, originY: view.y };
      setIsPanning(true);
      return;
    }

    // One stroke at a time: ignore extra fingers.
    if (drawingPointerRef.current !== null) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    drawingPointerRef.current = e.pointerId;
    tool.down(e);
  };

  const onCanvasPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const pan = panRef.current;
    if (pan && pan.pointerId === e.pointerId) {
      setView((v) => ({ ...v, x: pan.originX + e.clientX - pan.startX, y: pan.originY + e.clientY - pan.startY }));
      return;
    }
    if (drawingPointerRef.current === e.pointerId) tool.move(e);
  };

  const endPointer = (e: React.PointerEvent<HTMLCanvasElement>, cancelled: boolean) => {
    if (panRef.current?.pointerId === e.pointerId) {
      panRef.current = null;
      setIsPanning(false);
      return;
    }
    if (drawingPointerRef.current !== e.pointerId) return;
    drawingPointerRef.current = null;
    if (cancelled) tool.cancel();
    else tool.up();
  };

  const handleClear = () => {
    clearEdits();
    drawResultOnDisplay(aiResultImageData);
    onRefinedRef.current(aiResultImageData);
    captureSnapshot();
  };

  const getCursor = (): string => {
    if (panMode || isPanning) return isPanning ? 'grabbing' : 'grab';

    // Brush strokes have a diameter of `brushSize` image pixels; the smart brush
    // grows up to a radius of `brushSize`. Browsers cap custom cursors at 128 px.
    const diameter = (activeTool === 'brush' ? brushSize : brushSize * 2) * displayScale;
    const sz   = Math.round(Math.max(8, Math.min(128, diameter)));
    const half = sz / 2;
    const isDark = document.documentElement.classList.contains('dark');
    const eraseCol = '%23818cf8'; // indigo-400, the Erase colour used across the editor

    if (activeTool === 'brush') {
      const col = brushMode === 'restore' ? (isDark ? 'white' : '%230f172a') : eraseCol;
      const fop = brushMode === 'restore' ? '0.12' : '0.08';
      const svg = `data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='${sz}' height='${sz}'%3E%3Ccircle cx='${half}' cy='${half}' r='${half - 1}' stroke='${col}' stroke-width='1.5' fill='${col}' fill-opacity='${fop}'/%3E%3C/svg%3E`;
      return `url("${svg}") ${half} ${half}, crosshair`;
    }
    const col = brushMode === 'restore' ? '%2310b981' : eraseCol;
    const svg = `data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='${sz}' height='${sz}'%3E%3Ccircle cx='${half}' cy='${half}' r='${half - 1}' stroke='${col}' stroke-width='2' stroke-dasharray='4 3' fill='${col}' fill-opacity='0.07'/%3E%3Cline x1='${half}' y1='${half-4}' x2='${half}' y2='${half+4}' stroke='${col}' stroke-width='1.5'/%3E%3Cline x1='${half-4}' y1='${half}' x2='${half+4}' y2='${half}' stroke='${col}' stroke-width='1.5'/%3E%3C/svg%3E`;
    return `url("${svg}") ${half} ${half}, crosshair`;
  };

  return (
    <div className="flex h-full max-h-full w-full flex-col gap-3 overflow-hidden">
      
      {/* ── TOOLBAR PRINCIPAL ────────────────────────────────────────── */}
      <div className="flex flex-shrink-0 flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-white p-2 shadow-sm dark:border-white/[0.07] dark:bg-white/[0.03] dark:shadow-none transition-all">
        
        <div className="flex items-center gap-0.5 rounded-lg border border-slate-200/80 bg-slate-100 p-0.5 dark:border-white/[0.06] dark:bg-black/20">
          <ToolBtn active={brushMode === 'restore'} activeClass="bg-emerald-50 text-emerald-700 border border-emerald-200/80 dark:border-transparent dark:bg-emerald-500/20 dark:text-emerald-300 shadow-sm dark:shadow-none" onClick={() => setBrushMode('restore')} title="Restore removed areas (R)">
            <span className="text-[10px]" aria-hidden="true">✦</span> Restore
          </ToolBtn>
          <ToolBtn active={brushMode === 'erase'} activeClass="bg-indigo-50 text-indigo-700 border border-indigo-200/80 dark:border-transparent dark:bg-indigo-500/20 dark:text-indigo-300 shadow-sm dark:shadow-none" onClick={() => setBrushMode('erase')} title="Erase leftover background (E)">
            <span className="text-[10px]" aria-hidden="true">◌</span> Erase
          </ToolBtn>
        </div>

        <div className="h-5 w-px bg-slate-200 dark:bg-white/[0.08]" />

        <div className="flex items-center gap-0.5 rounded-lg border border-slate-200/80 bg-slate-100 p-0.5 dark:border-white/[0.06] dark:bg-black/20">
          <button type="button" onClick={undo} disabled={!historyState.canUndo} title="Undo (Ctrl+Z)" aria-label="Undo" className="flex h-6 w-6 items-center justify-center rounded-md text-slate-500 hover:bg-white hover:text-slate-900 hover:shadow-sm dark:text-slate-400 dark:hover:bg-white/[0.08] dark:hover:text-slate-100 dark:hover:shadow-none disabled:opacity-25 transition">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M3 7v6h6"/><path d="M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6 2.3L3 13"/></svg>
          </button>
          <button type="button" onClick={redo} disabled={!historyState.canRedo} title="Redo (Ctrl+Shift+Z)" aria-label="Redo" className="flex h-6 w-6 items-center justify-center rounded-md text-slate-500 hover:bg-white hover:text-slate-900 hover:shadow-sm dark:text-slate-400 dark:hover:bg-white/[0.08] dark:hover:text-slate-100 dark:hover:shadow-none disabled:opacity-25 transition">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 7v6h-6"/><path d="M3 17a9 9 0 0 1 9-9 9 9 0 0 1 6 2.3l3 2.7"/></svg>
          </button>
        </div>

        <div className="h-5 w-px bg-slate-200 dark:bg-white/[0.08]" />

        <div className="flex items-center gap-0.5 rounded-lg border border-slate-200/80 bg-slate-100 p-0.5 dark:border-white/[0.06] dark:bg-black/20">
          <ToolBtn active={activeTool === 'brush'} activeClass="bg-white text-cyan-700 border border-slate-200/80 shadow-sm dark:border-transparent dark:bg-cyan-500/20 dark:text-cyan-300 dark:shadow-none" onClick={() => setActiveTool('brush')} title="Freehand brush (B)">
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/></svg>
            Brush
          </ToolBtn>
          <ToolBtn active={activeTool === 'smart'} activeClass="bg-white text-cyan-700 border border-slate-200/80 shadow-sm dark:border-transparent dark:bg-cyan-500/20 dark:text-cyan-300 dark:shadow-none" onClick={() => setActiveTool('smart')} title="Smart brush: selects by colour similarity (S)">
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275Z"/></svg>
            Smart
          </ToolBtn>
        </div>

        <div className="h-5 w-px bg-slate-200 dark:bg-white/[0.08]" />

        <div className="flex items-center gap-1.5">
          <span className="text-[9px] font-medium uppercase tracking-widest text-slate-400 dark:text-slate-600">Size</span>
          <div className="flex items-center gap-1">
            {BRUSH_SIZES.map((size) => (
              <button key={size} type="button" onClick={() => setBrushSize(size)} title={`${size}px ([ / ])`} aria-label={`Brush size ${size} pixels`} aria-pressed={brushSize === size} className={`flex h-6 w-6 items-center justify-center rounded-full transition-all ${brushSize === size ? 'bg-cyan-50 dark:bg-cyan-400/15 ring-1 ring-cyan-500/40 dark:ring-cyan-400/50' : 'hover:bg-slate-100 dark:hover:bg-white/[0.05]'}`}>
                <span className={`rounded-full transition-colors ${brushSize === size ? 'bg-cyan-600 dark:bg-cyan-400' : 'bg-slate-400 dark:bg-slate-600'}`} style={{ width: Math.max(3, Math.min(14, size / 5)), height: Math.max(3, Math.min(14, size / 5)) }} />
              </button>
            ))}
          </div>
        </div>

        {activeTool === 'smart' && (
          <>
            <div className="h-5 w-px bg-slate-200 dark:bg-white/[0.08]" />
            <div className="flex items-center gap-1.5">
              <span className="text-[9px] font-medium uppercase tracking-widest text-slate-400 dark:text-slate-600">Tolerance</span>
              <div className="flex items-center gap-0.5">
                {TOLERANCE_PRESETS.map(({ label, value }) => (
                  <button key={value} type="button" onClick={() => setTolerance(value)} title={`RGB distance ≤ ${value}`} aria-pressed={tolerance === value} className={`rounded-md px-2 py-1 text-[10px] font-medium transition-all ${tolerance === value ? 'bg-cyan-50 text-cyan-700 ring-1 ring-cyan-500/30 dark:bg-cyan-400/15 dark:text-cyan-300 dark:ring-cyan-400/40' : 'text-slate-500 hover:text-slate-900 dark:hover:text-slate-300'}`}>
                    {label}
                  </button>
                ))}
              </div>
            </div>
          </>
        )}

        <div className="h-5 w-px bg-slate-200 dark:bg-white/[0.08]" />

        <div className="flex items-center gap-0.5 rounded-lg border border-slate-200/80 bg-slate-100 p-0.5 dark:border-white/[0.06] dark:bg-black/20">
          <ToolBtn active={handTool} activeClass="bg-white text-cyan-700 border border-slate-200/80 shadow-sm dark:border-transparent dark:bg-cyan-500/20 dark:text-cyan-300 dark:shadow-none" onClick={() => setHandTool((h) => !h)} title="Pan: drag to move the image (H, or hold Space)">
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M18 11V6a2 2 0 0 0-4 0"/><path d="M14 10V4a2 2 0 0 0-4 0v2"/><path d="M10 10.5V6a2 2 0 0 0-4 0v8"/><path d="M18 8a2 2 0 1 1 4 0v6a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.86-5.99-2.34l-3.6-3.6a2 2 0 0 1 2.83-2.82L7 15"/></svg>
            Pan
          </ToolBtn>
          <button type="button" onClick={() => zoomAt(1 / ZOOM_STEP)} disabled={view.zoom <= MIN_ZOOM} title="Zoom out (−)" aria-label="Zoom out" className="flex h-6 w-6 items-center justify-center rounded-md text-slate-500 hover:bg-white hover:text-slate-900 dark:text-slate-400 dark:hover:bg-white/[0.08] dark:hover:text-slate-100 disabled:opacity-25 transition">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true"><path d="M5 12h14"/></svg>
          </button>
          <button type="button" onClick={resetView} title="Fit to screen (0)" aria-label={`Zoom ${Math.round(view.zoom * 100)}%. Fit to screen`} className="min-w-[3rem] rounded-md px-1.5 py-1 text-[10px] font-medium tabular-nums text-slate-600 hover:bg-white hover:text-slate-900 dark:text-slate-300 dark:hover:bg-white/[0.08] transition">
            {Math.round(view.zoom * 100)}%
          </button>
          <button type="button" onClick={() => zoomAt(ZOOM_STEP)} disabled={view.zoom >= MAX_ZOOM} title="Zoom in (+)" aria-label="Zoom in" className="flex h-6 w-6 items-center justify-center rounded-md text-slate-500 hover:bg-white hover:text-slate-900 dark:text-slate-400 dark:hover:bg-white/[0.08] dark:hover:text-slate-100 disabled:opacity-25 transition">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true"><path d="M5 12h14"/><path d="M12 5v14"/></svg>
          </button>
        </div>

        {hasEdits && (
          <button type="button" onClick={handleClear} className="ml-auto rounded-lg px-2.5 py-1.5 text-[10px] font-medium text-slate-500 ring-1 ring-slate-200 hover:bg-indigo-50 hover:text-indigo-600 dark:ring-white/[0.06] dark:hover:bg-transparent dark:hover:text-indigo-400 transition">
            Clear
          </button>
        )}
      </div>

      {/* ── CANVAS AREA ─────────────────────────────────────────────────── */}
      <div ref={stageRef} className="relative min-h-0 flex-1 overflow-hidden rounded-xl border border-slate-200 dark:border-white/[0.06] flex items-center justify-center bg-white dark:bg-black/20 shadow-sm dark:shadow-none transition-colors" style={{ touchAction: 'none' }}>
        <div className="relative flex items-center justify-center h-full w-full p-2">
          <div
            className="relative max-h-full max-w-full will-change-transform"
            style={{
              aspectRatio: `${aiResultImageData.width} / ${aiResultImageData.height}`,
              transform: `translate(${view.x}px, ${view.y}px) scale(${view.zoom})`,
              transformOrigin: 'center',
            }}
          >
            <canvas ref={displayCanvasRef} className="block h-full w-full object-contain" style={{ imageRendering: 'pixelated' }} />
            <canvas ref={overlayCanvasRef} className="absolute inset-0 h-full w-full object-contain" style={{ cursor: getCursor(), touchAction: 'none' }}
              onPointerDown={onCanvasPointerDown}
              onPointerMove={onCanvasPointerMove}
              onPointerUp={(e) => endPointer(e, false)}
              onPointerCancel={(e) => endPointer(e, true)}
              onContextMenu={(e) => e.preventDefault()}
              aria-label="Mask editor canvas"
            />
          </div>
        </div>

        <div className="pointer-events-none absolute bottom-3 right-3">
          <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-medium backdrop-blur-md shadow-sm dark:shadow-none ${brushMode === 'restore' ? 'border-emerald-500/30 bg-emerald-50/90 text-emerald-800 dark:border-emerald-500/25 dark:bg-emerald-500/10 dark:text-emerald-300' : 'border-indigo-500/30 bg-indigo-50/90 text-indigo-800 dark:border-indigo-500/25 dark:bg-indigo-500/10 dark:text-indigo-300'}`}>
            <span className={`h-1.5 w-1.5 rounded-full ${brushMode === 'restore' ? 'bg-emerald-500 dark:bg-emerald-400' : 'bg-indigo-500 dark:bg-indigo-400'}`} />
            {brushMode === 'restore' ? 'Restoring' : 'Erasing'}
            {activeTool === 'smart' && <span className="ml-1 opacity-60">· Smart</span>}
          </span>
        </div>
      </div>
    </div>
  );
}

function ToolBtn({ children, active, activeClass, onClick, title }: { children: React.ReactNode; active: boolean; activeClass: string; onClick: () => void; title?: string; }) {
  return (
    <button type="button" onClick={onClick} title={title} aria-pressed={active} className={`flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-[11px] font-medium transition-all ${active ? activeClass : 'text-slate-500 hover:text-slate-900 dark:hover:text-slate-300'}`}>
      {children}
    </button>
  );
}