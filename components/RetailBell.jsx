'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { useKos } from '@/components/KosProvider';

export const alertCount = (a) => (a ? ['habis', 'menipis', 'pesanan', 'kasbon', 'utang'].reduce((s, k) => s + (a[k]?.length || 0), 0) : 0);

// Lonceng toko: stok habis/menipis, pesanan terlambat, kasbon & utang jatuh tempo
export default function RetailBell() {
  const { kosId, ver } = useKos();
  const path = usePathname();
  const [n, setN] = useState(0);
  useEffect(() => {
    let alive = true;
    supabase.rpc('retail_alerts', { p_kos: kosId }).then(({ data }) => { if (alive) setN(alertCount(data)); }, () => {});
    return () => { alive = false; };
  }, [kosId, ver, path]);
  return (
    <Link href="/pengingat" className="helpbtn bell" aria-label={n ? `Pengingat: ${n} perlu ditindaklanjuti` : 'Pengingat'} title="Pengingat">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" /><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" /></svg>
      {n > 0 && <span className="nbadge">{n > 99 ? '99+' : n}</span>}
    </Link>
  );
}
