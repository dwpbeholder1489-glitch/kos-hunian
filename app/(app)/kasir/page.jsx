'use client';
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { ScanButton } from '@/components/BarcodeScan';
import { moduleOn } from '@/lib/business';
import { supabase } from '@/lib/supabase';
import { useKos } from '@/components/KosProvider';
import PageHelp from '@/components/PageHelp';
import LokasiBar from '@/components/LokasiBar';
import { Sheet, Field, Loading, Empty, run, toast } from '@/components/ui';
import { rp, angka, parseRp, errMsg, today } from '@/lib/format';
import { qtyNum, unitsOf, stockText, isLow, unitPrice, uid, PAY } from '@/lib/retail';

const cartKey = (k) => 'prasara.cart.' + k;

export default function Kasir() {
  const { kos, kosId, ver } = useKos();
  const [d, setD] = useState(null);
  const [err, setErr] = useState(null);
  const [q, setQ] = useState('');
  const [tier, setTier] = useState('ecer');
  const [cart, setCart] = useState([]);
  const [lead, setLead] = useState(null); // permintaan halaman bisnis yang sedang diproses {id, number, name, phone}
  const [open, setOpen] = useState(false);
  const [done, setDone] = useState(null);
  const [shift, setShift] = useState(undefined);
  useEffect(() => { supabase.rpc('shift_current', { p_kos: kosId }).then(({ data, error }) => setShift(error ? undefined : data)); }, [kosId, ver, done]);

  const load = async () => {
    // katalog kasir dari database tanpa harga modal (aman untuk karyawan kasir)
    const { data, error } = await supabase.rpc('kasir_catalog', { p_kos: kosId });
    if (error) return setErr(errMsg(error));
    setD({ products: data.products, units: data.units, contacts: data.customers });
  };
  useEffect(() => { load(); }, [kosId, ver]);
  // Keranjang disimpan di HP ini supaya tidak hilang saat pindah menu
  useEffect(() => { try { const s = JSON.parse(localStorage.getItem(cartKey(kosId)) || 'null'); if (s) { setCart(s.cart || []); setTier(s.tier || 'ecer'); setLead(s.lead || null); } } catch {} }, [kosId]);
  useEffect(() => { try { localStorage.setItem(cartKey(kosId), JSON.stringify({ cart, tier, lead })); } catch {} }, [cart, tier, lead, kosId]);

  const shown = useMemo(() => {
    if (!d) return [];
    const w = q.trim().toLowerCase().split(/\s+/).filter(Boolean);
    const codes = (p) => [p.sku, ...d.units.filter((u) => u.product_id === p.id).map((u) => u.barcode)].filter(Boolean).map((x) => x.toLowerCase());
    return d.products.filter((p) => w.every((x) => p.name.toLowerCase().includes(x)) || (w.length === 1 && codes(p).some((c) => c === w[0] || c.startsWith(w[0])))).slice(0, 40);
  }, [d, q]);

  if (err) return <div className="notice bad">{err.includes('kasir_catalog') ? 'Database sedang diperbarui. Coba lagi beberapa menit lagi.' : err}</div>;
  if (!d) return <Loading />;

  const add = (p, u) => {
    const key = p.id + '|' + u.name;
    const ex = cart.find((c) => c.key === key);
    if (ex) setCart(cart.map((c) => (c.key === key ? { ...c, qty: Math.round((c.qty + 1) * 1000) / 1000 } : c)));
    else setCart([...cart, { key, product_id: p.id, name: p.name, unit: u.name, unit_qty: Number(u.qty), qty: 1, price: unitPrice(u, tier), auto: true }]);
    toast(`+1 ${u.name} ${p.name}`);
  };
  // Scanner barcode (Bluetooth/USB mengetik kode lalu Enter) atau kamera: barcode cocok → langsung masuk keranjang
  const byCode = (code) => {
    const c = String(code || '').trim().toLowerCase();
    if (!c) return false;
    const u = d.units.find((x) => (x.barcode || '').toLowerCase() === c);
    const p = u ? d.products.find((x) => x.id === u.product_id) : d.products.find((x) => (x.sku || '').toLowerCase() === c);
    if (!p) { toast(`Kode ${code} belum terdaftar. Tambahkan di Barang & stok.`); return false; }
    const unit = u || unitsOf(p, d.units)[0];
    if (!(unitPrice(unit, tier) > 0)) { toast(`Harga ${unit.name} ${p.name} belum diisi.`); return null; }
    add(p, unit); setQ(''); return true;
  };
  const switchTier = (t) => {
    setTier(t);
    setCart(cart.map((c) => { if (!c.auto) return c; const u = d.units.find((x) => x.product_id === c.product_id && x.name === c.unit); return u ? { ...c, price: unitPrice(u, t) } : c; }));
  };
  const total = cart.reduce((s, c) => s + c.qty * c.price, 0);
  const count = cart.reduce((s, c) => s + c.qty, 0);

  if (d.products.length === 0) {
    return <Empty title="Belum ada barang" text="Masukkan barang dan harganya dulu, lalu kembali ke Kasir."><Link href="/barang"><button className="primary">Buka Barang & stok</button></Link></Empty>;
  }

  return (
    <div className="stack" style={{ paddingBottom: cart.length ? 90 : 0 }}>
      <div className="row between"><div className="row"><h2>Kasir</h2><PageHelp page="kasir" /></div>
        <div className="seg">{[['ecer', 'Eceran'], ['grosir', 'Grosir']].map(([k, l]) => <button key={k} className={tier === k ? 'on' : ''} onClick={() => switchTier(k)} aria-pressed={tier === k}>{l}</button>)}</div>
      </div>
      <LokasiBar note="Stok yang tampil dan berkurang adalah stok di lokasi ini." />
      {lead && <div className="notice small" style={{ display: 'flex', gap: 8, alignItems: 'center', justifyContent: 'space-between' }}>
        <span>Dari permintaan <b>{lead.number}</b> · {lead.name}. Setelah dibayar, prospeknya otomatis <b>Jadi</b>.</span>
        <button className="sm ghost" aria-label="Lepaskan dari permintaan" onClick={() => setLead(null)}>✕</button></div>}
      {shift !== undefined && moduleOn(kos, 'r_shift') && <Link href="/shift" className="small">{shift ? `Shift berjalan · seharusnya di laci ${rp(shift.summary.expected)} · Tutup shift →` : 'Belum buka shift · Buka shift (hitung uang laci) →'}</Link>}
      <div className="row" style={{ flexWrap: 'nowrap' }}>
        <input type="search" enterKeyHint="search" value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); byCode(q); } }} placeholder="Cari nama, kode, atau scan barcode" aria-label="Cari barang" style={{ flex: 1 }} />
        <ScanButton onCode={byCode} />
      </div>
      {!q.trim() && (() => {
        const fav = d.products.filter((p) => p.favorite);
        return fav.length > 0 ? (
          <div className="quickgrid" aria-label="Tombol barang cepat">{fav.map((p) => {
            const u = unitsOf(p, d.units)[0];
            const pr = u ? unitPrice(u, tier) : 0;
            return <button key={p.id} className="quick" onClick={() => u && add(p, u)} disabled={!(pr > 0)}><b>{p.name}</b><span>{u?.name} · {pr > 0 ? rp(pr) : 'harga kosong'}</span></button>;
          })}</div>
        ) : <span className="small muted">Tip: beri tanda ☆ di Barang & stok untuk barang yang sering dijual — muncul sebagai tombol cepat di sini.</span>;
      })()}
      {shown.length === 0 ? <Empty title="Barang tidak ditemukan" /> : (
        <div className="stack" style={{ gap: 10 }}>{shown.map((p) => {
          const us = unitsOf(p, d.units);
          return (
            <section className="panel" key={p.id} style={{ padding: 12, gap: 8 }}>
              <div className="row between" style={{ flexWrap: 'nowrap' }}><b>{p.name}</b>
                <span className="small" style={{ color: Number(p.stock) <= 0 || isLow(p) ? 'var(--bad)' : 'var(--muted)', whiteSpace: 'nowrap', fontWeight: 600 }}>{Number(p.stock) <= 0 ? 'stok habis' : stockText(p.stock, us, p.base_unit)}</span></div>
              <div className="unitbtns">{us.map((u) => (
                <button key={u.name} onClick={() => add(p, u)} disabled={!(unitPrice(u, tier) > 0)} title={unitPrice(u, tier) > 0 ? '' : 'Harga belum diisi'}>
                  {u.name} · {unitPrice(u, tier) > 0 ? rp(unitPrice(u, tier)) : 'harga kosong'}
                </button>
              ))}</div>
            </section>
          );
        })}</div>
      )}
      {cart.length > 0 && (
        <button className="cartbar" onClick={() => setOpen(true)}>
          <span>Keranjang · {angka(count)} barang</span><b>{rp(total)} ›</b>
        </button>
      )}
      {open && <Checkout kos={kos} kosId={kosId} d={d} tier={tier} cart={cart} setCart={setCart} lead={lead} onClose={() => setOpen(false)} reloadContacts={load}
        onDone={(r) => { setOpen(false); setCart([]); setLead(null); setDone(r); load(); }} />}
      {done && <Done r={done} onClose={() => setDone(null)} />}
    </div>
  );
}

