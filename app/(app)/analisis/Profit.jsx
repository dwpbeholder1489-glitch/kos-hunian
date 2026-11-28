'use client';
// Analisis Kinerja & Profitabilitas (Analisis Bisnis › Profitabilitas). Data: profit_analysis (jurnal + transaksi; batas paket di server),
// rincian: profit_docs (transaksi asal) & JournalLines (baris jurnal). Rumus & aturan HANYA di lib/profitability.js.
// Tiga jenis angka ditandai jelas: AKTUAL (tercatat), ESTIMASI (dari catatan + asumsi tertulis), PROYEKSI (laju periode berjalan).
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import FiturUpgrade from '@/components/FiturUpgrade';
import { Loading, Sheet, toast } from '@/components/ui';
import { BLN, angka, errMsg, rp, tgl } from '@/lib/format';
import { LEVEL, RULES, branches, breakEven, categories, costs, dataIssues, drivers, leakage, opportunities, products, projection, recommendations, rooms, sectionStatus, services, summary } from '@/lib/profitability';
import { C, Donut, TrendChart } from './Charts';
import { DetailSheet, JournalLines } from './Details';
import styles from './analisis.module.css';
import s from './profit.module.css';

const n = (v) => Number(v || 0);
const pct = (v, d = 1) => (v == null ? '—' : `${(v * 100).toLocaleString('id-ID', { maximumFractionDigits: d, minimumFractionDigits: 0 })}%`);
const pp = (v) => (v == null ? '' : `${v >= 0 ? '+' : '−'}${Math.abs(v * 100).toLocaleString('id-ID', { maximumFractionDigits: 1 })} poin`);
const chg = (a, b) => (b == null || !n(b) ? null : (n(a) - n(b)) / Math.abs(n(b)));
const sign = (v) => (v == null ? '' : `${v >= 0 ? '▲' : '▼'} ${pct(Math.abs(v))}`);
const vsTxt = (a, b) => (b == null ? 'tanpa pembanding' : chg(a, b) == null ? `pembanding ${rp(b)}` : `${sign(chg(a, b))} vs pembanding`);
const TONE = { sehat: s.ok, peringatan: s.warn, risiko: s.bad, data: s.mute, info: s.info };
const PALETTE = [C.dark, C.main, C.mid, C.amber, '#3B82F6', C.grey];

const TABS = [['ringkas', 'Ringkas'], ['profit', 'Profitabilitas'], ['margin', 'Margin'], ['biaya', 'Biaya'], ['bep', 'Titik Impas'], ['bocor', 'Kebocoran'], ['peluang', 'Peluang'], ['omzet', 'Pendorong Omzet']];
const FULL_ONLY = new Set(['profit', 'margin', 'bocor', 'peluang', 'omzet']);

export function Tag({ kind }) {
  return <span className={`${s.tag} ${kind === 'estimasi' ? s.tagEst : kind === 'proyeksi' ? s.tagProj : s.tagAct}`}>{kind === 'estimasi' ? 'ESTIMASI' : kind === 'proyeksi' ? 'PROYEKSI' : 'AKTUAL'}</span>;
}
function Status({ v }) { return v ? <span className={`${s.status} ${TONE[v] || ''}`}>{LEVEL[v] || v}</span> : null; }

export default function ProfitModule({ kosId, range, cmp, ver, owner, jenis, branch, category, finance = true }) {
  const [st, setSt] = useState(null);
  const [tab, setTab] = useState('ringkas');
  const [sheet, setSheet] = useState(null);
  const [rv, setRv] = useState(0);
  useEffect(() => {
    let on = true; setSt(null);
    supabase.rpc('profit_analysis', { p_kos: kosId, p_from: range.from, p_to: range.to, p_cmp_from: cmp?.from || null, p_cmp_to: cmp?.to || null,
      p_branch: branch || null, p_category: category || null }).then(({ data, error }) => on && setSt(error ? { error } : { data }));
    return () => { on = false; };
  }, [kosId, range.from, range.to, cmp?.from, cmp?.to, branch, category, ver, rv]);

  if (!st) return <Loading rows={5} />;
  if (st.error) return <p className="notice bad" role="alert">{/profit_analysis/.test(st.error.message || '') ? 'Database sedang diperbarui. Coba lagi beberapa menit lagi.' : errMsg(st.error)}</p>;
  const d = st.data; const full = d.level !== 'dasar';
  const ctx = { d, full, kosId, range, owner, jenis: d.jenis, open: setSheet, go: setTab, reload: () => setRv((x) => x + 1), finance };
  const issues = dataIssues(d);
  return <div className={s.wrap}>
    <nav className={s.tabs} aria-label="Analisis profitabilitas">{TABS.map(([k, l]) =>
      <button key={k} type="button" aria-pressed={tab === k} onClick={() => setTab(k)}>{l}{!full && FULL_ONLY.has(k) ? ' 🔒' : ''}</button>)}</nav>
    <p className={s.legend}><Tag kind="aktual" /> tercatat di PRASARA · <Tag kind="estimasi" /> dihitung dari catatan + asumsi tertulis · <Tag kind="proyeksi" /> laju periode berjalan
      {d.branch_name ? <> · Cabang <b>{d.branch_name}</b></> : ''}{d.category_name ? <> · Kategori <b>{d.category_name}</b> (hanya bagian produk)</> : ''}</p>
    {issues.length > 0 && <div className={s.issues} role="note"><b>Data belum lengkap</b><ul>{issues.map((x) => <li key={x.code}>{x.text}</li>)}</ul></div>}
    {!full && FULL_ONLY.has(tab) ? <FiturUpgrade kosId={kosId} owner={owner} event="ANALYTICS.ADVANCED.REQUESTED" title="Analisis profitabilitas lengkap tersedia mulai Paket Bisnis"
      text="Profitabilitas & margin per produk/kategori, kebocoran laba, peluang yang terlewat, pendorong omzet, dan rincian sampai transaksi asal." />
      : tab === 'ringkas' ? <Overview {...ctx} /> : tab === 'profit' ? <Profitability {...ctx} /> : tab === 'margin' ? <Margins {...ctx} />
      : tab === 'biaya' ? <Costs {...ctx} /> : tab === 'bep' ? <BreakEven {...ctx} /> : tab === 'bocor' ? <Leakage {...ctx} />
      : tab === 'peluang' ? <Opportunity {...ctx} /> : <Drivers {...ctx} />}
    {sheet && <SheetView sheet={sheet} d={d} kosId={kosId} range={range} branch={branch} onClose={() => setSheet(null)} />}
  </div>;
}

