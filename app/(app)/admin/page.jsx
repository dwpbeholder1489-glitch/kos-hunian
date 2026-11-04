'use client';
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useKos } from '@/components/KosProvider';
import { Loading, Empty, Tile, run } from '@/components/ui';
import { rp, tgl, errMsg } from '@/lib/format';
import { PLANS } from '@/lib/plan';
import { STEPS, stepsDone, statusOf } from '@/lib/onboardingRules';

const ST = { menunggu: ['Menunggu', 'gold'], disetujui: ['Disetujui', 'good'], ditolak: ['Ditolak', 'bad'] };

export default function Admin() {
  const { isAdmin, loadKos } = useKos();
  const [kos, setKos] = useState(null);
  const [reqs, setReqs] = useState(null);
  const [tab, setTab] = useState('permintaan');
  const [err, setErr] = useState(null);

  async function load() {
    const [a, b] = await Promise.all([supabase.rpc('admin_list_kos'), supabase.rpc('admin_list_requests')]);
    if (a.error || b.error) { setErr(errMsg(a.error || b.error)); return; }
    setKos(a.data); setReqs(b.data);
  }
  useEffect(() => { if (isAdmin) load(); }, [isAdmin]);

  if (!isAdmin) return <Empty title="Khusus admin" text="Halaman ini hanya untuk pengelola aplikasi Kos Hunian." />;
  if (err) return <div className="notice bad">{err}</div>;
  if (!kos) return <Loading />;

  const decide = async (r, ok) => {
    if (!confirm(ok ? `Aktifkan ${PLANS[r.plan].name} ${r.months} bulan untuk "${r.kos_name}"? Pastikan uang ${rp(r.amount)} sudah masuk.` : `Tolak permintaan dari "${r.kos_name}"?`)) return;
    if (await run(() => supabase.rpc('admin_decide_request', { p_request: r.id, p_approve: ok }), ok ? 'Paket diaktifkan' : 'Permintaan ditolak', errMsg)) { load(); loadKos(); }
  };
  const setPlan = async (k, plan, months) => {
    const label = plan === 'gratis' ? 'jadikan Gratis' : `tambah ${PLANS[plan].name} ${months} bulan`;
    if (!confirm(`${label} untuk "${k.name}"?`)) return;
    if (await run(() => supabase.rpc('admin_set_plan', { p_kos: k.id, p_plan: plan, p_months: months }), 'Paket diperbarui', errMsg)) { load(); loadKos(); }
  };

  const pending = reqs.filter((r) => r.status === 'menunggu');
  const paying = kos.filter((k) => k.effective_plan !== 'gratis' && k.paid_until);
  const mrr = paying.reduce((s, k) => s + (PLANS[k.effective_plan]?.price || 0), 0);

  return (
    <div className="stack">
      <h2>Admin Kos Hunian</h2>
      <div className="grid">
        <Tile tone="hero" label="Pendapatan bulanan" value={rp(mrr)} sub={`${paying.length} kos berlangganan`} />
        <Tile label="Total kos terdaftar" value={kos.length} sub={`${kos.filter((k) => k.trial_until && k.effective_plan === 'pro' && !k.paid_until).length} sedang masa coba`} />
        <Tile tone={pending.length ? 'bad' : ''} label="Menunggu diperiksa" value={pending.length} sub="konfirmasi pembayaran" />
      </div>
      <div className="seg">
        <button className={tab === 'permintaan' ? 'on' : ''} onClick={() => setTab('permintaan')}>Pembayaran {pending.length ? `(${pending.length})` : ''}</button>
        <button className={tab === 'kos' ? 'on' : ''} onClick={() => setTab('kos')}>Semua kos</button>
        <button className={tab === 'dampingi' ? 'on' : ''} onClick={() => setTab('dampingi')}>Pendampingan</button>
      </div>

      {tab === 'permintaan' && (reqs.length === 0 ? <Empty title="Belum ada konfirmasi pembayaran" /> : (
        <section className="panel"><div className="list">{reqs.map((r) => (
          <div className="li" key={r.id} style={{ alignItems: 'flex-start' }}>
            <div className="main">
              <b>{r.kos_name}</b>
              <span className="small muted">{r.owner_email} · {tgl(r.created_at.slice(0, 10))}</span>
              <span className="small">{PLANS[r.plan].name} {r.months} bulan · {r.method === 'qris' ? 'QRIS' : 'Transfer'}{r.note ? ` · "${r.note}"` : ''}</span>
              {r.status === 'menunggu' && <div className="row" style={{ marginTop: 6 }}>
                <button className="sm primary" onClick={() => decide(r, true)}>Uang masuk, aktifkan</button>
                <button className="sm danger" onClick={() => decide(r, false)}>Tolak</button>
              </div>}
            </div>
            <div style={{ textAlign: 'right' }}><div className="num">{rp(r.amount)}</div><span className={'chip ' + ST[r.status][1]}>{ST[r.status][0]}</span></div>
          </div>
        ))}</div></section>
      ))}

      {tab === 'kos' && (
        <section className="panel"><div className="list">{kos.map((k) => (
          <div className="li" key={k.id} style={{ alignItems: 'flex-start' }}>
            <div className="main">
              <b>{k.name}</b>
              <span className="small muted">{k.owner_email} · daftar {tgl(k.created_at.slice(0, 10))}</span>
              <span className="small">{k.active_leases}/{k.rooms} kamar terisi · {k.paid_until ? `bayar s.d. ${tgl(k.paid_until)}` : k.trial_until ? `coba s.d. ${tgl(k.trial_until)}` : '—'}</span>
              <div className="row" style={{ marginTop: 6 }}>
                <button className="sm" onClick={() => setPlan(k, 'standar', 1)}>+1 bln Standar</button>
                <button className="sm" onClick={() => setPlan(k, 'pro', 1)}>+1 bln Pro</button>
                <button className="sm ghost danger" onClick={() => setPlan(k, 'gratis', 0)}>Gratis</button>
              </div>
            </div>
            <span className={'chip ' + (k.effective_plan === 'gratis' ? 'void' : k.effective_plan === 'pro' ? 'gold' : 'good')}>{PLANS[k.effective_plan].name}</span>
          </div>
        ))}</div></section>
      )}

      {tab === 'dampingi' && <Pendampingan />}
    </div>
  );
}

