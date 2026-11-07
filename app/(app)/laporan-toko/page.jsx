'use client';
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useKos } from '@/components/KosProvider';
import PageHelp from '@/components/PageHelp';
import Locked from '@/components/Locked';
import { Loading, Empty, Tile } from '@/components/ui';
import { rp, angka, tgl, bulan, thisMonth, monthEnd, addMonthsYm, errMsg } from '@/lib/format';
import { DayColumns } from '@/components/Charts';
import { hasFeature } from '@/lib/plan';
import { PAY } from '@/lib/retail';

// Unduh CSV yang bisa dibuka Excel (pemisah titik koma)
function downloadCsv(name, rows) {
  const cell = (v) => { const s = v == null ? '' : String(v); return /[;"\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
  const csv = '﻿' + rows.map((r) => r.map(cell).join(';')).join('\r\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
}

const N = (v) => Number(v) || 0;
const pnl = (r) => {
  const omzet = N(r.omzet), hpp = N(r.hpp), kotor = omzet - hpp;
  const bersih = kotor - N(r.biaya) + N(r.selisih_stok) + N(r.pendapatan_lain);
  return { omzet, hpp, kotor, bersih, margin: omzet ? Math.round((kotor / omzet) * 1000) / 10 : null };
};
const delta = (now, prev) => (prev ? `${now >= prev ? '+' : ''}${Math.round(((now - prev) / Math.abs(prev)) * 100)}% dari bulan lalu` : null);

// Laporan toko bulanan: laba rugi, produk terlaris/paling untung, barang tidak laku
export default function LaporanToko() {
  const { kos, kosId, ver } = useKos();
  const [ym, setYm] = useState(thisMonth());
  const [d, setD] = useState(null);
  const [err, setErr] = useState(null);
  const [sort, setSort] = useState('omzet');
  useEffect(() => {
    setD(null);
    const pm = addMonthsYm(ym, -1);
    Promise.all([
      supabase.rpc('retail_report', { p_kos: kosId, p_from: ym + '-01', p_to: monthEnd(ym) }),
      supabase.rpc('retail_report', { p_kos: kosId, p_from: pm + '-01', p_to: monthEnd(pm) }),
    ]).then(([a, b]) => (a.error || b.error ? setErr(errMsg(a.error || b.error)) : setD({ r: a.data, prev: b.data })));
  }, [kosId, ver, ym]);
  if (kos.business_type !== 'retail') return <Empty title="Laporan ini untuk bisnis Retail & Grosir" />;
  if (err) return <div className="notice bad">{err.includes('retail_report') ? 'Database sedang diperbarui. Coba lagi beberapa menit lagi.' : err}</div>;

  const nav = (
    <div className="row noprint" style={{ flexWrap: 'nowrap' }}>
      <button className="sm" onClick={() => setYm(addMonthsYm(ym, -1))} aria-label="Bulan sebelumnya">‹</button>
      <b style={{ flex: 1, textAlign: 'center' }}>{bulan(ym)}</b>
      <button className="sm" onClick={() => setYm(addMonthsYm(ym, 1))} disabled={ym >= thisMonth()} aria-label="Bulan berikutnya">›</button>
    </div>
  );
  if (!d) return <div className="stack"><h2>Laporan toko</h2>{nav}<Loading /></div>;
  const { r, prev } = d;
  const a = pnl(r), b = pnl(prev);
  const noCost = r.produk.filter((p) => p.no_cost);
  const prods = [...r.produk].sort((x, y) => N(y[sort]) - N(x[sort])).slice(0, 10);
  const maxP = Math.max(1, ...prods.map((p) => Math.abs(N(p[sort]))));
  const maxD = Math.max(1, ...r.harian.map((h) => N(h.omzet)));
  const canExport = hasFeature(kos, 'ekspor');

  const exportCsv = () => downloadCsv(`laporan-toko-${kos.name}-${ym}.csv`, [
    ['Laporan', kos.name, bulan(ym)], [],
    ['Penjualan (setelah diskon)', a.omzet], ['Modal barang terjual', a.hpp], ['Laba kotor', a.kotor],
    ['Biaya operasional', N(r.biaya)], ...r.biaya_rinci.map((x) => ['  ' + x.name, N(x.total)]),
    ['Selisih stok (opname/rusak)', N(r.selisih_stok)], ['Pemasukan lain', N(r.pendapatan_lain)], ['Laba bersih', a.bersih], [],
    ['Prive (bukan biaya)', N(r.prive)], ['Setoran modal', N(r.setoran_modal)], ['Belanja barang (bersih setelah retur)', N(r.belanja)], ['Retur ke supplier', N(r.retur_beli)], ['Belanja modal/peralatan', N(r.belanja_modal)], [],
    ['Produk', 'Terjual (satuan dasar)', 'Penjualan', 'Modal', 'Laba'], ...r.produk.map((p) => [p.name, N(p.qty), N(p.omzet), N(p.hpp), N(p.laba)]), [],
    ...((r.lokasi || []).length > 1 ? [['Lokasi', 'Transaksi', 'Penjualan', 'Laba kotor', 'Biaya lokasi', 'Kontribusi'], ...r.lokasi.map((x) => [x.name, x.trx, N(x.omzet), N(x.laba), N(x.biaya), N(x.kontribusi)]), []] : []),
    ['Tanggal', 'Transaksi', 'Penjualan', 'Laba kotor'], ...r.harian.map((h) => [h.d, h.trx, N(h.omzet), N(h.laba)]),
  ]);

  const Row = ({ l, v, bold, sub, tone }) => (
    <div className="li" style={{ padding: sub ? '6px 0 6px 14px' : undefined }}>
      <span className={sub ? 'small muted' : ''} style={{ fontWeight: bold ? 800 : undefined }}>{l}</span>
      <span style={{ fontWeight: bold ? 800 : 600, color: tone === 'bad' && v < 0 ? 'var(--bad)' : undefined }}>{v < 0 ? '−' + rp(-v) : rp(v)}</span>
    </div>
  );

  return (
    <div className="stack">
      <div className="row between"><div className="row"><h2>Laporan toko</h2><PageHelp page="laporan-toko" /></div>
        <div className="row noprint">{canExport ? <><button className="sm" onClick={exportCsv}>Unduh Excel</button><button className="sm" onClick={() => window.print()}>Cetak / PDF</button></> : null}</div></div>
      {nav}
      {!canExport && <Locked need="standar" title="Unduh Excel & cetak PDF" text="Ekspor laporan toko tersedia di paket Standar." />}
      <div className="grid">
        <Tile label="Penjualan" value={rp(a.omzet)} sub={delta(a.omzet, b.omzet) || `${angka(r.trx)} transaksi`} />
        <Tile label="Laba kotor" value={rp(a.kotor)} sub={a.margin != null ? `margin ${String(a.margin).replace('.', ',')}%` : '—'} />
        <Tile label="Laba bersih" value={a.bersih < 0 ? '−' + rp(-a.bersih) : rp(a.bersih)} tone={a.bersih < 0 ? 'bad' : ''} sub={delta(a.bersih, b.bersih) || 'setelah biaya'} />
      </div>
      {noCost.length > 0 && <div className="notice">Harga modal belum diisi untuk: {noCost.map((p) => p.name).join(', ')}. Laba barang ini terlihat terlalu tinggi.</div>}
      {r.trx === 0 && N(r.biaya) === 0 ? <Empty title="Belum ada transaksi bulan ini" /> : <>
        <section className="panel">
          <h3>Laba rugi</h3>
          <div className="list">
            {N(r.retur) > 0 && <Row l="Penjualan (setelah diskon)" v={a.omzet + N(r.retur)} />}
            {N(r.retur) > 0 && <Row l={`Retur (${r.retur_n}×)`} v={-N(r.retur)} sub />}
            <Row l={N(r.retur) > 0 ? 'Penjualan bersih' : 'Penjualan (setelah diskon)'} v={a.omzet} />
            <Row l="Modal barang terjual" v={-a.hpp} />
            <Row l="Laba kotor" v={a.kotor} bold />
            <Row l="Biaya operasional" v={-N(r.biaya)} />
            {r.biaya_rinci.map((x) => <Row key={x.name} l={x.name} v={-N(x.total)} sub />)}
            {N(r.selisih_stok) !== 0 && <Row l="Selisih stok (opname, rusak, kedaluwarsa)" v={N(r.selisih_stok)} tone="bad" />}
            {N(r.pendapatan_lain) > 0 && <Row l="Pemasukan lain" v={N(r.pendapatan_lain)} />}
            <Row l="Laba bersih" v={a.bersih} bold tone="bad" />
          </div>
          <p className="small muted" style={{ margin: 0 }}>Tidak termasuk laba: prive {rp(r.prive)} · setoran modal {rp(r.setoran_modal)} · belanja barang {rp(r.belanja)} (masuk stok{N(r.retur_beli) > 0 ? `, sudah dikurangi retur ke supplier ${rp(r.retur_beli)}` : ''}) · belanja peralatan {rp(r.belanja_modal)}.</p>
        </section>

        <section className="panel">
          <h3>Cara bayar</h3>
          <div className="list">{Object.entries(PAY).map(([k, l]) => <div className="li" key={k}><span>{l}</span><b>{rp(r.bayar[k])}</b></div>)}</div>
          {N(r.grosir) > 0 && <span className="small muted">Penjualan harga grosir: {rp(r.grosir)} ({Math.round((N(r.grosir) / Math.max(1, a.omzet)) * 100)}%)</span>}
        </section>

        {(r.lokasi || []).length > 1 && (
          <section className="panel">
            <h3>Per lokasi</h3>
            <div className="list">{r.lokasi.map((x) => (
              <div className="li" key={x.name} style={{ alignItems: 'flex-start' }}><div className="main"><b className="small">{x.name}</b><span className="small muted">{angka(x.trx)} transaksi · laba kotor {rp(x.laba)}{x.biaya != null ? ` · biaya lokasi ${rp(x.biaya)}` : ''}</span>{x.kontribusi != null && <span className="small">Kontribusi <b style={{ color: Number(x.kontribusi) < 0 ? 'var(--bad)' : undefined }}>{rp(x.kontribusi)}</b></span>}</div><b className="small">{rp(x.omzet)}</b></div>
            ))}</div>
            <span className="small muted">Penjualan sebelum retur menurut lokasi transaksi. Kontribusi = laba kotor − biaya operasional yang dicatat di lokasi itu (biaya bersama seperti gaji pemilik tidak dibagi otomatis).</span>
          </section>
        )}

        {r.harian.length > 1 && (
          <section className="panel">
            <h3>Penjualan per hari</h3>
            <DayColumns title={`Penjualan harian ${bulan(ym)}`} data={r.harian.map((h) => ({ key: h.d, label: tgl(h.d), short: String(+h.d.slice(8)), value: N(h.omzet) }))} />
          </section>
        )}

        <section className="panel">
          <div className="row between"><h3>Produk</h3>
            <div className="seg">{[['omzet', 'Terlaris'], ['laba', 'Paling untung']].map(([k, l]) => <button key={k} className={sort === k ? 'on' : ''} onClick={() => setSort(k)}>{l}</button>)}</div></div>
          {prods.length === 0 ? <span className="small muted">Belum ada penjualan.</span> : <div className="list">{prods.map((p) => (
            <div className="li" key={p.product_id} style={{ flexDirection: 'column', alignItems: 'stretch', gap: 4 }}>
              <div className="row between" style={{ flexWrap: 'nowrap' }}><b className="small">{p.name}</b><b className="small">{rp(p[sort])}</b></div>
              <div className="pbar"><span style={{ width: `${(Math.abs(N(p[sort])) / maxP) * 100}%` }} /></div>
              <span className="small muted">terjual {angka(N(p.qty))} · penjualan {rp(p.omzet)} · laba {rp(p.laba)}{N(p.omzet) ? ` (${Math.round((N(p.laba) / N(p.omzet)) * 100)}%)` : ''}</span>
            </div>
          ))}</div>}
        </section>
      </>}

      <section className="panel">
        <h3>Tidak laku bulan ini</h3>
        <p className="small muted" style={{ margin: 0 }}>Barang yang punya stok tetapi tidak terjual di {bulan(ym)}, diurutkan dari modal tertahan terbesar.</p>
        {r.tidak_laku.length === 0 ? <span className="small muted">Tidak ada. Semua barang berstok terjual.</span> : <div className="list">{r.tidak_laku.map((t) => (
          <div className="li" key={t.id}><div className="main"><b className="small">{t.name}</b><span className="small muted">stok {angka(t.stock)} {t.base_unit} · terakhir terjual {t.last_sold ? tgl(t.last_sold) : 'belum pernah'}</span></div><b className="small">{rp(t.modal)}</b></div>
        ))}</div>}
      </section>
    </div>
  );
}