// ---------- Ringkas ----------
function Overview({ d, full, open, go }) {
  const c = summary(d.cur); const p = d.cmp ? summary(d.cmp) : null; const be = breakEven(d.cur); const pj = projection(d);
  const stt = sectionStatus(d); const rec = recommendations(d);
  const ct = costs(d); const lk = full ? leakage(d) : null;
  return <>
    <div className={s.kpis}>
      <Kpi label="Pendapatan bersih" value={rp(c.net)} sub={vsTxt(c.net, p?.net)} onClick={() => open({ type: 'journal', title: 'Pendapatan bersih', kinds: ['pendapatan'], value: rp(c.net) })} tag="aktual" />
      <Kpi label="Laba bersih" value={rp(c.netIncome)} tone={c.netIncome < 0 ? 'bad' : null} sub={p ? vsTxt(c.netIncome, p.netIncome) : `margin ${pct(c.netMargin)}`}
        onClick={() => open({ type: 'journal', title: 'Laba bersih', kinds: ['pendapatan', 'hpp', 'biaya'], value: rp(c.netIncome) })} tag="aktual" />
      <Kpi label="Margin bersih" value={pct(c.netMargin)} sub={p && c.netMargin != null && p.netMargin != null ? `${pp(c.netMargin - p.netMargin)} vs pembanding` : `margin kotor ${pct(c.grossMargin)}`} onClick={() => go('margin')} status={stt.margin} />
      <Kpi label="Titik impas (BEP)" value={be.bep != null ? rp(be.bep) : '—'} sub={be.bep != null ? `Capai ${pct(be.achieved, 0)} BEP` : be.reason} onClick={() => go('bep')} status={be.status} />
    </div>
    {pj && <p className={s.proj}><Tag kind="proyeksi" /> Dengan laju {pj.run} dari {pj.days} hari, pendapatan akhir periode sekitar <b>{rp(pj.net)}</b> dan laba usaha sekitar <b>{rp(pj.profitOp)}</b>{pj.reachBep != null ? ` — ${pj.reachBep ? 'melewati' : 'belum mencapai'} titik impas` : ''}. Bukan angka aktual.</p>}
    <div className={s.grid}>
      <section className={`${styles.card} ${s.wide}`}><TrendBlock d={d} /></section>
      <section className={styles.card}><Composition d={d} full={full} open={open} /></section>
      {full && <section className={`${styles.card} ${s.wide}`}><TopList d={d} open={open} go={go} /></section>}
      <section className={styles.card}><BepMini be={be} go={go} /></section>
      <section className={styles.card}>
        <div className={styles.cardH}><h2 className={styles.cardT}>Efisiensi biaya</h2><Status v={stt.biaya} /></div>
        <p className={s.big}>{pct(ct.opexRatio)} <small>biaya operasional ÷ pendapatan</small></p>
        <p className={styles.note}>{ct.prevOpexRatio != null ? `Pembanding ${pct(ct.prevOpexRatio)} (${pp(ct.opexRatio - ct.prevOpexRatio)}). ` : ''}HPP {pct(ct.hppRatio)} pendapatan · biaya tetap {pct(ct.fixedShare)} dari total biaya.</p>
        <button type="button" className={styles.link} onClick={() => go('biaya')}>Lihat struktur biaya</button>
      </section>
      {lk && <section className={styles.card}>
        <div className={styles.cardH}><h2 className={styles.cardT}>Kebocoran laba</h2><Status v={lk.status} /></div>
        <p className={s.big}>{rp(lk.actual)} <small>{lk.share != null ? `${pct(lk.share)} pendapatan` : ''}</small></p>
        <p className={styles.note}>{lk.items.filter((x) => x.kind === 'aktual').slice(0, 2).map((x) => `${x.label} ${rp(x.value)}`).join(' · ') || 'Tidak ada kebocoran tercatat.'}{lk.risk > 0 ? ` · berisiko ${rp(lk.risk)}` : ''}</p>
        <button type="button" className={styles.link} onClick={() => go('bocor')}>Telusuri</button>
      </section>}
      <section className={`${styles.card} ${s.full} ${s.recCard}`}><Recs rec={rec} go={go} /></section>
    </div>
  </>;
}

function Kpi({ label, value, sub, onClick, tone, status, tag }) {
  return <button type="button" className={`${styles.card} ${s.kpi}`} onClick={onClick}>
    <span className={s.kpiL}>{label}{tag && <Tag kind={tag} />}{status && <Status v={status} />}</span>
    <b className={tone === 'bad' ? s.negv : undefined}>{value}</b><small>{sub}</small>
  </button>;
}

function TrendBlock({ d }) {
  const pts = (d.tren || []).map((t) => { const x = summary(t.v); return { label: BLN[+t.mulai.slice(5, 7) - 1] + ' ' + t.mulai.slice(0, 4), short: BLN[+t.mulai.slice(5, 7) - 1], pendapatan: x.net, laba: x.netIncome, margin: x.netMargin == null ? 0 : x.netMargin * 100 }; });
  return <>
    <div className={styles.cardH}><h2 className={styles.cardT}>Tren pendapatan & laba</h2><Tag kind="aktual" /></div>
    {pts.length > 1 ? <TrendChart points={pts} series={[{ key: 'pendapatan', label: 'Pendapatan bersih', color: C.main, area: true, fmt: rp }, { key: 'laba', label: 'Laba bersih', color: C.amber, fmt: rp }]} />
      : <p className={styles.note}>Tren butuh minimal 2 bulan data{d.level === 'dasar' ? ' (Paket Dasar: bulan ini & bulan lalu)' : ''}.</p>}
    <p className={styles.note}>Per bulan dari jurnal Pembukuan, sampai akhir periode terpilih.</p>
  </>;
}

