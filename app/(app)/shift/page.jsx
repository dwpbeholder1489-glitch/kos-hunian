'use client';
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useKos } from '@/components/KosProvider';
import PageHelp from '@/components/PageHelp';
import { Field, Loading, Empty, run } from '@/components/ui';
import { rp, tgl, errMsg, parseRp, angka } from '@/lib/format';
import { canArea } from '@/lib/business';
import { jam } from '@/lib/retail';

const diffText = (d) => (Math.abs(d) < 1 ? 'Pas' : d > 0 ? `Lebih ${rp(d)}` : `Kurang ${rp(-d)}`);
const money = (v) => (String(v).trim() === '' ? '' : angka(parseRp(v)));

// Shift kasir: buka laci dengan uang awal, tutup dengan menghitung uang; selisih tercatat
export default function Shift() {
  const { kosId, kos, ver } = useKos();
  const sell = canArea(kos, 'sell');
  const fin = canArea(kos, 'finance');
  const [cur, setCur] = useState(undefined);
  const [list, setList] = useState(null);
  const [err, setErr] = useState(null);
  const [cash, setCash] = useState('');
  const [counted, setCounted] = useState('');
  const [note, setNote] = useState('');
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);
  const load = () => {
    if (sell) supabase.rpc('shift_current', { p_kos: kosId }).then(({ data, error }) => (error ? setErr(errMsg(error)) : setCur(data)));
    else setCur(null);
    supabase.rpc('shift_list', { p_kos: kosId }).then(({ data, error }) => (error ? setErr(errMsg(error)) : setList(data)));
  };
  useEffect(() => { load(); }, [kosId, ver]);
  if (err) return <div className="notice bad">{/shift_/.test(err) ? 'Database sedang diperbarui. Coba lagi beberapa menit lagi.' : err}</div>;
  if (cur === undefined || !list) return <Loading />;

  const open = async () => { if (await run(() => supabase.rpc('shift_open', { p_kos: kosId, p_cash: parseRp(cash) }), 'Shift dibuka', errMsg)) { setCash(''); setResult(null); load(); } };
  const close = async () => {
    if (!window.confirm('Tutup shift sekarang? Pastikan uang di laci sudah dihitung.')) return;
    setBusy(true);
    const { data, error } = await supabase.rpc('shift_close', { p_kos: kosId, p_counted: parseRp(counted), p_note: note });
    setBusy(false);
    if (error) return run(async () => { throw error; }, null, errMsg);
    setResult(data); setCounted(''); setNote(''); load();
  };
  const sm = cur?.summary;

  return (
    <div className="stack">
      <div className="row"><h2>Shift kasir</h2><PageHelp page="shift" /></div>
      {result && <div className={'notice ' + (Math.abs(result.diff) < 1 ? 'good' : 'bad')}>Shift ditutup. Seharusnya {rp(result.expected)}, dihitung {rp(result.counted)} — <b>{diffText(Number(result.diff))}</b>.</div>}
      {sell && (!cur ? (
        <section className="panel">
          <h3>Buka shift</h3>
          <p className="small muted" style={{ margin: 0 }}>Hitung uang di laci sebelum mulai jualan. Penjualan tunai Anda selama shift dijumlahkan otomatis. Shift tidak wajib, tapi membantu mencocokkan uang laci.</p>
          <Field label="Uang awal di laci"><input inputMode="numeric" value={cash} onChange={(e) => setCash(money(e.target.value))} placeholder="0" /></Field>
          <button className="primary" onClick={open} disabled={cash === ''}>Buka shift</button>
        </section>
      ) : (
        <section className="panel">
          <h3>Shift berjalan sejak {jam(cur.opened_at)}</h3>
          <div className="list">
            <div className="li"><span className="small">Uang awal</span><b className="small">{rp(cur.opening_cash)}</b></div>
            <div className="li"><span className="small">Penjualan tunai ({sm.trx} transaksi)</span><b className="small">{rp(sm.tunai)}</b></div>
            {Number(sm.retur_tunai) > 0 && <div className="li"><span className="small">Retur dibayar tunai</span><b className="small">−{rp(sm.retur_tunai)}</b></div>}
            <div className="li"><b className="small">Seharusnya di laci</b><b>{rp(sm.expected)}</b></div>
            <div className="li"><span className="small muted">Transfer / kasbon (tidak di laci)</span><span className="small muted">{rp(sm.transfer)} / {rp(sm.kasbon)}</span></div>
          </div>
          <h3 style={{ marginTop: 6 }}>Tutup shift</h3>
          <Field label="Uang di laci setelah dihitung"><input inputMode="numeric" value={counted} onChange={(e) => setCounted(money(e.target.value))} placeholder="0" /></Field>
          {counted !== '' && <span className="small"><b>{diffText(parseRp(counted) - Number(sm.expected))}</b></span>}
          <Field label="Catatan (opsional)"><input value={note} onChange={(e) => setNote(e.target.value)} placeholder="mis. ambil 50.000 untuk beli es" /></Field>
          <button className="primary" onClick={close} disabled={busy || counted === ''}>Tutup shift</button>
        </section>
      ))}
      <section className="panel">
        <h3>{fin ? 'Riwayat shift semua kasir' : 'Riwayat shift Anda'}</h3>
        {list.length === 0 ? <Empty title="Belum ada shift" /> : <div className="list">{list.map((x) => {
          const d = x.closed_at ? Number(x.counted_cash) - Number(x.expected_cash) : null;
          return (
            <div className="li" key={x.id} style={{ alignItems: 'flex-start' }}>
              <div className="main"><b className="small">{tgl(String(x.opened_at).slice(0, 10))} {jam(x.opened_at)}–{x.closed_at ? jam(x.closed_at) : 'sekarang'}</b>
                <span className="small muted">{fin ? `${x.cashier.split('@')[0]} · ` : ''}{x.summary?.trx || 0} transaksi · seharusnya {rp(x.expected_cash)}{x.closed_at ? ` · dihitung ${rp(x.counted_cash)}` : ''}</span>
                {x.note && <span className="small">“{x.note}”</span>}</div>
              {d == null ? <span className="chip gold">Buka</span> : <span className={'chip ' + (Math.abs(d) < 1 ? 'good' : 'bad')}>{diffText(d)}</span>}
            </div>
          );
        })}</div>}
        <span className="small muted">Selisih hanya dicatat, tidak otomatis masuk Kas. Uang laci yang dipakai untuk biaya tetap dicatat di Kas & kasbon.</span>
      </section>
    </div>
  );
}
