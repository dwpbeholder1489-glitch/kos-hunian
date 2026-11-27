import { canArea, homeOf, isDraft, isKuliner, pathAllowed, roleOf, tabsFor } from '@/lib/business';
import { PAGE_HELP } from '@/lib/guide';
import { searchHelp } from '@/lib/help';

export const LEARNING_REVISION = 1;
export const STAGES = ['Mengenal alur kerja', 'Memahami data terkait', 'Praktik', 'Hubungan dengan modul lain', 'Evaluasi pemahaman'];

const TRACKS = {
  retail: { paths: ['/kasir'], subject: 'Penjualan', items: [['Beras 1 kg', 16500], ['Minyak goreng 1 liter', 24000]], related: ['/barang', '/kas', '/kontak', '/laporan-toko'], explanation: 'Penjualan menghubungkan barang, jumlah, dan cara bayar. Stok mengikuti barang yang terjual.' },
  laundry: { paths: ['/pesanan'], subject: 'Pesanan laundry', items: [['Laundry Reguler / kg', 24500], ['Laundry Express / kg', 32000]], related: ['/barang', '/kas', '/kontak', '/laporan-jasa'], explanation: 'Pesanan menghubungkan layanan, pelanggan, dan tahapan pengerjaan. Pembayaran sebelum pesanan diserahkan merupakan uang muka.' },
  jasa: { paths: ['/pesanan'], subject: 'Pesanan jasa', items: [['Servis reguler', 65000], ['Servis tambahan', 35000]], related: ['/layanan', '/kas', '/kontak', '/laporan-jasa'], explanation: 'Pesanan mencatat permintaan pelanggan, layanan, dan tahapan pengerjaan. Pendapatan diakui saat pesanan diserahkan.' },
  kuliner: { paths: ['/meja', '/pesanan'], subject: 'Pesanan kuliner', items: [['Nasi ayam', 28000], ['Es teh', 8000]], related: ['/dapur', '/kas', '/layanan', '/laporan-jasa'], explanation: 'Pesanan mencatat menu dan jumlah. Pesanan makan di tempat dapat dikaitkan dengan meja dan diteruskan ke dapur.' },
  properti: { paths: ['/tagihan', '/pembayaran'], subject: 'Pembayaran sewa', items: [['Tagihan sewa', 750000], ['Tagihan listrik', 85000]], related: ['/kamar', '/penghuni', '/pembayaran', '/laporan'], explanation: 'Pembayaran dicatat terhadap tagihan penghuni. Cocokkan bukti dengan mutasi rekening sebelum verifikasi.' },
  kustom: { paths: ['/kas'], subject: 'Pencatatan kas', items: [['Penerimaan jasa', 150000], ['Penerimaan tambahan', 35000]], related: ['/catatan', '/proyek', '/pembukuan', '/laporan-kustom'], explanation: 'Kas mencatat arus masuk dan keluar. Kaitkan catatan dengan bukti dan gunakan kategori yang sesuai.' },
};

const RELATIONS = {
  '/barang': 'Penjualan mengurangi stok. Untuk jasa, pemakaian bahan mengikuti konfigurasi layanan.',
  '/kas': 'Uang yang benar-benar diterima memengaruhi saldo kas.',
  '/kontak': 'Kontak membantu menelusuri transaksi pelanggan.',
  '/layanan': 'Layanan dan harga menjadi acuan saat membuat pesanan.',
  '/dapur': 'Pesanan diteruskan untuk diproses oleh dapur.',
  '/kamar': 'Kamar memberi konteks hunian untuk tagihan sewa.',
  '/penghuni': 'Tagihan terhubung dengan riwayat sewa penghuni.',
  '/pembayaran': 'Riwayat pembayaran menunjukkan penerimaan dan status verifikasi.',
  '/pembukuan': 'Catatan kas menjadi sumber jurnal sesuai jenis transaksi.',
  '/proyek': 'Periksa catatan proyek untuk memahami sumber penerimaan.',
  '/catatan': 'Gunakan catatan operasional sebagai konteks pemasukan.',
};

export function helpFor(path, name) {
  const keys = path.split('/').filter(Boolean);
  const match = keys.map((_, i) => keys.slice(0, i + 1).join('/')).reverse().find((key) => PAGE_HELP[key]);
  return PAGE_HELP[match] || { title: name || 'Halaman ini', steps: ['Kenali judul halaman dan pilihan yang tersedia.', 'Lihat label kolom atau tombol untuk mengetahui tindakan yang tersedia.'], warn: [] };
}

