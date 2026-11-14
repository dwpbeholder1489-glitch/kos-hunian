'use client';
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { Sheet, Field, Loading, Empty, run, toast } from '@/components/ui';
import { rp, angka, parseRp, tgl, today, errMsg } from '@/lib/format';
import { qtyNum, unitsOf, uid } from '@/lib/retail';

// Pengadaan: permintaan pembelian, faktur supplier (pencocokan pesanan–terima–faktur), kinerja supplier.
// Semua angka & keputusan cocok/selisih dihitung server (sinv_match_calc); tampilan di sini hanya membacanya.
const REQ_ST = { diajukan: ['Menunggu persetujuan', 'gold'], disetujui: ['Disetujui', 'good'], ditolak: ['Ditolak', 'bad'], dipesan: ['Sudah dipesan', 'info'], batal: ['Dibatalkan', 'void'] };
const INV_ST = { draf: ['Draf', 'gold'], diposting: ['Diposting', 'good'], batal: ['Batal', 'void'] };
const MATCH = { cocok: ['Cocok', 'good'], selisih: ['Ada selisih', 'warn'], menunggu_barang: ['Menunggu barang', 'gold'] };
const liBtn = { background: 'none', border: 0, borderTop: '1px solid var(--line)', borderRadius: 0, textAlign: 'left', width: '100%', font: 'inherit', color: 'inherit' };
const num = (v) => String(v).replace('.', ',');

// ---------- Permintaan pembelian ----------
export function Permintaan({ kosId, d, onOrder }) {
  const [r, setR] = useState(null);
  const [names, setNames] = useState({});
  const [form, setForm] = useState(false);
  const [open, setOpen] = useState(null);
  const load = () => supabase.rpc('preq_list', { p_kos: kosId }).then(({ data, error }) => { if (error) toast(errMsg(error)); setR(data || { rows: [] }); });
  useEffect(() => { load(); supabase.rpc('member_names', { p_kos: kosId }).then(({ data }) => setNames(data || {})); }, [kosId]);
  if (!r) return <Loading />;
  const cur = open && r.rows.find((x) => x.id === open);
  return (
    <>
      <div className="row between"><span className="small muted" style={{ minWidth: 0 }}>Staf mengajukan barang yang perlu dibeli; pemilik atau bagian keuangan menyetujui, lalu dijadikan pesanan ke supplier.</span><button className="primary" style={{ flex: 'none' }} onClick={() => setForm(true)} disabled={!d.products.length}>+ Permintaan</button></div>
      {r.rows.length === 0 ? <Empty title="Belum ada permintaan pembelian" text="Cocok bila yang tahu barang habis bukan orang yang memutuskan belanja. Permintaan tidak mengubah stok atau uang." /> : (
        <section className="panel"><div className="list">{r.rows.map((x) => (
          <button className="li click" key={x.id} style={liBtn} onClick={() => setOpen(x.id)}>
            <div className="main"><b>{x.number} <span className={'chip ' + REQ_ST[x.status][1]} style={{ marginLeft: 6 }}>{REQ_ST[x.status][0]}</span></b>
              <span className="small muted">{tgl(x.req_date)} · {names[x.created_by] || 'karyawan'} · {x.lines.length} barang{x.needed_date ? ` · perlu ${tgl(x.needed_date)}` : ''}{x.purchase_number ? ` · ${x.purchase_number}` : ''}</span></div>
            <span className="small muted">›</span>
          </button>
        ))}</div></section>
      )}
      {form && <PermintaanForm kosId={kosId} d={d} onClose={() => setForm(false)} onSaved={(n) => { setForm(false); toast(`Permintaan ${n} terkirim, menunggu persetujuan`); load(); }} />}
      {cur && <PermintaanDetail x={cur} r={r} names={names} onClose={() => setOpen(null)} onChanged={() => { setOpen(null); load(); }}
        onOrder={() => { setOpen(null); onOrder({ request: cur.id, requestNo: cur.number, supplier: '', lines: cur.lines.map((l) => ({ product_id: l.product_id, unit: l.unit, qty: num(l.qty), price: l.last_price != null ? angka(l.last_price) : '' })) }); }} />}
    </>
  );
}

