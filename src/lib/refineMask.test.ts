import { describe, expect, it } from 'vitest';
import { refineMask } from './refineMask';
import { image, px } from '../test/pixels';

const WHITE = [255, 255, 255, 255] as const;
const BLACK = [0, 0, 0, 255] as const;
const NONE = [0, 0, 0, 0] as const;

describe('refineMask', () => {
  // Pixel 0: AI kept it. Pixel 1: AI removed it. Pixel 2: AI kept it.
  const original = image(3, 1, [[10, 20, 30, 255], [40, 50, 60, 255], [70, 80, 90, 255]]);
  const ai = image(3, 1, [[10, 20, 30, 255], [0, 0, 0, 0], [70, 80, 90, 128]]);

  it('keeps the AI decision where the mask is transparent', () => {
    const out = refineMask(ai, original, image(3, 1, [[...NONE], [...NONE], [...NONE]]));
    expect(Array.from(out.data)).toEqual(Array.from(ai.data));
  });

  it('restores colour from the original image (not the zeroed AI pixel) with full alpha', () => {
    const out = refineMask(ai, original, image(3, 1, [[...NONE], [...WHITE], [...NONE]]));
    expect(px(out, 1)).toEqual([40, 50, 60, 255]);
  });

  it('erases to fully transparent', () => {
    const out = refineMask(ai, original, image(3, 1, [[...BLACK], [...NONE], [...BLACK]]));
    expect(px(out, 0)).toEqual([0, 0, 0, 0]);
    expect(px(out, 2)).toEqual([0, 0, 0, 0]);
  });

  it('does not mutate its inputs', () => {
    const before = Array.from(ai.data);
    refineMask(ai, original, image(3, 1, [[...BLACK], [...WHITE], [...BLACK]]));
    expect(Array.from(ai.data)).toEqual(before);
  });

  it('throws when the mask size does not match', () => {
    expect(() => refineMask(ai, original, image(1, 1, [[...NONE]]))).toThrow(/dimensions/);
  });
});
