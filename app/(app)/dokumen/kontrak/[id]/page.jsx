'use client';
// Cetak / PDF kontrak sewa untuk pengelola (area sewa). Isi = lease_contracts (dibekukan saat dikirim).
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { useKos } from '@/components/KosProvider';
import { Loading } from '@/components/ui';
import KontrakDoc from '@/components/KontrakDoc';

export default function CetakKontrak() {
  const { id } = useParams();
  const { kos } = useKos();
  const [c, setC] = useState(undefined);
  useEffect(() => {
    supabase.from('lease_contracts').select('id,number,title,body,body_hash,status,tenant_name,tenant_approved_at,tenant_note,owner_name,owner_signed_at').eq('id', id).maybeSingle()
      .then(({ data }) => setC(data || null));
  }, [id]);
  if (c === undefined) return <Loading />;
  if (!c) return <div className="notice bad">Kontrak tidak ditemukan.</div>;
  return <div className="stack">
    <div className="row between noprint"><Link href="/kontrak">‹ Kontrak sewa</Link><button className="primary" onClick={() => window.print()}>Cetak / Simpan PDF</button></div>
    {c.status === 'draf' && <div className="notice noprint">Masih draf — isi bisa berubah dan belum punya kode isi.</div>}
    <KontrakDoc c={c} business={kos?.name} />
  </div>;
}
