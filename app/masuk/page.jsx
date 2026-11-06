'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase, configured } from '@/lib/supabase';
import { useKos } from '@/components/KosProvider';
import { Field } from '@/components/ui';

export default function Masuk() {
  const router = useRouter();
  const { session } = useKos();
  const [mode, setMode] = useState('masuk');
  const [email, setEmail] = useState('');
  const [pw, setPw] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);

  useEffect(() => { if (session) router.replace('/beranda'); }, [session, router]);
  useEffect(() => { if (new URLSearchParams(window.location.search).get('daftar')) setMode('daftar'); }, []);

  if (!configured) {
    return (
      <div className="auth">
        <p className="hello">PRASARA</p>
        <div className="notice bad">Aplikasi belum terhubung ke database. Isi NEXT_PUBLIC_SUPABASE_URL dan NEXT_PUBLIC_SUPABASE_ANON_KEY di pengaturan Environment Variables Vercel, lalu deploy ulang.</div>
      </div>
    );
  }

  async function submit(e) {
    e.preventDefault();
    setMsg(null);
    if (!email.includes('@')) return setMsg(['bad', 'Isi email yang benar.']);
    if (pw.length < 6) return setMsg(['bad', 'Kata sandi minimal 6 karakter.']);
    setBusy(true);
    if (mode === 'masuk') {
      const { error } = await supabase.auth.signInWithPassword({ email, password: pw });
      if (error) setMsg(['bad', /Invalid login/i.test(error.message) ? 'Email atau kata sandi salah.' : /Email not confirmed/i.test(error.message) ? 'Email belum dikonfirmasi. Cek kotak masuk email Anda.' : error.message]);
    } else {
      const { data, error } = await supabase.auth.signUp({ email, password: pw, options: { emailRedirectTo: window.location.origin + '/beranda' } });
      if (error) setMsg(['bad', /already registered/i.test(error.message) ? 'Email ini sudah terdaftar. Silakan masuk.' : error.message]);
      else if (!data.session) setMsg(['info', 'Akun dibuat. Buka email Anda dan klik tautan konfirmasi, lalu kembali ke sini untuk masuk.']);
    }
    setBusy(false);
  }

  return (
    <div className="auth">
      <a href="/" className="brand" style={{ textDecoration: 'none', color: 'inherit' }}><span className="mark">P</span><div><b>PRASARA</b><div className="small muted">One Intelligence. Every Business.</div></div></a>
      <p className="hello">{mode === 'masuk' ? 'Selamat datang kembali' : 'Kelola bisnis jadi lebih rapi'}</p>
      <p className="muted" style={{ margin: 0 }}>Kos, toko, dan usaha Anda lainnya dalam satu aplikasi. Karyawan yang diundang: daftar dengan email undangan.</p>
      <div className="seg">
        <button className={mode === 'masuk' ? 'on' : ''} onClick={() => setMode('masuk')}>Masuk</button>
        <button className={mode === 'daftar' ? 'on' : ''} onClick={() => setMode('daftar')}>Daftar baru</button>
      </div>
      <form className="stack" onSubmit={submit}>
        <Field label="Email"><input type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} /></Field>
        <Field label="Kata sandi" hint={mode === 'daftar' ? 'Minimal 6 karakter' : null}>
          <input type="password" autoComplete={mode === 'masuk' ? 'current-password' : 'new-password'} value={pw} onChange={(e) => setPw(e.target.value)} />
        </Field>
        {msg && <div className={'notice ' + msg[0]}>{msg[1]}</div>}
        <button className="cta" disabled={busy}>{busy ? 'Sebentar…' : mode === 'masuk' ? 'Masuk' : 'Buat akun'}</button>
      </form>
    </div>
  );
}
