# Pas Foto Siap Upload

Browser-only tool that turns a selfie into a pas foto that passes Indonesian portal checks (CPNS/PPPK, SKCK, lamaran kerja, custom). No backend: every image stays on the device.

## Run

```bash
npm install      # also copies the MediaPipe WASM runtime into public/mediapipe
npm run dev      # http://localhost:5173
npm test         # compressor unit tests
npm run build    # static site in dist/ (includes _headers with the CSP)
npm run preview  # serves dist/ with the production CSP on http://localhost:4173
```

Requires Node 18.17+. `workbox-build` is pinned to 7.1.1 via `overrides` because newer versions need Node ≥ 18.19.

## Layout

| Path | What |
| --- | --- |
| `src/presets.json` | Portal rules as data (background, format, KB cap, ratios, last-checked, source). Add a portal here. |
| `src/compress.ts` | JPEG quality binary search (floor 0.6) targeting 95–98% of the cap, then 10% pixel step-downs. |
| `src/image.ts` | Decode (HEIC via lazy heic2any), EXIF orientation via `<img>`, crop/rotate rendering. Canvas re-encode strips all metadata. |
| `src/segment.ts` | MediaPipe selfie segmentation, loaded on first background pick; refuses the swap if no person is detected. |
| `src/Cropper.tsx` | Ratio-locked crop frame: drag, pinch, wheel, keyboard, head-and-shoulders guide. |
| `kompres-foto-200kb/`, `pas-foto-background-merah/`, `ukuran-pas-foto-cpns/` | SEO landing pages with FAQ schema; each opens the tool with a preset. |
| `public/models/selfie_segmenter.tflite` | MediaPipe model (Apache-2.0, 250 KB), self-hosted. |

## Deploy (Cloudflare Pages)

Build command `npm run build`, output `dist`. The generated `dist/_headers` applies the CSP. The MediaPipe WASM (13.5 MB, ~4 MB compressed) is under Cloudflare's 25 MiB per-file limit.

## Before launch

- Add `<link rel="canonical">` and a `sitemap.xml` once the domain is chosen.
- Re-verify each preset against the official guide and update `lastChecked`.
- Wire analytics in `src/track.ts` and add its origin to the CSP in `vite.config.ts`.
- CSP includes `'unsafe-eval'` only because heic2any's decoder needs it; `connect-src`/`img-src`/`form-action` stay `'self'`.
