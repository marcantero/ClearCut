type RGBA = [number, number, number, number];

/** Builds an ImageData from a flat list of RGBA pixels (row-major). */
export function image(width: number, height: number, pixels: RGBA[]): ImageData {
  if (pixels.length !== width * height) throw new Error('pixel count mismatch');
  return new ImageData(new Uint8ClampedArray(pixels.flat()), width, height);
}

/** Reads pixel `i` back as an RGBA tuple. */
export function px(img: ImageData, i: number): RGBA {
  const d = img.data;
  return [d[i * 4], d[i * 4 + 1], d[i * 4 + 2], d[i * 4 + 3]];
}
