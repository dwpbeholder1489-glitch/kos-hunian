'use client';
// Beranda Event (Master Prompt PRASARA Event §3–4, gambar acuan pemilik; keputusan E1–E4).
// SATU sumber data: event_home (server) — event = proyek di Mesin Proyek; pendapatan = pengakuan pendapatan proyek
// (sama dengan Pembukuan), biaya = pengeluaran/belanja bertanda event. Angka uang hanya untuk bagian keuangan.
// Tanpa angka contoh: bagian yang belum punya data menampilkan keadaan kosong yang menjelaskan langkah berikutnya.
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { useKos } from '@/components/KosProvider';
import PageHelp from '@/components/PageHelp';
import FiturUpgrade from '@/components/FiturUpgrade';
import Persiapan from '@/components/Persiapan';
import NavIcon from '@/components/NavIcon';
import EventCal from '@/components/EventCal';
import { EventMetrics, evStyles as ev } from '@/components/EventPage';
import { Loading, Sheet, run } from '@/components/ui';
import { canArea, tabsFor } from '@/lib/business';
import { rp, tglShort, errMsg } from '@/lib/format';
import { mediaUrl } from '@/lib/media';
import { EV_ST, tglHari, bulanPendek, bulanTahun, addMonths, addDays, delta } from '@/lib/event';

const salam = () => {
  const h = Number(new Date().toLocaleString('en-US', { timeZone: 'Asia/Jakarta', hour: 'numeric', hour12: false })) % 24;
  return h < 11 ? 'Selamat pagi' : h < 15 ? 'Selamat siang' : h < 18 ? 'Selamat sore' : 'Selamat malam';
};
// Rp ringkas untuk sumbu grafik: 1,2 M / 25 jt / 800 rb
const rpPendek = (n) => {
  const a = Math.abs(Number(n) || 0);
  const f = (x, s) => `${(Math.round(x * 10) / 10).toLocaleString('id-ID')} ${s}`;
  return a >= 1e9 ? f(a / 1e9, 'M') : a >= 1e6 ? f(a / 1e6, 'jt') : a >= 1e3 ? f(a / 1e3, 'rb') : String(Math.round(a));
};
// Batas atas sumbu yang "bulat" (1/2/4/6/8/10 × 10^n)
const niceMax = (v) => {
  if (!(v > 0)) return 0;
  const p = 10 ** Math.floor(Math.log10(v));
  return [1, 2, 4, 6, 8, 10].map((k) => k * p).find((k) => k >= v);   // dibagi 4 garis → angka bulat
};

