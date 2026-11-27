'use client';
// Daftar risiko (Tahap F Master Blueprint BI). Server: risk_list, risk_save, risk_review, risk_progress, risk_dismiss, risk_signals;
// saran dari scenario_baseline + risk_signals lewat lib/risk.js (aturan tertulis). Pengelola = area finance/settings; PIC melihat risikonya.
import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useKos } from '@/components/KosProvider';
import { PageHeader, DataTable } from '@/components/Page';
import FiturUpgrade from '@/components/FiturUpgrade';
import PageHelp from '@/components/PageHelp';
import { Sheet, Field, Loading, Empty, toast } from '@/components/ui';
import { tgl, errMsg } from '@/lib/format';
import { canArea } from '@/lib/business';
import { CATEGORIES, STRATEGIES, STATUSES, LIKELIHOOD, IMPACT, level, suggestions, openSuggestions, heat } from '@/lib/risk';
import styles from './risiko.module.css';

const Score = ({ r, res }) => { const s = res ? r.res_score : r.score; if (s == null) return <span className="muted">—</span>; const l = level(s); return <span className={`chip ${l.tone}`}>{s} · {l.label}</span>; };
const EV = { dibuat: 'Dibuat', diubah: 'Diubah', ditinjau: 'Ditinjau', perkembangan: 'Perkembangan' };

export default function Risiko() {
  const { kos, kosId, ver } = useKos();
  return kosId && kos ? <RiskWorkspace key={kosId} kos={kos} kosId={kosId} ver={ver} /> : <Loading />;
}

