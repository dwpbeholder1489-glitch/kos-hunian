'use client';
// Analisis Bisnis (Business Intelligence Center) — tata letak mengikuti gambar acuan pemilik 27 Nov 2026.
// Data: biz_intel (jurnal + transaksi; rentang/pembanding/cabang/kategori; batas paket di server), retail_kpi & stock_health (toko).
// Skor kesehatan, insight, dan proyeksi = aturan tertulis di lib/bizIntel.js (tanpa AI generatif, tanpa angka contoh).
// Desktop: grid multikolom + kolom kanan (Insight, Tindak lanjut). HP: KPI 2 kolom, tab kategori, filter di lembar bawah.
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { useKos } from '@/components/KosProvider';
import NavIcon from '@/components/NavIcon';
import PageHelp from '@/components/PageHelp';
import FiturUpgrade from '@/components/FiturUpgrade';
import { PageHeader, useMedia } from '@/components/Page';
import { Empty, Loading, Sheet, toast } from '@/components/ui';
import { BLN, angka, errMsg, rp, tgl, today } from '@/lib/format';
import { canArea, isKuliner } from '@/lib/business';
import { useKuotaEkspor } from '@/lib/ekspor';
import { COMPARE, HARI, HEALTH_RULES, PRESETS, compareRange, dasarFloor, daysBetween, healthScore, insights, kpis, monthName, presetRange, projection, terms } from '@/lib/bizIntel';
import { C, Donut, Gauge, GroupBars, Heatmap, NetBars, TrendChart, Waterfall } from './Charts';
import { DetailSheet, JournalLines } from './Details';
import styles from './analisis.module.css';

const n = (v) => Number(v || 0);
const pctTxt = (v, d = 1) => (v == null ? '—' : `${v.toLocaleString('id-ID', { maximumFractionDigits: d })}%`);
const ppTxt = (v) => (v == null ? '' : `${v >= 0 ? '+' : '−'}${Math.abs(v).toLocaleString('id-ID', { maximumFractionDigits: 1 })} p.p.`);
const signPct = (v) => (v == null ? '—' : `${v >= 0 ? '+' : '−'}${Math.abs(v).toLocaleString('id-ID', { maximumFractionDigits: 1 })}%`);
const monthEndOf = (s) => new Date(Date.UTC(+s.slice(0, 4), +s.slice(5, 7), 0)).toISOString().slice(0, 10);
function fmtRange(a, b) {
  if (!a) return '';
  const [ya, ma, da] = a.split('-'); const [yb, mb, db] = b.split('-');
  if (a === b) return tgl(a);
  if (ya === yb && ma === mb) return `${+da} – ${+db} ${BLN[+mb - 1]} ${yb}`;
  if (ya === yb) return `${+da} ${BLN[+ma - 1]} – ${+db} ${BLN[+mb - 1]} ${yb}`;
  return `${tgl(a)} – ${tgl(b)}`;
}
const Ico = ({ d, size = 20 }) => <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{d}</svg>;
const I = {
  bolt: <path d="M13 2 4 14h7l-1 8 9-12h-7z" />, shield: <><path d="M12 3 5 6v6c0 4.4 3 7.6 7 9 4-1.4 7-4.6 7-9V6z" /><path d="m9 12 2 2 4-4" /></>,
  spark: <><path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M6 18l2.5-2.5M15.5 8.5 18 6" /></>,
  down: <><path d="M12 4v11M7 10l5 5 5-5" /><path d="M5 20h14" /></>, store: <><path d="M4 9h16l-1-5H5z" /><path d="M5 9v11h14V9M9 20v-6h6v6" /></>,
  flow: <><path d="M4 7h13l-3-3M20 17H7l3 3" /></>, users: <><circle cx="9" cy="8" r="3.2" /><path d="M3 20c.5-3.5 3-5.5 6-5.5s5.5 2 6 5.5" /><path d="M16 4.8a3 3 0 0 1 0 6M18 14.8c1.6.7 2.7 2.4 3 5.2" /></>,
  chart: <><path d="M4 20V4M4 20h16" /><path d="m7 15 4-4 3 3 5-6" /></>, box: <><path d="m12 3 8 4.5v9L12 21l-8-4.5v-9z" /><path d="m4 7.5 8 4.5 8-4.5M12 12v9" /></>,
};

export default function Analisis() {
  const { kos, kosId, ver } = useKos();
  return kosId ? <Center key={kosId} kos={kos} kosId={kosId} ver={ver} /> : <Loading />;
}

// Filter universal: di URL (bertahan saat pindah halaman & kembali) + cadangan per perangkat
function readFilter(search, kosId) {
  const get = (k) => search.get(k) || '';
  let f = { p: get('p'), dari: get('dari'), sampai: get('sampai'), cmp: get('cmp'), cabang: get('cabang'), kat: get('kat') };
  if (!f.p) { try { f = { ...f, ...JSON.parse(localStorage.getItem('prasara-analisis-' + kosId) || '{}') }; } catch { /* abaikan */ } }
  if (!PRESETS.some(([k]) => k === f.p)) f.p = 'bulan';
  if (!COMPARE.some(([k]) => k === f.cmp)) f.cmp = 'prev';
  return f;
}

