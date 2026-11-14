// Kiriman formulir halaman bisnis publik → fungsi database public_submit (kunci rahasia, hanya dari server).
// Pembatasan per perangkat memakai hash alamat IP (IP asli tidak disimpan). Pemilik diberi tahu lewat email bila diaktifkan.
import { createHash } from 'crypto';
import { createClient } from '@supabase/supabase-js';
import { sendMail, mailConfigured } from '@/lib/mailer';

export const dynamic = 'force-dynamic';
const json = (b, s = 200) => Response.json(b, { status: s });
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// Cara bayar di halaman bisnis (semua jenis) — hanya bila pemilik mengizinkan (Halaman bisnis/Pengaturan › Tampilkan rekening/QRIS)
export async function GET(req) {
  const slug = (new URL(req.url).searchParams.get('pay') || '').slice(0, 40);
  if (!slug) return json({ pay: null });
  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
  const { data } = await sb.rpc('public_pay_info', { p_slug: slug });
  return json({ pay: data || null });
}

export async function POST(req) {
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!key) return json({ ok: false, error: 'Layanan formulir belum dikonfigurasi.' }, 503);
  let b;
  try { b = await req.json(); } catch { return json({ ok: false, error: 'Permintaan tidak valid' }, 400); }
  if (b.website) return json({ ok: true, number: null }); // jebakan bot: pura-pura berhasil
  const ip = (req.headers.get('x-forwarded-for') || '').split(',')[0].trim() || req.headers.get('x-real-ip') || 'tanpa-ip';
  const ipHash = createHash('sha256').update(ip + '|' + key.slice(-16)).digest('hex').slice(0, 32);
  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, key, { auth: { persistSession: false, autoRefreshToken: false } });
  // Pendaftaran calon penghuni (kos): data diri + kamar + booking/langsung huni + DP/lunas → Prospek, dikonfirmasi pemilik
  if (b.apply) {
    const str = (v, n) => String(v ?? '').slice(0, n);
    const proof = typeof b.proof === 'string' && b.proof.startsWith('data:image/') && b.proof.length <= 1500000 ? b.proof : null;
    const { data, error } = await sb.rpc('public_apply', {
      p_slug: str(b.slug, 40), p_ip_hash: ipHash, p_elapsed: Math.min(Number(b.elapsed) || 0, 100000),
      p: { name: str(b.name, 80), phone: str(b.phone, 20), address: str(b.address, 300), emergency_name: str(b.emergency_name, 80), emergency_rel: str(b.emergency_rel, 40),
        emergency_phone: str(b.emergency_phone, 20), room_id: str(b.room_id, 40), mode: str(b.mode, 10), date: str(b.date, 10), pay_plan: str(b.pay_plan, 10),
        pay_amount: str(b.pay_amount, 15), pay_method: str(b.pay_method, 10), note: str(b.note, 300), proof, consent: b.consent === true },
    });
    if (error) { console.error('[publik] pendaftaran gagal', error.message); return json({ ok: false, error: 'Gagal menyimpan pendaftaran. Coba lagi nanti.' }, 500); }
    if (!data?.ok) return json({ ok: false, error: data?.error || 'Gagal mengirim' }, 400);
    if (!data.duplicate) {
      try {
        if (mailConfigured()) {
          const [{ data: kos }, { data: pg }] = await Promise.all([
            sb.from('kos').select('name, owner_id').eq('id', data.kos_id).single(),
            sb.from('public_pages').select('email_notify').eq('kos_id', data.kos_id).single(),
          ]);
          const { data: owner } = pg?.email_notify ? await sb.auth.admin.getUserById(kos.owner_id) : { data: null };
          const to = owner?.user?.email;
          if (to) {
            const link = `${new URL(req.url).origin}/crm`;
            const what = `${data.mode === 'huni' ? 'Langsung huni' : 'Booking'} kamar ${data.room} mulai ${b.date}`;
            await sendMail({ to, subject: `Pendaftaran penghuni ${data.number} — ${kos.name}`,
              text: `Pendaftaran baru ${data.number} di ${kos.name}.\nNama: ${b.name}\nWhatsApp: ${b.phone}\n${what}\nPembayaran: ${b.pay_plan === 'lunas' ? 'lunas' : 'DP'} Rp${Number(data.amount || 0).toLocaleString('id-ID')} (${b.pay_method})${proof ? ', ada bukti transfer' : ''}\n\nBuka ${link} (Calon penghuni), cek pembayaran, lalu Konfirmasi.`,
              html: `<div style="font-family:Arial,sans-serif;max-width:520px;color:#1A1D21"><p>Pendaftaran baru <b>${esc(data.number)}</b> di <b>${esc(kos.name)}</b>.</p><p>Nama: <b>${esc(b.name)}</b><br>WhatsApp: <b>${esc(b.phone)}</b><br>${esc(what)}<br>Pembayaran: ${b.pay_plan === 'lunas' ? 'lunas' : 'DP'} Rp${esc(Number(data.amount || 0).toLocaleString('id-ID'))} (${esc(b.pay_method)})${proof ? ', ada bukti transfer' : ''}</p><p><a href="${link}" style="display:inline-block;background:#B88A2E;color:#1D2A21;text-decoration:none;font-weight:bold;padding:12px 18px;border-radius:10px">Cek & konfirmasi</a></p><p style="font-size:12px;color:#5A675F">Email ini dikirim otomatis oleh PRASARA. Matikan di menu Halaman bisnis.</p></div>` });
          }
        }
      } catch (e) { console.error('[publik] email gagal', e); }
    }
    return json({ ok: true, number: data.number });
  }
  // Reservasi meja (kuliner): masuk sebagai permintaan, dikonfirmasi kasir lewat WhatsApp
  if (b.reserve) {
    const str = (v, n) => String(v ?? '').slice(0, n);
    const { data, error } = await sb.rpc('public_resv_create', {
      p_slug: str(b.slug, 40), p_ip_hash: ipHash, p_elapsed: Math.min(Number(b.elapsed) || 0, 100000),
      p: { name: str(b.name, 80), phone: str(b.phone, 20), note: str(b.note, 300), consent: b.consent === true, party: str(b.party, 4), starts_at: str(b.starts_at, 40) },
    });
    if (error) { console.error('[publik] reservasi gagal', error.message); return json({ ok: false, error: 'Gagal menyimpan reservasi. Coba lagi nanti.' }, 500); }
    if (!data?.ok) return json({ ok: false, error: data?.error || 'Gagal mengirim' }, 400);
    try {
      if (mailConfigured()) {
        const [{ data: kos }, { data: pg }] = await Promise.all([
          sb.from('kos').select('name, owner_id').eq('id', data.kos_id).single(),
          sb.from('public_pages').select('email_notify').eq('kos_id', data.kos_id).single(),
        ]);
        const { data: owner } = pg?.email_notify ? await sb.auth.admin.getUserById(kos.owner_id) : { data: null };
        const to = owner?.user?.email;
        if (to) {
          const link = `${new URL(req.url).origin}/meja?tab=reservasi`;
          const when = new Date(data.starts_at).toLocaleString('id-ID', { timeZone: 'Asia/Jakarta', weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' });
          await sendMail({ to, subject: `Permintaan reservasi ${data.number} — ${kos.name}`,
            text: `Permintaan reservasi ${data.number} di ${kos.name}.\nNama: ${b.name}\nWhatsApp: ${b.phone}\nWaktu: ${when}\nJumlah orang: ${data.party}\nCatatan: ${b.note || '-'}\n\nBuka ${link} lalu Konfirmasi atau Tolak.`,
            html: `<div style="font-family:Arial,sans-serif;max-width:520px;color:#1A1D21"><p>Permintaan reservasi <b>${esc(data.number)}</b> di <b>${esc(kos.name)}</b>.</p><p>Nama: <b>${esc(b.name)}</b><br>WhatsApp: <b>${esc(b.phone)}</b><br>Waktu: <b>${esc(when)}</b><br>Jumlah orang: <b>${esc(data.party)}</b><br>Catatan: ${esc(b.note || '-')}</p><p><a href="${link}" style="display:inline-block;background:#B88A2E;color:#1D2A21;text-decoration:none;font-weight:bold;padding:12px 18px;border-radius:10px">Konfirmasi reservasi</a></p><p style="font-size:12px;color:#5A675F">Email ini dikirim otomatis oleh PRASARA. Matikan di menu Halaman bisnis.</p></div>` });
        }
      }
    } catch (e) { console.error('[publik] email gagal', e); }
    return json({ ok: true, number: data.number });
  }
  // Pesanan langsung (bisnis jasa): masuk sebagai "Permintaan masuk" sampai dikonfirmasi pemilik
  if (b.order) {
    const str = (v, n) => String(v ?? '').slice(0, n);
    const lines = Array.isArray(b.lines) ? b.lines.slice(0, 10).map((x) => ({ service_id: str(x.service_id, 40), qty: Number(x.qty) || 0, note: str(x.note, 120) })) : [];
    const mejaNo = /^\d{1,3}$/.test(String(b.table_no || '')) ? String(b.table_no) : null;
    const dt = (v) => (/^\d{4}-\d{2}-\d{2}$/.test(String(v || '')) ? v : null);
    const { data, error } = await sb.rpc('public_order_create', {
      p_slug: str(b.slug, 40), p_ip_hash: ipHash, p_elapsed: Math.min(Number(b.elapsed) || 0, 100000),
      p: { name: str(b.name, 80), phone: str(b.phone, 20), note: str(b.note, 300), consent: b.consent === true, lines, table_no: mejaNo, pickup: b.pickup === true, deliver: b.deliver === true,
        address: str(b.address, 200), zone_id: b.zone_id ? str(b.zone_id, 40) : null, pickup_date: dt(b.pickup_date), pickup_slot: str(b.pickup_slot, 40), delivery_date: dt(b.delivery_date), delivery_slot: str(b.delivery_slot, 40) },
    });
    if (error) { console.error('[publik] pesanan gagal', error.message); return json({ ok: false, error: 'Gagal menyimpan pesanan. Coba lagi nanti.' }, 500); }
    if (!data?.ok) return json({ ok: false, error: data?.error || 'Gagal mengirim' }, 400);
    try {
      if (mailConfigured() && !mejaNo) { // pesanan dari QR meja tidak dikirim email (terlalu sering; cukup di layar Pesanan)
        const [{ data: kos }, { data: pg }] = await Promise.all([
          sb.from('kos').select('name, owner_id').eq('id', data.kos_id).single(),
          sb.from('public_pages').select('email_notify').eq('kos_id', data.kos_id).single(),
        ]);
        const { data: owner } = pg?.email_notify ? await sb.auth.admin.getUserById(kos.owner_id) : { data: null };
        const to = owner?.user?.email;
        if (to) {
          const link = `${new URL(req.url).origin}/pesanan`;
          await sendMail({ to, subject: `Pesanan baru ${data.number} dari halaman ${kos.name} — perlu konfirmasi`,
            text: `Pesanan baru ${data.number} dari halaman bisnis ${kos.name}.\nNama: ${b.name}\nWhatsApp: ${b.phone}\n${b.pickup ? 'Minta dijemput.\n' : ''}Catatan: ${b.note || '-'}\n\nBuka ${link} lalu Konfirmasi atau Tolak.`,
            html: `<div style="font-family:Arial,sans-serif;max-width:520px;color:#1A1D21"><p>Pesanan baru <b>${esc(data.number)}</b> dari halaman bisnis <b>${esc(kos.name)}</b>.</p><p>Nama: <b>${esc(b.name)}</b><br>WhatsApp: <b>${esc(b.phone)}</b>${b.pickup ? '<br>Minta dijemput' : ''}${b.deliver ? '<br>Minta diantar' : ''}<br>Catatan: ${esc(b.note || '-')}</p><p><a href="${link}" style="display:inline-block;background:#B88A2E;color:#1D2A21;text-decoration:none;font-weight:bold;padding:12px 18px;border-radius:10px">Konfirmasi pesanan</a></p><p style="font-size:12px;color:#5A675F">Email ini dikirim otomatis oleh PRASARA. Matikan di menu Halaman bisnis.</p></div>` });
        }
      }
    } catch (e) { console.error('[publik] email gagal', e); }
    return json({ ok: true, number: data.number, total: data.total });
  }
  const items = Array.isArray(b.items) ? b.items.slice(0, 30).map((x) => ({ id: String(x.id || ''), unit: String(x.unit || ''), qty: Number(x.qty) || 0 })) : [];
  const { data, error } = await sb.rpc('public_submit', {
    p_slug: String(b.slug || '').slice(0, 40), p_name: String(b.name || '').slice(0, 80), p_phone: String(b.phone || '').slice(0, 20),
    p_message: String(b.message || '').slice(0, 500), p_items: items, p_consent: b.consent === true, p_ip_hash: ipHash, p_elapsed: Math.min(Number(b.elapsed) || 0, 100000),
  });
  if (error) { console.error('[publik] gagal', error.message); return json({ ok: false, error: 'Gagal menyimpan. Coba lagi nanti.' }, 500); }
  if (!data?.ok) return json({ ok: false, error: data?.error || 'Gagal mengirim' }, 400);
  // tanggal yang diminta (mulai sewa / jemput) — dipakai cek otomatis & konfirmasi satu ketukan di Prospek
  if (data.lead_id && /^\d{4}-\d{2}-\d{2}$/.test(String(b.date || ''))) { try { await sb.rpc('lead_set_req', { p_lead: data.lead_id, p_date: b.date }); } catch {} }
  if (!data.duplicate) {
    try {
      if (mailConfigured()) {
        const [{ data: kos }, { data: pg }] = await Promise.all([
          sb.from('kos').select('name, owner_id').eq('id', data.kos_id).single(),
          sb.from('public_pages').select('email_notify').eq('kos_id', data.kos_id).single(),
        ]);
        const { data: owner } = pg?.email_notify ? await sb.auth.admin.getUserById(kos.owner_id) : { data: null };
        const to = owner?.user?.email;
        if (to) {
          const link = `${new URL(req.url).origin}/crm`;
          await sendMail({ to, subject: `Permintaan baru ${data.number} dari halaman ${kos.name}`,
            text: `Ada permintaan baru dari halaman bisnis ${kos.name}.\nNama: ${b.name}\nWhatsApp: ${b.phone}\nPesan: ${b.message || '-'}\n\nBuka ${link} (Prospek): sistem sudah mengecek ketersediaan & harga — tinggal tekan Konfirmasi bila cocok.`,
            html: `<div style="font-family:Arial,sans-serif;max-width:520px;color:#1A1D21"><p>Ada permintaan baru <b>${esc(data.number)}</b> dari halaman bisnis <b>${esc(kos.name)}</b>.</p><p>Nama: <b>${esc(b.name)}</b><br>WhatsApp: <b>${esc(b.phone)}</b><br>Pesan: ${esc(b.message || '-')}${items.length ? `<br>Barang/kamar dipilih: ${items.length}` : ''}</p><p><a href="${link}" style="display:inline-block;background:#B88A2E;color:#1D2A21;text-decoration:none;font-weight:bold;padding:12px 18px;border-radius:10px">Cek & konfirmasi</a></p><p style="font-size:13px;color:#5A675F">Sistem sudah mengecek ketersediaan & harga. Bila cocok, tinggal tekan Konfirmasi.</p><p style="font-size:12px;color:#5A675F">Email ini dikirim otomatis oleh PRASARA. Matikan di menu Halaman bisnis.</p></div>` });
        }
      }
    } catch (e) { console.error('[publik] email gagal', e); }
  }
  return json({ ok: true, number: data.number });
}
