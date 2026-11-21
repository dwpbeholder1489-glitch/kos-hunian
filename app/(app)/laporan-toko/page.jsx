'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useKos } from '@/components/KosProvider';
import PageHelp from '@/components/PageHelp';
import { PageHeader } from '@/components/Page';
import Locked from '@/components/Locked';
import { Loading, Empty, Tile } from '@/components/ui';
import { rp, angka, tgl, bulan, thisMonth, monthEnd, addMonthsYm, errMsg, today as todayStr } from '@/lib/format';
import { DayColumns } from '@/components/Charts';
import { hasFeature } from '@/lib/plan';
import { PAY } from '@/lib/retail';
import { canArea, moduleOn } from '@/lib/business';
import { IndikatorGrosir } from '@/components/AkuntansiDagang';
import { useKuotaEkspor } from '@/lib/ekspor';

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
  const [pajak, setPajak] = useState(null);
  const [kpi, setKpi] = useState(null);   // indikator toko (retail_kpi)
  const [loss, setLoss] = useState(null);   // perlu diperiksa (loss_watch)
  const [names, setNames] = useState({});   // laporan PPN keluaran bulan ini (tax_report)
  const ek = useKuotaEkspor(hasFeature(kos, 'ekspor') ? kosId : null);
  useEffect(() => { supabase.rpc('member_names', { p_kos: kosId }).then(({ data }) => setNames(data || {})); }, [kosId]);
  useEffect(() => {
    setD(null);
    const pm = addMonthsYm(ym, -1);
    Promise.all([
      supabase.rpc('retail_report', { p_kos: kosId, p_from: ym + '-01', p_to: monthEnd(ym) }),
      supabase.rpc('retail_report', { p_kos: kosId, p_from: pm + '-01', p_to: monthEnd(pm) }),
    ]).then(([a, b]) => (a.error || b.error ? setErr(errMsg(a.error || b.error)) : setD({ r: a.data, prev: b.data })));
    setPajak(null); setKpi(null); setLoss(null);
    if (canArea(kos, 'finance')) supabase.rpc('loss_watch', { p_kos: kosId, p_from: ym + '-01', p_to: monthEnd(ym) }).then(({ data }) => setLoss(data || null));
    if (canArea(kos, 'finance')) supabase.rpc('retail_kpi', { p_kos: kosId, p_from: ym + '-01', p_to: ym >= thisMonth() ? todayStr() : monthEnd(ym) }).then(({ data }) => setKpi(data || null));
    if (canArea(kos, 'finance')) supabase.rpc('tax_report', { p_kos: kosId, p_month: ym + '-01' }).then(({ data }) => setPajak(data || null));
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
      <PageHeader title="Laporan toko" help={<PageHelp page="laporan-toko" />} actions={<><div className="row noprint">{canExport ? <><button className="sm" disabled={ek.habis} onClick={() => ek.jalankan('laporan_toko', exportCsv)}>Unduh Excel</button><button className="sm" disabled={ek.habis} onClick={() => ek.jalankan('cetak_pdf', () => window.print())}>Cetak / PDF</button></> : null}</div></>} />
      {canExport && (ek.habis ? <span className="small noprint" style={{ color: 'var(--bad)' }}>{ek.q?.message}</span> : ek.info && <span className="small muted noprint">{ek.info}</span>)}
      {nav}
      {!canExport && <Locked need="dasar" title="Unduh Excel & cetak PDF" text="Ekspor laporan toko tersedia mulai Paket Dasar." />}
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
          <span className="small muted">Penjualan bayar campuran sudah dibagi ke tiap cara bayar sesuai rinciannya.</span>
          {N(r.grosir) > 0 && <span className="small muted">Penjualan harga grosir: {rp(r.grosir)} ({Math.round((N(r.grosir) / Math.max(1, a.omzet)) * 100)}%)</span>}
        </section>

        {kpi && <Indikator k={kpi} names={names} />}
        {canArea(kos, 'finance') && (moduleOn(kos, 'u_penawaran') || moduleOn(kos, 'u_kredit')) && <IndikatorGrosir kosId={kosId} from={ym + '-01'} to={ym >= thisMonth() ? todayStr() : monthEnd(ym)} names={names} ver={ver} />}
        {loss && <PerluDiperiksa w={loss} names={names} />}

        {pajak && (pajak.setelan?.aktif || Number(pajak.ppn_keluaran) !== 0 || Number(pajak.ppn_masukan) !== 0) && (
          <section className="panel">
            <h3>PPN {bulan(ym)}</h3>
            <div className="list">
              <div className="li"><span className="small">Penjualan kena PPN (DPP)</span><b className="small">{rp(pajak.penjualan.dpp)}</b></div>
              <div className="li"><span className="small">PPN dari penjualan</span><b className="small">{rp(pajak.penjualan.ppn)}</b></div>
              {Number(pajak.retur_ppn) > 0 && <div className="li"><span className="small">Dikurangi PPN retur (DPP {rp(pajak.retur_dpp)})</span><b className="small">−{rp(pajak.retur_ppn)}</b></div>}
              <div className="li"><span className="small"><b>PPN keluaran bersih</b></span><b>{rp(pajak.ppn_keluaran)}</b></div>
              {pajak.pembelian && (Number(pajak.ppn_masukan) !== 0 || pajak.setelan?.aktif) && <>
                <div className="li"><span className="small">PPN masukan dari {pajak.pembelian.jumlah} faktur supplier (DPP {rp(pajak.pembelian.dpp)})</span><b className="small">−{rp(pajak.ppn_masukan)}</b></div>
                <div className="li"><span className="small"><b>{Number(pajak.selisih) >= 0 ? 'PPN kurang bayar (keluaran − masukan)' : 'PPN lebih bayar (masukan lebih besar)'}</b></span><b>{rp(Math.abs(pajak.selisih))}</b></div>
              </>}
              <div className="li"><span className="small muted">Penjualan tidak kena PPN</span><span className="small muted">{rp(pajak.penjualan.tidak_kena)}</span></div>
            </div>
            <span className="small muted">Harga di kasir sudah termasuk PPN{pajak.setelan?.rate ? ` ${String(pajak.setelan.rate).replace('.', ',')}%` : ''}; angka di atas sudah memisahkannya. Penjualan & laba di laporan ini tanpa PPN. PPN masukan diambil dari faktur supplier yang diposting (Belanja › Faktur supplier){Number(pajak.pembelian?.tanpa_nomor) > 0 ? `; ${pajak.pembelian.tanpa_nomor} faktur belum diisi nomor faktur pajaknya` : ''}. Gunakan sebagai bahan pelaporan pajak bersama konsultan Anda.</span>
          </section>
        )}

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

// Perlu diperiksa (pencegahan kehilangan): aturan tetap & terbuka dari loss_watch — temuan untuk dicek, BUKAN tuduhan
function PerluDiperiksa({ w, names }) {
  const who = (u) => names[u] || (u ? 'karyawan lama' : 'sistem');
  const a = w.aturan;
  const n = w.di_bawah_modal.length + w.diskon_besar.length + w.kasir.length + w.susut_barang.length + w.berubah_setelah_tutup.length;
  return (
    <section className="panel">
      <h3>Perlu diperiksa</h3>
      <span className="small muted">Daftar ini dibuat dengan aturan tetap agar mudah dicek, bukan tuduhan. Banyak temuan punya alasan wajar (barang rusak, harga khusus pelanggan tetap).</span>
      {n === 0 ? <span className="small" style={{ color: 'var(--good)' }}>Tidak ada temuan bulan ini.</span> : <>
        {w.di_bawah_modal.length > 0 && <><span className="label">Harga diubah manual di bawah modal</span><div className="list">{w.di_bawah_modal.map((x, i) => (
          <div className="li" key={'m' + i}><div className="main"><b>{x.name}</b><span className="small muted">{x.number} · {tgl(x.sale_date)} · {who(x.user_id)} · {angka(x.qty)} {x.unit} @ {rp(x.price)} (modal {rp(x.modal)})</span></div><span className="small" style={{ color: 'var(--bad)' }}>−{rp(x.rugi)}</span></div>))}</div></>}
        {w.diskon_besar.length > 0 && <><span className="label">Diskon manual lebih dari {a.diskon_pct}%</span><div className="list">{w.diskon_besar.map((x, i) => (
          <div className="li" key={'d' + i}><div className="main"><b>{x.number}</b><span className="small muted">{tgl(x.sale_date)} · {who(x.user_id)} · belanja {rp(x.subtotal)}</span></div><span className="small">{rp(x.diskon)} ({String(x.pct).replace('.', ',')}%)</span></div>))}</div></>}
        {w.kasir.length > 0 && <><span className="label">Kasir dengan banyak pembatalan atau laci kurang</span><div className="list">{w.kasir.map((x, i) => (
          <div className="li" key={'k' + i}><div className="main"><b>{who(x.user_id)}</b><span className="small muted">{angka(x.batal_n)} batal dari {angka(x.trx)} transaksi ({rp(x.batal)}){Number(x.laci_kurang_n) > 0 ? ` · laci kurang ${x.laci_kurang_n}× (${rp(x.laci_kurang)})` : ''}{Number(x.retur_tunai_n) > 0 ? ` · retur tunai ${x.retur_tunai_n}×` : ''}</span></div></div>))}</div>
          <span className="small muted">Ditandai bila batal ≥ {a.batal_min}× dan lebih dari {a.batal_pct}% transaksinya, atau laci kurang ≥ {a.shift_min}×.</span></>}
        {w.susut_barang.length > 0 && <><span className="label">Barang dengan susut/selisih hitung terbesar</span><div className="list">{w.susut_barang.map((x, i) => (
          <div className="li" key={'s' + i}><div className="main"><b>{x.name}</b><span className="small muted">{angka(x.qty)} {x.base_unit} · {x.kali}× dicatat</span></div><span className="small">{rp(x.nilai)}</span></div>))}</div></>}
        {w.berubah_setelah_tutup.length > 0 && <span className="small">Hari yang berubah setelah ditutup: <b>{w.berubah_setelah_tutup.map((d) => tgl(d)).join(', ')}</b> — cek di <Link href="/tutup-hari">Tutup harian</Link>.</span>}
      </>}
    </section>
  );
}

// Indikator toko (Bab 17 KPI): dihitung server dari transaksi & kartu stok nyata periode ini
function Indikator({ k, names }) {
  const n = (v) => Number(v || 0);
  const pct = (v) => (v == null ? '—' : `${String(v).replace('.', ',')}%`);
  const who = (u) => names[u] || (u ? 'karyawan lama' : 'sistem');
  const maxCat = Math.max(1, ...k.kategori.map((c) => n(c.omzet)));
  return (
    <section className="panel">
      <h3>Indikator toko</h3>
      <span className="small muted">{tgl(k.from)} – {tgl(k.to)} · penjualan tanpa PPN, setelah retur</span>
      <dl className="kv">
        <dt>Rata-rata belanja per transaksi</dt><dd>{k.rata_keranjang != null ? rp(k.rata_keranjang) : '—'}</dd>
        <dt>Jenis barang per transaksi</dt><dd>{k.jenis_per_trx != null ? String(k.jenis_per_trx).replace('.', ',') : '—'}</dd>
        <dt>Margin kotor</dt><dd>{pct(k.margin_pct)}</dd>
        <dt>Perputaran persediaan</dt><dd>{k.perputaran != null ? `${String(k.perputaran).replace('.', ',')}× · stok cukup ±${angka(k.hari_persediaan)} hari` : 'belum cukup data'}</dd>
        <dt>Barang aktif yang stoknya habis</dt><dd>{angka(k.stok_habis)} dari {angka(k.barang_aktif)} ({pct(k.stok_habis_pct)})</dd>
        <dt>Barang sempat habis karena terjual</dt><dd>{angka(k.sempat_habis)}</dd>
        <dt>Susut (rusak & kedaluwarsa)</dt><dd>{rp(k.susut)} · {pct(k.susut_pct)} dari penjualan</dd>
        {n(k.selisih_hitung) !== 0 && <><dt>Selisih hitung stok</dt><dd>{n(k.selisih_hitung) > 0 ? 'kurang ' : 'lebih '}{rp(Math.abs(n(k.selisih_hitung)))}</dd></>}
        <dt>Dibatalkan</dt><dd>{angka(k.batal_n)} · {rp(k.batal)}</dd>
      </dl>
      <span className="small muted">Perputaran = harga pokok terjual ÷ rata-rata nilai persediaan (kartu stok, tanpa barang titipan). Makin tinggi, makin cepat barang berputar.</span>
      {k.kasir.length > 0 && <>
        <span className="label">Per kasir</span>
        <div className="list">{k.kasir.map((x) => (
          <div className="li" key={x.user_id || 'x'} style={{ alignItems: 'flex-start' }}>
            <div className="main"><b className="small">{who(x.user_id)}</b>
              <span className="small muted">{angka(x.trx)} transaksi{n(x.trx) ? ` · rata-rata ${rp(n(x.omzet) / n(x.trx))}` : ''}{n(x.retur_n) ? ` · retur ${x.retur_n} (${rp(x.retur)})` : ''}{n(x.batal_n) ? ` · batal ${x.batal_n} (${rp(x.batal)})` : ''}</span>
              {n(x.shift_selisih_n) > 0 && <span className="small" style={{ color: 'var(--bad)' }}>Selisih laci di {x.shift_selisih_n} shift · total {n(x.shift_selisih) < 0 ? 'kurang' : 'lebih'} {rp(Math.abs(n(x.shift_selisih)))}</span>}
            </div>
            <b className="small" style={{ flex: 'none' }}>{rp(x.omzet)}</b>
          </div>
        ))}</div>
        <span className="small muted">Pembatalan, retur, dan selisih laci yang sering pada satu orang patut diperiksa.</span>
      </>}
      {k.kategori.length > 1 && <>
        <span className="label">Per kategori</span>
        {k.kategori.map((c) => (
          <div key={c.name} className="stack" style={{ gap: 2 }}>
            <div className="row between small" style={{ flexWrap: 'nowrap' }}><span style={{ minWidth: 0, overflowWrap: 'anywhere' }}>{c.name}</span><b style={{ flex: 'none' }}>{rp(c.omzet)} · laba {rp(c.laba)}</b></div>
            <div style={{ height: 6, borderRadius: 6, background: 'var(--sunk)' }}><div style={{ height: 6, borderRadius: 6, width: `${Math.max(2, (n(c.omzet) / maxCat) * 100)}%`, background: 'var(--gold)' }} /></div>
          </div>
        ))}
      </>}
      {k.varian.length > 0 && <>
        <span className="label">Barang bervarian</span>
        {k.varian.map((v) => <span key={v.name} className="small"><b>{v.name}</b> {rp(v.omzet)} · {(v.rinci || []).map((r) => `${r.label} ${rp(r.omzet)}`).join(' · ')}</span>)}
      </>}
    </section>
  );
}
