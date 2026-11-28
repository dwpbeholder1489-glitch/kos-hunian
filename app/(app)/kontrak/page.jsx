'use client';
// Kontrak sewa digital (modul p_kontrak). Alur: buat dari template (contract_create) → ubah selama draf (contract_update) → kirim
// (contract_send: isi dibekukan + link pribadi /k/<token>) → penyewa setuju/tolak lewat link → pengelola tanda tangan (contract_owner_sign)
// → aktif; revisi = kontrak baru (contract_revise). Lampiran = mesin attachments (entity 'contract'). Cetak = /dokumen/kontrak/[id].
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { useKos } from '@/components/KosProvider';
import { useData } from '@/lib/useData';
import { PageHeader } from '@/components/Page';
import { Loading, Sheet, Field, run, toast } from '@/components/ui';
import PageHelp from '@/components/PageHelp';
import Lampiran from '@/components/Lampiran';
import { tglTs as tgl, errMsg, waLink } from '@/lib/format';
import { canArea } from '@/lib/business';
import { termsFor } from '@/lib/propertyTerms';

const COLS = 'id,number,lease_id,occupant_id,room_id,template_id,title,body,body_hash,status,sent_at,tenant_name,tenant_approved_at,tenant_note,owner_name,owner_signed_at,revision_of,log,created_at,updated_at';
const ST = { draf: ['Draf', 'void'], menunggu: ['Menunggu persetujuan', 'warn'], aktif: ['Aktif', 'good'], ditolak: ['Ditolak penyewa', 'bad'], batal: ['Batal', 'void'], berakhir: ['Berakhir', 'info'] };
const ACT = { dibuat: 'Dibuat', diubah: 'Diubah', dikirim: 'Dikirim ke penyewa', disetujui_penyewa: 'Disetujui penyewa', ditolak_penyewa: 'Ditolak penyewa',
  ditandatangani_pengelola: 'Ditandatangani pengelola', dibatalkan: 'Dibatalkan', diganti_revisi: 'Diganti revisi', revisi_dari: 'Revisi dari', berakhir: 'Berakhir' };
const VARS = [['nama_penyewa', 'Nama penyewa'], ['hp_penyewa', 'No. HP penyewa'], ['alamat_penyewa', 'Alamat penyewa'], ['kode_kamar', 'Kode kamar/unit'], ['properti', 'Nama properti/gedung'],
  ['fasilitas', 'Fasilitas kamar'], ['tanggal_mulai', 'Tanggal mulai'], ['tanggal_selesai', 'Tanggal selesai'], ['harga_sewa', 'Harga sewa'], ['siklus', 'Siklus bayar'], ['jatuh_tempo_pertama', 'Jatuh tempo pertama'],
  ['deposit', 'Deposit'], ['cara_bayar', 'Cara bayar (Pengaturan)'], ['peraturan', 'Peraturan (Pengaturan)'], ['nama_bisnis', 'Nama bisnis'], ['alamat_bisnis', 'Alamat bisnis'], ['nama_pemilik', 'Nama pemilik'],
  ['nomor_kontrak', 'Nomor kontrak'], ['tanggal_hari_ini', 'Tanggal dibuat'], ['unit_kata', 'KAMAR/UNIT/RUMAH']];

