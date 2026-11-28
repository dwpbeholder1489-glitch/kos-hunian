'use client';
import { rentText } from '@/components/SewaFleksibel';
import PortalBox from '@/components/PortalBox';
import { useBaru } from '@/lib/useBaru';
import DepositBox from '@/components/DepositBox';
import IsianTambahan from '@/components/IsianTambahan';
import Lampiran from '@/components/Lampiran';
import { pathAllowed } from '@/lib/business';
import PageHelp from '@/components/PageHelp';
import NavIcon from '@/components/NavIcon';
import { SheetSegments, SheetStats } from '@/components/SmartDetailSheet';
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useKos } from '@/components/KosProvider';
import { useData } from '@/lib/useData';
import { Sheet, Field, Loading, Empty, InvChip, run } from '@/components/ui';
import { StartLeaseSheet, EndLeaseSheet, MoveRoomSheet } from '@/components/LeaseForms';
import PaySheet from '@/components/PaySheet';
import { rp, tgl, invTitle, errMsg, waLink, today, thisMonth, METHOD, PAY_ST } from '@/lib/format';
import InvoiceReminder, { hasReminderPhone as hasPhone } from '@/components/InvoiceReminder';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import css from './penghuni.module.css';

const tabs = [['aktif', 'Aktif'], ['keluar', 'Tidak Aktif'], ['semua', 'Semua']];
const states = [['tunggak', 'Tunggakan'], ['belum', 'Belum lunas'], ['pending', 'Menunggu verifikasi'], ['lunas', 'Lunas'], ['none', 'Belum ada tagihan']];
const dates = [['late', 'Lewat jatuh tempo'], ['today', 'Jatuh tempo hari ini'], ['soon', 'Dalam 7 hari ke depan'], ['later', 'Lebih dari 7 hari']];
const digit = (value) => String(value || '').replace(/\D/g, '').replace(/^0/, '62');
const total = (rows) => rows.reduce((sum, row) => sum + row.outstanding, 0);
function groupBy(rows, key) {
  const grouped = new Map();
  for (const row of rows) {
    if (!grouped.has(row[key])) grouped.set(row[key], []);
    grouped.get(row[key]).push(row);
  }
  return grouped;
}
function badge(state) {
  return states.find(([key]) => key === state)?.[1];
}

