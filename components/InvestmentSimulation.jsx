'use client';
import { useState } from 'react';
import { simulateInvestment } from '@/lib/investmentSimulation';
import { parseRp, rp } from '@/lib/format';
import { Tile } from '@/components/ui';

const INITIAL = { capital: '', revenue: '', cost: '', months: '12', annualDiscount: '12', residual: '', change: '20' };
const pct = new Intl.NumberFormat('id-ID', { maximumFractionDigits: 1 });

export default function InvestmentSimulation() {
  const [values, setValues] = useState(INITIAL);
  const [selected, setSelected] = useState(1);
  const [scenarios, setScenarios] = useState(null);
  const [error, setError] = useState('');
  const update = (key, value) => {
    setValues((current) => ({ ...current, [key]: value }));
    setScenarios(null); setError('');
  };
  const field = (key, label, options = {}) => <label>{label}<input {...options}
    value={values[key]} onChange={(event) => update(key, event.target.value)} /></label>;

  function calculate(event) {
    event.preventDefault();
    try {
      const capital = parseRp(values.capital);
      const revenue = parseRp(values.revenue) || 0;
      const cost = parseRp(values.cost) || 0;
      const residual = parseRp(values.residual) || 0;
      const months = Number(values.months);
      const annualDiscount = Number(values.annualDiscount);
      const change = Number(values.change) / 100;
      if (![values.capital, values.revenue, values.cost, values.residual].every((x) => /^\d*$/.test(x)) ||
          !Number.isSafeInteger(capital) || ![revenue,cost,residual].every(Number.isSafeInteger) ||
          [capital,revenue,cost,residual].some((value) => value > 1e12) ||
          !Number.isFinite(change) || change < 0 || change > 1 || annualDiscount > 1000) {
        throw new Error('Masukkan nominal dalam angka bulat hingga Rp1 triliun. Perubahan skenario maksimal 100%.');
      }
      const variants = [['Lesu', 1 - change], ['Dasar', 1], ['Optimistis', 1 + change]];
      setScenarios(variants.map(([name, factor]) => ({ name, ...simulateInvestment({
        capital, revenue: Math.round(revenue * factor), cost, residual, months, annualDiscount,
      }) })));
      setSelected(1);
    } catch (err) {
      setError(err.message);
    }
  }

  const result = scenarios?.[selected];
  return <div className="stack">
    <section className="panel">
      <h3>Simulasi Kelayakan Investasi</h3>
      <p className="small muted">Uji ekspansi, pembelian alat, atau proyek baru dari perkiraan kas tambahan. Simulasi ini tidak mengubah pembukuan.</p>
      <form className="stack" onSubmit={calculate}>
        <div className="grid">
          {field('capital', 'Modal awal (Rp)', { inputMode: 'numeric', required: true, placeholder: 'Contoh 25000000' })}
          {field('revenue', 'Penerimaan kas tambahan per bulan (Rp)', { inputMode: 'numeric', required: true })}
          {field('cost', 'Pengeluaran kas tambahan per bulan (Rp)', { inputMode: 'numeric', required: true })}
          {field('residual', 'Nilai jual aset di akhir proyek (Rp)', { inputMode: 'numeric', placeholder: '0 bila tidak ada' })}
          {field('months', 'Durasi (bulan)', { type: 'number', min: 1, max: 60, step: 1, required: true })}
          {field('annualDiscount', 'Tingkat diskonto efektif per tahun (%)', { type: 'number', min: 0, max: 1000, step: 'any', required: true })}
          {field('change', 'Perubahan penerimaan tiap skenario (%)', { type: 'number', min: 0, max: 100, step: 'any', required: true })}
        </div>
        <p className="small muted">Skenario lesu dan optimistis menurunkan atau menaikkan penerimaan sesuai persentase. Biaya tetap sama. Masukkan pajak, biaya rutin, dan kebutuhan modal kerja yang relevan ke asumsi arus kas Anda.</p>
        {error && <div className="notice bad" role="alert">{error}</div>}
        <button className="primary" type="submit">Hitung Kelayakan</button>
      </form>
    </section>
    {result && <>
      <section className="panel">
        <h3>Hasil Simulasi</h3>
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
          <b>{scenario.name}</b><span className="small">NPV {rp(scenario.npv)} · ROI {pct.format(scenario.roi)}%</span>
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
