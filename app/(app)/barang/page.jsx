'use client';
import IsianTambahan from '@/components/IsianTambahan';
import { useBaru } from '@/lib/useBaru';
import { withApproval } from '@/lib/approval';
import Link from 'next/link';
import { ScanButton } from '@/components/BarcodeScan';
import { moduleOn, multiLoc } from '@/lib/business';
import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { useKos } from '@/components/KosProvider';
import PageHelp from '@/components/PageHelp';
import LokasiBar from '@/components/LokasiBar';
import EntityPhotos from '@/components/media/EntityPhotos';
import ListThumb, { useThumbs } from '@/components/media/ListThumb';
import { Sheet, Field, Loading, Empty, Tile, run, toast } from '@/components/ui';
import { rp, angka, parseRp, errMsg, tgl } from '@/lib/format';
import { qtyNum, unitsOf, stockText, isLow, MOVE } from '@/lib/retail';
import { isiNum, isiText, measure, toBase, resolveUnit, contentOf, contentChoices, presetsFor, crossDim, unitProblem, BASE_PRESETS } from '@/lib/units';
import Kedaluwarsa from '@/components/Kedaluwarsa';

// Muat barang + satuan untuk bisnis aktif
function useProducts(kosId, ver, multi) {
  const [d, setD] = useState(null);
  const [err, setErr] = useState(null);
  const load = useCallback(async () => {
    const [p, u, l] = await Promise.all([
      supabase.from('products').select('*').eq('kos_id', kosId).order('name'),
      supabase.from('product_units').select('*').eq('kos_id', kosId),
      multi ? supabase.rpc('stock_levels_list', { p_kos: kosId }) : Promise.resolve({ data: [] }),
    ]);
    if (p.error || u.error) return setErr(errMsg(p.error || u.error));
    setD({ products: p.data, units: u.data, levels: l.data || [] });
  }, [kosId, multi]);
  useEffect(() => { load(); }, [load, ver]);
  return { d, err, reload: load };
}

