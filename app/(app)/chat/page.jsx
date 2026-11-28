'use client';
// Chat pelanggan (pemilik & staf area kasir/operasional): kotak masuk semua percakapan dari portal toko (/b), portal grosir (/c)
// dan cek pesanan jasa (/b/[slug]/cek). Data: cx_inbox / cx_thread (database memeriksa akses); setelan chat: cx_settings_set (settings).
// HP: daftar → ketuk → percakapan. Laptop: daftar di kiri, percakapan di kanan (+ panel detail ≥1440px).
import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useKos } from '@/components/KosProvider';
import { PageHeader, useMedia } from '@/components/Page';
import PageHelp from '@/components/PageHelp';
import { Empty, Loading, toast } from '@/components/ui';
import { errMsg } from '@/lib/format';
import { canArea } from '@/lib/business';
import { CONV_STATUS, fmtDay, fmtTime } from '@/lib/tracking';
import StaffChat from '@/components/chat/StaffChat';
import styles from '@/components/chat/chat.module.css';

const FILTERS = [['semua', 'Semua'], ['belum_dibaca', 'Belum dibaca', 'unread'], ['saya', 'Ditugaskan ke saya', 'saya'], ['baru', 'Menunggu dibalas', 'baru'],
  ['ditangani', 'Sedang ditangani', 'ditangani'], ['menunggu_pelanggan', 'Menunggu pelanggan', 'menunggu_pelanggan'], ['tinggi', 'Prioritas tinggi'], ['selesai', 'Selesai']];
const when = (iso) => {
  if (!iso) return '';
  const d = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta' }).format(new Date(iso));
  return d === new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta' }).format(new Date()) ? fmtTime(iso) : fmtDay(iso);
};

export default function ChatPage() {
  const { kosId, kos } = useKos();
  const wide = useMedia('(min-width: 1024px)');
  const [filter, setFilter] = useState('semua');
  const [q, setQ] = useState('');
  const [d, setD] = useState(null);
  const [err, setErr] = useState('');
  const [sel, setSel] = useState(null);
  const [setup, setSetup] = useState(false);
  useEffect(() => { try { const c = new URLSearchParams(window.location.search).get('c'); if (c) setSel(c); } catch {} }, []);
  const load = useCallback(async () => {
    if (!kosId) return;
    const { data, error } = await supabase.rpc('cx_inbox', { p_kos: kosId, p_filter: filter, p_search: q.trim() || null });
    if (error) setErr(errMsg(error)); else { setErr(''); setD(data); }
  }, [kosId, filter, q]);
  useEffect(() => {
    const t0 = setTimeout(load, q ? 300 : 0);
    const t = setInterval(() => { if (!document.hidden) load(); }, 10000);
    return () => { clearTimeout(t0); clearInterval(t); };
  }, [load, q]);
  const pick = (id) => {
    setSel(id);
    const url = new URL(window.location.href); if (id) url.searchParams.set('c', id); else url.searchParams.delete('c');
    window.history.replaceState(null, '', url);
  };
  const settings = canArea(kos, 'settings');

  const head = <PageHeader title="Chat pelanggan" help={<PageHelp />}
    desc="Pesan dari portal toko, portal grosir, dan halaman cek pesanan. Status online & waktu respons yang dilihat pelanggan dihitung dari aktivitas tim di sini."
    actions={settings && <button type="button" className="sm" onClick={() => setSetup(!setup)}>{setup ? 'Tutup setelan' : 'Setelan chat'}</button>} />;
  if (err && !d) return <>{head}<div className="notice bad">{err}</div></>;
  if (!d) return <>{head}<Loading /></>;
  const counts = d.counts || {};
  const showList = wide || !sel;
  const list = <div className={styles.inbox}>
    {!d.enabled && <div className="notice warn">Chat pelanggan sedang dimatikan. Pelanggan tidak bisa mengirim pesan baru.{settings ? ' Nyalakan di Setelan chat.' : ''}</div>}
    <input type="search" placeholder="Cari nama, nomor pesanan, No. HP" aria-label="Cari percakapan" value={q} onChange={(e) => setQ(e.target.value)} />
    <div className={styles.filters} role="toolbar" aria-label="Saring percakapan">{FILTERS.map(([k, l, c]) => <button key={k} type="button" aria-pressed={filter === k} onClick={() => setFilter(k)}>
      {l}{c && counts[c] > 0 && <b>{counts[c]}</b>}</button>)}</div>
    {d.rows.length === 0 ? <Empty title={q || filter !== 'semua' ? 'Tidak ada percakapan di sini' : 'Belum ada percakapan'}
      text={q || filter !== 'semua' ? 'Coba saringan lain.' : 'Pelanggan bisa mengirim pesan dari portal toko, portal grosir, atau halaman cek pesanan. Bagikan tautan halaman bisnis Anda lewat ikon Bagikan.'} />
      : <div className={styles.rows}>{d.rows.map((r) => <button key={r.id} type="button" className={styles.conv} aria-current={sel === r.id} onClick={() => pick(r.id)}>
        <span className={styles.av} aria-hidden="true">{(r.customer || '?').trim()[0]?.toUpperCase()}</span>
        <span className={styles.main}><b>{r.customer}{r.number ? ` · ${r.number}` : ''}</b>
          <span>{r.last_sender === 'business' ? 'Anda: ' : ''}{r.preview || '—'}</span>
          <span>{r.priority === 'tinggi' && <em className={styles.high}>Prioritas · </em>}{CONV_STATUS[r.status][0]}{r.assigned_name ? ` · ${r.assigned_name}` : ''}</span></span>
        <span className={styles.side}>{when(r.last_at)}{r.unread > 0 && <span className={styles.count}>{r.unread}</span>}</span>
      </button>)}</div>}
  </div>;

  return <>
    {head}
    {setup && settings && <ChatSettings kosId={kosId} kos={kos} enabled={d.enabled} onSaved={() => { setSetup(false); load(); }} />}
    <div className={`${styles.layout} ${!wide && sel ? styles.single : ''}`}>
      {showList && list}
      {sel ? <StaffChat key={sel} convId={sel} kosId={kosId} onBack={wide ? null : () => pick(null)} onChanged={load} />
        : wide && <div className="panel muted" style={{ alignSelf: 'start' }}>Pilih percakapan di kiri untuk membalas.</div>}
    </div>
  </>;
}

