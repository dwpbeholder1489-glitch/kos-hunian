'use client';
// SDM & gaji: absen sendiri (semua anggota yang ditautkan), absensi harian, jadwal shift, data karyawan, kasbon & penggajian.
// Server: staff_me, attendance_clock, attendance_set, shift_plan_set, staff_save, staff_advance_*, payroll_*, attendance_summary.
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { useKos } from '@/components/KosProvider';
import PageHelp from '@/components/PageHelp';
import { Sheet, Field, Loading, Empty, Tile, run, toast } from '@/components/ui';
import { rp, angka, parseRp, tgl, today, errMsg } from '@/lib/format';
import { canArea } from '@/lib/business';

const ST = { hadir: ['Hadir', 'good'], izin: ['Izin', 'info'], sakit: ['Sakit', 'info'], cuti: ['Cuti', 'info'], alpa: ['Alpa', 'bad'], libur: ['Libur', 'void'] };
const PAY = { bulanan: 'Bulanan', harian: 'Harian', per_jam: 'Per jam' };
const jam = (ts) => (ts ? new Date(ts).toLocaleTimeString('id-ID', { timeZone: 'Asia/Jakarta', hour: '2-digit', minute: '2-digit' }) : '');
const hhmm = (ts) => (ts ? jam(ts).replace('.', ':') : '');
const plus = (iso, n) => new Date(new Date(iso + 'T00:00:00Z').getTime() + n * 864e5).toISOString().slice(0, 10);
const hari = (iso) => new Date(iso + 'T12:00:00+07:00').toLocaleDateString('id-ID', { timeZone: 'Asia/Jakarta', weekday: 'short', day: 'numeric', month: 'short' });
const bulanNama = (iso) => new Date(iso + 'T12:00:00+07:00').toLocaleDateString('id-ID', { timeZone: 'Asia/Jakarta', month: 'long', year: 'numeric' });
const LI = { background: 'none', border: 0, borderTop: '1px solid var(--line)', borderRadius: 0, textAlign: 'left', width: '100%', font: 'inherit', color: 'inherit' };

