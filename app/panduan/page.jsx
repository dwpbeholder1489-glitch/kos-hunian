import Link from 'next/link';
import LandingNav from '@/components/LandingNav';
import { BUSINESS } from '@/lib/plan';

export const metadata = {
  title: 'Panduan Pemakaian — Kos Hunian',
  description: 'Cara memakai Kos Hunian langkah demi langkah: kamar, penghuni, tagihan, pembayaran, pengeluaran, laporan, dan langganan.',
};

const wa = `https://wa.me/${BUSINESS.whatsapp}?text=${encodeURIComponent('Halo, saya butuh bantuan memakai aplikasi Kos Hunian.')}`;

const Std = () => <span className="chip gold">Standar</span>;

const SECTIONS = [
  ['mulai', '🚀', 'Memulai', (
    <>
      <ol>
        <li>Buka <b>kos-hunian.vercel.app</b> → <b>Coba gratis</b> → isi email & kata sandi → <b>Buat akun</b>.</li>
        <li>Buka email Anda, ketuk tautan konfirmasi dari Supabase.</li>
        <li>Masuk, lalu isi <b>nama kos</b>, <b>jumlah kamar</b>, dan <b>awalan kode</b> (mis. A → kamar A01, A02, …).</li>
        <li>Ikuti daftar <b>"Mulai di sini"</b> di Dashboard — 4 langkah yang tercentang otomatis.</li>
      </ol>
      <p className="tip">💡 Agar terasa seperti aplikasi: di Safari ketuk ikon <b>Bagikan</b> → <b>Tambah ke Layar Utama</b>. Di Chrome Android: menu <b>⋮</b> → <b>Tambahkan ke layar utama</b>.</p>
    </>
  )],
  ['kamar', '🏠', 'Kamar', (
    <>
      <p>Menu <b>Kamar</b> menampilkan semua kamar dengan warna status: <b>biru</b> tersedia, <b>hijau</b> terisi, <b>kuning</b> perbaikan, <b>abu</b> tidak disewakan.</p>
      <ol>
        <li>Ketuk kamar → <b>Ubah data kamar</b> → isi <b>harga sewa</b>, fasilitas, catatan → <b>Simpan</b>.</li>
        <li>Tambah kamar baru dengan tombol <b>+ Kamar</b>.</li>
        <li>Status <b>Terisi</b> diatur otomatis saat penghuni masuk atau keluar.</li>
      </ol>
    </>
  )],
  ['penghuni', '👤', 'Penghuni & sewa', (
    <>
      <ol>
        <li>Di menu <b>Kamar</b>, ketuk kamar yang tersedia → <b>Isi kamar ini</b>.</li>
        <li>Pilih <b>Penghuni baru</b> (isi nama & WhatsApp) atau penghuni yang sudah terdaftar.</li>
        <li>Isi <b>harga sewa</b>, <b>tanggal masuk</b>, dan <b>tagihan pertama jatuh tempo</b> → <b>Mulai sewa</b>.</li>
      </ol>
      <p className="tip">💡 <b>Penghuni lama</b> yang sudah tinggal sebelum memakai aplikasi: isi <b>tagihan pertama jatuh tempo</b> dengan tanggal jatuh tempo <b>berikutnya yang belum dibayar</b>, supaya bulan yang sudah lunas tidak ditagih lagi.</p>
      <p>Saat penghuni keluar: buka kamar atau menu <b>Penghuni</b> → <b>Akhiri sewa</b>. Kamar kembali tersedia dan tagihan bulan berikutnya dibatalkan otomatis.</p>
    </>
  )],
  ['tagihan', '🧾', 'Tagihan', (
    <>
      <p>Tagihan sewa <b>terbit otomatis</b> setiap bulan, 7 hari sebelum jatuh tempo — Anda tidak perlu membuatnya.</p>
      <ul>
        <li><b>Belum lunas</b>: semua yang masih ada sisa. <b>Menunggak</b>: sudah lewat jatuh tempo.</li>
        <li>Biaya di luar sewa (listrik, laundry, denda, deposit): <b>+ Tagihan tambahan</b>.</li>
        <li>Tagihan yang salah bisa dibatalkan dari detail tagihan → <b>Batalkan tagihan</b>.</li>
      </ul>
    </>
  )],
  ['bayar', '💰', 'Mencatat pembayaran', (
    <>
      <ol>
        <li>Menu <b>Tagihan</b> → ketuk tagihan → <b>Catat pembayaran</b>.</li>
        <li>Isi jumlah (bisa sebagian), tanggal, dan metode (tunai, transfer, QRIS).</li>
        <li>Centang <b>"Uang sudah saya terima"</b> jika uang sudah masuk. Jika belum dicek, kosongkan — pembayaran masuk ke daftar <b>menunggu verifikasi</b> di menu <b>Pembayaran</b>.</li>
      </ol>
      <p>Sisa tagihan, status lunas, dan tunggakan di Dashboard terhitung otomatis.</p>
    </>
  )],
  ['pengingat', '💬', 'Mengingatkan penghuni', (
    <>
      <ol>
        <li>Menu <b>Penghuni</b> → ketuk penghuni yang menunggak.</li>
        <li>Ketuk <b>Kirim pengingat via WhatsApp</b> — pesan berisi rincian tagihan sudah tersusun rapi, tinggal kirim.</li>
      </ol>
      <p className="tip">💡 Pastikan nomor WhatsApp penghuni sudah diisi di data penghuni.</p>
    </>
  )],
  ['pengeluaran', '📤', 'Pengeluaran', (
    <>
      <ol>
        <li>Menu <b>Pengeluaran</b> → <b>+ Catat</b>.</li>
        <li>Isi jumlah (boleh ditulis <b>350rb</b> atau <b>1,2jt</b>), tanggal, kategori, dan keterangan.</li>
      </ol>
      <p>Kategori bisa ditambah atau dihapus di <b>Pengaturan</b>. Jenis <b>Modal</b> (renovasi, beli kasur) tidak mengurangi laba operasional, tetapi mengurangi arus kas.</p>
    </>
  )],
  ['laporan', '📊', 'Laporan, ekspor & kwitansi', (
    <>
      <p>Menu <b>Laporan</b> menampilkan pendapatan, biaya, laba, dan arus kas per bulan. Geser bulan dengan tombol ‹ ›.</p>
      <ul>
        <li>Tren 6 bulan & pendapatan per kamar <Std /></li>
        <li><b>Ekspor Excel</b> laporan 12 bulan & transaksi bulanan <Std /></li>
        <li><b>Cetak / simpan PDF</b>: ketuk tombolnya, lalu pilih <b>Simpan sebagai PDF</b> <Std /></li>
        <li><b>Kwitansi</b>: Tagihan → ketuk tagihan → di riwayat pembayaran ketuk <b>🧾 Kwitansi</b> → cetak atau kirim via WhatsApp <Std /></li>
      </ul>
    </>
  )],
  ['langganan', '⭐', 'Paket & langganan', (
    <>
      <p>Kos baru mendapat <b>{BUSINESS.trialDays} hari semua fitur</b>. Setelah itu otomatis menjadi <b>Gratis</b> (maks {BUSINESS.freeRoomLimit} kamar terisi) — data tidak pernah hilang.</p>
      <ol>
        <li>Menu <b>Langganan</b> → pilih paket & durasi.</li>
        <li>Bayar lewat <b>QRIS</b> atau <b>transfer bank</b> sesuai nominal.</li>
        <li>Ketuk <b>Saya sudah bayar</b> → <b>Kirim bukti via WhatsApp</b>.</li>
        <li>Paket aktif setelah diperiksa, biasanya dalam 1×24 jam.</li>
      </ol>
    </>
  )],
  ['akun', '⚙️', 'Akun & beberapa kos', (
    <ul>
      <li>Punya lebih dari satu kos? <b>Pengaturan</b> → <b>+ Tambah kos lain</b>. Pindah kos lewat pilihan di pojok kanan atas.</li>
      <li>Ubah nama & alamat kos di <b>Pengaturan</b>.</li>
      <li>Keluar dari akun: <b>Pengaturan</b> → <b>Keluar</b>.</li>
    </ul>
  )],
];

export default function Panduan() {
  return (
    <div className="lp">
      <LandingNav />
      <div className="guide">
        <h1>Panduan pemakaian</h1>
        <p className="muted" style={{ margin: 0 }}>Ketuk topik untuk melihat langkahnya. Masih bingung? <a href={wa} target="_blank" rel="noreferrer">Tanya via WhatsApp</a>.</p>
        <nav className="toc" aria-label="Daftar topik">{SECTIONS.map(([id, ico, t]) => <a key={id} href={'#' + id}>{ico} {t}</a>)}</nav>
        {SECTIONS.map(([id, ico, title, body], i) => (
          <details key={id} id={id} open={i === 0}>
            <summary><span>{ico}</span>{title}</summary>
            {body}
          </details>
        ))}
        <div className="row" style={{ justifyContent: 'center', marginTop: 8 }}>
          <Link href="/beranda"><button className="primary">Buka aplikasi</button></Link>
        </div>
      </div>
    </div>
  );
}
