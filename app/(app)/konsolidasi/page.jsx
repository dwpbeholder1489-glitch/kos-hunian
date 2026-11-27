'use client';
// Konsolidasi formal (Tahap I Master Blueprint BI): grup bisnis milik akun + persen kepemilikan, eliminasi antarbisnis (otomatis dari kontak
// yang ditautkan + manual), kepentingan nonpengendali. Server: consol_* (izin keuangan tiap bisnis, minimal satu bisnis Pro); rumus lib/consolidation.js.
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { useKos } from '@/components/KosProvider';
import { PageHeader } from '@/components/Page';
import PageHelp from '@/components/PageHelp';
import FiturUpgrade from '@/components/FiturUpgrade';
import { Loading, Empty, Sheet, Field, toast } from '@/components/ui';
import { errMsg, rp, tgl, today, parseRp } from '@/lib/format';
import { canArea } from '@/lib/business';
import { consolidate, validateElim, ELIM_KINDS, ELIM_SIDES, LABEL } from '@/lib/consolidation';
import styles from './konsolidasi.module.css';

const num = (v) => (Number(v) < 0 ? '−' : '') + Math.abs(Math.round(Number(v) || 0)).toLocaleString('id-ID');
const monthStart = (d) => d.slice(0, 8) + '01';
const prevMonth = (d) => { const x = new Date(Date.UTC(+d.slice(0, 4), +d.slice(5, 7) - 2, 1)); const e = new Date(Date.UTC(+d.slice(0, 4), +d.slice(5, 7) - 1, 0)); return [x.toISOString().slice(0, 10), e.toISOString().slice(0, 10)]; };

