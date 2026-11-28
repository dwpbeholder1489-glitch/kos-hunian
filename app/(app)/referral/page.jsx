'use client';
// Referral penghuni (modul p_referral). Setelan di kos.profile.referral (referral_settings_set); catat = referral_add;
// syarat dicek referral_refresh; imbalan = referral_reward: potongan tagihan (invoice_discount_apply) atau komisi tunai (pengeluaran).
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useKos } from '@/components/KosProvider';
import { useData } from '@/lib/useData';
import { PageHeader } from '@/components/Page';
import { Loading, Sheet, Field, run, toast } from '@/components/ui';
import PageHelp from '@/components/PageHelp';
import { rp, tgl, errMsg, parseRp, angka, waLink } from '@/lib/format';
import { canArea } from '@/lib/business';
import { termsFor } from '@/lib/propertyTerms';

const ST = { tercatat: ['Menunggu syarat', 'info'], memenuhi: ['Siap diberi imbalan', 'warn'], diberikan: ['Imbalan diberikan', 'good'], batal: ['Batal', 'void'] };

export default function Referral() {
  const { kos, kosId, ver, bump } = useKos();
  const d = useData();
  const t = termsFor(kos);
  const [rows, setRows] = useState(null);
  const [sheet, setSheet] = useState(null);
  const s = kos?.profile?.referral;
  const load = async () => {
    await supabase.rpc('referral_refresh', { p_kos: kosId }).then(() => {}, () => {});
    const { data } = await supabase.from('referrals').select('*').eq('kos_id', kosId).order('created_at', { ascending: false });
    setRows(data || []);
  };
  useEffect(() => { load(); }, [kosId, ver]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!rows || !d.ready) return <Loading />;
  const money = canArea(kos, 'finance');
  const share = async (occ) => {
    const r = await supabase.rpc('referral_code', { p_occupant: occ.id });
    if (r.error) return toast(errMsg(r.error));
    const text = `Halo ${occ.name}! Ajak teman tinggal di ${kos.name}. Sebutkan kode referral ${r.data} saat mendaftar.${s?.aktif ? ` Kamu dapat ${s.reward === 'diskon' ? 'potongan tagihan' : 'komisi'} ${rp(s.amount)} setelah ${s.syarat === 'masuk' ? 'temanmu masuk' : 'temanmu membayar sewa pertama'}.` : ''}`;
    window.open(waLink(occ.phone, text), '_blank');
  };
  return <div className="stack">
    <PageHeader title="Referral" help={<PageHelp page="referral" />} desc={`${t.tenant} mengajak calon ${t.tenant.toLowerCase()}; imbalan diberikan setelah syarat terpenuhi.`}
      actions={<button className="primary" onClick={() => setSheet({ t: 'add' })}>+ Catat referral</button>} />
    <section className="panel">
      <div className="row between"><b>Program</b>{canArea(kos, 'settings') && <button className="sm" onClick={() => setSheet({ t: 'set' })}>Atur</button>}</div>
      {s?.aktif ? <p className="small" style={{ margin: 0 }}>Imbalan {s.reward === 'diskon' ? 'potongan tagihan sewa pemberi referral' : 'komisi tunai'} {rp(s.amount)} per referral, setelah {s.syarat === 'masuk' ? `${t.tenant.toLowerCase()} baru masuk` : `${t.tenant.toLowerCase()} baru membayar sewa pertama`}. Nilai & jenis imbalan bisa diubah saat memberikan.</p>
        : <p className="small muted" style={{ margin: 0 }}>Program belum diatur. Tentukan imbalan (potongan tagihan atau komisi tunai) dan syaratnya.</p>}
    </section>
    <section className="panel">
      <b>Bagikan kode ke {t.tenant.toLowerCase()} aktif</b>
      <div className="list">{[...d.activeByOcc.keys()].map((id) => d.occById.get(id)).filter(Boolean).slice(0, 50).map((o) => <div className="li" key={o.id}>
        <div className="main"><b>{o.name}</b><span className="small muted">{o.ref_code ? `Kode ${o.ref_code}` : 'Kode dibuat saat dibagikan'}</span></div>
        {o.phone ? <button className="sm" onClick={() => share(o)}>Kirim via WA</button> : <span className="small muted">tanpa No. WA</span>}
      </div>)}</div>
    </section>
    <section className="panel">
      <b>Riwayat referral</b>
      {rows.length === 0 ? <p className="muted small">Belum ada referral.</p> : <div className="list">{rows.map((r) => <button key={r.id} className="li" onClick={() => setSheet({ t: 'detail', r })}>
        <div className="main"><b>{r.referrer_name} → {r.referred_name}</b><span className="small muted">{r.number} · {tgl(r.created_at)}{r.amount ? ` · ${r.reward_kind === 'diskon' ? 'potongan' : 'komisi'} ${rp(r.amount)}` : ''}</span></div>
        <span className={'chip ' + ST[r.status][1]}>{ST[r.status][0]}</span></button>)}</div>}
    </section>
    {sheet?.t === 'set' && <Settings kosId={kosId} s={s} onClose={() => setSheet(null)} onDone={() => { setSheet(null); bump(); }} />}
    {sheet?.t === 'add' && <AddForm d={d} kosId={kosId} t={t} onClose={() => setSheet(null)} onDone={() => { setSheet(null); load(); }} />}
    {sheet?.t === 'detail' && <Detail r={sheet.r} s={s} money={money} onClose={() => setSheet(null)} onDone={() => { setSheet(null); load(); bump(); }} />}
  </div>;
}

