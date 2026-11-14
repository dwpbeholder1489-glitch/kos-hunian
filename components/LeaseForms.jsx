'use client';
import { useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useKos } from '@/components/KosProvider';
import { Sheet, Field, run, toast } from '@/components/ui';
import { today, parseRp, rp, angka, errMsg, tgl } from '@/lib/format';
import { uid } from '@/lib/retail';

const plusDays = (iso, n) => new Date(new Date(iso + 'T00:00:00Z').getTime() + n * 864e5).toISOString().slice(0, 10);

// Batas bayar tagihan bulan pertama untuk penghuni baru (periode sewa tetap dihitung dari tanggal masuk).
// Server: leases.first_due lewat booking_checkin/lead_move_in (p.first_due) atau lease_first_due.
export function FirstDue({ start, value, onChange, label = 'Batas bayar sewa bulan pertama' }) {
  const opts = [['Hari masuk', 0], ['+3 hari', 3], ['+7 hari', 7]];
  return (
    <div className="stack" style={{ gap: 6 }}>
      <span className="label">{label}</span>
      <div className="seg">{opts.map(([l, n]) => { const v = plusDays(start, n); return <button key={l} type="button" className={value === v ? 'on' : ''} onClick={() => onChange(v)}>{l}</button>; })}</div>
      <input type="date" value={value} min={start} onChange={(e) => onChange(e.target.value)} aria-label={label} />
      <span className="small muted">Tagihan bulan pertama baru dianggap <b>jatuh tempo</b> pada {tgl(value)} — sebelum itu tidak dihitung telat dan tidak masuk pengingat. Periode sewa tetap dihitung dari tanggal masuk.</span>
    </div>
  );
}
export { plusDays };

