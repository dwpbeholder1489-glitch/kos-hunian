// Dijalankan Vercel Cron setiap pagi (lihat vercel.json): pengingat jatuh tempo, email arahan pengguna baru,
// ringkasan mingguan (Senin) dan bulanan (tanggal 1).
import { runReminders } from '@/lib/reminders';
import { runOnboarding } from '@/lib/onboarding';
import { runSummaries } from '@/lib/summaries';
import { runRetailAlerts } from '@/lib/retailAlerts';
import { adminDb } from '@/lib/reminders';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function GET(req) {
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.get('authorization') !== `Bearer ${secret}`) return Response.json({ error: 'unauthorized' }, { status: 401 });
  const origin = process.env.APP_URL || new URL(req.url).origin;
  const safe = (p) => p.catch((e) => ({ ok: false, error: e.message }));
  const [reminders, onboarding, summaries, toko] = await Promise.all([safe(runReminders({ origin })), safe(runOnboarding({ origin })), safe(runSummaries({ origin })), safe(runRetailAlerts({ origin }))]);
  const res = { ok: reminders.ok && onboarding.ok && summaries.ok && toko.ok, reminders, onboarding, summaries, toko };
  console.log('[cron daily]', JSON.stringify(res));
  try { await adminDb()?.from('cron_runs').insert({ ok: res.ok, result: res }); } catch {} // untuk halaman Status sistem
  return Response.json(res, { status: res.ok ? 200 : 500 });
}
