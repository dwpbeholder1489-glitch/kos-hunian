'use client';

import { useEffect, useRef, useState } from 'react';
import { mediaUrl } from '@/lib/media';
import { logoUrl } from '@/lib/logo';
import { uid } from '@/lib/retail';
import { lineKey, updateCart } from '@/lib/commerce.mjs';
import s from './quote.module.css';

const paths = {
  cart: 'M2 3h3l2 13h13l2-10H6m3 14h.01m9 0h.01',
  search: 'm16 16 5 5m-3-11a8 8 0 1 1-16 0 8 8 0 0 1 16 0',
  menu: 'M4 6h16M4 12h16M4 18h16',
  basket: 'M2 9h20M4 9l2 12h12l2-12M7 9l4-7m6 7-4-7M9 13v4m6-4v4',
  upload: 'M7 18H5a4 4 0 0 1-1-8 7 7 0 0 1 13-2 5 5 0 0 1 1 10h-2m-4 3V11m-4 4 4-4 4 4',
  pen: 'M3 21l1-6L16 3a3 3 0 0 1 5 5L9 20z',
  box: 'm12 2 10 5v10l-10 5-10-5V7zm0 10 10-5m-10 5L2 7m10 5v10',
  history: 'M3 11a9 9 0 1 1 2 7M3 4v7h7m2-4v6l4 2',
  quote: 'M3 3h18v14H9l-6 4zM9 8l-2 4h3m5-4-2 4h3',
  back: 'm15 5-7 7 7 7', next: 'm9 5 7 7-7 7', down: 'm6 9 6 6 6-6',
  store: 'M3 10l2-7h14l2 7v2a3 3 0 0 1-6 0 3 3 0 0 1-6 0 3 3 0 0 1-6 0zm2 5v6h14v-6M9 10l1-7m4 0 1 7',
  home: 'm2 11 10-9 10 9M5 9v12h5v-7h4v7h5V9',
  brief: 'M3 6h18v15H3zm5 0V3h8v3M3 12h18m-9 0v3',
  paper: 'M5 2h9l5 5v15H5zm9 0v6h5M8 12h8m-8 4h8',
  user: 'M3 21a9 7 0 0 1 18 0M16 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0',
  wa: 'M3 21l1-5a9 9 0 1 1 4 4zm6-13c-2 3 3 8 6 7l1-2-3-1-1 1-2-2 1-1-1-3z',
  save: 'M5 3h14v18l-7-4-7 4z', trash: 'M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15m-9 4v7m4-7v7',
  check: 'm5 12 4 4 10-10', close: 'm6 6 12 12M18 6 6 18',
};
export function QuoteIcon({ name, size = 24 }) {
  return <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d={paths[name]} /></svg>;
}

const actions = [
  ['catalog', 'basket', 'Pilih Barang'],
  ['upload', 'upload', 'Upload Daftar'],
  ['manual', 'pen', 'Ketik Manual'],
  ['packages', 'box', 'Paket Usaha'],
];
const purposes = [['Warung / Toko', 'store'], ['Rumah Tangga', 'home'], ['Usaha Lainnya', 'brief']];
const qtyNumber = (value) => Number(String(value).replace(',', '.'));
const validQty = (value) => /^\d+([.,]\d{1,3})?$/.test(String(value)) && qtyNumber(value) >= 0.001 && qtyNumber(value) <= 1000000;
const fileTypes = '.pdf,.xlsx,.xls,.csv,.jpg,.jpeg,.png,.webp';

function ProductThumb({ page, id }) {
  const photo = page.media?.items?.[id]?.[0];
  const url = mediaUrl(photo?.thumb || photo?.path);
  return <span className={s.thumb}>{url ? <img src={url} alt="" loading="lazy" /> : <QuoteIcon name="box" size={19} />}</span>;
}

