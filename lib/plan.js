import { today } from '@/lib/format';

// ======== Pengaturan bisnis — ubah di sini kalau harga/kontak berubah ========
// Alamat situs: ganti lewat NEXT_PUBLIC_SITE_URL di Vercel saat domain baru (mis. prasara.id) aktif
export const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || 'https://kos-hunian.vercel.app').replace(/\/$/, '');
export const SITE_HOST = SITE_URL.replace(/^https?:\/\//, '');

export const BUSINESS = {
  whatsapp: '6281222206149',            // format internasional tanpa +
  whatsappDisplay: '0812-2220-6149',
  bank: { name: 'Bank Mandiri', account: '1410024083214', holder: 'DEWO PRAKOSO EFENDI' },
  qrisImage: '/qris.jpg',
  trialDays: 30,
  freeRoomLimit: 5,
};

export const PLANS = {
  gratis: { name: 'Gratis', price: 0, tagline: 'Untuk usaha kecil dan mencoba' },
  standar: { name: 'Standar', price: 100000, tagline: 'Inti pengelolaan bisnis, tanpa batas kamar' },
  pro: { name: 'Pro', price: 150000, tagline: 'Untuk pemilik yang ingin serba otomatis' },
};

// fitur per paket per bisnis; group = untuk jenis bisnis apa; soon = belum tersedia (jangan diklaim)
export const FEATURE_GROUPS = [['umum', 'Semua bisnis'], ['properti', 'Properti & Sewa'], ['retail', 'Retail & Grosir']];
export const FEATURES = [
  { group: 'umum', label: 'Satu akun untuk beberapa bisnis + ringkasan semua bisnis', gratis: true, standar: true, pro: true },
  { group: 'umum', label: 'Akun karyawan dengan hak akses per peran', gratis: '1 orang', standar: '3 orang', pro: 'Tanpa batas' },
  { group: 'umum', label: 'Panduan bergambar, pusat bantuan & tiket', gratis: true, standar: true, pro: true },
  { group: 'properti', label: 'Kamar, penghuni & sewa', gratis: 'Maks 5 kamar terisi', standar: 'Tanpa batas', pro: 'Tanpa batas' },
  { group: 'properti', label: 'Tagihan sewa otomatis', gratis: true, standar: true, pro: true },
  { group: 'properti', label: 'Catat & verifikasi pembayaran', gratis: true, standar: true, pro: true },
  { group: 'properti', label: 'Pengeluaran & dashboard', gratis: true, standar: true, pro: true },
  { group: 'properti', label: 'Pengingat WhatsApp (siap kirim, satu ketukan)', gratis: true, standar: true, pro: true },
  { group: 'properti', label: 'Laporan lengkap & tren 6 bulan', gratis: false, standar: true, pro: true },
  { group: 'properti', label: 'Ekspor Excel & cetak PDF', gratis: false, standar: true, pro: true },
  { group: 'properti', label: 'Kwitansi pembayaran PDF', gratis: false, standar: true, pro: true },
  { group: 'properti', label: 'Pengingat jatuh tempo otomatis (email) & daftar tagih harian', gratis: false, standar: true, pro: true },
  { group: 'properti', label: 'Portal penghuni (cek tagihan & kirim bukti transfer)', gratis: false, standar: false, pro: true },
  { group: 'properti', label: 'Asisten AI di portal penghuni', gratis: false, standar: false, pro: true, soon: true },
  { group: 'retail', label: 'Kasir eceran & grosir, multi-satuan, struk', gratis: true, standar: true, pro: true },
  { group: 'retail', label: 'Barcode (scan kamera) & cetak label sendiri', gratis: true, standar: true, pro: true },
  { group: 'retail', label: 'Stok, pesanan & terima barang dari supplier', gratis: true, standar: true, pro: true },
  { group: 'retail', label: 'Kas, kasbon pelanggan & utang supplier', gratis: true, standar: true, pro: true },
  { group: 'retail', label: 'Retur penjualan & shift kasir', gratis: true, standar: true, pro: true },
  { group: 'retail', label: 'Laporan laba, barang terlaris & tidak laku', gratis: true, standar: true, pro: true },
  { group: 'retail', label: 'Email pengingat toko setiap pagi', gratis: false, standar: true, pro: true },
  { group: 'umum', label: 'Asisten AI untuk pemilik (tanya kondisi bisnis)', gratis: false, standar: false, pro: true, soon: true },
  { group: 'umum', label: 'Pengingat WhatsApp otomatis', gratis: false, standar: false, pro: true, soon: true },
];

const RANK = { gratis: 0, standar: 1, pro: 2 };

// Paket yang berlaku sekarang untuk sebuah kos (sama dengan fungsi kos_plan di database)
export function planOf(kos) {
  if (!kos) return { plan: 'gratis', trial: false, until: null, daysLeft: null };
  if (kos.owner_is_admin) return { plan: 'pro', trial: false, until: null, daysLeft: null, owner: true };
  const t = today();
  const days = (d) => Math.round((Date.parse(d) - Date.parse(t)) / 864e5);
  if (kos.paid_until && kos.paid_until >= t && kos.plan !== 'gratis') return { plan: kos.plan, trial: false, until: kos.paid_until, daysLeft: days(kos.paid_until) };
  if (kos.trial_until && kos.trial_until >= t) return { plan: 'pro', trial: true, until: kos.trial_until, daysLeft: days(kos.trial_until) };
  return { plan: 'gratis', trial: false, until: null, daysLeft: null, expired: Boolean(kos.paid_until || kos.trial_until) };
}

export const hasPlan = (kos, need) => RANK[planOf(kos).plan] >= RANK[need];

export const waTo = (text) => `https://wa.me/${BUSINESS.whatsapp}?text=${encodeURIComponent(text)}`;
