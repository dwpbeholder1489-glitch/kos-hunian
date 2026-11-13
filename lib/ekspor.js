'use client';
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { toast } from '@/components/ui';
import { errMsg } from '@/lib/format';

// Kuota ekspor laporan per bulan (Paket V2 §4.2).
// Sisa kuota dibaca dari server saat halaman dibuka (export_quota) → tombol dikunci bila habis.
// Saat diketuk, file dibuat LANGSUNG (agar unduhan/cetak tidak diblokir Safari iPhone karena menunggu jaringan),
// lalu dicatat di server (export_take), yang tetap menolak bila kuota sudah habis.
// Bisnis yang ditutup (arsip) tetap boleh mengunduh dan tidak dihitung.
export function useKuotaEkspor(kosId) {
  const [q, setQ] = useState(null);
  const muat = () => supabase.rpc('export_quota', { p_kos: kosId }).then(({ data, error }) => setQ(error ? { allowed: true, error: true } : data));
  useEffect(() => { if (kosId) muat(); }, [kosId]); // eslint-disable-line react-hooks/exhaustive-deps

  const habis = q ? q.allowed === false : false;
  // jalankan(jenis, fn): fn = pembuat file/cetak (sinkron)
  const jalankan = (jenis, fn) => {
    if (habis) return toast(q.message || 'Kuota ekspor bulan ini sudah habis.');
    fn();
    supabase.rpc('export_take', { p_kos: kosId, p_kind: jenis }).then(({ data, error }) => {
      if (error) { toast(errMsg(error)); muat(); return; }
      if (data?.limit != null) {
        setQ((x) => ({ ...(x || {}), used: data.used, limit: data.limit, allowed: data.used < data.limit,
          message: data.used >= data.limit ? 'Kuota ekspor bulan ini sudah habis. Kuota terisi lagi tanggal 1, atau upgrade paket di Langganan.' : null }));
        if (data.used >= data.limit) toast(`Ini ekspor terakhir bulan ini (${data.used} dari ${data.limit}).`);
      }
    });
  };
  const info = q && q.limit != null && q.limit > 0 ? `Ekspor bulan ini: ${q.used} dari ${q.limit}` : null;
  return { q, habis, info, jalankan };
}
