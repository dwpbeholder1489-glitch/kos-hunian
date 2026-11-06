'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { useKos } from '@/components/KosProvider';
import PageHelp from '@/components/PageHelp';
import { Sheet, Field, Loading, Empty, Tile, run, toast } from '@/components/ui';
import { rp, angka, parseRp, tgl, today, errMsg } from '@/lib/format';
import { qtyNum, unitsOf, uid } from '@/lib/retail';

const BUY = { tunai: 'Tunai', transfer: 'Transfer', utang: 'Utang ke supplier' };

// Belanja ke supplier: menambah stok dan menghitung ulang harga modal rata-rata
export default function Belanja() {
  const { kosId, ver } = useKos();
  const [d, setD] = useState(null);
  const [err, setErr] = useState(null);
  const [form, setForm] = useState(false);
  const [open, setOpen] = useState(null);
  const load = async () => {
    const [b, p, u, c, pl] = await Promise.all([
      supabase.from('purchases').select('*').eq('kos_id', kosId).order('purchase_date', { ascending: false }).order('created_at', { ascending: false }).limit(60),
      supabase.from('products').select('*').eq('kos_id', kosId).eq('active', true).order('name'),
      supabase.from('product_units').select('*').eq('kos_id', kosId),
      supabase.from('contacts').select('*').eq('kos_id', kosId).eq('kind', 'supplier').order('name'),
      supabase.from('purchase_lines').select('product_id,unit,price,purchase_id').eq('kos_id', kosId).limit(2000),
    ]);
    const e = b.error || p.error || u.error || c.error || pl.error;
    if (e) return setErr(errMsg(e));
    setD({ purchases: b.data, products: p.data, units: u.data, suppliers: c.data, lines: pl.data });
  };
  useEffect(() => { load(); }, [kosId, ver]);
  if (err) return <div className="notice bad">{err.includes('purchase') ? 'Database sedang diperbarui. Coba lagi beberapa menit lagi.' : err}</div>;
  if (!d) return <Loading />;

  const sup = new Map(d.suppliers.map((s) => [s.id, s.name]));
  const month = today().slice(0, 7);
  const ok = d.purchases.filter((b) => b.status === 'selesai');
  const thisMonth = ok.filter((b) => b.purchase_date.startsWith(month));

  return (
    <div className="stack">
      <div className="row between"><div className="row"><h2>Belanja</h2><PageHelp page="belanja" /></div><button className="primary" onClick={() => setForm(true)} disabled={!d.products.length}>+ Belanja</button></div>
      <div className="grid">
        <Tile label="Belanja bulan ini" value={rp(thisMonth.reduce((a, b) => a + Number(b.total), 0))} sub={`${thisMonth.length} nota`} />
        <Tile label="Belanja utang bulan ini" value={rp(thisMonth.filter((b) => b.pay_method === 'utang').reduce((a, b) => a + Number(b.total), 0))} sub="pelunasan di menu Kas & kasbon" />
      </div>
      {!d.products.length ? (
        <Empty title="Belum ada barang" text="Tambahkan barangnya dulu di Barang & stok, lalu catat belanjanya di sini."><Link href="/barang"><button className="primary">Buka Barang & stok</button></Link></Empty>
      ) : d.purchases.length === 0 ? (
        <Empty title="Belum ada belanja" text="Catat setiap belanja ke supplier: stok bertambah otomatis dan harga modal ikut diperbarui." />
      ) : (
        <section className="panel"><div className="list">{d.purchases.map((b) => (
          <button className="li click" key={b.id} onClick={() => setOpen(b)} style={{ background: 'none', border: 0, borderTop: '1px solid var(--line)', borderRadius: 0, textAlign: 'left', width: '100%', font: 'inherit', color: 'inherit' }}>
            <div className="main"><b>{sup.get(b.contact_id) || 'Tanpa supplier'}{b.status === 'batal' && <span className="chip void" style={{ marginLeft: 6 }}>Batal</span>}</b>
              <span className="small muted">{tgl(b.purchase_date)} · {b.number} · {BUY[b.pay_method]}</span></div>
            <b style={{ textDecoration: b.status === 'batal' ? 'line-through' : 'none' }}>{rp(b.total)}</b>
          </button>
        ))}</div></section>
      )}
      {form && <PurchaseForm kosId={kosId} d={d} onClose={() => setForm(false)} onSaved={(r) => { setForm(false); toast(`${r.number} tersimpan · ${rp(r.total)}`); load(); }} />}
      {open && <Detail b={open} supplier={sup.get(open.contact_id)} onClose={() => setOpen(null)} onChanged={() => { setOpen(null); load(); }} />}
    </div>
  );
}

