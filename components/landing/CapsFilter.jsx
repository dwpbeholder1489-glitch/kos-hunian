'use client';
// Kemampuan inti dengan filter kategori (chip) + "Lihat detail". Status ditulis apa adanya.
import { useState } from 'react';
import Icon from '@/components/landing/Icon';

const ST = { ready: ['Tersedia', 'ok'], part: ['Sebagian tersedia', 'std'], soon: ['Segera hadir', 'soon'] };

export default function CapsFilter({ caps }) {
  const [f, setF] = useState('semua');
  const [open, setOpen] = useState(null);
  const shown = caps.filter((c) => f === 'semua' || c[1] === f);
  return (
    <>
      <div className="ln-chips" role="tablist" aria-label="Filter kemampuan">
        {[['semua', 'Semua modul'], ...caps.map((c) => [c[1], c[1]])].map(([k, l]) => (
          <button key={k} type="button" role="tab" aria-selected={f === k} className={'ln-chip' + (f === k ? ' on' : '')} onClick={() => { setF(k); setOpen(null); }}>{l}</button>
        ))}
      </div>
      <div className="ln-caps">
        {shown.map(([ic, t, st, d, ex]) => (
          <div key={t} className={'ln-cap' + (st === 'soon' ? ' soon' : '')}>
            <div className="ln-cap-h"><span className="ln-ico-wrap sm"><Icon name={ic} size={18} /></span><h3>{t}</h3><span className={'ln-badge ' + ST[st][1]}>{ST[st][0]}</span></div>
            <p>{d}</p>
            {open === t ? <p className="ln-cap-ex"><b>Contoh:</b> {ex}</p>
              : <button type="button" className="ln-cap-more" onClick={() => setOpen(t)} aria-expanded="false">Lihat detail <Icon name="arrow" size={15} /></button>}
          </div>
        ))}
      </div>
    </>
  );
}
