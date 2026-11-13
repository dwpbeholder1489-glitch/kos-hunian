'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { useKos } from '@/components/KosProvider';
import PageHelp from '@/components/PageHelp';
import { Field, Loading, toast, run } from '@/components/ui';
import { rp, tgl, errMsg, angka, waLink } from '@/lib/format';
import { canArea } from '@/lib/business';
import { hasFeature } from '@/lib/plan';
import FiturUpgrade from '@/components/FiturUpgrade';

const when = (ts) => { const s = String(ts); return `${tgl(s.slice(0, 10))} ${new Date(s).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Jakarta' })}`; };
const RUN = { ok: ['Berhasil', 'good'], dilewati: ['Dilewati', 'void'], gagal: ['Gagal', 'bad'] };
const PARAM = { buat_draf: ['Buat draf pesanan ke supplier', 'bool'], kelipatan: ['Pesan sampai (× batas minimum)', 'num'], hari: ['Berapa hari sebelumnya', 'num'], jam: ['Shift dianggap lama setelah (jam)', 'num'], persen: ['Batas persen (%)', 'num'] };
const HARI = ['Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab', 'Min'];   // ISO: 1 = Senin … 7 = Minggu
const JADWAL_SENDIRI = ['ringkasan_bulanan', 'ringkasan_mingguan'];   // punya jadwal tetap, tanpa pilihan hari