function PermintaanForm({ kosId, d, onClose, onSaved }) {
  const [lines, setLines] = useState([]);
  const [q, setQ] = useState('');
  const [needed, setNeeded] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [id] = useState(uid);
  const prod = new Map(d.products.map((p) => [p.id, p]));
  const w = q.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const found = w.length ? d.products.filter((p) => w.every((x) => p.name.toLowerCase().includes(x)) && !lines.some((l) => l.product_id === p.id)).slice(0, 6) : [];
  const add = (p) => { const us = unitsOf(p, d.units); const u = [...us].sort((a, b) => b.qty - a.qty)[0]; setLines([...lines, { product_id: p.id, unit: u.name, qty: '1', note: '' }]); setQ(''); };
  const set = (pid, patch) => setLines(lines.map((l) => (l.product_id === pid ? { ...l, ...patch } : l)));
  const save = async () => {
    if (!lines.length) return toast('Tambahkan barang yang diminta.');
    const bad = lines.find((l) => !(qtyNum(l.qty) > 0));
    if (bad) return toast(`Isi jumlah untuk ${prod.get(bad.product_id)?.name}.`);
    setBusy(true);
    const { data, error } = await supabase.rpc('preq_create', { p_id: id, p_kos: kosId, p_lines: lines.map((l) => ({ product_id: l.product_id, unit: l.unit, qty: qtyNum(l.qty), note: l.note })), p_needed: needed || null, p_note: note });
    setBusy(false);
    if (error) return toast(errMsg(error));
    onSaved(data.number);
  };
  return (
    <Sheet title="Permintaan pembelian" onClose={onClose}>
      <span className="small muted">Belum memesan apa pun. Permintaan ini dikirim ke pemilik/bagian keuangan untuk disetujui.</span>
      {lines.map((l) => { const p = prod.get(l.product_id); const us = unitsOf(p, d.units); return (
        <div className="unitbox" key={l.product_id}>
          <div className="row between" style={{ flexWrap: 'nowrap' }}><b className="small" style={{ minWidth: 0 }}>{p.name}</b><button className="sm ghost" onClick={() => setLines(lines.filter((x) => x.product_id !== l.product_id))}>Hapus</button></div>
          <span className="small muted">Stok sekarang {angka(p.stock)} {p.base_unit}</span>
          <div className="row">
            <Field label="Jumlah diminta"><input inputMode="decimal" value={l.qty} onChange={(e) => set(l.product_id, { qty: e.target.value })} /></Field>
            <Field label="Satuan"><select value={l.unit} onChange={(e) => set(l.product_id, { unit: e.target.value })}>{us.map((x) => <option key={x.name} value={x.name}>{x.name}</option>)}</select></Field>
          </div>
          <Field label="Keterangan (opsional)"><input value={l.note} maxLength={120} onChange={(e) => set(l.product_id, { note: e.target.value })} placeholder="mis. stok tinggal 2, banyak yang tanya" /></Field>
        </div>); })}
      <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="+ Cari barang untuk diminta" aria-label="Cari barang" />
      {found.length > 0 && <div className="list">{found.map((p) => <button key={p.id} className="li click" style={liBtn} onClick={() => add(p)}><span style={{ minWidth: 0 }}>{p.name}</span><span className="small muted" style={{ flex: 'none' }}>stok {angka(p.stock)} · tambah ›</span></button>)}</div>}
      <Field label="Dibutuhkan paling lambat (opsional)"><input type="date" min={today()} value={needed} onChange={(e) => setNeeded(e.target.value)} /></Field>
      <Field label="Catatan (opsional)"><input value={note} maxLength={200} onChange={(e) => setNote(e.target.value)} /></Field>
      <button className="cta" onClick={save} disabled={busy}>{busy ? 'Mengirim…' : 'Kirim permintaan'}</button>
    </Sheet>
  );
}

