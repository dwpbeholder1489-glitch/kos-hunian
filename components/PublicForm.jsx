'use client';
import Linkify from '@/components/Linkify';
import { useEffect, useMemo, useRef, useState } from 'react';

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
  const [date, setDate] = useState(''); // kos: rencana masuk; jasa: tanggal jemput/antar
  const [pick, setPick] = useState({}); // id → { unit, qty }
  const [consent, setConsent] = useState(false);
  const [hp, setHp] = useState(''); // jebakan bot (tidak terlihat)
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(null);
  const [err, setErr] = useState('');
  // jasa: pesanan langsung (status "Permintaan masuk" sampai dikonfirmasi pemilik)
  const ord = jasa ? page.order : null;
  const kul = Boolean(ord?.kuliner); // kuliner: tidak ada jemput, "menu" bukan "layanan"
  // QR per meja: /b/slug?meja=N → pesanan makan di tempat untuk meja itu (nomor dicek ulang di server)
  const [meja, setMeja] = useState(null);
  const [mejaBad, setMejaBad] = useState(false);
  const formRef = useRef(null);
  useEffect(() => {
    try {
      const m = new URLSearchParams(window.location.search).get('meja'); if (!m) return;
      const n = parseInt(m, 10);
      if (kul && /^\d{1,3}$/.test(m) && n >= 1 && n <= Number(ord?.tables || 0)) { setMeja(String(n)); setTimeout(() => formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 300); } else setMejaBad(true);
    } catch {}
  }, []);
  const [resv, setResv] = useState(false); // kuliner: tab Reservasi meja
  const [pickup, setPickup] = useState(false);
  const [deliver, setDeliver] = useState(false);
  const [zone, setZone] = useState('');
  const [addr, setAddr] = useState('');
  const [pSlot, setPSlot] = useState('');
  const [dDate, setDDate] = useState('');
  const [dSlot, setDSlot] = useState('');
  const items = (page.items || []).filter((i) => i.available);
  const chosen = Object.entries(pick).filter(([, v]) => Number(String(v.qty).replace(',', '.')) > 0);
  const total = useMemo(() => chosen.reduce((s, [id, v]) => {
    const it = items.find((x) => x.id === id); const u = it?.units.find((x) => x.name === v.unit);
    return s + (u?.price != null ? u.price * Number(String(v.qty).replace(',', '.')) : 0);
  }, 0), [pick]);

  const ordering = Boolean(ord) && chosen.length > 0;
  const logi = ordering && !meja && ord.logistics && (pickup || deliver);
  const phoneOk = phone.replace(/\D/g, '').length >= 9;
  const canSend = meja ? (!phone.trim() || (phoneOk && consent)) : consent && name.trim().length >= 2 && phoneOk;
  const zoneObj = (ord?.zones || []).find((z) => z.id === zone);
  const minDate = new Date(Date.now() + 7 * 36e5).toISOString().slice(0, 10);
  const send = async (e) => {
    e.preventDefault(); setErr('');
    if (logi && (ord.zones || []).length && !zone) return setErr('Pilih wilayah Anda. Bila tidak ada di daftar, hubungi kami lewat WhatsApp.');
    if (logi && addr.trim().length < 5) return setErr('Isi alamat lengkap untuk antar jemput.');
    setBusy(true);
    if (ordering) {
      try {
        const r = await fetch('/api/publik/kirim', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({
          order: true, slug: page.slug, name, phone, note: msg, consent, website: hp, table_no: meja, elapsed: Math.round((Date.now() - started.current) / 1000),
          lines: chosen.map(([id, v]) => ({ service_id: id, qty: Number(String(v.qty).replace(',', '.')) })),
          pickup: logi && pickup, deliver: logi && deliver, address: addr, zone_id: zone || null,
          pickup_date: pickup && date ? date : null, pickup_slot: pickup ? pSlot : null, delivery_date: deliver && dDate ? dDate : null, delivery_slot: deliver ? dSlot : null,
        }) });
        const d = await r.json().catch(() => ({}));
        if (!r.ok || !d.ok) setErr(d.error || 'Gagal mengirim. Coba lagi atau hubungi lewat WhatsApp.');
        else setDone({ order: true, number: d.number, total: d.total, meja });
      } catch { setErr('Koneksi terputus. Coba lagi.'); }
      setBusy(false); return;
    }
    try {
      const r = await fetch('/api/publik/kirim', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({
        slug: page.slug, name, phone, message: msg, date: date || null, consent, website: hp, elapsed: Math.round((Date.now() - started.current) / 1000),
        items: chosen.map(([id, v]) => ({ id, unit: v.unit, qty: Number(String(v.qty).replace(',', '.')) })),
      }) });
      const d = await r.json().catch(() => ({}));
      if (!r.ok || !d.ok) setErr(d.error || 'Gagal mengirim. Coba lagi atau hubungi lewat WhatsApp.');
      else setDone(d.number || 'terkirim');
    } catch { setErr('Koneksi terputus. Coba lagi.'); }
    setBusy(false);
  };

  const canResv = kul && !meja && Number(ord?.tables || 0) > 0;
  const tabs = canResv && <div className="seg"><button type="button" className={!resv ? 'on' : ''} onClick={() => setResv(false)}>Pesan menu</button><button type="button" className={resv ? 'on' : ''} onClick={() => setResv(true)}>Reservasi meja</button></div>;
  if (resv && canResv && !done) return <section className="stack" style={{ gap: 10 }}>{tabs}<ResvPublic page={page} /></section>;
  if (done?.meja) return (
    <section className="panel">
      <h3>Pesanan Meja {done.meja} terkirim!</h3>
      <p style={{ margin: 0 }}>Nomor pesanan <b>{done.number}</b>. Kasir akan mengonfirmasi, lalu pesanan disiapkan dan diantar ke meja Anda.</p>
      {page.show_prices && done.total != null && <span className="small">Total {rp(done.total)}. Pembayaran di kasir.</span>}
      {phone.trim() ? <a href={`/b/${page.slug}/cek?no=${encodeURIComponent(done.number)}`}><button className="primary">Cek status pesanan</button></a> : <span className="small muted">Ingin pesan lagi? Muat ulang halaman ini.</span>}
    </section>
  );
  if (done?.order) return (
    <section className="panel">
      <h3>Pesanan terkirim, {name.trim()}!</h3>
      <p style={{ margin: 0 }}>Nomor pesanan Anda <b>{done.number}</b>. Status: <b>Menunggu konfirmasi</b> dari {page.name}.</p>
      {page.show_prices && done.total != null && <span className="small">Perkiraan total {rp(done.total)}{kul ? ' (belum termasuk ongkos antar bila ada).' : ' — dihitung ulang saat barang diterima (mis. berat sebenarnya).'}</span>}
      <span className="small muted">Pembayaran dilakukan langsung ke {page.name}; pesanan belum dibayar. Simpan nomor pesanan untuk cek status.</span>
      <a href={`/b/${page.slug}/cek?no=${encodeURIComponent(done.number)}`}><button className="primary">Cek status pesanan</button></a>
    </section>
  );
  if (done) return (
    <section className="panel">
      <h3>Terima kasih, {name.trim()}!</h3>
      <p style={{ margin: 0 }}>Permintaan Anda sudah diterima{done !== 'terkirim' ? <> dengan nomor <b>{done}</b></> : ''}. {page.name} akan menghubungi Anda lewat WhatsApp {phone}.</p>
      <span className="small muted">Ini belum pesanan final: harga, ketersediaan, dan pengiriman akan dikonfirmasi oleh {page.name}.</span>
    </section>
  );
  return (
    <>{tabs}<form className="panel stack" onSubmit={send} ref={formRef}>
      {meja && <div className="notice good" style={{ fontSize: 16 }}>🍽 Anda memesan untuk <b>Meja {meja}</b>. Pilih menu, lalu Kirim pesanan.</div>}
      {mejaBad && <div className="notice bad">Nomor meja di QR tidak dikenal. Tanyakan ke kasir, atau pesan biasa di bawah.</div>}
      <h3>{retail ? 'Pesan / tanya barang' : jasa ? (kul ? 'Pesan menu' : 'Pesan / tanya layanan') : 'Tanya / booking kamar'}</h3>
      {ord && !meja && <span className="small muted">Pilih {kul ? 'menu' : 'layanan'} untuk memesan langsung, atau kosongkan untuk bertanya saja.</span>}
      {page.form_intro && <p className="small" style={{ margin: 0 }}><Linkify text={page.form_intro} /></p>}
      {items.length > 0 && <>
        <span className="label">{retail ? 'Pilih barang (opsional)' : jasa ? (kul ? 'Pilih menu' : 'Pilih layanan (opsional)') : 'Pilih kamar (opsional)'}</span>
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
        {total > 0 && <span className="small">Perkiraan: <b>{rp(total)}</b> {meja ? '' : '(belum termasuk ongkos; dikonfirmasi penjual)'}</span>}
      </>}
      {ordering && !meja && ord.logistics && <>
        <span className="label">{kul ? 'Diantar? (opsional — tanpa centang = ambil sendiri)' : 'Antar jemput (opsional)'}</span>
        <div className="row">
          {!kul && <label className="row small" style={{ flexWrap: 'nowrap' }}><input type="checkbox" style={{ width: 22, minHeight: 22, flex: 'none' }} checked={pickup} onChange={(e) => setPickup(e.target.checked)} />Dijemput</label>}
          <label className="row small" style={{ flexWrap: 'nowrap' }}><input type="checkbox" style={{ width: 22, minHeight: 22, flex: 'none' }} checked={deliver} onChange={(e) => setDeliver(e.target.checked)} />Diantar</label>
        </div>
        {logi && <>
          {(ord.zones || []).length > 0 && <label className="f">Wilayah<select value={zone} onChange={(e) => setZone(e.target.value)}><option value="">— pilih wilayah —</option>{ord.zones.map((z) => <option key={z.id} value={z.id}>{z.name}{page.show_prices ? ` · ${Number(z.fee) > 0 ? rp(z.fee) : 'gratis'}` : ''}</option>)}</select></label>}
          {zoneObj?.note && <span className="small muted">{zoneObj.note}</span>}
          <span className="small muted">Hanya wilayah di daftar yang dilayani. Di luar itu, hubungi kami lewat WhatsApp.</span>
          <label className="f">Alamat lengkap<input value={addr} onChange={(e) => setAddr(e.target.value)} maxLength={200} placeholder="jalan, nomor rumah, patokan" autoComplete="street-address" /></label>
          {pickup && <div className="row">
            <label className="f" style={{ flex: 1 }}>Tanggal jemput<input type="date" value={date} min={minDate} onChange={(e) => setDate(e.target.value)} /></label>
            {(ord.slots || []).some((s) => s.kind !== 'antar') && <label className="f" style={{ flex: 1 }}>Jam jemput<select value={pSlot} onChange={(e) => setPSlot(e.target.value)}><option value="">— bebas —</option>{ord.slots.filter((s) => s.kind !== 'antar').map((s) => <option key={s.label}>{s.label}</option>)}</select></label>}
          </div>}
          {deliver && <div className="row">
            <label className="f" style={{ flex: 1 }}>Tanggal antar<input type="date" value={dDate} min={minDate} onChange={(e) => setDDate(e.target.value)} /></label>
            {(ord.slots || []).some((s) => s.kind !== 'jemput') && <label className="f" style={{ flex: 1 }}>Jam antar<select value={dSlot} onChange={(e) => setDSlot(e.target.value)}><option value="">— bebas —</option>{ord.slots.filter((s) => s.kind !== 'jemput').map((s) => <option key={s.label}>{s.label}</option>)}</select></label>}
          </div>}
          {zoneObj && page.show_prices && <span className="small">{kul ? 'Ongkos antar' : 'Ongkos antar jemput'}: <b>{Number(zoneObj.fee) > 0 ? rp(zoneObj.fee) : 'gratis'}</b></span>}
        </>}
      </>}
      {!retail && !ordering && !meja && <label className="f">{jasa ? 'Tanggal jemput / diantar (opsional)' : 'Rencana mulai tinggal'}<input type="date" value={date} min={minDate} onChange={(e) => setDate(e.target.value)} /></label>}
      <label className="f">{ordering ? 'Catatan (opsional)' : retail || jasa ? 'Pesan / kebutuhan' : 'Pesan (mis. berapa orang, pertanyaan)'}<textarea rows={3} maxLength={500} value={msg} onChange={(e) => setMsg(e.target.value)} placeholder={retail ? 'mis. bisa antar ke Desa X? Butuh untuk warung.' : meja ? 'mis. pedas sedang, es teh tanpa gula' : kul && ordering ? 'mis. pedas sedang, tanpa bawang, ambil jam 12' : jasa ? 'mis. bisa dijemput hari ini? Alamat Jl. Melati 12.' : 'mis. mulai 1 Desember, 1 orang, mahasiswi'} /></label>
      <label className="f">{meja ? 'Nama (opsional)' : 'Nama'}<input value={name} onChange={(e) => setName(e.target.value)} maxLength={80} required={!meja} autoComplete="name" placeholder={meja ? `boleh kosong — tercatat "Meja ${meja}"` : undefined} /></label>
      <label className="f">{meja ? 'No. WhatsApp (opsional, untuk cek status)' : 'No. WhatsApp'}<input inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} maxLength={20} required={!meja} autoComplete="tel" placeholder="08…" /></label>
      <div aria-hidden="true" style={{ position: 'absolute', left: '-9999px', width: 1, height: 1, overflow: 'hidden' }}>
        <label>Website<input tabIndex={-1} autoComplete="off" value={hp} onChange={(e) => setHp(e.target.value)} /></label>
      </div>
      {(!meja || phone.trim()) && <label className="row small" style={{ flexWrap: 'nowrap', alignItems: 'flex-start' }}>
        <input type="checkbox" style={{ width: 22, minHeight: 22, flex: 'none' }} checked={consent} onChange={(e) => setConsent(e.target.checked)} />
        <span>Saya setuju nama dan No. WhatsApp ini disimpan {page.name} hanya untuk menghubungi saya tentang permintaan ini.</span>
      </label>}
      {err && <div className="notice bad">{err}</div>}
      {ordering && (meja ? <span className="small muted">Pesanan dikonfirmasi kasir dulu, lalu disiapkan. Bayar di kasir.</span>
        : <span className="small muted">Pesanan masuk sebagai <b>menunggu konfirmasi</b>. {page.name} mengonfirmasi lewat WhatsApp; pembayaran langsung ke {page.name}.</span>)}
      <button className="cta" type="submit" disabled={busy || !canSend || (meja && !ordering)}>{busy ? 'Mengirim…' : ordering ? 'Kirim pesanan' : 'Kirim permintaan'}</button>
    </form></>
  );
}

