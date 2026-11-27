// Struktur menu aplikasi — Adaptive Business Experience §12–13.
// • Isi menu SELALU dari tabsFor(kos): sudah tersaring jenis bisnis, peran karyawan, paket, dan modul aktif (server tetap penentu).
// • PROFIL NAVIGASI per jenis bisnis menentukan bagian & kelompok (retail: Penjualan/Pembelian/Persediaan…; kos: Kamar/Penghuni/
//   Booking + Manajemen; kuliner: Pesanan/Menu + Operasional bahan/resep; dst.). Menu baru cukup ditambah ke profil.
// • Pengaturan pemilik (experience_configs.nav): sembunyikan menu, urutan kelompok, pintasan, menu utama di menu bawah.
//   Menyembunyikan TIDAK menutup akses: menu tetap ada di Modul Bisnis & pencarian.
import { tabsFor, homeOf, typeOf, isKuliner, isDraft, canArea, moduleOn } from '@/lib/business';
import { quickFor } from '@/lib/quick';
import { hasFeature } from '@/lib/plan';

// Kelompok: kunci → [nama, keterangan, ikon]
const G = {
  sales: ['Penjualan', 'Kasir, transaksi, grosir, promo, shift', '/penjualan'],
  buy: ['Pembelian', 'Belanja ke supplier & barang titipan', '/belanja'],
  inv: ['Persediaan', 'Stok barang, mutasi, kesehatan stok', '/barang'],
  cus: ['Pelanggan', 'Pelanggan, supplier, prospek, halaman bisnis', '/kontak'],
  fin: ['Keuangan', 'Kas, pengeluaran, pembukuan, anggaran, aset', '/kas'],
  rep: ['Laporan', 'Laporan & ringkasan bisnis', '/laporan'],
  bi: ['Analisis Bisnis', 'Kesehatan, tren, insight & tindak lanjut', '/analisis'],
  set: ['Pengaturan bisnis', 'Profil, pengalaman, karyawan, modul, langganan', '/pengaturan'],
  room: ['Kamar', 'Status, harga, dan riwayat kamar', '/kamar'],
  tenant: ['Penghuni', 'Data penghuni, sewa, calon penghuni', '/penghuni'],
  booking: ['Booking', 'Booking kamar dengan uang tanda jadi', '/booking'],
  care: ['Perawatan', 'Keluhan, perbaikan, meteran', '/perbaikan'],
  bill: ['Tagihan', 'Tagihan sewa & tambahan', '/tagihan'],
  pay: ['Pembayaran', 'Bukti bayar & verifikasi', '/pembayaran'],
  spend: ['Pengeluaran', 'Biaya & uang diambil pemilik', '/pengeluaran'],
  order: ['Pesanan', 'Terima, proses, dan serahkan pesanan', '/pesanan'],
  menu: ['Menu & produk', 'Menu, harga, tahap dapur', '/layanan'],
  service: ['Layanan', 'Layanan, harga, tahap proses', '/layanan'],
  deliver: ['Antar jemput', 'Jadwal jemput & antar', '/antar'],
  stock: ['Bahan baku', 'Stok bahan & belanja bahan', '/barang'],
  bahan: ['Bahan operasional', 'Bahan, pemakaian per layanan, belanja', '/barang'],
  recipe: ['Resep & food cost', 'Takaran bahan, biaya & margin per menu', '/resep'],
  supplier: ['Supplier & pelanggan', 'Kontak, prospek, halaman bisnis', '/kontak'],
  team: ['Karyawan & shift', 'Absensi, jadwal, gaji, akses karyawan', '/sdm'],
  work: ['Pekerjaan', 'Data & alur kerja usaha Anda', '/catatan'],
  project: ['Proyek', 'Proyek, milestone, tugas tim', '/proyek'],
  hid: ['Menu disembunyikan', 'Disembunyikan dari menu oleh pemilik — tetap bisa dibuka', '/layers'],
};
const SET = ['/pengalaman', '/alur', '/integrasi', '/pengaturan', '/konfigurasi', '/karyawan', '/sdm', '/langganan', '/persetujuan', '/aktivitas', '/otomatisasi', '/konfirmasi', '/halaman', '/media', '/builder'];
const FIN = ['/kas', '/pengeluaran', '/pembukuan', '/anggaran', '/aset'];
// Menu permanen tepat di bawah Beranda (bagian pertama), untuk peran yang boleh membuka /analisis (area keuangan).
const PINNED_TOP = ['bi', '/analisis'];

