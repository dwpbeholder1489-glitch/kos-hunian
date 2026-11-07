'use client';
import PageHelp from '@/components/PageHelp';
import { useState } from 'react';
import { useData } from '@/lib/useData';
import { Loading, Tile } from '@/components/ui';
import Locked from '@/components/Locked';
import { useKos } from '@/components/KosProvider';
import { hasFeature } from '@/lib/plan';
import { rp, tgl, thisMonth, bulan, addMonthsYm, BLN, METHOD, ENTRY } from '@/lib/format';

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
  const full = hasFeature(kos, 'laporan_lengkap');
  const [ym, setYm] = useState(thisMonth());
  if (!d.ready) return d.err ? <div className="notice bad">{d.err}</div> : <Loading />;

  const calc = (m) => {
    const pays = d.payments.filter((p) => p.status === 'terverifikasi' && p.paid_at.startsWith(m));
    // deposit: bukan pendapatan saat diterima; potongan untuk tagihan/kerusakan = pendapatan tanpa uang masuk baru
    const dep = (d.deposits || []).filter((x) => x.status === 'aktif' && x.date.startsWith(m));
    const depIn = dep.filter((x) => x.kind === 'terima' && !x.booking_id).reduce((s, x) => s + x.amount, 0); // dari DP booking: uangnya sudah masuk saat booking
    const depOut = dep.filter((x) => x.kind === 'kembali').reduce((s, x) => s + x.amount, 0);
    const depCut = dep.filter((x) => x.kind === 'potong' && !x.payment_id).reduce((s, x) => s + x.amount, 0);
    const depPaid = pays.filter((p) => p.method === 'deposit').reduce((s, p) => s + p.amount, 0);
    // booking: DP = uang masuk (titipan), pengembalian = uang keluar, DP hangus = pendapatan lain tanpa uang masuk baru
    const bks = d.bookings || [];
    const bkIn = bks.filter((b) => b.dp_amount > 0 && (b.dp_date || '').startsWith(m)).reduce((s, b) => s + b.dp_amount, 0);
    const bkRefund = bks.filter((b) => b.status === 'batal' && (b.closed_date || '').startsWith(m)).reduce((s, b) => s + b.refund_amount, 0);
    const bkForfeit = bks.filter((b) => b.status === 'batal' && (b.closed_date || '').startsWith(m)).reduce((s, b) => s + b.forfeit_amount, 0);
    let sewa = 0, tambahan = 0;
    for (const p of pays) { const i = d.invById.get(p.invoice_id); if (i?.kind === 'tambahan') tambahan += p.amount; else sewa += p.amount; }
    const ex = d.expenses.filter((x) => x.date.startsWith(m));
    const sum = (k) => ex.filter((x) => x.kind === k).reduce((s, x) => s + x.amount, 0);
    const ops = sum('operasional'), modal = sum('modal'), non = sum('non_operasional');
    const billed = d.invoices.filter((i) => i.status !== 'batal' && i.due_date.startsWith(m)).reduce((s, i) => s + i.amount, 0);
    const en = (k) => d.entries.filter((x) => x.kind === k && x.date.startsWith(m)).reduce((s, x) => s + x.amount, 0);
    const lain = en('pendapatan_lain'), prive = en('prive'), modalIn = en('setoran_modal'), loanIn = en('pinjaman_masuk'), loanOut = en('bayar_pinjaman');
    const income = sewa + tambahan + lain + depCut + bkForfeit;
    const laba = income - ops;
    return { sewa, tambahan, lain, depCut, depIn, depOut, depPaid, bkIn, bkRefund, bkForfeit, income, ops, modal, non, laba, prive, modalIn, loanIn, loanOut,
      kas: laba - modal - non - prive + modalIn + loanIn - loanOut - depPaid - depCut + depIn - depOut + bkIn - bkRefund - bkForfeit, billed };
  };
  const r = calc(ym);
  const months = Array.from({ length: 6 }, (_, k) => addMonthsYm(ym, k - 5));
  const rows = months.map((m) => [m, calc(m)]);
  // per kamar: diterima bulan ini (sewa & tambahan) dan sisa belum dibayar saat ini
  const perRoomMap = new Map(d.rooms.map((x) => [x.id, { code: x.code, sewa: 0, tambahan: 0, sisa: 0, tenant: d.activeByRoom.get(x.id) }]));
  for (const p of d.payments) if (p.status === 'terverifikasi' && p.paid_at.startsWith(ym)) { const i = d.invById.get(p.invoice_id); const x = i && perRoomMap.get(i.room_id); if (x) x[i.kind === 'tambahan' ? 'tambahan' : 'sewa'] += p.amount; }
  for (const i of d.invoices) if (i.status !== 'batal' && i.outstanding > 0) { const x = perRoomMap.get(i.room_id); if (x) x.sisa += i.outstanding; }
  const perRoom = [...perRoomMap.values()].sort((a, b) => a.code.localeCompare(b.code, 'id', { numeric: true }));
  const exportReport = () => {
    const ms = Array.from({ length: 12 }, (_, k) => addMonthsYm(ym, k - 11));
    downloadCsv(`laporan-${kos.name}-${ym}.csv`, [
      ['Bulan', 'Pendapatan sewa', 'Pendapatan tambahan', 'Pendapatan lain', 'Potongan deposit', 'Total pendapatan', 'Biaya operasional', 'Laba operasional', 'Belanja modal', 'Non-operasional', 'Diambil pemilik (prive)', 'Setoran modal', 'Pinjaman diterima', 'Bayar pinjaman', 'Deposit diterima', 'Deposit dikembalikan', 'Dibayar dari deposit', 'DP booking diterima', 'DP booking dikembalikan', 'DP booking hangus', 'Arus kas bersih', 'Total ditagihkan'],
      ...ms.map((m) => { const x = calc(m); return [bulan(m), x.sewa, x.tambahan, x.lain, x.depCut, x.income, x.ops, x.laba, x.modal, x.non, x.prive, x.modalIn, x.loanIn, x.loanOut, x.depIn, x.depOut, x.depPaid + x.depCut, x.bkIn, x.bkRefund, x.bkForfeit, x.kas, x.billed]; }),
    ]);
  };
  const exportTx = () => {
    const rows = [['Tanggal', 'Jenis', 'Keterangan', 'Kamar', 'Penghuni', 'Metode', 'Masuk', 'Keluar']];
    for (const p of d.payments) if (p.status === 'terverifikasi' && p.paid_at.startsWith(ym)) { const i = d.invById.get(p.invoice_id); rows.push([p.paid_at, 'Pembayaran', i?.kind === 'tambahan' ? (i.description || 'Tagihan tambahan') : 'Sewa', i ? d.roomCode(i.room_id) : '', i ? d.occName(i.occupant_id) : '', METHOD[p.method], p.amount, '']); }
    for (const x of d.expenses) if (x.date.startsWith(ym)) rows.push([x.date, 'Pengeluaran', x.description || d.catById.get(x.category_id)?.name || '', '', '', '', '', x.amount]);
    for (const x of d.deposits || []) if (x.status === 'aktif' && x.date.startsWith(ym)) rows.push([x.date, x.kind === 'terima' ? (x.booking_id ? 'Deposit dari DP booking (bukan uang masuk baru)' : 'Deposit diterima') : x.kind === 'kembali' ? 'Deposit dikembalikan' : 'Deposit dipotong', x.reason || '', d.roomCode(d.leases.find((l) => l.id === x.lease_id)?.room_id), d.occName(x.occupant_id), x.account || '', x.kind === 'terima' && !x.booking_id ? x.amount : '', x.kind === 'kembali' ? x.amount : '']);
    for (const b of d.bookings || []) {
      if (b.dp_amount > 0 && (b.dp_date || '').startsWith(ym)) rows.push([b.dp_date, 'DP booking diterima', b.number, d.roomCode(b.room_id), b.name, b.dp_account, b.dp_amount, '']);
      if (b.status === 'batal' && b.refund_amount > 0 && (b.closed_date || '').startsWith(ym)) rows.push([b.closed_date, 'DP booking dikembalikan', b.number, d.roomCode(b.room_id), b.name, b.refund_account, '', b.refund_amount]);
    }
    for (const x of d.entries) if (x.date.startsWith(ym)) { const [l, , dir] = ENTRY[x.kind]; rows.push([x.date, l, x.description || '', '', '', '', dir === 'in' ? x.amount : '', dir === 'out' ? x.amount : '']); }
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
        <Tile label="Arus kas bersih" value={rp(r.kas)} sub="Setelah modal, prive & lainnya" />
      </div>
      <section className="panel"><h3>Laba rugi</h3>
        <table><tbody>
          <tr><td>Pendapatan sewa</td><td className="n">{rp(r.sewa)}</td></tr>
          <tr><td>Pendapatan tagihan tambahan</td><td className="n">{rp(r.tambahan)}</td></tr>
          {r.lain > 0 && <tr><td>Pendapatan lain</td><td className="n">{rp(r.lain)}</td></tr>}
          {r.depCut > 0 && <tr><td>Potongan deposit (ganti rugi)</td><td className="n">{rp(r.depCut)}</td></tr>}
          {r.bkForfeit > 0 && <tr><td>DP booking hangus</td><td className="n">{rp(r.bkForfeit)}</td></tr>}
          <tr><td><b>Total pendapatan</b></td><td className="n"><b>{rp(r.income)}</b></td></tr>
          <tr><td>Biaya operasional</td><td className="n">−{rp(r.ops)}</td></tr>
          <tr className="total"><td>Laba operasional</td><td className="n">{rp(r.laba)}</td></tr>
          <tr><td className="muted">Belanja modal / renovasi</td><td className="n muted">−{rp(r.modal)}</td></tr>
          <tr><td className="muted">Pengeluaran non-operasional</td><td className="n muted">−{rp(r.non)}</td></tr>
          <tr><td className="muted">Diambil pemilik (prive, bukan biaya)</td><td className="n muted">−{rp(r.prive)}</td></tr>
          {r.modalIn > 0 && <tr><td className="muted">Setoran modal pemilik</td><td className="n muted">+{rp(r.modalIn)}</td></tr>}
          {(r.loanIn > 0 || r.loanOut > 0) && <tr><td className="muted">Pinjaman (diterima − dibayar)</td><td className="n muted">{rp(r.loanIn - r.loanOut)}</td></tr>}
          {r.depIn > 0 && <tr><td className="muted">Deposit diterima (titipan, bukan pendapatan)</td><td className="n muted">+{rp(r.depIn)}</td></tr>}
          {r.depOut > 0 && <tr><td className="muted">Deposit dikembalikan</td><td className="n muted">−{rp(r.depOut)}</td></tr>}
          {r.bkIn > 0 && <tr><td className="muted">DP booking diterima (titipan)</td><td className="n muted">+{rp(r.bkIn)}</td></tr>}
          {r.bkRefund > 0 && <tr><td className="muted">DP booking dikembalikan</td><td className="n muted">−{rp(r.bkRefund)}</td></tr>}
          {r.depPaid + r.depCut + r.bkForfeit > 0 && <tr><td className="muted">Dari deposit/DP (tidak ada uang masuk baru)</td><td className="n muted">−{rp(r.depPaid + r.depCut + r.bkForfeit)}</td></tr>}
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
            <div style={{ overflowX: 'auto' }}><table>
              <thead><tr><th>Kamar</th><th className="n">Sewa</th><th className="n">Tambahan</th><th className="n">Sisa</th></tr></thead>
              <tbody>{perRoom.map((x) => <tr key={x.code}><td>{x.code}{x.tenant ? '' : <span className="muted"> · kosong</span>}</td><td className="n">{rp(x.sewa)}</td><td className="n">{rp(x.tambahan)}</td><td className="n" style={{ color: x.sisa > 0 ? 'var(--bad)' : undefined }}>{rp(x.sisa)}</td></tr>)}</tbody>
              <tfoot><tr className="total"><td>Total</td><td className="n">{rp(perRoom.reduce((s, x) => s + x.sewa, 0))}</td><td className="n">{rp(perRoom.reduce((s, x) => s + x.tambahan, 0))}</td><td className="n">{rp(perRoom.reduce((s, x) => s + x.sisa, 0))}</td></tr></tfoot>
            </table></div>
            <p className="small muted" style={{ margin: 0 }}>Tambahan = listrik/air dari Meteran dan tagihan tambahan lain. Sisa = semua tagihan kamar itu yang belum dibayar saat ini.</p>
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
