// Dijalankan Vercel Cron setiap pagi (lihat vercel.json): pengingat jatuh tempo, email arahan pengguna baru,
// ringkasan mingguan (Senin) dan bulanan (tanggal 1).
import { runReminders } from '@/lib/reminders';
import { runOnboarding } from '@/lib/onboarding';
import { runSummaries } from '@/lib/summaries';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function GET(req) {
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.get('authorization') !== `Bearer ${secret}`) return Response.json({ error: 'unauthorized' }, { status: 401 });
  const origin = process.env.APP_URL || new URL(req.url).origin;
  const safe = (p) => p.catch((e) => ({ ok: false, error: e.message }));
  const [reminders, onboarding, summaries] = await Promise.all([safe(runReminders({ origin })), safe(runOnboarding({ origin })), safe(runSummaries({ origin }))]);
  const res = { ok: reminders.ok && onboarding.ok && summaries.ok, reminders, onboarding, summaries };
  console.log('[cron daily]', JSON.stringify(res));
  return Response.json(res, { status: res.ok ? 200 : 500 });
}
