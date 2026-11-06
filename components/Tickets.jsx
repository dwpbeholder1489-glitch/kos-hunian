'use client';
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useKos } from '@/components/KosProvider';
import { Sheet, Field, toast } from '@/components/ui';
import { tgl, errMsg } from '@/lib/format';

export const CAT = { login: 'Kendala masuk / akun', data: 'Data salah / hilang', langganan: 'Pembayaran & langganan', fitur: 'Cara pakai fitur', bug: 'Error / aplikasi bermasalah', bantuan: 'Permintaan lain' };
export const TST = { open: ['Terkirim', 'gold'], in_progress: ['Sedang ditangani', 'info'], waiting: ['Dibalas tim', 'good'], resolved: ['Selesai', 'good'], closed: ['Ditutup', 'void'] };
const when = (ts) => { const s = String(ts); return `${tgl(s.slice(0, 10))} ${new Date(s).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Jakarta' })}`; };
const notify = async (ticketId, event) => {
  try { const { data } = await supabase.auth.getSession(); await fetch('/api/tickets/notify', { method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer ' + data.session?.access_token }, body: JSON.stringify({ ticketId, event }) }); } catch {}
};

// Tiket bantuan dari pemilik bisnis: buat, lihat balasan, balas
export default function Tickets() {
  const { kosId } = useKos();
  const [rows, setRows] = useState(null);
  const [form, setForm] = useState(false);
  const [open, setOpen] = useState(null);
  const load = () => supabase.rpc('my_tickets', { p_kos: kosId }).then(({ data, error }) => setRows(error ? [] : data || []));
  useEffect(() => { if (kosId) load(); }, [kosId]);
  const unread = (rows || []).filter((t) => t.status === 'waiting').length;
  return (
    <section className="panel" id="tiket">
      <div className="row between"><h3>Tiket bantuan {unread > 0 && <span className="chip good">{unread} dibalas</span>}</h3><button className="sm primary" onClick={() => setForm(true)}>Laporkan masalah</button></div>
      <p className="small muted" style={{ margin: 0 }}>Ceritakan kendalanya; tim PRASARA membalas di sini dan lewat email. Riwayat percakapan tersimpan.</p>
      {rows && rows.length > 0 && <div className="list">{rows.map((t) => (
        <button key={t.id} className="li click" onClick={() => setOpen(t)} style={{ background: 'none', border: 0, borderTop: '1px solid var(--line)', borderRadius: 0, textAlign: 'left', width: '100%', font: 'inherit', color: 'inherit' }}>
          <div className="main"><b className="small">{t.subject}</b><span className="small muted">{t.number} · {CAT[t.category]} · {tgl(String(t.updated_at).slice(0, 10))}</span></div>
          <span className={'chip ' + TST[t.status][1]}>{TST[t.status][0]}</span>
        </button>
      ))}</div>}
      {form && <NewTicket kosId={kosId} onClose={() => setForm(false)} onDone={(id) => { setForm(false); notify(id, 'created'); load(); }} />}
      {open && <TicketView t={open} onClose={() => setOpen(null)} onChanged={async () => { const { data } = await supabase.rpc('my_tickets', { p_kos: kosId }); setRows(data || []); setOpen((data || []).find((x) => x.id === open.id) || null); }} />}
    </section>
  );
}

function NewTicket({ kosId, onClose, onDone }) {
  const [cat, setCat] = useState('fitur');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  const send = async () => {
    if (subject.trim().length < 3) return toast('Isi judul singkat.');
    if (body.trim().length < 5) return toast('Ceritakan masalahnya.');
    setBusy(true);
    const { data, error } = await supabase.rpc('ticket_create', { p_kos: kosId, p_category: cat, p_subject: subject, p_body: body });
    setBusy(false);
    if (error) return toast(errMsg(error));
    toast(`Tiket ${data.number} terkirim`);
    onDone(data.id);
  };
  return (
    <Sheet title="Laporkan masalah" onClose={onClose}>
      <Field label="Jenis masalah"><select value={cat} onChange={(e) => setCat(e.target.value)}>{Object.entries(CAT).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></Field>
      <Field label="Judul singkat"><input value={subject} maxLength={120} onChange={(e) => setSubject(e.target.value)} placeholder="mis. Tombol simpan di kasir tidak bisa ditekan" /></Field>
      <Field label="Ceritakan masalahnya"><textarea value={body} onChange={(e) => setBody(e.target.value)} style={{ minHeight: 120 }} placeholder="Apa yang dilakukan, apa yang terjadi, di menu mana." /></Field>
      <p className="small muted" style={{ margin: 0 }}>Jangan tulis kata sandi atau kode rahasia. Tim PRASARA tidak pernah memintanya.</p>
      <button className="cta" onClick={send} disabled={busy}>{busy ? 'Mengirim…' : 'Kirim'}</button>
    </Sheet>
  );
}

function TicketView({ t, onClose, onChanged }) {
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const reply = async () => {
    setBusy(true);
    const { error } = await supabase.rpc('ticket_reply', { p_ticket: t.id, p_body: msg });
    setBusy(false);
    if (error) return toast(errMsg(error));
    setMsg(''); onChanged();
  };
  return (
    <Sheet title={t.subject} onClose={onClose}>
      <span className="small muted">{t.number} · {CAT[t.category]} · <span className={'chip ' + TST[t.status][1]}>{TST[t.status][0]}</span></span>
      <div className="stack" style={{ gap: 8 }}>{t.messages.map((m, i) => (
        <div key={i} className={'bubble ' + (m.kind === 'customer' ? 'me' : 'them')}><span className="small muted">{m.kind === 'customer' ? 'Anda' : 'Tim PRASARA'} · {when(m.at)}</span><div style={{ whiteSpace: 'pre-wrap' }}>{m.body}</div></div>
      ))}</div>
      {t.status !== 'closed' && <>
        <textarea value={msg} onChange={(e) => setMsg(e.target.value)} placeholder="Tulis balasan" aria-label="Balasan" />
        <button className="primary" onClick={reply} disabled={busy || !msg.trim()}>{busy ? 'Mengirim…' : 'Kirim balasan'}</button>
      </>}
    </Sheet>
  );
}
