'use client';
// Pusat Notifikasi: lonceng + daftar ringkas, pendengar push saat aplikasi terbuka (suara khusus, getar, badge),
// kartu aktivasi cerdas, baris notifikasi, dan panduan pemasangan per perangkat.
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { useKos } from '@/components/KosProvider';
import { Dropdown } from '@/components/AppShell';
import { useMedia } from '@/components/Page';
import { toast } from '@/components/ui';
import { errMsg } from '@/lib/format';
import { CATS, PRIORITY, ago, buzz, chime, detect, enablePush, guideFor, primeAudio, pushStatus, refreshCounts, subscribeCounts, syncPush } from '@/lib/notif';

export const BellIcon = ({ size = 18 }) => <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" /><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" /></svg>;

// Ikon kategori (garis sederhana, mengikuti gaya NavIcon)
const CAT_PATH = {
  aktivitas: <><path d="M9 11l3 3 8-8" /><path d="M20 12v6a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h9" /></>,
  penjualan: <><circle cx="9" cy="20" r="1.5" /><circle cx="18" cy="20" r="1.5" /><path d="M3 4h2l2.4 11.2a2 2 0 0 0 2 1.6h7.7a2 2 0 0 0 2-1.5L21 8H6" /></>,
  pembelian: <><path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z" /><path d="M3 6h18" /><path d="M16 10a4 4 0 0 1-8 0" /></>,
  keuangan: <><rect x="2" y="6" width="20" height="13" rx="2" /><path d="M2 10h20" /><path d="M6 15h4" /></>,
  inventaris: <><path d="M21 8 12 3 3 8v8l9 5 9-5z" /><path d="M3 8l9 5 9-5" /><path d="M12 13v8" /></>,
  karyawan: <><circle cx="9" cy="8" r="3.5" /><path d="M2.5 20a6.5 6.5 0 0 1 13 0" /><path d="M17 11h5M19.5 8.5v5" /></>,
  pelanggan: <><circle cx="12" cy="8" r="4" /><path d="M4 21a8 8 0 0 1 16 0" /></>,
  pengingat: <><circle cx="12" cy="13" r="8" /><path d="M12 9v4l2.5 2.5" /><path d="M5 3 2 6M19 3l3 3" /></>,
  sistem: <><path d="M12 2 4 5v6c0 5 3.4 9.4 8 11 4.6-1.6 8-6 8-11V5z" /><path d="m9 12 2 2 4-4" /></>,
};
export const CatIcon = ({ cat, size = 20 }) => (
  <span className={'nt-ic c-' + cat} aria-hidden="true">
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">{CAT_PATH[cat] || CAT_PATH.aktivitas}</svg>
  </span>
);

const fmtRp = (n) => 'Rp ' + Math.round(Number(n) || 0).toLocaleString('id-ID');

// Buka tujuan notifikasi: tandai dibaca, pindah bisnis bila perlu, lalu ke halaman sumber (tujuan dari database)
export function useOpenNotif() {
  const { kosId, list, pickKos } = useKos();
  const router = useRouter();
  return useCallback(async (n, toDetail = false) => {
    if (toDetail) { router.push('/pusat-notifikasi/' + n.id); return; }
    const { data } = await supabase.rpc('notif_open', { p_id: n.id });
    const link = data?.link || '/pusat-notifikasi';
    if (data?.kos_id && data.kos_id !== kosId) {
      if (!(list || []).some((k) => k.id === data.kos_id)) { toast('Anda bukan anggota bisnis itu lagi.'); return; }
      pickKos(data.kos_id);
    }
    refreshCounts();
    router.push(link);
  }, [kosId, list, pickKos, router]);
}

// Satu baris notifikasi (dipakai dropdown, daftar, beranda)
export function NotifRow({ n, onOpen, showKos, compact, actions }) {
  const pr = PRIORITY[n.priority];
  return (
    <div className={'nt-row' + (n.read ? '' : ' unread') + (compact ? ' compact' : '')}>
      <button type="button" className="nt-main" onClick={() => onOpen(n)}>
        <CatIcon cat={n.category} />
        <span className="nt-txt">
          <span className="nt-top"><b>{n.title}</b><time dateTime={n.at}>{ago(n.at)}</time></span>
          <span className="nt-body">{n.body}{n.amount != null && !/Rp\s?[\d.]/.test(n.body || '') ? ` · ${fmtRp(n.amount)}` : ''}</span>
          {(showKos && n.kos_name) || n.priority === 'kritis' || n.priority === 'tinggi' ? (
            <span className="nt-meta">{(n.priority === 'kritis' || n.priority === 'tinggi') && <span className={'chip ' + pr[1]}>{pr[0]}</span>}{showKos && n.kos_name && <span className="small muted">{n.kos_name}</span>}</span>
          ) : null}
        </span>
        {!n.read && <span className="nt-dot" aria-label="Belum dibaca" />}
      </button>
      {actions}
    </div>
  );
}

