'use client';
// Grafik SVG ringan untuk Analisis Bisnis (tanpa pustaka). Semua titik/batang bisa ditekan (onPick) untuk drill-down;
// keyboard: Tab ke elemen lalu Enter/Spasi. Warna mengikuti identitas PRASARA (hijau), merah hanya untuk nilai negatif.
import { useEffect, useRef, useState } from 'react';
import styles from './analisis.module.css';

const n = (v) => Number(v || 0);
const compact = new Intl.NumberFormat('id-ID', { notation: 'compact', maximumFractionDigits: 1 });
export const short = (v) => (Math.abs(n(v)) >= 1000 ? compact.format(n(v)).replace(/\s/g, ' ') : String(Math.round(n(v))));
const key = (fn) => (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fn(); } };
export const C = { dark: '#0B6B3A', main: '#15803D', mid: '#4CC46F', light: '#A7E3B5', pale: '#DDF4E3', amber: '#F2C94C', red: '#E5484D', grey: '#C9D3CE' };

// Skala nilai yang "rapi" (0, 10 jt, 20 jt, …)
function ticks(min, max, count = 5) {
  if (max === min) max = min + 1;
  const raw = (max - min) / (count - 1); const mag = 10 ** Math.floor(Math.log10(Math.abs(raw) || 1));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) || raw;
  const lo = Math.floor(min / step) * step; const hi = Math.ceil(max / step) * step;
  const out = []; for (let v = lo; v <= hi + step / 2; v += step) out.push(Math.round(v * 100) / 100);
  return out;
}

// Lebar nyata wadah → viewBox selebar piksel, sehingga teks sumbu tetap 11px di HP maupun layar lebar
function useWidth(fallback) {
  const ref = useRef(null); const [w, setW] = useState(fallback);
  useEffect(() => {
    const el = ref.current; if (!el) return undefined;
    const ro = new ResizeObserver(([e]) => { const x = Math.round(e.contentRect.width); if (x > 0) setW(x); });
    ro.observe(el); return () => ro.disconnect();
  }, []);
  return [ref, w];
}

export function Gauge({ score, size = 150, label = 'dari 100' }) {
  const r = 42; const len = 2 * Math.PI * r; const v = score == null ? 0 : Math.max(0, Math.min(100, score));
  const color = score == null ? C.grey : v >= 65 ? C.main : v >= 45 ? C.amber : C.red;
  return <svg className={styles.gauge} viewBox="0 0 100 100" width={size} height={size} role="img" aria-label={score == null ? 'Skor belum dihitung' : `Skor ${score} dari 100`}>
    <circle cx="50" cy="50" r={r} fill="none" stroke="var(--line)" strokeWidth="9" />
    <circle cx="50" cy="50" r={r} fill="none" stroke={color} strokeWidth="9" strokeLinecap="round" strokeDasharray={`${(len * v) / 100} ${len}`} transform="rotate(-90 50 50)" />
    <text x="50" y="52" textAnchor="middle" className={styles.gaugeNum}>{score == null ? '—' : score}</text>
    <text x="50" y="67" textAnchor="middle" className={styles.gaugeSub}>{label}</text>
  </svg>;
}

