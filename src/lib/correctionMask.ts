/**
 * Merges the restore and erase masks (RGBA, only alpha is read) into the single
 * correction mask that `refineMask()` understands:
 *   white (255,255,255,255) → RESTORE
 *   black (0,0,0,255)       → ERASE
 *   transparent (a = 0)     → no correction
 * Priority: erase > restore > none.
 */
export function mergeCorrectionMasks(
  restore: Uint8ClampedArray,
  erase: Uint8ClampedArray,
  width: number,
  height: number,
): ImageData {
  const out = new ImageData(width, height);
  const o = out.data;

  for (let i = 0; i < o.length; i += 4) {
    if (erase[i + 3] > 0) {
      o[i] = 0; o[i + 1] = 0; o[i + 2] = 0; o[i + 3] = 255;
    } else if (restore[i + 3] > 0) {
      o[i] = 255; o[i + 1] = 255; o[i + 2] = 255; o[i + 3] = 255;
    }
  }

  return out;
}
