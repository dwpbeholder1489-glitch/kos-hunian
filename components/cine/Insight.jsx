'use client';
import { useEffect, useRef, useState } from 'react';
import { useCount, rp } from './useCount';

// DATA CONTOH (ilustrasi) per periode: pendapatan & pengeluaran (ribu rupiah), produk teratas, ketepatan waktu.
const SETS = {
  '7 hari': { lab: ['Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab', 'Min'], inc: [820, 760, 910, 880, 1040, 1320, 1180], exp: [540, 510, 600, 560, 690, 800, 720], d: ['+6%', '+4%', '+9%'], top: [['Beras 5 kg', 42], ['Minyak 1 L', 35], ['Gula 1 kg', 28], ['Telur 1 kg', 21]], tepat: 94 },
  '30 hari': { lab: ['M1', 'M2', 'M3', 'M4'], inc: [5600, 6100, 5900, 7200], exp: [3900, 4200, 4000, 4700], d: ['+12%', '+7%', '+18%'], top: [['Beras 5 kg', 168], ['Minyak 1 L', 141], ['Gula 1 kg', 117], ['Telur 1 kg', 96]], tepat: 92 },
  '12 bulan': { lab: ['Des', 'Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov'], inc: [18200, 17600, 18900, 20100, 19400, 21800, 22600, 21900, 23400, 24100, 23800, 24800], exp: [13900, 13600, 14100, 14800, 14600, 15700, 16100, 15900, 16600, 17000, 16900, 17400], d: ['+36%', '+25%', '+72%'], top: [['Beras 5 kg', 1940], ['Minyak 1 L', 1622], ['Gula 1 kg', 1385], ['Telur 1 kg', 1104]], tepat: 91 },
};
const W = 600, H = 220, PL = 6, PR = 6, PT = 14, PB = 6;

export default function Insight() {
  const [per, setPer] = useState('30 hari');
  const [go, setGo] = useState(false);
  const [hov, setHov] = useState(null);
  const ref = useRef(null);
  useEffect(() => {
    if (!('IntersectionObserver' in window)) { setGo(true); return; }
    const io = new IntersectionObserver((es) => { if (es.some((e) => e.isIntersecting)) { setGo(true); io.disconnect(); } }, { threshold: 0.25 });
    io.observe(ref.current);
    return () => io.disconnect();
  }, []);
  const s = SETS[per];
  const sum = (a) => a.reduce((x, y) => x + y, 0) * 1000;
  const inc = sum(s.inc), exp = sum(s.exp), laba = inc - exp;
  const aInc = useCount(go ? inc : 0, true, 900), aExp = useCount(go ? exp : 0, true, 900), aLaba = useCount(go ? laba : 0, true, 900), aTepat = useCount(go ? s.tepat : 0, true, 900);
  const max = Math.max(...s.inc) * 1.08, n = s.lab.length;
  const x = (i) => PL + (i * (W - PL - PR)) / (n - 1);
  const y = (v) => PT + (1 - v / max) * (H - PT - PB);
  const path = (a) => a.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join(' ');
  const pctX = (i) => (x(i) / W) * 100 + '%';
  const pctY = (v) => `calc((100% - 26px) * ${(y(v) / H).toFixed(4)})`;
  const move = (e) => {
    const r = e.currentTarget.getBoundingClientRect();
    const f = ((e.clientX - r.left) / r.width) * W;
    setHov(Math.max(0, Math.min(n - 1, Math.round(((f - PL) / (W - PL - PR)) * (n - 1)))));
  };
  const topMax = s.top[0][1];
  const step = Math.ceil(n / 6);
  return (
    <div className={'cx-bi' + (go ? ' go' : '')} ref={ref}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <div className="cx-seg" role="group" aria-label="Periode">
          {Object.keys(SETS).map((p) => <button key={p} type="button" aria-pressed={p === per} className={p === per ? 'on' : ''} onClick={() => { setPer(p); setHov(null); }}>{p}</button>)}
        </div>
        <span className="cx-tagdemo">Data contoh</span>
      </div>
      <div className="cx-bi-kpis">
        <div className="cx-bi-kpi"><span>Pendapatan</span><b>{rp(aInc)}</b><em>{s.d[0]}</em></div>
        <div className="cx-bi-kpi"><span>Pengeluaran</span><b>{rp(aExp)}</b><em className="dn">{s.d[1]}</em></div>
        <div className="cx-bi-kpi"><span>Laba operasional</span><b>{rp(aLaba)}</b><em>{s.d[2]}</em></div>
        <div className="cx-bi-kpi"><span>Pesanan tepat waktu</span><b>{Math.round(aTepat)}%</b><small>produktivitas operasional</small></div>
      </div>
      <div className="cx-bi-chart" onPointerMove={move} onPointerDown={move} onPointerLeave={() => setHov(null)}>
        <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" role="img" aria-label={`Grafik pendapatan dan pengeluaran ${per}, data contoh. Pendapatan ${rp(inc)}, pengeluaran ${rp(exp)}.`}>
          {[0, 0.25, 0.5, 0.75, 1].map((g) => <line key={g} className="gr" x1={PL} x2={W - PR} y1={y(max * g * 0.92)} y2={y(max * g * 0.92)} />)}
          <path key={per + 'e'} className="ln ln2" pathLength="1" d={path(s.exp)} />
          <path key={per + 'i'} className="ln" pathLength="1" d={path(s.inc)} />
          {hov != null && <line className="vl" x1={x(hov)} x2={x(hov)} y1={PT} y2={H - PB} />}
        </svg>
        {s.lab.map((l, i) => (i % step === 0 || i === n - 1) && (i === n - 1 || n - 1 - i >= step) && <span key={l + i} className={'cx-xl' + (i === 0 ? ' s' : i === n - 1 ? ' e' : '')} style={{ left: pctX(i) }} aria-hidden="true">{l}</span>)}
        {hov != null && <><span className="cx-pt" style={{ left: pctX(hov), top: pctY(s.inc[hov]) }} /><span className="cx-pt b" style={{ left: pctX(hov), top: pctY(s.exp[hov]) }} /></>}
        {hov != null && <div className="cx-tip" style={{ left: `clamp(70px, ${(x(hov) / W) * 100}%, calc(100% - 70px))` }}><b>{s.lab[hov]}</b>Masuk {rp(s.inc[hov] * 1000)}<br />Keluar {rp(s.exp[hov] * 1000)}</div>}
      </div>
      <div className="cx-legend"><span><i />Pendapatan</span><span><i className="b" />Pengeluaran</span><span>Sentuh grafik untuk melihat angkanya</span></div>
      <div className="cx-top" key={per}>
        <b style={{ fontSize: 14 }}>Performa produk · terjual</b>
        {s.top.map(([t, v]) => <div key={t}><span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t}</span><i style={{ '--w': (v / topMax).toFixed(3) }} /><span>{new Intl.NumberFormat('id-ID').format(v)}</span></div>)}
      </div>
    </div>
  );
}
