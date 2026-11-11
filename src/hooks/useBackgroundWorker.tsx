import React, { useEffect, useRef, useState } from 'react';
import { sileo } from 'sileo';
import BackgroundRemoverWorker from '../workers/backgroundRemover.worker?worker';
import type {
  WorkerIncomingMessage,
  WorkerOutgoingMessage,
  WorkerResultMessage,
} from '../workers/backgroundRemover.types';

type UploadStatus = 'idle' | 'uploading' | 'loaded';
type ProcessingStatus = 'idle' | 'processing' | 'done' | 'error';


export type WorkerState = {
  modelStatus: 'idle' | 'loading' | 'ready' | 'error';
  modelProgress?: number;
  modelPhase?: string;
  uploadStatus: UploadStatus;
  processingStatus: ProcessingStatus;
};


export function useBackgroundWorker(
  latestRequestIdRef: React.MutableRefObject<string | null>,
  onSuccess: (id: string, imageData: ImageData) => void
) {
  const [state, setState] = useState<WorkerState>({
    modelStatus: 'idle',
    uploadStatus: 'idle',
    processingStatus: 'idle',
  });

  const [activeModelId, setActiveModelId] = useState<string | null>(null);

  const workerRef = useRef<Worker | null>(null);
  const lastProgressUpdateRef = useRef(0);
  // Bumping this terminates the current worker and starts a fresh one (see cancelModelLoading).
  const [workerGeneration, setWorkerGeneration] = useState(0);

  useEffect(() => {
    const worker = new BackgroundRemoverWorker();
    workerRef.current = worker;

    const handleMessage = (event: MessageEvent<WorkerOutgoingMessage>) => {
      const message = event.data;

      if (message.type === 'model-progress') {
        const now = Date.now();
        // Throttle progress updates to one every 150 ms.
        if (now - lastProgressUpdateRef.current < 150) return;
        lastProgressUpdateRef.current = now;

        const percentage = Math.max(0, Math.min(100, Math.round(message.progress)));
        
        setState((prev) => ({ 
          ...prev, 
          modelStatus: 'loading',
          modelProgress: percentage,
          modelPhase: message.phase || 'Downloading weights'
        }));
        return;
      }

      if (message.type === 'status') {
        if (message.status === 'ready') {
          setState((prev) => ({ ...prev, modelStatus: 'ready' }));
          // Small delay so the success toast doesn't appear abruptly.
          setTimeout(() => {
            sileo.success({
              title: 'AI model ready',
              description: 'Everything runs locally.',
              duration: 3000,
            });
          }, 800);
        } else if (message.status === 'error') {
          setState((prev) => ({ ...prev, modelStatus: 'error' }));
          sileo.error({ title: 'Error', description: message.message });
        }
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

        sileo.success({
          title: 'Background removed',
          duration: 2200,
        });

        setState((prev) => ({ ...prev, processingStatus: 'done' }));
        onSuccess(id, imageData);
        return;
      }

      if (message.type === 'error') {
        sileo.error({
          title: 'Processing error',
          description: message.message,
          duration: 4000,
        });
        setState((prev) => ({ ...prev, processingStatus: 'error' }));
      }
    };

    const handleError = (event: ErrorEvent) => {
      event.preventDefault();
      sileo.error({
        title: 'Worker error',
        description: 'Please reload the page.',
      });
      setState((prev) => ({ ...prev, modelStatus: 'error', processingStatus: 'error' }));
    };

    worker.addEventListener('message', handleMessage);
    worker.addEventListener('error', handleError);

    return () => {
      worker.removeEventListener('message', handleMessage);
      worker.removeEventListener('error', handleError);
      worker.terminate();
    };
  }, [onSuccess, latestRequestIdRef, workerGeneration]);



  const initModel = (modelId: string) => {
    setActiveModelId(modelId);
    const message: WorkerIncomingMessage = { type: 'init', modelId };
    workerRef.current?.postMessage(message);
  };

  // The model is passed explicitly: reading `activeModelId` here would see a stale
  // value when called right after `initModel` in the same event handler.
  const processImage = (id: string, imageData: ImageData, modelId: string) => {
    setActiveModelId(modelId);
    const message: WorkerIncomingMessage = { type: 'process-image', id, imageData, modelId };
    workerRef.current?.postMessage(message);
  };

  /**
   * Aborts a model download in progress. Transformers.js can't cancel a download,
   * so the worker is terminated and replaced; any pending request is dropped.
   */
  const cancelModelLoading = () => {
    latestRequestIdRef.current = null;
    setActiveModelId(null);
    setState((prev) => ({
      ...prev,
      modelStatus: 'idle',
      modelProgress: undefined,
      modelPhase: undefined,
      processingStatus: 'idle',
    }));
    setWorkerGeneration((g) => g + 1);
  };

  return { state, setState, initModel, processImage, cancelModelLoading, activeModelId };
}