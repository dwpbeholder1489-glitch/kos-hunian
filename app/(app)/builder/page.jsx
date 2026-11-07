'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { useKos } from '@/components/KosProvider';
import PageHelp from '@/components/PageHelp';
import { Sheet, Field, Loading, run, toast } from '@/components/ui';
import { errMsg } from '@/lib/format';
import { canArea, tabsFor, ROLES } from '@/lib/business';
import { useBuilder, fieldsOf, statusesOf, FTYPES, TONES, BROLES, ICONS, FieldInput, initialData } from '@/lib/builder';

const STEPS = [['profil', '1. Profil'], ['data', '2. Data & formulir'], ['alur', '3. Alur & peran'], ['laporan', '4. Laporan'], ['aktifkan', '5. Validasi & aktifkan']];

// Business Builder: susun sendiri jenis data, field, status & alur, peran, laporan → validasi → aktifkan
export default function Builder() {
  const { kos, kosId, ver, bump } = useKos();
  const { cfg, err, reload } = useBuilder(kosId, ver);
  const [step, setStep] = useState('profil');
  useEffect(() => { try { const s = new URLSearchParams(window.location.search).get('langkah'); if (STEPS.some(([k]) => k === s)) setStep(s); } catch {} }, []);
  if (err) return <div className="notice bad">{/bb_/.test(err) ? 'Database sedang diperbarui. Coba lagi beberapa menit lagi.' : err}</div>;
  if (!cfg) return <Loading />;
  const done = () => { reload(); bump(); };
  return (
    <div className="stack">
      <div className="row between"><div className="row"><h2>Business Builder</h2><PageHelp page="builder" /></div>
        <span className={'chip ' + (cfg.ws?.status === 'aktif' ? 'good' : 'gold')}>{cfg.ws?.status === 'aktif' ? 'Aktif' : 'Draf'}</span></div>
      <div className="seg" style={{ overflowX: 'auto', flexWrap: 'nowrap' }}>{STEPS.map(([k, l]) => <button key={k} className={step === k ? 'on' : ''} onClick={() => setStep(k)} style={{ whiteSpace: 'nowrap' }}>{l}</button>)}</div>
      {cfg.ws?.status === 'aktif' && <span className="small muted">Bisnis sudah aktif. Perubahan langsung berlaku; catatan lama tetap aman (field yang dinonaktifkan tidak menghapus isinya).</span>}
      {step === 'profil' && <Profil kos={kos} cfg={cfg} onSaved={done} />}
      {step === 'data' && <DataStep kosId={kosId} cfg={cfg} onSaved={done} />}
      {step === 'alur' && <AlurStep kosId={kosId} cfg={cfg} onSaved={done} />}
      {step === 'laporan' && <ReportStep kosId={kosId} cfg={cfg} onSaved={done} />}
      {step === 'aktifkan' && <Activate kos={kos} cfg={cfg} onDone={done} go={setStep} />}
      <div className="row between">
        {STEPS.findIndex(([k]) => k === step) > 0 ? <button className="sm ghost" onClick={() => setStep(STEPS[STEPS.findIndex(([k]) => k === step) - 1][0])}>← Sebelumnya</button> : <span />}
        {STEPS.findIndex(([k]) => k === step) < STEPS.length - 1 && <button className="sm" onClick={() => setStep(STEPS[STEPS.findIndex(([k]) => k === step) + 1][0])}>Berikutnya →</button>}
      </div>
    </div>
  );
}

function Profil({ kos, cfg, onSaved }) {
  const w = cfg.ws || {};
  const [f, setF] = useState({ name: kos.name, description: w.description || '', revenue_model: w.revenue_model || '', main_process: w.main_process || '', locations: w.locations || '' });
  const [busy, setBusy] = useState(false);
  const save = async () => { setBusy(true); const ok = await run(() => supabase.rpc('bb_workspace_save', { p_kos: kos.id, p: f }), 'Profil disimpan', errMsg); setBusy(false); if (ok) onSaved(); };
  return (
    <section className="panel">
      <span className="small muted">Template: <b>{{ bengkel: 'Bengkel motor', salon: 'Salon & barbershop', kosong: 'Bangun sendiri' }[w.template] || w.template}</b> (versi {w.template_version}). Semua isi template bisa diubah.</span>
      <Field label="Nama bisnis"><input value={f.name} maxLength={80} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
      <Field label="Deskripsi singkat"><input value={f.description} maxLength={500} onChange={(e) => setF({ ...f, description: e.target.value })} placeholder="mis. Bengkel motor 3 mekanik" /></Field>
      <Field label="Model pendapatan" hint="Dari mana uang masuk"><input value={f.revenue_model} maxLength={200} onChange={(e) => setF({ ...f, revenue_model: e.target.value })} placeholder="mis. jasa servis + jual spare part" /></Field>
      <Field label="Proses utama" hint="Ditampilkan di Dashboard agar tim paham alurnya"><textarea rows={2} maxLength={300} value={f.main_process} onChange={(e) => setF({ ...f, main_process: e.target.value })} placeholder="mis. Motor masuk → dicek → dikerjakan → diambil & dibayar" /></Field>
      <Field label="Lokasi & cabang" hint="Catatan saja; data per cabang untuk bisnis kustom belum tersedia"><input value={f.locations} maxLength={200} onChange={(e) => setF({ ...f, locations: e.target.value })} placeholder="mis. 1 lokasi, Jl. Cideres" /></Field>
      <button className="primary" disabled={busy} onClick={save}>{busy ? 'Menyimpan…' : 'Simpan profil'}</button>
    </section>
  );
}

