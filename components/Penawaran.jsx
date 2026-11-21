'use client';
// Penawaran proyek & perubahan scope (Tahap 1B). Server penentu akhir: prj_quote_save menghitung ulang subtotal, potongan,
// total, dan nominal termin — angka di formulir ini hanya pratinjau.
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { Sheet, Field, run, toast } from '@/components/ui';
import { angka, parseRp, rp, tgl, today, errMsg } from '@/lib/format';
import { KIND, defaultKind } from '@/components/Proyek';
import { useKos } from '@/components/KosProvider';

export const Q_STATUS = { draf: ['Draf', 'void'], terkirim: ['Terkirim', 'info'], disetujui: ['Disetujui', 'good'], ditolak: ['Ditolak', 'bad'], batal: ['Batal', 'void'] };
export const qStatus = (q) => (q.expired ? ['Lewat masa berlaku', 'gold'] : Q_STATUS[q.status] || [q.status, 'void']);
const PRESET = [['100', [['Lunas', 100]]], ['50/50', [['DP', 50], ['Pelunasan', 50]]], ['30/40/30', [['DP', 30], ['Progres', 40], ['Pelunasan', 30]]]];
const num = (v) => { const n = parseFloat(String(v ?? '').replace(',', '.')); return isFinite(n) ? n : 0; };

