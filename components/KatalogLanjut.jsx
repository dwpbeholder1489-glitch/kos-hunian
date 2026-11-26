'use client';
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { ScanButton } from '@/components/BarcodeScan';
import { Sheet, Field, Loading, Empty, run, toast } from '@/components/ui';
import { DataTable } from '@/components/Page';
import { rp, angka, parseRp, errMsg, tgl } from '@/lib/format';
import { qtyNum, splitSerials } from '@/lib/retail';

// Tahap 3 Retail · Katalog lanjutan: merek, barcode tambahan, barang paket, nomor seri & garansi, harga supplier, nota kredit.
// Semua angka & aturan diputuskan server (brand_*, unit_barcodes_set, kit_*, serial_*, claim_*, supplier_item_*, credit_note_*).

const numTxt = (v) => (v == null || v === '' ? '' : String(Number(v)).replace('.', ','));

// ---------------------------------------------------------------- Merek
export function BrandSheet({ kosId, brands, products, onClose, onChanged }) {
  const [name, setName] = useState('');
  const [edit, setEdit] = useState(null);
  const [pick, setPick] = useState(null);   // {brand, ids:Set}
  const [busy, setBusy] = useState(false);
  const save = async (id, nm) => {
    if (!nm.trim()) return toast('Isi nama merek.');
    setBusy(true);
    const ok = await run(() => supabase.rpc('brand_save', { p_kos: kosId, p_id: id, p_name: nm }), id ? 'Merek diganti' : 'Merek ditambahkan', errMsg);
    setBusy(false);
    if (ok) { setName(''); setEdit(null); onChanged(); }
  };
  const del = async (b) => {
    const n = products.filter((p) => p.brand_id === b.id).length;
    if (!window.confirm(`Hapus merek "${b.name}"?${n ? ` ${n} barang menjadi tanpa merek (barangnya tidak terhapus).` : ''}`)) return;
    if (await run(() => supabase.rpc('brand_delete', { p_id: b.id }), 'Merek dihapus', errMsg)) onChanged();
  };
  const assign = async () => {
    const before = new Set(products.filter((p) => p.brand_id === pick.brand.id).map((p) => p.id));
    const add = [...pick.ids].filter((id) => !before.has(id)), rem = [...before].filter((id) => !pick.ids.has(id));
    setBusy(true);
    let ok = true;
    if (add.length) ok = await run(() => supabase.rpc('product_set_brand', { p_products: add, p_brand: pick.brand.id }), null, errMsg);
    if (ok && rem.length) ok = await run(() => supabase.rpc('product_set_brand', { p_products: rem, p_brand: null }), null, errMsg);
    setBusy(false);
    if (ok) { toast(`Merek ${pick.brand.name}: ${pick.ids.size} barang`); setPick(null); onChanged(); }
  };
  if (pick) return (
    <Sheet title={`Barang merek ${pick.brand.name}`} onClose={() => setPick(null)}>
      <span className="small muted">Centang barang dengan merek ini. Barang yang sudah bermerek lain akan dipindah.</span>
      <div className="list">{products.filter((p) => p.active).map((p) => (
        <label key={p.id} className="li" style={{ gap: 10, justifyContent: 'flex-start' }}>
          <input type="checkbox" style={{ width: 22, minHeight: 22, flex: 'none' }} checked={pick.ids.has(p.id)} onChange={(e) => { const s = new Set(pick.ids); if (e.target.checked) s.add(p.id); else s.delete(p.id); setPick({ ...pick, ids: s }); }} />
          <span style={{ minWidth: 0, overflowWrap: 'anywhere' }}>{p.name}{p.brand_id && p.brand_id !== pick.brand.id && <span className="small muted"> · {brands.find((b) => b.id === p.brand_id)?.name}</span>}</span>
        </label>
      ))}</div>
      <button className="cta" onClick={assign} disabled={busy}>{busy ? 'Menyimpan…' : `Simpan (${pick.ids.size} barang)`}</button>
    </Sheet>
  );
  return (
    <Sheet title="Merek barang" onClose={onClose}>
      <span className="small muted">Catat merek (mis. Indomie, Bimoli, Samsung) agar barang mudah dicari di Barang & Kasir, dan lihat penjualan & laba per merek di Laporan toko.</span>
      <div className="row" style={{ flexWrap: 'nowrap' }}><input value={name} maxLength={60} onChange={(e) => setName(e.target.value)} placeholder="Nama merek baru" aria-label="Nama merek baru" /><button className="primary" style={{ flex: 'none' }} disabled={busy} onClick={() => save(null, name)}>Tambah</button></div>
      {brands.length > 0 ? <div className="list">{brands.map((b) => (
        <div className="li" key={b.id} style={{ flexWrap: 'wrap', gap: 6 }}>
          {edit?.id === b.id ? <div className="row" style={{ flexWrap: 'nowrap', width: '100%' }}><input value={edit.name} maxLength={60} onChange={(e) => setEdit({ ...edit, name: e.target.value })} aria-label="Nama merek" /><button className="sm primary" style={{ flex: 'none' }} disabled={busy} onClick={() => save(b.id, edit.name)}>Simpan</button></div> : <>
            <div className="main"><b style={{ overflowWrap: 'anywhere' }}>{b.name}</b><span className="small muted">{products.filter((p) => p.brand_id === b.id).length} barang</span></div>
            <div className="row" style={{ flexWrap: 'nowrap' }}>
              <button className="sm" onClick={() => setPick({ brand: b, ids: new Set(products.filter((p) => p.brand_id === b.id).map((p) => p.id)) })}>Pilih barang</button>
              <button className="sm ghost" onClick={() => setEdit({ id: b.id, name: b.name })}>Ubah</button>
              <button className="sm ghost" style={{ color: 'var(--bad)' }} onClick={() => del(b)}>Hapus</button>
            </div>
          </>}
        </div>
      ))}</div> : <span className="small muted">Belum ada merek.</span>}
    </Sheet>
  );
}

