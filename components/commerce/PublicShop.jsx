'use client';

import CustomerChat from './CustomerChat';
import SmartDetailSheet from '@/components/SmartDetailSheet';
import { TrackingView } from './ChatParts';
import { useEffect, useMemo, useRef, useState } from 'react';
import { LogoMark } from '@/components/Logo';
import NavIcon from '@/components/NavIcon';
import QuoteRequest from './QuoteRequest';
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
  info: 'M12 11v6m0-10h.01M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0Z',
  share: 'M12 15V2m-4 4 4-4 4 4M7 9H4v12h16V9h-3', menu: 'M4 6h16M4 12h16M4 18h16',
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

function Stepper({ quantity, setQuantity, cart = false }) {
  const [draft, setDraft] = useState(null);
  return <div className={styles.stepper}>
    <button type="button" aria-label="Kurangi jumlah" onClick={() => { setDraft(null); setQuantity(Math.max(1, Number(quantity) - 1)); }}>−</button>
    <input aria-label="Jumlah" type="number" inputMode="decimal" min="0.001" max="1000000" step="0.001" value={draft ?? quantity} onBlur={() => setDraft(null)} onChange={(event) => {
      const value = event.target.value;
      if (cart) setDraft(value);
      setQuantity(value);
    }} />
    <button type="button" aria-label="Tambah jumlah" onClick={() => { setDraft(null); setQuantity(Math.min(1000000, Math.floor(Number(quantity)) + 1)); }}>+</button>
  </div>;
}

function UnitPicker({ product, unit, onChange, compact, quoteOnly }) {
  return <fieldset className={compact ? styles.unitCards : styles.unitList}>
    <legend className={compact ? styles.sr : undefined}>Pilih Kemasan</legend>
    {product.units.map((option) => <label key={option.name}>
      <span><b>{option.name}{option.qty > 1 ? ` (${option.qty} ${product.base_unit})` : ''}</b><span>{quoteOnly ? 'Minta harga' : rp(priceAt(option, 1))}</span></span>
      <input type="radio" name={compact ? 'quick-unit' : 'detail-unit'} checked={unit.name === option.name} onChange={() => onChange(option)} />
    </label>)}
  </fieldset>;
}

function ProductSelection({ product, photos, quick, close, add, favorite, toggleFavorite, quoteOnly }) {
  const [unit, setUnit] = useState(product.units.find((option) => option.available) || product.units[0]);
  const [quantity, setQuantity] = useState(1);
  const [activePhoto, setActivePhoto] = useState(0);
  const description = product.description || photos[0]?.caption;
  function submit() { add(product, unit, Number(quantity)); }
  const controls = <div className={styles.selectionActions}>
    <Stepper quantity={quantity} setQuantity={setQuantity} />
    <button type="button" className={styles.primary} disabled={!unit.available || !(Number(quantity) > 0 && Number(quantity) <= 1000000)} onClick={submit}>
      <Icon name="/penjualan" />{quick ? 'Tambah' : 'Tambah ke Keranjang'}
    </button>
  </div>;
  if (quick) return <SmartDetailSheet title={product.name} subtitle={product.packaging} icon="/penjualan" onClose={close}>
    <div className={styles.quickContent}>
      {photos[0] && <Picture photo={photos[0]} name="" thumb className={styles.thumbnail} />}
      <UnitPicker product={product} unit={unit} onChange={setUnit} quoteOnly={quoteOnly} compact />
      {controls}
    </div>
  </SmartDetailSheet>;
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
        {!quoteOnly && <div className={styles.priceRow}><span><strong>{rp(priceAt(unit, Number(quantity)))}</strong> / {unit.name}</span>
          <span className={unit.available ? styles.available : styles.unavailable}>{unit.available ? '✓ Tersedia' : 'Stok tidak tersedia'}</span>
        </div>}
        <UnitPicker product={product} unit={unit} onChange={setUnit} quoteOnly={quoteOnly} />
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
    <div className={styles.productActions}>{controls}</div>
  </>;
}

