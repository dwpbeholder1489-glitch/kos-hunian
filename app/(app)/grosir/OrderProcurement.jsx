'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { Field, toast } from '@/components/ui';
import { angka, errMsg, parseRp, tgl } from '@/lib/format';
import { qtyNum, uid } from '@/lib/retail';

const purchaseStatus = {
  dipesan: 'Dipesan',
  sebagian: 'Diterima sebagian',
  selesai: 'Sisa ditutup',
  batal: 'Batal',
};

const quantity = (value, unit) => `${angka(value)} ${unit}`;
const inputQuantity = (value) => String(value).replace('.', ',');

export default function OrderProcurement({ order, reloadKey, editingPurchase, onEditPurchase, onSaved, onProgress }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [refresh, setRefresh] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    onProgress(null);
    async function read() {
      try {
        const { data, error } = await supabase.rpc('so_procurement', { p_order: order.id }).abortSignal(controller.signal);
        if (error) throw error;
        if (!controller.signal.aborted) {
          setData(data);
          onProgress(data);
        }
      } catch (error) {
        if (!controller.signal.aborted) setError(errMsg(error));
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }
    read();
    return () => controller.abort();
  }, [order.id, order.status, order.updated_at, reloadKey, refresh, onProgress]);

  const rows = data?.lines || [];
  const pending = rows.filter((line) => Number(line.remaining) > 0);
  const ready = pending.length > 0 && pending.every((line) => Number(line.ready) >= Number(line.remaining));
  const canSource = pending.some((line) => line.can_source && Number(line.unplaced) > 0);
  const linked = data?.purchases || [];
  const hasOpenPurchase = linked.some((po) => ['dipesan', 'sebagian'].includes(po.status));

  if (!error && (order.status === 'selesai' || order.status === 'batal') && !linked.length) return null;
  return <section className="panel" aria-label="Pemenuhan pesanan">
    <div className="row between">
      <strong>Pemenuhan pesanan</strong>
      <button type="button" className="sm ghost" disabled={loading || editingPurchase} onClick={() => setRefresh((value) => value + 1)}>Muat ulang</button>
    </div>
    {error && <div className="notice bad" role="alert">Pemenuhan pesanan gagal dimuat. {error}</div>}
    {loading && <span className="small muted" role="status">Memeriksa stok dan pesanan supplier…</span>}
    {data?.active && !error && !loading && <>
      {data.location && <span className="small muted">Stok di {data.location}</span>}
      {ready && <div className="notice good">Semua sisa barang siap diserahkan. Lanjutkan lewat Buat surat jalan.</div>}
      <div className="list">
        {pending.map((line) => <div className="li" key={line.id}>
          <div className="main">
            <b>{line.name} · {quantity(line.remaining, line.unit)} tersisa</b>
            <div className="row" style={{ gap: 5, marginTop: 4 }}>
              <span className={`chip ${Number(line.ready) > 0 ? 'good' : ''}`}>Siap {quantity(line.ready, line.unit)}</span>
              <span className={`chip ${Number(line.incoming) > 0 ? 'info' : ''}`}>Menunggu supplier {quantity(line.incoming, line.unit)}</span>
              <span className={`chip ${Number(line.unplaced) > 0 ? 'gold' : ''}`}>Perlu dipesan {quantity(line.unplaced, line.unit)}</span>
            </div>
            {Number(line.received) > 0 && <span className="small muted">Diterima dari PO terkait {quantity(line.received, line.unit)}</span>}
            {!line.can_source && Number(line.unplaced) > 0 && <span className="small muted">Cek status barang, paket, atau konversi satuannya di Barang &amp; stok.</span>}
          </div>
        </div>)}
      </div>
      {canSource && !data.at_order_location && <span className="small muted">Pilih lokasi {data.location || 'pesanan'} untuk membuat pesanan supplier.</span>}
      {data.can_buy && canSource && !editingPurchase && <button type="button" onClick={() => onEditPurchase(true)}>+ Pesanan supplier</button>}
    </>}
    {!error && linked.length > 0 && <div className="list">
      <span className="label">Pesanan supplier terkait</span>
      {linked.map((po) => <div className="li" key={po.id}>
        <div className="main">
          <b>{po.number} · {po.supplier}</b>
          <span className="small muted">{po.status === 'selesai' && po.received_all ? 'Diterima penuh' : purchaseStatus[po.status]}
            {po.expected_date && ['dipesan', 'sebagian'].includes(po.status) ? ` · Perkiraan tiba ${tgl(po.expected_date)}` : ''}</span>
        </div>
        {data.can_open_purchase && <Link href={`/belanja?pesanan=${po.id}`} className="small">Buka Belanja</Link>}
      </div>)}
      {(!data.active || ready) && hasOpenPurchase &&
        <div className="notice small">Masih ada PO terbuka. Tinjau sisa pesanan supplier di Belanja.</div>}
    </div>}
    {editingPurchase && data?.can_buy && <SupplierOrderForm order={order}
      lines={pending.filter((line) => line.can_source && Number(line.unplaced) > 0)}
      onCancel={() => onEditPurchase(false)}
      onSaved={() => { onEditPurchase(false); setRefresh((value) => value + 1); onSaved(); }} />}
  </section>;
}

