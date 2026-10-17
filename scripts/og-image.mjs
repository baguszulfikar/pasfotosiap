// Renders public/og.png (1200x630), the link preview shown by WhatsApp, Facebook, Telegram, X.
// Run: node scripts/og-image.mjs
import { Resvg } from '@resvg/resvg-js';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const FONT = "'Segoe UI', Arial, sans-serif";

// A simple head-and-shoulders figure; `bg` paints behind it.
const person = (x, y, w, h, bg, extras = '') => `
  <svg x="${x}" y="${y}" width="${w}" height="${h}" viewBox="0 0 300 400">
    <rect width="300" height="400" fill="${bg}"/>
    ${extras}
    <path d="M30 400 C 40 315, 95 290, 125 285 L 175 285 C 205 290, 260 315, 270 400 Z" fill="#1e2b45"/>
    <path d="M128 285 L150 330 L172 285 Z" fill="#f4f4f5"/>
    <rect x="128" y="235" width="44" height="55" fill="#c98f66"/>
    <ellipse cx="150" cy="170" rx="62" ry="78" fill="#d9a47c"/>
    <path d="M86 165 C 82 100, 120 82, 150 82 C 185 82, 220 100, 214 165 C 205 130, 180 118, 150 120 C 118 118, 96 130, 86 165 Z" fill="#1a1412"/>
    <circle cx="127" cy="172" r="6" fill="#2a1a12"/><circle cx="173" cy="172" r="6" fill="#2a1a12"/>
    <path d="M132 208 Q150 220 168 208" stroke="#8a4a3a" stroke-width="5" fill="none" stroke-linecap="round"/>
  </svg>`;

const tick = (x, y) =>
  `<path d="M${x + 4} ${y + 12} l9 9 l17 -19" stroke="#157f3b" stroke-width="5" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`;

const messyBg = `
  <rect x="0" y="0" width="140" height="260" fill="#8fa98a"/><rect x="170" y="40" width="130" height="180" fill="#c9b79c"/>
  <rect x="20" y="60" width="70" height="90" fill="#e8dcc6"/><circle cx="250" cy="90" r="30" fill="#f2d16b"/>
  <rect x="0" y="250" width="300" height="150" fill="#7b6a58"/>`;

const svg = `
<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  <rect width="1200" height="630" fill="#ffffff"/>
  <rect width="1200" height="12" fill="#b91c1c"/>

  <text x="64" y="118" font-family="${FONT}" font-size="60" font-weight="800" fill="#16181d">Pas Foto Siap Upload</text>
  <text x="64" y="172" font-family="${FONT}" font-size="27" fill="#555b66">Untuk CPNS, PPPK, SKCK &amp; lamaran kerja</text>

  <g font-family="${FONT}" font-size="28" fill="#16181d">
    ${['Latar merah, biru, putih', 'Potong 3x4 / 4x6', 'Otomatis di bawah 200 KB', 'Gratis, tanpa daftar']
      .map((t, i) => `${tick(64, 240 + i * 54)}<text x="108" y="${262 + i * 54}">${t}</text>`)
      .join('')}
  </g>

  <rect x="64" y="476" width="520" height="70" rx="35" fill="#fdecec"/>
  <text x="96" y="521" font-family="${FONT}" font-size="26" font-weight="700" fill="#991b1b">🔒 Foto tidak dikirim ke server</text>

  <!-- before -->
  <g>
    <rect x="652" y="146" width="216" height="288" rx="6" fill="#e5e7eb"/>
    ${person(660, 154, 200, 272, '#000', messyBg)}
    <text x="760" y="474" text-anchor="middle" font-family="${FONT}" font-size="26" font-weight="700" fill="#b42318">3,2 MB</text>
    <text x="760" y="506" text-anchor="middle" font-family="${FONT}" font-size="20" fill="#555b66">selfie asli</text>
  </g>

  <path d="M884 290 L 930 290" stroke="#16181d" stroke-width="6" stroke-linecap="round"/>
  <path d="M918 272 L 940 290 L 918 308" stroke="#16181d" stroke-width="6" fill="none" stroke-linecap="round" stroke-linejoin="round"/>

  <!-- after -->
  <g>
    <rect x="956" y="146" width="216" height="288" rx="6" fill="#16181d"/>
    ${person(964, 154, 200, 272, '#db0000')}
    <text x="1064" y="474" text-anchor="middle" font-family="${FONT}" font-size="26" font-weight="700" fill="#157f3b">198 KB</text>${tick(1112, 452)}
    <text x="1064" y="506" text-anchor="middle" font-family="${FONT}" font-size="20" fill="#555b66">siap upload</text>
  </g>

  <text x="1136" y="596" text-anchor="end" font-family="${FONT}" font-size="24" font-weight="700" fill="#b91c1c">pasfotosiap.pages.dev</text>
</svg>`;

const png = new Resvg(svg, {
  fitTo: { mode: 'width', value: 1200 },
  font: { loadSystemFonts: true, defaultFontFamily: 'Segoe UI' },
}).render().asPng();
const out = fileURLToPath(new URL('../public/og.png', import.meta.url));
writeFileSync(out, png);
console.log(`wrote ${out} (${(png.length / 1024).toFixed(0)} KB)`);
