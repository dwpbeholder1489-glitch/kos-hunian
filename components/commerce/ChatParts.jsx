'use client';
// Bagian chat & tracking yang dipakai bersama portal pelanggan (CustomerChat) dan panel pemilik/staf (/chat).
import { useEffect, useRef, useState } from 'react';
import { rp } from '@/lib/format';
import { uid } from '@/lib/retail';
import { fmtDay, fmtTime, presenceText, trackingOf } from '@/lib/tracking';
import styles from './customer-chat.module.css';

const P = {
  photo: 'M3 5h18v14H3zM3 16l5-5 4 4 3-3 6 6M16 9h.01',
  chat: 'M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12ZM8.5 12h.01M12 12h.01M15.5 12h.01',
  box: 'M21 8 12 3 3 8v8l9 5 9-5V8ZM3 8l9 5 9-5M12 13v8',
  check: 'm5 12 4 4L19 6',
  truck: 'M3 6h11v10H3zM14 9h4l3 3v4h-7M7 19a2 2 0 1 0 0-4 2 2 0 0 0 0 4Zm10 0a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z',
  flag: 'M5 21V4M5 4h11l-2 4 2 4H5',
  gear: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM19 12l2-1-1-3-2 .4-1.4-1.4.4-2-3-1-1 2h-2L10 3 7 4l.4 2L6 7.4 4 7l-1 3 2 1v2l-2 1 1 3 2-.4L7.4 17 7 19l3 1 1-2h2l1 2 3-1-.4-2 1.4-1.4 2 .4 1-3-2-1Z',
  pin: 'M20 10c0 5-8 11-8 11S4 15 4 10a8 8 0 1 1 16 0Zm-5 0a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z',
  clock: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm0-13v5l3 2',
  copy: 'M9 9h11v11H9zM5 15H4V4h11v1',
  plus: 'M12 5v14M5 12h14',
  send: 'M22 2 11 13M22 2l-7 20-4-9-9-4 20-7Z',
  tag: 'M3 12V3h9l9 9-9 9-9-9Zm5-4h.01',
  card: 'M3 6h18v12H3zM3 10h18M7 15h4',
  doc: 'M14 3H6v18h12V7l-4-4Zm0 0v4h4M9 13h6M9 17h6',
  next: 'm9 6 6 6-6 6',
  left: 'm15 6-6 6 6 6',
  down: 'M12 5v14m-6-6 6 6 6-6',
  cart: 'M3 4h2l2.4 11h11L21 8H6.2M9 20a1 1 0 1 0 0-2 1 1 0 0 0 0 2Zm9 0a1 1 0 1 0 0-2 1 1 0 0 0 0 2Z',
  x: 'm6 6 12 12M18 6 6 18',
  store: 'M4 10v10h16V10M3 10l2-6h14l2 6M3 10h18M9 20v-5h6v5',
  note: 'M4 4h16v12l-4 4H4zM16 20v-4h4',
};
export function Ico({ name, size = 20 }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={P[name]} /></svg>;
}

const initial = (name) => (String(name || '?').trim()[0] || '?').toUpperCase();
const sizeText = (n) => (n > 1e6 ? `${(n / 1e6).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1e3))} KB`);
const dayLabel = (iso) => {
  const date = new Date(iso);
  if (!iso || !Number.isFinite(date.getTime())) return '';
  const d = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta' }).format(date);
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta' }).format(new Date());
  return d === today ? 'Hari ini' : fmtDay(iso);
};

export function BusinessHead({ business, logo, title, extra, avatar, sub, back }) {
  const presence = sub || presenceText(business);
  return <header className={styles.head}>
    {back && <button type="button" className={styles.back} aria-label="Kembali" onClick={back}><Ico name="left" size={24} /></button>}
    <span className={styles.logo}>{logo ? <img src={logo} alt="" /> : avatar ? avatar : <Ico name="store" size={22} />}</span>
    <div className={styles.headText}>
      <b>{title || business?.name}</b>
      {presence && <span className={styles.presence}>{presence.map((p) => <span key={p} className={p === 'Online' ? styles.online : undefined}>{p}</span>)}</span>}
    </div>
    {extra}
  </header>;
}

