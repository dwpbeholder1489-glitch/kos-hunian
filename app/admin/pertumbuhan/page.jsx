'use client';
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useKos } from '@/components/KosProvider';
import PageHelp from '@/components/PageHelp';
import { Empty, Loading, Tile } from '@/components/ui';
import { errMsg, rp, angka } from '@/lib/format';
import { PLANS } from '@/lib/plan';
import { can } from '@/lib/admin';

const PERIODE = [7, 30, 90];
const persen = (n) => (n == null ? '—' : `${n}%`);
const namaPaket = (k) => PLANS[k]?.name || k;

// Growth Analytics (Master Prompt V2 §12). Semua angka dihitung dari data nyata (growth_analytics), tanpa angka tiruan.
export default function Pertumbuhan() {
  const { adminMe } = useKos();
  const [hari, setHari] = useState(30);
  const [d, setD] = useState(null);
  const [err, setErr] = useState(null);
  useEffect(() => {
    if (!can(adminMe, 'finance.view')) return;
    setD(null); setErr(null);
    supabase.rpc('growth_analytics', { p_days: hari }).then(({ data, error }) => (error ? setErr(errMsg(error)) : setD(data)));
  }, [adminMe, hari]);
  if (!can(adminMe, 'finance.view')) return <Empty title="Tidak punya izin melihat pertumbuhan" />;
  if (err) return <div className="notice bad">{err}</div>;
  if (!d) return <Loading />;

  const pemicu = d.pemicu || [];
  const dilihat = pemicu.filter((x) => x.tampil > 0);
  const paling = [...dilihat].sort((a, b) => b.bayar / b.tampil - a.bayar / a.tampil)[0];
  const seringTolak = [...dilihat].sort((a, b) => b.ditolak / b.tampil - a.ditolak / a.tampil)[0];

  return (
    <div className="stack">
      <div className="row"><h2>Pertumbuhan</h2><PageHelp page="admin-pertumbuhan" /></div>
      <div className="seg">{PERIODE.map((n) => <button key={n} className={hari === n ? 'on' : ''} onClick={() => setHari(n)}>{n} hari</button>)}</div>

      <section className="panel">
        <h3>Akuisisi & aktivasi</h3>
        <div className="grid">
          <Tile label="Pemilik baru" value={angka(d.akuisisi.pemilik_baru)} sub="akun pemilik yang membuat bisnis" />
          <Tile label="Pengunjung website" value="Belum dilacak" sub="belum ada pencatatan kunjungan" />
          <Tile label="Bisnis baru" value={angka(d.akuisisi.bisnis_baru)} />
          <Tile label="Bisnis aktif" value={angka(d.aktivasi.bisnis_aktif)} sub="sudah mengaktifkan bisnis" />
          <Tile label="Mulai masa coba" value={angka(d.aktivasi.masa_coba)} sub="14 hari, Paket Dasar" />
        </div>
      </section>

      <section className="panel">
        <h3>Konversi</h3>
        <div className="grid">
          <Tile label="Masa coba → berbayar" value={persen(d.konversi.rasio_masa_coba)} sub={`${angka(d.konversi.masa_coba_ke_bayar)} dari ${angka(d.aktivasi.masa_coba)} bisnis yang mulai masa coba`} />
          <Tile label="Bisnis berbayar" value={angka(d.konversi.bisnis_bayar)} sub="ada pembayaran disetujui" />
          <Tile label="Pendapatan disetujui" value={rp(d.konversi.pendapatan)} sub="tagihan paket yang disetujui" />
        </div>
        {d.konversi.per_paket.length > 0 && (
          <div className="list">{d.konversi.per_paket.map((x) => (
            <div key={`${x.paket}-${x.bulan}`} className="li"><div className="main"><b>{namaPaket(x.paket)}</b><span className="small muted">{x.bulan === 12 ? 'Tahunan' : `${x.bulan} bulan`}</span></div><span className="chip good">{angka(x.jumlah)} aktivasi</span></div>
          ))}</div>
        )}
      </section>

      <section className="panel">
        <h3>Upgrade</h3>
        <div className="grid">
          <Tile label="Dasar → Bisnis" value={angka(d.upgrade.dasar_ke_bisnis)} />
          <Tile label="Bisnis → Pro" value={angka(d.upgrade.bisnis_ke_pro)} />
          <Tile label="Pro bulanan → tahunan" value={angka(d.upgrade.pro_bulanan_ke_tahunan)} />
        </div>
      </section>

      <section className="panel">
        <h3>Retensi</h3>
        <div className="grid">
          <Tile label="Pelanggan aktif" value={angka(d.retensi.pelanggan_aktif)} sub="masa bayar masih berjalan" />
          <Tile label="Jatuh tempo 7 hari" value={angka(d.retensi.jatuh_tempo_7_hari)} />
          <Tile label="Berakhir periode ini" value={angka(d.retensi.berakhir_periode)} sub="masa bayar lewat dalam periode" />
          <Tile label="Diperpanjang" value={angka(d.retensi.diperpanjang)} />
          <Tile label="Tingkat perpanjangan" value={persen(d.retensi.tingkat_perpanjangan)} sub="diperpanjang ÷ berakhir" />
        </div>
      </section>

      <section className="panel">
        <h3>Pendapatan (perkiraan)</h3>
        <div className="grid">
          <Tile label="MRR" value={rp(d.pendapatan.mrr)} sub="pendapatan bulanan berulang" />
          <Tile label="ARR" value={rp(d.pendapatan.arr)} sub="MRR × 12" />
          <Tile label="ARPA" value={d.pendapatan.arpa == null ? '—' : rp(d.pendapatan.arpa)} sub="rata-rata per bisnis aktif" />
        </div>
        <span className="small muted">{d.pendapatan.catatan}</span>
      </section>

      <section className="panel">
        <h3>Kinerja pemicu</h3>
        {pemicu.length === 0 ? <span className="small muted">Belum ada penawaran.</span> : <>
          {efektif && <span className="small">Paling efektif: <b>{efektif.nama}</b> ({persen(Math.round((efektif.bayar * 1000) / efektif.tampil) / 10)} bayar dari tampil)</span>}
          {seringTolak && seringTolak.ditolak > 0 && <span className="small">Paling sering ditolak: <b>{seringTolak.nama}</b> ({persen(Math.round((seringTolak.ditolak * 1000) / seringTolak.tampil) / 10)} dari tampil)</span>}
          <div className="list">{pemicu.map((x) => (
            <div key={x.id} className="li" style={{ alignItems: 'flex-start' }}>
              <div className="main">
                <b className="small">{x.nama}{!x.aktif && ' · nonaktif'}</b>
                <span className="small muted">{x.id}</span>
                <span className="small">Tampil {angka(x.tampil)} · Diklik {angka(x.diklik)} · Ditolak {angka(x.ditolak)} · Checkout {angka(x.checkout)} · Bayar {angka(x.bayar)}</span>
              </div>
              <span className="chip void" title="Bayar ÷ tampil">{x.tampil > 0 ? persen(Math.round((x.bayar * 1000) / x.tampil) / 10) : '—'}</span>
            </div>
          ))}</div>
        </>}
        <span className="small muted">Bayar = bisnis yang checkout lalu pembayarannya disetujui dalam 7 hari. Kampanye diatur di menu Kampanye.</span>
      </section>
    </div>
  );
}
