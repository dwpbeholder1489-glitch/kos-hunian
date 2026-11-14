'use client';
import { useEffect, useRef, useState } from 'react';

const ITEMS = [
  ['Catatan transaksi tersebar', 'Sebagian di buku, sebagian di nota, sebagian lagi di chat. Saat butuh satu angka, Anda harus membuka semuanya.'],
  ['Informasi pelanggan tidak terorganisasi', 'Nomor HP, pesanan terakhir, dan siapa yang masih punya kasbon tersimpan di kepala atau di riwayat percakapan.'],
  ['Pemasukan dan pengeluaran sulit dicocokkan', 'Catatan bilang satu angka, uang di laci dan rekening bilang angka lain — dan selisihnya sulit ditelusuri.'],
  ['Stok dan pekerjaan tidak terpantau', 'Barang baru ketahuan habis saat pelanggan bertanya. Pesanan yang terlambat baru terlihat saat ditagih.'],
  ['Pemilik harus memeriksa semuanya sendiri', 'Setiap hal kecil menunggu Anda. Bisnis berjalan, tetapi waktu Anda habis untuk mengecek, bukan mengembangkan.'],
];

function Art({ k, on, cls = '' }) {
  const c = 'cx-art ' + cls + (on ? ' is' : '');
  if (k === 0) return <div className={c} aria-hidden="true">{[0, 1, 2, 3].map((i) => <div key={i} className="cx-paper"><i /><i /><i /><i /></div>)}</div>;
  if (k === 1) return (
    <div className={c} aria-hidden="true">
      <span className="cx-bubble" style={{ left: '7%', top: '12%', '--i': 0 }}>No. HP Pak Dedi berapa?</span>
      <span className="cx-bubble r" style={{ right: '6%', top: '32%', '--i': 1 }}>Cek chat bulan lalu…</span>
      <span className="cx-bubble" style={{ left: '12%', top: '54%', '--i': 2 }}>Siapa yang masih kasbon?</span>
      <span className="cx-bubble r" style={{ right: '10%', top: '74%', '--i': 3 }}>Lupa dicatat</span>
    </div>
  );
  if (k === 2) return (
    <div className={c} aria-hidden="true">
      <div className="cx-ledger l">Catatan<b>Rp4.250.000</b></div>
      <div className="cx-neq">≠</div>
      <div className="cx-ledger r">Uang di laci<b>Rp3.980.000</b></div>
      <div className="cx-gap">Selisih Rp270.000 — dari mana?</div>
    </div>
  );
  if (k === 3) return (
    <div className={c} aria-hidden="true">
      <div className="cx-shelf">{['24', '?', '8', '', '?', '3', '', '12', '?', '0'].map((t, i) => <i key={i} className={t === '?' ? 'q' : t === '' ? 'x' : ''} style={{ '--i': i }}>{t}</i>)}</div>
      <span className="cx-late">1 pesanan terlambat?</span>
    </div>
  );
  return (
    <div className={c} aria-hidden="true">
      <div className="cx-owner">Pemilik</div>
      {[['Cek stok', -112, -62], ['Hitung kas', 108, -58], ['Balas chat', -118, 44], ['Tagih', 104, 56], ['Rekap', 0, -84], ['Cek pesanan', 0, 84]].map(([t, x, y], i) => <span key={t} className="cx-task" style={{ '--tx': x + 'px', '--ty': y + 'px', '--i': i }}>{t}</span>)}
    </div>
  );
}

export default function Problems() {
  const [act, setAct] = useState(0);
  const [seen, setSeen] = useState({});
  const ref = useRef(null);
  useEffect(() => {
    const els = Array.from(ref.current.querySelectorAll('.cx-prob-item'));
    if (!('IntersectionObserver' in window)) { setSeen({ 0: 1, 1: 1, 2: 1, 3: 1, 4: 1 }); return; }
    const mid = new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) setAct(Number(e.target.dataset.i)); }), { rootMargin: '-45% 0px -45% 0px' });
    const vis = new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) { const i = e.target.dataset.i; setSeen((s) => (s[i] ? s : { ...s, [i]: 1 })); } }), { threshold: 0.35 });
    els.forEach((el) => { mid.observe(el); vis.observe(el); });
    return () => { mid.disconnect(); vis.disconnect(); };
  }, []);
  return (
    <div className="cx-prob-grid" ref={ref}>
      <div className="cx-prob-stage" aria-hidden="true">
        {ITEMS.map((_, i) => <Art key={i} k={i} on={act === i} />)}
        <span className="cx-prob-count">{String(act + 1).padStart(2, '0')} / 05</span>
      </div>
      <ol>
        {ITEMS.map(([t, d], i) => (
          <li key={t} data-i={i} className={'cx-prob-item' + (act === i ? ' is' : '')}>
            <Art k={i} on={!!seen[i]} />
            <span className="cx-n">{String(i + 1).padStart(2, '0')}</span>
            <h3>{t}</h3>
            <p>{d}</p>
          </li>
        ))}
      </ol>
    </div>
  );
}
