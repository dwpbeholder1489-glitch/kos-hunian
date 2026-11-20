'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { useKos } from '@/components/KosProvider';
import PageHelp from '@/components/PageHelp';
import { Loading } from '@/components/ui';
import { angka, rp, errMsg, tgl, today } from '@/lib/format';
import { canArea, tabsFor } from '@/lib/business';
import { PageHeader } from '@/components/Page';
import Dashboard, { Widget, QuickActions, ActivityList, useActivity, useDashPrefs, KpiGrid } from '@/components/Dashboard';
import { quickActions } from '@/lib/menu';
import { useBuilder, statusesOf, statusById, umur } from '@/lib/builder';

// Nilai field di daftar dashboard (tipe dari Business Builder)
const fmt = (type, v) => {
  if (v == null || v === '') return '';
  if (type === 'currency') return rp(v);
  if (type === 'number') return angka(v);
  if (type === 'date') return tgl(String(v).slice(0, 10));
  if (type === 'datetime') return `${tgl(String(v).slice(0, 10))}${String(v).length > 10 ? ' ' + String(v).slice(11, 16) : ''}`;
  if (type === 'boolean') return v ? 'Ya' : 'Tidak';
  if (Array.isArray(v)) return v.join(', ');
  return String(v).length > 60 ? String(v).slice(0, 60) + '…' : String(v);
};
// Tanggal di daftar: "Hari ini", "Besok", "Terlewat 3 hari", atau tanggal
const when = (v) => {
  if (!v) return null;
  const d = String(v).slice(0, 10); const t = today();
  const diff = Math.round((new Date(d + 'T00:00:00Z') - new Date(t + 'T00:00:00Z')) / 864e5);
  const jam = String(v).length > 10 ? ' ' + String(v).slice(11, 16) : '';
  if (diff === 0) return ['Hari ini' + jam, 'gold'];
  if (diff === 1) return ['Besok' + jam, 'info'];
  if (diff < 0) return [`Terlewat ${-diff} hari`, 'bad'];
  return [tgl(d) + jam, ''];
};

