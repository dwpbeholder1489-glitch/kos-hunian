'use client';
// Grosir & B2B: penawaran → pesanan (cek batas kredit) → surat jalan bertahap → faktur (penjualan grosir) → piutang.
// Server: so_save / so_confirm / so_deliver / so_delivery_status / so_cancel, price_list_*, customer_credit, receivable_open.
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { useKos } from '@/components/KosProvider';
import { useBaru } from '@/lib/useBaru';
import PageHelp from '@/components/PageHelp';
import { Sheet, Field, Loading, Empty, Tile, toast } from '@/components/ui';
import { rp, angka, parseRp, tgl, today, errMsg, waLink } from '@/lib/format';
import { qtyNum, unitsOf, uid } from '@/lib/retail';
import { canArea } from '@/lib/business';

const SO_ST = { penawaran: ['Penawaran', 'gold'], dikonfirmasi: ['Pesanan · belum dikirim', 'info'], sebagian: ['Dikirim sebagian', 'info'], selesai: ['Selesai', 'good'], batal: ['Batal', 'void'] };
const DV_ST = { dikirim: ['Dalam pengiriman', 'gold'], diterima: ['Diterima', 'good'], gagal: ['Gagal kirim', 'bad'] };
const PAY = { kasbon: 'Piutang (tempo)', tunai: 'Tunai', transfer: 'Transfer' };
const LI = { background: 'none', border: 0, borderTop: '1px solid var(--line)', borderRadius: 0, textAlign: 'left', width: '100%', font: 'inherit', color: 'inherit' };