export default function BerandaEvent() {
  const { kos, kosId, ver, user } = useKos();
  const router = useRouter();
  const [month, setMonth] = useState(null);        // null = bulan berjalan (ditentukan server, zona Jakarta)
  const [d, setD] = useState(null);
  const [err, setErr] = useState(null);
  const [sel, setSel] = useState(null);
  const [pick, setPick] = useState(null);          // lembar pilih event untuk "Buat Invoice"
  const load = () => supabase.rpc('event_home', { p_kos: kosId, p_month: month }).then(({ data, error }) => (error ? setErr(errMsg(error)) : (setErr(null), setD(data))));
  useEffect(() => { load(); }, [kosId, ver, month]); // eslint-disable-line react-hooks/exhaustive-deps
  if (err) return <div className="notice bad">{/event_home|function/.test(err) ? 'Database sedang diperbarui. Coba lagi beberapa menit lagi.' : err}</div>;
  if (!d) return <Loading />;
  const k = d.kpi;
  const name = user?.user_metadata?.name || user?.user_metadata?.full_name;
  const has = (h) => tabsFor(kos).some(([x]) => x === h);
  const go = (n) => { setSel(null); setMonth(addMonths(d.month, n)); };
  const thisMonth = d.month.slice(0, 7) === d.today.slice(0, 7);
  const toggle = async (t) => { if (await run(() => supabase.rpc('prj_task_status', { p_id: t.id, p_status: 'selesai' }), 'Tugas selesai', errMsg)) load(); };
  const besok = addDays(d.today, 1);
  const r6 = d.revenue6 || [];
  const top = niceMax(Math.max(0, ...r6.map((x) => Number(x.amount))));
  const f = d.finance;
  const fd = f && delta(f.revenue, f.revenue_prev);
  const settings = canArea(kos, 'settings');
  const qa = [
    d.can_create && { key: 'new', icon: '/proyek', label: 'Buat Event', href: '/proyek?baru=1' },
    d.can_create && has('/proyek') && { key: 'quote', icon: '/kontrak', label: 'Buat Penawaran', href: '/proyek?tab=penawaran&baru=penawaran', lock: !d.lanjut && 'Paket Bisnis' },
    d.fin && d.allowed && { key: 'inv', icon: '/tagihan', label: 'Buat Invoice', onClick: () => setPick(true) },
    has('/kontak') && { key: 'cust', icon: '/kontak', label: 'Tambah Pelanggan', href: '/kontak?baru=1' },
    has('/jadwal') && { key: 'team', icon: '/karyawan', label: 'Kelola Tim', href: '/jadwal' },
    has('/aset') && { key: 'inv2', icon: '/aset', label: 'Tambah Inventaris', href: '/aset?baru=1' },
  ].filter(Boolean);

  return (
    <div className={`ev-page ${ev.page}`}>
      {/* Sapaan bergaya Beranda Toko: maskot versi Event + pemilih periode */}
      <section className={ev.masthead} aria-label="Sambutan Beranda Event">
        <div style={{ minWidth: 0 }}>
          <div className={ev.title}><h1>{salam()}{name ? `, ${name.split(' ')[0]}` : ''}</h1><PageHelp page="event" /></div>
          <p>Beranda Event · kelola kegiatan, booking, tim, dan keuangan event Anda.</p>
        </div>
        <img className={ev.mascot} src="/event/maskot.webp" width="640" height="414" alt="" />
        <div className={ev.controls}>
          <div className="ev-month" role="group" aria-label="Periode">
            <button type="button" aria-label="Bulan sebelumnya" onClick={() => go(-1)}>‹</button>
            <b>{bulanTahun(d.month)}</b>
            <button type="button" aria-label="Bulan berikutnya" onClick={() => go(1)}>›</button>
            {!thisMonth && <button type="button" className="small" onClick={() => { setSel(null); setMonth(null); }}>Bulan ini</button>}
          </div>
        </div>
      </section>

      {settings && <Persiapan kos={kos} />}
      {!d.allowed && <FiturUpgrade kosId={kosId} owner={canArea(kos, 'team')} event="PROJECT.REQUESTED" plan="dasar" title="Kelola event tersedia mulai Paket Dasar"
        text="Event yang sudah ada tetap bisa dibuka dan diselesaikan. Membuat event baru, jadwal, tugas tim, dan tagihan DP & pelunasan butuh Paket Dasar." />}

      {/* A. Ringkasan */}
      <EventMetrics label="Ringkasan" items={[
        { key: 'aktif', tone: 'green', icon: 'ticket', label: 'Event Aktif', value: k.active, trend: delta(k.active, k.active_prev, 'abs'), caption: 'dari awal bulan', href: '/proyek' },
        d.fin ? { key: 'booking', tone: 'blue', icon: '/booking-event', label: 'Booking Masuk', value: rp(k.booking_value), trend: delta(k.booking_value, k.booking_value_prev), caption: `· ${k.booking_count} dikonfirmasi`, href: '/booking-event' }
          : { key: 'booking', tone: 'blue', icon: '/booking-event', label: 'Booking Masuk', value: `${k.booking_count} event`, trend: delta(k.booking_count, k.booking_count_prev), caption: 'dari bulan lalu', href: '/booking-event' },
        { key: 'bulan', tone: 'gold', icon: 'calendar', label: thisMonth ? 'Event Bulan Ini' : `Event ${bulanTahun(d.month)}`, value: k.events, trend: delta(k.events, k.events_prev), caption: 'dari bulan lalu', href: '/jadwal' },
        d.fin ? { key: 'pendapatan', tone: 'red', icon: 'coins', label: thisMonth ? 'Pendapatan Bulan Ini' : `Pendapatan ${bulanPendek(d.month)}`, value: rp(k.revenue), trend: delta(k.revenue, k.revenue_prev), caption: 'dari bulan lalu' }
          : { key: 'tugas', tone: 'red', icon: 'done', label: 'Tugas Terbuka', value: d.tasks_open, caption: 'belum selesai di event berjalan', href: '/jadwal' },
      ]} />

      <div className="ev-row2">
        {/* B. Event mendatang */}
        <section className="ev-card ev-up-card" aria-labelledby="ev-up-h">
          <div className="ev-card-h"><h2 id="ev-up-h">Event Mendatang</h2><Link href="/proyek">Lihat Semua →</Link></div>
          {d.upcoming.length === 0 ? <span className="small muted">{d.undated ? `Belum ada event bertanggal. ${d.undated} event belum diberi tanggal — isi tanggalnya agar muncul di sini dan di kalender.` : 'Belum ada event mendatang. Event yang dibuat akan tampil di sini sesuai tanggal acara.'}</span>
            : <div className="ev-up">{d.upcoming.map((p) => { const s = EV_ST[p.event_status] || [p.event_status, 'void']; const img = mediaUrl(p.cover);
              return <Link key={p.id} href={`/proyek/${p.id}`}>
                {img ? <img src={img} alt="" loading="lazy" /> : <span className="ev-noimg" aria-hidden="true"><NavIcon name="ticket" /></span>}
                <span className="ev-up-b">
                  <b>{p.name}</b>
                  <span>{tglHari(p.start_date)}{p.end_date && p.end_date !== p.start_date ? ` – ${tglShort(p.end_date)}` : ''}{p.start_time ? ` · ${p.start_time}` : ''}{p.location ? ` • ${p.location}` : ''}</span>
                  {(p.client || p.guests || (d.fin && p.value != null)) && <span>{[p.client, p.guests ? `${p.guests.toLocaleString('id-ID')} peserta` : null, d.fin && p.value != null ? rp(p.value) : null].filter(Boolean).join(' · ')}</span>}
                  {p.progress != null && <span className="ev-up-prog"><span className="progress"><i style={{ width: `${p.progress}%` }} /></span>{p.progress}% persiapan</span>}
                </span>
                <span className="ev-up-r"><span className={'chip ' + s[1]}>{s[0]}</span><span aria-hidden="true" className="muted">›</span></span>
              </Link>; })}</div>}
          {d.upcoming.length > 0 && d.undated > 0 && <span className="small muted">+ {d.undated} event belum bertanggal.</span>}
        </section>

        {/* C. Aksi cepat */}
        {qa.length > 0 && <section className="ev-card" aria-labelledby="ev-qa-h">
          <div className="ev-card-h"><h2 id="ev-qa-h">Aksi Cepat</h2></div>
          <div className="ev-qa">{qa.map((a) => { const inner = <><NavIcon name={a.icon} /><span>{a.label}</span>{a.lock && <small>{a.lock}</small>}</>;
            return a.href ? <Link key={a.key} href={a.href}>{inner}</Link> : <button key={a.key} type="button" onClick={a.onClick}>{inner}</button>; })}</div>
        </section>}

        {/* D. Kalender */}
        <section className="ev-card" aria-labelledby="ev-cal-h">
          <div className="ev-card-h"><h2 id="ev-cal-h">Kalender Event</h2>{has('/jadwal') && <Link href="/jadwal">Lihat jadwal →</Link>}</div>
          <EventCal month={d.month} today={d.today} events={d.calendar} sel={sel} onSel={setSel} onMonth={go} />
        </section>
      </div>

      <div className="ev-row3">
        {/* E. Pendapatan (keuangan) */}
        {d.fin && <section className="ev-card" aria-labelledby="ev-rev-h">
          <div className="ev-card-h"><h2 id="ev-rev-h">Pendapatan Event</h2>{has('/analisis') && <Link href="/proyek?tab=laba">Laba per event →</Link>}</div>
          <div className="ev-chart-wrap">
            {top === 0 ? <span className="small muted">Belum ada pendapatan event dalam 6 bulan ini. Pendapatan diakui saat milestone ber-nilai diselesaikan atau event ditandai selesai — DP yang diterima lebih dulu dicatat sebagai uang muka.</span>
              : <div className="ev-chart" role="img" aria-label={`Pendapatan 6 bulan: ${r6.map((x) => `${bulanPendek(x.month)} ${rp(x.amount)}`).join(', ')}`}>
                <div className="ev-chart-y" aria-hidden="true">{[1, 0.75, 0.5, 0.25, 0].map((t) => <span key={t}>{rpPendek(top * t)}</span>)}</div>
                <div className="ev-chart-plot">
                  {[0.25, 0.5, 0.75, 1].map((t) => <span key={t} className="ev-grid" style={{ bottom: `calc(22px + ${t} * (100% - 22px))` }} aria-hidden="true" />)}
                  {r6.map((x) => <div key={x.month} className={'ev-bar' + (x.month === d.month ? ' cur' : '')} title={`${bulanTahun(x.month)}: ${rp(x.amount)}`}>
                    <i style={{ height: `${(Number(x.amount) / top) * 100}%` }} /><span>{bulanPendek(x.month)}</span></div>)}
                </div>
              </div>}
            <div className="ev-total">
              <span className="small muted">Total pendapatan 6 bulan</span>
              <span className="big">{rp(f.revenue)}</span>
              {fd && <span className={'ev-delta' + (fd.dir < 0 ? ' down' : fd.dir === 0 ? ' flat' : '')}>{fd.dir > 0 ? '▲' : fd.dir < 0 ? '▼' : '•'} {fd.txt} <span style={{ fontWeight: 500 }}>dari 6 bulan sebelumnya</span></span>}
              <dl>
                <dt>Pengeluaran event</dt><dd>{rp(f.cost)}</dd>
                <dt>Keuntungan</dt><dd style={{ color: Number(f.revenue) - Number(f.cost) < 0 ? 'var(--bad)' : 'var(--gold)' }}>{rp(Number(f.revenue) - Number(f.cost))}</dd>
                <dt>Piutang pelanggan</dt><dd>{rp(f.receivable)}</dd>
                {Number(f.advance) > 0 && <><dt>DP belum diakui</dt><dd>{rp(f.advance)}</dd></>}
              </dl>
            </div>
          </div>
          <span className="small muted">Pendapatan = pengakuan per termin/milestone (sama dengan Pembukuan). Pengeluaran = biaya & belanja yang ditandai ke event.</span>
        </section>}

        {/* F. Tugas & persiapan */}
        <section className="ev-card" aria-labelledby="ev-task-h">
          <div className="ev-card-h"><h2 id="ev-task-h">Tugas & Persiapan</h2>{has('/jadwal') && <Link href="/jadwal">Lihat Semua →</Link>}</div>
          {d.tasks.length === 0 ? <span className="small muted">Tidak ada tugas terbuka. Tambahkan tugas persiapan di halaman setiap event (mis. konfirmasi vendor, cek perlengkapan, gladi).</span>
            : <div className="ev-tasks">{d.tasks.map((t) => {
              const due = t.due_date && (t.due_date < d.today ? ['Terlambat', 'bad'] : t.due_date === d.today ? ['Hari ini', 'bad'] : t.due_date === besok ? ['Besok', 'gold'] : [tglShort(t.due_date), 'void']);
              return <div className="ev-task" key={t.id}>
                <input type="checkbox" checked={false} disabled={!t.can_toggle} onChange={() => toggle(t)} aria-label={`Tandai selesai: ${t.title}`} title={t.can_toggle ? 'Tandai selesai' : 'Hanya penanggung jawab tugas atau PIC event'} />
                <Link href={`/proyek/${t.project_id}`} className="ev-task-b" style={{ color: 'inherit', textDecoration: 'none' }}>
                  <b>{t.title}</b><span>{t.project}{t.assignee ? ` · ${t.assignee}` : ''}</span>
                </Link>
                {due && <span className={'chip ' + due[1]}>{due[0]}</span>}
              </div>; })}</div>}
          {d.tasks_open > d.tasks.length && <span className="small muted">… dan {d.tasks_open - d.tasks.length} tugas lain.</span>}
        </section>
      </div>

      {pick && <PickEvent kosId={kosId} onClose={() => setPick(null)} onPick={(id) => router.push(`/proyek/${id}#tagihan-baru`)} />}
    </div>
  );
}

