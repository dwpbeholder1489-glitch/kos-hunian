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
          <Link href="/panduan" className="lp-link">Panduan</Link>
          <a href="/#harga" className="lp-link hide-sm">Harga</a>
          {session
            ? <Link href="/beranda"><button className="primary sm">Buka aplikasi</button></Link>
            : <Link href="/masuk"><button className="sm">Masuk</button></Link>}
        </nav>
      </div>
    </header>
  );
}
