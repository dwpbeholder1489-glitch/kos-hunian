import { useRef, useState } from 'react';
import { ScanButton } from '@/components/BarcodeScan';
import { Field, toast } from '@/components/ui';
import { angka, errMsg, tglTs } from '@/lib/format';
import { uid } from '@/lib/retail';
import { supabase } from '@/lib/supabase';

const roundStock = (value) => Math.round(value * 1000) / 1000;
const decimal = (value, places) => {
  const text = value.trim().replace(',', '.');
  if (!text) return null;
  return new RegExp(`^\\d+(?:\\.\\d{1,${places}})?$`).test(text) ? Number(text) : NaN;
};

function availableUnits(line, units) {
  const baseUnit = line.products?.base_unit;
  const result = new Map(units.filter((u) => u.product_id === line.product_id).map((u) => [u.name, Number(u.qty)]));
  if (baseUnit) result.set(baseUnit, 1);
  result.set(line.unit, Number(line.unit_qty));
  return result;
}

export function ReceiptMatching({ purchase, lines, units, onBusy, onCancel, onSaved }) {
  const storageKey = `prasara:penerimaan:${purchase.kos_id}:${purchase.id}`;
  const [draft, setDraft] = useState(() => {
    try {
      const saved = JSON.parse(sessionStorage.getItem(storageKey));
      if (saved?.id && saved.rows?.every((row) => lines.some((line) => line.id === row.lineId))) return saved;
    } catch { /* Penyimpanan per tab bersifat opsional. */ }
    return { id: uid(), rows: [] };
  });
  const [selectedLine, setSelectedLine] = useState('');
  const [saving, setSaving] = useState(false);
  const submitting = useRef(false);
  const { rows } = draft;
  const orderLines = new Map(lines.map((line) => [line.id, line]));

  const add = (line, unit = line.unit) => {
    setDraft((previous) => previous.rows.length >= 100 ? previous : {
      ...previous,
      rows: [...previous.rows, {
        id: uid(), lineId: line.id, unit, good: '', damaged: '', price: '',
        expiry: line.expiry || '', lot: line.lot || '',
      }],
    });
  };
  const edit = (id, values) => setDraft((previous) => ({
    ...previous, rows: previous.rows.map((row) => row.id === id ? { ...row, ...values } : row),
  }));

  async function scan(code) {
    const { data, error } = await supabase.rpc('barcode_find', { p_kos: purchase.kos_id, p_code: code });
    if (error) throw error;
    const matches = lines.filter((line) => line.product_id === data?.product_id);
    if (!matches.length) { toast('Barcode ini tidak cocok dengan produk di pesanan.'); return null; }
    const sameUnit = matches.filter((line) => line.unit === data.unit);
    const choices = sameUnit.length ? sameUnit : matches;
    if (choices.length !== 1) { toast('Produk ada di beberapa baris. Pilih baris pesanan secara manual.'); return null; }
    add(choices[0], data.unit || choices[0].unit);
    return true;
  }

  async function confirm() {
    if (submitting.current) return;
    const items = rows.map((row) => ({
      line_id: row.lineId, unit: row.unit, good: decimal(row.good, 3) ?? 0,
      damaged: decimal(row.damaged, 3) ?? 0, price: decimal(row.price, 2),
      expiry: row.expiry || null, lot: row.lot || null,
    }));
    if (items.some((item) => !Number.isFinite(item.good) || !Number.isFinite(item.damaged)
      || (item.price !== null && !Number.isFinite(item.price)))) {
      toast('Periksa jumlah dan harga. Pakai maksimal 3 desimal untuk jumlah dan 2 untuk harga.');
      return;
    }
    if (!items.length || items.some((item) => item.good + item.damaged <= 0)) {
      toast('Isi jumlah barang baik atau rusak di setiap baris.');
      return;
    }
    submitting.current = true;
    setSaving(true);
    onBusy(true);
    try {
      try { sessionStorage.setItem(storageKey, JSON.stringify(draft)); } catch { /* Tetap gunakan ID yang sama di formulir. */ }
      const { data, error } = await supabase.rpc('purchase_receive_matched', { p_purchase: purchase.id, p_receipt: draft.id, p_lines: items });
      if (error) throw error;
      try { sessionStorage.removeItem(storageKey); } catch { /* Penerimaan sudah tersimpan. */ }
      toast(data?.duplicate ? 'Penerimaan ini sudah tersimpan. Periksa riwayat penerimaan.' : 'Penerimaan tersimpan');
      onSaved();
    } catch (error) {
      toast(errMsg(error));
    } finally {
      submitting.current = false;
      setSaving(false);
      onBusy(false);
    }
  }

  const pending = new Map(lines.map((line) => [line.id, roundStock(Math.max(0, Number(line.qty) - Number(line.qty_received)) * Number(line.unit_qty))]));
  return <div className="stack">
    <h3>Cocokkan Pesanan dengan Barang Datang</h3>
    <div className="row">
      <Field label="Produk dalam pesanan"><select value={selectedLine} onChange={(e) => setSelectedLine(e.target.value)} disabled={saving}>
        <option value="">Pilih produk</option>
        {lines.map((line, index) => <option key={line.id} value={line.id}>{index + 1}. {line.name} · {angka(line.qty)} {line.unit}</option>)}
      </select></Field>
      <button type="button" className="sm" disabled={saving || !selectedLine || rows.length >= 100} onClick={() => add(orderLines.get(selectedLine))}>Tambah produk</button>
      {!saving && rows.length < 100 && <ScanButton label="Pindai barcode" onCode={scan} />}
    </div>
    <div className="list">{rows.map((row) => {
      const line = orderLines.get(row.lineId);
      const options = availableUnits(line, units);
      const factor = options.get(row.unit);
      const baseUnit = line.products?.base_unit || 'satuan stok';
      const good = roundStock((decimal(row.good, 3) || 0) * (factor || 0));
      const damaged = roundStock((decimal(row.damaged, 3) || 0) * (factor || 0));
      const available = pending.get(line.id);
      const accepted = Math.min(good, available);
      const remaining = roundStock(available - accepted);
      pending.set(line.id, remaining);
      const expected = Number(line.order_price ?? line.price) * (factor || 0) / Number(line.unit_qty);
      const enteredPrice = decimal(row.price, 2);
      const difference = Number.isFinite(enteredPrice) ? Math.round(enteredPrice * 100) - Math.round(expected * 100) : 0;
      return <div className="li" key={row.id} style={{ flexDirection: 'column', alignItems: 'stretch', gap: 8 }}>
        <div className="row between"><b>{line.name}</b><button type="button" className="sm ghost" disabled={saving}
          onClick={() => setDraft((previous) => ({ ...previous, rows: previous.rows.filter((item) => item.id !== row.id) }))}>Hapus</button></div>
        <div className="row">
          <Field label="Satuan datang"><select disabled={saving} value={row.unit} onChange={(e) => edit(row.id, { unit: e.target.value, price: '' })}>
            {[...options.keys()].map((unit) => <option key={unit}>{unit}</option>)}
          </select></Field>
          <Field label="Jumlah baik"><input disabled={saving} inputMode="decimal" value={row.good} placeholder="0" onChange={(e) => edit(row.id, { good: e.target.value })} /></Field>
          <Field label="Jumlah rusak"><input disabled={saving} inputMode="decimal" value={row.damaged} placeholder="0" onChange={(e) => edit(row.id, { damaged: e.target.value })} /></Field>
          <Field label={`Harga datang per ${row.unit}`}><input disabled={saving} inputMode="decimal" value={row.price} placeholder={receiptPrice.format(expected)} onChange={(e) => edit(row.id, { price: e.target.value })} /></Field>
        </div>
        <span className="small muted">Harga pesanan {receiptPrice.format(expected)} per {row.unit} · 1 {row.unit} = {angka(factor)} {baseUnit}</span>
        {difference !== 0 && <span className="small">Selisih harga {receiptPrice.format(difference / 100)} per {row.unit}</span>}
        <span className="small">Masuk stok {angka(accepted)} · Belum Diterima {angka(remaining)}{damaged > 0 ? ` · Rusak ${angka(damaged)}` : ''}{good > accepted ? ` · Berlebih ${angka(roundStock(good - accepted))}` : ''} ({baseUnit})</span>
        {line.products?.track_expiry && <div className="row">
          <Field label="Tanggal kedaluwarsa"><input disabled={saving} type="date" value={row.expiry} onChange={(e) => edit(row.id, { expiry: e.target.value })} /></Field>
          <Field label="No. batch (opsional)"><input disabled={saving} maxLength={40} value={row.lot} onChange={(e) => edit(row.id, { lot: e.target.value })} /></Field>
        </div>}
      </div>;
    })}</div>
    <div className="row">
      <button type="button" className="cta" onClick={confirm} disabled={saving || !rows.length}>{saving ? 'Menyimpan…' : 'Konfirmasi penerimaan'}</button>
      <button type="button" className="ghost" onClick={onCancel} disabled={saving}>Kembali ke pesanan</button>
    </div>
  </div>;
}

