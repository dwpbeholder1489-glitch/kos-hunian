'use client';
import { useState } from 'react';
import { Field, Sheet, run, toast } from '@/components/ui';
import { supabase } from '@/lib/supabase';
import { useKos } from '@/components/KosProvider';
import { useKuotaEkspor } from '@/lib/ekspor';
import { errMsg, invTitle, METHOD, rp, tgl, today } from '@/lib/format';
import { uid } from '@/lib/retail';
import styles from './tagihan.module.css';

export function BatchPayment({ invoices, d, onClose, onSingle }) {
  const { kosId, bump } = useKos();
  const [tenant, setTenant] = useState(invoices[0]?.occupant_id || '');
  const [selected, setSelected] = useState([]);
  const [date, setDate] = useState(today());
  const [method, setMethod] = useState('tunai');
  const [ref, setRef] = useState('');
  const [busy, setBusy] = useState(false);
  const [attempt, setAttempt] = useState(null);
  const open = invoices.filter((i) => i.occupant_id === tenant);
  const bills = open.filter((i) => selected.includes(i.id));
  const total = bills.reduce((s, i) => s + i.outstanding, 0);
  const resetAttempt = () => setAttempt(null);

  async function save() {
    if (busy || bills.length < 2 || !date || date > today()) return;
    setBusy(true);
    const entries = attempt || bills.map((i) => ({ id: uid(), invoice_id: i.id, amount: i.outstanding }));
    setAttempt(entries);
    const ok = await run(async () => {
      const result = await supabase.rpc('invoice_pay_batch', {
        p_kos: kosId, p_occupant: tenant, p_entries: entries, p_date: date, p_method: method, p_ref: ref,
      });
      if (result.error?.code === 'PGRST202') throw new Error('Pelunasan sekaligus menunggu pembaruan basis data Tagihan.');
      if (result.error?.message?.includes('tagihan yang berubah')) {
        setSelected([]);
        setAttempt(null);
        bump();
      }
      return result;
    }, 'Pelunasan beberapa tagihan dicatat', errMsg);
    setBusy(false);
    if (ok) { bump(); onClose(); }
  }

  return <Sheet title="Catat pembayaran" subtitle="Pilih tagihan untuk satu penghuni" icon="wallet" wide onClose={onClose}>
    {!invoices.length ? <p>Tidak ada tagihan yang bisa dibayar.</p> : <>
      <Field label="Penghuni"><select value={tenant} disabled={busy} onChange={(e) => { setTenant(e.target.value); setSelected([]); resetAttempt(); }}>
        {[...new Set(invoices.map((i) => i.occupant_id))].map((id) => <option key={id} value={id}>{d.occName(id)}</option>)}
      </select></Field>
      <div className={styles.selection}>{open.map((i) => <label key={i.id}>
        <input type="checkbox" checked={selected.includes(i.id)} disabled={busy || i.pending > 0}
          onChange={(e) => { setSelected(e.target.checked ? [...selected, i.id] : selected.filter((id) => id !== i.id)); resetAttempt(); }} />
        <span>{invTitle(i)} · {d.roomCode(i.room_id)}<small>{i.pending > 0 ? 'Menunggu verifikasi' : 'Jatuh tempo ' + tgl(i.due_date)}</small></span><b>{rp(i.outstanding)}</b>
      </label>)}</div>
      {bills.length === 1 && <button className="primary" onClick={() => onSingle(bills[0].id)}>Bayar satu tagihan</button>}
      {bills.length > 1 && <>
        <p>Catat {rp(total)} setelah dana diterima. Setiap tagihan mendapat catatan pembayaran tersendiri.</p>
        <div className={styles.form}>
          <Field label="Tanggal bayar"><input type="date" max={today()} value={date} disabled={busy} onChange={(e) => { setDate(e.target.value); resetAttempt(); }} /></Field>
          <Field label="Metode"><select value={method} disabled={busy} onChange={(e) => { setMethod(e.target.value); resetAttempt(); }}>{Object.entries(METHOD).filter(([key]) => key !== 'deposit').map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></Field>
        </div>
        <Field label="Referensi pembayaran (opsional)"><input value={ref} maxLength={150} disabled={busy} onChange={(e) => { setRef(e.target.value); resetAttempt(); }} /></Field>
        <button className="cta" disabled={busy || !date || date > today() || bills.length > 100} onClick={save}>{busy ? 'Menyimpan…' : `Lunasi ${bills.length} tagihan · ${rp(total)}`}</button>
        {bills.length > 100 && <p>Pilih maksimal 100 tagihan per pelunasan.</p>}
      </>}
    </>}
  </Sheet>;
}

export function InvoicePdf({ kos, inv, d }) {
  const quota = useKuotaEkspor(kos.id);
  const [busy, setBusy] = useState(false);
  async function download() {
    setBusy(true);
    try {
      const { makePdf } = await import('@/lib/pdfExport');
      const file = await makePdf({
        title: 'Invoice Tagihan', business: kos.name, type: 'properti', subtitle: invTitle(inv),
        exported_at: new Date().toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' }),
        note: 'Dokumen tagihan PRASARA. Bukti penerimaan pembayaran tersedia sebagai kuitansi terpisah.',
        sheets: [{ name: 'Rincian tagihan', cols: ['Keterangan', 'Isi'], types: ['s', 's'], rows: [
          ['Referensi', inv.id], ['Penghuni', d.occName(inv.occupant_id)], ['Kamar', d.roomCode(inv.room_id)],
          ['Periode', inv.kind === 'sewa' ? tgl(inv.period_start) + ' – ' + tgl(inv.period_end) : 'Tagihan tambahan'], ['Jatuh tempo', tgl(inv.due_date)],
          ['Nominal awal', rp(inv.amount)], ['Pembayaran diterima', rp(inv.paid)], ['Sisa pembayaran', rp(inv.outstanding)],
          ['Status', inv.status === 'batal' ? 'Batal' : inv.pay_state === 'lunas' ? 'Lunas' : inv.overdue ? 'Menunggak' : 'Belum lunas'],
        ] }],
      });
      quota.jalankan('invoice_pdf', () => {
        const href = URL.createObjectURL(file);
        const link = document.createElement('a');
        link.href = href; link.download = `Tagihan-${inv.id}.pdf`;
        document.body.append(link); link.click(); link.remove();
        setTimeout(() => URL.revokeObjectURL(href), 30000);
      });
    } catch (error) { toast(errMsg(error)); }
    finally { setBusy(false); }
  }
  return <div className={styles.actionsInline}><button disabled={busy || quota.habis} onClick={download}>{busy ? 'Membuat PDF…' : 'Unduh invoice PDF'}</button>
    {quota.habis ? <small>{quota.q?.message || 'Ekspor PDF tidak tersedia untuk paket ini.'}</small> : quota.info && <small>{quota.info}</small>}</div>;
}
