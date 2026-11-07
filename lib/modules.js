// Profil bisnis & rekomendasi modul (blueprint 20.2). Rekomendasi selalu disertai alasan; pemilik yang memutuskan.
export const GROUPS = {
  retail_trading: 'Retail & Trading', property_rental: 'Property & Rental', services: 'Jasa', fnb_hospitality: 'F&B & Hospitality',
  project_event: 'Project & Event', manufacturing: 'Produksi', professional_admin: 'Profesional & Administrasi', distribution: 'Gudang & Distribusi', lainnya: 'Lainnya',
};
export const LEGAL_KIND = { perorangan: 'Perorangan', cv: 'CV', pt: 'PT', koperasi: 'Koperasi', yayasan: 'Yayasan', lainnya: 'Lainnya' };

// Pertanyaan karakteristik usaha. rec: modul yang disarankan bila jawabannya "ya"
export const PROFILE_Q = [
  { key: 'skala', label: 'Skala usaha', options: [['mikro', 'Mikro (dikelola sendiri/keluarga)'], ['kecil', 'Kecil (beberapa karyawan)'], ['menengah', 'Menengah']] },
  { key: 'karyawan', label: 'Ada karyawan yang ikut mencatat?', options: [['ya', 'Ya'], ['tidak', 'Tidak']], rec: { ya: ['u_karyawan'] } },
  { key: 'supplier', label: 'Belanja barang/bahan ke supplier/sales?', only: ['retail', 'jasa'], options: [['ya', 'Ya, rutin'], ['tidak', 'Tidak / jarang']], rec: { ya: ['r_belanja', 'r_kontak'] } },
  { key: 'kasbon', label: 'Ada pelanggan yang bayar belakangan (kasbon)?', only: 'retail', options: [['ya', 'Ya'], ['tidak', 'Tidak']], rec: { ya: ['r_kontak', 'r_pengingat'] } },
  { key: 'barcode', label: 'Pakai barcode / label harga?', only: 'retail', options: [['ya', 'Ya / ingin pakai'], ['tidak', 'Tidak']], rec: { ya: ['r_label'] } },
  { key: 'shift', label: 'Kasir bergantian / perlu hitung uang laci?', only: 'retail', options: [['ya', 'Ya'], ['tidak', 'Tidak']], rec: { ya: ['r_shift'] } },
  { key: 'stok', label: 'Ingin diingatkan stok menipis?', only: 'retail', options: [['ya', 'Ya'], ['tidak', 'Tidak']], rec: { ya: ['r_pengingat'] } },
  { key: 'bahan', label: 'Ingin mencatat stok bahan (deterjen, pewangi, plastik)?', only: 'jasa', options: [['ya', 'Ya'], ['tidak', 'Tidak']], rec: { ya: ['j_bahan'] } },
  { key: 'biaya', label: 'Ingin mencatat biaya (listrik, perbaikan, gaji)?', only: 'properti', options: [['ya', 'Ya'], ['tidak', 'Tidak']], rec: { ya: ['p_pengeluaran'] } },
  { key: 'ingatkan', label: 'Ingin diingatkan tagihan jatuh tempo?', only: 'properti', options: [['ya', 'Ya'], ['tidak', 'Tidak']], rec: { ya: ['p_pengingat'] } },
  { key: 'portal', label: 'Penghuni kirim bukti transfer sendiri?', only: 'properti', options: [['ya', 'Ya'], ['tidak', 'Tidak']], rec: { ya: ['p_portal'] } },
  { key: 'prospek', label: 'Sering ada calon pelanggan/penghuni yang perlu dihubungi lagi?', options: [['ya', 'Ya'], ['tidak', 'Tidak']], rec: { ya: ['u_crm', 'u_halaman'] } },
  { key: 'cabang', label: 'Jumlah lokasi/cabang', options: [['1', '1 lokasi'], ['2+', '2 atau lebih']] },
];

// Pertanyaan berlaku untuk jenis bisnis ini? (only: satu jenis atau daftar jenis)
export const qFor = (q, type) => !q.only || [].concat(q.only).includes(type);

// Modul yang disarankan + alasannya, dari jawaban profil
export function recommend(type, answers) {
  const out = {};
  for (const q of PROFILE_Q) {
    if (!qFor(q, type)) continue;
    const codes = q.rec?.[answers[q.key]];
    if (!codes) continue;
    for (const c of codes) (out[c] ||= []).push(`${q.label} → ${q.options.find(([v]) => v === answers[q.key])?.[1]}`);
  }
  return out; // { code: [alasan] }
}
