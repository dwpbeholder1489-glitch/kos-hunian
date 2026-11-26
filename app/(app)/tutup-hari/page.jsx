'use client';
// Tutup harian toko. Server: day_close_summary (rekap hidup), day_close (simpan/tutup ulang), day_close_list (riwayat + tanda berubah).
// Tutup harian = rekap & bukti, bukan kunci: transaksi tanggal itu tetap bisa dikoreksi; bila berubah, daftar menandainya.
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import NavIcon from '@/components/NavIcon';
import styles from './tutup-hari.module.css';
import { supabase } from '@/lib/supabase';
import { useKos } from '@/components/KosProvider';
import PageHelp from '@/components/PageHelp';
import { Field, Loading, Sheet, toast } from '@/components/ui';
import { rp, angka, parseRp, tgl, today, errMsg } from '@/lib/format';
import { jam } from '@/lib/retail';
import { multiLoc, pathAllowed } from '@/lib/business';

const selisih = (d) => (Math.abs(d) < 1 ? 'Pas' : d > 0 ? `Lebih ${rp(d)}` : `Kurang ${rp(-d)}`);

export default function TutupHari() {
  const { kos, kosId, ver } = useKos();
  const branch = multiLoc(kos) ? kos.locs?.current || null : null;
  if (!kosId || !kos) return <Loading />;
  return <ClosingWorkspace key={`${kosId}:${branch ?? ''}`} {...{ kos, kosId, ver, branch }} />;
}

