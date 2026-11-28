'use client';
// Kampanye & voucher properti (modul p_kampanye). Simpan = campaign_save; status = campaign_set_status (aktif → notifikasi tim lewat
// Notification Engine); pakai = campaign_redeem (potongan tagihan sewa lewat invoice_discount_apply, bulan berikutnya otomatis);
// publikasi = public_campaigns di halaman bisnis; WhatsApp = template MANUAL (wa.me) + catatan campaign_send_log. Tanpa API berbayar.
import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useKos } from '@/components/KosProvider';
import { useData } from '@/lib/useData';
import { PageHeader } from '@/components/Page';
import { Loading, Sheet, Field, run, toast } from '@/components/ui';
import PageHelp from '@/components/PageHelp';
import { rp, tgl, errMsg, parseRp, angka, waLink, today } from '@/lib/format';
import { canArea } from '@/lib/business';
import { termsFor } from '@/lib/propertyTerms';

const KIND = { promo: 'Promo (dipakai pengelola)', voucher: 'Voucher (pakai kode)', pengumuman: 'Pengumuman (tanpa potongan)' };
const ST = { draf: ['Draf', 'void'], aktif: ['Aktif', 'good'], selesai: ['Selesai', 'info'], batal: ['Batal', 'void'] };
const DEFAULT_WA = 'Halo {nama}! {bisnis} sedang ada {promo}{kode}. Berlaku sampai {berakhir}. Info & booking: {link}';
const offer = (c) => (c.kind === 'pengumuman' ? c.name : `${c.name} — potongan ${c.discount_kind === 'persen' ? `${Number(c.discount_value)}%` : rp(c.discount_value)}${c.months > 1 ? ` selama ${c.months} bulan` : ''}`);

export default function Kampanye() {
  const { kos, kosId, ver } = useKos();
  const t = termsFor(kos);
  const [rows, setRows] = useState(null);
  const [slug, setSlug] = useState(null);
  const [sheet, setSheet] = useState(null);
  const edit = canArea(kos, 'settings');
  const load = () => supabase.from('campaigns').select('*').eq('kos_id', kosId).order('created_at', { ascending: false }).then(({ data }) => setRows(data || []));
  useEffect(() => {
    load();
    supabase.from('public_pages').select('slug,enabled').eq('kos_id', kosId).maybeSingle().then(({ data }) => setSlug(data?.enabled ? data.slug : ''));
  }, [kosId, ver]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!rows) return <Loading />;
  const setStatus = async (c, s) => { if (await run(() => supabase.rpc('campaign_set_status', { p_id: c.id, p_status: s }), s === 'aktif' ? 'Kampanye aktif · tim diberi tahu' : 'Status diperbarui', errMsg)) load(); };
  return <div className="stack">
    <PageHeader title="Kampanye & voucher" help={<PageHelp page="kampanye" />} desc={`Promosi, voucher potongan sewa, publikasi di halaman bisnis, dan pesan WhatsApp ke ${t.tenant.toLowerCase()} & calon ${t.tenant.toLowerCase()}.`}
      actions={edit && <button className="primary" onClick={() => setSheet({ t: 'form', c: {} })}>+ Kampanye</button>} />
    {rows.length === 0 ? <p className="muted">Belum ada kampanye.</p> : <div className="list">{rows.map((c) => <div key={c.id} className="li" style={{ alignItems: 'flex-start' }}>
      <div className="main"><b>{c.name} <span className={'chip ' + ST[c.status][1]}>{ST[c.status][0]}</span></b>
        <span className="small muted">{KIND[c.kind]}{c.code ? ` · kode ${c.code}` : ''}{c.kind !== 'pengumuman' ? ` · ${c.discount_kind === 'persen' ? `${Number(c.discount_value)}%` : rp(c.discount_value)}${c.months > 1 ? ` × ${c.months} bulan` : ''}` : ''}
          {c.start_date || c.end_date ? ` · ${c.start_date ? tgl(c.start_date) : '…'} – ${c.end_date ? tgl(c.end_date) : '…'}` : ''} · dipakai {c.used}{c.quota ? `/${c.quota}` : ''}{c.publish_portal ? ' · tampil di halaman bisnis' : ''}</span>
        <div className="row" style={{ marginTop: 6 }}>
          {edit && c.status === 'draf' && <button className="sm primary" onClick={() => setStatus(c, 'aktif')}>Aktifkan</button>}
          {c.status === 'aktif' && c.kind !== 'pengumuman' && <button className="sm" onClick={() => setSheet({ t: 'redeem', c })}>Pakai untuk sewa</button>}
          {c.status !== 'batal' && <button className="sm" onClick={() => setSheet({ t: 'wa', c })}>Kirim WhatsApp</button>}
          {edit && c.status !== 'batal' && <button className="sm ghost" onClick={() => setSheet({ t: 'form', c })}>Ubah</button>}
          {edit && c.status === 'aktif' && <button className="sm ghost" onClick={() => setStatus(c, 'selesai')}>Selesai</button>}
          {edit && ['draf', 'aktif'].includes(c.status) && <button className="sm ghost danger" onClick={() => confirm('Batalkan kampanye?') && setStatus(c, 'batal')}>Batal</button>}
        </div></div>
    </div>)}</div>}
    <p className="small muted">Notifikasi otomatis dikirim ke tim (Pusat Notifikasi) saat kampanye diaktifkan. Ke {t.tenant.toLowerCase()} & calon {t.tenant.toLowerCase()}: lewat WhatsApp manual dari HP Anda (tanpa biaya API). {slug === '' && 'Halaman bisnis belum terbit — kampanye belum tampil untuk publik.'}</p>
    {sheet?.t === 'form' && <Form kosId={kosId} c={sheet.c} onClose={() => setSheet(null)} onDone={() => { setSheet(null); load(); }} />}
    {sheet?.t === 'redeem' && <Redeem kosId={kosId} c={sheet.c} onClose={() => setSheet(null)} onDone={() => { setSheet(null); load(); }} />}
    {sheet?.t === 'wa' && <WaSend kos={kos} kosId={kosId} c={sheet.c} slug={slug} onClose={() => setSheet(null)} />}
  </div>;
}

