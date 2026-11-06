'use client';
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useKos } from '@/components/KosProvider';
import { Loading, Empty, Field, run } from '@/components/ui';
import { tgl, errMsg } from '@/lib/format';
import { can, ROLE, ROLE_DESC } from '@/lib/admin';

// Staf & hak akses (khusus Super Admin). Izin diperiksa di database untuk setiap tindakan.
export default function Staf() {
  const { adminMe } = useKos();
  const [rows, setRows] = useState(null);
  const [err, setErr] = useState(null);
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('support');
  const load = () => supabase.rpc('admin_staff_list').then(({ data, error }) => (error ? setErr(errMsg(error)) : setRows(data)));
  useEffect(() => { if (can(adminMe, 'staff.manage')) load(); }, [adminMe]);
  if (!can(adminMe, 'staff.manage')) return <Empty title="Khusus Super Admin" />;
  if (err) return <div className="notice bad">{err}</div>;
  if (!rows) return <Loading />;
  const save = async (e, r, a) => { if (await run(() => supabase.rpc('admin_staff_save', { p_email: e, p_role: r, p_active: a }), 'Staf diperbarui', errMsg)) { setEmail(''); load(); } };
  return (
    <div className="stack">
      <h2>Staf & hak akses</h2>
      <section className="panel">
        <h3>Tambah staf</h3>
        <p className="small muted" style={{ margin: 0 }}>Staf masuk dengan email yang sama di halaman Masuk (daftar dulu bila belum punya akun). Mereka tidak bisa melihat data penghuni atau pelanggan toko.</p>
        <div className="row">
          <Field label="Email"><input type="email" inputMode="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="nama@email.com" /></Field>
          <Field label="Peran"><select value={role} onChange={(e) => setRole(e.target.value)}>{Object.entries(ROLE).filter(([k]) => k !== 'super_admin').map(([k, l]) => <option key={k} value={k}>{l}</option>)}<option value="super_admin">Super Admin</option></select></Field>
        </div>
        <span className="small muted">{ROLE_DESC[role]}</span>
        <button className="primary" disabled={!email.includes('@')} onClick={() => save(email, role, true)}>Simpan</button>
      </section>
      <section className="panel"><div className="list">{rows.map((s) => (
        <div className="li" key={s.email} style={{ alignItems: 'flex-start' }}>
          <div className="main"><b className="small">{s.email}</b><span className="small muted">{ROLE[s.role]} · sejak {tgl(String(s.created_at).slice(0, 10))}{s.added_by ? ` · oleh ${s.added_by}` : ''}</span></div>
          {s.email === String(adminMe.email || '').toLowerCase() ? <span className="chip info">Anda</span> : (
            <div className="row" style={{ flexWrap: 'nowrap' }}>
              <select aria-label={`Peran ${s.email}`} value={s.role} onChange={(e) => save(s.email, e.target.value, s.active)}>{Object.entries(ROLE).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
              <button className={'sm' + (s.active ? ' danger' : '')} onClick={() => save(s.email, s.role, !s.active)}>{s.active ? 'Nonaktifkan' : 'Aktifkan'}</button>
            </div>
          )}
        </div>
      ))}</div></section>
      <section className="panel">
        <h3>Arti setiap peran</h3>
        <div className="list">{Object.entries(ROLE_DESC).map(([k, d]) => <div className="li" key={k} style={{ alignItems: 'flex-start' }}><b className="small" style={{ minWidth: 100 }}>{ROLE[k]}</b><span className="small muted">{d}</span></div>)}</div>
      </section>
    </div>
  );
}
