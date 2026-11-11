import { describe, expect, it } from 'vitest';
import { blurRadiusPx, coverRect } from './background';

describe('blurRadiusPx', () => {
  it('is a percentage of the long side', () => {
    expect(blurRadiusPx(2, 1000, 500)).toBe(20);
    expect(blurRadiusPx(2, 500, 1000)).toBe(20);
  });

  it('scales with resolution, so preview and export match', () => {
    const preview = blurRadiusPx(2, 1024, 768);
    const full = blurRadiusPx(2, 4096, 3072);
    // Radii are rounded to whole pixels, so the ratio is only approximately 4.
    expect(Math.abs(full / preview - 4)).toBeLessThan(0.15);
  });

  it('is at least 1 px', () => {
    expect(blurRadiusPx(0.5, 10, 10)).toBe(1);
  });
});

describe('coverRect', () => {
  it('fills a wider target by cropping top and bottom', () => {
    expect(coverRect(100, 100, 200, 100)).toEqual({ x: 0, y: -50, width: 200, height: 200 });
  });

  it('fills a taller target by cropping the sides', () => {
    expect(coverRect(200, 100, 100, 100)).toEqual({ x: -50, y: 0, width: 200, height: 100 });
  });

  it('scales up a small source to cover the target', () => {
    const r = coverRect(50, 25, 400, 300);
    expect(r.width).toBeGreaterThanOrEqual(400);
    expect(r.height).toBeGreaterThanOrEqual(300);
    expect(r.x + r.width / 2).toBeCloseTo(200);
    expect(r.y + r.height / 2).toBeCloseTo(150);
  });
});
