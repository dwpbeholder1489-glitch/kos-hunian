'use client';
// Portal pelanggan grosir (Tahap 5 Retail, Master Prompt Bagian 15 "B2B Portal"). Link pribadi dari penjual, tanpa akun/sandi.
// Data dari cportal_get (anon): harga milik pelanggan, status tersedia (tanpa angka stok), piutang & faktur, riwayat pesanan.
// Pesan / batal lewat /api/portal-b2b (server). Pesanan = "Menunggu konfirmasi" sampai penjual mengonfirmasi (cek stok & batas kredit di sana).
import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { LogoMark } from '@/components/Logo';
import { Sheet, Field, toast } from '@/components/ui';
import { rp, angka, tgl, today, waLink } from '@/lib/format';
import { logoUrl } from '@/lib/logo';
import { mediaUrl } from '@/lib/media';
import { qtyNum, uid } from '@/lib/retail';

const ST = { penawaran: ['Menunggu konfirmasi', 'gold'], dikonfirmasi: ['Dikonfirmasi · disiapkan', 'info'], sebagian: ['Dikirim sebagian', 'info'], selesai: ['Selesai', 'good'], batal: ['Batal', 'void'] };
const DV = { dikirim: 'Dalam pengiriman', diterima: 'Diterima', gagal: 'Gagal kirim' };
// harga per satuan untuk jumlah ini: harga pelanggan, lalu harga beli banyak yang terpenuhi (termurah). Pratinjau — angka final dihitung server.
const priceAt = (u, qty) => (u.breaks || []).filter((b) => Number(qty) >= Number(b.min_qty)).reduce((m, b) => Math.min(m, Number(b.price)), Number(u.price));
const cartKey = (t) => `prasara.cportal.${String(t).slice(-12)}`;