export function RefCard({ reference, onOpen, label = 'Lihat' }) {
  if (!reference) return null;
  const items = reference.lines?.length || 0;
  return <div className={styles.refCard}>
    <span className={styles.refIcon}><Ico name="box" /></span>
    <div><b>{reference.type === 'svc_order' ? 'Pesanan' : reference.status === 'penawaran' ? 'Permintaan' : 'Pesanan'} #{reference.number}</b>
      <small>{reference.total != null && Number(reference.total) > 0 ? `${rp(reference.total)} · ` : ''}{items} {reference.type === 'svc_order' ? 'layanan' : 'produk'}</small></div>
    {onOpen && <button type="button" className={styles.pill} onClick={onOpen}>{label} <Ico name="next" size={14} /></button>}
  </div>;
}

// Lampiran: URL bertanda tangan diambil saat dibutuhkan (berlaku 10 menit), disimpan per pesan
function Attachment({ m, openFile }) {
  const [url, setUrl] = useState(null);
  const [err, setErr] = useState(false);
  const image = m.file?.mime?.startsWith('image/');
  useEffect(() => {
    if (!image) return;
    let alive = true;
    openFile(m.id).then((u) => { if (alive) setUrl(u); }).catch(() => { if (alive) setErr(true); });
    return () => { alive = false; };
  }, [image, m.id, openFile]);
  if (image) return err ? <span className={styles.by}>Foto tidak dapat dimuat.</span>
    : <a href={url || undefined} target="_blank" rel="noreferrer"><img className={styles.photo} src={url || undefined} alt={m.file.name || 'Foto'} /></a>;
  return <button type="button" className={styles.doc} onClick={async () => { try { window.open(await openFile(m.id), '_blank', 'noopener'); } catch { setErr(true); } }}>
    <Ico name="doc" /><span><b>{m.file?.name || 'Dokumen'}</b><small>{err ? 'Gagal dibuka — coba lagi' : `PDF · ${sizeText(m.file?.size || 0)}`}</small></span>
  </button>;
}

function Card({ m, onAction }) {
  const p = m.payload || {};
  if (m.kind === 'produk') return <div className={styles.card}>
    <span className={styles.cardHead}><Ico name="box" size={18} />{p.name}</span>
    {p.unavailable ? <small>Produk sudah tidak tersedia</small> : <>
      <b>{rp(p.price)} / {p.unit}</b>{p.stock != null && <small>Stok tercatat {p.stock} {p.base_unit}</small>}
    </>}
    {onAction && !p.unavailable && <button type="button" className={styles.cardBtn} onClick={() => onAction('produk', p)}>Lihat produk</button>}
  </div>;
  if (m.kind === 'penawaran') return <div className={styles.card}>
    <span className={styles.cardHead}><Ico name="tag" size={18} />Penawaran dari Toko</span>
    <small>#{p.number} · {p.items} produk · {rp(p.total)}</small>
    {p.valid_until && <small>Berlaku sampai {fmtDay(p.valid_until + 'T12:00:00+07:00')}</small>}
    {onAction && <button type="button" className={styles.cardBtn} onClick={() => onAction('penawaran', p)}>Lihat penawaran</button>}
  </div>;
  if (m.kind === 'pesanan') return <div className={styles.card}>
    <span className={styles.cardHead}><Ico name="cart" size={18} />Pesanan {p.number ? '#' + p.number : ''}</span>
    {p.unavailable ? <small>Pesanan tidak tersedia</small> : <>
      <small>{p.items} baris · {rp(p.total)} · {String(p.status || '').replace(/_/g, ' ')}</small>
      {p.paid != null && <small>Dibayar {rp(p.paid)} · {p.lunas ? 'Lunas' : 'Belum lunas'}</small>}
      {onAction && <button className={styles.cardBtn} onClick={() => onAction('pesanan',p)}>Lihat pesanan</button>}
    </>}
  </div>;
  if (m.kind === 'pembayaran') return <div className={styles.card}>
    <span className={styles.cardHead}><Ico name="card" size={18} />{p.number ? 'Tagihan #' + p.number : 'Cara pembayaran'}</span>
    {p.total != null && Number(p.total) > 0 && <small>Total pesanan {rp(p.total)}</small>}
    {p.paid != null && <small>Sisa pembayaran {rp(Math.max(0,Number(p.total)-Number(p.paid)))}</small>}
    {p.order_id && onAction && !p.unavailable && <button className={styles.cardBtn} onClick={() => onAction('pesanan',p)}>Lihat pesanan & pembayaran</button>}
    {p.payment_info && <p style={{ fontSize: 14 }}>{p.payment_info}</p>}
    {p.qris && <img className={styles.qris} src={p.qris} alt="QRIS" />}
    {p.rules && <small style={{ whiteSpace: 'pre-wrap' }}>{p.rules}</small>}
  </div>;
  return null;
}

