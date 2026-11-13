'use client';
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useKos } from '@/components/KosProvider';
import PageHelp from '@/components/PageHelp';
import { Empty, Loading, Tile } from '@/components/ui';
import { errMsg, rp, angka, tgl } from '@/lib/format';
import { PLANS, CANCEL_REASONS } from '@/lib/plan';
import { can } from '@/lib/admin';

const PERIODE = [7, 30, 90];
const persen = (n) => (n == null ? '—' : `${n}%`);
const namaPaket = (k) => PLANS[k]?.name || k;
const HALAMAN = { '/': 'Beranda', '/panduan': 'Panduan', '/tentang': 'Tentang', '/masuk': 'Masuk/Daftar', '/mulai': 'Daftar bisnis' };

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
  const efektif = [...dilihat].sort((a, b) => b.bayar / b.tampil - a.bayar / a.tampil)[0];
  const seringTolak = [...dilihat].sort((a, b) => b.ditolak / b.tampil - a.ditolak / a.tampil)[0];
  const ak = d.akuisisi, av = d.aktivasi, kv = d.konversi, rt = d.retensi, pd = d.pendapatan;
  const kunjungan = Object.entries(ak.kunjungan_halaman || {});

  return (
    <div className="stack">
      <div className="row"><h2>Pertumbuhan</h2><PageHelp page="admin-pertumbuhan" /></div>
      <div className="seg">{PERIODE.map((n) => <button key={n} className={hari === n ? 'on' : ''} onClick={() => setHari(n)}>{n} hari</button>)}</div>

      <section className="panel">
        <h3>Akuisisi</h3>
        <div className="grid">
          <Tile label="Kunjungan beranda" value={ak.pengunjung == null ? 'Belum ada data' : angka(ak.pengunjung)} sub="jumlah kunjungan, bukan orang unik" />
          <Tile label="Pemilik baru" value={angka(ak.pemilik_baru)} sub="akun pemilik yang membuat bisnis" />
          <Tile label="Konversi pendaftaran" value={persen(ak.rasio_daftar)} sub="pemilik baru ÷ kunjungan beranda" />
          <Tile label="Bisnis baru" value={angka(ak.bisnis_baru)} />
        </div>
        {kunjungan.length > 0 && <span className="small muted">Kunjungan per halaman: {kunjungan.map(([p, n]) => `${HALAMAN[p] || p} ${angka(n)}`).join(' · ')}</span>}
      </section>

      <section className="panel">
        <h3>Aktivasi</h3>
        <div className="grid">
          <Tile label="Bisnis diaktifkan" value={angka(av.bisnis_aktif)} sub={`${persen(av.rasio_aktivasi)} dari bisnis baru`} />
          <Tile label="Mulai masa coba" value={angka(av.masa_coba)} sub="14 hari, Paket Dasar" />
          <Tile label="Transaksi pertama" value={angka(av.transaksi_pertama)} sub="bisnis baru yang sudah mencatat transaksi" />
        </div>
      </section>

      <section className="panel">
        <h3>Konversi</h3>
        <div className="grid">
          <Tile label="Masa coba → berbayar" value={persen(kv.rasio_masa_coba)} sub={`${angka(kv.masa_coba_ke_bayar)} dari ${angka(av.masa_coba)} bisnis yang mulai masa coba`} />
          <Tile label="Gratis → berbayar" value={angka(kv.gratis_ke_bayar)} sub="aktivasi berbayar dari paket Gratis" />
          <Tile label="Bisnis berbayar" value={angka(kv.bisnis_bayar)} sub="ada pembayaran disetujui" />
          <Tile label="Pendapatan disetujui" value={rp(kv.pendapatan)} sub="tagihan paket yang disetujui" />
        </div>
        {kv.per_paket.length > 0 && (
          <div className="list">{kv.per_paket.map((x) => (
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
          <Tile label="Pelanggan aktif" value={angka(rt.pelanggan_aktif)} sub="masa bayar masih berjalan" />
          <Tile label="Jatuh tempo 7 hari" value={angka(rt.jatuh_tempo_7_hari)} />
          <Tile label="Tingkat perpanjangan" value={persen(rt.tingkat_perpanjangan)} sub={`${angka(rt.diperpanjang)} dari ${angka(rt.berakhir_periode)} masa bayar yang jatuh tempo`} />
          <Tile label="Churn" value={persen(rt.tingkat_churn)} sub={`${angka(rt.berhenti)} tidak diperpanjang ≤ 3 hari setelah jatuh tempo`} />
          <Tile label="Berhenti memperpanjang" value={angka(rt.pembatalan)} sub={`${persen(rt.tingkat_pembatalan)} dari pelanggan aktif`} />
          <Tile label="Tidak aktif 14 hari" value={angka(rt.tidak_aktif_14_hari)} sub="pelanggan aktif tanpa transaksi" />
        </div>
        {rt.alasan.length > 0 ? (
          <>
            <span className="label">Alasan berhenti (opsional diisi pemilik)</span>
            <div className="list">{rt.alasan.map((x) => (
              <div key={x.alasan} className="li"><span className="small">{CANCEL_REASONS[x.alasan] || x.alasan}</span><span className="chip void">{angka(x.jumlah)}</span></div>
            ))}</div>
            {rt.catatan_alasan.length > 0 && <div className="list">{rt.catatan_alasan.map((x, i) => (
              <div key={i} className="li" style={{ flexDirection: 'column', alignItems: 'flex-start' }}>
                <span className="small">“{x.catatan}”</span>
                <span className="small muted">{CANCEL_REASONS[x.alasan] || x.alasan} · {namaPaket(x.paket)} · {tgl(x.tanggal)}</span>
              </div>
            ))}</div>}
          </>
        ) : <span className="small muted">Belum ada alasan berhenti yang diisi pada periode ini.</span>}
      </section>

      <section className="panel">
        <h3>Pendapatan (perkiraan)</h3>
        <div className="grid">
          <Tile label="MRR" value={rp(pd.mrr)} sub="pendapatan bulanan berulang" />
          <Tile label="ARR" value={rp(pd.arr)} sub="MRR × 12" />
          <Tile label="ARPA" value={pd.arpa == null ? '—' : rp(pd.arpa)} sub="rata-rata per bisnis aktif" />
          <Tile label="Dari harga promosi" value={rp(pd.promosi)} sub="dibayar di bawah harga normal" />
          <Tile label="Dari perpanjangan" value={rp(pd.perpanjangan)} />
        </div>
        {pd.per_paket.length > 0 && <div className="list">{pd.per_paket.map((x) => (
          <div key={x.paket} className="li"><b className="small">{namaPaket(x.paket)}</b><span className="small">{rp(x.jumlah)}</span></div>
        ))}</div>}
        <span className="small muted">{pd.catatan}</span>
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