function Composition({ d, full, open }) {
  let parts = []; let title = 'Komposisi laba'; let center = ''; let note = '';
  if (full && d.produk) { const cats = categories(products(d)).filter((x) => x.laba > 0); title = 'Komposisi laba per kategori'; center = rp(cats.reduce((a, x) => a + x.laba, 0));
    parts = cats.slice(0, 5).map((x, i) => ({ label: x.name, value: Math.round(x.laba), color: PALETTE[i] })); const rest = cats.slice(5).reduce((a, x) => a + x.laba, 0);
    if (rest > 0) parts.push({ label: 'Lainnya', value: Math.round(rest), color: PALETTE[5] }); note = 'Laba kotor (omzet − modal) dari baris penjualan.'; }
  else if (full && d.layanan) { const sv = services(d); title = 'Komposisi omzet per layanan'; center = rp(sv.omzet);
    parts = sv.rows.slice(0, 5).map((x, i) => ({ label: x.name, value: Math.round(x.omzet), color: PALETTE[i] })); note = 'Laba per layanan butuh resep/bahan; ditampilkan omzet.'; }
  else if (full && d.kamar) { const r = rooms(d); title = 'Uang masuk per kamar'; center = rp(r.revenue);
    parts = r.rows.filter((x) => x.revenue > 0).slice(0, 5).map((x, i) => ({ label: x.name, value: Math.round(x.revenue), color: PALETTE[i] })); note = 'Biaya per kamar belum dicatat, jadi laba per kamar tidak ditebak.'; }
  else { const c = summary(d.cur); title = 'Ke mana pendapatan pergi'; center = rp(c.net);
    parts = [{ label: 'HPP', value: Math.max(0, c.hpp), color: C.grey }, { label: 'Biaya operasional', value: Math.max(0, c.opex), color: C.amber }, { label: 'Penyusutan & bunga', value: Math.max(0, c.dep + c.interest), color: '#3B82F6' }, { label: 'Laba bersih', value: Math.max(0, c.netIncome), color: C.main }].filter((x) => x.value > 0);
    note = 'Bagian pendapatan bersih untuk tiap kelompok biaya.'; }
  const tot = parts.reduce((a, x) => a + x.value, 0);
  return <>
    <div className={styles.cardH}><h2 className={styles.cardT}>{title}</h2><Tag kind="aktual" /></div>
    {parts.length ? <div className={s.donutRow}><Donut parts={parts} center={center.replace('Rp ', '')} sub="" onPick={(i) => d.produk && full && open({ type: 'note', title: parts[i].label, value: rp(parts[i].value) })} />
      <ul className={s.legendL}>{parts.map((x) => <li key={x.label}><i style={{ background: x.color }} /><span>{x.label}</span><b>{pct(x.value / tot)}</b></li>)}</ul></div>
      : <p className={styles.note}>Belum ada data untuk komposisi.</p>}
    <p className={styles.note}>{note}</p>
  </>;
}

function TopList({ d, open, go }) {
  if (d.produk) { const pr = products(d); return <>
    <div className={styles.cardH}><h2 className={styles.cardT}>Produk paling menguntungkan</h2><button type="button" className={styles.link} onClick={() => go('profit')}>Semua</button></div>
    <Table cols={['Produk', 'Omzet', 'Laba kotor', 'Margin']} rows={pr.rows.slice(0, 5).map((x) => ({ key: x.id, onClick: () => open({ type: 'docs', kind: 'product', key: x.id, title: x.name, value: rp(x.laba) }),
      cells: [<>{x.name}{x.noCost && <small className={s.warnTxt}> modal kosong</small>}</>, rp(x.omzet), rp(x.laba), <span className={x.status === 'risiko' ? s.negv : x.status === 'peringatan' ? s.warnTxt : s.okv}>{pct(x.margin)}</span>] }))} /></>; }
  if (d.layanan) { const sv = services(d); return <>
    <div className={styles.cardH}><h2 className={styles.cardT}>Layanan teratas</h2><button type="button" className={styles.link} onClick={() => go('profit')}>Semua</button></div>
    <Table cols={['Layanan', 'Omzet', 'Laba', 'Margin']} rows={sv.rows.slice(0, 5).map((x) => ({ key: x.name, onClick: () => open({ type: 'docs', kind: 'service', key: x.name, title: x.name, value: rp(x.omzet) }),
      cells: [x.name, rp(x.omzet), x.laba == null ? '—' : rp(x.laba), pct(x.margin)] }))} /></>; }
  if (d.kamar) { const r = rooms(d); return <>
    <div className={styles.cardH}><h2 className={styles.cardT}>Kamar</h2><button type="button" className={styles.link} onClick={() => go('profit')}>Semua</button></div>
    <Table cols={['Kamar', 'Uang masuk', 'Hunian', 'Per hari terisi']} rows={r.rows.slice(0, 5).map((x) => ({ key: x.id, onClick: () => open({ type: 'docs', kind: 'room', key: x.id, title: 'Kamar ' + x.name, value: rp(x.revenue) }),
      cells: [x.name, rp(x.revenue), pct(x.occupancy, 0), x.perDay == null ? '—' : rp(x.perDay)] }))} /></>; }
  return <><h2 className={styles.cardT}>Rincian per item</h2><p className={styles.note}>Bisnis kustom belum punya data per item; analisis memakai jurnal Pembukuan.</p></>;
}