const receiptPrice = new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 2, minimumFractionDigits: 0 });

export function ReceiptHistory({ receipts }) {
  if (!receipts.length) return null;
  return <div className="stack">
    <span className="label">Riwayat penerimaan</span>
    {receipts.map((receipt) => <details className="notice" key={receipt.id}>
      <summary>{tglTs(receipt.created_at)} · {new Date(receipt.created_at).toLocaleTimeString('id-ID', { timeZone: 'Asia/Jakarta', hour: '2-digit', minute: '2-digit' })} WIB · {receipt.lines.length} baris</summary>
      <ul>{receipt.lines.map((line, index) => <li key={index}>
        <b>{line.name}</b>{' · '}{angka(line.good)} {line.unit} baik
        {line.damaged > 0 && ` · Rusak ${angka(line.damaged)} ${line.unit} (${angka(line.damaged_base)} ${line.stock_unit})`}
        {' · Masuk stok '}{angka(line.accepted_base)} {line.stock_unit}
        {line.excess_base > 0 && ` · Berlebih ${angka(line.excess_base)} ${line.stock_unit}`}
        {' · Belum Diterima '}{angka(line.remaining_base)} {line.stock_unit}
        {Number(line.price_difference) !== 0 && <div>Selisih harga {receiptPrice.format(line.price_difference)} per {line.unit} · Pesanan {receiptPrice.format(line.expected_price)} · Datang {receiptPrice.format(line.received_price)}</div>}
        {(line.expiry || line.lot) && <div>{line.expiry ? `Kedaluwarsa ${line.expiry}` : ''}{line.expiry && line.lot ? ' · ' : ''}{line.lot ? `Batch ${line.lot}` : ''}</div>}
      </li>)}</ul>
    </details>)}
  </div>;
}
