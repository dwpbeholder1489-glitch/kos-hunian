// Bantuan bersama untuk mesin Jasa (laundry & jasa lain)
import { rp, angka } from '@/lib/format';

export const STATUS = {
  diterima: ['Diterima', 'info'],
  proses: ['Diproses', 'gold'],
  siap: ['Siap', 'good'],
  selesai: ['Selesai', ''],
  batal: ['Batal', 'void'],
};
export const COMPLAINT = { kurang_bersih: 'Kurang bersih / noda', rusak: 'Rusak', hilang: 'Hilang', luntur: 'Luntur', terlambat: 'Terlambat', lainnya: 'Lainnya' };
export const PAYM = { tunai: 'Tunai', transfer: 'Transfer', ewallet: 'E-wallet / QRIS' };

const tz = { timeZone: 'Asia/Jakarta' };
export const waktu = (ts) => (ts ? new Date(ts).toLocaleString('id-ID', { ...tz, day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—');
export const hari = (ts) => (ts ? new Date(ts).toLocaleDateString('id-ID', { ...tz, weekday: 'short', day: 'numeric', month: 'short' }) : '—');
export const jakartaDate = (ts) => new Date(ts).toLocaleDateString('en-CA', tz); // YYYY-MM-DD
// nilai untuk <input type="datetime-local"> dalam WIB
export const toLocalInput = (ts) => { const d = new Date(new Date(ts).getTime() + 7 * 3600e3); return d.toISOString().slice(0, 16); };
export const fromLocalInput = (v) => (v ? new Date(v + ':00+07:00').toISOString() : null);

export const sisa = (o) => Math.max(0, Number(o.total || 0) - Number(o.paid || 0));
export const waitPickup = (o) => o.status === 'diterima' && o.pickup && o.pickup_status !== 'dijemput';
export const onTheWay = (o) => o.status === 'siap' && o.deliver && o.delivery_status === 'dalam_pengantaran';
// Status yang dilihat orang: menyesuaikan pesanan (tanpa jemput tidak ada "menunggu penjemputan", dst.)
export const stageLabel = (o) => (waitPickup(o) ? 'Menunggu penjemputan' : onTheWay(o) ? 'Dalam pengantaran'
  : o.status === 'proses' ? o.stage_name || 'Diproses' : o.status === 'siap' ? (o.deliver ? 'Siap diantar' : 'Siap diambil') : STATUS[o.status]?.[0]);
export const PICKUP = { menunggu: 'Belum dijadwalkan', dijadwalkan: 'Dijadwalkan', dijemput: 'Sudah dijemput', gagal: 'Jemput gagal — jadwalkan ulang' };
export const DELIVERY = { menunggu: 'Belum dijadwalkan', dijadwalkan: 'Dijadwalkan', dalam_pengantaran: 'Dalam pengantaran', terkirim: 'Terkirim', gagal: 'Antar gagal — jadwalkan ulang' };
export const tgl2 = (d) => (d ? new Date(d + 'T00:00:00+07:00').toLocaleDateString('id-ID', { ...tz, weekday: 'short', day: 'numeric', month: 'short' }) : '');
export const mapsLink = (addr) => `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(addr || '')}`;
export const late = (o) => ['diterima', 'proses'].includes(o.status) && o.due_at && new Date(o.due_at) < new Date();
export const linesText = (lines) => (lines || []).map((l) => `${l.name} ${angka(l.qty)} ${l.unit}`).join(', ');

// Pesan WhatsApp siap kirim (dikirim manual oleh pemilik/kasir; tidak ada pengiriman otomatis)
export function waText(kind, o, bizName) {
  const s = sisa(o);
  const bayar = o.total != null ? (s > 0 ? `Total ${rp(o.total)}, sisa bayar ${rp(s)}.` : 'Sudah lunas.') : '';
  if (kind === 'terima') return `Halo ${o.customer_name}, pesanan ${o.number} di ${bizName} sudah kami terima: ${linesText(o.lines)}. Perkiraan selesai ${hari(o.due_at)}. ${bayar} Terima kasih.`;
  if (kind === 'siap') return o.deliver
    ? `Halo ${o.customer_name}, pesanan ${o.number} dari ${bizName} sudah siap dan akan kami antar${o.address ? ` ke ${o.address}` : ''}. ${bayar}`
    : `Halo ${o.customer_name}, pesanan ${o.number} di ${bizName} sudah siap diambil. ${bayar} Terima kasih.`;
  if (kind === 'tagih') return `Halo ${o.customer_name}, mengingatkan pembayaran pesanan ${o.number} di ${bizName} sebesar ${rp(s)}. Terima kasih.`;
  return `Halo ${o.customer_name}, ini dari ${bizName} tentang pesanan ${o.number}.`;
}