function RiskWorkspace({ kos, kosId, ver }) {
  const [d, setD] = useState(null);
  const [err, setErr] = useState(null);
  const [sug, setSug] = useState([]);
  const [sugPartial, setSugPartial] = useState(false);
  const [form, setForm] = useState(null);
  const [open, setOpen] = useState(null);
  const [cell, setCell] = useState(null);
  const [showClosed, setShowClosed] = useState(false);
  const owner = canArea(kos, 'team');

  const load = async () => {
    const { data, error } = await supabase.rpc('risk_list', { p_kos: kosId });
    if (error) return setErr(error);
    setD(data);
    if (data.manager && data.aktif) {
      const [b, s] = await Promise.all([supabase.rpc('scenario_baseline', { p_kos: kosId }), supabase.rpc('risk_signals', { p_kos: kosId })]);
      // Sumber yang ditolak (mis. titik awal keuangan untuk pengelola tanpa akses keuangan) dilewati; sumber lain tetap dipakai.
      setSug(suggestions(b.error ? null : b.data, s.error ? null : s.data, kos.business_type));
      setSugPartial(Boolean(b.error));
    }
  };
  useEffect(() => { load(); }, [kosId, ver]); // eslint-disable-line react-hooks/exhaustive-deps

  const risks = d?.risks || [];
  const shown = useMemo(() => risks.filter((r) => (showClosed || r.status !== 'ditutup') && (!cell || (r.likelihood === cell[0] && r.impact === cell[1] && r.status !== 'ditutup'))), [risks, showClosed, cell]);
  if (err) return <><PageHeader title="Daftar Risiko" /><p className="notice bad">{/risk_list/.test(err.message || '') ? 'Database sedang diperbarui. Coba lagi beberapa menit lagi.' : errMsg(err)}</p></>;
  if (!d) return <><PageHeader title="Daftar Risiko" /><Loading /></>;
  const mgr = d.manager;
  const pending = mgr ? openSuggestions(sug, risks, d.dismissed) : [];
  const live = risks.filter((r) => r.status !== 'ditutup');
  const g = heat(risks);
  const counts = { kritis: 0, tinggi: 0, sedang: 0, rendah: 0 };
  live.forEach((r) => { counts[level(r.score).key] += 1; });
  const dueReview = live.filter((r) => r.review_due).length;

  const dismiss = async (code) => {
    const { error } = await supabase.rpc('risk_dismiss', { p_kos: kosId, p_code: code, p_days: 90 });
    if (error) return toast(errMsg(error));
    toast('Saran disembunyikan 90 hari'); load();
  };
  const onSaved = (r) => { setForm(null); setOpen(r || null); load(); };

  return <div className="stack">
    <PageHeader title="Daftar Risiko" help={<PageHelp page="risiko" />} actions={mgr && d.aktif ? <button className="primary" onClick={() => setForm({})}>+ Risiko baru</button> : null} />
    {!d.aktif && <FiturUpgrade kosId={kosId} owner={owner} event="REPORT.ADVANCED_REQUESTED" title="Daftar risiko tersedia mulai Paket Bisnis"
      text="Catat risiko bisnis dengan kemungkinan × dampak, rencana penanganan, penanggung jawab, jadwal tinjau, dan saran dari data keuangan." />}
    {!mgr && <p className="notice">Berikut risiko yang menjadi tanggung jawab Anda. Ketuk untuk menulis perkembangan penanganannya.</p>}

    {mgr && d.aktif && <>
      <div className={styles.summary}>
        {[['kritis', 'Sangat tinggi', 'bad'], ['tinggi', 'Tinggi', 'bad'], ['sedang', 'Sedang', 'warn'], ['rendah', 'Rendah', 'good']].map(([k, label, tone]) =>
          <div key={k} className={styles.stat}><span className={`chip ${tone}`}>{label}</span><b>{counts[k]}</b></div>)}
        <div className={styles.stat}><span className={`chip ${dueReview ? 'warn' : 'void'}`}>Perlu ditinjau</span><b>{dueReview}</b></div>
      </div>

      <section className="panel">
        <h3>Peta risiko</h3>
        <p className="small muted">Jumlah risiko yang belum ditutup menurut kemungkinan (baris) dan dampak (kolom). Ketuk kotak untuk menyaring daftar.</p>
        <div className={styles.heatWrap}><table className={styles.heat}>
          <colgroup><col className={styles.hcol} />{[1, 2, 3, 4, 5].map((i) => <col key={i} />)}</colgroup>
          <thead><tr><th aria-label="Kemungkinan / dampak" />{[1, 2, 3, 4, 5].map((i) => <th key={i} scope="col" title={IMPACT[i]}>{i}</th>)}</tr></thead>
          <tbody>{[5, 4, 3, 2, 1].map((l) => <tr key={l}><th scope="row" title={LIKELIHOOD[l]}>{l}</th>{[1, 2, 3, 4, 5].map((i) =>
            <td key={i}><button type="button" data-level={level(l * i).key} aria-pressed={cell?.[0] === l && cell?.[1] === i}
              aria-label={`Kemungkinan ${l}, dampak ${i}: ${g[l][i]} risiko`} onClick={() => setCell(cell?.[0] === l && cell?.[1] === i ? null : [l, i])}>{g[l][i] || ''}</button></td>)}</tr>)}</tbody>
        </table><div className={styles.axis}><span>↑ Kemungkinan</span><span>Dampak →</span></div></div>
      </section>

      {pending.length > 0 && <section className="panel">
        <h3>Saran dari data ({pending.length})</h3>
        <p className="small muted">Dihitung dari Pembukuan, piutang, pinjaman, dan stress test. Tidak ada yang masuk daftar sebelum Anda menerimanya.</p>
        {sugPartial && <p className="small muted">Saran dari Pembukuan (kas, laba, pinjaman, stress test) hanya terlihat oleh anggota bagian keuangan; yang tampil di sini dari tagihan/piutang yang lewat jatuh tempo.</p>}
        <div className="list">{pending.map((s) => <div className="li" key={s.code}><div className="main">
          <b>{s.title}</b><small>{s.why}</small><small className="muted">Usulan: kemungkinan {s.likelihood} × dampak {s.impact} = {s.likelihood * s.impact} ({level(s.likelihood * s.impact).label})</small>
          <div className="row"><button className="sm" onClick={() => setForm({ title: s.title, category: s.category, likelihood: s.likelihood, impact: s.impact, mitigation: s.mitigation, description: s.why, source: 'saran:' + s.code })}>Masukkan ke daftar</button>
            <button className="sm ghost" onClick={() => dismiss(s.code)}>Abaikan 90 hari</button></div>
        </div></div>)}</div>
      </section>}
    </>}

    <section className="panel">
      <div className="row between"><h3>{mgr ? 'Semua risiko' : 'Risiko saya'}{cell ? ` · kemungkinan ${cell[0]} × dampak ${cell[1]}` : ''}</h3>
        <div className="row">{cell && <button className="sm ghost" onClick={() => setCell(null)}>Hapus saringan</button>}
          {risks.some((r) => r.status === 'ditutup') && <button className="sm ghost" onClick={() => setShowClosed(!showClosed)}>{showClosed ? 'Sembunyikan yang ditutup' : 'Tampilkan yang ditutup'}</button>}</div></div>
      {!shown.length ? <Empty title={mgr ? 'Belum ada risiko' : 'Tidak ada risiko untuk Anda'} text={mgr ? 'Ketuk + Risiko baru atau terima saran dari data.' : ''} /> :
        <DataTable caption="Daftar risiko" rows={shown} onRow={(r) => setOpen(r)} rowLabel={(r) => `${r.number} ${r.title}`} columns={[
          { key: 'title', label: 'Risiko', main: true, render: (r) => <><b>{r.title}</b><small className={styles.sub}>{r.number} · {CATEGORIES[r.category]}</small></> },
          { key: 'score', label: 'Skor', render: (r) => <Score r={r} /> },
          { key: 'res', label: 'Setelah penanganan', hide: 'tablet', render: (r) => <Score r={r} res /> },
          { key: 'pic', label: 'PIC', hide: 'tablet', render: (r) => r.owner_label || '—' },
          { key: 'status', label: 'Status', render: (r) => <span className={`chip ${r.status === 'ditutup' ? 'void' : r.status === 'terbuka' ? 'warn' : 'info'}`}>{STATUSES[r.status]}</span> },
          { key: 'review', label: 'Tinjau', render: (r) => r.status === 'ditutup' ? '—' : <span className={r.review_due ? styles.due : undefined}>{tgl(r.next_review)}</span> },
        ]} card={(r) => <><div className="row between"><b>{r.title}</b><Score r={r} /></div>
          <small className={styles.sub}>{r.number} · {CATEGORIES[r.category]} · PIC {r.owner_label || '—'}</small>
          <small className={styles.sub}>{STATUSES[r.status]}{r.status !== 'ditutup' && <> · tinjau <span className={r.review_due ? styles.due : undefined}>{tgl(r.next_review)}</span></>}</small></>} />}
    </section>
    <p className="small muted">Skor = kemungkinan × dampak (1–5). Tingkat: 1–4 rendah, 5–9 sedang, 10–14 tinggi, 15–25 sangat tinggi. Daftar ini catatan pengelolaan internal, bukan penilaian resmi pihak luar.</p>

    {form && <RiskForm kosId={kosId} init={form} members={d.members || []} onClose={() => setForm(null)} onSaved={onSaved} />}
    {open && !form && <RiskDetail kosId={kosId} r={open} mgr={mgr} onClose={() => setOpen(null)} onEdit={() => setForm(open)} onSaved={(r) => { setOpen(r); load(); }} />}
  </div>;
}

