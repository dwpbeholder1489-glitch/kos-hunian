// Quick Action Registry (Adaptive Business Experience §13). SATU daftar untuk semua jenis bisnis.
// Setiap aksi: id stabil, label, href, base (menu induk → dicek tabsFor: jenis bisnis, peran, modul aktif), engines,
// when(ctx) = relevansi Business DNA, pages = halaman yang membuatnya diprioritaskan, optional = tidak tampil bawaan
// (pemilik bisa menampilkannya di Pusat Pengalaman), area = izin tambahan.
// Server tetap penentu akhir: formulir di halaman tujuan memanggil RPC yang memeriksa izin & paket.
import { tabsFor, isDraft, isKuliner, canArea } from '@/lib/business';
import { termsFor } from '@/lib/propertyTerms';
const T = (kos) => termsFor(kos);

const has = (d, dim, ...codes) => codes.some((c) => (d?.[dim] || []).includes(c));
const laundry = (kos) => kos?.template_code === 'laundry' || kos?.category_code === 'laundry';

export const QUICK = [
  // Retail & grosir
  { id: 'pos', label: 'Penjualan baru (kasir)', href: '/kasir', base: '/kasir', engines: ['retail'], pages: ['/kasir', '/penjualan', '/toko'] },
  { id: 'wholesale', label: 'Pesanan grosir', href: '/grosir?baru=1', base: '/grosir', engines: ['retail'], pages: ['/grosir'],
    when: ({ dna }) => has(dna, 'models', 'wholesale', 'distribution') || has(dna, 'caps', 'uses_customer_debt') },
  { id: 'product_new', label: 'Tambah produk', href: '/barang?baru=1', base: '/barang', engines: ['retail'], pages: ['/barang', '/mutasi'] },
  { id: 'consign', label: 'Terima barang titipan', href: '/konsinyasi?baru=1', base: '/konsinyasi', engines: ['retail'], pages: ['/konsinyasi'],
    when: ({ dna }) => has(dna, 'caps', 'uses_consignment'), optional: true },
  { id: 'warranty', label: 'Cek garansi', href: '/garansi', base: '/garansi', engines: ['retail'], pages: ['/garansi', '/penjualan'], optional: true },
  { id: 'promo_new', label: 'Buat promo', href: '/promo?baru=1', base: '/promo', engines: ['retail'], pages: ['/promo'], optional: true },
  // Jasa, laundry, kuliner
  { id: 'order_new', label: ({ kos }) => (isKuliner(kos) ? 'Pesanan baru (kasir)' : laundry(kos) ? 'Penerimaan cucian' : 'Terima pesanan'),
    href: '/pesanan?baru=1', base: '/pesanan', engines: ['jasa'], area: 'sell', pages: ['/pesanan', '/jasa', '/dapur'] },
  { id: 'order_status', label: 'Perbarui status pesanan', href: '/pesanan', base: '/pesanan', engines: ['jasa'], pages: ['/pesanan', '/jasa'],
    when: ({ kos }) => !isKuliner(kos) },
  { id: 'table', label: 'Meja & tagihan', href: '/meja', base: '/meja', engines: ['jasa'], pages: ['/meja', '/dapur'], when: ({ kos }) => isKuliner(kos) },
  { id: 'pickup', label: 'Antar jemput', href: '/antar', base: '/antar', engines: ['jasa'], pages: ['/antar'],
    when: ({ kos, dna }) => !isKuliner(kos) && has(dna, 'caps', 'uses_delivery') },
  { id: 'service_new', label: ({ kos }) => (isKuliner(kos) ? 'Tambah menu' : 'Tambah layanan'), href: '/layanan?baru=1', base: '/layanan', engines: ['jasa'], pages: ['/layanan'] },
  { id: 'ingredient_new', label: ({ kos }) => (isKuliner(kos) ? 'Tambah bahan baku' : 'Tambah bahan operasional'), href: '/barang?baru=1', base: '/barang', engines: ['jasa'],
    pages: ['/barang', '/resep'], when: ({ kos, dna }) => isKuliner(kos) || has(dna, 'caps', 'uses_inventory', 'uses_ingredients') },
  { id: 'purchase', label: 'Pembelian / restok', href: '/belanja?baru=1', base: '/belanja', engines: ['retail', 'jasa'], pages: ['/belanja', '/barang', '/resep'],
    when: ({ kos, dna }) => kos.business_type === 'retail' || has(dna, 'caps', 'uses_suppliers', 'uses_ingredients') },
  // Proyek (event, kreatif, produksi)
  { id: 'project_new', label: 'Proyek baru', href: '/proyek?baru=1', base: '/proyek', engines: ['jasa', 'kustom'], area: 'settings', pages: ['/proyek', '/kerja', '/jasa'] },
  // Properti & sewa
  { id: 'room_new', label: ({ kos }) => `Tambah ${T(kos).unit.toLowerCase()}`, href: '/kamar?baru=1', base: '/kamar', engines: ['properti'], pages: ['/kamar'] },
  { id: 'tenant_new', label: ({ kos }) => `Tambah ${T(kos).tenant.toLowerCase()}`, href: '/penghuni?baru=1', base: '/penghuni', engines: ['properti'], pages: ['/penghuni', '/kamar'] },
  { id: 'booking_new', label: ({ kos }) => `${T(kos).booking} ${T(kos).unit.toLowerCase()}`, href: '/booking?baru=1', base: '/booking', engines: ['properti'], pages: ['/booking'] },
  { id: 'bill_new', label: 'Buat tagihan', href: '/tagihan?baru=1', base: '/tagihan', engines: ['properti'], pages: ['/tagihan'] },
  { id: 'payment', label: 'Catat pembayaran', href: '/tagihan', base: '/tagihan', engines: ['properti'], pages: ['/pembayaran', '/tagihan'] },
  { id: 'complaint', label: 'Catat perawatan / keluhan', href: '/perbaikan?baru=1', base: '/perbaikan', engines: ['properti'], pages: ['/perbaikan', '/kamar'],
    when: ({ dna }) => has(dna, 'caps', 'uses_maintenance') },
  { id: 'inspection', label: ({ kos }) => `Periksa ${T(kos).unit.toLowerCase()} (masuk/keluar)`, href: '/inventaris?periksa=1', base: '/inventaris', engines: ['properti'], pages: ['/inventaris', '/kamar'], optional: true },
  { id: 'property_new', label: 'Tambah properti / lokasi', href: '/properti?tab=lokasi&baru=1', base: '/properti', engines: ['properti'], area: 'team', pages: ['/properti'], optional: true },
  // Keuangan & pelanggan (semua jenis bisnis)
  { id: 'expense', label: 'Catat pengeluaran', href: ({ kos }) => (kos.business_type === 'properti' ? '/pengeluaran?baru=1' : '/kas?baru=biaya'),
    base: ({ kos }) => (kos.business_type === 'properti' ? '/pengeluaran' : '/kas'), engines: ['retail', 'jasa', 'properti', 'kustom'], pages: ['/kas', '/pengeluaran', '/pembukuan', '/anggaran'] },
  { id: 'income', label: 'Catat pemasukan', href: '/kas?baru=masuk', base: '/kas', engines: ['retail', 'jasa', 'kustom'], pages: ['/kas', '/pembukuan'] },
  { id: 'customer_new', label: 'Tambah pelanggan', href: '/kontak?baru=1', base: '/kontak', engines: ['retail', 'jasa'], pages: ['/kontak', '/crm'] },
];

