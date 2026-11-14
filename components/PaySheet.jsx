'use client';
// Catat pembayaran satu tagihan (tunai/transfer/e-wallet, atau potong deposit) — dipakai Tagihan, Penghuni, Kamar.
import { useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useKos } from '@/components/KosProvider';
import { Sheet, Field, run } from '@/components/ui';
import { rp, today, parseRp, angka, invTitle, METHOD, errMsg } from '@/lib/format';
import { uid } from '@/lib/retail';

export default function PaySheet({ d, inv, onClose }) {
  const { bump } = useKos();
  const [amt, setAmt] = useState(inv ? angka(inv.outstanding) : '');
  const [date, setDate] = useState(today());
  const [method, setMethod] = useState('tunai');
  const [ref, setRef] = useState('');
  const [notes, setNotes] = useState('');
  const [verified, setVerified] = useState(true);
  const [busy, setBusy] = useState(false);
  const [opId] = useState(uid); // satu kali kirim walau tombol ditekan dua kali
  if (!inv) return null;
  const dep = d.depByLease?.get(inv.lease_id) || 0; // saldo deposit penghuni (bisa dipotong untuk tagihan ini)
  const methods = Object.entries(METHOD).filter(([k]) => k !== 'deposit' || dep > 0);
  async function save() {
    const a = parseRp(amt);
    if (!(a > 0)) return run(() => { throw new Error('Isi jumlah pembayaran.'); });
    if (method === 'deposit') {
      if (a > Math.min(dep, inv.outstanding)) return run(() => { throw new Error(`Maksimal ${rp(Math.min(dep, inv.outstanding))} (saldo deposit ${rp(dep)}, sisa tagihan ${rp(inv.outstanding)}).`); });
      if (!confirm(`Potong ${rp(a)} dari deposit ${d.occName(inv.occupant_id)}? Sisa deposit menjadi ${rp(dep - a)}.`)) return;
      setBusy(true);
      const ok2 = await run(() => supabase.rpc('deposit_add', { p_id: opId, p_lease: inv.lease_id, p_kind: 'potong', p_amount: a, p_date: date, p_account: null, p_reason: notes.trim() || null, p_invoice: inv.id }), 'Dibayar dari deposit', errMsg);
      setBusy(false);
      if (ok2) { bump(); onClose(); }
      return;
    }
    if (a > inv.outstanding + 0.5 && !confirm(`Jumlah melebihi sisa tagihan (${rp(inv.outstanding)}). Tetap simpan?`)) return;
    setBusy(true);
    const ok = await run(() => supabase.from('payments').insert({
      invoice_id: inv.id, kos_id: inv.kos_id, amount: a, paid_at: date, method, ref: ref.trim() || null, notes: notes.trim() || null,
      status: verified ? 'terverifikasi' : 'menunggu', verified_at: verified ? new Date().toISOString() : null,
    }), 'Pembayaran dicatat', errMsg);
    setBusy(false);
    if (ok) { bump(); onClose(); }
  }
  return (
    <Sheet title={`Bayar · ${d.occName(inv.occupant_id)}`} onClose={onClose}>
      <p className="small muted" style={{ margin: 0 }}>{invTitle(inv)} · sisa {rp(inv.outstanding)}</p>
      <span className="small">Jumlah sudah terisi <b>sisa tagihan</b> — tekan <b>Simpan pembayaran</b> untuk melunasi. Bayar sebagian? Ubah jumlahnya.</span>
      <div className="row">
        <Field label="Jumlah"><input inputMode="numeric" value={amt} onChange={(e) => setAmt(e.target.value)} /></Field>
        <Field label="Tanggal bayar"><input type="date" value={date} max={today()} onChange={(e) => setDate(e.target.value)} /></Field>
      </div>
      <div className="row">
        <Field label="Metode"><select value={method} onChange={(e) => setMethod(e.target.value)}>{methods.map(([k, l]) => <option key={k} value={k}>{k === 'deposit' ? `${l} (saldo ${rp(dep)})` : l}</option>)}</select></Field>
        <Field label="No. referensi (opsional)"><input value={ref} onChange={(e) => setRef(e.target.value)} /></Field>
      </div>
      <Field label="Catatan (opsional)"><input value={notes} onChange={(e) => setNotes(e.target.value)} /></Field>
      {method === 'deposit' ? <p className="small muted" style={{ margin: 0 }}>Tidak ada uang masuk baru: tagihan dilunasi dari deposit yang sudah dipegang. Batalkan lewat Penghuni › Deposit bila salah.</p>
        : <label className="row small" style={{ fontWeight: 700 }}><input type="checkbox" style={{ width: 22, minHeight: 22 }} checked={verified} onChange={(e) => setVerified(e.target.checked)} /> Uang sudah saya terima (langsung terverifikasi)</label>}
      <button className="cta" onClick={save} disabled={busy}>{busy ? 'Menyimpan…' : parseRp(amt) >= inv.outstanding ? `Simpan · tagihan lunas` : 'Simpan pembayaran'}</button>
    </Sheet>
  );
}