// Isi kamar: pilih penghuni lama atau tambah penghuni baru, lalu mulai sewa
export function StartLeaseSheet({ d, roomId: fixedRoom, occupantId: fixedOcc, onClose }) {
  const { kosId, bump } = useKos();
  const free = d.rooms.filter((r) => r.status === 'tersedia' && !d.bookByRoom?.get(r.id)); // kamar dibooking: isi lewat Booking › Check-in
  const idleOcc = d.occupants.filter((o) => !d.activeByOcc.has(o.id));
  const [roomId, setRoom] = useState(fixedRoom || free[0]?.id || '');
  const [mode, setMode] = useState(fixedOcc ? 'lama' : idleOcc.length ? 'lama' : 'baru');
  const [occId, setOcc] = useState(fixedOcc || idleOcc[0]?.id || '');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const room = d.roomById.get(roomId);
  const [rent, setRent] = useState(room?.rent ? angka(room.rent) : '');
  const [start, setStart] = useState(today());
  const [bill, setBill] = useState(today());
  const [due, setDue] = useState(plusDays(today(), 3));
  const [end, setEnd] = useState('');
  const [dep, setDep] = useState('');
  const [depAcc, setDepAcc] = useState('kas');
  const [depId] = useState(uid);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);

  async function save() {
    setErr(null);
    const r = parseRp(rent);
    if (!roomId) return setErr('Pilih kamar.');
    if (!(r > 0)) return setErr('Isi harga sewa per bulan.');
    if (mode === 'baru' && !name.trim()) return setErr('Isi nama penghuni.');
    if (mode === 'lama' && !occId) return setErr('Pilih penghuni.');
    if (bill < start) return setErr('Tagihan pertama tidak boleh sebelum tanggal masuk.');
    const depAmt = dep.trim() ? parseRp(dep) : 0;
    if (dep.trim() && !(depAmt > 0)) return setErr('Jumlah deposit tidak valid.');
    setBusy(true);
    let oid = occId;
    if (mode === 'baru') {
      const { data, error } = await supabase.from('occupants').insert({ kos_id: kosId, name: name.trim(), phone: phone.trim() || null }).select('id').single();
      if (error) { setErr(errMsg(error)); setBusy(false); return; }
      oid = data.id;
    }
    let leaseId = null;
    const ok = await run(async () => { const res = await supabase.rpc('start_lease', { p_room: roomId, p_occupant: oid, p_start: start, p_rent: r, p_billing_start: bill, p_end: end || null }); leaseId = res.data; return res; }, 'Sewa dimulai. Tagihan dibuat otomatis.', errMsg);
    if (ok && leaseId && bill === start && due && due !== start) {
      // penghuni baru: batas bayar tagihan pertama (bila gagal, sewa tetap berjalan; bisa diubah dari detail penghuni)
      await run(() => supabase.rpc('lease_first_due', { p_lease: leaseId, p_due: due }), null, errMsg);
    }
    if (ok && leaseId && depAmt > 0) {
      // deposit dicatat terpisah; bila gagal, sewa tetap berjalan dan deposit bisa dicatat dari Penghuni › Deposit
      await run(() => supabase.rpc('deposit_add', { p_id: depId, p_lease: leaseId, p_kind: 'terima', p_amount: depAmt, p_date: start > today() ? today() : start, p_account: depAcc, p_reason: null, p_invoice: null }), `Deposit ${rp(depAmt)} dicatat`, errMsg);
    }
    setBusy(false);
    if (ok) { bump(); onClose(); } else if (mode === 'baru') { bump(); setMode('lama'); setOcc(oid); }
  }

  return (
    <Sheet title="Isi kamar" onClose={onClose}>
      {!fixedRoom && (
        <Field label="Kamar">
          <select value={roomId} onChange={(e) => { setRoom(e.target.value); const rr = d.roomById.get(e.target.value); if (rr?.rent) setRent(angka(rr.rent)); }}>
            {free.length === 0 && <option value="">Tidak ada kamar kosong</option>}
            {free.map((r) => <option key={r.id} value={r.id}>{r.code}{r.rent ? ' · ' + rp(r.rent) : ''}</option>)}
          </select>
        </Field>
      )}
      {!fixedOcc && (
        <div className="seg">
          <button className={mode === 'lama' ? 'on' : ''} onClick={() => setMode('lama')} disabled={idleOcc.length === 0}>Penghuni terdaftar</button>
          <button className={mode === 'baru' ? 'on' : ''} onClick={() => setMode('baru')}>Penghuni baru</button>
        </div>
      )}
      {mode === 'lama' && !fixedOcc && (
        <Field label="Penghuni"><select value={occId} onChange={(e) => setOcc(e.target.value)}>{idleOcc.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}</select></Field>
      )}
      {mode === 'baru' && (
        <div className="row">
          <Field label="Nama lengkap"><input value={name} onChange={(e) => setName(e.target.value)} /></Field>
          <Field label="No. WhatsApp"><input inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} /></Field>
        </div>
      )}
      <Field label="Harga sewa per bulan" hint="Bisa ditulis 750000, 750.000, atau 750rb"><input inputMode="numeric" value={rent} onChange={(e) => setRent(e.target.value)} /></Field>
      <div className="row">
        <Field label="Tanggal masuk"><input type="date" value={start} onChange={(e) => { const v = e.target.value; if (bill === start || bill < v) setBill(v); if (due < v || due === plusDays(start, 3)) setDue(plusDays(v, 3)); setStart(v); }} /></Field>
        <Field label="Sewa dihitung mulai" hint="Penghuni baru: sama dengan tanggal masuk. Penghuni lama yang sudah bayar: isi awal periode berikutnya yang belum dibayar."><input type="date" value={bill} onChange={(e) => setBill(e.target.value)} /></Field>
      </div>
      {bill === start && <FirstDue start={start} value={due} onChange={setDue} />}
      <Field label="Rencana selesai (opsional)"><input type="date" value={end} onChange={(e) => setEnd(e.target.value)} /></Field>
      <Field label="Deposit / uang jaminan diterima (opsional)" hint="Bukan pendapatan: dicatat terpisah dan dikembalikan/dipotong saat keluar."><input inputMode="numeric" value={dep} onChange={(e) => setDep(e.target.value)} placeholder="mis. 500rb" /></Field>
      {dep.trim() && <div className="seg">{[['kas', 'Masuk ke kas (tunai)'], ['bank', 'Masuk ke bank']].map(([k, l]) => <button key={k} className={depAcc === k ? 'on' : ''} onClick={() => setDepAcc(k)}>{l}</button>)}</div>}
      {err && <div className="notice bad">{err}</div>}
      <button className="cta" onClick={save} disabled={busy}>{busy ? 'Menyimpan…' : 'Mulai sewa'}</button>
    </Sheet>
  );
}

