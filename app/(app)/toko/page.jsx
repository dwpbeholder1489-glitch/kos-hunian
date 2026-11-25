'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { useKos } from '@/components/KosProvider';
import { RecHint } from '@/components/Rekomendasi';
import CrmHint from '@/components/CrmHint';
import PageHelp from '@/components/PageHelp';
import Persiapan from '@/components/Persiapan';
import { PageHeader } from '@/components/Page';
import NavIcon from '@/components/NavIcon';
import styles from './retail-home.module.css';
import Dashboard, { Widget, Alerts, QuickActions, ActivityList, useActivity, useDashPrefs, KpiGrid, Pulse } from '@/components/Dashboard';
import { KPIS, periodRange, baselineRange, pulseLine } from '@/lib/dashboards';
import { DayColumns } from '@/components/Charts';
import { mediaUrl } from '@/lib/media';
import { Loading } from '@/components/ui';
import { rp, angka, today, tgl, tglShort, bulan, thisMonth, monthEnd, addMonthsYm } from '@/lib/format';
import { isLow, payLabel, jam } from '@/lib/retail';
import { canArea, tabsFor } from '@/lib/business';
import { quickActions } from '@/lib/menu';
import StockMinusList, { useStockMinus } from '@/components/StockMinus';

const STORE_LINKS = [
  ['/kasir', 'Kasir'],
  ['/penjualan', 'Penjualan'],
  ['/barang', 'Barang'],
  ['/belanja', 'Belanja'],
  ['/kas', 'Kas'],
  ['/kontak', 'Kontak'],
  ['/laporan-toko', 'Laporan'],
];

const KPI_ICONS = { omzet: '/kas', trx: '/penjualan', produk: '/barang', pelanggan: '/kontak', laba: '/laporan-toko', menipis: '/barang', piutang: '/kas' };

function ProductThumb({ path }) {
  const [failed, setFailed] = useState(false);
  const src = mediaUrl(path);
  return <span className={styles.thumb}>
    {src && !failed
      ? <img src={src} alt="" loading="lazy" onError={() => setFailed(true)} />
      : <NavIcon name="/barang" size={19} />}
  </span>;
}

function greeting() {
  const hour = Number(new Intl.DateTimeFormat('en-GB', { hour: 'numeric', hourCycle: 'h23', timeZone: 'Asia/Jakarta' }).format(new Date()));
  if (hour < 11) return 'Selamat pagi';
  if (hour < 15) return 'Selamat siang';
  return hour < 18 ? 'Selamat sore' : 'Selamat malam';
}

const N = (x) => Number(x) || 0;
const delta = (a, b) => (b ? Math.round(((a - b) / Math.abs(b)) * 100) : null);

