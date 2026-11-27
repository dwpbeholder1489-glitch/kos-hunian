'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useKos } from '@/components/KosProvider';
import PageHelp from '@/components/PageHelp';
import NavIcon from '@/components/NavIcon';
import Locked from '@/components/Locked';
import { Loading, Empty, Field, Sheet, toast } from '@/components/ui';
import { rp, angka, tgl, bulan, errMsg, today } from '@/lib/format';
import { hasFeature } from '@/lib/plan';
import { PAY } from '@/lib/retail';
import { canArea, moduleOn } from '@/lib/business';
import { IndikatorGrosir } from '@/components/AkuntansiDagang';
import { BrandReport } from '@/components/KatalogLanjut';
import { useKuotaEkspor } from '@/lib/ekspor';
import { makeXlsx } from '@/lib/xlsx';
import { download } from '@/lib/zip';
import { ReportSource } from './ReportSources';
import ReportTrend from './ReportTrend';
import { N, labelRange, pnl, previousRange, reportRange } from './report';
import styles from './laporan.module.css';

const PERIODS = [['day', 'Harian'], ['week', 'Mingguan'], ['month', 'Bulanan'], ['year', 'Tahunan'], ['custom', 'Rentang khusus']];
const percent = (value) => value == null ? '—' : `${angka(value)}%`;
const delta = (value, baseline) => baseline === 0 ? '—' : `${value > baseline ? '+' : ''}${angka(Math.round((value - baseline) * 1000 / Math.abs(baseline)) / 10)}%`;

export default function LaporanToko() {
  const { kos, kosId, ver } = useKos();
  if (!kos || !kosId) return <Loading />;
  if (kos.business_type !== 'retail') return <Empty title="Laporan ini untuk bisnis Retail & Grosir"><Link href="/laporan">Buka laporan bisnis</Link></Empty>;
  return <Dashboard key={kosId} {...{ kos, kosId, ver }} />;
}