// ---------------------------------------------------------------- Barcode tambahan per satuan
export function BarcodeSheet({ p, units, onClose }) {
  const [codes, setCodes] = useState(null);   // {unit: [code]}
  const [input, setInput] = useState({});
  const [busy, setBusy] = useState(false);
  const load = async () => {
    const { data } = await supabase.from('product_barcodes').select('unit, code').eq('product_id', p.id).order('created_at');
    const m = {}; units.forEach((u) => { m[u.name] = []; });
    (data || []).forEach((r) => { if (m[r.unit]) m[r.unit].push(r.code); });
    setCodes(m);
  };
  useEffect(() => { load(); }, [p.id]);
  const save = async (unit, list) => {
    setBusy(true);
    const ok = await run(() => supabase.rpc('unit_barcodes_set', { p_product: p.id, p_unit: unit, p_codes: list }), 'Barcode tersimpan', errMsg);
    setBusy(false);
    if (ok) { setInput({ ...input, [unit]: '' }); load(); }
    return ok;
  };
  const add = async (unit, c) => {
    const v = String(c || input[unit] || '').trim();
    if (!v) { toast('Ketik atau scan barcodenya.'); return null; }
    if ((codes[unit] || []).some((x) => x.toLowerCase() === v.toLowerCase())) { toast('Barcode itu sudah ada.'); return null; }
    return await save(unit, [...(codes[unit] || []), v]) ? true : null;
  };
  return (
    <Sheet title={`Barcode · ${p.name}`} onClose={onClose}>
      <span className="small muted">Satu barang bisa punya beberapa barcode — mis. kemasan lama & baru, atau kode dari pemasok berbeda. Semua kode bisa di-scan di Kasir. Barcode utama diubah di form barang.</span>
      {codes === null ? <Loading /> : units.map((u) => (
        <div className="unitbox" key={u.name} style={{ gap: 8 }}>
          <b>{u.name}{Number(u.qty) !== 1 ? <span className="small muted"> · isi {angka(u.qty)} {p.base_unit}</span> : null}</b>
          <span className="small">Utama: {u.barcode ? <b>{u.barcode}</b> : <span className="muted">belum ada</span>}</span>
          {(codes[u.name] || []).length > 0 && <div className="row" style={{ flexWrap: 'wrap', gap: 6 }}>{codes[u.name].map((c) => (
            <span key={c} className="chip" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>{c}
              <button className="sm ghost" style={{ minHeight: 0, padding: '0 4px' }} aria-label={`Hapus barcode ${c}`} disabled={busy} onClick={() => save(u.name, codes[u.name].filter((x) => x !== c))}>✕</button></span>
          ))}</div>}
          <div className="row" style={{ flexWrap: 'nowrap', alignItems: 'flex-end' }}>
            <Field label="Barcode tambahan"><input inputMode="numeric" maxLength={40} value={input[u.name] || ''} onChange={(e) => setInput({ ...input, [u.name]: e.target.value })} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); add(u.name); } }} placeholder="scan / ketik" /></Field>
            <ScanButton productUnit={u.name} onCode={(c) => add(u.name, c)} />
            <button className="sm primary" style={{ flex: 'none' }} disabled={busy} onClick={() => add(u.name)}>Tambah</button>
          </div>
        </div>
      ))}
    </Sheet>
  );
}

