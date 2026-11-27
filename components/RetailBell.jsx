'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useCrmDue } from '@/components/CrmDue';
import { usePathname } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { usePortalInbox } from '@/components/PortalInbox';
import { useKos } from '@/components/KosProvider';
import { NotifBellMenu } from '@/components/NotifCenter';

export const alertCount = (a) => (a ? ['habis', 'menipis', 'pesanan', 'kasbon', 'utang', 'offline', 'stok_minus'].reduce((s, k) => s + (a[k]?.length || 0), 0) : 0);

// Hitungan pengingat toko: stok habis/menipis, pesanan terlambat, kasbon & utang jatuh tempo, transaksi offline perlu dicek
export function useRetailTodo() {
  const { kosId, ver } = useKos();
  const path = usePathname();
  const [n, setN] = useState(0);
  const count = n + usePortalInbox().length + useCrmDue();
  useEffect(() => {
    let alive = true;
    supabase.rpc('retail_alerts', { p_kos: kosId }).then(({ data }) => { if (alive) setN(alertCount(data)); }, () => {});
    return () => { alive = false; };
  }, [kosId, ver, path]);
  return count;
}
// Lonceng Pusat Notifikasi untuk toko (angka = belum dibaca + pengingat)
export function RetailNotifBell() {
  const count = useRetailTodo();
  return <NotifBellMenu todo={{ count, href: '/pengingat', label: 'Pengingat toko' }} />;
}

// Lonceng lama (hanya pengingat) — dipertahankan
export default function RetailBell() {
  const count = useRetailTodo();
  return (
    <Link href="/pengingat" className="helpbtn bell" aria-label={count ? `Pengingat: ${count} perlu ditindaklanjuti` : 'Pengingat'} title="Pengingat">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" /><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" /></svg>
      {count > 0 && <span className="nbadge">{count > 99 ? '99+' : count}</span>}
    </Link>
  );
}
