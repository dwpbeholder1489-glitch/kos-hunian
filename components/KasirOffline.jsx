'use client';
// Kasir offline (Tahap 4 Retail): pengirim otomatis + bilah status (layout), antrean di HP ini (Kasir), dan daftar periksa pemilik (Penjualan › Offline).
import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { useKos } from '@/components/KosProvider';
import { Sheet, Empty, Loading, toast } from '@/components/ui';
import { DataTable } from '@/components/Page';
import { rp, angka, errMsg, waLink } from '@/lib/format';
import { PAY_ALL } from '@/lib/retail';
import { strukText } from '@/lib/struk';
import { canArea } from '@/lib/business';
import { online, onQueue, qAll, qDel, syncNow, pendingOf, adopt } from '@/lib/offline';

export const waktu = (ts) => (ts ? new Date(ts).toLocaleString('id-ID', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Jakarta' }) : '—');
export const STATE = { antre: ['Menunggu dikirim', 'warn'], tersimpan: ['Terkirim', 'good'], perlu_cek: ['Terkirim · perlu dicek', 'info'], gagal: ['Tidak tersimpan', 'bad'] };

// Status jaringan (navigator.onLine + kejadian online/offline)
export function useNet() {
  const [on, setOn] = useState(true);
  useEffect(() => {
    const f = () => setOn(online());
    f();
    window.addEventListener('online', f); window.addEventListener('offline', f);
    return () => { window.removeEventListener('online', f); window.removeEventListener('offline', f); };
  }, []);
  return on;
}
// Antrean & riwayat di HP ini (diperbarui setiap ada perubahan)
export function useQueue() {
  const [list, setList] = useState([]);
  const load = useCallback(() => { qAll().then(setList); }, []);
  useEffect(() => { load(); return onQueue(load); }, [load]);
  return list;
}

// ---------- di layout: pasang penyimpan halaman, kirim antrean otomatis, bilah status ----------
export function OfflineSync() {
  const { session, kos } = useKos();
  const path = usePathname();
  const net = useNet();
  const list = useQueue();
  const uid = session?.user?.id;
  const [stop, setStop] = useState(null);
  const mine = pendingOf(list).filter((e) => e.user === uid);
  const others = pendingOf(list).filter((e) => e.user !== uid);

  // Penyimpan halaman (service worker): pasang sekali, lalu segarkan salinan Kasir paling sering tiap 6 jam saat online
  useEffect(() => {
    if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;
    navigator.serviceWorker.register('/sw.js').then(() => navigator.serviceWorker.ready).then((reg) => {
      let last = 0; try { last = Number(localStorage.getItem('prasara-sw-warm') || 0); } catch {}
      if (online() && Date.now() - last > 6 * 3600e3 && reg.active) {
        reg.active.postMessage({ type: 'warm' });
        try { localStorage.setItem('prasara-sw-warm', String(Date.now())); } catch {}
      }
    }).catch(() => {});
  }, []);

  const retry = useRef(0);
  const send = useCallback(async (manual) => {
    if (!uid) return;
    const r = await syncNow(uid);
    setStop(r.stop);
    // HP merasa online tetapi server belum terjangkau (sinyal lemah): coba lagi lebih cepat — 5, 10, 20 detik, lalu ikut jadwal 30 detik
    clearTimeout(retry.t);
    if (r.stop === 'net' && online() && retry.current < 3) { retry.t = setTimeout(() => send(), 5000 * 2 ** retry.current); retry.current += 1; }
    if (!r.stop) retry.current = 0;
    if (r.sent > 0) toast(`${r.sent} transaksi offline terkirim${r.issues ? ` · ${r.issues} ditandai untuk dicek pemilik` : ''}.`);
    else if (manual && r.stop === 'net') toast('Masih offline. Antrean akan dikirim otomatis saat internet kembali.');
    else if (manual && r.failed) toast('Sebagian transaksi ditolak server. Lihat antrean di Kasir.');
  }, [uid]);
  // kirim saat aplikasi dibuka, saat internet kembali, saat aplikasi kembali dilihat, dan tiap 30 detik selama ada antrean
  useEffect(() => { if (net && mine.length) { retry.current = 0; send(); } }, [net, uid, mine.length > 0]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => clearTimeout(retry.t), []);
  useEffect(() => {
    if (!mine.length) return undefined;
    const t = setInterval(() => { if (online()) send(); }, 30000);
    const v = () => { if (document.visibilityState === 'visible' && online()) send(); };
    document.addEventListener('visibilitychange', v);
    return () => { clearInterval(t); document.removeEventListener('visibilitychange', v); };
  }, [mine.length, send]);

  const retail = kos?.business_type === 'retail';
  const onKasir = path.startsWith('/kasir');
  // Kasir punya kotak status sendiri (antrean & salinan katalog), jadi bilah ini tidak tampil di sana
  if (onKasir || (net && !mine.length && !others.length)) return null;
  return (
    <div className={'offbar' + (net ? '' : ' off')} role="status">
      <div className="wrap">
        <span>
          {!net ? <><b>Offline.</b> {retail && canArea(kos, 'sell') ? 'Kasir tetap bisa dipakai — penjualan disimpan di HP.' : 'Menu lain butuh internet.'}</> : null}
          {mine.length > 0 && <> <b>{mine.length} transaksi kasir</b> di HP ini {!net ? 'menunggu dikirim.' : stop === 'auth' ? 'menunggu Anda masuk ulang.' : stop === 'net' ? 'menunggu sinyal stabil — dicoba lagi otomatis.' : 'sedang dikirim…'}</>}
          {mine.length === 0 && others.length > 0 && <> {others.length} transaksi dari akun lain di HP ini belum terkirim.</>}
        </span>
        {retail && !onKasir && (!net || others.length > 0) && <Link href="/kasir" className="small">Buka Kasir →</Link>}
        {net && stop === 'auth' && <Link href="/masuk" className="small">Masuk ulang →</Link>}
        {net && mine.length > 0 && stop !== 'auth' && <button className="sm ghost" onClick={() => send(true)}>Kirim sekarang</button>}
      </div>
    </div>
  );
}

// ---------- struk transaksi yang masih di HP ----------
export function offlineStruk(kos, e) {
  const v = e.view || {};
  const p = e.payload;
  const s = {
    number: e.result?.number || v.number, sale_date: new Date(e.at).toLocaleDateString('sv-SE', { timeZone: 'Asia/Jakarta' }), sold_at: e.at,
    subtotal: v.sub, discount: Number(p.discount || 0), promo_discount: 0, total: v.total, pay_method: p.method,
    pay_split: p.method === 'campuran' ? Object.fromEntries((p.payments || []).map((x) => [x.method, x.amount])) : null,
    paid_amount: p.paid, due_date: p.due, status: 'selesai', tax_amount: 0,
  };
  return strukText(kos, s, (v.lines || []).map((l) => ({ ...l, line_total: Math.round(l.qty * l.price), serials: l.serials })), v.contact ? { name: v.contact } : null)
    + (e.result?.number ? '' : '\nNomor sementara · belum terkirim');
}

// Cetak hanya teks struk (lembar ini ada di atas halaman Kasir, jadi tidak memakai window.print halaman)
export function printText(t) {
  const f = document.createElement('iframe');
  f.setAttribute('aria-hidden', 'true');
  Object.assign(f.style, { position: 'fixed', right: 0, bottom: 0, width: 0, height: 0, border: 0 });
  document.body.appendChild(f);
  const d = f.contentWindow.document;
  d.open();
  d.write('<!doctype html><title>Struk</title><pre style="font:11px/1.4 ui-monospace,Menlo,Consolas,monospace;margin:0">' + t.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c])) + '</pre>');
  d.close();
  setTimeout(() => { try { f.contentWindow.focus(); f.contentWindow.print(); } catch {} setTimeout(() => f.remove(), 3000); }, 50);
}