export function EndLeaseSheet({ d, lease, onClose }) {
  const { bump } = useKos();
  const [end, setEnd] = useState(today());
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const out = d.outByOcc.get(lease.occupant_id) || 0;
  const dep = d.depByLease?.get(lease.id) || 0;
  async function save() {
    setBusy(true);
    const { data, error } = await supabase.rpc('end_lease', { p_lease: lease.id, p_end: end, p_reason: reason });
    setBusy(false);
    if (error) return toast(errMsg(error));
    const r = data || {};
    toast(r.planned ? `Disimpan sebagai rencana selesai ${tgl(end)}. Kamar tetap terisi sampai penghuni keluar — bila sudah keluar, akhiri lagi dengan tanggal sebenarnya.`
      : r.before_start ? 'Sewa ditutup (batal sebelum masuk). Kamar kembali tersedia.'
      : 'Sewa diakhiri. Kamar kembali tersedia.' + (r.cancelled > 0 ? ` ${r.cancelled} tagihan sesudah tanggal keluar dibatalkan otomatis.` : '')
        + (Number(r.paid_after) > 0 ? ` Ada pembayaran ${rp(r.paid_after)} untuk periode sesudah tanggal keluar — kembalikan ke penghuni atau biarkan sesuai kesepakatan.` : ''));
    bump(); onClose();
  }
  return (
    <Sheet title={`Akhiri sewa · ${d.occName(lease.occupant_id)}`} onClose={onClose}>
      {out > 0 && !(end && end < lease.start_date) && <div className="notice">Masih ada tagihan belum lunas {rp(out)}. Tagihan itu tetap tercatat setelah sewa diakhiri.</div>}
      {dep > 0 && <div className="notice">Deposit {rp(dep)} masih dipegang. Setelah sewa diakhiri, selesaikan di Penghuni › {d.occName(lease.occupant_id)} › Deposit: <b>Kembalikan</b>, <b>Potong</b> untuk kerusakan, atau lunasi tunggakan lewat Tagihan (metode “Dipotong dari deposit”).</div>}
      <Field label="Tanggal keluar" hint="boleh lebih awal atau lebih lambat dari rencana"><input type="date" value={end} onChange={(e) => setEnd(e.target.value)} /></Field>
      {end > today() ? <div className="notice">Tanggal ini belum tiba, jadi disimpan sebagai <b>Rencana selesai</b>: kamar tetap terisi dan tagihan berhenti di tanggal itu. Bila penghuni ternyata keluar lebih cepat atau lebih lama, akhiri lagi dengan tanggal sebenarnya.</div>
        : end && end < lease.start_date ? <div className="notice">Tanggal ini sebelum tanggal masuk ({tgl(lease.start_date)}) — sewa ditutup sebagai <b>batal sebelum masuk</b> dan semua tagihan yang belum dibayar dibatalkan.</div> : null}
      <Field label="Alasan (opsional)"><input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="mis. lulus kuliah, pindah kerja" /></Field>
      <p className="small muted" style={{ margin: 0 }}>Tagihan sewa untuk periode setelah tanggal keluar yang belum dibayar akan dibatalkan otomatis. Tagihan yang sudah dibayar tetap tercatat.</p>
      <button className="cta" onClick={save} disabled={busy || !end}>{busy ? 'Menyimpan…' : end > today() ? 'Simpan rencana selesai' : 'Akhiri sewa'}</button>
    </Sheet>
  );
}

// Tambah n bulan seperti PostgreSQL (tanggal 31 → akhir bulan bila bulan tujuan lebih pendek)
function addMonths(iso, n) {
  const [y, m, d] = iso.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1 + n, 1));
  const last = new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth() + 1, 0)).getUTCDate();
  t.setUTCDate(Math.min(d, last));
  return t.toISOString().slice(0, 10);
}

