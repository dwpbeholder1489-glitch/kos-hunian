'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import ListThumb from '@/components/media/ListThumb';
import { Sheet } from '@/components/ui';
import { matchProductPhoto, normalizePackagingText } from '@/lib/product-photo-match.mjs';
import { readProductPhotoText } from '@/lib/product-photo-ocr';
import { playScanSuccess, prepareScanSound } from '@/lib/scan-sound';
import { angka, rp } from '@/lib/format';
import styles from './product-photo-scan.module.css';

export default function ProductPhotoButton({ products, onPick, unitsFor, thumbs = {}, className = 'sm', purpose = 'stock' }) {
  const [open, setOpen] = useState(false);
  return <>
    <button type="button" className={className} onClick={() => { prepareScanSound(); setOpen(true); }}>Pindai foto</button>
    {open && <ProductPhotoSheet products={products} thumbs={thumbs} unitsFor={unitsFor} purpose={purpose}
      onPick={onPick} onClose={() => setOpen(false)} />}
  </>;
}

function ProductPhotoSheet({ products, thumbs, unitsFor, purpose, onPick, onClose }) {
  const request = useRef(null);
  const accepted = useRef(false);
  const [photo, setPhoto] = useState(null);
  const [text, setText] = useState('');
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const [selectedId, setSelectedId] = useState('');
  const [unitName, setUnitName] = useState('');
  const [finished, setFinished] = useState(false);

  useEffect(() => () => request.current?.abort(), []);
  useEffect(() => () => { if (photo) URL.revokeObjectURL(photo); }, [photo]);

  const candidates = useMemo(() => matchProductPhoto(text, products), [text, products]);
  const term = normalizePackagingText(query);
  const manualMatches = term ? products.filter((product) =>
    normalizePackagingText([product.name, product.brand, product.sku, ...(product.packaging_aliases || [])].filter(Boolean).join(' ')).includes(term),
  ).slice(0, 12) : null;
  const choices = manualMatches ? manualMatches.map((product) => ({ product, matched: [] })) : candidates;
  const selected = products.find((product) => product.id === selectedId);
  const units = selected && unitsFor ? unitsFor(selected) : [];
  const unit = units.find((option) => option.name === unitName);

  async function scan(event) {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = '';
    if (!file) return;
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    setPhoto(URL.createObjectURL(file));
    setText('');
    setQuery('');
    setSelectedId('');
    setUnitName('');
    setFinished(false);
    setError('');
    setStatus('Menyiapkan pembaca foto…');
    try {
      const result = await readProductPhotoText(file, {
        signal: controller.signal,
        onProgress: (progress) => { if (!controller.signal.aborted) setStatus(progress); },
      });
      if (!controller.signal.aborted) setText(result);
    } catch {
      if (!controller.signal.aborted) setError('Foto belum bisa dibaca. Coba foto bagian depan yang lebih tajam, atau cari barang dengan nama.');
    } finally {
      if (!controller.signal.aborted) { setStatus(''); setFinished(true); }
    }
  }

  function select(product) {
    setSelectedId(product.id);
    const options = unitsFor?.(product) || [];
    setUnitName(options.length === 1 ? options[0].name : '');
  }

  function confirm() {
    if (!selected || (unitsFor && !unit) || accepted.current) return;
    accepted.current = true;
    prepareScanSound();
    try {
      if (onPick(selected, unit) === false) { accepted.current = false; return; }
      if (candidates.some(({ product }) => product.id === selected.id)) playScanSuccess();
      onClose();
    } catch {
      accepted.current = false;
      setError('Barang belum berhasil dipilih. Coba lagi.');
    }
  }

  return <Sheet title="Pindai foto produk" onClose={onClose}>
    <p className="small muted" style={{ margin: 0 }}>Foto bagian depan kemasan. Pastikan merek, varian, dan ukuran terbaca.</p>
    <div className="row">
      <label className={styles.file}>Ambil foto<input type="file" accept="image/*" capture="environment" onChange={scan} /></label>
      <label className={styles.file}>Pilih foto<input type="file" accept="image/*" onChange={scan} /></label>
    </div>
    {photo && <img className={styles.preview} src={photo} alt="Foto kemasan yang dipindai" />}
    {status && <p className="small muted" role="status" style={{ margin: 0 }}>{status}</p>}
    {error && <div className="notice bad" role="alert">{error}</div>}
    {finished && !status && !error && !candidates.length && <div className="notice" role="status">Belum ada kecocokan di katalog. Coba foto lain atau cari nama barang.</div>}
    <label className="f">Cari barang di katalog
      <input value={query} onChange={(event) => { setQuery(event.target.value); setSelectedId(''); setUnitName(''); }} placeholder="Nama, merek, atau kode barang" />
    </label>
    {!!choices.length && <div className="list" role="group" aria-label={manualMatches ? 'Hasil pencarian katalog' : 'Kemungkinan barang dari foto'}>
      {choices.map(({ product, matched }) => <button type="button" key={product.id} className={`li ${styles.choice}`}
        aria-pressed={product.id === selectedId} onClick={() => select(product)}>
        {thumbs[product.id] && <ListThumb path={thumbs[product.id]} size={40} />}
        <span className="main"><b>{product.name}</b>
          <span className="small muted">{[product.brand, product.sku, product.base_unit].filter(Boolean).join(' · ')}</span>
          {!!matched.length && <span className="small muted">Terbaca {matched.join(', ')}</span>}
        </span>
      </button>)}
    </div>}
    {manualMatches && !choices.length && <span className="small muted">Barang tidak ditemukan.</span>}
    {selected && unitsFor && <label className="f">Satuan {selected.name}
      <select value={unitName} onChange={(event) => setUnitName(event.target.value)}>
        <option value="">Pilih satuan</option>
        {units.map((option) => <option key={option.name} value={option.name}>{option.name}
          {Number(option.qty) > 1 ? ` · isi ${angka(option.qty)} ${selected.base_unit}` : ''}
          {option.displayPrice > 0 ? ` · ${rp(option.displayPrice)}` : ''}</option>)}
      </select>
    </label>}
    {selected && <button type="button" className="primary" disabled={Boolean(unitsFor && !unit)} onClick={confirm}>
      {purpose === 'cart' ? 'Tambah ke keranjang' : 'Buka barang'}
    </button>}
  </Sheet>;
}