export default function CustomerPortal() {
  const { token } = useParams();
  const [p, setP] = useState(undefined);
  const [tab, setTab] = useState('pesan');
  const [cart, setCart] = useState([]); // [{product_id, unit, qty}]
  const [q, setQ] = useState('');
  const [cat, setCat] = useState('');
  const [checkout, setCheckout] = useState(false);
  const [sent, setSent] = useState(null); // {number, total, kind}
  const load = async () => {
    if (!supabase) return setP(null);
    const { data, error } = await supabase.rpc('cportal_get', { p_token: token });
    setP(error ? null : data);
  };
  useEffect(() => { load(); try { const c = JSON.parse(localStorage.getItem(cartKey(token)) || '[]'); if (Array.isArray(c)) setCart(c); } catch {} }, [token]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { try { localStorage.setItem(cartKey(token), JSON.stringify(cart)); } catch {} }, [cart, token]);

  const byId = useMemo(() => new Map((p?.catalog || []).map((x) => [x.id, x])), [p]);
  // keranjang hanya berisi barang & satuan yang masih ada di katalog
  const lines = cart.map((c) => { const pr = byId.get(c.product_id); const u = pr?.units.find((x) => x.name === c.unit); return pr && u ? { ...c, pr, u, price: priceAt(u, c.qty), total: priceAt(u, c.qty) * Number(c.qty) } : null; }).filter(Boolean);
  const total = lines.reduce((a, l) => a + l.total, 0);

  if (p === undefined) return <main className="auth"><p className="muted">Membuka portal…</p></main>;
  if (p === null || !p.ok) return (
    <main className="auth">
      <p className="hello">{p?.business?.name || 'Link tidak berlaku'}</p>
      <p className="muted">{p?.error || 'Link portal ini salah atau sudah diganti. Mintalah link terbaru kepada penjual.'}</p>
      {p?.business?.phone && <a href={waLink(p.business.phone, `Halo ${p.business.name}, saya pelanggan Anda.`)} target="_blank" rel="noreferrer"><button className="primary" style={{ width: '100%' }}>WhatsApp penjual</button></a>}
    </main>
  );
  const b = p.business, c = p.customer;
  const setQty = (pid, unit, qty) => setCart((cs) => {
    const n = Math.max(0, Math.round(Number(qty) * 1000) / 1000 || 0);
    const rest = cs.filter((x) => !(x.product_id === pid && x.unit === unit));
    return n > 0 ? [...rest, { product_id: pid, unit, qty: n }].sort((a, z) => cs.findIndex((x) => x.product_id === a.product_id) - cs.findIndex((x) => x.product_id === z.product_id)) : rest;
  });
  const qtyOf = (pid, unit) => cart.find((x) => x.product_id === pid && x.unit === unit)?.qty || 0;
  const reorder = (o) => {
    const ok = o.lines.filter((l) => byId.get(l.product_id)?.units.some((u) => u.name === l.unit));
    if (!ok.length) return toast('Barang di pesanan ini sudah tidak dijual');
    setCart(ok.map((l) => ({ product_id: l.product_id, unit: l.unit, qty: Number(l.qty) })));
    setTab('pesan'); setCheckout(true);
    if (ok.length < o.lines.length) toast(`${o.lines.length - ok.length} barang sudah tidak dijual dan tidak dimasukkan`);
  };
  const waOwner = (text) => (b.phone ? waLink(b.phone, text) : null);
  const openInv = p.invoices.filter((i) => Number(i.open) > 0);
  const waiting = p.orders.filter((o) => o.status === 'penawaran').length;

  return (
    <>
      <header className="top portal">
        <div className="wrap" style={{ paddingBottom: 0, maxWidth: 760 }}>
          <div className="brandrow">
            <div className="brand">{logoUrl(b.logo) ? <img src={logoUrl(b.logo)} alt="" width={30} height={30} style={{ borderRadius: 8, objectFit: 'cover' }} /> : <LogoMark size={30} />}<div><h1>{b.name}</h1><small>Portal pelanggan</small></div></div>
            {b.phone && <a className="helpbtn" style={{ width: 'auto', padding: '0 12px', borderRadius: 999, fontSize: 13 }} href={waOwner(`Halo ${b.name}, saya ${c.name}.`)} target="_blank" rel="noreferrer">Hubungi</a>}
          </div>
          <nav className="tabs ptabs">
            {[['pesan', 'Pesan barang'], ['pesanan', `Pesanan${waiting ? ` (${waiting})` : ''}`], ['tagihan', 'Tagihan']].map(([k, l]) => (
              <a key={k} href={'#' + k} className={tab === k ? 'on' : ''} onClick={(e) => { e.preventDefault(); setTab(k); setSent(null); }}>{l}</a>
            ))}
          </nav>
        </div>
      </header>
      <main className="wrap stack" style={{ paddingBottom: lines.length && tab === 'pesan' ? 110 : 60, maxWidth: 760 }}>
        <div><h2 style={{ marginBottom: 2 }}>Halo, {c.name}</h2>
          <p className="muted small" style={{ margin: 0 }}>{[c.price_list ? `Harga khusus: ${c.price_list}` : 'Harga grosir untuk Anda', c.terms_days != null ? `tempo ${c.terms_days} hari` : null].filter(Boolean).join(' · ')}</p></div>

        {sent && <SentPanel sent={sent} b={b} c={c} waOwner={waOwner} onSee={() => { setSent(null); setTab('pesanan'); }} onMore={() => setSent(null)} />}

        {!sent && tab === 'pesan' && <Catalog p={p} q={q} setQ={setQ} cat={cat} setCat={setCat} qtyOf={qtyOf} setQty={setQty} />}
        {!sent && tab === 'pesanan' && <Orders p={p} token={token} reorder={reorder} onChanged={load} waOwner={waOwner} />}
        {!sent && tab === 'tagihan' && <Bills p={p} openInv={openInv} waOwner={waOwner} />}
        <footer className="small muted" style={{ textAlign: 'center' }}>Link ini pribadi untuk {c.name} — jangan dibagikan. Dikelola {b.name} dengan <a href="/">PRASARA</a></footer>
      </main>
      {!sent && tab === 'pesan' && lines.length > 0 && (
        <button className="cartbar" style={{ left: '50%', width: 'calc(100% - 32px)' }} onClick={() => setCheckout(true)}>
          <span>{lines.length} barang · <b>{rp(total)}</b></span><b>Lanjut pesan ›</b>
        </button>
      )}
      {checkout && <Checkout p={p} token={token} lines={lines} total={total} setQty={setQty} onClose={() => setCheckout(false)}
        onSent={(r) => { setCheckout(false); setCart([]); setSent(r); window.scrollTo(0, 0); load(); }} />}
    </>
  );
}

