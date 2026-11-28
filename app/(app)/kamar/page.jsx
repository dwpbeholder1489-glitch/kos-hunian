'use client';
import PageHelp from '@/components/PageHelp';
import { useEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useKos } from '@/components/KosProvider';
import { useData } from '@/lib/useData';
import { Sheet, Field, Loading, Empty, run } from '@/components/ui';
import { StartLeaseSheet, EndLeaseSheet, MoveRoomSheet } from '@/components/LeaseForms';
import PaySheet from '@/components/PaySheet';
import { rp, tgl, angka, parseRp, ROOM_ST, errMsg, thisMonth, bulan, invTitle, PAY_ST, METHOD } from '@/lib/format';
import Link from 'next/link';
import { moduleOn, canArea, pathAllowed } from '@/lib/business';
import EntityPhotos from '@/components/media/EntityPhotos';
import { useBaru } from '@/lib/useBaru';
import ListThumb, { useThumbs } from '@/components/media/ListThumb';

import NavIcon from '@/components/NavIcon';
import { SheetPeriod, SheetSegments, SheetStats } from '@/components/SmartDetailSheet';
import { invoiceTotals } from '@/lib/propertyTotals';
import styles from './kamar.module.css';
import { useSearchParams } from 'next/navigation';
import { termsFor } from '@/lib/propertyTerms';

const propsOf = (kos) => (kos?.locs?.list || []).filter((b) => b.kind === 'cabang');

const statuses = [
  ['terisi', 'Terisi'], ['tersedia', 'Tersedia'], ['perbaikan', 'Perbaikan'], ['tidak_disewakan', 'Tidak disewakan'],
];
const payments = [
  ['lunas', 'Lunas'], ['belum', 'Belum lunas'], ['tunggak', 'Menunggak'], ['verifikasi', 'Menunggu verifikasi'],
  ['kosong', 'Belum ada tagihan bulan ini'], ['none', 'Tanpa sewa aktif'],
];
const quickActions = [
  ['/tagihan', 'Tagihan Kamar', '/tagihan'], ['/pembayaran', 'Pembayaran', 'wallet'],
  ['/perbaikan', 'Perawatan', '/perbaikan'], ['/penghuni', 'Penghuni', '/penghuni'], ['/laporan', 'Laporan', '/laporan'],
];
const ticketStates = { baru: 'Baru', dikerjakan: 'Dikerjakan', menunggu: 'Menunggu', selesai: 'Selesai', batal: 'Batal' };
const sum = (rows, key) => rows.reduce((total, row) => total + row[key], 0);
const liveInvoice = (i) => i.status !== 'batal';
const isOverdue = (i) => liveInvoice(i) && i.overdue && i.outstanding > 0;

function roomBilling(rows, month) {
  const open = rows.filter((i) => liveInvoice(i) && i.outstanding > 0);
  const overdue = sum(open.filter(isOverdue), 'outstanding');
  const amount = sum(open, 'outstanding');
  const state = overdue > 0 ? 'tunggak' : open.some((i) => i.pending > 0) ? 'verifikasi'
    : amount > 0 ? 'belum' : rows.some((i) => liveInvoice(i) && i.due_date.startsWith(month)) ? 'lunas' : 'kosong';
  return { state, overdue, amount, next: open.reduce((old, i) => !old || i.due_date < old.due_date ? i : old, null) };
}

function PaymentStatus({ billing }) {
  if (!billing) return null;
  const { state, overdue, amount } = billing;
  const label = state === 'tunggak' ? `Tunggak ${rp(overdue)}` : state === 'belum' ? `Belum lunas ${rp(amount)}`
    : payments.find(([key]) => key === state)?.[1];
  return <span className={styles.payment} data-payment={state}>
    <NavIcon name={state === 'lunas' ? 'done' : state === 'kosong' ? '/tagihan' : 'clock'} size={16} />{label}
  </span>;
}