// ---------------------------------------------------------------- Barang paket
// p = barang paket yang sudah ada (atau barang biasa tanpa riwayat stok yang akan dijadikan paket); null = paket baru
export function KitSheet({ kosId, p, products, units, finance, onClose, onSaved }) {
  const [name, setName] = useState(p?.name || '');
  const [price, setPrice] = useState(() => { const u = units.find((x) => x.product_id === p?.id); return u && Number(u.price_retail) > 0 ? angka(u.price_retail) : ''; });
  const [rows, setRows] = useState([]);   // {product_id, unit, qty}
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState(false);
  const [ready, setReady] = useState(!p?.is_kit);
  useEffect(() => {
    if (!p?.is_kit) return;
    supabase.from('product_kits').select('product_id, unit, qty, sort').eq('kit_id', p.id).order('sort').then(({ data }) => { setRows((data || []).map((r) => ({ product_id: r.product_id, unit: r.unit, qty: numTxt(r.qty) }))); setReady(true); });
  }, [p?.id]);
  const prod = (id) => products.find((x) => x.id === id);
  const unitsOf = (id) => units.filter((u) => u.product_id === id).sort((a, b) => a.sort - b.sort);
  const qtyOf = (r) => Number(unitsOf(r.product_id).find((u) => u.name === r.unit)?.qty || 1) * (qtyNum(r.qty) || 0);
  const cost = rows.reduce((s, r) => s + qtyOf(r) * Number(prod(r.product_id)?.cost || 0), 0);
  const priceN = parseRp(price);
  const canBuild = rows.length ? Math.min(...rows.map((r) => { const b = qtyOf(r); return b > 0 ? Math.floor(Math.max(0, Number(prod(r.product_id)?.stock || 0)) / b) : 0; })) : 0;
  const w = q.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const found = w.length ? products.filter((x) => x.active && !x.is_kit && x.id !== p?.id && !rows.some((r) => r.product_id === x.id) && w.every((t) => x.name.toLowerCase().includes(t))).slice(0, 6) : [];
  const set = (i, patch) => setRows(rows.map((r, j) => (j === i ? { ...r, ...patch } : r)));

  const save = async () => {
    if (!p && !name.trim()) return toast('Isi nama paket.');
    if (!rows.length) return toast('Tambahkan barang isi paket.');
    if (rows.some((r) => !(qtyNum(r.qty) > 0))) return toast('Isi jumlah setiap barang.');
    setBusy(true);
    let pid = p?.id || null;
    let ok = true;
    if (!p) {
      ok = await run(async () => { const r = await supabase.rpc('product_save', { p_kos: kosId, p_id: null, p_name: name, p_base: 'paket', p_cost: 0, p_min: 0, p_units: [{ name: 'paket', price_retail: priceN, price_wholesale: 0, barcode: null }], p_initial_stock: 0, p_sku: null, p_density: null }); if (r.data) pid = r.data; return r; }, null, errMsg);
    }
    if (ok && pid) ok = await run(() => supabase.rpc('kit_save', { p_product: pid, p_components: rows.map((r) => ({ product_id: r.product_id, unit: r.unit, qty: qtyNum(r.qty) })) }), p?.is_kit ? 'Isi paket diperbarui' : 'Paket tersimpan — stok diambil dari barang isinya', errMsg);
    setBusy(false);
    if (ok) onSaved();
  };
  const unset = async () => {
    if (!window.confirm(`Jadikan "${p.name}" barang biasa? Daftar isi paket dihapus; riwayat penjualan paket tetap ada.`)) return;
    if (await run(() => supabase.rpc('kit_unset', { p_product: p.id }), 'Sekarang barang biasa (stok 0)', errMsg)) onSaved();
  };
  return (
    <Sheet title={p ? (p.is_kit ? `Isi paket · ${p.name}` : `Jadikan paket · ${p.name}`) : 'Barang paket baru'} onClose={onClose}>
      <span className="small muted">Paket (mis. "Paket Sembako Hemat", hampers, bundling) dijual sebagai satu barang dengan harga sendiri. Paket tidak punya stok sendiri — setiap paket terjual, stok barang isinya yang berkurang. Retur atau batal mengembalikan barang isinya.</span>
      {!p && <>
        <Field label="Nama paket"><input value={name} maxLength={120} onChange={(e) => setName(e.target.value)} placeholder="mis. Paket Sembako Hemat" /></Field>
        <Field label="Harga jual per paket"><input inputMode="numeric" value={price} onChange={(e) => setPrice(e.target.value)} placeholder="mis. 60000" /></Field>
      </>}
      {p && <span className="small muted">Harga jual paket diubah di Ubah barang (satuan "{unitsOf(p.id)[0]?.name || 'paket'}").</span>}
      <span className="label">Isi 1 paket</span>
      {!ready ? <Loading /> : rows.map((r, i) => {
        const x = prod(r.product_id);
        return (
          <div className="unitbox" key={r.product_id} style={{ gap: 6 }}>
            <div className="row between" style={{ flexWrap: 'nowrap', alignItems: 'flex-start' }}><b style={{ minWidth: 0, overflowWrap: 'anywhere' }}>{x?.name || 'Barang'}</b><button className="sm ghost" aria-label={`Hapus ${x?.name}`} onClick={() => setRows(rows.filter((_, j) => j !== i))}>✕</button></div>
            <div className="row" style={{ flexWrap: 'nowrap' }}>
              <Field label="Jumlah"><input inputMode="decimal" value={r.qty} onChange={(e) => set(i, { qty: e.target.value })} /></Field>
              <Field label="Satuan"><select value={r.unit} onChange={(e) => set(i, { unit: e.target.value })}>{unitsOf(r.product_id).map((u) => <option key={u.name} value={u.name}>{u.name}</option>)}</select></Field>
            </div>
            <span className="small muted">= {angka(qtyOf(r))} {x?.base_unit} · stok {angka(x?.stock || 0)} {x?.base_unit}{finance && Number(x?.cost) > 0 ? ` · modal ${rp(qtyOf(r) * Number(x.cost))}` : ''}</span>
          </div>
        );
      })}
      <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="+ Cari barang isi paket" aria-label="Cari barang isi paket" />
      {found.length > 0 && <div className="list">{found.map((x) => <button key={x.id} className="li" style={{ textAlign: 'left' }} onClick={() => { setRows([...rows, { product_id: x.id, unit: unitsOf(x.id)[0]?.name || x.base_unit, qty: '1' }]); setQ(''); }}><span style={{ minWidth: 0, overflowWrap: 'anywhere' }}>{x.name}</span><span className="small muted">stok {angka(x.stock)} {x.base_unit}</span></button>)}</div>}
      {rows.length > 0 && <div className="unitbox" style={{ gap: 4 }}>
        {finance && <div className="row between"><span>Modal 1 paket (sekarang)</span><b>{rp(cost)}</b></div>}
        {finance && (priceN || (p && Number(unitsOf(p.id)[0]?.price_retail))) > 0 && (() => { const pr = priceN || Number(unitsOf(p.id)[0]?.price_retail); return <div className="row between small"><span>Untung per paket</span><b style={{ color: pr >= cost ? 'var(--good)' : 'var(--bad)' }}>{pr >= cost ? '' : 'RUGI '}{rp(Math.abs(pr - cost))}</b></div>; })()}
        <div className="row between small"><span>Bisa dibuat dari stok sekarang</span><b>{angka(canBuild)} paket</b></div>
      </div>}
      <button className="cta" onClick={save} disabled={busy}>{busy ? 'Menyimpan…' : p?.is_kit ? 'Simpan isi paket' : 'Simpan paket'}</button>
      {p?.is_kit && <button className="ghost" onClick={unset}>Jadikan barang biasa</button>}
    </Sheet>
  );
}

