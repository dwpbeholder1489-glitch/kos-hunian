'use client';
// Panel percakapan untuk pemilik & staf (area kasir/operasional). Data & izin: cx_thread (database). Lampiran: /api/chat-file.
// Fitur: balas teks, catatan internal (tidak terlihat pelanggan), foto/PDF, kartu produk / penawaran / cara bayar, balasan cepat,
// status, prioritas, penugasan, konteks transaksi + kontrol tracking (toko/grosir).
import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { toast } from '@/components/ui';
import { errMsg, rp, waLink } from '@/lib/format';
import { CONV_STATUS } from '@/lib/tracking';
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
  const [side, setSide] = useState(false); // panel konteks (HP)
  const listRef = useRef(null);
  const readRef = useRef(null);
  const files = useRef(new Map());
  const pending = usePendingId();

  const load = useCallback(async () => {
    const { data, error } = await supabase.rpc('cx_thread', { p_conv: convId, p_op: 'list', p: {} });
    if (error) { setErr(errMsg(error)); return; }
    setErr(''); setD(data);
    setMessages((cur) => {
      const map = new Map(cur.filter((m) => !m.pending).map((m) => [m.id, m]));
      for (const m of data.messages || []) map.set(m.id, m);
      for (const m of cur) if (m.pending && !map.has(m.id)) map.set(m.id, m);
      return [...map.values()].sort((a, b) => a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id));
    });
  }, [convId]);
  useEffect(() => {
    setD(null); setMessages([]); setMode('teks'); readRef.current = null;
    let alive = true;
    const tick = () => { if (alive && !document.hidden) load(); };
    tick();
    const t = setInterval(tick, 5000);
    return () => { alive = false; clearInterval(t); };
  }, [load]);
  // ikut ke pesan terbaru hanya bila sedang di bawah (membaca pesan lama tidak terganggu); keyboard naik → tetap di bawah
  useEffect(() => { const el = listRef.current; if (el && stick.current) el.scrollTop = el.scrollHeight; }, [messages.length, box?.height]);
  useEffect(() => {
    const el = listRef.current;
    if (!el) return;
    const on = () => { stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80; };
    el.addEventListener('scroll', on, { passive: true });
    const ro = window.ResizeObserver ? new ResizeObserver(() => { if (stick.current) el.scrollTop = el.scrollHeight; }) : null;
    ro?.observe(el);
    return () => { el.removeEventListener('scroll', on); ro?.disconnect(); };
  }, [d !== null, mounted]);
  useEffect(() => {
    if (document.hidden) return;
    const latest = [...messages].reverse().find((m) => m.sender === 'customer' && !m.read_at);
    if (!latest || latest.id === readRef.current) return;
    readRef.current = latest.id;
    supabase.rpc('cx_thread', { p_conv: convId, p_op: 'read', p: { id: latest.id } }).then(({ error }) => { if (!error) onChanged?.(); else readRef.current = null; });
  }, [messages, convId, onChanged]);

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
    const { error } = await supabase.rpc('cx_thread', { p_conv: convId, p_op: 'send', p: { id: p.id, kind, body: text } });
    setBusy(false);
    if (error) { toast(errMsg(error)); setMessages((cur) => cur.filter((m) => m.id !== p.id)); return false; }
    p.done(); await load(); onChanged?.();
    return true;
  };
  const card = async (kind, extra = {}) => {
    setMenu(false); setPicker(null);
    const p = pending(kind + JSON.stringify(extra));
    setBusy(true);
    const { error } = await supabase.rpc('cx_thread', { p_conv: convId, p_op: 'send', p: { id: p.id, kind, ...extra } });
    setBusy(false);
    if (error) return toast(errMsg(error));
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
      if (!res.ok) throw new Error(out.error || 'Lampiran gagal dikirim.');
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
    if (!error) setPicker((x) => (x ? { ...x, rows: data || [] } : x));
  };

  if (err && !d) return <div className={styles.thread}><div className="notice bad" style={{ margin: 12 }}>{err}</div></div>;
  if (!d) return <div className={styles.thread}><p className="muted" style={{ padding: 16 }}>Memuat percakapan…</p></div>;
  const c = d.conversation; const ref = d.reference;
  const quoteOk = ref?.type === 'so_order' && ref.status === 'penawaran' && ref.kind !== 'pesanan';
  const replies = (d.replies || []).map((r) => [r.length > 28 ? r.slice(0, 27) + '…' : r, () => r]);
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

  const thread = <div className={`${styles.thread} ${fullscreen ? styles.threadFs : ''}`} data-no-field-help>
      <BusinessHead business={null} title={c.customer} avatar={(c.customer || '?').trim()[0]?.toUpperCase()} back={fullscreen ? onBack : null}
        sub={[CONV_STATUS[c.status][0], CHANNEL[c.channel]]} extra={<div className="row" style={{ gap: 6, flexWrap: 'nowrap' }}>
        <button type="button" className={`sm ${styles.ctxBtn}`} onClick={() => setSide(true)}>Detail</button>
        {onBack && !fullscreen && <button type="button" className={`sm ghost ${styles.backBtn}`} onClick={onBack} aria-label="Kembali ke daftar">✕</button>}
      </div>} />
      {ref && <RefCard reference={ref} onOpen={() => setSide(true)} label="Lacak" />}
      {!d.enabled && <div className="notice warn" style={{ margin: '8px 12px 0' }}>Chat pelanggan dimatikan di Setelan chat — pelanggan tidak bisa mengirim, Anda hanya bisa menulis catatan internal.</div>}
      <MessageList listRef={listRef} messages={messages} side="business" business={c.customer} openFile={openFile}
        emptyText="Belum ada pesan." older={false} />
      {menu && <div className={styles.menu} role="menu">
        <button type="button" role="menuitem" onClick={() => { setMenu(false); window.dispatchEvent(new Event('cx-pick-file')); }}><Ico name="doc" />Foto / PDF</button>
        <button type="button" role="menuitem" onClick={() => { setMenu(false); setPicker({ q: '', rows: null }); searchProducts(''); }}><Ico name="box" />Kartu produk</button>
        {quoteOk && <button type="button" role="menuitem" onClick={() => card('penawaran')}><Ico name="tag" />Kartu penawaran ({rp(ref.total)})</button>}
        {d.can_pay && <button type="button" role="menuitem" onClick={() => card('pembayaran')}><Ico name="card" />Cara bayar</button>}
        {!d.can_pay && <span className="small muted" style={{ padding: '6px 10px' }}>Isi rekening/QRIS di Pengaturan untuk mengirim kartu cara bayar.</span>}
      </div>}
      {picker && <div className={styles.picker}>
        <div className="row" style={{ gap: 6 }}><input autoFocus placeholder="Cari barang…" value={picker.q} onChange={(e) => searchProducts(e.target.value)} />
          <button type="button" className="sm ghost" onClick={() => setPicker(null)}>Tutup</button></div>
        {picker.rows === null ? <span className="small muted">Mencari…</span> : picker.rows.length === 0 ? <span className="small muted">Tidak ada barang.</span>
          : picker.rows.map((r) => (r.units || []).map((u) => <button type="button" key={r.id + u.name} className={styles.pick} onClick={() => card('produk', { product_id: r.id, unit: u.name })}>
            <span>{r.name}</span><small>{u.name} · {rp(c.channel === 'grosir' && Number(u.wholesale) > 0 ? u.wholesale : u.price)}</small></button>))}
      </div>}
      <div className={styles.modeRow}>
        <button type="button" aria-pressed={mode === 'teks'} onClick={() => setMode('teks')}>Balas pelanggan</button>
        <button type="button" aria-pressed={mode === 'catatan'} onClick={() => setMode('catatan')}><Ico name="note" size={15} />Catatan internal</button>
      </div>
      <Composer onSend={send} onFile={mode === 'teks' && d.enabled ? sendFile : null} chips={mode === 'teks' && d.enabled ? replies : []} busy={busy}
        disabled={mode === 'teks' && !d.enabled} mode={mode === 'catatan' ? 'note' : undefined}
        placeholder={mode === 'catatan' ? 'Catatan untuk tim (tidak dikirim ke pelanggan)…' : 'Ketik balasan…'}
        extraMenu={() => setMenu((x) => !x)} />
    </div>;
  // HP & tablet: layar penuh mengikuti Visual Viewport (kolom ketik tepat di atas keyboard); laptop: di dalam halaman
  if (fullscreen) return mounted ? createPortal(<div className={cs.overlay} style={box ? { top: box.top, height: box.height } : undefined}>{thread}{context}</div>, document.body) : null;
  return <div className={styles.threadWrap}>{thread}{context}</div>;
}
