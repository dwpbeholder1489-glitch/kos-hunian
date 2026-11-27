'use client';
import { useEffect, useState } from 'react';
import NavIcon from '@/components/NavIcon';
import { Empty, Loading, Sheet } from '@/components/ui';
import { supabase } from '@/lib/supabase';
import { rp, errMsg, tgl } from '@/lib/format';
import styles from './bisnis.module.css';

export const reportOf = (b) => ({ retail: '/laporan-toko', jasa: '/laporan-jasa', kustom: '/laporan-kustom' }[b.business_type] || '/laporan');
export const amount = (value) => value == null || value === '' || !Number.isFinite(Number(value)) ? null : Number(value);
export const percent = new Intl.NumberFormat('id-ID', { style: 'percent', maximumFractionDigits: 1 });

const METRICS = {
  revenue: 'Pendapatan', profit: 'Laba operasional', margin: 'Margin operasional',
};

export function OwnerMetric({ label, value, note, icon, onClick }) {
  return <button className={styles.metric} onClick={onClick}>
    <span className={styles.icon}><NavIcon name={icon} /></span><span className={styles.metricCopy}>
      <b>{label}</b><strong className={value.length > 11 ? styles.longValue : undefined}>{value}</strong>{note && <small>{note}</small>}
    </span>
  </button>;
}

export function OwnerDetail({ detail, basisLabels, period, go, onClose }) {
  return <Sheet title={detail.title} onClose={onClose}>
    <p className="small muted" style={{ margin: 0 }}>{period}</p>
    {detail.note && <p className="small" style={{ margin: 0 }}>{detail.note}</p>}
    <div className={styles.detailList}>
      {detail.rows.map(({ business, value, href, note, previous }, i) => <button className={styles.row} key={business.id + ':' + i} onClick={() => go(business, href, previous)}>
        <span><b>{business.name}</b><small>{note || basisLabels[business.basis] || 'Basis belum tercatat'}</small></span><b>{value}</b><NavIcon name="next" size={15} />
      </button>)}
    </div>
  </Sheet>;
}

function valueFor(b, metric) {
  if (metric !== 'margin') return amount(b[metric]);
  const revenue = amount(b.revenue), profit = amount(b.profit);
  return revenue > 0 && profit != null ? profit / revenue : null;
}

export function PortfolioSummary({ groups, onDetail, basisLabels }) {
  return <div className={styles.summary}>{groups.map(({ basis, key, rows }) => {
    const total = (field) => basis && rows.every((business) => amount(business[field]) != null) ? rows.reduce((sum, business) => sum + amount(business[field]), 0)
      : rows.length === 1 ? amount(rows[0][field]) : null;
    const values = { revenue: total('revenue'), profit: total('profit') };
    values.margin = values.revenue > 0 && values.profit != null ? values.profit / values.revenue : null;
    const renderValue = (metric, value) => value == null ? '—' : metric === 'margin' ? percent.format(value) : rp(value);
    return <section key={key} className={styles.panel}>
      <div className={styles.heading}><h2>{basisLabels[basis] || 'Basis belum tercatat'}{basis === 'status catatan' && ' · ' + rows[0].name}</h2><span className="small muted">{rows.length} bisnis · {rows.every((b) => b.complete) ? 'Lengkap' : 'Ada estimasi'}</span></div>
      <div className={styles.metrics}>{[['revenue', 'wallet'], ['profit', 'coins'], ['margin', '/analisis']].map(([metric, icon]) =>
        <OwnerMetric key={metric} label={METRICS[metric]} icon={icon} value={renderValue(metric, values[metric])}
          note={metric === 'margin' ? 'Laba ÷ pendapatan' : undefined}
          onClick={() => onDetail({ title: METRICS[metric], note: metric === 'margin' ? 'Margin dihitung dari laba operasional dibagi pendapatan pada basis ini. Rincian berikut menunjukkan margin tiap usaha.' : metric === 'profit' ? 'Laba operasional dihitung dari pendapatan dikurangi HPP dan biaya operasional.' : 'Pendapatan mengikuti basis pencatatan masing-masing usaha.',
            rows: rows.map((business) => ({ business, value: renderValue(metric, valueFor(business, metric)), href: reportOf(business),
              note: metric === 'revenue' ? undefined : 'Pendapatan ' + renderValue('revenue', amount(business.revenue)) + ' · HPP ' + renderValue('revenue', amount(business.cogs)) + ' · Biaya ' + renderValue('revenue', amount(business.ops)) })) })} />
      )}</div>
    </section>;
  })}</div>;
}

