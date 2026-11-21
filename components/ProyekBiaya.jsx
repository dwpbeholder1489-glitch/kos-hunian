'use client';
// Anggaran, biaya & laba proyek (Tahap 1C). Server: prj_costs, prj_budget_save/approve, prj_cost_add/link/unlink, prj_commit_save/close.
// Biaya nyata = pengeluaran/belanja biasa (sudah di Kas & Pembukuan) yang ditandai untuk proyek — tidak ada jalur uang baru.
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { Sheet, Field, Tile, run, toast } from '@/components/ui';
import { angka, parseRp, rp, tgl, tglShort, today, errMsg } from '@/lib/format';

// Kategori anggaran yang umum per jenis proyek (blueprint §5.6, §12.2) — hanya saran, bebas diketik
export const BUDGET_CATS = {
  event: ['Venue', 'Stage', 'Sound', 'Lighting', 'LED screen', 'Dekorasi', 'Talent', 'Speaker', 'MC', 'Crew', 'Transportasi', 'Akomodasi', 'Konsumsi', 'Keamanan', 'Perizinan', 'Promosi', 'Dokumentasi', 'Biaya tak terduga'],
  kreatif: ['Freelancer', 'Talent', 'Sewa alat', 'Lokasi', 'Transportasi', 'Post-production', 'Musik & lisensi', 'Iklan', 'Biaya tak terduga'],
  produksi: ['Material', 'Tenaga kerja', 'Sewa alat', 'Transportasi', 'Outsourcing', 'Kemasan', 'Biaya tak terduga'],
  umum: ['Material', 'Tenaga kerja', 'Vendor', 'Transportasi', 'Biaya tak terduga'],
};
const C_ST = { terbuka: ['Belum dibayar', 'gold'], selesai: ['Selesai', 'good'], batal: ['Batal', 'void'] };
const pctOf = (a, b) => (Number(b) > 0 ? Math.min(100, Math.round((100 * Number(a)) / Number(b))) : Number(a) > 0 ? 100 : 0);

