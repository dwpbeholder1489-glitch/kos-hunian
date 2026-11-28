'use client';

import Link from 'next/link';
import { useRef, useState } from 'react';
import { Field, Sheet, toast } from '@/components/ui';
import { angka, errMsg, rp } from '@/lib/format';
import { uid } from '@/lib/retail';
import { readPrice } from '@/lib/stockSuggestion.mjs';
import { supabase } from '@/lib/supabase';
import styles from './workbench.module.css';

export default function SupplierOrder({ kosId, data, selected, onClose, onSaved }) {
  const groups = new Map();
  for (const line of selected) {
    const key = line.item.supplier_id || '';
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(line);
  }
  const [group, setGroup] = useState(groups.keys().next().value || '');
  const [supplier, setSupplier] = useState(group);
  const [method, setMethod] = useState('tunai');
  const [expected, setExpected] = useState('');
  const [due, setDue] = useState('');
  const [prices, setPrices] = useState({});
  const [busy, setBusy] = useState(false);
  const working = useRef(false);
  const requests = useRef({});
  const lines = groups.get(group) || [];
  const displayedPrice = (line) => prices[line.item.id] ?? (line.unit?.price == null ? '' : String(line.unit.price));
  const total = lines.reduce((sum, line) => sum + Math.round((line.qty || 0) * (readPrice(displayedPrice(line)) || 0) * 100) / 100, 0);

  function changeGroup(key) {
    setGroup(key);
    setSupplier(key);
    setPrices({});
  }

  async function confirm(event) {
    event.preventDefault();
    if (working.current) return;
    if (!supplier) return toast('Pilih pemasok untuk pesanan ini.');
    if (lines.length > 100) return toast('Satu pesanan memuat maksimal 100 produk. Kurangi pilihan terlebih dahulu.');
    if (!lines.length || lines.some((line) => !line.qty || !line.unit || readPrice(displayedPrice(line)) == null)) {
      return toast('Periksa satuan, harga, dan jumlah setiap produk. Ubah jumlah di daftar belanja.');
    }
    if ((expected && expected < data.today) || (method === 'utang' && due && due < data.today)) return toast('Periksa tanggal datang dan jatuh tempo.');

    const key = `prasara:saran-po:${kosId}:${data.location_id}:${lines.map((line) => line.item.id).sort().join(',')}`;
    let request = requests.current[key] || uid();
    try { request = sessionStorage.getItem(key) || request; sessionStorage.setItem(key, request); } catch {}
    requests.current[key] = request;
    working.current = true;
    setBusy(true);
    try {
      const { data: order, error } = await supabase.rpc('stock_suggestion_order', {
        p_kos: kosId, p_branch: data.location_id, p_id: request, p_supplier: supplier, p_method: method,
        p_due: method === 'utang' ? due || null : null, p_expected: expected || null,
        p_lines: lines.map((line) => ({ product_id: line.item.id, qty: line.qty, unit: line.unit.name, price: readPrice(displayedPrice(line)) })),
      });
      if (error) throw error;
      try { sessionStorage.removeItem(key); } catch {}
      toast(order.duplicate ? 'Pesanan ini sudah tersimpan' : 'Pesanan pemasok tersimpan');
      onSaved(order, lines);
    } catch (error) {
      toast(errMsg(error));
    } finally {
      setBusy(false);
      working.current = false;
    }
  }

  return <Sheet title="Buat pesanan pemasok" subtitle={data.location || 'Lokasi kerja'} icon="/grosir" onClose={() => { if (!working.current) onClose(); }}>
    <form className={`stack ${styles.orderForm}`} onSubmit={confirm}>
      <p className="small muted">Periksa harga dan cara bayar. Pesanan tersimpan di Pembelian dengan status Dipesan dan menunggu penerimaan barang.</p>
      {groups.size > 1 && <Field label="Kelompok produk"><select value={group} disabled={busy} onChange={(event) => changeGroup(event.target.value)}>
        {[...groups].map(([key, products]) => <option key={key} value={key}>{products[0].item.supplier || 'Belum ada pemasok'} ({angka(products.length)} produk)</option>)}
      </select></Field>}
      {!data.suppliers.length && <p className="notice">Tambahkan pemasok sebelum membuat pesanan. <Link href="/kontak?tab=supplier">Buka daftar pemasok</Link></p>}
      <div className={styles.orderFields}>
        <Field label="Pemasok"><select required value={supplier} disabled={busy || Boolean(group)} onChange={(event) => setSupplier(event.target.value)}>
          <option value="">Pilih pemasok</option>{data.suppliers.map((contact) => <option key={contact.id} value={contact.id}>{contact.name}</option>)}
        </select></Field>
        <Field label="Cara bayar"><select value={method} disabled={busy} onChange={(event) => setMethod(event.target.value)}>
          <option value="tunai">Tunai</option><option value="transfer">Transfer</option><option value="utang">Utang pemasok</option>
        </select></Field>
        <Field label="Perkiraan tiba"><input type="date" value={expected} min={data.today} disabled={busy} onChange={(event) => setExpected(event.target.value)} /></Field>
        {method === 'utang' && <Field label="Jatuh tempo"><input type="date" value={due} min={data.today} disabled={busy} onChange={(event) => setDue(event.target.value)} /></Field>}
      </div>
      <div className="list">{lines.map((line) => <div key={line.item.id} className={styles.orderLine}>
        <div><b>{line.item.name}</b><small>{line.qty == null ? 'Jumlah belum diisi' : `${angka(line.qty)} ${line.unit?.name || ''}`}</small></div>
        <Field label={`Harga per ${line.unit?.name || 'satuan'} (Rp)`}><input required inputMode="decimal" value={displayedPrice(line)} disabled={busy}
          onChange={(event) => setPrices((previous) => ({ ...previous, [line.item.id]: event.target.value }))} /></Field>
      </div>)}</div>
      <div className="row between"><b>Total pesanan</b><b>{rp(total)}</b></div>
      <button type="submit" className="primary" disabled={busy || !lines.length || !data.suppliers.length}>{busy ? 'Menyimpan…' : 'Konfirmasi dan buat pesanan'}</button>
    </form>
  </Sheet>;
}
