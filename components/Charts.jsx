'use client';
// Grafik sederhana & ringan (HTML, tanpa pustaka): perbandingan 2 seri per bulan, kolom harian, daftar batang.
// Aturan: batang ≤24px, ujung 4px, celah 2px, garis bantu tipis, satu sumbu, label pakai warna teks.
// Ketuk/arahkan kursor ke kolom untuk membaca angkanya; tabel angka tetap ada di halaman laporan.
import { useState } from 'react';

const rp = (n) => 'Rp' + new Intl.NumberFormat('id-ID').format(Math.round(Number(n) || 0));
export const compact = (n) => {
  const a = Math.abs(n);
  if (a >= 1e9) return `${(n / 1e9).toLocaleString('id-ID', { maximumFractionDigits: 1 })} M`;
  if (a >= 1e6) return `${(n / 1e6).toLocaleString('id-ID', { maximumFractionDigits: 1 })} jt`;
  if (a >= 1e3) return `${Math.round(n / 1e3).toLocaleString('id-ID')} rb`;
  return String(Math.round(n));
};
// batas atas sumbu yang "bulat"
function niceMax(v) {
  if (!(v > 0)) return 1;
  const p = 10 ** Math.floor(Math.log10(v)); const f = v / p;
  return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * p;
}

function Plot({ max, children }) {
  return (
    <div className="chart-plot">
      {[1, 0.5, 0].map((t) => <div key={t} className="chart-grid" style={{ top: `${(1 - t) * 100}%` }}><span>{compact(max * t)}</span></div>)}
      <div className="chart-cols">{children}</div>
    </div>
  );
}

// Dua seri per periode (mis. Pendapatan vs Biaya per bulan)
export function CompareBars({ data, a, b, title, read }) {
  const [sel, setSel] = useState(data.length - 1);
  const max = niceMax(Math.max(...data.flatMap((d) => [d.a, d.b]), 0));
  const cur = data[sel] || data[data.length - 1];
  return (
    <div className="chart" role="group" aria-label={title}>
      <div className="chart-legend"><span><i style={{ background: 'var(--chart-1)' }} />{a}</span><span><i style={{ background: 'var(--chart-2)' }} />{b}</span></div>
      <Plot max={max}>{data.map((d, i) => (
        <button key={d.key || d.label} type="button" className={'chart-col' + (i === sel ? ' on' : '')} onClick={() => setSel(i)} onMouseEnter={() => setSel(i)}
          aria-label={`${d.label}: ${a} ${rp(d.a)}, ${b} ${rp(d.b)}`} aria-pressed={i === sel}>
          <i style={{ height: `${(Math.max(0, d.a) / max) * 100}%`, background: 'var(--chart-1)' }} />
          <i style={{ height: `${(Math.max(0, d.b) / max) * 100}%`, background: 'var(--chart-2)' }} />
        </button>
      ))}</Plot>
      <div className="chart-x">{data.map((d) => <span key={d.key || d.label}>{d.short || d.label}</span>)}</div>
      {cur && <div className="chart-read" aria-live="polite"><b>{cur.label}</b> · {a} {rp(cur.a)} · {b} {rp(cur.b)}{read ? read(cur) : ''}</div>}
    </div>
  );
}

// Satu seri per hari (mis. penjualan harian). Label sumbu-x dijarangkan agar tidak bertumpuk.
export function DayColumns({ data, title, unit = '' }) {
  const [sel, setSel] = useState(null);
  const max = niceMax(Math.max(...data.map((d) => d.value), 0));
  const every = data.length > 20 ? 5 : data.length > 10 ? 3 : 1;
  const cur = sel != null ? data[sel] : null;
  const best = data.reduce((m, d, i) => (d.value > (data[m]?.value ?? -1) ? i : m), 0);
  return (
    <div className="chart" role="group" aria-label={title}>
      <Plot max={max}>{data.map((d, i) => (
        <button key={d.key} type="button" className={'chart-col' + (i === sel ? ' on' : '')} style={{ padding: '0 1px' }} onClick={() => setSel(i)} onMouseEnter={() => setSel(i)} aria-label={`${d.label}: ${rp(d.value)}`}>
          <i style={{ height: `${(Math.max(0, d.value) / max) * 100}%`, background: 'var(--chart-1)', borderRadius: data.length > 20 ? '2px 2px 0 0' : undefined }} />
        </button>
      ))}</Plot>
      <div className="chart-x">{data.map((d, i) => <span key={d.key}>{i % every === 0 || i === data.length - 1 ? d.short : ''}</span>)}</div>
      <div className="chart-read" aria-live="polite">{cur ? <><b>{cur.label}</b> · {rp(cur.value)}{cur.note ? ` · ${cur.note}` : ''}</> : data.length ? <span className="muted">Tertinggi {data[best].label}: {rp(data[best].value)} · ketuk kolom untuk detail</span> : null}</div>
    </div>
  );
}

// Daftar batang mendatar (komposisi / peringkat), sisanya digabung ke "Lainnya"
export function BarList({ items, limit = 6, format = rp, other = 'Lainnya' }) {
  const sorted = items.filter((x) => Number(x.value) > 0).sort((p, q) => q.value - p.value);
  const top = sorted.slice(0, limit);
  const rest = sorted.slice(limit).reduce((s, x) => s + Number(x.value), 0);
  const rows = rest > 0 ? [...top, { label: `${other} (${sorted.length - limit})`, value: rest }] : top;
  const total = sorted.reduce((s, x) => s + Number(x.value), 0);
  const max = Math.max(...rows.map((x) => x.value), 1);
  if (!rows.length) return null;
  return (
    <div className="barlist">{rows.map((x) => (
      <div className="barlist-row" key={x.label}>
        <span className="l">{x.label}{x.sub ? <span className="muted"> · {x.sub}</span> : null}</span>
        <b>{format(x.value)}<span className="muted" style={{ fontWeight: 400 }}> · {Math.round((x.value / total) * 100)}%</span></b>
        <span className="t" aria-hidden="true"><i style={{ width: `${(x.value / max) * 100}%` }} /></span>
      </div>
    ))}</div>
  );
}