// Dashboard toko (Unified Design System §13): angka hari ini, bulan berjalan vs bulan lalu, tren harian,
// barang terlaris, transaksi terakhir, peringatan berbasis aturan, stok menipis, aktivitas, aksi cepat.
// Semua angka dari data nyata: products/sales (RLS) dan retail_report (area keuangan) — sama dengan Laporan toko.
export default function Toko() {
  const { kos, kosId, ver, user } = useKos();
  const name = user?.user_metadata?.name || user?.user_metadata?.full_name;
  const fin = canArea(kos, 'finance');
  const stockArea = canArea(kos, 'stock');
  const negative = useStockMinus(stockArea || fin ? kosId : null, ver);
  const routes = new Set(tabsFor(kos).map(([href]) => href));
  const has = (href) => routes.has(href);
  const contactsArea = has('/kontak');
  const shortcuts = [...STORE_LINKS.filter(([href]) => has(href)), ['/operasional', 'Lainnya']];
  const [d, setD] = useState(null);
  const [m, setM] = useState(null);        // { r, prev } laporan bulan ini & bulan lalu (keuangan saja)
  const [trend, setTrend] = useState(null);
  const [thumbs, setThumbs] = useState({});
  const [counts, setCounts] = useState({});
  const [recent, setRecent] = useState(null);
  const [po, setPo] = useState(null);      // belanja menunggu diterima
  const act = useActivity(kosId, ver);
  const prefs = useDashPrefs('toko');
  const per = periodRange(prefs.period), base = baselineRange(prefs.period);
  const [pr, setPr] = useState(null);      // { r, b } laporan periode terpilih & 30 hari sebelumnya (keuangan)
  const [ex, setEx] = useState({});        // piutang, kesehatan stok, perubahan harga modal (masing-masing boleh gagal sendiri)
  useEffect(() => {
    if (!fin) return;
    Promise.all([
      supabase.rpc('retail_report', { p_kos: kosId, p_from: per.from, p_to: per.to }),
      supabase.rpc('retail_report', { p_kos: kosId, p_from: base.from, p_to: base.to }),
    ]).then(([a, b]) => setPr(a.error ? null : { r: a.data, b: b.error ? null : b.data }));
  }, [kosId, ver, prefs.period]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const put = (k) => ({ data, error }) => setEx((x) => ({ ...x, [k]: error ? null : data }));
    if (canArea(kos, 'sell,finance')) supabase.rpc('receivable_open', { p_kos: kosId }).then(async ({ data, error }) => {
      if (error) return setEx((x) => ({ ...x, piutang: null }));
      const ids = [...new Set((data || []).map((r) => r.contact_id))];
      const names = ids.length ? (await supabase.from('contacts').select('id,name').in('id', ids)).data || [] : [];
      setEx((x) => ({ ...x, piutang: data || [], nama: Object.fromEntries(names.map((c) => [c.id, c.name])) }));
    });
    if (canArea(kos, 'stock,finance')) { supabase.rpc('stock_health', { p_kos: kosId }).then(put('sehat')); supabase.rpc('cost_changes', { p_kos: kosId, p_days: 30 }).then(put('modal')); }
  }, [kosId, ver]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    Promise.all([
      supabase.from('products').select('id,name,stock,cost,min_stock,active,base_unit').eq('kos_id', kosId),
      supabase.from('sales').select('total,cost_total,pay_method,status').eq('kos_id', kosId).eq('sale_date', today()),
      supabase.from('sale_returns').select('total,cost_total').eq('kos_id', kosId).eq('return_date', today()),
    ]).then(([p, s, r]) => setD({ ps: p.error ? null : (p.data || []).filter((x) => x.active), sales: s.error ? null : (s.data || []).filter((x) => x.status === 'selesai'), rets: r.error ? null : r.data || [] }));
    supabase.from('sales').select('id,number,total,status,sold_at,pay_method,pay_split,amt_tunai,amt_transfer,amt_kasbon').eq('kos_id', kosId).order('sold_at', { ascending: false }).limit(6)
      .then(({ data, error }) => setRecent(error ? null : data || []));
    if (fin) {
      const ym = thisMonth(), pm = addMonthsYm(ym, -1);
      Promise.all([
        supabase.rpc('retail_report', { p_kos: kosId, p_from: ym + '-01', p_to: today() }),
        supabase.rpc('retail_report', { p_kos: kosId, p_from: pm + '-01', p_to: monthEnd(pm) }),
      ]).then(([a, b]) => setM(a.error || b.error ? null : { r: a.data, prev: b.data }));
    }
    if (stockArea) supabase.from('purchases').select('id', { count: 'exact', head: true }).eq('kos_id', kosId).in('status', ['dipesan', 'sebagian'])
      .then(({ count, error }) => setPo(error ? null : count || 0));
  }, [kosId, ver]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    let current = true;
    const putCount = (key) => ({ count, error }) => {
      if (current) setCounts((previous) => ({ ...previous, [key]: error ? null : count }));
    };
    if (stockArea) {
      supabase.from('products').select('id', { head: true, count: 'exact' }).eq('kos_id', kosId).eq('active', true).then(putCount('products'));
    }
    if (contactsArea) {
      supabase.from('contacts').select('id', { head: true, count: 'exact' }).eq('kos_id', kosId).eq('kind', 'pelanggan').is('archived_at', null).then(putCount('customers'));
    }
    if (stockArea || fin) {
      supabase.rpc('media_thumbs', { p_kos: kosId, p_entity: 'product' })
        .then(({ data }) => { if (current) setThumbs(data || {}); });
    }
    if (fin) {
      const week = periodRange('7hari');
      supabase.rpc('retail_report', { p_kos: kosId, p_from: week.from, p_to: week.to })
        .then(({ data, error }) => { if (current) setTrend(error ? null : data); });
    }
    return () => { current = false; };
  }, [kosId, ver, stockArea, fin, contactsArea]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!d) return <Loading rows={5} />;

  const ps = d.ps || [], sales = d.sales || [], rets = d.rets || [];
  const retur = rets.reduce((a, r) => a + N(r.total), 0);
  const low = ps.filter(isLow).sort((a, b) => N(a.stock) / Math.max(1, N(a.min_stock)) - N(b.stock) / Math.max(1, N(b.min_stock)));
  const noCost = ps.filter((p) => !(N(p.cost) > 0));
  const omzet = sales.reduce((a, s) => a + N(s.total), 0) - retur;
  const laba = sales.reduce((a, s) => a + N(s.total) - N(s.cost_total), 0) - rets.reduce((a, r) => a + N(r.total) - N(r.cost_total), 0);
  const ym = thisMonth();
  // bulan berjalan dibanding bulan lalu PENUH (ditulis jelas di keterangan)
  const mo = m && { omzet: N(m.r.omzet), trx: N(m.r.trx), prev: N(m.prev.omzet), prevTrx: N(m.prev.trx) };
  const days = trend ? (() => {
    const map = new Map((trend.harian || []).map((item) => [String(item.d).slice(0, 10), item]));
    const start = new Date(periodRange('7hari').from + 'T00:00:00Z');
    return Array.from({ length: 7 }, (_, i) => {
      const day = new Date(start.getTime());
      day.setUTCDate(start.getUTCDate() + i);
      const key = day.toISOString().slice(0, 10);
      const row = map.get(key);
      return { key, label: tgl(key), short: tglShort(key), value: N(row?.omzet), note: row ? `${angka(row.trx)} transaksi` : 'tidak ada transaksi' };
    });
  })() : null;
  const dl = mo ? delta(mo.omzet, mo.prev) : null;
  // Angka periode terpilih (keuangan: dari retail_report — sama dengan Laporan toko; lainnya: transaksi hari ini)
  const P = pr?.r ? { omzet: N(pr.r.omzet), trx: N(pr.r.trx), laba: N(pr.r.omzet) - N(pr.r.hpp), retur: N(pr.r.retur) } : prefs.period === 'hari' && d.sales && d.rets ? { omzet, trx: sales.length, laba, retur } : null;
  const B = pr?.b ? { omzet: N(pr.b.omzet), trx: N(pr.b.trx), laba: N(pr.b.omzet) - N(pr.b.hpp) } : null;
  const mPct = (x) => (x && x.omzet > 0 ? Math.round((x.laba / x.omzet) * 100) : null);
  const piut = Array.isArray(ex.piutang) ? ex.piutang : null;
  const piutTotal = piut ? piut.reduce((a, x) => a + N(x.open_amount), 0) : 0;
  const piutLewat = piut ? piut.filter((x) => x.due_date && String(x.due_date) < today()) : [];
  const piutLewatTotal = piutLewat.reduce((a, x) => a + N(x.open_amount), 0);
  const diam = ex.sehat ? (ex.sehat.rows || []).filter((x) => x.kelas === 'mati') : null;
  const modal = Array.isArray(ex.modal) ? ex.modal : null;
  const modalUp = modal ? modal.filter((x) => N(x.pct) > 0) : [];
  const per2 = per.label;
  const kpiItems = [
    P && { id: 'omzet', label: `Penjualan ${per2}`, value: rp(P.omzet), sub: `${angka(P.trx)} transaksi${P.retur ? ` · retur ${rp(P.retur)}` : ''}` },
    mo && { id: 'bulan', label: `Penjualan ${bulan(ym)}`, value: rp(mo.omzet), sub: <>{dl != null && <span className={dl >= 0 ? 'up' : 'down'}>{dl >= 0 ? '↑ +' : '↓ '}{dl}%</span>} {dl != null ? 'dari bulan lalu (penuh)' : `${angka(mo.trx)} transaksi`}</> },
    P && { id: 'trx', label: `Transaksi ${per2}`, value: angka(P.trx), sub: B?.trx > 0 ? `${angka(B.trx)} transaksi pada 30 hari pembanding` : undefined },
    stockArea && counts.products != null && { id: 'produk', label: 'Produk aktif', value: angka(counts.products) },
    has('/kontak') && counts.customers != null && { id: 'pelanggan', label: 'Pelanggan', value: angka(counts.customers) },
    P && { id: 'laba', label: `Laba kotor ${per2}`, value: rp(P.laba), sub: mPct(P) == null ? undefined : `Margin ${mPct(P)}%` },
    P && P.omzet > 0 && { id: 'margin', label: `Margin ${per2}`, value: `${mPct(P)}%`, sub: mPct(B) != null ? `30 hari sebelumnya ${mPct(B)}%` : 'laba kotor ÷ penjualan', tone: mPct(B) != null && mPct(P) < mPct(B) - 3 ? 'bad' : '' },
    P && P.trx > 0 && { id: 'keranjang', label: 'Rata-rata belanja', value: rp(Math.round(P.omzet / P.trx)), sub: `per transaksi · ${per2}` },
    P && { id: 'retur', label: `Retur ${per2}`, value: rp(P.retur), tone: P.retur > 0 ? 'gold' : '' },
    d.ps && stockArea && { id: 'nilai_stok', label: 'Nilai stok', value: rp(ps.reduce((s2, p) => s2 + Math.max(0, N(p.stock)) * N(p.cost), 0)), sub: `${angka(ps.length)} barang · harga modal` },
    d.ps && stockArea && { id: 'menipis', label: 'Stok menipis', value: angka(low.length), tone: low.length ? 'bad' : '', sub: low.length ? 'perlu belanja ulang' : 'aman' },
    piut && { id: 'piutang', label: 'Piutang pelanggan', value: rp(piutTotal), sub: `${angka(new Set(piut.map((x) => x.contact_id)).size)} pelanggan · kasbon belum dibayar` },
    piut && { id: 'piutang_lewat', label: 'Piutang lewat tempo', value: rp(piutLewatTotal), tone: piutLewatTotal > 0 ? 'bad' : '', sub: `${angka(piutLewat.length)} transaksi` },
    diam && { id: 'diam', label: 'Barang tidak bergerak', value: angka(diam.length), sub: `nilai ${rp(diam.reduce((a, x) => a + N(x.value), 0))} · tidak terjual ≥ 90 hari`, tone: diam.length ? 'gold' : '' },
    modal && { id: 'modal', label: 'Harga modal berubah', value: angka(modal.length), sub: `${angka(modalUp.length)} naik · 30 hari terakhir`, tone: modalUp.length ? 'gold' : '' },
  ].filter(Boolean).map((item) => ({
    ...item,
    tone: item.id === 'omzet' ? styles.salesTile : item.tone,
    icon: KPI_ICONS[item.id] ? <span className={styles.kpiIcon}><NavIcon name={KPI_ICONS[item.id]} size={22} /></span> : null,
  }));
  // Denyut bisnis: periode terpilih dibanding rata-rata 30 hari sebelumnya (±15% = normal)
  const pulse = P && B ? [
    pulseLine(`Penjualan ${per2}`, P.omzet, B.omzet / 30, per.days, rp),
    pulseLine(`Transaksi ${per2}`, P.trx, B.trx / 30, per.days, angka),
    mPct(P) != null && mPct(B) != null && { tone: mPct(P) < mPct(B) - 3 ? 'warn' : mPct(P) > mPct(B) + 3 ? 'good' : 'info', text: `Margin ${per2} ${mPct(P)}% (30 hari sebelumnya ${mPct(B)}%)${mPct(P) < mPct(B) - 3 ? ' — periksa harga modal & diskon' : ''}`, href: mPct(P) < mPct(B) - 3 ? '/laporan-toko' : undefined },
  ] : [];

  const alerts = [
    stockArea && !d.ps && { tone: 'warn', text: 'Stok belum bisa dimuat. Buka Persediaan untuk memeriksa data.', href: has('/barang') ? '/barang' : undefined },
    fin && prefs.period === 'hari' && !P && (!d.sales || !d.rets) && { tone: 'warn', text: 'Penjualan hari ini belum bisa dimuat.', href: has('/penjualan') ? '/penjualan' : undefined },
    noCost.length > 0 && fin && { tone: 'warn', text: `${angka(noCost.length)} barang belum punya harga modal — laba terlihat terlalu tinggi`, href: '/barang' },
    po > 0 && { tone: 'info', text: `${angka(po)} belanja ke supplier menunggu diterima`, href: '/belanja' },
    retur > 0 && { tone: 'info', text: `Retur hari ini ${rp(retur)}`, href: '/penjualan' },
    piutLewat.length > 0 && { tone: 'bad', text: `Piutang lewat jatuh tempo ${rp(piutLewatTotal)} (${angka(piutLewat.length)} transaksi)`, href: '/kas?tab=kasbon' },
    modalUp.length > 0 && { tone: 'warn', text: `${angka(modalUp.length)} barang naik harga modal 30 hari terakhir — cek harga jual & margin`, href: '/barang' },
    diam && diam.length > 0 && { tone: 'info', text: `${angka(diam.length)} barang tidak terjual ≥ 90 hari`, href: '/barang?tab=kesehatan' },
  ].filter(Boolean);

  const widgets = [
    { id: 'pintasan', title: 'Operasional', size: 'full', node: shortcuts.length > 0 && (
      <Widget title="Operasional">
        <nav className={styles.shortcuts} aria-label="Operasional toko">
          {shortcuts.map(([href, label]) => <Link key={href} className={styles.shortcut} href={href}>
            <span className={styles.shortcutIcon}><NavIcon name={href} size={18} /></span>
            {label}
          </Link>)}
        </nav>
      </Widget>
    ) },
    { id: 'kpi', title: 'Angka utama', size: 'full', node: <section className={styles.metrics}>
      <PageHeader title="Dashboard" help={<PageHelp page="toko" />} desc={`${kos.name} · ${tgl(today())}`} />
      <KpiGrid items={kpiItems} prefs={prefs} />
    </section> },
    { id: 'mulai', title: 'Mulai di sini', size: 'full', node: d.ps && ps.length === 0 && has('/barang') && (
      <Widget title="Mulai di sini"><span className="small muted">Masukkan barang yang dijual beserta satuan, harga eceran/grosir, dan stoknya. Semua angka dashboard dihitung dari transaksi nyata.</span><Link href="/barang?baru=1"><button className="primary">+ Tambah barang pertama</button></Link></Widget>
    ) },
    { id: 'tren', title: 'Tren penjualan', size: 'wide', node: days && (
      <Widget title="Tren penjualan 7 hari terakhir" action={has('/laporan-toko') && <Link href="/laporan-toko">Lihat detail →</Link>}>
        <DayColumns data={days} title="Penjualan 7 hari terakhir" />
      </Widget>
    ) },
    { id: 'perhatian', title: 'Perlu perhatian', size: 'normal', node: <Widget title="Perlu perhatian" action={has('/barang') && low.length > 0 && <Link href="/barang">Lihat stok →</Link>}>
      <StockMinusList rows={negative.rows || []} failed={negative.failed} canOpen={has('/barang')} preview />
      {stockArea && low.length > 0 && <ul className="alerts">
        {low.slice(0, 3).map((product) => <li key={product.id}><Link href="/barang">
          <ProductThumb key={thumbs[product.id]} path={thumbs[product.id]} />
          <span className="alerts-t">{product.name}</span>
          <span className={styles.stockLabel}>Stok {angka(product.stock)} {product.base_unit}</span>
        </Link></li>)}
      </ul>}
      {(alerts.length > 0 || (!negative.failed && !negative.rows?.length && (!stockArea || !low.length))) && <Alerts items={alerts} />}
    </Widget> },
    { id: 'denyut', title: 'Denyut bisnis', size: 'normal', node: pulse.some(Boolean) && <Pulse items={pulse} /> },
    { id: 'terlaris', title: 'Barang terlaris', size: 'normal', node: pr?.r && (
      <Widget title={`Produk terlaris ${per2}`} action={has('/laporan-toko') && <Link href="/laporan-toko">Lihat semua →</Link>}>
        {(pr.r.produk || []).length ? <ol className="alerts">{pr.r.produk.slice(0, 3).map((product, index) => (
          <li key={product.product_id || product.name}><div>
            <span className={styles.rank}>{index + 1}</span>
            <ProductThumb key={thumbs[product.product_id]} path={thumbs[product.product_id]} />
            <span className="alerts-t"><b>{product.name}</b><span className="small muted">{rp(product.omzet)}</span></span>
          </div></li>
        ))}</ol> : <p className="small muted">Belum ada penjualan pada periode ini.</p>}
      </Widget>
    ) },
    { id: 'transaksi', title: 'Transaksi terakhir', size: 'wide', node: recent && (
      <Widget title="Transaksi terakhir" action={has('/penjualan') && <Link href="/penjualan">Lihat semua</Link>}>
        {recent.length === 0 ? <p className="small muted" style={{ margin: 0 }}>Belum ada transaksi.</p> : (
          <ul className="alerts">{recent.map((s) => (
            <li key={s.id}><Link href={`/struk/${s.id}`}>
              <span className="alerts-t"><b className="small">{s.number}{s.status === 'batal' && <span className="chip void" style={{ marginLeft: 6 }}>Batal</span>}</b><span className="small muted">{tglShort(String(s.sold_at).slice(0, 10))} {jam(s.sold_at)} · {payLabel(s)}</span></span>
              <b className="small" style={{ whiteSpace: 'nowrap', textDecoration: s.status === 'batal' ? 'line-through' : 'none' }}>{rp(s.total)}</b>
            </Link></li>
          ))}</ul>
        )}
      </Widget>
    ) },
    { id: 'menipis', title: 'Stok menipis', size: 'normal', node: stockArea && low.length > 0 && (
      <Widget title="Stok menipis" action={<Link href="/barang">Barang & stok</Link>}>
        <ul className="alerts">{low.slice(0, 6).map((p) => (
          <li key={p.id}><div><span className="alerts-t small">{p.name}</span><span className="small" style={{ whiteSpace: 'nowrap', color: 'var(--bad)' }}>{angka(p.stock)} / min {angka(p.min_stock)} {p.base_unit}</span></div></li>
        ))}</ul>
        {stockArea && has('/belanja') && <Link href="/belanja" className="small">Buka Belanja (ada Saran belanja) →</Link>}
      </Widget>
    ) },
    { id: 'modal', title: 'Harga modal berubah', size: 'normal', node: modal && modal.length > 0 && (
      <Widget title="Harga modal berubah (30 hari)" action={<Link href="/barang">Barang</Link>}>
        <ul className="alerts">{modal.slice(0, 6).map((x) => (
          <li key={x.product_id}><div><span className="alerts-t small">{x.name}<span className="muted"> · {rp(x.old)} → {rp(x.new)} per {x.unit}</span></span>
            <b className="small" style={{ whiteSpace: 'nowrap', color: N(x.pct) > 0 ? 'var(--bad)' : 'var(--good)' }}>{N(x.pct) > 0 ? '+' : ''}{String(x.pct).replace('.', ',')}%</b></div></li>
        ))}</ul>
        <span className="small muted">Dari dua penerimaan barang terakhir. Harga jual tidak berubah otomatis.</span>
      </Widget>
    ) },
    { id: 'piutang', title: 'Piutang pelanggan', size: 'normal', node: piut && piut.length > 0 && (() => {
      const by = new Map(); for (const x of piut) { const c = by.get(x.contact_id) || { n: 0, open: 0, late: 0 }; c.n += 1; c.open += N(x.open_amount); if (x.due_date && String(x.due_date) < today()) c.late += N(x.open_amount); by.set(x.contact_id, c); }
      const top = [...by.entries()].sort((a, b) => b[1].late - a[1].late || b[1].open - a[1].open).slice(0, 6);
      return (
        <Widget title="Piutang pelanggan" action={has('/kas') && <Link href="/kas?tab=kasbon">Kasbon</Link>}>
          <div className="row" style={{ gap: 10, alignItems: 'baseline' }}><b style={{ fontSize: 20 }}>{rp(piutTotal)}</b>{piutLewatTotal > 0 && <span className="small" style={{ color: 'var(--bad)' }}>lewat tempo {rp(piutLewatTotal)}</span>}</div>
          <ul className="alerts">{top.map(([cid, c]) => <li key={cid}><Link href="/kas?tab=kasbon"><span className="alerts-t small">{ex.nama?.[cid] || 'Pelanggan'}<span className="muted"> · {c.n} transaksi</span>{c.late > 0 ? ` · ${rp(c.late)} lewat tempo` : ''}</span><b className="small">{rp(c.open)}</b></Link></li>)}</ul>
        </Widget>
      );
    })() },
    { id: 'diam', title: 'Barang tidak bergerak', size: 'normal', node: diam && diam.length > 0 && (
      <Widget title="Barang tidak bergerak" action={<Link href="/barang?tab=kesehatan">Kesehatan stok</Link>}>
        <ul className="alerts">{diam.slice(0, 6).map((x) => <li key={x.product_id}><div><span className="alerts-t small">{x.name}<span className="muted"> · stok {angka(x.stock)} {x.base_unit}</span></span><b className="small" style={{ whiteSpace: 'nowrap' }}>{rp(x.value)}</b></div></li>)}</ul>
        <span className="small muted">Tidak terjual 90 hari atau lebih. Pertimbangkan promo atau berhenti belanja barang ini.</span>
      </Widget>
    ) },
    { id: 'aktivitas', title: 'Aktivitas terbaru', size: 'normal', node: act !== null && (
      <Widget title="Aktivitas terbaru" action={has('/aktivitas') && <Link href="/aktivitas">Riwayat</Link>}>{act === undefined ? <Loading rows={3} /> : <ActivityList rows={act} />}</Widget>
    ) },
    { id: 'aksi', title: 'Aksi cepat', size: 'normal', node: quickActions(kos).length > 0 && <Widget title="Aksi cepat"><QuickActions kos={kos} /></Widget> },
  ];

  return (
    <div className={`${styles.home} ${prefs.pref.order?.length ? '' : styles.defaultLayout}`}>
      <Dashboard id="toko" kosId={kosId} widgets={widgets} prefs={prefs} kpis={KPIS.toko.map(([id, label]) => ({ id, label }))} period={fin} header={(atur, periode) => <>
        <section className={styles.masthead} aria-label="Sambutan Beranda Toko">
          <div className={styles.greeting}>
            <PageHeader title={`${greeting()}${name ? `, ${name}` : ''}`} desc={`Ringkasan bisnis ${kos.name}`} />
          </div>
          <img className={styles.mascot} src="/retail/prasara-maskot.webp" width="600" height="400" alt="" />
          <div className={styles.controls}>{periode}{atur}</div>
        </section>
        <CrmHint />
        <RecHint />
      </>} />
      {canArea(kos, 'settings') && <Persiapan kos={kos} />}
    </div>
  );
}