function ChatSettings({ kosId, kos, enabled, onSaved }) {
  const { loadKos } = useKos();
  const [on, setOn] = useState(enabled);
  const [text, setText] = useState((kos?.profile?.chat?.balasan || []).join('\n'));
  const [busy, setBusy] = useState(false);
  const save = async (e) => {
    e.preventDefault();
    const lines = text.split('\n').map((x) => x.trim()).filter(Boolean);
    if (lines.length > 10) return toast('Balasan cepat maksimal 10 baris');
    setBusy(true);
    const { error } = await supabase.rpc('cx_settings_set', { p_kos: kosId, p_active: on, p_replies: lines });
    setBusy(false);
    if (error) return toast(errMsg(error));
    toast('Setelan chat disimpan'); loadKos?.(); onSaved();
  };
  return <form className={`panel ${styles.settings}`} onSubmit={save}>
    <b>Setelan chat</b>
    <label className="row small" style={{ gap: 8, flexWrap: 'nowrap', fontWeight: 700 }}><input type="checkbox" style={{ width: 22, minHeight: 22, flex: 'none' }} checked={on} onChange={(e) => setOn(e.target.checked)} /> Pelanggan boleh mengirim chat dari portal</label>
    <label className="f">Balasan cepat (satu per baris, maks. 10)<textarea value={text} maxLength={3300} onChange={(e) => setText(e.target.value)}
      placeholder={'Halo! Stok masih ada, kak.\nPesanan sedang kami siapkan.\nTerima kasih sudah berbelanja.'} /></label>
    <span className="small muted">Balasan cepat tampil sebagai tombol di atas kolom ketik; isinya bisa diubah sebelum dikirim. Perubahan tercatat di riwayat konfigurasi.</span>
    <button className="primary" disabled={busy}>{busy ? 'Menyimpan…' : 'Simpan setelan'}</button>
  </form>;
}