function Catalog({ p, q, setQ, cat, setCat, qtyOf, setQty }) {
  const cats = [...new Set(p.catalog.map((x) => x.cat).filter(Boolean))];
  const s = q.trim().toLowerCase();
  const list = p.catalog.filter((x) => (!cat || x.cat === cat) && (!s || [x.name, x.sku, x.brand].some((v) => String(v || '').toLowerCase().includes(s))));
  if (!p.catalog.length) return <section className="panel"><p className="muted" style={{ margin: 0 }}>Belum ada barang yang bisa dipesan lewat portal. Hubungi penjual.</p></section>;
  return (
    <>
      <input type="search" placeholder="Cari nama barang, kode, merek" value={q} onChange={(e) => setQ(e.target.value)} />
      {cats.length > 1 && <div className="seg" style={{ overflowX: 'auto', flexWrap: 'nowrap', maxWidth: '100%' }}>{[['', 'Semua'], ...cats.map((x) => [x, x])].map(([k, l]) => <button key={k || 'all'} className={cat === k ? 'on' : ''} onClick={() => setCat(k)} style={{ whiteSpace: 'nowrap' }}>{l}</button>)}</div>}
      <section className="panel" style={{ padding: 0 }}>
        <div className="list">{list.slice(0, 300).map((x) => (
          <div className="li" key={x.id} style={{ alignItems: 'flex-start', gap: 10, padding: '12px 14px' }}>
            {x.thumb ? <img src={mediaUrl(x.thumb)} alt="" width={56} height={56} loading="lazy" style={{ borderRadius: 10, objectFit: 'cover', flex: 'none', border: '1px solid var(--line)' }} />
              : <div style={{ width: 56, height: 56, borderRadius: 10, background: 'var(--sunk)', flex: 'none' }} />}
            <div className="main stack" style={{ flex: 1, gap: 6, minWidth: 0 }}>
              <div><b style={{ overflowWrap: 'anywhere' }}>{x.name}</b>
                <div className="small muted">{[x.brand, x.sku].filter(Boolean).join(' · ')}{x.brand || x.sku ? ' · ' : ''}<span style={{ color: x.avail ? 'var(--good)' : 'var(--att, #b45309)' }}>{x.avail ? 'Tersedia' : 'Stok terbatas — bisa dikirim menyusul'}</span></div></div>
              {x.units.map((u) => { const n = qtyOf(x.id, u.name); return (
                <div key={u.name} className="row between" style={{ gap: 8, flexWrap: 'wrap' }}>
                  <div className="small"><b>{rp(n > 0 ? priceAt(u, n) : u.price)}</b> / {u.name}{Number(u.qty) !== 1 ? <span className="muted"> (isi {angka(u.qty)} {x.base_unit})</span> : null}
                    {u.breaks.length > 0 && <div className="muted">{u.breaks.map((br) => `≥${angka(br.min_qty)} ${u.name}: ${rp(br.price)}`).join(' · ')}</div>}</div>
                  {n > 0 ? <div className="qtybox"><button onClick={() => setQty(x.id, u.name, n - 1)} aria-label="Kurangi">−</button>
                      <input inputMode="decimal" value={n} onChange={(e) => setQty(x.id, u.name, qtyNum(e.target.value))} aria-label={`Jumlah ${u.name}`} />
                      <button onClick={() => setQty(x.id, u.name, n + 1)} aria-label="Tambah">+</button></div>
                    : <button className="sm" onClick={() => setQty(x.id, u.name, 1)}>+ {u.name}</button>}
                </div>); })}
            </div>
          </div>
        ))}</div>
        {list.length === 0 && <p className="muted small" style={{ padding: 14, margin: 0 }}>Tidak ada barang yang cocok.</p>}
        {list.length > 300 && <p className="muted small" style={{ padding: 14, margin: 0 }}>Menampilkan 300 dari {list.length} barang — ketik nama untuk mencari.</p>}
      </section>
      <span className="small muted">Harga sesuai harga untuk akun Anda. Harga & ketersediaan final dikonfirmasi penjual; promo kasir toko tidak berlaku di portal.</span>
    </>
  );
}