function DataStep({ kosId, cfg, onSaved }) {
  const [objEdit, setObjEdit] = useState(null);
  const [fieldEdit, setFieldEdit] = useState(null); // { o, f }
  const [preview, setPreview] = useState(null);
  const [money, setMoney] = useState(null);
  const moveField = async (o, f, dir) => {
    const list = fieldsOf(cfg, o.id); const i = list.findIndex((x) => x.id === f.id); const j = i + dir;
    if (j < 0 || j >= list.length) return;
    const g = list[j];
    const save = (x, sort) => supabase.rpc('bb_field_save', { p_kos: kosId, p_object: o.id, p_id: x.id, p: { ...x, sort } });
    const a = await save(f, g.sort); const b = await save(g, f.sort);
    if (a.error || b.error) toast(errMsg(a.error || b.error)); onSaved();
  };
  return (
    <>
      <span className="small muted">Jenis data = hal yang Anda catat (mis. Pelanggan, Kendaraan, Servis). Tiap jenis data punya formulir (field) sendiri. Maksimal 12 jenis data, 40 field per jenis.</span>
      {cfg.objects.map((o) => {
        const fs = fieldsOf(cfg, o.id);
        return (
          <section className="panel" key={o.id} style={{ opacity: o.active ? 1 : 0.6 }}>
            <div className="row between"><b>{o.icon} {o.name}{!o.active && ' (nonaktif)'}</b><button className="sm ghost" onClick={() => setObjEdit(o)}>Ubah</button></div>
            <span className="small muted">Nomor {o.prefix}-… · judul: {fs.find((f) => f.key === o.title_field)?.label || <b style={{ color: 'var(--bad)' }}>belum dipilih</b>} · {o.workflow ? 'pakai alur status' : 'tanpa status'}</span>
            <div className="list">{fs.map((f, i) => (
              <div className="li" key={f.id}>
                <button className="li click" onClick={() => setFieldEdit({ o, f })} style={{ background: 'none', border: 0, padding: 0, textAlign: 'left', font: 'inherit', color: 'inherit', flex: 1 }}>
                  <div className="main"><b className="small">{f.label}{f.required ? ' *' : ''}</b><span className="small muted">{FTYPES[f.type]}{f.type === 'reference' ? ` → ${cfg.objects.find((x) => x.id === f.ref_object)?.name || '?'}` : ''}{f.choices?.length ? ` · ${f.choices.length} pilihan` : ''}{f.hidden_roles?.length ? ' · disembunyikan dari ' + f.hidden_roles.map((r) => ROLES[r]?.name || r).join(', ') : ''}</span></div>
                </button>
                <span className="row" style={{ flexWrap: 'nowrap', gap: 2 }}><button className="sm ghost" aria-label="Naik" disabled={i === 0} onClick={() => moveField(o, f, -1)}>↑</button><button className="sm ghost" aria-label="Turun" disabled={i === fs.length - 1} onClick={() => moveField(o, f, 1)}>↓</button></span>
              </div>
            ))}</div>
            {cfg.fields.some((f) => f.object_id === o.id && !f.active) && <span className="small muted">Nonaktif: {cfg.fields.filter((f) => f.object_id === o.id && !f.active).map((f) => <button key={f.id} className="sm ghost" onClick={() => setFieldEdit({ o, f })}>{f.label}</button>)}</span>}
            {(o.money_field || fs.some((f) => f.type === 'currency')) && <div className="li" style={{ alignItems: 'flex-start' }}><span className="small">💰 <b>Uang masuk:</b> {o.money_field ? `${fs.find((f) => f.key === o.money_field)?.label || '?'} → ${o.money_account === 'bank' ? 'bank' : 'kas'}${o.workflow ? `, dihitung saat status ${(o.money_statuses || []).map((id) => cfg.statuses.find((s) => s.id === id)?.label).filter(Boolean).join(' / ') || '?'}` : ', dihitung saat dicatat'}` : 'tidak dihitung'}</span><button className="sm ghost" onClick={() => setMoney(o)}>Atur</button></div>}
            <div className="row"><button className="sm" onClick={() => setFieldEdit({ o, f: null })}>+ Field</button><button className="sm ghost" onClick={() => setPreview(o)}>Pratinjau formulir</button></div>
          </section>
        );
      })}
      <button className="primary" onClick={() => setObjEdit({})}>+ Jenis data</button>
      {objEdit && <ObjectForm kosId={kosId} cfg={cfg} o={objEdit} onClose={() => setObjEdit(null)} onSaved={() => { setObjEdit(null); onSaved(); }} />}
      {fieldEdit && <FieldForm kosId={kosId} cfg={cfg} o={fieldEdit.o} f={fieldEdit.f} onClose={() => setFieldEdit(null)} onSaved={() => { setFieldEdit(null); onSaved(); }} />}
      {money && <MoneyForm kosId={kosId} cfg={cfg} o={money} onClose={() => setMoney(null)} onSaved={() => { setMoney(null); onSaved(); }} />}
      {preview && <Sheet title={`Pratinjau: ${preview.name} baru`} onClose={() => setPreview(null)}>
        <span className="small muted">Seperti inilah formulir yang dilihat tim (contoh, tidak disimpan).</span>
        {(() => { const fs = fieldsOf(cfg, preview.id); const d = initialData(fs, {}); return fs.map((f) => f.type === 'boolean' ? <FieldInput key={f.key} f={f} value={d[f.key]} onChange={() => {}} /> : <Field key={f.key} label={`${f.label}${f.required ? ' *' : ''}`} hint={f.help}><FieldInput f={f} value={d[f.key]} onChange={() => {}} refOpts={[]} /></Field>); })()}
      </Sheet>}
    </>
  );
}

