import { describe, expect, it } from 'vitest';
import { mergeCorrectionMasks } from './correctionMask';
import { image, px } from '../test/pixels';

describe('mergeCorrectionMasks', () => {
  // Pixels: 0 = nothing, 1 = restore only, 2 = erase only, 3 = both.
  const restore = image(4, 1, [[0, 0, 0, 0], [255, 255, 255, 200], [0, 0, 0, 0], [255, 255, 255, 255]]);
  const erase = image(4, 1, [[0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 30], [0, 0, 0, 255]]);
  const out = mergeCorrectionMasks(restore.data, erase.data, 4, 1);

  it('leaves untouched pixels transparent', () => {
    expect(px(out, 0)).toEqual([0, 0, 0, 0]);
  });

  it('marks restore as opaque white, even with partial alpha', () => {
    expect(px(out, 1)).toEqual([255, 255, 255, 255]);
  });

  it('marks erase as opaque black, even with partial alpha', () => {
    expect(px(out, 2)).toEqual([0, 0, 0, 255]);
  });

  it('gives erase priority over restore', () => {
    expect(px(out, 3)).toEqual([0, 0, 0, 255]);
  });

  it('returns an image of the requested size', () => {
    expect([out.width, out.height]).toEqual([4, 1]);
  });
});
