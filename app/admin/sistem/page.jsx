'use client';
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useKos } from '@/components/KosProvider';
import PageHelp from '@/components/PageHelp';
import { Loading, Empty, Tile } from '@/components/ui';
import { tgl, errMsg } from '@/lib/format';
import { can } from '@/lib/admin';

const when = (ts) => { const s = String(ts); return `${tgl(s.slice(0, 10))} ${new Date(s).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Jakarta' })}`; };
const PART = { reminders: 'Pengingat', onboarding: 'Pendampingan', summaries: 'Ringkasan', toko: 'Pengingat toko', otomatisasi: 'Otomatisasi' };
const TBL = { bisnis: 'Bisnis', transaksi_toko: 'Transaksi toko', tagihan_kos: 'Tagihan kos', pembayaran_kos: 'Pembayaran kos', tiket: 'Tiket' };

// Status sistem: kesehatan layanan tanpa menampilkan rahasia apa pun
export default function Sistem() {
  const { adminMe } = useKos();
  const [db, setDb] = useState(null);
  const [srv, setSrv] = useState(null);
  const [err, setErr] = useState(null);
  const [ev, setEv] = useState(null);   // pemantauan peristiwa (event_reconcile): jumlah per jenis & dokumen tanpa peristiwa
  useEffect(() => {
    if (!can(adminMe, 'system.view')) return;
    supabase.rpc('event_reconcile').then(({ data }) => setEv(data || null), () => {});
    supabase.rpc('admin_system').then(({ data, error }) => (error ? setErr(errMsg(error)) : setDb(data)));
    supabase.auth.getSession().then(({ data }) => fetch('/api/admin/status', { headers: { authorization: 'Bearer ' + data.session?.access_token } }))
      .then((r) => r.json()).then(setSrv).catch(() => setSrv({ error: 'Server aplikasi tidak menjawab' }));
  }, [adminMe]);
  if (!can(adminMe, 'system.view')) return <Empty title="Tidak punya izin melihat status sistem" />;
  if (err) return <div className="notice bad">{err}</div>;
  if (!db) return <Loading />;
  const last = db.cron[0];
  const stale = !last || Date.now() - new Date(last.ran_at).getTime() > 26 * 3600e3;

  return (
    <div className="stack">
      <div className="row"><h2>Status sistem</h2><PageHelp page="admin-sistem" /></div>
      <div className="grid">
        <Tile label="Database" value="Tersambung" tone="good" sub={`jam server ${when(db.db_time).slice(-5)} WIB`} />
        <Tile label="Jadwal otomatis harian" value={!last ? 'Belum tercatat' : last.ok && !stale ? 'Berjalan' : 'Periksa'} tone={!last || !last.ok || stale ? 'bad' : 'good'} sub={last ? `terakhir ${when(last.ran_at)}` : 'jalan tiap 07.00 WIB'} />
        <Tile label="Email terkirim hari ini" value={db.emails_today} sub="batas Gmail ±500/hari" tone={db.emails_today > 400 ? 'bad' : ''} />
      </div>
      <section className="panel">
        <h3>Layanan</h3>
        {!srv ? <Loading /> : srv.error ? <div className="notice bad">{srv.error}</div> : <div className="list">
          {srv.services.map((s) => <div className="li" key={s.name}><span className="small">{s.name}</span><span className={'chip ' + (s.ok ? 'good' : 'bad')}>{s.ok ? 'Terpasang' : 'Belum'}</span></div>)}
          {srv.pending.map((n) => <div className="li" key={n}><span className="small">{n}</span><span className="chip">Belum dibangun</span></div>)}
          <div className="li"><span className="small muted">Lingkungan</span><span className="small">{srv.env}{srv.commit ? ` · versi ${srv.commit}` : ''}</span></div>
        </div>}
        <span className="small muted">Hanya menampilkan terpasang atau belum. Nilai kunci rahasia tidak pernah ditampilkan.</span>
      </section>
      <section className="panel">
        <h3>Riwayat jadwal otomatis</h3>
        {db.cron.length === 0 ? <span className="small muted">Belum ada catatan. Catatan mulai terisi setelah jadwal pukul 07.00 WIB berikutnya.</span> : <div className="list">{db.cron.map((c, i) => (
          <div className="li" key={i} style={{ alignItems: 'flex-start' }}>
            <span className="small">{when(c.ran_at)}<br /><span className="muted">{Object.entries(c.result || {}).filter(([, v]) => v && typeof v === 'object').map(([k, v]) => `${PART[k] || k} ${v.ok ? '✓' : '✗'}`).join(' · ')}</span></span>
            <span className={'chip ' + (c.ok ? 'good' : 'bad')}>{c.ok ? 'OK' : 'Gagal'}</span>
          </div>
        ))}</div>}
      </section>
      {ev && <section className="panel">
        <h3>Peristiwa transaksi (7 hari)</h3>
        {(() => { const gap = Object.values(ev.celah || {}).reduce((t, n) => t + Number(n), 0); return (
          <div className={'notice ' + (gap ? 'bad' : 'good')}>{gap ? `${gap} dokumen tanpa peristiwa tercatat — periksa trigger di database.` : 'Lengkap: setiap penjualan, pembayaran, pesanan, dan pengeluaran tercatat sebagai peristiwa.'}</div>); })()}
        <div className="list">{Object.entries(ev.per_jenis || {}).sort((a, b) => b[1] - a[1]).map(([k, n]) => <div className="li" key={k}><span className="small">{k}</span><b className="small">{Number(n).toLocaleString('id-ID')}</b></div>)}</div>
        {Object.keys(ev.per_jenis || {}).length === 0 && <span className="small muted">Belum ada peristiwa dalam 7 hari terakhir.</span>}
        <span className="small muted">Hanya jumlah — isi transaksi pelanggan tidak ditampilkan.</span>
      </section>}
      <section className="panel">
        <h3>Jumlah data</h3>
        <div className="list">{Object.entries(db.tables).map(([k, v]) => <div className="li" key={k}><span className="small">{TBL[k] || k}</span><b className="small">{Number(v).toLocaleString('id-ID')}</b></div>)}</div>
      </section>
    </div>
  );
}
