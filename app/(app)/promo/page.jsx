'use client';
// Promosi & bundling Kasir. Server: promo_list, promo_save, promo_set_active, promo_delete. Promo dihitung server saat transaksi.
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useKos } from '@/components/KosProvider';
import PageHelp from '@/components/PageHelp';
import { useBaru } from '@/lib/useBaru';
import { Sheet, Field, Loading, Empty, Tile, run, toast } from '@/components/ui';
import { rp, angka, parseRp, tgl, today, errMsg } from '@/lib/format';
import { qtyNum } from '@/lib/retail';

const LI = { background: 'none', border: 0, borderTop: '1px solid var(--line)', borderRadius: 0, textAlign: 'left', width: '100%', font: 'inherit', color: 'inherit' };
const KIND = { diskon: 'Diskon barang', gratis: 'Beli X gratis Y', paket: 'Paket bundling', belanja: 'Minimal belanja' };
const KIND_HINT = { diskon: 'Potongan persen untuk barang tertentu atau semua barang.', gratis: 'Mis. beli 2 gratis 1 untuk barang & satuan yang sama. Pembeli memasukkan 3, membayar 2.',
  paket: 'Beberapa barang dijual bersama dengan harga paket yang lebih murah.', belanja: 'Potongan bila total belanja mencapai jumlah tertentu.' };
const STATE = { berjalan: ['Berjalan', 'good'], terjadwal: ['Terjadwal', 'info'], berakhir: ['Berakhir', 'void'], nonaktif: ['Dimatikan', 'void'] };
const HARI = ['Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab', 'Min'];

function promoText(p) {
  if (p.kind === 'diskon') return `Diskon ${angka(p.percent)}% · ${p.product_names?.length ? p.product_names.slice(0, 3).join(', ') + (p.product_names.length > 3 ? ` +${p.product_names.length - 3}` : '') : 'semua barang'}`;
  if (p.kind === 'gratis') return `Beli ${angka(p.buy_qty)} gratis ${angka(p.free_qty)} · ${p.product_name || 'barang'} (${p.unit})`;
  if (p.kind === 'paket') return `${(p.items || []).map((i) => `${angka(i.qty)} ${i.name}`).join(' + ')} = ${rp(p.bundle_price)}`;
  return `Belanja min. ${rp(p.min_spend)} → ${p.percent != null ? `diskon ${angka(p.percent)}%` : `potong ${rp(p.amount)}`}`;
}
const jadwal = (p) => `${tgl(p.start_date)}${p.end_date ? ` – ${tgl(p.end_date)}` : ' – tanpa batas'}${p.days?.length ? ` · ${p.days.map((d) => HARI[d - 1]).join(', ')}` : ''}${p.tier !== 'semua' ? ` · harga ${p.tier === 'ecer' ? 'eceran' : 'grosir'} saja` : ''}`;

export default function Promo() {
  const { kosId, ver } = useKos();
  const [d, setD] = useState(null);
  const [err, setErr] = useState(null);
  const [form, setForm] = useState(null);
  const [prods, setProds] = useState([]);
  useBaru(() => setForm({}));
  const load = async () => {
    const [a, b, c] = await Promise.all([supabase.rpc('promo_list', { p_kos: kosId }),
      supabase.from('products').select('id, name, base_unit').eq('kos_id', kosId).eq('active', true).order('name'),
      supabase.from('product_units').select('product_id, name, price_retail, sort').eq('kos_id', kosId).order('sort')]);
    if (a.error) return setErr(errMsg(a.error));
    setErr(null); setD(a.data); setProds((b.data || []).map((p) => ({ ...p, units: (c.data || []).filter((u) => u.product_id === p.id) })));
  };
  useEffect(() => { load(); }, [kosId, ver]);
  if (err) return <div className="notice bad">{/promo_list/.test(err) ? 'Database sedang diperbarui. Coba lagi beberapa menit lagi.' : err}</div>;
  if (!d) return <Loading />;
  const jalan = d.promos.filter((p) => p.state === 'berjalan').length;
  return (
    <div className="stack">
      <div className="row between"><div className="row"><h2>Promo & bundling</h2><PageHelp page="promo" /></div><button className="primary" onClick={() => setForm({})}>+ Promo</button></div>
      <div className="grid">
        <Tile label="Promo berjalan" value={angka(jalan)} sub={`${d.promos.length} promo tersimpan`} tone={jalan ? 'good' : ''} />
        <Tile label="Potongan promo bulan ini" value={rp(d.month_given)} sub={`${angka(d.month_sales)} transaksi`} />
      </div>
      {d.promos.length === 0 ? (
        <Empty title="Belum ada promo" text="Buat diskon, beli X gratis Y, paket bundling, atau potongan minimal belanja. Promo terpasang otomatis di Kasir pada tanggal yang Anda tentukan dan tercetak di struk.">
          <button className="primary" onClick={() => setForm({})}>+ Buat promo pertama</button>
        </Empty>
      ) : <section className="panel"><div className="list">{d.promos.map((p) => (
        <button key={p.id} className="li click" style={LI} onClick={() => setForm(p)}>
          <div className="main"><b>{p.name}</b><span className="small">{promoText(p)}</span><span className="small muted">{jadwal(p)}</span>
            {p.used > 0 && <span className="small muted">Dipakai {angka(p.used)}× · total potongan {rp(p.given)}</span>}</div>
          <span className={'chip ' + STATE[p.state][1]} style={{ flex: 'none' }}>{STATE[p.state][0]}</span>
        </button>
      ))}</div></section>}
      <span className="small muted">Promo dihitung otomatis saat Bayar di Kasir. Satu barang hanya kena satu promo (urutan: paket → beli X gratis Y → diskon barang → minimal belanja). Barang yang harganya diubah manual di kasir tidak ikut promo. Potongan promo mengurangi penjualan di laporan, sama seperti diskon.</span>
      {form && <PromoForm kosId={kosId} p={form.id ? form : null} prods={prods} onClose={() => setForm(null)} onDone={() => { setForm(null); load(); }} />}
    </div>
  );
}

