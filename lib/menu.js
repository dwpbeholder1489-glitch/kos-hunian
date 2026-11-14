// Struktur menu aplikasi (mengikuti desain: Beranda · Operasional · + · Laporan · Akun, plus menu samping).
// Isi menu selalu berasal dari tabsFor(kos) — sudah tersaring per jenis bisnis, peran karyawan, dan modul aktif.
import { tabsFor, homeOf, typeOf, isKuliner, isDraft, canArea, moduleOn } from '@/lib/business';

// Kelompok modul (urutan = urutan tampil)
export const GROUPS = [
  ['ops', 'Operasional', 'Kelola aktivitas dan alur kerja harian', '/catatan'],
  ['trx', 'Transaksi', 'Penjualan, pembayaran, dan tagihan', '/penjualan'],
  ['cus', 'Pelanggan', 'Data pelanggan, prospek, dan halaman bisnis', '/penghuni'],
  ['inv', 'Inventaris', 'Stok barang, bahan, dan pergerakannya', '/barang'],
  ['fin', 'Keuangan', 'Kas, pengeluaran, pembukuan, anggaran, dan analisis', '/kas'],
  ['rep', 'Laporan', 'Analisis dan perkembangan bisnis', '/laporan'],
  ['set', 'Pengaturan Bisnis', 'Profil, karyawan, modul, dan konfigurasi', '/pengaturan'],
];
// Menu → kelompok (menu yang tidak terdaftar masuk Pengaturan Bisnis)
const OF = {
  '/kamar': 'ops', '/booking': 'ops', '/perbaikan': 'ops', '/meteran': 'ops', '/pesanan': 'ops', '/antar': 'ops', '/dapur': 'ops', '/meja': 'ops', '/catatan': 'ops', '/kasir': 'ops', '/shift': 'ops', '/layanan': 'ops',
  '/tagihan': 'trx', '/pembayaran': 'trx', '/penjualan': 'trx', '/grosir': 'trx', '/belanja': 'trx',
  '/penghuni': 'cus', '/kontak': 'cus', '/crm': 'cus', '/halaman': 'cus',
  '/barang': 'inv', '/mutasi': 'inv', '/media': 'inv',
  '/kas': 'fin', '/pengeluaran': 'fin', '/pembukuan': 'fin', '/anggaran': 'fin', '/analisis': 'fin',
  '/laporan': 'rep', '/laporan-toko': 'rep', '/laporan-jasa': 'rep', '/laporan-kustom': 'rep', '/bisnis': 'rep',
};
// Penjelasan singkat tiap menu (tampil di daftar modul)
const SUB = {
  '/kamar': 'Status, harga, dan riwayat tiap kamar', '/penghuni': 'Data penghuni & sewa', '/tagihan': 'Tagihan sewa & tambahan', '/pembayaran': 'Bukti bayar & verifikasi',
  '/booking': 'Booking kamar dengan uang tanda jadi', '/perbaikan': 'Keluhan kamar sampai selesai', '/meteran': 'Listrik/air jadi tagihan', '/pengeluaran': 'Biaya kos & uang diambil pemilik',
  '/crm': 'Prospek & tindak lanjut', '/halaman': 'Halaman publik, tautan & QR', '/media': 'Foto kamar, barang, layanan', '/laporan': 'Laba rugi & arus kas',
  '/kasir': 'Jual eceran & grosir', '/penjualan': 'Riwayat transaksi, retur, batal', '/grosir': 'Penawaran, pesanan, surat jalan, faktur', '/shift': 'Buka & tutup laci kasir', '/belanja': 'Pesan & terima dari supplier',
  '/kas': 'Saldo kas & bank, kasbon, utang', '/barang': 'Stok multi-satuan & harga', '/mutasi': 'Pindah stok antar lokasi', '/kontak': 'Pelanggan & supplier',
  '/laporan-toko': 'Laba, terlaris, tidak laku', '/pembukuan': 'Jurnal, laba rugi, neraca', '/anggaran': 'Rencana biaya vs realisasi', '/analisis': 'Tren, perbandingan & cabang', '/pesanan': 'Terima & proses pesanan', '/antar': 'Jemput & antar pesanan',
  '/dapur': 'Antrean masak', '/meja': 'Tagihan meja & reservasi', '/layanan': 'Harga, satuan, tahap proses', '/laporan-jasa': 'Pendapatan per layanan & harian',
  '/catatan': 'Data & alur kerja Anda', '/laporan-kustom': 'Laporan buatan sendiri', '/builder': 'Susun data, alur, laporan', '/bisnis': 'Ringkasan semua bisnis',
  '/langganan': 'Paket & pembayaran', '/pengaturan': 'Profil, rekening, pesan', '/persetujuan': 'Permintaan yang menunggu', '/aktivitas': 'Siapa melakukan apa & kapan', '/otomatisasi': 'Resep otomatis',
  '/konfigurasi': 'Modul, cabang, riwayat', '/karyawan': 'Undang & atur peran', '/konfirmasi': 'Tinjau konfigurasi bisnis',
};
export const subOf = (h) => SUB[h] || '';
// Ikon kelompok (dipakai NavIcon)
export const GROUP_ICON = { ops: '/catatan', trx: '/penjualan', cus: '/penghuni', inv: '/barang', fin: '/kas', rep: '/laporan', set: '/pengaturan' };

