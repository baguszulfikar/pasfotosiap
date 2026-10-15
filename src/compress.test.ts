import { describe, expect, it } from 'vitest';
import { compressToLimit, Q_FLOOR, type CompressDeps } from './compress';

/** Fake encoder: size grows with pixel count and quality, like a real JPEG roughly does. */
function fakeDeps(bytesPerPixelAtQ1: number, pngBytesPerPixel = 3): CompressDeps<{ w: number; h: number }> {
  return {
    render(scale) {
      const w = Math.round(354 * scale);
      const h = Math.round(472 * scale);
      return { canvas: { w, h }, width: w, height: h };
    },
    async encode(c, type, q = 1) {
      const per = type === 'image/png' ? pngBytesPerPixel : bytesPerPixelAtQ1 * q * q;
      return new Blob([new Uint8Array(Math.round(c.w * c.h * per))]);
    },
  };
}

describe('compressToLimit', () => {
  const limit = 200 * 1024;

  it('returns top quality when the image already fits', async () => {
    const r = await compressToLimit(fakeDeps(0.5), limit, 'jpg');
    expect(r?.quality).toBe(0.95);
    expect(r?.scaleSteps).toBe(0);
    expect(r!.blob.size).toBeLessThanOrEqual(limit);
  });

  it('lands within 95-98% of the limit when quality search is needed', async () => {
    const r = await compressToLimit(fakeDeps(2.0), limit, 'jpg');
    expect(r).not.toBeNull();
    expect(r!.scaleSteps).toBe(0);
    expect(r!.quality!).toBeGreaterThanOrEqual(Q_FLOOR);
    expect(r!.blob.size).toBeLessThanOrEqual(limit);
    expect(r!.blob.size).toBeGreaterThanOrEqual(limit * 0.95);
  });

  it('steps pixel size down when the quality floor is still too big', async () => {
    const r = await compressToLimit(fakeDeps(5.0), limit, 'jpg');
    expect(r).not.toBeNull();
    expect(r!.scaleSteps).toBeGreaterThan(0);
    expect(r!.width).toBeLessThan(354);
    expect(r!.blob.size).toBeLessThanOrEqual(limit);
  });

  it('never exceeds the limit for PNG and scales down instead', async () => {
    const r = await compressToLimit(fakeDeps(1, 3), 100 * 1024, 'png');
    expect(r).not.toBeNull();
    expect(r!.quality).toBeNull();
    expect(r!.blob.size).toBeLessThanOrEqual(100 * 1024);
  });

  it('gives up (null) when the limit is impossibly small', async () => {
    const r = await compressToLimit(fakeDeps(5.0), 1024, 'jpg');
    expect(r).toBeNull();
  });
});
