'use client';
// Tombol "+" (aksi cepat) membuka halaman dengan ?baru=… → langsung tampilkan formulir tambah, lalu bersihkan alamat.
import { useEffect } from 'react';

export function useBaru(open) {
  useEffect(() => {
    try {
      const u = new URL(window.location.href); const v = u.searchParams.get('baru');
      if (!v) return;
      u.searchParams.delete('baru'); window.history.replaceState(null, '', u.pathname + (u.search || '') + u.hash);
      open(v);
    } catch {}
    // sekali saat halaman dibuka
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
}
