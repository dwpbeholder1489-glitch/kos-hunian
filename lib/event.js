// Istilah & konstanta workspace Event (Master Prompt PRASARA Event, keputusan E1–E4).
// Status event dihitung server (prj_event_status): otomatis dari data + bisa diubah pemilik (prj_stage_set).

export const EV_ST = {
  draft: ['Draft', 'void'],
  penawaran: ['Penawaran', 'info'],
  menunggu: ['Menunggu Konfirmasi', 'gold'],
  terkonfirmasi: ['Terkonfirmasi', 'good'],
  persiapan: ['Persiapan', 'gold'],
  berlangsung: ['Berlangsung', 'info'],
  selesai: ['Selesai', 'void'],
  dibatalkan: ['Dibatalkan', 'bad'],
};
// Tahap yang bisa dipilih manual (Selesai/Dibatalkan lewat tombol status)
export const STAGE_PRE = ['draft', 'penawaran', 'menunggu'];
export const STAGE_POST = ['terkonfirmasi', 'persiapan', 'berlangsung'];

// Saran kategori event (bebas diketik; daftar kustom dengan tombol + menyusul di tahap kustomisasi)
export const EVENT_CATS = ['Wedding', 'Seminar', 'Konferensi', 'Konser', 'Festival', 'Event perusahaan', 'Pameran', 'Workshop', 'Pelatihan',
  'Kompetisi', 'Gathering', 'Ulang tahun', 'Private event', 'Lainnya'];

export const isEventBiz = (kos) => kos?.business_type === 'kustom' && kos?.category_code === 'event';
// Istilah: bisnis event menyebut proyek sebagai "event"
export const termOf = (kos) => (isEventBiz(kos)
  ? { one: 'event', One: 'Event', list: 'Event / Kegiatan', all: 'Semua event' }
  : { one: 'proyek', One: 'Proyek', list: 'Proyek', all: 'Semua proyek' });

const BLN = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
const HARI = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'];
// "Sab, 29 Nov 2026"
export const tglHari = (iso) => { if (!iso) return '—'; const d = new Date(iso + 'T12:00:00Z'); return `${HARI[d.getUTCDay()]}, ${d.getUTCDate()} ${BLN[d.getUTCMonth()]} ${d.getUTCFullYear()}`; };
export const bulanPendek = (iso) => { const d = new Date(iso + 'T12:00:00Z'); return BLN[d.getUTCMonth()]; };
export const bulanTahun = (iso) => { const d = new Date(iso + 'T12:00:00Z'); return `${['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'][d.getUTCMonth()]} ${d.getUTCFullYear()}`; };
export const addMonths = (iso, n) => { const d = new Date(iso.slice(0, 7) + '-01T12:00:00Z'); d.setUTCMonth(d.getUTCMonth() + n); return d.toISOString().slice(0, 10); };
export const addDays = (iso, n) => new Date(Date.parse(iso + 'T12:00:00Z') + n * 864e5).toISOString().slice(0, 10);
// Perubahan dibanding periode lalu: angka (selisih) atau persen
export const delta = (now, prev, mode = 'pct') => {
  const a = Number(now) || 0; const b = Number(prev) || 0;
  if (mode === 'abs') return { v: a - b, txt: `${a - b > 0 ? '+' : ''}${a - b}`, dir: Math.sign(a - b) };
  if (b === 0) return a === 0 ? { v: 0, txt: '0%', dir: 0 } : { v: null, txt: 'baru', dir: 1 };
  const p = Math.round(((a - b) / b) * 100);
  return { v: p, txt: `${p > 0 ? '+' : ''}${p}%`, dir: Math.sign(p) };
};
