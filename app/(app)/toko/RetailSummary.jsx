'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import NavIcon from '@/components/NavIcon';
import { compact } from '@/components/Charts';
import { Loading } from '@/components/ui';
import { supabase } from '@/lib/supabase';
import { angka, errMsg, rp } from '@/lib/format';
import { moveDay, num, retailReportLink, retailTrendDays, RETAIL_GROUPS } from './retail-summary';
import styles from './retail-home.module.css';

const SERIES = {
  omzet: ['Penjualan', rp], laba: ['Laba kotor', rp], biaya: ['Pengeluaran operasional', rp], trx: ['Transaksi', angka],
};

export function CompactKpis({ items, prefs, onDetail }) {
  const byId = new Map(items.map((item) => [item.id, item]));
  const selected = prefs.pref.kpis;
  const groups = Array.isArray(selected)
    ? [['Angka utama', selected]]
    : RETAIL_GROUPS;
  return <>{groups.map(([title, ids]) => {
    const rows = ids.map((id) => byId.get(id)).filter(Boolean);
    if (!rows.length) return null;
    return <section key={title} className={styles.kpiGroup} data-custom={Array.isArray(selected) || undefined}>
      <h3>{title}</h3><div className={styles.kpiGrid}>{rows.map((item) => {
        const content = <>
          <NavIcon name={item.icon} size={20} /><span className={styles.kpiCopy}>
            <b>{item.label}</b><strong className={item.value.length > 12 ? styles.longValue : undefined}>{item.value}</strong>
            {item.sub && <small>{item.sub}</small>}
            {item.change && <span className={styles.change} data-tone={item.change.tone}><b>{item.change.valueText}</b><small>{item.change.comparison}</small></span>}
          </span><NavIcon name="next" size={14} />
        </>;
        const props = { className: styles.kpi, 'data-primary': item.id === 'omzet' || undefined, 'data-tone': item.tone };
        return item.href ? <Link key={item.id} href={item.href} {...props}>{content}</Link>
          : <button key={item.id} {...props} onClick={() => onDetail(item)}>{content}</button>;
      })}</div>
    </section>;
  })}</>;
}

async function dailyExpenses(kosId, from, to) {
  const sums = new Map();
  const limit = 500;
  for (let start = 0; ; start += limit) {
    const { data, error } = await supabase.from('expenses').select('id,date,amount').eq('kos_id', kosId)
      .eq('kind', 'operasional').gte('date', from).lte('date', to).order('id').range(start, start + limit - 1);
    if (error) throw error;
    for (const row of data) sums.set(row.date, num(sums.get(row.date)) + Math.round(num(row.amount) * 100));
    if (data.length < limit) return sums;
  }
}

