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
  trialDays: 14,                         // cadangan; nilai sebenarnya dari database (plans_public.trial_days)
  freeRoomLimit: 5,
};

// Cadangan bila database belum terbaca. Harga sebenarnya selalu dari database (plans_public / plan_quote).
export const PLANS = {
  gratis: { name: 'Gratis', price: 0, tagline: 'Untuk usaha kecil dan mencoba' },
  dasar: { name: 'Dasar', price: 49000, list_price: 69000, tagline: 'Usaha satu lokasi yang ingin rapi dan tercatat' },
  bisnis: { name: 'Bisnis', price: 99000, list_price: 139000, tagline: 'Bisnis berkembang dengan tim dan laporan lengkap' },
  pro: { name: 'Pro', price: 149000, list_price: 199000, tagline: 'Digitalisasi lebih luas: portal, tim besar, kapasitas besar', terms: [{ months: 12, price: 1072800, list_price: 1788000 }] },
  standar: { name: 'Standar', price: 100000, tagline: 'Paket lama (sudah digabung ke Bisnis)' },
};
export const PLAN_ORDER = ['gratis', 'dasar', 'bisnis', 'pro'];

// fitur per paket per bisnis; group = untuk jenis bisnis apa; soon = belum tersedia (jangan diklaim)
export const FEATURE_GROUPS = [['umum', 'Semua bisnis'], ['properti', 'Properti & Sewa'], ['retail', 'Retail & Grosir'], ['jasa', 'Jasa, Laundry & Kuliner'], ['kustom', 'Business Builder']];
export const FEATURES = [
  { group: 'umum', label: 'Satu akun untuk beberapa bisnis + ringkasan semua bisnis', gratis: true, dasar: true, bisnis: true, pro: true },
  { group: 'umum', label: 'Setup otomatis per jenis usaha (15 kategori) + Pusat Konfirmasi pemilik', gratis: true, dasar: true, bisnis: true, pro: true },
  { group: 'umum', limit: 'karyawan', label: 'Akun karyawan dengan hak akses per peran', gratis: '1 orang', dasar: '1 orang', bisnis: '5 orang', pro: '15 orang' },
  { group: 'umum', label: 'Pembukuan otomatis: jurnal, buku besar, laba rugi & neraca per badan usaha', gratis: true, dasar: true, bisnis: true, pro: true },
  { group: 'umum', label: 'Prospek & tindak lanjut (CRM sederhana)', gratis: true, dasar: true, bisnis: true, pro: true },
  { group: 'umum', label: 'Halaman bisnis publik + formulir permintaan', gratis: true, dasar: true, bisnis: true, pro: true },
  { group: 'umum', label: 'Saran fitur berdasarkan data bisnis sendiri', gratis: true, dasar: true, bisnis: true, pro: true },
  { group: 'umum', label: 'Unduh semua data (Excel & PDF) & tutup bisnis tanpa kehilangan data', gratis: true, dasar: true, bisnis: true, pro: true },
  { group: 'umum', label: 'Panduan bergambar, pusat bantuan & tiket', gratis: true, dasar: true, bisnis: true, pro: true },
  { group: 'umum', limit: 'lampiran_mb', label: 'Penyimpanan foto & lampiran (foto kamar/barang/layanan, cover & galeri, nota, kerusakan, dokumen)', gratis: '50 MB', dasar: '500 MB', bisnis: '2 GB', pro: '10 GB' },
  { group: 'properti', limit: 'kamar_terisi', label: 'Kamar, penghuni & sewa', gratis: 'Maks 5 kamar terisi', dasar: 'Tanpa batas', bisnis: 'Tanpa batas', pro: 'Tanpa batas' },
  { group: 'properti', label: 'Tagihan sewa otomatis', gratis: true, dasar: true, bisnis: true, pro: true },
  { group: 'properti', label: 'Catat & verifikasi pembayaran', gratis: true, dasar: true, bisnis: true, pro: true },
  { group: 'properti', label: 'Pengeluaran & dashboard', gratis: true, dasar: true, bisnis: true, pro: true },
  { group: 'properti', label: 'Pengingat WhatsApp (siap kirim, satu ketukan)', gratis: true, dasar: true, bisnis: true, pro: true },
  { group: 'properti', label: 'Booking kamar dengan uang tanda jadi (check-in, batal/hangus)', gratis: true, dasar: true, bisnis: true, pro: true },
  { group: 'properti', label: 'Deposit / uang jaminan penghuni (kembalikan, potong, bayar tagihan)', gratis: true, dasar: true, bisnis: true, pro: true },
  { group: 'properti', label: 'Keluhan & perbaikan per kamar, biaya masuk pengeluaran', gratis: true, dasar: true, bisnis: true, pro: true },
  { group: 'properti', label: 'Meteran listrik & air → tagihan tambahan otomatis', gratis: true, dasar: true, bisnis: true, pro: true },
  { group: 'properti', label: 'Penghuni melapor kerusakan lewat portal', gratis: false, dasar: false, bisnis: false, pro: true },
  { group: 'properti', code: 'laporan_lengkap', label: 'Laporan lengkap & tren 6 bulan', gratis: false, dasar: true, bisnis: true, pro: true },
  { group: 'properti', code: 'ekspor', label: 'Ekspor Excel & cetak PDF', gratis: false, dasar: true, bisnis: true, pro: true },
  { group: 'properti', code: 'kwitansi', label: 'Kwitansi pembayaran PDF', gratis: false, dasar: true, bisnis: true, pro: true },
  { group: 'properti', code: 'pengingat_email', label: 'Pengingat jatuh tempo otomatis (email) & daftar tagih harian', gratis: false, dasar: true, bisnis: true, pro: true },
  { group: 'properti', code: 'portal_penghuni', label: 'Portal penghuni (cek tagihan & kirim bukti transfer)', gratis: false, dasar: false, bisnis: false, pro: true },
  { group: 'retail', label: 'Kasir eceran & grosir, multi-satuan, struk', gratis: true, dasar: true, bisnis: true, pro: true },
  { group: 'retail', label: 'Barcode (scan kamera) & cetak label sendiri', gratis: true, dasar: true, bisnis: true, pro: true },
  { group: 'retail', label: 'Stok, pesanan & terima barang dari supplier', gratis: true, dasar: true, bisnis: true, pro: true },
  { group: 'retail', label: 'Kas, kasbon pelanggan & utang supplier', gratis: true, dasar: true, bisnis: true, pro: true },
  { group: 'retail', label: 'Retur penjualan & shift kasir', gratis: true, dasar: true, bisnis: true, pro: true },
  { group: 'retail', label: 'Retur ke supplier (potong utang / uang kembali)', gratis: true, dasar: true, bisnis: true, pro: true },
  { group: 'retail', label: 'Stok & kas per lokasi (cabang & gudang), mutasi antar lokasi', gratis: true, dasar: true, bisnis: true, pro: true },
  { group: 'retail', label: 'Laporan laba, barang terlaris & tidak laku', gratis: true, dasar: true, bisnis: true, pro: true },
  { group: 'retail', code: 'email_toko', label: 'Email pengingat toko setiap pagi', gratis: false, dasar: true, bisnis: true, pro: true },
  { group: 'jasa', label: 'Pesanan per kg/item dengan harga minimal, DP/lunas, antar-jemput', gratis: true, dasar: true, bisnis: true, pro: true },
  { group: 'jasa', label: 'Antar jemput: wilayah & biaya, jadwal/kapasitas, status dijemput / dalam pengantaran / terkirim', gratis: true, dasar: true, bisnis: true, pro: true },
  { group: 'jasa', label: 'Pesanan langsung dari halaman bisnis (dikonfirmasi pemilik) & cek status oleh pelanggan', gratis: true, dasar: true, bisnis: true, pro: true },
  { group: 'jasa', label: 'Tahap proses yang bisa diatur (cuci–kering–setrika–QC) & peran Petugas proses', gratis: true, dasar: true, bisnis: true, pro: true },
  { group: 'jasa', label: 'Nota cetak / WhatsApp, keluhan & cuci ulang, batal dengan persetujuan', gratis: true, dasar: true, bisnis: true, pro: true },
  { group: 'jasa', label: 'Bahan & stok, kas, laporan pendapatan & ketepatan waktu', gratis: true, dasar: true, bisnis: true, pro: true },
  { group: 'jasa', label: 'Kuliner: menu & harga, pesanan makan di tempat (meja) / bungkus / antar, layar dapur, QR per meja, tagihan per meja & split bill, reservasi meja', gratis: true, dasar: true, bisnis: true, pro: true },
  { group: 'jasa', code: 'ekspor', label: 'Unduh laporan jasa ke Excel', gratis: false, dasar: true, bisnis: true, pro: true },
  { group: 'kustom', label: 'Bisnis kustom dari template (bengkel, salon, kursus, rental, event, proyek, travel, produksi, pertanian, klinik, koperasi, ekspedisi) atau dari nol', gratis: true, dasar: true, bisnis: true, pro: true },
  { group: 'kustom', label: 'Custom field, status & alur kerja per peran, persetujuan, batas waktu', gratis: true, dasar: true, bisnis: true, pro: true },
  { group: 'kustom', label: 'Report Builder (jumlah/total/rata-rata per status, bulan, field)', gratis: true, dasar: true, bisnis: true, pro: true },
  { group: 'kustom', label: 'Uang masuk per status → Kas, Pembukuan, laporan keuangan', gratis: true, dasar: true, bisnis: true, pro: true },
  { group: 'kustom', code: 'ekspor', label: 'Unduh laporan kustom ke Excel', gratis: false, dasar: true, bisnis: true, pro: true },
  { group: 'umum', label: 'Isian tambahan (custom field) di Penghuni, Barang, Pesanan jasa, Kontak', gratis: true, dasar: true, bisnis: true, pro: true },
  { group: 'umum', label: 'Pengingat WhatsApp otomatis', gratis: false, dasar: false, bisnis: false, pro: true, soon: true },
];

