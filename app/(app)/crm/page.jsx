'use client';
import { useEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useKos } from '@/components/KosProvider';
import PageHelp from '@/components/PageHelp';
import Image from 'next/image';
import NavIcon from '@/components/NavIcon';
import { useBaru } from '@/lib/useBaru';
import styles from './crm.module.css';
import { DataTable, FilterToolbar } from '@/components/Page';
import Timeline from '@/components/CrmTimeline';
import LeadCheck from '@/components/LeadCheck';
import { Sheet, Field, Loading, Empty, toast } from '@/components/ui';
import { rp, tgl, today, errMsg, angka, waLink, parseRp } from '@/lib/format';
import Link from 'next/link';
import { moduleOn, pathAllowed } from '@/lib/business';

const STAGES = { baru: ['Baru', ''], dihubungi: ['Dihubungi', 'gold'], penawaran: ['Penawaran', 'gold'], jadi: ['Jadi', 'good'], batal: ['Tidak jadi', 'void'] };
const STAGE_ICONS = { semua: '/beranda', aktif: '/konfirmasi', baru: '/resep', dihubungi: 'phone', penawaran: '/promo', jadi: 'done', batal: 'return' };
const closed = (lead) => ['jadi', 'batal'].includes(lead.stage);
const jakartaDate = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Jakarta' });
const NEXT = { baru: ['dihubungi', 'penawaran', 'jadi', 'batal'], dihubungi: ['penawaran', 'jadi', 'batal'], penawaran: ['dihubungi', 'jadi', 'batal'], jadi: ['dihubungi'], batal: ['dihubungi'] };
const SOURCE = { wa: 'WhatsApp', datang: 'Datang langsung', telepon: 'Telepon', rekomendasi: 'Rekomendasi', media_sosial: 'Media sosial', lainnya: 'Lainnya', halaman: 'Halaman bisnis', webhook: 'Integrasi' };

// CRM sederhana (blueprint 5.4): prospek & tahapannya, catatan komunikasi, tindak lanjut terjadwal
export default function Crm() {
  const { kos, kosId, ver, bump } = useKos();
  if (!kos || !kosId) return <Loading />;
  return <CrmWorkspace key={kosId} {...{ kos, kosId, ver, bump }} />;
}

