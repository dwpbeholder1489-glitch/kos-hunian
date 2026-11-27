// Service worker: browser mengganti langganan push (pushsubscriptionchange). Tanpa sesi login, jadi HANYA diterima
// bila alamat lama memang terdaftar (alamat push = URL rahasia per perangkat) dan alamat baru milik layanan push yang dikenal.
import { adminDb } from '@/lib/reminders';
import { vapidKeys } from '@/lib/notifServer';
import { sealKeys, unb64u } from '@/lib/webpush';

export const dynamic = 'force-dynamic';
const HOSTS = [/(^|\.)googleapis\.com$/, /(^|\.)push\.apple\.com$/, /(^|\.)push\.services\.mozilla\.com$/, /(^|\.)notify\.windows\.com$/, /(^|\.)push\.microsoft\.com$/];
const okEndpoint = (e) => { try { const u = new URL(e); return u.protocol === 'https:' && e.length <= 1000 && HOSTS.some((h) => h.test(u.hostname)); } catch { return false; } };

export async function POST(req) {
  const sb = adminDb();
  if (!sb) return Response.json({ ok: false }, { status: 503 });
  const b = await req.json().catch(() => null);
  const oldE = String(b?.old || ''); const sub = b?.subscription || {};
  if (!okEndpoint(oldE) || !okEndpoint(sub.endpoint)) return Response.json({ ok: false }, { status: 400 });
  try { if (unb64u(sub.keys?.p256dh).length !== 65 || unb64u(sub.keys?.auth).length < 16) throw 0; } catch { return Response.json({ ok: false }, { status: 400 }); }
  const vapid = await vapidKeys(sb).catch(() => null);
  if (!vapid) return Response.json({ ok: false }, { status: 503 });
  const { data, error } = await sb.rpc('push_sub_rotate', { p_old: oldE, p_endpoint: sub.endpoint, p_keys_enc: sealKeys(sub.keys, vapid.privateKey), p_app_key: vapid.publicKey });
  return Response.json({ ok: !error && data === true }, { status: error ? 500 : 200 });
}