// Grafik garis/area. points: [{label, short}], series: [{key,label,color,area}], proj: {index, value, low, high} (garis putus-putus)
export function TrendChart({ points, series, onPick, height = 210, money = true, proj }) {
  const [hover, setHover] = useState(null);
  const [ref, W] = useWidth(640);
  const H = height, L = 46, R = 14, T = 14, B = 26;
  const all = points.flatMap((p) => series.map((s) => n(p[s.key]))).concat(proj ? [proj.high] : []);
  const tk = ticks(Math.min(0, ...all), Math.max(1, ...all));
  const lo = tk[0], hi = tk[tk.length - 1];
  const count = points.length + (proj ? 1 : 0);
  const x = (i) => L + ((W - L - R) * i) / Math.max(1, count - 1);
  const y = (v) => T + ((hi - v) * (H - T - B)) / (hi - lo || 1);
  const sel = hover ?? null;
  const every = Math.ceil(count / Math.max(3, Math.floor(W / 56)));
  return <div className={styles.chartBox} ref={ref}>
    <svg viewBox={`0 0 ${W} ${H}`} height={H} className={styles.svg} role="img" aria-label={series.map((s) => s.label).join(' dan ')} onMouseLeave={() => setHover(null)}>
      <defs>{series.filter((s) => s.area).map((s) => <linearGradient key={s.key} id={'g' + s.key} x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor={s.color} stopOpacity=".28" /><stop offset="1" stopColor={s.color} stopOpacity=".02" /></linearGradient>)}</defs>
      {tk.map((v) => <g key={v}><line x1={L} x2={W - R} y1={y(v)} y2={y(v)} className={styles.gl} /><text x={L - 6} y={y(v) + 4} textAnchor="end" className={styles.axis}>{money ? short(v) : v}</text></g>)}
      {series.map((s) => {
        const pts = points.map((p, i) => [x(i), y(n(p[s.key]))]);
        return <g key={s.key}>
          {s.area && pts.length > 1 && <path d={`M${pts[0][0]},${y(Math.max(lo, 0))} ${pts.map((q) => `L${q[0]},${q[1]}`).join(' ')} L${pts[pts.length - 1][0]},${y(Math.max(lo, 0))}Z`} fill={`url(#g${s.key})`} />}
          <polyline points={pts.map((q) => q.join(',')).join(' ')} fill="none" stroke={s.color} strokeWidth="2.6" strokeLinejoin="round" />
          {pts.map((q, i) => <circle key={i} cx={q[0]} cy={q[1]} r={count > 20 ? 2.2 : 4} fill="var(--surface)" stroke={s.color} strokeWidth="2" />)}
        </g>;
      })}
      {proj && points.length > 0 && <g>
        <line x1={x(points.length - 1)} y1={y(n(points[points.length - 1][series[0].key]))} x2={x(points.length)} y2={y(proj.value)} stroke={series[0].color} strokeWidth="2.4" strokeDasharray="5 5" />
        <line x1={x(points.length)} x2={x(points.length)} y1={y(proj.high)} y2={y(proj.low)} stroke={series[0].color} strokeOpacity=".5" strokeWidth="6" strokeLinecap="round" />
        <circle cx={x(points.length)} cy={y(proj.value)} r="4" fill="var(--surface)" stroke={series[0].color} strokeWidth="2" strokeDasharray="2 2" />
      </g>}
      {sel != null && <line x1={x(sel)} x2={x(sel)} y1={T} y2={H - B} className={styles.cursor} />}
      {points.map((p, i) => (i % every === 0 || i === points.length - 1) && <text key={i} x={x(i)} y={H - 7} textAnchor="middle" className={styles.axis}>{p.short}</text>)}
      {proj && <text x={x(points.length)} y={H - 7} textAnchor="middle" className={styles.axis}>{proj.short}</text>}
      {points.map((p, i) => <rect key={i} x={x(i) - (W - L - R) / Math.max(2, count) / 2} y={T} width={(W - L - R) / Math.max(2, count)} height={H - T - B} fill="transparent"
        className={styles.hit} tabIndex={0} role="button" aria-label={`${p.label}: ${series.map((s) => `${s.label} ${money ? short(p[s.key]) : p[s.key]}`).join(', ')}`}
        onMouseEnter={() => setHover(i)} onFocus={() => setHover(i)} onClick={() => onPick?.(i)} onKeyDown={key(() => onPick?.(i))} />)}
    </svg>
    {sel != null && points[sel] && <div className={styles.tip} style={{ left: `${(x(sel) / W) * 100}%` }}>
      <b>{points[sel].label}</b>{series.map((s) => <span key={s.key}><i style={{ background: s.color }} />{s.label}<em>{s.fmt ? s.fmt(points[sel][s.key]) : short(points[sel][s.key])}</em></span>)}
    </div>}
  </div>;
}

