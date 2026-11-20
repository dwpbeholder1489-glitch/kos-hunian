'use client';
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { Sheet, Field, run, toast } from '@/components/ui';
import { rp, angka, parseRp, errMsg, tgl } from '@/lib/format';
import { qtyNum } from '@/lib/retail';
import { BASE_PRESETS, isiNum } from '@/lib/units';

// Kategori barang & varian produk (server: category_save/delete, product_set_category, variant_save, variant_link).

// Baris tombol kategori untuk menyaring daftar. value: '' = semua, '-' = tanpa kategori, atau id kategori.
export function CategoryBar({ cats, value, onChange, counts, onManage }) {
  if (!cats.length && !onManage) return null;
  return (
    <div className="row" style={{ flexWrap: 'nowrap', overflowX: 'auto', gap: 6, paddingBottom: 2 }} role="group" aria-label="Kategori">
      <button className={'sm' + (value === '' ? ' primary' : '')} style={{ flex: 'none' }} onClick={() => onChange('')} aria-pressed={value === ''}>Semua</button>
      {cats.map((c) => <button key={c.id} className={'sm' + (value === c.id ? ' primary' : '')} style={{ flex: 'none' }} onClick={() => onChange(c.id)} aria-pressed={value === c.id}>{c.name}{counts ? ` (${counts[c.id] || 0})` : ''}</button>)}
      {cats.length > 0 && counts && (counts['-'] || 0) > 0 && <button className={'sm' + (value === '-' ? ' primary' : '')} style={{ flex: 'none' }} onClick={() => onChange('-')} aria-pressed={value === '-'}>Tanpa kategori ({counts['-']})</button>}
      {onManage && <button className="sm ghost" style={{ flex: 'none' }} onClick={onManage}>{cats.length ? 'Atur kategori' : '+ Kategori'}</button>}
    </div>
  );
}

