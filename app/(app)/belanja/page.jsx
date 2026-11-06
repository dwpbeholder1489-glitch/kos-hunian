'use client';
import { withApproval } from '@/lib/approval';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { useKos } from '@/components/KosProvider';
import PageHelp from '@/components/PageHelp';
import LokasiBar from '@/components/LokasiBar';
import { multiLoc } from '@/lib/business';
import { Sheet, Field, Loading, Empty, Tile, run, toast } from '@/components/ui';
import { rp, angka, parseRp, tgl, today, errMsg } from '@/lib/format';
import { qtyNum, unitsOf, uid } from '@/lib/retail';

const BUY = { tunai: 'Tunai', transfer: 'Transfer', utang: 'Utang ke supplier' };
const REFUND = { potong_utang: 'Potong utang ke supplier', tunai: 'Uang kembali tunai', transfer: 'Uang kembali transfer' };
const ST = { dipesan: ['Dipesan', 'gold'], sebagian: ['Diterima sebagian', 'info'], batal: ['Batal', 'void'] };

// Belanja ke supplier: menambah stok dan menghitung ulang harga modal rata-rata
export default function Belanja() {
  const { kosId, ver, kos } = useKos();
  const [d, setD] = useState(null);
  const [err, setErr] = useState(null);
  const [form, setForm] = useState(false);
  const [open, setOpen] = useState(null);
  const load = async () => {
    const [b, p, u, c, pl, rt] = await Promise.all([
      supabase.from('purchases').select('*').eq('kos_id', kosId).order('purchase_date', { ascending: false }).order('created_at', { ascending: false }).limit(60),
      supabase.from('products').select('*').eq('kos_id', kosId).eq('active', true).order('name'),
      supabase.from('product_units').select('*').eq('kos_id', kosId),
      supabase.from('contacts').select('*').eq('kos_id', kosId).eq('kind', 'supplier').order('name'),
      supabase.from('purchase_lines').select('product_id,unit,price,purchase_id').eq('kos_id', kosId).limit(2000),
      supabase.from('purchase_returns').select('purchase_id,total,return_date').eq('kos_id', kosId).order('created_at', { ascending: false }).limit(500),
    ]);
    const e = b.error || p.error || u.error || c.error || pl.error;
    if (e) return setErr(errMsg(e));
    setD({ purchases: b.data, products: p.data, units: u.data, suppliers: c.data, lines: pl.data, returns: rt.data || [] });
  };
  useEffect(() => { load(); }, [kosId, ver]);
  if (err) return <div className="notice bad">{err.includes('purchase') ? 'Database sedang diperbarui. Coba lagi beberapa menit lagi.' : err}</div>;
  if (!d) return <Loading />;

  const sup = new Map(d.suppliers.map((s) => [s.id, s.name]));
  const month = today().slice(0, 7);
  const ok = d.purchases.filter((b) => b.status === 'selesai' || b.status === 'sebagian');
  const thisMonth = ok.filter((b) => b.purchase_date.startsWith(month));
  const waiting = d.purchases.filter((b) => b.status === 'dipesan' || b.status === 'sebagian');
  const retOf = (id) => d.returns.filter((r) => r.purchase_id === id).reduce((a, r) => a + Number(r.total), 0);
  const retMonth = d.returns.filter((r) => r.return_date.startsWith(month)).reduce((a, r) => a + Number(r.total), 0);
  const locName = (id) => kos.locs?.list?.find((x) => x.id === id)?.name;

  return (
    <div className="stack">
      <div className="row between"><div className="row"><h2>Belanja</h2><PageHelp page="belanja" /></div><button className="primary" onClick={() => setForm(true)} disabled={!d.products.length}>+ Belanja</button></div>
      <LokasiBar note="Belanja baru dicatat untuk lokasi ini; barang masuk ke stok lokasi tempat belanja dicatat." />
      <div className="grid">
        <Tile label="Belanja bulan ini" value={rp(thisMonth.reduce((a, b) => a + Number(b.total), 0) - retMonth)} sub={`${thisMonth.length} nota${retMonth ? ` · retur ${rp(retMonth)}` : ''}`} />
        <Tile label="Belanja utang bulan ini" value={rp(thisMonth.filter((b) => b.pay_method === 'utang').reduce((a, b) => a + Number(b.total), 0))} sub="pelunasan di menu Kas & kasbon" />
        <Tile label="Pesanan belum datang" value={angka(waiting.length)} tone={waiting.length ? 'gold' : ''} sub={waiting.length ? `senilai ${rp(waiting.reduce((a, b) => a + Number(b.order_total ?? b.total) - Number(b.total), 0))}` : 'tidak ada'} />
      </div>
      {!d.products.length ? (
        <Empty title="Belum ada barang" text="Tambahkan barangnya dulu di Barang & stok, lalu catat belanjanya di sini."><Link href="/barang"><button className="primary">Buka Barang & stok</button></Link></Empty>
      ) : d.purchases.length === 0 ? (
        <Empty title="Belum ada belanja" text="Catat setiap belanja ke supplier: stok bertambah otomatis dan harga modal ikut diperbarui." />
      ) : (
        <section className="panel"><div className="list">{d.purchases.map((b) => (
          <button className="li click" key={b.id} onClick={() => setOpen(b)} style={{ background: 'none', border: 0, borderTop: '1px solid var(--line)', borderRadius: 0, textAlign: 'left', width: '100%', font: 'inherit', color: 'inherit' }}>
            <div className="main"><b>{sup.get(b.contact_id) || 'Tanpa supplier'}{ST[b.status] && <span className={'chip ' + ST[b.status][1]} style={{ marginLeft: 6 }}>{ST[b.status][0]}</span>}</b>
              <span className="small muted">{tgl(b.purchase_date)} · {b.number} · {BUY[b.pay_method]}{b.status === 'dipesan' && b.expected_date ? ` · datang ${tgl(b.expected_date)}` : ''}{multiLoc(kos) && locName(b.branch_id) ? ` · ${locName(b.branch_id)}` : ''}{retOf(b.id) > 0 ? ` · diretur ${rp(retOf(b.id))}` : ''}</span></div>
            <b style={{ textDecoration: b.status === 'batal' ? 'line-through' : 'none' }}>{rp(b.status === 'dipesan' ? b.order_total : b.total)}</b>
          </button>
        ))}</div></section>
      )}
      {form && <PurchaseForm kosId={kosId} d={d} onClose={() => setForm(false)} onSaved={(r) => { setForm(false); toast(r.order_total != null ? `Pesanan ${r.number} tersimpan · stok bertambah saat barang diterima` : `${r.number} tersimpan · ${rp(r.total)}`); load(); }} />}
      {open && <Detail b={open} supplier={sup.get(open.contact_id)} loc={multiLoc(kos) ? locName(open.branch_id) : null} onClose={() => setOpen(null)} onChanged={() => { setOpen(null); load(); }} />}
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
  const [mode, setMode] = useState('terima');
  const [expected, setExpected] = useState('');
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
      const args = {
        p_id: txId, p_kos: kosId, p_date: date, p_contact: sid,
        p_lines: lines.map((l) => ({ product_id: l.product_id, unit: l.unit, qty: qtyNum(l.qty), price: parseRp(l.price) })),
        p_method: method, p_due: method === 'utang' && due ? due : null, p_note: note,
      };
      const { data, error } = mode === 'pesan'
        ? await supabase.rpc('purchase_order_create', { ...args, p_expected: expected || null })
        : await supabase.rpc('purchase_create', args);
      if (error) throw error;
      onSaved(data);
    } catch (e) { toast(errMsg(e)); }
    setBusy(false);
  };

  return (
    <Sheet title={mode === 'pesan' ? 'Buat pesanan ke supplier' : 'Catat belanja'} onClose={onClose}>
      <div className="seg">{[['terima', 'Barang sudah diterima'], ['pesan', 'Pesan dulu (belum datang)']].map(([k, l]) => <button key={k} className={mode === k ? 'on' : ''} onClick={() => setMode(k)} aria-pressed={mode === k}>{l}</button>)}</div>
      {mode === 'pesan' && <p className="small muted" style={{ margin: 0 }}>Stok belum bertambah. Saat barang datang, buka pesanan ini lalu tekan <b>Terima barang</b>.</p>}
      <div className="row">
        <Field label={mode === 'pesan' ? 'Tanggal pesan' : 'Tanggal'}><input type="date" max={today()} value={date} onChange={(e) => setDate(e.target.value)} /></Field>
        <Field label="Supplier"><select value={supplier} onChange={(e) => setSupplier(e.target.value)}><option value="">— tanpa / baru —</option>{d.suppliers.filter((s) => !s.archived_at).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></Field>
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
            {qn > 0 && pr > 0 && (mode === 'pesan' ? <span className="small muted">{rp(qn * pr)} · stok bertambah saat diterima</span> : <span className="small muted">{rp(qn * pr)} · stok +{angka(base)} {p.base_unit} · modal {rp(p.cost)} → <b>{rp(newCost)}</b>/{p.base_unit}</span>)}
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
      {mode === 'pesan' && <Field label="Perkiraan datang (opsional)"><input type="date" min={date} value={expected} onChange={(e) => setExpected(e.target.value)} /></Field>}
      {mode === 'pesan' && method !== 'utang' && <p className="small muted" style={{ margin: 0 }}>Uang keluar dari {method === 'tunai' ? 'kas' : 'bank'} sesuai nilai barang yang diterima.</p>}
      {method === 'utang' && <Field label="Jatuh tempo (opsional)"><input type="date" value={due} onChange={(e) => setDue(e.target.value)} /></Field>}
      <Field label="Catatan (opsional)"><input value={note} onChange={(e) => setNote(e.target.value)} placeholder="mis. no. nota supplier" /></Field>
      <button className="cta" onClick={save} disabled={busy}>{busy ? 'Menyimpan…' : mode === 'pesan' ? `Simpan pesanan · ${rp(total)}` : `Simpan belanja · ${rp(total)}`}</button>
    </Sheet>
  );
}

