'use client';
// KPI industri (Tahap J Master Blueprint BI): angka mentah industry_kpi (data yang sudah dicatat) → rumus lib/industryKpi.js.
// Toko memakai Indikator toko (retail_kpi) di Laporan toko; bisnis kustom belum punya KPI industri.
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import FiturUpgrade from '@/components/FiturUpgrade';
import { Loading } from '@/components/ui';
import { errMsg, tgl } from '@/lib/format';
import { industryKpis, delta, good, fmtKpi } from '@/lib/industryKpi';
import { DetailSheet } from './Details';
import styles from './analisis.module.css';

const dTxt = (d) => (d == null ? '' : `${d.v >= 0 ? '+' : '−'}${Math.abs(d.v).toLocaleString('id-ID', { maximumFractionDigits: 1 })}${d.kind === 'pp' ? ' poin' : '%'}`);

export default function IndustryModule({ kosId, range, cmp, ver, owner, jenis }) {
  const [st, setSt] = useState(null);
  const [open, setOpen] = useState(null);
  const skip = jenis !== 'jasa' && jenis !== 'properti';
  useEffect(() => {
    if (skip) return;
    let on = true; setSt(null);
    supabase.rpc('industry_kpi', { p_kos: kosId, p_from: range.from, p_to: range.to, p_cmp_from: cmp?.from || null, p_cmp_to: cmp?.to || null })
      .then(({ data, error }) => on && setSt(error ? { error } : { data }));
    return () => { on = false; };
  }, [kosId, range.from, range.to, cmp?.from, cmp?.to, ver, skip]);

  if (jenis === 'retail') return <section className={styles.card}><h2 className={styles.cardT}>KPI Industri</h2>
    <p className={styles.note}>Untuk toko, indikator industri (rata-rata keranjang, margin, perputaran & hari persediaan, stok habis, susut, selisih laci per kasir) sudah ada di <Link href="/laporan-toko">Laporan toko › Indikator toko</Link>.</p></section>;
  if (skip) return <section className={styles.card}><h2 className={styles.cardT}>KPI Industri</h2>
    <p className={styles.note}>KPI industri untuk jenis usaha ini <b>Dalam rencana</b> — belum ada data operasional khusus yang tercatat. Pakai kotak ringkasan di Beranda yang diatur dari jenis data Anda.</p></section>;
  if (!st) return <Loading rows={4} />;
  if (st.error) return <p className="notice bad" role="alert">{/industry_kpi/.test(st.error.message || '') ? 'Database sedang diperbarui. Coba lagi beberapa menit lagi.' : errMsg(st.error)}</p>;
  if (!st.data.aktif) return <FiturUpgrade kosId={kosId} owner={owner} event="ANALYTICS.ADVANCED.REQUESTED" title="KPI industri tersedia mulai Paket Bisnis"
    text={jenis === 'properti' ? 'Hunian rata-rata, uang masuk per kamar, tepat bayar, tunggakan, lama tinggal, dan konversi booking.' : 'Pendapatan per kg, lama proses, tepat janji, cuci ulang, keluhan, food cost, perputaran meja, dan pelanggan kembali.'} />;
  const list = industryKpis(st.data);
  const c = st.data.cur;
  return <section className={styles.card}>
    <div className={styles.cardH}><h2 className={styles.cardT}>KPI Industri · {c.kuliner ? 'Kuliner' : jenis === 'properti' ? 'Kos & properti' : 'Jasa & laundry'}</h2></div>
    <p className={styles.note}>{tgl(c.dari)} – {tgl(c.sampai)}{st.data.cmp ? ` · dibanding ${tgl(st.data.cmp.dari)} – ${tgl(st.data.cmp.sampai)}` : ''} · hanya dari data yang sudah dicatat. Ketuk untuk cara hitung.</p>
    <div className={styles.ratioGroup}>{list.map((k) => { const d = delta(k); const g = good(k, d);
      return <button key={k.key} type="button" className={styles.ratio} onClick={() => setOpen(k)}>
        <span>{k.label}{d && <small className={g == null ? styles.muted : g ? styles.good : styles.neg}> {dTxt(d)}</small>}</span>
        <b className={k.value == null ? styles.muted : undefined}>{fmtKpi(k)}</b></button>; })}</div>
    <p className={styles.note}>Belum dihitung karena datanya belum dicatat: {jenis === 'properti' ? 'biaya per kamar, alasan keluar yang terstruktur, dan sumber calon penghuni per kanal'
      : c.kuliner ? 'jumlah tamu per meja, lama tamu duduk, dan sumber pesanan per kanal (WA/ojek online)' : 'utilisasi mesin/kapasitas per jam, berat per kantong, dan sumber pesanan per kanal (WA/marketplace)'}. Tambah pencatatannya dulu bila diperlukan.</p>
    {open && <DetailSheet title={open.label} value={fmtKpi(open)} onClose={() => setOpen(null)} formula={open.formula} sub={open.value == null ? open.reason : null}
      rows={[st.data.cmp && ['Pembanding', fmtKpi(open, open.prev)], open.better && ['Arah yang baik', open.better === 'up' ? 'Makin tinggi makin baik' : 'Makin rendah makin baik']]} />}
  </section>;
}
