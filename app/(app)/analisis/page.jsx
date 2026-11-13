'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { useKos } from '@/components/KosProvider';
import PageHelp from '@/components/PageHelp';
import FiturUpgrade from '@/components/FiturUpgrade';
import { Loading, Tile } from '@/components/ui';
import { rp, angka, errMsg, bulan, thisMonth, addMonthsYm } from '@/lib/format';
import { canArea } from '@/lib/business';

const BLN = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
const HARI = ['Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu', 'Minggu'];
const n = (v) => Number(v || 0);
const laba = (b) => n(b.pendapatan) - n(b.hpp) - n(b.biaya);
const ubah = (a, b) => (n(b) === 0 ? null : Math.round(((n(a) - n(b)) / Math.abs(n(b))) * 100));
const ym = (d) => String(d).slice(0, 7);
const pendek = (d) => BLN[Number(String(d).slice(5, 7)) - 1];
const naikTurun = (p, baikNaik = true) => (p == null ? <span className="small muted">—</span>
  : <span className="small" style={{ color: p === 0 ? undefined : (p > 0) === baikNaik ? 'var(--gold)' : 'var(--bad)' }}>{p > 0 ? '▲' : p < 0 ? '▼' : '='} {Math.abs(p)}%</span>);

// Analisis bisnis bertingkat (V2 §4.1): Dasar = bulan ini vs lalu; Lanjutan (Paket Bisnis) = tren 12 bulan, per akun, teratas;
// Mendalam (Paket Pro) = antar-cabang, tahun lalu, pola hari. Angka uang dari jurnal (sama dengan Pembukuan), dihitung di server (biz_analysis).
export default function Analisis() {
  const { kos, kosId } = useKos();
  const [bln, setBln] = useState(thisMonth());
  const [d, setD] = useState(null);
  const [err, setErr] = useState(null);
  const owner = canArea(kos, 'team');
  useEffect(() => {
    setD(null); setErr(null);
    supabase.rpc('biz_analysis', { p_kos: kosId, p_month: bln + '-01' }).then(({ data, error }) => (error ? setErr(errMsg(error)) : setD(data)));
  }, [kosId, bln]);
  if (err) return <div className="notice bad">{/biz_analysis/.test(err) ? 'Database sedang diperbarui. Coba lagi beberapa menit lagi.' : err}</div>;
  if (!d) return <Loading />;

  const rows = d.per_bulan || [];
  const ini = rows[rows.length - 1] || {};
  const lalu = rows[rows.length - 2] || {};
  const thnLalu = rows.length >= 13 ? rows[0] : null;
  const tren = rows.length >= 13 ? rows.slice(1) : rows;
  const margin = n(ini.pendapatan) > 0 ? Math.round((laba(ini) / n(ini.pendapatan)) * 100) : null;
  const rata3 = tren.length >= 4 ? tren.slice(-4, -1).reduce((t, b) => t + n(b.pendapatan), 0) / 3 : null;
  const rataTrx = (b) => (n(b.transaksi) > 0 ? n(b.pendapatan) / n(b.transaksi) : null);
  const lanjut = d.level !== 'dasar';
  const dalam = d.level === 'mendalam';
  const kosong = rows.every((b) => !n(b.pendapatan) && !n(b.biaya) && !n(b.transaksi));
  const trxLabel = d.jenis === 'properti' ? 'Pembayaran diterima' : d.jenis === 'jasa' ? 'Pesanan selesai' : d.jenis === 'kustom' ? 'Transaksi' : 'Penjualan';

  // Temuan dari data (aturan tetap, bukan tebakan): hanya ditampilkan bila datanya ada
  const temuan = [];
  const pP = ubah(ini.pendapatan, lalu.pendapatan);
  if (pP != null && Math.abs(pP) >= 20) temuan.push(`Pendapatan ${bulan(bln)} ${pP > 0 ? 'naik' : 'turun'} ${Math.abs(pP)}% dibanding bulan lalu (${rp(ini.pendapatan)} vs ${rp(lalu.pendapatan)}).`);
  if (laba(ini) < 0 && n(ini.pendapatan) > 0) temuan.push(`Bulan ini rugi ${rp(-laba(ini))}: HPP dan biaya lebih besar dari pendapatan.`);
  if (rata3 != null && rata3 > 0) { const p = ubah(ini.pendapatan, rata3); if (p != null && Math.abs(p) >= 20) temuan.push(`Pendapatan bulan ini ${Math.abs(p)}% ${p > 0 ? 'di atas' : 'di bawah'} rata-rata 3 bulan sebelumnya (${rp(rata3)}).`); }
  (d.per_akun || []).filter((a) => a.jenis === 'biaya' && n(a.ini) - n(a.lalu) >= 100000 && (n(a.lalu) === 0 || n(a.ini) >= n(a.lalu) * 1.3))
    .slice(0, 3).forEach((a) => temuan.push(`Biaya "${a.akun}" naik menjadi ${rp(a.ini)} (bulan lalu ${rp(a.lalu)}).`));

  // Per lokasi (Pro): kelompokkan per lokasi
  const lok = {};
  (d.per_lokasi || []).forEach((x) => { const k = x.lokasi; (lok[k] ||= { lokasi: k, gudang: x.gudang, bulan: {} }).bulan[ym(x.bulan)] = x; });
  const lokasi = Object.values(lok).map((l) => ({ ...l, ini: l.bulan[bln] || {}, lalu: l.bulan[addMonthsYm(bln, -1)] || {} }));
  const totLok = lokasi.reduce((t, l) => t + n(l.ini.pendapatan), 0);
  lokasi.sort((a, b) => n(b.ini.pendapatan) - n(a.ini.pendapatan));
  if (dalam && lokasi.length > 1) {
    const rugi = lokasi.filter((l) => n(l.ini.pendapatan) > 0 && laba(l.ini) < 0);
    rugi.forEach((l) => temuan.push(`${l.lokasi} rugi ${rp(-laba(l.ini))} bulan ini.`));
    if (totLok > 0) temuan.push(`${lokasi[0].lokasi} menyumbang ${Math.round((n(lokasi[0].ini.pendapatan) * 100) / totLok)}% pendapatan bulan ini.`);
  }
  if (dalam && thnLalu && n(thnLalu.pendapatan) > 0) { const p = ubah(ini.pendapatan, thnLalu.pendapatan); temuan.push(`Dibanding ${bulan(ym(thnLalu.bulan))}, pendapatan ${p >= 0 ? 'naik' : 'turun'} ${Math.abs(p)}%.`); }

  const maxP = Math.max(1, ...tren.map((b) => Math.max(n(b.pendapatan), laba(b))));
  const hariMax = Math.max(1, ...(d.hari || []).map((h) => n(h.rata)));

  return (
    <div className="stack">
      <div className="row"><h2>Analisis bisnis</h2><PageHelp page="analisis" /></div>
      <p className="small muted" style={{ margin: 0 }}>Angka uang diambil dari Pembukuan (jurnal otomatis dari setiap transaksi), jadi sama dengan laporan keuangan. Tingkat analisis: <b>{d.level === 'mendalam' ? 'Mendalam (Paket Pro)' : d.level === 'lanjutan' ? 'Lanjutan (Paket Bisnis)' : 'Dasar'}</b>.</p>
      <div className="row between"><button className="sm ghost" onClick={() => setBln(addMonthsYm(bln, -1))} aria-label="Bulan sebelumnya">‹</button><b>{bulan(bln)}</b>
        <button className="sm ghost" disabled={bln >= thisMonth()} onClick={() => setBln(addMonthsYm(bln, 1))} aria-label="Bulan berikutnya">›</button></div>

      {kosong && <div className="notice">Belum ada transaksi tercatat untuk periode ini. Analisis terisi otomatis dari penjualan, pembayaran, dan pengeluaran yang Anda catat.</div>}

      <section className="panel">
        <h3>Bulan ini vs bulan lalu</h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 8 }}>
          <Tile label="Pendapatan" value={rp(ini.pendapatan)} sub={naikTurun(ubah(ini.pendapatan, lalu.pendapatan))} />
          <Tile label="Laba" value={rp(laba(ini))} sub={naikTurun(ubah(laba(ini), laba(lalu)))} tone={laba(ini) < 0 ? 'bad' : ''} />
          <Tile label="HPP (modal barang)" value={rp(ini.hpp)} sub={naikTurun(ubah(ini.hpp, lalu.hpp), false)} />
          <Tile label="Biaya" value={rp(ini.biaya)} sub={naikTurun(ubah(ini.biaya, lalu.biaya), false)} />
          <Tile label={trxLabel} value={angka(ini.transaksi)} sub={naikTurun(ubah(ini.transaksi, lalu.transaksi))} />
          <Tile label="Rata-rata per transaksi" value={rataTrx(ini) != null ? rp(rataTrx(ini)) : '—'} sub={naikTurun(ubah(rataTrx(ini), rataTrx(lalu)))} />
          <Tile label="Margin laba" value={margin != null ? `${margin}%` : '—'} sub={<span className="small muted">laba ÷ pendapatan</span>} />
          {d.hunian && <Tile label="Hunian" value={d.hunian.kamar ? `${Math.round((d.hunian.terisi * 100) / d.hunian.kamar)}%` : '—'} sub={<span className="small muted">{d.hunian.terisi} dari {d.hunian.kamar} kamar terisi (saat ini)</span>} />}
        </div>
        <span className="small muted">Bulan lalu: pendapatan {rp(lalu.pendapatan)} · laba {rp(laba(lalu))}. Laba = pendapatan − HPP − biaya (sebelum pajak).</span>
      </section>

      {temuan.length > 0 && <section className="panel">
        <h3>Temuan dari data</h3>
        <ul className="small" style={{ margin: 0, paddingLeft: 18 }}>{temuan.map((t, i) => <li key={i}>{t}</li>)}</ul>
        <span className="small muted">Dihitung dari angka di halaman ini — periksa rinciannya di <Link href="/pembukuan">Pembukuan</Link> sebelum mengambil keputusan.</span>
      </section>}

      {!lanjut && <FiturUpgrade kosId={kosId} owner={owner} event="ANALYTICS.ADVANCED.REQUESTED" title="Analisis lanjutan tersedia mulai Paket Bisnis" text="Tren 12 bulan, rata-rata 3 bulan, biaya & pendapatan per jenis, dan 5 barang/layanan paling menghasilkan." />}

      {lanjut && <section className="panel">
        <h3>Tren 12 bulan</h3>
        <div className="row small" style={{ gap: 12 }}><span><span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: 2, background: 'var(--gold)' }} /> Pendapatan</span><span><span style={{ display: 'inline-block', width: 10, height: 3, background: 'var(--fg)', verticalAlign: 'middle' }} /> Laba</span></div>
        <div role="img" aria-label="Grafik pendapatan dan laba 12 bulan" style={{ display: 'flex', alignItems: 'flex-end', gap: 3, height: 140, borderBottom: '1px solid var(--line)' }}>
          {tren.map((b) => { const hp = (n(b.pendapatan) / maxP) * 100; const hl = (Math.max(laba(b), 0) / maxP) * 100; return (
            <div key={b.bulan} title={`${bulan(ym(b.bulan))}: pendapatan ${rp(b.pendapatan)}, laba ${rp(laba(b))}`} style={{ flex: 1, height: '100%', position: 'relative', display: 'flex', alignItems: 'flex-end' }}>
              <div style={{ width: '100%', height: `${hp}%`, background: ym(b.bulan) === bln ? 'var(--gold)' : 'color-mix(in srgb, var(--gold) 55%, transparent)', borderRadius: '4px 4px 0 0', minHeight: n(b.pendapatan) ? 2 : 0 }} />
              {laba(b) !== 0 && <div style={{ position: 'absolute', left: 0, right: 0, bottom: `${hl}%`, height: 2, background: laba(b) < 0 ? 'var(--bad)' : 'var(--fg)' }} />}
            </div>); })}
        </div>
        <div style={{ display: 'flex', gap: 3 }}>{tren.map((b) => <span key={b.bulan} className="small muted" style={{ flex: 1, textAlign: 'center', fontSize: 10 }}>{pendek(b.bulan)}</span>)}</div>
        {rata3 != null && <span className="small">Rata-rata pendapatan 3 bulan sebelumnya: <b>{rp(rata3)}</b> · bulan ini {naikTurun(ubah(ini.pendapatan, rata3))}</span>}
        <details><summary className="small">Lihat tabel</summary>
          <div className="list">{tren.slice().reverse().map((b) => (
            <div className="li" key={b.bulan} style={{ alignItems: 'flex-start' }}><span className="small">{bulan(ym(b.bulan))}<br /><span className="muted">{angka(b.transaksi)} transaksi</span></span>
              <span className="small" style={{ textAlign: 'right' }}>{rp(b.pendapatan)}<br /><span style={{ color: laba(b) < 0 ? 'var(--bad)' : undefined }}>laba {rp(laba(b))}</span></span></div>
          ))}</div>
        </details>
      </section>}

      {lanjut && (d.per_akun || []).length > 0 && <section className="panel">
        <h3>Pendapatan & biaya per jenis</h3>
        <div className="list">{d.per_akun.map((a) => (
          <div className="li" key={a.jenis + a.akun}><span className="small">{a.akun}<br /><span className="muted">{a.jenis === 'pendapatan' ? 'Pendapatan' : a.jenis === 'hpp' ? 'HPP' : 'Biaya'} · bulan lalu {rp(a.lalu)}</span></span>
            <span className="small" style={{ textAlign: 'right' }}><b>{rp(a.ini)}</b><br />{naikTurun(ubah(a.ini, a.lalu), a.jenis === 'pendapatan')}</span></div>
        ))}</div>
      </section>}

      {lanjut && (d.teratas || []).length > 0 && <section className="panel">
        <h3>{d.jenis === 'jasa' ? 'Layanan' : 'Barang'} paling menghasilkan</h3>
        <div className="list">{d.teratas.map((t, i) => (
          <div className="li" key={t.nama}><span className="small">{i + 1}. {t.nama}<br /><span className="muted">{angka(t.jumlah)} {t.satuan}</span></span>
            <span className="small" style={{ textAlign: 'right' }}><b>{rp(t.nilai)}</b>{t.laba != null && <><br /><span className="muted">laba kotor {rp(t.laba)}</span></>}</span></div>
        ))}</div>
      </section>}

      {lanjut && !dalam && <FiturUpgrade kosId={kosId} owner={owner} plan="pro" event="ANALYTICS.MULTI_BRANCH.REQUESTED" title="Analisis mendalam & multi-cabang tersedia di Paket Pro" text="Bandingkan kinerja tiap cabang, tren 6 bulan per cabang, barang teratas per cabang, bulan yang sama tahun lalu, dan hari paling ramai." />}

      {dalam && thnLalu && (n(thnLalu.pendapatan) > 0 || n(thnLalu.transaksi) > 0) && <section className="panel">
        <h3>Bulan yang sama tahun lalu</h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 8 }}>
          <Tile label={`Pendapatan ${bulan(ym(thnLalu.bulan))}`} value={rp(thnLalu.pendapatan)} sub={<span className="small">bulan ini {naikTurun(ubah(ini.pendapatan, thnLalu.pendapatan))}</span>} />
          <Tile label={`Laba ${bulan(ym(thnLalu.bulan))}`} value={rp(laba(thnLalu))} sub={<span className="small">bulan ini {naikTurun(ubah(laba(ini), laba(thnLalu)))}</span>} />
        </div>
      </section>}

      {dalam && d.multi_lokasi && <section className="panel">
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
      {dalam && !d.multi_lokasi && <div className="notice">Perbandingan cabang muncul setelah Anda punya lebih dari satu lokasi (Konfigurasi › Cabang & gudang).</div>}

      {dalam && Array.isArray(d.hari) && d.hari.some((h) => n(h.rata) > 0) && <section className="panel">
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
