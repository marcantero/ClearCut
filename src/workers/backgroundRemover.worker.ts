import { pipeline, RawImage, env } from '@huggingface/transformers';
import type { WorkerIncomingMessage, WorkerOutgoingMessage } from './backgroundRemover.types';

// Re-export types for main thread to import
export type {
  WorkerInitMessage,
  WorkerProcessMessage,
  WorkerIncomingMessage,
  WorkerStatusMessage,
  WorkerModelProgressMessage,
  WorkerResultMessage,
  WorkerProcessingMessage,
  WorkerErrorMessage,
  WorkerOutgoingMessage,
} from './backgroundRemover.types';

declare const self: Worker;

const post = (message: WorkerOutgoingMessage) => self.postMessage(message);

// Optional: Configure environment for production
env.allowLocalModels = false;

let segmenterPromise: Promise<any> | null = null;
let activeModelId: string | null = null;
let currentDevice: 'webgpu' | 'wasm' = 'wasm';

const modelLabel = (modelId: string) => modelId.split('/').pop() ?? modelId;

function makeProgressHandler(modelId: string) {
  return (data: any) => {
    if (data.status === 'progress') {
      post({
        type: 'model-progress',
        progress: Math.round(data.progress),
        phase: data.file
          ? `Downloading: ${data.file} (${currentDevice})`
          : `Preparing model (${currentDevice})...`,
      });
    } else if (data.status === 'ready') {
      post({
        type: 'model-progress',
        progress: 100,
        phase: `Model ${modelLabel(modelId)} loaded and ready (${currentDevice})`,
      });
    }
  };
}

async function detectWebGPU(): Promise<boolean> {
  try {
    const gpu = (navigator as any).gpu;
    if (!gpu) return false;
    return !!(await gpu.requestAdapter());
  } catch (e) {
    console.warn('[Worker] Error checking WebGPU adapter:', e);
    return false;
  }
}

async function loadSegmenter(modelId: string) {
  const isWebGPUSupported = await detectWebGPU();
  currentDevice = isWebGPUSupported ? 'webgpu' : 'wasm';
  // If we're in WASM (CPU), use 'q8' (quantized to 8 bits) to avoid hanging the tab
  const dtype = isWebGPUSupported ? 'fp32' : 'q8';

  console.log(`[Worker] Initializing ${modelId} with device: ${currentDevice} and precision: ${dtype}`);

  post({
    type: 'status',
    status: 'loading-model',
    message: isWebGPUSupported
      ? 'Loading high-precision model (WebGPU)...'
      : 'WebGPU not detected. Loading CPU mode (WASM)...',
  });

  try {
    return await pipeline('background-removal', modelId, {
      device: currentDevice as any,
      dtype: dtype as any,
      progress_callback: makeProgressHandler(modelId),
    });
  } catch (error: any) {
    console.error(`[Worker] Critical error loading model with ${currentDevice}:`, error);
    throw new Error(`Could not load the model. Detail: ${error?.message || error}`);
  }
}

/** Releases the currently loaded pipeline (GPU/WASM memory). */
async function disposeSegmenter() {
  const previous = segmenterPromise;
  segmenterPromise = null;
  activeModelId = null;
  if (!previous) return;
  try {
    const pipe = await previous;
    await pipe?.dispose?.();
  } catch {
    // Load had failed: nothing to release.
  }
}

async function getSegmenter(modelId: string) {
  if (segmenterPromise && activeModelId === modelId) {
    return segmenterPromise;
  }

  if (segmenterPromise) {
    // Fire and forget: don't block the new model on releasing the old one.
    void disposeSegmenter();
  }

  activeModelId = modelId;
  const promise = loadSegmenter(modelId);
  segmenterPromise = promise;

  // Don't cache failures: allow retrying the same model later.
  promise.catch(() => {
    if (segmenterPromise === promise) {
      segmenterPromise = null;
      activeModelId = null;
    }
  });

  return promise;
}

async function initBackgroundRemover(modelId: string): Promise<void> {
  const alreadyLoaded = segmenterPromise && activeModelId === modelId;
  if (!alreadyLoaded) {
    post({ type: 'status', status: 'loading-model', message: `Initializing ${modelLabel(modelId)}...` });
  }

  await getSegmenter(modelId);

  if (!alreadyLoaded) {
    post({
      type: 'status',
      status: 'ready',
      message: `Model ${modelLabel(modelId)} ready to process (${currentDevice}).`,
    });
  }
}

async function removeBackground(imageData: ImageData, modelId: string): Promise<ImageData> {
  const { width, height } = imageData;
  const segmenter = await getSegmenter(modelId);

  // Transformers.js v3 requires RawImage
  const imageToProcess = new RawImage(imageData.data, width, height, 4);

  const outputs = await segmenter(imageToProcess);

  // Output can be an array or an object. Make sure we get the mask.
  const finalMask = Array.isArray(outputs) ? outputs[0] : outputs;

  // Some models (like MODNet) return { mask: RawImage, label: string }
  const maskImage = finalMask.mask ? finalMask.mask : finalMask;

  const maskBlob: Blob | null = await maskImage.toBlob();
  if (!maskBlob) {
    throw new Error('Failed to create mask blob from model output.');
  }

  const maskBitmap = await createImageBitmap(maskBlob);

  const maskCanvas = new OffscreenCanvas(width, height);
  const maskCtx = maskCanvas.getContext('2d');
  if (!maskCtx) throw new Error('Failed to create 2D context.');
  maskCtx.drawImage(maskBitmap, 0, 0, width, height);
  maskBitmap.close();
  const maskData = maskCtx.getImageData(0, 0, width, height);

  const outImageData = new ImageData(new Uint8ClampedArray(imageData.data), width, height);

  // Grayscale/RGB mask → use Red channel as alpha. RGBA mask → use its alpha.
  const channels = maskImage.channels || 4;
  const useRedAsAlpha = channels === 1 || channels === 3;

  for (let i = 0; i < outImageData.data.length; i += 4) {
    outImageData.data[i + 3] = useRedAsAlpha ? maskData.data[i] : maskData.data[i + 3];
  }

  return outImageData;
}

self.onmessage = async (event: MessageEvent<WorkerIncomingMessage>) => {
  const message = event.data;

  if (message.type === 'reset') {
    await disposeSegmenter();
    return;
  }

  if (message.type === 'init') {
    try {
      await initBackgroundRemover(message.modelId);
    } catch (error: any) {
      console.error('[Worker] Error in init:', error);
      post({
        type: 'status',
        status: 'error',
        message: error?.message || 'An error occurred while initializing the AI model.',
      });
    }
    return;
  }

  if (message.type === 'process-image') {
    const { id, imageData, modelId } = message;

    post({ type: 'processing', id, status: 'started' });

    try {
      await initBackgroundRemover(modelId);
      const output = await removeBackground(imageData, modelId);
      post({ type: 'result', id, imageData: output });
      post({ type: 'processing', id, status: 'finished' });
    } catch (error: any) {
      console.error('[Worker] Error in process-image:', error);
      post({
        type: 'error',
        id,
        message: error?.message || 'The AI failed to process this image.',
      });
    }
  }
};
