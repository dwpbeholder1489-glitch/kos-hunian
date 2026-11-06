'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { useKos } from '@/components/KosProvider';
import PageHelp from '@/components/PageHelp';
import Rekomendasi from '@/components/Rekomendasi';
import { Sheet, Field, Loading, Empty, run, toast } from '@/components/ui';
import { tgl, errMsg } from '@/lib/format';
import { canArea } from '@/lib/business';
import { FEATURE_CODES } from '@/lib/plan';
import { GROUPS, LEGAL_KIND, PROFILE_Q } from '@/lib/modules';

const RISK = { rendah: ['Risiko rendah', 'good'], menengah: ['Perlu persetujuan', 'gold'], tinggi: ['Risiko tinggi', 'bad'] };
const ACT = {
  aktifkan_modul: 'Mengaktifkan modul', nonaktifkan_modul: 'Menonaktifkan modul', minta_persetujuan: 'Meminta persetujuan', tolak_persetujuan: 'Menolak permintaan',
  konfigurasi_awal: 'Konfigurasi awal', rekomendasi_diterima: 'Menerapkan saran', rekomendasi_diabaikan: 'Mengabaikan saran', ekspor_data: 'Mengunduh semua data', tutup_bisnis: 'Menutup bisnis', buka_bisnis: 'Membuka kembali bisnis', lokasi_karyawan: 'Menetapkan lokasi kerja karyawan', jurnal_manual: 'Jurnal manual', tutup_periode: 'Menutup periode buku', buka_periode: 'Membuka kembali periode buku', ubah_aturan_persetujuan: 'Mengubah aturan persetujuan', nyalakan_otomatisasi: 'Menyalakan otomatisasi', matikan_otomatisasi: 'Mematikan otomatisasi', arsip_kontak: 'Mengarsipkan kontak', hapus_kontak: 'Menghapus kontak', pulihkan_kontak: 'Memulihkan kontak', ubah_profil: 'Mengubah profil bisnis', tambah_cabang: 'Menambah cabang/gudang', ubah_cabang: 'Mengubah cabang/gudang',
};
const when = (ts) => { const s = String(ts); return `${tgl(s.slice(0, 10))} ${new Date(s).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Jakarta' })}`; };

