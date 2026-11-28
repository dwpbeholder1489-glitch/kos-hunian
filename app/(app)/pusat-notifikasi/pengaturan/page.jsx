'use client';
// Pengaturan notifikasi: perangkat ini, kategori (dalam aplikasi / push) per bisnis, prioritas minimum, jam tenang, suara & privasi.
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { useKos } from '@/components/KosProvider';
import { PageHeader } from '@/components/Page';
import PageHelp from '@/components/PageHelp';
import { Loading, toast } from '@/components/ui';
import { errMsg } from '@/lib/format';
import { CATS, chime, buzz, disablePush, enablePush, primeAudio, pushStatus, sendTest } from '@/lib/notif';
import { STATUS_TEXT } from '@/components/NotifCenter';

const DAYS = [[1, 'Sen'], [2, 'Sel'], [3, 'Rab'], [4, 'Kam'], [5, 'Jum'], [6, 'Sab'], [7, 'Min']];
const ZONES = [['Asia/Jakarta', 'WIB (Jakarta)'], ['Asia/Makassar', 'WITA (Makassar)'], ['Asia/Jayapura', 'WIT (Jayapura)']];
const MINP = [['info', 'Semua (termasuk info)'], ['normal', 'Normal ke atas'], ['tinggi', 'Hanya penting & kritis'], ['kritis', 'Hanya kritis']];

function Switch({ on, onChange, label, disabled }) {
  return <button type="button" role="switch" aria-checked={on} aria-label={label} disabled={disabled} className={'nt-sw' + (on ? ' on' : '')} onClick={() => onChange(!on)}><span /></button>;
}

