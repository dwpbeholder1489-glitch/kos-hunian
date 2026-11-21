'use client';
// Tahap 2 Retail — Fondasi akuntansi dagang (Master Prompt Bagian 16–17). Semua angka dari server:
// acct_trial_balance (jurnal), aging_report (receivable_open / payable_open), inventory_valuation (kartu stok), wholesale_kpi.
// Halaman ini HANYA menampilkan; tidak menghitung ulang angka uang.
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { DataTable } from '@/components/Page';
import { Field, Loading, Empty, Tile, Sheet } from '@/components/ui';
import { rp, angka, tgl, errMsg, today } from '@/lib/format';
import { hasFeature } from '@/lib/plan';
import { useKuotaEkspor, downloadCsv } from '@/lib/ekspor';
import FiturUpgrade from '@/components/FiturUpgrade';

const N = (v) => Number(v) || 0;
const dash = (v) => (N(v) ? rp(v) : '—');
const TYPE = { aset: 'Aset', kewajiban: 'Kewajiban', ekuitas: 'Modal', pendapatan: 'Pendapatan', beban: 'Beban' };
const updating = (e, fn) => (new RegExp(fn).test(e) ? 'Database sedang diperbarui. Coba lagi beberapa menit lagi.' : e);

// Tombol unduh dengan kuota ekspor yang sama dengan laporan lain
function Unduh({ kos, kosId, jenis, make }) {
  const ek = useKuotaEkspor(hasFeature(kos, 'ekspor') ? kosId : null);
  if (!hasFeature(kos, 'ekspor')) return null;
  return (
    <div className="row noprint" style={{ gap: 8 }}>
      <button className="sm" disabled={ek.habis} onClick={() => ek.jalankan(jenis, make)}>Unduh Excel</button>
      {ek.habis ? <span className="small" style={{ color: 'var(--bad)' }}>{ek.q?.message}</span> : ek.info && <span className="small muted">{ek.info}</span>}
    </div>
  );
}

