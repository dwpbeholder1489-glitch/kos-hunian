'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useKos } from '@/components/KosProvider';
import { homeOf } from '@/lib/business';

// "Buka aplikasi" dari halaman depan: langsung ke menu utama bisnis yang terakhir dibuka
export default function Buka() {
  const { kos } = useKos();
  const router = useRouter();
  useEffect(() => { if (kos) router.replace(homeOf(kos)); }, [kos, router]);
  return <p className="muted">Membuka…</p>;
}
