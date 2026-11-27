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

// ---- Rundown (Tahap B) ----
export const RD_ST = {
  rencana: ['Rencana', 'void'], siap: ['Siap', 'info'], berjalan: ['Berjalan', 'gold'], selesai: ['Selesai', 'good'], dilewati: ['Dilewati', 'bad'],
};
// "08:30" + 45 menit → "09:15" (lewat tengah malam berputar)
export const jamTambah = (hhmm, min) => { const [h, m] = hhmm.split(':').map(Number); const t = (((h * 60 + m + min) % 1440) + 1440) % 1440; return `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`; };
export const durasiTeks = (min) => (min == null ? '' : min < 60 ? `${min} mnt` : `${Math.floor(min / 60)} j${min % 60 ? ` ${min % 60} mnt` : ''}`);
// Kerangka rundown per jenis event (Master Prompt §14): [menit dari jam mulai, durasi, kegiatan]. Hanya KERANGKA — pemilik
// memilih sendiri lalu menyesuaikan; tidak pernah diisi otomatis.
export const RUNDOWN_TPL = {
  wedding: { name: 'Pernikahan (akad & resepsi)', items: [[-120, 90, 'Persiapan & make up pengantin'], [-30, 30, 'Tamu & keluarga hadir'], [0, 60, 'Akad nikah'], [60, 30, 'Sesi foto keluarga'], [90, 30, 'Persiapan resepsi'], [120, 15, 'Kirab / masuk pengantin'], [135, 15, 'Sambutan keluarga'], [150, 90, 'Resepsi & makan bersama'], [240, 30, 'Foto bersama tamu'], [270, 60, 'Penutupan & bongkar']] },
  seminar: { name: 'Seminar / konferensi', items: [[-60, 60, 'Registrasi peserta'], [0, 15, 'Pembukaan oleh MC'], [15, 15, 'Sambutan'], [30, 60, 'Sesi materi 1'], [90, 15, 'Rehat kopi'], [105, 60, 'Sesi materi 2'], [165, 30, 'Tanya jawab'], [195, 60, 'Ishoma'], [255, 30, 'Penutupan & foto bersama']] },
  workshop: { name: 'Pelatihan / workshop', items: [[-30, 30, 'Registrasi & absensi'], [0, 15, 'Pembukaan & perkenalan instruktur'], [15, 75, 'Materi & praktik 1'], [90, 15, 'Rehat'], [105, 75, 'Materi & praktik 2'], [180, 60, 'Ishoma'], [240, 60, 'Evaluasi & tanya jawab'], [300, 15, 'Pembagian sertifikat & penutupan']] },
  konser: { name: 'Konser / festival', items: [[-240, 120, 'Loading & setting panggung'], [-120, 60, 'Soundcheck'], [-60, 60, 'Open gate & penukaran tiket'], [0, 30, 'Opening act'], [30, 15, 'Pergantian panggung'], [45, 90, 'Penampil utama'], [135, 15, 'Penutupan'], [150, 120, 'Bongkar & loading out']] },
  umum: { name: 'Acara umum', items: [[-60, 60, 'Persiapan & cek perlengkapan'], [0, 15, 'Pembukaan'], [15, 60, 'Acara inti'], [75, 30, 'Hiburan / sesi tambahan'], [105, 15, 'Penutupan'], [120, 60, 'Bongkar & beres-beres']] },
};
export const tplFor = (cat) => {
  const c = (cat || '').toLowerCase();
  return /wedding|nikah|pernikahan/.test(c) ? 'wedding' : /seminar|konferensi/.test(c) ? 'seminar' : /workshop|pelatihan|kelas/.test(c) ? 'workshop'
    : /konser|festival|musik/.test(c) ? 'konser' : 'umum';
};
