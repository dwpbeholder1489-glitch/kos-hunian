'use client';
import { useEffect, useState } from 'react';
import { useBaru } from '@/lib/useBaru';
import { supabase } from '@/lib/supabase';
import { useKos } from '@/components/KosProvider';
import { useData } from '@/lib/useData';
import PageHelp from '@/components/PageHelp';
import NavIcon from '@/components/NavIcon';
import Link from 'next/link';
import { SheetSegments, SheetStats } from '@/components/SmartDetailSheet';
import css from './booking.module.css';
import { Sheet, Field, Loading, Empty, run, toast } from '@/components/ui';
import { rp, tgl, today, parseRp, errMsg, waLink, bulan, addMonthsYm } from '@/lib/format';
import { uid } from '@/lib/retail';
import { FirstDue } from '@/components/LeaseForms';
import { canArea, pathAllowed, moduleOn } from '@/lib/business';
import { UnitPicker, SpanFields, emptySpan, spanBody, useQuote, QuoteBox, UNITS, UNIT_NAME } from '@/components/SewaFleksibel';

const ACC = [['kas', 'Kas (tunai)'], ['bank', 'Bank / transfer']];
const addDays = (iso, n) => new Date(new Date(iso + 'T00:00:00Z').getTime() + n * 864e5).toISOString().slice(0, 10);
const days = (iso, base = today()) => Math.round((new Date(iso + 'T00:00:00Z') - new Date(base + 'T00:00:00Z')) / 864e5);
const when = (iso, base) => { const n = days(iso, base); return n === 0 ? 'Hari ini' : n === 1 ? 'Besok' : n > 0 ? `${n} hari lagi` : `Lewat ${-n} hari`; };
const statusList = [
  ['aktif', 'Aktif', 'Booking Aktif', 'calendar'],
  ['selesai', 'Sudah Masuk', 'Sudah Masuk', 'done'],
  ['batal', 'Batal', 'Dibatalkan', 'info'],
];
// Booking bersatuan (harian/jam/khusus) dibayar sekaligus = total; berkala = tarif per periode
const once = (b) => ['jam', 'hari', 'khusus'].includes(b.unit);
const price = (b) => (once(b) ? Number(b.total || b.rent) : Number(b.rent));
const remaining = (b) => Math.max(0, price(b) - b.dp_amount);
const formatBalance = (b) => [
  [once(b) ? 'Total Sewa' : 'Tarif Sewa', once(b) ? rp(b.total) : `${rp(b.rent)}/${b.unit === 'bulan' || !b.unit ? 'bln' : UNIT_NAME[b.unit]}`], ['Uang Tanda Jadi (DP)', rp(b.dp_amount)],
  ...(b.status === 'aktif' ? [['Sisa sewa saat masuk¹', rp(remaining(b))]] : b.status === 'batal'
    ? [['DP Dikembalikan', rp(b.refund_amount)]] : []),
];

function BookingStatus({ b, now }) {
  const late = b.status === 'aktif' && days(b.check_in, now) < 0;
  const soon = b.status === 'aktif' && days(b.check_in, now) <= 3;
  const expired = b.status === 'aktif' && b.expires_on && b.expires_on < now;
  const label = b.status === 'selesai' ? 'Sudah Masuk' : b.status === 'batal' ? 'Dibatalkan'
    : late ? 'Jadwal terlewat' : soon ? 'Segera Masuk' : 'Menunggu';
  return <span className={css.badges}>
    <span className={'chip ' + (late || b.status === 'batal' ? 'bad' : soon ? 'gold' : b.status === 'selesai' ? 'good' : 'info')}>
      <NavIcon name={b.status === 'selesai' ? 'done' : 'clock'} size={14} />{label}
    </span>
    {expired && <span className="chip bad">Lewat batas konfirmasi</span>}
  </span>;
}

