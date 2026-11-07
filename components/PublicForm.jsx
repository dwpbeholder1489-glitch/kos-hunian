'use client';
import Linkify from '@/components/Linkify';
import { useMemo, useRef, useState } from 'react';

const rp = (n) => 'Rp' + new Intl.NumberFormat('id-ID').format(Math.round(Number(n) || 0));

// Formulir permintaan di halaman bisnis publik. Kiriman = permintaan/prospek, bukan pesanan final;
// harga & ketersediaan dikonfirmasi pemilik. Anti-spam: kolom jebakan, waktu isi minimal, batas per perangkat (di server).
export default function PublicForm({ page }) {
  const started = useRef(Date.now());
  const retail = page.type === 'retail';
  const jasa = page.type === 'jasa';
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [msg, setMsg] = useState('');
  const [pick, setPick] = useState({}); // id → { unit, qty }
  const [consent, setConsent] = useState(false);
  const [hp, setHp] = useState(''); // jebakan bot (tidak terlihat)
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(null);
  const [err, setErr] = useState('');
  const items = (page.items || []).filter((i) => i.available);
  const chosen = Object.entries(pick).filter(([, v]) => Number(String(v.qty).replace(',', '.')) > 0);
  const total = useMemo(() => chosen.reduce((s, [id, v]) => {
    const it = items.find((x) => x.id === id); const u = it?.units.find((x) => x.name === v.unit);
    return s + (u?.price != null ? u.price * Number(String(v.qty).replace(',', '.')) : 0);
  }, 0), [pick]);

  const send = async (e) => {
    e.preventDefault(); setErr('');
    setBusy(true);
    try {
      const r = await fetch('/api/publik/kirim', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({
        slug: page.slug, name, phone, message: msg, consent, website: hp, elapsed: Math.round((Date.now() - started.current) / 1000),
        items: chosen.map(([id, v]) => ({ id, unit: v.unit, qty: Number(String(v.qty).replace(',', '.')) })),
      }) });
      const d = await r.json().catch(() => ({}));
      if (!r.ok || !d.ok) setErr(d.error || 'Gagal mengirim. Coba lagi atau hubungi lewat WhatsApp.');
      else setDone(d.number || 'terkirim');
    } catch { setErr('Koneksi terputus. Coba lagi.'); }
    setBusy(false);
  };

  if (done) return (
    <section className="panel">
      <h3>Terima kasih, {name.trim()}!</h3>
      <p style={{ margin: 0 }}>Permintaan Anda sudah diterima{done !== 'terkirim' ? <> dengan nomor <b>{done}</b></> : ''}. {page.name} akan menghubungi Anda lewat WhatsApp {phone}.</p>
      <span className="small muted">Ini belum pesanan final: harga, ketersediaan, dan pengiriman akan dikonfirmasi oleh {page.name}.</span>
    </section>
  );
  return (
    <form className="panel stack" onSubmit={send}>
      <h3>{retail ? 'Pesan / tanya barang' : jasa ? 'Pesan / tanya layanan' : 'Tanya / booking kamar'}</h3>
      {page.form_intro && <p className="small" style={{ margin: 0 }}><Linkify text={page.form_intro} /></p>}
      {items.length > 0 && <>
        <span className="label">{retail ? 'Pilih barang (opsional)' : jasa ? 'Pilih layanan (opsional)' : 'Pilih kamar (opsional)'}</span>
        <div className="list">{items.map((it) => {
          const v = pick[it.id];
          return (
            <div className="li" key={it.id} style={{ alignItems: 'center', flexWrap: 'wrap', gap: 6 }}>
              <label className="row small" style={{ flex: 1, minWidth: 160, flexWrap: 'nowrap' }}>
                <input type="checkbox" style={{ width: 22, minHeight: 22, flex: 'none' }} checked={Boolean(v)} onChange={(e) => setPick((p) => { const n = { ...p }; if (e.target.checked) n[it.id] = { unit: it.units[0]?.name, qty: '1' }; else delete n[it.id]; return n; })} />
                {it.name}
              </label>
              {v && <div className="row" style={{ flexWrap: 'nowrap', gap: 6 }}>
                <input inputMode="decimal" value={v.qty} onChange={(e) => setPick({ ...pick, [it.id]: { ...v, qty: e.target.value } })} style={{ width: 70 }} aria-label={`Jumlah ${it.name}`} />
                {it.units.length > 1 ? <select value={v.unit} onChange={(e) => setPick({ ...pick, [it.id]: { ...v, unit: e.target.value } })} aria-label="Satuan" style={{ width: 100 }}>{it.units.map((u) => <option key={u.name} value={u.name}>{u.name}</option>)}</select> : <span className="small">{it.units[0]?.name}</span>}
              </div>}
            </div>
          );
        })}</div>
        {total > 0 && <span className="small">Perkiraan: <b>{rp(total)}</b> (belum termasuk ongkos; dikonfirmasi penjual)</span>}
      </>}
      <label className="f">{retail || jasa ? 'Pesan / kebutuhan' : 'Pesan (mis. mulai kapan, berapa orang)'}<textarea rows={3} maxLength={500} value={msg} onChange={(e) => setMsg(e.target.value)} placeholder={retail ? 'mis. bisa antar ke Desa X? Butuh untuk warung.' : jasa ? 'mis. bisa dijemput hari ini? Alamat Jl. Melati 12.' : 'mis. mulai 1 Desember, 1 orang, mahasiswi'} /></label>
      <label className="f">Nama<input value={name} onChange={(e) => setName(e.target.value)} maxLength={80} required autoComplete="name" /></label>
      <label className="f">No. WhatsApp<input inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} maxLength={20} required autoComplete="tel" placeholder="08…" /></label>
      <div aria-hidden="true" style={{ position: 'absolute', left: '-9999px', width: 1, height: 1, overflow: 'hidden' }}>
        <label>Website<input tabIndex={-1} autoComplete="off" value={hp} onChange={(e) => setHp(e.target.value)} /></label>
      </div>
      <label className="row small" style={{ flexWrap: 'nowrap', alignItems: 'flex-start' }}>
        <input type="checkbox" style={{ width: 22, minHeight: 22, flex: 'none' }} checked={consent} onChange={(e) => setConsent(e.target.checked)} />
        <span>Saya setuju nama dan No. WhatsApp ini disimpan {page.name} hanya untuk menghubungi saya tentang permintaan ini.</span>
      </label>
      {err && <div className="notice bad">{err}</div>}
      <button className="cta" type="submit" disabled={busy || !consent || name.trim().length < 2 || phone.replace(/\D/g, '').length < 9}>{busy ? 'Mengirim…' : 'Kirim permintaan'}</button>
    </form>
  );
}
