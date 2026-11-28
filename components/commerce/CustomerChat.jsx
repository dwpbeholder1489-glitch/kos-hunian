'use client';
// Chat pelanggan ↔ bisnis, tampilan layar penuh ala WhatsApp. Dipakai portal toko (/b, cookie tamu), portal grosir (/c, token
// pribadi) dan cek pesanan jasa (/b/[slug]/cek, nomor + No. HP). Semua lewat endpoint server yang memeriksa kredensial di database.
// refId: id transaksi | 'umum' (chat tanpa transaksi) | 'nomor' (jasa). Pesan diperbarui tiap 5 detik saat layar terlihat.
// Tata letak: lapisan tetap (portal ke <body>) yang mengikuti Visual Viewport (lib/useChatViewport) → kepala di atas, daftar pesan
// bergulir sendiri, kolom ketik selalu tepat di atas keyboard (iOS Safari, Android Chrome, PWA). Saat mengetik di layar sentuh:
// branding & bantuan kolom disembunyikan (data-no-field-help dibaca InteractiveGuide).
import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import SmartDetailSheet from '@/components/SmartDetailSheet';
import { supabase } from '@/lib/supabase';
import { ProductChatCard, BusinessHead, Composer, Ico, MessageList, Powered, RefCard, Suggestions, usePendingId } from './ChatParts';
import { logoUrl } from '@/lib/logo';
import { isTouch, useChatViewport } from '@/lib/useChatViewport';
import styles from './customer-chat.module.css';

