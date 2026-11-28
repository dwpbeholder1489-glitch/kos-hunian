'use client';

import { useEffect, useRef, useState } from 'react';
import { Empty, Field, Loading, Sheet, toast } from '@/components/ui';
import { SheetStats } from '@/components/SmartDetailSheet';
import { supabase } from '@/lib/supabase';
import { angka, errMsg, tgl } from '@/lib/format';
import { readPrice } from '@/lib/stockSuggestion.mjs';
import { FakturSheet } from '@/components/Pengadaan';

const money = new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0, maximumFractionDigits: 2 });
const rp = (value) => money.format(Number(value));
const signed = (value, format) => `${value > 0 ? '+' : value < 0 ? '−' : ''}${format(Math.abs(value))}`;
const PAGE = 50;

function movement(row) {
  if (row.previous_price == null) return 'Faktur pertama';
  if (row.previous_price === 0 && row.net_price > 0) return `${signed(row.difference, rp)} · naik dari nol`;
  return `${signed(row.difference, rp)}${row.percent == null ? '' : ` · ${signed(row.percent, (x) => `${angka(x)}%`)}`}`;
}

export default function PurchasePriceHistory({ kosId, version }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [threshold, setThreshold] = useState('');
  const [detail, setDetail] = useState(null);
  const [invoice, setInvoice] = useState(null);
  const [busy, setBusy] = useState(false);
  const [offset, setOffset] = useState(0);
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    setData(null); setError('');
    supabase.rpc('purchase_price_monitor', { p_kos: kosId, p_offset: offset }).abortSignal(controller.signal)
      .then(({ data: value, error: failure }) => {
        if (controller.signal.aborted) return;
        if (failure) setError(errMsg(failure));
        else { setData(value); setThreshold(value.threshold == null ? '' : String(value.threshold)); }
      }, (failure) => { if (!controller.signal.aborted) setError(errMsg(failure)); });
    return () => controller.abort();
  }, [kosId, offset, revision, version]);

  async function saveThreshold(event) {
    event.preventDefault();
    const value = threshold.trim() ? readPrice(threshold) : null;
    if ((threshold.trim() && value == null) || value > 10000) return toast('Batas kenaikan harus 0–10.000%.');
    setBusy(true);
    try {
      const { error: failure } = await supabase.rpc('purchase_price_threshold_set', { p_kos: kosId, p_percent: value });
      if (failure) throw failure;
      toast('Batas kenaikan disimpan');
      setRevision((old) => old + 1);
    } catch (failure) { toast(errMsg(failure)); }
    finally { setBusy(false); }
  }

  if (error) return <div className="notice bad" role="alert">{error} <button onClick={() => setRevision((old) => old + 1)}>Coba lagi</button></div>;
  if (!data) return <Loading />;
  return <section className="panel stack">
    <h2>Pantau Perubahan Harga Beli</h2>
    <p className="small muted">Harga bersih setelah diskon, sebelum PPN masukan. Faktur yang sudah diposting dibandingkan per pemasok dan per satuan stok.</p>
    {data.owner ? <form className="row" onSubmit={saveThreshold}>
      <Field label="Batas kenaikan (%)" hint="Kosongkan untuk menonaktifkan tanda."><input style={{ fontSize: 16 }} inputMode="decimal" value={threshold} onChange={(event) => setThreshold(event.target.value)} /></Field>
      <button className="primary" disabled={busy}>Simpan batas</button>
    </form> : <span className="small muted">{data.threshold == null ? 'Batas kenaikan belum diatur.' : `Batas kenaikan ${angka(data.threshold)}%.`}</span>}
    {!data.items.length ? <Empty title="Belum ada harga beli tercatat" text="Posting faktur pemasok untuk mulai memantau harga bersih." /> :
      <div className="list">{data.items.map((row) => <button type="button" className="li" key={row.invoice_id + row.product_id}
        style={{ textAlign: 'left', flexWrap: 'wrap' }} aria-haspopup="dialog" onClick={() => setDetail(row)}>
        <span className="main"><b>{row.name}</b><small className="muted">{row.supplier} · {tgl(row.invoice_date)}</small></span>
        <span><b>{rp(row.net_price)} / {row.base_unit}</b><small style={{ display: 'block' }} className={row.alert ? 'chip bad' : 'muted'}>{movement(row)}</small></span>
      </button>)}</div>}
    {(offset > 0 || data.more) && <div className="row between">
      <button disabled={offset === 0} onClick={() => setOffset(offset - PAGE)}>Sebelumnya</button>
      <button disabled={!data.more} onClick={() => setOffset(offset + PAGE)}>Berikutnya</button>
    </div>}
    {detail && <PriceDetail key={detail.invoice_id + detail.product_id} row={detail} kosId={kosId} owner={data.owner}
      onClose={() => setDetail(null)} openInvoice={(id, purchase) => setInvoice({ id, purchase })} />}
    {invoice && <FakturSheet key={invoice.id} purchaseId={invoice.purchase} invoiceId={invoice.id} onClose={() => setInvoice(null)} />}
  </section>;
}

