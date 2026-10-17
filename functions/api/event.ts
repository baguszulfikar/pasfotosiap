/**
 * Anonymous usage counter. Accepts only a known event name plus short whitelisted labels and
 * increments a daily aggregate row. Nothing identifying (IP, user agent, ids) and never image data.
 */
interface Env {
  DB: {
    prepare(sql: string): { bind(...v: unknown[]): { run(): Promise<unknown> } };
  };
}

const EVENTS = new Set([
  'page_view',
  'photo_loaded',
  'bg_swap',
  'bg_swap_failed',
  'download',
  'upload_feedback',
  'share',
]);
const PRESETS = new Set(['', 'cpns', 'skck', 'lamaran', 'custom']);
const LABEL = /^[a-z0-9_\-/<>+.]{0,40}$/i;

export const onRequestPost = async ({ request, env }: { request: Request; env: Env }) => {
  let body: { event?: unknown; preset?: unknown; detail?: unknown };
  try {
    const text = await request.text();
    if (text.length > 300) return new Response(null, { status: 413 });
    body = JSON.parse(text);
  } catch {
    return new Response(null, { status: 400 });
  }
  const event = String(body.event ?? '');
  const preset = String(body.preset ?? '');
  const detail = String(body.detail ?? '');
  if (!EVENTS.has(event) || !PRESETS.has(preset) || !LABEL.test(detail)) {
    return new Response(null, { status: 400 });
  }
  // Day in Indonesia's WIB (UTC+7), where nearly all users are.
  const day = new Date(Date.now() + 7 * 3600_000).toISOString().slice(0, 10);
  await env.DB.prepare(
    `INSERT INTO counters (day, event, preset, detail, n) VALUES (?1, ?2, ?3, ?4, 1)
     ON CONFLICT (day, event, preset, detail) DO UPDATE SET n = n + 1`,
  )
    .bind(day, event, preset, detail)
    .run();
  return new Response(null, { status: 204 });
};
