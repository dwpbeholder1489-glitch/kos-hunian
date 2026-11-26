'use client';
import { useEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { estimateMonthlyCash, simulateInvestment } from '@/lib/investmentSimulation';
import { errMsg, rp, tgl } from '@/lib/format';
import { Tile } from '@/components/ui';

const INITIAL = { capital: '', revenue: '', cost: '', months: '12', annualDiscount: '12', residual: '', change: '20', units: '', price: '', unitCost: '', fixedCost: '', savings: '' };
const DRIVERS = ['units', 'price', 'unitCost', 'fixedCost', 'savings'];
const pct = new Intl.NumberFormat('id-ID', { maximumFractionDigits: 1 });

export default function InvestmentSimulation({ kosId }) {
  const [mode, setMode] = useState('plan');
  const [values, setValues] = useState(INITIAL);
  const [selected, setSelected] = useState(1);
  const [scenarios, setScenarios] = useState(null);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(null);
  const [name, setName] = useState('');
  const [opened, setOpened] = useState(null);
  const [saveError, setSaveError] = useState('');
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState('');
  const requestId = useRef(null);
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
    setValues((current) => ({ ...current, [key]: value }));
    setScenarios(null); setError(''); setFeedback(''); requestId.current = null;
  };
  const field = (key, label, options = {}) => <label>{label}<input {...options}
    value={values[key]} disabled={saving} onChange={(event) => update(key, event.target.value)} /></label>;

  const changeMode = (next) => { setMode(next); setScenarios(null); setError(''); setFeedback(''); requestId.current = null; };
  const guided = mode === 'plan';
  const driverInputs = Object.fromEntries(DRIVERS.map((key) => [key, Number(values[key])]));
  let preview = null;
  if (guided && DRIVERS.some((key) => values[key]) && DRIVERS.every((key) => /^\d*$/.test(values[key]))) {
    try { preview = estimateMonthlyCash(driverInputs); } catch { /* Show the validation message on submit. */ }
  }

  function calculate(event, inputs = values, inputMode = mode) {
    event?.preventDefault();
    const guided = inputMode === 'plan';
    const drivers = Object.fromEntries(DRIVERS.map((key) => [key, Number(inputs[key])]));
    setError(''); setScenarios(null);
    try {
      const moneyKeys = ['capital', 'residual', ...(guided ? DRIVERS : ['revenue', 'cost'])];
      const capital = Number(inputs.capital), residual = Number(inputs.residual);
      const months = Number(inputs.months), annualDiscount = Number(inputs.annualDiscount);
      const change = Number(inputs.change) / 100;
      if (moneyKeys.some((key) => !/^\d*$/.test(inputs[key]) || Number(inputs[key]) > 1e12) ||
          !Number.isFinite(change) || change < 0 || change > 1 || annualDiscount > 1000) {
        throw new Error('Masukkan nominal dalam angka bulat hingga Rp1 triliun. Perubahan skenario maksimal 100%.');
      }
      if (guided && !(drivers.units > 0 || drivers.savings > 0)) {
        throw new Error('Isi perkiraan volume penjualan atau penghematan kas bulanan.');
      }
      const variants = [['Lesu', 1 - change], ['Dasar', 1], ['Optimistis', 1 + change]];
      setScenarios(variants.map(([name, factor]) => {
        const cash = guided ? estimateMonthlyCash(drivers, factor) : {
          revenue: Math.round(Number(inputs.revenue) * factor), cost: Number(inputs.cost),
        };
        return { name, cash, ...simulateInvestment({ capital, revenue: cash.revenue, cost: cash.cost, residual, months, annualDiscount }) };
      }));
      setSelected(1);
    } catch (err) {
      setError(err.message);
    }
  }

  async function save() {
    if (!name.trim() || saving || !scenarios) return;
    setSaving(true); setSaveError(''); setFeedback('');
    try {
      requestId.current ||= crypto.randomUUID();
      const { data, error } = await request('save', {
        id: requestId.current, previous_id: opened, name: name.trim(), mode, assumptions: values,
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
    const assumptions = Object.fromEntries(Object.entries(INITIAL).map(([key, value]) => [
      key, typeof version.assumptions?.[key] === 'string' ? version.assumptions[key] : value,
    ]));
    setOpened(version.id); setName(version.name); setMode(version.mode); setValues(assumptions);
    setFeedback('Versi dibuka. Hasil dihitung ulang dari asumsi tersimpan.');
    requestId.current = null;
    calculate(null, assumptions, version.mode);
  }

  const result = scenarios?.[selected];
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
    <section className="panel">
      <h3>Simulasi Kelayakan Investasi</h3>
      <p className="small muted">Uji ekspansi, pembelian alat, atau proyek baru dari perkiraan kas tambahan. Simulasi ini tidak mengubah pembukuan.</p>
      <form className="stack" onSubmit={calculate}>
        <div className="seg" role="group" aria-label="Cara input arus kas">
          <button type="button" disabled={saving} className={guided ? 'on' : ''} aria-pressed={guided} onClick={() => changeMode('plan')}>Estimasi dari Rencana</button>
          <button type="button" disabled={saving} className={!guided ? 'on' : ''} aria-pressed={!guided} onClick={() => changeMode('direct')}>Input Total Bulanan</button>
        </div>
        {guided && <p className="small muted">Gunakan target penjualan atau uji pasar untuk volume dan harga. Ambil biaya per unit, pengiriman, pemasangan, dan kebutuhan stok awal dari penawaran pemasok atau usaha pembanding.</p>}

        <div className="grid">
          {field('capital', 'Modal awal (Rp)', { inputMode: 'numeric', required: true, placeholder: 'Contoh 25000000' })}
          {guided ? <>
            {field('units', 'Unit terjual dan dibayar per bulan', { inputMode: 'numeric', placeholder: 'Contoh 100' })}
            {field('price', 'Harga jual per unit (Rp)', { inputMode: 'numeric', placeholder: 'Contoh 50000', required: Number(values.units) > 0 })}
            {field('unitCost', 'Biaya kas per unit (Rp)', { inputMode: 'numeric', placeholder: 'Contoh 30000', required: Number(values.units) > 0 })}
            {field('fixedCost', 'Biaya tetap tambahan per bulan (Rp)', { inputMode: 'numeric', placeholder: 'Contoh sewa, listrik, perawatan' })}
            {field('savings', 'Penghematan kas per bulan (Rp)', { inputMode: 'numeric', placeholder: 'Isi jika alat mengurangi biaya lama' })}
          </> : <>
            {field('revenue', 'Penerimaan kas tambahan per bulan (Rp)', { inputMode: 'numeric', required: true })}
            {field('cost', 'Pengeluaran kas tambahan per bulan (Rp)', { inputMode: 'numeric', required: true })}
          </>}
          {field('residual', 'Nilai jual aset di akhir proyek (Rp)', { inputMode: 'numeric', placeholder: '0 bila tidak ada' })}
          {field('months', 'Durasi (bulan)', { type: 'number', min: 1, max: 60, step: 1, required: true })}
          {field('annualDiscount', 'Tingkat diskonto efektif per tahun (%)', { type: 'number', min: 0, max: 1000, step: 'any', required: true })}
          {field('change', guided ? 'Perubahan volume tiap skenario (%)' : 'Perubahan penerimaan tiap skenario (%)', { type: 'number', min: 0, max: 100, step: 'any', required: true })}
        </div>
        {preview && <div className="notice" aria-live="polite">
          Penerimaan tambahan {rp(preview.sales)} · Penghematan {rp(preview.savings)} · Pengeluaran {rp(preview.cost)} · Kas bersih {rp(preview.net)} per bulan.
        </div>}
        <p className="small muted">{guided
          ? 'Skenario mengubah volume, sehingga penerimaan dan total biaya variabel ikut berubah. Biaya tetap dan penghematan tetap sama.'
          : 'Skenario mengubah penerimaan. Pengeluaran tetap memakai jumlah yang kamu isi.'}
          {' '}Masukkan biaya awal seperti pemasangan dan stok awal ke modal. Hindari menghitung penghematan yang sama dua kali.</p>
        {error && <div className="notice bad" role="alert">{error}</div>}
        <button className="primary" type="submit" disabled={saving}>Hitung Kelayakan</button>
      </form>
    </section>
    {result && <>
      <section className="panel">
        <h3>Hasil Simulasi</h3>
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
          <Tile label="Balik Modal" value={result.payback == null ? 'Belum tercapai' : 'Bulan ' + result.payback} sub="Bulan pertama saldo kumulatif mencapai nol atau positif" />
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