export default function Kamar() {
  const d = useData({ fullRoomHistory: true });
  const [filter, setFilter] = useState('');
  const [payment, setPayment] = useState('');
  const [query, setQuery] = useState('');
  const sp = useSearchParams();
  const [prop, setProp] = useState(sp.get('properti') || '');
  const [sheet, setSheet] = useState(null);
  const listRef = useRef(null);
  useBaru(() => setSheet({ t: 'edit', room: null }));
  const { kos, kosId, ver } = useKos();
  const thumbs = useThumbs(kosId, 'room', `${ver}:${sheet ? 1 : 0}`);
  if (!d.ready) return d.err ? <div className="notice bad">{d.err}</div> : <Loading />;

  const month = thisMonth();
  const t = termsFor(kos);
  const props = propsOf(kos);
  const mainId = props.find((b) => b.is_main)?.id;
  const inProp = (room) => !prop || (room.branch_id || mainId) === prop;
  const allowed = quickActions.filter(([href]) => pathAllowed(kos, href));
  const counts = Object.fromEntries(statuses.map(([key]) => [key, 0]));
  const byLease = new Map();
  for (const i of d.invoices) {
    if (!byLease.has(i.lease_id)) byLease.set(i.lease_id, []);
    byLease.get(i.lease_id).push(i);
  }
  const cards = d.rooms.map((room) => {
    counts[room.status] = (counts[room.status] || 0) + 1;
    const lease = d.activeByRoom.get(room.id);
    return { room, lease, name: lease ? d.occName(lease.occupant_id) : ROOM_ST[room.status],
      billing: lease ? roomBilling(byLease.get(lease.id) || [], month) : null, booking: d.bookByRoom.get(room.id) };
  });
  const occupied = d.rooms.length ? Math.round(counts.terisi * 100 / d.rooms.length) : 0;
  let arc = 0;
  const slices = statuses.map(([key]) => {
    const from = arc;
    arc += d.rooms.length ? counts[key] * 100 / d.rooms.length : 0;
    return `var(--room-${key}) ${from}% ${arc}%`;
  });
  const { billedMonth } = invoiceTotals(d.invoices, month);
  const overdue = sum(d.invoices.filter(isOverdue), 'outstanding');
  const term = query.trim().toLocaleLowerCase('id');
  const list = cards.filter(({ room, lease, name, billing, booking }) =>
    inProp(room) && (!filter || room.status === filter) && (!payment || (billing?.state ?? 'none') === payment) &&
    (!term || [room.code, name, ROOM_ST[room.status], billing?.state, booking?.name, booking ? 'Dibooking' : '', lease ? payments.find(([key]) => key === billing.state)?.[1] : null]
      .some((value) => value?.toLocaleLowerCase('id').includes(term))));
  const close = () => setSheet(null);
  const filterRooms = (key) => {
    setFilter(key);
    listRef.current?.scrollIntoView({ block: 'start' });
  };
  const detail = sheet?.t === 'detail' && cards.find(({ room }) => room.id === sheet.id);

  return <div className={styles.page} data-no-field-help>
    <header className={styles.heading}>
      <div><div><h1>{t.unit}</h1><PageHelp page="kamar" /></div><p>Status, harga, inventaris, dan riwayat tiap {t.unit.toLowerCase()}</p></div>
      <button className="primary" onClick={() => setSheet({ t: 'edit', room: null })}>+ {t.unit}</button>
    </header>
    <div className={styles.overview}>
      <section className={styles.occupancy} aria-label="Ringkasan okupansi">
        <button className={styles.donut} onClick={() => filterRooms('terisi')} aria-label={`${occupied}% terisi, tampilkan kamar terisi`}
          style={{ '--arcs': d.rooms.length ? `conic-gradient(${slices.join(',')})` : 'var(--line)' }}>
          <span><b>{occupied}%</b><small>Terisi</small></span>
        </button>
        <div className={styles.legend}>{statuses.map(([key, label]) => <button key={key} aria-pressed={filter === key} onClick={() => filterRooms(key)}>
          <span className={styles.dot} data-status={key} /><span>{label}</span><b>{counts[key]}</b>
        </button>)}</div>
      </section>
      <section className={styles.billing} aria-label="Ringkasan tagihan">
        <button onClick={() => setSheet({ t: 'bills', filter: 'month' })}>
          <span className={styles.billIcon}><NavIcon name="calendar" /></span>
          <span>Tagihan Bulan Ini</span><strong>{rp(billedMonth)}</strong>
          <NavIcon name="next" size={17} />
        </button>
        <button onClick={() => setSheet({ t: 'bills', filter: 'overdue' })}>Tunggakan <b>{rp(overdue)}</b></button>
      </section>
    </div>
    <nav className={styles.quick} aria-label="Aksi cepat kamar">
      {allowed.map(([href, label, icon]) => <Link key={href} href={href}><NavIcon name={icon} size={26} /><span>{label}</span></Link>)}
    </nav>

    <section className={styles.rooms} ref={listRef} aria-label="Daftar kamar">
      <div className={styles.tabs} role="group" aria-label="Status hunian">
        {[['', 'Semua'], ...statuses].map(([key, label]) => <button key={key} aria-pressed={filter === key} onClick={() => setFilter(key)}>
          {label} ({key ? counts[key] : d.rooms.length})
        </button>)}
      </div>
      <div className={styles.tools}>
        <label><NavIcon name="search" size={19} /><input type="search" aria-label="Cari kamar" placeholder="Cari kamar, penghuni, atau status" value={query} onChange={(event) => setQuery(event.target.value)} /></label>
        <button aria-label="Filter status hunian dan pembayaran" onClick={() => setSheet({ t: 'filter' })}><NavIcon name="filter" size={19} />Filter{payment && ' · Aktif'}</button>
      </div>
      {props.length > 1 && <div className={styles.tabs} role="group" aria-label="Properti">
        {[['', 'Semua properti'], ...props.map((b) => [b.id, b.name])].map(([key, label]) => <button key={key || 'all'} aria-pressed={prop === key} onClick={() => setProp(key)}>{label}</button>)}
      </div>}
      {payment && <button className={styles.activeFilter} onClick={() => setPayment('')}>{payments.find(([key]) => key === payment)?.[1]} ×</button>}
      {list.length ? <div className={styles.grid}>{list.map(({ room, lease, name, billing, booking }) =>
        <article key={room.id} className={styles.room} data-status={room.status} data-payment={billing?.state}>
          <button className={styles.roomDetail} aria-label={`Detail kamar ${room.code}`} onClick={() => setSheet({ t: 'detail', id: room.id })}>
            <span className={styles.roomTop}>
              <span className={styles.roomIcon}>{thumbs[room.id] ? <ListThumb path={thumbs[room.id]} size={34} radius={8} /> : <NavIcon name="bed" size={23} />}</span>
              <span className={styles.roomName}><b>{room.code}</b><span>{name}</span></span>
              <span className={styles.badge} data-status={room.status}>{ROOM_ST[room.status]}</span>
            </span>
            <span className={styles.rate}><NavIcon name="wallet" size={15} />{(lease?.rent ?? room.rent) ? `${rp(lease?.rent ?? room.rent)}/bln` : 'Tarif belum diisi'}</span>
            <span className={styles.roomFoot}><PaymentStatus billing={billing} />
              {booking && <span className={styles.booked}>Dibooking · {tgl(booking.check_in)}</span>}<NavIcon name="next" size={15} /></span>
          </button>
          {!lease && room.status === 'tersedia' && !booking && <button className={styles.rent} onClick={() => setSheet({ t: 'start', id: room.id })}>+ Sewa / Isi Penghuni</button>}
        </article>)}</div> : <Empty title="Tidak ada kamar" text="Belum ada kamar yang cocok dengan pencarian dan filter." />}
    </section>

    {sheet?.t === 'filter' && <Sheet title="Filter kamar" icon="filter" onClose={close}>
      <Field label="Status hunian"><select value={filter} onChange={(event) => setFilter(event.target.value)}>
        <option value="">Semua status hunian</option>{statuses.map(([key, label]) => <option key={key} value={key}>{label}</option>)}
      </select></Field>
      <Field label="Status pembayaran"><select value={payment} onChange={(event) => setPayment(event.target.value)}>
        <option value="">Semua status pembayaran</option>{payments.map(([key, label]) => <option key={key} value={key}>{label}</option>)}
      </select></Field>
      <div className="row"><button onClick={() => { setFilter(''); setPayment(''); }}>Reset</button><button className="primary" onClick={close}>Lihat {list.length} kamar</button></div>
    </Sheet>}
    {sheet?.t === 'bills' && <Sheet title="Tagihan Kamar" icon="/tagihan" wide onClose={close}>
      <SheetPeriod>{sheet.filter === 'month' ? bulan(month) : 'Semua periode · lewat jatuh tempo'}</SheetPeriod>
      <SheetStats items={[[`Tagihan ${bulan(month)}`, rp(billedMonth)], ['Tunggakan', rp(overdue)]]} />
      <SheetSegments label="Rincian tagihan" options={ [['month', 'Bulan ini'], ['overdue', 'Tunggakan']] }
        value={sheet.filter} onChange={(key) => setSheet({ t: 'bills', filter: key })} />
      <InvoiceList d={d} rows={d.invoices.filter((i) => sheet.filter === 'month' ? liveInvoice(i) && i.due_date.startsWith(month) : isOverdue(i))} />
      <Link href="/tagihan">Buka modul Tagihan</Link>
    </Sheet>}
    {detail && <RoomDetail key={detail.room.id} d={d} card={detail} go={setSheet} onClose={close} />}
    {sheet?.t === 'edit' && <RoomEdit d={d} room={sheet.room} onClose={close} />}
    {sheet?.t === 'start' && <StartLeaseSheet d={d} roomId={sheet.id} onClose={close} />}
    {sheet?.t === 'end' && <EndLeaseSheet d={d} lease={sheet.lease} onClose={close} />}
    {sheet?.t === 'move' && <MoveRoomSheet d={d} lease={sheet.lease} onClose={close} />}
    {sheet?.t === 'pay' && <PaySheet d={d} inv={d.invById.get(sheet.id)} onClose={() => sheet.roomId ? setSheet({ t: 'detail', id: sheet.roomId }) : close()} />}
  </div>;
}

