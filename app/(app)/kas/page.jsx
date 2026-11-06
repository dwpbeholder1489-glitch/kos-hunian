'use client';
import { withApproval } from '@/lib/approval';
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useKos } from '@/components/KosProvider';
import PageHelp from '@/components/PageHelp';
import { Sheet, Field, Loading, Empty, Tile, run, toast } from '@/components/ui';
import { rp, parseRp, tgl, today, errMsg, waLink } from '@/lib/format';
import { uid } from '@/lib/retail';
import LokasiBar from '@/components/LokasiBar';
import { multiLoc } from '@/lib/business';

const ACC = { kas: 'Kas (laci)', bank: 'Bank' };
const OTHER = {
  setoran_modal: ['Setor modal / uang awal toko', 'masuk'],
  prive: ['Diambil pemilik untuk pribadi (prive)', 'keluar'],
  pendapatan_lain: ['Pemasukan lain (bukan jualan)', 'masuk'],
  setor_bank: ['Setor uang kas ke bank', 'pindah'],
  tarik_bank: ['Tarik uang bank ke kas', 'pindah'],
};

// Kas & kasbon toko: saldo kas/bank dihitung dari semua catatan; kasbon pelanggan & utang supplier dengan pelunasan
export default function Kas() {
  const { kos, kosId, ver } = useKos();
  const [tab, setTab] = useState('kas');
  const [d, setD] = useState(null);
  const [err, setErr] = useState(null);
  const [sheet, setSheet] = useState(null);
  const load = async () => {
    const multi = multiLoc(kos);
    const [l, e, c, p, cat, loc] = await Promise.all([
      supabase.rpc('retail_ledger', { p_kos: kosId }),
      supabase.from('expenses').select('*').eq('kos_id', kosId).order('date', { ascending: false }).order('created_at', { ascending: false }).limit(40),
      supabase.from('cash_entries').select('*').eq('kos_id', kosId).order('date', { ascending: false }).order('created_at', { ascending: false }).limit(40),
      supabase.from('debt_payments').select('*').eq('kos_id', kosId).order('date', { ascending: false }).order('created_at', { ascending: false }).limit(60),
      supabase.from('expense_categories').select('*').eq('kos_id', kosId).order('name'),
      multi ? supabase.rpc('cash_by_location', { p_kos: kosId }) : Promise.resolve({ data: null }),
    ]);
    const x = l.error || e.error || c.error || p.error || cat.error;
    if (x) return setErr(errMsg(x));
    setD({ led: l.data, expenses: e.data, cash: c.data, pays: p.data, cats: cat.data, loc: loc.data });
  };
  useEffect(() => { load(); }, [kosId, ver, kos?.locs?.list?.length]);
  if (err) return <div className="notice bad">{err.includes('retail_ledger') || err.includes('debt_payments') || err.includes('account') ? 'Database sedang diperbarui. Coba lagi beberapa menit lagi.' : err}</div>;
  if (!d) return <Loading />;
  const { led } = d;
  const totKasbon = led.kasbon.reduce((a, x) => a + Number(x.sisa), 0);
  const totUtang = led.utang.reduce((a, x) => a + Number(x.sisa), 0);
  const catName = new Map(d.cats.map((c) => [c.id, c.name]));
  const done = () => { setSheet(null); load(); };
  const multi = multiLoc(kos) && Array.isArray(d.loc);
  const locName = (id) => kos.locs?.list?.find((b) => b.id === id)?.name || d.loc?.find((b) => b.id === id)?.name || '';
  const at = (id) => (multi && id ? ` · ${locName(id)}` : '');

  // Riwayat catatan manual (penjualan & belanja ada di menunya sendiri)
  const feed = [
    ...d.expenses.map((x) => ({ id: x.id, t: 'exp', date: x.date, at: x.created_at, label: catName.get(x.category_id) || 'Biaya', note: x.description, acc: (ACC[x.account] || x.account) + at(x.branch_id), amt: -Number(x.amount) })),
    ...d.cash.map((x) => ({ id: x.id, t: 'cash', date: x.date, at: x.created_at, label: x.kind === 'pindah_kas' ? 'Pindah uang kas antar lokasi' : OTHER[x.kind]?.[0] || x.kind, note: x.description,
      acc: x.kind === 'pindah_kas' ? `${locName(x.branch_id)} → ${locName(x.to_branch)}` : (x.kind === 'setor_bank' ? 'kas → bank' : x.kind === 'tarik_bank' ? 'bank → kas' : ACC[x.account] || x.account) + at(x.branch_id),
      amt: ['prive', 'bayar_pinjaman'].includes(x.kind) ? -Number(x.amount) : ['setor_bank', 'tarik_bank', 'pindah_kas'].includes(x.kind) ? 0 : Number(x.amount), raw: Number(x.amount) })),
    ...d.pays.filter((x) => x.status === 'selesai').map((x) => ({ id: x.id, t: 'pay', date: x.date, at: x.created_at, label: x.kind === 'piutang' ? 'Pelunasan kasbon' : 'Bayar utang supplier', note: x.note, acc: (ACC[x.account] || x.account) + at(x.branch_id), amt: x.kind === 'piutang' ? Number(x.amount) : -Number(x.amount), contact: x.contact_id })),
  ].sort((a, b) => (a.date === b.date ? String(b.at).localeCompare(String(a.at)) : b.date.localeCompare(a.date))).slice(0, 50);

  return (
    <div className="stack">
      <div className="row"><h2>Kas & kasbon</h2><PageHelp page="kas" /></div>
      <div className="grid">
        <Tile label="Kas (laci)" value={rp(led.kas)} sub={Number(led.kas) < 0 ? 'minus: ada uang masuk yang belum dicatat?' : 'menurut catatan'} tone={Number(led.kas) < 0 ? 'bad' : ''} />
        <Tile label="Bank" value={rp(led.bank)} />
        <Tile label="Kasbon pelanggan" value={rp(totKasbon)} sub={`${led.kasbon.length} orang`} />
        <Tile label="Utang ke supplier" value={rp(totUtang)} sub={`${led.utang.length} supplier`} />
      </div>
      <LokasiBar note="Biaya, uang masuk/keluar lain, dan pembayaran kasbon/utang dicatat di lokasi ini." />
      {multi && tab === 'kas' && <section className="panel">
        <div className="row between"><h3>Uang kas per lokasi</h3><button className="sm" onClick={() => setSheet({ t: 'move' })}>Pindahkan uang kas</button></div>
        <div className="list">{d.loc.map((b) => <div className="li" key={b.id}><span className="small">{b.name}{b.is_main ? ' (utama)' : ''}{!b.active ? ' · nonaktif' : ''}</span><b className="small" style={{ color: Number(b.kas) < 0 ? 'var(--bad)' : undefined }}>{rp(b.kas)}</b></div>)}</div>
        <span className="small muted">Uang laci di tiap lokasi menurut catatan (penjualan tunai, belanja tunai, biaya, kasbon, dan pindah kas). Bank tetap satu untuk seluruh bisnis.</span>
      </section>}
      <div className="seg">{[['kas', 'Kas & bank'], ['kasbon', 'Kasbon pelanggan'], ['utang', 'Utang supplier']].map(([k, l]) => <button key={k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>{l}</button>)}</div>

      {tab === 'kas' && <>
        <div className="row"><button className="primary" onClick={() => setSheet({ t: 'exp' })}>+ Biaya</button><button onClick={() => setSheet({ t: 'cash' })}>+ Uang masuk/keluar lain</button></div>
        <p className="small muted" style={{ margin: 0 }}>Saldo dihitung dari penjualan tunai/transfer, belanja, biaya, pelunasan, dan catatan di bawah. Mulai pakai? Catat <b>Setor modal</b> sebesar uang di laci sekarang.</p>
        {feed.length === 0 ? <Empty title="Belum ada catatan kas" /> : (
          <section className="panel"><div className="list">{feed.map((f) => (
            <div className="li" key={f.t + f.id}>
              <div className="main"><b className="small">{f.label}</b><span className="small muted">{tgl(f.date)} · {f.acc}{f.note ? ` · ${f.note}` : ''}</span></div>
              <div className="row" style={{ flexWrap: 'nowrap' }}>
                <b className="small" style={{ color: f.amt < 0 ? 'var(--bad)' : f.amt > 0 ? 'var(--good)' : 'inherit' }}>{f.amt === 0 ? rp(f.raw) : (f.amt > 0 ? '+' : '−') + rp(Math.abs(f.amt))}</b>
                <button className="sm ghost" aria-label="Hapus atau batalkan" onClick={() => setSheet({ t: 'del', f })}>✕</button>
              </div>
            </div>
          ))}</div></section>
        )}
      </>}

      {tab !== 'kas' && (() => {
        const list = tab === 'kasbon' ? led.kasbon : led.utang;
        return list.length === 0 ? <Empty title={tab === 'kasbon' ? 'Tidak ada kasbon' : 'Tidak ada utang ke supplier'} text={tab === 'kasbon' ? 'Kasbon muncul saat penjualan di Kasir dibayar dengan Kasbon.' : 'Utang muncul saat belanja dibayar dengan Utang ke supplier.'} /> : (
          <section className="panel"><div className="list">{list.map((x) => {
            const late = x.due && x.due < today();
            return (
              <div className="li" key={x.id} style={{ alignItems: 'flex-start' }}>
                <div className="main"><b>{x.name}</b>
                  <span className="small muted">sejak {tgl(x.since)}{x.due ? ` · janji bayar ${tgl(x.due)}` : ''}{late && <span className="chip bad" style={{ marginLeft: 6 }}>Lewat</span>}</span>
                  <b style={{ color: 'var(--bad)' }}>{rp(x.sisa)}</b></div>
                <div className="stack" style={{ gap: 6 }}>
                  <button className="sm primary" onClick={() => setSheet({ t: 'pay', c: x, kind: tab })}>{tab === 'kasbon' ? 'Terima bayar' : 'Bayar'}</button>
                  {tab === 'kasbon' && x.phone && <a href={waLink(x.phone, `Halo ${x.name}, ini pengingat dari ${kos.name}. Sisa kasbon Anda ${rp(x.sisa)}. Terima kasih.`)} target="_blank" rel="noreferrer"><button className="sm" style={{ width: '100%' }}>Ingatkan WA</button></a>}
                </div>
              </div>
            );
          })}</div></section>
        );
      })()}

      {sheet?.t === 'exp' && <ExpenseForm kosId={kosId} cats={d.cats} onClose={() => setSheet(null)} onSaved={done} />}
      {sheet?.t === 'cash' && <CashForm kosId={kosId} onClose={() => setSheet(null)} onSaved={done} />}
      {sheet?.t === 'pay' && <PayForm kosId={kosId} c={sheet.c} kind={sheet.kind} onClose={() => setSheet(null)} onSaved={done} />}
      {sheet?.t === 'move' && <MoveCash kosId={kosId} locs={d.loc.filter((b) => b.active)} cur={kos.locs?.current} onClose={() => setSheet(null)} onSaved={done} />}
      {sheet?.t === 'del' && <DeleteEntry f={sheet.f} onClose={() => setSheet(null)} onSaved={done} />}
    </div>
  );
}

function ExpenseForm({ kosId, cats, onClose, onSaved }) {
  const [cat, setCat] = useState(cats.find((c) => c.kind === 'operasional')?.id || '');
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(today());
  const [acc, setAcc] = useState('kas');
  const [desc, setDesc] = useState('');
  const save = async () => {
    const a = parseRp(amount);
    if (!(a > 0)) return toast('Isi jumlahnya.');
    const c = cats.find((x) => x.id === cat);
    if (await run(() => supabase.from('expenses').insert({ kos_id: kosId, date, amount: a, category_id: cat || null, kind: c?.kind || 'operasional', account: acc, description: desc || null }), 'Biaya tercatat', errMsg)) onSaved();
  };
  return (
    <Sheet title="Catat biaya" onClose={onClose}>
      <Field label="Jenis biaya"><select value={cat} onChange={(e) => setCat(e.target.value)}>{cats.map((c) => <option key={c.id} value={c.id}>{c.name}{c.kind === 'modal' ? ' (modal)' : ''}</option>)}</select></Field>
      <div className="row"><Field label="Jumlah"><input inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="mis. 150rb" /></Field><Field label="Tanggal"><input type="date" max={today()} value={date} onChange={(e) => setDate(e.target.value)} /></Field></div>
      <div className="seg">{Object.entries(ACC).map(([k, l]) => <button key={k} className={acc === k ? 'on' : ''} onClick={() => setAcc(k)}>Dibayar dari {l}</button>)}</div>
      <Field label="Keterangan (opsional)"><input value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="mis. token listrik, gaji Budi" /></Field>
      <button className="cta" onClick={save}>Simpan biaya</button>
    </Sheet>
  );
}

function CashForm({ kosId, onClose, onSaved }) {
  const [kind, setKind] = useState('setoran_modal');
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(today());
  const [acc, setAcc] = useState('kas');
  const [desc, setDesc] = useState('');
  const move = OTHER[kind][1] === 'pindah';
  const save = async () => {
    const a = parseRp(amount);
    if (!(a > 0)) return toast('Isi jumlahnya.');
    if (await run(() => supabase.from('cash_entries').insert({ kos_id: kosId, kind, date, amount: a, account: move ? 'kas' : acc, description: desc || null }), 'Tercatat', errMsg)) onSaved();
  };
  return (
    <Sheet title="Uang masuk / keluar lain" onClose={onClose}>
      <Field label="Jenis"><select value={kind} onChange={(e) => setKind(e.target.value)}>{Object.entries(OTHER).map(([k, [l]]) => <option key={k} value={k}>{l}</option>)}</select></Field>
      <div className="row"><Field label="Jumlah"><input inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value)} /></Field><Field label="Tanggal"><input type="date" max={today()} value={date} onChange={(e) => setDate(e.target.value)} /></Field></div>
      {!move && <div className="seg">{Object.entries(ACC).map(([k, l]) => <button key={k} className={acc === k ? 'on' : ''} onClick={() => setAcc(k)}>{l}</button>)}</div>}
      {kind === 'prive' && <p className="small muted" style={{ margin: 0 }}>Prive bukan biaya toko: tidak mengurangi laba, tetapi mengurangi kas.</p>}
      <Field label="Keterangan (opsional)"><input value={desc} onChange={(e) => setDesc(e.target.value)} /></Field>
      <button className="cta" onClick={save}>Simpan</button>
    </Sheet>
  );
}