// init: penawaran (ubah) | { kind, project } (baru). project = proyek terkait (perubahan scope / proyek yang masih penawaran)
export function QuoteForm({ kosId, init, onClose, onDone }) {
  const edit = init?.id ? init : null;
  const project = init?.project || null;
  const kind = edit?.kind || init?.kind || 'awal';
  const { kos } = useKos();
  const [clients, setClients] = useState(null);
  const [f, setF] = useState(() => ({
    title: edit?.title || (kind === 'perubahan' ? '' : project?.name || ''), project_kind: edit?.project_kind || project?.kind || defaultKind(kos),
    contact_id: edit?.contact_id || project?.contact_id || '', newClient: false, client_name: '', client_phone: '',
    valid_until: edit?.valid_until || '', start_date: edit?.start_date || project?.start_date || '', end_date: edit?.end_date || '',
    lines: edit?.lines?.length ? edit.lines.map((l) => ({ description: l.description, qty: String(Number(l.qty)), unit: l.unit || '', price: angka(l.price) })) : [{ description: '', qty: '1', unit: '', price: '' }],
    discount: edit && Number(edit.discount) > 0 ? angka(edit.discount) : '',
    termMode: edit?.terms?.length && edit.terms[0].pct == null ? 'nominal' : 'persen',
    terms: edit?.terms?.length ? edit.terms.map((t) => ({ name: t.name, pct: t.pct != null ? String(t.pct) : '', amount: angka(t.amount) })) : [],
    scope_in: edit?.scope_in || '', scope_out: edit?.scope_out || '', client_duties: edit?.client_duties || '',
    revision_limit: edit?.revision_limit != null ? String(edit.revision_limit) : '', extra_revision: edit?.extra_revision || '', note: edit?.note || '',
  }));
  const [busy, setBusy] = useState(false);
  const set = (k, v) => setF((x) => ({ ...x, [k]: v }));
  const setLine = (i, k, v) => setF((x) => ({ ...x, lines: x.lines.map((l, j) => (j === i ? { ...l, [k]: v } : l)) }));
  const setTerm = (i, k, v) => setF((x) => ({ ...x, terms: x.terms.map((t, j) => (j === i ? { ...t, [k]: v } : t)) }));
  const needClient = kind === 'awal' && !project;
  useEffect(() => {
    if (!needClient) return;
    supabase.rpc('prj_form_options', { p_kos: kosId }).then(({ data }) => { const c = data?.clients || []; setClients(c); if (!edit && c.length === 0) set('newClient', true); });
  }, [kosId]); // eslint-disable-line react-hooks/exhaustive-deps
  const sub = f.lines.reduce((a, l) => a + num(l.qty) * parseRp(l.price), 0);
  const disc = parseRp(f.discount);
  const total = Math.max(sub - disc, 0);
  const pctSum = f.terms.reduce((a, t) => a + num(t.pct), 0);
  const amtSum = f.terms.reduce((a, t) => a + parseRp(t.amount), 0);
  const termOk = f.terms.length === 0 || (f.termMode === 'persen' ? Math.abs(pctSum - 100) < 0.01 : amtSum === total);
  const save = async () => {
    if (f.title.trim().length < 2) return toast('Isi judul penawaran.');
    const lines = f.lines.filter((l) => l.description.trim() || parseRp(l.price));
    if (!lines.length) return toast('Isi minimal satu baris pekerjaan.');
    if (lines.some((l) => !l.description.trim())) return toast('Setiap baris harus punya uraian.');
    if (lines.some((l) => !(num(l.qty) > 0))) return toast('Jumlah tiap baris harus lebih dari 0.');
    if (disc > sub) return toast('Potongan lebih besar dari subtotal.');
    if (!termOk) return toast(f.termMode === 'persen' ? `Jumlah persen termin harus 100% (sekarang ${pctSum}%).` : `Jumlah termin harus sama dengan total ${rp(total)}.`);
    const p = {
      kind, project_id: project?.id || null, title: f.title.trim(), project_kind: f.project_kind, valid_until: f.valid_until || null,
      start_date: kind === 'awal' ? f.start_date || null : null, end_date: f.end_date || null, discount: disc,
      lines: lines.map((l) => ({ description: l.description.trim(), qty: num(l.qty), unit: l.unit.trim(), price: parseRp(l.price) })),
      terms: f.terms.filter((t) => t.name.trim()).map((t) => (f.termMode === 'persen' ? { name: t.name.trim(), pct: num(t.pct) } : { name: t.name.trim(), amount: parseRp(t.amount) })),
      scope_in: f.scope_in, scope_out: f.scope_out, client_duties: f.client_duties, revision_limit: f.revision_limit === '' ? null : parseInt(f.revision_limit, 10),
      extra_revision: f.extra_revision, note: f.note,
      ...(needClient ? (f.newClient ? { client_name: f.client_name.trim(), client_phone: f.client_phone.trim() } : { contact_id: f.contact_id || null }) : {}),
    };
    setBusy(true);
    let id = null;
    const ok = await run(async () => { const r = await supabase.rpc('prj_quote_save', { p_kos: kosId, p_id: edit?.id || null, p_data: p }); id = r.data; return r; },
      edit ? (edit.status === 'terkirim' ? 'Disimpan sebagai revisi — kirim ulang ke klien' : 'Penawaran disimpan') : 'Penawaran dibuat', errMsg);
    setBusy(false);
    if (ok) onDone(id);
  };
  const title = edit ? `Ubah ${edit.number}` : kind === 'perubahan' ? 'Perubahan scope' : 'Penawaran baru';
  return (
    <Sheet title={title} onClose={onClose}>
      {edit?.status === 'terkirim' && <div className="notice">Penawaran ini sudah dikirim. Menyimpan perubahan = <b>revisi {edit.revision + 1}</b>; isi lama tetap tersimpan di riwayat, lalu kirim ulang ke klien.</div>}
      {kind === 'perubahan' && <span className="small muted">Untuk pekerjaan tambahan di proyek <b>{project?.number} · {project?.name}</b>. Bila disetujui klien: nilai kontrak bertambah, batas revisi bertambah, dan termin tambahan menjadi milestone.</span>}
      <Field label={kind === 'perubahan' ? 'Judul perubahan' : 'Judul / nama proyek'}><input value={f.title} maxLength={120} onChange={(e) => set('title', e.target.value)} placeholder={kind === 'perubahan' ? 'mis. Tambahan versi 30 detik untuk Instagram' : 'mis. Wedding Andi & Sari, Video profil PT Maju'} /></Field>
      {kind === 'awal' && !project && <Field label="Jenis proyek"><div className="seg">{Object.entries(KIND).map(([k, l]) => <button type="button" key={k} className={f.project_kind === k ? 'on' : ''} onClick={() => set('project_kind', k)}>{l}</button>)}</div></Field>}
      {needClient && <>
        <span className="label">Klien</span>
        {clients && clients.length > 0 && <div className="seg">{[[false, 'Pilih pelanggan'], [true, 'Klien baru']].map(([k, l]) => <button type="button" key={String(k)} className={f.newClient === k ? 'on' : ''} onClick={() => set('newClient', k)}>{l}</button>)}</div>}
        {f.newClient ? <div className="row">
          <Field label="Nama klien"><input value={f.client_name} maxLength={80} onChange={(e) => set('client_name', e.target.value)} placeholder="orang atau perusahaan" /></Field>
          <Field label="No. HP / WA"><input inputMode="tel" value={f.client_phone} maxLength={20} onChange={(e) => set('client_phone', e.target.value)} /></Field>
        </div> : <Field label="Pelanggan"><select value={f.contact_id} onChange={(e) => set('contact_id', e.target.value)}><option value="">— pilih —</option>{(clients || []).map((c) => <option key={c.id} value={c.id}>{c.name}{c.phone ? ` · ${c.phone}` : ''}</option>)}</select></Field>}
      </>}

      <span className="label">Rincian pekerjaan</span>
      {f.lines.map((l, i) => (
        <div className="unitbox" key={i} style={{ gap: 8 }}>
          <Field label={`Uraian ${i + 1}`}><input value={l.description} maxLength={300} onChange={(e) => setLine(i, 'description', e.target.value)} placeholder="mis. Dekorasi pelaminan, Editing video 2 menit" /></Field>
          <div className="row">
            <Field label="Jumlah"><input inputMode="decimal" value={l.qty} onChange={(e) => setLine(i, 'qty', e.target.value)} /></Field>
            <Field label="Satuan"><input value={l.unit} maxLength={20} onChange={(e) => setLine(i, 'unit', e.target.value)} placeholder="paket, hari, orang" /></Field>
            <Field label="Harga satuan"><input inputMode="numeric" value={l.price} onChange={(e) => setLine(i, 'price', e.target.value)} placeholder="0" /></Field>
          </div>
          <div className="row between small"><span className="muted">Subtotal</span><b>{rp(num(l.qty) * parseRp(l.price))}</b></div>
          {f.lines.length > 1 && <button type="button" className="sm ghost danger" onClick={() => set('lines', f.lines.filter((_, j) => j !== i))}>Hapus baris</button>}
        </div>))}
      <button type="button" className="sm" onClick={() => set('lines', [...f.lines, { description: '', qty: '1', unit: '', price: '' }])}>+ Baris pekerjaan</button>
      <Field label="Potongan (opsional)"><input inputMode="numeric" value={f.discount} onChange={(e) => set('discount', e.target.value)} placeholder="0" /></Field>
      <dl className="kv"><dt>Subtotal</dt><dd>{rp(sub)}</dd>{disc > 0 && <><dt>Potongan</dt><dd>−{rp(disc)}</dd></>}<dt>Total penawaran</dt><dd>{rp(total)}</dd></dl>
      <span className="small muted">Tanpa PPN (harga akhir). Total dihitung ulang oleh server saat disimpan.</span>

      <span className="label">Termin pembayaran (opsional)</span>
      <div className="row" style={{ flexWrap: 'wrap', gap: 6 }}>
        {PRESET.map(([l, ts]) => <button type="button" key={l} className="sm" onClick={() => setF((x) => ({ ...x, termMode: 'persen', terms: ts.map(([name, pct]) => ({ name, pct: String(pct), amount: '' })) }))}>{l}</button>)}
        <div className="seg">{[['persen', '%'], ['nominal', 'Rp']].map(([k, l]) => <button type="button" key={k} className={f.termMode === k ? 'on' : ''} onClick={() => set('termMode', k)}>{l}</button>)}</div>
      </div>
      {f.terms.map((t, i) => (
        <div className="row" key={i} style={{ alignItems: 'flex-end', flexWrap: 'nowrap', gap: 8 }}>
          <Field label={`Termin ${i + 1}`}><input value={t.name} maxLength={80} onChange={(e) => setTerm(i, 'name', e.target.value)} placeholder="mis. DP, Hari H, Pelunasan" /></Field>
          {f.termMode === 'persen'
            ? <Field label="%"><input inputMode="decimal" value={t.pct} onChange={(e) => setTerm(i, 'pct', e.target.value)} style={{ maxWidth: 80 }} /></Field>
            : <Field label="Rp"><input inputMode="numeric" value={t.amount} onChange={(e) => setTerm(i, 'amount', e.target.value)} style={{ maxWidth: 140 }} /></Field>}
          <button type="button" className="sm ghost" aria-label="Hapus termin" onClick={() => set('terms', f.terms.filter((_, j) => j !== i))}>✕</button>
        </div>))}
      <button type="button" className="sm" onClick={() => set('terms', [...f.terms, { name: '', pct: '', amount: '' }])}>+ Termin</button>
      {f.terms.length > 0 && <span className="small" style={{ color: termOk ? 'var(--muted)' : 'var(--bad)' }}>{f.termMode === 'persen' ? `Jumlah ${pctSum}% dari 100%` : `Jumlah ${rp(amtSum)} dari ${rp(total)}`}{f.termMode === 'persen' && termOk && total > 0 ? ` · ${f.terms.map((t) => `${t.name || '…'} ${rp(Math.round(total * num(t.pct) / 100))}`).join(' · ')}` : ''}</span>}
      <span className="small muted">Saat disetujui klien, tiap termin menjadi milestone proyek (rencana; penagihan menyusul).</span>

      <span className="label">Scope & ketentuan</span>
      <Field label="Termasuk dalam pekerjaan"><textarea rows={3} value={f.scope_in} maxLength={3000} onChange={(e) => set('scope_in', e.target.value)} placeholder="mis. konsep, 1 hari shooting, editing 2 menit, musik berlisensi" /></Field>
      <Field label="Tidak termasuk"><textarea rows={2} value={f.scope_out} maxLength={3000} onChange={(e) => set('scope_out', e.target.value)} placeholder="mis. talent, sewa lokasi, biaya perjalanan luar kota" /></Field>
      <Field label="Kewajiban klien (opsional)"><textarea rows={2} value={f.client_duties} maxLength={2000} onChange={(e) => set('client_duties', e.target.value)} placeholder="mis. menyediakan logo & materi paling lambat H-7" /></Field>
      <div className="row">
        <Field label="Batas revisi" hint="kosong = tidak dibatasi"><input inputMode="numeric" value={f.revision_limit} onChange={(e) => set('revision_limit', e.target.value.replace(/\D/g, '').slice(0, 2))} placeholder="mis. 2" /></Field>
        <Field label="Berlaku sampai (opsional)"><input type="date" value={f.valid_until} min={today()} onChange={(e) => set('valid_until', e.target.value)} /></Field>
      </div>
      <Field label="Revisi tambahan (opsional)"><input value={f.extra_revision} maxLength={300} onChange={(e) => set('extra_revision', e.target.value)} placeholder="mis. revisi berikutnya Rp 500.000 per revisi" /></Field>
      <div className="row">
        {kind === 'awal' && <Field label="Rencana mulai"><input type="date" value={f.start_date} onChange={(e) => set('start_date', e.target.value)} /></Field>}
        <Field label={kind === 'perubahan' ? 'Tanggal selesai baru (opsional)' : 'Rencana selesai'}><input type="date" value={f.end_date} min={f.start_date || undefined} onChange={(e) => set('end_date', e.target.value)} /></Field>
      </div>
      <Field label="Catatan (opsional)"><textarea rows={2} value={f.note} maxLength={1000} onChange={(e) => set('note', e.target.value)} /></Field>
      <button className="cta" disabled={busy} onClick={save}>{busy ? 'Menyimpan…' : 'Simpan'}</button>
    </Sheet>
  );
}

