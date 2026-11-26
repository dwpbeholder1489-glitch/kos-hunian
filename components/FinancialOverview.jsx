'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { addMonthsYm, bulan, errMsg, monthEnd, rp, thisMonth } from '@/lib/format';
import styles from './FinancialOverview.module.css';

function income(report) {
  // Match Pembukuan: group account codes before excluding insignificant balances.
  const accounts = new Map();
  for (const account of report.accounts) {
    const previous = accounts.get(account.code);
    accounts.set(account.code, { type: previous?.type ?? account.type, amount: (previous?.amount ?? 0) + Number(account.period) });
  }
  let revenue = 0;
  let expense = 0;
  for (const { type, amount } of accounts.values()) {
    if (Math.abs(amount) < 0.005) continue;
    if (type === 'pendapatan') revenue -= amount;
    if (type === 'beban') expense += amount;
  }
  return { revenue, profit: revenue - expense, margin: revenue > 0 ? (revenue - expense) / revenue * 100 : null };
}

const percent = new Intl.NumberFormat('id-ID', { maximumFractionDigits: 1 });
const signed = (value) => (value > 0 ? '+' : '') + percent.format(value);
const money = (value) => value == null ? '—' : rp(value);
const cashKinds = [['operasi', 'Operasi'], ['investasi', 'Investasi'], ['pendanaan', 'Pendanaan']];

function compare(value, previous, ratio) {
  if (value == null || previous == null || (!ratio && previous === 0)) return 'Pembanding belum tersedia';
  return ratio ? signed(value - previous) + ' pp' : signed((value - previous) / Math.abs(previous) * 100) + '%';
}