// Profil navigasi: [bagian, judul, [[kelompok, [menu…]]]]. Menu yang tidak tercantum masuk "Pengaturan bisnis".
const PROFILES = {
  retail: [
    ['ws', 'Workspace', [['sales', ['/kasir', '/penjualan', '/grosir', '/promo', '/garansi', '/shift', '/tutup-hari', '/komisi']], ['buy', ['/belanja', '/konsinyasi']],
      ['inv', ['/barang', '/mutasi']], ['cus', ['/kontak', '/crm']], ['fin', FIN], ['rep', ['/laporan-toko', '/bisnis']]]],
    ['sys', 'Sistem', [['set', SET]]],
  ],
  properti: [
    ['ws', 'Workspace', [['room', ['/kamar']], ['tenant', ['/penghuni', '/crm']], ['booking', ['/booking']], ['care', ['/perbaikan', '/meteran']]]],
    ['mgr', 'Manajemen', [['bill', ['/tagihan']], ['pay', ['/pembayaran']], ['spend', ['/pengeluaran']], ['fin', ['/pembukuan', '/anggaran', '/aset']], ['rep', ['/laporan', '/bisnis']]]],
    ['sys', 'Sistem', [['set', SET]]],
  ],
  kuliner: [
    ['ws', 'Workspace', [['order', ['/pesanan', '/meja', '/dapur', '/antar']], ['menu', ['/layanan']]]],
    ['ops', 'Operasional', [['stock', ['/barang', '/belanja']], ['recipe', ['/resep']], ['supplier', ['/kontak', '/crm']], ['team', ['/sdm', '/karyawan']]]],
    ['mgr', 'Manajemen', [['fin', ['/kas', '/pembukuan', '/anggaran', '/aset']], ['rep', ['/laporan-jasa', '/bisnis']]]],
    ['sys', 'Sistem', [['set', SET]]],
  ],
  jasa: [
    ['ws', 'Workspace', [['project', ['/proyek']], ['order', ['/pesanan']], ['deliver', ['/antar']], ['service', ['/layanan']], ['cus', ['/kontak', '/crm']]]],
    ['ops', 'Operasional', [['team', ['/sdm', '/karyawan']], ['bahan', ['/barang', '/resep', '/belanja']], ['fin', FIN], ['rep', ['/laporan-jasa', '/bisnis']]]],
    ['sys', 'Sistem', [['set', SET]]],
  ],
  kustom: [
    ['ws', 'Workspace', [['project', ['/proyek']], ['@bb', ['/catatan']]]],
    ['mgr', 'Manajemen', [['fin', FIN], ['team', ['/sdm', '/karyawan']], ['rep', ['/laporan-kustom', '/bisnis']]]],
    ['sys', 'Sistem', [['set', SET]]],
  ],
};
export const profileKey = (kos) => (isKuliner(kos) ? 'kuliner' : PROFILES[kos?.business_type] ? kos.business_type : 'properti');

