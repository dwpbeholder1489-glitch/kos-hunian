'use client';
// Pusat Konfirmasi (Business Setup Confirmation): pemilik meninjau draf yang disiapkan PRASARA, melengkapi informasi,
// lalu menyetujui / mengubah / menolak / menunda tiap bagian dan mengaktifkan bisnis. Semua aturan di server (setup_*).
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { useKos } from '@/components/KosProvider';
import PageHelp from '@/components/PageHelp';
import { Field, Loading, Sheet, toast } from '@/components/ui';
import { rp, angka, errMsg } from '@/lib/format';
import { waktu } from '@/lib/jasa';
import { isiNum } from '@/lib/units';
import { SETUP_STATUS, homeOf } from '@/lib/business';

const ST = SETUP_STATUS;
const ITEM_ST = { ...ST, draft: ['Disiapkan sistem', 'void'], active: ['Aktif', 'good'] };
const SECTIONS = [['info', 'Profil & informasi bisnis'], ['layanan', 'Layanan'], ['alur', 'Alur kerja'], ['modul', 'Modul & menu'], ['portal', 'Portal pelanggan']];
const UNITS = ['kg', 'pcs', 'pasang', 'meter', 'm²', 'set', 'paket', 'pesanan', 'jam'];
const num = (v) => (v === '' || v == null ? null : Number(String(v).replace(/\./g, '').replace(',', '.')));

// Ringkasan isi item untuk ditampilkan
function show(it) {
  const v = it.value || {};
  switch (it.input) {
    case 'text': case 'longtext': case 'hours': case 'phone': return v.v || '—';
    case 'multi': return (v.v || []).join(', ') || '—';
    case 'choice': return v.v || '—';
    case 'number': return v.v != null ? `${angka(v.v)} ${it.spec?.unit || ''}` : '—';
    case 'service': return `${v.price != null ? `${rp(v.price)}/${v.unit}` : 'Harga belum diisi'} · ${v.hours != null ? `estimasi ${v.hours} jam` : 'estimasi belum diisi'}${Number(v.min_qty) > 0 ? ` · minimal ${angka(v.min_qty)} ${v.unit}` : ''}${v.description ? ` · ${v.description}` : ''}`;
    case 'rooms': return v.count ? `${v.count} kamar (${v.prefix}01–${v.prefix}${String(v.count).padStart(2, '0')}) · ${v.price ? `${rp(v.price)}/bulan` : 'harga sewa belum diisi'}` : 'Jumlah kamar belum diisi';
    case 'delivery': return v.areas ? `Wilayah: ${v.areas} · Biaya: ${v.fee != null ? rp(v.fee) : 'belum diisi'} · Jadwal: ${v.schedule || 'belum diisi'}` : 'Wilayah, biaya & jadwal belum diisi';
    case 'stages': return (v.stages || []).join(' → ') || '—';
    case 'gudang': return it.value && 'ada' in v ? (v.ada ? `Ada: ${v.name || '(nama belum diisi)'}` : 'Tidak ada gudang terpisah') : '—';
    case 'module': return v.recommended ? 'Disarankan untuk jenis usaha ini' : 'Opsional';
    default: return '';
  }
}