export default function CostPanel({ project, onChange }) {
  const [d, setD] = useState(null);
  const [err, setErr] = useState(null);
  const [sheet, setSheet] = useState(null);   // 'budget' | 'cost' | 'link' | {commit}
  const load = () => supabase.rpc('prj_costs', { p_project: project.id }).then(({ data, error }) => (error ? setErr(errMsg(error)) : (setErr(null), setD(data))));
  useEffect(() => { load(); }, [project.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const done = () => { setSheet(null); load(); onChange?.(); };
  if (err) return <section className="panel"><span className="label">Anggaran & biaya</span><span className="small" style={{ color: 'var(--bad)' }}>{err}</span></section>;
  if (!d) return <section className="panel"><span className="label">Anggaran & biaya</span><span className="small muted">Memuat…</span></section>;
  const closed = ['selesai', 'batal'].includes(project.status);
  const can = d.allowed && project.status !== 'batal';
  const cats = [...new Set([...(BUDGET_CATS[d.kind] || BUDGET_CATS.umum), ...d.categories.map((c) => c.category)])];
  const approve = async () => { if (window.confirm(`Setujui anggaran ${rp(d.budget)}? Angka ini menjadi pembanding selisih biaya.`) && await run(() => supabase.rpc('prj_budget_approve', { p_project: project.id }), 'Anggaran disetujui', errMsg)) done(); };
  const unlink = async (l) => { if (window.confirm(`Lepas tanda "${l.label}" dari proyek ini? Pengeluaran/belanjanya tetap ada di Kas & Pembukuan.`) && await run(() => supabase.rpc('prj_cost_unlink', { p_link: l.id }), 'Tanda dilepas', errMsg)) done(); };
  const closeC = async (c, s) => { if (await run(() => supabase.rpc('prj_commit_close', { p_id: c.id, p_status: s }), s === 'selesai' ? 'Komitmen selesai — catat/tandai pembayarannya sebagai biaya' : s === 'batal' ? 'Komitmen dibatalkan' : 'Komitmen dibuka lagi', errMsg)) done(); };
  const profitTone = d.profit_forecast == null ? '' : Number(d.profit_forecast) < 0 ? 'bad' : '';
  return (
    <section className="panel" style={{ gap: 10 }}>
      <div className="row between" style={{ flexWrap: 'wrap', gap: 8 }}>
        <span className="label">Anggaran, biaya & laba</span>
        {can && <div className="row" style={{ flexWrap: 'wrap', gap: 6 }}>
          {!closed && <button className="sm" onClick={() => setSheet('budget')}>{d.budget_lines.length ? 'Ubah anggaran' : '+ Anggaran'}</button>}
          <button className="sm primary" onClick={() => setSheet('cost')}>+ Catat biaya</button>
          <button className="sm" onClick={() => setSheet('link')}>Tandai biaya lama</button>
          {!closed && <button className="sm" onClick={() => setSheet({ commit: {} })}>+ Komitmen vendor</button>}
        </div>}
      </div>
      <div className="grid">
        <Tile label="Anggaran" value={rp(d.budget)} sub={d.approved != null ? (Number(d.approved) === Number(d.budget) ? 'sudah disetujui' : `disetujui ${rp(d.approved)}`) : d.budget_lines.length ? 'belum disetujui' : 'belum diisi'} />
        <Tile label="Biaya nyata" value={rp(d.actual)} sub={`${pctOf(d.actual, d.budget)}% dari anggaran`} tone={Number(d.actual) > Number(d.budget) && Number(d.budget) > 0 ? 'bad' : ''} />
        <Tile label="Komitmen" value={rp(d.committed)} sub="dipesan / disepakati, belum dibayar" />
        <Tile label="Perkiraan laba" value={d.value != null ? rp(d.profit_forecast) : '—'} tone={profitTone}
          sub={d.value == null ? 'isi nilai kontrak proyek' : Number(d.budget) === 0 ? 'belum ada anggaran — hanya dari biaya yang sudah keluar' : `${d.margin_forecast != null ? `margin ${String(d.margin_forecast).replace('.', ',')}% · ` : ''}nilai kontrak ${rp(d.value)}`} />
      </div>
      {d.approved == null && d.budget_lines.length > 0 && d.can_approve && can && <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}><span className="small muted">Setujui anggaran agar perubahan berikutnya terlihat sebagai selisih.</span><button className="sm" onClick={approve}>Setujui anggaran</button></div>}
      {d.approved != null && Number(d.approved) !== Number(d.budget) && d.can_approve && can && <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}><span className="small muted">Anggaran berubah dari yang disetujui ({rp(d.approved)} → {rp(d.budget)}).</span><button className="sm" onClick={approve}>Setujui anggaran baru</button></div>}
      {d.mismatch > 0 && <div className="notice">{d.mismatch} biaya yang ditandai nilainya lebih besar dari pengeluaran/belanja aslinya (diubah atau dibatalkan setelah ditandai). Periksa daftar Biaya nyata.</div>}

      {d.categories.length > 0 && <div className="list">{d.categories.map((c) => (
        <div className="li" key={c.category} style={{ flexDirection: 'column', alignItems: 'stretch', gap: 4 }}>
          <div className="row between" style={{ flexWrap: 'nowrap', gap: 8 }}><b className="small">{c.category}</b>
            <span className="small" style={{ whiteSpace: 'nowrap' }}>{rp(Number(c.actual) + Number(c.committed))} / {rp(c.budget)}</span></div>
          <div className="progress"><i style={{ width: `${pctOf(Number(c.actual) + Number(c.committed), c.budget)}%`, background: c.over ? 'var(--bad)' : undefined }} /></div>
          <span className="small muted">nyata {rp(c.actual)}{Number(c.committed) > 0 ? ` · komitmen ${rp(c.committed)}` : ''} · {Number(c.remaining) >= 0 ? `sisa ${rp(c.remaining)}` : <b style={{ color: 'var(--bad)' }}>lewat {rp(-c.remaining)}</b>}{Number(c.budget) === 0 ? ' · di luar anggaran' : ''}</span>
        </div>))}</div>}
      {d.categories.length === 0 && <span className="small muted">Isi anggaran per kategori (mis. Venue, Sound, Talent), lalu catat biaya yang keluar. Laba proyek dihitung otomatis dari nilai kontrak dikurangi biaya.</span>}

      {d.commitments.length > 0 && <>
        <span className="label">Komitmen vendor</span>
        <div className="list">{d.commitments.map((c) => (
          <div className="li" key={c.id} style={{ flexWrap: 'wrap' }}>
            <div className="main" style={{ flex: '1 1 200px' }}><b className="small">{c.description}</b><span className="small muted">{c.vendor || 'tanpa vendor'} · {c.category}{c.due_date ? ` · bayar ${tglShort(c.due_date)}` : ''} · <b>{rp(c.amount)}</b></span></div>
            <div className="row" style={{ gap: 6, flexWrap: 'wrap' }}><span className={'chip ' + C_ST[c.status][1]}>{C_ST[c.status][0]}</span>
              {c.status === 'terbuka' && <><button className="sm" onClick={() => closeC(c, 'selesai')}>Sudah dibayar</button><button className="sm ghost" onClick={() => setSheet({ commit: c })}>Ubah</button><button className="sm ghost danger" onClick={() => closeC(c, 'batal')}>Batal</button></>}
              {c.status !== 'terbuka' && !closed && <button className="sm ghost" onClick={() => closeC(c, 'terbuka')}>Buka lagi</button>}</div>
          </div>))}</div>
        <span className="small muted">Komitmen = biaya yang sudah disepakati tapi belum dibayar. Setelah dibayar, tekan Sudah dibayar lalu Catat biaya agar masuk Kas & Pembukuan.</span>
      </>}

      {d.links.length > 0 && <>
        <span className="label">Biaya nyata ({d.links.length})</span>
        <div className="list">{d.links.map((l) => (
          <div className="li" key={l.id}>
            <div className="main"><b className="small">{l.label}</b><span className="small muted">{tgl(l.date)} · {l.category} · {l.source_type === 'purchase' ? `belanja${l.purchase_status === 'dipesan' ? ' (masih dipesan = komitmen)' : ''}` : 'pengeluaran'}
              {Number(l.amount) !== Number(l.source_value) ? ` · ${rp(l.amount)} dari ${rp(l.source_value)}` : ''}</span></div>
            <div className="row" style={{ gap: 6, flexWrap: 'nowrap' }}><b className="small" style={{ whiteSpace: 'nowrap' }}>{rp(l.amount)}</b><button className="sm ghost" aria-label="Lepas tanda" onClick={() => unlink(l)}>Lepas</button></div>
          </div>))}</div>
      </>}
      <span className="small muted">Biaya proyek adalah pengeluaran & belanja biasa (sudah di Kas & Pembukuan) yang ditandai untuk proyek ini. Gaji karyawan belum dibagi otomatis ke proyek; catat fee freelancer/kru sebagai biaya.</span>

      {sheet === 'budget' && <BudgetSheet project={project} d={d} cats={cats} onClose={() => setSheet(null)} onDone={done} />}
      {sheet === 'cost' && <CostSheet project={project} d={d} cats={cats} onClose={() => setSheet(null)} onDone={done} />}
      {sheet === 'link' && <LinkSheet project={project} d={d} cats={cats} onClose={() => setSheet(null)} onDone={done} />}
      {sheet?.commit && <CommitSheet project={project} d={d} cats={cats} init={sheet.commit} onClose={() => setSheet(null)} onDone={done} />}
    </section>
  );
}