function Form({ kosId, c, onClose, onDone }) {
  const [p, setP] = useState({ name: c.name || '', kind: c.kind || 'promo', start_date: c.start_date || today(), end_date: c.end_date || '', discount_kind: c.discount_kind || 'persen',
    discount_value: c.discount_value ? String(Number(c.discount_value)) : '', max_discount: c.max_discount ? angka(c.max_discount) : '', months: String(c.months || 1), code: c.code || '',
    quota: c.quota ? String(c.quota) : '', publish_portal: c.publish_portal || false, portal_text: c.portal_text || '', wa_template: c.wa_template || DEFAULT_WA, notify_team: c.notify_team !== false });
  const set = (k, v) => setP((x) => ({ ...x, [k]: v }));
  const save = async () => {
    const body = { ...p, discount_value: p.discount_kind === 'persen' ? Number(String(p.discount_value).replace(',', '.')) : parseRp(p.discount_value), max_discount: p.max_discount ? parseRp(p.max_discount) : null };
    if (await run(() => supabase.rpc('campaign_save', { p_kos: kosId, p_id: c.id || null, p: body }), 'Kampanye disimpan', errMsg)) onDone();
  };
  return <Sheet title={c.id ? `Ubah ${c.name}` : 'Kampanye baru'} onClose={onClose}>
    <Field label="Nama"><input value={p.name} maxLength={80} onChange={(e) => set('name', e.target.value)} placeholder="mis. Promo Mahasiswa Baru" /></Field>
    <Field label="Jenis"><select value={p.kind} onChange={(e) => set('kind', e.target.value)}>{Object.entries(KIND).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></Field>
    <div className="row"><Field label="Mulai"><input type="date" value={p.start_date} onChange={(e) => set('start_date', e.target.value)} /></Field>
      <Field label="Berakhir (opsional)"><input type="date" value={p.end_date} onChange={(e) => set('end_date', e.target.value)} /></Field></div>
    {p.kind !== 'pengumuman' && <>
      <div className="row"><Field label="Potongan"><select value={p.discount_kind} onChange={(e) => set('discount_kind', e.target.value)}><option value="persen">Persen (%)</option><option value="nominal">Rupiah</option></select></Field>
        <Field label="Besar"><input inputMode="decimal" value={p.discount_value} onChange={(e) => set('discount_value', e.target.value)} /></Field></div>
      <div className="row">
        {p.discount_kind === 'persen' && <Field label="Maks. potongan (opsional)"><input inputMode="numeric" value={p.max_discount} onChange={(e) => set('max_discount', e.target.value)} /></Field>}
        <Field label="Berlaku untuk tagihan sewa" hint="bulan/periode pertama berturut-turut"><input inputMode="numeric" value={p.months} onChange={(e) => set('months', e.target.value.replace(/\D/g, ''))} /></Field>
      </div>
      <div className="row"><Field label={p.kind === 'voucher' ? 'Kode voucher' : 'Kode (opsional)'}><input value={p.code} maxLength={20} onChange={(e) => set('code', e.target.value.toUpperCase())} placeholder="mis. HEMAT25" /></Field>
        <Field label="Kuota (opsional)"><input inputMode="numeric" value={p.quota} onChange={(e) => set('quota', e.target.value.replace(/\D/g, ''))} /></Field></div>
    </>}
    <label className="row small"><input type="checkbox" style={{ width: 22, minHeight: 22, flex: 'none' }} checked={p.publish_portal} onChange={(e) => set('publish_portal', e.target.checked)} />Tampilkan di halaman bisnis</label>
    {p.publish_portal && <Field label="Teks di halaman bisnis"><textarea value={p.portal_text} maxLength={500} onChange={(e) => set('portal_text', e.target.value)} /></Field>}
    <Field label="Template WhatsApp" hint="{nama} {bisnis} {promo} {kode} {berakhir} {link} diisi otomatis"><textarea value={p.wa_template} maxLength={1000} onChange={(e) => set('wa_template', e.target.value)} /></Field>
    <label className="row small"><input type="checkbox" style={{ width: 22, minHeight: 22, flex: 'none' }} checked={p.notify_team} onChange={(e) => set('notify_team', e.target.checked)} />Beri tahu tim saat diaktifkan (notifikasi aplikasi)</label>
    <button className="cta" onClick={save}>Simpan</button>
  </Sheet>;
}

function Redeem({ kosId, c, onClose, onDone }) {
  const d = useData();
  const [lease, setLease] = useState('');
  if (!d.ready) return null;
  const go = async () => {
    if (!lease) return toast('Pilih sewa.');
    if (await run(() => supabase.rpc('campaign_redeem', { p_kos: kosId, p_lease: lease, p_campaign: c.id, p_code: null }), 'Potongan diterapkan ke tagihan sewa', errMsg)) onDone();
  };
  const active = d.leases.filter((l) => l.status === 'aktif');
  return <Sheet title={`Pakai ${c.name}`} onClose={onClose}>
    <Field label="Sewa"><select value={lease} onChange={(e) => setLease(e.target.value)}><option value="">Pilih…</option>{active.map((l) => <option key={l.id} value={l.id}>{d.roomCode(l.room_id)} · {d.occName(l.occupant_id)}</option>)}</select></Field>
    <p className="small muted">Tagihan sewa yang sudah terbit & belum dibayar langsung dipotong; sisa {c.months} bulan dipotong otomatis saat tagihannya terbit. Tagihan yang sudah dibayar tidak diubah.</p>
    <button className="cta" onClick={go}>Terapkan</button>
  </Sheet>;
}

function WaSend({ kos, kosId, c, slug, onClose }) {
  const d = useData();
  const [who, setWho] = useState('penghuni');
  const [leads, setLeads] = useState([]);
  const [sent, setSent] = useState({});
  useEffect(() => { supabase.from('crm_leads').select('id,name,phone,stage').eq('kos_id', kosId).not('phone', 'is', null).not('stage', 'in', '(jadi,batal)').order('created_at', { ascending: false }).limit(200).then(({ data }) => setLeads(data || [])); }, [kosId]);
  const list = useMemo(() => {
    if (!d.ready) return [];
    if (who === 'prospek') return leads.map((l) => ({ id: l.id, name: l.name, phone: l.phone }));
    return d.occupants.filter((o) => o.phone && (who === 'penghuni' ? d.activeByOcc.has(o.id) : !d.activeByOcc.has(o.id))).map((o) => ({ id: o.id, name: o.name, phone: o.phone }));
  }, [d, who, leads]);
  if (!d.ready) return null;
  const link = slug ? `${location.origin}/b/${slug}` : '';
  const text = (x) => (c.wa_template || DEFAULT_WA).replaceAll('{nama}', x.name.split(' ')[0]).replaceAll('{bisnis}', kos.name).replaceAll('{promo}', offer(c))
    .replaceAll('{kode}', c.code ? ` (kode ${c.code})` : '').replaceAll('{berakhir}', c.end_date ? tgl(c.end_date) : 'persediaan terbatas').replaceAll('{link}', link || kos.contact_phone || '');
  const send = (x) => {
    window.open(waLink(x.phone, text(x)), '_blank');
    setSent((s) => ({ ...s, [x.id]: true }));
    supabase.rpc('campaign_send_log', { p_id: c.id, p_targets: [{ kind: who, id: x.id, name: x.name }] }).then(() => {}, () => {});
  };
  return <Sheet title={`Kirim WhatsApp · ${c.name}`} wide onClose={onClose}>
    <div className="seg">{[['penghuni', 'Penghuni aktif'], ['mantan', 'Mantan penghuni'], ['prospek', 'Calon (CRM)']].map(([k, l]) => <button key={k} className={who === k ? 'on' : ''} onClick={() => setWho(k)}>{l}</button>)}</div>
    {list[0] && <div className="unitbox small"><b>Contoh pesan</b><span style={{ whiteSpace: 'pre-wrap' }}>{text(list[0])}</span></div>}
    {list.length === 0 ? <p className="muted small">Tidak ada nomor WhatsApp pada kelompok ini.</p> : <div className="list">{list.map((x) => <div className="li" key={x.id}>
      <div className="main"><b>{x.name}</b><span className="small muted">{x.phone}</span></div>
      <button className={'sm' + (sent[x.id] ? ' ghost' : ' primary')} onClick={() => send(x)}>{sent[x.id] ? 'Terkirim ✓ (kirim lagi)' : 'Kirim'}</button></div>)}</div>}
    <p className="small muted">Pesan dibuka di WhatsApp Anda; tekan Kirim di WhatsApp. Kirim satu per satu agar tidak dianggap spam. Riwayat pengiriman tercatat.</p>
  </Sheet>;
}
