// Penghuni mengirim konfirmasi pembayaran dari portal → simpan → email ke pemilik kos.
import { createClient } from '@supabase/supabase-js';
import { sendMail, mailConfigured } from '@/lib/mailer';

export const dynamic = 'force-dynamic';

const URL_ = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anon = () => createClient(URL_, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
const admin = () => process.env.SUPABASE_SECRET_KEY ? createClient(URL_, process.env.SUPABASE_SECRET_KEY, { auth: { persistSession: false, autoRefreshToken: false } }) : null;
const json = (b, s = 200) => Response.json(b, { status: s });
const fmt = new Intl.NumberFormat('id-ID');
const rp = (n) => 'Rp' + fmt.format(Math.round(Number(n) || 0));
const BLN = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
const tgl = (k) => { const [y, m, d] = String(k).split('-'); return `${+d} ${BLN[+m - 1]} ${y}`; };
const METHOD = { transfer: 'Transfer bank', ewallet: 'E-wallet / QRIS', tunai: 'Tunai', lainnya: 'Lainnya' };
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

async function notifyOwner(paymentId, origin) {
  const sb = admin();
  if (!sb || !mailConfigured()) return 'off';
  const { data: pay } = await sb.from('payments').select('id, amount, paid_at, method, notes, kos_id, invoice_id').eq('id', paymentId).single();
  if (!pay) return 'no-payment';
  const [{ data: inv }, { data: kos }, { data: proof }] = await Promise.all([
    sb.from('invoices').select('kind, description, period_start, period_end, occupant_id, room_id').eq('id', pay.invoice_id).single(),
    sb.from('kos').select('name, owner_id, notify_email').eq('id', pay.kos_id).single(),
    sb.from('payment_proofs').select('image').eq('payment_id', pay.id).maybeSingle(),
  ]);
  if (!kos?.notify_email) return 'disabled';
  const [{ data: occ }, { data: room }, { data: owner }] = await Promise.all([
    sb.from('occupants').select('name').eq('id', inv.occupant_id).single(),
    sb.from('rooms').select('code').eq('id', inv.room_id).single(),
    sb.auth.admin.getUserById(kos.owner_id),
  ]);
  const to = owner?.user?.email;
  if (!to) return 'no-email';

  const what = inv.kind === 'sewa' ? `Sewa ${tgl(inv.period_start)} – ${tgl(inv.period_end)}` : (inv.description || 'Tagihan tambahan');
  const link = `${origin}/pembayaran`;
  const attachments = [];
  if (proof?.image?.startsWith('data:image/')) {
    const [, mime, b64] = proof.image.match(/^data:(image\/[a-z]+);base64,(.*)$/) || [];
    if (b64) attachments.push({ filename: `bukti-${room?.code || 'kamar'}-${pay.paid_at}.jpg`, content: b64, encoding: 'base64', contentType: mime, cid: 'bukti' });
  }
  const rows = [['Penghuni', occ?.name], ['Kamar', room?.code], ['Untuk', what], ['Jumlah', rp(pay.amount)], ['Tanggal bayar', tgl(pay.paid_at)], ['Metode', METHOD[pay.method] || pay.method], ...(pay.notes ? [['Catatan', pay.notes]] : [])];

  await sendMail({
    to,
    subject: `Bukti transfer ${rp(pay.amount)} dari ${occ?.name || 'penghuni'} (${room?.code || ''}) · ${kos.name}`,
    text: `Ada konfirmasi pembayaran baru di ${kos.name}.\n\n${rows.map(([k, v]) => `${k}: ${v}`).join('\n')}\n\nCocokkan dengan mutasi rekening Anda, lalu buka ${link} dan tekan "Uang sudah masuk" atau "Tolak".`,
    html: `<div style="font-family:Arial,sans-serif;max-width:520px;color:#17261F">
      <div style="background:#1D4A37;color:#F7F5EE;padding:14px 18px;border-radius:12px 12px 0 0"><b style="font-size:18px">${esc(kos.name)}</b><br><span style="opacity:.8;font-size:13px">Konfirmasi pembayaran dari portal penghuni</span></div>
      <div style="border:1px solid #DEDACB;border-top:0;border-radius:0 0 12px 12px;padding:18px">
        <p style="margin:0 0 12px">Ada bukti transfer baru yang perlu Anda periksa:</p>
        <table style="width:100%;border-collapse:collapse;font-size:14px">${rows.map(([k, v]) => `<tr><td style="padding:6px 0;color:#5A675F">${esc(k)}</td><td style="padding:6px 0;text-align:right;font-weight:bold">${esc(v)}</td></tr>`).join('')}</table>
        ${attachments.length ? '<p style="margin:16px 0 6px;font-size:13px;color:#5A675F">Foto bukti:</p><img src="cid:bukti" style="max-width:100%;border:1px solid #DEDACB;border-radius:8px">' : '<p style="margin:16px 0 0;font-size:13px;color:#8A5A00">Penghuni tidak melampirkan foto bukti.</p>'}
        <p style="margin:18px 0 8px;font-size:14px">Cocokkan dengan mutasi rekening, lalu verifikasi di aplikasi:</p>
        <a href="${link}" style="display:inline-block;background:#B88A2E;color:#1D2A21;text-decoration:none;font-weight:bold;padding:12px 18px;border-radius:10px">Buka menu Pembayaran</a>
        <p style="margin:18px 0 0;font-size:12px;color:#5A675F">Email ini dikirim otomatis oleh PRASARA. Matikan di Pengaturan › Info untuk penghuni.</p>
      </div></div>`,
    attachments,
  });
  return 'sent';
}

export async function POST(req) {
  let b;
  try { b = await req.json(); } catch { return json({ error: 'Permintaan tidak valid' }, 400); }
  const { data, error } = await anon().rpc('portal_submit_payment', {
    p_token: String(b.token || ''), p_invoice: b.invoice, p_amount: Number(b.amount), p_paid_at: b.paid_at,
    p_method: b.method, p_note: b.note || null, p_proof: b.proof || null,
  });
  if (error) return json({ error: error.message }, 400);
  let email = 'off';
  try { email = await notifyOwner(data, new URL(req.url).origin); } catch (e) { console.error('[portal-pay] email gagal', e); email = 'error'; }
  return json({ ok: true, email });
}
