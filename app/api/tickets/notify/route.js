// Email pemberitahuan tiket: tiket baru → kotak masuk admin; balasan staf → pemilik bisnis.
import { userDb, mailHtml } from '@/lib/serverAuth';
import { adminDb } from '@/lib/reminders';
import { sendMail, mailConfigured } from '@/lib/mailer';

export const dynamic = 'force-dynamic';

export async function POST(req) {
  const user = userDb(req);
  const { ticketId, event } = await req.json().catch(() => ({}));
  if (!user || !ticketId || !['created', 'staff_reply'].includes(event)) return Response.json({ error: 'Permintaan tidak valid' }, { status: 400 });
  const sb = adminDb();
  if (!sb || !mailConfigured()) return Response.json({ ok: false, skipped: 'email belum dikonfigurasi' });
  const { data: t } = await sb.from('support_tickets').select('id,number,subject,kos_id,category').eq('id', ticketId).maybeSingle();
  if (!t) return Response.json({ error: 'Tiket tidak ditemukan' }, { status: 404 });
  const origin = process.env.APP_URL || new URL(req.url).origin;
  const { data: kos } = await sb.from('kos').select('name,owner_id').eq('id', t.kos_id).maybeSingle();
  const { data: msgs } = await sb.from('ticket_messages').select('author_kind,body').eq('ticket_id', t.id).order('created_at', { ascending: false }).limit(5);

  if (event === 'created') {
    const { data: member } = await user.rpc('is_member', { p_kos: t.kos_id });
    if (!member) return Response.json({ error: 'Tidak punya akses' }, { status: 403 });
    const body = (msgs || []).find((m) => m.author_kind === 'customer')?.body || '';
    await sendMail({ to: process.env.SMTP_USER, subject: `Tiket baru ${t.number}: ${t.subject}`, text: `${kos?.name}\n\n${body}\n\nBuka: ${origin}/admin/tiket/${t.id}`,
      html: mailHtml({ title: `Tiket baru ${t.number}`, sub: kos?.name, paragraphs: [t.subject, body], button: 'Buka tiket', href: `${origin}/admin/tiket/${t.id}` }) });
    return Response.json({ ok: true });
  }
  const { data: allowed } = await user.rpc('admin_can', { p_perm: 'tickets.reply' });
  if (!allowed) return Response.json({ error: 'Tidak punya akses' }, { status: 403 });
  const { data: owner } = await sb.auth.admin.getUserById(kos.owner_id);
  const reply = (msgs || []).find((m) => m.author_kind === 'staff')?.body || '';
  if (!owner?.user?.email || !reply) return Response.json({ ok: false });
  await sendMail({ to: owner.user.email, fromName: 'PRASARA Bantuan', subject: `Balasan untuk tiket ${t.number}: ${t.subject}`,
    text: `${reply}\n\nLihat & balas: ${origin}/bantuan`,
    html: mailHtml({ title: `Balasan tiket ${t.number}`, sub: kos?.name, paragraphs: [reply], button: 'Lihat & balas', href: `${origin}/bantuan`, footer: 'Balas lewat aplikasi agar riwayat percakapan tetap tersimpan.' }) });
  return Response.json({ ok: true });
}
