'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { useKos } from '@/components/KosProvider';
import PageHelp from '@/components/PageHelp';
import { Field, Loading, toast, run } from '@/components/ui';
import { rp, tgl, errMsg, angka, waLink } from '@/lib/format';
import { canArea } from '@/lib/business';

const when = (ts) => { const s = String(ts); return `${tgl(s.slice(0, 10))} ${new Date(s).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Jakarta' })}`; };
const RUN = { ok: ['Berhasil', 'good'], dilewati: ['Dilewati', 'void'], gagal: ['Gagal', 'bad'] };
const PARAM = { buat_draf: ['Buat draf pesanan ke supplier', 'bool'], kelipatan: ['Pesan sampai (× batas minimum)', 'num'], hari: ['Berapa hari sebelum jatuh tempo', 'num'], jam: ['Shift dianggap lama setelah (jam)', 'num'] };

// Otomatisasi (blueprint 7): resep pemicu → syarat → tindakan, log tiap jalan, jeda otomatis bila gagal, tindakan berisiko lewat Persetujuan
export default function Otomatisasi() {
  const { kos, kosId, ver } = useKos();
  const owner = canArea(kos, 'team');
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
              <li key={i}>{it.nama || it.name || it.penghuni || it.kasir || ''} {it.stok != null ? `· stok ${angka(it.stok)}/${angka(it.min)} ${it.satuan}` : ''}{it.sisa != null ? ` · ${rp(it.sisa)}` : ''}{it.due ? ` · jatuh tempo ${tgl(it.due)}` : ''}{it.kamar ? ` (${it.kamar})` : ''}
                {it.phone && <> · <a href={waLink(it.phone, `Halo ${it.name}, ini pengingat dari ${kos.name}. Sisa kasbon Anda ${rp(it.sisa)}. Terima kasih.`)} target="_blank" rel="noreferrer">Ingatkan WA</a></>}</li>
            ))}</ul>}
            {n.href && <Link href={n.href} className="small">Buka menunya →</Link>}
          </details>
        ))}</div>}
      </section>

      {rows.map((x) => {
        const on = Boolean(x.rule?.enabled);
        const params = { ...x.recipe.default_params, ...(x.rule?.params || {}) };
        return (
          <section className="panel" key={x.recipe.code}>
            <div className="row between"><h3>{x.recipe.name}</h3>{on ? <span className="chip good">Menyala</span> : <span className="chip">Mati</span>}</div>
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
            {owner ? <div className="row">
              <button className={on ? 'ghost' : 'primary'} onClick={() => toggle(x, !on)}>{on ? 'Matikan' : 'Nyalakan'}</button>
              {x.rule && <button className="sm" disabled={busy === x.rule.id} onClick={() => runNow(x)}>{busy === x.rule.id ? 'Menjalankan…' : 'Jalankan sekarang'}</button>}
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
