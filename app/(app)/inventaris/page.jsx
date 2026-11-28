'use client';
// Inventaris & pemeriksaan kamar/unit (modul p_inventaris, migrasi 20261128160000).
// room_items = perlengkapan tiap kamar (tulis langsung, RLS area rent). room_inspections = pemeriksaan masuk/keluar/rutin lewat
// room_inspection_save (salinan kondisi sebelum & sesudah; tidak bisa diubah). Kerusakan dipotong dari deposit lewat DepositBox (mesin deposit lama).
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { useKos } from '@/components/KosProvider';
import { useData } from '@/lib/useData';
import { PageHeader, FilterToolbar } from '@/components/Page';
import { Loading, Empty, Sheet, Field, run } from '@/components/ui';
import PageHelp from '@/components/PageHelp';
import DepositBox from '@/components/DepositBox';
import { rp, tgl, today, errMsg, parseRp, angka } from '@/lib/format';
import { termsFor } from '@/lib/propertyTerms';
import styles from './inventaris.module.css';

const CONDITION = { baik: 'Baik', perlu_perbaikan: 'Perlu perbaikan', rusak: 'Rusak', hilang: 'Hilang' };
const KIND = { masuk: 'Check-in (masuk)', keluar: 'Check-out (keluar)', rutin: 'Pemeriksaan rutin' };