export default function Kontrak() {
  const { kos, kosId, ver } = useKos();
  const sp = useSearchParams();
  const t = termsFor(kos);
  const [tab, setTab] = useState('kontrak');
  const [rows, setRows] = useState(null);
  const [tpl, setTpl] = useState([]);
  const [open, setOpen] = useState(null);
  const [neu, setNeu] = useState(sp.get('sewa') ? { lease: sp.get('sewa') } : sp.get('baru') ? {} : null);
  const load = async () => {
    const [a, b] = await Promise.all([supabase.from('lease_contracts').select(COLS).eq('kos_id', kosId).order('created_at', { ascending: false }),
      supabase.from('contract_templates').select('*').eq('kos_id', kosId).order('name')]);
    setRows(a.data || []); setTpl(b.data || []);
    if (open) setOpen((a.data || []).find((x) => x.id === open.id) || null);
  };
  useEffect(() => { load(); }, [kosId, ver]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!rows) return <Loading />;
  return <div className="stack">
    <PageHeader title="Kontrak sewa" help={<PageHelp page="kontrak" />} desc={`Perjanjian sewa dari template, disetujui ${t.tenant.toLowerCase()} lewat link pribadi, dengan jejak audit & PDF.`}
      actions={<button className="primary" onClick={() => setNeu({})}>+ Kontrak</button>} />
    <div className="seg">{[['kontrak', 'Kontrak'], ['template', 'Template']].map(([k, l]) => <button key={k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>{l}</button>)}</div>
    {tab === 'kontrak' ? (rows.length === 0 ? <p className="muted">Belum ada kontrak. Buat dari sewa yang sedang berjalan.</p> :
      <div className="list">{rows.map((c) => <button key={c.id} className="li" onClick={() => setOpen(c)}>
        <div className="main"><b>{c.title}</b><span className="small muted">{c.number} · {tgl(c.created_at)}{c.tenant_approved_at ? ` · disetujui ${tgl(c.tenant_approved_at)}` : ''}</span></div>
        <span className={'chip ' + ST[c.status][1]}>{ST[c.status][0]}</span></button>)}</div>)
      : <Templates kos={kos} kosId={kosId} rows={tpl} onChange={load} />}
    {neu && <NewContract kosId={kosId} tpl={tpl} init={neu} t={t} onClose={() => setNeu(null)} onDone={async (id) => { setNeu(null); await load(); const { data } = await supabase.from('lease_contracts').select(COLS).eq('id', id).single(); setOpen(data); }} />}
    {open && <Detail kos={kos} c={open} onClose={() => setOpen(null)} onChange={load} onOpen={async (id) => { const { data } = await supabase.from('lease_contracts').select(COLS).eq('id', id).single(); await load(); setOpen(data); }} />}
  </div>;
}

function NewContract({ kosId, tpl, init, t, onClose, onDone }) {
  const d = useData();
  const [lease, setLease] = useState(init.lease || '');
  const [template, setTemplate] = useState(tpl.find((x) => x.is_default && x.active)?.id || '');
  if (!d.ready) return null;
  const go = async () => {
    if (!lease) return toast('Pilih sewa.');
    const { data, error } = await supabase.rpc('contract_create', { p_kos: kosId, p_lease: lease, p_template: template || null });
    if (error) return toast(errMsg(error));
    onDone(data);
  };
  return <Sheet title="Kontrak baru" onClose={onClose}>
    <Field label="Sewa"><select value={lease} onChange={(e) => setLease(e.target.value)}><option value="">Pilih…</option>
      {d.leases.filter((l) => l.status === 'aktif').map((l) => <option key={l.id} value={l.id}>{t.unit} {d.roomCode(l.room_id)} · {d.occName(l.occupant_id)}</option>)}</select></Field>
    <Field label="Template"><select value={template} onChange={(e) => setTemplate(e.target.value)}><option value="">Template bawaan PRASARA</option>{tpl.filter((x) => x.active).map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select></Field>
    <p className="small muted">Isian (nama, kamar, harga, tanggal, deposit, peraturan, cara bayar) diisi otomatis dari data sewa. Periksa & ubah isinya sebelum dikirim.</p>
    <button className="cta" onClick={go}>Buat draf</button>
  </Sheet>;
}

function Detail({ kos, c, onClose, onChange, onOpen }) {
  const [title, setTitle] = useState(c.title);
  const [body, setBody] = useState(c.body);
  const [link, setLink] = useState(null);
  const [sign, setSign] = useState('');
  const owner = canArea(kos, 'settings');
  useEffect(() => { setTitle(c.title); setBody(c.body); setLink(null); }, [c.id, c.status]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (['menunggu', 'aktif', 'ditolak', 'berakhir'].includes(c.status)) supabase.rpc('contract_link', { p_id: c.id }).then(({ data }) => setLink(data ? `${location.origin}/k/${data}` : null)); }, [c.id, c.status]);
  const act = async (fn, ok) => { if (await run(fn, ok, errMsg)) onChange(); };
  const send = async () => {
    const { data, error } = await supabase.rpc('contract_send', { p_id: c.id });
    if (error) return toast(errMsg(error));
    setLink(`${location.origin}/k/${data.token}`); toast('Kontrak dikirim. Bagikan link ke penyewa.'); onChange();
  };
  const tenantPhone = async () => { const { data } = await supabase.from('occupants').select('phone,name').eq('id', c.occupant_id).maybeSingle(); return data; };
  const shareWa = async () => {
    const o = await tenantPhone();
    window.open(waLink(o?.phone, `Halo ${o?.name || ''}, berikut perjanjian sewa ${c.number} dari ${kos.name}. Mohon dibaca lalu tekan Setuju (atau Tolak dengan alasan): ${link}`), '_blank');
  };
  return <Sheet title={c.number} subtitle={c.title} wide onClose={onClose}>
    <span className={'chip ' + ST[c.status][1]}>{ST[c.status][0]}</span>
    {c.status === 'draf' ? <>
      <Field label="Judul"><input value={title} maxLength={120} onChange={(e) => setTitle(e.target.value)} /></Field>
      <Field label="Isi kontrak" hint="Masih bisa diubah. Setelah dikirim, isi dibekukan."><textarea value={body} rows={16} onChange={(e) => setBody(e.target.value)} style={{ fontFamily: 'inherit' }} /></Field>
      <div className="row">
        <button onClick={() => act(() => supabase.rpc('contract_update', { p_id: c.id, p_title: title, p_body: body }), 'Draf disimpan')}>Simpan draf</button>
        <button className="primary" onClick={async () => { if (title !== c.title || body !== c.body) { const r = await supabase.rpc('contract_update', { p_id: c.id, p_title: title, p_body: body }); if (r.error) return toast(errMsg(r.error)); } send(); }}>Kirim ke penyewa</button>
      </div>
    </> : <details><summary>Lihat isi kontrak</summary><div style={{ whiteSpace: 'pre-wrap', fontSize: 14 }}>{c.body}</div></details>}
    {link && <div className="unitbox small" style={{ gap: 6 }}><b>Link pribadi penyewa</b><span style={{ overflowWrap: 'anywhere' }}>{link}</span>
      <div className="row"><button className="sm" onClick={() => navigator.clipboard?.writeText(link).then(() => toast('Link disalin'))}>Salin</button><button className="sm primary" onClick={shareWa}>Kirim via WA</button></div></div>}
    {c.status === 'menunggu' && !c.owner_signed_at && (owner ? <div className="row">
      <Field label="Tanda tangan pengelola (ketik nama lengkap)"><input value={sign} maxLength={80} onChange={(e) => setSign(e.target.value)} /></Field>
      <button className="primary" onClick={() => act(() => supabase.rpc('contract_owner_sign', { p_id: c.id, p_name: sign }), 'Ditandatangani')}>Tanda tangani</button></div>
      : <p className="small muted">Pemilik/pengelola menandatangani kontrak.</p>)}
    {c.status === 'ditolak' && <div className="notice small">Alasan penyewa: {c.tenant_note}. Pakai Revisi untuk membuat versi baru.</div>}
    <dl className="kv">
      <dt>Penyewa</dt><dd>{c.tenant_approved_at ? `${c.tenant_name} · ${new Date(c.tenant_approved_at).toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' })}` : 'Belum menyetujui'}</dd>
      <dt>Pengelola</dt><dd>{c.owner_signed_at ? `${c.owner_name} · ${new Date(c.owner_signed_at).toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' })}` : 'Belum menandatangani'}</dd>
      {c.body_hash && <><dt>Kode isi</dt><dd style={{ overflowWrap: 'anywhere', fontSize: 11 }}>{c.body_hash}</dd></>}
    </dl>
    <details><summary>Jejak audit ({(c.log || []).length})</summary><ul className="small">{(c.log || []).map((l, i) => <li key={i}>{new Date(l.at).toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' })} · {ACT[l.action] || l.action}{l.note ? ` · ${l.note}` : ''} · {l.by}</li>)}</ul></details>
    <Lampiran entity="contract" id={c.id} title="Dokumen pendukung" hint="Scan KTP, kontrak bertanda tangan basah, dll. (privat)" />
    <div className="row">
      <Link href={`/dokumen/kontrak/${c.id}`}>Cetak / PDF</Link>
      {['menunggu', 'ditolak', 'aktif'].includes(c.status) && (c.status !== 'aktif' || owner) && <button className="sm" onClick={async () => { const { data, error } = await supabase.rpc('contract_revise', { p_id: c.id }); if (error) return toast(errMsg(error)); onOpen(data); }}>Revisi</button>}
      {!['batal', 'berakhir'].includes(c.status) && (c.status !== 'aktif' || owner) && <button className="sm ghost danger" onClick={() => { const why = prompt('Alasan membatalkan kontrak?'); if (why) act(() => supabase.rpc('contract_cancel', { p_id: c.id, p_reason: why }), 'Kontrak dibatalkan'); }}>Batalkan</button>}
    </div>
  </Sheet>;
}

function Templates({ kos, kosId, rows, onChange }) {
  const [form, setForm] = useState(null);
  const edit = canArea(kos, 'settings');
  const start = async () => { const { data } = await supabase.rpc('contract_default_body'); setForm({ name: 'Perjanjian sewa', body: data || '', is_default: rows.length === 0 }); };
  return <>
    <p className="small muted">Tanpa template, kontrak memakai template bawaan PRASARA. Template ini contoh umum — sesuaikan dengan kebutuhan & aturan setempat (PRASARA bukan penasihat hukum).</p>
    {rows.length > 0 && <div className="list">{rows.map((x) => <button key={x.id} className="li" onClick={() => edit && setForm(x)}><div className="main"><b>{x.name}</b>
      <span className="small muted">{x.is_default ? 'Bawaan · ' : ''}{x.active ? 'Aktif' : 'Nonaktif'}</span></div></button>)}</div>}
    {edit && <button className="primary" onClick={start}>+ Template (mulai dari bawaan)</button>}
    {form && <Sheet title={form.id ? `Ubah ${form.name}` : 'Template baru'} wide onClose={() => setForm(null)}>
      <Field label="Nama"><input value={form.name} maxLength={80} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
      <Field label="Isi"><textarea rows={18} value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })} /></Field>
      <details><summary>Isian otomatis yang tersedia</summary><ul className="small">{VARS.map(([k, l]) => <li key={k}><code>{`{${k}}`}</code> — {l}</li>)}</ul></details>
      <label className="row small"><input type="checkbox" style={{ width: 22, minHeight: 22, flex: 'none' }} checked={form.is_default} onChange={(e) => setForm({ ...form, is_default: e.target.checked })} />Jadikan template bawaan</label>
      {form.id && <label className="row small"><input type="checkbox" style={{ width: 22, minHeight: 22, flex: 'none' }} checked={form.active !== false} onChange={(e) => setForm({ ...form, active: e.target.checked })} />Aktif</label>}
      <button className="cta" onClick={async () => { if (await run(() => supabase.rpc('contract_template_save', { p_kos: kosId, p_id: form.id || null, p: form }), 'Template disimpan', errMsg)) { setForm(null); onChange(); } }}>Simpan</button>
    </Sheet>}
  </>;
}