// Daftar pesan; side = 'customer' | 'business' (sisi yang melihat)
export function MessageList({ messages, side, business, older, loadOlder, openFile, onCard, emptyText, listRef, empty }) {
  let lastDay = null;
  return <div className={styles.list} ref={listRef} aria-live="polite" aria-label="Riwayat pesan">
    {older && <button type="button" className={styles.older} onClick={loadOlder}>Muat pesan sebelumnya</button>}
    {messages.length === 0 && (empty || <p className={styles.empty}>{emptyText}</p>)}
    {messages.map((m) => {
      const mine = m.sender === side;
      const day = dayLabel(m.created_at);
      const sep = day !== lastDay; lastDay = day;
      const note = m.kind === 'catatan';
      return <div key={m.id} style={{ display: 'contents' }}>
        {sep && day && <span className={styles.day}>{day}</span>}
        <div className={`${styles.row} ${mine ? styles.mine : ''}`}>
          {!mine && <span className={styles.avatar} aria-hidden="true">{m.sender === 'business' ? <Ico name="store" size={15} /> : initial(business)}</span>}
          <div className={`${styles.bubble} ${note ? styles.note : ''}`}>
            {note && <span className={styles.noteTag}>Catatan internal · tidak terlihat pelanggan</span>}
            {m.by && side === 'business' && !note && <span className={styles.by}>{m.by}</span>}
            {m.file && <Attachment m={m} openFile={openFile} />}
            <Card m={m} onAction={onCard} />
            {m.body && <p>{/^https:\/\/[^\s]+$/i.test(m.body) ? <a href={m.body} target="_blank" rel="noreferrer">{m.body}</a> : m.body}</p>}
            <span className={styles.meta}>{fmtTime(m.created_at)}{mine && !note && !m.pending && <span className={m.read_at ? styles.read : undefined} title={m.read_at ? 'Dibaca' : 'Terkirim'}>{m.read_at ? '✓✓' : '✓'}</span>}{m.pending && ' · mengirim…'}</span>
          </div>
        </div>
      </div>;
    })}
  </div>;
}

