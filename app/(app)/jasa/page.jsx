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
import { sisa, late, jakartaDate, hari, stageLabel, STATUS } from '@/lib/jasa';

// Dashboard bisnis jasa: antrean per tahap, yang harus dikerjakan hari ini, uang hari ini
export default function JasaHome() {
  const { kos, kosId, ver } = useKos();
  const [d, setD] = useState(null);
  const [r, setR] = useState(null);
  const [err, setErr] = useState(null);
  useEffect(() => {
    supabase.rpc('svc_board', { p_kos: kosId }).then(({ data, error }) => (error ? setErr(errMsg(error)) : setD(data)));
    supabase.rpc('svc_report', { p_kos: kosId, p_from: today(), p_to: today() }).then(({ data }) => setR(data || null));
  }, [kosId, ver]);
  if (err) return <div className="notice bad">{/svc_board/.test(err) ? 'Database sedang diperbarui. Coba lagi beberapa menit lagi.' : err}</div>;
  if (!d) return <Loading />;
  const t = today();
  const act = d.orders.filter((o) => !['selesai', 'batal'].includes(o.status));
  const lateL = act.filter(late);
  const dueToday = act.filter((o) => o.due_at && jakartaDate(o.due_at) === t && !late(o) && o.status !== 'siap');
  const ready = act.filter((o) => o.status === 'siap');
  const antar = ready.filter((o) => o.deliver);
  const jemput = act.filter((o) => o.pickup && o.status === 'diterima');
  const comp = act.reduce((a, o) => a + Number(o.open_complaints || 0), 0) + d.orders.filter((o) => ['selesai'].includes(o.status)).reduce((a, o) => a + Number(o.open_complaints || 0), 0);
  const unpaid = d.money ? d.orders.filter((o) => o.status === 'selesai' && sisa(o) > 0) : [];
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
      <div className="grid">
        <Tile label="Sedang dikerjakan" value={angka(act.length - ready.length)} sub={`${angka(ready.length)} siap diambil/diantar`} />
        <Tile label="Terlambat" value={angka(lateL.length)} tone={lateL.length ? 'bad' : undefined} sub="lewat janji selesai" />
        {d.money && r && <Tile label="Uang masuk hari ini" value={rp(r.uang_masuk)} sub={`${angka(r.selesai)} pesanan diserahkan`} />}
        {d.money && <Tile label="Belum lunas (sudah diserahkan)" value={rp(unpaid.reduce((a, o) => a + sisa(o), 0))} sub={`${unpaid.length} pesanan`} tone={unpaid.length ? 'bad' : undefined} />}
      </div>
      <section className="panel">
        <h3>Antrean per tahap</h3>
        <div className="list">
          <div className="li"><span className="small">Diterima (belum diproses)</span><b className="small">{angka(act.filter((o) => o.status === 'diterima').length)}</b></div>
          {d.stages.map((s) => <div className="li" key={s.id}><span className="small">{s.name}</span><b className="small">{angka(act.filter((o) => o.stage_id === s.id).length)}</b></div>)}
          <div className="li"><span className="small">Siap diambil / diantar</span><b className="small">{angka(ready.length)}</b></div>
        </div>
        <Link href="/pesanan" className="small">Buka papan pesanan →</Link>
      </section>
      <List title="Terlambat" rows={lateL} tone="bad" />
      <List title="Harus selesai hari ini" rows={dueToday} />
      <List title="Perlu dijemput" rows={jemput} />
      <List title="Siap diantar" rows={antar} />
      {comp > 0 && <div className="notice bad"><Link href="/pesanan">{comp} keluhan pelanggan belum selesai →</Link></div>}
      {act.length === 0 && d.orders.length === 0 && <div className="notice">Mulai dari <Link href="/layanan">Layanan & tahap</Link> (cek harga), lalu tekan <b>+ Pesanan baru</b> saat pelanggan datang.</div>}
    </div>
  );
}