// ---------------------------------------------------------------------------------------------------
// 1. Neraca saldo (trial balance)
export function NeracaSaldo({ kos, kosId, from, to, period, owner, ver }) {
  const [d, setD] = useState(null);
  const [err, setErr] = useState(null);
  useEffect(() => {
    setD(null); setErr(null);
    supabase.rpc('acct_trial_balance', { p_kos: kosId, p_from: from, p_to: to }).then(({ data, error }) => (error ? setErr(errMsg(error)) : setD(data)));
  }, [kosId, from, to, ver]);
  if (err) return <div className="notice bad">{updating(err, 'acct_trial_balance')}</div>;
  if (!d) return <Loading />;
  const t = d.total || {};
  const make = () => downloadCsv(`neraca-saldo-${kos.name}-${from}-${to}.csv`, [
    ['Neraca saldo', kos.name, `${from} s.d. ${to}`], [],
    ['Kode', 'Akun', 'Jenis', 'Saldo awal', 'Debit periode', 'Kredit periode', 'Saldo akhir debit', 'Saldo akhir kredit'],
    ...d.rows.map((r) => [r.code, r.name, TYPE[r.type] || r.type, r.awal, r.debit, r.kredit, r.akhir_debit, r.akhir_kredit]),
    ['', 'Jumlah', '', '', t.debit, t.kredit, t.akhir_debit, t.akhir_kredit],
  ]);
  const cols = [
    { key: 'name', label: 'Akun', main: true, render: (r) => <span style={{ overflowWrap: 'anywhere' }}><span className="muted">{r.ringkas ? '' : r.code + ' · '}</span>{r.name}{r.ringkas && <span className="chip" style={{ marginLeft: 6 }}>ringkas</span>}</span> },
    { key: 'type', label: 'Jenis', hide: 'tablet', render: (r) => TYPE[r.type] || r.type },
    { key: 'awal', label: 'Saldo awal', align: 'right', hide: 'tablet', render: (r) => (N(r.awal) ? rp(r.awal) : '—') },
    { key: 'debit', label: 'Debit', align: 'right', render: (r) => dash(r.debit) },
    { key: 'kredit', label: 'Kredit', align: 'right', render: (r) => dash(r.kredit) },
    { key: 'ad', label: 'Saldo akhir (D)', align: 'right', render: (r) => dash(r.akhir_debit) },
    { key: 'ak', label: 'Saldo akhir (K)', align: 'right', render: (r) => dash(r.akhir_kredit) },
  ];
  return (
    <div className="stack">
      <section className="panel">
        <div className="row between" style={{ alignItems: 'flex-start', gap: 8, flexWrap: 'wrap' }}>
          <div style={{ minWidth: 0 }}><h3>Neraca saldo · {period}</h3>
            <span className="small muted">Daftar semua akun dengan mutasi debit/kredit periode ini dan saldo akhirnya. Jumlah kolom debit dan kredit harus sama — tanda pembukuan seimbang.</span></div>
          <Unduh kos={kos} kosId={kosId} jenis="neraca_saldo" make={make} />
        </div>
        <div className="grid">
          <Tile label="Mutasi debit" value={rp(t.debit)} />
          <Tile label="Mutasi kredit" value={rp(t.kredit)} />
          <Tile label="Status" value={d.seimbang ? 'Seimbang' : 'Tidak seimbang'} tone={d.seimbang ? 'good' : 'bad'} sub={`saldo akhir ${rp(t.akhir_debit)} = ${rp(t.akhir_kredit)}`} />
        </div>
        {!d.seimbang && <div className="notice bad small">Debit dan kredit tidak sama. Buka tab Laporan › Cek kecocokan, atau hubungi dukungan.</div>}
      </section>
      {d.rows.length === 0 ? <Empty title="Belum ada jurnal" text="Neraca saldo terisi otomatis setelah ada transaksi." /> :
        <DataTable caption="Neraca saldo" columns={cols} rows={d.rows} rowKey={(r) => r.code + r.name} pageSize={100} />}
      <section className="panel">
        <div className="row between small"><b>Jumlah</b><span>Debit {rp(t.debit)} · Kredit {rp(t.kredit)}</span></div>
        <div className="row between small"><b>Saldo akhir</b><span>D {rp(t.akhir_debit)} · K {rp(t.akhir_kredit)}</span></div>
        <span className="small muted">Saldo akhir aset dan beban biasanya di kolom Debit; kewajiban, modal, dan pendapatan di kolom Kredit. Saldo awal = posisi sebelum {tgl(from)}.</span>
      </section>
      {d.ringkas && <FiturUpgrade kosId={kosId} owner={owner} event="REPORT.ADVANCED_REQUESTED" title="Rincian akun aset, kewajiban & modal tersedia mulai Paket Bisnis"
        text="Di paket ini akun aset, kewajiban, dan modal digabung menjadi tiga baris (neraca saldo tetap seimbang). Pendapatan dan beban tampil per akun." />}
    </div>
  );
}