// Dashboard bisnis kustom. Bila jenis usaha punya tata letak siap pakai (Event, Klinik, Bengkel, dst.), dashboard
// mengikuti tata letak itu (bb_home: kotak angka, daftar, tombol buat); selain itu tampilan umum per status.
export default function Kerja() {
  const { kos, kosId, ver } = useKos();
  const { cfg, err } = useBuilder(kosId, ver);
  const [d, setD] = useState(null);
  const [home, setHome] = useState(null);
  const [e2, setE2] = useState(null);
  const feed = useActivity(kosId, ver);
  const prefs = useDashPrefs('kerja');
  useEffect(() => {
    supabase.rpc('bb_dashboard', { p_kos: kosId }).then(({ data, error }) => (error ? setE2(errMsg(error)) : setD(data)));
    supabase.rpc('bb_home', { p_kos: kosId }).then(({ data, error }) => setHome(error ? { layout: false } : data || { layout: false }));
  }, [kosId, ver]);
  const e = err || e2;
  if (e) return <div className="notice bad">{/bb_/.test(e) ? 'Database sedang diperbarui. Coba lagi beberapa menit lagi.' : e}</div>;
  if (!cfg || !d || !home) return <Loading rows={5} />;
  const draft = cfg.ws?.status !== 'aktif';
  const objects = cfg.objects.filter((o) => o.active);
  const n = (oid, sid) => d.counts.filter((c) => c.object_id === oid && (sid === undefined || c.status_id === sid)).reduce((a, c) => a + Number(c.n), 0);
  const open = d.counts.filter((c) => c.status_id && !statusById(cfg, c.status_id)?.is_final).reduce((a, c) => a + Number(c.n), 0);
  const has = (h) => tabsFor(kos).some(([x]) => x === h);
  const href = (key, id) => `/catatan/${key}${id ? `?buka=${id}` : ''}`;
  const Item = ({ r, extra }) => {
    const o = cfg.objects.find((x) => x.id === r.object_id); const s = statusById(cfg, r.status_id);
    return (
      <Link href={href(o?.key, r.id)} className="li" style={{ textDecoration: 'none', color: 'inherit' }}>
        <span className="small"><b>{r.title || r.number}</b> · {o?.name}<br /><span className="muted">{r.number} · {s?.label} sejak {umur(r.status_since)}{extra}</span></span>
        {s && <span className={'chip ' + s.tone}>{s.label}</span>}
      </Link>
    );
  };
  const lay = home.layout ? home : null;
  const empty = objects.every((o) => n(o.id) === 0);
  const create = lay?.create?.length ? lay.create : objects.slice(0, 1).map((o) => ({ key: o.key, name: o.name, icon: o.icon }));

  // Angka utama dari tata letak jenis usaha (bb_home) — id stabil dari judul angka, bisa dipilih & diurutkan pemilik
  const kid = (l) => 'k_' + String(l).toLowerCase().replace(/[^a-z0-9]+/g, '_').slice(0, 40);
  const kpiItems = [
    ...(lay ? lay.kpis.map((k) => ({ id: kid(k.label), label: k.label,
      value: (k.money ? rp(k.value) : angka(k.value)) + (k.suffix || ''),
      // rasio (mis. Realisasi vs RAB): nilai realisasi, dibanding total & persentase
      sub: k.total != null ? `dari ${k.money ? rp(k.total) : angka(k.total)}${k.pct != null ? ` · ${String(k.pct).replace('.', ',')}%` : ''}${k.sub ? ` · ${k.sub}` : ''}` : k.sub || undefined,
      tone: k.pct != null && Number(k.pct) > 100 ? 'bad' : Number(k.value) > 0 && ['bad', 'gold'].includes(k.tone) ? k.tone : undefined }))
      : [{ id: 'belum_selesai', label: 'Belum selesai', value: angka(open), sub: 'catatan dengan status belum akhir' }, { id: 'hari_ini', label: 'Dicatat hari ini', value: angka(d.today) }]),
    (!lay || d.overdue.length > 0) && { id: 'lewat', label: 'Lewat batas waktu', value: angka(d.overdue.length), tone: d.overdue.length ? 'bad' : undefined, sub: 'sesuai batas per status' },
    d.mine.length > 0 && { id: 'tugas', label: 'Tugas saya', value: angka(d.mine.length), sub: 'ditugaskan ke Anda' },
    d.money && { id: 'uang', label: 'Uang masuk bulan ini', value: rp(d.money.bulan_ini), sub: `hari ini ${rp(d.money.hari_ini)}` },
  ];
  const kpiCat = kpiItems.filter(Boolean).map((x) => ({ id: x.id, label: x.label }));
  prefs.kpiDefaults = kpiCat.map((x) => x.id); // rekomendasi = semua angka dari tata letak jenis usaha

  const widgets = [
    { id: 'mulai', title: 'Mulai di sini', size: 'full', node: !draft && empty && create.length > 0 && (
      <Widget title="Tampilan bisnis Anda sudah siap">
        <span className="small muted">Menu, formulir, status, laporan, dan dashboard ini sudah disiapkan sesuai jenis usaha{cfg.ws?.main_process ? ` (${cfg.ws.main_process})` : ''}. Tinggal mulai mencatat — semua angka di sini dihitung dari catatan Anda.</span>
        <div className="row">{create.map((c, i) => <Link key={c.key} href={`${href(c.key)}?baru=1`}><button className={i === 0 ? 'primary' : ''}>+ {c.name}</button></Link>)}</div>
        {canArea(kos, 'settings') && <span className="small muted">Perlu kolom atau status lain? Ubah kapan saja di <Link href="/builder">Business Builder</Link> — tidak wajib.</span>}
      </Widget>
    ) },
    { id: 'kpi', title: 'Angka utama', size: 'full', node: <KpiGrid items={kpiItems} prefs={prefs} /> },
    ...(lay ? lay.lists.map((l, i) => ({ id: 'list-' + i, title: l.title, size: i === 0 ? 'wide' : 'normal', node: (
      <Widget title={`${l.title}${l.total > l.rows.length ? ` (${l.total})` : ''}`} action={<Link href={href(l.object)}>Lihat semua</Link>}>
        {l.rows.length === 0 ? <p className="small muted" style={{ margin: 0 }}>Tidak ada.</p> : (
          <ul className="alerts">{l.rows.map((r) => {
            const w = when(r.date);
            return (
              <li key={r.id}><Link href={href(l.object, r.id)}>
                <span className="alerts-t"><b className="small">{r.title || r.number}</b>
                  <span className="small muted">{[w && !w[1] ? w[0] : null, ...r.show.map(([, type, v]) => fmt(type, v))].filter(Boolean).join(' · ') || r.number}</span></span>
                <span style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4, flex: 'none' }}>
                  {w && w[1] && <span className={'chip ' + w[1]}>{w[0]}</span>}
                  {r.status && <span className={'chip ' + (r.tone || '')}>{r.status}</span>}
                  {r.late && <span className="chip bad">Lewat batas</span>}
                </span>
              </Link></li>
            );
          })}</ul>
        )}
      </Widget>
    ) })) : []),
    { id: 'lewat', title: 'Lewat batas waktu', size: 'normal', node: d.overdue.length > 0 && <Widget title="Lewat batas waktu"><div className="list">{d.overdue.slice(0, 8).map((r) => <Item key={r.id} r={r} extra={` · batas ${r.hours} jam${r.assigned_to ? ` · ${r.assigned_to}` : ''}`} />)}</div></Widget> },
    { id: 'tugas', title: 'Tugas saya', size: 'normal', node: d.mine.length > 0 && <Widget title="Tugas saya"><div className="list">{d.mine.slice(0, 8).map((r) => <Item key={r.id} r={r} />)}</div></Widget> },
    ...objects.filter((o) => o.workflow).map((o) => ({ id: 'status-' + o.key, title: `${o.name} per status`, size: 'normal', node: (
      <Widget title={`${o.icon} ${o.name} per status`} action={<Link href={href(o.key)}>Buka</Link>}>
        <div className="list">{statusesOf(cfg, o.id).map((st) => (
          <Link key={st.id} href={href(o.key)} className="li" style={{ textDecoration: 'none', color: 'inherit' }}><span className="small">{st.label}{st.is_final ? ' (akhir)' : ''}</span><b className="small">{angka(n(o.id, st.id))}</b></Link>
        ))}</div>
      </Widget>
    ) })),
    { id: 'data', title: 'Semua data', size: 'normal', node: !draft && objects.length > 0 && (
      <Widget title="Semua data">
        <ul className="alerts">{objects.map((o) => <li key={o.id}><Link href={href(o.key)}><span className="alerts-t small">{o.icon} {o.name}</span><b className="small">{angka(n(o.id))}</b></Link></li>)}</ul>
      </Widget>
    ) },
    { id: 'aktivitas', title: 'Aktivitas terbaru', size: 'normal', node: feed !== null && feed?.length > 0 && <Widget title="Aktivitas terbaru" action={has('/aktivitas') && <Link href="/aktivitas">Riwayat</Link>}><ActivityList rows={feed} /></Widget> },
    { id: 'aksi', title: 'Aksi cepat', size: 'normal', node: quickActions(kos).length > 0 && <Widget title="Aksi cepat"><QuickActions kos={kos} /></Widget> },
    { id: 'catatan', title: 'Catatan notifikasi', size: 'full', node: <span className="small muted">Pengingat saat ini tampil di Dashboard ini (Lewat batas waktu, Tugas saya, daftar terdekat) dan Ringkasan pemilik. Email/WhatsApp otomatis untuk bisnis ini belum tersedia.</span> },
  ];
  return (
    <Dashboard id="kerja" kosId={kosId} widgets={widgets} prefs={prefs} kpis={kpiCat} header={(atur) => <>
      <PageHeader title="Dashboard" help={<PageHelp page="kerja" />} desc={cfg.ws?.main_process ? `Alur utama: ${cfg.ws.main_process}` : 'Ringkasan catatan, tugas, dan batas waktu'}
        actions={<>{atur}{!draft && create.slice(0, 1).map((c) => <Link key={c.key} href={`${href(c.key)}?baru=1`}><button className="primary">+ {c.name}</button></Link>)}</>} />
      {draft && <div className="notice">Bisnis ini belum diaktifkan. {canArea(kos, 'settings') ? <>Tampilannya sudah disiapkan sesuai jenis usaha — buka <Link href="/konfirmasi">Pusat Konfirmasi</Link> lalu tekan <b>Aktifkan</b>. Mengubah isi di <Link href="/builder">Business Builder</Link> tidak wajib.</> : 'Minta pemilik mengaktifkan bisnis di Pusat Konfirmasi.'}</div>}
    </>} />
  );
}
