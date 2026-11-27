'use client';
import PageHelp from '@/components/PageHelp';
import { PageHeader, DataTable, FilterToolbar } from '@/components/Page';
import { useBaru } from '@/lib/useBaru';
import { Fragment, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useKos } from '@/components/KosProvider';
import { useData } from '@/lib/useData';
import { Sheet, Field, Loading, Empty, run, toast } from '@/components/ui';
import Lampiran from '@/components/Lampiran';
import Pinjaman from '@/components/Pinjaman';
import { rp, tgl, today, thisMonth, bulan, addMonthsYm, parseRp, angka, KIND, ENTRY, errMsg } from '@/lib/format';

export default function Pengeluaran() {
  const d = useData();
  const { kosId } = useKos();
  const [ym, setYm] = useState(thisMonth());
  const [tab, setTab] = useState('biaya');
  const [sheet, setSheet] = useState(null);
  const [q, setQ] = useState('');
  const [catF, setCatF] = useState('');
  useBaru(() => setSheet({ t: 'exp', x: null }));
  if (!d.ready) return d.err ? <div className="notice bad">{d.err}</div> : <Loading />;

  const list = d.expenses.filter((x) => x.date.startsWith(ym));
  const total = list.reduce((s, x) => s + x.amount, 0);
  const byCat = new Map();
  for (const x of list) { const k = d.catById.get(x.category_id)?.name || 'Tanpa kategori'; byCat.set(k, (byCat.get(k) || 0) + x.amount); }
  const ent = d.entries.filter((x) => x.date.startsWith(ym));
  const sumKind = (k) => ent.filter((x) => x.kind === k).reduce((s, x) => s + x.amount, 0);
  const w = q.trim().toLowerCase();
  const catName = (x) => d.catById.get(x.category_id)?.name || 'Tanpa kategori';
  const shownExp = list.filter((x) => (!catF || (x.category_id || '') === catF) && (!w || `${x.description || ''} ${catName(x)}`.toLowerCase().includes(w)));
  const shownEnt = ent.filter((x) => !w || `${x.description || ''} ${ENTRY[x.kind][0]}`.toLowerCase().includes(w));
  const usedCats = d.categories.filter((c) => list.some((x) => x.category_id === c.id));
  const add = () => setSheet(tab === 'biaya' ? { t: 'exp', x: null } : { t: 'ent', x: null });

  return (
    <div className="stack">
      <PageHeader title="Pengeluaran" help={<PageHelp page="pengeluaran" />} actions={tab === 'pinjaman' ? null : <><button className="primary" onClick={add}>+ Catat</button></>} />
      <div className="seg">
        <button className={tab === 'biaya' ? 'on' : ''} onClick={() => setTab('biaya')}>Biaya kos</button>
        <button className={tab === 'lain' ? 'on' : ''} onClick={() => setTab('lain')}>Diambil pemilik & lainnya</button>
        <button className={tab === 'pinjaman' ? 'on' : ''} onClick={() => setTab('pinjaman')}>Pinjaman</button>
      </div>
      {tab === 'pinjaman' ? <Pinjaman kosId={kosId} /> : <>
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

      {(tab === 'biaya' ? list.length : ent.length) > 0 && <FilterToolbar q={q} onQ={setQ} placeholder="Cari keterangan atau kategori" active={catF ? 1 : 0}
        filters={tab === 'biaya' && usedCats.length > 1 ? <label className="field"><span className="label">Kategori</span><select value={catF} onChange={(e) => setCatF(e.target.value)}><option value="">Semua kategori</option>{usedCats.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label> : null} />}

      {tab === 'biaya' && (list.length === 0 ? <Empty title="Belum ada biaya" text="Catat listrik, air, internet, perbaikan, gaji pengelola/penjaga, dan biaya kos lainnya supaya laba akurat." /> : shownExp.length === 0 ? <Empty title="Tidak ada yang cocok" text="Ubah pencarian atau filter kategori." /> : (
        <DataTable rows={shownExp} caption={`Biaya ${bulan(ym)}`} onRow={(x) => setSheet({ t: 'exp', x })} rowLabel={(x) => `${x.description || catName(x)} ${rp(x.amount)}`}
          columns={[
            { key: 'date', label: 'Tanggal', sort: (x) => x.date, render: (x) => tgl(x.date) },
            { key: 'desc', label: 'Keterangan', sort: (x) => (x.description || catName(x)).toLowerCase(), render: (x) => <b>{x.description || catName(x)}</b> },
            { key: 'cat', label: 'Kategori', sort: (x) => catName(x), render: (x) => catName(x) },
            { key: 'amt', label: 'Jumlah', align: 'right', sort: (x) => x.amount, render: (x) => rp(x.amount) },
          ]}
          card={(x) => <>
            <div className="dt-row"><b>{x.description || catName(x)}</b><span className="num">{rp(x.amount)}</span></div>
            <span className="small muted">{tgl(x.date)} · {catName(x)}</span>
          </>} />
      ))}

      {tab === 'lain' && (
        <>
          <p className="small muted" style={{ margin: 0 }}>Uang kos yang dipakai pemilik untuk keperluan pribadi <b>bukan biaya kos</b>, jadi tidak mengurangi laba — tetapi mengurangi uang kas. Catat di sini agar saldo kas tetap cocok.</p>
          {ent.length === 0 ? <Empty title="Belum ada transaksi" text="Contoh: ambil Rp500.000 untuk belanja rumah, setor modal untuk renovasi, atau pendapatan parkir." /> : shownEnt.length === 0 ? <Empty title="Tidak ada yang cocok" /> : (
            <DataTable rows={shownEnt} caption={`Transaksi lain ${bulan(ym)}`} onRow={(x) => setSheet({ t: 'ent', x })} rowLabel={(x) => `${x.description || ENTRY[x.kind][0]} ${rp(x.amount)}`}
              columns={[
                { key: 'date', label: 'Tanggal', sort: (x) => x.date, render: (x) => tgl(x.date) },
                { key: 'desc', label: 'Keterangan', render: (x) => <b>{x.description || ENTRY[x.kind][0]}</b> },
                { key: 'kind', label: 'Jenis', sort: (x) => ENTRY[x.kind][0], render: (x) => ENTRY[x.kind][0] },
                { key: 'amt', label: 'Jumlah', align: 'right', sort: (x) => (ENTRY[x.kind][2] === 'out' ? -x.amount : x.amount), render: (x) => <span style={{ color: ENTRY[x.kind][2] === 'out' ? 'var(--bad)' : 'var(--good)' }}>{ENTRY[x.kind][2] === 'out' ? '−' : '+'}{rp(x.amount)}</span> },
              ]}
              card={(x) => <>
                <div className="dt-row"><b>{x.description || ENTRY[x.kind][0]}</b><span className="num" style={{ color: ENTRY[x.kind][2] === 'out' ? 'var(--bad)' : 'var(--good)' }}>{ENTRY[x.kind][2] === 'out' ? '−' : '+'}{rp(x.amount)}</span></div>
                <span className="small muted">{tgl(x.date)} · {ENTRY[x.kind][0]}</span>
              </>} />
          )}
        </>
      )}
      </>}
      {sheet?.t === 'exp' && <ExpSheet d={d} x={sheet.x} onClose={() => setSheet(null)} />}
      {sheet?.t === 'ent' && <EntrySheet x={sheet.x} onClose={() => setSheet(null)} />}
    </div>
  );
}

// Pinjaman baru dicatat di tab Pinjaman (pokok + bunga, sisa utang); catatan lama tetap bisa diubah di sini
const LOAN_KINDS = ['pinjaman_masuk', 'bayar_pinjaman', 'bayar_pajak']; // setor pajak lewat Analisis Bisnis › Pajak (butuh masa pajak)

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
        <select value={kind} onChange={(e) => setKind(e.target.value)}>{Object.entries(ENTRY).filter(([k]) => !isNew || !LOAN_KINDS.includes(k)).map(([k, [l]]) => <option key={k} value={k}>{l}</option>)}</select>
      </Field>
      {isNew && <p className="small muted" style={{ margin: 0 }}>Pinjaman diterima atau dibayar dicatat di tab <b>Pinjaman</b> agar bunga dan sisa utang terpisah.</p>}
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
