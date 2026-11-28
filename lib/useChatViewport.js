'use client';
// Layar chat penuh yang mengikuti AREA YANG TERLIHAT (Visual Viewport API) — kolom ketik selalu tepat di atas keyboard.
// • iOS Safari & PWA: keyboard tidak mengecilkan halaman (layout viewport), hanya visual viewport yang mengecil & bisa
//   bergeser (offsetTop) → lapisan chat ditempatkan di top = offsetTop, tinggi = visualViewport.height.
// • Android Chrome (bawaan "resizes-visual"): sama; bila browser mengecilkan halaman, innerHeight ikut mengecil — tetap benar.
// • Tanpa visualViewport (browser lama): pakai innerHeight (CSS cadangan 100dvh).
// Selama aktif, gulir halaman di belakang dikunci agar seluruh halaman tidak ikut bergeser.
import { useEffect, useState } from 'react';

export function useChatViewport(active = true) {
  const [box, setBox] = useState(null); // {top, height, keyboard}
  useEffect(() => {
    if (!active || typeof window === 'undefined') return;
    const vv = window.visualViewport;
    let raf = 0;
    const read = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const height = Math.round(vv ? vv.height : window.innerHeight);
        const top = Math.max(0, Math.round(vv ? vv.offsetTop : 0));
        // keyboard: area terlihat jauh lebih pendek dari jendela (iOS) — Android yang mengecilkan jendela ditangani lewat fokus
        const keyboard = Boolean(vv) && window.innerHeight - vv.height > 120;
        setBox((b) => (b && b.top === top && b.height === height && b.keyboard === keyboard ? b : { top, height, keyboard }));
      });
    };
    read();
    vv?.addEventListener('resize', read);
    vv?.addEventListener('scroll', read);
    window.addEventListener('resize', read);
    window.addEventListener('orientationchange', read);
    const html = document.documentElement; const body = document.body;
    const prev = [html.style.overflow, body.style.overflow, body.style.overscrollBehavior];
    html.style.overflow = 'hidden'; body.style.overflow = 'hidden'; body.style.overscrollBehavior = 'none';
    return () => {
      cancelAnimationFrame(raf);
      vv?.removeEventListener('resize', read);
      vv?.removeEventListener('scroll', read);
      window.removeEventListener('resize', read);
      window.removeEventListener('orientationchange', read);
      [html.style.overflow, body.style.overflow, body.style.overscrollBehavior] = prev;
    };
  }, [active]);
  return box;
}

// Sedang mengetik di layar sentuh (keyboard layar terbuka). Dipakai untuk menyembunyikan branding & bantuan kolom.
export const isTouch = () => typeof window !== 'undefined' && window.matchMedia?.('(pointer: coarse)').matches;