function Detail({ b, supplier, loc, onClose, onChanged }) {
  const [lines, setLines] = useState(null);
  const [rets, setRets] = useState([]);   // retur ke supplier: [{...header, lines}]
  const [ret, setRet] = useState(null);   // form retur: {qty: {line_id: '...'}, refund, reason}
  const [voiding, setVoiding] = useState(false);
  const [reason, setReason] = useState('');
  const [recv, setRecv] = useState(null);   // {line_id: {qty, price}}
  const [busy, setBusy] = useState(false);
  const [by, setBy] = useState(null);
  useEffect(() => {
    supabase.from('purchase_lines').select('*').eq('purchase_id', b.id).then(({ data }) => setLines(data || []));
    supabase.from('purchase_returns').select('*, purchase_return_lines(*)').eq('purchase_id', b.id).order('created_at').then(({ data }) => setRets(data || []));
  }, [b.id]);
  const returned = (l) => rets.reduce((a, r) => a + (r.purchase_return_lines || []).filter((x) => x.purchase_line_id === l.id).reduce((s, x) => s + Number(x.qty), 0), 0);
  const canRet = (l) => Math.max(0, Number(l.qty_received) - returned(l));
  const retTotal = ret && lines ? lines.reduce((a, l) => a + (qtyNum(ret.qty[l.id] || '') || 0) * Number(l.price), 0) : 0;
  const startRet = () => setRet({ qty: {}, refund: b.pay_method === 'utang' ? 'potong_utang' : 'tunai', reason: '' });
  const doRet = async () => {
    const items = lines.map((l) => ({ line_id: l.id, qty: qtyNum(ret.qty[l.id] || '') || 0 })).filter((x) => x.qty > 0);
    if (!items.length) return toast('Isi jumlah barang yang dikembalikan.');
    if (items.some((x) => x.qty > canRet(lines.find((l) => l.id === x.line_id)))) return toast('Jumlah retur melebihi barang yang diterima.');
    if (!window.confirm(`Retur ke ${supplier || 'supplier'} senilai ${rp(retTotal)}?\n${REFUND[ret.refund]}. Stok berkurang dan tidak bisa dibatalkan.`)) return;
    setBusy(true);
    const r = await withApproval(() => supabase.rpc('purchase_return_create', { p_id: uid(), p_purchase: b.id, p_lines: items, p_refund: ret.refund, p_reason: ret.reason }), 'Retur tersimpan, stok dikurangi',
      { kos: b.kos_id, action: 'retur_belanja', payload: { purchase_id: b.id, lines: items, refund: ret.refund }, reason: ret.reason });
    setBusy(false);
    if (r) onChanged();
  };
  useEffect(() => { if (b.created_by) supabase.rpc('member_names', { p_kos: b.kos_id }).then(({ data }) => setBy(data?.[b.created_by] || 'karyawan lama')); }, [b.id]);
  const open = b.status === 'dipesan' || b.status === 'sebagian';
  const left = (l) => Math.max(0, Number(l.qty) - Number(l.qty_received));
  const startRecv = () => setRecv(Object.fromEntries(lines.map((l) => [l.id, { qty: String(left(l)).replace('.', ','), price: angka(l.price) }])));
  const doVoid = async () => {
    if (await withApproval(() => supabase.rpc('purchase_void', { p_purchase: b.id, p_reason: reason }), Number(b.total) > 0 ? 'Belanja dibatalkan, stok dikurangi lagi' : 'Pesanan dibatalkan',
      { kos: b.kos_id, action: 'batal_belanja', payload: { purchase_id: b.id }, reason })) onChanged();
  };
  const receive = async (close) => {
    const items = recv ? lines.map((l) => ({ line_id: l.id, qty: qtyNum(recv[l.id].qty) || 0, price: parseRp(recv[l.id].price) })).filter((x) => x.qty > 0) : [];
    if (!close && !items.length) return toast('Isi jumlah barang yang diterima.');
    setBusy(true);
    const ok = await run(() => supabase.rpc('purchase_receive', { p_purchase: b.id, p_lines: items, p_date: null, p_close: close }), close && !items.length ? 'Pesanan ditutup' : 'Barang diterima, stok bertambah', errMsg);
    setBusy(false);
    if (ok) onChanged();
  };
  return (
    <Sheet title={b.number} onClose={onClose}>
      <span className="small muted">{tgl(b.purchase_date)} · {supplier || 'Tanpa supplier'} · {BUY[b.pay_method]}{b.due_date ? ` · jatuh tempo ${tgl(b.due_date)}` : ''}{b.expected_date && open ? ` · perkiraan datang ${tgl(b.expected_date)}` : ''}</span>
      {ST[b.status] && <span className={'chip ' + ST[b.status][1]} style={{ alignSelf: 'flex-start' }}>{ST[b.status][0]}</span>}
      {b.note && <span className="small">Catatan: {b.note}</span>}
      {by && <span className="small muted">Dicatat oleh {by}{loc ? ` · ${loc}` : ''}</span>}
      {b.status === 'batal' && <div className="notice bad">Dibatalkan: {b.void_reason}</div>}
      {!lines ? <Loading /> : <div className="list">{lines.map((l) => (
        <div className="li" key={l.id} style={{ flexDirection: 'column', alignItems: 'stretch', gap: 6 }}>
          <div className="row between" style={{ flexWrap: 'nowrap' }}><b className="small">{l.name}</b><b className="small">{rp(Number(l.line_total) || Number(l.qty) * Number(l.price))}</b></div>
          <span className="small muted">dipesan {angka(l.qty)} {l.unit} × {rp(l.price)}{Number(l.qty_received) !== Number(l.qty) || open ? ` · diterima ${angka(l.qty_received)}` : ''}{open && left(l) > 0 ? ` · kurang ${angka(left(l))}` : ''}{returned(l) > 0 ? ` · diretur ${angka(returned(l))}` : ''}</span>
          {ret && canRet(l) > 0 && <Field label={`Dikembalikan (${l.unit}, maks ${angka(canRet(l))})`}><input inputMode="decimal" value={ret.qty[l.id] || ''} onChange={(e) => setRet({ ...ret, qty: { ...ret.qty, [l.id]: e.target.value } })} placeholder="0" /></Field>}
          {recv && <div className="row">
            <Field label={`Diterima sekarang (${l.unit})`}><input inputMode="decimal" value={recv[l.id].qty} onChange={(e) => setRecv({ ...recv, [l.id]: { ...recv[l.id], qty: e.target.value } })} /></Field>
            <Field label={`Harga per ${l.unit}`}><input inputMode="numeric" value={recv[l.id].price} onChange={(e) => setRecv({ ...recv, [l.id]: { ...recv[l.id], price: e.target.value } })} /></Field>
          </div>}
        </div>
      ))}</div>}
      <div className="row between"><b>{open ? 'Sudah diterima' : 'Total'}</b><b>{rp(b.total)}</b></div>
      {open && <div className="row between small muted"><span>Nilai pesanan</span><span>{rp(b.order_total)}</span></div>}
      {open && lines && (!recv ? <>
        <button className="cta" onClick={startRecv}>Terima barang</button>
        <button className="ghost" onClick={() => receive(true)} disabled={busy}>{Number(b.total) > 0 ? 'Tutup pesanan (sisa tidak dikirim)' : 'Batalkan pesanan (tidak jadi)'}</button>
      </> : <>
        <p className="small muted" style={{ margin: 0 }}>Isi jumlah yang benar-benar datang. Kosongkan atau isi 0 untuk barang yang belum datang.</p>
        <button className="cta" onClick={() => receive(false)} disabled={busy}>{busy ? 'Menyimpan…' : 'Simpan penerimaan'}</button>
        <button className="ghost" onClick={() => receive(true)} disabled={busy}>Simpan & tutup pesanan</button>
      </>)}
      {rets.length > 0 && <>
        <span className="label">Retur ke supplier</span>
        <div className="list">{rets.map((r) => (
          <div className="li" key={r.id} style={{ alignItems: 'flex-start' }}>
            <div className="main"><b className="small">{r.number} · {REFUND[r.refund_method]}</b>
              <span className="small muted">{tgl(r.return_date)} · {(r.purchase_return_lines || []).map((x) => `${x.name} ${angka(x.qty)} ${x.unit}`).join(', ')} · {r.reason}</span></div>
            <b className="small">−{rp(r.total)}</b>
          </div>
        ))}</div>
      </>}
      {lines && (b.status === 'selesai' || b.status === 'sebagian') && lines.some((l) => canRet(l) > 0) && !recv && (!ret ? <button className="ghost" onClick={startRet}>Retur ke supplier</button> : <>
        <Field label="Pengembalian dari supplier"><select value={ret.refund} onChange={(e) => setRet({ ...ret, refund: e.target.value })}>
          {(b.pay_method === 'utang' ? ['potong_utang', 'tunai', 'transfer'] : ['tunai', 'transfer']).map((k) => <option key={k} value={k}>{REFUND[k]}</option>)}
        </select></Field>
        <Field label="Alasan retur"><input value={ret.reason} onChange={(e) => setRet({ ...ret, reason: e.target.value })} placeholder="mis. kemasan rusak, salah kirim, kedaluwarsa" /></Field>
        <div className="row between"><span className="small">Nilai retur (harga beli)</span><b>{rp(retTotal)}</b></div>
        <button className="cta" onClick={doRet} disabled={busy || retTotal <= 0 || ret.reason.trim().length < 3}>{busy ? 'Menyimpan…' : 'Simpan retur'}</button>
        <button className="ghost" onClick={() => setRet(null)}>Batal</button>
      </>)}
      {Number(b.total) > 0 && b.status !== 'batal' && !rets.length && (!voiding ? <button className="ghost" style={{ color: 'var(--bad)' }} onClick={() => setVoiding(true)}>Batalkan belanja</button> : <>
        <Field label="Alasan pembatalan"><input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="mis. salah input, barang diretur" /></Field>
        <button className="danger" onClick={doVoid} disabled={!reason.trim()}>Ya, batalkan & kurangi stok</button>
      </>)}
    </Sheet>
  );
}
