'use client';
import PortalBox from '@/components/PortalBox';
import { moduleOn } from '@/lib/business';
import PageHelp from '@/components/PageHelp';
import { useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useKos } from '@/components/KosProvider';
import { useData } from '@/lib/useData';
import { Sheet, Field, Loading, Empty, InvChip, run } from '@/components/ui';
import { StartLeaseSheet, EndLeaseSheet } from '@/components/LeaseForms';
import { rp, tgl, invTitle, errMsg, waLink } from '@/lib/format';
import { message, caraBayar } from '@/lib/templates';
import Link from 'next/link';

export default function Penghuni() {
  const d = useData();
  const [f, setF] = useState('aktif');
  const [q, setQ] = useState('');
  const [sheet, setSheet] = useState(null);
  if (!d.ready) return d.err ? <div className="notice bad">{d.err}</div> : <Loading />;

  const list = d.occupants
    .filter((o) => (f === 'aktif' ? d.activeByOcc.has(o.id) : f === 'keluar' ? !d.activeByOcc.has(o.id) : true))
    .filter((o) => !q || (o.name + ' ' + (o.phone || '')).toLowerCase().includes(q.toLowerCase()));
  const close = () => setSheet(null);

  return (
    <div className="stack">
      <div className="row between"><div className="row"><h2>Penghuni</h2><PageHelp page="penghuni" /></div><button className="primary" onClick={() => setSheet({ t: 'edit', occ: null })}>+ Penghuni</button></div>
      <div className="row">
        <div className="seg">
          {[['aktif', 'Aktif'], ['keluar', 'Tidak aktif'], ['semua', 'Semua']].map(([k, l]) => <button key={k} className={f === k ? 'on' : ''} onClick={() => setF(k)}>{l}</button>)}
        </div>
        <input style={{ flex: '1 1 180px' }} placeholder="Cari nama / nomor" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      {list.length === 0 ? <Empty title="Belum ada penghuni" text="Tambahkan penghuni, atau isi kamar dari halaman Kamar." /> : (
        <section className="panel"><div className="list">
          {list.map((o) => {
            const l = d.activeByOcc.get(o.id);
            const debt = d.outByOcc.get(o.id) || 0;
            return (
              <div className="li click" key={o.id} onClick={() => setSheet({ t: 'detail', id: o.id })}>
                <div className="main"><b>{o.name}</b><span className="small muted">{l ? `Kamar ${d.roomCode(l.room_id)} · sejak ${tgl(l.start_date)}` : 'Tidak menyewa'}</span></div>
                {debt > 0 ? <span className="num" style={{ color: 'var(--bad)' }}>{rp(debt)}</span> : <span className="chip good">Lunas</span>}
              </div>
            );
          })}
        </div></section>
      )}
      {sheet?.t === 'detail' && <OccDetail d={d} occ={d.occById.get(sheet.id)} go={setSheet} onClose={close} />}
      {sheet?.t === 'edit' && <OccEdit d={d} occ={sheet.occ} onClose={close} />}
      {sheet?.t === 'start' && <StartLeaseSheet d={d} occupantId={sheet.id} onClose={close} />}
      {sheet?.t === 'end' && <EndLeaseSheet d={d} lease={sheet.lease} onClose={close} />}
    </div>
  );
}

