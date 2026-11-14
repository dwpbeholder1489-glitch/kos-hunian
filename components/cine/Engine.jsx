'use client';
import { useEffect, useState } from 'react';

// Mesin gerak landing: (1) [data-rv] muncul saat masuk layar (IntersectionObserver; ditandai atribut data-in, bukan kelas,
// supaya tidak terhapus saat React mengganti className), (2) [data-sp] mendapat variabel CSS --p
// (progres scroll 0..1) lewat satu requestAnimationFrame per frame, (3) bilah progres halaman + titik navigasi.
// "Kurangi gerakan": --p tidak diubah (CSS memakai keadaan akhir) dan semua isi langsung tampil.
const clamp = (n) => (n < 0 ? 0 : n > 1 ? 1 : n);

export default function Engine({ dots = [] }) {
  const [act, setAct] = useState('');
  useEffect(() => {
    const root = document.documentElement;
    window.__cx = 1;
    root.classList.add('cx-js');
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const rv = Array.from(document.querySelectorAll('.cx [data-rv]'));
    let io = null;
    if ('IntersectionObserver' in window && !reduce) {
      io = new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) { e.target.setAttribute('data-in', ''); io.unobserve(e.target); } }), { rootMargin: '0px 0px -8% 0px', threshold: 0.06 });
      rv.forEach((el) => io.observe(el));
    } else rv.forEach((el) => el.setAttribute('data-in', ''));

    const sp = Array.from(document.querySelectorAll('.cx [data-sp]'));
    const secs = dots.map(([id]) => document.getElementById(id)).filter(Boolean);
    const bar = document.querySelector('.cx .cx-bar');
    let raf = 0;
    const tick = () => {
      raf = 0;
      const vh = window.innerHeight, y = window.scrollY;
      const max = root.scrollHeight - vh;
      if (bar) bar.style.setProperty('--page', max > 0 ? clamp(y / max).toFixed(4) : '0');
      if (y > 24) root.dataset.cxScrolled = '1'; else delete root.dataset.cxScrolled;
      if (!reduce) for (const el of sp) {
        const r = el.getBoundingClientRect();
        const m = el.dataset.sp;
        const p = m === 'exit' ? clamp(-r.top / (r.height || 1)) : m === 'pin' ? clamp(-r.top / Math.max(1, r.height - vh)) : clamp((vh - r.top) / (vh + r.height));
        el.style.setProperty('--p', p.toFixed(4));
      }
      let cur = '';
      for (const s of secs) if (s.getBoundingClientRect().top <= vh * 0.42) cur = s.id;
      setAct((v) => (v === cur ? v : cur));
    };
    const on = () => { if (!raf) raf = requestAnimationFrame(tick); };
    window.addEventListener('scroll', on, { passive: true });
    window.addEventListener('resize', on);
    tick();
    return () => {
      window.removeEventListener('scroll', on); window.removeEventListener('resize', on);
      if (raf) cancelAnimationFrame(raf);
      if (io) io.disconnect();
      root.classList.remove('cx-js'); delete root.dataset.cxScrolled;
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <>
      <div className="cx-bar" aria-hidden="true" />
      <nav className="cx-dots" aria-label="Bagian halaman">
        {dots.map(([id, label]) => <a key={id} href={'#' + id} className={act === id ? 'on' : ''} aria-current={act === id ? 'true' : undefined} aria-label={label}><span>{label}</span></a>)}
      </nav>
    </>
  );
}
