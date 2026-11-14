'use client';
import { useState } from 'react';
import Icon from '@/components/landing/Icon';
import Dash from './Dash';

const TABS = [
  { k: 'cc', ic: 'home', n: 'Command Center', h: 'Semua bisnis dalam satu layar.', p: 'Buka aplikasi, langsung terlihat apa yang perlu ditangani hari ini.',
    pts: ['Angka penting tiap bisnis', 'Daftar yang perlu ditindaklanjuti', 'Pindah bisnis tanpa keluar akun'],
    d: { title: 'Ringkasan semua bisnis', sub: 'Hari ini', on: 0, kpis: [['Uang masuk', 'Rp6,8 jt', '+8%'], ['Transaksi', '142'], ['Perlu tindakan', '5', '', 1]], chartTitle: 'Uang masuk 7 hari', line: [4, 5, 4, 6, 7, 6, 8], listTitle: 'Perlu perhatian', list: ['3 tagihan jatuh tempo', '2 barang hampir habis', '1 pesanan terlambat'] } },
  { k: 'trx', ic: 'receipt', n: 'Transaksi', h: 'Setiap penjualan tercatat saat terjadi.', p: 'Kasir, pesanan, dan tagihan — dengan pembayaran sebagian, retur, dan pembatalan beralasan.',
    pts: ['Tunai, transfer, kasbon, atau campuran', 'Struk cetak atau WhatsApp', 'Promo dihitung otomatis di Kasir'],
    d: { title: 'Penjualan', sub: 'Hari ini', on: 1, kpis: [['Penjualan', 'Rp3,4 jt', '+9%'], ['Transaksi', '86'], ['Rata-rata', 'Rp39.500']], chartTitle: 'Transaksi per jam', bars: [3, 5, 8, 6, 9, 12, 10, 7, 11, 14, 9, 6], listTitle: 'Terakhir', list: ['#0086 · Rp52.000', '#0085 · Rp18.500', '#0084 · Rp127.000'] } },
  { k: 'ops', ic: 'flow', n: 'Operasional', h: 'Pekerjaan terlihat ada di tahap mana.', p: 'Stok, tahap proses pesanan, antar-jemput, keluhan, dan perbaikan.',
    pts: ['Tahap proses bisa diatur sendiri', 'Petugas proses tidak melihat uang', 'Stok per lokasi dan kedaluwarsa'],
    d: { title: 'Proses pesanan', sub: 'Sekarang', on: 2, kpis: [['Antre', '6'], ['Dikerjakan', '11'], ['Siap', '7']], chartTitle: 'Pesanan per tahap', bars: [6, 5, 4, 3, 5, 7], listTitle: 'Lewat janji', list: ['#L-204 · 1 hari', '#L-198 · 3 jam'] } },
  { k: 'fin', ic: 'wallet', n: 'Keuangan', h: 'Jurnal tersusun sendiri dari transaksi.', p: 'Kas & bank, biaya, utang-piutang, laba rugi, neraca, dan arus kas.',
    pts: ['Tidak perlu input jurnal dua kali', 'Deposit & uang muka tidak dihitung pendapatan', 'Anggaran & rekonsiliasi bank (Bisnis/Pro)'],
    d: { title: 'Laba rugi', sub: 'November', on: 3, kpis: [['Pendapatan', 'Rp24,8 jt', '+12%'], ['Beban', 'Rp17,4 jt'], ['Laba', 'Rp7,4 jt', '+5%']], chartTitle: 'Laba 8 bulan', line: [4, 5, 5, 6, 5, 7, 7, 8], listTitle: 'Biaya terbesar', list: ['Belanja barang', 'Gaji karyawan', 'Listrik & air'] } },
  { k: 'cus', ic: 'users', n: 'Pelanggan', h: 'Kenal pelanggan dari catatannya, bukan ingatan.', p: 'Kontak, riwayat belanja, kasbon, batas kredit, dan prospek dari halaman bisnis.',
    pts: ['Riwayat transaksi per pelanggan', 'Kasbon & umur piutang', 'Prospek masuk dari halaman bisnis'],
    d: { title: 'Pelanggan', sub: 'Aktif', on: 4, kpis: [['Pelanggan', '312'], ['Baru bulan ini', '18', '+4'], ['Kasbon', 'Rp2,1 jt']], chartTitle: 'Pelanggan baru', bars: [8, 11, 9, 14, 12, 18], listTitle: 'Tindak lanjut', list: ['Bu Rina · prospek', 'Pak Dedi · kasbon', 'Toko Abadi · tempo'] } },
  { k: 'bi', ic: 'chart', n: 'Analisis Bisnis', h: 'Angka yang sama dengan pembukuan.', p: 'Tren pendapatan, beban, dan laba dibandingkan bulan sebelumnya.',
    pts: ['Bandingkan bulan ini dan bulan lalu', 'Tren 13 bulan & per akun (Bisnis/Pro)', 'Per lokasi untuk multi-cabang (Pro)'],
    d: { title: 'Analisis bisnis', sub: 'November', on: 5, kpis: [['Pendapatan', '+12%'], ['Beban', '+6%', '', 1], ['Margin', '29,8%']], chartTitle: 'Pendapatan 13 bulan', line: [9, 10, 10, 12, 11, 13, 14, 13, 15, 16, 16, 18, 20], listTitle: 'Temuan dari data', list: ['Laba naik 2 bulan berturut', 'Biaya listrik naik 9%'] } },
  { k: 'auto', ic: 'clock', n: 'Automasi', h: 'Pekerjaan berulang berjalan sendiri.', p: 'Tagihan terbit otomatis, pengingat, dan resep otomatisasi yang Anda nyalakan sendiri.',
    pts: ['Tagihan sewa terbit tiap bulan', 'Pengingat jatuh tempo & stok menipis', 'Resep otomatisasi (Bisnis/Pro)'],
    d: { title: 'Otomatisasi', sub: 'Aktif', nav: ['Ringkasan', 'Tagihan', 'Pengingat', 'Resep', 'Riwayat', 'Atur'], on: 3, kpis: [['Resep aktif', '4'], ['Jalan bulan ini', '37'], ['Gagal', '0']], chartTitle: 'Dijalankan per minggu', bars: [7, 9, 10, 11], listTitle: 'Terakhir jalan', list: ['Tagihan November terbit', 'Pengingat stok menipis', 'Ringkasan pagi terkirim'] } },
  { k: 'portal', ic: 'globe', n: 'Portal Bisnis', h: 'Halaman bisnis yang bisa menerima pesanan.', p: 'Tautan & QR untuk dibagikan; pelanggan memesan atau mendaftar, Anda yang mengonfirmasi. Termasuk di Paket Pro.',
    pts: ['Pesanan & pendaftaran online', 'QR per meja untuk kuliner', 'Pelanggan cek status sendiri'],
    d: { title: 'Halaman bisnis', sub: 'Terbit', nav: ['Ringkasan', 'Halaman', 'Permintaan', 'Foto', 'QR', 'Atur'], on: 2, kpis: [['Permintaan baru', '6'], ['Dikonfirmasi', '21'], ['Menunggu', '2']], chartTitle: 'Permintaan per hari', bars: [2, 4, 3, 5, 6, 4, 6], listTitle: 'Menunggu konfirmasi', list: ['Pesanan · Meja 4', 'Pendaftaran · Kamar 09'] } },
];