// ---------------------------------------------------------------- Nomor seri & garansi per barang
const SER = { tersedia: ['Tersedia', 'good'], terjual: ['Terjual', ''], rusak: ['Rusak', 'bad'], keluar: ['Keluar', 'void'] };
export function SerialSheet({ kosId, p, onClose, onChanged }) {
  const [track, setTrack] = useState(Boolean(p.track_serial));
  const [days, setDays] = useState(p.warranty_days ? String(p.warranty_days) : '');
  const [list, setList] = useState(null);
  const [f, setF] = useState('tersedia');
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const load = async () => { const { data, error } = await supabase.rpc('serial_list', { p_kos: kosId, p_product: p.id }); setList(error ? [] : data || []); };
  useEffect(() => { if (p.track_serial) load(); }, [p.id]);
  const saveSet = async () => {
    setBusy(true);
    const ok = await run(() => supabase.rpc('product_set_serial', { p_product: p.id, p_track: track, p_warranty_days: days.trim() ? parseInt(days, 10) : null }), track ? 'Nomor seri dicatat untuk barang ini' : 'Nomor seri tidak dicatat lagi', errMsg);
    setBusy(false);
    if (ok) { onChanged(); if (track) load(); }
  };
  const add = async () => {
    const s = splitSerials(text);
    if (!s.length) return toast('Ketik atau scan nomor serinya.');
    setBusy(true);
    let res = null;
    const ok = await run(async () => { const r = await supabase.rpc('serial_add', { p_kos: kosId, p_product: p.id, p_serials: s }); res = r.data; return r; }, null, errMsg);
    setBusy(false);
    if (ok) { toast(`${res.added} nomor seri didaftarkan${res.duplicates?.length ? ` · ${res.duplicates.length} sudah ada: ${res.duplicates.slice(0, 3).join(', ')}` : ''}`); setText(''); load(); }
  };
  const setStatus = async (r, st) => {
    let note = null;
    if (st !== 'tersedia' && st !== 'hapus') { note = window.prompt(st === 'rusak' ? 'Alasan ditandai rusak?' : 'Alasan keluar (hilang, dikembalikan ke supplier, dipakai sendiri)?'); if (!note) return; }
    if (st === 'hapus' && !window.confirm(`Hapus nomor seri ${r.serial}? (hanya untuk salah ketik)`)) return;
    if (await run(() => supabase.rpc('serial_set_status', { p_id: r.id, p_status: st, p_note: note }), st === 'hapus' ? 'Dihapus' : 'Status diubah', errMsg)) load();
  };
  const shown = (list || []).filter((r) => !f || r.status === f);
  const count = (s) => (list || []).filter((r) => r.status === s).length;
  return (
    <Sheet title={`Nomor seri · ${p.name}`} onClose={onClose}>
      <div className="unitbox" style={{ gap: 6 }}>
        <label className="row small" style={{ flexWrap: 'nowrap', fontWeight: 700 }}><input type="checkbox" style={{ width: 22, minHeight: 22, flex: 'none' }} checked={track} onChange={(e) => setTrack(e.target.checked)} />Catat nomor seri / IMEI setiap unit</label>
        <Field label="Lama garansi toko (hari, opsional)" hint="dihitung sejak tanggal terjual; mis. 365 = 1 tahun"><input inputMode="numeric" value={days} onChange={(e) => setDays(e.target.value.replace(/\D/g, ''))} placeholder="kosong = tanpa garansi toko" /></Field>
        {(track !== Boolean(p.track_serial) || (days.trim() ? parseInt(days, 10) : null) !== (p.warranty_days || null)) && <button className="sm primary" disabled={busy} onClick={saveSet}>Simpan pengaturan</button>}
        <span className="small muted">Di Kasir, nomor seri diisi per barang saat dijual (boleh menyusul dari detail penjualan). Nomor yang belum didaftarkan tetap bisa dicatat saat dijual.</span>
      </div>
      {p.track_serial && <>
        <span className="label">Daftarkan nomor seri unit yang ada</span>
        <div className="row" style={{ flexWrap: 'nowrap', alignItems: 'flex-end' }}>
          <Field label="Nomor seri (pisahkan dengan koma atau baris baru)"><textarea rows={3} value={text} onChange={(e) => setText(e.target.value)} placeholder="mis. 3567891234, 3567891235" /></Field>
          <ScanButton onCode={(c) => { setText((t) => (t.trim() ? t.trim() + '\n' : '') + c); return true; }} />
        </div>
        <button className="sm primary" disabled={busy} onClick={add}>Daftarkan{splitSerials(text).length ? ` (${splitSerials(text).length})` : ''}</button>
        <div className="seg">{[['tersedia', `Tersedia (${count('tersedia')})`], ['terjual', `Terjual (${count('terjual')})`], ['rusak', `Rusak (${count('rusak')})`], ['', 'Semua']].map(([k, l]) => <button key={k} className={f === k ? 'on' : ''} onClick={() => setF(k)}>{l}</button>)}</div>
        {list === null ? <Loading /> : shown.length === 0 ? <span className="small muted">Tidak ada.</span> : <div className="list">{shown.map((r) => (
          <div className="li" key={r.id} style={{ flexWrap: 'wrap', gap: 6 }}>
            <div className="main" style={{ minWidth: 0 }}><b style={{ overflowWrap: 'anywhere' }}>{r.serial} <span className={'chip ' + SER[r.status][1]}>{SER[r.status][0]}</span></b>
              {r.status === 'terjual' && <span className="small muted">{r.sale_number} · {tgl(r.sold_date)}{r.customer ? ` · ${r.customer}` : ''}{r.warranty_until ? ` · garansi s.d. ${tgl(r.warranty_until)}` : ''}</span>}</div>
            <div className="row" style={{ flexWrap: 'nowrap' }}>
              {r.status === 'tersedia' && <><button className="sm ghost" onClick={() => setStatus(r, 'rusak')}>Rusak</button><button className="sm ghost" onClick={() => setStatus(r, 'keluar')}>Keluar</button><button className="sm ghost" style={{ color: 'var(--bad)' }} onClick={() => setStatus(r, 'hapus')}>Hapus</button></>}
              {(r.status === 'rusak' || r.status === 'keluar') && <button className="sm ghost" onClick={() => setStatus(r, 'tersedia')}>Tersedia lagi</button>}
            </div>
          </div>
        ))}</div>}
      </>}
    </Sheet>
  );
}