// Uang masuk: field uang mana yang menjadi pemasukan, kapan dihitung, masuk ke kas atau bank
function MoneyForm({ kosId, cfg, o, onClose, onSaved }) {
  const cur = fieldsOf(cfg, o.id).filter((f) => f.type === 'currency');
  const sts = statusesOf(cfg, o.id);
  const [field, setField] = useState(o.money_field || '');
  const [st, setSt] = useState(o.money_statuses || []);
  const [acc, setAcc] = useState(o.money_account || 'kas');
  const [busy, setBusy] = useState(false);
  const save = async () => {
    setBusy(true);
    const ok = await run(() => supabase.rpc('bb_money_save', { p_kos: kosId, p_object: o.id, p: { money_field: field || null, money_statuses: st, money_account: acc } }), field ? 'Uang masuk diatur' : 'Uang masuk dimatikan', errMsg);
    setBusy(false);
    if (ok) onSaved();
  };
  return (
    <Sheet title={`Uang masuk · ${o.name}`} onClose={onClose}>
      <span className="small muted">Bila diatur, nilai field uang ini masuk ke Kas, Pembukuan, Laporan keuangan, dan Ringkasan pemilik pada saat yang Anda tentukan. Biaya dicatat di menu Kas & biaya.</span>
      <Field label="Field uang"><select value={field} onChange={(e) => setField(e.target.value)}><option value="">— tidak dihitung —</option>{cur.map((f) => <option key={f.key} value={f.key}>{f.label}</option>)}</select></Field>
      {cur.length === 0 && <span className="small" style={{ color: 'var(--bad)' }}>Belum ada field bertipe Uang (Rp) di {o.name}. Tambahkan dulu.</span>}
      {field && o.workflow && <Field label="Dihitung saat status" hint="Pilih status ketika uang benar-benar diterima (mis. Diambil / Lunas). Bila catatan keluar dari status ini, uangnya tidak dihitung lagi.">
        <div className="stack" style={{ gap: 6 }}>{sts.map((s) => <label key={s.id} className="row small" style={{ flexWrap: 'nowrap' }}><input type="checkbox" style={{ width: 22, minHeight: 22, flex: 'none' }} checked={st.includes(s.id)} onChange={(e) => setSt(e.target.checked ? [...st, s.id] : st.filter((x) => x !== s.id))} />{s.label}{s.is_final ? ' (akhir)' : ''}</label>)}</div>
      </Field>}
      {field && !o.workflow && <span className="small muted">Jenis data ini tanpa status: uang dihitung saat catatan dibuat.</span>}
      {field && <div className="seg">{[['kas', 'Masuk ke kas (tunai)'], ['bank', 'Masuk ke bank']].map(([k, l]) => <button key={k} className={acc === k ? 'on' : ''} onClick={() => setAcc(k)}>{l}</button>)}</div>}
      <button className="cta" disabled={busy} onClick={save}>{busy ? 'Menyimpan…' : 'Simpan'}</button>
    </Sheet>
  );
}

