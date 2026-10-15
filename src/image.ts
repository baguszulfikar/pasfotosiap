/** Decoding and rendering. Everything happens on canvases in this tab; no bytes leave the device. */

export const MAX_FILE_BYTES = 20 * 1024 * 1024;
/** Longest side kept after decoding: plenty for a 709 px tall output with room to zoom, and light on memory. */
const MAX_SOURCE_SIDE = 2400;

export class UserError extends Error {}

function isHeic(file: File): boolean {
  return /image\/hei[cf]/i.test(file.type) || /\.hei[cf]$/i.test(file.name);
}

function decodeWithImg(blob: Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('decode failed'));
    };
    img.src = url;
  });
}

/**
 * Decodes JPG/PNG/WebP/HEIC into a canvas. <img> decoding applies the photo's EXIF orientation
 * (FR-2), and drawing to a canvas drops all metadata, including GPS (FR-7).
 */
export async function loadPhoto(file: File): Promise<HTMLCanvasElement> {
  if (file.size > MAX_FILE_BYTES) throw new UserError('Ukuran file lebih dari 20 MB. Pilih foto lain.');
  const looksOk = /^image\/(jpeg|png|webp|heic|heif)$/i.test(file.type) || /\.(jpe?g|png|webp|hei[cf])$/i.test(file.name);
  if (!looksOk) throw new UserError('Format tidak didukung. Gunakan JPG, PNG, WebP, atau HEIC.');

  let img: HTMLImageElement;
  try {
    img = await decodeWithImg(file);
  } catch {
    if (!isHeic(file)) throw new UserError('Foto tidak bisa dibuka. Coba foto lain.');
    // Browsers other than Safari cannot decode HEIC; load the converter only now.
    const { default: heic2any } = await import('heic2any');
    try {
      const out = await heic2any({ blob: file, toType: 'image/jpeg', quality: 0.95 });
      img = await decodeWithImg(Array.isArray(out) ? out[0] : out);
    } catch {
      throw new UserError('Foto HEIC tidak bisa dibuka di browser ini. Ubah ke JPG dulu, atau coba di Safari.');
    }
  }

  const scale = Math.min(1, MAX_SOURCE_SIDE / Math.max(img.naturalWidth, img.naturalHeight));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(img.naturalWidth * scale);
  canvas.height = Math.round(img.naturalHeight * scale);
  const ctx = canvas.getContext('2d')!;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  return canvas;
}

/** Image placement inside the crop frame, in output-pixel units relative to the frame centre. */
export interface Transform {
  /** Output pixels per source pixel. */
  scale: number;
  rotationDeg: number;
  x: number;
  y: number;
}

export function coverScale(src: { width: number; height: number }, outW: number, outH: number): number {
  return Math.max(outW / src.width, outH / src.height);
}

/** Draws the cropped/rotated photo into `ctx` sized `w`×`h`; `k` maps output pixels to this canvas. */
export function drawCrop(
  ctx: CanvasRenderingContext2D,
  src: CanvasImageSource & { width: number; height: number },
  t: Transform,
  w: number,
  h: number,
  k: number,
  fill: string,
) {
  ctx.save();
  ctx.fillStyle = fill;
  ctx.fillRect(0, 0, w, h);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.translate(w / 2 + t.x * k, h / 2 + t.y * k);
  ctx.rotate((t.rotationDeg * Math.PI) / 180);
  ctx.scale(t.scale * k, t.scale * k);
  ctx.drawImage(src, -src.width / 2, -src.height / 2);
  ctx.restore();
}

/** Renders the final output at `factor` × the preset's pixel size. */
export function renderOutput(
  src: HTMLCanvasElement,
  t: Transform,
  outW: number,
  outH: number,
  factor: number,
  fill: string,
): { canvas: HTMLCanvasElement; width: number; height: number } {
  const width = Math.max(1, Math.round(outW * factor));
  const height = Math.max(1, Math.round(outH * factor));
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  drawCrop(canvas.getContext('2d')!, src, t, width, height, width / outW, fill);
  return { canvas, width, height };
}

export function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality?: number): Promise<Blob> {
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('encode failed'))), type, quality),
  );
}