function Editor({ it, onSave, onClose, owner }) {
  const [v, setV] = useState(() => {
    const x = it.value || {};
    if (it.input === 'service') return { ...x, price: x.price ?? '', hours: x.hours ?? '', min_qty: Number(x.min_qty) > 0 ? x.min_qty : '' };
    if (it.input === 'rooms') return { count: x.count ?? '', prefix: x.prefix || 'A', price: x.price ?? '' };
    if (it.input === 'delivery') return { areas: x.areas || '', fee: x.fee ?? '', schedule: x.schedule || '' };
    if (it.input === 'stages') return { stages: [...(x.stages || [])] };
    if (it.input === 'gudang') return { ada: x.ada ?? false, name: x.name || '' };
    if (it.input === 'multi') return { v: [...(x.v || [])] };
    return { v: x.v ?? '' };
  });
  const [busy, setBusy] = useState(false);
  const set = (k, val) => setV({ ...v, [k]: val });
  const out = () => {
    if (it.input === 'service') return { ...v, price: num(v.price), hours: num(v.hours), min_qty: isiNum(v.min_qty) || 0 };
    if (it.input === 'rooms') return { ...v, count: num(v.count), price: num(v.price) };
    if (it.input === 'delivery') return { ...v, fee: num(v.fee) };
    if (it.input === 'number') return { v: num(v.v) };
    return v;
  };
  const go = async (action) => { setBusy(true); await onSave(it, out(), action); setBusy(false); };
  const choices = it.spec?.choices || [];
  return (
    <Sheet title={it.label} onClose={onClose}>
      {it.help && <p className="small muted" style={{ margin: 0 }}>{it.help}</p>}
      {['text', 'hours', 'phone'].includes(it.input) && <Field label={it.label}><input value={v.v} inputMode={it.input === 'phone' ? 'tel' : undefined} placeholder={it.input === 'hours' ? 'mis. 08.00–20.00' : it.input === 'phone' ? 'mis. 0812xxxx' : ''} onChange={(e) => set('v', e.target.value)} /></Field>}
      {it.input === 'longtext' && <Field label={it.label}><textarea rows={4} maxLength={1000} value={v.v} onChange={(e) => set('v', e.target.value)} /></Field>}
      {it.input === 'number' && <Field label={`${it.label}${it.spec?.unit ? ` (${it.spec.unit})` : ''}`}><input inputMode="decimal" value={v.v} onChange={(e) => set('v', e.target.value)} /></Field>}
      {it.input === 'multi' && <div className="row" style={{ flexWrap: 'wrap', gap: 6 }}>{choices.map((c) => { const on = v.v.includes(c); return <button key={c} className={'sm' + (on ? ' primary' : '')} aria-pressed={on} onClick={() => set('v', on ? v.v.filter((x) => x !== c) : [...v.v, c])}>{on ? '✓ ' : ''}{c}</button>; })}</div>}
      {it.input === 'choice' && <div className="seg">{choices.map((c) => <button key={c} className={v.v === c ? 'on' : ''} onClick={() => set('v', c)}>{c}</button>)}</div>}
      {it.input === 'service' && <>
        <Field label="Nama layanan"><input value={v.name || ''} maxLength={80} onChange={(e) => set('name', e.target.value)} /></Field>
        <div className="row" style={{ alignItems: 'flex-start' }}>
          <Field label="Harga (Rp)" hint="Wajib diisi pemilik"><input inputMode="numeric" value={v.price} placeholder="mis. 7000" onChange={(e) => set('price', e.target.value.replace(/[^\d]/g, ''))} /></Field>
          <Field label="Per satuan"><select value={UNITS.includes(v.unit) ? v.unit : '__'} onChange={(e) => set('unit', e.target.value === '__' ? '' : e.target.value)}>{UNITS.map((u) => <option key={u} value={u}>{u}</option>)}<option value="__">lainnya…</option></select></Field>
        </div>
        {!UNITS.includes(v.unit) && <Field label="Satuan lain"><input value={v.unit || ''} maxLength={20} onChange={(e) => set('unit', e.target.value)} placeholder="mis. lembar" /></Field>}
        <div className="row" style={{ alignItems: 'flex-start' }}>
          <Field label="Estimasi pengerjaan (jam)" hint="48 = 2 hari"><input inputMode="numeric" value={v.hours} onChange={(e) => set('hours', e.target.value.replace(/\D/g, ''))} /></Field>
          <Field label="Minimal (opsional)" hint={`mis. 3 ${v.unit || ''}`}><input inputMode="decimal" value={v.min_qty} onChange={(e) => set('min_qty', e.target.value)} /></Field>
        </div>
        <Field label="Kategori layanan (opsional)"><input value={v.category || ''} maxLength={40} onChange={(e) => set('category', e.target.value)} placeholder="mis. Kiloan, Satuan" /></Field>
        <Field label="Deskripsi (opsional)"><input value={v.description || ''} maxLength={300} onChange={(e) => set('description', e.target.value)} /></Field>
        <Field label="Persyaratan / info tambahan (opsional)"><input value={v.requirements || ''} maxLength={300} onChange={(e) => set('requirements', e.target.value)} placeholder="mis. pakaian luntur dipisah" /></Field>
      </>}
      {it.input === 'rooms' && <>
        <div className="row" style={{ alignItems: 'flex-start' }}>
          <Field label="Jumlah kamar"><input inputMode="numeric" value={v.count} onChange={(e) => set('count', e.target.value.replace(/\D/g, ''))} /></Field>
          <Field label="Awalan nomor" hint="A → A01, A02"><input value={v.prefix} maxLength={3} onChange={(e) => set('prefix', e.target.value.toUpperCase())} /></Field>
        </div>
        <Field label="Harga sewa per bulan (Rp)" hint="Berlaku untuk semua kamar; bisa dibedakan per kamar setelah aktif"><input inputMode="numeric" value={v.price} onChange={(e) => set('price', e.target.value.replace(/\D/g, ''))} /></Field>
      </>}
      {it.input === 'delivery' && <>
        <Field label="Wilayah yang dilayani" hint="Pisahkan dengan koma; wilayah lain tidak dianggap terlayani"><input value={v.areas} maxLength={300} onChange={(e) => set('areas', e.target.value)} placeholder="mis. Kec. Majalengka, Cigasong" /></Field>
        <Field label="Biaya antar jemput (Rp)" hint="Isi 0 bila gratis"><input inputMode="numeric" value={v.fee} onChange={(e) => set('fee', e.target.value.replace(/\D/g, ''))} /></Field>
        <Field label="Jadwal jemput & antar"><input value={v.schedule} maxLength={200} onChange={(e) => set('schedule', e.target.value)} placeholder="mis. Jemput 08–10, antar 16–19" /></Field>
      </>}
      {it.input === 'stages' && <>
        {v.stages.map((s, i) => <div className="row" key={i} style={{ flexWrap: 'nowrap' }}><input value={s} maxLength={40} aria-label={`Tahap ${i + 1}`} onChange={(e) => set('stages', v.stages.map((x, j) => (j === i ? e.target.value : x)))} />
          <button className="sm ghost" aria-label={`Hapus tahap ${i + 1}`} onClick={() => set('stages', v.stages.filter((_, j) => j !== i))}>✕</button></div>)}
        {v.stages.length < 12 && <button className="sm ghost" onClick={() => set('stages', [...v.stages, ''])}>+ Tahap</button>}
      </>}
      {it.input === 'gudang' && <>
        <div className="seg">{[[false, 'Tidak ada'], [true, 'Ada gudang']].map(([k, l]) => <button key={l} className={v.ada === k ? 'on' : ''} onClick={() => set('ada', k)}>{l}</button>)}</div>
        {v.ada && <Field label="Nama gudang"><input value={v.name} maxLength={60} onChange={(e) => set('name', e.target.value)} placeholder="mis. Gudang belakang" /></Field>}
      </>}
      <div className="row">
        {owner && <button className="primary" disabled={busy} onClick={() => go('setujui')}>Simpan & setujui</button>}
        <button className={owner ? 'ghost' : 'primary'} disabled={busy} onClick={() => go('simpan')}>Simpan draf</button>
      </div>
    </Sheet>
  );
}

