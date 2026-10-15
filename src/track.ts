/**
 * Analytics hook. Events carry only preset and outcome, never image data.
 * No analytics script is bundled; wire a cookieless provider here (e.g. Cloudflare Web Analytics
 * custom events or Plausible) and add its origin to the CSP.
 */
export type TrackEvent = 'photo_loaded' | 'bg_swap' | 'bg_swap_failed' | 'download' | 'upload_feedback';

export function track(event: TrackEvent, props: Record<string, string | number | boolean> = {}) {
  const w = window as unknown as { plausible?: (e: string, o: { props: typeof props }) => void };
  w.plausible?.(event, { props });
  window.dispatchEvent(new CustomEvent('pasfoto:track', { detail: { event, props } }));
  if (import.meta.env.DEV) console.debug('[track]', event, props);
}
