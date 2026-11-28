'use client';
// Panel percakapan untuk pemilik & staf (area kasir/operasional). Data & izin: cx_thread (database). Lampiran: /api/chat-file.
// Fitur: balas teks, catatan internal (tidak terlihat pelanggan), foto/PDF, kartu produk / penawaran / cara bayar, balasan cepat,
// status, prioritas, penugasan, konteks transaksi + kontrol tracking (toko/grosir).
import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import RoomOrder from './RoomOrder';
import NavIcon from '@/components/NavIcon';
import { Field, Sheet, toast } from '@/components/ui';
import { SheetEmpty } from '@/components/SmartDetailSheet';
import { errMsg, rp, waLink } from '@/lib/format';
import { CONV_STATUS, fmtDay } from '@/lib/tracking';
import { BusinessHead, Composer, Ico, MessageList, RefCard, TrackingView, usePendingId } from '@/components/commerce/ChatParts';
import TrackingControls from './TrackingControls';
import { createPortal } from 'react-dom';
import { useChatViewport } from '@/lib/useChatViewport';
import cs from '@/components/commerce/customer-chat.module.css';
import styles from './chat.module.css';

const token = async () => (await supabase.auth.getSession()).data.session?.access_token;
const CHANNEL = { toko: 'Portal toko', grosir: 'Portal grosir', jasa: 'Cek pesanan' };
const refLink = (c) => (c.ref_type === 'so_order' ? `/grosir?pesanan=${c.ref_id}` : c.ref_type === 'svc_order' ? `/pesanan?id=${c.ref_id}` : null);

