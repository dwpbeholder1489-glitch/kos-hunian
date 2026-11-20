'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { useKos } from '@/components/KosProvider';
import { RecHint } from '@/components/Rekomendasi';
import CrmHint from '@/components/CrmHint';
import PageHelp from '@/components/PageHelp';
import { PageHeader } from '@/components/Page';
import Dashboard, { Widget, Alerts, QuickActions, ActivityList, useActivity } from '@/components/Dashboard';
import { DayColumns, BarList } from '@/components/Charts';
import { Tile, Loading } from '@/components/ui';
import { rp, angka, today, tgl, tglShort, bulan, thisMonth, monthEnd, addMonthsYm } from '@/lib/format';
import { isLow, payLabel, jam } from '@/lib/retail';
import { canArea, tabsFor } from '@/lib/business';
import { quickActions } from '@/lib/menu';

const N = (x) => Number(x) || 0;
const delta = (a, b) => (b ? Math.round(((a - b) / Math.abs(b)) * 100) : null);

// Dashboard toko (Unified Design System §13): angka hari ini, bulan berjalan vs bulan lalu, tren harian,
// barang terlaris, transaksi terakhir, peringatan berbasis aturan, stok menipis, aktivitas, aksi cepat.
// Semua angka dari data nyata: products/sales (RLS) dan retail_report (area keuangan) — sama dengan Laporan toko.
export default function Toko() {
  const { kos, kosId, ver } = useKos();
  const fin = canArea(kos, 'finance');
  const stockArea = canArea(kos, 'stock');
  const has = (h) => tabsFor(kos).some(([x]) => x === h);
  const [d, setD] = useState(null);
  const [m, setM] = useState(null);        // { r, prev } laporan bulan ini & bulan lalu (keuangan saja)
  const [recent, setRecent] = useState(null);
  const [po, setPo] = useState(null);      // belanja menunggu diterima
  const act = useActivity(kosId, ver);
  useEffect(() => {
    Promise.all([
      supabase.from('products').select('id,name,stock,cost,min_stock,active,base_unit').eq('kos_id', kosId),
      supabase.from('sales').select('total,cost_total,pay_method,status').eq('kos_id', kosId).eq('sale_date', today()),
      supabase.from('sale_returns').select('total,cost_total').eq('kos_id', kosId).eq('return_date', today()),
    ]).then(([p, s, r]) => setD({ ps: (p.data || []).filter((x) => x.active), sales: (s.data || []).filter((x) => x.status === 'selesai'), rets: r.data || [] }));
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
  if (!d) return <Loading rows={5} />;

  const { ps, sales, rets } = d;
  const retur = rets.reduce((a, r) => a + N(r.total), 0);
  const low = ps.filter(isLow);
  const noCost = ps.filter((p) => !(N(p.cost) > 0));
  const omzet = sales.reduce((a, s) => a + N(s.total), 0) - retur;
  const laba = sales.reduce((a, s) => a + N(s.total) - N(s.cost_total), 0) - rets.reduce((a, r) => a + N(r.total) - N(r.cost_total), 0);
  const ym = thisMonth();
  // bulan berjalan dibanding bulan lalu PENUH (ditulis jelas di keterangan)
  const mo = m && { omzet: N(m.r.omzet), trx: N(m.r.trx), prev: N(m.prev.omzet), prevTrx: N(m.prev.trx) };
  const days = m ? (() => {
    const map = new Map((m.r.harian || []).map((h) => [String(h.d).slice(0, 10), h]));
    const last = Number(today().slice(8, 10));
    return Array.from({ length: last }, (_, i) => {
      const k = `${ym}-${String(i + 1).padStart(2, '0')}`; const h = map.get(k);
      return { key: k, label: tgl(k), short: String(i + 1), value: N(h?.omzet), note: h ? `${angka(h.trx)} transaksi` : 'tidak ada transaksi' };
    });
  })() : null;
  const dl = mo ? delta(mo.omzet, mo.prev) : null;

  const alerts = [
    low.length > 0 && { tone: 'bad', text: `${angka(low.length)} barang di bawah stok minimum`, href: '/barang' },
    noCost.length > 0 && fin && { tone: 'warn', text: `${angka(noCost.length)} barang belum punya harga modal — laba terlihat terlalu tinggi`, href: '/barang' },
    po > 0 && { tone: 'info', text: `${angka(po)} belanja ke supplier menunggu diterima`, href: '/belanja' },
    retur > 0 && { tone: 'info', text: `Retur hari ini ${rp(retur)}`, href: '/penjualan' },
  ].filter(Boolean);

  const widgets = [
    { id: 'kpi', title: 'Angka utama', size: 'full', node: (
      <div className="grid">
        <Tile label="Penjualan hari ini" value={rp(omzet)} sub={`${angka(sales.length)} transaksi${retur ? ` · retur ${rp(retur)}` : ''}`} />
        <Tile label="Laba kotor hari ini" value={rp(laba)} sub="penjualan − modal barang" />
        {mo && <Tile label={`Penjualan ${bulan(ym)}`} value={rp(mo.omzet)} sub={<>{dl != null && <span className={dl >= 0 ? 'up' : 'down'}>{dl >= 0 ? '↑ +' : '↓ '}{dl}%</span>} {dl != null ? 'dari bulan lalu (penuh)' : `${angka(mo.trx)} transaksi`}</>} />}
        <Tile label="Nilai stok" value={rp(ps.reduce((s, p) => s + Math.max(0, N(p.stock)) * N(p.cost), 0))} sub={`${angka(ps.length)} barang · harga modal`} />
        <Tile label="Stok menipis" value={angka(low.length)} tone={low.length ? 'bad' : ''} sub={low.length ? 'perlu belanja ulang' : 'aman'} />
      </div>
    ) },
    { id: 'mulai', title: 'Mulai di sini', size: 'full', node: ps.length === 0 && (
      <Widget title="Mulai di sini"><span className="small muted">Masukkan barang yang dijual beserta satuan, harga eceran/grosir, dan stoknya. Semua angka dashboard dihitung dari transaksi nyata.</span><Link href="/barang?baru=1"><button className="primary">+ Tambah barang pertama</button></Link></Widget>
    ) },
    { id: 'tren', title: 'Tren penjualan', size: 'wide', node: days && mo && (
      <Widget title={`Tren penjualan ${bulan(ym)}`} action={has('/laporan-toko') && <Link href="/laporan-toko">Laporan lengkap</Link>}>
        <div className="row" style={{ gap: 10, alignItems: 'baseline' }}><b style={{ fontSize: 22 }}>{rp(mo.omzet)}</b><span className="small muted">{angka(mo.trx)} transaksi sampai hari ini</span></div>
        {mo.trx > 0 ? <DayColumns data={days} title="Penjualan harian bulan ini" /> : <p className="small muted" style={{ margin: 0 }}>Belum ada penjualan bulan ini.</p>}
      </Widget>
    ) },
    { id: 'terlaris', title: 'Barang terlaris', size: 'normal', node: m && (
      <Widget title="Barang terlaris bulan ini" action={has('/laporan-toko') && <Link href="/laporan-toko">Semua</Link>}>
        {(m.r.produk || []).length ? <BarList limit={5} items={m.r.produk.map((p) => ({ label: p.name, value: N(p.omzet) }))} /> : <p className="small muted" style={{ margin: 0 }}>Belum ada penjualan bulan ini.</p>}
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
    { id: 'perhatian', title: 'Perlu perhatian', size: 'normal', node: <Widget title="Perlu perhatian"><Alerts items={alerts} /></Widget> },
    { id: 'menipis', title: 'Stok menipis', size: 'normal', node: low.length > 0 && (
      <Widget title="Stok menipis" action={<Link href="/barang">Barang & stok</Link>}>
        <ul className="alerts">{low.sort((a, b) => N(a.stock) / Math.max(1, N(a.min_stock)) - N(b.stock) / Math.max(1, N(b.min_stock))).slice(0, 6).map((p) => (
          <li key={p.id}><div><span className="alerts-t small">{p.name}</span><span className="small" style={{ whiteSpace: 'nowrap', color: 'var(--bad)' }}>{angka(p.stock)} / min {angka(p.min_stock)} {p.base_unit}</span></div></li>
        ))}</ul>
        {stockArea && has('/belanja') && <Link href="/belanja" className="small">Buka Belanja (ada Saran belanja) →</Link>}
      </Widget>
    ) },
    { id: 'aktivitas', title: 'Aktivitas terbaru', size: 'normal', node: act !== null && (
      <Widget title="Aktivitas terbaru" action={has('/aktivitas') && <Link href="/aktivitas">Riwayat</Link>}>{act === undefined ? <Loading rows={3} /> : <ActivityList rows={act} />}</Widget>
    ) },
    { id: 'aksi', title: 'Aksi cepat', size: 'normal', node: quickActions(kos).length > 0 && <Widget title="Aksi cepat"><QuickActions kos={kos} /></Widget> },
  ];

  return (
    <Dashboard id="toko" kosId={kosId} widgets={widgets} header={(atur) => <>
      <PageHeader title="Dashboard" help={<PageHelp page="toko" />} desc={`Ringkasan performa dan aktivitas ${kos.name} · ${tgl(today())}`}
        actions={<>{atur}{ps.length > 0 && has('/kasir') && <Link href="/kasir"><button className="primary">Buka Kasir</button></Link>}</>} />
      <CrmHint />
      <RecHint />
    </>} />
  );
}