// Isi dropdown lonceng (dimuat saat dibuka)
function BellPanel({ todo }) {
  const { kosId } = useKos();
  const open = useOpenNotif();
  const [items, setItems] = useState(null);
  const load = useCallback(() => supabase.rpc('notif_list', { p_kos: kosId, p_limit: 6 }).then(({ data }) => setItems(data || [])), [kosId]);
  useEffect(() => { load(); }, [load]);
  const markAll = async () => { await supabase.rpc('notif_mark_all', { p_kos: kosId, p_cat: null }); await load(); refreshCounts(); };
  return (
    <div className="nt-panel">
      <div className="nt-ph"><b>Notifikasi</b>{items?.some((x) => !x.read) && <button type="button" className="linkbtn" onClick={markAll}>Tandai semua dibaca</button>}</div>
      {todo?.count > 0 && <Link href={todo.href} className="nt-todo"><span className="chip warn">{todo.count}</span><span>{todo.label}</span><span aria-hidden="true">›</span></Link>}
      {items === null ? <p className="small muted nt-pad">Memuat…</p> : items.length === 0 ? (
        <p className="small muted nt-pad">Belum ada notifikasi. Aktivitas penting bisnis Anda akan muncul di sini.</p>
      ) : <div className="nt-list">{items.map((n) => <NotifRow key={n.id} n={n} compact onOpen={(x) => { document.activeElement?.blur(); open(x); }} />)}</div>}
      <div className="nt-pf"><Link href="/pusat-notifikasi">Lihat semua notifikasi</Link><Link href="/pusat-notifikasi/pengaturan" aria-label="Pengaturan notifikasi">Pengaturan</Link></div>
    </div>
  );
}

// Lonceng di topbar/header. Angka = notifikasi belum dibaca + hal yang perlu ditindaklanjuti (hitungan lama tetap ada).
export function NotifBellMenu({ todo }) {
  const { kosId } = useKos();
  const wide = useMedia('(min-width: 768px)');
  const [c, setC] = useState({ unread: 0 });
  useEffect(() => (kosId ? subscribeCounts(kosId, setC) : undefined), [kosId]);
  const count = (c.unread || 0) + (todo?.count || 0);
  const badge = <><BellIcon />{count > 0 && <span className="nbadge">{count > 99 ? '99+' : count}</span>}</>;
  const label = count ? `Notifikasi: ${c.unread || 0} belum dibaca${todo?.count ? `, ${todo.count} perlu ditindaklanjuti` : ''}` : 'Notifikasi';
  if (!wide) return <Link href="/pusat-notifikasi" className="helpbtn bell" aria-label={label} title="Notifikasi">{badge}</Link>;
  return <Dropdown label={label} className="helpbtn bell" button={badge}><BellPanel todo={todo} /></Dropdown>;
}

// Di layout: pesan dari service worker saat aplikasi terbuka → bunyi khusus, getar, perbarui lonceng; sinkron langganan
export function NotifLive() {
  const { kosId, session } = useKos();
  const router = useRouter();
  const [prefs, setPrefs] = useState({ sound: true, vibrate: true });
  useEffect(() => {
    if (!session) return;
    supabase.rpc('notif_settings_get', { p_kos: null }).then(({ data }) => data && setPrefs({ sound: data.sound !== false, vibrate: data.vibrate !== false }), () => {});
    const t = setTimeout(() => { syncPush(); }, 4000);   // tidak mengganggu muat halaman
    const prime = () => primeAudio();
    window.addEventListener('pointerdown', prime, { once: true });
    return () => { clearTimeout(t); window.removeEventListener('pointerdown', prime); };
  }, [session?.user?.id]);
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;
    const on = (e) => {
      const m = e.data || {};
      if (m.type === 'prasara-notif') {
        refreshCounts(kosId);
        if (document.visibilityState === 'visible') {
          const strong = m.d?.p === 'kritis' || m.d?.p === 'tinggi';
          if (prefs.sound) chime(strong);
          if (prefs.vibrate && m.d?.v !== false) buzz(strong);
          toast(m.d?.t ? `${m.d.t}${m.d.b ? ' — ' + m.d.b : ''}` : 'Notifikasi baru');
        }
      } else if (m.type === 'prasara-open' && typeof m.u === 'string' && m.u.startsWith('/') && !m.u.startsWith('//')) router.push(m.u);
    };
    navigator.serviceWorker.addEventListener('message', on);
    const vis = () => { if (document.visibilityState === 'visible' && kosId) refreshCounts(kosId); };
    document.addEventListener('visibilitychange', vis);
    return () => { navigator.serviceWorker.removeEventListener('message', on); document.removeEventListener('visibilitychange', vis); };
  }, [kosId, prefs.sound, prefs.vibrate, router]);
  return null;
}