function Dashboard({ kos, kosId, ver }) {
  const [period, setPeriod] = useState({ mode: 'month', date: today(), custom: null });
  const [d, setD] = useState(null);
  const [source, setSource] = useState(null);
  const [editPeriod, setEditPeriod] = useState(false);
  const [sort, setSort] = useState('omzet');
  const [pajak, setPajak] = useState(null);
  const [kpi, setKpi] = useState(null);
  const [loss, setLoss] = useState(null);
  const [names, setNames] = useState({});
  const [stock, setStock] = useState(null);
  const [exporting, setExporting] = useState(false);
  const canExport = hasFeature(kos, 'ekspor');
  const finance = canArea(kos, 'finance');
  const owner = canArea(kos, 'team');
  const ek = useKuotaEkspor(canExport ? kosId : null);
  const range = reportRange(period.mode, period.date, period.custom);
  const prevRange = previousRange(period.mode, range);
  const ym = range.from.slice(0, 7);
  const label = labelRange(range);
  const key = range.from + ':' + range.to;
  const requestKey = period.mode + ':' + key + ':' + ver;
  const query = (name, dates) => supabase.rpc(name, { p_kos: kosId, p_from: dates.from, p_to: dates.to });

  useEffect(() => {
    let active = true;
    supabase.rpc('member_names', { p_kos: kosId }).then(({ data }) => { if (active) setNames(data || {}); });
    return () => { active = false; };
  }, [kosId]);
  useEffect(() => {
    let active = true;
    setPajak(null); setKpi(null); setLoss(null); setStock(null);
    Promise.all([query('retail_report', range), query('retail_report', prevRange)]).then(([a, b]) => {
      if (active) setD({ key: requestKey, r: a.data, prev: b.data, error: a.error || b.error });
    });
    if (finance) {
      const end = range.to < today() ? range.to : today();
      query('loss_watch', { ...range, to: end }).then(({ data }) => { if (active) setLoss(data || null); });
      query('retail_kpi', { ...range, to: end }).then(({ data }) => { if (active) setKpi(data || null); });
      if (period.mode === 'month') supabase.rpc('tax_report', { p_kos: kosId, p_month: range.from }).then(({ data }) => { if (active) setPajak(data || null); });
    }
    return () => { active = false; };
  }, [kosId, requestKey, finance]);
  useEffect(() => {
    if (!['slow', 'dead'].includes(sort)) return;
    let active = true;
    supabase.rpc('stock_health', { p_kos: kosId }).then(({ data, error }) => { if (active) setStock({ data, error }); });
    return () => { active = false; };
  }, [kosId, sort, key, ver]);
  const toolbar = <div className={styles.toolbar + ' noprint'}>
    <button onClick={() => setEditPeriod(true)}><NavIcon name="calendar" /><b>{label}</b><NavIcon name="down" size={17} /></button>
    {d?.key === requestKey && !d.error && canExport && <div className={styles.controls}>
      <button disabled={ek.habis || exporting} onClick={() => exportReport('xlsx')}><NavIcon name="/pengeluaran" />Unduh Excel</button>
      <button disabled={ek.habis || exporting} onClick={() => exportReport('pdf')}><NavIcon name="/resep" />Unduh PDF</button>
      <button disabled={ek.habis || exporting} onClick={() => ek.jalankan('cetak_laporan_toko', () => window.print())}><NavIcon name="print" />Cetak</button>
    </div>}
  </div>;
  const periodSheet = editPeriod && <PeriodPicker period={period} range={range} onClose={() => setEditPeriod(false)}
    onApply={(selected) => { setSource(null); setPeriod(selected); setEditPeriod(false); }} />;
  const header = <header className={styles.header}>
    <div><h1>Laporan toko</h1><PageHelp page="laporan-toko" /></div>
    <p>Analisis penjualan, laba, dan kinerja bisnis Anda.</p>
    <span className={styles.printPeriod}>{kos.name} · {label}</span>
  </header>;
  if (!d || d.key !== requestKey || d.error) return <div className={styles.page}>{header}{toolbar}{periodSheet}
    {d?.key === requestKey && d.error ? <div className="notice bad" role="alert">{errMsg(d.error)}</div> : <Loading />}</div>;
  const { r, prev } = d;
  const a = pnl(r), b = pnl(prev);
  const end = range.to < today() ? range.to : today();
  const byProduct = ['omzet', 'laba'].includes(sort);
  const ranked = byProduct ? [...r.produk].sort((x, y) => N(y[sort]) - N(x[sort])) : (stock?.data?.rows || []).filter((row) => row.kelas === (sort === 'dead' ? 'mati' : 'lambat'));
  const bridge = [['Biaya operasional', -N(r.biaya), 'expenses'], ['Selisih persediaan', N(r.selisih_stok), 'stock'], ['Pemasukan lain', N(r.pendapatan_lain), 'other']];
  const grossSource = ['sales', 'returns', 'journal'];
  const netSource = ['expenses', 'stock', 'other', 'journal', 'sales', 'returns', 'stockJournal'];
  const open = (title, amount, kinds, extra) => setSource({ title, amount, kinds, ...extra });
  const reconciliation = { bridge, reconcile: { net: a.bersih }, explanation: 'Selisih = pemasukan lain + selisih persediaan − biaya operasional. Pilih komponen atau baris jurnal untuk memeriksa asalnya.' };
  const comparison = (title, amount, kinds, extra) => ({ compare: { title, amount, kinds, ...extra, range: prevRange } });
  const noCost = r.produk.filter((item) => item.no_cost);
  const drill = (name, amount, kinds, extra) => () => open(name, amount, kinds, extra);
  const lines = [
    ['Diskon pada nota', N(r.diskon), ['sales'], { measure: 'discount' }],
    ['Nilai nota retur', -N(r.retur), ['returns'], { measure: 'grossReturn', explanation: 'Nilai nota dapat mencakup PPN. Penjualan bersih dan HPP memakai retur yang sama dengan penyesuaian PPN.' }],
    ['Penjualan bersih', a.omzet, grossSource],
    ['HPP', -a.hpp, grossSource, { measure: 'hpp' }],
    ['Laba kotor', a.kotor, grossSource, { measure: 'gross' }],
    ['Biaya operasional', -N(r.biaya), ['expenses'], { explanation: 'Dikurangkan dari laba kotor.' }],
    ['Selisih persediaan', N(r.selisih_stok), ['stock', 'stockJournal']],
    ['Pemasukan lain', N(r.pendapatan_lain), ['other', 'journal']],
    ['Laba bersih', a.bersih, netSource, reconciliation],
  ];

  async function exportReport(format) {
    if (ek.habis || exporting) return;
    const sheets = [
      { name: 'Laba rugi', cols: ['Indikator', 'Nilai', 'Pembanding'], types: ['t', 'r', 'r'], rows: [
        ...lines.map(([name, value]) => [name, value, ({ 'Penjualan bersih': b.omzet, HPP: -b.hpp, 'Laba kotor': b.kotor, 'Laba bersih': b.bersih })[name]]),
        ['Selisih laba bersih dan laba kotor', a.bridge, b.bridge], ['Margin kotor', percent(a.margin), percent(b.margin)],
        ['Belanja barang setelah retur supplier', N(r.belanja), N(prev.belanja)], ['Pengeluaran di luar operasional', N(r.belanja_modal), N(prev.belanja_modal)],
      ] },
      { name: 'Biaya per kategori', cols: ['Kategori', 'Biaya'], types: ['t', 'r'], rows: r.biaya_rinci.map((row) => [row.name, N(row.total)]) },
      { name: 'Produk', cols: ['Produk', 'Unit bersih', 'Penjualan', 'HPP', 'Laba kotor'], types: ['t', 'n', 'r', 'r', 'r'], rows: r.produk.map((row) => [row.name, N(row.qty), N(row.omzet), N(row.hpp), N(row.laba)]) },
      { name: 'Harian', cols: ['Tanggal', 'Transaksi', 'Penjualan bersih', 'Laba kotor'], types: ['d', 'n', 'r', 'r'], rows: r.harian.map((row) => [row.d, N(row.trx), N(row.omzet), N(row.laba)]) },
    ];
    const base = `Laporan-toko-${range.from}-${range.to}`;
    setExporting(true);
    try {
      if (format === 'xlsx') {
        ek.jalankan('laporan_toko_xlsx', () => download(makeXlsx([{ name: 'Periode', cols: ['Keterangan', 'Nilai'], types: ['t', 't'], rows: [['Bisnis', kos.name], ['Periode', label], ['Pembanding', labelRange(prevRange)]] }, ...sheets]), base + '.xlsx'));
      } else {
        const { makePdf } = await import('@/lib/pdfExport');
        const file = await makePdf({ title: 'Laporan toko', business: kos.name, type: 'retail', subtitle: `${kos.name} · ${label}`, exported_at: today(), sheets, note: 'Laporan operasional toko berdasarkan transaksi yang tercatat.' });
        ek.jalankan('laporan_toko_pdf', () => download(file, base + '.pdf'));
      }
    } catch (error) { toast(errMsg(error)); }
    finally { setExporting(false); }
  }

  const row = (name, value, kinds, extra) => <button className={styles.dataRow} key={name} onClick={drill(name, value, kinds, extra)}>
    <span>{name}</span><b>{rp(value)}</b><NavIcon name="next" size={14} />
  </button>;

  return <div className={styles.page}>
    {header}{toolbar}{periodSheet}
    {canExport ? (ek.habis ? <p className="small noprint">{ek.q?.message}</p> : ek.info && <p className="small muted noprint">{ek.info}</p>) : <Locked need="dasar" title="Unduh Excel, PDF dan cetak" text="Ekspor laporan toko tersedia mulai Paket Dasar." />}
    <p className={styles.muted}>Dibandingkan dengan {labelRange(prevRange)}</p>
    <div className={styles.metrics}>
      <Metric icon="coins" label="Penjualan bersih" value={rp(a.omzet)} note={`${angka(r.trx)} transaksi`} change={delta(a.omzet, b.omzet)} primary onClick={drill('Penjualan bersih', a.omzet, grossSource, { explanation: 'Nota selesai setelah diskon dan retur, tanpa PPN.', ...comparison('Penjualan periode pembanding', b.omzet, grossSource) })} />
      <Metric icon="/barang" label="Laba kotor" value={rp(a.kotor)} note={`Margin ${percent(a.margin)}`} change={delta(a.kotor, b.kotor)} onClick={drill('Laba kotor dan margin', a.kotor, grossSource, { explanation: 'Laba kotor = penjualan bersih − HPP. Margin kotor = laba kotor ÷ penjualan bersih.', measure: 'gross', ...comparison('Laba kotor periode pembanding', b.kotor, grossSource, { measure: 'gross' }) })} />
      <Metric icon="/analisis" label="Laba bersih" value={rp(a.bersih)} note="Setelah biaya dan penyesuaian" change={delta(a.bersih, b.bersih)} onClick={drill('Laba bersih', a.bersih, netSource, { ...reconciliation, ...comparison('Laba bersih periode pembanding', b.bersih, netSource, { bridge: [['Biaya operasional', -N(prev.biaya), 'expenses'], ['Selisih persediaan', N(prev.selisih_stok), 'stock'], ['Pemasukan lain', N(prev.pendapatan_lain), 'other']], reconcile: { net: b.bersih }, explanation: reconciliation.explanation }) })} />
      <Metric icon="/laporan" label="Laba rugi" note="Rincian penjualan, retur, biaya, dan laba" onClick={() => document.getElementById('laba-rugi-toko')?.scrollIntoView({ block: 'start' })} />
    </div>
    {a.bridge !== 0 && <aside className={styles.reconcile}>
      <NavIcon name="info" /><div><b>Selisih laba bersih dan laba kotor {rp(a.bridge)}</b>
        <p>Pemasukan lain {rp(r.pendapatan_lain)} · Selisih persediaan {rp(r.selisih_stok)} · Biaya operasional {rp(r.biaya)}.</p></div>
      <button onClick={drill('Telusuri selisih laba', a.bridge, netSource, reconciliation)}>Telusuri selisih</button>
    </aside>}
    {noCost.length > 0 && <aside className={styles.reconcile}><NavIcon name="info" /><div><b>{angka(noCost.length)} produk terjual tanpa harga modal</b><p>Periksa baris nota untuk memastikan laba kotor tercatat dengan tepat.</p></div>
      <button onClick={drill('Penjualan tanpa HPP', null, ['sales'], { measure: 'missingCost' })}>Telusuri penjualan</button>
    </aside>}
    <ReportTrend key={requestKey} kosId={kosId} range={range} daily={r.harian} mode={period.mode} onPoint={(kind, point) =>
      open({ omzet: 'Penjualan bersih', kotor: 'Laba kotor', hpp: 'HPP', biaya: 'Biaya operasional' }[kind], point[kind],
        kind === 'biaya' ? ['expenses'] : grossSource, { range: point, measure: kind === 'hpp' ? 'hpp' : kind === 'kotor' ? 'gross' : undefined })} />
    <div className={styles.dashboardColumns}>
      <section className={styles.panel} id="produk">
        <div className={styles.heading}><h2><NavIcon name="trophy" />Performa produk</h2></div>
        <div className={styles.controls}>{[['omzet', 'Terlaris'], ['laba', 'Paling untung'], ['slow', 'Kurang laku'], ['dead', 'Stok mati']].map(([id, title]) =>
          <button key={id} aria-pressed={sort === id} onClick={() => setSort(id)}>{title}</button>)}</div>
        {!byProduct && <p className={styles.muted}>Berdasarkan kesehatan stok saat ini dan riwayat {stock?.data?.aturan?.mati_hari || 90} hari.</p>}
        {!byProduct && !stock ? <Loading /> : !byProduct && stock.error ? <p role="alert">{errMsg(stock.error)}</p> : ranked.length ?
          <div className={styles.list}>{ranked.slice(0, 10).map((item, i) => <button key={item.product_id || item.name} className={styles.dataRow}
            onClick={drill(item.name, byProduct ? N(item[sort]) : N(item.value), byProduct ? ['product', ...(item.product_id ? ['catalog'] : [])] : ['catalog', 'product'], { productId: item.product_id, measure: sort })}>
            <span><b>{i + 1}. {item.name}</b><small>{byProduct ? `${angka(item.qty)} unit bersih · ${rp(item.omzet)} penjualan` : `Stok ${angka(item.stock)} ${item.base_unit} · ${angka(item.sold90)} terjual dalam 90 hari`}</small></span>
            <b>{rp(byProduct ? item[sort] : item.value)}</b><NavIcon name="next" size={14} />
          </button>)}</div> : <p className={styles.muted}>Belum ada barang dalam kelompok ini.</p>}
      </section>
      <section className={styles.panel}>
        <h2><NavIcon name="/layers" />Ringkasan biaya</h2>
        <div className={styles.list}>
          {row('Total biaya operasional', N(r.biaya), ['expenses', 'journal'], { measure: 'expense' })}
          {r.biaya_rinci.map((item) => row(item.name, N(item.total), ['expenses'], { category: item.name }))}
          {row('Pengeluaran di luar operasional', N(r.belanja_modal), ['expenses'], { measure: 'capital', explanation: 'Meliputi belanja modal dan jenis pengeluaran non-operasional.' })}
        </div>
      </section>
    </div>
    <section className={styles.panel} id="laba-rugi-toko">
      <h2><NavIcon name="/pembukuan" />Laba rugi</h2>
      <div className={styles.list}>{lines.map((args) => row(...args))}</div>
      <p className={styles.muted}>Diskon dan nilai nota retur ditampilkan sebagai informasi pendukung. Keduanya sudah diperhitungkan dalam penjualan bersih.</p>
      <details><summary>Arus lain dan pembelian barang</summary>
        {row('Prive', N(r.prive), ['other'], { cashKind: 'prive' })}
        {row('Setoran modal', N(r.setoran_modal), ['other'], { cashKind: 'setoran_modal' })}
        {row('Belanja barang setelah retur supplier', N(r.belanja), ['purchase', 'purchaseReturn'])}
      </details>
    </section>
    <section className={styles.panel}><h2>Cara bayar</h2><div className={styles.list}>{Object.entries(PAY).map(([id, title]) => row(title, N(r.bayar[id]), ['sales'], { payment: id }))}</div></section>
    {source && <ReportSource key={source.title + ':' + (source.range?.from || '')} kosId={kosId} range={source.range || range} source={source} owner={owner} onChange={setSource} onClose={() => setSource(null)} />}

    <details className={styles.panel}>
      <summary>Indikator toko, PPN, merek, dan lokasi</summary>
        {kpi && <Indikator k={kpi} names={names} drill={drill} />}
        {canArea(kos, 'finance') && <BrandReport kosId={kosId} from={range.from} to={end} ver={ver} />}
        {canArea(kos, 'finance') && (moduleOn(kos, 'u_penawaran') || moduleOn(kos, 'u_kredit')) && <IndikatorGrosir kosId={kosId} from={range.from} to={end} names={names} ver={ver} />}
        {loss && <PerluDiperiksa w={loss} names={names} />}

        {pajak && (pajak.setelan?.aktif || Number(pajak.ppn_keluaran) !== 0 || Number(pajak.ppn_masukan) !== 0) && (
          <section className="panel">
            <h3>PPN {bulan(ym)}</h3>
            <div className="list">
              {row('Penjualan kena PPN (DPP)', N(pajak.penjualan.dpp), ['sales'], { measure: 'dpp' })}
              {row('PPN dari penjualan', N(pajak.penjualan.ppn), ['sales'], { measure: 'tax' })}
              {N(pajak.retur_ppn) > 0 && row('PPN dari retur penjualan', -N(pajak.retur_ppn), ['returns'], { measure: 'tax' })}
              {row('PPN keluaran bersih', N(pajak.ppn_keluaran), ['sales', 'returns'], { measure: 'tax' })}
              {pajak.pembelian && (N(pajak.ppn_masukan) !== 0 || pajak.setelan?.aktif) && <>
                {row('PPN masukan dari faktur supplier', N(pajak.ppn_masukan), ['invoices'], { measure: 'tax' })}
                {row(N(pajak.selisih) >= 0 ? 'PPN kurang bayar' : 'PPN lebih bayar', Math.abs(N(pajak.selisih)), ['sales', 'returns', 'invoices'], { measure: 'tax' })}
              </>}
              {row('Penjualan tidak kena PPN', N(pajak.penjualan.tidak_kena), ['sales'], { measure: 'nonTaxable' })}
            </div>
            <span className="small muted">Harga di kasir sudah termasuk PPN{pajak.setelan?.rate ? ` ${String(pajak.setelan.rate).replace('.', ',')}%` : ''}; angka di atas sudah memisahkannya. Penjualan & laba di laporan ini tanpa PPN. PPN masukan diambil dari faktur supplier yang diposting (Belanja › Faktur supplier){Number(pajak.pembelian?.tanpa_nomor) > 0 ? `; ${pajak.pembelian.tanpa_nomor} faktur belum diisi nomor faktur pajaknya` : ''}. Gunakan sebagai bahan pelaporan pajak bersama konsultan Anda.</span>
          </section>
        )}

        {(r.lokasi || []).length > 1 && (
          <section className="panel">
            <h3>Per lokasi</h3>
            <div className="list">{r.lokasi.map((x) => (
              <button className={styles.dataRow} key={x.name} onClick={drill(x.name, N(x.omzet), ['sales'], { branch: x.name, measure: 'branchGross' })}><div className="main"><b className="small">{x.name}</b><span className="small muted">{angka(x.trx)} transaksi · laba kotor {rp(x.laba)}{x.biaya != null ? ` · biaya lokasi ${rp(x.biaya)}` : ''}</span>{x.kontribusi != null && <span className="small">Kontribusi <b style={{ color: Number(x.kontribusi) < 0 ? 'var(--bad)' : undefined }}>{rp(x.kontribusi)}</b></span>}</div><b className="small">{rp(x.omzet)}</b></button>
            ))}</div>
            <span className="small muted">Penjualan sebelum retur menurut lokasi transaksi. Kontribusi = laba kotor − biaya operasional yang dicatat di lokasi itu (biaya bersama seperti gaji pemilik tidak dibagi otomatis).</span>
          </section>
        )}


    </details>
    <section className={styles.panel}>
      <h2>Barang berstok tanpa penjualan pada periode ini</h2>
      {r.tidak_laku.length ? <div className={styles.list}>{r.tidak_laku.map((item) =>
        <button className={styles.dataRow} key={item.id} onClick={drill(item.name, N(item.modal), ['catalog', 'product'], { productId: item.id })}>
          <span><b>{item.name}</b><small>Stok {angka(item.stock)} {item.base_unit} · terakhir terjual {item.last_sold ? tgl(item.last_sold) : 'belum pernah'}</small></span><b>{rp(item.modal)}</b><NavIcon name="next" size={14} />
        </button>)}</div> : <p className={styles.muted}>Belum ada barang dalam kelompok ini.</p>}
    </section>
  </div>;
}

