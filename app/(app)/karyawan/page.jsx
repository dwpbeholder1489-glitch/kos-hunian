'use client';
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useKos } from '@/components/KosProvider';
import PageHelp from '@/components/PageHelp';
import { Field, Loading, toast } from '@/components/ui';
import { tgl, errMsg } from '@/lib/format';
import { ROLES } from '@/lib/business';
import { SITE_URL } from '@/lib/plan';

// Karyawan: undang lewat email, atur peran, nonaktifkan, hapus. Izin tiap peran ditegakkan di database.
export default function Karyawan() {
  const { kosId, kos } = useKos();
  const [d, setD] = useState(null);
  const [err, setErr] = useState(null);
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('');
  const [busy, setBusy] = useState(false);
  const load = () => supabase.rpc('team_list', { p_kos: kosId }).then(({ data, error }) => {
    if (error) return setErr(errMsg(error));
    setD(data); setRole((r) => r || data.roles[1]);
  });
  useEffect(() => { setD(null); load(); }, [kosId]);
  if (err) return <div className="notice bad">{/team_list/.test(err) ? 'Database sedang diperbarui. Coba lagi beberapa menit lagi.' : err}</div>;
  if (!d) return <Loading />;

  const call = async (fn, args, ok, ask) => {
    if (ask && !window.confirm(ask)) return;
    setBusy(true);
    const { error } = await supabase.rpc(fn, args);
    setBusy(false);
    if (error) return toast(errMsg(error));
    toast(ok); load();
  };
  const invite = async (e) => {
    e.preventDefault();
    await call('team_invite', { p_kos: kosId, p_email: email, p_role: role }, 'Undangan dibuat');
    setEmail('');
  };
  const staff = d.members.filter((m) => m.role !== 'pemilik');
  const inactive = staff.filter((m) => !m.active).length + d.invites.filter((i) => i.expired).length;
  const full = d.used >= d.limit;
  const ajak = `Halo, Anda saya tambahkan sebagai karyawan di ${kos.name} (PRASARA).\n1. Buka ${SITE_URL}/masuk\n2. Pilih Daftar, pakai email ini, buat kata sandi, lalu konfirmasi lewat email.\n3. Masuk — menu kerja Anda langsung muncul.\nUndangan berlaku 14 hari.`;

  return (
    <div className="stack">
      <div className="row"><h2>Karyawan</h2><PageHelp page="karyawan" /></div>
      <p className="small muted" style={{ margin: 0 }}>Karyawan masuk dengan email & kata sandinya sendiri dan hanya melihat menu sesuai perannya. Terpakai {d.used} dari {d.limit >= 1000 ? 'tanpa batas' : `${d.limit} (paket ini)`}.</p>

      <form className="panel" onSubmit={invite}>
        <h3>Undang karyawan</h3>
        <Field label="Email karyawan"><input type="email" inputMode="email" autoCapitalize="none" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="nama@gmail.com" /></Field>
        <Field label="Peran"><select value={role} onChange={(e) => setRole(e.target.value)}>{d.roles.map((r) => <option key={r} value={r}>{ROLES[r]?.name || r}</option>)}</select></Field>
        <span className="small muted">{ROLES[role]?.desc}</span>
        {full && <div className="notice">Batas karyawan paket ini sudah tercapai. Hapus yang tidak dipakai atau upgrade paket di Langganan.</div>}
        <button className="primary" disabled={busy || !email.trim() || full}>Undang</button>
      </form>

      {d.invites.length > 0 && (
        <section className="panel">
          <h3>Menunggu masuk</h3>
          <div className="list">{d.invites.map((i) => (
            <div className="li" key={i.id} style={{ alignItems: 'flex-start' }}>
              <div className="main"><b className="small">{i.email}</b><span className="small muted">{ROLES[i.role]?.name} · diundang {tgl(String(i.created_at).slice(0, 10))}</span>
                {i.expired ? <span className="chip bad">Kedaluwarsa</span> : <div className="row" style={{ marginTop: 6 }}>
                  <a href={`https://wa.me/?text=${encodeURIComponent(ajak)}`} target="_blank" rel="noreferrer"><button className="sm">Kirim cara masuk via WA</button></a>
                </div>}
              </div>
              <button className="sm ghost danger" disabled={busy} onClick={() => call('team_invite_delete', { p_id: i.id }, 'Undangan dihapus', `Hapus undangan ${i.email}?`)}>Hapus</button>
            </div>
          ))}</div>
        </section>
      )}

      <section className="panel">
        <h3>Daftar karyawan</h3>
        {staff.length === 0 ? <span className="small muted">Belum ada karyawan.</span> : <div className="list">{staff.map((m) => (
          <div className="li" key={m.user_id} style={{ flexDirection: 'column', alignItems: 'stretch', gap: 6 }}>
            <div className="row between"><b className="small" style={{ wordBreak: 'break-all' }}>{m.email}</b>{m.active ? <span className="chip good">Aktif</span> : <span className="chip">Nonaktif</span>}</div>
            <div className="row">
              <select value={m.role} disabled={busy} onChange={(e) => call('team_update', { p_kos: kosId, p_user: m.user_id, p_role: e.target.value, p_active: m.active }, 'Peran diubah')} aria-label={`Peran ${m.email}`} style={{ flex: 1 }}>
                {d.roles.map((r) => <option key={r} value={r}>{ROLES[r]?.name || r}</option>)}
              </select>
              <button className="sm" disabled={busy} onClick={() => call('team_update', { p_kos: kosId, p_user: m.user_id, p_role: m.role, p_active: !m.active }, m.active ? 'Dinonaktifkan' : 'Diaktifkan lagi')}>{m.active ? 'Nonaktifkan' : 'Aktifkan'}</button>
              <button className="sm ghost danger" disabled={busy} onClick={() => call('team_remove', { p_kos: kosId, p_user: m.user_id }, 'Email dihapus dari daftar', `Hapus ${m.email} dari ${kos.name}?\nAksesnya langsung tertutup. Riwayat transaksinya tetap tersimpan.`)}>Hapus</button>
            </div>
          </div>
        ))}</div>}
        {inactive > 0 && <button className="ghost" disabled={busy} onClick={() => call('team_cleanup', { p_kos: kosId }, 'Daftar dibersihkan', `Hapus ${inactive} email nonaktif/kedaluwarsa sekaligus?`)}>Bersihkan {inactive} email nonaktif / kedaluwarsa</button>}
      </section>

      <section className="panel">
        <h3>Hak akses tiap peran</h3>
        <div className="list">{d.roles.map((r) => <div className="li" key={r} style={{ flexDirection: 'column', alignItems: 'flex-start' }}><b className="small">{ROLES[r].name}</b><span className="small muted">{ROLES[r].desc}</span></div>)}</div>
        <span className="small muted">Batasan ini diperiksa di database, bukan hanya disembunyikan dari menu.</span>
      </section>
    </div>
  );
}