// Penulis pesan: teks + lampiran (+) + chip balasan cepat
// Penulis pesan ala WhatsApp: kolom ketik tumbuh mengikuti isi (maks ±5 baris lalu bergulir di dalam), tombol kirim
// tidak menutup keyboard (fokus tetap di kolom), Enter = kirim di laptop / baris baru di HP, chip balasan cepat geser.
// onTyping(true|false) = kolom sedang difokuskan (dipakai layar chat untuk menyembunyikan branding & bantuan kolom).
export function Composer({ onSend, onFile, chips, busy, disabled, placeholder = 'Ketik pesan…', extraMenu, mode, onTyping, prefill }) {
  const [draft, setDraft] = useState('');
  const file = useRef(null);
  const area = useRef(null);
  const fit = () => {
    const el = area.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight + 2, 132) + 'px';
    el.style.overflowY = el.scrollHeight > 130 ? 'auto' : 'hidden';
  };
  useEffect(fit, [draft]);
  useEffect(() => { if (prefill?.text) { setDraft(prefill.text); requestAnimationFrame(() => { area.current?.focus(); const n = prefill.text.length; area.current?.setSelectionRange(n, n); }); } }, [prefill]);
  const submit = async (e) => {
    e?.preventDefault();
    const text = draft.trim();
    if (!text || busy) return;
    if (await onSend(text)) setDraft('');
  };
  return <>
    {chips?.length > 0 && <div className={styles.chips} role="toolbar" aria-label="Balasan cepat">{chips.map(([label, act, icon]) => <button key={label} type="button" disabled={disabled}
      onPointerDown={(e) => { if (document.activeElement === area.current) e.preventDefault(); }}
      onClick={() => { const r = act(); if (typeof r === 'string') { setDraft(r); requestAnimationFrame(() => { area.current?.focus(); area.current?.setSelectionRange(r.length, r.length); }); } }}>{icon && <Ico name={icon} size={16} />}{label}</button>)}</div>}
    <form className={styles.compose} onSubmit={submit}>
      {onFile && <>
        <button type="button" className={styles.round} aria-label={extraMenu ? 'Aksi percakapan' : 'Kirim foto atau dokumen'} disabled={disabled || busy} onClick={() => (extraMenu ? extraMenu() : file.current?.click())}><Ico name="plus" /></button>
        <input ref={file} className={styles.hidden} type="file" accept="image/jpeg,image/png,image/webp,application/pdf" tabIndex={-1}
          onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) onFile(f); }} />
      </>}
      <textarea ref={area} className={`${styles.input} ${mode === 'note' ? styles.noteInput : ''}`} rows={1} maxLength={2000} placeholder={placeholder} aria-label="Pesan" value={draft} disabled={disabled}
        autoComplete="off" onFocus={() => onTyping?.(true)} onBlur={() => onTyping?.(false)}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing && window.matchMedia('(pointer: fine)').matches) submit(e); }} />
      {/* pointerdown dicegah agar fokus (dan keyboard) tidak hilang saat menekan Kirim */}
      <button type="submit" className={styles.send} aria-label="Kirim" disabled={busy || disabled || !draft.trim()} onPointerDown={(e) => e.preventDefault()}><Ico name="send" /></button>
    </form>
    {onFile && <PickerBridge file={file} />}
  </>;
}
// memungkinkan menu (+) di panel staf membuka pemilih file yang sama
function PickerBridge({ file }) {
  useEffect(() => { const h = () => file.current?.click(); window.addEventListener('cx-pick-file', h); return () => window.removeEventListener('cx-pick-file', h); }, [file]);
  return null;
}

export function Powered() {
  return <div className={styles.powered}>Powered by <b>PRASARA</b></div>;
}

// Saran pertanyaan saat percakapan masih kosong (kartu "Coba tanyakan")
export function Suggestions({ items }) {
  if (!items?.length) return null;
  return <div className={styles.suggest}>
    <b>Coba tanyakan:</b>
    <div>{items.map(([label, act, icon]) => <button key={label} type="button" onClick={act}><Ico name={icon || 'chat'} size={18} />{label}</button>)}</div>
  </div>;
}

