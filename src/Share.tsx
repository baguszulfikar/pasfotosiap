import { useState } from 'preact/hooks';
import { track } from './track';

const SITE_URL = import.meta.env.VITE_SITE_URL as string;
const MESSAGE =
  'Bikin pas foto CPNS/SKCK/lamaran kerja dari selfie: latar merah, ukuran 3x4/4x6, otomatis di bawah 200 KB. ' +
  'Gratis dan fotonya tidak dikirim ke server 👉';

/** Shares the site link (never the photo). Native share sheet on phones, WhatsApp/copy elsewhere. */
export function ShareBox({ preset }: { preset: string }) {
  const [copied, setCopied] = useState(false);
  const canNativeShare = typeof navigator.share === 'function';
  const waHref = `https://wa.me/?text=${encodeURIComponent(`${MESSAGE} ${SITE_URL}`)}`;

  async function nativeShare() {
    try {
      await navigator.share({ title: 'Pas Foto Siap Upload', text: MESSAGE, url: SITE_URL });
      track('share', preset, 'native');
    } catch {
      // User closed the sheet.
    }
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(`${MESSAGE} ${SITE_URL}`);
      setCopied(true);
      track('share', preset, 'copy');
    } catch {
      // Clipboard blocked; the link is still visible in WhatsApp option.
    }
  }

  return (
    <div class="share">
      <p>Teman juga lagi daftar kerja atau CPNS? Bagikan alat ini:</p>
      <div class="row">
        <a
          class="btn wa"
          href={waHref}
          target="_blank"
          rel="noopener noreferrer"
          onClick={() => track('share', preset, 'whatsapp')}
        >
          Bagikan ke WhatsApp
        </a>
        {canNativeShare ? (
          <button type="button" class="btn" onClick={nativeShare}>Bagikan lainnya</button>
        ) : (
          <button type="button" class="btn" onClick={copy}>{copied ? 'Tautan disalin ✓' : 'Salin tautan'}</button>
        )}
      </div>
    </div>
  );
}
