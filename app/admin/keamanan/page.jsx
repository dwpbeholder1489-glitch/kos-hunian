'use client';
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useKos } from '@/components/KosProvider';
import { Loading, toast } from '@/components/ui';
import { tgl, errMsg } from '@/lib/format';

// Verifikasi dua langkah (TOTP) untuk staf. Di iPhone, tombol "Tambahkan ke aplikasi kode" membuka pengaturan kode verifikasi bawaan.
export default function Keamanan() {
  const { adminMe } = useKos();
  const [factors, setFactors] = useState(null);
  const [enroll, setEnroll] = useState(null);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const load = () => supabase.auth.mfa.listFactors().then(({ data }) => setFactors(data?.all || []));
  useEffect(() => { load(); }, []);
  if (!factors) return <Loading />;
  const verified = factors.filter((f) => f.factor_type === 'totp' && f.status === 'verified');

  const start = async () => {
    setBusy(true);
    for (const f of factors.filter((x) => x.status !== 'verified')) await supabase.auth.mfa.unenroll({ factorId: f.id });
    const { data, error } = await supabase.auth.mfa.enroll({ factorType: 'totp', friendlyName: 'PRASARA ' + new Date().toISOString().slice(0, 10) });
    setBusy(false);
    if (error) return toast(errMsg(error));
    setEnroll(data);
  };
  const confirm = async () => {
    setBusy(true);
    const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId: enroll.id, code: code.trim() });
    setBusy(false);
    if (error) return toast('Kode salah. Pastikan jam HP otomatis, lalu coba kode terbaru.');
    toast('Verifikasi dua langkah aktif'); setEnroll(null); setCode(''); load();
  };
  const remove = async (f) => {
    if (!window.confirm('Matikan verifikasi dua langkah? Akun admin menjadi kurang aman.')) return;
    const { error } = await supabase.auth.mfa.unenroll({ factorId: f.id });
    if (error) return toast(errMsg(error));
    toast('Verifikasi dua langkah dimatikan'); load();
  };

  return (
    <div className="stack">
      <h2>Keamanan akun admin</h2>
      <section className="panel">
        <h3>Verifikasi dua langkah (MFA)</h3>
        <p className="small muted" style={{ margin: 0 }}>Setelah aktif, membuka Management Center memerlukan kode 6 angka dari aplikasi kode. Kata sandi saja tidak cukup bila bocor. Gratis.</p>
        {verified.length > 0 ? <>
          <div className="notice good">Aktif sejak {tgl(String(verified[0].created_at).slice(0, 10))}. Sesi ini: {adminMe?.mfa?.aal === 'aal2' ? 'sudah diverifikasi kode' : 'belum diverifikasi'}.</div>
          <button className="ghost danger" onClick={() => remove(verified[0])}>Matikan</button>
        </> : !enroll ? <>
          {adminMe?.role === 'super_admin' && <div className="notice">Disarankan untuk Super Admin.</div>}
          <button className="primary" onClick={start} disabled={busy}>{busy ? 'Menyiapkan…' : 'Aktifkan'}</button>
        </> : <>
          <ol style={{ margin: 0, paddingLeft: 20, display: 'flex', flexDirection: 'column', gap: 6 }}>
            <li>Di iPhone: tekan tombol di bawah. Pilih simpan ke <b>Kata Sandi</b> (atau buka Google Authenticator dan tambahkan kunci manual).</li>
            <li>Kembali ke halaman ini, lalu masukkan 6 angka yang muncul untuk PRASARA.</li>
          </ol>
          <a href={enroll.totp.uri}><button className="primary" style={{ width: '100%' }}>Tambahkan ke aplikasi kode</button></a>
          <span className="small muted">Kunci manual: <code style={{ wordBreak: 'break-all' }}>{enroll.totp.secret}</code></span>
          <details><summary className="small">Pindai kode QR dari perangkat lain</summary><img src={enroll.totp.qr_code} alt="Kode QR verifikasi dua langkah" style={{ width: 200, height: 200, background: '#fff', padding: 8, borderRadius: 8 }} /></details>
          <input inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} placeholder="Kode 6 angka" aria-label="Kode 6 angka" style={{ fontSize: 22, letterSpacing: 4, textAlign: 'center' }} />
          <button className="cta" onClick={confirm} disabled={busy || code.length !== 6}>{busy ? 'Memeriksa…' : 'Aktifkan verifikasi'}</button>
        </>}
      </section>
      <section className="panel">
        <h3>Kebiasaan aman</h3>
        <ul style={{ margin: 0, paddingLeft: 20 }} className="small">
          <li>Jangan pernah membagikan kata sandi, kode verifikasi, atau kunci rahasia ke siapa pun — termasuk di chat.</li>
          <li>Tim PRASARA tidak pernah meminta kata sandi pelanggan.</li>
          <li>Nonaktifkan staf yang sudah tidak bertugas di menu Staf.</li>
        </ul>
      </section>
    </div>
  );
}
