'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useKos } from '@/components/KosProvider';
import LokasiBar from '@/components/LokasiBar';
import NavIcon from '@/components/NavIcon';
import PageHelp from '@/components/PageHelp';
import ListThumb, { useThumbs } from '@/components/media/ListThumb';
import { Empty, Loading, toast } from '@/components/ui';
import { canArea, pathAllowed } from '@/lib/business';
import { angka, errMsg, rp, tgl, tglTs } from '@/lib/format';
import { PERIODS, PRIORITIES, readQuantity, recommendStock, stockRound, suggestedQuantity } from '@/lib/stockSuggestion.mjs';
import { supabase } from '@/lib/supabase';
import SuggestionDetail, { StockReason } from './SuggestionDetail';
import SupplierOrder from './SupplierOrder';
import styles from './workbench.module.css';

const PAGE_SIZE = 16;
const SORT = { order: 0, check: 1, scheduled: 2, safe: 3 };
const NONE = 'none';

function optionFor(item, selection) {
  return item.units.find((unit) => unit.name === selection?.unit) || item.units[0];
}

function estimate(qty, unit) {
  const count = readQuantity(qty);
  return count == null || unit?.price == null ? null : Math.round(count * Number(unit.price) * 100) / 100;
}

function loadSelection(saved, rows) {
  const products = new Map(rows.map((row) => [row.id, row]));
  return Object.fromEntries((saved?.items || []).filter((line) => products.get(line.id)?.units.length).map((line) => {
    const units = products.get(line.id).units;
    const valid = units.some((unit) => unit.name === line.unit);
    return [line.id, { unit: valid ? line.unit : units[0].name, qty: valid ? String(line.qty) : '', selected: true }];
  }));
}

export default function StockSuggestionsPage() {
  const { kos, kosId, ver, bump } = useKos();
  if (!kosId || !kos) return <Loading />;
  if (kos.business_type !== 'retail' || !canArea(kos, 'stock') || !pathAllowed(kos, '/belanja')) {
    return <Empty title="Saran Belanja Stok" text="Halaman ini tersedia untuk Retail & Grosir dengan akses Pembelian."><Link href="/beranda">Kembali ke Beranda</Link></Empty>;
  }
  return <Workbench key={`${kosId}:${kos.locs?.current || ''}`} kosId={kosId} version={ver} onOrdered={bump} />;
}

