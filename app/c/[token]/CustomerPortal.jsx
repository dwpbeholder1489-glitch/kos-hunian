'use client';
// Portal pelanggan grosir (Tahap 5 Retail, Master Prompt Bagian 15 "B2B Portal"). Link pribadi dari penjual, tanpa akun/sandi.
// Data dari cportal_get (anon): harga milik pelanggan, status tersedia (tanpa angka stok), piutang & faktur, riwayat pesanan.
// Pesan / batal lewat /api/portal-b2b (server). Pesanan = "Menunggu konfirmasi" sampai penjual mengonfirmasi (cek stok & batas kredit di sana).
import CustomerChat from '@/components/commerce/CustomerChat';
import { TrackingView } from '@/components/commerce/ChatParts';
import { CustomerGuide } from '@/components/InteractiveGuide';
import { CUSTOMER_HELP } from '@/lib/customerGuide';
import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { LogoMark } from '@/components/Logo';
import NavIcon from '@/components/NavIcon';
import styles from './portal.module.css';
import { Sheet, Field, toast } from '@/components/ui';
import { rp, angka, tgl, today, waLink } from '@/lib/format';
import { logoUrl } from '@/lib/logo';
import { mediaUrl } from '@/lib/media';
import { qtyNum, uid } from '@/lib/retail';
import { cartLines, priceAt, updateCart } from '@/lib/commerce.mjs';

const ST = { penawaran: ['Menunggu konfirmasi', 'gold'], dikonfirmasi: ['Dikonfirmasi · disiapkan', 'info'], sebagian: ['Dikirim sebagian', 'info'], selesai: ['Selesai', 'good'], batal: ['Batal', 'void'] };
const DV = { dikirim: 'Dalam pengiriman', diterima: 'Diterima', gagal: 'Gagal kirim' };
// harga per satuan untuk jumlah ini: harga pelanggan, lalu harga beli banyak yang terpenuhi (termurah). Pratinjau — angka final dihitung server.
const cartKey = (t) => `prasara.cportal.${String(t).slice(-12)}`;