function PermintaanDetail({ x, r, names, onClose, onChanged, onOrder }) {
  const [reject, setReject] = useState(false);
  const [why, setWhy] = useState('');
  const [busy, setBusy] = useState(false);
  const act = async (fn, msg) => { setBusy(true); const ok = await run(fn, msg, errMsg); setBusy(false); if (ok) onChanged(); };
  const mine = x.created_by === r.me;
  return (
    <Sheet title={x.number} onClose={onClose}>
      <span className={'chip ' + REQ_ST[x.status][1]} style={{ alignSelf: 'flex-start' }}>{REQ_ST[x.status][0]}</span>
      <span className="small muted">Diajukan {tgl(x.req_date)} oleh {names[x.created_by] || 'karyawan'}{x.needed_date ? ` · dibutuhkan ${tgl(x.needed_date)}` : ''}</span>
      {x.note && <span className="small">Catatan: {x.note}</span>}
      {x.decided_at && <span className="small muted">{x.status === 'ditolak' ? 'Ditolak' : 'Disetujui'} oleh {names[x.decided_by] || 'pengelola'}{x.decide_note ? ` — ${x.decide_note}` : ''}</span>}
      {x.purchase_number && <span className="small">Sudah jadi pesanan <b>{x.purchase_number}</b> (lihat di tab Belanja).</span>}
      <div className="list">{x.lines.map((l) => (
        <div className="li" key={l.id} style={{ alignItems: 'flex-start' }}>
          <div className="main"><b className="small">{l.name}</b><span className="small muted">stok {angka(l.stock)}{l.last_price != null ? ` · beli terakhir ${rp(l.last_price)}/${l.unit}` : ' · belum pernah dibeli'}{l.note ? ` · ${l.note}` : ''}</span></div>
          <b className="small" style={{ flex: 'none' }}>{angka(l.qty)} {l.unit}</b>
        </div>
      ))}</div>
      {x.status === 'diajukan' && r.can_decide && (!reject ? <>
        <button className="cta" disabled={busy} onClick={() => act(() => supabase.rpc('preq_decide', { p_request: x.id, p_approve: true, p_note: null }), 'Permintaan disetujui')}>Setujui</button>
        <button className="ghost" onClick={() => setReject(true)}>Tolak</button>
      </> : <>
        <Field label="Alasan penolakan"><input value={why} onChange={(e) => setWhy(e.target.value)} placeholder="mis. stok masih cukup, tunggu bulan depan" /></Field>
        <button className="danger" disabled={busy || !why.trim()} onClick={() => act(() => supabase.rpc('preq_decide', { p_request: x.id, p_approve: false, p_note: why }), 'Permintaan ditolak')}>Tolak permintaan</button>
      </>)}
      {x.status === 'diajukan' && !r.can_decide && <div className="notice">Menunggu persetujuan pemilik atau bagian keuangan.</div>}
      {x.status === 'disetujui' && <button className="cta" onClick={onOrder}>Buat pesanan ke supplier</button>}
      {(x.status === 'diajukan' || x.status === 'disetujui') && (mine || r.can_decide) && !reject && <button className="ghost" disabled={busy} onClick={() => { if (window.confirm('Batalkan permintaan ini?')) act(() => supabase.rpc('preq_cancel', { p_request: x.id }), 'Permintaan dibatalkan'); }}>Batalkan permintaan</button>}
    </Sheet>
  );
}

