'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { useKos } from '@/components/KosProvider';
import PageHelp from '@/components/PageHelp';
import Image from 'next/image';
import NavIcon from '@/components/NavIcon';
import { Customers, InventoryTurnover, MetricDetail, Profitability, TrendPanel, laba } from './Details';
import styles from './analisis.module.css';
import FiturUpgrade from '@/components/FiturUpgrade';
import { Empty, Loading } from '@/components/ui';
import { rp, angka, errMsg, bulan, thisMonth, addMonthsYm } from '@/lib/format';
import { canArea } from '@/lib/business';

const BLN = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
const HARI = ['Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu', 'Minggu'];
const n = (v) => Number(v || 0);
const ubah = (a, b) => (n(b) === 0 ? null : Math.round(((n(a) - n(b)) / Math.abs(n(b))) * 100));
const ym = (d) => String(d).slice(0, 7);
const naikTurun = (p, baikNaik = true) => (p == null ? <span className="small muted">—</span>
  : <span className="small" style={{ color: p === 0 ? undefined : (p > 0) === baikNaik ? 'var(--good)' : 'var(--bad)' }}>{p > 0 ? '▲' : p < 0 ? '▼' : '='} {Math.abs(p)}%</span>);

// Analisis bisnis bertingkat (V2 §4.1): Dasar = bulan ini vs lalu; Lanjutan (Paket Bisnis) = tren 12 bulan, per akun, teratas;
// Mendalam (Paket Pro) = antar-cabang, tahun lalu, pola hari. Angka uang dari jurnal (sama dengan Pembukuan), dihitung di server (biz_analysis).
export default function Analisis() {
  const { kos, kosId, ver } = useKos();
  return kosId ? <Workspace key={kosId} {...{ kos, kosId, ver }} /> : <Loading />;
}

const tabs = [
  ['summary', 'Ringkasan', '/laporan'], ['trend', 'Tren', '/analisis'], ['profit', 'Profitabilitas', '/layers'],
  ['products', 'Produk', '/barang'], ['customers', 'Pelanggan', '/penghuni'],
];