export default function CustomerPortal({ initialTab }) {
  const { token } = useParams();
  const [p, setP] = useState(undefined);
  const [tab, setTab] = useState(initialTab || 'pesan');
  const [cart, setCart] = useState([]); // [{product_id, unit, qty}]
  const [loadedCart, setLoadedCart] = useState(null);
  const [q, setQ] = useState('');
  const [cat, setCat] = useState('');
  const [checkout, setCheckout] = useState(false);
  const [sent, setSent] = useState(null); // {number, total, kind}
  const [focus, setFocus] = useState(null); // id pesanan untuk Lacak / Chat ('umum' = chat tanpa pesanan)
  const [unread, setUnread] = useState({});
  const load = async () => {
    if (!supabase) return setP(null);
    const { data, error } = await supabase.rpc('cportal_get', { p_token: token });
    setP(error ? null : data);
  };
  useEffect(() => {
    load();
    let saved = [];
    try {
      const value = JSON.parse(localStorage.getItem(cartKey(token)) || '[]');
      if (Array.isArray(value)) saved = value;
    } catch {}
    setCart(saved);
    setLoadedCart(token);
  }, [token]); // eslint-disable-line react-hooks/exhaustive-deps
  // balasan penjual yang belum dibaca (lencana Chat & per pesanan)
  useEffect(() => {
    let alive = true;
    const tick = () => { if (document.hidden) return; fetch('/api/portal-b2b', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token, action: 'unread' }) })
      .then((r) => (r.ok ? r.json() : {})).then((d) => { if (alive && d && !d.error) setUnread(d); }).catch(() => {}); };
    tick();
    const timer = setInterval(tick, 30000);
    return () => { alive = false; clearInterval(timer); };
  }, [token, tab]);
  useEffect(() => {
    if (loadedCart !== token) return;
    try { localStorage.setItem(cartKey(token), JSON.stringify(cart)); } catch {}
  }, [cart, token, loadedCart]);

  const byId = useMemo(() => new Map((p?.catalog || []).map((x) => [x.id, x])), [p]);
  // keranjang hanya berisi barang & satuan yang masih ada di katalog
  const lines = cartLines(cart, byId);
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
  const setQty = (pid, unit, qty) => setCart((cs) => updateCart(cs, pid, unit, qty));
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

  const navigate = (next, id = null) => {
    setFocus(id);
    setTab(next);
    setSent(null);
    window.scrollTo(0, 0);
  };
  const shopping = tab === 'pesan' || tab === 'hemat';
  const showCart = !sent && shopping && lines.length > 0;
  const links = [
    ['pesan', 'Pesan barang', '/konsinyasi'],
    ['pesanan', 'Pesanan', '/resep'],
    ['tagihan', 'Tagihan', '/tagihan'],
    ['hemat', 'Beli banyak', '/promo'],
  ];

  return (
    <CustomerGuide kind="grosir" help={CUSTOMER_HELP.grosir}><div className={styles.portal}>
      <header className={styles.header}>
        <div className={styles.brand}>
          {logoUrl(b.logo) ? <img src={logoUrl(b.logo)} alt="" width={38} height={38} /> : <LogoMark size={38} />}
          <div><h1>{b.name}</h1><small>Portal pelanggan</small></div>
        </div>
        <nav className={styles.desktopNav} aria-label="Navigasi utama">
          {[...links, ['profil', 'Profil', '/penghuni']].map(([key, label, icon]) => (
            <button key={key} type="button" aria-current={tab === key ? 'page' : undefined} onClick={() => navigate(key)}>
              <NavIcon name={icon} size={19} />{label}{key === 'pesanan' && waiting > 0 && <span className={styles.badge}>{waiting}</span>}
            </button>
          ))}
        </nav>
        <button type="button" className={styles.contact} onClick={() => navigate('chat', 'umum')}><NavIcon name="/crm" size={19} />Chat{unread.umum > 0 && <span className={styles.badge}>{unread.umum}</span>}</button>
      </header>

      <main className={`${styles.main} stack ${showCart ? styles.hasCart : ''}`}>
        {shopping && !sent && (
          <section className={styles.hero}>
            <h2>Belanja Grosir <em>Lebih Mudah &amp; Cepat</em></h2>
            <p>Pesan kebutuhan toko Anda kapan saja, langsung di sini.</p>
            <div className={styles.perks}>
              <span><NavIcon name="/promo" size={15} />Harga grosir</span>
              <span><NavIcon name="/grosir" size={15} />Pesanan terpantau</span>
            </div>
          </section>
        )}
        <nav className={styles.actions} aria-label="Menu portal">
          {links.map(([key, label, icon]) => (
            <button key={key} type="button" aria-current={tab === key ? 'page' : undefined} onClick={() => navigate(key)}>
              <NavIcon name={icon} size={23} />{label}{key === 'pesanan' && waiting > 0 && <span className={styles.badge}>{waiting}</span>}
            </button>
          ))}
        </nav>

        {sent && <SentPanel sent={sent} b={b} c={c} waOwner={waOwner} onSee={() => navigate('pesanan')} onMore={() => setSent(null)} />}
        {!sent && shopping && (
          <div className={showCart ? styles.catalogWithCart : undefined}>
            <div className={`${styles.catalogBody} stack`}>
              <Catalog p={p} q={q} setQ={setQ} cat={cat} setCat={setCat} qtyOf={qtyOf} setQty={setQty} bulk={tab === 'hemat'} />
            </div>
            {showCart && <CartSummary lines={lines} total={total} onCheckout={() => setCheckout(true)} />}
          </div>
        )}
        {!sent && tab === 'pesanan' && <Orders p={p} token={token} reorder={reorder} onChanged={load} waOwner={waOwner} unread={unread} go={navigate} />}
        {!sent && tab === 'lacak' && focus && <OrderTrack token={token} order={p.orders.find((o) => o.id === focus)} unread={unread[focus] || 0} go={navigate} />}
        {!sent && tab === 'chat' && focus && <>
          <button type="button" className="sm" style={{ justifySelf: 'start' }} onClick={() => navigate(focus === 'umum' ? 'pesan' : 'lacak', focus === 'umum' ? null : focus)}>← Kembali</button>
          <CustomerChat key={focus} endpoint="/api/portal-b2b" auth={{ token }} refId={focus} title={b.name}
            onOpenReference={(ref) => navigate('lacak', ref.id)} onCard={(kind, x) => { if (kind === 'penawaran') navigate('lacak', x.order_id); else if (kind === 'produk') { setQ(x.name); navigate('pesan'); } }} />
          {b.phone && <a className="small muted" style={{ textAlign: 'center' }} href={waOwner(`Halo ${b.name}, saya ${c.name}.`)} target="_blank" rel="noreferrer">atau hubungi lewat WhatsApp</a>}
        </>}
        {!sent && tab === 'tagihan' && <Bills p={p} openInv={openInv} waOwner={waOwner} />}
        {!sent && tab === 'profil' && (
          <section className="panel">
            <h2>Profil pelanggan</h2>
            <dl className="kv">
              <dt>Nama</dt><dd>{c.name}</dd>
              <dt>Daftar harga</dt><dd>{c.price_list || 'Grosir'}</dd>
              {c.terms_days != null && <><dt>Tempo</dt><dd>{c.terms_days} hari</dd></>}
              {c.address && <><dt>Alamat kirim</dt><dd>{c.address}</dd></>}
            </dl>
          </section>
        )}
        <footer className={styles.footer}>Link pribadi untuk {c.name}. Dikelola {b.name} dengan <a href="/">PRASARA</a>.</footer>
      </main>

      <div className={styles.dock}>
        {showCart && (
          <div className={styles.cartbar}>
            <div className={styles.cartCount}><NavIcon name="/penjualan" size={25} /><div><b>{lines.length} item</b><small>Total sementara</small></div></div>
            <strong>{rp(total)}</strong>
            <button type="button" onClick={() => setCheckout(true)}>Lihat keranjang <span aria-hidden="true">→</span></button>
          </div>
        )}
        <nav className={styles.bottom} aria-label="Navigasi bawah">
          {[['pesan', 'Beranda', '/kamar'], ['pesanan', 'Pesanan', '/konsinyasi'], ['tagihan', 'Tagihan', '/tagihan'], ['profil', 'Profil', '/penghuni']].map(([key, label, icon]) => (
            <button key={key} type="button" aria-current={(tab === key || (key === 'pesan' && shopping)) ? 'page' : undefined} onClick={() => navigate(key)}>
              <NavIcon name={icon} size={22} />{label}
            </button>
          ))}
        </nav>
      </div>
      {checkout && <Checkout p={p} token={token} lines={lines} total={total} setQty={setQty} onClose={() => setCheckout(false)}
        onSent={(r) => { setCheckout(false); setCart([]); setTab('pesan'); setSent(r); window.scrollTo(0, 0); load(); }} />}
    </div></CustomerGuide>
  );
}