function PayForm({ kosId, c, kind, onClose, onSaved }) {
  const [amount, setAmount] = useState(String(Math.round(c.sisa)));
  const [acc, setAcc] = useState('kas');
  const [date, setDate] = useState(today());
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [id] = useState(uid);
  const save = async () => {
    const a = parseRp(amount);
    if (!(a > 0)) return toast('Isi jumlahnya.');
    setBusy(true);
    const ok = await run(() => supabase.rpc('debt_pay', { p_id: id, p_kos: kosId, p_contact: c.id, p_amount: a, p_account: acc, p_date: date, p_note: note }), kind === 'kasbon' ? `Pembayaran ${rp(a)} dari ${c.name} tercatat` : `Pembayaran ${rp(a)} ke ${c.name} tercatat`, errMsg);
    setBusy(false);
    if (ok) onSaved();
  };
  return (
    <Sheet title={kind === 'kasbon' ? `Terima bayar · ${c.name}` : `Bayar utang · ${c.name}`} onClose={onClose}>
      <p style={{ margin: 0 }}>Sisa <b>{rp(c.sisa)}</b>. Boleh dibayar sebagian.</p>
      <div className="row"><Field label="Jumlah"><input inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value)} /></Field><Field label="Tanggal"><input type="date" max={today()} value={date} onChange={(e) => setDate(e.target.value)} /></Field></div>
      <div className="seg">{Object.entries(ACC).map(([k, l]) => <button key={k} className={acc === k ? 'on' : ''} onClick={() => setAcc(k)}>{kind === 'kasbon' ? 'Masuk ke' : 'Dari'} {l}</button>)}</div>
      <Field label="Catatan (opsional)"><input value={note} onChange={(e) => setNote(e.target.value)} /></Field>
      <button className="cta" onClick={save} disabled={busy}>{busy ? 'Menyimpan…' : 'Simpan pembayaran'}</button>
    </Sheet>
  );
}