const EMAIL_NAME = { h0: 'Sambutan', kamar: 'Isi harga kamar', penghuni: 'Masukkan penghuni', bayar: 'Catat pembayaran', sapa: 'Ada yang bisa dibantu?', ringkasan: 'Fitur lain', coba5: 'Sisa 5 hari', coba2: 'Sisa 2 hari' };
const ORDER = ['Coba hampir habis', 'Berisiko', 'Belum mulai', 'Baru', 'Teraktivasi', 'Berlangganan'];

// Status setiap pelanggan: siapa yang perlu disapa lebih dulu
function Pendampingan() {
  const [rows, setRows] = useState(null);
  const [err, setErr] = useState(null);
  const [f, setF] = useState('semua');
  useEffect(() => {
    supabase.rpc('admin_onboarding').then(({ data, error }) => (error ? setErr(errMsg(error)) : setRows(data || [])));
  }, []);
  if (err) return <div className="notice bad">{err.includes('admin_onboarding') ? 'Database belum diperbarui. Tunggu beberapa menit setelah pembaruan terpasang.' : err}</div>;
  if (!rows) return <Loading />;
  const list = rows.map((r) => ({ ...r, st: statusOf(r) }))
    .sort((a, b) => ORDER.indexOf(a.st[0]) - ORDER.indexOf(b.st[0]) || a.age_days - b.age_days);
  const count = (s) => list.filter((r) => r.st[0] === s).length;
  const shown = f === 'semua' ? list : list.filter((r) => r.st[0] === f);
  const ago = (n) => (n == null ? '—' : n === 0 ? 'hari ini' : `${n} hari lalu`);
  return (
    <div className="stack">
      <p className="small muted" style={{ margin: 0 }}>Urutan teratas paling perlu disapa. Berisiko = tidak ada catatan baru 14 hari. Belum mulai = 3 hari belum ada penghuni. Teraktivasi = sudah ada penghuni dan pembayaran.</p>
      <div className="seg">
        <button className={f === 'semua' ? 'on' : ''} onClick={() => setF('semua')}>Semua ({list.length})</button>
        {ORDER.filter(count).map((s) => <button key={s} className={f === s ? 'on' : ''} onClick={() => setF(s)}>{s} ({count(s)})</button>)}
      </div>
      {shown.length === 0 ? <Empty title="Belum ada pelanggan" /> : (
        <section className="panel"><div className="list">{shown.map((r) => (
          <div className="li" key={r.kos_id} style={{ alignItems: 'flex-start' }}>
            <div className="main">
              <b>{r.kos_name}</b>
              <a href={`mailto:${r.owner_email}`} className="small">{r.owner_email}</a>
              <span className="small">Hari ke-{r.age_days} · {r.active_leases} kamar terisi · aktivitas terakhir {ago(r.idle_days)}{r.trial_left != null && r.trial_left >= 0 && !r.paid ? ` · coba sisa ${r.trial_left} hari` : ''}</span>
              <span className="small muted">Langkah {stepsDone(r)}/{STEPS.length}{stepsDone(r) < STEPS.length ? ` · belum: ${STEPS.filter(([k]) => !r[k]).map(([, n]) => n).join(', ')}` : ''}</span>
              <span className="small muted">Email arahan: {r.onboarding_emails ? (r.sent_kinds.length ? r.sent_kinds.map((k) => EMAIL_NAME[k] || k).join(' → ') : 'belum ada') : 'dimatikan pemilik'}</span>
            </div>
            <span className={'chip ' + r.st[1]}>{r.st[0]}</span>
          </div>
        ))}</div></section>
      )}
    </div>
  );
}