function BepMini({ be, go, noLink }) {
  const w = be.bep ? Math.min(100, (be.revenue / Math.max(be.bep, be.revenue)) * 100) : 0; const m = be.bep ? Math.min(100, (be.bep / Math.max(be.bep, be.revenue)) * 100) : 0;
  return <>
    <div className={styles.cardH}><h2 className={styles.cardT}>Titik impas</h2><Status v={be.status} /></div>
    {be.bep != null ? <>
      <p className={s.big}>{pct(be.achieved, 1)} <small>dari BEP</small></p>
      <div className={s.bepBar} aria-hidden="true"><i style={{ width: w + '%' }} className={be.gap >= 0 ? s.fillOk : s.fillBad} /><em style={{ left: m + '%' }} /></div>
      <dl className={styles.kvs}><div><dt>BEP pendapatan</dt><dd>{rp(be.bep)}</dd></div><div><dt>Pendapatan aktual</dt><dd>{rp(be.revenue)}</dd></div><div><dt>Selisih</dt><dd className={be.gap < 0 ? s.negv : s.okv}>{be.gap >= 0 ? '+' : ''}{rp(be.gap)}</dd></div></dl>
    </> : <p className={styles.note}>{be.reason}</p>}
    {!noLink && <button type="button" className={styles.link} onClick={() => go('bep')}>Detail BEP</button>}
  </>;
}

function Recs({ rec, go }) {
  return <>
    <div className={styles.cardH}><h2 className={styles.cardT}>Insight & rekomendasi</h2><span className={styles.note}>aturan tertulis, bukan tebakan</span></div>
    {rec.length ? <ul className={s.recs}>{rec.map((r, i) => <li key={i} className={TONE[r.level]}><Status v={r.level} /><div><b>{r.title}</b><p>{r.text}</p></div>
      {r.action && <button type="button" className="sm" onClick={() => go(r.action.tab)}>{r.action.label}</button>}</li>)}</ul>
      : <p className={styles.note}>Belum ada temuan. Rekomendasi muncul bila data menunjukkan masalah atau peluang.</p>}
    <details className={s.rules}><summary>Aturan yang dipakai</summary><p>Margin keamanan BEP ≥ {pct(RULES.safetyOk, 0)} = sehat; kebocoran ≥ {pct(RULES.leakWarn, 0)} pendapatan = peringatan, ≥ {pct(RULES.leakRisk, 0)} = risiko;
      produk ≥ {pct(RULES.lowMarginShare, 0)} omzet dengan margin di bawah separuh rata-rata = peringatan; biaya yang tumbuh ≥ {Math.round(RULES.costGrowthGap * 100)} poin lebih cepat dari pendapatan = peringatan; rasio biaya operasional naik ≥ {Math.round(RULES.opexStep * 100)} poin = peringatan.</p></details>
  </>;
}

// ---------- Profitabilitas ----------
function Profitability({ d, open }) {
  const br = branches(d);
  return <>
    {d.produk && <ProductTable d={d} open={open} />}
    {d.layanan && <section className={styles.card}><h2 className={styles.cardT}>Profitabilitas per layanan</h2>
      <Table cols={['Layanan', 'Jumlah', 'Omzet', 'Biaya bahan', 'Laba', 'Porsi omzet']} rows={services(d).rows.map((x) => ({ key: x.name, onClick: () => open({ type: 'docs', kind: 'service', key: x.name, title: x.name, value: rp(x.omzet) }),
        cells: [x.name, angka(x.qty), rp(x.omzet), x.bahan == null ? '—' : rp(x.bahan) + (x.partial ? '*' : ''), x.laba == null ? '—' : rp(x.laba), pct(x.share)] }))} />
      <p className={styles.note}>Laba per layanan hanya untuk layanan yang semua barisnya punya resep/bahan (menu Resep). * = sebagian baris belum punya resep.</p></section>}
    {d.kamar && <section className={styles.card}><h2 className={styles.cardT}>Kinerja per kamar</h2>
      <Table cols={['Kamar', 'Tarif/bulan', 'Uang masuk', 'Hari terisi', 'Hunian', 'Pembanding']} rows={rooms(d).rows.map((x) => ({ key: x.id, onClick: () => open({ type: 'docs', kind: 'room', key: x.id, title: 'Kamar ' + x.name, value: rp(x.revenue) }),
        cells: [x.name, rp(x.rent), rp(x.revenue), `${x.occDays}/${x.days}`, pct(x.occupancy, 0), x.prev == null ? '—' : rp(x.prev)] }))} />
      <p className={styles.note}>Uang masuk = pembayaran terverifikasi (basis kas, sama dengan laporan kos). Biaya per kamar belum dicatat.</p></section>}
    {!d.produk && !d.layanan && !d.kamar && <section className={styles.card}><p className={styles.note}>Rincian per item belum tersedia untuk jenis bisnis ini — gunakan Margin, Biaya, dan Titik Impas yang memakai jurnal Pembukuan.</p></section>}
    {br && <BranchTable rows={br} />}
  </>;
}

