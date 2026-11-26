'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { income } from '@/lib/monthlyReport';
import { addMonthsYm, bulan, monthEnd, rp, tgl } from '@/lib/format';
import NavIcon from './NavIcon';
import styles from './AccountingDashboard.module.css';

const money = (value) => value == null ? '—' : rp(value);
const percent = new Intl.NumberFormat('id-ID', { maximumFractionDigits: 1 });
const short = new Intl.NumberFormat('id-ID', { notation: 'compact', maximumFractionDigits: 1 });

function Art({ calculator = false }) {
  return <div className={styles.art} aria-hidden="true">
    <div className={styles.paper}><i /><span>{[24, 39, 52, 73].map((height) => <b key={height} style={{ height: height + '%' }} />)}</span><i /><i /></div>
    {calculator && <div className={styles.calculator}><i /><span>{Array.from({ length: 9 }, (_, i) => <b key={i} />)}</span></div>}
  </div>;
}

export function AccountingHeading({ help, canWrite, onWrite }) {
  return <header className={styles.heading}>
    <div className={styles.titleIcon}><NavIcon name="/layers" size={28} /></div>
    <div className={styles.headingText}><h1>Pembukuan</h1>
      <p className={styles.desktopText}>Kelola jurnal, buku besar, neraca, dan laporan keuangan bisnis Anda secara otomatis.</p>
      <p className={styles.mobileText}>Jurnal otomatis dari transaksi penjualan, belanja, kas, pembayaran, dan stok.</p>
    </div>
    <div className={styles.headingActions}>{help}{canWrite && <button className={styles.primary} onClick={onWrite}>＋ Buat Jurnal</button>}</div>
    <Art calculator />
  </header>;
}

export function AccountingMenu({ active, menus, onOpen, canConfigure }) {
  const links = [['overview', 'Overview', '/layers'], ['laporan', 'Laporan', '/laporan'], ...(canConfigure ? [['periode', 'Pengaturan', '/pengaturan']] : [])];
  return <div className={styles.menu}>
    <nav className={styles.segment} aria-label="Bagian pembukuan">
      {links.map(([id, label, icon]) => <button type="button" key={id} aria-current={active === id ? 'page' : undefined} onClick={() => onOpen(id)}>
        <NavIcon name={icon} size={19} />{label}
      </button>)}
    </nav>
    <section className={styles.menuPanel}>
      <div className={styles.sectionHeader}><h2>Menu Pembukuan</h2></div>
      <div className={styles.tiles}>
        {menus.map(([id, label, icon]) => <button type="button" key={id} aria-current={active === id ? 'page' : undefined} onClick={() => onOpen(id)}>
          <NavIcon name={icon} size={25} /><span>{label}</span>
        </button>)}
      </div>
    </section>
  </div>;
}

