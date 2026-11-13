'use client';
// Masuk · Daftar akun · Verifikasi email (kirim ulang) · Lupa & atur ulang kata sandi.
// Autentikasi tetap memakai Supabase Auth (kata sandi di-hash di sana); nama & No. WhatsApp disimpan di profil akun.
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { LogoMark } from '@/components/Logo';
import { useRouter } from 'next/navigation';
import { supabase, configured } from '@/lib/supabase';
import { useKos } from '@/components/KosProvider';
import { Field } from '@/components/ui';
import { waOk, waNorm, pwScore, emailOk, authMsg } from '@/lib/akun';
import Journey from '@/components/Journey';

const RESEND_WAIT = 60; // detik

function Pw({ value, onChange, auto, id, placeholder }) {
  const [show, setShow] = useState(false);
  return (
    <span className="pwbox">
      <input id={id} type={show ? 'text' : 'password'} autoComplete={auto} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} />
      <button type="button" className="ghost sm" onClick={() => setShow(!show)} aria-label={show ? 'Sembunyikan kata sandi' : 'Tampilkan kata sandi'} aria-pressed={show}>{show ? 'Sembunyikan' : 'Lihat'}</button>
    </span>
  );
}

function Strength({ pw }) {
  if (!pw) return null;
  const s = pwScore(pw);
  const [label, tone] = [['Terlalu pendek', 'bad'], ['Lemah', 'bad'], ['Sedang', 'warn'], ['Kuat', 'good']][s];
  return (
    <span className="pwmeter" role="status" aria-live="polite">
      <span className="bars" aria-hidden="true">{[1, 2, 3].map((i) => <i key={i} className={i <= s ? tone : ''} />)}</span>
      <span className="small" style={{ color: `var(--${tone})` }}>{label}{s < 2 ? ' — minimal 8 karakter, berisi huruf dan angka' : ''}</span>
    </span>
  );
}

