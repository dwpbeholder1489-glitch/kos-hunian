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
import { sisa, late, jakartaDate, hari, stageLabel, STATUS, waitPickup, onTheWay } from '@/lib/jasa';
import { moduleOn, canArea } from '@/lib/business';

// Dashboard bisnis jasa: antrean per tahap, yang harus dikerjakan hari ini, uang hari ini
export default function JasaHome() {
  const { kos, kosId, ver } = useKos();
  const [d, setD] = useState(null);
  const [r, setR] = useState(null);
  const [s, setS] = useState(null);
  const [err, setErr] = useState(null);
  useEffect(() => {
    supabase.rpc('svc_board', { p_kos: kosId }).then(({ data, error }) => (error ? setErr(errMsg(error)) : setD(data)));
    supabase.rpc('svc_report', { p_kos: kosId, p_from: today(), p_to: today() }).then(({ data }) => setR(data || null));
    supabase.rpc('svc_dashboard', { p_kos: kosId }).then(({ data }) => setS(data || null));
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
  const comp = act.reduce((a, o) => a + Number(o.open_complaints || 0), 0) + d.orders.filter((o) => ['selesai'].includes(o.status)).reduce((a, o) => a + Number(o.open_complaints || 0), 0);
  const List = ({ title, rows, tone }) => rows.length > 0 && (
    <section className="panel">
      <h3>{title} ({rows.length})</h3>
      <div className="list">{rows.slice(0, 6).map((o) => (
        <Link key={o.id} href="/pesanan" className="li" style={{ textDecoration: 'none', color: 'inherit' }}>
          <span className="small"><b>{o.customer_name}</b> · {o.number}<br /><span className="muted">{o.status === 'siap' ? (o.address || stageLabel(o)) : `janji ${hari(o.due_at)}`}</span></span>
          <span className={'chip ' + (tone || STATUS[o.status]?.[1] || '')}>{stageLabel(o)}</span>
        </Link>
      ))}</div>
      {rows.length > 6 && <Link href="/pesanan" className="small">Lihat semua →</Link>}
    </section>
  );

  return (
    <div className="stack">
      <div className="row between"><div className="row"><h2>{kos.name}</h2><PageHelp page="jasa" /></div>{d.money && <Link href="/pesanan?baru=1"><button className="primary">+ Pesanan baru</button></Link>}</div>
      <CrmHint />
      <RecHint />
      {s && !s.any && <section className="panel">
        <h3>Belum ada pesanan</h3>
        <span className="small muted">Semua angka di dashboard ini dihitung dari pesanan nyata — tidak ada angka contoh. Mulai dari:</span>
        <div className="list">
          {canArea(kos, 'settings') && <Link href="/layanan" className="li" style={{ textDecoration: 'none', color: 'inherit' }}><span className="small">1. Cek layanan, harga, dan tahap proses</span><span className="small">→</span></Link>}
          {logi && canArea(kos, 'settings') && <Link href="/antar" className="li" style={{ textDecoration: 'none', color: 'inherit' }}><span className="small">2. Atur wilayah, biaya & jam antar jemput</span><span className="small">→</span></Link>}
          {d.money && <Link href="/pesanan?baru=1" className="li" style={{ textDecoration: 'none', color: 'inherit' }}><span className="small">3. Catat pesanan pertama saat pelanggan datang</span><span className="small">→</span></Link>}
          {canArea(kos, 'settings') && moduleOn(kos, 'u_halaman') && <Link href="/halaman" className="li" style={{ textDecoration: 'none', color: 'inherit' }}><span className="small">4. Terbitkan halaman bisnis untuk pelanggan</span><span className="small">→</span></Link>}
        </div>
      </section>}
      {Number(s?.permintaan) > 0 && d.money && <Link href="/pesanan" className="notice" style={{ textDecoration: 'none', color: 'inherit', display: 'block' }}><b>{s.permintaan} pesanan dari halaman bisnis</b> menunggu konfirmasi →</Link>}
      <div className="grid">
        <Tile label="Pesanan baru hari ini" value={angka(s?.baru_hari_ini ?? 0)} sub={`${angka(s?.selesai_hari_ini ?? 0)} selesai hari ini`} />
        {logi && <Tile label="Menunggu penjemputan" value={angka(s?.menunggu_jemput ?? jemput.length)} tone={jemput.length ? 'gold' : undefined} />}
        <Tile label="Siap diambil" value={angka(s?.siap_diambil ?? 0)} />
        {logi && <Tile label="Dalam pengantaran" value={angka(s?.dalam_pengantaran ?? 0)} sub={`${angka(s?.siap_diantar ?? 0)} siap diantar`} />}
        <Tile label="Terlambat" value={angka(lateL.length)} tone={lateL.length ? 'bad' : undefined} sub="lewat janji selesai" />
        {d.money && s && <Tile label="Pendapatan" value={rp(s.pendapatan_hari_ini)} sub={`bulan ini ${rp(s.pendapatan_bulan_ini)} · dari pesanan diserahkan`} />}
        {d.money && r && <Tile label="Uang masuk hari ini" value={rp(r.uang_masuk)} sub="termasuk DP" />}
        {d.money && s && <Tile label="Pembayaran tertunda" value={rp(s.tertunda)} sub={`${angka(s.tertunda_n)} pesanan belum lunas`} tone={Number(s.tertunda) > 0 ? 'bad' : undefined} />}
      </div>
      <section className="panel">
        <h3>Ringkasan pesanan</h3>
        <div className="list">
          {logi && <div className="li"><span className="small">Menunggu penjemputan</span><b className="small">{angka(jemput.length)}</b></div>}
          <div className="li"><span className="small">Diterima (belum diproses)</span><b className="small">{angka(act.filter((o) => o.status === 'diterima' && !waitPickup(o)).length)}</b></div>
          {d.stages.map((x) => <div className="li" key={x.id}><span className="small">Sedang {x.name.toLowerCase()}</span><b className="small">{angka(act.filter((o) => o.stage_id === x.id && o.status === 'proses').length)}</b></div>)}
          <div className="li"><span className="small">Siap diambil</span><b className="small">{angka(ready.filter((o) => !o.deliver).length)}</b></div>
          {logi && <div className="li"><span className="small">Siap diantar</span><b className="small">{angka(ready.filter((o) => o.deliver && !onTheWay(o)).length)}</b></div>}
          {logi && <div className="li"><span className="small">Dalam pengantaran</span><b className="small">{angka(ready.filter(onTheWay).length)}</b></div>}
          <div className="li"><span className="small">Selesai hari ini</span><b className="small">{angka(s?.selesai_hari_ini ?? 0)}</b></div>
        </div>
        <Link href="/pesanan" className="small">Buka papan pesanan →</Link>
      </section>
      <List title="Terlambat" rows={lateL} tone="bad" />
      <List title="Harus selesai hari ini" rows={dueToday} />
      {logi && <List title="Perlu dijemput" rows={jemput} />}
      {logi && <List title="Siap diantar" rows={antar.filter((o) => !onTheWay(o))} />}
      {comp > 0 && <div className="notice bad"><Link href="/pesanan">{comp} keluhan pelanggan belum selesai →</Link></div>}
    </div>
  );
}
