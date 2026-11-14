'use client';
import { useState } from 'react';
import Icon from '@/components/landing/Icon';
import Dash from './Dash';

// status: 'ada' = mesin bisnis khusus sudah tersedia; 'bb' = disusun lewat Business Builder / mesin yang ada (ditulis apa adanya)
const CATS = [
  { k: 'toko', ic: 'receipt', n: 'Toko & Retail', st: 'ada', tag: 'Tersedia', h: 'Kasir cepat, stok yang bisa dipercaya.',
    need: ['Jual eceran & grosir dari satu barang', 'Tahu stok per lokasi tanpa menghitung ulang', 'Kasbon dan utang supplier tercatat'],
    mod: ['Kasir & barcode', 'Stok multi-satuan', 'Belanja & supplier', 'Promo & bundling', 'Laporan laba'],
    flow: ['Jual di Kasir', 'Stok berkurang', 'Kas tercatat', 'Laba terlihat'],
    d: { title: 'Toko Sumber Rejeki', sub: 'Hari ini', nav: ['Ringkasan', 'Kasir', 'Barang', 'Belanja', 'Kas', 'Laporan'], kpis: [['Penjualan', 'Rp3,4 jt', '+9%'], ['Transaksi', '86'], ['Stok menipis', '4 barang', '', 1]], chartTitle: 'Penjualan per jam', bars: [3, 5, 8, 6, 9, 12, 10, 7, 11, 14, 9, 6], listTitle: 'Terlaris', list: ['Beras 5 kg', 'Minyak 1 L', 'Gula 1 kg'] } },
  { k: 'grosir', ic: 'box', n: 'Grosir & Distribusi', st: 'ada', tag: 'Tersedia · armada & rute dalam rencana', h: 'Dari penawaran sampai piutang tertagih.',
    need: ['Harga berbeda per pelanggan', 'Batas kredit dan tempo yang dijaga', 'Surat jalan dan faktur yang rapi'],
    mod: ['Penawaran & pesanan', 'Daftar harga', 'Batas kredit', 'Surat jalan → faktur', 'Umur piutang'],
    flow: ['Penawaran', 'Pesanan dikonfirmasi', 'Surat jalan', 'Faktur & piutang'],
    d: { title: 'Grosir Maju Bersama', sub: 'Bulan ini', nav: ['Ringkasan', 'Grosir', 'Barang', 'Mutasi', 'Piutang', 'Laporan'], on: 1, kpis: [['Pesanan', '42', '+6%'], ['Dikirim', '37'], ['Piutang', 'Rp18,2 jt']], chartTitle: 'Nilai pesanan', line: [12, 14, 13, 18, 17, 22, 21, 26], listTitle: 'Jatuh tempo', list: ['Toko Abadi · 3 hari', 'UD Sejahtera · 5 hari', 'Warung Bu Sri · 7 hari'] } },
  { k: 'laundry', ic: 'flow', n: 'Laundry', st: 'ada', tag: 'Tersedia', h: 'Setiap pesanan terlihat ada di tahap mana.',
    need: ['Harga per kg dan per potong', 'Tahap cuci sampai kemas terpantau', 'Jemput & antar terjadwal'],
    mod: ['Pesanan & nota', 'Tahap proses', 'Antar-jemput', 'Keluhan & cuci ulang', 'Bahan & laporan'],
    flow: ['Terima pesanan', 'Proses per tahap', 'Siap diambil', 'Lunas & selesai'],
    d: { title: 'Laundry Bersih Wangi', sub: 'Hari ini', nav: ['Ringkasan', 'Pesanan', 'Proses', 'Antar-jemput', 'Kas', 'Laporan'], on: 2, kpis: [['Pesanan aktif', '23'], ['Siap diambil', '7'], ['Pendapatan', 'Rp1,2 jt', '+4%']], chartTitle: 'Pesanan per tahap', bars: [6, 5, 4, 3, 5], listTitle: 'Perlu perhatian', list: ['2 lewat janji selesai', '3 jemputan sore ini', '1 keluhan terbuka'] } },
  { k: 'kos', ic: 'home', n: 'Kos & Properti', st: 'ada', tag: 'Tersedia', h: 'Tagihan terbit sendiri, tunggakan langsung terlihat.',
    need: ['Tagihan bulanan otomatis', 'Deposit terpisah dari pendapatan', 'Booking, keluhan, dan meteran'],
    mod: ['Kamar & penghuni', 'Tagihan & pembayaran', 'Booking & deposit', 'Keluhan & perbaikan', 'Portal penghuni (Pro)'],
    flow: ['Penghuni masuk', 'Tagihan terbit', 'Bayar & verifikasi', 'Laba rugi'],
    d: { title: 'Kos Melati', sub: 'November', nav: ['Ringkasan', 'Kamar', 'Penghuni', 'Tagihan', 'Biaya', 'Laporan'], on: 3, kpis: [['Kamar terisi', '18 / 20'], ['Tagihan lunas', '15'], ['Tunggakan', 'Rp2,4 jt', '', 1]], chartTitle: 'Pendapatan sewa', line: [14, 15, 15, 16, 17, 17, 18, 18], listTitle: 'Jatuh tempo', list: ['Kamar 07 · besok', 'Kamar 12 · 3 hari', 'Kamar 03 · lewat 2 hari'] } },
  { k: 'bengkel', ic: 'layers', n: 'Bengkel & Servis', st: 'bb', tag: 'Lewat Business Builder · template Bengkel', h: 'Catat kendaraan, pekerjaan, dan statusnya.',
    need: ['Riwayat servis per kendaraan', 'Status pekerjaan per mekanik', 'Uang masuk saat pekerjaan selesai'],
    mod: ['Data pelanggan & kendaraan', 'Alur status pekerjaan', 'Peran & persetujuan', 'Laporan sendiri', 'Kas & pembukuan'],
    flow: ['Terima kendaraan', 'Dikerjakan', 'Selesai & dibayar', 'Masuk laporan'],
    d: { title: 'Bengkel Jaya Motor', sub: 'Minggu ini', nav: ['Ringkasan', 'Servis', 'Pelanggan', 'Kendaraan', 'Kas', 'Laporan'], on: 1, kpis: [['Servis masuk', '31'], ['Dikerjakan', '6'], ['Selesai', '25', '+3']], chartTitle: 'Servis per hari', bars: [4, 6, 5, 7, 3, 6], listTitle: 'Menunggu', list: ['Vario · ganti oli', 'Beat · servis rutin', 'NMAX · rem'] } },
  { k: 'kuliner', ic: 'notebook', n: 'Kuliner', st: 'ada', tag: 'Tersedia', h: 'Dari meja ke dapur tanpa teriak.',
    need: ['Pesanan makan di tempat & bungkus', 'Layar dapur untuk koki', 'Biaya bahan per menu'],
    mod: ['Menu & pesanan', 'Layar dapur', 'Meja & reservasi', 'Resep & food cost', 'QR per meja (Pro)'],
    flow: ['Pesanan masuk', 'Dapur memasak', 'Disajikan', 'Bayar per meja'],
    d: { title: 'Warung Bu Tini', sub: 'Hari ini', nav: ['Ringkasan', 'Pesanan', 'Dapur', 'Meja', 'Menu', 'Laporan'], on: 2, kpis: [['Pesanan', '64', '+11%'], ['Meja terisi', '7 / 12'], ['Food cost', '34%']], chartTitle: 'Pesanan per jam', bars: [2, 3, 9, 14, 8, 4, 6, 12, 10, 5], listTitle: 'Di dapur', list: ['Meja 4 · 3 menu', 'Meja 9 · 2 menu', 'Bungkus · 5 menu'] } },
  { k: 'jasa', ic: 'users', n: 'Jasa Profesional', st: 'bb', tag: 'Mesin Jasa atau Business Builder', h: 'Pesanan, tahap kerja, dan tagihan dalam satu alur.',
    need: ['Daftar layanan dan harganya', 'Tahap pekerjaan yang jelas', 'Uang muka dan pelunasan'],
    mod: ['Layanan & pesanan', 'Tahap proses', 'Nota & pembayaran', 'Pelanggan', 'Laporan'],
    flow: ['Permintaan', 'Dikerjakan', 'Diserahkan', 'Pendapatan diakui'],
    d: { title: 'Studio Jasa Anda', sub: 'Bulan ini', nav: ['Ringkasan', 'Pesanan', 'Proses', 'Pelanggan', 'Kas', 'Laporan'], on: 1, kpis: [['Pesanan', '28'], ['Berjalan', '9'], ['Pendapatan', 'Rp12,6 jt', '+7%']], chartTitle: 'Pendapatan', line: [6, 7, 9, 8, 10, 11, 12, 13], listTitle: 'Tenggat', list: ['Klien A · besok', 'Klien B · 3 hari', 'Klien C · minggu depan'] } },
  { k: 'konstruksi', ic: 'compass', n: 'Konstruksi', st: 'bb', tag: 'Lewat Business Builder · modul proyek dalam rencana', h: 'Susun sendiri data proyek dan alurnya.',
    need: ['Daftar proyek dan statusnya', 'Biaya per proyek', 'Persetujuan sebelum pengeluaran'],
    mod: ['Jenis data sendiri', 'Alur status & persetujuan', 'Pengeluaran & anggaran', 'Aset tetap', 'Laporan sendiri'],
    flow: ['Proyek dicatat', 'Tahap berjalan', 'Biaya tercatat', 'Laporan proyek'],
    d: { title: 'Kontraktor Anda', sub: 'Tahun ini', nav: ['Ringkasan', 'Proyek', 'Biaya', 'Anggaran', 'Aset', 'Laporan'], on: 1, kpis: [['Proyek aktif', '4'], ['Selesai', '7'], ['Biaya bulan ini', 'Rp86 jt']], chartTitle: 'Biaya per proyek', bars: [9, 6, 12, 4], listTitle: 'Tahap', list: ['Ruko A · struktur', 'Rumah B · finishing', 'Gudang C · persiapan'] } },
  { k: 'online', ic: 'globe', n: 'Bisnis Online', st: 'bb', tag: 'Pakai mesin Toko · integrasi marketplace belum tersedia', h: 'Stok, pesanan, dan laba dari satu tempat.',
    need: ['Stok yang tidak dijual dua kali', 'Catatan penjualan harian', 'Halaman bisnis untuk dibagikan'],
    mod: ['Barang & stok', 'Kasir / penjualan', 'Pelanggan', 'Halaman bisnis (Pro)', 'Laporan laba'],
    flow: ['Pesanan masuk', 'Dicatat di Kasir', 'Stok berkurang', 'Laba terlihat'],
    d: { title: 'Toko Online Anda', sub: 'Minggu ini', nav: ['Ringkasan', 'Kasir', 'Barang', 'Pelanggan', 'Kas', 'Laporan'], kpis: [['Penjualan', 'Rp8,9 jt', '+14%'], ['Pesanan', '112'], ['Stok menipis', '3 barang', '', 1]], chartTitle: 'Penjualan', line: [5, 6, 6, 8, 9, 8, 11, 12], listTitle: 'Terlaris', list: ['Produk A', 'Produk B', 'Produk C'] } },
  { k: 'lain', ic: 'plus', n: 'Lainnya', st: 'bb', tag: 'Lewat Business Builder', h: 'Usaha Anda tidak ada di daftar? Susun sendiri.',
    need: ['Jenis data sesuai usaha Anda', 'Formulir dan alur status sendiri', 'Laporan dari data itu'],
    mod: ['Jenis data & formulir', 'Status & alur kerja', 'Peran pengelola / operator', 'Laporan', 'Kas & pembukuan'],
    flow: ['Pilih template', 'Atur data & alur', 'Periksa & aktifkan', 'Mulai dipakai'],
    d: { title: 'Bisnis Anda', sub: 'Susunan sendiri', nav: ['Ringkasan', 'Data', 'Alur', 'Peran', 'Kas', 'Laporan'], on: 1, kpis: [['Catatan', '120'], ['Berjalan', '14'], ['Selesai', '106']], chartTitle: 'Catatan per status', bars: [14, 9, 6, 22], listTitle: 'Template', list: ['Bengkel motor', 'Salon', 'Kursus / rental'] } },
];