function OccDetail({ d, occ, go, onClose }) {
  const { kos, user } = useKos();
  if (!occ) return null;
  const l = d.activeByOcc.get(occ.id);
  const invs = d.invoices.filter((i) => i.occupant_id === occ.id && i.status !== 'batal').slice(0, 12);
  const debt = d.outByOcc.get(occ.id) || 0;
  const unpaid = invs.filter((i) => i.outstanding > 0);
  const reminder = message('reminder', kos.wa_reminder_tpl, {
    nama: occ.name, kos: kos.name, kamar: l ? d.roomCode(l.room_id) : '',
    rincian: unpaid.map((i) => `• ${invTitle(i)}: ${rp(i.outstanding)}`).join('\n'),
    total: rp(debt), cara_bayar: caraBayar(kos.payment_info),
  });
  return (
    <Sheet title={occ.name} onClose={onClose}>
      <dl className="kv">
        <dt>Kamar</dt><dd>{l ? d.roomCode(l.room_id) : '—'}</dd>
        {l && <><dt>Sewa</dt><dd>{rp(l.rent)}/bulan sejak {tgl(l.start_date)}</dd></>}
        <dt>WhatsApp</dt><dd>{occ.phone || '—'}</dd>
        {occ.emergency && <><dt>Kontak darurat</dt><dd>{occ.emergency}</dd></>}
        <dt>Belum dibayar</dt><dd style={{ color: debt ? 'var(--bad)' : undefined }}>{rp(debt)}</dd>
      </dl>
      {occ.phone && debt > 0 && <a href={waLink(occ.phone, reminder)} target="_blank" rel="noreferrer"><button className="primary" style={{ width: '100%' }}>Kirim pengingat via WhatsApp</button></a>}
      {moduleOn(kos, 'p_portal') && <PortalBox occ={occ} room={l ? d.roomCode(l.room_id) : ''} />}
      {kos.owner_id === user?.id && <Link href="/pengaturan#pesan" className="small" style={{ textAlign: 'center' }}>Ubah teks pesan WhatsApp</Link>}
      <section className="panel"><span className="label">Tagihan terakhir</span>
        {invs.length === 0 ? <p className="small muted" style={{ margin: 0 }}>Belum ada tagihan.</p> : (
          <div className="list">{invs.map((i) => (
            <div className="li" key={i.id}><div className="main"><b>{invTitle(i)}</b><span className="small muted">Jatuh tempo {tgl(i.due_date)}</span></div>
              <div style={{ textAlign: 'right' }}><div className="num">{rp(i.amount)}</div><InvChip inv={i} /></div></div>
          ))}</div>
        )}
      </section>
      <div className="row">
        {l ? <button className="danger" onClick={() => go({ t: 'end', lease: l })}>Akhiri sewa</button> : <button className="primary" onClick={() => go({ t: 'start', id: occ.id })}>Mulai sewa</button>}
        <button onClick={() => go({ t: 'edit', occ })}>Ubah data</button>
      </div>
    </Sheet>
  );
}

function OccEdit({ d, occ, onClose }) {
  const { kosId, bump } = useKos();
  const isNew = !occ;
  const [name, setName] = useState(occ?.name || '');
  const [phone, setPhone] = useState(occ?.phone || '');
  const [em, setEm] = useState(occ?.emergency || '');
  const [email, setEmail] = useState(occ?.email || '');
  const [remind, setRemind] = useState(occ ? occ.email_reminders !== false : true);
  const [notes, setNotes] = useState(occ?.notes || '');
  const [busy, setBusy] = useState(false);
  const used = occ && d.leases.some((l) => l.occupant_id === occ.id);

  async function save() {
    if (!name.trim()) return run(() => { throw new Error('Isi nama penghuni.'); });
    const mail = email.trim().toLowerCase();
    if (mail && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(mail)) return run(() => { throw new Error('Format email tidak valid.'); });
    const data = { name: name.trim(), phone: phone.trim() || null, emergency: em.trim() || null, notes: notes.trim() || null, ...(occ?.email !== undefined || isNew ? { email: mail || null, email_reminders: remind } : {}) };
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
      <Field label="Email (opsional)" hint="Untuk pengingat tagihan otomatis. Penghuni juga bisa mengisinya sendiri di portal."><input type="email" inputMode="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="nama@gmail.com" /></Field>
      {email.trim() && <label className="row small" style={{ fontWeight: 700 }}><input type="checkbox" style={{ width: 22, minHeight: 22 }} checked={remind} onChange={(e) => setRemind(e.target.checked)} /> Kirim pengingat jatuh tempo ke email ini (paket Standar)</label>}
      <Field label="Catatan"><textarea value={notes} onChange={(e) => setNotes(e.target.value)} /></Field>
      <button className="cta" onClick={save} disabled={busy}>{busy ? 'Menyimpan…' : 'Simpan'}</button>
      {!isNew && !used && <button className="danger" onClick={del}>Hapus penghuni</button>}
    </Sheet>
  );
}
