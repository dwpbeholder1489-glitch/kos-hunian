'use client';
// Inventaris & pemeriksaan kamar/unit (modul p_inventaris, migrasi 20261128160000).
// room_items = perlengkapan tiap kamar (tulis langsung, RLS area rent). room_inspections = pemeriksaan masuk/keluar/rutin lewat
// room_inspection_save (salinan kondisi sebelum & sesudah; tidak bisa diubah). Kerusakan dipotong dari deposit lewat DepositBox (mesin deposit lama).
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { useKos } from '@/components/KosProvider';
import { allRows, useData } from '@/lib/useData';
import NavIcon from '@/components/NavIcon';
import Lampiran from '@/components/Lampiran';
import { canArea, pathAllowed } from '@/lib/business';
import { useKuotaEkspor } from '@/lib/ekspor';
import { InventoryTemplates } from './Templates';
import { Loading, Empty, Sheet, Field, run, toast } from '@/components/ui';
import PageHelp from '@/components/PageHelp';
import DepositBox from '@/components/DepositBox';
import { rp, tgl, today, errMsg, parseRp, angka } from '@/lib/format';
import { termsFor } from '@/lib/propertyTerms';
import styles from './inventaris.module.css';

const CONDITION = { baik: 'Baik', perlu_perbaikan: 'Perlu perbaikan', rusak: 'Rusak', hilang: 'Hilang' };
const KIND = { masuk: 'Check-in (masuk)', keluar: 'Check-out (keluar)', rutin: 'Pemeriksaan rutin' };

export default function Inventaris() {
  const { kos, kosId, ver } = useKos();
  return kosId ? <Inventory key={kosId} kos={kos} kosId={kosId} ver={ver} /> : <Loading />;
}

const count = (items) => items.reduce((total, item) => total + Number(item.qty), 0);

