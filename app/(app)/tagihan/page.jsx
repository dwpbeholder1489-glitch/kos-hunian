'use client';
import PageHelp from '@/components/PageHelp';
import { useBaru } from '@/lib/useBaru';
import { useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useKos } from '@/components/KosProvider';
import { useData } from '@/lib/useData';
import Link from 'next/link';
import { Sheet, Field, Loading, Empty, InvChip, PayChip, run, toast } from '@/components/ui';
import { hasFeature } from '@/lib/plan';
import { rp, tgl, today, parseRp, angka, invTitle, METHOD, errMsg } from '@/lib/format';
import { uid } from '@/lib/retail';

const FILTERS = [['terbuka', 'Belum lunas'], ['menunggak', 'Menunggak'], ['lunas', 'Lunas'], ['semua', 'Semua']];

export default function Tagihan() {
  const d = useData();
  const [f, setF] = useState('terbuka');
  const [sheet, setSheet] = useState(null);
  useBaru(() => setSheet({ t: 'extra' }));
  if (!d.ready) return d.err ? <div className="notice bad">{d.err}</div> : <Loading />;

  const list = d.invoices.filter((i) =>
    f === 'terbuka' ? i.status !== 'batal' && i.outstanding > 0 :
    f === 'menunggak' ? i.overdue :
    f === 'lunas' ? i.pay_state === 'lunas' : true)
    .sort((a, b) => f === 'lunas' || f === 'semua' ? b.due_date.localeCompare(a.due_date) : a.due_date.localeCompare(b.due_date));
  const total = list.reduce((s, i) => s + (f === 'lunas' || f === 'semua' ? i.amount : i.outstanding), 0);
  const close = () => setSheet(null);

  return (
    <div className="stack">
      <div className="row between"><div className="row"><h2>Tagihan</h2><PageHelp page="tagihan" /></div><button className="primary" onClick={() => setSheet({ t: 'extra' })}>+ Tagihan tambahan</button></div>
      <p className="small muted" style={{ margin: 0 }}>Tagihan sewa bulanan dibuat otomatis 7 hari sebelum jatuh tempo.</p>
      <div className="seg">{FILTERS.map(([k, l]) => <button key={k} className={f === k ? 'on' : ''} onClick={() => setF(k)}>{l}</button>)}</div>
      {list.length === 0 ? <Empty title="Tidak ada tagihan" text={f === 'menunggak' ? 'Tidak ada yang menunggak.' : 'Belum ada tagihan di kategori ini.'} /> : (
        <section className="panel">
          <div className="row between"><span className="label">{list.length} tagihan</span><b>{rp(total)}</b></div>
          <div className="list">{list.map((i) => (
            <div className="li click" key={i.id} onClick={() => setSheet({ t: 'detail', id: i.id })}>
              <div className="main"><b>{d.occName(i.occupant_id)} · {d.roomCode(i.room_id)}</b><span className="small muted">{invTitle(i)} · jatuh tempo {tgl(i.due_date)}</span></div>
              <div style={{ textAlign: 'right' }}><div className="num">{rp(i.outstanding > 0 ? i.outstanding : i.amount)}</div><InvChip inv={i} /></div>
            </div>
          ))}</div>
        </section>
      )}
      {sheet?.t === 'detail' && <InvDetail d={d} inv={d.invById.get(sheet.id)} go={setSheet} onClose={close} />}
      {sheet?.t === 'pay' && <PaySheet d={d} inv={d.invById.get(sheet.id)} onClose={close} />}
      {sheet?.t === 'extra' && <ExtraSheet d={d} onClose={close} />}
    </div>
  );
}

