'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { useKos } from '@/components/KosProvider';
import PageHelp from '@/components/PageHelp';
import { Field, Loading, Empty, Tile, toast, run } from '@/components/ui';
import { rp, tgl, errMsg, bulan, today, monthEnd, addMonthsYm, parseRp } from '@/lib/format';
import { canArea } from '@/lib/business';
import { hasFeature } from '@/lib/plan';
import FiturUpgrade from '@/components/FiturUpgrade';

const TYPE = { aset: 'Aset', kewajiban: 'Kewajiban', ekuitas: 'Ekuitas', pendapatan: 'Pendapatan', beban: 'Beban' };
const KIND = { posting: ['Otomatis', ''], koreksi: ['Koreksi', 'gold'], manual: ['Manual', 'void'] };
const SRC = { sale: 'Penjualan', return: 'Retur', purchase: 'Belanja', debt_payment: 'Kasbon/utang', stock_move: 'Stok', expense: 'Pengeluaran', cash_entry: 'Kas', payment: 'Pembayaran sewa', purchase_return: 'Retur ke supplier', svc_order: 'Pesanan jasa', svc_payment: 'Pembayaran jasa', deposit: 'Deposit penghuni', booking: 'Booking kamar', bb_record: 'Uang masuk catatan' };
const srcHref = (t, id, retail) => ({ sale: `/struk/${id}`, return: '/penjualan', purchase: '/belanja', debt_payment: '/kas', stock_move: '/barang', expense: retail ? '/kas' : '/pengeluaran', cash_entry: '/kas', payment: '/pembayaran', purchase_return: '/belanja', svc_order: `/nota/${id}`, svc_payment: '/pesanan', deposit: '/penghuni', booking: '/booking', bb_record: `/catatan?buka=${id}` }[t]);
const sum = (xs, f) => xs.reduce((s, x) => s + f(x), 0);