function Catalog({ page, items, photos, go, contact, openQuick, favorites, toggleFavorite, count, current, initialMode, focusSearch, quoteOnly }) {
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('');
  const [sort, setSort] = useState('new');
  const [list, setList] = useState(false);
  const catalog = useRef(null);
  const [mode, setMode] = useState(initialMode);
  useEffect(() => { if (current === 'katalog') catalog.current?.scrollIntoView({ block: 'start' }); }, [current]);
  const categories = [...new Set(items.map((product) => product.category).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'id'));
  const matches = items.filter((product) => (!category || product.category === category) &&
    (!mode || (mode === 'promo' ? quoteOnly || product.units.some((unit) => unit.breaks.some((tier) => Number(tier.price) < Number(unit.price)))
      : mode === 'paket' ? product.package : favorites.includes(product.id))) &&
    [product.name, product.sku, product.brand].some((value) => value?.toLowerCase().includes(search.trim().toLowerCase())));
  if (sort === 'name') matches.sort((a, b) => a.name.localeCompare(b.name, 'id'));
  if (sort === 'price' && !quoteOnly) matches.sort((a, b) => priceAt(a.units[0], 1) - priceAt(b.units[0], 1));
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
      <button type="button" onClick={() => go('layanan')}><Icon name="/tagihan" size={23} />Layanan Toko</button>
      <button type="button" onClick={() => go('info')}><Icon name="/bisnis" size={23} />Info Toko</button>
    </div>
    <section ref={catalog} className={styles.catalog}>
      <label className={styles.search}><Icon name="search" /><input autoFocus={focusSearch} type="search" placeholder="Cari nama barang, kode, merek..." aria-label="Cari produk" value={search} onChange={(e) => setSearch(e.target.value)} /></label>
      <div className={styles.filters}>
        <button type="button" aria-pressed={!category} onClick={() => setCategory('')}><Icon name="/operasional" size={16} />Semua</button>
        {categories.map((name) => <button type="button" key={name} aria-pressed={category === name} onClick={() => setCategory(name)}>{name}</button>)}
      </div>
      <div className={styles.catalogHead}><h2>{mode === 'promo' ? quoteOnly ? 'Belanja Grosir' : 'Harga beli banyak' : mode === 'paket' ? 'Paket Usaha' : mode === 'favorit' ? 'Produk Favorit' : 'Katalog Produk'}</h2>
        <select aria-label="Urutkan produk" value={sort} onChange={(e) => setSort(e.target.value)}><option value="new">Terbaru</option><option value="name">Nama A–Z</option>{!quoteOnly && <option value="price">Harga terendah</option>}</select>
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
          <div className={styles.cardFoot}><strong>{quoteOnly ? 'Minta harga' : rp(priceAt(unit, 1))}</strong>
            {inStock ? <button type="button" className={styles.primary} aria-label={`Tambah ${product.name}`} onClick={() => openQuick(product)}><Icon name="/penjualan" /></button> : <small>Habis</small>}
          </div>
        </article>;
      })}</div> : <p className={styles.empty}>{mode === 'promo' ? 'Belum ada harga beli banyak.' : mode === 'favorit' ? 'Belum ada produk favorit.' : mode === 'paket' ? 'Belum ada paket usaha di katalog.' : 'Tidak ada produk yang cocok.'}</p>}
    </section>
    <nav className={`${styles.dock} ${styles.nav}`} aria-label="Navigasi portal">{links.map(([screen, label, icon]) =>
      <button key={screen} type="button" aria-current={current === screen ? 'page' : undefined} onClick={() => screen === 'katalog' ? (go(screen), browse('')) : screen === 'beranda' ? (setMode(''), go(screen)) : go(screen)}>
        <span><Icon name={icon} />{screen === 'keranjang' && count > 0 && <i>{count}</i>}</span>{label}
      </button>
    )}</nav>
  </>;
}

function PortalFooter() {
  return <footer className={styles.powered}>Powered by <b>PRASARA</b></footer>;
}

const serviceLinks = [
  ['Belanja Grosir', 'Pembelian jumlah besar dengan harga lebih hemat', '/barang', 'katalog', 'grosir'],
  ['Daftar Kebutuhan', 'Kirim daftar belanja (Excel, PDF, atau foto)', '/catatan', 'permintaan', 'daftar'],
  ['Paket Usaha', 'Pilihan paket kebutuhan usaha Anda', '/operasional', 'katalog', 'paket'],
  ['Cari Barang', 'Ajukan barang di luar katalog', 'search', 'permintaan', 'cari'],
  ['Penawaran Saya', 'Lihat status dan harga yang diajukan', '/tagihan', 'riwayat-penawaran'],
  ['Hubungi Toko', 'Konsultasikan kebutuhan Anda langsung via chat', '/crm', 'chat'],
];