export function RetailTrend({ kosId, ver, to, data }) {
  const [series, setSeries] = useState('omzet');
  const [selected, setSelected] = useState(null);
  const [expense, setExpense] = useState(null);
  const expenseKey = kosId + ':' + to + ':' + ver;
  useEffect(() => {
    if (series !== 'biaya' || expense?.key === expenseKey) return;
    let active = true;
    dailyExpenses(kosId, moveDay(to, -29), to).then((rows) => { if (active) setExpense({ key: expenseKey, rows }); },
      (error) => { if (active) setExpense({ key: expenseKey, error }); });
    return () => { active = false; };
  }, [series, expenseKey, expense]);
  const expenses = expense?.key === expenseKey ? expense : null;
  const rows = retailTrendDays(to, data.harian || [], expenses?.rows);
  const [label, fmt] = SERIES[series];
  const current = selected == null ? rows.at(-1) : rows[selected];
  const max = Math.max(1, ...rows.map((row) => row[series]));
  const min = Math.min(0, ...rows.map((row) => row[series]));
  const x = (i) => 62 + i * 493 / (rows.length - 1);
  const y = (v) => 15 + (max - v) * 128 / (max - min);
  const line = rows.map((row, i) => x(i) + ',' + y(row[series])).join(' ');
  return <div className={styles.trend}>
    <label className={styles.trendPicker}>Indikator grafik<select aria-label="Indikator grafik" value={series} onChange={(event) => setSeries(event.target.value)}>
      {Object.entries(SERIES).map(([id, [name]]) => <option key={id} value={id}>{name}</option>)}
    </select></label>
    {series === 'biaya' && !expenses ? <Loading rows={2} /> : series === 'biaya' && expenses.error ? <p role="alert" className="notice bad">{errMsg(expenses.error)}</p> : <>
      <svg className={styles.plot} viewBox="0 0 586 171" role="group" aria-label={`Grafik ${label} 30 hari`}>
        {[min, (min + max) / 2, max].map((value) => <g key={value}><line x1="62" x2="555" y1={y(value)} y2={y(value)} stroke="var(--line)" />
          <text x="56" y={y(value) + 4} textAnchor="end">{compact(value)}</text></g>)}
        <polygon points={`${x(0)},${y(0)} ${line} ${x(rows.length - 1)},${y(0)}`} className={styles.fill} />
        <polyline points={line} fill="none" className={styles.line} strokeWidth="3" strokeLinejoin="round" />
        {rows.map((row, i) => <g key={row.date}>
          {(i % 6 === 0 || i === rows.length - 1) && <text x={x(i)} y="163" textAnchor="middle">{row.short}</text>}
          <circle cx={x(i)} cy={y(row[series])} r={row === current ? 4.5 : 2.5} className={styles.dot} strokeWidth="2" />
          <circle cx={x(i)} cy={y(row[series])} r="8" className={styles.target} tabIndex="0" role="button"
            aria-label={`${row.label} · ${label} ${fmt(row[series])}`} aria-pressed={row === current}
            onMouseEnter={() => setSelected(i)} onFocus={() => setSelected(i)} onClick={() => setSelected(i)}
            onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); setSelected(i); } }} />
        </g>)}
      </svg>
      <Link className={styles.trendSource} href={retailReportLink({ from: current.date, to: current.date }, 'laba-rugi-toko')}>
        <span>{current.label} · {label}</span><b>{fmt(current[series])}</b><NavIcon name="next" size={16} />
      </Link>
    </>}
  </div>;
}

export function CostSources({ kosId, item, purchaseAccess }) {
  const [result, setResult] = useState(null);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!open) return;
    let active = true;
    supabase.from('stock_moves').select('id,created_at,delta,value,note').eq('kos_id', kosId)
      .eq('product_id', item.product_id).eq('kind', 'beli').gt('delta', 0).gt('value', 0)
      .order('created_at', { ascending: false }).order('id', { ascending: false }).limit(2)
      .then(({ data, error }) => { if (active) setResult({ data, error }); });
    return () => { active = false; };
  }, [kosId, item.product_id, open]);
  return <details onToggle={(event) => setOpen(event.currentTarget.open)} className={styles.costSource}>
    <summary><b>{item.name}</b><span>{rp(item.old)} → {rp(item.new)} / {item.unit}</span></summary>
    {!result ? <Loading rows={2} /> : result.error ? <p className="notice bad">{errMsg(result.error)}</p> : result.data.length ? <ul>
      {result.data.map((row, i) => <li key={row.id}>{i === 0 ? 'Terbaru' : 'Sebelumnya'} · {new Date(row.created_at).toLocaleDateString('id-ID', { timeZone: 'Asia/Jakarta' })} · {angka(row.delta)} {item.unit} · {rp(row.value)}{row.note ? ' · ' + row.note : ''}</li>)}
    </ul> : <p className="small muted">Belum ada penerimaan yang dapat ditampilkan.</p>}
    {purchaseAccess && <Link href="/belanja">Buka riwayat penerimaan</Link>}
  </details>;
}