export default function Barang() {
  const { kosId, ver, kos } = useKos();
  const multi = multiLoc(kos);
  const { d, err, reload } = useProducts(kosId, ver, multi);
  const [q, setQ] = useState('');
  const [f, setF] = useState('aktif');
  useEffect(() => { try { if (new URLSearchParams(window.location.search).get('tab') === 'kedaluwarsa') setF('kedaluwarsa'); } catch {} }, []);
  const [edit, setEdit] = useState(null);   // null | 'new' | product
  useBaru(() => setEdit('new'));
  const [adj, setAdj] = useState(null);
  const thumbs = useThumbs(kosId, 'product', `${ver}:${edit ? 1 : 0}`);
  if (err) return <div className="notice bad">{err.includes('products') ? 'Database sedang diperbarui. Coba lagi beberapa menit lagi.' : err}</div>;
  if (!d) return <Loading />;

  const bahan = kos?.business_type === 'jasa'; // bisnis jasa: menu ini untuk bahan operasional (tanpa harga jual)
  const locs = multi ? kos.locs.list : [];
  const locName = (id) => locs.find((b) => b.id === id)?.name || 'lokasi lain';
  const here = (p) => Number(d.levels.find((l) => l.product_id === p.id && l.branch_id === kos.locs?.current)?.qty || 0);
  const perLoc = (p) => d.levels.filter((l) => l.product_id === p.id);
  const active = d.products.filter((p) => p.active);
  const low = active.filter(isLow);
  const value = active.reduce((s, p) => s + Math.max(0, Number(p.stock)) * Number(p.cost), 0);
  const term = q.trim().toLowerCase();
  const shown = d.products.filter((p) => (f === 'arsip' ? !p.active : p.active) && (f !== 'menipis' || isLow(p))
    && (!term || term.split(/\s+/).every((w) => p.name.toLowerCase().includes(w)) || (p.sku || '').toLowerCase() === term
      || d.units.some((u) => u.product_id === p.id && (u.barcode || '').toLowerCase() === term)));

  return (
    <div className="stack">
      <div className="row between"><div className="row"><h2>{bahan ? 'Bahan & stok' : 'Barang & stok'}</h2><PageHelp page={bahan ? 'bahan' : 'barang'} /></div><div className="row">{moduleOn(kos, 'r_label') && <Link href="/label"><button className="sm">Cetak label</button></Link>}{multi && <Link href="/mutasi"><button className="sm">Mutasi stok</button></Link>}<button className="primary" onClick={() => setEdit('new')}>{bahan ? '+ Tambah bahan' : '+ Tambah barang'}</button></div></div>
      <LokasiBar note="Hitung ulang, rusak, dan koreksi stok dicatat di lokasi ini. Pindahkan barang antar lokasi lewat menu Mutasi stok." />
      <div className="grid">
        <Tile label={bahan ? 'Bahan aktif' : 'Barang aktif'} value={angka(active.length)} />
        <Tile label="Nilai stok (harga modal)" value={rp(value)} sub={active.some((p) => !(p.cost > 0)) ? 'ada barang tanpa harga modal' : null} />
        <Tile label="Stok menipis" value={angka(low.length)} tone={low.length ? 'bad' : ''} sub="di bawah batas minimum" />
      </div>
      {d.products.length > 0 && <>
        <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cari nama, kode, atau barcode" aria-label="Cari barang" />
        <div className="seg">
          {[['aktif', `Semua (${active.length})`], ['menipis', `Menipis (${low.length})`], ...(moduleOn(kos, 'r_batch') ? [['kedaluwarsa', 'Kedaluwarsa']] : []), ['arsip', 'Diarsipkan']].map(([k, l]) => <button key={k} className={f === k ? 'on' : ''} onClick={() => setF(k)}>{l}</button>)}
        </div>
      </>}
      {f === 'kedaluwarsa' ? <Kedaluwarsa kosId={kosId} ver={ver} multi={multi} tracked={active.some((p) => p.track_expiry)} onChanged={reload} /> : d.products.length === 0 ? (
        <Empty title={bahan ? 'Belum ada bahan' : 'Belum ada barang'} text={bahan ? 'Catat bahan operasional (deterjen, pewangi, plastik, hanger) agar stok dan biaya bahan terpantau. Pemakaian dicatat lewat tombol Stok › Pemakaian bahan.' : 'Tambahkan barang yang dijual. Satu barang bisa punya beberapa satuan, misalnya pcs dan dus isi 40, masing-masing dengan harga eceran dan grosir.'}>
          <button className="primary" onClick={() => setEdit('new')}>+ Tambah barang pertama</button>
        </Empty>
      ) : shown.length === 0 ? <Empty title="Tidak ada yang cocok" /> : (
        <section className="panel"><div className="list">{shown.map((p) => {
          const us = unitsOf(p, d.units);
          return (
            <div className="li" key={p.id} style={{ alignItems: 'flex-start', flexWrap: 'wrap', rowGap: 6 }}>
              <div className="row" style={{ flexWrap: 'nowrap', gap: 10, alignItems: 'flex-start', flex: '1 1 220px', minWidth: 0 }}>{!bahan && thumbs[p.id] && <ListThumb path={thumbs[p.id]} size={48} />}
              <div className="main">
                <b>{p.name} {isLow(p) && <span className="chip bad">Menipis</span>}{p.track_expiry && <span className="chip" style={{ marginLeft: 4 }}>Exp</span>}</b>
                {p.sku && <span className="small muted">Kode {p.sku}</span>}
                <span className="small">{multi ? <>Di sini <b>{stockText(here(p), us, p.base_unit)}</b> · total {stockText(p.stock, us, p.base_unit)}</> : <>Stok <b>{stockText(p.stock, us, p.base_unit)}</b></>} · modal {p.cost > 0 ? `${rp(p.cost)}/${p.base_unit}` : <span style={{ color: 'var(--warn)' }}>belum diisi</span>}</span>
                {us.some((u, k) => k > 0 && unitProblem(u, p.base_unit)) && <span className="small" style={{ color: 'var(--bad)' }}>Periksa satuan: {us.filter((u, k) => k > 0 && unitProblem(u, p.base_unit)).map((u) => unitProblem(u, p.base_unit)).join(' ')} Buka Ubah untuk memperbaiki.</span>}
                <span className="small muted">{us.map((u) => bahan ? `${u.name}${Number(u.qty) !== 1 ? ` (${angka(u.qty)} ${p.base_unit})` : ''}` : `${u.name}${Number(u.qty) !== 1 ? ` (${angka(u.qty)} ${p.base_unit})` : ''} ${u.price_retail > 0 ? rp(u.price_retail) : 'harga belum diisi'}${u.price_wholesale > 0 ? ` · grosir ${rp(u.price_wholesale)}` : ''}`).join(' · ')}</span>
              </div></div>
              <div className="row" style={{ flexWrap: 'nowrap', marginLeft: 'auto' }}>
                {p.active && <button className="sm ghost" aria-pressed={!!p.favorite} title={p.favorite ? 'Hapus dari tombol cepat Kasir' : 'Jadikan tombol cepat di Kasir'} aria-label={p.favorite ? `Hapus ${p.name} dari tombol cepat` : `Jadikan ${p.name} tombol cepat`}
                  onClick={async () => { if (await run(() => supabase.rpc('product_set_favorite', { p_product: p.id, p_on: !p.favorite }), p.favorite ? 'Dihapus dari tombol cepat' : 'Jadi tombol cepat di Kasir', errMsg)) reload(); }}
                  style={{ fontSize: 18, color: p.favorite ? 'var(--att)' : 'var(--muted)' }}>{p.favorite ? '★' : '☆'}</button>}
                {!bahan && kos?.profile?.tax?.aktif && <button className="sm ghost" aria-pressed={!!p.tax_exempt} title="Tandai barang yang tidak dikenai PPN"
                  onClick={async () => { if (await run(() => supabase.rpc('product_set_tax', { p_product: p.id, p_exempt: !p.tax_exempt }), p.tax_exempt ? 'Barang dikenai PPN lagi' : 'Barang ditandai bebas PPN', errMsg)) reload(); }}>{p.tax_exempt ? 'Bebas PPN' : 'Kena PPN'}</button>}
                <button className="sm" onClick={() => setAdj(p)}>Stok</button>
                <button className="sm ghost" onClick={() => setEdit(p)}>Ubah</button>
              </div>
            </div>
          );
        })}</div></section>
      )}
      {edit && <ProductForm bahan={bahan} batch={moduleOn(kos, 'r_batch')} kosId={kosId} p={edit === 'new' ? null : edit} units={edit === 'new' ? [] : unitsOf(edit, d.units)} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); reload(); }} />}
      {adj && <StockSheet bahan={bahan} p={adj} units={unitsOf(adj, d.units)} loc={multi ? { here: here(adj), name: locName(kos.locs.current), rows: perLoc(adj).map((l) => [locName(l.branch_id), l.qty]), names: locName } : null} onClose={() => setAdj(null)} onSaved={() => { setAdj(null); reload(); }} />}
    </div>
  );
}

