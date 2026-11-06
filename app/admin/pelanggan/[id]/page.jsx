'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { useKos } from '@/components/KosProvider';
import { Loading, Empty, Field, run, toast } from '@/components/ui';
import { rp, tgl, errMsg, waLink } from '@/lib/format';
import { PLANS } from '@/lib/plan';
import { ADMIN_TEMPLATES, fillAdmin } from '@/lib/adminTemplates';
import { can, ACTION, TYPE_ICON, loadTemplates } from '@/lib/admin';
import { health } from '@/lib/health';

const RQ = { menunggu: ['Menunggu', 'gold'], disetujui: ['Disetujui', 'good'], ditolak: ['Ditolak', 'bad'] };
const when = (ts) => { const s = String(ts); return `${tgl(s.slice(0, 10))} ${new Date(s).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Jakarta' })}`; };
const EMAIL_NAME = { h0: 'Sambutan', kamar: 'Isi harga kamar', penghuni: 'Masukkan penghuni', bayar: 'Catat pembayaran', sapa: 'Ada yang bisa dibantu?', ringkasan: 'Fitur lain', coba5: 'Sisa 5 hari', coba2: 'Sisa 2 hari' };

// Profil pelanggan: satu halaman untuk semua tim (tanpa data pribadi penghuni / pelanggan toko)
export default function CustomerDetail() {
  const { id } = useParams();
  const { adminMe } = useKos();
  const [c, setC] = useState(null);
  const [sig, setSig] = useState(null);
  const [err, setErr] = useState(null);
  const [note, setNote] = useState('');
  const [tpls, setTpls] = useState([]);
  const [tpl, setTpl] = useState('');
  const [msg, setMsg] = useState('');
  const [ov, setOv] = useState({ action: 'tambah_coba', plan: 'standar', value: '14', reason: '' });

  const load = async () => {
    const [a, b] = await Promise.all([supabase.rpc('admin_customer', { p_kos: id }), supabase.rpc('admin_customers')]);
    if (a.error) return setErr(errMsg(a.error));
    setC(a.data); setSig((b.data || []).find((x) => x.id === id) || null);
  };
  useEffect(() => { if (can(adminMe, 'customers.view')) { load(); loadTemplates(supabase, ADMIN_TEMPLATES).then((t) => { setTpls(t); setTpl(String(t[0]?.id || '')); }); } }, [id, adminMe]);
  useEffect(() => { const x = tpls.find((t) => String(t.id) === tpl); if (c && x) setMsg(fillAdmin(x.body, c.kos)); }, [tpl, c, tpls]);
  if (!can(adminMe, 'customers.view')) return <Empty title="Tidak punya izin melihat pelanggan" />;
  if (err) return <div className="notice bad">{err}</div>;
  if (!c) return <Loading />;
  const k = c.kos;
  const h = sig ? health(sig) : null;
  const retail = k.business_type === 'retail';

  const addNote = async () => { if (await run(() => supabase.rpc('admin_add_note', { p_kos: id, p_body: note }), 'Catatan disimpan', errMsg)) { setNote(''); load(); } };
  const record = (action) => supabase.rpc('admin_record', { p_action: action, p_kos: id, p_detail: { template: tpl } });
  const override = async () => {
    const label = ov.action === 'tambah_coba' ? `tambah masa coba ${ov.value} hari` : ov.action === 'beri_paket' ? `beri ${PLANS[ov.plan].name} ${ov.value} bulan` : 'jadikan Gratis';
    if (!confirm(`Yakin ${label} untuk "${k.name}"?\nAlasan: ${ov.reason}`)) return;
    if (await run(() => supabase.rpc('admin_override', { p_kos: id, p_action: ov.action, p_plan: ov.action === 'beri_paket' ? ov.plan : null, p_value: parseInt(ov.value, 10) || null, p_reason: ov.reason }), 'Akses diperbarui dan tercatat', errMsg)) { setOv({ ...ov, reason: '' }); load(); }
  };

  return (
    <div className="stack">
      <Link href="/admin/pelanggan" className="small">← Semua pelanggan</Link>
      <div className="row between"><h2>{TYPE_ICON[k.business_type]} {k.name}</h2>{h && <span className={'chip ' + h.tone}>{h.score != null ? `Skor ${h.score} · ${h.label}` : h.label}</span>}</div>

      <section className="panel">
        <div className="list">
          <div className="li"><span className="muted small">Pemilik</span><b className="small">{k.owner_email}</b></div>
          <div className="li"><span className="muted small">No. WA bisnis</span><b className="small">{k.contact_phone || '—'}</b></div>
          <div className="li"><span className="muted small">Jenis</span><b className="small">{retail ? 'Retail & Grosir' : 'Properti & Sewa'}{c.counts.other_businesses > 0 ? ` · punya ${c.counts.other_businesses} bisnis lain` : ''}</b></div>
          <div className="li"><span className="muted small">Daftar</span><b className="small">{tgl(String(k.created_at).slice(0, 10))}</b></div>
          <div className="li"><span className="muted small">Paket</span><b className="small">{PLANS[k.effective_plan]?.name}{k.paid_until ? ` · bayar s.d. ${tgl(k.paid_until)}` : k.trial_until ? ` · coba s.d. ${tgl(k.trial_until)}` : ''}</b></div>
          <div className="li"><span className="muted small">Ringkasan</span><b className="small">{retail ? `${c.counts.products} barang · ${c.counts.sales} penjualan · ${c.counts.purchases} belanja` : `${c.counts.rooms} kamar · ${c.counts.active_leases} terisi · ${c.counts.payments} pembayaran`}</b></div>
        </div>
      </section>

      {h && h.score != null && (
        <section className="panel">
          <h3>Skor kesehatan</h3>
          {h.parts.map(([l, max, got]) => <div key={l} className="stack" style={{ gap: 4 }}><div className="row between small"><span>{l}</span><span>{got}/{max}</span></div><div className="pbar"><span style={{ width: `${(got / max) * 100}%` }} /></div></div>)}
          <span className="small muted">Penggunaan laporan (bobot 20) belum dilacak; skor dihitung dari 80 poin lainnya.</span>
        </section>
      )}
      {h && h.reasons.length > 0 && <section className="panel"><h3>Perlu ditindaklanjuti</h3><ul style={{ margin: 0, paddingLeft: 20 }}>{h.reasons.map((r) => <li key={r} className="small">{r}</li>)}</ul></section>}

      {can(adminMe, 'customers.message') && (
        <section className="panel">
          <h3>Chat cepat</h3>
          <select value={tpl} onChange={(e) => setTpl(e.target.value)} aria-label="Template pesan">{tpls.map((t) => <option key={t.id} value={String(t.id)}>{t.name}</option>)}</select>
          <textarea value={msg} onChange={(e) => setMsg(e.target.value)} style={{ minHeight: 110 }} aria-label="Isi pesan" />
          <div className="row">
            {k.contact_phone ? <a href={waLink(k.contact_phone, msg)} target="_blank" rel="noreferrer" onClick={() => record('kirim_wa')}><button className="primary">Buka WhatsApp</button></a> : <span className="small muted">Belum ada nomor WhatsApp.</span>}
            <a href={`mailto:${k.owner_email}?subject=${encodeURIComponent('PRASARA · ' + k.name)}&body=${encodeURIComponent(msg)}`} onClick={() => record('kirim_email')}><button>Kirim email</button></a>
          </div>
        </section>
      )}

      {can(adminMe, 'customers.override') && (
        <section className="panel">
          <h3>Override akses</h3>
          <p className="small muted" style={{ margin: 0 }}>Untuk kompensasi, uji coba, atau koreksi. Wajib alasan; tercatat di audit. Verifikasi pembayaran biasa lewat menu Langganan.</p>
          <div className="row">
            <Field label="Tindakan"><select value={ov.action} onChange={(e) => setOv({ ...ov, action: e.target.value })}><option value="tambah_coba">Tambah masa coba</option><option value="beri_paket">Beri paket</option><option value="jadikan_gratis">Jadikan Gratis</option></select></Field>
            {ov.action === 'beri_paket' && <Field label="Paket"><select value={ov.plan} onChange={(e) => setOv({ ...ov, plan: e.target.value })}><option value="standar">Standar</option><option value="pro">Pro</option></select></Field>}
            {ov.action !== 'jadikan_gratis' && <Field label={ov.action === 'tambah_coba' ? 'Hari' : 'Bulan'}><input inputMode="numeric" value={ov.value} onChange={(e) => setOv({ ...ov, value: e.target.value })} /></Field>}
          </div>
          <Field label="Alasan (wajib)"><input value={ov.reason} onChange={(e) => setOv({ ...ov, reason: e.target.value })} placeholder="mis. kompensasi gangguan 5 Nov" /></Field>
          <button onClick={override} disabled={ov.reason.trim().length < 5}>Terapkan</button>
        </section>
      )}

      {can(adminMe, 'customers.note') && (
        <section className="panel">
          <h3>Catatan internal</h3>
          <textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="Tidak terlihat oleh pelanggan" aria-label="Catatan baru" />
          <button onClick={addNote} disabled={!note.trim()}>Simpan catatan</button>
          {c.notes.length > 0 && <div className="list">{c.notes.map((n, i) => <div className="li" key={i} style={{ alignItems: 'flex-start' }}><span style={{ whiteSpace: 'pre-wrap' }}>{n.body}<br /><span className="small muted">{n.author}</span></span><span className="small muted" style={{ whiteSpace: 'nowrap' }}>{tgl(String(n.created_at).slice(0, 10))}</span></div>)}</div>}
        </section>
      )}

      <section className="panel">
        <h3>Kronologi</h3>
        <div className="list">{[...c.timeline].reverse().map((t, i) => <div className="li" key={i}><span className="small">{t.what.replace(/\((\w+)\)$/, (_, x) => `(${EMAIL_NAME[x] || x})`)}</span><span className="small muted" style={{ whiteSpace: 'nowrap' }}>{tgl(String(t.at).slice(0, 10))}</span></div>)}</div>
      </section>

      <section className="panel">
        <h3>Pembayaran langganan</h3>
        {c.requests.length === 0 ? <span className="small muted">Belum ada.</span> : <div className="list">{c.requests.map((r, i) => (
          <div className="li" key={i}><span className="small">{PLANS[r.plan]?.name} {r.months} bln · {rp(r.amount)} · {tgl(String(r.created_at).slice(0, 10))}</span><span className={'chip ' + (RQ[r.status]?.[1] || '')}>{RQ[r.status]?.[0] || r.status}</span></div>
        ))}</div>}
      </section>

      <section className="panel">
        <h3>Riwayat tindakan admin</h3>
        {c.log.length === 0 ? <span className="small muted">Belum ada.</span> : <div className="list">{c.log.map((l, i) => <div className="li" key={i}><span className="small">{ACTION[l.action] || l.action}{l.detail?.alasan ? ` — ${l.detail.alasan}` : ''}<br /><span className="muted">{l.actor}</span></span><span className="small muted" style={{ whiteSpace: 'nowrap' }}>{when(l.created_at)}</span></div>)}</div>}
      </section>
    </div>
  );
}
