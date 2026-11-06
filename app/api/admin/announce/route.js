// Kirim email pengumuman (dipanggil staf dengan izin announce.manage). Batas per kiriman agar kuota email harian aman.
import { userDb, mailHtml } from '@/lib/serverAuth';
import { adminDb } from '@/lib/reminders';
import { sendMail, mailConfigured } from '@/lib/mailer';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;
const LIMIT = 250;

export async function POST(req) {
  const user = userDb(req);
  const { id } = await req.json().catch(() => ({}));
  if (!user || !id) return Response.json({ error: 'Permintaan tidak valid' }, { status: 400 });
  const { data: allowed } = await user.rpc('admin_can', { p_perm: 'announce.manage' });
  if (!allowed) return Response.json({ error: 'Tidak punya akses' }, { status: 403 });
  const sb = adminDb();
  if (!sb || !mailConfigured()) return Response.json({ error: 'Email belum dikonfigurasi di server' }, { status: 500 });
  const { data: a } = await sb.from('announcements').select('*').eq('id', id).maybeSingle();
  if (!a || !a.email) return Response.json({ error: 'Pengumuman tidak ditemukan atau tanpa email' }, { status: 404 });
  const { data: targets, error } = await sb.rpc('announcement_email_batch', { p_id: id });
  if (error) return Response.json({ error: error.message }, { status: 500 });
  const origin = process.env.APP_URL || new URL(req.url).origin;
  let sent = 0; const errors = [];
  for (const t of (targets || []).slice(0, LIMIT)) {
    const ins = await sb.from('announcement_sends').insert({ announcement_id: id, kos_id: t.kos_id }).select('kos_id');
    if (ins.error) continue;
    const footer = a.kind === 'info' ? `Berhenti terima email info dari PRASARA: <a href="${origin}/berhenti/${t.token}" style="color:#5B6B7C">klik di sini</a>` : 'Email layanan penting untuk semua pengguna terkait.';
    try {
      await sendMail({ to: t.email, fromName: 'PRASARA', subject: a.title, text: `${a.body}\n\n${t.kos_name}\n${origin}/beranda`,
        html: mailHtml({ title: a.title, sub: t.kos_name, paragraphs: [a.body], button: 'Buka PRASARA', href: `${origin}/bisnis`, footer }) });
      sent++;
    } catch (e) { errors.push(e.message); await sb.from('announcement_sends').delete().match({ announcement_id: id, kos_id: t.kos_id }); }
  }
  await sb.from('announcements').update({ email_sent_at: new Date().toISOString(), email_count: (a.email_count || 0) + sent }).eq('id', id);
  return Response.json({ ok: true, sent, remaining: Math.max(0, (targets || []).length - LIMIT), errors: errors.slice(0, 3) });
}
