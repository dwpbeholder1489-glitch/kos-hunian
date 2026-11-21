'use client';
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { ScanButton } from '@/components/BarcodeScan';
import { moduleOn, canArea } from '@/lib/business';
import { supabase } from '@/lib/supabase';
import { useKos } from '@/components/KosProvider';
import PageHelp from '@/components/PageHelp';
import { PageHeader } from '@/components/Page';
import LokasiBar from '@/components/LokasiBar';
import ListThumb, { useThumbs } from '@/components/media/ListThumb';
import { Sheet, Field, Loading, Empty, run, toast } from '@/components/ui';
import { rp, angka, parseRp, errMsg, today } from '@/lib/format';
import { qtyNum, unitsOf, stockText, isLow, unitPrice, breakPrice, uid, PAY, PAY_ALL, splitSerials } from '@/lib/retail';
import { toBase } from '@/lib/units';
import { CategoryBar } from '@/components/TokoLanjut';
import { useMedia } from '@/components/Page';

// Harga dasar = sama dengan price_resolve di server: daftar harga pelanggan (bila berlaku) › harga outlet/umum
// (katalog sudah membawa harga outlet lokasi ini). Pratinjau saja — angka resmi dihitung server saat disimpan.
const listPrice = (d, contactId, pid, unit) => {
  const c = contactId ? d.contacts.find((x) => x.id === contactId) : null;
  if (!c?.price_list_id) return null;
  const it = (d.listItems || []).find((x) => x.list_id === c.price_list_id && x.product_id === pid && x.unit === unit);
  return it ? Number(it.price) : null;
};
const basePrice = (d, u, tier, contactId) => listPrice(d, contactId, u.product_id, u.name) ?? unitPrice(u, tier);
// Harga otomatis mengikuti pelanggan & jumlah (harga per jumlah beli); baris berharga manual tidak diubah
function reprice(cart, d, tier, contactId) {
  return cart.map((c) => {
    if (!c.auto) return c;
    const u = d.units.find((x) => x.product_id === c.product_id && x.name === c.unit);
    if (!u) return c;
    return { ...c, price: breakPrice(d.breaks, c.product_id, c.unit, tier, c.qty, basePrice(d, u, tier, contactId)) };
  });
}
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
  const [catF, setCatF] = useState('');   // saring per kategori
  // Laptop ≥1280: katalog + keranjang & pembayaran berdampingan (spesifikasi §17). Laptop kecil, tablet & HP: bilah keranjang + lembar Bayar.
  const desk = useMedia('(min-width: 1280px)');
  const [seq, setSeq] = useState(0); // naik setiap transaksi tersimpan → panel bayar dibuat ulang (nomor transaksi baru)
  const thumbs = useThumbs(kosId, 'product', ver);
  useEffect(() => { supabase.rpc('shift_current', { p_kos: kosId }).then(({ data, error }) => setShift(error ? undefined : data)); }, [kosId, ver, done]);

  const load = async () => {
    // katalog kasir dari database tanpa harga modal (aman untuk karyawan kasir)
    const { data, error } = await supabase.rpc('kasir_catalog', { p_kos: kosId });
    if (error) return setErr(errMsg(error));
    const c = await supabase.from('product_categories').select('id, name, sort').eq('kos_id', kosId).order('sort').order('name');
    setD({ products: data.products, units: data.units, contacts: data.customers, cats: c.data || [], breaks: data.breaks || [], policy: data.stock_policy || 'izinkan',
      listItems: data.list_items || [], pricePolicy: data.price_policy || {} });
  };
  useEffect(() => { load(); }, [kosId, ver]);
  // Keranjang disimpan di HP ini supaya tidak hilang saat pindah menu
  useEffect(() => { try { const s = JSON.parse(localStorage.getItem(cartKey(kosId)) || 'null'); if (s) { setCart(s.cart || []); setTier(s.tier || 'ecer'); setLead(s.lead || null); } } catch {} }, [kosId]);
  useEffect(() => { try { localStorage.setItem(cartKey(kosId), JSON.stringify({ cart, tier, lead })); } catch {} }, [cart, tier, lead, kosId]);

  const shown = useMemo(() => {
    if (!d) return [];
    const w = q.trim().toLowerCase().split(/\s+/).filter(Boolean);
    const codes = (p) => [p.sku, ...d.units.filter((u) => u.product_id === p.id).flatMap((u) => [u.barcode, ...(u.codes || [])])].filter(Boolean).map((x) => x.toLowerCase());
    return d.products.filter((p) => (!catF || (catF === '-' ? !p.category_id : p.category_id === catF))
      && (w.every((x) => (p.name + ' ' + (p.brand || '')).toLowerCase().includes(x)) || (w.length === 1 && codes(p).some((c) => c === w[0] || c.startsWith(w[0]))))).slice(0, catF ? 120 : 40);
  }, [d, q, catF]);

  if (err) return <div className="notice bad">{err.includes('kasir_catalog') ? 'Database sedang diperbarui. Coba lagi beberapa menit lagi.' : err}</div>;
  if (!d) return <Loading />;

  const add = (p, u) => {
    const key = p.id + '|' + u.name;
    const ex = cart.find((c) => c.key === key);
    if (ex) setCart(reprice(cart.map((c) => (c.key === key ? { ...c, qty: Math.round((c.qty + 1) * 1000) / 1000 } : c)), d, tier));
    else setCart([...cart, { key, product_id: p.id, name: p.name, unit: u.name, unit_qty: Number(u.qty), qty: 1, price: unitPrice(u, tier), auto: true, ...(p.track_serial ? { serials: '' } : {}) }]);
    const used = cart.filter((c) => c.product_id === p.id).reduce((t, c) => t + c.qty * Number(c.unit_qty || 1), 0) + Number(u.qty || 1);
    const bisa = Number(p.stock || 0) - Number(p.reserved || 0) - Number(p.held || 0);
    if (d.policy !== 'izinkan' && used > bisa) toast(d.policy === 'tolak' ? `Stok ${p.name} yang bisa dijual tinggal ${angka(Math.max(0, bisa))} ${p.base_unit} — tidak bisa dibayar melebihi itu.` : `Perhatian: ${p.name} yang bisa dijual tinggal ${angka(Math.max(0, bisa))} ${p.base_unit}${Number(p.reserved) > 0 ? ' (sebagian sudah dipesan pelanggan grosir)' : ''}.`);
    else toast(`+1 ${u.name} ${p.name}`);
  };
  // Scanner barcode (Bluetooth/USB mengetik kode lalu Enter) atau kamera: barcode cocok → langsung masuk keranjang
  const byCode = (code) => {
    const c = String(code || '').trim().toLowerCase();
    if (!c) return false;
    const u = d.units.find((x) => (x.barcode || '').toLowerCase() === c || (x.codes || []).some((k) => String(k).toLowerCase() === c));
    const p = u ? d.products.find((x) => x.id === u.product_id) : d.products.find((x) => (x.sku || '').toLowerCase() === c);
    if (!p) { toast(`Kode ${code} belum terdaftar. Tambahkan di Barang & stok.`); return false; }
    const unit = u || unitsOf(p, d.units)[0];
    if (!(unitPrice(unit, tier) > 0)) { toast(`Harga ${unit.name} ${p.name} belum diisi.`); return null; }
    add(p, unit); setQ(''); return true;
  };
  const switchTier = (t) => {
    setTier(t);
    setCart(reprice(cart, d, t));
  };
  const total = cart.reduce((s, c) => s + c.qty * c.price, 0);
  const count = cart.reduce((s, c) => s + c.qty, 0);

  if (d.products.length === 0) {
    return <Empty title="Belum ada barang" text="Masukkan barang dan harganya dulu, lalu kembali ke Kasir."><Link href="/barang"><button className="primary">Buka Barang & stok</button></Link></Empty>;
  }

  return (
    <div className={desk ? 'pos' : ''}>
    <div className="stack" style={{ paddingBottom: cart.length && !desk ? 90 : 0, minWidth: 0 }}>
      <PageHeader title="Kasir" help={<PageHelp page="kasir" />} actions={<><div className="seg">{[['ecer', 'Eceran'], ['grosir', 'Grosir']].map(([k, l]) => <button key={k} className={tier === k ? 'on' : ''} onClick={() => switchTier(k)} aria-pressed={tier === k}>{l}</button>)}</div></>} />
      <LokasiBar note="Stok yang tampil dan berkurang adalah stok di lokasi ini." />
      {lead && <div className="notice small" style={{ display: 'flex', gap: 8, alignItems: 'center', justifyContent: 'space-between' }}>
        <span>Dari permintaan <b>{lead.number}</b> · {lead.name}. Setelah dibayar, prospeknya otomatis <b>Jadi</b>.</span>
        <button className="sm ghost" aria-label="Lepaskan dari permintaan" onClick={() => setLead(null)}>✕</button></div>}
      {shift !== undefined && moduleOn(kos, 'r_shift') && <Link href="/shift" className="small">{shift ? `Shift berjalan · seharusnya di laci ${rp(shift.summary.expected)} · Tutup shift →` : 'Belum buka shift · Buka shift (hitung uang laci) →'}</Link>}
      <div className="row" style={{ flexWrap: 'nowrap' }}>
        <input type="search" enterKeyHint="search" value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); byCode(q); } }} placeholder="Cari nama, kode, atau scan barcode" aria-label="Cari barang" style={{ flex: 1 }} />
        <ScanButton onCode={byCode} />
      </div>
      {d.cats?.length > 0 && <CategoryBar cats={d.cats} value={catF} onChange={setCatF} />}
      {!q.trim() && !catF && (() => {
        const fav = d.products.filter((p) => p.favorite);
        const anyPic = fav.some((p) => thumbs[p.id]);
        return fav.length > 0 ? (
          <div className="quickgrid" aria-label="Tombol barang cepat">{fav.map((p) => {
            const u = unitsOf(p, d.units)[0];
            const pr = u ? unitPrice(u, tier) : 0;
            return <button key={p.id} className="quick" onClick={() => u && add(p, u)} disabled={!(pr > 0)}>{thumbs[p.id] ? <ListThumb path={thumbs[p.id]} radius={8} /> : anyPic && <span className="quickini" aria-hidden="true">{p.name.trim().slice(0, 1).toUpperCase()}</span>}<b>{p.name}</b><span>{u?.name} · {pr > 0 ? rp(pr) : 'harga kosong'}</span></button>;
          })}</div>
        ) : <span className="small muted">Tip: beri tanda ☆ di Barang & stok untuk barang yang sering dijual — muncul sebagai tombol cepat di sini.</span>;
      })()}
      {shown.length === 0 ? <Empty title="Barang tidak ditemukan" /> : (
        <div className={desk ? 'pos-grid' : 'stack'} style={desk ? undefined : { gap: 10 }}>{shown.map((p) => {
          const us = unitsOf(p, d.units);
          return (
            <section className="panel" key={p.id} style={{ padding: 12, gap: 8 }}>
              <div className="row between" style={{ flexWrap: 'nowrap' }}><span className="row" style={{ flexWrap: 'nowrap', gap: 10, minWidth: 0 }}>{thumbs[p.id] && <ListThumb path={thumbs[p.id]} size={40} />}<b>{p.name}</b></span>
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
      {cart.length > 0 && !desk && (
        <button className="cartbar" onClick={() => setOpen(true)}>
          <span>Keranjang · {angka(count)} barang</span><b>{rp(total)} ›</b>
        </button>
      )}
      {open && !desk && <Checkout kos={kos} kosId={kosId} d={d} tier={tier} cart={cart} setCart={setCart} lead={lead} onClose={() => setOpen(false)} reloadContacts={load}
        onDone={(r) => { setOpen(false); setCart([]); setLead(null); setDone(r); setSeq((x) => x + 1); load(); }} />}
      {done && <Done r={done} onClose={() => setDone(null)} />}
    </div>
    {desk && (cart.length > 0
      ? <Checkout key={seq} inline kos={kos} kosId={kosId} d={d} tier={tier} cart={cart} setCart={setCart} lead={lead} onClose={() => {}} reloadContacts={load}
          onDone={(r) => { setCart([]); setLead(null); setDone(r); setSeq((x) => x + 1); load(); }} />
      : <aside className="pos-cart panel" aria-label="Keranjang">
          <h3>Keranjang</h3>
          <p className="small muted" style={{ margin: 0 }}>Belum ada barang. Ketuk satuan barang di kiri, ketik nama, atau scan barcode (Enter).</p>
          <span className="small muted">Ringkasan, promo, diskon, cara bayar, dan tombol Simpan muncul di sini.</span>
        </aside>)}
    </div>
  );
}

function Checkout({ kos, kosId, d, tier, cart, setCart, lead, onClose, onDone, reloadContacts, inline }) {
  const [discount, setDiscount] = useState('');
  const [method, setMethod] = useState('tunai');
  const [paid, setPaid] = useState('');
  const [contact, setContact] = useState('');
  const [newName, setNewName] = useState(lead?.name || '');
  const [newPhone, setNewPhone] = useState(lead?.phone || '');
  const [dueDate, setDue] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [txId] = useState(uid);
  const [split, setSplit] = useState({ tunai: '', transfer: '', kasbon: '' });   // bayar campuran
  const [promo, setPromo] = useState({ total: 0, items: [] });   // promo otomatis: dihitung server, di sini hanya pratinjau
  const [promoBusy, setPromoBusy] = useState(false);
  // baris berharga otomatis tidak mengirim harga (server memakai harga resmi → ikut promo); harga yang diubah manual dikirim & tidak ikut promo
  const lineOut = (c) => ({ product_id: c.product_id, unit: c.unit, qty: c.qty, ...(c.auto ? {} : { price: c.price }), ...(splitSerials(c.serials).length ? { serials: splitSerials(c.serials) } : {}) });
  const [nota, setNota] = useState(null);   // nota kredit dipakai {id, number, balance, customer}
  const [notaOpen, setNotaOpen] = useState(false);
  const [notaNo, setNotaNo] = useState('');
  const [kw, setKw] = useState([]);   // peringatan kasbon (tidak memblokir)
  const [ov, setOv] = useState(null);  // diskon/margin melewati batas → izin pemilik/pengelola {msg, reason}
  // Pilih pelanggan → harga dasar ikut daftar harganya (bila ada)
  // Harga otomatis selalu mengikuti pelanggan terpilih — juga untuk barang yang ditambahkan setelahnya (panel bayar laptop tetap terbuka)
  useEffect(() => { const r = reprice(cart, d, tier, contact || null); if (r.some((x, i) => x.price !== cart[i].price)) setCart(r); }, [contact, cart]);
  const cartKey = JSON.stringify(cart.map((c) => [c.product_id, c.unit, c.qty, c.auto ? null : c.price])) + tier + (contact || '');
  useEffect(() => {
    if (!cart.length || cart.some((c) => !(c.qty > 0))) { setPromo({ total: 0, items: [] }); return undefined; }
    setPromoBusy(true);
    const t = setTimeout(async () => {
      const { data, error } = await supabase.rpc('promo_preview', { p_kos: kosId, p_tier: tier, p_lines: cart.map(lineOut), ...(contact ? { p_contact: contact } : {}) });
      setPromo(error || !data ? { total: 0, items: [] } : { total: Number(data.total) || 0, items: data.items || [] });
      setPromoBusy(false);
    }, 350);
    return () => clearTimeout(t);
  }, [cartKey]);

  const sub = cart.reduce((s, c) => s + Math.round(c.qty * c.price), 0);
  const disc = parseRp(discount);
  const pro = Math.min(promo.total, sub);
  const total = Math.max(0, sub - pro - disc);
  const notaAmt = nota ? Math.min(Number(nota.balance) || 0, total) : 0;
  const due = total - notaAmt;   // sisa yang dibayar dengan cara bayar biasa
  // Bayar campuran: bagian tunai/transfer/kasbon harus berjumlah sama dengan total
  const sp = { tunai: parseRp(split.tunai), transfer: parseRp(split.transfer), kasbon: parseRp(split.kasbon) };
  const spSum = sp.tunai + sp.transfer + sp.kasbon;
  const cashPart = method === 'campuran' ? sp.tunai : due;
  const paidN = paid.trim() ? parseRp(paid) : cashPart;
  const change = paidN - cashPart;
  const needContact = due > 0 && (method === 'kasbon' || (method === 'campuran' && sp.kasbon > 0));
  // Perkiraan PPN (harga termasuk PPN); angka resmi dihitung server saat disimpan
  const tax = kos?.profile?.tax;
  const rate = tax?.aktif ? Number(tax.rate) || 0 : 0;
  const taxable = cart.filter((c) => !d.products.find((p) => p.id === c.product_id)?.tax_exempt).reduce((s, c) => s + Math.round(c.qty * c.price), 0);
  const ppn = rate && sub ? Math.round(((taxable - ((disc + pro) * taxable) / sub) * rate) / (100 + rate)) : 0;
  const setLine = (key, patch) => setCart(reprice(cart.map((c) => (c.key === key ? { ...c, ...patch } : c)), d, tier, contact || null));
  // bisa dijual = stok − dipesan pelanggan grosir − ditahan (rusak/karantina)
  const stockOf = (id) => { const p = d.products.find((x) => x.id === id); return Number(p?.stock || 0) - Number(p?.reserved || 0) - Number(p?.held || 0); };
  const baseUsed = (id) => cart.filter((c) => c.product_id === id).reduce((s, c) => s + toBase(c.qty, c.unit_qty), 0);
  const base = (c) => { const u = d.units.find((x) => x.product_id === c.product_id && x.name === c.unit); return u ? basePrice(d, u, tier, contact || null) : 0; };
  const cust = contact ? d.contacts.find((x) => x.id === contact) : null;
  // Batas diskon (pratinjau; server yang memutuskan, termasuk margin minimum yang butuh harga modal)
  const pol = d.pricePolicy || {};
  const discPct = sub > 0 ? Math.round((disc * 10000) / sub) / 100 : 0;
  const overDisc = pol.max_disc != null && discPct > Number(pol.max_disc);
  const canAllow = canArea(kos, 'settings');
  // Peringatan kasbon melewati batas kredit / piutang lewat jatuh tempo — tidak memblokir (keputusan pemilik)
  const kasbonAmt = due <= 0 ? 0 : method === 'kasbon' ? due : method === 'campuran' ? sp.kasbon : 0;
  const checkNota = async () => {
    if (!notaNo.trim()) return toast('Ketik nomor nota kredit (mis. NK-261121-001).');
    const { data, error } = await supabase.rpc('credit_note_check', { p_kos: kosId, p_number: notaNo.trim() });
    if (error) return toast(errMsg(error));
    if (!data?.found) return toast('Nota kredit tidak ditemukan.');
    if (!data.usable) return toast(`${data.number}: ${data.reason}`);
    setNota(data); setNotaOpen(false);
  };
  const serialProblem = (c) => { const n = splitSerials(c.serials).length; return n > toBase(c.qty, c.unit_qty) ? `Nomor seri ${c.name} (${n}) lebih banyak dari jumlahnya.` : null; };
  useEffect(() => {
    if (!contact || !(kasbonAmt > 0)) { setKw([]); return undefined; }
    const t = setTimeout(async () => {
      const { data, error } = await supabase.rpc('kasbon_check', { p_kos: kosId, p_contact: contact, p_amount: kasbonAmt });
      setKw(error ? [] : data?.warnings || []);
    }, 400);
    return () => clearTimeout(t);
  }, [contact, kasbonAmt]);
  useEffect(() => { setOv(null); }, [cartKey, discount]);

  const pay = async (override) => {
    if (!cart.length) return toast('Keranjang kosong.');
    if (cart.some((c) => !(c.qty > 0))) return toast('Ada jumlah yang belum benar.');
    if (promoBusy) return toast('Sebentar, promo sedang dihitung.');
    if (d.policy === 'tolak') { const kurang = cart.find((c) => baseUsed(c.product_id) > stockOf(c.product_id)); if (kurang) return toast(`Stok ${kurang.name} tidak cukup. Catat stok masuk dulu (aturan stok minus: tolak).`); }
    if (disc > sub - pro) return toast(pro > 0 ? `Diskon melebihi sisa setelah promo (${rp(sub - pro)}).` : 'Diskon melebihi subtotal.');
    const sErr = cart.map(serialProblem).find(Boolean); if (sErr) return toast(sErr);
    if (due > 0 && method === 'tunai' && paid.trim() && paidN < due) return toast('Uang diterima kurang dari total.');
    if (due > 0 && method === 'campuran') {
      if (spSum !== due) return toast(`Rincian bayar ${rp(spSum)} belum sama dengan ${notaAmt ? 'sisa setelah nota ' : 'total '}${rp(due)}.`);
      if (paid.trim() && paidN < sp.tunai) return toast('Uang tunai diterima kurang dari bagian tunai.');
    }
    let cid = contact || null;
    setBusy(true);
    try {
      if (needContact && due > 0 && !cid) {
        if (!newName.trim()) { toast('Pilih pelanggan atau isi nama pelanggan baru.'); setBusy(false); return; }
        const { data, error } = await supabase.rpc('contact_save', { p_kos: kosId, p_id: null, p_kind: 'pelanggan', p_name: newName, p_phone: newPhone });
        if (error) throw error;
        cid = data; setContact(data); reloadContacts();
      }
      // Diskon/margin melewati batas: pemilik/pengelola mengizinkan dengan alasan (sale_create_ov); selain itu sale_create biasa
      // Nota kredit menutup sebagian/seluruh total; sisanya lewat cara bayar yang dipilih (jadi Campuran bila ada sisa)
      const notaPay = notaAmt > 0 ? [{ method: 'nota', amount: notaAmt, note_id: nota.id }] : [];
      const restPay = due <= 0 ? [] : method === 'campuran' ? Object.entries(sp).filter(([, v]) => v > 0).map(([m, a]) => ({ method: m, amount: a })) : [{ method, amount: due }];
      const pMethod = notaAmt > 0 ? (due <= 0 ? 'nota' : 'campuran') : method;
      const cashIn = due > 0 && (method === 'tunai' || (method === 'campuran' && sp.tunai > 0));
      const { data, error } = await supabase.rpc(override ? 'sale_create_ov' : 'sale_create', {
        ...(override ? { p_override: override } : {}),
        p_id: txId, p_kos: kosId, p_tier: tier,
        p_lines: cart.map(lineOut),
        p_discount: disc, p_method: pMethod, p_paid: cashIn ? paidN : null, p_contact: cid, p_due: needContact && due > 0 && dueDate ? dueDate : null, p_note: note,
        // dikirim hanya untuk Campuran / nota: penjualan biasa tetap jalan walau database belum diperbarui
        ...(pMethod === 'campuran' || pMethod === 'nota' ? { p_payments: [...notaPay, ...restPay] } : {}),
      });
      if (error) throw error;
      if (lead) { const r2 = await supabase.rpc('lead_mark_sold', { p_lead: lead.id, p_sale: txId }); if (r2.error) toast('Penjualan tersimpan, tetapi prospek belum ditandai Jadi: ' + errMsg(r2.error)); }
      onDone({ ...data, change: due > 0 && (method === 'tunai' || method === 'campuran') ? Math.max(0, change) : 0, method: data.method || pMethod, nota: notaAmt > 0 ? { number: nota.number, amount: notaAmt, left: Number(nota.balance) - notaAmt } : null });
    } catch (e) {
      if (/BATAS_DISKON/.test(e?.message || '')) setOv({ msg: errMsg(e), reason: '' });
      else toast(errMsg(e));
    }
    setBusy(false);
  };

  const title = `Bayar · ${tier === 'grosir' ? 'harga grosir' : 'harga eceran'}`;
  const body = (<>
      <div className="list">{cart.map((c) => {
        const over = baseUsed(c.product_id) > stockOf(c.product_id);
        return (
          <div className="li" key={c.key} style={{ flexDirection: 'column', alignItems: 'stretch', gap: 6 }}>
            <div className="row between" style={{ flexWrap: 'nowrap', alignItems: 'flex-start', gap: 8 }}><b className="small" style={{ minWidth: 0, flex: 1, overflowWrap: 'anywhere', whiteSpace: 'normal' }}>{c.name}</b><b className="small" style={{ flex: 'none', whiteSpace: 'nowrap' }}>{rp(c.qty * c.price)}</b></div>
            <div className="row" style={{ flexWrap: 'nowrap' }}>
              <div className="qtybox">
                <button aria-label="Kurangi" onClick={() => (c.qty <= 1 ? setCart(cart.filter((x) => x.key !== c.key)) : setLine(c.key, { qty: Math.round((c.qty - 1) * 1000) / 1000 }))}>−</button>
                <QtyInput label={`Jumlah ${c.name}`} value={c.qty} onChange={(n) => setLine(c.key, { qty: n })} />
                <button aria-label="Tambah" onClick={() => setLine(c.key, { qty: Math.round((c.qty + 1) * 1000) / 1000 })}>+</button>
              </div>
              <span className="small muted">{c.unit} ×</span>
              <input inputMode="numeric" aria-label={`Harga ${c.name}`} style={{ maxWidth: 120 }} value={angka(c.price)} onChange={(e) => setLine(c.key, { price: parseRp(e.target.value), auto: false })} />
            </div>
            {c.auto && listPrice(d, contact || null, c.product_id, c.unit) != null && <span className="small" style={{ color: 'var(--good)' }}>Harga khusus pelanggan{cust?.price_list ? ` (${cust.price_list})` : ''}</span>}
            {c.auto && c.price < (base(c) || 0) && <span className="small" style={{ color: 'var(--good)' }}>Harga beli banyak: {rp(c.price)} per {c.unit} (biasa {rp(base(c))})</span>}
            {c.serials !== undefined && <div className="row" style={{ flexWrap: 'nowrap', alignItems: 'flex-end', gap: 6 }}>
              <Field label={`Nomor seri / IMEI (${splitSerials(c.serials).length}/${angka(toBase(c.qty, c.unit_qty))}, boleh menyusul)`}><input value={c.serials} onChange={(e) => setLine(c.key, { serials: e.target.value })} placeholder="scan atau ketik, pisahkan koma" /></Field>
              <ScanButton onCode={(code) => { setLine(c.key, { serials: (c.serials.trim() ? c.serials.trim() + ', ' : '') + code }); return true; }} />
            </div>}
            {c.serials !== undefined && serialProblem(c) && <span className="small" style={{ color: 'var(--bad)' }}>{serialProblem(c)}</span>}
            {over && <span className="small" style={{ color: d.policy === 'tolak' ? 'var(--bad)' : 'var(--warn)' }}>{d.policy === 'tolak' ? `Melebihi stok yang bisa dijual (${angka(Math.max(0, stockOf(c.product_id)))}) — tidak bisa dibayar.` : 'Melebihi stok yang bisa dijual (sudah dikurangi pesanan grosir & barang ditahan). Tetap bisa dijual; periksa stok nanti.'}</span>}
          </div>
        );
      })}</div>
      <div className="row between"><span>Subtotal</span><b>{rp(sub)}</b></div>
      {promo.items.map((x) => <div className="row between small" key={x.id} style={{ color: 'var(--good)', flexWrap: 'nowrap', gap: 8 }}><span style={{ minWidth: 0 }}>Promo · {x.name}</span><b style={{ whiteSpace: 'nowrap' }}>−{rp(x.amount)}</b></div>)}
      {promo.items.length > 0 && cart.some((c) => !c.auto) && <span className="small muted">Barang yang harganya diubah manual tidak ikut promo.</span>}
      <Field label={pro > 0 ? 'Diskon tambahan (opsional)' : 'Diskon (opsional)'}><input inputMode="numeric" value={discount} onChange={(e) => setDiscount(e.target.value)} placeholder="0" /></Field>
      {overDisc && <span className="small" style={{ color: 'var(--warn)' }}>Diskon {angka(discPct)}% melewati batas {angka(pol.max_disc)}% dari pemilik. {canAllow ? 'Anda bisa mengizinkannya dengan alasan saat menyimpan.' : 'Perlu izin pemilik/pengelola, atau kurangi diskon.'}</span>}
      <div className="row between" style={{ fontSize: 20 }}><b>Total</b><b>{rp(total)}</b></div>
      {ppn > 0 && <span className="small muted">Termasuk PPN {rate}% ± {rp(ppn)} (dihitung pasti saat disimpan; barang bebas PPN tidak dikenai)</span>}

      {nota ? <div className="notice small" style={{ display: 'grid', gap: 4 }}>
        <div className="row between" style={{ flexWrap: 'nowrap', gap: 8 }}><span>Nota kredit <b>{nota.number}</b>{nota.customer ? ` · ${nota.customer}` : ''}</span><button className="sm ghost" aria-label="Lepas nota kredit" onClick={() => setNota(null)}>✕</button></div>
        <div className="row between"><span>Dipakai</span><b>−{rp(notaAmt)}</b></div>
        {Number(nota.balance) - notaAmt > 0 && <span className="muted">Sisa nota {rp(Number(nota.balance) - notaAmt)} tetap bisa dipakai lain kali.</span>}
        <div className="row between" style={{ fontSize: 18 }}><b>Sisa dibayar</b><b>{rp(due)}</b></div>
      </div> : notaOpen ? <div className="row" style={{ flexWrap: 'nowrap', alignItems: 'flex-end' }}>
        <Field label="Nomor nota kredit"><input value={notaNo} autoCapitalize="characters" onChange={(e) => setNotaNo(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); checkNota(); } }} placeholder="NK-…" /></Field>
        <ScanButton onCode={(c) => { setNotaNo(c); return true; }} />
        <button className="sm primary" style={{ flex: 'none' }} onClick={checkNota}>Pakai</button>
      </div> : <button className="sm ghost" style={{ alignSelf: 'flex-start' }} onClick={() => setNotaOpen(true)}>Pakai nota kredit ›</button>}
      {due > 0 && <div className="seg">{Object.entries({ ...PAY, campuran: 'Campuran' }).map(([k, l]) => <button key={k} className={method === k ? 'on' : ''} onClick={() => setMethod(k)} aria-pressed={method === k}>{l}</button>)}</div>}
      {due > 0 && method === 'campuran' && <>
        <span className="small muted">Bagi {notaAmt ? 'sisa setelah nota' : 'total'} ke beberapa cara bayar. Jumlahnya harus sama dengan {rp(due)}.</span>
        {[['tunai', 'Tunai'], ['transfer', 'Transfer / QRIS'], ['kasbon', 'Kasbon (utang pelanggan)']].map(([k, l]) => (
          <div className="row" key={k} style={{ flexWrap: 'nowrap', gap: 6 }}>
            <Field label={l}><input inputMode="numeric" value={split[k]} placeholder="0" onChange={(e) => setSplit({ ...split, [k]: e.target.value })} /></Field>
            {due - spSum + sp[k] > 0 && sp[k] !== due - spSum + sp[k] && <button className="sm" style={{ alignSelf: 'flex-end' }} onClick={() => setSplit({ ...split, [k]: angka(due - spSum + sp[k]) })}>Sisa</button>}
          </div>
        ))}
        <div className="row between"><span>Terbagi</span><b style={{ color: spSum === due ? 'var(--good)' : 'var(--bad)' }}>{rp(spSum)} dari {rp(due)}{spSum !== due ? ` · ${spSum < due ? 'kurang' : 'lebih'} ${rp(Math.abs(due - spSum))}` : ' ✓'}</b></div>
        {sp.tunai > 0 && <>
          <Field label="Uang tunai diterima (opsional)"><input inputMode="numeric" value={paid} onChange={(e) => setPaid(e.target.value)} placeholder={angka(sp.tunai)} /></Field>
          {paid.trim() && <div className="row between"><span>Kembalian</span><b style={{ color: change < 0 ? 'var(--bad)' : 'var(--good)' }}>{change < 0 ? 'kurang ' + rp(-change) : rp(change)}</b></div>}
        </>}
      </>}
      {due > 0 && method === 'tunai' && <>
        <Field label="Uang diterima"><input inputMode="numeric" value={paid} onChange={(e) => setPaid(e.target.value)} placeholder={angka(due)} /></Field>
        <div className="row">{[due, 20000, 50000, 100000].filter((v, i, a) => v >= due && a.indexOf(v) === i).map((v) => <button key={v} className="sm" onClick={() => setPaid(angka(v))}>{v === due ? 'Uang pas' : rp(v)}</button>)}</div>
        {paid.trim() && <div className="row between"><span>Kembalian</span><b style={{ color: change < 0 ? 'var(--bad)' : 'var(--good)' }}>{change < 0 ? 'kurang ' + rp(-change) : rp(change)}</b></div>}
      </>}
      {due > 0 && method === 'transfer' && <p className="small muted" style={{ margin: 0 }}>Simpan setelah uang masuk ke rekening atau QRIS terkonfirmasi.</p>}
      {/* Pelanggan: wajib untuk kasbon; untuk cara bayar lain opsional (harga khusus pelanggan & riwayat belanja) */}
      {(needContact || d.contacts.length > 0) && <Field label={needContact ? 'Pelanggan' : 'Pelanggan (opsional)'}>
        <select value={contact} onChange={(e) => setContact(e.target.value)}>
          <option value="">{needContact ? '+ Pelanggan baru' : 'Tanpa pelanggan'}</option>
          {d.contacts.map((c) => <option key={c.id} value={c.id}>{c.name}{c.price_list ? ` · ${c.price_list}` : ''}</option>)}
        </select></Field>}
      {!needContact && cust?.price_list && <span className="small muted">Harga mengikuti daftar harga <b>{cust.price_list}</b> untuk barang yang ada di daftar itu.</span>}
      {needContact && <>
        {!contact && <div className="row"><Field label="Nama pelanggan baru"><input value={newName} onChange={(e) => setNewName(e.target.value)} /></Field><Field label="No. HP (opsional)"><input inputMode="tel" value={newPhone} onChange={(e) => setNewPhone(e.target.value)} /></Field></div>}
        <Field label="Janji bayar (opsional)"><input type="date" min={today()} value={dueDate} onChange={(e) => setDue(e.target.value)} /></Field>
      </>}
      {kw.map((w) => <div key={w} className="notice small" style={{ borderColor: 'var(--warn)', color: 'var(--warn)' }}>{w}</div>)}
      <Field label="Catatan (opsional)"><input value={note} onChange={(e) => setNote(e.target.value)} /></Field>
      {ov && <div className="notice small" style={{ display: 'grid', gap: 8 }}>
        <span>{ov.msg}</span>
        {canAllow ? <>
          <Field label="Alasan mengizinkan"><input value={ov.reason} onChange={(e) => setOv({ ...ov, reason: e.target.value })} placeholder="mis. pelanggan langganan, barang hampir kedaluwarsa" /></Field>
          <button className="primary" disabled={busy || ov.reason.trim().length < 3} onClick={() => pay(ov.reason.trim())}>Izinkan & simpan</button>
        </> : <span className="muted">Kurangi diskon, atau minta pemilik/pengelola menyimpan transaksi ini dari akun mereka.</span>}
      </div>}
      <button className="cta" onClick={() => pay()} disabled={busy}>{busy ? 'Menyimpan…' : `Simpan · ${rp(total)}`}</button>
      <button className="ghost" onClick={() => { setCart([]); onClose(); }}>Kosongkan keranjang</button>
  </>);
  // Laptop: panel tetap di kanan; tablet & HP: lembar Bayar
  return inline
    ? <aside className="pos-cart panel" aria-label="Keranjang & pembayaran"><h3>{title}</h3>{body}</aside>
    : <Sheet title={title} onClose={onClose}>{body}</Sheet>;
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
      <div className="notice good">{r.number} · {rp(r.total)} · {PAY_ALL[r.method] || 'Campuran'}{Number(r.promo) > 0 ? ` · hemat promo ${rp(r.promo)}` : ''}{Number(r.tax) > 0 ? ` · termasuk PPN ${rp(r.tax)}` : ''}</div>
      {r.change > 0 && <div className="row between" style={{ fontSize: 22 }}><span>Kembalian</span><b>{rp(r.change)}</b></div>}
      {r.nota && <span className="small">Nota {r.nota.number} dipakai {rp(r.nota.amount)}{r.nota.left > 0 ? ` · sisa ${rp(r.nota.left)}` : ' · habis'}</span>}
      <Link href={`/struk/${r.id}`}><button className="primary" style={{ width: '100%' }}>Lihat / kirim struk</button></Link>
      <button className="cta" onClick={onClose}>Transaksi baru</button>
    </Sheet>
  );
}