function DeleteEntry({ f, onClose, onSaved }) {
  const { kosId } = useKos();
  const [reason, setReason] = useState('');
  const go = async () => {
    if (f.t === 'pay') {
      if (await withApproval(() => supabase.rpc('debt_payment_void', { p_payment: f.id, p_reason: reason }), 'Pembayaran dibatalkan',
        { kos: kosId, action: 'batal_pelunasan', payload: { payment_id: f.id }, reason })) onSaved();
      return;
    }
    if (await run(() => supabase.from(f.t === 'exp' ? 'expenses' : 'cash_entries').delete().eq('id', f.id), 'Catatan dihapus', errMsg)) onSaved();
  };
  return (
    <Sheet title={f.t === 'pay' ? 'Batalkan pembayaran?' : 'Hapus catatan?'} onClose={onClose}>
      <p style={{ margin: 0 }}><b>{f.label}</b> · {tgl(f.date)} · {rp(Math.abs(f.amt) || f.raw)}</p>
      {f.t === 'pay' ? <>
        <p className="small muted" style={{ margin: 0 }}>Sisa kasbon/utang akan kembali seperti sebelum pembayaran ini. Catatannya tetap tersimpan sebagai Batal.</p>
        <Field label="Alasan"><input value={reason} onChange={(e) => setReason(e.target.value)} /></Field>
        <button className="danger" onClick={go} disabled={!reason.trim()}>Ya, batalkan</button>
      </> : <button className="danger" onClick={go}>Ya, hapus</button>}
      <button className="ghost" onClick={onClose}>Tidak jadi</button>
    </Sheet>
  );
}

