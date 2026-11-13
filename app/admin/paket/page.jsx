'use client';
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useKos } from '@/components/KosProvider';
import PageHelp from '@/components/PageHelp';
import { Sheet, Field, Loading, Empty, run } from '@/components/ui';
import { rp, tgl, errMsg, parseRp, angka } from '@/lib/format';
import { FEATURE_CODES, LIMIT_CODES } from '@/lib/plan';
import { can } from '@/lib/admin';

const RENEW = { harga_baru: 'Ikut harga baru saat perpanjang', harga_lama: 'Tetap harga lama saat perpanjang' };

// Pricing Plan Manager: setiap perubahan harga/fitur/batas = versi baru (riwayat tersimpan, tercatat di audit)
export default function Paket() {
  const { adminMe } = useKos();
  const [d, setD] = useState(null);
  const [err, setErr] = useState(null);
  const [edit, setEdit] = useState(null);   // {plan, mode:'versi'|'info'|'baru'}
  const [grace, setGrace] = useState('');
  const [tdays, setTdays] = useState('');
  const [promo, setPromo] = useState('');
  const load = () => supabase.rpc('admin_plans').then(({ data, error }) => { if (error) return setErr(errMsg(error)); setD(data); setGrace(String(data.grace_days)); setTdays(String(data.trial_days ?? 14)); setPromo(data.promo_until || ''); });
  useEffect(() => { if (can(adminMe, 'payments.view')) load(); }, [adminMe]);
  if (!can(adminMe, 'payments.view')) return <Empty title="Tidak punya izin melihat paket" />;
  if (err) return <div className="notice bad">{/admin_plans/.test(err) ? 'Database sedang diperbarui. Coba lagi beberapa menit lagi.' : err}</div>;
  if (!d) return <Loading />;
  const manage = can(adminMe, 'plans.manage');
  const saveSetting = async (key, value) => { if (await run(() => supabase.rpc('admin_setting_save', { p_key: key, p_value: value }), 'Pengaturan disimpan', errMsg)) load(); };

  return (
    <div className="stack">
      <div className="row between"><div className="row"><h2>Paket & harga</h2><PageHelp page="admin-paket" /></div>{manage && <button className="primary" onClick={() => setEdit({ mode: 'baru' })}>+ Paket baru</button>}</div>
      <p className="small muted" style={{ margin: 0 }}>Harga per bulan per bisnis. Mengubah harga, fitur, atau batas membuat <b>versi baru</b>; pelanggan yang sudah membayar tetap sampai masa aktifnya habis. {manage ? '' : 'Hanya Super Admin yang bisa mengubah.'}</p>

      {d.plans.map((p) => {
        const v = p.versions?.[0] || {};
        return (
          <section className="panel" key={p.key}>
            <div className="row between">
              <div><h3 style={{ margin: 0 }}>{p.name} <span className="small muted">({p.key})</span></h3><span className="small muted">{p.tagline}</span></div>
              <div className="row">
                {p.is_free && <span className="chip info">Gratis</span>}
                {!p.active && <span className="chip void">Nonaktif</span>}
                {!p.public && <span className="chip void">Tersembunyi</span>}
                <span className="chip">{p.subscribers} bisnis</span>
              </div>
            </div>
            <div className="row between"><b style={{ fontSize: 20 }}>{v.list_price && Number(v.list_price) > Number(v.price) && <s className="small muted" style={{ marginRight: 8 }}>{rp(v.list_price)}</s>}{rp(v.price)}<span className="small muted"> /bulan · versi {v.version}</span></b>{v.renewal && !p.is_free && <span className="small muted">{RENEW[v.renewal]}</span>}</div>
            <div className="small">Batas: {Object.keys(LIMIT_CODES).map((k) => `${LIMIT_CODES[k]} ${v.limits?.[k] ?? 'tanpa batas'}`).join(' · ')}</div>
            <div className="row" style={{ gap: 4 }}>{(v.features || []).length ? v.features.map((f) => <span key={f} className="chip good">{FEATURE_CODES[f] || f}</span>) : <span className="small muted">Fitur dasar saja</span>}</div>
            {(p.terms || []).map((t) => <div className="small" key={t.months}>Paket {t.months} bulan: <b>{rp(t.price)}</b>{t.list_price ? <> (pembanding <s>{rp(t.list_price)}</s>)</> : null}{!t.active && <span className="chip void" style={{ marginLeft: 6 }}>Nonaktif</span>}</div>)}
            {manage && <div className="row">
              <button className="sm primary" onClick={() => setEdit({ mode: 'versi', plan: p })}>Ubah harga / fitur</button>
              {!p.is_free && <button className="sm" onClick={() => setEdit({ mode: 'jangka', plan: p })}>Paket jangka panjang</button>}
              <button className="sm" onClick={() => setEdit({ mode: 'info', plan: p })}>Nama & status</button>
            </div>}
            <details><summary className="small">Riwayat versi ({p.versions?.length || 0})</summary>
              <div className="list">{(p.versions || []).map((x) => (
                <div className="li" key={x.id} style={{ alignItems: 'flex-start' }}>
                  <div className="main"><b className="small">Versi {x.version} · {rp(x.price)}</b><span className="small muted">{x.note} · {x.created_by}</span></div>
                  <span className="small muted" style={{ whiteSpace: 'nowrap' }}>{tgl(String(x.created_at).slice(0, 10))}</span>
                </div>
              ))}</div>
            </details>
          </section>
        );
      })}

      <section className="panel">
        <h3>Pengaturan langganan</h3>
        <Field label="Masa tenggang setelah paket habis (hari)" hint="0–30; fitur tetap terbuka selama masa ini"><input inputMode="numeric" value={grace} onChange={(e) => setGrace(e.target.value.replace(/\D/g, ''))} disabled={!manage} /></Field>
        {manage && <button className="sm" onClick={() => saveSetting('grace_days', parseInt(grace || '0', 10))}>Simpan masa tenggang</button>}
        <Field label="Lama masa coba bisnis baru (hari)" hint="0–90; dihitung sejak bisnis diaktifkan"><input inputMode="numeric" value={tdays} onChange={(e) => setTdays(e.target.value.replace(/\D/g, ''))} disabled={!manage} /></Field>
        {manage && <button className="sm" onClick={() => saveSetting('trial_days', parseInt(tdays || '0', 10))}>Simpan lama masa coba</button>}
        <Field label="Promosi berakhir tanggal" hint="Kosong = harga promosi berlaku sampai Anda ubah. Setelah tanggal ini, harga normal berlaku otomatis."><input type="date" value={promo} onChange={(e) => setPromo(e.target.value)} disabled={!manage} /></Field>
        {manage && <button className="sm" onClick={() => saveSetting('promo_until', promo || null)}>Simpan tanggal promosi</button>}
        <Field label="Paket selama masa coba"><select value={d.trial_plan} disabled={!manage} onChange={(e) => saveSetting('trial_plan', e.target.value)}>{d.plans.map((p) => <option key={p.key} value={p.key}>{p.name}</option>)}</select></Field>
        <span className="small muted">Pembayaran otomatis (payment gateway) belum terhubung: pembayaran masih diverifikasi manual di menu Langganan & pembayaran. Struktur transaksi & rekonsiliasinya sudah disiapkan di database.</span>
      </section>

      {edit?.mode === 'jangka' && <TermSheet p={edit.plan} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); load(); }} />}
      {edit?.mode === 'versi' && <VersionSheet p={edit.plan} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); load(); }} />}
      {(edit?.mode === 'info' || edit?.mode === 'baru') && <InfoSheet p={edit.plan} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); load(); }} />}
    </div>
  );
}

