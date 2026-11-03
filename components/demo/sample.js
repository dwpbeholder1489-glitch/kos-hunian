// Data contoh untuk landing page & panduan. Bukan data pengguna sungguhan.
const fmt = new Intl.NumberFormat('id-ID');
export const rp = (n) => (n < 0 ? '−' : '') + 'Rp ' + fmt.format(Math.abs(Math.round(n)));
const BLN = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
const BLNL = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];

// bulan berjalan (saat halaman dibuat)
const now = new Date();
const M = now.getMonth(), Y = now.getFullYear();
const prev = (k) => { const d = new Date(Y, M - k, 1); return { m: d.getMonth(), y: d.getFullYear() }; };
export const MONTH = `${BLNL[M]} ${Y}`;
export const MONTH_SHORT = `${BLN[M]} ${Y}`;
export const d = (day, back = 0) => { const p = prev(back); return `${day} ${BLN[p.m]}`; };
export const dFull = (day, back = 0) => { const p = prev(back); return `${day} ${BLN[p.m]} ${p.y}`; };

export const KOS = { name: 'Kos Hunian', address: 'Jl. Contoh No. 7, Majalengka' };

// kode, harga, status, penghuni, tanggal jatuh tempo, tunggakan
export const ROOMS = [
  { code: 'A01', rent: 750000, status: 'terisi', who: 'Rina Lestari', due: 5, debt: 0 },
  { code: 'A02', rent: 750000, status: 'terisi', who: 'Budi Santoso', due: 1, debt: 750000 },
  { code: 'A03', rent: 700000, status: 'terisi', who: 'Siti Aminah', due: 10, debt: 0 },
  { code: 'A04', rent: 700000, status: 'tersedia', who: null, due: null, debt: 0 },
  { code: 'A05', rent: 850000, status: 'terisi', who: 'Dimas Pratama', due: 3, debt: 350000 },
  { code: 'A06', rent: 850000, status: 'terisi', who: 'Ayu Wulandari', due: 15, debt: 0 },
  { code: 'A07', rent: 800000, status: 'terisi', who: 'Fajar Nugraha', due: 20, debt: 0 },
  { code: 'A08', rent: 800000, status: 'perbaikan', who: null, due: null, debt: 0 },
  { code: 'A09', rent: 650000, status: 'terisi', who: 'Nanda Putri', due: 25, debt: 0 },
  { code: 'A10', rent: 650000, status: 'tersedia', who: null, due: null, debt: 0 },
];
export const ROOM_ST = { tersedia: 'Tersedia', terisi: 'Terisi', perbaikan: 'Dalam perbaikan', tidak_disewakan: 'Tidak disewakan' };

export const INVOICES = [
  { who: 'Budi Santoso', room: 'A02', title: `Sewa ${d(1)} – ${d(30)}`, due: d(1), amount: 750000, left: 750000, state: 'menunggak' },
  { who: 'Dimas Pratama', room: 'A05', title: `Sewa ${d(3)} – ${d(2, -1)}`, due: d(3), amount: 850000, left: 350000, state: 'sebagian' },
  { who: 'Siti Aminah', room: 'A03', title: `Sewa ${d(10)} – ${d(9, -1)}`, due: d(10), amount: 700000, left: 700000, state: 'belum' },
  { who: 'Rina Lestari', room: 'A01', title: 'Listrik token', due: d(8), amount: 100000, left: 100000, state: 'belum' },
  { who: 'Rina Lestari', room: 'A01', title: `Sewa ${d(5)} – ${d(4, -1)}`, due: d(5), amount: 750000, left: 0, state: 'lunas' },
];

export const PAYMENTS_IN = [
  ['Rina Lestari', 'A01', 750000, d(4), 'Transfer bank'],
  ['Dimas Pratama', 'A05', 500000, d(3), 'Tunai'],
  ['Ayu Wulandari', 'A06', 850000, d(2), 'E-wallet / QRIS'],
  ['Fajar Nugraha', 'A07', 800000, d(1), 'Transfer bank'],
  ['Nanda Putri', 'A09', 650000, d(1), 'Tunai'],
];

export const EXPENSES = [
  ['Listrik dan air', 'Token & PDAM bulan ini', 1250000, d(2)],
  ['Internet', 'WiFi 50 Mbps', 350000, d(1)],
  ['Perbaikan', 'Ganti kran kamar mandi A08', 275000, d(6)],
  ['Gaji pengelola / penjaga', 'Gaji penjaga kos', 400000, d(7)],
];

// angka ringkasan dihitung dari data di atas agar konsisten
export const CASH_IN = PAYMENTS_IN.reduce((s, p) => s + p[2], 0);
export const CASH_OUT = EXPENSES.reduce((s, x) => s + x[2], 0);
export const FILLED = ROOMS.filter((r) => r.status === 'terisi').length;
export const RENTABLE = ROOMS.filter((r) => r.status === 'terisi' || r.status === 'tersedia').length;
export const ARREARS = ROOMS.reduce((s, r) => s + r.debt, 0);
export const BILLED = ROOMS.filter((r) => r.status === 'terisi').reduce((s, r) => s + r.rent, 0);

export const TREND = [5, 4, 3, 2, 1, 0].map((k) => {
  const p = prev(k);
  const income = [4300000, 4650000, 4650000, 5000000, 5150000, CASH_IN][5 - k];
  const ops = [2050000, 2300000, 1900000, 2450000, 2100000, CASH_OUT][5 - k];
  return { label: `${BLN[p.m]} ${String(p.y).slice(2)}`, income, ops, laba: income - ops };
});