// ---------- Faktur supplier ----------
export function Faktur({ kosId }) {
  const [r, setR] = useState(null);
  const [open, setOpen] = useState(null);   // purchase_id
  const load = () => supabase.rpc('sinv_list', { p_kos: kosId }).then(({ data, error }) => { if (error) toast(errMsg(error)); setR(data || { rows: [], belum: [] }); });
  useEffect(() => { load(); }, [kosId]);
  if (!r) return <Loading />;
  return (
    <>
      <span className="small muted">Catat faktur dari supplier, lalu sistem mencocokkannya dengan pesanan dan barang yang benar-benar diterima sebelum diakui sebagai utang.</span>
      {r.belum.length > 0 && <section className="panel"><h3>Barang sudah diterima, faktur belum dicatat</h3><div className="list">{r.belum.map((b) => (
        <button className="li click" key={b.id} style={liBtn} onClick={() => setOpen(b.id)}>
          <div className="main"><b className="small">{b.supplier}</b><span className="small muted">{tgl(b.purchase_date)} · {b.number}</span></div>
          <span className="small" style={{ flex: 'none' }}>{rp(b.total)} ›</span>
        </button>
      ))}</div></section>}
      {r.rows.length === 0 ? (r.belum.length === 0 && <Empty title="Belum ada faktur supplier" text="Faktur dicatat dari belanja yang ada supplier-nya. Buka belanjanya di tab Belanja, lalu ketuk Faktur supplier." />) : (
        <section className="panel"><h3>Faktur tercatat</h3><div className="list">{r.rows.map((i) => (
          <button className="li click" key={i.id} style={liBtn} onClick={() => setOpen(i.purchase_id)}>
            <div className="main"><b className="small">{i.supplier} · {i.supplier_no}</b>
              <span className="small muted">{tgl(i.invoice_date)} · {i.purchase_number}{i.due_date && i.status === 'diposting' ? ` · jatuh tempo ${tgl(i.due_date)}` : ''}</span>
              <span><span className={'chip ' + INV_ST[i.status][1]}>{INV_ST[i.status][0]}</span>{i.status !== 'batal' && i.match_status && <span className={'chip ' + MATCH[i.match_status][1]} style={{ marginLeft: 6 }}>{MATCH[i.match_status][0]}</span>}</span></div>
            <b className="small" style={{ flex: 'none', textDecoration: i.status === 'batal' ? 'line-through' : 'none' }}>{rp(i.total)}</b>
          </button>
        ))}</div></section>
      )}
      {open && <FakturSheet purchaseId={open} onClose={() => { setOpen(null); load(); }} />}
    </>
  );
}

function MatchTable({ m }) {
  return (
    <div className="list">{m.lines.map((l) => {
      const bad = l.over_recv || l.over_order || l.price_order || l.price_recv;
      return (
        <div className="li" key={l.line_id} style={{ flexDirection: 'column', alignItems: 'stretch', gap: 4 }}>
          <div className="row between" style={{ flexWrap: 'nowrap' }}><b className="small" style={{ minWidth: 0 }}>{l.name}</b><span className={'chip ' + (bad ? (l.over_recv ? 'gold' : 'warn') : 'good')} style={{ flex: 'none' }}>{bad ? (l.over_recv ? 'Menunggu barang' : 'Selisih') : 'Cocok'}</span></div>
          <dl className="kv">
            <dt>Dipesan</dt><dd>{angka(l.order_qty)} {l.unit} × {rp(l.order_price)}</dd>
            <dt>Diterima</dt><dd>{angka(l.recv_qty)} {l.unit} × {rp(l.recv_price)}</dd>
            <dt>Ditagih faktur ini</dt><dd>{angka(l.qty)} {l.unit} × {rp(l.price)}</dd>
            {Number(l.billed) > 0 && <><dt>Sudah ditagih sebelumnya</dt><dd>{angka(l.billed)} {l.unit}</dd></>}
          </dl>
          {l.over_recv && <span className="small" style={{ color: 'var(--att-fg)' }}>Ditagih lebih banyak dari yang sudah diterima.</span>}
          {!l.over_recv && l.over_order && <span className="small" style={{ color: 'var(--warn)' }}>Ditagih lebih banyak dari yang dipesan.</span>}
          {(l.price_order || l.price_recv) && <span className="small" style={{ color: 'var(--warn)' }}>Harga faktur berbeda{l.price_order ? ` dari pesanan (${rp(l.order_price)})` : ` dari harga saat diterima (${rp(l.recv_price)})`}{Number(l.diff) !== 0 ? ` · selisih ${Number(l.diff) > 0 ? '+' : '−'}${rp(Math.abs(l.diff))}` : ''}.</span>}
        </div>
      );
    })}</div>
  );
}