// Keputusan klien: disetujui (nama penyetuju & tanggal) / ditolak (alasan)
export function DecideSheet({ q, to, onClose, onDone }) {
  const [f, setF] = useState({ client_approver: '', client_approved_on: today(), note: '' });
  const [busy, setBusy] = useState(false);
  const go = async () => {
    setBusy(true);
    let res = null;
    const ok = await run(async () => { const r = await supabase.rpc('prj_quote_decide', { p_id: q.id, p_decision: to, p: f }); res = r.data; return r; },
      to === 'disetujui' ? (q.kind === 'perubahan' ? 'Perubahan scope disetujui' : 'Disetujui — proyek siap dikerjakan') : 'Penawaran ditolak', errMsg);
    setBusy(false);
    if (ok) onDone(res);
  };
  return (
    <Sheet title={to === 'disetujui' ? 'Klien menyetujui' : 'Klien menolak'} onClose={onClose}>
      <p className="small" style={{ margin: 0 }}>{q.number} · {q.title} · <b>{rp(q.total)}</b></p>
      {to === 'disetujui' ? <>
        <div className="notice">{q.kind === 'perubahan' ? 'Nilai kontrak proyek bertambah, batas revisi bertambah, tanggal selesai bergeser (bila diisi), dan termin tambahan menjadi milestone.'
          : q.project_id ? 'Proyek dijalankan dengan nilai kontrak, batas revisi, dan milestone dari termin penawaran ini.' : 'Proyek baru dibuat otomatis dengan nilai kontrak, jadwal, batas revisi, dan milestone dari termin penawaran ini.'}</div>
        {q.expired && <div className="notice">Masa berlaku penawaran sudah lewat. Tetap bisa disetujui bila klien memang setuju dengan harga ini.</div>}
        <Field label="Disetujui oleh (opsional)" hint="nama & jabatan penanda tangan di pihak klien"><input value={f.client_approver} maxLength={80} onChange={(e) => setF({ ...f, client_approver: e.target.value })} placeholder="mis. Bu Rina, Marketing PT Maju" /></Field>
        <Field label="Tanggal persetujuan"><input type="date" value={f.client_approved_on} max={today()} onChange={(e) => setF({ ...f, client_approved_on: e.target.value })} /></Field>
      </> : <Field label="Alasan (opsional)"><input value={f.note} maxLength={300} onChange={(e) => setF({ ...f, note: e.target.value })} placeholder="mis. harga di atas anggaran klien" /></Field>}
      {to === 'disetujui' && <Field label="Catatan (opsional)"><input value={f.note} maxLength={300} onChange={(e) => setF({ ...f, note: e.target.value })} placeholder="mis. disetujui lewat email 21/11" /></Field>}
      <button className={to === 'ditolak' ? 'cta danger' : 'cta'} disabled={busy} onClick={go}>{busy ? 'Menyimpan…' : to === 'disetujui' ? 'Catat persetujuan' : 'Catat penolakan'}</button>
    </Sheet>
  );
}

export const tglPendek = (d) => (d ? tgl(d) : '—');