function ObjectForm({ kosId, cfg, o, onClose, onSaved }) {
  const [f, setF] = useState({ name: o.name || '', icon: o.icon || '📋', prefix: o.prefix || '', title_field: o.title_field || '', workflow: o.workflow !== false, active: o.active !== false });
  const [busy, setBusy] = useState(false);
  const titleOpts = o.id ? fieldsOf(cfg, o.id).filter((x) => ['text', 'phone', 'select', 'reference', 'number', 'date'].includes(x.type)) : [];
  const save = async () => {
    if (f.name.trim().length < 2) return toast('Isi nama jenis data.');
    setBusy(true);
    const { error } = await supabase.rpc('bb_object_save', { p_kos: kosId, p_id: o.id || null, p: { ...f, prefix: f.prefix.toUpperCase() } });
    setBusy(false);
    if (error) return toast(errMsg(error));
    toast(o.id ? 'Disimpan' : 'Jenis data ditambahkan. Tambahkan field-nya.'); onSaved();
  };
  return (
    <Sheet title={o.id ? `Ubah ${o.name}` : 'Jenis data baru'} onClose={onClose}>
      <Field label="Nama" hint="mis. Servis, Pesanan, Janji temu, Kendaraan"><input value={f.name} maxLength={40} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
      <Field label="Ikon"><div className="row" style={{ gap: 4 }}>{ICONS.map((i) => <button type="button" key={i} className={'sm ' + (f.icon === i ? 'primary' : 'ghost')} onClick={() => setF({ ...f, icon: i })}>{i}</button>)}</div></Field>
      <Field label="Awalan nomor" hint="2–5 huruf, mis. SRV → SRV-261107-001"><input value={f.prefix} maxLength={5} onChange={(e) => setF({ ...f, prefix: e.target.value.replace(/[^A-Za-z]/g, '').toUpperCase() })} placeholder="otomatis dari nama" /></Field>
      {o.id && <Field label="Field judul" hint="Ditampilkan sebagai nama catatan di daftar"><select value={f.title_field} onChange={(e) => setF({ ...f, title_field: e.target.value })}><option value="">— pilih —</option>{titleOpts.map((x) => <option key={x.key} value={x.key}>{x.label}</option>)}</select></Field>}
      <label className="row small" style={{ flexWrap: 'nowrap' }}><input type="checkbox" style={{ width: 22, minHeight: 22, flex: 'none' }} checked={f.workflow} onChange={(e) => setF({ ...f, workflow: e.target.checked })} />Pakai status & alur kerja (mis. Antre → Dikerjakan → Selesai). Matikan untuk data induk seperti Pelanggan.</label>
      {o.id && <label className="row small"><input type="checkbox" style={{ width: 22, minHeight: 22 }} checked={f.active} onChange={(e) => setF({ ...f, active: e.target.checked })} />Aktif</label>}
      <button className="cta" disabled={busy} onClick={save}>{busy ? 'Menyimpan…' : 'Simpan'}</button>
    </Sheet>
  );
}

function FieldForm({ kosId, cfg, o, f, onClose, onSaved }) {
  const [p, setP] = useState({ label: f?.label || '', type: f?.type || 'text', help: f?.help || '', required: Boolean(f?.required), choices: (f?.choices || []).join('\n'),
    min_value: f?.min_value ?? '', max_value: f?.max_value ?? '', default_value: f?.default_value || '', ref_object: f?.ref_object || '',
    in_list: f ? f.in_list : true, searchable: f ? f.searchable : true, filterable: f ? f.filterable : false, hidden_roles: f?.hidden_roles || [], active: f ? f.active : true });
  const [busy, setBusy] = useState(false);
  const set = (k, v) => setP({ ...p, [k]: v });
  const save = async () => {
    if (!p.label.trim()) return toast('Isi nama field.');
    setBusy(true);
    const body = { ...p, choices: p.choices.split('\n').map((x) => x.trim()).filter(Boolean), min_value: p.min_value === '' ? null : p.min_value, max_value: p.max_value === '' ? null : p.max_value, sort: f?.sort };
    const { error } = await supabase.rpc('bb_field_save', { p_kos: kosId, p_object: o.id, p_id: f?.id || null, p: body });
    setBusy(false);
    if (error) return toast(errMsg(error));
    toast('Field disimpan'); onSaved();
  };
  const refs = cfg.objects.filter((x) => x.active && x.id !== o.id);
  return (
    <Sheet title={f ? `Field: ${f.label}` : `Field baru · ${o.name}`} onClose={onClose}>
      <Field label="Nama field (label)"><input value={p.label} maxLength={60} onChange={(e) => set('label', e.target.value)} placeholder="mis. Plat nomor" /></Field>
      <Field label="Tipe" hint={f ? 'Tipe tidak bisa diubah bila field sudah berisi data' : undefined}><select value={p.type} onChange={(e) => set('type', e.target.value)}>{Object.entries(FTYPES).map(([k, l]) => <option key={k} value={k}>{l}</option>)}<option value="file" disabled>Foto/file → pakai 📎 Lampiran di catatan</option></select></Field>
      {['select', 'multiselect'].includes(p.type) && <Field label="Pilihan (satu per baris)"><textarea rows={4} value={p.choices} onChange={(e) => set('choices', e.target.value)} placeholder={'Matic\nBebek\nSport'} /></Field>}
      {p.type === 'reference' && <Field label="Merujuk ke"><select value={p.ref_object} onChange={(e) => set('ref_object', e.target.value)}><option value="">— pilih jenis data —</option>{refs.map((x) => <option key={x.id} value={x.id}>{x.icon} {x.name}</option>)}</select></Field>}
      {['number', 'currency'].includes(p.type) && <div className="row">
        <Field label="Minimal (opsional)"><input inputMode="decimal" value={p.min_value} onChange={(e) => set('min_value', e.target.value)} /></Field>
        <Field label="Maksimal (opsional)"><input inputMode="decimal" value={p.max_value} onChange={(e) => set('max_value', e.target.value)} /></Field>
      </div>}
      {!['reference', 'datetime'].includes(p.type) && <Field label="Nilai bawaan (opsional)" hint={p.type === 'boolean' ? 'isi true untuk tercentang' : p.type === 'multiselect' ? 'pisahkan dengan koma' : undefined}><input value={p.default_value} maxLength={200} onChange={(e) => set('default_value', e.target.value)} /></Field>}
      <Field label="Keterangan untuk pengisi (opsional)"><input value={p.help} maxLength={200} onChange={(e) => set('help', e.target.value)} /></Field>
      {[['required', 'Wajib diisi'], ['in_list', 'Tampil di daftar'], ['searchable', 'Bisa dicari'], ['filterable', 'Bisa disaring (pilihan/ya-tidak/teks)']].map(([k, l]) => (
        <label key={k} className="row small" style={{ flexWrap: 'nowrap' }}><input type="checkbox" style={{ width: 22, minHeight: 22, flex: 'none' }} checked={Boolean(p[k])} onChange={(e) => set(k, e.target.checked)} />{l}</label>))}
      <Field label="Sembunyikan dari peran" hint="Peran ini tidak melihat dan tidak bisa mengubah isinya (mis. harga modal)"><div className="row">{BROLES.map(([r, l]) => (
        <label key={r} className="row small" style={{ flexWrap: 'nowrap' }}><input type="checkbox" style={{ width: 22, minHeight: 22, flex: 'none' }} checked={p.hidden_roles.includes(r)} onChange={(e) => set('hidden_roles', e.target.checked ? [...p.hidden_roles, r] : p.hidden_roles.filter((x) => x !== r))} />{l}</label>))}</div></Field>
      {f && <label className="row small"><input type="checkbox" style={{ width: 22, minHeight: 22 }} checked={p.active} onChange={(e) => set('active', e.target.checked)} />Aktif (nonaktif = disembunyikan, isi lama tetap tersimpan)</label>}
      <button className="cta" disabled={busy} onClick={save}>{busy ? 'Menyimpan…' : 'Simpan field'}</button>
    </Sheet>
  );
}

