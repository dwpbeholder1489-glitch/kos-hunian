'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { useKos } from '@/components/KosProvider';
import { Loading, Empty, Field, toast } from '@/components/ui';
import { tgl, errMsg } from '@/lib/format';
import { ADMIN_TEMPLATES, fillAdmin } from '@/lib/adminTemplates';
import { can, TYPE_ICON, ADM_ST, PRIO, loadTemplates } from '@/lib/admin';
import { CAT } from '@/components/Tickets';

const when = (ts) => { const s = String(ts); return `${tgl(s.slice(0, 10))} ${new Date(s).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Jakarta' })}`; };

// Percakapan satu tiket: balas pelanggan, catatan internal, status, prioritas, penanggung jawab
export default function TiketDetail() {
  const { id } = useParams();
  const { adminMe } = useKos();
  const [d, setD] = useState(null);
  const [err, setErr] = useState(null);
  const [msg, setMsg] = useState('');
  const [internal, setInternal] = useState(false);
  const [tpls, setTpls] = useState([]);
  const [busy, setBusy] = useState(false);
  const load = () => supabase.rpc('admin_ticket', { p_ticket: id }).then(({ data, error }) => (error ? setErr(errMsg(error)) : setD(data)));
  useEffect(() => { if (can(adminMe, 'tickets.view')) { load(); loadTemplates(supabase, ADMIN_TEMPLATES).then(setTpls); } }, [id, adminMe]);
  if (!can(adminMe, 'tickets.view')) return <Empty title="Tidak punya izin melihat tiket" />;
  if (err) return <div className="notice bad">{err}</div>;
  if (!d) return <Loading />;
  if (!d.ticket) return <Empty title="Tiket tidak ditemukan" />;
  const t = d.ticket;
  const canReply = can(adminMe, 'tickets.reply');

  const send = async () => {
    setBusy(true);
    const { error } = await supabase.rpc('admin_ticket_reply', { p_ticket: id, p_body: msg, p_internal: internal });
    if (error) { setBusy(false); return toast(errMsg(error)); }
    if (!internal) {
      try { const { data: s } = await supabase.auth.getSession(); await fetch('/api/tickets/notify', { method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer ' + s.session?.access_token }, body: JSON.stringify({ ticketId: id, event: 'staff_reply' }) }); } catch {}
    }
    setBusy(false); setMsg(''); toast(internal ? 'Catatan internal disimpan' : 'Balasan terkirim ke pelanggan'); load();
  };
  const update = async (patch) => {
    const { error } = await supabase.rpc('admin_ticket_update', { p_ticket: id, p_status: patch.status ?? null, p_priority: patch.priority ?? null, p_assign: patch.assign ?? null });
    if (error) return toast(errMsg(error));
    toast('Tiket diperbarui'); load();
  };

  return (
    <div className="stack">
      <Link href="/admin/tiket" className="small">← Semua tiket</Link>
      <h2>{t.subject}</h2>
      <span className="small muted">{t.number} · {CAT[t.category]} · dibuat {when(t.created_at)}{t.first_response_at ? ` · dibalas pertama ${when(t.first_response_at)}` : ''}</span>
      <section className="panel">
        <div className="list">
          <div className="li"><span className="small muted">Bisnis</span><Link href={`/admin/pelanggan/${t.kos_id}`} className="small"><b>{TYPE_ICON[t.business_type]} {t.kos_name}</b></Link></div>
          <div className="li"><span className="small muted">Pemilik</span><b className="small">{t.owner_email}</b></div>
        </div>
        {canReply && <div className="row">
          <Field label="Status"><select value={t.status} onChange={(e) => update({ status: e.target.value })}>{Object.entries(ADM_ST).map(([k, [l]]) => <option key={k} value={k}>{l}</option>)}</select></Field>
          <Field label="Prioritas"><select value={t.priority} onChange={(e) => update({ priority: e.target.value })}>{Object.entries(PRIO).map(([k, [l]]) => <option key={k} value={k}>{l}</option>)}</select></Field>
          <Field label="Ditangani oleh"><select value={t.assigned_to || ''} onChange={(e) => update({ assign: e.target.value })}><option value="">— belum —</option>{[...new Set([t.assigned_to, adminMe.email].filter(Boolean))].map((e) => <option key={e} value={e}>{e}</option>)}</select></Field>
        </div>}
      </section>

      <section className="panel">
        <h3>Percakapan</h3>
        <div className="stack" style={{ gap: 8 }}>{d.messages.map((m, i) => (
          <div key={i} className={'bubble ' + (m.kind === 'customer' ? 'them' : m.kind === 'note' ? 'note' : 'me')} style={{ alignSelf: m.kind === 'customer' ? 'flex-start' : 'flex-end' }}>
            <span className="small muted">{m.kind === 'customer' ? 'Pelanggan' : m.kind === 'note' ? `Catatan internal · ${m.author}` : `Tim · ${m.author}`} · {when(m.at)}</span>
            <div style={{ whiteSpace: 'pre-wrap' }}>{m.body}</div>
          </div>
        ))}</div>
        {canReply && t.status !== 'closed' && <>
          <div className="seg">{[[false, 'Balas pelanggan'], [true, 'Catatan internal']].map(([v, l]) => <button key={l} className={internal === v ? 'on' : ''} onClick={() => setInternal(v)}>{l}</button>)}</div>
          {!internal && tpls.length > 0 && <select aria-label="Pakai template" value="" onChange={(e) => { const x = tpls.find((y) => String(y.id) === e.target.value); if (x) setMsg(fillAdmin(x.body, { name: t.kos_name, owner_email: t.owner_email })); }}>
            <option value="">Pakai template balasan…</option>{tpls.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select>}
          <textarea value={msg} onChange={(e) => setMsg(e.target.value)} style={{ minHeight: 110 }} placeholder={internal ? 'Hanya terlihat oleh tim' : 'Balasan untuk pelanggan (juga dikirim ke email mereka)'} aria-label="Pesan" />
          <button className="primary" onClick={send} disabled={busy || !msg.trim()}>{busy ? 'Mengirim…' : internal ? 'Simpan catatan' : 'Kirim balasan'}</button>
        </>}
      </section>
    </div>
  );
}
