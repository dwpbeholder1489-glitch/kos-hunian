'use client';
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useKos } from '@/components/KosProvider';
import PageHelp from '@/components/PageHelp';
import { Loading, Tile } from '@/components/ui';
import { rp, angka, tgl, bulan, thisMonth, monthEnd, addMonthsYm, errMsg } from '@/lib/format';
import { DayColumns, BarList } from '@/components/Charts';
import { hasFeature } from '@/lib/plan';
import { makeXlsx } from '@/lib/xlsx';
import { download } from '@/lib/zip';
import { useKuotaEkspor } from '@/lib/ekspor';

// Laporan jasa: pendapatan diakui saat pesanan diserahkan; uang masuk, piutang, dan uang muka ditampilkan terpisah
export default function LaporanJasa() {
  const { kos, kosId, ver } = useKos();
  const [ym, setYm] = useState(thisMonth());
  const [r, setR] = useState(null);
  const [err, setErr] = useState(null);
  const ek = useKuotaEkspor(hasFeature(kos, 'ekspor') ? kosId : null);
  useEffect(() => { setR(null); supabase.rpc('svc_report', { p_kos: kosId, p_from: ym + '-01', p_to: monthEnd(ym) }).then(({ data, error }) => (error ? setErr(errMsg(error)) : setR(data))); }, [kosId, ver, ym]);
  if (err) return <div className="notice bad">{/svc_report/.test(err) ? 'Database sedang diperbarui. Coba lagi beberapa menit lagi.' : err}</div>;
  const N = (v) => Number(v) || 0;
  const laba = r ? N(r.pendapatan) - N(r.bahan) - N(r.biaya) : 0;
  const exportX = () => download(makeXlsx([
    { name: 'Ringkasan', cols: ['Keterangan', 'Nilai'], types: ['t', 'r'], rows: [['Pendapatan (pesanan diserahkan)', N(r.pendapatan)], ['Pemakaian bahan', N(r.bahan)], ['Biaya operasional', N(r.biaya)], ['Laba (perkiraan)', laba], ['Uang masuk', N(r.uang_masuk)], ['Belum lunas (piutang)', N(r.piutang)], ['Uang muka pesanan belum selesai', N(r.uang_muka)], ['Diskon', N(r.diskon)], ['Ongkos antar-jemput', N(r.ongkir)], ['Ganti rugi', N(r.ganti_rugi)]] },
    { name: 'Per layanan', cols: ['Layanan', 'Jumlah', 'Satuan', 'Pesanan', 'Pendapatan'], types: ['t', 'n', 't', 'n', 'r'], rows: r.layanan.map((x) => [x.name, N(x.qty), x.unit, N(x.pesanan), N(x.pendapatan)]) },
    { name: 'Harian', cols: ['Tanggal', 'Pesanan diserahkan', 'Pendapatan'], types: ['d', 'n', 'r'], rows: r.harian.map((x) => [x.d, N(x.n), N(x.pendapatan)]) },
    { name: 'Pelanggan teratas', cols: ['Pelanggan', 'Pesanan', 'Pendapatan'], types: ['t', 'n', 'r'], rows: r.pelanggan.map((x) => [x.name, N(x.n), N(x.pendapatan)]) },
  ]), `Laporan ${kos.name} ${ym}.xlsx`);
  return (
    <div className="stack">
      <div className="row"><h2>Laporan</h2><PageHelp page="laporan-jasa" /></div>
      <div className="row">
        <button className="sm ghost" onClick={() => setYm(addMonthsYm(ym, -1))}>‹</button><b>{bulan(ym)}</b>
        <button className="sm ghost" disabled={ym >= thisMonth()} onClick={() => setYm(addMonthsYm(ym, 1))}>›</button>
        {r && hasFeature(kos, 'ekspor') && <button className="sm" disabled={ek.habis} onClick={() => ek.jalankan('laporan_jasa', exportX)}>Unduh Excel</button>}
      </div>
      {hasFeature(kos, 'ekspor') && (ek.habis ? <span className="small" style={{ color: 'var(--bad)' }}>{ek.q?.message}</span> : ek.info && <span className="small muted">{ek.info}</span>)}
      {!r ? <Loading /> : <>
        <div className="grid">
          <Tile label="Pendapatan" value={rp(r.pendapatan)} sub={`${angka(r.selesai)} pesanan diserahkan`} />
          <Tile label="Laba (perkiraan)" value={rp(laba)} tone={laba < 0 ? 'bad' : 'good'} sub="pendapatan − bahan − biaya" />
          <Tile label="Uang masuk" value={rp(r.uang_masuk)} sub="pembayaran diterima bulan ini" />
          <Tile label="Tepat waktu" value={r.selesai ? `${Math.round((100 * r.tepat_waktu) / r.selesai)}%` : '—'} sub="siap sebelum janji" />
        </div>
        <section className="panel">
          <h3>Ringkasan</h3>
          <div className="list">
            {[['Pesanan masuk', angka(r.masuk) + (r.masuk_batal ? ` (${r.masuk_batal} batal)` : '')], ['Pendapatan (pesanan diserahkan)', rp(r.pendapatan)], ['Ongkos antar-jemput (sudah termasuk)', rp(r.ongkir)], ['Diskon diberikan (sudah dipotong)', rp(r.diskon)],
              ['Pemakaian bahan', '−' + rp(r.bahan)], ['Biaya operasional', '−' + rp(r.biaya)], ['Laba (perkiraan)', rp(laba)],
              ['Belum lunas (semua waktu)', rp(r.piutang)], ['Uang muka pesanan belum selesai', rp(r.uang_muka)],
              ['Keluhan', `${angka(r.keluhan)} (${angka(r.cuci_ulang)} cuci ulang)`], ['Ganti rugi', rp(r.ganti_rugi)]].map(([k, v]) => <div className="li" key={k}><span className="small">{k}</span><b className="small">{v}</b></div>)}
          </div>
          <span className="small muted">Pendapatan dihitung saat pesanan diserahkan (diambil/diantar). Uang yang diterima sebelumnya dicatat sebagai uang muka. Biaya bahan dari pemakaian/rusak di menu Bahan & stok; ganti rugi dicatat sebagai biaya di Kas.</span>
        </section>
        <section className="panel">
          <h3>Per layanan</h3>
          {r.layanan.length === 0 ? <span className="small muted">Belum ada pesanan diserahkan bulan ini.</span>
            : <BarList limit={8} items={r.layanan.map((x) => ({ label: x.name, sub: `${angka(x.qty)} ${x.unit} · ${angka(x.pesanan)} pesanan`, value: Number(x.pendapatan) }))} />}
        </section>
        {r.pelanggan.length > 0 && <section className="panel">
          <h3>Pelanggan teratas</h3>
          <div className="list">{r.pelanggan.map((x) => <div className="li" key={x.name}><span className="small">{x.name} · {angka(x.n)} pesanan</span><b className="small">{rp(x.pendapatan)}</b></div>)}</div>
        </section>}
        {r.harian.length > 1 && <section className="panel">
          <h3>Pendapatan harian</h3>
          <DayColumns title={`Pendapatan harian ${bulan(ym)}`} data={r.harian.map((x) => ({ key: x.d, label: tgl(x.d), short: String(+x.d.slice(8)), value: Number(x.pendapatan), note: `${angka(x.n)} pesanan` }))} />
          <details><summary className="small">Lihat tabel harian</summary><div className="list">{r.harian.map((x) => <div className="li" key={x.d}><span className="small">{tgl(x.d)} · {angka(x.n)} pesanan</span><b className="small">{rp(x.pendapatan)}</b></div>)}</div>
        </details>
        </section>}
      </>}
    </div>
  );
}