function ProductTable({ d, open }) {
  const pr = products(d); const cats = categories(pr); const [sort, setSort] = useState('laba'); const [lim, setLim] = useState(30);
  const rows = [...pr.rows].sort((a, b) => sort === 'margin' ? n(a.margin) - n(b.margin) : sort === 'omzet' ? b.omzet - a.omzet : b.laba - a.laba);
  return <>
    <section className={styles.card}>
      <div className={styles.cardH}><h2 className={styles.cardT}>Profitabilitas per produk</h2>
        <label className={s.sortL}>Urut <select value={sort} onChange={(e) => setSort(e.target.value)}><option value="laba">Laba terbesar</option><option value="omzet">Omzet terbesar</option><option value="margin">Margin terendah</option></select></label></div>
      <p className={styles.note}>Laba kotor = omzet tanpa PPN − retur − modal baris penjualan. Rata-rata margin {pct(pr.avgMargin)}{pr.pareto ? ` · ${pr.pareto.count} dari ${pr.pareto.of} produk menghasilkan ${pct(RULES.pareto, 0)} laba` : ''}.</p>
      <Table cols={['Produk', 'Terjual', 'Omzet', 'Modal', 'Laba kotor', 'Margin', 'Porsi laba', 'Status']} rows={rows.slice(0, lim).map((x) => ({ key: x.id,
        onClick: () => open({ type: 'docs', kind: 'product', key: x.id, title: x.name, value: rp(x.laba) }),
        cells: [<>{x.name}<small className={s.sub}>{x.cat}</small></>, angka(x.qty), rp(x.omzet), rp(x.hpp), rp(x.laba), pct(x.margin), pct(x.profitShare), <Status v={x.status} />] }))} />
      {rows.length > lim && <button type="button" onClick={() => setLim(lim + 50)}>Tampilkan lebih banyak ({rows.length - lim})</button>}
    </section>
    <section className={styles.card}><h2 className={styles.cardT}>Per kategori</h2>
      <Table cols={['Kategori', 'Produk', 'Omzet', 'Laba kotor', 'Margin', 'Porsi laba', 'Status']} rows={cats.map((x) => ({ key: x.name, cells: [x.name, angka(x.n), rp(x.omzet), rp(x.laba), pct(x.margin), pct(x.profitShare), <Status v={x.status} />] }))} />
    </section>
  </>;
}

function BranchTable({ rows }) {
  return <section className={styles.card}><div className={styles.cardH}><h2 className={styles.cardT}>Per cabang / lokasi</h2><Tag kind="aktual" /></div>
    <Table cols={['Lokasi', 'Pendapatan', 'Laba kotor', 'Biaya operasional', 'Laba bersih', 'Margin bersih', 'BEP']} rows={rows.map((x) => ({ key: x.id || 'none',
      cells: [x.name, rp(x.net), rp(x.gp), rp(x.opex), <span className={x.netIncome < 0 ? s.negv : undefined}>{rp(x.netIncome)}</span>, x.net > 0 ? pct(x.netIncome / x.net) : '—', x.be?.bep != null ? rp(x.be.bep) : '—'] }))} />
    <p className={styles.note}>Biaya yang tidak dicatat dengan lokasi masuk baris "Tanpa lokasi" agar total tetap sama dengan Pembukuan.</p></section>;
}

// ---------- Margin ----------
function Margins({ d, open }) {
  const c = summary(d.cur); const p = d.cmp ? summary(d.cmp) : null;
  const pts = (d.tren || []).map((t) => { const x = summary(t.v); return { label: BLN[+t.mulai.slice(5, 7) - 1] + ' ' + t.mulai.slice(0, 4), short: BLN[+t.mulai.slice(5, 7) - 1],
    kotor: x.grossMargin == null ? 0 : +(x.grossMargin * 100).toFixed(1), bersih: x.netMargin == null ? 0 : +(x.netMargin * 100).toFixed(1) }; });
  const lv = [['Margin kotor', c.grossMargin, p?.grossMargin, '(Pendapatan bersih − HPP) ÷ pendapatan bersih', ['pendapatan', 'hpp']],
    ['Margin usaha (EBIT)', c.opMargin, p?.opMargin, 'Laba usaha sebelum bunga & pajak ÷ pendapatan bersih', ['pendapatan', 'hpp', 'biaya']],
    ['Margin bersih', c.netMargin, p?.netMargin, 'Laba bersih ÷ pendapatan bersih', ['pendapatan', 'hpp', 'biaya']]];
  return <>
    <section className={styles.card}><div className={styles.cardH}><h2 className={styles.cardT}>Tingkat margin</h2><Tag kind="aktual" /></div>
      <div className={s.trio}>{lv.map(([l, v, pv, f, kinds]) => <button key={l} type="button" className={s.mbox} onClick={() => open({ type: 'journal', title: l, value: pct(v), formula: f, kinds })}>
        <span>{l}</span><b className={v != null && v < 0 ? s.negv : undefined}>{pct(v)}</b><small>{pv != null && v != null ? `${pp(v - pv)} vs pembanding` : f}</small></button>)}</div></section>
    {pts.length > 1 && <section className={styles.card}><h2 className={styles.cardT}>Tren margin (%)</h2>
      <TrendChart points={pts} money={false} series={[{ key: 'kotor', label: 'Margin kotor %', color: C.main, area: true, fmt: (v) => v + '%' }, { key: 'bersih', label: 'Margin bersih %', color: C.amber, fmt: (v) => v + '%' }]} /></section>}
    {d.produk && (() => { const pr = products(d); const low = [...pr.rows].filter((x) => x.margin != null).sort((a, b) => a.margin - b.margin).slice(0, 10); return <section className={styles.card}>
      <h2 className={styles.cardT}>Margin terendah</h2><p className={styles.note}>Rata-rata {pct(pr.avgMargin)}. Produk bermargin minus menjual di bawah modal.</p>
      <Table cols={['Produk', 'Omzet', 'Margin', 'Status']} rows={low.map((x) => ({ key: x.id, onClick: () => open({ type: 'docs', kind: 'product', key: x.id, title: x.name, value: pct(x.margin) }), cells: [x.name, rp(x.omzet), pct(x.margin), <Status v={x.status} />] }))} />
      <h3 className={s.h3}>Per kategori</h3>
      <Table cols={['Kategori', 'Margin', 'Porsi omzet']} rows={categories(pr).map((x) => ({ key: x.name, cells: [x.name, pct(x.margin), pct(x.share)] }))} /></section>; })()}
    {branches(d) && <BranchTable rows={branches(d)} />}
  </>;
}