function Checkout({ p, token, lines, total, setQty, onClose, onSent }) {
  const c = p.customer;
  const [kind, setKind] = useState('pesanan');
  const [need, setNeed] = useState('');
  const [ref, setRef] = useState('');
  const [addr, setAddr] = useState(c.address || '');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [id] = useState(() => uid()); // satu id per kiriman: ketuk dua kali / internet putus = pesanan yang sama
  const over = c.credit_limit != null && Number(c.balance) + Number(c.open_orders) + total > Number(c.credit_limit);
  const send = async () => {
    if (!lines.length) return;
    setBusy(true);
    try {
      const r = await fetch('/api/portal-b2b', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, id, kind, need_date: need || null, customer_ref: ref, ship_address: addr, note, lines: lines.map((l) => ({ product_id: l.product_id, unit: l.unit, qty: l.qty })) }) });
      const d = await r.json().catch(() => ({}));
      if (!d.ok) { toast(d.error || 'Gagal mengirim pesanan'); setBusy(false); return; }
      onSent({ number: d.number, total: d.total, kind });
    } catch { toast('Internet terputus. Coba kirim lagi — pesanan tidak akan tercatat dua kali.'); setBusy(false); }
  };
  return (
    <Sheet title="Periksa pesanan" onClose={onClose}>
      <div className="list">{lines.map((l) => (
        <div className="li" key={l.product_id + l.unit} style={{ gap: 8, flexWrap: 'wrap' }}>
          <div className="main" style={{ minWidth: 0 }}><b className="small" style={{ overflowWrap: 'anywhere' }}>{l.pr.name}</b><span className="small muted">{angka(l.qty)} {l.unit} × {rp(l.price)}</span></div>
          <div className="row" style={{ gap: 6 }}><div className="qtybox"><button onClick={() => setQty(l.product_id, l.unit, l.qty - 1)}>−</button><button onClick={() => setQty(l.product_id, l.unit, l.qty + 1)}>+</button></div><b className="small">{rp(l.total)}</b></div>
        </div>
      ))}</div>
      <div className="row between"><b>Total sementara</b><b>{rp(total)}</b></div>
      {p.business.tax && <span className="small muted">Harga sudah termasuk PPN sesuai ketentuan penjual.</span>}
      {over && <div className="notice small">Total kredit Anda (piutang {rp(c.balance)}{Number(c.open_orders) > 0 ? ` + pesanan berjalan ${rp(c.open_orders)}` : ''} + pesanan ini) melewati batas kredit {rp(c.credit_limit)}. Pesanan tetap bisa dikirim; penjual akan menghubungi Anda.</div>}
      <Field label="Jenis"><div className="seg">{[['pesanan', 'Pesan sekarang'], ['penawaran', 'Minta penawaran dulu']].map(([k, l]) => <button key={k} className={kind === k ? 'on' : ''} onClick={() => setKind(k)}>{l}</button>)}</div></Field>
      <Field label="Dibutuhkan tanggal" hint="Kosongkan bila tidak mendesak"><input type="date" min={today()} value={need} onChange={(e) => setNeed(e.target.value)} /></Field>
      <Field label="No. PO Anda" hint="Opsional, untuk dicetak di surat jalan & faktur"><input value={ref} maxLength={60} onChange={(e) => setRef(e.target.value)} placeholder="mis. PO-0123" /></Field>
      <Field label="Alamat kirim"><textarea rows={2} value={addr} maxLength={300} onChange={(e) => setAddr(e.target.value)} placeholder="Kosongkan bila ambil sendiri" /></Field>
      <Field label="Catatan untuk penjual"><textarea rows={2} value={note} maxLength={500} onChange={(e) => setNote(e.target.value)} placeholder={kind === 'penawaran' ? 'mis. minta harga untuk 50 karung' : 'mis. kirim pagi'} /></Field>
      <button className="primary" disabled={busy || !lines.length} onClick={send}>{busy ? 'Mengirim…' : kind === 'penawaran' ? 'Kirim permintaan penawaran' : `Kirim pesanan ${rp(total)}`}</button>
      <span className="small muted">Pesanan belum mengikat sampai dikonfirmasi penjual. Selama belum dikonfirmasi, Anda bisa membatalkannya di tab Pesanan.</span>
    </Sheet>
  );
}

function SentPanel({ sent, b, c, waOwner, onSee, onMore }) {
  const penawaran = sent.kind === 'penawaran';
  return (
    <section className="panel stack" style={{ gap: 10 }}>
      <span className="chip gold" style={{ alignSelf: 'flex-start' }}>Menunggu konfirmasi penjual</span>
      <h3 style={{ margin: 0 }}>{penawaran ? 'Permintaan penawaran terkirim' : 'Pesanan terkirim'}</h3>
      <dl className="kv"><dt>Nomor</dt><dd><b>{sent.number}</b></dd><dt>Total sementara</dt><dd>{rp(sent.total)}</dd></dl>
      <ol className="small" style={{ margin: 0, paddingLeft: 18 }}>
        <li>{b.name} memeriksa stok{penawaran ? ' dan mengirim harga penawaran' : ' dan batas kredit Anda'}.</li>
        <li>Setelah dikonfirmasi, status berubah di tab <b>Pesanan</b>; surat jalan & faktur muncul saat barang dikirim.</li>
        <li>Pembayaran mengikuti tempo Anda{c.terms_days != null ? ` (${c.terms_days} hari)` : ''}; cara bayar ada di tab <b>Tagihan</b>.</li>
      </ol>
      <div className="row" style={{ flexWrap: 'wrap' }}>
        <button className="primary" onClick={onSee}>Lihat pesanan</button>
        {waOwner && <a href={waOwner(`Halo ${b.name}, saya ${c.name}. Saya baru mengirim ${penawaran ? 'permintaan penawaran' : 'pesanan'} ${sent.number} lewat portal.`)} target="_blank" rel="noreferrer"><button>Kabari lewat WhatsApp</button></a>}
        <button className="ghost" onClick={onMore}>Pesan lagi</button>
      </div>
    </section>
  );
}