export default function Booking() {
  const d = useData({ fullRoomHistory: true, requireBookings: true });
  const { kos, kosId } = useKos();
  const [f, setF] = useState('aktif');
  const [search, setSearch] = useState('');
  const [arrival, setArrival] = useState('');
  const [schedule, setSchedule] = useState('');
  const [now, setNow] = useState(today);
  const [sheet, setSheet] = useState(null);
  const [neu, setNeu] = useState(null);
  const [open, setOpen] = useState(null);
  useBaru(() => setNeu({}));
  useEffect(() => {
    const tick = () => setNow(today());
    const id = setInterval(tick, 30000);
    document.addEventListener('visibilitychange', tick);
    return () => { clearInterval(id); document.removeEventListener('visibilitychange', tick); };
  }, []);
  useEffect(() => {
    if (!kosId) return;
    const sp = new URLSearchParams(window.location.search);
    const room = sp.get('kamar'), lead = sp.get('lead');
    if (!lead) { if (room) setNeu({ room_id: room }); return; }
    const controller = new AbortController();
    supabase.from('crm_leads').select('id,name,phone,need').eq('kos_id', kosId).eq('id', lead).abortSignal(controller.signal).maybeSingle()
      .then(({ data }) => { if (!controller.signal.aborted && data) setNeu({ lead_id: data.id, name: data.name, phone: data.phone || '', note: data.need || '' }); });
    return () => controller.abort();
  }, [kosId]);
  if (!d.ready) return d.err ? <div className="notice bad">{d.err}</div> : <Loading />;
  const active = d.bookings.filter((b) => b.status === 'aktif');
  const counts = Object.fromEntries(statusList.map(([key]) => [key, d.bookings.filter((b) => b.status === key).length]));
  const q = search.trim().toLocaleLowerCase('id');
  const list = d.bookings.filter((b) => (f === 'history' ? b.status !== 'aktif' : b.status === f)
    && (!q || [b.name, b.number, d.roomCode(b.room_id)].some((value) => value.toLocaleLowerCase('id').includes(q)))
    && (!arrival || b.check_in === arrival)
    && (!schedule || (schedule === 'late' ? days(b.check_in, now) < 0 : days(b.check_in, now) >= 0 && days(b.check_in, now) <= 7)))
    .sort((a, b) => f === 'aktif' ? a.check_in.localeCompare(b.check_in) : (b.closed_at || '').localeCompare(a.closed_at || ''));
  const cur = d.bookings.find((b) => b.id === open);
  const held = active.filter((b) => b.dp_amount > 0);
  const dpHeld = held.reduce((sum, b) => sum + b.dp_amount, 0);
  const setStatus = (key) => { setF(key); setArrival(''); setSchedule(''); };
  const closeSheet = () => setSheet(null);
  return <div className={css.page}>
    {d.err && <div className="notice bad" role="alert">{d.err}</div>}
    <header className={css.hero}>
      <div><h1>Booking Kamar</h1><p>Kelola pemesanan kamar, uang tanda jadi (DP), dan status masuk penghuni.</p>
        <PageHelp page="booking" label={<><NavIcon name="/buku-besar" size={17} /> Panduan Booking <NavIcon name="next" size={15} /></>} /></div>
    </header>
    <div className={css.metrics}>{statusList.map(([key, , label, icon]) => <button key={key} data-tone={key} onClick={() => setStatus(key)}>
      <span><NavIcon name={icon} size={19} /></span><div>{label}<strong>{counts[key]}</strong></div>
    </button>)}</div>
    <nav className={css.quick} aria-label="Aksi cepat booking">
      <button className="primary" onClick={() => setNeu({})}><NavIcon name="plus" />Booking Kamar</button>
      <Link href="/kamar"><NavIcon name="bed" />Lihat Kamar</Link>
      <button onClick={() => setSheet('dp')}><NavIcon name="wallet" />Uang Tanda Jadi</button>
      <button onClick={() => setStatus('history')}><NavIcon name="/catatan" />Riwayat Booking</button>
      <button onClick={() => setSheet('more')}><NavIcon name="more" />Lainnya</button>
    </nav>
    <SheetSegments label="Status booking" options={[...statusList.map(([key, label]) => [key, `${label} (${counts[key]})`]),
      ...(f === 'history' ? [['history', 'Riwayat']] : [])]} value={f} onChange={setStatus} />
    <div className={css.tools}>
      <label><NavIcon name="search" size={18} /><input type="search" aria-label="Cari booking" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Cari nama, kode booking, atau kamar" /></label>
      <button aria-label="Kalender kedatangan" title="Kalender kedatangan" onClick={() => setSheet('calendar')}><NavIcon name="calendar" size={18} /></button>
      <button onClick={() => setSheet('filter')}><NavIcon name="filter" size={17} /> Filter</button>
    </div>
    {(arrival || schedule) && <div className="row">
      {arrival && <button className="sm" onClick={() => setArrival('')}>Masuk {tgl(arrival)} ×</button>}
      {schedule && <button className="sm" onClick={() => setSchedule('')}>{schedule === 'late' ? 'Jadwal terlewat' : '7 hari ke depan'} ×</button>}
    </div>}
    {list.length ? <div className={css.list} aria-label="Daftar booking">{list.map((b) => <button className={css.card} key={b.id} aria-label={`Detail booking ${b.name} ${b.number}`} onClick={() => setOpen(b.id)}>
      <span className={css.cardHeader}>
        <span className={css.avatar}><NavIcon name="/akun" size={25} /></span>
        <span className={css.identity}><b>{b.name}</b><small>{b.number}</small></span>
        <BookingStatus b={b} now={now} /><NavIcon name="next" size={17} />
      </span>
      <span className={css.meta}><span><NavIcon name="bed" size={17} />Kamar {d.roomCode(b.room_id)}</span>
        <span><NavIcon name="calendar" size={17} />Masuk: {tgl(b.check_in)}</span>
        {b.status === 'aktif' && <span className={`chip ${days(b.check_in, now) < 0 ? 'bad' : 'good'}`}>{when(b.check_in, now)}</span>}
      </span>
      <span className={css.amounts}>{formatBalance(b).map(([label, value]) => <span key={label}><small>{label}</small><b>{value}</b></span>)}</span>
    </button>)}</div> : <Empty title="Tidak ada booking yang cocok" text="Ubah pencarian atau filter untuk melihat booking lain." />}
    {f === 'aktif' && list.length > 0 && <small className="muted">¹ Perkiraan sisa sewa bulan pertama bila DP dipakai saat check-in.</small>}
    {sheet === 'filter' && <Sheet title="Filter booking" icon="filter" onClose={closeSheet}>
      <Field label="Status booking"><select value={f} onChange={(event) => setStatus(event.target.value)}>{statusList.map(([key, label]) => <option key={key} value={key}>{label}</option>)}<option value="history">Riwayat</option></select></Field>
      <Field label="Tanggal masuk"><input type="date" value={arrival} onChange={(event) => setArrival(event.target.value)} /></Field>
      <Field label="Jadwal kedatangan"><select value={schedule} onChange={(event) => setSchedule(event.target.value)}><option value="">Semua jadwal</option><option value="soon">Hari ini hingga 7 hari ke depan</option><option value="late">Jadwal terlewat</option></select></Field>
      <div className="row"><button onClick={() => setStatus('aktif')}>Reset</button><button className="primary" onClick={closeSheet}>Lihat {list.length} booking</button></div>
    </Sheet>}
    {sheet === 'calendar' && <ArrivalCalendar active={active} now={now} onClose={closeSheet} onDate={(date) => { setStatus('aktif'); setArrival(date); setSearch(''); closeSheet(); }} />}
    {sheet === 'more' && <Sheet title="Lainnya" onClose={closeSheet}><button onClick={() => setSheet('calendar')}>Kalender kedatangan</button>
      {pathAllowed(kos, '/halaman') && <Link href="/halaman">Portal Bisnis</Link>}
      {pathAllowed(kos, '/notifikasi') && <Link href="/notifikasi">Notifikasi</Link>}
      {pathAllowed(kos, '/pembukuan') && <Link href="/pembukuan?tab=jurnal">Jurnal Pembukuan</Link>}
    </Sheet>}
    {sheet === 'dp' && <Sheet title="Uang Tanda Jadi" icon="wallet" onClose={closeSheet}>
      <SheetStats items={[[ 'DP dipegang', rp(dpHeld) ], ['Booking dengan DP', held.length]]} />
      <p>DP booking aktif tercatat sebagai uang muka. Saat masuk, DP menjadi deposit atau diperhitungkan pada tagihan pertama.</p>
      {held.map((b) => <button key={b.id} onClick={() => { closeSheet(); setOpen(b.id); }}>{b.number} · {b.name} · {rp(b.dp_amount)}</button>)}
      {pathAllowed(kos, '/pembukuan') && <Link href="/pembukuan?tab=jurnal">Telusuri jurnal Pembukuan</Link>}
    </Sheet>}
    {neu && <BookingForm d={d} kosId={kosId} init={neu} onClose={() => setNeu(null)} onSaved={() => setNeu(null)} />}
    {cur && <Detail key={cur.id} d={d} kos={kos} b={cur} now={now} onClose={() => setOpen(null)} />}
  </div>;
}

