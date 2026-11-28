'use client';
// Chat pelanggan ↔ bisnis (gambar acuan "Chat dengan Toko"). Dipakai portal toko (/b, cookie tamu), portal grosir (/c, token pribadi)
// dan cek pesanan jasa (/b/[slug]/cek, nomor + No. HP). Semua lewat endpoint server yang memeriksa kredensial di database.
// refId: id transaksi | 'umum' (chat tanpa transaksi) | 'nomor' (jasa). Pesan diperbarui tiap 5 detik saat layar terlihat.
import { useCallback, useEffect, useRef, useState } from 'react';
import { BusinessHead, Composer, MessageList, Powered, RefCard, usePendingId } from './ChatParts';
import { logoUrl } from '@/lib/logo';
import styles from './customer-chat.module.css';

export default function CustomerChat({ endpoint, auth = {}, refId, full = false, onOpenReference, onCard, onPay, title, back }) {
  const [data, setData] = useState(null);
  const [messages, setMessages] = useState([]);
  const [older, setOlder] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [who, setWho] = useState({ name: '', phone: '' });
  const listRef = useRef(null);
  const stick = useRef(true);
  const readRef = useRef(null);
  const exhausted = useRef(false);
  const files = useRef(new Map());
  const pending = usePendingId();
  const authKey = JSON.stringify(auth);

  const call = useCallback(async (operation, extra = {}, file = null) => {
    const payload = { action: 'conversation', ...JSON.parse(authKey), ref: refId, operation, ...extra };
    let body = JSON.stringify(payload); let headers = { 'Content-Type': 'application/json' };
    if (file) { body = new FormData(); body.set('request', JSON.stringify(payload)); body.set('file', file); headers = undefined; }
    const res = await fetch(endpoint, { method: 'POST', headers, body, cache: 'no-store' });
    const out = await res.json().catch(() => ({}));
    if (!res.ok || out?.error) throw new Error(out?.error || 'Chat sedang tidak tersedia. Coba lagi.');
    return out;
  }, [endpoint, authKey, refId]);

  const load = useCallback(async (before) => {
    const out = await call('list', before ? { before } : {});
    setData(out);
    setError('');
    setMessages((cur) => {
      const map = new Map(cur.filter((m) => !m.pending).map((m) => [m.id, m]));
      for (const m of out.messages || []) map.set(m.id, m);
      for (const m of cur) if (m.pending && !map.has(m.id)) map.set(m.id, m);
      return [...map.values()].sort((a, b) => a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id));
    });
    const n = (out.messages || []).length;
    if (before) { exhausted.current = n < 40; setOlder(n === 40); } else setOlder(!exhausted.current && n === 40);
  }, [call]);

  useEffect(() => {
    let alive = true;
    const tick = () => { if (!document.hidden) load().catch((e) => alive && setError(e.message)); };
    tick();
    const timer = setInterval(tick, 5000);
    return () => { alive = false; clearInterval(timer); };
  }, [load]);

  // gulir ke bawah saat pesan baru masuk (kecuali pengguna sedang membaca pesan lama)
  useEffect(() => {
    const el = listRef.current;
    if (el && stick.current) el.scrollTop = el.scrollHeight;
  }, [messages.length]);
  useEffect(() => {
    const el = listRef.current;
    if (!el) return;
    const onScroll = () => { stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80; };
    el.addEventListener('scroll', onScroll);
    return () => el.removeEventListener('scroll', onScroll);
  }, [data !== null]);
  // tandai balasan bisnis sudah dibaca
  useEffect(() => {
    if (document.hidden) return;
    const latest = [...messages].reverse().find((m) => m.sender === 'business' && !m.read_at && !m.pending);
    if (!latest || latest.id === readRef.current) return;
    readRef.current = latest.id;
    call('read', { message: latest.id }).catch(() => { readRef.current = null; });
  }, [messages, call]);

  const needWho = data?.need_identity && !(who.name.trim().length >= 2 && who.phone.replace(/\D/g, '').length >= 9);
  const idExtra = data?.need_identity ? { name: who.name.trim(), contact_phone: who.phone } : {};

  async function send(text) {
    if (needWho) { setError('Isi nama dan No. WhatsApp agar toko bisa membalas.'); return false; }
    const p = pending('t:' + text);
    setBusy(true); setError('');
    stick.current = true;
    setMessages((cur) => cur.some((m) => m.id === p.id) ? cur : [...cur, { id: p.id, sender: 'customer', kind: 'teks', body: text, created_at: new Date().toISOString(), pending: true }]);
    try { await call('send', { message: p.id, content: text, ...idExtra }); p.done(); await load(); return true; }
    catch (e) { setError(e.message); setMessages((cur) => cur.filter((m) => m.id !== p.id)); return false; }
    finally { setBusy(false); }
  }
  async function sendFile(file) {
    if (needWho) { setError('Isi nama dan No. WhatsApp agar toko bisa membalas.'); return; }
    if (file.size > 3e6) { setError('Lampiran maksimal 3 MB.'); return; }
    const p = pending('f:' + file.name + file.size);
    setBusy(true); setError('');
    try { await call('send', { message: p.id, content: '', ...idExtra }, file); p.done(); stick.current = true; await load(); }
    catch (e) { setError(e.message); }
    finally { setBusy(false); }
  }
  const openFile = useCallback(async (id) => {
    const hit = files.current.get(id);
    if (hit && hit.at > Date.now() - 8 * 60e3) return hit.url;
    const out = await call('file', { message: id });
    files.current.set(id, { url: out.url, at: Date.now() });
    return out.url;
  }, [call]);

  const ref = data?.reference;
  const so = ref?.type === 'so_order';
  const names = (ref?.lines || []).slice(0, 2).map((l) => l.name).join(', ');
  const chips = [
    ...(so && ref.status === 'penawaran' && onOpenReference ? [[ref.quote_ready ? 'Lihat penawaran' : 'Lihat permintaan', () => onOpenReference(ref)]] : []),
    ...(refId === 'umum' || so ? [['Cek stok', () => (names ? `Halo, apakah stok ${names} masih tersedia?` : 'Halo, apakah barang ini masih tersedia?')]] : []),
    ['Cara bayar', () => (onPay ? onPay() : 'Bagaimana cara pembayarannya?')],
    ...(so && ref.fulfillment !== 'ambil' ? [['Estimasi kirim', () => 'Kira-kira pesanan saya tiba kapan?']] : []),
    ...(ref?.type === 'svc_order' ? [['Kapan selesai?', () => 'Kira-kira pesanan saya selesai kapan?']] : []),
  ];
  const off = data && data.enabled === false;

  return <section className={`${styles.wrap} ${full ? styles.full : ''}`} aria-label="Chat dengan bisnis">
    <BusinessHead business={data?.business} logo={data?.business?.logo ? logoUrl(data.business.logo) : null} title={title}
      extra={back && <button type="button" className={styles.round} aria-label="Tutup chat" onClick={back}>✕</button>} />
    {ref && <RefCard reference={ref} onOpen={onOpenReference ? () => onOpenReference(ref) : null} />}
    {error && <p role="alert" className={styles.alert}>{error}</p>}
    {off && <p className={styles.info}>Chat sedang dimatikan oleh bisnis. Gunakan kontak lain di halaman bisnis.</p>}
    {!data && !error ? <div className={styles.list}><p className={styles.empty}>Memuat percakapan…</p></div>
      : <MessageList listRef={listRef} messages={messages} side="customer" business={data?.business?.name} older={older}
        loadOlder={() => messages[0] && load(messages.find((m) => !m.pending)?.id)} openFile={openFile} onCard={onCard}
        emptyText={refId === 'umum' ? 'Tanyakan stok, harga, atau apa saja kepada bisnis.' : 'Belum ada pesan. Tanyakan apa pun tentang pesanan ini.'} />}
    {data?.need_identity && <div className={styles.identity}>
      <span style={{ fontSize: 13.5 }}>Isi data agar bisnis bisa membalas & mengenali Anda.</span>
      <label>Nama<input value={who.name} maxLength={80} autoComplete="name" onChange={(e) => setWho({ ...who, name: e.target.value })} /></label>
      <label>No. WhatsApp<input value={who.phone} maxLength={20} inputMode="tel" autoComplete="tel" onChange={(e) => setWho({ ...who, phone: e.target.value })} /></label>
    </div>}
    <Composer onSend={send} onFile={sendFile} chips={off ? [] : chips} busy={busy} disabled={!data || off} />
    <Powered />
  </section>;
}
