import { useCallback, useEffect, useRef, useState } from 'react';
import { Dropzone } from './components/Dropzone';
import { ModelStatus, ModelStatusBanner } from './components/ModelStatusBanner';
import { ImageCompareSlider } from './components/ImageCompareSlider';
import { MaskEditorOverlay } from './components/MaskEditorOverlay';
import {
  fileToImageData,
  imageDataToDataUrl,
  imageDataToPngBlob,
} from './lib/imageUtils';
import BackgroundRemoverWorker from './workers/backgroundRemover.worker?worker';
import type {
  WorkerIncomingMessage,
  WorkerOutgoingMessage,
  WorkerResultMessage,
  WorkerStatusMessage,
} from './workers/backgroundRemover.types';

type UploadStatus = 'idle' | 'uploading' | 'loaded';
type ProcessingStatus = 'idle' | 'processing' | 'done' | 'error';

type WorkerState = {
  modelStatus: ModelStatus;
  modelMessage?: string;
  modelProgress?: number;
  modelPhase?: string;
  uploadStatus: UploadStatus;
  processingStatus: ProcessingStatus;
  errorMessage?: string;
};

function App() {
  const [state, setState] = useState<WorkerState>({
    modelStatus: 'idle',
    uploadStatus: 'idle',
    processingStatus: 'idle',
  });

  const [originalSrc, setOriginalSrc] = useState<string | null>(null);
  const [processedSrc, setProcessedSrc] = useState<string | null>(null);
  const [animationKey, setAnimationKey] = useState<string>('');
  const latestRequestIdRef = useRef<string | null>(null);
  const workerRef = useRef<Worker | null>(null);
  const [aiResultImageData, setAiResultImageData] = useState<ImageData | null>(null);
  const [originalImageData, setOriginalImageData] = useState<ImageData | null>(null);
  const [refinedSrc, setRefinedSrc] = useState<string | null>(null);
  const [isEditing, setIsEditing] = useState(false);

  useEffect(() => {
    const worker = new BackgroundRemoverWorker();
    workerRef.current = worker;

    const handleMessage = (event: MessageEvent<WorkerOutgoingMessage>) => {
      const message = event.data;

      if (message.type === 'status') {
        const { status, message: text } = message as WorkerStatusMessage;
        setState((prev) => ({
          ...prev,
          modelStatus: status === 'loading-model' ? 'loading' : status === 'ready' ? 'ready' : 'error',
          modelMessage: text,
          modelProgress: status === 'ready' ? 100 : prev.modelProgress,
          modelPhase: status === 'ready' ? 'Model ready' : prev.modelPhase,
        }));
        return;
      }
      if (message.type === 'model-progress') {
        setState((prev) => ({
          ...prev,
          modelStatus: prev.modelStatus === 'idle' ? 'loading' : prev.modelStatus,
          modelProgress: message.progress,
          modelPhase: message.phase ?? prev.modelPhase,
        }));
        return;
      }
      if (message.type === 'processing') {
        setState((prev) => ({
          ...prev,
          processingStatus: message.status === 'started' ? 'processing' : 'done',
        }));
        return;
      }
      if (message.type === 'result') {
        const { id, imageData } = message as WorkerResultMessage;
        if (latestRequestIdRef.current && id !== latestRequestIdRef.current) return;
        const url = imageDataToDataUrl(imageData);
        setAiResultImageData(imageData);
        setRefinedSrc(null);
        setIsEditing(false);
        setProcessedSrc((prev) => { if (prev) URL.revokeObjectURL(prev); return url; });
        setState((prev) => ({ ...prev, processingStatus: 'done' }));
        setAnimationKey(id);
        return;
      }
      if (message.type === 'error') {
        setState((prev) => ({ ...prev, processingStatus: 'error', errorMessage: message.message }));
      }
    };

    const handleError = (event: ErrorEvent) => {
      event.preventDefault();
      setState((prev) => ({
        ...prev,
        modelStatus: 'error',
        processingStatus: prev.processingStatus === 'processing' ? 'error' : prev.processingStatus,
        errorMessage: 'An internal AI worker error occurred. Please reload the page and try again.',
        modelMessage: event.message,
      }));
    };

    worker.addEventListener('message', handleMessage);
    worker.addEventListener('error', handleError);
    worker.postMessage({ type: 'reset' } as WorkerIncomingMessage);
    worker.postMessage({ type: 'init' } as WorkerIncomingMessage);
    setState((prev) => ({ ...prev, modelStatus: 'loading', modelProgress: 5, modelPhase: 'Starting model…' }));

    return () => {
      worker.removeEventListener('message', handleMessage);
      worker.removeEventListener('error', handleError);
      worker.terminate();
    };
  }, []);

  useEffect(() => {
    if (state.modelStatus !== 'loading') return;
    const id = window.setTimeout(() => {
      setState((prev) => {
        if (prev.modelStatus !== 'loading') return prev;
        return { ...prev, modelStatus: 'error', modelMessage: prev.modelMessage ?? 'Model loading is taking longer than expected. Please reload the page.' };
      });
    }, 20000);
    return () => window.clearTimeout(id);
  }, [state.modelStatus]);

  const onFileSelected = async (file: File) => {
    setState((prev) => ({ ...prev, uploadStatus: 'uploading', processingStatus: 'idle', errorMessage: undefined }));
    try {
      const { imageData, dataUrl } = await fileToImageData(file, 1024);
      setOriginalSrc(dataUrl);
      setOriginalImageData(imageData);
      setProcessedSrc(null);
      setAnimationKey('');
      setIsEditing(false);
      setState((prev) => ({ ...prev, uploadStatus: 'loaded' }));
      const requestId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      latestRequestIdRef.current = requestId;
      workerRef.current?.postMessage({ type: 'process-image', id: requestId, imageData } as WorkerIncomingMessage);
      setState((prev) => ({ ...prev, processingStatus: 'processing' }));
    } catch {
      setState((prev) => ({ ...prev, uploadStatus: 'idle', processingStatus: 'error', errorMessage: 'There was a problem loading this image. Please try another file.' }));
    }
  };

  const onDownload = async () => {
    const srcToDownload = refinedSrc ?? processedSrc;
    if (!srcToDownload) return;
    try {
      const img = await new Promise<HTMLImageElement>((resolve, reject) => {
        const image = new Image();
        image.onload = () => resolve(image);
        image.onerror = reject;
        image.src = srcToDownload;
      });
      const canvas = document.createElement('canvas');
      canvas.width = img.width; canvas.height = img.height;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.drawImage(img, 0, 0);
      const blob = await imageDataToPngBlob(ctx.getImageData(0, 0, canvas.width, canvas.height));
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url; link.download = 'clearcut-background-removed.png'; link.click();
      URL.revokeObjectURL(url);
    } catch { /* silent */ }
  };

  const onRefined = useCallback((refined: ImageData) => {
    const url = imageDataToDataUrl(refined);
    setRefinedSrc((prev) => { if (prev) URL.revokeObjectURL(prev); return url; });
    setProcessedSrc((prev) => { if (prev) URL.revokeObjectURL(prev); return url; });
  }, []);

  const isProcessing = state.processingStatus === 'processing';
  const isDone = state.processingStatus === 'done';
  const displaySrc = refinedSrc ?? processedSrc;
  const canEdit = !!(originalSrc && displaySrc && aiResultImageData && originalImageData);

  return (
    <div className="min-h-screen bg-[#060a10] text-slate-50 flex flex-col">

      {/* ── Header ───────────────────────────────────────────────────────── */}
      <header
        className={`sticky top-0 z-30 flex items-center justify-between px-5 sm:px-8 transition-all duration-500 ease-out ${
          isEditing
            ? 'py-2.5 border-b border-white/[0.05] bg-[#060a10]/95 backdrop-blur-xl'
            : 'py-4 bg-transparent'
        }`}
      >
        <div className="flex items-center gap-3">
          {/* Logo mark */}
          <div className="relative flex h-8 w-8 items-center justify-center">
            <div className="absolute inset-0 rounded-xl bg-gradient-to-br from-cyan-400 to-teal-500 opacity-90" />
            <div className="absolute inset-0 rounded-xl ring-1 ring-white/10" />
            <svg className="relative" width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path d="M3 8.5C3 5.46 5.46 3 8.5 3S14 5.46 14 8.5" stroke="#0a0f1a" strokeWidth="2" strokeLinecap="round"/>
              <path d="M5.5 11C5.5 9.62 6.62 8.5 8 8.5s2.5 1.12 2.5 2.5" stroke="#0a0f1a" strokeWidth="2" strokeLinecap="round"/>
              <circle cx="8" cy="13" r="1.25" fill="#0a0f1a"/>
            </svg>
          </div>
          <div>
            <span className="text-sm font-semibold tracking-tight text-white">ClearCut</span>
            <span className="ml-2 hidden text-[11px] text-slate-500 sm:inline">Background remover</span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <span className={`hidden items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-medium sm:flex ${
            state.modelStatus === 'ready'
              ? 'bg-emerald-500/10 text-emerald-300 ring-1 ring-emerald-500/20'
              : state.modelStatus === 'error'
              ? 'bg-red-500/10 text-red-300 ring-1 ring-red-500/20'
              : 'bg-amber-500/10 text-amber-300 ring-1 ring-amber-500/20'
          }`}>
            <span className={`h-1.5 w-1.5 rounded-full ${
              state.modelStatus === 'ready' ? 'bg-emerald-400' : state.modelStatus === 'error' ? 'bg-red-400' : 'bg-amber-400 animate-pulse'
            }`} />
            {state.modelStatus === 'ready' ? 'On-device AI ready' : state.modelStatus === 'error' ? 'Model error' : 'Loading AI…'}
          </span>
          <a
            href="https://github.com/NIU1710710/ClearCut"
            target="_blank"
            rel="noreferrer"
            className="flex h-7 items-center gap-1.5 rounded-full px-3 text-[11px] font-medium text-slate-400 ring-1 ring-white/10 transition hover:text-slate-200 hover:ring-white/20"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <path d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0 1 12 6.844a9.59 9.59 0 0 1 2.504.337c1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.02 10.02 0 0 0 22 12.017C22 6.484 17.522 2 12 2z"/>
            </svg>
            GitHub
          </a>
        </div>
      </header>

      {/* ── Main content ─────────────────────────────────────────────────── */}
      <main className="flex-1">

        {/* ── EDITOR MODE: full-bleed split layout ─────────────────────── */}
        {/* En lloc de destriure'l amb !isEditing, simplement l'amaguem amb CSS (hidden) */}
        {canEdit && (
          <div className={isEditing ? 'block' : 'hidden'}>
            <div className="flex h-[calc(100vh-48px)] flex-col lg:flex-row">

              {/* Left: image canvas — full height, dark bg for contrast */}
              <div className="relative flex flex-1 items-center justify-center overflow-hidden bg-[#04070d] lg:border-r lg:border-white/[0.06]">
                <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top_left,rgba(34,211,238,0.04),transparent_60%)]" />
                <div className="h-full w-full p-4 sm:p-6 lg:p-8">
                  <MaskEditorOverlay
                    originalImageData={originalImageData!}
                    aiResultImageData={aiResultImageData!}
                    onRefined={onRefined}
                  />
                </div>
              </div>

              {/* Right: controls panel */}
              <aside className="flex w-full flex-col gap-5 overflow-y-auto border-t border-white/[0.06] bg-[#080c14] px-5 py-5 lg:w-72 lg:border-t-0 xl:w-80">
                <div>
                  <p className="text-[10px] font-medium uppercase tracking-widest text-slate-500">Editing</p>
                  <h2 className="mt-1 text-base font-semibold text-slate-100">Refine edges</h2>
                  <p className="mt-1 text-[11px] leading-relaxed text-slate-500">
                    Paint over areas where the AI missed. Restore brings back removed pixels, Erase removes extra background.
                  </p>
                </div>

                <div className="h-px bg-white/[0.06]" />

                <div className="space-y-2.5">
                  <p className="text-[10px] font-medium uppercase tracking-widest text-slate-600">Tips</p>
                  {[
                    { icon: '⚡', text: 'Smart brush auto-selects by colour similarity' },
                    { icon: '🎯', text: 'Lower tolerance = more precise edges' },
                    { icon: '↕', text: 'Adjust brush size for fine vs. broad strokes' },
                  ].map(({ icon, text }) => (
                    <div key={text} className="flex items-start gap-2.5">
                      <span className="mt-px text-sm leading-none">{icon}</span>
                      <p className="text-[11px] leading-relaxed text-slate-500">{text}</p>
                    </div>
                  ))}
                </div>

                <div className="h-px bg-white/[0.06]" />

                <div className="mt-auto flex flex-col gap-2.5">
                  <button
                    type="button"
                    onClick={onDownload}
                    disabled={!displaySrc}
                    className="flex w-full items-center justify-center gap-2 rounded-xl bg-cyan-400 px-4 py-2.5 text-sm font-semibold text-slate-950 transition hover:bg-cyan-300 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>
                    </svg>
                    Download PNG
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsEditing(false)}
                    className="flex w-full items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-medium text-slate-400 ring-1 ring-white/10 transition hover:text-slate-200 hover:ring-white/20"
                  >
                    ← Back to preview
                  </button>
                </div>
              </aside>
            </div>
          </div>
        )}

        {/* ── DEFAULT MODE: single column ──────────────────────────────── */}
        <div className={!isEditing ? 'block' : 'hidden'}>
          <div className="mx-auto flex w-full max-w-2xl flex-col gap-10 px-4 pb-16 pt-8 sm:px-6 sm:pt-12">
            
            {/* Hero text */}
            <div className="space-y-3">
              <div className="inline-flex items-center gap-2 rounded-full bg-cyan-500/10 px-3 py-1 text-[11px] font-medium text-cyan-300 ring-1 ring-cyan-500/20">
                <span className="h-1 w-1 rounded-full bg-cyan-400" />
                Runs entirely in your browser — no uploads, no server
              </div>
              <h1 className="text-3xl font-bold tracking-tight text-white sm:text-4xl">
                Cut out backgrounds<br />
                <span className="bg-gradient-to-r from-cyan-300 to-teal-400 bg-clip-text text-transparent">
                  instantly.
                </span>
              </h1>
              <p className="text-sm text-slate-400">
                Drop any photo. The AI removes the background on-device — your images never leave this tab.
              </p>
            </div>

            {/* Model status */}
            {state.modelStatus !== 'idle' && (
              <ModelStatusBanner
                status={state.modelStatus}
                message={state.modelMessage}
                progress={state.modelProgress}
                phase={state.modelPhase}
              />
            )}

            {/* Upload card */}
            <section className="rounded-2xl border border-white/[0.07] bg-white/[0.03] p-5">
              <Dropzone
                onFileSelected={onFileSelected}
                disabled={isProcessing || state.modelStatus === 'idle' || state.modelStatus === 'loading'}
              />
              {state.errorMessage && (
                <p className="mt-3 text-xs text-rose-400">{state.errorMessage}</p>
              )}
            </section>

            {/* Result area */}
            {originalSrc && (
              <section className="space-y-4">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-medium text-slate-400">
                    {isProcessing ? (
                      <span className="inline-flex items-center gap-2">
                        <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-cyan-400" />
                        Removing background…
                      </span>
                    ) : isDone ? 'Done' : ''}
                  </p>
                  {isDone && displaySrc && (
                    <button
                      type="button"
                      onClick={onDownload}
                      className="inline-flex items-center gap-1.5 rounded-full bg-cyan-400 px-3.5 py-1.5 text-[11px] font-semibold text-slate-950 transition hover:bg-cyan-300 active:scale-95"
                    >
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>
                      </svg>
                      Download PNG
                    </button>
                  )}
                </div>

                {displaySrc ? (
                  <div className="overflow-hidden rounded-2xl">
                    <ImageCompareSlider
                      originalSrc={originalSrc}
                      processedSrc={displaySrc}
                      animationKey={animationKey}
                    />
                  </div>
                ) : (
                  <div className="flex h-56 items-center justify-center rounded-2xl border border-white/[0.06] bg-white/[0.02]">
                    <div className="flex flex-col items-center gap-2">
                      <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-cyan-400" />
                      <span className="text-[11px] text-slate-500">Processing…</span>
                    </div>
                  </div>
                )}

                {canEdit && (
                  <button
                    type="button"
                    onClick={() => setIsEditing(true)}
                    className="group flex w-full items-center justify-between rounded-xl border border-white/[0.07] bg-white/[0.03] px-4 py-3 text-left transition hover:border-cyan-500/30 hover:bg-cyan-500/[0.04]"
                  >
                    <div className="flex items-center gap-3">
                      <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-cyan-500/10 text-cyan-400 ring-1 ring-cyan-500/20">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/>
                        </svg>
                      </span>
                      <div>
                        <p className="text-xs font-medium text-slate-200">Refine edges</p>
                        <p className="text-[10px] text-slate-500">Fix areas the AI missed</p>
                      </div>
                    </div>
                    <svg className="text-slate-600 transition group-hover:translate-x-0.5 group-hover:text-slate-400" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="m9 18 6-6-6-6"/>
                    </svg>
                  </button>
                )}
              </section>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}

export default App;