function CartSummary({ lines, total, onCheckout }) {
  return (
    <aside className={styles.cartSummary} aria-label="Ringkasan keranjang">
      <h2><NavIcon name="/penjualan" size={22} />Keranjang <span>{lines.length}</span></h2>
      <ul>
        {lines.map((line) => (
          <li key={JSON.stringify([line.product_id, line.unit])}>
            <div><b>{line.pr.name}</b><small>{angka(line.qty)} {line.unit} × {rp(line.price)}</small></div>
            <strong>{rp(line.total)}</strong>
          </li>
        ))}
      </ul>
      <div className={styles.cartTotal}><span>Total sementara</span><strong>{rp(total)}</strong></div>
      <button type="button" onClick={onCheckout}>Lihat keranjang <span aria-hidden="true">→</span></button>
    </aside>
  );
}

function Catalog({ p, q, setQ, cat, setCat, qtyOf, setQty, bulk }) {
  const [sort, setSort] = useState('catalog');
  const [layout, setLayout] = useState('grid');
  const products = bulk ? p.catalog.filter((x) => x.units.some((u) => u.breaks.length)) : p.catalog;
  const cats = [...new Set(products.map((x) => x.cat).filter(Boolean))];
  const activeCat = cats.includes(cat) ? cat : '';
  const s = q.trim().toLowerCase();
  const list = products.filter((x) => (!activeCat || x.cat === activeCat) && (!s || [x.name, x.sku, x.brand].some((v) => String(v || '').toLowerCase().includes(s))));
  if (sort === 'name') list.sort((a, b) => a.name.localeCompare(b.name, 'id'));
  if (sort === 'available') list.sort((a, b) => Number(b.avail) - Number(a.avail));
  return (
    <>
      <label className={styles.search}>
        <span aria-hidden="true" className={styles.searchIcon} />
        <input aria-label="Cari barang" type="search" placeholder="Cari nama barang, kode, merek…" value={q} onChange={(e) => setQ(e.target.value)} />
      </label>
      {cats.length > 0 && <div className={styles.categories} aria-label="Kategori barang">
        {['', ...cats].map((key) => <button type="button" key={key || 'all'} aria-pressed={activeCat === key} onClick={() => setCat(key)}><NavIcon name={key ? '/konsinyasi' : '/toko'} size={18} />{key || 'Semua'}</button>)}
      </div>}
      <div className={styles.toolbar}>
        <h2>{bulk ? 'Harga beli banyak' : 'Katalog barang'}</h2>
        <div>
          <select aria-label="Urutkan barang" value={sort} onChange={(e) => setSort(e.target.value)}>
            <option value="catalog">Urutan katalog</option><option value="name">Nama A–Z</option><option value="available">Tersedia dulu</option>
          </select>
          <button type="button" aria-label="Tampilan kisi" aria-pressed={layout === 'grid'} onClick={() => setLayout('grid')}><NavIcon name="/toko" size={17} /></button>
          <button type="button" aria-label="Tampilan daftar" aria-pressed={layout === 'list'} onClick={() => setLayout('list')}><NavIcon name="/layanan" size={17} /></button>
        </div>
      </div>
      <div className={`${styles.products} ${layout === 'list' ? styles.list : ''}`}>
        {list.slice(0, 300).map((product) => <ProductCard key={product.id} product={product} qtyOf={qtyOf} setQty={setQty} />)}
      </div>
      {list.length === 0 && <p className="panel muted small">{bulk && !products.length ? 'Belum ada harga beli banyak untuk katalog Anda.' : !products.length ? 'Belum ada barang yang bisa dipesan lewat portal.' : 'Tidak ada barang yang cocok.'}</p>}
      {list.length > 300 && <p className="muted small">Menampilkan 300 dari {list.length} barang. Gunakan pencarian untuk barang lain.</p>}
    </>
  );
}