const CatInput = ({ value, onChange, cats, id }) => (
  <>
    <input list={id} value={value} maxLength={60} onChange={(e) => onChange(e.target.value)} placeholder="mis. Sound, Venue, Talent" />
    <datalist id={id}>{cats.map((c) => <option key={c} value={c} />)}</datalist>
  </>
);

function BudgetSheet({ project, d, cats, onClose, onDone }) {
  const [rows, setRows] = useState(d.budget_lines.length ? d.budget_lines.map((b) => ({ category: b.category, description: b.description || '', amount: angka(b.amount) })) : [{ category: '', description: '', amount: '' }]);
  const [busy, setBusy] = useState(false);
  const setRow = (i, k, v) => setRows((r) => r.map((x, j) => (j === i ? { ...x, [k]: v } : x)));
  const total = rows.reduce((a, r) => a + parseRp(r.amount), 0);
  const unused = cats.filter((c) => !rows.some((r) => r.category.trim().toLowerCase() === c.toLowerCase()));
  const save = async () => {
    const list = rows.filter((r) => r.category.trim() || parseRp(r.amount));
    if (list.some((r) => !r.category.trim())) return toast('Setiap baris anggaran harus punya kategori.');
    setBusy(true);
    const ok = await run(() => supabase.rpc('prj_budget_save', { p_project: project.id, p_lines: list.map((r) => ({ category: r.category.trim(), description: r.description, amount: parseRp(r.amount) })) }), 'Anggaran disimpan', errMsg);
    setBusy(false); if (ok) onDone();
  };
  return (
    <Sheet title="Anggaran proyek" onClose={onClose}>
      <span className="small muted">Rencana biaya per kategori. Kategori yang sama boleh beberapa baris (dijumlahkan).{d.approved != null ? ' Anggaran ini sudah pernah disetujui; perubahan akan terlihat sebagai selisih.' : ''}</span>
      {unused.length > 0 && <div className="row" style={{ flexWrap: 'wrap', gap: 6 }}>{unused.slice(0, 12).map((c) => <button type="button" key={c} className="sm" onClick={() => setRows((r) => [...r.filter((x) => x.category.trim() || x.amount), { category: c, description: '', amount: '' }])}>+ {c}</button>)}</div>}
      {rows.map((r, i) => (
        <div className="unitbox" key={i} style={{ gap: 8 }}>
          <div className="row">
            <Field label="Kategori"><CatInput id={`bc${i}`} value={r.category} onChange={(v) => setRow(i, 'category', v)} cats={cats} /></Field>
            <Field label="Anggaran"><input inputMode="numeric" value={r.amount} onChange={(e) => setRow(i, 'amount', e.target.value)} placeholder="0" /></Field>
          </div>
          <Field label="Keterangan (opsional)"><input value={r.description} maxLength={200} onChange={(e) => setRow(i, 'description', e.target.value)} placeholder="mis. line array 10 kW, 2 hari" /></Field>
          <button type="button" className="sm ghost danger" onClick={() => setRows(rows.filter((_, j) => j !== i))}>Hapus baris</button>
        </div>))}
      <button type="button" className="sm" onClick={() => setRows([...rows, { category: '', description: '', amount: '' }])}>+ Baris anggaran</button>
      <dl className="kv"><dt>Total anggaran</dt><dd>{rp(total)}</dd>{d.value != null && <><dt>Nilai kontrak</dt><dd>{rp(d.value)}</dd><dt>Rencana laba</dt><dd style={{ color: d.value - total < 0 ? 'var(--bad)' : undefined }}>{rp(d.value - total)}</dd></>}</dl>
      <button className="cta" disabled={busy} onClick={save}>{busy ? 'Menyimpan…' : 'Simpan anggaran'}</button>
    </Sheet>
  );
}