// Pindah kamar: sewa lama ditutup, sewa baru di kamar tujuan; siklus tagihan dilanjutkan, deposit & tagihan yang sudah dibayar di muka ikut.
// Server: lease_move_room.
export function MoveRoomSheet({ d, lease, onClose }) {
  const { bump } = useKos();
  const free = d.rooms.filter((r) => r.status === 'tersedia' && r.id !== lease.room_id && !d.bookByRoom?.get(r.id));
  const [roomId, setRoom] = useState(free[0]?.id || '');
  const room = d.roomById.get(roomId);
  const [rent, setRent] = useState(room?.rent ? angka(room.rent) : angka(lease.rent));
  const [date, setDate] = useState(today());
  const [extra, setExtra] = useState('');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const dep = d.depByLease?.get(lease.id) || 0;
  // periode berjalan & periode berikutnya (siklus tagihan sewa lama)
  let k = 0; while (addMonths(lease.billing_start, k + 1) <= date && k < 600) k++;
  const curStart = addMonths(lease.billing_start, k) <= date ? addMonths(lease.billing_start, k) : null;
  const next = curStart === date ? date : curStart ? addMonths(lease.billing_start, k + 1) : lease.billing_start;
  const newRent = parseRp(rent) || 0;
  const days = (a, b) => Math.round((new Date(b + 'T00:00:00Z') - new Date(a + 'T00:00:00Z')) / 864e5);
  const suggest = curStart && next > date && newRent > lease.rent ? Math.round(((newRent - lease.rent) * days(date, next)) / Math.max(1, days(curStart, next)) / 1000) * 1000 : 0;
  async function save() {
    if (!roomId) return toast('Pilih kamar tujuan.');
    if (!(newRent > 0)) return toast('Isi harga sewa kamar tujuan.');
    const ex = extra.trim() ? parseRp(extra) : 0;
    if (extra.trim() && !(ex >= 0)) return toast('Tagihan selisih tidak valid.');
    setBusy(true);
    const { data, error } = await supabase.rpc('lease_move_room', { p_lease: lease.id, p: { room_id: roomId, date, rent: newRent, extra: ex || 0, reason } });
    setBusy(false);
    if (error) return toast(errMsg(error));
    toast(`Pindah ke kamar ${data.to} tercatat. Harga baru mulai tagihan ${tgl(data.next_period)}.` + (Number(data.deposit) > 0 ? ` Deposit ${rp(data.deposit)} ikut pindah.` : '') + (Number(data.extra) > 0 ? ` Tagihan selisih ${rp(data.extra)} dibuat.` : ''));
    bump(); onClose();
  }
  return (
    <Sheet title={`Pindah kamar · ${d.occName(lease.occupant_id)}`} onClose={onClose}>
      <span className="small muted">Sekarang di kamar <b>{d.roomCode(lease.room_id)}</b> · {rp(lease.rent)}/bulan</span>
      {free.length === 0 ? <div className="notice">Tidak ada kamar kosong. Kamar yang dibooking tidak bisa dipilih.</div> : <>
        <Field label="Pindah ke kamar"><select value={roomId} onChange={(e) => { setRoom(e.target.value); const rr = d.roomById.get(e.target.value); if (rr?.rent) setRent(angka(rr.rent)); }}>
          {free.map((r) => <option key={r.id} value={r.id}>{r.code}{r.rent ? ' · ' + rp(r.rent) : ''}</option>)}</select></Field>
        <div className="row">
          <Field label="Tanggal pindah" hint="saat benar-benar pindah"><input type="date" value={date} min={lease.start_date} max={today()} onChange={(e) => setDate(e.target.value || today())} /></Field>
          <Field label="Sewa kamar baru/bulan"><input inputMode="numeric" value={rent} onChange={(e) => setRent(e.target.value)} /></Field>
        </div>
        <div className="unitbox small" style={{ gap: 4 }}>
          <span>• Tanggal tagihan tetap sama. {curStart && next > date ? <>Periode berjalan (sampai {tgl(plusDays(next, -1))}) tetap memakai tagihan kamar lama; harga baru mulai tagihan <b>{tgl(next)}</b>.</> : <>Harga baru langsung berlaku mulai <b>{tgl(next)}</b>.</>}</span>
          <span>• Tagihan bulan depan yang belum dibayar diterbitkan ulang dengan harga baru; yang sudah dibayar di muka ikut pindah.</span>
          {dep > 0 && <span>• Deposit {rp(dep)} ikut pindah ke kamar baru.</span>}
          <span>• Kamar {d.roomCode(lease.room_id)} kembali <b>Tersedia</b>.</span>
        </div>
        {curStart && next > date && <Field label="Tagihan selisih bulan ini (opsional)" hint={newRent > lease.rent ? 'kosongkan bila tidak ada selisih' : 'biasanya kosong bila pindah ke kamar lebih murah'}>
          <input inputMode="numeric" value={extra} onChange={(e) => setExtra(e.target.value)} placeholder="Rp" /></Field>}
        {suggest > 0 && !extra.trim() && <button type="button" className="sm ghost" style={{ alignSelf: 'flex-start' }} onClick={() => setExtra(angka(suggest))}>Hitung sisa hari: isi {rp(suggest)}</button>}
        <Field label="Alasan (opsional)"><input value={reason} maxLength={200} onChange={(e) => setReason(e.target.value)} placeholder="mis. minta kamar lebih besar, AC rusak" /></Field>
        <button className="cta" disabled={busy || !roomId} onClick={save}>{busy ? 'Menyimpan…' : `Pindahkan ke ${room?.code || 'kamar baru'}`}</button>
      </>}
    </Sheet>
  );
}
