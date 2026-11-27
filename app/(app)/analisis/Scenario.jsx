'use client';
// Skenario & stress test (Tahap E Master Blueprint BI). Titik awal = scenario_baseline (jurnal Pembukuan); proyeksi = rumus
// tertulis lib/scenario.js; simpan = scenario_save (versi baru, versi lama tidak bisa diubah; hasil versi lama dihitung ulang dari salinan
// titik awal yang tersimpan). Paket Bisnis & Pro (laporan_lanjutan), area finance — dicek di server.
import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';
import FiturUpgrade from '@/components/FiturUpgrade';
import { Loading, toast } from '@/components/ui';
import { BLN, addMonthsYm, bulan, errMsg, rp, tgl } from '@/lib/format';
import { KEYS, KEY_LABEL, baselineIssues, defaults, fieldsFor, occupancy, project, runStress, validate, monthlyBurn } from '@/lib/scenario';
import { C, TrendChart } from './Charts';
import styles from './analisis.module.css';

const STATUS = { aman: ['Aman', 'good'], waspada: ['Waspada', 'warn'], bahaya: ['Kas minus', 'bad'] };
const COLORS = { pesimis: C.red, dasar: C.main, optimis: C.amber };
const num = (v) => (Number(v) < 0 ? '−' : '') + Math.abs(Math.round(Number(v) || 0)).toLocaleString('id-ID');
const ratio = (v) => (v == null ? '—' : v.toLocaleString('id-ID', { maximumFractionDigits: 2 }) + '×');
const Badge = ({ s }) => <span className={`${styles.kind} ${styles[STATUS[s][1]]}`}>{STATUS[s][0]}</span>;