const val = (v, ctx) => (typeof v === 'function' ? v(ctx) : v);

// Aksi Business Builder (kustom): "<Jenis data> baru" per jenis data aktif (mis. Proyek, RAB, Material)
function builderActions(kos) {
  if (kos?.business_type !== 'kustom') return [];
  if (!kos?.bb?.active) return [{ id: 'bb', label: 'Catatan baru', href: '/catatan?baru=1', base: '/catatan', pages: ['/catatan', '/kerja'] }];
  const first = new Set(kos.bb.create.length ? kos.bb.create : kos.bb.menu.slice(0, 2).map(([k]) => k));
  return kos.bb.menu.map(([k, name]) => ({ id: `bb_${k}`.toLowerCase().replace(/[^a-z0-9_-]/g, '_').slice(0, 60), label: `${name} baru`, href: `/catatan/${k}?baru=1`, base: `/catatan/${k}`,
    pages: [`/catatan/${k}`, '/kerja'], optional: !first.has(k) }));
}

// Semua aksi yang BOLEH untuk bisnis & peran ini (sebelum pengaturan pemilik). Tidak relevan / tidak diizinkan = tidak ada.
export function quickCatalog(kos) {
  if (!kos || isDraft(kos) || kos.closed_at || kos.suspended_at) return [];
  const allowed = new Set(tabsFor(kos).map(([h]) => h));
  const ctx = { kos, dna: kos.dna || {} };
  const list = [...builderActions(kos).map((a) => ({ ...a, engines: ['kustom'] })), ...QUICK];
  return list.filter((a) => a.engines.includes(kos.business_type))
    .map((a) => ({ ...a, label: val(a.label, ctx), href: val(a.href, ctx), base: val(a.base, ctx), relevant: !a.when || Boolean(a.when(ctx)) }))
    .filter((a) => allowed.has(a.base) && (!a.area || canArea(kos, a.area)));
}

