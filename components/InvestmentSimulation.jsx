'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { estimateMonthlyCash, investmentScenarios, savedInvestmentInputs, INITIAL_INVESTMENT, INVESTMENT_DRIVERS } from '@/lib/investmentSimulation';
import { errMsg, rp, tgl } from '@/lib/format';
import { INVESTMENT_GOALS, investmentDecision, plannerGuide } from '@/lib/investmentPlanner';
import InvestmentEvidence, { useInvestmentEvidence } from './InvestmentEvidence';
import InvestmentActualTracking from './InvestmentActualTracking';
import InvestmentComparison from './InvestmentComparison';
import { Tile } from '@/components/ui';

const pct = new Intl.NumberFormat('id-ID', { maximumFractionDigits: 1 });

const initialProject = { share: '', asset: '', setup: '', openingStock: '', life: '' };
const fieldHelp = {
  capital: 'Kas yang dikeluarkan sebelum proyek mulai menghasilkan.',
  revenue: 'Uang tambahan yang diterima setiap bulan.',
  directSavings: 'Pembayaran lama yang dapat dihindari berkat proyek. Kosongkan jika tidak ada.',
  cost: 'Pembayaran tambahan setiap bulan. Isi 0 jika memang tidak ada.',
  annualDiscount: 'Imbal hasil minimum tahunan untuk menilai uang yang diterima nanti. Asumsi awal 12%, dapat diubah.',
  months: 'Jumlah bulan yang dihitung. Asumsi awal 12 bulan, dapat diubah.',
  change: 'Persentase yang dikurangi atau ditambahkan pada skenario lesu dan optimistis.',
};

