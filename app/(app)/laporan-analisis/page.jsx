'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useKos } from '@/components/KosProvider';
import NavIcon from '@/components/NavIcon';
import PageHelp from '@/components/PageHelp';
import { Loading } from '@/components/ui';
import { canArea, pathAllowed } from '@/lib/business';
import { angka, errMsg, rp, tgl, today } from '@/lib/format';
import { roomStatus } from '@/lib/propertyIntel';
import { addDays, daysBetween, periodOf, rangeLabel, seriesOf, shortLabel } from '@/lib/recap';
import { supabase } from '@/lib/supabase';
import { allRows } from '@/lib/useData';
import { TrendChart } from '../analisis/Charts';
import { DetailSheet, JournalLines } from '../analisis/Details';
import styles from './reports.module.css';

const PERIODS = [['harian', 'Harian'], ['bulanan', 'Bulanan'], ['tahunan', 'Tahunan']];
const REPORT = { retail: '/laporan-toko', jasa: '/laporan-jasa', kustom: '/laporan-kustom' };
const sum = (rows, field) => rows.reduce((total, row) => total + Number(row[field] || 0), 0);
const percent = (v) => v == null ? '—' : angka(Math.round(v * 10) / 10) + '%';
const dated = (rows, field, range) => rows.filter((row) => row[field] >= range.from && row[field] <= range.to);
const inJakarta = (value) => new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Jakarta', dateStyle: 'short' }).format(new Date(value));

function rentalPayments(kosId, from, to) {
  return allRows(() => supabase.from('payments').select('id,paid_at,amount,invoice_id,invoices!inner(kind,description)')
    .eq('kos_id', kosId).eq('status', 'terverifikasi').eq('invoices.kind', 'sewa').gte('paid_at', from).lte('paid_at', to));
}

function useReport(kosId, version, property, rentalAccess, period, series) {
  const [result, setResult] = useState(null);
  const key = [kosId, version, period.kind, period.from, period.to].join(':');
  useEffect(() => {
    let active = true;
    const params = { p_kos: kosId, p_from: period.from, p_to: period.to };
    const calls = [supabase.rpc('biz_recap', { ...params, p_series: rentalAccess ? [] : series.map(({ from, to }) => ({ from, to })) })];
    if (property) calls.push(supabase.rpc('property_intel', params));
    if (rentalAccess) calls.push(rentalPayments(kosId, series[0].from, period.to));
    Promise.all(calls).then(([recap, prop, rent]) => {
      if (!active) return;
      const error = recap.error || prop?.error || rent?.error;
      setResult(error ? { key, error } : { key, recap: recap.data, property: prop?.data, payments: rent?.data || [] });
    }).catch((error) => { if (active) setResult({ key, error }); });
    return () => { active = false; };
  }, [key, kosId, property, rentalAccess, period.from, period.to, series]);
  return result?.key === key ? result : null;
}

function SourceRows({ detail, kosId }) {
  const [state, setState] = useState(null);
  const [limit, setLimit] = useState(15);
  useEffect(() => {
    if (!detail.load) return;
    let active = true;
    detail.load(kosId).then(({ data, error }) => {
      if (active) setState(error ? { error } : { rows: detail.map(data) });
    }).catch((error) => { if (active) setState({ error }); });
    return () => { active = false; };
  }, [detail, kosId]);
  const rows = detail.records || state?.rows;
  if (state?.error) return <p role="alert" className="notice bad">{errMsg(state.error)}</p>;
  if (!rows) return <Loading rows={3} />;
  return <div className={styles.sources}>
    <h3>Data sumber</h3>
    {!rows.length && <p className="muted small">Tidak ada catatan sumber yang tersedia.</p>}
    {rows.slice(0, limit).map(({ key, href, title, note, value }) => <Link key={key} href={href}>
      <span><strong>{title}</strong>{note && <small>{note}</small>}</span>
      {value && <b>{value}</b>}<NavIcon name="next" size={16} />
    </Link>)}
    {rows.length > limit && <button type="button" onClick={() => setLimit(limit + 30)}>Tampilkan lebih banyak</button>}
  </div>;
}

const rentDetail = (payments, range) => {
  const rows = dated(payments, 'paid_at', range);
  return {
    title: 'Penerimaan sewa', icon: 'wallet', value: rp(sum(rows, 'amount')),
    note: `${angka(rows.length)} pembayaran terverifikasi`,
    formula: 'Pembayaran terverifikasi untuk tagihan sewa menurut tanggal bayar. Deposit dan tagihan tambahan dikeluarkan.',
    records: [...rows].sort((a, b) => b.paid_at.localeCompare(a.paid_at)).map((p) => ({
      key: p.id, href: '/kwitansi/' + p.id, title: p.invoices.description || 'Pembayaran sewa', note: tgl(p.paid_at), value: rp(p.amount),
    })),
  };
};