const blankUnit = () => ({ name: '', content_qty: '', content_unit: '', price_retail: '', price_wholesale: '', barcode: '' });
const money = (v) => (Number(v) > 0 ? angka(v) : '');
const kgText = (v) => (Number(v) > 0 ? String(Number(v)).replace('.', ',') : '');

function ProductForm({ kosId, p, units, bahan, batch, onClose, onSaved }) {
  const [name, setName] = useState(p?.name || '');
  const [base, setBaseRaw] = useState(p?.base_unit || '');
  const [cost, setCost] = useState(money(p?.cost));
  const [min, setMin] = useState(p && Number(p.min_stock) > 0 ? String(Number(p.min_stock)) : '');
  const [stock, setStock] = useState('');
  const [density, setDensity] = useState(kgText(p?.density));
  const [rows, setRows] = useState(units.length
    ? units.map((u, i) => ({ name: u.name, ...(i === 0 ? { content_qty: '', content_unit: '' } : contentOf(u, p.base_unit)), price_retail: money(u.price_retail), price_wholesale: money(u.price_wholesale), barcode: u.barcode || '' }))
    : [blankUnit()]);
  const [sku, setSku] = useState(p?.sku || '');
  const [track, setTrack] = useState(Boolean(p?.track_expiry));
  const [lead, setLead] = useState(p?.lead_days != null ? String(p.lead_days) : '');
  const [busy, setBusy] = useState(false);
  const b = base.trim();
  const baseLocked = Boolean(p) && Number(p.stock) !== 0;
  const densN = isiNum(density) > 0 ? isiNum(density) : null;
  const set = (i, patch) => setRows(rows.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  // satuan utama berganti (barang baru): isi yang ditulis dalam satuan utama lama ikut pindah
  const setBase = (v) => { const old = b.toLowerCase(); setBaseRaw(v); setRows(rows.map((r) => (r.content_unit && r.content_unit.toLowerCase() === old ? { ...r, content_unit: '' } : r))); };
  // nama berupa ukuran ("Kemasan 250 gram", "½ kg") → isi terisi otomatis
  const setUnitName = (i, v) => { const m = measure(v); const r = rows[i]; set(i, { name: v, ...(m && (r.auto || !String(r.content_qty).trim()) ? { content_qty: isiText(m.n), content_unit: m.unit.toLowerCase() === b.toLowerCase() ? '' : m.unit, auto: true } : {}) }); };
  const addPreset = (nm, q, u) => setRows([...rows, { ...blankUnit(), name: nm, content_qty: q == null ? '' : isiText(q), content_unit: String(u).toLowerCase() === b.toLowerCase() ? '' : u, auto: true }]);
  const costN = parseRp(cost);
  const unitWord = /^(pcs|kg|gram|gr|g|liter|ltr|l|ml|ons|bungkus|dus|pak|renteng|botol|sachet|karung|lusin)$/i.test(sku.trim());

  // hitung isi tiap baris persis seperti server (baris sebelumnya bisa dipakai sebagai satuan isi)
  const calc = [];
  rows.forEach((r, i) => {
    if (i === 0) return calc.push({ qty: 1 });
    if (!String(r.name).trim() && !String(r.content_qty).trim()) return calc.push({ empty: true });
    calc.push(resolveUnit({ ...r, content_unit: r.content_unit || b }, b, densN, rows.slice(0, i).map((x, j) => ({ name: j === 0 ? b : x.name, _qty: calc[j]?.qty }))));
  });
  const needDensity = calc.some((c) => c.needDensity) || densN != null || rows.some((r, i) => i > 0 && crossDim(r.content_unit || b, b));

  const save = async () => {
    if (!name.trim()) return toast('Isi nama barang.');
    if (!b) return toast('Pilih atau tulis satuan utama (mis. pcs, kg, liter).');
    const bad = calc.find((c, i) => i > 0 && c.error);
    if (bad) return toast(bad.error);
    const us = rows.map((r, i) => (i === 0
      ? { name: b, price_retail: parseRp(r.price_retail), price_wholesale: parseRp(r.price_wholesale), barcode: (r.barcode || '').trim() || null }
      : { name: r.name.trim(), content_qty: isiNum(r.content_qty), content_unit: (r.content_unit || b).trim(), price_retail: parseRp(r.price_retail), price_wholesale: parseRp(r.price_wholesale), barcode: (r.barcode || '').trim() || null }))
      .filter((u, i) => i === 0 || !calc[i].empty);
    const st = stock.trim() ? qtyNum(stock) : 0;
    if (!p && !(st >= 0)) return toast('Stok awal tidak valid.');
    setBusy(true);
    let pid = p?.id || null;
    const ok = await run(async () => { const r = await supabase.rpc('product_save', { p_kos: kosId, p_id: p?.id || null, p_name: name, p_base: b, p_cost: costN, p_min: min.trim() ? qtyNum(min) || 0 : 0, p_units: us, p_initial_stock: p ? 0 : st, p_sku: sku.trim() || null, p_density: densN }); if (r.data) pid = r.data; return r; }, p ? 'Barang diperbarui' : 'Barang ditambahkan', errMsg);
    const leadN = lead.trim() === '' ? null : parseInt(lead, 10);
    if (ok && pid && (track !== Boolean(p?.track_expiry) || leadN !== (p?.lead_days ?? null))) {
      await run(() => supabase.rpc('product_set_tracking', { p_product: pid, p_track: track, p_lead_days: Number.isFinite(leadN) ? leadN : null }), track && !p?.track_expiry ? 'Tanggal kedaluwarsa dicatat mulai sekarang' : null, errMsg);
    }
    setBusy(false);
    if (ok) onSaved();
  };
  const archive = async () => {
    if (await run(() => supabase.rpc('product_set_active', { p_product: p.id, p_active: !p.active }), p.active ? 'Barang diarsipkan' : 'Barang aktif lagi', errMsg)) onSaved();
  };
  const presets = presetsFor(b).filter(([nm]) => !rows.some((r, i) => i > 0 && String(r.name).trim().toLowerCase() === nm.toLowerCase()));

  return (
    <Sheet title={p ? 'Ubah barang' : 'Tambah barang'} onClose={onClose}>
      <Field label={bahan ? 'Nama bahan' : 'Nama barang'}><input value={name} onChange={(e) => setName(e.target.value)} placeholder={bahan ? 'mis. Deterjen cair' : 'mis. Gula pasir'} /></Field>
      {p && !bahan && <EntityPhotos kosId={kosId} entity="product" entityId={p.id} category="produk" title="Foto barang" max={6} hint="Opsional. Foto utama tampil di katalog halaman bisnis." />}

      <div className="unitbox" style={{ gap: 8 }}>
        <Field label="Satuan utama" hint="dasar stok & harga modal — satuan terkecil yang Anda hitung"><input value={base} maxLength={20} disabled={baseLocked} placeholder="pilih di bawah atau ketik" onChange={(e) => setBase(e.target.value)} /></Field>
        {!baseLocked && <div className="row" style={{ flexWrap: 'wrap', gap: 6 }}>{BASE_PRESETS.map((x) => <button key={x} className={'sm' + (b.toLowerCase() === x ? ' primary' : '')} onClick={() => setBase(x)}>{x}</button>)}</div>}
        {baseLocked && <span className="small muted">Satuan utama tidak bisa diganti karena sudah ada stok — stok, modal, dan riwayat tercatat dalam {p.base_unit}. Tambahkan satuan lain sebagai satuan jual di bawah.</span>}
        <div className="row">
          <Field label={`Harga modal per ${b || 'satuan'}`} hint="harga beli rata-rata"><input inputMode="numeric" value={cost} onChange={(e) => setCost(e.target.value)} placeholder="mis. 12000" /></Field>
          {!p && <Field label={`Stok sekarang (${b || 'satuan'})`}><input inputMode="decimal" value={stock} onChange={(e) => setStock(e.target.value)} placeholder="0" /></Field>}
        </div>
        {!bahan && <div className="row">
          <Field label={`Harga eceran per ${b || 'satuan'}`}><input inputMode="numeric" value={rows[0].price_retail} onChange={(e) => set(0, { price_retail: e.target.value })} /></Field>
          <Field label="Harga grosir"><input inputMode="numeric" value={rows[0].price_wholesale} onChange={(e) => set(0, { price_wholesale: e.target.value })} placeholder="boleh kosong" /></Field>
        </div>}
        {!bahan && <div className="row" style={{ alignItems: 'flex-end' }}>
          <Field label={`Barcode ${b || 'satuan'} (opsional)`}><input inputMode="numeric" value={rows[0].barcode || ''} maxLength={40} onChange={(e) => set(0, { barcode: e.target.value })} onKeyDown={(e) => { if (e.key === 'Enter') e.preventDefault(); }} placeholder="scan / ketik angka" /></Field>
          <ScanButton onCode={(c) => set(0, { barcode: c })} />
        </div>}
      </div>

      <span className="label">{bahan ? 'Satuan beli / pakai lain' : 'Satuan jual lain'}</span>
      <p className="small muted" style={{ margin: 0 }}>Tulis nama dan isinya saja — sistem menghitung sendiri ke {b || 'satuan utama'}. Contoh: Kemasan 250 gram, Dus isi 24 botol, Karton isi 2 Dus.</p>
      {rows.map((r, i) => {
        if (i === 0) return null;
        const c = calc[i];
        const qn = c.qty || 0;
        const pr = parseRp(r.price_retail);
        const modal = costN * qn;
        const nm = String(r.name).trim() || 'satuan ini';
        return (
          <div className="unitbox" key={i}>
            <Field label="Nama satuan / kemasan"><input value={r.name} maxLength={20} onChange={(e) => setUnitName(i, e.target.value)} placeholder="mis. Dus, Kemasan 250 gram" /></Field>
            <div className="row" style={{ flexWrap: 'nowrap' }}>
              <Field label={`Isi 1 ${nm}`}><input inputMode="decimal" value={r.content_qty} onChange={(e) => set(i, { content_qty: e.target.value, auto: false })} placeholder="mis. 24" /></Field>
              <Field label="Satuan isi"><select value={r.content_unit || ''} onChange={(e) => set(i, { content_unit: e.target.value, auto: false })}>
                {contentChoices(b, rows, i).map((x, k) => <option key={x} value={k === 0 ? '' : x}>{x}{k === 0 ? ' (utama)' : ''}</option>)}
                {r.content_unit && !contentChoices(b, rows, i).some((x) => x.toLowerCase() === r.content_unit.toLowerCase()) && <option value={r.content_unit}>{r.content_unit}</option>}
              </select></Field>
            </div>
            {c.error ? <p className="small" style={{ margin: 0, color: 'var(--bad)' }}>{c.error}</p>
              : qn > 0 ? <p className="small" style={{ margin: 0 }}>Hasil: <b>1 {nm} = {angka(qn)} {b}</b>{!bahan && costN > 0 ? <span className="muted"> · modal {rp(modal)}</span> : null}{!bahan && costN > 0 && pr > 0 ? <span style={{ color: pr >= modal ? 'var(--good)' : 'var(--bad)' }}> · {pr >= modal ? 'untung' : 'RUGI'} {rp(Math.abs(pr - modal))}</span> : null}</p> : null}
            {!bahan && <div className="row">
              <Field label="Harga eceran"><input inputMode="numeric" value={r.price_retail} onChange={(e) => set(i, { price_retail: e.target.value })} /></Field>
              <Field label="Harga grosir"><input inputMode="numeric" value={r.price_wholesale} onChange={(e) => set(i, { price_wholesale: e.target.value })} placeholder="boleh kosong" /></Field>
            </div>}
            {!bahan && <div className="row" style={{ alignItems: 'flex-end' }}>
              <Field label={`Barcode ${nm} (opsional)`}><input inputMode="numeric" value={r.barcode || ''} maxLength={40} onChange={(e) => set(i, { barcode: e.target.value })} onKeyDown={(e) => { if (e.key === 'Enter') e.preventDefault(); }} placeholder="scan / ketik angka" /></Field>
              <ScanButton onCode={(code) => set(i, { barcode: code })} />
            </div>}
            <button className="sm ghost" onClick={() => setRows(rows.filter((_, j) => j !== i))}>Hapus satuan ini</button>
          </div>
        );
      })}
      {needDensity && <div className="unitbox" style={{ gap: 6 }}>
        <Field label="Berat 1 liter barang ini (kg)" hint="hanya untuk mengubah liter ↔ kg; mis. minyak goreng ± 0,9"><input inputMode="decimal" value={density} onChange={(e) => setDensity(e.target.value)} placeholder="kosong = tidak dikonversi" /></Field>
        <span className="small muted">Berat dan volume tidak pernah dikonversi otomatis. Isi angka ini hanya bila Anda tahu berat 1 liternya (timbang sendiri).</span>
      </div>}
      {rows.length < 8 && b && <div className="stack" style={{ gap: 6 }}>
        <div className="row" style={{ flexWrap: 'wrap', gap: 6 }}>
          {presets.slice(0, 8).map(([nm, q, u]) => <button key={nm} className="sm" onClick={() => addPreset(nm, q, u)}>+ {nm}</button>)}
          <button className="sm primary" onClick={() => setRows([...rows, blankUnit()])}>+ Satuan lain</button>
        </div>
      </div>}

      <Field label="Kode barang (opsional)" hint="kode sendiri, mis. GL-1"><input value={sku} maxLength={40} autoCapitalize="characters" onChange={(e) => setSku(e.target.value)} /></Field>
      {unitWord && <p className="small" style={{ margin: 0, color: 'var(--warn, var(--bad))' }}>Kode barang berisi "{sku.trim()}" — kalau maksudnya satuan, isi di <b>Satuan utama</b>. Kode barang hanya penanda sendiri dan boleh kosong.</p>}
      <Field label={`Peringatan stok minimum (${b || 'satuan'})`}><input inputMode="decimal" value={min} onChange={(e) => setMin(e.target.value)} placeholder="kosongkan jika tidak perlu" /></Field>
      {batch && <div className="unitbox" style={{ gap: 6 }}>
        <label className="row small" style={{ flexWrap: 'nowrap', fontWeight: 700 }}><input type="checkbox" style={{ width: 22, minHeight: 22, flex: 'none' }} checked={track} onChange={(e) => setTrack(e.target.checked)} />Catat tanggal kedaluwarsa (susu, roti, obat, makanan…)</label>
        {track && <span className="small muted">Tanggal diisi saat belanja/terima barang. Stok keluar otomatis dari yang paling cepat kedaluwarsa; daftarnya di Barang › Kedaluwarsa.{p && !p.track_expiry && Number(p.stock) > 0 ? ' Stok yang ada sekarang dicatat sebagai "tanggal belum diisi" — isi tanggalnya di tab Kedaluwarsa.' : ''}</span>}
        <Field label="Waktu tunggu dari supplier (hari, opsional)" hint="untuk saran belanja; kosong = 3 hari"><input inputMode="numeric" value={lead} onChange={(e) => setLead(e.target.value.replace(/\D/g, ''))} placeholder="3" /></Field>
      </div>}
      <button className="cta" onClick={save} disabled={busy}>{busy ? 'Menyimpan…' : p ? 'Simpan perubahan' : 'Simpan barang'}</button>
      {p?.id && <IsianTambahan entity="product" id={p.id} extra={p.extra} area="stock" />}
      {p && <p className="small muted" style={{ margin: 0 }}>Stok diubah lewat tombol Stok, supaya setiap selisih tercatat.</p>}
      {p && <button className="ghost" onClick={archive}>{p.active ? 'Arsipkan barang (tidak dijual lagi)' : 'Aktifkan lagi'}</button>}
    </Sheet>
  );
}

const PAKAI = ['pakai', 'Pemakaian bahan', 'Jumlah yang terpakai'];
const REASONS = [
  ['opname', 'Stok opname (hitung ulang)', 'Jumlah fisik hasil hitung'],
  ['rusak', 'Barang rusak', 'Jumlah yang rusak'],
  ['kedaluwarsa', 'Kedaluwarsa', 'Jumlah yang kedaluwarsa'],
  ['koreksi', 'Koreksi (tambah/kurang)', 'Jumlah'],
];

function StockSheet({ p, units, loc, bahan, onClose, onSaved }) {
  const reasons = bahan ? [PAKAI, ...REASONS] : REASONS;
  const [reason, setReason] = useState(bahan ? 'pakai' : 'opname');
  const [unit, setUnit] = useState(units[0]?.name || p.base_unit);
  const [qty, setQty] = useState('');
  const [note, setNote] = useState('');
  const [dir, setDir] = useState(1);
  const [hist, setHist] = useState(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    supabase.from('stock_moves').select('kind,delta,stock_after,note,created_at,branch_id').eq('product_id', p.id).order('created_at', { ascending: false }).limit(15)
      .then(({ data }) => setHist(data || []));
  }, [p.id]);
  const mult = Number(units.find((u) => u.name === unit)?.qty || 1);
  const r = reasons.find((x) => x[0] === reason);
  const n = qtyNum(qty);
  const base = isFinite(n) ? toBase(Math.abs(n), mult) * (reason === 'koreksi' ? dir : 1) : NaN;
  const cur = loc ? Number(loc.here) : Number(p.stock); // stok di lokasi kerja (bila ada beberapa lokasi)
  const delta = reason === 'opname' ? base - cur : reason === 'koreksi' ? base : -base;

  const save = async () => {
    if (!isFinite(base) || (reason !== 'koreksi' && base < 0) || (reason !== 'opname' && base === 0)) return toast('Isi jumlahnya.');
    if (reason === 'opname' && delta === 0) { toast('Tidak ada selisih.'); return onClose(); }
    setBusy(true);
    const ok = await withApproval(() => supabase.rpc('stock_adjust', { p_product: p.id, p_reason: reason, p_qty: base, p_note: note }), `Stok ${p.name} ${delta > 0 ? '+' : ''}${angka(delta)} ${p.base_unit}`,
      { kos: p.kos_id, action: 'penyesuaian_stok', payload: { product_id: p.id, reason, qty: base, note }, reason: note || reason });
    setBusy(false);
    if (ok) onSaved();
  };

  return (
    <Sheet title={`Stok · ${p.name}`} onClose={onClose}>
      {loc ? <>
        <p style={{ margin: 0 }}>Di {loc.name}: <b>{stockText(cur, units, p.base_unit)}</b> · total semua lokasi {stockText(p.stock, units, p.base_unit)}</p>
        {loc.rows.length > 0 && <span className="small muted">{loc.rows.map(([n, q]) => `${n} ${angka(q)} ${p.base_unit}`).join(' · ')}</span>}
      </> : <p style={{ margin: 0 }}>Tercatat <b>{stockText(p.stock, units, p.base_unit)}</b>{units.length > 1 ? ` (${angka(p.stock)} ${p.base_unit})` : ''}</p>}
      <Field label="Alasan"><select value={reason} onChange={(e) => setReason(e.target.value)}>{reasons.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></Field>
      {reason === 'koreksi' && <div className="seg">{[[1, 'Tambah stok'], [-1, 'Kurangi stok']].map(([v, l]) => <button key={v} className={dir === v ? 'on' : ''} onClick={() => setDir(v)}>{l}</button>)}</div>}
      <div className="row">
        <Field label={r[2]}><input inputMode="decimal" value={qty} onChange={(e) => setQty(e.target.value)} /></Field>
        {units.length > 1 && <Field label="Satuan"><select value={unit} onChange={(e) => setUnit(e.target.value)}>{units.map((u) => <option key={u.name} value={u.name}>{u.name}</option>)}</select></Field>}
      </div>
      {isFinite(base) && qty.trim() !== '' && <p className="small" style={{ margin: 0 }}>Perubahan: <b>{delta > 0 ? '+' : ''}{angka(delta)} {p.base_unit}</b> → stok{loc ? ` di ${loc.name}` : ''} menjadi {stockText(cur + delta, units, p.base_unit)}{p.cost > 0 ? ` · nilai ${rp(delta * p.cost)}` : ''}</p>}
      <Field label="Catatan (opsional)"><input value={note} onChange={(e) => setNote(e.target.value)} placeholder="mis. dimakan tikus, hitung ulang akhir bulan" /></Field>
      <button className="cta" onClick={save} disabled={busy}>{busy ? 'Menyimpan…' : 'Simpan'}</button>
      <span className="label">Riwayat stok</span>
      {hist === null ? <p className="small muted" style={{ margin: 0 }}>Memuat…</p> : hist.length === 0 ? <p className="small muted" style={{ margin: 0 }}>Belum ada perubahan stok.</p> : (
        <div className="list">{hist.map((h, i) => (
          <div className="li" key={i}>
            <div className="main"><b className="small">{MOVE[h.kind] || h.kind}</b><span className="small muted">{tgl(String(h.created_at).slice(0, 10))}{loc && h.branch_id ? ` · ${loc.names(h.branch_id)}` : ''}{h.note ? ` · ${h.note}` : ''}</span></div>
            <span className="small" style={{ textAlign: 'right' }}><b style={{ color: Number(h.delta) < 0 ? 'var(--bad)' : 'var(--good)' }}>{Number(h.delta) > 0 ? '+' : ''}{angka(h.delta)}</b><br /><span className="muted">{h.kind === 'transfer' ? 'total tetap' : `total ${angka(h.stock_after)}`}</span></span>
          </div>
        ))}</div>
      )}
    </Sheet>
  );
}