function CostSheet({ project, d, cats, onClose, onDone }) {
  const [f, setF] = useState({ category: cats[0] || '', amount: '', date: today(), account: 'kas', category_id: '', description: '' });
  const [busy, setBusy] = useState(false);
  const set = (k, v) => setF((x) => ({ ...x, [k]: v }));
  const save = async () => {
    if (!(parseRp(f.amount) > 0)) return toast('Isi nominal biaya.');
    if (!f.category.trim()) return toast('Pilih kategori anggaran proyek.');
    setBusy(true);
    const ok = await run(() => supabase.rpc('prj_cost_add', { p_project: project.id, p: { ...f, amount: parseRp(f.amount), category_id: f.category_id || null } }), 'Biaya dicatat di Kas & proyek', errMsg);
    setBusy(false); if (ok) onDone();
  };
  return (
    <Sheet title="Catat biaya proyek" onClose={onClose}>
      <span className="small muted">Dicatat sebagai pengeluaran biasa (muncul di Kas & Pembukuan) dan langsung ditandai untuk {project.number}.</span>
      <div className="row">
        <Field label="Kategori anggaran proyek"><CatInput id="cc" value={f.category} onChange={(v) => set('category', v)} cats={cats} /></Field>
        <Field label="Nominal"><input inputMode="numeric" value={f.amount} onChange={(e) => set('amount', e.target.value)} placeholder="mis. 2.500.000" /></Field>
      </div>
      <Field label="Keterangan"><input value={f.description} maxLength={200} onChange={(e) => set('description', e.target.value)} placeholder="mis. DP sewa sound system, fee fotografer" /></Field>
      <div className="row">
        <Field label="Tanggal"><input type="date" value={f.date} max={today()} onChange={(e) => set('date', e.target.value)} /></Field>
        <Field label="Dibayar dari"><select value={f.account} onChange={(e) => set('account', e.target.value)}><option value="kas">Kas</option><option value="bank">Bank</option></select></Field>
      </div>
      {d.expense_categories.length > 0 && <Field label="Kategori pengeluaran di Kas (opsional)" hint="untuk laporan pengeluaran bisnis"><select value={f.category_id} onChange={(e) => set('category_id', e.target.value)}><option value="">— lainnya —</option>{d.expense_categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></Field>}
      <button className="cta" disabled={busy} onClick={save}>{busy ? 'Menyimpan…' : 'Simpan biaya'}</button>
    </Sheet>
  );
}

function LinkSheet({ project, d, cats, onClose, onDone }) {
  const [pick, setPick] = useState(null);
  const [f, setF] = useState({ category: cats[0] || '', amount: '', note: '' });
  const [busy, setBusy] = useState(false);
  const save = async () => {
    if (!f.category.trim()) return toast('Pilih kategori anggaran proyek.');
    const amt = f.amount === '' ? null : parseRp(f.amount);
    if (amt != null && (amt <= 0 || amt > Number(pick.free))) return toast(`Nominal 1 – ${rp(pick.free)}.`);
    setBusy(true);
    const ok = await run(() => supabase.rpc('prj_cost_link', { p_project: project.id, p_type: pick.source_type, p_source: pick.id, p_amount: amt, p_category: f.category.trim(), p_note: f.note }), 'Biaya ditandai untuk proyek', errMsg);
    setBusy(false); if (ok) onDone();
  };
  return (
    <Sheet title="Tandai biaya yang sudah dicatat" onClose={onClose}>
      {!pick ? <>
        <span className="small muted">Pengeluaran (menu Kas) & belanja 120 hari terakhir yang belum seluruhnya ditandai ke proyek. Satu biaya boleh dibagi ke beberapa proyek.</span>
        {d.candidates.length === 0 ? <span className="small muted">Tidak ada. Pakai Catat biaya untuk biaya baru.</span>
          : <div className="list">{d.candidates.map((c) => (
            <button type="button" className="li click" key={c.source_type + c.id} style={{ background: 'none', border: 0, borderTop: '1px solid var(--line)', borderRadius: 0, textAlign: 'left', width: '100%', font: 'inherit', color: 'inherit' }}
              onClick={() => { setPick(c); setF((x) => ({ ...x, amount: '' })); }}>
              <div className="main"><b className="small">{c.label}</b><span className="small muted">{tgl(c.date)} · {c.source_type === 'purchase' ? 'belanja' : 'pengeluaran'}{Number(c.free) !== Number(c.value) ? ` · sisa ${rp(c.free)} dari ${rp(c.value)}` : ''}</span></div>
              <b className="small">{rp(c.free)}</b></button>))}</div>}
      </> : <>
        <div className="notice">{pick.label} · {tgl(pick.date)} · sisa <b>{rp(pick.free)}</b></div>
        <div className="row">
          <Field label="Kategori anggaran proyek"><CatInput id="lc" value={f.category} onChange={(v) => setF({ ...f, category: v })} cats={cats} /></Field>
          <Field label="Nominal untuk proyek ini" hint="kosong = seluruh sisa"><input inputMode="numeric" value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} placeholder={angka(pick.free)} /></Field>
        </div>
        <Field label="Catatan (opsional)"><input value={f.note} maxLength={200} onChange={(e) => setF({ ...f, note: e.target.value })} /></Field>
        <div className="row" style={{ flexWrap: 'wrap' }}><button className="cta" disabled={busy} onClick={save}>{busy ? 'Menyimpan…' : 'Tandai'}</button><button className="ghost" onClick={() => setPick(null)}>Pilih yang lain</button></div>
      </>}
    </Sheet>
  );
}

