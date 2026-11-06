'use client';
import { useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';

// Tautan dari bagian bawah email arahan. Pemilik menekan tombol dulu, supaya pemindai tautan email tidak ikut menghentikan.
export default function Berhenti() {
  const { token } = useParams();
  const [state, setState] = useState(null);
  const stop = async () => {
    setState('busy');
    const { data, error } = await supabase.rpc('onboarding_unsubscribe', { p_token: String(token) });
    setState(error || !data ? 'gagal' : { name: data });
  };
  return (
    <div className="auth">
      <p className="hello">PRASARA</p>
      <section className="panel">
        {state && state.name ? (
          <>
            <b>Email arahan untuk {state.name} sudah dihentikan.</b>
            <span className="small muted">Pengingat tagihan dan daftar tagih harian tidak terpengaruh. Untuk menyalakannya lagi: Pengaturan → Email arahan dari PRASARA.</span>
            <Link href="/beranda"><button className="primary">Buka aplikasi</button></Link>
          </>
        ) : (
          <>
            <b>Berhenti terima email arahan & info?</b>
            <span className="small muted">Email arahan (langkah memakai PRASARA) dan email info fitur/tips akan berhenti. Pengingat tagihan, daftar tagih harian, dan pengumuman layanan penting tetap dikirim.</span>
            {state === 'gagal' && <div className="notice bad">Tautan tidak dikenali. Matikan lewat Pengaturan di aplikasi.</div>}
            <button className="primary" disabled={state === 'busy'} onClick={stop}>{state === 'busy' ? 'Memproses…' : 'Ya, berhenti'}</button>
          </>
        )}
      </section>
    </div>
  );
}
