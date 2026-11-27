'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import NavIcon from '@/components/NavIcon';
import { supabase } from '@/lib/supabase';
import { Empty, Loading, Sheet } from '@/components/ui';
import { angka, bulan, errMsg, monthEnd, rp, tgl, tglShort } from '@/lib/format';
import styles from './analisis.module.css';

const SERIES = [
  ['pendapatan', 'Pendapatan', '#087653'],
  ['laba', 'Laba', '#5ab957'],
  ['hpp', 'HPP', '#1985b1'],
  ['biaya', 'Biaya', '#a76214'],
];
const day = (date) => Number(date.slice(8));
const n = (value) => Number(value || 0);
export const laba = (row) => Math.round((n(row.pendapatan) - n(row.hpp) - n(row.biaya)) * 100) / 100;
const pct = (base, value) => base > 0 ? Math.round(value * 100 / base) + '%' : '—';

async function allRows(query) {
  const rows = [];
  const size = 500;
  for (let offset = 0; ; offset += size) {
    const { data, error } = await query().range(offset, offset + size - 1);
    if (error) throw error;
    rows.push(...data);
    if (data.length < size) return rows;
  }
}

function useData(load, dependencies) {
  const [state, setState] = useState(null);
  useEffect(() => {
    let active = true;
    setState(null);
    load().then((data) => { if (active) setState({ data }); }, (error) => { if (active) setState({ error }); });
    return () => { active = false; };
  }, dependencies);
  return state;
}

function ledger(kosId, from, to) {
  return allRows(() => supabase.from('acct_lines')
    .select('id,debit,credit,account:acct_accounts!inner(name,type,sys_key),entry:acct_entries!inner(number,entry_date,description,kind)')
    .eq('kos_id', kosId).in('account.type', ['pendapatan', 'beban'])
    .gte('entry.entry_date', from).lte('entry.entry_date', to).order('id'));
}

const accountKind = (account) => account.type === 'pendapatan' ? 'pendapatan' : account.sys_key === 'hpp' ? 'hpp' : 'biaya';
const signed = (line) => (n(line.debit) - n(line.credit)) * (line.account.type === 'pendapatan' ? -1 : 1);
const amountFor = (row, key) => key === 'laba' ? laba(row) : n(row[key]);

function addToGroup(groups, key, kind, value) {
  if (!groups.has(key)) groups.set(key, {});
  const bucket = groups.get(key);
  bucket[kind] = n(bucket[kind]) + Math.round(value * 100);
}