function PromoForm({ kosId, p, prods, onClose, onDone }) {
  const [f, setF] = useState({ name: p?.name || '', kind: p?.kind || 'diskon', percent: p?.percent != null ? String(Number(p.percent)).replace('.', ',') : '', amount: p?.amount ? angka(p.amount) : '',
    min_spend: p?.min_spend ? angka(p.min_spend) : '', all: p ? !p.product_ids : true, product_ids: p?.product_ids || [], product_id: p?.product_id || '', unit: p?.unit || '',
    buy_qty: p?.buy_qty ? String(Number(p.buy_qty)) : '', free_qty: p?.free_qty ? String(Number(p.free_qty)) : '',
    items: (p?.items || []).map((i) => ({ product_id: i.product_id, unit: i.unit, qty: String(Number(i.qty)) })), bundle_price: p?.bundle_price != null ? angka(p.bundle_price) : '',
    mode: p?.kind === 'belanja' && p.amount ? 'rp' : 'pct', tier: p?.tier || 'semua', start_date: p?.start_date || today(), end_date: p?.end_date || '', days: p?.days || [], active: p ? p.active : true });
  const [busy, setBusy] = useState(false);
  const [q, setQ] = useState('');
  const set = (k, v) => setF((x) => ({ ...x, [k]: v }));
  const prod = (id) => prods.find((x) => x.id === id);
  const price = (id, unit) => Number(prod(id)?.units.find((u) => u.name === unit)?.price_retail || 0);
  const normal = f.items.reduce((a, i) => a + (qtyNum(i.qty) || 0) * price(i.product_id, i.unit), 0);
  const bp = parseRp(f.bundle_price) || 0;
  const pct = parseFloat(String(f.percent).replace(',', '.'));
  const gp = f.product_id ? price(f.product_id, f.unit || prod(f.product_id)?.base_unit) : 0;
  const save = async () => {
    if (f.name.trim().length < 2) return toast('Isi nama promo (tampil di struk).');
    const body = { name: f.name, kind: f.kind, tier: f.tier, start_date: f.start_date || null, end_date: f.end_date || null, days: f.days, active: f.active };
    if (f.kind === 'diskon') { if (!(pct > 0)) return toast('Isi persen diskon.'); if (!f.all && !f.product_ids.length) return toast('Pilih barang, atau pilih Semua barang.'); Object.assign(body, { percent: pct, product_ids: f.all ? [] : f.product_ids }); }
    if (f.kind === 'gratis') { if (!f.product_id) return toast('Pilih barang.'); Object.assign(body, { product_id: f.product_id, unit: f.unit || prod(f.product_id)?.base_unit, buy_qty: qtyNum(f.buy_qty), free_qty: qtyNum(f.free_qty) }); }
    if (f.kind === 'paket') { if (!f.items.length || f.items.some((i) => !i.product_id)) return toast('Pilih barang dalam paket.'); if (f.bundle_price === '') return toast('Isi harga paket.'); Object.assign(body, { items: f.items.map((i) => ({ product_id: i.product_id, unit: i.unit, qty: qtyNum(i.qty) })), bundle_price: bp }); }
    if (f.kind === 'belanja') { Object.assign(body, { min_spend: parseRp(f.min_spend) || 0, ...(f.mode === 'pct' ? { percent: pct } : { amount: parseRp(f.amount) }) }); if (f.mode === 'pct' ? !(pct > 0) : !(parseRp(f.amount) > 0)) return toast('Isi besar potongannya.'); }
    setBusy(true);
    const ok = await run(() => supabase.rpc('promo_save', { p_kos: kosId, p_id: p?.id || null, p: body }), p ? 'Promo diperbarui' : 'Promo dibuat', errMsg);
    setBusy(false); if (ok) onDone();
  };
  const hapus = async () => { if (window.confirm(`Hapus promo "${p.name}"? Riwayat di transaksi lama tetap ada.`) && await run(() => supabase.rpc('promo_delete', { p_promo: p.id }), 'Promo dihapus', errMsg)) onDone(); };
  const ProdSelect = ({ value, onChange }) => <select value={value} onChange={(e) => onChange(e.target.value)}><option value="">— pilih barang —</option>{prods.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select>;
  const UnitSelect = ({ pid, value, onChange, short }) => <select value={value || prod(pid)?.base_unit || ''} onChange={(e) => onChange(e.target.value)}>{(prod(pid)?.units || []).map((u) => <option key={u.name} value={u.name}>{short ? u.name : `${u.name} · ${rp(u.price_retail)}`}</option>)}</select>;
  const shownProds = prods.filter((x) => !q.trim() || x.name.toLowerCase().includes(q.trim().toLowerCase()));
  return (
    <Sheet title={p ? 'Ubah promo' : 'Promo baru'} onClose={onClose}>
      <Field label="Nama promo" hint="tampil di kasir & struk"><input value={f.name} maxLength={60} onChange={(e) => set('name', e.target.value)} placeholder="mis. Mie beli 2 gratis 1" /></Field>
      <span className="label">Jenis</span>
      <div className="row" style={{ flexWrap: 'wrap', gap: 6 }}>{Object.entries(KIND).map(([k, l]) => <button key={k} className={'sm' + (f.kind === k ? ' primary' : '')} onClick={() => set('kind', k)}>{l}</button>)}</div>
      <span className="small muted">{KIND_HINT[f.kind]}</span>

      {f.kind === 'diskon' && <div className="unitbox">
        <Field label="Diskon (%)"><input inputMode="decimal" value={f.percent} onChange={(e) => set('percent', e.target.value)} placeholder="mis. 10" /></Field>
        <div className="seg">{[[true, 'Semua barang'], [false, 'Barang tertentu']].map(([k, l]) => <button key={l} className={f.all === k ? 'on' : ''} onClick={() => set('all', k)}>{l}</button>)}</div>
        {!f.all && <>
          {prods.length > 8 && <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cari barang…" aria-label="Cari barang" />}
          <div className="row" style={{ flexWrap: 'wrap', gap: 6, maxHeight: 180, overflowY: 'auto' }}>{shownProds.map((x) => { const on = f.product_ids.includes(x.id); return <button key={x.id} className={'sm' + (on ? ' primary' : '')} onClick={() => set('product_ids', on ? f.product_ids.filter((i) => i !== x.id) : [...f.product_ids, x.id])}>{x.name}</button>; })}</div>
          <span className="small muted">{f.product_ids.length} barang dipilih</span>
        </>}
      </div>}

      {f.kind === 'gratis' && <div className="unitbox">
        <Field label="Barang"><ProdSelect value={f.product_id} onChange={(v) => setF((x) => ({ ...x, product_id: v, unit: prod(v)?.base_unit || '' }))} /></Field>
        {f.product_id && <Field label="Satuan"><UnitSelect pid={f.product_id} value={f.unit} onChange={(v) => set('unit', v)} /></Field>}
        <div className="row"><Field label="Beli"><input inputMode="numeric" value={f.buy_qty} onChange={(e) => set('buy_qty', e.target.value.replace(/\D/g, ''))} placeholder="2" /></Field><Field label="Gratis"><input inputMode="numeric" value={f.free_qty} onChange={(e) => set('free_qty', e.target.value.replace(/\D/g, ''))} placeholder="1" /></Field></div>
        {f.product_id && qtyNum(f.buy_qty) > 0 && qtyNum(f.free_qty) > 0 && <p className="small" style={{ margin: 0 }}>Pembeli mengambil <b>{angka(qtyNum(f.buy_qty) + qtyNum(f.free_qty))}</b>, membayar {angka(qtyNum(f.buy_qty))} = {rp(qtyNum(f.buy_qty) * gp)} (hemat {rp(qtyNum(f.free_qty) * gp)}; setara diskon {angka(Math.round((qtyNum(f.free_qty) * 1000) / (qtyNum(f.buy_qty) + qtyNum(f.free_qty))) / 10)}%).</p>}
      </div>}

      {f.kind === 'paket' && <div className="unitbox">
        {f.items.map((it, i) => (
          <div className="stack" key={i} style={{ gap: 6 }}>
            <Field label={`Barang ${i + 1}`}><ProdSelect value={it.product_id} onChange={(v) => set('items', f.items.map((x, j) => (j === i ? { ...x, product_id: v, unit: prod(v)?.base_unit || '' } : x)))} /></Field>
            {it.product_id && <div className="row" style={{ flexWrap: 'nowrap' }}>
              <Field label="Jumlah"><input inputMode="decimal" value={it.qty} onChange={(e) => set('items', f.items.map((x, j) => (j === i ? { ...x, qty: e.target.value } : x)))} /></Field>
              <Field label="Satuan"><UnitSelect short pid={it.product_id} value={it.unit} onChange={(v) => set('items', f.items.map((x, j) => (j === i ? { ...x, unit: v } : x)))} /></Field>
              <button className="sm ghost" style={{ alignSelf: 'flex-end' }} aria-label="Hapus barang" onClick={() => set('items', f.items.filter((_, j) => j !== i))}>✕</button>
            </div>}
          </div>
        ))}
        {f.items.length < 10 && <button className="sm" onClick={() => set('items', [...f.items, { product_id: '', unit: '', qty: '1' }])}>+ Barang dalam paket</button>}
        <Field label="Harga paket"><input inputMode="numeric" value={f.bundle_price} onChange={(e) => set('bundle_price', e.target.value)} /></Field>
        {normal > 0 && <p className="small" style={{ margin: 0 }}>Harga biasa {rp(normal)}{bp > 0 ? (bp < normal ? <> → paket {rp(bp)} · <b style={{ color: 'var(--good)' }}>hemat {rp(normal - bp)}</b></> : <span style={{ color: 'var(--bad)' }}> — harga paket harus lebih murah</span>) : null}</p>}
      </div>}

      {f.kind === 'belanja' && <div className="unitbox">
        <Field label="Minimal belanja"><input inputMode="numeric" value={f.min_spend} onChange={(e) => set('min_spend', e.target.value)} placeholder="mis. 100.000" /></Field>
        <div className="seg">{[['pct', 'Diskon persen'], ['rp', 'Potongan rupiah']].map(([k, l]) => <button key={k} className={f.mode === k ? 'on' : ''} onClick={() => set('mode', k)}>{l}</button>)}</div>
        {f.mode === 'pct' ? <Field label="Diskon (%)"><input inputMode="decimal" value={f.percent} onChange={(e) => set('percent', e.target.value)} placeholder="mis. 5" /></Field>
          : <Field label="Potongan (Rp)"><input inputMode="numeric" value={f.amount} onChange={(e) => set('amount', e.target.value)} placeholder="mis. 5.000" /></Field>}
      </div>}

      <span className="label">Berlaku</span>
      <div className="row"><Field label="Mulai"><input type="date" value={f.start_date} onChange={(e) => set('start_date', e.target.value)} /></Field><Field label="Sampai" hint="kosong = tanpa batas"><input type="date" value={f.end_date} min={f.start_date} onChange={(e) => set('end_date', e.target.value)} /></Field></div>
      <span className="small muted">Hari tertentu saja (kosong = setiap hari)</span>
      <div className="row" style={{ flexWrap: 'wrap', gap: 6 }}>{HARI.map((h, i) => { const on = f.days.includes(i + 1); return <button key={h} className={'sm' + (on ? ' primary' : '')} onClick={() => set('days', on ? f.days.filter((x) => x !== i + 1) : [...f.days, i + 1])}>{h}</button>; })}</div>
      <Field label="Untuk harga"><select value={f.tier} onChange={(e) => set('tier', e.target.value)}><option value="semua">Eceran & grosir</option><option value="ecer">Eceran saja</option><option value="grosir">Grosir saja</option></select></Field>
      {p && <label className="row small" style={{ flexWrap: 'nowrap', fontWeight: 700 }}><input type="checkbox" style={{ width: 22, minHeight: 22, flex: 'none' }} checked={f.active} onChange={(e) => set('active', e.target.checked)} />Promo aktif</label>}
      <button className="cta" disabled={busy} onClick={save}>{busy ? 'Menyimpan…' : 'Simpan promo'}</button>
      {p && <button className="ghost danger" onClick={hapus}>Hapus promo</button>}
    </Sheet>
  );
}