export default function Penghuni() {
  const d = useData({ fullRoomHistory: true });
  const { kos, user } = useKos();
  const [f, setF] = useState('aktif');
  const [q, setQ] = useState('');
  const [state, setState] = useState('');
  const [due, setDue] = useState('');
  const [sheet, setSheet] = useState(null);
  const add = () => setSheet({ t: 'edit', occ: null });
  useBaru(add);
  const overdueView = useSearchParams().get('tunggakan') === '1';
  useEffect(() => {
    if (overdueView) {
      setF('semua');
      setState('tunggak');
    }
  }, [overdueView]);
  if (!d.ready) return d.err ? <div className="notice bad">{d.err}</div> : <Loading />;

  const owner = Boolean(user?.id && kos?.owner_id === user.id);
  const now = today();
  const week = new Date(new Date(now + 'T00:00:00Z').getTime() + 7 * 86400000).toISOString().slice(0, 10);
  const month = thisMonth();
  const leases = groupBy(d.leases, 'occupant_id');
  const invoices = groupBy(d.invoices, 'occupant_id');
  const records = d.occupants.map((occ) => {
    const lease = d.activeByOcc.get(occ.id);
    const history = leases.get(occ.id) || [];
    const bills = invoices.get(occ.id) || [];
    const open = bills.filter((i) => i.status !== 'batal' && i.outstanding > 0).sort((a, b) => a.due_date.localeCompare(b.due_date));
    const overdue = open.filter((i) => i.overdue);
    const status = overdue.length ? 'tunggak' : open.some((i) => i.pending > 0) ? 'pending' : open.length ? 'belum'
      : bills.some((i) => i.status !== 'batal' && i.due_date.startsWith(month)) ? 'lunas' : 'none';
    return { occ, lease, history, bills, open, overdue, status };
  });
  const search = q.trim().toLocaleLowerCase('id');
  const phone = /^[+\d\s().-]+$/.test(search) ? digit(search) : '';
  const matchesDue = (i) => !due || (due === 'late' ? i.overdue : due === 'today' ? i.due_date === now
    : due === 'soon' ? i.due_date > now && i.due_date <= week : i.due_date > week);
  const shown = records.filter(({ occ, lease, history, open, status }) => {
    if ((f === 'aktif' && !lease) || (f === 'keluar' && lease) || (state && state !== status)) return false;
    if (due && !open.some(matchesDue)) return false;
    const room = lease || history[0];
    return !search || [occ.name, occ.phone, room && d.roomCode(room.room_id)].some((value) => value?.toLocaleLowerCase('id').includes(search))
      || (phone && digit(occ.phone).includes(phone));
  });
  const active = records.filter((record) => record.lease).length;
  const overdue = records.filter((record) => record.overdue.length);
  const eligible = shown.map((record) => ({ ...record, open: record.open.filter((i) => matchesDue(i) && (state !== 'tunggak' || i.overdue)) }))
    .filter(({ occ, open }) => hasPhone(occ) && open.length);
  const detail = records.find(({ occ }) => occ.id === sheet?.id);
  const close = () => setSheet(null);
  const back = () => sheet.occupantId ? setSheet({ t: 'detail', id: sheet.occupantId }) : close();
  const leaseById = new Map(d.leases.map((lease) => [lease.id, lease]));
  const movedFrom = new Set(d.leases.filter((lease) => lease.prev_lease_id).map((lease) => lease.prev_lease_id));
  const mutations = d.leases.flatMap((lease) => [
    { ...lease, id: lease.id + ':start', kind: lease.prev_lease_id ? 'move' : 'start', date: lease.start_date },
    ...(lease.status === 'selesai' && !movedFrom.has(lease.id) ? [{ ...lease, id: lease.id + ':end', kind: 'end', date: lease.end_date }] : []),
  ]).sort((a, b) => (b.date || '').localeCompare(a.date || ''));

  return <div className={css.page}>
    <header className={css.heading}><div><div><h1>Penghuni</h1><PageHelp page="penghuni" /></div><p>Kelola data penghuni, sewa, dan masa tinggal</p></div>
      <button className="primary" onClick={add}>+ Penghuni</button>
    </header>
    <section className={css.metrics} aria-label="Ringkasan penghuni">
      <button onClick={() => { setF('aktif'); setQ(''); setState(''); setDue(''); }}><NavIcon name="/penghuni" size={26} /><span><b>Penghuni Aktif</b><strong>{active} Orang</strong><small>dari {d.rooms.length} kamar</small></span></button>
      <button onClick={() => { setF('semua'); setQ(''); setState('tunggak'); setDue(''); }}><NavIcon name="/tagihan" size={24} /><span><b>Total Tunggakan</b><strong>{rp(overdue.reduce((sum, record) => sum + total(record.overdue), 0))}</strong><small>{overdue.length} penghuni tertunggak</small></span><NavIcon name="next" size={16} /></button>
    </section>
    <nav className={css.quick} aria-label="Aksi cepat penghuni">
      <button onClick={add}><NavIcon name="/penghuni" />Tambah Penghuni</button>
      <Link href="/tagihan"><NavIcon name="calendar" />Tagihan Sewa</Link>
      <Link href="/pembayaran"><NavIcon name="/pembayaran" />Pembayaran</Link>
      <button onClick={() => setSheet({ t: 'mutations' })}><NavIcon name="swap" />Mutasi Penghuni</button>
      {pathAllowed(kos, '/laporan') && <Link href="/laporan"><NavIcon name="/laporan" />Laporan</Link>}
    </nav>
    <SheetSegments label="Status penghuni" options={tabs.map(([key, label]) => [key, `${label} (${key === 'aktif' ? active : key === 'keluar' ? records.length - active : records.length})`])} value={f} onChange={setF} />
    <div className={css.tools}><label><NavIcon name="search" size={17} /><input type="search" aria-label="Cari penghuni" value={q} onChange={(event) => setQ(event.target.value)} placeholder="Cari nama, kamar, atau nomor" /></label>
      <button onClick={() => setSheet({ t: 'filter' })}><NavIcon name="filter" size={17} />Filter{(state || due) && ' · Aktif'}</button></div>
    <div className={css.actions}>
      {state && <button onClick={() => setState('')}>{badge(state)} ×</button>}
      {due && <button onClick={() => setDue('')}>{dates.find(([key]) => key === due)?.[1]} ×</button>}
      {owner && eligible.length > 0 && <button onClick={() => setSheet({ t: 'reminder' })}><NavIcon name="message" size={16} />Pengingat massal ({eligible.length})</button>}
    </div>
    {shown.length ? <section className={css.list} aria-label="Daftar penghuni">{shown.map(({ occ, lease, history, open, overdue: late, status }) =>
      <button className={css.resident} data-state={status} key={occ.id} aria-label={`Detail ${occ.name}`} onClick={() => setSheet({ t: 'detail', id: occ.id })}>
        <span className={css.avatar}><NavIcon name="/akun" /></span>
        <span className={css.identity}><b>{occ.name}</b>
          <small><NavIcon name="/kamar" size={15} />{lease ? `Kamar ${d.roomCode(lease.room_id)}` : history[0] ? `Terakhir di ${d.roomCode(history[0].room_id)}` : 'Belum menyewa'}</small>
          {(lease || history[0]) && <small><NavIcon name="calendar" size={15} />Sejak {tgl((lease || history[0]).start_date)}</small>}
        </span>
        <span className={css.status}><span><NavIcon name={status === 'lunas' ? 'done' : status === 'none' ? '/tagihan' : 'clock'} size={15} />{badge(status)}</span>
          {open.length > 0 && <strong>{rp(total(late.length ? late : open))}</strong>}</span>
        <NavIcon name="next" size={17} />
      </button>)}</section> : <Empty title="Tidak ada penghuni yang cocok" text="Ubah kata pencarian atau filter, atau tambahkan penghuni baru." />}

    {sheet?.t === 'filter' && <Sheet title="Filter penghuni" icon="filter" onClose={close}>
      <Field label="Status pembayaran"><select value={state} onChange={(event) => setState(event.target.value)}><option value="">Semua status</option>{states.map(([key, label]) => <option value={key} key={key}>{label}</option>)}</select></Field>
      <Field label="Jatuh tempo"><select value={due} onChange={(event) => setDue(event.target.value)}><option value="">Semua tanggal</option>{dates.map(([key, label]) => <option value={key} key={key}>{label}</option>)}</select></Field>
      <div className="row"><button onClick={() => { setState(''); setDue(''); }}>Reset</button><button className="primary" onClick={close}>Lihat {shown.length} penghuni</button></div>
    </Sheet>}
    {sheet?.t === 'mutations' && <Sheet title="Mutasi Penghuni" icon="swap" onClose={close}>
      <Entries rows={mutations} empty="Belum ada riwayat masuk, pindah, atau keluar." render={(lease) => <div className={css.entry}>
        <b>{d.occName(lease.occupant_id)}</b><span>{lease.kind === 'move' ? `Pindah ke kamar ${d.roomCode(lease.room_id)}` : lease.kind === 'start' ? `Masuk kamar ${d.roomCode(lease.room_id)}` : `Keluar dari kamar ${d.roomCode(lease.room_id)}`}</span>
        <small>{[lease.kind === 'move' && leaseById.has(lease.prev_lease_id) ? `Dari ${d.roomCode(leaseById.get(lease.prev_lease_id).room_id)}` : lease.kind === 'end' ? lease.end_reason : null, lease.date && tgl(lease.date)].filter(Boolean).join(' · ')}</small>
        <button className="sm" onClick={() => setSheet({ t: 'detail', id: lease.occupant_id })}>Buka profil</button>
      </div>} />
    </Sheet>}
    {sheet?.t === 'reminder' && owner && <InvoiceReminder key={sheet.id || 'bulk'} kos={kos} d={d}
      records={sheet.id ? records.filter(({ occ, open }) => occ.id === sheet.id && hasPhone(occ) && open.length) : eligible}
      onClose={sheet.id ? () => setSheet({ t: 'detail', id: sheet.id }) : close} />}
    {sheet?.t === 'detail' && detail && <OccDetail key={detail.occ.id} d={d} record={detail} owner={owner} go={setSheet} onClose={close} />}
    {sheet?.t === 'edit' && <OccEdit d={d} occ={sheet.occ} onClose={back} />}
    {sheet?.t === 'start' && <StartLeaseSheet d={d} occupantId={sheet.id} onClose={back} />}
    {sheet?.t === 'end' && <EndLeaseSheet d={d} lease={sheet.lease} onClose={back} />}
    {sheet?.t === 'move' && <MoveRoomSheet d={d} lease={sheet.lease} onClose={back} />}
    {sheet?.t === 'pay' && <PaySheet d={d} inv={d.invById.get(sheet.id)} onClose={back} />}
  </div>;
}

