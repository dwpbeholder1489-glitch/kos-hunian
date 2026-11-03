'use client';
import Link from 'next/link';
import { useKos } from '@/components/KosProvider';

export default function LandingNav() {
  const { session } = useKos();
  return (
    <header className="lp-nav">
      <div className="wrap row between">
        <Link href="/" className="brand" style={{ textDecoration: 'none', color: 'inherit' }}>
          <span className="mark">KH</span><b>Kos Hunian</b>
        </Link>
        <nav className="row">
          <a href="#harga" className="lp-link">Harga</a>
          {session
            ? <Link href="/beranda"><button className="primary sm">Buka aplikasi</button></Link>
            : <Link href="/masuk"><button className="sm">Masuk</button></Link>}
        </nav>
      </div>
    </header>
  );
}