export default function Demo() {
  const [k, setK] = useState('cc');
  const t = TABS.find((x) => x.k === k);
  const pick = (id, e) => { setK(id); e.currentTarget.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' }); };
  return (
    <>
      <div className="cx-tabs" role="tablist" aria-label="Bagian demonstrasi">
        {TABS.map((x) => <button key={x.k} type="button" role="tab" aria-selected={x.k === k} aria-controls="cx-demo-pane" className={'cx-tab' + (x.k === k ? ' on' : '')} onClick={(e) => pick(x.k, e)}><Icon name={x.ic} size={18} />{x.n}</button>)}
      </div>
      <div className="cx-demo-grid" id="cx-demo-pane" role="tabpanel" aria-label={t.n}>
        <div className="cx-demo-pane" key={k}><Dash d={t.d} /></div>
        <div className="cx-demo-pane cx-demo-txt" key={k + 't'}>
          <h3>{t.h}</h3>
          <p>{t.p}</p>
          <ul style={{ marginTop: 14 }}>{t.pts.map((x, i) => <li key={x} style={{ '--i': i }}><Icon name="check" size={17} />{x}</li>)}</ul>
          <span className="cx-tagdemo">Ilustrasi demonstrasi · data contoh</span>
        </div>
      </div>
    </>
  );
}
