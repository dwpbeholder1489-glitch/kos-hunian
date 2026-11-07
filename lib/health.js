// Skor kesehatan pelanggan (0–100) — versi awal, dihitung dari sinyal yang benar-benar tercatat.
// Bobot blueprint: kelengkapan data 20, isi utama 20, aktivitas transaksi 25, penggunaan laporan 20, aktivitas terbaru 15.
// Penggunaan laporan BELUM dilacak, jadi skor dinormalkan dari 80 poin yang tersedia (ditandai jelas di tampilan).

export const HEALTH_CAT = [
  [80, 'Sehat', 'good'],
  [60, 'Perlu perhatian', 'gold'],
  [40, 'Berisiko', 'warn'],
  [0, 'Kritis', 'bad'],
];

export function health(c) {
  if (c.age_days < 3) return { score: null, label: 'Data belum cukup', tone: 'void', parts: [], reasons: ['Baru mendaftar kurang dari 3 hari.'] };
  const retail = c.business_type === 'retail';
  const recency = c.idle_days <= 3 ? 15 : c.idle_days <= 7 ? 10 : c.idle_days <= 14 ? 5 : 0;
  const parts = c.business_type === 'kustom' ? [
    ['Business Builder diaktifkan', 20, c.builder_active ? 20 : 0],
    ['Catatan dibuat', 20, c.has_record ? 20 : 0],
    ['Catatan 30 hari terakhir', 25, c.record_30 ? 25 : c.has_record ? 12 : 0],
    ['Aktivitas terbaru', 15, recency],
  ] : c.business_type === 'jasa' ? [
    ['Harga layanan diisi', 20, c.services_priced ? 20 : 0],
    ['Pesanan diterima', 20, c.has_order ? 20 : 0],
    ['Pesanan 30 hari terakhir', 25, c.order_30 ? 25 : c.has_done ? 12 : 0],
    ['Aktivitas terbaru', 15, recency],
  ] : retail ? [
    ['Barang terdaftar', 20, c.products >= 10 ? 20 : c.products > 0 ? 10 : 0],
    ['Belanja/stok dicatat', 20, c.has_purchase ? 20 : 0],
    ['Penjualan di kasir', 25, c.sale_30 ? 25 : c.has_sale ? 12 : 0],
    ['Aktivitas terbaru', 15, recency],
  ] : [
    ['Harga kamar diisi', 20, c.rooms_priced ? 20 : 0],
    ['Penghuni dimasukkan', 20, c.active_leases > 0 ? 20 : c.has_lease ? 10 : 0],
    ['Pembayaran dicatat', 25, c.pay_30 ? 25 : c.has_payment ? 12 : 0],
    ['Aktivitas terbaru', 15, recency],
  ];
  const max = parts.reduce((s, p) => s + p[1], 0);
  const got = parts.reduce((s, p) => s + p[2], 0);
  const score = Math.round((got / max) * 100);
  const [, label, tone] = HEALTH_CAT.find(([min]) => score >= min);
  return { score, label, tone, parts, reasons: churnReasons(c) };
}

// Alasan risiko + tindakan yang disarankan (pengguna tidak aktif ≠ berhenti berlangganan)
export function churnReasons(c) {
  const r = [];
  if (c.idle_days >= 30) r.push('Tidak ada aktivitas inti 30 hari — sapa dan tanyakan kendalanya.');
  else if (c.idle_days >= 14) r.push('Tidak ada aktivitas inti 14 hari — kirim pesan bantuan.');
  else if (c.idle_days >= 7) r.push('Tidak ada aktivitas inti 7 hari — pantau.');
  if (!c.paid && c.trial_left != null && c.trial_left >= 0 && c.trial_left <= 3) r.push(`Masa coba sisa ${c.trial_left} hari — jelaskan pilihan paket tanpa menekan.`);
  if (c.paid && c.paid_until) { const d = Math.round((new Date(c.paid_until) - new Date()) / 864e5); if (d <= 7) r.push(`Langganan berakhir ${d <= 0 ? 'hari ini' : `${d} hari lagi`} — ingatkan perpanjangan.`); }
  if (c.business_type === 'kustom' ? !c.builder_active : c.business_type === 'jasa' ? !c.services_priced : c.business_type === 'retail' ? c.products === 0 : !c.rooms_priced) r.push('Data awal belum diisi — tawarkan bantuan pengaturan.');
  return r;
}