function PriceDetail({ row, kosId, owner, openInvoice, onClose }) {
  const [sim, setSim] = useState(null);
  const [loading, setLoading] = useState(false);
  const [unitId, setUnitId] = useState('');
  const [tier, setTier] = useState('retail');
  const [proposed, setProposed] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const [writing, setWriting] = useState(false);
  const inFlight = useRef(false);

  const unit = sim?.units.find((value) => value.id === unitId);
  const price = readPrice(proposed);
  const cost = unit ? Number(sim.net_price) * Number(unit.qty) : 0;
  const current = unit ? Number(unit[tier]) : 0;
  const fallback = unit && tier === 'wholesale' && current === 0 ? Number(unit.retail) : 0;
  const effective = current || fallback;
  const margin = (amount) => {
    const revenue = amount / (1 + Number(sim.tax_rate) / 100);
    return revenue > 0 ? `${angka((revenue - cost) / revenue * 100)}%` : '—';
  };
  const canApply = owner && sim?.latest && sim?.active;

  function change(unit, nextTier) {
    setUnitId(unit.id); setTier(nextTier);
    const initial = Number(unit[nextTier]) || (nextTier === 'wholesale' ? Number(unit.retail) : 0);
    setProposed(initial > 0 ? String(initial) : '');
    setConfirmed(false);
  }

  async function simulate() {
    setLoading(true);
    try {
      const { data, error } = await supabase.rpc('purchase_price_simulation', { p_kos: kosId, p_product: row.product_id, p_invoice: row.invoice_id });
      if (error) throw error;
      setSim(data);
      if (data.units.length) change(data.units[0], 'retail');
    } catch (error) { toast(errMsg(error)); }
    finally { setLoading(false); }
  }

  async function approve(event) {
    event.preventDefault();
    if (!canApply || !confirmed || !price || inFlight.current) return;
    inFlight.current = true;
    setWriting(true);
    try {
      const { data, error } = await supabase.rpc('purchase_price_apply', {
        p_kos: kosId, p_product: row.product_id, p_invoice: row.invoice_id, p_unit: unit.id,
        p_tier: tier, p_expected: current, p_factor: unit.qty, p_price: price,
      });
      if (error) throw error;
      setSim((old) => ({ ...old, units: old.units.map((value) => value.id === unit.id ? { ...value, [tier]: data } : value) }));
      setConfirmed(false);
      toast('Harga jual dasar Kasir diperbarui');
    } catch (error) { toast(errMsg(error)); }
    finally { setWriting(false); inFlight.current = false; }
  }

  return <Sheet title={row.name} subtitle={row.supplier} icon="/belanja" onClose={() => { if (!inFlight.current) onClose(); }}>
    <SheetStats items={[
      ['Harga sebelumnya', row.previous_price == null ? '—' : `${rp(row.previous_price)} / ${row.base_unit}`],
      ['Harga baru', `${rp(row.net_price)} / ${row.base_unit}`],
      ['Selisih', movement(row)],
    ]} />
    {row.alert && <p className="notice bad">Kenaikan melewati batas yang ditetapkan pemilik.</p>}
    <p className="small muted">{rp(row.net_total)} bersih ÷ {angka(row.quantity)} {row.base_unit}. Jika produk muncul pada beberapa baris, harga dihitung dari total bersih dan total kuantitas di faktur.</p>
    <button onClick={() => openInvoice(row.invoice_id, row.purchase_id)}>Faktur baru · {row.supplier_no} · {tgl(row.invoice_date)}</button>
    {row.previous_id && <button onClick={() => openInvoice(row.previous_id, row.previous_purchase)}>Faktur sebelumnya · {row.previous_no} · {tgl(row.previous_date)}</button>}
    {!sim && <button className="primary" disabled={loading} onClick={simulate}>{loading ? 'Memuat…' : 'Simulasikan Harga Jual'}</button>}
    {sim && (!unit ? <Empty title="Belum ada satuan jual" /> : <form className="panel stack" onSubmit={approve}>
      <h3>Simulasikan Harga Jual</h3>
      <div className="row">
        <Field label="Satuan jual"><select value={unitId} disabled={writing} onChange={(event) => change(sim.units.find((value) => value.id === event.target.value), tier)}>
          {sim.units.map((value) => <option key={value.id} value={value.id}>{value.name}</option>)}</select></Field>
        <Field label="Jenis harga"><select value={tier} disabled={writing} onChange={(event) => change(unit, event.target.value)}>
          <option value="retail">Eceran</option><option value="wholesale">Grosir</option></select></Field>
      </div>
      <Field label={`Usulan harga jual per ${unit.name}`}><input inputMode="decimal" value={proposed} disabled={writing}
        onChange={(event) => { setProposed(event.target.value); setConfirmed(false); }} /></Field>
      <SheetStats items={[
        ['Perkiraan modal stok berikutnya', rp(cost)],
        ['Harga jual dasar saat ini', effective > 0 ? rp(effective) : '—'],
        ['Margin dengan harga saat ini', margin(effective)],
        ['Margin dengan harga usulan', price ? margin(price) : '—'],
      ]} />
      {fallback > 0 && <p className="small muted">Harga grosir dasar masih mengikuti harga eceran.</p>}
      <p className="small muted">Margin memakai modal faktur baru dan pendapatan sebelum PPN. Harga khusus outlet, pelanggan, dan promo mengikuti aturan Kasir yang berlaku.</p>
      {canApply && price > 0 && price !== current && <>
        <label className="row small"><input type="checkbox" checked={confirmed} disabled={writing} onChange={(event) => setConfirmed(event.target.checked)} /> Saya menyetujui harga jual dasar {rp(price)} per {unit.name}.</label>
        <button className="primary" disabled={!confirmed || writing}>{writing ? 'Menyimpan…' : 'Setujui dan ubah harga Kasir'}</button>
      </>}
      {!canApply && <p className="small muted">Persetujuan tersedia untuk pemilik dari faktur terbaru produk aktif.</p>}
    </form>)}
  </Sheet>;
}