// ---------- Biaya ----------
function Costs({ d, open, finance }) {
  const ct = costs(d); const c = summary(d.cur);
  return <>
    <section className={styles.card}><div className={styles.cardH}><h2 className={styles.cardT}>Struktur biaya</h2><Status v={ct.status} /></div>
      <div className={s.split}><div style={{ width: pct(ct.fixedShare || 0) }} className={s.splitF}><span>Tetap</span></div><div className={s.splitV}><span>Variabel</span></div></div>
      <dl className={styles.kvs}>
        <div><dt>Total biaya</dt><dd>{rp(ct.total)}</dd></div>
        <div><dt>Biaya tetap<small>kategori bertanda tetap + penyusutan + bunga</small></dt><dd>{rp(ct.fixed)}</dd></div>
        <div><dt>Biaya variabel<small>HPP + biaya lain</small></dt><dd>{rp(ct.variable)}</dd></div>
        <div><dt>HPP ÷ pendapatan</dt><dd>{pct(ct.hppRatio)}{ct.prevHppRatio != null ? ` (${pp(ct.hppRatio - ct.prevHppRatio)})` : ''}</dd></div>
        <div><dt>Biaya operasional ÷ pendapatan</dt><dd>{pct(ct.opexRatio)}{ct.prevOpexRatio != null ? ` (${pp(ct.opexRatio - ct.prevOpexRatio)})` : ''}</dd></div>
        <div><dt>Biaya operasional per transaksi</dt><dd>{ct.perTrx == null ? '—' : rp(ct.perTrx)}{ct.prevPerTrx != null ? ` (pembanding ${rp(ct.prevPerTrx)})` : ''}</dd></div>
      </dl></section>
    <section className={styles.card}><div className={styles.cardH}><h2 className={styles.cardT}>Per kategori pengeluaran</h2>{finance && <Link className={styles.link} href="/anggaran">Tandai biaya tetap di Anggaran</Link>}</div>
      <p className={styles.note}>Pertumbuhan pendapatan {ct.revGrowth == null ? '—' : pct(ct.revGrowth)}. Kategori yang tumbuh jauh lebih cepat dari pendapatan ditandai peringatan.</p>
      {ct.cats.length ? <Table cols={['Kategori', 'Jenis', 'Periode ini', 'Pembanding', 'Tumbuh', 'Porsi pendapatan', 'Anggaran', 'Status']} rows={ct.cats.map((x) => ({ key: x.id,
        onClick: () => open({ type: 'docs', kind: 'expense', key: x.id, title: x.name, value: rp(x.cur) }),
        cells: [x.name, x.fixed ? <span className={s.pill}>Tetap</span> : 'Variabel', rp(x.cur), rp(x.prev), x.growth == null ? '—' : pct(x.growth), pct(x.share),
          x.budget == null ? '—' : <span className={x.overBudget ? s.negv : undefined}>{rp(x.budget)}</span>, <Status v={x.status} />] }))} />
        : <p className={styles.note}>Belum ada pengeluaran berkategori pada periode ini.</p>}</section>
    <section className={styles.card}><h2 className={styles.cardT}>Per akun beban (jurnal)</h2>
      <Table cols={['Akun', 'Periode ini', 'Pembanding', 'Porsi pendapatan']} rows={ct.accounts.map((x) => ({ key: x.id,
        onClick: () => open({ type: 'journal', title: x.name, value: rp(x.cur), account: x.name, kinds: x.cls === 'hpp' ? ['hpp'] : ['biaya'] }),
        cells: [x.name, rp(x.cur), rp(x.prev), pct(x.share)] }))} />
      <p className={styles.note}>Total sama dengan laba rugi Pembukuan (HPP {rp(c.hpp)}, biaya operasional {rp(c.opex)}).</p></section>
  </>;
}

// ---------- BEP ----------
function BreakEven({ d, full }) {
  const be = breakEven(d.cur); const pj = projection(d); const br = full ? branches(d) : null;
  const days = n(d.hari); const perMonth = be.bep != null && days ? be.bep * 30 / days : null;
  return <>
    <section className={styles.card}><div className={styles.cardH}><h2 className={styles.cardT}>Titik impas (Break Even)</h2><Status v={be.status} /></div>
      {be.bep != null ? <>
        <p className={s.big}>{rp(be.bep)} <small>pendapatan minimal agar tidak rugi pada periode ini</small></p>
        <BepMini be={be} go={() => {}} noLink />
        <dl className={styles.kvs}>
          <div><dt>Margin kontribusi<small>(pendapatan − biaya variabel) ÷ pendapatan</small></dt><dd>{pct(be.cmr)}</dd></div>
          <div><dt>Biaya tetap periode ini</dt><dd>{rp(be.fixed)}</dd></div>
          <div><dt>Biaya variabel</dt><dd>{rp(be.variable)}</dd></div>
          <div><dt>Margin keamanan<small>(pendapatan − BEP) ÷ pendapatan</small></dt><dd className={be.safety < 0 ? s.negv : undefined}>{pct(be.safety)}</dd></div>
          {perMonth != null && <div><dt>Setara per bulan (30 hari)</dt><dd>{rp(perMonth)}</dd></div>}
        </dl></> : <p className="notice">{be.reason}</p>}
      <p className={styles.formula}><b>Cara hitung:</b> BEP = biaya tetap ÷ rasio margin kontribusi. Biaya tetap = kategori pengeluaran bertanda "Biaya tetap bulanan" + penyusutan + bunga (keputusan pemilik); biaya lain dianggap variabel. Satu periode yang sama dengan filter.</p>
      <p className={styles.note}>Kategori tetap saat ini: {(d.kategori_tetap || []).map((x) => x.nama).join(', ') || 'belum ada'} · <Link href="/anggaran">ubah di Anggaran</Link></p>
      {pj && <p className={s.proj}><Tag kind="proyeksi" /> Akhir periode diperkirakan {pj.reachBep ? 'melewati' : 'belum mencapai'} BEP (pendapatan ± {rp(pj.net)}).</p>}
    </section>
    {br && <BranchTable rows={br} />}
  </>;
}

