import { useCallback, useEffect, useRef, useState } from 'react';
import { Toaster, sileo } from 'sileo';
import { Dropzone } from './components/Dropzone';
import { ImageCompareSlider } from './components/ImageCompareSlider';
import { EditorLayout } from './components/EditorLayout';
import { Header } from './components/Header';
import { LoadingOverlay } from './components/LoadingOverlay';
import { ModelPicker } from './components/ModelPicker';
import {
  canvasToPngBlob,
  composeFullResolution,
  downloadBlob,
  imageDataToCanvas,
  imageDataToObjectUrl,
  loadImageFile,
} from './lib/imageUtils';
import { detectBackend } from './lib/backend';
import { DEFAULT_MODEL_ID, type Backend } from './config/models';
import { useBackgroundWorker } from './hooks/useBackgroundWorker';

function App() {
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    if (typeof document !== 'undefined') {
      return document.documentElement.classList.contains('dark') ? 'dark' : 'light';
    }
    return 'dark';
  });

  const toggleTheme = () => {
    const next = theme === 'dark' ? 'light' : 'dark';
    setTheme(next);
    document.documentElement.classList.toggle('dark', next === 'dark');
    localStorage.setItem('clearcut-theme', next);
  };


  const mousePos = useRef({ x: 0, y: 0 });
  const blobRef = useRef<HTMLDivElement>(null);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
  mousePos.current = { x: e.clientX, y: e.clientY };
	
  if (blobRef.current) {
		// Apliquem la transformació directament al DOM per evitar re-renders constants
		blobRef.current.style.transform = `translate(${mousePos.current.x - 200}px, ${mousePos.current.y - 200}px)`;
  }
  }, []);

  /** Object URL of the uploaded file (full resolution), for display. */
  const [originalSrc, setOriginalSrc] = useState<string | null>(null);
  /** Downscaled copy used for inference and the mask editor. */
  const [originalImageData, setOriginalImageData] = useState<ImageData | null>(null);
  /** Original-resolution copy used to compose the exported PNG. */
  const fullCanvasRef = useRef<HTMLCanvasElement | null>(null);

  const [aiResultImageData, setAiResultImageData] = useState<ImageData | null>(null);
  /** Model that produced `aiResultImageData`. */
  const [resultModelId, setResultModelId] = useState<string | null>(null);
  /** Latest editor output. Kept in a ref: it changes every frame while painting. */
  const refinedRef = useRef<ImageData | null>(null);
  /** Editor output committed when leaving the editor; drives the preview. */
  const [refinedImageData, setRefinedImageData] = useState<ImageData | null>(null);
  const [displaySrc, setDisplaySrc] = useState<string | null>(null);

  const [animationKey, setAnimationKey] = useState<string>('');
  const [isEditing, setIsEditing] = useState(false);
  const [selectedModel, setSelectedModel] = useState<string>(DEFAULT_MODEL_ID);
  const [backend, setBackend] = useState<Backend | null>(null);

  const latestRequestIdRef = useRef<string | null>(null);
  const latestRequestModelRef = useRef<string | null>(null);

  useEffect(() => {
    detectBackend().then(setBackend);
  }, []);

  const handleWorkerSuccess = useCallback((id: string, imageData: ImageData) => {
    setAiResultImageData(imageData);
    setResultModelId(latestRequestModelRef.current);
    refinedRef.current = null;
    setRefinedImageData(null);
    setIsEditing(false);
    setAnimationKey(id);
  }, []);

  const { state, setState, processImage } = useBackgroundWorker(latestRequestIdRef, handleWorkerSuccess);

  // Preview URL: encoded asynchronously as a PNG blob (no base64), revoked when replaced.
  useEffect(() => {
    const data = refinedImageData ?? aiResultImageData;
    if (!data) {
      setDisplaySrc(null);
      return;
    }
    let cancelled = false;
    let url: string | null = null;
    imageDataToObjectUrl(data)
      .then((u) => {
        if (cancelled) URL.revokeObjectURL(u);
        else { url = u; setDisplaySrc(u); }
      })
      .catch(() => sileo.error({ title: 'Preview error', description: 'Could not render the result.' }));
    return () => {
      cancelled = true;
      if (url) URL.revokeObjectURL(url);
    };
  }, [refinedImageData, aiResultImageData]);

  // Release the uploaded file's object URL when it's replaced or on unmount.
  useEffect(() => () => { if (originalSrc) URL.revokeObjectURL(originalSrc); }, [originalSrc]);

  const runProcessing = (imageData: ImageData, modelId: string) => {
    const requestId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    latestRequestIdRef.current = requestId;
    latestRequestModelRef.current = modelId;
    // The worker downloads/loads the model on demand before processing.
    processImage(requestId, imageData, modelId);
    setState((prev) => ({ ...prev, processingStatus: 'processing' }));
  };

  // Selecting a card never starts a download by itself: the model is loaded on the
  // next upload, or when the user explicitly re-processes the current image.
  const onSelectModel = (modelId: string) => setSelectedModel(modelId);

  const onReprocess = () => {
    if (!originalImageData) return;
    setIsEditing(false);
    runProcessing(originalImageData, selectedModel);
  };

  const onFileSelected = async (file: File) => {
    setState((prev) => ({ ...prev, uploadStatus: 'uploading', processingStatus: 'idle' }));
    sileo.info({ title: 'Image loaded', description: 'Analyzing subject…', duration: 2500 });

    try {
      const { imageData, fullCanvas, objectUrl } = await loadImageFile(file);
      fullCanvasRef.current = fullCanvas;
      setOriginalSrc(objectUrl);
      setOriginalImageData(imageData);
      setAiResultImageData(null);
      setResultModelId(null);
      refinedRef.current = null;
      setRefinedImageData(null);
      setAnimationKey('');
      setIsEditing(false);
      setState((prev) => ({ ...prev, uploadStatus: 'loaded' }));

      runProcessing(imageData, selectedModel);
    } catch {
      sileo.error({ title: 'File error', description: 'Could not load image.' });
      setState((prev) => ({ ...prev, uploadStatus: 'idle', processingStatus: 'error' }));
    }
  };

  const onDownload = async () => {
    const result = refinedRef.current ?? aiResultImageData;
    if (!result) return;
    try {
      const canvas = fullCanvasRef.current
        ? composeFullResolution(fullCanvasRef.current, result)
        : imageDataToCanvas(result);
      downloadBlob(await canvasToPngBlob(canvas), 'clearcut-background-removed.png');
      sileo.success({
        title: 'Downloaded',
        description: `PNG saved successfully (${canvas.width}×${canvas.height}).`,
        duration: 3000,
      });
    } catch {
      sileo.error({ title: 'Download error', description: 'Failed to save asset.' });
    }
  };

  const onRefined = useCallback((refined: ImageData) => {
    refinedRef.current = refined;
  }, []);

  const onExitEditor = () => {
    setRefinedImageData(refinedRef.current);
    setIsEditing(false);
  };

  const isProcessing = state.processingStatus === 'processing';
  const isDone = state.processingStatus === 'done';
  const canEdit = !!(originalSrc && aiResultImageData && originalImageData);
  const canReprocess = !!originalImageData && !isProcessing && selectedModel !== resultModelId;

	return (
		<div 
		className="relative min-h-screen w-full overflow-x-hidden text-slate-900 dark:text-slate-50 antialiased transition-colors duration-300"
		onMouseMove={handleMouseMove}
		>
		{/* Fons "Líquid" Interactiu */}
		<div className="fixed inset-0 -z-10 bg-slate-50 dark:bg-[#060a10] overflow-hidden transition-colors duration-300">
		
		{/* Bombolla interactiva (el "blob" del ratolí) */}
		<div 
			ref={blobRef}
			className="pointer-events-none fixed h-96 w-96 rounded-full bg-cyan-500/20 blur-[128px] dark:bg-cyan-500/10 transition-transform duration-500 ease-out will-change-transform"
		/>
		
		{/* Bombolles orgàniques */}
		{/* He rebaixat l'opacitat en mode light perquè no siguin massa invasives */}
		<div className="absolute -top-[10%] -left-[10%] h-[600px] w-[600px] rounded-full bg-cyan-500/20 blur-[128px] dark:bg-cyan-500/10 animate-drift" />
		<div className="absolute top-[20%] -right-[10%] h-[500px] w-[500px] rounded-full bg-teal-500/20 blur-[128px] dark:bg-teal-500/10 animate-swirl [animation-delay:-7s]" />
		<div className="absolute -bottom-[10%] left-[20%] h-[400px] w-[400px] rounded-full bg-indigo-500/20 blur-[128px] dark:bg-indigo-500/10 animate-breathe [animation-delay:-4s]" />
		</div>
      {/* ── Header ───────────────────────────────────────────────────────── */}
      <Header isEditing={isEditing} modelStatus={state.modelStatus} theme={theme} onToggleTheme={toggleTheme} />

      {/* ── Main content ─────────────────────────────────────────────────── */}
      <main className={`flex-1 ${isEditing ? 'overflow-hidden' : ''}`}>
        
        {/* ── EDITOR MODE (Únic i exclusiu) ── */}
        {canEdit && isEditing && (
          <EditorLayout
            originalImageData={originalImageData!}
            aiResultImageData={aiResultImageData!}
            onRefined={onRefined}
            onDownload={onDownload}
            onExit={onExitEditor}
          />
        )}

        {/* ── DEFAULT MODE ── */}
        {!isEditing && (
          <div className="mx-auto flex w-full max-w-2xl flex-col gap-10 px-4 pb-16 pt-8 sm:px-6 sm:pt-12">
            
            <div className="space-y-3">
              <div className="inline-flex items-center gap-2 rounded-full bg-cyan-500/10 px-3 py-1 text-[11px] font-medium text-cyan-700 dark:text-cyan-300 ring-1 ring-cyan-500/20">
                <span className="h-1 w-1 rounded-full bg-cyan-500 dark:bg-cyan-400" />
                Runs entirely in your browser — no uploads, no server
              </div>
              <h1 className="text-3xl font-bold tracking-tight text-slate-900 dark:text-white sm:text-4xl">
                Cut out backgrounds<br />
                <span className="bg-gradient-to-r from-cyan-600 to-teal-600 dark:from-cyan-300 dark:to-teal-400 bg-clip-text text-transparent">
                  instantly.
                </span>
              </h1>
              <p className="text-sm text-slate-600 dark:text-slate-400">
                Drop any photo. The AI removes the background on-device — your images never leave this tab.
              </p>
            </div>

            <ModelPicker
              selectedModel={selectedModel}
              resultModelId={resultModelId}
              backend={backend}
              isProcessing={isProcessing}
              canReprocess={canReprocess}
              onSelect={onSelectModel}
              onReprocess={onReprocess}
            />

            <section className="rounded-2xl border border-slate-200 dark:border-white/[0.07] bg-white dark:bg-white/[0.03] p-5 shadow-sm dark:shadow-none transition-all">
              <Dropzone onFileSelected={onFileSelected} disabled={isProcessing || state.modelStatus === 'loading'} />
            </section>

            {originalSrc && (
              <section className="space-y-4">
                {/* ── Substitueix el contenidor <div className="flex items-center justify-between">... fins al tancament de la secció de botó ── */}
				<div className="flex items-center justify-between">
				<p className="text-xs font-medium text-slate-500 dark:text-slate-400">
					{isProcessing ? (
					<span className="inline-flex items-center gap-2">
						<span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-cyan-500 dark:bg-cyan-400" />
						Removing background…
					</span>
					) : null}
				</p>
				
				{isDone && displaySrc && (
					<button 
					type="button" 
					onClick={onDownload} 
					className="group relative inline-flex items-center gap-2 overflow-hidden rounded-full bg-cyan-500 px-6 py-2.5 text-sm font-bold text-slate-950 transition-all hover:scale-[1.02] hover:bg-cyan-400 hover:shadow-[0_0_20px_-5px_rgba(34,211,238,0.5)] active:scale-[0.98]"
					>
					{/* Icona de descàrrega */}
					<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
						<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>
					</svg>
					Download Result
					</button>
				)}
				</div>
                {displaySrc ? (
                  <div className="overflow-hidden rounded-2xl ring-1 ring-slate-200 dark:ring-white/10 shadow-md dark:shadow-none">
                    <ImageCompareSlider originalSrc={originalSrc} processedSrc={displaySrc} animationKey={animationKey} />
                  </div>
                ) : (
                  <div className="flex h-56 items-center justify-center rounded-2xl border border-slate-200 dark:border-white/[0.06] bg-slate-100 dark:bg-white/[0.02]">
                    <div className="flex flex-col items-center gap-2">
                      <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-cyan-500 dark:bg-cyan-400" />
                      <span className="text-[11px] text-slate-500">Processing…</span>
                    </div>
                  </div>
                )}

                {canEdit && (
                  <button type="button" onClick={() => setIsEditing(true)} className="group flex w-full items-center justify-between rounded-xl border border-slate-200 dark:border-white/[0.07] bg-white dark:bg-white/[0.03] px-4 py-3 text-left hover:border-cyan-500/30 hover:bg-cyan-50 dark:hover:bg-cyan-500/[0.04] transition shadow-sm dark:shadow-none">
                    <div className="flex items-center gap-3">
                      <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 ring-1 ring-cyan-500/20">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>
                      </span>
                      <div>
                        <p className="text-xs font-medium text-slate-800 dark:text-slate-200">Refine edges</p>
                        <p className="text-[10px] text-slate-500">Fix areas the AI missed</p>
                      </div>
                    </div>
                    <svg className="text-slate-400 dark:text-slate-600 group-hover:translate-x-0.5 transition" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m9 18 6-6-6-6"/></svg>
                  </button>
                )}
              </section>
            )}
          </div>
        )}
      </main>
      
      {/* sileo's Toaster only supports position, offset, theme and default options. */}
      <Toaster
        position="bottom-left"
        offset={20}
        theme={theme === 'dark' ? 'light' : 'dark'}
        options={{ duration: 3500 }}
      />

      {state.modelStatus === 'loading' && (
        <LoadingOverlay progress={state.modelProgress} phase={state.modelPhase} />
      )}
    </div>
  );
}

export default App;	