function propertyMetrics(data, period, rentalAccess) {
  const p = data.property;
  const rooms = p.rooms || [];
  const st = roomStatus(rooms);
  const arrears = p.arrears || {};
  return [
    {
      title: 'Tingkat hunian', icon: '/kamar', value: percent(st.occ == null ? null : st.occ * 100),
      note: `${angka(st.terisi)} dari ${angka(st.rentable)} unit terisi saat ini`, snapshot: true,
      formula: 'Unit berstatus terisi dibagi seluruh unit yang disewakan saat ini.',
      records: rooms.filter((r) => r.status !== 'tidak_disewakan').map((r) => ({
        key: r.id, href: '/kamar?unit=' + r.id, title: r.name || r.code, value: r.status.replaceAll('_', ' '),
      })),
    },
    rentalAccess ? rentDetail(data.payments, period) : {
      title: 'Pendapatan', icon: 'wallet', value: rp(data.recap.cur.ringkas.pendapatan),
      note: 'Dari jurnal pendapatan', journal: ['pendapatan'],
    },
    {
      title: 'Tunggakan', icon: '/tagihan', value: rp(arrears.total), note: `${angka(arrears.count || 0)} tagihan lewat jatuh tempo`,
      warning: Number(arrears.total) > 0, snapshot: true,
      formula: 'Sisa tagihan terbit dengan tanggal jatuh tempo sebelum hari ini.',
      load: (id) => allRows(() => supabase.from('invoice_summary').select('id,due_date,description,outstanding').eq('kos_id', id)
        .eq('status', 'terbit').lt('due_date', p.today).gt('outstanding', 0)),
      map: (rows) => rows.map((r) => ({ key: r.id, href: '/tagihan?invoice=' + r.id, title: r.description || 'Tagihan', note: tgl(r.due_date), value: rp(r.outstanding) })),
    },
    {
      title: 'Biaya pemeliharaan', icon: '/perbaikan', value: rp(p.maint?.cost), note: `${angka(p.maint?.open || 0)} tiket aktif saat ini`,
      formula: 'Jumlah biaya tercatat pada tiket yang dibuat dalam periode. Status aktif adalah posisi saat ini.',
      load: (id) => allRows(() => supabase.from('maint_tickets').select('id,number,title,cost,created_at,status').eq('kos_id', id)
        .gte('created_at', period.from + 'T00:00:00+07:00').lt('created_at', addDays(period.to, 1) + 'T00:00:00+07:00')),
      map: (rows) => rows.map((r) => ({ key: r.id, href: '/perbaikan?tiket=' + r.id, title: r.title, note: [r.number, tgl(inJakarta(r.created_at))].join(' · '), value: rp(r.cost) })),
      links: [['/perbaikan', 'Buka daftar tiket aktif']],
    },
  ];
}

export default function ReportsPage() {
  const { kos, kosId, ver } = useKos();
  return kosId ? <ReportCenter key={kosId} kos={kos} kosId={kosId} version={ver} /> : <Loading />;
}