function History({ rows, empty, render }) {
  const [limit, setLimit] = useState(10);
  if (!rows.length) return <p className="muted">{empty}</p>;
  return <><ul className={styles.history}>{rows.slice(0, limit).map((row) => <li key={row.id}>{render(row)}</li>)}</ul>
    {rows.length > limit && <button onClick={() => setLimit(limit + 10)}>Tampilkan lebih banyak</button>}</>;
}

function InvoiceList({ d, rows, pay }) {
  return <History rows={rows} empty="Belum ada tagihan pada bagian ini." render={(i) => <>
    <div className={styles.historyHead}><Link href={`/tagihan?invoice=${i.id}`}>{d.roomCode(i.room_id)} · {invTitle(i)}</Link><b>{rp(i.amount)}</b></div>
    <small>{d.occName(i.occupant_id)} · Jatuh tempo {tgl(i.due_date)}</small>
    <div className={styles.historyHead}><span className="small">{i.status === 'batal' ? 'Batal' : i.outstanding > 0
      ? `${i.overdue ? 'Tunggak' : 'Sisa'} ${rp(i.outstanding)}` : 'Lunas'}</span>
      {pay && liveInvoice(i) && i.outstanding > 0 && <button className="sm" onClick={() => pay(i.id)}>Catat pembayaran</button>}</div>
  </>} />;
}

