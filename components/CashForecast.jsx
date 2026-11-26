'use client';
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { cashForecast, shiftDate } from '@/lib/cashForecast';
import { today, tgl, rp, parseRp, errMsg } from '@/lib/format';
import { Loading, Tile } from '@/components/ui';

export default function CashForecast({ kosId, ver, onAging }) {
  const asOf = today();
  const first = shiftDate(asOf, 1), last = shiftDate(asOf, 30);
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [delay, setDelay] = useState(0);
  const [cost, setCost] = useState('');
  const [costDate, setCostDate] = useState(first);

  useEffect(() => {
    let active = true;
    setData(null); setError('');
    async function load() {
      const cash = await supabase.rpc('acct_cashflow', { p_kos: kosId, p_from: asOf.slice(0, 7) + '-01', p_to: asOf });
      if (!active) return;
      if (cash.error) throw cash.error;
      if (!cash.data?.cocok || cash.data.saldo_akhir == null || !Number.isFinite(Number(cash.data.saldo_akhir))) throw new Error('Saldo kas dan bank belum dapat direkonsiliasi.');
      const open = (name, column) => supabase.rpc(name, { p_kos: kosId }, { count: 'exact' }).order('due_date').order(column);
      const [receivable, payable] = await Promise.all([open('receivable_open', 'sale_id'), open('payable_open', 'doc_id')]);
      for (const result of [receivable, payable]) {
        if (result.error) throw result.error;
        if (!Array.isArray(result.data) || result.count !== result.data.length) throw new Error('Rincian tagihan belum bisa dimuat lengkap.');
      }
      if (active) setData({ opening: Number(cash.data.saldo_akhir), receivables: receivable.data, payables: payable.data });
    }
    load().catch((err) => { if (active) setError(errMsg(err)); });
    return () => { active = false; };
  }, [kosId, ver, asOf]);

  if (error) return <div className="notice bad">Proyeksi kas belum tersedia. {error}</div>;
  if (!data) return <Loading />;
  const amount = parseRp(cost);
  const validCost = amount > 0 && costDate >= first && costDate <= last;
  const forecast = cashForecast({ ...data, today: asOf, delay, assumption: validCost ? { amount, date: costDate } : null });
  const activity = forecast.days.filter((day) => day.events.length);
  return <div className="stack">
    <section className="panel">
      <h3>Proyeksi Kas 30 Hari</h3>
      <p className="small muted">{tgl(first)} – {tgl(last)}. Piutang dan utang memakai sisa tagihan dari pembukuan dagang. Tagihan yang sudah lewat jatuh tempo dimulai dari hari pertama proyeksi. Proyeksi memakai tagihan tercatat dan asumsi biaya yang Anda masukkan. Penjualan baru serta biaya rutin di luar jadwal tersebut belum masuk.</p>
      <div className="grid">
        <Tile label="Saldo aktual" value={rp(data.opening)} sub={tgl(asOf) + ' · Kas & Bank'} />
        <Tile label="Perkiraan saldo akhir" value={rp(forecast.ending)} sub={tgl(last)} />
        <Tile label="Saldo terendah" value={rp(forecast.minimum.balance)} sub={tgl(forecast.minimum.date)} tone={forecast.shortfall ? 'bad' : ''} />
        {forecast.shortfall > 0 && <Tile label="Kebutuhan dana" value={rp(forecast.shortfall)} sub="Agar saldo terendah mencapai nol" tone="bad" />}
      </div>
      {forecast.firstShortfall && <p className="small" style={{ color: 'var(--bad)' }}>Saldo pertama kali diperkirakan negatif pada {tgl(forecast.firstShortfall.date)}.</p>}
      <ForecastChart days={forecast.days} />
      {forecast.missing > 0 && <div className="notice">{forecast.missing} tagihan tanpa jadwal valid belum masuk proyeksi. Periksa rincian utang dan piutang.</div>}
      <button className="sm ghost" onClick={onAging}>Buka Umur Piutang &amp; Utang</button>
    </section>
    <section className="panel">
      <h3>Simulasi</h3>
      <label>Piutang terlambat
        <select value={delay} onChange={(e) => setDelay(Number(e.target.value))}>
          <option value={0}>Tidak ada keterlambatan</option><option value={7}>7 hari</option><option value={14}>14 hari</option><option value={30}>30 hari</option>
        </select>
      </label>
      <div className="grid">
        <label>Pengeluaran tambahan (Rp)<input inputMode="numeric" value={cost} onChange={(e) => setCost(e.target.value)} placeholder="0" /></label>
        <label>Tanggal pengeluaran<input type="date" value={costDate} min={first} max={last} onChange={(e) => setCostDate(e.target.value)} /></label>
      </div>
      {cost && !validCost && <p className="small muted">Masukkan nominal positif dan tanggal dalam periode proyeksi.</p>}
    </section>
    <section className="panel">
      <h3>Rincian per Tanggal</h3>
      {activity.length === 0 && <p className="small muted">Belum ada jadwal kas yang masuk dalam 30 hari.</p>}
      <div className="list">{activity.map((day) => <details className="li" style={{ display: 'block' }} key={day.date}>
        <summary>{tgl(day.date)} · Saldo {rp(day.balance)}</summary>
        {day.events.map((event, index) => <div className="li small" key={index}>
          <span>{event.type} · {event.reference || 'Referensi belum tercatat'}</span><b>{rp(event.value)}</b>
        </div>)}
      </details>)}</div>
    </section>
  </div>;
}

function ForecastChart({ days }) {
  const min = Math.min(0, ...days.map((day) => day.balance));
  const max = Math.max(0, ...days.map((day) => day.balance));
  const range = max - min || 1;
  const zero = -min / range * 100;
  return <figure style={{ margin: '12px 0' }}>
    <figcaption className="small muted">Saldo akhir harian · Hijau: nol atau positif · Merah: negatif</figcaption>
    <div aria-hidden="true" style={{ position: 'relative', display: 'grid', gridTemplateColumns: 'repeat(30,minmax(0,1fr))', gap: 2, height: 86 }}>
      <span style={{ position: 'absolute', insetInline: 0, bottom: zero + '%', borderBottom: '1px solid var(--line)' }} />
      {days.map(({ date, balance }) => <div key={date} style={{ position: 'relative' }} title={tgl(date) + ' · ' + rp(balance)}>
        <span style={{ position: 'absolute', insetInline: 0, bottom: Math.min(zero, zero + balance / range * 100) + '%',
          height: Math.abs(balance) / range * 100 + '%', background: balance < 0 ? 'var(--bad)' : 'var(--good)' }} />
      </div>)}
    </div>
    <details className="small"><summary>Lihat saldo per hari</summary>
      <ul>{days.map(({ date, balance }) => <li key={date}>{tgl(date)} · {rp(balance)}</li>)}</ul>
    </details>
  </figure>;
}
