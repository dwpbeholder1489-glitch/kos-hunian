'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { Empty, Loading, Sheet, toast } from '@/components/ui';
import { angka, errMsg, tgl, today } from '@/lib/format';
import { qtyNum } from '@/lib/retail';

const OPTIONS = [[7, '1 minggu'], [14, '2 minggu'], [30, '1 bulan']];
const FILTERS = [['order_now', 'Pesan sekarang'], ['schedule', 'Terjadwal'], ['review', 'Perlu dicek']];
const LEAD = { supplier: 'pengaturan supplier', barang: 'pengaturan barang', default: 'perkiraan standar' };

function groupType(item) {
  return item.action === 'order_now' || item.action === 'schedule' ? item.action : 'review';
}

export default function RestockGuidance({ kosId, version, onClose, onPick, onReview }) {
  const [result, setResult] = useState(null);
  const [picked, setPicked] = useState({});
  const [cover, setCover] = useState(14);
  const [retry, setRetry] = useState(0);
  const [tab, setTab] = useState('order_now');

  useEffect(() => {
    const controller = new AbortController();
    setResult(null);
    supabase.rpc('reorder_guidance', { p_kos: kosId, p_cover: cover }).abortSignal(controller.signal).then(({ data, error }) => {
      if (controller.signal.aborted) return;
      if (error) { setResult({ error: errMsg(error) }); return; }
      const rows = data.items || [];
      setResult(data);
      setPicked(Object.fromEntries(rows.filter((row) => row.suggest > 0)
        .map((row) => [row.product_id, { selected: row.action === 'order_now', qty: String(row.suggest) }])));
      setTab((current) => rows.some((row) => groupType(row) === current) ? current : groupType(rows[0] || { action: 'order_now' }));
    }, (error) => { if (!controller.signal.aborted) setResult({ error: errMsg(error) }); });
    return () => controller.abort();
  }, [kosId, cover, retry, version]);

  const rows = result?.items || [];
  const active = rows.filter((row) => groupType(row) === tab);
  const groups = new Map();
  for (const row of active) {
    const key = tab === 'review' ? '' : row.supplier_id || '';
    const group = groups.get(key) || [];
    group.push(row);
    groups.set(key, group);
  }

  function change(id, patch) {
    setPicked((previous) => ({ ...previous, [id]: { ...previous[id], ...patch } }));
  }

  function make(supplierId, list) {
    const selected = list.filter((row) => picked[row.product_id]?.selected);
    if (!selected.length) return toast('Centang barang yang ingin dipesan.');
    const invalid = selected.find((row) => {
      const count = qtyNum(picked[row.product_id].qty);
      return !(count > 0) || (row.max_units != null && count > Number(row.max_units))
        || (row.moq != null && count < Number(row.moq));
    });
    if (invalid) return toast(`Periksa jumlah, minimal pesan, dan batas stok untuk ${invalid.name}.`);
    onPick({
      supplier: supplierId,
      lines: selected.map((row) => ({
        product_id: row.product_id, unit: row.unit, qty: String(qtyNum(picked[row.product_id].qty)),
        price: Number(row.price) > 0 ? angka(row.price) : '',
      })),
    });
  }

  return <Sheet title="Saran belanja" onClose={onClose}>
    <p className="small muted" style={{ margin: 0 }}>Perkiraan dari pemakaian bersih 30 hari, stok yang tersedia di lokasi kerja, dan jadwal barang datang. Waktu pesan memberi cadangan 2 hari.</p>
    {!!result?.location && <div className="notice">Lokasi kerja <strong>{result.location}</strong></div>}
    <div className="seg" role="group" aria-label="Target persediaan setelah barang datang">
      {OPTIONS.map(([value, label]) => <button key={value} type="button" aria-pressed={cover === value} className={cover === value ? 'on' : ''}
        onClick={() => setCover(value)}>{label}</button>)}
    </div>
    {!result ? <Loading /> : result.error ? <div className="stack">
      <div className="notice bad" role="alert">{result.error}</div>
      <button type="button" onClick={() => setRetry((value) => value + 1)}>Coba lagi</button>
    </div> : !rows.length ? <Empty title="Belum ada saran belanja" text="Stok dan pesanan terjadwal masih mencukupi, atau barang belum punya pemakaian dan batas minimum." /> : <>
      <div className="seg" role="group" aria-label="Jenis saran belanja">
        {FILTERS.map(([type, label]) => <button type="button" key={type} className={tab === type ? 'on' : ''} aria-pressed={tab === type}
          onClick={() => setTab(type)}>{label} ({rows.filter((row) => groupType(row) === type).length})</button>)}
      </div>
      {active.length === 0 && <Empty title="Tidak ada barang pada bagian ini" />}
      {[...groups].map(([id, list]) => <section className="panel" key={id || 'no-supplier'} style={{ gap: 8 }}>
        {tab !== 'review' && <b>{list[0].supplier || 'Pilih supplier saat buat pesanan'}</b>}
        {list.map((row) => <GuidanceItem key={row.product_id} row={row} selection={picked[row.product_id]}
          onChange={(patch) => change(row.product_id, patch)} onReview={onReview} />)}
        {tab !== 'review' && <button type="button" className="primary" onClick={() => make(id, list)}>Siapkan pesanan{list[0].supplier ? ` ke ${list[0].supplier}` : ''}</button>}
      </section>)}
    </>}
  </Sheet>;
}