export default function InvestmentSimulation({ kosId, ver, category }) {
  const [mode, setMode] = useState('auto');
  const [values, setValues] = useState({ ...INITIAL_INVESTMENT, change: '' });
  const [goal, setGoal] = useState('growth');
  const [project, setProject] = useState(initialProject);
  const [provenance, setProvenance] = useState({});
  const [applied, setApplied] = useState('');
  const [guideStep, setGuideStep] = useState(0);
  const history = useInvestmentEvidence(kosId, ver, category, mode === 'auto');
  const [selected, setSelected] = useState(1);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(null);
  const [name, setName] = useState('');
  const [opened, setOpened] = useState(null);
  const [saveError, setSaveError] = useState('');
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState('');
  const requestId = useRef(null);
  const editedDuration = useRef(false);
  const request = (p_action, p_data = {}) => supabase.rpc('acct_investment_simulation', { p_kos: kosId, p_action, p_data });

  useEffect(() => {
    let active = true;
    request('list').then(({ data, error }) => {
      if (!active) return;
      if (error) setSaveError(error.code === 'PGRST202' ? 'Penyimpanan menunggu pembaruan database. Kalkulator tetap tersedia.' : errMsg(error));
      else setSaved(data);
    });
    return () => { active = false; };
  }, [kosId]);

  const update = (key, value) => {
    if (key === 'months') editedDuration.current = true;
    setValues((current) => ({ ...current, [key]: value }));
    setProvenance((current) => ({ ...current, [key]: undefined }));
    setError(''); setFeedback(''); setApplied(''); requestId.current = null;
  };
  const field = (key, label, options = {}) => <label>{label}<input {...options}
    value={values[key]} disabled={saving} onChange={(event) => update(key, event.target.value)}
    aria-describedby={fieldHelp[key] || provenance[key] ? 'investment-' + key : undefined} />
    {(fieldHelp[key] || provenance[key]) && <small id={'investment-' + key} className="muted">
      {fieldHelp[key]} {provenance[key] && <>Diisi dari {provenance[key].source}. {provenance[key].reason}</>}
    </small>}
  </label>;

  const changeMode = (next) => { setMode(next); setError(''); setFeedback(''); setApplied(''); requestId.current = null; };
  const guided = mode === 'plan';
  const guide = plannerGuide(category, goal);
  const calculation = useMemo(() => {
    try {
      if (!values.annualDiscount.trim()) throw new Error('Isi diskonto tahunan. Gunakan 0% jika tidak memakai diskonto.');
      if (!values.change.trim()) throw new Error('Isi perubahan skenario. Gunakan 0% jika ingin skenario identik.');
      if (!guided && (!values.revenue.trim() || !values.cost.trim())) {
        throw new Error('Isi penerimaan dan pengeluaran bulanan. Gunakan 0 jika memang tidak ada.');
      }
      return { scenarios: investmentScenarios(values, guided ? 'plan' : 'direct') };
    } catch (err) { return { error: err.message }; }
  }, [values, guided]);
  const { scenarios } = calculation;
  const driverInputs = Object.fromEntries(INVESTMENT_DRIVERS.map((key) => [key, Number(values[key])]));
  let preview = null;
  if (guided && INVESTMENT_DRIVERS.some((key) => values[key]) && INVESTMENT_DRIVERS.every((key) => /^\d*$/.test(values[key]))) {
    try { preview = estimateMonthlyCash(driverInputs); } catch { /* Validation is shown on submit. */ }
  }

  function calculate(event) {
    event.preventDefault();
    setError(calculation.error || '');
  }

  function applySuggestions(suggestions) {
    const apply = Object.fromEntries(Object.entries(suggestions).filter(([key]) =>
      values[key] === '' || provenance[key] || (key === 'months' && !editedDuration.current && values[key] === INITIAL_INVESTMENT.months)));
    if (!Object.keys(apply).length) {
      setApplied('Kolom rekomendasi sudah terisi. Kosongkan kolom yang ingin diisi ulang.');
      return;
    }
    setValues({ ...values, ...Object.fromEntries(Object.entries(apply).map(([key, item]) => [key, item.value])) });
    setProvenance({ ...provenance, ...apply });
    setApplied(Object.keys(apply).length + ' asumsi diisi. Anda bisa mengubah setiap angka.');
    setError(''); setFeedback(''); requestId.current = null;
  }

  async function save() {
    if (!name.trim() || saving || !scenarios) return;
    setSaving(true); setSaveError(''); setFeedback('');
    try {
      requestId.current ||= crypto.randomUUID();
      const { data, error } = await request('save', {
        id: requestId.current, previous_id: opened, name: name.trim(), mode: guided ? 'plan' : 'direct', assumptions: { ...values, plannerSources: provenance },
      });
      if (error) throw error;
      setOpened(data.id);
      setSaved((items) => [data, ...(items || []).filter((item) => item.id !== data.id)].slice(0, 50));
      requestId.current = null;
      setFeedback('Simulasi disimpan. Perubahan berikutnya dapat disimpan sebagai versi baru.');
    } catch (error) { setSaveError(errMsg(error)); }
    finally { setSaving(false); }
  }

  function open(version) {
    const assumptions = savedInvestmentInputs(version);
    setOpened(version.id); setName(version.name); setMode(version.mode); setValues(assumptions);
    editedDuration.current = true;
    setProvenance(Object.fromEntries(Object.entries(version.assumptions?.plannerSources || {})
      .filter(([key, item]) => item?.value === assumptions[key] && typeof item.source === 'string' && typeof item.reason === 'string')));
    setSelected(1); setGuideStep(0); setError(''); setApplied('');
    setFeedback('Versi dibuka. Hasil dihitung ulang dari asumsi tersimpan.');
    requestId.current = null;
  }

  const result = scenarios?.[selected];
  const decision = scenarios && investmentDecision(scenarios);
  const baseline = saved?.find((version) => version.id === opened);
  let trackingPlan = null;
  if (baseline) {
    try { trackingPlan = investmentScenarios(savedInvestmentInputs(baseline), baseline.mode)[1]; } catch { /* Invalid historical inputs cannot serve as a baseline. */ }
  }
  return <div className="stack">
    <section className="panel">
      <h3>Simulasi Tersimpan</h3>
      {saveError && <div className="notice bad" role="alert">{saveError}</div>}
      {!saved && !saveError && <p className="small muted">Memuat simulasi…</p>}
      {saved?.length === 0 && <p className="small muted">Hitung kelayakan, lalu beri nama untuk menyimpan rencana.</p>}
      <div className="list">{saved?.map((version) => <div className="li" key={version.id}>
        <span>{version.name} <small className="muted">· {tgl(version.created_at.slice(0, 10))}{version.previous_id ? ' · Revisi' : ''}</small></span>
        <button className="sm ghost" type="button" disabled={saving} onClick={() => open(version)}>Buka</button>
      </div>)}</div>
    </section>
    {saved?.length >= 2 && <InvestmentComparison versions={saved} />}
    {trackingPlan && <InvestmentActualTracking key={opened} kosId={kosId} versionId={opened} plan={trackingPlan} />}
    <section className="panel">
      <h3>Smart Investment Planner</h3>
      <p className="small muted">Uji ekspansi, pembelian alat, atau proyek baru dari perkiraan kas tambahan. Simulasi ini tidak mengubah pembukuan.</p>
      <form className="stack" onSubmit={calculate}>
        <div className="seg" role="group" aria-label="Cara input arus kas">
          {[['auto', 'Rekomendasi Otomatis'], ['plan', 'Panduan Interaktif'], ['direct', 'Input Manual']].map(([id, label]) =>
            <button key={id} type="button" disabled={saving} className={mode === id ? 'on' : ''} aria-pressed={mode === id}
              onClick={() => changeMode(id)}>{label}</button>)}
        </div>
        {mode !== 'direct' && <label>Tujuan investasi<select value={goal} disabled={saving} onChange={(e) => {
          setGoal(e.target.value); setGuideStep(0); setApplied('');
        }}>
          {INVESTMENT_GOALS.map(([id, label]) => <option key={id} value={id}>{label}</option>)}
        </select></label>}
        {mode === 'auto' && <InvestmentEvidence history={history} project={project} category={category} goal={goal}
          onProject={(key, value) => { setProject((current) => ({ ...current, [key]: value })); setApplied(''); }}
          onApply={applySuggestions} applied={applied} saving={saving} />}
        {guided && <>
          <p className="small muted">Langkah {guideStep + 1} dari 3 · {[
            guide.capital, guide.cash, 'Tentukan durasi proyek, nilai jual akhir, tingkat diskonto, dan perubahan skenario.',
          ][guideStep]}</p>
          <div className="row">
            <button className="sm ghost" type="button" disabled={saving || guideStep === 0} onClick={() => setGuideStep(guideStep - 1)}>Sebelumnya</button>
            <button className="sm" type="button" disabled={saving || guideStep === 2} onClick={() => setGuideStep(guideStep + 1)}>Lanjut</button>
          </div>
        </>}
        <div className="grid">
          {(!guided || guideStep === 0) && field('capital', 'Modal awal (Rp)', { inputMode: 'numeric', required: true, placeholder: 'Contoh 25000000' })}
          {guided ? guideStep === 1 && <>
            {field('units', 'Jumlah ' + guide.operation + ' yang dibayar per bulan', { inputMode: 'numeric', placeholder: 'Contoh 100' })}
            {field('price', 'Harga jual per unit (Rp)', { inputMode: 'numeric', placeholder: 'Contoh 50000', required: Number(values.units) > 0 })}
            {field('unitCost', 'Biaya kas per unit (Rp)', { inputMode: 'numeric', placeholder: 'Contoh 30000', required: Number(values.units) > 0 })}
            {field('fixedCost', 'Biaya tetap tambahan per bulan (Rp)', { inputMode: 'numeric', placeholder: 'Contoh sewa, listrik, perawatan' })}
            {field('savings', 'Penghematan kas per bulan (Rp)', { inputMode: 'numeric', placeholder: 'Isi jika alat mengurangi biaya lama' })}
          </> : <>
            {field('revenue', 'Penerimaan kas tambahan per bulan (Rp)', { inputMode: 'numeric', required: true })}
            {field('cost', 'Pengeluaran kas tambahan per bulan (Rp)', { inputMode: 'numeric', required: true })}
            {field('directSavings', 'Penghematan kas per bulan (Rp)', { inputMode: 'numeric' })}
          </>}
          {(!guided || guideStep === 2) && <>
          {field('residual', 'Nilai jual aset di akhir proyek (Rp)', { inputMode: 'numeric', placeholder: '0 bila tidak ada' })}
          {field('months', 'Durasi (bulan)', { type: 'number', min: 1, max: 60, step: 1, required: true })}
          {field('annualDiscount', 'Tingkat diskonto efektif per tahun (%)', { type: 'number', min: 0, max: 1000, step: 'any', required: true })}
          {field('change', guided ? 'Perubahan volume tiap skenario (%)' : 'Perubahan penerimaan tiap skenario (%)', { type: 'number', min: 0, max: 100, step: 'any', required: true })}
          </>}
        </div>
        {preview && <div className="notice" aria-live="polite">
          Penerimaan tambahan {rp(preview.sales)} · Penghematan {rp(preview.savings)} · Pengeluaran {rp(preview.cost)} · Kas bersih {rp(preview.net)} per bulan.
        </div>}
        <p className="small muted">{guided
          ? 'Skenario mengubah volume, sehingga penerimaan dan total biaya variabel ikut berubah. Biaya tetap dan penghematan tetap sama.'
          : 'Skenario mengubah penerimaan. Pengeluaran dan penghematan memakai jumlah yang Anda isi.'}
          {' '}Masukkan biaya awal seperti pemasangan dan stok awal ke modal. Hindari menghitung penghematan yang sama dua kali.</p>
        {error && <div className="notice bad" role="alert">{error}</div>}
        {(!guided || guideStep === 2) && <button className="primary" type="submit" disabled={saving}>Periksa Asumsi</button>}
      </form>
    </section>
    {result && <>
      <section className="panel">
        <h3>Hasil Simulasi</h3>
        <div className={'notice ' + (decision[0] === 'Belum layak' ? 'bad' : '')}><b>{decision[0]}</b> · {decision[1]}</div>
        {saved && <div className="row">
          <label>Nama rencana<input value={name} maxLength={100} disabled={saving}
            onChange={(event) => { setName(event.target.value); requestId.current = null; setFeedback(''); }} placeholder="Contoh Kulkas minuman" /></label>
          <button className="sm" type="button" disabled={!name.trim() || saving} onClick={save}>{saving ? 'Menyimpan…' : opened ? 'Simpan Versi Baru' : 'Simpan Simulasi'}</button>
          {opened && <button className="sm ghost" type="button" disabled={saving} onClick={() => { setOpened(null); setName(''); requestId.current = null; setFeedback(''); }}>Simpan sebagai Rencana Baru</button>}
          {feedback && <p className="small muted" role="status">{feedback}</p>}
        </div>}
        <div className="seg" role="group" aria-label="Pilih skenario investasi">
          {scenarios.map(({ name }, index) => <button key={name} type="button" className={selected === index ? 'on' : ''} aria-pressed={selected === index} onClick={() => setSelected(index)}>{name}</button>)}
        </div>
        <div className="grid">
          <Tile label="NPV" value={rp(result.npv)} sub="Nilai kini arus kas setelah dikurangi modal awal" tone={result.npv < 0 ? 'bad' : ''} />
          <Tile label="ROI Proyeksi" value={pct.format(result.roi) + '%'} sub="Hasil bersih ÷ modal awal selama proyek" />
          <Tile label="IRR Tahunan" value={result.irr == null ? '—' : pct.format(result.irr) + '%'} sub={result.irr == null ? 'IRR tunggal tidak tersedia' : 'Tingkat imbal hasil efektif'} />
          <Tile label="Margin Kas Operasi" value={(result.cash.sales ?? result.cash.revenue) > 0 ?
            pct.format(((result.cash.sales ?? result.cash.revenue) - result.cash.cost) / (result.cash.sales ?? result.cash.revenue) * 100) + '%' : '—'}
            sub="Bagian penerimaan penjualan yang tersisa setelah biaya, sebelum penghematan" />
          <Tile label="Balik Modal (Payback Period)"  value={result.payback == null ? 'Belum tercapai' : 'Bulan ' + result.payback} sub="Bulan pertama saldo kumulatif mencapai nol atau positif" />
        </div>
        <div className="notice">NPV {result.npv >= 0 ? 'mencapai atau melebihi' : 'berada di bawah'} target berdasarkan diskonto dan asumsi skenario ini.</div>
      </section>
      <section className="panel">
        <h3>Perbandingan Skenario</h3>
        <div className="list">{scenarios.map((scenario) => <div className="li" key={scenario.name}>
          <b>{scenario.name}</b><span className="small">{scenario.cash.volume != null && scenario.cash.volume + ' unit · '}
          Kas bersih/bln {rp(scenario.cash.revenue - scenario.cash.cost)} · NPV {rp(scenario.npv)} · ROI {pct.format(scenario.roi)}%</span>
        </div>)}</div>
      </section>
      <section className="panel">
        <details><summary>Rincian Arus Kas Proyek</summary>
          <div className="list">{result.series.map((row) => <div className="li small" key={row.month}>
            <span>{row.month === 0 ? 'Modal awal' : 'Bulan ' + row.month} · {rp(row.flow)}</span><b>Akumulasi {rp(row.cumulative)}</b>
          </div>)}</div>
        </details>
      </section>
    </>}
  </div>;
}
