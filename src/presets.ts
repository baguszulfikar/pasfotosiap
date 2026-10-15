import data from './presets.json';

export type BgColor = 'merah' | 'biru' | 'putih';
export type Ratio = '2x3' | '3x4' | '4x6';
export type Format = 'jpg' | 'png';

export interface Preset {
  id: string;
  name: string;
  portal: string;
  /** Required/recommended background colour; null = none recommended. */
  background: BgColor | null;
  /** True when the user may pick any colour without failing the preset's rules. */
  backgroundChoice: boolean;
  formats: Format[];
  maxKB: number;
  kbEditable: boolean;
  ratios: Ratio[];
  lastChecked: string | null;
  sourceName: string | null;
  sourceUrl: string | null;
}

export const PRESETS = data as Preset[];

export const BG_COLORS: Record<BgColor, { label: string; hex: string }> = {
  merah: { label: 'Merah', hex: '#db0000' },
  biru: { label: 'Biru', hex: '#0050b4' },
  putih: { label: 'Putih', hex: '#ffffff' },
};

/** Output size in pixels at 300 DPI, keyed by print size in cm (width x height). */
export const RATIO_PX: Record<Ratio, { w: number; h: number }> = {
  '2x3': { w: 236, h: 354 },
  '3x4': { w: 354, h: 472 },
  '4x6': { w: 472, h: 709 },
};

export function findPreset(id: string | undefined | null): Preset | undefined {
  return PRESETS.find((p) => p.id === id);
}

export function rulesLine(p: Preset, maxKB = p.maxKB): string {
  const bg = p.background && !p.backgroundChoice ? `Latar ${p.background}` : 'Latar bebas';
  const fmt = p.formats.map((f) => f.toUpperCase()).join('/');
  return `${bg} · ${fmt} · maks ${maxKB} KB`;
}
