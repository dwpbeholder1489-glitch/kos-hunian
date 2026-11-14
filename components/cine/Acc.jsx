'use client';
import { useState } from 'react';

// Akordeon: tombol asli (keyboard & pembaca layar), tinggi berubah halus, ikon berputar. Isi tetap ada di HTML (SEO).
export default function Acc({ items, id = 'acc', first = -1 }) {
  const [open, setOpen] = useState(first);
  return (
    <div className="cx-acc">
      {items.map(([q, a], i) => {
        const on = open === i;
        return (
          <div key={q} className={'cx-acc-item' + (on ? ' open' : '')} data-rv="" style={{ '--i': Math.min(i, 5) }}>
            <h3 style={{ font: 'inherit' }}><button type="button" className="cx-acc-q" aria-expanded={on} aria-controls={`${id}-${i}`} id={`${id}-q${i}`} onClick={() => setOpen(on ? -1 : i)}><span>{q}</span><i aria-hidden="true" /></button></h3>
            <div className="cx-acc-a" id={`${id}-${i}`} role="region" aria-labelledby={`${id}-q${i}`} inert={!on}><div><p>{a}</p></div></div>
          </div>
        );
      })}
    </div>
  );
}
