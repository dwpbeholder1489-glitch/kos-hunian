// Data & jawaban contoh untuk /p/contoh (bisa dibuka siapa saja, tidak menyentuh database)
const p2 = (n) => String(n).padStart(2, '0');
const now = new Date();
const ym = (k) => { const d = new Date(now.getFullYear(), now.getMonth() + k, 1); return d.getFullYear() + '-' + p2(d.getMonth() + 1); };
const day = (k, dd) => `${ym(k)}-${p2(dd)}`;
const last = (k) => { const d = new Date(now.getFullYear(), now.getMonth() + k + 1, 0); return `${ym(k)}-${p2(d.getDate())}`; };

export const DEMO_TOKEN = 'contoh';

export const DEMO_PORTAL = {
  locked: false, demo: true,
  today: `${ym(0)}-${p2(now.getDate())}`,
  kos: {
    name: 'Kos Hunian', address: 'Jl. Contoh No. 7, Majalengka', contact_phone: '081222206149',
    payment_info: 'Transfer ke Bank Contoh 123-456-7890 a.n. Pemilik Kos\nAtau QRIS di meja depan\nPaling lambat tanggal jatuh tempo',
    house_rules: 'Jam malam pukul 22.00\nTamu menginap wajib lapor pengelola\nJaga kebersihan dapur bersama\nParkir motor di area belakang',
  },
  occupant: { name: 'Budi Santoso' },
  lease: { room: 'A02', rent: 750000, start_date: day(-5, 1), status: 'aktif', facilities: ['Kasur', 'Lemari', 'Kamar mandi dalam', 'WiFi'] },
  invoices: [
    { id: 'd1', kind: 'sewa', period_start: day(0, 1), period_end: last(0), due_date: day(0, 1), amount: 750000, paid: 0, pending: 0, outstanding: 750000, pay_state: 'belum', overdue: now.getDate() > 1 },
    { id: 'd2', kind: 'tambahan', description: 'Listrik token', period_start: day(0, 8), period_end: day(0, 8), due_date: day(0, 8), amount: 100000, paid: 0, pending: 0, outstanding: 100000, pay_state: 'belum', overdue: now.getDate() > 8 },
    { id: 'd3', kind: 'sewa', period_start: day(-1, 1), period_end: last(-1), due_date: day(-1, 1), amount: 750000, paid: 750000, pending: 0, outstanding: 0, pay_state: 'lunas', overdue: false },
    { id: 'd4', kind: 'sewa', period_start: day(-2, 1), period_end: last(-2), due_date: day(-2, 1), amount: 750000, paid: 750000, pending: 0, outstanding: 0, pay_state: 'lunas', overdue: false },
  ],
  payments: [
    { id: 'q1', invoice_id: 'd3', amount: 750000, paid_at: day(-1, 2), method: 'transfer', status: 'terverifikasi', source: 'penghuni' },
    { id: 'q2', invoice_id: 'd4', amount: 750000, paid_at: day(-2, 1), method: 'tunai', status: 'terverifikasi', source: 'pengelola' },
  ],
  vacant_rooms: [{ code: 'A04', rent: 700000 }, { code: 'A10', rent: 650000 }],
};

// Jawaban contoh sederhana (asisten sungguhan memakai AI dan data asli)
export function demoAnswer(q) {
  const t = q.toLowerCase();
  if (/tagihan|bayar berapa|berapa.*(bayar|tagih)|utang|tunggak/.test(t)) return 'Tagihan Anda yang belum dibayar: sewa kamar A02 bulan ini Rp750.000 dan listrik token Rp100.000, total Rp850.000. Setelah transfer, tekan "Bayar & kirim bukti" di tab Tagihan ya.';
  if (/transfer|rekening|ke mana|kemana|qris|cara bayar/.test(t)) return 'Silakan transfer ke Bank Contoh 123-456-7890 a.n. Pemilik Kos, atau bayar lewat QRIS di meja depan. Setelah itu kirim foto bukti lewat tombol "Bayar & kirim bukti".';
  if (/jatuh tempo|kapan|tanggal/.test(t)) return 'Sewa Anda jatuh tempo setiap tanggal 1. Listrik token jatuh tempo tanggal 8 bulan ini.';
  if (/kosong|teman|kamar lain|tersedia/.test(t)) return 'Saat ini ada 2 kamar kosong: A04 Rp700.000/bulan dan A10 Rp650.000/bulan. Untuk survei atau booking, silakan hubungi pengelola lewat tombol Hubungi.';
  if (/aturan|peraturan|jam malam|tamu|parkir/.test(t)) return 'Peraturan kos: jam malam pukul 22.00, tamu menginap wajib lapor pengelola, jaga kebersihan dapur bersama, dan parkir motor di area belakang.';
  if (/rusak|bocor|mati|keluhan|komplain|diskon|keringanan|tunda/.test(t)) return 'Untuk keluhan, kerusakan, atau permintaan keringanan, mohon hubungi pengelola langsung lewat tombol Hubungi agar segera ditangani.';
  return 'Maaf, saya hanya bisa membantu urusan kos: tagihan, cara bayar, jatuh tempo, peraturan, dan info kamar. Ada yang ingin ditanyakan soal itu?';
}