function AddService({ kosId, onDone, onClose }) {
  const [name, setName] = useState('');
  const save = async () => {
    const { error } = await supabase.rpc('setup_add_service', { p_kos: kosId, p: { name, unit: 'pcs' } });
    if (error) return toast(errMsg(error));
    toast('Layanan ditambahkan — isi harga & estimasinya'); onDone();
  };
  return <Sheet title="Tambah layanan" onClose={onClose}><Field label="Nama layanan"><input value={name} maxLength={80} onChange={(e) => setName(e.target.value)} placeholder="mis. Cuci karpet" /></Field>
    <button className="primary" disabled={name.trim().length < 2} onClick={save}>Tambah</button></Sheet>;
}

export default function Konfirmasi() {
  const router = useRouter();
  const { kos, kosId, ver, loadKos, pickKos } = useKos();
  const [d, setD] = useState(null);
  const [err, setErr] = useState(null);
  const [edit, setEdit] = useState(null);
  const [adding, setAdding] = useState(false);
  const [review, setReview] = useState(false);
  const [busy, setBusy] = useState(false);
  const load = () => supabase.rpc('setup_state', { p_kos: kosId }).then(({ data, error }) => (error ? setErr(errMsg(error)) : (setErr(null), setD(data))));
  useEffect(() => { load(); }, [kosId, ver]);
  if (err) return <div className="notice bad">{/setup_state|function/.test(err) ? 'Database sedang diperbarui. Coba lagi beberapa menit lagi.' : err}</div>;
  if (!d) return <Loading />;
  const b = d.business; const owner = b.is_owner; const active = b.status === 'active';
  const items = d.items;
  if (!items.length) return <div className="stack"><h2>Pusat Konfirmasi</h2><div className="notice">{kos.name} dibuat sebelum Pusat Konfirmasi ada. Pengaturan modul & profilnya ada di <Link href="/konfigurasi">Konfigurasi</Link>.</div></div>;

  const act = async (it, value, action, note) => {
    let n = note;
    if ((action === 'tolak' || action === 'tunda') && n === undefined) { n = prompt(`Alasan ${action === 'tolak' ? 'menolak' : 'menunda'} "${it.label}"? (opsional)`); if (n === null) return; }
    const { data, error } = await supabase.rpc('setup_item_save', { p_kos: kosId, p_code: it.code, p_value: value, p_action: action, p_note: n || null });
    if (error) return toast(errMsg(error));
    toast(action === 'setujui' ? (active ? 'Disetujui & langsung diterapkan' : 'Disetujui') : action === 'simpan' ? 'Tersimpan sebagai draf' : action === 'tolak' ? 'Ditolak' : 'Ditunda');
    setEdit(null); load();
    if (data?.business !== b.status || active) loadKos();
  };
  const approveReco = async () => {
    const { data, error } = await supabase.rpc('setup_approve_recommended', { p_kos: kosId });
    if (error) return toast(errMsg(error));
    toast(`${data} modul disetujui`); load();
  };
  const bizAction = async (action) => {
    let note = null;
    if (action !== 'lanjut') { note = prompt(action === 'tolak' ? 'Tolak draf bisnis ini? Data draf tetap tersimpan (bisa dilanjutkan lagi). Alasannya:' : 'Tunda setup bisnis ini? Alasannya:'); if (!note) return; }
    const { error } = await supabase.rpc('setup_business_action', { p_kos: kosId, p_action: action, p_note: note });
    if (error) return toast(errMsg(error));
    toast(action === 'lanjut' ? 'Setup dilanjutkan' : action === 'tolak' ? 'Draf ditolak' : 'Setup ditunda'); await loadKos(); load();
  };
  const activate = async () => {
    setBusy(true);
    const { data, error } = await supabase.rpc('setup_activate', { p_kos: kosId });
    setBusy(false);
    if (error) return toast(errMsg(error));
    toast(`${b.name} aktif`); setReview(false);
    const list = await loadKos(); pickKos(kosId);
    const k = list?.find((x) => x.id === kosId);
    if (k) router.replace(homeOf(k));
  };

  const decided = (it) => ['approved', 'active', 'rejected', 'paused'].includes(it.status);
  const Item = ({ it }) => {
    const [label, tone] = ITEM_ST[it.status] || ['—', 'void'];
    const editable = !['module', 'portal', 'pending', 'builder'].includes(it.input);
    return (
      <div className="li" style={{ display: 'block' }}>
        <div className="row between" style={{ flexWrap: 'nowrap', alignItems: 'flex-start' }}>
          <span className="small" style={{ minWidth: 0 }}><b>{it.label}</b>{it.must === 'approve' && <span className="muted"> · wajib</span>}{it.kind === 'modul' && it.value?.recommended && <span style={{ color: 'var(--good)' }}> · disarankan</span>}<br />
            <span className={it.complete ? '' : 'muted'} style={{ overflowWrap: 'anywhere' }}>{it.input === 'pending' ? it.help : it.input === 'builder' ? (it.complete ? 'Business Builder sudah divalidasi & aktif' : 'Selesaikan di Business Builder › Validasi & aktifkan') : it.kind === 'modul' || it.kind === 'portal' ? it.help : show(it)}</span></span>
          <span className={'chip ' + tone} style={{ flex: 'none' }}>{label}</span>
        </div>
        {it.note && <span className="small muted">Catatan: {it.note}</span>}
        <div className="row" style={{ marginTop: 6, gap: 6 }}>
          {editable && <button className="sm" onClick={() => setEdit(it)}>{it.complete ? 'Ubah' : 'Lengkapi'}</button>}
          {it.input === 'builder' && <Link href="/builder"><button className="sm">Buka Business Builder</button></Link>}
          {owner && it.input !== 'builder' && it.input !== 'pending' && !['approved', 'active'].includes(it.status) && <button className="sm primary" disabled={!it.complete} onClick={() => act(it, null, 'setujui')}>Setujui</button>}
          {owner && it.must !== 'approve' && it.input !== 'pending' && !['rejected', 'paused'].includes(it.status) && <>
            <button className="sm ghost" onClick={() => act(it, null, 'tunda')}>Tunda</button>
            <button className="sm ghost danger" onClick={() => act(it, null, 'tolak')}>Tolak</button></>}
          {owner && ['rejected', 'paused'].includes(it.status) && it.complete && <button className="sm ghost" onClick={() => act(it, null, 'setujui')}>Setujui sekarang</button>}
        </div>
      </div>
    );
  };
  const [stLabel, stTone] = ST[b.status] || ['—', 'void'];
  const willOn = items.filter((x) => x.status === 'approved' || x.status === 'active');
  const willOff = items.filter((x) => !decided(x) && x.kind !== 'info' || (x.kind === 'info' && !decided(x) && x.must !== 'approve'));
  const blockers = items.filter((x) => (x.must === 'approve' && !['approved', 'active'].includes(x.status)) || (x.must === 'decide' && !decided(x)));

  return (
    <div className="stack">
      <div className="row between"><div className="row"><h2>Pusat Konfirmasi</h2><PageHelp page="konfirmasi" /></div><span className={'chip ' + stTone}>{stLabel}</span></div>
      <section className="panel" style={{ gap: 6 }}>
        <b>{b.category?.icon} {b.name}</b>
        <span className="small muted">{b.category?.name}{b.subcategory ? ` · ${b.subcategory.name}` : ''} · template {b.template}{b.meta?.stage ? ` · ${{ berjalan: 'sudah berjalan', baru: 'baru akan dibangun', dikembangkan: 'sedang dikembangkan' }[b.meta.stage]}` : ''}{Number(b.meta?.branches) > 0 ? ` · ${b.meta.branches} cabang` : ''}</span>
        {(b.subcategory?.note || b.category?.note) && <span className="small muted">{b.subcategory?.note || b.category?.note}</span>}
        <div className="row between"><span className="small">Kelengkapan data {d.progress.pct}%</span><span className="small muted">{d.progress.missing > 0 ? `${d.progress.missing} informasi belum diisi` : 'Informasi lengkap'}</span></div>
        <div className="progress" aria-label={`Kelengkapan ${d.progress.pct}%`}><i style={{ width: `${d.progress.pct}%` }} /></div>
        {active ? <span className="small" style={{ color: 'var(--good)' }}>Bisnis aktif{b.activated_at ? ` sejak ${waktu(b.activated_at)}` : ''}. Bagian yang Anda setujui sekarang langsung diterapkan.</span>
          : b.status === 'paused' || b.status === 'rejected' ? <span className="small">Setup {b.status === 'paused' ? 'ditunda' : 'ditolak'}. Data draf tetap tersimpan.</span>
          : <span className="small muted">Semua yang disiapkan PRASARA berstatus <b>draf</b> sampai Anda menyetujuinya. Harga, kapasitas, dan data lain tidak dikarang — isi sesuai kenyataan.</span>}
        {!owner && <span className="small muted">Anda bisa melengkapi isian; keputusan setujui/tolak/tunda dan aktivasi hanya oleh pemilik.</span>}
      </section>

      {SECTIONS.map(([k, title]) => {
        const xs = items.filter((x) => x.kind === k);
        if (!xs.length && !(k === 'layanan' && b.type === 'jasa')) return null;
        return (
          <section className="panel" key={k}>
            <div className="row between"><h3>{title}</h3>
              {k === 'modul' && owner && xs.some((x) => x.value?.recommended && !['approved', 'active'].includes(x.status)) && <button className="sm" onClick={approveReco}>Setujui semua yang disarankan</button>}
              {k === 'layanan' && b.type === 'jasa' && b.status !== 'rejected' && b.status !== 'paused' && <button className="sm" onClick={() => setAdding(true)}>+ Layanan lain</button>}</div>
            {k === 'modul' && <span className="small muted">Modul yang tidak disetujui tidak diaktifkan (menunya tidak muncul). Bisa diubah kapan saja.</span>}
            {k === 'layanan' && b.type === 'jasa' && <span className="small muted">Hanya layanan yang disetujui yang aktif dan bisa dipesan. Minimal satu layanan dengan harga.</span>}
            <div className="list">{xs.map((it) => <Item key={it.code} it={it} />)}</div>
          </section>
        );
      })}

      {d.after?.length > 0 && <section className="panel"><h3>Setelah aktif</h3>
        <span className="small muted">Data operasional diisi di menunya masing-masing setelah bisnis aktif. Dicek dari data nyata.</span>
        <div className="list">{d.after.map((a) => <div className="li" key={a.code}><span className="small">{a.done ? '✓' : '○'} {a.label}</span>{active && !a.done ? <Link href={a.href} className="small">Isi →</Link> : <span className="small muted">{a.done ? 'Sudah ada' : 'Belum'}</span>}</div>)}</div></section>}

      <section className="panel" style={{ opacity: 0.75 }}><span className="small"><b>✨ Asisten AI untuk mengisi draf</b> <span className="chip gold">Segera hadir</span><br /><span className="muted">Draf saat ini disusun dari template per jenis usaha, bukan AI. Rekomendasi tidak pernah dianggap keputusan Anda.</span></span></section>

      {!active && owner && <>
        {b.status !== 'paused' && b.status !== 'rejected' ? <>
          <button className="cta" onClick={() => setReview(true)}>Tinjau seluruh konfigurasi & aktifkan</button>
          <div className="row"><button className="sm ghost" onClick={() => bizAction('tunda')}>Tunda setup</button><button className="sm ghost danger" onClick={() => bizAction('tolak')}>Tolak draf bisnis ini</button></div>
        </> : <button className="primary" onClick={() => bizAction('lanjut')}>Lanjutkan setup</button>}
      </>}

      {edit && <Editor it={edit} owner={owner} onClose={() => setEdit(null)} onSave={(it, v, a) => act(it, v, a)} />}
      {adding && <AddService kosId={kosId} onClose={() => setAdding(false)} onDone={() => { setAdding(false); load(); }} />}
      {review && (
        <Sheet title="Tinjau sebelum aktivasi" onClose={() => setReview(false)}>
          <span className="label">Akan diaktifkan ({willOn.length})</span>
          <div className="list">{willOn.map((x) => <div className="li" key={x.code}><span className="small"><b>{x.label}</b>{x.kind !== 'modul' && x.kind !== 'portal' ? <><br /><span className="muted">{show(x)}</span></> : ''}</span><span className="chip good">✓</span></div>)}</div>
          {willOff.length > 0 && <><span className="label">Tidak diaktifkan sekarang ({willOff.length})</span>
            <span className="small muted">Belum disetujui, ditunda, atau ditolak. Bisa disetujui nanti dari halaman ini.</span>
            <div className="list">{willOff.map((x) => <div className="li" key={x.code}><span className="small">{x.label}</span><span className={'chip ' + (ITEM_ST[x.status]?.[1] || 'void')}>{ITEM_ST[x.status]?.[0]}</span></div>)}</div></>}
          {blockers.length > 0 ? <div className="notice bad">Belum bisa diaktifkan. Selesaikan dulu: {blockers.map((x) => x.label).join(', ')}{b.type === 'jasa' && !items.some((x) => x.input === 'service' && ['approved', 'active'].includes(x.status)) ? ', minimal satu layanan disetujui' : ''}.</div>
            : !d.can_activate ? <div className="notice">Belum bisa diaktifkan: {b.type === 'jasa' ? 'setujui minimal satu layanan dengan harga.' : b.type === 'kustom' ? 'selesaikan Validasi & aktifkan di Business Builder.' : 'periksa bagian wajib.'}</div>
            : <span className="small muted">Setelah aktif, menu operasional terbuka. Halaman bisnis tetap draf sampai Anda menerbitkannya sendiri.</span>}
          <button className="cta" disabled={!d.can_activate || busy} onClick={activate}>{busy ? 'Mengaktifkan…' : `Aktifkan ${b.name}`}</button>
        </Sheet>
      )}
    </div>
  );
}
