'use client';
import { useState } from 'react';
import Link from 'next/link';
import Icon from './Icon';
import { ScrDashboard, ScrRooms, ScrReminder, ScrInvoices, ScrVerify, ScrReport, ScrPortal } from '@/components/demo/Screens';

const TABS = [
  ['dashboard', 'Dashboard', ScrDashboard, 'Kondisi kos dalam satu layar', 'Kas bersih bulan ini, tingkat hunian, tagihan, dan tunggakan langsung terlihat saat aplikasi dibuka.', ['Siapa yang menunggak dan berapa jumlahnya', 'Tagihan yang jatuh tempo 7 hari ke depan', 'Daftar langkah awal untuk pengguna baru']],
  ['kamar', 'Kamar', ScrRooms, 'Peta kamar yang jelas', 'Setiap kamar menampilkan status, penghuni, harga sewa, dan tunggakannya dengan kode warna.', ['Status terisi berubah otomatis saat penghuni masuk atau keluar', 'Fasilitas dan catatan per kamar', 'Saring kamar kosong dalam satu ketukan']],
  ['penghuni', 'Penghuni', ScrReminder, 'Data penghuni dan pengingat', 'Lihat kamar, riwayat tagihan, dan sisa pembayaran setiap penghuni, lalu ingatkan lewat WhatsApp.', ['Pesan pengingat berisi rincian tagihan tersusun otomatis', 'Riwayat penghuni sebelumnya tetap tersimpan', 'Akhiri sewa dan kamar kembali tersedia']],
  ['tagihan', 'Tagihan', ScrInvoices, 'Tagihan terbit sendiri', 'Tagihan sewa bulanan dibuat otomatis 7 hari sebelum jatuh tempo, lengkap dengan status bayarnya.', ['Belum bayar, dibayar sebagian, menunggak, atau lunas', 'Tagihan tambahan: listrik, laundry, denda, deposit', 'Kwitansi PDF untuk setiap pembayaran (Standar)']],
  ['pembayaran', 'Pembayaran', ScrVerify, 'Pembayaran tercatat rapi', 'Catat tunai, transfer, atau QRIS — termasuk bayar sebagian. Sisa tagihan dihitung otomatis.', ['Verifikasi pembayaran sebelum dihitung lunas', 'Bukti transfer dari penghuni masuk ke satu tempat', 'Total uang masuk per bulan']],
  ['laporan', 'Laporan', ScrReport, 'Tahu untung bersih kos', 'Laba rugi bulanan memisahkan pendapatan, biaya operasional, belanja modal, dan uang yang diambil pemilik.', ['Tren 6 bulan dan pendapatan per kamar (Standar)', 'Ekspor Excel dan simpan PDF (Standar)', 'Berbasis kas: dihitung saat uang benar-benar diterima']],
  ['portal', 'Portal', ScrPortal, 'Penghuni melayani dirinya sendiri', 'Setiap penghuni mendapat link pribadi untuk melihat tagihan dan mengirim bukti transfer (Pro).', ['Tanpa daftar atau login bagi penghuni', 'Penghuni hanya melihat tagihannya sendiri', 'Link bisa diganti kapan saja']],
];

export default function Showcase() {
  const [k, setK] = useState('dashboard');
  const [, label, Scr, title, desc, points] = TABS.find((t) => t[0] === k);
  return (
    <div className="ln-show">
      <div className="ln-show-tabs" role="tablist" aria-label="Pilih layar aplikasi">
        {TABS.map(([id, l]) => (
          <button key={id} role="tab" aria-selected={k === id} className={k === id ? 'on' : ''} onClick={() => setK(id)}>{l}</button>
        ))}
      </div>
      <div className="ln-show-panel" role="tabpanel" aria-label={label}>
        <div className="ln-show-text">
          <h3>{title}</h3>
          <p>{desc}</p>
          <ul className="ln-checks">{points.map((p) => <li key={p}><Icon name="check" size={18} />{p}</li>)}</ul>
          {k === 'portal' && <Link href="/p/contoh" className="ln-textlink">Coba portal penghuni contoh <Icon name="arrow" size={16} /></Link>}
        </div>
        <div className="ln-show-screen"><Scr /></div>
      </div>
      <p className="ln-note">Tampilan diambil dari aplikasi PRASARA dengan data contoh.</p>
    </div>
  );
}
