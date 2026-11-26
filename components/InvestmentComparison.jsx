'use client';

import { useState } from 'react';
import { investmentScenarios, savedInvestmentInputs } from '@/lib/investmentSimulation';
import { rp } from '@/lib/format';

const format = new Intl.NumberFormat('id-ID', { maximumFractionDigits: 1 });
const pct = (value) => value == null ? '—' : format.format(value) + '%';
const payback = (value) => value == null ? 'Belum tercapai' : value + ' bulan';

export default function InvestmentComparison({ versions }) {
  const [first, setFirst] = useState(versions[0].id);
  const [second, setSecond] = useState(versions[1].id);
  const [scenario, setScenario] = useState(1);
  const a = versions.find((version) => version.id === first);
  const b = versions.find((version) => version.id === second);
  let comparison = null;
  let error = '';
  if (a && b && a.id !== b.id) {
    try {
      comparison = [a, b].map((version) => {
        const assumptions = savedInvestmentInputs(version);
        return { assumptions, result: investmentScenarios(assumptions, version.mode)[scenario] };
      });
    } catch (err) { error = err.message; }
  }
  const pick = (label, value, change, excluded) => <label>{label}<select value={value} onChange={(event) => change(event.target.value)}>
    <option value="">Pilih versi</option>
    {versions.map((version, index) => <option key={version.id} value={version.id} disabled={version.id === excluded}>
      {version.name} · {new Date(version.created_at).toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' })} · #{index + 1}
    </option>)}
  </select></label>;

  return <section className="panel">
    <h3>Bandingkan Simulasi Tersimpan</h3>
    <div className="grid">
      {pick('Versi A', first, setFirst, second)}
      {pick('Versi B', second, setSecond, first)}
      <label>Skenario<select value={scenario} onChange={(event) => setScenario(Number(event.target.value))}>
        <option value={0}>Lesu</option><option value={1}>Dasar</option><option value={2}>Optimistis</option>
      </select></label>
    </div>
    {error ? <p className="notice bad" role="alert">{error}</p> : !comparison ? <p className="small muted">Pilih dua versi yang berbeda.</p> : (() => {
      const [left, right] = comparison;
      const rows = [
        ['Modal awal', ({ assumptions }) => rp(Number(assumptions.capital))],
        ['Durasi', ({ assumptions }) => assumptions.months + ' bulan'],
        ['Diskonto tahunan', ({ assumptions }) => pct(Number(assumptions.annualDiscount))],
        ['Volume per bulan', ({ result }) => result.cash.volume == null ? '—' : format.format(result.cash.volume) + ' unit'],
        ['Penerimaan dan penghematan per bulan', ({ result }) => rp(result.cash.revenue)],
        ['Pengeluaran per bulan', ({ result }) => rp(result.cash.cost)],
        ['Kas bersih per bulan', ({ result }) => rp(result.cash.revenue - result.cash.cost)],
        ['NPV', ({ result }) => rp(result.npv)],
        ['ROI proyeksi', ({ result }) => pct(result.roi)],
        ['IRR tahunan', ({ result }) => pct(result.irr)],
        ['Balik modal', ({ result }) => payback(result.payback)],
      ];
      return <>
        {(left.assumptions.months !== right.assumptions.months || left.assumptions.annualDiscount !== right.assumptions.annualDiscount) &&
          <p className="notice small">Durasi atau diskonto berbeda. Perhatikan asumsi ini saat membandingkan NPV dan ROI.</p>}
        <div style={{ overflowX: 'auto', marginTop: 10 }}>
          <table className="g-table" style={{ width: '100%' }}>
            <caption>Hasil proyeksi skenario {left.result.name}</caption>
            <thead><tr><th scope="col">Metrik</th><th scope="col">Versi A</th><th scope="col">Versi B</th></tr></thead>
            <tbody>{rows.map(([label, value]) => <tr key={label}>
              <th scope="row" style={{ textAlign: 'left' }}>{label}</th><td>{value(left)}</td><td>{value(right)}</td>
            </tr>)}</tbody>
          </table>
        </div>
        <p className="small muted">Selisih NPV versi B terhadap A sebesar {rp(right.result.npv - left.result.npv)}.</p>
      </>;
    })()}
  </section>;
}
