'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { useKos } from '@/components/KosProvider';
import PageHelp from '@/components/PageHelp';
import Rekomendasi from '@/components/Rekomendasi';
import { Sheet, Field, Loading, Empty, run, toast } from '@/components/ui';
import { tgl, errMsg } from '@/lib/format';
import { canArea, BUSINESS_TYPES } from '@/lib/business';
import { ENTITY, ENTITY_FOR, CF_TYPES } from '@/components/IsianTambahan';
import { FEATURE_CODES } from '@/lib/plan';
import { GrowthSheet } from '@/components/GrowthOffer';
import { GROUPS, LEGAL_KIND, PROFILE_Q, qFor, recommend, MODULE_TYPES } from '@/lib/modules';

const RISK = { rendah: ['Risiko rendah', 'good'], menengah: ['Perlu persetujuan', 'gold'], tinggi: ['Risiko tinggi', 'bad'] };
const ACT = {
  aktifkan_modul: 'Mengaktifkan modul', nonaktifkan_modul: 'Menonaktifkan modul', minta_persetujuan: 'Meminta persetujuan', tolak_persetujuan: 'Menolak permintaan',
  konfigurasi_awal: 'Konfigurasi awal', terbitkan_halaman: 'Menerbitkan halaman bisnis', sembunyikan_halaman: 'Menyembunyikan halaman bisnis', ubah_halaman: 'Mengubah halaman bisnis', rekomendasi_diterima: 'Menerapkan saran', rekomendasi_diabaikan: 'Mengabaikan saran', ekspor_data: 'Mengunduh semua data', tutup_bisnis: 'Menutup bisnis', buka_bisnis: 'Membuka kembali bisnis', lokasi_karyawan: 'Menetapkan lokasi kerja karyawan', jurnal_manual: 'Jurnal manual', tutup_periode: 'Menutup periode buku', buka_periode: 'Membuka kembali periode buku', ubah_aturan_persetujuan: 'Mengubah aturan persetujuan', nyalakan_otomatisasi: 'Menyalakan otomatisasi', matikan_otomatisasi: 'Mematikan otomatisasi', arsip_kontak: 'Mengarsipkan kontak', hapus_kontak: 'Menghapus kontak', pulihkan_kontak: 'Memulihkan kontak', ubah_profil: 'Mengubah profil bisnis', tambah_cabang: 'Menambah cabang/gudang', ubah_cabang: 'Mengubah cabang/gudang', ubah_layanan: 'Mengubah layanan/harga jasa', ubah_tahap_jasa: 'Mengubah tahap proses', ubah_tarif_meteran: 'Mengubah tarif meteran', isian_tambahan: 'Mengubah isian tambahan', builder_uang: 'Mengatur uang masuk (Builder)', builder_profil: 'Mengubah profil (Builder)', builder_jenis_data: 'Mengubah jenis data (Builder)', builder_field: 'Mengubah field (Builder)', builder_alur: 'Mengubah alur (Builder)', builder_aktifkan: 'Mengaktifkan bisnis (Builder)',
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
      {kos?.category_code && <Link href="/konfirmasi" className="small">Konfigurasi awal (layanan, info bisnis, modul yang disetujui) ada di Pusat Konfirmasi →</Link>}
      <p className="small muted" style={{ margin: 0 }}>Atur profil, modul, dan struktur {kos.name}. Perubahan penting dicatat dan {owner ? 'langsung diterapkan setelah Anda konfirmasi' : 'menunggu persetujuan pemilik'}.</p>
      <div className="seg" style={{ overflowX: 'auto' }}>
        {[['modul', 'Modul'], ['saran', 'Saran'], ['profil', 'Profil'], ...(ENTITY_FOR[kos.business_type] ? [['isian', 'Isian tambahan']] : []), ['cabang', 'Cabang & gudang'], ['setuju', 'Persetujuan'], ['riwayat', 'Riwayat']].map(([k, l]) => <button key={k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>{l}</button>)}
      </div>

      {tab === 'isian' && <IsianTab kos={kos} owner={canArea(kos, 'settings')} onSaved={refresh} />}
      {tab === 'modul' && <ModulTab cat={cat} kos={kos} onOpen={setOpen} />}
      {tab === 'modul' && <>
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
  const [impact, setImpact] = useState(null);   // dampak menonaktifkan (module_impact), dibaca dari server
  useEffect(() => { if (!turnOn && !m.core) supabase.rpc('module_impact', { p_kos: kosId, p_code: m.code }).then(({ data }) => setImpact(data || null)); }, [m.code]);
  const apply = async () => {
    const msg = turnOn
      ? `Aktifkan modul ${m.name}?\nMenu: ${m.paths.join(', ') || '-'}\nData yang dipakai: ${m.data_used || '-'}`
      : `Nonaktifkan modul ${m.name}?\nMenunya disembunyikan dan pemakaiannya ditolak server. Data lama TIDAK dihapus.${m.open_items ? `\nPerhatian: ${m.open_items}.` : ''}${impact?.optional_for?.length ? `\nFitur tambahan di ${impact.optional_for.join(', ')} ikut tidak tersedia.` : ''}`;
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
        <div className="li"><span className="small">Jenis</span><b className="small">{MODULE_TYPES[m.module_type] || m.module_type || '—'}</b></div>
        <div className="li"><span className="small">Versi</span><b className="small">{m.version}</b></div>
        {m.config_path && <div className="li"><span className="small">Pengaturan</span><Link href={m.config_path} className="small">Buka →</Link></div>}
      </div>
      {m.open_items && !turnOn && <div className="notice">{m.open_items}.</div>}
      {!turnOn && impact && !m.core && <div className="notice" style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <b className="small">Dampak bila dinonaktifkan</b>
        <span className="small">Menu yang disembunyikan: {impact.menus_hidden?.length ? impact.menus_hidden.join(', ') : '—'}</span>
        <span className="small">Data tetap tersimpan: {impact.data_kept}</span>
        {impact.dependents_active?.length > 0 && <span className="small" style={{ color: 'var(--bad)' }}>Nonaktifkan dulu modul yang bergantung: {impact.dependents_active.join(', ')}</span>}
        {impact.optional_for?.length > 0 && <span className="small">Fitur tambahan yang ikut tidak tersedia di: {impact.optional_for.join(', ')}</span>}
      </div>}
      {!m.core && !m.pending && <>
        {!turnOn && <Field label="Alasan (wajib, tercatat)"><input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="mis. belum dipakai" /></Field>}
        {turnOn && !m.plan_ok ? <Link href="/langganan"><button className="primary" style={{ width: '100%' }}>Lihat paket</button></Link>
          : <button className={turnOn ? 'primary' : 'danger'} onClick={apply} disabled={!turnOn && (reason.trim().length < 3 || impact?.dependents_active?.length > 0)}>{owner ? (turnOn ? 'Aktifkan' : 'Nonaktifkan') : (turnOn ? 'Minta diaktifkan' : 'Minta dinonaktifkan')}</button>}
        {!owner && <span className="small muted">Sebagai pengelola, perubahan modul dikirim ke pemilik untuk disetujui.</span>}
      </>}
      {m.pending && <div className="notice">Ada permintaan "{m.pending}" yang menunggu persetujuan pemilik.</div>}
    </Sheet>
  );
}

function ProfileTab({ kos, owner, onSaved }) {
  const [groups, setGroups] = useState(kos.business_groups?.length ? kos.business_groups : [{ retail: 'retail_trading', jasa: 'services', kustom: 'lainnya' }[kos.business_type] || 'property_rental']);
  const [prof, setProf] = useState(kos.profile || {});
  const [le, setLe] = useState(kos.legal_entity_id || '');
  const [ents, setEnts] = useState([]);
  const [newLe, setNewLe] = useState(null);
  useEffect(() => { if (owner) supabase.from('legal_entities').select('*').order('created_at').then(({ data }) => setEnts(data || [])); }, [owner]);
  if (kos.business_groups === undefined) return <div className="notice">Profil bisnis belum tersedia. Coba lagi beberapa menit lagi.</div>;
  const qs = PROFILE_Q.filter((q) => qFor(q, kos.business_type));
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
        <span className="small muted">Boleh lebih dari satu (mis. grosir + distribusi). Menu saat ini mengikuti jenis bisnis {BUSINESS_TYPES[kos.business_type]?.name || kos.business_type}; kelompok lain dipakai untuk rekomendasi modul yang akan datang.</span>
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
  const [offer, setOffer] = useState(null);   // penawaran upgrade saat batas cabang paket penuh (BRANCH.CREATE_REQUESTED)
  const [busy, setBusy] = useState(false);
  const blank = { name: '', kind: 'cabang', address: '', active: true };
  // Kembali dari upgrade (/konfigurasi?tab=cabang&baru=1): formulir cabang baru langsung terbuka
  useEffect(() => { try { if (owner && new URLSearchParams(window.location.search).get('baru') === '1') setF(blank); } catch {} }, [owner]); // eslint-disable-line react-hooks/exhaustive-deps
  const save = async () => {
    setBusy(true);
    const { error } = await supabase.rpc('branch_save', { p_kos: kosId, p_id: f.id || null, p_name: f.name, p_kind: f.kind, p_address: f.address, p_active: f.active });
    setBusy(false);
    if (!error) { toast('Disimpan'); setF(null); onSaved(); return; }
    if (/BATAS_PAKET: .*cabang/.test(error.message || '')) {
      // Server yang memutuskan penawaran (batas & frekuensi); tanpa penawaran cukup pesan batas
      const { data: o } = await supabase.rpc('growth_offer', { p_kos: kosId, p_context: 'cabang' });
      if (o) {
        supabase.rpc('growth_track', { p_kos: kosId, p_rule: o.id, p_action: 'shown', p_event: 'BRANCH.CREATE_REQUESTED' }).then(() => {}, () => {});
        setF(null); setOffer(o); return;
      }
    }
    toast(errMsg(error));
  };
  return (
    <>
      <section className="panel">
        <div className="row between"><h3>Cabang & gudang</h3>{owner && <button className="sm primary" onClick={() => setF(blank)}>+ Tambah</button>}</div>
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
          <button className="primary" onClick={save} disabled={busy || f.name.trim().length < 2}>{busy ? 'Menyimpan…' : 'Simpan'}</button>
          {!f.id && f.kind === 'cabang' && <span className="small muted">Jumlah cabang mengikuti paket (lokasi utama ikut dihitung, gudang tidak).</span>}
        </Sheet>
      )}
      {offer && <GrowthSheet offer={offer} kosId={kosId} onDone={() => setOffer(null)} />}
    </>
  );
}