function InvDetail({ d, inv, go, onClose }) {
  const { bump, kos } = useKos();
  const canReceipt = hasFeature(kos, 'kwitansi');
  if (!inv) return null;
  const pays = d.payments.filter((p) => p.invoice_id === inv.id);
  async function cancel() {
    const why = prompt('Alasan membatalkan tagihan ini?');
    if (why === null) return;
    if (pays.some((p) => p.status === 'terverifikasi' || p.status === 'menunggu')) return run(() => { throw new Error('Tagihan yang sudah ada pembayarannya tidak bisa dibatalkan. Batalkan pembayarannya dulu.'); });
    if (await run(() => supabase.from('invoices').update({ status: 'batal', cancel_reason: why || null }).eq('id', inv.id), 'Tagihan dibatalkan', errMsg)) { bump(); onClose(); }
  }
  return (
    <Sheet title={invTitle(inv)} onClose={onClose}>
      <dl className="kv">
        <dt>Penghuni</dt><dd>{d.occName(inv.occupant_id)} · {d.roomCode(inv.room_id)}</dd>
        <dt>Jatuh tempo</dt><dd>{tgl(inv.due_date)}</dd>
        <dt>Jumlah</dt><dd>{rp(inv.amount)}</dd>
        <dt>Sudah dibayar</dt><dd>{rp(inv.paid)}</dd>
        {inv.pending > 0 && <><dt>Menunggu verifikasi</dt><dd>{rp(inv.pending)}</dd></>}
        <dt>Sisa</dt><dd style={{ color: inv.outstanding ? 'var(--bad)' : undefined }}>{rp(inv.outstanding)}</dd>
        <dt>Status</dt><dd><InvChip inv={inv} /></dd>
        {inv.cancel_reason && <><dt>Alasan batal</dt><dd>{inv.cancel_reason}</dd></>}
      </dl>
      {inv.status !== 'batal' && inv.outstanding > 0 && <button className="cta" onClick={() => go({ t: 'pay', id: inv.id })}>Catat pembayaran</button>}
      {pays.length > 0 && (
        <section className="panel"><span className="label">Riwayat pembayaran</span>
          <div className="list">{pays.map((p) => (
            <div className="li" key={p.id}><div className="main"><b>{rp(p.amount)}</b><span className="small muted">{tgl(p.paid_at)} · {METHOD[p.method]}</span>
              {p.status === 'terverifikasi' && <Link href={'/kwitansi/' + p.id} className="small" onClick={(e) => { if (!canReceipt) { e.preventDefault(); toast('Kwitansi PDF tersedia di paket Standar'); } }}>🧾 Kwitansi{!canReceipt && ' 🔒'}</Link>}</div><PayChip status={p.status} /></div>
          ))}</div>
        </section>
      )}
      {inv.status !== 'batal' && inv.pay_state !== 'lunas' && <button className="danger" onClick={cancel}>Batalkan tagihan</button>}
    </Sheet>
  );
}

function PaySheet({ d, inv, onClose }) {
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
      <button className="cta" onClick={save} disabled={busy}>{busy ? 'Menyimpan…' : 'Simpan pembayaran'}</button>
    </Sheet>
  );
}

function ExtraSheet({ d, onClose }) {
  const { kosId, bump } = useKos();
  const active = d.leases.filter((l) => l.status === 'aktif');
  const [leaseId, setLease] = useState(active[0]?.id || '');
  const [desc, setDesc] = useState('');
  const [amt, setAmt] = useState('');
  const [due, setDue] = useState(today());
  const [busy, setBusy] = useState(false);
  async function save() {
    const l = active.find((x) => x.id === leaseId);
    const a = parseRp(amt);
    if (!l) return run(() => { throw new Error('Pilih penghuni.'); });
    if (!desc.trim()) return run(() => { throw new Error('Isi keterangan tagihan.'); });
    if (!(a > 0)) return run(() => { throw new Error('Isi jumlah tagihan.'); });
    setBusy(true);
    const ok = await run(() => supabase.from('invoices').insert({ kos_id: kosId, lease_id: l.id, room_id: l.room_id, occupant_id: l.occupant_id, kind: 'tambahan', period_start: due, period_end: due, due_date: due, amount: a, description: desc.trim() }), 'Tagihan tambahan dibuat', errMsg);
    setBusy(false);
    if (ok) { bump(); onClose(); }
  }
  if (active.length === 0) return <Sheet title="Tagihan tambahan" onClose={onClose}><p className="muted">Belum ada penghuni aktif.</p></Sheet>;
  return (
    <Sheet title="Tagihan tambahan" onClose={onClose}>
      <p className="small muted" style={{ margin: 0 }}>Untuk biaya di luar sewa: listrik token, laundry, denda, deposit, dll.</p>
      <Field label="Penghuni"><select value={leaseId} onChange={(e) => setLease(e.target.value)}>{active.map((l) => <option key={l.id} value={l.id}>{d.occName(l.occupant_id)} · {d.roomCode(l.room_id)}</option>)}</select></Field>
      <Field label="Keterangan"><input value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="mis. Listrik Oktober" /></Field>
      <div className="row">
        <Field label="Jumlah"><input inputMode="numeric" value={amt} onChange={(e) => setAmt(e.target.value)} /></Field>
        <Field label="Jatuh tempo"><input type="date" value={due} onChange={(e) => setDue(e.target.value)} /></Field>
      </div>
      <button className="cta" onClick={save} disabled={busy}>{busy ? 'Menyimpan…' : 'Buat tagihan'}</button>
    </Sheet>
  );
}