function Entries({ rows, empty, render }) {
  const [limit, setLimit] = useState(12);
  if (!rows.length) return <p className="muted">{empty}</p>;
  return <><ul className={css.entries}>{rows.slice(0, limit).map((row) => <li key={row.id}>{render(row)}</li>)}</ul>
    {rows.length > limit && <button onClick={() => setLimit(limit + 12)}>Tampilkan lebih banyak</button>}</>;
}

function OccDetail({ d, record, owner, go, onClose }) {
  const { kos } = useKos();
  const [tab, setTab] = useState('profile');
  const { occ, lease: l, history, bills, open, overdue } = record;
  const depLease = l || history.find((x) => d.deposits.some((y) => y.lease_id === x.id));
  const first = l && bills.find((i) => i.lease_id === l.id && i.kind === 'sewa' && i.period_start === l.billing_start && i.status !== 'batal');
  const ids = new Set(bills.map((i) => i.id));
  const act = (t, props) => go({ t, occupantId: occ.id, ...props });
  return <Sheet title={occ.name} subtitle={l ? `Kamar ${d.roomCode(l.room_id)}` : 'Tidak aktif'} icon="/penghuni" wide onClose={onClose}>
    <SheetStats items={[[ 'Belum dibayar', rp(total(open)) ], ['Tunggakan', rp(total(overdue))]]} />
    <SheetSegments label="Detail penghuni" value={tab} onChange={setTab} options={[
      ['profile', 'Profil', '/akun'], ['lease', 'Kontrak', '/kamar'], ['bills', 'Tagihan', '/tagihan'], ['payments', 'Pembayaran', 'wallet'],
      ['deposit', 'Deposit', 'coins'], ['docs', 'Dokumen', '/catatan'],
    ]} />
    {tab === 'profile' && <>
      <dl className="kv"><dt>WhatsApp</dt><dd>{hasPhone(occ) ? <a href={waLink(occ.phone, '')} target="_blank" rel="noreferrer">{occ.phone}</a> : occ.phone || '—'}</dd>
        {occ.email && <><dt>Email</dt><dd>{occ.email}</dd></>}{occ.address && <><dt>Alamat asal</dt><dd>{occ.address}</dd></>}
        {occ.emergency && <><dt>Kontak darurat</dt><dd>{occ.emergency}</dd></>}{occ.notes && <><dt>Catatan</dt><dd>{occ.notes}</dd></>}
      </dl>
      <IsianTambahan entity="occupant" id={occ.id} extra={occ.extra} area="rent" />
      <PortalBox occ={occ} room={l ? d.roomCode(l.room_id) : ''} />
      {owner && <Link href="/pengaturan#pesan">Ubah teks pesan WhatsApp</Link>}
      <div className="row"><button onClick={() => act('edit', { occ })}>Ubah data</button>
        {owner && hasPhone(occ) && open.length > 0 && <button className="primary" onClick={() => go({ t: 'reminder', id: occ.id })}>Kirim pengingat</button>}</div>
    </>}
    {tab === 'lease' && <>
      {l && <dl className="kv"><dt>Rencana selesai</dt><dd><EndDate lease={l} /></dd>
        {first?.outstanding > 0 && <><dt>Batas bayar bulan pertama</dt><dd><FirstDueEdit lease={l} inv={first} /></dd></>}</dl>}
      {l?.end_date && l.end_date < today() && <div className="notice">Rencana selesai sudah lewat. Akhiri sewa bila penghuni sudah keluar, atau perbarui rencana selesai jika masih tinggal.</div>}
      <Entries rows={history} empty="Belum ada kontrak sewa." render={(lease) => <div className={css.entry}>
        <b>Kamar {d.roomCode(lease.room_id)} · {rentText(lease)}</b><small>{tgl(lease.start_date)}{lease.end_date && ` – ${tgl(lease.end_date)}`} · {lease.status === 'aktif' ? 'Aktif' : 'Selesai'}</small>
        {lease.end_reason && <span>{lease.end_reason}</span>}<Link href="/kamar">Buka modul Kamar</Link>
      </div>} />
      <div className="row">{l ? <><button onClick={() => act('move', { lease: l })}>Pindah kamar</button><button className="danger" onClick={() => act('end', { lease: l })}>Akhiri sewa</button></>
        : <button className="primary" onClick={() => act('start', { id: occ.id })}>Mulai sewa</button>}</div>
    </>}
    {tab === 'bills' && <>
      <div className="row">{open.length > 0 && <button className="primary" onClick={() => act('pay', { id: open[0].id })}>Catat pembayaran</button>}
        {owner && hasPhone(occ) && open.length > 0 && <button onClick={() => go({ t: 'reminder', id: occ.id })}>Kirim pengingat</button>}</div>
      <Entries rows={bills} empty="Belum ada tagihan." render={(i) => <div className={css.entry}>
        <Link href={`/tagihan?invoice=${i.id}`}>{invTitle(i)}</Link><small>Kamar {d.roomCode(i.room_id)} · Jatuh tempo {tgl(i.due_date)}</small>
        <div className="row"><b>{rp(i.amount)}</b><InvChip inv={i} />{i.outstanding > 0 && i.status !== 'batal' && <button className="sm" onClick={() => act('pay', { id: i.id })}>Bayar {rp(i.outstanding)}</button>}</div>
      </div>} />
    </>}
    {tab === 'payments' && <>
      <Entries rows={d.payments.filter((p) => ids.has(p.invoice_id))} empty="Belum ada riwayat pembayaran." render={(p) => <div className={css.entry}>
        <b>{rp(p.amount)} · {METHOD[p.method] || 'Pembayaran'}</b><small>{tgl(p.paid_at)} · {PAY_ST[p.status]?.[0]} · {invTitle(d.invById.get(p.invoice_id))}</small>
        {p.status === 'terverifikasi' && <Link href={`/kwitansi/${p.id}`}>Buka kwitansi</Link>}
      </div>} />
      <Link href="/pembayaran">Buka modul Pembayaran</Link>
      {pathAllowed(kos, '/pembukuan') && <Link href="/pembukuan?tab=jurnal">Buka jurnal di Pembukuan</Link>}
    </>}
    {tab === 'deposit' && (depLease ? <DepositBox d={d} lease={depLease} /> : <p className="muted">Belum ada sewa dengan catatan deposit.</p>)}
    {tab === 'docs' && <Lampiran entity="occupant" id={occ.id} title="Dokumen penghuni" hint="Mis. foto KTP, surat perjanjian sewa (PDF). Hanya pemilik & karyawan bagian sewa yang bisa melihat." />}
  </Sheet>;
}