// Pindah uang kas antar lokasi (mis. setoran laci cabang ke toko utama); total kas bisnis tidak berubah
function MoveCash({ kosId, locs, cur, onClose, onSaved }) {
  const [from, setFrom] = useState(cur || locs[0]?.id);
  const [to, setTo] = useState('');
  const [amt, setAmt] = useState('');
  const [date, setDate] = useState(today());
  const [note, setNote] = useState('');
  const have = Number(locs.find((b) => b.id === from)?.kas || 0);
  const a = parseRp(amt);
  const save = async () => {
    if (await run(() => supabase.rpc('cash_move', { p_kos: kosId, p_from: from, p_to: to, p_amount: a, p_date: date, p_note: note }), 'Uang kas dipindahkan', errMsg)) onSaved();
  };
  return (
    <Sheet title="Pindahkan uang kas" onClose={onClose}>
      <div className="row">
        <Field label="Dari"><select value={from} onChange={(e) => setFrom(e.target.value)}>{locs.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</select></Field>
        <Field label="Ke"><select value={to} onChange={(e) => setTo(e.target.value)}><option value="">— pilih —</option>{locs.filter((b) => b.id !== from).map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</select></Field>
      </div>
      <span className="small muted">Kas tercatat di lokasi asal: {rp(have)}</span>
      <Field label="Jumlah"><input inputMode="numeric" value={amt} onChange={(e) => setAmt(e.target.value)} placeholder="Rp" /></Field>
      <Field label="Tanggal"><input type="date" value={date} max={today()} onChange={(e) => setDate(e.target.value)} /></Field>
      <Field label="Catatan (opsional)"><input value={note} onChange={(e) => setNote(e.target.value)} placeholder="mis. setoran laci cabang" /></Field>
      <button className="primary" onClick={save} disabled={!to || !(a > 0) || a > have}>Pindahkan</button>
    </Sheet>
  );
}