function Settings({ kosId, s, onClose, onDone }) {
  const [p, setP] = useState({ aktif: s?.aktif ?? true, reward: s?.reward || 'diskon', amount: s?.amount ? angka(s.amount) : '', syarat: s?.syarat || 'bayar_pertama', note: s?.note || '' });
  const set = (k, v) => setP((x) => ({ ...x, [k]: v }));
  const save = async () => { if (await run(() => supabase.rpc('referral_settings_set', { p_kos: kosId, p: { ...p, amount: parseRp(p.amount) } }), 'Program referral disimpan', errMsg)) onDone(); };
  return <Sheet title="Program referral" onClose={onClose}>
    <span className="label">Imbalan untuk pemberi referral</span>
    <div className="seg">{[['diskon', 'Potongan tagihan sewa'], ['komisi', 'Komisi tunai']].map(([k, l]) => <button key={k} className={p.reward === k ? 'on' : ''} onClick={() => set('reward', k)}>{l}</button>)}</div>
    <Field label="Nilai imbalan" hint="PRASARA tidak mengisi angka bawaan"><input inputMode="numeric" value={p.amount} onChange={(e) => set('amount', e.target.value)} /></Field>
    <Field label="Syarat"><select value={p.syarat} onChange={(e) => set('syarat', e.target.value)}><option value="bayar_pertama">Setelah penghuni baru membayar sewa pertama</option><option value="masuk">Setelah penghuni baru masuk</option></select></Field>
    <label className="row small"><input type="checkbox" style={{ width: 22, minHeight: 22, flex: 'none' }} checked={p.aktif} onChange={(e) => set('aktif', e.target.checked)} />Program aktif</label>
    <p className="small muted">Potongan tagihan mengurangi tagihan sewa berikutnya yang belum dibayar (pendapatan lebih kecil). Komisi tunai dicatat sebagai pengeluaran "Komisi referral".</p>
    <button className="cta" onClick={save}>Simpan</button>
  </Sheet>;
}