// Penjelasan singkat tiap menu (daftar modul & keterangan halaman)
const SUB = {
  '/kamar': 'Status, harga, dan riwayat tiap kamar', '/penghuni': 'Data penghuni & sewa', '/tagihan': 'Tagihan sewa & tambahan', '/pembayaran': 'Bukti bayar & verifikasi',
  '/booking': 'Booking kamar dengan uang tanda jadi', '/perbaikan': 'Keluhan kamar sampai selesai', '/meteran': 'Listrik/air jadi tagihan', '/pengeluaran': 'Biaya & uang diambil pemilik',
  '/crm': 'Prospek & tindak lanjut', '/halaman': 'Halaman publik, tautan & QR', '/media': 'Foto kamar, barang, layanan', '/laporan': 'Laba rugi & arus kas',
  '/kasir': 'Jual eceran & grosir', '/penjualan': 'Riwayat transaksi, retur, batal', '/grosir': 'Penawaran, pesanan, surat jalan, faktur', '/promo': 'Diskon, beli X gratis Y, paket', '/konsinyasi': 'Barang titipan & setoran ke penitip', '/shift': 'Buka & tutup laci kasir', '/tutup-hari': 'Rekap & tutup hari berjualan', '/komisi': 'Komisi penjualan per kasir', '/garansi': 'Cek garansi & klaim nomor seri', '/belanja': 'Pesan & terima dari supplier',
  '/kas': 'Saldo kas & bank, kasbon, utang', '/barang': 'Stok multi-satuan & harga', '/mutasi': 'Pindah stok antar lokasi', '/kontak': 'Pelanggan & supplier',
  '/laporan-toko': 'Laba, terlaris, tidak laku', '/pembukuan': 'Jurnal, laba rugi, neraca', '/anggaran': 'Rencana biaya vs realisasi', '/aset': 'Daftar aset & penyusutan', '/analisis': 'Kesehatan bisnis, tren, insight & tindak lanjut', '/pesanan': 'Terima & proses pesanan', '/antar': 'Jemput & antar pesanan',
  '/dapur': 'Antrean masak', '/meja': 'Tagihan meja & reservasi', '/layanan': 'Harga, satuan, tahap proses', '/resep': 'Bahan per menu, biaya & margin', '/laporan-jasa': 'Pendapatan per layanan & harian',
  '/catatan': 'Data & alur kerja Anda', '/laporan-kustom': 'Laporan buatan sendiri', '/builder': 'Susun data, alur, laporan', '/bisnis': 'Ringkasan semua bisnis',
  '/langganan': 'Paket & pembayaran', '/pengaturan': 'Profil, rekening, pesan', '/pengaturan/tampilan-link': 'Banner dan pratinjau tautan bisnis', '/persetujuan': 'Permintaan yang menunggu', '/aktivitas': 'Siapa melakukan apa & kapan', '/otomatisasi': 'Resep otomatis',
  '/konfigurasi': 'Modul, cabang, riwayat', '/karyawan': 'Undang & atur peran', '/sdm': 'Absensi, jadwal shift, gaji, kasbon', '/konfirmasi': 'Tinjau konfigurasi bisnis',
  '/pengalaman': 'Profil bisnis, fitur, menu, aksi cepat, rekomendasi',
  '/alur': 'Peta proses, tahap & status, aturan karyawan, saran alur',
  '/integrasi': 'Sambungkan formulir & aplikasi lain, riwayat kiriman',
  '/proyek': 'Penawaran, proyek, milestone, tugas tim',
};
const baseOf = (h) => '/' + (h.split('?')[0].split('/')[1] || '');
export const subOf = (h) => SUB[h] || (h.startsWith('/catatan/') ? 'Daftar, tambah, dan ubah status' : '');
// Ikon kelompok (dipakai NavIcon). Kelompok jenis data Business Builder memakai ikon catatan.
export const groupIcon = (k) => (G[k] ? G[k][2] : '/catatan');
export const GROUP_ICON = new Proxy({}, { get: (_, k) => groupIcon(String(k)) });

const navCfg = (kos) => kos?.exp?.nav || {};

