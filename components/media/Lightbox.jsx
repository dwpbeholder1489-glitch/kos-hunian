'use client';
// Lihat foto ukuran penuh (geser kiri/kanan). Dirender di <body> agar di atas semua lapisan.
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';

export default function Lightbox({ items, start = 0, onClose, urlOf }) {
  const [i, setI] = useState(start);
  const [x0, setX0] = useState(null);
  const n = items.length;
  const go = (d) => setI((v) => (v + d + n) % n);
  useEffect(() => {
    const k = (e) => { if (e.key === 'Escape') onClose(); if (e.key === 'ArrowRight') go(1); if (e.key === 'ArrowLeft') go(-1); };
    window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k);
  }, [n]);
  if (typeof document === 'undefined' || !n) return null;
  const it = items[i];
  return createPortal(
    <div className="lightbox" role="dialog" aria-modal="true" aria-label="Foto" onClick={(e) => e.target === e.currentTarget && onClose()}
      onTouchStart={(e) => setX0(e.touches[0].clientX)} onTouchEnd={(e) => { if (x0 == null) return; const d = e.changedTouches[0].clientX - x0; if (Math.abs(d) > 50) go(d < 0 ? 1 : -1); setX0(null); }}>
      <button className="lb-close" onClick={onClose} aria-label="Tutup">✕</button>
      <img src={urlOf(it.path)} alt={it.caption || `Foto ${i + 1}`} />
      {(it.caption || n > 1) && <div className="lb-cap">{it.caption}{n > 1 ? `${it.caption ? ' · ' : ''}${i + 1}/${n}` : ''}</div>}
      {n > 1 && <><button className="lb-nav l" onClick={() => go(-1)} aria-label="Sebelumnya">‹</button><button className="lb-nav r" onClick={() => go(1)} aria-label="Berikutnya">›</button></>}
    </div>, document.body);
}