// Custom Field Builder untuk menu bawaan
function IsianTab({ kos, owner, onSaved }) {
  const [list, setList] = useState(null);
  const [edit, setEdit] = useState(null);
  const load = () => supabase.from('cf_fields').select('*').eq('kos_id', kos.id).order('sort').then(({ data }) => setList(data || []));
  useEffect(() => { load(); }, [kos.id]);
  if (!list) return <Loading />;
  return (
    <>
      <p className="small muted" style={{ margin: 0 }}>Tambahkan isian sendiri ke menu bawaan, mis. "Asal kampus" di Penghuni atau "Merek" di Barang. Isian tampil di detail datanya dan ikut terunduh di ekspor. Maksimal 20 isian per menu.</p>
      {ENTITY_FOR[kos.business_type].map((e) => (
        <section className="panel" key={e}>
          <div className="row between"><h3>{ENTITY[e]}</h3>{owner && <button className="sm primary" onClick={() => setEdit({ entity: e })}>+ Isian</button>}</div>
          {list.filter((f) => f.entity === e).length === 0 ? <span className="small muted">Belum ada isian tambahan.</span> : (
            <div className="list">{list.filter((f) => f.entity === e).map((f) => (
              <button key={f.id} className="li click" disabled={!owner} onClick={() => setEdit(f)} style={{ background: 'none', border: 0, borderTop: '1px solid var(--line)', borderRadius: 0, width: '100%', textAlign: 'left', font: 'inherit', color: 'inherit', opacity: f.active ? 1 : 0.55 }}>
                <div className="main"><b className="small">{f.label}{f.required ? ' *' : ''}{!f.active && ' (nonaktif)'}</b><span className="small muted">{CF_TYPES[f.type]}{f.choices?.length ? ` · ${f.choices.join(', ')}` : ''}</span></div>
              </button>))}</div>)}
        </section>
      ))}
      {edit && <CfForm kos={kos} f={edit} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); load(); onSaved(); }} />}
    </>
  );
}

