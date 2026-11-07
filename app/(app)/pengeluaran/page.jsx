'use client';
import PageHelp from '@/components/PageHelp';
import { Fragment, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useKos } from '@/components/KosProvider';
import { useData } from '@/lib/useData';
import { Sheet, Field, Loading, Empty, run, toast } from '@/components/ui';
import Lampiran from '@/components/Lampiran';
import { rp, tgl, today, thisMonth, bulan, addMonthsYm, parseRp, angka, KIND, ENTRY, errMsg } from '@/lib/format';

export default function Pengeluaran() {
  const d = useData();
  const [ym, setYm] = useState(thisMonth());
  const [tab, setTab] = useState('biaya');
  const [sheet, setSheet] = useState(null);
  if (!d.ready) return d.err ? <div className="notice bad">{d.err}</div> : <Loading />;

  const list = d.expenses.filter((x) => x.date.startsWith(ym));
  const total = list.reduce((s, x) => s + x.amount, 0);
  const byCat = new Map();
  for (const x of list) { const k = d.catById.get(x.category_id)?.name || 'Tanpa kategori'; byCat.set(k, (byCat.get(k) || 0) + x.amount); }
  const ent = d.entries.filter((x) => x.date.startsWith(ym));
  const sumKind = (k) => ent.filter((x) => x.kind === k).reduce((s, x) => s + x.amount, 0);
  const add = () => setSheet(tab === 'biaya' ? { t: 'exp', x: null } : { t: 'ent', x: null });

  return (
    <div className="stack">
      <div className="row between"><div className="row"><h2>Pengeluaran</h2><PageHelp page="pengeluaran" /></div><button className="primary" onClick={add}>+ Catat</button></div>
      <div className="seg">
        <button className={tab === 'biaya' ? 'on' : ''} onClick={() => setTab('biaya')}>Biaya kos</button>
        <button className={tab === 'lain' ? 'on' : ''} onClick={() => setTab('lain')}>Diambil pemilik & lainnya</button>
      </div>
      <section className="panel">
        <div className="row between">
          <button className="sm" onClick={() => setYm(addMonthsYm(ym, -1))} aria-label="Bulan sebelumnya">‹</button>
          <h3>{bulan(ym)}</h3>
          <button className="sm" onClick={() => setYm(addMonthsYm(ym, 1))} disabled={ym >= thisMonth()} aria-label="Bulan berikutnya">›</button>
        </div>
        {tab === 'biaya' ? (
          <>
            <div className="row between"><span className="label">Total biaya</span><b>{rp(total)}</b></div>
            {byCat.size > 0 && <dl className="kv">{[...byCat.entries()].sort((a, b) => b[1] - a[1]).map(([k, v]) => <Fragment key={k}><dt>{k}</dt><dd>{rp(v)}</dd></Fragment>)}</dl>}
          </>
        ) : (
          <dl className="kv">{Object.entries(ENTRY).map(([k, [l, , dir]]) => <Fragment key={k}><dt>{l}</dt><dd style={{ color: dir === 'out' ? 'var(--bad)' : 'var(--good)' }}>{dir === 'out' ? '−' : '+'}{rp(sumKind(k))}</dd></Fragment>)}</dl>
        )}
      </section>

      {tab === 'biaya' && (list.length === 0 ? <Empty title="Belum ada biaya" text="Catat listrik, air, internet, perbaikan, gaji pengelola/penjaga, dan biaya kos lainnya supaya laba akurat." /> : (
        <section className="panel"><div className="list">{list.map((x) => (
          <div className="li click" key={x.id} onClick={() => setSheet({ t: 'exp', x })}>
            <div className="main"><b>{x.description || d.catById.get(x.category_id)?.name || 'Pengeluaran'}</b><span className="small muted">{tgl(x.date)} · {d.catById.get(x.category_id)?.name || '—'}</span></div>
            <span className="num">{rp(x.amount)}</span>
          </div>
        ))}</div></section>
      ))}

      {tab === 'lain' && (
        <>
          <p className="small muted" style={{ margin: 0 }}>Uang kos yang dipakai pemilik untuk keperluan pribadi <b>bukan biaya kos</b>, jadi tidak mengurangi laba — tetapi mengurangi uang kas. Catat di sini agar saldo kas tetap cocok.</p>
          {ent.length === 0 ? <Empty title="Belum ada transaksi" text="Contoh: ambil Rp500.000 untuk belanja rumah, setor modal untuk renovasi, atau pendapatan parkir." /> : (
            <section className="panel"><div className="list">{ent.map((x) => (
              <div className="li click" key={x.id} onClick={() => setSheet({ t: 'ent', x })}>
                <div className="main"><b>{x.description || ENTRY[x.kind][0]}</b><span className="small muted">{tgl(x.date)} · {ENTRY[x.kind][0]}</span></div>
                <span className="num" style={{ color: ENTRY[x.kind][2] === 'out' ? 'var(--bad)' : 'var(--good)' }}>{ENTRY[x.kind][2] === 'out' ? '−' : '+'}{rp(x.amount)}</span>
              </div>
            ))}</div></section>
          )}
        </>
      )}
      {sheet?.t === 'exp' && <ExpSheet d={d} x={sheet.x} onClose={() => setSheet(null)} />}
      {sheet?.t === 'ent' && <EntrySheet x={sheet.x} onClose={() => setSheet(null)} />}
    </div>
  );
}

