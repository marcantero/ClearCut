/** What goes behind the cut-out subject. */
export type Background =
  | { kind: 'transparent' }
  | { kind: 'color'; color: string }
  /** Blurred copy of the original photo. `strength` is the radius as a % of the long side. */
  | { kind: 'blur'; strength: number }
  | { kind: 'image'; image: ImageBitmap; name: string };

export const TRANSPARENT: Background = { kind: 'transparent' };

export const BLUR_MIN = 0.5;
export const BLUR_MAX = 5;
export const BLUR_DEFAULT = 2;

/**
 * Blur radius in pixels. It's relative to the image size, so the low-res preview
 * and the full-resolution export look the same.
 */
export function blurRadiusPx(strength: number, width: number, height: number): number {
  return Math.max(1, Math.round((strength / 100) * Math.max(width, height)));
}

export type Rect = { x: number; y: number; width: number; height: number };

/** Scales (srcW × srcH) to cover (dstW × dstH), centred, like CSS `object-fit: cover`. */
export function coverRect(srcW: number, srcH: number, dstW: number, dstH: number): Rect {
  const scale = Math.max(dstW / srcW, dstH / srcH);
  const width = srcW * scale;
  const height = srcH * scale;
  return { x: (dstW - width) / 2, y: (dstH - height) / 2, width, height };
}

/**
 * Draws `subject` (RGBA, transparent background) over the chosen background.
 * `original` is the unprocessed photo at the same size, used for the blur option.
 * Returns `subject` itself when the background is transparent.
 */
export function composeBackground(
  subject: HTMLCanvasElement,
  original: HTMLCanvasElement,
  background: Background,
): HTMLCanvasElement {
  if (background.kind === 'transparent') return subject;

  const { width, height } = subject;
  const out = document.createElement('canvas');
  out.width = width;
  out.height = height;
  const ctx = out.getContext('2d');
  if (!ctx) throw new Error('Could not get 2D context');
  ctx.imageSmoothingQuality = 'high';

  if (background.kind === 'color') {
    ctx.fillStyle = background.color;
    ctx.fillRect(0, 0, width, height);
  } else if (background.kind === 'image') {
    const r = coverRect(background.image.width, background.image.height, width, height);
    ctx.drawImage(background.image, r.x, r.y, r.width, r.height);
  } else {
    drawBlurred(ctx, original, width, height, blurRadiusPx(background.strength, width, height));
  }

  ctx.drawImage(subject, 0, 0);
  return out;
}

function drawBlurred(
  ctx: CanvasRenderingContext2D,
  source: HTMLCanvasElement,
  width: number,
  height: number,
  radius: number,
) {
  // The DOM types say `filter` always exists, but older Safari lacks canvas filters.
  const supportsFilter = typeof (ctx as { filter?: unknown }).filter === 'string';
  if (supportsFilter) {
    // A Gaussian blur reaches ~3σ, so near the edges it would mix in transparent pixels.
    // Draw oversized by 3σ, over an opaque sharp copy so the result is fully opaque.
    const pad = radius * 3;
    ctx.drawImage(source, 0, 0, width, height);
    ctx.save();
    ctx.filter = `blur(${radius}px)`;
    ctx.drawImage(source, -pad, -pad, width + pad * 2, height + pad * 2);
    ctx.restore();
    return;
  }

  // Fallback for browsers without canvas filters: downscale then upscale with smoothing.
  const factor = Math.max(1, radius / 2);
  const small = document.createElement('canvas');
  small.width = Math.max(1, Math.round(width / factor));
  small.height = Math.max(1, Math.round(height / factor));
  const sctx = small.getContext('2d');
  if (!sctx) return;
  sctx.imageSmoothingQuality = 'high';
  sctx.drawImage(source, 0, 0, small.width, small.height);
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(small, 0, 0, width, height);
}