function CfForm({ kos, f, onClose, onSaved }) {
  const [p, setP] = useState({ label: f.label || '', type: f.type || 'text', help: f.help || '', required: Boolean(f.required), choices: (f.choices || []).join('\n'), min_value: f.min_value ?? '', max_value: f.max_value ?? '', active: f.active !== false });
  const [busy, setBusy] = useState(false);
  const set = (k, v) => setP({ ...p, [k]: v });
  const save = async () => {
    if (!p.label.trim()) return toast('Isi nama isian.');
    setBusy(true);
    const { error } = await supabase.rpc('cf_field_save', { p_kos: kos.id, p_id: f.id || null, p: { ...p, entity: f.entity, choices: p.choices.split('\n').map((x) => x.trim()).filter(Boolean), min_value: p.min_value === '' ? null : p.min_value, max_value: p.max_value === '' ? null : p.max_value } });
    setBusy(false);
    if (error) return toast(errMsg(error));
    toast('Isian disimpan'); onSaved();
  };
  return (
    <Sheet title={f.id ? `Isian: ${f.label}` : `Isian baru · ${ENTITY[f.entity]}`} onClose={onClose}>
      <Field label="Nama isian"><input value={p.label} maxLength={60} onChange={(e) => set('label', e.target.value)} placeholder="mis. Asal kampus" /></Field>
      <Field label="Tipe" hint={f.id ? 'Tipe tidak bisa diubah bila sudah berisi data' : undefined}><select value={p.type} onChange={(e) => set('type', e.target.value)}>{Object.entries(CF_TYPES).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></Field>
      {['select', 'multiselect'].includes(p.type) && <Field label="Pilihan (satu per baris)"><textarea rows={4} value={p.choices} onChange={(e) => set('choices', e.target.value)} /></Field>}
      {['number', 'currency'].includes(p.type) && <div className="row">
        <Field label="Minimal (opsional)"><input inputMode="decimal" value={p.min_value} onChange={(e) => set('min_value', e.target.value)} /></Field>
        <Field label="Maksimal (opsional)"><input inputMode="decimal" value={p.max_value} onChange={(e) => set('max_value', e.target.value)} /></Field>
      </div>}
      <Field label="Keterangan untuk pengisi (opsional)"><input value={p.help} maxLength={200} onChange={(e) => set('help', e.target.value)} /></Field>
      <label className="row small" style={{ flexWrap: 'nowrap' }}><input type="checkbox" style={{ width: 22, minHeight: 22, flex: 'none' }} checked={p.required} onChange={(e) => set('required', e.target.checked)} />Wajib diisi (diperiksa saat isian tambahan disimpan)</label>
      {f.id && <label className="row small"><input type="checkbox" style={{ width: 22, minHeight: 22 }} checked={p.active} onChange={(e) => set('active', e.target.checked)} />Aktif (nonaktif = disembunyikan, isi lama tetap tersimpan)</label>}
      <button className="cta" disabled={busy} onClick={save}>{busy ? 'Menyimpan…' : 'Simpan'}</button>
    </Sheet>
  );
}

// Status aktivasi milik bisnis ini (terpisah dari status pengembangan platform). 'disarankan' dari jawaban profil usaha.
const ACTIVATION = { aktif: ['Aktif', 'good'], menunggu: ['Menunggu', 'gold'], tersedia: ['Tersedia', ''], disarankan: ['Disarankan', 'gold'], terkunci_paket: ['Perlu paket lebih tinggi', ''], ditangguhkan: ['Ditangguhkan', 'bad'], dalam_rencana: ['Dalam rencana', 'void'] };

function ModulTab({ cat, kos, onOpen }) {
  const [q, setQ] = useState('');
  const [jenis, setJenis] = useState('');
  const saran = recommend(kos.business_type, kos.profile || {});
  const rows = cat.map((m) => ({ ...m, act: m.activation === 'tersedia' && saran[m.code] ? 'disarankan' : (m.activation || (m.active ? 'aktif' : m.status === 'segera' ? 'dalam_rencana' : 'tersedia')), alasan: saran[m.code] }))
    .filter((m) => (!jenis || m.module_type === jenis) && (!q || (m.name + ' ' + m.description).toLowerCase().includes(q.toLowerCase())));
  const groups = [['aktif', 'Modul aktif', (m) => m.act === 'aktif' || m.act === 'menunggu' || m.act === 'ditangguhkan'],
    ['tersedia', 'Bisa diaktifkan', (m) => ['tersedia', 'disarankan', 'terkunci_paket'].includes(m.act)],
    ['rencana', 'Dalam rencana (belum bisa dipakai)', (m) => m.act === 'dalam_rencana']];
  const types = [...new Set(cat.map((m) => m.module_type).filter(Boolean))];
  return <>
    <div className="row" style={{ gap: 6 }}>
      <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cari modul" aria-label="Cari modul" style={{ flex: 1, minWidth: 140 }} />
      {types.length > 1 && <select value={jenis} onChange={(e) => setJenis(e.target.value)} aria-label="Jenis modul" style={{ flex: 1, minWidth: 140 }}>
        <option value="">Semua jenis</option>{types.map((t) => <option key={t} value={t}>{MODULE_TYPES[t] || t}</option>)}</select>}
    </div>
    {groups.map(([g, title, fn]) => {
      const list = rows.filter(fn).sort((a, b) => (b.act === 'disarankan') - (a.act === 'disarankan'));
      if (!list.length) return null;
      return (
        <section className="panel" key={g}>
          <h3>{title} ({list.length})</h3>
          <div className="list">{list.map((m) => (
            <button key={m.code} className="li click" onClick={() => m.act !== 'dalam_rencana' && onOpen(m)} style={{ background: 'none', border: 0, borderTop: '1px solid var(--line)', borderRadius: 0, width: '100%', textAlign: 'left', font: 'inherit', color: 'inherit', alignItems: 'flex-start' }}>
              <div className="main"><b>{m.name}</b><span className="small muted">{m.description}</span>
                <span className="small muted">{MODULE_TYPES[m.module_type] || m.module_type}{m.depends_names?.length ? ` · butuh ${m.depends_names.join(', ')}` : ''}</span>
                {m.act === 'disarankan' && <span className="small" style={{ color: 'var(--gold)' }}>Disarankan karena: {m.alasan.join('; ')}</span>}</div>
              {m.core && m.act === 'aktif' ? <span className="chip">Inti</span> : <span className={'chip ' + (ACTIVATION[m.act]?.[1] || '')}>{ACTIVATION[m.act]?.[0] || m.act}</span>}
            </button>
          ))}</div>
        </section>
      );
    })}
    {rows.length === 0 && <Empty title="Tidak ada modul yang cocok" />}
  </>;
}
