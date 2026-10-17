/// <reference types="vitest" />
import { defineConfig, type Plugin } from 'vite';
import preact from '@preact/preset-vite';
import { VitePWA } from 'vite-plugin-pwa';
import { fileURLToPath } from 'node:url';

const root = (p: string) => fileURLToPath(new URL(p, import.meta.url));

// Privacy is a hard requirement: nothing may be fetched from or sent to another origin.
// 'unsafe-eval' is needed only by the lazy-loaded HEIC decoder (heic2any runs libheif in a blob worker
// that builds functions at runtime). connect-src / img-src / form-action stay locked to 'self'.
export const CSP = [
  "default-src 'self'",
  "script-src 'self' 'wasm-unsafe-eval' 'unsafe-eval'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' blob: data:",
  "connect-src 'self' blob: data:",
  "worker-src 'self' blob:",
  "font-src 'self'",
  "manifest-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'none'",
  "frame-ancestors 'none'",
].join('; ');

const SECURITY_HEADERS: Record<string, string> = {
  'Content-Security-Policy': CSP,
  'Referrer-Policy': 'no-referrer',
  'X-Content-Type-Options': 'nosniff',
  'Permissions-Policy': 'geolocation=(), microphone=(), interest-cohort=()',
};

/** Emits a Cloudflare Pages / Netlify `_headers` file so the CSP is applied in production. */
function headersFile(): Plugin {
  return {
    name: 'emit-headers-file',
    generateBundle() {
      const lines = ['/*', ...Object.entries(SECURITY_HEADERS).map(([k, v]) => `  ${k}: ${v}`)];
      lines.push('', '/mediapipe/*', '  Cache-Control: public, max-age=31536000, immutable');
      lines.push('', '/models/*', '  Cache-Control: public, max-age=2592000');
      this.emitFile({ type: 'asset', fileName: '_headers', source: lines.join('\n') + '\n' });
    },
  };
}

export const LANDING_PAGES = ['kompres-foto-200kb', 'pas-foto-background-merah', 'ukuran-pas-foto-cpns'];

export default defineConfig({
  plugins: [
    preact(),
    headersFile(),
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: false, // registered in src/sw.ts
      manifest: {
        name: 'Pas Foto Siap Upload',
        short_name: 'Pas Foto',
        description: 'Ubah selfie jadi pas foto siap upload CPNS, PPPK, SKCK. Gratis, tanpa daftar, foto tidak dikirim ke server.',
        lang: 'id',
        start_url: '/',
        display: 'standalone',
        background_color: '#ffffff',
        theme_color: '#b91c1c',
        icons: [{ src: '/icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' }],
      },
      workbox: {
        skipWaiting: true,
        clientsClaim: true, // lets src/sw.ts see the new version take over and reload
        globPatterns: ['**/*.{js,css,html,svg,webmanifest}'],
        // Heavy, on-demand pieces are cached at runtime the first time they are used.
        globIgnores: ['**/heic2any-*.js', '**/vision_bundle-*.js', 'mediapipe/**', 'models/**'],
        navigateFallback: null,
        runtimeCaching: [
          {
            urlPattern: ({ url }) =>
              url.pathname.startsWith('/mediapipe/') ||
              url.pathname.startsWith('/models/') ||
              /\/assets\/(heic2any|vision_bundle)-.*\.js$/.test(url.pathname),
            handler: 'CacheFirst',
            options: { cacheName: 'on-demand', expiration: { maxEntries: 20 } },
          },
        ],
      },
    }),
  ],
  build: {
    target: 'es2020',
    rollupOptions: {
      input: {
        main: root('index.html'),
        ...Object.fromEntries(LANDING_PAGES.map((p) => [p, root(`${p}/index.html`)])),
      },
    },
  },
  preview: { headers: SECURITY_HEADERS },
  test: { environment: 'node' },
});