function CrmWorkspace({ kos, kosId, ver, bump }) {
  const jasa = kos?.business_type === 'jasa';
  const retail = kos?.business_type === 'retail' || jasa; // prospek jadi → pelanggan (toko & jasa)
  const [d, setD] = useState(null);
  const [err, setErr] = useState(null);
  const [tab, setTab] = useState('prospek');
  const [stage, setStage] = useState('semua');
  const [query, setQuery] = useState('');
  const [source, setSource] = useState('');
  const [menu, setMenu] = useState(null);
  const [mode, setMode] = useState(null);
  const request = useRef(0);
  const [open, setOpen] = useState(null);
  const openedLink = useRef(null);
  useBaru(() => setOpen({}));
  const load = () => {
    const id = ++request.current;
    return supabase.rpc('crm_overview', { p_kos: kosId }).then(({ data, error }) => {
      if (id !== request.current) return;
      setErr(error ? errMsg(error) : null);
      if (!error) setD(data);
    });
  };
  useEffect(() => { load(); return () => { request.current++; }; }, [kosId, ver]);
  useEffect(() => { if (new URLSearchParams(window.location.search).get('tab') === 'tugas') setTab('tugas'); }, []);
  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get('prospek');
    if (!d || !/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(id || '')) return;
    const lead = d.leads.find((item) => item.id === id && item.kos_id === kosId);
    if (lead && openedLink.current !== id) {
      openedLink.current = id;
      setOpen(lead);
    }
  }, [d, kosId]);
  if (err) return <div className="notice bad">{/crm_overview/.test(err) ? 'Database sedang diperbarui. Coba lagi beberapa menit lagi.' : err}</div>;
  if (!d) return <Loading />;
  const active = d.leads.filter((lead) => !closed(lead));
  const needle = query.trim().toLowerCase();
  const matched = d.leads.filter((lead) => (!source || lead.source === source) &&
    (!needle || [lead.name, lead.phone, lead.need, lead.lost_reason, STAGES[lead.stage]?.[0]].some((value) => String(value || '').toLowerCase().includes(needle))));
  const matchesStage = (lead, key) => key === 'semua' || (key === 'aktif' ? !closed(lead) : lead.stage === key);
  const shown = matched.filter((lead) => matchesStage(lead, stage));
  const waiting = active.filter((lead) => lead.source === 'halaman' && !lead.ref_id && Array.isArray(lead.items) && lead.items.length > 0);
  const conv = d.won90 + d.lost90 > 0 ? Math.round((100 * d.won90) / (d.won90 + d.lost90)) : null;
  const openLead = (lead, target = null) => { setMode(target); setMenu(null); setOpen(lead); };
  const doneTask = async (task) => {
    const { error } = await supabase.rpc('crm_task_done', { p_task: task.id, p_done: true });
    if (error) return toast(errMsg(error));
    toast('Tindak lanjut selesai');
    bump();
  };
  const stageChip = (lead) => <span className={'chip ' + (waiting.includes(lead) ? 'gold' : STAGES[lead.stage][1])}>{waiting.includes(lead) ? 'Perlu konfirmasi' : lead.ref_number ? `✓ ${lead.ref_number}` : STAGES[lead.stage][0]}</span>;

  return (
    <div className={styles.page}>
      <section className={styles.hero} aria-label="CRM & Sales Pipeline Center">
        <div className={styles.heroCopy}>
          <h1>Prospek &amp; Tindak Lanjut</h1>
          <p>{retail ? 'Kelola calon pelanggan, pantau tahap penjualan, dan jadwalkan tindak lanjut.' : 'Kelola calon penghuni, pantau tahap prospek, dan jadwalkan tindak lanjut.'}</p>
          <PageHelp page="crm" label={<><NavIcon name="/buku-besar" size={17} /> Panduan Prospek <NavIcon name="next" size={14} /></>} />
        </div>
        <span className={styles.heroArt}><Image src="/prospek-crm.webp" alt="" fill priority sizes="(max-width: 600px) 36vw, 295px" /></span>
      </section>
      <div className={styles.actions}>
        <button className={styles.primary} onClick={() => openLead({})}><NavIcon name="plus" />Prospek Baru</button>
        <button onClick={() => setMenu('schedule')}><NavIcon name="calendar" />Jadwal Tindak Lanjut</button>
        {retail && <button onClick={() => setMenu('convert')}><NavIcon name="/penghuni" />Konversi Jadi Pelanggan</button>}
        <button onClick={() => setMenu('more')}><NavIcon name="more" />Lainnya</button>
      </div>
      <div className={styles.metrics}>
        <CrmMetric icon="/konfirmasi" label="Prospek Aktif" value={angka(active.length)} note={d.open_value > 0 ? `Perkiraan ${rp(d.open_value)}` : 'Belum ada perkiraan nilai'} />
        <CrmMetric icon="/shift" label="Tindak Lanjut Hari Ini" value={angka(d.due)} note="Termasuk yang terlewat" />
        <CrmMetric icon="/laporan" label="Jadi (90 Hari)" value={conv == null ? '—' : `${conv}%`} note={`${angka(d.won90)} jadi · ${angka(d.lost90)} tidak jadi`} />
      </div>
      <div className={styles.tabs} aria-label="Tampilan CRM">
        <button aria-pressed={tab === 'prospek'} onClick={() => setTab('prospek')}>Prospek</button>
        <button aria-pressed={tab === 'tugas'} onClick={() => setTab('tugas')}>Tindak Lanjut ({angka(d.tasks.length)})</button>
      </div>
      {tab === 'prospek' && <>
        {waiting.length > 0 && <div className="notice small"><b>{waiting.length} permintaan dari halaman bisnis</b> menunggu konfirmasi. Ketuk untuk melihat hasil cek otomatis, lalu <b>Konfirmasi</b> bila cocok.</div>}
        <div className={styles.stages} aria-label="Tahapan prospek">
          {[['semua', 'Semua'], ['aktif', 'Aktif'], ...Object.entries(STAGES).map(([key, [label]]) => [key, label])].map(([key, label]) => (
            <button key={key} aria-pressed={stage === key} onClick={() => setStage(key)}><NavIcon name={STAGE_ICONS[key]} />
              <span>{label}</span><b>{angka(matched.filter((lead) => matchesStage(lead, key)).length)}</b>
            </button>
          ))}
        </div>
        <div className={styles.toolbar}>
          <FilterToolbar q={query} onQ={setQuery} placeholder="Cari nama, kebutuhan, atau tahap" />
          <button onClick={() => setMenu('filter')}><NavIcon name="filter" size={17} />{source ? 'Filter Aktif' : 'Filter'}</button>
        </div>
        {shown.length === 0 ? <Empty title="Belum ada prospek di sini" text="Tekan + Prospek baru setiap ada orang yang bertanya atau tertarik." /> : (
          <div className={styles.results}><DataTable rows={shown} caption="Daftar prospek" onRow={(lead) => openLead(lead)} rowLabel={(l) => l.name} pageSize={50}
            columns={[
              { key: 'name', label: 'Nama', sort: (l) => l.name.toLowerCase(), render: (l) => <><b>{l.name}</b>{(l.source === 'halaman' || l.source === 'webhook') && <span className="chip gold" style={{ marginLeft: 6 }}>{l.number || SOURCE[l.source]}</span>}</> },
              { key: 'need', label: 'Kebutuhan', hide: 'tablet', render: (l) => <span className="small">{l.need || '—'}</span> },
              { key: 'src', label: 'Sumber', render: (l) => SOURCE[l.source] },
              { key: 'val', label: 'Perkiraan nilai', align: 'right', sort: (l) => Number(l.est_value) || 0, render: (l) => (Number(l.est_value) > 0 ? rp(l.est_value) : <span className="muted">—</span>) },
              { key: 'next', label: 'Tindak lanjut', sort: (l) => l.next_due || '', render: (l) => (l.next_due ? <span style={{ color: l.next_due <= today() ? 'var(--bad)' : undefined }}>{tgl(l.next_due)}</span> : <span className="muted">—</span>) },
              { key: 'st', label: 'Tahap', render: stageChip },
              { key: 'wa', label: 'WhatsApp', hide: 'tablet', render: (lead) => lead.phone ? <a href={waLink(lead.phone, `Halo ${lead.name}, `)} target="_blank" rel="noreferrer" onClick={(event) => event.stopPropagation()} onKeyDown={(event) => event.stopPropagation()}>Buka WA</a> : '—' },
            ]}
            card={(lead) => <div className={styles.leadCard}>
              <span className={styles.avatar}>{lead.name.trim().charAt(0).toUpperCase()}</span>
              <span className={styles.leadBody}>
                <b>{lead.name} {(lead.source === 'halaman' || lead.source === 'webhook') && <span className="chip gold">{lead.number || SOURCE[lead.source]}</span>}</b>
                <small>{[lead.need, SOURCE[lead.source], Number(lead.est_value) > 0 && rp(lead.est_value)].filter(Boolean).join(' · ')}</small>
                {lead.next_due && !closed(lead) && <small>Tindak lanjut {tgl(lead.next_due)}</small>}
                {lead.closed_at && closed(lead) && <small>{lead.stage === 'jadi' ? 'Jadi' : 'Ditutup'} pada {tgl(jakartaDate.format(new Date(lead.closed_at)))}</small>}
                {lead.stage === 'batal' && lead.lost_reason && <small>Alasan {lead.lost_reason}</small>}
              </span>{stageChip(lead)}<NavIcon name="next" size={15} />
            </div>} /></div>
        )}
      </>}

      {tab === 'tugas' && (d.tasks.length === 0 ? <Empty title="Tidak ada tindak lanjut terbuka" text="Buat dari halaman prospek atau pelanggan." /> : (
        <section className="panel"><div className={styles.taskHead}><h2>Jadwal Tindak Lanjut</h2><button onClick={() => setMenu('schedule')}>Tambah Jadwal</button></div><div className="list">{d.tasks.map((t) => (
          <div className="li" key={t.id} style={{ alignItems: 'flex-start' }}>
            <div className="main"><b className="small">{t.title}</b>
              <span className="small" style={{ color: t.due_date <= today() ? 'var(--bad)' : 'var(--muted)' }}>{t.due_date < today() ? 'Terlewat · ' : t.due_date === today() ? 'Hari ini · ' : ''}{tgl(t.due_date)} · {t.name}</span>
              {t.lead_id && d.leads.some((lead) => lead.id === t.lead_id) && <button className="sm ghost" onClick={() => openLead(d.leads.find((lead) => lead.id === t.lead_id))}>Lihat Prospek</button>}
              {t.phone && <a className="small" href={waLink(t.phone, `Halo ${t.name}, ini dari ${kos.name}. `)} target="_blank" rel="noreferrer">Kirim WA</a>}</div>
            <button className="sm" onClick={() => doneTask(t)}>Selesai</button>
          </div>
        ))}</div></section>
      ))}
      <aside className={styles.notice}><NavIcon name="info" /><p><b>Tips.</b> Jadwalkan tindak lanjut untuk prospek aktif. Simpan nama, nomor, dan kebutuhan yang relevan.</p></aside>
      {menu === 'filter' && <Sheet title="Filter Prospek" onClose={() => setMenu(null)}>
        <Field label="Tahapan"><select value={stage} onChange={(event) => setStage(event.target.value)}><option value="semua">Semua tahap</option><option value="aktif">Aktif</option>
          {Object.entries(STAGES).map(([key, [label]]) => <option key={key} value={key}>{label}</option>)}
        </select></Field>
        <Field label="Sumber"><select value={source} onChange={(event) => setSource(event.target.value)}><option value="">Semua sumber</option>
          {Object.entries(SOURCE).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
        </select></Field>
        <button className="primary" onClick={() => setMenu(null)}>Tampilkan Hasil</button>
      </Sheet>}
      {menu === 'more' && <Sheet title="Lainnya" onClose={() => setMenu(null)}>
        <button onClick={() => { setStage('batal'); setQuery(''); setSource(''); setTab('prospek'); setMenu(null); }}>Lihat Prospek Tidak Jadi</button>
        <button onClick={() => { setTab('tugas'); setMenu(null); }}>Lihat Jadwal Terbuka</button>
        {pathAllowed(kos, '/kontak') && <Link href="/kontak">Buka Pelanggan &amp; Supplier</Link>}
      </Sheet>}
      {['schedule', 'convert'].includes(menu) && <Sheet title={menu === 'convert' ? 'Konversi Jadi Pelanggan' : 'Jadwal Tindak Lanjut'} onClose={() => setMenu(null)}>
        {menu === 'schedule' && <button onClick={() => { setTab('tugas'); setMenu(null); }}>Lihat Jadwal Terbuka ({angka(d.tasks.length)})</button>}
        <p>Pilih prospek aktif untuk {menu === 'convert' ? 'meninjau konversi' : 'membuat jadwal'}.</p>
        {active.map((lead) => <button key={lead.id} onClick={() => openLead(lead, menu === 'convert' ? 'convert' : null)}>{lead.name}</button>)}
        {!active.length && <p>Belum ada prospek aktif.</p>}
      </Sheet>}
      {open && (!open.id || open.kos_id === kosId) && <LeadSheet key={open.id || kosId} l={open} mode={mode} kosId={kosId} retail={retail} jasa={jasa} onClose={() => setOpen(null)} onSaved={bump} />}
    </div>
  );
}