export default function Inventaris() {
  const d = useData();
  const { kos, kosId, ver } = useKos();
  const sp = useSearchParams();
  const t = termsFor(kos);
  const [items, setItems] = useState(null);
  const [insp, setInsp] = useState(null);
  const [q, setQ] = useState('');
  const [loc, setLoc] = useState('');
  const [room, setRoom] = useState(sp.get('kamar') || null);
  const [sheet, setSheet] = useState(sp.get('periksa') === '1' ? { t: 'pick' } : null);
  const [err, setErr] = useState(null);
  const load = async () => {
    const [a, b] = await Promise.all([
      supabase.from('room_items').select('*').eq('kos_id', kosId).order('name'),
      supabase.from('room_inspections').select('*').eq('kos_id', kosId).order('date', { ascending: false }).order('created_at', { ascending: false }).limit(500),
    ]);
    if (a.error || b.error) return setErr(errMsg(a.error || b.error));
    setItems(a.data); setInsp(b.data);
  };
  useEffect(() => { load(); }, [kosId, ver]); // eslint-disable-line react-hooks/exhaustive-deps
  const locs = (kos?.locs?.list || []).filter((b) => b.kind === 'cabang');
  const main = locs.find((b) => b.is_main)?.id;
  const rows = useMemo(() => {
    if (!d.ready || !items) return [];
    const term = q.trim().toLowerCase();
    return d.rooms.filter((r) => (!loc || (r.branch_id || main) === loc) && (!term || [r.code, r.name, d.activeByRoom.get(r.id) && d.occName(d.activeByRoom.get(r.id).occupant_id)].some((v) => v?.toLowerCase().includes(term))))
      .map((r) => {
        const its = items.filter((x) => x.room_id === r.id);
        return { r, its, bad: its.filter((x) => x.condition !== 'baik').length, last: insp.find((x) => x.room_id === r.id) };
      });
  }, [d, items, insp, q, loc, main]);
  if (err) return <div className="notice bad">{err}</div>;
  if (!d.ready || !items) return d.err ? <div className="notice bad">{d.err}</div> : <Loading />;
  const cur = room && rows.find((x) => x.r.id === room) || (room && { r: d.rooms.find((r) => r.id === room), its: items.filter((x) => x.room_id === room) });
  const totalBad = items.filter((x) => x.condition !== 'baik').length;
  const done = () => { setSheet(null); load(); };

  return <div className={styles.page}>
    <PageHeader title={`Inventaris ${t.unit.toLowerCase()}`} help={<PageHelp page="inventaris" />}
      desc={`Perlengkapan tiap ${t.unit.toLowerCase()} dan pemeriksaan saat ${t.tenant.toLowerCase()} masuk, keluar, atau rutin.`}
      actions={<button className="primary" onClick={() => setSheet({ t: 'pick' })}>Periksa {t.unit.toLowerCase()}</button>} />
    <div className={styles.sum}>
      <div><b>{items.length}</b><span>barang tercatat</span></div>
      <div data-bad={totalBad > 0}><b>{totalBad}</b><span>perlu perhatian</span></div>
      <div><b>{insp.length}</b><span>pemeriksaan</span></div>
    </div>
    <FilterToolbar q={q} onQ={setQ} placeholder={`Cari ${t.unit.toLowerCase()} atau ${t.tenant.toLowerCase()}`}
      filters={locs.length > 1 && <select aria-label="Properti" value={loc} onChange={(e) => setLoc(e.target.value)}><option value="">Semua properti</option>{locs.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</select>} active={loc ? 1 : 0} />
    {!d.rooms.length ? <Empty title={`Belum ada ${t.unit.toLowerCase()}`} text={`Tambahkan ${t.unit.toLowerCase()} dulu di menu ${t.unit}.`}><Link href="/kamar?baru=1">Tambah {t.unit.toLowerCase()}</Link></Empty> :
      <div className={styles.grid}>{rows.map(({ r, its, bad, last }) => <button key={r.id} className={styles.card} onClick={() => setRoom(r.id)} aria-pressed={room === r.id}>
        <span className={styles.ch}><b>{r.code}</b>{bad > 0 && <span className="chip bad">{bad} perlu perhatian</span>}</span>
        <span className="small muted">{its.length ? `${its.length} barang` : 'Belum ada daftar barang'}{d.activeByRoom.get(r.id) ? ` · ${d.occName(d.activeByRoom.get(r.id).occupant_id)}` : ''}</span>
        <span className="small muted">{last ? `${KIND[last.kind].split(' (')[0]} ${tgl(last.date)}` : 'Belum pernah diperiksa'}</span>
      </button>)}</div>}

    {cur?.r && <RoomItems key={cur.r.id} d={d} kosId={kosId} room={cur.r} items={items.filter((x) => x.room_id === cur.r.id)} insp={insp.filter((x) => x.room_id === cur.r.id)} t={t}
      onClose={() => setRoom(null)} onChange={load} onInspect={() => setSheet({ t: 'inspect', room: cur.r })} />}
    {sheet?.t === 'pick' && <Sheet title={`Pilih ${t.unit.toLowerCase()} yang diperiksa`} onClose={() => setSheet(null)}>
      <div className="list">{d.rooms.map((r) => <button key={r.id} className="li" onClick={() => setSheet({ t: 'inspect', room: r })}>
        <div className="main"><b>{r.code}</b><span className="small muted">{items.filter((x) => x.room_id === r.id).length} barang{d.activeByRoom.get(r.id) ? ' · ' + d.occName(d.activeByRoom.get(r.id).occupant_id) : ''}</span></div>
      </button>)}</div>
    </Sheet>}
    {sheet?.t === 'inspect' && <Inspect d={d} kosId={kosId} room={sheet.room} items={items.filter((x) => x.room_id === sheet.room.id)} t={t} onClose={() => setSheet(null)} onDone={(res) => { load(); setSheet(res ? { t: 'after', ...res } : null); }} />}
    {sheet?.t === 'after' && <Sheet title="Pemeriksaan tersimpan" onClose={() => setSheet(null)}>
      <p>Pemeriksaan {KIND[sheet.kind].toLowerCase()} {sheet.room.code} tersimpan{sheet.damage > 0 ? ` dengan kerusakan ${rp(sheet.damage)}` : ''}.</p>
      {sheet.damage > 0 && sheet.lease ? <><p className="small muted">Bila sesuai perjanjian, potong deposit {t.tenant.toLowerCase()} untuk kerusakan ini (tulis alasannya).</p><DepositBox d={d} lease={sheet.lease} /></>
        : sheet.damage > 0 && <p className="small muted">Tidak ada sewa yang tertaut — tagih kerusakan lewat Tagihan › tagihan tambahan bila perlu.</p>}
      <button onClick={() => setSheet(null)}>Selesai</button>
    </Sheet>}
  </div>;
}

function RoomItems({ d, kosId, room, items, insp, t, onClose, onChange, onInspect }) {
  const [edit, setEdit] = useState(null);
  const [tab, setTab] = useState('barang');
  const del = async (x) => { if (confirm(`Hapus ${x.name} dari daftar? Riwayat pemeriksaan tetap tersimpan.`) && await run(() => supabase.from('room_items').delete().eq('id', x.id), 'Barang dihapus', errMsg)) onChange(); };
  return <Sheet title={`${t.unit} ${room.code}`} subtitle={d.activeByRoom.get(room.id) ? d.occName(d.activeByRoom.get(room.id).occupant_id) : 'Kosong'} icon="bed" wide onClose={onClose}>
    <div className="seg">{[['barang', `Barang (${items.length})`], ['riwayat', `Pemeriksaan (${insp.length})`]].map(([k, l]) => <button key={k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>{l}</button>)}</div>
    {tab === 'barang' && <>
      {!items.length ? <p className="muted small">Belum ada daftar barang. Contoh: kasur, lemari, AC, kunci (2), meja.</p> :
        <div className="list">{items.map((x) => <div className="li" key={x.id}>
          <div className="main"><b>{x.name}{x.qty > 1 ? ` × ${x.qty}` : ''}</b>
            <span className="small muted">{x.checked_at ? `diperiksa ${tgl(x.checked_at)}` : 'belum diperiksa'}{x.value ? ` · nilai ${rp(x.value)}` : ''}{x.note ? ` · ${x.note}` : ''}</span></div>
          <div className="row" style={{ flexWrap: 'nowrap' }}><span className={'chip ' + (x.condition === 'baik' ? 'good' : x.condition === 'perlu_perbaikan' ? 'warn' : 'bad')}>{CONDITION[x.condition]}</span>
            <button className="sm ghost" onClick={() => setEdit(x)} aria-label={`Ubah ${x.name}`}>Ubah</button></div>
        </div>)}</div>}
      <div className="row"><button onClick={() => setEdit({})}>+ Tambah barang</button>{items.length > 0 && <button className="primary" onClick={onInspect}>Periksa sekarang</button>}</div>
      {items.some((x) => x.condition === 'rusak' || x.condition === 'perlu_perbaikan') && <Link href={`/perbaikan?kamar=${room.id}`}>Catat perbaikan untuk barang yang rusak</Link>}
    </>}
    {tab === 'riwayat' && (!insp.length ? <p className="muted small">Belum ada pemeriksaan.</p> : <div className="list">{insp.map((x) => <details key={x.id} className="li">
      <summary><b>{KIND[x.kind]}</b> · {tgl(x.date)}{Number(x.damage) > 0 && <span className="chip bad">kerusakan {rp(x.damage)}</span>}</summary>
      <ul className="small">{(x.items || []).map((i) => <li key={i.item_id}>{i.name}{i.qty > 1 ? ` × ${i.qty}` : ''}: {CONDITION[i.before]}{i.before !== i.condition ? ` → ${CONDITION[i.condition]}` : ''}{i.note ? ` (${i.note})` : ''}</li>)}</ul>
      {x.note && <p className="small">{x.note}</p>}
    </details>)}</div>)}
    {edit && <ItemSheet kosId={kosId} room={room} item={edit.id ? edit : null} onClose={() => setEdit(null)} onDone={() => { setEdit(null); onChange(); }} onDelete={del} />}
  </Sheet>;
}

function ItemSheet({ kosId, room, item, onClose, onDone, onDelete }) {
  const [name, setName] = useState(item?.name || '');
  const [qty, setQty] = useState(String(item?.qty || 1));
  const [cond, setCond] = useState(item?.condition || 'baik');
  const [val, setVal] = useState(item?.value ? angka(item.value) : '');
  const [note, setNote] = useState(item?.note || '');
  const [busy, setBusy] = useState(false);
  const save = async () => {
    const row = { name: name.trim(), qty: Math.max(1, parseInt(qty, 10) || 1), condition: cond, value: val.trim() ? parseRp(val) : null, note: note.trim() || null };
    if (!row.name) return run(() => { throw new Error('Isi nama barang.'); });
    setBusy(true);
    const ok = await run(() => item ? supabase.from('room_items').update(row).eq('id', item.id) : supabase.from('room_items').insert({ ...row, kos_id: kosId, room_id: room.id }), 'Barang disimpan', errMsg);
    setBusy(false); if (ok) onDone();
  };
  return <Sheet title={item ? `Ubah ${item.name}` : `Tambah barang · ${room.code}`} onClose={onClose}>
    <div className="row"><Field label="Nama barang"><input value={name} maxLength={80} onChange={(e) => setName(e.target.value)} placeholder="mis. Kasur, AC, Kunci" /></Field>
      <Field label="Jumlah"><input inputMode="numeric" value={qty} onChange={(e) => setQty(e.target.value)} /></Field></div>
    <Field label="Kondisi" hint={item ? 'Untuk mencatat perubahan kondisi dengan bukti, pakai "Periksa sekarang".' : ''}><select value={cond} onChange={(e) => setCond(e.target.value)}>{Object.entries(CONDITION).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></Field>
    <Field label="Perkiraan nilai (opsional)" hint="Membantu menentukan potongan deposit bila rusak/hilang"><input inputMode="numeric" value={val} onChange={(e) => setVal(e.target.value)} placeholder="belum diisi" /></Field>
    <Field label="Catatan"><input value={note} maxLength={300} onChange={(e) => setNote(e.target.value)} /></Field>
    <button className="cta" disabled={busy} onClick={save}>{busy ? 'Menyimpan…' : 'Simpan'}</button>
    {item && <button className="danger" onClick={() => onDelete(item)}>Hapus dari daftar</button>}
  </Sheet>;
}

function Inspect({ d, kosId, room, items, t, onClose, onDone }) {
  const lease = d.activeByRoom.get(room.id) || d.leases.find((l) => l.room_id === room.id);
  const [kind, setKind] = useState(d.activeByRoom.get(room.id) ? 'rutin' : 'masuk');
  const [date, setDate] = useState(today());
  const [rows, setRows] = useState(items.map((x) => ({ item_id: x.id, name: x.name, qty: x.qty, condition: x.condition, note: '', value: x.value })));
  const [note, setNote] = useState('');
  const [dmg, setDmg] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (i, k, v) => setRows(rows.map((r, j) => (j === i ? { ...r, [k]: v } : r)));
  const suggested = rows.filter((r) => (r.condition === 'rusak' || r.condition === 'hilang') && r.value).reduce((s, r) => s + Number(r.value), 0);
  const save = async () => {
    setBusy(true);
    const damage = dmg.trim() ? parseRp(dmg) : 0;
    const ok = await run(() => supabase.rpc('room_inspection_save', { p_kos: kosId, p_room: room.id, p_lease: lease?.id || null, p_kind: kind, p_date: date,
      p_items: rows.map(({ item_id, condition, note: n }) => ({ item_id, condition, note: n })), p_note: note, p_damage: damage }), 'Pemeriksaan disimpan', errMsg);
    setBusy(false);
    if (ok) onDone({ room, kind, damage, lease: lease?.status === 'aktif' || kind === 'keluar' ? lease : null });
  };
  return <Sheet title={`Periksa ${t.unit.toLowerCase()} ${room.code}`} wide onClose={onClose}>
    <div className="seg">{Object.entries(KIND).map(([k, l]) => <button key={k} className={kind === k ? 'on' : ''} onClick={() => setKind(k)}>{l}</button>)}</div>
    <div className="row"><Field label="Tanggal"><input type="date" value={date} max={today()} onChange={(e) => setDate(e.target.value)} /></Field>
      <Field label={t.tenant}><input readOnly value={lease ? d.occName(lease.occupant_id) + (lease.status === 'aktif' ? '' : ' (sewa terakhir)') : '—'} /></Field></div>
    {!rows.length ? <p className="notice">Belum ada daftar barang di {t.unit.toLowerCase()} ini. Tambahkan dulu lewat kartu {t.unit.toLowerCase()} di halaman Inventaris.</p> :
      <div className={styles.check}>{rows.map((r, i) => <div key={r.item_id} className={styles.row}>
        <b>{r.name}{r.qty > 1 ? ` × ${r.qty}` : ''}</b>
        <div className={styles.conds} role="group" aria-label={`Kondisi ${r.name}`}>{Object.entries(CONDITION).map(([k, l]) => <button key={k} type="button" aria-pressed={r.condition === k} data-k={k} onClick={() => set(i, 'condition', k)}>{l}</button>)}</div>
        {r.condition !== 'baik' && <input value={r.note} maxLength={200} placeholder="Keterangan (mis. sobek di sudut)" onChange={(e) => set(i, 'note', e.target.value)} />}
      </div>)}</div>}
    <Field label="Nilai kerusakan (opsional)" hint={suggested > 0 ? `Perkiraan dari nilai barang rusak/hilang: ${rp(suggested)}` : 'Dicatat sebagai bukti; potong deposit dilakukan terpisah sesudahnya.'}>
      <input inputMode="numeric" value={dmg} onChange={(e) => setDmg(e.target.value)} placeholder="0" /></Field>
    <Field label="Catatan"><textarea value={note} maxLength={1000} onChange={(e) => setNote(e.target.value)} placeholder="mis. meteran listrik 1234 kWh, kunci diserahkan 2" /></Field>
    <p className="small muted">Pemeriksaan yang sudah disimpan tidak bisa diubah (bukti). Catat pemeriksaan baru bila ada koreksi.</p>
    <button className="cta" disabled={busy || !rows.length} onClick={save}>{busy ? 'Menyimpan…' : 'Simpan pemeriksaan'}</button>
  </Sheet>;
}