const RANK = { gratis: 0, dasar: 1, bisnis: 2, standar: 2, pro: 3 };

// Kode fitur & batas paket (sama dengan plan_feature_codes() di database). Diatur Super Admin di Management Center › Paket & harga.
export const FEATURE_CODES = {
  laporan_lengkap: 'Laporan lengkap & tren 6 bulan',
  ekspor: 'Ekspor Excel & cetak PDF',
  kwitansi: 'Kwitansi pembayaran PDF',
  pengingat_email: 'Pengingat jatuh tempo (email) & daftar tagih harian',
  portal_penghuni: 'Portal penghuni (cek tagihan & kirim bukti)',
  email_toko: 'Email pengingat toko setiap pagi',
};
export const LIMIT_CODES = { kamar_terisi: 'Kamar terisi', karyawan: 'Karyawan', lampiran_mb: 'Ruang foto & lampiran (MB)' };

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
  if (kos.trial_until && kos.trial_until >= t) return { plan: 'dasar', trial: true, until: kos.trial_until, daysLeft: days(kos.trial_until) };
  return { plan: 'gratis', trial: false, until: null, daysLeft: null, expired: Boolean(kos.paid_until || kos.trial_until) };
}

export const hasPlan = (kos, need) => RANK[planOf(kos).plan] >= RANK[need];
// Fitur paket: dari database (my_entitlements); cadangan aturan lama bila belum termuat
const OLD_NEED = { laporan_lengkap: 'dasar', ekspor: 'dasar', kwitansi: 'dasar', pengingat_email: 'dasar', email_toko: 'dasar', portal_penghuni: 'pro' };
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

// Harga untuk tampilan: total satu pembelian (paket jangka panjang bila ada, kalau tidak harga bulanan × bulan)
export const termOf = (plan, months) => (plan?.terms || []).find((t) => Number(t.months) === Number(months)) || null;
export const totalOf = (plan, months) => { const t = termOf(plan, months); return t ? Number(t.price) : (Number(plan?.price) || 0) * months; };
export const savePct = (price, list) => (Number(list) > Number(price) ? Math.round((1 - Number(price) / Number(list)) * 100) : 0);