function OccEdit({ d, occ, onClose }) {
  const { kosId, bump } = useKos();
  const isNew = !occ;
  const [name, setName] = useState(occ?.name || '');
  const [phone, setPhone] = useState(occ?.phone || '');
  const [em, setEm] = useState(occ?.emergency || '');
  const [addr, setAddr] = useState(occ?.address || '');
  const [email, setEmail] = useState(occ?.email || '');
  const [remind, setRemind] = useState(occ ? occ.email_reminders !== false : true);
  const [notes, setNotes] = useState(occ?.notes || '');
  const [busy, setBusy] = useState(false);
  const used = occ && d.leases.some((l) => l.occupant_id === occ.id);

  async function save() {
    if (!name.trim()) return run(() => { throw new Error('Isi nama penghuni.'); });
    const mail = email.trim().toLowerCase();
    if (mail && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(mail)) return run(() => { throw new Error('Format email tidak valid.'); });
    const data = { name: name.trim(), phone: phone.trim() || null, emergency: em.trim() || null, ...(occ?.address !== undefined || isNew ? { address: addr.trim() || null } : {}), notes: notes.trim() || null, ...(occ?.email !== undefined || isNew ? { email: mail || null, email_reminders: remind } : {}) };
    setBusy(true);
    const ok = await run(() => isNew ? supabase.from('occupants').insert({ ...data, kos_id: kosId }) : supabase.from('occupants').update(data).eq('id', occ.id), isNew ? 'Penghuni ditambahkan' : 'Data diperbarui', errMsg);
    setBusy(false);
    if (ok) { bump(); onClose(); }
  }
  async function del() {
    if (!confirm(`Hapus ${occ.name}?`)) return;
    if (await run(() => supabase.from('occupants').delete().eq('id', occ.id), 'Penghuni dihapus', errMsg)) { bump(); onClose(); }
  }
  return (
    <Sheet title={isNew ? 'Tambah penghuni' : 'Ubah penghuni'} onClose={onClose}>
      <p className="small muted" style={{ margin: 0 }}>Isi hanya data yang benar-benar diperlukan.</p>
      <Field label="Nama lengkap"><input value={name} onChange={(e) => setName(e.target.value)} /></Field>
      <div className="row">
        <Field label="No. WhatsApp"><input inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="08…" /></Field>
        <Field label="Kontak darurat"><input value={em} onChange={(e) => setEm(e.target.value)} placeholder="Nama & nomor" /></Field>
      </div>
      <div className="row">
        <Field label="Alamat asal (opsional)"><input value={addr} maxLength={300} onChange={(e) => setAddr(e.target.value)} placeholder="jalan, desa, kota" /></Field>
      </div>
      <Field label="Email (opsional)" hint="Untuk pengingat tagihan otomatis. Penghuni juga bisa mengisinya sendiri di portal."><input type="email" inputMode="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="nama@gmail.com" /></Field>
      {email.trim() && <label className="row small" style={{ fontWeight: 700 }}><input type="checkbox" style={{ width: 22, minHeight: 22 }} checked={remind} onChange={(e) => setRemind(e.target.checked)} /> Kirim pengingat jatuh tempo ke email ini (paket Dasar ke atas)</label>}
      <Field label="Catatan"><textarea value={notes} onChange={(e) => setNotes(e.target.value)} /></Field>
      <button className="cta" onClick={save} disabled={busy}>{busy ? 'Menyimpan…' : 'Simpan'}</button>
      {!isNew && !used && <button className="danger" onClick={del}>Hapus penghuni</button>}
    </Sheet>
  );
}