// Struktur lengkap: [bagian, judul, [[kunci, nama, keterangan, item[]]]] — sebelum/ sesudah pengaturan pemilik.
// opts.all = sertakan menu yang disembunyikan (kelompok "Menu disembunyikan"); dipakai Modul Bisnis, pencarian & breadcrumb.
export function sectionsFor(kos, opts = {}) {
  const tabs = tabsFor(kos);
  const home = homeOf(kos);
  const cfg = navCfg(kos);
  const hidden = new Set(cfg.hidden || []);
  const used = new Set([home]);
  const top = tabsFor(kos).find(([h]) => h === PINNED_TOP[1]);
  if (top) used.add(top[0]);
  // urutan mengikuti profil (bukan urutan tab mesin), tiap menu hanya sekali
  const take = (paths) => paths.flatMap((p) => tabs.filter(([h]) => !used.has(h) && (h === p || h.startsWith(p + '/'))).map((t) => { used.add(t[0]); return t; }));
  const secs = PROFILES[profileKey(kos)].map(([sk, title, groups]) => [sk, title, groups.flatMap(([gk, paths]) => {
    if (gk === '@bb') {
      // Business Builder: setiap jenis data aktif (Proyek, RAB, Material, …) jadi menu sendiri
      const items = take(paths);
      if (items.length <= 1) return items.length ? [['work', G.work[0], G.work[1], items]] : [];
      return items.map(([h, l]) => [`bb_${h.split('/')[2] || 'catatan'}`, l, subOf(h), [[h, l]]]);
    }
    const items = take(paths);
    return items.length ? [[gk, G[gk][0], G[gk][1], items]] : [];
  })]);
  const rest = tabs.filter(([h]) => !used.has(h));
  if (rest.length) {
    const sys = secs.find(([k]) => k === 'sys');
    const setG = sys?.[2].find(([k]) => k === 'set');
    if (setG) setG[3].push(...rest); else if (sys) sys[2].push(['set', G.set[0], G.set[1], rest]);
  }
  // Analisis Bisnis = menu permanen di bawah Beranda (tidak ikut disembunyikan/diurutkan ulang)
  if (top && secs.length) secs[0][2].unshift([PINNED_TOP[0], G.bi[0], G.bi[1], [[top[0], G.bi[0]]]]);
  // Pengaturan pemilik: sembunyikan menu & urutan kelompok
  const hid = [];
  const order = cfg.order || [];
  const out = secs.map(([sk, title, groups]) => {
    let gs = groups.map(([k, n, d, items]) => [k, n, d, k === PINNED_TOP[0] ? items : items.filter((t) => { if (hidden.has(t[0])) { hid.push(t); return false; } return true; })]).filter(([, , , items]) => items.length);
    if (order.length) gs = [...gs].sort((a, b) => { if (a[0] === PINNED_TOP[0]) return -1; if (b[0] === PINNED_TOP[0]) return 1; const i = order.indexOf(a[0]), j = order.indexOf(b[0]); return (i < 0 ? 999 : i) - (j < 0 ? 999 : j); });
    return [sk, title, gs];
  });
  if (opts.all && hid.length) {
    const sys = out.find(([k]) => k === 'sys') || (out.push(['sys', 'Sistem', []]), out[out.length - 1]);
    sys[2].push(['hid', G.hid[0], G.hid[1], hid]);
  }
  return out.filter(([, , gs]) => gs.length);
}

export function groupsFor(kos, opts = {}) {
  return sectionsFor(kos, opts).flatMap(([, , gs]) => gs);
}
// Pintasan pemilik (maks. 8), hanya yang boleh dibuka
export function pinsFor(kos) {
  const tabs = tabsFor(kos);
  return (navCfg(kos).pins || []).map((p) => tabs.find(([h]) => h === p)).filter(Boolean);
}

// Halaman laporan utama sesuai jenis bisnis (bila peran boleh melihatnya)
export function reportOf(kos) {
  const tabs = tabsFor(kos);
  const want = { properti: '/laporan', retail: '/laporan-toko', jasa: '/laporan-jasa', kustom: '/laporan-kustom' }[kos?.business_type] || '/laporan';
  return tabs.find(([h]) => h === want) || null;
}

// Menu bawah slot ke-2 = menu utama kontekstual (§13.1): retail Transaksi, kos Kamar, laundry/kuliner Pesanan, kustom jenis data utama.
// Pemilik bisa menggantinya (nav.main). Tidak ada yang cocok/ boleh → "Menu" (daftar semua modul).
const SHORT = { '/proyek': 'Proyek', '/penjualan': 'Transaksi', '/kasir': 'Kasir', '/kamar': 'Kamar', '/tagihan': 'Tagihan', '/pesanan': 'Pesanan', '/barang': 'Stok', '/kas': 'Kas', '/penghuni': 'Penghuni', '/pembayaran': 'Bayar', '/dapur': 'Dapur', '/meja': 'Meja', '/kontak': 'Kontak', '/belanja': 'Belanja', '/grosir': 'Grosir' };
const MAIN = { retail: ['/penjualan', '/kasir', '/barang'], properti: ['/kamar', '/tagihan', '/penghuni'], jasa: ['/pesanan'], kuliner: ['/pesanan', '/dapur'], kustom: [] };
// Bisnis event/kreatif/kontraktor yang memakai modul Proyek: menu utama = Proyek
const PROJECT_CATS = ['event', 'media', 'konstruksi'];
const shortLabel = (h, l) => SHORT[h] || (l.length > 10 ? l.split(' ')[0] : l);
export function mainTabOf(kos) {
  const tabs = tabsFor(kos);
  const home = homeOf(kos);
  const ok = (h) => h && h !== home && tabs.find(([x]) => x === h);
  const { main: want, hidden = [] } = navCfg(kos);
  let t = ok(want);
  if (!t) {
    const base = profileKey(kos) === 'kustom' ? tabs.filter(([h]) => h.startsWith('/catatan')).map(([h]) => h) : MAIN[profileKey(kos)];
    const list = PROJECT_CATS.includes(kos?.category_code) ? ['/proyek', ...base] : base;
    for (const h of list) { t = !hidden.includes(h) && ok(h); if (t) break; }
  }
  if (!t || isDraft(kos)) return ['/operasional', 'Menu', '/layers'];
  return [t[0], shortLabel(t[0], t[1]), t[0]];
}
// Slot ke-4: Laporan; bila peran tidak boleh, menu kerja lain peran itu (tidak sama dengan menu utama)
export function fourthTab(kos) {
  const r = reportOf(kos);
  const hidden = navCfg(kos).hidden || [];
  if (r && !hidden.includes(r[0])) return [r[0], 'Laporan', r[0]];
  const home = homeOf(kos);
  const main = mainTabOf(kos)[0];
  const t = tabsFor(kos).find(([h]) => h !== home && h !== main && h !== '/konfirmasi' && !hidden.includes(h));
  return t ? [t[0], shortLabel(t[0], t[1]), t[0]] : null;
}
// Kompatibel dengan pemanggil lama: [href, label, base]
export function quickActions(kos, path = '') {
  return quickFor(kos, path).map((a) => [a.href, a.label, a.base]);
}
export { typeOf, homeOf, canArea, moduleOn };

