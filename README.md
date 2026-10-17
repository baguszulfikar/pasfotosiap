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

## Auto-deploy

Every push to `main` runs `.github/workflows/deploy.yml`: tests, build, then `wrangler pages deploy` to the `pasfotosiap` Pages project. Needs repo secrets `CLOUDFLARE_API_TOKEN` (Account › Cloudflare Pages › Edit) and `CLOUDFLARE_ACCOUNT_ID`.

## Usage stats

`functions/api/event.ts` (a Cloudflare Pages Function) counts anonymous events into the D1 database `pasfotosiap-stats`: one row per day × event × preset × label, incremented in place. No IPs, user agents, identifiers or image data are stored. Events: `page_view` (new/returning + path), `photo_loaded`, `bg_swap`, `bg_swap_failed`, `download` (time-to-download bucket), `upload_feedback` (yes/no), `share` (whatsapp/native/copy).

```bash
npm run stats         # totals per event, last 30 days
npm run stats:daily   # views / photos / downloads / shares per day
npm run stats:detail  # breakdown by preset and label
```

Schema lives in `migrations/`; apply new ones with `npx wrangler@3 d1 migrations apply pasfotosiap-stats --remote`.

## Link preview

`public/og.png` (1200×630) is the WhatsApp/Facebook/Telegram preview. Regenerate with `npm run og-image` after editing `scripts/og-image.mjs`. The site URL used in meta tags and the share button comes from `VITE_SITE_URL` in `.env`; change it when moving to a custom domain.
