import { pipeline } from '@xenova/transformers';

// Types shared with main thread
export type WorkerInitMessage = { type: 'init' };
export type WorkerProcessMessage = {
  type: 'process-image';
  id: string;
  imageData: ImageData;
};

export type WorkerIncomingMessage = WorkerInitMessage | WorkerProcessMessage;

export type WorkerStatusMessage = {
  type: 'status';
  status: 'loading-model' | 'ready' | 'error';
  message?: string;
};

export type WorkerResultMessage = {
  type: 'result';
  id: string;
  imageData: ImageData;
};

export type WorkerProcessingMessage = {
  type: 'processing';
  id: string;
  status: 'started' | 'finished';
};

export type WorkerErrorMessage = {
  type: 'error';
  id?: string;
  message: string;
};

export type WorkerOutgoingMessage =
  | WorkerStatusMessage
  | WorkerResultMessage
  | WorkerProcessingMessage
  | WorkerErrorMessage;

let segmenterPromise: Promise<any> | null = null;

async function getSegmenter() {
  if (!segmenterPromise) {
    // Notify main thread that we are loading the model
    postMessage({
      type: 'status',
      status: 'loading-model',
    } satisfies WorkerStatusMessage);

    // NOTE: Model name chosen for background removal; adjust if needed.
    segmenterPromise = pipeline('image-segmentation', 'briaai/RMBG-1.4');

    try {
      await segmenterPromise;
      postMessage({
        type: 'status',
        status: 'ready',
      } satisfies WorkerStatusMessage);
    } catch (error: any) {
      postMessage({
        type: 'status',
        status: 'error',
        message: error?.message ?? 'Failed to load AI model',
      } satisfies WorkerStatusMessage);
      throw error;
    }
  }

  return segmenterPromise;
}

self.onmessage = async (event: MessageEvent<WorkerIncomingMessage>) => {
  const message = event.data;

  if (message.type === 'init') {
    try {
      await getSegmenter();
    } catch {
      // Error already reported via status message
    }
    return;
  }

  if (message.type === 'process-image') {
    const { id, imageData } = message;

    postMessage({
      type: 'processing',
      id,
      status: 'started',
    } satisfies WorkerProcessingMessage);

    try {
      const segmenter = await getSegmenter();

      // Run the model to warm up and perform segmentation.
      // NOTE: For now we do not yet use the mask to modify the pixels; we
      // just ensure the model runs entirely inside the worker. You can
      // refine this later to apply the predicted mask and set background
      // alpha to 0.
      try {
        // We ignore the returned mask for now but this still executes
        // the AI pipeline in the worker.
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const _result = await segmenter(imageData as any);
      } catch (inferenceError: any) {
        postMessage({
          type: 'error',
          id,
          message:
            inferenceError?.message ?? 'Failed to run background removal',
        } satisfies WorkerErrorMessage);
        return;
      }

      // Placeholder: currently we just return the original imageData. This
      // keeps the pipeline and messaging architecture working; once you
      // have validated the Transformers.js segmentation output shape you
      // can apply the mask here to actually remove the background.
      postMessage({
        type: 'result',
        id,
        imageData,
      } satisfies WorkerResultMessage);

      postMessage({
        type: 'processing',
        id,
        status: 'finished',
      } satisfies WorkerProcessingMessage);
    } catch (error: any) {
      postMessage({
        type: 'error',
        id,
        message: error?.message ?? 'Unexpected error in worker',
      } satisfies WorkerErrorMessage);
    }
  }
};
