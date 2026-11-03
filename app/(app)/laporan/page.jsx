'use client';
import { useState } from 'react';
import { useData } from '@/lib/useData';
import { Loading, Tile } from '@/components/ui';
import { rp, thisMonth, bulan, addMonthsYm, BLN } from '@/lib/format';

// Laporan berbasis kas: pendapatan = pembayaran terverifikasi pada bulan diterima,
// biaya = pengeluaran pada bulan dicatat.
export default function Laporan() {
  const d = useData();
  const [ym, setYm] = useState(thisMonth());
  if (!d.ready) return d.err ? <div className="notice bad">{d.err}</div> : <Loading />;

  const calc = (m) => {
    const pays = d.payments.filter((p) => p.status === 'terverifikasi' && p.paid_at.startsWith(m));
    let sewa = 0, tambahan = 0;
    for (const p of pays) { const i = d.invById.get(p.invoice_id); if (i?.kind === 'tambahan') tambahan += p.amount; else sewa += p.amount; }
    const ex = d.expenses.filter((x) => x.date.startsWith(m));
    const sum = (k) => ex.filter((x) => x.kind === k).reduce((s, x) => s + x.amount, 0);
    const ops = sum('operasional'), modal = sum('modal'), non = sum('non_operasional');
    const billed = d.invoices.filter((i) => i.status !== 'batal' && i.due_date.startsWith(m)).reduce((s, i) => s + i.amount, 0);
    return { sewa, tambahan, income: sewa + tambahan, ops, modal, non, laba: sewa + tambahan - ops, kas: sewa + tambahan - ops - modal - non, billed };
  };
  const r = calc(ym);
  const months = Array.from({ length: 6 }, (_, k) => addMonthsYm(ym, k - 5));
  const rows = months.map((m) => [m, calc(m)]);
  const margin = r.income > 0 ? Math.round((r.laba / r.income) * 100) : 0;
  const collect = r.billed > 0 ? Math.round((r.income / r.billed) * 100) : 0;

  return (
    <div className="stack">
      <div className="row between">
        <button className="sm" onClick={() => setYm(addMonthsYm(ym, -1))} aria-label="Bulan sebelumnya">‹</button>
        <h2>Laporan {bulan(ym)}</h2>
        <button className="sm" onClick={() => setYm(addMonthsYm(ym, 1))} disabled={ym >= thisMonth()} aria-label="Bulan berikutnya">›</button>
      </div>
      <div className="grid">
        <Tile tone="hero" label="Laba operasional" value={rp(r.laba)} sub={`Margin ${margin}%`} />
        <Tile label="Pendapatan" value={rp(r.income)} sub={`Tertagih ${collect}% dari tagihan bulan ini`} />
        <Tile label="Biaya operasional" value={rp(r.ops)} />
        <Tile label="Arus kas bersih" value={rp(r.kas)} sub="Setelah belanja modal & non-operasional" />
      </div>
      <section className="panel"><h3>Laba rugi</h3>
        <table><tbody>
          <tr><td>Pendapatan sewa</td><td className="n">{rp(r.sewa)}</td></tr>
          <tr><td>Pendapatan tagihan tambahan</td><td className="n">{rp(r.tambahan)}</td></tr>
          <tr><td><b>Total pendapatan</b></td><td className="n"><b>{rp(r.income)}</b></td></tr>
          <tr><td>Biaya operasional</td><td className="n">−{rp(r.ops)}</td></tr>
          <tr className="total"><td>Laba operasional</td><td className="n">{rp(r.laba)}</td></tr>
          <tr><td className="muted">Belanja modal / renovasi</td><td className="n muted">−{rp(r.modal)}</td></tr>
          <tr><td className="muted">Pengeluaran non-operasional</td><td className="n muted">−{rp(r.non)}</td></tr>
          <tr className="total"><td>Arus kas bersih</td><td className="n">{rp(r.kas)}</td></tr>
        </tbody></table>
      </section>
      <section className="panel"><h3>6 bulan terakhir</h3>
        <div style={{ overflowX: 'auto' }}><table>
          <thead><tr><th>Bulan</th><th className="n">Pendapatan</th><th className="n">Biaya</th><th className="n">Laba</th></tr></thead>
          <tbody>{rows.map(([m, x]) => (
            <tr key={m}><td>{BLN[+m.slice(5) - 1]} {m.slice(2, 4)}</td><td className="n">{rp(x.income)}</td><td className="n">{rp(x.ops)}</td><td className="n" style={{ color: x.laba < 0 ? 'var(--bad)' : undefined }}>{rp(x.laba)}</td></tr>
          ))}</tbody>
        </table></div>
        <p className="small muted" style={{ margin: 0 }}>Dihitung berbasis kas: pendapatan dicatat saat uang diterima, biaya saat dikeluarkan.</p>
      </section>
    </div>
  );
}