export default function Masuk() {
  const router = useRouter();
  const { session } = useKos();
  const [mode, setMode] = useState('masuk'); // masuk | daftar | cek | lupa | lupa_terkirim | reset
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [wa, setWa] = useState('');
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const [agree, setAgree] = useState(false);
  const [trap, setTrap] = useState(''); // kolom jebakan untuk robot (tidak terlihat pengguna)
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  const [wait, setWait] = useState(0);
  const resetting = useRef(false);

  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    if (q.get('reset') || /type=recovery/.test(window.location.hash)) { resetting.current = true; setMode('reset'); } else if (q.get('daftar')) setMode('daftar');
    const { data } = supabase.auth.onAuthStateChange((e) => { if (e === 'PASSWORD_RECOVERY') { resetting.current = true; setMode('reset'); } });
    return () => data.subscription.unsubscribe();
  }, []);
  useEffect(() => { if (session && !resetting.current && mode !== 'reset') router.replace('/buka'); }, [session, router, mode]);
  useEffect(() => { if (wait <= 0) return; const t = setTimeout(() => setWait(wait - 1), 1000); return () => clearTimeout(t); }, [wait]);

  if (!configured) {
    return (
      <div className="auth">
        <p className="hello">PRASARA</p>
        <div className="notice bad">Aplikasi belum terhubung ke database. Isi NEXT_PUBLIC_SUPABASE_URL dan NEXT_PUBLIC_SUPABASE_ANON_KEY di pengaturan Environment Variables Vercel, lalu deploy ulang.</div>
      </div>
    );
  }

  const redirect = () => window.location.origin + '/buka';
  const go = (m) => { setMsg(null); setMode(m); };

  async function masuk(e) {
    e.preventDefault(); setMsg(null);
    if (!emailOk(email)) return setMsg(['bad', 'Isi alamat email yang benar, mis. nama@gmail.com.']);
    if (!pw) return setMsg(['bad', 'Isi kata sandi Anda.']);
    setBusy(true);
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password: pw });
    setBusy(false);
    if (!error) return;
    if (/Email not confirmed/i.test(error.message)) { setMode('cek'); return setMsg(['info', 'Email ini belum diverifikasi. Buka email dari PRASARA dan ketuk tautannya, atau kirim ulang di bawah.']); }
    setMsg(['bad', authMsg(error)]);
  }

  async function daftar(e) {
    e.preventDefault(); setMsg(null);
    if (name.trim().length < 3) return setMsg(['bad', 'Isi nama lengkap Anda (minimal 3 huruf).']);
    if (!emailOk(email)) return setMsg(['bad', 'Isi alamat email yang benar, mis. nama@gmail.com.']);
    if (!waOk(wa)) return setMsg(['bad', 'Isi nomor WhatsApp Indonesia yang benar, mis. 0812 3456 7890.']);
    if (pwScore(pw) < 2) return setMsg(['bad', 'Kata sandi minimal 8 karakter dan berisi huruf serta angka.']);
    if (pw !== pw2) return setMsg(['bad', 'Konfirmasi kata sandi belum sama.']);
    if (!agree) return setMsg(['bad', 'Centang persetujuan Syarat & Ketentuan dan Kebijakan Privasi untuk melanjutkan.']);
    if (trap) { setMode('cek'); return; } // robot: tidak membuat akun
    setBusy(true);
    const { data, error } = await supabase.auth.signUp({ email: email.trim(), password: pw,
      options: { emailRedirectTo: redirect(), data: { name: name.trim().slice(0, 80), whatsapp: waNorm(wa), agreed_at: new Date().toISOString() } } });
    setBusy(false);
    if (error) return setMsg(['bad', authMsg(error)]);
    // Supabase tidak mengembalikan galat untuk email yang sudah terdaftar (demi privasi): cirinya identities kosong
    if (data.user && Array.isArray(data.user.identities) && data.user.identities.length === 0) return setMsg(['dup', null]);
    if (!data.session) { setWait(RESEND_WAIT); setMode('cek'); }
  }

  async function kirimUlang() {
    setMsg(null); setBusy(true);
    const { error } = await supabase.auth.resend({ type: 'signup', email: email.trim(), options: { emailRedirectTo: redirect() } });
    setBusy(false);
    if (error) return setMsg(['bad', authMsg(error)]);
    setWait(RESEND_WAIT); setMsg(['good', 'Email verifikasi dikirim ulang. Periksa juga folder Spam/Promosi.']);
  }

  async function lupa(e) {
    e.preventDefault(); setMsg(null);
    if (!emailOk(email)) return setMsg(['bad', 'Isi alamat email akun Anda.']);
    setBusy(true);
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo: window.location.origin + '/masuk?reset=1' });
    setBusy(false);
    if (error) return setMsg(['bad', authMsg(error)]);
    setWait(RESEND_WAIT); setMode('lupa_terkirim');
  }

  async function simpanSandi(e) {
    e.preventDefault(); setMsg(null);
    if (pwScore(pw) < 2) return setMsg(['bad', 'Kata sandi minimal 8 karakter dan berisi huruf serta angka.']);
    if (pw !== pw2) return setMsg(['bad', 'Konfirmasi kata sandi belum sama.']);
    if (!session) return setMsg(['bad', 'Tautan atur ulang sudah tidak berlaku. Minta tautan baru lewat "Lupa kata sandi".']);
    setBusy(true);
    const { error } = await supabase.auth.updateUser({ password: pw });
    setBusy(false);
    if (error) return setMsg(['bad', authMsg(error)]);
    resetting.current = false; router.replace('/buka');
  }

  const Brand = <a href="/" className="brand" style={{ textDecoration: 'none', color: 'inherit' }}><LogoMark size={34} /><div><b>PRASARA</b><div className="small muted">Adaptive Business System</div></div></a>;
  const Note = msg && (msg[0] === 'dup'
    ? <div className="notice warn">Email ini sudah terdaftar. <button type="button" className="linkbtn" onClick={() => go('masuk')}>Masuk</button> atau <button type="button" className="linkbtn" onClick={() => go('lupa')}>atur ulang kata sandi</button>.</div>
    : <div className={'notice ' + msg[0]} role={msg[0] === 'bad' ? 'alert' : 'status'}>{msg[1]}</div>);

  if (mode === 'cek') return (
    <div className="auth">
      {Brand}
      <Journey at={1} />
      <p className="hello">Cek email Anda</p>
      <p className="muted" style={{ margin: 0 }}>Kami mengirim tautan verifikasi ke <b style={{ overflowWrap: 'anywhere' }}>{email || 'email Anda'}</b>. Ketuk tautan itu untuk mengaktifkan akun, lalu Anda langsung diarahkan untuk mendaftarkan bisnis.</p>
      <div className="panel" style={{ gap: 6 }}>
        <span className="small">• Belum masuk? Tunggu 1–2 menit dan periksa folder <b>Spam</b> atau <b>Promosi</b>.</span>
        <span className="small">• Tautan berlaku terbatas. Bila sudah kedaluwarsa, kirim ulang di bawah.</span>
        <span className="small">• Akun belum aktif sebelum email diverifikasi.</span>
      </div>
      {Note}
      <button className="primary" disabled={busy || wait > 0 || !emailOk(email)} onClick={kirimUlang}>{wait > 0 ? `Kirim ulang dalam ${wait} detik` : 'Kirim ulang email verifikasi'}</button>
      <button className="ghost" onClick={() => go('daftar')}>Email salah? Ubah & daftar ulang</button>
      <button className="ghost" onClick={() => go('masuk')}>Sudah verifikasi — Masuk</button>
      <Help />
    </div>
  );

  if (mode === 'lupa' || mode === 'lupa_terkirim') return (
    <div className="auth">
      {Brand}
      <p className="hello">Lupa kata sandi</p>
      {mode === 'lupa' ? (
        <form className="stack" onSubmit={lupa}>
          <p className="muted" style={{ margin: 0 }}>Isi email akun Anda. Kami kirim tautan untuk membuat kata sandi baru.</p>
          <Field label="Email"><input type="email" inputMode="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} /></Field>
          {Note}
          <button className="cta" disabled={busy}>{busy ? 'Sebentar…' : 'Kirim tautan atur ulang'}</button>
        </form>
      ) : (
        <>
          <div className="notice good">Bila email <b style={{ overflowWrap: 'anywhere' }}>{email}</b> terdaftar, tautan atur ulang sudah dikirim. Buka email itu di HP ini, ketuk tautannya, lalu buat kata sandi baru.</div>
          {Note}
          <button className="primary" disabled={busy || wait > 0} onClick={lupa}>{wait > 0 ? `Kirim ulang dalam ${wait} detik` : 'Kirim ulang'}</button>
        </>
      )}
      <button className="ghost" onClick={() => go('masuk')}>← Kembali ke Masuk</button>
      <Help />
    </div>
  );

  if (mode === 'reset') return (
    <div className="auth">
      {Brand}
      <p className="hello">Buat kata sandi baru</p>
      <form className="stack" onSubmit={simpanSandi}>
        <Field label="Kata sandi baru"><Pw value={pw} onChange={setPw} auto="new-password" /></Field>
        <Strength pw={pw} />
        <Field label="Ulangi kata sandi baru"><Pw value={pw2} onChange={setPw2} auto="new-password" /></Field>
        {pw2 && pw !== pw2 && <span className="small" style={{ color: 'var(--bad)' }}>Belum sama dengan kata sandi di atas.</span>}
        {Note}
        <button className="cta" disabled={busy}>{busy ? 'Menyimpan…' : 'Simpan & masuk'}</button>
      </form>
      <button className="ghost" onClick={() => { resetting.current = false; go('lupa'); }}>Minta tautan baru</button>
    </div>
  );

  return (
    <div className="auth">
      {Brand}
      {mode === 'daftar' && <Journey at={0} />}
      <p className="hello">{mode === 'masuk' ? 'Selamat datang kembali' : 'Buat akun PRASARA'}</p>
      <p className="muted" style={{ margin: 0 }}>{mode === 'masuk' ? 'Masuk untuk mengelola bisnis Anda.' : 'Satu akun untuk semua bisnis Anda. Gratis dicoba, tanpa kartu kredit.'} Karyawan yang diundang: daftar dengan email undangan.</p>
      <div className="seg">
        <button className={mode === 'masuk' ? 'on' : ''} onClick={() => go('masuk')}>Masuk</button>
        <button className={mode === 'daftar' ? 'on' : ''} onClick={() => go('daftar')}>Daftar baru</button>
      </div>
      {mode === 'masuk' ? (
        <form className="stack" onSubmit={masuk}>
          <Field label="Email"><input type="email" inputMode="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} /></Field>
          <Field label="Kata sandi"><Pw value={pw} onChange={setPw} auto="current-password" /></Field>
          {Note}
          <button className="cta" disabled={busy}>{busy ? 'Sebentar…' : 'Masuk'}</button>
          <button type="button" className="ghost" onClick={() => go('lupa')}>Lupa kata sandi?</button>
        </form>
      ) : (
        <form className="stack" onSubmit={daftar} noValidate>
          <Field label="Nama lengkap"><input autoComplete="name" value={name} maxLength={80} onChange={(e) => setName(e.target.value)} placeholder="mis. Siti Rahmawati" /></Field>
          <Field label="Email aktif" hint="Tautan verifikasi dikirim ke email ini"><input type="email" inputMode="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="nama@gmail.com" /></Field>
          <Field label="Nomor WhatsApp" hint="Untuk bantuan & info akun — tidak ditampilkan ke publik"><input type="tel" inputMode="tel" autoComplete="tel" value={wa} onChange={(e) => setWa(e.target.value)} placeholder="0812 3456 7890" /></Field>
          {wa && !waOk(wa) && <span className="small" style={{ color: 'var(--bad)' }}>Nomor diawali 08 atau +62, 10–13 angka.</span>}
          <Field label="Kata sandi"><Pw value={pw} onChange={setPw} auto="new-password" /></Field>
          <Strength pw={pw} />
          <Field label="Ulangi kata sandi"><Pw value={pw2} onChange={setPw2} auto="new-password" /></Field>
          {pw2 && pw !== pw2 && <span className="small" style={{ color: 'var(--bad)' }}>Belum sama dengan kata sandi di atas.</span>}
          <input className="hp" tabIndex={-1} autoComplete="off" aria-hidden="true" value={trap} onChange={(e) => setTrap(e.target.value)} name="website" />
          <label className="agree"><input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} /><span className="small">Saya menyetujui <Link href="/syarat" target="_blank">Syarat & Ketentuan</Link> dan <Link href="/privasi" target="_blank">Kebijakan Privasi</Link> PRASARA.</span></label>
          {Note}
          <button className="cta" disabled={busy}>{busy ? 'Membuat akun…' : 'Buat akun'}</button>
        </form>
      )}
      <Help />
    </div>
  );
}

function Help() {
  return <p className="small muted" style={{ margin: 0, textAlign: 'center' }}>Butuh bantuan? <Link href="/panduan">Panduan</Link> · <Link href="/">Tentang PRASARA</Link></p>;
}
