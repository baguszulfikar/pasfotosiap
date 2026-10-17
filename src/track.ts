/**
 * Anonymous, aggregate usage counting (served by functions/api/event.ts on our own origin).
 * Events carry only an event name, the preset and one short label. Never image data or identifiers.
 */
export type TrackEvent =
  | 'page_view'
  | 'photo_loaded'
  | 'bg_swap'
  | 'bg_swap_failed'
  | 'download'
  | 'upload_feedback'
  | 'share';

export function track(event: TrackEvent, preset = '', detail = '') {
  if (import.meta.env.DEV) {
    console.debug('[track]', event, preset, detail);
    return;
  }
  const body = JSON.stringify({ event, preset, detail });
  try {
    if (!navigator.sendBeacon?.('/api/event', body)) {
      fetch('/api/event', { method: 'POST', body, keepalive: true }).catch(() => {});
    }
  } catch {
    // Counting must never break the tool.
  }
}

/** Bucket for "time from photo load to download", matching the PRD's < 120 s target. */
export function durationBucket(seconds: number): string {
  if (seconds < 60) return '<60s';
  if (seconds < 120) return '60-120s';
  if (seconds < 300) return '120-300s';
  return '>300s';
}

/** Counts a page view, marking whether this device has visited before (return-visit metric). */
export function trackPageView() {
  let seen = false;
  try {
    seen = localStorage.getItem('pf_seen') !== null;
    localStorage.setItem('pf_seen', '1');
  } catch {
    // Storage blocked: count as new.
  }
  track('page_view', '', (seen ? 'ret' : 'new') + location.pathname.slice(0, 36));
}
