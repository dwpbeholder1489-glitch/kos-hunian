'use client';
import PageHelp from '@/components/PageHelp';
import { Fragment, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useKos } from '@/components/KosProvider';
import { useData } from '@/lib/useData';
import { Sheet, Field, Loading, Empty, run } from '@/components/ui';
import { rp, tgl, today, thisMonth, bulan, addMonthsYm, parseRp, angka, KIND, errMsg } from '@/lib/format';

export default function Pengeluaran() {
  const d = useData();
  const [ym, setYm] = useState(thisMonth());
  const [sheet, setSheet] = useState(null);
  if (!d.ready) return d.err ? <div className="notice bad">{d.err}</div> : <Loading />;

  const list = d.expenses.filter((x) => x.date.startsWith(ym));
  const total = list.reduce((s, x) => s + x.amount, 0);
  const byCat = new Map();
  for (const x of list) { const k = d.catById.get(x.category_id)?.name || 'Tanpa kategori'; byCat.set(k, (byCat.get(k) || 0) + x.amount); }

  return (
    <div className="stack">
      <div className="row between"><div className="row"><h2>Pengeluaran</h2><PageHelp page="pengeluaran" /></div><button className="primary" onClick={() => setSheet({ x: null })}>+ Catat</button></div>
      <section className="panel">
        <div className="row between">
          <button className="sm" onClick={() => setYm(addMonthsYm(ym, -1))} aria-label="Bulan sebelumnya">‹</button>
          <h3>{bulan(ym)}</h3>
          <button className="sm" onClick={() => setYm(addMonthsYm(ym, 1))} disabled={ym >= thisMonth()} aria-label="Bulan berikutnya">›</button>
        </div>
        <div className="row between"><span className="label">Total</span><b>{rp(total)}</b></div>
        {byCat.size > 0 && <dl className="kv">{[...byCat.entries()].sort((a, b) => b[1] - a[1]).map(([k, v]) => <Fragment key={k}><dt>{k}</dt><dd>{rp(v)}</dd></Fragment>)}</dl>}
      </section>
      {list.length === 0 ? <Empty title="Belum ada pengeluaran" text="Catat biaya listrik, air, perbaikan, dan lainnya supaya laporan laba akurat." /> : (
        <section className="panel"><div className="list">{list.map((x) => (
          <div className="li click" key={x.id} onClick={() => setSheet({ x })}>
            <div className="main"><b>{x.description || d.catById.get(x.category_id)?.name || 'Pengeluaran'}</b><span className="small muted">{tgl(x.date)} · {d.catById.get(x.category_id)?.name || '—'}</span></div>
            <span className="num">{rp(x.amount)}</span>
          </div>
        ))}</div></section>
      )}
      {sheet && <ExpSheet d={d} x={sheet.x} onClose={() => setSheet(null)} />}
    </div>
  );
}

function ExpSheet({ d, x, onClose }) {
  const { kosId, bump } = useKos();
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
    const ok = await run(() => isNew ? supabase.from('expenses').insert({ ...data, kos_id: kosId }) : supabase.from('expenses').update(data).eq('id', x.id), isNew ? 'Pengeluaran dicatat' : 'Perubahan disimpan', errMsg);
    setBusy(false);
    if (ok) { bump(); onClose(); }
  }
  async function del() {
    if (!confirm('Hapus catatan pengeluaran ini?')) return;
    if (await run(() => supabase.from('expenses').delete().eq('id', x.id), 'Dihapus', errMsg)) { bump(); onClose(); }
  }
  return (
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
      {!isNew && <button className="danger" onClick={del}>Hapus</button>}
    </Sheet>
  );
}