function ProductCard({ product, qtyOf, setQty }) {
  const [selected, setSelected] = useState('');
  const unit = product.units.find((u) => u.name === selected) || product.units[0];
  if (!unit) return null;
  const qty = qtyOf(product.id, unit.name);
  return (
    <article className={styles.product}>
      <div className={styles.productTop}>
        <div className={styles.photo}>
          {product.thumb ? <img src={mediaUrl(product.thumb)} alt="" loading="lazy" /> : <NavIcon name="/konsinyasi" size={28} />}
        </div>
        <div className={styles.productInfo}>
          <h3>{product.name}</h3>
          <span className={product.avail ? styles.available : styles.limited}>{product.avail ? '✓ Tersedia' : 'Stok terbatas'}</span>
          <span className={styles.price}><b>{rp(priceAt(unit, qty))}</b> / {unit.name}</span>
        </div>
      </div>
      {product.units.length > 1 && <select className={styles.unit} aria-label={`Satuan ${product.name}`} value={unit.name} onChange={(e) => setSelected(e.target.value)}>
        {product.units.map((u) => <option key={u.name} value={u.name}>{u.name}{Number(u.qty) !== 1 ? ` (isi ${angka(u.qty)} ${product.base_unit})` : ''} · {rp(u.price)}</option>)}
      </select>}
      {unit.breaks.length > 0 && <div className={styles.breaks}>{unit.breaks.map((br) => <span key={br.min_qty}>≥{angka(br.min_qty)} {unit.name}: {rp(br.price)}</span>)}</div>}
      <div className={styles.productFoot}>
        <div className={styles.stepper}>
          <button type="button" disabled={!qty} onClick={() => setQty(product.id, unit.name, qty - 1)} aria-label={`Kurangi ${product.name}`}>−</button>
          <input inputMode="decimal" value={qty} onChange={(e) => setQty(product.id, unit.name, qtyNum(e.target.value))} aria-label={`Jumlah ${product.name} dalam ${unit.name}`} />
          <button type="button" onClick={() => setQty(product.id, unit.name, qty + 1)} aria-label={`Tambah ${product.name}`}>+</button>
        </div>
        {qty === 0 && <button type="button" className={styles.add} onClick={() => setQty(product.id, unit.name, 1)} aria-label={`Tambahkan ${product.name} ke keranjang`}><NavIcon name="/penjualan" size={17} /></button>}
      </div>
    </article>
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

// Lacak satu pesanan (data penjual: tahap, kurir, resi, estimasi tiba)
function OrderTrack({ token, order, unread, go }) {
  const [track, setTrack] = useState(null);
  const [err, setErr] = useState('');
  const id = order?.id;
  useEffect(() => {
    if (!id) return;
    let alive = true;
    const load = () => fetch('/api/portal-b2b', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token, action: 'conversation', ref: id, operation: 'track' }) })
      .then(async (r) => { const d = await r.json().catch(() => ({})); if (!alive) return; if (!r.ok || d.error) setErr(d.error || 'Gagal memuat status.'); else { setErr(''); setTrack(d); } }).catch(() => alive && setErr('Koneksi terputus.'));
    load();
    const t = setInterval(() => { if (!document.hidden) load(); }, 20000);
    return () => { alive = false; clearInterval(t); };
  }, [id, token]);
  if (!order) return <section className="panel"><p className="muted">Pesanan tidak ditemukan.</p></section>;
  return <div className="stack">
    <button type="button" className="sm" style={{ justifySelf: 'start' }} onClick={() => go('pesanan')}>← Pesanan</button>
    {err && <div className="notice bad">{err}</div>}
    {!track && !err && <p className="muted">Memuat status…</p>}
    {track && <TrackingView track={track} unread={unread} onContact={() => go('chat', id)} contactLabel="Chat dengan Penjual" />}
  </div>;
}

function Orders({ p, token, reorder, onChanged, waOwner, unread = {}, go }) {
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
            <div className="main"><b className="small">{o.number} <span className={'chip ' + ST[o.status][1]} style={{ marginLeft: 4 }}>{ST[o.status][0]}</span>{unread[o.id] > 0 && <span className="chip bad" style={{ marginLeft: 4 }}>{unread[o.id]} pesan baru</span>}</b>
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
              <button className="sm" onClick={() => go('lacak', o.id)}>Lacak pesanan</button>
              <button className="sm" onClick={() => go('chat', o.id)}>Chat penjual{unread[o.id] > 0 ? ` (${unread[o.id]})` : ''}</button>
              <button className="sm" onClick={() => reorder(o)}>Pesan lagi</button>
              {waOwner && <a href={waOwner(`Halo, saya ingin menanyakan pesanan ${o.number}.`)} target="_blank" rel="noreferrer"><button className="sm">WhatsApp</button></a>}
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
