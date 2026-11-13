'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { useKos } from '@/components/KosProvider';
import PageHelp from '@/components/PageHelp';
import { Loading, Empty, toast } from '@/components/ui';
import { rp, angka, today, tgl, bulan, errMsg } from '@/lib/format';
import { hasFeature } from '@/lib/plan';
import { canArea } from '@/lib/business';
import { makeXlsx } from '@/lib/xlsx';
import { download } from '@/lib/zip';
import { useBuilder } from '@/lib/builder';
import { useKuotaEkspor } from '@/lib/ekspor';

const addDays = (iso, n) => new Date(new Date(iso + 'T00:00:00Z').getTime() + n * 864e5).toISOString().slice(0, 10);
const PERIODS = [['def', 'Sesuai laporan'], ['bulan', 'Bulan ini'], ['30', '30 hari'], ['365', '12 bulan'], ['all', 'Semua'], ['custom', 'Pilih tanggal']];
const METRIC = { count: 'Jumlah catatan', sum: 'Total', avg: 'Rata-rata' };

// Laporan bisnis kustom (dari Report Builder). Perhitungan di server dengan field yang tervalidasi.
export default function LaporanKustom() {
  const { kos, kosId, ver } = useKos();
  const { cfg, err } = useBuilder(kosId, ver);
  const [rid, setRid] = useState(null);
  const [per, setPer] = useState('def');
  const [from, setFrom] = useState(addDays(today(), -30));
  const [to, setTo] = useState(today());
  const [res, setRes] = useState(null);
  const [fin, setFin] = useState(null); // ringkasan keuangan periode
  const ek = useKuotaEkspor(hasFeature(kos, 'ekspor') ? kosId : null);
  useEffect(() => { if (cfg && !rid && cfg.reports.length) setRid(cfg.reports[0].id); }, [cfg]);
  const range = () => per === 'bulan' ? [today().slice(0, 8) + '01', today()] : per === '30' ? [addDays(today(), -29), today()] : per === '365' ? [addDays(today(), -364), today()]
    : per === 'all' ? ['2000-01-01', today()] : per === 'custom' ? [from, to] : [null, null];
  useEffect(() => {
    const [a, b] = range();
    supabase.rpc('bb_finance', { p_kos: kosId, p_from: a || today().slice(0, 8) + '01', p_to: b || today() }).then(({ data }) => setFin(data || null));
  }, [per, from, to, ver]);
  useEffect(() => {
    if (!rid) return; setRes(null);
    const [a, b] = range();
    supabase.rpc('bb_report_run', { p_report: rid, p_from: a, p_to: b }).then(({ data, error }) => (error ? (toast(errMsg(error)), setRes({ error: errMsg(error) })) : setRes(data)));
  }, [rid, per, from, to, ver]);
  if (err) return <div className="notice bad">{err}</div>;
  if (!cfg) return <Loading />;
  const Fin = () => fin && (
    <section className="panel">
      <div className="row between"><h3>Keuangan</h3><span className="small muted">{tgl(fin.from)} – {tgl(fin.to)}</span></div>
      {!fin.configured ? <span className="small muted">Uang masuk belum diatur. {canArea(kos, 'settings') && <Link href="/builder?langkah=data">Atur di Business Builder › Uang masuk →</Link>}</span> : <div className="list">
        {fin.per_jenis.map((x) => <div className="li" key={x.name}><span className="small">{x.icon} {x.name} · {angka(x.n)} catatan</span><b className="small">{rp(x.total)}</b></div>)}
        {Number(fin.pendapatan_lain) > 0 && <div className="li"><span className="small">Pemasukan lain</span><b className="small">{rp(fin.pendapatan_lain)}</b></div>}
        <div className="li"><span className="small">Biaya operasional</span><b className="small">−{rp(fin.biaya)}</b></div>
        {fin.biaya_per_kategori.slice(0, 5).map((x) => <div className="li" key={x.name}><span className="small muted">  {x.name}</span><span className="small muted">{rp(x.total)}</span></div>)}
        <div className="li"><b className="small">Laba (perkiraan)</b><b className="small" style={{ color: Number(fin.laba) < 0 ? 'var(--bad)' : 'var(--good)' }}>{rp(fin.laba)}</b></div>
        {Number(fin.modal) + Number(fin.non_operasional) > 0 && <span className="small muted">Belanja modal {rp(fin.modal)} dan pengeluaran non-operasional {rp(fin.non_operasional)} tidak mengurangi laba operasional.</span>}
      </div>}
    </section>
  );
  if (!cfg.reports.length) return <div className="stack"><h2>Laporan</h2><Empty title="Belum ada laporan" text="Buat laporan di Business Builder › Laporan." />{canArea(kos, 'settings') && <Link href="/builder?langkah=laporan">Buka Report Builder →</Link>}</div>;
  const rp0 = res?.report || cfg.reports.find((r) => r.id === rid); // definisi yang benar-benar dihitung server
  const money = res?.field?.type === 'currency';
  const fmt = (v) => (rp0?.metric === 'count' ? angka(v) : money ? rp(v) : angka(v));
  const label = (k) => (rp0?.group_by === 'month' && /^\d{4}-\d{2}$/.test(k) ? bulan(k) : rp0?.group_by === 'day' ? tgl(k) : k);
  const max = res?.rows ? Math.max(1, ...res.rows.map((x) => Math.abs(Number(x.value)))) : 1;
  const exportX = () => download(makeXlsx([{ name: rp0.name.slice(0, 30), cols: ['Kelompok', 'Jumlah catatan', rp0.metric === 'count' ? 'Nilai' : `${METRIC[rp0.metric]} ${res.field?.label || ''}`], types: ['t', 'n', money ? 'r' : 'n'],
    rows: res.rows.map((x) => [label(x.key), Number(x.n), Number(x.value)]) }]), `${kos.name} - ${rp0.name}.xlsx`);
  return (
    <div className="stack">
      <div className="row between"><div className="row"><h2>Laporan</h2><PageHelp page="laporan-kustom" /></div>{canArea(kos, 'settings') && <Link href="/builder?langkah=laporan" className="small">Atur laporan</Link>}</div>
      <select value={rid || ''} onChange={(e) => setRid(e.target.value)} aria-label="Pilih laporan">{cfg.reports.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}</select>
      <div className="seg" style={{ overflowX: 'auto', flexWrap: 'nowrap' }}>{PERIODS.map(([k, l]) => <button key={k} className={per === k ? 'on' : ''} onClick={() => setPer(k)} style={{ whiteSpace: 'nowrap' }}>{l}</button>)}</div>
      {per === 'custom' && <div className="row"><input type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)} aria-label="Dari" /><input type="date" value={to} min={from} onChange={(e) => setTo(e.target.value)} aria-label="Sampai" /></div>}
      <Fin />
      {!res ? <Loading /> : res.error ? <div className="notice bad">{res.error}</div> : <>
        <span className="small muted">{tgl(res.from)} – {tgl(res.to)} · {angka(res.records)} catatan · {METRIC[rp0.metric]}{res.field ? ` ${res.field.label}` : ''}</span>
        <section className="panel">
          <div className="row between"><b>{rp0.name}</b><b>{fmt(res.total)}</b></div>
          {res.rows.length === 0 ? <span className="small muted">Tidak ada data pada periode ini.</span> : <div className="list">{res.rows.map((x) => (
            <div key={x.key} className="li" style={{ display: 'block' }}>
              <div className="row between"><span className="small">{label(x.key)} <span className="muted">· {angka(x.n)}</span></span><b className="small">{fmt(x.value)}</b></div>
              <div style={{ height: 6, borderRadius: 3, background: 'var(--sunk)', marginTop: 4 }}><div style={{ width: `${Math.round((100 * Math.abs(Number(x.value))) / max)}%`, height: '100%', borderRadius: 3, background: 'var(--brand)' }} /></div>
            </div>
          ))}</div>}
        </section>
        {hasFeature(kos, 'ekspor') && res.rows.length > 0 && <button className="sm" onClick={() => ek.jalankan('laporan_kustom', exportX)}>Unduh Excel</button>}
        <span className="small muted">Laporan dihitung dari catatan yang tidak diarsipkan, berdasarkan tanggal catatan dibuat. Keuangan: uang masuk dihitung saat catatan mencapai status yang diatur di Business Builder; biaya dari menu Kas & biaya. Laporan per field di atas menghitung semua catatan apa pun statusnya.</span>
      </>}
    </div>
  );
}
