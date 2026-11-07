import { today } from '@/lib/format';

// ======== Pengaturan bisnis — ubah di sini kalau harga/kontak berubah ========
// Alamat situs: NEXT_PUBLIC_SITE_URL (isi di Vercel bila nanti memakai domain sendiri, mis. https://prasara.id) › alamat utama sekarang
export const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || 'https://prasara-id.vercel.app').replace(/\/$/, '');
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
export const FEATURE_GROUPS = [['umum', 'Semua bisnis'], ['properti', 'Properti & Sewa'], ['retail', 'Retail & Grosir'], ['jasa', 'Jasa & Laundry'], ['kustom', 'Business Builder']];
export const FEATURES = [
  { group: 'umum', label: 'Satu akun untuk beberapa bisnis + ringkasan semua bisnis', gratis: true, standar: true, pro: true },
  { group: 'umum', label: 'Setup otomatis per jenis usaha (15 kategori) + Pusat Konfirmasi pemilik', gratis: true, standar: true, pro: true },
  { group: 'umum', limit: 'karyawan', label: 'Akun karyawan dengan hak akses per peran', gratis: '1 orang', standar: '3 orang', pro: 'Tanpa batas' },
  { group: 'umum', label: 'Pembukuan otomatis: jurnal, buku besar, laba rugi & neraca per badan usaha', gratis: true, standar: true, pro: true },
  { group: 'umum', label: 'Prospek & tindak lanjut (CRM sederhana)', gratis: true, standar: true, pro: true },
  { group: 'umum', label: 'Halaman bisnis publik + formulir permintaan', gratis: true, standar: true, pro: true },
  { group: 'umum', label: 'Saran fitur berdasarkan data bisnis sendiri (bukan AI)', gratis: true, standar: true, pro: true },
  { group: 'umum', label: 'Unduh semua data (Excel & PDF) & tutup bisnis tanpa kehilangan data', gratis: true, standar: true, pro: true },
  { group: 'umum', label: 'Panduan bergambar, pusat bantuan & tiket', gratis: true, standar: true, pro: true },
  { group: 'umum', limit: 'lampiran_mb', label: 'Lampiran foto & PDF (nota, kerusakan, dokumen penghuni, foto pesanan/catatan)', gratis: '50 MB', standar: '500 MB', pro: '2 GB' },
  { group: 'properti', limit: 'kamar_terisi', label: 'Kamar, penghuni & sewa', gratis: 'Maks 5 kamar terisi', standar: 'Tanpa batas', pro: 'Tanpa batas' },
  { group: 'properti', label: 'Tagihan sewa otomatis', gratis: true, standar: true, pro: true },
  { group: 'properti', label: 'Catat & verifikasi pembayaran', gratis: true, standar: true, pro: true },
  { group: 'properti', label: 'Pengeluaran & dashboard', gratis: true, standar: true, pro: true },
  { group: 'properti', label: 'Pengingat WhatsApp (siap kirim, satu ketukan)', gratis: true, standar: true, pro: true },
  { group: 'properti', label: 'Booking kamar dengan uang tanda jadi (check-in, batal/hangus)', gratis: true, standar: true, pro: true },
  { group: 'properti', label: 'Deposit / uang jaminan penghuni (kembalikan, potong, bayar tagihan)', gratis: true, standar: true, pro: true },
  { group: 'properti', label: 'Keluhan & perbaikan per kamar, biaya masuk pengeluaran', gratis: true, standar: true, pro: true },
  { group: 'properti', label: 'Meteran listrik & air → tagihan tambahan otomatis', gratis: true, standar: true, pro: true },
  { group: 'properti', label: 'Penghuni melapor kerusakan lewat portal', gratis: false, standar: false, pro: true },
  { group: 'properti', code: 'laporan_lengkap', label: 'Laporan lengkap & tren 6 bulan', gratis: false, standar: true, pro: true },
  { group: 'properti', code: 'ekspor', label: 'Ekspor Excel & cetak PDF', gratis: false, standar: true, pro: true },
  { group: 'properti', code: 'kwitansi', label: 'Kwitansi pembayaran PDF', gratis: false, standar: true, pro: true },
  { group: 'properti', code: 'pengingat_email', label: 'Pengingat jatuh tempo otomatis (email) & daftar tagih harian', gratis: false, standar: true, pro: true },
  { group: 'properti', code: 'portal_penghuni', label: 'Portal penghuni (cek tagihan & kirim bukti transfer)', gratis: false, standar: false, pro: true },
  { group: 'properti', label: 'Asisten AI di portal penghuni', gratis: false, standar: false, pro: true, soon: true },
  { group: 'retail', label: 'Kasir eceran & grosir, multi-satuan, struk', gratis: true, standar: true, pro: true },
  { group: 'retail', label: 'Barcode (scan kamera) & cetak label sendiri', gratis: true, standar: true, pro: true },
  { group: 'retail', label: 'Stok, pesanan & terima barang dari supplier', gratis: true, standar: true, pro: true },
  { group: 'retail', label: 'Kas, kasbon pelanggan & utang supplier', gratis: true, standar: true, pro: true },
  { group: 'retail', label: 'Retur penjualan & shift kasir', gratis: true, standar: true, pro: true },
  { group: 'retail', label: 'Retur ke supplier (potong utang / uang kembali)', gratis: true, standar: true, pro: true },
  { group: 'retail', label: 'Stok & kas per lokasi (cabang & gudang), mutasi antar lokasi', gratis: true, standar: true, pro: true },
  { group: 'retail', label: 'Laporan laba, barang terlaris & tidak laku', gratis: true, standar: true, pro: true },
  { group: 'retail', code: 'email_toko', label: 'Email pengingat toko setiap pagi', gratis: false, standar: true, pro: true },
  { group: 'jasa', label: 'Pesanan per kg/item dengan harga minimal, DP/lunas, antar-jemput', gratis: true, standar: true, pro: true },
  { group: 'jasa', label: 'Antar jemput: wilayah & biaya, jadwal/kapasitas, status dijemput / dalam pengantaran / terkirim', gratis: true, standar: true, pro: true },
  { group: 'jasa', label: 'Tahap proses yang bisa diatur (cuci–kering–setrika–QC) & peran Petugas proses', gratis: true, standar: true, pro: true },
  { group: 'jasa', label: 'Nota cetak / WhatsApp, keluhan & cuci ulang, batal dengan persetujuan', gratis: true, standar: true, pro: true },
  { group: 'jasa', label: 'Bahan & stok, kas, laporan pendapatan & ketepatan waktu', gratis: true, standar: true, pro: true },
  { group: 'jasa', code: 'ekspor', label: 'Unduh laporan jasa ke Excel', gratis: false, standar: true, pro: true },
  { group: 'kustom', label: 'Bisnis kustom dari template (Bengkel, Salon) atau dari nol', gratis: true, standar: true, pro: true },
  { group: 'kustom', label: 'Custom field, status & alur kerja per peran, persetujuan, batas waktu', gratis: true, standar: true, pro: true },
  { group: 'kustom', label: 'Report Builder (jumlah/total/rata-rata per status, bulan, field)', gratis: true, standar: true, pro: true },
  { group: 'kustom', label: 'Uang masuk per status → Kas, Pembukuan, laporan keuangan', gratis: true, standar: true, pro: true },
  { group: 'kustom', code: 'ekspor', label: 'Unduh laporan kustom ke Excel', gratis: false, standar: true, pro: true },
  { group: 'kustom', label: 'Bangun bisnis dengan AI', gratis: false, standar: false, pro: true, soon: true },
  { group: 'umum', label: 'Isian tambahan (custom field) di Penghuni, Barang, Pesanan jasa, Kontak', gratis: true, standar: true, pro: true },
  { group: 'umum', label: 'Asisten AI untuk pemilik (tanya kondisi bisnis)', gratis: false, standar: false, pro: true, soon: true },
  { group: 'umum', label: 'Pengingat WhatsApp otomatis', gratis: false, standar: false, pro: true, soon: true },
];

