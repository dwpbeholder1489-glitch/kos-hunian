'use client';
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useKos } from '@/components/KosProvider';
import PageHelp from '@/components/PageHelp';
import Timeline from '@/components/CrmTimeline';
import { Sheet, Field, Loading, Empty, Tile, toast } from '@/components/ui';
import { rp, tgl, today, errMsg, angka, waLink, parseRp } from '@/lib/format';

const STAGES = { baru: ['Baru', ''], dihubungi: ['Dihubungi', 'gold'], penawaran: ['Penawaran', 'gold'], jadi: ['Jadi', 'good'], batal: ['Tidak jadi', 'void'] };
const NEXT = { baru: ['dihubungi', 'penawaran', 'jadi', 'batal'], dihubungi: ['penawaran', 'jadi', 'batal'], penawaran: ['dihubungi', 'jadi', 'batal'], jadi: ['dihubungi'], batal: ['dihubungi'] };
const SOURCE = { wa: 'WhatsApp', datang: 'Datang langsung', telepon: 'Telepon', rekomendasi: 'Rekomendasi', media_sosial: 'Media sosial', lainnya: 'Lainnya', halaman: 'Halaman bisnis' };

// CRM sederhana (blueprint 5.4): prospek & tahapannya, catatan komunikasi, tindak lanjut terjadwal
export default function Crm() {
  const { kos, kosId, ver } = useKos();
  const retail = kos?.business_type === 'retail';
  const [d, setD] = useState(null);
  const [err, setErr] = useState(null);
  const [tab, setTab] = useState('prospek');
  const [stage, setStage] = useState('aktif');
  const [open, setOpen] = useState(null);
  const load = () => supabase.rpc('crm_overview', { p_kos: kosId }).then(({ data, error }) => (error ? setErr(errMsg(error)) : setD(data)));
  useEffect(() => { load(); }, [kosId, ver]);
  if (err) return <div className="notice bad">{/crm_overview/.test(err) ? 'Database sedang diperbarui. Coba lagi beberapa menit lagi.' : err}</div>;
  if (!d) return <Loading />;
  const active = d.leads.filter((l) => !['jadi', 'batal'].includes(l.stage));
  const shown = stage === 'aktif' ? active : d.leads.filter((l) => l.stage === stage);
  const conv = d.won90 + d.lost90 > 0 ? Math.round((100 * d.won90) / (d.won90 + d.lost90)) : null;
  const doneTask = async (t) => { const { error } = await supabase.rpc('crm_task_done', { p_task: t.id, p_done: true }); if (error) return toast(errMsg(error)); toast('Tindak lanjut selesai'); load(); };

  return (
    <div className="stack">
      <div className="row"><h2>Prospek & tindak lanjut</h2><PageHelp page="crm" /></div>
      <p className="small muted" style={{ margin: 0 }}>Catat calon {retail ? 'pelanggan (mis. warung yang mau ambil grosir)' : 'penghuni yang menanyakan kamar'}, ikuti tahapannya, dan jadwalkan kapan harus dihubungi lagi.</p>
      <div className="grid">
        <Tile label="Prospek aktif" value={angka(active.length)} sub={d.open_value > 0 ? `perkiraan ${rp(d.open_value)}` : 'belum ada perkiraan nilai'} />
        <Tile label="Tindak lanjut hari ini" value={angka(d.due)} tone={d.due > 0 ? 'bad' : undefined} sub="termasuk yang terlewat" />
        <Tile label="Jadi (90 hari)" value={conv == null ? '—' : `${conv}%`} sub={`${d.won90} jadi · ${d.lost90} tidak jadi`} />
      </div>
      <div className="seg">
        <button className={tab === 'prospek' ? 'on' : ''} onClick={() => setTab('prospek')}>Prospek</button>
        <button className={tab === 'tugas' ? 'on' : ''} onClick={() => setTab('tugas')}>Tindak lanjut ({d.tasks.length})</button>
      </div>

      {tab === 'prospek' && <>
        <button className="cta" onClick={() => setOpen({})}>+ Prospek baru</button>
        <div className="seg" style={{ overflowX: 'auto' }}>
          {[['aktif', `Aktif (${active.length})`], ...Object.entries(STAGES).map(([k, [l]]) => [k, `${l} (${d.leads.filter((x) => x.stage === k).length})`])].map(([k, l]) => <button key={k} className={stage === k ? 'on' : ''} onClick={() => setStage(k)}>{l}</button>)}
        </div>
        {shown.length === 0 ? <Empty title="Belum ada prospek di sini" text="Tekan + Prospek baru setiap ada orang yang bertanya atau tertarik." /> : (
          <section className="panel"><div className="list">{shown.map((l) => (
            <button key={l.id} className="li click" onClick={() => setOpen(l)} style={{ background: 'none', border: 0, borderTop: '1px solid var(--line)', borderRadius: 0, width: '100%', textAlign: 'left', font: 'inherit', color: 'inherit', alignItems: 'flex-start' }}>
              <div className="main"><b className="small">{l.name}{l.source === 'halaman' && <span className="chip gold" style={{ marginLeft: 6 }}>{l.number || 'Halaman'}</span>}</b>
                <span className="small muted">{l.need ? `${l.need} · ` : ''}{SOURCE[l.source]}{Number(l.est_value) > 0 ? ` · ${rp(l.est_value)}` : ''}</span>
                {l.next_due && <span className="small" style={{ color: l.next_due <= today() ? 'var(--bad)' : 'var(--muted)' }}>Tindak lanjut {tgl(l.next_due)}</span>}</div>
              <span className={'chip ' + STAGES[l.stage][1]}>{STAGES[l.stage][0]}</span>
            </button>
          ))}</div></section>
        )}
      </>}

      {tab === 'tugas' && (d.tasks.length === 0 ? <Empty title="Tidak ada tindak lanjut terbuka" text="Buat dari halaman prospek atau pelanggan." /> : (
        <section className="panel"><div className="list">{d.tasks.map((t) => (
          <div className="li" key={t.id} style={{ alignItems: 'flex-start' }}>
            <div className="main"><b className="small">{t.title}</b>
              <span className="small" style={{ color: t.due_date <= today() ? 'var(--bad)' : 'var(--muted)' }}>{t.due_date < today() ? 'Terlewat · ' : t.due_date === today() ? 'Hari ini · ' : ''}{tgl(t.due_date)} · {t.name}</span>
              {t.phone && <a className="small" href={waLink(t.phone, `Halo ${t.name}, ini dari ${kos.name}. `)} target="_blank" rel="noreferrer">Kirim WA</a>}</div>
            <button className="sm" onClick={() => doneTask(t)}>Selesai</button>
          </div>
        ))}</div></section>
      ))}
      <span className="small muted">Simpan seperlunya saja: nama, No. HP, dan kebutuhan. Jangan mencatat data pribadi sensitif (KTP, kesehatan, dll.).</span>
      {open && <LeadSheet l={open} kosId={kosId} retail={retail} onClose={() => setOpen(null)} onSaved={() => { load(); }} />}
    </div>
  );
}

