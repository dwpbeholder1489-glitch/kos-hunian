'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';

// Peringatan kuota 80% & 100% (Paket V2 §8). Angka dari database (kuota_status), hanya untuk pemilik.
// Bisa ditutup; muncul lagi setelah 7 hari (disimpan di perangkat ini).
const TUTUP_MS = 7 * 864e5;
export default function KuotaBar({ kosId }) {
  const key = `prasara-kuota-tutup-${kosId}`;
  const [items, setItems] = useState([]);
  const [tutup, setTutup] = useState(true); // true sampai status tutup dibaca (hindari kedip)
  useEffect(() => {
    let on = true;
    try { setTutup(Date.now() - (Number(localStorage.getItem(key)) || 0) < TUTUP_MS); } catch { setTutup(false); }
    supabase.rpc('kuota_status', { p_kos: kosId }).then(({ data, error }) => {
      if (on && !error && Array.isArray(data)) setItems(data.filter((x) => Number(x.pct) >= 80));
    });
    return () => { on = false; };
  }, [kosId]); // eslint-disable-line react-hooks/exhaustive-deps
  if (tutup || !items.length) return null;
  const close = () => { try { localStorage.setItem(key, String(Date.now())); } catch {} setTutup(true); };
  return (
    <div className="stack" style={{ gap: 6 }}>
      {items.map((x) => (
        <div key={x.key} className={'notice ' + (Number(x.pct) >= 100 ? 'bad' : 'warn')} style={{ display: 'flex', gap: 8, alignItems: 'center', justifyContent: 'space-between' }}>
          <span className="small">
            {Number(x.pct) >= 100 ? `${x.label} penuh (${x.used} dari ${x.limit}).` : `${x.label} sudah ${x.pct}% terpakai (${x.used} dari ${x.limit}).`}{' '}
            <Link href="/langganan" style={{ textDecoration: 'underline' }}>Lihat paket</Link>
          </span>
        </div>
      ))}
      <button className="sm ghost" style={{ alignSelf: 'flex-end' }} onClick={close}>Tutup peringatan</button>
    </div>
  );
}
