'use client';
import { useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useKos } from '@/components/KosProvider';
import { Sheet, Field, run } from '@/components/ui';
import { today, parseRp, rp, angka, errMsg } from '@/lib/format';
import { uid } from '@/lib/retail';

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
        <Field label="Tanggal masuk"><input type="date" value={start} onChange={(e) => { setStart(e.target.value); if (bill < e.target.value) setBill(e.target.value); }} /></Field>
        <Field label="Tagihan pertama jatuh tempo" hint="Penghuni lama: isi jatuh tempo berikutnya yang belum dibayar."><input type="date" value={bill} onChange={(e) => setBill(e.target.value)} /></Field>
      </div>
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
    const ok = await run(() => supabase.rpc('end_lease', { p_lease: lease.id, p_end: end, p_reason: reason }), 'Sewa diakhiri. Kamar kembali tersedia.', errMsg);
    setBusy(false);
    if (ok) { bump(); onClose(); }
  }
  return (
    <Sheet title={`Akhiri sewa · ${d.occName(lease.occupant_id)}`} onClose={onClose}>
      {out > 0 && <div className="notice">Masih ada tagihan belum lunas {rp(out)}. Tagihan itu tetap tercatat setelah sewa diakhiri.</div>}
      {dep > 0 && <div className="notice">Deposit {rp(dep)} masih dipegang. Setelah sewa diakhiri, selesaikan di Penghuni › {d.occName(lease.occupant_id)} › Deposit: <b>Kembalikan</b>, <b>Potong</b> untuk kerusakan, atau lunasi tunggakan lewat Tagihan (metode “Dipotong dari deposit”).</div>}
      <Field label="Tanggal keluar"><input type="date" value={end} onChange={(e) => setEnd(e.target.value)} /></Field>
      <Field label="Alasan (opsional)"><input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="mis. lulus kuliah, pindah kerja" /></Field>
      <p className="small muted" style={{ margin: 0 }}>Tagihan sewa untuk periode setelah tanggal keluar yang belum dibayar akan dibatalkan otomatis.</p>
      <button className="cta" onClick={save} disabled={busy}>{busy ? 'Menyimpan…' : 'Akhiri sewa'}</button>
    </Sheet>
  );
}
