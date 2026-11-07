'use client';
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useKos } from '@/components/KosProvider';
import PageHelp from '@/components/PageHelp';
import { Sheet, Field, Loading, toast } from '@/components/ui';
import { rp, angka, errMsg, parseRp } from '@/lib/format';
import { qtyNum } from '@/lib/retail';

const UNITS = ['kg', 'pcs', 'pasang', 'meter', 'm²', 'set', 'paket', 'pesanan', 'jam'];
import { canArea } from '@/lib/business';

// Katalog layanan (harga, minimal, lama pengerjaan) & tahap proses yang bisa diatur — dasar "Configure Many"
export default function Layanan() {
  const { kos, kosId, ver } = useKos();
  const can = canArea(kos, 'settings');
  const [svc, setSvc] = useState(null);
  const [st, setSt] = useState(null);
  const [edit, setEdit] = useState(null);
  const [busy, setBusy] = useState(false);
  const load = async () => {
    const [a, b] = await Promise.all([
      supabase.from('svc_services').select('*').eq('kos_id', kosId).order('sort'),
      supabase.from('svc_stages').select('*').eq('kos_id', kosId).order('sort'),
    ]);
    setSvc(a.data || []); setSt((b.data || []).map((x) => ({ id: x.id, name: x.name, active: x.active })));
  };
  useEffect(() => { load(); }, [kosId, ver]);
  if (!svc || !st) return <Loading />;
  const move = (i, dir) => { const n = [...st]; const j = i + dir; if (j < 0 || j >= n.length) return; [n[i], n[j]] = [n[j], n[i]]; setSt(n); };
  const saveStages = async () => {
    setBusy(true);
    const { error } = await supabase.rpc('svc_stages_save', { p_kos: kosId, p_stages: st });
    setBusy(false);
    if (error) return toast(errMsg(error));
    toast('Tahap proses disimpan'); load();
  };
  const groups = [...new Set(svc.map((s) => s.category || 'Lainnya'))];

  return (
    <div className="stack">
      <div className="row between"><div className="row"><h2>Layanan & tahap</h2><PageHelp page="layanan" /></div>{can && <button className="primary" onClick={() => setEdit({})}>+ Layanan</button>}</div>
      <p className="small muted" style={{ margin: 0 }}>Harga di sini dipakai otomatis saat menerima pesanan (kasir tidak bisa mengubah harga satuan; potongan lewat diskon yang tercatat).</p>
      {svc.length === 0 && <div className="notice">Belum ada layanan. {can ? 'Tekan + Layanan untuk menambah (mis. Jahit celana, Rp15.000/pcs).' : 'Minta pemilik menambahkan layanan.'}</div>}
      {groups.map((g) => (
        <section className="panel" key={g}>
          <h3>{g}</h3>
          <div className="list">{svc.filter((s) => (s.category || 'Lainnya') === g).map((s) => (
            <button key={s.id} className="li click" disabled={!can} onClick={() => setEdit(s)} style={{ background: 'none', border: 0, borderTop: '1px solid var(--line)', borderRadius: 0, width: '100%', textAlign: 'left', font: 'inherit', color: 'inherit', opacity: s.active ? 1 : 0.55 }}>
              <div className="main"><b className="small">{s.name}{!s.active && ' (nonaktif)'}</b><span className="small muted">{Number(s.min_qty) > 0 ? `minimal ${angka(s.min_qty)} ${s.unit} · ` : ''}selesai ±{s.hours} jam</span></div>
              <b className="small">{rp(s.price)}/{s.unit}</b>
            </button>
          ))}</div>
        </section>
      ))}
      <section className="panel">
        <h3>Tahap proses</h3>
        <span className="small muted">Urutan tahap antara "Diterima" dan "Siap". Contoh laundry: Cuci → Kering → Setrika → QC → Kemas. Tahap yang sedang dipakai pesanan tidak bisa dinonaktifkan.</span>
        {st.map((x, i) => (
          <div className="row" key={x.id || 'n' + i} style={{ flexWrap: 'nowrap', alignItems: 'center' }}>
            <span className="small muted" style={{ width: 18 }}>{i + 1}</span>
            <input value={x.name} disabled={!can} maxLength={40} onChange={(e) => setSt(st.map((y, j) => (j === i ? { ...y, name: e.target.value } : y)))} aria-label={`Nama tahap ${i + 1}`} style={{ opacity: x.active ? 1 : 0.5 }} />
            {can && <>
              <button className="sm ghost" onClick={() => move(i, -1)} aria-label="Naik">↑</button>
              <button className="sm ghost" onClick={() => move(i, 1)} aria-label="Turun">↓</button>
              <label className="row small" style={{ flexWrap: 'nowrap' }}><input type="checkbox" style={{ width: 22, minHeight: 22, flex: 'none' }} checked={x.active} onChange={(e) => setSt(st.map((y, j) => (j === i ? { ...y, active: e.target.checked } : y)))} aria-label="Aktif" /></label>
            </>}
          </div>
        ))}
        {can && <div className="row">
          <button className="sm" onClick={() => setSt([...st, { name: '', active: true }])}>+ Tahap</button>
          <button className="primary" disabled={busy} onClick={saveStages}>{busy ? 'Menyimpan…' : 'Simpan tahap'}</button>
        </div>}
      </section>
      {edit && <ServiceForm kosId={kosId} s={edit} cats={groups} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); load(); }} />}
    </div>
  );
}

