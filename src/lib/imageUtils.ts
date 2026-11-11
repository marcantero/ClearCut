/** Max side of the image fed to the model and the mask editor. */
export const WORKING_MAX_SIZE = 1024;
/**
 * Max side of the exported PNG. 4096² ≈ 16.7 MP, the canvas area limit on iOS Safari.
 * Larger photos are downscaled to this on export.
 */
export const EXPORT_MAX_SIZE = 4096;

export type LoadedImage = {
  /** Downscaled copy (≤ WORKING_MAX_SIZE) used for inference and editing. */
  imageData: ImageData;
  /** Original-resolution copy (≤ EXPORT_MAX_SIZE) used to compose the export. */
  fullCanvas: HTMLCanvasElement;
  /** Object URL of the file itself, for display. The caller must revoke it. */
  objectUrl: string;
};

export async function loadImageFile(file: File): Promise<LoadedImage> {
  const objectUrl = URL.createObjectURL(file);
  try {
    const img = await loadImage(objectUrl);

    const full = getScaledSize(img.naturalWidth, img.naturalHeight, EXPORT_MAX_SIZE);
    const fullCanvas = createCanvas(full.width, full.height);
    get2d(fullCanvas).drawImage(img, 0, 0, full.width, full.height);

    const work = getScaledSize(img.naturalWidth, img.naturalHeight, WORKING_MAX_SIZE);
    const workCanvas = createCanvas(work.width, work.height);
    const workCtx = get2d(workCanvas, { willReadFrequently: true });
    workCtx.imageSmoothingQuality = 'high';
    workCtx.drawImage(img, 0, 0, work.width, work.height);
    const imageData = workCtx.getImageData(0, 0, work.width, work.height);

    return { imageData, fullCanvas, objectUrl };
  } catch (error) {
    URL.revokeObjectURL(objectUrl);
    throw error;
  }
}

/**
 * Applies the (working-resolution) result's alpha to the original-resolution image.
 * The alpha is upscaled with smoothing, and the colours come from the full-size original.
 */
export function composeFullResolution(
  fullCanvas: HTMLCanvasElement,
  result: ImageData,
): HTMLCanvasElement {
  const out = createCanvas(fullCanvas.width, fullCanvas.height);
  const ctx = get2d(out);
  ctx.drawImage(fullCanvas, 0, 0);
  ctx.globalCompositeOperation = 'destination-in';
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(imageDataToCanvas(result), 0, 0, out.width, out.height);
  return out;
}

export function imageDataToCanvas(imageData: ImageData): HTMLCanvasElement {
  const canvas = createCanvas(imageData.width, imageData.height);
  get2d(canvas).putImageData(imageData, 0, 0);
  return canvas;
}

export function canvasToPngBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error('Failed to create PNG blob'));
    }, 'image/png');
  });
}

/** Encodes asynchronously to a PNG blob URL. The caller must revoke it. */
export async function imageDataToObjectUrl(imageData: ImageData): Promise<string> {
  const blob = await canvasToPngBlob(imageDataToCanvas(imageData));
  return URL.createObjectURL(blob);
}

/** Triggers a download, revoking the URL later so slow browsers don't cancel it. */
export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

function createCanvas(width: number, height: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

function get2d(
  canvas: HTMLCanvasElement,
  options?: CanvasRenderingContext2DSettings,
): CanvasRenderingContext2D {
  const ctx = canvas.getContext('2d', options);
  if (!ctx) throw new Error('Could not get 2D context');
  return ctx;
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Could not decode image'));
    img.src = src;
  });
}

export function getScaledSize(
  width: number,
  height: number,
  maxSize: number,
): { width: number; height: number } {
  const maxDim = Math.max(width, height);
  if (maxDim <= maxSize) {
    return { width, height };
  }

  const scale = maxSize / maxDim;
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}
