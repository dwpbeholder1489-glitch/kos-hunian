'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useKos } from '@/components/KosProvider';
import { pathAllowed } from '@/lib/business';
import { angka, today } from '@/lib/format';
import { supabase } from '@/lib/supabase';

export function useCrmDue() {
  const { kos, kosId, ver } = useKos();
  const path = usePathname();
  const [result, setResult] = useState(null);
  const allowed = Boolean(kos && kosId && pathAllowed(kos, '/crm'));

  useEffect(() => {
    if (!allowed) return;
    const controller = new AbortController();
    supabase.from('crm_tasks').select('id', { count: 'exact', head: true })
      .eq('kos_id', kosId).is('done_at', null).lte('due_date', today()).abortSignal(controller.signal)
      .then(({ count }) => {
        if (!controller.signal.aborted) setResult({ kosId, ver, path, count: count ?? 0 });
      });
    return () => controller.abort();
  }, [allowed, kosId, ver, path]);

  return allowed && result?.kosId === kosId && result.ver === ver && result.path === path ? result.count : 0;
}

export default function CrmDue({ count }) {
  return count > 0 && <Link href="/crm?tab=tugas" className="li">
    <span className="main"><b>{angka(count)} tindak lanjut CRM jatuh tempo</b><small>Termasuk jadwal hari ini dan yang terlewat.</small></span><span aria-hidden="true">›</span>
  </Link>;
}
