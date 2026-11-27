'use client';
// Dokumen laporan investor A4 (sampul, daftar isi, bagian bernomor) dari buildReport (lib/investorReport.js).
// Cetak / Simpan PDF lewat browser (window.print); CSS @page A4 di investor.module.css.
import { buildReport, tglx } from '@/lib/investorReport';
import styles from './InvestorDoc.module.css';

const ST = { draf: 'DRAF', diajukan: 'DRAF — MENUNGGU PERSETUJUAN', ditolak: 'DRAF — DITOLAK', final: 'FINAL' };

export default function InvestorDoc({ report, data }) {
  const parts = buildReport(report, data);
  const b = data?.bisnis || {}; const p = data?.periode || {};
  return <article className={styles.doc}>
    <section className={styles.cover}>
      <p className={styles.kicker}>Laporan Investor</p>
      <h1>{report.title}</h1>
      <p className={styles.biz}>{b.nama}</p>
      <p>Periode {tglx(p.from)} – {tglx(p.to)}{p.cmp_from ? ` · pembanding ${tglx(p.cmp_from)} – ${tglx(p.cmp_to)}` : ''}</p>
      <p className={styles.meta}>{report.number}{report.revision_of ? ' · revisi' : ''} · <b>{ST[report.status]}</b>
        {report.status === 'final' ? ` · difinalkan ${tglx(String(report.finalized_at).slice(0, 10))} oleh ${report.finalized_by || '—'}` : ` · angka per ${tglx(String(data?.dibuat || '').slice(0, 10))} (belum dibekukan)`}</p>
      <p className={styles.disc}>Disusun dari pencatatan PRASARA. Bukan laporan keuangan yang diaudit. Proyeksi, skenario, dan valuasi adalah estimasi.</p>
    </section>
    <section className={styles.toc}>
      <h2>Daftar isi</h2>
      <ol>{parts.map((s) => <li key={s.id}><a href={`#bag-${s.id}`}>{s.title}</a></li>)}</ol>
    </section>
    {parts.map((s, i) => <section key={s.id} id={`bag-${s.id}`} className={styles.part}>
      <h2>{i + 1}. {s.title}</h2>
      {s.blocks.map((bl, j) => <Block key={j} b={bl} />)}
    </section>)}
    <footer className={styles.foot}>{b.nama} · {report.number} · {ST[report.status]}</footer>
  </article>;
}

function Block({ b }) {
  if (b.t === 'text') return <div className={styles.text}>{String(b.v).split(/\n+/).map((x, i) => <p key={i}>{x}</p>)}</div>;
  if (b.t === 'note') return <p className={styles.note}>{b.v}</p>;
  if (b.t === 'kv') return <dl className={styles.kv}>{b.rows.map(([l, v, d]) => <div key={l}><dt>{l}</dt><dd>{v}{d && <small>{d}</small>}</dd></div>)}</dl>;
  if (b.t === 'table') return <div className={styles.tw}><table className={`${styles.table} ${b.textual ? styles.textual : ''}`}>
    {b.caption && <caption>{b.caption}</caption>}
    <thead><tr>{b.head.map((h) => <th key={h}>{h}</th>)}</tr></thead>
    <tbody>{b.rows.map((r, i) => r.head ? <tr key={i} className={styles.hr}><th colSpan={b.head.length}>{r.head}</th></tr>
      : <tr key={i} className={r.sub ? styles.sub : undefined}>{r.cells.map((c, k) => k === 0 ? <th key={k} scope="row">{c}</th> : <td key={k}>{c}</td>)}</tr>)}</tbody>
  </table></div>;
  return null;
}
