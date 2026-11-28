// Pengirim push. Dibangunkan: pg_net seketika saat antrean baru (header x-notif-kick = token di notif_config),
// pg_cron tiap menit bila ada antrean jatuh tempo, cron harian (CRON_SECRET), atau pengguna yang masuk (tombol Uji).
// Aman dipanggil bersamaan: antrean diklaim dengan SKIP LOCKED; panggilan tanpa antrean selesai seketika.
import { timingSafeEqual } from 'node:crypto';
import { adminDb } from '@/lib/reminders';
import { dispatch, userFromRequest } from '@/lib/notifServer';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

async function allowed(req) {
  const kick = req.headers.get('x-notif-kick');
  if (kick) {
    const { data } = await adminDb().rpc('notif_config_get');
    if (data?.kick_token && kick.length === data.kick_token.length && timingSafeEqual(Buffer.from(kick), Buffer.from(data.kick_token))) return 'pg_net';
    return null;
  }
  const auth = req.headers.get('authorization') || '';
  if (process.env.CRON_SECRET && auth === `Bearer ${process.env.CRON_SECRET}`) return 'cron';
  return (await userFromRequest(req)) ? 'pengguna' : null;
}

export async function POST(req) {
  if (!adminDb()) return Response.json({ ok: true, skipped: 'server belum dikonfigurasi' });
  const who = await allowed(req).catch(() => null);
  if (!who) return Response.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  const origin = process.env.APP_URL || new URL(req.url).origin;
  const res = await dispatch({ origin, reason: who, budgetMs: who === 'pengguna' ? 15000 : 45000 }).catch((e) => ({ ok: false, error: String(e.message || e) }));
  return Response.json(res, { status: res.ok ? 200 : 500, headers: { 'Cache-Control': 'no-store' } });
}
