'use client';
import { useEffect, useRef, useState } from 'react';

// Angka bergerak menuju nilai baru (count-up). Nilai akhir selalu benar; dengan "kurangi gerakan" langsung berganti.
export function useCount(value, on = true, ms = 520) {
  const [v, setV] = useState(value);
  const from = useRef(value);
  useEffect(() => {
    if (!on) return;
    const reduce = typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduce || from.current === value) { from.current = value; setV(value); return; }
    const a = from.current, t0 = performance.now();
    let raf = 0;
    const step = (t) => {
      const k = Math.min(1, (t - t0) / ms), e = 1 - Math.pow(1 - k, 3);
      const cur = a + (value - a) * e;
      from.current = cur; setV(cur);
      if (k < 1) raf = requestAnimationFrame(step); else { from.current = value; setV(value); }
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [value, on, ms]);
  return v;
}
export const rp = (n) => 'Rp' + new Intl.NumberFormat('id-ID').format(Math.round(n));