export default function Explorer() {
  const [k, setK] = useState('toko');
  const c = CATS.find((x) => x.k === k);
  const pick = (id, e) => { setK(id); e.currentTarget.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' }); };
  return (
    <div>
      <span className="cx-swipe">Geser untuk melihat semua jenis bisnis →</span>
      <div className="cx-chips" role="tablist" aria-label="Jenis bisnis">
        {CATS.map((x) => (
          <button key={x.k} type="button" role="tab" aria-selected={x.k === k} aria-controls="cx-exp" className={'cx-chip' + (x.k === k ? ' on' : '')} onClick={(e) => pick(x.k, e)}>
            <Icon name={x.ic} size={24} />{x.n}
          </button>
        ))}
      </div>
      <div className="cx-exp" id="cx-exp" role="tabpanel" aria-label={c.n}>
        <div className="cx-exp-body" key={k}>
          <span className={'cx-avail' + (c.st === 'bb' ? ' b' : '')}>{c.tag}</span>
          <h3 style={{ fontSize: 'clamp(22px,4.6vw,30px)' }}>{c.h}</h3>
          <div className="cx-cols">
            <div><h3>Kebutuhan</h3><ul>{c.need.map((t, i) => <li key={t} style={{ '--i': i }}><Icon name="check" size={17} />{t}</li>)}</ul></div>
            <div><h3>Modul</h3><ul>{c.mod.map((t, i) => <li key={t} style={{ '--i': i + 2 }}><Icon name="layers" size={17} />{t}</li>)}</ul></div>
          </div>
          <h3 style={{ fontSize: 13, letterSpacing: '.14em', textTransform: 'uppercase', color: 'var(--mute)', margin: '18px 0 8px' }}>Proses kerja</h3>
          <div className="cx-steps">{c.flow.map((t, i) => <span key={t} style={{ '--i': i }}>{i > 0 && <i aria-hidden="true">→ </i>}{t}</span>)}</div>
        </div>
        <div className="cx-exp-dash" key={k + 'd'}><Dash d={c.d} /><p className="cx-note" style={{ marginTop: 10 }}>Ilustrasi · data contoh, bukan data bisnis siapa pun.</p></div>
      </div>
    </div>
  );
}