function RoomDetail({ d, card, go, onClose }) {
  const { kos, kosId, ver } = useKos();
  const [tab, setTab] = useState('detail');
  const [maintenance, setMaintenance] = useState(null);
  const [attempt, setAttempt] = useState(0);
  const { room, lease, billing, booking } = card;
  const occ = lease && d.occById.get(lease.occupant_id);
  const otherInvoices = lease ? d.invoices.filter((i) => i.occupant_id === lease.occupant_id && i.lease_id !== lease.id && liveInvoice(i) && i.outstanding > 0) : [];
  const canMaintain = pathAllowed(kos, '/perbaikan');
  useEffect(() => {
    if (tab !== 'maintenance' || !canMaintain) return;
    const controller = new AbortController();
    setMaintenance(null);
    supabase.from('maint_tickets').select('id,number,title,detail,status,created_at,cost').eq('kos_id', kosId).eq('room_id', room.id)
      .order('created_at', { ascending: false }).order('id').limit(100).abortSignal(controller.signal)
      .then(({ data, error }) => { if (!controller.signal.aborted) setMaintenance({ data, error }); });
    return () => controller.abort();
  }, [tab, canMaintain, kosId, room.id, ver, attempt]);

  const tabs = [['detail', 'Detail', 'bed'], ['occupancy', 'Penghuni', '/penghuni'], ['bills', 'Tagihan', '/tagihan'], ['payments', 'Pembayaran', 'wallet']];
  if (canMaintain) tabs.push(['maintenance', 'Perawatan', '/perbaikan']);
  const roomInvoices = d.invoices.filter((i) => i.room_id === room.id);
  const ids = new Set(roomInvoices.map(({ id }) => id));
  const pay = (id) => go({ t: 'pay', id, roomId: room.id });
  const start = () => go({ t: 'start', id: room.id });
  return <Sheet title={`Kamar ${room.code}`} subtitle={card.name} icon="bed" wide onClose={onClose}>
    <SheetStats items={[[ 'Status hunian', ROOM_ST[room.status] ], ['Tarif sewa', (lease?.rent ?? room.rent) ? `${rp(lease?.rent ?? room.rent)}/bln` : '—'],
      ...(billing ? [['Tagihan belum dibayar', rp(billing.amount)]] : [])]} />
    <SheetSegments label="Bagian detail kamar" options={tabs} value={tab} onChange={setTab} />
    {tab === 'detail' && <>
      <PaymentStatus billing={billing} />
      {(room.facilities?.length > 0 || room.notes || room.floor || room.size_m2 || room.capacity || propsOf(kos).length > 1 || (lease && room.rent != null && room.rent !== lease.rent)) && <dl className="kv">
        {propsOf(kos).length > 1 && <><dt>Properti</dt><dd>{propsOf(kos).find((b) => b.id === room.branch_id)?.name || propsOf(kos).find((b) => b.is_main)?.name || 'Lokasi utama'}</dd></>}
        {room.floor && <><dt>Lantai</dt><dd>{room.floor}</dd></>}
        {room.size_m2 && <><dt>Luas</dt><dd>{angka(room.size_m2)} m²</dd></>}
        {room.capacity && <><dt>Kapasitas</dt><dd>{room.capacity} orang</dd></>}
        {lease && room.rent != null && room.rent !== lease.rent && <><dt>Tarif dasar kamar</dt><dd>{rp(room.rent)}/bln</dd></>}
        {room.facilities?.length > 0 && <><dt>Fasilitas</dt><dd>{room.facilities.join(', ')}</dd></>}
        {room.notes && <><dt>Catatan</dt><dd>{room.notes}</dd></>}
      </dl>}
      <EntityPhotos kosId={kosId} entity="room" entityId={room.id} category="kamar" title="Foto kamar" max={8} canEdit={canArea(kos, 'rent')}
        hint="Belum ada foto. Foto kamar tampil di halaman bisnis saat kamar tersedia." />
      {occ && <section className="panel">
        <span className="label">Penghuni sekarang</span><b>{occ.name}</b>
        <dl className="kv">
          {occ.phone && <><dt>WhatsApp</dt><dd><a href={`https://wa.me/${occ.phone.replace(/\D/g, '').replace(/^0/, '62')}`}>{occ.phone}</a></dd></>}
          <dt>Masuk</dt><dd>{tgl(lease.start_date)}</dd>
          {(d.depByLease.get(lease.id) || 0) > 0 && <><dt>Deposit dipegang</dt><dd>{rp(d.depByLease.get(lease.id))}</dd></>}
        </dl>
        {otherInvoices.length > 0 && <details><summary>Tagihan penghuni dari sewa lain · {rp(sum(otherInvoices, 'outstanding'))}</summary>
          <InvoiceList d={d} rows={otherInvoices} pay={pay} /></details>}
        <div className="row"><button onClick={() => go({ t: 'move', lease })}>Pindah kamar</button><button className="danger" onClick={() => go({ t: 'end', lease })}>Akhiri sewa</button></div>
      </section>}
      {billing?.next && <button className="primary" onClick={() => pay(billing.next.id)}>Catat pembayaran / tandai lunas</button>}
      {!lease && room.status === 'tersedia' && !booking && <button className="cta" onClick={start}>+ Sewa / Isi Penghuni</button>}
      {booking && pathAllowed(kos, '/booking') ? <Link href="/booking" className="notice">Dibooking {booking.name} ({booking.number}), masuk {tgl(booking.check_in)}. Check-in lewat menu Booking.</Link>
        : !booking && moduleOn(kos, 'p_booking') && pathAllowed(kos, '/booking') && room.status !== 'tidak_disewakan' && <Link href={`/booking?kamar=${room.id}`}>Booking kamar ini untuk calon penghuni</Link>}
      {canMaintain && <Link href={`/perbaikan?kamar=${room.id}`}>Catat keluhan / kerusakan kamar ini</Link>}
      {pathAllowed(kos, '/inventaris') && <Link href={`/inventaris?kamar=${room.id}`}>Inventaris & pemeriksaan masuk/keluar</Link>}
      <button onClick={() => go({ t: 'edit', room })}>Ubah data kamar</button>
    </>}
    {tab === 'occupancy' && <History rows={d.leases.filter((item) => item.room_id === room.id)} empty="Belum ada riwayat penghuni." render={(item) => <>
      <div className={styles.historyHead}><b>{d.occName(item.occupant_id)}</b><span>{item.status === 'aktif' ? 'Aktif' : 'Selesai'}</span></div>
      <small>{tgl(item.start_date)} – {item.end_date ? tgl(item.end_date) : 'Sekarang'} · {rp(item.rent)}/bln</small>
    </>} />}
    {tab === 'bills' && <InvoiceList d={d} rows={roomInvoices} pay={pay} />}
    {tab === 'payments' && <History rows={d.payments.filter((item) => ids.has(item.invoice_id))} empty="Belum ada pembayaran untuk kamar ini." render={(item) => <>
      <div className={styles.historyHead}><b>{METHOD[item.method] || 'Pembayaran'}</b><b>{rp(item.amount)}</b></div>
      <small>{tgl(item.paid_at)} · {PAY_ST[item.status]?.[0]} · {invTitle(d.invById.get(item.invoice_id))}</small>
      {item.status === 'terverifikasi' && <Link href={`/kwitansi/${item.id}`}>Buka kwitansi</Link>}
    </>} />}
    {tab === 'maintenance' && <>
      {!maintenance ? <Loading /> : maintenance.error ? <div className="notice bad" role="alert">{errMsg(maintenance.error)} <button onClick={() => setAttempt(attempt + 1)}>Coba lagi</button></div>
        : <History rows={maintenance.data} empty="Belum ada riwayat perawatan." render={(item) => <>
          <div className={styles.historyHead}><b>{item.title}</b><span>{ticketStates[item.status]}</span></div>
          <small>{item.number} · {tgl(item.created_at)}{Number(item.cost) > 0 && ` · Biaya ${rp(item.cost)}`}</small>
          {item.detail && <details><summary>Rincian keluhan</summary><p>{item.detail}</p></details>}
        </>} />}
      {maintenance?.data?.length === 100 && <small>Menampilkan 100 catatan terbaru.</small>}
      <Link href={`/perbaikan?kamar=${room.id}`}>Catat perawatan untuk kamar ini</Link>
      <Link href="/perbaikan">Buka modul Perawatan</Link>
    </>}
  </Sheet>;
}

