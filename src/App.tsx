import { useCallback, useRef, useState } from 'react';
import { Toaster, sileo } from 'sileo';
import { Dropzone } from './components/Dropzone';
import { ImageCompareSlider } from './components/ImageCompareSlider';
import { MaskEditorOverlay } from './components/MaskEditorOverlay';
import {
  fileToImageData,
  imageDataToDataUrl,
  imageDataToPngBlob,
} from './lib/imageUtils';
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

  const [originalSrc, setOriginalSrc] = useState<string | null>(null);
  const [processedSrc, setProcessedSrc] = useState<string | null>(null);
  const [animationKey, setAnimationKey] = useState<string>('');
  const [aiResultImageData, setAiResultImageData] = useState<ImageData | null>(null);
  const [originalImageData, setOriginalImageData] = useState<ImageData | null>(null);
  const [refinedSrc, setRefinedSrc] = useState<string | null>(null);
  const [isEditing, setIsEditing] = useState(false);

  const latestRequestIdRef = useRef<string | null>(null);

  const handleWorkerSuccess = useCallback((id: string, imageData: ImageData) => {
    const url = imageDataToDataUrl(imageData);
    setAiResultImageData(imageData);
    setRefinedSrc(null);
    setIsEditing(false);
    setProcessedSrc((prev) => { if (prev) URL.revokeObjectURL(prev); return url; });
    setAnimationKey(id);
  }, []);

  const { state, setState, processImage } = useBackgroundWorker(latestRequestIdRef, handleWorkerSuccess);

  const onFileSelected = async (file: File) => {
    setState((prev) => ({ ...prev, uploadStatus: 'uploading', processingStatus: 'idle' }));
    sileo.info({ title: 'Image loaded', description: 'Analyzing subject…', duration: 2500 });

    try {
      const { imageData, dataUrl } = await fileToImageData(file, 1024);
      setOriginalSrc(dataUrl); setOriginalImageData(imageData); setProcessedSrc(null);
      setAnimationKey(''); setIsEditing(false);
      setState((prev) => ({ ...prev, uploadStatus: 'loaded' }));

      const requestId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      latestRequestIdRef.current = requestId;
      processImage(requestId, imageData);
      setState((prev) => ({ ...prev, processingStatus: 'processing' }));
    } catch {
      sileo.error({ title: 'File error', description: 'Could not load image.' });
      setState((prev) => ({ ...prev, uploadStatus: 'idle', processingStatus: 'error' }));
    }
  };

  const onDownload = async () => {
    const srcToDownload = refinedSrc ?? processedSrc;
    if (!srcToDownload) return;
    try {
      const img = await new Promise<HTMLImageElement>((res, rej) => {
        const image = new Image(); image.onload = () => res(image); image.onerror = rej; image.src = srcToDownload;
      });
      const canvas = document.createElement('canvas'); canvas.width = img.width; canvas.height = img.height;
      const ctx = canvas.getContext('2d'); if (!ctx) return;
      ctx.drawImage(img, 0, 0);
      const blob = await imageDataToPngBlob(ctx.getImageData(0, 0, canvas.width, canvas.height));
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a'); link.href = url; link.download = 'clearcut-background-removed.png'; link.click();
      URL.revokeObjectURL(url);
      sileo.success({ title: 'Downloaded', description: 'PNG saved successfully.', duration: 3000 });
    } catch {
      sileo.error({ title: 'Download error', description: 'Failed to save asset.' });
    }
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
      <header
        className={`sticky top-0 z-30 flex items-center justify-between px-5 sm:px-8 transition-all duration-500 ease-out ${
          isEditing
            ? 'py-2.5 border-b border-slate-200 dark:border-white/[0.05] bg-white/80 dark:bg-[#060a10]/95 backdrop-blur-xl'
            : 'py-4 bg-transparent'
        }`}
      >
		<div className="flex items-center gap-3">
		{/* LOGO DEFINITIU */}
		<div className="relative flex h-8 w-8 items-center justify-center">
			<div 
				className="w-full h-full object-contain text-slate-900 dark:text-white transition-colors duration-300"
				dangerouslySetInnerHTML={{ 
				__html: `
					<svg viewBox="0 0 120 120" fill="currentColor">
					<rect x="20" y="20" width="60" height="60" rx="12" fill="currentColor" />
					<rect x="40" y="40" width="60" height="60" rx="12" fill="none" stroke="currentColor" stroke-width="8" />
					<rect x="0" y="56" width="120" height="8" fill="currentColor" transform="rotate(-45 60 60)" />
					</svg>
				` 
				}}
			/>
		</div>
		
		<div>
			<span className="text-sm font-semibold tracking-tight text-slate-900 dark:text-white">ClearCut</span>
			<span className="ml-2 hidden text-[11px] text-slate-500 sm:inline">Background remover</span>
		</div>
		</div>

        <div className="flex items-center gap-2.5">
			
          <span className={`hidden items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-medium sm:flex ${
            state.modelStatus === 'ready'
              ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 ring-1 ring-emerald-500/20'
              : state.modelStatus === 'error'
              ? 'bg-red-500/10 text-red-700 dark:text-red-300 ring-1 ring-red-500/20'
              : 'bg-amber-500/10 text-amber-700 dark:text-amber-300 ring-1 ring-amber-500/20'
          }`}>
            <span className={`h-1.5 w-1.5 rounded-full ${
              state.modelStatus === 'ready' ? 'bg-emerald-500 dark:bg-emerald-400' : state.modelStatus === 'error' ? 'bg-red-500 dark:bg-red-400' : 'bg-amber-500 dark:bg-amber-400 animate-pulse'
            }`} />
            {state.modelStatus === 'ready' ? 'On-device AI ready' : state.modelStatus === 'error' ? 'Model error' : 'Loading AI…'}
          </span>

          <button
            onClick={toggleTheme}
            className="flex h-7 w-7 items-center justify-center rounded-full text-slate-600 dark:text-slate-400 ring-1 ring-slate-200 dark:ring-white/10 hover:bg-slate-200/60 dark:hover:bg-white/10 transition"
            aria-label="Canviar tema"
          >
            {theme === 'dark' ? (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2"/><path d="M12 20v2"/><path d="m4.93 4.93 1.41 1.41"/><path d="m17.66 17.66 1.41 1.41"/><path d="M2 12h2"/><path d="M20 12h2"/><path d="m6.34 17.66-1.41 1.41"/><path d="m19.07 4.93-1.41 1.41"/></svg>
            ) : (
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/></svg>
            )}
          </button>

          <a
            href="https://github.com/NIU1710710/ClearCut"
            target="_blank" rel="noreferrer"
            className="flex h-7 items-center gap-1.5 rounded-full px-3 text-[11px] font-medium text-slate-600 dark:text-slate-400 ring-1 ring-slate-200 dark:ring-white/10 transition hover:text-slate-900 dark:hover:text-slate-200 hover:bg-slate-200/60 dark:hover:bg-white/10"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0 1 12 6.844a9.59 9.59 0 0 1 2.504.337c1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.02 10.02 0 0 0 22 12.017C22 6.484 17.522 2 12 2z"/></svg>
            GitHub
          </a>
        </div>
      </header>

      {/* ── Main content ─────────────────────────────────────────────────── */}
      <main className={`flex-1 ${isEditing ? 'overflow-hidden' : ''}`}>
        
        {/* ── EDITOR MODE (Únic i exclusiu) ── */}
        {canEdit && isEditing && (
          <div className="flex h-[calc(100vh-60px)] w-full flex-col overflow-hidden lg:flex-row">
            <div className="relative flex flex-1 items-center justify-center overflow-hidden bg-slate-100 dark:bg-[#04070d] lg:border-r border-slate-200 dark:border-white/[0.06] transition-colors duration-300">
              <MaskEditorOverlay originalImageData={originalImageData!} aiResultImageData={aiResultImageData!} onRefined={onRefined} />
            </div>

            <aside className="flex w-full flex-col gap-5 overflow-y-auto border-t border-slate-200 dark:border-white/[0.06] bg-white dark:bg-[#080c14] px-5 py-5 lg:w-72 lg:border-t-0 xl:w-80">
              <div>
                <p className="text-[10px] font-medium uppercase tracking-widest text-slate-400 dark:text-slate-500">Editing</p>
                <h2 className="mt-1 text-base font-semibold text-slate-900 dark:text-slate-100">Refine edges</h2>
                <p className="mt-1 text-[11px] leading-relaxed text-slate-500">
                  Paint over areas where the AI missed. Restore brings back removed pixels, Erase removes extra background.
                </p>
              </div>

              <div className="h-px bg-slate-100 dark:bg-white/[0.06]" />

              <div className="space-y-2.5">
                <p className="text-[10px] font-medium uppercase tracking-widest text-slate-400 dark:text-slate-600">Tips</p>
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

              <div className="h-px bg-slate-100 dark:bg-white/[0.06]" />

              <div className="mt-auto flex flex-col gap-2.5">
                <button type="button" onClick={onDownload} disabled={!displaySrc} className="flex w-full items-center justify-center gap-2 rounded-xl bg-cyan-400 px-4 py-2.5 text-sm font-semibold text-slate-950 transition hover:bg-cyan-300 active:scale-[0.98] disabled:opacity-40">
                  Download PNG
                </button>
                <button type="button" onClick={() => setIsEditing(false)} className="flex w-full items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-medium text-slate-600 dark:text-slate-400 ring-1 ring-slate-200 dark:ring-white/10 hover:bg-slate-100 dark:hover:bg-white/5 transition">
                  ← Back to preview
                </button>
              </div>
            </aside>
          </div>
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

            <section className="rounded-2xl border border-slate-200 dark:border-white/[0.07] bg-white dark:bg-white/[0.03] p-5 shadow-sm dark:shadow-none transition-all">
              <Dropzone onFileSelected={onFileSelected} disabled={isProcessing || state.modelStatus === 'idle' || state.modelStatus === 'loading'} />
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
      
      {/* ── Toaster nativa 100% calibrada ── */}
      <Toaster
        position="bottom-left"
        expand
        closeButton
        offset={20}
        gap={10}
        visibleToasts={4}
        theme={theme === 'dark' ? 'light' : 'dark'}
        toastOptions={{
          duration: 3500,
          classNames: {
            toast: '!rounded-2xl border bg-white text-slate-900 border-slate-200 shadow-xl dark:bg-[#0b1220] dark:text-slate-50 dark:border-cyan-500/20 dark:shadow-[0_20px_60px_rgba(0,0,0,0.5)] !backdrop-blur-xl transition-all duration-300',
            title: '!font-semibold text-slate-900 dark:text-white',
            description: 'text-slate-500 dark:text-slate-400',
            icon: 'text-cyan-500 dark:text-cyan-400',
            success: '!border-emerald-500/30',
            error: '!border-red-500/30',
            warning: '!border-amber-500/30',
            info: '!border-cyan-500/30',
            closeButton: 'bg-slate-50 dark:bg-[#0f172a] text-slate-500 dark:text-slate-400 border-slate-200 dark:border-cyan-500/15 hover:bg-slate-100 dark:hover:bg-[#1e293b]',
          },
        }}
      />
    </div>
  );
}

export default App;	