'use client';
import { useEffect, useState } from 'react';
import NavIcon from '@/components/NavIcon';
import { compact } from '@/components/Charts';
import { Empty, Loading } from '@/components/ui';
import { errMsg, rp, tglShort } from '@/lib/format';
import { reportQuery, reportRows } from './ReportSources';
import { labelRange, trendPoints } from './report';
import styles from './laporan.module.css';

const series = { omzet: 'Penjualan bersih', kotor: 'Laba kotor', hpp: 'HPP', biaya: 'Biaya operasional' };
const options = [['day', 'Harian'], ['week', 'Mingguan'], ['month', 'Bulanan']];

export default function ReportTrend({ kosId, range, daily, mode, onPoint }) {
  const [group, setGroup] = useState(mode === 'year' || (Date.parse(range.to) - Date.parse(range.from)) / 86400000 > 62 ? 'month' : 'day');
  const [kind, setKind] = useState('omzet');
  const [expenses, setExpenses] = useState(null);
  const [focused, setFocused] = useState(null);
  useEffect(() => {
    if (kind !== 'biaya' || expenses) return;
    let active = true;
    reportRows(() => reportQuery('expenses', 'id,date,amount', 'date', kosId, range).eq('kind', 'operasional'))
      .then((data) => { if (active) setExpenses({ data }); }, (error) => { if (active) setExpenses({ error }); });
    return () => { active = false; };
  }, [kosId, range, kind, expenses]);

  const points = trendPoints(range, daily, expenses?.data || [], group);
  const values = points.map((point) => point[kind]);
  const max = values.reduce((largest, value) => Math.max(largest, value), 1);
  const min = values.reduce((smallest, value) => Math.min(smallest, value), 0);
  const x = (i) => points.length === 1 ? 310 : 62 + i * 490 / (points.length - 1);
  const y = (value) => 18 + (max - value) * 138 / (max - min);
  const current = points.find((point) => point.from === focused) || points.at(-1);
  return <section className={styles.panel}>
    <div className={styles.heading}><h2><NavIcon name="/laporan" />Tren penjualan</h2>
      <div className={styles.controls} aria-label="Pengelompokan tren">{options.map(([value, label]) => <button key={value} aria-pressed={group === value} onClick={() => { setGroup(value); setFocused(null); }}>{label}</button>)}</div>
    </div>
    <div className={styles.controls} aria-label="Indikator tren">{Object.entries(series).map(([key, label]) => <button key={key} aria-pressed={kind === key} onClick={() => setKind(key)}>{label}</button>)}</div>
    {kind === 'biaya' && !expenses ? <Loading /> : kind === 'biaya' && expenses?.error ? <p className="notice bad" role="alert">{errMsg(expenses.error)}</p> : !points.length ? <Empty title="Belum ada periode yang berjalan" /> : <>
      <svg className={styles.chart} viewBox="0 0 584 184" role="group" aria-label={`Grafik ${series[kind]}`}>
        {[max, (max + min) / 2, min].map((value) => <g key={value}><line x1="62" x2="552" y1={y(value)} y2={y(value)} stroke="var(--line)" />
          <text x="56" y={y(value) + 5} textAnchor="end">{compact(value)}</text></g>)}
        <polygon fill="var(--report-mint)" points={`${x(0)},${y(0)} ${points.map((p, i) => `${x(i)},${y(p[kind])}`).join(' ')} ${x(points.length - 1)},${y(0)}`} />
        <polyline points={points.map((p, i) => `${x(i)},${y(p[kind])}`).join(' ')} fill="none" stroke="var(--report-green)" strokeWidth="3" strokeLinejoin="round" />
        {points.map((point, i) => <g key={point.from}>
          <circle cx={x(i)} cy={y(point[kind])} r={points.length > 32 ? 2 : 4} fill="var(--surface)" stroke="var(--report-green)" strokeWidth="2" />
          <circle cx={x(i)} cy={y(point[kind])} r={Math.min(11, 232 / Math.max(1, points.length - 1))} className={styles.chartTarget}
            tabIndex="0" role="button" aria-label={`${labelRange(point)} · ${series[kind]} ${rp(point[kind])}`}
            onMouseEnter={() => setFocused(point.from)} onFocus={() => setFocused(point.from)} onClick={() => onPoint(kind, point)}
            onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onPoint(kind, point); } }} />
          {(i === points.length - 1 || (i % Math.ceil(points.length / 6) === 0 && i < points.length - 2)) &&
            <text x={x(i)} y="178" textAnchor="middle">{tglShort(point.from)}</text>}
        </g>)}
      </svg>
      <button className={styles.chartRead} onClick={() => onPoint(kind, current)}><span>{labelRange(current)} · {series[kind]}</span><b>{rp(current[kind])}</b><NavIcon name="next" size={14} /></button>
    </>}
  </section>;
}
