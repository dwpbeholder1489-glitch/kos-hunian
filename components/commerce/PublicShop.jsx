'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { LogoMark } from '@/components/Logo';
import NavIcon from '@/components/NavIcon';
import PublicForm from '@/components/PublicForm';
import { PayBox } from '@/components/PublicPay';
import Linkify from '@/components/Linkify';
import { mediaUrl } from '@/lib/media';
import { logoUrl } from '@/lib/logo';
import { rp, waLink } from '@/lib/format';
import { uid } from '@/lib/retail';
import { PublicGallery } from '@/components/media/PublicPics';
import { cartLines, lineKey, orderStatus, priceAt, updateCart } from '@/lib/commerce.mjs';
import styles from './shop.module.css';

const icons = {
  back: 'M19 12H5m7-7-7 7 7 7', close: 'm6 6 12 12M18 6 6 18', next: 'm9 6 6 6-6 6',
  search: 'M16 16l5 5M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0Z',
  heart: 'M20.8 4.6a5.4 5.4 0 0 0-7.6 0L12 5.8l-1.2-1.2a5.4 5.4 0 0 0-7.6 7.6L12 21l8.8-8.8a5.4 5.4 0 0 0 0-7.6Z',
  trash: 'M4 7h16M9 7V4h6v3M6 7l1 14h10l1-14M10 10v7m4-7v7',
  pin: 'M20 10c0 5-8 11-8 11S4 15 4 10a8 8 0 1 1 16 0Zm-5 0a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z',
  check: 'm5 12 4 4L19 6',
  star: 'm12 2 3 6 7 1-5 5 1 7-6-3-6 3 1-7-5-5 7-1Z',
};
const links = [
  ['beranda', 'Beranda', '/kamar'], ['katalog', 'Katalog', '/operasional'],
  ['keranjang', 'Keranjang', '/penjualan'], ['pesanan', 'Pesanan', '/tagihan'], ['info', 'Lainnya', '/akun'],
];
const paymentLabels = { tunai: 'Tunai saat menerima barang', transfer: 'Transfer Bank', qris: 'QRIS' };
const orderFilters = ['Semua', 'Menunggu', 'Diproses', 'Dikirim', 'Selesai', 'Batal'];
const stamp = (value) => value ? new Intl.DateTimeFormat('id-ID', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Jakarta' }).format(new Date(value)) : '';
const money = (lines) => lines.reduce((sum, line) => sum + line.total, 0);

function Icon({ name, size = 20 }) {
  return icons[name] ? <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={icons[name]} /></svg> : <NavIcon name={name} size={size} />;
}

function Picture({ photo, name, thumb, className }) {
  const url = mediaUrl(thumb ? photo?.thumb || photo?.path : photo?.path);
  return <span className={className}>{url ? <img src={url} alt={name} loading={thumb ? 'lazy' : undefined} /> : <Icon name="/barang" size={30} />}</span>;
}

function Bar({ title, subtitle, back, children }) {
  return <header className={styles.bar}><button type="button" aria-label="Kembali" onClick={back}><Icon name="back" /></button>
    <div><h1>{title}</h1>{subtitle && <small>{subtitle}</small>}</div><div>{children}</div>
  </header>;
}

function Stepper({ quantity, setQuantity }) {
  return <div className={styles.stepper}>
    <button type="button" aria-label="Kurangi jumlah" onClick={() => setQuantity(Math.max(1, Number(quantity) - 1))}>−</button>
    <input aria-label="Jumlah" type="number" inputMode="decimal" min="0.001" max="1000000" step="0.001" value={quantity} onChange={(e) => setQuantity(e.target.value)} />
    <button type="button" aria-label="Tambah jumlah" onClick={() => setQuantity(Math.min(1000000, Math.floor(Number(quantity)) + 1))}>+</button>
  </div>;
}

function UnitPicker({ product, unit, onChange, compact }) {
  return <fieldset className={compact ? styles.unitCards : styles.unitList}>
    <legend className={compact ? styles.sr : undefined}>Pilih Kemasan</legend>
    {product.units.map((option) => <label key={option.name}>
      <span><b>{option.name}{Number(option.qty) !== 1 ? ` (${option.qty} ${product.base_unit})` : ''}</b><span>{rp(priceAt(option, 1))}</span></span>
      <input type="radio" name={compact ? 'quick-unit' : 'detail-unit'} checked={unit.name === option.name} onChange={() => onChange(option)} />
    </label>)}
  </fieldset>;
}

function ProductSelection({ product, photos, quick, close, add, favorite, toggleFavorite }) {
  const [unit, setUnit] = useState(product.units.find((option) => option.available) || product.units[0]);
  const [quantity, setQuantity] = useState(1);
  const [activePhoto, setActivePhoto] = useState(0);
  const description = product.description || photos[0]?.caption;
  const dialog = useRef(null);
  useEffect(() => {
    if (!quick) return;
    const element = dialog.current;
    element.showModal();
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { element.close(); document.body.style.overflow = overflow; };
  }, [quick]);
  function submit() { add(product, unit, Number(quantity)); }
  const controls = <div className={styles.selectionActions}>
    <Stepper quantity={quantity} setQuantity={setQuantity} />
    <button type="button" className={styles.primary} disabled={!unit.available || !(Number(quantity) > 0 && Number(quantity) <= 1000000)} onClick={submit}>
      <Icon name="/penjualan" />{quick ? 'Tambah' : 'Tambah ke Keranjang'}
    </button>
  </div>;
  if (quick) return <dialog ref={dialog} className={styles.sheet} aria-labelledby="quick-product"
    onCancel={(e) => { e.preventDefault(); close(); }} onClick={(e) => { if (e.target === e.currentTarget) close(); }}>
    <div className={styles.sheetContent}>
      <header><Picture photo={photos[0]} name="" thumb className={styles.thumbnail} /><div><b id="quick-product">{product.name}</b>{product.packaging && <small>{product.packaging}</small>}</div>
        <button type="button" aria-label="Tutup pilihan kemasan" onClick={close} autoFocus><Icon name="close" /></button></header>
      <UnitPicker product={product} unit={unit} onChange={setUnit} compact />
      {controls}
    </div>
  </dialog>;
  return <>
    <Bar title="Detail Produk" back={close}><button type="button" aria-label="Favorit" aria-pressed={favorite} className={favorite ? styles.favorited : ''} onClick={toggleFavorite}><Icon name="heart" /></button></Bar>
    <div className={styles.detail}>
      <div>
        <Picture photo={photos[activePhoto]} name={photos[activePhoto]?.caption || product.name} className={styles.heroPhoto} />
        {photos.length > 1 && <div className={styles.gallery}>{photos.map((photo, i) => <button type="button" key={photo.path} aria-label={`Foto ${i + 1}`} aria-pressed={activePhoto === i} onClick={() => setActivePhoto(i)}>
          <Picture photo={photo} name="" className={styles.thumbnail} thumb />
        </button>)}</div>}
      </div>
      <div>
        <h2>{product.name}</h2>
        <div className={styles.tags}>{[product.category, product.brand].filter(Boolean).map((tag, i) => <span key={i}>{tag}</span>)}</div>
        <div className={styles.priceRow}><span><strong>{rp(priceAt(unit, Number(quantity)))}</strong> / {unit.name}</span>
          <span className={unit.available ? styles.available : styles.unavailable}>{unit.available ? '✓ Tersedia' : 'Stok tidak tersedia'}</span>
        </div>
        <UnitPicker product={product} unit={unit} onChange={setUnit} />
        <div className={styles.accordions}>
          {description && <details><summary>Deskripsi Produk</summary><p>{description}</p></details>}
          <details><summary>Informasi Produk</summary><dl>
            {product.sku && <><dt>Kode barang</dt><dd>{product.sku}</dd></>}
            {product.brand && <><dt>Merek</dt><dd>{product.brand}</dd></>}
            {product.packaging && <><dt>Kemasan</dt><dd>{product.packaging}</dd></>}
            <dt>Satuan dasar</dt><dd>{product.base_unit}</dd>
          </dl></details>
          {product.composition && <details><summary>Komposisi</summary><p>{product.composition}</p></details>}
          <details><summary><Icon name="star" size={15} /> Ulasan Pelanggan{product.rating_count > 0 && <span className={styles.score}>{product.rating} / 5 ({product.rating_count})</span>}</summary>
            <p>{product.rating_count > 0 ? `${product.rating_count} penilaian dari pembeli yang menerima produk ini.` : 'Belum ada penilaian untuk produk ini.'}</p>
          </details>
        </div>
      </div>
    </div>
    <div className={styles.dock}>{controls}</div>
  </>;
}

function Catalog({ page, items, photos, go, contact, openQuick, favorites, toggleFavorite, count, current, initialMode }) {
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('');
  const [sort, setSort] = useState('new');
  const [list, setList] = useState(false);
  const catalog = useRef(null);
  const [mode, setMode] = useState(initialMode);
  useEffect(() => { if (current === 'katalog') catalog.current?.scrollIntoView({ block: 'start' }); }, [current]);
  const categories = [...new Set(items.map((product) => product.category).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'id'));
  const matches = items.filter((product) => (!category || product.category === category) &&
    (!mode || (mode === 'promo' ? product.units.some((unit) => unit.breaks.some((tier) => Number(tier.price) < Number(unit.price))) : favorites.includes(product.id))) &&
    [product.name, product.sku, product.brand].some((value) => value?.toLowerCase().includes(search.trim().toLowerCase())));
  if (sort === 'name') matches.sort((a, b) => a.name.localeCompare(b.name, 'id'));
  if (sort === 'price') matches.sort((a, b) => priceAt(a.units[0], 1) - priceAt(b.units[0], 1));
  const cover = mediaUrl(page.media?.cover?.path) ||
    (/\bsembako\b/i.test([page.tagline, page.about, ...categories].join(' ')) ? '/portal-grosir.webp' : null);
  const logo = logoUrl(page.logo);
  function browse(filter) {
    setMode(filter); setCategory(''); setSearch('');
    catalog.current?.scrollIntoView({ block: 'start', behavior: 'smooth' });
  }
  return <>
    <header className={styles.brand}>
      <div>{logo ? <img src={logo} alt="" /> : <LogoMark size={42} />}<span><b>{page.name}</b><small>Portal Bisnis</small></span></div>
      {contact && <a href={contact} target="_blank" rel="noreferrer"><Icon name="/crm" size={18} />Hubungi</a>}
    </header>
    <section className={styles.banner} style={cover ? { backgroundImage: `linear-gradient(90deg, #003621f0 5%, #08622399 52%, #064e3b20), url("${cover}")` } : undefined}>
      <h1>{page.tagline || `Belanja di ${page.name}`}</h1>
      {page.about && <p>{page.about}</p>}
    </section>
    <div className={styles.shortcuts}>
      <button type="button" className={mode === '' ? styles.active : ''} onClick={() => browse('')}><Icon name="/penjualan" size={25} />Belanja</button>
      <button type="button" className={mode === 'promo' ? styles.active : ''} onClick={() => browse('promo')}><Icon name="/promo" size={23} />Promo</button>
      <button type="button" onClick={() => go('penawaran')}><Icon name="/tagihan" size={23} /><span>Minta<br /> Penawaran</span></button>
      <button type="button" onClick={() => go('info')}><Icon name="/bisnis" size={23} />Info Toko</button>
    </div>
    <section ref={catalog} className={styles.catalog}>
      <label className={styles.search}><Icon name="search" /><input type="search" placeholder="Cari nama barang, kode, merek..." aria-label="Cari produk" value={search} onChange={(e) => setSearch(e.target.value)} /></label>
      <div className={styles.filters}>
        <button type="button" aria-pressed={!category} onClick={() => setCategory('')}><Icon name="/operasional" size={16} />Semua</button>
        {categories.map((name) => <button type="button" key={name} aria-pressed={category === name} onClick={() => setCategory(name)}>{name}</button>)}
      </div>
      <div className={styles.catalogHead}><h2>{mode === 'promo' ? 'Harga beli banyak' : mode === 'favorit' ? 'Produk Favorit' : 'Katalog Produk'}</h2>
        <select aria-label="Urutkan produk" value={sort} onChange={(e) => setSort(e.target.value)}><option value="new">Terbaru</option><option value="name">Nama A–Z</option><option value="price">Harga terendah</option></select>
        <button type="button" aria-label="Tampilan kisi" aria-pressed={!list} onClick={() => setList(false)}><Icon name="/operasional" size={18} /></button>
        <button type="button" aria-label="Tampilan daftar" aria-pressed={list} onClick={() => setList(true)}><Icon name="/catatan" size={18} /></button>
      </div>
      {matches.length ? <div className={list ? styles.productList : styles.products}>{matches.map((product) => {
        const inStock = product.units.some((unit) => unit.available);
        const unit = product.units[0];
        const favorite = favorites.includes(product.id);
        return <article key={product.id} className={styles.card}>
          <button className={styles.productLink} type="button" onClick={() => go('produk', product.id)}>
            <Picture photo={photos[product.id]?.[0]} name="" thumb className={styles.productImage} />
            <span><b>{product.name}</b>{product.packaging && <small>{product.packaging}</small>}</span>
          </button>
          <button className={`${styles.favorite} ${favorite ? styles.favorited : ''}`} type="button" aria-label={`Favorit ${product.name}`} aria-pressed={favorite} onClick={() => toggleFavorite(product.id)}><Icon name="heart" size={18} /></button>
          <div className={styles.cardFoot}><strong>{rp(priceAt(unit, 1))}</strong>
            {inStock ? <button type="button" className={styles.primary} aria-label={`Tambah ${product.name}`} onClick={() => openQuick(product)}><Icon name="/penjualan" /></button> : <small>Habis</small>}
          </div>
        </article>;
      })}</div> : <p className={styles.empty}>{mode === 'promo' ? 'Belum ada harga beli banyak.' : mode === 'favorit' ? 'Belum ada produk favorit.' : 'Tidak ada produk yang cocok.'}</p>}
    </section>
    <nav className={`${styles.dock} ${styles.nav}`} aria-label="Navigasi portal">{links.map(([screen, label, icon]) =>
      <button key={screen} type="button" aria-current={current === screen ? 'page' : undefined} onClick={() => screen === 'katalog' ? (go(screen), browse('')) : screen === 'beranda' ? (setMode(''), go(screen)) : go(screen)}>
        <span><Icon name={icon} />{screen === 'keranjang' && count > 0 && <i>{count}</i>}</span>{label}
      </button>
    )}</nav>
  </>;
}

function Cart({ lines, selected, toggle, setQty, photos, total, canCheckout, proceed, clear, go }) {
  return <>
    <Bar title="Keranjang Belanja" back={() => go('beranda')}>
      {lines.length > 0 && <button type="button" aria-label="Hapus barang terpilih" onClick={clear} disabled={!lines.some((line) => selected(lineKey(line)))}><Icon name="trash" /></button>}
    </Bar>
    {lines.length ? <div className={styles.cart}>{lines.map((line) => <div className={styles.cartItem} key={lineKey(line)}>
      <input type="checkbox" aria-label={`Pilih ${line.pr.name} (${line.unit})`} checked={selected(lineKey(line))} onChange={() => toggle(lineKey(line))} />
      <button className={styles.cartProduct} type="button" onClick={() => go('produk', line.pr.id)}>
        <Picture photo={photos[line.pr.id]?.[0]} name="" thumb className={styles.thumbnail} />
        <span><b>{line.pr.name}</b><small>{line.unit}{line.u.qty > 1 ? ` (${line.u.qty} ${line.pr.base_unit})` : ''}</small><strong>{rp(line.total)}</strong>{!line.u.available && <small className={styles.unavailable}>Stok tidak tersedia</small>}</span>
      </button>
      <Stepper quantity={line.qty} setQuantity={(qty) => { if (Number(qty) > 0) setQty(line.product_id, line.unit, qty); }} />
    </div>)}</div> : <p className={styles.empty}>Keranjang masih kosong.</p>}
    <div className={`${styles.dock} ${styles.summary}`}><div><small>Total ({lines.filter((line) => selected(lineKey(line))).length} Produk)</small><strong>{rp(total)}</strong></div>
      <button type="button" className={styles.primary} disabled={!canCheckout} onClick={proceed}>Lanjut ke Checkout</button>
    </div>
  </>;
}

function Checkout({ page, pay, lines, quote, back, submit, ready }) {
  const [fulfillment, setFulfillment] = useState('ambil');
  const [payment, setPayment] = useState('tunai');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const pending = useRef(null);
  async function send(event) {
    event.preventDefault();
    if (busy) return;
    const fields = Object.fromEntries(new FormData(event.currentTarget));
    const payload = { ...fields, consent: fields.consent === 'on', fulfillment: quote ? null : fulfillment,
      payment: quote ? null : payment, kind: quote ? 'penawaran' : 'pesanan',
      lines: lines.map(({ product_id, unit, qty }) => ({ product_id, unit, qty })) };
    const signature = JSON.stringify(payload);
    if (!pending.current || pending.current.signature !== signature) pending.current = { signature, id: uid() };
    setBusy(true); setError('');
    try { await submit({ ...payload, id: pending.current.id }); }
    catch (err) { setError(err.message); }
    finally { setBusy(false); }
  }
  const methods = ['tunai', ...(pay?.payment_info ? ['transfer'] : []), ...(pay?.qris ? ['qris'] : [])];
  return <>
    <Bar title={quote ? 'Minta Penawaran' : 'Checkout'} back={back} />
    <form className={styles.checkout} onSubmit={send}>
      {!quote && <>
        <fieldset><legend>Alamat Pengiriman</legend>
          <label className={styles.choice}><input type="radio" name="delivery_choice" checked={fulfillment === 'ambil'} onChange={() => setFulfillment('ambil')} /><span><b>Ambil di Toko</b><small>{page.name}{[page.address, page.hours].filter(Boolean).length > 0 && <><br />{[page.address, page.hours].filter(Boolean).join(' · ')}</>}</small></span></label>
          <label className={styles.choice}><input type="radio" name="delivery_choice" checked={fulfillment === 'antar'} onChange={() => setFulfillment('antar')} /><span><b>Dikirim ke Alamat</b><small>Masukkan alamat pengiriman</small></span></label>
          {fulfillment === 'antar' && <label className={styles.field}>Alamat lengkap<textarea name="ship_address" minLength={5} maxLength={300} required /></label>}
        </fieldset>
        <fieldset><legend>Metode Pembayaran</legend>{methods.map((method) =>
          <label className={styles.choice} key={method}><input type="radio" name="payment_choice" checked={payment === method} onChange={() => setPayment(method)} /><b>{paymentLabels[method]}</b></label>
        )}</fieldset>
      </>}
      <fieldset><legend>Kontak Pemesan</legend>
        <label className={styles.field}>Nama<input name="name" autoComplete="name" minLength={2} maxLength={80} required /></label>
        <label className={styles.field}>Nomor WhatsApp<input name="phone" type="tel" autoComplete="tel" minLength={9} maxLength={30} required /></label>
        <label className={styles.field}>Catatan (opsional)<textarea name="note" maxLength={350} rows={2} /></label>
        <label className={styles.consent}><input name="consent" type="checkbox" required />Saya setuju dihubungi toko terkait pesanan ini.</label>
      </fieldset>
      {!lines.length && <p className={styles.empty}>Pilih barang di keranjang untuk melanjutkan.</p>}
      {error && <p role="alert" className={styles.error}>{error}</p>}
      <div className={`${styles.dock} ${styles.summary} ${styles.checkoutDock}`}>
        <div><small>{quote ? 'Perkiraan Total' : 'Total Barang'}</small><strong>{rp(money(lines))}</strong></div>
        <button type="submit" className={styles.primary} disabled={!ready || !lines.length || busy}>{busy ? 'Mengirim…' : quote ? 'Kirim Permintaan' : 'Buat Pesanan'}</button>
      </div>
    </form>
  </>;
}

function Orders({ orders, error, refresh, go, photos }) {
  const [filter, setFilter] = useState('Semua');
  const visible = orders?.filter((order) => filter === 'Semua' || orderStatus(order) === filter);
  return <>
    <Bar title="Pesanan Saya" back={() => go('beranda')} />
    <div className={styles.filters}>{orderFilters.map((status) => <button type="button" key={status} aria-pressed={filter === status} onClick={() => setFilter(status)}>{status}</button>)}</div>
    {error && <p role="alert" className={styles.error}>{error} <button type="button" onClick={refresh}>Coba lagi</button></p>}
    {!orders && !error && <p className={styles.empty}>Memuat pesanan…</p>}
    {visible?.length === 0 && <p className={styles.empty}>{filter === 'Semua' ? 'Belum ada pesanan dari browser ini.' : 'Tidak ada pesanan dengan status ini.'}</p>}
    <div className={styles.orderList}>{visible?.map((order) => {
      const status = orderStatus(order);
      return <button key={order.id} type="button" onClick={() => go('lacak', order.id)}>
        <span><b>#{order.number}</b><small>{stamp(order.created_at)}</small><strong>{rp(order.total)}</strong>
          <span className={styles.orderThumbs}>{order.lines.slice(0, 4).map((line, index) => <Picture key={index} photo={photos[line.product_id]?.[0]} name={line.name} thumb className={styles.thumbnail} />)}</span>
        </span>
        <span><span className={styles.status} data-status={status}>{status}</span><Icon name="next" size={16} /></span>
      </button>;
    })}</div>
  </>;
}

function Rating({ item, orderId, rate }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function submit(event) {
    event.preventDefault();
    const score = Number(new FormData(event.currentTarget).get('score'));
    setBusy(true);
    setError('');
    try { await rate(orderId, item.product_id, score); }
    catch (failure) { setError(failure.message); }
    finally { setBusy(false); }
  }
  return <form className={styles.rating} onSubmit={submit}>
    <label><span>{item.name}</span><select name="score" defaultValue={item.rating || ""} required aria-label={`Penilaian ${item.name}`}>
      <option value="" disabled>Pilih nilai</option>
      {[5, 4, 3, 2, 1].map((score) => <option key={score} value={score}>{score} / 5</option>)}
    </select></label>
    <button type="submit" disabled={busy}>{busy ? 'Menyimpan…' : item.rating ? 'Ubah penilaian' : 'Kirim penilaian'}</button>
    {error && <small role="alert">{error}</small>}
  </form>;
}

function Tracking({ order, orders, page, pay, contact, go, error, rate }) {
  if (!order) return <><Bar title="Detail Pesanan" back={() => go('pesanan')} /><p className={styles.empty}>{error || (orders ? 'Pesanan tidak ditemukan di browser ini.' : 'Memuat pesanan…')}</p></>;
  const status = orderStatus(order);
  const delivery = order.deliveries.find((entry) => entry.status !== 'gagal');
  const received = [...order.deliveries].reverse().find((entry) => entry.received_at)?.received_at;
  const ratingItems = [...new Map(order.lines.filter((line) => line.rateable).map((line) => [line.product_id, line])).values()];
  const steps = [
    [order.kind === 'penawaran' ? 'Permintaan penawaran dibuat' : 'Pesanan dibuat', order.created_at, ''],
    ['Diproses', order.confirmed_at, order.confirmed_at ? 'Pesanan sedang disiapkan' : 'Menunggu konfirmasi toko'],
    [order.fulfillment === 'ambil' ? 'Diserahkan' : 'Dikirim', delivery?.created_at, order.fulfillment === 'ambil' ? 'Menunggu pengambilan' : 'Menunggu pengiriman'],
    ['Selesai', status === 'Selesai' ? received || order.closed_at || delivery?.created_at : null, status === 'Selesai' ? '' : 'Belum selesai'],
  ];
  return <>
    <Bar title="Detail Pesanan" subtitle={`#${order.number}`} back={() => go('pesanan')} />
    <ol className={styles.timeline}>{steps.map(([label, date, hint]) => <li key={label} data-done={Boolean(date)}>
      <span className={styles.dot}>{date && <Icon name="check" size={14} />}</span><div><b>{label}</b>{date && <small>{stamp(date)}</small>}{hint && (!date || label === 'Diproses') && <small>{hint}</small>}</div>
    </li>)}</ol>
    {status === 'Batal' && <p className={styles.error}>Pesanan dibatalkan.</p>}
    {contact && <a className={styles.contactOrder} href={waLink(page.wa_phone, `Halo ${page.name}, saya ingin menanyakan pesanan ${order.number}.`)} target="_blank" rel="noreferrer"><Icon name="/crm" />Hubungi Toko</a>}
    <section className={styles.orderContents}><h2>Ringkasan Pesanan</h2>
      {order.lines.map((line, index) => <div key={index}><span>{line.name}<small>{line.qty} {line.unit}</small></span><b>{rp(line.total)}</b></div>)}
      <div><strong>Total Barang</strong><strong>{rp(order.total)}</strong></div>
      {order.payment && <p>{paymentLabels[order.payment]}</p>}
      {status === 'Menunggu' && order.payment && <p>Tunggu konfirmasi toko untuk total akhir, ongkir, dan instruksi pembayaran.</p>}
      {status === 'Diproses' && (order.payment === 'transfer' || order.payment === 'qris') && <PayBox pay={pay ? { ...pay, payment_info: order.payment === 'transfer' ? pay.payment_info : null, qris: order.payment === 'qris' ? pay.qris : null } : null} note="Konfirmasi total akhir dengan toko dan simpan bukti pembayaran." />}
    </section>
    {status === 'Selesai' && ratingItems.length > 0 && <section className={styles.orderContents}>
      <h2>Nilai Produk</h2>{ratingItems.map((item) => <Rating key={item.product_id} item={item} orderId={order.id} rate={rate} />)}
    </section>}
  </>;
}

function readScreen() {
  const url = new URL(window.location.href);
  return [url.searchParams.get('tampilan') || 'beranda', url.searchParams.get('id')];
}

export default function PublicShop({ page, shop }) {
  const photos = page.media?.items || {};
  const products = useMemo(() => new Map(shop.items.map((item) => [item.id, item])), [shop.items]);
  const [screen, setScreen] = useState(['beranda', null]);
  const [cart, setCart] = useState([]);
  const [favorites, setFavorites] = useState([]);
  const [initialized, setInitialized] = useState(false);
  const [quick, setQuick] = useState(null);
  const [excluded, setExcluded] = useState([]);
  const [orders, setOrders] = useState(null);
  const [networkError, setNetworkError] = useState('');
  const [notice, setNotice] = useState('');
  const pendingLoad = useRef(null);

  const storage = `prasara.shop.${page.slug}`;
  const endpoint = `/api/portal-shop?slug=${encodeURIComponent(page.slug)}`;
  const lines = cartLines(cart, products);
  const selected = (key) => !excluded.includes(key);
  const chosen = lines.filter((line) => selected(lineKey(line)));
  const canCheckout = chosen.length > 0 && chosen.every((line) => line.u.available);
  const contact = page.wa_phone ? waLink(page.wa_phone, `Halo ${page.name}, saya lihat halaman toko Anda.`) : null;
  const [view, id] = screen;
  const product = products.get(id);
  const order = orders?.find((row) => row.id === id);

  function go(view, id = null) {
    const url = new URL(window.location.href);
    if (view === 'beranda') url.searchParams.delete('tampilan');
    else url.searchParams.set('tampilan', view);
    if (id) url.searchParams.set('id', id);
    else url.searchParams.delete('id');
    if (url.href !== window.location.href) window.history.pushState(null, '', url);
    setScreen([view, id]);
    setQuick(null);
    window.scrollTo(0, 0);
  }
  useEffect(() => {
    function restore() { setScreen(readScreen()); setQuick(null); }
    restore();
    try {
      const saved = JSON.parse(localStorage.getItem(storage) || '{}');
      if (Array.isArray(saved?.cart)) setCart(saved.cart.filter((line) => line && typeof line.product_id === 'string'));
      if (Array.isArray(saved?.favorites)) setFavorites(saved.favorites);
    } catch {}
    setInitialized(true);
    window.addEventListener('popstate', restore);
    return () => window.removeEventListener('popstate', restore);
  }, [storage]);
  useEffect(() => {
    if (!initialized) return;
    try { localStorage.setItem(storage, JSON.stringify({ cart, favorites })); } catch {}
  }, [storage, initialized, cart, favorites]);
  useEffect(() => {
    if (!notice) return;
    const timeout = setTimeout(() => setNotice(''), 2800);
    return () => clearTimeout(timeout);
  }, [notice]);

  function refresh() {
    if (pendingLoad.current) return pendingLoad.current;
    pendingLoad.current = fetch(endpoint, { cache: 'no-store' }).then(async (res) => {
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setOrders(data.orders);
      setNetworkError('');
    }).catch((error) => setNetworkError(error.message || 'Gagal memuat pesanan.')).finally(() => { pendingLoad.current = null; });
    return pendingLoad.current;
  }
  useEffect(() => {
    if (!['checkout', 'penawaran', 'pesanan', 'lacak'].includes(view)) return;
    refresh();
    if (view !== 'lacak' && view !== 'pesanan') return;
    const timer = setInterval(() => { if (!document.hidden) refresh(); }, 15000);
    return () => clearInterval(timer);
  }, [view, endpoint]); // refresh memakai endpoint yang sama selama tampilan aktif

  function add(item, unit, qty) {
    setCart((current) => updateCart(current, item.id, unit.name,
      (current.find((line) => line.product_id === item.id && line.unit === unit.name)?.qty || 0) + qty));
    setExcluded((old) => old.filter((key) => key !== lineKey({ product_id: item.id, unit: unit.name })));
    setQuick(null);
    setNotice(`${item.name} ditambahkan ke keranjang`);
  }
  function favorite(id) {
    setFavorites((current) => current.includes(id) ? current.filter((value) => value !== id) : [...current, id]);
  }
  async function submit(payload) {
    if (pendingLoad.current) await pendingLoad.current;
    const res = await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Pesanan gagal dikirim.');
    const keys = new Set(payload.lines.map(lineKey));
    setCart((old) => old.filter((line) => !keys.has(lineKey(line))));
    await refresh();
    go('lacak', data.id);
  }
  async function rate(order, product, score) {
    const res = await fetch(endpoint, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'rating', order, product, score }),
    });
    if (!res.ok) throw new Error((await res.json()).error || 'Gagal menyimpan penilaian.');
    await refresh();
    setNotice('Penilaian tersimpan.');
  }
  let content;
  if (view === 'produk' && product) content = <ProductSelection key={product.id} product={product} photos={photos[product.id] || []}
    close={() => go('katalog')} add={add} favorite={favorites.includes(product.id)} toggleFavorite={() => favorite(product.id)} />;
  else if (view === 'keranjang') content = <Cart lines={lines} photos={photos} selected={selected} total={money(chosen)} canCheckout={canCheckout} go={go}
    toggle={(key) => setExcluded((old) => old.includes(key) ? old.filter((item) => item !== key) : [...old, key])}
    setQty={(...args) => setCart((old) => updateCart(old, ...args))} proceed={() => go('checkout')}
    clear={() => setCart((old) => old.filter((line) => !selected(lineKey(line))))} />;
  else if (view === 'checkout' || view === 'penawaran') content = <>
    {(view !== 'penawaran' || chosen.length > 0) && <Checkout key={view} page={page} pay={shop.pay} lines={chosen} quote={view === 'penawaran'} back={() => go('keranjang')} submit={submit} ready={orders !== null && (view === 'penawaran' || canCheckout)} />}
    {networkError && <p role="alert" className={styles.error}>{networkError} <button type="button" onClick={refresh}>Coba lagi</button></p>}
    {view === 'penawaran' && !chosen.length && <div className={styles.info}><PublicForm page={page} /></div>}
  </>;
  else if (view === 'bayar') content = <>
    <Bar title="Cara Bayar" back={() => go('beranda')} />
    <div className={styles.info}>{shop.pay ? <PayBox pay={shop.pay} /> : <p className={styles.empty}>Hubungi bisnis untuk mengetahui cara pembayaran.</p>}</div>
  </>;
  else if (view === 'pesanan') content = <Orders orders={orders} photos={photos} error={networkError} refresh={refresh} go={go} />;
  else if (view === 'lacak') content = <Tracking order={order} orders={orders} page={page} pay={shop.pay} contact={contact} error={networkError} go={go} rate={rate} />;
  else if (view === 'info') content = <>
    <Bar title="Info Toko" back={() => go('beranda')} />
    <section className={styles.info}><h2>{page.name}</h2>
      {[page.address, page.hours, page.about, page.policy].filter(Boolean).map((text, i) => <p key={i}><Linkify text={text} /></p>)}
      {contact && <a className={styles.contactOrder} href={contact} target="_blank" rel="noreferrer"><Icon name="/crm" />Hubungi Toko</a>}
      {page.links?.filter((link) => /^https?:\/\//i.test(link.url)).map((link) => <p key={link.url}><a href={link.url} target="_blank" rel="noreferrer">{link.label}</a></p>)}
      <button type="button" onClick={() => go('favorit')}><Icon name="heart" />Produk Favorit</button>
      <button type="button" onClick={() => go('penawaran')}><Icon name="/tagihan" />Minta Penawaran</button>
      <button type="button" onClick={() => go('permintaan')}><Icon name="/crm" />Kirim Permintaan ke Toko</button>
      <a href="/panduan">Panduan PRASARA</a>
    </section>
    <PublicGallery items={page.media?.gallery} title="Galeri Toko" />
  </>;
  else if (view === 'permintaan') content = <><Bar title="Kirim Permintaan" back={() => go('info')} /><div className={styles.info}><PublicForm page={page} /></div></>;
  else content = <Catalog key={view === 'favorit' ? 'favorit' : 'catalog'} page={page} items={shop.items} photos={photos} go={go} contact={contact} favorites={favorites} toggleFavorite={favorite}
    count={lines.length} current={['katalog', 'favorit'].includes(view) ? 'katalog' : 'beranda'} openQuick={setQuick} initialMode={view === 'favorit' ? 'favorit' : ''} />;
  return <main className={styles.portal} data-screen={view}>
    {content}
    {quick && <ProductSelection key={quick.id} quick product={quick} photos={photos[quick.id] || []} close={() => setQuick(null)} add={add} />}
    {notice && <div className={styles.notice} role="status"><span>{notice}</span>{notice.endsWith('ke keranjang') && <button type="button" onClick={() => { setNotice(''); go('keranjang'); }}>Lihat</button>}</div>}
  </main>;
}
