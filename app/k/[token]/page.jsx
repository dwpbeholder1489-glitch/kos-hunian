'use client';
// Halaman penyewa: baca kontrak (contract_public_get, anon + token) lalu setuju/tolak lewat /api/kontrak (server menghitung hash IP).
import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import KontrakDoc from '@/components/KontrakDoc';

export default function KontrakPenyewa() {
  const { token } = useParams();
  const [c, setC] = useState(undefined);
  const [name, setName] = useState('');
  const [note, setNote] = useState('');
  const [agree, setAgree] = useState(false);
  const [mode, setMode] = useState(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  const load = () => supabase.rpc('contract_public_get', { p_token: token }).then(({ data }) => setC(data || null), () => setC(null));
  useEffect(() => { load(); }, [token]); // eslint-disable-line react-hooks/exhaustive-deps
  if (c === undefined) return <main className="wrap" style={{ paddingTop: 30 }}><p className="muted">Memuat kontrak…</p></main>;
  if (!c) return <main className="wrap stack" style={{ paddingTop: 30, maxWidth: 640 }}><h1>Link tidak berlaku</h1><p>Kontrak tidak ditemukan, sudah dibatalkan, atau diganti versi baru. Hubungi pengelola untuk link terbaru.</p></main>;
  const respond = async (decision) => {
    setBusy(true); setMsg(null);
    try {
      const r = await fetch('/api/kontrak', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token, decision, name, note, hash: c.hash }) });
      const j = await r.json().catch(() => ({}));
      if (!j.ok) setMsg(j.error || 'Gagal menyimpan. Coba lagi.'); else { setMode(null); await load(); }
    } catch { setMsg('Koneksi terputus. Coba lagi.'); }
    setBusy(false);
  };
  const waiting = c.status === 'menunggu' && !c.tenant_approved_at;
  return <main className="wrap stack" style={{ paddingTop: 20, paddingBottom: 40, maxWidth: 860 }}>
    <div className="noprint">
      {waiting ? <div className="notice">Perjanjian sewa dari <b>{c.business}</b> untuk <b>{c.tenant}</b>. Baca seluruhnya, lalu pilih Setuju atau Tolak di bawah.</div>
        : c.status === 'aktif' ? <div className="notice good">Kontrak aktif — disetujui kedua pihak.</div>
        : c.status === 'ditolak' ? <div className="notice">Anda menolak kontrak ini. Pengelola akan mengirim versi baru.</div>
        : c.tenant_approved_at ? <div className="notice good">Terima kasih, persetujuan Anda tercatat. Menunggu tanda tangan pengelola.</div>
        : <div className="notice">Status kontrak: {c.status}.</div>}
    </div>
    <KontrakDoc c={{ ...c, body_hash: c.hash }} business={c.business} />
    {waiting && <section className="panel stack noprint">
      <label className="row small" style={{ flexWrap: 'nowrap' }}><input type="checkbox" style={{ width: 22, minHeight: 22, flex: 'none' }} checked={agree} onChange={(e) => setAgree(e.target.checked)} />Saya sudah membaca seluruh isi perjanjian ini.</label>
      <label className="stack" style={{ gap: 4 }}><span className="label">Ketik nama lengkap Anda (sebagai persetujuan elektronik)</span>
        <input value={name} maxLength={80} onChange={(e) => setName(e.target.value)} autoComplete="name" /></label>
      {mode === 'tolak' && <label className="stack" style={{ gap: 4 }}><span className="label">Bagian yang perlu diubah / alasan</span><textarea value={note} maxLength={500} onChange={(e) => setNote(e.target.value)} /></label>}
      {msg && <div className="notice bad small">{msg}</div>}
      <div className="row">
        <button className="primary" disabled={busy || !agree || name.trim().length < 3} onClick={() => respond('setuju')}>{busy ? 'Menyimpan…' : 'Setuju'}</button>
        {mode === 'tolak' ? <button disabled={busy || name.trim().length < 3 || note.trim().length < 3} onClick={() => respond('tolak')}>Kirim penolakan</button>
          : <button className="ghost" onClick={() => setMode('tolak')}>Tolak / minta perubahan</button>}
      </div>
      <span className="small muted">Yang dicatat: nama yang Anda ketik, waktu, kode isi dokumen, dan sidik alamat jaringan (bukan alamat aslinya). Ini persetujuan elektronik internal, bukan tanda tangan elektronik tersertifikasi.</span>
    </section>}
    <button className="noprint" onClick={() => window.print()}>Cetak / Simpan PDF</button>
    <footer className="small muted noprint" style={{ textAlign: 'center' }}>Dikelola {c.business} dengan <a href="/">PRASARA</a></footer>
  </main>;
}
