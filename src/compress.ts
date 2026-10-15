/**
 * Size-targeted encoder (FR-5, FR-6).
 * JPEG: binary-search quality in [Q_FLOOR, Q_MAX] aiming for 95–98% of the limit. If even the floor
 * is too big, scale the image down 10% and try again. PNG has no quality knob, so only scaling applies.
 * The renderer/encoder are injected so the search can be unit-tested without a browser.
 */
export const Q_FLOOR = 0.6;
export const Q_MAX = 0.95;
export const TARGET_LOW = 0.95;
export const TARGET_HIGH = 0.98;
const SCALE_STEP = 0.9;
const MIN_SCALE = 0.35;
const MAX_ITER = 9;

export interface Encoded {
  blob: Blob;
  width: number;
  height: number;
  quality: number | null;
  /** Number of 10% pixel-size reductions that were needed. */
  scaleSteps: number;
}

export interface CompressDeps<C> {
  /** Render the final image at `scale` of the target pixel size. */
  render(scale: number): { canvas: C; width: number; height: number };
  encode(canvas: C, type: 'image/jpeg' | 'image/png', quality?: number): Promise<Blob>;
}

export async function compressToLimit<C>(
  deps: CompressDeps<C>,
  limitBytes: number,
  format: 'jpg' | 'png',
): Promise<Encoded | null> {
  const low = limitBytes * TARGET_LOW;
  const high = Math.min(limitBytes, limitBytes * TARGET_HIGH);

  for (let steps = 0, scale = 1; scale >= MIN_SCALE; steps++, scale *= SCALE_STEP) {
    const { canvas, width, height } = deps.render(scale);
    const done = (blob: Blob, quality: number | null): Encoded => ({ blob, width, height, quality, scaleSteps: steps });

    if (format === 'png') {
      const blob = await deps.encode(canvas, 'image/png');
      if (blob.size <= limitBytes) return done(blob, null);
      continue;
    }

    const best = await deps.encode(canvas, 'image/jpeg', Q_MAX);
    if (best.size <= limitBytes) return done(best, Q_MAX); // fits at top quality, nothing to search
    const floor = await deps.encode(canvas, 'image/jpeg', Q_FLOOR);
    if (floor.size > limitBytes) continue; // needs fewer pixels, not lower quality

    let lo = Q_FLOOR;
    let hi = Q_MAX;
    let fit: Blob = floor;
    let fitQ = Q_FLOOR;
    for (let i = 0; i < MAX_ITER; i++) {
      const q = (lo + hi) / 2;
      const blob = await deps.encode(canvas, 'image/jpeg', q);
      if (blob.size <= limitBytes) {
        if (blob.size > fit.size) {
          fit = blob;
          fitQ = q;
        }
        if (blob.size >= low && blob.size <= high) break;
        lo = q;
      } else {
        hi = q;
      }
    }
    return done(fit, Math.round(fitQ * 100) / 100);
  }
  return null;
}
