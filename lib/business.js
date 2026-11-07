// Jenis bisnis PRASARA. Setiap jenis punya menu sendiri; data tiap bisnis tetap terpisah.
export const BUSINESS_TYPES = {
  properti: {
    name: 'Properti & Sewa', icon: '🏠', ready: true, home: '/beranda',
    desc: 'Kos, kontrakan, homestay: kamar, penghuni, tagihan bulanan, booking, deposit, keluhan & perbaikan, meteran listrik/air, pengeluaran, laporan.',
    tabs: [['/beranda', 'Dashboard'], ['/kamar', 'Kamar'], ['/penghuni', 'Penghuni'], ['/tagihan', 'Tagihan'],
      ['/pembayaran', 'Pembayaran'], ['/booking', 'Booking kamar'], ['/perbaikan', 'Keluhan & perbaikan'], ['/meteran', 'Meteran listrik/air'], ['/pengeluaran', 'Pengeluaran'], ['/crm', 'Calon penghuni'], ['/halaman', 'Halaman bisnis'], ['/laporan', 'Laporan'], ['/pembukuan', 'Pembukuan'],
      ['/langganan', 'Langganan'], ['/pengaturan', 'Pengaturan'], ['/persetujuan', 'Persetujuan'], ['/otomatisasi', 'Otomatisasi'], ['/konfigurasi', 'Konfigurasi'], ['/karyawan', 'Karyawan'], ['/bisnis', 'Ringkasan pemilik']],
  },
  jasa: {
    name: 'Jasa & Laundry', icon: '🧺', ready: true, home: '/jasa',
    desc: 'Laundry (dan jasa lain): terima pesanan per kg/item, tahap cuci-kering-setrika-QC, nota, DP/lunas, antar-jemput, keluhan, bahan, laporan.',
    tabs: [['/jasa', 'Dashboard'], ['/pesanan', 'Pesanan'], ['/kas', 'Kas'], ['/layanan', 'Layanan & tahap'], ['/barang', 'Bahan & stok'], ['/belanja', 'Belanja'],
      ['/kontak', 'Pelanggan & supplier'], ['/crm', 'Prospek & tindak lanjut'], ['/halaman', 'Halaman bisnis'], ['/laporan-jasa', 'Laporan'], ['/pembukuan', 'Pembukuan'],
      ['/langganan', 'Langganan'], ['/pengaturan', 'Pengaturan'], ['/persetujuan', 'Persetujuan'], ['/otomatisasi', 'Otomatisasi'], ['/konfigurasi', 'Konfigurasi'], ['/karyawan', 'Karyawan'], ['/bisnis', 'Ringkasan pemilik']],
  },
  kustom: {
    name: 'Bisnis lain (Business Builder)', icon: '🧩', ready: true, home: '/kerja',
    desc: 'Usaha yang belum ada di daftar (bengkel, salon, katering, dll.): susun sendiri jenis data, formulir, status & alur kerja, peran, dan laporan.',
    tabs: [['/kerja', 'Dashboard'], ['/catatan', 'Catatan'], ['/kas', 'Kas & biaya'], ['/laporan-kustom', 'Laporan'], ['/builder', 'Business Builder'], ['/pembukuan', 'Pembukuan'],
      ['/langganan', 'Langganan'], ['/pengaturan', 'Pengaturan'], ['/persetujuan', 'Persetujuan'], ['/konfigurasi', 'Konfigurasi'], ['/karyawan', 'Karyawan'], ['/bisnis', 'Ringkasan pemilik']],
  },
  retail: {
    name: 'Retail & Grosir', icon: '🛒', ready: true, home: '/toko',
    desc: 'Toko sembako, minimarket, grosir: kasir, stok multi-satuan, belanja ke supplier, kas, kasbon, laporan laba.',
    tabs: [['/toko', 'Toko'], ['/kasir', 'Kasir'], ['/penjualan', 'Penjualan'], ['/shift', 'Shift kasir'], ['/belanja', 'Belanja'], ['/kas', 'Kas & kasbon'], ['/barang', 'Barang & stok'], ['/mutasi', 'Mutasi stok'], ['/kontak', 'Pelanggan & supplier'], ['/crm', 'Prospek & tindak lanjut'], ['/halaman', 'Halaman bisnis'], ['/laporan-toko', 'Laporan'], ['/pembukuan', 'Pembukuan'], ['/langganan', 'Langganan'], ['/pengaturan', 'Pengaturan'], ['/persetujuan', 'Persetujuan'], ['/otomatisasi', 'Otomatisasi'], ['/konfigurasi', 'Konfigurasi'], ['/karyawan', 'Karyawan'], ['/bisnis', 'Ringkasan pemilik']],
  },
};
export const typeOf = (kos) => BUSINESS_TYPES[kos?.business_type] || BUSINESS_TYPES.properti;

