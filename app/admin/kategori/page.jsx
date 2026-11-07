'use client';
// Kategori & subkategori bisnis untuk pendaftaran (Automatic Business Setup). Super Admin bisa menambah/mengubah;
// setiap kategori memakai salah satu mesin (properti/retail/jasa/kustom) dan template. Perubahan tercatat di audit.
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useKos } from '@/components/KosProvider';
import PageHelp from '@/components/PageHelp';
import { Sheet, Field, Loading, Empty, run } from '@/components/ui';
import { errMsg } from '@/lib/format';
import { can } from '@/lib/admin';

const ENGINES = { properti: 'Properti & Sewa', retail: 'Retail & Grosir', jasa: 'Jasa & Laundry', kustom: 'Business Builder' };
const GROUPS = ['retail_trading', 'property_rental', 'services', 'fnb_hospitality', 'project_event', 'manufacturing', 'professional_admin', 'distribution', 'lainnya'];

function Form({ x, tpls, cats, onClose, onSaved }) {
  const sub = x.kind === 'sub';
  const [f, setF] = useState({ ...x });
  const set = (k, v) => setF({ ...f, [k]: v });
  const engine = sub ? f.sub_engine || cats.find((c) => c.code === f.category_code)?.engine : f.engine;
  const save = async () => { if (await run(() => supabase.rpc('admin_biz_category_save', { p: f }), 'Disimpan', errMsg)) onSaved(); };
  return (
    <Sheet title={x.isNew ? (sub ? 'Subkategori baru' : 'Kategori baru') : `Ubah ${x.name}`} onClose={onClose}>
      <Field label="Kode" hint="huruf kecil/angka/garis bawah; tidak bisa diubah setelah dibuat"><input value={f.code || ''} disabled={!x.isNew} autoCapitalize="none" onChange={(e) => set('code', e.target.value.toLowerCase())} /></Field>
      <Field label="Nama"><input value={f.name || ''} maxLength={60} onChange={(e) => set('name', e.target.value)} /></Field>
      {!sub && <div className="row"><Field label="Ikon"><input value={f.icon || ''} maxLength={4} onChange={(e) => set('icon', e.target.value)} /></Field><Field label="Urutan"><input inputMode="numeric" value={f.sort ?? ''} onChange={(e) => set('sort', e.target.value.replace(/\D/g, ''))} /></Field></div>}
      {!sub && <Field label="Keterangan singkat"><input value={f.description || ''} maxLength={120} onChange={(e) => set('description', e.target.value)} /></Field>}
      {sub ? <>
        <Field label="Kategori induk"><select value={f.category_code} onChange={(e) => set('category_code', e.target.value)}>{cats.map((c) => <option key={c.code} value={c.code}>{c.name}</option>)}</select></Field>
        <Field label="Mesin" hint="Kosong = ikut kategori induk"><select value={f.sub_engine || ''} onChange={(e) => setF({ ...f, sub_engine: e.target.value, sub_template: '' })}><option value="">Ikut kategori</option>{Object.entries(ENGINES).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></Field>
        <Field label="Template" hint="Kosong = ikut kategori induk"><select value={f.sub_template || ''} onChange={(e) => set('sub_template', e.target.value)}><option value="">Ikut kategori</option>{tpls.filter((t) => t.engine === engine).map((t) => <option key={t.code} value={t.code}>{t.name}</option>)}</select></Field>
      </> : <>
        <Field label="Mesin"><select value={f.engine} onChange={(e) => setF({ ...f, engine: e.target.value, template: tpls.find((t) => t.engine === e.target.value)?.code })}>{Object.entries(ENGINES).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></Field>
        <Field label="Template"><select value={f.template} onChange={(e) => set('template', e.target.value)}>{tpls.filter((t) => t.engine === f.engine).map((t) => <option key={t.code} value={t.code}>{t.name}</option>)}</select></Field>
        <Field label="Kelompok bisnis"><select value={f.group_code || 'lainnya'} onChange={(e) => set('group_code', e.target.value)}>{GROUPS.map((g) => <option key={g} value={g}>{g}</option>)}</select></Field>
      </>}
      <Field label="Catatan untuk pengguna (opsional)" hint="mis. mesin khusus dalam rencana"><input value={f.note || ''} maxLength={200} onChange={(e) => set('note', e.target.value)} /></Field>
      <label className="row small" style={{ flexWrap: 'nowrap' }}><input type="checkbox" style={{ width: 22, minHeight: 22, flex: 'none' }} checked={f.active !== false} onChange={(e) => set('active', e.target.checked)} />Tampil di pendaftaran</label>
      <button className="primary" onClick={save}>Simpan</button>
    </Sheet>
  );
}

export default function Kategori() {
  const { adminMe } = useKos();
  const [d, setD] = useState(null);
  const [edit, setEdit] = useState(null);
  const load = () => Promise.all([supabase.from('biz_categories').select('*').order('sort'), supabase.from('biz_subcategories').select('*').order('sort'), supabase.from('biz_templates').select('code,name,engine')])
    .then(([c, s, t]) => setD({ cats: c.data || [], subs: s.data || [], tpls: t.data || [], err: c.error && errMsg(c.error) }));
  useEffect(() => { load(); }, []);
  if (!can(adminMe, 'payments.view')) return <Empty title="Tidak punya izin" />;
  if (!d) return <Loading />;
  if (d.err) return <div className="notice bad">Database sedang diperbarui. Coba lagi beberapa menit lagi.</div>;
  const manage = can(adminMe, 'plans.manage');
  const tplName = (c) => d.tpls.find((t) => t.code === c)?.name || c;
  return (
    <div className="stack">
      <div className="row between"><div className="row"><h2>Kategori bisnis</h2><PageHelp page="admin-kategori" /></div>{manage && <button className="primary" onClick={() => setEdit({ kind: 'kategori', isNew: true, engine: 'kustom', template: 'kosong', icon: '🏢', group_code: 'lainnya', active: true })}>+ Kategori</button>}</div>
      <p className="small muted" style={{ margin: 0 }}>Dipakai di pendaftaran ("Apa jenis bisnis Anda?"). Tiap kategori/subkategori memakai mesin & template yang sudah ada — kategori baru tidak butuh perubahan kode. {manage ? '' : 'Hanya Super Admin yang bisa mengubah.'}</p>
      {d.cats.map((c) => (
        <section className="panel" key={c.code} style={{ opacity: c.active ? 1 : 0.6 }}>
          <div className="row between"><b>{c.icon} {c.name}{!c.active && ' (disembunyikan)'}</b>{manage && <button className="sm ghost" onClick={() => setEdit({ ...c, kind: 'kategori' })}>Ubah</button>}</div>
          <span className="small muted">{ENGINES[c.engine]} · template {tplName(c.template)}{c.note ? ` · ${c.note}` : ''}</span>
          <div className="list">{d.subs.filter((s) => s.category_code === c.code).map((s) => (
            <div className="li" key={s.code}><span className="small">{s.name}{!s.active && ' (disembunyikan)'}<br /><span className="muted">{s.engine ? `${ENGINES[s.engine]} · ` : ''}{s.template ? `template ${tplName(s.template)}` : 'ikut kategori'}</span></span>
              {manage && <button className="sm ghost" onClick={() => setEdit({ ...s, kind: 'sub', sub_engine: s.engine || '', sub_template: s.template || '' })}>Ubah</button>}</div>
          ))}</div>
          {manage && <button className="sm ghost" onClick={() => setEdit({ kind: 'sub', isNew: true, category_code: c.code, active: true, code: c.code + '_' })}>+ Subkategori</button>}
        </section>
      ))}
      {edit && <Form x={edit} tpls={d.tpls} cats={d.cats} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); load(); }} />}
    </div>
  );
}