function ServiceForm({ kosId, s, cats, onClose, onSaved }) {
  const [f, setF] = useState({ name: s.name || '', category: s.category || cats[0] || 'Kiloan', unit: s.unit || 'kg', price: s.price ? String(Math.round(s.price)) : '', min_qty: s.min_qty ? String(Number(s.min_qty)) : '', hours: String(s.hours || 48), active: s.active !== false });
  const [busy, setBusy] = useState(false);
  const set = (k, v) => setF({ ...f, [k]: v });
  const save = async () => {
    if (f.name.trim().length < 2) return toast('Isi nama layanan.');
    if (!f.unit.trim()) return toast('Isi satuan.');
    if (!(parseRp(f.price) >= 0) || f.price === '') return toast('Isi harga.');
    setBusy(true);
    const { error } = await supabase.rpc('svc_service_save', { p_kos: kosId, p_id: s.id || null, p: { ...f, price: parseRp(f.price), min_qty: qtyNum(f.min_qty) || 0, hours: parseInt(f.hours, 10) || 48 } });
    setBusy(false);
    if (error) return toast(errMsg(error));
    toast('Layanan disimpan'); onSaved();
  };
  return (
    <Sheet title={s.id ? 'Ubah layanan' : 'Layanan baru'} onClose={onClose}>
      <Field label="Nama layanan"><input value={f.name} onChange={(e) => set('name', e.target.value)} maxLength={80} placeholder="mis. Cuci kering setrika" /></Field>
      <div className="row">
        <Field label="Kelompok"><input value={f.category} onChange={(e) => set('category', e.target.value)} maxLength={40} list="svc-cats" /></Field>
        <Field label="Satuan"><select value={UNITS.includes(f.unit) ? f.unit : '__'} onChange={(e) => set('unit', e.target.value === '__' ? '' : e.target.value)}>{UNITS.map((u) => <option key={u}>{u}</option>)}<option value="__">lainnya…</option></select></Field>
      </div>
      <datalist id="svc-cats">{cats.map((c) => <option key={c} value={c} />)}</datalist>
      <div className="row">
        {!UNITS.includes(f.unit) && <Field label="Satuan lain"><input value={f.unit} maxLength={20} placeholder="mis. lembar" onChange={(e) => set('unit', e.target.value)} /></Field>}
        <Field label={`Harga per ${f.unit || 'satuan'}`}><input inputMode="numeric" value={f.price} onChange={(e) => set('price', e.target.value)} /></Field>
        <Field label={`Minimal (${f.unit})`} hint="mis. 3 kg; kosongkan bila tidak ada"><input inputMode="decimal" value={f.min_qty} onChange={(e) => set('min_qty', e.target.value)} /></Field>
      </div>
      <Field label="Lama pengerjaan (jam)" hint="untuk janji selesai otomatis, mis. 48 = 2 hari, 6 = kilat"><input inputMode="numeric" value={f.hours} onChange={(e) => set('hours', e.target.value)} /></Field>
      {s.id && <label className="row small"><input type="checkbox" style={{ width: 22, minHeight: 22 }} checked={f.active} onChange={(e) => set('active', e.target.checked)} />Aktif (bisa dipilih saat menerima pesanan)</label>}
      <button className="cta" disabled={busy} onClick={save}>{busy ? 'Menyimpan…' : 'Simpan'}</button>
    </Sheet>
  );
}
