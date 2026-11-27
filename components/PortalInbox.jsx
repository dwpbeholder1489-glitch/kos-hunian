'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useKos } from '@/components/KosProvider';
import { supabase } from '@/lib/supabase';
import { rp } from '@/lib/format';

export function usePortalInbox() {
  const { kosId, ver } = useKos();
  const path = usePathname();
  const [state, setState] = useState(null);
  useEffect(() => {
    if (!kosId || !supabase) return;
    let active = true;
    async function refresh() {
      const { data, error } = await supabase.rpc('retail_portal_inbox', { p_kos: kosId });
      if (active && !error) setState({ kosId, rows: data || [] });
    }
    refresh();
    const timer = setInterval(() => { if (!document.hidden) refresh(); }, 30000);
    window.addEventListener('focus', refresh);
    return () => {
      active = false;
      clearInterval(timer);
      window.removeEventListener('focus', refresh);
    };
  }, [kosId, ver, path]);
  return state?.kosId === kosId ? state.rows : [];
}

const labels = { pesanan: 'Pesanan baru', penawaran: 'Penawaran baru', penawaran_disetujui: 'Penawaran disetujui', penawaran_negosiasi: 'Negosiasi penawaran', permintaan: 'Permintaan baru' };

export function PortalInboxList({ rows }) {
  if (!rows.length) return null;
  return <section className="panel" aria-label="Pemberitahuan portal">
    <h3>Pemberitahuan portal <span className="chip gold">{rows.length}</span></h3>
    <div className="list">{rows.map((row) => {
      const href = row.target === 'lead' ? `/crm?prospek=${row.id}` : `/grosir?${row.kind === 'penawaran_disetujui' ? '' : 'tab=penawaran&'}pesanan=${row.id}`;
      return <Link href={href} className="li" key={row.id} style={{ color: 'inherit', textDecoration: 'none' }}>
        <div className="main" style={{ minWidth: 0, overflowWrap: 'anywhere' }}>
          <b>{labels[row.kind] || labels.pesanan}</b>
          <span className="small muted">{[row.number, row.customer].filter(Boolean).join(' · ')}</span>
        </div>
        <span className="small" style={{ flexShrink: 0 }}>{row.total != null && rp(row.total)} ›</span>
      </Link>;
    })}</div>
  </section>;
}

export default function PortalInbox() {
  return <PortalInboxList rows={usePortalInbox()} />;
}
