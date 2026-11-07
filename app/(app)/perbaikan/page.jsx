'use client';
import { useEffect, useState } from 'react';
import { useBaru } from '@/lib/useBaru';
import { supabase } from '@/lib/supabase';
import { useKos } from '@/components/KosProvider';
import { useData } from '@/lib/useData';
import PageHelp from '@/components/PageHelp';
import { Sheet, Field, Loading, Empty, run, toast } from '@/components/ui';
import Lampiran from '@/components/Lampiran';
import { rp, parseRp, errMsg, waLink } from '@/lib/format';
import { uid } from '@/lib/retail';
import { canArea } from '@/lib/business';

const CAT = { listrik: 'Listrik', air: 'Air', bangunan: 'Bangunan', perabot: 'Perabot', kebersihan: 'Kebersihan', internet: 'Internet', keamanan: 'Keamanan', lainnya: 'Lainnya' };
const ST = { baru: ['Baru', 'info'], dikerjakan: ['Dikerjakan', 'gold'], menunggu: ['Menunggu', 'gold'], selesai: ['Selesai', 'good'], batal: ['Batal', 'void'] };
const PRI = { rendah: 'Rendah', sedang: 'Sedang', tinggi: 'Tinggi' };
const OPEN = ['baru', 'dikerjakan', 'menunggu'];
const tz = { timeZone: 'Asia/Jakarta' };
const waktu = (ts) => (ts ? new Date(ts).toLocaleString('id-ID', { ...tz, day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—');
const umur = (ts) => { const h = Math.floor((Date.now() - new Date(ts).getTime()) / 36e5); return h < 1 ? 'baru saja' : h < 24 ? `${h} jam` : `${Math.floor(h / 24)} hari`; };

// Keluhan & perbaikan kamar/fasilitas: dari pengelola atau dilaporkan penghuni lewat portal
export default function Perbaikan() {
  const d = useData();
  const { kos, kosId, ver } = useKos();
  const [rows, setRows] = useState(null);
  const [err, setErr] = useState(null);
  const [f, setF] = useState('terbuka');
  const [q, setQ] = useState('');
  const [neu, setNeu] = useState(null); // { room_id }
  useBaru(() => setNeu({}));
  const [open, setOpen] = useState(null);
  const load = () => supabase.from('maint_tickets').select('*').eq('kos_id', kosId).order('created_at', { ascending: false }).limit(300)
    .then(({ data, error }) => (error ? setErr(errMsg(error)) : setRows(data || [])));
  useEffect(() => { load(); }, [kosId, ver]);
  useEffect(() => { try { const k = new URLSearchParams(window.location.search).get('kamar'); if (k) setNeu({ room_id: k }); } catch {} }, []);
  if (err) return <div className="notice bad">{/maint_tickets/.test(err) ? 'Database sedang diperbarui. Coba lagi beberapa menit lagi.' : err}</div>;
  if (!rows || !d.ready) return <Loading />;
  const cnt = (s) => rows.filter((r) => r.status === s).length;
  const chips = [['terbuka', `Belum selesai (${rows.filter((r) => OPEN.includes(r.status)).length})`], ['baru', `Baru (${cnt('baru')})`], ['dikerjakan', `Dikerjakan (${cnt('dikerjakan')})`], ['menunggu', `Menunggu (${cnt('menunggu')})`], ['selesai', 'Selesai'], ['batal', 'Batal']];
  const term = q.trim().toLowerCase();
  const shown = rows.filter((r) => (f === 'terbuka' ? OPEN.includes(r.status) : r.status === f)
    && (!term || [r.number, r.title, r.room_id ? d.roomCode(r.room_id) : ''].some((x) => (x || '').toLowerCase().includes(term))))
    .sort((a, b) => (f === 'terbuka' ? (a.priority === 'tinggi' ? 0 : 1) - (b.priority === 'tinggi' ? 0 : 1) : 0));
  const cur = open && rows.find((r) => r.id === open);
  const done = () => { load(); };

  return (
    <div className="stack">
      <div className="row between"><div className="row"><h2>Keluhan & perbaikan</h2><PageHelp page="perbaikan" /></div><button className="primary" onClick={() => setNeu({})}>+ Catat keluhan</button></div>
      <div className="seg" style={{ overflowX: 'auto', flexWrap: 'nowrap' }}>{chips.map(([k, l]) => <button key={k} className={f === k ? 'on' : ''} onClick={() => setF(k)} style={{ whiteSpace: 'nowrap' }}>{l}</button>)}</div>
      <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cari nomor, keluhan, atau kamar" aria-label="Cari keluhan" />
      {shown.length === 0 ? <Empty title={f === 'terbuka' ? 'Tidak ada keluhan terbuka' : 'Tidak ada data'} text="Catat kerusakan atau keluhan penghuni agar tidak terlupa dan biaya perbaikannya tercatat." /> : (
        <section className="panel"><div className="list">{shown.map((r) => (
          <button key={r.id} className="li click" onClick={() => setOpen(r.id)} style={{ background: 'none', border: 0, borderTop: '1px solid var(--line)', borderRadius: 0, width: '100%', textAlign: 'left', font: 'inherit', color: 'inherit', alignItems: 'flex-start' }}>
            <div className="main"><b className="small">{r.title}</b>
              <span className="small muted">{r.number} · {r.room_id ? `Kamar ${d.roomCode(r.room_id)}` : 'Area umum'} · {CAT[r.category]}{r.source === 'penghuni' ? ' · dari penghuni' : ''}</span>
              <span className="small muted">{OPEN.includes(r.status) ? `${umur(r.created_at)}${r.assigned_to ? ` · ${r.assigned_to}` : ''}` : waktu(r.resolved_at || r.updated_at)}{Number(r.cost) > 0 ? ` · biaya ${rp(r.cost)}` : ''}</span></div>
            <div className="stack" style={{ gap: 4, alignItems: 'flex-end' }}>
              <span className={'chip ' + ST[r.status][1]}>{ST[r.status][0]}</span>
              {r.priority === 'tinggi' && OPEN.includes(r.status) && <span className="chip bad">Penting</span>}
            </div>
          </button>
        ))}</div></section>
      )}
      {neu && <NewTicket d={d} kosId={kosId} init={neu} onClose={() => setNeu(null)} onSaved={(id) => { setNeu(null); load().then(() => setOpen(id)); }} />}
      {cur && <Detail d={d} kos={kos} t={cur} onClose={() => setOpen(null)} onChanged={done} />}
    </div>
  );
}

function NewTicket({ d, kosId, init, onClose, onSaved }) {
  const [p, setP] = useState({ room_id: init.room_id || '', category: 'lainnya', title: '', detail: '', priority: 'sedang', assigned_to: '', room_blocked: false });
  const [busy, setBusy] = useState(false);
  const [id] = useState(uid);
  const set = (k, v) => setP({ ...p, [k]: v });
  const room = p.room_id && d.roomById.get(p.room_id);
  const save = async () => {
    if (p.title.trim().length < 2) return toast('Tulis keluhan/kerusakannya.');
    setBusy(true);
    const { data, error } = await supabase.rpc('maint_create', { p_id: id, p_kos: kosId, p: { ...p, room_id: p.room_id || null, room_blocked: Boolean(room && room.status === 'tersedia' && p.room_blocked) } });
    setBusy(false);
    if (error) return toast(errMsg(error));
    toast(`Keluhan ${data.number} dicatat`); onSaved(id);
  };
  return (
    <Sheet title="Catat keluhan" onClose={onClose}>
      <div className="row">
        <Field label="Kamar"><select value={p.room_id} onChange={(e) => set('room_id', e.target.value)}><option value="">Area umum / tidak per kamar</option>{d.rooms.map((r) => <option key={r.id} value={r.id}>{r.code}{d.activeByRoom.get(r.id) ? ` · ${d.occName(d.activeByRoom.get(r.id).occupant_id)}` : ''}</option>)}</select></Field>
        <Field label="Jenis"><select value={p.category} onChange={(e) => set('category', e.target.value)}>{Object.entries(CAT).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></Field>
      </div>
      <Field label="Keluhan / kerusakan"><input value={p.title} maxLength={120} onChange={(e) => set('title', e.target.value)} placeholder="mis. Kran kamar mandi bocor" /></Field>
      <Field label="Rincian (opsional)"><textarea rows={2} maxLength={1000} value={p.detail} onChange={(e) => set('detail', e.target.value)} /></Field>
      <div className="row">
        <Field label="Prioritas"><select value={p.priority} onChange={(e) => set('priority', e.target.value)}>{Object.entries(PRI).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></Field>
        <Field label="Ditangani oleh (opsional)"><input value={p.assigned_to} maxLength={60} onChange={(e) => set('assigned_to', e.target.value)} placeholder="mis. Pak Ujang" /></Field>
      </div>
      {room && room.status === 'tersedia' && <label className="row small" style={{ flexWrap: 'nowrap' }}><input type="checkbox" style={{ width: 22, minHeight: 22, flex: 'none' }} checked={p.room_blocked} onChange={(e) => set('room_blocked', e.target.checked)} />Tutup kamar {room.code} sementara (status Perbaikan, tidak bisa diisi sampai selesai)</label>}
      <button className="cta" disabled={busy} onClick={save}>{busy ? 'Menyimpan…' : 'Simpan'}</button>
    </Sheet>
  );
}

function Detail({ d, kos, t, onClose, onChanged }) {
  const money = canArea(kos, 'finance');
  const [ev, setEv] = useState([]);
  const [mode, setMode] = useState(null); // 'selesai' | 'catatan'
  const [busy, setBusy] = useState(false);
  const loadEv = () => supabase.from('maint_events').select('*').eq('ticket_id', t.id).order('created_at', { ascending: false }).then(({ data }) => setEv(data || []));
  useEffect(() => { loadEv(); }, [t.id, t.status, t.updated_at]);
  const occ = t.occupant_id && d.occById.get(t.occupant_id);
  const isOpen = OPEN.includes(t.status);
  const upd = async (p, msg) => {
    setBusy(true);
    const ok = await run(() => supabase.rpc('maint_update', { p_ticket: t.id, p }), msg, errMsg);
    setBusy(false);
    if (ok) { onChanged(); loadEv(); }
  };
  const cancel = () => { const why = prompt('Alasan membatalkan keluhan ini?'); if (why) upd({ status: 'batal', note: why }, 'Keluhan dibatalkan'); };
  const reopen = () => { const why = prompt('Alasan membuka kembali?'); if (why) upd({ status: 'dikerjakan', note: why }, 'Dibuka kembali'); };
  const assign = () => { const who = prompt('Ditangani oleh siapa?', t.assigned_to || ''); if (who !== null) upd({ assigned_to: who }, 'Disimpan'); };
  const waMsg = t.status === 'selesai' ? `Halo ${occ?.name}, keluhan "${t.title}" (${t.number}) di ${kos.name} sudah selesai: ${t.resolution || ''}. Terima kasih sudah melapor.`
    : `Halo ${occ?.name}, keluhan "${t.title}" (${t.number}) di ${kos.name} sudah kami terima dan sedang ${t.status === 'menunggu' ? 'menunggu bahan/tukang' : 'ditangani'}.`;
  return (
    <Sheet title={`${t.number} · ${t.title}`} onClose={onClose}>
      <div className="row"><span className={'chip ' + ST[t.status][1]}>{ST[t.status][0]}</span>{t.priority === 'tinggi' && <span className="chip bad">Prioritas tinggi</span>}{t.source === 'penghuni' && <span className="chip info">Dari portal penghuni</span>}</div>
      <dl className="kv">
        <dt>Kamar</dt><dd>{t.room_id ? d.roomCode(t.room_id) : 'Area umum'}{t.room_blocked && t.status !== 'selesai' ? ' · ditutup sementara' : ''}</dd>
        {occ && <><dt>Penghuni</dt><dd>{occ.name}</dd></>}
        <dt>Jenis</dt><dd>{CAT[t.category]}</dd>
        <dt>Dicatat</dt><dd>{waktu(t.created_at)} ({umur(t.created_at)})</dd>
        <dt>Ditangani</dt><dd>{t.assigned_to || '—'}</dd>
        {t.detail && <><dt>Rincian</dt><dd style={{ whiteSpace: 'pre-line' }}>{t.detail}</dd></>}
        {t.resolution && <><dt>Penyelesaian</dt><dd>{t.resolution}</dd></>}
        {Number(t.cost) > 0 && <><dt>Biaya</dt><dd>{rp(t.cost)}{t.expense_id ? ' · tercatat di Pengeluaran' : ' · belum dicatat di Pengeluaran'}</dd></>}
      </dl>
      {isOpen && <div className="row">
        {t.status !== 'dikerjakan' && <button className="primary" disabled={busy} onClick={() => upd({ status: 'dikerjakan' }, 'Status: dikerjakan')}>Mulai dikerjakan</button>}
        {t.status !== 'menunggu' && <button className="sm" disabled={busy} onClick={() => { const n = prompt('Menunggu apa? (mis. suku cadang, tukang)'); if (n !== null) upd({ status: 'menunggu', note: n }, 'Status: menunggu'); }}>Menunggu…</button>}
        <button className="primary" disabled={busy} onClick={() => setMode(mode === 'selesai' ? null : 'selesai')}>Selesai</button>
      </div>}
      {mode === 'selesai' && <FinishForm t={t} money={money} onDone={() => { setMode(null); onChanged(); loadEv(); }} />}
      <div className="row">
        {isOpen && <button className="sm ghost" onClick={assign}>Ubah penanggung jawab</button>}
        {isOpen && <select value={t.priority} onChange={(e) => upd({ priority: e.target.value }, 'Prioritas diubah')} aria-label="Prioritas" style={{ width: 'auto' }}>{Object.entries(PRI).map(([k, l]) => <option key={k} value={k}>Prioritas {l.toLowerCase()}</option>)}</select>}
        <button className="sm ghost" onClick={() => setMode(mode === 'catatan' ? null : 'catatan')}>+ Catatan</button>
        {occ?.phone && <a href={waLink(occ.phone, waMsg)} target="_blank" rel="noreferrer"><button className="sm">WA penghuni</button></a>}
      </div>
      {mode === 'catatan' && <NoteForm onSave={(n) => upd({ note: n }, 'Catatan disimpan').then(() => setMode(null))} />}
      <Lampiran entity="maint_ticket" id={t.id} title="Foto kerusakan / nota" hint="Foto sebelum & sesudah perbaikan, atau nota belanja bahan." />
      {isOpen ? <button className="sm ghost danger" onClick={cancel}>Batalkan keluhan</button> : <button className="sm ghost" onClick={reopen}>Buka kembali</button>}
      <section className="panel"><span className="label">Riwayat</span>
        <div className="list">{ev.map((e) => <div className="li" key={e.id}><span className="small">{e.text}</span><span className="small muted" style={{ textAlign: 'right' }}>{waktu(e.created_at)}<br />{e.actor}</span></div>)}</div>
      </section>
    </Sheet>
  );
}

function NoteForm({ onSave }) {
  const [n, setN] = useState('');
  return <div className="row" style={{ flexWrap: 'nowrap' }}><input value={n} onChange={(e) => setN(e.target.value)} maxLength={300} placeholder="mis. tukang datang besok pagi" /><button className="primary" onClick={() => n.trim() && onSave(n.trim())}>Simpan</button></div>;
}

function FinishForm({ t, money, onDone }) {
  const [res, setRes] = useState('');
  const [cost, setCost] = useState('');
  const [rec, setRec] = useState(money);
  const [acc, setAcc] = useState('kas');
  const [busy, setBusy] = useState(false);
  const save = async () => {
    if (res.trim().length < 2) return toast('Tulis apa yang sudah dikerjakan.');
    const c = cost.trim() ? parseRp(cost) : 0;
    if (cost.trim() && !(c >= 0)) return toast('Biaya tidak valid.');
    setBusy(true);
    const ok = await run(() => supabase.rpc('maint_finish', { p_ticket: t.id, p_resolution: res.trim(), p_cost: c, p_record_expense: Boolean(rec && c > 0), p_account: acc }),
      rec && c > 0 ? 'Selesai. Biaya dicatat di Pengeluaran.' : 'Keluhan selesai', errMsg);
    setBusy(false);
    if (ok) onDone();
  };
  return (
    <div className="unitbox">
      <Field label="Apa yang dikerjakan"><input value={res} onChange={(e) => setRes(e.target.value)} maxLength={300} placeholder="mis. Ganti kran baru" /></Field>
      <Field label="Biaya perbaikan (opsional)"><input inputMode="numeric" value={cost} onChange={(e) => setCost(e.target.value)} placeholder="0" /></Field>
      {money ? <>
        <label className="row small" style={{ flexWrap: 'nowrap' }}><input type="checkbox" style={{ width: 22, minHeight: 22, flex: 'none' }} checked={rec} onChange={(e) => setRec(e.target.checked)} />Catat biaya ini di Pengeluaran (kategori Perbaikan)</label>
        {rec && <div className="seg">{[['kas', 'Dibayar dari kas'], ['bank', 'Dari bank']].map(([k, l]) => <button key={k} className={acc === k ? 'on' : ''} onClick={() => setAcc(k)}>{l}</button>)}</div>}
      </> : <span className="small muted">Biaya disimpan di keluhan ini. Pemilik/pengelola yang mencatatnya di Pengeluaran.</span>}
      {t.room_blocked && <span className="small muted">Kamar yang ditutup sementara otomatis kembali Tersedia.</span>}
      <button className="primary" disabled={busy} onClick={save}>{busy ? 'Menyimpan…' : 'Tandai selesai'}</button>
    </div>
  );
}
