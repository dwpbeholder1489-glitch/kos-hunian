'use client';

import { useState } from 'react';
import { rp } from '@/lib/format';
import { comparableBasis, portfolioBasisKey } from '@/lib/portfolioBasis';
import styles from './PortfolioContribution.module.css';

const METRICS = { revenue: 'Pendapatan', profit: 'Laba Operasional' };
const COLORS = ['#08704a', '#4aa86d', '#287fa1', '#a67b1a', '#7053a1'];
const percent = new Intl.NumberFormat('id-ID', { style: 'percent', maximumFractionDigits: 1 });
const financialValue = (value) => value == null || value === '' || !Number.isFinite(Number(value)) ? null : Number(value);

export function contributionGroups(businesses, metric) {
  const groups = new Map();
  for (const business of businesses) {
    const value = financialValue(business[metric]);
    if (!business.access || value == null) continue;
    const basis = business.basis || '';
    // Records without a known basis stay on individual rows for comparison.
    const key = portfolioBasisKey(basis, business.id);
    if (!groups.has(key)) groups.set(key, { basis, key, rows: [] });
    groups.get(key).rows.push({ business, value });
  }
  return [...groups.values()].map((group) => {
    const rows = group.rows.sort((a, b) => b.value - a.value || a.business.name.localeCompare(b.business.name, 'id'));
    const total = rows.reduce((sum, row) => sum + row.value, 0);
    const minimum = Math.min(0, ...rows.map(({ value }) => value));
    const maximum = Math.max(0, ...rows.map(({ value }) => value));
    const showShare = Boolean(comparableBasis(group.basis) && rows.length > 1 && minimum >= 0 && total > 0 && rows.every(({ business }) => business.complete));
    return { ...group, rows, total, minimum, maximum, showShare };
  });
}

export default function PortfolioContribution({ businesses, basisLabels, onOpen, period }) {
  const [metric, setMetric] = useState('revenue');
  const groups = contributionGroups(businesses, metric);
  const [view, setView] = useState('bar');
  const canDonut = groups.some((group) => group.showShare);
  return <section className={'panel ' + styles.panel}>
    <div className={styles.header}>
      <div><h3>Kontribusi per Bisnis</h3><p className="small muted">{period} · Sumber: laporan operasional tiap bisnis</p></div>
      <div className={styles.switcher} role="group" aria-label="Metrik kontribusi">
        {Object.entries(METRICS).map(([key, name]) => <button key={key} type="button" className="sm ghost" aria-pressed={metric === key} onClick={() => setMetric(key)}>{name}</button>)}
      </div>
    </div>
    {canDonut && <label className={styles.view}>Lihat<select aria-label="Jenis grafik kontribusi" value={view} onChange={(event) => setView(event.target.value)}><option value="bar">Grafik batang</option><option value="donut">Grafik donat per basis</option></select></label>}
    {groups.length === 0 && <p className="small muted">Belum ada angka yang tersedia untuk periode ini.</p>}
    {groups.length > 1 && <p className="small muted">Lihat kontribusi dalam kelompok basis pencatatan masing-masing.</p>}
    {groups.map((group) => {
      const range = group.maximum - group.minimum || 1;
      const zero = -group.minimum / range * 100;
      const donut = view === 'donut' && group.showShare;
      let end = 0;
      const stops = donut ? group.rows.map((row, i) => {
        const start = end;
        end += row.value / group.total * 100;
        return COLORS[i % COLORS.length] + ' ' + start + '% ' + end + '%';
      }) : [];
      return <div className={styles.group} key={group.key}>
        <div className={styles.groupHeading}><b>{(basisLabels[group.basis] || group.basis || 'Basis belum tercatat') + (group.basis === 'status catatan' ? ' · ' + group.rows[0].business.name : '')}</b>
        </div>
        <div className={donut ? styles.chartLayout : undefined}>
        {donut && <div className={styles.donut} aria-hidden="true" style={{ background: 'conic-gradient(' + stops.join(', ') + ')' }}><div><small>{METRICS[metric]}</small><b>{rp(group.total)}</b></div></div>}
        <ul className={styles.rows}>
          {group.rows.map(({ business, value }, i) => <li key={business.id}>
            <button type="button" className={styles.row} onClick={() => onOpen(business, metric)}>
              <span className={styles.name}>{donut && <i className={styles.swatch} style={{ background: COLORS[i % COLORS.length] }} />}{business.name}{!business.complete && <small> · Perkiraan</small>}</span>
              <span className={styles.figure}>{rp(value)}{group.showShare && <small>{percent.format(value / group.total)}</small>}</span>
              {!donut && <span className={styles.track} aria-hidden="true" style={{ '--zero': zero + '%' }}>
                <span className={value < 0 ? styles.loss : styles.bar} style={{ insetInlineStart: Math.min(zero, zero + value / range * 100) + '%', width: Math.abs(value) / range * 100 + '%' }} />
              </span>}
            </button>
          </li>)}
        </ul></div>
        {group.minimum < 0 && <p className="small muted">Batang di kiri garis nol menunjukkan rugi atau nilai negatif.</p>}
      </div>;
    })}
  </section>;
}