export default function QuoteRequest({ page, products, cart, go, submit, ready, repeat }) {
  const [lines, setLines] = useState(() => (repeat?.lines || []).filter((line) =>
    products.some((product) => product.id === line.product_id && product.units.some((option) => option.name === line.unit))
  ).map(({ product_id, unit, qty }) => ({ product_id, unit, qty })));
  const [manual, setManual] = useState(repeat?.quote_manual || '');
  const [phone, setPhone] = useState('');
  const [file, setFile] = useState(null);
  const [purpose, setPurpose] = useState(purposes[0][0]);
  const [routine, setRoutine] = useState(false);
  const [saved, setSaved] = useState(null);
  const [detail, setDetail] = useState(false);
  const [sheet, setSheet] = useState(null);
  const [query, setQuery] = useState('');
  const [resultCount, setResultCount] = useState(30);
  const [editing, setEditing] = useState(null);
  const [unit, setUnit] = useState('');
  const [qty, setQty] = useState('1');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [importNotice, setImportNotice] = useState('');
  const dialogRef = useRef(null);
  const titleRef = useRef(null);
  const retry = useRef(null);
  const storageKey = `prasara.quote.routine.${page.slug}`;
  const byId = new Map(products.map((product) => [product.id, product]));
  const matches = products.filter((product) => (sheet !== 'packages' || product.package) &&
    [product.name, product.sku, product.category, product.packaging, ...product.units.map((option) => option.name)]
      .some((value) => String(value || '').toLowerCase().includes(query.trim().toLowerCase())));

  useEffect(() => {
    try { setSaved(JSON.parse(localStorage.getItem(storageKey) || 'null')); } catch {}
  }, [storageKey]);
  useEffect(() => {
    if (!sheet) return;
    const dialog = dialogRef.current;
    dialog.showModal();
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { dialog.close(); document.body.style.overflow = overflow; };
  }, [sheet]);

  function open(mode) {
    setEditing(null);
    setQuery('');
    setResultCount(30);
    setImportNotice('');
    setSheet(mode);
  }
  function select(product, line = null) {
    setEditing({ product, line });
    setUnit(line?.unit || product.units[0].name);
    setQty(String(line?.qty || 1));
  }
  function changeStep(next) {
    setError('');
    setDetail(next);
    window.scrollTo(0, 0);
    requestAnimationFrame(() => titleRef.current?.focus());
  }
  function addSelection() {
    const { product, line } = editing;
    setLines((current) => {
      const previous = line ? current.filter((item) => lineKey(item) !== lineKey(line)) : current;
      const existing = previous.find((item) => item.product_id === product.id && item.unit === unit);
      if (line && !existing && line.unit === unit) return updateCart(current, product.id, unit, qtyNumber(qty));
      return updateCart(previous, product.id, unit, (existing?.qty || 0) + qtyNumber(qty));
    });
    setSheet(null);
  }
  function importLines(source) {
    const available = source.filter((line) => byId.get(line.product_id)?.units.some((option) => option.name === line.unit) && validQty(line.qty));
    setLines((current) => available.reduce((result, line) => {
      const existing = result.find((item) => lineKey(item) === lineKey(line));
      return updateCart(result, line.product_id, line.unit, Math.max(existing?.qty || 0, line.qty));
    }, current));
    setImportNotice(available.length ? `${available.length} pilihan ditambahkan ke daftar.` : 'Tidak ada barang yang dapat diimpor.');
  }
  async function send(event) {
    event.preventDefault();
    if (busy || !ready) return;
    if (lines.length > 100) { setError('Maksimal 100 pilihan barang untuk satu permintaan.'); return; }
    const fields = Object.fromEntries(new FormData(event.currentTarget));
    if (fields.phone.replace(/\D/g, '').length < 9 || fields.phone.replace(/\D/g, '').length > 15) {
      setError('Isi nomor WhatsApp yang valid.');
      return;
    }
    const payload = { kind: 'penawaran', name: fields.name, phone: fields.phone, consent: fields.consent === 'on',
      note: fields.note, purpose, manual: manual.trim(), lines };
    const signature = JSON.stringify(payload);
    if (retry.current?.signature !== signature || retry.current.file !== file) retry.current = { signature, file, id: uid() };
    setBusy(true);
    setError('');
    try {
      await submit({ ...payload, id: retry.current.id }, file);
      try {
        if (routine) localStorage.setItem(storageKey, JSON.stringify({ lines, manual }));
      } catch {}
    } catch (failure) {
      setError(failure.message || 'Gagal mengirim permintaan. Coba lagi.');
    } finally {
      setBusy(false);
    }
  }

  return <div className={s.quote}>
    <header className={s.header}>
      {detail ? <>
        <button type="button" className={s.back} aria-label="Kembali ke daftar barang" onClick={() => changeStep(false)}><QuoteIcon name="back" /></button>
        <h1 tabIndex={-1} ref={titleRef}>Detail Permintaan</h1>
      </> : <>
        <div className={s.identity}><span className={s.logo}>{logoUrl(page.logo) ? <img src={logoUrl(page.logo)} alt="" /> : <QuoteIcon name="cart" />}</span>
          <div><strong>{page.name}</strong>{page.tagline && <small>{page.tagline}</small>}</div>
        </div>
        <button type="button" aria-label="Cari barang" onClick={() => open('catalog')}><QuoteIcon name="search" /></button>
        {cart && <button type="button" aria-label="Impor keranjang" onClick={() => open('cart')}><QuoteIcon name="cart" /></button>}
        <button type="button" aria-label="Menu permintaan" onClick={() => open('menu')}><QuoteIcon name="menu" /></button>
      </>}
    </header>
    <div className={s.body} hidden={detail}>
      <section className={s.hero}>
        <h1 tabIndex={-1} ref={detail ? undefined : titleRef}><QuoteIcon name="quote" /> Minta Penawaran</h1>
        <p>Ajukan kebutuhan barang dalam satu formulir. Kami akan kirimkan penawaran terbaik melalui WhatsApp.</p>
        <div className={s.art} aria-hidden="true"><div className={s.board}><i /><span>✓</span><span>✓</span><span>✓</span></div><div className={s.boxSmall} /><div className={s.boxLarge} /></div>
      </section>
      <div className={s.actions}>{actions.map(([mode, icon, label]) =>
        <button type="button" key={mode} onClick={() => open(mode)}><QuoteIcon name={icon} size={31} /><span>{mode === 'catalog' ? label : <>{label.split(' ')[0]}<br />{label.split(' ')[1]}</>}</span></button>
      )}</div>
      <section className={s.lines}>
        <div className={s.lineHeading}><h2>Daftar Barang</h2><button type="button" onClick={() => open('catalog')}>Tambah Cepat <b>+</b></button></div>
        {!lines.length && <p className={s.empty}>Pilih barang dari katalog atau tambahkan daftar kebutuhan.</p>}
        {lines.map((line) => {
          const product = byId.get(line.product_id);
          if (!product) return null;
          const adjust = (value) => setLines((current) => updateCart(current, product.id, line.unit, value));
          return <div className={s.line} key={lineKey(line)}>
            <button type="button" className={s.product} onClick={() => { open('catalog'); select(product, line); }}>
              <ProductThumb page={page} id={product.id} />
              <span>{product.name}<small>{line.unit}</small></span>
            </button>
            <div className={s.stepper}>
              <button type="button" aria-label={`Kurangi jumlah ${product.name}`} disabled={line.qty <= 1} onClick={() => adjust(line.qty - 1)}>−</button>
              <button type="button" aria-label={`Ubah jumlah ${product.name}`} onClick={() => { open('catalog'); select(product, line); }}>{line.qty}</button>
              <button type="button" aria-label={`Tambah jumlah ${product.name}`} onClick={() => adjust(line.qty + 1)}>+</button>
            </div>
            <button type="button" className={s.remove} aria-label={`Hapus ${product.name}`} onClick={() => adjust(0)}><QuoteIcon name="trash" size={17} /></button>
          </div>;
        })}
        {manual.trim() && <button type="button" className={s.extra} onClick={() => open('manual')}><QuoteIcon name="pen" size={18} />{manual.trim()}</button>}
        {file && <button type="button" className={s.extra} onClick={() => open('upload')}><QuoteIcon name="paper" size={18} />{file.name}</button>}
      </section>
      <div className={s.total}><QuoteIcon name="down" size={17} />Total {lines.length} barang</div>
      <button type="button" className={s.cta} onClick={() => changeStep(true)}>
        <span><b>Lanjutkan</b><small>Isi detail &amp; kirim permintaan</small></span><QuoteIcon name="next" />
      </button>
    </div>
    <form className={s.body} hidden={!detail} onSubmit={send}>
      <section className={s.card}>
        <h2><QuoteIcon name="store" />Tujuan / Kebutuhan</h2>
        <div className={s.purposes}>{purposes.map(([label, icon]) =>
          <button type="button" aria-pressed={purpose === label} key={label} onClick={() => setPurpose(label)}>
            {purpose === label && <span className={s.tick}><QuoteIcon name="check" size={12} /></span>}
            <QuoteIcon name={icon} /><span>{label}</span>
          </button>
        )}</div>
      </section>
      <section className={s.card}>
        <h2><QuoteIcon name="paper" />Detail Permintaan</h2>
        <textarea aria-label="Detail permintaan" name="note" rows={3} maxLength={350} placeholder="Contoh: Mohon penawaran untuk stok mingguan, bisa diantar ke Desa X." required={!lines.length && !manual.trim() && !file} />
        <label className={s.field}>Nama<span><QuoteIcon name="user" /><input name="name" autoComplete="name" required minLength={2} maxLength={80} placeholder="Nama lengkap" /></span></label>
        <label className={s.field}>No. WhatsApp<span><QuoteIcon name="wa" /><input name="phone" type="tel" autoComplete="tel" required maxLength={30} placeholder="08xxxxxxxxxx" value={phone} onChange={(event) => setPhone(event.target.value)} />{ /^\d{9,15}$/.test(phone.replace(/\D/g, '')) && <i className={s.phoneTick}><QuoteIcon name="check" size={12} /></i> }</span></label>
      </section>
      <label className={`${s.card} ${s.routine}`}>
        <QuoteIcon name="save" /><span><b>Simpan sebagai daftar belanja rutin</b><small>Agar lebih cepat saat minta penawaran lagi.</small></span>
        <input type="checkbox" role="switch" checked={routine} onChange={(event) => setRoutine(event.target.checked)} />
      </label>
      <label className={s.consent}><input type="checkbox" name="consent" required />
        <span>Saya setuju nama dan No. WhatsApp ini disimpan {page.name} untuk menghubungi saya tentang permintaan ini.</span>
      </label>
      {error && <p className={s.error} role="alert">{error}</p>}
      <button type="submit" className={`${s.cta} ${s.send}`} disabled={busy || !ready}>
        <QuoteIcon name="wa" size={36} /><span><b>{busy ? 'Mengirim…' : page.wa_phone ? 'Kirim Permintaan via WhatsApp' : 'Kirim Permintaan'}</b><small>Kami akan segera menghubungi Anda.</small></span>
      </button>
    </form>
    {sheet && <dialog ref={dialogRef} className={s.dialog} aria-labelledby="quote-sheet-title"
      onCancel={(event) => { event.preventDefault(); setSheet(null); }} onClick={(event) => { if (event.target === event.currentTarget) setSheet(null); }}>
      <div className={s.sheet}>
        <header><h2 id="quote-sheet-title">{editing?.product.name || actions.find(([mode]) => mode === sheet)?.[2] || (sheet === 'cart' ? 'Impor Keranjang' : 'Menu Permintaan')}</h2>
          <button type="button" aria-label="Tutup" onClick={() => setSheet(null)}><QuoteIcon name="close" /></button></header>
        {editing ? <>
          <label className={s.simpleField}>Satuan<select value={unit} onChange={(event) => setUnit(event.target.value)}>{editing.product.units.map((option) => <option key={option.name}>{option.name}</option>)}</select></label>
          <label className={s.simpleField}>Kuantitas<input inputMode="decimal" value={qty} onChange={(event) => setQty(event.target.value)} /></label>
          <button type="button" className={s.cta} disabled={!validQty(qty)} onClick={addSelection}>{editing.line ? 'Simpan perubahan' : 'Tambahkan ke daftar'}</button>
        </> : (sheet === 'catalog' || sheet === 'packages') && <>
          <input type="search" aria-label="Cari barang" placeholder="Cari nama barang atau satuan" value={query} onChange={(event) => { setQuery(event.target.value); setResultCount(30); }} />
          <div className={s.results}>{matches.slice(0, resultCount).map((product) => <button type="button" key={product.id} onClick={() => select(product)}>
            <ProductThumb page={page} id={product.id} /><span>{product.name}</span><b>+</b>
          </button>)}</div>
          {!matches.length && <p className={s.empty}>{sheet === 'packages' ? 'Belum ada paket yang cocok.' : 'Barang tidak ditemukan.'}</p>}
          {matches.length > resultCount && <button type="button" onClick={() => setResultCount(resultCount + 30)}>Lihat lebih banyak</button>}
        </>}
        {sheet === 'upload' && <>
          <label className={s.simpleField}>Excel, CSV, foto, atau PDF (maks. 3 MB)<input type="file" accept={fileTypes} onChange={(event) => {
            const picked = event.target.files?.[0];
            if (!picked) return;
            if (picked.size > 3000000) { setImportNotice('Ukuran file melebihi 3 MB.'); return; }
            setFile(picked); setImportNotice('');
          }} /></label>
          {file && <button type="button" onClick={() => setFile(null)}>Hapus {file.name}</button>}
          <button type="button" className={s.cta} onClick={() => setSheet(null)}>Selesai</button>
        </>}
        {sheet === 'manual' && <>
          <textarea aria-label="Daftar kebutuhan" placeholder="Contoh: 3 dus air mineral, 5 kg gula" rows={5} maxLength={2000} value={manual} onChange={(event) => setManual(event.target.value)} />
          <button type="button" className={s.cta} onClick={() => setSheet(null)}>Simpan daftar</button>
        </>}
        {sheet === 'cart' && <>
          <button type="button" className={s.cta} disabled={!cart?.length} onClick={() => importLines(cart)}>Impor {cart?.length || 0} pilihan dari keranjang</button>
          <button type="button" onClick={() => go('keranjang')}>Buka keranjang</button>
        </>}
        {sheet === 'menu' && <>
          <button type="button" onClick={() => go('beranda')}>Beranda bisnis</button>
          <button type="button" onClick={() => go('riwayat-penawaran')}><QuoteIcon name="history" />Riwayat Permintaan</button>
          {saved && <button type="button" onClick={() => { importLines(saved.lines || []); if (saved.manual && !manual.trim()) setManual(saved.manual); setRoutine(true); setSheet(null); }}>Gunakan daftar belanja rutin</button>}
          {saved && <button type="button" onClick={() => { localStorage.removeItem(storageKey); setSaved(null); setRoutine(false); }}>Hapus daftar belanja rutin</button>}
        </>}
        {importNotice && <p role="status">{importNotice}</p>}
      </div>
    </dialog>}
  </div>;
}