// ---------------------------------------------------------------------------------------------------
// 2. Umur piutang & utang
const EDGES = { '30': [30, 60, 90], '7': [7, 14, 30] };
const DOC = { jual: 'Penjualan kasbon', beli: 'Belanja utang', faktur: 'Tambahan faktur', titipan: 'Titipan terjual' };
export function UmurPiutangUtang({ kos, kosId, ver }) {
  const [kind, setKind] = useState('piutang');
  const [ed, setEd] = useState('30');
  const [d, setD] = useState(null);
  const [err, setErr] = useState(null);
  const [pick, setPick] = useState(null);
  useEffect(() => {
    setD(null); setErr(null);
    supabase.rpc('aging_report', { p_kos: kosId, p_kind: kind, p_edges: EDGES[ed] }).then(({ data, error }) => (error ? setErr(errMsg(error)) : setD(data)));
  }, [kosId, kind, ed, ver]);
  const e = EDGES[ed];
  const B = [['belum', 'Belum jatuh tempo'], ['b1', `1–${e[0]} hari`], ['b2', `${e[0] + 1}–${e[1]} hari`], ['b3', `${e[1] + 1}–${e[2]} hari`], ['b4', `> ${e[2]} hari`], ...(kind === 'utang' ? [['tanpa', 'Titipan (tanpa tempo)']] : [])];
  const who = kind === 'piutang' ? 'pelanggan' : 'pemasok';
  const make = () => downloadCsv(`umur-${kind}-${kos.name}-${today()}.csv`, [
    [`Umur ${kind}`, kos.name, `per ${today()}`], [],
    [who === 'pelanggan' ? 'Pelanggan' : 'Pemasok', 'Total', ...B.map((b) => b[1]), 'Terlambat terlama (hari)'],
    ...(d?.rows || []).map((r) => [r.name, r.total, ...B.map((b) => r[b[0]]), r.max_late ?? '']),
    ['Jumlah', d?.total?.total, ...B.map((b) => d?.total?.[b[0]])],
  ]);
  const cols = [
    { key: 'name', label: who === 'pelanggan' ? 'Pelanggan' : 'Pemasok', main: true, render: (r) => <span style={{ overflowWrap: 'anywhere' }}>{r.name}</span> },
    { key: 'total', label: 'Sisa', align: 'right', sort: (r) => N(r.total), render: (r) => <b>{rp(r.total)}</b> },
    ...B.map(([k, l]) => ({ key: k, label: l, align: 'right', hide: k === 'belum' || k === 'b4' || k === 'tanpa' ? undefined : 'tablet', render: (r) => (N(r[k]) ? <span style={k === 'b4' || k === 'b3' ? { color: 'var(--bad)' } : undefined}>{rp(r[k])}</span> : '—') })),
    { key: 'late', label: 'Terlambat', align: 'right', sort: (r) => N(r.max_late), render: (r) => (N(r.max_late) > 0 ? `${r.max_late} hari` : '—') },
  ];
  return (
    <div className="stack">
      <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
        <div className="seg">{[['piutang', 'Piutang pelanggan'], ['utang', 'Utang pemasok']].map(([k, l]) => <button key={k} className={kind === k ? 'on' : ''} onClick={() => setKind(k)}>{l}</button>)}</div>
        <div className="seg">{[['30', '30 / 60 / 90 hari'], ['7', '7 / 14 / 30 hari']].map(([k, l]) => <button key={k} className={ed === k ? 'on' : ''} onClick={() => setEd(k)}>{l}</button>)}</div>
      </div>
      {err ? <div className="notice bad">{updating(err, 'aging_report')}</div> : !d ? <Loading /> : <>
        <section className="panel">
          <div className="row between" style={{ alignItems: 'flex-start', gap: 8, flexWrap: 'wrap' }}>
            <div style={{ minWidth: 0 }}><h3>Umur {kind} · per {tgl(d.asof)}</h3>
              <span className="small muted">Dikelompokkan menurut <b>jatuh tempo</b>. Pembayaran {kind === 'piutang' ? 'dari pelanggan' : 'ke pemasok'} melunasi dokumen terlama lebih dulu. Total sama dengan saldo {who} di menu Pelanggan & supplier.</span></div>
            <Unduh kos={kos} kosId={kosId} jenis={`umur_${kind}`} make={make} />
          </div>
          <div className="grid">
            <Tile label={`Total ${kind}`} value={rp(d.total.total)} sub={`${d.total.kontak} ${who} · ${d.total.dokumen} dokumen`} />
            <Tile label="Belum jatuh tempo" value={rp(d.total.belum)} />
            <Tile label={`Lewat > ${e[1]} hari`} value={rp(N(d.total.b3) + N(d.total.b4))} tone={N(d.total.b3) + N(d.total.b4) > 0 ? 'bad' : ''} />
          </div>
          <div className="list">{B.map(([k, l]) => (
            <div className="li" key={k}><div className="main"><span className="small">{l}</span></div>
              <span className="small" style={{ whiteSpace: 'nowrap' }}>{rp(d.total[k])}{N(d.total.total) > 0 ? <span className="muted"> · {Math.round((100 * N(d.total[k])) / N(d.total.total))}%</span> : null}</span></div>
          ))}</div>
        </section>
        {d.rows.length === 0 ? <Empty title={`Tidak ada ${kind} terbuka`} text={kind === 'piutang' ? 'Semua kasbon pelanggan sudah lunas.' : 'Semua utang ke pemasok sudah lunas.'} /> :
          <DataTable caption={`Umur ${kind}`} columns={cols} rows={d.rows} rowKey={(r) => r.contact_id} onRow={setPick} rowLabel={(r) => `Rincian ${r.name}`}
            initialSort={{ key: 'total', dir: -1 }} />}
        {d.lebih_bayar?.length > 0 && <section className="panel">
          <h3>Lebih bayar</h3>
          <span className="small muted">Saldo {who} ini negatif (sudah dibayar/dipotong melebihi tagihan). Tidak dihitung dalam umur di atas.</span>
          <div className="list">{d.lebih_bayar.map((x) => <div className="li" key={x.contact_id}><div className="main" style={{ minWidth: 0 }}><span className="small" style={{ overflowWrap: 'anywhere' }}>{x.name}</span></div><span className="small">{rp(x.amount)}</span></div>)}</div>
        </section>}
        {pick && <Sheet title={pick.name} onClose={() => setPick(null)}>
          <span className="small muted">Sisa {rp(pick.total)}{N(pick.max_late) > 0 ? ` · terlambat terlama ${pick.max_late} hari` : ''}</span>
          <div className="list">{pick.docs.map((x, i) => (
            <div className="li" key={(x.doc_id || x.number) + i} style={{ alignItems: 'flex-start' }}>
              <div className="main" style={{ minWidth: 0 }}><b className="small" style={{ overflowWrap: 'anywhere' }}>{x.number}</b>
                <span className="small muted">{DOC[x.doc_type] || x.doc_type} · {tgl(x.doc_date)}{x.due_date ? ` · jatuh tempo ${tgl(x.due_date)}` : ' · tanpa jatuh tempo'}</span>
                {N(x.late) > 0 && <span className="small" style={{ color: 'var(--bad)' }}>Terlambat {x.late} hari</span>}</div>
              <span className="small" style={{ textAlign: 'right', whiteSpace: 'nowrap' }}><b>{rp(x.open)}</b>{N(x.open) < N(x.amount) && <><br /><span className="muted">dari {rp(x.amount)}</span></>}</span>
            </div>
          ))}</div>
          <Link className="sm" href={kind === 'piutang' ? '/kontak' : '/kas'}>{kind === 'piutang' ? 'Catat pembayaran di Pelanggan & supplier ›' : 'Bayar utang di Kas & kasbon ›'}</Link>
        </Sheet>}
      </>}
    </div>
  );
}

