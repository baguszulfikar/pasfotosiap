import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { Cropper } from './Cropper';
import { compressToLimit, type Encoded } from './compress';
import { canvasToBlob, coverScale, loadPhoto, renderOutput, UserError, type Transform } from './image';
import { BG_COLORS, PRESETS, RATIO_PX, rulesLine, type BgColor, type Format, type Preset, type Ratio } from './presets';
import { composite, loadSegmenter, NoPersonError, personMask } from './segment';
import { track } from './track';

type Step = 1 | 2 | 3 | 4;
type Bg = 'asli' | BgColor;
type BgState = { kind: 'idle' } | { kind: 'loading'; progress: number } | { kind: 'working' } | { kind: 'error'; noPerson: boolean };

interface Result extends Encoded {
  url: string;
  fileName: string;
}

interface Check {
  ok: boolean | 'warn';
  label: string;
}

const STEP_LABELS = ['Pilih keperluan', 'Unggah foto', 'Atur potongan', 'Unduh'];

const MIN_KB = 20;
const MAX_KB = 5000;
const clampKB = (s: string) => {
  const v = Math.round(Number(s));
  return Number.isFinite(v) && v > 0 ? Math.min(MAX_KB, Math.max(MIN_KB, v)) : MIN_KB;
};

const kb = (bytes: number) => (bytes / 1024).toLocaleString('id-ID', { maximumFractionDigits: 1 });

