'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { useKos } from '@/components/KosProvider';
import { Loading, Empty } from '@/components/ui';
import { rp, tgl, errMsg } from '@/lib/format';
import { PLANS } from '@/lib/plan';
import { can, ACTION, ROLE } from '@/lib/admin';

const when = (ts) => { const s = String(ts); return `${tgl(s.slice(0, 10))} ${new Date(s).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Jakarta' })}`; };

// Catatan audit: siapa melakukan apa, kapan, pada bisnis mana (tidak bisa diubah dari aplikasi)
export default function Aktivitas() {
  const { adminMe } = useKos();
  const [rows, setRows] = useState(null);
  const [err, setErr] = useState(null);
  const [q, setQ] = useState('');
  const [hideView, setHideView] = useState(true);
  useEffect(() => { if (can(adminMe, 'audit.view')) supabase.rpc('admin_log_list', { p_limit: 500 }).then(({ data, error }) => (error ? setErr(errMsg(error)) : setRows(data || []))); }, [adminMe]);
  if (!can(adminMe, 'audit.view')) return <Empty title="Tidak punya izin melihat catatan audit" />;
  if (err) return <div className="notice bad">{err}</div>;
  if (!rows) return <Loading />;
  const det = (r) => {
    const d = r.detail || {};
    if (r.action === 'ubah_paket') return `${PLANS[d.sebelum?.paket]?.name || d.sebelum?.paket} → ${PLANS[d.sesudah?.paket]?.name || d.sesudah?.paket}${d.sesudah?.bayar_sampai ? ` s.d. ${tgl(d.sesudah.bayar_sampai)}` : ''}`;
    if (r.action.endsWith('_pembayaran')) return `${PLANS[d.paket]?.name} ${d.bulan} bln · ${rp(d.jumlah)}`;
    if (r.action === 'override') return `${d.tindakan}${d.paket ? ' ' + d.paket : ''}${d.nilai ? ' ' + d.nilai : ''} — ${d.alasan}`;
    if (r.action === 'ubah_staf') return `${d.email}: ${d.sebelum ? `${ROLE[d.sebelum.peran]}${d.sebelum.aktif ? '' : ' (nonaktif)'} → ` : ''}${ROLE[d.sesudah?.peran]}${d.sesudah?.aktif ? '' : ' (nonaktif)'}`;
    return '';
  };
  const term = q.trim().toLowerCase();
  const shown = rows.filter((r) => (!hideView || r.action !== 'buka_profil')
    && (!term || [r.actor_email, r.kos_name, ACTION[r.action], det(r)].join(' ').toLowerCase().includes(term)));
  return (
    <div className="stack">
      <h2>Catatan audit</h2>
      <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cari admin, bisnis, atau tindakan" aria-label="Cari catatan" />
      <label className="row small" style={{ fontWeight: 700 }}><input type="checkbox" style={{ width: 22, minHeight: 22 }} checked={hideView} onChange={(e) => setHideView(e.target.checked)} /> Sembunyikan "membuka profil"</label>
      {shown.length === 0 ? <Empty title="Tidak ada catatan" /> : (
        <section className="panel"><div className="list">{shown.map((r, i) => (
          <div className="li" key={i} style={{ alignItems: 'flex-start' }}>
            <div className="main"><b className="small">{ACTION[r.action] || r.action}{r.kos_name ? <> · {r.kos_id ? <Link href={`/admin/pelanggan/${r.kos_id}`}>{r.kos_name}</Link> : r.kos_name}</> : ''}</b>
              <span className="small muted">{det(r)}{det(r) ? ' · ' : ''}{r.actor_email}</span></div>
            <span className="small muted" style={{ whiteSpace: 'nowrap' }}>{when(r.created_at)}</span>
          </div>
        ))}</div></section>
      )}
    </div>
  );
}
