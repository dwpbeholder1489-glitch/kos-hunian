'use client';
import { useEffect } from 'react';
import { supabase } from '@/lib/supabase';

// Menghitung kunjungan halaman publik untuk Growth Analytics (V2 §12): hanya +1 per halaman per hari di database,
// tanpa ID pengunjung, cookie, alamat IP, atau data pribadi. Satu kali per halaman per tab (sessionStorage).
export function useHitungKunjungan(path) {
  useEffect(() => {
    const key = `prasara-kunjung-${path}`;
    try { if (sessionStorage.getItem(key)) return; sessionStorage.setItem(key, '1'); } catch {}
    supabase.rpc('site_visit', { p_path: path }).then(() => {}, () => {});
  }, [path]);
}

export default function HitungKunjungan({ path }) {
  useHitungKunjungan(path);
  return null;
}