export function CategorySheet({ kosId, cats, products, onClose, onChanged }) {
  const [name, setName] = useState('');
  const [edit, setEdit] = useState(null);   // {id, name}
  const [pick, setPick] = useState(null);   // {cat, ids:Set} memilih barang untuk kategori
  const [busy, setBusy] = useState(false);
  const save = async (id, nm) => {
    if (!nm.trim()) return toast('Isi nama kategori.');
    setBusy(true);
    const ok = await run(() => supabase.rpc('category_save', { p_kos: kosId, p_id: id, p_name: nm }), id ? 'Kategori diganti' : 'Kategori ditambahkan', errMsg);
    setBusy(false);
    if (ok) { setName(''); setEdit(null); onChanged(); }
  };
  const del = async (c) => {
    const n = products.filter((p) => p.category_id === c.id).length;
    if (!window.confirm(`Hapus kategori "${c.name}"?${n ? ` ${n} barang menjadi tanpa kategori (barangnya tidak terhapus).` : ''}`)) return;
    if (await run(() => supabase.rpc('category_delete', { p_id: c.id }), 'Kategori dihapus', errMsg)) onChanged();
  };
  const assign = async () => {
    const before = new Set(products.filter((p) => p.category_id === pick.cat.id).map((p) => p.id));
    const add = [...pick.ids].filter((id) => !before.has(id)), rem = [...before].filter((id) => !pick.ids.has(id));
    setBusy(true);
    let ok = true;
    if (add.length) ok = await run(() => supabase.rpc('product_set_category', { p_products: add, p_category: pick.cat.id }), null, errMsg);
    if (ok && rem.length) ok = await run(() => supabase.rpc('product_set_category', { p_products: rem, p_category: null }), null, errMsg);
    setBusy(false);
    if (ok) { toast(`Kategori ${pick.cat.name}: ${pick.ids.size} barang`); setPick(null); onChanged(); }
  };
  if (pick) return (
    <Sheet title={`Barang di ${pick.cat.name}`} onClose={() => setPick(null)}>
      <span className="small muted">Centang barang yang masuk kategori ini. Barang yang sudah ada di kategori lain akan dipindah.</span>
      <div className="list">{products.filter((p) => p.active).map((p) => (
        <label key={p.id} className="li" style={{ gap: 10, justifyContent: 'flex-start' }}>
          <input type="checkbox" style={{ width: 22, minHeight: 22, flex: 'none' }} checked={pick.ids.has(p.id)} onChange={(e) => { const s = new Set(pick.ids); if (e.target.checked) s.add(p.id); else s.delete(p.id); setPick({ ...pick, ids: s }); }} />
          <span style={{ minWidth: 0, overflowWrap: 'anywhere' }}>{p.name}{p.category_id && p.category_id !== pick.cat.id && <span className="small muted"> · {cats.find((c) => c.id === p.category_id)?.name}</span>}</span>
        </label>
      ))}</div>
      <button className="cta" onClick={assign} disabled={busy}>{busy ? 'Menyimpan…' : `Simpan (${pick.ids.size} barang)`}</button>
    </Sheet>
  );
  return (
    <Sheet title="Kategori barang" onClose={onClose}>
      <span className="small muted">Kelompokkan barang (mis. Sembako, Minuman, Rokok) agar mudah dicari di Barang & Kasir, dan lihat penjualan per kategori di Laporan toko.</span>
      <div className="row" style={{ flexWrap: 'nowrap' }}><input value={name} maxLength={40} onChange={(e) => setName(e.target.value)} placeholder="Nama kategori baru" aria-label="Nama kategori baru" /><button className="primary" style={{ flex: 'none' }} disabled={busy} onClick={() => save(null, name)}>Tambah</button></div>
      {cats.length > 0 && <div className="list">{cats.map((c) => (
        <div className="li" key={c.id} style={{ flexWrap: 'wrap', gap: 6 }}>
          {edit?.id === c.id ? <div className="row" style={{ flexWrap: 'nowrap', width: '100%' }}><input value={edit.name} maxLength={40} onChange={(e) => setEdit({ ...edit, name: e.target.value })} aria-label="Nama kategori" /><button className="sm primary" style={{ flex: 'none' }} disabled={busy} onClick={() => save(c.id, edit.name)}>Simpan</button></div> : <>
            <div className="main"><b style={{ overflowWrap: 'anywhere' }}>{c.name}</b><span className="small muted">{products.filter((p) => p.category_id === c.id).length} barang</span></div>
            <div className="row" style={{ flexWrap: 'nowrap' }}>
              <button className="sm" onClick={() => setPick({ cat: c, ids: new Set(products.filter((p) => p.category_id === c.id).map((p) => p.id)) })}>Pilih barang</button>
              <button className="sm ghost" onClick={() => setEdit({ id: c.id, name: c.name })}>Ubah</button>
              <button className="sm ghost" style={{ color: 'var(--bad)' }} onClick={() => del(c)}>Hapus</button>
            </div>
          </>}
        </div>
      ))}</div>}
    </Sheet>
  );
}

// Semua kombinasi atribut → label "Merah / L"
const combos = (attrs) => attrs.filter((a) => a.values.length).reduce((acc, a) => acc.flatMap((x) => a.values.map((v) => (x ? `${x} / ${v}` : v))), ['']).filter(Boolean);
const splitVals = (s) => [...new Set(String(s).split(',').map((x) => x.trim()).filter(Boolean))];

