import { homeOf, tabsFor } from '@/lib/business';
import { contextualHelp, learningPathAllowed } from '@/lib/learning';

export const TRANSACTION_STAGES = ['Halaman transaksi', 'Produk, layanan, dan pelanggan', 'Praktik transaksi', 'Review dan penyimpanan', 'Status pembayaran', 'Hubungan antarmodul', 'Kesalahan dan koreksi', 'Evaluasi dan kelulusan'];

const GROUPS = [
  ['Dasar penggunaan', ['/operasional', '/konfirmasi', '/konfigurasi']],
  ['Pengelolaan bisnis', ['/builder', '/catatan', '/proyek', '/layanan', '/kamar']],
  ['Transaksi', ['/kasir', '/penjualan', '/grosir', '/pesanan', '/dapur', '/meja', '/tagihan', '/pembayaran']],
  ['Persediaan', ['/barang', '/mutasi', '/resep']],
  ['Pelanggan', ['/kontak', '/penghuni', '/crm']],
  ['Keuangan, piutang dan utang', ['/kas', '/pembukuan']],
  ['Pembelian dan pengeluaran', ['/belanja', '/pengeluaran']],
  ['Laporan', ['/laporan', '/laporan-jasa', '/laporan-toko', '/laporan-kustom', '/rekap', '/analisis']],
  ['Pengaturan dan pengguna', ['/pengaturan', '/karyawan', '/persetujuan', '/pusat-notifikasi']],
];

export function curriculum(kos) {
  const labels = new Map(tabsFor(kos));
  const home = homeOf(kos);
  const used = new Set();
  return GROUPS.flatMap(([category, paths], group) => (group === 0 ? [home, ...paths] : paths)
    .flatMap((path) => path === '/catatan' ? [...labels.keys()].filter((href) => href === path || href.startsWith(path + '/')) : [path])
    .filter((href) => !used.has(href) && learningPathAllowed(kos, href) && used.add(href))
    .map((href) => {
      const help = contextualHelp(kos, href, labels.get(href));
      return { id: href, href, title: labels.get(href) || help.title, category, help, difficulty: group >= 5 ? 'Menengah' : 'Dasar', minutes: Math.max(2, Math.ceil(help.steps.length / 2)) };
    }));
}

export const GLOSSARY = {
  Transaksi: 'Kejadian bisnis yang dicatat, misalnya penjualan atau pembayaran.',
  Subtotal: 'Jumlah nilai item sebelum diskon dan pungutan.',
  Total: 'Nilai akhir setelah potongan dan pungutan yang berlaku.',
  Diskon: 'Potongan nilai transaksi.',
  Pajak: 'Pungutan yang dihitung menurut konfigurasi dan ketentuan yang berlaku.',
  Kas: 'Uang yang tersedia atau dicatat sebagai penerimaan dan pengeluaran.',
  Piutang: 'Hak tagih atas nilai yang belum dibayar pelanggan.',
  Utang: 'Kewajiban bisnis yang belum dibayar.',
  'Pembayaran sebagian': 'Penerimaan yang lebih kecil dari total tagihan.',
  'Jatuh tempo': 'Tanggal terakhir suatu kewajiban harus dipenuhi.',
  Rekonsiliasi: 'Mencocokkan catatan dengan bukti, misalnya mutasi bank.',
  Persediaan: 'Barang atau bahan yang dipantau jumlahnya.',
  Margin: 'Bagian pendapatan yang tersisa setelah biaya yang digunakan dalam perhitungan.',
};

export function readiness(done, canPractice) {
  if (TRANSACTION_STAGES.every((_, i) => done.includes(i))) return 'Siap menggunakan fitur sesuai hak akses';
  if (canPractice && done.includes(2) && done.includes(3)) return 'Mampu melakukan simulasi';
  if (done.includes(0) && done.includes(1)) return 'Memahami dasar';
  return done.length ? 'Sedang belajar' : 'Belum mengenal sistem';
}