export default function SDM() {
  const { kosId, kos, ver } = useKos();
  const admin = canArea(kos, 'team') || canArea(kos, 'finance');
  const [tab, setTab] = useState('hari');
  return (
    <div className="stack">
      <div className="row between"><div className="row"><h2>SDM & gaji</h2><PageHelp page="sdm" /></div></div>
      <AbsenSaya kosId={kosId} ver={ver} admin={admin} />
      {admin && <>
        <div className="seg">{[['hari', 'Absensi'], ['jadwal', 'Jadwal'], ['karyawan', 'Karyawan'], ['gaji', 'Gaji']].map(([k, l]) => <button key={k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>{l}</button>)}</div>
        <Admin kosId={kosId} kos={kos} ver={ver} tab={tab} />
      </>}
    </div>
  );
}

// ===== Absen sendiri =====
function AbsenSaya({ kosId, ver, admin }) {
  const [me, setMe] = useState(null);
  const [busy, setBusy] = useState(false);
  const load = () => supabase.rpc('staff_me', { p_kos: kosId }).then(({ data, error }) => setMe(error ? { error: errMsg(error) } : data));
  useEffect(() => { load(); }, [kosId, ver]);
  if (!me) return null;
  if (me.error) return /staff_me/.test(me.error) ? <div className="notice">Database sedang diperbarui. Coba lagi beberapa menit lagi.</div> : null;
  if (!me.linked) return admin ? null : <Empty title="Akun Anda belum ditautkan" text="Minta pemilik membuka SDM & gaji › Karyawan, lalu menautkan akun Anda ke data karyawan agar bisa absen dari HP." />;
  const t = me.today; const open = me.open_yesterday;
  const clock = async (action) => {
    setBusy(true);
    const { data, error } = await supabase.rpc('attendance_clock', { p_kos: kosId, p_action: action, p_note: null });
    setBusy(false);
    if (error) return toast(errMsg(error));
    toast(action === 'masuk' ? 'Absen masuk tercatat' : 'Absen pulang tercatat'); setMe(data);
  };
  const shiftToday = me.shifts.find((s) => s.work_date === today());
  const inDone = t?.clock_in; const outDone = t?.clock_out;
  return (
    <section className="panel" style={{ gap: 8 }}>
      <div className="row between"><span className="label">Absen saya · {me.name}</span>{shiftToday && <span className="chip">{shiftToday.label || 'Shift'} {shiftToday.start_time?.slice(0, 5) || ''}{shiftToday.end_time ? '–' + shiftToday.end_time.slice(0, 5) : ''}</span>}</div>
      <div className="row" style={{ gap: 8 }}>
        <button className="cta" style={{ flex: 1 }} disabled={busy || inDone} onClick={() => clock('masuk')}>{inDone ? `Masuk ${jam(t.clock_in)}` : 'Absen masuk'}</button>
        <button className="cta" style={{ flex: 1 }} disabled={busy || (!inDone && !open) || outDone} onClick={() => clock('pulang')}>{outDone ? `Pulang ${jam(t.clock_out)}` : 'Absen pulang'}</button>
      </div>
      {open && !inDone && <span className="small">Kemarin belum absen pulang (masuk {jam(open.clock_in)}). Tekan Absen pulang untuk menutupnya.</span>}
      {t?.status && t.status !== 'hadir' && <span className="small">Hari ini dicatat <b>{ST[t.status][0]}</b>.</span>}
      {outDone && <span className="small muted">Hari ini {angka(t.hours)} jam{Number(t.overtime) > 0 ? ` · lembur ${angka(t.overtime)} jam` : ''}</span>}
      {me.shifts.length > 0 && <span className="small muted">Jadwal: {me.shifts.map((s) => `${hari(s.work_date)} ${s.label || ''} ${s.start_time?.slice(0, 5) || ''}${s.end_time ? '–' + s.end_time.slice(0, 5) : ''}`.trim()).join(' · ')}</span>}
      <span className="small muted">Bulan ini: {me.month.filter((x) => x.status === 'hadir').length} hari hadir{Number(me.advance) > 0 ? ` · kasbon belum dipotong ${rp(me.advance)}` : ''}</span>
      {me.slips.length > 0 && <div className="row" style={{ gap: 6, flexWrap: 'wrap' }}>{me.slips.slice(0, 3).map((s) => <Link key={s.run_id} href={`/dokumen/gaji/${s.run_id}?staff=${me.staff_id}`}><button className="sm">Slip {bulanNama(s.period)}</button></Link>)}</div>}
    </section>
  );
}

// ===== Pengelola =====
function Admin({ kosId, kos, ver, tab }) {
  const [d, setD] = useState(null);
  const [err, setErr] = useState(null);
  const [day, setDay] = useState(today());
  const load = async () => {
    const from = plus(day, -1); const to = plus(day, 13);
    const [s, a, sh, adv] = await Promise.all([
      supabase.from('staff').select('*').eq('kos_id', kosId).order('name'),
      supabase.from('attendance').select('*').eq('kos_id', kosId).gte('work_date', plus(day, -1)).lte('work_date', day),
      supabase.from('staff_shifts').select('*').eq('kos_id', kosId).gte('work_date', from).lte('work_date', to),
      supabase.from('staff_advances').select('*').eq('kos_id', kosId).order('date', { ascending: false }).limit(200),
    ]);
    const e = s.error || a.error || sh.error;
    if (e) return setErr(errMsg(e));
    setD({ staff: s.data, att: a.data, shifts: sh.data, adv: adv.data || [] });
  };
  useEffect(() => { load(); }, [kosId, ver, day]);
  if (err) return <div className="notice bad">{/staff|attendance/.test(err) ? 'Database sedang diperbarui. Coba lagi beberapa menit lagi.' : err}</div>;
  if (!d) return <Loading />;
  if (tab === 'karyawan') return <Karyawan kosId={kosId} d={d} onChanged={load} />;
  if (!d.staff.some((s) => s.active)) return <Empty title="Belum ada data karyawan" text="Tambahkan karyawan di tab Karyawan (boleh tanpa akun aplikasi). Setelah itu absensi, jadwal, dan gaji bisa dicatat." />;
  if (tab === 'jadwal') return <Jadwal kosId={kosId} d={d} onChanged={load} />;
  if (tab === 'gaji') return <Gaji kosId={kosId} kos={kos} d={d} onChanged={load} />;
  return <Absensi kosId={kosId} d={d} day={day} setDay={setDay} onChanged={load} />;
}

function Absensi({ kosId, d, day, setDay, onChanged }) {
  const [edit, setEdit] = useState(null);
  const active = d.staff.filter((s) => s.active);
  const att = (sid) => d.att.find((a) => a.staff_id === sid && a.work_date === day);
  const sh = (sid) => d.shifts.find((x) => x.staff_id === sid && x.work_date === day);
  const quick = async (s, status) => {
    if (await run(() => supabase.rpc('attendance_set', { p_kos: kosId, p: { staff_id: s.id, date: day, status } }), `${s.name}: ${ST[status][0]}`, errMsg)) onChanged();
  };
  const counts = Object.fromEntries(Object.keys(ST).map((k) => [k, active.filter((s) => att(s.id)?.status === k).length]));
  return (
    <div className="stack">
      <div className="row" style={{ flexWrap: 'nowrap' }}>
        <button className="sm" onClick={() => setDay(plus(day, -1))} aria-label="Hari sebelumnya">‹</button>
        <input type="date" value={day} max={plus(today(), 31)} onChange={(e) => setDay(e.target.value || today())} aria-label="Tanggal absensi" />
        <button className="sm" onClick={() => setDay(plus(day, 1))} aria-label="Hari berikutnya">›</button>
      </div>
      <div className="grid">
        <Tile label="Hadir" value={angka(counts.hadir)} sub={`dari ${active.length} karyawan`} />
        <Tile label="Izin / sakit / cuti" value={angka(counts.izin + counts.sakit + counts.cuti)} />
        <Tile label="Belum dicatat" value={angka(active.filter((s) => !att(s.id)).length)} tone={active.some((s) => !att(s.id)) ? 'gold' : ''} />
      </div>
      <section className="panel"><div className="list">{active.map((s) => {
        const a = att(s.id); const x = sh(s.id);
        return (
          <div className="li" key={s.id} style={{ display: 'block' }}>
            <div className="row between" style={{ flexWrap: 'nowrap' }}>
              <span style={{ minWidth: 0 }}><b>{s.name}</b><br /><span className="small muted">{x ? `${x.label || 'Shift'} ${x.start_time?.slice(0, 5) || ''}${x.end_time ? '–' + x.end_time.slice(0, 5) : ''}` : 'tanpa jadwal'}{a?.clock_in ? ` · masuk ${jam(a.clock_in)}` : ''}{a?.clock_out ? ` · pulang ${jam(a.clock_out)}` : ''}{a && Number(a.overtime) > 0 ? ` · lembur ${angka(a.overtime)} jam` : ''}</span></span>
              {a ? <button className={'chip ' + ST[a.status][1]} onClick={() => setEdit({ s, a })} style={{ border: 0 }}>{ST[a.status][0]} ›</button> : <button className="sm ghost" onClick={() => setEdit({ s, a: null })}>Isi ›</button>}
            </div>
            {!a && <div className="row" style={{ gap: 6, marginTop: 6, flexWrap: 'wrap' }}>{['hadir', 'izin', 'sakit', 'alpa', 'libur'].map((k) => <button key={k} className="sm" onClick={() => quick(s, k)}>{ST[k][0]}</button>)}</div>}
          </div>
        );
      })}</div></section>
      <span className="small muted">Karyawan yang akunnya ditautkan bisa absen masuk/pulang sendiri dari HP. Jam & lembur bisa dikoreksi di sini.</span>
      {edit && <AttSheet kosId={kosId} day={day} s={edit.s} a={edit.a} onClose={() => setEdit(null)} onDone={() => { setEdit(null); onChanged(); }} />}
    </div>
  );
}

function AttSheet({ kosId, day, s, a, onClose, onDone }) {
  const [f, setF] = useState({ status: a?.status || 'hadir', in: hhmm(a?.clock_in), out: hhmm(a?.clock_out), overtime: a ? String(Number(a.overtime) || '') : '', note: a?.note || '' });
  const [busy, setBusy] = useState(false);
  const set = (k, v) => setF({ ...f, [k]: v });
  const save = async () => {
    setBusy(true);
    const ok = await run(() => supabase.rpc('attendance_set', { p_kos: kosId, p: { staff_id: s.id, date: day, status: f.status, in: f.in || null, out: f.out || null, overtime: f.overtime === '' ? null : f.overtime.replace(',', '.'), note: f.note } }), 'Absensi disimpan', errMsg);
    setBusy(false);
    if (ok) onDone();
  };
  return (
    <Sheet title={`${s.name} · ${hari(day)}`} onClose={onClose}>
      <div className="seg">{Object.entries(ST).map(([k, [l]]) => <button key={k} className={f.status === k ? 'on' : ''} onClick={() => set('status', k)}>{l}</button>)}</div>
      {f.status === 'hadir' && <>
        <div className="row"><Field label="Jam masuk"><input type="time" value={f.in} onChange={(e) => set('in', e.target.value)} /></Field><Field label="Jam pulang"><input type="time" value={f.out} onChange={(e) => set('out', e.target.value)} /></Field></div>
        <Field label="Lembur (jam)" hint="kosong = dihitung otomatis dari jadwal / jam kerja"><input inputMode="decimal" value={f.overtime} onChange={(e) => set('overtime', e.target.value)} placeholder="otomatis" /></Field>
      </>}
      <Field label="Catatan (opsional)"><input value={f.note} maxLength={200} onChange={(e) => set('note', e.target.value)} placeholder="mis. izin anak sakit" /></Field>
      <button className="cta" disabled={busy} onClick={save}>{busy ? 'Menyimpan…' : 'Simpan'}</button>
    </Sheet>
  );
}

function Jadwal({ kosId, d, onChanged }) {
  const active = d.staff.filter((s) => s.active);
  const days = Array.from({ length: 7 }, (_, i) => plus(today(), i));
  const [pick, setPick] = useState(null);
  const sh = (sid, dt) => d.shifts.find((x) => x.staff_id === sid && x.work_date === dt);
  return (
    <div className="stack">
      <button className="primary" onClick={() => setPick({ staff: active.map((s) => s.id), dates: days.slice(0, 6) })}>Atur jadwal</button>
      {active.map((s) => (
        <section className="panel" key={s.id} style={{ gap: 4 }}>
          <b>{s.name}{s.position ? <span className="small muted"> · {s.position}</span> : null}</b>
          <div className="list">{days.map((dt) => { const x = sh(s.id, dt); return (
            <button key={dt} className="li click" style={LI} onClick={() => setPick({ staff: [s.id], dates: [dt], start: x?.start_time?.slice(0, 5) || '', end: x?.end_time?.slice(0, 5) || '', label: x?.label || '' })}>
              <span className="small">{hari(dt)}</span><span className="small">{x ? `${x.label || 'Shift'} ${x.start_time?.slice(0, 5) || ''}${x.end_time ? '–' + x.end_time.slice(0, 5) : ''}` : <span className="muted">—</span>}</span>
            </button>); })}</div>
        </section>
      ))}
      {pick && <ShiftSheet kosId={kosId} staff={active} init={pick} onClose={() => setPick(null)} onDone={() => { setPick(null); onChanged(); }} />}
    </div>
  );
}

function ShiftSheet({ kosId, staff, init, onClose, onDone }) {
  const [sel, setSel] = useState(new Set(init.staff));
  const [dates, setDates] = useState(new Set(init.dates));
  const [start, setStart] = useState(init.start ?? '08:00');
  const [end, setEnd] = useState(init.end ?? '16:00');
  const [label, setLabel] = useState(init.label ?? 'Pagi');
  const [busy, setBusy] = useState(false);
  const days = Array.from({ length: 14 }, (_, i) => plus(today(), i));
  const tog = (set, setter, v) => { const n = new Set(set); n.has(v) ? n.delete(v) : n.add(v); setter(n); };
  const go = async (hapus) => {
    if (!sel.size || !dates.size) return toast('Pilih karyawan dan tanggal.');
    setBusy(true);
    const ok = await run(() => supabase.rpc('shift_plan_set', { p_kos: kosId, p: { staff_ids: [...sel], dates: [...dates], start: label === 'Libur' ? null : start, end: label === 'Libur' ? null : end, label, hapus } }), hapus ? 'Jadwal dihapus' : 'Jadwal disimpan', errMsg);
    setBusy(false);
    if (ok) onDone();
  };
  return (
    <Sheet title="Atur jadwal" onClose={onClose}>
      <div className="seg">{[['Pagi', '08:00', '16:00'], ['Siang', '12:00', '20:00'], ['Malam', '16:00', '23:00'], ['Libur', '', '']].map(([l, a, b]) => <button key={l} className={label === l ? 'on' : ''} onClick={() => { setLabel(l); if (a) { setStart(a); setEnd(b); } }}>{l}</button>)}</div>
      {label !== 'Libur' && <div className="row"><Field label="Mulai"><input type="time" value={start} onChange={(e) => setStart(e.target.value)} /></Field><Field label="Selesai"><input type="time" value={end} onChange={(e) => setEnd(e.target.value)} /></Field><Field label="Nama shift"><input value={label} maxLength={30} onChange={(e) => setLabel(e.target.value)} /></Field></div>}
      <span className="label">Karyawan</span>
      <div className="row" style={{ flexWrap: 'wrap', gap: 6 }}>{staff.map((s) => <button key={s.id} className={'sm' + (sel.has(s.id) ? ' primary' : '')} onClick={() => tog(sel, setSel, s.id)}>{s.name}</button>)}</div>
      <span className="label">Tanggal (14 hari ke depan)</span>
      <div className="row" style={{ flexWrap: 'wrap', gap: 6 }}>{days.map((dt) => <button key={dt} className={'sm' + (dates.has(dt) ? ' primary' : '')} onClick={() => tog(dates, setDates, dt)}>{hari(dt)}</button>)}</div>
      <button className="cta" disabled={busy} onClick={() => go(false)}>Simpan untuk {sel.size} orang × {dates.size} hari</button>
      <button className="ghost danger" disabled={busy} onClick={() => go(true)}>Hapus jadwal yang dipilih</button>
    </Sheet>
  );
}

function Karyawan({ kosId, d, onChanged }) {
  const [edit, setEdit] = useState(null);
  const [names, setNames] = useState({});
  useEffect(() => { supabase.rpc('member_names', { p_kos: kosId }).then(({ data }) => setNames(data || {})); }, [kosId]);
  return (
    <div className="stack">
      <button className="primary" onClick={() => setEdit({})}>+ Tambah karyawan</button>
      {d.staff.length === 0 ? <Empty title="Belum ada karyawan" text="Catat semua karyawan, termasuk yang tidak memakai aplikasi (mis. bagian gudang, kebersihan)." /> :
        <section className="panel"><div className="list">{d.staff.map((s) => (
          <button key={s.id} className="li click" style={LI} onClick={() => setEdit(s)}>
            <div className="main"><b>{s.name}{!s.active && <span className="chip void" style={{ marginLeft: 4 }}>Tidak aktif</span>}</b><span className="small muted">{s.position || '—'} · {PAY[s.pay_type]} {rp(s.base_pay)}{s.pay_type === 'harian' ? '/hari' : s.pay_type === 'per_jam' ? '/jam' : '/bulan'}{s.member_user_id ? ` · akun ${names[s.member_user_id] || 'tertaut'}` : ' · tanpa akun'}</span></div>
            <span className="small muted" style={{ whiteSpace: 'nowrap' }}>ubah ›</span>
          </button>
        ))}</div></section>}
      {edit && <StaffForm kosId={kosId} s={edit.id ? edit : null} names={names} taken={new Set(d.staff.filter((x) => x.id !== edit.id && x.member_user_id).map((x) => x.member_user_id))} onClose={() => setEdit(null)} onDone={() => { setEdit(null); onChanged(); }} />}
    </div>
  );
}

function StaffForm({ kosId, s, names, taken, onClose, onDone }) {
  const [f, setF] = useState({ name: s?.name || '', phone: s?.phone || '', position: s?.position || '', pay_type: s?.pay_type || 'bulanan', base_pay: s?.base_pay ? angka(s.base_pay) : '',
    allowance: s?.allowance > 0 ? angka(s.allowance) : '', overtime_rate: s?.overtime_rate > 0 ? angka(s.overtime_rate) : '', work_hours: s ? String(Number(s.work_hours)) : '8',
    join_date: s?.join_date || '', end_date: s?.end_date || '', bank_info: s?.bank_info || '', member_user_id: s?.member_user_id || '', active: s ? s.active : true, note: s?.note || '' });
  const [busy, setBusy] = useState(false);
  const set = (k, v) => setF({ ...f, [k]: v });
  const save = async () => {
    if (f.name.trim().length < 2) return toast('Isi nama karyawan.');
    setBusy(true);
    const ok = await run(() => supabase.rpc('staff_save', { p_kos: kosId, p_id: s?.id || null, p: { ...f, base_pay: parseRp(f.base_pay) || 0, allowance: parseRp(f.allowance) || 0, overtime_rate: parseRp(f.overtime_rate) || 0,
      work_hours: f.work_hours.replace(',', '.') || 8, member_user_id: f.member_user_id || null, join_date: f.join_date || null, end_date: f.end_date || null } }), s ? 'Data karyawan disimpan' : 'Karyawan ditambahkan', errMsg);
    setBusy(false);
    if (ok) onDone();
  };
  const per = f.pay_type === 'harian' ? 'per hari hadir' : f.pay_type === 'per_jam' ? 'per jam kerja' : 'per bulan';
  return (
    <Sheet title={s ? `Ubah · ${s.name}` : 'Tambah karyawan'} onClose={onClose}>
      <Field label="Nama"><input value={f.name} maxLength={80} onChange={(e) => set('name', e.target.value)} /></Field>
      <div className="row"><Field label="Jabatan"><input value={f.position} maxLength={60} onChange={(e) => set('position', e.target.value)} placeholder="mis. Kasir, Gudang" /></Field><Field label="No. HP"><input inputMode="tel" value={f.phone} maxLength={20} onChange={(e) => set('phone', e.target.value)} /></Field></div>
      <span className="label">Gaji</span>
      <div className="seg">{Object.entries(PAY).map(([k, l]) => <button key={k} className={f.pay_type === k ? 'on' : ''} onClick={() => set('pay_type', k)}>{l}</button>)}</div>
      <div className="row"><Field label={`Gaji pokok ${per}`}><input inputMode="numeric" value={f.base_pay} onChange={(e) => set('base_pay', e.target.value)} /></Field><Field label="Tunjangan tetap / bulan"><input inputMode="numeric" value={f.allowance} onChange={(e) => set('allowance', e.target.value)} placeholder="0" /></Field></div>
      <div className="row"><Field label="Upah lembur / jam"><input inputMode="numeric" value={f.overtime_rate} onChange={(e) => set('overtime_rate', e.target.value)} placeholder="0" /></Field><Field label="Jam kerja / hari" hint="dasar hitung lembur bila tanpa jadwal"><input inputMode="decimal" value={f.work_hours} onChange={(e) => set('work_hours', e.target.value)} /></Field></div>
      <div className="row"><Field label="Mulai kerja"><input type="date" value={f.join_date} onChange={(e) => set('join_date', e.target.value)} /></Field><Field label="Berhenti (bila ada)"><input type="date" value={f.end_date} onChange={(e) => set('end_date', e.target.value)} /></Field></div>
      <Field label="Rekening gaji (opsional)"><input value={f.bank_info} maxLength={120} onChange={(e) => set('bank_info', e.target.value)} placeholder="mis. BRI 1234 a.n. Rina" /></Field>
      <Field label="Akun aplikasi (untuk absen sendiri)" hint="opsional — undang dulu di menu Karyawan"><select value={f.member_user_id} onChange={(e) => set('member_user_id', e.target.value)}>
        <option value="">— tanpa akun —</option>{Object.entries(names).filter(([id]) => !taken.has(id)).map(([id, em]) => <option key={id} value={id}>{em}</option>)}</select></Field>
      <label className="row small" style={{ flexWrap: 'nowrap' }}><input type="checkbox" style={{ width: 22, minHeight: 22, flex: 'none' }} checked={f.active} onChange={(e) => set('active', e.target.checked)} />Masih bekerja (aktif)</label>
      <button className="cta" disabled={busy} onClick={save}>{busy ? 'Menyimpan…' : 'Simpan'}</button>
      <span className="small muted">Bulanan: gaji dihitung penuh (prorata bila mulai/berhenti di tengah bulan). Harian: × hari hadir. Per jam: × jam kerja (di luar lembur). Lembur = jam lembur × upah lembur.</span>
    </Sheet>
  );
}

function Gaji({ kosId, kos, d, onChanged }) {
  const thisMonth = today().slice(0, 7) + '-01';
  const [month, setMonth] = useState(thisMonth);
  const [runRow, setRunRow] = useState(undefined);
  const [lines, setLines] = useState([]);
  const [edit, setEdit] = useState(null);
  const [busy, setBusy] = useState(false);
  const [acc, setAcc] = useState('kas');
  const [adv, setAdv] = useState(null);
  const [bal, setBal] = useState({});
  const load = async () => {
    const { data } = await supabase.from('payroll_runs').select('*').eq('kos_id', kosId).eq('period', month).neq('status', 'batal').maybeSingle();
    setRunRow(data || null);
    if (data) { const l = await supabase.from('payroll_lines').select('*').eq('run_id', data.id).order('name'); setLines(l.data || []); } else setLines([]);
    const b = {}; await Promise.all(d.staff.filter((s) => s.active).map(async (s) => { const r = await supabase.rpc('staff_advance_balance', { p_staff: s.id }); b[s.id] = Number(r.data) || 0; })); setBal(b);
  };
  useEffect(() => { load(); }, [month, d]);
  const draft = async () => {
    setBusy(true);
    const ok = await run(() => supabase.rpc('payroll_draft', { p_kos: kosId, p_month: month }), runRow ? 'Dihitung ulang dari absensi terbaru' : 'Draf gaji dibuat', errMsg);
    setBusy(false); if (ok) load();
  };
  const pay = async () => {
    if (!window.confirm(`Bayar gaji ${bulanNama(month)} total ${rp(runRow.total_net)} dari ${acc === 'kas' ? 'kas' : 'bank'}? Dicatat sebagai pengeluaran "Gaji karyawan".`)) return;
    setBusy(true);
    const ok = await run(() => supabase.rpc('payroll_pay', { p_run: runRow.id, p_account: acc, p_date: null }), 'Gaji dibayar & tercatat', errMsg);
    setBusy(false); if (ok) { load(); onChanged(); }
  };
  const voidRun = async () => {
    const reason = window.prompt('Alasan membatalkan penggajian ini (pengeluarannya ikut dihapus):') || '';
    if (reason.trim().length < 3) return;
    if (await run(() => supabase.rpc('payroll_void', { p_run: runRow.id, p_reason: reason }), 'Penggajian dibatalkan', errMsg)) { load(); onChanged(); }
  };
  const months = Array.from({ length: 6 }, (_, i) => { const x = new Date(thisMonth + 'T00:00:00Z'); x.setUTCMonth(x.getUTCMonth() - i); return x.toISOString().slice(0, 10); });
  const totalAdv = Object.values(bal).reduce((a, b) => a + b, 0);
  return (
    <div className="stack">
      <Field label="Bulan"><select value={month} onChange={(e) => setMonth(e.target.value)}>{months.map((m) => <option key={m} value={m}>{bulanNama(m)}</option>)}</select></Field>
      {runRow === undefined ? <Loading /> : !runRow ? (
        <Empty title={`Gaji ${bulanNama(month)} belum dihitung`} text="Sistem menghitung dari data karyawan dan absensi bulan ini. Bonus, potongan, dan potongan kasbon bisa diubah sebelum dibayar."><button className="primary" disabled={busy} onClick={draft}>Hitung gaji</button></Empty>
      ) : <>
        <div className="grid">
          <Tile label="Total dibayar" value={rp(runRow.total_net)} sub={`${lines.length} karyawan`} />
          <Tile label="Gaji kotor" value={rp(runRow.total_gross)} />
          <Tile label="Status" value={runRow.status === 'dibayar' ? 'Dibayar' : 'Draf'} tone={runRow.status === 'dibayar' ? 'good' : 'gold'} sub={runRow.paid_date ? `${tgl(runRow.paid_date)} · ${runRow.account}` : 'belum dibayar'} />
        </div>
        <section className="panel"><div className="list">{lines.map((l) => (
          <button key={l.id} className="li click" style={LI} onClick={() => runRow.status === 'draf' ? setEdit(l) : null}>
            <div className="main"><b>{l.name}</b><span className="small muted">{PAY[l.pay_type]} · hadir {angka(l.days_present)} hari{Number(l.days_absent) > 0 ? ` · alpa ${angka(l.days_absent)}` : ''}{Number(l.overtime_hours) > 0 ? ` · lembur ${angka(l.overtime_hours)} jam` : ''}{Number(l.advance_deduction) > 0 ? ` · kasbon −${rp(l.advance_deduction)}` : ''}{Number(l.bonus) > 0 ? ` · bonus ${rp(l.bonus)}` : ''}{Number(l.deduction) > 0 ? ` · potongan −${rp(l.deduction)}` : ''}</span></div>
            <div style={{ textAlign: 'right', flex: 'none' }}><b style={{ whiteSpace: 'nowrap' }}>{rp(l.net)}</b><div className="row" style={{ gap: 4, justifyContent: 'flex-end' }}><Link href={`/dokumen/gaji/${runRow.id}?staff=${l.staff_id}`} onClick={(e) => e.stopPropagation()}><span className="small">Slip ›</span></Link></div></div>
          </button>
        ))}</div></section>
        {runRow.status === 'draf' ? <>
          <span className="small muted">Ketuk nama untuk mengubah bonus, potongan, atau potongan kasbon. Absensi berubah? Tekan Hitung ulang (bonus & potongan tetap).</span>
          <div className="row"><button disabled={busy} onClick={draft}>Hitung ulang</button>
            <select value={acc} onChange={(e) => setAcc(e.target.value)} aria-label="Dibayar dari" style={{ width: 'auto' }}><option value="kas">dari Kas</option><option value="bank">dari Bank</option></select>
            <button className="primary" disabled={busy || !lines.length} onClick={pay}>Bayar gaji</button></div>
        </> : <button className="ghost danger" onClick={voidRun}>Batalkan penggajian (salah hitung)</button>}
      </>}

      <section className="panel" style={{ gap: 6 }}>
        <div className="row between"><span className="label">Kasbon karyawan</span><button className="sm" onClick={() => setAdv({ staff: d.staff.find((s) => s.active)?.id || '', amount: '', account: 'kas', note: '' })}>+ Kasbon</button></div>
        <span className="small muted">Belum dipotong: <b>{rp(totalAdv)}</b>. Kasbon dicatat sebagai pengeluaran "Gaji karyawan" saat diberikan dan otomatis dipotong saat gajian (bisa diubah di draf gaji).</span>
        {d.adv.filter((a) => a.status === 'aktif').slice(0, 10).map((a) => (
          <div className="li" key={a.id}><div className="main"><span className="small"><b>{d.staff.find((s) => s.id === a.staff_id)?.name}</b> · {tgl(a.date)}{a.note ? ` · ${a.note}` : ''}</span></div><b className="small" style={{ whiteSpace: 'nowrap' }}>{rp(a.amount)}</b></div>
        ))}
      </section>
      {adv && <Sheet title="Kasbon karyawan" onClose={() => setAdv(null)}>
        <Field label="Karyawan"><select value={adv.staff} onChange={(e) => setAdv({ ...adv, staff: e.target.value })}>{d.staff.filter((s) => s.active).map((s) => <option key={s.id} value={s.id}>{s.name}{bal[s.id] ? ` (belum dipotong ${rp(bal[s.id])})` : ''}</option>)}</select></Field>
        <div className="row"><Field label="Jumlah"><input inputMode="numeric" value={adv.amount} onChange={(e) => setAdv({ ...adv, amount: e.target.value })} /></Field>
          <Field label="Diambil dari"><select value={adv.account} onChange={(e) => setAdv({ ...adv, account: e.target.value })}><option value="kas">Kas</option><option value="bank">Bank</option></select></Field></div>
        <Field label="Keperluan (opsional)"><input value={adv.note} maxLength={200} onChange={(e) => setAdv({ ...adv, note: e.target.value })} /></Field>
        <button className="cta" onClick={async () => { if (await run(() => supabase.rpc('staff_advance_add', { p_kos: kosId, p_staff: adv.staff, p_amount: parseRp(adv.amount), p_account: adv.account, p_date: null, p_note: adv.note }), 'Kasbon dicatat', errMsg)) { setAdv(null); onChanged(); } }}>Simpan kasbon</button>
      </Sheet>}
      {edit && <LineSheet l={edit} bal={bal[edit.staff_id] || 0} onClose={() => setEdit(null)} onDone={() => { setEdit(null); load(); }} />}
    </div>
  );
}

function LineSheet({ l, bal, onClose, onDone }) {
  const [f, setF] = useState({ base: angka(l.base), allowance: angka(l.allowance), overtime: angka(l.overtime), bonus: Number(l.bonus) ? angka(l.bonus) : '', deduction: Number(l.deduction) ? angka(l.deduction) : '', advance_deduction: angka(l.advance_deduction), note: l.note || '' });
  const set = (k, v) => setF({ ...f, [k]: v });
  const n = (k) => parseRp(f[k]) || 0;
  const net = n('base') + n('allowance') + n('overtime') + n('bonus') - n('deduction') - n('advance_deduction');
  const save = async () => {
    if (await run(() => supabase.rpc('payroll_line_set', { p_line: l.id, p: { base: n('base'), allowance: n('allowance'), overtime: n('overtime'), bonus: n('bonus'), deduction: n('deduction'), advance_deduction: n('advance_deduction'), note: f.note } }), 'Disimpan', errMsg)) onDone();
  };
  const remove = async () => { if (window.confirm(`Keluarkan ${l.name} dari penggajian bulan ini?`) && await run(() => supabase.rpc('payroll_line_remove', { p_line: l.id }), 'Dikeluarkan', errMsg)) onDone(); };
  return (
    <Sheet title={`Gaji · ${l.name}`} onClose={onClose}>
      <span className="small muted">Hadir {angka(l.days_present)} hari · {angka(l.hours)} jam · lembur {angka(l.overtime_hours)} jam{Number(l.days_absent) ? ` · alpa ${angka(l.days_absent)} hari` : ''}</span>
      <div className="row"><Field label="Gaji pokok"><input inputMode="numeric" value={f.base} onChange={(e) => set('base', e.target.value)} /></Field><Field label="Tunjangan"><input inputMode="numeric" value={f.allowance} onChange={(e) => set('allowance', e.target.value)} /></Field></div>
      <div className="row"><Field label="Lembur"><input inputMode="numeric" value={f.overtime} onChange={(e) => set('overtime', e.target.value)} /></Field><Field label="Bonus / insentif"><input inputMode="numeric" value={f.bonus} onChange={(e) => set('bonus', e.target.value)} placeholder="0" /></Field></div>
      <div className="row"><Field label="Potongan lain" hint="mis. alpa, denda"><input inputMode="numeric" value={f.deduction} onChange={(e) => set('deduction', e.target.value)} placeholder="0" /></Field><Field label={`Potong kasbon (maks ${rp(bal)})`}><input inputMode="numeric" value={f.advance_deduction} onChange={(e) => set('advance_deduction', e.target.value)} /></Field></div>
      <Field label="Catatan di slip (opsional)"><input value={f.note} maxLength={200} onChange={(e) => set('note', e.target.value)} /></Field>
      <div className="row between" style={{ fontSize: 18 }}><b>Dibayar</b><b style={{ color: net < 0 ? 'var(--bad)' : undefined }}>{rp(net)}</b></div>
      <button className="cta" onClick={save} disabled={net < 0}>Simpan</button>
      <button className="ghost danger" onClick={remove}>Keluarkan dari penggajian bulan ini</button>
    </Sheet>
  );
}