// ---------- Kebocoran ----------
function Leakage({ d, open }) {
  const lk = leakage(d);
  if (!lk.supported) return <section className={styles.card}><h2 className={styles.cardT}>Kebocoran laba</h2><p className={styles.note}>Deteksi kebocoran untuk jenis bisnis ini <b>Dalam rencana</b> — belum ada catatan operasional yang bisa diperiksa.</p></section>;
  return <section className={styles.card}>
    <div className={styles.cardH}><h2 className={styles.cardT}>Kebocoran laba</h2><Status v={lk.status} /></div>
    <p className={s.big}>{rp(lk.actual)} <small>{lk.share != null ? `${pct(lk.share)} pendapatan bersih · ` : ''}kebocoran aktual</small></p>
    {lk.items.length ? <ul className={s.leaks}>{lk.items.map((x) => <li key={x.key}><button type="button" onClick={() => open({ type: 'docs', kind: 'leak', key: x.key, title: x.label, value: rp(x.value), formula: x.formula })}>
      <span className={`${s.kind} ${x.kind === 'aktual' ? s.bad : x.kind === 'risiko' ? s.warn : s.mute}`}>{x.kind === 'aktual' ? 'Aktual' : x.kind === 'risiko' ? 'Risiko' : 'Info'}</span>
      <span className={s.leakL}><b>{x.label}</b><small>{x.n ? `${angka(x.n)} catatan · ` : ''}{x.formula}</small></span>
      <span className={s.leakV}><b>{rp(x.value)}</b><small>{x.share != null ? pct(x.share) : ''}</small></span></button></li>)}</ul>
      : <p className={styles.note}>Tidak ada kebocoran tercatat pada periode ini.</p>}
    <p className={styles.note}>Bukan tuduhan: angka ini dari catatan yang ada. Ketuk untuk melihat transaksi asalnya. Kebocoran yang tidak pernah dicatat (mis. barang hilang tanpa opname) tidak terlihat di sini — lakukan stok opname rutin.</p>
  </section>;
}

// ---------- Peluang ----------
function Opportunity({ d, open, kosId, reload, finance }) {
  const op = opportunities(d);
  const [rate, setRate] = useState(d.opp_rate ?? ''); const [busy, setBusy] = useState(false);
  const saveRate = async () => { setBusy(true); const { error } = await supabase.rpc('profit_settings_set', { p_kos: kosId, p_rate: rate === '' ? null : Number(String(rate).replace(',', '.')) }); setBusy(false);
    if (error) return toast(errMsg(error)); toast('Suku bunga acuan disimpan'); reload(); };
  if (!op) return null;
  return <>
    <section className={styles.card}><div className={styles.cardH}><h2 className={styles.cardT}>Peluang yang terlewat</h2><Tag kind="estimasi" /></div>
      <p className={s.big}>{rp(op.total)} <small>total yang bisa dihitung</small></p>
      <p className={styles.note}>Perkiraan dari catatan yang ada dengan rumus tertulis — bukan uang yang hilang dari kas. Disesuaikan dengan jenis bisnis.</p>
      {finance && <div className={s.rate}><label>Suku bunga acuan (% per tahun)<input inputMode="decimal" value={rate} placeholder="mis. bunga pinjaman/deposito Anda" onChange={(e) => setRate(e.target.value)} /></label>
        <button type="button" className="sm" disabled={busy} onClick={saveRate}>Simpan</button></div>}
      <small className={styles.note}>Dipakai untuk biaya dana piutang terlambat & kas menganggur. Tidak ada angka bawaan — isi sesuai kondisi Anda.</small>
    </section>
    {op.list.map((o) => <section key={o.key} className={styles.card}>
      <div className={styles.cardH}><h2 className={styles.cardT}>{o.label}</h2><Tag kind="estimasi" /></div>
      <p className={s.big}>{o.value == null ? '—' : rp(o.value)} <small>{o.basis}{o.revenue ? ` · omzet ${rp(o.revenue)}` : ''}{o.n ? ` · ${angka(o.n)} item` : ''}</small></p>
      {o.reason && <p className="notice">{o.reason}</p>}
      {o.key === 'kas_menganggur' && <p className={styles.note}>Saldo kas & bank rata-rata {rp(o.avgBalance)} · uang keluar sebulan {rp(o.monthlyOut)} · menganggur {rp(o.idle)}.</p>}
      {o.key === 'piutang_lambat' && <p className={styles.note}>Sisa piutang lewat jatuh tempo {rp(o.outstanding)}.</p>}
      {o.items?.length > 0 && <Table cols={o.key === 'stok_habis' ? ['Barang', 'Hari habis', 'Laju/hari', 'Laba hilang'] : ['Kamar', 'Hari kosong', 'Status', 'Potensi sewa']}
        rows={o.items.slice(0, 15).map((x) => ({ key: x.id || x.name, onClick: o.key === 'stok_habis' ? () => open({ type: 'docs', kind: 'stock', key: x.id, title: x.name, value: x.value == null ? '—' : rp(x.value) }) : undefined,
          cells: o.key === 'stok_habis' ? [<>{x.name}{x.now && <small className={s.warnTxt}> habis sekarang</small>}</>, angka(x.days), x.rate == null ? '—' : x.rate.toLocaleString('id-ID', { maximumFractionDigits: 1 }), x.value == null ? <small>{x.reason}</small> : rp(x.value)]
            : [x.name, angka(x.days), x.status, rp(x.value)] }))} />}
      <p className={styles.formula}><b>Cara hitung:</b> {o.formula}</p>
    </section>)}
  </>;
}

