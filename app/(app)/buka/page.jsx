'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useKos } from '@/components/KosProvider';
import { homeOf, canArea } from '@/lib/business';
import { online } from '@/lib/offline';

// "Buka aplikasi" dari halaman depan: langsung ke menu utama bisnis yang terakhir dibuka
export default function Buka() {
  const { kos, list } = useKos();
  const router = useRouter();
  // Banyak bisnis (dengan akses keuangan) → Ringkasan pemilik; satu bisnis → langsung ke menunya (blueprint 12.3)
  // Tanpa internet: toko langsung ke Kasir (halaman lain butuh internet)
  useEffect(() => {
    if (!kos) return;
    if ((!online() || kos.offline) && kos.business_type === 'retail' && canArea(kos, 'sell')) { router.replace('/kasir'); return; }
    router.replace((list || []).filter((k) => canArea(k, 'finance')).length > 1 ? '/bisnis' : homeOf(kos));
  }, [kos, list, router]);
  return <p className="muted">Membuka…</p>;
}