function CommitSheet({ project, d, cats, init, onClose, onDone }) {
  const [f, setF] = useState({ contact_id: init.contact_id || '', newVendor: !init.id && d.vendors.length === 0, vendor_name: '', vendor_phone: '', category: init.category || cats[0] || '',
    description: init.description || '', amount: init.amount ? angka(init.amount) : '', due_date: init.due_date || '', note: init.note || '' });
  const [busy, setBusy] = useState(false);
  const set = (k, v) => setF((x) => ({ ...x, [k]: v }));
  const save = async () => {
    if (f.description.trim().length < 2) return toast('Isi uraian kesepakatan.');
    if (!(parseRp(f.amount) > 0)) return toast('Isi nilai kesepakatan.');
    setBusy(true);
    const p = { category: f.category, description: f.description, amount: parseRp(f.amount), due_date: f.due_date || null, note: f.note,
      ...(f.newVendor ? { vendor_name: f.vendor_name, vendor_phone: f.vendor_phone } : { contact_id: f.contact_id || null }) };
    const ok = await run(() => supabase.rpc('prj_commit_save', { p_project: project.id, p_id: init.id || null, p }), 'Komitmen disimpan', errMsg);
    setBusy(false); if (ok) onDone();
  };
  return (
    <Sheet title={init.id ? 'Ubah komitmen' : 'Komitmen vendor'} onClose={onClose}>
      <span className="small muted">Biaya yang sudah disepakati dengan vendor tapi belum dibayar (mis. sewa sound, fee band). Dihitung ke perkiraan biaya, belum masuk Kas.</span>
      {d.vendors.length > 0 && <div className="seg">{[[false, 'Pilih vendor'], [true, 'Vendor baru']].map(([k, l]) => <button type="button" key={String(k)} className={f.newVendor === k ? 'on' : ''} onClick={() => set('newVendor', k)}>{l}</button>)}</div>}
      {f.newVendor ? <div className="row">
        <Field label="Nama vendor (opsional)"><input value={f.vendor_name} maxLength={80} onChange={(e) => set('vendor_name', e.target.value)} /></Field>
        <Field label="No. HP (opsional)"><input inputMode="tel" value={f.vendor_phone} maxLength={20} onChange={(e) => set('vendor_phone', e.target.value)} /></Field>
      </div> : <Field label="Vendor"><select value={f.contact_id} onChange={(e) => set('contact_id', e.target.value)}><option value="">— tanpa vendor —</option>{d.vendors.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}</select></Field>}
      <Field label="Uraian"><input value={f.description} maxLength={200} onChange={(e) => set('description', e.target.value)} placeholder="mis. Sewa sound system 2 hari" /></Field>
      <div className="row">
        <Field label="Kategori anggaran"><CatInput id="kc" value={f.category} onChange={(v) => set('category', v)} cats={cats} /></Field>
        <Field label="Nilai"><input inputMode="numeric" value={f.amount} onChange={(e) => set('amount', e.target.value)} /></Field>
      </div>
      <Field label="Jatuh tempo bayar (opsional)"><input type="date" value={f.due_date} onChange={(e) => set('due_date', e.target.value)} /></Field>
      <Field label="Catatan (opsional)"><input value={f.note} maxLength={300} onChange={(e) => set('note', e.target.value)} /></Field>
      <button className="cta" disabled={busy} onClick={save}>{busy ? 'Menyimpan…' : 'Simpan'}</button>
    </Sheet>
  );
}

