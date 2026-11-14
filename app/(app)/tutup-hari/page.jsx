'use client';
// Tutup harian toko. Server: day_close_summary (rekap hidup), day_close (simpan/tutup ulang), day_close_list (riwayat + tanda berubah).
// Tutup harian = rekap & bukti, bukan kunci: transaksi tanggal itu tetap bisa dikoreksi; bila berubah, daftar menandainya.
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { useKos } from '@/components/KosProvider';
import PageHelp from '@/components/PageHelp';
import { Field, Loading, Empty, Tile, toast } from '@/components/ui';
import { rp, angka, parseRp, tgl, today, errMsg } from '@/lib/format';
import { jam } from '@/lib/retail';
import { multiLoc } from '@/lib/business';

const selisih = (d) => (Math.abs(d) < 1 ? 'Pas' : d > 0 ? `Lebih ${rp(d)}` : `Kurang ${rp(-d)}`);

export default function TutupHari() {
  const { kos, kosId, ver } = useKos();
  const branch = multiLoc(kos) ? kos.locs?.current || null : null;
  const locName = branch ? kos.locs?.list?.find((b) => b.id === branch)?.name : null;
  const [day, setDay] = useState(today());
  const [s, setS] = useState(null);
  const [list, setList] = useState(null);
  const [names, setNames] = useState({});
  const [counted, setCounted] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const load = async () => {
    setS(null);
    const [a, b] = await Promise.all([supabase.rpc('day_close_summary', { p_kos: kosId, p_day: day, p_branch: branch }), supabase.rpc('day_close_list', { p_kos: kosId, p_branch: branch })]);
    if (a.error) return setErr(errMsg(a.error));
    setErr(null); setS(a.data); setList(b.data || []);
  };
  useEffect(() => { load(); }, [kosId, ver, day, branch]);
  useEffect(() => { supabase.rpc('member_names', { p_kos: kosId }).then(({ data }) => setNames(data || {})); }, [kosId]);
  if (err) return <div className="notice bad">{err}</div>;
  if (!s || !list) return <Loading />;
  const done = list.find((x) => x.day === day);
  const who = (u) => names[u] || (u ? 'karyawan lama' : 'sistem');
  const book = Number(s.kas.akhir);
  const cn = counted.trim() === '' ? null : parseRp(counted);
  const close = async () => {
    if (done && !window.confirm(`Tanggal ${tgl(day)} sudah ditutup. Tutup ulang dengan angka terbaru? Penutupan lama tetap tersimpan di riwayat.`)) return;
    setBusy(true);
    const { data, error } = await supabase.rpc('day_close', { p_kos: kosId, p_day: day, p_branch: branch, p_counted: cn, p_note: note });
    setBusy(false);
    if (error) return toast(errMsg(error));
    toast(data.diff == null ? 'Hari ditutup' : `Hari ditutup · kas ${selisih(Number(data.diff))}`);
    setCounted(''); setNote(''); load();
  };
  return (
    <div className="stack">
      <div className="row between"><div className="row"><h2>Tutup harian</h2><PageHelp page="tutup-hari" /></div></div>
      <div className="row" style={{ flexWrap: 'nowrap', alignItems: 'flex-end' }}>
        <Field label={locName ? `Tanggal · ${locName}` : 'Tanggal'}><input type="date" max={today()} value={day} onChange={(e) => e.target.value && setDay(e.target.value)} /></Field>
      </div>
      {done && <div className={'notice small ' + (done.berubah ? 'bad' : 'good')}>{done.berubah
        ? <>Sudah ditutup {tgl(done.closed_at.slice(0, 10))} oleh {who(done.closed_by)}, tetapi <b>berubah setelah ditutup</b>: saat ditutup {angka(done.trx)} transaksi · {rp(done.omzet)}, sekarang {angka(done.trx_now)} · {rp(done.omzet_now)}. Periksa Penjualan, lalu tutup ulang.</>
        : <>Sudah ditutup oleh {who(done.closed_by)}{done.cash_counted != null ? ` · kas dihitung ${rp(done.cash_counted)} (${selisih(Number(done.cash_counted) - Number(done.cash_book))})` : ''}.</>}</div>}
      {Number(s.shift_terbuka) > 0 && <div className="notice small">Masih ada {s.shift_terbuka} shift kasir yang belum ditutup. Boleh tetap tutup hari, tetapi sebaiknya <Link href="/shift">tutup shift</Link> dulu agar uang laci terhitung.</div>}
      <div className="grid">
        <Tile label="Penjualan bersih" value={rp(s.omzet)} sub={`${angka(s.trx)} transaksi · tanpa PPN`} />
        <Tile label="Laba kotor" value={rp(s.laba_kotor)} sub={`rata-rata keranjang ${rp(s.rata_keranjang)}`} />
        <Tile label="Saldo kas (catatan)" value={rp(book)} sub={`awal ${rp(s.kas.awal)} · +${rp(s.kas.masuk)} −${rp(s.kas.keluar)}`} />
      </div>
      <section className="panel">
        <h3>Rincian {tgl(day)}</h3>
        <dl className="kv">
          <dt>Penjualan kotor</dt><dd>{rp(s.subtotal)}</dd>
          {Number(s.promo) > 0 && <><dt>Potongan promo</dt><dd>−{rp(s.promo)}</dd></>}
          {Number(s.diskon) > 0 && <><dt>Diskon manual</dt><dd>−{rp(s.diskon)}</dd></>}
          {Number(s.retur) > 0 && <><dt>Retur ({s.retur_n})</dt><dd>−{rp(s.retur)}</dd></>}
          {Number(s.ppn) !== 0 && <><dt>PPN dipungut</dt><dd>{rp(s.ppn)}</dd></>}
          <dt>Tunai</dt><dd>{rp(s.bayar.tunai)}</dd>
          <dt>Transfer / QRIS</dt><dd>{rp(s.bayar.transfer)}</dd>
          <dt>Kasbon baru</dt><dd>{rp(s.bayar.kasbon)}</dd>
          {Number(s.kasbon_diterima) > 0 && <><dt>Kasbon dibayar</dt><dd>{rp(s.kasbon_diterima)}</dd></>}
          {Number(s.batal_n) > 0 && <><dt>Dibatalkan</dt><dd>{s.batal_n} · {rp(s.batal)}</dd></>}
          {Number(s.susut) !== 0 && <><dt>Selisih/rusak stok</dt><dd>{Number(s.susut) > 0 ? '−' : '+'}{rp(Math.abs(s.susut))}</dd></>}
          {s.jam?.pertama && <><dt>Transaksi pertama–terakhir</dt><dd>{jam(s.jam.pertama)}–{jam(s.jam.terakhir)}</dd></>}
        </dl>
      </section>
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
      <section className="panel">
        <h3>{done ? 'Tutup ulang' : 'Tutup hari'}</h3>
        <Field label="Uang tunai yang dihitung (opsional)" hint={`Bandingkan dengan saldo kas menurut catatan: ${rp(book)}. Kosongkan bila uang tidak dihitung hari ini.`}><input inputMode="numeric" value={counted} onChange={(e) => setCounted(e.target.value)} placeholder={angka(book)} /></Field>
        {cn != null && <span className="small" style={{ color: Math.abs(cn - book) < 1 ? 'var(--good)' : 'var(--bad)' }}>{selisih(cn - book)}</span>}
        <Field label="Catatan (opsional)"><input value={note} maxLength={200} onChange={(e) => setNote(e.target.value)} placeholder="mis. uang kurang 5rb, sudah dicek" /></Field>
        <button className="cta" onClick={close} disabled={busy}>{busy ? 'Menyimpan…' : done ? 'Tutup ulang hari ini' : `Tutup hari ${tgl(day)}`}</button>
        <span className="small muted">Transaksi tanggal ini tetap bisa dikoreksi setelah ditutup; bila berubah, riwayat di bawah menandainya.</span>
      </section>
      {list.length > 0 ? <section className="panel">
        <h3>Riwayat tutup harian</h3>
        <div className="list">{list.map((x) => (
          <button key={x.id} className="li click" onClick={() => setDay(x.day)} style={{ background: 'none', border: 0, borderTop: '1px solid var(--line)', borderRadius: 0, textAlign: 'left', width: '100%', font: 'inherit', color: 'inherit' }}>
            <div className="main"><b className="small">{tgl(x.day)}{x.berubah && <span className="chip bad" style={{ marginLeft: 6 }}>Berubah</span>}{x.reclosed > 0 && <span className="chip" style={{ marginLeft: 6 }}>Ditutup {x.reclosed + 1}×</span>}</b>
              <span className="small muted">{angka(x.trx)} transaksi · {who(x.closed_by)}{x.cash_counted != null ? ` · kas ${selisih(Number(x.cash_counted) - Number(x.cash_book))}` : ''}</span></div>
            <b className="small" style={{ flex: 'none' }}>{rp(x.omzet)}</b>
          </button>
        ))}</div>
      </section> : <Empty title="Belum ada hari yang ditutup" text="Tutup hari setiap selesai berjualan: rekap penjualan, cara bayar, per kasir, dan saldo kas tersimpan sebagai bukti." />}
    </div>
  );
}