function ArrivalCalendar({ active, now, onClose, onDate }) {
  const [month, setMonth] = useState(now.slice(0, 7));
  const first = new Date(month + '-01T00:00:00Z');
  const start = (first.getUTCDay() + 6) % 7;
  const duration = days(addMonthsYm(month, 1) + '-01', month + '-01');
  const arrivals = new Map();
  for (const { check_in } of active) arrivals.set(check_in, (arrivals.get(check_in) || 0) + 1);
  return <Sheet title="Kalender kedatangan" icon="calendar" onClose={onClose}>
    <div className="row between"><button aria-label="Bulan sebelumnya" onClick={() => setMonth(addMonthsYm(month, -1))}>‹</button>
      <b>{bulan(month)}</b><button aria-label="Bulan berikutnya" onClick={() => setMonth(addMonthsYm(month, 1))}>›</button></div>
    <div className={css.calendar}>
      {['Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab', 'Min'].map((day) => <small key={day}>{day}</small>)}
      {Array.from({ length: start }, (_, i) => <span key={`pad-${i}`} />)}
      {Array.from({ length: duration }, (_, i) => {
        const date = `${month}-${String(i + 1).padStart(2, '0')}`;
        const count = arrivals.get(date);
        return <button key={date} data-booked={Boolean(count)} aria-current={date === now ? 'date' : undefined}
          aria-label={`${tgl(date)}, ${count || 0} kedatangan`} onClick={() => onDate(date)}>{i + 1}{count && <small>{count}</small>}</button>;
      })}
    </div>
    <small className="muted">Angka kecil menunjukkan jumlah booking aktif. Pilih tanggal untuk menyaring daftar.</small>
  </Sheet>;
}

