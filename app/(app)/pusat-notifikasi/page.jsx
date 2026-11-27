'use client';
// Pusat Notifikasi: semua notifikasi akun ini untuk bisnis aktif (+ notifikasi akun), filter kategori, cari, belum dibaca, arsip.
import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { useKos } from '@/components/KosProvider';
import { PageHeader } from '@/components/Page';
import PageHelp from '@/components/PageHelp';
import { Empty, Loading, toast } from '@/components/ui';
import { errMsg } from '@/lib/format';
import { CATS, refreshCounts, subscribeCounts } from '@/lib/notif';
import { ActivationCard, NotifRow, useOpenNotif } from '@/components/NotifCenter';

const PAGE = 30;

export default function PusatNotifikasi() {
  const { kosId, list } = useKos();
  const open = useOpenNotif();
  const [cat, setCat] = useState('');
  const [unread, setUnread] = useState(false);
  const [arsip, setArsip] = useState(false);
  const [all, setAll] = useState(false);
  const [q, setQ] = useState('');
  const [items, setItems] = useState(null);
  const [more, setMore] = useState(false);
  const [counts, setCounts] = useState({ by_cat: {} });
  const [menu, setMenu] = useState(null);
  const seq = useRef(0);
  useEffect(() => (kosId ? subscribeCounts(kosId, setCounts) : undefined), [kosId]);

  const load = useCallback(async (before) => {
    const my = ++seq.current;
    const { data, error } = await supabase.rpc('notif_list', { p_kos: kosId, p_cat: cat || null, p_unread: unread, p_q: q.trim() || null, p_before: before || null, p_limit: PAGE, p_archived: arsip, p_all: all });
    if (my !== seq.current) return;
    if (error) { toast(errMsg(error)); setItems((x) => x || []); return; }
    setItems((x) => (before ? [...(x || []), ...data] : data));
    setMore(data.length === PAGE);
  }, [kosId, cat, unread, q, arsip, all]);
  useEffect(() => { if (!kosId) return; const t = setTimeout(() => load(), q ? 300 : 0); return () => clearTimeout(t); }, [load, kosId, q]);

  const act = async (rpc, args, msg) => {
    setMenu(null);
    const { error } = await supabase.rpc(rpc, args);
    if (error) return toast(errMsg(error));
    if (msg) toast(msg);
    await load(); refreshCounts();
  };
  const markAll = () => act('notif_mark_all', { p_kos: kosId, p_cat: cat || null }, 'Semua ditandai dibaca');
  const total = Object.values(counts.by_cat || {}).reduce((s, n) => s + n, 0);
  const multi = (list || []).length > 1;

  return (
    <div className="stack">
      <PageHeader title="Notifikasi" help={<PageHelp page="pusat-notifikasi" />} desc="Aktivitas penting bisnis Anda: pesanan, stok, tagihan, persetujuan, dan keamanan akun."
        actions={<><Link href="/pusat-notifikasi/pengaturan" className="nt-btn">Pengaturan</Link>{total > 0 && !arsip && <button className="primary" onClick={markAll}>Tandai semua dibaca</button>}</>} />

      <ActivationCard />

      <div className="nt-filter" role="tablist" aria-label="Kategori notifikasi">
        <button role="tab" aria-selected={!cat} className={!cat ? 'on' : ''} onClick={() => setCat('')}>Semua{total > 0 && <span className="nt-n">{total}</span>}</button>
        {Object.entries(CATS).map(([k, [l]]) => (
          <button key={k} role="tab" aria-selected={cat === k} className={cat === k ? 'on' : ''} onClick={() => setCat(k)}>{l}{counts.by_cat?.[k] > 0 && <span className="nt-n">{counts.by_cat[k]}</span>}</button>
        ))}
      </div>

      <div className="nt-tools">
        <input type="search" placeholder="Cari judul, isi, atau modul…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Cari notifikasi" />
        <label className="nt-check"><input type="checkbox" checked={unread} onChange={(e) => setUnread(e.target.checked)} />Belum dibaca</label>
        <label className="nt-check"><input type="checkbox" checked={arsip} onChange={(e) => setArsip(e.target.checked)} />Arsip</label>
        {multi && <label className="nt-check"><input type="checkbox" checked={all} onChange={(e) => setAll(e.target.checked)} />Semua bisnis</label>}
      </div>

      <section className="panel nt-box">
        {items === null ? <Loading /> : items.length === 0 ? (
          <Empty title={arsip ? 'Arsip kosong' : q || cat || unread ? 'Tidak ada yang cocok' : 'Belum ada notifikasi'}
            text={arsip ? 'Notifikasi yang Anda arsipkan akan tersimpan di sini.' : q || cat || unread ? 'Ubah kata kunci atau filter.' : 'Saat ada pesanan baru, stok menipis, pembayaran masuk, atau persetujuan menunggu, notifikasinya muncul di sini.'} />
        ) : (
          <div className="nt-list">
            {items.map((n) => (
              <NotifRow key={n.id} n={n} showKos={all || !n.kos_id} onOpen={(x) => open(x, true)}
                actions={<div className="nt-more">
                  <button type="button" className="ghost sm" aria-label={'Pilihan untuk ' + n.title} aria-expanded={menu === n.id} onClick={() => setMenu(menu === n.id ? null : n.id)}>⋯</button>
                  {menu === n.id && (
                    <div className="nt-pop" role="menu">
                      <button role="menuitem" onClick={() => open(n)}>Buka {n.module}</button>
                      <button role="menuitem" onClick={() => act('notif_mark', { p_ids: [n.id], p_read: !n.read }, null)}>{n.read ? 'Tandai belum dibaca' : 'Tandai dibaca'}</button>
                      <button role="menuitem" onClick={() => act('notif_archive', { p_ids: [n.id], p_archive: !n.archived }, n.archived ? 'Dikembalikan ke kotak masuk' : 'Diarsipkan')}>{n.archived ? 'Kembalikan dari arsip' : 'Arsipkan'}</button>
                      <button role="menuitem" className="danger" onClick={() => act('notif_delete', { p_ids: [n.id] }, 'Notifikasi dihapus')}>Hapus</button>
                    </div>
                  )}
                </div>} />
            ))}
          </div>
        )}
        {more && <button className="nt-loadmore" onClick={() => load(items[items.length - 1].at)}>Muat lebih banyak</button>}
      </section>
      <p className="small muted">Notifikasi info disimpan 60 hari, lainnya 180 hari. Anda hanya melihat notifikasi untuk modul yang boleh Anda buka.</p>
    </div>
  );
}
