'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { uid } from '@/lib/retail';
import styles from './transaction-chat.module.css';

const stamp = (at) => new Intl.DateTimeFormat('id-ID', {
  dateStyle: 'short', timeStyle: 'short', timeZone: 'Asia/Jakarta',
}).format(new Date(at));
const eventLabels = {
  SalesOrderCreated: 'Permintaan diterima', SalesOrderDikonfirmasi: 'Pesanan dikonfirmasi',
  SalesOrderSebagian: 'Pesanan dipenuhi sebagian', SalesOrderSelesai: 'Pemenuhan barang tercatat',
  SalesOrderBatal: 'Pesanan dibatalkan', DeliveryCreated: 'Surat jalan dibuat',
  DeliveryDiterima: 'Penyerahan dikonfirmasi', DeliveryGagal: 'Pengiriman gagal',
};

export default function TransactionChat({ order, endpoint, token, owner = false, initialOpen = false }) {
  const [tab, setTab] = useState(initialOpen ? 'chat' : '');
  const [messages, setMessages] = useState(null);
  const [events, setEvents] = useState([]);
  const [older, setOlder] = useState(true);
  const [draft, setDraft] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const pending = useRef(null);
  const read = useRef(null);
  const side = owner ? 'business' : 'customer';
  const exchange = useCallback(async (operation, { message, content, before } = {}) => {
    let payload;
    if (owner) {
      const { data, error } = await supabase.rpc('cx_owner_exchange', { p_reference: order, p_action: operation,
        p_message: message || null, p_body: content || null, p_before: before || null });
      if (error) throw new Error('Percakapan sedang tidak tersedia.');
      payload = data;
    } else {
      const response = await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'conversation', order, token, operation, message, content, before }) });
      payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'Percakapan sedang tidak tersedia.');
    }
    if (!payload || payload.error) throw new Error(payload?.error || 'Percakapan tidak dapat diakses.');
    return payload;
  }, [order, endpoint, owner, token]);

  const refresh = useCallback(async (before, active = () => true) => {
    try {
      const data = await exchange('list', { before });
      if (!active()) return;
      setError('');
      setEvents(data.events);
      setMessages((current) => {
        const merge = new Map((current || []).map((m) => [m.id, m]));
        for (const message of data.messages) merge.set(message.id, message);
        return [...merge.values()].sort((a,b) => a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id));
      });
      if (before || data.messages.length < 40) setOlder(data.messages.length === 40);
    } catch (failure) { if (active()) setError(failure.message); }
  }, [exchange]);
  useEffect(() => {
    if (!tab) return;
    let alive = true;
    const load = () => refresh(undefined, () => alive);
    load();
    const timer = setInterval(() => { if (!document.hidden) load(); }, 5000);
    return () => { alive = false; clearInterval(timer); };
  }, [refresh, tab]);
  useEffect(() => {
    if (tab !== 'chat' || document.hidden) return;
    const latest = [...(messages || [])].reverse().find((m) => m.sender !== side && !m.read_at);
    if (!latest || latest.id === read.current) return;
    read.current = latest.id;
    exchange('read', { message: latest.id }).catch(() => { read.current = null; });
  }, [exchange, messages, side, tab]);

  async function send(event) {
    event.preventDefault();
    if (busy || !draft.trim()) return;
    const content = draft.trim();
    if (pending.current?.content !== content) pending.current = { message: uid(), content };
    setBusy(true);
    setError('');
    try {
      await exchange('send', pending.current);
      pending.current = null;
      setDraft('');
      await refresh();
    } catch (failure) { setError(failure.message); }
    finally { setBusy(false); }
  }

  return <section className={styles.panel} aria-label="Komunikasi transaksi">
    <div className={styles.tabs}>
      <button type="button" aria-expanded={tab === 'chat'} onClick={() => setTab(tab === 'chat' ? '' : 'chat')}>
        {owner ? 'Chat pelanggan' : 'Chat dengan bisnis'}
      </button>
      <button type="button" aria-expanded={tab === 'events'} onClick={() => setTab(tab === 'events' ? '' : 'events')}>Aktivitas transaksi</button>
    </div>
    {tab && error && <p role="alert">{error} <button type="button" onClick={() => refresh()}>Coba lagi</button></p>}
    {tab && !messages && !error && <p>Memuat…</p>}
    {tab === 'events' && messages && <ul className={styles.events}>
      {events.length ? events.map((event) => <li key={event.event_id}><b>{eventLabels[event.event_type]}</b><small>{stamp(event.occurred_at)} WIB</small></li>)
        : <li>Belum ada aktivitas yang tercatat.</li>}
    </ul>}
    {tab === 'chat' && messages && <>
      <div className={styles.messages} aria-label="Riwayat pesan">
        {older && messages.length >= 40 && <button type="button" onClick={() => refresh(messages[0].id)}>Muat pesan sebelumnya</button>}
        {messages.length === 0 && <p>Belum ada pesan. Mulai percakapan tentang transaksi ini.</p>}
        {messages.map((m) => <div className={styles.message} data-mine={m.sender === side} key={m.id}>
          <b>{m.sender === 'business' ? 'Bisnis' : 'Pelanggan'}</b>
          <span>{m.body}</span>
          <small>{stamp(m.created_at)} WIB{m.sender === side && (m.read_at ? ' · Dibaca' : ' · Terkirim')}</small>
        </div>)}
      </div>
      <form className={styles.form} onSubmit={send}>
        <textarea aria-label="Pesan" placeholder="Ketik pesan…" required maxLength={2000} value={draft} onChange={(e) => setDraft(e.target.value)} disabled={busy} rows={2} />
        <button type="submit" disabled={busy || !draft.trim()}>{busy ? 'Mengirim…' : 'Kirim'}</button>
      </form>
    </>}
  </section>;
}