// ---------------------------------------------------------------------------------------------------
// 3. Nilai persediaan
export function NilaiPersediaan({ kos, kosId, ver }) {
  const [asof, setAsof] = useState(today());
  const [d, setD] = useState(null);
  const [err, setErr] = useState(null);
  useEffect(() => {
    setD(null); setErr(null);
    supabase.rpc('inventory_valuation', { p_kos: kosId, p_asof: asof || null }).then(({ data, error }) => (error ? setErr(errMsg(error)) : setD(data)));
  }, [kosId, asof, ver]);
  const make = () => downloadCsv(`nilai-persediaan-${kos.name}-${d?.asof}.csv`, [
    ['Nilai persediaan', kos.name, `per ${d?.asof}`], [],
    ['Barang', 'Kategori', 'Titipan', 'Jumlah', 'Satuan', 'Modal rata-rata', 'Nilai'],
    ...(d?.rows || []).map((r) => [r.name, r.category, r.consign ? 'ya' : '', r.qty, r.unit, r.avg_cost ?? '', r.value]),
    ['Milik toko', '', '', '', '', '', d?.total?.own], ['Titipan', '', '', '', '', '', d?.total?.consign],
  ]);
  const cols = [
    { key: 'name', label: 'Barang', main: true, render: (r) => <span style={{ overflowWrap: 'anywhere' }}>{r.name}{r.consign && <span className="chip" style={{ marginLeft: 6 }}>Titipan</span>}{N(r.qty) < 0 && <span className="chip bad" style={{ marginLeft: 6 }}>Minus</span>}</span> },
    { key: 'category', label: 'Kategori', hide: 'tablet' },
    { key: 'qty', label: 'Jumlah', align: 'right', sort: (r) => N(r.qty), render: (r) => `${angka(r.qty)} ${r.unit}` },
    { key: 'avg', label: 'Modal rata-rata', align: 'right', render: (r) => (r.avg_cost != null ? rp(r.avg_cost) : '—') },
    { key: 'value', label: 'Nilai', align: 'right', sort: (r) => N(r.value), render: (r) => <b>{rp(r.value)}</b> },
  ];
  return (
    <div className="stack">
      <div className="row" style={{ gap: 8, alignItems: 'flex-end' }}>
        <Field label="Posisi per tanggal"><input type="date" value={asof} max={today()} onChange={(e) => setAsof(e.target.value || today())} /></Field>
        {asof !== today() && <button className="sm ghost" onClick={() => setAsof(today())}>Hari ini</button>}
      </div>
      {err ? <div className="notice bad">{updating(err, 'inventory_valuation')}</div> : !d ? <Loading /> : <>
        <section className="panel">
          <div className="row between" style={{ alignItems: 'flex-start', gap: 8, flexWrap: 'wrap' }}>
            <div style={{ minWidth: 0 }}><h3>Nilai persediaan · {tgl(d.asof)}</h3>
              <span className="small muted">Dari kartu stok: jumlah × modal rata-rata bergerak (metode HPP resmi). Barang dalam perjalanan tetap dihitung sebagai milik toko.</span></div>
            <Unduh kos={kos} kosId={kosId} jenis="nilai_persediaan" make={make} />
          </div>
          <div className="grid">
            <Tile label="Milik toko" value={rp(d.total.own)} sub={`${angka(d.total.items)} barang ada stok`} />
            {N(d.total.consign) !== 0 && <Tile label="Titipan (milik penitip)" value={rp(d.total.consign)} />}
            {N(d.transit) > 0 && <Tile label="Dalam perjalanan" value={rp(d.transit)} />}
          </div>
          {d.selisih != null && (Math.abs(N(d.selisih)) < 1
            ? <span className="small" style={{ color: 'var(--good)' }}>✓ Sama dengan saldo akun Persediaan di buku besar ({rp(d.buku)}).</span>
            : <div className="notice small">Akun Persediaan di buku besar {rp(d.buku)}, kartu stok {rp(d.total.all)} (selisih {rp(d.selisih)}). Cek di tab Laporan › Cek kecocokan.</div>)}
          {d.selisih == null && <span className="small muted">Tanggal lampau: dihitung dari waktu stok dicatat, jadi tidak dibandingkan dengan buku besar (jurnal memakai tanggal dokumen).</span>}
          {N(d.total.minus) > 0 && <span className="small" style={{ color: 'var(--bad)' }}>{d.total.minus} barang stoknya minus — nilainya mengurangi total. Periksa di Barang & stok.</span>}
        </section>
        {(d.per_kategori?.length > 1 || d.per_lokasi) && <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 300px), 1fr))' }}>
          {d.per_kategori?.length > 1 && <section className="panel"><h3>Per kategori</h3>
            <div className="list">{d.per_kategori.map((k) => <div className="li" key={k.category}><div className="main" style={{ minWidth: 0 }}><span className="small" style={{ overflowWrap: 'anywhere' }}>{k.category}</span><span className="small muted">{angka(k.items)} barang</span></div><span className="small">{rp(k.value)}</span></div>)}</div></section>}
          {d.per_lokasi && <section className="panel"><h3>Per lokasi</h3>
            <div className="list">{d.per_lokasi.map((k) => <div className="li" key={k.branch_id || k.name}><div className="main" style={{ minWidth: 0 }}><span className="small" style={{ overflowWrap: 'anywhere' }}>{k.name}</span></div><span className="small">{rp(k.value)}</span></div>)}
              {N(d.transit) > 0 && <div className="li"><div className="main"><span className="small">Dalam perjalanan</span></div><span className="small">{rp(d.transit)}</span></div>}</div>
            <span className="small muted">Nilai per lokasi = jumlah di lokasi × modal rata-rata barang.</span></section>}
        </div>}
        {d.rows.length === 0 ? <Empty title="Belum ada persediaan" text="Nilai persediaan terisi setelah ada stok awal atau belanja." /> :
          <DataTable caption="Nilai persediaan per barang" columns={cols} rows={d.rows} rowKey={(r) => r.product_id} initialSort={{ key: 'value', dir: -1 }} />}
      </>}
    </div>
  );
}

