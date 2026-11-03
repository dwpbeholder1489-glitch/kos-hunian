'use client';
import PageHelp from '@/components/PageHelp';
import { useState } from 'react';
import { useData } from '@/lib/useData';
import { Loading, Tile } from '@/components/ui';
import Locked from '@/components/Locked';
import { useKos } from '@/components/KosProvider';
import { hasPlan } from '@/lib/plan';
import { rp, tgl, thisMonth, bulan, addMonthsYm, BLN, METHOD } from '@/lib/format';

// Unduh CSV yang bisa dibuka Excel (pemisah titik koma untuk Excel berbahasa Indonesia)
function downloadCsv(name, rows) {
  const cell = (v) => { const s = v == null ? '' : String(v); return /[;"\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
  const csv = '\ufeff' + rows.map((r) => r.map(cell).join(';')).join('\r\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
}

// Laporan berbasis kas: pendapatan = pembayaran terverifikasi pada bulan diterima,
// biaya = pengeluaran pada bulan dicatat.
export default function Laporan() {
  const d = useData();
  const { kos } = useKos();
  const full = hasPlan(kos, 'standar');
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
  const perRoomMap = new Map();
  for (const p of d.payments) if (p.status === 'terverifikasi' && p.paid_at.startsWith(ym)) { const i = d.invById.get(p.invoice_id); const c = i ? d.roomCode(i.room_id) : '—'; perRoomMap.set(c, (perRoomMap.get(c) || 0) + p.amount); }
  const perRoom = [...perRoomMap.entries()].sort((a, b) => a[0].localeCompare(b[0], 'id', { numeric: true }));
  const exportReport = () => {
    const ms = Array.from({ length: 12 }, (_, k) => addMonthsYm(ym, k - 11));
    downloadCsv(`laporan-${kos.name}-${ym}.csv`, [
      ['Bulan', 'Pendapatan sewa', 'Pendapatan tambahan', 'Total pendapatan', 'Biaya operasional', 'Laba operasional', 'Belanja modal', 'Non-operasional', 'Arus kas bersih', 'Total ditagihkan'],
      ...ms.map((m) => { const x = calc(m); return [bulan(m), x.sewa, x.tambahan, x.income, x.ops, x.laba, x.modal, x.non, x.kas, x.billed]; }),
    ]);
  };
  const exportTx = () => {
    const rows = [['Tanggal', 'Jenis', 'Keterangan', 'Kamar', 'Penghuni', 'Metode', 'Masuk', 'Keluar']];
    for (const p of d.payments) if (p.status === 'terverifikasi' && p.paid_at.startsWith(ym)) { const i = d.invById.get(p.invoice_id); rows.push([p.paid_at, 'Pembayaran', i?.kind === 'tambahan' ? (i.description || 'Tagihan tambahan') : 'Sewa', i ? d.roomCode(i.room_id) : '', i ? d.occName(i.occupant_id) : '', METHOD[p.method], p.amount, '']); }
    for (const x of d.expenses) if (x.date.startsWith(ym)) rows.push([x.date, 'Pengeluaran', x.description || d.catById.get(x.category_id)?.name || '', '', '', '', '', x.amount]);
    rows.sort((a, b) => (a[0] === 'Tanggal' ? -1 : b[0] === 'Tanggal' ? 1 : a[0].localeCompare(b[0])));
    downloadCsv(`transaksi-${kos.name}-${ym}.csv`, rows);
  };
  const margin = r.income > 0 ? Math.round((r.laba / r.income) * 100) : 0;
  const collect = r.billed > 0 ? Math.round((r.income / r.billed) * 100) : 0;

  return (
    <div className="stack">
      <div className="row between">
        <button className="sm" onClick={() => setYm(addMonthsYm(ym, -1))} aria-label="Bulan sebelumnya">‹</button>
        <div className="row" style={{ justifyContent: 'center' }}><h2>Laporan {bulan(ym)}</h2><PageHelp page="laporan" /></div>
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
      {full ? (
        <>
        <section className="panel"><h3>6 bulan terakhir</h3>
          <div style={{ overflowX: 'auto' }}><table>
            <thead><tr><th>Bulan</th><th className="n">Pendapatan</th><th className="n">Biaya</th><th className="n">Laba</th></tr></thead>
            <tbody>{rows.map(([m, x]) => (
              <tr key={m}><td>{BLN[+m.slice(5) - 1]} {m.slice(2, 4)}</td><td className="n">{rp(x.income)}</td><td className="n">{rp(x.ops)}</td><td className="n" style={{ color: x.laba < 0 ? 'var(--bad)' : undefined }}>{rp(x.laba)}</td></tr>
            ))}</tbody>
          </table></div>
          <p className="small muted" style={{ margin: 0 }}>Dihitung berbasis kas: pendapatan dicatat saat uang diterima, biaya saat dikeluarkan.</p>
        </section>
          <section className="panel"><h3>Pendapatan per kamar · {bulan(ym)}</h3>
            <table><tbody>{perRoom.map(([code, v]) => <tr key={code}><td>{code}</td><td className="n">{rp(v)}</td></tr>)}</tbody></table>
            {perRoom.length === 0 && <p className="small muted" style={{ margin: 0 }}>Belum ada pembayaran bulan ini.</p>}
          </section>
          <section className="panel noprint"><h3>Ekspor</h3>
            <p className="small muted" style={{ margin: 0 }}>File CSV bisa dibuka langsung di Excel atau Google Sheets.</p>
            <div className="row">
              <button onClick={exportReport}>⬇ Laporan 12 bulan (Excel)</button>
              <button onClick={exportTx}>⬇ Transaksi {bulan(ym)} (Excel)</button>
              <button onClick={() => window.print()}>🖨 Cetak / simpan PDF</button>
            </div>
          </section>
        </>
      ) : (
        <Locked need="standar" title="Laporan lengkap, ekspor Excel & PDF" text="Lihat tren 6 bulan, pendapatan per kamar, dan unduh laporan untuk pembukuan dengan paket Standar." />
      )}
    </div>
  );
}
