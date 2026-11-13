'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { useKos } from '@/components/KosProvider';
import PageHelp from '@/components/PageHelp';
import { Loading, Empty, toast } from '@/components/ui';
import { errMsg, tgl } from '@/lib/format';
import { PLANS } from '@/lib/plan';
import { can, TYPE_ICON } from '@/lib/admin';
import { health } from '@/lib/health';

const FILTERS = [
  ['semua', 'Semua', () => true],
  ['risk', 'Skor < 60', (c) => c.h.score != null && c.h.score < 60],
  ['trial', 'Coba hampir habis', (c) => !c.paid && c.trial_left != null && c.trial_left >= 0 && c.trial_left <= 3],
  ['expiring', 'Langganan ≤ 7 hari', (c) => c.paid && c.paid_until && (new Date(c.paid_until) - new Date()) / 864e5 <= 7],
  ['idle', 'Tidak aktif 14+ hari', (c) => c.idle_days >= 14],
  ['paid', 'Berlangganan', (c) => c.paid],
];
const ago = (n) => (n == null ? '—' : n === 0 ? 'hari ini' : `${n} hari lalu`);

// Direktori pelanggan (per bisnis): cari, saring, skor kesehatan
export default function Pelanggan() {
  const { adminMe } = useKos();
  const [rows, setRows] = useState(null);
  const [err, setErr] = useState(null);
  const [q, setQ] = useState('');
  const [f, setF] = useState('semua');
  const [type, setType] = useState('semua');
  const [reqDel, setReqDel] = useState(null);   // permintaan hapus akun (antrean)
  const loadDel = () => supabase.rpc('admin_account_requests').then(({ data, error }) => setReqDel(error ? [] : (data || [])));
  useEffect(() => { if (can(adminMe, 'customers.view')) loadDel(); }, [adminMe]); // eslint-disable-line react-hooks/exhaustive-deps
  const putus = async (r, status) => {
    let note = '';
    if (status === 'selesai') note = window.prompt('Catatan (opsional), mis. "data keuangan disimpan sesuai retensi"', '');
    if (status === 'ditolak') note = window.prompt('Alasan penolakan (wajib)', '');
    if (note === null) return;
    note = note.trim();
    if (status === 'ditolak' && !note) return toast('Isi alasan penolakan.');
    const { error } = await supabase.rpc('admin_account_resolve', { p_id: r.id, p_status: status, p_note: note || null });
    if (error) return toast(errMsg(error));
    toast('Permintaan diperbarui'); loadDel();
  };
  useEffect(() => {
    try { const p = new URLSearchParams(window.location.search).get('f'); if (p && FILTERS.some(([k]) => k === p)) setF(p); } catch {}
    if (can(adminMe, 'customers.view')) supabase.rpc('admin_customers').then(({ data, error }) => (error ? setErr(errMsg(error)) : setRows(data)));
  }, [adminMe]);
  if (!can(adminMe, 'customers.view')) return <Empty title="Tidak punya izin melihat pelanggan" />;
  if (err) return <div className="notice bad">{err.includes('admin_customers') ? 'Database sedang diperbarui. Coba lagi beberapa menit lagi.' : err}</div>;
  if (!rows) return <Loading />;

  const all = rows.map((c) => ({ ...c, h: health(c) }));
  const term = q.trim().toLowerCase();
  const pass = FILTERS.find(([k]) => k === f)[2];
  const shown = all.filter((c) => pass(c) && (type === 'semua' || c.business_type === type)
    && (!term || c.name.toLowerCase().includes(term) || (c.owner_email || '').toLowerCase().includes(term)))
    .sort((a, b) => (a.h.score ?? 101) - (b.h.score ?? 101));

  return (
    <div className="stack">
      <div className="row"><h2>Pelanggan</h2><PageHelp page="admin-pelanggan" /></div>
      {reqDel?.length > 0 && (
        <section className="panel">
          <h3>Permintaan hapus akun ({reqDel.length})</h3>
          <p className="small muted" style={{ margin: 0 }}>Data bisnis yang wajib disimpan menurut ketentuan retensi tidak dihapus otomatis. Pastikan sesuai kebijakan sebelum menyatakan selesai.</p>
          <div className="list">{reqDel.map((r) => (
            <div key={r.id} className="li" style={{ alignItems: 'flex-start' }}>
              <div className="main">
                <b className="small">{r.email || '—'}</b>
                <span className="small muted">{r.bisnis || 'Tanpa bisnis'} · diajukan {tgl(String(r.created_at).slice(0, 10))}</span>
                <span className="small">Status: {r.status === 'diproses' ? 'sedang diproses' : 'menunggu'}</span>
                {can(adminMe, 'customers.override') && (
                  <div className="row" style={{ marginTop: 6, flexWrap: 'wrap' }}>
                    {r.status === 'menunggu' && <button className="sm ghost" onClick={() => putus(r, 'diproses')}>Diproses</button>}
                    <button className="sm" onClick={() => putus(r, 'selesai')}>Selesai</button>
                    <button className="sm ghost danger" onClick={() => putus(r, 'ditolak')}>Tolak</button>
                  </div>
                )}
              </div>
            </div>
          ))}</div>
        </section>
      )}
      <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cari nama bisnis atau email" aria-label="Cari pelanggan" />
      <div className="seg">{FILTERS.map(([k, l, fn]) => <button key={k} className={f === k ? 'on' : ''} onClick={() => setF(k)}>{l} ({all.filter(fn).length})</button>)}</div>
      <div className="seg">{[['semua', 'Semua jenis'], ['properti', '🏠 Properti'], ['retail', '🛒 Retail'], ['jasa', '🧺 Jasa'], ['kustom', '🧩 Kustom']].map(([k, l]) => <button key={k} className={type === k ? 'on' : ''} onClick={() => setType(k)}>{l}</button>)}</div>
      <p className="small muted" style={{ margin: 0 }}>Diurutkan dari skor kesehatan terendah. Skor versi awal: penggunaan laporan belum dilacak.</p>
      {shown.length === 0 ? <Empty title={all.length ? 'Tidak ada yang cocok' : 'Belum ada pelanggan'} /> : (
        <section className="panel"><div className="list">{shown.map((c) => (
          <Link key={c.id} href={`/admin/pelanggan/${c.id}`} className="li" style={{ alignItems: 'flex-start', color: 'inherit', textDecoration: 'none' }}>
            <div className="main">
              <b>{TYPE_ICON[c.business_type]} {c.name}</b>
              <span className="small muted">{c.owner_email}</span>
              <span className="small">{PLANS[c.plan]?.name || c.plan}{!c.paid && c.trial_left != null && c.trial_left >= 0 ? ` · coba sisa ${c.trial_left} hari` : ''} · aktivitas {ago(c.idle_days)}</span>
              {c.h.reasons[0] && <span className="small" style={{ color: 'var(--att-fg)' }}>{c.h.reasons[0]}</span>}
            </div>
            <span className={'chip ' + c.h.tone} title="Skor kesehatan">{c.h.score != null ? `${c.h.score} · ${c.h.label}` : c.h.label}</span>
          </Link>
        ))}</div></section>
      )}
    </div>
  );
}
