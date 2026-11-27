'use client';
// Pembuka notifikasi push: tujuan diambil dari DATABASE (bukan dari alamat) setelah memeriksa penerima → tanpa open redirect.
import { useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { useKos } from '@/components/KosProvider';
import { refreshCounts } from '@/lib/notif';

export default function BukaNotifikasi() {
  const { id } = useParams();
  const router = useRouter();
  const { kosId, list, pickKos } = useKos();
  useEffect(() => {
    if (!list) return;
    let alive = true;
    supabase.rpc('notif_open', { p_id: id }).then(({ data }) => {
      if (!alive) return;
      const link = data?.link || '/pusat-notifikasi';
      if (data?.kos_id && data.kos_id !== kosId && list.some((k) => k.id === data.kos_id)) pickKos(data.kos_id);
      refreshCounts();
      router.replace(link);
    });
    return () => { alive = false; };
  }, [id, list?.length]);
  return <p className="muted" style={{ padding: 16 }}>Membuka notifikasi…</p>;
}
