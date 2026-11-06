// Jenis bisnis PRASARA. Setiap jenis punya menu sendiri; data tiap bisnis tetap terpisah.
export const BUSINESS_TYPES = {
  properti: {
    name: 'Properti & Sewa', icon: '🏠', ready: true, home: '/beranda',
    desc: 'Kos, kontrakan, homestay: kamar, penghuni, tagihan bulanan, pembayaran, pengeluaran, laporan.',
    tabs: [['/beranda', 'Dashboard'], ['/kamar', 'Kamar'], ['/penghuni', 'Penghuni'], ['/tagihan', 'Tagihan'],
      ['/pembayaran', 'Pembayaran'], ['/pengeluaran', 'Pengeluaran'], ['/laporan', 'Laporan'],
      ['/langganan', 'Langganan'], ['/pengaturan', 'Pengaturan'], ['/karyawan', 'Karyawan'], ['/bisnis', 'Bisnis saya']],
  },
  retail: {
    name: 'Retail & Grosir', icon: '🛒', ready: true, home: '/toko',
    desc: 'Toko sembako, minimarket, grosir: kasir, stok multi-satuan, belanja ke supplier, kas, kasbon, laporan laba.',
    tabs: [['/toko', 'Toko'], ['/kasir', 'Kasir'], ['/penjualan', 'Penjualan'], ['/shift', 'Shift kasir'], ['/belanja', 'Belanja'], ['/kas', 'Kas & kasbon'], ['/barang', 'Barang & stok'], ['/kontak', 'Pelanggan & supplier'], ['/laporan-toko', 'Laporan'], ['/langganan', 'Langganan'], ['/pengaturan', 'Pengaturan'], ['/karyawan', 'Karyawan'], ['/bisnis', 'Bisnis saya']],
  },
};
export const typeOf = (kos) => BUSINESS_TYPES[kos?.business_type] || BUSINESS_TYPES.properti;

// ---- Peran karyawan (sama dengan role_allows di database; database tetap penentu akhir) ----
export const ROLES = {
  pemilik: { name: 'Pemilik', desc: 'Semua menu.' },
  pengelola: { name: 'Pengelola', desc: 'Semua menu termasuk Pengaturan, kecuali Langganan dan Karyawan.' },
  kasir: { name: 'Kasir', desc: 'Kasir dan riwayat penjualannya sendiri. Tidak melihat harga modal, laba, kas, atau laporan.' },
  gudang: { name: 'Staf gudang', desc: 'Barang & stok dan Belanja (pesan & terima barang).' },
  penjaga: { name: 'Penjaga', desc: 'Kamar, penghuni, tagihan, pembayaran. Tidak melihat pengeluaran dan laporan.' },
};
const ALLOW = { pengelola: (a) => a !== 'team', kasir: (a) => a === 'sell', gudang: (a) => a === 'stock', penjaga: (a) => a === 'rent' };
export const roleOf = (kos) => kos?.my_role || 'pemilik';
export const canArea = (kos, areas) => { const r = roleOf(kos); return r === 'pemilik' || !areas || areas.split(',').some((a) => ALLOW[r]?.(a)); };
// Area tiap halaman: sell, stock, finance, rent, team
const AREA = {
  '/beranda': 'rent', '/kamar': 'rent', '/penghuni': 'rent', '/tagihan': 'rent', '/pembayaran': 'rent', '/notifikasi': 'rent', '/kwitansi': 'rent',
  '/pengeluaran': 'finance', '/laporan-toko': 'finance', '/laporan': 'finance', '/langganan': 'team', '/pengaturan': 'settings', '/kontak': 'stock,finance', '/karyawan': 'team', '/bisnis': 'finance',
  '/toko': 'finance', '/kasir': 'sell', '/penjualan': 'sell,finance', '/shift': 'sell,finance', '/struk': 'sell,finance', '/belanja': 'stock', '/barang': 'stock', '/kas': 'finance', '/pengingat': 'stock,finance', '/label': 'stock',
};
const areaOf = (path) => { const k = Object.keys(AREA).filter((h) => path.startsWith(h)).sort((a, b) => b.length - a.length)[0]; return k ? AREA[k] : null; };
export const tabsFor = (kos) => typeOf(kos).tabs.filter(([h]) => canArea(kos, areaOf(h)));
// 4 menu utama di navigasi bawah (sisanya di "Lainnya"), sesuai peran
const PRIMARY = { properti: ['/beranda', '/kamar', '/tagihan', '/pembayaran'], retail: ['/toko', '/kasir', '/barang', '/laporan-toko'] };
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
  || (kos?.business_type !== 'retail' && ['/notifikasi', '/kwitansi'].some((p) => path.startsWith(p)))
  || (kos?.business_type === 'retail' && ['/struk', '/pengingat', '/label'].some((p) => path.startsWith(p)));
export const pathAllowed = (kos, path) => pathOfType(kos, path) && canArea(kos, areaOf(path));