function Workbench({ kosId, version, onOrdered }) {
  const [period, setPeriod] = useState(30);
  const [result, setResult] = useState(null);
  const [refresh, setRefresh] = useState(0);
  const [supplier, setSupplier] = useState('');
  const [category, setCategory] = useState('');
  const [priority, setPriority] = useState('focus');
  const [query, setQuery] = useState('');
  const [limit, setLimit] = useState(PAGE_SIZE);
  const [choices, setChoices] = useState({});
  const [saved, setSaved] = useState(null);
  const [saving, setSaving] = useState(false);
  const [detailId, setDetailId] = useState(null);
  const [ordering, setOrdering] = useState(false);
  const [order, setOrder] = useState(null);
  const initialLoad = useRef(true);
  const busySaving = useRef(false);
  const thumbs = useThumbs(kosId, 'product', version);

  useEffect(() => {
    const controller = new AbortController();
    setResult(null);
    supabase.rpc('stock_suggestion_data', { p_kos: kosId, p_days: period }).abortSignal(controller.signal)
      .then(({ data, error }) => {
        if (controller.signal.aborted) return;
        if (error) { setResult({ error: errMsg(error) }); return; }
        setResult(data);
        setSaved(data.saved);
        if (initialLoad.current) {
          setChoices(loadSelection(data.saved, data.rows));
          initialLoad.current = false;
        }
      }, (error) => { if (!controller.signal.aborted) setResult({ error: errMsg(error) }); });
    return () => controller.abort();
  }, [kosId, version, period, refresh]);

  const items = useMemo(() => (result?.rows || []).map((row) => recommendStock(row, result)).sort((a, b) =>
    SORT[a.priority] - SORT[b.priority] || (a.daysLeft ?? Infinity) - (b.daysLeft ?? Infinity) || a.name.localeCompare(b.name, 'id')
  ), [result]);
  const detail = items.find((item) => item.id === detailId);
  const categories = [...new Map(items.filter((item) => item.category_id).map((item) => [item.category_id, item.category]))]
    .sort(([, a], [, b]) => a.localeCompare(b, 'id'));
  const selected = items.filter((item) => choices[item.id]?.selected).map((item) => {
    const choice = choices[item.id];
    const unit = optionFor(item, choice);
    const qty = unit?.name === choice.unit ? readQuantity(choice.qty) : null;
    return { item, unit, qty, estimated: estimate(qty, unit) };
  });
  const selectedTotal = selected.reduce((sum, line) => sum + (line.estimated || 0), 0);
  const missing = selected.filter((line) => line.estimated == null).length;
  const visible = items.filter((item) => (!supplier || (item.supplier_id || NONE) === supplier)
    && (!category || (item.category_id || NONE) === category)
    && (priority === 'all' || (priority === 'focus' ? item.priority !== 'safe' || choices[item.id]?.selected : item.priority === priority))
    && item.name.toLowerCase().includes(query.trim().toLowerCase()));

  function patch(item, update) {
    setChoices((previous) => {
      const old = previous[item.id];
      const unit = optionFor(item, old);
      if (!unit) return previous;
      return { ...previous, [item.id]: { unit: unit.name, qty: old ? (old.unit === unit.name ? old.qty : '') : String(suggestedQuantity(item, unit) || ''), selected: old?.selected || false, ...update } };
    });
  }

  async function save() {
    if (busySaving.current) return;
    if (selected.some((line) => !line.qty || !line.unit)) return toast('Isi jumlah dan satuan untuk setiap produk yang dipilih.');
    busySaving.current = true;
    setSaving(true);
    const lines = selected.map((line) => ({ id: line.item.id, unit: line.unit.name, qty: line.qty }));
    try {
      const { data, error } = await supabase.rpc('stock_shopping_save', { p_kos: kosId, p_branch: result.location_id, p_items: lines });
      if (error) throw error;
      setSaved({ items: lines, updated_at: data });
      toast(lines.length ? 'Daftar belanja disimpan' : 'Daftar belanja dikosongkan');
    } catch (error) {
      toast(errMsg(error));
    } finally {
      setSaving(false);
      busySaving.current = false;
    }
  }

  function ordered(value, lines) {
    const ids = new Set(lines.map((line) => line.item.id));
    setChoices((previous) => Object.fromEntries(Object.entries(previous).filter(([id]) => !ids.has(id))));
    setOrdering(false);
    setOrder(value);
    onOrdered();
    setRefresh((value) => value + 1);
  }

  return <div className={styles.page}>
    <div className={styles.heading}>
      <Link className={styles.back} href="/belanja"><NavIcon name="prev" size={18} /> Pembelian</Link>
      <PageHelp page="belanja" label="? Panduan" />
    </div>
    <header className={styles.hero}>
      <div>
        <h1>Saran Belanja Stok</h1>
        <p>Tentukan barang yang perlu dipesan dan siapkan pesanan pemasok.</p>
        {result?.today && <small>{result.location || 'Lokasi utama'} · Data penjualan {tgl(result.from)} – {tgl(result.to)}</small>}
      </div>
      <span className={styles.heroIcon} aria-hidden="true"><NavIcon name="/grosir" size={34} /></span>
    </header>
    <LokasiBar />
    {order && <div className="notice good" role="status">
      Pesanan {order.number} tersimpan. <Link href={`/belanja?pesanan=${order.id}`}>Buka pesanan</Link>
    </div>}
    <section className={styles.metrics} aria-label="Ringkasan rekomendasi">
      <Metric icon="/grosir" label="Perlu Dipesan" value={result?.rows ? angka(items.filter((i) => i.priority === 'order').length) : '—'} tone="green" />
      <Metric icon="calendar" label="Terjadwal" value={result?.rows ? angka(items.filter((i) => i.priority === 'scheduled').length) : '—'} tone="blue" />
      <Metric icon="info" label="Perlu Dicek" value={result?.rows ? angka(items.filter((i) => i.priority === 'check').length) : '—'} tone="gold" />
      <Metric icon="wallet" label="Estimasi modal dipilih" value={selected.length && selected.length === missing ? '—' : rp(selectedTotal)} tone="violet" note={missing > 0 ? `${angka(missing)} belum dihitung` : undefined} />
    </section>

    <section className={styles.filters} aria-label="Filter saran belanja">
      <label className={styles.search}><span>Cari produk</span><input type="search" placeholder="Nama produk" value={query} onChange={(event) => { setQuery(event.target.value); setLimit(PAGE_SIZE); }} /></label>
      <label>Periode penjualan<select aria-label="Periode penjualan" value={period} onChange={(event) => { setPeriod(Number(event.target.value)); setLimit(PAGE_SIZE); }}>
        {PERIODS.map((day) => <option key={day} value={day}>{day} hari penuh</option>)}
      </select></label>
      <label>Pemasok<select aria-label="Pemasok" value={supplier} onChange={(event) => { setSupplier(event.target.value); setLimit(PAGE_SIZE); }}>
        <option value="">Semua pemasok</option><option value={NONE}>Belum ditentukan</option>
        {(result?.suppliers || []).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
      </select></label>
      <label>Kategori<select aria-label="Kategori" value={category} onChange={(event) => { setCategory(event.target.value); setLimit(PAGE_SIZE); }}>
        <option value="">Semua kategori</option><option value={NONE}>Tanpa kategori</option>
        {categories.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
      </select></label>
      <label>Prioritas<select aria-label="Prioritas" value={priority} onChange={(event) => { setPriority(event.target.value); setLimit(PAGE_SIZE); }}>
        <option value="focus">Rekomendasi</option><option value="all">Semua produk</option>
        {Object.entries(PRIORITIES).map(([key, name]) => <option key={key} value={key}>{name}</option>)}
      </select></label>
    </section>

    {!result ? <Loading rows={4} /> : result.error ? <div className="notice bad" role="alert">
      {result.error} <button onClick={() => setRefresh((value) => value + 1)}>Coba lagi</button>
    </div> : <>
      <section className={styles.listPanel} aria-labelledby="stock-product-list">
        <div className={styles.listHeader}>
          <div>
            <h2 id="stock-product-list">Daftar Produk <small>{angka(visible.length)}</small></h2>
            {saved?.updated_at && <small className="muted">Daftar tersimpan {tglTs(saved.updated_at)}</small>}
          </div>
          {saved?.items?.length > 0 && <button type="button" className="sm ghost" onClick={() => { setChoices(loadSelection(saved, result.rows)); setPriority('all'); setSupplier(''); setCategory(''); setQuery(''); setLimit(PAGE_SIZE); }}>Muat daftar tersimpan</button>}
        </div>
        {visible.length ? <div className={styles.rows}>{visible.slice(0, limit).map((item) => (
          <ProductRow key={item.id} item={item} thumb={thumbs[item.id]} choice={choices[item.id]} onEdit={(value) => patch(item, value)} onDetail={() => setDetailId(item.id)} />
        ))}</div> : <Empty art={false} title="Tidak ada produk yang cocok" text="Ubah filter atau pilih Semua produk untuk melihat stok lain." />}
        {visible.length > limit && <button onClick={() => setLimit((value) => value + PAGE_SIZE)}>Tampilkan lebih banyak</button>}
      </section>
      {(selected.length > 0 || saved?.items?.length > 0) && <section className={styles.selection} aria-label="Tindakan daftar belanja">
        <div><b>{angka(selected.length)} produk dipilih</b><small>{selected.length && selected.length === missing ? 'Harga belum tersedia' : rp(selectedTotal)}{missing > 0 && missing < selected.length ? ' · belum lengkap' : ''}</small></div>
        <button disabled={saving || (!selected.length && !saved?.items?.length)} onClick={save}>{saving ? 'Menyimpan…' : 'Simpan daftar'}</button>
        <button className="primary" disabled={!selected.length || saving} onClick={() => setOrdering(true)}>Buat pesanan</button>
      </section>}
    </>}
    {detail && <SuggestionDetail kosId={kosId} data={result} item={detail} unit={optionFor(detail, choices[detail.id])} onClose={() => setDetailId(null)} />}
    {ordering && result?.rows && <SupplierOrder kosId={kosId} data={result} selected={selected} onClose={() => setOrdering(false)} onSaved={ordered} />}
  </div>;
}

function Metric({ icon, label, value, tone, note }) {
  return <article className={styles.metric} data-tone={tone}>
    <span aria-hidden="true"><NavIcon name={icon} size={20} /></span>
    <div><small>{label}</small><strong>{value}</strong>{note && <small>{note}</small>}</div>
  </article>;
}

function ProductRow({ item, thumb, choice, onDetail, onEdit }) {
  const unit = optionFor(item, choice);
  const quantity = choice ? (choice.unit === unit?.name ? choice.qty : '') : String(suggestedQuantity(item, unit) || '');
  const amount = estimate(quantity, unit);
  return <article className={styles.product}>
    <div className={styles.productHead}>
      <input type="checkbox" checked={Boolean(choice?.selected)} disabled={!unit}
        aria-label={`Pilih ${item.name}`} onChange={(event) => onEdit({ selected: event.target.checked })} />
      <div className={styles.thumb}>
        <NavIcon name="/barang" size={20} />
        {thumb && <ListThumb path={thumb} size={44} radius={9} />}
      </div>
      <button className={styles.productTitle} onClick={onDetail} aria-haspopup="dialog">
        <b>{item.name}</b><small>{[item.category, item.supplier || 'Pemasok belum ditentukan'].filter(Boolean).join(' · ')}</small>
      </button>
      <div className={styles.badges}>
        <span className={styles.priority} data-priority={item.priority}>{PRIORITIES[item.priority]}</span>
        <small>Data {item.confidence.toLowerCase()}</small>
      </div>
    </div>
    <div className={styles.productStats}>
      <div><small>Stok tersedia</small><b>{angka(item.available)} {item.base_unit}</b></div>
      <div><small>Terjual</small><b>{angka(item.sold)} {item.base_unit}</b></div>
      <div><small>Saran beli</small><b>{suggestedQuantity(item, unit) ? `${angka(suggestedQuantity(item, unit))} ${unit.name}` : '—'}</b></div>
      <div><small>Estimasi modal</small><b>{amount == null ? '—' : rp(amount)}</b></div>
    </div>
    <div className={styles.productFoot}>
      <button className={styles.reason} onClick={onDetail} aria-haspopup="dialog"><span><StockReason item={item} /></span><NavIcon name="next" size={15} /></button>
      {unit && <div className={styles.quantity}>
        <label><span>Jumlah</span><input aria-label={`Jumlah ${item.name}`} inputMode="decimal" value={quantity} placeholder="0" onChange={(event) => onEdit({ qty: event.target.value, selected: true })} /></label>
        <label><span>Satuan</span><select aria-label={`Satuan ${item.name}`} value={unit.name} onChange={(event) => {
          const next = item.units.find((u) => u.name === event.target.value);
          const count = readQuantity(quantity);
          const converted = choice && count != null ? stockRound(count * Number(unit.factor) / Number(next.factor)) : suggestedQuantity(item, next);
          onEdit({ unit: next.name, qty: String(converted || '') });
        }}>{item.units.map((option) => <option key={option.name} value={option.name}>{option.name}</option>)}</select></label>
      </div>}
    </div>
  </article>;
}
