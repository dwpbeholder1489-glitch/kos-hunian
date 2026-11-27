'use client';
// Detail notifikasi: isi lengkap, modul, waktu, status, status pengiriman push (jujur: "diterima layanan push" ≠ dilihat), tombol ke sumber.
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { PageHeader } from '@/components/Page';
import { Loading } from '@/components/ui';
import { errMsg } from '@/lib/format';
import { CATS, PRIORITY, refreshCounts } from '@/lib/notif';
import { CatIcon, useOpenNotif } from '@/components/NotifCenter';

const waktu = (ts) => new Date(ts).toLocaleString('id-ID', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Jakarta' });
const PUSH = { antre: 'Menunggu dikirim', proses: 'Sedang dikirim', terkirim: 'Diterima layanan push', gagal: 'Gagal dikirim', kedaluwarsa: 'Kedaluwarsa (tidak dikirim)', dilewati: 'Tidak dikirim (sudah dibaca / tanpa perangkat)' };

export default function DetailNotifikasi() {
  const { id } = useParams();
  const open = useOpenNotif();
  const [n, setN] = useState(null);
  const [err, setErr] = useState(null);
  useEffect(() => {
    supabase.rpc('notif_get', { p_id: id }).then(async ({ data, error }) => {
      if (error) return setErr(errMsg(error));
      setN(data);
      if (!data.read) { await supabase.rpc('notif_mark', { p_ids: [id], p_read: true }); refreshCounts(); }
    });
  }, [id]);
  if (err) return <div className="stack"><PageHeader title="Detail notifikasi" desc={false} /><div className="notice bad">{err}</div><Link href="/pusat-notifikasi">← Kembali ke Notifikasi</Link></div>;
  if (!n) return <Loading />;
  const pr = PRIORITY[n.priority];
  return (
    <div className="stack">
      <PageHeader title="Detail notifikasi" desc={false} />
      <section className="panel nt-detail">
        <CatIcon cat={n.category} size={30} />
        <h3>{n.title}</h3>
        <p>{n.body}</p>
        {n.amount != null && <p className="nt-amt">Rp {Math.round(n.amount).toLocaleString('id-ID')}</p>}
        <dl className="nt-kv">
          <dt>Modul</dt><dd>{n.module}</dd>
          <dt>Kategori</dt><dd>{CATS[n.category]?.[0] || n.category}</dd>
          {n.kos_name && <><dt>Bisnis</dt><dd>{n.kos_name}</dd></>}
          <dt>Waktu</dt><dd>{waktu(n.at)}{n.n > 1 ? ` (${n.n} kejadian sejak ${waktu(n.created_at)})` : ''}</dd>
          <dt>Prioritas</dt><dd><span className={'chip ' + pr[1]}>{pr[0]}</span></dd>
          <dt>Status</dt><dd>{n.archived ? 'Diarsipkan' : 'Dibaca'}{n.opened ? ' · sudah dibuka' : ''}</dd>
          {n.push && <><dt>Push</dt><dd>{PUSH[n.push.status] || n.push.status}{n.push.devices > 0 ? ` · ${n.push.devices} perangkat` : ''}{n.push.status === 'antre' && n.push.next_at && new Date(n.push.next_at) > new Date() ? ` · setelah jam tenang (${waktu(n.push.next_at)})` : ''}</dd></>}
        </dl>
        <button className="primary" onClick={() => open(n)}>Buka {n.module} →</button>
        <Link href="/pusat-notifikasi" className="small">← Kembali ke semua notifikasi</Link>
      </section>
    </div>
  );
}