function BookingForm({ d, kosId, init, b, onClose, onSaved }) {
  const { bump } = useKos();
  const edit = Boolean(b);
  const src = b || init;
  const [p, setP] = useState({ room_id: src.room_id || '', name: src.name || '', phone: src.phone || '', check_in: src.check_in || addDays(today(), 7), months: src.months ? String(src.months) : '',
    rent: src.rent != null ? String(Math.round(src.rent)) : '', expires_on: src.expires_on || '', note: src.note || '', dp: '', dp_account: 'kas', dp_date: today() });
  const [busy, setBusy] = useState(false);
  const [id] = useState(uid);
  const { kos } = useKos();
  const flex = !edit && moduleOn(kos, 'p_tarif');
  const [unit, setUnit] = useState('bulan');
  const [span, setSpan] = useState(emptySpan('hari'));
  const q = useQuote(kosId, unit !== 'bulan' ? p.room_id : null, unit, span);
  const set = (k, v) => setP((x) => ({ ...x, [k]: v }));
  const room = p.room_id && d.roomById.get(p.room_id);
  useEffect(() => { if (room && !edit && !p.rent && room.rent) set('rent', String(Math.round(room.rent))); }, [p.room_id]);
  const occ = room && d.activeByRoom.get(room.id);
  // kamar yang bisa dipilih: belum dibooking orang lain dan bukan "tidak disewakan"
  // sewa bersatuan (harian dst): beberapa booking per kamar boleh selama jadwalnya tidak bertumpuk (dicek server)
  const rooms = d.rooms.filter((r) => r.status !== 'tidak_disewakan' && (unit !== 'bulan' || !d.bookByRoom.get(r.id) || d.bookByRoom.get(r.id).id === b?.id));
  const save = async () => {
    if (!p.room_id) return toast('Pilih kamar.');
    if (p.name.trim().length < 2) return toast('Isi nama calon penghuni.');
    if (unit !== 'bulan') {
      if (!q || q.error || q.clash) return toast(q?.error || q?.clash || 'Lengkapi jadwal sewa.');
      const dp = p.dp.trim() ? parseRp(p.dp) : 0;
      setBusy(true);
      const ok = await run(() => supabase.rpc('booking_create', { p_id: id, p_kos: kosId, p: { room_id: p.room_id, name: p.name, phone: p.phone, note: p.note, expires_on: p.expires_on, ...spanBody(unit, span),
        lead_id: init.lead_id || null, dp_amount: dp, dp_account: p.dp_account, dp_date: p.dp_date } }), `Booking dicatat · total ${rp(q.total)}`, errMsg);
      setBusy(false);
      if (ok) { bump(); onSaved(); }
      return;
    }
    if (!p.check_in) return toast('Isi tanggal masuk.');
    const rent = parseRp(p.rent);
    if (!(rent >= 0) || p.rent === '') return toast('Isi harga sewa yang disepakati.');
    const dp = p.dp.trim() ? parseRp(p.dp) : 0;
    if (p.dp.trim() && !(dp > 0)) return toast('Jumlah DP tidak valid.');
    setBusy(true);
    const body = { room_id: p.room_id, name: p.name, phone: p.phone, check_in: p.check_in, months: p.months, rent, expires_on: p.expires_on, note: p.note };
    const ok = edit
      ? await run(() => supabase.rpc('booking_update', { p_booking: b.id, p: body }), 'Booking diperbarui', errMsg)
      : await run(() => supabase.rpc('booking_create', { p_id: id, p_kos: kosId, p: { ...body, lead_id: init.lead_id || null, dp_amount: dp, dp_account: p.dp_account, dp_date: p.dp_date } }), 'Booking dicatat', errMsg);
    setBusy(false);
    if (ok) { bump(); onSaved(); }
  };
  return (
    <Sheet title={edit ? `Ubah ${b.number}` : 'Booking kamar'} onClose={onClose}>
      {init?.lead_id && <div className="notice small">Dari prospek: {init.name}. Saat check-in, prospek otomatis ditandai Jadi.</div>}
      <Field label="Kamar"><select value={p.room_id} onChange={(e) => set('room_id', e.target.value)}><option value="">Pilih kamar…</option>
        {rooms.map((r) => { const l = d.activeByRoom.get(r.id); return <option key={r.id} value={r.id}>{r.code}{l ? ` · terisi${l.end_date ? ` s/d ${tgl(l.end_date)}` : ''}` : r.status === 'perbaikan' ? ' · perbaikan' : ' · kosong'}{r.rent ? ` · ${rp(r.rent)}` : ''}</option>; })}</select></Field>
      {flex && <UnitPicker value={unit} onChange={(u) => { setUnit(u); if (u !== 'bulan') setSpan(emptySpan(u)); }} />}
      {occ && unit === 'bulan' && <span className="small muted">Kamar ini masih terisi {d.occName(occ.occupant_id)}{occ.end_date ? ` sampai ${tgl(occ.end_date)} — tanggal masuk harus setelahnya.` : ' tanpa rencana selesai. Isi dulu di Penghuni › ketuk nama › Rencana selesai › ubah.'}</span>}
      <div className="row">
        <Field label="Nama calon penghuni"><input value={p.name} maxLength={80} onChange={(e) => set('name', e.target.value)} /></Field>
        <Field label="No. WhatsApp"><input inputMode="tel" value={p.phone} onChange={(e) => set('phone', e.target.value)} /></Field>
      </div>
      {unit !== 'bulan' ? <><SpanFields unit={unit} value={span} onChange={setSpan} /><QuoteBox q={q} unit={unit} /></> : <>
      <div className="row">
        <Field label="Tanggal masuk"><input type="date" value={p.check_in} onChange={(e) => set('check_in', e.target.value)} /></Field>
        <Field label="Lama sewa (bulan, opsional)"><input inputMode="numeric" value={p.months} onChange={(e) => set('months', e.target.value.replace(/\D/g, ''))} placeholder="mis. 6" /></Field>
      </div></>}
      <div className="row">
        {unit === 'bulan' && <Field label="Sewa per bulan (disepakati)"><input inputMode="numeric" value={p.rent} onChange={(e) => set('rent', e.target.value)} /></Field>}
        <Field label="Batas konfirmasi (opsional)" hint="lewat tanggal ini tampil peringatan"><input type="date" value={p.expires_on} onChange={(e) => set('expires_on', e.target.value)} /></Field>
      </div>
      {!edit && <>
        <Field label="Uang tanda jadi / DP (opsional)" hint="Dipegang dulu; saat check-in jadi deposit atau bayar tagihan pertama"><input inputMode="numeric" value={p.dp} onChange={(e) => set('dp', e.target.value)} placeholder="mis. 300rb" /></Field>
        {p.dp.trim() && <div className="row">
          <div className="seg">{ACC.map(([k, l]) => <button key={k} className={p.dp_account === k ? 'on' : ''} onClick={() => set('dp_account', k)}>{l}</button>)}</div>
          <Field label="Tanggal DP diterima"><input type="date" value={p.dp_date} max={today()} onChange={(e) => set('dp_date', e.target.value)} /></Field>
        </div>}
      </>}
      <Field label="Catatan (opsional)"><input value={p.note} maxLength={300} onChange={(e) => set('note', e.target.value)} placeholder="mis. mahasiswi, minta kasur baru" /></Field>
      <button className="cta" disabled={busy} onClick={save}>{busy ? 'Menyimpan…' : 'Simpan'}</button>
    </Sheet>
  );
}

