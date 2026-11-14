'use client';
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useKos } from '@/components/KosProvider';
import PageHelp from '@/components/PageHelp';
import { Sheet, Field, Loading, toast } from '@/components/ui';
import { rp, angka, errMsg, parseRp } from '@/lib/format';
import { qtyNum } from '@/lib/retail';
import { terms } from '@/lib/jasa';
import EntityPhotos from '@/components/media/EntityPhotos';
import ListThumb, { useThumbs } from '@/components/media/ListThumb';

const UNITS = ['kg', 'pcs', 'pasang', 'meter', 'm²', 'set', 'paket', 'pesanan', 'jam'];
const UNITS_K = ['porsi', 'pcs', 'gelas', 'cup', 'botol', 'bungkus', 'box', 'paket', 'kg', 'loyang'];
import { canArea } from '@/lib/business';
import Link from 'next/link';

// Katalog layanan (harga, minimal, lama pengerjaan) & tahap proses yang bisa diatur — dasar "Configure Many"
export default function Layanan() {
  const { kos, kosId, ver } = useKos();
  const can = canArea(kos, 'settings');
  const [svc, setSvc] = useState(null);
  const [st, setSt] = useState(null);
  const [edit, setEdit] = useState(null);
  const [busy, setBusy] = useState(false);
  const thumbs = useThumbs(kosId, 'service', `${ver}:${edit ? 1 : 0}`);
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
  const T = terms(kos);

  return (
    <div className="stack">
      <div className="row between"><div className="row"><h2>{T.svcs}</h2><PageHelp page="layanan" /></div>{can && <button className="primary" onClick={() => setEdit({})}>+ {T.svc}</button>}</div>
      <p className="small muted" style={{ margin: 0 }}>Harga di sini dipakai otomatis saat menerima pesanan (kasir tidak bisa mengubah harga satuan; potongan lewat diskon yang tercatat).</p>
      {svc.length === 0 && <div className="notice">Belum ada {T.svc.toLowerCase()}. {can ? (T.kul ? 'Tekan + Menu untuk menambah (mis. Nasi goreng, Rp15.000/porsi).' : 'Tekan + Layanan untuk menambah (mis. Jahit celana, Rp15.000/pcs).') : `Minta pemilik menambahkan ${T.svc.toLowerCase()}.`}</div>}
      {groups.map((g) => (
        <section className="panel" key={g}>
          <h3>{g}</h3>
          <div className="list">{svc.filter((s) => (s.category || 'Lainnya') === g).map((s) => (
            <button key={s.id} className="li click" disabled={!can} onClick={() => setEdit(s)} style={{ background: 'none', border: 0, borderTop: '1px solid var(--line)', borderRadius: 0, width: '100%', textAlign: 'left', font: 'inherit', color: 'inherit', opacity: s.active ? 1 : 0.55 }}>
              <div className="row" style={{ flexWrap: 'nowrap', gap: 10, alignItems: 'flex-start', flex: 1, minWidth: 0 }}>{thumbs[s.id] && <ListThumb path={thumbs[s.id]} size={44} />}<div className="main"><b className="small">{s.name}{!s.active && ' (tidak tersedia)'}</b><span className="small muted">{Number(s.min_qty) > 0 ? `minimal ${angka(s.min_qty)} ${s.unit} · ` : ''}{T.kul ? `siap ±${s.hours} jam` : `selesai ±${s.hours} jam`}{s.description ? ` · ${s.description}` : ''}</span>{s.requirements && <span className="small muted">Syarat: {s.requirements}</span>}</div></div>
              <b className="small">{rp(s.price)}/{s.unit}</b>
            </button>
          ))}</div>
        </section>
      ))}
      {T.kul && <Tables kos={kos} can={can} />}
      <section className="panel">
        <h3>Tahap proses</h3>
        <span className="small muted">Urutan tahap antara "Diterima" dan "Siap". {T.kul ? 'Contoh kuliner: Dimasak → Siap saji.' : 'Contoh laundry: Cuci → Kering → Setrika → QC → Kemas.'} Tahap yang sedang dipakai pesanan tidak bisa dinonaktifkan.</span>
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
      {edit && <ServiceForm kosId={kosId} T={T} s={edit} cats={groups} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); load(); }} />}
    </div>
  );
}

// Kuliner: jumlah meja (dipakai pilihan meja di Pesanan dan QR per meja)
function Tables({ kos, can }) {
  const { loadKos } = useKos();
  const [n, setN] = useState(String(kos.profile?.tables ?? 0));
  const [busy, setBusy] = useState(false);
  const save = async () => {
    const v = parseInt(n, 10);
    if (!(v >= 0 && v <= 200)) return toast('Jumlah meja 0–200');
    setBusy(true);
    const { error } = await supabase.rpc('kul_tables_set', { p_kos: kos.id, p_n: v });
    setBusy(false);
    if (error) return toast(errMsg(error));
    toast('Jumlah meja disimpan'); loadKos?.();
  };
  return (
    <section className="panel">
      <h3>Meja</h3>
      <div className="row" style={{ flexWrap: 'nowrap', alignItems: 'flex-end' }}>
        <Field label="Jumlah meja" hint="0 = tanpa makan di tempat bernomor"><input inputMode="numeric" value={n} disabled={!can} onChange={(e) => setN(e.target.value.replace(/\D/g, ''))} /></Field>
        {can && <button className="primary" disabled={busy || String(kos.profile?.tables ?? 0) === n} onClick={save}>Simpan</button>}
      </div>
      <span className="small muted">Dipakai untuk pilihan meja saat menerima pesanan dan untuk <b>QR per meja</b> (ikon Bagikan di pojok kanan atas › Cetak QR semua meja).</span>
    </section>
  );
}

