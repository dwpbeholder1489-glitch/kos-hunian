'use client';
// Bagian atas Beranda (semua jenis bisnis): sapaan dan pintasan operasional sesuai peran.
// Angka ringkasan tetap dari dashboard masing-masing jenis bisnis di bawahnya (data nyata, bukan contoh).
import Link from 'next/link';
import NavIcon from '@/components/NavIcon';
import { tabsFor, homeOf, typeOf, isKuliner } from '@/lib/business';
import { useKos } from '@/components/KosProvider';
import Persiapan from '@/components/Persiapan';
import { canArea } from '@/lib/business';

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
  return (<>
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
    </section>
    {canArea(kos, 'settings') && <Persiapan kos={kos} />}
  </>);
}