function Detail({ d, kos, b, now, onClose }) {
  const { bump } = useKos();
  const money = canArea(kos, 'finance');
  const [mode, setMode] = useState(null);
  const room = d.roomById.get(b.room_id);
  const occ = d.activeByRoom.get(b.room_id);
  const first = b.lease_id && d.invoices.filter((i) => i.lease_id === b.lease_id && i.kind === 'sewa' && i.status !== 'batal')
    .reduce((old, i) => !old || i.period_start < old.period_start ? i : old, null);
  const canIn = b.status === 'aktif' && room?.status === 'tersedia';
  const msg = `Halo ${b.name}, booking kamar ${room?.code} di ${kos.name} sudah kami catat (${b.number}). Tanggal masuk ${tgl(b.check_in)}${b.check_out ? ` s/d ${tgl(b.check_out)}` : ''}, sewa ${once(b) ? `${rp(b.total)} total` : `${rp(b.rent)}/${UNIT_NAME[b.unit || 'bulan']}`}${b.dp_amount > 0 ? `, uang tanda jadi ${rp(b.dp_amount)} sudah kami terima` : ''}${b.expires_on ? `. Mohon konfirmasi sebelum ${tgl(b.expires_on)}` : ''}. Terima kasih.`;
  if (mode === 'ubah') return <BookingForm d={d} kosId={kos.id} b={b} onClose={() => setMode(null)} onSaved={() => setMode(null)} />;
  return (
    <Sheet title={b.name} subtitle={b.number} icon="calendar" wide onClose={onClose}>
      <BookingStatus b={b} now={now} />
      <SheetStats items={formatBalance(b)} />
      {b.status === 'aktif' && <small className="muted">¹ Bila DP digunakan untuk tagihan pertama. Jika DP menjadi deposit, sisa sewa bulan pertama mengikuti tarif penuh.</small>}
      {b.status === 'selesai' && <div className="row">
        <Link href="/penghuni">Buka Penghuni</Link>
        {first && <Link href={`/tagihan?invoice=${first.id}`}>Tagihan sewa pertama</Link>}
      </div>}
      <dl className="kv">
        <dt>Kamar</dt><dd>{room?.code}</dd>
        <dt>Tanggal masuk</dt><dd>{tgl(b.check_in)}{b.status === 'aktif' ? ` (${when(b.check_in, now)})` : ''}</dd>
        {b.months && <><dt>Lama sewa</dt><dd>{b.months} bulan</dd></>}
        {b.unit && b.unit !== 'bulan' && <><dt>Jenis sewa</dt><dd>{UNITS.find(([k]) => k === b.unit)?.[1]}{b.start_at ? ` · ${new Date(b.start_at).toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' })} – ${new Date(b.end_at).toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' })}` : b.check_out ? ` · keluar ${tgl(b.check_out)}` : ''}</dd></>}
        <dt>Sewa</dt><dd>{once(b) ? `${rp(b.total)} total (${b.quote?.qty || ''} ${UNIT_NAME[b.unit]})` : `${rp(b.rent)}/${UNIT_NAME[b.unit || 'bulan']}`}</dd>
        <dt>Uang tanda jadi</dt><dd>{b.dp_amount > 0 ? `${rp(b.dp_amount)} · ${b.dp_account === 'bank' ? 'bank' : 'kas'} · ${tgl(b.dp_date)}` : '—'}</dd>
        {b.phone && <><dt>WhatsApp</dt><dd>{b.phone}</dd></>}
        {b.applicant?.address && <><dt>Alamat asal</dt><dd style={{ overflowWrap: 'anywhere' }}>{b.applicant.address}</dd></>}
        {b.applicant?.emergency_phone && <><dt>Kontak darurat</dt><dd>{b.applicant.emergency_name}{b.applicant.emergency_rel ? ` (${b.applicant.emergency_rel})` : ''} · {b.applicant.emergency_phone}</dd></>}
        {b.expires_on && <><dt>Batas konfirmasi</dt><dd style={{ color: b.status === 'aktif' && b.expires_on < today() ? 'var(--bad)' : undefined }}>{tgl(b.expires_on)}</dd></>}
        {b.note && <><dt>Catatan</dt><dd>{b.note}</dd></>}
        {b.status !== 'aktif' && <><dt>{b.status === 'selesai' ? 'Masuk' : 'Dibatalkan'}</dt><dd>{tgl(b.closed_date)} · {b.closed_by}</dd></>}
        {b.status === 'batal' && <><dt>Alasan</dt><dd>{b.close_reason}</dd>{b.dp_amount > 0 && <><dt>DP</dt><dd>dikembalikan {rp(b.refund_amount)} · hangus {rp(b.forfeit_amount)}</dd></>}</>}
        <dt>Dicatat</dt><dd>{b.created_by}</dd>
      </dl>
      {b.status === 'aktif' && <>
        {!canIn && occ && <div className="notice small">Kamar masih ditempati {d.occName(occ.occupant_id)}. Akhiri sewanya dulu (Kamar › Akhiri sewa), lalu Check-in.</div>}
        {!canIn && !occ && room?.status === 'perbaikan' && <div className="notice small">Kamar sedang perbaikan. Selesaikan keluhannya dulu, lalu Check-in.</div>}
        <div className="row">
          <button className="primary" disabled={!canIn} onClick={() => setMode(mode === 'checkin' ? null : 'checkin')}>Konfirmasi masuk</button>
          <button disabled={!canIn} onClick={() => setMode(mode === 'settle' ? null : 'settle')}>Pelunasan saat masuk</button>
          <button className="sm" onClick={() => setMode('ubah')}>Ubah jadwal</button>
          {b.phone && <a href={waLink(b.phone, msg)} target="_blank" rel="noreferrer">Hubungi via WhatsApp</a>}
        </div>
        {['checkin', 'settle'].includes(mode) && <CheckIn key={mode} d={d} b={b} settle={mode === 'settle'} onDone={() => { bump(); onClose(); }} />}
        {(b.dp_amount === 0 || money) ? <button className="sm ghost danger" onClick={() => setMode(mode === 'batal' ? null : 'batal')}>{b.dp_amount > 0 ? 'Batalkan / kembalikan DP' : 'Batalkan booking'}</button>
          : <span className="small muted">Booking dengan DP hanya bisa dibatalkan pemilik/pengelola.</span>}
        {mode === 'batal' && <Cancel b={b} onDone={() => { bump(); onClose(); }} />}
      </>}
    </Sheet>
  );
}

