'use client';

import { useEffect, useRef, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { useKos } from '@/components/KosProvider';
import NavIcon from '@/components/NavIcon';
import PageHelp from '@/components/PageHelp';
import { Field, Loading, Sheet, run } from '@/components/ui';
import { rp, tgl, errMsg, parseRp, angka, today } from '@/lib/format';
import { canArea, pathAllowed } from '@/lib/business';
import { jam } from '@/lib/retail';
import styles from './shift.module.css';

const diffText = (d) => (Math.abs(d) < 1 ? 'Pas' : d > 0 ? `Lebih ${rp(d)}` : `Kurang ${rp(-d)}`);
const money = (v) => (String(v).trim() === '' ? '' : angka(parseRp(v)));
const shiftDate = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Jakarta' });
const presets = [0, 50000, 100000, 200000];

export default function Shift() {
  const { kosId, kos, ver, user } = useKos();
  if (!kosId || !kos || !user) return <Loading />;
  const finance = canArea(kos, 'finance');
  const sell = canArea(kos, 'sell');
  return <ShiftWorkspace key={`${kosId}:${user.id}:${finance}:${sell}`} {...{ kosId, kos, ver, user, finance, sell }} />;
}

function ShiftWorkspace({ kosId, kos, ver, user, finance, sell }) {
  const router = useRouter();
  const history = useRef(null);
  const request = useRef(0);
  const [cur, setCur] = useState(undefined);
  const [list, setList] = useState(null);
  const [err, setErr] = useState(null);
  const [cash, setCash] = useState('');
  const [counted, setCounted] = useState('');
  const [note, setNote] = useState('');
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);
  const [sheet, setSheet] = useState(null);
  const [expanded, setExpanded] = useState(false);
  const [state, setState] = useState('semua');
  const [date, setDate] = useState('');
  const [cashier, setCashier] = useState('');
  const load = async () => {
    const id = ++request.current;
    const [current, shifts] = await Promise.all([
      sell ? supabase.rpc('shift_current', { p_kos: kosId }) : { data: null },
      supabase.rpc('shift_list', { p_kos: kosId }),
    ]);
    if (id !== request.current) return;
    const error = current.error || shifts.error;
    setErr(error ? errMsg(error) : null);
    if (error) return;
    setCur(current.data);
    setList(shifts.data);
  };
  useEffect(() => {
    load();
    return () => { request.current++; };
  }, [ver]);

  const open = async () => {
    if (busy) return;
    setBusy(true);
    if (await run(() => supabase.rpc('shift_open', { p_kos: kosId, p_cash: parseRp(cash) }), 'Shift dibuka', errMsg)) {
      setCash('');
      setResult(null);
      await load();
    }
    setBusy(false);
  };
  const close = async () => {
    if (busy || !window.confirm('Tutup shift sekarang? Pastikan uang di laci sudah dihitung.')) return;
    setBusy(true);
    const { data, error } = await supabase.rpc('shift_close', { p_kos: kosId, p_counted: parseRp(counted), p_note: note });
    if (error) {
      await run(async () => { throw error; }, null, errMsg);
    } else {
      setCur(null);
      setSheet(null);
      setResult(data);
      setCounted('');
      setNote('');
      await load();
    }
    setBusy(false);
  };

  if (err) return <div className="notice bad">{/shift_/.test(err) ? 'Database sedang diperbarui. Coba lagi beberapa menit lagi.' : err}</div>;
  if (cur === undefined || !list) return <Loading />;
  const sm = cur?.summary;
  const name = user.user_metadata?.full_name || user.user_metadata?.name || user.email?.split('@')[0] || 'Kasir';
  const canDeposit = pathAllowed(kos, '/kas');
  const cashiers = finance ? [...new Set(list.map((item) => item.cashier).filter(Boolean))].sort() : [];
  const filtered = list.filter((item) => (
    (state === 'semua' || (state === 'buka' ? !item.closed_at : Boolean(item.closed_at))) &&
    (!date || shiftDate.format(new Date(item.opened_at)) === date) &&
    (!cashier || item.cashier === cashier)
  ));
  const showHistory = () => {
    setExpanded(true);
    history.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return (
    <div className={styles.page}>
      <section className={styles.hero} aria-label="Cashier Shift Management">
        <div className={styles.heroCopy}>
          <h1>Shift Kasir</h1>
          <p>Kelola buka, tutup, dan riwayat shift kasir dengan mudah dan akurat.</p>
          <PageHelp page="shift" label={<><NavIcon name="/buku-besar" size={17} /> Panduan Shift Kasir <NavIcon name="next" size={14} /></>} />
        </div>
        <span className={styles.heroArt}><Image src="/shift-kasir.webp" alt="" fill priority sizes="(max-width: 600px) 38vw, 290px" /></span>
      </section>
      {result && <div role="status" className={'notice ' + (Math.abs(result.diff) < 1 ? 'good' : 'bad')}>Shift ditutup. Seharusnya {rp(result.expected)}, dihitung {rp(result.counted)}. <b>{diffText(Number(result.diff))}</b>.</div>}
      {sell && <>
        <section className={`${styles.panel} ${styles.statusPanel}`} data-open={Boolean(cur)}>
          <span className={styles.statusIcon}><NavIcon name={cur ? 'done' : 'lock'} /></span>
          <div>
            <div className={styles.statusTitle}><h2>Status Shift</h2><span>{cur ? 'Sedang Buka' : 'Belum Buka'}</span></div>
            <p>{cur ? `Dibuka ${tgl(shiftDate.format(new Date(cur.opened_at)))} pukul ${jam(cur.opened_at)} WIB.` : 'Tidak ada shift yang sedang berjalan.'}</p>
            <p className={styles.identity}>Kasir <b>{name}</b></p>
          </div>
        </section>

        <section className={styles.panel}>
          <div className={styles.panelHead}>
            <span><NavIcon name={cur ? 'wallet' : 'play'} /></span>
            <div><h2>{cur ? 'Ringkasan Uang Laci' : 'Buka Shift'}</h2>
              <p>{cur ? 'Perkiraan uang fisik berdasarkan transaksi tunai shift ini.' : 'Mulai sesi kasir untuk mencatat transaksi, pembayaran, dan pergerakan kas.'}</p>
            </div>
          </div>
          {cur ? <dl className={styles.summary}>
            <dt>Uang awal</dt><dd>{rp(cur.opening_cash)}</dd>
            <dt>Penjualan tunai ({angka(sm.trx)} transaksi)</dt><dd>{rp(sm.tunai)}</dd>
            {Number(sm.retur_tunai) > 0 && <><dt>Retur dibayar tunai</dt><dd>−{rp(sm.retur_tunai)}</dd></>}
            <dt>Seharusnya di laci</dt><dd><b>{rp(sm.expected)}</b></dd>
            <dt>Transfer / kasbon (di luar laci)</dt><dd>{rp(sm.transfer)} / {rp(sm.kasbon)}</dd>
          </dl> : <>
            <label className={styles.cashLabel} htmlFor="opening-cash">Uang Awal di Laci <NavIcon name="info" size={17} /></label>
            <span className={styles.cashInput}><NavIcon name="coins" /><span>Rp</span>
              <input id="opening-cash" inputMode="numeric" value={cash} onChange={(event) => setCash(money(event.target.value))} placeholder="0" />
            </span>
            <div className={styles.presets} aria-label="Pilihan cepat uang awal">
              {presets.map((amount) => <button key={amount} aria-pressed={cash !== '' && parseRp(cash) === amount} onClick={() => setCash(angka(amount))}>{rp(amount)}</button>)}
            </div>
            <button className={styles.primary} onClick={open} disabled={busy || cash === ''}><NavIcon name="play" size={19} />{busy ? 'Membuka…' : 'Buka Shift'}</button>
          </>}
        </section>
      </>}

      <div className={styles.actions}>
        <button disabled={!cur || busy} onClick={() => setSheet('close')}><NavIcon name="return" />Tutup<br />Shift</button>
        <button onClick={showHistory}><NavIcon name="/laporan" />Laporan<br />Shift</button>
        <button disabled={!cur || !canDeposit || busy} onClick={() => setSheet('deposit')}><NavIcon name="wallet" />Setor<br />Uang</button>
        <button onClick={() => setSheet('settings')}><NavIcon name="/pengaturan" />Pengaturan<br />Shift</button>
      </div>

      <section className={styles.panel} ref={history}>
        <div className={styles.historyHead}>
          <h2>{finance ? 'Riwayat Shift Semua Kasir' : 'Riwayat Shift Anda'}</h2>
          <button aria-expanded={expanded} onClick={() => setExpanded(!expanded)}>{expanded ? 'Ringkas' : 'Lihat Semua'}<NavIcon name={expanded ? 'prev' : 'next'} size={15} /></button>
        </div>
        {expanded && <div className={styles.filters}>
          <Field label="Status shift"><select value={state} onChange={(event) => setState(event.target.value)}>
            <option value="semua">Semua</option><option value="buka">Buka</option><option value="tutup">Tutup</option>
          </select></Field>
          <Field label="Tanggal buka"><input type="date" max={today()} value={date} onChange={(event) => setDate(event.target.value)} /></Field>
          {finance && cashiers.length > 0 && <Field label="Kasir"><select value={cashier} onChange={(event) => setCashier(event.target.value)}>
            <option value="">Semua kasir</option>{cashiers.map((email) => <option value={email} key={email}>{email}</option>)}
          </select></Field>}
        </div>}
        {list.length === 0 || (expanded && filtered.length === 0) ? <div className={styles.empty}>
          <NavIcon name="calendar" size={34} />
          <b>{list.length ? 'Tidak ada shift yang cocok' : 'Belum ada riwayat shift'}</b>
          <p>{list.length ? 'Ubah filter untuk melihat riwayat lainnya.' : 'Riwayat buka dan tutup shift kasir akan tampil di sini.'}</p>
        </div> : <div className="list">{(expanded ? filtered : list.slice(0, 4)).map((item) => {
          const diff = item.closed_at ? Number(item.counted_cash) - Number(item.expected_cash) : null;
          return <div className="li" key={item.id} style={{ alignItems: 'flex-start' }}>
            <div className="main"><b className="small">{tgl(shiftDate.format(new Date(item.opened_at)))} {jam(item.opened_at)}–{item.closed_at ? jam(item.closed_at) : 'sekarang'}</b>
              <span className="small muted">{finance && item.cashier ? `${item.cashier.split('@')[0]} · ` : ''}{item.summary?.trx || 0} transaksi · seharusnya {rp(item.expected_cash)}{item.closed_at ? ` · dihitung ${rp(item.counted_cash)}` : ''}</span>
              {item.note && <span className="small">“{item.note}”</span>}
            </div>
            {diff == null ? <span className="chip gold">Buka</span> : <span className={'chip ' + (Math.abs(diff) < 1 ? 'good' : 'bad')}>{diffText(diff)}</span>}
          </div>;
        })}</div>}
      </section>
      <aside className={styles.notice}><NavIcon name="info" /><p><b>Catatan.</b> Selisih hanya dicatat, tidak otomatis masuk Kas. Uang laci yang dipakai untuk biaya tetap dicatat di Kas &amp; kasbon.</p></aside>

      {sheet === 'close' && cur && <Sheet title="Tutup Shift" onClose={() => setSheet(null)}>
        <p className="small muted">Seharusnya di laci <b>{rp(sm.expected)}</b></p>
        <Field label="Uang di laci setelah dihitung"><input inputMode="numeric" value={counted} onChange={(event) => setCounted(money(event.target.value))} placeholder="0" /></Field>
        {counted !== '' && <b className="small">{diffText(parseRp(counted) - Number(sm.expected))}</b>}
        <Field label="Catatan (opsional)"><input value={note} onChange={(event) => setNote(event.target.value)} placeholder="mis. ambil 50.000 untuk beli es" /></Field>
        <button className="primary" onClick={close} disabled={busy || counted === ''}>Tutup Shift</button>
      </Sheet>}
      {sheet === 'deposit' && cur && canDeposit && <Sheet title="Setor Uang" onClose={() => setSheet(null)}>
        <p>Catat perpindahan uang kas ke bank lewat Kas &amp; kasbon. Ringkasan shift tetap dihitung dari uang awal, penjualan tunai, dan retur tunai. Gunakan catatan penutupan shift untuk menjelaskan setoran.</p>
        <button className="primary" onClick={() => router.push('/kas?baru=setor_bank')}>Buka Form Setor ke Bank</button>
      </Sheet>}
      {sheet === 'settings' && <Sheet title="Pengaturan Shift" onClose={() => setSheet(null)}>
        <p>Hak melihat riwayat semua kasir mengikuti akses Uang &amp; laporan yang dikelola pemilik bisnis.</p>
        {pathAllowed(kos, '/konfigurasi') && <Link href="/konfigurasi">Buka Konfigurasi Modul</Link>}
        {pathAllowed(kos, '/karyawan') && <Link href="/karyawan">Kelola Hak Akses Karyawan</Link>}
      </Sheet>}
    </div>
  );
}