export default function Grosir() {
  const { kosId, kos, ver } = useKos();
  const [tab, setTab] = useState('jalan');
  useEffect(() => { try { if (new URLSearchParams(window.location.search).get('tab') === 'harga') setTab('harga'); } catch {} }, []);
  const [d, setD] = useState(null);
  const [err, setErr] = useState(null);
  const [form, setForm] = useState(null); // {order?} untuk baru/ubah
  const [open, setOpen] = useState(null);
  useBaru(() => setForm({}));
  const load = async () => {
    const [o, l, dv, p, u, c, pl, ro] = await Promise.all([
      supabase.from('so_orders').select('*').eq('kos_id', kosId).order('created_at', { ascending: false }).limit(200),
      supabase.from('so_lines').select('*').eq('kos_id', kosId).order('sort').limit(3000),
      supabase.from('so_deliveries').select('*').eq('kos_id', kosId).order('created_at', { ascending: false }).limit(500),
      supabase.from('products').select('*').eq('kos_id', kosId).eq('active', true).order('name'),
      supabase.from('product_units').select('*').eq('kos_id', kosId),
      supabase.from('contacts').select('*').eq('kos_id', kosId).eq('kind', 'pelanggan').is('archived_at', null).order('name'),
      supabase.from('price_lists').select('*').eq('kos_id', kosId).is('archived_at', null).order('name'),
      supabase.rpc('receivable_open', { p_kos: kosId, p_contact: null }),
    ]);
    const e = o.error || l.error || dv.error || p.error || u.error || c.error;
    if (e) return setErr(errMsg(e));
    setD({ orders: o.data, lines: l.data, deliveries: dv.data, products: p.data, units: u.data, customers: c.data, lists: pl.data || [], recv: ro.data || [] });
  };
  useEffect(() => { load(); }, [kosId, ver]);
  if (err) return <div className="notice bad">{/so_orders|price_lists/.test(err) ? 'Database sedang diperbarui. Coba lagi beberapa menit lagi.' : err}</div>;
  if (!d) return <Loading />;

  const cust = new Map(d.customers.map((c) => [c.id, c]));
  const t0 = today();
  const running = d.orders.filter((o) => ['dikonfirmasi', 'sebagian'].includes(o.status));
  const quotes = d.orders.filter((o) => o.status === 'penawaran');
  const done = d.orders.filter((o) => ['selesai', 'batal'].includes(o.status));
  const remainOf = (o) => d.lines.filter((l) => l.order_id === o.id).reduce((a, l) => a + (Number(l.qty) - Number(l.qty_sent)) * Number(l.price), 0);
  const overdue = d.recv.filter((r) => r.due_date < t0).reduce((a, r) => a + Number(r.open_amount), 0);
  const onRoad = d.deliveries.filter((x) => x.status === 'dikirim').length;
  const list = tab === 'jalan' ? running : tab === 'penawaran' ? quotes : done;
  const finance = canArea(kos, 'finance');

  return (
    <div className="stack">
      <div className="row between"><div className="row"><h2>Pesanan grosir</h2><PageHelp page="grosir" /></div>
        {tab !== 'harga' && <button className="primary" onClick={() => setForm({})} disabled={!d.products.length}>+ Penawaran</button>}</div>
      <div className="grid">
        <Tile label="Pesanan berjalan" value={angka(running.length)} sub={running.length ? `sisa kirim ${rp(running.reduce((a, o) => a + remainOf(o), 0))}` : 'tidak ada'} />
        <Tile label="Dalam pengiriman" value={angka(onRoad)} tone={onRoad ? 'gold' : ''} sub="surat jalan belum diterima" />
        <Tile label="Piutang lewat tempo" value={rp(overdue)} tone={overdue ? 'bad' : ''} sub={overdue ? 'tagih lewat WhatsApp' : 'aman'} />
      </div>
      <div className="seg">{[['jalan', `Berjalan (${running.length})`], ['penawaran', `Penawaran (${quotes.length})`], ['selesai', 'Selesai'], ['harga', 'Daftar harga']].map(([k, l]) => <button key={k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>{l}</button>)}</div>

      {tab === 'harga' ? <PriceLists d={d} kosId={kosId} canEdit={finance} onChanged={load} /> : !d.products.length ? (
        <Empty title="Belum ada barang" text="Tambahkan barang dulu di Barang & stok."><Link href="/barang"><button className="primary">Buka Barang & stok</button></Link></Empty>
      ) : list.length === 0 ? (
        <Empty title={tab === 'penawaran' ? 'Belum ada penawaran' : tab === 'jalan' ? 'Tidak ada pesanan berjalan' : 'Belum ada pesanan selesai'}
          text={tab === 'selesai' ? 'Pesanan yang semua barangnya sudah dikirim atau dibatalkan tampil di sini.' : 'Buat penawaran harga untuk pelanggan grosir/toko, lalu konfirmasi jadi pesanan saat disetujui. Barang dikirim dengan surat jalan (boleh bertahap); fakturnya terbit otomatis.'} />
      ) : (
        <section className="panel"><div className="list">{list.map((o) => {
          const dvs = d.deliveries.filter((x) => x.order_id === o.id);
          const expired = o.status === 'penawaran' && o.valid_until && o.valid_until < t0;
          return (
            <button className="li click" key={o.id} onClick={() => setOpen(o.id)} style={LI}>
              <div className="main"><b>{cust.get(o.contact_id)?.name || '—'} <span className={'chip ' + SO_ST[o.status][1]} style={{ marginLeft: 4 }}>{SO_ST[o.status][0]}</span>{expired && <span className="chip bad" style={{ marginLeft: 4 }}>Lewat masa berlaku</span>}</b>
                <span className="small muted">{o.number} · {tgl(o.order_date)}{o.customer_ref ? ` · ${/^po/i.test(o.customer_ref) ? '' : 'PO '}${o.customer_ref}` : ''}{o.need_date ? ` · perlu ${tgl(o.need_date)}` : ''}{dvs.length ? ` · ${dvs.length} surat jalan` : ''}</span></div>
              <div style={{ textAlign: 'right' }}><b>{rp(o.total)}</b>{['dikonfirmasi', 'sebagian'].includes(o.status) && <div className="small muted">sisa {rp(remainOf(o))}</div>}</div>
            </button>
          );
        })}</div></section>
      )}
      {form && <OrderForm kosId={kosId} kos={kos} d={d} order={form.order} onClose={() => setForm(null)} onSaved={(id) => { setForm(null); load(); setOpen(id); }} />}
      {open && d.orders.find((o) => o.id === open) && <OrderDetail kos={kos} d={d} order={d.orders.find((o) => o.id === open)} onClose={() => setOpen(null)} onEdit={(o) => { setOpen(null); setForm({ order: o }); }} onChanged={load} />}
    </div>
  );
}

// Ringkasan kredit pelanggan (batas, piutang, terlambat)
function CreditBox({ cr, extra = 0 }) {
  if (!cr) return null;
  const used = Number(cr.balance) + Number(cr.open_orders) + extra;
  const over = cr.limit != null && used > Number(cr.limit);
  return (
    <div className="unitbox small" style={{ gap: 4 }}>
      <span>Piutang sekarang <b>{rp(cr.balance)}</b>{Number(cr.open_orders) > 0 ? <> · pesanan berjalan <b>{rp(cr.open_orders)}</b></> : null}{cr.terms_days != null ? ` · tempo ${cr.terms_days} hari` : ''}</span>
      {cr.limit != null ? <span style={{ color: over ? 'var(--bad)' : undefined }}>Batas kredit {rp(cr.limit)} · {over ? <b>terlewati {rp(used - Number(cr.limit))}</b> : <>sisa {rp(Number(cr.limit) - used)}</>}</span>
        : <span className="muted">Belum ada batas kredit (atur di Pelanggan & supplier › ketuk nama › Syarat pelanggan).</span>}
      {Number(cr.overdue) > 0 && <span style={{ color: 'var(--bad)' }}>Piutang lewat jatuh tempo {rp(cr.overdue)} (terlama {cr.overdue_days} hari)</span>}
      {cr.price_list && <span>Memakai daftar harga <b>{cr.price_list}</b></span>}
    </div>
  );
}

function OrderForm({ kosId, kos, d, order, onClose, onSaved }) {
  const old = order ? d.lines.filter((l) => l.order_id === order.id) : [];
  const [contact, setContact] = useState(order?.contact_id || '');
  const [cr, setCr] = useState(null);
  const [plist, setPlist] = useState(null);
  const [lines, setLines] = useState(old.map((l) => ({ key: l.id, id: l.id, product_id: l.product_id, unit: l.unit, qty: angka(l.qty), price: angka(l.price), sent: Number(l.qty_sent) })));
  const [q, setQ] = useState('');
  const [f, setF] = useState({ customer_ref: order?.customer_ref || '', ship_address: order?.ship_address || '', terms_days: order?.terms_days != null ? String(order.terms_days) : '',
    valid_until: order?.valid_until || plusD(today(), 7), need_date: order?.need_date || '', note: order?.note || '' });
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [id] = useState(() => order?.id || uid());
  const set = (k, v) => setF((x) => ({ ...x, [k]: v }));
  useEffect(() => {
    if (!contact) { setCr(null); setPlist(null); return; }
    supabase.rpc('customer_credit', { p_contact: contact }).then(({ data }) => {
      setCr(data || null);
      if (data && !order) setF((x) => ({ ...x, ship_address: x.ship_address || data.address || '', terms_days: x.terms_days || (data.terms_days != null ? String(data.terms_days) : '') }));
    });
    supabase.rpc('price_list_for_contact', { p_kos: kosId, p_contact: contact }).then(({ data }) => setPlist(data || null));
  }, [contact]);
  const prodById = new Map(d.products.map((p) => [p.id, p]));
  const priceOf = (p, u) => {
    const li = plist?.items?.find((x) => x.product_id === p.id && x.unit === u.name);
    if (li) return [Number(li.price), 'daftar'];
    if (Number(u.price_wholesale) > 0) return [Number(u.price_wholesale), 'grosir'];
    return [Number(u.price_retail), 'eceran'];
  };
  const w = q.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const found = w.length ? d.products.filter((p) => w.every((x) => (p.name + ' ' + (p.barcode || '')).toLowerCase().includes(x))).slice(0, 6) : [];
  const addProduct = (p) => {
    const us = unitsOf(p, d.units);
    const u = [...us].sort((a, b) => b.qty - a.qty)[0];
    setLines([...lines, { key: uid(), product_id: p.id, unit: u.name, qty: '1', price: angka(priceOf(p, u)[0]), sent: 0 }]);
    setQ('');
  };
  const setL = (key, patch) => setLines(lines.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  const total = lines.reduce((s, l) => s + (qtyNum(l.qty) || 0) * parseRp(l.price), 0);
  const already = order && ['dikonfirmasi', 'sebagian'].includes(order.status);
  const exposure = cr ? Number(cr.balance) + Number(cr.open_orders) + (already ? 0 : total) : 0;
  const over = cr?.limit != null && !already && exposure > Number(cr.limit);
  const owner = canArea(kos, 'settings');

  const save = async (confirm) => {
    if (!contact) return toast('Pilih pelanggan.');
    if (!lines.length) return toast('Tambahkan barang.');
    const bad = lines.find((l) => !(qtyNum(l.qty) > 0) || l.price === '');
    if (bad) return toast(`Isi jumlah dan harga ${prodById.get(bad.product_id)?.name}.`);
    if (confirm && over && owner && reason.trim().length < 3) return toast('Tulis alasan melewati batas kredit.');
    setBusy(true);
    const { data, error } = await supabase.rpc('so_save', { p_id: id, p_kos: kosId, p: { contact_id: contact, confirm,
      override_reason: confirm && over ? reason : null, ...f, terms_days: f.terms_days === '' ? null : f.terms_days,
      lines: lines.map((l) => ({ id: l.id || null, product_id: l.product_id, unit: l.unit, qty: qtyNum(l.qty), price: parseRp(l.price) })) } });
    setBusy(false);
    if (error) return toast(errMsg(error).replace(/^BATAS_KREDIT:\s*/, ''));
    toast(confirm ? `Pesanan ${data.number} dikonfirmasi` : `${order ? 'Disimpan' : 'Penawaran ' + data.number + ' disimpan'}`);
    (data.warnings || []).forEach((m, i) => setTimeout(() => toast(m), 2500 * (i + 1)));
    onSaved(data.id || id);
  };

  return (
    <Sheet title={order ? `Ubah ${order.number}` : 'Penawaran / pesanan baru'} onClose={onClose}>
      <Field label="Pelanggan"><select value={contact} onChange={(e) => setContact(e.target.value)} disabled={order && order.status !== 'penawaran' && d.deliveries.some((x) => x.order_id === order.id)}>
        <option value="">— pilih pelanggan —</option>{d.customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></Field>
      {!d.customers.length && <span className="small muted">Belum ada pelanggan. Tambahkan dulu di <Link href="/kontak?baru=1">Pelanggan & supplier</Link>.</span>}
      <CreditBox cr={cr} extra={already ? 0 : total} />

      <span className="label">Barang</span>
      {lines.map((l) => {
        const p = prodById.get(l.product_id); if (!p) return null;
        const us = unitsOf(p, d.units);
        const u = us.find((x) => x.name === l.unit) || us[0];
        const [ref, src] = priceOf(p, u);
        return (
          <div className="unitbox" key={l.key}>
            <div className="row between" style={{ flexWrap: 'nowrap' }}><b className="small">{p.name}</b>{l.sent > 0 ? <span className="small muted">terkirim {angka(l.sent)}</span> : <button className="sm ghost" onClick={() => setLines(lines.filter((x) => x.key !== l.key))}>Hapus</button>}</div>
            <div className="row">
              <Field label="Jumlah"><input inputMode="decimal" value={l.qty} onChange={(e) => setL(l.key, { qty: e.target.value })} /></Field>
              <Field label="Satuan"><select value={l.unit} disabled={l.sent > 0} onChange={(e) => { const nu = us.find((x) => x.name === e.target.value); setL(l.key, { unit: e.target.value, price: angka(priceOf(p, nu)[0]) }); }}>{us.map((x) => <option key={x.name} value={x.name}>{x.name}{Number(x.qty) !== 1 ? ` (${angka(x.qty)} ${p.base_unit})` : ''}</option>)}</select></Field>
              <Field label={`Harga per ${l.unit}`}><input inputMode="numeric" value={l.price} onChange={(e) => setL(l.key, { price: e.target.value })} /></Field>
            </div>
            <span className="small muted">{rp((qtyNum(l.qty) || 0) * parseRp(l.price))} · harga {src === 'daftar' ? 'daftar pelanggan' : src} {rp(ref)}{parseRp(l.price) !== ref ? ' (diubah)' : ''} · stok {angka(p.stock)} {p.base_unit}</span>
          </div>
        );
      })}
      <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="+ Cari barang (nama atau barcode)" aria-label="Cari barang" />
      {found.length > 0 && <div className="list">{found.map((p) => <button key={p.id} className="li click" onClick={() => addProduct(p)} style={LI}><span>{p.name}</span><span className="small muted">tambah ›</span></button>)}</div>}
      {w.length > 0 && found.length === 0 && <p className="small muted" style={{ margin: 0 }}>Tidak ditemukan. Tambahkan dulu di <Link href="/barang">Barang & stok</Link>.</p>}
      <div className="row between" style={{ fontSize: 20 }}><b>Total</b><b>{rp(total)}</b></div>

      <div className="row">
        <Field label="No. PO pelanggan (opsional)"><input value={f.customer_ref} maxLength={60} onChange={(e) => set('customer_ref', e.target.value)} /></Field>
        <Field label="Tempo bayar (hari)" hint="kosong = ikut pelanggan"><input inputMode="numeric" value={f.terms_days} onChange={(e) => set('terms_days', e.target.value.replace(/\D/g, ''))} placeholder="mis. 14" /></Field>
      </div>
      <Field label="Alamat kirim"><input value={f.ship_address} maxLength={300} onChange={(e) => set('ship_address', e.target.value)} placeholder="kosong = ambil sendiri" /></Field>
      <div className="row">
        {(!order || order.status === 'penawaran') && <Field label="Penawaran berlaku sampai"><input type="date" value={f.valid_until} onChange={(e) => set('valid_until', e.target.value)} /></Field>}
        <Field label="Dibutuhkan tanggal (opsional)"><input type="date" value={f.need_date} onChange={(e) => set('need_date', e.target.value)} /></Field>
      </div>
      <Field label="Catatan (opsional)"><input value={f.note} maxLength={500} onChange={(e) => set('note', e.target.value)} placeholder="mis. harga belum termasuk ongkir" /></Field>
      {(!order || order.status === 'penawaran') && over && (owner
        ? <Field label="Alasan melewati batas kredit (wajib bila langsung dikonfirmasi)"><input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="mis. pelanggan lama, bayar tiap Jumat" /></Field>
        : <div className="notice small">Pesanan ini melewati batas kredit pelanggan. Simpan sebagai penawaran, lalu minta pemilik/pengelola mengonfirmasi.</div>)}
      {(!order || order.status === 'penawaran') ? (
        <div className="row">
          <button disabled={busy} onClick={() => save(false)}>{busy ? 'Menyimpan…' : 'Simpan penawaran'}</button>
          <button className="primary" disabled={busy || (over && !owner)} onClick={() => save(true)}>Simpan & jadikan pesanan</button>
        </div>
      ) : <button className="cta" disabled={busy} onClick={() => save(false)}>{busy ? 'Menyimpan…' : 'Simpan perubahan'}</button>}
      <span className="small muted">Penawaran & pesanan belum mengubah stok atau uang. Stok berkurang dan faktur terbit saat surat jalan dibuat.</span>
    </Sheet>
  );
}
const plusD = (iso, n) => new Date(new Date(iso + 'T00:00:00Z').getTime() + n * 864e5).toISOString().slice(0, 10);

function OrderDetail({ kos, d, order: o, onClose, onEdit, onChanged }) {
  const c = d.customers.find((x) => x.id === o.contact_id);
  const lines = d.lines.filter((l) => l.order_id === o.id);
  const dvs = d.deliveries.filter((x) => x.order_id === o.id);
  const [cr, setCr] = useState(null);
  const [mode, setMode] = useState(null); // kirim | konfirmasi | batal
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => { supabase.rpc('customer_credit', { p_contact: o.contact_id }).then(({ data }) => setCr(data || null)); }, [o.id, o.status]);
  const remaining = lines.reduce((a, l) => a + (Number(l.qty) - Number(l.qty_sent)) * Number(l.price), 0);
  const owner = canArea(kos, 'settings');
  const over = cr?.limit != null && o.status === 'penawaran' && Number(cr.balance) + Number(cr.open_orders) + Number(o.total) > Number(cr.limit);
  const act = async (fn, args, ok) => {
    setBusy(true);
    const { data, error } = await supabase.rpc(fn, args);
    setBusy(false);
    if (error) { toast(errMsg(error).replace(/^BATAS_KREDIT:\s*/, '')); return null; }
    if (ok) toast(ok);
    (data?.warnings || []).forEach((m, i) => setTimeout(() => toast(m), 2500 * (i + 1)));
    setMode(null); setReason(''); onChanged();
    return data || true;
  };
  const waText = `Halo ${c?.name || ''}, berikut ${o.status === 'penawaran' ? 'penawaran harga' : 'pesanan'} ${o.number} dari ${kos.name}:\n\n` +
    lines.map((l) => `• ${l.name} ${angka(l.qty)} ${l.unit} × ${rp(l.price)} = ${rp(l.line_total)}`).join('\n') +
    `\n\nTotal ${rp(o.total)}${o.terms_days ? `\nPembayaran tempo ${o.terms_days} hari setelah barang dikirim` : ''}${o.status === 'penawaran' && o.valid_until ? `\nBerlaku sampai ${tgl(o.valid_until)}` : ''}${o.note ? `\n${o.note}` : ''}\n\nBalas pesan ini untuk konfirmasi. Terima kasih.`;
  return (
    <Sheet title={`${o.number} · ${c?.name || ''}`} onClose={onClose}>
      <div className="row" style={{ gap: 6 }}><span className={'chip ' + SO_ST[o.status][1]}>{SO_ST[o.status][0]}</span>{o.customer_ref && <span className="chip">{/^po/i.test(o.customer_ref) ? '' : 'PO '}{o.customer_ref}</span>}</div>
      <dl className="kv">
        <dt>Tanggal</dt><dd>{tgl(o.order_date)}</dd>
        {o.status === 'penawaran' && o.valid_until && <><dt>Berlaku sampai</dt><dd>{tgl(o.valid_until)}</dd></>}
        {o.need_date && <><dt>Dibutuhkan</dt><dd>{tgl(o.need_date)}</dd></>}
        <dt>Alamat kirim</dt><dd>{o.ship_address || 'ambil sendiri'}</dd>
        <dt>Tempo bayar</dt><dd>{o.terms_days != null ? `${o.terms_days} hari` : '—'}</dd>
        {o.note && <><dt>Catatan</dt><dd>{o.note}</dd></>}
        {o.credit_check?.override && <><dt>Lewat batas kredit</dt><dd>{o.credit_check.override}</dd></>}
        {o.close_reason && <><dt>Alasan ditutup</dt><dd>{o.close_reason}</dd></>}
      </dl>
      {o.status !== 'selesai' && o.status !== 'batal' && <CreditBox cr={cr} extra={o.status === 'penawaran' ? Number(o.total) : 0} />}
      <section className="panel" style={{ gap: 6 }}><span className="label">Barang</span>
        <div className="list">{lines.map((l) => (
          <div className="li" key={l.id}><div className="main"><b className="small">{l.name}</b><span className="small muted">{angka(l.qty)} {l.unit} × {rp(l.price)}{Number(l.qty_sent) > 0 ? ` · terkirim ${angka(l.qty_sent)}` : ''}{['dikonfirmasi', 'sebagian'].includes(o.status) && Number(l.qty) > Number(l.qty_sent) ? ` · sisa ${angka(Number(l.qty) - Number(l.qty_sent))}` : ''}</span></div><b className="small">{rp(l.line_total)}</b></div>
        ))}</div>
        <div className="row between"><b>Total</b><b>{rp(o.total)}</b></div>
        {['dikonfirmasi', 'sebagian'].includes(o.status) && <span className="small muted">Belum dikirim senilai {rp(remaining)}</span>}
      </section>

      {dvs.length > 0 && <section className="panel" style={{ gap: 6 }}><span className="label">Surat jalan & faktur</span>
        {dvs.map((x) => <DeliveryRow key={x.id} x={x} kos={kos} onChanged={onChanged} />)}</section>}

      {mode === 'kirim' && <DeliverForm o={o} c={c} lines={lines} onDone={() => { setMode(null); onChanged(); }} />}
      {mode === 'batal' && <div className="unitbox"><Field label={dvs.some((x) => x.status !== 'gagal') ? 'Alasan menutup sisa pesanan' : 'Alasan membatalkan'}><input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="mis. pelanggan tidak jadi, stok habis" /></Field>
        <button className="danger" disabled={busy} onClick={() => act('so_cancel', { p_order: o.id, p_reason: reason }, dvs.some((x) => x.status !== 'gagal') ? 'Sisa pesanan ditutup' : 'Pesanan dibatalkan')}>Ya, {dvs.some((x) => x.status !== 'gagal') ? 'tutup sisa' : 'batalkan'}</button></div>}
      {mode === 'konfirmasi' && <div className="unitbox">
        {over && owner && <Field label="Alasan melewati batas kredit"><input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="mis. pelanggan lama, bayar tiap Jumat" /></Field>}
        {over && !owner && <span className="small" style={{ color: 'var(--bad)' }}>Melewati batas kredit — hanya pemilik/pengelola yang bisa mengonfirmasi.</span>}
        <button className="primary" disabled={busy || (over && !owner)} onClick={() => act('so_confirm', { p_order: o.id, p_override: reason || null }, 'Penawaran dikonfirmasi jadi pesanan')}>Konfirmasi jadi pesanan</button></div>}

      <div className="row" style={{ flexWrap: 'wrap' }}>
        {o.status === 'penawaran' && mode !== 'konfirmasi' && <button className="primary" onClick={() => setMode('konfirmasi')}>Pelanggan setuju → jadikan pesanan</button>}
        {['dikonfirmasi', 'sebagian'].includes(o.status) && mode !== 'kirim' && <button className="primary" onClick={() => setMode('kirim')}>Buat surat jalan</button>}
        {!['selesai', 'batal'].includes(o.status) && <button onClick={() => onEdit(o)}>Ubah</button>}
        <Link href={`/dokumen/grosir/${o.id}`}><button>{o.status === 'penawaran' ? 'Cetak penawaran' : 'Cetak pesanan'}</button></Link>
        {c?.phone && <a href={waLink(c.phone, waText)} target="_blank" rel="noreferrer"><button>Kirim WA</button></a>}
        {!['selesai', 'batal'].includes(o.status) && mode !== 'batal' && <button className="ghost danger" onClick={() => setMode('batal')}>{dvs.some((x) => x.status !== 'gagal') ? 'Tutup sisa' : 'Batalkan'}</button>}
      </div>
    </Sheet>
  );
}

function DeliverForm({ o, c, lines, onDone }) {
  const open = lines.filter((l) => Number(l.qty) > Number(l.qty_sent));
  const [qty, setQty] = useState(Object.fromEntries(open.map((l) => [l.id, angka(Number(l.qty) - Number(l.qty_sent))])));
  const [method, setMethod] = useState('kasbon');
  const [driver, setDriver] = useState('');
  const [vehicle, setVehicle] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [id] = useState(uid);
  const total = open.reduce((a, l) => a + (qtyNum(qty[l.id]) || 0) * Number(l.price), 0);
  const go = async () => {
    const rows = open.map((l) => ({ line_id: l.id, qty: qtyNum(qty[l.id]) || 0 })).filter((x) => x.qty > 0);
    if (!rows.length) return toast('Isi jumlah barang yang dikirim.');
    setBusy(true);
    const { data, error } = await supabase.rpc('so_deliver', { p_id: id, p_order: o.id, p: { lines: rows, method, driver, vehicle, note } });
    setBusy(false);
    if (error) return toast(errMsg(error));
    toast(`Surat jalan ${data.number} & faktur ${data.invoice} dibuat · ${rp(data.total)}`);
    onDone();
  };
  const terms = o.terms_days ?? c?.terms_days;
  return (
    <div className="unitbox" style={{ gap: 8 }}>
      <b>Surat jalan baru</b>
      {open.map((l) => (
        <div className="row between" key={l.id} style={{ flexWrap: 'nowrap', gap: 8 }}>
          <span className="small" style={{ minWidth: 0 }}>{l.name}<br /><span className="muted">sisa {angka(Number(l.qty) - Number(l.qty_sent))} {l.unit}</span></span>
          <input inputMode="decimal" value={qty[l.id] ?? ''} onChange={(e) => setQty({ ...qty, [l.id]: e.target.value })} style={{ width: 90, flex: 'none' }} aria-label={`Jumlah kirim ${l.name}`} />
        </div>
      ))}
      <span className="small muted">Kurangi jumlahnya bila dikirim bertahap; sisanya tetap di pesanan.</span>
      <div className="seg">{Object.entries(PAY).map(([k, l]) => <button key={k} className={method === k ? 'on' : ''} onClick={() => setMethod(k)}>{k === 'kasbon' && terms != null ? `Piutang ${terms} hari` : l}</button>)}</div>
      <div className="row">
        <Field label="Sopir (opsional)"><input value={driver} maxLength={60} onChange={(e) => setDriver(e.target.value)} /></Field>
        <Field label="No. kendaraan (opsional)"><input value={vehicle} maxLength={30} onChange={(e) => setVehicle(e.target.value)} placeholder="E 1234 AB" /></Field>
      </div>
      <Field label="Catatan (opsional)"><input value={note} maxLength={300} onChange={(e) => setNote(e.target.value)} /></Field>
      <button className="cta" disabled={busy} onClick={go}>{busy ? 'Memproses…' : `Kirim & terbitkan faktur · ${rp(total)}`}</button>
      <span className="small muted">Stok berkurang dan faktur (penjualan grosir) tercatat {method === 'kasbon' ? 'sebagai piutang' : `lunas ${PAY[method].toLowerCase()}`} — sama dengan transaksi Kasir, masuk laporan & pembukuan.</span>
    </div>
  );
}

function DeliveryRow({ x, kos, onChanged }) {
  const [mode, setMode] = useState(null);
  const [v, setV] = useState('');
  const [busy, setBusy] = useState(false);
  const go = async (status) => {
    setBusy(true);
    const { error } = await supabase.rpc('so_delivery_status', { p_delivery: x.id, p_status: status, p_recipient: status === 'diterima' ? v : null, p_note: status === 'gagal' ? v : null });
    setBusy(false);
    if (error) return toast(errMsg(error));
    toast(status === 'diterima' ? 'Ditandai diterima' : 'Gagal kirim: faktur dibatalkan, stok & piutang kembali');
    setMode(null); onChanged();
  };
  return (
    <div className="li" style={{ display: 'block' }}>
      <div className="row between" style={{ flexWrap: 'nowrap' }}><span className="small"><b>{x.number}</b> · {tgl(x.ship_date)}{x.driver ? ` · ${x.driver}` : ''}{x.recipient ? ` · diterima ${x.recipient}` : ''}</span><span className={'chip ' + DV_ST[x.status][1]}>{DV_ST[x.status][0]}</span></div>
      {x.status === 'gagal' && x.note && <span className="small muted">{x.note}</span>}
      <div className="row" style={{ gap: 6, marginTop: 6, flexWrap: 'wrap' }}>
        <Link href={`/dokumen/grosir/${x.order_id}?sj=${x.id}`}><button className="sm">Surat jalan</button></Link>
        {x.status !== 'gagal' && <Link href={`/dokumen/grosir/${x.order_id}?faktur=${x.id}`}><button className="sm">Faktur</button></Link>}
        {x.status === 'dikirim' && <button className="sm primary" onClick={() => setMode('diterima')}>Sudah diterima</button>}
        {x.status === 'dikirim' && canArea(kos, 'finance') && <button className="sm ghost danger" onClick={() => setMode('gagal')}>Gagal kirim</button>}
      </div>
      {mode && <div className="row" style={{ marginTop: 6, flexWrap: 'nowrap' }}>
        <input value={v} onChange={(e) => setV(e.target.value)} placeholder={mode === 'diterima' ? 'Nama penerima (opsional)' : 'Alasan, mis. toko tutup'} aria-label={mode === 'diterima' ? 'Nama penerima' : 'Alasan gagal kirim'} />
        <button className={'sm ' + (mode === 'diterima' ? 'primary' : 'danger')} disabled={busy} onClick={() => go(mode)}>Simpan</button>
      </div>}
    </div>
  );
}

// Daftar harga khusus (reseller, toko langganan, dll.) — harga per barang & satuan
function PriceLists({ d, kosId, canEdit, onChanged }) {
  const [open, setOpen] = useState(null);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const usedBy = (id) => d.customers.filter((c) => c.price_list_id === id);
  const add = async () => {
    if (!name.trim()) return toast('Isi nama daftar harga.');
    setBusy(true);
    const { data, error } = await supabase.rpc('price_list_save', { p_kos: kosId, p_id: null, p_name: name, p_note: null });
    setBusy(false);
    if (error) return toast(errMsg(error));
    setName(''); onChanged(); setOpen(data);
  };
  return (
    <div className="stack">
      <p className="small muted" style={{ margin: 0 }}>Harga khusus untuk kelompok pelanggan (mis. <b>Reseller</b>, <b>Toko langganan</b>). Pasangkan ke pelanggan di <Link href="/kontak">Pelanggan & supplier</Link> › ketuk nama › Syarat pelanggan. Barang yang tidak diisi memakai harga grosir (atau eceran bila harga grosir kosong).</p>
      {d.lists.length === 0 ? <Empty title="Belum ada daftar harga" text="Buat daftar harga pertama, lalu isi harga khususnya per barang." /> :
        <section className="panel"><div className="list">{d.lists.map((pl) => (
          <button key={pl.id} className="li click" style={LI} onClick={() => setOpen(pl.id)}><div className="main"><b>{pl.name}</b><span className="small muted">{usedBy(pl.id).length} pelanggan{usedBy(pl.id).length ? `: ${usedBy(pl.id).slice(0, 3).map((c) => c.name).join(', ')}${usedBy(pl.id).length > 3 ? '…' : ''}` : ''}</span></div><span className="small muted">atur ›</span></button>
        ))}</div></section>}
      {canEdit && <div className="row" style={{ flexWrap: 'nowrap' }}><input value={name} onChange={(e) => setName(e.target.value)} placeholder="Nama daftar harga baru, mis. Reseller" maxLength={60} aria-label="Nama daftar harga" /><button className="primary" disabled={busy} onClick={add}>Buat</button></div>}
      {!canEdit && <span className="small muted">Hanya pemilik/bagian keuangan yang bisa mengubah daftar harga.</span>}
      {open && d.lists.find((x) => x.id === open) && <PriceListEdit pl={d.lists.find((x) => x.id === open)} d={d} canEdit={canEdit} onClose={() => setOpen(null)} onChanged={onChanged} />}
    </div>
  );
}

function PriceListEdit({ pl, d, canEdit, onClose, onChanged }) {
  const [items, setItems] = useState(null);
  const [q, setQ] = useState('');
  const load = () => supabase.from('price_list_items').select('*').eq('list_id', pl.id).then(({ data }) => setItems(data || []));
  useEffect(() => { load(); }, [pl.id]);
  const val = (pid, unit) => items?.find((x) => x.product_id === pid && x.unit === unit);
  const save = async (p, u, raw) => {
    const v = raw.trim() === '' ? null : parseRp(raw);
    const cur = val(p.id, u.name);
    if ((cur ? Number(cur.price) : null) === v) return;
    const { error } = await supabase.rpc('price_list_item_set', { p_list: pl.id, p_product: p.id, p_unit: u.name, p_price: v });
    if (error) return toast(errMsg(error));
    toast(v == null ? `${p.name} ${u.name}: kembali ke harga biasa` : `${p.name} ${u.name}: ${rp(v)}`); load();
  };
  const archive = async () => {
    if (!window.confirm(`Hapus daftar harga "${pl.name}"? Pelanggan yang memakainya kembali ke harga biasa.`)) return;
    const { error } = await supabase.rpc('price_list_archive', { p_list: pl.id });
    if (error) return toast(errMsg(error));
    onClose(); onChanged();
  };
  const w = q.trim().toLowerCase();
  const prods = d.products.filter((p) => !w || p.name.toLowerCase().includes(w));
  return (
    <Sheet title={`Daftar harga · ${pl.name}`} onClose={onClose}>
      <span className="small muted">Isi harga khusus lalu ketuk di luar kolom untuk menyimpan. Kosongkan = kembali ke harga biasa. {items ? `${items.length} harga khusus.` : ''}</span>
      <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cari barang" aria-label="Cari barang" />
      {!items ? <Loading /> : <div className="list">{prods.slice(0, 80).map((p) => unitsOf(p, d.units).map((u) => {
        const cur = val(p.id, u.name);
        const base = Number(u.price_wholesale) > 0 ? Number(u.price_wholesale) : Number(u.price_retail);
        return (
          <div className="li" key={p.id + u.name} style={{ gap: 8 }}>
            <div className="main" style={{ minWidth: 0 }}><b className="small">{p.name} · {u.name}</b><span className="small muted">biasa {rp(base)}{Number(u.price_wholesale) > 0 ? ' (grosir)' : ''}</span></div>
            <input key={(cur?.price ?? '') + ''} inputMode="numeric" defaultValue={cur ? angka(cur.price) : ''} placeholder="harga khusus" disabled={!canEdit}
              onBlur={(e) => save(p, u, e.target.value)} style={{ width: 120, flex: 'none' }} aria-label={`Harga khusus ${p.name} ${u.name}`} />
          </div>
        );
      }))}</div>}
      {prods.length > 80 && <span className="small muted">Menampilkan 80 barang pertama — cari untuk menemukan barang lain.</span>}
      {canEdit && <button className="ghost danger" onClick={archive}>Hapus daftar harga ini</button>}
    </Sheet>
  );
}
