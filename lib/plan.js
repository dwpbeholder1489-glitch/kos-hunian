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
  gratis: { name: 'Gratis', price: 0, tagline: 'Untuk kos kecil dan mencoba' },
  standar: { name: 'Standar', price: 100000, tagline: 'Inti pengelolaan kos, tanpa batas kamar' },
  pro: { name: 'Pro', price: 150000, tagline: 'Untuk pemilik yang ingin serba otomatis' },
};

// fitur per paket; soon = belum tersedia
export const FEATURES = [
  { label: 'Kamar, penghuni & sewa', gratis: 'Maks 5 kamar terisi', standar: 'Tanpa batas', pro: 'Tanpa batas' },
  { label: 'Tagihan sewa otomatis', gratis: true, standar: true, pro: true },
  { label: 'Catat & verifikasi pembayaran', gratis: true, standar: true, pro: true },
  { label: 'Pengeluaran & dashboard', gratis: true, standar: true, pro: true },
  { label: 'Pengingat WhatsApp (manual)', gratis: true, standar: true, pro: true },
  { label: 'Laporan lengkap & tren 6 bulan', gratis: false, standar: true, pro: true },
  { label: 'Ekspor Excel & cetak PDF', gratis: false, standar: true, pro: true },
  { label: 'Kwitansi pembayaran PDF', gratis: false, standar: true, pro: true },
  { label: 'Pengingat jatuh tempo otomatis (email) & daftar tagih harian', gratis: false, standar: true, pro: true },
  { label: 'Portal penghuni + asisten AI 24 jam', gratis: false, standar: false, pro: true },
  { label: 'Asisten AI untuk pemilik (tanya laporan)', gratis: false, standar: false, pro: true, soon: true },
  { label: 'Pengingat WhatsApp otomatis', gratis: false, standar: false, pro: true, soon: true },
  { label: 'Akun penjaga / pengelola', gratis: false, standar: false, pro: true, soon: true },
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