// Layar tracking (gambar acuan): status utama, 4 tahap, detail pengiriman, detail pesanan, tombol hubungi
export function TrackingView({ track, photoOf, showLines = true, onContact, contactLabel = 'Hubungi Toko', unread = 0, onDetail, extra }) {
  const [copied, setCopied] = useState(false);
  if (!track) return null;
  const t = trackingOf(track);
  const icons = { masuk: 'check', proses: track.type === 'svc_order' ? 'gear' : 'check', siap: track.deliver ? 'truck' : 'box', jemput: 'truck', kirim: 'truck', selesai: 'flag' };
  const d = t.delivery;
  return <div className={styles.track}>
    <section className={`${styles.hero} ${t.cancelled ? styles.bad : ''}`}>
      <span className={styles.heroIcon}><Ico name={t.cancelled ? 'x' : t.done ? 'check' : 'box'} size={32} /><i><Ico name={t.cancelled ? 'x' : 'check'} size={13} /></i></span>
      <div><h2>{t.headline}</h2><p>{track.type === 'svc_order' ? 'Pesanan' : 'Pesanan'} #{track.number}</p>{t.sub && <p>{t.sub}</p>}</div>
    </section>
    {!t.cancelled && <ol className={styles.steps} aria-label="Tahap pesanan">{t.steps.map((s) => (
      <li key={s.key} className={styles[s.state]} aria-current={s.state === 'current' ? 'step' : undefined}>
        <span className={styles.dot}><Ico name={s.state === 'done' ? 'check' : icons[s.key] || 'check'} size={18} /></span>
        <b>{s.label}</b>
        <span>{s.at ? <>{fmtDay(s.at)}<br />{fmtTime(s.at)}</> : s.note || '–'}</span>
      </li>))}</ol>}
    {extra}
    {(d || (track.type === 'so_order' && !t.pickup && track.ship_address)) && <section className={styles.box}>
      <h3>Detail Pengiriman</h3>
      {d && (d.courier || d.driver) && <div className={styles.line}><Ico name="truck" /><div><b>{d.courier || 'Kurir'}</b>{d.driver && <small>{d.driver}{d.vehicle ? ` · ${d.vehicle}` : ''}</small>}</div></div>}
      {d?.tracking_no && <div className={styles.line}><Ico name="pin" /><div><small>No. Resi</small><b>{d.tracking_no}</b></div>
        <button type="button" className={styles.copy} aria-label={copied ? 'Tersalin' : 'Salin nomor resi'} onClick={() => { navigator.clipboard?.writeText(d.tracking_no).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500); }).catch(() => {}); }}><Ico name={copied ? 'check' : 'copy'} size={16} /></button></div>}
      {d && !d.tracking_no && <div className={styles.line}><Ico name="pin" /><div><small>No. Surat Jalan</small><b>{d.number}</b></div></div>}
      {d && d.status === 'dikirim' && !t.pickup && <div className={styles.line}><Ico name="clock" /><div><small>Estimasi Tiba</small><b>{d.eta || 'Belum ditentukan toko'}</b></div></div>}
      {d?.received_at && <div className={styles.line}><Ico name="check" /><div><small>Diterima</small><b>{fmtDay(d.received_at)} {fmtTime(d.received_at)}{d.recipient ? ` · ${d.recipient}` : ''}</b></div></div>}
      {!d && track.ship_address && <div className={styles.line}><Ico name="pin" /><div><small>Alamat kirim</small><b>{track.ship_address}</b></div></div>}
    </section>}
    {showLines && track.lines?.length > 0 && <section className={styles.box}>
      <h3>Detail Pesanan{onDetail && <button type="button" onClick={onDetail}>Lihat Detail <Ico name="next" size={14} /></button>}</h3>
      {track.lines.map((l, i) => {
        const ph = photoOf?.(l.product_id);
        return <div className={styles.item} key={i}>
          {track.type === 'so_order' && <span className={styles.thumb}>{ph ? <img src={ph} alt="" loading="lazy" /> : <Ico name="box" />}</span>}
          <div><b>{l.name}</b><small>{Number(l.qty).toLocaleString('id-ID')} {l.unit}</small></div>
          {l.total != null && <strong>{rp(l.total)}</strong>}
        </div>;
      })}
      {track.total != null && <div className={styles.item}><div><b>Total</b>{track.type === 'svc_order' && <small>{track.lunas ? 'Lunas' : Number(track.paid) > 0 ? `Dibayar ${rp(track.paid)}` : 'Belum dibayar'}</small>}</div><strong>{rp(track.total)}</strong></div>}
    </section>}
    {onContact && <button type="button" className={styles.contact} onClick={onContact}><Ico name="chat" />{contactLabel}{unread > 0 && <span className={styles.badge}>{unread}</span>}</button>}
  </div>;
}

// Rantai kirim yang idempoten: id pesan dibuat sekali per isi, dipakai ulang saat mengirim ulang
export function usePendingId() {
  const ref = useRef(null);
  return (key) => {
    if (ref.current?.key !== key) ref.current = { key, id: uid() };
    return { id: ref.current.id, done: () => { ref.current = null; } };
  };
}
