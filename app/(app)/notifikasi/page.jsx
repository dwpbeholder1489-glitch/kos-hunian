'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import PageHelp from '@/components/PageHelp';
import { supabase } from '@/lib/supabase';
import { useKos } from '@/components/KosProvider';
import { useData } from '@/lib/useData';
import { Loading, run, toast } from '@/components/ui';
import { rp, tgl, today, bulan, errMsg } from '@/lib/format';
import { hasFeature } from '@/lib/plan';

const plusDays = (k, n) => { const d = new Date(k + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const prevMonth = (k) => { const [y, m] = k.split('-').map(Number); return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, '0')}`; };

// Hal yang perlu ditindaklanjuti, dihitung dari data yang tercatat
function items(d) {
  const t = today(), in3 = plusDays(t, 3), in14 = plusDays(t, 14);
  const out = [];
  const pending = d.payments.filter((p) => p.status === 'menunggu');
  if (pending.length) out.push(['bad', `${pending.length} pembayaran menunggu diperiksa`, 'Cocokkan dengan mutasi rekening, lalu tandai Uang sudah masuk atau Tolak.', '/pembayaran']);
  const overdue = d.invoices.filter((i) => i.overdue);
  if (overdue.length) out.push(['bad', `${overdue.length} tagihan lewat jatuh tempo`, `Total belum dibayar ${rp(overdue.reduce((s, i) => s + i.outstanding, 0))}. Kirim pengingat atau catat pembayarannya jika sudah diterima.`, '/tagihan']);
  const due = d.invoices.filter((i) => i.status !== 'batal' && i.outstanding > 0 && i.due_date >= t && i.due_date <= in3);
  const dueToday = due.filter((i) => i.due_date === t).length;
  if (due.length) out.push(['gold', dueToday ? `${dueToday} tagihan jatuh tempo hari ini` + (due.length > dueToday ? `, ${due.length - dueToday} lagi dalam 3 hari` : '') : `${due.length} tagihan jatuh tempo dalam 3 hari`, 'Perbarui statusnya jika pembayaran sudah diterima.', '/tagihan']);
  for (const l of d.leases.filter((x) => x.status === 'aktif' && x.end_date && x.end_date <= in14)) {
    out.push(['gold', `Sewa ${d.occName(l.occupant_id)} (${d.roomCode(l.room_id)}) ${l.end_date < t ? 'sudah lewat tanggal selesai' : `berakhir ${tgl(l.end_date)}`}`, l.end_date < t ? 'Jika penghuni sudah keluar, tekan Akhiri sewa agar kamar kembali Tersedia.' : 'Pastikan penghuni memperpanjang atau siapkan kamar untuk penghuni baru.', '/penghuni']);
  }
  const noRent = d.rooms.filter((r) => r.status !== 'tidak_disewakan' && !(r.rent > 0));
  if (noRent.length) out.push(['', `${noRent.length} kamar belum diisi harganya`, 'Harga kamar dipakai untuk tagihan otomatis.', '/kamar']);
  const noPhone = [...d.activeByOcc.keys()].filter((id) => !d.occById.get(id)?.phone);
  if (noPhone.length) out.push(['', `${noPhone.length} penghuni aktif belum ada nomor WhatsApp`, 'Tanpa nomor, tombol pengingat WhatsApp tidak muncul.', '/penghuni']);
  if (+t.slice(8) <= 7) {
    const pm = prevMonth(t.slice(0, 7));
    if (d.payments.some((p) => p.status === 'terverifikasi' && p.paid_at.startsWith(pm)) || d.expenses.some((x) => x.date.startsWith(pm))) {
      out.push(['good', `Ringkasan keuangan ${bulan(pm)} sudah siap`, 'Lihat pemasukan, pengeluaran, dan laba bulan lalu.', '/laporan']);
    }
  }
  return out;
}

export default function Notifikasi() {
  const d = useData();
  const { kos, user, loadKos } = useKos();
  const [hist, setHist] = useState(null);
  const [busy, setBusy] = useState(null);
  useEffect(() => {
    if (!kos) return;
    supabase.rpc('notification_history', { p_kos: kos.id }).then(({ data, error }) => setHist(error ? [] : data || []));
  }, [kos?.id]);
  if (!d.ready || !kos) return d.err ? <div className="notice bad">{d.err}</div> : <Loading />;
  const isOwner = kos.owner_id === user?.id;
  const list = items(d);

  const toggle = async (col, v, label) => {
    if (await run(() => supabase.from('kos').update({ [col]: v }).eq('id', kos.id), `${label} ${v ? 'dinyalakan' : 'dimatikan'}`, errMsg)) loadKos();
  };
  const sample = async (kind) => {
    setBusy(kind);
    try {
      const { data: ses } = await supabase.auth.getSession();
      const r = await fetch('/api/summary/now', { method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer ' + ses.session?.access_token }, body: JSON.stringify({ kosId: kos.id, kind }) });
      const x = await r.json();
      toast(!r.ok ? (x.error || 'Gagal mengirim') : x.sent ? `Contoh ringkasan ${kind} dikirim ke ${user?.email}` : 'Nyalakan ringkasan ini dulu, lalu coba lagi.');
    } catch { toast('Gagal terhubung'); }
    setBusy(null);
  };

  const OPTS = [
    ['daily_digest', 'Daftar tagih setiap pagi', 'Penghuni yang telat dan jatuh tempo 3 hari ke depan, dengan tombol Kirim WA. Hanya dikirim jika ada tagihan. Paket Standar.', !hasFeature(kos, 'pengingat_email')],
    ['weekly_summary', 'Ringkasan mingguan (setiap Senin)', 'Pemasukan dan pengeluaran 7 hari terakhir, tagihan belum lunas, kamar terisi.'],
    ['monthly_summary', 'Ringkasan bulanan (setiap tanggal 1)', 'Pemasukan, biaya, laba bulan lalu, perbandingan dengan bulan sebelumnya, dan penghuni yang belum bayar.'],
    ['notify_email', 'Saat penghuni mengirim bukti transfer', 'Email langsung saat ada bukti baru dari portal penghuni.'],
    ['onboarding_emails', 'Email arahan selama masa coba', 'Langkah yang belum Anda kerjakan, paling banyak 1 email tiap 2 hari.'],
  ].filter(([col]) => kos[col] !== undefined);

  return (
    <div className="stack">
      <div className="row"><h2>Notifikasi</h2><PageHelp page="notifikasi" /></div>
      <section className="panel">
        <h3>Perlu perhatian</h3>
        {list.length === 0 ? (
          <div className="notice good">Administrasi kos Anda sudah diperbarui. Tidak ada pembayaran yang menunggu diperiksa dan tidak ada tagihan yang lewat jatuh tempo.</div>
        ) : (
          <div className="list">{list.map(([tone, title, text, href]) => (
            <Link key={title} href={href} className="li">
              <div className="main" style={{ flex: 1 }}><b>{tone && <span className={'chip ' + tone} style={{ marginRight: 6 }}>●</span>}{title}</b><span className="small muted">{text}</span></div>
              <span className="muted">›</span>
            </Link>
          ))}</div>
        )}
      </section>

      {isOwner && (
        <section className="panel">
          <h3>Pengaturan email</h3>
          <p className="small muted" style={{ margin: 0 }}>Dikirim ke <b>{user?.email}</b> sekitar pukul 07.00 WIB. Semua angka berasal dari data yang Anda catat. Pesan WhatsApp otomatis menyusul.</p>
          {OPTS.map(([col, label, hint, locked]) => (
            <label key={col} className="row" style={{ alignItems: 'flex-start', gap: 10 }}>
              <input type="checkbox" style={{ width: 22, minHeight: 22, marginTop: 2 }} checked={kos[col] !== false} onChange={(e) => toggle(col, e.target.checked, label)} />
              <span style={{ flex: 1 }}><b>{label}</b>{locked && <span className="chip gold" style={{ marginLeft: 6 }}>Dasar</span>}<br /><span className="small muted">{hint}</span></span>
            </label>
          ))}
          <div className="row">
            {kos.monthly_summary && <button className="sm" disabled={!!busy} onClick={() => sample('bulanan')}>{busy === 'bulanan' ? 'Mengirim…' : 'Kirim contoh ringkasan bulanan'}</button>}
            {kos.weekly_summary && <button className="sm" disabled={!!busy} onClick={() => sample('mingguan')}>{busy === 'mingguan' ? 'Mengirim…' : 'Kirim contoh ringkasan mingguan'}</button>}
          </div>
        </section>
      )}

      <section className="panel">
        <h3>Riwayat email</h3>
        {hist === null ? <p className="small muted" style={{ margin: 0 }}>Memuat…</p> : hist.length === 0 ? <p className="small muted" style={{ margin: 0 }}>Belum ada email yang dikirim untuk kos ini.</p> : (
          <div className="list">{hist.map((h, i) => (
            <div className="li" key={i}><span>{h.what}</span><span className="small muted">{tgl(String(h.at).slice(0, 10))}</span></div>
          ))}</div>
        )}
      </section>
    </div>
  );
}
