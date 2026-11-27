'use client';

import { useState } from 'react';
import { rp } from '@/lib/format';
import { calculateDemo, demoFixture } from '@/lib/learningDemo';
import styles from './LearningCenter.module.css';

export default function LearningPractice({ track, onDone, onBack, draft, onDraft, taxRate = 0 }) {
  const fixture = demoFixture(track.id);
  const [mode, setMode] = useState(draft?.mode || 'guided');
  const [person, setPerson] = useState(draft?.person || 0);
  const [quantities, setQuantities] = useState(draft?.quantities || fixture.items.map(() => 0));
  const [discount, setDiscount] = useState(draft?.discount || '');
  const [method, setMethod] = useState(draft?.method || 'tunai');
  const [tendered, setTendered] = useState(draft?.tendered || '');
  const [due, setDue] = useState(draft?.due || '');
  const [query, setQuery] = useState('');
  const [receipt, setReceipt] = useState(null);
  const [saved, setSaved] = useState(false);
  const [phase, setPhase] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [generation, setGeneration] = useState(0);
  const input = { category: track.id, person, quantities: fixture.billing ? fixture.items.map((_, i) => Number(i === person)) : quantities.map(Number), discount: Number(discount), method, tendered: method === 'tempo' ? 0 : Number(tendered), due, taxRate };
  const local = calculateDemo(input);
  const prices = fixture.wholesale && person === 1 ? fixture.wholesale : fixture.items.map(([, price]) => price);
  const subtotal = input.quantities.reduce((sum, qty, i) => sum + Math.round(qty * prices[i]), 0);
  const challenge = { person: 0, qty: fixture.billing ? 1 : 2, method: fixture.cashOnly ? 'tunai' : 'sebagian' };
  const target = Math.round(prices[0] * challenge.qty / 2);
  const remember = (patch) => onDraft({ mode, person, quantities, discount, method, tendered, due, ...patch });
  const change = (update, key) => (event) => { const value = event.target.value; update(value); remember({ [key]: value }); };
  function quantity(i, value) {
    const next = quantities.map((old, index) => index === i ? value : old);
    setQuantities(next);
    remember({ quantities: next });
  }

  async function review(event) {
    event.preventDefault();
    if (busy) return;
    setError('');
    if (local.error) return setError(local.error);
    if (mode === 'challenge' && (person !== challenge.person || input.quantities[0] !== challenge.qty || input.quantities.slice(1).some(Boolean) || input.discount || method !== challenge.method || input.tendered !== (fixture.cashOnly ? local.total : target))) {
      return setError('Periksa kembali pelanggan, item, dan pembayaran yang diminta dalam studi kasus.');
    }
    setBusy(true);
    try {
      const res = await fetch('/api/learning/demo', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input) });
      const result = await res.json();
      if (!res.ok || !result.demo) return setError(result.error || 'Pemeriksaan DEMO gagal.');
      setReceipt(result);
    } catch {
      setError('Pemeriksaan DEMO belum tersedia. Draf tetap dapat diedit. Coba lagi setelah tersambung.');
    } finally {
      setBusy(false);
    }
  }

  return <section className={styles.card}>
    <h2>{saved ? 'Bukti transaksi DEMO' : receipt ? 'Review transaksi DEMO' : 'Praktik transaksi'}</h2>
    <p className={styles.demo}><b>MODE DEMO</b> Bukan transaksi nyata</p>
    {!receipt && <form className="stack" onSubmit={review}>
      <label className="f">Mode latihan <select value={mode} onChange={change(setMode, 'mode')}><option value="guided">Terpandu</option><option value="independent">Mandiri</option><option value="challenge">Tantangan</option></select></label>
      {mode === 'guided' && <p>Pilih pelanggan dan item, lalu masukkan pembayaran untuk memeriksa ringkasan.</p>}
      {mode === 'challenge' && <p>Gunakan {fixture.people[0]}, {challenge.qty} × {fixture.items[0][0]} tanpa diskon. {fixture.cashOnly ? 'Bayar tunai dengan uang pas.' : `Catat pembayaran sebagian sejumlah ${rp(fixture.items[0][1] * challenge.qty / 2)}.`}</p>}
      <label className="f">{fixture.billing ? 'Penghuni dan unit' : 'Pelanggan'}<select value={person} onChange={(e) => { const value = Number(e.target.value); setPerson(value); remember({ person: value }); }}>
        {fixture.people.map((label, i) => <option key={label} value={i}>{label}</option>)}
      </select></label>
      {!fixture.billing && <label className="f">Cari item<input type="search" value={query} onChange={(e) => setQuery(e.target.value)} /></label>}
      {fixture.items.map(([label], i) => (fixture.billing ? i === person : label.toLowerCase().includes(query.trim().toLowerCase())) && <div className={styles.item} key={label}>
        <span><b>{label}</b><br />{rp(prices[i])}{fixture.stock && <small> · Stok DEMO {fixture.stock[i]}</small>}</span>
        {!fixture.billing && <><button type="button" className="ghost" aria-label={`Kurangi ${label}`} onClick={() => quantity(i, Math.max(0, Number(quantities[i]) - 1))}>−</button>
          <input type="number" min="0" max="99" step={fixture.fraction ? '.01' : '1'} aria-label={`Jumlah ${label}`} value={quantities[i]} onChange={(e) => quantity(i, e.target.value)} />
          <button type="button" className="ghost" aria-label={`Tambah ${label}`} onClick={() => quantity(i, Math.min(99, Number(quantities[i]) + 1))}>+</button>
          {Number(quantities[i]) > 0 && <button type="button" className="ghost" onClick={() => quantity(i, 0)}>Hapus</button>}</>}
      </div>)}
      {fixture.discount && <label className="f">Diskon DEMO, maksimum {fixture.discount}%<input type="number" min="0" step="1" value={discount} onChange={change(setDiscount, 'discount')} /></label>}
      <p>Subtotal {rp(subtotal)} · Total {rp(Math.max(0, subtotal - Number(discount)))}. {taxRate > 0 ? ` Harga termasuk PPN ${taxRate}%.` : ' Skenario ini tanpa pajak.'}</p>
      <label className="f">Cara bayar<select value={method} onChange={change(setMethod, 'method')}><option value="tunai">Tunai</option><option value="transfer">Transfer</option>{!fixture.cashOnly && <><option value="sebagian">Sebagian</option><option value="tempo">Tempo</option></>}</select></label>
      {method === 'tempo' ? <label className="f">Jatuh tempo<input type="date" value={due} onChange={change(setDue, 'due')} required /></label> : <label className="f">Uang diserahkan<input type="number" min="0" step="1" value={tendered} onChange={change(setTendered, 'tendered')} required /></label>}
      {!local.error && <p>Sisa tagihan {rp(local.balance)} · Kembalian {rp(local.change)}</p>}
      <button className="primary" disabled={busy}>{busy ? 'Memeriksa…' : 'Review transaksi'}</button>
    </form>}
    {receipt && <>
      {saved && <p>Nomor DEMO-{generation}. Bukti latihan untuk sesi ini.</p>}
      <b>{receipt.person} · {receipt.status}</b>
      <ul>{receipt.lines.map((line) => <li key={line.name}>{line.quantity} × {line.name} × {rp(line.price)} = {rp(line.subtotal)}</li>)}</ul>
      <dl className={styles.receipt}>{Object.entries({ Subtotal: receipt.subtotal, Diskon: receipt.discount, ...(receipt.taxRate > 0 ? { 'PPN termasuk harga': receipt.tax } : {}), Total: receipt.total, 'Uang diserahkan': receipt.tendered, Penerimaan: receipt.received, 'Sisa tagihan': receipt.balance, Kembalian: receipt.change }).map(([key, value]) => <div key={key}><dt>{key}</dt><dd>{rp(value)}</dd></div>)}</dl>
      <p>Cara bayar {receipt.method}{receipt.due && ` · Jatuh tempo ${receipt.due}`}</p>
      {saved && fixture.workflow && <><p>Status pengerjaan DEMO · {fixture.workflow[phase]}</p>{phase + 1 < fixture.workflow.length && <button className="ghost" onClick={() => setPhase(phase + 1)}>Lanjut ke {fixture.workflow[phase + 1]}</button>}</>}
      <div className={styles.actions}>{saved ? <button className="ghost" onClick={() => {
        setSaved(false); setReceipt(null); setPhase(0); setQuantities(fixture.items.map(() => 0)); setDiscount(''); setTendered(''); onDraft(null);
      }}>Ulangi</button> : <>
        <button className="ghost" onClick={() => setReceipt(null)}>Kembali mengedit</button>
        <button className="primary" onClick={() => { setSaved(true); setGeneration(generation + 1); onDone(mode); }}>Simpan simulasi</button>
      </>}</div>
    </>}
    {error && <p className="notice bad" role="alert">{error}</p>}
    <button className="ghost" disabled={busy} onClick={onBack}>{saved ? 'Selesaikan latihan' : 'Kembali ke materi'}</button>
  </section>;
}