function CrmMetric({ icon, label, value, note }) {
  return <article className={styles.metric}><span><NavIcon name={icon} /></span><div><b>{label}</b><strong>{value}</strong><small>{note}</small></div></article>;
}

function LeadSheet({ l, mode, kosId, retail, jasa, onClose, onSaved }) {
  const { kos } = useKos();
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
    if (busy) return;
    if (to === 'jadi' && retail && !cur.contact_id && !String(cur.phone || '').replace(/\D/g, '').replace(/^(62|0)/, '')) {
      return toast('Isi No. HP di Ubah data prospek untuk mencocokkan pelanggan yang sudah ada.');
    }
    let reason = null;
    if (to === 'batal' || ['jadi', 'batal'].includes(cur.stage)) { reason = window.prompt(to === 'batal' ? 'Alasan tidak jadi?' : 'Alasan membuka kembali?', ''); if (reason == null) return; }
    else if (to === 'jadi' && !window.confirm(`Tandai ${cur.name} jadi?${retail ? '\nIa dihubungkan ke daftar pelanggan (dicocokkan lewat No. HP; bila belum ada, ditambahkan).' : ''}`)) return;
    setBusy(true);
    const { data, error } = await supabase.rpc('crm_lead_stage', { p_lead: cur.id, p_stage: to, p_reason: reason });
    setBusy(false);
    if (error) return toast(errMsg(error));
    toast(`Tahap: ${STAGES[to][0]}`); setCur({ ...cur, stage: to, contact_id: data.contact_id ?? cur.contact_id, lost_reason: to === 'batal' ? reason.trim() : null }); onSaved();
  };
  return (
    <Sheet title={isNew && !cur.id ? 'Prospek baru' : cur.name} onClose={onClose}>
      {!cur.id && <>
        <Field label="Nama"><input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder={retail ? (jasa ? 'mis. Kos Melati (langganan)' : 'mis. Warung Bu Sri') : 'mis. Rina (mahasiswi)'} /></Field>
        <Field label="No. HP / WhatsApp"><input inputMode="tel" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} /></Field>
        <Field label="Kebutuhan"><input value={f.need} onChange={(e) => setF({ ...f, need: e.target.value })} placeholder={retail ? (jasa ? 'mis. laundry seprai 20 kg/minggu' : 'mis. ambil beras 5 karung/minggu') : 'mis. kamar mandi dalam, mulai Desember'} /></Field>
        <div className="row">
          <Field label="Dari mana"><select value={f.source} onChange={(e) => setF({ ...f, source: e.target.value })}>{Object.entries(SOURCE).filter(([k]) => (k !== 'halaman' && k !== 'webhook') || f.source === k).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Field>
          <Field label="Perkiraan nilai (opsional)"><input inputMode="numeric" value={f.est} onChange={(e) => setF({ ...f, est: e.target.value })} placeholder="Rp" /></Field>
        </div>
        <button className="primary" disabled={busy || f.name.trim().length < 2} onClick={save}>{busy ? 'Menyimpan…' : isNew ? 'Simpan prospek' : 'Simpan perubahan'}</button>
      </>}
      {cur.id && <>
        <div className="row"><span className="small">Tahap:</span><span className={'chip ' + STAGES[cur.stage][1]}>{STAGES[cur.stage][0]}</span>{cur.phone && <a className="small" href={waLink(cur.phone, `Halo ${cur.name}, `)} target="_blank" rel="noreferrer">Kirim WA</a>}</div>
        {mode === 'convert' && !closed(cur) && <p className="small muted">Periksa nama dan nomor sebelum menekan Jadi. Nomor yang sudah terdaftar akan ditautkan ke pelanggan yang ada.</p>}
        {cur.contact_id && retail && pathAllowed(kos, '/kontak') && <Link href={`/kontak?kontak=${encodeURIComponent(cur.contact_id)}`}>Buka Kontak Pelanggan</Link>}
        {cur.lost_reason && <span className="small muted">Alasan tidak jadi: {cur.lost_reason}</span>}
        {cur.source === 'halaman' && <div className="notice small">Permintaan <b>{cur.number}</b> dari halaman bisnis{cur.consent_at ? ' · pengunjung menyetujui dihubungi' : ''}.{cur.need ? <><br />{cur.need}</> : ''}
          {Array.isArray(cur.items) && cur.items.length > 0 && <ul style={{ margin: '4px 0 0', paddingLeft: 18 }}>{cur.items.map((it, i) => <li key={i}>{it.name} · {angka(it.qty)} {it.unit}{it.price != null ? ` × ${rp(it.price)}` : ''}</li>)}</ul>}
          {cur.req_date && <><br />Tanggal diminta: <b>{tgl(cur.req_date)}</b></>}</div>}
        {cur.source === 'webhook' && <div className="notice small">Prospek <b>{cur.number}</b> masuk lewat integrasi. Persetujuan untuk dihubungi <b>belum dikonfirmasi</b> oleh PRASARA — pastikan sumbernya sudah meminta izin pelanggan.{cur.need ? <><br />{cur.need}</> : ''}</div>}
        {cur.source === 'halaman' && <LeadCheck lead={cur} kos={kos} onChanged={async () => { onSaved(); const { data } = await supabase.from('crm_leads').select('*').eq('id', cur.id).maybeSingle(); if (data) setCur({ ...cur, ...data }); }} />}
        <div className="row">{NEXT[cur.stage].map((to) => <button key={to} className={to === 'jadi' ? 'sm primary' : to === 'batal' ? 'sm ghost danger' : 'sm'} disabled={busy} onClick={() => move(to)}>{['jadi', 'batal'].includes(cur.stage) ? 'Buka lagi' : `→ ${STAGES[to][0]}`}</button>)}</div>
        {!retail && !['jadi', 'batal'].includes(cur.stage) && moduleOn(kos, 'p_booking') && <Link href={`/booking?lead=${cur.id}`} className="small">📅 Buat booking kamar untuk {cur.name} →</Link>}
        <Timeline kosId={kosId} lead={cur.id} onTasksChanged={onSaved} />
      </>}
      {!isNew && <details><summary className="small">Ubah data prospek</summary><div className="stack" style={{ marginTop: 8 }}>
        <Field label="Nama"><input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder={retail ? (jasa ? 'mis. Kos Melati (langganan)' : 'mis. Warung Bu Sri') : 'mis. Rina (mahasiswi)'} /></Field>
        <Field label="No. HP / WhatsApp"><input inputMode="tel" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} /></Field>
        <Field label="Kebutuhan"><input value={f.need} onChange={(e) => setF({ ...f, need: e.target.value })} placeholder={retail ? (jasa ? 'mis. laundry seprai 20 kg/minggu' : 'mis. ambil beras 5 karung/minggu') : 'mis. kamar mandi dalam, mulai Desember'} /></Field>
        <div className="row">
          <Field label="Dari mana"><select value={f.source} onChange={(e) => setF({ ...f, source: e.target.value })}>{Object.entries(SOURCE).filter(([k]) => (k !== 'halaman' && k !== 'webhook') || f.source === k).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Field>
          <Field label="Perkiraan nilai (opsional)"><input inputMode="numeric" value={f.est} onChange={(e) => setF({ ...f, est: e.target.value })} placeholder="Rp" /></Field>
        </div>
        <button className="primary" disabled={busy || f.name.trim().length < 2} onClick={save}>{busy ? 'Menyimpan…' : isNew ? 'Simpan prospek' : 'Simpan perubahan'}</button>
      </div></details>}
    </Sheet>
  );
}

