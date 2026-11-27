'use client';
// Pemberitahuan Rekap Bisnis (Notification Center): arsip rekap otomatis & versi koreksi 7 hari terakhir (recap_notice, area keuangan).
// Tampil di Notifikasi (kos) dan Pengingat (toko/jasa). Tanpa izin keuangan → tidak tampil.
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { canArea } from '@/lib/business';
import { KINDS, rangeLabel } from '@/lib/recap';

export default function RekapNotice({ kos }) {
  const [rows, setRows] = useState([]);
  const allowed = kos && canArea(kos, 'finance');
  useEffect(() => {
    if (!allowed) return undefined;
    let on = true;
    supabase.rpc('recap_notice', { p_kos: kos.id }).then(({ data, error }) => on && setRows(error ? [] : data || []));
    return () => { on = false; };
  }, [kos?.id, allowed]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!allowed || rows.length === 0) return null;
  return <section className="panel">
    <h3>Rekap Bisnis</h3>
    <div className="list">{rows.map((r) => {
      const kind = KINDS.find(([k]) => k === r.kind)?.[1] || 'Rekap';
      const href = `/rekap?k=${r.kind}&t=${r.from}${r.kind === 'kustom' ? `&dari=${r.from}&sampai=${r.to}` : ''}`;
      return <Link key={r.id} href={href} className="li">
        <div className="main" style={{ flex: 1 }}>
          <b>{r.source === 'koreksi' ? `Rekap ${kind.toLowerCase()} ${rangeLabel(r.from, r.to)} diperbarui (versi ${r.version})` : `Rekap ${kind.toLowerCase()} ${rangeLabel(r.from, r.to)} sudah diarsipkan`}</b>
          <span className="small muted">{r.source === 'koreksi' ? 'Data periode ini berubah setelah diarsipkan, versi lama tetap tersimpan. Tinjau perubahannya.' : 'Tinjau hasil periode ini dan bandingkan dengan periode sebelumnya.'}</span>
        </div><span className="muted">›</span>
      </Link>; })}</div>
  </section>;
}
