'use client';
import PageHelp from '@/components/PageHelp';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { useKos } from '@/components/KosProvider';
import { useData } from '@/lib/useData';
import { Field, Loading, run } from '@/components/ui';
import { KIND, errMsg } from '@/lib/format';

export default function Pengaturan() {
  const router = useRouter();
  const d = useData();
  const { kos, user, loadKos, bump } = useKos();
  const [name, setName] = useState(kos?.name || '');
  const [addr, setAddr] = useState(kos?.address || '');
  const [cName, setCName] = useState('');
  const [cKind, setCKind] = useState('operasional');
  if (!d.ready || !kos) return <Loading />;
  const isOwner = kos.owner_id === user?.id;

  async function saveKos() {
    if (!name.trim()) return run(() => { throw new Error('Nama kos wajib diisi.'); });
    if (await run(() => supabase.from('kos').update({ name: name.trim(), address: addr.trim() || null }).eq('id', kos.id), 'Profil kos disimpan', errMsg)) loadKos();
  }
  async function addCat() {
    if (!cName.trim()) return;
    if (await run(() => supabase.from('expense_categories').insert({ kos_id: kos.id, name: cName.trim(), kind: cKind }), 'Kategori ditambahkan', errMsg)) { setCName(''); bump(); }
  }
  async function delCat(c) {
    if (!confirm(`Hapus kategori "${c.name}"? Pengeluaran lama tetap ada, tapi tanpa kategori.`)) return;
    if (await run(() => supabase.from('expense_categories').delete().eq('id', c.id), 'Kategori dihapus', errMsg)) bump();
  }
  async function logout() { await supabase.auth.signOut(); router.replace('/masuk'); }

  return (
    <div className="stack">
      <div className="row"><h2>Pengaturan</h2><PageHelp page="pengaturan" /></div>
      <section className="panel"><h3>Profil kos</h3>
        <Field label="Nama kos"><input value={name} onChange={(e) => setName(e.target.value)} disabled={!isOwner} /></Field>
        <Field label="Alamat"><input value={addr} onChange={(e) => setAddr(e.target.value)} disabled={!isOwner} /></Field>
        {isOwner && <button className="primary" onClick={saveKos}>Simpan</button>}
      </section>
      <section className="panel"><h3>Kategori pengeluaran</h3>
        <div className="list">{d.categories.map((c) => (
          <div className="li" key={c.id}><div className="main"><b>{c.name}</b><span className="small muted">{KIND[c.kind]}</span></div><button className="sm ghost danger" onClick={() => delCat(c)}>Hapus</button></div>
        ))}</div>
        <div className="row">
          <Field label="Kategori baru"><input value={cName} onChange={(e) => setCName(e.target.value)} placeholder="mis. Gaji penjaga" /></Field>
          <Field label="Jenis"><select value={cKind} onChange={(e) => setCKind(e.target.value)}>{Object.entries(KIND).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></Field>
        </div>
        <button onClick={addCat}>Tambah kategori</button>
      </section>
      <section className="panel"><h3>Akun</h3>
        <p className="small muted" style={{ margin: 0 }}>Masuk sebagai {user?.email}</p>
        <div className="row">
          <button onClick={() => router.push('/mulai')}>+ Tambah kos lain</button>
          <button className="danger" onClick={logout}>Keluar</button>
        </div>
      </section>
    </div>
  );
}