// Ikon garis untuk jenis bisnis (pengganti emoji di sidebar/topbar)
export function bizIcon(kos) {
  if (isKuliner(kos)) return '/dapur';
  return { properti: '/kamar', retail: '/penjualan', jasa: '/layanan', kustom: '/kerja' }[kos?.business_type] || '/bisnis';
}
// Nama halaman di luar daftar modul
const EXTRA = { '/akun': 'Akun & tampilan', '/bantuan': 'Bantuan', '/notifikasi': 'Notifikasi', '/operasional': 'Modul Bisnis', '/pengingat': 'Pengingat', '/admin': 'Admin PRASARA', '/kwitansi': 'Kwitansi', '/nota': 'Nota', '/struk': 'Struk', '/dokumen': 'Dokumen', '/label': 'Cetak label', '/buka': 'Membuka' };
// Breadcrumb: [[label, href|null], ...] — Beranda › Kelompok › Halaman
export function crumbsFor(kos, path) {
  const home = homeOf(kos);
  const root = [['Beranda', home]];
  if (!path || path === home) return [['Beranda', null]];
  const groups = groupsFor(kos, { all: true });
  let best = null;
  for (const [, gname, , items] of groups) for (const [h, l] of items) {
    const base = h.split('?')[0];
    if ((path === base || path.startsWith(base + '/')) && (!best || base.length > best[0].length)) best = [base, l, gname];
  }
  if (best) {
    const [base, l, gname] = best;
    const g = gname === l ? [] : [[gname, null]];
    return path === base ? [...root, ...g, [l, null]] : [...root, ...g, [l, base], ['Detail', null]];
  }
  const k = Object.keys(EXTRA).find((x) => path === x || path.startsWith(x + '/'));
  return [...root, [k ? EXTRA[k] : 'Halaman', null]];
}
// Untuk pratinjau (Pusat Konfirmasi & Pusat Pengalaman): ringkasan workspace yang akan didapat
export function workspacePreview(kos) {
  return {
    sections: sectionsFor(kos).map(([, title, gs]) => [title, gs.map(([, n, , items]) => (items.length === 1 ? items[0][1] : n))]),
    bottom: ['Beranda', mainTabOf(kos)[1], '+', fourthTab(kos)?.[1] || '—', 'Akun'],
    quick: quickFor(kos).map((a) => a.label),
  };
}
// setup_activate memakai persetujuan setup, sementara my_modules memuat snapshot modul saat ini.
export function setupWorkspacePreview(kos, items) {
  if (!Array.isArray(kos.modules)) return null;
  const decisions = items.filter((item) => item.kind === 'modul' && item.spec?.module);
  const optional = new Set(decisions.map((item) => item.spec.module));
  const approved = decisions.filter(({ status, spec }) =>
    status === 'approved' && (!spec.entitlement || hasFeature(kos, spec.entitlement))
  );
  const modules = [...kos.modules.filter((code) => !optional.has(code)), ...approved.map((item) => item.spec.module)];
  return workspacePreview({ ...kos, setup_status: 'active', modules });
}
export { baseOf };