export function App({ initialPreset }: { initialPreset?: Preset }) {
  const [step, setStep] = useState<Step>(initialPreset ? 2 : 1);
  const [preset, setPreset] = useState<Preset | undefined>(initialPreset);
  // The field holds free text while typing; the limit actually used is always clamped.
  const [kbDraft, setKbDraft] = useState(String(initialPreset?.maxKB ?? 200));
  const maxKB = clampKB(kbDraft);
  const setMaxKB = (v: number) => setKbDraft(String(v));
  const [ratio, setRatio] = useState<Ratio>(initialPreset?.ratios[0] ?? '3x4');
  const [format, setFormat] = useState<Format>('jpg');

  const [source, setSource] = useState<HTMLCanvasElement | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loadingPhoto, setLoadingPhoto] = useState(false);
  const loadedAt = useRef(0);

  const [bg, setBg] = useState<Bg>('asli');
  const [bgState, setBgState] = useState<BgState>({ kind: 'idle' });
  const mask = useRef<HTMLCanvasElement | null>(null);
  const [transform, setTransform] = useState<Transform>({ scale: 1, rotationDeg: 0, x: 0, y: 0 });

  const [result, setResult] = useState<Result | null>(null);
  const [processing, setProcessing] = useState(false);
  const [compressError, setCompressError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<'none' | 'asked' | 'done'>('none');

  const out = RATIO_PX[ratio];
  const fill = bg === 'asli' ? '#ffffff' : BG_COLORS[bg].hex;

  const workSrc = useMemo(() => {
    if (!source) return null;
    if (bg === 'asli' || !mask.current) return source;
    return composite(source, mask.current, BG_COLORS[bg].hex);
  }, [source, bg, bgState]);

  const stepRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    stepRef.current?.focus();
  }, [step]);

  // Revoke stale download URLs.
  useEffect(() => () => {
    if (result) URL.revokeObjectURL(result.url);
  }, [result]);

  function resetTransform(src: HTMLCanvasElement, r: Ratio) {
    const o = RATIO_PX[r];
    setTransform({ scale: coverScale(src, o.w, o.h), rotationDeg: 0, x: 0, y: 0 });
  }

  function choosePreset(p: Preset) {
    setPreset(p);
    setMaxKB(p.maxKB);
    setRatio(p.ratios[0]);
    setFormat('jpg');
    if (source) resetTransform(source, p.ratios[0]);
    setStep(source ? 3 : 2);
  }

  async function onFile(file: File | undefined) {
    if (!file) return;
    setLoadError(null);
    setLoadingPhoto(true);
    try {
      const src = await loadPhoto(file);
      mask.current = null;
      setBg('asli');
      setBgState({ kind: 'idle' });
      setSource(src);
      resetTransform(src, ratio);
      loadedAt.current = performance.now();
      track('photo_loaded', { preset: preset!.id });
      setStep(3);
    } catch (e) {
      setLoadError(e instanceof UserError ? e.message : 'Foto tidak bisa dibuka. Coba foto lain.');
    } finally {
      setLoadingPhoto(false);
    }
  }

  async function chooseBg(next: Bg) {
    if (next === 'asli' || mask.current) {
      setBg(next);
      return;
    }
    try {
      setBgState({ kind: 'loading', progress: 0 });
      const seg = await loadSegmenter((p) => setBgState({ kind: 'loading', progress: p }));
      setBgState({ kind: 'working' });
      await new Promise((r) => setTimeout(r, 30)); // let the "processing" state paint
      mask.current = personMask(seg, source!);
      setBg(next);
      setBgState({ kind: 'idle' });
      track('bg_swap', { preset: preset!.id, color: next });
    } catch (e) {
      console.error(e);
      setBgState({ kind: 'error', noPerson: e instanceof NoPersonError });
      track('bg_swap_failed', { preset: preset!.id, reason: e instanceof NoPersonError ? 'no_person' : 'load' });
    }
  }

  async function finish() {
    if (!workSrc || !preset) return;
    setKbDraft((d) => String(clampKB(d)));
    setStep(4);
    setProcessing(true);
    setCompressError(null);
    setResult(null);
    setFeedback('none');
    await new Promise((r) => setTimeout(r, 30));
    const enc = await compressToLimit(
      {
        render: (factor) => renderOutput(workSrc, transform, out.w, out.h, factor, fill),
        encode: canvasToBlob,
      },
      maxKB * 1024,
      format,
    );
    setProcessing(false);
    if (!enc) {
      setCompressError(`Batas ${maxKB} KB terlalu kecil untuk foto yang masih jelas. Naikkan batas ukuran atau gunakan JPG.`);
      return;
    }
    const sizeKB = Math.ceil(enc.blob.size / 1024);
    setResult({
      ...enc,
      url: URL.createObjectURL(enc.blob),
      fileName: `pasfoto_${preset.id}_${sizeKB}kb.${format === 'png' ? 'png' : 'jpg'}`,
    });
  }

  function onDownload() {
    track('download', {
      preset: preset!.id,
      kb: Math.ceil(result!.blob.size / 1024),
      seconds: Math.round((performance.now() - loadedAt.current) / 1000),
      bg,
      scaleSteps: result!.scaleSteps,
    });
    setFeedback('asked');
  }

  function restart() {
    setSource(null);
    mask.current = null;
    setBg('asli');
    setBgState({ kind: 'idle' });
    setResult(null);
    setStep(preset ? 2 : 1);
  }

  const checks: Check[] = useMemo(() => {
    if (!result || !preset) return [];
    const list: Check[] = [
      { ok: result.blob.size <= maxKB * 1024, label: `Ukuran ${kb(result.blob.size)} KB (maks ${maxKB} KB)` },
      { ok: true, label: `Format ${format.toUpperCase()}` },
      { ok: true, label: `Rasio ${ratio.replace('x', ' x ')} · ${result.width} × ${result.height} piksel` },
    ];
    if (preset.background && !preset.backgroundChoice) {
      const want = preset.background;
      list.push(
        bg === want
          ? { ok: true, label: `Latar ${want}` }
          : { ok: 'warn', label: `Latar ${bg === 'asli' ? 'asli' : bg}: pastikan latar foto berwarna ${want}` },
      );
    } else {
      list.push({ ok: true, label: `Latar ${bg === 'asli' ? 'asli' : bg}` });
    }
    return list;
  }, [result, preset, maxKB, format, ratio, bg]);

  return (
    <div class="tool">
      <ol class="steps" aria-label="Langkah">
        {STEP_LABELS.map((l, i) => (
          <li key={l} class={i + 1 === step ? 'current' : i + 1 < step ? 'done' : ''} aria-current={i + 1 === step ? 'step' : undefined}>
            <span class="num">{i + 1}</span>
            <span class="lbl">{l}</span>
          </li>
        ))}
      </ol>

      {step === 1 && (
        <section>
          <h2 ref={stepRef} tabIndex={-1}>Untuk keperluan apa?</h2>
          <div class="presets">
            {PRESETS.map((p) => (
              <button type="button" class="preset" key={p.id} onClick={() => choosePreset(p)}>
                <strong>{p.name}</strong>
                <span>{rulesLine(p)}</span>
              </button>
            ))}
          </div>
        </section>
      )}

      {step === 2 && preset && (
        <section>
          <h2 ref={stepRef} tabIndex={-1}>Unggah foto</h2>
          <p class="chosen">
            {preset.name}: {rulesLine(preset, maxKB)}{' '}
            <button type="button" class="link" onClick={() => setStep(1)}>Ganti</button>
          </p>
          <p class="privacy" role="note">🔒 Foto tidak dikirim ke server. Semua diproses di HP/komputermu.</p>
          <div
            class="drop"
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              onFile(e.dataTransfer?.files[0]);
            }}
          >
            <label class="btn primary">
              Ambil foto
              <input type="file" accept="image/*" capture="user" class="sr-only" onChange={(e) => onFile(e.currentTarget.files?.[0])} />
            </label>
            <label class="btn">
              Pilih dari galeri
              <input type="file" accept="image/*,.heic,.heif" class="sr-only" onChange={(e) => onFile(e.currentTarget.files?.[0])} />
            </label>
            <p class="hint">JPG, PNG, WebP, atau HEIC · maks 20 MB</p>
          </div>
          {loadingPhoto && <p role="status">Membuka foto…</p>}
          {loadError && <p class="error" role="alert">{loadError}</p>}
          <details class="tips">
            <summary>Tips foto yang bagus</summary>
            <ul>
              <li>Hadap lurus ke kamera, wajah tidak miring.</li>
              <li>Cahaya dari depan, tidak gelap atau silau.</li>
              <li>Berdiri di depan tembok polos supaya latar mudah diganti.</li>
            </ul>
          </details>
        </section>
      )}

      {step === 3 && preset && workSrc && (
        <section>
          <h2 ref={stepRef} tabIndex={-1}>Atur potongan</h2>
          <p class="hint">Geser dan cubit foto sampai wajah pas di garis panduan.</p>

          {preset.ratios.length > 1 && (
            <div class="row" role="radiogroup" aria-label="Ukuran">
              {preset.ratios.map((r) => (
                <button
                  type="button"
                  key={r}
                  role="radio"
                  aria-checked={ratio === r}
                  class={ratio === r ? 'chip on' : 'chip'}
                  onClick={() => {
                    setRatio(r);
                    resetTransform(workSrc, r);
                  }}
                >
                  {r.replace('x', ' x ')}
                </button>
              ))}
            </div>
          )}

          <Cropper src={workSrc} outW={out.w} outH={out.h} fill={fill} transform={transform} onChange={setTransform} />

          <div class="rotate">
            <button type="button" aria-label="Putar kiri 1 derajat" onClick={() => setTransform({ ...transform, rotationDeg: Math.max(-15, transform.rotationDeg - 1) })}>⟲</button>
            <label>
              <span class="sr-only">Kemiringan</span>
              <input
                type="range"
                min={-15}
                max={15}
                step={1}
                value={transform.rotationDeg}
                onInput={(e) => setTransform({ ...transform, rotationDeg: Number(e.currentTarget.value) })}
              />
            </label>
            <button type="button" aria-label="Putar kanan 1 derajat" onClick={() => setTransform({ ...transform, rotationDeg: Math.min(15, transform.rotationDeg + 1) })}>⟳</button>
            <output aria-live="polite">{transform.rotationDeg}°</output>
          </div>

          <fieldset class="bg">
            <legend>Warna latar</legend>
            <div class="row">
              {(['asli', 'merah', 'biru', 'putih'] as Bg[]).map((c) => (
                <button
                  type="button"
                  key={c}
                  aria-pressed={bg === c}
                  class={bg === c ? 'swatch on' : 'swatch'}
                  disabled={bgState.kind === 'loading' || bgState.kind === 'working'}
                  onClick={() => chooseBg(c)}
                >
                  <span class={`dot dot-${c}`} aria-hidden="true" />
                  {c === 'asli' ? 'Asli' : BG_COLORS[c].label}
                  {preset.background === c && <em class="badge">disarankan</em>}
                </button>
              ))}
            </div>
            {bgState.kind === 'loading' && (
              <div class="progress" role="status">
                <span>Menyiapkan pengganti latar (sekali saja, ±4 MB)…</span>
                <progress max={1} value={bgState.progress} />
              </div>
            )}
            {bgState.kind === 'working' && <p role="status">Memisahkan wajah dari latar…</p>}
            {bgState.kind === 'error' && (
              <p class="error" role="alert">
                {bgState.noPerson
                  ? 'Wajah dan badan tidak terdeteksi, jadi latar tidak diganti. Pastikan wajah terlihat jelas dan menghadap kamera.'
                  : 'Ganti latar tidak bisa dijalankan di perangkat ini.'}{' '}
                Tips: foto ulang di depan tembok polos berwarna terang, lalu pakai latar "Asli".
              </p>
            )}
          </fieldset>

          {(preset.kbEditable || preset.formats.length > 1) && (
            <fieldset class="settings">
              <legend>Pengaturan file</legend>
              {preset.kbEditable && (
                <label>
                  Batas ukuran (KB)
                  <input
                    type="number"
                    inputMode="numeric"
                    min={MIN_KB}
                    max={MAX_KB}
                    value={kbDraft}
                    aria-describedby="kb-hint"
                    onInput={(e) => setKbDraft(e.currentTarget.value)}
                    onBlur={() => setKbDraft((d) => String(clampKB(d)))}
                  />
                  <span id="kb-hint" class="sr-only">Antara {MIN_KB} dan {MAX_KB} KB</span>
                </label>
              )}
              {preset.formats.length > 1 && (
                <label>
                  Format
                  <select value={format} onChange={(e) => setFormat(e.currentTarget.value as Format)}>
                    {preset.formats.map((f) => (
                      <option key={f} value={f}>{f.toUpperCase()}</option>
                    ))}
                  </select>
                </label>
              )}
            </fieldset>
          )}

          <div class="actions">
            <button type="button" class="btn" onClick={() => setStep(2)}>Kembali</button>
            <button type="button" class="btn primary" onClick={finish} disabled={bgState.kind === 'loading' || bgState.kind === 'working'}>
              Lanjut
            </button>
          </div>
        </section>
      )}

      {step === 4 && preset && (
        <section>
          <h2 ref={stepRef} tabIndex={-1}>Unduh</h2>
          {processing && <p role="status">Mengompres foto…</p>}
          {compressError && <p class="error" role="alert">{compressError}</p>}
          {result && (
            <>
              <img class="result" src={result.url} width={result.width} height={result.height} alt="Hasil pas foto" />
              <ul class="checks">
                {checks.map((c) => (
                  <li key={c.label} class={c.ok === true ? 'ok' : c.ok === 'warn' ? 'warn' : 'fail'}>
                    <span aria-hidden="true">{c.ok === true ? '✓' : c.ok === 'warn' ? '!' : '✗'}</span>
                    <span class="sr-only">{c.ok === true ? 'Lolos: ' : c.ok === 'warn' ? 'Perhatikan: ' : 'Gagal: '}</span>
                    {c.label}
                  </li>
                ))}
              </ul>
              {result.scaleSteps > 0 && (
                <p class="note">
                  Ukuran piksel diturunkan {Math.round((1 - Math.pow(0.9, result.scaleSteps)) * 100)}% supaya file di bawah {maxKB} KB
                  tanpa membuat wajah buram.
                </p>
              )}
              <a class="btn primary big" href={result.url} download={result.fileName} onClick={onDownload}>
                Unduh {result.fileName}
              </a>
              {feedback === 'asked' && (
                <div class="feedback" role="group" aria-label="Umpan balik">
                  <p>Fotonya berhasil diunggah ke portal?</p>
                  <div class="row">
                    {[
                      ['Ya, berhasil', true],
                      ['Tidak, ditolak', false],
                    ].map(([label, ok]) => (
                      <button
                        type="button"
                        class="chip"
                        key={String(label)}
                        onClick={() => {
                          track('upload_feedback', { preset: preset.id, ok: ok as boolean });
                          setFeedback('done');
                        }}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {feedback === 'done' && <p class="note">Terima kasih atas masukannya!</p>}
            </>
          )}
          <div class="actions">
            <button type="button" class="btn" onClick={() => setStep(3)}>Atur ulang</button>
            <button type="button" class="btn" onClick={restart}>Foto lain</button>
          </div>
          {preset.lastChecked ? (
            <p class="fine">
              Aturan {preset.name} terakhir dicek: {preset.lastChecked}
              {preset.sourceUrl && (
                <>
                  {' '}· sumber: <a href={preset.sourceUrl} rel="noopener noreferrer" target="_blank">{preset.sourceName}</a>
                </>
              )}
              . Selalu cek ulang panduan resmi portal.
            </p>
          ) : (
            <p class="fine">Aturan {preset.name} belum diverifikasi dari panduan resmi. Cek ulang ketentuan portal tujuan.</p>
          )}
        </section>
      )}
    </div>
  );
}
