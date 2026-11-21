'use client';
// Dokumen penawaran proyek / perubahan scope: cetak (PDF), kirim WA, dan tindakan (ubah/revisi, tandai terkirim, keputusan klien, batal).
// Data dari prj_quote_get (izin settings/finance di server).
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { useKos } from '@/components/KosProvider';
import { Loading, Empty, run } from '@/components/ui';
import { rp, angka, tgl, waLink, errMsg } from '@/lib/format';
import { terbilang } from '@/lib/terbilang';
import { logoUrl } from '@/lib/logo';
import { QuoteForm, DecideSheet, qStatus } from '@/components/Penawaran';

export default function DokumenPenawaran() {
  const { id } = useParams();
  const router = useRouter();
  const { kosId, ver } = useKos();
  const [q, setQ] = useState(null);
  const [err, setErr] = useState(null);
  const [edit, setEdit] = useState(false);
  const [decide, setDecide] = useState(null);
  const [old, setOld] = useState(false);
  const load = () => supabase.rpc('prj_quote_get', { p_id: id }).then(({ data, error }) => (error ? (/tidak ditemukan/i.test(error.message) ? setQ({ missing: true }) : setErr(errMsg(error))) : (setErr(null), setQ(data))));
  useEffect(() => { load(); }, [id, ver]); // eslint-disable-line react-hooks/exhaustive-deps
  if (err) return <div className="notice bad">{/prj_quote_get|function/.test(err) ? 'Database sedang diperbarui. Coba lagi beberapa menit lagi.' : err}</div>;
  if (!q) return <Loading />;
  if (q.missing) return <Empty title="Penawaran tidak ditemukan" />;
  const b = q.business || {};
  const c = q.customer;
  const open = ['draf', 'terkirim'].includes(q.status);
  const can = q.allowed && open;
  const st = qStatus(q);
  const title = q.kind === 'perubahan' ? 'PERUBAHAN LINGKUP KERJA' : 'PENAWARAN';
  const msg = `Halo ${c?.name || ''}, berikut ${q.kind === 'perubahan' ? 'penawaran perubahan lingkup kerja' : 'penawaran'} ${q.number}${q.revision ? ` (revisi ${q.revision})` : ''} dari ${b.name}:\n\n${q.title}\n` +
    q.lines.map((l) => `• ${l.description} — ${angka(l.qty)}${l.unit ? ' ' + l.unit : ''} × ${rp(l.price)} = ${rp(l.amount)}`).join('\n') +
    (Number(q.discount) > 0 ? `\nPotongan ${rp(q.discount)}` : '') + `\n\nTotal ${rp(q.total)}` +
    (q.terms.length ? `\n\nTermin:\n${q.terms.map((t) => `• ${t.name}${t.pct != null ? ` (${angka(t.pct)}%)` : ''}: ${rp(t.amount)}`).join('\n')}` : '') +
    (q.revision_limit != null ? `\n\nTermasuk ${q.revision_limit} kali revisi.` : '') +
    (q.valid_until ? `\nBerlaku sampai ${tgl(q.valid_until)}.` : '') + `\n\nTerima kasih.`;
  const send = async () => { if (await run(() => supabase.rpc('prj_quote_send', { p_id: q.id }), 'Ditandai sudah dikirim', errMsg)) load(); };
  const cancel = async () => { const r = window.prompt('Alasan membatalkan penawaran ini:') || ''; if (r.trim().length < 3) return; if (await run(() => supabase.rpc('prj_quote_cancel', { p_id: q.id, p_reason: r }), 'Penawaran dibatalkan', errMsg)) load(); };
  return (
    <div className="stack" style={{ maxWidth: 760, margin: '0 auto' }}>
      <div className="row between noprint" style={{ flexWrap: 'wrap', gap: 8 }}>
        <Link href={q.project_id ? `/proyek/${q.project_id}` : '/proyek?tab=penawaran'}><button className="ghost">← {q.project_id ? 'Proyek' : 'Penawaran'}</button></Link>
        <div className="row" style={{ flexWrap: 'wrap' }}>
          {c?.phone && <a href={waLink(c.phone, msg)} target="_blank" rel="noreferrer" onClick={() => { if (q.status === 'draf' && q.allowed) send(); }}><button>Kirim WA</button></a>}
          <button className="primary" onClick={() => window.print()}>Cetak / PDF</button>
        </div>
      </div>

      <section className="panel noprint" style={{ gap: 8 }}>
        <div className="row between" style={{ flexWrap: 'wrap', gap: 8 }}>
          <span className={'chip ' + st[1]}>{st[0]}{q.revision > 0 ? ` · revisi ${q.revision}` : ''}</span>
          {q.project && <Link className="small" href={`/proyek/${q.project_id}`}>{q.project}</Link>}
        </div>
        {q.status === 'disetujui' && <span className="small">Disetujui klien{q.client_approver ? ` oleh ${q.client_approver}` : ''} · {tgl(q.client_approved_on)}{q.decision_note ? ` · ${q.decision_note}` : ''}</span>}
        {['ditolak', 'batal'].includes(q.status) && q.decision_note && <span className="small">Alasan: {q.decision_note}</span>}
        {open && !q.allowed && <span className="small muted">Paket bisnis ini belum mencakup Proyek (mulai Paket Bisnis). Penawaran masih bisa dibuka & dibatalkan.</span>}
        {open && <div className="row" style={{ flexWrap: 'wrap', gap: 6 }}>
          {can && <button className="sm" onClick={() => setEdit(true)}>{q.status === 'terkirim' ? 'Revisi' : 'Ubah'}</button>}
          {can && q.status === 'draf' && <button className="sm" onClick={send}>Tandai sudah dikirim</button>}
          {can && q.can_decide && <button className="sm primary" onClick={() => setDecide('disetujui')}>Klien setuju</button>}
          {can && q.can_decide && <button className="sm" onClick={() => setDecide('ditolak')}>Klien menolak</button>}
          <button className="sm ghost danger" onClick={cancel}>Batalkan</button>
        </div>}
        {open && q.allowed && !q.can_decide && <span className="small muted">Keputusan klien dicatat oleh pemilik atau pengelola.</span>}
        {q.history.length > 0 && <button className="sm ghost" style={{ alignSelf: 'flex-start' }} onClick={() => setOld(!old)}>{old ? 'Sembunyikan' : 'Lihat'} versi sebelumnya ({q.history.length})</button>}
        {old && <div className="list">{[...q.history].reverse().map((h) => (
          <div className="li" key={h.revision} style={{ flexDirection: 'column', alignItems: 'flex-start' }}>
            <b className="small">{h.revision === 0 ? 'Versi asli' : `Revisi ${h.revision}`} · {rp(h.total)}</b>
            <span className="small muted">diganti {new Date(h.at).toLocaleString('id-ID', { timeZone: 'Asia/Jakarta', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })} oleh {h.by}</span>
            <span className="small">{h.lines.map((l) => `${l.description} ${angka(l.qty)}${l.unit ? ' ' + l.unit : ''} × ${rp(l.price)}`).join(' · ')}</span>
          </div>))}</div>}
      </section>
      <p className="small muted noprint" style={{ margin: 0 }}>Pilih "Simpan sebagai PDF" di jendela cetak untuk mendapat file PDF.</p>

      <section className="panel gdoc" style={{ gap: 14 }}>
        <div className="row between" style={{ alignItems: 'flex-start', flexWrap: 'nowrap', gap: 12 }}>
          <div className="row" style={{ flexWrap: 'nowrap', gap: 10, minWidth: 0, alignItems: 'flex-start' }}>
            {logoUrl(b.logo) && <img src={logoUrl(b.logo)} alt="" width={44} height={44} style={{ borderRadius: 8, objectFit: 'cover', flex: 'none' }} />}
            <div style={{ minWidth: 0 }}><b style={{ fontSize: 17 }}>{b.name}</b>
              {b.address && <div className="small muted">{b.address}</div>}
              {b.phone && <div className="small muted">WA {b.phone}</div>}</div>
          </div>
          <div style={{ textAlign: 'right', flex: 'none', maxWidth: '50%' }}><div style={{ fontWeight: 800, fontSize: 17, letterSpacing: '.02em' }}>{title}</div>
            <div className="small">No. <b>{q.number}</b>{q.revision > 0 ? ` · Rev. ${q.revision}` : ''}</div><div className="small muted">{tgl(q.quote_date)}</div></div>
        </div>

        <div className="gdoc-two">
          <div><span className="label">Kepada</span><div><b>{c?.name || '—'}</b></div>
            {c?.address && <div className="small">{c.address}</div>}{c?.phone && <div className="small muted">{c.phone}</div>}</div>
          <dl className="kv small" style={{ alignContent: 'start' }}>
            <dt>Pekerjaan</dt><dd>{q.title}</dd>
            {q.project && q.kind === 'perubahan' && <><dt>Proyek</dt><dd>{q.project}</dd></>}
            {(q.start_date || q.end_date) && <><dt>{q.kind === 'perubahan' ? 'Selesai baru' : 'Jadwal'}</dt><dd>{q.kind === 'perubahan' ? tgl(q.end_date) : `${q.start_date ? tgl(q.start_date) : '…'} – ${q.end_date ? tgl(q.end_date) : '…'}`}</dd></>}
            {q.valid_until && <><dt>Berlaku sampai</dt><dd>{tgl(q.valid_until)}</dd></>}
          </dl>
        </div>

        <table className="gdoc-t">
          <thead><tr><th>No</th><th>Uraian</th><th className="r">Jumlah</th><th className="r">Harga</th><th className="r">Subtotal</th></tr></thead>
          <tbody>{q.lines.map((l, i) => <tr key={l.id}><td>{i + 1}</td><td style={{ overflowWrap: 'anywhere' }}>{l.description}</td><td className="r">{angka(l.qty)}{l.unit ? ` ${l.unit}` : ''}</td><td className="r">{angka(l.price)}</td><td className="r">{angka(l.amount)}</td></tr>)}</tbody>
          <tfoot>
            {Number(q.discount) > 0 && <><tr><td colSpan={4} className="r">Subtotal</td><td className="r">{angka(q.subtotal)}</td></tr><tr><td colSpan={4} className="r">Potongan</td><td className="r">−{angka(q.discount)}</td></tr></>}
            <tr><td colSpan={4} className="r"><b>Total</b></td><td className="r"><b>{angka(q.total)}</b></td></tr>
          </tfoot>
        </table>
        <div className="small"><i>Terbilang: {terbilang(Number(q.total))} rupiah</i></div>

        {q.terms.length > 0 && <div><span className="label">Termin pembayaran</span>
          <table className="gdoc-t"><tbody>{q.terms.map((t, i) => <tr key={i}><td>{i + 1}</td><td>{t.name}{t.pct != null ? ` (${angka(t.pct)}%)` : ''}</td><td className="r">{angka(t.amount)}</td></tr>)}</tbody></table></div>}
        {q.scope_in && <div className="small"><b>Termasuk:</b><div style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{q.scope_in}</div></div>}
        {q.scope_out && <div className="small"><b>Tidak termasuk:</b><div style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{q.scope_out}</div></div>}
        {q.client_duties && <div className="small"><b>Kewajiban klien:</b><div style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{q.client_duties}</div></div>}
        {(q.revision_limit != null || q.extra_revision) && <div className="small"><b>Revisi:</b> {q.revision_limit != null ? `termasuk ${q.revision_limit} kali revisi` : ''}{q.revision_limit != null && q.extra_revision ? '; ' : ''}{q.extra_revision}</div>}
        {q.note && <div className="small" style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>Catatan: {q.note}</div>}
        <div className="small muted">Perubahan pekerjaan di luar lingkup di atas akan diajukan sebagai penawaran perubahan tersendiri.</div>

        <div className="gdoc-sign">
          <div><span className="small">Disetujui klien</span><div className="gdoc-line">{q.status === 'disetujui' ? q.client_approver || '' : ''}</div></div>
          <div><span className="small">Hormat kami,</span><div className="gdoc-line">{b.name}</div></div>
        </div>
        {b.footer && <div className="small muted" style={{ textAlign: 'center', whiteSpace: 'pre-wrap' }}>{b.footer}</div>}
      </section>
      {edit && <QuoteForm kosId={kosId} init={q} onClose={() => setEdit(false)} onDone={() => { setEdit(false); load(); }} />}
      {decide && <DecideSheet q={q} to={decide} onClose={() => setDecide(null)} onDone={(r) => { setDecide(null); if (decide === 'disetujui' && r?.project_id) router.push(`/proyek/${r.project_id}`); else load(); }} />}
    </div>
  );
}
