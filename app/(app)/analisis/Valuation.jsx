'use client';
// Valuasi multiple & berbasis aset (Tahap G Master Blueprint BI). Dasar = valuation_basis (jurnal), rumus lib/valuation.js,
// simpan = valuation_save (versi baru + salinan dasar). Kelipatan SELALU dari pemilik + sumbernya. Paket Bisnis & Pro, area finance.
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import FiturUpgrade from '@/components/FiturUpgrade';
import { Loading, toast } from '@/components/ui';
import { errMsg, rp, tgl, parseRp, angka } from '@/lib/format';
import { BASES, basisFigures, multipleValuation, assetValuation, summaryRange, validateMultiple } from '@/lib/valuation';
import styles from './analisis.module.css';

const num = (v) => (Number(v) < 0 ? '−' : '') + Math.abs(Math.round(Number(v) || 0)).toLocaleString('id-ID');
const EMPTY_M = { basis: 'laba_bersih', low: '', mid: '', high: '', source: '', source_date: '', note: '' };
const EMPTY_A = { inv_pct: 100, ar_pct: 100, market: {}, other_adj: '', note: '' };

export default function ValuationCard({ kosId, ver, owner }) {
  const [base, setBase] = useState(null);
  const [err, setErr] = useState(null);
  const [list, setList] = useState(null);
  const [open, setOpen] = useState(null);
  const [m, setM] = useState(EMPTY_M);
  const [a, setA] = useState(EMPTY_A);
  const [useM, setUseM] = useState(true);
  const [name, setName] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  const loadList = async () => { const { data, error } = await supabase.rpc('valuation_list', { p_kos: kosId }); if (!error) setList(data); };
  useEffect(() => {
    let on = true; setBase(null); setErr(null);
    supabase.rpc('valuation_basis', { p_kos: kosId }).then(({ data, error }) => {
      if (!on) return; if (error) return setErr(error);
      setBase(data); if (data?.aktif) loadList();
    });
    return () => { on = false; };
  }, [kosId, ver]); // eslint-disable-line react-hooks/exhaustive-deps

  const b = open?.basis || base;
  const mObj = useM && m.low !== '' && m.mid !== '' && m.high !== '' ? { ...m, low: Number(m.low), mid: Number(m.mid), high: Number(m.high) } : null;
  const aObj = { inv_pct: Number(a.inv_pct), ar_pct: Number(a.ar_pct), other_adj: parseRp(String(a.other_adj || '')) * (String(a.other_adj).trim().startsWith('-') ? -1 : 1),
    assets: Object.entries(a.market).filter(([, v]) => String(v).trim() !== '').map(([id, v]) => ({ id, market: parseRp(String(v)) })), note: a.note };
  const mv = useMemo(() => (b?.aktif !== false && b && mObj ? multipleValuation(b, mObj) : null), [b, mObj?.basis, mObj?.low, mObj?.mid, mObj?.high]); // eslint-disable-line react-hooks/exhaustive-deps
  const av = useMemo(() => (b && b.aktif !== false ? assetValuation(b, aObj) : null), [b, JSON.stringify(aObj)]); // eslint-disable-line react-hooks/exhaustive-deps

  if (err) return <p className="notice bad" role="alert">{/valuation_basis/.test(err.message || '') ? 'Database sedang diperbarui. Coba lagi beberapa menit lagi.' : errMsg(err)}</p>;
  if (!base) return <Loading rows={3} />;
  if (!base.aktif) return <FiturUpgrade kosId={kosId} owner={owner} event="REPORT.ADVANCED_REQUESTED" title="Valuasi multiple & aset tersedia mulai Paket Bisnis"
    text="Taksir nilai bisnis dari kelipatan laba/pendapatan (dengan sumber Anda) dan dari nilai aset di neraca, lalu simpan berversi." />;
  const f = basisFigures(b);
  const mErr = useM ? validateMultiple(mObj || { basis: m.basis }) : null;
  const range = summaryRange(mv && !mv.reason ? mv : null, av);

  const openVersion = async (id) => {
    const { data, error } = await supabase.rpc('valuation_get', { p_kos: kosId, p_id: id });
    if (error) return toast(errMsg(error));
    setOpen(data); setName(data.name); setNote('');
    const x = data.assumptions;
    setUseM(Boolean(x.multiple));
    setM(x.multiple ? { ...EMPTY_M, ...x.multiple, source_date: x.multiple.source_date || '', note: x.multiple.note || '' } : EMPTY_M);
    setA(x.aset ? { inv_pct: x.aset.inv_pct, ar_pct: x.aset.ar_pct, other_adj: x.aset.other_adj ? String(x.aset.other_adj) : '', note: x.aset.note || '',
      market: Object.fromEntries((x.aset.assets || []).map((y) => [y.id, angka(y.market)])) } : EMPTY_A);
  };
  const reset = () => { setOpen(null); setName(''); setNote(''); setM(EMPTY_M); setA(EMPTY_A); setUseM(true); };
  const save = async () => {
    if (busy || !name.trim() || (useM && mErr)) return;
    setBusy(true);
    const p = { aset: { ...aObj } }; if (useM) p.multiple = { ...mObj, source_date: m.source_date || null };
    const { data, error } = await supabase.rpc('valuation_save', { p_kos: kosId, p_group: open?.group_id || null, p_name: name.trim(), p_assumptions: p, p_note: note.trim() || null });
    setBusy(false);
    if (error) return toast(errMsg(error));
    toast(`Tersimpan sebagai versi ${data.version}`); await loadList(); await openVersion(data.id);
  };
  const archive = async (g, on) => { const { error } = await supabase.rpc('valuation_archive', { p_kos: kosId, p_group: g, p_archive: on }); if (error) return toast(errMsg(error)); if (on && open?.group_id === g) reset(); loadList(); };
  const setMv = (k) => (e) => setM({ ...m, [k]: e.target.value });

  return <>
    <section className={`${styles.card} ${styles.wide}`}>
      <div className={styles.cardH}><h2 className={styles.cardT}>Valuasi Multiple & Aset</h2>{open && <span className={styles.note}>Versi {open.version} · {open.name} · dasar per {tgl(open.basis.tanggal)}</span>}</div>
      <p className={styles.note}><b>ESTIMASI</b> — berdasarkan asumsi pemilik, bukan penilaian resmi (penilai publik/KJPP). Dasar: {f.months ? `${f.months} bulan penuh terakhir dari Pembukuan${f.annualized ? ' (disetahunkan × 12/' + f.months + ')' : ''}` : 'belum ada transaksi 12 bulan terakhir'}; neraca per {tgl(b.tanggal)}. Valuasi DCF ada di <Link href="/pembukuan?tab=valuation">Pembukuan › Valuasi</Link>.</p>
      {open && <p className="notice">Anda membuka versi tersimpan — angka memakai dasar saat versi itu dibuat. <button type="button" className="sm ghost" onClick={reset}>Mulai dari data terbaru</button></p>}
      <dl className={styles.kvs}>
        <div><dt>Pendapatan bersih setahun</dt><dd>{rp(f.pendapatan)}</dd></div>
        <div><dt>EBITDA setahun</dt><dd>{rp(f.ebitda)}</dd></div>
        <div><dt>Laba bersih setahun</dt><dd>{rp(f.laba_bersih)}</dd></div>
        <div><dt>Utang bersih<small>pinjaman {rp(f.debt)} − kas {rp(f.cash)}</small></dt><dd>{rp(f.netDebt)}</dd></div>
        <div><dt>Ekuitas di neraca (nilai buku)</dt><dd>{rp(f.equity)}</dd></div>
      </dl>
      {range && <p className={styles.note}>Rentang nilai ekuitas dari metode di bawah: <b>{rp(range.min)} – {rp(range.max)}</b>.</p>}
    </section>

    <section className={styles.card}>
      <div className={styles.cardH}><h2 className={styles.cardT}>1. Kelipatan (multiple)</h2>
        <label className={styles.vlCheck}><input type="checkbox" checked={useM} onChange={(e) => setUseM(e.target.checked)} /> Pakai</label></div>
      {useM && <>
        <label className={styles.scField}>Dasar<select value={m.basis} onChange={setMv('basis')}>{Object.entries(BASES).map(([k, x]) => <option key={k} value={k}>{x.label}</option>)}</select></label>
        <p className={styles.note}>{BASES[m.basis].hint}. Utang bersih dipakai untuk berpindah antara nilai usaha dan nilai ekuitas.</p>
        <div className={styles.vlTriple}>{[['low', 'Bawah'], ['mid', 'Tengah'], ['high', 'Atas']].map(([k, l]) => <label key={k} className={styles.scField}>{l} (×)<input type="number" inputMode="decimal" step="any" min="0" value={m[k]} onChange={setMv(k)} /></label>)}</div>
        <label className={styles.scField}>Sumber kelipatan (wajib)<input value={m.source} maxLength={300} onChange={setMv('source')} placeholder="mis. penawaran tertulis calon pembeli, konsultan, berita transaksi" /></label>
        <label className={styles.scField}>Tanggal sumber (opsional)<input type="date" value={m.source_date} onChange={setMv('source_date')} /></label>
        {mErr && (m.low !== '' || m.source) && <p className="notice bad">{mErr}</p>}
        {mv?.reason && <p className="notice">{mv.reason}</p>}
        {mv && !mv.reason && <div className={styles.scWrap}><table className={styles.stmt}><thead><tr><th>(Rp)</th><th>Bawah</th><th>Tengah</th><th>Atas</th></tr></thead>
          <tbody>
            <tr><th scope="row">Kelipatan</th>{['low', 'mid', 'high'].map((k) => <td key={k}>{mv[k].multiple}×</td>)}</tr>
            <tr><th scope="row">Nilai usaha (EV)</th>{['low', 'mid', 'high'].map((k) => <td key={k}>{num(mv[k].ev)}</td>)}</tr>
            <tr className={styles.sub}><th scope="row">Nilai ekuitas</th>{['low', 'mid', 'high'].map((k) => <td key={k} className={mv[k].equity < 0 ? styles.neg : undefined}>{num(mv[k].equity)}</td>)}</tr>
          </tbody></table></div>}
        {mv && !mv.reason && mv.low.ev < 0 && <p className={styles.note}>Nilai usaha negatif berarti kas yang menumpuk lebih besar dari nilai usahanya — nilai ekuitas (yang dimiliki pemilik) tetap memasukkan kas itu.</p>}
      </>}
    </section>

    <section className={styles.card}>
      <div className={styles.cardH}><h2 className={styles.cardT}>2. Berbasis aset</h2></div>
      <p className={styles.note}>Mulai dari neraca, lalu sesuaikan ke nilai yang realistis bila bisnis dijual hari ini.</p>
      <div className={styles.vlTriple}>
        <label className={styles.scField}>Persediaan bernilai (%)<input type="number" min="0" max="100" value={a.inv_pct} onChange={(e) => setA({ ...a, inv_pct: e.target.value })} /></label>
        <label className={styles.scField}>Piutang tertagih (%)<input type="number" min="0" max="100" value={a.ar_pct} onChange={(e) => setA({ ...a, ar_pct: e.target.value })} /></label>
        <label className={styles.scField}>Penyesuaian lain (Rp)<input inputMode="numeric" value={a.other_adj} onChange={(e) => setA({ ...a, other_adj: e.target.value })} placeholder="mis. -2.000.000" /></label>
      </div>
      {(b.aset_tetap || []).length > 0 && <details><summary className={styles.note}>Nilai pasar aset tetap ({b.aset_tetap.length})</summary>
        {b.aset_tetap.map((x) => <label key={x.id} className={styles.scField}>{x.name} · buku {rp(x.book)}<input inputMode="numeric" placeholder="kosong = nilai buku" value={a.market[x.id] || ''}
          onChange={(e) => setA({ ...a, market: { ...a.market, [x.id]: e.target.value } })} /></label>)}</details>}
      {av && <div className={styles.scWrap}><table className={styles.stmt}><thead><tr><th>(Rp)</th><th>Nilai buku</th><th>Disesuaikan</th></tr></thead>
        <tbody>{av.lines.map(([l, x, y]) => <tr key={l}><th scope="row">{l}</th><td>{num(x)}</td><td>{num(y)}</td></tr>)}
          <tr className={styles.sub}><th scope="row">Nilai ekuitas</th><td>{num(av.book)}</td><td className={av.adjusted < 0 ? styles.neg : undefined}>{num(av.adjusted)}</td></tr></tbody></table></div>}
    </section>

    <section className={styles.card}>
      <div className={styles.cardH}><h2 className={styles.cardT}>{open ? `Simpan versi baru · ${open.name}` : 'Simpan valuasi'}</h2></div>
      <p className={styles.note}>Setiap simpan = versi baru beserta salinan dasar hari ini (versi lama tidak bisa diubah).</p>
      <label className={styles.scField}>Nama<input value={name} maxLength={80} onChange={(e) => setName(e.target.value)} placeholder="mis. Tawaran calon pembeli 2027" /></label>
      <label className={styles.scField}>Catatan (opsional)<input value={note} maxLength={500} onChange={(e) => setNote(e.target.value)} /></label>
      <button type="button" className="primary" disabled={busy || !name.trim() || Boolean(useM && mErr)} onClick={save}>{busy ? 'Menyimpan…' : open ? 'Simpan sebagai versi baru' : 'Simpan'}</button>
      {open && <button type="button" className="sm ghost" onClick={reset}>Buat valuasi baru</button>}
    </section>

    <section className={styles.card}>
      <div className={styles.cardH}><h2 className={styles.cardT}>Valuasi tersimpan</h2></div>
      {!list ? <Loading rows={2} /> : !list.length ? <p className={styles.note}>Belum ada valuasi tersimpan.</p> :
        <ul className={styles.scList}>{list.map((g) => <li key={g.group_id}><div className={styles.scGroup}>
          <b>{g.name}{g.archived === 'true' && <span className={styles.kind}> arsip</span>}</b>
          {g.versions.map((v) => <button key={v.id} type="button" aria-pressed={open?.id === v.id} onClick={() => openVersion(v.id)}>Versi {v.version} · {tgl(String(v.at).slice(0, 10))}{v.by ? ` · ${v.by}` : ''}{v.note ? ` — ${v.note}` : ''}</button>)}
          <button type="button" className="sm ghost" onClick={() => archive(g.group_id, g.archived !== 'true')}>{g.archived === 'true' ? 'Pulihkan' : 'Arsipkan'}</button>
        </div></li>)}</ul>}
    </section>
  </>;
}