function RoomEdit({ d, room, onClose }) {
  const { kos, kosId, bump } = useKos();
  const props = propsOf(kos);
  const [branch, setBranch] = useState(room?.branch_id || '');
  const [floor, setFloor] = useState(room?.floor || '');
  const [size, setSize] = useState(room?.size_m2 ? String(room.size_m2) : '');
  const [cap, setCap] = useState(room?.capacity ? String(room.capacity) : '');
  const isNew = !room;
  const [code, setCode] = useState(room?.code || '');
  const [rent, setRent] = useState(room?.rent ? angka(room.rent) : '');
  const [status, setStatus] = useState(room?.status || 'tersedia');
  const [fac, setFac] = useState(room?.facilities?.join(', ') || '');
  const [notes, setNotes] = useState(room?.notes || '');
  const [busy, setBusy] = useState(false);
  const used = room && d.leases.some((l) => l.room_id === room.id);

  async function save() {
    if (!code.trim()) return run(() => { throw new Error('Isi kode kamar.'); });
    const data = { code: code.trim().toUpperCase(), rent: rent.trim() ? parseRp(rent) : null, facilities: fac.split(',').map((s) => s.trim()).filter(Boolean), notes: notes.trim() || null,
      floor: floor.trim() || null, size_m2: size.trim() ? Number(size.replace(',', '.')) || null : null, capacity: cap.trim() ? parseInt(cap, 10) || null : null };
    if (props.length > 1) data.branch_id = branch || null;
    if (room?.status !== 'terisi') data.status = status;
    setBusy(true);
    const ok = await run(() => isNew ? supabase.from('rooms').insert({ ...data, kos_id: kosId }) : supabase.from('rooms').update(data).eq('id', room.id), isNew ? 'Kamar ditambahkan' : 'Kamar diperbarui', errMsg);
    setBusy(false);
    if (ok) { bump(); onClose(); }
  }
  async function del() {
    if (!confirm(`Hapus kamar ${room.code}?`)) return;
    if (await run(() => supabase.from('rooms').delete().eq('id', room.id), 'Kamar dihapus', errMsg)) { bump(); onClose(); }
  }

  return (
    <Sheet title={isNew ? 'Tambah kamar' : `Ubah kamar ${room.code}`} onClose={onClose}>
      <div className="row">
        <Field label="Kode kamar"><input value={code} onChange={(e) => setCode(e.target.value)} placeholder="mis. A11" /></Field>
        <Field label="Harga sewa / bulan"><input inputMode="numeric" value={rent} onChange={(e) => setRent(e.target.value)} placeholder="belum diisi" /></Field>
      </div>
      <Field label="Status" hint={room?.status === 'terisi' ? 'Diatur otomatis oleh data sewa.' : '"Terisi" otomatis saat penghuni masuk.'}>
        {room?.status === 'terisi' ? <input value="Terisi" readOnly /> : (
          <select value={status} onChange={(e) => setStatus(e.target.value)}>{['tersedia', 'perbaikan', 'tidak_disewakan'].map((s) => <option key={s} value={s}>{ROOM_ST[s]}</option>)}</select>
        )}
      </Field>
      {props.length > 1 && <Field label="Properti / lokasi" hint="Kosong = lokasi utama"><select value={branch} onChange={(e) => setBranch(e.target.value)}>
        <option value="">{props.find((b) => b.is_main)?.name || 'Lokasi utama'}</option>{props.filter((b) => !b.is_main).map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</select></Field>}
      <div className="row">
        <Field label="Lantai (opsional)"><input value={floor} maxLength={20} onChange={(e) => setFloor(e.target.value)} placeholder="mis. 2" /></Field>
        <Field label="Luas m² (opsional)"><input inputMode="decimal" value={size} onChange={(e) => setSize(e.target.value)} /></Field>
        <Field label="Kapasitas (orang)"><input inputMode="numeric" value={cap} onChange={(e) => setCap(e.target.value)} /></Field>
      </div>
      <Field label="Fasilitas" hint="Pisahkan dengan koma. Daftar barang & kondisinya: menu Inventaris."><input value={fac} onChange={(e) => setFac(e.target.value)} placeholder="Kasur, lemari, kamar mandi dalam" /></Field>
      <Field label="Catatan"><textarea value={notes} onChange={(e) => setNotes(e.target.value)} /></Field>
      <button className="cta" onClick={save} disabled={busy}>{busy ? 'Menyimpan…' : 'Simpan'}</button>
      {!isNew && !used && <button className="danger" onClick={del}>Hapus kamar</button>}
    </Sheet>
  );
}
