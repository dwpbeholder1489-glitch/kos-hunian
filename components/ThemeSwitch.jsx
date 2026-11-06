'use client';
import { useEffect, useState } from 'react';
import { THEME_KEY } from '@/lib/theme';

// Tampilan: Otomatis (ikuti HP) / Terang / Gelap. Disimpan di perangkat ini saja.

export default function ThemeSwitch() {
  const [t, setT] = useState('auto');
  useEffect(() => { try { setT(localStorage.getItem(THEME_KEY) || 'auto'); } catch {} }, []);
  const pick = (v) => {
    setT(v);
    try { v === 'auto' ? localStorage.removeItem(THEME_KEY) : localStorage.setItem(THEME_KEY, v); } catch {}
    if (v === 'auto') delete document.documentElement.dataset.theme; else document.documentElement.dataset.theme = v;
  };
  return (
    <div className="stack" style={{ gap: 6 }}>
      <span className="label">Tampilan</span>
      <div className="seg" role="radiogroup" aria-label="Tampilan">
        {[['auto', 'Ikuti HP'], ['light', 'Terang'], ['dark', 'Gelap']].map(([k, l]) => <button key={k} role="radio" aria-checked={t === k} className={t === k ? 'on' : ''} onClick={() => pick(k)}>{l}</button>)}
      </div>
    </div>
  );
}
