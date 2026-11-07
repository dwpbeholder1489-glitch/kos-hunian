'use client';
import { useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useKos } from '@/components/KosProvider';
import { Field, run } from '@/components/ui';
import { rp, tgl, today, parseRp, errMsg } from '@/lib/format';
import { uid } from '@/lib/retail';
import { canArea } from '@/lib/business';

const KIND = { terima: 'Diterima', kembali: 'Dikembalikan', potong: 'Dipotong' };
const ACC = { kas: 'Kas (tunai)', bank: 'Bank / transfer' };

// Deposit (uang jaminan) satu sewa: saldo, riwayat, terima / kembalikan / potong. Dipakai di Penghuni.
export default function DepositBox({ d, lease }) {
  const { kos, bump } = useKos();
  const money = canArea(kos, 'finance'); // mengembalikan, memotong, membatalkan: pemilik/pengelola
  const [mode, setMode] = useState(null); // 'terima' | 'kembali' | 'potong'
  const rows = (d.deposits || []).filter((x) => x.lease_id === lease.id);
  const bal = d.depByLease?.get(lease.id) || 0;
  const voidRow = async (x) => {
    const why = prompt(`Batalkan catatan "${KIND[x.kind]} ${rp(x.amount)}"? Tulis alasannya:`);
    if (!why) return;
    if (await run(() => supabase.rpc('deposit_void', { p_id: x.id, p_reason: why }), 'Catatan deposit dibatalkan', errMsg)) bump();
  };
  return (
    <section className="panel">
      <div className="row between"><span className="label">Deposit / uang jaminan</span><b>{rp(bal)}</b></div>
      {rows.length === 0 && <p className="small muted" style={{ margin: 0 }}>Belum ada deposit untuk sewa ini.</p>}
      {rows.length > 0 && <div className="list">{rows.map((x) => (
        <div className="li" key={x.id} style={{ opacity: x.status === 'aktif' ? 1 : 0.55 }}>
          <div className="main"><b className="small">{KIND[x.kind]}{x.status === 'batal' ? ' (batal)' : ''}</b>
            <span className="small muted">{tgl(x.date)}{x.account ? ` · ${ACC[x.account]}` : x.invoice_id ? ' · untuk tagihan' : ''}{x.reason ? ` · ${x.reason}` : ''}{x.void_reason ? ` · batal: ${x.void_reason}` : ''}</span></div>
          <div className="row" style={{ flexWrap: 'nowrap' }}>
            <span className="num">{x.kind === 'terima' ? '+' : '−'}{rp(x.amount)}</span>
            {money && x.status === 'aktif' && <button className="sm ghost" aria-label="Batalkan catatan" onClick={() => voidRow(x)}>✕</button>}
          </div>
        </div>
      ))}</div>}
      <div className="row">
        {lease.status === 'aktif' && <button className="sm" onClick={() => setMode(mode === 'terima' ? null : 'terima')}>+ Terima deposit</button>}
        {money && bal > 0 && <button className="sm" onClick={() => setMode(mode === 'kembali' ? null : 'kembali')}>Kembalikan</button>}
        {money && bal > 0 && <button className="sm ghost" onClick={() => setMode(mode === 'potong' ? null : 'potong')}>Potong (kerusakan dll.)</button>}
      </div>
      {bal > 0 && <span className="small muted">Untuk melunasi tagihan dari deposit: Tagihan › Catat pembayaran › Metode “Dipotong dari deposit”.</span>}
      {mode && <DepForm lease={lease} kind={mode} max={mode === 'terima' ? null : bal} onDone={() => { setMode(null); bump(); }} />}
    </section>
  );
}

function DepForm({ lease, kind, max, onDone }) {
  const [amt, setAmt] = useState(max ? String(max) : '');
  const [date, setDate] = useState(today());
  const [acc, setAcc] = useState(kind === 'kembali' ? 'kas' : 'kas');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [id] = useState(uid);
  const save = async () => {
    const a = parseRp(amt);
    if (!(a > 0)) return run(() => { throw new Error('Isi jumlah.'); });
    if (max != null && a > max) return run(() => { throw new Error(`Maksimal ${rp(max)} (saldo deposit).`); });
    if (kind === 'potong' && !reason.trim()) return run(() => { throw new Error('Tulis alasan potongan.'); });
    setBusy(true);
    const ok = await run(() => supabase.rpc('deposit_add', { p_id: id, p_lease: lease.id, p_kind: kind, p_amount: a, p_date: date, p_account: kind === 'potong' ? null : acc, p_reason: reason.trim() || null, p_invoice: null }),
      kind === 'terima' ? 'Deposit diterima' : kind === 'kembali' ? 'Deposit dikembalikan' : 'Potongan deposit dicatat', errMsg);
    setBusy(false);
    if (ok) onDone();
  };
  return (
    <div className="unitbox">
      <div className="row">
        <Field label={kind === 'terima' ? 'Jumlah diterima' : kind === 'kembali' ? 'Jumlah dikembalikan' : 'Jumlah dipotong'}><input inputMode="numeric" value={amt} onChange={(e) => setAmt(e.target.value)} /></Field>
        <Field label="Tanggal"><input type="date" value={date} max={today()} onChange={(e) => setDate(e.target.value)} /></Field>
      </div>
      {kind !== 'potong' && <div className="seg">{Object.entries(ACC).map(([k, l]) => <button key={k} className={acc === k ? 'on' : ''} onClick={() => setAcc(k)}>{kind === 'terima' ? 'Masuk ke ' : 'Dari '}{l}</button>)}</div>}
      <Field label={kind === 'potong' ? 'Alasan potongan (wajib)' : 'Catatan (opsional)'}><input value={reason} onChange={(e) => setReason(e.target.value)} maxLength={200} placeholder={kind === 'potong' ? 'mis. kunci hilang, cat dinding rusak' : ''} /></Field>
      {kind === 'potong' && <span className="small muted">Potongan dicatat sebagai pendapatan lain (ganti rugi). Untuk tunggakan sewa, pakai metode “Dipotong dari deposit” di Tagihan.</span>}
      <button className="primary" onClick={save} disabled={busy}>{busy ? 'Menyimpan…' : 'Simpan'}</button>
    </div>
  );
}