// Pusat konfigurasi pemilik (blueprint 20.5): profil bisnis, modul, cabang & gudang, persetujuan, riwayat
export default function Konfigurasi() {
  const { kos, kosId, loadKos, ver } = useKos();
  const owner = canArea(kos, 'team');
  const [tab, setTab] = useState('modul');
  useEffect(() => { try { const t = new URLSearchParams(window.location.search).get('tab'); if (t) setTab(t); } catch {} }, []);  // mis. /konfigurasi?tab=cabang dari Mutasi stok
  const [cat, setCat] = useState(null);
  const [reqs, setReqs] = useState([]);
  const [hist, setHist] = useState(null);
  const [branches, setBranches] = useState([]);
  const [err, setErr] = useState(null);
  const [open, setOpen] = useState(null);
  const load = async () => {
    const [c, r, h, b] = await Promise.all([
      supabase.rpc('module_catalog', { p_kos: kosId }),
      supabase.from('config_requests').select('*').eq('kos_id', kosId).order('created_at', { ascending: false }).limit(30),
      supabase.from('config_history').select('*').eq('kos_id', kosId).order('created_at', { ascending: false }).limit(60),
      supabase.from('branches').select('*').eq('kos_id', kosId).order('created_at'),
    ]);
    if (c.error) return setErr(errMsg(c.error));
    setCat(c.data); setReqs(r.data || []); setHist(h.data || []); setBranches(b.data || []);
  };
  useEffect(() => { load(); }, [kosId, ver]);
  if (err) return <div className="notice bad">{/module_catalog/.test(err) ? 'Database sedang diperbarui. Coba lagi beberapa menit lagi.' : err}</div>;
  if (!cat) return <Loading />;
  const pending = reqs.filter((r) => r.status === 'menunggu');
  const name = (code) => cat.find((m) => m.code === code)?.name || code;
  const refresh = () => { load(); loadKos(); };

  return (
    <div className="stack">
      <div className="row"><h2>Pusat konfigurasi</h2><PageHelp page="konfigurasi" /></div>
      <p className="small muted" style={{ margin: 0 }}>Atur profil, modul, dan struktur {kos.name}. Perubahan penting dicatat dan {owner ? 'langsung diterapkan setelah Anda konfirmasi' : 'menunggu persetujuan pemilik'}.</p>
      <div className="seg" style={{ overflowX: 'auto' }}>
        {[['modul', 'Modul'], ['saran', 'Saran'], ['profil', 'Profil'], ['cabang', 'Cabang & gudang'], ['setuju', 'Persetujuan'], ['riwayat', 'Riwayat']].map(([k, l]) => <button key={k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>{l}</button>)}
      </div>

      {tab === 'modul' && <>
        {['aktif', 'tersedia', 'segera'].map((g) => {
          const list = cat.filter((m) => (g === 'aktif' ? m.active : g === 'tersedia' ? !m.active && m.status === 'available' : m.status === 'segera'));
          if (!list.length) return null;
          return (
            <section className="panel" key={g}>
              <h3>{g === 'aktif' ? 'Modul aktif' : g === 'tersedia' ? 'Bisa diaktifkan' : 'Segera hadir'}</h3>
              <div className="list">{list.map((m) => (
                <button key={m.code} className="li click" onClick={() => m.status === 'available' && setOpen(m)} style={{ background: 'none', border: 0, borderTop: '1px solid var(--line)', borderRadius: 0, width: '100%', textAlign: 'left', font: 'inherit', color: 'inherit' }}>
                  <div className="main"><b>{m.name}</b><span className="small muted">{m.description}</span></div>
                  {m.core ? <span className="chip">Inti</span> : m.pending ? <span className="chip gold">Menunggu</span> : m.status === 'segera' ? <span className="chip void">Segera</span> : m.active ? <span className="chip good">Aktif</span> : <span className="chip">Nonaktif</span>}
                </button>
              ))}</div>
            </section>
          );
        })}
        <span className="small muted">Menonaktifkan modul hanya menyembunyikan menunya dan menolak pemakaiannya di server — data lama tidak dihapus dan kembali saat diaktifkan lagi.</span>
      </>}

      {tab === 'saran' && <Rekomendasi />}
      {tab === 'profil' && <ProfileTab kos={kos} owner={owner} onSaved={refresh} />}
      {tab === 'cabang' && <BranchTab kosId={kosId} owner={owner} branches={branches} onSaved={() => { load(); loadKos(); }} />}

      {tab === 'setuju' && (
        <section className="panel">
          <span className="small">Semua permintaan persetujuan (termasuk perubahan modul) kini ada di menu <b>Persetujuan</b>.</span>
          <Link href="/persetujuan"><button className="primary">Buka Persetujuan</button></Link>
          {reqs.length > 0 && <details><summary className="small">Permintaan lama ({reqs.length})</summary><div className="list">{reqs.map((r) => (
            <div className="li" key={r.id}><span className="small">{r.action === 'aktifkan' ? 'Aktifkan' : 'Nonaktifkan'} {name(r.module_code)} · {r.requested_by}</span><span className="chip void">{r.status}</span></div>
          ))}</div></details>}
        </section>
      )}

      {tab === 'riwayat' && (!hist?.length ? <Empty title="Belum ada perubahan" /> : (
        <section className="panel"><div className="list">{hist.map((h) => (
          <div className="li" key={h.id} style={{ alignItems: 'flex-start' }}>
            <div className="main">
              <b className="small">{ACT[h.action] || h.action}{h.target && h.target !== 'profil' && h.target !== 'modul' ? `: ${name(h.target)}` : ''}</b>
              <span className="small muted">{h.actor || 'sistem'}{h.approved_by && h.approved_by !== h.actor ? ` · disetujui ${h.approved_by}` : ''}{h.reason ? ` · "${h.reason}"` : ''}</span>
            </div>
            <div style={{ textAlign: 'right' }}>{h.risk && <span className={'chip ' + (RISK[h.risk]?.[1] || '')}>{h.risk}</span>}<br /><span className="small muted" style={{ whiteSpace: 'nowrap' }}>{when(h.created_at)}</span></div>
          </div>
        ))}</div></section>
      ))}

      {open && <ModuleSheet m={open} owner={owner} kosId={kosId} onClose={() => setOpen(null)} onDone={() => { setOpen(null); refresh(); }} />}
    </div>
  );
}

function ModuleSheet({ m, owner, kosId, onClose, onDone }) {
  const [reason, setReason] = useState('');
  const turnOn = !m.active;
  const apply = async () => {
    const msg = turnOn
      ? `Aktifkan modul ${m.name}?\nMenu: ${m.paths.join(', ') || '-'}\nData yang dipakai: ${m.data_used || '-'}`
      : `Nonaktifkan modul ${m.name}?\nMenunya disembunyikan dan pemakaiannya ditolak server. Data lama TIDAK dihapus.${m.open_items ? `\nPerhatian: ${m.open_items}.` : ''}`;
    if (!window.confirm(msg)) return;
    const { data, error } = await supabase.rpc('module_set', { p_kos: kosId, p_code: m.code, p_on: turnOn, p_reason: reason });
    if (error) return toast(errMsg(error));
    toast(data === 'menunggu' ? 'Permintaan dikirim ke pemilik' : turnOn ? 'Modul aktif' : 'Modul dinonaktifkan');
    onDone();
  };
  return (
    <Sheet title={m.name} onClose={onClose}>
      <p style={{ margin: 0 }}>{m.description}</p>
      <div className="list">
        <div className="li"><span className="small">Status</span><b className="small">{m.core ? 'Inti (selalu aktif)' : m.active ? 'Aktif' : 'Nonaktif'}</b></div>
        <div className="li"><span className="small">Menu</span><b className="small">{m.paths.length ? m.paths.join(', ') : '—'}</b></div>
        <div className="li"><span className="small">Data yang dipakai</span><b className="small">{m.data_used || '—'}</b></div>
        <div className="li"><span className="small">Butuh modul</span><b className="small">{m.depends_names.length ? m.depends_names.join(', ') : '—'}</b></div>
        {m.dependents.length > 0 && <div className="li"><span className="small">Dipakai oleh</span><b className="small">{m.dependents.join(', ')}</b></div>}
        <div className="li"><span className="small">Paket</span><b className="small">{m.entitlement ? `${FEATURE_CODES[m.entitlement] || m.entitlement}: ${m.plan_ok ? 'termasuk paket Anda' : 'perlu paket lebih tinggi'}` : 'Semua paket'}</b></div>
        <div className="li"><span className="small">Versi</span><b className="small">{m.version}</b></div>
      </div>
      {m.open_items && !turnOn && <div className="notice">{m.open_items}.</div>}
      {!m.core && !m.pending && <>
        {!turnOn && <Field label="Alasan (wajib, tercatat)"><input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="mis. belum dipakai" /></Field>}
        {turnOn && !m.plan_ok ? <Link href="/langganan"><button className="primary" style={{ width: '100%' }}>Lihat paket</button></Link>
          : <button className={turnOn ? 'primary' : 'danger'} onClick={apply} disabled={!turnOn && reason.trim().length < 3}>{owner ? (turnOn ? 'Aktifkan' : 'Nonaktifkan') : (turnOn ? 'Minta diaktifkan' : 'Minta dinonaktifkan')}</button>}
        {!owner && <span className="small muted">Sebagai pengelola, perubahan modul dikirim ke pemilik untuk disetujui.</span>}
      </>}
      {m.pending && <div className="notice">Ada permintaan "{m.pending}" yang menunggu persetujuan pemilik.</div>}
    </Sheet>
  );
}

function ProfileTab({ kos, owner, onSaved }) {
  const [groups, setGroups] = useState(kos.business_groups?.length ? kos.business_groups : [kos.business_type === 'retail' ? 'retail_trading' : 'property_rental']);
  const [prof, setProf] = useState(kos.profile || {});
  const [le, setLe] = useState(kos.legal_entity_id || '');
  const [ents, setEnts] = useState([]);
  const [newLe, setNewLe] = useState(null);
  useEffect(() => { if (owner) supabase.from('legal_entities').select('*').order('created_at').then(({ data }) => setEnts(data || [])); }, [owner]);
  if (kos.business_groups === undefined) return <div className="notice">Profil bisnis belum tersedia. Coba lagi beberapa menit lagi.</div>;
  const qs = PROFILE_Q.filter((q) => !q.only || q.only === kos.business_type);
  const save = async () => {
    if (await run(() => supabase.rpc('business_profile_save', { p_kos: kos.id, p_groups: groups, p_profile: prof, p_legal_entity: le || null }), 'Profil disimpan', errMsg)) onSaved();
  };
  const addLe = async () => {
    const { data, error } = await supabase.from('legal_entities').insert({ name: newLe.name.trim(), kind: newLe.kind }).select().single();
    if (error) return toast(errMsg(error));
    setEnts([...ents, data]); setLe(data.id); setNewLe(null);
  };
  return (
    <>
      <section className="panel">
        <h3>Kelompok bisnis</h3>
        <span className="small muted">Boleh lebih dari satu (mis. grosir + distribusi). Menu saat ini mengikuti jenis bisnis {kos.business_type === 'retail' ? 'Retail & Grosir' : 'Properti & Sewa'}; kelompok lain dipakai untuk rekomendasi modul yang akan datang.</span>
        <div className="row" style={{ gap: 6 }}>{Object.entries(GROUPS).map(([k, l]) => (
          <button key={k} className={'sm ' + (groups.includes(k) ? 'primary' : '')} aria-pressed={groups.includes(k)} onClick={() => setGroups(groups.includes(k) ? groups.filter((x) => x !== k) : [...groups, k])}>{l}</button>
        ))}</div>
      </section>
      <section className="panel">
        <h3>Karakteristik usaha</h3>
        {qs.map((q) => (
          <Field key={q.key} label={q.label}>
            <select value={prof[q.key] ?? ''} onChange={(e) => setProf({ ...prof, [q.key]: e.target.value })}>
              <option value="">— pilih —</option>
              {q.options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </Field>
        ))}
      </section>
      <section className="panel">
        <h3>Badan usaha</h3>
        <span className="small muted">Bisnis dengan badan usaha berbeda tidak digabung pembukuannya. {owner ? '' : 'Hanya pemilik yang bisa mengubah.'}</span>
        {owner ? <>
          <Field label="Bisnis ini milik"><select value={le} onChange={(e) => setLe(e.target.value)}><option value="">Belum diatur</option>{ents.map((x) => <option key={x.id} value={x.id}>{x.name} ({LEGAL_KIND[x.kind]})</option>)}</select></Field>
          {!newLe ? <button className="sm ghost" onClick={() => setNewLe({ name: '', kind: 'perorangan' })}>+ Badan usaha baru</button> : <div className="stack" style={{ gap: 8 }}>
            <Field label="Nama"><input value={newLe.name} onChange={(e) => setNewLe({ ...newLe, name: e.target.value })} placeholder="mis. Dewo (perorangan) atau CV Subur Makmur" /></Field>
            <Field label="Bentuk"><select value={newLe.kind} onChange={(e) => setNewLe({ ...newLe, kind: e.target.value })}>{Object.entries(LEGAL_KIND).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></Field>
            <div className="row"><button className="sm primary" onClick={addLe} disabled={newLe.name.trim().length < 2}>Simpan badan usaha</button><button className="sm ghost" onClick={() => setNewLe(null)}>Batal</button></div>
          </div>}
        </> : <b className="small">{kos.legal_entity_id ? 'Sudah diatur' : 'Belum diatur'}</b>}
      </section>
      <button className="primary" onClick={save} disabled={!groups.length}>Simpan profil</button>
    </>
  );
}

function BranchTab({ kosId, owner, branches, onSaved }) {
  const [f, setF] = useState(null);
  const save = async () => {
    if (await run(() => supabase.rpc('branch_save', { p_kos: kosId, p_id: f.id || null, p_name: f.name, p_kind: f.kind, p_address: f.address, p_active: f.active }), 'Disimpan', errMsg)) { setF(null); onSaved(); }
  };
  return (
    <>
      <section className="panel">
        <div className="row between"><h3>Cabang & gudang</h3>{owner && <button className="sm primary" onClick={() => setF({ name: '', kind: 'cabang', address: '', active: true })}>+ Tambah</button>}</div>
        {branches.length === 0 ? <span className="small muted">Belum ada. Lokasi utama adalah alamat bisnis di Pengaturan.</span> : <div className="list">{branches.map((b) => (
          <button key={b.id} className="li click" disabled={!owner} onClick={() => setF({ ...b })} style={{ background: 'none', border: 0, borderTop: '1px solid var(--line)', borderRadius: 0, width: '100%', textAlign: 'left', font: 'inherit', color: 'inherit' }}>
            <div className="main"><b>{b.name}{b.is_main && <span className="chip gold" style={{ marginLeft: 6 }}>Utama</span>}</b><span className="small muted">{b.kind === 'gudang' ? 'Gudang' : 'Cabang'}{b.address ? ` · ${b.address}` : ''}</span></div>
            <span className={'chip ' + (b.active ? 'good' : 'void')}>{b.active ? 'Aktif' : 'Nonaktif'}</span>
          </button>
        ))}</div>}
        <span className="small muted">Toko: setiap lokasi punya stoknya sendiri. Penjualan, belanja, dan penyesuaian stok tercatat di lokasi kerja pengguna; pindahkan barang lewat Mutasi stok. Lokasi yang masih ada stoknya tidak bisa dinonaktifkan. Kas, biaya, dan pembukuan tetap satu untuk seluruh bisnis.</span>
      </section>
      {f && (
        <Sheet title={f.id ? 'Ubah cabang/gudang' : 'Cabang/gudang baru'} onClose={() => setF(null)}>
          <Field label="Nama"><input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
          <Field label="Jenis"><select value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value })}><option value="cabang">Cabang</option><option value="gudang">Gudang</option></select></Field>
          <Field label="Alamat"><input value={f.address || ''} onChange={(e) => setF({ ...f, address: e.target.value })} /></Field>
          {f.id && !f.is_main && <label className="row small"><input type="checkbox" style={{ width: 22, minHeight: 22 }} checked={f.active} onChange={(e) => setF({ ...f, active: e.target.checked })} />Aktif</label>}
          <button className="primary" onClick={save} disabled={f.name.trim().length < 2}>Simpan</button>
        </Sheet>
      )}
    </>
  );
}
