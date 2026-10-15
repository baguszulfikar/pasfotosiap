import { useEffect, useRef, useState } from 'preact/hooks';
import { coverScale, drawCrop, type Transform } from './image';

interface Props {
  src: HTMLCanvasElement;
  outW: number;
  outH: number;
  fill: string;
  transform: Transform;
  onChange(t: Transform): void;
}

const MIN_ZOOM = 0.5;
const MAX_ZOOM = 5;

/** Ratio-locked crop frame with drag, pinch, wheel and keyboard control (FR-3). */
export function Cropper({ src, outW, outH, fill, transform, onChange }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const tRef = useRef(transform);
  tRef.current = transform;
  const pointers = useRef(new Map<number, { x: number; y: number }>());

  const base = coverScale(src, outW, outH);
  const clampScale = (s: number) => Math.min(base * MAX_ZOOM, Math.max(base * MIN_ZOOM, s));

  // Track the on-screen width so the bitmap is re-sized on layout changes (rotation, resize, late layout).
  const [cssW, setCssW] = useState(0);
  useEffect(() => {
    const c = canvasRef.current!;
    setCssW(c.clientWidth);
    const ro = new ResizeObserver(() => setCssW(c.clientWidth));
    ro.observe(c);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const c = canvasRef.current!;
    if (!cssW) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    c.width = Math.round(cssW * dpr);
    c.height = Math.round(((cssW * outH) / outW) * dpr);
    drawCrop(c.getContext('2d')!, src, transform, c.width, c.height, c.width / outW, fill);
  }, [src, transform, outW, outH, fill, cssW]);

  /** CSS px → output px. */
  const k = () => outW / canvasRef.current!.clientWidth;

  const onPointerDown = (e: PointerEvent) => {
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
  };

  const onPointerMove = (e: PointerEvent) => {
    const map = pointers.current;
    const prev = map.get(e.pointerId);
    if (!prev) return;
    const t = tRef.current;
    if (map.size === 1) {
      map.set(e.pointerId, { x: e.clientX, y: e.clientY });
      onChange({ ...t, x: t.x + (e.clientX - prev.x) * k(), y: t.y + (e.clientY - prev.y) * k() });
      return;
    }
    const [a, b] = [...map.entries()];
    const other = a[0] === e.pointerId ? b[1] : a[1];
    const before = Math.hypot(prev.x - other.x, prev.y - other.y);
    const after = Math.hypot(e.clientX - other.x, e.clientY - other.y);
    map.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (before < 1) return;
    const scale = clampScale(t.scale * (after / before));
    // Move half the finger delta so the midpoint pans with the pinch.
    onChange({
      ...t,
      scale,
      x: t.x + ((e.clientX - prev.x) / 2) * k(),
      y: t.y + ((e.clientY - prev.y) / 2) * k(),
    });
  };

  const onPointerUp = (e: PointerEvent) => {
    pointers.current.delete(e.pointerId);
  };

  const zoomBy = (f: number) => onChange({ ...tRef.current, scale: clampScale(tRef.current.scale * f) });

  useEffect(() => {
    const c = canvasRef.current!;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      zoomBy(e.deltaY < 0 ? 1.06 : 1 / 1.06);
    };
    c.addEventListener('wheel', onWheel, { passive: false });
    return () => c.removeEventListener('wheel', onWheel);
  });

  const onKeyDown = (e: KeyboardEvent) => {
    const t = tRef.current;
    const step = e.shiftKey ? 20 : 5;
    const moves: Record<string, [number, number]> = {
      ArrowLeft: [-step, 0],
      ArrowRight: [step, 0],
      ArrowUp: [0, -step],
      ArrowDown: [0, step],
    };
    if (moves[e.key]) {
      e.preventDefault();
      onChange({ ...t, x: t.x + moves[e.key][0], y: t.y + moves[e.key][1] });
    } else if (e.key === '+' || e.key === '=') {
      e.preventDefault();
      zoomBy(1.06);
    } else if (e.key === '-') {
      e.preventDefault();
      zoomBy(1 / 1.06);
    }
  };

  return (
    <div class="cropper" style={{ aspectRatio: `${outW} / ${outH}` }}>
      <canvas
        ref={canvasRef}
        tabIndex={0}
        role="application"
        aria-label="Area potong foto. Geser dengan jari atau tombol panah, cubit atau tombol plus dan minus untuk memperbesar."
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onKeyDown={onKeyDown}
      />
      {/* Head-and-shoulders guide */}
      <svg class="guide" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
        <ellipse cx="50" cy="38" rx="20" ry="24" />
        <path d="M8 100 C 10 78, 26 70, 40 67 L 60 67 C 74 70, 90 78, 92 100" />
        <line x1="20" y1="11" x2="80" y2="11" class="dash" />
        <line x1="30" y1="34" x2="70" y2="34" class="dash" />
      </svg>
      <div class="zoom-btns">
        <button type="button" onClick={() => zoomBy(1 / 1.1)} aria-label="Perkecil">−</button>
        <button type="button" onClick={() => zoomBy(1.1)} aria-label="Perbesar">+</button>
      </div>
    </div>
  );
}
