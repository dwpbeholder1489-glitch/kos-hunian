'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { useKos } from '@/components/KosProvider';
import PageHelp from '@/components/PageHelp';
import { Loading, Empty, Tile, run } from '@/components/ui';
import { rp, tgl, errMsg } from '@/lib/format';
import { PLANS } from '@/lib/plan';
import { can } from '@/lib/admin';

const ST = { menunggu: ['Menunggu', 'gold'], disetujui: ['Disetujui', 'good'], ditolak: ['Ditolak', 'bad'] };

// Verifikasi pembayaran langganan (manual: cocokkan dengan mutasi rekening/QRIS sebelum mengaktifkan)
export default function Langganan() {
  const { adminMe, loadKos } = useKos();
  const [reqs, setReqs] = useState(null);
  const [kos, setKos] = useState(null);
  const [tab, setTab] = useState('menunggu');
  const [err, setErr] = useState(null);
  const load = async () => {
    const [a, b] = await Promise.all([supabase.rpc('admin_list_requests'), supabase.rpc('admin_list_kos')]);
    if (a.error || b.error) return setErr(errMsg(a.error || b.error));
    setReqs(a.data); setKos(b.data);
  };
  useEffect(() => { if (can(adminMe, 'payments.view')) load(); }, [adminMe]);
  if (!can(adminMe, 'payments.view')) return <Empty title="Tidak punya izin melihat pembayaran" />;
  if (err) return <div className="notice bad">{/Khusus admin/.test(err) ? 'Saat ini verifikasi pembayaran khusus Super Admin.' : err}</div>;
  if (!reqs) return <Loading />;

  const decide = async (r, ok) => {
    if (!confirm(ok ? `Aktifkan ${PLANS[r.plan].name} ${r.months} bulan untuk "${r.kos_name}"?\nPastikan uang ${rp(r.amount)} SUDAH MASUK di mutasi rekening/QRIS.` : `Tolak permintaan dari "${r.kos_name}"?`)) return;
    if (await run(() => supabase.rpc('admin_decide_request', { p_request: r.id, p_approve: ok }), ok ? 'Paket diaktifkan' : 'Permintaan ditolak', errMsg)) { load(); loadKos(); }
  };
  const pending = reqs.filter((r) => r.status === 'menunggu');
  const shown = tab === 'menunggu' ? pending : reqs;
  const active = kos.filter((k) => k.paid_until && k.paid_until >= new Date().toISOString().slice(0, 10) && k.effective_plan !== 'gratis');

  return (
    <div className="stack">
      <div className="row"><h2>Langganan & pembayaran</h2><PageHelp page="admin-langganan" /></div>
      <div className="grid">
        <Tile label="Menunggu verifikasi" value={pending.length} tone={pending.length ? 'bad' : ''} sub={pending.length ? `senilai ${rp(pending.reduce((s, r) => s + Number(r.amount), 0))}` : 'tidak ada'} />
        <Tile label="Langganan aktif" value={active.length} sub={`dari ${kos.length} bisnis`} />
      </div>
      <div className="seg">{[['menunggu', `Menunggu (${pending.length})`], ['semua', 'Riwayat'], ['aktif', 'Langganan aktif']].map(([k, l]) => <button key={k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>{l}</button>)}</div>
      {tab !== 'aktif' && (shown.length === 0 ? <Empty title={tab === 'menunggu' ? 'Tidak ada pembayaran yang menunggu' : 'Belum ada pembayaran'} /> : (
        <section className="panel"><div className="list">{shown.map((r) => (
          <div className="li" key={r.id} style={{ alignItems: 'flex-start' }}>
            <div className="main">
              <b><Link href={`/admin/pelanggan/${r.kos_id}`} style={{ color: 'inherit' }}>{r.kos_name}</Link></b>
              <span className="small muted">{r.owner_email} · {tgl(r.created_at.slice(0, 10))}</span>
              <span className="small">{PLANS[r.plan].name} {r.months} bulan · {r.method === 'qris' ? 'QRIS' : 'Transfer'}{r.note ? ` · "${r.note}"` : ''}</span>
              {r.status === 'menunggu' && can(adminMe, 'payments.verify') && <div className="row" style={{ marginTop: 6 }}>
                <button className="sm primary" onClick={() => decide(r, true)}>Uang masuk, aktifkan</button>
                <button className="sm danger" onClick={() => decide(r, false)}>Tolak</button>
              </div>}
            </div>
            <div style={{ textAlign: 'right' }}><div className="num">{rp(r.amount)}</div><span className={'chip ' + ST[r.status][1]}>{ST[r.status][0]}</span></div>
          </div>
        ))}</div></section>
      ))}
      {tab === 'aktif' && (active.length === 0 ? <Empty title="Belum ada langganan aktif" /> : (
        <section className="panel"><div className="list">{active.sort((a, b) => a.paid_until.localeCompare(b.paid_until)).map((k) => (
          <Link key={k.id} href={`/admin/pelanggan/${k.id}`} className="li" style={{ color: 'inherit', textDecoration: 'none' }}>
            <div className="main"><b>{k.name}</b><span className="small muted">{k.owner_email}</span></div>
            <div style={{ textAlign: 'right' }}><span className="chip good">{PLANS[k.effective_plan].name}</span><br /><span className="small muted">s.d. {tgl(k.paid_until)}</span></div>
          </Link>
        ))}</div></section>
      ))}
      <p className="small muted" style={{ margin: 0 }}>Perpanjangan manual, kompensasi, atau tambah masa coba: buka profil pelanggan › Override akses (wajib alasan).</p>
    </div>
  );
}