export function TrendPanel({ kosId, month, rows, summary, onDetail, ver }) {
  const [period, setPeriod] = useState('month');
  const [showTable, setShowTable] = useState(false);
  const [series, setSeries] = useState(['pendapatan', 'laba']);
  const year = Number(month.slice(0, 4));
  const requestKey = `${month}:${period}:${ver}`;
  const result = useData(async () => {
    try {
      const groups = new Map();
      if (period === 'year') {
        for (let y = year - 2; y <= year; y++) {
          const { data, error } = await supabase.rpc('acct_report', {
            p_kos: kosId, p_entity: false, p_from: `${y}-01-01`, p_to: y === year ? monthEnd(month) : `${y}-12-31`,
          });
          if (error) throw error;
          for (const account of data.accounts) {
            if (account.type !== 'pendapatan' && account.type !== 'beban') continue;
            addToGroup(groups, y, accountKind(account), n(account.period) * (account.type === 'pendapatan' ? -1 : 1));
          }
        }
      } else if (period !== 'month') {
        for (const line of await ledger(kosId, month + '-01', monthEnd(month))) {
          const d = day(line.entry.entry_date);
          const key = period === 'week' ? Math.floor((d - 1) / 7) : d;
          addToGroup(groups, key, accountKind(line.account), signed(line));
        }
      }
      return { requestKey, groups };
    } catch (error) {
      return { requestKey, error };
    }
  }, [kosId, requestKey]);
  const data = result?.data?.requestKey === requestKey ? result.data : null;
  const groups = data?.groups || new Map();
  const days = day(monthEnd(month));
  const points = period === 'month' ? (summary ? rows.slice(-6) : rows).map((row) => ({
    ...row, short: bulan(row.bulan.slice(0, 7)).slice(0, 3), label: bulan(row.bulan.slice(0, 7)),
  })) : Array.from({ length: period === 'year' ? 3 : period === 'week' ? Math.ceil(days / 7) : days }, (_, i) => {
    const key = period === 'year' ? year - 2 + i : period === 'week' ? i : i + 1;
    const date = (d) => `${month}-${String(d).padStart(2, '0')}`;
    const label = period === 'year' ? String(key) + (key === year && month.slice(5) !== '12' ? ` s.d. ${bulan(month)}` : '')
      : period === 'week' ? `${tglShort(date(i * 7 + 1))} – ${tglShort(date(Math.min(days, i * 7 + 7)))}` : tgl(date(key));
    const short = period === 'week' ? `${i * 7 + 1}–${Math.min(days, i * 7 + 7)}` : String(key);
    return { label, short, ...Object.fromEntries(Object.entries(groups.get(key) || {}).map(([k, v]) => [k, v / 100])) };
  });
  const visible = SERIES.filter(([key]) => series.includes(key));
  const values = points.flatMap((point) => visible.map(([key]) => amountFor(point, key)));
  const min = Math.min(0, ...values);
  const max = Math.max(min === 0 ? 1 : 0, ...values);
  const x = (i) => 62 + 510 * i / Math.max(1, points.length - 1);
  const y = (value) => 22 + (max - value) * 151 / (max - min);
  const tick = Intl.NumberFormat('id-ID', { notation: 'compact', maximumFractionDigits: 1 });
  return <section className={styles.panel}>
    <div className={styles.heading}><h2>{summary ? 'Tren Pendapatan & Laba' : 'Tren Performa'}</h2>
      {summary ? <button onClick={onDetail}>Lihat Detail <NavIcon name="next" size={15} /></button> :
        <label>Periode grafik <select value={period} onChange={(event) => setPeriod(event.target.value)}>
          <option value="day">Harian</option><option value="week">Mingguan</option><option value="month">Bulanan</option><option value="year">Tahunan</option>
        </select></label>}
    </div>
    {period !== 'month' && !data ? <Loading /> : data?.error ? <p role="alert">{errMsg(data.error)}</p> : <>
      <div className={styles.legend}>{(summary ? visible : SERIES).map(([key, label, color]) => summary ?
        <span key={key}><i style={{ background: color }} />{label}</span> :
        <button key={key} aria-pressed={series.includes(key)} onClick={() => setSeries((selected) => selected.includes(key) ? (selected.length === 1 ? selected : selected.filter((value) => value !== key)) : [...selected, key])}>
          <i style={{ background: color }} />{label}
        </button>)}</div>
      <svg className={styles.chart} viewBox="0 0 600 210" role="img" aria-label="Grafik tren dalam rupiah">
        {[max, (max + min) / 2, min].map((value) => <g key={value}>
          <line x1="62" x2="572" y1={y(value)} y2={y(value)} stroke="var(--line)" />
          <text x="53" y={y(value) + 4} textAnchor="end">{tick.format(value)}</text>
        </g>)}
        {min < 0 && max > 0 && <line x1="62" x2="572" y1={y(0)} y2={y(0)} stroke="var(--muted)" strokeDasharray="4 4" />}
        {visible.map(([key, label, color]) => <g key={key}>
          <polyline fill="none" stroke={color} strokeWidth="3" strokeLinejoin="round" points={points.map((point, i) => `${x(i)},${y(amountFor(point, key))}`).join(' ')} />
          {points.map((point, i) => <circle key={i} cx={x(i)} cy={y(amountFor(point, key))} r={points.length > 14 ? 2 : 4} fill="var(--surface)" stroke={color} strokeWidth="2"><title>{point.label} · {label} {rp(amountFor(point, key))}</title></circle>)}
        </g>)}
        {points.map((point, i) => (i === points.length - 1 || (i % Math.ceil(points.length / 6) === 0 && i < points.length - 1)) &&
          <text key={i} x={x(i)} y="198" textAnchor="middle">{point.short}</text>)}
      </svg>
      {!summary && <details open={showTable} onToggle={(event) => setShowTable(event.currentTarget.open)}><summary>Lihat angka per periode</summary><div className={styles.figures}>{points.map((point, i) => <div key={i}><b>{point.label}</b>{visible.map(([key, label]) => <small key={key}>{label} {rp(amountFor(point, key))}</small>)}</div>)}</div></details>}
    </>}
  </section>;
}

export function MetricDetail({ metric, kosId, month, onClose }) {
  const accountKeys = metric.accounts;
  const result = useData(() => accountKeys ? ledger(kosId, month + '-01', monthEnd(month)) : Promise.resolve([]), [kosId, month, metric.label]);
  const lines = (result?.data || []).filter((line) => accountKeys?.includes(accountKind(line.account)));
  const [limit, setLimit] = useState(15);
  const rows = [...lines].reverse().sort((a, b) => b.entry.entry_date.localeCompare(a.entry.entry_date));
  return <Sheet title={metric.label} onClose={onClose}>
    <strong className={styles.amount}>{metric.value}</strong>
    <p className={styles.explanation}>{metric.formula}</p>
    {accountKeys && (!result ? <Loading /> : result.error ? <p role="alert">{errMsg(result.error)}</p> : <>
      <h3>Baris jurnal {bulan(month)}</h3>
      {rows.length === 0 ? <p className="muted">Belum ada baris jurnal untuk indikator ini.</p> :
        <div className={styles.figures}>{rows.slice(0, limit).map((line) => <div key={line.id}><b>{line.account.name}</b>
          <span>{rp(signed(line))}</span><small>{tgl(line.entry.entry_date)} · {line.entry.number} · {line.entry.description}</small>
          <small>Debit {rp(line.debit)} · Kredit {rp(line.credit)}{line.entry.kind === 'koreksi' ? ' · Koreksi' : ''}</small>
        </div>)}</div>}
      {rows.length > limit && <button onClick={() => setLimit(limit + 15)}>Tampilkan lebih banyak</button>}
    </>)}
    <Link href={metric.href || '/pembukuan'}>Buka {metric.source || 'Pembukuan'}</Link>
  </Sheet>;
}

