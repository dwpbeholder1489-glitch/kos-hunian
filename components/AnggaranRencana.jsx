'use client';
import { useEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { Loading, Sheet, Field, toast } from '@/components/ui';
import { rp, angka, errMsg, bulan, parseRp, tgl } from '@/lib/format';
import s from './AnggaranRencana.module.css';

// Tahap D (Master Blueprint BI §13): target pendapatan, status persetujuan, proyeksi akhir bulan.
// SEMUA angka dari RPC budget_summary (pendapatan = jurnal, sama dengan Laporan Keuangan; biaya = pengeluaran tercatat).
// Izin & paket dicek di server (budget_target_save / budget_submit / budget_decide).
export const STATUS = {
  draf: ['Draf', 'none'], diajukan: ['Menunggu persetujuan', 'warn'], disetujui: ['Disetujui', 'good'], ditolak: ['Ditolak', 'bad'],
};
const EV = { revisi: 'Direvisi', diajukan: 'Diajukan', disetujui: 'Disetujui', ditolak: 'Ditolak' };
const n = (v) => Number(v || 0);

export function useBudgetSummary(kosId, month, ver) {
  const [st, setSt] = useState(null);
  const req = useRef(0);
  const load = async () => {
    const id = ++req.current;
    const { data, error } = await supabase.rpc('budget_summary', { p_kos: kosId, p_month: month });
    if (id === req.current) setSt({ month, data, error });
  };
  useEffect(() => { load(); return () => { req.current++; }; }, [kosId, month, ver]);
  return [st?.month === month ? st : null, load];
}

// Selisih dari rencana: pendapatan di atas target menambah laba; biaya di atas anggaran mengurangi laba (di luar HPP)
export function planImpact(sum) {
  const p = sum?.pendapatan || {}; const b = sum?.biaya || {};
  const revBase = sum?.final ? p.realisasi : p.proyeksi;
  const costBase = sum?.final ? b.realisasi : b.proyeksi;
  const rev = p.target != null && revBase != null ? n(revBase) - n(p.target) : null;
  const cost = n(b.anggaran) > 0 && costBase != null ? n(costBase) - n(b.anggaran) : null;
  return { rev, cost, total: rev == null && cost == null ? null : n(rev) - n(cost) };
}

function Bar({ value, max, tone }) {
  const pct = max > 0 ? Math.min(100, Math.max(0, value * 100 / max)) : 0;
  return <span className={s.bar} data-tone={tone}><i style={{ width: pct + '%' }} /></span>;
}

export function PlanSummary({ sum, compact }) {
  const p = sum.pendapatan || {}; const b = sum.biaya || {};
  const imp = planImpact(sum);
  const proj = sum.final ? 'Hasil akhir bulan' : sum.hari_berjalan ? `Proyeksi akhir bulan (laju ${angka(sum.hari_berjalan)} dari ${angka(sum.hari)} hari)` : 'Bulan belum mulai';
  const revPct = p.target ? n(p.realisasi) * 100 / n(p.target) : null;
  const costPct = n(b.anggaran) > 0 ? n(b.realisasi) * 100 / n(b.anggaran) : null;
  return <div className={s.sum}>
    <div className={s.block}>
      <div className={s.head}><b>Pendapatan</b><small>Target {p.target != null ? rp(p.target) : 'belum diisi'}</small></div>
      <strong>{rp(p.realisasi)}</strong>
      {p.target != null && <Bar value={n(p.realisasi)} max={n(p.target)} tone={revPct >= 100 ? 'good' : 'none'} />}
      <small>{revPct != null ? `${angka(Math.round(revPct))}% dari target` : 'Dari jurnal, sama dengan Laporan Keuangan'}{!sum.final && p.proyeksi != null ? ` · proyeksi ${rp(p.proyeksi)}` : ''}</small>
    </div>
    <div className={s.block}>
      <div className={s.head}><b>Biaya beranggaran</b><small>Anggaran {n(b.anggaran) > 0 ? rp(b.anggaran) : 'belum diisi'}</small></div>
      <strong>{rp(b.realisasi)}</strong>
      {n(b.anggaran) > 0 && <Bar value={n(b.realisasi)} max={n(b.anggaran)} tone={costPct >= 100 ? 'bad' : costPct >= 80 ? 'warn' : 'good'} />}
      <small>{costPct != null ? `${angka(Math.round(costPct))}% terpakai` : 'Pengeluaran tercatat (menu Pengeluaran — tanpa HPP & penyusutan)'}{!sum.final && b.proyeksi != null ? ` · proyeksi ${rp(b.proyeksi)}` : ''}{n(b.di_luar_anggaran) ? ` · di luar anggaran ${rp(b.di_luar_anggaran)}` : ''}</small>
    </div>
    {!compact || imp.total != null ? <div className={s.block}>
      <div className={s.head}><b>Dampak ke laba</b><small>{proj}</small></div>
      <strong className={imp.total < 0 ? s.neg : undefined}>{imp.total == null ? '—' : (imp.total > 0 ? '+' : '') + rp(imp.total)}</strong>
      <small>{imp.total == null ? 'Isi target pendapatan atau anggaran biaya untuk melihat dampaknya.'
        : [imp.rev != null && `pendapatan ${imp.rev >= 0 ? 'di atas' : 'di bawah'} target ${rp(Math.abs(imp.rev))}`,
           imp.cost != null && `biaya ${imp.cost > 0 ? 'melebihi' : 'di bawah'} anggaran ${rp(Math.abs(imp.cost))}`].filter(Boolean).join(' · ') + ' (di luar HPP)'}</small>
    </div> : null}
  </div>;
}

export default function BudgetPlan({ kosId, month, ver, onChanged }) {
  const [st, reload] = useBudgetSummary(kosId, month, ver);
  const [sheet, setSheet] = useState(null);
  const [busy, setBusy] = useState(false);
  if (!st) return <Loading rows={2} />;
  if (st.error) return <p className="notice bad">{/budget_summary/.test(errMsg(st.error)) ? 'Database sedang diperbarui. Coba lagi beberapa menit lagi.' : errMsg(st.error)}</p>;
  const sum = st.data;
  if (!sum.aktif) return null;
  const plan = sum.rencana;
  const status = plan?.status || 'draf';
  const [label, tone] = STATUS[status];
  const empty = !plan || (plan.revenue_target == null && !(n(sum.biaya?.anggaran) > 0));
  const act = async (fn, args, ok) => {
    if (busy) return false;
    setBusy(true);
    const { error } = await supabase.rpc(fn, { p_kos: kosId, p_month: month, ...args });
    setBusy(false);
    if (error) { toast(errMsg(error)); return false; }
    toast(ok); setSheet(null); await reload(); onChanged?.();
    return true;
  };
  return <section className={s.card} aria-label="Rencana & persetujuan anggaran">
    <div className={s.top}>
      <div><h2>Rencana {bulan(month.slice(0, 7))}</h2>
        <small>{plan?.revision ? `Revisi ke-${plan.revision} · ` : ''}{plan?.decided_at && status !== 'draf' ? `${STATUS[status][0]} oleh ${plan.decided_by || '—'} · ${tgl(String(plan.decided_at).slice(0, 10))}` : plan?.submitted_at && status === 'diajukan' ? `Diajukan ${plan.submitted_by || ''} · ${tgl(String(plan.submitted_at).slice(0, 10))}` : 'Susun target & anggaran, lalu ajukan ke pemilik.'}</small></div>
      <span className={s.badge} data-tone={tone}>{sum.terkunci ? 'Terkunci · tutup buku' : label}</span>
    </div>
    {status === 'ditolak' && plan?.decision_note && <p className={s.reject}>Alasan ditolak: {plan.decision_note}</p>}
    {plan?.note && <p className={s.note}>Catatan: {plan.note}</p>}
    <PlanSummary sum={sum} />
    {!sum.terkunci && <div className={s.acts}>
      <button onClick={() => setSheet('target')} disabled={busy}>{plan?.revenue_target != null ? 'Ubah target pendapatan' : 'Isi target pendapatan'}</button>
      {['draf', 'ditolak'].includes(status) && !sum.boleh_putuskan && <button className="primary" disabled={busy || empty} onClick={() => setSheet('submit')}>Ajukan ke pemilik</button>}
      {sum.boleh_putuskan && ['draf', 'diajukan'].includes(status) && <button className="primary" disabled={busy || empty} onClick={() => setSheet('approve')}>Setujui anggaran</button>}
      {sum.boleh_putuskan && status === 'diajukan' && <button disabled={busy} onClick={() => setSheet('reject')}>Tolak</button>}
    </div>}
    {sum.terkunci && <p className={s.note}>Bulan ini sudah tutup buku di Pembukuan, jadi anggarannya tidak bisa diubah lagi.</p>}
    {status === 'disetujui' && !sum.terkunci && <p className={s.note}>Mengubah anggaran yang sudah disetujui membuatnya kembali Draf (revisi tercatat) dan perlu disetujui ulang.</p>}
    {plan?.log?.length > 0 && <details className={s.log}><summary>Riwayat persetujuan ({plan.log.length})</summary>
      <ul>{[...plan.log].reverse().map((l, i) => <li key={i}><b>{EV[l.ev] || l.ev}</b> · {l.by || 'Sistem'} · {tgl(String(l.at).slice(0, 10))}{l.apa ? ` · ${l.apa}` : ''}{l.catatan ? ` — ${l.catatan}` : ''}</li>)}</ul></details>}

    {sheet === 'target' && <TargetSheet plan={plan} busy={busy} onClose={() => !busy && setSheet(null)}
      onSave={(target, note) => act('budget_target_save', { p_target: target, p_note: note }, target ? 'Target pendapatan disimpan' : 'Target pendapatan dihapus')} />}
    {sheet === 'submit' && <NoteSheet title="Ajukan anggaran" text="Pemilik akan melihat anggaran ini sebagai Menunggu persetujuan." cta="Ajukan" busy={busy}
      onClose={() => !busy && setSheet(null)} onSave={(note) => act('budget_submit', { p_note: note }, 'Anggaran diajukan')} />}
    {sheet === 'approve' && <NoteSheet title="Setujui anggaran" text={`Target ${plan?.revenue_target != null ? rp(plan.revenue_target) : '—'} · anggaran biaya ${rp(sum.biaya?.anggaran)}.`} cta="Setujui" busy={busy}
      onClose={() => !busy && setSheet(null)} onSave={(note) => act('budget_decide', { p_decision: 'setujui', p_note: note }, 'Anggaran disetujui')} />}
    {sheet === 'reject' && <NoteSheet title="Tolak anggaran" text="Tulis alasan agar penyusun tahu apa yang perlu diperbaiki." cta="Tolak" required busy={busy}
      onClose={() => !busy && setSheet(null)} onSave={(note) => act('budget_decide', { p_decision: 'tolak', p_note: note }, 'Anggaran ditolak')} />}
  </section>;
}

function TargetSheet({ plan, busy, onClose, onSave }) {
  const [value, setValue] = useState(plan?.revenue_target ? angka(plan.revenue_target) : '');
  const [note, setNote] = useState(plan?.note || '');
  const submit = () => {
    if ((value.trim() && (!/\d/.test(value) || /[-−]/.test(value))) || parseRp(value) > 999999999999) return toast('Nominal tidak valid');
    onSave(parseRp(value) || null, note);
  };
  return <Sheet title="Target pendapatan" onClose={onClose}>
    <Field label="Target pendapatan bulan ini (Rp)" hint="Pendapatan usaha dari Pembukuan, tanpa pendapatan lain. Kosongkan untuk menghapus."><input value={value} inputMode="numeric" disabled={busy} onChange={(e) => setValue(e.target.value)} /></Field>
    <Field label="Catatan (opsional)"><textarea value={note} maxLength={500} rows={2} disabled={busy} onChange={(e) => setNote(e.target.value)} /></Field>
    {plan?.status === 'disetujui' && <p className="small muted">Anggaran ini sudah disetujui. Menyimpan perubahan membuatnya kembali Draf.</p>}
    <button className="primary" disabled={busy} onClick={submit}>{busy ? 'Menyimpan…' : 'Simpan'}</button>
  </Sheet>;
}

function NoteSheet({ title, text, cta, required, busy, onClose, onSave }) {
  const [note, setNote] = useState('');
  return <Sheet title={title} onClose={onClose}>
    <p>{text}</p>
    <Field label={required ? 'Alasan' : 'Catatan (opsional)'}><textarea value={note} maxLength={500} rows={3} disabled={busy} onChange={(e) => setNote(e.target.value)} /></Field>
    <button className="primary" disabled={busy || (required && note.trim().length < 3)} onClick={() => onSave(note)}>{busy ? 'Menyimpan…' : cta}</button>
  </Sheet>;
}
