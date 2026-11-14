'use client';
import PageHelp from '@/components/PageHelp';
import { useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useKos } from '@/components/KosProvider';
import { useData } from '@/lib/useData';
import { Sheet, Field, Loading, Empty, run } from '@/components/ui';
import { StartLeaseSheet, EndLeaseSheet, MoveRoomSheet } from '@/components/LeaseForms';
import PaySheet from '@/components/PaySheet';
import { rp, tgl, angka, parseRp, ROOM_ST, errMsg } from '@/lib/format';
import Link from 'next/link';
import { moduleOn, canArea } from '@/lib/business';
import EntityPhotos from '@/components/media/EntityPhotos';
import ListThumb, { useThumbs } from '@/components/media/ListThumb';

export default function Kamar() {
  const d = useData();
  const [filter, setFilter] = useState('');
  const [sheet, setSheet] = useState(null);
  const { kosId, ver } = useKos();
  const thumbs = useThumbs(kosId, 'room', `${ver}:${sheet ? 1 : 0}`);
  if (!d.ready) return d.err ? <div className="notice bad">{d.err}</div> : <Loading />;

  const list = d.rooms.filter((r) => !filter || r.status === filter);
  const count = (s) => d.rooms.filter((r) => r.status === s).length;
  const close = () => setSheet(null);

  return (
    <div className="stack">
      <div className="row between"><div className="row"><h2>Kamar</h2><PageHelp page="kamar" /></div><button className="primary" onClick={() => setSheet({ t: 'edit', room: null })}>+ Kamar</button></div>
      <div className="seg">
        <button className={!filter ? 'on' : ''} onClick={() => setFilter('')}>Semua {d.rooms.length}</button>
        {Object.entries(ROOM_ST).map(([k, l]) => <button key={k} className={filter === k ? 'on' : ''} onClick={() => setFilter(k)}>{l} {count(k)}</button>)}
      </div>
      {list.length === 0 ? <Empty title="Tidak ada kamar" text="Tidak ada kamar dengan status ini." /> : (
        <div className="rooms">
          {list.map((r) => {
            const l = d.activeByRoom.get(r.id);
            const debt = l ? d.outByOcc.get(l.occupant_id) || 0 : 0;
            return (
              <button key={r.id} className={'room ' + r.status} onClick={() => setSheet({ t: 'detail', id: r.id })}>
                <span className="code" style={{ gap: 8 }}><span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, minWidth: 0 }}>{thumbs[r.id] && <ListThumb path={thumbs[r.id]} size={34} radius={6} />}{r.code}</span><span className={'dot ' + r.status} /></span>
                <span className="who">{l ? d.occName(l.occupant_id) : ROOM_ST[r.status]}</span>
                <span className="small muted">{r.rent ? rp(r.rent) : 'Harga belum diisi'}</span>
                {debt > 0 && <span className="small" style={{ color: 'var(--bad)', fontWeight: 800 }}>Tunggak {rp(debt)}</span>}
                {d.bookByRoom?.get(r.id) && <span className="small" style={{ color: 'var(--att-fg)', fontWeight: 800 }}>Dibooking · masuk {tgl(d.bookByRoom.get(r.id).check_in)}</span>}
              </button>
            );
          })}
        </div>
      )}
      {sheet?.t === 'detail' && <RoomDetail d={d} room={d.roomById.get(sheet.id)} go={setSheet} onClose={close} />}
      {sheet?.t === 'edit' && <RoomEdit d={d} room={sheet.room} onClose={close} />}
      {sheet?.t === 'start' && <StartLeaseSheet d={d} roomId={sheet.id} onClose={close} />}
      {sheet?.t === 'end' && <EndLeaseSheet d={d} lease={sheet.lease} onClose={close} />}
      {sheet?.t === 'move' && <MoveRoomSheet d={d} lease={sheet.lease} onClose={close} />}
      {sheet?.t === 'pay' && <PaySheet d={d} inv={d.invById.get(sheet.id)} onClose={close} />}
    </div>
  );
}

