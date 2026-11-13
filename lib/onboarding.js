// Email arahan untuk pemilik kos baru (berjalan di server lewat cron harian).
import { sendMail, mailConfigured } from '@/lib/mailer';
import { adminDb } from '@/lib/reminders';
import { nextEmail } from '@/lib/onboardingRules';
import { BUSINESS } from '@/lib/plan';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const BLN = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
const tglPlus = (days) => { const d = new Date(Date.now() + 7 * 3600e3 + days * 864e5); return `${d.getUTCDate()} ${BLN[d.getUTCMonth()]} ${d.getUTCFullYear()}`; };
const WA = `https://wa.me/${BUSINESS.whatsapp}?text=${encodeURIComponent('Halo tim PRASARA, saya butuh bantuan: ')}`;

// Isi setiap jenis email: [subjek, pembuka, langkah[], tombol, alamat tombol, penutup]
function content(kind, r) {
  const left = r.trial_left;
  switch (kind) {
    case 'h0': return [`Selamat datang di PRASARA, ${r.kos_name}`,
      'Terima kasih sudah mencoba PRASARA. Supaya pembukuan kos langsung berjalan, cukup lakukan empat langkah ini — masing-masing hanya beberapa menit:',
      ['Isi harga sewa setiap kamar (menu Kamar).', 'Masukkan penghuni yang sudah tinggal (Kamar → ketuk kamar kosong → Isi kamar ini).', 'Catat pembayaran saat uang masuk (menu Tagihan).', 'Catat pengeluaran kos (menu Pengeluaran).'],
      'Buka aplikasi', '/beranda',
      'Daftar "Mulai di sini" di Dashboard akan mencentang langkah ini otomatis.'];
    case 'kamar': return ['Langkah pertama: isi harga kamar (2 menit)',
      'Harga sewa kamar dipakai untuk membuat tagihan otomatis setiap bulan. Caranya:',
      ['Buka menu Kamar, ketuk salah satu kamar.', 'Ketuk Ubah data kamar.', 'Isi Harga sewa / bulan — boleh ditulis 750rb atau 750.000.', 'Tekan Simpan, lalu ulangi untuk kamar lain.'],
      'Isi harga kamar', '/kamar', null];
    case 'penghuni': return ['Masukkan penghuni pertama Anda',
      'Setelah penghuni dimasukkan, tagihan sewanya terbit sendiri setiap bulan. Caranya:',
      ['Buka menu Kamar, ketuk kamar berstatus Tersedia.', 'Ketuk Isi kamar ini, lalu isi nama, nomor WhatsApp, dan harga sewa.', 'Isi "Tagihan pertama jatuh tempo", lalu tekan Mulai sewa.'],
      'Masukkan penghuni', '/kamar',
      'Penghuni yang sudah lama tinggal: isi tagihan pertama dengan jatuh tempo berikutnya yang belum dibayar, supaya bulan yang sudah lunas tidak ikut ditagih.'];
    case 'bayar': return ['Cara mencatat pembayaran penghuni',
      'Penghuni Anda sudah tercatat. Saat mereka membayar, catat di aplikasi supaya status lunas dan laporan kas terhitung otomatis:',
      ['Buka menu Tagihan, ketuk tagihan penghuni.', 'Tekan Catat pembayaran.', 'Isi jumlah (boleh sebagian), tanggal, dan cara bayar, lalu Simpan.'],
      'Buka Tagihan', '/tagihan',
      'Untuk transfer atau QRIS, catat setelah uang benar-benar masuk ke rekening.'];
    case 'sapa': return ['Ada yang bisa kami bantu?',
      'Kami lihat belum ada catatan baru di PRASARA selama seminggu terakhir. Kalau ada yang membingungkan, beberapa jalan cepat:',
      ['Ketuk tombol ? di pojok kanan atas aplikasi untuk membuka Pusat bantuan.', 'Setiap menu punya tombol "? Panduan" berisi cara pakai singkat.', 'Atau balas email ini / kirim WhatsApp, kami bantu sampai bisa.'],
      'Buka Pusat bantuan', '/bantuan', null];
    case 'ringkasan': return ['Tiga fitur yang mungkin belum Anda coba',
      'Pembukuan kos Anda sudah berjalan. Beberapa fitur yang bisa menghemat waktu:',
      ['Daftar tagih setiap pagi ke email, lengkap dengan tombol Kirim WA per penghuni (Pengaturan → Info untuk penghuni).', 'Laporan laba rugi bulanan, ekspor Excel, dan PDF (menu Laporan).', 'Portal penghuni: penghuni melihat tagihan dan mengirim bukti transfer sendiri (paket Pro).'],
      'Buka Pengaturan', '/pengaturan', null];
    case 'coba5':
    case 'coba2': return [`Masa coba PRASARA berakhir ${left === 0 ? 'hari ini' : `${left} hari lagi`}`,
      `Masa coba semua fitur untuk ${r.kos_name} berakhir ${tglPlus(left)}. Berikut yang terjadi setelahnya:`,
      [`Akun otomatis menjadi paket Gratis (maksimal ${BUSINESS.freeRoomLimit} kamar terisi). Semua data tetap tersimpan, tidak ada yang dihapus.`, 'Jika ingin tetap memakai fitur paket berbayar, pilih paket di menu Langganan dan bayar lewat QRIS atau transfer.', 'Jika paket Gratis sudah cukup, Anda tidak perlu melakukan apa-apa.'],
      'Lihat paket', '/langganan', null];
    default: return null;
  }
}