function Metric({ icon, label, value, note, change, primary, onClick }) {
  return <button className={styles.metric} data-primary={primary || undefined} onClick={onClick}>
    <span className={styles.metricIcon}><NavIcon name={icon} /></span><span className={styles.metricText}>
      <b>{label}</b>{value && <strong className={value.length > 15 ? styles.longValue : undefined}>{value}</strong>}
      <small>{note}</small>{change && <small className={styles.delta}>{change}</small>}
    </span>
  </button>;
}

function PeriodPicker({ period, range, onClose, onApply }) {
  const [mode, setMode] = useState(period.mode);
  const [date, setDate] = useState(period.date);
  const [from, setFrom] = useState(range.from);
  const [to, setTo] = useState(range.to <= today() ? range.to : today());
  const isCustom = mode === 'custom';
  const invalid = isCustom ? !from || !to || from > to || to > today() : !date || date > today();
  return <Sheet title="Pilih periode laporan" onClose={onClose}>
    <Field label="Jenis periode"><select value={mode} onChange={(event) => setMode(event.target.value)}>{PERIODS.map(([id, title]) => <option key={id} value={id}>{title}</option>)}</select></Field>
    {isCustom ? <>
      <Field label="Tanggal mulai"><input type="date" value={from} max={today()} onChange={(event) => setFrom(event.target.value)} /></Field>
      <Field label="Tanggal akhir"><input type="date" value={to} min={from} max={today()} onChange={(event) => setTo(event.target.value)} /></Field>
    </> : <Field label={mode === 'month' ? 'Bulan' : 'Tanggal acuan'}>{mode === 'month'
      ? <input type="month" value={date.slice(0, 7)} max={today().slice(0, 7)} onChange={(event) => setDate(event.target.value ? event.target.value + '-01' : '')} />
      : <input type="date" value={date} max={today()} onChange={(event) => setDate(event.target.value)} />}</Field>}
    <button disabled={invalid} className="primary" onClick={() => onApply({ mode, date: date || today(), custom: { from, to } })}>Terapkan periode</button>
  </Sheet>;
}

