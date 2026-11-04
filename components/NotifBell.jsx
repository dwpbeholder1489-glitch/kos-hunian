'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { useKos } from '@/components/KosProvider';
import { today } from '@/lib/format';

// Lonceng di kepala aplikasi: jumlah hal yang perlu ditindaklanjuti hari ini (hitungan ringan, tanpa memuat semua data)
export default function NotifBell() {
  const { kosId, ver } = useKos();
  const path = usePathname();
  const [n, setN] = useState(0);
  useEffect(() => {
    if (!kosId) return;
    let alive = true;
    const head = { count: 'exact', head: true };
    Promise.all([
      supabase.from('payments').select('id', head).eq('kos_id', kosId).eq('status', 'menunggu'),
      supabase.from('invoice_summary').select('id', head).eq('kos_id', kosId).eq('overdue', true),
      supabase.from('invoice_summary').select('id', head).eq('kos_id', kosId).eq('due_date', today()).neq('status', 'batal').gt('outstanding', 0),
    ]).then((res) => { if (alive) setN(res.reduce((s, r) => s + (r.count || 0), 0)); }).catch(() => {});
    return () => { alive = false; };
  }, [kosId, ver, path]);
  return (
    <Link href="/notifikasi" className="helpbtn bell" aria-label={n ? `Notifikasi: ${n} perlu ditindaklanjuti` : 'Notifikasi'} title="Notifikasi">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" /><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" /></svg>
      {n > 0 && <span className="nbadge">{n > 99 ? '99+' : n}</span>}
    </Link>
  );
}