function PurchaseForm({ kosId, d, onClose, onSaved }) {
  const [date, setDate] = useState(today());
  const [supplier, setSupplier] = useState('');
  const [newSup, setNewSup] = useState('');
  const [q, setQ] = useState('');
  const [lines, setLines] = useState([]);
  const [method, setMethod] = useState('tunai');
  const [due, setDue] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [txId] = useState(uid);

  const prodById = new Map(d.products.map((p) => [p.id, p]));
  // Harga beli terakhir untuk barang + satuan (dari belanja yang tidak batal)
  const rank = new Map(d.purchases.filter((b) => b.status === 'selesai').map((b, i) => [b.id, i])); // 0 = paling baru
  const lastPrice = (pid, unit) => {
    let best = null;
    for (const l of d.lines) if (l.product_id === pid && l.unit === unit && rank.has(l.purchase_id) && (!best || rank.get(l.purchase_id) < rank.get(best.purchase_id))) best = l;
    return best ? Number(best.price) : null;
  };
  const suggest = (p, u) => lastPrice(p.id, u.name) ?? Math.round(Number(p.cost) * Number(u.qty));

  const w = q.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const found = w.length ? d.products.filter((p) => w.every((x) => p.name.toLowerCase().includes(x))).slice(0, 6) : [];
  const addProduct = (p) => {
    const us = unitsOf(p, d.units);
    const u = [...us].sort((a, b) => b.qty - a.qty)[0];
    const price = suggest(p, u);
    setLines([...lines, { key: uid(), product_id: p.id, unit: u.name, qty: '1', price: price > 0 ? angka(price) : '' }]);
    setQ('');
  };
  const set = (key, patch) => setLines(lines.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  const total = lines.reduce((s, l) => s + (qtyNum(l.qty) || 0) * parseRp(l.price), 0);

  const save = async () => {
    if (!lines.length) return toast('Tambahkan barang yang dibeli.');
    const bad = lines.find((l) => !(qtyNum(l.qty) > 0) || l.price.trim() === '');
    if (bad) return toast(`Isi jumlah dan harga beli untuk ${prodById.get(bad.product_id)?.name}.`);
    setBusy(true);
    try {
      let sid = supplier || null;
      if (!sid && newSup.trim()) {
        const { data, error } = await supabase.rpc('contact_save', { p_kos: kosId, p_id: null, p_kind: 'supplier', p_name: newSup, p_phone: null });
        if (error) throw error;
        sid = data; setSupplier(data);
      }
      if (method === 'utang' && !sid) { toast('Pilih supplier atau isi nama supplier baru untuk belanja utang.'); setBusy(false); return; }
      const { data, error } = await supabase.rpc('purchase_create', {
        p_id: txId, p_kos: kosId, p_date: date, p_contact: sid,
        p_lines: lines.map((l) => ({ product_id: l.product_id, unit: l.unit, qty: qtyNum(l.qty), price: parseRp(l.price) })),
        p_method: method, p_due: method === 'utang' && due ? due : null, p_note: note,
      });
      if (error) throw error;
      onSaved(data);
    } catch (e) { toast(errMsg(e)); }
    setBusy(false);
  };

  return (
    <Sheet title="Catat belanja" onClose={onClose}>
      <div className="row">
        <Field label="Tanggal"><input type="date" max={today()} value={date} onChange={(e) => setDate(e.target.value)} /></Field>
        <Field label="Supplier"><select value={supplier} onChange={(e) => setSupplier(e.target.value)}><option value="">— tanpa / baru —</option>{d.suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></Field>
      </div>
      {!supplier && <Field label="Nama supplier baru (opsional)"><input value={newSup} onChange={(e) => setNewSup(e.target.value)} placeholder="mis. CV Sumber Rejeki" /></Field>}

      <span className="label">Barang yang dibeli</span>
      {lines.map((l) => {
        const p = prodById.get(l.product_id);
        const us = unitsOf(p, d.units);
        const u = us.find((x) => x.name === l.unit) || us[0];
        const qn = qtyNum(l.qty) || 0, pr = parseRp(l.price);
        const base = qn * Number(u.qty);
        const unitCost = u.qty > 0 ? pr / Number(u.qty) : 0;
        const newCost = Number(p.stock) > 0 ? (Number(p.stock) * Number(p.cost) + base * unitCost) / (Number(p.stock) + base) : unitCost;
        return (
          <div className="unitbox" key={l.key}>
            <div className="row between" style={{ flexWrap: 'nowrap' }}><b className="small">{p.name}</b><button className="sm ghost" onClick={() => setLines(lines.filter((x) => x.key !== l.key))}>Hapus</button></div>
            <div className="row">
              <Field label="Jumlah"><input inputMode="decimal" value={l.qty} onChange={(e) => set(l.key, { qty: e.target.value })} /></Field>
              <Field label="Satuan"><select value={l.unit} onChange={(e) => { const nu = us.find((x) => x.name === e.target.value); const s = suggest(p, nu); set(l.key, { unit: e.target.value, price: s > 0 ? angka(s) : '' }); }}>{us.map((x) => <option key={x.name} value={x.name}>{x.name}{x.qty > 1 ? ` (${angka(x.qty)} ${p.base_unit})` : ''}</option>)}</select></Field>
              <Field label={`Harga beli per ${l.unit}`}><input inputMode="numeric" value={l.price} onChange={(e) => set(l.key, { price: e.target.value })} /></Field>
            </div>
            {qn > 0 && pr > 0 && <span className="small muted">{rp(qn * pr)} · stok +{angka(base)} {p.base_unit} · modal {rp(p.cost)} → <b>{rp(newCost)}</b>/{p.base_unit}</span>}
          </div>
        );
      })}
      <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="+ Cari barang untuk ditambahkan" aria-label="Cari barang" />
      {found.length > 0 && <div className="list">{found.map((p) => (
        <button key={p.id} className="li click" onClick={() => addProduct(p)} style={{ background: 'none', border: 0, borderTop: '1px solid var(--line)', borderRadius: 0, textAlign: 'left', width: '100%', font: 'inherit', color: 'inherit' }}>
          <span>{p.name}</span><span className="small muted">tambah ›</span>
        </button>
      ))}</div>}
      {w.length > 0 && found.length === 0 && <p className="small muted" style={{ margin: 0 }}>Tidak ditemukan. Barang baru ditambahkan dulu di <Link href="/barang">Barang & stok</Link>.</p>}

      <div className="row between" style={{ fontSize: 20 }}><b>Total</b><b>{rp(total)}</b></div>
      <div className="seg">{Object.entries(BUY).map(([k, l]) => <button key={k} className={method === k ? 'on' : ''} onClick={() => setMethod(k)} aria-pressed={method === k}>{l}</button>)}</div>
      {method === 'utang' && <Field label="Jatuh tempo (opsional)"><input type="date" value={due} onChange={(e) => setDue(e.target.value)} /></Field>}
      <Field label="Catatan (opsional)"><input value={note} onChange={(e) => setNote(e.target.value)} placeholder="mis. no. nota supplier" /></Field>
      <button className="cta" onClick={save} disabled={busy}>{busy ? 'Menyimpan…' : `Simpan belanja · ${rp(total)}`}</button>
    </Sheet>
  );
}

function Detail({ b, supplier, onClose, onChanged }) {
  const [lines, setLines] = useState(null);
  const [voiding, setVoiding] = useState(false);
  const [reason, setReason] = useState('');
  useEffect(() => { supabase.from('purchase_lines').select('*').eq('purchase_id', b.id).then(({ data }) => setLines(data || [])); }, [b.id]);
  const doVoid = async () => {
    if (await run(() => supabase.rpc('purchase_void', { p_purchase: b.id, p_reason: reason }), 'Belanja dibatalkan, stok dikurangi lagi', errMsg)) onChanged();
  };
  return (
    <Sheet title={b.number} onClose={onClose}>
      <span className="small muted">{tgl(b.purchase_date)} · {supplier || 'Tanpa supplier'} · {BUY[b.pay_method]}{b.due_date ? ` · jatuh tempo ${tgl(b.due_date)}` : ''}</span>
      {b.note && <span className="small">Catatan: {b.note}</span>}
      {b.status === 'batal' && <div className="notice bad">Dibatalkan: {b.void_reason}</div>}
      {!lines ? <Loading /> : <div className="list">{lines.map((l) => (
        <div className="li" key={l.id}><div className="main"><b className="small">{l.name}</b><span className="small muted">{angka(l.qty)} {l.unit} × {rp(l.price)}</span></div><b className="small">{rp(l.line_total)}</b></div>
      ))}</div>}
      <div className="row between"><b>Total</b><b>{rp(b.total)}</b></div>
      {b.status === 'selesai' && (!voiding ? <button className="ghost" style={{ color: 'var(--bad)' }} onClick={() => setVoiding(true)}>Batalkan belanja</button> : <>
        <Field label="Alasan pembatalan"><input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="mis. salah input, barang diretur" /></Field>
        <button className="danger" onClick={doVoid} disabled={!reason.trim()}>Ya, batalkan & kurangi stok</button>
      </>)}
    </Sheet>
  );
}