// Batang berkelompok (Laba Rugi): groups [{label, values:[v…]}], series [{label,color}]
export function GroupBars({ groups, series, onPick, height = 170 }) {
  const [ref, W] = useWidth(300); const H = height, L = 40, B = 22, T = 8;
  const all = groups.flatMap((g) => g.values.map(n));
  const tk = ticks(Math.min(0, ...all), Math.max(1, ...all), 5); const lo = tk[0], hi = tk[tk.length - 1];
  const y = (v) => T + ((hi - v) * (H - T - B)) / (hi - lo || 1);
  const gw = (W - L - 6) / groups.length; const bw = Math.min(26, (gw - 14) / series.length);
  return <div ref={ref} className={styles.chartBox}><svg viewBox={`0 0 ${W} ${H}`} height={H} className={styles.svg} role="img" aria-label="Perbandingan laba rugi">
    {tk.map((v) => <g key={v}><line x1={L} x2={W} y1={y(v)} y2={y(v)} className={styles.gl} /><text x={L - 5} y={y(v) + 4} textAnchor="end" className={styles.axis}>{short(v)}</text></g>)}
    {groups.map((g, gi) => <g key={g.label}>
      {g.values.map((v, si) => { const x0 = L + gi * gw + (gw - bw * series.length) / 2 + si * bw; const top = y(Math.max(0, n(v))); const h = Math.abs(y(n(v)) - y(0));
        return <rect key={si} x={x0 + 1} y={top} width={bw - 2} height={Math.max(1, h)} rx="2" fill={n(v) < 0 ? C.red : series[si].color} className={styles.hit} tabIndex={0} role="button"
          aria-label={`${g.label} ${series[si].label} ${short(v)}`} onClick={() => onPick?.(gi, si)} onKeyDown={key(() => onPick?.(gi, si))}><title>{`${g.label} · ${series[si].label}: ${short(v)}`}</title></rect>; })}
      <text x={L + gi * gw + gw / 2} y={H - 6} textAnchor="middle" className={styles.axis}>{g.label}</text>
    </g>)}
  </svg></div>;
}

// Batang neto positif/negatif (Arus kas per minggu/bulan)
export function NetBars({ items, onPick, height = 170 }) {
  const [ref, W] = useWidth(300); const H = height, L = 40, B = 22, T = 8;
  const all = items.map((i) => n(i.value));
  const tk = ticks(Math.min(0, ...all), Math.max(1, ...all), 6); const lo = tk[0], hi = tk[tk.length - 1];
  const y = (v) => T + ((hi - v) * (H - T - B)) / (hi - lo || 1);
  const gw = (W - L - 4) / Math.max(1, items.length); const bw = Math.min(34, gw * 0.6);
  return <div ref={ref} className={styles.chartBox}><svg viewBox={`0 0 ${W} ${H}`} height={H} className={styles.svg} role="img" aria-label="Arus kas bersih per periode">
    {tk.map((v) => <g key={v}><line x1={L} x2={W} y1={y(v)} y2={y(v)} className={styles.gl} /><text x={L - 5} y={y(v) + 4} textAnchor="end" className={styles.axis}>{short(v)}</text></g>)}
    {items.map((it, i) => { const v = n(it.value); const x0 = L + i * gw + (gw - bw) / 2;
      return <g key={i}><rect x={x0} y={y(Math.max(0, v))} width={bw} height={Math.max(1, Math.abs(y(v) - y(0)))} rx="2" fill={v < 0 ? C.red : C.mid} className={styles.hit}
        tabIndex={0} role="button" aria-label={`${it.label}: ${short(v)}`} onClick={() => onPick?.(i)} onKeyDown={key(() => onPick?.(i))}><title>{`${it.title || it.label}: ${short(v)}`}</title></rect>
        <text x={x0 + bw / 2} y={H - 6} textAnchor="middle" className={styles.axis}>{it.label}</text></g>; })}
  </svg></div>;
}

// Donut (perilaku pelanggan). parts: [{label, value, color}]
export function Donut({ parts, center, sub, onPick, size = 128 }) {
  const total = parts.reduce((t, p) => t + n(p.value), 0); const r = 38; const len = 2 * Math.PI * r; let acc = 0;
  return <svg viewBox="0 0 100 100" width={size} height={size} className={styles.donut} role="img" aria-label={parts.map((p) => `${p.label} ${p.value}`).join(', ')}>
    <circle cx="50" cy="50" r={r} fill="none" stroke="var(--line)" strokeWidth="13" />
    {total > 0 && parts.map((p, i) => { const part = (n(p.value) / total) * len; const el = <circle key={i} cx="50" cy="50" r={r} fill="none" stroke={p.color} strokeWidth="13"
      strokeDasharray={`${Math.max(0, part - 0.6)} ${len}`} strokeDashoffset={-acc} transform="rotate(-90 50 50)" className={styles.hit} tabIndex={0} role="button"
      aria-label={`${p.label}: ${p.value}`} onClick={() => onPick?.(i)} onKeyDown={key(() => onPick?.(i))}><title>{`${p.label}: ${p.value}`}</title></circle>; acc += part; return el; })}
    <text x="50" y="50" textAnchor="middle" className={styles.donutNum}>{center}</text>
    <text x="50" y="62" textAnchor="middle" className={styles.gaugeSub}>{sub}</text>
  </svg>;
}

