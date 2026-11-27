'use client';
import { invoiceTotals } from '@/lib/propertyTotals';
import NavIcon from '@/components/NavIcon';
import styles from './property.module.css';
import Persiapan from '@/components/Persiapan';
import { canArea } from '@/lib/business';
import PageHelp from '@/components/PageHelp';
import Link from 'next/link';
import { useData } from '@/lib/useData';
import { Loading, Empty, InvChip, Sheet } from '@/components/ui';
import Checklist from '@/components/Checklist';
import { useKos } from '@/components/KosProvider';
import { RecHint } from '@/components/Rekomendasi';
import CrmHint from '@/components/CrmHint';
import { rp, tgl, today, thisMonth, bulan, invTitle } from '@/lib/format';
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { moduleOn, tabsFor } from '@/lib/business';
import { PageHeader } from '@/components/Page';
import Dashboard, { Widget, Alerts, QuickActions, ActivityList, useActivity, useDashPrefs, KpiGrid, Pulse } from '@/components/Dashboard';
import { KPIS, periodRange, baselineRange, pulseLine } from '@/lib/dashboards';
import { CompareBars } from '@/components/Charts';
import { quickActions } from '@/lib/menu';
import { addMonthsYm, BLN } from '@/lib/format';

export default function Beranda() {
  const { kosId } = useKos();
  return <PropertyHome key={kosId} />;
}

