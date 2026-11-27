// Registry dashboard (Adaptive Business Experience §11). Id widget & KPI STABIL = sama dengan id di halaman dashboard.
// Dipakai halaman dashboard, "Atur dashboard", dan Pusat Pengalaman › Dashboard.
// Widget/KPI yang tidak relevan, belum ada datanya, atau tidak diizinkan untuk seseorang tetap tidak tampil walau dipilih.
import { today, thisMonth } from '@/lib/format';

export const DASHBOARDS = {
  kos: { name: 'Beranda kos & properti', engines: ['properti'], widgets: [['denyut', 'Denyut bisnis'], ['kpi', 'Angka utama'], ['tren', 'Tagihan vs terkumpul'], ['perhatian', 'Perlu perhatian'], ['menunggak', 'Penghuni menunggak'], ['jatuhtempo', 'Jatuh tempo 7 hari'], ['booking', 'Booking: jadwal masuk'], ['kamar', 'Status kamar'], ['aktivitas', 'Aktivitas terbaru'], ['aksi', 'Aksi cepat']] },
  toko: { name: 'Beranda toko', engines: ['retail'], widgets: [['kpi', 'Angka utama'], ['pintasan', 'Operasional'], ['mulai', 'Mulai di sini'], ['tren', 'Tren performa'], ['laporan', 'Pintasan laporan'], ['terlaris', 'Barang terlaris'], ['perhatian', 'Perlu perhatian'], ['transaksi', 'Transaksi terakhir'], ['menipis', 'Stok menipis'], ['modal', 'Harga modal berubah'], ['piutang', 'Piutang pelanggan'], ['diam', 'Barang tidak bergerak'], ['denyut', 'Denyut bisnis'], ['aktivitas', 'Aktivitas terbaru'], ['aksi', 'Aksi cepat']] },
  jasa: { name: 'Beranda jasa & kuliner', engines: ['jasa'], widgets: [['denyut', 'Denyut bisnis'], ['mulai', 'Mulai di sini'], ['reservasi', 'Reservasi hari ini'], ['kpi', 'Angka utama'], ['tren', 'Tren pendapatan'], ['perhatian', 'Perlu perhatian'], ['ringkasan', 'Ringkasan pesanan'], ['layanan', 'Menu terlaris / layanan teratas'], ['foodcost', 'Food cost per menu'], ['bahan', 'Bahan menipis'], ['terlambat', 'Terlambat'], ['hariini', 'Harus selesai hari ini'], ['jemput', 'Perlu dijemput'], ['antar', 'Siap diantar'], ['aktivitas', 'Aktivitas terbaru'], ['aksi', 'Aksi cepat']] },
  kerja: { name: 'Beranda bisnis', engines: ['kustom'], widgets: [['mulai', 'Mulai di sini'], ['kpi', 'Angka utama'], ['lewat', 'Lewat batas waktu'], ['tugas', 'Tugas saya'], ['data', 'Semua data'], ['aktivitas', 'Aktivitas terbaru'], ['aksi', 'Aksi cepat'], ['catatan', 'Catatan notifikasi']] },
};
export const dashOf = (kos) => Object.entries(DASHBOARDS).find(([, d]) => d.engines.includes(kos?.business_type))?.[0] || 'kos';