function AddForm({ d, kosId, t, onClose, onDone }) {
  const [p, setP] = useState({ code: '', referrer_occupant_id: '', referrer_name: '', referrer_phone: '', referred_occupant_id: '', referred_booking_id: '', referred_name: '' });
  const set = (k, v) => setP((x) => ({ ...x, [k]: v }));
  const save = async () => { if (await run(() => supabase.rpc('referral_add', { p_kos: kosId, p }), 'Referral dicatat', errMsg)) onDone(); };
  const tenants = d.occupants;
  const books = (d.bookings || []).filter((b) => b.status === 'aktif');
  return <Sheet title="Catat referral" onClose={onClose}>
    <span className="label">Pemberi referral</span>
    <Field label="Kode referral (bila ada)"><input value={p.code} onChange={(e) => set('code', e.target.value.toUpperCase())} placeholder="mis. SIN1234" /></Field>
    {!p.code && <Field label={`Atau pilih ${t.tenant.toLowerCase()}`}><select value={p.referrer_occupant_id} onChange={(e) => set('referrer_occupant_id', e.target.value)}><option value="">Bukan {t.tenant.toLowerCase()} (isi nama)</option>{tenants.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}</select></Field>}
    {!p.code && !p.referrer_occupant_id && <div className="row"><Field label="Nama"><input value={p.referrer_name} maxLength={80} onChange={(e) => set('referrer_name', e.target.value)} /></Field>
      <Field label="No. WA"><input inputMode="tel" value={p.referrer_phone} onChange={(e) => set('referrer_phone', e.target.value)} /></Field></div>}
    <span className="label">Yang direferensikan</span>
    <Field label={t.tenant}><select value={p.referred_occupant_id} onChange={(e) => set('referred_occupant_id', e.target.value)}><option value="">—</option>{tenants.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}</select></Field>
    {!p.referred_occupant_id && <Field label="Atau booking"><select value={p.referred_booking_id} onChange={(e) => set('referred_booking_id', e.target.value)}><option value="">—</option>{books.map((b) => <option key={b.id} value={b.id}>{b.name} · {b.number}</option>)}</select></Field>}
    {!p.referred_occupant_id && !p.referred_booking_id && <Field label="Atau nama calon"><input value={p.referred_name} maxLength={80} onChange={(e) => set('referred_name', e.target.value)} /></Field>}
    <button className="cta" onClick={save}>Simpan</button>
  </Sheet>;
}

function Detail({ r, s, money, onClose, onDone }) {
  const [kind, setKind] = useState(s?.reward || 'diskon');
  const [amt, setAmt] = useState(s?.amount ? angka(s.amount) : '');
  const [acc, setAcc] = useState('kas');
  const give = async () => {
    if (await run(() => supabase.rpc('referral_reward', { p_ref: r.id, p: { kind, amount: parseRp(amt), account: acc } }), 'Imbalan diberikan', errMsg)) onDone();
  };
  const cancel = async () => { const why = prompt('Alasan membatalkan referral ini?'); if (why && await run(() => supabase.rpc('referral_cancel', { p_ref: r.id, p_reason: why }), 'Referral dibatalkan', errMsg)) onDone(); };
  return <Sheet title={r.number} subtitle={`${r.referrer_name} → ${r.referred_name}`} onClose={onClose}>
    <span className={'chip ' + ST[r.status][1]}>{ST[r.status][0]}</span>
    <ul className="small">{(r.log || []).map((l, i) => <li key={i}>{tgl(l.at)} · {l.action}{l.amount ? ` ${rp(l.amount)}` : ''}{l.note ? ` · ${l.note}` : ''} · {l.by}</li>)}</ul>
    {r.status === 'tercatat' && <p className="small muted">Menunggu syarat: penghuni baru masuk/membayar sewa pertama. Status diperbarui otomatis.</p>}
    {r.status === 'memenuhi' && (money ? <>
      <div className="seg">{[['diskon', 'Potongan tagihan'], ['komisi', 'Komisi tunai']].map(([k, l]) => <button key={k} className={kind === k ? 'on' : ''} onClick={() => setKind(k)}>{l}</button>)}</div>
      <Field label="Nilai"><input inputMode="numeric" value={amt} onChange={(e) => setAmt(e.target.value)} /></Field>
      {kind === 'komisi' && <div className="seg">{[['kas', 'Dari kas'], ['bank', 'Dari bank']].map(([k, l]) => <button key={k} className={acc === k ? 'on' : ''} onClick={() => setAcc(k)}>{l}</button>)}</div>}
      {kind === 'diskon' && <p className="small muted">Dipotong dari tagihan sewa {r.referrer_name} berikutnya yang belum dibayar.</p>}
      <button className="cta" onClick={give}>Berikan imbalan</button>
    </> : <p className="small muted">Imbalan diberikan pemilik/pengelola keuangan.</p>)}
    {['tercatat', 'memenuhi'].includes(r.status) && <button className="ghost danger sm" onClick={cancel}>Batalkan referral</button>}
  </Sheet>;
}
