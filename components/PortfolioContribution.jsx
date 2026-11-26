'use client';

import { useState } from 'react';
import { rp } from '@/lib/format';
import styles from './PortfolioContribution.module.css';

const METRICS = { revenue: 'Pendapatan', profit: 'Laba Operasional' };
const percent = new Intl.NumberFormat('id-ID', { style: 'percent', maximumFractionDigits: 1 });
const financialValue = (value) => value == null || value === '' || !Number.isFinite(Number(value)) ? null : Number(value);

export function contributionGroups(businesses, metric) {
  const groups = new Map();
  for (const business of businesses) {
    const value = financialValue(business[metric]);
    if (!business.access || value == null) continue;
    const basis = business.basis || '';
    // Records without a known basis stay on individual rows for comparison.
    const key = basis ? 'basis:' + basis : 'business:' + business.id;
    if (!groups.has(key)) groups.set(key, { basis, key, rows: [] });
    groups.get(key).rows.push({ business, value });
  }
  return [...groups.values()].map((group) => {
    const rows = group.rows.sort((a, b) => b.value - a.value || a.business.name.localeCompare(b.business.name, 'id'));
    const total = rows.reduce((sum, row) => sum + row.value, 0);
    const minimum = Math.min(0, ...rows.map(({ value }) => value));
    const maximum = Math.max(0, ...rows.map(({ value }) => value));
    const showShare = Boolean(group.basis && rows.length > 1 && minimum >= 0 && total > 0 && rows.every(({ business }) => business.complete));
    return { ...group, rows, total, minimum, maximum, showShare };
  });
}

export default function PortfolioContribution({ businesses, basisLabels, onOpen, period }) {
  const [metric, setMetric] = useState('revenue');
  const groups = contributionGroups(businesses, metric);
  return <section className={'panel ' + styles.panel}>
    <div className={styles.header}>
      <div><h3>Kontribusi per Bisnis</h3><p className="small muted">{period} · Sumber: laporan operasional tiap bisnis</p></div>
      <div className={styles.switcher} role="group" aria-label="Metrik kontribusi">
        {Object.entries(METRICS).map(([key, name]) => <button key={key} type="button" className="sm ghost" aria-pressed={metric === key} onClick={() => setMetric(key)}>{name}</button>)}
      </div>
    </div>
    {groups.length === 0 && <p className="small muted">Belum ada angka yang tersedia untuk periode ini.</p>}
    {groups.length > 1 && <p className="small muted">Lihat kontribusi dalam kelompok basis pencatatan masing-masing.</p>}
    {groups.map((group) => {
      const range = group.maximum - group.minimum || 1;
      const zero = -group.minimum / range * 100;
      return <div className={styles.group} key={group.key}>
        <div className={styles.groupHeading}><b>{basisLabels[group.basis] || group.basis || 'Basis belum tercatat'}</b>
        </div>
        <ul className={styles.rows}>
          {group.rows.map(({ business, value }) => <li key={business.id}>
            <button type="button" className={styles.row} onClick={() => onOpen(business)}>
              <span className={styles.name}>{business.name}{!business.complete && <small> · Perkiraan</small>}</span>
              <span className={styles.figure}>{rp(value)}{group.showShare && <small>{percent.format(value / group.total)}</small>}</span>
              <span className={styles.track} aria-hidden="true" style={{ '--zero': zero + '%' }}>
                <span className={value < 0 ? styles.loss : styles.bar} style={{ insetInlineStart: Math.min(zero, zero + value / range * 100) + '%', width: Math.abs(value) / range * 100 + '%' }} />
              </span>
            </button>
          </li>)}
        </ul>
        {group.minimum < 0 && <p className="small muted">Batang di kiri garis nol menunjukkan rugi atau nilai negatif.</p>}
      </div>;
    })}
  </section>;
}
