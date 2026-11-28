'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { useKos } from '@/components/KosProvider';
import PageHelp from '@/components/PageHelp';
import { Loading } from '@/components/ui';
import { rp, angka, today, errMsg } from '@/lib/format';
import { RecHint } from '@/components/Rekomendasi';
import CrmHint from '@/components/CrmHint';
import { sisa, late, jakartaDate, hari, stageLabel, STATUS, waitPickup, onTheWay, terms } from '@/lib/jasa';
import FnbHome from '@/components/FnbHome';
import { isKuliner, moduleOn, canArea, tabsFor } from '@/lib/business';
import { PageHeader } from '@/components/Page';
import Dashboard, { Widget, Alerts, QuickActions, ActivityList, useActivity, useDashPrefs, KpiGrid, Pulse } from '@/components/Dashboard';
import { KPIS, periodRange, baselineRange, pulseLine } from '@/lib/dashboards';
import { isLow } from '@/lib/retail';
import { DayColumns, BarList } from '@/components/Charts';
import { quickActions } from '@/lib/menu';
import { tgl, bulan, thisMonth } from '@/lib/format';

// Dashboard bisnis jasa: antrean per tahap, yang harus dikerjakan hari ini, uang hari ini
export default function JasaHome() {
  const { kos, kosId } = useKos();
  const [detail, setDetail] = useState(false);
  if (!isKuliner(kos)) return <ServiceDashboard />;
  return detail ? <><button onClick={() => setDetail(false)}>Kembali ke beranda kuliner</button><ServiceDashboard /></> : <FnbHome key={kosId} onDetail={() => setDetail(true)} />;
}
function ServiceDashboard() {
  const { kos, kosId, ver } = useKos();
  const [d, setD] = useState(null);
  const [r, setR] = useState(null);
  const [s, setS] = useState(null);
  const [err, setErr] = useState(null);
  const [rv, setRv] = useState(null); // kuliner: reservasi hari ini & permintaan
  const [rm, setRm] = useState(null); // laporan bulan berjalan (tren & layanan teratas)
  const feed = useActivity(kosId, ver);
  const prefs = useDashPrefs('jasa');
  const per = periodRange(prefs.period), base = baselineRange(prefs.period);
  const [pr, setPr] = useState(null); // { r, b, fc } laporan periode, 30 hari sebelumnya, food cost (kuliner)
  const [bahan, setBahan] = useState(null);
  useEffect(() => {
    const kul = terms(kos).kul;
    Promise.all([
      supabase.rpc('svc_report', { p_kos: kosId, p_from: per.from, p_to: per.to }),
      supabase.rpc('svc_report', { p_kos: kosId, p_from: base.from, p_to: base.to }),
      kul && canArea(kos, 'finance') && moduleOn(kos, 'j_resep') ? supabase.rpc('food_cost_report', { p_kos: kosId, p_from: per.from, p_to: per.to }) : Promise.resolve({ data: null }),
    ]).then(([a, b, f]) => setPr({ r: a.error ? null : a.data, b: b.error ? null : b.data, fc: f?.error ? null : f?.data || null }));
  }, [kosId, ver, prefs.period]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!canArea(kos, 'stock') || !moduleOn(kos, 'j_bahan')) return;
    supabase.from('products').select('id,name,stock,min_stock,base_unit,active').eq('kos_id', kosId).eq('active', true).then(({ data, error }) => setBahan(error ? null : (data || []).filter(isLow)));
  }, [kosId, ver]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (terms(kos).kul && canArea(kos, 'sell')) {
      const d0 = new Date(new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Jakarta' }) + 'T00:00:00+07:00');
      supabase.from('kul_reservations').select('id,status,starts_at,party,name,table_no').eq('kos_id', kosId).in('status', ['permintaan', 'dipesan', 'datang']).gte('starts_at', d0.toISOString()).order('starts_at').limit(200)
        .then(({ data }) => setRv(data || []));
    }
    supabase.rpc('svc_board', { p_kos: kosId }).then(({ data, error }) => (error ? setErr(errMsg(error)) : setD(data)));
    supabase.rpc('svc_report', { p_kos: kosId, p_from: today(), p_to: today() }).then(({ data }) => setR(data || null));
    supabase.rpc('svc_dashboard', { p_kos: kosId }).then(({ data }) => setS(data || null));
    supabase.rpc('svc_report', { p_kos: kosId, p_from: thisMonth() + '-01', p_to: today() }).then(({ data, error }) => setRm(error ? null : data || null));
  }, [kosId, ver]);
  if (err) return <div className="notice bad">{/svc_board/.test(err) ? 'Database sedang diperbarui. Coba lagi beberapa menit lagi.' : err}</div>;
  if (!d) return <Loading />;
  const t = today();
  const act = d.orders.filter((o) => !['selesai', 'batal'].includes(o.status));
  const lateL = act.filter(late);
  const dueToday = act.filter((o) => o.due_at && jakartaDate(o.due_at) === t && !late(o) && o.status !== 'siap');
  const ready = act.filter((o) => o.status === 'siap');
  const antar = ready.filter((o) => o.deliver);
  const jemput = act.filter(waitPickup);
  const logi = moduleOn(kos, 'j_antar');
  const T = terms(kos);
  const jp = logi && !T.kul; // kuliner tidak punya penjemputan
  const comp = act.reduce((a, o) => a + Number(o.open_complaints || 0), 0) + d.orders.filter((o) => ['selesai'].includes(o.status)).reduce((a, o) => a + Number(o.open_complaints || 0), 0);
  const List = ({ title, rows, tone }) => rows.length > 0 && (
    <section className="panel wg">
      <div className="wg-h"><h3>{title} ({rows.length})</h3><Link href="/pesanan">Pesanan</Link></div>
      <div className="list">{rows.slice(0, 6).map((o) => (
        <Link key={o.id} href="/pesanan" className="li" style={{ textDecoration: 'none', color: 'inherit' }}>
          <span className="small"><b>{o.customer_name}</b> · {o.number}<br /><span className="muted">{o.status === 'siap' ? (o.address || stageLabel(o)) : `janji ${hari(o.due_at)}`}</span></span>
          <span className={'chip ' + (tone || STATUS[o.status]?.[1] || '')}>{stageLabel(o, true)}</span>
        </Link>
      ))}</div>
      {rows.length > 6 && <Link href="/pesanan" className="small">Lihat semua →</Link>}
    </section>
  );

  const has = (h) => tabsFor(kos).some(([x]) => x === h);
  const ym = thisMonth();
  const days = d.money && rm ? (() => {
    const map = new Map((rm.harian || []).map((h) => [String(h.d).slice(0, 10), h]));
    const last = Number(t.slice(8, 10));
    return Array.from({ length: last }, (_, i) => { const k = `${ym}-${String(i + 1).padStart(2, '0')}`; const h = map.get(k); return { key: k, label: tgl(k), short: String(i + 1), value: Number(h?.pendapatan) || 0, note: h ? `${angka(h.n)} pesanan diserahkan` : 'tidak ada pesanan diserahkan' }; });
  })() : null;
  const alerts = [
    lateL.length > 0 && { tone: 'bad', text: `${angka(lateL.length)} pesanan lewat janji selesai`, href: '/pesanan' },
    comp > 0 && { tone: 'bad', text: `${angka(comp)} keluhan pelanggan belum selesai`, href: '/pesanan' },
    Number(s?.permintaan) > 0 && d.money && { tone: 'info', text: `${angka(s.permintaan)} pesanan dari halaman bisnis menunggu konfirmasi`, href: '/pesanan' },
    rv && rv.some((x) => x.status === 'permintaan') && { tone: 'info', text: `${angka(rv.filter((x) => x.status === 'permintaan').length)} permintaan reservasi menunggu konfirmasi`, href: '/meja?tab=reservasi' },
    dueToday.length > 0 && { tone: 'warn', text: `${angka(dueToday.length)} pesanan harus selesai hari ini`, href: '/pesanan' },
    d.money && s && Number(s.tertunda) > 0 && { tone: 'warn', text: `${angka(s.tertunda_n)} pesanan belum lunas · ${rp(s.tertunda)}`, href: '/pesanan' },
  ].filter(Boolean);
  // Angka periode terpilih (svc_report — sama dengan Laporan jasa)
  const R = pr?.r, Bq = pr?.b, fc = pr?.fc;
  const N = (x) => Number(x) || 0;
  const tepat = R && N(R.selesai) > 0 ? Math.round((N(R.tepat_waktu) / N(R.selesai)) * 100) : null;
  const tepatB = Bq && N(Bq.selesai) > 0 ? Math.round((N(Bq.tepat_waktu) / N(Bq.selesai)) * 100) : null;
  const fcPct = fc && N(fc.revenue) > 0 ? Math.round((N(fc.cost) / N(fc.revenue)) * 1000) / 10 : null;
  const pl = per.label;
  const kpiItems = [
    R ? { id: 'masuk', label: `Pesanan masuk ${pl}`, value: angka(R.masuk), sub: `${angka(R.selesai)} diserahkan` } : { id: 'masuk', label: 'Pesanan baru hari ini', value: angka(s?.baru_hari_ini ?? 0), sub: `${angka(s?.selesai_hari_ini ?? 0)} selesai hari ini` },
    R && { id: 'selesai', label: `Diserahkan ${pl}`, value: angka(R.selesai) },
    tepat != null && { id: 'tepat', label: `Tepat waktu ${pl}`, value: `${tepat}%`, sub: tepatB != null ? `30 hari sebelumnya ${tepatB}%` : 'siap sebelum janji', tone: tepat < 80 ? 'bad' : '' },
    T.kul && { id: 'dapur', label: 'Di dapur', value: angka(act.filter((o) => ['diterima', 'proses'].includes(o.status)).length), sub: 'belum siap' },
    !T.kul && { id: 'proses', label: 'Sedang diproses', value: angka(act.filter((o) => o.status === 'proses').length), sub: `${angka(act.filter((o) => o.status === 'diterima' && !waitPickup(o)).length)} belum diproses` },
    { id: 'siap', label: T.kul ? 'Siap disajikan / diambil' : 'Siap diambil', value: angka(s?.siap_diambil ?? ready.length) },
    jp && { id: 'jemput', label: 'Menunggu penjemputan', value: angka(s?.menunggu_jemput ?? jemput.length), tone: jemput.length ? 'gold' : undefined },
    logi && { id: 'antar', label: 'Dalam pengantaran', value: angka(s?.dalam_pengantaran ?? 0), sub: `${angka(s?.siap_diantar ?? 0)} siap diantar` },
    { id: 'terlambat', label: 'Terlambat', value: angka(lateL.length), tone: lateL.length ? 'bad' : undefined, sub: 'lewat janji selesai' },
    d.money && (R ? { id: 'pendapatan', label: `Pendapatan ${pl}`, value: rp(R.pendapatan), sub: 'dari pesanan diserahkan' } : s && { id: 'pendapatan', label: 'Pendapatan', value: rp(s.pendapatan_hari_ini), sub: `bulan ini ${rp(s.pendapatan_bulan_ini)}` }),
    d.money && (R || r) && { id: 'uang_masuk', label: `Uang masuk ${R ? pl : 'hari ini'}`, value: rp((R || r).uang_masuk), sub: 'termasuk DP' },
    d.money && s && { id: 'tertunda', label: 'Belum lunas', value: rp(s.tertunda), sub: `${angka(s.tertunda_n)} pesanan`, tone: Number(s.tertunda) > 0 ? 'bad' : undefined },
    fcPct != null && { id: 'food_cost', label: `Food cost ${pl}`, value: `${String(fcPct).replace('.', ',')}%`, sub: `bahan ${rp(fc.cost)} dari ${rp(fc.revenue)}`, tone: fcPct > 40 ? 'bad' : fcPct > 35 ? 'gold' : '' },
  ];
  const pulse = d.money && R && Bq ? [
    pulseLine(`Pendapatan ${pl}`, N(R.pendapatan), N(Bq.pendapatan) / 30, per.days, rp),
    pulseLine(`Pesanan masuk ${pl}`, N(R.masuk), N(Bq.masuk) / 30, per.days, angka),
    tepat != null && tepatB != null && { tone: tepat < tepatB - 5 ? 'warn' : tepat > tepatB + 5 ? 'good' : 'info', text: `Ketepatan waktu ${pl} ${tepat}% (30 hari sebelumnya ${tepatB}%)` },
  ] : [];
  if (fcPct != null && fcPct > 40) alerts.push({ tone: 'warn', text: `Food cost ${pl} ${String(fcPct).replace('.', ',')}% — di atas 40%, periksa harga menu & takaran resep`, href: '/resep' });
  if (bahan && bahan.length) alerts.push({ tone: 'bad', text: `${angka(bahan.length)} ${T.kul ? 'bahan baku' : 'bahan'} di bawah stok minimum`, href: '/barang' });
  if (tepat != null && tepat < 80) alerts.push({ tone: 'warn', text: `Hanya ${tepat}% pesanan ${pl} siap tepat waktu`, href: '/laporan-jasa' });

  const widgets = [
    { id: 'denyut', title: 'Denyut bisnis', size: 'full', node: pulse.some(Boolean) && <Pulse items={pulse} /> },
    { id: 'mulai', title: 'Mulai di sini', size: 'full', node: s && !s.any && (<>
      <section className="panel">
        <h3>Belum ada pesanan</h3>
        <span className="small muted">Semua angka di dashboard ini dihitung dari pesanan nyata — tidak ada angka contoh. Mulai dari:</span>
        <div className="list">
          {canArea(kos, 'settings') && <Link href="/layanan" className="li" style={{ textDecoration: 'none', color: 'inherit' }}><span className="small">1. Cek {T.kul ? 'menu, harga' : 'layanan, harga'}, dan tahap proses</span><span className="small">→</span></Link>}
          {logi && canArea(kos, 'settings') && <Link href="/antar" className="li" style={{ textDecoration: 'none', color: 'inherit' }}><span className="small">2. Atur wilayah, biaya & jam {T.kul ? 'antar' : 'antar jemput'}</span><span className="small">→</span></Link>}
          {d.money && <Link href="/pesanan?baru=1" className="li" style={{ textDecoration: 'none', color: 'inherit' }}><span className="small">3. Catat pesanan pertama saat pelanggan datang</span><span className="small">→</span></Link>}
          {canArea(kos, 'settings') && moduleOn(kos, 'u_halaman') && <Link href="/halaman" className="li" style={{ textDecoration: 'none', color: 'inherit' }}><span className="small">4. Terbitkan halaman bisnis untuk pelanggan</span><span className="small">→</span></Link>}
        </div>
      </section>
    </>) },
    { id: 'reservasi', title: 'Reservasi hari ini', size: 'full', node: rv && (rv.some((x) => x.status === 'permintaan') || rv.some((x) => jakartaDate(x.starts_at) === t)) && (<>
      <Link href="/meja?tab=reservasi" className="notice" style={{ textDecoration: 'none', color: 'inherit', display: 'block' }}>
        <b>Reservasi hari ini: {rv.filter((x) => jakartaDate(x.starts_at) === t && x.status !== 'permintaan').length}</b>{rv.filter((x) => jakartaDate(x.starts_at) === t && x.status !== 'permintaan').slice(0, 3).map((x) => ` · ${new Date(x.starts_at).toLocaleTimeString('id-ID', { timeZone: 'Asia/Jakarta', hour: '2-digit', minute: '2-digit' })} ${x.name} (${x.party})`).join('')}
        {rv.some((x) => x.status === 'permintaan') && <><br />{rv.filter((x) => x.status === 'permintaan').length} permintaan reservasi menunggu konfirmasi</>} →</Link>
    </>) },
    { id: 'kpi', title: 'Angka utama', size: 'full', node: <KpiGrid items={kpiItems} prefs={prefs} /> },
    { id: 'tren', title: 'Tren pendapatan', size: 'wide', node: days && (
      <Widget title={`Pendapatan ${bulan(ym)}`} action={has('/laporan-jasa') && <Link href="/laporan-jasa">Laporan lengkap</Link>}>
        <div className="row" style={{ gap: 10, alignItems: 'baseline' }}><b style={{ fontSize: 22 }}>{rp(rm.pendapatan)}</b><span className="small muted">dari {angka(rm.selesai)} pesanan diserahkan sampai hari ini</span></div>
        {Number(rm.selesai) > 0 ? <DayColumns data={days} title="Pendapatan harian bulan ini" /> : <p className="small muted" style={{ margin: 0 }}>Belum ada pesanan diserahkan bulan ini.</p>}
      </Widget>
    ) },
    { id: 'perhatian', title: 'Perlu perhatian', size: 'normal', node: <Widget title="Perlu perhatian"><Alerts items={alerts} /></Widget> },
    { id: 'ringkasan', title: 'Ringkasan pesanan', size: 'normal', node: (<>
      <section className="panel wg">
        <h3>Ringkasan pesanan</h3>
        <div className="list">
          {jp && <div className="li"><span className="small">Menunggu penjemputan</span><b className="small">{angka(jemput.length)}</b></div>}
          <div className="li"><span className="small">{T.kul ? 'Baru masuk (belum dimasak)' : 'Diterima (belum diproses)'}</span><b className="small">{angka(act.filter((o) => o.status === 'diterima' && !waitPickup(o)).length)}</b></div>
          {d.stages.map((x) => <div className="li" key={x.id}><span className="small">Sedang {x.name.toLowerCase()}</span><b className="small">{angka(act.filter((o) => o.stage_id === x.id && o.status === 'proses').length)}</b></div>)}
          <div className="li"><span className="small">{T.kul ? 'Siap disajikan / diambil' : 'Siap diambil'}</span><b className="small">{angka(ready.filter((o) => !o.deliver).length)}</b></div>
          {logi && <div className="li"><span className="small">Siap diantar</span><b className="small">{angka(ready.filter((o) => o.deliver && !onTheWay(o)).length)}</b></div>}
          {logi && <div className="li"><span className="small">Dalam pengantaran</span><b className="small">{angka(ready.filter(onTheWay).length)}</b></div>}
          <div className="li"><span className="small">Selesai hari ini</span><b className="small">{angka(s?.selesai_hari_ini ?? 0)}</b></div>
        </div>
        <div className="row"><Link href="/pesanan" className="small">Buka papan pesanan →</Link>{T.kul && <Link href="/dapur" className="small">Layar dapur →</Link>}</div>
      </section>
    </>) },
    { id: 'layanan', title: T.kul ? 'Menu terlaris' : 'Layanan teratas', size: 'normal', node: d.money && rm && (rm.layanan || []).length > 0 && (
      <Widget title={T.kul ? 'Menu terlaris bulan ini' : 'Layanan teratas bulan ini'}><BarList limit={5} items={rm.layanan.map((x) => ({ label: x.name, sub: `${angka(x.pesanan)} pesanan`, value: Number(x.pendapatan) }))} /></Widget>
    ) },
    { id: 'foodcost', title: 'Food cost per menu', size: 'normal', node: fc && (fc.menus || []).some((m) => m.pct != null) && (
      <Widget title={`Food cost per menu · ${pl}`} action={<Link href="/resep">Resep</Link>}>
        <ul className="alerts">{fc.menus.filter((m) => m.pct != null).sort((a, b) => N(b.pct) - N(a.pct)).slice(0, 6).map((m) => (
          <li key={m.name}><div><span className="alerts-t small">{m.name}<span className="muted"> · {angka(m.qty)} terjual · margin {rp(m.margin)}</span></span><b className="small" style={{ whiteSpace: 'nowrap', color: N(m.pct) > 40 ? 'var(--bad)' : undefined }}>{String(m.pct).replace('.', ',')}%</b></div></li>
        ))}</ul>
        {N(fc.revenue_no_recipe) > 0 && <span className="small muted">Penjualan {rp(fc.revenue_no_recipe)} dari menu tanpa resep belum dihitung.</span>}
      </Widget>
    ) },
    { id: 'bahan', title: 'Bahan menipis', size: 'normal', node: bahan && bahan.length > 0 && (
      <Widget title={T.kul ? 'Bahan baku menipis' : 'Bahan menipis'} action={<Link href="/barang">Stok</Link>}>
        <ul className="alerts">{bahan.slice(0, 6).map((p) => <li key={p.id}><div><span className="alerts-t small">{p.name}</span><span className="small" style={{ whiteSpace: 'nowrap', color: 'var(--bad)' }}>{angka(p.stock)} / min {angka(p.min_stock)} {p.base_unit}</span></div></li>)}</ul>
        {has('/belanja') && <Link href="/belanja/baru" className="small">Belanja bahan →</Link>}
      </Widget>
    ) },
    { id: 'terlambat', title: 'Terlambat', size: 'normal', node: lateL.length > 0 && <List title="Terlambat" rows={lateL} tone="bad" /> },
    { id: 'hariini', title: 'Harus selesai hari ini', size: 'normal', node: dueToday.length > 0 && <List title="Harus selesai hari ini" rows={dueToday} /> },
    { id: 'jemput', title: 'Perlu dijemput', size: 'normal', node: jp && jemput.length > 0 && <List title="Perlu dijemput" rows={jemput} /> },
    { id: 'antar', title: 'Siap diantar', size: 'normal', node: logi && antar.filter((o) => !onTheWay(o)).length > 0 && <List title="Siap diantar" rows={antar.filter((o) => !onTheWay(o))} /> },
    { id: 'aktivitas', title: 'Aktivitas terbaru', size: 'normal', node: feed !== null && (
      <Widget title="Aktivitas terbaru" action={has('/aktivitas') && <Link href="/aktivitas">Riwayat</Link>}>{feed === undefined ? <Loading rows={3} /> : <ActivityList rows={feed} />}</Widget>
    ) },
    { id: 'aksi', title: 'Aksi cepat', size: 'normal', node: quickActions(kos).length > 0 && <Widget title="Aksi cepat"><QuickActions kos={kos} /></Widget> },
  ];

  return (
    <Dashboard id="jasa" kosId={kosId} widgets={widgets} prefs={prefs} kpis={KPIS.jasa.map(([id, label]) => ({ id, label }))} period={d.money} header={(atur, periode) => <>
      <PageHeader title="Dashboard" help={<PageHelp page="jasa" />} desc={`${T.kul ? 'Ringkasan dapur & pesanan' : 'Ringkasan pesanan'} ${kos.name} · ${tgl(t)}`}
        actions={<>{periode}{atur}{d.money && <Link href="/pesanan?baru=1"><button className="primary">+ Pesanan baru</button></Link>}</>} />
      <CrmHint />
      <RecHint />
    </>} />
  );
}
