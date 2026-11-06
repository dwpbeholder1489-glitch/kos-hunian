// Jadwal harian Automation Engine: jalankan aturan aktif, lalu kirim email pemberitahuan yang diminta resepnya.
import { adminDb } from '@/lib/reminders';
import { sendMail, mailConfigured } from '@/lib/mailer';
import { mailHtml } from '@/lib/serverAuth';

const rp = (n) => 'Rp ' + new Intl.NumberFormat('id-ID').format(Math.round(Number(n) || 0));
const line = (it) => [it.nama || it.name || it.penghuni || '', it.kamar ? `(${it.kamar})` : '', it.sisa != null ? rp(it.sisa) : '', it.due || it.jatuh_tempo ? `jatuh tempo ${it.due || it.jatuh_tempo}` : '']
  .filter(Boolean).join(' ');

export async function runAutomations({ origin }) {
  const sb = adminDb();
  if (!sb) return { ok: true, skipped: 'belum dikonfigurasi' };
  const tick = await sb.rpc('automation_tick');
  if (tick.error) return { ok: false, error: tick.error.message };
  const out = { ok: true, ...tick.data, email: 0, errors: [] };
  if (!mailConfigured()) return out;
  const { data: queue, error } = await sb.rpc('automation_email_queue');
  if (error) return { ...out, ok: false, error: error.message };
  for (const n of queue || []) {
    const items = Array.isArray(n.items) ? n.items.slice(0, 20).map(line) : [];
    try {
      await sendMail({ to: n.email_to, fromName: 'PRASARA', subject: `${n.title} · ${n.kos_name}`,
        text: [n.body, ...items, `Buka ${origin}${n.href || '/otomatisasi'}`].filter(Boolean).join('\n'),
        html: mailHtml({ title: n.title, sub: n.kos_name, paragraphs: [n.body, ...items].filter(Boolean), button: 'Buka aplikasi', href: `${origin}${n.href || '/otomatisasi'}`,
          footer: 'Email dari otomatisasi yang Anda nyalakan. Matikan di menu Otomatisasi.' }) });
      await sb.rpc('automation_email_done', { p_id: n.id });
      out.email++;
    } catch (e) { out.errors.push(`${n.kos_name}: ${e.message}`); }
  }
  out.ok = out.errors.length === 0 && !(tick.data?.gagal > 0);
  return out;
}