// Batas bayar tagihan bulan pertama (penghuni baru) — selama belum lunas bisa digeser tanpa mengubah periode sewa
function FirstDueEdit({ lease, inv }) {
  const { bump } = useKos();
  const [edit, setEdit] = useState(false);
  const [v, setV] = useState(inv.due_date);
  const [busy, setBusy] = useState(false);
  const save = async () => {
    setBusy(true);
    const ok = await run(() => supabase.rpc('lease_first_due', { p_lease: lease.id, p_due: v || null }), `Batas bayar menjadi ${tgl(v || lease.billing_start)}`, errMsg);
    setBusy(false);
    if (ok) { setEdit(false); bump(); }
  };
  if (!edit) return <>{tgl(inv.due_date)} <button className="sm ghost" style={{ minHeight: 0, padding: '0 4px' }} onClick={() => setEdit(true)}>ubah</button></>;
  return (
    <span className="row" style={{ flexWrap: 'wrap', justifyContent: 'flex-end', gap: 6 }}>
      <input type="date" value={v} min={lease.billing_start} onChange={(e) => setV(e.target.value)} style={{ width: 150 }} aria-label="Batas bayar bulan pertama" />
      <button className="sm primary" disabled={busy} onClick={save}>Simpan</button>
    </span>
  );
}