function Scale({ label, value, onChange, names, allowEmpty }) {
  return <Field label={label}><select value={value ?? ''} onChange={(e) => onChange(e.target.value === '' ? null : Number(e.target.value))}>
    {allowEmpty && <option value="">— belum dinilai</option>}
    {[1, 2, 3, 4, 5].map((i) => <option key={i} value={i}>{i} · {names[i]}</option>)}</select></Field>;
}

function RiskForm({ kosId, init, members, onClose, onSaved }) {
  const [f, setF] = useState({ category: 'operasional', likelihood: 3, impact: 3, strategy: 'kurangi', review_days: 30, status: 'terbuka', ...init });
  const [busy, setBusy] = useState(false);
  const set = (k) => (v) => setF((x) => ({ ...x, [k]: v }));
  const save = async () => {
    if (busy || (f.title || '').trim().length < 3) return;
    if ((f.res_likelihood == null) !== (f.res_impact == null)) return toast('Isi kemungkinan DAN dampak setelah penanganan, atau kosongkan keduanya');
    setBusy(true);
    const { data, error } = await supabase.rpc('risk_save', { p_kos: kosId, p_id: init.id || null, p: { ...f, owner_user: f.owner_user || null, due_date: f.due_date || null } });
    setBusy(false);
    if (error) return toast(errMsg(error));
    toast(init.id ? 'Risiko diperbarui' : `Risiko ${data.number} dicatat`); onSaved(data);
  };
  const score = (f.likelihood || 0) * (f.impact || 0);
  return <Sheet title={init.id ? `Ubah ${init.number}` : 'Risiko baru'} onClose={() => !busy && onClose()}>
    <Field label="Judul risiko"><input value={f.title || ''} maxLength={120} onChange={(e) => set('title')(e.target.value)} placeholder="mis. Pemasok utama berhenti mengirim" /></Field>
    <Field label="Kategori"><select value={f.category} onChange={(e) => set('category')(e.target.value)}>{Object.entries(CATEGORIES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Field>
    <Field label="Penjelasan / penyebab (opsional)"><textarea rows={2} maxLength={1000} value={f.description || ''} onChange={(e) => set('description')(e.target.value)} /></Field>
    <div className={styles.two}><Scale label="Kemungkinan" value={f.likelihood} onChange={set('likelihood')} names={LIKELIHOOD} /><Scale label="Dampak" value={f.impact} onChange={set('impact')} names={IMPACT} /></div>
    <p className="small">Skor {score} · <span className={`chip ${level(score).tone}`}>{level(score).label}</span></p>
    <Field label="Cara menangani"><select value={f.strategy} onChange={(e) => set('strategy')(e.target.value)}>{Object.entries(STRATEGIES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Field>
    <Field label="Rencana penanganan"><textarea rows={2} maxLength={1000} value={f.mitigation || ''} onChange={(e) => set('mitigation')(e.target.value)} placeholder="Langkah konkret, siapa, kapan" /></Field>
    <div className={styles.two}><Scale label="Kemungkinan setelah ditangani" value={f.res_likelihood} onChange={set('res_likelihood')} names={LIKELIHOOD} allowEmpty />
      <Scale label="Dampak setelah ditangani" value={f.res_impact} onChange={set('res_impact')} names={IMPACT} allowEmpty /></div>
    <Field label="Penanggung jawab (PIC)"><select value={f.owner_user || ''} onChange={(e) => set('owner_user')(e.target.value || null)}>
      <option value="">— belum ditunjuk</option>{members.map((m) => <option key={m.user_id} value={m.user_id}>{m.label}{m.role === 'pemilik' ? ' (pemilik)' : ''}</option>)}</select></Field>
    <div className={styles.two}><Field label="Target selesai (opsional)"><input type="date" value={f.due_date || ''} onChange={(e) => set('due_date')(e.target.value)} /></Field>
      <Field label="Tinjau ulang setiap"><select value={f.review_days} onChange={(e) => set('review_days')(Number(e.target.value))}>{[7, 14, 30, 60, 90, 180, 365].map((v) => <option key={v} value={v}>{v} hari</option>)}</select></Field></div>
    {init.id && <Field label="Status"><select value={f.status} onChange={(e) => set('status')(e.target.value)}>{Object.entries(STATUSES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Field>}
    <button className="primary" disabled={busy || (f.title || '').trim().length < 3} onClick={save}>{busy ? 'Menyimpan…' : 'Simpan'}</button>
  </Sheet>;
}

function RiskDetail({ kosId, r, mgr, onClose, onEdit, onSaved }) {
  const [mode, setMode] = useState(null);
  const [note, setNote] = useState('');
  const [status, setStatus] = useState(r.status);
  const [rv, setRv] = useState({ l: r.likelihood, i: r.impact });
  const [busy, setBusy] = useState(false);
  const call = async (fn, args, ok) => {
    if (busy) return;
    setBusy(true);
    const { data, error } = await supabase.rpc(fn, { p_kos: kosId, p_id: r.id, ...args });
    setBusy(false);
    if (error) return toast(errMsg(error));
    toast(ok); setMode(null); setNote(''); onSaved(data);
  };
  return <Sheet title={`${r.number} · ${r.title}`} onClose={onClose}>
    <div className="row"><Score r={r} /><span className="small muted">kemungkinan {r.likelihood} ({LIKELIHOOD[r.likelihood]}) × dampak {r.impact} ({IMPACT[r.impact]})</span></div>
    <dl className={styles.kv}>
      <div><dt>Kategori</dt><dd>{CATEGORIES[r.category]}</dd></div>
      <div><dt>Status</dt><dd>{STATUSES[r.status]}</dd></div>
      <div><dt>PIC</dt><dd>{r.owner_label || '—'}</dd></div>
      <div><dt>Cara menangani</dt><dd>{STRATEGIES[r.strategy]}</dd></div>
      {r.res_score != null && <div><dt>Setelah ditangani</dt><dd><Score r={r} res /></dd></div>}
      {r.due_date && <div><dt>Target selesai</dt><dd>{tgl(r.due_date)}</dd></div>}
      <div><dt>Tinjau berikutnya</dt><dd className={r.review_due ? styles.due : undefined}>{r.status === 'ditutup' ? '—' : tgl(r.next_review)} (setiap {r.review_days} hari)</dd></div>
      {r.source !== 'manual' && <div><dt>Sumber</dt><dd>Saran dari data</dd></div>}
    </dl>
    {r.description && <p className="small"><b>Penjelasan:</b> {r.description}</p>}
    {r.mitigation && <p className="small"><b>Rencana penanganan:</b> {r.mitigation}</p>}

    {mode === 'progress' && <div className="stack">
      <Field label="Status"><select value={status} onChange={(e) => setStatus(e.target.value)}>{Object.entries(STATUSES).filter(([k]) => mgr || k !== 'ditutup').map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Field>
      <Field label="Catatan perkembangan"><textarea rows={2} maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Apa yang sudah dilakukan" /></Field>
      <button className="primary" disabled={busy || (status === r.status && note.trim().length < 3)} onClick={() => call('risk_progress', { p_status: status, p_note: note }, 'Perkembangan dicatat')}>Simpan perkembangan</button>
    </div>}
    {mode === 'review' && <div className="stack">
      <div className={styles.two}><Scale label="Kemungkinan sekarang" value={rv.l} onChange={(v) => setRv({ ...rv, l: v })} names={LIKELIHOOD} /><Scale label="Dampak sekarang" value={rv.i} onChange={(v) => setRv({ ...rv, i: v })} names={IMPACT} /></div>
      <Field label="Catatan tinjauan (opsional)"><textarea rows={2} maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} /></Field>
      <button className="primary" disabled={busy} onClick={() => call('risk_review', { p_likelihood: rv.l, p_impact: rv.i, p_note: note }, 'Tinjauan dicatat')}>Simpan tinjauan</button>
    </div>}
    {!mode && <div className="row">
      {(r.status !== 'ditutup' || mgr) && <button className="sm" onClick={() => setMode('progress')}>Tulis perkembangan</button>}
      {mgr && r.status !== 'ditutup' && <button className="sm" onClick={() => setMode('review')}>Tinjau ulang</button>}
      {mgr && <button className="sm ghost" onClick={onEdit}>Ubah</button>}
    </div>}

    <h4>Riwayat</h4>
    <ul className={styles.log}>{[...(r.log || [])].reverse().map((l, i) => <li key={i}><b>{EV[l.ev] || l.ev}</b> · {l.by || 'Sistem'} · {tgl(String(l.at).slice(0, 10))}
      {l.skor != null && ` · skor ${l.skor_lama != null ? `${l.skor_lama} → ` : ''}${l.skor}`}{l.status && ` · ${STATUSES[l.status]}`}{l.pic && ` · PIC ${l.pic}`}{l.catatan && ` — ${l.catatan}`}</li>)}</ul>
  </Sheet>;
}
