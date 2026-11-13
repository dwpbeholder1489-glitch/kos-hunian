'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { useKos } from '@/components/KosProvider';
import { Loading, toast } from '@/components/ui';
import { errMsg, angka } from '@/lib/format';
import { canArea } from '@/lib/business';
import { hasFeature } from '@/lib/plan';

const RISK = { rendah: 'good', menengah: 'gold', tinggi: 'bad' };
const KIND = { modul: 'Modul', otomatisasi: 'Otomatisasi', persetujuan: 'Aturan persetujuan', pembukuan: 'Pembukuan', data: 'Kualitas data' };
const EV = (k) => k.replace(/_/g, ' ');

// Recommendation Engine (blueprint 20.3): setiap saran menyebut bukti (angka + periode), manfaat, dampak, dan risiko.
// Pemilik memutuskan: Terapkan (tindakan yang sama dengan menu aslinya, tercatat) atau Abaikan 30 hari.
export default function Rekomendasi() {
  const { kos, kosId, ver, loadKos } = useKos();
  const router = useRouter();
  const owner = canArea(kos, 'team');
  const [rows, setRows] = useState(null);
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(null);
  const load = () => supabase.rpc('recommendations', { p_kos: kosId }).then(({ data, error }) => (error ? setErr(errMsg(error)) : setRows(data || [])));
  useEffect(() => { setRows(null); load(); }, [kosId, ver]);
  if (err) return <div className="notice bad">{/recommendations/.test(err) ? 'Database sedang diperbarui. Coba lagi beberapa menit lagi.' : err}</div>;
  if (!rows) return <Loading />;
  if (kos?.closed_at) return <div className="notice">Bisnis ini ditutup, jadi tidak ada saran.</div>;

  const decide = (x, status, days, reason) => supabase.rpc('recommendation_decide', { p_kos: kosId, p_code: x.code, p_status: status, p_days: days, p_reason: reason || null });
  const apply = async (x) => {
    const a = x.action;
    if (a.type === 'link') { await decide(x, 'diterima', 7, 'dibuka'); return router.push(a.href); }
    // Otomatisasi & aturan persetujuan sendiri mulai Paket Bisnis: buka menunya (di sana ada penjelasan & penawaran)
    if (a.type === 'otomatisasi' && !hasFeature(kos, 'otomatisasi')) return router.push('/otomatisasi');
    if (a.type === 'persetujuan' && !hasFeature(kos, 'persetujuan')) return router.push('/persetujuan');
    if (!window.confirm(`${x.title}?\n\nAlasan: ${x.why}\nDampak: ${x.impact}`)) return;
    setBusy(x.code);
    let r;
    if (a.type === 'modul') r = await supabase.rpc('module_set', { p_kos: kosId, p_code: a.code, p_on: true, p_reason: 'Rekomendasi: ' + x.why });
    else if (a.type === 'otomatisasi') r = await supabase.rpc('automation_set', { p_kos: kosId, p_recipe: a.recipe, p_enabled: true, p_params: {} });
    else if (a.type === 'persetujuan') r = await supabase.rpc('approval_rule_set', { p_kos: kosId, p_action: a.action, p_required: true });
    if (r?.error) { setBusy(null); return toast(errMsg(r.error)); }
    await decide(x, 'diterima', 30, 'diterapkan');
    setBusy(null);
    toast(r?.data === 'menunggu' ? 'Permintaan dikirim ke pemilik' : 'Diterapkan');
    loadKos(); load();
  };
  const dismiss = async (x) => {
    const reason = window.prompt('Abaikan saran ini selama 30 hari? Alasan (opsional):', '');
    if (reason == null) return;
    const { error } = await decide(x, 'diabaikan', 30, reason);
    if (error) return toast(errMsg(error));
    toast('Disembunyikan 30 hari'); load();
  };

  return (
    <div className="stack">
      <span className="small muted">Saran dihitung dari data bisnis ini sendiri (30 hari terakhir), bukan tebakan. Tidak ada yang berubah sebelum Anda menekan Terapkan; semua keputusan tercatat di Riwayat.</span>
      {rows.length === 0 ? <div className="notice">Belum ada saran. Bisnis ini sudah memakai fitur yang sesuai dengan datanya.</div> : rows.map((x) => (
        <section className="panel" key={x.code}>
          <div className="row between" style={{ flexWrap: 'nowrap', alignItems: 'flex-start' }}><b>{x.title}</b><span className={'chip ' + RISK[x.risk]}>risiko {x.risk}</span></div>
          <div className="list">
            <div className="li" style={{ alignItems: 'flex-start' }}><span className="small muted">Alasan</span><span className="small" style={{ textAlign: 'right' }}>{x.why}</span></div>
            <div className="li" style={{ alignItems: 'flex-start' }}><span className="small muted">Manfaat</span><span className="small" style={{ textAlign: 'right' }}>{x.benefit}</span></div>
            <div className="li" style={{ alignItems: 'flex-start' }}><span className="small muted">Dampak</span><span className="small" style={{ textAlign: 'right' }}>{x.impact}</span></div>
          </div>
          <span className="small muted">{KIND[x.kind] || x.kind} · Bukti: {Object.entries(x.evidence || {}).map(([k, v]) => `${EV(k)} ${typeof v === 'number' ? angka(v) : v}`).join(', ')} · {x.basis}</span>
          {owner || x.action.type === 'modul' || x.action.type === 'link' ? (
            <div className="row">
              <button className={x.risk === 'tinggi' ? 'ghost' : 'primary'} disabled={busy === x.code} onClick={() => apply(x)}>{busy === x.code ? 'Menerapkan…' : x.action.type === 'link' ? 'Buka' : owner ? 'Terapkan' : 'Minta ke pemilik'}</button>
              <button className="sm ghost" onClick={() => dismiss(x)}>Abaikan 30 hari</button>
            </div>
          ) : <span className="small muted">Hanya pemilik yang bisa menerapkan.</span>}
        </section>
      ))}
    </div>
  );
}

// Petunjuk kecil di dashboard: jumlah saran untuk bisnis ini (pemilik/pengelola)
export function RecHint() {
  const { kos, kosId, ver } = useKos();
  const [n, setN] = useState(0);
  const show = canArea(kos, 'settings') && !kos?.closed_at;
  useEffect(() => { if (show) supabase.rpc('recommendations', { p_kos: kosId }).then(({ data }) => setN(Array.isArray(data) ? data.length : 0), () => {}); }, [kosId, ver, show]);
  if (!show || !n) return null;
  return <Link href="/konfigurasi?tab=saran" className="notice" style={{ display: 'block', textDecoration: 'none', color: 'inherit' }}>💡 <b>{n} saran</b> untuk {kos.name} berdasarkan data 30 hari terakhir · <span style={{ textDecoration: 'underline' }}>Lihat</span></Link>;
}
