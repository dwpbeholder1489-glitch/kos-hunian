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
  const [ig, setIg] = useState(null);
  const [nt, setNt] = useState(null);   // Notification Engine (admin_notif_overview): hanya angka, tanpa isi notifikasi
  const [xp, setXp] = useState(null);   // pemakaian fitur lintas bisnis (admin_experience_overview): agregat tanpa nama   // pemantauan integrasi (admin_integration_overview): hanya angka
  useEffect(() => {
    if (!can(adminMe, 'system.view')) return;
    supabase.rpc('event_reconcile').then(({ data }) => setEv(data || null), () => {});
    supabase.rpc('admin_integration_overview').then(({ data }) => setIg(data || null), () => {});
    supabase.rpc('admin_notif_overview').then(({ data }) => setNt(data || null), () => {});
    supabase.rpc('admin_experience_overview').then(({ data }) => setXp(data || null), () => {});
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
      {nt && <section className="panel">
        <h3>Notifikasi & push</h3>
        <div className="list">
          <div className="li"><span className="small">Notifikasi dibuat (7 hari)</span><b className="small">{nt.dibuat_7h}</b></div>
          <div className="li"><span className="small">Antrean push: menunggu / jatuh tempo / diproses</span><b className="small">{nt.antre} / {nt.antre_jatuh_tempo} / {nt.proses}</b></div>
          <div className="li"><span className="small">Antrean 7 hari per status</span><b className="small">{Object.entries(nt.antrean_7h || {}).map(([k, v]) => `${k} ${v}`).join(' · ') || '—'}</b></div>
          <div className="li"><span className="small">Kiriman per perangkat 7 hari (diterima layanan push ≠ dilihat)</span><b className="small">{Object.entries(nt.kirim_7h || {}).map(([k, v]) => `${k} ${v}`).join(' · ') || '—'}</b></div>
          <div className="li"><span className="small">Perangkat aktif / akun / dipasang di Layar Utama</span><b className="small">{nt.perangkat_aktif} / {nt.akun_perangkat} / {nt.pwa}</b></div>
          <div className="li"><span className="small">Perangkat per platform</span><b className="small">{Object.entries(nt.per_browser || {}).map(([k, v]) => `${k} ${v}`).join(' · ') || '—'}</b></div>
          <div className="li"><span className="small">Pengiriman instan (pg_net) / jadwal per menit (pg_cron)</span><b className="small">{nt.pg_net ? 'aktif' : 'tidak tersedia'} / {nt.pg_cron ? 'aktif' : 'tidak tersedia'}{!nt.alamat_terdaftar ? ' · alamat aplikasi belum terdaftar (terdaftar otomatis saat cron/pengirim pertama berjalan)' : ''}</b></div>
          <div className="li"><span className="small">Pengirim terakhir berjalan</span><b className="small">{nt.jalan_terakhir ? when(nt.jalan_terakhir) : '—'}{nt.hasil_terakhir ? ` · ${nt.hasil_terakhir.diterima || 0} diterima, ${nt.hasil_terakhir.ditunda || 0} ditunda, ${nt.hasil_terakhir.kedaluwarsa || 0} kedaluwarsa, ${nt.hasil_terakhir.gagal || 0} gagal` : ''}</b></div>
          <div className="li"><span className="small">Kunci VAPID</span><b className="small">{nt.kunci_vapid_db ? 'dibuat server (tersimpan di database)' : 'dari env server / belum dibuat'}</b></div>
          {nt.galat_terakhir && <div className="li"><span className="small">Galat pembuatan notifikasi terakhir (transaksi tetap berjalan)</span><b className="small">{when(nt.galat_terakhir.at)} · {nt.galat_terakhir.pesan}</b></div>}
        </div>
        <span className="small muted">Hanya angka & metadata teknis — isi notifikasi dan data bisnis pelanggan tidak ditampilkan.</span>
      </section>}
      {ig && <section className="panel">
        <h3>Integrasi (webhook masuk)</h3>
        <div className="list">
          <div className="li"><span className="small">Sambungan aktif / dijeda / total</span><b className="small">{ig.sambungan.aktif} / {ig.sambungan.dijeda} / {ig.sambungan.total} · {ig.sambungan.bisnis} bisnis</b></div>
          <div className="li"><span className="small">Kiriman 24 jam: masuk / ulang / ditolak</span><b className="small">{Number(ig.h1.ok || 0)} / {Number(ig.h1.duplikat || 0)} / {['tidak_valid', 'dibatasi', 'dijeda', 'nonaktif', 'galat'].reduce((t, k) => t + Number(ig.h1[k] || 0), 0)}</b></div>
          <div className="li"><span className="small">Tautan salah 24 jam</span><b className="small">{Number(ig.h1.token_salah || 0)}</b></div>
          <div className="li"><span className="small">Gangguan sistem 7 hari</span><b className="small">{Number(ig.h7.galat || 0)}</b></div>
          <div className="li"><span className="small">Kiriman berhasil terakhir</span><b className="small">{ig.terakhir_ok ? when(ig.terakhir_ok) : '—'}</b></div>
        </div>
        {Number(ig.h7.galat || 0) > 0 && <div className="notice bad">Ada gangguan sistem pada kiriman webhook dalam 7 hari terakhir — periksa log server (kata kunci "[hook]").</div>}
        {Number(ig.h1.token_salah || 0) >= 100 && <div className="notice bad">Banyak percobaan tautan salah dalam 24 jam — kemungkinan ada yang menebak alamat webhook.</div>}
        <span className="small muted">Hanya angka — kode sambungan dan isi kiriman tidak pernah ditampilkan. Penyedia lain ({ig.katalog.filter((c) => c.impl_status === 'planned').map((c) => c.name).join(', ')}) berstatus dalam rencana.</span>
      </section>}
      {xp && <section className="panel">
        <h3>Pemakaian fitur (30 hari)</h3>
        <span className="small muted">{xp.since ? `Dicatat sejak ${xp.since}` : 'Belum ada data'} · {Number(xp.bisnis_tercatat)} bisnis · {Number(xp.pengguna_tercatat)} pengguna. Hanya jumlah — tanpa nama bisnis atau pengguna.</span>
        {xp.menu_teratas.length > 0 && <><b className="small">Menu paling banyak dipakai (jumlah bisnis · kali dibuka)</b>
          <div className="list">{xp.menu_teratas.map((m) => <div className="li" key={m.path}><span className="small">{m.path}</span><b className="small">{m.bisnis} · {Number(m.n).toLocaleString('id-ID')}</b></div>)}</div></>}
        {xp.aksi_teratas.length > 0 && <><b className="small">Aksi cepat teratas</b>
          <div className="list">{xp.aksi_teratas.map((m) => <div className="li" key={m.id}><span className="small">{m.id}</span><b className="small">{m.bisnis} · {Number(m.n).toLocaleString('id-ID')}</b></div>)}</div></>}
        {xp.rekomendasi.length > 0 && <><b className="small">Rekomendasi 90 hari (saran · diterima · ditolak)</b>
          <div className="list">{xp.rekomendasi.map((m) => <div className="li" key={m.module}><span className="small">{m.name}</span><b className="small">{m.total} · {m.diterima} · {m.ditolak}</b></div>)}</div></>}
      </section>}
      <section className="panel">
        <h3>Jumlah data</h3>
        <div className="list">{Object.entries(db.tables).map(([k, v]) => <div className="li" key={k}><span className="small">{TBL[k] || k}</span><b className="small">{Number(v).toLocaleString('id-ID')}</b></div>)}</div>
      </section>
    </div>
  );
}