function ClosingWorkspace({ kos, kosId, ver, branch }) {
  const locName = branch ? kos.locs?.list?.find((b) => b.id === branch)?.name : null;
  const [day, setDay] = useState(today());
  const [s, setS] = useState(null);
  const [list, setList] = useState(null);
  const [names, setNames] = useState({});
  const [counted, setCounted] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const [sheet, setSheet] = useState(null);
  const [detail, setDetail] = useState(false);
  const request = useRef(0);
  const load = async () => {
    const id = ++request.current;
    setS(null);
    const [a, b] = await Promise.all([
      supabase.rpc('day_close_summary', { p_kos: kosId, p_day: day, p_branch: branch }),
      supabase.rpc('day_close_list', { p_kos: kosId, p_branch: branch }),
    ]);
    if (id !== request.current) return;
    const error = a.error || b.error;
    setErr(error ? errMsg(error) : null);
    if (error) return;
    setS(a.data);
    setList((b.data || []).filter((entry) => (entry.branch_id ?? null) === branch));
  };
  useEffect(() => {
    load();
    return () => { request.current++; };
  }, [kosId, ver, day, branch]);
  useEffect(() => { supabase.rpc('member_names', { p_kos: kosId }).then(({ data }) => setNames(data || {})); }, [kosId]);

  const chooseDay = (value) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || value > today() || busy) return;
    setSheet(null);
    if (value === day) return;
    setCounted('');
    setNote('');
    setDetail(false);
    setS(null);
    setDay(value);
  };

  const done = list?.find((entry) => entry.day === day);
  const who = (id) => names[id] || (id ? 'karyawan lama' : 'sistem');
  const book = Number(s?.kas.akhir);
  const validCash = counted.trim() === '' || (/\d/.test(counted) && !/[-−]/.test(counted));
  const cn = counted.trim() === '' ? null : parseRp(counted);
  const close = async () => {
    if (!s || busy || !validCash) return;
    setBusy(true);
    const { data, error } = await supabase.rpc('day_close', { p_kos: kosId, p_day: day, p_branch: branch, p_counted: cn, p_note: note });
    if (error) {
      setBusy(false);
      return toast(errMsg(error));
    }
    toast(data.diff == null ? 'Hari ditutup' : `Hari ditutup · kas ${selisih(Number(data.diff))}`);
    setSheet(null);
    setCounted('');
    setNote('');
    await load();
    setBusy(false);
  };
  const share = async () => {
    const title = `Rekap Tutup Harian · ${tgl(day)}`;
    const text = [
      kos.name, locName, title,
      `Status: ${done ? (done.berubah ? 'Berubah setelah ditutup' : 'Sudah ditutup') : 'Belum ditutup'}`,
      `Penjualan bersih: ${rp(s.omzet)} · ${angka(s.trx)} transaksi`,
      `Laba kotor: ${rp(s.laba_kotor)}`,
      `Saldo kas (catatan): ${rp(book)}`,
      `Rata-rata keranjang: ${rp(s.rata_keranjang)}`,
    ].filter(Boolean).join('\n');
    try {
      if (navigator.share) await navigator.share({ title, text });
      else if (navigator.clipboard) {
        await navigator.clipboard.writeText(text);
        toast('Rekap disalin');
      } else throw new Error();
    } catch (error) {
      if (error?.name !== 'AbortError') toast('Rekap belum bisa dibagikan. Gunakan Cetak Rekap.');
    }
  };

  return (
    <div className={styles.page}>
      <section className={styles.hero} aria-label="Daily Closing Center">
        <div className={styles.heroCopy}>
          <h1>Tutup Harian</h1>
          <p>Rekap penjualan, kas, dan transaksi harian, lalu tutup hari berjalan.</p>
          <PageHelp page="tutup-hari" label={<><NavIcon name="/buku-besar" size={17} /> Panduan Tutup Harian <NavIcon name="next" size={14} /></>} />
        </div>
        <span className={styles.heroArt}><Image src="/tutup-harian.webp" alt="" fill priority sizes="(max-width: 600px) 36vw, 290px" /></span>
      </section>
      <div className={styles.dateRow}>
        <label className={styles.datePicker}>
          <NavIcon name="calendar" /><span>Tanggal</span><b>{tgl(day)}</b>
          {locName && <small>{locName}</small>}<NavIcon name="down" size={17} />
          <input type="date" aria-label={locName ? `Tanggal · ${locName}` : 'Tanggal'} max={today()} value={day} onChange={(event) => chooseDay(event.target.value)} disabled={busy} />
        </label>
      </div>
      {err ? <div className="notice bad">{err}</div> : !s || !list ? <Loading /> : <>
        <div className={styles.printHeading}><h1>Rekap Tutup Harian</h1><p>{kos.name} · {tgl(day)}{locName ? ` · ${locName}` : ''}</p></div>
        <div className={styles.status}>
          <span className={'chip ' + (done ? done.berubah ? 'bad' : 'good' : 'gold')}>{done ? done.berubah ? 'Berubah Setelah Ditutup' : 'Sudah Ditutup' : 'Belum Ditutup'}</span>
          {done && <small>Ditutup oleh {who(done.closed_by)}{done.cash_counted != null ? ` · kas fisik ${rp(done.cash_counted)} · ${selisih(Number(done.cash_counted) - Number(done.cash_book))}` : ''}</small>}
          <button onClick={() => setSheet('history')}><NavIcon name="/shift" size={16} />Riwayat</button>
        </div>
        {done?.berubah && <p className="notice small bad">Saat ditutup {angka(done.trx)} transaksi · {rp(done.omzet)}. Sekarang {angka(done.trx_now)} transaksi · {rp(done.omzet_now)}. Periksa rincian sebelum tutup ulang.</p>}
        <div className={styles.metrics}>
          <ClosingMetric icon="/penjualan" tone="green" label="Penjualan Bersih" value={rp(s.omzet)} caption={`${angka(s.trx)} transaksi · tanpa PPN`} />
          <ClosingMetric icon="/laporan" tone="blue" label="Laba Kotor" value={rp(s.laba_kotor)} caption={Number(s.omzet) > 0 ? `${angka(Math.round(Number(s.laba_kotor) / Number(s.omzet) * 1000) / 10)}% dari penjualan` : null} />
          <ClosingMetric icon="wallet" tone="gold" label="Saldo Kas (Catatan)" value={rp(book)} caption={`Awal ${rp(s.kas.awal)} + ${rp(s.kas.masuk)} − ${rp(s.kas.keluar)}`} />
          <ClosingMetric icon="/belanja" tone="mint" label="Rata-rata Keranjang" value={rp(s.rata_keranjang)} caption="Per transaksi" />
        </div>
        <div className={styles.actions}>
          <button className={styles.primary} disabled={busy} onClick={() => setSheet('confirm')}><NavIcon name="lock" />{done ? 'Tutup Ulang' : day === today() ? 'Tutup Hari Ini' : 'Tutup Hari'}</button>
          <button onClick={() => window.print()}><NavIcon name="print" />Cetak Rekap</button>
          <button onClick={share}><NavIcon name="share" />Bagikan</button>
        </div>
        <section className={styles.panel}>
          <div className={styles.panelHead}><h2>Rincian {tgl(day)}</h2>
            {(s.kasir.length > 0 || s.shift.length > 0) && <button aria-expanded={detail} onClick={() => setDetail(!detail)}>{detail ? 'Ringkas' : 'Lihat Detail'}<NavIcon name={detail ? 'prev' : 'next'} size={15} /></button>}
          </div>
          <dl className={styles.lines}>
            <ClosingLine icon="/penjualan" label="Penjualan kotor">{rp(s.subtotal)}</ClosingLine>
            {Number(s.promo) > 0 && <ClosingLine icon="/promo" label="Potongan promo">−{rp(s.promo)}</ClosingLine>}
            {Number(s.diskon) > 0 && <ClosingLine icon="/promo" label="Diskon manual">−{rp(s.diskon)}</ClosingLine>}
            {Number(s.retur) > 0 && <ClosingLine icon="return" label={`Retur (${s.retur_n})`}>−{rp(s.retur)}</ClosingLine>}
            {Number(s.ppn) !== 0 && <ClosingLine icon="/resep" label="PPN dipungut">{rp(s.ppn)}</ClosingLine>}
            <ClosingLine icon="wallet" label="Tunai">{rp(s.bayar.tunai)}</ClosingLine>
            <ClosingLine icon="/pembayaran" label="Transfer / QRIS">{rp(s.bayar.transfer)}</ClosingLine>
            <ClosingLine icon="/kontak" label="Kasbon baru">{rp(s.bayar.kasbon)}</ClosingLine>
            {Number(s.kasbon_diterima) > 0 && <ClosingLine icon="coins" label="Kasbon dibayar">{rp(s.kasbon_diterima)}</ClosingLine>}
            {Number(s.batal_n) > 0 && <ClosingLine icon="return" label="Dibatalkan">{s.batal_n} · {rp(s.batal)}</ClosingLine>}
            {Number(s.susut) !== 0 && <ClosingLine icon="/barang" label="Selisih/rusak stok">{Number(s.susut) > 0 ? '−' : '+'}{rp(Math.abs(s.susut))}</ClosingLine>}
            {s.jam?.pertama && <ClosingLine icon="/shift" label="Transaksi pertama – terakhir">{jam(s.jam.pertama)}–{jam(s.jam.terakhir)}</ClosingLine>}
          </dl>
        </section>
        <div className={styles.details} data-expanded={detail}>
        {s.kasir.length > 0 && <section className="panel">
          <h3>Per kasir</h3>
          <div className="list">{s.kasir.map((k) => (
            <div className="li" key={k.user_id || 'x'} style={{ alignItems: 'flex-start' }}>
              <div className="main"><b className="small">{who(k.user_id)}</b><span className="small muted">{angka(k.trx)} transaksi · tunai {rp(k.tunai)}{Number(k.retur_n) ? ` · retur ${k.retur_n}` : ''}{Number(k.batal_n) ? ` · batal ${k.batal_n}` : ''}</span></div>
              <b className="small" style={{ flex: 'none' }}>{rp(k.omzet)}</b>
            </div>
          ))}</div>
        </section>}
        {s.shift.length > 0 && <section className="panel">
          <h3>Shift hari ini</h3>
          <div className="list">{s.shift.map((x, i) => (
            <div className="li" key={i}><div className="main"><b className="small">{who(x.user_id)}</b><span className="small muted">{jam(x.opened_at)}–{x.closed_at ? jam(x.closed_at) : 'belum ditutup'}</span></div>
              <span className="small" style={{ flex: 'none', color: x.closed_at && Math.abs(Number(x.diff)) >= 1 ? 'var(--bad)' : 'var(--muted)' }}>{x.closed_at ? selisih(Number(x.diff)) : '—'}</span></div>
          ))}</div>
        </section>}
        </div>
        <aside className={styles.notice}><NavIcon name="info" /><p><b>Catatan.</b> Saldo kas mengikuti catatan harian. Koreksi transaksi tetap dapat dilakukan dan perubahan rekap dapat diperiksa lewat Riwayat.</p></aside>
        {sheet === 'confirm' && <Sheet title={done ? 'Konfirmasi Tutup Ulang' : 'Konfirmasi Tutup Hari'} onClose={() => { if (!busy) setSheet(null); }}>
          <p><b>{tgl(day)}</b>{locName ? ` · ${locName}` : ''} · saldo kas menurut catatan <b>{rp(book)}</b>.</p>
          {done && <div className="notice small">Penutupan sebelumnya tetap tersimpan di log penutupan.</div>}
          {Number(s.shift_terbuka) > 0 && <div className="notice small">Masih ada {angka(s.shift_terbuka)} shift terbuka. {pathAllowed(kos, '/shift') && <Link href="/shift">Periksa Shift Kasir</Link>}</div>}
          <Field label="Uang tunai yang dihitung (opsional)" hint="Kosongkan bila uang fisik tidak dihitung."><input inputMode="numeric" value={counted} onChange={(event) => setCounted(event.target.value)} placeholder={angka(book)} /></Field>
          {!validCash && <p className="small notice bad">Masukkan nominal uang tunai yang tidak negatif.</p>}
          {validCash && cn != null && <div role="status" className={'notice ' + (Math.abs(cn - book) < 1 ? 'good' : 'bad')}>Selisih kas <b>{selisih(cn - book)}</b></div>}
          <Field label="Catatan (opsional)"><input value={note} maxLength={200} onChange={(event) => setNote(event.target.value)} placeholder="mis. uang kurang 5rb, sudah dicek" /></Field>
          <button className="cta" onClick={close} disabled={busy || !validCash}>{busy ? 'Menyimpan…' : done ? 'Simpan Tutup Ulang' : 'Konfirmasi Tutup Hari'}</button>
        </Sheet>}
        {sheet === 'history' && <Sheet title="Riwayat Tutup Harian" onClose={() => setSheet(null)}>
          {list.length === 0 ? <p>Belum ada hari yang ditutup.</p> : <div className="list">{list.map((entry) => (
            <button key={entry.id} className={`li click ${styles.historyItem}`} onClick={() => chooseDay(entry.day)}>
              <span className="main"><b>{tgl(entry.day)}{entry.berubah && <span className="chip bad">Berubah</span>}{entry.reclosed > 0 && <span className="chip">Ditutup {entry.reclosed + 1}×</span>}</b>
                <small>{angka(entry.trx)} transaksi · {who(entry.closed_by)}{entry.cash_counted != null ? ` · kas ${selisih(Number(entry.cash_counted) - Number(entry.cash_book))}` : ''}</small></span>
              <b>{rp(entry.omzet)}</b>
            </button>
          ))}</div>}
        </Sheet>}
      </>}
    </div>
  );
}

function ClosingMetric({ icon, tone, label, value, caption }) {
  return <article className={styles.metric} data-tone={tone}>
    <span className={styles.metricIcon}><NavIcon name={icon} /></span>
    <div><b>{label}</b><strong>{value}</strong>{caption && <small>{caption}</small>}</div>
  </article>;
}

function ClosingLine({ icon, label, children }) {
  return <div><dt><NavIcon name={icon} />{label}</dt><dd>{children}</dd></div>;
}
