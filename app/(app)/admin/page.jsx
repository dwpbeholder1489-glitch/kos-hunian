'use client';
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useKos } from '@/components/KosProvider';
import { Loading, Empty, Tile, Sheet, run } from '@/components/ui';
import { rp, tgl, errMsg, waLink } from '@/lib/format';
import { ADMIN_TEMPLATES, fillAdmin } from '@/lib/adminTemplates';
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
        <button className={tab === 'dampingi' ? 'on' : ''} onClick={() => setTab('dampingi')}>Pelanggan</button>
        <button className={tab === 'log' ? 'on' : ''} onClick={() => setTab('log')}>Aktivitas</button>
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
      {tab === 'log' && <Aktivitas />}
    </div>
  );
}

const EMAIL_NAME = { h0: 'Sambutan', kamar: 'Isi harga kamar', penghuni: 'Masukkan penghuni', bayar: 'Catat pembayaran', sapa: 'Ada yang bisa dibantu?', ringkasan: 'Fitur lain', coba5: 'Sisa 5 hari', coba2: 'Sisa 2 hari' };
const ORDER = ['Coba hampir habis', 'Berisiko', 'Belum mulai', 'Baru', 'Teraktivasi', 'Berlangganan'];
const ACTION = { buka_profil: 'Membuka profil', ubah_paket: 'Mengubah paket', setujui_pembayaran: 'Menyetujui pembayaran', tolak_pembayaran: 'Menolak pembayaran', tambah_catatan: 'Menambah catatan', kirim_wa: 'Membuka WhatsApp ke pelanggan', kirim_email: 'Membuka email ke pelanggan' };
const when = (ts) => { const s = String(ts); return `${tgl(s.slice(0, 10))} ${new Date(s).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Jakarta' })}`; };

// Daftar pelanggan: cari, saring status/paket, ketuk untuk detail. Urutan teratas paling perlu disapa.
function Pendampingan() {
  const [rows, setRows] = useState(null);
  const [err, setErr] = useState(null);
  const [f, setF] = useState('semua');
  const [plan, setPlan] = useState('semua');
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(null);
  useEffect(() => {
    supabase.rpc('admin_onboarding').then(({ data, error }) => (error ? setErr(errMsg(error)) : setRows(data || [])));
  }, []);
  if (err) return <div className="notice bad">{err.includes('admin_onboarding') ? 'Database belum diperbarui. Tunggu beberapa menit setelah pembaruan terpasang.' : err}</div>;
  if (!rows) return <Loading />;
  const list = rows.map((r) => ({ ...r, st: statusOf(r) }))
    .sort((a, b) => ORDER.indexOf(a.st[0]) - ORDER.indexOf(b.st[0]) || a.age_days - b.age_days);
  const count = (s) => list.filter((r) => r.st[0] === s).length;
  const term = q.trim().toLowerCase();
  const shown = list.filter((r) => (f === 'semua' || r.st[0] === f) && (plan === 'semua' || r.plan === plan)
    && (!term || r.kos_name.toLowerCase().includes(term) || (r.owner_email || '').toLowerCase().includes(term)));
  const ago = (n) => (n == null ? '—' : n === 0 ? 'hari ini' : `${n} hari lalu`);
  return (
    <div className="stack">
      <div className="grid">
        <Tile label="Pelanggan" value={list.length} sub={`${list.filter((r) => r.paid).length} berlangganan`} />
        <Tile tone={count('Coba hampir habis') + count('Berisiko') ? 'bad' : ''} label="Perlu disapa" value={count('Coba hampir habis') + count('Berisiko') + count('Belum mulai')} sub="coba hampir habis, berisiko, belum mulai" />
        <Tile label="Teraktivasi" value={count('Teraktivasi') + count('Berlangganan')} sub="sudah ada penghuni & pembayaran" />
      </div>
      <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cari nama kos atau email" aria-label="Cari pelanggan" />
      <div className="seg">
        <button className={f === 'semua' ? 'on' : ''} onClick={() => setF('semua')}>Semua ({list.length})</button>
        {ORDER.filter(count).map((s) => <button key={s} className={f === s ? 'on' : ''} onClick={() => setF(s)}>{s} ({count(s)})</button>)}
      </div>
      <div className="seg">{['semua', 'gratis', 'standar', 'pro'].map((p) => <button key={p} className={plan === p ? 'on' : ''} onClick={() => setPlan(p)}>{p === 'semua' ? 'Semua paket' : PLANS[p].name}</button>)}</div>
      <p className="small muted" style={{ margin: 0 }}>Berisiko = tidak ada catatan baru 14 hari. Belum mulai = 3 hari belum ada penghuni. Teraktivasi = sudah ada penghuni dan pembayaran.</p>
      {shown.length === 0 ? <Empty title={list.length ? 'Tidak ada yang cocok' : 'Belum ada pelanggan'} /> : (
        <section className="panel"><div className="list">{shown.map((r) => (
          <div className="li click" key={r.kos_id} style={{ alignItems: 'flex-start' }} onClick={() => setOpen(r)} role="button" tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && setOpen(r)}>
            <div className="main">
              <b>{r.kos_name}</b>
              <span className="small muted">{r.owner_email}</span>
              <span className="small">Hari ke-{r.age_days} · {PLANS[r.plan]?.name} · {r.active_leases} kamar terisi · aktivitas {ago(r.idle_days)}{r.trial_left != null && r.trial_left >= 0 && !r.paid ? ` · coba sisa ${r.trial_left} hari` : ''}</span>
              <span className="small muted">Langkah {stepsDone(r)}/{STEPS.length}{stepsDone(r) < STEPS.length ? ` · belum: ${STEPS.filter(([k]) => !r[k]).map(([, n]) => n).join(', ')}` : ''}</span>
            </div>
            <span className={'chip ' + r.st[1]}>{r.st[0]}</span>
          </div>
        ))}</div></section>
      )}
      {open && <Customer row={open} onClose={() => setOpen(null)} />}
    </div>
  );
}