export function Trends({ groups, previous, period, prior, basisLabels, onDetail }) {
  const [metric, setMetric] = useState('revenue');
  if (!groups.length) return <Empty title="Belum ada angka untuk dibandingkan" />;
  const history = new Map((previous || []).map((b) => [b.id, b]));
  return <section className={styles.panel}>
    <div className={styles.heading}><h2>Perbandingan bulanan</h2><div className={styles.controls} role="group" aria-label="Metrik tren">
      {['revenue', 'profit'].map((item) => <button key={item} aria-pressed={metric === item} onClick={() => setMetric(item)}>{METRICS[item]}</button>)}
    </div></div>
    <p className="small muted">{period} dibanding {prior}. Persentase tersedia jika angka pembanding tersedia, menggunakan basis sama, dan bernilai selain nol.</p>
    {groups.map(({ key, basis, rows }) => <div className={styles.panel} key={key}><h3>{basisLabels[basis] || 'Basis belum tercatat'}{basis === 'status catatan' && ' · ' + rows[0].name}</h3>
      {rows.map((business) => {
        const old = history.get(business.id);
        const now = amount(business[metric]);
        const before = basis && old?.basis === basis && old.access ? amount(old[metric]) : null;
        const change = now == null || before == null || before === 0 ? null : (now - before) / Math.abs(before);
        const display = (value) => value == null ? '—' : rp(value);
        const comparisonRows = [{ business, value: display(now), href: reportOf(business), note: period }];
        if (before != null) comparisonRows.push({ business, value: display(before), href: reportOf(business), note: prior, previous: true });
        return <button className={styles.row} key={business.id} onClick={() => onDetail({ title: METRICS[metric], rows: comparisonRows })}>
          <span><b>{business.name}</b><small>{prior} · {display(before)}</small></span>
          <span className={styles.value}><b>{display(now)}</b><small>{change == null ? '—' : percent.format(change)}</small></span><NavIcon name="next" size={15} />
        </button>;
      })}
    </div>)}
  </section>;
}

export function CashFlow({ businesses, from, to, onDetail, go }) {
  const [chosen, setChosen] = useState('');
  const [result, setResult] = useState(null);
  const business = businesses.find((b) => b.id === chosen) || businesses[0];
  const key = business?.id + from + to;
  useEffect(() => {
    if (!business) return;
    let active = true;
    supabase.rpc('acct_cashflow', { p_kos: business.id, p_from: from, p_to: to }).then(({ data, error }) => {
      if (active) setResult({ key, data, error });
    });
    return () => { active = false; };
  }, [key]);
  if (!business) return <Empty title="Belum ada bisnis aktif dengan akses keuangan" />;
  const values = result?.key === key ? result : null;
  return <section className={styles.panel}>
    <div className={styles.heading}><h2>Arus kas per bisnis</h2><label className={styles.select}>Bisnis<select aria-label="Bisnis arus kas" value={business.id} onChange={(e) => setChosen(e.target.value)}>
      {businesses.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
    </select></label></div>
    <p className="small muted">{tgl(from)} – {tgl(to)} · Pergerakan kas dan bank dari Pembukuan.</p>
    {!values ? <Loading /> : values.error ? <p className="notice bad">{errMsg(values.error)}</p> : values.data && <>
      <div className={styles.metrics}>{[['saldo_awal', 'Saldo awal', 'wallet'], ['masuk', 'Uang masuk', 'return'], ['keluar', 'Uang keluar', '/pengeluaran'], ['saldo_akhir', 'Saldo akhir', 'coins']].map(([field, title, icon]) =>
        <OwnerMetric key={field} label={title} icon={icon} value={rp(values.data[field])}
          onClick={() => onDetail({ title, note: 'Sumber angka dari akun kas dan bank pada laporan Arus Kas. Buka Pembukuan untuk melihat jurnal dan buku besar.',
            rows: [{ business, value: rp(values.data[field]), href: '/pembukuan?tab=arus-kas', note: 'Pembukuan · Arus Kas' }] })} />
      )}</div>
      {values.data.cocok === false && <p className="notice bad">Saldo awal dan arus kas belum cocok dengan saldo akhir. Periksa jurnal periode ini.</p>}
      <button onClick={() => go(business, '/pembukuan?tab=arus-kas')}>Buka Arus Kas di Pembukuan</button>
    </>}
  </section>;
}
