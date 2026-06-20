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

	// Initialize and manage the background-removal worker
	useEffect(() => {
		const worker = new BackgroundRemoverWorker();
		workerRef.current = worker;

		const handleMessage = (event: MessageEvent<WorkerOutgoingMessage>) => {
			const message = event.data;

			if (message.type === 'status') {
				const { status, message: text } = message as WorkerStatusMessage;
				setState((prev) => ({
					...prev,
					modelStatus:
						status === 'loading-model'
							? 'loading'
							: status === 'ready'
							? 'ready'
							: 'error',
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

				if (latestRequestIdRef.current && id !== latestRequestIdRef.current) {
					return;
				}

				const url = imageDataToDataUrl(imageData);
				setAiResultImageData(imageData);
				setRefinedSrc(null);
				setIsEditing(false);
				setProcessedSrc((prev) => {
					if (prev) URL.revokeObjectURL(prev);
					return url;
				});

				setState((prev) => ({
					...prev,
					processingStatus: 'done',
				}));

				setAnimationKey(id);
				return;
			}

			if (message.type === 'error') {
				setState((prev) => ({
					...prev,
					processingStatus: 'error',
					errorMessage: message.message,
				}));
			}
		};

		const handleError = (event: ErrorEvent) => {
			event.preventDefault();
			console.error('Worker error', event);
			setState((prev) => ({
				...prev,
				modelStatus: 'error',
				processingStatus:
					prev.processingStatus === 'processing' ? 'error' : prev.processingStatus,
				errorMessage:
					"An internal AI worker error occurred. Please reload the page and try again.",
				modelMessage: event.message,
			}));
		};

		worker.addEventListener('message', handleMessage);
		worker.addEventListener('error', handleError);

		const resetMessage: WorkerIncomingMessage = { type: 'reset' };
		worker.postMessage(resetMessage);

		const initMessage: WorkerIncomingMessage = { type: 'init' };
		worker.postMessage(initMessage);
		setState((prev) => ({
			...prev,
			modelStatus: 'loading',
			modelProgress: 5,
			modelPhase: 'Starting model…',
		}));

		return () => {
			worker.removeEventListener('message', handleMessage);
			worker.removeEventListener('error', handleError);
			worker.terminate();
		};
	}, []);

	// Safety timeout if model loading hangs too long
	useEffect(() => {
		if (state.modelStatus !== 'loading') return;

		const timeoutId = window.setTimeout(() => {
			setState((prev) => {
				if (prev.modelStatus !== 'loading') return prev;
				return {
					...prev,
					modelStatus: 'error',
					modelMessage:
						prev.modelMessage ??
						'Model loading is taking longer than expected. Please reload the page and check your connection.',
				};
			});
		}, 20000);

		return () => window.clearTimeout(timeoutId);
	}, [state.modelStatus]);

	const onFileSelected = async (file: File) => {
		setState((prev) => ({
			...prev,
			uploadStatus: 'uploading',
			processingStatus: 'idle',
			errorMessage: undefined,
		}));

		try {
			const { imageData, dataUrl } = await fileToImageData(file, 1024);

			setOriginalSrc(dataUrl);
			setOriginalImageData(imageData);
			setProcessedSrc(null);
			setAnimationKey('');

			setState((prev) => ({
				...prev,
				uploadStatus: 'loaded',
			}));

			const requestId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
			latestRequestIdRef.current = requestId;

			const message: WorkerIncomingMessage = {
				type: 'process-image',
				id: requestId,
				imageData,
			};
			workerRef.current?.postMessage(message);

			setState((prev) => ({
				...prev,
				processingStatus: 'processing',
			}));
		} catch (error) {
			console.error('Failed to process image', error);
			setState((prev) => ({
				...prev,
				uploadStatus: 'idle',
				processingStatus: 'error',
				errorMessage: 'There was a problem loading this image. Please try another file.',
			}));
		}
	};

	const onDownload = async () => {
		const srcToDownload = refinedSrc ?? processedSrc;
		if (!srcToDownload) return;

		try {
			const img = await new Promise<HTMLImageElement>((resolve, reject) => {
				const image = new Image();
				image.onload = () => resolve(image);
				image.onerror = (err) => reject(err);
				image.src = srcToDownload;
			});

			const canvas = document.createElement('canvas');
			canvas.width = img.width;
			canvas.height = img.height;
			const ctx = canvas.getContext('2d');
			if (!ctx) return;
			ctx.drawImage(img, 0, 0);
			const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);

			const blob = await imageDataToPngBlob(imageData);
			const url = URL.createObjectURL(blob);

			const link = document.createElement('a');
			link.href = url;
			link.download = 'clearcut-background-removed.png';
			link.click();
			URL.revokeObjectURL(url);
		} catch (error) {
			console.error('Failed to download PNG', error);
		}
	};

	const onRefined = useCallback((refined: ImageData) => {
		const url = imageDataToDataUrl(refined);
		setRefinedSrc((prev) => {
			if (prev) URL.revokeObjectURL(prev);
			return url;
		});
		// We also update processedSrc so the download and preview use the corrected version
		setProcessedSrc((prev) => {
			if (prev) URL.revokeObjectURL(prev);
			return url;
		});
	}, []);

	const isProcessing = state.processingStatus === 'processing';

	// The src shown in the compare slider: prefer refined version if it exists
	const displaySrc = refinedSrc ?? processedSrc;

	return (
		<div className="min-h-screen bg-slate-950 text-slate-50">
			<div className="pointer-events-none fixed inset-0 overflow-hidden">
				<div className="absolute inset-x-10 top-32 h-64 rounded-[40%] bg-[radial-gradient(circle_at_10%_20%,rgba(56,189,248,0.25),transparent_55%),radial-gradient(circle_at_80%_80%,rgba(45,212,191,0.25),transparent_55%)] opacity-40 blur-3xl" />
			</div>

			<div className="relative mx-auto flex min-h-screen max-w-6xl flex-col gap-8 px-4 pb-10 pt-6 sm:px-6 sm:pt-8 lg:px-8">
				<header className="flex items-center justify-between gap-4">
					<div className="flex items-center gap-3">
						<div className="flex h-9 w-9 items-center justify-center rounded-2xl bg-gradient-to-br from-cyan-400 to-emerald-400 text-slate-950 shadow-[0_0_0_1px_rgba(15,23,42,0.9)]">
							<span className="text-base font-semibold">CC</span>
						</div>
						<div className="space-y-0.5">
							<h1 className="text-base font-semibold tracking-tight text-slate-50 sm:text-lg">
								ClearCut
							</h1>
							<p className="text-[11px] text-slate-400">
								Background remover in your browser.
							</p>
						</div>
					</div>
					<div className="flex items-center gap-2 text-[11px] text-slate-300">
						<a
							href="https://github.com/NIU1710710/ClearCut"
							target="_blank"
							rel="noreferrer"
							className="inline-flex items-center gap-1.5 rounded-full border border-slate-700 bg-slate-900/80 px-3 py-1 font-medium text-slate-200 hover:border-slate-500 hover:bg-slate-800 transition-colors"
						>
							<span className="h-1.5 w-1.5 rounded-full bg-slate-400" />
							<span>GitHub</span>
						</a>
						<span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-400/30 bg-emerald-400/10 px-3 py-1 font-medium text-emerald-100">
							<span className="h-1.5 w-1.5 rounded-full bg-emerald-300" />
							<span>On-device AI</span>
						</span>
					</div>
				</header>

				<main className="flex-1 flex justify-center">
					<div className="w-full max-w-3xl space-y-5">
						<section className="flex flex-col gap-4">
							<div className="space-y-3">
								<h2 className="text-2xl font-semibold tracking-tight text-slate-50 sm:text-3xl">
									Remove backgrounds in seconds.
								</h2>
								<ModelStatusBanner
									status={state.modelStatus}
									message={state.modelMessage}
									progress={state.modelProgress}
									phase={state.modelPhase}
								/>
								{isProcessing && (
									<p className="text-[11px] text-slate-400">Processing image…</p>
								)}
							</div>
						</section>

						<section className="flex flex-col gap-5">
							<div className="overflow-hidden rounded-3xl border border-slate-800/80 bg-slate-950/80 shadow-[0_22px_80px_rgba(15,23,42,0.95)] backdrop-blur-xl transition-transform duration-300 ease-out hover:-translate-y-0.5 hover:shadow-[0_26px_90px_rgba(15,23,42,1)]">
								<div className="border-b border-slate-900/80 px-4 py-3.5 sm:px-5">
									<div className="flex items-center justify-between gap-3 text-[11px] text-slate-300">
										<div className="flex items-center gap-2">
											<span className="font-medium uppercase tracking-[0.16em]">1 · Upload</span>
										</div>
										{state.uploadStatus === 'loaded' && (
											<span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-emerald-200/90">
												Ready
											</span>
										)}
									</div>
								</div>

								<div className="p-4 sm:p-5">
									<Dropzone
										onFileSelected={onFileSelected}
										disabled={
											isProcessing ||
											state.modelStatus === 'idle' ||
											state.modelStatus === 'loading'
										}
									/>

									{state.errorMessage && (
										<p className="mt-2 text-xs text-rose-300/90">{state.errorMessage}</p>
									)}
								</div>
							</div>

							<div className="overflow-hidden rounded-3xl border border-slate-800/80 bg-slate-950/80 shadow-[0_22px_80px_rgba(15,23,42,0.95)] backdrop-blur-xl transition-transform duration-300 ease-out hover:-translate-y-0.5 hover:shadow-[0_26px_90px_rgba(15,23,42,1)]">
								<div className="border-b border-slate-900/80 px-4 py-3.5 sm:px-5">
									<div className="flex items-center justify-between gap-3 text-[11px] text-slate-300">
										<div className="flex items-center gap-2">
											<span className="font-medium uppercase tracking-[0.16em]">2 · Preview</span>
										</div>
										{state.processingStatus === 'done' && displaySrc && (
											<span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-emerald-200/90">
												Done
											</span>
										)}
									</div>
								</div>

								<div className="p-4 sm:p-5">
									{!originalSrc && (
										<div className="relative flex h-64 flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-slate-800/80 bg-slate-950/70 text-xs text-slate-400">
											<div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(34,211,238,0.18),transparent_55%),radial-gradient(circle_at_bottom,_rgba(15,23,42,0.95),transparent_65%)] opacity-80" />
											<div className="relative flex flex-col items-center gap-1.5">
												<span className="inline-flex h-8 w-8 items-center justify-center rounded-2xl bg-slate-900/90 text-lg">
													🖼️
												</span>
												<p className="text-[11px] text-slate-300">Your preview will appear here.</p>
											</div>
										</div>
									)}

									{originalSrc && displaySrc && !isEditing && (
										<ImageCompareSlider
											originalSrc={originalSrc}
											processedSrc={displaySrc}
											animationKey={animationKey}
										/>
									)}

									{originalSrc && displaySrc && aiResultImageData && originalImageData && (
										<div className="mt-3 space-y-3">
											<button
												type="button"
												onClick={() => setIsEditing((v) => !v)}
												className="inline-flex items-center gap-2 rounded-full border border-slate-700 bg-slate-900 px-3 py-1.5 text-[11px] font-medium text-slate-300 transition hover:border-cyan-500/40 hover:text-cyan-300"
											>
												<span>{isEditing ? '✕ Close editor' : '✦ Refine edges'}</span>
											</button>

											{isEditing && (
												<MaskEditorOverlay
													originalImageData={originalImageData}
													aiResultImageData={aiResultImageData}
													onRefined={onRefined}
												/>
											)}
										</div>
									)}

									{originalSrc && !displaySrc && (
										<div className="relative flex h-64 items-center justify-center overflow-hidden rounded-2xl border border-slate-800/80 bg-slate-950/70 text-xs text-slate-400">
											<div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(34,211,238,0.16),transparent_55%),radial-gradient(circle_at_bottom,_rgba(15,23,42,0.9),transparent_60%)] opacity-70" />
											<div className="relative flex flex-col items-center gap-2">
												<span className="inline-flex h-2 w-2 animate-pulse rounded-full bg-cyan-400" />
												<span className="text-[11px] text-slate-300">
													{isProcessing ? 'Removing background…' : 'Ready to process'}
												</span>
											</div>
										</div>
									)}

									<div className="mt-4 flex items-center justify-between gap-3 pt-1">
										<button
											type="button"
											onClick={onDownload}
											disabled={state.processingStatus !== 'done' || !displaySrc}
											className="inline-flex items-center gap-2 rounded-full bg-cyan-400 px-4 py-2 text-xs font-medium text-slate-950 shadow-[0_10px_40px_rgba(8,47,73,0.9)] transition hover:bg-cyan-300 disabled:cursor-not-allowed disabled:bg-slate-800 disabled:text-slate-300"
										>
											<span className="text-sm">⬇</span>
											<span>Download PNG</span>
										</button>
									</div>
								</div>
							</div>
						</section>
					</div>
				</main>
			</div>
		</div>
	);
}

export default App;