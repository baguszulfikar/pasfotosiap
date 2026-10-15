/**
 * Background swap (FR-10): MediaPipe selfie segmentation, loaded only when the user first picks a colour.
 * The runtime and model are served from this site, so the strict CSP holds and the service worker
 * can cache them for offline use.
 */
import type { ImageSegmenter } from '@mediapipe/tasks-vision';

const WASM_BASE = '/mediapipe';
const MODEL_URL = '/models/selfie_segmenter.tflite';
/** Segment a downscaled copy for speed; the soft mask is upscaled to full size. */
const SEGMENT_SIDE = 768;

const MIN_PERSON_COVERAGE = 0.03;

export class NoPersonError extends Error {}

let segmenterPromise: Promise<ImageSegmenter> | null = null;

/** Rough download sizes, for the progress bar only. */
const WASM_BYTES = 13_600_000;
const MODEL_BYTES = 250_000;

async function fetchWithProgress(url: string, onBytes: (n: number) => void): Promise<Uint8Array<ArrayBuffer>> {
  const res = await fetch(url);
  if (!res.ok || !res.body) throw new Error(`fetch ${url} ${res.status}`);
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    total += value.length;
    onBytes(value.length);
  }
  const out = new Uint8Array(new ArrayBuffer(total));
  let o = 0;
  for (const c of chunks) {
    out.set(c, o);
    o += c.length;
  }
  return out;
}

export function loadSegmenter(onProgress: (fraction: number) => void): Promise<ImageSegmenter> {
  if (segmenterPromise) return segmenterPromise;
  segmenterPromise = (async () => {
    const vision = await import('@mediapipe/tasks-vision');
    const fileset = await vision.FilesetResolver.forVisionTasks(WASM_BASE);
    let loaded = 0;
    const tick = (n: number) => {
      loaded += n;
      onProgress(Math.min(0.99, loaded / (WASM_BYTES + MODEL_BYTES)));
    };
    // Fetch the wasm binary ourselves so the progress bar moves, then hand it over as a blob URL.
    const [wasm, model] = await Promise.all([
      fetchWithProgress(fileset.wasmBinaryPath, tick),
      fetchWithProgress(MODEL_URL, tick),
    ]);
    const wasmUrl = URL.createObjectURL(new Blob([wasm], { type: 'application/wasm' }));
    const seg = await vision.ImageSegmenter.createFromOptions({ ...fileset, wasmBinaryPath: wasmUrl }, {
      baseOptions: { modelAssetBuffer: model, delegate: 'CPU' },
      runningMode: 'IMAGE',
      outputCategoryMask: false,
      outputConfidenceMasks: true,
    });
    onProgress(1);
    return seg;
  })();
  segmenterPromise.catch(() => {
    segmenterPromise = null; // allow a retry
  });
  return segmenterPromise;
}

/** Returns a canvas the size of `src` whose alpha channel is the person mask (feathered). */
export function personMask(seg: ImageSegmenter, src: HTMLCanvasElement): HTMLCanvasElement {
  const k = Math.min(1, SEGMENT_SIDE / Math.max(src.width, src.height));
  const small = document.createElement('canvas');
  small.width = Math.round(src.width * k);
  small.height = Math.round(src.height * k);
  small.getContext('2d')!.drawImage(src, 0, 0, small.width, small.height);

  const result = seg.segment(small);
  const mask = result.confidenceMasks?.[0];
  if (!mask) throw new Error('no mask');
  const conf = mask.getAsFloat32Array();
  const mw = mask.width;
  const mh = mask.height;
  const img = new ImageData(mw, mh);
  let covered = 0;
  for (let i = 0; i < conf.length; i++) {
    // Smoothstep 0.25..0.75 sharpens the edge without a hard, jagged cut.
    const t = Math.min(1, Math.max(0, (conf[i] - 0.25) / 0.5));
    img.data[i * 4 + 3] = Math.round(t * t * (3 - 2 * t) * 255);
    if (conf[i] > 0.5) covered++;
  }
  result.close();
  // A pas foto is mostly person; almost nothing detected means the model missed them.
  if (covered / conf.length < MIN_PERSON_COVERAGE) throw new NoPersonError();

  const m = document.createElement('canvas');
  m.width = mw;
  m.height = mh;
  m.getContext('2d')!.putImageData(img, 0, 0);

  const full = document.createElement('canvas');
  full.width = src.width;
  full.height = src.height;
  const fctx = full.getContext('2d')!;
  fctx.imageSmoothingEnabled = true;
  fctx.imageSmoothingQuality = 'high';
  fctx.filter = 'blur(1px)';
  fctx.drawImage(m, 0, 0, full.width, full.height);
  return full;
}

/** Composites the person over a solid colour. */
export function composite(src: HTMLCanvasElement, mask: HTMLCanvasElement, color: string): HTMLCanvasElement {
  const person = document.createElement('canvas');
  person.width = src.width;
  person.height = src.height;
  const p = person.getContext('2d')!;
  p.drawImage(src, 0, 0);
  p.globalCompositeOperation = 'destination-in';
  p.drawImage(mask, 0, 0);

  const out = document.createElement('canvas');
  out.width = src.width;
  out.height = src.height;
  const o = out.getContext('2d')!;
  o.fillStyle = color;
  o.fillRect(0, 0, out.width, out.height);
  o.drawImage(person, 0, 0);
  return out;
}