export function Profitability({ row }) {
  const gross = n(row.pendapatan) - n(row.hpp);
  return <section className={styles.panel}><h2>Profitabilitas</h2><dl className="kv">
    <dt>Laba kotor</dt><dd>{rp(gross)}</dd>
    <dt>Margin kotor</dt><dd>{pct(n(row.pendapatan), gross)}</dd>
    <dt>Laba setelah biaya, sebelum pajak</dt><dd>{rp(laba(row))}</dd>
    <dt>Margin laba</dt><dd>{pct(n(row.pendapatan), laba(row))}</dd>
    <dt>Markup atas HPP</dt><dd>{pct(n(row.hpp), gross)}</dd>
    <dt>Rasio biaya terhadap pendapatan</dt><dd>{pct(n(row.pendapatan), n(row.biaya))}</dd>
  </dl><p className="small muted">Markup dihitung dari laba kotor ÷ HPP. Rasio biaya memakai nilai biaya bersih dari jurnal.</p></section>;
}

export function InventoryTurnover({ kosId, month }) {
  const result = useData(async () => {
    const { data, error } = await supabase.rpc('retail_kpi', { p_kos: kosId, p_from: month + '-01', p_to: monthEnd(month) });
    if (error) throw error;
    return data;
  }, [kosId, month]);
  return <section className={styles.panel}><h2>Perputaran persediaan</h2>
    {!result ? <Loading /> : result.error ? <p role="alert">{errMsg(result.error)}</p> : <strong>{result.data?.perputaran == null ? 'Belum cukup data' : `${angka(result.data.perputaran)}×`}</strong>}
    <p className="small muted">HPP penjualan ÷ rata-rata nilai persediaan milik toko.</p><Link href="/laporan-toko">Buka laporan toko</Link>
  </section>;
}

export function Customers({ kosId, month, retail }) {
  const result = useData(async () => {
    if (!retail) return [];
    return allRows(() => supabase.from('sales').select('id,contact_id,total,tax_amount,contact:contacts(name)')
      .eq('kos_id', kosId).eq('status', 'selesai').gte('sale_date', month + '-01').lte('sale_date', monthEnd(month)).order('id'));
  }, [kosId, month, retail]);
  if (!result) return <Loading />;
  if (result.error) return <p className="notice bad" role="alert">{errMsg(result.error)}</p>;
  const customers = new Map();
  let total = 0;
  for (const sale of result.data) {
    const amount = Math.round((n(sale.total) - n(sale.tax_amount)) * 100);
    total += amount;
    if (!sale.contact_id) continue;
    const record = customers.get(sale.contact_id) || { id: sale.contact_id, name: sale.contact?.name || 'Pelanggan', count: 0, amount: 0 };
    record.count++;
    record.amount += amount;
    customers.set(sale.contact_id, record);
  }
  const rows = Array.from(customers.values()).sort((a, b) => b.amount - a.amount);
  return <section className={styles.panel}><h2>Performa pelanggan</h2>
    {rows.length ? <>
      <p>{angka(rows.length)} pelanggan bertransaksi · {angka(rows.filter((row) => row.count > 1).length)} belanja lebih dari sekali pada periode ini</p>
      <div className={styles.figures}>{rows.map((row) => <div key={row.id}><b>{row.name}</b><span>{rp(row.amount / 100)}</span>
        <small>{angka(row.count)} transaksi · {pct(total, row.amount)} dari penjualan periode ini</small></div>)}</div>
      <p className="small muted">Kontribusi dihitung dari nota penjualan selesai setelah diskon, sebelum retur, tanpa PPN. Penjualan tanpa kontak masuk total pembanding.</p>
    </> : <Empty title={retail ? 'Belum ada penjualan dengan kontak pelanggan' : 'Analisis belanja tersedia untuk bisnis Retail & Grosir'} />}
    <Link href="/kontak">Buka pelanggan &amp; supplier</Link>
  </section>;
}
