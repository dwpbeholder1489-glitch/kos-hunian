'use client';
// Resep & biaya bahan (kuliner: resep per menu; jasa lain: bahan per layanan).
// Server: recipe_overview, recipe_get, recipe_save, food_cost_report. Bahan terpotong otomatis saat pesanan selesai.
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { useKos } from '@/components/KosProvider';
import PageHelp from '@/components/PageHelp';
import { Sheet, Field, Loading, Empty, Tile, run, toast } from '@/components/ui';
import { rp, angka, today, errMsg } from '@/lib/format';
import { canArea } from '@/lib/business';
import { terms } from '@/lib/jasa';
import { isiNum, isiText, toBase } from '@/lib/units';

const LI = { background: 'none', border: 0, borderTop: '1px solid var(--line)', borderRadius: 0, textAlign: 'left', width: '100%', font: 'inherit', color: 'inherit' };
const pctTone = (p) => (p == null ? '' : p > 45 ? 'bad' : p > 35 ? 'gold' : 'good');
const plus = (iso, n) => new Date(new Date(iso + 'T00:00:00Z').getTime() + n * 864e5).toISOString().slice(0, 10);

export default function Resep() {
  const { kosId, kos, ver } = useKos();
  const T = terms(kos);
  const fin = canArea(kos, 'finance');
  const [rows, setRows] = useState(null);
  const [err, setErr] = useState(null);
  const [open, setOpen] = useState(null);
  const [tab, setTab] = useState('resep');
  const load = () => supabase.rpc('recipe_overview', { p_kos: kosId }).then(({ data, error }) => (error ? setErr(errMsg(error)) : (setErr(null), setRows(data || []))));
  useEffect(() => { load(); }, [kosId, ver]);
  useEffect(() => { try { const m = new URLSearchParams(window.location.search).get('menu'); if (m) setOpen(m); } catch {} }, []);
  if (err) return <div className="notice bad">{/recipe_overview/.test(err) ? 'Database sedang diperbarui. Coba lagi beberapa menit lagi.' : err}</div>;
  if (!rows) return <Loading />;
  const withR = rows.filter((r) => r.n > 0);
  const active = rows.filter((r) => r.active);
  const avg = withR.length ? withR.reduce((a, r) => a + Number(r.pct || 0), 0) / withR.length : null;
  const short = withR.filter((r) => r.active && r.short);
  return (
    <div className="stack">
      <div className="row between"><div className="row"><h2>{T.kul ? 'Resep & food cost' : 'Bahan per layanan'}</h2><PageHelp page="resep" /></div></div>
      {fin && <div className="seg">{[['resep', T.kul ? 'Resep' : 'Bahan'], ['laporan', 'Laporan biaya bahan']].map(([k, l]) => <button key={k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>{l}</button>)}</div>}
      {tab === 'laporan' && fin ? <Laporan kosId={kosId} T={T} /> : <>
        <div className="grid">
          <Tile label={`${T.svc} dengan resep`} value={`${withR.filter((r) => r.active).length} / ${active.length}`} sub={withR.length < active.length ? 'ketuk yang belum untuk mengisi' : 'lengkap'} />
          <Tile label="Rata-rata biaya bahan" value={avg == null ? '—' : `${angka(Math.round(avg * 10) / 10)}%`} sub="dari harga jual" tone={pctTone(avg)} />
          <Tile label="Bahan kurang" value={angka(short.length)} sub={short.length ? `${T.svc.toLowerCase()} tidak bisa dibuat` : 'cukup'} tone={short.length ? 'bad' : ''} />
        </div>
        {rows.length === 0 ? <Empty title={`Belum ada ${T.svc.toLowerCase()}`} text={`Tambahkan ${T.svc.toLowerCase()} dulu di ${T.svcs}, lalu isi bahannya di sini.`}><Link href="/layanan"><button className="primary">Buka {T.svcs}</button></Link></Empty> :
          <section className="panel"><div className="list">{rows.map((r) => (
            <button key={r.id} className="li click" style={LI} onClick={() => setOpen(r.id)}>
              <div className="main"><b>{r.name}{!r.active && <span className="chip void" style={{ marginLeft: 4 }}>Tidak tersedia</span>}</b>
                {r.n > 0 ? <>
                  <span className="small muted">{r.n} bahan · biaya {rp(r.cost)} dari harga {rp(r.price)}</span>
                  <span className="small">{r.short ? <span style={{ color: 'var(--bad)' }}>Kurang: {r.short}</span> : <>cukup untuk {angka(r.can_make)} {r.unit}</>}</span>
                </> : <span className="small muted">Belum ada {T.kul ? 'resep' : 'daftar bahan'} · harga {rp(r.price)}</span>}
              </div>
              <div style={{ textAlign: 'right', flex: 'none' }}>{r.n > 0 ? <><span className={'chip ' + pctTone(r.pct)}>{r.pct == null ? '—' : `${angka(r.pct)}%`}</span><div className="small muted" style={{ whiteSpace: 'nowrap' }}>untung {rp(r.margin)}</div></> : <span className="small" style={{ whiteSpace: 'nowrap' }}>Isi ›</span>}</div>
            </button>
          ))}</div></section>}
        <span className="small muted">Bahan terpotong otomatis dari stok saat pesanan <b>selesai</b> (diserahkan). Stok bahan kurang tidak menghalangi pesanan — stoknya menjadi minus dan ditandai di sini agar dibelanjakan atau dihitung ulang. Persen = biaya bahan ÷ harga jual, memakai harga modal bahan saat ini.</span>
      </>}
      {open && <RecipeSheet serviceId={open} T={T} onClose={() => setOpen(null)} onSaved={() => { setOpen(null); load(); }} />}
    </div>
  );
}

function RecipeSheet({ serviceId, T, onClose, onSaved }) {
  const [d, setD] = useState(null);
  const [lines, setLines] = useState([]);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    supabase.rpc('recipe_get', { p_service: serviceId }).then(({ data, error }) => {
      if (error) { toast(errMsg(error)); return onClose(); }
      setD(data); setLines(data.lines.map((l) => ({ product_id: l.product_id, unit: l.unit, qty: isiText(l.qty) })));
    });
  }, [serviceId]);
  if (!d) return <Sheet title="Memuat…" onClose={onClose}><Loading /></Sheet>;
  const prod = (id) => {
    const p = d.products.find((x) => x.id === id); if (p) return p;
    const l = d.lines.find((x) => x.product_id === id); // bahan yang sudah diarsipkan tetap tampil
    return l ? { id, name: l.name, base_unit: l.base_unit, cost: l.cost, stock: l.stock, units: [{ name: l.unit, qty: Number(l.base_qty) / Number(l.qty) }] } : null;
  };
  const set = (i, patch) => setLines(lines.map((l, j) => (j === i ? { ...l, ...patch } : l)));
  const calc = lines.map((l) => {
    const p = l.product_id ? prod(l.product_id) : null; if (!p) return { cost: 0 };
    const u = (p.units || []).find((x) => x.name === l.unit) || (p.units || [])[0];
    const q = isiNum(l.qty);
    const base = q > 0 && u ? toBase(q, u.qty) : 0;
    return { p, base, cost: Math.round(base * Number(p.cost)), tiny: q > 0 && base <= 0, low: base > 0 && Number(p.stock) < base };
  });
  const total = calc.reduce((a, c) => a + c.cost, 0);
  const price = Number(d.service.price);
  const pct = price > 0 && total > 0 ? Math.round((total * 1000) / price) / 10 : null;
  const used = new Set(lines.map((l) => l.product_id).filter(Boolean));
  const save = async () => {
    const out = lines.filter((l) => l.product_id);
    for (const [i, l] of lines.entries()) {
      if (!l.product_id) continue;
      if (!(isiNum(l.qty) > 0)) return toast(`Isi jumlah ${calc[i].p?.name || 'bahan'}.`);
      if (calc[i].tiny) return toast(`Jumlah ${calc[i].p.name} terlalu kecil untuk satuan ${calc[i].p.base_unit}. Tambahkan satuan gram/ml di bahan itu.`);
    }
    setBusy(true);
    const ok = await run(() => supabase.rpc('recipe_save', { p_service: serviceId, p_lines: out.map((l) => ({ product_id: l.product_id, unit: l.unit, qty: isiNum(l.qty) })) }), out.length ? 'Resep disimpan' : 'Resep dikosongkan', errMsg);
    setBusy(false);
    if (ok) onSaved();
  };
  return (
    <Sheet title={`${T.kul ? 'Resep' : 'Bahan'} · ${d.service.name}`} onClose={onClose}>
      <span className="small muted">Bahan untuk <b>1 {d.service.unit}</b>. Harga jual {rp(price)}.</span>
      {d.products.length === 0 && lines.length === 0 ? <Empty title="Belum ada bahan" text="Catat dulu bahan di Bahan & stok (mis. beras per kg dengan satuan gram), lalu kembali ke sini."><Link href="/barang"><button className="primary">Buka Bahan & stok</button></Link></Empty> : <>
        {lines.map((l, i) => {
          const c = calc[i]; const p = c.p;
          return (
            <div className="unitbox" key={i}>
              <Field label="Bahan"><select value={l.product_id} onChange={(e) => { const np = d.products.find((x) => x.id === e.target.value); set(i, { product_id: e.target.value, unit: np ? (np.units.find((u) => Number(u.qty) < 1) || np.units[0]).name : '' }); }}>
                <option value="">— pilih bahan —</option>
                {d.products.filter((x) => x.id === l.product_id || !used.has(x.id)).map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
                {l.product_id && !d.products.some((x) => x.id === l.product_id) && p && <option value={l.product_id}>{p.name} (diarsipkan)</option>}
              </select></Field>
              {p && <div className="row" style={{ flexWrap: 'nowrap' }}>
                <Field label="Jumlah dipakai"><input inputMode="decimal" value={l.qty} onChange={(e) => set(i, { qty: e.target.value })} placeholder="mis. 150" /></Field>
                <Field label="Satuan"><select value={l.unit} onChange={(e) => set(i, { unit: e.target.value })}>{(p.units || []).map((u) => <option key={u.name} value={u.name}>{u.name}</option>)}</select></Field>
              </div>}
              {p && (c.tiny ? <p className="small" style={{ margin: 0, color: 'var(--bad)' }}>Terlalu kecil untuk dicatat dalam {p.base_unit}. Tambahkan satuan yang lebih kecil (gram/ml) di bahan ini.</p>
                : c.base > 0 ? <p className="small" style={{ margin: 0 }}>= {angka(c.base)} {p.base_unit} · <b>{rp(c.cost)}</b>{c.low ? <span style={{ color: 'var(--bad)' }}> · stok tinggal {angka(p.stock)} {p.base_unit}</span> : <span className="muted"> · stok {angka(p.stock)} {p.base_unit}</span>}</p> : null)}
              {p && (p.units || []).length === 1 && /^(kg|liter)$/i.test(p.base_unit) && <p className="small muted" style={{ margin: 0 }}>Perlu takaran gram/ml? Tambahkan satuan itu di Bahan & stok › {p.name} › Ubah.</p>}
              <button className="sm ghost" onClick={() => setLines(lines.filter((_, j) => j !== i))}>Hapus bahan ini</button>
            </div>
          );
        })}
        {lines.length < 40 && <button onClick={() => setLines([...lines, { product_id: '', unit: '', qty: '' }])}>+ Tambah bahan</button>}
        <div className="unitbox" style={{ gap: 4 }}>
          <div className="row between"><span>Biaya bahan per {d.service.unit}</span><b>{rp(total)}</b></div>
          <div className="row between"><span>Persen dari harga jual</span><b style={{ color: pct == null ? undefined : pct > 45 ? 'var(--bad)' : pct > 35 ? 'var(--att, var(--gold))' : 'var(--good)' }}>{pct == null ? '—' : `${angka(pct)}%`}</b></div>
          <div className="row between"><span>Untung kotor</span><b style={{ color: price - total < 0 ? 'var(--bad)' : undefined }}>{rp(price - total)}</b></div>
          {total > price && price > 0 && <span className="small" style={{ color: 'var(--bad)' }}>Biaya bahan melebihi harga jual.</span>}
        </div>
        <button className="cta" disabled={busy} onClick={save}>{busy ? 'Menyimpan…' : 'Simpan resep'}</button>
        <span className="small muted">Perubahan resep berlaku untuk pesanan yang selesai sesudahnya; pesanan lama tidak berubah.</span>
      </>}
    </Sheet>
  );
}

