'use client';

import Link from 'next/link';
import { useRef, useState } from 'react';
import { roleOf } from '@/lib/business';
import { calculateDemo, demoFixture } from '@/lib/learningDemo';
import { rp } from '@/lib/format';
import { useLearningStorage } from '@/lib/learningStorage';
import { useJourneySync } from '@/lib/learningSync';
import styles from './KasirDemo.module.css';

const fixture = demoFixture('retail');
const STEPS = ['Pilih barang', 'Bayar', 'Periksa transaksi', 'Bukti DEMO'];

export default function KasirDemo({ kos, userId, scope }) {
  const role = roleOf(kos);
  const [record, update, ready, storageError] = useLearningStorage(scope, 'track:retail:' + role);
  const syncError = useJourneySync({ kosId: kos.id, role, track: 'retail', ready, userId,
    disabled: Boolean(kos.closed_at), journey: record.journey, update });

  function complete() {
    const now = new Date().toISOString();
    update((current) => {
      const old = current.journey || {};
      const migrated = (current.done || []).filter((i) => [0, 1, 3].includes(i)).map((i) => i === 3 ? 5 : i);
      const done = [...new Set([...(old.done || migrated), 2, 3])];
      const next = Array.from({ length: 8 }, (_, i) => i).find((i) => !done.includes(i));
      return { journey: {
        ...old, started: old.started || now, touched: now, version: 2, category: kos.category_code || 'retail',
        role, current: next ?? 7, done, simulations: (old.simulations || 0) + 1, lastMode: 'guided',
        ...(next === undefined ? { completed: old.completed || now } : {}),
      } };
    });
  }

  return <section className={styles.workspace}>
    <header className={styles.header}>
      <div><h1>Kasir DEMO</h1><p className={styles.badge}>MODE DEMO · Barang, pembayaran, dan bukti latihan</p></div>
      <Link className="nt-btn" href="/kasir">Kembali ke Kasir asli</Link>
    </header>
    {ready && <Register onComplete={complete} />}
    {storageError ? <p className="notice bad" role="alert">Progres latihan belum bisa disimpan di perangkat ini.</p>
      : syncError && <p className="notice" role="status">Progres tersimpan di perangkat. Sinkronisasi belum tersedia.</p>}
  </section>;
}

