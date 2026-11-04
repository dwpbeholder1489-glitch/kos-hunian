// Pusat bantuan: jawaban singkat untuk pertanyaan yang paling sering muncul.
// step = nomor langkah di /panduan (perbarui bila penomoran panduan bergeser), href = menu yang dibuka.
export const HELP_CATS = [
  ['mulai', 'Memulai'],
  ['kamar', 'Kamar & penghuni'],
  ['tagihan', 'Tagihan & pembayaran'],
  ['uang', 'Pengeluaran & laporan'],
  ['otomatis', 'Pengingat & portal'],
  ['akun', 'Akun & langganan'],
];

export const HELP = [
  { id: 'urutan', cat: 'mulai', q: 'Saya baru daftar, mulai dari mana?', href: '/beranda', step: 1,
    a: ['Isi harga sewa setiap kamar di menu Kamar.', 'Masukkan penghuni yang sudah tinggal (Kamar → ketuk kamar kosong → Isi kamar ini).', 'Tagihan sewa terbit otomatis. Catat pembayaran saat uang masuk.', 'Catat pengeluaran kos di menu Pengeluaran.'],
    tip: 'Daftar "Mulai di sini" di Dashboard mencentang langkah ini otomatis.' },
  { id: 'harga-kamar', cat: 'kamar', q: 'Cara mengisi harga dan data kamar', href: '/kamar', step: 3,
    a: ['Buka Kamar, ketuk kamar yang ingin diubah.', 'Ketuk Ubah data kamar.', 'Isi Harga sewa / bulan (boleh 750rb atau 750.000), fasilitas, dan status.', 'Tekan Simpan.'],
    tip: 'Status Terisi berubah sendiri saat penghuni masuk.' },
  { id: 'tambah-kamar', cat: 'kamar', q: 'Cara menambah atau menghapus kamar', href: '/kamar', step: 3,
    a: ['Buka Kamar, tekan + Kamar di kanan atas.', 'Isi kode kamar (misalnya A11) dan harga, lalu Simpan.', 'Untuk menghapus: ketuk kamar → Ubah data kamar → Hapus.'],
    tip: 'Kamar yang pernah disewa tidak bisa dihapus agar riwayatnya tetap ada. Ubah statusnya menjadi Tidak disewakan.' },
  { id: 'penghuni-baru', cat: 'kamar', q: 'Cara memasukkan penghuni', href: '/kamar', step: 4,
    a: ['Buka Kamar, ketuk kamar berstatus Tersedia.', 'Ketuk Isi kamar ini, pilih Penghuni baru.', 'Isi nama, nomor WhatsApp, harga sewa, tanggal masuk, dan tagihan pertama jatuh tempo.', 'Tekan Mulai sewa.'] },
  { id: 'penghuni-lama', cat: 'kamar', q: 'Penghuni sudah lama tinggal, tanggal tagihan pertama diisi apa?', href: '/kamar', step: 4,
    a: ['Isi "Tagihan pertama jatuh tempo" dengan jatuh tempo berikutnya yang belum dibayar.', 'Contoh: penghuni sudah bayar sampai Oktober dan jatuh tempo tiap tanggal 5 → isi 5 November.'],
    tip: 'Jika diisi tanggal masuk lama, bulan-bulan yang sudah lunas ikut ditagih.' },
  { id: 'keluar', cat: 'kamar', q: 'Penghuni pindah keluar, apa yang harus dilakukan?', href: '/penghuni', step: 13,
    a: ['Buka Penghuni, ketuk nama penghuni.', 'Tekan Akhiri sewa dan isi tanggal keluar.', 'Kamar kembali Tersedia dan tagihan bulan berikutnya dibatalkan otomatis.'] },
  { id: 'tagihan-otomatis', cat: 'tagihan', q: 'Kapan tagihan sewa muncul?', href: '/tagihan', step: 6,
    a: ['Tagihan sewa terbit otomatis 7 hari sebelum jatuh tempo.', 'Tidak perlu membuat tagihan sewa sendiri setiap bulan.'] },
  { id: 'catat-bayar', cat: 'tagihan', q: 'Cara mencatat pembayaran penghuni', href: '/tagihan', step: 7,
    a: ['Buka Tagihan, ketuk tagihan penghuni.', 'Tekan Catat pembayaran.', 'Isi jumlah (boleh sebagian), tanggal, dan cara bayar, lalu Simpan.'],
    tip: 'Untuk transfer atau QRIS, catat setelah uang benar-benar masuk ke rekening.' },
  { id: 'tagihan-tambahan', cat: 'tagihan', q: 'Cara menagih listrik, laundry, atau denda', href: '/tagihan', step: 10,
    a: ['Buka Tagihan, tekan + Tagihan tambahan.', 'Pilih penghuni, isi keterangan dan jumlah, lalu Simpan.'] },
  { id: 'salah-catat', cat: 'tagihan', q: 'Salah mencatat pembayaran, bagaimana membatalkannya?', href: '/pembayaran', step: 8,
    a: ['Buka Pembayaran, geser ke bulan pembayaran itu dengan tombol ‹ ›.', 'Tekan Batalkan di samping pembayaran yang salah. Tagihannya kembali belum lunas.', 'Catat ulang dengan jumlah yang benar.'] },
  { id: 'verifikasi', cat: 'tagihan', q: 'Penghuni mengirim bukti transfer, di mana melihatnya?', href: '/pembayaran', step: 8,
    a: ['Buka Pembayaran, lihat bagian Menunggu verifikasi.', 'Ketuk Lihat bukti dan cocokkan dengan mutasi rekening.', 'Tekan Uang sudah masuk, atau Tolak bila tidak cocok.'] },
  { id: 'kwitansi', cat: 'tagihan', q: 'Cara membuat kwitansi', href: '/tagihan', step: 17,
    a: ['Buka Tagihan, ketuk tagihan yang sudah dibayar.', 'Di riwayat pembayaran, tekan 🧾 Kwitansi.', 'Tekan Kirim via WhatsApp atau Cetak / PDF.'],
    tip: 'Kwitansi PDF tersedia di paket Standar.' },
  { id: 'pengeluaran', cat: 'uang', q: 'Cara mencatat pengeluaran dan gaji penjaga', href: '/pengeluaran', step: 11,
    a: ['Buka Pengeluaran, tab Biaya kos, tekan + Catat.', 'Isi jumlah, tanggal, dan kategori (termasuk Gaji pengelola / penjaga).', 'Tekan Simpan.'] },
  { id: 'prive', cat: 'uang', q: 'Uang kos saya pakai pribadi, dicatat di mana?', href: '/pengeluaran', step: 12,
    a: ['Buka Pengeluaran, pilih tab Diambil pemilik & lainnya.', 'Pilih jenis Diambil pemilik (prive), isi jumlah dan tanggal.'],
    tip: 'Prive bukan biaya kos, jadi tidak mengurangi laba, tetapi mengurangi kas.' },
  { id: 'laporan', cat: 'uang', q: 'Cara melihat laba dan mengunduh laporan', href: '/laporan', step: 15,
    a: ['Buka Laporan, pilih bulan dengan tombol ‹ ›.', 'Laba operasional = pendapatan − biaya operasional.', 'Paket Standar: ekspor Excel dan cetak PDF.'] },
  { id: 'pengingat', cat: 'otomatis', q: 'Bagaimana pengingat jatuh tempo bekerja?', href: '/pengaturan', step: 21,
    a: ['Setiap pagi sekitar pukul 07.00, daftar tagih dikirim ke email Anda (aktifkan di Pengaturan).', 'Di daftar itu ada tombol Kirim WA untuk tiap penghuni — pesannya sudah tersusun.', 'Penghuni yang mengisi email mendapat pengingat otomatis H-3, hari H, dan H+3.'] },
  { id: 'kirim-wa', cat: 'otomatis', q: 'Cara mengirim pengingat lewat WhatsApp', href: '/penghuni', step: 9,
    a: ['Buka Penghuni, ketuk nama penghuni.', 'Tekan Kirim pengingat via WhatsApp. WhatsApp terbuka dengan pesan siap kirim.', 'Kata-kata pesannya bisa diubah di Pengaturan → Teks pesan WhatsApp.'],
    tip: 'Isi nomor WhatsApp penghuni agar tombolnya muncul.' },
  { id: 'portal', cat: 'otomatis', q: 'Apa itu portal penghuni?', href: '/penghuni', step: 20,
    a: ['Halaman pribadi untuk tiap penghuni (paket Pro), tanpa perlu daftar.', 'Penghuni bisa melihat tagihan, cara bayar, peraturan, dan mengirim bukti transfer.', 'Kirim linknya dari Penghuni → ketuk nama → Kirim link via WhatsApp.'] },
  { id: 'qris', cat: 'otomatis', q: 'Cara memasang QRIS kos saya', href: '/pengaturan', step: 19,
    a: ['Buka Pengaturan, bagian Info untuk penghuni.', 'Unggah foto QRIS kos Anda, lalu Simpan.', 'QRIS tampil di portal penghuni.'],
    tip: 'Uji dengan satu pembayaran kecil setelah mengganti QRIS.' },
  { id: 'notifikasi', cat: 'otomatis', q: 'Bagaimana tahu ada yang perlu dikerjakan tanpa membuka semua menu?', href: '/notifikasi', step: 23,
    a: ['Lihat lonceng di kanan atas: angka merah = pembayaran menunggu diperiksa, tagihan telat, dan jatuh tempo hari ini.', 'Ketuk lonceng untuk daftar lengkapnya, lalu ketuk salah satu untuk membuka menunya.', 'Nyalakan ringkasan mingguan atau bulanan supaya kondisi kos dikirim ke email Anda.'] },
  { id: 'ringkasan', cat: 'otomatis', q: 'Cara menerima ringkasan keuangan lewat email', href: '/notifikasi', step: 23,
    a: ['Ketuk lonceng di kanan atas, lalu bagian Pengaturan email.', 'Centang Ringkasan mingguan (setiap Senin) dan/atau Ringkasan bulanan (setiap tanggal 1).', 'Tekan Kirim contoh ringkasan untuk melihat isinya.'],
    tip: 'Angkanya sama dengan menu Laporan, dihitung dari data yang Anda catat.' },
  { id: 'paket', cat: 'akun', q: 'Apa beda paket Gratis, Standar, dan Pro?', href: '/langganan', step: 18,
    a: ['Gratis: maksimal 5 kamar terisi.', 'Standar: kamar tanpa batas, laporan lengkap, ekspor, pengingat email otomatis.', 'Pro: semua fitur Standar + portal penghuni.', '30 hari pertama semua fitur bisa dicoba.'] },
  { id: 'bayar-langganan', cat: 'akun', q: 'Cara berlangganan', href: '/langganan', step: 18,
    a: ['Buka Langganan, pilih paket dan durasi.', 'Bayar lewat QRIS atau transfer sesuai nominal.', 'Tekan Saya sudah bayar dan kirim bukti via WhatsApp.', 'Paket aktif setelah pembayaran diperiksa, biasanya dalam 1×24 jam.'] },
  { id: 'data-aman', cat: 'akun', q: 'Apakah data saya aman dan bisa dibuka orang lain?', href: '/pengaturan', step: 2,
    a: ['Data tersimpan di server, bukan di HP, jadi tidak hilang saat ganti HP.', 'Setiap pemilik hanya bisa melihat data kosnya sendiri.', 'Masuk dari HP atau laptop mana pun dengan email dan kata sandi yang sama.'] },
  { id: 'email-arahan', cat: 'akun', q: 'Saya menerima email arahan dari Kos Hunian, bisa dihentikan?', href: '/pengaturan', step: 22,
    a: ['Email arahan dikirim selama masa coba, hanya untuk langkah yang belum Anda kerjakan, paling banyak satu email tiap 2 hari.', 'Untuk berhenti: ketuk "Berhenti terima email arahan" di bagian bawah email, atau matikan di Pengaturan.'] },
];

const norm = (s) => String(s || '').toLowerCase().normalize('NFKD').replace(/[^\w\s]/g, ' ');
export function searchHelp(query) {
  const words = norm(query).split(/\s+/).filter((w) => w.length > 1);
  if (!words.length) return HELP;
  return HELP
    .map((h) => {
      const title = norm(h.q), body = norm([...h.a, h.tip].join(' '));
      const score = words.reduce((s, w) => s + (title.includes(w) ? 3 : 0) + (body.includes(w) ? 1 : 0), 0);
      return [h, score];
    })
    .filter(([, s]) => s > 0)
    .sort((a, b) => b[1] - a[1])
    .map(([h]) => h);
}