// ---------------------------------------------------------------------------------------------------
// 4. Indikator grosir (Laporan toko) — rumus tertulis di setiap angka
export function IndikatorGrosir({ kosId, from, to, names = {}, ver }) {
  const [k, setK] = useState(null);
  const [err, setErr] = useState(null);
  useEffect(() => {
    setK(null); setErr(null);
    supabase.rpc('wholesale_kpi', { p_kos: kosId, p_from: from, p_to: to }).then(({ data, error }) => (error ? setErr(errMsg(error)) : setK(data)));
  }, [kosId, from, to, ver]);
  if (err) return /wholesale_kpi/.test(err) ? null : <div className="notice bad small">{err}</div>;
  if (!k) return null;
  const p = k.pesanan || {}, s = k.kirim || {};
  const kosong = !k.pelanggan?.length && !N(p.jumlah) && !N(k.piutang);
  return (
    <section className="panel">
      <h3>Indikator grosir</h3>
      <span className="small muted">Penjualan ke pelanggan bernama (kasir dengan pelanggan, kasbon, dan surat jalan grosir) {tgl(from)} – {tgl(to)}.</span>
      {kosong ? <span className="small muted">Belum ada penjualan ke pelanggan bernama atau pesanan grosir pada periode ini.</span> : <>
        <div className="grid">
          <Tile label="Lama penagihan (DSO)" value={k.dso != null ? `${angka(k.dso)} hari` : '—'} sub="piutang saat ini ÷ rata-rata penjualan kasbon per hari" />
          <Tile label="Piutang saat ini" value={rp(k.piutang)} sub={`tertagih periode ini ${rp(k.tertagih)}`} />
          <Tile label="Pemenuhan pesanan" value={p.fill_rate_pct != null ? `${String(p.fill_rate_pct).replace('.', ',')}%` : '—'} sub={`nilai terkirim ÷ nilai dipesan · ${N(p.lengkap)} dari ${N(p.jumlah)} pesanan lengkap`} />
          <Tile label="Kirim tepat waktu" value={s.tepat_pct != null ? `${String(s.tepat_pct).replace('.', ',')}%` : '—'} sub={s.dengan_target ? `${s.tepat_waktu} dari ${s.dengan_target} surat jalan ≤ tanggal dibutuhkan` : 'isi "tanggal dibutuhkan" di pesanan'} />
          {N(s.jumlah) > 0 && <Tile label="Gagal kirim" value={`${String(s.gagal_pct ?? 0).replace('.', ',')}%`} sub={`${N(s.gagal)} dari ${N(s.jumlah)} surat jalan`} tone={N(s.gagal) ? 'bad' : ''} />}
          {N(p.jumlah) > 0 && <Tile label="Rata-rata pesanan" value={rp(p.rata_rata)} sub={`${N(p.jumlah)} pesanan dikonfirmasi`} />}
        </div>
        {k.pelanggan?.length > 0 && <>
          <span className="label" style={{ marginTop: 6 }}>Per pelanggan (margin kotor = (omzet − modal) ÷ omzet, tanpa PPN)</span>
          <div className="list">{k.pelanggan.slice(0, 10).map((c) => (
            <div className="li" key={c.contact_id} style={{ alignItems: 'flex-start' }}>
              <div className="main" style={{ minWidth: 0 }}><b className="small" style={{ overflowWrap: 'anywhere' }}>{c.name}</b>
                <span className="small muted">{c.trx} transaksi · laba {rp(c.laba)}{c.margin_pct != null ? ` · margin ${String(c.margin_pct).replace('.', ',')}%` : ''}</span>
                {N(c.piutang) > 0 && <span className="small" style={{ color: c.pakai_limit_pct > 100 ? 'var(--bad)' : undefined }}>Piutang {rp(c.piutang)}{c.pakai_limit_pct != null ? ` · ${String(c.pakai_limit_pct).replace('.', ',')}% dari batas kredit` : ''}</span>}</div>
              <span className="small" style={{ whiteSpace: 'nowrap' }}>{rp(c.omzet)}</span>
            </div>))}</div>
        </>}
        {k.per_sales?.length > 0 && k.per_sales.some((x) => x.sales_user) && <>
          <span className="label" style={{ marginTop: 6 }}>Per sales (dari "Sales yang memegang" di data pelanggan)</span>
          <div className="list">{k.per_sales.map((x) => (
            <div className="li" key={x.sales_user || 'tanpa'}><div className="main" style={{ minWidth: 0 }}><b className="small" style={{ overflowWrap: 'anywhere' }}>{x.sales_user ? names[x.sales_user] || 'Anggota tim' : 'Tanpa sales'}</b>
              <span className="small muted">{x.pelanggan} pelanggan · laba {rp(x.laba)}{x.margin_pct != null ? ` · margin ${String(x.margin_pct).replace('.', ',')}%` : ''}{N(x.piutang) > 0 ? ` · piutang ${rp(x.piutang)}` : ''}</span></div>
              <span className="small" style={{ whiteSpace: 'nowrap' }}>{rp(x.omzet)}</span></div>))}</div>
        </>}
      </>}
    </section>
  );
}