function ServiceForm({ kosId, T, s, cats, onClose, onSaved }) {
  const U = T.kul ? UNITS_K : UNITS;
  const [f, setF] = useState({ name: s.name || '', category: s.category || cats[0] || (T.kul ? 'Makanan' : 'Kiloan'), unit: s.unit || (T.kul ? 'porsi' : 'kg'), price: s.price ? String(Math.round(s.price)) : '', min_qty: s.min_qty ? String(Number(s.min_qty)) : '', hours: String(s.hours || (T.kul ? 1 : 48)), active: s.active !== false, description: s.description || '', requirements: s.requirements || '', info: s.info || '' });
  const [busy, setBusy] = useState(false);
  const set = (k, v) => setF({ ...f, [k]: v });
  const save = async () => {
    if (f.name.trim().length < 2) return toast(`Isi nama ${T.svc.toLowerCase()}.`);
    if (!f.unit.trim()) return toast('Isi satuan.');
    if (!(parseRp(f.price) >= 0) || f.price === '') return toast('Isi harga.');
    setBusy(true);
    const { error } = await supabase.rpc('svc_service_save', { p_kos: kosId, p_id: s.id || null, p: { ...f, price: parseRp(f.price), min_qty: qtyNum(f.min_qty) || 0, hours: parseInt(f.hours, 10) || (T.kul ? 1 : 48) } });
    setBusy(false);
    if (error) return toast(errMsg(error));
    toast(`${T.svc} disimpan`); onSaved();
  };
  return (
    <Sheet title={s.id ? `Ubah ${T.svc.toLowerCase()}` : `${T.svc} baru`} onClose={onClose}>
      {s.id && <EntityPhotos kosId={kosId} entity="service" entityId={s.id} category="layanan" title={`Foto ${T.svc.toLowerCase()}`} max={6} hint={T.kul ? 'Opsional. Foto menu tampil di halaman bisnis.' : 'Opsional. Foto layanan / hasil kerja tampil di halaman bisnis.'} />}
      <Field label={`Nama ${T.svc.toLowerCase()}`}><input value={f.name} onChange={(e) => set('name', e.target.value)} maxLength={80} placeholder={T.kul ? 'mis. Nasi goreng spesial' : 'mis. Cuci kering setrika'} /></Field>
      <div className="row">
        <Field label="Kelompok"><input value={f.category} onChange={(e) => set('category', e.target.value)} maxLength={40} list="svc-cats" /></Field>
        <Field label="Satuan"><select value={U.includes(f.unit) ? f.unit : '__'} onChange={(e) => set('unit', e.target.value === '__' ? '' : e.target.value)}>{U.map((u) => <option key={u}>{u}</option>)}<option value="__">lainnya…</option></select></Field>
      </div>
      <datalist id="svc-cats">{cats.map((c) => <option key={c} value={c} />)}</datalist>
      <div className="row">
        {!U.includes(f.unit) && <Field label="Satuan lain"><input value={f.unit} maxLength={20} placeholder="mis. lembar" onChange={(e) => set('unit', e.target.value)} /></Field>}
        <Field label={`Harga per ${f.unit || 'satuan'}`}><input inputMode="numeric" value={f.price} onChange={(e) => set('price', e.target.value)} /></Field>
        <Field label={`Minimal (${f.unit})`} hint={T.kul ? 'mis. katering minimal 20 porsi; kosongkan bila tidak ada' : 'mis. 3 kg; kosongkan bila tidak ada'}><input inputMode="decimal" value={f.min_qty} onChange={(e) => set('min_qty', e.target.value)} /></Field>
      </div>
      <Field label="Lama pengerjaan (jam)" hint={T.kul ? 'perkiraan siap; 1 jam untuk menu biasa, 24+ untuk katering' : 'untuk janji selesai otomatis, mis. 48 = 2 hari, 6 = kilat'}><input inputMode="numeric" value={f.hours} onChange={(e) => set('hours', e.target.value)} /></Field>
      <Field label="Deskripsi (opsional)" hint="tampil di halaman bisnis"><input value={f.description} maxLength={300} onChange={(e) => set('description', e.target.value)} placeholder={T.kul ? 'mis. nasi, telur, kerupuk' : 'mis. cuci, kering, lipat rapi'} /></Field>
      <Field label="Persyaratan (opsional)"><input value={f.requirements} maxLength={300} onChange={(e) => set('requirements', e.target.value)} placeholder={T.kul ? 'mis. pesan H-1 untuk katering' : 'mis. pakaian luntur dipisah, tidak menerima kulit'} /></Field>
      <Field label="Info tambahan (opsional)"><input value={f.info} maxLength={300} onChange={(e) => set('info', e.target.value)} placeholder={T.kul ? 'mis. level pedas 0–5' : 'mis. pewangi bisa dipilih'} /></Field>
      {s.id && <Link href={`/resep?menu=${s.id}`} className="small" style={{ fontWeight: 700 }}>{T.kul ? 'Atur resep & biaya bahan ›' : 'Atur bahan yang dipakai ›'}</Link>}
      {s.id && <div className="seg">{[[true, 'Tersedia'], [false, 'Tidak tersedia sementara']].map(([k, l]) => <button key={l} className={f.active === k ? 'on' : ''} onClick={() => set('active', k)}>{l}</button>)}</div>}
      {s.id && <span className="small muted">{T.svc} yang tidak tersedia tidak bisa dipilih saat menerima pesanan dan tidak tampil di halaman bisnis.</span>}
      <button className="cta" disabled={busy} onClick={save}>{busy ? 'Menyimpan…' : 'Simpan'}</button>
    </Sheet>
  );
}