// "Buat Invoice": pilih event yang sudah dikonfirmasi, lalu formulir tagihan di halaman event terbuka otomatis
function PickEvent({ kosId, onClose, onPick }) {
  const [rows, setRows] = useState(null);
  useEffect(() => { supabase.rpc('prj_list', { p_kos: kosId }).then(({ data }) => setRows((data?.projects || []).filter((p) => ['berjalan', 'ditunda', 'selesai'].includes(p.status)))); }, [kosId]);
  return (
    <Sheet title="Buat invoice untuk event…" onClose={onClose}>
      {!rows ? <span className="small muted">Memuat…</span> : rows.length === 0 ? <span className="small muted">Belum ada event yang dikonfirmasi. Invoice (DP / pelunasan) dibuat untuk event yang sudah dikonfirmasi.</span>
        : <div className="list">{rows.map((p) => <button key={p.id} type="button" className="li" style={{ textAlign: 'left' }} onClick={() => onPick(p.id)}>
          <div className="main"><b className="small">{p.name}</b><span className="small muted">{p.number}{p.client ? ` · ${p.client}` : ''}{p.start_date ? ` · ${tglShort(p.start_date)}` : ''}</span></div>
          <span aria-hidden="true">›</span></button>)}</div>}
    </Sheet>
  );
}
