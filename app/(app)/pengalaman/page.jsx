'use client';
// BUSINESS EXPERIENCE CENTER (Adaptive Business Experience §15): pusat kendali pengalaman PRASARA per bisnis.
// Sistem memahami bisnis (Business DNA, data nyata) dan memberi rekomendasi beralasan; PEMILIK yang memutuskan.
// Semua perubahan lewat RPC (izin, paket, dependensi dicek server), tercatat berversi, dan bisa dipulihkan.
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { useKos } from '@/components/KosProvider';
import PageHelp from '@/components/PageHelp';
import { PageHeader } from '@/components/Page';
import { Sheet, Loading, toast, run } from '@/components/ui';
import NavIcon from '@/components/NavIcon';
import DnaForm from '@/components/DnaForm';
import ProcessMap from '@/components/ProcessMap';
import { errMsg, tgl } from '@/lib/format';
import { loadVocab, STAGES, STAGE_ORDER, RELEVANCE, RECO_STATUS, EVENTS, HISTORY_ACTION, PART_NAME } from '@/lib/dna';
import { sectionsFor, groupIcon, mainTabOf, fourthTab } from '@/lib/menu';
import { quickCatalog, quickFor } from '@/lib/quick';
import { DASHBOARDS, dashOf, KPIS, defaultKpis, PERIODS } from '@/lib/dashboards';
import { tabsFor, homeOf, canArea } from '@/lib/business';