function CheckIn({ d, b, settle, onDone }) {
  const normalizedPhone = (value) => (value || '').replace(/\D/g, '').replace(/^0/, '62');
  const normalizedName = (value) => value.trim().toLocaleLowerCase('id').replace(/\s+/g, ' ');
  const matches = normalizedPhone(b.phone).length >= 8 ? d.occupants.filter((o) => normalizedPhone(o.phone) === normalizedPhone(b.phone) && normalizedName(o.name) === normalizedName(b.name)) : [];
  const reusable = matches.length === 1 && !d.activeByOcc.has(matches[0].id) ? matches[0].id : '';

  const [start, setStart] = useState(b.check_in < today() ? today() : b.check_in);
  const [due, setDue] = useState(addDays(b.check_in < today() ? today() : b.check_in, 3));
  const [paid, setPaid] = useState(() => settle && remaining(b) > 0 ? String(remaining(b)) : '');
  const [method, setMethod] = useState('tunai');
  const [end, setEnd] = useState('');
  const [occ, setOcc] = useState(reusable);
  const [apply, setApply] = useState(b.dp_amount > 0);
  const [busy, setBusy] = useState(false);
  const free = d.occupants.filter((o) => !d.activeByOcc.get(o.id));
  const go = async () => {
    if (!start || !due) return toast('Isi tanggal masuk dan batas bayar.');
    if (!occ && matches.length) return toast('Penghuni dengan nama dan nomor ini sudah terdaftar. Pilih datanya, atau periksa sewa aktifnya.');
    if (due < start) return toast('Batas bayar tidak boleh sebelum tanggal masuk.');
    const pay = parseRp(paid) || 0;
    if (paid.trim() && !(pay > 0)) return toast('Jumlah pembayaran tidak valid.');
    setBusy(true);
    const ok = await run(() => supabase.rpc('booking_checkin', { p_booking: b.id, p: { start, billing_start: start, first_due: due, end: end || null, occupant_id: occ || null, dp_to_invoice: apply, ...(pay > 0 ? { paid_amount: pay, paid_method: method } : {}) } }),
      'Check-in selesai. Sewa dimulai.' + (b.dp_amount > 0 ? (apply ? ' DP dipakai untuk tagihan pertama.' : ' DP menjadi deposit.') : '') + (pay > 0 ? ` Pembayaran ${rp(pay)} tercatat.` : ` Tagihan pertama jatuh tempo ${tgl(due)}.`), errMsg);
    setBusy(false);
    if (ok) onDone();
  };
  return (
    <div className="unitbox">
      <Field label="Tanggal masuk" hint="Sewa dihitung mulai tanggal ini"><input type="date" value={start} onChange={(e) => { const v = e.target.value; if (v && (!start || due < v || due === addDays(start, 3))) setDue(addDays(v, 3)); setStart(v); }} /></Field>
      <div className="row">
        <Field label={once(b) ? 'Sewa sudah dibayar?' : 'Sewa periode pertama sudah dibayar?'} hint={`Kosongkan bila belum. ${once(b) ? `Total ${rp(b.total)}` : `Sewa ${rp(b.rent)}/${UNIT_NAME[b.unit || 'bulan']}`}`}><input inputMode="numeric" value={paid} onChange={(e) => setPaid(e.target.value)} placeholder="Rp" /></Field>
        {paid.trim() && <Field label="Cara bayar"><select value={method} onChange={(e) => setMethod(e.target.value)}><option value="tunai">Tunai</option><option value="transfer">Transfer</option><option value="ewallet">QRIS / e-wallet</option></select></Field>}
      </div>
      {!paid.trim() && <button type="button" className="sm ghost" style={{ alignSelf: 'flex-start' }} onClick={() => setPaid(String(Math.max(0, Math.round(price(b) - (apply ? b.dp_amount : 0)))))}>Sudah dibayar penuh → isi {rp(Math.max(0, price(b) - (apply ? b.dp_amount : 0)))}</button>}
      {(parseRp(paid) || 0) + (apply ? Number(b.dp_amount) : 0) < price(b) && <FirstDue start={start} value={due} onChange={setDue} />}
      {!once(b) && <Field label="Rencana selesai (opsional)" hint={b.months ? `kosongkan = ${b.months} bulan dari tanggal masuk` : undefined}><input type="date" value={end} onChange={(e) => setEnd(e.target.value)} /></Field>}
      {matches.length > 0 && <p className="small muted">Nama dan nomor WhatsApp cocok dengan data penghuni yang sudah ada. Gunakan kembali datanya jika sewa sebelumnya sudah selesai.</p>}
      <Field label="Data penghuni"><select value={occ} onChange={(e) => setOcc(e.target.value)}><option value="">Buat penghuni baru: {b.name}{b.phone ? ` · ${b.phone}` : ''}</option>{free.map((o) => <option key={o.id} value={o.id}>Pakai data lama: {o.name}</option>)}</select></Field>
      {b.dp_amount > 0 && <>
        <label className="row small" style={{ flexWrap: 'nowrap' }}><input type="checkbox" style={{ width: 22, minHeight: 22, flex: 'none' }} checked={apply} onChange={(e) => {
          if (settle && (!paid || Number(paid) === (apply ? remaining(b) : price(b)))) {
            const next = e.target.checked ? remaining(b) : price(b);
            setPaid(next > 0 ? String(next) : '');
          }
          setApply(e.target.checked);
        }} />Pakai DP {rp(b.dp_amount)} untuk membayar tagihan pertama</label>
        <span className="small muted">{apply ? 'DP melunasi tagihan pertama (sisa DP bila ada tetap jadi deposit).' : 'DP disimpan sebagai deposit/uang jaminan penghuni.'}</span>
      </>}
      <button className="cta" disabled={busy} onClick={go}>{busy ? 'Memproses…' : 'Check-in sekarang'}</button>
    </div>
  );
}

