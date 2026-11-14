'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { LogoMark } from '@/components/Logo';
import Icon from '@/components/landing/Icon';
import { useKos } from '@/components/KosProvider';

const LINKS = [['#bisnis', 'Jenis Bisnis'], ['#demo', 'Demonstrasi'], ['#modul', 'Modul'], ['#harga', 'Harga'], ['#faq', 'FAQ']];

export default function Nav({ cta = 'Mulai Gratis' }) {
  const { session } = useKos();
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!open) return;
    const k = (e) => e.key === 'Escape' && setOpen(false);
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [open]);
  const close = () => setOpen(false);
  return (
    <header className="cx-nav">
      <div className="cx-wrap cx-nav-in">
        <Link href="/" className="cx-logo cx-enter" aria-label="PRASARA, beranda"><LogoMark size={30} /><span>PRASARA</span></Link>
        <nav className="cx-nav-links" aria-label="Navigasi utama">
          {LINKS.map(([h, l]) => <a key={h} href={h}>{l}</a>)}
          <Link href="/tentang">Tentang</Link>
        </nav>
        <div className="cx-nav-cta">
          {session ? <Link href="/buka" className="cx-btn pri sm">Buka aplikasi</Link> : (
            <>
              <Link href="/masuk" className="cx-btn ghost sm cx-hide-xs">Masuk</Link>
              <Link href="/masuk?daftar=1" className="cx-btn pri sm">{cta}</Link>
            </>
          )}
          <button type="button" className="cx-burger" aria-label={open ? 'Tutup menu' : 'Buka menu'} aria-expanded={open} aria-controls="cx-menu" onClick={() => setOpen(!open)}><Icon name={open ? 'x' : 'menu'} size={22} /></button>
        </div>
      </div>
      {open && (
        <div id="cx-menu" className="cx-menu">
          {LINKS.map(([h, l]) => <a key={h} href={h} onClick={close}>{l}</a>)}
          <Link href="/tentang" onClick={close}>Tentang Kami</Link>
          <Link href="/panduan" onClick={close}>Pusat bantuan & panduan</Link>
          {!session && <Link href="/masuk" onClick={close}>Masuk</Link>}
          <Link href={session ? '/buka' : '/masuk?daftar=1'} className="cx-btn pri" onClick={close}>{session ? 'Buka aplikasi' : cta}</Link>
        </div>
      )}
    </header>
  );
}