export function groupsFor(kos) {
  const tabs = tabsFor(kos);
  const home = homeOf(kos);
  return GROUPS.map(([k, name, desc]) => [k, name, desc, tabs.filter(([h]) => h !== home && (OF[h] || 'set') === k)]).filter(([, , , items]) => items.length);
}
// Halaman laporan utama sesuai jenis bisnis (bila peran boleh melihatnya)
export function reportOf(kos) {
  const tabs = tabsFor(kos);
  const want = { properti: '/laporan', retail: '/laporan-toko', jasa: '/laporan-jasa', kustom: '/laporan-kustom' }[kos?.business_type] || '/laporan';
  return tabs.find(([h]) => h === want) || null;
}
// Slot ke-4 navigasi bawah: Laporan; bila peran tidak boleh, menu kerja utama peran itu
export function fourthTab(kos) {
  const r = reportOf(kos);
  if (r) return [r[0], 'Laporan', r[0]];
  const home = homeOf(kos);
  const t = tabsFor(kos).find(([h]) => h !== home && h !== '/konfirmasi');
  return t ? [t[0], t[1].split(' ')[0], t[0]] : null;
}
// Aksi cepat tombol "+": hanya menu yang boleh dibuka peran ini
export function quickActions(kos) {
  if (isDraft(kos)) return [];
  const allowed = new Set(tabsFor(kos).map(([h]) => h));
  const kul = isKuliner(kos);
  const L = {
    properti: [['/pembayaran?baru=1', 'Catat pembayaran', '/pembayaran'], ['/penghuni?baru=1', 'Penghuni baru', '/penghuni'], ['/booking?baru=1', 'Booking kamar', '/booking'], ['/tagihan?baru=1', 'Tagihan tambahan', '/tagihan'], ['/pengeluaran?baru=1', 'Catat pengeluaran', '/pengeluaran'], ['/perbaikan?baru=1', 'Catat keluhan', '/perbaikan']],
    retail: [['/kasir', 'Transaksi kasir', '/kasir'], ['/grosir?baru=1', 'Penawaran grosir', '/grosir'], ['/belanja?baru=1', 'Belanja ke supplier', '/belanja'], ['/barang?baru=1', 'Barang baru', '/barang'], ['/kas?baru=biaya', 'Catat biaya', '/kas'], ['/kontak?baru=1', 'Kontak baru', '/kontak']],
    jasa: [['/pesanan?baru=1', kul ? 'Pesanan baru' : 'Terima pesanan', '/pesanan', 'sell'], ...(kul ? [['/meja', 'Meja & tagihan', '/meja']] : [['/antar', 'Antar jemput', '/antar']]), ['/kas?baru=biaya', 'Catat biaya', '/kas'], ['/kontak?baru=1', 'Pelanggan baru', '/kontak']],
    kustom: [['/catatan?baru=1', 'Catatan baru', '/catatan'], ['/kas?baru=biaya', 'Catat biaya', '/kas']],
  }[kos?.business_type] || [];
  return L.filter(([, , p, area]) => allowed.has(p) && (!area || canArea(kos, area)));
}
export { typeOf, homeOf, canArea, moduleOn };
