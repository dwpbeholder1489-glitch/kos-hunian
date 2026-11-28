'use client';
// Pelanggan cek status pesanan: nomor pesanan + No. WhatsApp yang dipakai saat memesan. Tidak perlu akun.
// Setelah ditemukan: tracking bertahap (lib/tracking svcTracking — menyesuaikan jemput/antar/kuliner) + chat dengan bisnis
// (/api/publik/chat, kredensial yang sama diperiksa ulang di database setiap permintaan).
import { CustomerGuide } from '@/components/InteractiveGuide';
import { CUSTOMER_HELP } from '@/lib/customerGuide';
import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import PublicPay from '@/components/PublicPay';
import CustomerChat from '@/components/commerce/CustomerChat';
import { TrackingView } from '@/components/commerce/ChatParts';

export default function Cek() {
  const { slug } = useParams();
  const [no, setNo] = useState('');
  const [hp, setHp] = useState('');
  const [o, setO] = useState(null);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [cred, setCred] = useState(null); // {number, phone} yang sudah terbukti cocok
  const [track, setTrack] = useState(null);
  const [chat, setChat] = useState(false);
  useEffect(() => { try { const n = new URLSearchParams(window.location.search).get('no'); if (n) setNo(n); } catch {} }, []);
  const go = async (e, number = no, phone = hp) => {
    e?.preventDefault(); setErr(''); setBusy(true); setTrack(null);
    try {
      const r = await fetch('/api/publik/status', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ slug, number, phone }) });
      const d = await r.json().catch(() => ({}));
      if (!d.ok) { setO(null); setCred(null); setErr(d.error || 'Pesanan tidak ditemukan.'); } else { setO(d); setCred({ number: number.trim(), phone }); setNo(number); setChat(false); }
    } catch { setErr('Koneksi terputus. Coba lagi.'); }
    setBusy(false);
  };
  return (
    <CustomerGuide business={slug} kind="status" help={CUSTOMER_HELP.status}><main className="wrap stack" style={{ maxWidth: 560, paddingTop: 20, paddingBottom: 40 }}>
      <a href={`/b/${slug}`} className="small">← Kembali ke halaman</a>
      <h1 style={{ margin: 0, fontSize: 24 }}>Cek status pesanan</h1>
      <form className="panel stack" onSubmit={go}>
        <label className="f">Nomor pesanan<input value={no} onChange={(e) => setNo(e.target.value.toUpperCase())} placeholder="mis. PSN-261107-001" autoCapitalize="characters" required /></label>
        <label className="f">No. WhatsApp yang dipakai saat memesan<input inputMode="tel" value={hp} onChange={(e) => setHp(e.target.value)} placeholder="08…" required autoComplete="tel" /></label>
        {err && <div className="notice bad">{err}</div>}
        <button className="cta" type="submit" disabled={busy}>{busy ? 'Memeriksa…' : 'Cek status'}</button>
      </form>
      {o && cred && <Found slug={slug} o={o} cred={cred} track={track} setTrack={setTrack} chat={chat} setChat={setChat} onOrder={(number) => go(null, number, cred.phone)} />}
    </main></CustomerGuide>
  );
}

// Tracking + chat untuk pesanan yang sudah ditemukan
function Found({ slug, o, cred, track, setTrack, chat, setChat, onOrder }) {
  const auth = { slug, number: cred.number, phone: cred.phone };
  const key = JSON.stringify(auth);
  useEffect(() => {
    let alive = true;
    const load = () => fetch('/api/publik/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...JSON.parse(key), ref: 'nomor', operation: 'track' }) })
      .then((r) => (r.ok ? r.json() : null)).then((d) => { if (alive && d && !d.error) setTrack(d); }).catch(() => {});
    load();
    const t = setInterval(() => { if (!document.hidden) load(); }, 20000);
    return () => { alive = false; clearInterval(t); };
  }, [key, setTrack]);
  const t = track || { ...o, type: 'svc_order' };
  return <>
    {o.status === 'batal' && <div className="notice bad">Pesanan dibatalkan{o.void_reason ? `: ${o.void_reason}` : ''}.</div>}
    {chat ? <CustomerChat endpoint="/api/publik/chat" auth={auth} refId="nomor" back={() => setChat(false)} onOpenReference={() => setChat(false)}
      onCard={(kind, payload) => { if (kind === 'pesanan' && payload.number) onOrder(payload.number); }} />
      : <TrackingView track={t} onContact={() => setChat(true)} contactLabel="Chat dengan Bisnis" />}
    {!chat && o.status !== 'batal' && o.status !== 'permintaan' && !o.lunas && <PublicPay slug={slug} note="Setelah membayar, kirim bukti transfer lewat chat agar pembayaran dicatat." />}
    {!chat && o.status === 'permintaan' && <span className="small muted">Total masih perkiraan; dikonfirmasi saat barang diterima.</span>}
  </>;
}