export default function CustomerChat({ endpoint, auth = {}, refId, onOpenReference, onCard, onPay, title, back, whatsapp, product, orderProduct, quoteProduct, openCatalog }) {
  const [data, setData] = useState(null);
  const [messages, setMessages] = useState([]);
  const [older, setOlder] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [who, setWho] = useState({ name: '', phone: '' });
  const [focused, setFocused] = useState(false);
  const [unseen, setUnseen] = useState(0);
  const [prefill, setPrefill] = useState(() => product ? { text: `Halo, apakah stok ${product.name} satuan ${product.unit} masih tersedia?`, focus: false } : null);
  const [actionSheet, setActionSheet] = useState(false);
  const [mounted, setMounted] = useState(false);
  const listRef = useRef(null);
  const stick = useRef(true);
  const readRef = useRef(null);
  const exhausted = useRef(false);
  const lastOther = useRef(null);
  const files = useRef(new Map());
  const sessionLoad = useRef(null);
  const pending = usePendingId();
  const hasProduct = Boolean(product);
  const authKey = JSON.stringify(product ? { ...auth, product_id: product.product_id, product_unit: product.unit } : auth);
  const box = useChatViewport(true);
  useEffect(() => setMounted(true), []);

  const call = useCallback(async (operation, extra = {}, file = null) => {
    const payload = { action: 'conversation', ...JSON.parse(authKey), ref: refId, operation, ...extra };
    let body = JSON.stringify(payload); let headers = { 'Content-Type': 'application/json' };
    if (file) { body = new FormData(); body.set('request', JSON.stringify(payload)); body.set('file', file); headers = undefined; }
    const request = () => fetch(endpoint, { method: 'POST', headers, body, cache: 'no-store' });
    let res = await request();
    if (res.status === 409 && operation === 'list' && hasProduct) {
      sessionLoad.current ??= fetch(endpoint, { cache: 'no-store' }).finally(() => { sessionLoad.current = null; });
      if ((await sessionLoad.current).ok) res = await request();
    }
    const out = await res.json().catch(() => ({}));
    if (!res.ok || out?.error) throw new Error(out?.error || 'Chat sedang tidak tersedia. Coba lagi.');
    return out;
  }, [endpoint, authKey, refId, hasProduct]);

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
    document.addEventListener('visibilitychange', tick);
    return () => { alive = false; clearInterval(timer); document.removeEventListener('visibilitychange', tick); };
  }, [load]);

  const signal = data?.signal;
  useEffect(() => {
    if (!signal || !supabase) return;
    const channel = supabase.channel('cx-guest:' + signal)
      .on('broadcast', { event: 'changed' }, () => {
        if (!document.hidden) load().catch(() => {});
      }).subscribe((status) => {
        if (status === 'SUBSCRIBED' && !document.hidden) load().catch(() => {});
      });
    return () => { supabase.removeChannel(channel); };
  }, [load, signal]);

  const toBottom = useCallback((smooth) => {
    const el = listRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: smooth ? 'smooth' : 'auto' });
    stick.current = true; setUnseen(0);
  }, []);
  // pesan baru: ikut turun bila sedang di bawah; bila sedang membaca pesan lama → tampilkan "↓ n pesan baru"
  useEffect(() => {
    const other = [...messages].reverse().find((m) => m.sender === 'business');
    const isNew = other && lastOther.current && other.id !== lastOther.current;
    if (other) lastOther.current = other.id; else if (!lastOther.current && messages.length) lastOther.current = '-';
    if (stick.current) requestAnimationFrame(() => toBottom(false));
    else if (isNew) setUnseen((u) => u + 1);
  }, [messages, toBottom]);
  // keyboard muncul/hilang → area pesan mengecil; tetap di pesan terbaru bila memang di bawah
  useEffect(() => { if (stick.current) requestAnimationFrame(() => toBottom(false)); }, [box?.height, toBottom]);
  useEffect(() => {
    const el = listRef.current;
    if (!el) return;
    const onScroll = () => { stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80; if (stick.current) setUnseen(0); };
    el.addEventListener('scroll', onScroll, { passive: true });
    // area pesan mengecil (keyboard, kolom ketik tumbuh, chip) → tetap menempel di pesan terbaru bila memang di bawah
    const ro = window.ResizeObserver ? new ResizeObserver(() => { if (stick.current) el.scrollTop = el.scrollHeight; }) : null;
    ro?.observe(el);
    return () => { el.removeEventListener('scroll', onScroll); ro?.disconnect(); };
  }, [data !== null, mounted]);
  // tandai balasan bisnis sudah dibaca (hanya saat layar terlihat)
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
    setMessages((cur) => cur.some((m) => m.id === p.id) ? cur : [...cur, { id: p.id, sender: 'customer', kind: 'teks', body: text, product_context: data?.product, created_at: new Date().toISOString(), pending: true }]);
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
  const ask = (text) => () => text;
  const currentProduct = data ? data.product : product;
  const productActions = product ? [
    ['Pesan Produk Ini', currentProduct?.available && orderProduct ? () => orderProduct(currentProduct) : null, 'cart', 'Masukkan satuan ini ke keranjang'],
    ['Minta Penawaran', currentProduct && quoteProduct ? () => quoteProduct(currentProduct) : null, 'tag', 'Ajukan harga untuk produk ini'],
    ['Cek Stok', ask(`Halo, apakah stok ${product.name} satuan ${product.unit} masih tersedia?`), 'box'],
    ['Harga Grosir', ask(`Halo, berapa harga grosir ${product.name} per ${product.unit} dan jumlah minimum pembeliannya?`), 'tag'],
    ['Cara Pembayaran', () => (onPay ? onPay() : 'Bagaimana cara pembayaran yang tersedia?'), 'card'],
    ['Pengiriman', ask(`Apakah ${product.name} bisa dikirim? Berapa ongkir dan estimasinya?`), 'truck'],
    ['Lihat Katalog', openCatalog, 'store'],
  ] : [];
  const chips = product ? productActions.filter(([label]) => ['Cek Stok', 'Harga Grosir', 'Pengiriman'].includes(label)) : [
    ...(so && ref.status === 'penawaran' && onOpenReference ? [[ref.quote_ready ? 'Lihat penawaran' : 'Lihat permintaan', () => onOpenReference(ref), 'tag']] : []),
    ...(refId === 'umum' || so ? [['Cek stok', ask(names ? `Halo, apakah stok ${names} masih tersedia?` : 'Halo, apakah barang ini masih tersedia?'), 'box']] : []),
    ['Cara bayar', () => (onPay ? onPay() : 'Bagaimana cara pembayarannya?'), 'card'],
    ...(so && ref.fulfillment !== 'ambil' ? [['Estimasi kirim', ask('Kira-kira pesanan saya tiba kapan?'), 'truck']] : []),
    ...(ref?.type === 'svc_order' ? [['Kapan selesai?', ask('Kira-kira pesanan saya selesai kapan?'), 'clock']] : []),
    ...(ref && onOpenReference && !(so && ref.status === 'penawaran') ? [['Lihat pesanan', () => onOpenReference(ref), 'box']] : []),
  ];
  // kartu "Coba tanyakan" di percakapan kosong: mengisi kolom ketik (bisa diubah sebelum dikirim)
  const suggestions = chips.map(([label, act, icon]) => [label, () => { const r = act(); if (typeof r === 'string') setPrefill({ text: r, at: Date.now() }); }, icon]);
  const off = data && data.enabled === false;
  const typing = focused && (box?.keyboard || isTouch());
  const short = (box?.height || 800) < 560;
  const empty = data && messages.length === 0;

  // laptop: Esc atau klik di luar panel = kembali (seperti menutup jendela chat)
  useEffect(() => {
    if (!back) return;
    const k = (e) => { if (e.key === 'Escape' && !actionSheet && !e.defaultPrevented) back(); };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [back, actionSheet]);
  const screen = <div className={styles.overlay} style={box ? { top: box.top, height: box.height } : undefined}
    onClick={(e) => { if (back && e.target === e.currentTarget) back(); }}>
    <section className={`${styles.wrap} ${styles.screen}`} aria-label="Chat dengan bisnis" data-no-field-help data-typing={typing || undefined}>
      <BusinessHead business={data?.business} logo={data?.business?.logo ? logoUrl(data.business.logo) : null} title={title} back={back}
        extra={whatsapp && <a className={styles.wa} href={whatsapp} target="_blank" rel="noreferrer" aria-label="Hubungi lewat WhatsApp">WA</a>} />
      {product && !(typing && short) && <ProductChatCard pinned product={currentProduct || { ...product, unavailable: true }}
        open={onCard ? () => onCard('produk', product) : null} />}
      {ref && !(typing && short) && <RefCard reference={ref} onOpen={onOpenReference ? () => onOpenReference(ref) : null} />}
      {error && <p role="alert" className={styles.alert}>{error}</p>}
      {off && <p className={styles.info}>Chat sedang dimatikan oleh bisnis. Gunakan kontak lain di halaman bisnis.</p>}
      <div className={styles.listWrap}>
        {!data && !error ? <div className={styles.list}><p className={styles.empty}>Memuat percakapan…</p></div>
          : <MessageList listRef={listRef} messages={messages} side="customer" business={data?.business?.name} older={older}
            loadOlder={() => { stick.current = false; load(messages.find((m) => !m.pending)?.id); }} openFile={openFile} onCard={onCard}
            empty={!off && <>
              <div className={styles.hello}><span className={styles.avatar}><Ico name="store" size={15} /></span>
                <p>{product ? 'Tulis pertanyaan Anda tentang produk ini.' : refId === 'umum' ? 'Halo! Ada yang bisa kami bantu? Tanyakan stok, harga, atau apa saja.' : 'Ada pertanyaan tentang pesanan ini? Tulis di sini, toko akan membalas.'}</p></div>
              {!product && <Suggestions items={suggestions} />}
            </>} />}
        {unseen > 0 && <button type="button" className={styles.newPill} onClick={() => toBottom(true)}><Ico name="down" size={16} />{unseen} pesan baru</button>}
      </div>
      {data?.need_identity && <div className={styles.identity}>
        <span style={{ fontSize: 13.5 }}>Isi data agar bisnis bisa membalas & mengenali Anda.</span>
        <div className={styles.idRow}>
          <label>Nama<input value={who.name} maxLength={80} autoComplete="name" onFocus={() => setFocused(true)} onBlur={() => setFocused(false)} onChange={(e) => setWho({ ...who, name: e.target.value })} /></label>
          <label>No. WhatsApp<input value={who.phone} maxLength={20} inputMode="tel" autoComplete="tel" onFocus={() => setFocused(true)} onBlur={() => setFocused(false)} onChange={(e) => setWho({ ...who, phone: e.target.value })} /></label>
        </div>
      </div>}
      <div className={styles.foot}>
        <Composer onSend={send} onFile={sendFile} chips={off || (empty && !product) || (typing && short) ? [] : chips} extraMenu={product ? () => setActionSheet(true) : undefined} busy={busy} disabled={!data || off} onTyping={setFocused} prefill={prefill} />
        {!typing && <Powered />}
      </div>
      {actionSheet && <SmartDetailSheet title="Pilih Aksi" icon="plus" onClose={() => setActionSheet(false)}>
        <div className={styles.productMenu}>{productActions.map(([label, action, icon, subtitle]) => <button type="button" key={label} disabled={!action}
          onClick={() => {
            const text = action();
            if (typeof text === 'string') setPrefill({ text, at: Date.now(), focus: false });
            setActionSheet(false);
          }}>
          <Ico name={icon} /><span><b>{label}</b>{subtitle && <small>{subtitle}</small>}</span><Ico name="next" size={16} />
        </button>)}
        <button type="button" onClick={() => { setActionSheet(false); window.dispatchEvent(new Event('cx-pick-file')); }}><Ico name="photo" /><span><b>Kirim Foto atau Dokumen</b></span></button></div>
      </SmartDetailSheet>}
    </section>
  </div>;
  return mounted ? createPortal(screen, document.body) : null;
}