function render(kind, r, origin) {
  const c = content(kind, r);
  if (!c) return null;
  const [subject, intro, steps, label, path, note] = c;
  const unsub = `${origin}/berhenti/${r.email_token}`;
  const text = `Halo,\n\n${intro}\n\n${steps.map((s, i) => `${i + 1}. ${s}`).join('\n')}\n${note ? `\n${note}\n` : ''}\n${label}: ${origin}${path}\n\nButuh bantuan? Balas email ini atau WhatsApp ${BUSINESS.whatsappDisplay}.\n\nSalam,\nTim PRASARA\n\nBerhenti terima email arahan: ${unsub}`;
  const html = `<div style="font-family:Arial,sans-serif;max-width:560px;color:#142B45">
  <div style="background:#142B45;color:#fff;padding:14px 18px;border-radius:12px 12px 0 0"><b style="font-size:17px">PRASARA</b><br><span style="opacity:.8;font-size:13px">${esc(r.kos_name)}</span></div>
  <div style="border:1px solid #DDE3EA;border-top:0;border-radius:0 0 12px 12px;padding:18px;font-size:15px;line-height:1.5">
    <p style="margin:0 0 10px">Halo,</p><p style="margin:0 0 10px">${esc(intro)}</p>
    <ol style="margin:0 0 12px;padding-left:20px">${steps.map((s) => `<li style="margin-bottom:6px">${esc(s)}</li>`).join('')}</ol>
    ${note ? `<p style="background:#EAF5F1;border-radius:8px;padding:10px 12px;margin:0 0 14px;font-size:14px">${esc(note)}</p>` : ''}
    <p style="margin:0 0 16px"><a href="${origin}${path}" style="display:inline-block;background:#16866A;color:#fff;text-decoration:none;font-weight:bold;padding:11px 18px;border-radius:10px">${esc(label)}</a></p>
    <p style="margin:0;font-size:14px">Butuh bantuan? Balas email ini atau <a href="${WA}" style="color:#16866A;font-weight:bold">WhatsApp ${BUSINESS.whatsappDisplay}</a>.</p>
    <p style="margin:14px 0 0">Salam,<br>Tim PRASARA</p>
    <p style="margin:18px 0 0;font-size:12px;color:#5B6B7C">Email arahan ini dikirim selama masa coba, hanya untuk langkah yang belum Anda kerjakan. <a href="${unsub}" style="color:#5B6B7C">Berhenti terima email arahan</a></p>
  </div></div>`;
  return { subject, text, html };
}

// Kirim paling banyak `limit` email arahan per jalan.
export async function runOnboarding({ origin, limit = 200 }) {
  const sb = adminDb();
  if (!sb) return { ok: false, error: 'SUPABASE_SECRET_KEY belum diisi' };
  if (!mailConfigured()) return { ok: false, error: 'SMTP_USER / SMTP_PASS belum diisi' };
  const { data, error } = await sb.rpc('onboarding_batch');
  if (error) return { ok: false, error: error.message };
  const out = { ok: true, sent: 0, byKind: {}, errors: [] };
  const owners = new Set(); // pemilik beberapa kos tetap menerima satu email per hari
  for (const r of data || []) {
    if (out.sent >= limit) break;
    const kind = nextEmail(r);
    if (!kind || !r.owner_email || owners.has(r.owner_email)) continue;
    owners.add(r.owner_email);
    const mail = render(kind, r, origin);
    if (!mail) continue;
    const ins = await sb.from('onboarding_email_log').insert({ kos_id: r.kos_id, kind }).select('kos_id');
    if (ins.error) continue; // sudah pernah dikirim
    try {
      await sendMail({ to: r.owner_email, ...mail });
      out.sent++; out.byKind[kind] = (out.byKind[kind] || 0) + 1;
    } catch (e) {
      out.errors.push(`${r.kos_name}: ${e.message}`);
      await sb.from('onboarding_email_log').delete().match({ kos_id: r.kos_id, kind });
    }
  }
  return out;
}

export { render as renderOnboarding };