function Cancel({ b, onDone }) {
  const [reason, setReason] = useState('');
  const [refund, setRefund] = useState(b.dp_amount > 0 ? String(Math.round(b.dp_amount)) : '');
  const [acc, setAcc] = useState(b.dp_account || 'kas');
  const [busy, setBusy] = useState(false);
  const r = b.dp_amount > 0 ? (refund.trim() ? parseRp(refund) : 0) : 0;
  const go = async () => {
    if (!reason.trim()) return toast('Tulis alasan pembatalan.');
    if (b.dp_amount > 0 && !(r >= 0 && r <= b.dp_amount)) return toast(`Pengembalian 0 sampai ${rp(b.dp_amount)}.`);
    setBusy(true);
    const ok = await run(() => supabase.rpc('booking_cancel', { p_booking: b.id, p_reason: reason.trim(), p_refund: r, p_account: acc }), 'Booking dibatalkan', errMsg);
    setBusy(false);
    if (ok) onDone();
  };
  return (
    <div className="unitbox">
      <Field label="Alasan"><input value={reason} maxLength={200} onChange={(e) => setReason(e.target.value)} placeholder="mis. tidak jadi kuliah di sini" /></Field>
      {b.dp_amount > 0 && <>
        <Field label="DP dikembalikan" hint={`dari DP ${rp(b.dp_amount)}; sisanya hangus jadi pendapatan lain`}><input inputMode="numeric" value={refund} onChange={(e) => setRefund(e.target.value)} /></Field>
        {r > 0 && <div className="seg">{ACC.map(([k, l]) => <button key={k} className={acc === k ? 'on' : ''} onClick={() => setAcc(k)}>Dari {l}</button>)}</div>}
        <span className="small muted">Dikembalikan {rp(r)} · hangus {rp(Math.max(0, b.dp_amount - r))}</span>
      </>}
      <button className="danger" disabled={busy} onClick={go}>{busy ? 'Memproses…' : 'Batalkan booking'}</button>
    </div>
  );
}
