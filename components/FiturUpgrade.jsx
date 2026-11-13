'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { GrowthSheet } from '@/components/GrowthOffer';

// Fitur Paket Bisnis yang belum dimiliki (V2 §6.2). Saat pemilik mengetuk, server memutuskan penawaran
// (growth_offer konteks 'fitur' + event); tanpa penawaran (frekuensi/aturan nonaktif) langsung ke Langganan.
// Karyawan hanya melihat keterangan, tanpa tombol.
export default function FiturUpgrade({ kosId, event, title, text, owner = true }) {
  const router = useRouter();
  const [offer, setOffer] = useState(null);
  const [busy, setBusy] = useState(false);
  const buka = async () => {
    setBusy(true);
    const { data: o } = await supabase.rpc('growth_offer', { p_kos: kosId, p_context: 'fitur', p_event: event });
    setBusy(false);
    if (!o) return router.push('/langganan?paket=bisnis&bulan=1');
    supabase.rpc('growth_track', { p_kos: kosId, p_rule: o.id, p_action: 'shown', p_event: event }).then(() => {}, () => {});
    setOffer(o);
  };
  return (
    <div className="lock noprint">
      <b>🔒 {title}</b>
      {text && <span className="small">{text}</span>}
      {owner ? <button className="primary sm" disabled={busy} onClick={buka}>{busy ? 'Memuat…' : 'Lihat Paket Bisnis'}</button>
        : <span className="small muted">Minta pemilik bisnis untuk naik ke Paket Bisnis.</span>}
      {offer && <GrowthSheet offer={offer} kosId={kosId} onDone={() => setOffer(null)} />}
    </div>
  );
}