// Status perangkat dalam bahasa awam
export const STATUS_TEXT = {
  aktif: ['Aktif di perangkat ini', 'good', 'Notifikasi penting akan muncul walau PRASARA sedang ditutup.'],
  dimatikan: ['Dimatikan untuk perangkat ini', 'void', 'Perangkat terdaftar, tapi Anda mematikan notifikasinya di Perangkat terhubung.'],
  belum_diminta: ['Belum diaktifkan', 'warn', 'Ketuk Aktifkan Notifikasi. Browser akan menanyakan izin sekali.'],
  perlu_ulang: ['Perlu diaktifkan ulang', 'warn', 'Langganan perangkat ini kedaluwarsa atau milik akun lain. Ketuk Aktifkan Notifikasi.'],
  ditolak: ['Izin ditolak', 'bad', 'Browser/HP menolak notifikasi PRASARA. Izinkan lewat pengaturan browser atau HP (lihat Bantuan), lalu kembali ke sini.'],
  perlu_pasang: ['Perlu dipasang ke Layar Utama', 'info', 'Di iPhone/iPad, notifikasi hanya bisa aktif bila PRASARA dibuka dari ikon di Layar Utama.'],
  hanya_aplikasi: ['Hanya di dalam aplikasi', 'void', 'Browser ini tidak mendukung notifikasi push. Notifikasi tetap tersimpan di Pusat Notifikasi.'],
  tidak_didukung: ['Perangkat tidak didukung', 'void', 'Gunakan Chrome/Edge/Firefox terbaru, atau iPhone iOS 16.4 ke atas. PRASARA tetap bisa dipakai seperti biasa.'],
  belum_siap: ['Sementara tidak tersedia', 'warn', 'Server notifikasi belum bisa dihubungi. Coba lagi beberapa saat lagi.'],
};

// Kartu aktivasi cerdas: muncul hanya di Beranda, hanya bila perangkat mendukung & belum aktif, bisa ditunda 14 hari
export function ActivationCard({ always = false, onDone }) {
  const [st, setSt] = useState(null);
  const [busy, setBusy] = useState(false);
  const [hidden, setHidden] = useState(() => { try { return !always && Number(localStorage.getItem('prasara-notif-nanti') || 0) > Date.now(); } catch { return false; } });
  useEffect(() => { if (!hidden) pushStatus().then(setSt); }, [hidden]);
  if (hidden || !st) return null;
  if (!always && !['belum_diminta', 'perlu_ulang', 'perlu_pasang'].includes(st.code)) return null;
  const later = () => { try { localStorage.setItem('prasara-notif-nanti', String(Date.now() + 14 * 864e5)); } catch {} setHidden(true); };
  const go = async () => {
    setBusy(true);
    try { await enablePush(); toast('Notifikasi aktif. Pesan uji akan masuk sebentar lagi.'); const s = await pushStatus(); setSt(s); onDone?.(s); }
    catch (e) { toast(errMsg(e)); setSt(await pushStatus()); }
    setBusy(false);
  };
  const [title, tone, text] = STATUS_TEXT[st.code] || STATUS_TEXT.belum_diminta;
  return (
    <section className="panel nt-act" aria-label="Aktifkan notifikasi">
      <div className="nt-act-h"><span className="nt-act-ic"><BellIcon size={22} /></span>
        <div><b>{st.code === 'aktif' ? 'Notifikasi PRASARA aktif' : 'Jangan lewatkan aktivitas penting bisnis Anda'}</b>
          <p className="small muted">{st.code === 'perlu_pasang' ? text : st.code === 'aktif' ? text : 'Pesanan baru, stok menipis, tagihan, dan persetujuan langsung muncul di ' + st.platformName + ' Anda — tanpa email atau WhatsApp.'}</p></div></div>
      {always && <p className="small" style={{ margin: 0 }}><span className={'chip ' + tone}>{title}</span> <span className="muted">{st.label}{st.standalone ? ' · dibuka dari Layar Utama' : ''}</span></p>}
      <div className="row">
        {['belum_diminta', 'perlu_ulang'].includes(st.code) && <button className="primary" disabled={busy} onClick={go}>{busy ? 'Mengaktifkan…' : 'Aktifkan Notifikasi'}</button>}
        {st.code === 'perlu_pasang' && <Link className="nt-btn primary" href="/pusat-notifikasi/aktifkan">Pasang PRASARA</Link>}
        {st.code === 'ditolak' && <Link className="nt-btn" href="/pusat-notifikasi/bantuan#izin">Cara mengizinkan</Link>}
        {!always && <button className="ghost" onClick={later}>Nanti saja</button>}
      </div>
    </section>
  );
}

