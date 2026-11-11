import { describe, expect, it } from 'vitest';
import { getScaledSize } from './imageUtils';

describe('getScaledSize', () => {
  it('does not upscale images within the limit', () => {
    expect(getScaledSize(800, 600, 1024)).toEqual({ width: 800, height: 600 });
    expect(getScaledSize(1024, 1024, 1024)).toEqual({ width: 1024, height: 1024 });
  });

  it('scales landscape images by their width', () => {
    expect(getScaledSize(4000, 3000, 1024)).toEqual({ width: 1024, height: 768 });
  });

  it('scales portrait images by their height', () => {
    expect(getScaledSize(3000, 4000, 1024)).toEqual({ width: 768, height: 1024 });
  });

  it('never returns a zero dimension for extreme aspect ratios', () => {
    expect(getScaledSize(10000, 1, 1024)).toEqual({ width: 1024, height: 1 });
  });
});