export function FakturSheet({ purchaseId, onClose }) {
  const [c, setC] = useState(null);
  const [f, setF] = useState(null);       // formulir: {id, supplier_no, date, due, ppn, tax, tax_no, note, lines: {line_id: {qty, price}}}
  const [post, setPost] = useState(null); // {id, reason, pay}
  const [voiding, setVoiding] = useState(null);
  const [busy, setBusy] = useState(false);
  const load = async () => {
    const { data, error } = await supabase.rpc('sinv_context', { p_purchase: purchaseId });
    if (error) { toast(errMsg(error)); onClose(); return; }
    setC(data);
    return data;
  };
  useEffect(() => { load(); }, [purchaseId]);
  if (!c) return <Sheet title="Faktur supplier" onClose={onClose}><Loading /></Sheet>;
  const p = c.purchase, taxOn = !!c.tax?.aktif, rate = Number(c.tax?.rate) || 0;
  const active = c.invoices.filter((i) => i.status !== 'batal');
  const rest = (l) => Math.max(0, Number(l.recv_qty) - Number(l.billed));
  const start = (inv) => setF({
    id: inv?.id || uid(), supplier_no: inv?.supplier_no || '', date: inv?.invoice_date || today(), due: inv?.due_date || p.due_date || '', ppn: Number(inv?.tax_amount) > 0,
    tax: inv && Number(inv.tax_amount) > 0 ? angka(inv.tax_amount) : '', taxEdited: !!inv, tax_no: inv?.tax_no || '', note: inv?.note || '',
    lines: Object.fromEntries(c.lines.map((l) => { const il = inv?.match?.lines?.find((x) => x.line_id === l.line_id); return [l.line_id, { qty: il ? num(il.qty) : rest(l) > 0 ? num(rest(l)) : '', price: angka(il ? il.price : l.recv_price) }]; })),
  });
  const sub = f ? c.lines.reduce((a, l) => a + (qtyNum(f.lines[l.line_id].qty) || 0) * parseRp(f.lines[l.line_id].price), 0) : 0;
  const autoTax = Math.round((sub * rate) / 100);
  const taxVal = f && f.ppn ? (f.taxEdited ? parseRp(f.tax) : autoTax) : 0;
  const save = async () => {
    if (!f.supplier_no.trim()) return toast('Isi nomor faktur dari supplier.');
    const lines = c.lines.map((l) => ({ line_id: l.line_id, qty: qtyNum(f.lines[l.line_id].qty) || 0, price: parseRp(f.lines[l.line_id].price) })).filter((x) => x.qty > 0);
    if (!lines.length) return toast('Isi jumlah barang yang ditagih.');
    setBusy(true);
    const { error } = await supabase.rpc('sinv_save', { p_id: f.id, p_purchase: p.id, p: { supplier_no: f.supplier_no, invoice_date: f.date, due_date: f.due || null, tax_no: f.tax_no, tax_amount: taxVal, note: f.note, lines } });
    setBusy(false);
    if (error) return toast(errMsg(error).replace(/^.*SELISIH_FAKTUR: /, ''));
    setF(null); toast('Faktur tersimpan sebagai draf. Periksa hasil pencocokannya.'); load();
  };
  const doPost = async (i) => {
    setBusy(true);
    const { data, error } = await supabase.rpc('sinv_post', { p_invoice: i.id, p_reason: post?.reason || null, p_pay: post?.pay || null });
    setBusy(false);
    if (error) return toast(errMsg(error).replace(/^.*SELISIH_FAKTUR: /, ''));
    setPost(null);
    toast(Number(data.extra) === 0 ? 'Faktur diposting. Cocok dengan barang diterima, utang tidak berubah.' : data.paid ? `Faktur diposting. Tambahan ${rp(data.extra)} dibayar.` : `Faktur diposting. Utang ke supplier ${Number(data.extra) > 0 ? 'bertambah' : 'berkurang'} ${rp(Math.abs(data.extra))}.`);
    load();
  };
  const doVoid = async (i) => {
    setBusy(true);
    const ok = await run(() => supabase.rpc('sinv_void', { p_invoice: i.id, p_reason: voiding?.reason || null }), i.status === 'draf' ? 'Draf faktur dihapus' : 'Faktur dibatalkan', errMsg);
    setBusy(false);
    if (ok) { setVoiding(null); load(); }
  };

  return (
    <Sheet title="Faktur supplier" onClose={onClose}>
      <span className="small muted">{p.supplier || 'Tanpa supplier'} · {p.number} · barang diterima senilai {rp(p.total)}</span>
      {!p.contact_id && <div className="notice">Belanja ini tidak punya supplier, jadi tidak bisa diberi faktur.</div>}

      {!f && active.map((i) => {
        const m = i.match, extra = Number(m?.variance || 0) + Number(i.tax_amount);
        const ps = post?.id === i.id ? post : null;
        return (
          <section className="panel" key={i.id} style={{ gap: 8 }}>
            <div className="row between" style={{ flexWrap: 'nowrap' }}><b style={{ minWidth: 0, overflowWrap: 'anywhere' }}>{i.supplier_no}</b><span style={{ flex: 'none' }}><span className={'chip ' + INV_ST[i.status][1]}>{INV_ST[i.status][0]}</span>{m && <span className={'chip ' + MATCH[m.status][1]} style={{ marginLeft: 6 }}>{MATCH[m.status][0]}</span>}</span></div>
            <span className="small muted">{i.number} · {tgl(i.invoice_date)}{i.due_date ? ` · jatuh tempo ${tgl(i.due_date)}` : ''}{i.tax_no ? ` · faktur pajak ${i.tax_no}` : ''}</span>
            {m && <MatchTable m={m} />}
            <dl className="kv">
              <dt>Nilai barang di faktur</dt><dd>{rp(i.subtotal)}</dd>
              {Number(i.tax_amount) > 0 && <><dt>PPN masukan</dt><dd>{rp(i.tax_amount)}</dd></>}
              <dt>Total faktur</dt><dd>{rp(i.total)}</dd>
              {m && Number(m.variance) !== 0 && <><dt>Selisih harga vs diterima</dt><dd>{Number(m.variance) > 0 ? '+' : '−'}{rp(Math.abs(m.variance))}</dd></>}
            </dl>
            {i.override_reason && <span className="small muted">Selisih disetujui: {i.override_reason}</span>}
            {i.status === 'diposting' && <span className="small muted">{extra === 0 ? 'Tidak mengubah utang: nilai barang sudah tercatat saat diterima.' : i.paid ? `Tambahan ${rp(extra)} (PPN/selisih) sudah dibayar.` : `${extra > 0 ? 'Menambah' : 'Mengurangi'} utang ke supplier ${rp(Math.abs(extra))} (PPN/selisih).`}</span>}

            {i.status === 'draf' && c.can_post && m.status === 'menunggu_barang' && <div className="notice">Belum bisa diposting: ada barang yang ditagih tetapi belum diterima. Terima dulu barangnya di tab Belanja, atau ubah jumlah di faktur. Draf ini tetap tersimpan.</div>}
            {i.status === 'draf' && c.can_post && m.status !== 'menunggu_barang' && (!ps ? <button className="cta" onClick={() => setPost({ id: i.id, reason: '', pay: '' })}>{m.status === 'cocok' ? 'Posting faktur' : 'Tinjau selisih & posting'}</button> : <>
              {m.status === 'selisih' && (c.can_override
                ? <Field label="Alasan menerima selisih" hint="Tersimpan di riwayat. Selisih harga dicatat di akun Selisih harga pembelian."><input value={ps.reason} onChange={(e) => setPost({ ...ps, reason: e.target.value })} placeholder="mis. harga naik, sudah dikonfirmasi supplier" /></Field>
                : <div className="notice">Faktur ini berbeda dari pesanan/barang diterima. Hanya pemilik atau pengelola yang bisa menyetujuinya.</div>)}
              {extra > 0 && <Field label={`Tambahan ${rp(extra)} (PPN/selisih)`}><select value={ps.pay} onChange={(e) => setPost({ ...ps, pay: e.target.value })}>
                <option value="">Jadi utang ke supplier</option><option value="kas">Sudah dibayar tunai (Kas)</option><option value="bank">Sudah dibayar transfer (Bank)</option></select></Field>}
              {extra === 0 && <span className="small muted">Faktur sama dengan barang yang diterima: tidak ada tambahan utang.</span>}
              <button className="cta" disabled={busy || (m.status === 'selisih' && (!c.can_override || !ps.reason.trim()))} onClick={() => doPost(i)}>{busy ? 'Memposting…' : 'Posting sekarang'}</button>
              <button className="ghost" onClick={() => setPost(null)}>Nanti dulu</button>
            </>)}
            {i.status === 'draf' && !ps && c.can_post && <div className="row"><button className="sm" onClick={() => start(i)}>Ubah</button><button className="sm ghost" disabled={busy} onClick={() => doVoid(i)}>Hapus draf</button></div>}
            {i.status === 'diposting' && c.can_post && (voiding?.id !== i.id ? <button className="ghost" style={{ color: 'var(--bad)' }} onClick={() => setVoiding({ id: i.id, reason: '' })}>Batalkan faktur</button> : <>
              <Field label="Alasan pembatalan" hint={i.paid ? 'Pembayaran tambahan faktur ini ikut dibatalkan.' : extra !== 0 ? 'Utang ke supplier dikembalikan seperti sebelum faktur.' : null}><input value={voiding.reason} onChange={(e) => setVoiding({ ...voiding, reason: e.target.value })} /></Field>
              <button className="danger" disabled={busy || !voiding.reason.trim()} onClick={() => doVoid(i)}>Ya, batalkan faktur</button>
            </>)}
          </section>
        );
      })}

      {!f && p.contact_id && c.can_post && p.status !== 'batal' && <button className={active.length ? '' : 'cta'} onClick={() => start(null)}>+ Catat faktur{active.length ? ' lain' : ''}</button>}
      {!f && !c.can_post && <div className="notice">Faktur dicatat dan diposting oleh pemilik atau bagian keuangan.</div>}

      {f && <>
        <div className="row">
          <Field label="No. faktur dari supplier"><input value={f.supplier_no} maxLength={60} onChange={(e) => setF({ ...f, supplier_no: e.target.value })} placeholder="mis. INV-0231" /></Field>
          <Field label="Tanggal faktur"><input type="date" max={today()} value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} /></Field>
        </div>
        {p.pay_method === 'utang' && <Field label="Jatuh tempo (opsional)" hint="Menggantikan jatuh tempo di belanja ini saat diposting."><input type="date" value={f.due} onChange={(e) => setF({ ...f, due: e.target.value })} /></Field>}
        <span className="label">Barang yang ditagih</span>
        {c.lines.map((l) => (
          <div className="unitbox" key={l.line_id}>
            <b className="small">{l.name}</b>
            <span className="small muted">dipesan {angka(l.order_qty)} × {rp(l.order_price)} · diterima {angka(l.recv_qty)} × {rp(l.recv_price)}{Number(l.billed) > 0 ? ` · sudah ditagih ${angka(l.billed)}` : ''}</span>
            <div className="row">
              <Field label={`Ditagih (${l.unit})`}><input inputMode="decimal" value={f.lines[l.line_id].qty} placeholder="0" onChange={(e) => setF({ ...f, lines: { ...f.lines, [l.line_id]: { ...f.lines[l.line_id], qty: e.target.value } } })} /></Field>
              <Field label={`Harga faktur per ${l.unit}`}><input inputMode="numeric" value={f.lines[l.line_id].price} onChange={(e) => setF({ ...f, lines: { ...f.lines, [l.line_id]: { ...f.lines[l.line_id], price: e.target.value } } })} /></Field>
            </div>
          </div>
        ))}
        {taxOn ? <>
          <label className="row small" style={{ flexWrap: 'nowrap', gap: 8 }}><input type="checkbox" style={{ width: 22, minHeight: 22, flex: 'none' }} checked={f.ppn} onChange={(e) => setF({ ...f, ppn: e.target.checked })} /><span>Faktur ini memuat PPN (ditambahkan di atas harga barang)</span></label>
          {f.ppn && <div className="row">
            <Field label="PPN masukan (Rp)" hint={rate ? `${num(rate)}% dari ${rp(sub)} = ${rp(autoTax)}. Ubah bila angka di faktur berbeda.` : 'Isi sesuai angka di faktur.'}><input inputMode="numeric" value={f.taxEdited ? f.tax : angka(autoTax)} onChange={(e) => setF({ ...f, tax: e.target.value, taxEdited: true })} /></Field>
            <Field label="No. faktur pajak (opsional)"><input value={f.tax_no} maxLength={40} onChange={(e) => setF({ ...f, tax_no: e.target.value })} /></Field>
          </div>}
        </> : <span className="small muted">PPN masukan hanya dicatat bila PPN aktif di Pengaturan › Pajak (PPN). Bila usaha Anda bukan PKP, PPN dari supplier dimasukkan ke harga barang.</span>}
        <Field label="Catatan (opsional)"><input value={f.note} maxLength={200} onChange={(e) => setF({ ...f, note: e.target.value })} /></Field>
        <dl className="kv"><dt>Nilai barang</dt><dd>{rp(sub)}</dd>{taxVal > 0 && <><dt>PPN</dt><dd>{rp(taxVal)}</dd></>}<dt>Total faktur</dt><dd>{rp(sub + taxVal)}</dd></dl>
        <button className="cta" onClick={save} disabled={busy}>{busy ? 'Menyimpan…' : 'Simpan & cocokkan'}</button>
        <button className="ghost" onClick={() => setF(null)}>Batal</button>
      </>}
    </Sheet>
  );
}