// Waterfall: steps [{label, value, total?}] — total = batang dari 0
export function Waterfall({ steps, onPick, height = 210 }) {
  const [ref, W] = useWidth(420); const H = height, L = 46, B = 34, T = 10;
  let run = 0; const bars = steps.map((s) => { const start = s.total ? 0 : run; const end = s.total ? n(s.value) : run + n(s.value); run = end; return { ...s, start, end }; });
  const all = bars.flatMap((b) => [b.start, b.end]);
  const tk = ticks(Math.min(0, ...all), Math.max(1, ...all)); const lo = tk[0], hi = tk[tk.length - 1];
  const y = (v) => T + ((hi - v) * (H - T - B)) / (hi - lo || 1);
  const gw = (W - L) / bars.length; const bw = gw * 0.62;
  return <div ref={ref} className={styles.chartBox}><svg viewBox={`0 0 ${W} ${H}`} height={H} className={styles.svg} role="img" aria-label="Jembatan laba: dari pendapatan ke laba bersih">
    {tk.map((v) => <g key={v}><line x1={L} x2={W} y1={y(v)} y2={y(v)} className={styles.gl} /><text x={L - 5} y={y(v) + 4} textAnchor="end" className={styles.axis}>{short(v)}</text></g>)}
    {bars.map((b, i) => { const x0 = L + i * gw + (gw - bw) / 2; const fill = b.total ? (b.end < 0 ? C.red : C.dark) : n(b.value) < 0 ? C.red : C.mid;
      return <g key={i}>
        <rect x={x0} y={y(Math.max(b.start, b.end))} width={bw} height={Math.max(1, Math.abs(y(b.start) - y(b.end)))} rx="2" fill={fill} className={styles.hit} tabIndex={0} role="button"
          aria-label={`${b.label}: ${short(b.value)}`} onClick={() => onPick?.(i)} onKeyDown={key(() => onPick?.(i))}><title>{`${b.label}: ${short(b.value)}`}</title></rect>
        {i < bars.length - 1 && <line x1={x0 + bw} x2={x0 + gw} y1={y(b.end)} y2={y(b.end)} stroke="var(--muted)" strokeDasharray="3 3" />}
        <text x={x0 + bw / 2} y={y(Math.max(b.start, b.end)) - 4} textAnchor="middle" className={styles.axis}>{short(b.value)}</text>
        <text x={x0 + bw / 2} y={H - 18} textAnchor="middle" className={styles.axis}>{b.label.split(' ')[0]}</text>
        <text x={x0 + bw / 2} y={H - 6} textAnchor="middle" className={styles.axis}>{b.label.split(' ').slice(1).join(' ')}</text>
      </g>; })}
  </svg></div>;
}

// Peta panas hari × jam. cells: [{h:1..7, j:0..23, n, nilai}]
export function Heatmap({ cells, days, onPick }) {
  const hours = cells.length ? [Math.min(...cells.map((c) => c.j)), Math.max(...cells.map((c) => c.j))] : [8, 20];
  const hs = []; for (let j = hours[0]; j <= hours[1]; j++) hs.push(j);
  const max = Math.max(1, ...cells.map((c) => n(c.n)));
  const at = (h, j) => cells.find((c) => c.h === h && c.j === j);
  return <div className={styles.heat} style={{ gridTemplateColumns: `52px repeat(${hs.length}, minmax(14px, 1fr))` }} role="table" aria-label="Jumlah transaksi per hari dan jam">
    <span />{hs.map((j) => <span key={j} className={styles.heatH}>{j % 2 === 0 ? String(j).padStart(2, '0') : ''}</span>)}
    {days.map((d, hi) => <div key={d} role="row" style={{ display: 'contents' }}>
      <span className={styles.heatD}>{d.slice(0, 3)}</span>
      {hs.map((j) => { const c = at(hi + 1, j); const v = c ? n(c.n) / max : 0;
        return <button key={j} type="button" className={styles.heatC} style={{ background: v ? `color-mix(in srgb, ${C.main} ${Math.round(12 + v * 88)}%, var(--surface))` : undefined }}
          aria-label={`${d} ${j}.00: ${c ? c.n : 0} transaksi`} title={`${d} ${String(j).padStart(2, '0')}.00 · ${c ? c.n : 0} transaksi`} onClick={() => c && onPick?.(c)} />; })}
    </div>)}
  </div>;
}
