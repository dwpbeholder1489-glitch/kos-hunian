'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useKos } from '@/components/KosProvider';
import Icon from '@/components/landing/Icon';
import { LN_THEME_KEY } from '@/lib/theme';

const LINKS = [['/#beranda', 'Beranda'], ['/#produk', 'Produk'], ['/#solusi', 'Solusi Bisnis'], ['/#cara', 'Cara Kerja'], ['/#harga', 'Harga'], ['/tentang', 'Tentang Kami']];

// Tombol tema landing: gelap = tampilan utama; terang disimpan di perangkat ini (tidak mengubah tema aplikasi)
function ThemeBtn() {
  const [light, setLight] = useState(false);
  useEffect(() => { setLight(document.documentElement.dataset.ln === 'light'); }, []);
  const flip = () => {
    const v = !light; setLight(v);
    if (v) document.documentElement.dataset.ln = 'light'; else delete document.documentElement.dataset.ln;
    try { v ? localStorage.setItem(LN_THEME_KEY, 'light') : localStorage.removeItem(LN_THEME_KEY); } catch {}
  };
  return <button type="button" className="ln-burger ln-theme" onClick={flip} aria-label={light ? 'Pakai tampilan gelap' : 'Pakai tampilan terang'} title={light ? 'Tampilan gelap' : 'Tampilan terang'}><Icon name={light ? 'moon' : 'sun'} size={20} /></button>;
}

export default function LandingNav({ theme = false }) {
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
        <Link href="/" className="ln-logo" aria-label="PRASARA, beranda"><span className="ln-logo-mark">P</span><b>PRASARA</b></Link>
        <nav className="ln-nav-links" aria-label="Navigasi utama">
          {LINKS.map(([h, l]) => (h.startsWith('/#') ? <a key={l} href={h}>{l}</a> : <Link key={l} href={h}>{l}</Link>))}
        </nav>
        <div className="ln-nav-cta">
          {theme && <ThemeBtn />}
          {session ? (
            <Link href="/buka" className="ln-btn ln-btn-primary ln-btn-sm">Buka aplikasi</Link>
          ) : (
            <>
              <Link href="/masuk" className="ln-btn ln-btn-ghost ln-btn-sm ln-hide-xs">Masuk</Link>
              <Link href="/masuk?daftar=1" className="ln-btn ln-btn-primary ln-btn-sm">Mulai Sekarang</Link>
            </>
          )}
          <button className="ln-burger ln-menu-btn" aria-label={open ? 'Tutup menu' : 'Buka menu'} aria-expanded={open} aria-controls="ln-mobile" onClick={() => setOpen(!open)}>
            <Icon name={open ? 'x' : 'menu'} size={22} />
          </button>
        </div>
      </div>
      {open && (
        <div id="ln-mobile" className="ln-mobile">
          {LINKS.map(([h, l]) => (h.startsWith('/#') ? <a key={l} href={h} onClick={() => setOpen(false)}>{l}</a> : <Link key={l} href={h} onClick={() => setOpen(false)}>{l}</Link>))}
          <Link href="/panduan" onClick={() => setOpen(false)}>Pusat bantuan & panduan</Link>
          {!session && <Link href="/masuk" onClick={() => setOpen(false)}>Masuk</Link>}
          {!session && <Link href="/masuk?daftar=1" className="ln-btn ln-btn-primary" style={{ marginTop: 12 }} onClick={() => setOpen(false)}>Mulai Sekarang</Link>}
        </div>
      )}
    </header>
  );
}
