'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { useKos } from '@/components/KosProvider';
import PageHelp from '@/components/PageHelp';
import { Loading, Empty, Tile, run } from '@/components/ui';
import { rp, tgl, errMsg } from '@/lib/format';
import { PLANS } from '@/lib/plan';
import { can, ACTION } from '@/lib/admin';

const ST = { menunggu: ['Menunggu', 'gold'], disetujui: ['Disetujui', 'good'], ditolak: ['Ditolak', 'bad'], batal: ['Dibatalkan pelanggan', 'void'], kedaluwarsa: ['Kedaluwarsa', 'void'] };
const KIND = { baru: 'baru', perpanjang: 'perpanjangan', upgrade: 'naik paket', downgrade: 'turun paket' };

// Verifikasi pembayaran langganan (manual: cocokkan dengan mutasi rekening/QRIS sebelum mengaktifkan)
export default function Langganan() {
  const { adminMe, loadKos } = useKos();
  const [reqs, setReqs] = useState(null);
  const [kos, setKos] = useState(null);
  const [tab, setTab] = useState('menunggu');
  const [err, setErr] = useState(null);
  const [recon, setRecon] = useState([]);
  const [hist, setHist] = useState(null);
  const load = async () => {
    const [a, b, c] = await Promise.all([supabase.rpc('admin_list_requests'), supabase.rpc('admin_list_kos'), supabase.rpc('admin_recon_list')]);
    if (a.error || b.error) return setErr(errMsg(a.error || b.error));
    setReqs(a.data); setKos(b.data); setRecon(c.error ? [] : (c.data || []));
  };
  useEffect(() => { if (can(adminMe, 'payments.view')) load(); }, [adminMe]);
  useEffect(() => { if (tab === 'paket' && !hist) supabase.rpc('admin_log_list', { p_limit: 500 }).then(({ data }) => setHist((data || []).filter((l) => ['ubah_paket', 'override', 'setujui_pembayaran', 'batal_langganan', 'lanjut_langganan', 'ubah_harga', 'paket_baru', 'migrasi_paket', 'rekonsiliasi', 'batal_tagihan'].includes(l.action)))); }, [tab]);
  if (!can(adminMe, 'payments.view')) return <Empty title="Tidak punya izin melihat pembayaran" />;
  if (err) return <div className="notice bad">{/admin_list/.test(err) ? 'Database sedang diperbarui. Coba lagi beberapa menit lagi.' : err}</div>;
  if (!reqs) return <Loading />;

  const decide = async (r, ok) => {
    if (!confirm(ok ? `Aktifkan ${r.plan_name || r.plan} ${r.months} bulan (${r.number || ''}) untuk "${r.kos_name}"?\nPastikan uang ${rp(r.amount)} SUDAH MASUK di mutasi rekening/QRIS.` : `Tolak permintaan dari "${r.kos_name}"?`)) return;
    if (await run(() => supabase.rpc('admin_decide_request', { p_request: r.id, p_approve: ok }), ok ? 'Paket diaktifkan' : 'Permintaan ditolak', errMsg)) { load(); loadKos(); }
  };
  const pending = reqs.filter((r) => r.status === 'menunggu');
  const openRecon = recon.filter((c) => c.status === 'terbuka');
  const shown = tab === 'menunggu' ? pending : reqs;
  const today = new Date(Date.now() + 7 * 3600e3).toISOString().slice(0, 10);
  const active = kos.filter((k) => k.paid_until && (k.paid_until >= today || (k.next_until && k.next_until >= today)) && k.plan !== 'gratis');
  const trials = kos.filter((k) => !(k.paid_until && k.paid_until >= today) && k.trial_until && k.trial_until >= today);
  const cancels = kos.filter((k) => k.cancel_at_end);

  return (
    <div className="stack">
      <div className="row"><h2>Langganan & pembayaran</h2><PageHelp page="admin-langganan" /></div>
      <div className="grid">
        <Tile label="Menunggu verifikasi" value={pending.length} tone={pending.length ? 'bad' : ''} sub={pending.length ? `senilai ${rp(pending.reduce((s, r) => s + Number(r.amount), 0))}` : 'tidak ada'} />
        <Tile label="Langganan aktif" value={active.length} sub={`dari ${kos.length} bisnis`} />
        <Tile label="Masa coba" value={trials.length} sub="belum berlangganan" />
        <Tile label="Tidak diperpanjang" value={cancels.length} tone={cancels.length ? 'bad' : ''} sub="memilih berhenti" />
      </div>
      <div className="seg">{[['menunggu', `Menunggu (${pending.length})`], ['semua', 'Riwayat'], ['aktif', 'Langganan aktif'], ...(can(adminMe, 'audit.view') ? [['paket', 'Perubahan paket']] : [])].map(([k, l]) => <button key={k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>{l}</button>)}</div>
      {openRecon.length > 0 && (
        <section className="panel"><h3>Pembayaran perlu dicocokkan ({openRecon.length})</h3>
          <p className="small muted" style={{ margin: 0 }}>Pembayaran gateway yang belum cocok otomatis. Cocokkan ke tagihan yang menunggu, atau abaikan bila bukan pembayaran langganan.</p>
          <div className="list">{openRecon.map((c) => <ReconItem key={c.id} c={c} requests={reqs} onDone={() => { load(); loadKos(); }} />)}</div>
        </section>
      )}
      {!['aktif', 'paket'].includes(tab) && (shown.length === 0 ?<Empty title={tab === 'menunggu' ? 'Tidak ada pembayaran yang menunggu' : 'Belum ada pembayaran'} /> : (
        <section className="panel"><div className="list">{shown.map((r) => (
          <div className="li" key={r.id} style={{ alignItems: 'flex-start' }}>
            <div className="main">
              <b><Link href={`/admin/pelanggan/${r.kos_id}`} style={{ color: 'inherit' }}>{r.kos_name}</Link></b>
              <span className="small muted">{r.owner_email} · {tgl(r.created_at.slice(0, 10))}</span>
              <span className="small">{r.number ? `${r.number} · ` : ''}{r.plan_name || r.plan} {r.months} bulan{r.kind ? ` (${KIND[r.kind] || r.kind})` : ''} · {r.method === 'qris' ? 'QRIS' : r.method === 'transfer' ? 'Transfer' : 'Online'}{r.note ? ` · "${r.note}"` : ''}</span>
              {r.trx_code && <span className="small muted">ID transaksi {r.trx_code}{r.provider && r.provider !== 'manual' ? ` · ${r.provider}` : ''}</span>}
              {r.status === 'menunggu' && can(adminMe, 'payments.verify') && <div className="row" style={{ marginTop: 6 }}>
                <button className="sm primary" onClick={() => decide(r, true)}>Uang masuk, aktifkan</button>
                <button className="sm danger" onClick={() => decide(r, false)}>Tolak</button>
              </div>}
            </div>
            <div style={{ textAlign: 'right' }}><div className="num">{rp(r.amount)}</div><span className={'chip ' + (ST[r.status] || [r.status, 'void'])[1]}>{(ST[r.status] || [r.status])[0]}</span></div>
          </div>
        ))}</div></section>
      ))}
      {tab === 'aktif' && (active.length === 0 ? <Empty title="Belum ada langganan aktif" /> : (
        <section className="panel"><div className="list">{active.sort((a, b) => a.paid_until.localeCompare(b.paid_until)).map((k) => (
          <Link key={k.id} href={`/admin/pelanggan/${k.id}`} className="li" style={{ color: 'inherit', textDecoration: 'none' }}>
            <div className="main"><b>{k.name}</b><span className="small muted">{k.owner_email}</span></div>
            <div style={{ textAlign: 'right' }}><span className="chip good">{k.plan_name || k.effective_plan}</span><br /><span className="small muted">s.d. {tgl(k.paid_until)}</span>{k.next_plan && <><br /><span className="small muted">lalu {k.next_plan} s.d. {tgl(k.next_until)}</span></>}{k.cancel_at_end && <><br /><span className="chip bad">Tidak diperpanjang</span></>}</div>
          </Link>
        ))}</div></section>
      ))}
      {tab === 'paket' && (!hist ? <Loading /> : hist.length === 0 ? <Empty title="Belum ada perubahan paket" /> : (
        <section className="panel"><div className="list">{hist.map((l, i) => {
          const d = l.detail || {}; const pl = (x) => (x ? `${PLANS[x.paket]?.name || x.paket}${x.bayar_sampai ? ` s.d. ${tgl(x.bayar_sampai)}` : x.coba_sampai ? ` (coba s.d. ${tgl(x.coba_sampai)})` : ''}` : '');
          return (
            <div className="li" key={i} style={{ alignItems: 'flex-start' }}>
              <div className="main">
                <b className="small">{l.kos_id ? <Link href={`/admin/pelanggan/${l.kos_id}`} style={{ color: 'inherit' }}>{l.kos_name}</Link> : `Paket ${d.paket || ''}`} · {ACTION[l.action] || l.action}</b>
                {d.harga_baru != null && <span className="small">{rp(d.harga_lama)} → {rp(d.harga_baru)} (versi {d.versi})</span>}
                {d.sebelum && <span className="small">{pl(d.sebelum)} → {pl(d.sesudah)}</span>}
                {d.alasan && <span className="small">Alasan: {d.alasan}</span>}
                <span className="small muted">{l.actor_email || 'sistem'}</span>
              </div>
              <span className="small muted" style={{ whiteSpace: 'nowrap' }}>{tgl(String(l.created_at).slice(0, 10))}</span>
            </div>
          );
        })}</div></section>
      ))}
      <p className="small muted" style={{ margin: 0 }}>Perpanjangan manual, kompensasi, atau tambah masa coba: buka profil pelanggan › Override akses (wajib alasan).</p>
    </div>
  );
}

const ALASAN_RECON = {
  tidak_ada_tagihan: 'Tidak ada tagihan menunggu dengan email & nominal ini',
  lebih_dari_satu: 'Lebih dari satu tagihan cocok',
  nominal_beda: 'Nominal tidak sama dengan tagihan',
  ref_ganda: 'Nomor transaksi ini sudah pernah dipakai',
  aktivasi_gagal: 'Pembayaran tercatat, tetapi paket belum aktif',
  tanda_tangan: 'Tanda tangan tidak sah (tidak bisa dicocokkan)',
};

// Satu pembayaran yang perlu dicocokkan: pilih tagihan menunggu dengan nominal sama, beri alasan, lalu cocokkan atau abaikan
function ReconItem({ c, requests, onDone }) {
  const d = c.detail || {};
  const nominal = Number(d.amount || 0);
  const kandidat = requests.filter((r) => r.status === 'menunggu' && Number(r.amount) === nominal);
  const [pilih, setPilih] = useState(kandidat.length === 1 ? kandidat[0].id : '');
  const ulang = c.reason === 'aktivasi_gagal';
  const bisaCocok = c.reason !== 'tanda_tangan' && (ulang || kandidat.length > 0);
  const minta = (teks) => { const a = window.prompt(teks); return a && a.trim().length >= 5 ? a.trim() : null; };
  const cocokkan = async () => {
    if (!ulang && !pilih) return;
    const alasan = minta('Alasan pencocokan (minimal 5 huruf), mis. "uang masuk di mutasi 13 Nov":');
    if (!alasan) return;
    if (await run(() => supabase.rpc('admin_recon_resolve', { p_recon: c.id, p_action: 'cocokkan', p_request: ulang ? null : pilih, p_reason: alasan }), 'Pembayaran dicocokkan', errMsg)) onDone();
  };
  const abaikan = async () => {
    const alasan = minta('Alasan mengabaikan (minimal 5 huruf):');
    if (!alasan) return;
    if (await run(() => supabase.rpc('admin_recon_resolve', { p_recon: c.id, p_action: 'abaikan', p_request: null, p_reason: alasan }), 'Diabaikan', errMsg)) onDone();
  };
  return (
    <div className="li" style={{ alignItems: 'flex-start', flexDirection: 'column' }}>
      <div className="main">
        <b>{rp(nominal)} · {d.email || 'tanpa email'}</b>
        <span className="small muted">{c.provider || 'gateway'} · ref {d.ref || '-'}{c.received_at ? ` · ${tgl(String(c.received_at).slice(0, 10))}` : ''}</span>
        <span className="small">{ALASAN_RECON[c.reason] || c.reason}</span>
      </div>
      {!ulang && c.reason !== 'tanda_tangan' && (kandidat.length > 0
        ? <select value={pilih} onChange={(e) => setPilih(e.target.value)} style={{ width: '100%', marginTop: 6 }}>
            <option value="">Pilih tagihan…</option>
            {kandidat.map((r) => <option key={r.id} value={r.id}>{r.number || r.id.slice(0, 8)} · {r.kos_name} · {r.plan_name || r.plan} {r.months} bulan</option>)}
          </select>
        : <span className="small muted" style={{ marginTop: 6 }}>Belum ada tagihan menunggu dengan nominal {rp(nominal)}.</span>)}
      <div className="row" style={{ marginTop: 6 }}>
        {bisaCocok && <button className="sm primary" onClick={cocokkan} disabled={!ulang && !pilih}>{ulang ? 'Coba aktifkan ulang' : 'Cocokkan'}</button>}
        <button className="sm ghost" onClick={abaikan}>Abaikan</button>
      </div>
    </div>
  );
}
