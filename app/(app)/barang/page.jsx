'use client';
import { ScanButton } from '@/components/BarcodeScan';
import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { useKos } from '@/components/KosProvider';
import PageHelp from '@/components/PageHelp';
import { Sheet, Field, Loading, Empty, Tile, run, toast } from '@/components/ui';
import { rp, angka, parseRp, errMsg, tgl } from '@/lib/format';
import { qtyNum, unitsOf, stockText, isLow, MOVE } from '@/lib/retail';

// Muat barang + satuan untuk bisnis aktif
function useProducts(kosId, ver) {
  const [d, setD] = useState(null);
  const [err, setErr] = useState(null);
  const load = useCallback(async () => {
    const [p, u] = await Promise.all([
      supabase.from('products').select('*').eq('kos_id', kosId).order('name'),
      supabase.from('product_units').select('*').eq('kos_id', kosId),
    ]);
    if (p.error || u.error) return setErr(errMsg(p.error || u.error));
    setD({ products: p.data, units: u.data });
  }, [kosId]);
  useEffect(() => { load(); }, [load, ver]);
  return { d, err, reload: load };
}

export default function Barang() {
  const { kosId, ver } = useKos();
  const { d, err, reload } = useProducts(kosId, ver);
  const [q, setQ] = useState('');
  const [f, setF] = useState('aktif');
  const [edit, setEdit] = useState(null);   // null | 'new' | product
  const [adj, setAdj] = useState(null);
  if (err) return <div className="notice bad">{err.includes('products') ? 'Database sedang diperbarui. Coba lagi beberapa menit lagi.' : err}</div>;
  if (!d) return <Loading />;

  const active = d.products.filter((p) => p.active);
  const low = active.filter(isLow);
  const value = active.reduce((s, p) => s + Math.max(0, Number(p.stock)) * Number(p.cost), 0);
  const term = q.trim().toLowerCase();
  const shown = d.products.filter((p) => (f === 'arsip' ? !p.active : p.active) && (f !== 'menipis' || isLow(p))
    && (!term || term.split(/\s+/).every((w) => p.name.toLowerCase().includes(w)) || (p.sku || '').toLowerCase() === term
      || d.units.some((u) => u.product_id === p.id && (u.barcode || '').toLowerCase() === term)));

  return (
    <div className="stack">
      <div className="row between"><div className="row"><h2>Barang & stok</h2><PageHelp page="barang" /></div><button className="primary" onClick={() => setEdit('new')}>+ Tambah barang</button></div>
      <div className="grid">
        <Tile label="Barang aktif" value={angka(active.length)} />
        <Tile label="Nilai stok (harga modal)" value={rp(value)} sub={active.some((p) => !(p.cost > 0)) ? 'ada barang tanpa harga modal' : null} />
        <Tile label="Stok menipis" value={angka(low.length)} tone={low.length ? 'bad' : ''} sub="di bawah batas minimum" />
      </div>
      {d.products.length > 0 && <>
        <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cari nama, kode, atau barcode" aria-label="Cari barang" />
        <div className="seg">
          {[['aktif', `Semua (${active.length})`], ['menipis', `Menipis (${low.length})`], ['arsip', 'Diarsipkan']].map(([k, l]) => <button key={k} className={f === k ? 'on' : ''} onClick={() => setF(k)}>{l}</button>)}
        </div>
      </>}
      {d.products.length === 0 ? (
        <Empty title="Belum ada barang" text="Tambahkan barang yang dijual. Satu barang bisa punya beberapa satuan, misalnya pcs dan dus isi 40, masing-masing dengan harga eceran dan grosir.">
          <button className="primary" onClick={() => setEdit('new')}>+ Tambah barang pertama</button>
        </Empty>
      ) : shown.length === 0 ? <Empty title="Tidak ada yang cocok" /> : (
        <section className="panel"><div className="list">{shown.map((p) => {
          const us = unitsOf(p, d.units);
          return (
            <div className="li" key={p.id} style={{ alignItems: 'flex-start' }}>
              <div className="main">
                <b>{p.name} {isLow(p) && <span className="chip bad">Menipis</span>}</b>
                <span className="small">Stok <b>{stockText(p.stock, us, p.base_unit)}</b> · modal {p.cost > 0 ? `${rp(p.cost)}/${p.base_unit}` : <span style={{ color: 'var(--warn)' }}>belum diisi</span>}</span>
                <span className="small muted">{us.map((u) => `${u.name}${u.qty > 1 ? ` (${angka(u.qty)})` : ''} ${u.price_retail > 0 ? rp(u.price_retail) : 'harga belum diisi'}${u.price_wholesale > 0 ? ` · grosir ${rp(u.price_wholesale)}` : ''}`).join(' · ')}</span>
              </div>
              <div className="row" style={{ flexWrap: 'nowrap' }}>
                <button className="sm" onClick={() => setAdj(p)}>Stok</button>
                <button className="sm ghost" onClick={() => setEdit(p)}>Ubah</button>
              </div>
            </div>
          );
        })}</div></section>
      )}
      {edit && <ProductForm kosId={kosId} p={edit === 'new' ? null : edit} units={edit === 'new' ? [] : unitsOf(edit, d.units)} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); reload(); }} />}
      {adj && <StockSheet p={adj} units={unitsOf(adj, d.units)} onClose={() => setAdj(null)} onSaved={() => { setAdj(null); reload(); }} />}
    </div>
  );
}