function EntrySheet({ x, onClose }) {
  const { kosId, bump } = useKos();
  const isNew = !x;
  const [kind, setKind] = useState(x?.kind || 'prive');
  const [date, setDate] = useState(x?.date || today());
  const [amt, setAmt] = useState(x ? angka(x.amount) : '');
  const [desc, setDesc] = useState(x?.description || '');
  const [busy, setBusy] = useState(false);
  async function save() {
    const a = parseRp(amt);
    if (!(a > 0)) return run(() => { throw new Error('Isi jumlah.'); });
    const data = { kind, date, amount: a, description: desc.trim() || null };
    setBusy(true);
    const ok = await run(() => isNew ? supabase.from('cash_entries').insert({ ...data, kos_id: kosId }) : supabase.from('cash_entries').update(data).eq('id', x.id), isNew ? 'Transaksi dicatat' : 'Perubahan disimpan', errMsg);
    setBusy(false);
    if (ok) { bump(); onClose(); }
  }
  async function del() {
    if (!confirm('Hapus transaksi ini?')) return;
    if (await run(() => supabase.from('cash_entries').delete().eq('id', x.id), 'Dihapus', errMsg)) { bump(); onClose(); }
  }
  return (
    <Sheet title={isNew ? 'Catat transaksi lain' : 'Ubah transaksi'} onClose={onClose}>
      <Field label="Jenis" hint={ENTRY[kind][1]}>
        <select value={kind} onChange={(e) => setKind(e.target.value)}>{Object.entries(ENTRY).map(([k, [l]]) => <option key={k} value={k}>{l}</option>)}</select>
      </Field>
      <div className="row">
        <Field label="Jumlah"><input inputMode="numeric" value={amt} onChange={(e) => setAmt(e.target.value)} placeholder="mis. 500rb" /></Field>
        <Field label="Tanggal"><input type="date" value={date} max={today()} onChange={(e) => setDate(e.target.value)} /></Field>
      </div>
      <Field label="Keterangan (opsional)"><input value={desc} onChange={(e) => setDesc(e.target.value)} placeholder={kind === 'prive' ? 'mis. Belanja rumah tangga' : ''} /></Field>
      {kind === 'prive' && <div className="notice info" style={{ fontWeight: 500 }}>Gaji untuk pengelola/penjaga kos <b>bukan prive</b> — catat di tab <b>Biaya kos</b> dengan kategori "Gaji pengelola / penjaga".</div>}
      <button className="cta" onClick={save} disabled={busy}>{busy ? 'Menyimpan…' : 'Simpan'}</button>
      {!isNew && <button className="danger" onClick={del}>Hapus</button>}
    </Sheet>
  );
}

function ExpSheet({ d, x, onClose }) {
  const { kosId, bump } = useKos();
  const [newId, setNewId] = useState(null); // setelah pengeluaran baru tersimpan → bisa tambah foto nota
  const isNew = !x;
  const [date, setDate] = useState(x?.date || today());
  const [amt, setAmt] = useState(x ? angka(x.amount) : '');
  const [cat, setCat] = useState(x?.category_id || d.categories[0]?.id || '');
  const [desc, setDesc] = useState(x?.description || '');
  const [busy, setBusy] = useState(false);
  async function save() {
    const a = parseRp(amt);
    if (!(a > 0)) return run(() => { throw new Error('Isi jumlah pengeluaran.'); });
    const c = d.catById.get(cat);
    const data = { date, amount: a, category_id: cat || null, kind: c?.kind || 'operasional', description: desc.trim() || null };
    setBusy(true);
    if (isNew) {
      const { data: row, error } = await supabase.from('expenses').insert({ ...data, kos_id: kosId }).select('id').single();
      setBusy(false);
      if (error) return toast(errMsg(error));
      toast('Pengeluaran dicatat'); bump(); setNewId(row.id); return;
    }
    const ok = await run(() => supabase.from('expenses').update(data).eq('id', x.id), 'Perubahan disimpan', errMsg);
    setBusy(false);
    if (ok) { bump(); onClose(); }
  }
  async function del() {
    if (!confirm('Hapus catatan pengeluaran ini?')) return;
    if (await run(() => supabase.from('expenses').delete().eq('id', x.id), 'Dihapus', errMsg)) { bump(); onClose(); }
  }
  return (
    newId ? <Sheet title="Pengeluaran tercatat" onClose={onClose}>
      <p className="small" style={{ margin: 0 }}>✓ {rp(parseRp(amt))} · {d.catById.get(cat)?.name || 'Pengeluaran'} · {tgl(date)}</p>
      <Lampiran entity="expense" id={newId} title="Foto nota / kuitansi" hint="Opsional: foto nota agar mudah dicek nanti." />
      <button className="cta" onClick={onClose}>Selesai</button>
    </Sheet> :
    <Sheet title={isNew ? 'Catat pengeluaran' : 'Ubah pengeluaran'} onClose={onClose}>
      <div className="row">
        <Field label="Jumlah"><input inputMode="numeric" value={amt} onChange={(e) => setAmt(e.target.value)} placeholder="mis. 350rb" /></Field>
        <Field label="Tanggal"><input type="date" value={date} max={today()} onChange={(e) => setDate(e.target.value)} /></Field>
      </div>
      <Field label="Kategori" hint={d.catById.get(cat) ? 'Jenis: ' + KIND[d.catById.get(cat).kind] : 'Kelola kategori di Pengaturan'}>
        <select value={cat} onChange={(e) => setCat(e.target.value)}>{d.categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
      </Field>
      <Field label="Keterangan (opsional)"><input value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="mis. Token listrik kamar mandi bersama" /></Field>
      <button className="cta" onClick={save} disabled={busy}>{busy ? 'Menyimpan…' : 'Simpan'}</button>
      {!isNew && <Lampiran entity="expense" id={x.id} title="Foto nota / kuitansi" />}
      {!isNew && <button className="danger" onClick={del}>Hapus</button>}
    </Sheet>
  );
}
