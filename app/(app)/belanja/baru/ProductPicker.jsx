'use client';
import { useEffect, useMemo, useState } from 'react';
import NavIcon from '@/components/NavIcon';
import { ScanButton } from '@/components/BarcodeScan';
import ListThumb, { useThumbs } from '@/components/media/ListThumb';
import { Field, toast } from '@/components/ui';
import { supabase } from '@/lib/supabase';
import { angka, rp, parseRp, tgl } from '@/lib/format';
import { qtyNum, unitsOf } from '@/lib/retail';
import formStyles from '../../barang/product-form.module.css';
import css from './picker.module.css';

const PAGE = 24;
const reason = (r) => r.action === 'schedule' ? `Jadwalkan ${tgl(r.order_date)}`
  : Number(r.available) <= 0 ? 'Stok tersedia habis atau negatif'
  : r.stockout_date ? `Diperkirakan habis ${tgl(r.stockout_date)}` : 'Stok diperkirakan di bawah minimum';
const validPrice = (price) => /\d/.test(String(price)) && !String(price).includes('-');

export default function ProductPicker({ kosId, retail, version, supplier, d, initial, initialSearch, defaults, priceFor, onBack, onNew, onApply }) {
  const [selected, setSelected] = useState(initial || {});
  const [query, setQuery] = useState(initialSearch || '');
  const [category, setCategory] = useState('');
  const [sort, setSort] = useState('asc');
  const [limit, setLimit] = useState(PAGE);
  const [allRec, setAllRec] = useState(false);
  const [focusSelected, setFocusSelected] = useState(false);
  const [guidance, setGuidance] = useState(null);
  const thumbs = useThumbs(kosId, 'product', version);
  useEffect(() => {
    if (!retail) return;
    const controller = new AbortController();
    supabase.rpc('reorder_guidance', { p_kos: kosId, p_cover: 14 }).abortSignal(controller.signal).then(({ data,error }) => {
      if (!controller.signal.aborted) setGuidance(error ? { unavailable:true } : data || { items:[] });
    }, () => { if (!controller.signal.aborted) setGuidance({ unavailable:true }); });
    return () => controller.abort();
  }, [kosId, retail, version]);

  const barcodeMap = useMemo(() => {
    const index = new Map();
    for (const row of [...d.units.filter((u) => u.barcode).map((u) => ({ product_id:u.product_id, unit:u.name, code:u.barcode })), ...d.barcodes]) {
      const list = index.get(row.product_id) || [];
      list.push(row);
      index.set(row.product_id,list);
    }
    return index;
  }, [d.units,d.barcodes]);
  const products = useMemo(() => new Map(d.products.map((p) => [p.id,p])), [d.products]);
  const eligible = (p) => p && (!category || (category === 'none' ? !p.category_id : p.category_id === category));
  const token = query.trim().toLocaleLowerCase('id');
  const matches = (p) => eligible(p) && token.split(/\s+/).every((word) => [p.name,p.sku,p.barcode,...(barcodeMap.get(p.id) || []).map((x) => x.code)]
    .join(' ').toLocaleLowerCase('id').includes(word));
  const recommendations = (guidance?.items || []).filter((r) => r.suggest > 0 && ['order_now','schedule'].includes(r.action) && matches(products.get(r.product_id)))
    .sort((a,b) => Number(a.action !== 'order_now') - Number(b.action !== 'order_now')
      || (a.stockout_date || '9999').localeCompare(b.stockout_date || '9999'));
  const lines = Object.entries(selected).filter(([id]) => products.has(id)).map(([,line]) => line);
  const total = lines.reduce((s,l) => s + (qtyNum(l.qty) || 0) * parseRp(l.price),0);
  const visible = d.products.filter((p) => focusSelected ? selected[p.id] : matches(p)).sort((a,b) => (sort === 'asc' ? 1 : -1) * a.name.localeCompare(b.name,'id'));
  const change = (id, patch) => setSelected((previous) => ({ ...previous,[id]:{ ...previous[id],...patch } }));
  const remove = (id) => setSelected((previous) => Object.fromEntries(Object.entries(previous).filter(([key]) => key !== id)));
  const lookup = (p) => {
    const unit = (barcodeMap.get(p.id) || []).find((b) => String(b.code).toLowerCase() === token)?.unit;
    return defaults(p, unit);
  };
  function add(p,r) {
    const line = r ? defaults(p,r.unit,String(r.suggest),supplier && supplier !== r.supplier_id ? null : r.price) : lookup(p);
    if (!line) return toast('Tambahkan satuan untuk barang ini di Barang & Stok.');
    change(p.id,line);
  }
  function apply() {
    if (lines.some((l) => !(qtyNum(l.qty) > 0) || !/^(?:\d+(?:[.,]\d*)?|[.,]\d+)$/.test(String(l.qty).trim()) || !validPrice(l.price) || !unitsOf(products.get(l.product_id),d.units).some((u) => u.name === l.unit))) {
      setFocusSelected(true); setLimit(PAGE);
      return toast('Periksa satuan, jumlah, dan harga barang yang dipilih.');
    }
    onApply(lines);
  }
  return <section className={`${formStyles.productForm} ${css.picker}`} aria-label="Pilih Barang" data-no-field-help>
    <header className={formStyles.heading}>
      <button onClick={onBack} aria-label="Kembali ke pembelian"><NavIcon name="prev" /></button>
      <div><h1>Pilih Barang</h1><p>Pilih produk untuk ditambahkan ke pembelian.</p></div>
      {onNew && <button className={css.newProduct} onClick={() => onNew(selected)}><NavIcon name="plus" size={18} />Barang Baru</button>}
    </header>
    <div className={css.search}>
      <label><NavIcon name="search" /><input type="search" aria-label="Cari nama, SKU, atau barcode" placeholder="Cari nama, SKU, atau barcode…" value={query} onChange={(e) => { setQuery(e.target.value); setFocusSelected(false); setLimit(PAGE); }} /></label>
      <ScanButton label="" icon={<NavIcon name="barcode" />} className={css.scan} onCode={(code) => { setQuery(code); setCategory(''); setFocusSelected(false); setLimit(PAGE); }} />
    </div>
    <div className={css.filters} aria-label="Filter kategori">
      {[{ id:'', name:'Semua' }, ...d.categories.slice(0,3)].map((c) => <button key={c.id} aria-pressed={category === c.id}
        onClick={() => { setCategory(c.id); setFocusSelected(false); setLimit(PAGE); }}>{c.name}</button>)}
      <select aria-label="Kategori lainnya" value={d.categories.slice(0,3).some((c) => c.id === category) ? '' : category}
        onChange={(e) => { setCategory(e.target.value); setFocusSelected(false); setLimit(PAGE); }}>
        <option value="">Kategori lainnya</option>{d.categories.slice(3).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}<option value="none">Tanpa kategori</option>
      </select>
    </div>
    {retail && !focusSelected && <section className={css.recommendations} aria-label="Disarankan untuk dibeli">
      <div className={css.between}><div><h2>Disarankan untuk dibeli</h2><small>{guidance?.location ? `Lokasi ${guidance.location} · ` : ''}Proyeksi kebutuhan setelah barang datang untuk 14 hari.</small></div>
        {recommendations.length > 3 && <button onClick={() => setAllRec(!allRec)}>{allRec ? 'Ringkas' : 'Lihat semua'}</button>}</div>
      {!guidance ? <p>Memuat saran stok…</p> : guidance.unavailable ? <p>Saran stok sedang tidak tersedia. Daftar barang tetap bisa digunakan.</p>
        : !recommendations.length ? <p>Tidak ada rekomendasi pembelian yang cocok.</p> :
        <div className={css.recGrid}>{recommendations.slice(0,allRec ? recommendations.length : 3).map((r) => {
          const p = products.get(r.product_id);
          return <article key={p.id}>
            <div className={css.product}><Thumbnail path={thumbs[p.id]} /><b>{p.name}</b></div>
            <small>{reason(r)}</small>
            <dl><dt>Stok tersedia</dt><dd>{angka(r.available)} {r.base_unit}</dd>
              <dt>Pemakaian 30 hari</dt><dd>{angka(r.used)} {r.base_unit}</dd>
              <dt>Saran restok</dt><dd>{angka(r.suggest)} {r.unit}</dd>
              <dt>Harga beli terakhir</dt><dd>{r.last_price != null ? `${rp(r.last_price)}/${r.last_unit}` : 'Belum tersedia'}</dd>
              <dt>Estimasi biaya</dt><dd>{rp(Number(r.price) * Number(r.suggest))}</dd>
              {r.supplier && <><dt>Supplier rujukan</dt><dd>{r.supplier}</dd></>}
            </dl>
            {selected[p.id] ? <small>Sudah dipilih</small> : <button onClick={() => add(p,r)}>+ Tambah saran</button>}
          </article>;
        })}</div>}
    </section>}
    <div className={css.between}><h2>{focusSelected ? 'Barang dipilih' : 'Daftar Barang'}</h2>
      <select aria-label="Urutkan barang" value={sort} onChange={(e) => setSort(e.target.value)}><option value="asc">Nama A–Z</option><option value="desc">Nama Z–A</option></select></div>
    {!visible.length && <p>Tidak ada barang yang cocok.</p>}
    <div className={css.list}>{visible.slice(0,limit).map((p) => {
      const line = selected[p.id];
      const suggested = lookup(p);
      const units = unitsOf(p,d.units);
      return <article key={p.id}>
        <div className={css.listRow}>
          <input type="checkbox" aria-label={`Pilih ${p.name}`} disabled={!units.length} checked={Boolean(line)} onChange={(e) => e.target.checked ? add(p) : remove(p.id)} />
          <Thumbnail path={thumbs[p.id]} />
          <div><b>{p.name}</b><small>{p.sku ? `SKU ${p.sku}` : p.base_unit}</small></div>
          <strong>{line ? rp(parseRp(line.price)) : suggested?.price ? rp(parseRp(suggested.price)) : '—'}</strong>
        </div>
        {line && <div className={css.fields}>
          <Field label="Satuan"><select aria-label={`Satuan ${p.name}`} value={line.unit} onChange={(e) => change(p.id,{ unit:e.target.value,price:priceFor(p,e.target.value) })}>{units.map((u) => <option value={u.name} key={u.name}>{u.name}</option>)}</select></Field>
          <div className={css.qty}><span>Jumlah</span><div>
            <button aria-label={`Kurangi ${p.name}`} onClick={() => {
              const next = (qtyNum(line.qty) || 0) - 1;
              if (next <= 0) remove(p.id); else change(p.id,{ qty:String(next) });
            }}>−</button>
            <input inputMode="decimal" aria-label={`Jumlah ${p.name}`} value={line.qty} onChange={(e) => change(p.id,{ qty:e.target.value })} />
            <button aria-label={`Tambah jumlah ${p.name}`} onClick={() => change(p.id,{ qty:String(Math.round(((qtyNum(line.qty) || 0)+1)*1000)/1000) })}>+</button>
          </div></div>
          <Field label="Harga beli"><input inputMode="numeric" aria-label={`Harga beli ${p.name}`} value={line.price} onChange={(e) => change(p.id,{ price:e.target.value })} /></Field>
        </div>}
      </article>;
    })}</div>
    {visible.length > limit && <button onClick={() => setLimit(limit+PAGE)}>Tampilkan lebih banyak</button>}
    <footer className={css.footer}>
      <button className={css.summary} aria-pressed={focusSelected} onClick={() => { setFocusSelected(!focusSelected); setLimit(PAGE); window.scrollTo(0,0); }}>
        <NavIcon name="cart" /><span><b>{lines.length} produk dipilih</b><small>Estimasi belanja</small></span><strong>{rp(total)}</strong>
      </button>
      <button className="primary" disabled={!lines.length} onClick={apply}>Tambahkan ke Pembelian</button>
    </footer>
  </section>;
}

function Thumbnail({ path }) {
  return <span className={css.thumb}>{path ? <ListThumb path={path} size={40} /> : <NavIcon name="/barang" size={19} />}</span>;
}