function LeadSheet({ l, kosId, retail, onClose, onSaved }) {
  const isNew = !l.id;
  const [f, setF] = useState({ name: l.name || '', phone: l.phone || '', need: l.need || '', source: l.source || 'wa', est: l.est_value ? String(Math.round(l.est_value)) : '' });
  const [cur, setCur] = useState(l);
  const [busy, setBusy] = useState(false);
  const save = async () => {
    setBusy(true);
    const { data, error } = await supabase.rpc('crm_lead_save', { p_kos: kosId, p_id: l.id || null, p_name: f.name, p_phone: f.phone, p_need: f.need, p_source: f.source, p_est: parseRp(f.est) || null });
    setBusy(false);
    if (error) return toast(errMsg(error));
    toast(data.duplicate ? `Tersimpan. Perhatian: No. HP sama dengan ${data.duplicate}` : 'Prospek tersimpan');
    onSaved();
    if (isNew) setCur({ ...f, id: data.id, stage: 'baru', source: f.source, est_value: parseRp(f.est) || null }); else onClose();
  };
  const move = async (to) => {
    let reason = null;
    if (to === 'batal' || ['jadi', 'batal'].includes(cur.stage)) { reason = window.prompt(to === 'batal' ? 'Alasan tidak jadi?' : 'Alasan membuka kembali?', ''); if (reason == null) return; }
    else if (to === 'jadi' && !window.confirm(`Tandai ${cur.name} jadi?${retail ? '\nIa dihubungkan ke daftar pelanggan (dicocokkan lewat No. HP; bila belum ada, ditambahkan).' : ''}`)) return;
    const { data, error } = await supabase.rpc('crm_lead_stage', { p_lead: cur.id, p_stage: to, p_reason: reason });
    if (error) return toast(errMsg(error));
    toast(`Tahap: ${STAGES[to][0]}`); setCur({ ...cur, stage: to, contact_id: data.contact_id }); onSaved();
  };
  return (
    <Sheet title={isNew && !cur.id ? 'Prospek baru' : cur.name} onClose={onClose}>
      {!cur.id && <>
        <Field label="Nama"><input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder={retail ? 'mis. Warung Bu Sri' : 'mis. Rina (mahasiswi)'} /></Field>
        <Field label="No. HP / WhatsApp"><input inputMode="tel" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} /></Field>
        <Field label="Kebutuhan"><input value={f.need} onChange={(e) => setF({ ...f, need: e.target.value })} placeholder={retail ? 'mis. ambil beras 5 karung/minggu' : 'mis. kamar mandi dalam, mulai Desember'} /></Field>
        <div className="row">
          <Field label="Dari mana"><select value={f.source} onChange={(e) => setF({ ...f, source: e.target.value })}>{Object.entries(SOURCE).filter(([k]) => k !== 'halaman' || f.source === 'halaman').map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Field>
          <Field label="Perkiraan nilai (opsional)"><input inputMode="numeric" value={f.est} onChange={(e) => setF({ ...f, est: e.target.value })} placeholder="Rp" /></Field>
        </div>
        <button className="primary" disabled={busy || f.name.trim().length < 2} onClick={save}>{busy ? 'Menyimpan…' : isNew ? 'Simpan prospek' : 'Simpan perubahan'}</button>
      </>}
      {cur.id && <>
        <div className="row"><span className="small">Tahap:</span><span className={'chip ' + STAGES[cur.stage][1]}>{STAGES[cur.stage][0]}</span>{cur.phone && <a className="small" href={waLink(cur.phone, `Halo ${cur.name}, `)} target="_blank" rel="noreferrer">Kirim WA</a>}</div>
        {cur.lost_reason && <span className="small muted">Alasan tidak jadi: {cur.lost_reason}</span>}
        {cur.source === 'halaman' && <div className="notice small">Permintaan <b>{cur.number}</b> dari halaman bisnis{cur.consent_at ? ' · pengunjung menyetujui dihubungi' : ''}.{cur.need ? <><br />{cur.need}</> : ''}
          {Array.isArray(cur.items) && cur.items.length > 0 && <ul style={{ margin: '4px 0 0', paddingLeft: 18 }}>{cur.items.map((it, i) => <li key={i}>{it.name} · {angka(it.qty)} {it.unit}{it.price != null ? ` × ${rp(it.price)}` : ''}</li>)}</ul>}
          <br /><span className="muted">Harga & ketersediaan belum dikonfirmasi — hubungi pengirim lewat WA.</span></div>}
        <div className="row">{NEXT[cur.stage].map((to) => <button key={to} className={to === 'jadi' ? 'sm primary' : to === 'batal' ? 'sm ghost danger' : 'sm'} onClick={() => move(to)}>{['jadi', 'batal'].includes(cur.stage) ? 'Buka lagi' : `→ ${STAGES[to][0]}`}</button>)}</div>
        <Timeline kosId={kosId} lead={cur.id} />
      </>}
      {!isNew && <details><summary className="small">Ubah data prospek</summary><div className="stack" style={{ marginTop: 8 }}>
        <Field label="Nama"><input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder={retail ? 'mis. Warung Bu Sri' : 'mis. Rina (mahasiswi)'} /></Field>
        <Field label="No. HP / WhatsApp"><input inputMode="tel" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} /></Field>
        <Field label="Kebutuhan"><input value={f.need} onChange={(e) => setF({ ...f, need: e.target.value })} placeholder={retail ? 'mis. ambil beras 5 karung/minggu' : 'mis. kamar mandi dalam, mulai Desember'} /></Field>
        <div className="row">
          <Field label="Dari mana"><select value={f.source} onChange={(e) => setF({ ...f, source: e.target.value })}>{Object.entries(SOURCE).filter(([k]) => k !== 'halaman' || f.source === 'halaman').map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Field>
          <Field label="Perkiraan nilai (opsional)"><input inputMode="numeric" value={f.est} onChange={(e) => setF({ ...f, est: e.target.value })} placeholder="Rp" /></Field>
        </div>
        <button className="primary" disabled={busy || f.name.trim().length < 2} onClick={save}>{busy ? 'Menyimpan…' : isNew ? 'Simpan prospek' : 'Simpan perubahan'}</button>
      </div></details>}
    </Sheet>
  );
}