function Checkout({ kosId, d, tier, cart, setCart, lead, onClose, onDone, reloadContacts }) {
  const [discount, setDiscount] = useState('');
  const [method, setMethod] = useState('tunai');
  const [paid, setPaid] = useState('');
  const [contact, setContact] = useState('');
  const [newName, setNewName] = useState(lead?.name || '');
  const [newPhone, setNewPhone] = useState(lead?.phone || '');
  const [due, setDue] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [txId] = useState(uid);

  const sub = cart.reduce((s, c) => s + Math.round(c.qty * c.price), 0);
  const disc = parseRp(discount);
  const total = Math.max(0, sub - disc);
  const paidN = paid.trim() ? parseRp(paid) : total;
  const change = paidN - total;
  const setLine = (key, patch) => setCart(cart.map((c) => (c.key === key ? { ...c, ...patch } : c)));
  const stockOf = (id) => Number(d.products.find((p) => p.id === id)?.stock || 0);
  const baseUsed = (id) => cart.filter((c) => c.product_id === id).reduce((s, c) => s + c.qty * c.unit_qty, 0);

  const pay = async () => {
    if (!cart.length) return toast('Keranjang kosong.');
    if (cart.some((c) => !(c.qty > 0))) return toast('Ada jumlah yang belum benar.');
    if (disc > sub) return toast('Diskon melebihi subtotal.');
    if (method === 'tunai' && paid.trim() && paidN < total) return toast('Uang diterima kurang dari total.');
    let cid = contact || null;
    setBusy(true);
    try {
      if (method === 'kasbon' && !cid) {
        if (!newName.trim()) { toast('Pilih pelanggan atau isi nama pelanggan baru.'); setBusy(false); return; }
        const { data, error } = await supabase.rpc('contact_save', { p_kos: kosId, p_id: null, p_kind: 'pelanggan', p_name: newName, p_phone: newPhone });
        if (error) throw error;
        cid = data; setContact(data); reloadContacts();
      }
      const { data, error } = await supabase.rpc('sale_create', {
        p_id: txId, p_kos: kosId, p_tier: tier,
        p_lines: cart.map((c) => ({ product_id: c.product_id, unit: c.unit, qty: c.qty, price: c.price })),
        p_discount: disc, p_method: method, p_paid: method === 'tunai' ? paidN : null, p_contact: cid, p_due: method === 'kasbon' && due ? due : null, p_note: note,
      });
      if (error) throw error;
      if (lead) { const r2 = await supabase.rpc('lead_mark_sold', { p_lead: lead.id, p_sale: txId }); if (r2.error) toast('Penjualan tersimpan, tetapi prospek belum ditandai Jadi: ' + errMsg(r2.error)); }
      onDone({ ...data, change: method === 'tunai' ? change : 0, method });
    } catch (e) { toast(errMsg(e)); }
    setBusy(false);
  };

  return (
    <Sheet title={`Bayar · ${tier === 'grosir' ? 'harga grosir' : 'harga eceran'}`} onClose={onClose}>
      <div className="list">{cart.map((c) => {
        const over = baseUsed(c.product_id) > stockOf(c.product_id);
        return (
          <div className="li" key={c.key} style={{ flexDirection: 'column', alignItems: 'stretch', gap: 6 }}>
            <div className="row between" style={{ flexWrap: 'nowrap' }}><b className="small">{c.name}</b><b className="small">{rp(c.qty * c.price)}</b></div>
            <div className="row" style={{ flexWrap: 'nowrap' }}>
              <div className="qtybox">
                <button aria-label="Kurangi" onClick={() => (c.qty <= 1 ? setCart(cart.filter((x) => x.key !== c.key)) : setLine(c.key, { qty: Math.round((c.qty - 1) * 1000) / 1000 }))}>−</button>
                <QtyInput label={`Jumlah ${c.name}`} value={c.qty} onChange={(n) => setLine(c.key, { qty: n })} />
                <button aria-label="Tambah" onClick={() => setLine(c.key, { qty: Math.round((c.qty + 1) * 1000) / 1000 })}>+</button>
              </div>
              <span className="small muted">{c.unit} ×</span>
              <input inputMode="numeric" aria-label={`Harga ${c.name}`} style={{ maxWidth: 120 }} value={angka(c.price)} onChange={(e) => setLine(c.key, { price: parseRp(e.target.value), auto: false })} />
            </div>
            {over && <span className="small" style={{ color: 'var(--bad)' }}>Melebihi stok tercatat. Tetap bisa dijual; periksa stok nanti.</span>}
          </div>
        );
      })}</div>
      <div className="row between"><span>Subtotal</span><b>{rp(sub)}</b></div>
      <Field label="Diskon (opsional)"><input inputMode="numeric" value={discount} onChange={(e) => setDiscount(e.target.value)} placeholder="0" /></Field>
      <div className="row between" style={{ fontSize: 20 }}><b>Total</b><b>{rp(total)}</b></div>

      <div className="seg">{Object.entries(PAY).map(([k, l]) => <button key={k} className={method === k ? 'on' : ''} onClick={() => setMethod(k)} aria-pressed={method === k}>{l}</button>)}</div>
      {method === 'tunai' && <>
        <Field label="Uang diterima"><input inputMode="numeric" value={paid} onChange={(e) => setPaid(e.target.value)} placeholder={angka(total)} /></Field>
        <div className="row">{[total, 20000, 50000, 100000].filter((v, i, a) => v >= total && a.indexOf(v) === i).map((v) => <button key={v} className="sm" onClick={() => setPaid(angka(v))}>{v === total ? 'Uang pas' : rp(v)}</button>)}</div>
        {paid.trim() && <div className="row between"><span>Kembalian</span><b style={{ color: change < 0 ? 'var(--bad)' : 'var(--good)' }}>{change < 0 ? 'kurang ' + rp(-change) : rp(change)}</b></div>}
      </>}
      {method === 'transfer' && <p className="small muted" style={{ margin: 0 }}>Simpan setelah uang masuk ke rekening atau QRIS terkonfirmasi.</p>}
      {method === 'kasbon' && <>
        <Field label="Pelanggan"><select value={contact} onChange={(e) => setContact(e.target.value)}><option value="">+ Pelanggan baru</option>{d.contacts.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></Field>
        {!contact && <div className="row"><Field label="Nama pelanggan baru"><input value={newName} onChange={(e) => setNewName(e.target.value)} /></Field><Field label="No. HP (opsional)"><input inputMode="tel" value={newPhone} onChange={(e) => setNewPhone(e.target.value)} /></Field></div>}
        <Field label="Janji bayar (opsional)"><input type="date" min={today()} value={due} onChange={(e) => setDue(e.target.value)} /></Field>
      </>}
      <Field label="Catatan (opsional)"><input value={note} onChange={(e) => setNote(e.target.value)} /></Field>
      <button className="cta" onClick={pay} disabled={busy}>{busy ? 'Menyimpan…' : `Simpan · ${rp(total)}`}</button>
      <button className="ghost" onClick={() => { setCart([]); onClose(); }}>Kosongkan keranjang</button>
    </Sheet>
  );
}

// Kolom jumlah yang bisa diisi desimal (mis. 1,5 kg) tanpa melompat saat mengetik koma
function QtyInput({ value, onChange, label }) {
  const [t, setT] = useState(String(value).replace('.', ','));
  useEffect(() => { if (qtyNum(t) !== value) setT(String(value).replace('.', ',')); }, [value]);
  return <input inputMode="decimal" aria-label={label} value={t} onChange={(e) => { setT(e.target.value); const n = qtyNum(e.target.value); if (isFinite(n)) onChange(n); }} />;
}

function Done({ r, onClose }) {
  return (
    <Sheet title="Transaksi tersimpan" onClose={onClose}>
      <div className="notice good">{r.number} · {rp(r.total)} · {PAY[r.method]}</div>
      {r.method === 'tunai' && r.change > 0 && <div className="row between" style={{ fontSize: 22 }}><span>Kembalian</span><b>{rp(r.change)}</b></div>}
      <Link href={`/struk/${r.id}`}><button className="primary" style={{ width: '100%' }}>Lihat / kirim struk</button></Link>
      <button className="cta" onClick={onClose}>Transaksi baru</button>
    </Sheet>
  );
}
