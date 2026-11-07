'use client';
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useKos } from '@/components/KosProvider';
import { useData } from '@/lib/useData';
import PageHelp from '@/components/PageHelp';
import { Sheet, Field, Loading, run, toast } from '@/components/ui';
import { rp, angka, today, thisMonth, bulan, addMonthsYm, parseRp, errMsg } from '@/lib/format';
import { canArea } from '@/lib/business';

// angka meter: "1.234" atau "1.234,5" = ribuan bertitik (gaya Indonesia); "12,5" = desimal
const meterNum = (v) => { let t = String(v ?? '').trim().replace(/\s/g, ''); if (/^\d{1,3}(\.\d{3})+(,\d+)?$/.test(t)) t = t.replace(/\./g, ''); t = t.replace(',', '.'); const n = Number(t); return t !== '' && isFinite(n) ? n : NaN; };
const fmtN = (n) => (n == null ? '—' : angka(n));
const addDays = (iso, n) => new Date(new Date(iso + 'T00:00:00Z').getTime() + n * 864e5).toISOString().slice(0, 10);

// Meteran listrik/air per kamar: catat angka bulan ini → pemakaian × tarif jadi tagihan tambahan otomatis
export default function Meteran() {
  const d = useData();
  const { kos, kosId, ver, bump } = useKos();
  const canSet = canArea(kos, 'settings');
  const [types, setTypes] = useState(null);
  const [reads, setReads] = useState(null);
  const [err, setErr] = useState(null);
  const [typeId, setTypeId] = useState(null);
  const [ym, setYm] = useState(thisMonth());
  const [due, setDue] = useState(addDays(today(), 7));
  const [inp, setInp] = useState({}); // room_id → { reading, reset }
  const [busy, setBusy] = useState(false);
  const [edit, setEdit] = useState(null);
  const load = async () => {
    const [a, b] = await Promise.all([
      supabase.from('utility_types').select('*').eq('kos_id', kosId).order('sort'),
      supabase.from('meter_readings').select('*').eq('kos_id', kosId).eq('status', 'aktif').order('period', { ascending: false }).limit(3000),
    ]);
    if (a.error || b.error) return setErr(errMsg(a.error || b.error));
    setTypes(a.data || []); setReads(b.data || []);
    if (!typeId && a.data?.length) setTypeId((a.data.find((x) => x.active) || a.data[0]).id);
  };
  useEffect(() => { load(); }, [kosId, ver]);
  useEffect(() => { setInp({}); }, [typeId, ym]);
  if (err) return <div className="notice bad">{/utility_types|meter_readings/.test(err) ? 'Database sedang diperbarui. Coba lagi beberapa menit lagi.' : err}</div>;
  if (!types || !reads || !d.ready) return <Loading />;

  const u = types.find((x) => x.id === typeId);
  const per = ym + '-01';
  const cur = new Map(), prev = new Map();
  for (const r of reads) {
    if (r.type_id !== typeId) continue;
    if (r.period === per) cur.set(r.room_id, r);
    else if (r.period < per && !prev.has(r.room_id)) prev.set(r.room_id, r); // daftar urut terbaru dulu
  }
  const rooms = [...d.rooms].sort((a, b) => (d.activeByRoom.has(b.id) - d.activeByRoom.has(a.id)) || a.code.localeCompare(b.code, 'id', { numeric: true }));
  const calc = (roomId) => {
    const x = inp[roomId]; const pr = prev.get(roomId);
    if (!x || x.reading === '' || x.reading == null) return null;
    const v = meterNum(x.reading);
    if (!(v >= 0)) return { bad: 'Angka tidak valid' };
    if (!pr || x.reset) return { v, first: true };
    if (v < Number(pr.reading)) return { v, bad: 'Lebih kecil dari bulan lalu' };
    const use = v - Number(pr.reading);
    const amt = Math.round(Math.max(use * Number(u.price), Number(u.min_charge)));
    return { v, use, amt };
  };
  const filled = rooms.filter((r) => !cur.has(r.id) && calc(r.id));
  const bad = filled.filter((r) => calc(r.id).bad && !inp[r.id]?.reset);
  const total = filled.reduce((s, r) => { const c = calc(r.id); return s + (c.amt && d.activeByRoom.has(r.id) ? c.amt : 0); }, 0);
  const nBill = filled.filter((r) => calc(r.id).amt > 0 && d.activeByRoom.has(r.id)).length;

  const save = async () => {
    if (bad.length) return toast(`Periksa kamar ${bad.map((r) => r.code).join(', ')}: ${calc(bad[0].id).bad}. Centang "Meteran baru" bila meteran diganti.`);
    if (!filled.length) return toast('Isi angka meter minimal satu kamar.');
    if (!confirm(`Simpan angka ${u.name} ${bulan(ym)} untuk ${filled.length} kamar?${nBill ? `\n${nBill} tagihan tambahan dibuat, total ${rp(total)}, jatuh tempo ${due}.` : ''}`)) return;
    setBusy(true);
    const { data, error } = await supabase.rpc('meter_record', { p_kos: kosId, p_type: typeId, p_period: per, p_due: due, p_rows: filled.map((r) => ({ room_id: r.id, reading: calc(r.id).v, reset: Boolean(inp[r.id]?.reset) })) });
    setBusy(false);
    if (error) return toast(errMsg(error));
    toast(data.billed ? `${data.billed} tagihan dibuat (${rp(data.total)})` : 'Angka meter disimpan');
    setInp({}); load(); bump();
  };
  const voidRead = async (r) => {
    const why = prompt('Batalkan catatan meter ini? Tagihannya ikut dibatalkan (bila belum dibayar). Alasan:');
    if (!why) return;
    if (await run(() => supabase.rpc('meter_void', { p_reading: r.id, p_reason: why }), 'Catatan meter dibatalkan', errMsg)) { load(); bump(); }
  };

  return (
    <div className="stack">
      <div className="row between"><div className="row"><h2>Meteran listrik & air</h2><PageHelp page="meteran" /></div>{canSet && types.length > 0 && <button className="sm" onClick={() => setEdit({})}>+ Jenis meteran</button>}</div>
      {types.length === 0 ? (
        <section className="panel">
          <b>Atur dulu tarifnya</b>
          <span className="small muted">Pilih jenis meteran yang dipakai di kamar (token/prabayar tidak perlu dicatat di sini).</span>
          {canSet ? <div className="row">
            <button className="primary" onClick={() => setEdit({ name: 'Listrik', unit: 'kWh', price: '1500' })}>+ Listrik (kWh)</button>
            <button className="primary" onClick={() => setEdit({ name: 'Air', unit: 'm³', price: '5000' })}>+ Air (m³)</button>
          </div> : <span className="small">Minta pemilik/pengelola mengatur tarif meteran.</span>}
        </section>
      ) : <>
        <div className="seg">{types.filter((x) => x.active).map((x) => <button key={x.id} className={x.id === typeId ? 'on' : ''} onClick={() => setTypeId(x.id)}>{x.name}</button>)}</div>
        {u && <>
          <div className="row between">
            <button className="sm" onClick={() => setYm(addMonthsYm(ym, -1))} aria-label="Bulan sebelumnya">‹</button>
            <b>{u.name} · {bulan(ym)}</b>
            <button className="sm" onClick={() => setYm(addMonthsYm(ym, 1))} disabled={ym >= thisMonth()} aria-label="Bulan berikutnya">›</button>
          </div>
          <span className="small muted">Tarif {rp(u.price)}/{u.unit}{Number(u.min_charge) > 0 ? ` · minimal ${rp(u.min_charge)}` : ''}{canSet && <> · <button className="sm ghost" style={{ minHeight: 0, padding: 0 }} onClick={() => setEdit(u)}>ubah tarif</button></>}. Bulan pertama = angka awal (belum ditagih).</span>
          <section className="panel"><div className="list">{rooms.map((r) => {
            const l = d.activeByRoom.get(r.id); const done = cur.get(r.id); const pr = prev.get(r.id); const c = calc(r.id);
            return (
              <div className="li" key={r.id} style={{ alignItems: 'flex-start', flexWrap: 'wrap', gap: 6 }}>
                <div className="main" style={{ minWidth: 120 }}><b className="small">{r.code}</b><span className="small muted">{l ? d.occName(l.occupant_id) : 'Kosong'} · lalu {fmtN(pr?.reading)}</span></div>
                {done ? (
                  <div style={{ textAlign: 'right' }}>
                    <b className="small">{fmtN(done.reading)}</b>
                    <div className="small muted">{done.usage == null ? (done.note || 'Angka awal') : `${fmtN(done.usage)} ${u.unit}`}{Number(done.amount) > 0 ? ` · ${rp(done.amount)} ditagih` : ''}</div>
                    <button className="sm ghost" onClick={() => voidRead(done)}>Batalkan</button>
                  </div>
                ) : (
                  <div style={{ textAlign: 'right', minWidth: 130 }}>
                    <input inputMode="decimal" value={inp[r.id]?.reading ?? ''} onChange={(e) => setInp({ ...inp, [r.id]: { ...inp[r.id], reading: e.target.value } })} placeholder="angka sekarang" aria-label={`Angka meter ${r.code}`} style={{ width: 130 }} />
                    {c && <div className="small" style={{ color: c.bad && !inp[r.id]?.reset ? 'var(--bad)' : 'var(--muted)' }}>
                      {c.bad && !inp[r.id]?.reset ? c.bad : c.first ? 'angka awal, belum ditagih' : `${fmtN(c.use)} ${u.unit} = ${rp(c.amt)}${l ? '' : ' (kamar kosong, tidak ditagih)'}`}</div>}
                    {c?.bad && <label className="row small" style={{ flexWrap: 'nowrap', justifyContent: 'flex-end' }}><input type="checkbox" style={{ width: 20, minHeight: 20, flex: 'none' }} checked={Boolean(inp[r.id]?.reset)} onChange={(e) => setInp({ ...inp, [r.id]: { ...inp[r.id], reset: e.target.checked } })} />Meteran baru</label>}
                  </div>
                )}
              </div>
            );
          })}</div></section>
          {filled.length > 0 && <section className="panel">
            <Field label="Jatuh tempo tagihan"><input type="date" value={due} onChange={(e) => setDue(e.target.value)} /></Field>
            <div className="li"><span className="small">{filled.length} kamar diisi · {nBill} tagihan</span><b>{rp(total)}</b></div>
            <button className="cta" disabled={busy} onClick={save}>{busy ? 'Menyimpan…' : nBill ? 'Simpan & buat tagihan' : 'Simpan angka meter'}</button>
            <span className="small muted">Tagihan masuk ke menu Tagihan sebagai tagihan tambahan dan ikut pengingat WhatsApp/portal.</span>
          </section>}
        </>}
        {canSet && types.some((x) => !x.active) && <section className="panel"><span className="label">Nonaktif</span>{types.filter((x) => !x.active).map((x) => <button key={x.id} className="sm ghost" onClick={() => setEdit(x)}>{x.name}</button>)}</section>}
      </>}
      {edit && <TypeForm kosId={kosId} t={edit} onClose={() => setEdit(null)} onSaved={(id) => { setEdit(null); setTypeId(id); load(); }} />}
    </div>
  );
}