function VersionSheet({ p, onClose, onSaved }) {
  const v = p.versions?.[0] || {};
  const [price, setPrice] = useState(angka(v.price || 0));
  const [list, setList] = useState(v.list_price ? angka(v.list_price) : '');
  const [lim, setLim] = useState(Object.fromEntries(Object.keys(LIMIT_CODES).map((k) => [k, v.limits?.[k] != null ? String(v.limits[k]) : ''])));
  const [feat, setFeat] = useState(new Set(v.features || []));
  const [renewal, setRenewal] = useState('harga_baru');
  const [note, setNote] = useState('');
  const save = async () => {
    const newPrice = parseRp(price);
    if (!window.confirm(`Simpan versi baru ${p.name}: ${rp(newPrice)}/bulan?\nPelanggan yang sudah bayar tidak berubah sampai masa aktifnya habis.`)) return;
    if (await run(() => supabase.rpc('admin_plan_version', { p_key: p.key, p_price: newPrice, p_limits: lim, p_features: [...feat], p_renewal: renewal, p_note: note, p_list_price: list ? parseRp(list) : null }), 'Versi baru disimpan', errMsg)) onSaved();
  };
  return (
    <Sheet title={`Ubah ${p.name}`} onClose={onClose}>
      <Field label="Harga per bulan (yang ditagihkan)"><input inputMode="numeric" value={price} disabled={p.is_free} onChange={(e) => setPrice(angka(parseRp(e.target.value)))} /></Field>
      {!p.is_free && <Field label="Harga normal (ditampilkan dicoret)" hint="Kosongkan bila tidak ada promosi. Harus lebih besar dari harga yang ditagihkan."><input inputMode="numeric" value={list} onChange={(e) => setList(e.target.value ? angka(parseRp(e.target.value)) : '')} /></Field>}
      {Object.entries(LIMIT_CODES).map(([k, l]) => <Field key={k} label={`Batas ${l.toLowerCase()}`} hint="kosongkan = tanpa batas"><input inputMode="numeric" value={lim[k]} onChange={(e) => setLim({ ...lim, [k]: e.target.value.replace(/\D/g, '') })} /></Field>)}
      <span className="label">Fitur</span>
      {Object.entries(FEATURE_CODES).map(([k, l]) => (
        <label key={k} className="row small"><input type="checkbox" style={{ width: 22, minHeight: 22 }} checked={feat.has(k)} onChange={(e) => { const n = new Set(feat); e.target.checked ? n.add(k) : n.delete(k); setFeat(n); }} />{l}</label>
      ))}
      {!p.is_free && <Field label="Pelanggan lama saat perpanjang"><select value={renewal} onChange={(e) => setRenewal(e.target.value)}>{Object.entries(RENEW).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></Field>}
      <Field label="Alasan perubahan (wajib, tercatat)"><input value={note} onChange={(e) => setNote(e.target.value)} placeholder="mis. penyesuaian harga 2027" /></Field>
      <div className="notice">Fitur & batas versi baru langsung berlaku untuk semua bisnis di paket ini. Harga baru berlaku untuk pembelian berikutnya.</div>
      <button className="primary" onClick={save} disabled={note.trim().length < 5}>Simpan versi baru</button>
    </Sheet>
  );
}

function TermSheet({ p, onClose, onSaved }) {
  const cur = (m) => (p.terms || []).find((t) => t.months === m);
  const [months, setMonths] = useState(12);
  const t = cur(months);
  const [f, setF] = useState({ price: t ? angka(t.price) : '', list: t?.list_price ? angka(t.list_price) : '', active: t ? t.active : true, note: '' });
  const pick = (m) => { const x = cur(m); setMonths(m); setF({ price: x ? angka(x.price) : '', list: x?.list_price ? angka(x.list_price) : '', active: x ? x.active : true, note: '' }); };
  const save = async () => {
    if (await run(() => supabase.rpc('admin_plan_term_save', { p_key: p.key, p_months: months, p_price: parseRp(f.price), p_list_price: f.list ? parseRp(f.list) : null, p_active: f.active, p_note: f.note }), 'Paket jangka panjang disimpan', errMsg)) onSaved();
  };
  return (
    <Sheet title={`Jangka panjang ${p.name}`} onClose={onClose}>
      <div className="seg">{[3, 6, 12].map((m) => <button key={m} className={months === m ? 'on' : ''} onClick={() => pick(m)}>{m} bulan</button>)}</div>
      <Field label={`Harga total ${months} bulan (sekali bayar)`}><input inputMode="numeric" value={f.price} onChange={(e) => setF({ ...f, price: angka(parseRp(e.target.value)) })} /></Field>
      <Field label="Harga pembanding (dicoret)" hint="mis. harga bulanan × jumlah bulan. Kosongkan bila tidak ada."><input inputMode="numeric" value={f.list} onChange={(e) => setF({ ...f, list: e.target.value ? angka(parseRp(e.target.value)) : '' })} /></Field>
      <label className="row small"><input type="checkbox" style={{ width: 22, minHeight: 22 }} checked={f.active} onChange={(e) => setF({ ...f, active: e.target.checked })} />Aktif (bisa dipilih pelanggan)</label>
      <Field label="Alasan perubahan (wajib, tercatat)"><input value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} /></Field>
      <div className="notice">Tanpa paket jangka panjang, harga {months} bulan = harga bulanan × {months}. Tagihan yang sudah dibuat tidak berubah.</div>
      <button className="primary" onClick={save} disabled={!f.price || f.note.trim().length < 5}>Simpan</button>
    </Sheet>
  );
}

