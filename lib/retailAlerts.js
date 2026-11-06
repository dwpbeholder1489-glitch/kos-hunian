// Email pagi pengingat toko (stok, pesanan, kasbon, utang). Dipanggil jadwal otomatis harian.
import { adminDb } from '@/lib/reminders';
import { sendMail, mailConfigured } from '@/lib/mailer';
import { mailHtml } from '@/lib/serverAuth';

const rp = (n) => 'Rp ' + new Intl.NumberFormat('id-ID').format(Math.round(Number(n) || 0));
const num = (n) => new Intl.NumberFormat('id-ID').format(Number(n) || 0);

export function retailAlertLines(a) {
  const out = [];
  if (a.habis.length) out.push(`Stok habis (${a.habis.length}): ` + a.habis.slice(0, 15).map((p) => p.name).join(', '));
  if (a.menipis.length) out.push(`Stok menipis (${a.menipis.length}): ` + a.menipis.slice(0, 15).map((p) => `${p.name} ${num(p.stock)} ${p.unit}`).join(', '));
  if (a.pesanan.length) out.push(`Pesanan belum datang (${a.pesanan.length}): ` + a.pesanan.map((b) => `${b.number}${b.supplier ? ' ' + b.supplier : ''}`).join(', '));
  if (a.kasbon.length) out.push(`Kasbon jatuh tempo (${a.kasbon.length}): ` + a.kasbon.slice(0, 15).map((c) => `${c.name} ${rp(c.sisa)}`).join(', '));
  if (a.utang.length) out.push(`Utang supplier jatuh tempo (${a.utang.length}): ` + a.utang.map((c) => `${c.name} ${rp(c.sisa)}`).join(', '));
  return out;
}

export async function runRetailAlerts({ origin }) {
  const sb = adminDb();
  if (!sb || !mailConfigured()) return { ok: true, skipped: 'belum dikonfigurasi' };
  const { data, error } = await sb.rpc('retail_alert_batch');
  if (error) return { ok: false, error: error.message };
  const today = new Date(Date.now() + 7 * 3600e3).toISOString().slice(0, 10);
  const out = { ok: true, sent: 0, errors: [] };
  for (const r of data || []) {
    const ins = await sb.from('digest_log').insert({ kos_id: r.kos_id, day: today }).select('kos_id');
    if (ins.error) continue;
    const lines = retailAlertLines(r.alerts);
    try {
      await sendMail({ to: r.owner_email, fromName: 'PRASARA', subject: `Pengingat toko hari ini · ${r.kos_name}`,
        text: lines.join('\n') + `\n\nBuka ${origin}/pengingat`,
        html: mailHtml({ title: 'Pengingat toko hari ini', sub: r.kos_name, paragraphs: lines, button: 'Buka pengingat', href: `${origin}/pengingat`,
          footer: 'Matikan email ini di menu Pengingat (lonceng) › Kirim pengingat setiap pagi.' }) });
      out.sent++;
    } catch (e) { out.errors.push(`${r.kos_name}: ${e.message}`); await sb.from('digest_log').delete().match({ kos_id: r.kos_id, day: today }); }
  }
  out.ok = out.errors.length === 0;
  return out;
}
