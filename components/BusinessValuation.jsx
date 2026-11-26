'use client';
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { valuationCashHistory } from '@/lib/valuationCashHistory';
import { valueBusiness, valuationSensitivity } from '@/lib/businessValuation';
import { addMonthsYm, monthEnd, rp, today, tgl } from '@/lib/format';
import { Tile } from '@/components/ui';

const initial = { firstCashFlow: '', growth: '5', years: '5', discount: '15', terminalGrowth: '2', excessCash: '0', debt: '0' };
const percentage = new Intl.NumberFormat('id-ID', { maximumFractionDigits: 2 });
const pct = (number) => percentage.format(number) + '%';

export default function BusinessValuation({ kosId, ver, closedMonths, onOpenCash }) {
  const [values, setValues] = useState(initial);
  const [calculation, setCalculation] = useState(null);
  const [choice, setChoice] = useState([1, 1]);
  const [error, setError] = useState('');
  const [history, setHistory] = useState(null);
  const [usingHistory, setUsingHistory] = useState(false);
  const currentMonth = today().slice(0, 7);
  const from = addMonthsYm(currentMonth, -12) + '-01';
  const to = monthEnd(addMonthsYm(currentMonth, -1));
  const closedCount = new Set(closedMonths || []);
  const reviewed = Array.from({ length: 12 }, (_, index) => addMonthsYm(currentMonth, -1 - index))
    .filter((month) => closedCount.has(month)).length;
  useEffect(() => {
    let active = true;
    setHistory(null);
    supabase.rpc('acct_cashflow', { p_kos: kosId, p_from: from, p_to: to }).then(({ data, error }) => {
      if (!active) return;
      if (error) setHistory({ message: 'Arus kas historis belum bisa dimuat.' });
      else if (!data?.lengkap) setHistory({ message: 'Rincian kas operasi dan investasi mengikuti akses Laporan Arus Kas sesuai paket.' });
      else if (!data.cocok) setHistory({ message: 'Arus kas belum cocok dengan perubahan saldo kas dan bank. Periksa pembukuan sebelum mengisi valuasi.' });
      else setHistory({ baseline: valuationCashHistory(data) });
    }).catch(() => { if (active) setHistory({ message: 'Arus kas historis belum bisa dimuat.' }); });
    return () => { active = false; };
  }, [kosId, ver, from, to]);
  const baseline = history?.baseline;
  const useBaseline = () => {
    setValues((current) => ({ ...current, firstCashFlow: String(baseline.reference) }));
    setUsingHistory(true); setCalculation(null); setError('');
  };
  const field = (key, name, options) => <label>{name}
    <input {...options} required value={values[key]} onChange={(e) => {
      setValues((current) => ({ ...current, [key]: e.target.value }));
      if (key === 'firstCashFlow') setUsingHistory(false);
      setCalculation(null); setError('');
    }} />
  </label>;

  function calculate(e) {
    e.preventDefault();
    try {
      const amounts = ['firstCashFlow', 'excessCash', 'debt'];
      if (amounts.some((key) => !/^\d{1,13}$/.test(values[key]) || Number(values[key]) > 1e12)) {
        throw new Error('Isi arus kas, kas berlebih, dan utang dalam rupiah bulat. Batas tiap nilai Rp1 triliun.');
      }
      const assumptions = Object.fromEntries(Object.entries(values).map(([key, value]) => [key, Number(value)]));
      const base = valueBusiness(assumptions);
      const matrix = valuationSensitivity(assumptions);
      const estimates = matrix.flatMap((row) => row.cells.flatMap((cell) => cell.result ? [cell.result.equity] : []));
      setCalculation({ assumptions, base, matrix, low: Math.min(...estimates), high: Math.max(...estimates), date: today() });
      setChoice([1, 1]);
    } catch (err) { setError(err.message); }
  }

  const selectedRow = calculation?.matrix[choice[0]];
  const selectedCell = selectedRow?.cells[choice[1]];
  const result = selectedCell?.result;
  return <div className="stack">
    <section className="panel">
      <h3>Arus Kas dari Pembukuan</h3>
      <p className="small muted">{tgl(from)} – {tgl(to)} · 12 bulan kalender yang sudah lewat · {reviewed}/12 bulan ditutup di Pembukuan.</p>
      {!history && <p className="small muted" role="status">Memuat arus kas historis…</p>}
      {history && !baseline && <p className="small muted">{history.message || 'Rincian arus kas historis belum cukup untuk membuat angka acuan.'}</p>}
      {baseline && <>
        <div className="grid">
          <Tile label="Arus Kas Operasi Aktual" value={rp(baseline.operationCash)} />
          <Tile label="Kas Keluar Investasi Aset Tetap" value={rp(baseline.assetSpend)} />
          <Tile label="Acuan Arus Kas Tahun Pertama" value={rp(baseline.reference)} sub="Arus kas operasi − kas keluar investasi" />
        </div>
        <p className="small muted">Periksa kelengkapan transaksi, biaya bunga, dan pengeluaran satu kali. Sesuaikan angka acuan untuk kebutuhan usaha tahun depan.</p>
        {baseline.reference > 1e12 ? <p className="small muted">Angka acuan melampaui batas input kalkulator (Rp1 triliun).</p>
          : baseline.reference > 0 ? <button type="button" className="sm" onClick={useBaseline}>Gunakan Angka dari Pembukuan</button>
          : <p className="small muted">Acuan nol atau negatif. Model ini membutuhkan proyeksi arus kas tahun pertama yang positif.</p>}
      </>}
      <button type="button" className="sm ghost" onClick={onOpenCash}>Buka Laporan Arus Kas</button>
    </section>
    <section className="panel">
      <h3>Valuasi Bisnis (DCF)</h3>
      <p className="small muted">Estimasi nilai dari arus kas bebas usaha yang diproyeksikan. Masukkan kas setelah pajak operasi, belanja modal, dan perubahan modal kerja, sebelum bunga atau pembayaran pokok utang.</p>
      <form className="stack" onSubmit={calculate}>
        <div className="grid">
          {field('firstCashFlow', 'Arus kas bebas tahun pertama (Rp)', { inputMode: 'numeric', placeholder: 'Contoh 100000000' })}
          {field('growth', 'Pertumbuhan arus kas per tahun (%)', {type:'number', min:-99, max:100, step:0.01})}
          {field('years', 'Periode proyeksi (tahun)', {type:'number', min:1, max:10, step:1})}
          {field('discount', 'Tingkat diskonto per tahun (%)', {type:'number', min:0.01, max:100, step:0.01})}
          {field('terminalGrowth', 'Pertumbuhan setelah periode proyeksi (%)', {type:'number', min:-99, max:50, step:0.01})}
          {field('excessCash', 'Kas berlebih di luar kebutuhan operasi (Rp)', {inputMode:'numeric'})}
          {field('debt', 'Utang berbunga (Rp)', {inputMode:'numeric'})}
        </div>
        <p className="small muted">Model memakai arus kas akhir tahun. Tingkat diskonto harus lebih tinggi dari pertumbuhan terminal. Pertumbuhan, diskonto, kas berlebih, dan utang tetap mengikuti asumsi yang kamu tinjau.</p>
        {usingHistory && <p className="small muted">Arus kas tahun pertama diisi dari angka acuan historis dan bisa disesuaikan.</p>}
        {error && <div className="notice bad" role="alert">{error}</div>}
        <button className="primary">Hitung Valuasi</button>
      </form>
    </section>
    {calculation && <>
      <section className="panel">
        <h3>Estimasi Nilai · {tgl(calculation.date)}</h3>
        <div className="grid">
          <Tile label="Nilai Usaha" value={rp(calculation.base.enterprise)} sub="Enterprise value skenario dasar" />
          <Tile label="Nilai Ekuitas" value={rp(calculation.base.equity)} sub="Nilai usaha + kas berlebih − utang berbunga" />
          <Tile label="Rentang Nilai Ekuitas" value={calculation.low === calculation.high ? rp(calculation.low) : rp(calculation.low) + ' – ' + rp(calculation.high)} sub="Dari kombinasi sensitivitas yang valid" />
        </div>
        <p className="small muted">Rentang ini bergantung pada asumsi. Kasus dengan ekuitas negatif mencerminkan model dan struktur utang yang dimasukkan.</p>
      </section>
      <section className="panel">
        <h3>Sensitivitas DCF</h3>
        <p className="small muted">Ketuk nilai ekuitas untuk melihat rincian model. Baris mengubah diskonto ±2 poin persentase dan kolom mengubah pertumbuhan terminal ±1 poin persentase. Sel kosong berarti kombinasi tidak berlaku.</p>
        <div style={{ overflowX: 'auto' }}><table className="g-table">
          <thead><tr><th scope="col">Diskonto</th>{calculation.matrix[0].cells.map((cell) => <th scope="col" key={cell.terminalGrowth}>{pct(cell.terminalGrowth)}</th>)}</tr></thead>
          <tbody>{calculation.matrix.map((row, i) => <tr key={row.discount}>
            <th scope="row">{pct(row.discount)}</th>
            {row.cells.map((cell, j) => <td key={cell.terminalGrowth}>{cell.result ? <button className="sm ghost" type="button"
              aria-pressed={choice[0] === i && choice[1] === j}
              onClick={() => setChoice([i, j])}>{rp(cell.result.equity)}</button> : '—'}</td>)}
          </tr>)}</tbody>
        </table></div>
      </section>
      {result && <section className="panel">
        <h3>Rincian DCF · Diskonto {pct(selectedRow.discount)} · Pertumbuhan terminal {pct(selectedCell.terminalGrowth)}</h3>
        <div className="list">
          {result.annual.map((row) => <div className="li small" key={row.year}><span>Tahun {row.year} · {rp(row.cashFlow)}</span><b>Nilai kini {rp(row.presentValue)}</b></div>)}
          <div className="li small"><span>Nilai kini periode proyeksi</span><b>{rp(result.explicitPv)}</b></div>
          <div className="li small"><span>Nilai kini terminal</span><b>{rp(result.terminalPv)}</b></div>
          <div className="li small"><span>Nilai usaha</span><b>{rp(result.enterprise)}</b></div>
          <div className="li small"><span>Kas berlebih</span><b>{rp(calculation.assumptions.excessCash)}</b></div>
          <div className="li small"><span>Utang berbunga</span><b>{rp(-calculation.assumptions.debt)}</b></div>
          <div className="li"><span>Nilai ekuitas</span><b>{rp(result.equity)}</b></div>
        </div>
      </section>}
    </>}
  </div>;
}
