import { pipeline, RawImage } from '@huggingface/transformers';

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

interface PostableMessage {
  type: string;
  [key: string]: any;
}

let initialized = false;
let segmenterPromise: Promise<any> | null = null;

async function getSegmenter() {
  if (!segmenterPromise) {
    segmenterPromise = pipeline('background-removal', 'Xenova/modnet', {
      dtype: 'fp32',
      progress_callback: (data: any) => {
        if (data.status === 'progress') {
          self.postMessage({
            type: 'model-progress',
            progress: Math.round(data.progress),
            phase: data.file ? `Descargando: ${data.file}` : 'Preparando modelo...'
          });
        } else if (data.status === 'ready') {
          self.postMessage({
            type: 'model-progress',
            progress: 100,
            phase: 'Modelo cargado y listo'
          });
        }
      }
    });
  }
  return segmenterPromise;
}

async function initBackgroundRemover(): Promise<void> {
  if (initialized) {
    return;
  }

  try {
    self.postMessage({
      type: 'status',
      status: 'loading-model',
      message: 'Initializing background removal model…',
    });

    await getSegmenter();

    initialized = true;
    self.postMessage({
      type: 'status',
      status: 'ready',
      message: 'Background removal model ready.',
    });
  } catch (error: any) {
    console.error('[Worker] Error during initialization:', error);
    self.postMessage({
      type: 'status',
      status: 'error',
      message: error?.message || 'Error during model initialization',
    });
  }
}

async function removeBackgroundWithModnet(imageData: ImageData): Promise<ImageData> {
  const { width, height, data } = imageData;
  const segmenter = await getSegmenter();
  const imageToProcess = new RawImage(imageData.data, imageData.width, imageData.height, 4);
  // Run local background-removal pipeline on the input ImageData
  const outputs = await segmenter(imageToProcess);
  
  // Validación defensiva para la salida del modelo
  const finalImage = Array.isArray(outputs) ? outputs[0] : outputs;

  const resultBlob: Blob | null = await finalImage.toBlob();
  if (!resultBlob) {
    throw new Error('Failed to create result blob from MODNet output.');
  }

  // Convert resulting PNG (with alpha) back to ImageData
  const bitmap = await createImageBitmap(resultBlob);
  const outCanvas = new OffscreenCanvas(bitmap.width, bitmap.height);
  const outCtx = outCanvas.getContext('2d');
  if (!outCtx) {
    throw new Error('Failed to create 2D context for output canvas.');
  }

  // Draw the alpha-matted image and read back pixels
  outCtx.drawImage(bitmap, 0, 0);
  const outputImageData = outCtx.getImageData(0, 0, bitmap.width, bitmap.height);

  return outputImageData;
}

self.onmessage = async (event: MessageEvent<PostableMessage>) => {
  const message = event.data;

  if (message.type === 'reset') {
    initialized = false;
    return;
  }

  if (message.type === 'init') {
    try {
      await initBackgroundRemover();
    } catch (error: any) {
      console.error('[Worker] Error in init:', error);
      self.postMessage({
        type: 'status',
        status: 'error',
        message: error?.message || "S'ha produït un error en inicialitzar el model d'IA.",
      });
    }
    return;
  }

  if (message.type === 'process-image') {
    const { id, imageData } = message;

    self.postMessage({
      type: 'processing',
      id,
      status: 'started',
    });

    try {
      await initBackgroundRemover();

      // Única via possible: la IA. Si falla, saltarà directament al catch.
      const output = await removeBackgroundWithModnet(imageData);

      self.postMessage({
        type: 'result',
        id,
        imageData: output,
      });

      self.postMessage({
        type: 'processing',
        id,
        status: 'finished',
      });
    } catch (error: any) {
      console.error('[Worker] Error in process-image:', error);
      self.postMessage({
        type: 'error',
        id,
        message: error?.message || "L'IA ha fallat en processar aquesta imatge.",
      });
    }
  }
};