// Pembukuan (blueprint 5.1, 22): jurnal double-entry otomatis dari transaksi, laporan per bisnis atau per badan usaha
export default function Pembukuan() {
  const { kos, kosId, ver } = useKos();
  const owner = canArea(kos, 'team');
  const retail = ['retail', 'jasa', 'kustom'].includes(kos?.business_type); // biaya dicatat di Kas
  const [tab, setTab] = useState('laporan');
  const [ym, setYm] = useState(today().slice(0, 7));
  const [ytd, setYtd] = useState(false);
  const [entity, setEntity] = useState(false);
  const [d, setD] = useState(null);
  const [err, setErr] = useState(null);
  const from = ytd ? ym.slice(0, 4) + '-01-01' : ym + '-01';
  const to = monthEnd(ym);
  const load = async () => {
    setD(null); setErr(null);
    const { data, error } = await supabase.rpc('acct_report', { p_kos: kosId, p_entity: entity, p_from: from, p_to: to });
    if (error) { if (entity) setEntity(false); return setErr(errMsg(error)); }
    setD(data);
  };
  useEffect(() => { load(); }, [kosId, ver, ym, ytd, entity]);

  const period = ytd ? `Jan–${bulan(ym)}` : bulan(ym);
  return (
    <div className="stack">
      <div className="row"><h2>Pembukuan</h2><PageHelp page="pembukuan" /></div>
      <p className="small muted" style={{ margin: 0 }}>Jurnal dibuat otomatis dari transaksi yang sudah Anda catat (penjualan, belanja, kas, pembayaran, stok). Transaksi yang dibatalkan atau diubah tidak dihapus dari jurnal — sistem membuat jurnal pembalikan.</p>
      <div className="row">
        <button className="sm ghost" onClick={() => setYm(addMonthsYm(ym, -1))}>‹</button>
        <b>{period}</b>
        <button className="sm ghost" disabled={ym >= today().slice(0, 7)} onClick={() => setYm(addMonthsYm(ym, 1))}>›</button>
        <label className="row small"><input type="checkbox" style={{ width: 22, minHeight: 22 }} checked={ytd} onChange={(e) => setYtd(e.target.checked)} />Sejak awal tahun</label>
      </div>
      {kos?.legal_entity_id && hasFeature(kos, 'laporan_lanjutan') && <div className="seg">
        <button className={!entity ? 'on' : ''} onClick={() => setEntity(false)}>Bisnis ini</button>
        <button className={entity ? 'on' : ''} onClick={() => setEntity(true)}>Seluruh badan usaha</button>
      </div>}
      <div className="seg">
        {[['laporan', 'Laporan'], ['buku', 'Buku besar'], ['jurnal', 'Jurnal'], ['bank', 'Rekonsiliasi bank'], ...(owner ? [['periode', 'Periode & manual']] : [])].map(([k, l]) => <button key={k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>{l}</button>)}
      </div>
      {err && <div className="notice bad">{/acct_report/.test(err) ? 'Database sedang diperbarui. Coba lagi beberapa menit lagi.' : err}</div>}
      {!d && !err ? <Loading /> : d && <>
        <Meta d={d} entity={entity} />
        {tab === 'laporan' && <Laporan d={d} period={period} kosId={kosId} owner={owner} />}
        {tab === 'laporan' && !entity && <ArusKas kosId={kosId} from={from} to={to} period={period} owner={owner} ver={ver} />}
        {tab === 'buku' && (d.ringkas
          ? <FiturUpgrade kosId={kosId} owner={owner} event="REPORT.ADVANCED_REQUESTED" title="Rincian buku besar tersedia mulai Paket Bisnis" text="Lihat setiap mutasi dan saldo per akun (mis. Kas, Bank, Piutang), lengkap dengan transaksi asalnya. Laba rugi dan neraca ringkas tetap ada di tab Laporan." />
          : <BukuBesar d={d} kosId={kosId} entity={entity} from={from} to={to} retail={retail} />)}
        {tab === 'jurnal' && <Jurnal kosId={kosId} from={from} to={to} retail={retail} ver={ver} />}
        {tab === 'periode' && owner && <Periode d={d} kosId={kosId} ym={ym} onDone={load} />}
        {tab === 'bank' && <RekonBank kosId={kosId} ym={ym} owner={owner} ver={ver} />}
      </>}
    </div>
  );
}

// Keterangan wajib di setiap laporan (blueprint 22.3): cakupan, waktu dibuat, basis, kelengkapan
function Meta({ d, entity }) {
  const c = d.checks || {};
  const warn = [c.no_cost_sales > 0 && `${c.no_cost_sales} penjualan barang tanpa harga modal (HPP kurang)`, c.pending_payments > 0 && `${c.pending_payments} pembayaran belum diverifikasi (belum masuk jurnal)`,
    c.negative_stock > 0 && `${c.negative_stock} barang stoknya minus`, !c.balanced && 'Total debit ≠ kredit — hubungi bantuan'].filter(Boolean);
  const bases = [...new Set((d.businesses || []).map((b) => b.basis))];
  return (
    <div className="notice" style={{ fontSize: 13 }}>
      Cakupan: <b>{entity && d.entity ? `${d.entity.name} — ${d.businesses.map((b) => b.name).join(', ')}` : d.businesses?.[0]?.name}</b> · dibuat {new Date(d.generated_at).toLocaleString('id-ID', { timeZone: 'Asia/Jakarta', dateStyle: 'medium', timeStyle: 'short' })}
      {d.posted_now > 0 && ` · ${d.posted_now} jurnal baru diposting`}<br />
      Basis: {bases.join(' + ')}{bases.length > 1 && ' (berbeda — gabungan hanya indikasi, bukan konsolidasi resmi)'} · Status: {warn.length ? <b>Belum lengkap</b> : <b>Lengkap menurut data yang tercatat</b>}
      {warn.length > 0 && <ul style={{ margin: '4px 0 0', paddingLeft: 18 }}>{warn.map((w) => <li key={w}>{w}</li>)}</ul>}
    </div>
  );
}

function Rows({ list, field, sign = 1, total }) {
  return (
    <div className="list">
      {list.map((a) => <div className="li" key={a.code}><span className="small">{a.name} {!a.ringkas && <span className="muted">{a.code}</span>}</span><b className="small">{rp(sign * a[field])}</b></div>)}
      {total != null && <div className="li"><b className="small">Total</b><b>{rp(total)}</b></div>}
    </div>
  );
}

function Laporan({ d, period, kosId, owner }) {
  // gabungkan akun dengan kode sama (lintas bisnis dalam satu badan usaha)
  const map = {};
  for (const a of d.accounts) { const m = (map[a.code] ||= { ...a, period: 0, balance: 0 }); m.period += Number(a.period); m.balance += Number(a.balance); }
  const acc = Object.values(map);
  const by = (t, f) => acc.filter((a) => a.type === t && Math.abs(a[f]) >= 0.005);
  const rev = by('pendapatan', 'period'), exp = by('beban', 'period');
  const revT = -sum(rev, (a) => a.period), expT = sum(exp, (a) => a.period);
  const aset = by('aset', 'balance'), kew = by('kewajiban', 'balance'), eku = by('ekuitas', 'balance');
  const asetT = sum(aset, (a) => a.balance), kewT = -sum(kew, (a) => a.balance), ekuT = -sum(eku, (a) => a.balance);
  const labaBerjalan = -sum(acc.filter((a) => a.type === 'pendapatan' || a.type === 'beban'), (a) => a.balance);
  const selisih = Math.round((asetT - kewT - ekuT - labaBerjalan) * 100) / 100;
  if (!acc.some((a) => a.balance || a.period)) return <Empty title="Belum ada jurnal" text="Jurnal muncul otomatis setelah ada transaksi (penjualan, belanja, kas, pembayaran)." />;
  return <>
    <div className="grid">
      <Tile label="Pendapatan bersih" value={rp(revT)} sub={period} />
      <Tile label="Laba / rugi" value={rp(revT - expT)} tone={revT - expT < 0 ? 'bad' : 'good'} sub="pendapatan − HPP − beban" />
    </div>
    <section className="panel">
      <h3>Laba rugi · {period}</h3>
      <span className="label">Pendapatan</span>
      <Rows list={rev} field="period" sign={-1} total={revT} />
      <span className="label">HPP & beban</span>
      <Rows list={exp} field="period" total={expT} />
      <div className="li"><b>Laba / rugi bersih</b><b>{rp(revT - expT)}</b></div>
    </section>
    <section className="panel">
      <h3>Neraca · per {tgl(d.to)}</h3>
      <span className="label">Aset</span>
      <Rows list={aset} field="balance" total={asetT} />
      <span className="label">Kewajiban</span>
      <Rows list={kew} field="balance" sign={-1} total={kewT} />
      <span className="label">Ekuitas</span>
      <div className="list">
        {eku.map((a) => <div className="li" key={a.code}><span className="small">{a.name} {!a.ringkas && <span className="muted">{a.code}</span>}</span><b className="small">{rp(-a.balance)}</b></div>)}
        <div className="li"><span className="small">Laba ditahan & laba berjalan</span><b className="small">{rp(labaBerjalan)}</b></div>
        <div className="li"><b className="small">Total kewajiban + ekuitas</b><b>{rp(kewT + ekuT + labaBerjalan)}</b></div>
      </div>
      {selisih === 0 ? <span className="chip good">Seimbang: aset = kewajiban + ekuitas</span> : <div className="notice bad">Tidak seimbang, selisih {rp(selisih)}. Hubungi bantuan.</div>}
      {d.ringkas && <FiturUpgrade kosId={kosId} owner={owner} event="REPORT.ADVANCED_REQUESTED" title="Neraca rinci per akun tersedia mulai Paket Bisnis" text="Paket ini menampilkan neraca ringkas (total aset, kewajiban, dan modal). Paket Bisnis menampilkan setiap akun, laba rugi per lokasi, dan laporan gabungan badan usaha." />}
    </section>
    {Array.isArray(d.per_lokasi) && d.per_lokasi.length > 0 && <section className="panel">
      <h3>Laba rugi per lokasi · {period}</h3>
      <div className="list">{d.per_lokasi.map((x) => (
        <div className="li" key={x.lokasi} style={{ alignItems: 'flex-start' }}>
          <div className="main"><b className="small">{x.lokasi}</b><span className="small muted">pendapatan {rp(x.pendapatan || 0)} · HPP {rp(x.hpp || 0)} · beban {rp(x.beban || 0)}</span></div>
          <b className="small" style={{ color: Number(x.laba) < 0 ? 'var(--bad)' : undefined }}>{rp(x.laba || 0)}</b>
        </div>
      ))}</div>
      <span className="small muted">Lokasi diambil dari transaksi asal tiap jurnal (penjualan, belanja, biaya, stok). "Bersama / tanpa lokasi" = jurnal manual, pembayaran sewa, dan transaksi tanpa lokasi; tidak dibagi otomatis.</span>
    </section>}
    {d.recon?.length > 0 && <section className="panel">
      <h3>Cek kecocokan dengan catatan toko</h3>
      <span className="small muted">Saldo buku besar dibandingkan dengan angka di menu Kas, kasbon/utang, dan nilai stok saat ini. Selisih tidak diubah otomatis.</span>
      <div className="list">{d.recon.map((r) => (
        <div className="li" key={r.bisnis + r.akun} style={{ alignItems: 'flex-start' }}>
          <div className="main"><b className="small">{r.akun}</b><span className="small muted">{r.bisnis} · buku {rp(r.buku)} · catatan {rp(r.operasional)}</span></div>
          {Number(r.selisih) === 0 ? <span className="chip good">Cocok</span> : <span className="chip gold">Selisih {rp(r.selisih)}</span>}
        </div>
      ))}</div>
      {d.recon.some((r) => r.akun.startsWith('Persediaan') && Number(r.selisih) !== 0) && <span className="small muted">Selisih persediaan biasanya muncul karena harga modal rata-rata berubah setelah belanja dibatalkan atau harga beli berbeda. Bila ingin disamakan, pemilik bisa membuat jurnal manual (Periode & manual) ke akun "Selisih & kerusakan persediaan".</span>}
    </section>}
  </>;
}

function BukuBesar({ d, kosId, entity, from, to, retail }) {
  const codes = [...new Map(d.accounts.map((a) => [a.code, a])).values()].sort((a, b) => a.code.localeCompare(b.code));
  const [code, setCode] = useState('1-1100');
  const [l, setL] = useState(null);
  useEffect(() => {
    setL(null);
    supabase.rpc('acct_ledger', { p_kos: kosId, p_entity: entity, p_code: code, p_from: from, p_to: to }).then(({ data, error }) => (error ? toast(errMsg(error)) : setL(data)));
  }, [code, from, to, entity, kosId]);
  const a = codes.find((x) => x.code === code);
  const normal = a && ['kewajiban', 'ekuitas', 'pendapatan'].includes(a.type) ? -1 : 1;
  let bal = Number(l?.opening || 0);
  return (
    <section className="panel">
      <Field label="Akun"><select value={code} onChange={(e) => setCode(e.target.value)}>{codes.map((x) => <option key={x.code} value={x.code}>{x.code} · {x.name} ({TYPE[x.type]})</option>)}</select></Field>
      {!l ? <Loading /> : <>
        <div className="li"><span className="small">Saldo awal {tgl(from)}</span><b className="small">{rp(normal * bal)}</b></div>
        {l.lines.length === 0 ? <span className="small muted">Tidak ada mutasi pada periode ini.</span> : <div className="list">{l.lines.map((x, i) => {
          bal += Number(x.debit) - Number(x.credit);
          const href = x.source_id && srcHref(x.source_type, x.source_id, retail);
          return (
            <div className="li" key={i} style={{ alignItems: 'flex-start' }}>
              <div className="main"><span className="small">{x.description}</span>
                <span className="small muted">{tgl(x.entry_date)} · {x.number}{entity ? ` · ${x.business}` : ''}{href && <> · <Link href={href}>lihat {SRC[x.source_type]?.toLowerCase()}</Link></>}</span></div>
              <div style={{ textAlign: 'right' }}><b className="small">{Number(x.debit) ? `D ${rp(x.debit)}` : `K ${rp(x.credit)}`}</b><br /><span className="small muted">saldo {rp(normal * bal)}</span></div>
            </div>
          );
        })}</div>}
        <div className="li"><b className="small">Saldo akhir {tgl(to)}</b><b>{rp(normal * bal)}</b></div>
        {l.lines.length >= 500 && <span className="small muted">Menampilkan 500 mutasi pertama. Persempit periodenya.</span>}
      </>}
    </section>
  );
}

function Jurnal({ kosId, from, to, retail, ver }) {
  const [rows, setRows] = useState(null);
  useEffect(() => { setRows(null); supabase.rpc('acct_journal', { p_kos: kosId, p_from: from, p_to: to }).then(({ data, error }) => (error ? toast(errMsg(error)) : setRows(data))); }, [kosId, from, to, ver]);
  if (!rows) return <Loading />;
  if (!rows.length) return <Empty title="Belum ada jurnal di periode ini" />;
  return (
    <section className="panel"><div className="list">{rows.map((e) => {
      const href = e.source_id && srcHref(e.source_type, e.source_id, retail);
      return (
        <details key={e.id} className="li" style={{ display: 'block' }}>
          <summary style={{ cursor: 'pointer' }}><b className="small">{e.description}</b> <span className="small muted">· {tgl(e.date)} · {e.number}</span> {e.kind !== 'posting' && <span className={'chip ' + KIND[e.kind][1]}>{KIND[e.kind][0]}</span>}</summary>
          <table className="g-table" style={{ marginTop: 6 }}><tbody>
            {e.lines.map((x, i) => <tr key={i}><td style={{ paddingLeft: Number(x.credit) ? 20 : 8 }}>{x.name}{x.memo ? <span className="muted"> · {x.memo}</span> : ''}</td><td style={{ textAlign: 'right' }}>{Number(x.debit) ? rp(x.debit) : ''}</td><td style={{ textAlign: 'right' }}>{Number(x.credit) ? rp(x.credit) : ''}</td></tr>)}
          </tbody></table>
          <span className="small muted">{e.created_by === 'sistem' ? 'Diposting otomatis' : `Oleh ${e.created_by}`}{href && <> · <Link href={href}>lihat {SRC[e.source_type]?.toLowerCase()}</Link></>}</span>
        </details>
      );
    })}</div>{rows.length >= 300 && <span className="small muted">Menampilkan 300 jurnal terbaru di periode ini.</span>}</section>
  );
}

function Periode({ d, kosId, ym, onDone }) {
  const closed = new Set(d.closed || []);
  const months = Array.from({ length: 12 }, (_, i) => addMonthsYm(today().slice(0, 7), -i - 1));
  const setP = async (m, close) => {
    const note = window.prompt(close ? `Tutup periode ${bulan(m)}?\nSetelah ditutup, koreksi atas transaksi bulan itu dicatat di bulan berjalan dan jurnal manual tidak bisa bertanggal di bulan itu.\n\nTulis alasan:` : `Buka kembali ${bulan(m)}? Tulis alasan:`, close ? 'Tutup buku bulanan' : '');
    if (note == null) return;
    if (await run(() => supabase.rpc('acct_period_set', { p_kos: kosId, p_month: m + '-01', p_close: close, p_note: note }), close ? 'Periode ditutup' : 'Periode dibuka kembali', errMsg)) onDone();
  };
  return <>
    <section className="panel">
      <h3>Tutup periode</h3>
      <span className="small muted">Tutup bulan yang sudah selesai diperiksa agar angkanya tidak berubah. Tercatat di riwayat konfigurasi.</span>
      <div className="list">{months.map((m) => (
        <div className="li" key={m}><span className="small">{bulan(m)}</span>
          {closed.has(m) ? <span className="row"><span className="chip void">Ditutup</span><button className="sm ghost" onClick={() => setP(m, false)}>Buka</button></span> : <button className="sm" onClick={() => setP(m, true)}>Tutup</button>}</div>
      ))}</div>
    </section>
    <Manual d={d} kosId={kosId} onDone={onDone} />
  </>;
}

function Manual({ d, kosId, onDone }) {
  const { kos } = useKos();
  const codes = [...new Map(d.accounts.map((a) => [a.code, a])).values()].sort((a, b) => a.code.localeCompare(b.code));
  const blank = () => ({ code: codes[0]?.code || '', debit: '', credit: '', memo: '' });
  const [date, setDate] = useState(today());
  const [desc, setDesc] = useState('');
  const [lines, setLines] = useState([blank(), blank()]);
  const [busy, setBusy] = useState(false);
  const D = sum(lines, (x) => parseRp(x.debit) || 0), K = sum(lines, (x) => parseRp(x.credit) || 0);
  const set = (i, k, v) => setLines(lines.map((x, j) => (j === i ? { ...x, [k]: v } : x)));
  const save = async () => {
    if (D !== K || D === 0) return toast('Total debit harus sama dengan total kredit');
    if (!window.confirm(`Simpan jurnal manual ${rp(D)}?\nJurnal tidak bisa dihapus; kesalahan diperbaiki dengan jurnal kebalikannya.`)) return;
    setBusy(true);
    const { data, error } = await supabase.rpc('acct_manual', { p_kos: kosId, p_date: date, p_description: desc, p_lines: lines.map((x) => ({ code: x.code, debit: parseRp(x.debit) || 0, credit: parseRp(x.credit) || 0, memo: x.memo })) });
    setBusy(false);
    if (error) return toast(errMsg(error));
    toast(`Jurnal ${data} disimpan`); setDesc(''); setLines([blank(), blank()]); onDone();
  };
  // Jurnal manual mulai Paket Bisnis (bisnis lama tetap memakai); diperiksa juga di server (acct_manual)
  if (!hasFeature(kos, 'jurnal_manual')) return <FiturUpgrade kosId={kosId} event="FINANCE.MANUAL_JOURNAL_REQUESTED" title="Jurnal manual tersedia mulai Paket Bisnis" text="Catat saldo awal, penyesuaian persediaan, atau penyusutan sendiri. Jurnal otomatis dari transaksi tetap berjalan di semua paket." />;
  return (
    <section className="panel">
      <h3>Jurnal manual</h3>
      <span className="small muted">Untuk penyesuaian (mis. saldo awal kas/bank, menyamakan nilai persediaan, penyusutan). Hanya pemilik; berlaku untuk bisnis ini saja.</span>
      <div className="row"><Field label="Tanggal"><input type="date" value={date} max={today()} onChange={(e) => setDate(e.target.value)} /></Field></div>
      <Field label="Keterangan"><input value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="mis. Saldo awal rekening bank" /></Field>
      {lines.map((x, i) => (
        <div key={i} className="stack" style={{ gap: 6, borderTop: '1px solid var(--line)', paddingTop: 8 }}>
          <select value={x.code} onChange={(e) => set(i, 'code', e.target.value)}>{codes.map((a) => <option key={a.code} value={a.code}>{a.code} · {a.name}</option>)}</select>
          <div className="row" style={{ flexWrap: 'nowrap' }}>
            <input inputMode="numeric" placeholder="Debit" value={x.debit} onChange={(e) => set(i, 'debit', e.target.value)} disabled={Boolean(x.credit)} />
            <input inputMode="numeric" placeholder="Kredit" value={x.credit} onChange={(e) => set(i, 'credit', e.target.value)} disabled={Boolean(x.debit)} />
            {lines.length > 2 && <button className="sm ghost" onClick={() => setLines(lines.filter((_, j) => j !== i))}>✕</button>}
          </div>
        </div>
      ))}
      <button className="sm ghost" onClick={() => setLines([...lines, blank()])}>+ Baris</button>
      <div className="li"><span className="small">Debit {rp(D)} · Kredit {rp(K)}</span>{D === K && D > 0 ? <span className="chip good">Seimbang</span> : <span className="chip gold">Belum seimbang</span>}</div>
      <button className="primary" disabled={busy || D !== K || D === 0 || desc.trim().length < 5} onClick={save}>{busy ? 'Menyimpan…' : 'Simpan jurnal'}</button>
    </section>
  );
}

// Rekonsiliasi bank (Paket Bisnis): cocokkan baris jurnal akun Bank dengan rekening koran akhir bulan.
// Semua angka & izin dari server (bank_recon_get/save/mark/finish/reopen); selesai hanya bila selisih 0.
function RekonBank({ kosId, ym, owner, ver }) {
  const [d, setD] = useState(null);
  const [err, setErr] = useState(null);
  const [saldo, setSaldo] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const muat = () => supabase.rpc('bank_recon_get', { p_kos: kosId, p_month: ym + '-01' }).then(({ data, error }) => {
    if (error) return setErr(errMsg(error));
    setD(data); setSaldo(data?.rekon?.saldo_koran != null ? String(data.rekon.saldo_koran) : ''); setNote(data?.rekon?.catatan || '');
  });
  useEffect(() => { setD(null); setErr(null); muat(); }, [kosId, ym, ver]); // eslint-disable-line react-hooks/exhaustive-deps
  if (err) return <div className="notice bad">{/bank_recon/.test(err) ? 'Database sedang diperbarui. Coba lagi beberapa menit lagi.' : err}</div>;
  if (!d) return <Loading />;
  if (!d.aktif) return <FiturUpgrade kosId={kosId} owner={owner} event="FINANCE.RECONCILIATION_REQUESTED" title="Rekonsiliasi bank tersedia mulai Paket Bisnis" text="Cocokkan catatan bank di PRASARA dengan rekening koran setiap bulan, dan temukan transaksi yang belum tercatat atau belum masuk ke bank." />;
  if (!d.ada_akun) return <Empty title="Belum ada akun Bank" text="Akun Bank muncul otomatis setelah ada transaksi transfer, e-wallet, atau setor ke bank." />;

  const selesai = d.rekon?.status === 'selesai';
  const panggil = async (fn, args, ok) => {
    setBusy(true);
    const { error } = await supabase.rpc(fn, args);
    setBusy(false);
    if (error) { toast(errMsg(error)); return false; }
    if (ok) toast(ok);
    muat(); return true;
  };
  const simpan = () => {
    const n = parseRp(saldo);
    if (saldo.trim() === '' || n == null || Number.isNaN(n)) return toast('Isi saldo rekening koran akhir bulan');
    panggil('bank_recon_save', { p_kos: kosId, p_month: ym + '-01', p_statement: n, p_note: note || null }, 'Saldo rekening koran disimpan');
  };
  const tandai = (ids, cocok) => panggil('bank_recon_mark', { p_kos: kosId, p_month: ym + '-01', p_lines: ids, p_cocok: cocok }, null);
  const belum = d.baris.filter((x) => !x.cocok);
  const finish = () => { if (window.confirm(`Selesaikan rekonsiliasi ${bulan(ym)}?\nBaris yang ditandai terkunci sampai dibuka kembali oleh pemilik.`)) panggil('bank_recon_finish', { p_kos: kosId, p_month: ym + '-01' }, 'Rekonsiliasi selesai'); };
  const reopen = () => { const r = window.prompt('Alasan membuka kembali rekonsiliasi ini:', ''); if (r != null) panggil('bank_recon_reopen', { p_kos: kosId, p_month: ym + '-01', p_reason: r }, 'Dibuka kembali'); };
  const sel = d.selisih == null ? null : Number(d.selisih);

  return (
    <>
      <section className="panel">
        <div className="row between"><h3>Rekonsiliasi bank · {bulan(ym)}</h3>{d.rekon ? <span className={'chip ' + (selesai ? 'good' : 'void')}>{selesai ? 'Selesai' : 'Draf'}</span> : null}</div>
        <span className="small muted">1) Isi saldo rekening koran per {tgl(d.akhir)}. 2) Centang baris yang sudah tercantum di rekening koran. 3) Bila selisih 0, tekan Selesaikan.</span>
        <div className="grid">
          <Tile label="Saldo buku (akun Bank)" value={rp(d.saldo_buku)} sub="semua catatan bank s.d. akhir bulan" />
          <Tile label="Seharusnya di bank" value={rp(d.saldo_cocok)} sub="baris yang sudah dicentang" />
          <Tile label="Belum muncul di bank" value={rp(d.belum_muncul)} sub="tercatat, belum di rekening koran" />
          <Tile label="Selisih" value={sel == null ? '—' : rp(sel)} sub={sel == null ? 'isi saldo rekening koran' : sel === 0 ? 'cocok' : 'rekening koran − seharusnya'} />
        </div>
        {!selesai && <>
          <Field label="Saldo rekening koran akhir bulan"><input inputMode="numeric" value={saldo} onChange={(e) => setSaldo(e.target.value)} placeholder="mis. 12.500.000" /></Field>
          <Field label="Catatan (opsional)"><input value={note} maxLength={300} onChange={(e) => setNote(e.target.value)} placeholder="mis. Rekening BRI 1234" /></Field>
          <button className="primary" disabled={busy} onClick={simpan}>Simpan saldo</button>
        </>}
        {sel != null && sel !== 0 && !selesai && <span className="small" style={{ color: 'var(--bad)' }}>Masih selisih {rp(sel)}. Centang baris yang sudah ada di rekening koran. Bila selisih berasal dari biaya admin atau bunga bank yang belum dicatat, catat dulu (Kas/Pengeluaran, akun bank) lalu muat ulang.</span>}
        {!selesai && <button className="cta" disabled={busy || sel !== 0} onClick={finish}>Selesaikan rekonsiliasi</button>}
        {selesai && <span className="small muted">Diselesaikan {d.rekon.selesai_oleh ? `oleh ${d.rekon.selesai_oleh}` : ''}{d.rekon.catatan ? ` · ${d.rekon.catatan}` : ''}.</span>}
        {selesai && owner && <button className="ghost" disabled={busy} onClick={reopen}>Buka kembali</button>}
      </section>

      <section className="panel">
        <div className="row between"><h3>Baris akun Bank</h3>{!selesai && belum.length > 0 && <button className="sm ghost" disabled={busy} onClick={() => tandai(belum.map((x) => x.id), true)}>Centang semua ({belum.length})</button>}</div>
        {d.baris.length === 0 ? <span className="small muted">Tidak ada baris bank yang perlu dicocokkan di bulan ini.</span> : <div className="list">{d.baris.map((x) => (
          <label key={x.id} className="li" style={{ alignItems: 'flex-start', gap: 10 }}>
            <input type="checkbox" style={{ width: 22, minHeight: 22, flex: 'none' }} checked={x.cocok} disabled={busy || selesai} onChange={(e) => tandai([x.id], e.target.checked)} aria-label={`Sudah di rekening koran: ${x.uraian}`} />
            <div className="main"><b className="small">{x.uraian}</b><span className="small muted">{tgl(x.tanggal)} · {x.nomor}</span></div>
            <span className="small" style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>{Number(x.masuk) > 0 ? `+${rp(x.masuk)}` : `−${rp(x.keluar)}`}</span>
          </label>
        ))}</div>}
        <span className="small muted">Baris yang sudah dicocokkan di bulan sebelumnya tidak ditampilkan lagi. Baris yang belum dicentang ikut tampil di bulan berikutnya.</span>
      </section>
    </>
  );
}