export function OfflineStrukSheet({ kos, entry, onClose }) {
  const text = offlineStruk(kos, entry);
  return (
    <Sheet title="Struk" onClose={onClose}>
      <pre className="struk">{text}</pre>
      <div className="row">
        <button className="primary" onClick={() => printText(text)}>Cetak</button>
        <a href={entry.view?.phone ? waLink(entry.view.phone, '```\n' + text + '\n```') : `https://wa.me/?text=${encodeURIComponent('```\n' + text + '\n```')}`} target="_blank" rel="noreferrer"><button>Kirim via WhatsApp</button></a>
      </div>
      {!online() && <span className="small muted">Kirim via WhatsApp butuh internet. Cetak tetap bisa bila printer tersambung ke HP.</span>}
    </Sheet>
  );
}

// ---------- antrean di HP ini (dibuka dari Kasir) ----------
export function AntreanSheet({ kos, onClose }) {
  const { session } = useKos();
  const uid = session?.user?.id;
  const list = useQueue().filter((e) => e.kos === kos.id);
  const net = useNet();
  const [struk, setStruk] = useState(null);
  const [busy, setBusy] = useState(false);
  const manager = canArea(kos, 'finance') || canArea(kos, 'settings');
  const send = async () => { setBusy(true); const r = await syncNow(uid); setBusy(false); toast(r.stop === 'net' ? 'Masih offline.' : r.stop === 'auth' ? 'Sesi perlu diperbarui — masuk ulang lalu kirim lagi.' : `${r.sent} terkirim${r.failed ? `, ${r.failed} ditolak` : ''}.`); };
  const pend = list.filter((e) => e.state === 'antre');
  return (
    <Sheet title="Transaksi offline di HP ini" onClose={onClose}>
      <p className="small muted" style={{ margin: 0 }}>Penjualan saat offline disimpan di HP ini dan dikirim otomatis saat internet kembali (tidak tercatat dobel). Jangan hapus data browser/aplikasi sebelum semuanya terkirim.</p>
      {pend.length > 0 && <button className="primary" disabled={!net || busy} onClick={send}>{!net ? `${pend.length} menunggu internet` : busy ? 'Mengirim…' : `Kirim ${pend.length} transaksi sekarang`}</button>}
      {list.length === 0 ? <Empty title="Belum ada transaksi offline" text="Penjualan yang dicatat saat internet putus muncul di sini sampai terkirim." /> : (
        <div className="list">{list.map((e) => {
          const st = STATE[e.state] || STATE.antre;
          const own = e.user === uid;
          return (
            <div className="li" key={e.id} style={{ flexDirection: 'column', alignItems: 'stretch', gap: 6 }}>
              <div className="row between" style={{ flexWrap: 'nowrap', gap: 8 }}>
                <span style={{ minWidth: 0 }}><b>{e.result?.number || e.view?.number}</b> · {waktu(e.at)}</span>
                <b style={{ whiteSpace: 'nowrap' }}>{rp(e.view?.total)}</b>
              </div>
              <div className="row" style={{ gap: 6 }}>
                <span className={'chip ' + st[1]}>{st[0]}</span>
                <span className="small muted">{PAY_ALL[e.payload.method] || e.payload.method}{e.view?.contact ? ` · ${e.view.contact}` : ''}{!own ? ` · akun ${e.userName || 'lain'}` : ''}</span>
              </div>
              {e.err && <span className="small" style={{ color: 'var(--bad)' }}>{e.err}</span>}
              {e.result?.error && <span className="small" style={{ color: 'var(--bad)' }}>{e.result.error}</span>}
              {(e.result?.issues || []).map((i, k) => <span key={k} className="small" style={{ color: 'var(--warn)' }}>• {i.text}</span>)}
              <div className="row" style={{ gap: 6 }}>
                <button className="sm" onClick={() => setStruk(e)}>Struk</button>
                {e.state !== 'antre' && <button className="sm ghost" onClick={() => qDel(e.id)}>Hapus dari daftar</button>}
                {e.state === 'antre' && !own && manager && <button className="sm" onClick={() => adopt(e, uid, session?.user?.email).then(() => toast('Akan dikirim dengan akun Anda.'))}>Kirim dengan akun saya</button>}
                {e.state === 'antre' && e.err && <button className="sm ghost" onClick={() => {
                  // eslint-disable-next-line no-alert
                  if (window.confirm('Hapus transaksi ini dari HP? Penjualan ini BELUM tercatat di PRASARA — catat ulang bila benar terjadi.')) qDel(e.id);
                }}>Hapus</button>}
              </div>
            </div>
          );
        })}</div>
      )}
      {struk && <OfflineStrukSheet kos={kos} entry={struk} onClose={() => setStruk(null)} />}
    </Sheet>
  );
}

