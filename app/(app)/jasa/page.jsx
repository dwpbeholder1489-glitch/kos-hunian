'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { useKos } from '@/components/KosProvider';
import PageHelp from '@/components/PageHelp';
import { Tile, Loading } from '@/components/ui';
import { rp, angka, today, errMsg } from '@/lib/format';
import { RecHint } from '@/components/Rekomendasi';
import CrmHint from '@/components/CrmHint';
import { sisa, late, jakartaDate, hari, stageLabel, STATUS, waitPickup, onTheWay, terms } from '@/lib/jasa';
import { moduleOn, canArea, tabsFor } from '@/lib/business';
import { PageHeader } from '@/components/Page';
import Dashboard, { Widget, Alerts, QuickActions, ActivityList, useActivity } from '@/components/Dashboard';
import { DayColumns, BarList } from '@/components/Charts';
import { quickActions } from '@/lib/menu';
import { tgl, bulan, thisMonth } from '@/lib/format';

// Dashboard bisnis jasa: antrean per tahap, yang harus dikerjakan hari ini, uang hari ini
export default function JasaHome() {
  const { kos, kosId, ver } = useKos();
  const [d, setD] = useState(null);
  const [r, setR] = useState(null);
  const [s, setS] = useState(null);
  const [err, setErr] = useState(null);
  const [rv, setRv] = useState(null); // kuliner: reservasi hari ini & permintaan
  const [rm, setRm] = useState(null); // laporan bulan berjalan (tren & layanan teratas)
  const feed = useActivity(kosId, ver);
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
  const widgets = [
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
    { id: 'kpi', title: 'Angka utama', size: 'full', node: (<>
      <div className="grid">
        <Tile label="Pesanan baru hari ini" value={angka(s?.baru_hari_ini ?? 0)} sub={`${angka(s?.selesai_hari_ini ?? 0)} selesai hari ini`} />
        {jp && <Tile label="Menunggu penjemputan" value={angka(s?.menunggu_jemput ?? jemput.length)} tone={jemput.length ? 'gold' : undefined} />}
        {T.kul && <Tile label="Di dapur" value={angka(act.filter((o) => ['diterima', 'proses'].includes(o.status)).length)} sub="belum siap" />}
        <Tile label={T.kul ? 'Siap disajikan / diambil' : 'Siap diambil'} value={angka(s?.siap_diambil ?? 0)} />
        {logi && <Tile label="Dalam pengantaran" value={angka(s?.dalam_pengantaran ?? 0)} sub={`${angka(s?.siap_diantar ?? 0)} siap diantar`} />}
        <Tile label="Terlambat" value={angka(lateL.length)} tone={lateL.length ? 'bad' : undefined} sub="lewat janji selesai" />
        {d.money && s && <Tile label="Pendapatan" value={rp(s.pendapatan_hari_ini)} sub={`bulan ini ${rp(s.pendapatan_bulan_ini)} · dari pesanan diserahkan`} />}
        {d.money && r && <Tile label="Uang masuk hari ini" value={rp(r.uang_masuk)} sub="termasuk DP" />}
        {d.money && s && <Tile label="Pembayaran tertunda" value={rp(s.tertunda)} sub={`${angka(s.tertunda_n)} pesanan belum lunas`} tone={Number(s.tertunda) > 0 ? 'bad' : undefined} />}
      </div>
    </>) },
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
    <Dashboard id="jasa" kosId={kosId} widgets={widgets} header={(atur) => <>
      <PageHeader title="Dashboard" help={<PageHelp page="jasa" />} desc={`${T.kul ? 'Ringkasan dapur & pesanan' : 'Ringkasan pesanan'} ${kos.name} · ${tgl(t)}`}
        actions={<>{atur}{d.money && <Link href="/pesanan?baru=1"><button className="primary">+ Pesanan baru</button></Link>}</>} />
      <CrmHint />
      <RecHint />
    </>} />
  );
}