// ---------- Pendorong omzet ----------
function Drivers({ d }) {
  const dr = drivers(d);
  return <>
    <section className={styles.card}><div className={styles.cardH}><h2 className={styles.cardT}>Pendorong omzet</h2><Tag kind="aktual" /></div>
      <p className={s.big}>{rp(dr.revenue)} <small>{dr.prev != null ? `${dr.change >= 0 ? '+' : ''}${rp(dr.change)} (${dr.growth == null ? '—' : pct(dr.growth)}) vs pembanding` : 'pilih pembanding di filter untuk melihat penyebab perubahan'}</small></p>
      {dr.parts.length > 0 ? <ul className={s.drv}>{dr.parts.map((x) => <li key={x.key}><span><b>{x.label}</b><small>{x.fmt === 'rp' ? `${rp(x.from)} → ${rp(x.to)}` : `${angka(x.from)} → ${angka(x.to)}`}</small></span>
        <b className={x.effect < 0 ? s.negv : s.okv}>{x.effect >= 0 ? '+' : ''}{rp(x.effect)}</b></li>)}</ul>
        : dr.prev != null && <p className={styles.note}>Jumlah transaksi pembanding kosong — dekomposisi tidak bisa dihitung.</p>}
      <p className={styles.formula}><b>Cara hitung:</b> Pendapatan = jumlah transaksi × nilai rata-rata. Efek jumlah = Δtransaksi × rata-rata lama; efek nilai = transaksi baru × Δrata-rata. Keduanya dijumlah = selisih pendapatan.</p></section>
    {dr.occupancy && <section className={styles.card}><h2 className={styles.cardT}>Hunian & tarif</h2>
      <dl className={styles.kvs}><div><dt>Hunian</dt><dd>{pct(dr.occupancy.now, 0)}{dr.occupancy.prev != null ? ` (pembanding ${pct(dr.occupancy.prev, 0)})` : ''}</dd></div>
        <div><dt>Uang masuk per hari terisi</dt><dd>{dr.occupancy.perDay == null ? '—' : rp(dr.occupancy.perDay)}{dr.occupancy.prevPerDay != null ? ` (pembanding ${rp(dr.occupancy.prevPerDay)})` : ''}</dd></div></dl></section>}
    {dr.movers?.up && <section className={styles.card}><h2 className={styles.cardT}>Yang paling berubah</h2>
      <div className={s.two}><div><h3 className={s.h3}>Naik</h3>{dr.movers.up.length ? <ul className={s.mv}>{dr.movers.up.map((x) => <li key={x.name}><span>{x.name}</span><b className={s.okv}>+{rp(x.change)}</b></li>)}</ul> : <p className={styles.note}>—</p>}</div>
        <div><h3 className={s.h3}>Turun</h3>{dr.movers.down.length ? <ul className={s.mv}>{dr.movers.down.map((x) => <li key={x.name}><span>{x.name}</span><b className={s.negv}>{rp(x.change)}</b></li>)}</ul> : <p className={styles.note}>—</p>}</div></div></section>}
  </>;
}

// ---------- Tabel & lembar rincian ----------
function Table({ cols, rows }) {
  if (!rows.length) return <p className={styles.note}>Belum ada data.</p>;
  return <div className={s.tw}><table className={s.table}>
    <thead><tr>{cols.map((c, i) => <th key={c} className={i ? s.r : undefined}>{c}</th>)}</tr></thead>
    <tbody>{rows.map((r) => <tr key={r.key} className={r.onClick ? s.click : undefined} tabIndex={r.onClick ? 0 : undefined} onClick={r.onClick}
      onKeyDown={r.onClick ? (e) => { if (e.key === 'Enter') r.onClick(); } : undefined}>{r.cells.map((c, i) => <td key={i} className={i ? s.r : undefined} data-l={cols[i]}>{c}</td>)}</tr>)}</tbody>
  </table></div>;
}

function SheetView({ sheet, d, kosId, range, branch, onClose }) {
  if (sheet.type === 'journal') return <DetailSheet title={sheet.title} value={sheet.value} formula={sheet.formula} onClose={onClose}>
    <JournalLines kosId={kosId} from={range.from} to={range.to} kinds={sheet.kinds || ['pendapatan', 'hpp', 'biaya']} account={sheet.account}
      branchNote={branch ? 'Daftar jurnal menampilkan semua lokasi; angka di atas hanya cabang terpilih.' : null} retail={d.jenis === 'retail'} /></DetailSheet>;
  if (sheet.type === 'docs') return <Sheet title={sheet.title} onClose={onClose}><Docs sheet={sheet} kosId={kosId} range={range} branch={branch} /></Sheet>;
  return <DetailSheet title={sheet.title} value={sheet.value} onClose={onClose} />;
}

function Docs({ sheet, kosId, range, branch }) {
  const [st, setSt] = useState(null);
  useEffect(() => {
    let on = true;
    supabase.rpc('profit_docs', { p_kos: kosId, p_kind: sheet.kind, p_key: sheet.key, p_from: range.from, p_to: range.to, p_branch: branch || null })
      .then(({ data, error }) => on && setSt(error ? { error } : { data }));
    return () => { on = false; };
  }, [kosId, sheet.kind, sheet.key, range.from, range.to, branch]);
  if (!st) return <Loading rows={3} />;
  if (st.error) return <p className="notice bad">{errMsg(st.error)}</p>;
  const rows = st.data.rows || []; const tot = rows.reduce((a, x) => a + n(x.nilai), 0);
  return <div className={styles.sheet}>
    {sheet.value && <strong className={styles.big}>{sheet.value}</strong>}
    {sheet.formula && <p className={styles.formula}><b>Cara hitung:</b> {sheet.formula}</p>}
    <p className={styles.note}>{rows.length} transaksi asal · jumlah nilai {rp(tot)}{rows.length >= 300 ? ' (300 pertama)' : ''}</p>
    <ul className={styles.rows}>{rows.map((x) => <li key={x.id + (x.ref || '') + x.tanggal}><div><b>{x.ref}</b>
      <small>{tgl(String(x.tanggal).slice(0, 10))} · {x.jenis}{x.qty != null ? ` · ${angka(x.qty)} unit` : ''}{x.hpp != null ? ` · modal ${rp(x.hpp)}` : ''}{x.sisa != null ? ` · sisa ${angka(x.sisa)}` : ''}{x.catatan ? ` · ${x.catatan}` : ''}</small>
      {x.link && <small><Link href={x.link}>Buka sumber</Link></small>}</div><span className={n(x.nilai) < 0 ? styles.neg : undefined}>{rp(x.nilai)}</span></li>)}</ul>
  </div>;
}
