'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { useKos } from '@/components/KosProvider';
import PageHelp from '@/components/PageHelp';
import { PageHeader } from '@/components/Page';
import { Loading, Empty, toast } from '@/components/ui';
import { angka, errMsg } from '@/lib/format';
import { isKul, onTheWay } from '@/lib/jasa';
import { requestApproval } from '@/lib/approval';
import { kitchenBoard, waitMinutes, orderChannel } from './kitchen-board.mjs';
import s from './kitchen.module.css';

const refreshMs = 20_000;
const channels = [['semua', 'Semua'], ['meja', 'Makan di tempat'], ['bungkus', 'Bungkus'], ['antar', 'Antar']];

export default function Dapur() {
  const { kos, kosId, ver } = useKos();
  if (!kos || !kosId) return <Loading />;
  if (!isKul(kos)) return <Empty title="Layar dapur khusus bisnis Kuliner" text="Untuk jasa lain, pakai menu Pesanan." />;
  return <Kitchen key={kosId} kosId={kosId} ver={ver} />;
}

function Kitchen({ kosId, ver }) {
  const [board, setBoard] = useState(null);
  const [now, setNow] = useState(0);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [error, setError] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  const [pending, setPending] = useState(null);
  const [channel, setChannel] = useState('semua');
  const [phase, setPhase] = useState('semua');
  const request = useRef(null);
  const active = useRef(false);
  const mutation = useRef(false);

  const load = useCallback(async () => {
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    setRefreshing(true);
    try {
      const { data, error } = await supabase.rpc('svc_board', { p_kos: kosId }).abortSignal(controller.signal);
      if (controller.signal.aborted) return;
      if (error) throw error;
      setBoard(data);
      setError(null);
      const timestamp = Date.now();
      setLastUpdated(timestamp);
      setNow(timestamp);
    } catch (error) {
      if (!controller.signal.aborted) setError(errMsg(error));
    } finally {
      if (!controller.signal.aborted) setRefreshing(false);
    }
  }, [kosId]);

  useEffect(() => {
    active.current = true;
    return () => { active.current = false; };
  }, []);

  useEffect(() => {
    load();
    const timer = setInterval(() => {
      setNow(Date.now());
      if (!mutation.current) load();
    }, refreshMs);
    return () => {
      clearInterval(timer);
      request.current?.abort();
    };
  }, [load, ver]);

  async function move(order, to) {
    if (mutation.current || error || refreshing) return;
    mutation.current = true;
    setPending(order.id);
    try {
      const { data, error } = await supabase.rpc('svc_order_move', { p_order: order.id, p_to: to, p_note: null });
      if (!active.current) return;
      if (!error) {
        toast(`${order.number}: ${data.stage}`);
      } else if (to === 'siap' && /PERLU_PERSETUJUAN/.test(error.message || '')) {
        const reason = errMsg(error).replace(/\s*Kirim permintaan dari aplikasi\.?\s*$/, '');
        if (window.confirm(`${reason}\n\nKirim permintaan persetujuan sekarang?`)) {
          await requestApproval({ kos: kosId, action: 'langkah_pesanan_jasa', payload: { order_id: order.id, to } });
        }
      } else {
        toast(errMsg(error));
      }
    } catch (error) {
      if (active.current) toast(errMsg(error));
    } finally {
      if (active.current) {
        await load();
        if (active.current) setPending(null);
      }
      mutation.current = false;
    }
  }

  const queue = board && kitchenBoard(board, now, channel);
  const selected = queue?.columns.some((column) => column.id === phase) ? phase : 'semua';
  const visible = queue?.columns.filter((column) => selected === 'semua' || selected === column.id);
  const count = queue?.columns.reduce((sum, column) => sum + column.orders.length, 0);

  return (
    <div className="stack">
      <PageHeader title="Dapur" desc="Pantau pesanan dari masuk hingga siap disajikan." help={<PageHelp page="dapur" />}
        actions={<button type="button" className="sm ghost" disabled={refreshing || pending !== null} onClick={load}>Muat ulang</button>} />
      {error && <div className="notice bad" role="alert">
        {board ? 'Gagal memperbarui antrean. Data terakhir masih ditampilkan. Muat ulang untuk melanjutkan.' : 'Antrean gagal dimuat. Ketuk Muat ulang untuk mencoba lagi.'} {error}
      </div>}
      {!board && !error && <Loading />}
      {queue && <>
        <div className={s.summary}>
          <div><strong>{queue.inKitchen}</strong><span>Dalam antrean</span></div>
          <div><strong>{queue.longWait}</strong><span>Lebih dari 30 menit</span></div>
          <div><strong>{queue.ready}</strong><span>Siap diserahkan</span></div>
        </div>
        {queue.requests > 0 && <Link href="/pesanan" className={s.request}>
          <strong>{queue.requests} pesanan menunggu konfirmasi kasir</strong>
          <span>Buka Pesanan →</span>
        </Link>}
        <div className={s.tools}>
          <div className={s.channels} role="group" aria-label="Jenis pesanan">
            {channels.map(([id, label]) => <button key={id} type="button" aria-pressed={channel === id} onClick={() => setChannel(id)}>{label}</button>)}
          </div>
          <label className={s.filter}>Tahap
            <select value={selected} onChange={(event) => setPhase(event.target.value)}>
              <option value="semua">Semua tahap</option>
              {queue.columns.map((column) => <option key={column.id} value={column.id}>{column.name} ({column.orders.length})</option>)}
            </select>
          </label>
        </div>
        <span className="small muted">Diperbarui {new Intl.DateTimeFormat('id-ID', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Jakarta' }).format(lastUpdated)} WIB · Muat otomatis tiap 20 detik</span>
        {count === 0 && <Empty title={channel === 'semua' ? 'Belum ada pesanan aktif' : 'Belum ada pesanan untuk jenis ini'}
          text={channel === 'semua' ? 'Pesanan kasir atau pesanan pelanggan yang dikonfirmasi akan muncul di antrean.' : 'Pilih Semua untuk melihat jenis pesanan lain.'} />}
        {count > 0 && <div className={s.board}>
          {visible.map((column) => <section key={column.id} className={s.column}>
            <h3>{column.name} <span>{column.orders.length}</span></h3>
            {column.orders.length === 0 && <p className="small muted">Belum ada pesanan</p>}
            {column.orders.map((order) => <Ticket key={order.id} order={order} now={now}
              next={column.next} busy={pending === order.id} disabled={!!error || refreshing || pending !== null} move={move} canHandover={board.money} />)}
          </section>)}
        </div>}
      </>}
    </div>
  );
}

function Ticket({ order, now, next, busy, disabled, move, canHandover }) {
  const minutes = waitMinutes(order.received_at, now);
  const age = minutes === null ? null : (minutes < 60 ? `${minutes} mnt` : `${Math.floor(minutes / 60)} j ${minutes % 60} mnt`);
  const delayed = order.status !== 'siap' && minutes > 30;
  const channel = orderChannel(order);
  const title = channel === 'antar' ? 'Antar' : channel === 'bungkus' ? 'Bungkus' : order.table_no ? `Meja ${order.table_no}` : 'Makan di tempat';

  return <article className={s.ticket} data-delayed={delayed}>
    <div className={s.ticketTop}>
      <div><h4>{title}</h4><span className={s.orderNo}>{order.number}</span></div>
      {age && <span className={s.age}>{delayed ? 'Menunggu ' : ''}{age}</span>}
    </div>
    {order.customer_name && <span className="small muted">{order.customer_name}</span>}
    {!!order.lines?.length && <ul className={s.items}>
      {order.lines.map((line, index) => <li key={index}>
        <strong>{angka(line.qty)}×</strong>
        <span>{line.name}{line.note && <small>{line.note}</small>}</span>
      </li>)}
    </ul>}
    {order.note && <p className={s.note}><strong>Catatan pesanan</strong> {order.note}</p>}
    {order.status === 'siap'
      ? onTheWay(order) ? <span className="small muted">Sedang diantar</span>
        : canHandover ? <Link href="/pesanan" className={s.handover}>Serahkan lewat Pesanan →</Link>
          : <span className="small muted">Menunggu diserahkan</span>
      : <div className={s.actions}>
        <button type="button" className="cta" disabled={disabled} onClick={() => move(order, 'next')}>{busy ? 'Memperbarui…' : `→ ${next}`}</button>
        {order.status === 'proses' && <button type="button" className="sm ghost" disabled={disabled} onClick={() => move(order, 'siap')}>Langsung siap</button>}
      </div>}
  </article>;
}
