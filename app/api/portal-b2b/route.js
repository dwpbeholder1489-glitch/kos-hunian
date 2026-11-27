// Portal pelanggan grosir (/c/[token]) → pesanan / batal. Ditulis HANYA lewat server (kunci rahasia) ke cportal_order / cportal_cancel;
// harga, batas & validasi dihitung di database. Pemilik diberi tahu lewat email bila Pengaturan › Kirim email aktif (kos.notify_email).
import { portalExchange } from '@/lib/customerExperience';
import { createClient } from '@supabase/supabase-js';
import { sendMail, mailConfigured } from '@/lib/mailer';

export const dynamic = 'force-dynamic';
const json = (b, s = 200) => Response.json(b, { status: s });
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const rp = (n) => 'Rp' + new Intl.NumberFormat('id-ID').format(Math.round(Number(n) || 0));
const str = (v, n) => String(v ?? '').slice(0, n);

export async function POST(req) {
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!key) return json({ ok: false, error: 'Layanan pemesanan belum dikonfigurasi.' }, 503);
  let b;
  try { b = await req.json(); } catch { return json({ ok: false, error: 'Permintaan tidak valid' }, 400); }
  const token = str(b.token, 80);
  if (token.length < 40) return json({ ok: false, error: 'Link tidak berlaku.' }, 400);
  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, key, { auth: { persistSession: false, autoRefreshToken: false } });

  if (b.action === 'conversation') {
    if (req.headers.get('sec-fetch-site') === 'cross-site') return json({ error: 'Permintaan tidak valid.' }, 400);
    const [data, status] = await portalExchange(sb, b, 'private', token);
    return Response.json(data, { status, headers: { 'Cache-Control': 'private, no-store' } });
  }
  if (b.action === 'cancel') {
    const { data, error } = await sb.rpc('cportal_cancel', { p_token: token, p_order: str(b.order_id, 40), p_reason: str(b.reason, 200) || null });
    if (error) { console.error('[portal-b2b] batal gagal', error.message); return json({ ok: false, error: 'Gagal membatalkan. Coba lagi nanti.' }, 500); }
    return json(data?.ok ? { ok: true } : { ok: false, error: data?.error || 'Gagal membatalkan' }, data?.ok ? 200 : 400);
  }

  const lines = Array.isArray(b.lines) ? b.lines.slice(0, 100).map((x) => ({ product_id: str(x.product_id, 40), unit: str(x.unit, 40), qty: Number(x.qty) || 0 })) : [];
  const { data, error } = await sb.rpc('cportal_order', {
    p_token: token,
    p: { id: str(b.id, 40), kind: b.kind === 'penawaran' ? 'penawaran' : 'pesanan', lines,
      need_date: /^\d{4}-\d{2}-\d{2}$/.test(String(b.need_date || '')) ? b.need_date : null,
      customer_ref: str(b.customer_ref, 60), ship_address: str(b.ship_address, 300), note: str(b.note, 500) },
  });
  if (error) { console.error('[portal-b2b] pesanan gagal', error.message); return json({ ok: false, error: 'Gagal mengirim pesanan. Coba lagi nanti.' }, 500); }
  if (!data?.ok) return json({ ok: false, error: data?.error || 'Gagal mengirim' }, 400);
  if (!data.duplicate) {
    try {
      if (mailConfigured()) {
        const { data: kos } = await sb.from('kos').select('name, owner_id, notify_email').eq('id', data.kos_id).single();
        const { data: owner } = kos && kos.notify_email !== false ? await sb.auth.admin.getUserById(kos.owner_id) : { data: null };
        const to = owner?.user?.email;
        if (to) {
          const link = `${new URL(req.url).origin}/grosir?tab=penawaran`;
          const what = data.kind === 'penawaran' ? 'Permintaan penawaran' : 'Pesanan';
          await sendMail({ to, subject: `${what} ${data.number} dari ${data.customer} lewat portal — ${kos.name}`,
            text: `${what} baru ${data.number} dari ${data.customer} lewat portal pelanggan ${kos.name}.\nTotal sementara: ${rp(data.total)}\n\nBuka ${link}: periksa stok & batas kredit, lalu konfirmasi jadi pesanan.`,
            html: `<div style="font-family:Arial,sans-serif;max-width:520px;color:#14251F"><p>${esc(what)} baru <b>${esc(data.number)}</b> dari <b>${esc(data.customer)}</b> lewat portal pelanggan <b>${esc(kos.name)}</b>.</p><p>Total sementara: <b>${esc(rp(data.total))}</b> (harga sesuai daftar harga pelanggan).</p><p><a href="${link}" style="display:inline-block;background:#15803D;color:#FFFFFF;text-decoration:none;font-weight:bold;padding:12px 18px;border-radius:10px">Periksa & konfirmasi</a></p><p style="font-size:12px;color:#64746D">Email ini dikirim otomatis oleh PRASARA. Matikan di Pengaturan.</p></div>` });
        }
      }
    } catch (e) { console.error('[portal-b2b] email gagal', e); }
  }
  return json({ ok: true, number: data.number, total: data.total, id: data.id });
}