// Tabel laba semua proyek (tab Laba proyek)
export function ProfitTable({ rows, onRow, DataTable, Chip, STATUS }) {
  return <DataTable rows={rows} caption="Laba per proyek" onRow={onRow} rowLabel={(r) => r.name}
    columns={[
      { key: 'n', label: 'Proyek', main: true, sort: (r) => r.name.toLowerCase(), render: (r) => <><b>{r.name}</b><div className="small muted">{r.number}{r.client ? ` · ${r.client}` : ''}</div></> },
      { key: 'v', label: 'Nilai kontrak', align: 'right', sort: (r) => Number(r.value || 0), render: (r) => (r.value != null ? rp(r.value) : '—') },
      { key: 'b', label: 'Anggaran', align: 'right', hide: 'tablet', sort: (r) => Number(r.budget), render: (r) => rp(r.budget) },
      { key: 'a', label: 'Biaya nyata', align: 'right', sort: (r) => Number(r.actual), render: (r) => <>{rp(r.actual)}{Number(r.committed) > 0 && <div className="small muted">+ komitmen {rp(r.committed)}</div>}</> },
      { key: 'p', label: 'Perkiraan laba', align: 'right', sort: (r) => Number(r.profit_forecast ?? -1e15), render: (r) => (r.value == null ? <span className="muted">—</span> : <><b style={{ color: Number(r.profit_forecast) < 0 ? 'var(--bad)' : undefined }}>{rp(r.profit_forecast)}</b>{Number(r.budget) === 0 ? <div className="small" style={{ color: 'var(--att-fg)' }}>tanpa anggaran</div> : r.margin_forecast != null && <div className="small muted">{String(r.margin_forecast).replace('.', ',')}%</div>}</>) },
      { key: 's', label: 'Status', hide: 'tablet', render: (r) => <Chip map={STATUS} v={r.status} /> },
    ]}
    card={(r) => <>
      <div className="dt-row"><b>{r.name}</b><Chip map={STATUS} v={r.status} /></div>
      <span className="small muted">{r.number}{r.client ? ` · ${r.client}` : ''}</span>
      <span className="small">Nilai {r.value != null ? rp(r.value) : '—'} · biaya {rp(r.actual)}{Number(r.committed) > 0 ? ` + komitmen ${rp(r.committed)}` : ''}</span>
      {r.value != null && <span className="small">Perkiraan laba <b style={{ color: Number(r.profit_forecast) < 0 ? 'var(--bad)' : undefined }}>{rp(r.profit_forecast)}</b>{Number(r.budget) === 0 ? ' · tanpa anggaran' : r.margin_forecast != null ? ` (${String(r.margin_forecast).replace('.', ',')}%)` : ''}</span>}
    </>} />;
}