function StoreServices({ page, count, unread, go, canQuote }) {
  const logo = logoUrl(page.logo);
  return <div className={styles.storeServices}>
    <header className={styles.serviceHeader}>
      <span className={styles.serviceLogo}>{logo ? <img src={logo} alt="" /> : <Icon name="/penjualan" />}</span>
      <div className={styles.serviceIdentity}><b>{page.name}</b>{page.tagline && <small>{page.tagline}</small>}</div>
      <button type="button" aria-label="Cari di katalog" onClick={() => go('katalog', 'cari')}><Icon name="search" /></button>
      <button type="button" className={styles.cartShortcut} aria-label={`Keranjang Belanja (${count})`} onClick={() => go('keranjang')}><Icon name="/penjualan" />{count > 0 && <i>{count}</i>}</button>
      <details className={styles.serviceMenu}><summary aria-label="Menu toko"><Icon name="menu" /></summary><div>
        <button type="button" onClick={() => go('beranda')}>Beranda Toko</button>
        <button type="button" onClick={() => go('pesanan')}>Pesanan Saya</button>
        <button type="button" onClick={() => go('info')}>Info Toko</button>
      </div></details>
    </header>
    <section className={styles.serviceHero}>
      <div><h1>Layanan Toko</h1><p>Solusi belanja untuk kebutuhan pribadi dan usaha Anda.</p></div>
      <img src="/retail/prasara-maskot.webp" alt="" />
    </section>
    <div className={styles.serviceGrid}>{serviceLinks.map(([title, description, icon, screen, mode], index) =>
      <button type="button" key={title} className={index >= 4 ? styles.serviceWide : undefined} disabled={screen === 'permintaan' && !canQuote} onClick={() => go(screen, mode)}>
        <span className={styles.serviceIcon}><Icon name={icon} /></span>
        <span><b>{title}</b><small>{description}</small></span>
        {screen === 'chat' && unread > 0 && <span className={styles.unreadBadge}>{unread}</span>}
        <Icon name="next" size={16} />
      </button>
    )}</div>
    <p className={styles.serviceHelp}>{canQuote ? <>Butuh harga khusus? Tambahkan barang ke keranjang, lalu pilih <b>Ajukan Penawaran.</b></> : <>Toko belum menerima pengajuan penawaran dari portal. Hubungi toko untuk menanyakan harga khusus.</>}</p>
    <PortalFooter />
  </div>;
}

function Cart({ page, lines, chosen, selected, toggle, toggleAll, setQty, photos, total, canCheckout, canQuote, quoteOnly, proceed, clear, go, share }) {
  const [showHelp, setShowHelp] = useState(true);
  const selectAll = useRef(null);
  const all = lines.length > 0 && chosen.length === lines.length;
  useEffect(() => {
    if (selectAll.current) selectAll.current.indeterminate = chosen.length > 0 && !all;
  }, [chosen.length, all]);
  return <div className={styles.cartScreen}>
    <header className={styles.cartHeader}>
      <button type="button" aria-label="Kembali ke katalog" onClick={() => go('katalog')}><Icon name="back" /></button>
      <div><h1>Keranjang Belanja</h1><small>{page.name}</small></div>
      <button type="button" aria-label="Bagikan tautan toko" onClick={share}><Icon name="share" /></button>
      <button type="button" aria-label="Hapus barang terpilih" onClick={clear} disabled={!chosen.length}><Icon name="trash" /></button>
    </header>
    <div className={styles.cartLayout}>
      <div className={styles.cartItems}>
        {canQuote && showHelp && <div className={styles.cartHelp}><span className={styles.serviceIcon}><Icon name="/promo" size={21} /></span>
          <p>{quoteOnly ? <>Pilih barang lalu <b>Ajukan Penawaran</b> untuk meminta harga dari toko.</> : <>Pilih lanjutan sesuai kebutuhan Anda. <b>Checkout</b> untuk pembelian langsung atau <b>Ajukan Penawaran</b> untuk harga khusus.</>}</p>
          <button type="button" aria-label="Sembunyikan petunjuk" onClick={() => setShowHelp(false)}><Icon name="close" size={20} /></button>
        </div>}
        {lines.length ? <>
          <div className={styles.cartSelect}><label><input ref={selectAll} type="checkbox" checked={all} onChange={toggleAll} />Pilih Semua ({lines.length})</label>
            <button type="button" className={styles.textAction} onClick={clear} disabled={!chosen.length}>Hapus yang dipilih</button>
          </div>
          <div className={styles.cart}>{lines.map((line) => <div className={styles.cartItem} key={lineKey(line)}>
            <input type="checkbox" aria-label={`Pilih ${line.pr.name} (${line.unit})`} checked={selected(lineKey(line))} onChange={() => toggle(lineKey(line))} />
            <button className={styles.cartProduct} type="button" onClick={() => go('produk', line.pr.id)}>
              <Picture photo={photos[line.pr.id]?.[0]} name="" thumb className={styles.thumbnail} />
              <span><b>{line.pr.name}</b><small>Satuan: {line.unit}{line.u.qty > 1 ? ` (${line.u.qty} ${line.pr.base_unit})` : ''}</small>
                {!quoteOnly && <strong>{rp(line.total)}</strong>}{!quoteOnly && !line.u.available && <small className={styles.unavailable}>Stok tidak tersedia</small>}</span>
            </button>
            <Stepper cart quantity={line.qty} setQuantity={(qty) => { if (Number(qty) >= 0.001 && Number(qty) <= 1000000) setQty(line.product_id, line.unit, qty); }} />
            <button type="button" className={styles.removeItem} aria-label={`Hapus ${line.pr.name} (${line.unit})`} onClick={() => setQty(line.product_id, line.unit, 0)}><Icon name="trash" size={17} /></button>
          </div>)}</div>
        </> : <div className={styles.emptyCart}><Icon name="/penjualan" size={36} /><h2>Keranjang masih kosong</h2><button className={styles.textAction} type="button" onClick={() => go('katalog')}>Buka katalog</button></div>}
      </div>
      <div className={styles.cartActions}>
        <div className={styles.cartTotal}><span><Icon name="/barang" size={20} />Total {chosen.length} pilihan barang</span>
          <strong>{quoteOnly ? 'Harga menyusul' : rp(total)}</strong></div>
        {!quoteOnly && <button type="button" className={styles.primary} disabled={!canCheckout} onClick={proceed}><Icon name="/penjualan" /><span>Lanjut ke Checkout</span><Icon name="next" size={18} /></button>}
        {canQuote && <><button type="button" className={styles.outlineAction} disabled={!chosen.length} onClick={() => go('permintaan')}><Icon name="/catatan" /><span>Ajukan Penawaran</span><Icon name="next" size={18} /></button>
        <p className={styles.cartNote}><Icon name="info" size={18} /><span>Ajukan penawaran untuk meminta harga khusus, terutama untuk pembelian dalam jumlah besar.</span></p></>}
      </div>
    </div>
    <PortalFooter />
  </div>;
}