export default function AccountingDashboard({ report, kosId, entity, from, to, ym, ytd, menus, onOpen, canConfigure }) {
  const [extra, setExtra] = useState(null);
  useEffect(() => {
    let active = true;
    async function load() {
      const read = async (name, args) => {
        const { data } = await supabase.rpc(name, { p_kos: kosId, ...args });
        return data;
      };
      const priorMonth = addMonthsYm(ym, ytd ? -12 : -1);
      const prior = ytd || entity ? await read('acct_report', {
        p_entity: entity, p_from: ytd ? priorMonth.slice(0, 4) + '-01-01' : priorMonth + '-01', p_to: monthEnd(priorMonth),
      }) : null;
      if (!active) return;
      const cash = entity ? null : await read('acct_cashflow', { p_from: from, p_to: to });
      if (!active) return;
      const analysis = !entity && !ytd ? await read('biz_analysis', { p_month: ym + '-01' }) : null;
      if (!active) return;
      const journal = entity ? null : await read('acct_journal', { p_from: from, p_to: to });
      if (active) setExtra({ cash, analysis, prior, priorMonth, journal });
    }
    load().catch(() => { if (active) setExtra({}); });
    return () => { active = false; };
  }, [kosId, entity, from, to, ym, ytd]);

  const current = income(report);
  const history = (extra?.analysis?.per_bulan || []).filter((row) => row.bulan.slice(0, 7) < ym).slice(-5).map((row) => {
    const revenue = Number(row.pendapatan);
    return [row.bulan.slice(0, 7), { revenue, profit: revenue - Number(row.hpp) - Number(row.biaya) }];
  });
  if (extra?.prior) history.push([extra.priorMonth, income(extra.prior)]);
  const previous = history.at(-1)?.[1];
  const comparison = previous ? bulan(history.at(-1)[0]).split(' ')[0] : '';
  const figures = [
    ['Pendapatan', current.revenue, previous?.revenue, '/kas', 'income'],
    ['Beban & Biaya', current.revenue - current.profit, previous && previous.revenue - previous.profit, '/penjualan', 'expense'],
    ['Laba Bersih', current.profit, previous?.profit, '/laporan', 'profit'],
    ['Saldo Kas', extra?.cash ? Number(extra.cash.saldo_akhir) : null, null, '/layers', 'cash'],
  ];
  const checks = report.checks || {};
  const warnings = [
    !checks.balanced && 'Total debit dan kredit belum cocok',
    checks.no_cost_sales > 0 && checks.no_cost_sales + ' penjualan tanpa HPP',
    checks.pending_payments > 0 && checks.pending_payments + ' pembayaran belum diverifikasi',
    checks.negative_stock > 0 && checks.negative_stock + ' barang stok minus',
  ].filter(Boolean);
  const business = entity ? report.entity?.name : report.businesses?.[0]?.name;
  const basis = [...new Set((report.businesses || []).map((row) => row.basis))].join(' + ');
  return <div className={styles.dashboard}>
    <section className={styles.summary}>
      <div className={styles.sectionHeader}><div><h2>Ringkasan Keuangan</h2><small>Periode: {from.slice(0, 7) === to.slice(0, 7) ? Number(from.slice(-2)) : tgl(from)} – {Number(to.slice(-2))} {bulan(to.slice(0, 7))}</small></div><button onClick={() => onOpen('laporan')}>Lihat Detail ›</button></div>
      <div className={styles.cards}>
        {figures.map(([label, value, prior, icon, tone]) => {
          const change = prior ? (value - prior) / Math.abs(prior) * 100 : null;
          const bad = change != null && (tone === 'expense' ? change > 0 : change < 0);
          return <button type="button" key={label} className={styles[tone]} onClick={() => onOpen('laporan')}>
            <NavIcon name={icon} size={31} /><span><span>{label}</span><strong>{money(value)}</strong>
              {tone === 'cash' ? <small>Kas &amp; Bank</small> : change != null ? <small className={bad ? styles.bad : styles.good}>
                {change < 0 ? '▼ ' : change > 0 ? '▲ +' : ''}{percent.format(change)}% <span className={styles.comparison}>vs {comparison}</span>
              </small> : <small>Pembanding belum tersedia</small>}
            </span>
          </button>;
        })}
      </div>
    </section>
    <section className={styles.trend}>
      <div className={styles.sectionHeader}><h2>Tren Pendapatan &amp; Laba Bersih</h2></div>
      <Trend rows={[...history, [ym, current]]} ytd={ytd} />
    </section>
    <AccountingMenu active="overview" menus={menus} onOpen={onOpen} canConfigure={canConfigure} />
    <section className={styles.status} data-warning={warnings.length > 0 || undefined}>
      <span className={styles.statusIcon} aria-hidden="true">{warnings.length ? '!' : '✓'}</span>
      <div><strong>Status Pembukuan: <span>{warnings.length ? 'Perlu diperiksa' : 'Lengkap'}</span></strong>
        <div>Cakupan: {business} · Dibuat: {new Date(report.generated_at).toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' })} · Basis: {basis}</div>
        {warnings.length > 0 && <ul>{warnings.map((warning) => <li key={warning}>{warning}</li>)}</ul>}
        {entity && <div>Ringkasan badan usaha mengikuti basis masing-masing bisnis.</div>}
      </div>
    </section>
    <section className={styles.command}>
      <span>Financial Command Center</span><h2><span className={styles.desktopText}>Analisis Keuangan Bisnis Anda</span><span className={styles.mobileText}>Ringkasan Keuangan</span></h2>
      <p>{business} · {bulan(ym)}</p>
      <button onClick={() => onOpen('command')}>Lihat Dashboard Analisis ›</button><Art />
    </section>
    {!entity && <section className={styles.recent}>
      <div className={styles.sectionHeader}><h2>Jurnal Terbaru</h2><button onClick={() => onOpen('jurnal')}>Lihat Semua ›</button></div>
      {extra?.journal?.length ? <table><thead><tr><th>Tanggal</th><th>Keterangan</th><th>Jenis</th><th>Nilai debit</th></tr></thead><tbody>
        {extra.journal.slice(0, 3).map((row) => <tr key={row.id}><td>{tgl(row.date)}</td><td>{row.description}</td><td><span>{row.kind === 'manual' ? 'Manual' : row.kind === 'koreksi' ? 'Koreksi' : 'Otomatis'}</span></td><td>{money((row.lines || []).reduce((total, line) => total + Number(line.debit), 0))}</td></tr>)}
      </tbody></table> : <p className="small muted">{!extra ? 'Memuat jurnal…' : extra.journal ? 'Belum ada jurnal pada periode ini.' : 'Jurnal belum dapat dimuat.'}</p>}
    </section>}
  </div>;
}

function Trend({ rows, ytd }) {
  const values = rows.flatMap(([, entry]) => [entry.revenue, entry.profit]);
  const min = Math.min(0, ...values), max = Math.max(0, ...values);
  const span = max - min || 1, zero = -min / span * 100;
  return <>
    <div className={styles.legend}><span>Pendapatan</span><span>Laba Bersih</span></div>
    <div className={styles.chart}>
      <div className={styles.axis} aria-hidden="true">{[max, min + span / 2, min].map((x, i) => <span key={i}>{short.format(x)}</span>)}</div>
      {rows.map(([month, entry]) => <div key={month} className={styles.bucket}>
        <div className={styles.plot} style={{ '--zero': zero + '%' }}>
          {[entry.revenue, entry.profit].map((value, i) => <span key={i} className={styles.column}>
            <i style={{ bottom: Math.min(zero, zero + value / span * 100) + '%', height: Math.abs(value) / span * 100 + '%' }} />
          </span>)}
        </div>
        <span title={`${bulan(month)}: Pendapatan ${rp(entry.revenue)}, Laba Bersih ${rp(entry.profit)}`}>{ytd ? month.slice(0, 4) : bulan(month).slice(0, 3)}</span>
      </div>)}
    </div>
    <details className={styles.chartData}><summary>Lihat data grafik</summary><ul>{rows.map(([month, entry]) => <li key={month}>{bulan(month)} · Pendapatan {rp(entry.revenue)} · Laba Bersih {rp(entry.profit)}</li>)}</ul></details>
  </>;
}
