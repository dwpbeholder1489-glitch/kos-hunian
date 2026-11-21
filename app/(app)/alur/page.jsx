'use client';
// ALUR KERJA (Adaptive Business Experience Fase 4 — Process & Workflow Adaptation).
// Peta proses (dari data nyata), registry alur (standar & kustom), aturan bersyarat, template tahap,
// versi + pulihkan, dan saran alur. Semua aturan dicek di DATABASE; pemilik selalu dikecualikan dari aturan.
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { useKos } from '@/components/KosProvider';
import PageHelp from '@/components/PageHelp';
import { PageHeader } from '@/components/Page';
import { Sheet, Loading, Field, toast, run } from '@/components/ui';
import ProcessMap from '@/components/ProcessMap';
import FiturUpgrade from '@/components/FiturUpgrade';
import { errMsg, angka } from '@/lib/format';
import { ACTIONS, CONDS, OPS, KIND, RECO_KIND, condText, ruleText, tglJam } from '@/lib/workflow';

const TABS = [['proses', 'Peta proses'], ['alur', 'Alur'], ['saran', 'Saran'], ['riwayat', 'Riwayat']];

export default function Alur() {
  const { kosId } = useKos();
  const [tab, setTab] = useState('proses');
  const [d, setD] = useState(null);
  const [err, setErr] = useState(null);
  const [open, setOpen] = useState(null);

  useEffect(() => {
    try {
      const q = new URLSearchParams(window.location.search);
      if (TABS.some(([k]) => k === q.get('tab'))) setTab(q.get('tab'));
      if (q.get('w')) { setTab('alur'); setOpen(q.get('w')); }
    } catch {}
  }, []);
  const load = async () => {
    setErr(null);
    const [pm, reg, rec, his] = await Promise.all([
      supabase.rpc('process_map', { p_kos: kosId }), supabase.rpc('workflow_registry', { p_kos: kosId }),
      supabase.rpc('workflow_recommendations', { p_kos: kosId }), supabase.rpc('workflow_history', { p_kos: kosId })]);
    const e = pm.error || reg.error || rec.error || his.error;
    if (e) return setErr(errMsg(e));
    setD({ pm: pm.data || [], reg: reg.data || [], rec: rec.data || [], his: his.data || { versions: [], decisions: [] } });
  };
  useEffect(() => { load(); }, [kosId]); // eslint-disable-line react-hooks/exhaustive-deps

  const head = <PageHeader title="Alur kerja" help={<PageHelp page="alur" />}
    desc={<>Urutan kerja bisnis Anda, langkah yang sudah berjalan, dan aturan untuk karyawan. <b>Aturan tidak berlaku untuk pemilik.</b></>} />;
  if (err) return <div className="stack">{head}<div className="notice bad">{err}</div></div>;
  if (!d) return <div className="stack">{head}<Loading /></div>;

  return (
    <div className="stack">
      {head}
      <div className="seg bec-tabs" role="tablist" aria-label="Bagian Alur kerja">
        {TABS.map(([k, l]) => <button key={k} type="button" role="tab" aria-selected={tab === k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>
          {l}{k === 'saran' && d.rec.length > 0 ? ` (${d.rec.length})` : ''}</button>)}
      </div>
      {tab === 'proses' && <>
        <span className="small muted">Status tiap langkah dihitung dari data 90 hari terakhir. <b>Belum diatur</b> = tahapnya belum ada di alur pesanan Anda; <b>Fitur nonaktif</b> = modulnya belum dinyalakan. Ketuk langkah untuk membukanya.</span>
        <ProcessMap data={d.pm} />
      </>}
      {tab === 'alur' && <Registry list={d.reg} onOpen={setOpen} />}
      {tab === 'saran' && <Saran kosId={kosId} list={d.rec} onDone={load} onOpen={(w) => { setTab('alur'); setOpen(w); }} />}
      {tab === 'riwayat' && <Riwayat his={d.his} onOpen={(w) => { setTab('alur'); setOpen(w); }} />}
      {open && <Detail kosId={kosId} code={open} onClose={() => setOpen(null)} onChanged={load} />}
    </div>
  );
}

function Chain({ statuses, stats }) {
  return (
    <ol className="wf-chain">
      {statuses.map((s) => (
        <li key={s.k} className={(s.f ? 'fin ' : '') + (s.stage ? 'stg' : '')}>
          <span className="nm">{s.l}</span>
          <span className="n">{angka(s.n || 0)}{s.late > 0 && <em className="late"> · {s.late} lewat batas</em>}{stats?.[s.k]?.n >= 3 && <em> · ±{stats[s.k].hours < 1 ? '<1' : String(stats[s.k].hours).replace('.', ',')} jam</em>}</span>
        </li>
      ))}
    </ol>
  );
}

function Registry({ list, onOpen }) {
  if (!list.length) return <div className="notice">Belum ada alur aktif. Alur muncul setelah modulnya dinyalakan di Pusat Pengalaman.</div>;
  return (
    <div className="stack">
      <span className="small muted">Angka = data yang sedang berjalan, ditambah yang selesai/batal 90 hari terakhir. Ketuk alur untuk melihat detail, aturan, dan versinya.</span>
      {list.map((w) => {
        const k = KIND[w.kind] || KIND.standar;
        return (
          <button key={w.code} type="button" className="panel wf-card" onClick={() => onOpen(w.code)}>
            <div className="wf-card-h"><b>{w.name}</b><span className={'chip ' + k[1]}>{k[0]}</span></div>
            <span className="small muted">{w.description}</span>
            <Chain statuses={w.statuses} />
            <span className="small">{angka(w.open)} sedang berjalan{w.rules ? ` · ${w.rules} aturan aktif` : ''}{w.version ? ` · versi ${w.version}` : ''}</span>
          </button>
        );
      })}
    </div>
  );
}

function Detail({ kosId, code, onClose, onChanged }) {
  const [w, setW] = useState(null);
  const [err, setErr] = useState(null);
  const [edit, setEdit] = useState(null);
  const [tpl, setTpl] = useState(null);
  const [withRules, setWithRules] = useState(true);
  const [allTpl, setAllTpl] = useState(false);
  const load = async () => {
    const r = await supabase.rpc('workflow_detail', { p_kos: kosId, p_workflow: code });
    if (r.error) return setErr(errMsg(r.error));
    setW(r.data);
  };
  useEffect(() => { load(); }, [code]); // eslint-disable-line react-hooks/exhaustive-deps
  const changed = async () => { await load(); onChanged(); };
  const ruleable = w && (code === 'svc_order' || code.startsWith('bb:'));
  const toggle = async (r) => { if (await run(() => supabase.rpc('wf_rule_save', { p_kos: kosId, p: { ...r, active: !r.active } }), r.active ? 'Aturan dimatikan' : 'Aturan dinyalakan', errMsg)) changed(); };
  const del = async (r) => { if (confirm(`Hapus aturan "${r.name}"?`) && await run(() => supabase.rpc('wf_rule_save', { p_kos: kosId, p: { id: r.id, delete: true } }), 'Aturan dihapus', errMsg)) changed(); };
  const restore = async (v) => {
    if (!confirm(`Pulihkan alur ke versi ${v.version}? Tahap/status dan aturan dikembalikan seperti saat itu. Tahap yang tidak ada di versi itu dinonaktifkan (tidak dihapus).`)) return;
    if (await run(() => supabase.rpc('wf_restore', { p_kos: kosId, p_version: v.id }), `Dipulihkan ke versi ${v.version}`, errMsg)) changed();
  };
  const applyTpl = async () => {
    const { data, error } = await supabase.rpc('wf_template_apply', { p_kos: kosId, p_code: tpl.code, p_with_rules: withRules });
    if (error) return toast(errMsg(error));
    toast(`Alur "${tpl.name}" dipakai${data.rules_added ? ` + ${data.rules_added} aturan` : ''}${data.rules_skipped ? ` (${data.rules_skipped} aturan dilewati)` : ''}`);
    setTpl(null); changed();
  };

  return (
    <Sheet title={w?.name || 'Alur'} onClose={onClose}>
      {err && <div className="notice bad">{err}</div>}
      {!w && !err && <Loading rows={2} />}
      {w && <div className="stack">
        <span className="small muted">{w.description}</span>
        <section className="stack">
          <h3>Status saat ini</h3>
          <Chain statuses={w.statuses} stats={w.stage_stats} />
          {w.stage_stats && Object.values(w.stage_stats).some((x) => x.n >= 3) && <span className="small muted">± jam = rata-rata lama pesanan di tahap itu (60 hari terakhir, minimal 3 pesanan).</span>}
          {w.path && <Link className="small" href={w.path}>Buka {w.name.toLowerCase()} ›</Link>}
        </section>

        {code === 'svc_order' && <section className="stack">
          <h3>Tahap proses</h3>
          <span className="small muted">Ubah, tambah, atau urutkan tahap di menu {w.kuliner ? 'Menu & tahap' : 'Layanan & tahap'}. Atau pakai alur siap pakai di bawah — tahap dengan nama sama dipakai ulang, tahap lain dinonaktifkan (riwayat pesanan tetap utuh).</span>
          <Link className="small" href="/layanan#tahap">Ubah tahap ›</Link>
          <div className="wf-tpls">
            {(w.templates || []).filter((t) => allTpl || t.match || t.fit).map((t) => (
              <button key={t.code} type="button" className={'wf-tpl' + (tpl?.code === t.code ? ' on' : '')} onClick={() => setTpl(tpl?.code === t.code ? null : t)}>
                <span className="row between"><b>{t.name}</b>{t.match && <span className="chip good">Cocok</span>}</span>
                <small className="muted">{t.stages.join(' → ')}</small>
              </button>
            ))}
          </div>
          {(w.templates || []).some((t) => !t.match && !t.fit) && <button type="button" className="sm ghost" onClick={() => setAllTpl(!allTpl)}>{allTpl ? 'Tampilkan yang cocok saja' : 'Lihat semua template'}</button>}
          {tpl && <div className="notice">
            <b>Pakai alur "{tpl.name}"?</b> Tahap menjadi: {tpl.stages.join(' → ')}.
            {tpl.rules.length > 0 && <label className="row" style={{ gap: 8, marginTop: 8 }}><input type="checkbox" checked={withRules} onChange={(e) => setWithRules(e.target.checked)} />
              Sertakan aturan yang disarankan: {tpl.rules.map((r) => r.name).join('; ')}{!w.plan_persetujuan && tpl.rules.some((r) => r.action === 'persetujuan') ? ' (aturan persetujuan dilewati — mulai Paket Bisnis)' : ''}</label>}
            <div className="row" style={{ gap: 8, marginTop: 8 }}><button className="sm primary" onClick={applyTpl}>Pakai alur ini</button><button className="sm ghost" onClick={() => setTpl(null)}>Batal</button></div>
          </div>}
        </section>}
        {code.startsWith('bb:') && <section className="stack">
          <h3>Status & langkah</h3>
          <span className="small muted">Status, langkah yang diizinkan, peran, dan wajib catatan per langkah disusun di Business Builder. Aturan bersyarat di bawah tetap terikat pada status, jadi tidak hilang saat Builder disimpan.</span>
          <Link className="small" href="/builder">Atur di Builder ›</Link>
        </section>}

        {ruleable && <section className="stack">
          <div className="row between"><h3>Aturan bersyarat</h3>{!edit && <button className="sm" onClick={() => setEdit({})}>+ Aturan</button>}</div>
          <span className="small muted">Berlaku untuk karyawan. Pemilik tetap bisa mencatat apa pun yang benar-benar terjadi.</span>
          {!w.plan_persetujuan && <FiturUpgrade kosId={kosId} event="TRANSACTION.APPROVAL_REQUESTED" title="Aturan yang meminta persetujuan tersedia mulai Paket Bisnis"
            text='Aturan "tidak diizinkan" dan "wajib catatan" bisa dipakai di paket ini.' />}
          {edit && <RuleForm kosId={kosId} w={w} code={code} init={edit} onCancel={() => setEdit(null)} onSaved={() => { setEdit(null); changed(); }} />}
          {(w.rules_list || []).length === 0 && !edit && <span className="small muted">Belum ada aturan.</span>}
          {(w.rules_list || []).map((r) => (
            <div key={r.id} className={'wf-rule' + (r.active ? '' : ' off')}>
              <div className="row between"><b>{r.name}</b><span className={'chip ' + (r.active ? 'good' : 'void')}>{r.active ? 'Aktif' : 'Mati'}</span></div>
              <span className="small">{ruleText(r, w.points, w.fields)}</span>
              {r.message && <span className="small muted">Pesan: “{r.message}”</span>}
              <div className="row" style={{ gap: 6 }}>
                <button className="sm ghost" onClick={() => toggle(r)}>{r.active ? 'Matikan' : 'Nyalakan'}</button>
                <button className="sm ghost" onClick={() => setEdit(r)}>Ubah</button>
                <button className="sm ghost" onClick={() => del(r)}>Hapus</button>
              </div>
            </div>
          ))}
        </section>}

        {(w.approvals || []).length > 0 && <section className="stack">
          <h3>Persetujuan di alur ini</h3>
          {w.approvals.map((a) => <div key={a.code} className="row between small"><span>{a.label}</span>
            <span className={'chip ' + (a.by_rule ? 'info' : a.required ? 'gold' : 'void')}>{a.by_rule ? 'Lewat aturan' : a.required ? 'Wajib' : 'Tidak wajib'}</span></div>)}
          <Link className="small" href="/persetujuan">Atur di Persetujuan ›</Link>
        </section>}
        {(w.recent_approvals || []).length > 0 && <section className="stack">
          <h3>Permintaan persetujuan terakhir</h3>
          {w.recent_approvals.map((a) => <div key={a.number} className="small wf-line"><span>{a.number} · {a.summary}</span><span className="muted">{a.status} · {tglJam(a.at)}</span></div>)}
        </section>}
        {!ruleable && <div className="notice">Alur ini mengikuti aturan bawaan PRASARA agar stok, kas, dan pembukuan tetap benar. Yang bisa Anda atur: persetujuan untuk tindakan berisiko (menu Persetujuan).</div>}

        {(w.versions || []).length > 0 && <section className="stack">
          <h3>Versi alur</h3>
          {w.versions.map((v, i) => <div key={v.id} className="wf-line small">
            <span><b>v{v.version}</b> · {v.reason} <span className="muted">({v.size} {code === 'svc_order' ? 'tahap' : 'status'}, {v.rules} aturan)</span></span>
            <span className="row" style={{ gap: 6 }}><span className="muted">{tglJam(v.at)}{v.actor && v.actor !== 'sistem' ? ` · ${v.actor}` : ''}</span>
              {i > 0 && <button className="sm ghost" onClick={() => restore(v)}>Pulihkan</button>}</span>
          </div>)}
        </section>}
      </div>}
    </Sheet>
  );
}

function RuleForm({ kosId, w, code, init, onCancel, onSaved }) {
  const points = w.points || [];
  const [f, setF] = useState(() => ({
    id: init.id || null, point: init.point || points[0]?.code || '', name: init.name || '', action: init.action || '',
    message: init.message || '', active: init.active ?? true, cond: { ...(init.cond || {}) },
  }));
  const pt = points.find((p) => String(p.code) === String(f.point)) || points[0];
  const has = (k) => pt?.conds?.includes(k);
  const set = (k, v) => setF((s) => ({ ...s, [k]: v }));
  const setC = (k, v) => setF((s) => { const c = { ...s.cond }; if (v === undefined || v === '' || v === null) delete c[k]; else c[k] = v; return { ...s, cond: c }; });
  const fields = f.cond.fields || [];
  const setField = (i, patch) => setC('fields', fields.map((x, j) => (j === i ? { ...x, ...patch } : x)));
  const action = pt?.actions?.includes(f.action) ? f.action : pt?.actions?.[0];
  const save = async () => {
    const cond = Object.fromEntries(Object.entries(f.cond).filter(([k]) => has(k)));
    if (cond.fields) cond.fields = cond.fields.filter((x) => x.key);
    if (cond.fields && !cond.fields.length) delete cond.fields;
    const p = { id: f.id, workflow: code, point: f.point || pt?.code, name: f.name, action, message: f.message, active: f.active, cond };
    if (await run(() => supabase.rpc('wf_rule_save', { p_kos: kosId, p }), 'Aturan disimpan', errMsg)) onSaved();
  };
  const preview = condText(Object.fromEntries(Object.entries(f.cond).filter(([k]) => has(k))), w.fields || []);
  return (
    <div className="panel stack wf-form">
      <Field label="Langkah yang diatur">
        <select value={f.point} onChange={(e) => set('point', e.target.value)}>{points.map((p) => <option key={p.code} value={p.code}>{p.label}</option>)}</select>
      </Field>
      <div className="stack">
        <span className="label">Syarat (opsional — kosong = selalu)</span>
        {has('belum_lunas') && <label className="row" style={{ gap: 8 }}><input type="checkbox" checked={!!f.cond.belum_lunas} onChange={(e) => setC('belum_lunas', e.target.checked || undefined)} /> {CONDS.belum_lunas}</label>}
        {has('sudah_bayar') && <label className="row" style={{ gap: 8 }}><input type="checkbox" checked={!!f.cond.sudah_bayar} onChange={(e) => setC('sudah_bayar', e.target.checked || undefined)} /> {CONDS.sudah_bayar}</label>}
        {(has('total_min') || has('total_max')) && <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
          {has('total_min') && <Field label="Total minimal (Rp)"><input inputMode="numeric" value={f.cond.total_min ?? ''} onChange={(e) => setC('total_min', e.target.value.replace(/\D/g, '') === '' ? undefined : Number(e.target.value.replace(/\D/g, '')))} /></Field>}
          {has('total_max') && <Field label="Total maksimal (Rp)"><input inputMode="numeric" value={f.cond.total_max ?? ''} onChange={(e) => setC('total_max', e.target.value.replace(/\D/g, '') === '' ? undefined : Number(e.target.value.replace(/\D/g, '')))} /></Field>}
        </div>}
        {has('antar') && <Field label={CONDS.antar}>
          <select value={f.cond.antar === true ? 'ya' : f.cond.antar === false ? 'tidak' : ''} onChange={(e) => setC('antar', e.target.value === '' ? undefined : e.target.value === 'ya')}>
            <option value="">Diantar atau diambil</option><option value="ya">Hanya yang diantar</option><option value="tidak">Hanya yang diambil sendiri</option></select>
        </Field>}
        {has('fields') && <div className="stack">
          {fields.map((x, i) => {
            const fl = (w.fields || []).find((y) => y.key === x.key);
            const num = fl && ['number', 'currency'].includes(fl.type);
            return <div key={i} className="wf-cond">
              <select value={x.key} onChange={(e) => setField(i, { key: e.target.value })}><option value="">Pilih isian</option>{(w.fields || []).map((y) => <option key={y.key} value={y.key}>{y.label}</option>)}</select>
              <select value={x.op} onChange={(e) => setField(i, { op: e.target.value })}>{OPS.filter(([k]) => num || !['<', '<=', '>', '>='].includes(k)).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
              {!['isi', 'kosong'].includes(x.op) && <input value={x.value ?? ''} inputMode={num ? 'numeric' : 'text'} placeholder="nilai" onChange={(e) => setField(i, { value: num ? (e.target.value.replace(/[^\d.]/g, '') === '' ? '' : Number(e.target.value.replace(/[^\d.]/g, ''))) : e.target.value })} />}
              <button type="button" className="sm ghost" onClick={() => setC('fields', fields.filter((_, j) => j !== i))}>Hapus syarat</button>
            </div>;
          })}
          {fields.length < 5 && <button type="button" className="sm ghost" onClick={() => setC('fields', [...fields, { key: '', op: (w.fields || [])[0] && ['number', 'currency'].includes(w.fields[0].type) ? '<' : 'isi', value: '' }])}>+ Syarat isian</button>}
        </div>}
      </div>
      <Field label="Maka">
        <select value={action} onChange={(e) => set('action', e.target.value)}>{(pt?.actions || []).map((a) => <option key={a} value={a}>{ACTIONS[a][0]}</option>)}</select>
      </Field>
      <span className="small muted">{ACTIONS[action]?.[1]}</span>
      <Field label="Nama aturan"><input value={f.name} maxLength={60} placeholder={code === 'svc_order' ? 'mis. Wajib lunas sebelum diserahkan' : 'mis. Progres harus 100 sebelum selesai'} onChange={(e) => set('name', e.target.value)} /></Field>
      <Field label="Pesan untuk karyawan (opsional)"><input value={f.message} maxLength={200} placeholder="mis. Hubungi pemilik sebelum menyerahkan" onChange={(e) => set('message', e.target.value)} /></Field>
      <div className="notice small">Bila {(pt?.label || '').toLowerCase()}{preview.length ? ` dan ${preview.join(', ')}` : ''} → <b>{(ACTIONS[action] || [''])[0].toLowerCase()}</b>.</div>
      <div className="row" style={{ gap: 8 }}><button className="primary" onClick={save}>Simpan aturan</button><button className="ghost" onClick={onCancel}>Batal</button></div>
    </div>
  );
}

function Saran({ kosId, list, onDone, onOpen }) {
  const [busy, setBusy] = useState(null);
  const decide = async (r, dec) => {
    if (dec === 'terima' && !confirm(`${r.action.label || 'Terapkan'}: ${r.title}?`)) return;
    setBusy(r.code);
    const ok = await run(() => supabase.rpc('workflow_reco_decide', { p_kos: kosId, p_code: r.code, p_decision: dec, p_note: null, p_days: 30 }),
      dec === 'terima' ? 'Diterapkan' : dec === 'tunda' ? 'Ditunda 30 hari' : 'Saran ditolak — tidak muncul lagi selama kondisinya sama', errMsg);
    setBusy(null);
    if (ok) onDone();
  };
  if (!list.length) return <div className="notice">Belum ada saran. Saran muncul dari data nyata (mis. tahap yang sering dilewati, tahap paling lama, langkah yang belum dipakai) — tidak pernah diterapkan tanpa persetujuan Anda.</div>;
  return (
    <div className="stack">
      {list.map((r) => {
        const a = r.action || {};
        const applies = ['template', 'stage', 'rule'].includes(a.type);
        return (
          <section key={r.code} className="panel stack">
            <div className="row between"><b>{r.title}</b><span className="chip info">{RECO_KIND[r.kind] || r.kind}</span></div>
            <span className="small">{r.reason}</span>
            {a.needs_plan && <span className="small muted">Aturan persetujuan tersedia mulai Paket Bisnis.</span>}
            <div className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
              {applies && <button className="sm primary" disabled={busy === r.code || a.needs_plan} onClick={() => decide(r, 'terima')}>{a.label || 'Terapkan'}</button>}
              {a.type === 'open' && <button className="sm" onClick={() => onOpen(a.workflow)}>{a.label || 'Lihat'}</button>}
              {a.type === 'link' && <Link href={a.path}><button className="sm">{a.label || 'Buka'}</button></Link>}
              <button className="sm ghost" disabled={busy === r.code} onClick={() => decide(r, 'tunda')}>Nanti</button>
              <button className="sm ghost" disabled={busy === r.code} onClick={() => decide(r, 'tolak')}>Tidak perlu</button>
            </div>
          </section>
        );
      })}
    </div>
  );
}

const DEC = { diterima: 'Diterapkan', ditolak: 'Ditolak', ditunda: 'Ditunda' };
function Riwayat({ his, onOpen }) {
  return (
    <div className="stack">
      <section className="panel stack">
        <h3>Perubahan alur</h3>
        {his.versions.length === 0 && <span className="small muted">Belum ada perubahan. Versi pertama disimpan otomatis sebelum perubahan pertama, sehingga keadaan semula selalu bisa dipulihkan.</span>}
        {his.versions.map((v) => <button key={v.id} type="button" className="wf-line small" onClick={() => onOpen(v.workflow)}>
          <span><b>{v.name}</b> v{v.version} · {v.reason}</span><span className="muted">{tglJam(v.at)}{v.actor && v.actor !== 'sistem' ? ` · ${v.actor}` : ''}</span></button>)}
      </section>
      {his.decisions.length > 0 && <section className="panel stack">
        <h3>Keputusan atas saran</h3>
        {his.decisions.map((x) => <div key={x.code} className="wf-line small"><span><b>{x.title || 'Saran'}</b> · {DEC[x.decision] || x.decision}{x.until ? ` sampai ${x.until}` : ''}</span><span className="muted">{tglJam(x.at)}{x.by ? ` · ${x.by}` : ''}</span></div>)}
      </section>}
    </div>
  );
}
