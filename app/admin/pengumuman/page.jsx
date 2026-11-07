'use client';
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useKos } from '@/components/KosProvider';
import PageHelp from '@/components/PageHelp';
import { Loading, Empty, Field, toast } from '@/components/ui';
import { tgl, errMsg } from '@/lib/format';
import { can } from '@/lib/admin';

const PLANS = [['gratis', 'Gratis'], ['coba', 'Masa coba'], ['standar', 'Standar'], ['pro', 'Pro']];
const TYPES = [['properti', '🏠 Properti'], ['retail', '🛒 Retail'], ['jasa', '🧺 Jasa']];
const KIND = { layanan: ['Layanan penting', 'warn'], info: ['Info / fitur / tips', 'info'] };

// Pengumuman ke pelanggan: banner di aplikasi dan/atau email, dengan pratinjau & konfirmasi
export default function Pengumuman() {
  const { adminMe } = useKos();
  const [rows, setRows] = useState(null);
  const [err, setErr] = useState(null);
  const [f, setF] = useState({ title: '', body: '', kind: 'info', plans: [], types: [], banner: true, email: false, ends: '' });
  const [count, setCount] = useState(null);
  const [busy, setBusy] = useState(false);
  const load = () => supabase.rpc('admin_announcements').then(({ data, error }) => (error ? setErr(errMsg(error)) : setRows(data)));
  useEffect(() => { if (can(adminMe, 'announce.manage')) load(); }, [adminMe]);
  useEffect(() => {
    if (!can(adminMe, 'announce.manage')) return;
    supabase.rpc('admin_announce_count', { p_plans: f.plans, p_types: f.types }).then(({ data }) => setCount(data ?? null));
  }, [f.plans.join(), f.types.join(), adminMe]);
  if (!can(adminMe, 'announce.manage')) return <Empty title="Tidak punya izin membuat pengumuman" />;
  if (err) return <div className="notice bad">{err.includes('admin_announcements') ? 'Database sedang diperbarui. Coba lagi beberapa menit lagi.' : err}</div>;
  if (!rows) return <Loading />;
  const toggle = (k, v) => setF({ ...f, [k]: f[k].includes(v) ? f[k].filter((x) => x !== v) : [...f[k], v] });
  const token = async () => (await supabase.auth.getSession()).data.session?.access_token;

  const sendEmail = async (id) => {
    const r = await fetch('/api/admin/announce', { method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer ' + (await token()) }, body: JSON.stringify({ id }) });
    const x = await r.json().catch(() => ({}));
    if (!r.ok) return toast(x.error || 'Gagal mengirim email');
    toast(`Email terkirim ke ${x.sent} bisnis${x.remaining ? ` · ${x.remaining} lagi: tekan Kirim sisa email besok` : ''}`);
  };
  const save = async () => {
    if (f.title.trim().length < 3 || f.body.trim().length < 3) return toast('Isi judul dan isi pengumuman.');
    if (!f.banner && !f.email) return toast('Pilih minimal satu saluran.');
    const sasaran = `${count ?? '?'} bisnis (${f.plans.length ? f.plans.join(', ') : 'semua paket'} · ${f.types.length ? f.types.join(', ') : 'semua jenis'})`;
    if (!confirm(`Terbitkan "${f.title}" untuk ${sasaran}?${f.email ? `\n\nEmail ${f.kind === 'info' ? 'hanya ke yang tidak mematikan email PRASARA, maks 1 email info per 7 hari' : 'dikirim ke semua sasaran (layanan penting)'}.` : ''}`)) return;
    setBusy(true);
    const { data, error } = await supabase.rpc('admin_announcement_save', { p_title: f.title, p_body: f.body, p_kind: f.kind, p_plans: f.plans, p_types: f.types, p_banner: f.banner, p_email: f.email, p_ends: f.ends || null });
    if (error) { setBusy(false); return toast(errMsg(error)); }
    if (f.email) await sendEmail(data); else toast('Pengumuman terbit');
    setBusy(false);
    setF({ title: '', body: '', kind: 'info', plans: [], types: [], banner: true, email: false, ends: '' }); load();
  };
  const end = async (id) => { const { error } = await supabase.rpc('admin_announcement_end', { p_id: id }); if (error) return toast(errMsg(error)); toast('Pengumuman diakhiri'); load(); };

  return (
    <div className="stack">
      <div className="row"><h2>Pengumuman</h2><PageHelp page="admin-pengumuman" /></div>
      <section className="panel">
        <h3>Buat pengumuman</h3>
        <div className="seg">{Object.entries(KIND).map(([k, [l]]) => <button key={k} className={f.kind === k ? 'on' : ''} onClick={() => setF({ ...f, kind: k })}>{l}</button>)}</div>
        <span className="small muted">{f.kind === 'layanan' ? 'Pemeliharaan, gangguan, perubahan layanan atau harga. Email dikirim ke semua sasaran.' : 'Fitur baru, tips, edukasi. Email hanya ke yang tidak mematikan email PRASARA, maks 1 per 7 hari.'}</span>
        <Field label="Judul"><input value={f.title} maxLength={120} onChange={(e) => setF({ ...f, title: e.target.value })} placeholder="mis. Fitur baru: pesanan ke supplier" /></Field>
        <Field label="Isi"><textarea value={f.body} maxLength={2000} onChange={(e) => setF({ ...f, body: e.target.value })} style={{ minHeight: 100 }} /></Field>
        <span className="label">Sasaran</span>
        <div className="row">{PLANS.map(([k, l]) => <button key={k} className={'sm' + (f.plans.includes(k) ? ' primary' : '')} onClick={() => toggle('plans', k)}>{l}</button>)}</div>
        <div className="row">{TYPES.map(([k, l]) => <button key={k} className={'sm' + (f.types.includes(k) ? ' primary' : '')} onClick={() => toggle('types', k)}>{l}</button>)}</div>
        <span className="small">Tidak memilih = semua. Sasaran saat ini: <b>{count ?? '…'} bisnis</b> (bisnis admin tidak termasuk).</span>
        <span className="label">Saluran</span>
        <label className="row small"><input type="checkbox" style={{ width: 22, minHeight: 22 }} checked={f.banner} onChange={(e) => setF({ ...f, banner: e.target.checked })} /> Banner di aplikasi</label>
        <label className="row small"><input type="checkbox" style={{ width: 22, minHeight: 22 }} checked={f.email} onChange={(e) => setF({ ...f, email: e.target.checked })} /> Email (maks 250 per kiriman, kuota Gmail ±500/hari)</label>
        {f.banner && <Field label="Banner tampil sampai (opsional)"><input type="date" value={f.ends} onChange={(e) => setF({ ...f, ends: e.target.value })} /></Field>}
        {(f.title || f.body) && <>
          <span className="label">Pratinjau banner</span>
          <div className={'announce ' + f.kind}><div style={{ flex: 1 }}><b>{f.title || 'Judul'}</b><div className="small" style={{ whiteSpace: 'pre-wrap' }}>{f.body}</div></div></div>
        </>}
        <button className="primary" onClick={save} disabled={busy}>{busy ? 'Menerbitkan…' : 'Terbitkan'}</button>
      </section>
      {rows.length === 0 ? <Empty title="Belum ada pengumuman" /> : (
        <section className="panel"><h3>Riwayat</h3><div className="list">{rows.map((a) => (
          <div className="li" key={a.id} style={{ alignItems: 'flex-start' }}>
            <div className="main">
              <b className="small">{a.title} <span className={'chip ' + KIND[a.kind][1]}>{KIND[a.kind][0]}</span>{a.status === 'berakhir' && <span className="chip void" style={{ marginLeft: 4 }}>Berakhir</span>}</b>
              <span className="small muted">{tgl(String(a.created_at).slice(0, 10))} · {a.created_by} · sasaran {a.targets} · {a.banner ? 'banner' : ''}{a.banner && a.email ? ' + ' : ''}{a.email ? `email ${a.email_count} terkirim` : ''}{a.ends_at ? ` · sampai ${tgl(a.ends_at)}` : ''}</span>
            </div>
            <div className="stack" style={{ gap: 6 }}>
              {a.email && a.status === 'aktif' && a.email_count < a.targets && <button className="sm" onClick={() => sendEmail(a.id).then(load)}>Kirim sisa email</button>}
              {a.status === 'aktif' && <button className="sm ghost" onClick={() => end(a.id)}>Akhiri</button>}
            </div>
          </div>
        ))}</div></section>
      )}
    </div>
  );
}
