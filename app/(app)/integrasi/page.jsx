'use client';
// INTEGRASI (Adaptive Experience Fase 6). Registry konektor + sambungan webhook masuk per bisnis + riwayat kiriman.
// Semua aturan (kode, jeda, batas, validasi, duplikat) dicek di DATABASE (hook_inbound / integ_*); halaman ini hanya mengatur & menampilkan.
// Kode sambungan hanya dilihat SEKALI saat dibuat/diganti — tidak disimpan di perangkat maupun database (hanya hash).
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { useKos } from '@/components/KosProvider';
import PageHelp from '@/components/PageHelp';
import { PageHeader } from '@/components/Page';
import { Sheet, Loading, Empty, Field, toast, run } from '@/components/ui';
import { isDraft, canArea } from '@/lib/business';
import FiturUpgrade from '@/components/FiturUpgrade';
import { errMsg } from '@/lib/format';
import { tglJam } from '@/lib/workflow';

const TABS = [['sambungan', 'Sambungan'], ['riwayat', 'Riwayat kiriman']];
const OUT = {
  ok: ['Masuk jadi prospek', 'good'], duplikat: ['Kiriman ulang — diabaikan', 'void'], tidak_valid: ['Ditolak — isi kurang tepat', 'bad'],
  dibatasi: ['Ditolak — terlalu banyak kiriman', 'bad'], dijeda: ['Ditolak — sambungan dijeda', 'void'], nonaktif: ['Ditolak — bisnis, fitur, atau paket tidak aktif', 'bad'], galat: ['Gangguan sistem', 'bad'],
};
const FIELDS = [['name', 'Nama', 'name / nama'], ['phone', 'Telepon / WhatsApp', 'phone / telepon / hp'], ['message', 'Pesan / kebutuhan', 'message / pesan'], ['email', 'Email', 'email']];
const SAMPLE = { name: 'Contoh Uji PRASARA', phone: '081200000000', message: 'Kiriman contoh dari halaman Integrasi — boleh dibatalkan di Prospek.' };

