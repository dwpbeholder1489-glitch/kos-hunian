'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { useKos } from '@/components/KosProvider';
import PageHelp from '@/components/PageHelp';
import { Tile, Loading } from '@/components/ui';
import { angka, rp, errMsg } from '@/lib/format';
import { canArea, tabsFor } from '@/lib/business';
import { PageHeader } from '@/components/Page';
import Dashboard, { Widget, QuickActions, ActivityList, useActivity } from '@/components/Dashboard';
import { quickActions } from '@/lib/menu';
import { useBuilder, statusesOf, statusById, umur } from '@/lib/builder';

// Dashboard bisnis kustom: jumlah per status, tugas saya, yang lewat batas waktu
export default function Kerja() {
  const { kos, kosId, ver } = useKos();
  const { cfg, err } = useBuilder(kosId, ver);
  const [d, setD] = useState(null);
  const [e2, setE2] = useState(null);
  const feed = useActivity(kosId, ver);
  useEffect(() => { supabase.rpc('bb_dashboard', { p_kos: kosId }).then(({ data, error }) => (error ? setE2(errMsg(error)) : setD(data))); }, [kosId, ver]);
  const e = err || e2;
  if (e) return <div className="notice bad">{/bb_/.test(e) ? 'Database sedang diperbarui. Coba lagi beberapa menit lagi.' : e}</div>;
  if (!cfg || !d) return <Loading />;
  const draft = cfg.ws?.status !== 'aktif';
  const objects = cfg.objects.filter((o) => o.active);
  const n = (oid, sid) => d.counts.filter((c) => c.object_id === oid && (sid === undefined || c.status_id === sid)).reduce((a, c) => a + Number(c.n), 0);
  const open = d.counts.filter((c) => c.status_id && !statusById(cfg, c.status_id)?.is_final).reduce((a, c) => a + Number(c.n), 0);
  const Item = ({ r, extra }) => {
    const o = cfg.objects.find((x) => x.id === r.object_id); const s = statusById(cfg, r.status_id);
    return (
      <Link href={`/catatan?jenis=${o?.key}&buka=${r.id}`} className="li" style={{ textDecoration: 'none', color: 'inherit' }}>
        <span className="small"><b>{r.title || r.number}</b> · {o?.name}<br /><span className="muted">{r.number} · {s?.label} sejak {umur(r.status_since)}{extra}</span></span>
        {s && <span className={'chip ' + s.tone}>{s.label}</span>}
      </Link>
    );
  };
  const has = (h) => tabsFor(kos).some(([x]) => x === h);
  const widgets = [
    { id: 'kpi', title: 'Angka utama', size: 'full', node: (
      <div className="grid">
        <Tile label="Belum selesai" value={angka(open)} sub="catatan dengan status belum akhir" />
        <Tile label="Lewat batas waktu" value={angka(d.overdue.length)} tone={d.overdue.length ? 'bad' : undefined} sub="sesuai batas per status" />
        <Tile label="Tugas saya" value={angka(d.mine.length)} sub="ditugaskan ke Anda" />
        <Tile label="Dicatat hari ini" value={angka(d.today)} />
        {d.money && <Tile label="Uang masuk hari ini" value={rp(d.money.hari_ini)} sub={`bulan ini ${rp(d.money.bulan_ini)}`} />}
      </div>
    ) },
    { id: 'jenis', title: 'Jenis data', size: 'full', node: !draft && objects.length > 0 && <div className="row">{objects.map((o) => <Link key={o.id} href={`/catatan?jenis=${o.key}`}><button className="sm">{o.icon} {o.name} ({angka(n(o.id))})</button></Link>)}</div> },
    { id: 'lewat', title: 'Lewat batas waktu', size: 'wide', node: d.overdue.length > 0 && <Widget title="Lewat batas waktu"><div className="list">{d.overdue.slice(0, 8).map((r) => <Item key={r.id} r={r} extra={` · batas ${r.hours} jam${r.assigned_to ? ` · ${r.assigned_to}` : ''}`} />)}</div></Widget> },
    { id: 'tugas', title: 'Tugas saya', size: 'normal', node: d.mine.length > 0 && <Widget title="Tugas saya"><div className="list">{d.mine.slice(0, 8).map((r) => <Item key={r.id} r={r} />)}</div></Widget> },
    ...objects.filter((o) => o.workflow).map((o) => ({ id: 'status-' + o.key, title: `${o.name} per status`, size: 'normal', node: (
      <Widget title={`${o.icon} ${o.name} per status`}>
        <div className="list">{statusesOf(cfg, o.id).map((st) => (
          <Link key={st.id} href={`/catatan?jenis=${o.key}`} className="li" style={{ textDecoration: 'none', color: 'inherit' }}><span className="small">{st.label}{st.is_final ? ' (akhir)' : ''}</span><b className="small">{angka(n(o.id, st.id))}</b></Link>
        ))}</div>
      </Widget>
    ) })),
    { id: 'aktivitas', title: 'Aktivitas terbaru', size: 'normal', node: feed !== null && feed?.length > 0 && <Widget title="Aktivitas terbaru" action={has('/aktivitas') && <Link href="/aktivitas">Riwayat</Link>}><ActivityList rows={feed} /></Widget> },
    { id: 'aksi', title: 'Aksi cepat', size: 'normal', node: quickActions(kos).length > 0 && <Widget title="Aksi cepat"><QuickActions kos={kos} /></Widget> },
    { id: 'catatan', title: 'Catatan notifikasi', size: 'full', node: <span className="small muted">Notifikasi saat ini tampil di Dashboard ini (Tugas saya & Lewat batas waktu) dan Ringkasan pemilik. Email/WhatsApp otomatis untuk bisnis kustom belum tersedia.</span> },
  ];
  return (
    <Dashboard id="kerja" kosId={kosId} widgets={widgets} header={(atur) => <>
      <PageHeader title="Dashboard" help={<PageHelp page="kerja" />} desc={cfg.ws?.main_process ? `Proses utama: ${cfg.ws.main_process}` : 'Ringkasan catatan, tugas, dan batas waktu'} actions={atur} />
      {draft && <div className="notice">Bisnis ini masih <b>draf</b>. {canArea(kos, 'settings') ? <>Lanjutkan di <Link href="/builder">Business Builder</Link>: sesuaikan data & alur, lalu <b>Validasi & aktifkan</b>.</> : 'Minta pemilik menyelesaikan Business Builder.'}</div>}
    </>} />
  );
}