function Register({ onComplete }) {
  const [step, setStep] = useState(0);
  const [quantities, setQuantities] = useState(() => fixture.items.map(() => 0));
  const [query, setQuery] = useState('');
  const [method, setMethod] = useState('tunai');
  const [amount, setAmount] = useState('');
  const [receipt, setReceipt] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const heading = useRef(null);
  const completed = useRef(false);
  const total = fixture.items.reduce((sum, [, price], i) => sum + price * quantities[i], 0);
  const input = { category: 'retail', person: 0, quantities, discount: 0, tendered: Number(amount), method };
  const preview = calculateDemo(input);
  const hints = [
    total ? 'Periksa jumlah di keranjang, lalu tekan Bayar DEMO.' : 'Tekan + Tambah pada barang contoh untuk mengisi keranjang.',
    'Pilih cara bayar dan masukkan nominal. Gunakan uang pas atau coba pembayaran sebagian.',
    'Periksa total dan pembayaran, lalu tekan Simpan transaksi DEMO.',
    'Latihan selesai. Anda dapat mengulang atau kembali ke materi.',
  ];

  function go(next) {
    setError('');
    setStep(next);
    requestAnimationFrame(() => heading.current?.focus());
  }

  function change(i, value) {
    setQuantities((current) => current.map((qty, index) => i === index ? Math.min(fixture.stock[i], Math.max(0, qty + value)) : qty));
  }

  async function review(event) {
    event.preventDefault();
    if (busy) return;
    if (preview.error) return setError(preview.error);
    setError('');
    setBusy(true);
    try {
      const res = await fetch('/api/learning/demo', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input),
      });
      const result = await res.json();
      if (!res.ok || !result.demo) return setError(result.error || 'Pemeriksaan DEMO gagal.');
      setReceipt(result);
      go(2);
    } catch {
      setError('Pemeriksaan DEMO gagal. Periksa koneksi lalu coba lagi.');
    } finally {
      setBusy(false);
    }
  }

  function save() {
    if (completed.current || !receipt?.demo) return;
    completed.current = true;
    onComplete();
    go(3);
  }

  function restart() {
    completed.current = false;
    setReceipt(null);
    setQuantities(fixture.items.map(() => 0));
    setQuery('');
    setAmount('');
    setMethod('tunai');
    go(0);
  }

  return <>
    <ol className={styles.steps} aria-label="Tahap latihan">
      {STEPS.map((label, i) => <li key={label} aria-current={i === step ? 'step' : undefined}>{i < step ? '✓' : i + 1} {label}</li>)}
    </ol>
    <h2 ref={heading} tabIndex={-1}>{STEPS[step]}</h2>
    <p className={styles.hint} aria-live="polite">{hints[step]}</p>

    {step === 0 && <div className={styles.register}>
      <div className="stack">
        <input type="search" aria-label="Cari barang DEMO" placeholder="Cari barang DEMO" value={query} onChange={(event) => setQuery(event.target.value)} />
        <div className="pos-grid">
          {fixture.items.map(([name, price], i) => name.toLowerCase().includes(query.trim().toLowerCase()) &&
            <article className="pos-prod" key={name}>
              <div className={styles.product}><strong>{name}</strong><span>{rp(price)}</span>
                <small>Stok DEMO {fixture.stock[i]}</small>
                <button className={total ? 'ghost' : 'primary'} type="button" aria-label={'Tambah ' + name} disabled={quantities[i] >= fixture.stock[i]} onClick={() => change(i, 1)}>+ Tambah</button>
              </div>
            </article>)}
        </div>
        {!fixture.items.some(([name]) => name.toLowerCase().includes(query.trim().toLowerCase())) && <p>Barang DEMO tidak ditemukan.</p>}
      </div>
      <aside className={'panel stack ' + (total ? styles.active : '')} aria-label="Keranjang DEMO">
        <h3>Keranjang DEMO</h3>
        {!total && <p>Belum ada barang.</p>}
        {fixture.items.map(([name, price], i) => quantities[i] > 0 &&
          <div className={styles.line} key={name}>
            <span>{quantities[i]} × {name} · {rp(quantities[i] * price)}</span>
            <button type="button" className="ghost" aria-label={'Kurangi ' + name} onClick={() => change(i, -1)}>−</button>
          </div>)}
        <div className="pos-total"><span>Total Bayar</span><b>{rp(total)}</b></div>
        <button className="pos-pay" type="button" disabled={!total} onClick={() => { setAmount(''); go(1); }}>Bayar DEMO</button>
      </aside>
    </div>}

    {step === 1 && <form className={'panel stack ' + styles.active} onSubmit={review}>
      <p><b>Total bayar {rp(total)}</b> · {fixture.people[0]}</p>
      <label className="f">Cara bayar<select value={method} onChange={(event) => { setMethod(event.target.value); setAmount(''); }}>
        <option value="tunai">Tunai</option><option value="transfer">Transfer</option><option value="sebagian">Dibayar sebagian</option>
      </select></label>
      <label className="f">Nominal diterima<input type="number" value={amount} min="1" step="1" inputMode="numeric" required onChange={(event) => setAmount(event.target.value)} /></label>
      <button type="button" className="ghost" onClick={() => setAmount(String(method === 'sebagian' ? Math.floor(total / 2) : total))}>
        {method === 'sebagian' ? 'Isi setengah dari total' : 'Isi uang pas'}
      </button>
      {!preview.error && <p aria-live="polite">Kembalian {rp(preview.change)} · Sisa tagihan {rp(preview.balance)}</p>}
      <button type="submit" className="primary" disabled={busy}>{busy ? 'Memeriksa…' : 'Periksa transaksi DEMO'}</button>
      <button type="button" className="ghost" disabled={busy} onClick={() => go(0)}>Ubah keranjang</button>
    </form>}

    {step >= 2 && receipt && <section className={'panel stack ' + styles.active}>
      <h3>{receipt.person}</h3>
      <p>{receipt.status} · {receipt.method === 'sebagian' ? 'Dibayar sebagian' : receipt.method === 'transfer' ? 'Transfer' : 'Tunai'}</p>
      {receipt.lines.map((line) => <div className={styles.line} key={line.name}><span>{line.quantity} × {line.name}</span><b>{rp(line.subtotal)}</b></div>)}
      <dl className={styles.summary}>{Object.entries({ Total: receipt.total, Pembayaran: receipt.received, Kembalian: receipt.change, 'Sisa tagihan': receipt.balance }).map(([label, value]) =>
        <div className={styles.line} key={label}><dt>{label}</dt><dd>{rp(value)}</dd></div>)}</dl>
      {step === 2 ? <>
        <button type="button" className="primary" onClick={save}>Simpan transaksi DEMO</button>
        <button type="button" className="ghost" onClick={() => go(1)}>Ubah pembayaran</button>
      </> : <div className={styles.line}>
        <Link href="/learning-center">Kembali ke materi</Link>
        <button type="button" className="ghost" onClick={restart}>Ulangi latihan</button>
      </div>}
    </section>}
    {error && <p className="notice bad" role="alert">{error}</p>}
  </>;
}