const blankUnit = () => ({ name: '', qty: '', price_retail: '', price_wholesale: '' });
const money = (v) => (Number(v) > 0 ? angka(v) : '');

function ProductForm({ kosId, p, units, onClose, onSaved }) {
  const [name, setName] = useState(p?.name || '');
  const [base, setBase] = useState(p?.base_unit || 'pcs');
  const [cost, setCost] = useState(money(p?.cost));
  const [min, setMin] = useState(p && Number(p.min_stock) > 0 ? String(Number(p.min_stock)) : '');
  const [stock, setStock] = useState('');
  const [rows, setRows] = useState(units.length ? units.map((u) => ({ name: u.name, qty: String(Number(u.qty)), price_retail: money(u.price_retail), price_wholesale: money(u.price_wholesale), barcode: u.barcode || '' })) : [{ ...blankUnit(), qty: '1' }]);
  const [sku, setSku] = useState(p?.sku || '');
  const [busy, setBusy] = useState(false);
  const set = (i, k, v) => setRows(rows.map((r, j) => (j === i ? { ...r, [k]: v } : r)));
  const costN = parseRp(cost);

  const save = async () => {
    if (!name.trim()) return toast('Isi nama barang.');
    const us = rows.map((r, i) => ({ name: i === 0 ? base : r.name.trim(), qty: i === 0 ? 1 : qtyNum(r.qty), price_retail: parseRp(r.price_retail), price_wholesale: parseRp(r.price_wholesale), barcode: (r.barcode || '').trim() || null }));
    const bad = us.slice(1).find((u) => !u.name || !(u.qty > 1));
    if (bad) return toast(`Isi nama dan isi (lebih dari 1 ${base}) untuk setiap satuan tambahan.`);
    const st = stock.trim() ? qtyNum(stock) : 0;
    if (!p && !(st >= 0)) return toast('Stok awal tidak valid.');
    setBusy(true);
    const ok = await run(() => supabase.rpc('product_save', { p_kos: kosId, p_id: p?.id || null, p_name: name, p_base: base, p_cost: costN, p_min: min.trim() ? qtyNum(min) || 0 : 0, p_units: us, p_initial_stock: p ? 0 : st, p_sku: sku.trim() || null }), p ? 'Barang diperbarui' : 'Barang ditambahkan', errMsg);
    setBusy(false);
    if (ok) onSaved();
  };
  const archive = async () => {
    if (await run(() => supabase.rpc('product_set_active', { p_product: p.id, p_active: !p.active }), p.active ? 'Barang diarsipkan' : 'Barang aktif lagi', errMsg)) onSaved();
  };

  return (
    <Sheet title={p ? 'Ubah barang' : 'Tambah barang'} onClose={onClose}>
      <Field label="Nama barang"><input value={name} onChange={(e) => setName(e.target.value)} placeholder="mis. Minyak goreng 2L" /></Field>
      <Field label="Kode barang (opsional)" hint="kode sendiri, mis. MG-2L"><input value={sku} maxLength={40} autoCapitalize="characters" onChange={(e) => setSku(e.target.value)} /></Field>
      <div className="row">
        <Field label="Satuan terkecil" hint="pcs / bungkus / kg / liter"><input value={base} maxLength={20} onChange={(e) => setBase(e.target.value)} /></Field>
        <Field label={`Harga modal per ${base || 'satuan'}`} hint="harga beli rata-rata"><input inputMode="numeric" value={cost} onChange={(e) => setCost(e.target.value)} placeholder="mis. 2800" /></Field>
      </div>
      <div className="row">
        {!p && <Field label={`Stok sekarang (${base || 'satuan'})`}><input inputMode="decimal" value={stock} onChange={(e) => setStock(e.target.value)} placeholder="0" /></Field>}
        <Field label={`Peringatan stok minimum (${base || 'satuan'})`}><input inputMode="decimal" value={min} onChange={(e) => setMin(e.target.value)} placeholder="kosongkan jika tidak perlu" /></Field>
      </div>
      <span className="label">Satuan jual & harga</span>
      <p className="small muted" style={{ margin: 0 }}>Baris pertama = satuan terkecil. Tambah satuan lain, misalnya dus isi 40 atau renteng isi 10. Harga grosir boleh dikosongkan.</p>
      {rows.map((r, i) => {
        const qn = i === 0 ? 1 : qtyNum(r.qty);
        const pr = parseRp(r.price_retail);
        const under = costN > 0 && pr > 0 && qn > 0 && pr < costN * qn;
        return (
          <div className="unitbox" key={i}>
            <div className="row">
              {i === 0 ? <Field label="Satuan"><input value={base} disabled /></Field> : <Field label="Satuan"><input value={r.name} maxLength={20} onChange={(e) => set(i, 'name', e.target.value)} placeholder="dus / pak / renteng" /></Field>}
              {i > 0 && <Field label={`Isi (${base || 'satuan'})`}><input inputMode="decimal" value={r.qty} onChange={(e) => set(i, 'qty', e.target.value)} placeholder="40" /></Field>}
            </div>
            <div className="row">
              <Field label="Harga eceran"><input inputMode="numeric" value={r.price_retail} onChange={(e) => set(i, 'price_retail', e.target.value)} /></Field>
              <Field label="Harga grosir"><input inputMode="numeric" value={r.price_wholesale} onChange={(e) => set(i, 'price_wholesale', e.target.value)} /></Field>
            </div>
            <div className="row" style={{ alignItems: 'flex-end' }}>
              <Field label={`Barcode ${i === 0 ? base : r.name || 'satuan'} (opsional)`}><input inputMode="numeric" value={r.barcode || ''} maxLength={40} onChange={(e) => set(i, 'barcode', e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') e.preventDefault(); }} placeholder="scan atau ketik angka di kemasan" /></Field>
              <ScanButton onCode={(c) => set(i, 'barcode', c)} />
            </div>
            {under && <p className="small" style={{ margin: 0, color: 'var(--bad)' }}>Harga eceran di bawah modal ({rp(costN * qn)} per {i === 0 ? base : r.name || 'satuan'}).</p>}
            {i > 0 && <button className="sm ghost" onClick={() => setRows(rows.filter((_, j) => j !== i))}>Hapus satuan ini</button>}
          </div>
        );
      })}
      {rows.length < 6 && <button onClick={() => setRows([...rows, blankUnit()])}>+ Tambah satuan</button>}
      <button className="cta" onClick={save} disabled={busy}>{busy ? 'Menyimpan…' : p ? 'Simpan perubahan' : 'Simpan barang'}</button>
      {p && <p className="small muted" style={{ margin: 0 }}>Stok diubah lewat tombol Stok, supaya setiap selisih tercatat.</p>}
      {p && <button className="ghost" onClick={archive}>{p.active ? 'Arsipkan barang (tidak dijual lagi)' : 'Aktifkan lagi'}</button>}
    </Sheet>
  );
}

const REASONS = [
  ['opname', 'Stok opname (hitung ulang)', 'Jumlah fisik hasil hitung'],
  ['rusak', 'Barang rusak', 'Jumlah yang rusak'],
  ['kedaluwarsa', 'Kedaluwarsa', 'Jumlah yang kedaluwarsa'],
  ['koreksi', 'Koreksi (tambah/kurang)', 'Jumlah'],
];

function StockSheet({ p, units, onClose, onSaved }) {
  const [reason, setReason] = useState('opname');
  const [unit, setUnit] = useState(units[0]?.name || p.base_unit);
  const [qty, setQty] = useState('');
  const [note, setNote] = useState('');
  const [dir, setDir] = useState(1);
  const [hist, setHist] = useState(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    supabase.from('stock_moves').select('kind,delta,stock_after,note,created_at').eq('product_id', p.id).order('created_at', { ascending: false }).limit(15)
      .then(({ data }) => setHist(data || []));
  }, [p.id]);
  const mult = Number(units.find((u) => u.name === unit)?.qty || 1);
  const r = REASONS.find((x) => x[0] === reason);
  const n = qtyNum(qty);
  const base = isFinite(n) ? Math.round(Math.abs(n) * mult * 1000) / 1000 * (reason === 'koreksi' ? dir : 1) : NaN;
  const delta = reason === 'opname' ? base - Number(p.stock) : reason === 'koreksi' ? base : -base;

  const save = async () => {
    if (!isFinite(base) || (reason !== 'koreksi' && base < 0) || (reason !== 'opname' && base === 0)) return toast('Isi jumlahnya.');
    if (reason === 'opname' && delta === 0) { toast('Tidak ada selisih.'); return onClose(); }
    setBusy(true);
    const ok = await run(() => supabase.rpc('stock_adjust', { p_product: p.id, p_reason: reason, p_qty: base, p_note: note }), `Stok ${p.name} ${delta > 0 ? '+' : ''}${angka(delta)} ${p.base_unit}`, errMsg);
    setBusy(false);
    if (ok) onSaved();
  };

  return (
    <Sheet title={`Stok · ${p.name}`} onClose={onClose}>
      <p style={{ margin: 0 }}>Tercatat <b>{stockText(p.stock, units, p.base_unit)}</b>{units.length > 1 ? ` (${angka(p.stock)} ${p.base_unit})` : ''}</p>
      <Field label="Alasan"><select value={reason} onChange={(e) => setReason(e.target.value)}>{REASONS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></Field>
      {reason === 'koreksi' && <div className="seg">{[[1, 'Tambah stok'], [-1, 'Kurangi stok']].map(([v, l]) => <button key={v} className={dir === v ? 'on' : ''} onClick={() => setDir(v)}>{l}</button>)}</div>}
      <div className="row">
        <Field label={r[2]}><input inputMode="decimal" value={qty} onChange={(e) => setQty(e.target.value)} /></Field>
        {units.length > 1 && <Field label="Satuan"><select value={unit} onChange={(e) => setUnit(e.target.value)}>{units.map((u) => <option key={u.name} value={u.name}>{u.name}</option>)}</select></Field>}
      </div>
      {isFinite(base) && qty.trim() !== '' && <p className="small" style={{ margin: 0 }}>Perubahan: <b>{delta > 0 ? '+' : ''}{angka(delta)} {p.base_unit}</b> → stok menjadi {stockText(Number(p.stock) + delta, units, p.base_unit)}{p.cost > 0 ? ` · nilai ${rp(delta * p.cost)}` : ''}</p>}
      <Field label="Catatan (opsional)"><input value={note} onChange={(e) => setNote(e.target.value)} placeholder="mis. dimakan tikus, hitung ulang akhir bulan" /></Field>
      <button className="cta" onClick={save} disabled={busy}>{busy ? 'Menyimpan…' : 'Simpan'}</button>
      <span className="label">Riwayat stok</span>
      {hist === null ? <p className="small muted" style={{ margin: 0 }}>Memuat…</p> : hist.length === 0 ? <p className="small muted" style={{ margin: 0 }}>Belum ada perubahan stok.</p> : (
        <div className="list">{hist.map((h, i) => (
          <div className="li" key={i}>
            <div className="main"><b className="small">{MOVE[h.kind] || h.kind}</b><span className="small muted">{tgl(String(h.created_at).slice(0, 10))}{h.note ? ` · ${h.note}` : ''}</span></div>
            <span className="small" style={{ textAlign: 'right' }}><b style={{ color: Number(h.delta) < 0 ? 'var(--bad)' : 'var(--good)' }}>{Number(h.delta) > 0 ? '+' : ''}{angka(h.delta)}</b><br /><span className="muted">sisa {angka(h.stock_after)}</span></span>
          </div>
        ))}</div>
      )}
    </Sheet>
  );
}