function AlurStep({ kosId, cfg, onSaved }) {
  const objs = cfg.objects.filter((o) => o.active && o.workflow);
  const [oid, setOid] = useState(objs[0]?.id || null);
  const o = objs.find((x) => x.id === oid);
  const toState = (id) => {
    const sts = cfg.statuses.filter((s) => s.object_id === id).sort((a, b) => a.sort - b.sort).map((s) => ({ id: s.id, label: s.label, tone: s.tone, is_initial: s.is_initial, is_final: s.is_final, sla_hours: s.sla_hours ?? '', active: s.active }));
    const idx = (sid) => sts.findIndex((s) => s.id === sid);
    const rules = cfg.rules.filter((t) => t.object_id === id).map((t) => ({ from: t.from_status ? String(idx(t.from_status)) : '', to: String(idx(t.to_status)), roles: t.roles || [], require_note: t.require_note, require_approval: t.require_approval }))
      .filter((r) => r.to !== '-1' && r.from !== '-1');
    return { sts, rules };
  };
  const [st, setSt] = useState(() => (o ? toState(o.id) : { sts: [], rules: [] }));
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (o) setSt(toState(o.id)); }, [oid, cfg]);
  if (!objs.length) return <div className="notice">Belum ada jenis data yang memakai alur status. Aktifkan "Pakai status & alur kerja" di langkah Data & formulir.</div>;
  const setS = (i, k, v) => setSt({ ...st, sts: st.sts.map((s, j) => (j === i ? { ...s, [k]: v } : k === 'is_initial' && v ? { ...s, is_initial: false } : s)) });
  const moveS = (i, d) => {
    const j = i + d; if (j < 0 || j >= st.sts.length) return;
    const sts = [...st.sts]; [sts[i], sts[j]] = [sts[j], sts[i]];
    const map = (x) => (x === String(i) ? String(j) : x === String(j) ? String(i) : x);
    setSt({ sts, rules: st.rules.map((r) => ({ ...r, from: r.from === '' ? '' : map(r.from), to: map(r.to) })) });
  };
  const setR = (i, k, v) => setSt({ ...st, rules: st.rules.map((r, j) => (j === i ? { ...r, [k]: v } : r)) });
  const save = async () => {
    if (st.rules.some((r) => r.to === '')) return toast('Lengkapi status tujuan di setiap aturan.');
    setBusy(true);
    const ok = await run(() => supabase.rpc('bb_workflow_save', { p_kos: kosId, p_object: o.id, p_statuses: st.sts.map((s) => ({ ...s, sla_hours: s.sla_hours === '' ? null : s.sla_hours })),
      p_rules: st.rules.map((r) => ({ from: r.from === '' ? null : Number(r.from), to: Number(r.to), roles: r.roles, require_note: r.require_note, require_approval: r.require_approval })) }), 'Alur disimpan', errMsg);
    setBusy(false);
    if (ok) onSaved();
  };
  const lbl = (i) => st.sts[Number(i)]?.label || '?';
  return (
    <>
      {objs.length > 1 && <div className="seg">{objs.map((x) => <button key={x.id} className={x.id === oid ? 'on' : ''} onClick={() => setOid(x.id)}>{x.icon} {x.name}</button>)}</div>}
      <section className="panel">
        <h3>Status {o.name}</h3>
        <span className="small muted">Satu status <b>awal</b> (catatan baru), minimal satu status <b>akhir</b> (Selesai/Batal). Batas waktu (jam) membuat catatan ditandai "lewat batas" di Dashboard.</span>
        {st.sts.map((s, i) => (
          <div key={s.id || 'n' + i} className="unitbox" style={{ opacity: s.active ? 1 : 0.55 }}>
            <div className="row" style={{ flexWrap: 'nowrap' }}>
              <input value={s.label} maxLength={40} onChange={(e) => setS(i, 'label', e.target.value)} aria-label={`Nama status ${i + 1}`} />
              <button className="sm ghost" aria-label="Naik" onClick={() => moveS(i, -1)}>↑</button><button className="sm ghost" aria-label="Turun" onClick={() => moveS(i, 1)}>↓</button>
            </div>
            <div className="row">
              <select value={s.tone} onChange={(e) => setS(i, 'tone', e.target.value)} aria-label="Warna" style={{ width: 'auto' }}>{Object.entries(TONES).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
              <input inputMode="numeric" value={s.sla_hours} onChange={(e) => setS(i, 'sla_hours', e.target.value.replace(/\D/g, ''))} placeholder="batas jam" aria-label="Batas waktu (jam)" style={{ width: 100 }} />
              <label className="row small" style={{ flexWrap: 'nowrap' }}><input type="radio" name="initial" style={{ width: 20, minHeight: 20 }} checked={s.is_initial} onChange={() => setS(i, 'is_initial', true)} />Awal</label>
              <label className="row small" style={{ flexWrap: 'nowrap' }}><input type="checkbox" style={{ width: 20, minHeight: 20 }} checked={s.is_final} onChange={(e) => setS(i, 'is_final', e.target.checked)} />Akhir</label>
              <label className="row small" style={{ flexWrap: 'nowrap' }}><input type="checkbox" style={{ width: 20, minHeight: 20 }} checked={s.active} onChange={(e) => setS(i, 'active', e.target.checked)} />Aktif</label>
            </div>
          </div>
        ))}
        <button className="sm" onClick={() => setSt({ ...st, sts: [...st.sts, { label: '', tone: 'info', is_initial: false, is_final: false, sla_hours: '', active: true }] })}>+ Status</button>
      </section>
      <section className="panel">
        <h3>Aturan alur & peran</h3>
        <span className="small muted">Langkah yang boleh dilakukan. Kosongkan peran = semua yang punya akses. Pemilik selalu boleh. "Perlu persetujuan": selain pemilik, langkah dikirim ke menu Persetujuan.</span>
        {st.rules.map((r, i) => (
          <div key={i} className="unitbox">
            <div className="row">
              <select value={r.from} onChange={(e) => setR(i, 'from', e.target.value)} aria-label="Dari status" style={{ flex: '1 1 120px' }}><option value="">Dari status mana pun (belum akhir)</option>{st.sts.map((s, j) => <option key={j} value={String(j)}>Dari: {s.label || `status ${j + 1}`}</option>)}</select>
              <select value={r.to} onChange={(e) => setR(i, 'to', e.target.value)} aria-label="Ke status" style={{ flex: '1 1 120px' }}><option value="">Ke…</option>{st.sts.map((s, j) => <option key={j} value={String(j)}>Ke: {s.label || `status ${j + 1}`}</option>)}</select>
            </div>
            <div className="row">
              {BROLES.map(([k, l]) => <label key={k} className="row small" style={{ flexWrap: 'nowrap' }}><input type="checkbox" style={{ width: 20, minHeight: 20 }} checked={r.roles.includes(k)} onChange={(e) => setR(i, 'roles', e.target.checked ? [...r.roles, k] : r.roles.filter((x) => x !== k))} />{l}</label>)}
              <label className="row small" style={{ flexWrap: 'nowrap' }}><input type="checkbox" style={{ width: 20, minHeight: 20 }} checked={r.require_note} onChange={(e) => setR(i, 'require_note', e.target.checked)} />Wajib catatan</label>
              <label className="row small" style={{ flexWrap: 'nowrap' }}><input type="checkbox" style={{ width: 20, minHeight: 20 }} checked={r.require_approval} onChange={(e) => setR(i, 'require_approval', e.target.checked)} />Perlu persetujuan</label>
              <button className="sm ghost danger" onClick={() => setSt({ ...st, rules: st.rules.filter((_, j) => j !== i) })}>Hapus</button>
            </div>
            <span className="small muted">{r.from === '' ? 'Dari mana pun' : lbl(r.from)} → {r.to === '' ? '…' : lbl(r.to)}{r.roles.length ? ` · hanya ${r.roles.map((x) => ROLES[x]?.name).join(', ')} (dan pemilik)` : ' · semua peran'}</span>
          </div>
        ))}
        <button className="sm" onClick={() => setSt({ ...st, rules: [...st.rules, { from: '', to: '', roles: [], require_note: false, require_approval: false }] })}>+ Aturan</button>
      </section>
      <section className="panel">
        <h3>Peran di bisnis ini</h3>
        <div className="list">
          <div className="li"><span className="small"><b>Pemilik</b> · semua, termasuk Business Builder, laporan, persetujuan, aktivasi</span></div>
          <div className="li"><span className="small"><b>Pengelola</b> · catatan, laporan, Business Builder (tidak bisa mengaktifkan/karyawan/langganan)</span></div>
          <div className="li"><span className="small"><b>Petugas proses</b> · mencatat & memindahkan status sesuai aturan di atas; tidak melihat laporan & field yang disembunyikan</span></div>
        </div>
        <Link href="/karyawan" className="small">Undang karyawan →</Link>
      </section>
      <button className="cta" disabled={busy} onClick={save}>{busy ? 'Menyimpan…' : `Simpan alur ${o.name}`}</button>
    </>
  );
}