// ---------------------------------------------------------------- Harga & minimal pesan per supplier
export function SupplierPriceSheet({ kosId, p, units, onClose }) {
  const [rows, setRows] = useState(null);
  const [sups, setSups] = useState([]);
  const [edit, setEdit] = useState(null);
  const [busy, setBusy] = useState(false);
  const load = async () => {
    const [a, b] = await Promise.all([supabase.rpc('supplier_items_for', { p_kos: kosId, p_product: p.id }), supabase.from('contacts').select('id, name').eq('kos_id', kosId).eq('kind', 'supplier').is('archived_at', null).order('name')]);
    setRows(a.error ? [] : a.data || []); setSups(b.data || []);
  };
  useEffect(() => { load(); }, [p.id]);
  const blank = () => ({ contact_id: '', unit: units[units.length - 1]?.name || p.base_unit, price: '', moq: '', lead: '', code: '', preferred: !(rows || []).some((r) => r.preferred) });
  const open = (r) => setEdit(r ? { contact_id: r.contact_id, unit: r.unit, price: r.price != null ? angka(r.price) : r.last_price != null ? angka(r.last_price) : '', moq: numTxt(r.moq), lead: r.lead_days != null ? String(r.lead_days) : '', code: r.supplier_code || '', preferred: r.preferred, id: r.id } : blank());
  const save = async () => {
    if (!edit.contact_id) return toast('Pilih supplier.');
    setBusy(true);
    const ok = await run(() => supabase.rpc('supplier_item_save', { p_kos: kosId, p_contact: edit.contact_id, p_product: p.id, p_unit: edit.unit, p_price: edit.price.trim() ? parseRp(edit.price) : null,
      p_moq: edit.moq.trim() ? qtyNum(edit.moq) : null, p_lead: edit.lead.trim() ? parseInt(edit.lead, 10) : null, p_code: edit.code, p_preferred: edit.preferred, p_note: null }), 'Harga supplier tersimpan', errMsg);
    setBusy(false);
    if (ok) { setEdit(null); load(); }
  };
  const del = async (r) => { if (window.confirm(`Hapus harga ${r.supplier} untuk ${r.unit}?`) && await run(() => supabase.rpc('supplier_item_delete', { p_id: r.id }), 'Dihapus', errMsg)) load(); };
  if (edit) return (
    <Sheet title={`Harga supplier · ${p.name}`} onClose={() => setEdit(null)}>
      <Field label="Supplier"><select value={edit.contact_id} disabled={!!edit.id} onChange={(e) => setEdit({ ...edit, contact_id: e.target.value })}><option value="">— pilih —</option>{sups.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></Field>
      {!sups.length && <span className="small" style={{ color: 'var(--warn)' }}>Belum ada supplier. Tambahkan di Pelanggan & supplier.</span>}
      <div className="row" style={{ flexWrap: 'nowrap' }}>
        <Field label="Satuan beli"><select value={edit.unit} disabled={!!edit.id} onChange={(e) => setEdit({ ...edit, unit: e.target.value })}>{units.map((u) => <option key={u.name} value={u.name}>{u.name}{Number(u.qty) !== 1 ? ` (${angka(u.qty)} ${p.base_unit})` : ''}</option>)}</select></Field>
        <Field label={`Harga per ${edit.unit}`}><input inputMode="numeric" value={edit.price} onChange={(e) => setEdit({ ...edit, price: e.target.value })} placeholder="kesepakatan" /></Field>
      </div>
      <div className="row" style={{ flexWrap: 'nowrap' }}>
        <Field label={`Minimal pesan (${edit.unit})`} hint="MOQ, opsional"><input inputMode="decimal" value={edit.moq} onChange={(e) => setEdit({ ...edit, moq: e.target.value })} placeholder="kosong = bebas" /></Field>
        <Field label="Waktu kirim (hari)"><input inputMode="numeric" value={edit.lead} onChange={(e) => setEdit({ ...edit, lead: e.target.value.replace(/\D/g, '') })} placeholder="opsional" /></Field>
      </div>
      <Field label="Kode barang di supplier (opsional)"><input value={edit.code} maxLength={40} onChange={(e) => setEdit({ ...edit, code: e.target.value })} /></Field>
      <label className="row small" style={{ flexWrap: 'nowrap', fontWeight: 700 }}><input type="checkbox" style={{ width: 22, minHeight: 22, flex: 'none' }} checked={edit.preferred} onChange={(e) => setEdit({ ...edit, preferred: e.target.checked })} />Supplier utama untuk barang ini (dipakai Saran belanja)</label>
      <button className="cta" disabled={busy} onClick={save}>{busy ? 'Menyimpan…' : 'Simpan'}</button>
    </Sheet>
  );
  return (
    <Sheet title={`Harga supplier · ${p.name}`} onClose={onClose}>
      <span className="small muted">Bandingkan harga beli dari beberapa supplier. Harga terakhir diambil otomatis dari Belanja. Supplier utama, minimal pesan (MOQ), dan waktu kirim dipakai Saran belanja; di form Belanja harga terisi otomatis dan muncul peringatan bila di bawah minimal pesan.</span>
      {rows === null ? <Loading /> : rows.length === 0 ? <span className="small muted">Belum ada harga supplier dan belum pernah dibeli.</span> : <div className="list">{rows.map((r) => (
        <div className="li" key={r.contact_id + r.unit} style={{ flexWrap: 'wrap', gap: 6 }}>
          <div className="main" style={{ minWidth: 0 }}>
            <b style={{ overflowWrap: 'anywhere' }}>{r.supplier}{r.preferred && <span className="chip good" style={{ marginLeft: 6 }}>Utama</span>}</b>
            <span className="small">{r.price != null ? <>Sepakat <b>{rp(r.price)}</b>/{r.unit}</> : <span className="muted">Belum ada harga sepakat</span>}{r.unit_cost != null ? <span className="muted"> · {rp(r.unit_cost)}/{p.base_unit}</span> : null}</span>
            <span className="small muted">{[r.last_price != null && `terakhir ${rp(r.last_price)} (${tgl(r.last_date)})`, r.moq != null && `min. ${angka(r.moq)} ${r.unit}`, r.lead_days != null && `kirim ${r.lead_days} hari`, r.supplier_code && `kode ${r.supplier_code}`].filter(Boolean).join(' · ') || '—'}</span>
          </div>
          <div className="row" style={{ flexWrap: 'nowrap' }}><button className="sm" onClick={() => open(r)}>{r.id ? 'Ubah' : 'Simpan harga'}</button>{r.id && <button className="sm ghost" style={{ color: 'var(--bad)' }} onClick={() => del(r)}>Hapus</button>}</div>
        </div>
      ))}</div>}
      <button className="primary" onClick={() => open(null)}>+ Harga supplier</button>
    </Sheet>
  );
}

// ---------------------------------------------------------------- Nota kredit (daftar, hangus, aturan masa berlaku)
export function CreditNotes({ kos, kosId, ver, finance, settings }) {
  const [list, setList] = useState(null);
  const [all, setAll] = useState(false);
  const [days, setDays] = useState(kos?.profile?.credit_note_days ? String(kos.profile.credit_note_days) : '');
  const [busy, setBusy] = useState(false);
  const load = async () => { const { data, error } = await supabase.rpc('credit_notes_list', { p_kos: kosId, p_open: !all }); setList(error ? [] : data || []); };
  useEffect(() => { load(); }, [kosId, ver, all]);
  const forfeit = async (n) => {
    const why = window.prompt(`Hanguskan sisa nota ${n.number} (${rp(n.balance)})? Sisa menjadi pendapatan lain. Alasan:`);
    if (!why) return;
    if (await run(() => supabase.rpc('credit_note_forfeit', { p_note: n.id, p_reason: why }), 'Nota dihanguskan', errMsg)) load();
  };
  const savePol = async () => {
    setBusy(true);
    await run(() => supabase.rpc('credit_note_policy_set', { p_kos: kosId, p_days: days.trim() ? parseInt(days, 10) : null }), 'Aturan nota kredit tersimpan', errMsg);
    setBusy(false);
  };
  const open = (list || []).filter((n) => n.status === 'aktif' && Number(n.balance) > 0);
  return (
    <div className="stack">
      <section className="panel">
        <h3>Nota kredit pelanggan</h3>
        <span className="small muted">Nota kredit terbit saat retur dikembalikan sebagai saldo belanja (bukan uang). Pelanggan memakainya di Kasir: ketuk "Pakai nota kredit" lalu ketik nomornya. Sisa nota = utang toko ke pelanggan (akun Nota kredit di Pembukuan).</span>
        <div className="row between"><span>Sisa nota aktif</span><b>{rp(open.reduce((s, n) => s + Number(n.balance), 0))} · {open.length} nota</b></div>
        {settings && <div className="row" style={{ flexWrap: 'nowrap', alignItems: 'flex-end' }}>
          <Field label="Masa berlaku nota baru (hari)" hint="kosong = tanpa batas"><input inputMode="numeric" value={days} onChange={(e) => setDays(e.target.value.replace(/\D/g, ''))} placeholder="tanpa batas" /></Field>
          <button className="sm" style={{ flex: 'none' }} disabled={busy} onClick={savePol}>Simpan</button>
        </div>}
      </section>
      <div className="seg">{[[false, 'Masih ada saldo'], [true, 'Semua']].map(([k, l]) => <button key={l} className={all === k ? 'on' : ''} onClick={() => setAll(k)}>{l}</button>)}</div>
      {list === null ? <Loading /> : list.length === 0 ? <Empty title="Belum ada nota kredit" text="Saat retur, pilih pengembalian 'Nota kredit' bila pelanggan ingin menyimpan nilainya untuk belanja berikutnya." /> : (
        <DataTable rows={list} rowKey={(n) => n.id} caption="Nota kredit" pageSize={30}
          columns={[
            { key: 'number', label: 'Nomor', main: true, render: (n) => <div className="main"><b>{n.number}</b><span className="small muted">{tgl(n.issued_date)}{n.return_number ? ` · dari ${n.return_number}` : ''}</span></div> },
            { key: 'customer', label: 'Pelanggan', hide: 'tablet', render: (n) => n.customer || <span className="muted">—</span> },
            { key: 'amount', label: 'Nilai', align: 'right', render: (n) => rp(n.amount) },
            { key: 'balance', label: 'Sisa', align: 'right', render: (n) => <b>{rp(n.balance)}</b> },
            { key: 'status', label: 'Status', render: (n) => n.status === 'hangus' ? <span className="chip void">Hangus</span> : n.expired ? <span className="chip bad">Lewat masa berlaku</span> : Number(n.balance) > 0 ? <span className="chip good">Aktif{n.valid_until ? ` s.d. ${tgl(n.valid_until)}` : ''}</span> : <span className="chip">Habis</span> },
            { key: 'act', label: <span className="vh">Aksi</span>, align: 'right', render: (n) => finance && n.status === 'aktif' && Number(n.balance) > 0 ? <button className="sm ghost" onClick={() => forfeit(n)}>Hanguskan</button> : null },
          ]}
          card={(n) => <div className="stack" style={{ gap: 4 }}>
            <div className="row between" style={{ flexWrap: 'nowrap', gap: 8 }}><b>{n.number}</b><b>{rp(n.balance)}</b></div>
            <span className="small muted">{tgl(n.issued_date)} · nilai {rp(n.amount)}{n.customer ? ` · ${n.customer}` : ''}{n.return_number ? ` · dari ${n.return_number}` : ''}</span>
            <span className="small">{n.status === 'hangus' ? `Hangus ${rp(n.forfeit_amount)} · ${n.forfeit_reason || ''}` : n.expired ? 'Lewat masa berlaku' : Number(n.balance) > 0 ? `Aktif${n.valid_until ? ` s.d. ${tgl(n.valid_until)}` : ''}` : 'Saldo habis'}</span>
            {n.uses?.length > 0 && <span className="small muted">Dipakai: {n.uses.map((u) => `${u.sale} ${rp(u.amount)}${u.status === 'batal' ? ' (batal)' : ''}`).join(' · ')}</span>}
            {finance && n.status === 'aktif' && Number(n.balance) > 0 && <button className="sm ghost" style={{ alignSelf: 'flex-start' }} onClick={() => forfeit(n)}>Hanguskan sisa</button>}
          </div>} />
      )}
    </div>
  );
}

// ---------------------------------------------------------------- Laporan per merek
export function BrandReport({ kosId, from, to, ver }) {
  const [d, setD] = useState(null);
  useEffect(() => { supabase.rpc('brand_report', { p_kos: kosId, p_from: from, p_to: to }).then(({ data, error }) => setD(error ? null : data || [])); }, [kosId, from, to, ver]);
  if (!d || !d.length || (d.length === 1 && !d[0].id)) return null;
  const max = Math.max(...d.map((x) => Math.abs(Number(x.omzet)) || 0), 1);
  return (
    <section className="panel">
      <h3>Penjualan per merek</h3>
      <span className="small muted">Omzet tanpa PPN dikurangi retur; laba = omzet − modal barang. Sama dengan rumus Indikator toko.</span>
      <div className="list">{d.map((x) => (
        <div className="li" key={x.id || 'none'} style={{ flexDirection: 'column', alignItems: 'stretch', gap: 4 }}>
          <div className="row between" style={{ flexWrap: 'nowrap', gap: 8 }}><b style={{ minWidth: 0, overflowWrap: 'anywhere' }}>{x.name}</b><b style={{ whiteSpace: 'nowrap' }}>{rp(x.omzet)}</b></div>
          <div style={{ height: 6, background: 'var(--line)', borderRadius: 4 }}><div style={{ width: `${Math.max(2, (Math.abs(Number(x.omzet)) / max) * 100)}%`, height: 6, borderRadius: 4, background: 'var(--gold)' }} /></div>
          <span className="small muted">{angka(x.barang)} barang · laba {rp(x.laba)}{x.margin_pct != null ? ` · margin ${angka(x.margin_pct)}%` : ''}</span>
        </div>
      ))}</div>
    </section>
  );
}

// ---------------------------------------------------------------- Cek garansi & klaim (halaman /garansi)
const CLAIM = { diterima: ['Diterima', ''], diproses: ['Diproses', 'warn'], selesai: ['Selesai', 'good'], ditolak: ['Ditolak', 'void'] };
export function WarrantyDesk({ kosId, ver }) {
  const [q, setQ] = useState('');
  const [res, setRes] = useState(null);
  const [claims, setClaims] = useState(null);
  const [allClaims, setAllClaims] = useState(false);
  const [newClaim, setNewClaim] = useState(null);   // {serial, issue}
  const [upd, setUpd] = useState(null);             // {claim, status, resolution}
  const [busy, setBusy] = useState(false);
  const loadClaims = async () => { const { data, error } = await supabase.rpc('claims_list', { p_kos: kosId, p_open: !allClaims }); setClaims(error ? [] : data || []); };
  useEffect(() => { loadClaims(); }, [kosId, ver, allClaims]);
  const search = async (v) => {
    const t = String(v ?? q).trim();
    if (t.length < 2) return toast('Ketik minimal 2 karakter nomor seri / IMEI.');
    const { data, error } = await supabase.rpc('serial_lookup', { p_kos: kosId, p_q: t });
    if (error) return toast(errMsg(error));
    setRes(data || []);
  };
  const create = async () => {
    setBusy(true);
    let r = null;
    const ok = await run(async () => { const x = await supabase.rpc('claim_create', { p_kos: kosId, p_serial: newClaim.serial.id, p_issue: newClaim.issue }); r = x.data; return x; }, null, errMsg);
    setBusy(false);
    if (ok) { toast(`Klaim ${r.number} dicatat${r.in_warranty ? '' : ' (di luar garansi)'}`); setNewClaim(null); search(); loadClaims(); }
  };
  const update = async () => {
    setBusy(true);
    const ok = await run(() => supabase.rpc('claim_status', { p_id: upd.claim.id, p_status: upd.status, p_resolution: upd.resolution }), 'Klaim diperbarui', errMsg);
    setBusy(false);
    if (ok) { setUpd(null); loadClaims(); if (res) search(); }
  };
  const garansi = (r) => r.garansi === 'aktif' ? <span className="chip good">Garansi aktif · sisa {angka(r.days_left)} hari</span> : r.garansi === 'habis' ? <span className="chip bad">Garansi habis {tgl(r.warranty_until)}</span> : r.garansi === 'tanpa' ? <span className="chip">Tanpa garansi toko</span> : <span className="chip void">{SER[r.status]?.[0] || r.status}</span>;
  return (
    <div className="stack">
      <section className="panel">
        <h3>Cek garansi</h3>
        <div className="row" style={{ flexWrap: 'nowrap' }}>
          <input type="search" value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); search(); } }} placeholder="Nomor seri / IMEI" aria-label="Nomor seri" style={{ flex: 1 }} />
          <ScanButton onCode={(c) => { setQ(c); search(c); return true; }} />
          <button className="primary" style={{ flex: 'none' }} onClick={() => search()}>Cek</button>
        </div>
        {res !== null && (res.length === 0 ? <span className="small muted">Nomor seri tidak ditemukan.</span> : <div className="list">{res.map((r) => (
          <div className="li" key={r.id} style={{ flexDirection: 'column', alignItems: 'stretch', gap: 6 }}>
            <div className="row between" style={{ flexWrap: 'wrap', gap: 6 }}><b style={{ overflowWrap: 'anywhere' }}>{r.serial} · {r.product}</b>{garansi(r)}</div>
            {r.status === 'terjual' && <span className="small">{r.sale_number} · {tgl(r.sold_date)}{r.customer ? ` · ${r.customer}${r.phone ? ` (${r.phone})` : ''}` : ''}{r.warranty_until ? ` · s.d. ${tgl(r.warranty_until)}` : ''}</span>}
            {r.claims?.length > 0 && <span className="small muted">Klaim: {r.claims.map((c) => `${c.number} ${CLAIM[c.status][0]}`).join(' · ')}</span>}
            <button className="sm" style={{ alignSelf: 'flex-start' }} onClick={() => setNewClaim({ serial: r, issue: '' })}>+ Catat klaim</button>
          </div>
        ))}</div>)}
      </section>
      <div className="row between"><h3 style={{ margin: 0 }}>Klaim garansi</h3><div className="seg">{[[false, 'Berjalan'], [true, 'Semua']].map(([k, l]) => <button key={l} className={allClaims === k ? 'on' : ''} onClick={() => setAllClaims(k)}>{l}</button>)}</div></div>
      {claims === null ? <Loading /> : claims.length === 0 ? <Empty title="Belum ada klaim" text="Cek nomor seri di atas, lalu Catat klaim saat pelanggan datang membawa barang bermasalah." /> : <div className="list">{claims.map((c) => (
        <div className="li" key={c.id} style={{ flexDirection: 'column', alignItems: 'stretch', gap: 4 }}>
          <div className="row between" style={{ flexWrap: 'wrap', gap: 6 }}><b>{c.number} · {c.product}</b><span className={'chip ' + CLAIM[c.status][1]}>{CLAIM[c.status][0]}</span></div>
          <span className="small">{c.serial} · {tgl(c.claim_date)}{c.customer ? ` · ${c.customer}` : ''} · {c.in_warranty ? 'dalam garansi' : 'di luar garansi'}</span>
          <span className="small muted" style={{ overflowWrap: 'anywhere' }}>{c.issue}{c.resolution ? ` → ${c.resolution}` : ''}</span>
          {['diterima', 'diproses'].includes(c.status) && <button className="sm" style={{ alignSelf: 'flex-start' }} onClick={() => setUpd({ claim: c, status: c.status === 'diterima' ? 'diproses' : 'selesai', resolution: '' })}>Perbarui</button>}
        </div>
      ))}</div>}
      {newClaim && <Sheet title={`Klaim · ${newClaim.serial.serial}`} onClose={() => setNewClaim(null)}>
        <span className="small">{newClaim.serial.product} · {newClaim.serial.garansi === 'aktif' ? 'masih dalam garansi' : 'di luar garansi toko — klaim tetap bisa dicatat'}</span>
        <Field label="Keluhan / kerusakan"><textarea rows={3} value={newClaim.issue} onChange={(e) => setNewClaim({ ...newClaim, issue: e.target.value })} placeholder="mis. layar bergaris, tidak bisa dicas" /></Field>
        <button className="cta" disabled={busy || newClaim.issue.trim().length < 3} onClick={create}>Catat klaim</button>
        <span className="small muted">Bila unit diganti baru: lakukan Tukar barang dari detail penjualannya agar stok & nomor seri ikut benar.</span>
      </Sheet>}
      {upd && <Sheet title={`Perbarui ${upd.claim.number}`} onClose={() => setUpd(null)}>
        <div className="seg">{[['diproses', 'Diproses'], ['selesai', 'Selesai'], ['ditolak', 'Ditolak']].map(([k, l]) => <button key={k} className={upd.status === k ? 'on' : ''} onClick={() => setUpd({ ...upd, status: k })}>{l}</button>)}</div>
        <Field label={upd.status === 'diproses' ? 'Catatan (opsional)' : 'Hasil'}><textarea rows={2} value={upd.resolution} onChange={(e) => setUpd({ ...upd, resolution: e.target.value })} placeholder={upd.status === 'ditolak' ? 'mis. rusak karena jatuh/terkena air' : 'mis. diperbaiki servis resmi, diganti unit baru'} /></Field>
        <button className="cta" disabled={busy} onClick={update}>Simpan</button>
      </Sheet>}
    </div>
  );
}