// Reservasi meja dari halaman bisnis (kuliner): masuk sebagai permintaan, dikonfirmasi lewat WhatsApp
function ResvPublic({ page }) {
  const started = useRef(Date.now());
  const today = new Date(Date.now() + 7 * 36e5).toISOString().slice(0, 10);
  const [f, setF] = useState({ date: today, time: '19:00', party: '2', name: '', phone: '', note: '' });
  const [consent, setConsent] = useState(false);
  const [hp, setHp] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [done, setDone] = useState(null);
  const set = (k, v) => setF({ ...f, [k]: v });
  const send = async (e) => {
    e.preventDefault(); setErr(''); setBusy(true);
    try {
      const r = await fetch('/api/publik/kirim', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({
        reserve: true, slug: page.slug, name: f.name, phone: f.phone, party: f.party, note: f.note, starts_at: `${f.date}T${f.time}:00+07:00`, consent, website: hp,
        elapsed: Math.round((Date.now() - started.current) / 1000) }) });
      const d = await r.json().catch(() => ({}));
      if (!r.ok || !d.ok) setErr(d.error || 'Gagal mengirim. Coba lagi atau hubungi lewat WhatsApp.'); else setDone(d.number);
    } catch { setErr('Koneksi terputus. Coba lagi.'); }
    setBusy(false);
  };
  if (done) return (
    <section className="panel">
      <h3>Permintaan reservasi terkirim!</h3>
      <p style={{ margin: 0 }}>Nomor <b>{done}</b> untuk <b>{f.party} orang</b>, {new Date(`${f.date}T12:00:00+07:00`).toLocaleDateString('id-ID', { timeZone: 'Asia/Jakarta', weekday: 'long', day: 'numeric', month: 'long' })} jam {f.time.replace(':', '.')}.</p>
      <span className="small muted">Reservasi belum pasti sampai {page.name} mengonfirmasi lewat WhatsApp {f.phone}.</span>
    </section>
  );
  return (
    <form className="panel stack" onSubmit={send}>
      <h3>Reservasi meja</h3>
      <div className="row">
        <label className="f" style={{ flex: 1 }}>Tanggal<input type="date" value={f.date} min={today} onChange={(e) => set('date', e.target.value)} required /></label>
        <label className="f" style={{ flex: 1 }}>Jam<input type="time" value={f.time} onChange={(e) => set('time', e.target.value)} required /></label>
      </div>
      <label className="f">Jumlah orang<input inputMode="numeric" value={f.party} onChange={(e) => set('party', e.target.value.replace(/\D/g, ''))} required /></label>
      <label className="f">Catatan (opsional)<textarea rows={2} maxLength={300} value={f.note} onChange={(e) => set('note', e.target.value)} placeholder="mis. ulang tahun, butuh kursi bayi" /></label>
      <label className="f">Nama<input value={f.name} onChange={(e) => set('name', e.target.value)} maxLength={80} required autoComplete="name" /></label>
      <label className="f">No. WhatsApp<input inputMode="tel" value={f.phone} onChange={(e) => set('phone', e.target.value)} maxLength={20} required autoComplete="tel" placeholder="08…" /></label>
      <div aria-hidden="true" style={{ position: 'absolute', left: '-9999px', width: 1, height: 1, overflow: 'hidden' }}><label>Website<input tabIndex={-1} autoComplete="off" value={hp} onChange={(e) => setHp(e.target.value)} /></label></div>
      <label className="row small" style={{ flexWrap: 'nowrap', alignItems: 'flex-start' }}>
        <input type="checkbox" style={{ width: 22, minHeight: 22, flex: 'none' }} checked={consent} onChange={(e) => setConsent(e.target.checked)} />
        <span>Saya setuju nama dan No. WhatsApp ini disimpan {page.name} hanya untuk mengurus reservasi ini.</span>
      </label>
      {err && <div className="notice bad">{err}</div>}
      <span className="small muted">Reservasi dikonfirmasi {page.name} lewat WhatsApp. Tanpa uang muka.</span>
      <button className="cta" type="submit" disabled={busy || !consent || f.name.trim().length < 2 || f.phone.replace(/\D/g, '').length < 9 || !(Number(f.party) > 0)}>{busy ? 'Mengirim…' : 'Kirim permintaan reservasi'}</button>
    </form>
  );
}
