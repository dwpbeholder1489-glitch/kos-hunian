'use client';
// Bagian atas Beranda (semua jenis bisnis): sapaan, pintasan operasional sesuai peran, dan kartu Asisten AI (segera hadir).
// Angka ringkasan tetap dari dashboard masing-masing jenis bisnis di bawahnya (data nyata, bukan contoh).
import Link from 'next/link';
import NavIcon from '@/components/NavIcon';
import { tabsFor, homeOf, typeOf, isKuliner } from '@/lib/business';
import { useKos } from '@/components/KosProvider';

const PICK = {
  properti: ['/kamar', '/penghuni', '/tagihan', '/pembayaran', '/booking', '/perbaikan', '/pengeluaran', '/laporan'],
  retail: ['/kasir', '/penjualan', '/barang', '/belanja', '/kas', '/kontak', '/laporan-toko', '/shift'],
  jasa: ['/pesanan', '/antar', '/layanan', '/kontak', '/kas', '/barang', '/laporan-jasa', '/crm'],
  kuliner: ['/pesanan', '/dapur', '/meja', '/layanan', '/kas', '/barang', '/laporan-jasa', '/kontak'],
  kustom: ['/catatan', '/kas', '/laporan-kustom', '/builder', '/pembukuan', '/karyawan', '/pengaturan'],
};
const SHORT = { '/kontak': 'Kontak', '/barang': 'Barang', '/laporan': 'Laporan', '/laporan-toko': 'Laporan', '/laporan-jasa': 'Laporan', '/laporan-kustom': 'Laporan', '/layanan': 'Layanan', '/meja': 'Meja', '/antar': 'Antar jemput', '/perbaikan': 'Keluhan', '/booking': 'Booking', '/meteran': 'Meteran', '/crm': 'Prospek', '/shift': 'Shift', '/builder': 'Builder' };

const salam = () => {
  const h = Number(new Date().toLocaleString('en-US', { timeZone: 'Asia/Jakarta', hour: 'numeric', hour12: false })) % 24;
  return h < 11 ? 'Selamat pagi' : h < 15 ? 'Selamat siang' : h < 18 ? 'Selamat sore' : 'Selamat malam';
};

export default function HomeTop({ kos }) {
  const { user } = useKos();
  const tabs = tabsFor(kos);
  const home = homeOf(kos);
  const want = PICK[isKuliner(kos) ? 'kuliner' : kos.business_type] || PICK.properti;
  const items = want.map((h) => tabs.find(([x]) => x === h)).filter(Boolean);
  const extra = tabs.filter(([h]) => h !== home && !want.includes(h) && h !== '/konfirmasi');
  const grid = [...items, ...extra].slice(0, 7);
  const name = user?.user_metadata?.name || user?.user_metadata?.full_name;
  return (
    <section className="hometop" aria-label="Beranda">
      <div className="hello-row">
        <span className="hello-ic" aria-hidden="true">{typeOf(kos).icon}</span>
        <div><b>{salam()}{name ? `, ${name.split(' ')[0]}` : ''}</b><span>{kos.name}</span></div>
      </div>
      {grid.length > 0 && <>
        <h3 className="hometop-h">Operasional</h3>
        <div className="opsgrid">
          {grid.map(([h, l]) => <Link key={h} href={h}><NavIcon name={h} />{SHORT[h] || l.split(' & ')[0]}</Link>)}
          <Link href="/operasional"><NavIcon name="/operasional" />Lainnya</Link>
        </div>
      </>}
      <div className="aicard" aria-label="Asisten Bisnis AI, segera hadir">
        <span className="aicard-ic" aria-hidden="true"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinejoin="round"><path d="M12 3l1.8 4.7 4.7 1.8-4.7 1.8L12 16l-1.8-4.7L5.5 9.5l4.7-1.8z" /><path d="M19 15l.8 2.2 2.2.8-2.2.8L19 21l-.8-2.2-2.2-.8 2.2-.8z" /></svg></span>
        <div><b>Asisten Bisnis AI <span className="chip gold">Segera hadir</span></b><span>Nanti bisa ditanya, menganalisis, dan merangkum bisnis Anda — dari data yang Anda izinkan.</span></div>
      </div>
    </section>
  );
}