// ---- Peran karyawan (sama dengan role_allows di database; database tetap penentu akhir) ----
export const ROLES = {
  pemilik: { name: 'Pemilik', desc: 'Semua menu.' },
  pengelola: { name: 'Pengelola', desc: 'Semua menu termasuk Pengaturan, kecuali Langganan dan Karyawan.' },
  kasir: { name: 'Kasir', desc: 'Kasir dan riwayat penjualannya sendiri; bisa meminta pembatalan/retur ke pemilik. Tidak melihat harga modal, laba, kas, atau laporan.' },
  gudang: { name: 'Staf gudang', desc: 'Barang & stok dan Belanja (pesan & terima barang).' },
  penjaga: { name: 'Penjaga', desc: 'Kamar, penghuni, tagihan, pembayaran. Tidak melihat pengeluaran dan laporan.' },
  operator: { name: 'Petugas proses', desc: 'Jasa: melihat antrean dan memindahkan tahap pesanan (cuci, setrika, dll.), mencatat keluhan. Tidak melihat uang, tidak bisa menerima bayar atau menyerahkan pesanan. Bisnis kustom: mencatat dan memindahkan status sesuai aturan alur; tidak melihat laporan & field yang disembunyikan.' },
};
const ALLOW = { pengelola: (a) => a !== 'team', kasir: (a) => a === 'sell', gudang: (a) => a === 'stock', penjaga: (a) => a === 'rent', operator: (a) => a === 'ops' };
export const roleOf = (kos) => kos?.my_role || 'pemilik';
export const canArea = (kos, areas) => { const r = roleOf(kos); return r === 'pemilik' || !areas || areas.split(',').some((a) => ALLOW[r]?.(a)); };
// Area tiap halaman: sell, stock, finance, rent, team
const AREA = {
  '/beranda': 'rent', '/kamar': 'rent', '/penghuni': 'rent', '/tagihan': 'rent', '/pembayaran': 'rent', '/notifikasi': 'rent', '/kwitansi': 'rent', '/perbaikan': 'rent', '/meteran': 'rent', '/booking': 'rent',
  '/pengeluaran': 'finance', '/laporan-toko': 'finance', '/laporan': 'finance', '/langganan': 'team', '/pengaturan': 'settings', '/konfigurasi': 'settings', '/otomatisasi': 'settings', '/persetujuan': '', '/kontak': 'stock,finance', '/karyawan': 'team', '/bisnis': 'finance', '/pembukuan': 'finance',
  '/toko': 'finance', '/kasir': 'sell', '/penjualan': 'sell,finance', '/shift': 'sell,finance', '/struk': 'sell,finance', '/belanja': 'stock', '/barang': 'stock', '/kas': 'finance', '/pengingat': 'stock,finance', '/label': 'stock', '/mutasi': 'stock', '/crm': 'sell,rent', '/halaman': 'settings', '/jasa': 'sell,ops,finance', '/pesanan': 'sell,ops', '/nota': 'sell', '/layanan': 'settings', '/laporan-jasa': 'finance', '/kerja': 'ops,settings,finance', '/catatan': 'ops', '/laporan-kustom': 'finance', '/builder': 'settings',
};
const areaOf = (path) => { const k = Object.keys(AREA).filter((h) => path.startsWith(h)).sort((a, b) => b.length - a.length)[0]; return k ? AREA[k] : null; };
// Menu milik modul opsional (Module Registry di database). Modul nonaktif = menunya disembunyikan & server menolak.
export const PATH_MODULE = { '/pengeluaran': 'p_pengeluaran', '/notifikasi': 'p_pengingat', '/belanja': 'r_belanja', '/kontak': 'r_kontak', '/shift': 'r_shift', '/label': 'r_label', '/pengingat': 'r_pengingat', '/karyawan': 'u_karyawan', '/pembukuan': 'u_akuntansi', '/crm': 'u_crm', '/halaman': 'u_halaman', '/perbaikan': 'p_perbaikan', '/meteran': 'p_meteran', '/booking': 'p_booking' };
// Untuk bisnis jasa, menu Barang adalah "Bahan & stok" (modul j_bahan)
const TYPE_PATH_MODULE = { jasa: { '/barang': 'j_bahan' }, kustom: { '/kas': 'k_kas' } };
const moduleOfPath = (path, kos) => { const map = { ...PATH_MODULE, ...(TYPE_PATH_MODULE[kos?.business_type] || {}) }; const k = Object.keys(map).find((h) => path === h || path.startsWith(h + '/')); return k ? map[k] : null; };
export const moduleOn = (kos, code) => !kos?.modules || !code || kos.modules.includes(code);
export const pathModuleOff = (kos, path) => { const m = moduleOfPath(path, kos); return m && !moduleOn(kos, m) ? m : null; };
// Mutasi stok: untuk karyawan hanya muncul bila ada >1 lokasi; pemilik selalu melihatnya (berisi cara menambah cabang/gudang)
export const multiLoc = (kos) => (kos?.locs?.list?.length || 0) > 1;
const relevant = (kos, h) => h !== '/mutasi' || multiLoc(kos) || canArea(kos, 'team');
export const tabsFor = (kos) => typeOf(kos).tabs.filter(([h]) => canArea(kos, areaOf(h)) && !pathModuleOff(kos, h) && relevant(kos, h));
// 4 menu utama di navigasi bawah (sisanya di "Lainnya"), sesuai peran
const PRIMARY = { properti: ['/beranda', '/kamar', '/tagihan', '/pembayaran'], retail: ['/toko', '/kasir', '/barang', '/laporan-toko'], jasa: ['/jasa', '/pesanan', '/kas', '/laporan-jasa'], kustom: ['/kerja', '/catatan', '/laporan-kustom', '/builder'] };
export const primaryTabs = (kos) => {
  const all = tabsFor(kos);
  const want = PRIMARY[kos?.business_type] || PRIMARY.properti;
  const first = want.map((h) => all.find(([x]) => x === h)).filter(Boolean);
  return [...first, ...all.filter((t) => !first.includes(t))].slice(0, 4);
};
export const homeOf = (kos) => { const t = typeOf(kos); return canArea(kos, areaOf(t.home)) ? t.home : tabsFor(kos)[0]?.[0] || '/bantuan'; };

// Halaman yang boleh dibuka untuk setiap jenis bisnis (halaman lain milik jenis berbeda)
export const SHARED_PATHS = ['/bisnis', '/bantuan', '/admin', '/karyawan', '/buka'];
export const pathOfType = (kos, path) => SHARED_PATHS.some((p) => path.startsWith(p)) || typeOf(kos).tabs.some(([h]) => path.startsWith(h))
  || ((kos?.business_type || 'properti') === 'properti' && ['/notifikasi', '/kwitansi'].some((p) => path.startsWith(p)))
  || (kos?.business_type === 'retail' && ['/struk', '/pengingat', '/label'].some((p) => path.startsWith(p)))
  || (kos?.business_type === 'jasa' && path.startsWith('/nota/'));
export const pathAllowed = (kos, path) => pathOfType(kos, path) && canArea(kos, areaOf(path)) && !pathModuleOff(kos, path) && relevant(kos, path.startsWith('/mutasi') ? '/mutasi' : path);