// Ubah rencana selesai sewa (mis. penghuni akan pindah; kamar bisa dibooking untuk setelahnya)
function EndDate({ lease }) {
  const { bump } = useKos();
  const [edit, setEdit] = useState(false);
  const [v, setV] = useState(lease.end_date || '');
  const [busy, setBusy] = useState(false);
  const save = async () => {
    setBusy(true);
    const ok = await run(() => supabase.rpc('lease_set_end', { p_lease: lease.id, p_end: v || null }), v ? 'Rencana selesai disimpan' : 'Rencana selesai dikosongkan', errMsg);
    setBusy(false);
    if (ok) { setEdit(false); bump(); }
  };
  if (!edit) return <>{lease.end_date ? tgl(lease.end_date) : 'belum diisi'} <button className="sm ghost" style={{ minHeight: 0, padding: '0 4px' }} onClick={() => setEdit(true)}>ubah</button></>;
  return (
    <span className="row" style={{ flexWrap: 'wrap', justifyContent: 'flex-end', gap: 6 }}>
      <input type="date" value={v} min={lease.start_date} onChange={(e) => setV(e.target.value)} style={{ width: 150 }} aria-label="Rencana selesai" />
      <button className="sm primary" disabled={busy} onClick={save}>Simpan</button>
    </span>
  );
}