export function recoveryCases(track) {
  const cases = [
    ['Data item, jumlah, harga, atau pelanggan salah', 'Pilihan atau satuan tertukar. Total dan riwayat bisa keliru.', 'Bandingkan detail dengan pesanan dan bukti. Jika masih draf, edit sebelum menyimpan.', 'Periksa ulang total dan identitas. Jika sudah tercatat, minta pengelola meninjau koreksi resmi.'],
    ['Nominal atau pelunasan belum tercatat', 'Bukti belum diverifikasi atau pembayaran terhubung ke catatan lain. Sisa tagihan bisa salah.', 'Periksa nomor transaksi, riwayat pembayaran, dan mutasi. Catat pembayaran yang belum ada melalui menu berizin.', 'Cocokkan satu referensi pembayaran dan pastikan sisa turun sesuai uang masuk.'],
    ['Koneksi putus, simpan gagal, atau bukti belum tampil', 'Respons belum diterima. Mengulang tanpa pemeriksaan dapat menduplikasi catatan.', 'Periksa riwayat dan antrean jika tersedia sebelum mencoba kembali. Buka bukti dari transaksi yang sudah ada.', 'Pastikan nomor transaksi muncul satu kali. Hubungi bantuan jika status tetap tidak jelas.'],
    ['Pembatalan, pengembalian dana, atau transaksi ganda', 'Catatan sudah berdampak pada tagihan, kas, atau stok.', 'Bandingkan nomor dan bukti. Minta pengelola memeriksa tindakan pembalik resmi jika tersedia.', 'Verifikasi status, penerimaan, sisa tagihan, dan mutasi yang terkait. Ikuti persetujuan yang diminta PRASARA.'],
  ];
  if (track.related.some(({ href }) => href === '/barang') || track.id === 'retail') cases.push(['Stok tidak mencukupi', 'Lokasi atau satuan berbeda. Stok tidak cukup untuk jumlah yang diminta.', 'Periksa lokasi dan satuan sebelum menyelesaikan penjualan. Kurangi jumlah atau minta staf gudang memeriksa persediaan.', 'Cocokkan jumlah tersedia dan jangan memaksa penyelesaian bila aturan stok menolak.']);
  return cases;
}

export const PRACTICE_TASKS = [
  { id: 'product', path: '/barang', title: 'Siapkan produk DEMO', prompt: 'Tambahkan barang satuan yang akan dijual per buah. Siapkan stok 8 buah.', fields: [['name', 'Nama barang'], ['unit', 'Satuan'], ['quantity', 'Stok']], check: ({ name, unit, quantity }) => Boolean(name?.trim() && unit?.trim().toLowerCase() === 'pcs' && Number(quantity) === 8), hint: 'Isi nama, satuan pcs, dan stok 8. Satuan menentukan cara kuantitas dihitung.' },
  { id: 'customer', path: '/kontak', title: 'Tambahkan pelanggan DEMO', prompt: 'Catat Pelanggan Demo sebagai pembeli. Ketik nama contoh dan jenis kontak.', fields: [['name', 'Nama contoh'], ['type', 'Jenis kontak']], check: ({ name, type }) => name?.trim().toLowerCase() === 'pelanggan demo' && type?.trim().toLowerCase() === 'pelanggan', hint: 'Gunakan nama Pelanggan Demo dan jenis pelanggan. Hindari informasi pribadi.' },
  { id: 'expense', path: '/pengeluaran', title: 'Hitung pengeluaran DEMO', prompt: 'Biaya kebersihan Rp75.000 dibayar dari kas Rp300.000. Berapa sisa kas?', fields: [['amount', 'Sisa kas rupiah']], check: ({ amount }) => Number(amount) === 225000, hint: 'Kurangi saldo awal Rp300.000 dengan biaya Rp75.000.' },
  { id: 'report', path: '/analisis', title: 'Baca ringkasan DEMO', prompt: 'Nilai penjualan Rp500.000 dan uang masuk Rp300.000. Masukkan penerimaan dan sisa tagihan.', fields: [['received', 'Penerimaan rupiah'], ['balance', 'Sisa tagihan rupiah']], check: ({ received, balance }) => Number(received) === 300000 && Number(balance) === 200000, hint: 'Uang masuk adalah penerimaan. Sisa tagihan adalah Rp500.000 dikurangi Rp300.000.' },
];
