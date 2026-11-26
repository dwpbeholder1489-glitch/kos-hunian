'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { investmentActuals } from '@/lib/investmentActuals';
import { errMsg, rp, today, tgl, bulan } from '@/lib/format';
import { Tile } from '@/components/ui';

export default function InvestmentActualTracking({ kosId, versionId, plan }) {
  const currentMonth = today().slice(0, 7);
  const [month, setMonth] = useState(currentMonth);
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('operating');
  const [tracking, setTracking] = useState(undefined);
  const [candidates, setCandidates] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const rpc = (p_action, p_data = {}) => supabase.rpc('acct_investment_actual', { p_kos: kosId, p_version: versionId, p_action, p_data });

  useEffect(() => {
    let active = true;
    rpc('read').then(({ data, error }) => {
      if (!active) return;
      if (error) setError(error.code === 'PGRST202' ? 'Pelacakan menunggu pembaruan database.' : errMsg(error));
      else setTracking(data);
    });
    return () => { active = false; };
  }, [kosId, versionId]);

  async function action(name, data) {
    setBusy(true); setError('');
    try {
      const response = await rpc(name, data);
      if (response.error) throw response.error;
      if (name === 'candidates') setCandidates(response.data);
      else {
        setTracking(response.data);
        setCandidates(null);
      }
    } catch (error) { setError(errMsg(error)); }
    finally { setBusy(false); }
  }

  const stats = tracking && investmentActuals({ startMonth: tracking.start_month, asOf: tracking.as_of, entries: tracking.entries, plan });
  const notStarted = tracking === null;
  const validMonth = /^\d{4}-\d{2}$/.test(month) && month <= currentMonth && (!tracking || month >= tracking.start_month.slice(0, 7));

  return <section className="panel">
    <h3>Realisasi Investasi vs Rencana</h3>
    {error && <p className="notice bad" role="alert">{error}</p>}
    {tracking === undefined && !error && <p className="small muted">Memuat pelacakan…</p>}
    {notStarted && <>
      <p className="small muted">Gunakan versi tersimpan ini sebagai acuan skenario Dasar. Pilih bulan yang mencakup pembelian aset dan awal rencana. Bulan mulai dikunci untuk versi ini.</p>
      <label>Bulan mulai<input type="month" value={month} max={currentMonth} onChange={(e) => setMonth(e.target.value)} /></label>
      <button className="sm" type="button" disabled={busy || !validMonth} onClick={() => action('start', { month: month + '-01' })}>Tetapkan Rencana Acuan</button>
    </>}
    {stats && <>
      <p className="small muted">Acuan skenario Dasar mulai {bulan(tracking.start_month.slice(0, 7))}. Aktual sampai {tgl(tracking.as_of)} memakai jurnal Kas dan Bank yang ditautkan.</p>
      <div className="grid">
        <Tile label="Modal Rencana" value={rp(-plan.series[0].flow)} />
        <Tile label="Modal Aktual Tertaut" value={rp(stats.amountInvested)} />
        <Tile label="Kas Operasi Aktual Tertaut" value={rp(stats.operatingCash)} />
        <Tile label="Modal Sudah Kembali" value={stats.recovered == null ? '—' : rp(stats.recovered)}
          sub={stats.recovered == null ? 'Tautkan pengeluaran modal' : stats.recovered >= stats.amountInvested ? 'Kas operasi tertaut sudah menutup modal' : stats.estimatedPayback == null ? 'Belum terproyeksi kembali dalam durasi rencana' : 'Perkiraan balik modal pada bulan ke-' + stats.estimatedPayback} />
      </div>
      {stats.cumulativeVariance != null && <p className="small">Selisih kas kumulatif untuk {stats.comparedMonths} bulan dengan transaksi operasi tertaut: <b>{rp(stats.cumulativeVariance)}</b>.</p>}
      <p className="small muted">Estimasi memakai kas tertaut sampai hari ini dan arus kas rencana mulai bulan berikutnya. Selisih bulanan tersedia untuk bulan lampau dengan transaksi operasi tertaut.</p>
      <div style={{ overflowX: 'auto' }}>
        <table className="g-table">
          <caption>Kas operasi bulanan di luar pengeluaran modal awal</caption>
          <thead><tr><th scope="col">Bulan</th><th scope="col">Rencana</th><th scope="col">Aktual tertaut</th><th scope="col">Selisih</th></tr></thead>
          <tbody>{stats.rows.map((row) => <tr key={row.month}>
            <th scope="row">{bulan(row.month)}{row.partial ? ' · Berjalan' : ''}</th>
            <td>{row.planned == null ? '—' : rp(row.planned)}</td>
            <td>{row.observed?.entries.some((entry) => entry.category === 'operating') ? rp(row.observed.operating) : '—'}</td>
            <td>{row.difference == null ? '—' : rp(row.difference)}</td>
          </tr>)}</tbody>
        </table>
      </div>
      <h4>Transaksi Kas Tertaut</h4>
      {!tracking.entries.length && <p className="small muted">Belum ada transaksi tertaut. Cari jurnal di bawah untuk mulai.</p>}
      <div className="list">{tracking.entries.map((entry) => <div className="li" key={entry.id}>
        <span>{tgl(entry.entry_date)} · {entry.number} · {entry.description}<br /><small>{entry.category === 'capital' ? 'Modal' : 'Operasi'} · {rp(entry.amount)}</small></span>
        <button className="sm ghost" type="button" disabled={busy} onClick={() => {
          if (window.confirm('Lepas tautan transaksi ini beserta koreksinya dari pelacakan?')) action('unlink', { entry_id: entry.id });
        }}>Lepas</button>
      </div>)}</div>
      <h4>Tautkan Jurnal</h4>
      <p className="small muted">Seluruh mutasi kas dari satu sumber ditautkan ke satu rencana. Pilih transaksi yang memang terkait, seperti pembelian kulkas atau penjualan minuman. Koreksi dan pembalikan dari sumber yang sama ikut terbaca.</p>
      <form className="stack" onSubmit={(e) => { e.preventDefault(); if (validMonth) action('candidates', { month: month + '-01', query }); }}>
        <div className="grid">
          <label>Bulan pencarian<input type="month" value={month} min={tracking.start_month.slice(0, 7)} max={currentMonth}
            onChange={(e) => { setMonth(e.target.value); setCandidates(null); }} /></label>
          <label>Nomor atau keterangan jurnal<input maxLength={100} value={query} onChange={(e) => setQuery(e.target.value)} /></label>
          <label>Kategori ketika ditautkan<select value={category} onChange={(e) => setCategory(e.target.value)}>
            <option value="operating">Penerimaan atau biaya operasi</option><option value="capital">Pembelian aset atau modal awal</option>
          </select></label>
        </div>
        <button className="sm ghost" disabled={busy || !validMonth}>Cari Jurnal Kas</button>
      </form>
      {candidates && <div className="list">
        <p className="small muted">{candidates.length ? 'Menampilkan hingga 50 jurnal terbaru. Persempit dengan nomor atau keterangan.' : 'Tidak ada jurnal kas yang cocok.'}</p>
        {candidates.map((entry) => <div className="li" key={entry.id}>
          <span>{tgl(entry.entry_date)} · {entry.number} · {entry.description}<br /><b>{rp(entry.amount)}</b></span>
          <button className="sm" type="button" disabled={busy} onClick={() => action('link', { entry_id: entry.id, category })}>Tautkan</button>
        </div>)}
      </div>}
    </>}
  </section>;
}
