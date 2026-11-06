// Template balasan cepat untuk admin. {nama_kos} dan {email} diganti otomatis; teks tetap bisa diubah sebelum dikirim.
export const ADMIN_TEMPLATES = [
  ['sambutan', 'Sambutan pelanggan baru', 'Halo, saya Dewo dari PRASARA. Terima kasih sudah mendaftar untuk {nama_kos}. Kalau ada yang membingungkan saat mengisi kamar atau penghuni, balas saja pesan ini, saya bantu. Panduan bergambar: {situs}/panduan'],
  ['kamar', 'Bantuan isi kamar', 'Halo, untuk {nama_kos}: buka menu Kamar, ketuk kamarnya, lalu Ubah data kamar. Isi harga sewa (boleh ditulis 750rb), lalu Simpan. Kalau mau, kirim daftar kamar dan harganya ke sini, saya bantu cek.'],
  ['penghuni', 'Bantuan masukkan penghuni', 'Halo, untuk memasukkan penghuni di {nama_kos}: menu Kamar → ketuk kamar Tersedia → Isi kamar ini. Untuk penghuni lama, isi "Tagihan pertama jatuh tempo" dengan jatuh tempo berikutnya yang belum dibayar, supaya bulan yang sudah lunas tidak ikut ditagih.'],
  ['bayar', 'Bantuan catat pembayaran', 'Halo, saat penghuni membayar: menu Tagihan → ketuk tagihannya → Catat pembayaran. Boleh dicatat sebagian. Untuk transfer, catat setelah uang masuk ke rekening.'],
  ['laporan', 'Bantuan lihat laporan', 'Halo, laba dan pengeluaran {nama_kos} bisa dilihat di menu Laporan, pilih bulannya dengan tombol ‹ ›. Ringkasan bulanan juga bisa dikirim otomatis ke email: ketuk lonceng → Pengaturan email.'],
  ['sapa', 'Sapa pelanggan tidak aktif', 'Halo, saya Dewo dari PRASARA. Data {nama_kos} tetap tersimpan aman. Kalau ada kendala atau ada yang kurang cocok dengan aplikasinya, saya ingin dengar supaya bisa diperbaiki.'],
  ['trial', 'Info masa coba', 'Halo, masa coba {nama_kos} di PRASARA akan berakhir. Setelahnya akun otomatis menjadi paket Gratis (maks 5 kamar terisi) dan semua data tetap tersimpan. Kalau ingin lanjut Standar/Pro, pilihannya ada di menu Langganan. Ada yang ingin ditanyakan dulu?'],
  ['keluhan', 'Tindak lanjut keluhan', 'Halo, terima kasih sudah memberi tahu masalahnya. Sudah saya cek dan perbaiki. Boleh dicoba lagi? Kalau masih ada kendala, balas pesan ini.'],
  ['terima_kasih', 'Terima kasih berlangganan', 'Halo, terima kasih sudah berlangganan PRASARA untuk {nama_kos}. Paket sudah aktif. Kalau butuh bantuan apa pun, hubungi saya di nomor ini.'],
];
import { SITE_HOST } from '@/lib/plan';
export const fillAdmin = (text, c) => text.replace(/\{situs\}/g, SITE_HOST).replace(/\{nama_kos\}/g, c.name || 'kos Anda').replace(/\{email\}/g, c.owner_email || '');
