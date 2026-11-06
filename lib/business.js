// Jenis bisnis PRASARA. Setiap jenis punya menu sendiri; data tiap bisnis tetap terpisah.
export const BUSINESS_TYPES = {
  properti: {
    name: 'Properti & Sewa', icon: '🏠', ready: true, home: '/beranda',
    desc: 'Kos, kontrakan, homestay: kamar, penghuni, tagihan bulanan, pembayaran, pengeluaran, laporan.',
    tabs: [['/beranda', 'Dashboard'], ['/kamar', 'Kamar'], ['/penghuni', 'Penghuni'], ['/tagihan', 'Tagihan'],
      ['/pembayaran', 'Pembayaran'], ['/pengeluaran', 'Pengeluaran'], ['/laporan', 'Laporan'],
      ['/langganan', 'Langganan'], ['/pengaturan', 'Pengaturan'], ['/bisnis', 'Bisnis saya']],
  },
  retail: {
    name: 'Retail & Grosir', icon: '🛒', ready: false, home: '/toko',
    desc: 'Toko sembako, minimarket, grosir: kasir, stok multi-satuan, belanja ke supplier, kas, kasbon, laporan laba.',
    tabs: [['/toko', 'Toko'], ['/barang', 'Barang & stok'], ['/bisnis', 'Bisnis saya']],
  },
};
export const typeOf = (kos) => BUSINESS_TYPES[kos?.business_type] || BUSINESS_TYPES.properti;
// Halaman yang boleh dibuka untuk setiap jenis bisnis (halaman lain milik jenis berbeda)
export const SHARED_PATHS = ['/bisnis', '/bantuan', '/admin'];
export const pathAllowed = (kos, path) => SHARED_PATHS.some((p) => path.startsWith(p)) || typeOf(kos).tabs.some(([h]) => path.startsWith(h))
  || (kos?.business_type !== 'retail' && ['/notifikasi', '/kwitansi'].some((p) => path.startsWith(p)));
