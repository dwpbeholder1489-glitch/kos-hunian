'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useKos } from '@/components/KosProvider';
import Icon from '@/components/landing/Icon';

const LINKS = [['/#', 'Beranda'], ['/#fitur', 'Fitur'], ['/#cara-kerja', 'Cara Kerja'], ['/#harga', 'Harga'], ['/#faq', 'FAQ']];

export default function LandingNav() {
  const { session } = useKos();
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!open) return;
    const k = (e) => e.key === 'Escape' && setOpen(false);
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [open]);

  return (
    <header className="ln-nav">
      <div className="ln-wrap ln-nav-in">
        <Link href="/" className="ln-logo" aria-label="Kos Hunian, beranda"><span className="ln-logo-mark">KH</span><b>Kos Hunian</b></Link>
        <nav className="ln-nav-links" aria-label="Navigasi utama">
          {LINKS.map(([h, l]) => <a key={l} href={h}>{l}</a>)}
        </nav>
        <div className="ln-nav-cta">
          {session ? (
            <Link href="/beranda" className="ln-btn ln-btn-primary ln-btn-sm">Buka aplikasi</Link>
          ) : (
            <>
              <Link href="/masuk" className="ln-btn ln-btn-ghost ln-btn-sm ln-hide-xs">Masuk</Link>
              <Link href="/masuk?daftar=1" className="ln-btn ln-btn-primary ln-btn-sm">Mulai Gratis</Link>
            </>
          )}
          <button className="ln-burger" aria-label={open ? 'Tutup menu' : 'Buka menu'} aria-expanded={open} aria-controls="ln-mobile" onClick={() => setOpen(!open)}>
            <Icon name={open ? 'x' : 'menu'} size={22} />
          </button>
        </div>
      </div>
      {open && (
        <div id="ln-mobile" className="ln-mobile">
          {LINKS.map(([h, l]) => <a key={l} href={h} onClick={() => setOpen(false)}>{l}</a>)}
          <Link href="/panduan" onClick={() => setOpen(false)}>Panduan</Link>
          {!session && <Link href="/masuk" onClick={() => setOpen(false)}>Masuk</Link>}
        </div>
      )}
    </header>
  );
}
