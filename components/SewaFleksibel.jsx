'use client';
// Universal Rental Engine — komponen bersama (Booking, Kamar, Tarif & kalender).
// Harga SELALU dari rental_quote (server); komponen ini hanya mengumpulkan isian & menampilkan rinciannya.
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useKos } from '@/components/KosProvider';
import { Sheet, Field, run, toast } from '@/components/ui';
import { rp, tgl, today, errMsg, parseRp } from '@/lib/format';
import { uid } from '@/lib/retail';

export const UNITS = [['jam', 'Per jam'], ['hari', 'Harian'], ['minggu', 'Mingguan'], ['bulan', 'Bulanan'], ['tahun', 'Tahunan'], ['khusus', 'Periode khusus']];
export const UNIT_NAME = { jam: 'jam', hari: 'malam', minggu: 'minggu', bulan: 'bulan', tahun: 'tahun', khusus: 'periode' };
export const cycleLabel = (c) => (UNITS.find(([k]) => k === (c || 'bulan')) || UNITS[3])[1];
// Harga sewa untuk tampilan daftar: berkala = per periode; sekali bayar = total
export const rentText = (l) => (!l ? '' : ['jam', 'hari', 'khusus'].includes(l.cycle) ? `${rp(l.stay_total ?? l.rent)} total` : `${rp(l.rent)}/${UNIT_NAME[l.cycle || 'bulan']}`);
const addDays = (d, k) => { const x = new Date(d + 'T00:00:00Z'); x.setUTCDate(x.getUTCDate() + k); return x.toISOString().slice(0, 10); };
const localNow = (h = 0) => { const x = new Date(Date.now() + h * 36e5 + 7 * 36e5); return x.toISOString().slice(0, 13) + ':00'; };
const toTs = (v) => (v ? new Date(v + '+07:00').toISOString() : null);

// Isian waktu sesuai satuan. value = {check_in, check_out, start_at, end_at, price}
export function emptySpan(unit) {
  return unit === 'jam' ? { start_at: localNow(1), end_at: localNow(3) } : { check_in: today(), check_out: unit === 'hari' ? addDays(today(), 1) : '' };
}
export function spanBody(unit, v) {
  return unit === 'jam' ? { unit, start_at: toTs(v.start_at), end_at: toTs(v.end_at) }
    : { unit, check_in: v.check_in, check_out: v.check_out || null, ...(unit === 'khusus' ? { price: parseRp(v.price || '') || null } : {}) };
}
export function SpanFields({ unit, value, onChange }) {
  const set = (k, x) => onChange({ ...value, [k]: x });
  if (unit === 'jam') return <div className="row">
    <Field label="Mulai"><input type="datetime-local" value={value.start_at || ''} onChange={(e) => set('start_at', e.target.value)} /></Field>
    <Field label="Selesai"><input type="datetime-local" value={value.end_at || ''} onChange={(e) => set('end_at', e.target.value)} /></Field>
  </div>;
  return <>
    <div className="row">
      <Field label={unit === 'hari' ? 'Check-in' : 'Tanggal mulai'}><input type="date" value={value.check_in || ''} onChange={(e) => set('check_in', e.target.value)} /></Field>
      <Field label={unit === 'hari' ? 'Check-out' : unit === 'khusus' ? 'Tanggal selesai' : 'Sampai (opsional)'} hint={unit === 'hari' ? 'tanggal tamu keluar' : unit === 'khusus' ? '' : 'kosong = berlanjut, ditagih tiap periode'}>
        <input type="date" value={value.check_out || ''} min={value.check_in || undefined} onChange={(e) => set('check_out', e.target.value)} /></Field>
    </div>
    {unit === 'khusus' && <Field label="Harga total periode" hint="Diisi sesuai kesepakatan"><input inputMode="numeric" value={value.price || ''} onChange={(e) => set('price', e.target.value)} /></Field>}
  </>;
}