function ReportStep({ kosId, cfg, onSaved }) {
  const [edit, setEdit] = useState(null);
  const del = async (r) => { if (!confirm(`Hapus laporan "${r.name}"?`)) return; if (await run(() => supabase.rpc('bb_report_save', { p_kos: kosId, p_id: r.id, p: { delete: true } }), 'Laporan dihapus', errMsg)) onSaved(); };
  const desc = (r) => { const o = cfg.objects.find((x) => x.id === r.object_id); const f = cfg.fields.find((x) => x.object_id === r.object_id && x.key === r.field_key);
    const g = r.group_by === 'status' ? 'per status' : r.group_by === 'month' ? 'per bulan' : r.group_by === 'day' ? 'per hari' : r.group_by === 'none' ? 'total' : `per ${cfg.fields.find((x) => x.object_id === r.object_id && 'field:' + x.key === r.group_by)?.label || '?'}`;
    return `${o?.name || '?'} · ${r.metric === 'count' ? 'jumlah' : (r.metric === 'sum' ? 'total ' : 'rata-rata ') + (f?.label || '?')} ${g}${r.period_days ? ` · ${r.period_days} hari terakhir` : ''}`; };
  return (
    <>
      <span className="small muted">Laporan dihitung server dari catatan (bukan rumus bebas): jumlah catatan, total atau rata-rata field angka/uang, dikelompokkan per status, bulan, hari, atau field.</span>
      <section className="panel"><div className="list">{cfg.reports.map((r) => (
        <div className="li" key={r.id}><button className="li click" onClick={() => setEdit(r)} style={{ background: 'none', border: 0, padding: 0, textAlign: 'left', font: 'inherit', color: 'inherit', flex: 1 }}><div className="main"><b className="small">{r.name}</b><span className="small muted">{desc(r)}</span></div></button>
          <button className="sm ghost danger" onClick={() => del(r)}>Hapus</button></div>))}
        {cfg.reports.length === 0 && <span className="small muted">Belum ada laporan.</span>}</div></section>
      <button className="primary" onClick={() => setEdit({})}>+ Laporan</button>
      <Link href="/laporan-kustom" className="small">Lihat hasil laporan →</Link>
      {edit && <ReportForm kosId={kosId} cfg={cfg} r={edit} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); onSaved(); }} />}
    </>
  );
}

