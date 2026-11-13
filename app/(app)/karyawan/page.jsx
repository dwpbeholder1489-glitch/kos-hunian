'use client';
import { useEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useKos } from '@/components/KosProvider';
import PageHelp from '@/components/PageHelp';
import { Field, Loading, Sheet, toast } from '@/components/ui';
import FiturUpgrade from '@/components/FiturUpgrade';
import { GrowthSheet } from '@/components/GrowthOffer';
import { tgl, rp, errMsg } from '@/lib/format';
import { ROLES, AREA_NAMES, multiLoc } from '@/lib/business';
import { SITE_URL } from '@/lib/plan';
import { useRouter } from 'next/navigation';

// Karyawan: undang lewat email, atur peran, nonaktifkan, hapus. Izin tiap peran ditegakkan di database.
export default function Karyawan() {
  const { kosId, kos } = useKos();
  const [d, setD] = useState(null);
  const [err, setErr] = useState(null);
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('');
  const [busy, setBusy] = useState(false);
  const multi = multiLoc(kos);
  const router = useRouter();
  const [offer, setOffer] = useState(null);  // penawaran upgrade dari server saat batas karyawan penuh (UPGRADE.EMPLOYEE.LIMIT)
  const [mloc, setMloc] = useState({});   // user_id → lokasi yang ditetapkan
  const [akses, setAkses] = useState(null); // karyawan yang sedang diatur hak aksesnya
  const load = () => {
    if (multi) supabase.from('member_locations').select('user_id,branch_id,locked').eq('kos_id', kosId).then(({ data }) => setMloc(Object.fromEntries((data || []).filter((x) => x.locked).map((x) => [x.user_id, x.branch_id]))));
    return supabase.rpc('team_list', { p_kos: kosId }).then(({ data, error }) => {
      if (error) return setErr(errMsg(error));
      setD(data); setRole((r) => r || data.roles[1]);
    });
  };
  useEffect(() => { setD(null); load(); }, [kosId]);
  // Kembali dari "Upgrade Berhasil!" (/karyawan?tambah=1): formulir undangan langsung siap diisi
  const emailRef = useRef(null);
  const [fokus, setFokus] = useState(false);
  useEffect(() => {
    if (!d || fokus) return;
    try { if (new URLSearchParams(window.location.search).get('tambah') === '1') { setFokus(true); emailRef.current?.scrollIntoView({ block: 'center' }); emailRef.current?.focus(); } } catch {}
  }, [d, fokus]);
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
    if (full) {
      // Penawaran dari server (batas & frekuensi dicek di sana); tanpa penawaran, cukup pesan batas
      const { data: o } = await supabase.rpc('growth_offer', { p_kos: kosId, p_context: 'karyawan' });
      if (!o) return toast('Batas karyawan paket ini sudah tercapai. Hapus karyawan yang tidak dipakai, atau upgrade paket di Langganan.');
      supabase.rpc('growth_track', { p_kos: kosId, p_rule: o.id, p_action: 'shown', p_event: 'EMPLOYEE.CREATE_REQUESTED' }).then(() => {}, () => {});
      return setOffer(o);
    }
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
        <Field label="Email karyawan"><input ref={emailRef} type="email" inputMode="email" autoCapitalize="none" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="nama@gmail.com" /></Field>
        <Field label="Peran"><select value={role} onChange={(e) => setRole(e.target.value)}>{d.roles.map((r) => <option key={r} value={r}>{ROLES[r]?.name || r}</option>)}</select></Field>
        <span className="small muted">{ROLES[role]?.desc}</span>
        {full && <div className="notice">Batas karyawan paket ini sudah tercapai. Hapus yang tidak dipakai atau upgrade paket di Langganan.</div>}
        <button className="primary" disabled={busy || !email.trim()}>Undang</button>
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
            {(m.areas || Object.keys(m.perms || {}).length > 0 || m.can_approve) && <div className="row small">
              {m.areas && <span className="chip">{d.fitur?.modul ? 'Modul: ' : 'Modul (tidak berlaku di paket ini): '}{m.areas.map((a) => AREA_NAMES[a]?.[0] || a).join(', ')}</span>}
              {Object.keys(m.perms || {}).length > 0 && <span className="chip">{Object.keys(m.perms).length} izin khusus{d.fitur?.granular ? '' : ' (tidak berlaku)'}</span>}
              {m.can_approve && <span className="chip good">Penyetuju tingkat 1{d.fitur?.bertingkat ? '' : ' (tidak berlaku)'}</span>}
            </div>}
            <div className="row">
              <select value={m.role} disabled={busy} onChange={(e) => call('team_update', { p_kos: kosId, p_user: m.user_id, p_role: e.target.value, p_active: m.active }, 'Peran diubah')} aria-label={`Peran ${m.email}`} style={{ flex: 1 }}>
                {d.roles.map((r) => <option key={r} value={r}>{ROLES[r]?.name || r}</option>)}
              </select>
              <button className="sm" disabled={busy} onClick={() => call('team_update', { p_kos: kosId, p_user: m.user_id, p_role: m.role, p_active: !m.active }, m.active ? 'Dinonaktifkan' : 'Diaktifkan lagi')}>{m.active ? 'Nonaktifkan' : 'Aktifkan'}</button>
              <button className="sm" disabled={busy} onClick={() => setAkses(m)}>Atur akses</button>
              <button className="sm ghost danger" disabled={busy} onClick={() => call('team_remove', { p_kos: kosId, p_user: m.user_id }, 'Email dihapus dari daftar', `Hapus ${m.email} dari ${kos.name}?\nAksesnya langsung tertutup. Riwayat transaksinya tetap tersimpan.`)}>Hapus</button>
            </div>
            {multi && <label className="row small" style={{ flexWrap: 'nowrap' }}><span style={{ whiteSpace: 'nowrap' }}>📍 Lokasi kerja</span>
              <select value={mloc[m.user_id] || ''} disabled={busy} onChange={(e) => call('member_location_set', { p_kos: kosId, p_user: m.user_id, p_branch: e.target.value || null }, e.target.value ? 'Lokasi kerja ditetapkan' : 'Karyawan bebas memilih lokasi')} aria-label={`Lokasi kerja ${m.email}`} style={{ flex: 1 }}>
                <option value="">Bebas memilih</option>
                {kos.locs.list.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select></label>}
          </div>
        ))}</div>}
        {multi && <span className="small muted">Lokasi kerja yang ditetapkan tidak bisa diganti sendiri oleh karyawan: penjualan, belanja, dan perubahan stoknya selalu tercatat di lokasi itu.</span>}
        {inactive > 0 && <button className="ghost" disabled={busy} onClick={() => call('team_cleanup', { p_kos: kosId }, 'Daftar dibersihkan', `Hapus ${inactive} email nonaktif/kedaluwarsa sekaligus?`)}>Bersihkan {inactive} email nonaktif / kedaluwarsa</button>}
      </section>

      <section className="panel">
        <h3>Hak akses tiap peran</h3>
        <div className="list">{d.roles.map((r) => <div className="li" key={r} style={{ flexDirection: 'column', alignItems: 'flex-start' }}><b className="small">{ROLES[r].name}</b><span className="small muted">{ROLES[r].desc}</span></div>)}</div>
        <span className="small muted">Batasan ini diperiksa di database, bukan hanya disembunyikan dari menu. Ketuk <b>Atur akses</b> pada karyawan untuk memilih modul sendiri (Paket Bisnis), izin per tindakan, dan penyetuju tingkat 1 (Paket Pro).</span>
      </section>

      {akses && <AksesSheet m={akses} d={d} kosId={kosId} onClose={() => setAkses(null)} onDone={() => { setAkses(null); load(); }} />}

      {offer && <GrowthSheet offer={offer} kosId={kosId} onDone={() => setOffer(null)} />}
    </div>
  );
}