function PropertyHome() {
  const d = useData();
  const { kos, kosId, ver } = useKos();
  const [tix, setTix] = useState(null); // keluhan belum selesai
  const [group, setGroup] = useState(null);
  const act = useActivity(kosId, ver);
  const prefs = useDashPrefs('kos', 'bulan');
  useEffect(() => {
    if (!kosId || !moduleOn(kos, 'p_perbaikan')) return;
    supabase.from('maint_tickets').select('id,priority,source,status').eq('kos_id', kosId).in('status', ['baru', 'dikerjakan', 'menunggu']).then(({ data }) => setTix(data || null));
  }, [kosId, ver]);
  if (!d.ready) return d.err ? <div className="notice bad">{d.err}</div> : <Loading />;

  const t = today(), ym = thisMonth();
  const in7 = new Date(Date.now() + 7 * 864e5).toISOString().slice(0, 10);
  const rentable = d.rooms.filter((r) => r.status === 'tersedia' || r.status === 'terisi');
  const filled = d.rooms.filter((r) => r.status === 'terisi').length;
  const occ = rentable.length ? Math.round((filled / rentable.length) * 100) : 0;

  const live = d.invoices.filter((i) => i.status !== 'batal');
  const { billedMonth, paidAgainstMonth, outstanding } = invoiceTotals(d.invoices, ym);
  const paidMonth = d.payments.filter((p) => p.status === 'terverifikasi' && p.paid_at.startsWith(ym));
  const cashIn = paidMonth.filter((p) => p.method !== 'deposit').reduce((s, p) => s + p.amount, 0); // dibayar dari deposit = bukan uang masuk baru
  const depM = (d.deposits || []).filter((x) => x.status === 'aktif' && x.date.startsWith(ym));
  const depOut = depM.filter((x) => x.kind === 'kembali').reduce((s, x) => s + x.amount, 0);
  const depInCash = depM.filter((x) => x.kind === 'terima' && !x.booking_id).reduce((s, x) => s + x.amount, 0);
  const bkIn = (d.bookings || []).filter((b) => b.dp_amount > 0 && (b.dp_date || '').startsWith(ym)).reduce((s, b) => s + b.dp_amount, 0);
  const bkOut = (d.bookings || []).filter((b) => b.status === 'batal' && (b.closed_date || '').startsWith(ym)).reduce((s, b) => s + b.refund_amount, 0);
  const checkins = (d.bookings || []).filter((b) => b.status === 'aktif' && b.check_in <= in7);
  const cashOut = d.expenses.filter((x) => x.date.startsWith(ym)).reduce((s, x) => s + x.amount, 0);
  const entIn = d.entries.filter((x) => x.date.startsWith(ym) && ['pendapatan_lain', 'setoran_modal', 'pinjaman_masuk'].includes(x.kind)).reduce((s, x) => s + x.amount, 0);
  const entOut = d.entries.filter((x) => x.date.startsWith(ym) && ['prive', 'bayar_pinjaman', 'bayar_pajak'].includes(x.kind)).reduce((s, x) => s + x.amount, 0);
  const overdue = live.filter((i) => i.overdue);
  const arrears = overdue.reduce((s, i) => s + i.outstanding, 0);
  const pending = d.payments.filter((p) => p.status === 'menunggu');
  const upcoming = live.filter((i) => i.outstanding > 0 && !i.overdue && i.due_date <= in7).sort((a, b) => a.due_date.localeCompare(b.due_date));

  const byOcc = new Map();
  for (const i of overdue) byOcc.set(i.occupant_id, (byOcc.get(i.occupant_id) || 0) + i.outstanding);
  const debtors = [...byOcc.entries()].sort((a, b) => b[1] - a[1]);

  // tren 6 bulan: tagihan terbit (jatuh tempo di bulan itu) vs pembayaran terverifikasi di bulan itu — sumber sama dengan kotak Tagihan bulan ini
  const trend = Array.from({ length: 6 }, (_, i) => {
    const m = addMonthsYm(ym, i - 5);
    return { key: m, label: bulan(m), short: BLN[Number(m.slice(5, 7)) - 1], a: live.filter((x) => x.due_date.startsWith(m)).reduce((s2, x) => s2 + x.amount, 0), b: d.payments.filter((p) => p.status === 'terverifikasi' && p.paid_at.startsWith(m)).reduce((s2, p) => s2 + p.amount, 0) };
  });
  const rentPayments = d.payments.filter(p => p.status === 'terverifikasi' && d.invById.get(p.invoice_id)?.kind === 'sewa');
  const rentTrend = trend.map(({key, short}) => ({key, short, value: rentPayments.filter(p => p.paid_at.startsWith(key)).reduce((sum,p) => sum + p.amount, 0)}));
  const rentMonth = rentTrend.at(-1).value;
  const extraIncome = paidMonth.filter(p => d.invById.get(p.invoice_id)?.kind === 'tambahan').reduce((sum,p) => sum + p.amount, 0);
  const operatingIncome = rentMonth + extraIncome + d.entries.filter(x => x.date.startsWith(ym) && x.kind === 'pendapatan_lain').reduce((sum,x) => sum + x.amount, 0);
  const repairs = d.rooms.filter(r => r.status === 'perbaikan');
  const ending = d.leases.filter(l => l.status === 'aktif' && l.end_date?.startsWith(ym) && l.end_date >= t);
  const has = (h) => tabsFor(kos).some(([x]) => x === h);
  const highTix = (tix || []).some((x) => x.priority === 'tinggi');
  const newTix = (tix || []).filter((x) => x.status === 'baru' && x.source === 'penghuni').length;
  const alerts = [
    repairs.length > 0 && { tone: 'warn', text: `${repairs.length} kamar dalam perbaikan`, href: '/kamar' },
    ending.length > 0 && { tone: 'info', text: `${ending.length} sewa berakhir bulan ini`, href: '/penghuni' },
    overdue.length > 0 && { tone: 'bad', text: `${overdue.length} tagihan lewat jatuh tempo · ${rp(arrears)}`, href: '/tagihan' },
    pending.length > 0 && { tone: 'info', text: `${pending.length} pembayaran menunggu verifikasi`, href: '/pembayaran' },
    tix && tix.length > 0 && { tone: highTix ? 'bad' : 'warn', text: `${tix.length} keluhan/perbaikan belum selesai${newTix ? ` · ${newTix} baru dari penghuni` : ''}`, href: '/perbaikan' },
    checkins.some((b) => b.check_in < t) && { tone: 'warn', text: 'Ada booking yang tanggal masuknya terlewat', href: '/booking' },
    upcoming.length > 0 && { tone: 'info', text: `${upcoming.length} tagihan jatuh tempo dalam 7 hari`, href: '/tagihan' },
  ].filter(Boolean);

  // Periode terpilih: pembayaran terverifikasi (sumber sama dengan kotak Terkumpul & Laporan)
  const per = periodRange(prefs.period), base = baselineRange(prefs.period);
  const inR = (x, r) => x >= r.from && x <= r.to;
  const verified = d.payments.filter((p) => p.status === 'terverifikasi');
  const paidP = verified.filter((p) => inR(String(p.paid_at).slice(0, 10), per));
  const paidB = verified.filter((p) => inR(String(p.paid_at).slice(0, 10), base));
  const sumA = (a) => a.reduce((s2, p) => s2 + p.amount, 0);
  const activeBk = (d.bookings || []).filter((b) => b.status === 'aktif');
  const kosong = d.rooms.filter((r) => r.status === 'tersedia').length;
  const kpiItems = [
    { id: 'kas', label: 'Kas bersih bulan ini', value: rp(cashIn + entIn + depInCash + bkIn - cashOut - entOut - depOut - bkOut), tone: 'hero', sub: `Masuk ${rp(cashIn + entIn + depInCash + bkIn)} · keluar ${rp(cashOut + entOut + depOut + bkOut)}${depInCash || depOut || bkIn || bkOut ? ' (termasuk deposit/DP)' : ''}` },
    { id: 'hunian', icon: <NavIcon name='/penghuni' />, label: 'Tingkat hunian', value: `${occ}%`, sub: `${filled} dari ${rentable.length} kamar terisi` },
    { id: 'total_kamar', icon: <NavIcon name='/kamar' />, label: 'Total kamar', value: String(d.rooms.length), sub: `${filled} terisi · ${kosong} kosong` },
    { id: 'kosong', label: 'Kamar kosong', value: String(kosong), sub: 'siap disewa', tone: kosong > 0 && occ < 70 ? 'gold' : '' },
    { id: 'penghuni', label: 'Penghuni aktif', value: String(d.activeByOcc.size), sub: `${d.rooms.length} kamar terdaftar` },
    moduleOn(kos, 'p_booking') && { id: 'booking', label: 'Booking aktif', value: String(activeBk.length), sub: `${checkins.length} masuk ≤ 7 hari` },
    { id: 'tagihan', label: 'Tagihan bulan ini', value: rp(billedMonth), sub: `Sudah dibayar ${rp(paidAgainstMonth)}` },
    { id: 'terkumpul', label: `Pembayaran diterima ${per.label}`, value: rp(sumA(paidP)), sub: `${paidP.length} pembayaran terverifikasi` },
    { id: 'jatuh_tempo', label: 'Jatuh tempo 7 hari', value: rp(upcoming.reduce((s2, i) => s2 + i.outstanding, 0)), sub: `${upcoming.length} tagihan` },
    { id: 'sewa', label: 'Pendapatan sewa bulan ini', value: rp(rentMonth), icon: <NavIcon name='/pembayaran' /> },
    { id: 'sisa', icon: <NavIcon name='/tagihan' />, label: 'Tagihan belum lunas', value: rp(outstanding), sub: `${live.filter(i => i.outstanding > 0).length} tagihan` },
    { id: 'tunggakan', label: 'Tunggakan', value: rp(arrears), tone: arrears > 0 ? 'bad' : '', sub: `${overdue.length} tagihan lewat jatuh tempo` },
  ];
  const pulse = [
    pulseLine(`Pembayaran diterima ${per.label}`, sumA(paidP), sumA(paidB) / 30, per.days, rp),
    rentable.length > 0 && { tone: occ >= 90 ? 'good' : occ < 70 ? 'warn' : 'info', text: `Hunian ${occ}% (${filled}/${rentable.length} kamar)${occ < 70 ? ' — pertimbangkan promosi atau halaman bisnis untuk calon penghuni' : ''}`, href: occ < 70 ? '/kamar' : undefined },
    billedMonth > 0 && { tone: paidAgainstMonth >= billedMonth ? 'good' : arrears > 0 ? 'warn' : 'info', text: `Terkumpul ${Math.round((paidAgainstMonth / billedMonth) * 100)}% dari tagihan ${bulan(ym)}` },
  ];

  const widgets = [
    { id: 'denyut', title: 'Denyut bisnis', size: 'full', node: pulse.some(Boolean) && <Pulse items={pulse} /> },
    { id: 'kpi', title: 'Angka utama', size: 'full', node: <KpiGrid items={kpiItems} prefs={prefs} /> },
    { id: 'tren', title: 'Tagihan vs terkumpul', size: 'wide', node: (
      <Widget title="Tagihan vs terkumpul · 6 bulan" action={has('/laporan') && <Link href="/laporan">Laporan</Link>}>
        <CompareBars data={trend} a="Tagihan terbit" b="Terkumpul" title="Tagihan dan pembayaran 6 bulan terakhir" />
        <span className="small muted">Terkumpul = pembayaran terverifikasi pada bulan itu (termasuk yang dibayar dari deposit).</span>
      </Widget>
    ) },
    { id: 'perhatian', title: 'Perlu perhatian', size: 'normal', node: <Widget title="Perlu perhatian"><Alerts items={alerts} /></Widget> },
    { id: 'menunggak', title: 'Penghuni menunggak', size: 'normal', node: (
      <Widget title="Penghuni menunggak" action={<Link href="/tagihan">Semua tagihan</Link>}>
        {debtors.length === 0 ? <p className="muted small" style={{ margin: 0 }}>Tidak ada tunggakan. Mantap.</p> : (
          <div className="list">
            {debtors.slice(0, 8).map(([oid, amt]) => {
              const l = d.activeByOcc.get(oid);
              return (
                <div className="li" key={oid}>
                  <div className="main"><b>{d.occName(oid)}</b><span className="small muted">{l ? 'Kamar ' + d.roomCode(l.room_id) : 'Sudah keluar'}</span></div>
                  <span className="num" style={{ color: 'var(--bad)' }}>{rp(amt)}</span>
                </div>
              );
            })}
            {debtors.length > 8 && <Link href="/tagihan" className="small">+{debtors.length - 8} penghuni lagi →</Link>}
          </div>
        )}
      </Widget>
    ) },
    { id: 'jatuhtempo', title: 'Jatuh tempo 7 hari', size: 'normal', node: (
      <Widget title="Jatuh tempo 7 hari ke depan">
        {upcoming.length === 0 ? <p className="muted small" style={{ margin: 0 }}>Tidak ada.</p> : (
          <div className="list">
            {upcoming.map((i) => (
              <Link className="li" key={i.id} href={`/tagihan?invoice=${encodeURIComponent(i.id)}`}>
                <div className="main"><b>{d.occName(i.occupant_id)} · {d.roomCode(i.room_id)}</b><span className="small muted">{invTitle(i)} · jatuh tempo {tgl(i.due_date)}</span></div>
                <div style={{ textAlign: 'right' }}><div className="num">{rp(i.outstanding)}</div><InvChip inv={i} /></div>
              </Link>
            ))}
          </div>
        )}
      </Widget>
    ) },
    { id: 'booking', title: 'Booking: jadwal masuk', size: 'normal', node: checkins.length > 0 && (
      <Widget title="Booking: jadwal masuk" action={<Link href="/booking">Booking</Link>}>
        <div className="list">{checkins.map((b) => (
          <Link key={b.id} href="/booking" className="li" style={{ textDecoration: 'none', color: 'inherit' }}>
            <div className="main"><b>{b.name} · {d.roomCode(b.room_id)}</b><span className="small muted">masuk {tgl(b.check_in)}{b.dp_amount > 0 ? ` · DP ${rp(b.dp_amount)}` : ''}</span></div>
            <span className={'chip ' + (b.check_in < today() ? 'bad' : 'gold')}>{b.check_in < today() ? 'Terlewat' : b.check_in === today() ? 'Hari ini' : 'Segera'}</span>
          </Link>
        ))}</div>
      </Widget>
    ) },
    { id: 'kamar', title: 'Status kamar', size: 'normal', node: (
      <Widget title="Status kamar" action={has('/kamar') && <Link href="/kamar">Peta kamar</Link>}>
        <div className={styles.rooms}>{d.rooms.slice(0, 10).map(r => {
          const lease = d.activeByRoom.get(r.id);
          return <article key={r.id}><b>{r.code}</b><span className="chip">{({ terisi: 'Terisi', tersedia: 'Tersedia', perbaikan: 'Perbaikan', tidak_disewakan: 'Tidak disewakan' })[r.status] || r.status}</span><small>{lease ? d.occName(lease.occupant_id) : '—'}</small><small>{rp(lease?.rent ?? r.rent)}</small></article>;
        })}</div>
      </Widget>
    ) },
    { id: 'aktivitas', title: 'Aktivitas terbaru', size: 'normal', node: act !== null && (
      <Widget title="Aktivitas terbaru" action={has('/aktivitas') && <Link href="/aktivitas">Riwayat</Link>}>{act === undefined ? <Loading rows={3} /> : <ActivityList rows={act} />}</Widget>
    ) },
    { id: 'aksi', title: 'Aksi cepat', size: 'normal', node: quickActions(kos).length > 0 && <Widget title="Aksi cepat"><QuickActions kos={kos} /></Widget> },
  ];

  const groups = [
    ['Kamar / Unit', ['/kamar']], ['Penghuni', ['/penghuni']], ['Booking & Pendaftaran', ['/booking']],
    ['Tagihan & Pembayaran', ['/tagihan', '/pembayaran']], ['Keuangan', ['/pembukuan', '/pengeluaran']],
    ['Pemeliharaan', ['/perbaikan']], ['Aset & Inventaris', ['/aset']], ['Laporan & Analisis', ['/laporan', '/analisis']],
  ];
  const shortcuts = groups.map(([label, paths]) => ({label, path: paths.find(has), paths: paths.filter(has)})).filter(x => x.path);
  widgets.push(
    { id: 'operasional', title: 'Operasional', size: 'full', node: shortcuts.length > 0 && <nav className={styles.operations} aria-label="Operasional properti"><h3>Operasional</h3><div className={styles.modules}>{shortcuts.map(({label,path,paths}) => paths.length > 1 ? <button key={path} onClick={() => setGroup({label,paths})}><NavIcon name={path} /><span>{label}</span></button> : <Link key={path} href={path}><NavIcon name={path} /><span>{label}</span></Link>)}</div></nav> },
    { id: 'sewa', title: 'Pendapatan sewa', size: 'wide', node: <Widget title="Pendapatan sewa" action={<span className="small muted">6 bulan terakhir</span>}><div className={styles.chart}>{rentTrend.map(m => <div key={m.key}><small>{rp(m.value)}</small><i style={{height: (m.value / Math.max(1, ...rentTrend.map(x => x.value)) * 90) + 'px'}} /><span>{m.short}</span></div>)}</div></Widget> },
    { id: 'keuangan', title: 'Ringkasan keuangan', size: 'normal', node: has('/laporan') && <Widget title="Ringkasan keuangan bulan ini"><dl className={styles.finance}>{[['Pendapatan sewa', rentMonth], ['Pendapatan lain & tambahan', operatingIncome - rentMonth], ['Pengeluaran', cashOut], ['Surplus operasional', operatingIncome - cashOut]].map(([label,value]) => <div key={label}><dt>{label}</dt><dd>{rp(value)}</dd></div>)}</dl></Widget> }
  );
  const priority = ['kpi', 'operasional', 'sewa', 'perhatian', 'kamar', 'keuangan'];
  const rank = w => priority.includes(w.id) ? priority.indexOf(w.id) : priority.length;
  widgets.sort((a,b) => rank(a) - rank(b));
  const hour = Number(new Intl.DateTimeFormat('id-ID', {timeZone:'Asia/Jakarta', hour:'2-digit', hourCycle:'h23'}).format(new Date()));
  const greeting = hour < 11 ? 'pagi' : hour < 15 ? 'siang' : hour < 18 ? 'sore' : 'malam';
  return <div className={styles.home}><Dashboard id="kos" kosId={kosId} widgets={widgets} prefs={prefs} kpis={KPIS.kos.map(([id,label]) => ({id,label}))} period header={(atur,periode) => <header className={styles.hero}>
    <div><h1>Selamat {greeting}</h1><strong>{kos.name}</strong></div>
    <img src="/retail/prasara-maskot.webp" alt="Maskot PRASARA" />
    <div className={styles.controls}>{periode}{atur}<PageHelp page="beranda" /></div>
  </header>} />
    {group && <Sheet title={group.label} onClose={() => setGroup(null)}><div className="list">{group.paths.map(path => <Link className="li" href={path} key={path}><NavIcon name={path} />{tabsFor(kos).find(([href]) => href === path)?.[1]}</Link>)}</div></Sheet>}
    {!d.rooms.length && has('/kamar') && <Empty title="Belum ada kamar" text="Tambahkan kamar pertama untuk mulai mengelola hunian."><Link href="/kamar">Ke halaman Kamar</Link></Empty>}
    <Checklist d={d} kosId={kosId} />{canArea(kos,'settings') && <Persiapan kos={kos} />}<CrmHint /><RecHint />
  </div>;
}