// Pratinjau harga dari server (rental_quote) + peringatan bentrok jadwal
export function useQuote(kosId, roomId, unit, value) {
  const [q, setQ] = useState(null);
  const body = spanBody(unit, value);
  const key = JSON.stringify([roomId, body]);
  useEffect(() => {
    if (!kosId || !roomId || !unit) { setQ(null); return undefined; }
    const start = unit === 'jam' ? body.start_at : body.check_in && new Date(body.check_in + 'T00:00:00+07:00').toISOString();
    const end = unit === 'jam' ? body.end_at : body.check_out && new Date(body.check_out + 'T00:00:00+07:00').toISOString();
    if (!start) { setQ(null); return undefined; }
    let on = true;
    const t = setTimeout(() => {
      supabase.rpc('rental_quote', { p_kos: kosId, p_room: roomId, p_unit: unit, p_start: start, p_end: end || null, p_price: body.price || null })
        .then(({ data, error }) => { if (on) setQ(error ? { error: errMsg(error) } : data); });
    }, 350);
    return () => { on = false; clearTimeout(t); };
  }, [kosId, key]); // eslint-disable-line react-hooks/exhaustive-deps
  return q;
}
export function QuoteBox({ q, unit }) {
  if (!q) return null;
  if (q.error) return <div className="notice bad small">{q.error}</div>;
  const name = UNIT_NAME[unit];
  return <div className="unitbox small" style={{ gap: 4 }}>
    {(q.lines || []).map((l, i) => <div key={i} className="row between"><span>{l.label || `${l.qty} ${name}${l.from ? ` mulai ${tgl(l.from)}` : ''}`}</span><span>{rp(l.price)} × {l.qty}</span></div>)}
    {(q.adjustments || []).map((a) => <div key={a.name} className="row between"><span>{a.name}</span><span>{rp(a.amount)}</span></div>)}
    <div className="row between"><b>{['minggu', 'bulan', 'tahun'].includes(unit) && q.qty === 1 ? `Per ${name}` : `Total ${q.qty} ${name}`}</b><b>{rp(q.total)}</b></div>
    {q.rules?.length > 0 && <span className="muted">Aturan tarif: {q.rules.join(', ')}</span>}
    {q.clash && <span style={{ color: 'var(--bad)' }}>{q.clash}</span>}
  </div>;
}
export function UnitPicker({ value, onChange, allowed = UNITS.map(([k]) => k) }) {
  return <div className="seg" role="group" aria-label="Jenis sewa">{UNITS.filter(([k]) => allowed.includes(k)).map(([k, l]) =>
    <button key={k} type="button" className={value === k ? 'on' : ''} onClick={() => onChange(k)}>{l}</button>)}</div>;
}