function InfoSheet({ p, onClose, onSaved }) {
  const isNew = !p;
  const [f, setF] = useState({ key: p?.key || '', name: p?.name || '', tagline: p?.tagline || '', active: p ? p.active : true, public: p ? p.public : false, sort: String(p?.sort ?? 5) });
  const save = async () => {
    if (await run(() => supabase.rpc('admin_plan_save', { p_key: f.key, p_name: f.name, p_tagline: f.tagline, p_active: f.active, p_public: f.public, p_sort: parseInt(f.sort || '0', 10) }), isNew ? 'Paket dibuat — atur harga & fitur' : 'Paket disimpan', errMsg)) onSaved();
  };
  return (
    <Sheet title={isNew ? 'Paket baru' : `Info ${p.name}`} onClose={onClose}>
      {isNew && <Field label="Kode paket" hint="huruf kecil tanpa spasi, mis. bisnis"><input value={f.key} autoCapitalize="none" onChange={(e) => setF({ ...f, key: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '') })} /></Field>}
      <Field label="Nama"><input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="mis. Business" /></Field>
      <Field label="Keterangan singkat"><input value={f.tagline} onChange={(e) => setF({ ...f, tagline: e.target.value })} /></Field>
      <Field label="Urutan tampil"><input inputMode="numeric" value={f.sort} onChange={(e) => setF({ ...f, sort: e.target.value.replace(/\D/g, '') })} /></Field>
      <label className="row small"><input type="checkbox" style={{ width: 22, minHeight: 22 }} checked={f.active} disabled={p?.is_free} onChange={(e) => setF({ ...f, active: e.target.checked })} />Aktif (bisa dibeli/diperpanjang)</label>
      <label className="row small"><input type="checkbox" style={{ width: 22, minHeight: 22 }} checked={f.public} onChange={(e) => setF({ ...f, public: e.target.checked })} />Tampil di halaman depan & menu Langganan</label>
      {isNew && <div className="notice">Paket baru dibuat dengan harga Rp 0 dan tersembunyi. Setelah disimpan, tekan "Ubah harga / fitur" lalu tampilkan bila sudah siap.</div>}
      <button className="primary" onClick={save} disabled={!f.name.trim() || (isNew && f.key.length < 2)}>Simpan</button>
    </Sheet>
  );
}
