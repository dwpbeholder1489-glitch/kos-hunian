'use client';
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useKos } from '@/components/KosProvider';
import { Loading, Empty, Field, Sheet, toast } from '@/components/ui';
import { errMsg } from '@/lib/format';
import { can } from '@/lib/admin';

// Template balasan cepat: dipakai di Chat cepat (profil pelanggan) dan balasan tiket
export default function Template() {
  const { adminMe } = useKos();
  const [rows, setRows] = useState(null);
  const [err, setErr] = useState(null);
  const [edit, setEdit] = useState(null);
  const load = () => supabase.rpc('admin_template_list').then(({ data, error }) => (error ? setErr(errMsg(error)) : setRows(data)));
  useEffect(() => { if (can(adminMe, 'templates.manage')) load(); }, [adminMe]);
  if (!can(adminMe, 'templates.manage')) return <Empty title="Tidak punya izin mengubah template" />;
  if (err) return <div className="notice bad">{err}</div>;
  if (!rows) return <Loading />;
  const save = async (del) => {
    if (!del && (edit.name.trim().length < 2 || edit.body.trim().length < 2)) return toast('Isi nama dan isi template.');
    if (del && !confirm(`Hapus template "${edit.name}"?`)) return;
    const { error } = await supabase.rpc('admin_template_save', { p_id: edit.id || null, p_name: edit.name, p_category: edit.category, p_body: edit.body, p_delete: !!del });
    if (error) return toast(errMsg(error));
    toast(del ? 'Template dihapus' : 'Template disimpan'); setEdit(null); load();
  };
  const cats = [...new Set(rows.map((r) => r.category))];
  return (
    <div className="stack">
      <div className="row between"><h2>Template balasan</h2><button className="primary" onClick={() => setEdit({ name: '', category: 'Umum', body: '' })}>+ Template</button></div>
      <p className="small muted" style={{ margin: 0 }}>Isian otomatis: <code>{'{nama_kos}'}</code> nama bisnis, <code>{'{email}'}</code> email pemilik, <code>{'{situs}'}</code> alamat aplikasi.</p>
      {cats.map((c) => (
        <section className="panel" key={c}><h3>{c}</h3><div className="list">{rows.filter((r) => r.category === c).map((r) => (
          <button key={r.id} className="li click" onClick={() => setEdit(r)} style={{ background: 'none', border: 0, borderTop: '1px solid var(--line)', borderRadius: 0, textAlign: 'left', width: '100%', font: 'inherit', color: 'inherit' }}>
            <div className="main"><b className="small">{r.name}</b><span className="small muted" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.body}</span></div><span className="muted">›</span>
          </button>
        ))}</div></section>
      ))}
      {edit && (
        <Sheet title={edit.id ? 'Ubah template' : 'Template baru'} onClose={() => setEdit(null)}>
          <div className="row"><Field label="Nama"><input value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} /></Field><Field label="Kelompok"><input value={edit.category} onChange={(e) => setEdit({ ...edit, category: e.target.value })} /></Field></div>
          <Field label="Isi"><textarea value={edit.body} onChange={(e) => setEdit({ ...edit, body: e.target.value })} style={{ minHeight: 140 }} /></Field>
          <button className="primary" onClick={() => save(false)}>Simpan</button>
          {edit.id && <button className="ghost danger" onClick={() => save(true)}>Hapus template</button>}
        </Sheet>
      )}
    </div>
  );
}