// Frekuensi pemakaian per perangkat (urutan "paling sering dipakai" bila pemilik belum mengatur urutan)
const USE_KEY = (id) => `prasara-qa-use-${id}`;
export function quickUsage(kosId) { try { return JSON.parse(localStorage.getItem(USE_KEY(kosId)) || '{}'); } catch { return {}; } }
export function quickUsed(kosId, id) {
  try { const u = quickUsage(kosId); u[id] = (u[id] || 0) + 1; localStorage.setItem(USE_KEY(kosId), JSON.stringify(u)); } catch {}
}

const baseOfPath = (p) => (p || '').split('?')[0];
// Isi panel (+): favorit pemilik → prioritas halaman saat ini → urutan pemilik / paling sering dipakai → urutan bawaan.
// Yang disembunyikan pemilik tidak tampil; aksi opsional tampil bila pemilik memilihnya atau sesuai halaman.
export function quickFor(kos, path = '', usage = {}) {
  const cfg = kos?.exp?.quick || {};
  const hidden = new Set(cfg.hidden || []);
  const order = cfg.order || [];
  const fav = (cfg.fav || []).filter((id) => !hidden.has(id));
  const here = baseOfPath(path);
  const onPage = (a) => (a.pages || []).some((p) => here === p || here.startsWith(p + '/'));
  const all = quickCatalog(kos).filter((a) => !hidden.has(a.id));
  const shown = all.filter((a) => fav.includes(a.id) || order.includes(a.id) || (onPage(a) && (a.relevant || a.optional)) || (a.relevant && !a.optional));
  const rank = (a) => {
    const f = fav.indexOf(a.id);
    if (f >= 0) return [0, f];
    if (onPage(a)) return [1, 0];
    const o = order.indexOf(a.id);
    if (o >= 0) return [2, o];
    return [3, -(usage[a.id] || 0)];
  };
  const idx = (a) => all.indexOf(a);
  return shown.sort((a, b) => { const x = rank(a), y = rank(b); return x[0] - y[0] || x[1] - y[1] || idx(a) - idx(b); })
    .map((a) => ({ ...a, fav: fav.includes(a.id), context: onPage(a) }));
}
