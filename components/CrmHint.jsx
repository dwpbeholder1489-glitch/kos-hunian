'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { useKos } from '@/components/KosProvider';
import { canArea, moduleOn } from '@/lib/business';
import { today } from '@/lib/format';

// Pengingat di dashboard: tindak lanjut prospek/pelanggan yang jatuh hari ini atau terlewat
export default function CrmHint() {
  const { kos, kosId, ver } = useKos();
  const [n, setN] = useState(0);
  const [req, setReq] = useState(0);
  const show = moduleOn(kos, 'u_crm') && canArea(kos, 'sell,rent') && !kos?.closed_at;
  useEffect(() => {
    if (!show) return;
    supabase.from('crm_tasks').select('id', { count: 'exact', head: true }).eq('kos_id', kosId).is('done_at', null).lte('due_date', today())
      .then(({ count }) => setN(count || 0), () => {});
    supabase.from('crm_leads').select('id', { count: 'exact', head: true }).eq('kos_id', kosId).eq('source', 'halaman').eq('stage', 'baru')
      .then(({ count }) => setReq(count || 0), () => {});
  }, [kosId, ver, show]);
  if (!show || (!n && !req)) return null;
  if (req) return <Link href="/crm" className="notice" style={{ display: 'block', textDecoration: 'none', color: 'inherit' }}>📨 <b>{req} permintaan baru</b> dari halaman bisnis{n ? ` · ${n} tindak lanjut jatuh tempo` : ''} · <span style={{ textDecoration: 'underline' }}>Buka</span></Link>;
  return <Link href="/crm" className="notice" style={{ display: 'block', textDecoration: 'none', color: 'inherit' }}>📞 <b>{n} tindak lanjut</b> jatuh tempo hari ini atau terlewat · <span style={{ textDecoration: 'underline' }}>Buka</span></Link>;
}