// ---------- Panduan per perangkat (ilustrasi CSS sederhana, tanpa gambar berat) ----------
const ShareIc = () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 3v12" /><path d="m8 7 4-4 4 4" /><path d="M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7" /></svg>;
const Dots = () => <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="12" cy="5" r="2" /><circle cx="12" cy="12" r="2" /><circle cx="12" cy="19" r="2" /></svg>;
export const GUIDES = {
  ios: { name: 'iPhone & iPad (Safari)', need: 'iOS/iPadOS 16.4 atau lebih baru', steps: [
    [<>Buka PRASARA di <b>Safari</b>, lalu ketuk tombol <b>Bagikan</b> <ShareIc /> di bawah layar.</>, 'share'],
    [<>Gulir dan pilih <b>Tambahkan ke Layar Utama</b> (Add to Home Screen), lalu ketuk <b>Tambah</b>.</>, 'add'],
    [<>Tutup Safari. Buka PRASARA dari <b>ikon P</b> di Layar Utama, lalu masuk.</>, 'icon'],
    [<>Buka menu Notifikasi › Pengaturan, ketuk <b>Aktifkan Notifikasi</b>, lalu pilih <b>Izinkan</b>.</>, 'allow'],
  ] },
  android: { name: 'Android (Chrome, Samsung Internet, Edge)', need: 'Chrome/Edge/Samsung Internet terbaru', steps: [
    [<>Ketuk <b>Aktifkan Notifikasi</b> di PRASARA.</>, 'bell'],
    [<>Saat browser bertanya, pilih <b>Izinkan</b>.</>, 'allow'],
    [<>Opsional: menu <Dots /> › <b>Tambahkan ke layar utama</b> / <b>Instal aplikasi</b> agar PRASARA terbuka seperti aplikasi.</>, 'add'],
  ] },
  desktop: { name: 'Windows / Mac / Chromebook (Chrome, Edge, Firefox)', need: 'browser versi terbaru', steps: [
    [<>Klik <b>Aktifkan Notifikasi</b> di PRASARA.</>, 'bell'],
    [<>Pada kotak izin di dekat alamat situs, klik <b>Izinkan</b>.</>, 'allow'],
    [<>Windows: pastikan Notifikasi aktif di Pengaturan › Sistem › Notifikasi untuk browser Anda. Mac: Pengaturan Sistem › Notifikasi › Chrome/Edge.</>, 'os'],
    [<>Opsional: ikon <b>Instal</b> di kolom alamat untuk memasang PRASARA sebagai aplikasi.</>, 'add'],
  ] },
  'mac-safari': { name: 'Mac (Safari)', need: 'macOS Ventura (Safari 16) atau lebih baru', steps: [
    [<>Klik <b>Aktifkan Notifikasi</b> di PRASARA, lalu <b>Izinkan</b>.</>, 'allow'],
    [<>Opsional: menu <b>File › Tambahkan ke Dock</b> untuk membuka PRASARA seperti aplikasi.</>, 'add'],
    [<>Bila tidak muncul: Pengaturan Sistem › Notifikasi › Safari (atau PRASARA) › izinkan.</>, 'os'],
  ] },
};
export function InstallGuide({ which, all }) {
  const keys = all ? Object.keys(GUIDES) : [which || guideFor(detect())];
  return keys.map((k) => (
    <div key={k} className="nt-guide">
      <b>{GUIDES[k].name}</b><span className="small muted">Butuh: {GUIDES[k].need}</span>
      <ol>{GUIDES[k].steps.map(([t, art], i) => <li key={i}><span className={'nt-art a-' + art} aria-hidden="true" /><span>{t}</span></li>)}</ol>
    </div>
  ));
}

export { CATS };