// ---------- pemilik: Penjualan › Offline ----------
const ISSUE = { harga: 'Harga', promo: 'Promo', stok: 'Stok', batas_diskon: 'Batas diskon', kasbon: 'Kasbon', shift: 'Shift', tutup_hari: 'Tutup harian', jam: 'Jam HP', lama: 'Terlambat', lokasi: 'Lokasi', nomor_seri: 'Nomor seri', prospek: 'Prospek' };
export function OfflineReview({ kosId, ver, onOpen }) {
  const [f, setF] = useState('perlu');
  const [d, setD] = useState(null);
  const [err, setErr] = useState(null);
  const [rev, setRev] = useState(null);
  const load = useCallback(() => {
    supabase.rpc('pos_offline_list', { p_kos: kosId, p_filter: f }).then(({ data, error }) => (error ? setErr(errMsg(error)) : setD(data)));
  }, [kosId, f]);
  useEffect(() => { load(); }, [load, ver]);
  if (err) return <div className="notice bad">{err.includes('pos_offline') ? 'Database sedang diperbarui. Coba lagi beberapa menit lagi.' : err}</div>;
  if (!d) return <Loading />;
  const save = async () => {
    const { error } = await supabase.rpc('pos_offline_review', { p_id: rev.id, p_note: rev.note });
    if (error) return toast(errMsg(error));
    setRev(null); toast('Ditandai sudah dicek.'); load();
  };
  const st = (r) => STATE[r.status] || STATE.antre;
  return (
    <div className="stack">
      <p className="small muted" style={{ margin: 0 }}>Penjualan yang dicatat kasir saat internet putus. Semua yang berstatus <b>Terkirim</b> sudah masuk penjualan, stok, dan pembukuan dengan tanggal & jam aslinya. Yang ditandai <b>perlu dicek</b> tetap tersimpan — periksa temuannya (harga berubah, stok jadi minus, diskon lewat batas, dll.). <b>Tidak tersimpan</b> = belum masuk penjualan; catat ulang bila benar terjadi.</p>
      <div className="row between">
        <div className="seg">{[['perlu', `Perlu dicek${d.open ? ` (${d.open})` : ''}`], ['cek', 'Semua bertemuan'], ['semua', 'Semua']].map(([k, l]) => <button key={k} className={f === k ? 'on' : ''} onClick={() => setF(k)} aria-pressed={f === k}>{l}</button>)}</div>
        <span className="small muted">{angka(d.week)} kiriman offline 7 hari terakhir</span>
      </div>
      {d.rows.length === 0 ? <Empty title={f === 'perlu' ? 'Tidak ada yang perlu dicek' : 'Belum ada transaksi offline'} text="Transaksi offline yang terkirim tanpa temuan langsung masuk Penjualan seperti biasa." /> : (
        <DataTable rows={d.rows} pageSize={25} onRow={(r) => r.sale_id && onOpen?.(r.sale_id)}
          columns={[
            { key: 'waktu', label: 'Waktu transaksi', main: true, render: (r) => <span>{waktu(r.used_at)}<br /><span className="small muted">terkirim {waktu(r.received_at)}</span></span> },
            { key: 'no', label: 'Nomor', render: (r) => <span style={{ whiteSpace: 'nowrap' }}>{r.number || '—'}</span> },
            { key: 'kasir', label: 'Kasir', hide: 'tablet', render: (r) => (r.cashier || '—').split('@')[0] },
            { key: 'status', label: 'Status', render: (r) => <span className={'chip ' + st(r)[1]}>{r.reviewed_at ? 'Sudah dicek' : st(r)[0]}</span> },
            { key: 'temuan', label: 'Temuan', render: (r) => <Temuan r={r} /> },
            { key: 'total', label: 'Total', align: 'right', render: (r) => rp(r.total) },
            { key: 'aksi', label: '', render: (r) => (r.status !== 'tersimpan' && !r.reviewed_at ? <button className="sm" onClick={(ev) => { ev.stopPropagation(); setRev({ id: r.id, note: '' }); }}>Tandai dicek</button> : null) },
          ]}
          card={(r) => (
            <div className="stack" style={{ gap: 6 }}>
              <div className="row between" style={{ flexWrap: 'nowrap', gap: 8 }}><b style={{ minWidth: 0 }}>{r.number || 'Belum tersimpan'} · {waktu(r.used_at)}</b><b style={{ whiteSpace: 'nowrap' }}>{rp(r.total)}</b></div>
              <div className="row" style={{ gap: 6 }}><span className={'chip ' + st(r)[1]}>{r.reviewed_at ? 'Sudah dicek' : st(r)[0]}</span><span className="small muted">{(r.cashier || '').split('@')[0]} · terkirim {waktu(r.received_at)}</span></div>
              <Temuan r={r} />
              {r.status !== 'tersimpan' && !r.reviewed_at && <button className="sm" style={{ alignSelf: 'flex-start' }} onClick={(ev) => { ev.stopPropagation(); setRev({ id: r.id, note: '' }); }}>Tandai sudah dicek</button>}
            </div>
          )} />
      )}
      {rev && <Sheet title="Tandai sudah dicek" onClose={() => setRev(null)}>
        <p className="small muted" style={{ margin: 0 }}>Catat apa yang sudah dilakukan (mis. stok sudah dihitung ulang, selisih harga sudah dibicarakan dengan kasir). Transaksinya tidak berubah.</p>
        <textarea rows={3} value={rev.note} onChange={(e) => setRev({ ...rev, note: e.target.value })} placeholder="Catatan (opsional)" />
        <button className="primary" onClick={save}>Simpan</button>
      </Sheet>}
    </div>
  );
}
function Temuan({ r }) {
  if (r.status === 'gagal') return (
    <div className="small" style={{ display: 'grid', gap: 2 }}>
      <span style={{ color: 'var(--bad)' }}>{r.error}</span>
      {(r.lines || []).map((l, i) => <span key={i} className="muted" style={{ overflowWrap: 'anywhere' }}>{angka(l.qty)} {l.unit} {l.name} × {rp(l.price)}</span>)}
      {r.method && <span className="muted">Dibayar: {PAY_ALL[r.method] || r.method}</span>}
    </div>
  );
  if (!r.issues?.length) return <span className="small muted">—</span>;
  return (
    <div className="small" style={{ display: 'grid', gap: 2 }}>
      {r.issues.map((i, k) => <span key={k} style={{ overflowWrap: 'anywhere' }}><b>{ISSUE[i.code] || i.code}:</b> {i.text}</span>)}
      {r.review_note && <span className="muted">Catatan: {r.review_note}</span>}
    </div>
  );
}