// Perlu diperiksa (pencegahan kehilangan): aturan tetap & terbuka dari loss_watch — temuan untuk dicek, BUKAN tuduhan
function PerluDiperiksa({ w, names }) {
  const who = (u) => names[u] || (u ? 'karyawan lama' : 'sistem');
  const a = w.aturan;
  const n = w.di_bawah_modal.length + w.diskon_besar.length + w.kasir.length + w.susut_barang.length + w.berubah_setelah_tutup.length;
  return (
    <section className="panel">
      <h3>Perlu diperiksa</h3>
      <span className="small muted">Daftar ini dibuat dengan aturan tetap agar mudah dicek, bukan tuduhan. Banyak temuan punya alasan wajar (barang rusak, harga khusus pelanggan tetap).</span>
      {n === 0 ? <span className="small" style={{ color: 'var(--good)' }}>Tidak ada temuan bulan ini.</span> : <>
        {w.di_bawah_modal.length > 0 && <><span className="label">Harga diubah manual di bawah modal</span><div className="list">{w.di_bawah_modal.map((x, i) => (
          <div className="li" key={'m' + i}><div className="main"><b>{x.name}</b><span className="small muted">{x.number} · {tgl(x.sale_date)} · {who(x.user_id)} · {angka(x.qty)} {x.unit} @ {rp(x.price)} (modal {rp(x.modal)})</span></div><span className="small" style={{ color: 'var(--bad)' }}>−{rp(x.rugi)}</span></div>))}</div></>}
        {w.diskon_besar.length > 0 && <><span className="label">Diskon manual lebih dari {a.diskon_pct}%</span><div className="list">{w.diskon_besar.map((x, i) => (
          <div className="li" key={'d' + i}><div className="main"><b>{x.number}</b><span className="small muted">{tgl(x.sale_date)} · {who(x.user_id)} · belanja {rp(x.subtotal)}</span></div><span className="small">{rp(x.diskon)} ({String(x.pct).replace('.', ',')}%)</span></div>))}</div></>}
        {w.kasir.length > 0 && <><span className="label">Kasir dengan banyak pembatalan atau laci kurang</span><div className="list">{w.kasir.map((x, i) => (
          <div className="li" key={'k' + i}><div className="main"><b>{who(x.user_id)}</b><span className="small muted">{angka(x.batal_n)} batal dari {angka(x.trx)} transaksi ({rp(x.batal)}){Number(x.laci_kurang_n) > 0 ? ` · laci kurang ${x.laci_kurang_n}× (${rp(x.laci_kurang)})` : ''}{Number(x.retur_tunai_n) > 0 ? ` · retur tunai ${x.retur_tunai_n}×` : ''}</span></div></div>))}</div>
          <span className="small muted">Ditandai bila batal ≥ {a.batal_min}× dan lebih dari {a.batal_pct}% transaksinya, atau laci kurang ≥ {a.shift_min}×.</span></>}
        {w.susut_barang.length > 0 && <><span className="label">Barang dengan susut/selisih hitung terbesar</span><div className="list">{w.susut_barang.map((x, i) => (
          <div className="li" key={'s' + i}><div className="main"><b>{x.name}</b><span className="small muted">{angka(x.qty)} {x.base_unit} · {x.kali}× dicatat</span></div><span className="small">{rp(x.nilai)}</span></div>))}</div></>}
        {w.berubah_setelah_tutup.length > 0 && <span className="small">Hari yang berubah setelah ditutup: <b>{w.berubah_setelah_tutup.map((d) => tgl(d)).join(', ')}</b> — cek di <Link href="/tutup-hari">Tutup harian</Link>.</span>}
      </>}
    </section>
  );
}