export default function StaffChat({ convId, kosId, onBack, onChanged, fullscreen = false }) {
  const box = useChatViewport(fullscreen);
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const stick = useRef(true);
  const [d, setD] = useState(null);
  const [messages, setMessages] = useState([]);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [mode, setMode] = useState('teks'); // teks | catatan
  const [menu, setMenu] = useState(false);
  const [picker, setPicker] = useState(null); // {q, rows}
  const [panel,setPanel] = useState('');
  const [prefill,setPrefill] = useState(null);
  const [entry,setEntry] = useState('');
  const [older,setOlder] = useState(false);
  const [unseen,setUnseen] = useState(false);
  const latest = useRef(null);
  const upload = useRef(null);
  const camera = useRef(null);
  const documentFile = useRef(null);
  const exhausted = useRef(false);
  const [side, setSide] = useState(false); // panel konteks (HP)
  const listRef = useRef(null);
  const readRef = useRef(null);
  const files = useRef(new Map());
  const pending = usePendingId();

  const load = useCallback(async (before) => {
    const { data, error } = await supabase.rpc('cx_thread', { p_conv: convId, p_op: 'list', p: before ? { before } : {} });
    if (error || !data?.conversation || !Array.isArray(data.messages)) {
      setErr(error ? errMsg(error) : 'Percakapan belum dapat dimuat.');
      return;
    }
    setErr(''); if (!before) setD(data);
    if (before) exhausted.current = (data.messages || []).length < 40;
    setOlder(!exhausted.current && (data.messages || []).length === 40);
    setMessages((cur) => {
      const map = new Map(cur.filter((m) => !m.pending).map((m) => [m.id, m]));
      for (const m of data.messages || []) map.set(m.id, m);
      for (const m of cur) if (m.pending && !map.has(m.id)) map.set(m.id, m);
      return [...map.values()].sort((a, b) => (a.created_at || '').localeCompare(b.created_at || '') || a.id.localeCompare(b.id));
    });
  }, [convId]);
  useEffect(() => {
    setD(null); setMessages([]); setMode('teks'); readRef.current = null;
    let alive = true;
    const tick = () => { if (alive && !document.hidden) load(); };
    tick();
    const t = setInterval(tick, 5000);
    let debounce;
    const channel = supabase.channel('staff-room-' + convId).on('postgres_changes',{
      event:'*',schema:'public',table:'cx_room_updates',filter:'conversation_id=eq.' + convId,
    },() => { clearTimeout(debounce); debounce = setTimeout(tick,120); }).subscribe();
    document.addEventListener('visibilitychange',tick);
    return () => { alive = false; clearInterval(t); clearTimeout(debounce); document.removeEventListener('visibilitychange',tick); supabase.removeChannel(channel); };
  }, [load,convId]);
  // ikut ke pesan terbaru hanya bila sedang di bawah (membaca pesan lama tidak terganggu); keyboard naik → tetap di bawah
  useEffect(() => { const el = listRef.current; if (el && stick.current) el.scrollTop = el.scrollHeight; }, [messages.length, box?.height]);
  useEffect(() => {
    const el = listRef.current;
    if (!el) return;
    const on = () => { stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80; if (stick.current) setUnseen(false); };
    el.addEventListener('scroll', on, { passive: true });
    const ro = window.ResizeObserver ? new ResizeObserver(() => { if (stick.current) el.scrollTop = el.scrollHeight; }) : null;
    ro?.observe(el);
    return () => { el.removeEventListener('scroll', on); ro?.disconnect(); };
  }, [d !== null, mounted]);
  useEffect(() => {
    if (document.hidden || !stick.current) return;
    const latest = [...messages].reverse().find((m) => m.sender === 'customer' && !m.read_at);
    if (!latest || latest.id === readRef.current) return;
    readRef.current = latest.id;
    supabase.rpc('cx_thread', { p_conv: convId, p_op: 'read', p: { id: latest.id } }).then(({ error }) => { if (!error) onChanged?.(); else readRef.current = null; });
  }, [messages, convId, onChanged]);

  useEffect(() => {
    const last = messages[messages.length - 1]?.id;
    if (last && latest.current && last !== latest.current && !stick.current) setUnseen(true);
    latest.current = last || null;
  },[messages]);
  async function loadOlder() {
    const el = listRef.current;
    const before = messages.find((m) => !m.pending)?.id;
    if (!el || !before) return;
    stick.current = false;
    const oldHeight = el.scrollHeight;
    const oldTop = el.scrollTop;
    await load(before);
    requestAnimationFrame(() => { el.scrollTop = oldTop + el.scrollHeight - oldHeight; });
  }

  const op = async (name, p, okMsg) => {
    const { error } = await supabase.rpc('cx_thread', { p_conv: convId, p_op: name, p });
    if (error) { toast(errMsg(error)); return false; }
    if (okMsg) toast(okMsg);
    await load(); onChanged?.();
    return true;
  };
  const send = async (text) => {
    const kind = mode;
    const p = pending(kind + ':' + text);
    setBusy(true);
    setMessages((cur) => cur.some((m) => m.id === p.id) ? cur : [...cur, { id: p.id, sender: 'business', kind, body: text, created_at: new Date().toISOString(), pending: true }]);
    const { data, error } = await supabase.rpc('cx_thread', { p_conv: convId, p_op: 'send', p: { id: p.id, kind, body: text } });
    setBusy(false);
    if (error || data?.error) { toast(data?.error || errMsg(error)); setMessages((cur) => cur.filter((m) => m.id !== p.id)); return false; }
    p.done(); await load(); onChanged?.();
    return true;
  };
  const card = async (kind, extra = {}) => {
    setMenu(false); setPicker(null);
    const p = pending(kind + JSON.stringify(extra));
    setBusy(true);
    const { data, error } = await supabase.rpc('cx_thread', { p_conv: convId, p_op: 'send', p: { id: p.id, kind, ...extra } });
    setBusy(false);
    if (error || data?.error) return toast(data?.error || errMsg(error));
    p.done(); load(); onChanged?.();
  };
  const sendFile = async (file) => {
    if (file.size > 3e6) return toast('Lampiran maksimal 3 MB.');
    const p = pending('f:' + file.name + file.size);
    setBusy(true);
    try {
      const body = new FormData();
      body.set('request', JSON.stringify({ conversation: convId, kos: kosId, id: p.id, body: '' }));
      body.set('file', file);
      const res = await fetch('/api/chat-file', { method: 'POST', headers: { Authorization: 'Bearer ' + await token() }, body });
      const out = await res.json().catch(() => ({}));
      if (!res.ok || out.error) throw new Error(out.error || 'Lampiran gagal dikirim.');
      p.done(); await load(); onChanged?.();
    } catch (e) { toast(e.message); }
    setBusy(false);
  };
  const openFile = useCallback(async (id) => {
    const hit = files.current.get(id);
    if (hit && hit.at > Date.now() - 8 * 60e3) return hit.url;
    const res = await fetch('/api/chat-file?m=' + id, { headers: { Authorization: 'Bearer ' + await token() } });
    const out = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(out.error || 'Gagal membuka lampiran');
    files.current.set(id, { url: out.url, at: Date.now() });
    return out.url;
  }, []);
  const searchProducts = async (q) => {
    setPicker((x) => ({ ...(x || {}), q }));
    const { data, error } = await supabase.rpc('cx_products', { p_kos: kosId, p_search: q });
    setPicker((x) => x?.q === q ? { ...x, rows: data || [], error: error ? errMsg(error) : null } : x);
  };

  if (err && !d) return <div className={styles.thread}><div className="notice bad" style={{ margin: 12 }}>{err}<button type="button" className="sm" onClick={() => load()}>Coba lagi</button>{onBack && <button type="button" className="sm ghost" onClick={onBack}>Kembali</button>}</div></div>;
  if (!d) return <div className={styles.thread}><p className="muted" style={{ padding: 16 }}>Memuat percakapan…</p></div>;
  const c = d.conversation; const ref = d.reference;
  const quoteOk = ref?.type === 'so_order' && ref.status === 'penawaran' && ref.kind !== 'pesanan';
  const room = d.room;
  const menuAction = (name) => {
    setMenu(false); setEntry('');
    if (name === 'products') { setPicker({ q:'',rows:null }); searchProducts(''); }
    else if (name === 'note') setMode('catatan');
    else if (name === 'profile' || name === 'tracking') setSide(true);
    else setPanel(name);
  };
  const fileAction = (ref) => { setMenu(false); ref.current?.click(); };
  const actions = [
    ['photo','Foto',() => fileAction(upload),!d.enabled],
    ['photo','Kamera',() => fileAction(camera),!d.enabled],
    ['doc','Dokumen',() => fileAction(documentFile),!d.enabled],
    ['box','Produk',() => menuAction('products'),!d.enabled || c.channel === 'jasa'],
    ['cart','Buat Pesanan',() => menuAction('order'),!d.enabled || !room?.can_order],
    ['tag','Penawaran',() => card('penawaran'),!d.enabled || !quoteOk],
    ['card','Tagihan',() => menuAction('bill'),!d.enabled || !d.can_pay],
    ['truck','Tracking',() => menuAction(ref ? 'tracking' : 'history'),!ref && !room?.orders?.length],
    ['note','Catatan Internal',() => menuAction('note')],
    ['store','Profil Pelanggan',() => menuAction('profile')],
    ['pin','Lokasi',() => menuAction('location'),!d.enabled],
    ['copy','Kirim Link',() => menuAction('link'),!d.enabled],
  ];
  const context = <aside className={`${styles.context} ${side ? styles.contextOpen : ''}`} aria-label="Detail pelanggan & transaksi">
    <div className={styles.ctxHead}><b>Detail</b><button type="button" className="sm ghost" onClick={() => setSide(false)} aria-label="Tutup detail">✕</button></div>
    <section className="stack" style={{ gap: 6 }}>
      <b>{c.customer}</b>
      <span className="small muted">{CHANNEL[c.channel]}{c.kind === 'umum' ? ' · chat umum' : ''}</span>
      {c.phone && <a className="small" href={waLink(c.phone, `Halo ${c.customer}`)} target="_blank" rel="noreferrer">WhatsApp {c.phone}</a>}
      {c.contact_id && <Link className="small" href={`/kontak?kontak=${c.contact_id}`}>Buka data pelanggan</Link>}
    </section>
    <section className="stack" style={{ gap: 6 }}>
      <label className="f">Status<select value={c.status} onChange={(e) => op('status', { value: e.target.value }, 'Status diubah')}>
        {Object.entries(CONV_STATUS).map(([k, [l]]) => <option key={k} value={k}>{l}</option>)}</select></label>
      <label className="f">Ditangani oleh<select value={c.assigned_to || ''} onChange={(e) => op('assign', { user_id: e.target.value || null }, e.target.value ? 'Percakapan ditugaskan' : 'Penugasan dilepas')}>
        <option value="">Belum ditugaskan</option>{(d.members || []).map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</select></label>
      <label className="row small" style={{ gap: 8, flexWrap: 'nowrap', fontWeight: 700 }}><input type="checkbox" style={{ width: 22, minHeight: 22, flex: 'none' }} checked={c.priority === 'tinggi'} onChange={(e) => op('priority', { value: e.target.checked ? 'tinggi' : 'normal' })} /> Prioritas tinggi</label>
    </section>
    {ref && <section className="stack" style={{ gap: 8 }}>
      <TrackingView track={ref} extra={<TrackingControls track={ref} onChanged={load} />} />
      {refLink(c) && <Link className="sm" href={refLink(c)}>Buka pesanan {c.number}</Link>}
    </section>}
  </aside>;

  async function openOrder(orderId, type) {
    const { data, error } = await supabase.rpc('cx_room_track', { p_conv: convId, p_order: orderId });
    if (error || !data) return toast(error ? errMsg(error) : 'Pesanan tidak tersedia');
    setPanel({ track: data, href: type === 'svc_order' ? `/pesanan?id=${orderId}` : `/grosir?pesanan=${orderId}` });
  }

  const thread = <div className={`${styles.thread} ${fullscreen ? styles.threadFs : ''}`} data-keyboard={box?.keyboard || undefined} data-no-field-help>
      <BusinessHead business={null} title={c.customer} avatar={(c.customer || '?').trim()[0]?.toUpperCase()} back={fullscreen ? onBack : null}
        sub={[room?.online ? 'Online' : 'Tidak aktif', CHANNEL[c.channel]]} extra={<div className={styles.headerActions}>
          <button type="button" aria-label="Riwayat transaksi" onClick={() => menuAction('history')}><Ico name="doc" /></button>
          <button type="button" aria-label="Pengaturan percakapan" onClick={() => setSide(true)}><NavIcon name="more" /></button>
        </div>} />
      <div className={styles.roomSummary}>
        <button onClick={() => setSide(true)}><Ico name="tag" /><span><b>{c.contact_id ? 'Pelanggan' : 'Tamu'}</b><small>Sejak {fmtDay(room?.since || c.created_at)}</small></span></button>
        <button onClick={() => menuAction('history')}><Ico name="cart" /><span><b>Riwayat transaksi</b><small>{room ? `${room.count} pesanan · ${rp(room.total)}` : ref?.number || 'Buka riwayat'}</small></span></button>
      </div>
      {ref && <RefCard reference={ref} onOpen={() => setSide(true)} label="Lacak" />}
      {!d.enabled && <div className="notice warn" style={{ margin: '8px 12px 0' }}>Chat pelanggan dimatikan. Catatan internal tetap tersedia.</div>}
      <MessageList listRef={listRef} messages={messages} side="business" business={c.customer} openFile={openFile}
        onCard={(kind,p) => kind === 'produk' ? searchProducts(p.name || '') : openOrder(p.order_id,p.type)}
        emptyText="Belum ada pesan." older={older} loadOlder={loadOlder} />
      {unseen && <button className={styles.unseen} onClick={() => { const el = listRef.current; if (el) el.scrollTop = el.scrollHeight; stick.current = true; setUnseen(false); }}>↓ Pesan terbaru</button>}
      {[ [upload,'image/jpeg,image/png,image/webp'], [camera,'image/*','environment'], [documentFile,'application/pdf'] ].map(([control,accept,capture]) =>
        <input key={accept} hidden type="file" ref={control} accept={accept} capture={capture} onChange={(e) => { const file = e.target.files?.[0]; e.target.value = ''; if (file) sendFile(file); }} />)}
      {menu && <Sheet title="Aksi percakapan" icon="plus" onClose={() => setMenu(false)}>
        <div className={styles.actionGrid}>{actions.map(([icon,label,action,disabled]) =>
          <button key={label} onClick={action} disabled={busy || disabled}><span><Ico name={icon} /></span>{label}</button>)}</div>
        {!room?.can_order && c.channel !== 'jasa' && <small>Untuk membuat pesanan, percakapan perlu tertaut ke data pelanggan dan modul penawaran harus aktif.</small>}
      </Sheet>}
      {picker && <div className={styles.picker}>
        <div className="row" style={{ gap: 6 }}><input autoFocus placeholder="Cari barang…" value={picker.q} onChange={(e) => searchProducts(e.target.value)} />
          <button type="button" className="sm ghost" onClick={() => setPicker(null)}>Tutup</button></div>
        {picker.error ? <span role="alert">{picker.error}</span> : picker.rows === null ? <span className="small muted">Mencari…</span> : picker.rows.length === 0 ? <span className="small muted">Tidak ada barang.</span>
          : picker.rows.map((r) => (r.units || []).map((u) => <button type="button" key={r.id + u.name} className={styles.pick} onClick={() => card('produk', { product_id: r.id, unit: u.name })}>
            <span>{r.name}</span><small>{u.name} · {rp(c.channel === 'grosir' && Number(u.wholesale) > 0 ? u.wholesale : u.price)}</small></button>))}
      </div>}
      {mode === 'catatan' ? <div className={styles.modeRow}><span>Catatan internal · hanya untuk tim</span><button onClick={() => setMode('teks')}>Balas pelanggan</button></div> :
      <div className={styles.modeRow}>
        <button disabled={!d.enabled} onClick={() => menuAction('replies')}><Ico name="chat" size={16} />Balasan Cepat</button>
        <button disabled={!d.enabled || c.channel === 'jasa'} onClick={() => menuAction('products')}><Ico name="box" size={16} />Kirim Produk</button>
        <button disabled={!d.enabled || !room?.can_order} onClick={() => menuAction('order')}><Ico name="cart" size={16} />Buat Pesanan</button>
      </div>}
      <Composer key={mode} onSend={send} onFile={mode === 'teks' ? sendFile : null} busy={busy} prefill={mode === 'teks' ? prefill : null}
        disabled={mode === 'teks' && !d.enabled} mode={mode === 'catatan' ? 'note' : undefined}
        placeholder={mode === 'catatan' ? 'Tulis catatan untuk tim…' : 'Ketik pesan…'}
        extraMenu={() => setMenu(true)} />
      {panel === 'order' && <RoomOrder conv={c} kosId={kosId} onClose={() => setPanel('')} onSaved={() => { setPanel(''); load(); onChanged?.(); }} />}
      {panel === 'replies' && <Sheet title="Balasan Cepat" icon="message" onClose={() => setPanel('')}>
        {(d.replies || []).length ? d.replies.map((r,i) => <button key={i} onClick={() => { setPrefill({text:r}); setPanel(''); }}>{r}</button>) :
          <SheetEmpty icon="message" title="Belum ada balasan cepat"
            text="Tambahkan balasan yang sering dipakai melalui Setelan chat, atau tulis pesan langsung.">
            <button className="primary" onClick={() => setPanel('')}>Kembali ke chat</button>
          </SheetEmpty>}
      </Sheet>}
      {panel === 'bill' && <Sheet title="Kirim tagihan" icon="wallet" onClose={() => setPanel('')}>
        {(room?.orders || []).filter((o) => !['penawaran','batal'].includes(o.status)).map((o) => <button key={o.id} disabled={busy}
          onClick={async () => {
            const request = pending('bill:' + o.id);
            setBusy(true);
            try {
              const {error} = await supabase.rpc('cx_send_order_bill',{p_conv:convId,p_order:o.id,p_message:request.id});
              if (error) return toast(errMsg(error));
              request.done(); setPanel(''); await load(); onChanged?.();
            } finally { setBusy(false); }
          }}>{o.number} · {rp(o.total)}</button>)}
        <button disabled={busy} onClick={() => { setPanel(''); card('pembayaran'); }}>Kirim cara bayar umum</button>
      </Sheet>}
      {panel === 'history' && <Sheet title="Riwayat transaksi" icon="/laporan" onClose={() => setPanel('')}>
        {room?.orders?.length ? room.orders.map((o) => <button key={o.id} onClick={() => openOrder(o.id,o.type)}>
          {o.number} · {rp(o.total)} · {String(o.status).replace(/_/g, ' ')}</button>) : <SheetEmpty icon="/laporan" title="Belum ada transaksi tertaut"
          text="Pesanan yang terhubung ke percakapan ini akan muncul di sini.">
          <button className="primary" onClick={() => setPanel('')}>Kembali ke chat</button>
        </SheetEmpty>}
      </Sheet>}
      {panel?.track && <Sheet title={`Pesanan #${panel.track.number}`} onClose={() => setPanel('')}>
        <TrackingView track={panel.track} extra={<TrackingControls track={panel.track}
          onChanged={() => { openOrder(panel.track.id,panel.track.type); load(); }} />} />
        <Link href={panel.href}>Buka detail transaksi</Link>
      </Sheet>}
      {['location','link'].includes(panel) && <Sheet title={panel === 'location' ? 'Kirim lokasi' : 'Kirim link'} onClose={() => setPanel('')}>
        <Field label={panel === 'location' ? 'Alamat lokasi' : 'Tautan HTTPS'}><input type={panel === 'link' ? 'url' : 'text'} value={entry} onChange={(e) => setEntry(e.target.value)} /></Field>
        <button disabled={!entry.trim()} onClick={() => {
          let text = entry.trim();
          if (panel === 'location') text = 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(text);
          else if (!/^https:\/\/[^\s]+$/i.test(text)) return toast('Masukkan tautan HTTPS yang valid.');
          setPrefill({text}); setPanel('');
        }}>Masukkan ke pesan</button>
      </Sheet>}

    </div>;
  // HP & tablet: layar penuh mengikuti Visual Viewport (kolom ketik tepat di atas keyboard); laptop: di dalam halaman
  if (fullscreen) return mounted ? createPortal(<div className={cs.overlay} style={box ? { top: box.top, height: box.height } : undefined}>{thread}{context}</div>, document.body) : null;
  return <div className={styles.threadWrap}>{thread}{context}</div>;
}