export function learningTrack(kos) {
  const id = isKuliner(kos) ? 'kuliner' : kos.business_type === 'jasa' && [kos.category_code, kos.template_code].includes('laundry') ? 'laundry' : kos.business_type || 'properti';
  const config = TRACKS[id] || TRACKS.kustom;
  const tabs = tabsFor(kos);
  const permitted = (path) => pathAllowed(kos, path);
  const path = config.paths.find(permitted);
  const canPractice = Boolean(path && !isDraft(kos) && !kos.closed_at && (kos.business_type !== 'jasa' || canArea(kos, 'sell')));
  const fallback = tabs.find(([href]) => href !== '/bisnis' && href !== homeOf(kos)) || tabs[0];
  const href = (canPractice ? path : fallback?.[0]) || '/operasional';
  const title = tabs.find(([h]) => h === href)?.[1];
  const help = helpFor(href, title);
  const related = (canPractice ? config.related.map((h) => tabs.find(([href]) => h === href)).filter(Boolean) : tabs.filter(([h]) => h !== href && h !== '/bisnis')).slice(0, 4)
    .map(([href, name]) => ({ href, name, text: canPractice ? RELATIONS[href] || 'Laporan merangkum hasil pencatatan sesuai periode.' : helpFor(href, name).steps[0] }));
  return { id: canPractice ? id : href, href, help, canPractice, related, items: config.items,
    subject: canPractice ? config.subject : title || help.title,
    explanation: canPractice ? config.explanation : help.steps[0],
    role: roleOf(kos) };
}

export function knowledgeFor(kos, query) {
  return searchHelp(query).filter((h) => pathAllowed(kos, h.href) && (h.href !== '/bisnis' || roleOf(kos) === 'pemilik'))
    .filter((h) => kos.business_type !== 'jasa' || canArea(kos, 'sell') || !['/pesanan', '/jasa', '/antar', '/dapur'].includes(h.href));
}

export function simulationTotals(items, quantities, method, amount) {
  const total = items.reduce((sum, [, price], i) => sum + price * (quantities[i] || 0), 0);
  const paid = method === 'lunas' ? total : method === 'belum' ? 0 : Number(amount);
  const valid = total > 0 && Number.isInteger(paid) && paid >= 0 && paid <= total
    && (method !== 'sebagian' || (paid > 0 && paid < total));
  return { total, paid, balance: total - paid, valid };
}

export function quizFor(track) {
  if (!track.canPractice) return [
    { question: 'Apa yang perlu diperiksa sebelum menggunakan sebuah modul?', options: ['Jenis bisnis, hak akses, dan status modul', 'Nama perangkat saja', 'Warna tema'], answer: 0, reason: 'PRASARA memilih menu yang sesuai dengan bisnis dan hak akses.' },
    { question: 'Di mana Anda bisa mengulang tutorial halaman?', options: ['Di laporan', 'Dengan tombol ? Panduan', 'Di riwayat transaksi'], answer: 1, reason: 'Tombol ? Panduan membuka tutorial sesuai halaman.' },
    { question: 'Bagaimana jika sebuah tindakan berada di luar tugas Anda?', options: ['Gunakan akun orang lain', 'Ubah data contoh', 'Hubungi pemilik untuk memeriksa akses'], answer: 2, reason: 'Pemilik dapat memeriksa peran dan pengaturan akses.' },
  ];
  return [
    { question: 'Total transaksi Rp500.000. Baru diterima Rp300.000. Berapa sisa pembayaran?', options: ['Rp300.000', 'Rp200.000', 'Rp500.000'], answer: 1, reason: 'Sisa pembayaran = Rp500.000 − Rp300.000.' },
    { question: 'Kapan transaksi latihan masuk ke laporan bisnis?', options: ['Setelah disimpan', 'Saat halaman dibuka ulang', 'Data demo tersimpan terpisah'], answer: 2, reason: 'Simulasi hanya mencatat penyelesaian latihan di peramban.' },
    { question: 'Sebelum menyetujui penerimaan uang, apa yang perlu diperiksa?', options: ['Nominal yang benar-benar diterima', 'Judul halaman', 'Jumlah materi'], answer: 0, reason: 'Cocokkan penerimaan dengan uang tunai atau mutasi rekening.' },
    { question: 'Apa arti metode pembayaran sebagian?', options: ['Belum ada pembayaran', 'Sebagian total diterima, masih ada sisa', 'Seluruh total diterima'], answer: 1, reason: 'Pada pembayaran sebagian, nominal yang diterima lebih dari nol dan kurang dari total.' },
    { question: 'Di mana Anda dapat memeriksa dampak ke area lain yang bisa diakses?', options: ['Menu Akun', 'Menu Keluar', 'Peta hubungan antarmodul'], answer: 2, reason: 'Peta menautkan modul terkait yang tersedia untuk bisnis dan peran Anda.' },
  ];
}