function GuidanceItem({ row, selection, onChange, onReview }) {
  const review = groupType(row) === 'review';
  const reviewOrder = (row.action === 'check_eta' && row.orders.find((po) => !po.date || po.date < today())) || row.orders[0];
  const message = {
    check_eta: 'Pastikan perkiraan kedatangan pesanan yang terlambat atau belum punya tanggal.',
    expedite: 'Stok diperkirakan kurang sebelum jadwal kedatangan. Cek apakah pesanan yang ada bisa dipercepat.',
    check_moq: 'Minimal pesanan supplier menambah stok lebih dari perkiraan kebutuhan 30 hari. Pertimbangkan kemasan atau supplier lain.',
    check_limit: 'Periksa minimal pesan atau ukuran kemasan karena saran melebihi batas stok maksimum.',
  }[row.action];
  return <div className="unitbox" style={{ gap: 6 }}>
    <div className="row between">
      <b>{row.name}</b>
      {!review && <span className={`chip ${row.action === 'order_now' ? 'gold' : 'info'}`}>
        {row.action === 'order_now' ? 'Pesan sekarang' : `Pesan ${tgl(row.order_date)}`}
      </span>}
    </div>
    <span className="small">Tersedia <b>{angka(row.available)} {row.base_unit}</b> · kebutuhan rata-rata {angka(row.per_day)} {row.base_unit}/hari</span>
    <span className="small muted">Waktu tunggu {angka(row.lead_days)} hari ({LEAD[row.lead_source]}) · {row.stockout_date ? `perkiraan habis ${tgl(row.stockout_date)}` : `stok di bawah target ${tgl(row.shortage_date)}`}</span>
    <details>
      <summary className="small">Dasar saran belanja</summary>
      <div className="stack small muted" style={{ gap: 4, marginTop: 6 }}>
        <span>Stok fisik {angka(row.stock)} − dipesan pelanggan {angka(row.reserved)} − ditahan {angka(row.held)} {row.base_unit}.</span>
        <span>Pemakaian bersih {angka(row.used)} {row.base_unit} dalam 30 hari. Stok minimum {angka(row.min_stock)} {row.base_unit}.</span>
        <span>Pesanan supplier {angka(row.on_order)} {row.base_unit} · dengan jadwal {angka(row.scheduled_qty)} · jadwal perlu dicek {angka(row.uncertain_qty)}.</span>
        {row.orders.map((po) => <div key={po.id} className="row between">
          <span>{po.number} · {angka(po.qty)} {row.base_unit} · {po.date ? tgl(po.date) : 'belum ada tanggal'}</span>
          <button type="button" className="sm ghost" onClick={() => onReview(po.id)}>Buka PO</button>
        </div>)}
        {row.moq_applied && <span>Minimal pesan supplier {angka(row.moq)} {row.unit}.</span>}
        {row.max_stock != null && <span>Stok maksimum {angka(row.max_stock)} {row.base_unit}. Jumlah saran memperhitungkan stok fisik dan seluruh PO yang masih terbuka.</span>}
        {!review && <span>Perkiraan kekurangan {angka(row.need)} {row.base_unit}. Satuan pesan {row.unit} berisi {angka(row.unit_qty)} {row.base_unit}.</span>}
      </div>
    </details>
    {review ? <>
      <span className="small" style={{ color: 'var(--att)' }}>{message}</span>
      {reviewOrder && <button type="button" className="sm" onClick={() => onReview(reviewOrder.id)}>Cek {reviewOrder.number}</button>}
    </> : <div className="row between">
      <label className="row small">
        <input type="checkbox" style={{ width: 20, minHeight: 20, flex: 'none' }} checked={selection?.selected || false}
          onChange={(event) => onChange({ selected: event.target.checked })} /> Pilih {row.name}
      </label>
      <label className="row small">Jumlah
        <input inputMode="decimal" value={selection?.qty ?? ''} onChange={(event) => onChange({ qty: event.target.value })} style={{ width: 72 }}
          aria-label={`Jumlah ${row.name}`} /> {row.unit}
      </label>
    </div>}
  </div>;
}
