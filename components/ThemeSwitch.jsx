'use client';
import { useEffect, useState } from 'react';
import { THEME_KEY } from '@/lib/theme';

// Tampilan: Terang (bawaan) / Gelap / Ikuti HP. Disimpan di perangkat ini saja.

export default function ThemeSwitch() {
  const [t, setT] = useState('light');
  useEffect(() => { try { const v = localStorage.getItem(THEME_KEY); setT(v === 'dark' || v === 'auto' ? v : 'light'); } catch {} }, []);
  const pick = (v) => {
    setT(v);
    try { v === 'light' ? localStorage.removeItem(THEME_KEY) : localStorage.setItem(THEME_KEY, v); } catch {}
    document.documentElement.dataset.theme = v;
  };
  return (
    <div className="stack" style={{ gap: 6 }}>
      <span className="label">Tampilan</span>
      <div className="seg" role="radiogroup" aria-label="Tampilan">
        {[['light', 'Terang'], ['dark', 'Gelap'], ['auto', 'Ikuti HP']].map(([k, l]) => <button key={k} role="radio" aria-checked={t === k} className={t === k ? 'on' : ''} onClick={() => pick(k)}>{l}</button>)}
      </div>
    </div>
  );
}