const RANK = { gratis: 0, standar: 1, pro: 2 };

// Kode fitur & batas paket (sama dengan plan_feature_codes() di database). Diatur Super Admin di Management Center › Paket & harga.
export const FEATURE_CODES = {
  laporan_lengkap: 'Laporan lengkap & tren 6 bulan',
  ekspor: 'Ekspor Excel & cetak PDF',
  kwitansi: 'Kwitansi pembayaran PDF',
  pengingat_email: 'Pengingat jatuh tempo (email) & daftar tagih harian',
  portal_penghuni: 'Portal penghuni (cek tagihan & kirim bukti)',
  email_toko: 'Email pengingat toko setiap pagi',
};
export const LIMIT_CODES = { kamar_terisi: 'Kamar terisi', karyawan: 'Karyawan', lampiran_mb: 'Ruang lampiran (MB)' };

// Paket yang berlaku sekarang untuk sebuah kos (sama dengan fungsi kos_plan di database)
export function planOf(kos) {
  if (!kos) return { plan: 'gratis', trial: false, until: null, daysLeft: null };
  if (kos.owner_is_admin) return { plan: 'pro', name: 'Pro', trial: false, until: null, daysLeft: null, owner: true };
  const t = today();
  const days = (d) => Math.round((Date.parse(d) - Date.parse(t)) / 864e5);
  const e = kos.ent;
  if (e) {
    const name = e.name || PLANS[e.plan]?.name || e.plan;
    if (e.grace) return { plan: e.plan, name, trial: false, grace: true, until: e.grace_until, daysLeft: days(e.grace_until) };
    if (kos.paid_until && kos.paid_until >= t && e.plan === kos.plan) return { plan: e.plan, name, trial: false, until: kos.paid_until, daysLeft: days(kos.paid_until), next: e.next_plan ? { name: e.next_name, until: e.next_until } : null, cancel: e.cancel_at_end };
    if (e.next_plan && e.plan === e.next_plan && e.next_until >= t) return { plan: e.plan, name, trial: false, until: e.next_until, daysLeft: days(e.next_until), cancel: e.cancel_at_end };
    if (kos.trial_until && kos.trial_until >= t) return { plan: e.plan, name, trial: true, until: kos.trial_until, daysLeft: days(kos.trial_until) };
    return { plan: e.plan, name, trial: false, until: null, daysLeft: null, free: true, expired: Boolean(kos.paid_until || kos.trial_until) };
  }
  if (kos.paid_until && kos.paid_until >= t && kos.plan !== 'gratis') return { plan: kos.plan, trial: false, until: kos.paid_until, daysLeft: days(kos.paid_until) };
  if (kos.trial_until && kos.trial_until >= t) return { plan: 'pro', trial: true, until: kos.trial_until, daysLeft: days(kos.trial_until) };
  return { plan: 'gratis', trial: false, until: null, daysLeft: null, expired: Boolean(kos.paid_until || kos.trial_until) };
}