// Sewa langsung tanpa booking (walk-in): penghuni lama/baru → rental_start
export function RentalStartSheet({ d, roomId, onClose }) {
  const { kosId, bump } = useKos();
  const [room, setRoom] = useState(roomId || '');
  const [unit, setUnit] = useState('hari');
  const [span, setSpan] = useState(emptySpan('hari'));
  const [occ, setOcc] = useState('');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [busy, setBusy] = useState(false);
  const q = useQuote(kosId, room, unit, span);
  const free = d.occupants.filter((o) => !d.activeByOcc.get(o.id));
  const rooms = d.rooms.filter((r) => r.status === 'tersedia');
  const go = async () => {
    if (!room) return toast('Pilih kamar.');
    if (!occ && name.trim().length < 2) return toast('Isi nama tamu/penyewa.');
    setBusy(true);
    const ok = await run(async () => {
      let id = occ;
      if (!id) {
        const { data, error } = await supabase.from('occupants').insert({ kos_id: kosId, name: name.trim(), phone: phone.trim() || null }).select('id').single();
        if (error) return { error };
        id = data.id;
      }
      return supabase.rpc('rental_start', { p_room: room, p_occupant: id, p: spanBody(unit, span) });
    }, 'Sewa dimulai. Tagihan terbit otomatis.', errMsg);
    setBusy(false);
    if (ok) { bump(); onClose(); }
  };
  return <Sheet title="Sewa langsung (per jam/harian/mingguan…)" onClose={onClose}>
    <Field label="Kamar / unit"><select value={room} onChange={(e) => setRoom(e.target.value)}><option value="">Pilih…</option>{rooms.map((r) => <option key={r.id} value={r.id}>{r.code}</option>)}</select></Field>
    <UnitPicker value={unit} onChange={(u) => { setUnit(u); setSpan(emptySpan(u)); }} allowed={['jam', 'hari', 'minggu', 'tahun', 'khusus']} />
    <SpanFields unit={unit} value={span} onChange={setSpan} />
    <QuoteBox q={q} unit={unit} />
    <Field label="Tamu / penyewa"><select value={occ} onChange={(e) => setOcc(e.target.value)}><option value="">Baru</option>{free.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}</select></Field>
    {!occ && <div className="row"><Field label="Nama"><input value={name} maxLength={80} onChange={(e) => setName(e.target.value)} /></Field>
      <Field label="No. WhatsApp"><input inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} /></Field></div>}
    <p className="small muted">Per jam/harian/khusus ditagih sekali untuk seluruh masa sewa; mingguan & tahunan ditagih tiap periode. Deposit dicatat di detail penghuni.</p>
    <button className="cta" disabled={busy || !q || q.error || q.clash} onClick={go}>{busy ? 'Memproses…' : `Mulai sewa${q?.total ? ` · ${rp(q.total)}` : ''}`}</button>
  </Sheet>;
}

// Perpanjang sewa sekali bayar → tagihan tambahan
export function ExtendSheet({ lease, onClose }) {
  const { kosId, bump } = useKos();
  const unit = lease.cycle;
  const [span, setSpan] = useState(unit === 'jam'
    ? { start_at: lease.end_at ? new Date(new Date(lease.end_at).getTime() + 7 * 36e5).toISOString().slice(0, 16) : localNow(), end_at: lease.end_at ? new Date(new Date(lease.end_at).getTime() + 8 * 36e5).toISOString().slice(0, 16) : localNow(1) }
    : { check_in: addDays(lease.end_date, 1), check_out: addDays(lease.end_date, 2) });
  const [busy, setBusy] = useState(false);
  const q = useQuote(kosId, lease.room_id, unit, span);
  const go = async () => {
    setBusy(true);
    const ok = await run(() => supabase.rpc('rental_extend', { p_lease: lease.id, p: unit === 'jam' ? { end_at: toTs(span.end_at) } : { check_out: span.check_out, price: parseRp(span.price || '') || null } }),
      'Sewa diperpanjang; tagihan tambahan terbit.', errMsg);
    setBusy(false);
    if (ok) { bump(); onClose(); }
  };
  return <Sheet title="Perpanjang sewa" onClose={onClose}>
    <p className="small muted">Sekarang sampai {unit === 'jam' && lease.end_at ? new Date(lease.end_at).toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' }) : tgl(lease.end_date)}. Pilih waktu selesai yang baru.</p>
    {unit === 'jam' ? <Field label="Selesai baru"><input type="datetime-local" value={span.end_at} onChange={(e) => setSpan({ ...span, end_at: e.target.value })} /></Field>
      : <Field label={unit === 'hari' ? 'Check-out baru' : 'Tanggal selesai baru'}><input type="date" value={span.check_out} min={span.check_in} onChange={(e) => setSpan({ ...span, check_out: e.target.value })} /></Field>}
    {unit === 'khusus' && <Field label="Harga tambahan"><input inputMode="numeric" value={span.price || ''} onChange={(e) => setSpan({ ...span, price: e.target.value })} /></Field>}
    <QuoteBox q={q} unit={unit} />
    <button className="cta" disabled={busy || !q || q.error || q.clash} onClick={go}>{busy ? 'Memproses…' : 'Perpanjang'}</button>
  </Sheet>;
}
export { uid };
