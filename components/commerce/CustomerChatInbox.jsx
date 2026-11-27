'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';

export default function CustomerChatInbox({ kosId }) {
  const [rows, setRows] = useState(null);
  const [filter, setFilter] = useState('');
  const [error, setError] = useState(false);
  useEffect(() => {
    let alive = true;
    async function refresh() {
      const result = await supabase.rpc('cx_owner_inbox', { p_kos: kosId });
      if (!alive) return;
      setError(Boolean(result.error));
      if (!result.error) setRows(result.data || []);
    }
    refresh();
    const timer = setInterval(() => { if (!document.hidden) refresh(); }, 10000);
    return () => { alive = false; clearInterval(timer); };
  }, [kosId]);
  const visible = rows?.filter((row) => [row.number, row.customer].some((value) => value?.toLowerCase().includes(filter.trim().toLowerCase())));
  return <section className="panel" aria-label="Chat pelanggan">
    <h2>Chat pelanggan</h2>
    <input type="search" placeholder="Cari pelanggan atau nomor transaksi" aria-label="Cari percakapan" value={filter} onChange={(event) => setFilter(event.target.value)} />
    {error && <p role="alert">Percakapan sedang tidak tersedia.</p>}
    {!rows && !error && <p>Memuat percakapan…</p>}
    {visible?.length === 0 && <p>{filter ? 'Tidak ada hasil pencarian.' : 'Belum ada percakapan.'}</p>}
    <div className="list">{visible?.map((row) => <Link key={row.id} className="li" href={`/grosir?pesanan=${row.id}&chat=1`}>
      <span><b>{row.number}</b>{row.customer && <span> · {row.customer}</span>}</span>
      {row.unread > 0 && <span className="chip gold">{row.unread} belum dibaca</span>}
    </Link>)}</div>
  </section>;
}