const PERM = [['', 'Ikut aturan bisnis'], ['izinkan', 'Boleh langsung'], ['persetujuan', 'Perlu persetujuan'], ['larang', 'Tidak boleh']];

// Hak akses satu karyawan: modul (Paket Bisnis), izin per tindakan & penyetuju tingkat 1 (Paket Pro). Semua dicek ulang di database.
function AksesSheet({ m, d, kosId, onClose, onDone }) {
  const f = d.fitur || {};
  const [custom, setCustom] = useState(Boolean(m.areas));
  const [areas, setAreas] = useState(m.areas || []);
  const [perms, setPerms] = useState(m.perms || {});
  const [approver, setApprover] = useState(Boolean(m.can_approve));
  const [busy, setBusy] = useState(false);
  const flip = (a) => setAreas((x) => (x.includes(a) ? x.filter((y) => y !== a) : [...x, a]));
  const setPerm = (code, v) => setPerms((x) => { const n = { ...x }; if (v) n[code] = v; else delete n[code]; return n; });
  const save = async () => {
    if (custom && areas.length === 0) return toast('Pilih minimal satu modul');
    setBusy(true);
    const { error } = await supabase.rpc('team_access_set', { p_kos: kosId, p_user: m.user_id, p_areas: custom ? areas : null, p_perms: perms, p_approver: approver });
    setBusy(false);
    if (error) return toast(errMsg(error));
    toast('Hak akses disimpan'); onDone();
  };
  return (
    <Sheet title="Atur akses" onClose={onClose}>
      <b className="small" style={{ wordBreak: 'break-all' }}>{m.email}</b>
      <span className="small muted">Peran: {ROLES[m.role]?.name || m.role}. Perubahan berlaku saat karyawan membuka aplikasi lagi.</span>

      <h3 style={{ margin: '8px 0 0' }}>Modul yang boleh dibuka</h3>
      {!f.modul && <FiturUpgrade kosId={kosId} event="ACCESS.MODULE.REQUESTED" title="Akses per modul tersedia mulai Paket Bisnis" text="Di paket ini setiap karyawan mendapat menu sesuai perannya. Di Paket Bisnis Anda memilih sendiri modul tiap karyawan." />}
      <label className="row small"><input type="radio" style={{ width: 22, minHeight: 22 }} checked={!custom} onChange={() => setCustom(false)} />Sesuai peran ({ROLES[m.role]?.desc})</label>
      <label className="row small"><input type="radio" style={{ width: 22, minHeight: 22 }} checked={custom} disabled={!f.modul && !m.areas} onChange={() => setCustom(true)} />Pilih sendiri</label>
      {custom && <div className="list">{(d.areas || []).map((a) => (
        <label key={a} className="li" style={{ alignItems: 'flex-start', gap: 10 }}>
          <input type="checkbox" style={{ width: 22, minHeight: 22, flex: 'none' }} checked={areas.includes(a)} disabled={!f.modul} onChange={() => flip(a)} />
          <span style={{ display: 'flex', flexDirection: 'column' }}><b className="small">{AREA_NAMES[a]?.[0] || a}</b><span className="small muted">{AREA_NAMES[a]?.[1]}</span></span>
        </label>
      ))}</div>}
      <span className="small muted">Karyawan & Langganan selalu khusus pemilik.</span>

      <h3 style={{ margin: '8px 0 0' }}>Izin per tindakan</h3>
      {!f.granular && <FiturUpgrade kosId={kosId} plan="pro" event="ACCESS.GRANULAR.REQUESTED" title="Izin per tindakan tersedia di Paket Pro" text="Atur untuk tiap karyawan: boleh langsung, perlu persetujuan, atau tidak boleh sama sekali." />}
      <div className="list">{(d.actions || []).map((x) => (
        <label key={x.code} className="li" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 4 }}>
          <span className="small">{x.label} <span className="muted">· aturan bisnis: {x.required ? 'wajib persetujuan' : 'langsung'}</span></span>
          <select value={perms[x.code] || ''} disabled={!f.granular} onChange={(e) => setPerm(x.code, e.target.value)} aria-label={x.label}>
            {PERM.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </label>
      ))}</div>
      <span className="small muted">“Boleh langsung” juga melewati pengaman bawaan untuk karyawan ini. Tindakan tetap hanya bisa dilakukan di modul yang boleh ia buka.</span>

      <h3 style={{ margin: '8px 0 0' }}>Persetujuan bertingkat</h3>
      {!f.bertingkat && <FiturUpgrade kosId={kosId} plan="pro" event="APPROVAL.MULTILEVEL.REQUESTED" title="Penyetuju tingkat 1 tersedia di Paket Pro" text="Tunjuk pengelola untuk menyetujui permintaan karyawan lain; yang bernilai besar tetap menunggu Anda." />}
      <label className="row small"><input type="checkbox" style={{ width: 22, minHeight: 22 }} checked={approver} disabled={!f.bertingkat && !m.can_approve} onChange={(e) => setApprover(e.target.checked)} />Boleh menyetujui permintaan karyawan lain (tingkat 1), di modul yang boleh ia buka</label>

      <div className="row"><button className="primary" disabled={busy} onClick={save}>{busy ? 'Menyimpan…' : 'Simpan'}</button><button className="ghost" onClick={onClose}>Batal</button></div>
    </Sheet>
  );
}