export default function FinancialOverview({ report, kosId, entity, from, to, ym, ytd, onPeriod, onReport }) {
  const [details, setDetails] = useState(null);
  const priorMonth = addMonthsYm(ym, ytd ? -12 : -1);
  const priorFrom = ytd ? priorMonth.slice(0, 4) + '-01-01' : priorMonth + '-01';
  const priorTo = monthEnd(priorMonth);

  useEffect(() => {
    let active = true;
    async function load() {
      // Both RPCs reuse the existing accounting sync. Run sequentially for this business.
      const prior = await supabase.rpc('acct_report', { p_kos: kosId, p_entity: entity, p_from: priorFrom, p_to: priorTo });
      if (!active) return;
      const cash = entity ? {} : await supabase.rpc('acct_cashflow', { p_kos: kosId, p_from: from, p_to: to });
      if (!active) return;
      const priorCash = entity || cash.error ? {} : await supabase.rpc('acct_cashflow', { p_kos: kosId, p_from: priorFrom, p_to: priorTo });
      if (active) setDetails({ prior: prior.data, cash: cash.data, priorCash: priorCash.data, error: prior.error || cash.error || priorCash.error });
    }
    load().catch((error) => { if (active) setDetails({ error }); });
    return () => { active = false; };
  }, [kosId, entity, from, to, priorFrom, priorTo]);

  const current = income(report);
  const previous = details?.prior ? income(details.prior) : null;
  const cash = details?.cash;
  const groups = cash?.lengkap ? cash.kelompok ?? [] : null;
  const priorGroups = details?.priorCash?.lengkap ? details.priorCash.kelompok ?? [] : null;
  const operation = (rows) => rows ? Number(rows.find((row) => row.kelompok === 'operasi')?.bersih ?? 0) : null;
  const periodLabel = ytd ? 'Jan–' + bulan(ym) : bulan(ym);
  const priorLabel = ytd ? 'Jan–' + bulan(priorMonth) : bulan(priorMonth);
  const cards = [
    ['▤', 'Pendapatan Bersih', current.revenue, previous?.revenue, false, 'laporan'],
    ['▥', 'Laba / Rugi Bersih', current.profit, previous?.profit, false, 'laporan'],
    ['%', 'Margin Laba', current.margin, previous?.margin, true, 'laporan'],
    ['▣', 'Saldo Kas & Bank', cash ? Number(cash.saldo_akhir) : null, details?.priorCash ? Number(details.priorCash.saldo_akhir) : null, false, 'laporan'],
    ['◈', 'Arus Kas Operasi', operation(groups), operation(priorGroups), false, 'laporan'],
  ];
  return <section className={styles.shell} aria-label="Financial Command Center">
    <header className={styles.heading}>
      <div><span className={styles.eyebrow}>FINANCIAL COMMAND CENTER</span><h2>Ringkasan Keuangan</h2><p>{entity ? report.entity?.name : report.businesses?.[0]?.name} · {periodLabel}</p></div>
      <button className="sm ghost" onClick={() => onReport('laporan')}>Buka Laporan Keuangan</button>
    </header>
    <div className={styles.filters}>
      <label htmlFor="finance-month">Periode</label>
      <input id="finance-month" type="month" value={ym} max={thisMonth()} onChange={(e) => { if (e.target.validity.valid && /^\d{4}-\d{2}$/.test(e.target.value)) onPeriod(e.target.value); }} />
      <span>vs {priorLabel}</span>
    </div>
    {details?.error && <div className="notice bad" role="status">Sebagian data belum bisa dimuat. {errMsg(details.error)}</div>}
    <div className={styles.kpis}>
      {cards.map(([icon, label, value, prior, ratio, target]) => <button type="button" className={styles.card} key={label} onClick={() => onReport(target)}>
        <span className={styles.icon} aria-hidden="true">{icon}</span><span>{label}</span>
        <strong>{ratio && value != null ? percent.format(value) + '%' : money(value)}</strong>
        <small>{!details && value == null && !entity ? 'Memuat…' : compare(value, prior, ratio)}</small>
      </button>)}
    </div>
    <div className={styles.panels}>
      <section className={styles.card}><h3>Pendapatan & Laba</h3>
        <ComparisonChart rows={previous ? [[priorLabel, previous], [periodLabel, current]] : [[periodLabel, current]]} />
      </section>
      <section className={styles.card}><h3>Arus Kas</h3>
        {cash ? <dl className={styles.ledger}>
          <div><dt>Saldo awal</dt><dd>{money(cash.saldo_awal)}</dd></div>
          {(groups ? cashKinds.map(([key, label]) => [label, groups.find((item) => item.kelompok === key)?.bersih ?? 0]) : [['Uang masuk', cash.masuk], ['Uang keluar', cash.keluar]]).map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{money(value)}</dd></div>)}
          <div><dt>Saldo akhir</dt><dd>{money(cash.saldo_akhir)}</dd></div>
        </dl> : <p>{entity ? 'Pilih cakupan Bisnis ini untuk melihat arus kas.' : details ? 'Data arus kas belum tersedia.' : 'Memuat arus kas…'}</p>}
        {cash && !cash.cocok && <p className="notice bad">Arus kas dan saldo akhir belum cocok.</p>}
      </section>
    </div>
    <section className={styles.card}><h3>Periksa Data Pembukuan</h3>
      <div className={styles.actions}>
        {!entity && <button className="sm ghost" onClick={() => onReport('jurnal')}>Buka Jurnal</button>}
        {!entity && <button className="sm ghost" onClick={() => onReport('bank')}>Rekonsiliasi Bank</button>}
        <Link href="/analisis">Analisis bisnis</Link>
      </div>
    </section>
  </section>;
}

function ComparisonChart({ rows }) {
  const values = rows.flatMap(([, data]) => [data.revenue, data.profit]);
  const min = Math.min(0, ...values);
  const max = Math.max(0, ...values);
  const range = max - min || 1;
  const zero = -min / range * 100;
  return <>
    <div className={styles.legend}><span>Pendapatan</span><span>Laba / rugi</span></div>
    <div className={styles.chart}>
      {rows.map(([period, data]) => <div className={styles.bucket} key={period}>
        <div className={styles.plot} aria-hidden="true" style={{ '--zero': zero + '%' }}>
          {[data.revenue, data.profit].map((value, index) => <div key={index} className={styles.track}>
            <span className={styles.bar} style={{ bottom: Math.min(zero, zero + value / range * 100) + '%', height: Math.abs(value) / range * 100 + '%' }} />
          </div>)}
        </div>
        <strong>{period}</strong>
        <small>{money(data.revenue)} · {money(data.profit)}</small>
      </div>)}
    </div>
  </>;
}