function ReportCenter({ kos, kosId, version }) {
  const router = useRouter();
  const pathname = usePathname();
  const query = useSearchParams();
  const now = today();
  const kind = PERIODS.some(([key]) => key === query.get('periode')) ? query.get('periode') : 'bulanan';
  const date = query.get('tanggal');
  const anchor = /^\d{4}-\d{2}-\d{2}$/.test(date || '') && !Number.isNaN(Date.parse(date)) && date <= now && date >= '1900-01-01' ? date : now;
  const period = useMemo(() => periodOf(kind, anchor, now), [kind, anchor, now]);
  const series = useMemo(() => seriesOf(period, now), [period, now]);
  const property = !kos.business_type || kos.business_type === 'properti';
  const rentalAccess = property && canArea(kos, 'rent');
  const data = useReport(kosId, version, property, rentalAccess, period, series);
  const [trend, setTrend] = useState('income');
  const [detail, setDetail] = useState(null);
  const occupancy = property && trend === 'occupancy';
  const changePeriod = (next, day) => {
    setDetail(null);
    router.replace(`${pathname}?periode=${next}&tanggal=${day}`, { scroll: false });
  };
  const analysis = (range, tab = 'ringkasan') => `/analisis?p=kustom&dari=${range.from}&sampai=${range.to}&m=${tab}`;
  const report = (REPORT[kos.business_type] || '/laporan') + '?bulan=' + period.from.slice(0, 7);
  const recap = `/rekap?k=${kind}&t=${anchor}`;
  const nav = [[report, '/laporan', 'Laporan', 'Laporan operasional dan keuangan'], [analysis(period), '/analisis', 'Analisis Bisnis', 'Kinerja, tren, dan insight'], [recap, '/rekap', 'Rekap Bisnis', 'Hasil dan aktivitas per periode']];
  const categories = property
    ? [[report, 'wallet', 'Keuangan'], ['/kamar', '/kamar', 'Hunian & Sewa'], ['/tagihan', '/tagihan', 'Tagihan & Pembayaran'], ['/inventaris', '/aset', 'Aset & Inventaris'], ['/perbaikan', '/perbaikan', 'Pemeliharaan']]
    : [[report, 'wallet', 'Keuangan'], [analysis(period, 'industri'), '/analisis', 'Operasional'], [recap, '/rekap', 'Rekap Periode'], ['/aset', '/aset', 'Aset Tetap']];
  const cur = data?.recap?.cur;
  const financial = cur?.ringkas;
  const kas = cur?.kas;
  const metrics = !financial ? [] : [
    ...(property ? propertyMetrics(data, period, rentalAccess) : [
      { title: 'Pendapatan', icon: 'wallet', value: rp(financial.pendapatan), note: 'Dari jurnal pendapatan', journal: ['pendapatan'] },
      { title: 'Biaya', icon: '/pengeluaran', value: rp(financial.biaya), note: 'Beban periode terpilih', journal: ['biaya'] },
    ]),
    { title: 'Laba bersih', icon: '/analisis', value: rp(financial.laba),
      note: Number(financial.pendapatan) ? 'Margin ' + percent(financial.laba * 100 / financial.pendapatan) : 'Dari laba rugi periode terpilih',
      formula: 'Pendapatan dikurangi HPP dan biaya pada jurnal.', journal: ['pendapatan', 'hpp', 'biaya'] },
    { title: 'Arus kas bersih', icon: 'coins', value: rp(Number(kas?.masuk || 0) - Number(kas?.keluar || 0)),
      note: 'Kas masuk dikurangi kas keluar', journal: ['kas'], links: [[analysis(period, 'kas'), 'Telusuri arus kas di Analisis Bisnis']],
      rows: [['Kas masuk', rp(kas?.masuk)], ['Kas keluar', rp(kas?.keluar)]] },
  ];
  const points = !financial ? [] : occupancy
    ? (data.property.occ || []).slice(-6).map((o) => {
        const month = periodOf('bulanan', o.bulan + '-01', now);
        return { ...month, short: shortLabel('bulanan', month.from), value: o.hari ? Math.round(o.terisi * 1000 / o.hari) / 10 : null, days: o.hari, occupied: o.terisi };
      }).filter((o) => o.value != null)
    : series.map((range, index) => ({ ...range, short: range.label, label: range.title,
        value: rentalAccess ? sum(dated(data.payments, 'paid_at', range), 'amount') : Number(data.recap.seri?.[index]?.v?.pendapatan || 0) }));
  const trendLabel = occupancy ? 'Tingkat hunian' : rentalAccess ? 'Penerimaan sewa' : 'Pendapatan';
  function pick(point) {
    if (occupancy) {
      const rentable = new Map(data.property.rooms.filter((r) => r.status !== 'tidak_disewakan').map((r) => [r.id, r]));
      setDetail({ title: 'Tren hunian', value: percent(point.value), range: point, rows: [['Hari unit terisi', angka(point.occupied)], ['Hari unit tersedia', angka(point.days)]],
        formula: 'Hari unit terisi dibagi hari unit tersedia berdasarkan unit yang disewakan saat ini.',
        load: (id) => allRows(() => supabase.from('leases').select('id,room_id,start_date,end_date').eq('kos_id', id)
          .lte('start_date', point.to).or(`end_date.is.null,end_date.gte.${point.from}`)),
        map: (rows) => rows.filter((r) => rentable.has(r.room_id)).map((r) => ({
          key: r.id, href: '/kamar?unit=' + r.room_id, title: rentable.get(r.room_id).code,
          note: rangeLabel(r.start_date > point.from ? r.start_date : point.from, r.end_date && r.end_date < point.to ? r.end_date : point.to),
          value: angka(daysBetween(r.start_date > point.from ? r.start_date : point.from, r.end_date && r.end_date < point.to ? r.end_date : point.to) + 1) + ' hari',
        })),
      });
    } else {
      setDetail({ ...(rentalAccess ? rentDetail(data.payments, point) : { title: 'Pendapatan', value: rp(point.value), journal: ['pendapatan'] }), range: point });
    }
  }
  const detailRange = detail?.range || period;

  return <div className={styles.page}>
    <section className={styles.hero}>
      <div><h1>Laporan &amp; Analisis</h1><p>Pantau kinerja {property ? 'properti' : 'bisnis'} dan telusuri sumber setiap angka.</p>
        <PageHelp page="laporan-analisis" label="Panduan Laporan" /></div>
      <img src="/pemilik-ringkasan.webp" alt="" />
    </section>

    <nav className={styles.navigation} aria-label="Modul laporan">
      {nav.map(([href, icon, label, description]) => <Link key={label} href={href}>
        <NavIcon name={icon} size={25} /><strong>{label}</strong><small>{description}</small>
        <span className={styles.chevron}><NavIcon name="next" size={18} /></span>
      </Link>)}
    </nav>

    <div className={styles.toolbar}>
      <div className={styles.filters}>
        <div className={styles.segment} role="group" aria-label="Jenis periode">{PERIODS.map(([key, label]) =>
          <button key={key} type="button" aria-pressed={kind === key} onClick={() => changePeriod(key, anchor)}>{label}</button>)}</div>
        {kind === 'tahunan' ? <select aria-label="Pilih tahun" value={anchor.slice(0, 4)} onChange={(e) => changePeriod(kind, e.target.value + '-01-01')}>
          {Array.from({ length: Number(now.slice(0, 4)) - 1899 }, (_, i) => Number(now.slice(0, 4)) - i).map((year) => <option key={year}>{year}</option>)}
        </select> : <input aria-label={kind === 'bulanan' ? 'Pilih bulan' : 'Pilih tanggal'} type={kind === 'bulanan' ? 'month' : 'date'}
          value={kind === 'bulanan' ? anchor.slice(0, 7) : anchor} min={kind === 'bulanan' ? '1900-01' : '1900-01-01'}
          max={kind === 'bulanan' ? now.slice(0, 7) : now}
          onChange={(e) => { if (e.target.value) changePeriod(kind, kind === 'bulanan' ? e.target.value + '-01' : e.target.value); }} />}
      </div>
      <div className={styles.exports} aria-label="Ekspor rekap periode">
        <Link href={recap + '&ekspor=pdf'}><NavIcon name="print" size={17} /> PDF</Link>
        <Link href={recap + '&ekspor=xlsx'}><NavIcon name="/rekap" size={17} /> Excel</Link>
      </div>
    </div>

    <section aria-labelledby="report-kpis">
      <h2 id="report-kpis">Ringkasan performa bisnis</h2>
      <p className={styles.period}>{rangeLabel(period.from, period.to)}</p>
      {!data ? <Loading rows={3} /> : data.error ? <p role="alert" className="notice bad">{errMsg(data.error)}</p> :
        <div className={styles.metrics}>{metrics.map((metric) => <button key={metric.title} type="button" className={metric.warning ? styles.warning : ''} onClick={() => setDetail(metric)}>
          <NavIcon name={metric.icon} size={24} /><span><strong>{metric.title}</strong><b>{metric.value}</b><small>{metric.note}</small></span>
        </button>)}</div>}
    </section>

    {financial && <section className={styles.chart} aria-labelledby="report-trend">
      <div className={styles.chartHead}><h2 id="report-trend">Tren {trendLabel.toLowerCase()}</h2>
        {property && <div className={styles.segment} role="group" aria-label="Jenis tren">
          <button type="button" aria-pressed={!occupancy} onClick={() => setTrend('income')}>Pendapatan</button>
          <button type="button" aria-pressed={occupancy} onClick={() => setTrend('occupancy')}>Hunian</button>
        </div>}
      </div>
      <p className={styles.period}>{occupancy ? 'Rata-rata bulanan · pilih titik untuk melihat kontrak sewa.' : 'Pilih titik untuk menelusuri transaksi pada periode tersebut.'}</p>
      {points.length > 0 ? <TrendChart points={points} series={[{ key: 'value', label: trendLabel, color: '#087849', area: true, fmt: occupancy ? percent : rp }]} money={!occupancy} onPick={(index) => pick(points[index])} />
        : <p className="muted">Data untuk grafik ini belum tersedia.</p>}
    </section>}

    <section aria-labelledby="report-categories"><h2 id="report-categories">Kategori laporan</h2>
      <nav className={styles.categories} aria-label="Kategori laporan">{categories.filter(([href]) => pathAllowed(kos, href.split('?')[0])).map(([href, icon, label]) =>
        <Link key={href} href={href}><NavIcon name={icon} size={24} />{label}</Link>)}</nav>
    </section>

    {detail && <DetailSheet title={detail.title} period={detail.snapshot ? 'Posisi saat ini' : rangeLabel(detailRange.from, detailRange.to)} value={detail.value}
      formula={detail.formula} rows={detail.rows} links={detail.links} onClose={() => setDetail(null)}>
      {detail.journal && <JournalLines key={detail.title + detailRange.from} kosId={kosId} from={detailRange.from} to={detailRange.to} kinds={detail.journal} retail={kos.business_type === 'retail'} />}
      {(detail.load || detail.records) && <SourceRows key={detail.title + detailRange.from} detail={detail} kosId={kosId} />}
    </DetailSheet>}
  </div>;
}
