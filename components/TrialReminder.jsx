'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';

// Pengingat masa coba (hari ke-10, ke-12, ke-14, dan saat berakhir). Server yang menentukan dan mencatat tampilannya
// (trial_reminder_next): sekali per tahap, paling banyak dua dalam tiga hari. Tidak menghalangi pekerjaan.
const TEKS = {
  hari10: (s) => `Masa coba Anda tinggal ${s} hari. Pilih paket sebelum berakhir agar fitur tetap terbuka.`,
  hari12: (s) => `Tinggal ${s} hari masa coba. Pilih paket untuk terus memakai fitur lengkap.`,
  hari14: () => 'Hari ini hari terakhir masa coba. Setelah ini bisnis menjadi paket Gratis.',
  habis: () => 'Masa coba sudah berakhir. Bisnis menjadi paket Gratis; data Anda tetap aman dan tidak dihapus.',
};
export default function TrialReminder({ kosId }) {
  const [r, setR] = useState(null);
  useEffect(() => {
    let on = true;
    supabase.rpc('trial_reminder_next', { p_kos: kosId }).then(({ data, error }) => { if (on && !error && data) setR(data); });
    return () => { on = false; };
  }, [kosId]);
  if (!r || !TEKS[r.kind]) return null;
  return (
    <div className="notice warn" style={{ display: 'flex', gap: 8, alignItems: 'center', justifyContent: 'space-between' }}>
      <span className="small">{TEKS[r.kind](r.sisa)}</span>
      <Link href="/langganan" className="small" style={{ whiteSpace: 'nowrap', textDecoration: 'underline' }}>Lihat paket</Link>
    </div>
  );
}