// Indikator toko (Bab 17 KPI): dihitung server dari transaksi & kartu stok nyata periode ini
function Indikator({ k, names, drill }) {
  const n = (v) => Number(v || 0);
  const pct = (v) => (v == null ? '—' : `${String(v).replace('.', ',')}%`);
  const who = (u) => names[u] || (u ? 'karyawan lama' : 'sistem');
  const maxCat = Math.max(1, ...k.kategori.map((c) => n(c.omzet)));
  return (
    <section className="panel">
      <h3>Indikator toko</h3>
      <span className="small muted">{tgl(k.from)} – {tgl(k.to)} · penjualan tanpa PPN, setelah retur</span>
      <dl className="kv">
        <dt>Rata-rata belanja per transaksi</dt><dd><button className={styles.inline} onClick={drill('Rata-rata belanja per transaksi', k.rata_keranjang, ['sales', 'returns'])}>{k.rata_keranjang != null ? rp(k.rata_keranjang) : '—'}</button></dd>
        <dt>Jenis barang per transaksi</dt><dd><button className={styles.inline} onClick={drill('Jenis barang per transaksi', null, ['sales'])}>{k.jenis_per_trx != null ? angka(k.jenis_per_trx) : '—'}</button></dd>
        <dt>Margin kotor</dt><dd><button className={styles.inline} onClick={drill('Margin kotor', null, ['sales', 'returns'], { measure: 'gross' })}>{pct(k.margin_pct)}</button></dd>
        <dt>Perputaran persediaan</dt><dd><Link href="/barang">{k.perputaran != null ? `${angka(k.perputaran)}× · stok cukup ±${angka(k.hari_persediaan)} hari` : 'Belum cukup data'}</Link></dd>
        <dt>Barang aktif yang stoknya habis</dt><dd><Link href="/barang">{angka(k.stok_habis)} dari {angka(k.barang_aktif)} ({pct(k.stok_habis_pct)})</Link></dd>
        <dt>Barang sempat habis karena terjual</dt><dd><Link href="/barang">{angka(k.sempat_habis)}</Link></dd>
        <dt>Susut (rusak & kedaluwarsa)</dt><dd><button className={styles.inline} onClick={drill('Susut persediaan', k.susut, ['stock', 'stockJournal'], { stockKinds: ['rusak', 'kedaluwarsa'] })}>{rp(k.susut)} · {pct(k.susut_pct)} dari penjualan</button></dd>
        {n(k.selisih_hitung) !== 0 && <><dt>Selisih hitung stok</dt><dd><button className={styles.inline} onClick={drill('Selisih hitung stok', null, ['stock', 'stockJournal'], { stockKinds: ['opname', 'koreksi'] })}>{n(k.selisih_hitung) > 0 ? 'kurang ' : 'lebih '}{rp(Math.abs(n(k.selisih_hitung)))}</button></dd></>}
        <dt>Dibatalkan</dt><dd><button className={styles.inline} onClick={drill('Penjualan dibatalkan', k.batal, ['sales'], { status: 'batal', measure: 'branchGross' })}>{angka(k.batal_n)} · {rp(k.batal)}</button></dd>
      </dl>
      <span className="small muted">Perputaran = harga pokok terjual ÷ rata-rata nilai persediaan (kartu stok, tanpa barang titipan). Makin tinggi, makin cepat barang berputar.</span>
      {k.kasir.length > 0 && <>
        <span className="label">Per kasir</span>
        <div className="list">{k.kasir.map((x) => (
          <div className="li" key={x.user_id || 'x'} style={{ alignItems: 'flex-start' }}>
            <div className="main"><b className="small">{who(x.user_id)}</b>
              <span className="small muted">{angka(x.trx)} transaksi{n(x.trx) ? ` · rata-rata ${rp(n(x.omzet) / n(x.trx))}` : ''}{n(x.retur_n) ? ` · retur ${x.retur_n} (${rp(x.retur)})` : ''}{n(x.batal_n) ? ` · batal ${x.batal_n} (${rp(x.batal)})` : ''}</span>
              {n(x.shift_selisih_n) > 0 && <span className="small" style={{ color: 'var(--bad)' }}>Selisih laci di {x.shift_selisih_n} shift · total {n(x.shift_selisih) < 0 ? 'kurang' : 'lebih'} {rp(Math.abs(n(x.shift_selisih)))}</span>}
            </div>
            <b className="small" style={{ flex: 'none' }}>{rp(x.omzet)}</b>
          </div>
        ))}</div>
        <span className="small muted">Pembatalan, retur, dan selisih laci yang sering pada satu orang patut diperiksa.</span>
      </>}
      {k.kategori.length > 1 && <>
        <span className="label">Per kategori</span>
        {k.kategori.map((c) => (
          <div key={c.name} className="stack" style={{ gap: 2 }}>
            <div className="row between small" style={{ flexWrap: 'nowrap' }}><span style={{ minWidth: 0, overflowWrap: 'anywhere' }}>{c.name}</span><b style={{ flex: 'none' }}>{rp(c.omzet)} · laba {rp(c.laba)}</b></div>
            <div style={{ height: 6, borderRadius: 6, background: 'var(--sunk)' }}><div style={{ height: 6, borderRadius: 6, width: `${Math.max(2, (n(c.omzet) / maxCat) * 100)}%`, background: 'var(--gold)' }} /></div>
          </div>
        ))}
      </>}
      {k.varian.length > 0 && <>
        <span className="label">Barang bervarian</span>
        {k.varian.map((v) => <span key={v.name} className="small"><b>{v.name}</b> {rp(v.omzet)} · {(v.rinci || []).map((r) => `${r.label} ${rp(r.omzet)}`).join(' · ')}</span>)}
      </>}
    </section>
  );
}
