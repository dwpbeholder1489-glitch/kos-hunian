// Dijalankan Vercel Cron setiap pagi (lihat vercel.json): pengingat jatuh tempo, email arahan pengguna baru,
// ringkasan mingguan (Senin) dan bulanan (tanggal 1), pembersihan file lampiran yang dihapus.
import { runReminders } from '@/lib/reminders';
import { runOnboarding } from '@/lib/onboarding';
import { runSummaries } from '@/lib/summaries';
import { runRetailAlerts } from '@/lib/retailAlerts';
import { runAutomations } from '@/lib/automation';
import { adminDb } from '@/lib/reminders';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function GET(req) {
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.get('authorization') !== `Bearer ${secret}`) return Response.json({ error: 'unauthorized' }, { status: 401 });
  const origin = process.env.APP_URL || new URL(req.url).origin;
  const safe = (p) => p.catch((e) => ({ ok: false, error: e.message }));
  const [reminders, onboarding, summaries, toko, otomatisasi] = await Promise.all([safe(runReminders({ origin })), safe(runOnboarding({ origin })), safe(runSummaries({ origin })), safe(runRetailAlerts({ origin })), safe(runAutomations({ origin }))]);
  // Pembukuan: posting jurnal dari transaksi kemarin (halaman Pembukuan juga memposting saat dibuka)
  let pembukuan = { ok: true, skipped: 'belum dikonfigurasi' };
  try { const sb = adminDb(); if (sb) { const r = await sb.rpc('acct_sync_all'); pembukuan = r.error ? { ok: false, error: r.error.message } : { ok: !(r.data?.gagal > 0), ...r.data }; } } catch (e) { pembukuan = { ok: false, error: e.message }; }
  // Lampiran: hapus file yang sudah dihapus pengguna / unggahan yang tidak selesai dari penyimpanan
  let lampiran = { ok: true, skipped: 'belum dikonfigurasi' };
  try {
    const sb = adminDb();
    if (sb) {
      const { data: rows, error } = await sb.rpc('att_purge_list', { p_limit: 500 });
      if (error) throw error;
      if (rows?.length) { const r = await sb.storage.from('lampiran').remove(rows.map((x) => x.path)); if (r.error && !/not found/i.test(r.error.message)) throw r.error; await sb.rpc('att_purged', { p_ids: rows.map((x) => x.id) }); }
      lampiran = { ok: true, dibersihkan: rows?.length || 0 };
    }
  } catch (e) { lampiran = { ok: false, error: e.message }; }
  const res = { ok: reminders.ok && onboarding.ok && summaries.ok && toko.ok && otomatisasi.ok && pembukuan.ok && lampiran.ok, reminders, onboarding, summaries, toko, otomatisasi, pembukuan, lampiran };
  console.log('[cron daily]', JSON.stringify(res));
  try { await adminDb()?.from('cron_runs').insert({ ok: res.ok, result: res }); } catch {} // untuk halaman Status sistem
  return Response.json(res, { status: res.ok ? 200 : 500 });
}
