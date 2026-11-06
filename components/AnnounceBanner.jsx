'use client';
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useKos } from '@/components/KosProvider';

const KEY = 'prasara.announce.dismissed';
// Banner pengumuman dari tim PRASARA (bisa ditutup; tersimpan di HP ini)
export default function AnnounceBanner() {
  const { kosId } = useKos();
  const [items, setItems] = useState([]);
  const [hidden, setHidden] = useState([]);
  useEffect(() => { try { setHidden(JSON.parse(localStorage.getItem(KEY) || '[]')); } catch {} }, []);
  useEffect(() => { if (kosId) supabase.rpc('my_announcements', { p_kos: kosId }).then(({ data }) => setItems(data || [])).catch(() => {}); }, [kosId]);
  const shown = items.filter((a) => !hidden.includes(a.id));
  if (!shown.length) return null;
  const close = (id) => { const h = [...hidden, id].slice(-50); setHidden(h); try { localStorage.setItem(KEY, JSON.stringify(h)); } catch {} };
  return (
    <div className="wrap noprint" style={{ paddingTop: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
      {shown.map((a) => (
        <div key={a.id} className={'announce ' + a.kind} role="status">
          <div style={{ flex: 1, minWidth: 0 }}><b>{a.title}</b><div className="small" style={{ whiteSpace: 'pre-wrap' }}>{a.body}</div></div>
          <button className="ghost sm" aria-label="Tutup pengumuman" onClick={() => close(a.id)}>✕</button>
        </div>
      ))}
    </div>
  );
}