function Workspace({ kos, kosId, ver }) {
  const [bln, setBln] = useState(thisMonth);
  const [tab, setTab] = useState('summary');
  const [compare, setCompare] = useState('month');
  const [detail, setDetail] = useState(null);
  const [d, setD] = useState(null);
  const [err, setErr] = useState(null);
  const owner = canArea(kos, 'team');
  useEffect(() => {
    let active = true;
    setD(null); setErr(null);
    supabase.rpc('biz_analysis', { p_kos: kosId, p_month: bln + '-01' }).then(({ data, error }) => {
      if (active) { if (error) setErr(errMsg(error)); else setD(data); }
    });
    return () => { active = false; };
  }, [kosId, bln, ver]);
  function changeMonth(value) {
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(value) || value > thisMonth() || bln === value) return;
    setD(null); setDetail(null); setBln(value);
  }
  if (err) return <div className="notice bad">{/biz_analysis/.test(err) ? 'Database sedang diperbarui. Coba lagi beberapa menit lagi.' : err}</div>;
  if (!d) return <Loading />;

  const rows = d.per_bulan || [];
  const ini = rows[rows.length - 1] || {};
  const lalu = rows[rows.length - 2] || {};
  const thnLalu = d.level === 'mendalam' ? rows.find((row) => ym(row.bulan) === addMonthsYm(bln, -12)) : null;
  const tren = rows.length >= 13 ? rows.slice(1) : rows;
  const margin = (row) => n(row.pendapatan) > 0 ? laba(row) * 100 / n(row.pendapatan) : null;
  const markup = (row) => n(row.hpp) > 0 ? (n(row.pendapatan) - n(row.hpp)) * 100 / n(row.hpp) : null;
  const percentText = (value) => value == null ? '—' : `${angka(Math.round(value))}%`;
  const rata3 = tren.length >= 4 ? tren.slice(-4, -1).reduce((t, b) => t + n(b.pendapatan), 0) / 3 : null;
  const rataTrx = (b) => (n(b.transaksi) > 0 ? n(b.pendapatan) / n(b.transaksi) : null);
  const lanjut = d.level !== 'dasar';
  const dalam = d.level === 'mendalam';
  const kosong = rows.every((b) => !n(b.pendapatan) && !n(b.hpp) && !n(b.biaya) && !n(b.transaksi));
  const trxLabel = d.jenis === 'properti' ? 'Pembayaran diterima' : d.jenis === 'jasa' ? 'Pesanan selesai' : d.jenis === 'kustom' ? 'Transaksi' : 'Penjualan';

  // Temuan dari data (aturan tetap, bukan tebakan): hanya ditampilkan bila datanya ada
  const temuan = [];
  const pP = ubah(ini.pendapatan, lalu.pendapatan);
  if (pP != null && Math.abs(pP) >= 20) temuan.push(`Pendapatan ${bulan(bln)} ${pP > 0 ? 'naik' : 'turun'} ${Math.abs(pP)}% dibanding bulan lalu (${rp(ini.pendapatan)} vs ${rp(lalu.pendapatan)}).`);
  if (laba(ini) < 0 && n(ini.pendapatan) > 0) temuan.push(`Bulan ini rugi ${rp(-laba(ini))}: HPP dan biaya lebih besar dari pendapatan.`);
  if (rata3 != null && rata3 > 0) { const p = ubah(ini.pendapatan, rata3); if (p != null && Math.abs(p) >= 20) temuan.push(`Pendapatan bulan ini ${Math.abs(p)}% ${p > 0 ? 'di atas' : 'di bawah'} rata-rata 3 bulan sebelumnya (${rp(rata3)}).`); }
  (d.per_akun || []).filter((a) => a.jenis === 'biaya' && n(a.ini) - n(a.lalu) >= 100000 && (n(a.lalu) === 0 || n(a.ini) >= n(a.lalu) * 1.3))
    .slice(0, 3).forEach((a) => temuan.push(`Biaya “${a.akun}” naik menjadi ${rp(a.ini)} dari ${rp(a.lalu)}. Tinjau transaksi pada akun ini.`));

  // Per lokasi (Pro): kelompokkan per lokasi
  const lok = Object.create(null);
  (d.per_lokasi || []).forEach((x) => { const k = x.lokasi; (lok[k] ||= { lokasi: k, gudang: x.gudang, bulan: {} }).bulan[ym(x.bulan)] = x; });
  const lokasi = Object.values(lok).map((l) => ({ ...l, ini: l.bulan[bln] || {}, lalu: l.bulan[addMonthsYm(bln, -1)] || {} }));
  const totLok = lokasi.reduce((t, l) => t + n(l.ini.pendapatan), 0);
  lokasi.sort((a, b) => n(b.ini.pendapatan) - n(a.ini.pendapatan));
  if (dalam && lokasi.length > 1) {
    const rugi = lokasi.filter((l) => n(l.ini.pendapatan) > 0 && laba(l.ini) < 0);
    rugi.forEach((l) => temuan.push(`${l.lokasi} rugi ${rp(-laba(l.ini))} bulan ini.`));
    if (totLok > 0) temuan.push(`${lokasi[0].lokasi} menyumbang ${Math.round((n(lokasi[0].ini.pendapatan) * 100) / totLok)}% pendapatan bulan ini.`);
  }
  if (thnLalu && n(thnLalu.pendapatan) > 0) { const p = ubah(ini.pendapatan, thnLalu.pendapatan); if (p) temuan.push(`Dibanding ${bulan(ym(thnLalu.bulan))}, pendapatan ${p >= 0 ? 'naik' : 'turun'} ${Math.abs(p)}%.`); }

  const baseline = compare === 'year' && thnLalu ? thnLalu : lalu;
  const yearComparison = baseline === thnLalu;
  const baseLabel = bulan(ym(baseline.bulan || addMonthsYm(bln, -1)));
  const trxSource = d.jenis === 'properti' ? ['/pembayaran', 'Pembayaran'] : d.jenis === 'jasa' ? ['/pesanan', 'Pesanan']
    : d.jenis === 'retail' ? ['/penjualan', 'Penjualan'] : ['/pembukuan', 'Pembukuan'];
  const financialKeys = ['pendapatan', 'hpp', 'biaya'];
  const metrics = [
    { label: 'Pendapatan', icon: 'wallet', value: rp(ini.pendapatan), change: ubah(ini.pendapatan, baseline.pendapatan), accounts: ['pendapatan'], formula: 'Kredit dikurangi debit pada akun pendapatan.' },
    { label: 'Laba', icon: 'coins', value: rp(laba(ini)), change: ubah(laba(ini), laba(baseline)), accounts: financialKeys, formula: 'Pendapatan dikurangi HPP dan biaya. Nilai ini sebelum pajak.' },
    { label: 'HPP (modal barang)', icon: '/barang', value: rp(ini.hpp), change: ubah(ini.hpp, baseline.hpp), accounts: ['hpp'], formula: 'Debit dikurangi kredit pada akun harga pokok penjualan.', expense: true },
    { label: 'Biaya', icon: '/tagihan', value: rp(ini.biaya), change: ubah(ini.biaya, baseline.biaya), accounts: ['biaya'], formula: 'Debit dikurangi kredit pada akun beban, di luar HPP. Nilai negatif berarti kredit bersih dan menambah laba yang dihitung untuk periode ini.', expense: true },
    { label: trxLabel, icon: 'cart', value: angka(ini.transaksi), change: ubah(ini.transaksi, baseline.transaksi), href: trxSource[0], source: trxSource[1], formula: 'Jumlah penjualan selesai, pesanan jasa selesai, atau pembayaran terverifikasi sesuai transaksi yang tercatat.' },
    { label: 'Rata-rata per transaksi', icon: '/analisis', value: rataTrx(ini) == null ? '—' : rp(rataTrx(ini)), change: rataTrx(ini) == null ? null : ubah(rataTrx(ini), rataTrx(baseline)), accounts: ['pendapatan'], formula: `Pendapatan ${rp(ini.pendapatan)} dibagi ${angka(ini.transaksi)} transaksi.` },
    { label: 'Margin laba', icon: '/anggaran', value: percentText(margin(ini)), change: margin(ini) == null ? null : ubah(margin(ini), margin(baseline)), accounts: financialKeys, formula: 'Laba sebelum pajak dibagi pendapatan.' },
    { label: 'Markup atas HPP', icon: '/layers', value: percentText(markup(ini)), change: markup(ini) == null ? null : ubah(markup(ini), markup(baseline)), accounts: ['pendapatan', 'hpp'], formula: 'Laba kotor dibagi HPP. Laba kotor adalah pendapatan dikurangi HPP.' },
  ];
  if (d.hunian) metrics.push({ label: 'Hunian', icon: '/kamar', value: percentText(d.hunian.kamar ? d.hunian.terisi * 100 / d.hunian.kamar : null),
    href: '/kamar', source: 'Kamar', formula: `${d.hunian.terisi} dari ${d.hunian.kamar} kamar terisi berdasarkan sewa aktif saat ini.` });
  const hariMax = Math.max(1, ...(d.hari || []).map((h) => n(h.rata)));
  const level = dalam ? 'Mendalam (Paket Pro)' : lanjut ? 'Lanjutan (Paket Bisnis)' : 'Dasar';

  return (
    <div className={styles.page}>
      <header className={styles.hero}>
        <div className={styles.heroCopy}>
          <h1>Analisis Bisnis</h1>
          <p>Pantau performa bisnis dari jurnal Pembukuan dan transaksi yang tercatat.</p>
          <PageHelp page="analisis" label={<><NavIcon name="/buku-besar" size={17} />Panduan Analisis<NavIcon name="next" size={14} /></>} />
        </div>
        <span className={styles.heroArt}><Image src="/analisis-ringkasan.webp" alt="" fill unoptimized priority /></span>
      </header>
      <nav className={styles.tabs} aria-label="Tampilan analisis">{tabs.map(([key, label, icon]) =>
        <button key={key} aria-pressed={tab === key} onClick={() => setTab(key)}><NavIcon name={icon} /><span>{label}</span></button>
      )}</nav>
      <div className={styles.toolbar}>
        <div className={styles.period}>
          <button onClick={() => changeMonth(addMonthsYm(bln, -1))} aria-label="Bulan sebelumnya"><NavIcon name="prev" size={17} /></button>
          <label><NavIcon name="calendar" size={20} /><b>{bulan(bln)}</b><input type="month" aria-label="Bulan analisis" value={bln} max={thisMonth()} onChange={(event) => changeMonth(event.target.value)} /></label>
          <button disabled={bln >= thisMonth()} onClick={() => changeMonth(addMonthsYm(bln, 1))} aria-label="Bulan berikutnya"><NavIcon name="next" size={17} /></button>
        </div>
        <span className={styles.level}>Tingkat analisis <b>{level}</b></span>
      </div>
      {tab === 'summary' && <>
        <div className={styles.heading}>
          <h2>{yearComparison ? 'Dibanding bulan yang sama tahun lalu' : 'Dibanding bulan lalu'}</h2>
          {dalam && <div className={styles.compare} aria-label="Periode pembanding">
            <button aria-pressed={!yearComparison} onClick={() => setCompare('month')}>vs Bulan Lalu</button>
            <button aria-pressed={yearComparison} disabled={!thnLalu} onClick={() => setCompare('year')}>vs Tahun Lalu</button>
          </div>}
        </div>
        {kosong && <div className="notice">Belum ada transaksi tercatat untuk periode ini.</div>}
        <div className={styles.metrics}>{metrics.map((metric) => <button className={styles.metric} key={metric.label} onClick={() => setDetail(metric)}>
          <span className={styles.icon}><NavIcon name={metric.icon} /></span>
          <span className={styles.metricText}><span>{metric.label}</span><strong className={metric.value.length > 15 ? styles.longValue : undefined}>{metric.value}</strong>{naikTurun(metric.change, !metric.expense)}</span>
        </button>)}</div>
        <p className={styles.explanation}>Pembanding {baseLabel} · Pendapatan {rp(baseline.pendapatan)} · Laba {rp(laba(baseline))}</p>
      </>}
      {n(ini.biaya) < 0 && (tab === 'summary' || tab === 'profit') && <aside className={styles.warning}>
        <NavIcon name="info" /><div><b>Biaya bersih {rp(ini.biaya)}</b><p>Kredit pada akun biaya lebih besar daripada debit. Saldo ini menambah laba yang dilaporkan. Periksa jurnal penyebabnya.</p></div>
        <button onClick={() => setDetail(metrics.find((metric) => metric.label === 'Biaya'))}>Telusuri biaya</button>
      </aside>}
      {lanjut && (tab === 'summary' || tab === 'trend') && <TrendPanel key={tab + bln} kosId={kosId} month={bln} rows={tren} summary={tab === 'summary'} onDetail={() => setTab('trend')} ver={ver} />}
      {tab === 'profit' && <Profitability row={ini} />}
      {tab === 'customers' && <Customers kosId={kosId} month={bln} retail={d.jenis === 'retail'} />}
      {tab === 'products' && d.jenis === 'retail' && lanjut && <InventoryTurnover kosId={kosId} month={bln} />}
      {tab === 'products' && lanjut && !(d.teratas || []).length && <Empty title="Belum ada data produk atau layanan untuk periode ini" />}
      {detail && <MetricDetail key={detail.label} metric={detail} kosId={kosId} month={bln} onClose={() => setDetail(null)} />}

      {tab === 'summary' && temuan.length > 0 && <section className="panel">
        <h3>Insight Bisnis</h3>
        <ul className="small" style={{ margin: 0, paddingLeft: 18 }}>{temuan.map((t, i) => <li key={i}>{t}</li>)}</ul>
        <span className="small muted">Dihitung dari angka di halaman ini — periksa rinciannya di <Link href="/pembukuan">Pembukuan</Link> sebelum mengambil keputusan.</span>
      </section>}

      {!lanjut && ['summary', 'trend', 'products'].includes(tab) && <FiturUpgrade kosId={kosId} owner={owner} event="ANALYTICS.ADVANCED.REQUESTED" title="Analisis lanjutan tersedia mulai Paket Bisnis" text="Grafik tren, biaya dan pendapatan per akun, serta produk atau layanan dengan penjualan tertinggi." />}

      {tab === 'profit' && lanjut && (d.per_akun || []).length > 0 && <section className="panel">
        <h3>Pendapatan & biaya per jenis</h3>
        <div className="list">{d.per_akun.map((a) => (
          <div className="li" key={a.jenis + a.akun}><span className="small">{a.akun}<br /><span className="muted">{a.jenis === 'pendapatan' ? 'Pendapatan' : a.jenis === 'hpp' ? 'HPP' : 'Biaya'} · bulan lalu {rp(a.lalu)}</span></span>
            <span className="small" style={{ textAlign: 'right' }}><b>{rp(a.ini)}</b><br />{naikTurun(ubah(a.ini, a.lalu), a.jenis === 'pendapatan')}</span></div>
        ))}</div>
      </section>}

      {tab === 'products' && lanjut && (d.teratas || []).length > 0 && <section className="panel">
        <h3>{d.jenis === 'jasa' ? 'Layanan' : 'Produk'} dengan penjualan tertinggi</h3>
        <p className="small muted">Diurutkan berdasarkan nilai penjualan dari mesin analisis. Nilai produk berasal dari rincian nota selesai.</p>
        <div className="list">{d.teratas.map((t, i) => (
          <div className="li" key={t.nama + ':' + t.satuan}><span className="small">{i + 1}. {t.nama}<br /><span className="muted">{angka(t.jumlah)} {t.satuan}</span></span>
            <span className="small" style={{ textAlign: 'right' }}><b>{rp(t.nilai)}</b>{t.laba != null && <><br /><span className="muted">laba kotor {rp(t.laba)}</span></>}</span></div>
        ))}</div>
      </section>}

      {tab === 'summary' && lanjut && !dalam && <FiturUpgrade kosId={kosId} owner={owner} plan="pro" event="ANALYTICS.MULTI_BRANCH.REQUESTED" title="Analisis mendalam & multi-cabang tersedia di Paket Pro" text="Bandingkan kinerja tiap cabang, tren 6 bulan per cabang, barang teratas per cabang, bulan yang sama tahun lalu, dan hari paling ramai." />}

      {tab === 'summary' && dalam && d.multi_lokasi && <section className="panel">
        <h3>Perbandingan cabang</h3>
        <span className="small muted">Transaksi tanpa lokasi (mis. biaya bersama) tampil sebagai “Bersama / tanpa lokasi”. Gudang hanya mencatat stok, jadi pendapatannya biasanya nol.</span>
        {lokasi.map((l) => { const share = totLok > 0 ? Math.round((n(l.ini.pendapatan) * 100) / totLok) : 0; const enam = Array.from({ length: 6 }, (_, i) => addMonthsYm(bln, i - 5));
          const maxL = Math.max(1, ...enam.map((m) => n(l.bulan[m]?.pendapatan))); return (
          <div key={l.lokasi} className="tile" style={{ gap: 6 }}>
            <div className="row between"><b className="small">{l.lokasi}</b><span className="small">{share}% pendapatan</span></div>
            <div style={{ height: 6, borderRadius: 3, background: 'var(--line)', overflow: 'hidden' }}><div style={{ width: `${share}%`, height: '100%', background: 'var(--gold)' }} /></div>
            <div className="row between small"><span>Pendapatan {rp(l.ini.pendapatan)} {naikTurun(ubah(l.ini.pendapatan, l.lalu.pendapatan))}</span><span style={{ color: laba(l.ini) < 0 ? 'var(--bad)' : undefined }}>Laba {rp(laba(l.ini))}</span></div>
            <div className="row between small muted"><span>{angka(l.ini.transaksi)} transaksi{rataTrx(l.ini) != null ? ` · rata-rata ${rp(rataTrx(l.ini))}` : ''}</span><span>Biaya {rp(l.ini.biaya)}</span></div>
            <div role="img" aria-label={`Tren 6 bulan ${l.lokasi}`} style={{ display: 'flex', alignItems: 'flex-end', gap: 3, height: 36 }}>
              {enam.map((m) => <div key={m} title={`${bulan(m)}: ${rp(l.bulan[m]?.pendapatan)}`} style={{ flex: 1, height: `${(n(l.bulan[m]?.pendapatan) / maxL) * 100}%`, minHeight: 1, background: m === bln ? 'var(--gold)' : 'color-mix(in srgb, var(--gold) 45%, transparent)', borderRadius: '3px 3px 0 0' }} />)}
            </div>
            <div style={{ display: 'flex', gap: 3 }}>{enam.map((m) => <span key={m} className="muted" style={{ flex: 1, textAlign: 'center', fontSize: 10 }}>{BLN[Number(m.slice(5)) - 1]}</span>)}</div>
            {(d.teratas_lokasi || []).filter((t) => t.lokasi === l.lokasi).length > 0 && <span className="small muted">Teratas: {(d.teratas_lokasi || []).filter((t) => t.lokasi === l.lokasi).map((t) => `${t.nama} (${rp(t.nilai)})`).join(', ')}</span>}
          </div>); })}
      </section>}
      {tab === 'summary' && dalam && !d.multi_lokasi && <div className="notice">Perbandingan cabang muncul setelah Anda punya lebih dari satu lokasi (Konfigurasi › Cabang & gudang).</div>}

      {tab === 'trend' && dalam && Array.isArray(d.hari) && d.hari.some((h) => n(h.rata) > 0) && <section className="panel">
        <h3>Pola hari (90 hari terakhir)</h3>
        <span className="small muted">Rata-rata {d.jenis === 'jasa' ? 'pesanan selesai' : 'penjualan'} per hari dalam seminggu.</span>
        <div className="list">{d.hari.map((h) => (
          <div className="li" key={h.hari} style={{ gap: 8 }}><span className="small" style={{ width: 56 }}>{HARI[h.hari - 1]}</span>
            <div style={{ flex: 1, height: 8, borderRadius: 4, background: 'var(--line)', overflow: 'hidden' }}><div style={{ width: `${(n(h.rata) / hariMax) * 100}%`, height: '100%', background: 'var(--gold)' }} /></div>
            <span className="small" style={{ width: 96, textAlign: 'right' }}>{rp(h.rata)}</span></div>
        ))}</div>
      </section>}
    </div>
  );
}
