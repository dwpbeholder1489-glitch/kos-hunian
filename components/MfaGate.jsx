'use client';
import { useState } from 'react';
import { supabase } from '@/lib/supabase';
import { errMsg } from '@/lib/format';

// Super Admin yang sudah mengaktifkan verifikasi dua langkah wajib memasukkan kode 6 angka sebelum membuka Management Center
export default function MfaGate() {
  const [code, setCode] = useState('');
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(false);
  const verify = async (e) => {
    e.preventDefault();
    setBusy(true); setErr(null);
    const { data } = await supabase.auth.mfa.listFactors();
    const f = (data?.totp || []).find((x) => x.status === 'verified');
    if (!f) { setBusy(false); return setErr('Faktor verifikasi tidak ditemukan.'); }
    const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId: f.id, code: code.trim() });
    setBusy(false);
    if (error) return setErr(/invalid|code/i.test(error.message) ? 'Kode salah atau sudah kedaluwarsa. Coba kode terbaru.' : errMsg(error));
    window.location.reload();
  };
  return (
    <form className="auth" onSubmit={verify}>
      <p className="hello" style={{ fontSize: 26 }}>Verifikasi dua langkah</p>
      <p className="muted" style={{ margin: 0 }}>Buka aplikasi kode (Kata Sandi iPhone / Google Authenticator), lalu masukkan 6 angka untuk PRASARA.</p>
      <input inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} placeholder="123456" aria-label="Kode 6 angka" style={{ fontSize: 24, letterSpacing: 6, textAlign: 'center' }} />
      {err && <div className="notice bad">{err}</div>}
      <button className="cta" disabled={busy || code.length !== 6}>{busy ? 'Memeriksa…' : 'Masuk'}</button>
    </form>
  );
}