function Orders({ p, token, reorder, onChanged, waOwner }) {
  const [open, setOpen] = useState(null);
  const [busy, setBusy] = useState(false);
  if (!p.orders.length) return <section className="panel"><p className="muted" style={{ margin: 0 }}>Belum ada pesanan. Pesan dari tab Pesan barang.</p></section>;
  const cancel = async (o) => {
    if (!window.confirm(`Batalkan ${o.number}?`)) return;
    setBusy(true);
    const r = await fetch('/api/portal-b2b', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token, action: 'cancel', order_id: o.id }) }).then((x) => x.json()).catch(() => ({}));
    setBusy(false);
    if (!r.ok) return toast(r.error || 'Gagal membatalkan');
    toast('Pesanan dibatalkan'); onChanged();
  };
  return (
    <section className="panel" style={{ padding: 0 }}><div className="list">{p.orders.map((o) => {
      const sent = o.lines.reduce((a, l) => a + Number(l.sent), 0) > 0;
      return (
        <div key={o.id} style={{ borderTop: '1px solid var(--line)' }}>
          <button className="li" style={{ width: '100%', background: 'none', border: 0, textAlign: 'left', font: 'inherit', color: 'inherit', padding: '12px 14px' }} onClick={() => setOpen(open === o.id ? null : o.id)}>
            <div className="main"><b className="small">{o.number} <span className={'chip ' + ST[o.status][1]} style={{ marginLeft: 4 }}>{ST[o.status][0]}</span></b>
              <span className="small muted">{tgl(o.date)}{o.ref ? ` · ${o.ref}` : ''}{o.kind === 'penawaran' ? ' · minta penawaran' : ''}{o.source === 'staf' ? ' · dibuat penjual' : ''}</span></div>
            <b className="small">{rp(o.total)}</b>
          </button>
          {open === o.id && <div className="stack" style={{ padding: '0 14px 14px', gap: 8 }}>
            <div className="list">{o.lines.map((l, i) => <div className="li" key={i}><div className="main" style={{ minWidth: 0 }}><span className="small" style={{ overflowWrap: 'anywhere' }}>{l.name}</span><span className="small muted">{angka(l.qty)} {l.unit} × {rp(l.price)}{Number(l.sent) > 0 ? ` · terkirim ${angka(l.sent)}` : ''}</span></div><span className="small">{rp(l.total)}</span></div>)}</div>
            {o.need_date && <span className="small muted">Dibutuhkan {tgl(o.need_date)}</span>}
            {o.ship_address && <span className="small muted" style={{ overflowWrap: 'anywhere' }}>Kirim ke: {o.ship_address}</span>}
            {o.note && <span className="small muted">Catatan: {o.note}</span>}
            {o.close_reason && <span className="small muted">{o.close_reason}</span>}
            {o.deliveries.length > 0 && <div className="unitbox small" style={{ gap: 4 }}><b>Pengiriman</b>{o.deliveries.map((d) => <span key={d.number}>{d.number} · {tgl(d.date)} · {DV[d.status] || d.status}{d.recipient ? ` · diterima ${d.recipient}` : ''}{d.invoice ? ` · faktur ${d.invoice}` : ''}</span>)}</div>}
            {o.status === 'penawaran' && <span className="small muted">Penjual belum mengonfirmasi{o.kind === 'penawaran' ? '; harga bisa disesuaikan penjual.' : '. Harga mengikuti harga Anda saat memesan.'}</span>}
            <div className="row" style={{ flexWrap: 'wrap' }}>
              <button className="sm" onClick={() => reorder(o)}>Pesan lagi</button>
              {waOwner && <a href={waOwner(`Halo, saya ingin menanyakan pesanan ${o.number}.`)} target="_blank" rel="noreferrer"><button className="sm">Tanya penjual</button></a>}
              {o.status === 'penawaran' && !sent && <button className="sm ghost danger" disabled={busy} onClick={() => cancel(o)}>Batalkan</button>}
            </div>
          </div>}
        </div>);
    })}</div></section>
  );
}

