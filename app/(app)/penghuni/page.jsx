'use client';
import { useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useKos } from '@/components/KosProvider';
import { useData } from '@/lib/useData';
import { Sheet, Field, Loading, Empty, InvChip, run } from '@/components/ui';
import { StartLeaseSheet, EndLeaseSheet } from '@/components/LeaseForms';
import { rp, tgl, invTitle, errMsg, waLink } from '@/lib/format';

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
      <div className="row between"><h2>Penghuni</h2><button className="primary" onClick={() => setSheet({ t: 'edit', occ: null })}>+ Penghuni</button></div>
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
  const { kos } = useKos();
  if (!occ) return null;
  const l = d.activeByOcc.get(occ.id);
  const invs = d.invoices.filter((i) => i.occupant_id === occ.id && i.status !== 'batal').slice(0, 12);
  const debt = d.outByOcc.get(occ.id) || 0;
  const unpaid = invs.filter((i) => i.outstanding > 0);
  const reminder = `Halo ${occ.name}, ini pengingat dari ${kos.name}. Tagihan yang belum dibayar:\n` +
    unpaid.map((i) => `• ${invTitle(i)}: ${rp(i.outstanding)}`).join('\n') + `\nTotal ${rp(debt)}. Terima kasih 🙏`;
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
  const [notes, setNotes] = useState(occ?.notes || '');
  const [busy, setBusy] = useState(false);
  const used = occ && d.leases.some((l) => l.occupant_id === occ.id);

  async function save() {
    if (!name.trim()) return run(() => { throw new Error('Isi nama penghuni.'); });
    const data = { name: name.trim(), phone: phone.trim() || null, emergency: em.trim() || null, notes: notes.trim() || null };
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
      <Field label="Catatan"><textarea value={notes} onChange={(e) => setNotes(e.target.value)} /></Field>
      <button className="cta" onClick={save} disabled={busy}>{busy ? 'Menyimpan…' : 'Simpan'}</button>
      {!isNew && !used && <button className="danger" onClick={del}>Hapus penghuni</button>}
    </Sheet>
  );
}
