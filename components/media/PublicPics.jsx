'use client';
// Foto di halaman bisnis publik: cover, galeri (geser), dan foto kecil tiap kamar/barang/layanan (ketuk untuk memperbesar).
import { useState } from 'react';
import { mediaUrl } from '@/lib/media';
import Lightbox from '@/components/media/Lightbox';

export function PublicCover({ cover, name }) {
  const [open, setOpen] = useState(false);
  if (!cover) return null;
  return <>
    <button type="button" className="pubcover" style={{ padding: 0 }} onClick={() => setOpen(true)} aria-label={`Foto ${name}`}>
      <img src={mediaUrl(cover.path)} alt={cover.caption || name} fetchPriority="high" />
    </button>
    {open && <Lightbox items={[cover]} urlOf={mediaUrl} onClose={() => setOpen(false)} />}
  </>;
}

export function PublicGallery({ items, title = 'Galeri' }) {
  const [at, setAt] = useState(null);
  if (!items?.length) return null;
  return (
    <section className="panel" style={{ gap: 8 }}>
      <h3>{title}</h3>
      <div className="thumbrow">{items.map((p, i) => (
        <button key={p.path} type="button" className="thumb" style={{ width: 132, aspectRatio: '4 / 3' }} onClick={() => setAt(i)} aria-label={p.caption || `Foto ${i + 1}`}>
          <img src={mediaUrl(p.thumb)} alt={p.caption || ''} loading="lazy" />
        </button>
      ))}</div>
      {items.length > 2 && <span className="small muted">Geser untuk melihat {items.length} foto · ketuk untuk memperbesar</span>}
      {at != null && <Lightbox items={items} start={at} urlOf={mediaUrl} onClose={() => setAt(null)} />}
    </section>
  );
}

export function ItemThumb({ pics, name, size = 64 }) {
  const [open, setOpen] = useState(false);
  if (!pics?.length) return null;
  return <>
    <button type="button" className="itemthumb" style={{ width: size, height: size }} onClick={(e) => { e.preventDefault(); e.stopPropagation(); setOpen(true); }} aria-label={`Lihat foto ${name}${pics.length > 1 ? ` (${pics.length})` : ''}`}>
      <img src={mediaUrl(pics[0].thumb)} alt={name} loading="lazy" />
    </button>
    {open && <Lightbox items={pics} urlOf={mediaUrl} onClose={() => setOpen(false)} />}
  </>;
}