export default function Konsolidasi() {
  const { kos, ver } = useKos();
  const [groups, setGroups] = useState(null);
  const [biz, setBiz] = useState([]);
  const [gid, setGid] = useState(null);
  const [edit, setEdit] = useState(null);
  const [err, setErr] = useState(null);
  const t = today();
  const [range, setRange] = useState({ from: monthStart(t), to: t });
  const [real, setReal] = useState(100);
  const [rep, setRep] = useState(null);
  const [elim, setElim] = useState(null);
  const [voidE, setVoidE] = useState(null);

  const loadGroups = async () => {
    const [g, b] = await Promise.all([supabase.rpc('consol_groups_list'), supabase.rpc('my_finance_businesses')]);
    if (g.error) return setErr(g.error);
    setGroups(g.data); setBiz(b.data || []);
    if (!gid && g.data.length) setGid(g.data[0].id);
  };
  useEffect(() => { loadGroups(); }, [ver]); // eslint-disable-line react-hooks/exhaustive-deps
  const loadRep = async () => {
    if (!gid) return; setRep(null);
    const { data, error } = await supabase.rpc('consol_report', { p_group: gid, p_from: range.from, p_to: range.to });
    setRep(error ? { error } : data);
  };
  useEffect(() => { loadRep(); }, [gid, range.from, range.to, ver]); // eslint-disable-line react-hooks/exhaustive-deps
  const c = useMemo(() => (rep && !rep.error && rep.aktif ? consolidate(rep, real) : null), [rep, real]);

  const head = <PageHeader title="Konsolidasi" help={<PageHelp page="konsolidasi" />} actions={<button className="primary" onClick={() => setEdit({ name: '', members: {} })}>+ Grup</button>} />;
  if (err) return <>{head}<p className="notice bad">{/consol_/.test(err.message || '') ? 'Database sedang diperbarui. Coba lagi beberapa menit lagi.' : errMsg(err)}</p></>;
  if (!groups) return <>{head}<Loading /></>;
  const g = groups.find((x) => x.id === gid);
  const openEdit = (x) => setEdit({ id: x.id, name: x.name, members: Object.fromEntries(x.members.map((m) => [m.kos_id, String(m.pct)])) });

  return <div className="stack">
    {head}
    <p className="small muted">Gabungkan laporan beberapa bisnis milik Anda menjadi satu, dengan membuang transaksi antarbisnis sendiri (agar uang yang hanya pindah kantong tidak terhitung dua kali) dan memisahkan bagian pemilik lain bila kepemilikan di bawah 100%. Berbeda dengan <Link href="/bisnis">Ringkasan multi-bisnis</Link> yang hanya menjumlahkan.</p>
    {!groups.length ? <Empty title="Belum ada grup konsolidasi" text="Ketuk + Grup, pilih minimal dua bisnis Anda dan persen kepemilikannya." /> : <>
      <div className={styles.bar}>
        <select value={gid || ''} onChange={(e) => setGid(e.target.value)} aria-label="Grup">{groups.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select>
        {g && <button className="sm" onClick={() => openEdit(g)}>Atur grup</button>}
      </div>
      <div className={styles.bar}>
        <button className="sm" aria-pressed={range.from === monthStart(t) && range.to === t} onClick={() => setRange({ from: monthStart(t), to: t })}>Bulan ini</button>
        <button className="sm" onClick={() => { const [a, b] = prevMonth(t); setRange({ from: a, to: b }); }}>Bulan lalu</button>
        <button className="sm" onClick={() => setRange({ from: t.slice(0, 4) + '-01-01', to: t })}>Tahun ini</button>
        <input type="date" aria-label="Dari" value={range.from} onChange={(e) => setRange({ ...range, from: e.target.value })} />
        <input type="date" aria-label="Sampai" value={range.to} onChange={(e) => setRange({ ...range, to: e.target.value })} />
      </div>
      {!rep ? <Loading rows={4} /> : rep.error ? <p className="notice bad">{errMsg(rep.error)}</p> : !rep.aktif ?
        <FiturUpgrade owner={canArea(kos, 'team')} plan="pro" event="PORTFOLIO.CONSOLIDATION.REQUESTED" title="Konsolidasi butuh minimal satu bisnis Paket Pro di grup"
          text="Laporan gabungan dengan eliminasi transaksi antarbisnis dan bagian pemilik lain." /> : <Report rep={rep} c={c} real={real} setReal={setReal} onElim={() => setElim({ kind: 'jual_beli', date: range.to, amount: '', reason: '' })} onVoid={setVoidE} />}
    </>}

    {edit && <GroupSheet edit={edit} biz={biz} onClose={() => setEdit(null)} onSaved={(id) => { setEdit(null); setGid(id); loadGroups(); loadRep(); }} />}
    {elim && <ElimSheet gid={gid} init={elim} onClose={() => setElim(null)} onSaved={() => { setElim(null); loadRep(); }} />}
    {voidE && <VoidSheet e={voidE} onClose={() => setVoidE(null)} onSaved={() => { setVoidE(null); loadRep(); }} />}
  </div>;
}

function Report({ rep, c, real, setReal, onElim, onVoid }) {
  const cols = c.members;
  const Table = ({ rows, title }) => <section className="panel">
    <h3>{title}</h3>
    <div style={{ overflowX: 'auto' }}><table className={styles.t} style={{ minWidth: 360 + cols.length * 110 }}>
      <thead><tr><th>Pos (Rp)</th>{cols.map((m) => <th key={m.kos_id} style={{ textAlign: 'right' }}>{m.name}{m.pct < 100 ? ` (${m.pct}%)` : ''}</th>)}<th style={{ textAlign: 'right' }}>Eliminasi</th><th style={{ textAlign: 'right' }}>Gabungan</th></tr></thead>
      <tbody>{rows.filter((r) => r.sum || r.elim || r.total).map((r) => <tr key={r.key}><th scope="row" style={{ fontWeight: 400 }}>{r.label}</th>
        {r.per.map((v, i) => <td key={i} style={{ textAlign: 'right' }}>{num(v)}</td>)}<td style={{ textAlign: 'right' }}>{r.elim ? num(r.elim) : '—'}</td><td style={{ textAlign: 'right', fontWeight: 700 }}>{num(r.total)}</td></tr>)}</tbody>
    </table></div>
  </section>;
  const issues = c.members.filter((m) => !m.lengkap || m.seimbang === false);
  return <>
    <section className="panel">
      <h3>Ringkasan grup · {tgl(rep.from)} – {tgl(rep.to)}</h3>
      <div className="grid">
        <div className="tile"><span className="small muted">Laba bersih gabungan</span><b>{rp(c.netIncome)}</b></div>
        <div className="tile"><span className="small muted">Milik Anda</span><b>{rp(c.ownerProfit)}</b>{c.nciProfit ? <span className="small muted">pemilik lain {rp(c.nciProfit)}</span> : null}</div>
        <div className="tile"><span className="small muted">Total aset gabungan</span><b>{rp(c.balance.assets)}</b></div>
        <div className="tile"><span className="small muted">Ekuitas milik Anda</span><b>{rp(c.ownerEquity)}</b>{c.nciEquity ? <span className="small muted">pemilik lain {rp(c.nciEquity)}</span> : null}</div>
      </div>
      <p className={`small ${c.balanced ? 'muted' : ''}`} style={c.balanced ? undefined : { color: 'var(--bad)' }}>{c.balanced ? '✓ Neraca gabungan seimbang.' : '✗ Neraca gabungan tidak seimbang — periksa jurnal tiap bisnis.'} Total eliminasi {rp(c.elimTotal)}.</p>
      {issues.length > 0 && <p className="notice">Perlu dicek: {issues.map((m) => m.name).join(', ')} — neraca belum lengkap (paket) atau tidak seimbang.</p>}
    </section>

    <section className="panel">
      <h3>Eliminasi antarbisnis</h3>
      {Number(rep.contacts_linked) === 0 && <p className="notice">Belum ada kontak yang ditandai sebagai bisnis sendiri. Buka <b>Pelanggan & supplier</b> di tiap bisnis → kontak bisnis Anda yang lain → “Kontak ini bisnis saya sendiri?”.</p>}
      {rep.auto_sales.length > 0 && <Field label="Barang antarbisnis yang sudah dijual lagi ke pihak luar / terpakai (%)" hint="Sisanya dianggap masih di gudang pembeli: laba penjual atasnya belum terjadi dan persediaan dinilai ke harga pokok penjual. Perkiraan Anda — tidak disimpan.">
        <input type="number" min="0" max="100" value={real} onChange={(e) => setReal(e.target.value)} /></Field>}
      {c.items.length ? <div className="list">{c.items.map((x, i) => <div className="li" key={x.id || i}><div className="main">
        <b className="small">{x.kind}{x.auto ? ' · otomatis' : ''}</b><span className="small muted">{x.text}{x.date ? ` · ${tgl(x.date)}` : ''}{x.debit ? ` · ${LABEL[x.debit]} & ${LABEL[x.credit]}` : ''}{x.unrealized ? ` · laba belum terjadi ${rp(x.unrealized)}` : ''}</span></div>
        <b className="small">{rp(x.amount)}</b>{x.id && <button className="sm ghost" onClick={() => onVoid(x)}>Batal</button>}</div>)}</div> : <p className="small muted">Belum ada eliminasi pada periode ini.</p>}
      {c.gaps.map((x, i) => <p key={i} className="notice">Piutang {x.creditor} ke {x.debtor} {rp(x.piutang)} ≠ utang {x.debtor} ke {x.creditor} {rp(x.utang)} (selisih {rp(x.selisih)}). Yang dieliminasi hanya yang lebih kecil — cocokkan catatan kedua bisnis.</p>)}
      {rep.arap_dilewati && <p className="small muted">Piutang/utang antarbisnis otomatis hanya untuk periode yang berakhir hari ini atau sesudahnya (saldo terbuka = posisi hari ini). Untuk periode lampau, catat eliminasi manual.</p>}
      <button className="sm" onClick={onElim}>+ Eliminasi manual</button>
    </section>

    <Table title="Laba rugi gabungan" rows={c.pl} />
    <Table title={`Neraca gabungan per ${tgl(rep.to)}`} rows={c.bs} />
    {c.nci.length > 0 && <section className="panel"><h3>Kepentingan nonpengendali (bagian pemilik lain)</h3>
      <div className="list">{c.nci.map((x) => <div className="li" key={x.kos_id}><div className="main"><b className="small">{x.name}</b><span className="small muted">Anda {x.pct}% · pemilik lain {100 - x.pct}%</span></div>
        <span className="small">laba {rp(x.profit)} · ekuitas {rp(x.equity)}</span></div>)}</div></section>}
    <p className="small muted">Batasan: tanpa goodwill/biaya investasi (kepemilikan dianggap sejak awal); laba belum terjadi dihitung dari perkiraan persen di atas; eliminasi manual berlaku pada periode tanggalnya. Ini laporan pengelolaan internal, bukan laporan konsolidasi yang diaudit.</p>
  </>;
}

function GroupSheet({ edit, biz, onClose, onSaved }) {
  const [f, setF] = useState(edit);
  const [busy, setBusy] = useState(false);
  const chosen = Object.keys(f.members);
  const save = async () => {
    if (busy) return; setBusy(true);
    const { data, error } = await supabase.rpc('consol_group_save', { p_id: f.id || null, p_name: f.name, p_members: chosen.map((k) => ({ kos_id: k, pct: Number(f.members[k] || 100) })) });
    setBusy(false);
    if (error) return toast(errMsg(error));
    toast('Grup disimpan'); onSaved(data.id);
  };
  const del = async () => { if (!window.confirm('Hapus grup ini? Eliminasi manualnya ikut terhapus; data bisnis tidak berubah.')) return; const { error } = await supabase.rpc('consol_group_delete', { p_id: f.id }); if (error) return toast(errMsg(error)); onSaved(null); };
  return <Sheet title={f.id ? 'Atur grup' : 'Grup konsolidasi baru'} onClose={() => !busy && onClose()}>
    <Field label="Nama grup"><input value={f.name} maxLength={80} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="mis. Usaha Keluarga" /></Field>
    <p className="small muted">Pilih minimal dua bisnis (Anda perlu akses keuangan di tiap bisnis) dan isi persen kepemilikan Anda. Minimal satu bisnis Paket Pro.</p>
    {biz.map((b) => <div key={b.id} className="row" style={{ gap: 8 }}>
      <label className="row" style={{ gap: 8, flex: 1 }}><input type="checkbox" style={{ width: 18, height: 18, minHeight: 0 }} checked={b.id in f.members}
        onChange={(e) => { const m = { ...f.members }; if (e.target.checked) m[b.id] = '100'; else delete m[b.id]; setF({ ...f, members: m }); }} />{b.name}{b.pro ? ' · Pro' : ''}</label>
      {b.id in f.members && <input type="number" min="1" max="100" style={{ width: 80 }} aria-label={`Persen ${b.name}`} value={f.members[b.id]} onChange={(e) => setF({ ...f, members: { ...f.members, [b.id]: e.target.value } })} />}
      {b.id in f.members && <span className="small">%</span>}
    </div>)}
    <button className="primary" disabled={busy || f.name.trim().length < 2 || chosen.length < 2} onClick={save}>{busy ? 'Menyimpan…' : 'Simpan'}</button>
    {f.id && <button className="ghost danger" onClick={del}>Hapus grup</button>}
  </Sheet>;
}

function ElimSheet({ gid, init, onClose, onSaved }) {
  const [f, setF] = useState(init);
  const [busy, setBusy] = useState(false);
  const v = validateElim({ ...f, amount: parseRp(String(f.amount)) });
  const save = async () => {
    if (busy || v) return; setBusy(true);
    const { error } = await supabase.rpc('consol_elim_add', { p_group: gid, p_date: f.date, p_kind: f.kind, p_debit: f.debit_class || null, p_credit: f.credit_class || null, p_amount: parseRp(String(f.amount)), p_reason: f.reason });
    setBusy(false);
    if (error) return toast(errMsg(error));
    toast('Eliminasi dicatat'); onSaved();
  };
  return <Sheet title="Eliminasi manual" onClose={() => !busy && onClose()}>
    <Field label="Jenis"><select value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value })}>{Object.entries(ELIM_KINDS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></Field>
    {f.kind === 'lainnya' && <>
      <Field label="Pos beban/aset yang dikurangi"><select value={f.debit_class || ''} onChange={(e) => setF({ ...f, debit_class: e.target.value })}><option value="">Pilih</option>{ELIM_SIDES.debit.map((k) => <option key={k} value={k}>{LABEL[k]}</option>)}</select></Field>
      <Field label="Pos pendapatan/kewajiban yang dikurangi"><select value={f.credit_class || ''} onChange={(e) => setF({ ...f, credit_class: e.target.value })}><option value="">Pilih</option>{ELIM_SIDES.credit.map((k) => <option key={k} value={k}>{LABEL[k]}</option>)}</select></Field>
    </>}
    <Field label="Tanggal" hint="Berlaku di laporan yang periodenya memuat tanggal ini"><input type="date" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} /></Field>
    <Field label="Jumlah (Rp)"><input inputMode="numeric" value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} /></Field>
    <Field label="Alasan"><input value={f.reason} maxLength={300} onChange={(e) => setF({ ...f, reason: e.target.value })} placeholder="mis. Pinjaman Toko A ke Warung B" /></Field>
    {v && (f.amount || f.reason) && <p className="small muted">{v}</p>}
    <button className="primary" disabled={busy || Boolean(v)} onClick={save}>Simpan</button>
  </Sheet>;
}

function VoidSheet({ e, onClose, onSaved }) {
  const [r, setR] = useState('');
  const go = async () => { const { error } = await supabase.rpc('consol_elim_void', { p_id: e.id, p_reason: r }); if (error) return toast(errMsg(error)); toast('Eliminasi dibatalkan'); onSaved(); };
  return <Sheet title="Batalkan eliminasi" onClose={onClose}><p className="small">{e.text} · {rp(e.amount)}</p>
    <Field label="Alasan"><input value={r} onChange={(x) => setR(x.target.value)} /></Field>
    <button className="primary" disabled={r.trim().length < 3} onClick={go}>Batalkan</button></Sheet>;
}