// Detail satu pelanggan: akun, paket, ringkasan kos (tanpa data penghuni), catatan internal, chat cepat
function Customer({ row, onClose }) {
  const [c, setC] = useState(null);
  const [err, setErr] = useState(null);
  const [note, setNote] = useState('');
  const [tpl, setTpl] = useState(ADMIN_TEMPLATES[0][0]);
  const [msg, setMsg] = useState('');
  const load = () => supabase.rpc('admin_customer', { p_kos: row.kos_id }).then(({ data, error }) => (error ? setErr(errMsg(error)) : setC(data)));
  useEffect(() => { load(); }, [row.kos_id]);
  useEffect(() => { if (c) setMsg(fillAdmin(ADMIN_TEMPLATES.find((t) => t[0] === tpl)[2], c.kos)); }, [tpl, c]);
  const k = c?.kos;
  const addNote = async () => { if (await run(() => supabase.rpc('admin_add_note', { p_kos: row.kos_id, p_body: note }), 'Catatan disimpan', errMsg)) { setNote(''); load(); } };
  const record = (action) => supabase.rpc('admin_record', { p_action: action, p_kos: row.kos_id, p_detail: { template: tpl } });
  return (
    <Sheet title={row.kos_name} onClose={onClose}>
      {err ? <div className="notice bad">{err}</div> : !c ? <Loading /> : (<>
        <div className="list">
          <div className="li"><span className="muted small">Email</span><b className="small">{k.owner_email}</b></div>
          <div className="li"><span className="muted small">No. WA (dari Info untuk penghuni)</span><b className="small">{k.contact_phone || '—'}</b></div>
          <div className="li"><span className="muted small">Daftar</span><b className="small">{tgl(String(k.created_at).slice(0, 10))}</b></div>
          <div className="li"><span className="muted small">Paket</span><b className="small">{PLANS[k.effective_plan]?.name}{k.paid_until ? ` · bayar s.d. ${tgl(k.paid_until)}` : k.trial_until ? ` · coba s.d. ${tgl(k.trial_until)}` : ''}</b></div>
          <div className="li"><span className="muted small">Kos</span><b className="small">{c.counts.rooms} kamar · {c.counts.active_leases} terisi · {c.counts.payments} pembayaran · {c.counts.expenses} pengeluaran</b></div>
          <div className="li"><span className="muted small">Status</span><span className={'chip ' + row.st[1]}>{row.st[0]}</span></div>
        </div>

        <span className="label">Chat cepat</span>
        <select value={tpl} onChange={(e) => setTpl(e.target.value)} aria-label="Template pesan">{ADMIN_TEMPLATES.map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select>
        <textarea value={msg} onChange={(e) => setMsg(e.target.value)} style={{ minHeight: 110 }} aria-label="Isi pesan" />
        <div className="row">
          {k.contact_phone
            ? <a href={waLink(k.contact_phone, msg)} target="_blank" rel="noreferrer" onClick={() => record('kirim_wa')}><button className="primary">Buka WhatsApp</button></a>
            : <span className="small muted">Pelanggan belum mengisi nomor WhatsApp.</span>}
          <a href={`mailto:${k.owner_email}?subject=${encodeURIComponent('Kos Hunian · ' + k.name)}&body=${encodeURIComponent(msg)}`} onClick={() => record('kirim_email')}><button>Kirim email</button></a>
        </div>

        <span className="label">Catatan internal (tidak terlihat pelanggan)</span>
        <textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="mis. Sudah ditelepon, minta dibantu isi penghuni minggu depan" aria-label="Catatan baru" />
        <button onClick={addNote} disabled={!note.trim()}>Simpan catatan</button>
        {c.notes.length > 0 && <div className="list">{c.notes.map((n, i) => <div className="li" key={i} style={{ alignItems: 'flex-start' }}><span style={{ whiteSpace: 'pre-wrap' }}>{n.body}</span><span className="small muted" style={{ whiteSpace: 'nowrap' }}>{tgl(String(n.created_at).slice(0, 10))}</span></div>)}</div>}

        <span className="label">Pembayaran langganan</span>
        {c.requests.length === 0 ? <span className="small muted">Belum ada.</span> : <div className="list">{c.requests.map((r, i) => (
          <div className="li" key={i}><span className="small">{PLANS[r.plan]?.name} {r.months} bln · {rp(r.amount)} · {tgl(String(r.created_at).slice(0, 10))}</span><span className={'chip ' + (ST[r.status]?.[1] || '')}>{ST[r.status]?.[0] || r.status}</span></div>
        ))}</div>}

        <span className="label">Email otomatis terkirim</span>
        {c.emails.length === 0 ? <span className="small muted">Belum ada.</span> : <div className="list">{c.emails.map((e, i) => <div className="li" key={i}><span className="small">{e.what.replace(/\((\w+)\)/, (_, x) => `(${EMAIL_NAME[x] || x})`)}</span><span className="small muted">{tgl(String(e.at).slice(0, 10))}</span></div>)}</div>}

        <span className="label">Riwayat tindakan admin</span>
        {c.log.length === 0 ? <span className="small muted">Belum ada.</span> : <div className="list">{c.log.map((l, i) => <div className="li" key={i}><span className="small">{ACTION[l.action] || l.action}</span><span className="small muted">{when(l.created_at)}</span></div>)}</div>}
      </>)}
    </Sheet>
  );
}

// Catatan aktivitas admin (siapa melakukan apa, kapan)
function Aktivitas() {
  const [rows, setRows] = useState(null);
  const [err, setErr] = useState(null);
  const [hideView, setHideView] = useState(true);
  useEffect(() => { supabase.rpc('admin_log_list', { p_limit: 200 }).then(({ data, error }) => (error ? setErr(errMsg(error)) : setRows(data || []))); }, []);
  if (err) return <div className="notice bad">{err}</div>;
  if (!rows) return <Loading />;
  const shown = hideView ? rows.filter((r) => r.action !== 'buka_profil') : rows;
  const det = (r) => {
    const d = r.detail || {};
    if (r.action === 'ubah_paket') return `${PLANS[d.sebelum?.paket]?.name || d.sebelum?.paket} → ${PLANS[d.sesudah?.paket]?.name || d.sesudah?.paket}${d.sesudah?.bayar_sampai ? ` s.d. ${tgl(d.sesudah.bayar_sampai)}` : ''}`;
    if (r.action.endsWith('_pembayaran')) return `${PLANS[d.paket]?.name} ${d.bulan} bln · ${rp(d.jumlah)}`;
    return '';
  };
  return (
    <div className="stack">
      <label className="row small" style={{ fontWeight: 700 }}><input type="checkbox" style={{ width: 22, minHeight: 22 }} checked={hideView} onChange={(e) => setHideView(e.target.checked)} /> Sembunyikan "membuka profil"</label>
      {shown.length === 0 ? <Empty title="Belum ada aktivitas" /> : (
        <section className="panel"><div className="list">{shown.map((r, i) => (
          <div className="li" key={i} style={{ alignItems: 'flex-start' }}>
            <div className="main"><b className="small">{ACTION[r.action] || r.action}{r.kos_name ? ` · ${r.kos_name}` : ''}</b><span className="small muted">{det(r)}{det(r) ? ' · ' : ''}{r.actor_email}</span></div>
            <span className="small muted" style={{ whiteSpace: 'nowrap' }}>{when(r.created_at)}</span>
          </div>
        ))}</div></section>
      )}
    </div>
  );
}