function Center({ kos, kosId, ver }) {
  const router = useRouter();
  const search = useSearchParams();
  const mobile = useMedia('(max-width: 767px)');
  const td = today();
  const [f, setF] = useState(() => readFilter(search, kosId));
  const range = presetRange(f.p, td, { from: f.dari, to: f.sampai });
  const cmp = compareRange(range, f.cmp, f.p);
  const [d, setD] = useState(null);
  const [err, setErr] = useState(null);
  const [extra, setExtra] = useState({});
  const [detail, setDetail] = useState(null);
  const [filterOpen, setFilterOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [mTab, setMTab] = useState('tren');
  const ek = useKuotaEkspor(kosId);

  useEffect(() => {
    const q = new URLSearchParams(Object.entries(f).filter(([, v]) => v).map(([k, v]) => [k, v]));
    router.replace('/analisis' + (q.toString() ? '?' + q : ''), { scroll: false });
    try { localStorage.setItem('prasara-analisis-' + kosId, JSON.stringify(f)); } catch { /* abaikan */ }
  }, [JSON.stringify(f)]); // eslint-disable-line react-hooks/exhaustive-deps

  const loadKey = [range.from, range.to, cmp?.from, cmp?.to, f.cabang, f.kat, ver].join('|');
  useEffect(() => {
    let on = true; setD(null); setErr(null); setExtra({});
    supabase.rpc('biz_intel', { p_kos: kosId, p_from: range.from, p_to: range.to, p_cmp_from: cmp?.from || null, p_cmp_to: cmp?.to || null,
      p_branch: f.cabang || null, p_category: f.kat || null }).then(({ data, error }) => {
      if (!on) return;
      if (error) { setErr(error); return; }
      setD(data);
      if (data.jenis === 'retail' && data.level !== 'dasar') {
        Promise.all([supabase.rpc('stock_health', { p_kos: kosId }), supabase.rpc('retail_kpi', { p_kos: kosId, p_from: range.from, p_to: range.to })])
          .then(([s, r]) => on && setExtra({ stock: s.error ? null : s.data, kpi: r.error ? null : r.data }));
      }
    });
    return () => { on = false; };
  }, [kosId, loadKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const set = (patch) => { setDetail(null); setF((x) => ({ ...x, ...patch })); };
  const owner = canArea(kos, 'team');
  const level = d?.level;
  const T = d ? terms(d, isKuliner(kos)) : terms({ jenis: kos.business_type }, isKuliner(kos));
  const cmpName = !cmp ? null : f.cmp === 'yoy' ? 'tahun lalu' : f.p === 'bulan' || f.p === 'bulan_lalu' ? 'bulan lalu' : f.p === 'minggu' ? 'minggu lalu'
    : f.p === 'hari' ? 'kemarin' : f.p === 'kuartal' ? 'kuartal lalu' : f.p === 'tahun' ? 'tahun lalu' : 'periode sebelumnya';
  const presetName = PRESETS.find(([k]) => k === f.p)[1];

  const filterPanel = <FilterPanel f={f} set={set} level={level} td={td} d={d} range={range} onDone={() => setFilterOpen(false)} />;
  const header = <PageHeader title={<span className={styles.title}><span className={styles.titleIco}><NavIcon name="/analisis" size={26} /></span>Analisis Bisnis</span>}
    help={<PageHelp page="analisis" label="? Panduan" />}
    desc="Evaluasi performa, temukan peluang, kelola risiko, dan ambil keputusan bisnis dengan data yang akurat."
    actions={<div className={styles.actions}>
      <button type="button" className={styles.period} onClick={() => setFilterOpen(true)} aria-haspopup="dialog">
        <Ico d={<><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M3 10h18M8 3v4M16 3v4" /></>} />
        <span><b>{presetName}</b><small>{fmtRange(range.from, range.to)}</small></span><NavIcon name="down" size={16} />
      </button>
      <div className={styles.menuWrap}>
        <button type="button" className={styles.btn} disabled={!d} onClick={() => setExportOpen((x) => !x)} aria-expanded={exportOpen}><Ico d={I.down} size={18} /><span>Ekspor</span></button>
        {exportOpen && d && <div className={styles.menu} role="menu">
          <button role="menuitem" onClick={() => { setExportOpen(false); doExport('xlsx'); }}>Excel (.xlsx)</button>
          <button role="menuitem" onClick={() => { setExportOpen(false); doExport('pdf'); }}>PDF</button>
          {ek.info && <small>{ek.info}</small>}
        </div>}
      </div>
      <button type="button" className={styles.btn} disabled={!d} onClick={() => share()}><NavIcon name="share" size={18} /><span>Bagikan</span></button>
    </div>} />;
  const filterSheet = filterOpen && <Sheet title="Filter analisis" onClose={() => setFilterOpen(false)}>{filterPanel}</Sheet>;

  if (err) {
    const msg = errMsg(err); const batas = /BATAS_PAKET/.test(err.message || '');
    return <div className={styles.page}>{header}{filterSheet}
      <div className="notice bad" role="alert">{/biz_intel/.test(err.message || '') ? 'Database sedang diperbarui. Coba lagi beberapa menit lagi.' : msg}</div>
      {batas && <><button type="button" onClick={() => set({ p: 'bulan', dari: '', sampai: '', cabang: '', kat: '' })}>Kembali ke Bulan ini</button>
        <FiturUpgrade kosId={kosId} owner={owner} plan={f.cabang ? 'pro' : 'bisnis'} event={f.cabang ? 'ANALYTICS.MULTI_BRANCH.REQUESTED' : 'ANALYTICS.ADVANCED.REQUESTED'}
          title={f.cabang ? 'Analisis per cabang tersedia di Paket Pro' : 'Periode panjang tersedia mulai Paket Bisnis'} text="Tren 12 bulan, periode kuartal/tahun/kustom, produk, pelanggan, dan persediaan." /></>}
    </div>;
  }
  if (!d) return <div className={styles.page}>{header}{filterSheet}<Loading rows={6} /></div>;

  // ---------- Turunan ----------
  const k = kpis(d);
  const health = healthScore(d, extra);
  const proj = level !== 'dasar' ? projection(d.tren, td) : null;
  const ins = insights(d, { ...extra, proj, cmpName });
  const lanjut = level !== 'dasar';
  const retail = d.jenis === 'retail'; const kosType = d.jenis === 'properti'; const jasa = d.jenis === 'jasa';
  const kasRetail = ['retail', 'jasa', 'kustom'].includes(d.jenis);
  const kosong = n(d.cur.pendapatan) === 0 && n(d.cur.transaksi) === 0 && n(d.cur.biaya) === 0;
  const reportHref = { retail: `/laporan-toko?dari=${range.from}&sampai=${range.to}`, jasa: '/laporan-jasa', properti: '/laporan', kustom: '/laporan-kustom' }[d.jenis] || '/laporan';
  const pembukuan = (tab) => `/pembukuan?${tab ? `tab=${tab}&` : ''}bulan=${range.to.slice(0, 7)}`;
  const branchNote = f.cabang ? `Rincian jurnal di bawah mencakup semua lokasi; angka utama di atas hanya ${d.branch_name}.` : null;
  const vs = cmp && d.cmp ? `vs ${cmpName}` : null;

  // ---------- Drill-down ----------
  const metric = (key) => {
    const c = d.cur, p = d.cmp;
    const map = {
      pendapatan: { title: T.omzet, value: rp(c.pendapatan), kinds: ['pendapatan'], formula: 'Jumlah kredit dikurangi debit pada akun pendapatan di jurnal periode ini (sama dengan Laba Rugi Pembukuan).',
        rows: [[`Periode ini`, rp(c.pendapatan), fmtRange(d.from, d.to)], p && [`Pembanding`, rp(p.pendapatan), fmtRange(d.cmp_from, d.cmp_to)], p && ['Perubahan', signPct(k.growth)],
          [T.trx, angka(c.transaksi)], p && [`${T.trx} pembanding`, angka(p.transaksi)], [T.avg, k.avg == null ? '—' : rp(k.avg)], p && [`${T.avg} pembanding`, k.avg_lalu == null ? '—' : rp(k.avg_lalu)]] },
      laba: { title: 'Laba bersih', value: rp(c.laba), kinds: ['pendapatan', 'hpp', 'biaya'], formula: 'Pendapatan − HPP − biaya operasional, sebelum pajak penghasilan.',
        rows: [[T.omzet, rp(c.pendapatan)], ['HPP', rp(-c.hpp)], ['Biaya operasional', rp(-c.biaya)], ['Laba bersih', rp(c.laba)], ['Margin laba bersih', pctTxt(k.margin)], ['Margin laba kotor', pctTxt(k.gross)],
          p && ['Laba bersih pembanding', rp(p.laba)], p && ['Margin pembanding', pctTxt(k.margin_lalu)]] },
      hpp: { title: 'HPP (modal barang terjual)', value: rp(c.hpp), kinds: ['hpp'], formula: 'Debit dikurangi kredit pada akun Harga Pokok Penjualan.', rows: [['Rasio HPP', pctTxt(n(c.pendapatan) ? (n(c.hpp) * 100) / n(c.pendapatan) : null)], p && ['Pembanding', rp(p.hpp)]] },
      biaya: { title: 'Biaya operasional', value: rp(c.biaya), kinds: ['biaya'], formula: 'Debit dikurangi kredit pada akun beban selain HPP (termasuk penyusutan, tidak termasuk pengambilan pemilik).',
        rows: [['Rasio biaya', pctTxt(n(c.pendapatan) ? (n(c.biaya) * 100) / n(c.pendapatan) : null)], p && ['Pembanding', rp(p.biaya)]] },
      efisiensi: { title: 'Efisiensi operasional', value: pctTxt(k.eff), kinds: ['biaya'], formula: 'Efisiensi = 100% − (biaya operasional ÷ pendapatan). Semakin tinggi, semakin kecil bagian pendapatan yang habis untuk biaya operasional.',
        rows: [[T.omzet, rp(c.pendapatan)], ['Biaya operasional', rp(c.biaya)], p && ['Efisiensi pembanding', pctTxt(k.eff_lalu)], p && ['Perubahan', ppTxt(k.eff != null && k.eff_lalu != null ? k.eff - k.eff_lalu : null)]] },
      margin: { title: 'Margin laba bersih', value: pctTxt(k.margin), kinds: ['pendapatan', 'hpp', 'biaya'], formula: 'Laba bersih ÷ pendapatan × 100%.',
        rows: [['Laba bersih', rp(c.laba)], [T.omzet, rp(c.pendapatan)], ['Margin laba kotor', pctTxt(k.gross), '(pendapatan − HPP) ÷ pendapatan'], p && ['Margin pembanding', pctTxt(k.margin_lalu)], p && ['Perubahan', ppTxt(k.margin != null && k.margin_lalu != null ? k.margin - k.margin_lalu : null)]] },
    }[key];
    return { type: 'metric', ...map };
  };
  const open = (x) => setDetail(x);

  // ---------- Isi kartu ----------
  const healthCard = <section className={`${styles.card} ${styles.health}`} aria-labelledby="hs">
    <h2 id="hs" className={styles.cardT}>Skor Kesehatan Bisnis <button type="button" className={styles.info} onClick={() => open({ type: 'health' })} aria-label="Cara skor dihitung"><NavIcon name="info" size={16} /></button></h2>
    <div className={styles.healthBody}>
      <button type="button" className={styles.gaugeBtn} onClick={() => open({ type: 'health' })} aria-label="Rincian skor"><Gauge score={health.score} size={mobile ? 104 : 148} /></button>
      <div className={styles.healthText}>
        {health.score != null ? <><span className={`${styles.status} ${styles[health.status[1]]}`}><NavIcon name="done" size={18} />{health.status[0]}</span><p>{health.summary}</p></>
          : <><span className={styles.status}>Belum dinilai</span><p>{health.reason}</p></>}
        <button type="button" className={styles.link} onClick={() => open({ type: 'health' })}>Lihat Detail Penilaian <NavIcon name="next" size={14} /></button>
      </div>
    </div>
  </section>;

  const kpiCard = (ico, label, value, sub, onDetail, tone, extraEl) => <section className={styles.card + ' ' + styles.kpi}>
    <span className={styles.kpiIco}>{ico}</span>
    <h3>{label}</h3>
    <button type="button" className={styles.kpiVal + (tone ? ' ' + styles[tone] : '')} onClick={onDetail}>{value}{extraEl}</button>
    <p>{sub}</p>
    <button type="button" className={styles.link} onClick={onDetail}>Detail <NavIcon name="next" size={14} /></button>
  </section>;
  const up = k.growth == null ? null : k.growth >= 0;
  const kpiCards = <>
    {kpiCard(<Ico d={I.store} />, `Pertumbuhan ${T.omzet.toLowerCase()}`, signPct(k.growth),
      k.growth == null ? (cmp ? 'Pembanding belum punya pendapatan.' : 'Pilih pembanding di filter.') : <>{vs}<br />{rp(k.pendapatan_lalu)}</>, () => open(metric('pendapatan')),
      up == null ? null : up ? 'good' : 'bad', up != null && <span className={styles.arrow + ' ' + (up ? styles.good : styles.bad)}><Ico size={18} d={<path d="M7 17 17 7M9 7h8v8" />} /></span>)}
    {kpiCard(<NavIcon name="coins" size={22} />, 'Margin laba bersih', pctTxt(k.margin),
      k.margin_lalu != null ? <>{vs} {pctTxt(k.margin_lalu)}<br />({ppTxt(k.margin - k.margin_lalu)})</> : `Laba bersih ${rp(k.laba)}`, () => open(metric('margin')), k.margin != null && k.margin < 0 ? 'bad' : null)}
    {kpiCard(<Ico d={I.bolt} />, 'Efisiensi operasional', pctTxt(k.eff, 0),
      k.eff_lalu != null ? <>{vs} {pctTxt(k.eff_lalu, 0)}<br />({ppTxt(k.eff - k.eff_lalu)})</> : 'Biaya operasional dibanding pendapatan', () => open(metric('efisiensi')))}
    {kpiCard(<Ico d={I.shield} />, 'Risiko bisnis', <span className={styles.badge + ' ' + styles[health.riskLevel === 'Rendah' ? 'good' : health.riskLevel === 'Sedang' ? 'warn' : health.riskLevel ? 'bad' : '']}>{health.riskLevel || '—'}</span>,
      health.riskLevel == null ? 'Belum ada transaksi.' : health.risks.length ? `${health.risks.length} faktor risiko perlu diperhatikan.` : 'Tidak ada indikasi risiko signifikan.', () => open({ type: 'risk' }))}
  </>;

  const insightCard = <section className={`${styles.card} ${styles.insight}`} aria-labelledby="iu">
    <h2 id="iu" className={styles.cardT}><span className={styles.tIco}><Ico d={I.spark} /></span>Insight Utama</h2>
    {ins.length === 0 ? <p className={styles.note}>{kosong ? 'Belum ada transaksi pada periode ini.' : 'Tidak ada perubahan berarti yang terdeteksi pada periode ini.'}</p>
      : <ol className={styles.insList}>{ins.slice(0, 4).map((x, i) => <li key={x.id}><button type="button" onClick={() => open({ type: 'insight', x })}><span className={styles.num}>{i + 1}</span><span>{x.short}</span></button></li>)}</ol>}
    {ins.length > 4 && <button type="button" className={styles.link} onClick={() => open({ type: 'insights' })}>Lihat semua ({ins.length}) <NavIcon name="next" size={14} /></button>}
  </section>;

  const TOPICS = [
    ['profit', 'Analisis profitabilitas', `Margin, laba bersih, dan kontribusi ${T.produk.toLowerCase()}`, <Ico key="i" d={I.chart} />],
    ['kas', 'Analisis arus kas', 'Pemasukan, pengeluaran, dan posisi kas', <Ico key="i" d={I.flow} />],
    ['produk', kosType ? 'Analisis kamar & hunian' : retail ? 'Analisis produk & persediaan' : `Analisis ${T.produk.toLowerCase()}`, kosType ? 'Hunian, penagihan, dan pendapatan per jenis' : retail ? 'Produk terlaris, stok lambat, dan perputaran' : `${T.produk} terlaris dan kontribusinya`, <Ico key="i" d={I.box} />],
    ['pelanggan', `Analisis perilaku ${T.pelanggan.toLowerCase()}`, kosType ? 'Penghuni masuk, keluar, dan aktif' : 'Segmentasi, loyalitas, dan frekuensi beli', <Ico key="i" d={I.users} />],
    ['efisiensi', 'Efisiensi operasional', 'Biaya, produktivitas, dan rasio efisiensi', <Ico key="i" d={I.bolt} />],
    ['risiko', 'Prediksi & risiko bisnis', `Proyeksi ${T.omzet.toLowerCase()} dan faktor risiko`, <Ico key="i" d={I.shield} />],
    ['peluang', 'Rekomendasi pengembangan', 'Peluang pertumbuhan dan prioritas tindakan', <Ico key="i" d={I.spark} />],
    ['alokasi', 'Alokasi laba & investasi', 'Laba ditahan, pengambilan pemilik, simulasi investasi', <NavIcon key="a" name="/aset" size={20} />],
  ];
  const topicCard = <section className={`${styles.card} ${styles.topics}`} aria-labelledby="atl">
    <h2 id="atl" className={styles.cardT}><span className={styles.tIco}><NavIcon name="/layers" size={20} /></span>Analisis &amp; Tindak Lanjut</h2>
    <ul>{TOPICS.map(([key, t, s, ico]) => <li key={key}><button type="button" onClick={() => open({ type: 'topic', key })}>
      <span className={styles.topIco}>{ico}</span>
      <span><b>{t}</b><small>{s}</small></span><NavIcon name="next" size={16} /></button></li>)}</ul>
  </section>;

  // Tren
  const trendCard = <TrendCard d={d} T={T} proj={proj} range={range} onPoint={(p) => open({ type: 'point', p })} onDetail={() => open({ type: 'tren' })} lanjut={lanjut} />;

  // Laba rugi
  const lrSeries = [{ label: T.omzet, color: C.dark, key: 'pendapatan' }, { label: 'HPP', color: C.light, key: 'hpp' }, { label: 'Biaya operasional', color: C.pale, key: 'biaya' }, { label: 'Laba bersih', color: C.mid, key: 'laba' }];
  const lrGroups = [d.cmp && { label: cmpName ? cmpName[0].toUpperCase() + cmpName.slice(1) : 'Pembanding', row: d.cmp }, { label: 'Periode ini', row: d.cur }].filter(Boolean);
  const plCard = <section className={styles.card} aria-labelledby="lr">
    <div className={styles.cardH}><h2 id="lr" className={styles.cardT}><span className={styles.tIco}><Ico d={I.chart} /></span>Laba Rugi (P&amp;L)</h2>
      <button type="button" className={styles.link} onClick={() => open({ type: 'topic', key: 'profit' })}>Detail P&amp;L <NavIcon name="next" size={14} /></button></div>
    <div className={styles.split}>
      <GroupBars groups={lrGroups.map((g) => ({ label: g.label, values: lrSeries.map((s) => n(g.row[s.key])) }))} series={lrSeries}
        onPick={(gi, si) => open(metric(['pendapatan', 'hpp', 'biaya', 'laba'][si]))} />
      <ul className={styles.legendList}>{lrSeries.map((s) => <li key={s.key} className={s.key === 'laba' ? styles.total : undefined}>
        <button type="button" onClick={() => open(metric(s.key))}><i style={{ background: s.color }} /><span>{s.label}</span><b>{rp(s.key === 'pendapatan' ? d.cur[s.key] : s.key === 'laba' ? d.cur.laba : d.cur[s.key])}</b></button></li>)}
        <li className={styles.mini}><span>Margin kotor {pctTxt(k.gross)} · bersih {pctTxt(k.margin)}</span></li></ul>
    </div>
  </section>;

  // Arus kas
  const kas = d.kas;
  const cashItems = (kas?.buckets || []).map((b, i) => ({ label: kas.grain === 'week' ? `M${i + 1}` : BLN[+b.mulai.slice(5, 7) - 1], title: fmtRange(b.mulai, b.selesai), value: n(b.masuk) - n(b.keluar), b }));
  const cashCard = <section className={styles.card} aria-labelledby="ak">
    <div className={styles.cardH}><h2 id="ak" className={styles.cardT}><span className={styles.tIco}><Ico d={I.flow} /></span>Arus Kas (Cash Flow)</h2>
      <button type="button" className={styles.link} onClick={() => open({ type: 'topic', key: 'kas' })}>Detail Arus Kas <NavIcon name="next" size={14} /></button></div>
    <div className={styles.split}>
      <NetBars items={cashItems} onPick={(i) => open({ type: 'cash', b: cashItems[i].b, label: cashItems[i].title })} />
      <ul className={styles.legendList}>
        <li><button type="button" onClick={() => open({ type: 'topic', key: 'kas' })}><i style={{ background: C.mid }} /><span>Arus kas masuk</span><b>{rp(kas.masuk)}</b></button></li>
        <li><button type="button" onClick={() => open({ type: 'topic', key: 'kas' })}><i style={{ background: C.red }} /><span>Arus kas keluar</span><b>{rp(kas.keluar)}</b></button></li>
        <li className={styles.total}><button type="button" onClick={() => open({ type: 'topic', key: 'kas' })}><i style={{ background: C.dark }} /><span>Kas bersih</span><b>{rp(n(kas.masuk) - n(kas.keluar))}</b></button></li>
        <li className={styles.mini}><span>Saldo akhir {rp(kas.saldo_akhir)}{f.cabang ? ' · semua lokasi' : ''}</span></li>
      </ul>
    </div>
  </section>;

  // Baris bawah adaptif per jenis bisnis
  const lock = (title, text, plan = 'bisnis') => <FiturUpgrade kosId={kosId} owner={owner} plan={plan} event={plan === 'pro' ? 'ANALYTICS.MULTI_BRANCH.REQUESTED' : 'ANALYTICS.ADVANCED.REQUESTED'} title={title} text={text} />;
  const productCard = <ProductCard d={d} T={T} lanjut={lanjut} lock={lock} onItem={(x) => open({ type: 'product', x })} onAll={() => open({ type: 'topic', key: 'produk' })} onAccount={(a) => open({ type: 'account', a })} />;
  const secondCard = retail ? <InventoryCard d={d} extra={extra} lanjut={lanjut} lock={lock} onDetail={() => open({ type: 'topic', key: 'produk' })} />
    : jasa ? <OrdersCard d={d} T={T} onDetail={() => open({ type: 'topic', key: 'efisiensi' })} onPoint={(p) => open({ type: 'point', p })} />
    : kosType ? <OccupancyCard d={d} onDetail={() => open({ type: 'topic', key: 'produk' })} />
    : <PositionCard d={d} onDetail={() => open({ type: 'topic', key: 'kas' })} />;
  const customerCard = <CustomerCard d={d} T={T} k={k} lanjut={lanjut} lock={lock} onSeg={(seg) => open({ type: 'segment', seg })} onDetail={() => open({ type: 'topic', key: 'pelanggan' })} />;

  const notes = <div className={styles.context}>
    {vs ? <span>Dibandingkan dengan <b>{fmtRange(d.cmp_from, d.cmp_to)}</b></span> : <span>{d.cmp_terkunci ? 'Pembanding tahun lalu tersedia mulai Paket Bisnis.' : 'Tanpa pembanding'}</span>}
    {d.multi_lokasi && <span>Lokasi: <b>{d.branch_name || 'Semua'}</b></span>}
    {d.category_name && <span>Kategori produk: <b>{d.category_name}</b> (hanya bagian Produk)</span>}
    <span className={styles.tag}>Data aktual dari Pembukuan</span>
    <button type="button" className={styles.filterChip} onClick={() => setFilterOpen(true)}><NavIcon name="filter" size={16} />Filter</button>
  </div>;

  const mTabs = [['tren', 'Tren'], ['laba', 'Laba Rugi'], ['kas', 'Arus Kas'], ['produk', kosType ? 'Kamar' : T.produk], ['pelanggan', T.pelanggan], ['tindak', 'Tindak Lanjut']];

  // ---------- Ekspor & bagikan ----------
  function sheetsFor() {
    const N = (v) => Math.round(n(v) * 100) / 100;
    const s = [
      { name: 'Ringkasan', cols: ['Indikator', 'Periode ini', 'Pembanding', 'Perubahan'], types: ['t', 't', 't', 't'], rows: [
        ['Bisnis', kos.name, '', ''], ['Periode', fmtRange(d.from, d.to), d.cmp ? fmtRange(d.cmp_from, d.cmp_to) : '—', ''],
        ['Lokasi', d.branch_name || 'Semua', '', ''], [T.omzet, rp(d.cur.pendapatan), d.cmp ? rp(d.cmp.pendapatan) : '', signPct(k.growth)],
        ['HPP', rp(d.cur.hpp), d.cmp ? rp(d.cmp.hpp) : '', ''], ['Biaya operasional', rp(d.cur.biaya), d.cmp ? rp(d.cmp.biaya) : '', ''],
        ['Laba bersih', rp(d.cur.laba), d.cmp ? rp(d.cmp.laba) : '', ''], ['Margin laba kotor', pctTxt(k.gross), pctTxt(k.gross_lalu), ''],
        ['Margin laba bersih', pctTxt(k.margin), pctTxt(k.margin_lalu), ppTxt(k.margin != null && k.margin_lalu != null ? k.margin - k.margin_lalu : null)],
        ['Efisiensi operasional', pctTxt(k.eff), pctTxt(k.eff_lalu), ''], [T.trx, angka(d.cur.transaksi), d.cmp ? angka(d.cmp.transaksi) : '', ''],
        [T.avg, k.avg == null ? '—' : rp(k.avg), k.avg_lalu == null ? '—' : rp(k.avg_lalu), ''], ['Kas masuk', rp(kas.masuk), '', ''], ['Kas keluar', rp(kas.keluar), '', ''],
        ['Saldo kas & bank akhir', rp(kas.saldo_akhir), '', ''], ['Skor kesehatan', health.score == null ? 'Belum dinilai' : String(health.score), '', ''], ['Risiko', health.riskLevel || '—', '', '']] },
      { name: 'Skor kesehatan', cols: ['Komponen', 'Bobot', 'Skor', 'Dasar perhitungan', 'Keterangan'], types: ['t', 'n', 'n', 't', 't'],
        rows: health.components.map((c) => [c.label, c.weight, c.score, c.basis, c.reason || '']) },
      { name: 'Insight', cols: ['Jenis', 'Temuan', 'Penyebab (data)', 'Tindakan'], types: ['t', 't', 't', 't'], rows: ins.map((x) => [x.kind, x.title, x.cause, x.action]) },
      { name: 'Tren bulanan', cols: ['Bulan', T.omzet, 'HPP', 'Biaya', 'Laba bersih', T.trx], types: ['t', 'r', 'r', 'r', 'r', 'n'],
        rows: d.tren.map((r) => [monthName(r.mulai.slice(0, 7)), N(r.pendapatan), N(r.hpp), N(r.biaya), N(r.pendapatan - r.hpp - r.biaya), r.transaksi]) },
      { name: 'Arus kas', cols: ['Mulai', 'Selesai', 'Masuk', 'Keluar', 'Bersih'], types: ['d', 'd', 'r', 'r', 'r'], rows: kas.buckets.map((b) => [b.mulai, b.selesai, N(b.masuk), N(b.keluar), N(b.masuk - b.keluar)]) },
    ];
    if (d.harian) s.push({ name: 'Harian', cols: ['Tanggal', T.omzet, 'HPP', 'Biaya', T.trx], types: ['d', 'r', 'r', 'r', 'n'], rows: d.harian.map((r) => [r.mulai, N(r.pendapatan), N(r.hpp), N(r.biaya), r.transaksi]) });
    if (d.per_akun) s.push({ name: 'Per akun', cols: ['Akun', 'Jenis', 'Periode ini', 'Pembanding'], types: ['t', 't', 'r', 'r'], rows: d.per_akun.map((a) => [a.akun, a.jenis, N(a.ini), N(a.lalu)]) });
    if (d.produk) s.push({ name: T.produk, cols: [T.produk, 'Jumlah', 'Nilai', 'Laba kotor', 'Nilai pembanding'], types: ['t', 'n', 'r', 'r', 'r'], rows: d.produk.items.map((x) => [x.nama, x.jumlah, N(x.nilai), x.laba == null ? null : N(x.laba), N(x.nilai_lalu)]) });
    if (d.pelanggan) s.push({ name: T.pelanggan, cols: ['Nama', 'Segmen', 'Transaksi', 'Nilai', 'Terakhir'], types: ['t', 't', 'n', 'r', 'd'], rows: d.pelanggan.daftar.map((c) => [c.name, SEG[c.seg]?.[0] || c.seg, c.n, N(c.nilai), c.terakhir]) });
    if (d.persediaan) s.push({ name: 'Persediaan', cols: ['Bulan', 'HPP', 'Nilai awal', 'Nilai akhir', 'Perputaran'], types: ['t', 'r', 'r', 'r', 'n'], rows: d.persediaan.map((r) => [monthName(r.mulai.slice(0, 7)), N(r.hpp), N(r.awal), N(r.akhir), r.perputaran]) });
    if (d.per_lokasi) s.push({ name: 'Per lokasi', cols: ['Lokasi', T.omzet, 'Laba bersih', T.trx, 'Pembanding'], types: ['t', 'r', 'r', 'n', 'r'], rows: d.per_lokasi.map((l) => [l.lokasi, N(l.cur.pendapatan), N(l.cur.laba), l.cur.transaksi, l.cmp ? N(l.cmp.pendapatan) : null]) });
    return s;
  }
  function download(blob, name) { const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); a.remove(); }
  async function doExport(fmt) {
    if (ek.habis) return toast(ek.q?.message || 'Kuota ekspor bulan ini sudah habis.');
    const base = `Analisis-bisnis-${range.from}-${range.to}`;
    try {
      if (fmt === 'xlsx') {
        const { makeXlsx } = await import('@/lib/xlsx');
        const blob = makeXlsx(sheetsFor());
        ek.jalankan('analisis_xlsx', () => download(blob, base + '.xlsx'));
      } else {
        const { makePdf } = await import('@/lib/pdfExport');
        const blob = await makePdf({ title: 'Analisis Bisnis', business: kos.name, type: d.jenis, subtitle: `${kos.name} · ${fmtRange(d.from, d.to)}${d.branch_name ? ' · ' + d.branch_name : ''}`,
          exported_at: new Date().toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' }), sheets: sheetsFor(),
          note: 'Angka aktual dari jurnal Pembukuan dan transaksi tercatat. Skor kesehatan & insight dihitung dengan aturan tertulis; proyeksi bukan angka aktual.' });
        ek.jalankan('analisis_pdf', () => download(blob, base + '.pdf'));
      }
    } catch (e) { toast(errMsg(e)); }
  }
  async function share() {
    const text = [`Analisis Bisnis ${kos.name}`, `Periode ${fmtRange(d.from, d.to)}${vs ? ` (${vs})` : ''}`,
      `${T.omzet}: ${rp(d.cur.pendapatan)}${k.growth != null ? ` (${signPct(k.growth)})` : ''}`, `Laba bersih: ${rp(d.cur.laba)} · margin ${pctTxt(k.margin)}`,
      `Skor kesehatan: ${health.score ?? 'belum dinilai'} · risiko ${health.riskLevel || '—'}`, ...ins.slice(0, 3).map((x, i) => `${i + 1}. ${x.short}`)].join('\n');
    try {
      if (navigator.share) await navigator.share({ title: 'Analisis Bisnis', text });
      else { await navigator.clipboard.writeText(text); toast('Ringkasan disalin. Tempel di WhatsApp atau email.'); }
    } catch (e) { if (e?.name !== 'AbortError') toast('Tidak bisa membagikan dari perangkat ini.'); }
  }

  const sheet = detail && <DetailView detail={detail} d={d} k={k} T={T} health={health} ins={ins} proj={proj} extra={extra} kosId={kosId} kas={kas} range={range} retail={kasRetail}
    branchNote={branchNote} reportHref={reportHref} pembukuan={pembukuan} metric={metric} open={open} onClose={() => setDetail(null)} lanjut={lanjut} lock={lock} vs={vs} />;

  return <div className={styles.page}>
    {header}{filterSheet}
    {notes}
    {kosong && <div className="notice">Belum ada transaksi tercatat pada {fmtRange(d.from, d.to)}. Angka akan muncul setelah ada penjualan, pembayaran, atau pengeluaran.</div>}
    {mobile ? <>
      {healthCard}
      <div className={styles.kpis}>{kpiCards}</div>
      {insightCard}
      <nav className={styles.mtabs} aria-label="Kategori analisis">{mTabs.map(([key, label]) => <button key={key} type="button" aria-pressed={mTab === key} onClick={() => setMTab(key)}>{label}</button>)}</nav>
      {mTab === 'tren' && trendCard}
      {mTab === 'laba' && plCard}
      {mTab === 'kas' && cashCard}
      {mTab === 'produk' && <>{productCard}{secondCard}</>}
      {mTab === 'pelanggan' && customerCard}
      {mTab === 'tindak' && topicCard}
    </> : <div className={styles.grid}>
      <div className={styles.main}>
        <div className={styles.row1}>{healthCard}{kpiCards}</div>
        {trendCard}
        <div className={styles.row2}>{plCard}{cashCard}</div>
        <div className={styles.row3}>{productCard}{secondCard}{customerCard}</div>
        {d.per_lokasi && !f.cabang && <BranchCard d={d} onPick={(id) => set({ cabang: id })} />}
      </div>
      <aside className={styles.side}>{insightCard}{topicCard}</aside>
    </div>}
    {mobile && d.per_lokasi && !f.cabang && mTab === 'tren' && <BranchCard d={d} onPick={(id) => set({ cabang: id })} />}
    <p className={styles.foot}>Angka uang = jurnal Pembukuan (sebelum pajak penghasilan); jumlah transaksi dari menu operasional. Skor, insight, dan proyeksi dihitung dengan aturan tertulis — ketuk angka mana pun untuk melihat dasar perhitungan dan transaksi sumbernya.</p>
    {sheet}
  </div>;
}

// ---------- Filter ----------
function FilterPanel({ f, set, level, td, d, range, onDone }) {
  const floor = dasarFloor(td);
  const dasar = level === 'dasar';
  const [from, setFrom] = useState(f.p === 'kustom' ? range.from : f.dari || range.from);
  const [to, setTo] = useState(f.p === 'kustom' ? range.to : f.sampai || range.to);
  const lockedPreset = (p) => dasar && ['kuartal', 'tahun'].includes(p) && presetRange(p, td).from < floor;
  return <div className={styles.filter}>
    <fieldset><legend>Periode</legend><div className={styles.chips}>{PRESETS.map(([key, label]) =>
      <button key={key} type="button" aria-pressed={f.p === key} disabled={lockedPreset(key)} onClick={() => key === 'kustom' ? set({ p: 'kustom', dari: from, sampai: to }) : set({ p: key, dari: '', sampai: '' })}>
        {label}{lockedPreset(key) && <small> · Paket Bisnis</small>}</button>)}</div>
      {f.p === 'kustom' && <div className={styles.dates}>
        <label>Dari<input type="date" value={from} min={dasar ? floor : undefined} max={td} onChange={(e) => setFrom(e.target.value)} /></label>
        <label>Sampai<input type="date" value={to} min={from} max={td} onChange={(e) => setTo(e.target.value)} /></label>
        <button type="button" disabled={!from || !to || from > to || daysBetween(from, to) > 400} onClick={() => set({ p: 'kustom', dari: from, sampai: to })}>Terapkan</button>
        {daysBetween(from || td, to || td) > 400 && <small className={styles.warnTxt}>Maksimal sekitar 1 tahun (400 hari).</small>}
        {dasar && <small className={styles.note}>Paket Dasar: mulai {tgl(floor)}.</small>}
      </div>}
    </fieldset>
    <fieldset><legend>Bandingkan dengan</legend><div className={styles.chips}>{COMPARE.map(([key, label]) =>
      <button key={key} type="button" aria-pressed={f.cmp === key} onClick={() => set({ cmp: key })}>{label}</button>)}</div>
      {(() => { const c = compareRange(range, f.cmp, f.p); return c && <small className={styles.note}>{fmtRange(c.from, c.to)}</small>; })()}
    </fieldset>
    {d?.multi_lokasi && <fieldset><legend>Cabang / lokasi</legend>
      {level === 'mendalam' ? <select value={f.cabang} onChange={(e) => set({ cabang: e.target.value })}><option value="">Semua lokasi</option>
        {d.lokasi.filter((l) => !l.gudang).map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}</select>
        : <small className={styles.note}>Analisis per cabang tersedia di Paket Pro.</small>}
    </fieldset>}
    {d?.kategori && d.kategori.length > 0 && <fieldset><legend>Kategori produk</legend>
      <select value={f.kat} onChange={(e) => set({ kat: e.target.value })}><option value="">Semua kategori</option>{d.kategori.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
      <small className={styles.note}>Hanya menyaring bagian Produk; laba rugi tetap seluruh bisnis.</small></fieldset>}
    <button type="button" className="primary" onClick={onDone}>Selesai</button>
  </div>;
}

// ---------- Kartu ----------
function TrendCard({ d, T, proj, range, onPoint, onDetail, lanjut }) {
  const [tab, setTab] = useState('omzet');
  const canDay = !!d.harian;
  const [grain, setGrain] = useState(canDay && daysBetween(range.from, range.to) <= 31 && !lanjut ? 'harian' : 'bulanan');
  const rows = grain === 'harian' && canDay ? d.harian : d.tren;
  const points = rows.map((r) => ({ ...r, laba: n(r.pendapatan) - n(r.hpp) - n(r.biaya), grain,
    label: grain === 'harian' ? tgl(r.mulai) : monthName(r.mulai.slice(0, 7)), short: grain === 'harian' ? String(+r.mulai.slice(8)) : BLN[+r.mulai.slice(5, 7) - 1] }));
  const series = tab === 'omzet' ? [{ key: 'pendapatan', label: T.omzet, color: C.main, area: true, fmt: rp }, { key: 'laba', label: 'Laba Bersih', color: C.mid, fmt: rp }]
    : tab === 'trx' ? [{ key: 'transaksi', label: T.trx, color: C.main, area: true, fmt: angka }] : [{ key: 'pelanggan', label: `${T.pelanggan} bertransaksi`, color: C.main, area: true, fmt: angka }];
  const last = d.tren[d.tren.length - 1];
  const showProj = tab === 'omzet' && grain === 'bulanan' && proj && last && proj.month > last.mulai.slice(0, 7);
  return <section className={styles.card} aria-labelledby="tp">
    <div className={styles.cardH}>
      <h2 id="tp" className={styles.cardT}><span className={styles.tIco}><Ico d={I.chart} /></span>Tren Performa Bisnis</h2>
      <div className={styles.legendRow}>{series.map((s) => <span key={s.key}><i style={{ background: s.color }} />{s.label}</span>)}{showProj && <span><i className={styles.dash} />Proyeksi</span>}</div>
      <div className={styles.seg} role="group" aria-label="Data grafik">{[['omzet', `${T.omzet} & Laba`], ['trx', 'Transaksi'], ['plg', T.pelanggan]].map(([key, l]) =>
        <button key={key} type="button" aria-pressed={tab === key} onClick={() => setTab(key)}>{l}</button>)}</div>
      <button type="button" className={styles.link} onClick={onDetail}>Detail Tren <NavIcon name="next" size={14} /></button>
    </div>
    {canDay && <div className={styles.seg + ' ' + styles.segSm} role="group" aria-label="Satuan waktu">{[['bulanan', lanjut ? '12 bulan' : '2 bulan'], ['harian', 'Harian (periode ini)']].map(([key, l]) =>
      <button key={key} type="button" aria-pressed={grain === key} onClick={() => setGrain(key)}>{l}</button>)}</div>}
    <TrendChart points={points} series={series} money={tab === 'omzet'} onPick={(i) => onPoint(points[i])}
      proj={showProj ? { value: proj.value, low: proj.low, high: proj.high, short: BLN[+proj.month.slice(5) - 1] + '*' } : null} />
    {showProj && <p className={styles.note}>* Proyeksi {monthName(proj.month)} ±{rp(proj.value)} (rentang {rp(proj.low)}–{rp(proj.high)}) dari tren linier {proj.n} bulan penuh — bukan angka aktual.</p>}
    {!lanjut && <p className={styles.note}>Paket Dasar menampilkan bulan ini dan bulan lalu. Tren 12 bulan & proyeksi mulai Paket Bisnis.</p>}
  </section>;
}

function ProductCard({ d, T, lanjut, lock, onItem, onAll, onAccount }) {
  if (d.jenis === 'properti' || d.jenis === 'kustom') {
    const rows = (d.per_akun || []).filter((a) => a.jenis === 'pendapatan');
    const total = rows.reduce((t, a) => t + n(a.ini), 0);
    return <section className={styles.card}><div className={styles.cardH}><h2 className={styles.cardT}><span className={styles.tIco}><NavIcon name="coins" size={20} /></span>Pendapatan per Jenis</h2></div>
      {!lanjut ? lock('Rincian pendapatan per jenis mulai Paket Bisnis', 'Sewa, tambahan, denda, dan pendapatan lain per akun.') : rows.length === 0 ? <Empty title="Belum ada pendapatan pada periode ini" /> :
        <Bars rows={rows.map((a) => ({ key: a.id, label: a.akun, value: n(a.ini), share: total ? (n(a.ini) * 100) / total : 0, onClick: () => onAccount(a) }))} total={total} />}
    </section>;
  }
  const p = d.produk;
  return <section className={styles.card} aria-labelledby="pp">
    <div className={styles.cardH}><h2 id="pp" className={styles.cardT}><span className={styles.tIco}><NavIcon name="/promo" size={20} /></span>Penjualan per {T.produk}</h2>
      {lanjut && <button type="button" className={styles.link} onClick={onAll}>Detail {T.produk} <NavIcon name="next" size={14} /></button>}</div>
    {!lanjut ? lock(`Analisis ${T.produk.toLowerCase()} mulai Paket Bisnis`, `${T.produk} terlaris, kontribusi, dan perubahannya dibanding periode lalu.`)
      : !p || !p.items.length ? <Empty title={`Belum ada penjualan ${T.produk.toLowerCase()}${d.category_name ? ' di kategori ini' : ''}`} />
      : <Bars rows={[...p.items.slice(0, 4).map((x) => ({ key: x.nama, label: x.nama, value: n(x.nilai), share: (n(x.nilai) * 100) / n(p.total), onClick: () => onItem(x) })),
          ...(p.items.length > 4 || n(p.total) > p.items.slice(0, 4).reduce((t, x) => t + n(x.nilai), 0) ? [{ key: '_lain', label: 'Lainnya', value: n(p.total) - p.items.slice(0, 4).reduce((t, x) => t + n(x.nilai), 0), muted: true, onClick: onAll }] : [])]
          .map((r) => ({ ...r, share: r.share ?? (n(p.total) ? (r.value * 100) / n(p.total) : 0) }))} total={n(p.total)} totalLabel={`Total ${T.produk === 'Produk' ? 'Penjualan' : T.produk}`} />}
  </section>;
}
function Bars({ rows, total, totalLabel = 'Total' }) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  return <div className={styles.bars}>
    {rows.map((r) => <button key={r.key} type="button" onClick={r.onClick} className={r.muted ? styles.mutedRow : undefined}>
      <span className={styles.bLabel}>{r.label}</span>
      <span className={styles.bTrack}><span style={{ width: `${Math.max(2, (r.value * 100) / max)}%` }} /></span>
      <b>{rp(r.value)}</b><small>{pctTxt(r.share)}</small></button>)}
    <div className={styles.bTotal}><span>{totalLabel}</span><b>{rp(total)}</b><small>100%</small></div>
  </div>;
}

function InventoryCard({ d, extra, lanjut, lock, onDetail }) {
  if (!lanjut) return <section className={styles.card}><div className={styles.cardH}><h2 className={styles.cardT}><span className={styles.tIco}><Ico d={I.box} /></span>Perputaran Persediaan</h2></div>
    {lock('Analisis persediaan mulai Paket Bisnis', 'Perputaran stok 6 bulan, umur stok, dan barang lambat/tidak bergerak.')}</section>;
  const rows = (d.persediaan || []).map((r) => ({ ...r, label: monthName(r.mulai.slice(0, 7)), short: BLN[+r.mulai.slice(5, 7) - 1], v: r.perputaran ?? 0 }));
  const kpi = extra.kpi; const sh = extra.stock?.ringkas || {};
  const slow = n(sh.lambat?.n) + n(sh.mati?.n);
  return <section className={styles.card} aria-labelledby="ps">
    <div className={styles.cardH}><h2 id="ps" className={styles.cardT}><span className={styles.tIco}><Ico d={I.box} /></span>Perputaran Persediaan</h2>
      <button type="button" className={styles.link} onClick={onDetail}>Detail Persediaan <NavIcon name="next" size={14} /></button></div>
    {rows.every((r) => r.perputaran == null) ? <Empty title="Belum ada nilai persediaan" text="Perputaran muncul setelah stok dan modal barang tercatat." />
      : <TrendChart points={rows} series={[{ key: 'v', label: 'Perputaran (×/bulan)', color: C.main, area: true, fmt: (v) => `${v}×` }]} money={false} height={150} onPick={onDetail} />}
    <div className={styles.minis}>
      <button type="button" onClick={onDetail}><small>Perputaran periode</small><b>{kpi?.perputaran == null ? '—' : `${kpi.perputaran}×`}</b></button>
      <button type="button" onClick={onDetail}><small>Umur stok</small><b>{kpi?.hari_persediaan == null ? '—' : `${kpi.hari_persediaan} hari`}</b></button>
      <Link href="/barang"><small>Stok lambat & mati</small><b>{extra.stock ? `${slow} barang` : '—'}</b></Link>
    </div>
  </section>;
}

function OrdersCard({ d, T, onDetail, onPoint }) {
  const rows = d.harian || d.tren;
  const pts = rows.map((r) => ({ ...r, label: d.harian ? tgl(r.mulai) : monthName(r.mulai.slice(0, 7)), short: d.harian ? String(+r.mulai.slice(8)) : BLN[+r.mulai.slice(5, 7) - 1] }));
  const days = Math.max(1, daysBetween(d.from, d.to) + 1);
  return <section className={styles.card}>
    <div className={styles.cardH}><h2 className={styles.cardT}><span className={styles.tIco}><NavIcon name="/pesanan" size={20} /></span>Produktivitas {T.trx}</h2>
      <button type="button" className={styles.link} onClick={onDetail}>Detail <NavIcon name="next" size={14} /></button></div>
    <TrendChart points={pts} series={[{ key: 'transaksi', label: T.trx, color: C.main, area: true, fmt: angka }]} money={false} height={150} onPick={(i) => onPoint(pts[i])} />
    <div className={styles.minis}>
      <button type="button" onClick={onDetail}><small>{T.trx}</small><b>{angka(d.cur.transaksi)}</b></button>
      <button type="button" onClick={onDetail}><small>Rata-rata per hari</small><b>{(n(d.cur.transaksi) / days).toLocaleString('id-ID', { maximumFractionDigits: 1 })}</b></button>
      <button type="button" onClick={onDetail}><small>{T.avg}</small><b>{n(d.cur.transaksi) ? rp(n(d.cur.pendapatan) / n(d.cur.transaksi)) : '—'}</b></button>
    </div>
  </section>;
}

function OccupancyCard({ d, onDetail }) {
  const h = d.hunian || {}; const occ = n(h.kamar) ? Math.round((n(h.terisi) * 100) / n(h.kamar)) : null;
  const coll = n(h.tagihan) ? Math.round((n(h.tagihan_dibayar) * 100) / n(h.tagihan)) : null;
  return <section className={styles.card}>
    <div className={styles.cardH}><h2 className={styles.cardT}><span className={styles.tIco}><NavIcon name="/kamar" size={20} /></span>Hunian &amp; Penagihan</h2>
      <button type="button" className={styles.link} onClick={onDetail}>Detail <NavIcon name="next" size={14} /></button></div>
    <div className={styles.donutRow}>
      <Donut parts={[{ label: 'Terisi', value: n(h.terisi), color: C.main }, { label: 'Kosong', value: n(h.kamar) - n(h.terisi), color: C.pale }]} center={occ == null ? '—' : `${occ}%`} sub="hunian" onPick={onDetail} />
      <ul className={styles.legendList}>
        <li><Link href="/kamar"><i style={{ background: C.main }} /><span>Kamar terisi</span><b>{angka(h.terisi)} / {angka(h.kamar)}</b></Link></li>
        <li><Link href="/tagihan"><i style={{ background: C.mid }} /><span>Tagihan jatuh tempo</span><b>{rp(h.tagihan)}</b></Link></li>
        <li><Link href="/pembayaran"><i style={{ background: C.light }} /><span>Sudah dibayar</span><b>{coll == null ? '—' : `${coll}%`}</b></Link></li>
        <li><Link href="/tagihan"><i style={{ background: C.red }} /><span>Lewat tempo (hari ini)</span><b>{rp(d.piutang_lewat?.nilai)}</b></Link></li>
      </ul>
    </div>
  </section>;
}

function PositionCard({ d, onDetail }) {
  const p = d.posisi;
  return <section className={styles.card}>
    <div className={styles.cardH}><h2 className={styles.cardT}><span className={styles.tIco}><NavIcon name="/kas" size={20} /></span>Posisi Keuangan</h2>
      <button type="button" className={styles.link} onClick={onDetail}>Detail <NavIcon name="next" size={14} /></button></div>
    <ul className={styles.legendList}>
      <li><Link href="/kas"><i style={{ background: C.main }} /><span>Kas & bank</span><b>{rp(p.kas)}</b></Link></li>
      <li><Link href="/pembukuan?tab=saldo"><i style={{ background: C.mid }} /><span>Piutang</span><b>{rp(p.piutang)}</b></Link></li>
      <li><Link href="/pembukuan?tab=saldo"><i style={{ background: C.red }} /><span>Kewajiban</span><b>{rp(p.kewajiban)}</b></Link></li>
      <li className={styles.mini}><span>Per {tgl(p.per)} dari saldo jurnal</span></li>
    </ul>
  </section>;
}

const SEG = { setia: ['Pelanggan setia', C.main, '≥3 transaksi dalam 180 hari dan aktif periode ini'], baru: ['Pelanggan baru', C.mid, 'Transaksi pertamanya di periode ini'],
  kadang: ['Kadang berbelanja', C.amber, 'Aktif periode ini, <3 transaksi dalam 180 hari'], tidak_aktif: ['Tidak aktif', C.grey, 'Bertransaksi dalam 180 hari terakhir, tetapi tidak di periode ini'] };

function CustomerCard({ d, T, k, lanjut, lock, onSeg, onDetail }) {
  if (d.jenis === 'properti') {
    const h = d.hunian || {};
    return <section className={styles.card}><div className={styles.cardH}><h2 className={styles.cardT}><span className={styles.tIco}><Ico d={I.users} /></span>Perilaku Penghuni</h2>
      <button type="button" className={styles.link} onClick={onDetail}>Detail <NavIcon name="next" size={14} /></button></div>
      <div className={styles.minis}>
        <Link href="/penghuni"><small>Penghuni aktif</small><b>{angka(h.terisi)}</b></Link>
        <Link href="/penghuni"><small>Masuk periode ini</small><b>{angka(h.masuk)}</b></Link>
        <Link href="/penghuni"><small>Keluar periode ini</small><b>{angka(h.keluar)}</b></Link>
      </div>
      <p className={styles.note}>{T.avg}: {k.avg == null ? '—' : rp(k.avg)} · {angka(d.cur.transaksi)} pembayaran terverifikasi.</p>
    </section>;
  }
  if (d.jenis === 'kustom') return <section className={styles.card}><div className={styles.cardH}><h2 className={styles.cardT}><span className={styles.tIco}><Ico d={I.users} /></span>Produktivitas</h2></div>
    <div className={styles.minis}><div><small>{T.trx}</small><b>{angka(d.cur.transaksi)}</b></div><div><small>{T.avg}</small><b>{k.avg == null ? '—' : rp(k.avg)}</b></div>
      <div><small>Laba per transaksi</small><b>{n(d.cur.transaksi) ? rp(n(d.cur.laba) / n(d.cur.transaksi)) : '—'}</b></div></div></section>;
  const c = d.pelanggan;
  return <section className={styles.card} aria-labelledby="pl">
    <div className={styles.cardH}><h2 id="pl" className={styles.cardT}><span className={styles.tIco}><Ico d={I.users} /></span>Perilaku {T.pelanggan}</h2>
      {lanjut && <button type="button" className={styles.link} onClick={onDetail}>Detail {T.pelanggan} <NavIcon name="next" size={14} /></button>}</div>
    {!lanjut ? lock(`Analisis ${T.pelanggan.toLowerCase()} mulai Paket Bisnis`, 'Pelanggan setia, baru, kadang, tidak aktif, dan frekuensi beli.') : !c ? null : <>
      <div className={styles.donutRow}>
        <Donut parts={['setia', 'baru', 'kadang', 'tidak_aktif'].map((s) => ({ label: SEG[s][0], value: n(c[s]), color: SEG[s][1] }))}
          center={angka(n(c.aktif) + n(c.tidak_aktif))} sub={T.pelanggan} onPick={(i) => onSeg(['setia', 'baru', 'kadang', 'tidak_aktif'][i])} />
        <ul className={styles.legendList}>{['setia', 'baru', 'kadang', 'tidak_aktif'].map((s) => { const tot = n(c.aktif) + n(c.tidak_aktif);
          return <li key={s}><button type="button" onClick={() => onSeg(s)}><i style={{ background: SEG[s][1] }} /><span>{SEG[s][0]}</span><b>{tot ? pctTxt((n(c[s]) * 100) / tot) : '—'}</b></button></li>; })}</ul>
      </div>
      <div className={styles.minis}>
        <button type="button" onClick={() => onSeg('baru')}><small>{T.pelanggan} baru</small><b>{angka(c.baru)}{c.baru_lalu != null && <em className={n(c.baru) >= n(c.baru_lalu) ? styles.good : styles.bad}> {c.baru_lalu ? signPct(((n(c.baru) - n(c.baru_lalu)) * 100) / n(c.baru_lalu)) : ''}</em>}</b></button>
        <button type="button" onClick={onDetail}><small>Frekuensi beli</small><b>{n(c.aktif) ? `${(n(c.trx_kontak) / n(c.aktif)).toLocaleString('id-ID', { maximumFractionDigits: 1 })}×` : '—'}</b></button>
        <button type="button" onClick={onDetail}><small>{T.avg}</small><b>{k.avg == null ? '—' : rp(k.avg)}</b></button>
      </div>
      {n(d.cur.transaksi) > 0 && n(c.trx_kontak) < n(d.cur.transaksi) && <p className={styles.note}>{angka(n(d.cur.transaksi) - n(c.trx_kontak))} dari {angka(d.cur.transaksi)} transaksi tanpa nama pelanggan, tidak ikut segmentasi.</p>}
    </>}
  </section>;
}

function BranchCard({ d, onPick }) {
  const rows = d.per_lokasi.filter((l) => !l.gudang);
  const tot = rows.reduce((t, l) => t + n(l.cur.pendapatan), 0);
  return <section className={styles.card}><div className={styles.cardH}><h2 className={styles.cardT}><span className={styles.tIco}><NavIcon name="/mutasi" size={20} /></span>Perbandingan Cabang</h2></div>
    <div className={styles.branches}>{rows.map((l) => { const g = l.cmp && n(l.cmp.pendapatan) ? ((n(l.cur.pendapatan) - n(l.cmp.pendapatan)) * 100) / n(l.cmp.pendapatan) : null;
      return <button key={l.id} type="button" onClick={() => onPick(l.id)}><b>{l.lokasi}</b><span>{rp(l.cur.pendapatan)} <small>{tot ? pctTxt((n(l.cur.pendapatan) * 100) / tot, 0) : ''}</small></span>
        <small className={n(l.cur.laba) < 0 ? styles.bad : undefined}>Laba {rp(l.cur.laba)}{g != null ? ` · ${signPct(g)}` : ''} · {angka(l.cur.transaksi)} transaksi</small></button>; })}</div>
    <p className={styles.note}>Ketuk cabang untuk menyaring seluruh halaman. Biaya tanpa lokasi (biaya bersama) tidak masuk ke cabang mana pun.</p></section>;
}

// ---------- Lembar rincian ----------
function DetailView({ detail, d, k, T, health, ins, proj, extra, kosId, kas, range, retail, branchNote, reportHref, pembukuan, metric, open, onClose, lanjut, lock, vs }) {
  const common = { onClose };
  if (detail.type === 'metric') return <DetailSheet {...common} title={detail.title} value={detail.value} formula={detail.formula} rows={detail.rows}
    links={[[reportHref, 'Buka laporan'], [pembukuan('laporan'), 'Laba rugi di Pembukuan']]}>
    <h3 className={styles.sh}>Transaksi sumber ({fmtRange(range.from, range.to)})</h3>
    <JournalLines kosId={kosId} from={range.from} to={range.to} kinds={detail.kinds} retail={retail} branchNote={branchNote} />
  </DetailSheet>;

  if (detail.type === 'health') return <DetailSheet {...common} title="Skor Kesehatan Bisnis" value={health.score == null ? 'Belum dinilai' : `${health.score} dari 100`}
    sub={health.score == null ? health.reason : `${health.status[0]}. Dinilai dari ${health.used} dari 5 komponen; komponen tanpa data cukup tidak dihitung (bukan dianggap nol).`}
    formula="Rata-rata berbobot komponen yang bisa dinilai. Skor hanya dihitung bila periode ini punya pendapatan, minimal 5 transaksi, dan minimal 3 komponen bisa dinilai. Batas kategori: ≥80 sehat, 65–79 cukup sehat, 45–64 perlu perhatian, <45 kritis.">
    <ul className={styles.comp}>{health.components.map((c) => <li key={c.key}>
      <div><b>{c.label}</b><small>Bobot {c.weight}%</small><span>{c.score == null ? 'Tidak dinilai' : `${c.score}/100`}</span></div>
      <span className={styles.bTrack}><span style={{ width: `${c.score ?? 0}%`, background: c.score == null ? 'transparent' : c.score >= 65 ? C.main : c.score >= 45 ? C.amber : C.red }} /></span>
      <small>{c.reason || c.basis}{c.key === 'likuid' && c.value != null ? ` Saat ini ±${c.value.toLocaleString('id-ID', { maximumFractionDigits: 1 })} bulan.` : ''}</small>
    </li>)}</ul>
    {health.risks.length > 0 && <><h3 className={styles.sh}>Faktor risiko</h3><ul className={styles.plain}>{health.risks.map((r) => <li key={r.key}>{r.text} <small>(−{r.w})</small></li>)}</ul></>}
  </DetailSheet>;

  if (detail.type === 'risk') return <DetailSheet {...common} title="Risiko bisnis" value={health.riskLevel || '—'}
    formula={HEALTH_RULES.find((r) => r[0] === 'risiko')[3] + ' Skor ≥75 = Rendah, 50–74 = Sedang, <50 = Tinggi.'}
    links={[[d.jenis === 'properti' ? '/tagihan' : '/pembukuan?tab=umur', 'Piutang & tagihan'], ['/kas', 'Kas & bank']]}>
    {health.risks.length ? <ul className={styles.plain}>{health.risks.map((r) => <li key={r.key}>{r.text}</li>)}</ul> : <p>Tidak ada faktor risiko dari aturan di atas pada periode ini.</p>}
    <dl className={styles.kvs}>
      <div><dt>Saldo kas & bank</dt><dd>{rp(d.posisi.kas)}</dd></div>
      <div><dt>Piutang lewat tempo<small>per hari ini</small></dt><dd>{d.piutang_lewat ? rp(d.piutang_lewat.nilai) : 'Tidak dihitung untuk jenis bisnis ini'}</dd></div>
      <div><dt>Kewajiban</dt><dd>{rp(d.posisi.kewajiban)}</dd></div>
    </dl>
  </DetailSheet>;

  if (detail.type === 'insight') { const x = detail.x;
    return <DetailSheet {...common} title={x.title} sub={`Jenis: ${x.kind}`}
      links={[x.href && [x.href, 'Buka modul terkait'], [pembukuan('jurnal'), 'Jurnal periode ini']]}>
      <p className={styles.formula}><b>Data:</b> {x.cause}</p><p className={styles.action}><b>Tindakan yang disarankan:</b> {x.action}</p>
      {x.metric && ['pendapatan', 'laba', 'biaya', 'margin'].includes(x.metric) && <button type="button" onClick={() => open(metric(x.metric))}>Lihat transaksi sumber</button>}
      {x.seg && <button type="button" onClick={() => open({ type: 'segment', seg: x.seg })}>Lihat daftar pelanggan</button>}
      {x.account && <><h3 className={styles.sh}>Baris jurnal akun “{x.account}”</h3><JournalLines kosId={kosId} from={range.from} to={range.to} kinds={['biaya']} account={x.account} retail={retail} branchNote={branchNote} /></>}
      <p className={styles.note}>Insight dihitung dengan aturan tetap dari angka di halaman ini, bukan tebakan.</p>
    </DetailSheet>; }

  if (detail.type === 'insights' || (detail.type === 'topic' && detail.key === 'peluang')) {
    const list = detail.type === 'insights' ? ins : ins.filter((x) => ['peluang', 'proyeksi'].includes(x.kind)).concat(ins.filter((x) => !['peluang', 'proyeksi'].includes(x.kind)));
    return <DetailSheet {...common} title={detail.type === 'insights' ? 'Semua insight' : 'Rekomendasi pengembangan'}
      sub={detail.type === 'insights' ? 'Diurutkan dari yang paling mendesak.' : 'Peluang pertumbuhan di atas, lalu masalah yang perlu diselesaikan lebih dulu.'}>
      {list.length === 0 ? <p>Belum ada temuan pada periode ini.</p> : <ol className={styles.insFull}>{list.map((x) => <li key={x.id}><button type="button" onClick={() => open({ type: 'insight', x })}>
        <span className={styles.kind + ' ' + styles[x.tone]}>{x.kind}</span><b>{x.title}</b><small>{x.action}</small></button></li>)}</ol>}
    </DetailSheet>;
  }

  if (detail.type === 'point') { const p = detail.p; const from = p.mulai; const to = p.grain === 'harian' ? p.mulai : monthEndOf(p.mulai);
    return <DetailSheet {...common} title={p.label} rows={[[T.omzet, rp(p.pendapatan)], ['HPP', rp(p.hpp)], ['Biaya operasional', rp(p.biaya)], ['Laba bersih', rp(p.laba)], [T.trx, angka(p.transaksi)], [`${T.pelanggan} bertransaksi`, angka(p.pelanggan)]]}
      links={[[`/pembukuan?tab=jurnal&bulan=${from.slice(0, 7)}`, 'Jurnal bulan ini'], [reportHref, 'Buka laporan']]}>
      <h3 className={styles.sh}>Transaksi sumber</h3><JournalLines kosId={kosId} from={from} to={to} kinds={['pendapatan', 'hpp', 'biaya']} retail={retail} branchNote={branchNote} />
    </DetailSheet>; }

  if (detail.type === 'tren') { const rows = d.tren;
    return <DetailSheet {...common} title="Detail tren" sub="Angka per bulan dari jurnal. Ketuk baris untuk melihat transaksinya." links={[[pembukuan('laporan'), 'Laba rugi di Pembukuan']]}>
      <ul className={styles.rows}>{[...rows].reverse().map((r) => { const laba = n(r.pendapatan) - n(r.hpp) - n(r.biaya);
        return <li key={r.mulai}><button type="button" className={styles.rowBtn} onClick={() => open({ type: 'point', p: { ...r, laba, grain: 'bulanan', label: monthName(r.mulai.slice(0, 7)) } })}>
          <div><b>{monthName(r.mulai.slice(0, 7))}</b><small>{angka(r.transaksi)} {T.trx.toLowerCase()} · laba {rp(laba)}</small></div><span>{rp(r.pendapatan)}</span></button></li>; })}</ul>
      {proj && <p className={styles.formula}><b>Proyeksi {monthName(proj.month)}:</b> ±{rp(proj.value)} ({rp(proj.low)}–{rp(proj.high)}). Regresi linier pendapatan {proj.n} bulan penuh terakhir; rentang = ± simpangan baku sisa. Bukan angka aktual.</p>}
    </DetailSheet>; }

  if (detail.type === 'cash') { const b = detail.b;
    return <DetailSheet {...common} title={`Arus kas ${detail.label}`} rows={[['Masuk', rp(b.masuk)], ['Keluar', rp(b.keluar)], ['Bersih', rp(n(b.masuk) - n(b.keluar))]]}
      formula="Baris akun Kas dan Bank di jurnal; pindah kas ↔ bank tidak dihitung." links={[[`/pembukuan?tab=arus-kas&bulan=${b.mulai.slice(0, 7)}`, 'Arus kas di Pembukuan'], ['/kas', 'Buka Kas']]}>
      <h3 className={styles.sh}>Baris kas & bank</h3><JournalLines kosId={kosId} from={b.mulai} to={b.selesai} kinds={['kas']} retail={retail} />
    </DetailSheet>; }

  if (detail.type === 'product') { const x = detail.x; const g = n(x.nilai_lalu) ? ((n(x.nilai) - n(x.nilai_lalu)) * 100) / n(x.nilai_lalu) : null;
    return <DetailSheet {...common} title={x.nama} value={rp(x.nilai)} rows={[['Jumlah terjual', angka(x.jumlah)], x.laba != null && ['Laba kotor', rp(x.laba)], x.laba != null && ['Margin kotor', pctTxt(n(x.nilai) ? (n(x.laba) * 100) / n(x.nilai) : null)],
      vs && ['Pembanding', rp(x.nilai_lalu)], g != null && ['Perubahan', signPct(g)], ['Kontribusi', pctTxt(n(d.produk.total) ? (n(x.nilai) * 100) / n(d.produk.total) : null)]]}
      formula={d.jenis === 'retail' ? 'Nilai nota selesai setelah diskon, tanpa PPN, dikurangi retur (rumus Laporan toko).' : 'Nilai baris pesanan selesai.'}
      links={[[reportHref, 'Laporan per produk'], d.jenis === 'retail' ? ['/penjualan', 'Riwayat penjualan'] : ['/pesanan', 'Riwayat pesanan'], d.jenis === 'retail' ? ['/barang', 'Barang & stok'] : ['/layanan', 'Daftar layanan']]} />; }

  if (detail.type === 'segment') { const c = d.pelanggan; const list = (c?.daftar || []).filter((x) => x.seg === detail.seg);
    return <DetailSheet {...common} title={SEG[detail.seg][0]} value={`${angka(c?.[detail.seg])} ${T.pelanggan.toLowerCase()}`} formula={SEG[detail.seg][2] + '.'} links={[['/kontak', 'Buka Pelanggan & supplier']]}>
      {list.length === 0 ? <p className="muted">Tidak ada.</p> : <ul className={styles.rows}>{list.map((x) => <li key={x.id}><div><b>{x.name}</b><small>{angka(x.n)} transaksi periode ini · terakhir {tgl(x.terakhir)}</small></div><span>{rp(x.nilai)}</span></li>)}</ul>}
      {c && c.daftar.length >= 150 && <p className={styles.note}>Menampilkan 150 pelanggan dengan nilai terbesar.</p>}
    </DetailSheet>; }

  if (detail.type === 'account') { const a = detail.a;
    return <DetailSheet {...common} title={a.akun} value={rp(a.ini)} rows={[vs && ['Pembanding', rp(a.lalu)]]}>
      <JournalLines kosId={kosId} from={range.from} to={range.to} kinds={[a.jenis]} account={a.akun} retail={retail} branchNote={branchNote} />
    </DetailSheet>; }

  // Topik "Analisis & Tindak Lanjut"
  const key = detail.key; const c = d.cur;
  if (key === 'profit') {
    const akun = (d.per_akun || []).filter((a) => a.jenis !== 'pendapatan').sort((a, b) => n(b.ini) - n(a.ini));
    return <DetailSheet {...common} title="Analisis profitabilitas" rows={[[T.omzet, rp(c.pendapatan)], ['Laba kotor', rp(n(c.pendapatan) - n(c.hpp))], ['Margin laba kotor', pctTxt(k.gross)], ['Laba bersih', rp(c.laba)], ['Margin laba bersih', pctTxt(k.margin)],
      vs && ['Margin bersih pembanding', pctTxt(k.margin_lalu)]]} links={[[pembukuan('laporan'), 'Laba rugi di Pembukuan'], [reportHref, 'Buka laporan']]}>
      <h3 className={styles.sh}>Jembatan laba (waterfall)</h3>
      <Waterfall steps={[{ label: T.omzet, value: n(c.pendapatan), total: true }, { label: 'HPP', value: -n(c.hpp) }, { label: 'Laba kotor', value: n(c.pendapatan) - n(c.hpp), total: true },
        { label: 'Biaya operasional', value: -n(c.biaya) }, { label: 'Laba bersih', value: n(c.laba), total: true }]} onPick={(i) => open(metric(['pendapatan', 'hpp', 'laba', 'biaya', 'laba'][i]))} />
      {lanjut ? <><h3 className={styles.sh}>HPP & biaya per akun</h3><ul className={styles.rows}>{akun.map((a) => <li key={a.id}><button type="button" className={styles.rowBtn} onClick={() => open({ type: 'account', a })}>
        <div><b>{a.akun}</b><small>{a.jenis === 'hpp' ? 'HPP' : 'Biaya'}{vs ? ` · pembanding ${rp(a.lalu)}` : ''}</small></div><span>{rp(a.ini)}</span></button></li>)}</ul></>
        : lock('Rincian per akun mulai Paket Bisnis', 'HPP dan biaya per akun dibanding periode lalu.')}
      {d.produk?.items?.some((x) => x.laba != null) && <><h3 className={styles.sh}>Kontribusi laba kotor per {T.produk.toLowerCase()}</h3>
        <ul className={styles.rows}>{[...d.produk.items].sort((a, b) => n(b.laba) - n(a.laba)).map((x) => <li key={x.nama}><button type="button" className={styles.rowBtn} onClick={() => open({ type: 'product', x })}>
          <div><b>{x.nama}</b><small>Margin {pctTxt(n(x.nilai) ? (n(x.laba) * 100) / n(x.nilai) : null)}</small></div><span>{rp(x.laba)}</span></button></li>)}</ul></>}
    </DetailSheet>;
  }
  if (key === 'kas') {
    const p = d.posisi; const monthly = n(p.kas_keluar_90) / Math.max(1, Math.min(3, n(p.hari_data) / 30));
    return <DetailSheet {...common} title="Analisis arus kas" rows={[['Saldo awal', rp(kas.saldo_awal)], ['Kas masuk', rp(kas.masuk)], ['Kas keluar', rp(kas.keluar)], ['Saldo akhir', rp(kas.saldo_akhir)],
      ['Rata-rata kas keluar / bulan', rp(monthly), '90 hari terakhir'], ['Cadangan kas', monthly > 0 ? `±${(n(p.kas) / monthly).toLocaleString('id-ID', { maximumFractionDigits: 1 })} bulan` : '—'],
      ['Piutang', rp(p.piutang)], ['Persediaan', rp(p.persediaan)], ['Kewajiban', rp(p.kewajiban)]]}
      formula="Kas = akun Kas + Bank di jurnal (metode langsung, sama dengan Arus kas Pembukuan). Laba berbeda dari kas karena belanja stok, piutang/utang, aset, dan pengambilan pemilik."
      sub={kas.cocok ? 'Saldo awal + masuk − keluar = saldo akhir (cocok).' : 'Perhatian: saldo tidak cocok, periksa jurnal kas.'}
      links={[[`/pembukuan?tab=arus-kas&bulan=${range.to.slice(0, 7)}`, 'Arus kas per aktivitas'], ['/kas', 'Buka Kas'], d.jenis === 'retail' && ['/pembukuan?tab=umur', 'Umur piutang & utang']]}>
      <NetBars items={kas.buckets.map((b, i) => ({ label: kas.grain === 'week' ? `M${i + 1}` : BLN[+b.mulai.slice(5, 7) - 1], value: n(b.masuk) - n(b.keluar) }))}
        onPick={(i) => open({ type: 'cash', b: kas.buckets[i], label: fmtRange(kas.buckets[i].mulai, kas.buckets[i].selesai) })} />
      <ul className={styles.rows}>{kas.buckets.map((b, i) => <li key={b.mulai}><button type="button" className={styles.rowBtn} onClick={() => open({ type: 'cash', b, label: fmtRange(b.mulai, b.selesai) })}>
        <div><b>{kas.grain === 'week' ? `Minggu ${i + 1}` : monthName(b.mulai.slice(0, 7))}</b><small>{fmtRange(b.mulai, b.selesai)} · masuk {rp(b.masuk)} · keluar {rp(b.keluar)}</small></div><span>{rp(n(b.masuk) - n(b.keluar))}</span></button></li>)}</ul>
    </DetailSheet>;
  }
  if (key === 'produk') {
    if (d.jenis === 'properti') { const h = d.hunian || {};
      return <DetailSheet {...common} title="Analisis kamar & hunian" rows={[['Kamar', angka(h.kamar)], ['Terisi', angka(h.terisi)], ['Hunian', pctTxt(n(h.kamar) ? (n(h.terisi) * 100) / n(h.kamar) : null)],
        ['Tagihan jatuh tempo periode ini', rp(h.tagihan)], ['Sudah dibayar', rp(h.tagihan_dibayar)], ['Piutang lewat tempo (hari ini)', rp(d.piutang_lewat?.nilai)],
        ['Pendapatan per kamar terisi', n(h.terisi) ? rp(n(c.pendapatan) / n(h.terisi)) : '—']]} formula="Hunian = kamar dengan sewa aktif ÷ semua kamar. Penagihan = pembayaran terverifikasi atas tagihan yang jatuh tempo di periode ini."
        links={[['/kamar', 'Kamar'], ['/tagihan', 'Tagihan'], ['/pembayaran', 'Pembayaran']]} />; }
    const p = d.produk; const sh = extra.stock?.ringkas; const kpi = extra.kpi;
    return <DetailSheet {...common} title={d.jenis === 'retail' ? 'Analisis produk & persediaan' : `Analisis ${T.produk.toLowerCase()}`} links={[[reportHref, 'Laporan lengkap'], d.jenis === 'retail' && ['/barang', 'Barang & kesehatan stok'], d.jenis === 'retail' && ['/belanja', 'Saran belanja']]}>
      {!lanjut ? lock(`Analisis ${T.produk.toLowerCase()} mulai Paket Bisnis`, 'Produk terlaris, persediaan, dan perputaran stok.') : <>
        <h3 className={styles.sh}>{T.produk} terlaris ({p?.jenis ?? 0} jenis terjual)</h3>
        {!p?.items?.length ? <p className="muted">Belum ada.</p> : <ul className={styles.rows}>{p.items.map((x, i) => <li key={x.nama}><button type="button" className={styles.rowBtn} onClick={() => open({ type: 'product', x })}>
          <div><b>{i + 1}. {x.nama}</b><small>{angka(x.jumlah)} terjual{x.laba != null ? ` · laba ${rp(x.laba)}` : ''}{vs ? ` · pembanding ${rp(x.nilai_lalu)}` : ''}</small></div><span>{rp(x.nilai)}</span></button></li>)}</ul>}
        {d.jenis === 'retail' && <><h3 className={styles.sh}>Persediaan</h3><dl className={styles.kvs}>
          <div><dt>Perputaran periode<small>HPP ÷ rata-rata nilai stok</small></dt><dd>{kpi?.perputaran == null ? '—' : `${kpi.perputaran}×`}</dd></div>
          <div><dt>Umur stok rata-rata</dt><dd>{kpi?.hari_persediaan == null ? '—' : `${kpi.hari_persediaan} hari`}</dd></div>
          <div><dt>Stok habis</dt><dd>{kpi ? `${kpi.stok_habis} dari ${kpi.barang_aktif} barang` : '—'}</dd></div>
          <div><dt>Susut (rusak/kedaluwarsa)</dt><dd>{kpi ? rp(kpi.susut) : '—'}</dd></div>
          {sh && Object.entries(sh).map(([kls, v]) => <div key={kls}><dt>Kelas {kls}<small>per hari ini</small></dt><dd>{angka(v.n)} barang · {rp(v.nilai)}</dd></div>)}
        </dl></>}
      </>}
    </DetailSheet>;
  }
  if (key === 'pelanggan') {
    if (d.jenis === 'properti') { const h = d.hunian || {};
      return <DetailSheet {...common} title="Analisis perilaku penghuni" rows={[['Penghuni aktif', angka(h.terisi)], ['Masuk periode ini', angka(h.masuk)], ['Keluar periode ini', angka(h.keluar)], [T.avg, k.avg == null ? '—' : rp(k.avg)]]}
        formula="Masuk = sewa baru (bukan pindah kamar) yang dimulai di periode ini; keluar = sewa yang berakhir di periode ini." links={[['/penghuni', 'Penghuni'], ['/crm', 'Calon penghuni']]} />; }
    const cu = d.pelanggan;
    return <DetailSheet {...common} title={`Analisis perilaku ${T.pelanggan.toLowerCase()}`} links={[['/kontak', 'Pelanggan & supplier'], ['/crm', 'Prospek & tindak lanjut']]}
      formula="Segmen dihitung dari transaksi berkontak di Kasir/Pesanan: setia = ≥3 transaksi dalam 180 hari & aktif periode ini; baru = transaksi pertama di periode ini; kadang = aktif lainnya; tidak aktif = transaksi dalam 180 hari terakhir tetapi tidak di periode ini.">
      {!lanjut || !cu ? lock(`Analisis ${T.pelanggan.toLowerCase()} mulai Paket Bisnis`, 'Segmentasi dan daftar pelanggan.') : <>
        <dl className={styles.kvs}>{['setia', 'baru', 'kadang', 'tidak_aktif'].map((s) => <div key={s}><dt><button type="button" className={styles.linkBtn} onClick={() => open({ type: 'segment', seg: s })}>{SEG[s][0]}</button></dt><dd>{angka(cu[s])}</dd></div>)}
          <div><dt>Frekuensi beli<small>transaksi berkontak ÷ pelanggan aktif</small></dt><dd>{n(cu.aktif) ? `${(n(cu.trx_kontak) / n(cu.aktif)).toLocaleString('id-ID', { maximumFractionDigits: 1 })}×` : '—'}</dd></div>
          <div><dt>{T.avg}</dt><dd>{k.avg == null ? '—' : rp(k.avg)}</dd></div></dl>
        <h3 className={styles.sh}>Pelanggan dengan nilai terbesar</h3>
        <ul className={styles.rows}>{cu.daftar.filter((x) => n(x.n) > 0).slice(0, 15).map((x) => <li key={x.id}><div><b>{x.name}</b><small>{SEG[x.seg][0]} · {angka(x.n)} transaksi</small></div><span>{rp(x.nilai)}</span></li>)}</ul>
      </>}
    </DetailSheet>;
  }
  if (key === 'efisiensi') {
    const biaya = (d.per_akun || []).filter((a) => a.jenis === 'biaya').sort((a, b) => n(b.ini) - n(a.ini));
    const days = Math.max(1, daysBetween(d.from, d.to) + 1);
    return <DetailSheet {...common} title="Efisiensi operasional" rows={[['Efisiensi operasional', pctTxt(k.eff)], ['Rasio biaya operasional', pctTxt(n(c.pendapatan) ? (n(c.biaya) * 100) / n(c.pendapatan) : null)],
      ['Biaya per transaksi', n(c.transaksi) ? rp(n(c.biaya) / n(c.transaksi)) : '—'], [`${T.trx} per hari`, (n(c.transaksi) / days).toLocaleString('id-ID', { maximumFractionDigits: 1 })],
      [`${T.omzet} per hari`, rp(n(c.pendapatan) / days)], d.jenis === 'retail' && extra.kpi && ['Jenis barang per transaksi', String(extra.kpi.jenis_per_trx ?? '—')],
      d.jenis === 'retail' && extra.kpi && ['Penjualan dibatalkan', `${extra.kpi.batal_n} (${rp(extra.kpi.batal)})`]]}
      formula="Efisiensi = 100% − biaya operasional ÷ pendapatan." links={[['/pengeluaran', 'Pengeluaran'], ['/anggaran', 'Anggaran'], ['/sdm', 'SDM & gaji']]}>
      {lanjut ? <><h3 className={styles.sh}>Biaya operasional per akun</h3><ul className={styles.rows}>{biaya.map((a) => <li key={a.id}><button type="button" className={styles.rowBtn} onClick={() => open({ type: 'account', a })}>
        <div><b>{a.akun}</b><small>{pctTxt(n(c.pendapatan) ? (n(a.ini) * 100) / n(c.pendapatan) : null)} dari pendapatan{vs ? ` · pembanding ${rp(a.lalu)}` : ''}</small></div><span>{rp(a.ini)}</span></button></li>)}</ul></>
        : lock('Biaya per akun mulai Paket Bisnis', 'Lihat akun biaya yang paling besar dan yang naik.')}
      {d.heatmap ? <><h3 className={styles.sh}>Jam ramai ({fmtRange(d.heatmap.from, d.heatmap.to)})</h3><Heatmap cells={d.heatmap.sel} days={HARI} />
        <p className={styles.note}>Warna lebih gelap = lebih banyak transaksi. Pakai untuk menyusun jadwal karyawan.</p></>
        : ['retail', 'jasa'].includes(d.jenis) && lock('Peta jam ramai tersedia di Paket Pro', 'Jumlah transaksi per hari dan jam untuk menyusun jadwal karyawan.', 'pro')}
    </DetailSheet>;
  }
  if (key === 'risiko') {
    return <DetailSheet {...common} title="Prediksi & risiko bisnis" value={`Risiko ${health.riskLevel || '—'}`} links={[[d.jenis === 'properti' ? '/tagihan' : '/pembukuan?tab=umur', 'Piutang & tagihan'], ['/kas', 'Kas']]}>
      <h3 className={styles.sh}>Proyeksi</h3>
      {proj ? <><p className={styles.formula}><b>{monthName(proj.month)}: ±{rp(proj.value)}</b> (rentang {rp(proj.low)}–{rp(proj.high)}). Regresi linier pendapatan {proj.n} bulan penuh terakhir. Tren {proj.slope >= 0 ? 'naik' : 'turun'} ±{rp(Math.abs(proj.slope))} per bulan. PROYEKSI — bukan angka aktual.</p>
        <ul className={styles.rows}>{proj.basis.map(([m, v]) => <li key={m}><div><b>{monthName(m)}</b><small>aktual</small></div><span>{rp(v)}</span></li>)}</ul></>
        : <p className="muted">{lanjut ? 'Proyeksi butuh minimal 3 bulan penuh berisi pendapatan.' : 'Proyeksi tersedia mulai Paket Bisnis.'}</p>}
      <h3 className={styles.sh}>Faktor risiko</h3>
      {health.risks.length ? <ul className={styles.plain}>{health.risks.map((r) => <li key={r.key}>{r.text}</li>)}</ul> : <p>Tidak ada faktor risiko dari aturan tertulis pada periode ini.</p>}
      <p className={styles.note}>{HEALTH_RULES.find((r) => r[0] === 'risiko')[3]}</p>
    </DetailSheet>;
  }
  if (key === 'alokasi') {
    return <DetailSheet {...common} title="Alokasi laba & investasi" rows={[['Laba bersih periode ini', rp(c.laba)], ['Saldo kas & bank', rp(d.posisi.kas)], ['Kewajiban', rp(d.posisi.kewajiban)],
      ['Kas setelah kewajiban', rp(n(d.posisi.kas) - n(d.posisi.kewajiban))]]}
      formula="Laba bersih adalah dasar pembagian; uang yang benar-benar tersedia dilihat dari saldo kas setelah kewajiban. Pembagian (cadangan, reinvestasi, pengambilan pemilik) diputuskan pemilik — PRASARA tidak mengisi persentase otomatis."
      links={[['/pembukuan?tab=investment', 'Simulasi investasi'], ['/kas', 'Catat pengambilan pemilik (prive)'], ['/aset', 'Aset tetap'], ['/anggaran', 'Anggaran']]}>
      {n(c.laba) <= 0 ? <p className="notice">Periode ini belum ada laba untuk dialokasikan.</p>
        : <p className={styles.note}>Gunakan Simulasi investasi di Pembukuan untuk menghitung dampak rencana investasi terhadap kas dan laba. Pengambilan pemilik (prive) dicatat di Kas dan tidak mengurangi laba.</p>}
    </DetailSheet>;
  }
  return null;
}