function RoomDetail({ d, room, go, onClose }) {
  const { kos } = useKos();
  if (!room) return null;
  const l = d.activeByRoom.get(room.id);
  const occ = l && d.occById.get(l.occupant_id);
  const debt = l ? d.outByOcc.get(l.occupant_id) || 0 : 0;
  const hist = d.leases.filter((x) => x.room_id === room.id && x.status === 'selesai').slice(0, 5);
  return (
    <Sheet title={`Kamar ${room.code}`} onClose={onClose}>
      <dl className="kv">
        <dt>Status</dt><dd>{ROOM_ST[room.status]}</dd>
        <dt>Harga sewa</dt><dd>{room.rent ? rp(room.rent) : '—'}</dd>
        {room.facilities?.length > 0 && <><dt>Fasilitas</dt><dd>{room.facilities.join(', ')}</dd></>}
        {room.notes && <><dt>Catatan</dt><dd>{room.notes}</dd></>}
      </dl>
      <EntityPhotos kosId={kos.id} entity="room" entityId={room.id} category="kamar" title="Foto kamar" max={8} canEdit={canArea(kos, 'rent')}
        hint="Belum ada foto. Foto kamar tampil di halaman bisnis saat kamar tersedia — calon penghuni lebih yakin bila bisa melihat kamarnya." />
      {occ ? (
        <section className="panel">
          <span className="label">Penghuni sekarang</span>
          <b>{occ.name}</b>
          <dl className="kv">
            {occ.phone && <><dt>WhatsApp</dt><dd><a href={`https://wa.me/${occ.phone.replace(/\D/g, '').replace(/^0/, '62')}`}>{occ.phone}</a></dd></>}
            <dt>Masuk</dt><dd>{tgl(l.start_date)}</dd>
            <dt>Sewa</dt><dd>{rp(l.rent)}/bulan</dd>
            <dt>Belum dibayar</dt><dd style={{ color: debt ? 'var(--bad)' : undefined }}>{rp(debt)}</dd>
            {(d.depByLease?.get(l.id) || 0) > 0 && <><dt>Deposit dipegang</dt><dd>{rp(d.depByLease.get(l.id))}</dd></>}
          </dl>
          {debt > 0 && (() => { const u = d.invoices.filter((i) => i.lease_id === l.id && i.status !== 'batal' && i.outstanding > 0).sort((a, b) => a.due_date.localeCompare(b.due_date))[0]; return u ? <button className="primary" onClick={() => go({ t: 'pay', id: u.id })}>Catat pembayaran / tandai lunas</button> : null; })()}
          <div className="row"><button onClick={() => go({ t: 'move', lease: l })}>Pindah kamar</button><button className="danger" onClick={() => go({ t: 'end', lease: l })}>Akhiri sewa</button></div>
        </section>
      ) : room.status === 'tersedia' && !d.bookByRoom?.get(room.id) ? (
        <button className="cta" onClick={() => go({ t: 'start', id: room.id })}>Isi kamar ini</button>
      ) : null}
      {d.bookByRoom?.get(room.id) ? (
        <Link href="/booking" className="notice" style={{ textDecoration: 'none' }}>📅 Dibooking {d.bookByRoom.get(room.id).name} ({d.bookByRoom.get(room.id).number}), masuk {tgl(d.bookByRoom.get(room.id).check_in)}. Check-in lewat menu Booking →</Link>
      ) : moduleOn(kos, 'p_booking') && room.status !== 'tidak_disewakan' && <Link href={`/booking?kamar=${room.id}`} className="small" style={{ textAlign: 'center' }}>📅 Booking kamar ini untuk calon penghuni</Link>}
      {moduleOn(kos, 'p_perbaikan') && <Link href={`/perbaikan?kamar=${room.id}`} className="small" style={{ textAlign: 'center' }}>🔧 Catat keluhan / kerusakan kamar ini</Link>}
      {hist.length > 0 && (
        <section className="panel"><span className="label">Penghuni sebelumnya</span>
          <div className="list">{hist.map((h) => <div className="li" key={h.id}><span>{d.occName(h.occupant_id)}</span><span className="small muted">{tgl(h.start_date)} – {tgl(h.end_date)}</span></div>)}</div>
        </section>
      )}
      <button onClick={() => go({ t: 'edit', room })}>Ubah data kamar</button>
    </Sheet>
  );
}

function RoomEdit({ d, room, onClose }) {
  const { kosId, bump } = useKos();
  const isNew = !room;
  const [code, setCode] = useState(room?.code || '');
  const [rent, setRent] = useState(room?.rent ? angka(room.rent) : '');
  const [status, setStatus] = useState(room?.status || 'tersedia');
  const [fac, setFac] = useState(room?.facilities?.join(', ') || '');
  const [notes, setNotes] = useState(room?.notes || '');
  const [busy, setBusy] = useState(false);
  const used = room && d.leases.some((l) => l.room_id === room.id);

  async function save() {
    if (!code.trim()) return run(() => { throw new Error('Isi kode kamar.'); });
    const data = { code: code.trim().toUpperCase(), rent: rent.trim() ? parseRp(rent) : null, facilities: fac.split(',').map((s) => s.trim()).filter(Boolean), notes: notes.trim() || null };
    if (room?.status !== 'terisi') data.status = status;
    setBusy(true);
    const ok = await run(() => isNew ? supabase.from('rooms').insert({ ...data, kos_id: kosId }) : supabase.from('rooms').update(data).eq('id', room.id), isNew ? 'Kamar ditambahkan' : 'Kamar diperbarui', errMsg);
    setBusy(false);
    if (ok) { bump(); onClose(); }
  }
  async function del() {
    if (!confirm(`Hapus kamar ${room.code}?`)) return;
    if (await run(() => supabase.from('rooms').delete().eq('id', room.id), 'Kamar dihapus', errMsg)) { bump(); onClose(); }
  }

  return (
    <Sheet title={isNew ? 'Tambah kamar' : `Ubah kamar ${room.code}`} onClose={onClose}>
      <div className="row">
        <Field label="Kode kamar"><input value={code} onChange={(e) => setCode(e.target.value)} placeholder="mis. A11" /></Field>
        <Field label="Harga sewa / bulan"><input inputMode="numeric" value={rent} onChange={(e) => setRent(e.target.value)} placeholder="belum diisi" /></Field>
      </div>
      <Field label="Status" hint={room?.status === 'terisi' ? 'Diatur otomatis oleh data sewa.' : '"Terisi" otomatis saat penghuni masuk.'}>
        {room?.status === 'terisi' ? <input value="Terisi" readOnly /> : (
          <select value={status} onChange={(e) => setStatus(e.target.value)}>{['tersedia', 'perbaikan', 'tidak_disewakan'].map((s) => <option key={s} value={s}>{ROOM_ST[s]}</option>)}</select>
        )}
      </Field>
      <Field label="Fasilitas" hint="Pisahkan dengan koma"><input value={fac} onChange={(e) => setFac(e.target.value)} placeholder="Kasur, lemari, kamar mandi dalam" /></Field>
      <Field label="Catatan"><textarea value={notes} onChange={(e) => setNotes(e.target.value)} /></Field>
      <button className="cta" onClick={save} disabled={busy}>{busy ? 'Menyimpan…' : 'Simpan'}</button>
      {!isNew && !used && <button className="danger" onClick={del}>Hapus kamar</button>}
    </Sheet>
  );
}