function Inventory({ kos, kosId, ver }) {
  const d = useData({ fullRoomHistory: true });
  const sp = useSearchParams();
  const t = termsFor(kos);
  const [items, setItems] = useState(null);
  const [insp, setInsp] = useState([]);
  const [q, setQ] = useState('');
  const [loc, setLoc] = useState('');
  const [filter, setFilter] = useState('all');
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [room, setRoom] = useState(sp.get('kamar'));
  const [sheet, setSheet] = useState(sp.get('periksa') === '1' ? { t: 'pick', mode: 'inspect' } : null);
  const [err, setErr] = useState(null);
  const [assets, setAssets] = useState(null);
  const [extended, setExtended] = useState(null);
  const finance = canArea(kos, 'finance') && pathAllowed(kos, '/aset');
  const load = async () => {
    const [a, b] = await Promise.all([
      allRows(() => supabase.from('room_items').select('*').eq('kos_id', kosId)),
      allRows(() => supabase.from('room_inspections').select('*').eq('kos_id', kosId)),
    ]);
    if (a.error || b.error) return setErr(errMsg(a.error || b.error));
    setErr(null);
    setItems(a.data.sort((x, y) => x.name.localeCompare(y.name, 'id')));
    setInsp(b.data.sort((x, y) => y.date.localeCompare(x.date) || String(y.created_at || '').localeCompare(String(x.created_at || ''))));
  };
  useEffect(() => { load(); }, [kosId, ver]);
  useEffect(() => {
    let active = true;
    supabase.from('room_inspections').select('confirmed_at').eq('kos_id', kosId).limit(0)
      .then(({ error }) => { if (active) setExtended(!error); });
    return () => { active = false; };
  }, [kosId, ver]);
  useEffect(() => {
    if (!finance) return;
    let active = true;
    allRows(() => supabase.from('fixed_assets').select('id,name,status').eq('kos_id', kosId))
      .then(({ data }) => { if (active && data) setAssets(data.sort((a, b) => a.name.localeCompare(b.name, 'id'))); });
    return () => { active = false; };
  }, [finance, kosId, ver]);
  const rows = useMemo(() => {
    if (!d.ready || !items) return [];
    const grouped = new Map(), latest = new Map();
    for (const item of items) {
      if (!grouped.has(item.room_id)) grouped.set(item.room_id, []);
      grouped.get(item.room_id).push(item);
    }
    for (const x of insp) if (!latest.has(x.room_id)) latest.set(x.room_id, x);
    return d.rooms.map((r) => {
      const its = grouped.get(r.id) || [];
      const lease = d.activeByRoom.get(r.id);
      return { r, its, qty: count(its), present: count(its.filter((x) => x.condition !== 'hilang')),
        bad: count(its.filter((x) => x.condition !== 'baik')), last: latest.get(r.id), tenant: lease ? d.occName(lease.occupant_id) : '' };
    });
  }, [d, items, insp]);
  const locs = (kos?.locs?.list || []).filter((b) => b.kind === 'cabang');
  const main = locs.find((b) => b.is_main)?.id;
  if (!d.ready || !items) return err || d.err ? <div className="notice bad">{err || d.err}</div> : <Loading />;
  const scoped = rows.filter(({ r }) => !loc || (r.branch_id || main) === loc);
  const attention = scoped.filter((x) => x.bad > 0).length;
  const checked = scoped.filter((x) => x.last).length;
  const term = q.trim().toLowerCase();
  const shown = scoped.filter(({ r, tenant, its, last, bad }) =>
    (filter === 'all' || (filter === 'bad' && bad > 0) || (filter === 'checked' && last) || (filter === 'new' && !last))
    && (!term || [r.code, r.name, tenant, ...its.map((x) => x.name)].some((v) => v?.toLowerCase().includes(term))));
  const cur = rows.find((row) => row.r.id === room);
  const unit = t.unit.toLowerCase();
  const close = () => setSheet(null);
  const openPicker = (mode) => setSheet({ t: 'pick', mode });
  const unavailable = () => toast('Fitur ini menunggu pembaruan basis data Inventaris.');
  const openHandover = () => extended ? openPicker('handover') : unavailable();
  const tabs = [['all', 'Semua', scoped.length], ['bad', 'Perlu Perhatian', attention], ['new', 'Belum Diperiksa', scoped.length - checked]];
  const kpis = [
    ['all', 'Barang Tercatat', scoped.reduce((n, x) => n + x.qty, 0), '/barang'],
    ['bad', 'Perlu Perhatian', attention, 'info'],
    ['checked', 'Sudah Diperiksa', checked, 'done'],
    ['new', 'Belum Diperiksa', scoped.length - checked, 'clock'],
  ];
  return <div className={styles.page}>
    <section className={styles.hero}>
      <div><h1>Inventaris {t.unit}</h1><p>Kelola perlengkapan tiap {unit} dan periksa kondisinya saat {t.tenant.toLowerCase()} masuk, keluar, atau saat pemeriksaan rutin.</p>
        <PageHelp page="inventaris" label="Panduan Inventaris" /></div>
      <img src="/barang-persediaan.webp" alt="" />
    </section>
    <div className={styles.sum} aria-label="Ringkasan inventaris">
      {kpis.map(([key, label, value, icon]) => <button key={key} data-tone={key} aria-pressed={filter === key} onClick={() => { setFilter(key); setQ(''); }}>
        <NavIcon name={icon} /><b>{angka(value)}</b><span>{label}</span>
      </button>)}
    </div>
    <div className={styles.actions} aria-label="Aksi inventaris">
      <button className="primary" onClick={() => openPicker('add')}><NavIcon name="plus" />Tambah Barang</button>
      <button onClick={() => openPicker('inspect')}><NavIcon name="done" />Periksa {t.unit}</button>
      <button onClick={openHandover}><NavIcon name="return" />Serah Terima Inventaris</button>
      <button onClick={() => setSheet({ t: 'report' })}><NavIcon name="/laporan" />Laporan Inventaris</button>
      <button onClick={() => setSheet({ t: 'more' })}><NavIcon name="more" />Lainnya</button>
    </div>
    <div className={styles.tabs} aria-label="Status inventaris">
      {[...tabs, ...(filter === 'checked' ? [['checked', 'Sudah Diperiksa', checked]] : [])].map(([key, label, value]) =>
        <button key={key} aria-pressed={filter === key} onClick={() => setFilter(key)}>{label} ({value})</button>)}
    </div>
    <div className={styles.search}>
      <label><NavIcon name="search" /><input type="search" aria-label="Cari kamar, penghuni, atau barang" value={q} onChange={(e) => setQ(e.target.value)} placeholder={`Cari ${unit}, penghuni, atau barang…`} /></label>
      <button aria-expanded={filtersOpen} onClick={() => setFiltersOpen(!filtersOpen)}><NavIcon name="filter" />Filter{loc ? ' •' : ''}</button>
    </div>
    {filtersOpen && <div className={styles.filter}>
      {locs.length > 1 && <Field label="Properti"><select value={loc} onChange={(e) => setLoc(e.target.value)}><option value="">Semua properti</option>{locs.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</select></Field>}
      <Field label="Status pemeriksaan"><select value={filter} onChange={(e) => setFilter(e.target.value)}>{[...tabs, ['checked', 'Sudah Diperiksa']].map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></Field>
    </div>}
    {err && <p className="notice bad" role="alert">{err}</p>}
    {!rows.length ? <Empty title={`Belum ada ${unit}`}><Link href="/kamar?baru=1">Tambah {unit}</Link></Empty> :
      !shown.length ? <Empty title={`Tidak ada ${unit} yang cocok`} text="Ubah pencarian atau filter inventaris." /> :
      <div className={styles.grid}>{shown.map(({ r, qty, present, tenant, bad, last }) => {
        const percent = qty ? Math.round(present * 100 / qty) : null;
        return <button key={r.id} className={styles.card} onClick={() => setRoom(r.id)} aria-haspopup="dialog">
          <span className={styles.roomIcon}><NavIcon name="bed" size={25} /></span>
          <span className={styles.roomInfo}><strong>{r.code}</strong><span>{tenant || 'Tanpa penghuni'}</span>
            <small>{last ? `Diperiksa ${tgl(last.date)}` : 'Belum pernah diperiksa'}</small></span>
          <span className={styles.roomStatus}>
            <span className={`chip ${bad ? 'warn' : !last || !qty ? '' : 'good'}`}>{bad ? 'Perlu perhatian' : !last ? 'Belum diperiksa' : qty ? 'Lengkap' : 'Belum ada barang'}</span>
            <small>{angka(present)} / {angka(qty)} barang{percent != null && ` · ${percent}%`}</small>
            <progress value={present} max={qty || 1} aria-label="Kelengkapan inventaris" />
          </span><NavIcon name="next" size={18} />
        </button>;
      })}</div>}

    {cur && !sheet && <RoomItems key={cur.r.id} d={d} kos={kos} kosId={kosId} extended={extended} assets={finance ? assets : null} room={cur.r} items={cur.its} insp={insp.filter((x) => x.room_id === cur.r.id)} t={t}
      onClose={() => setRoom(null)} onChange={load} onInspect={(mode) => mode === 'handover' && !extended ? unavailable() : setSheet({ t: 'inspect', mode, room: cur.r })} />}
    {sheet?.t === 'pick' && <Sheet title={`Pilih ${unit}`} onClose={close}>
      {!scoped.length && <Empty title={`Belum ada ${unit}`}><Link href="/kamar?baru=1">Tambah {unit}</Link></Empty>}
      <div className="list">{scoped.map(({ r, qty, tenant }) => <button key={r.id} className="li"
        onClick={() => setSheet({ t: sheet.mode === 'add' ? 'add' : 'inspect', mode: sheet.mode, room: r })}>
        <span className="main"><b>{r.code}</b><small>{angka(qty)} barang{tenant && ` · ${tenant}`}</small></span>
      </button>)}</div>
    </Sheet>}
    {sheet?.t === 'add' && <ItemSheet kosId={kosId} room={sheet.room} assets={finance ? assets : null} onClose={close}
      onDone={() => { load(); setRoom(sheet.room.id); close(); }} />}
    {sheet?.t === 'inspect' && <Inspect d={d} kosId={kosId} room={sheet.room} items={rows.find((x) => x.r.id === sheet.room.id)?.its || []}
      mode={sheet.mode} t={t} onClose={close} onDone={(res) => { load(); setSheet({ t: 'after', ...res }); }} />}
    {sheet?.t === 'after' && <Sheet title="Pemeriksaan tersimpan" onClose={close}>
      <p>{KIND[sheet.kind]} · {sheet.room.code}{sheet.damage > 0 && ` · Kerusakan ${rp(sheet.damage)}`}</p>
      {sheet.kind !== 'rutin' && sheet.inspection.date && <HandoverPdf kos={kos} room={sheet.room} inspection={sheet.inspection} occupant={sheet.lease && d.occName(sheet.lease.occupant_id)} />}
      {extended && <Lampiran entity="room_inspection" id={sheet.inspection.id} title="Dokumentasi pemeriksaan" />}
      {sheet.damage > 0 && sheet.lease && <><p className="small muted">Potong deposit hanya jika sesuai perjanjian. Nilai kerusakan di checklist adalah taksiran.</p><DepositBox d={d} lease={sheet.lease} /></>}
      {sheet.damage > 0 && !sheet.lease && <p className="small muted">Jika perlu, catat penagihan kerusakan di menu Tagihan.</p>}
      <button onClick={close}>Selesai</button>
    </Sheet>}
    {sheet?.t === 'report' && <InventoryReport kos={kos} rows={scoped} onClose={close} />}
    {sheet?.t === 'more' && <Sheet title="Lainnya" onClose={close}>
      <button onClick={() => extended ? setSheet({ t: 'templates' }) : unavailable()}><NavIcon name="/barang" /> Template Inventaris</button>
      {pathAllowed(kos, '/aset') && <Link href="/aset">Buka Aset Tetap</Link>}
      {pathAllowed(kos, '/pembukuan') && <Link href="/pembukuan">Buka Pembukuan</Link>}
    </Sheet>}
    {sheet?.t === 'templates' && <InventoryTemplates kosId={kosId} rows={rows} onClose={close} onApplied={load} />}
  </div>;
}

function RoomItems({ d, kos, kosId, extended, assets, room, items, insp, t, onClose, onChange, onInspect }) {
  const [edit, setEdit] = useState(null);
  const [tab, setTab] = useState('barang');
  const del = async (x) => {
    if (!confirm(`Hapus ${x.name} dari daftar? Riwayat pemeriksaan tetap tersimpan.`)) return false;
    const ok = await run(() => supabase.from('room_items').delete().eq('kos_id', kosId).eq('id', x.id), 'Barang dihapus', errMsg);
    if (ok) onChange();
    return ok;
  };
  if (edit) return <ItemSheet kosId={kosId} room={room} assets={assets} item={edit.id ? edit : null}
    onClose={() => setEdit(null)} onDone={() => { setEdit(null); onChange(); }}
    onDelete={async (item) => { if (await del(item)) setEdit(null); }} />;
  return <Sheet title={`${t.unit} ${room.code}`} subtitle={d.activeByRoom.get(room.id) ? d.occName(d.activeByRoom.get(room.id).occupant_id) : 'Kosong'} icon="bed" wide onClose={onClose}>
    <div className="seg">{[['barang', `Barang (${items.length})`], ['riwayat', `Pemeriksaan (${insp.length})`]].map(([k, l]) => <button key={k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>{l}</button>)}</div>
    {tab === 'barang' && <>
      {!items.length ? <p className="muted small">Belum ada daftar barang. Contoh: kasur, lemari, AC, kunci (2), meja.</p> :
        <div className={styles.check}>{items.map((x) => <div className={styles.row} key={x.id}>
          <div className={styles.itemHead}><b>{x.name} × {x.qty}</b><span className={`chip ${x.condition === 'baik' ? 'good' : 'warn'}`}>{CONDITION[x.condition]}</span></div>
          <small>{x.checked_at ? `Diperiksa ${tgl(x.checked_at)}` : 'Belum diperiksa'}{x.value ? ` · Nilai ${rp(x.value)}` : ''}{x.note ? ` · ${x.note}` : ''}</small>
          {x.asset_id && <small>Aset tetap tertaut{assets && ` · ${assets.find((a) => a.id === x.asset_id)?.name || 'Lihat daftar aset'}`}</small>}
          <div className="row">
            <button className="sm ghost" onClick={() => setEdit(x)} aria-label={`Ubah ${x.name}`}>Ubah</button>
            {x.condition !== 'baik' && <button className="sm ghost" onClick={() => setEdit({ ...x, replacement: true })}>Catat penggantian</button>}
            {x.condition !== 'baik' && pathAllowed(kos, '/perbaikan') && <Link href={`/perbaikan?kamar=${room.id}&judul=${encodeURIComponent(x.name)}`}>Catat perbaikan</Link>}
          </div>
          {extended && <details><summary>Dokumentasi foto</summary><AttachmentWhenOpen entity="room_item" id={x.id} /></details>}
        </div>)}</div>}
      <div className="row"><button onClick={() => setEdit({})}>+ Tambah barang</button>{items.length > 0 && <>
        <button className="primary" onClick={() => onInspect('inspect')}>Periksa sekarang</button>
        <button onClick={() => onInspect('handover')}>Serah terima</button></>}</div>
      <Link href={`/kamar?unit=${room.id}`}>Buka detail {t.unit.toLowerCase()}</Link>
    </>}
    {tab === 'riwayat' && (!insp.length ? <p className="muted small">Belum ada pemeriksaan.</p> : <div className={styles.check}>{insp.map((x) => <details key={x.id} className={styles.row}>
      <summary><b>{KIND[x.kind]}</b> · {tgl(x.date)}{Number(x.damage) > 0 && <span className="chip bad">Kerusakan {rp(x.damage)}</span>}</summary>
      <ul className="small">{(x.items || []).map((i) => <li key={i.item_id}>{i.name} × {i.qty} · {CONDITION[i.before]}{i.before !== i.condition ? ` → ${CONDITION[i.condition]}` : ''}{i.note ? ` (${i.note})` : ''}</li>)}</ul>
      {x.note && <p className="small">{x.note}</p>}
      {x.kind !== 'rutin' && <><p className="small">{x.confirmed_name ? `Dikonfirmasi oleh ${x.confirmed_name}` : 'Konfirmasi penghuni belum tercatat'}</p>
        <HandoverPdf kos={kos} room={room} inspection={x} occupant={d.leases.find((l) => l.id === x.lease_id) && d.occName(d.leases.find((l) => l.id === x.lease_id).occupant_id)} /></>}
      {extended && <AttachmentWhenOpen entity="room_inspection" id={x.id} />}
    </details>)}</div>)}

  </Sheet>;
}

function ItemSheet({ kosId, room, item, assets, onClose, onDone, onDelete }) {
  const [name, setName] = useState(item?.name || '');
  const [qty, setQty] = useState(String(item?.qty || 1));
  const [cond, setCond] = useState(item?.replacement ? 'baik' : item?.condition || 'baik');
  const [asset, setAsset] = useState(item?.asset_id || '');
  const [val, setVal] = useState(item?.value ? angka(item.value) : '');
  const [note, setNote] = useState(item?.replacement ? [item.note, `Penggantian ${tgl(today())}`].filter(Boolean).join(' · ').slice(0, 300) : item?.note || '');
  const [busy, setBusy] = useState(false);
  const save = async () => {
    const row = { name: name.trim(), qty: Math.max(1, parseInt(qty, 10) || 1), condition: cond, value: val.trim() ? parseRp(val) : null, note: note.trim() || null };
    if (!row.name) return toast('Isi nama barang.');
    if (assets) row.asset_id = asset || null;
    setBusy(true);
    const ok = await run(() => item ? supabase.from('room_items').update(row).eq('kos_id', kosId).eq('id', item.id) : supabase.from('room_items').insert({ ...row, kos_id: kosId, room_id: room.id }), 'Barang disimpan', errMsg);
    setBusy(false); if (ok) onDone();
  };
  return <Sheet title={item ? `${item.replacement ? "Penggantian" : "Ubah"} · ${item.name}` : `Tambah barang · ${room.code}`} onClose={onClose}>
    <div className="row"><Field label="Nama barang"><input value={name} maxLength={80} onChange={(e) => setName(e.target.value)} placeholder="mis. Kasur, AC, Kunci" /></Field>
      <Field label="Jumlah"><input inputMode="numeric" value={qty} onChange={(e) => setQty(e.target.value)} /></Field></div>
    <Field label="Kondisi" hint={item ? 'Untuk mencatat perubahan kondisi dengan bukti, pakai "Periksa sekarang".' : ''}><select value={cond} onChange={(e) => setCond(e.target.value)}>{Object.entries(CONDITION).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></Field>
    <Field label="Perkiraan nilai (opsional)" hint="Membantu menentukan potongan deposit bila rusak/hilang"><input inputMode="numeric" value={val} onChange={(e) => setVal(e.target.value)} placeholder="belum diisi" /></Field>
    {assets && <Field label="Tautkan aset tetap (opsional)" hint="Pilih aset yang sudah tercatat di Pembukuan.">
      <select value={asset} onChange={(e) => setAsset(e.target.value)}><option value="">Tanpa tautan</option>
        {assets.filter((a) => a.status === 'aktif' || a.id === asset).map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
      </select></Field>}
    <Field label="Catatan"><input value={note} maxLength={300} onChange={(e) => setNote(e.target.value)} /></Field>
    <button className="cta" disabled={busy} onClick={save}>{busy ? 'Menyimpan…' : 'Simpan'}</button>
    {item && !item.replacement && onDelete && <button className="danger" onClick={() => onDelete(item)}>Hapus dari daftar</button>}
  </Sheet>;
}

function Inspect({ d, kosId, room, items, mode, t, onClose, onDone }) {
  const handover = mode === 'handover';
  const leases = d.leases.filter((l) => l.room_id === room.id && l.status !== 'batal');
  const [kind, setKind] = useState(handover ? 'masuk' : d.activeByRoom.get(room.id) ? 'rutin' : 'masuk');
  const [date, setDate] = useState(today());
  const [leaseId, setLeaseId] = useState('');
  const validLeases = leases.filter((l) => l.start_date <= date && (!l.end_date || l.end_date >= date));
  const lease = handover ? validLeases.find((l) => l.id === leaseId) || (validLeases.length === 1 ? validLeases[0] : null)
    : d.activeByRoom.get(room.id) || leases[0];
  const [rows, setRows] = useState(items.map((x) => ({ item_id: x.id, name: x.name, qty: x.qty, condition: x.condition, note: '', value: x.value, checked: false })));
  const [note, setNote] = useState('');
  const [dmg, setDmg] = useState('');
  const [busy, setBusy] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [request] = useState(() => crypto.randomUUID());
  const changeKind = (kind) => { setKind(kind); setConfirmed(false); };
  const set = (i, k, v) => { setRows(rows.map((r, j) => (j === i ? { ...r, [k]: v } : r))); setConfirmed(false); };
  const suggested = rows.filter((r) => (r.condition === 'rusak' || r.condition === 'hilang') && r.value).reduce((s, r) => s + Number(r.value), 0);
  const save = async () => {
    setBusy(true);
    const damage = dmg.trim() ? parseRp(dmg) : 0;
    let id;
    const ok = await run(async () => {
      const payload = { p_kos: kosId, p_room: room.id, p_lease: lease?.id || null, p_kind: kind, p_date: date,
        p_items: rows.map(({ item_id, condition, note: n }) => ({ item_id, condition, note: n })), p_note: note, p_damage: damage };
      const res = await supabase.rpc(handover ? 'room_handover_save' : 'room_inspection_save',
        handover ? { ...payload, p_confirmed: confirmed, p_request: request } : payload);
      id = res.data;
      return res;
    }, 'Pemeriksaan disimpan', errMsg);
    if (ok) {
      const { data } = await supabase.from('room_inspections').select('*').eq('kos_id', kosId).eq('id', id).maybeSingle();
      onDone({ room, kind, damage, lease: lease?.status === 'aktif' || kind === 'keluar' ? lease : null, inspection: data || { id } });
    }
    setBusy(false);
  };
  return <Sheet title={`${handover ? 'Serah terima' : 'Periksa'} ${t.unit.toLowerCase()} ${room.code}`} wide onClose={onClose}>
    <div className="seg">{Object.entries(KIND).filter(([key]) => !handover || key !== 'rutin').map(([k, l]) =>
      <button key={k} className={kind === k ? 'on' : ''} onClick={() => changeKind(k)}>{l}</button>)}</div>
    <div className="row"><Field label="Tanggal"><input type="date" value={date} max={today()} onChange={(e) => { setDate(e.target.value); setConfirmed(false); }} /></Field>
      {handover ? <Field label={`Kontrak ${t.tenant.toLowerCase()}`}><select value={lease?.id || ''} onChange={(e) => { setLeaseId(e.target.value); setConfirmed(false); }}>
        <option value="">Pilih kontrak</option>{validLeases.map((l) => <option key={l.id} value={l.id}>{d.occName(l.occupant_id)} · {tgl(l.start_date)}</option>)}</select></Field>
        : <Field label={t.tenant}><input readOnly value={lease ? d.occName(lease.occupant_id) + (lease.status === 'aktif' ? '' : ' (sewa terakhir)') : '—'} /></Field>}</div>
    {handover && !validLeases.length && <p className="notice">Belum ada kontrak yang berlaku pada tanggal ini. <Link href="/penghuni">Buka Penghuni</Link></p>}

    {!rows.length ? <p className="notice">Belum ada daftar barang di {t.unit.toLowerCase()} ini. Tambahkan dulu lewat kartu {t.unit.toLowerCase()} di halaman Inventaris.</p> :
      <div className={styles.check}>{rows.map((r, i) => <div key={r.item_id} className={styles.row}>
        <b>{r.name}{r.qty > 1 ? ` × ${r.qty}` : ''}</b>
        <div className={styles.conds} role="group" aria-label={`Kondisi ${r.name}`}>{Object.entries(CONDITION).map(([k, l]) => <button key={k} type="button" aria-pressed={r.condition === k} data-k={k} onClick={() => { setRows(rows.map((row, j) => j === i ? { ...row, condition: k, checked: true } : row)); setConfirmed(false); }}>{l}</button>)}</div>
        {handover && <small>{r.checked ? 'Kondisi sudah dipilih' : 'Pilih kondisi setelah barang diperiksa'}</small>}
        {r.condition !== 'baik' && <input value={r.note} maxLength={200} placeholder="Keterangan (mis. sobek di sudut)" onChange={(e) => set(i, 'note', e.target.value)} />}
      </div>)}</div>}
    <Field label="Nilai kerusakan (opsional)" hint={suggested > 0 ? `Perkiraan dari nilai barang rusak/hilang: ${rp(suggested)}` : 'Dicatat sebagai bukti; potong deposit dilakukan terpisah sesudahnya.'}>
      <input inputMode="numeric" value={dmg} onChange={(e) => { setDmg(e.target.value); setConfirmed(false); }} placeholder="0" /></Field>
    <Field label="Catatan"><textarea value={note} maxLength={1000} onChange={(e) => { setNote(e.target.value); setConfirmed(false); }} placeholder="mis. meteran listrik 1234 kWh, kunci diserahkan 2" /></Field>
    {handover && lease && <label className={styles.checkbox}>
      <input type="checkbox" disabled={rows.some((r) => !r.checked)} checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} />
      {d.occName(lease.occupant_id)} telah meninjau dan menyetujui checklist ini secara langsung.
    </label>}
    <p className="small muted">Pemeriksaan yang sudah disimpan tidak bisa diubah (bukti). Catat pemeriksaan baru bila ada koreksi.</p>
    <button className="cta" disabled={busy || !date || !rows.length || (handover && (!lease || rows.some((r) => !r.checked)))} onClick={save}>{busy ? 'Menyimpan…' : 'Simpan pemeriksaan'}</button>
  </Sheet>;
}

function AttachmentWhenOpen({ entity, id }) {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const target = document.getElementById(`inventory-attachment-${entity}-${id}`)?.closest('details');
    if (!target) return;
    const show = () => setVisible(target.open);
    show();
    target.addEventListener('toggle', show);
    return () => target.removeEventListener('toggle', show);
  }, [entity, id]);
  return <div id={`inventory-attachment-${entity}-${id}`}>{visible && <Lampiran entity={entity} id={id} title="Foto dan lampiran" />}</div>;
}

function PdfButton({ kos, title, subtitle, sheets, name, label, kind }) {
  const quota = useKuotaEkspor(kos.id);
  const [busy, setBusy] = useState(false);
  async function download() {
    setBusy(true);
    try {
      const { makePdf } = await import('@/lib/pdfExport');
      const file = await makePdf({ title, business: kos.name, type: 'properti', subtitle,
        exported_at: new Date().toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' }),
        note: 'Dokumen ini menggunakan data inventaris yang tercatat di PRASARA.', sheets });
      quota.jalankan(kind, () => {
        const href = URL.createObjectURL(file);
        const link = document.createElement('a');
        link.href = href;
        link.download = name.replace(/[\\/:*?"<>|]+/g, '-') + '.pdf';
        document.body.append(link);
        link.click();
        link.remove();
        setTimeout(() => URL.revokeObjectURL(href), 30000);
      });
    } catch (error) { toast(errMsg(error)); }
    finally { setBusy(false); }
  }
  return <div className={styles.pdf}><button disabled={busy || quota.habis} onClick={download}>{busy ? 'Membuat PDF…' : label}</button>
    {quota.info && <small>{quota.info}</small>}</div>;
}

function HandoverPdf({ kos, room, inspection, occupant }) {
  return <PdfButton kos={kos} title="Berita Acara Serah Terima Inventaris"
    subtitle={`${room.code} · ${KIND[inspection.kind]} · ${tgl(inspection.date)}`}
    label="Unduh berita acara PDF" name={`Serah-terima-${room.code}-${inspection.date}`} kind="inventaris_serah_terima"
    sheets={[
      { name: 'Serah terima', cols: ['Keterangan', 'Isi'], types: ['s', 's'], rows: [
        ['Tanggal', tgl(inspection.date)], ['Jenis', KIND[inspection.kind]], ['Unit', room.code],
        ['Penghuni', inspection.confirmed_name || occupant || '—'], ['ID pemeriksaan', inspection.id],
        ['Konfirmasi', inspection.confirmed_name ? `Persetujuan langsung dicatat ${new Date(inspection.confirmed_at).toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' })} WIB` : 'Belum tercatat'],
        ['Taksiran kerusakan', rp(inspection.damage)], ['Catatan', inspection.note],
      ] },
      { name: 'Checklist perlengkapan', cols: ['Barang', 'Jumlah', 'Sebelumnya', 'Hasil pemeriksaan', 'Catatan'],
        types: ['s', 'n', 's', 's', 's'], rows: (inspection.items || []).map((i) => [i.name, i.qty, CONDITION[i.before], CONDITION[i.condition], i.note]) },
    ]} />;
}

function InventoryReport({ kos, rows, onClose }) {
  return <Sheet title="Laporan Inventaris" icon="/laporan" wide onClose={onClose}>
    <div className={styles.check}>{rows.map(({ r, qty, present, bad, last }) => <div key={r.id} className={styles.row}>
      <b>{r.code}</b><small>{present} dari {qty} barang ada · {bad} perlu perhatian</small>
      <small>{last ? `Pemeriksaan terakhir ${tgl(last.date)}` : 'Belum diperiksa'}</small>
    </div>)}</div>
    <PdfButton kos={kos} title="Laporan Inventaris" subtitle={`Posisi ${tgl(today())}`} label="Unduh laporan PDF"
      name={`Laporan-inventaris-${today()}`} kind="inventaris_laporan" sheets={[
        { name: 'Ringkasan per unit', cols: ['Unit', 'Penghuni', 'Barang tercatat', 'Barang ada', 'Perlu perhatian', 'Terakhir diperiksa'],
          types: ['s', 's', 'n', 'n', 'n', 'd'], rows: rows.map(({ r, tenant, qty, present, bad, last }) => [r.code, tenant, qty, present, bad, last?.date]) },
        { name: 'Perlengkapan', cols: ['Unit', 'Barang', 'Jumlah', 'Kondisi', 'Pemeriksaan'], types: ['s', 's', 'n', 's', 'd'],
          rows: rows.flatMap(({ r, its }) => its.map((i) => [r.code, i.name, i.qty, CONDITION[i.condition], i.checked_at])) },
      ]} />
  </Sheet>;
}