export default function ScenarioModule({ kosId, ver, owner }) {
  const [base, setBase] = useState(null);
  const [list, setList] = useState(null);
  const [err, setErr] = useState(null);
  const [open, setOpen] = useState(null); // versi yang sedang dibuka {id, group_id, version, name, baseline, assumptions, created_at, created_by, note}
  const [rows, setRows] = useState(null);
  const [name, setName] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [showArchived, setShowArchived] = useState(false);

  const loadList = async () => {
    const { data, error } = await supabase.rpc('scenario_list', { p_kos: kosId });
    if (!error) setList(data);
  };
  useEffect(() => {
    let on = true; setBase(null); setErr(null);
    supabase.rpc('scenario_baseline', { p_kos: kosId }).then(({ data, error }) => {
      if (!on) return;
      if (error) return setErr(error);
      setBase(data);
      if (data?.aktif) { setRows(defaults(data)); loadList(); }
    });
    return () => { on = false; };
  }, [kosId, ver]); // eslint-disable-line react-hooks/exhaustive-deps

  const b = open?.baseline || base;
  const results = useMemo(() => (b && rows ? Object.fromEntries(rows.map((a) => [a.key, project(b, a)])) : null), [b, rows]);
  const stress = useMemo(() => (b && rows ? runStress(b, rows.find((a) => a.key === 'dasar')) : null), [b, rows]);

  if (err) return <p className="notice bad" role="alert">{/scenario_baseline/.test(err.message || '') ? 'Database sedang diperbarui. Coba lagi beberapa menit lagi.' : errMsg(err)}</p>;
  if (!base) return <Loading rows={5} />;
  if (!base.aktif) return <FiturUpgrade kosId={kosId} owner={owner} event="REPORT.ADVANCED_REQUESTED" title="Skenario & stress test tersedia mulai Paket Bisnis"
    text="Hitung laba, kas, dan likuiditas 12 bulan ke depan dalam skenario Pesimis/Dasar/Optimis, uji ketahanan bisnis, dan simpan berversi." />;

  const fields = fieldsFor(b.jenis);
  const issues = baselineIssues(b);
  const setVal = (key, field, value) => setRows(rows.map((a) => (a.key === key ? { ...a, [field]: value === '' ? null : Number(value) } : a)));
  const invalid = rows.map((a) => validate(a)).find(Boolean);
  const startYm = String(b.tanggal).slice(0, 7);
  const points = Array.from({ length: 12 }, (_, i) => {
    const ym = addMonthsYm(startYm, i + 1);
    return { label: bulan(ym), short: BLN[+ym.slice(5, 7) - 1], ...Object.fromEntries(KEYS.map((k) => [k, results[k].months[i].cash])) };
  });

  const openVersion = async (id) => {
    const { data, error } = await supabase.rpc('scenario_get', { p_kos: kosId, p_id: id });
    if (error) return toast(errMsg(error));
    setOpen(data); setName(data.name); setNote('');
    setRows(KEYS.map((k) => ({ ...defaults(data.baseline).find((d) => d.key === k), ...(data.assumptions.skenario.find((s) => s.key === k) || {}) })));
  };
  const reset = () => { setOpen(null); setName(''); setNote(''); setRows(defaults(base)); };
  const save = async () => {
    if (busy || !name.trim() || invalid) return;
    setBusy(true);
    const { data, error } = await supabase.rpc('scenario_save', { p_kos: kosId, p_group: open?.group_id || null, p_name: name.trim(), p_assumptions: { skenario: rows }, p_note: note.trim() || null });
    setBusy(false);
    if (error) return toast(errMsg(error));
    toast(`Tersimpan sebagai versi ${data.version}`);
    await loadList(); await openVersion(data.id);
  };
  const archive = async (group, on) => {
    const { error } = await supabase.rpc('scenario_archive', { p_kos: kosId, p_group: group, p_archive: on });
    if (error) return toast(errMsg(error));
    if (on && open?.group_id === group) reset();
    loadList();
  };
  const occ = occupancy(b);
  const shown = (list || []).filter((g) => showArchived || g.archived !== 'true');

  return <div className={styles.modGrid}>
    <section className={`${styles.card} ${styles.wide}`}>
      <div className={styles.cardH}><h2 className={styles.cardT}>Skenario & Stress Test · 12 bulan ke depan</h2>
        {open && <span className={styles.note}>Versi {open.version} · {open.name} · titik awal {tgl(open.baseline.tanggal)}</span>}</div>
      <p className={styles.note}>PROYEKSI, bukan angka aktual. Titik awal = rata-rata bulanan {b.bulan_dari ? `${bulan(String(b.bulan_dari).slice(0, 7))} – ${bulan(String(b.bulan_sampai).slice(0, 7))}` : '—'} dari Pembukuan, posisi kas/piutang/pinjaman per {tgl(b.tanggal)}. Perubahan berlaku sejak bulan pertama; persediaan & utang usaha dianggap tetap; setoran modal, ambil pribadi, pembelian aset, dan musim tidak dihitung.</p>
      {issues.map((t) => <p key={t} className="notice">{t}</p>)}
      {open && <p className="notice">Anda membuka versi tersimpan — angka memakai titik awal saat versi itu dibuat. <button type="button" className="sm ghost" onClick={reset}>Mulai dari data terbaru</button></p>}
    </section>

    <section className={styles.card}>
      <div className={styles.cardH}><h2 className={styles.cardT}>Titik awal</h2></div>
      <dl className={styles.kvs}>
        <div><dt>{b.jenis === 'properti' ? 'Pendapatan sewa' : 'Pendapatan'} / bulan</dt><dd>{rp(b.pendapatan)}</dd></div>
        {b.jenis !== 'properti' && <div><dt>Harga pokok (HPP) / bulan<small>{Number(b.pendapatan) > 0 ? `${Math.round((b.hpp * 100) / b.pendapatan)}% dari pendapatan` : ''}</small></dt><dd>{rp(b.hpp)}</dd></div>}
        <div><dt>Biaya operasional / bulan</dt><dd>{rp(b.beban_operasional)}</dd></div>
        {Number(b.bunga) > 0 && <div><dt>Bunga / bulan</dt><dd>{rp(b.bunga)}</dd></div>}
        {Number(b.pajak) > 0 && <div><dt>Pajak / bulan</dt><dd>{rp(b.pajak)}</dd></div>}
        <div><dt>Kas & bank hari ini</dt><dd>{rp(b.kas)}</dd></div>
        <div><dt>Piutang</dt><dd>{rp(b.piutang)}</dd></div>
        {Number(b.pinjaman) > 0 && <div><dt>Sisa pinjaman<small>cicilan pokok {rp(b.pokok_bulanan)}/bulan</small></dt><dd>{rp(b.pinjaman)}</dd></div>}
        {occ != null && <div><dt>Hunian sekarang</dt><dd>{occ}% ({b.hunian.terisi}/{b.hunian.kamar} kamar)</dd></div>}
        {b.pesanan != null && <div><dt>Pesanan selesai / bulan</dt><dd>{b.pesanan}</dd></div>}
        <div><dt>Biaya tunai sebulan<small>batas "waspada" kas terendah</small></dt><dd>{rp(monthlyBurn(b))}</dd></div>
      </dl>
    </section>

    <section className={styles.card}>
      <div className={styles.cardH}><h2 className={styles.cardT}>Asumsi</h2></div>
      <div className={styles.scWrap}><table className={styles.scTable}>
        <thead><tr><th>Variabel</th>{KEYS.map((k) => <th key={k} style={{ color: COLORS[k] === C.amber ? '#A16207' : COLORS[k] }}>{KEY_LABEL[k]}</th>)}</tr></thead>
        <tbody>{fields.map((f) => <tr key={f.key}>
          <th scope="row">{f.label}<small>{f.unit}{f.hint ? ` · ${f.hint}` : ''}</small></th>
          {rows.map((a) => <td key={a.key}><input type="number" inputMode="decimal" step="any" aria-label={`${f.label} ${KEY_LABEL[a.key]}`} value={a[f.key] ?? ''} onChange={(e) => setVal(a.key, f.key, e.target.value)} /></td>)}
        </tr>)}</tbody>
      </table></div>
      {invalid && <p className="notice bad">{invalid}</p>}
      <button type="button" className="sm ghost" onClick={() => setRows(defaults(b))}>Kembalikan asumsi bawaan</button>
    </section>

    <section className={`${styles.card} ${styles.wide}`}>
      <div className={styles.cardH}><h2 className={styles.cardT}>Hasil 12 bulan</h2></div>
      <div className={styles.scWrap}><table className={styles.stmt}><thead><tr><th>Ringkasan (Rp)</th>{KEYS.map((k) => <th key={k}>{KEY_LABEL[k]}</th>)}</tr></thead>
        <tbody>
          <tr><th scope="row">Pendapatan</th>{KEYS.map((k) => <td key={k}>{num(results[k].revenue)}</td>)}</tr>
          <tr className={styles.sub}><th scope="row">Laba bersih</th>{KEYS.map((k) => <td key={k} className={results[k].profit < 0 ? styles.neg : undefined}>{num(results[k].profit)}</td>)}</tr>
          <tr><th scope="row">Kas akhir</th>{KEYS.map((k) => <td key={k} className={results[k].cashEnd < 0 ? styles.neg : undefined}>{num(results[k].cashEnd)}</td>)}</tr>
          <tr><th scope="row">Kas terendah</th>{KEYS.map((k) => <td key={k} className={results[k].cashMin < 0 ? styles.neg : undefined}>{num(results[k].cashMin)}<small className={styles.scSub}>bulan {results[k].cashMinMonth}</small></td>)}</tr>
          <tr><th scope="row">Kas pertama minus</th>{KEYS.map((k) => <td key={k}>{results[k].negMonth ? `bulan ${results[k].negMonth}` : '—'}</td>)}</tr>
          <tr><th scope="row">Kebutuhan dana</th>{KEYS.map((k) => <td key={k}>{results[k].need ? num(results[k].need) : '—'}</td>)}</tr>
          <tr><th scope="row">Rasio lancar akhir</th>{KEYS.map((k) => <td key={k}>{ratio(results[k].ratioEnd)}</td>)}</tr>
          <tr><th scope="row">Status</th>{KEYS.map((k) => <td key={k}><Badge s={results[k].status} /></td>)}</tr>
        </tbody></table></div>
      <TrendChart points={points} series={KEYS.map((k) => ({ key: k, label: `Kas ${KEY_LABEL[k]}`, color: COLORS[k] }))} height={190} />
      {KEYS.flatMap((k) => results[k].notes).filter((v, i, a) => a.indexOf(v) === i).map((t) => <p key={t} className={styles.note}>{t}</p>)}
      <p className={styles.note}>Rasio lancar "—" = tidak ada kewajiban lancar (utang usaha, kewajiban lain, cicilan pinjaman ≤ 12 bulan). Aman = kas tidak pernah di bawah biaya tunai sebulan; Waspada = kas tetap positif tetapi pernah di bawah biaya tunai sebulan; Kas minus = kas diperkirakan habis (kebutuhan dana = kekurangan terbesar).</p>
    </section>

    <section className={`${styles.card} ${styles.wide}`}>
      <div className={styles.cardH}><h2 className={styles.cardT}>Stress test</h2><span className={styles.note}>diterapkan di atas skenario Dasar</span></div>
      <div className={styles.scWrap}><table className={styles.stmt}><thead><tr><th>Uji (Rp)</th><th>Laba 12 bln</th><th>Kas terendah</th><th>Status</th></tr></thead>
        <tbody>{stress.map((s) => <tr key={s.code}><th scope="row">{s.label}{s.result.need > 0 && <small className={styles.scSub}>butuh dana {num(s.result.need)} · minus bulan {s.result.negMonth}</small>}</th>
          <td className={s.result.profit < 0 ? styles.neg : undefined}>{num(s.result.profit)}</td>
          <td className={s.result.cashMin < 0 ? styles.neg : undefined}>{num(s.result.cashMin)}</td>
          <td><Badge s={s.result.status} /></td></tr>)}</tbody></table></div>
    </section>

    <section className={styles.card}>
      <div className={styles.cardH}><h2 className={styles.cardT}>{open ? `Simpan versi baru · ${open.name}` : 'Simpan skenario'}</h2></div>
      <p className={styles.note}>Setiap simpan menjadi versi baru beserta salinan titik awal hari ini. Versi lama tidak bisa diubah, jadi bisa dibandingkan dengan kenyataan nanti.</p>
      <label className={styles.scField}>Nama<input value={name} maxLength={80} onChange={(e) => setName(e.target.value)} placeholder="mis. Rencana 2027" /></label>
      <label className={styles.scField}>Catatan (opsional)<input value={note} maxLength={500} onChange={(e) => setNote(e.target.value)} placeholder="apa yang berubah" /></label>
      <button type="button" className="primary" disabled={busy || !name.trim() || Boolean(invalid)} onClick={save}>{busy ? 'Menyimpan…' : open ? 'Simpan sebagai versi baru' : 'Simpan'}</button>
      {open && <button type="button" className="sm ghost" onClick={reset}>Buat skenario baru</button>}
    </section>

    <section className={styles.card}>
      <div className={styles.cardH}><h2 className={styles.cardT}>Versi tersimpan</h2>
        {(list || []).some((g) => g.archived === 'true') && <button type="button" className="sm ghost" onClick={() => setShowArchived(!showArchived)}>{showArchived ? 'Sembunyikan arsip' : 'Tampilkan arsip'}</button>}</div>
      {!list ? <Loading rows={2} /> : !shown.length ? <p className={styles.note}>Belum ada skenario tersimpan.</p> :
        <ul className={styles.scList}>{shown.map((g) => <li key={g.group_id}><div className={styles.scGroup}>
          <b>{g.name}{g.archived === 'true' && <span className={styles.kind}> arsip</span>}</b>
          {g.versions.map((v) => <button key={v.id} type="button" aria-pressed={open?.id === v.id} onClick={() => openVersion(v.id)}>
            Versi {v.version} · {tgl(String(v.at).slice(0, 10))}{v.by ? ` · ${v.by}` : ''}{v.note ? ` — ${v.note}` : ''}</button>)}
          <button type="button" className="sm ghost" onClick={() => archive(g.group_id, g.archived !== 'true')}>{g.archived === 'true' ? 'Pulihkan' : 'Arsipkan'}</button>
        </div></li>)}</ul>}
    </section>
  </div>;
}