// Katalog angka utama (KPI) per dashboard: [id, nama, keterangan sumber]
export const KPIS = {
  toko: [['omzet', 'Penjualan', 'periode terpilih'], ['bulan', 'Penjualan bulan ini vs bulan lalu', ''], ['trx', 'Jumlah transaksi', ''], ['produk', 'Produk aktif', ''], ['pelanggan', 'Pelanggan', ''], ['laba', 'Laba kotor', 'penjualan − modal barang'], ['margin', 'Margin', 'laba kotor ÷ penjualan'],
    ['keranjang', 'Rata-rata belanja', 'penjualan ÷ transaksi'], ['retur', 'Retur', ''], ['nilai_stok', 'Nilai stok', 'harga modal'], ['menipis', 'Stok menipis', 'di bawah minimum'],
    ['piutang', 'Piutang pelanggan', 'kasbon belum dibayar'], ['piutang_lewat', 'Piutang lewat tempo', ''], ['diam', 'Barang tidak bergerak', 'tidak terjual ≥ 90 hari'], ['modal', 'Harga modal berubah', '30 hari']],
  jasa: [['masuk', 'Pesanan masuk', ''], ['selesai', 'Pesanan diserahkan', ''], ['tepat', 'Tepat waktu', 'siap sebelum janji'], ['dapur', 'Di dapur', 'belum siap'], ['proses', 'Sedang diproses', ''],
    ['siap', 'Siap diambil', ''], ['jemput', 'Menunggu jemput', ''], ['antar', 'Dalam pengantaran', ''], ['terlambat', 'Terlambat', 'lewat janji'], ['pendapatan', 'Pendapatan', 'pesanan diserahkan'],
    ['uang_masuk', 'Uang masuk', 'termasuk DP'], ['tertunda', 'Belum lunas', ''], ['food_cost', 'Food cost', 'biaya bahan ÷ penjualan menu']],
  kos: [['kas', 'Kas bersih', 'bulan ini'], ['hunian', 'Hunian', 'kamar terisi'], ['total_kamar', 'Total kamar', ''], ['kosong', 'Kamar kosong', 'siap disewa'], ['penghuni', 'Penghuni aktif', ''],
    ['booking', 'Booking aktif', ''], ['tagihan', 'Tagihan bulan ini', ''], ['terkumpul', 'Pembayaran diterima', 'terverifikasi'], ['jatuh_tempo', 'Jatuh tempo 7 hari', ''], ['sewa', 'Pendapatan sewa', 'bulan ini'], ['sisa', 'Sisa seluruh tagihan', ''], ['tunggakan', 'Tunggakan', '']],
};

const has = (kos, ...caps) => caps.some((c) => (kos?.dna?.caps || []).includes(c));
// KPI rekomendasi PRASARA dari Business DNA (pemilik bisa mengubahnya di "Atur dashboard")
export function defaultKpis(kos, id) {
  if (id === 'toko') return ['omzet', 'bulan', 'trx', 'keranjang', 'pelanggan', 'retur', 'laba', 'margin', 'nilai_stok', 'produk', 'menipis', 'modal', 'diam', 'piutang', 'piutang_lewat'];
  if (id === 'jasa') {
    const kul = kos?.template_code === 'kuliner' || kos?.category_code === 'kuliner';
    return kul ? ['masuk', 'dapur', 'siap', 'pendapatan', 'food_cost', 'tertunda'] : ['masuk', 'proses', 'siap', 'terlambat', 'pendapatan', 'tepat', ...(has(kos, 'uses_delivery') ? ['jemput', 'antar'] : []), 'tertunda'];
  }
  if (id === 'kos') return ['total_kamar', 'hunian', 'sewa', 'sisa'];
  return [];
}

// Periode tampilan dashboard
export const PERIODS = [['hari', 'Hari ini'], ['7hari', '7 hari'], ['bulan', 'Bulan ini']];
export function periodRange(p) {
  const t = today();
  if (p === 'bulan') return { from: thisMonth() + '-01', to: t, label: 'bulan ini', days: Number(t.slice(8, 10)) };
  if (p === '7hari') { const d = new Date(t + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() - 6); return { from: d.toISOString().slice(0, 10), to: t, label: '7 hari terakhir', days: 7 }; }
  return { from: t, to: t, label: 'hari ini', days: 1 };
}
// Pembanding Denyut bisnis: 30 hari sebelum periode (rata-rata per hari)
export function baselineRange(p) {
  const r = periodRange(p);
  const end = new Date(r.from + 'T00:00:00Z'); end.setUTCDate(end.getUTCDate() - 1);
  const start = new Date(end); start.setUTCDate(start.getUTCDate() - 29);
  return { from: start.toISOString().slice(0, 10), to: end.toISOString().slice(0, 10), days: 30 };
}
// Kalimat perbandingan dengan rata-rata (aturan tertulis: ±15% dianggap normal)
export function pulseLine(label, value, avgPerDay, days, fmt) {
  if (!(avgPerDay > 0)) return null;
  const expect = avgPerDay * days;
  const pct = Math.round(((value - expect) / expect) * 100);
  const tone = pct >= 15 ? 'good' : pct <= -15 ? 'warn' : 'info';
  return { tone, text: `${label} ${fmt(value)} — ${pct >= 15 ? `${pct}% di atas` : pct <= -15 ? `${Math.abs(pct)}% di bawah` : 'sesuai'} rata-rata 30 hari sebelumnya (${fmt(Math.round(expect))})` };
}