export const hasPlan = (kos, need) => RANK[planOf(kos).plan] >= RANK[need];
// Fitur paket: dari database (my_entitlements); cadangan aturan lama bila belum termuat
const OLD_NEED = { laporan_lengkap: 'standar', ekspor: 'standar', kwitansi: 'standar', pengingat_email: 'standar', email_toko: 'standar', portal_penghuni: 'pro' };
export const hasFeature = (kos, code) => (kos?.owner_is_admin ? true : kos?.ent ? (kos.ent.features || []).includes(code) : hasPlan(kos, OLD_NEED[code] || 'pro'));
export const limitOf = (kos, key) => (kos?.ent ? (kos.ent.limits?.[key] ?? null) : null);

export const waTo = (text) => `https://wa.me/${BUSINESS.whatsapp}?text=${encodeURIComponent(text)}`;

// Kolom tabel fitur dari paket di database (plans_public); cadangan: nilai tertulis di FEATURES
export function featureCell(f, plan) {
  if (!plan?.features) return f[plan?.key];
  if (f.code) return plan.features.includes(f.code);
  if (f.limit) {
    const n = plan.limits?.[f.limit];
    return n == null ? 'Tanpa batas' : f.limit === 'kamar_terisi' ? `Maks ${n} kamar terisi` : f.limit === 'lampiran_mb' ? (n >= 1000 && n % 1000 === 0 ? `${n / 1000} GB` : `${n} MB`) : `${n} orang`;
  }
  return f[plan.key] ?? (f.soon ? false : true);
}
