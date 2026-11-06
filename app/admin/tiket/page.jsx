'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { useKos } from '@/components/KosProvider';
import PageHelp from '@/components/PageHelp';
import { Loading, Empty, Tile } from '@/components/ui';
import { tgl, errMsg } from '@/lib/format';
import { can, TYPE_ICON, ADM_ST, PRIO } from '@/lib/admin';
import { CAT } from '@/components/Tickets';

const hours = (a, b) => Math.round((new Date(b) - new Date(a)) / 36e5);

// Antrean tiket bantuan
export default function TiketList() {
  const { adminMe } = useKos();
  const [rows, setRows] = useState(null);
  const [err, setErr] = useState(null);
  const [f, setF] = useState('aktif');
  useEffect(() => { if (can(adminMe, 'tickets.view')) supabase.rpc('admin_tickets').then(({ data, error }) => (error ? setErr(errMsg(error)) : setRows(data))); }, [adminMe]);
  if (!can(adminMe, 'tickets.view')) return <Empty title="Tidak punya izin melihat tiket" />;
  if (err) return <div className="notice bad">{err.includes('admin_tickets') ? 'Database sedang diperbarui. Coba lagi beberapa menit lagi.' : err}</div>;
  if (!rows) return <Loading />;
  const act = rows.filter((t) => ['open', 'in_progress'].includes(t.status));
  const responded = rows.filter((t) => t.first_response_at);
  const avg = responded.length ? Math.round(responded.reduce((s, t) => s + hours(t.created_at, t.first_response_at), 0) / responded.length) : null;
  const FILT = { aktif: (t) => ['open', 'in_progress'].includes(t.status), menunggu: (t) => t.status === 'waiting', selesai: (t) => ['resolved', 'closed'].includes(t.status), semua: () => true };
  const prioRank = { urgent: 0, high: 1, normal: 2, low: 3 };
  const shown = rows.filter(FILT[f]).sort((a, b) => (f === 'aktif' ? prioRank[a.priority] - prioRank[b.priority] || a.created_at.localeCompare(b.created_at) : 0));
  return (
    <div className="stack">
      <div className="row"><h2>Tiket bantuan</h2><PageHelp page="admin-tiket" /></div>
      <div className="grid">
        <Tile label="Perlu dibalas" value={act.length} tone={act.length ? 'bad' : ''} sub={act.filter((t) => !t.first_response_at).length + ' belum pernah dibalas'} />
        <Tile label="Waktu balas pertama" value={avg != null ? `${avg} jam` : '—'} sub="rata-rata" />
        <Tile label="Total tiket" value={rows.length} sub={`${rows.filter((t) => t.status === 'resolved' || t.status === 'closed').length} selesai`} />
      </div>
      <div className="seg">{[['aktif', `Perlu dibalas (${act.length})`], ['menunggu', 'Menunggu pelanggan'], ['selesai', 'Selesai'], ['semua', 'Semua']].map(([k, l]) => <button key={k} className={f === k ? 'on' : ''} onClick={() => setF(k)}>{l}</button>)}</div>
      {shown.length === 0 ? <Empty title="Tidak ada tiket" /> : (
        <section className="panel"><div className="list">{shown.map((t) => (
          <Link key={t.id} href={`/admin/tiket/${t.id}`} className="li" style={{ alignItems: 'flex-start', color: 'inherit', textDecoration: 'none' }}>
            <div className="main">
              <b className="small">{t.subject}</b>
              <span className="small muted">{t.number} · {TYPE_ICON[t.business_type]} {t.kos_name} · {CAT[t.category]}</span>
              <span className="small muted">{t.last_from === 'customer' ? 'Pelanggan: ' : 'Tim: '}{t.last_body}</span>
              <span className="small muted">{tgl(String(t.updated_at).slice(0, 10))}{t.assigned_to ? ` · ${t.assigned_to}` : ''}</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'flex-end' }}>
              <span className={'chip ' + ADM_ST[t.status][1]}>{ADM_ST[t.status][0]}</span>
              {t.priority !== 'normal' && <span className={'chip ' + PRIO[t.priority][1]}>{PRIO[t.priority][0]}</span>}
            </div>
          </Link>
        ))}</div></section>
      )}
    </div>
  );
}