function ReportForm({ kosId, cfg, r, onClose, onSaved }) {
  const objs = cfg.objects.filter((o) => o.active);
  const [p, setP] = useState({ name: r.name || '', object_id: r.object_id || objs[0]?.id || '', metric: r.metric || 'count', field_key: r.field_key || '', group_by: r.group_by || 'status', period_days: r.period_days ?? '', filter_status: r.filter_status || '' });
  const [busy, setBusy] = useState(false);
  const fs = fieldsOf(cfg, p.object_id);
  const nums = fs.filter((f) => ['number', 'currency'].includes(f.type));
  const groups = fs.filter((f) => ['select', 'boolean', 'text', 'reference'].includes(f.type));
  const o = objs.find((x) => x.id === p.object_id);
  const save = async () => {
    setBusy(true);
    const ok = await run(() => supabase.rpc('bb_report_save', { p_kos: kosId, p_id: r.id || null, p: { ...p, period_days: p.period_days === '' ? null : p.period_days, filter_status: p.filter_status || null } }), 'Laporan disimpan', errMsg);
    setBusy(false);
    if (ok) onSaved();
  };
  return (
    <Sheet title={r.id ? `Ubah ${r.name}` : 'Laporan baru'} onClose={onClose}>
      <Field label="Nama laporan"><input value={p.name} maxLength={60} onChange={(e) => setP({ ...p, name: e.target.value })} placeholder="mis. Pendapatan jasa per bulan" /></Field>
      <Field label="Dari jenis data"><select value={p.object_id} onChange={(e) => setP({ ...p, object_id: e.target.value, field_key: '', group_by: 'status', filter_status: '' })}>{objs.map((x) => <option key={x.id} value={x.id}>{x.icon} {x.name}</option>)}</select></Field>
      <div className="row">
        <Field label="Metrik"><select value={p.metric} onChange={(e) => setP({ ...p, metric: e.target.value })}><option value="count">Jumlah catatan</option><option value="sum" disabled={!nums.length}>Total</option><option value="avg" disabled={!nums.length}>Rata-rata</option></select></Field>
        {p.metric !== 'count' && <Field label="Dari field"><select value={p.field_key} onChange={(e) => setP({ ...p, field_key: e.target.value })}><option value="">— pilih —</option>{nums.map((f) => <option key={f.key} value={f.key}>{f.label}</option>)}</select></Field>}
      </div>
      <Field label="Kelompokkan"><select value={p.group_by} onChange={(e) => setP({ ...p, group_by: e.target.value })}>
        {o?.workflow && <option value="status">Per status</option>}<option value="month">Per bulan</option><option value="day">Per hari</option><option value="none">Total saja</option>
        {groups.map((f) => <option key={f.key} value={'field:' + f.key}>Per {f.label}</option>)}</select></Field>
      <div className="row">
        <Field label="Periode bawaan (hari, opsional)" hint="kosong = semua; bisa diganti saat melihat"><input inputMode="numeric" value={p.period_days} onChange={(e) => setP({ ...p, period_days: e.target.value.replace(/\D/g, '') })} placeholder="mis. 30" /></Field>
        {o?.workflow && <Field label="Hanya status (opsional)"><select value={p.filter_status} onChange={(e) => setP({ ...p, filter_status: e.target.value })}><option value="">Semua status</option>{statusesOf(cfg, p.object_id).map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}</select></Field>}
      </div>
      <button className="cta" disabled={busy} onClick={save}>{busy ? 'Menyimpan…' : 'Simpan laporan'}</button>
    </Sheet>
  );
}

