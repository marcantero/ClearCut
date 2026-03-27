import { useEffect, useMemo, useRef, useState } from 'react';
import { Dropzone } from './components/Dropzone';
import { ModelStatus, ModelStatusBanner } from './components/ModelStatusBanner';
import { ImageCompareSlider } from './components/ImageCompareSlider';
import {
  fileToImageData,
  imageDataToDataUrl,
  imageDataToPngBlob,
} from './lib/imageUtils';
import type {
  WorkerIncomingMessage,
  WorkerOutgoingMessage,
  WorkerResultMessage,
  WorkerStatusMessage,
} from './workers/backgroundRemover.worker';

type UploadStatus = 'idle' | 'uploading' | 'loaded';
type ProcessingStatus = 'idle' | 'processing' | 'done' | 'error';

type WorkerState = {
  modelStatus: ModelStatus;
  modelMessage?: string;
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
  const latestRequestIdRef = useRef<string | null>(null);

  const worker = useMemo(
    () =>
      new Worker(
        new URL('./workers/backgroundRemover.worker.ts', import.meta.url),
        { type: 'module' },
      ),
    [],
  );

  useEffect(() => {
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
        }));
        return;
      }

      if (message.type === 'processing') {
        setState((prev) => ({
          ...prev,
          processingStatus:
            message.status === 'started'
              ? 'processing'
              : prev.processingStatus,
        }));
        return;
      }

      if (message.type === 'result') {
        const { id, imageData } = message as WorkerResultMessage;

        if (latestRequestIdRef.current && id !== latestRequestIdRef.current) {
          return;
        }

        const url = imageDataToDataUrl(imageData);
        setProcessedSrc((prev) => {
          if (prev) URL.revokeObjectURL(prev);
          return url;
        });

        setState((prev) => ({
          ...prev,
          processingStatus: 'done',
        }));
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

    worker.addEventListener('message', handleMessage);

    // Kick off model initialization early
    const initMessage: WorkerIncomingMessage = { type: 'init' };
    worker.postMessage(initMessage);
    setState((prev) => ({ ...prev, modelStatus: 'loading' }));

    return () => {
      worker.removeEventListener('message', handleMessage);
      worker.terminate();
    };
  }, [worker]);

  const onFileSelected = async (file: File) => {
    setState((prev) => ({
      ...prev,
      uploadStatus: 'uploading',
      processingStatus: 'idle',
      errorMessage: undefined,
    }));

    try {
      const { imageData, dataUrl } = await fileToImageData(file, 1024);

      setOriginalSrc((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return dataUrl;
      });
      setProcessedSrc(null);

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
      worker.postMessage(message);

      setState((prev) => ({
        ...prev,
        processingStatus: 'processing',
      }));
    } catch (error: any) {
      setState((prev) => ({
        ...prev,
        uploadStatus: 'idle',
        processingStatus: 'error',
        errorMessage: error?.message ?? 'Error processant la imatge',
      }));
    }
  };

  const onDownload = async () => {
    if (state.processingStatus !== 'done') return;
    if (!processedSrc) return;

    try {
      // Recarreguem la imatge processada en un canvas per extreure ImageData
      const img = await new Promise<HTMLImageElement>((resolve, reject) => {
        const image = new Image();
        image.onload = () => resolve(image);
        image.onerror = (err) => reject(err);
        image.src = processedSrc;
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
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Failed to download PNG', error);
    }
  };

  const isProcessing = state.processingStatus === 'processing';

  return (
    <div className="min-h-screen bg-slate-950 text-slate-50">
      <div className="mx-auto flex max-w-5xl flex-col gap-8 px-4 py-8 lg:py-12">
        <header className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
              ClearCut
            </h1>
            <p className="mt-2 max-w-xl text-sm text-slate-400">
              Elimina el fons de les teves fotos amb IA 100% en local.
              Sense pujar res al servidor. Tot passa al teu navegador.
            </p>
          </div>
          <div className="flex flex-col items-start gap-2 text-xs text-slate-500 sm:items-end">
            <span className="rounded-full border border-slate-800 bg-slate-900/70 px-3 py-1 font-medium text-slate-300">
              Web AI · React · Transformers.js
            </span>
            <span>Execució totalment local · Privacitat preservada</span>
          </div>
        </header>

        <ModelStatusBanner
          status={state.modelStatus}
          message={state.modelMessage}
        />

        <main className="grid gap-8 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] items-start">
          <section className="space-y-4">
            <Dropzone onFileSelected={onFileSelected} disabled={isProcessing} />
            {state.errorMessage && (
              <p className="text-xs text-red-400">{state.errorMessage}</p>
            )}
            {isProcessing && (
              <div className="mt-2 flex items-center gap-2 text-xs text-slate-400">
                <span className="inline-flex h-2 w-2 animate-pulse rounded-full bg-brand-500" />
                <span>Processant imatge amb IA…</span>
              </div>
            )}
          </section>

          <section className="space-y-4">
            <h2 className="text-sm font-medium text-slate-200">Resultat</h2>
            {!originalSrc && (
              <p className="text-xs text-slate-500">
                Puja una imatge per veure la comparació abans/després.
              </p>
            )}
            {originalSrc && processedSrc && (
              <ImageCompareSlider
                originalSrc={originalSrc}
                processedSrc={processedSrc}
              />
            )}
            {originalSrc && !processedSrc && (
              <div className="relative flex h-64 items-center justify-center rounded-2xl border border-slate-800 bg-slate-900/60 text-xs text-slate-400">
                {isProcessing ? 'Retallant el fons…' : 'Preparat per processar'}
              </div>
            )}

            <div className="flex gap-2 pt-2">
              <button
                type="button"
                onClick={onDownload}
                disabled={state.processingStatus !== 'done' || !processedSrc}
                className="inline-flex items-center gap-2 rounded-full bg-brand-500 px-4 py-2 text-xs font-medium text-white shadow-sm transition hover:bg-brand-600 disabled:cursor-not-allowed disabled:bg-slate-700 disabled:text-slate-300"
              >
                <span>Descarrega PNG</span>
              </button>
            </div>
          </section>
        </main>
      </div>
    </div>
  );
}

export default App;