function Bills({ p, openInv, waOwner }) {
  const c = p.customer, b = p.business;
  const t0 = today();
  const [open, setOpen] = useState(null);
  return (
    <>
      <div className="grid">
        <div className={'tile ' + (Number(c.balance) > 0 ? 'hero' : '')}><span className="label">Sisa tagihan</span><span className="v">{Number(c.balance) > 0 ? rp(c.balance) : 'Lunas 🎉'}</span>
          {Number(c.overdue) > 0 && <span className="s" style={{ color: 'var(--bad)' }}>{rp(c.overdue)} lewat jatuh tempo</span>}</div>
        {c.credit_limit != null && <div className="tile"><span className="label">Batas kredit</span><span className="v">{rp(c.credit_limit)}</span><span className="s">sisa {rp(Math.max(0, Number(c.available)))}{Number(c.open_orders) > 0 ? ` · pesanan berjalan ${rp(c.open_orders)}` : ''}</span></div>}
      </div>
      <section className="panel" style={{ gap: 6 }}><h3>Faktur</h3>
        {p.invoices.length === 0 ? <p className="muted small" style={{ margin: 0 }}>Belum ada faktur.</p> : <div className="list">{p.invoices.map((i) => (
          <div key={i.id} style={{ borderTop: '1px solid var(--line)' }}>
            <button className="li" style={{ width: '100%', background: 'none', border: 0, textAlign: 'left', font: 'inherit', color: 'inherit' }} onClick={() => setOpen(open === i.id ? null : i.id)}>
              <div className="main"><b className="small">{i.number}</b><span className="small muted">{tgl(i.date)}{Number(i.open) > 0 ? ` · jatuh tempo ${tgl(i.due)}` : ''}</span></div>
              <div style={{ textAlign: 'right' }}><b className="small">{rp(i.total)}</b><div>{Number(i.open) > 0 ? <span className={'chip ' + (i.due < t0 ? 'bad' : 'gold')}>{i.due < t0 ? 'Lewat tempo' : 'Belum lunas'} {rp(i.open)}</span> : <span className="chip good">Lunas</span>}</div></div>
            </button>
            {open === i.id && <div className="list" style={{ padding: '0 0 10px' }}>{i.lines.map((l, k) => <div className="li" key={k}><span className="small" style={{ overflowWrap: 'anywhere' }}>{l.name} · {angka(l.qty)} {l.unit} × {rp(l.price)}</span><span className="small">{rp(l.total)}</span></div>)}
              {Number(i.tax) > 0 && <span className="small muted">Termasuk PPN {rp(i.tax)}</span>}</div>}
          </div>
        ))}</div>}
      </section>
      {p.payments.length > 0 && <section className="panel" style={{ gap: 6 }}><h3>Pembayaran diterima</h3><div className="list">{p.payments.map((x, k) => <div className="li" key={k}><span className="small">{tgl(x.date)}</span><b className="small">{rp(x.amount)}</b></div>)}</div></section>}
      {(b.payment_info || b.qris) && <section className="panel" style={{ gap: 6 }}><h3>Cara bayar</h3>
        {b.payment_info && <p className="small" style={{ margin: 0, whiteSpace: 'pre-line', overflowWrap: 'anywhere' }}>{b.payment_info}</p>}
        {b.qris && <img src={b.qris} alt="QRIS" style={{ maxWidth: 240, borderRadius: 10, border: '1px solid var(--line)' }} />}
        {b.rules && <p className="small muted" style={{ margin: 0, whiteSpace: 'pre-line' }}>{b.rules}</p>}
      </section>}
      {openInv.length > 0 && waOwner && <a href={waOwner(`Halo ${b.name}, saya ${c.name} sudah membayar ${openInv.map((i) => i.number).join(', ')}. Berikut bukti transfernya.`)} target="_blank" rel="noreferrer"><button className="primary" style={{ width: '100%' }}>Kirim bukti bayar lewat WhatsApp</button></a>}
      <span className="small muted">Pembayaran dicatat penjual setelah uang diterima; saldo di sini mengikuti catatan penjual.</span>
    </>
  );
}
