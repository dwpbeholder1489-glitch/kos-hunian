'use client';

import { useRef, useState } from 'react';
import { uid } from '@/lib/retail';
import { lineKey } from '@/lib/commerce.mjs';
import styles from './shop.module.css';

const purposes = ['Warung / Toko', 'Rumah Tangga', 'Usaha Lainnya'];
const fileTypes = '.pdf,.xlsx,.xls,.csv,.jpg,.jpeg,.png,.webp';
const quantities = new Intl.NumberFormat('id-ID', { maximumFractionDigits: 3 });

export default function QuoteRequest({ page, lines, mode, go, submit, ready }) {
  const [file, setFile] = useState(null);
  const [fileError, setFileError] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const retry = useRef(null);
  const upload = mode === 'daftar';
  const search = mode === 'cari';

  async function send(event) {
    event.preventDefault();
    if (busy || !ready || fileError) return;
    const fields = Object.fromEntries(new FormData(event.currentTarget));
    const manual = fields.manual?.trim() || '';
    if (!lines.length && !file && !manual) {
      setError('Tambahkan barang dari keranjang, lampirkan daftar, atau jelaskan kebutuhan Anda.');
      return;
    }
    if (lines.length > 100) {
      setError('Maksimal 100 pilihan satuan barang per pengajuan.');
      return;
    }
    if (!/^\d{9,15}$/.test(fields.phone.replace(/\D/g, ''))) {
      setError('Isi nomor WhatsApp yang valid.');
      return;
    }
    const payload = {
      kind: 'penawaran', name: fields.name, phone: fields.phone, consent: fields.consent === 'on',
      purpose: fields.purpose, note: fields.note, manual,
      lines: lines.map(({ product_id, unit, qty }) => ({ product_id, unit, qty })),
    };
    const signature = JSON.stringify(payload);
    if (retry.current?.signature !== signature || retry.current.file !== file) retry.current = { signature, file, id: uid() };
    setBusy(true);
    setError('');
    try {
      await submit({ ...payload, id: retry.current.id }, file);
    } catch (failure) {
      setError(failure.message || 'Gagal mengirim pengajuan. Coba lagi.');
    } finally {
      setBusy(false);
    }
  }

  return <form className={styles.requestForm} onSubmit={send}>
    {!upload && !search && <fieldset>
      <legend>Barang terpilih</legend>
      {lines.length ? <ul className={styles.requestLines}>{lines.map((line) =>
        <li key={lineKey(line)}><b>{line.pr.name}</b><span>{quantities.format(line.qty)} × {line.unit}</span></li>
      )}</ul> : <p>Pilih dulu barang yang ingin diajukan di keranjang.</p>}
      <button className={styles.textAction} type="button" onClick={() => go('keranjang')}>Buka keranjang</button>
    </fieldset>}
    {(upload || search) && <fieldset>
      <legend>{upload ? 'Daftar kebutuhan' : 'Barang di luar katalog'}</legend>
      {upload && <label className={styles.field}>Lampiran (opsional)
        <input type="file" accept={fileTypes} aria-describedby="quote-file-help" onChange={(event) => {
          const picked = event.target.files?.[0];
          const oversized = picked?.size > 3000000;
          if (oversized) event.target.value = '';
          setFile(oversized ? null : picked || null);
          setFileError(oversized ? 'Ukuran file melebihi 3 MB.' : '');
        }} />
        <small id="quote-file-help">Excel, CSV, PDF, JPG, PNG, atau WebP, maksimal 3 MB.</small>
      </label>}
      {fileError && <p role="alert" className={styles.requestError}>{fileError}</p>}
      <label className={styles.field}>{upload ? 'Keterangan daftar' : 'Barang yang dicari'}
        <textarea name="manual" rows={3} maxLength={2000} required={!file} aria-describedby="quote-manual-help" />
        <small id="quote-manual-help">{upload ? 'Jelaskan kebutuhan Anda jika tidak melampirkan daftar.' : 'Sebutkan nama, merek, atau ukuran yang dibutuhkan agar toko dapat memeriksanya.'}</small>
      </label>
    </fieldset>}
    <fieldset>
      <legend>Detail pemohon</legend>
      <label className={styles.field}>Keperluan<select name="purpose">{purposes.map((purpose) => <option key={purpose}>{purpose}</option>)}</select></label>
      <label className={styles.field}>Nama<input name="name" autoComplete="name" required minLength={2} maxLength={80} /></label>
      <label className={styles.field}>Nomor WhatsApp<input name="phone" type="tel" autoComplete="tel" required maxLength={30} aria-describedby="quote-phone-help" />
        <small id="quote-phone-help">Gunakan nomor aktif yang bisa dihubungi toko.</small>
      </label>
      <label className={styles.field}>Catatan (opsional)<textarea name="note" rows={2} maxLength={350} /></label>
    </fieldset>
    <label className={styles.consent}><input type="checkbox" name="consent" required />
      <span>Saya setuju {page.name} menyimpan kontak saya dan menghubungi saya terkait pengajuan ini.</span>
    </label>
    {error && <p className={styles.requestError} role="alert">{error}</p>}
    <button type="submit" className={styles.primary} disabled={busy || !ready || (!lines.length && !upload && !search)}>
      {busy ? 'Mengirim…' : 'Kirim Pengajuan'}
    </button>
    <small>Pantau status dan tanggapi penawaran melalui Penawaran Saya.</small>
  </form>;
}
