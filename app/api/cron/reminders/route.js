// Dijalankan Vercel Cron setiap pagi (lihat vercel.json).
import { runReminders } from '@/lib/reminders';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function GET(req) {
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.get('authorization') !== `Bearer ${secret}`) return Response.json({ error: 'unauthorized' }, { status: 401 });
  const origin = process.env.APP_URL || new URL(req.url).origin;
  const res = await runReminders({ origin });
  console.log('[cron reminders]', JSON.stringify(res));
  return Response.json(res, { status: res.ok ? 200 : 500 });
}