// Arus kas (metode langsung dari jurnal Kas + Bank). Lengkap (Paket Bisnis): per kelompok operasi/investasi/pendanaan.
const KELOMPOK = { operasi: 'Aktivitas operasi', investasi: 'Aktivitas investasi', pendanaan: 'Aktivitas pendanaan', saldo_awal: 'Saldo awal yang dicatat' };
function ArusKas({ kosId, from, to, period, owner, ver }) {
  const [c, setC] = useState(null);
  const [err, setErr] = useState(null);
  useEffect(() => {
    setC(null); setErr(null);
    supabase.rpc('acct_cashflow', { p_kos: kosId, p_from: from, p_to: to }).then(({ data, error }) => (error ? setErr(errMsg(error)) : setC(data)));
  }, [kosId, from, to, ver]);
  if (err) return <div className="notice bad">{/acct_cashflow/.test(err) ? 'Database sedang diperbarui. Coba lagi beberapa menit lagi.' : err}</div>;
  if (!c) return <Loading />;
  return (
    <section className="panel">
      <h3>Arus kas · {period}</h3>
      <span className="small muted">Kas = akun Kas + Bank. Pindah kas ke bank (atau sebaliknya) tidak dihitung sebagai uang masuk/keluar.</span>
      <div className="list">
        <div className="li"><span className="small">Saldo awal</span><b className="small">{rp(c.saldo_awal)}</b></div>
        <div className="li"><span className="small">Uang masuk</span><b className="small" style={{ color: 'var(--good)' }}>+{rp(c.masuk)}</b></div>
        <div className="li"><span className="small">Uang keluar</span><b className="small" style={{ color: 'var(--bad)' }}>−{rp(c.keluar)}</b></div>
        <div className="li"><b className="small">Saldo akhir</b><b>{rp(c.saldo_akhir)}</b></div>
      </div>
      {c.cocok ? <span className="chip good">Cocok: saldo awal + masuk − keluar = saldo akhir</span> : <div className="notice bad">Saldo tidak cocok. Hubungi bantuan.</div>}
      {c.lengkap && Array.isArray(c.kelompok) && c.kelompok.length > 0 && <>
        {c.kelompok.map((g) => (
          <div key={g.kelompok} className="stack" style={{ gap: 4 }}>
            <div className="row between"><span className="label">{KELOMPOK[g.kelompok] || g.kelompok}</span><b className="small">{rp(g.bersih)}</b></div>
            <div className="list">{(g.akun || []).map((a) => (
              <div key={a.akun} className="li"><span className="small">{a.akun}</span><span className="small">{Number(a.bersih) >= 0 ? '+' : '−'}{rp(Math.abs(a.bersih))}</span></div>
            ))}</div>
          </div>
        ))}
        <span className="small muted">Dikelompokkan menurut akun lawan di setiap jurnal: modal, prive & pinjaman = pendanaan; aset tetap = investasi; sisanya operasi.</span>
      </>}
      {!c.lengkap && <FiturUpgrade kosId={kosId} owner={owner} event="REPORT.ADVANCED_REQUESTED" title="Arus kas per aktivitas tersedia mulai Paket Bisnis" text="Lihat dari mana uang masuk dan ke mana keluar: operasi, investasi, dan pendanaan, sampai per akun." />}
    </section>
  );
}