export default function Integrasi() {
  const { kos, kosId, ver } = useKos();
  const [tab, setTab] = useState('sambungan');
  const [d, setD] = useState(null);
  const [logs, setLogs] = useState(null);
  const [filter, setFilter] = useState('');
  const [err, setErr] = useState(null);
  const [form, setForm] = useState(null);       // null | {} (baru) | sambungan (ubah)
  const [secret, setSecret] = useState(null);   // { name, token, baru } — satu-satunya saat kode asli terlihat
  const ro = Boolean(kos?.closed_at);
  const draft = isDraft(kos);

  const load = async () => {
    setErr(null);
    const { data, error } = await supabase.rpc('integ_overview', { p_kos: kosId });
    if (error) return setErr(errMsg(error));
    setD(data);
  };
  const loadLogs = async () => {
    const { data, error } = await supabase.rpc('integ_logs', { p_kos: kosId, p_conn: filter || null, p_limit: 100 });
    if (error) return setErr(errMsg(error));
    setLogs(data || []);
  };
  useEffect(() => { load(); }, [kosId, ver]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (tab === 'riwayat') loadLogs(); }, [tab, filter, kosId, ver]); // eslint-disable-line react-hooks/exhaustive-deps

  const head = <PageHeader title="Integrasi" help={<PageHelp page="integrasi" />}
    desc={<>Sambungkan formulir website atau aplikasi lain ke PRASARA. Setiap kiriman masuk sebagai <b>Prospek</b>. Hanya pemilik & pengelola.</>} />;
  if (err) return <div className="stack">{head}<div className="notice bad">{err}</div></div>;
  if (!d) return <div className="stack">{head}<Loading /></div>;

  const planned = d.catalog.filter((c) => c.impl_status === 'planned');
  const pro = d.allowed !== false;   // Integrasi = Paket Pro (keputusan pemilik 21 Nov 2026); diputuskan server
  const canCreate = pro && !ro && !draft && d.crm_on && d.connections.length < d.limits.maks_sambungan;

  const toggle = async (c) => {
    const to = c.status !== 'aktif';
    if (!to && !window.confirm(`Jeda "${c.name}"?\nKiriman baru ditolak sampai Anda mengaktifkannya lagi. Prospek yang sudah masuk tetap ada.`)) return;
    if (await run(() => supabase.rpc('integ_set_status', { p_conn: c.id, p_active: to }), to ? 'Sambungan aktif lagi' : 'Sambungan dijeda', errMsg)) load();
  };
  const rotate = async (c) => {
    if (!window.confirm(`Buat kode baru untuk "${c.name}"?\nAlamat lama LANGSUNG berhenti bekerja — aplikasi yang memakainya harus diganti ke alamat baru.`)) return;
    const { data, error } = await supabase.rpc('integ_rotate', { p_conn: c.id });
    if (error) return toast(errMsg(error));
    setSecret({ name: c.name, token: data.token, baru: false });
    load();
  };
  const remove = async (c) => {
    if (!window.confirm(`Hapus sambungan "${c.name}"?\nAlamatnya langsung berhenti bekerja. Prospek yang sudah masuk tetap ada; riwayat kiriman tetap tersimpan sampai 60 hari.`)) return;
    if (await run(() => supabase.rpc('integ_delete', { p_conn: c.id }), 'Sambungan dihapus', errMsg)) load();
  };

  return (
    <div className="stack">
      {head}
      {ro && <div className="notice small">Bisnis ini sudah ditutup (arsip hanya-baca) — sambungan tidak bisa diubah.</div>}
      {draft && <div className="notice small">Bisnis ini masih draf. Aktifkan dulu di <Link href="/konfirmasi" style={{ textDecoration: 'underline' }}>Pusat Konfirmasi</Link> sebelum membuat sambungan.</div>}
      {!d.crm_on && !draft && !ro && <div className="notice small">Kiriman dari luar masuk sebagai Prospek, jadi modul <b>Prospek & tindak lanjut (CRM)</b> harus aktif. Nyalakan di <Link href="/konfigurasi" style={{ textDecoration: 'underline' }}>Konfigurasi › Modul</Link>.</div>}

      {!pro && <FiturUpgrade kosId={kosId} owner={canArea(kos, 'team')} plan="pro" event="INTEGRATION.REQUESTED" title="Integrasi tersedia di Paket Pro"
        text={d.connections.length ? 'Kiriman ke sambungan yang ada sedang ditolak karena paket bisnis ini bukan Pro. Sambungan tetap bisa dijeda, diubah namanya, atau dihapus; riwayat tetap bisa dilihat.' : 'Sambungkan formulir website, Zapier, Make, n8n, Apps Script, atau bot Anda — setiap kiriman otomatis masuk menu Prospek.'} />}
      <div className="seg bec-tabs" role="tablist" aria-label="Bagian Integrasi">
        {TABS.map(([k, l]) => <button key={k} type="button" role="tab" aria-selected={tab === k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>{l}</button>)}
      </div>

      {tab === 'sambungan' && <>
        <div className="row between">
          <b>Prospek masuk (webhook)</b>
          <button className="sm primary" disabled={!canCreate} onClick={() => setForm({})}>+ Sambungan baru</button>
        </div>
        {d.connections.length === 0 ? (
          <Empty title="Belum ada sambungan" text="Buat satu sambungan, lalu tempel alamatnya di formulir website atau aplikasi otomasi Anda. Kiriman yang masuk muncul di menu Prospek." />
        ) : d.connections.map((c) => (
          <div key={c.id} className="panel stack">
            <div className="row between" style={{ alignItems: 'flex-start' }}>
              <div className="stack" style={{ gap: 2, minWidth: 0 }}>
                <b style={{ overflowWrap: 'anywhere' }}>{c.name}</b>
                <span className="small muted">Kode berakhiran <b>••••{c.hint}</b>{c.rotated_at ? ` · diganti ${tglJam(c.rotated_at)}` : ` · dibuat ${tglJam(c.created_at)}`}</span>
              </div>
              <span className={'chip ' + (c.status === 'aktif' ? 'good' : 'void')}>{c.status === 'aktif' ? 'Aktif' : 'Dijeda'}</span>
            </div>
            <span className="small">{c.last_used_at ? <>Terakhir dipakai <b>{tglJam(c.last_used_at)}</b></> : <span className="muted">Belum pernah dipakai</span>}
              {' · '}7 hari: <b>{c.d7.ok}</b> masuk{c.d7.duplikat > 0 ? ` · ${c.d7.duplikat} ulang` : ''}{c.d7.gagal > 0 ? ` · ${c.d7.gagal} ditolak` : ''}</span>
            {Object.keys(c.mapping || {}).length > 0 && (
              <span className="small muted" style={{ overflowWrap: 'anywhere' }}>Nama kolom khusus: {FIELDS.filter(([k]) => c.mapping[k]).map(([k, l]) => `${l} = ${c.mapping[k]}`).join(' · ')}</span>
            )}
            {c.last_problem && (
              <div className="notice small" style={{ overflowWrap: 'anywhere' }}>Kiriman terakhir yang ditolak ({tglJam(c.last_problem.at)}): {(OUT[c.last_problem.outcome] || [c.last_problem.outcome])[0]}
                {c.last_problem.detail ? <><br />{c.last_problem.detail}</> : null}</div>
            )}
            <div className="row" style={{ flexWrap: 'wrap', gap: 6 }}>
              <button className="sm ghost" disabled={ro} onClick={() => setForm(c)}>Ubah</button>
              <button className="sm ghost" disabled={ro || (!pro && c.status !== 'aktif')} onClick={() => toggle(c)}>{c.status === 'aktif' ? 'Jeda' : 'Aktifkan'}</button>
              <button className="sm ghost" disabled={ro || !pro} onClick={() => rotate(c)}>Kode baru</button>
              <button className="sm ghost danger" disabled={ro} onClick={() => remove(c)}>Hapus</button>
              <button className="sm ghost" onClick={() => { setFilter(c.id); setTab('riwayat'); }}>Riwayat</button>
            </div>
          </div>
        ))}
        <span className="small muted">Batas: maks. {d.limits.maks_sambungan} sambungan per bisnis; tiap sambungan maks. {d.limits.per_jam} kiriman per jam dan {d.limits.per_hari} prospek per hari. Prospek baru muncul di menu <Link href="/crm" style={{ textDecoration: 'underline' }}>Prospek</Link> dan pengingat di Beranda — tidak ada email otomatis.</span>

        {planned.length > 0 && <>
          <b style={{ marginTop: 8 }}>Konektor lain</b>
          <span className="small muted">Belum tersedia. Ditampilkan apa adanya beserta syaratnya — tidak ada yang berpura-pura aktif.</span>
          {planned.map((c) => (
            <div key={c.code} className="panel stack" style={{ gap: 4 }}>
              <div className="row between" style={{ alignItems: 'flex-start' }}><b>{c.name}</b><span className="chip void">Dalam rencana</span></div>
              <span className="small">{c.description}</span>
              {c.needs && <span className="small muted">Syarat: {c.needs}</span>}
            </div>
          ))}
        </>}
      </>}

      {tab === 'riwayat' && <>
        <Field label="Sambungan">
          <select value={filter} onChange={(e) => setFilter(e.target.value)}>
            <option value="">Semua sambungan</option>
            {d.connections.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </Field>
        {!logs ? <Loading /> : logs.length === 0 ? (
          <Empty title="Belum ada kiriman" text="Riwayat muncul setelah ada kiriman masuk — berhasil maupun ditolak. Disimpan 60 hari. Isi data pelanggan tidak disalin ke riwayat." />
        ) : logs.map((l, i) => (
          <div key={i} className="panel stack" style={{ gap: 4 }}>
            <div className="row between" style={{ alignItems: 'flex-start' }}>
              <span className={'chip ' + (OUT[l.outcome]?.[1] || 'void')}>{OUT[l.outcome]?.[0] || l.outcome}</span>
              <span className="small muted">{tglJam(l.at)}</span>
            </div>
            <span className="small" style={{ overflowWrap: 'anywhere' }}>{l.sambungan ? <b>{l.sambungan}</b> : <span className="muted">(sambungan sudah dihapus)</span>}{l.ref ? <> · prospek <b>{l.ref}</b></> : null}</span>
            {l.detail && <span className="small muted" style={{ overflowWrap: 'anywhere' }}>{l.detail}</span>}
          </div>
        ))}
      </>}

      {form && <ConnForm conn={form.id ? form : null} kosId={kosId} onClose={() => setForm(null)} onDone={(s) => { setForm(null); if (s) setSecret({ ...s, baru: true }); load(); }} />}
      {secret && <SecretSheet s={secret} onClose={() => { setSecret(null); load(); }} />}
    </div>
  );
}

function ConnForm({ conn, kosId, onClose, onDone }) {
  const [name, setName] = useState(conn?.name || '');
  const [m, setM] = useState({ name: conn?.mapping?.name || '', phone: conn?.mapping?.phone || '', message: conn?.mapping?.message || '', email: conn?.mapping?.email || '' });
  const [busy, setBusy] = useState(false);
  const save = async () => {
    const mapping = Object.fromEntries(Object.entries(m).map(([k, v]) => [k, v.trim()]).filter(([, v]) => v));
    setBusy(true);
    if (conn) {
      const ok = await run(() => supabase.rpc('integ_update', { p_conn: conn.id, p_name: name, p_mapping: mapping }), 'Disimpan', errMsg);
      setBusy(false);
      if (ok) onDone(null);
      return;
    }
    const { data, error } = await supabase.rpc('integ_create', { p_kos: kosId, p_kind: 'webhook_masuk', p_name: name, p_mapping: mapping });
    setBusy(false);
    if (error) return toast(errMsg(error));
    onDone({ name: name.trim(), token: data.token });
  };
  return (
    <Sheet title={conn ? 'Ubah sambungan' : 'Sambungan baru'} onClose={onClose}>
      <Field label="Nama sambungan" hint='Pengingat untuk Anda, mis. "Formulir website" atau "Bot WhatsApp".'>
        <input value={name} maxLength={60} onChange={(e) => setName(e.target.value)} autoFocus />
      </Field>
      <details>
        <summary className="small" style={{ cursor: 'pointer', fontWeight: 700 }}>Nama kolom khusus (opsional)</summary>
        <div className="stack" style={{ marginTop: 8 }}>
          <span className="small muted">PRASARA otomatis mengenali nama kolom umum. Isi hanya bila aplikasi Anda memakai nama lain — boleh bersarang, mis. <b>kontak.wa</b>.</span>
          {FIELDS.map(([k, l, ph]) => (
            <Field key={k} label={l}><input value={m[k]} maxLength={40} placeholder={`otomatis: ${ph}`} onChange={(e) => setM({ ...m, [k]: e.target.value })} /></Field>
          ))}
        </div>
      </details>
      <button className="primary" disabled={busy || name.trim().length < 2} onClick={save}>{busy ? 'Menyimpan…' : conn ? 'Simpan' : 'Buat sambungan'}</button>
    </Sheet>
  );
}

// Kode asli hanya tampil di sini, sekali. Tidak disimpan di perangkat.
function SecretSheet({ s, onClose }) {
  const url = `${typeof window === 'undefined' ? '' : window.location.origin}/api/hook/${s.token}`;
  const [sending, setSending] = useState(false);
  const [res, setRes] = useState(null);
  const copy = async () => { try { await navigator.clipboard.writeText(url); toast('Alamat disalin'); } catch { window.prompt('Salin alamat ini:', url); } };
  const test = async () => {
    setSending(true); setRes(null);
    try {
      const r = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(SAMPLE) });
      const j = await r.json().catch(() => ({}));
      setRes(r.ok && j.ok
        ? { ok: true, text: j.duplicate ? `Contoh yang sama baru saja masuk (nomor ${j.number}). Cek di Prospek.` : `Berhasil — prospek ${j.number} masuk. Cek di menu Prospek; boleh Anda batalkan.` }
        : { ok: false, text: j.error || `Ditolak (kode ${r.status}).` });
    } catch { setRes({ ok: false, text: 'Tidak bisa menghubungi server. Periksa sambungan internet.' }); }
    setSending(false);
  };
  const curl = `curl -X POST "${url}" \\\n  -H "Content-Type: application/json" \\\n  -d '{"name":"Budi","phone":"081234567890","message":"Tanya harga grosir"}'`;
  return (
    <Sheet title={s.baru ? 'Sambungan siap dipakai' : 'Kode baru siap'} onClose={onClose}>
      <div className="notice small"><b>Simpan alamat ini sekarang.</b> Alamat hanya tampil sekali dan tidak bisa dilihat lagi. Kalau hilang, buat kode baru (alamat lama berhenti bekerja).</div>
      <span className="label">Alamat untuk &ldquo;{s.name}&rdquo;</span>
      <div className="copyrow" style={{ alignItems: 'flex-start' }}><span style={{ overflowWrap: 'anywhere', fontSize: 12.5, fontWeight: 600 }}>{url}</span><button className="sm" onClick={copy}>Salin</button></div>
      <span className="small">Tempel di aplikasi yang <b>mengirim</b> data (Zapier, Make, n8n, Google Apps Script, bot, atau server website Anda) sebagai <b>POST</b>. Kolom yang dikenali: name/nama, phone/telepon/hp, message/pesan, email.</span>
      <div className="notice small">Jangan menaruh alamat ini di JavaScript halaman web yang bisa dilihat pengunjung — siapa pun yang tahu alamatnya bisa mengirim prospek. Bila bocor, tekan <b>Kode baru</b>.</div>
      <button onClick={test} disabled={sending}>{sending ? 'Mengirim…' : 'Kirim contoh'}</button>
      <span className="small muted">Membuat 1 prospek bernama &ldquo;Contoh Uji PRASARA&rdquo; supaya Anda bisa memastikan sambungan bekerja. Bisa dibatalkan di Prospek.</span>
      {res && <div className={'notice small' + (res.ok ? '' : ' bad')} role="status">{res.text}</div>}
      <details>
        <summary className="small" style={{ cursor: 'pointer', fontWeight: 700 }}>Contoh pengiriman</summary>
        <pre style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', fontSize: 12, background: 'var(--sunk)', borderRadius: 10, padding: 10, margin: '8px 0 0' }}>{curl}</pre>
        <span className="small muted">Kiriman ulang yang sama: tambahkan header <b>Idempotency-Key</b> bernilai unik per kiriman agar tidak menjadi dua prospek. Tanpa itu, nomor telepon yang sama dalam 10 menit dianggap satu prospek.</span>
      </details>
      <button className="primary" onClick={onClose}>Selesai, sudah saya simpan</button>
    </Sheet>
  );
}