// ---------- Kinerja supplier ----------
export function KinerjaSupplier({ kosId }) {
  const [r, setR] = useState(null);
  const [days, setDays] = useState(90);
  useEffect(() => {
    setR(null);
    const to = today(), from = new Date(Date.now() - (days - 1) * 86400000).toISOString().slice(0, 10);
    supabase.rpc('supplier_scorecard', { p_kos: kosId, p_from: from, p_to: to }).then(({ data, error }) => { if (error) toast(errMsg(error)); setR(data || { rows: [] }); });
  }, [kosId, days]);
  return (
    <>
      <div className="seg">{[[30, '30 hari'], [90, '90 hari'], [365, '1 tahun']].map(([v, l]) => <button key={v} className={days === v ? 'on' : ''} onClick={() => setDays(v)} aria-pressed={days === v}>{l}</button>)}</div>
      {!r ? <Loading /> : r.rows.length === 0 ? <Empty title="Belum ada belanja ke supplier" text="Angka muncul setelah ada belanja yang memakai supplier pada rentang ini." /> : r.rows.map((s) => (
        <section className="panel" key={s.id} style={{ gap: 6 }}>
          <div className="row between" style={{ flexWrap: 'nowrap' }}><b style={{ minWidth: 0, overflowWrap: 'anywhere' }}>{s.name}</b><b style={{ flex: 'none' }}>{rp(s.nilai)}</b></div>
          <dl className="kv">
            <dt>Belanja</dt><dd>{angka(s.pesanan)} kali</dd>
            <dt>Datang tepat waktu</dt><dd>{Number(s.dijanjikan) > 0 ? `${angka(s.tepat)} dari ${angka(s.dijanjikan)} pesanan` : 'belum ada pesanan bertanggal'}</dd>
            <dt>Barang terpenuhi</dt><dd>{s.terpenuhi != null ? `${angka(s.terpenuhi)}%` : '—'}</dd>
            {s.hari_tunggu != null && <><dt>Rata-rata menunggu</dt><dd>{num(s.hari_tunggu)} hari</dd></>}
            {Number(s.retur) > 0 && <><dt>Retur</dt><dd>{rp(s.retur)}</dd></>}
            {Number(s.faktur) > 0 && <><dt>Faktur berselisih</dt><dd>{angka(s.faktur_selisih)} dari {angka(s.faktur)}</dd></>}
          </dl>
        </section>
      ))}
      <span className="small muted">Tepat waktu dihitung dari pesanan yang diberi "Perkiraan datang". Terpenuhi = jumlah diterima dibanding dipesan pada pesanan yang sudah selesai.</span>
    </>
  );
}