function SupplierOrderForm({ order, lines, onCancel, onSaved }) {
  const [suppliers, setSuppliers] = useState(null);
  const [loadError, setLoadError] = useState(null);
  const [supplier, setSupplier] = useState('');
  const [method, setMethod] = useState('transfer');
  const [expected, setExpected] = useState('');
  const [due, setDue] = useState('');
  const [note, setNote] = useState('');
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const saving = useRef(false);
  const id = useRef(null);
  const [items, setItems] = useState(() => Object.fromEntries(lines.map((line) => [
    line.id, { selected: true, qty: inputQuantity(line.unplaced), price: '' },
  ])));

  useEffect(() => {
    const controller = new AbortController();
    supabase.from('contacts').select('id,name').eq('kos_id', order.kos_id).eq('kind', 'supplier')
      .is('archived_at', null).order('name').abortSignal(controller.signal).then(({ data, error }) => {
        if (controller.signal.aborted) return;
        if (error) setLoadError(errMsg(error));
        else setSuppliers(data);
      });
    return () => controller.abort();
  }, [order.kos_id]);

  function change(line, patch) {
    setItems((previous) => ({ ...previous, [line]: { ...previous[line], ...patch } }));
  }

  async function save(event) {
    event.preventDefault();
    if (saving.current || !supplier) return;
    const selected = lines.filter((line) => items[line.id]?.selected);
    if (!selected.length) return setError('Pilih minimal satu barang.');
    const payload = [];
    for (const line of selected) {
      const item = items[line.id];
      const qty = qtyNum(item.qty);
      if (!(qty > 0 && qty <= Number(line.unplaced))) return setError(`${line.name}: masukkan jumlah hingga ${quantity(line.unplaced, line.unit)}.`);
      if (!item.price.trim()) return setError(`Isi harga beli ${line.name}.`);
      payload.push({ line_id: line.id, qty, price: parseRp(item.price) });
    }
    setError(null);
    saving.current = true;
    setBusy(true);
    const requestId = id.current || (id.current = uid());
    try {
      const { data, error } = await supabase.rpc('so_purchase_create', {
        p_id: requestId, p_order: order.id, p_supplier: supplier, p_lines: payload, p_method: method,
        p_due: method === 'utang' && due ? due : null, p_expected: expected || null, p_note: note || null,
      });
      if (error) throw error;
      toast(`Pesanan supplier ${data.number} tersimpan`);
      onSaved();
    } catch (error) {
      setError(errMsg(error));
    } finally {
      saving.current = false;
      setBusy(false);
    }
  }

  return <form className="stack unitbox" onSubmit={save}>
    <strong>Buat pesanan supplier</strong>
    {loadError && <div role="alert" className="notice bad">Daftar supplier gagal dimuat. {loadError}</div>}
    {suppliers?.length === 0 && <span className="small">Tambahkan supplier di <Link href="/kontak?baru=1">Pelanggan &amp; supplier</Link>.</span>}
    <fieldset className="stack" disabled={busy} style={{ margin: 0, padding: 0, border: 0, minWidth: 0 }}>
      <Field label="Supplier"><select value={supplier} onChange={(event) => setSupplier(event.target.value)} required>
        <option value="">{suppliers === null && !loadError ? 'Memuat supplier…' : 'Pilih supplier'}</option>
        {suppliers?.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
      </select></Field>
      {lines.map((line) => <div key={line.id} className="panel">
        <label className="row"><input type="checkbox" style={{ width: 'auto' }} checked={Boolean(items[line.id]?.selected)}
          onChange={(event) => change(line.id, { selected: event.target.checked })} /> <b>{line.name}</b></label>
        {items[line.id]?.selected && <div className="row">
          <Field label={`Jumlah (${line.unit})`}><input inputMode="decimal" value={items[line.id].qty} onChange={(event) => change(line.id, { qty: event.target.value })} /></Field>
          <Field label={`Harga beli per ${line.unit}`}><input inputMode="numeric" value={items[line.id].price}
            onChange={(event) => { const digits = event.target.value.replace(/\D/g, ''); change(line.id, { price: digits ? angka(Number(digits)) : '' }); }} /></Field>
        </div>}
      </div>)}
      <div className="row">
        <Field label="Cara bayar"><select value={method} onChange={(event) => setMethod(event.target.value)}>
          <option value="transfer">Transfer</option><option value="tunai">Tunai</option><option value="utang">Utang supplier</option>
        </select></Field>
        <Field label="Perkiraan tiba"><input type="date" value={expected} onChange={(event) => setExpected(event.target.value)} /></Field>
        {method === 'utang' && <Field label="Jatuh tempo"><input type="date" value={due} onChange={(event) => setDue(event.target.value)} /></Field>}
      </div>
      <Field label="Catatan untuk supplier"><input value={note} onChange={(event) => setNote(event.target.value)} maxLength={250} /></Field>
    </fieldset>
    {error && <div role="alert" className="notice bad">{error}</div>}
    <div className="row">
      <button type="submit" className="primary" disabled={busy || !supplier}>{busy ? 'Menyimpan…' : 'Simpan pesanan supplier'}</button>
      <button type="button" disabled={busy} onClick={onCancel}>Tutup formulir</button>
    </div>
  </form>;
}