// Otomatisasi (blueprint 7): resep pemicu → syarat → tindakan, log tiap jalan, jeda otomatis bila gagal, tindakan berisiko lewat Persetujuan
export default function Otomatisasi() {
  const { kos, kosId, ver } = useKos();
  const fitur = hasFeature(kos, 'otomatisasi');   // mulai Paket Bisnis (bisnis lama tetap); dicek juga di server
  const owner = canArea(kos, 'team');
  const lanjut = hasFeature(kos, 'otomatisasi_lanjutan');   // Paket Pro: resep lanjutan & pilihan hari jalan
  const [rows, setRows] = useState(null);
  const [notes, setNotes] = useState([]);
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(null);
  const load = async () => {
    const [a, n] = await Promise.all([
      supabase.rpc('automation_list', { p_kos: kosId }),
      supabase.from('automation_notices').select('*').eq('kos_id', kosId).order('created_at', { ascending: false }).limit(30),
    ]);
    if (a.error) return setErr(errMsg(a.error));
    setRows(a.data); setNotes(n.data || []);
  };
  useEffect(() => { load(); }, [kosId, ver]);
  if (err) return <div className="notice bad">{/automation_list/.test(err) ? 'Database sedang diperbarui. Coba lagi beberapa menit lagi.' : err}</div>;
  if (!rows) return <Loading />;
  const unread = notes.filter((n) => !n.read_at).length;

  const toggle = async (x, on, params) => {
    if (on && !x.rule?.enabled && !window.confirm(`Nyalakan "${x.recipe.name}"?\nJalan setiap pagi pukul 07.00. ${x.recipe.needs_approval ? 'Tindakan yang mengubah data menunggu persetujuan Anda.' : 'Hanya membuat pemberitahuan.'}`)) return;
    if (await run(() => supabase.rpc('automation_set', { p_kos: kosId, p_recipe: x.recipe.code, p_enabled: on, p_params: params || x.rule?.params || {} }), on ? 'Otomatisasi menyala' : 'Otomatisasi dimatikan', errMsg)) load();
  };
  const runNow = async (x) => {
    setBusy(x.rule.id);
    const { data, error } = await supabase.rpc('automation_run_now', { p_rule: x.rule.id });
    setBusy(null);
    if (error) return toast(errMsg(error));
    toast(data.status === 'ok' ? 'Selesai dijalankan' : data.status === 'gagal' ? `Gagal: ${data.error}` : 'Dilewati');
    load();
  };
  const markRead = async () => { if (await run(() => supabase.rpc('automation_notice_read', { p_kos: kosId }), 'Ditandai sudah dibaca', errMsg)) load(); };

  return (
    <div className="stack">
      <div className="row"><h2>Otomatisasi</h2><PageHelp page="otomatisasi" /></div>
      <p className="small muted" style={{ margin: 0 }}>Pekerjaan rutin yang dijalankan sistem setiap pagi pukul 07.00. Otomatisasi hanya membaca data dan membuat pemberitahuan; tindakan yang mengubah data masuk ke <Link href="/persetujuan">Persetujuan</Link> dulu.</p>

      <section className="panel">
        <div className="row between"><h3>Pemberitahuan{unread ? ` (${unread} baru)` : ''}</h3>{unread > 0 && <button className="sm ghost" onClick={markRead}>Tandai dibaca</button>}</div>
        {notes.length === 0 ? <span className="small muted">Belum ada. Nyalakan otomatisasi di bawah.</span> : <div className="list">{notes.map((n) => (
          <details key={n.id} className="li" style={{ display: 'block' }}>
            <summary style={{ cursor: 'pointer' }}><b className="small">{!n.read_at && '● '}{n.title}</b> <span className="small muted">· {when(n.created_at)}{n.emailed_at ? ' · email terkirim' : ''}</span></summary>
            {n.body && <p className="small" style={{ margin: '6px 0' }}>{n.body}</p>}
            {Array.isArray(n.items) && <ul className="small" style={{ margin: 0, paddingLeft: 18 }}>{n.items.slice(0, 15).map((it, i) => (
              <li key={i}>{it.nama || it.name || it.penghuni || it.kasir || ''} {it.stok != null ? `· stok ${angka(it.stok)}/${angka(it.min)} ${it.satuan}` : ''}{it.sisa != null ? ` · ${rp(it.sisa)}` : ''}{it.due ? ` · jatuh tempo ${tgl(it.due)}` : ''}{it.kamar ? ` (${it.kamar})` : ''}{it.anggaran != null ? ` · ${it.persen}% dari anggaran ${rp(it.anggaran)}` : ''}
                {it.phone && <> · <a href={waLink(it.phone, `Halo ${it.name}, ini pengingat dari ${kos.name}. Sisa kasbon Anda ${rp(it.sisa)}. Terima kasih.`)} target="_blank" rel="noreferrer">Ingatkan WA</a></>}</li>
            ))}</ul>}
            {n.href && <Link href={n.href} className="small">Buka menunya →</Link>}
          </details>
        ))}</div>}
      </section>

      {!fitur && <FiturUpgrade kosId={kosId} event="WORKFLOW.REQUESTED" title="Menyalakan otomatisasi tersedia mulai Paket Bisnis" text="Resep di bawah bisa dilihat, tetapi belum bisa dinyalakan di paket ini. Otomatisasi yang sudah menyala bisa dimatikan kapan saja." />}

      {!lanjut && rows.some((x) => x.recipe.tier === 'lanjutan') && <FiturUpgrade kosId={kosId} plan="pro" event="WORKFLOW.ADVANCED.REQUESTED" title="Otomatisasi lanjutan tersedia di Paket Pro" text="Resep bertanda Pro (penjualan turun, biaya mendekati anggaran, sewa segera berakhir, ringkasan mingguan) dan pilihan hari jalan aktif di Paket Pro." />}

      {rows.map((x) => {
        const on = Boolean(x.rule?.enabled);
        const pro = x.recipe.tier === 'lanjutan';
        const bisa = fitur && (!pro || lanjut);
        const params = { ...x.recipe.default_params, ...(x.rule?.params || {}) };
        const hari = Array.isArray(params.hari_jalan) ? params.hari_jalan : [];
        const flipHari = (n) => { const h = hari.includes(n) ? hari.filter((y) => y !== n) : [...hari, n].sort(); toggle(x, on, { ...params, hari_jalan: h.length === 7 ? [] : h }); };
        return (
          <section className="panel" key={x.recipe.code}>
            <div className="row between"><h3>{x.recipe.name}{pro && <span className="chip" style={{ marginLeft: 6 }}>Pro</span>}</h3>{on ? <span className="chip good">Menyala</span> : <span className="chip">Mati</span>}</div>
            <div className="list">
              <div className="li"><span className="small muted">Pemicu</span><span className="small">{x.recipe.trigger_text}</span></div>
              <div className="li"><span className="small muted">Syarat</span><span className="small" style={{ textAlign: 'right' }}>{x.recipe.condition_text}</span></div>
              <div className="li"><span className="small muted">Tindakan</span><span className="small" style={{ textAlign: 'right' }}>{x.recipe.action_text}</span></div>
            </div>
            {x.recipe.sends_email && <span className="small muted">Email ke pemilik hanya untuk paket berbayar atau masa coba.</span>}
            {x.rule?.paused_reason && <div className="notice bad">{x.rule.paused_reason}</div>}
            {owner && Object.keys(params).length > 0 && <div className="row">{Object.entries(params).map(([k, v]) => PARAM[k] && (
              PARAM[k][1] === 'bool'
                ? <label key={k} className="row small"><input type="checkbox" style={{ width: 22, minHeight: 22 }} checked={Boolean(v)} onChange={(e) => toggle(x, on, { ...params, [k]: e.target.checked })} />{PARAM[k][0]}</label>
                : <Field key={k} label={PARAM[k][0]}><input inputMode="numeric" defaultValue={String(v)} onBlur={(e) => { const n = Number(e.target.value.replace(',', '.')); if (n > 0 && n !== Number(v)) toggle(x, on, { ...params, [k]: n }); }} /></Field>
            ))}</div>}
            {owner && !JADWAL_SENDIRI.includes(x.recipe.code) && (lanjut || hari.length > 0) && <div className="stack" style={{ gap: 4 }}>
              <span className="small muted">Hari jalan {lanjut ? '(kosong = setiap hari)' : '(tidak berlaku di paket ini — jalan setiap hari)'}</span>
              <div className="row" style={{ gap: 4 }}>{HARI.map((h, i) => <button key={h} className={'sm ' + (hari.includes(i + 1) ? 'primary' : 'ghost')} disabled={!lanjut} onClick={() => flipHari(i + 1)} aria-pressed={hari.includes(i + 1)}>{h}</button>)}</div>
            </div>}
            {owner ? <div className="row">
              <button className={on ? 'ghost' : 'primary'} disabled={!on && !bisa} onClick={() => toggle(x, !on)}>{on ? 'Matikan' : 'Nyalakan'}</button>
              {x.rule && bisa && <button className="sm" disabled={busy === x.rule.id} onClick={() => runNow(x)}>{busy === x.rule.id ? 'Menjalankan…' : 'Jalankan sekarang'}</button>}
            </div> : <span className="small muted">Hanya pemilik yang bisa menyalakan atau mengubah.</span>}
            {x.runs?.length > 0 && <details><summary className="small">Riwayat jalan ({x.runs.length})</summary>
              <div className="list">{x.runs.map((r) => (
                <div className="li" key={r.id} style={{ alignItems: 'flex-start' }}>
                  <span className="small">{when(r.started_at)} · {r.trigger}{r.output && Object.keys(r.output).length ? ` · ${Object.entries(r.output).map(([k, v]) => `${k}: ${typeof v === 'number' ? angka(v) : v}`).join(', ')}` : ''}{r.error ? ` · ${r.error}` : ''}</span>
                  <span className={'chip ' + RUN[r.status][1]}>{RUN[r.status][0]}</span>
                </div>
              ))}</div>
            </details>}
          </section>
        );
      })}
      <span className="small muted">Pengaman: setiap otomatisasi paling banyak sekali sehari lewat jadwal (jalankan manual paling cepat tiap 5 menit), tidak memicu otomatisasi lain, tidak membuat pesanan ganda, dan dijeda otomatis setelah 3 kali gagal. Pengiriman WhatsApp otomatis belum tersedia — pesan WA disiapkan untuk dikirim dengan satu ketukan.</span>
    </div>
  );
}