export default function PengaturanNotifikasi() {
  const { kos, kosId } = useKos();
  const [st, setSt] = useState(null);
  const [s, setS] = useState(null);
  const [busy, setBusy] = useState(null);
  const loadSt = () => pushStatus().then(setSt);
  const load = () => supabase.rpc('notif_settings_get', { p_kos: kosId }).then(({ data, error }) => (error ? toast(errMsg(error)) : setS(data)));
  useEffect(() => { loadSt(); }, []);
  useEffect(() => { if (kosId) load(); }, [kosId]);

  const save = async (patch, msg = 'Pengaturan disimpan') => {
    const { data, error } = await supabase.rpc('notif_settings_set', { p_kos: kosId, p_data: patch });
    if (error) return toast(errMsg(error));
    setS(data); toast(msg);
  };
  const doit = async (k, fn) => { setBusy(k); try { await fn(); } catch (e) { toast(errMsg(e)); } setBusy(null); loadSt(); };

  if (!s || !st) return <Loading />;
  // kategori yang relevan untuk peran & bisnis ini (dari katalog aturan)
  const present = new Map();
  for (const t of s.catalog) { const c = present.get(t.category) || { push: false, n: 0 }; c.n++; c.push = c.push || t.push; present.set(t.category, c); }
  const cat = (k) => ({ app: s.cats?.[k]?.app !== false, push: s.cats?.[k]?.push ?? present.get(k)?.push ?? false });
  const setCat = (k, field, v) => {
    const next = { ...(s.cats || {}) };
    for (const kk of present.keys()) next[kk] = { ...cat(kk), ...(next[kk] || {}) };
    next[k] = { ...cat(k), [field]: v };
    if (field === 'app' && !v) next[k].push = false;
    save({ cats: next });
  };
  const q = s.quiet;
  const setQ = (patch) => save({ quiet: { ...q, ...patch } }, 'Jam tenang disimpan');
  const [title, tone, text] = STATUS_TEXT[st.code] || STATUS_TEXT.belum_diminta;

  return (
    <div className="stack">
      <PageHeader title="Pengaturan notifikasi" help={<PageHelp page="pusat-notifikasi" />} desc="Atur apa yang masuk, ke perangkat mana, dan kapan PRASARA boleh berbunyi." />

      <section className="panel">
        <h3>Perangkat ini</h3>
        <div className="nt-devstat"><span className={'chip ' + tone}>{title}</span><span className="small muted">{st.label}{st.standalone ? ' · dibuka dari Layar Utama' : ''}</span></div>
        <p className="small muted" style={{ margin: 0 }}>{text}</p>
        <div className="row">
          {['belum_diminta', 'perlu_ulang'].includes(st.code) && <button className="primary" disabled={!!busy} onClick={() => doit('on', async () => { await enablePush(); toast('Notifikasi aktif di perangkat ini.'); })}>{busy === 'on' ? 'Mengaktifkan…' : 'Aktifkan Notifikasi'}</button>}
          {st.code === 'perlu_pasang' && <Link href="/pusat-notifikasi/aktifkan" className="nt-btn primary">Lihat cara memasang</Link>}
          {st.code === 'ditolak' && <Link href="/pusat-notifikasi/bantuan#izin" className="nt-btn">Cara mengizinkan</Link>}
          {['aktif', 'dimatikan'].includes(st.code) && <button disabled={!!busy} onClick={() => doit('test', async () => { const r = await sendTest(); toast(`Pesan uji dikirim ke ${r.devices} perangkat. Biasanya tiba dalam beberapa detik.`); })}>{busy === 'test' ? 'Mengirim…' : 'Kirim notifikasi uji'}</button>}
          {['aktif', 'dimatikan', 'perlu_ulang'].includes(st.code) && <button className="ghost danger" disabled={!!busy} onClick={() => doit('off', async () => { await disablePush(); toast('Perangkat ini tidak lagi menerima push.'); })}>Matikan di perangkat ini</button>}
        </div>
        <p className="small" style={{ margin: 0 }}><Link href="/pusat-notifikasi/perangkat">Perangkat terhubung ({s.devices} aktif) →</Link> · <Link href="/pusat-notifikasi/bantuan">Bantuan & panduan →</Link></p>
      </section>

      <section className="panel">
        <h3>Kategori di {kos?.name}</h3>
        <p className="small muted" style={{ margin: 0 }}><b>Dalam aplikasi</b> = masuk lonceng & Pusat Notifikasi. <b>Push</b> = muncul di layar HP/komputer walau PRASARA ditutup. Notifikasi kritis (keamanan) selalu masuk.</p>
        <div className="nt-cats">
          <div className="nt-cat h"><span>Kategori</span><span>Dalam aplikasi</span><span>Push</span></div>
          {Object.entries(CATS).filter(([k]) => present.has(k)).map(([k, [l, d]]) => (
            <div key={k} className="nt-cat"><span><b>{l}</b><small className="muted">{d}</small></span>
              <Switch on={cat(k).app} label={`${l} dalam aplikasi`} onChange={(v) => setCat(k, 'app', v)} />
              <Switch on={cat(k).push} label={`${l} push`} disabled={!cat(k).app} onChange={(v) => setCat(k, 'push', v)} /></div>
          ))}
        </div>
        <label className="nt-field">Push untuk prioritas
          <select value={s.min_push} onChange={(e) => save({ min_push: e.target.value })}>{MINP.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></label>
        <p className="small muted" style={{ margin: 0 }}>Penjualan & pengeluaran harian bawaannya tanpa push agar HP tidak terus berbunyi; peristiwa beruntun digabung (mis. "12 penjualan baru").</p>
      </section>

      <section className="panel">
        <div className="nt-hrow"><h3>Jam tenang</h3><Switch on={q.on} label="Jam tenang" onChange={(v) => setQ({ on: v })} /></div>
        <p className="small muted" style={{ margin: 0 }}>Push selain kritis ditahan sampai jam tenang selesai. Notifikasi tetap tersimpan di Pusat Notifikasi. Berlaku untuk semua bisnis Anda.</p>
        <div className="nt-q">
          <label className="nt-field">Mulai<input type="time" value={q.start} disabled={!q.on} onChange={(e) => e.target.value && setQ({ start: e.target.value })} /></label>
          <label className="nt-field">Selesai<input type="time" value={q.end} disabled={!q.on} onChange={(e) => e.target.value && setQ({ end: e.target.value })} /></label>
          <label className="nt-field">Zona waktu<select value={q.tz} disabled={!q.on} onChange={(e) => setQ({ tz: e.target.value })}>{ZONES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></label>
        </div>
        <div className="nt-days" role="group" aria-label="Hari aktif jam tenang">{DAYS.map(([d, l]) => {
          const on = q.days.includes(d);
          return <button key={d} type="button" aria-pressed={on} disabled={!q.on} className={on ? 'on' : ''} onClick={() => setQ({ days: on ? q.days.filter((x) => x !== d) : [...q.days, d] })}>{l}</button>;
        })}</div>
      </section>

      <section className="panel">
        <h3>Suara, getar & privasi</h3>
        <div className="nt-cat"><span><b>Suara khusus PRASARA</b><small className="muted">Nada pendek saat notifikasi masuk dan aplikasi sedang terbuka. Saat ditutup, HP memakai bunyi notifikasi bawaannya.</small></span>
          <Switch on={s.sound} label="Suara khusus" onChange={(v) => save({ sound: v })} /><button type="button" className="ghost sm" onClick={() => { primeAudio(); if (!chime(true)) toast('Browser ini tidak bisa memutar suara.'); }}>Coba</button></div>
        <div className="nt-cat"><span><b>Getar</b><small className="muted">Android saja (iPhone mengikuti pengaturan HP).</small></span>
          <Switch on={s.vibrate} label="Getar" onChange={(v) => save({ vibrate: v })} /><button type="button" className="ghost sm" onClick={() => buzz(true)}>Coba</button></div>
        <div className="nt-cat"><span><b>Sembunyikan nominal di layar kunci</b><small className="muted">Push menampilkan "Rp •••"; angka lengkap terlihat setelah membuka PRASARA.</small></span>
          <Switch on={s.hide_amount} label="Sembunyikan nominal" onChange={(v) => save({ hide_amount: v })} /><span /></div>
      </section>

      {kos?.business_type === 'properti' && kos.owner_id && <p className="small muted">Email ringkasan & daftar tagih pagi tetap diatur di <Link href="/notifikasi">Notifikasi kos › Pengaturan email</Link>.</p>}
    </div>
  );
}