function Checkout({ page, pay, lines, back, submit, ready }) {
  const [fulfillment, setFulfillment] = useState('ambil');
  const [payment, setPayment] = useState('tunai');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const pending = useRef(null);
  async function send(event) {
    event.preventDefault();
    if (busy) return;
    const fields = Object.fromEntries(new FormData(event.currentTarget));
    const payload = { ...fields, consent: fields.consent === 'on', fulfillment, payment, kind: 'pesanan',
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
    <Bar title="Checkout" back={back} />
    <form className={styles.checkout} onSubmit={send}>
      <>
        <fieldset><legend>Alamat Pengiriman</legend>
          <label className={styles.choice}><input type="radio" name="delivery_choice" checked={fulfillment === 'ambil'} onChange={() => setFulfillment('ambil')} /><span><b>Ambil di Toko</b><small>{page.name}{[page.address, page.hours].filter(Boolean).length > 0 && <><br />{[page.address, page.hours].filter(Boolean).join(' · ')}</>}</small></span></label>
          <label className={styles.choice}><input type="radio" name="delivery_choice" checked={fulfillment === 'antar'} onChange={() => setFulfillment('antar')} /><span><b>Dikirim ke Alamat</b><small>Masukkan alamat pengiriman</small></span></label>
          {fulfillment === 'antar' && <label className={styles.field}>Alamat lengkap<textarea name="ship_address" minLength={5} maxLength={300} required /></label>}
        </fieldset>
        <fieldset><legend>Metode Pembayaran</legend>{methods.map((method) =>
          <label className={styles.choice} key={method}><input type="radio" name="payment_choice" checked={payment === method} onChange={() => setPayment(method)} /><b>{paymentLabels[method]}</b></label>
        )}</fieldset>
      </>
      <fieldset><legend>Kontak Pemesan</legend>
        <label className={styles.field}>Nama<input name="name" autoComplete="name" minLength={2} maxLength={80} required /></label>
        <label className={styles.field}>Nomor WhatsApp<input name="phone" type="tel" autoComplete="tel" minLength={9} maxLength={30} required /></label>
        <label className={styles.field}>Catatan (opsional)<textarea name="note" maxLength={350} rows={2} /></label>
        <label className={styles.consent}><input name="consent" type="checkbox" required />Saya setuju dihubungi toko terkait pesanan ini.</label>
      </fieldset>
      {!lines.length && <p className={styles.empty}>Pilih barang di keranjang untuk melanjutkan.</p>}
      {error && <p role="alert" className={styles.error}>{error}</p>}
      <div className={styles.checkoutDock}>
        <div><small>Total Barang</small><strong>{rp(money(lines))}</strong></div>
        <button type="submit" className={styles.primary} disabled={!ready || !lines.length || busy}>{busy ? 'Mengirim…' : 'Buat Pesanan'}</button>
      </div>
    </form>
  </>;
}

function Orders({ orders, error, refresh, go, photos, quotes = false }) {
  const [filter, setFilter] = useState('Semua');
  const visible = orders?.filter((order) => filter === 'Semua' || orderStatus(order) === filter);
  return <>
    <Bar title={quotes ? "Penawaran Saya" : "Pesanan Saya"} back={() => go(quotes ? 'layanan' : 'beranda')} />
    <div className={styles.filters}>{orderFilters.map((status) => <button type="button" key={status} aria-pressed={filter === status} onClick={() => setFilter(status)}>{status}</button>)}</div>
    {error && <p role="alert" className={styles.error}>{error} <button type="button" onClick={refresh}>Coba lagi</button></p>}
    {!orders && !error && <p className={styles.empty}>Memuat pesanan…</p>}
    {visible?.length === 0 && <p className={styles.empty}>{filter === 'Semua' ? 'Belum ada pesanan dari browser ini.' : 'Tidak ada pesanan dengan status ini.'}</p>}
    <div className={styles.orderList}>{visible?.map((order) => {
      const status = orderStatus(order);
      return <button key={order.id} type="button" onClick={() => go('lacak', order.id)}>
        <span><b>#{order.number}</b>{order.unread > 0 && <small>{order.unread} pesan belum dibaca</small>}<small>{stamp(order.created_at)}</small>{order.total != null && <strong>{rp(order.total)}</strong>}
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

function Tracking({ order, orders, page, pay, contact, go, error, rate, respond, repeat, endpoint, photos }) {
  const [approvalError, setApprovalError] = useState('');
  const [responding, setResponding] = useState(false);
  const [negotiating, setNegotiating] = useState(false);
  const [track, setTrack] = useState(null);
  const orderId = order?.id;
  // tahap, kurir, resi & estimasi dari data penjual (cx_customer track); diperbarui bersama daftar pesanan
  useEffect(() => {
    if (!orderId) return;
    let alive = true;
    const load = () => fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'conversation', ref: orderId, operation: 'track' }) })
      .then((r) => (r.ok ? r.json() : null)).then((d) => { if (alive && d && !d.error) setTrack(d); }).catch(() => {});
    load();
    const timer = setInterval(() => { if (!document.hidden) load(); }, 15000);
    return () => { alive = false; clearInterval(timer); };
  }, [orderId, endpoint, order?.status, order?.deliveries?.length]);
  async function reply(message) {
    setApprovalError('');
    setResponding(true);
    try { await respond(order, message); setNegotiating(false); }
    catch (failure) { setApprovalError(failure.message); }
    finally { setResponding(false); }
  }
  if (!order) return <><Bar title="Detail Pesanan" back={() => go('pesanan')} /><p className={styles.empty}>{error || (orders ? 'Pesanan tidak ditemukan di browser ini.' : 'Memuat pesanan…')}</p></>;
  const pendingQuote = order.kind === 'penawaran' && order.status === 'penawaran';
  const status = orderStatus(order);
  const ratingItems = [...new Map(order.lines.filter((line) => line.rateable).map((line) => [line.product_id, line])).values()];
  const photoOf = (id) => { const ph = photos[id]?.[0]; return ph ? mediaUrl(ph.thumb || ph.path) : null; };
  return <>
    <Bar title={pendingQuote ? 'Detail Penawaran' : 'Detail Pesanan'} subtitle={`#${order.number}`} back={() => go(order.kind === 'penawaran' ? 'riwayat-penawaran' : 'pesanan')} />
    {pendingQuote && <section className={styles.info}>
      <h2>{order.quote_revision ? 'Penawaran siap ditinjau' : 'Permintaan diterima'}</h2>
      {order.quote_counter && !order.quote_revision && <p>Usulan Anda sudah diterima. Tunggu tanggapan bisnis.</p>}
    </section>}
    {track ? <TrackingView track={track} photoOf={photoOf} showLines={!pendingQuote} unread={order.unread || 0} onContact={() => go('chat', order.id)}
      contactLabel={pendingQuote ? 'Chat dengan Toko' : 'Hubungi Toko'} />
      : <p className={styles.empty}>{status === 'Batal' ? 'Pesanan dibatalkan.' : 'Memuat status pesanan…'}</p>}
    {contact && <a className={styles.waLink} href={waLink(page.wa_phone, `Halo ${page.name}, saya ingin menanyakan ${pendingQuote ? 'permintaan penawaran' : 'pesanan'} ${order.number}.`)} target="_blank" rel="noreferrer">atau hubungi lewat WhatsApp</a>}
    <section className={styles.orderContents}><h2>{pendingQuote ? 'Ringkasan Penawaran' : 'Pembayaran & Lainnya'}</h2>
      {pendingQuote && order.lines.map((line, index) => <div key={index}><span>{line.name}<small>{line.qty} {line.unit}</small></span>{line.total != null && <b>{rp(line.total)}</b>}</div>)}
      {pendingQuote && order.total != null && <div><strong>{pendingQuote && !order.quote_revision ? 'Perkiraan' : 'Total Barang'}</strong><strong>{rp(order.total)}</strong></div>}
      {order.quote_manual && <p style={{ whiteSpace: 'pre-wrap' }}>{order.quote_manual}</p>}
      {order.quote_filename && <p>Lampiran: {order.quote_filename}</p>}
      {order.quote_message && <p style={{ whiteSpace: 'pre-wrap' }}>{order.quote_message}</p>}
      {pendingQuote && order.quote_revision && order.valid_until && <p>Berlaku sampai {new Intl.DateTimeFormat('id-ID', { dateStyle: 'long', timeZone: 'Asia/Jakarta' }).format(new Date(order.valid_until + 'T12:00:00+07:00'))}</p>}
      {pendingQuote && order.quote_revision && <>
        <button type="button" className={styles.primary} disabled={responding} onClick={() => reply()}>{responding ? 'Menyimpan…' : 'Setujui penawaran & buat pesanan'}</button>
        <button type="button" onClick={() => setNegotiating(!negotiating)}>{negotiating ? 'Tutup negosiasi' : 'Ajukan negosiasi'}</button>
        {negotiating && <form onSubmit={(event) => { event.preventDefault(); reply(new FormData(event.currentTarget).get('message')); }}>
          <label className={styles.field}>Usulan Anda<textarea name="message" required minLength={3} maxLength={500} rows={3} /></label>
          <button type="submit" className={styles.primary} disabled={responding}>Kirim usulan</button>
        </form>}
      </>}
      {approvalError && <p role="alert" className={styles.error}>{approvalError}</p>}
      {order.kind === 'penawaran' && <button type="button" onClick={() => repeat(order)}>Minta penawaran lagi</button>}
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

export default function PublicShop({ page, shop, quoteCatalog, initialScreen, quoteOnly = false }) {
  const photos = page.media?.items || {};
  const items = useMemo(() => {
    if (quoteOnly) return quoteCatalog.map((item) => ({
      ...item,
      units: item.units.map((unit) => ({ ...unit, price: 0, available: true, breaks: [] })),
    }));
    const packages = new Set(quoteCatalog?.filter((item) => item.package).map((item) => item.id));
    return shop.items.map((item) => ({ ...item, package: item.package || packages.has(item.id) }));
  }, [quoteOnly, quoteCatalog, shop.items]);
  const products = useMemo(() => new Map(items.map((item) => [item.id, item])), [items]);
  const [screen, setScreen] = useState(initialScreen || ['beranda', null]);
  const [cart, setCart] = useState([]);
  const [favorites, setFavorites] = useState([]);
  const [initialized, setInitialized] = useState(false);
  const [quick, setQuick] = useState(null);
  const [excluded, setExcluded] = useState([]);
  const [orders, setOrders] = useState(null);
  const [unreadGeneral, setUnreadGeneral] = useState(0);
  const [networkError, setNetworkError] = useState('');
  const [notice, setNotice] = useState('');
  const pendingLoad = useRef(null);

  const storage = `prasara.shop.${page.slug}`;
  const endpoint = `/api/portal-shop?slug=${encodeURIComponent(page.slug)}`;
  const lines = cartLines(cart, products);
  const selected = (key) => !excluded.includes(key);
  const chosen = lines.filter((line) => selected(lineKey(line)));
  const canQuote = Array.isArray(quoteCatalog);
  const canCheckout = !quoteOnly && chosen.length > 0 && chosen.every((line) => line.u.available);
  const contact = page.wa_phone ? waLink(page.wa_phone, `Halo ${page.name}, saya lihat halaman toko Anda.`) : null;
  const [view, id] = screen;
  const product = products.get(id);
  const order = orders?.find((row) => row.id === id);

  function go(view, id = null) {
    const url = new URL(window.location.href);
    if (quoteOnly && view === 'beranda') { window.location.assign(url.pathname); return; }
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
      if (Array.isArray(saved?.excluded)) setExcluded(saved.excluded);
    } catch {}
    setInitialized(true);
    window.addEventListener('popstate', restore);
    return () => window.removeEventListener('popstate', restore);
  }, [storage]);
  useEffect(() => {
    if (!initialized) return;
    try { localStorage.setItem(storage, JSON.stringify({ cart, favorites, excluded })); } catch {}
  }, [storage, initialized, cart, favorites, excluded]);
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
      setUnreadGeneral(data.unread_general || 0);
      setNetworkError('');
    }).catch((error) => setNetworkError(error.message || 'Gagal memuat pesanan.')).finally(() => { pendingLoad.current = null; });
    return pendingLoad.current;
  }
  useEffect(() => {
    if (!['checkout', 'layanan', 'penawaran', 'permintaan', 'pesanan', 'riwayat-penawaran', 'lacak', 'chat', 'info'].includes(view)) return;
    refresh();
    if (view !== 'lacak' && view !== 'pesanan' && view !== 'riwayat-penawaran' && view !== 'info' && view !== 'layanan' && view !== 'penawaran') return;
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
  async function submit(payload, file) {
    if (pendingLoad.current) await pendingLoad.current;
    let body = JSON.stringify(payload);
    let headers = { 'Content-Type': 'application/json' };
    if (file) {
      body = new FormData();
      body.set('request', JSON.stringify(payload));
      body.set('attachment', file);
      headers = undefined;
    }
    const res = await fetch(endpoint, { method: 'POST', headers, body });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Permintaan gagal dikirim.');
    if (payload.kind !== 'penawaran') {
      const keys = new Set(payload.lines.map(lineKey));
      setCart((old) => old.filter((line) => !keys.has(lineKey(line))));
    }
    if (pendingLoad.current) await pendingLoad.current;
    await refresh();
    go('lacak', data.id);
  }
  async function respond(order, message) {
    const res = await fetch(endpoint, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: message === undefined ? 'approve-quote' : 'counter-quote', order: order.id, revision: order.quote_revision, message }),
    });
    const data = await res.json().catch(() => ({}));
    await refresh();
    if (!res.ok) throw new Error(data.error || 'Tanggapan gagal dikirim.');
    setNotice(message === undefined ? 'Penawaran disetujui dan pesanan dibuat.' : 'Usulan negosiasi dikirim.');
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
  async function shareStore() {
    const url = new URL(window.location.pathname, window.location.href).href;
    try {
      if (navigator.share) await navigator.share({ title: page.name, url });
      else { await navigator.clipboard.writeText(url); setNotice('Tautan toko disalin'); }
    } catch (error) {
      if (error.name !== 'AbortError') setNotice('Tautan toko tidak dapat dibagikan');
    }
  }
  function repeat(previous) {
    const available = (previous.lines || []).filter((line) => products.get(line.product_id)?.units.some((unit) => unit.name === line.unit));
    if (!available.length) { go('layanan'); return; }
    setCart((current) => available.reduce((next, line) => {
      const existing = next.find((entry) => lineKey(entry) === lineKey(line));
      return updateCart(next, line.product_id, line.unit, Math.max(Number(line.qty), existing?.qty || 0));
    }, current));
    setExcluded([]);
    go('keranjang');
  }
  let content;
  if (view === 'layanan' || view === 'penawaran') content = <StoreServices page={page} count={lines.length} unread={unreadGeneral} go={go} canQuote={canQuote} />;
  else if (view === 'permintaan') content = <>
    <Bar title={id === 'daftar' ? 'Daftar Kebutuhan' : id === 'cari' ? 'Cari Barang' : 'Ajukan Penawaran'} subtitle={page.name}
      back={() => go(id === 'daftar' || id === 'cari' ? 'layanan' : 'keranjang')} />
    {networkError && <p role="alert" className={styles.error}>{networkError} <button type="button" onClick={refresh}>Coba lagi</button></p>}
    {canQuote ? <QuoteRequest key={id || 'cart'} page={page} lines={id === 'daftar' || id === 'cari' ? [] : chosen} mode={id} go={go} submit={submit} ready={orders !== null} /> : <p className={styles.empty}>Toko belum menerima pengajuan penawaran dari portal.</p>}
    <PortalFooter />
  </>;
  else if (view === 'produk' && product) content = <ProductSelection key={product.id} product={product} photos={photos[product.id] || []}
    close={() => go('katalog')} add={add} quoteOnly={quoteOnly} favorite={favorites.includes(product.id)} toggleFavorite={() => favorite(product.id)} />;
  else if (view === 'keranjang') content = <Cart page={page} lines={lines} chosen={chosen} photos={photos} selected={selected} total={money(chosen)} canCheckout={canCheckout} canQuote={canQuote} quoteOnly={quoteOnly} go={go}
    toggle={(key) => setExcluded((old) => old.includes(key) ? old.filter((item) => item !== key) : [...old, key])}
    toggleAll={() => setExcluded(chosen.length === lines.length ? lines.map(lineKey) : [])}
    setQty={(...args) => setCart((old) => updateCart(old, ...args))} proceed={() => go('checkout')}
    clear={() => setCart((old) => old.filter((line) => !selected(lineKey(line))))} share={shareStore} />;
  else if (view === 'checkout' && !quoteOnly) content = <>
    <Checkout page={page} pay={shop.pay} lines={chosen} back={() => go('keranjang')} submit={submit} ready={orders !== null && canCheckout} />
    {networkError && <p role="alert" className={styles.error}>{networkError} <button type="button" onClick={refresh}>Coba lagi</button></p>}
  </>;
  else if (view === 'bayar') content = <>
    <Bar title="Cara Bayar" back={() => go('beranda')} />
    <div className={styles.info}>{shop.pay ? <PayBox pay={shop.pay} /> : <p className={styles.empty}>Hubungi bisnis untuk mengetahui cara pembayaran.</p>}</div>
  </>;
  else if (view === 'riwayat-penawaran') content = <Orders quotes orders={orders?.filter((row) => row.kind === 'penawaran')} photos={photos} error={networkError} refresh={refresh} go={go} />;
  else if (view === 'pesanan') content = <Orders orders={orders} photos={photos} error={networkError} refresh={refresh} go={go} />;
  else if (view === 'lacak') content = <Tracking order={order} orders={orders} page={page} pay={shop.pay} contact={contact} error={networkError} go={go} rate={rate} respond={respond} repeat={repeat} endpoint={endpoint} photos={photos} />;
  else if (view === 'chat') content = <>
    <CustomerChat key={id || 'umum'} endpoint={endpoint} refId={id || 'umum'} title={page.name} back={() => (id ? go('lacak', id) : go('layanan'))}
      whatsapp={page.wa_phone ? waLink(page.wa_phone, `Halo ${page.name}${order ? `, saya ingin menanyakan pesanan ${order.number}` : ''}.`) : null}
      onOpenReference={(ref) => go('lacak', ref.id)} onPay={shop.pay ? () => go('bayar') : undefined}
      onCard={(kind, p) => { if (kind === 'produk' && products.get(p.product_id)) go('produk', p.product_id); else if (kind === 'penawaran' || kind === 'pesanan') { refresh(); go('lacak', p.order_id); } }} />
  </>;
  else if (view === 'info') content = <>
    <Bar title="Info Toko" back={() => go('beranda')} />
    <section className={styles.info}><h2>{page.name}</h2>
      {[page.address, page.hours, page.about, page.policy].filter(Boolean).map((text, i) => <p key={i}><Linkify text={text} /></p>)}
      <button type="button" className={styles.contactOrder} onClick={() => go('chat')}><Icon name="/crm" />Chat dengan Toko{unreadGeneral > 0 && <span className={styles.unreadBadge}>{unreadGeneral}</span>}</button>
      {contact && <a className={styles.waLink} href={contact} target="_blank" rel="noreferrer">atau hubungi lewat WhatsApp</a>}
      {page.links?.filter((link) => /^https?:\/\//i.test(link.url)).map((link) => <p key={link.url}><a href={link.url} target="_blank" rel="noreferrer">{link.label}</a></p>)}
      <button type="button" onClick={() => go('favorit')}><Icon name="heart" />Produk Favorit</button>
      <button type="button" onClick={() => go('layanan')}><Icon name="/tagihan" />Layanan Toko</button>
      <a href="/panduan">Panduan PRASARA</a>
    </section>
    <PublicGallery items={page.media?.gallery} title="Galeri Toko" />
  </>;
  else content = <Catalog key={view === 'favorit' ? 'favorit' : id || 'catalog'} page={page} items={items} photos={photos} go={go} contact={contact} favorites={favorites} toggleFavorite={favorite}
    count={lines.length} current={['katalog', 'favorit'].includes(view) ? 'katalog' : 'beranda'} openQuick={setQuick} initialMode={view === 'favorit' ? 'favorit' : view === 'katalog' && id === 'grosir' ? 'promo' : view === 'katalog' && id === 'paket' ? 'paket' : ''} quoteOnly={quoteOnly} focusSearch={view === 'katalog' && id === 'cari'} />;
  return <main className={styles.portal} data-screen={view} data-no-field-help>
    {content}
    {quick && <ProductSelection key={quick.id} quick quoteOnly={quoteOnly} product={quick} photos={photos[quick.id] || []} close={() => setQuick(null)} add={add} />}
    {notice && <div className={styles.notice} role="status"><span>{notice}</span>{notice.endsWith('ke keranjang') && <button type="button" onClick={() => { setNotice(''); go('keranjang'); }}>Lihat</button>}</div>}
  </main>;
}