function TypeForm({ kosId, t, onClose, onSaved }) {
  const [f, setF] = useState({ name: t.name || '', unit: t.unit || 'kWh', price: t.price != null ? String(Math.round(t.price)) : '', min_charge: t.min_charge ? String(Math.round(t.min_charge)) : '', active: t.active !== false });
  const [busy, setBusy] = useState(false);
  const save = async () => {
    if (f.name.trim().length < 2) return toast('Isi nama, mis. Listrik.');
    if (f.price === '' || !(parseRp(f.price) >= 0)) return toast('Isi tarif per satuan.');
    setBusy(true);
    const { data, error } = await supabase.rpc('utility_type_save', { p_kos: kosId, p_id: t.id || null, p: { ...f, price: parseRp(f.price), min_charge: parseRp(f.min_charge) || 0 } });
    setBusy(false);
    if (error) return toast(errMsg(error));
    toast('Tarif disimpan'); onSaved(data);
  };
  return (
    <Sheet title={t.id ? `Ubah ${t.name}` : 'Jenis meteran'} onClose={onClose}>
      <div className="row">
        <Field label="Nama"><input value={f.name} maxLength={40} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="Listrik" /></Field>
        <Field label="Satuan"><input value={f.unit} maxLength={12} onChange={(e) => setF({ ...f, unit: e.target.value })} placeholder="kWh" /></Field>
      </div>
      <div className="row">
        <Field label={`Tarif per ${f.unit || 'satuan'}`}><input inputMode="numeric" value={f.price} onChange={(e) => setF({ ...f, price: e.target.value })} /></Field>
        <Field label="Tagihan minimal (opsional)" hint="mis. abonemen"><input inputMode="numeric" value={f.min_charge} onChange={(e) => setF({ ...f, min_charge: e.target.value })} placeholder="0" /></Field>
      </div>
      {t.id && <label className="row small"><input type="checkbox" style={{ width: 22, minHeight: 22 }} checked={f.active} onChange={(e) => setF({ ...f, active: e.target.checked })} />Aktif</label>}
      <span className="small muted">Tarif baru berlaku untuk catatan berikutnya; tagihan yang sudah dibuat tidak berubah.</span>
      <button className="cta" disabled={busy} onClick={save}>{busy ? 'Menyimpan…' : 'Simpan'}</button>
    </Sheet>
  );
}