const TABS = [['profil', 'Profil bisnis'], ['fitur', 'Fitur saya'], ['rekomendasi', 'Rekomendasi'], ['navigasi', 'Navigasi'], ['aksi', 'Aksi cepat'], ['dashboard', 'Dashboard'], ['evolusi', 'Perkembangan']];
const SIG = [['employees', 'Karyawan'], ['outlets', 'Outlet/cabang'], ['products', 'Barang aktif'], ['tx30', 'Transaksi 30 hari'], ['customers', 'Pelanggan'], ['suppliers', 'Supplier'], ['age_days', 'Umur (hari)']];
// tanggal + jam dari timestamp (tgl() khusus tanggal YYYY-MM-DD)
const tglw = (ts) => (ts ? new Date(ts).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Jakarta' }) : '—');
const Chip = ({ m }) => (m ? <span className={'chip ' + m[1]}>{m[0]}</span> : null);
const Up = ({ onClick, disabled, label }) => <button type="button" className="sm ghost" onClick={onClick} disabled={disabled} aria-label={label}>↑</button>;
const Down = ({ onClick, disabled, label }) => <button type="button" className="sm ghost" onClick={onClick} disabled={disabled} aria-label={label}>↓</button>;
const move = (arr, i, dir) => { const a = [...arr]; const j = i + dir; if (j < 0 || j >= a.length) return a; [a[i], a[j]] = [a[j], a[i]]; return a; };

export default function Pengalaman() {
  const { kos, kosId, loadKos } = useKos();
  const [tab, setTab] = useState('profil');
  const [ov, setOv] = useState(null);
  const [hist, setHist] = useState(null);
  const [vocab, setVocab] = useState(null);
  const [err, setErr] = useState(null);
  const owner = canArea(kos, 'team');

  useEffect(() => { try { const t = new URLSearchParams(window.location.search).get('tab'); if (TABS.some(([k]) => k === t)) setTab(t); } catch {} }, []);
  const load = async () => {
    setErr(null);
    const [o, h] = await Promise.all([supabase.rpc('experience_overview', { p_kos: kosId }), supabase.rpc('experience_history', { p_kos: kosId, p_limit: 80 })]);
    if (o.error) return setErr(errMsg(o.error));
    setOv(o.data); setHist(h.data || []);
  };
  useEffect(() => { load(); loadVocab().then(setVocab, (e) => setErr(errMsg(e))); }, [kosId]); // eslint-disable-line react-hooks/exhaustive-deps
  const refresh = async () => { await Promise.all([load(), loadKos()]); };

  if (err) return <div className="stack"><PageHeader title="Pusat Pengalaman" help={<PageHelp page="pengalaman" />} /><div className="notice bad">{err}</div></div>;
  if (!ov || !vocab) return <Loading />;
  const open = (ov.recommendations || []).filter((r) => ['recommended', 'deferred', 'accepted'].includes(r.status));
  const active = (ov.modules || []).filter((m) => m.active).length;
  const cat = vocab.categories.find((c) => c.code === ov.category);

  return (
    <div className="stack">
      <PageHeader title="Pusat Pengalaman" help={<PageHelp page="pengalaman" />}
        desc={<>PRASARA menyesuaikan menu, dashboard, dan aksi cepat dengan karakter bisnis Anda. <b>Sistem memberi saran, Anda yang memutuskan.</b></>} />
      <section className="panel bec-sum">
        <div className="bec-sum-h"><span className="modic"><NavIcon name="/pengalaman" /></span>
          <span className="t"><b>{kos.name}</b><small>{cat ? cat.name : ov.category}{ov.profile?.dna?.identity?.custom_label ? ` · ${ov.profile.dna.identity.custom_label}` : ''}</small></span></div>
        <div className="bec-kpi">
          <div><span className="label">Tahap bisnis</span><b>{STAGES[ov.stage]?.[0] || ov.stage}</b></div>
          <div><span className="label">Fitur aktif</span><b>{active}</b></div>
          <div><span className="label">Rekomendasi</span><b>{open.length}</b></div>
          <div><span className="label">Profil</span><b>{ov.profile.stored ? `v${ov.profile.version}` : 'Bawaan'}</b></div>
        </div>
        {!ov.profile.stored && <div className="notice">Profil bisnis masih <b>bawaan dari kategori</b>. Tinjau di tab Profil bisnis agar menu & saran makin tepat.</div>}
      </section>
      <div className="seg bec-tabs" role="tablist" aria-label="Bagian Pusat Pengalaman">
        {TABS.map(([k, l]) => <button key={k} type="button" role="tab" aria-selected={tab === k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>{l}{k === 'rekomendasi' && open.length > 0 ? ` (${open.length})` : ''}</button>)}
      </div>
      {tab === 'profil' && <Profil kosId={kosId} ov={ov} vocab={vocab} onSaved={refresh} />}
      {tab === 'fitur' && <Fitur kosId={kosId} ov={ov} owner={owner} onSaved={refresh} />}
      {tab === 'rekomendasi' && <Rekomendasi kosId={kosId} ov={ov} onSaved={refresh} />}
      {tab === 'navigasi' && <Navigasi kos={kos} kosId={kosId} onSaved={refresh} />}
      {tab === 'aksi' && <Aksi kos={kos} kosId={kosId} onSaved={refresh} />}
      {tab === 'dashboard' && <Dash kos={kos} kosId={kosId} onSaved={refresh} />}
      {tab === 'evolusi' && <Evolusi kosId={kosId} ov={ov} hist={hist} onSaved={refresh} />}
    </div>
  );
}

// ---------- A. Profil bisnis (Business DNA) ----------
function Profil({ kosId, ov, vocab, onSaved }) {
  const [d, setD] = useState(ov.profile.dna);
  const [pm, setPm] = useState(null);
  useEffect(() => { supabase.rpc('process_map', { p_kos: kosId }).then((r) => setPm(r.data || [])); }, [kosId]);
  const [why, setWhy] = useState('');
  const [busy, setBusy] = useState(false);
  const changed = JSON.stringify(d) !== JSON.stringify(ov.profile.dna);
  const save = async () => {
    setBusy(true);
    const { data, error } = await supabase.rpc('dna_save', { p_kos: kosId, p_dna: d, p_reason: why.trim() || null, p_source: 'owner' });
    setBusy(false);
    if (error) return toast(errMsg(error));
    toast(data?.new_recommendations ? `Profil disimpan · ${data.new_recommendations} rekomendasi baru` : 'Profil disimpan');
    setWhy(''); onSaved();
  };
  return (
    <div className="stack">
      <section className="panel stack">
        <div className="row between"><h3>Alur bisnis yang dikenali</h3><Link className="small" href="/alur">Buka Alur kerja ›</Link></div>
        {pm ? <ProcessMap data={pm} compact /> : <Loading rows={1} />}
        <span className="small muted">Hijau = sudah berjalan, garis putus = belum diatur/fitur nonaktif (data 90 hari terakhir). Tahap, status, aturan untuk karyawan, dan saran alur diatur di menu Alur kerja.</span>
      </section>
      <section className="panel">
        <div className="row between"><h3>Business DNA</h3><span className="small muted">{ov.profile.stored ? `Versi ${ov.profile.version} · ${tglw(ov.profile.updated_at)}` : 'Belum disimpan — bawaan kategori'}</span></div>
        <DnaForm value={d} onChange={setD} vocab={vocab} primary={ov.category} />
        <label className="f">Alasan perubahan (opsional)<input value={why} maxLength={200} onChange={(e) => setWhy(e.target.value)} placeholder="mis. mulai menjual grosir" /></label>
        <div className="row bec-actions">
          <button className="primary" disabled={busy || (!changed && ov.profile.stored)} onClick={save}>{busy ? 'Menyimpan…' : ov.profile.stored ? 'Simpan perubahan' : 'Simpan profil'}</button>
          {changed && <button className="ghost" onClick={() => setD(ov.profile.dna)}>Batalkan</button>}
          <button className="ghost" onClick={() => setD(ov.profile.defaults)}>Isi dari bawaan kategori</button>
        </div>
        <span className="small muted">Menyimpan profil TIDAK langsung mengaktifkan atau mematikan fitur. PRASARA hanya menyusun ulang rekomendasi; Anda yang memutuskan.</span>
      </section>
    </div>
  );
}

// ---------- B. Fitur saya ----------
const GROUPS = [['recommended', 'Direkomendasikan'], ['active', 'Fitur aktif pilihan'], ['available', 'Tersedia untuk diaktifkan'], ['disabled', 'Tidak aktif'], ['restricted', 'Terkunci paket'], ['planned', 'Dalam rencana'], ['core', 'Fitur inti (selalu aktif)']];
const groupOf = (m) => (m.core && m.status === 'active' ? 'core' : m.status);
function Fitur({ kosId, ov, owner, onSaved }) {
  const [off, setOff] = useState(null);
  const [show, setShow] = useState({ active: true, recommended: true });
  const mods = ov.modules || [];
  const on = async (m) => {
    const { data, error } = await supabase.rpc('module_set', { p_kos: kosId, p_code: m.code, p_on: true, p_reason: 'Diaktifkan dari Pusat Pengalaman' });
    if (error) return toast(errMsg(error));
    toast(data === 'menunggu' ? 'Permintaan dikirim ke pemilik' : `${m.name} aktif`); onSaved();
  };
  return (
    <div className="stack">
      <span className="small muted">Skor relevansi 0–100 = 20% kategori + 25% karakter operasional + 20% model bisnis + 10% skala + 10% keputusan Anda + 15% alur kerja. Skor hanya saran — izin, paket, dan modul prasyarat tetap diperiksa.</span>
      {GROUPS.map(([k, title]) => {
        const list = mods.filter((m) => groupOf(m) === k).sort((a, b) => Number(b.core) - Number(a.core) || b.score - a.score);
        if (!list.length) return null;
        const isOpen = show[k];
        return (
          <section key={k} className="panel">
            <button type="button" className="row between bec-gh" aria-expanded={!!isOpen} onClick={() => setShow({ ...show, [k]: !isOpen })}><h3>{title} ({list.length})</h3><span aria-hidden="true">{isOpen ? '−' : '+'}</span></button>
            {isOpen && <ul className="bec-list">{list.map((m) => (
              <li key={m.code}>
                <div className="bec-li-h"><b>{m.name}</b><span className="row" style={{ gap: 6 }}><Chip m={RELEVANCE[m.relevance]} />{!m.core && m.status !== 'planned' && <span className="chip void" title="Skor relevansi">{m.score}</span>}</span></div>
                <span className="small muted">{m.benefit || m.description}</span>
                {m.reasons?.length > 0 && <span className="small">Alasan: {m.reasons.join('; ')}</span>}
                <div className="row bec-actions" style={{ gap: 6 }}>
                  {['available', 'disabled', 'recommended'].includes(m.status) && <button className="sm primary" onClick={() => on(m)}>{owner ? 'Aktifkan' : 'Minta aktifkan'}</button>}
                  {m.status === 'active' && !m.core && <button className="sm ghost" onClick={() => setOff(m)}>{owner ? 'Nonaktifkan' : 'Minta nonaktifkan'}</button>}
                  {m.status === 'restricted' && <Link href="/langganan" className="sm">Lihat paket</Link>}
                  {m.status === 'active' && m.config_path && <Link href={m.config_path} className="sm">Buka</Link>}
                </div>
              </li>
            ))}</ul>}
          </section>
        );
      })}
      {off && <Deactivate kosId={kosId} m={off} onClose={() => setOff(null)} onSaved={() => { setOff(null); onSaved(); }} />}
    </div>
  );
}
function Deactivate({ kosId, m, onClose, onSaved }) {
  const [imp, setImp] = useState(null);
  const [why, setWhy] = useState('');
  useEffect(() => { supabase.rpc('module_impact', { p_kos: kosId, p_code: m.code }).then(({ data }) => setImp(data || {})); }, [kosId, m.code]);
  const save = async () => {
    const { data, error } = await supabase.rpc('module_set', { p_kos: kosId, p_code: m.code, p_on: false, p_reason: why });
    if (error) return toast(errMsg(error));
    toast(data === 'menunggu' ? 'Permintaan dikirim ke pemilik' : `${m.name} dinonaktifkan`); onSaved();
  };
  return (
    <Sheet title={`Nonaktifkan ${m.name}?`} onClose={onClose}>
      {!imp ? <Loading rows={2} /> : <>
        <div className="notice">Data <b>tidak dihapus</b>: {imp.data_kept || 'data modul'} tetap tersimpan dan muncul lagi bila modul diaktifkan kembali. Riwayat keuangan tidak berubah.</div>
        {imp.menus_hidden?.length > 0 && <span className="small">Menu yang hilang: {imp.menus_hidden.join(', ')}</span>}
        {imp.dependents_active?.length > 0 && <div className="notice bad">Nonaktifkan dulu modul yang bergantung padanya: {imp.dependents_active.join(', ')}</div>}
        {imp.open_items && <div className="notice bad">Masih ada pekerjaan terbuka: {imp.open_items}</div>}
        <label className="f">Alasan<input value={why} maxLength={200} onChange={(e) => setWhy(e.target.value)} placeholder="mis. belum dipakai" /></label>
        <button className="primary" disabled={why.trim().length < 3 || imp.can_disable === false} onClick={save}>Nonaktifkan</button>
      </>}
    </Sheet>
  );
}

// ---------- F. Rekomendasi ----------
function Rekomendasi({ kosId, ov, onSaved }) {
  const recs = ov.recommendations || [];
  const open = recs.filter((r) => ['recommended', 'deferred', 'accepted'].includes(r.status));
  const done = recs.filter((r) => !open.includes(r));
  const act = async (r, action) => {
    const { data, error } = await supabase.rpc('reco_decide', { p_kos: kosId, p_id: r.id, p_action: action, p_note: null, p_days: 7 });
    if (error) return toast(errMsg(error));
    toast(action === 'terima' ? (data?.status === 'activated' ? `${r.name} aktif` : data?.message || 'Diterima') : action === 'tunda' ? 'Ditunda 7 hari' : action === 'tolak' ? 'Ditolak — tidak akan disarankan lagi selama alasannya sama' : 'Diabaikan');
    onSaved();
  };
  return (
    <div className="stack">
      {!open.length && <div className="empty"><h3>Tidak ada rekomendasi yang menunggu</h3><p className="muted small">PRASARA mengevaluasi ulang setiap hari dan saat profil, cabang, karyawan, atau paket berubah.</p></div>}
      {open.map((r) => (
        <section key={r.id} className="panel bec-reco">
          <div className="bec-li-h"><b>{r.name}</b><Chip m={RECO_STATUS[r.status]} /></div>
          <span className="small"><b>Alasan:</b> {r.reason}</span>
          {r.benefit && <span className="small"><b>Manfaat:</b> {r.benefit}</span>}
          <span className="small muted">{r.event ? `${EVENTS[r.event] || r.event} · ` : ''}{tglw(r.created_at)}{r.score != null ? ` · relevansi ${r.score}` : ''}{r.status === 'deferred' && r.defer_until ? ` · ditunda s.d. ${tgl(r.defer_until)}` : ''}</span>
          {!r.plan_ok && <div className="notice">Butuh paket yang lebih tinggi. Menerima rekomendasi TIDAK mengaktifkan fitur berbayar — <Link href="/langganan">lihat paket</Link>.</div>}
          {r.depends?.length > 0 && <span className="small">Perlu modul: {r.depends.join(', ')}</span>}
          {r.status === 'accepted' && r.note && <span className="small muted">Catatan: {r.note}</span>}
          <div className="row bec-actions" style={{ gap: 6 }}>
            <button className="sm primary" onClick={() => act(r, 'terima')}>{r.status === 'accepted' ? 'Coba aktifkan lagi' : 'Terima & aktifkan'}</button>
            <button className="sm" onClick={() => act(r, 'tunda')}>Tunda 7 hari</button>
            <button className="sm ghost" onClick={() => act(r, 'tolak')}>Tolak</button>
          </div>
        </section>
      ))}
      {done.length > 0 && <section className="panel"><h3>Riwayat rekomendasi (90 hari)</h3>
        <ul className="bec-list">{done.map((r) => <li key={r.id}><div className="bec-li-h"><span>{r.name}</span><Chip m={RECO_STATUS[r.status]} /></div><span className="small muted">{r.reason}{r.decided_by ? ` · ${r.decided_by}` : ''}{r.decided_at ? ` · ${tglw(r.decided_at)}` : ''}</span></li>)}</ul>
      </section>}
    </div>
  );
}

// ---------- D. Navigasi ----------
function Navigasi({ kos, kosId, onSaved }) {
  const cfg = kos.exp?.nav || {};
  const [d, setD] = useState({ main: cfg.main || '', hidden: cfg.hidden || [], pins: cfg.pins || [], order: cfg.order || [] });
  const home = homeOf(kos);
  const tabs = tabsFor(kos).filter(([h]) => h !== home);
  const base = { ...kos, exp: { ...(kos.exp || {}), nav: { ...d, hidden: [], order: [] } } };
  const groups = sectionsFor(base).flatMap(([, , gs]) => gs);
  const gOrder = [...groups].sort((a, b) => { const i = d.order.indexOf(a[0]), j = d.order.indexOf(b[0]); return (i < 0 ? 999 : i) - (j < 0 ? 999 : j); });
  const preview = { ...kos, exp: { ...(kos.exp || {}), nav: d } };
  const toggle = (k, h, max) => setD((x) => { const a = x[k].includes(h) ? x[k].filter((y) => y !== h) : [...x[k], h]; if (max && a.length > max) { toast(`Maksimal ${max}`); return x; } return { ...x, [k]: a }; });
  const save = async () => { if (await run(() => supabase.rpc('experience_save', { p_kos: kosId, p_part: 'nav', p_value: { ...d, main: d.main || null }, p_reason: 'Atur navigasi' }), 'Navigasi disimpan', errMsg)) onSaved(); };
  const reset = async () => { if (confirm('Kembalikan navigasi ke rekomendasi PRASARA?') && await run(() => supabase.rpc('experience_reset', { p_kos: kosId, p_part: 'nav' }), 'Navigasi kembali ke rekomendasi', errMsg)) { setD({ main: '', hidden: [], pins: [], order: [] }); onSaved(); } };
  const m = mainTabOf(preview);
  return (
    <div className="stack">
      <section className="panel">
        <h3>Menu bawah (HP)</h3>
        <div className="bec-bnav" aria-label="Pratinjau menu bawah">{['Beranda', m[1], '+', fourthTab(preview)?.[1] || 'Menu', 'Akun'].map((x, i) => <span key={i} className={x === '+' ? 'fab' : ''}>{x}</span>)}</div>
        <label className="f">Menu utama (posisi ke-2)<select value={d.main} onChange={(e) => setD({ ...d, main: e.target.value })}><option value="">Otomatis — rekomendasi PRASARA</option>{tabs.map(([h, l]) => <option key={h} value={h}>{l}</option>)}</select></label>
        <span className="small muted">Tombol (+) selalu di tengah dan tidak bisa dihilangkan. Isinya diatur di tab Aksi cepat.</span>
      </section>
      <section className="panel">
        <h3>Urutan kelompok menu</h3>
        <ul className="bec-list">{gOrder.map((g, i) => (
          <li key={g[0]} className="bec-row"><NavIcon name={groupIcon(g[0])} size={20} /><span className="t">{g[1]}</span>
            <Up label={`Naikkan ${g[1]}`} disabled={i === 0} onClick={() => setD({ ...d, order: move(gOrder.map((x) => x[0]), i, -1) })} />
            <Down label={`Turunkan ${g[1]}`} disabled={i === gOrder.length - 1} onClick={() => setD({ ...d, order: move(gOrder.map((x) => x[0]), i, 1) })} /></li>
        ))}</ul>
      </section>
      <section className="panel">
        <h3>Tampil, sembunyikan & pintasan</h3>
        <span className="small muted">Menu yang disembunyikan hilang dari menu samping, tetapi <b>tetap bisa dibuka</b> lewat Semua modul & pencarian — data dan izin tidak berubah. Pintasan (maks. 8) tampil paling atas di menu samping.</span>
        <ul className="bec-list">{tabs.map(([h, l]) => (
          <li key={h} className="bec-row"><NavIcon name={h} size={20} /><span className="t">{l}</span>
            <label className="bec-ck"><input type="checkbox" checked={!d.hidden.includes(h)} onChange={() => toggle('hidden', h)} />Tampil</label>
            <label className="bec-ck"><input type="checkbox" checked={d.pins.includes(h)} onChange={() => toggle('pins', h, 8)} />Pintasan</label></li>
        ))}</ul>
      </section>
      <div className="row bec-actions"><button className="primary" onClick={save}>Simpan navigasi</button><button className="ghost" onClick={reset}>Kembalikan rekomendasi PRASARA</button></div>
    </div>
  );
}

// ---------- E. Aksi cepat (tombol +) ----------
function Aksi({ kos, kosId, onSaved }) {
  const cfg = kos.exp?.quick || {};
  const cat = useMemo(() => quickCatalog(kos), [kos]);
  const defVisible = cat.filter((a) => a.relevant && !a.optional && !(cfg.hidden || []).includes(a.id)).map((a) => a.id);
  const [d, setD] = useState(() => ({ order: (cfg.order || []).length ? cfg.order.filter((id) => cat.some((a) => a.id === id)) : quickFor(kos).map((a) => a.id).filter((id) => defVisible.includes(id) || (cfg.fav || []).includes(id)), hidden: cfg.hidden || [], fav: cfg.fav || [] }));
  const visible = d.order;
  const rest = cat.filter((a) => !visible.includes(a.id));
  const nm = (id) => cat.find((a) => a.id === id);
  const show = (id) => setD((x) => ({ ...x, order: [...x.order, id], hidden: x.hidden.filter((y) => y !== id) }));
  const hide = (id) => setD((x) => ({ ...x, order: x.order.filter((y) => y !== id), hidden: [...new Set([...x.hidden, id])], fav: x.fav.filter((y) => y !== id) }));
  const star = (id) => setD((x) => (x.fav.includes(id) ? { ...x, fav: x.fav.filter((y) => y !== id) } : x.fav.length >= 6 ? (toast('Maksimal 6 favorit'), x) : { ...x, fav: [...x.fav, id] }));
  const save = async () => { if (await run(() => supabase.rpc('experience_save', { p_kos: kosId, p_part: 'quick', p_value: d, p_reason: 'Atur aksi cepat' }), 'Aksi cepat disimpan', errMsg)) onSaved(); };
  const reset = async () => { if (confirm('Kembalikan aksi cepat ke rekomendasi PRASARA?') && await run(() => supabase.rpc('experience_reset', { p_kos: kosId, p_part: 'quick' }), 'Aksi cepat kembali ke rekomendasi', errMsg)) onSaved(); };
  return (
    <div className="stack">
      <span className="small muted">Isi tombol (+) di tengah menu bawah (dan "Aksi cepat" di desktop). ★ Favorit selalu paling atas (maks. 6). Di halaman tertentu, aksi yang sesuai halaman itu ikut diprioritaskan. Aksi hanya tampil bila modulnya aktif dan peran pengguna boleh memakainya.</span>
      <section className="panel">
        <h3>Ditampilkan ({visible.length})</h3>
        {!visible.length && <span className="small muted">Belum ada — tombol (+) akan menampilkan penjelasan, bukan daftar kosong.</span>}
        <ul className="bec-list">{visible.map((id, i) => { const a = nm(id); if (!a) return null; return (
          <li key={id} className="bec-row"><NavIcon name={a.base} size={20} /><span className="t">{a.label}{!a.relevant && <small className="muted"> · kurang sesuai profil</small>}</span>
            <button type="button" className={'sm ghost bec-star' + (d.fav.includes(id) ? ' on' : '')} aria-pressed={d.fav.includes(id)} aria-label={`Favorit ${a.label}`} onClick={() => star(id)}>★</button>
            <Up label={`Naikkan ${a.label}`} disabled={i === 0} onClick={() => setD({ ...d, order: move(d.order, i, -1) })} />
            <Down label={`Turunkan ${a.label}`} disabled={i === visible.length - 1} onClick={() => setD({ ...d, order: move(d.order, i, 1) })} />
            <button type="button" className="sm ghost" onClick={() => hide(id)}>Sembunyikan</button></li>
        ); })}</ul>
      </section>
      {rest.length > 0 && <section className="panel"><h3>Tidak ditampilkan</h3>
        <ul className="bec-list">{rest.map((a) => <li key={a.id} className="bec-row"><NavIcon name={a.base} size={20} /><span className="t">{a.label}<small className="muted"> · {d.hidden.includes(a.id) ? 'disembunyikan' : a.optional ? 'opsional' : 'kurang sesuai profil'}</small></span><button type="button" className="sm" onClick={() => show(a.id)}>Tampilkan</button></li>)}</ul>
      </section>}
      <div className="row bec-actions"><button className="primary" onClick={save}>Simpan aksi cepat</button><button className="ghost" onClick={reset}>Kembalikan rekomendasi PRASARA</button></div>
    </div>
  );
}

// ---------- C. Dashboard ----------
function Dash({ kos, kosId, onSaved }) {
  const id = dashOf(kos);
  const def = DASHBOARDS[id];
  const cfg = kos.exp?.dash?.[id] || { hidden: [], order: [] };
  const ids = def.widgets.map(([w]) => w);
  const [order, setOrder] = useState(() => [...ids].sort((a, b) => { const i = cfg.order.indexOf(a), j = cfg.order.indexOf(b); return (i < 0 ? 1000 + ids.indexOf(a) : i) - (j < 0 ? 1000 + ids.indexOf(b) : j); }));
  const [hidden, setHidden] = useState(cfg.hidden || []);
  const cat = KPIS[id] || [];
  const [kpis, setKpis] = useState(cfg.kpis?.length ? cfg.kpis : defaultKpis(kos, id));
  const [period, setPeriod] = useState(cfg.period || '');
  const kList = [...kpis.map((x) => cat.find(([c]) => c === x)).filter(Boolean), ...cat.filter(([c]) => !kpis.includes(c))];
  const save = async () => {
    const def = defaultKpis(kos, id);
    const all = { ...(kos.exp?.dash || {}), [id]: { hidden, order, ...(cat.length && JSON.stringify(kpis) !== JSON.stringify(def) ? { kpis } : {}), ...(period ? { period } : {}) } };
    if (await run(() => supabase.rpc('experience_save', { p_kos: kosId, p_part: 'dash', p_value: all, p_reason: 'Atur dashboard' }), 'Dashboard disimpan', errMsg)) onSaved();
  };
  const reset = async () => { if (confirm('Kembalikan dashboard ke rekomendasi PRASARA?') && await run(() => supabase.rpc('experience_reset', { p_kos: kosId, p_part: 'dash' }), 'Dashboard kembali ke rekomendasi', errMsg)) { setOrder(ids); setHidden([]); setKpis(defaultKpis(kos, id)); setPeriod(''); onSaved(); } };
  const title = (w) => def.widgets.find(([x]) => x === w)?.[1] || w;
  return (
    <div className="stack">
      <span className="small muted">{def.name}.{id === 'kerja' ? ' Angka utama bisnis ini diatur dari Beranda › Atur dashboard.' : ''} Bagian yang tidak relevan, belum ada datanya, atau tidak diizinkan untuk seseorang tetap tidak tampil walau dicentang. Menyembunyikan bagian tidak menghapus data.</span>
      <section className="panel"><ul className="bec-list">{order.map((w, i) => (
        <li key={w} className="bec-row"><label className="bec-ck grow"><input type="checkbox" checked={!hidden.includes(w)} onChange={() => setHidden(hidden.includes(w) ? hidden.filter((x) => x !== w) : [...hidden, w])} />{title(w)}</label>
          <Up label={`Naikkan ${title(w)}`} disabled={i === 0} onClick={() => setOrder(move(order, i, -1))} />
          <Down label={`Turunkan ${title(w)}`} disabled={i === order.length - 1} onClick={() => setOrder(move(order, i, 1))} /></li>
      ))}</ul></section>
      {cat.length > 0 && <section className="panel">
        <h3>Angka utama</h3>
        <span className="small muted">Bawaan dipilih PRASARA dari profil bisnis Anda. Angka yang butuh izin keuangan tidak tampil untuk karyawan tanpa izin itu.</span>
        <ul className="bec-list">{kList.map(([k, l, hint]) => { const i = kpis.indexOf(k); return (
          <li key={k} className="bec-row"><label className="bec-ck grow"><input type="checkbox" checked={i >= 0} onChange={() => setKpis(i >= 0 ? kpis.filter((x) => x !== k) : [...kpis, k].slice(0, 16))} />{l}{hint ? <small className="muted"> · {hint}</small> : null}</label>
            <Up label={`Naikkan ${l}`} disabled={i <= 0} onClick={() => setKpis(move(kpis, i, -1))} />
            <Down label={`Turunkan ${l}`} disabled={i < 0 || i === kpis.length - 1} onClick={() => setKpis(move(kpis, i, 1))} /></li>
        ); })}</ul>
        <span className="label">Periode bawaan</span>
        <div className="seg"><button type="button" className={!period ? 'on' : ''} onClick={() => setPeriod('')}>Rekomendasi</button>{PERIODS.map(([k, l]) => <button key={k} type="button" className={period === k ? 'on' : ''} onClick={() => setPeriod(k)}>{l}</button>)}</div>
      </section>}
      <div className="row bec-actions"><button className="primary" onClick={save}>Simpan dashboard</button><button className="ghost" onClick={reset}>Kembalikan rekomendasi PRASARA</button><Link href={homeOf(kos)} className="sm">Lihat Beranda</Link></div>
    </div>
  );
}

// ---------- G. Perkembangan bisnis (lifecycle, sinyal, riwayat & pemulihan) ----------
function Evolusi({ kosId, ov, hist, onSaved }) {
  const [busy, setBusy] = useState(null);
  const restore = async (h) => {
    if (!confirm('Pulihkan ke keadaan SEBELUM perubahan ini? Perubahan dicatat sebagai versi baru.')) return;
    setBusy(h.id);
    const ok = await run(() => supabase.rpc('experience_restore', { p_kos: kosId, p_history: h.id }), 'Dipulihkan', errMsg);
    setBusy(null); if (ok) onSaved();
  };
  const cur = STAGE_ORDER.indexOf(ov.stage);
  const sig = ov.signals || {};
  return (
    <div className="stack">
      <section className="panel">
        <h3>Tahap bisnis: {STAGES[ov.stage]?.[0]}</h3>
        <ol className="bec-stage">{STAGE_ORDER.map((s, i) => <li key={s} className={i < cur ? 'done' : i === cur ? 'on' : ''} title={STAGES[s][1]}>{STAGES[s][0]}</li>)}</ol>
        <span className="small muted">{STAGES[ov.stage]?.[1]} Tahap dihitung dari data nyata (bukan label permanen) dan hanya memicu rekomendasi — tidak mengubah apa pun otomatis.</span>
        <div className="bec-sig">{SIG.map(([k, l]) => <div key={k}><span className="label">{l}</span><b>{sig[k] ?? '—'}</b></div>)}</div>
      </section>
      <section className="panel">
        <h3>Riwayat konfigurasi</h3>
        {!hist?.length && <span className="small muted">Belum ada perubahan.</span>}
        <ul className="bec-list">{(hist || []).map((h) => (
          <li key={h.id}>
            <div className="bec-li-h"><span><b>{HISTORY_ACTION[h.action] || h.action}</b>{['ubah_tampilan', 'reset_tampilan', 'pulihkan_tampilan'].includes(h.action) && PART_NAME[h.target] ? ` · ${PART_NAME[h.target]}` : h.action === 'tahap_bisnis' ? ` · ${STAGES[h.target]?.[0] || h.target}` : h.target && !['ubah_dna'].includes(h.action) ? ` · ${h.target}` : ''}</span>
              {h.restorable && <button className="sm ghost" disabled={busy === h.id} onClick={() => restore(h)}>Pulihkan</button>}</div>
            <span className="small muted">{new Date(h.at).toLocaleString('id-ID', { timeZone: 'Asia/Jakarta', dateStyle: 'medium', timeStyle: 'short' })}{h.actor ? ` · ${h.actor}` : ' · sistem'}{h.reason ? ` · ${h.reason}` : ''}</span>
          </li>
        ))}</ul>
      </section>
    </div>
  );
}