// Membuat barang bervarian baru, atau menambah varian ke grup yang ada (group = {id, name, attrs, base, cost, labels})
export function VariantForm({ kosId, cats, group, onClose, onSaved }) {
  const [name, setName] = useState(group?.name || '');
  const [cat, setCat] = useState(group?.category_id || '');
  const [base, setBase] = useState(group?.base || 'pcs');
  const [cost, setCost] = useState(group?.cost ? angka(group.cost) : '');
  const [attrs, setAttrs] = useState(() => (group?.attrs?.length ? group.attrs.map((a) => ({ name: a.name, text: (a.values || []).join(', ') })) : [{ name: 'Warna', text: '' }, { name: 'Ukuran', text: '' }]));
  const [extra, setExtra] = useState({ name: '', qty: '', price: '' });   // satuan tambahan opsional (mis. Lusin isi 12)
  const [rows, setRows] = useState({});   // label → {on, price, stock, sku, barcode}
  const [price, setPrice] = useState('');
  const [busy, setBusy] = useState(false);
  const parsed = attrs.map((a) => ({ name: a.name.trim(), values: splitVals(a.text) })).filter((a) => a.name && a.values.length);
  const taken = new Set((group?.labels || []).map((l) => l.toLowerCase()));
  const labels = combos(parsed).filter((l) => !taken.has(l.toLowerCase()));
  const row = (l) => rows[l] || { on: true, price: '', stock: '', sku: '', barcode: '' };
  const setRow = (l, patch) => setRows({ ...rows, [l]: { ...row(l), ...patch } });
  const chosen = labels.filter((l) => row(l).on);
  const save = async () => {
    if (!group && !name.trim()) return toast('Isi nama barang, mis. Kaos Polos.');
    if (!base.trim()) return toast('Isi satuan utama.');
    if (!chosen.length) return toast('Isi pilihan varian (mis. S, M, L) dan centang minimal satu.');
    if (chosen.length > 60) return toast('Maksimal 60 varian sekali simpan.');
    const ex = extra.name.trim() ? { name: extra.name.trim(), content_qty: isiNum(extra.qty), content_unit: base.trim(), price_retail: parseRp(extra.price), price_wholesale: 0 } : null;
    if (ex && !(ex.content_qty > 0)) return toast(`Isi berapa ${base} dalam 1 ${ex.name}.`);
    setBusy(true);
    const { data, error } = await supabase.rpc('variant_save', {
      p_kos: kosId, p_group: group?.id || null, p_name: name, p_attrs: parsed,
      p_template: { base: base.trim(), cost: parseRp(cost), category_id: cat || null, units: ex ? [ex] : [] },
      p_variants: chosen.map((l) => { const r = row(l); return { label: l, price_retail: parseRp(r.price || price), stock: r.stock.trim() ? qtyNum(r.stock) : 0, sku: r.sku.trim() || null, barcode: r.barcode.trim() || null }; }),
    });
    setBusy(false);
    if (error) return toast(errMsg(error));
    onSaved(data);
  };
  return (
    <Sheet title={group ? `Tambah varian · ${group.name}` : 'Barang dengan varian'} onClose={onClose}>
      <span className="small muted">Tiap varian menjadi barang tersendiri dengan stok, harga, dan barcode sendiri — mis. "{name.trim() || 'Kaos Polos'} — Merah / L". Di Kasir & laporan tetap terlihat sebagai satu kelompok.</span>
      {!group && <Field label="Nama barang"><input value={name} maxLength={80} onChange={(e) => setName(e.target.value)} placeholder="mis. Kaos Polos" /></Field>}
      {!group && <div className="row">
        <Field label="Satuan utama"><input value={base} maxLength={20} onChange={(e) => setBase(e.target.value)} list="var-base" /><datalist id="var-base">{BASE_PRESETS.map((x) => <option key={x} value={x} />)}</datalist></Field>
        {cats.length > 0 && <Field label="Kategori"><select value={cat} onChange={(e) => setCat(e.target.value)}><option value="">— tanpa —</option>{cats.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></Field>}
      </div>}
      <div className="row">
        <Field label={`Harga modal per ${base || 'satuan'}`} hint="sama untuk semua varian baru"><input inputMode="numeric" value={cost} onChange={(e) => setCost(e.target.value)} placeholder="boleh kosong" /></Field>
        <Field label={`Harga jual per ${base || 'satuan'}`} hint="bisa diubah per varian"><input inputMode="numeric" value={price} onChange={(e) => setPrice(e.target.value)} /></Field>
      </div>
      <span className="label">Pilihan varian</span>
      {attrs.map((a, i) => (
        <div className="row" key={i} style={{ flexWrap: 'nowrap', alignItems: 'flex-end' }}>
          <Field label="Nama pilihan"><input value={a.name} maxLength={20} onChange={(e) => setAttrs(attrs.map((x, k) => (k === i ? { ...x, name: e.target.value } : x)))} placeholder="mis. Ukuran" /></Field>
          <Field label="Isinya, pisahkan dengan koma"><input value={a.text} onChange={(e) => setAttrs(attrs.map((x, k) => (k === i ? { ...x, text: e.target.value } : x)))} placeholder={i === 0 ? 'Merah, Hitam' : 'S, M, L, XL'} /></Field>
        </div>
      ))}
      {attrs.length < 3 && <button className="sm ghost" style={{ alignSelf: 'flex-start' }} onClick={() => setAttrs([...attrs, { name: '', text: '' }])}>+ Pilihan lain</button>}
      {!group && <details className="unitbox"><summary className="small" style={{ cursor: 'pointer' }}>Satuan jual lain (opsional, mis. Lusin isi 12)</summary>
        <div className="row">
          <Field label="Nama satuan"><input value={extra.name} maxLength={20} onChange={(e) => setExtra({ ...extra, name: e.target.value })} placeholder="mis. Lusin" /></Field>
          <Field label={`Isi (${base || 'satuan'})`}><input inputMode="decimal" value={extra.qty} onChange={(e) => setExtra({ ...extra, qty: e.target.value })} placeholder="12" /></Field>
          <Field label="Harga"><input inputMode="numeric" value={extra.price} onChange={(e) => setExtra({ ...extra, price: e.target.value })} /></Field>
        </div></details>}
      {labels.length > 0 && <>
        <span className="label">{chosen.length} varian akan dibuat</span>
        {labels.map((l) => { const r = row(l); return (
          <div className="unitbox" key={l} style={{ gap: 6, opacity: r.on ? 1 : 0.55 }}>
            <label className="row" style={{ flexWrap: 'nowrap', gap: 8 }}><input type="checkbox" style={{ width: 22, minHeight: 22, flex: 'none' }} checked={r.on} onChange={(e) => setRow(l, { on: e.target.checked })} /><b className="small" style={{ overflowWrap: 'anywhere' }}>{l}</b></label>
            {r.on && <div className="row">
              <Field label="Harga jual"><input inputMode="numeric" value={r.price} onChange={(e) => setRow(l, { price: e.target.value })} placeholder={price || '0'} /></Field>
              <Field label="Stok sekarang"><input inputMode="decimal" value={r.stock} onChange={(e) => setRow(l, { stock: e.target.value })} placeholder="0" /></Field>
              <Field label="Kode / barcode"><input value={r.barcode} maxLength={40} onChange={(e) => setRow(l, { barcode: e.target.value })} placeholder="opsional" /></Field>
            </div>}
          </div>); })}
      </>}
      {parsed.length > 0 && labels.length === 0 && <p className="small muted" style={{ margin: 0 }}>Semua kombinasi ini sudah ada. Tambahkan pilihan baru, mis. ukuran XXL.</p>}
      <button className="cta" onClick={save} disabled={busy || !chosen.length}>{busy ? 'Menyimpan…' : `Simpan ${chosen.length} varian`}</button>
    </Sheet>
  );
}

// Data grup varian untuk "Tambah varian" dari barang yang sudah bervarian
export function groupOf(p, products, units, groups) {
  const g = groups.find((x) => x.id === p.variant_group_id);
  if (!g) return null;
  const sibs = products.filter((x) => x.variant_group_id === g.id);
  return { id: g.id, name: g.name, attrs: g.attrs || [], base: p.base_unit, cost: Number(p.cost) || 0, category_id: p.category_id, labels: sibs.map((x) => x.variant_label || ''), count: sibs.length,
    price: Number(units.find((u) => u.product_id === p.id && Number(u.qty) === 1)?.price_retail) || 0 };
}

// Harga per jumlah beli (server: price_breaks_set; harga dipakai Kasir & surat jalan grosir lewat price_break)
// Satu daftar per satuan. Kasir memakai harga TERENDAH antara harga biasa dan tingkat yang terpenuhi; harga yang diubah manual tidak terpengaruh.
export function PriceBreakSheet({ p, units, breaks, onClose, onSaved }) {
  const [unit, setUnit] = useState(units[0]?.name || p.base_unit);
  const rowsOf = (u) => {
    const r = breaks.filter((b) => b.product_id === p.id && b.unit === u).sort((a, b) => a.tier.localeCompare(b.tier) || Number(a.min_qty) - Number(b.min_qty))
      .map((b) => ({ min_qty: angka(b.min_qty), price: angka(b.price), tier: b.tier }));
    return r.length ? r : [{ min_qty: '', price: '', tier: 'semua' }];
  };
  const [rows, setRows] = useState(() => rowsOf(units[0]?.name || p.base_unit));
  const u = units.find((x) => x.name === unit);
  const set = (i, patch) => setRows(rows.map((r, k) => (k === i ? { ...r, ...patch } : r)));
  const pick = (n) => { setUnit(n); setRows(rowsOf(n)); };
  const save = async () => {
    const out = rows.filter((r) => String(r.min_qty).trim() || String(r.price).trim()).map((r) => ({ min_qty: qtyNum(r.min_qty), price: parseRp(r.price), tier: r.tier }));
    if (out.some((r) => !(r.min_qty > 1))) return toast('Jumlah minimal harus lebih dari 1.');
    if (u && out.some((r) => r.price >= Number(r.tier === 'grosir' && Number(u.price_wholesale) > 0 ? u.price_wholesale : u.price_retail))) toast('Catatan: ada harga yang tidak lebih murah dari harga biasa — Kasir tetap memakai harga yang lebih murah.');
    if (await run(() => supabase.rpc('price_breaks_set', { p_product: p.id, p_unit: unit, p_rows: out }), out.length ? 'Harga beli banyak disimpan' : 'Harga beli banyak dihapus', errMsg)) onSaved();
  };
  return (
    <Sheet title={`Harga beli banyak · ${p.name}`} onClose={onClose}>
      <p className="small muted" style={{ margin: 0 }}>Contoh: beli 1–9 {unit} = harga biasa, beli 10 ke atas = Rp 9.500 per {unit}. Kasir mengganti harga otomatis saat jumlahnya tercapai.</p>
      {units.length > 1 && <Field label="Satuan"><select value={unit} onChange={(e) => pick(e.target.value)}>{units.map((x) => <option key={x.name} value={x.name}>{x.name}</option>)}</select></Field>}
      {u && <p className="small" style={{ margin: 0 }}>Harga biasa per {unit}: <b>{rp(u.price_retail)}</b>{Number(u.price_wholesale) > 0 ? ` · grosir ${rp(u.price_wholesale)}` : ''}</p>}
      {rows.map((r, i) => (
        <div key={i} className="panel" style={{ padding: 10, display: 'grid', gap: 8 }}>
          <div className="row">
            <Field label={`Beli minimal (${unit})`}><input inputMode="decimal" value={r.min_qty} onChange={(e) => set(i, { min_qty: e.target.value })} placeholder="mis. 10" /></Field>
            <Field label={`Harga per ${unit}`}><input inputMode="numeric" value={r.price} onChange={(e) => set(i, { price: e.target.value })} placeholder="mis. 9500" /></Field>
          </div>
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <select value={r.tier} onChange={(e) => set(i, { tier: e.target.value })} aria-label="Berlaku untuk" style={{ maxWidth: 200 }}>
              <option value="semua">Eceran & grosir</option><option value="ecer">Hanya eceran</option><option value="grosir">Hanya grosir</option>
            </select>
            <button className="sm ghost" onClick={() => setRows(rows.length > 1 ? rows.filter((_, k) => k !== i) : [{ min_qty: '', price: '', tier: 'semua' }])}>Hapus</button>
          </div>
        </div>
      ))}
      {rows.length < 10 && <button className="sm" onClick={() => setRows([...rows, { min_qty: '', price: '', tier: 'semua' }])}>+ Tingkat harga</button>}
      <p className="small muted" style={{ margin: 0 }}>Harga yang diubah manual di Kasir tidak ikut. Promo tetap dihitung sesudahnya.</p>
      <button className="primary" onClick={save}>Simpan</button>
    </Sheet>
  );
}

// Harga per outlet (server: outlet_price_set; RLS outlet_prices). Kosong = harga umum. Hanya mengganti harga DASAR
// (eceran/grosir) di outlet itu; daftar harga pelanggan tetap menang (urutan resmi: manual › daftar › outlet/umum).
export function OutletPriceSheet({ p, units, locs, kosId, onClose }) {
  const outlets = (locs || []).filter((b) => b.kind !== 'gudang');
  const [unit, setUnit] = useState(units[0]?.name || p.base_unit);
  const [rows, setRows] = useState(null);
  const [vals, setVals] = useState({});
  const load = () => supabase.from('outlet_prices').select('*').eq('product_id', p.id).then(({ data }) => {
    setRows(data || []);
    const v = {};
    (data || []).forEach((r) => { v[r.branch_id + '|' + r.unit] = { r: r.price_retail != null ? angka(r.price_retail) : '', w: r.price_wholesale != null ? angka(r.price_wholesale) : '' }; });
    setVals(v);
  });
  useEffect(() => { load(); }, [p.id]);
  const u = units.find((x) => x.name === unit);
  const cell = (bid) => vals[bid + '|' + unit] || { r: '', w: '' };
  const setCell = (bid, patch) => setVals({ ...vals, [bid + '|' + unit]: { ...cell(bid), ...patch } });
  const save = async (b) => {
    const c = cell(b.id);
    const r = String(c.r).trim() === '' ? null : parseRp(c.r);
    const w = String(c.w).trim() === '' ? null : parseRp(c.w);
    if (await run(() => supabase.rpc('outlet_price_set', { p_kos: kosId, p_branch: b.id, p_product: p.id, p_unit: unit, p_retail: r, p_wholesale: w }),
      r == null && w == null ? `${b.name}: kembali ke harga umum` : `${b.name}: harga disimpan`, errMsg)) load();
  };
  return (
    <Sheet title={`Harga per outlet · ${p.name}`} onClose={onClose}>
      <span className="small muted">Isi bila harga di outlet tertentu berbeda dari harga umum. Kosongkan = memakai harga umum. Daftar harga khusus pelanggan tetap lebih diutamakan.</span>
      {units.length > 1 && <div className="seg">{units.map((x) => <button key={x.name} className={unit === x.name ? 'on' : ''} onClick={() => setUnit(x.name)}>{x.name}</button>)}</div>}
      {u && <span className="small muted">Harga umum {unit}: eceran {rp(u.price_retail)}{Number(u.price_wholesale) > 0 ? ` · grosir ${rp(u.price_wholesale)}` : ''}</span>}
      {outlets.length < 2 ? <span className="small muted">Harga per outlet dipakai bila bisnis punya lebih dari satu outlet (Konfigurasi › Cabang & gudang).</span> : !rows ? <span className="small muted">Memuat…</span> :
        <div className="list">{outlets.map((b) => (
          <div className="li" key={b.id} style={{ flexDirection: 'column', alignItems: 'stretch', gap: 6 }}>
            <b className="small">{b.name}</b>
            <div className="row" style={{ flexWrap: 'nowrap', gap: 6 }}>
              <Field label="Eceran"><input inputMode="numeric" value={cell(b.id).r} placeholder={angka(u?.price_retail || 0)} onChange={(e) => setCell(b.id, { r: e.target.value })} /></Field>
              <Field label="Grosir"><input inputMode="numeric" value={cell(b.id).w} placeholder={Number(u?.price_wholesale) > 0 ? angka(u.price_wholesale) : 'umum'} onChange={(e) => setCell(b.id, { w: e.target.value })} /></Field>
              <button className="sm" style={{ alignSelf: 'flex-end' }} onClick={() => save(b)}>Simpan</button>
            </div>
          </div>
        ))}</div>}
    </Sheet>
  );
}

// Riwayat perubahan harga jual satu barang (server: price_history_list, khusus keuangan/pemilik)
const KIND_HARGA = { eceran: 'Eceran', grosir: 'Grosir', daftar: 'Daftar harga', outlet: 'Outlet' };
export function PriceHistorySheet({ p, kosId, onClose }) {
  const [rows, setRows] = useState(null);
  const [err, setErr] = useState(null);
  useEffect(() => {
    supabase.rpc('price_history_list', { p_kos: kosId, p_product: p.id, p_limit: 200 }).then(({ data, error }) => {
      if (error) setErr(errMsg(error)); else setRows(data || []);
    });
  }, [p.id]);
  return (
    <Sheet title={`Riwayat harga · ${p.name}`} onClose={onClose}>
      <span className="small muted">Tercatat otomatis setiap harga eceran, grosir, daftar harga, atau harga outlet berubah. Harga yang diketik manual di Kasir tidak masuk sini (ada di detail penjualan).</span>
      {err ? <div className="notice bad">{err}</div> : !rows ? <span className="small muted">Memuat…</span> : rows.length === 0 ? <span className="small muted">Belum ada perubahan harga sejak fitur ini aktif.</span> :
        <div className="list">{rows.map((r) => (
          <div className="li" key={r.id}>
            <div className="main" style={{ minWidth: 0 }}>
              <b className="small">{KIND_HARGA[r.kind] || r.kind}{r.list_name ? ` · ${r.list_name}` : ''} · {r.unit}</b>
              <span className="small muted">{tgl(String(r.changed_at).slice(0, 10))}{r.changed_by ? ` · ${r.changed_by}` : ''}</span>
            </div>
            <span className="small" style={{ whiteSpace: 'nowrap', textAlign: 'right' }}>{r.old_price != null ? rp(r.old_price) : 'baru'} → <b>{r.new_price != null ? rp(r.new_price) : 'dihapus'}</b></span>
          </div>
        ))}</div>}
    </Sheet>
  );
}