function Activate({ kos, cfg, onDone, go }) {
  const [v, setV] = useState(null);
  const [busy, setBusy] = useState(false);
  const check = () => { setV(null); supabase.rpc('bb_validate', { p_kos: kos.id }).then(({ data, error }) => (error ? toast(errMsg(error)) : setV(data))); };
  useEffect(() => { check(); }, [cfg]);
  const activate = async () => {
    if (!confirm('Aktifkan bisnis ini? Tim bisa mulai mencatat. Konfigurasi masih bisa diubah sesudahnya.')) return;
    setBusy(true);
    const ok = await run(() => supabase.rpc('bb_activate', { p_kos: kos.id }), 'Bisnis aktif! Mulai mencatat di menu Catatan.', errMsg);
    setBusy(false);
    if (ok) { onDone(); check(); }
  };
  if (!v) return <Loading />;
  const areaStep = (a) => (/alur|peran/.test(a) ? 'alur' : a === 'Laporan' ? 'laporan' : a === 'Profil' ? 'profil' : a === 'Paket' ? null : 'data');
  const menus = tabsFor({ ...kos, my_role: 'pemilik' }).map(([, l]) => l);
  return (
    <>
      <section className="panel">
        <h3>Pratinjau workspace</h3>
        <div className="list">
          <div className="li"><span className="small">Jenis data</span><b className="small">{cfg.objects.filter((o) => o.active).map((o) => `${o.icon} ${o.name}`).join(', ') || '—'}</b></div>
          <div className="li"><span className="small">Field aktif</span><b className="small">{v.summary.fields}</b></div>
          <div className="li"><span className="small">Status · aturan alur</span><b className="small">{v.summary.statuses} · {v.summary.rules}</b></div>
          <div className="li"><span className="small">Laporan</span><b className="small">{v.summary.reports}</b></div>
          <div className="li"><span className="small">Peran tersedia</span><b className="small">Pemilik, {v.summary.roles.map((r) => ROLES[r]?.name || r).join(', ')}</b></div>
          <div className="li"><span className="small">Menu</span><span className="small" style={{ textAlign: 'right' }}>{menus.join(' · ')}</span></div>
        </div>
      </section>
      <section className="panel">
        <div className="row between"><h3>Validasi</h3><button className="sm ghost" onClick={check}>Periksa ulang</button></div>
        {v.errors.length === 0 ? <div className="notice good">Tidak ada kesalahan. {v.warnings.length ? 'Ada saran di bawah (boleh diabaikan).' : ''}</div> : <span className="small" style={{ color: 'var(--bad)' }}>{v.errors.length} masalah harus diperbaiki sebelum aktif:</span>}
        <div className="list">{[...v.errors.map((x) => ['bad', x]), ...v.warnings.map((x) => ['gold', x])].map(([tone, x], i) => (
          <div className="li" key={i} style={{ alignItems: 'flex-start' }}>
            <div className="main"><b className="small">{x.area}: {x.masalah}</b><span className="small muted">Solusi: {x.solusi}</span></div>
            <div className="stack" style={{ gap: 4, alignItems: 'flex-end' }}><span className={'chip ' + tone}>{tone === 'bad' ? 'Wajib' : 'Saran'}</span>{areaStep(x.area) && <button className="sm ghost" onClick={() => go(areaStep(x.area))}>Perbaiki</button>}</div>
          </div>))}</div>
      </section>
      {v.status === 'aktif' ? <div className="notice good">Bisnis sudah aktif. <Link href="/catatan">Buka Catatan →</Link></div>
        : canArea(kos, 'team') ? <button className="cta" disabled={busy || !v.ok} onClick={activate}>{busy ? 'Mengaktifkan…' : v.ok ? 'Aktifkan bisnis' : 'Perbaiki masalah dulu'}</button>
        : <span className="small muted">Hanya pemilik yang bisa mengaktifkan.</span>}
      <span className="small muted">Batas Business Builder: tidak bisa mengubah struktur inti database, kode, keamanan, atau data bisnis lain; tidak ada rumus/kode bebas. Kebutuhan di luar itu: hubungi kami (pengembangan khusus).</span>
    </>
  );
}