function Laporan({ kosId, T }) {
  const [range, setRange] = useState('bulan');
  const [d, setD] = useState(null);
  const t = today();
  const from = range === 'bulan' ? t.slice(0, 7) + '-01' : range === '7' ? plus(t, -6) : plus(t, -29);
  useEffect(() => { setD(null); supabase.rpc('food_cost_report', { p_kos: kosId, p_from: from, p_to: t }).then(({ data, error }) => (error ? (toast(errMsg(error)), setD({ menus: [] })) : setD(data))); }, [kosId, range]);
  const pct = d && Number(d.revenue) > 0 ? Math.round((Number(d.cost) * 1000) / Number(d.revenue)) / 10 : null;
  return (
    <div className="stack">
      <div className="seg">{[['7', '7 hari'], ['bulan', 'Bulan ini'], ['30', '30 hari']].map(([k, l]) => <button key={k} className={range === k ? 'on' : ''} onClick={() => setRange(k)}>{l}</button>)}</div>
      {!d ? <Loading /> : <>
        <div className="grid">
          <Tile label="Biaya bahan terpakai" value={rp(d.cost)} sub={`dari penjualan ${rp(d.revenue)}`} />
          <Tile label={T.kul ? 'Food cost' : 'Persen biaya bahan'} value={pct == null ? '—' : `${angka(pct)}%`} tone={pctTone(pct)} sub="biaya bahan ÷ penjualan" />
          <Tile label="Bahan terbuang" value={rp(d.waste)} sub="rusak & kedaluwarsa" tone={Number(d.waste) > 0 ? 'gold' : ''} />
        </div>
        {d.menus.length === 0 ? <Empty title="Belum ada pesanan selesai" text="Laporan terisi setelah ada pesanan yang selesai pada rentang ini." /> :
          <section className="panel"><div className="list">{d.menus.map((m) => (
            <div className="li" key={m.name}>
              <div className="main"><b>{m.name}</b><span className="small muted">{angka(m.qty)} terjual · {rp(m.revenue)}{m.cost != null ? ` · bahan ${rp(m.cost)}` : ' · belum ada resep'}</span></div>
              <div style={{ textAlign: 'right', flex: 'none' }}>{m.pct != null ? <><span className={'chip ' + pctTone(m.pct)}>{angka(m.pct)}%</span><div className="small muted" style={{ whiteSpace: 'nowrap' }}>untung {rp(m.margin)}</div></> : <span className="small muted">—</span>}</div>
            </div>
          ))}</div></section>}
        {Number(d.revenue_no_recipe) > 0 && <span className="small muted">Penjualan {rp(d.revenue_no_recipe)} berasal dari {T.svc.toLowerCase()} tanpa resep (tidak dihitung dalam persen).</span>}
        {Number(d.manual_use) > 0 && <span className="small muted">Pemakaian bahan yang dicatat manual (di luar resep): {rp(d.manual_use)}.</span>}
        <span className="small muted">Biaya bahan dihitung dari harga modal saat pesanan selesai. Pesanan sebelum resep diisi tidak punya biaya bahan.</span>
      </>}
    </div>
  );
}
