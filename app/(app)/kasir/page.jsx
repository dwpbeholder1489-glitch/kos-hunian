'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { ScanButton, cameraScanSupported } from '@/components/BarcodeScan';
import { moduleOn, canArea } from '@/lib/business';
import { supabase } from '@/lib/supabase';
import { useKos } from '@/components/KosProvider';
import PageHelp from '@/components/PageHelp';
import { PageHeader } from '@/components/Page';
import LokasiBar from '@/components/LokasiBar';
import ListThumb, { useThumbs } from '@/components/media/ListThumb';
import { Sheet, Field, Loading, Empty, run, toast } from '@/components/ui';
import { rp, angka, parseRp, errMsg, today } from '@/lib/format';
import { qtyNum, unitsOf, stockText, isLow, unitPrice, breakPrice, uid, PAY, PAY_ALL, splitSerials } from '@/lib/retail';
import { toBase } from '@/lib/units';
import { useMedia } from '@/components/Page';
import { saveCatalog, loadCatalog, isNetErr, enqueue, deviceId, localNumber, pendingStock, pendingOf, online as isOnline } from '@/lib/offline';
import { useNet, useQueue, AntreanSheet, OfflineStrukSheet, waktu } from '@/components/KasirOffline';

// Harga dasar = sama dengan price_resolve di server: daftar harga pelanggan (bila berlaku) › harga outlet/umum
// (katalog sudah membawa harga outlet lokasi ini). Pratinjau saja — angka resmi dihitung server saat disimpan.
const listPrice = (d, contactId, pid, unit) => {
  const c = contactId ? d.contacts.find((x) => x.id === contactId) : null;
  if (!c?.price_list_id) return null;
  const it = (d.listItems || []).find((x) => x.list_id === c.price_list_id && x.product_id === pid && x.unit === unit);
  return it ? Number(it.price) : null;
};
const basePrice = (d, u, tier, contactId) => listPrice(d, contactId, u.product_id, u.name) ?? unitPrice(u, tier);
// Harga otomatis mengikuti pelanggan & jumlah (harga per jumlah beli); baris berharga manual tidak diubah
function reprice(cart, d, tier, contactId) {
  return cart.map((c) => {
    if (!c.auto) return c;
    const u = d.units.find((x) => x.product_id === c.product_id && x.name === c.unit);
    if (!u) return c;
    return { ...c, price: breakPrice(d.breaks, c.product_id, c.unit, tier, c.qty, basePrice(d, u, tier, contactId)) };
  });
}
const cartKey = (k) => 'prasara.cart.' + k;
const heldKey = (k) => 'prasara.held.' + k;   // transaksi ditahan (per perangkat)
const lastKey = (k) => 'prasara.lastsale.' + k;

export default function Kasir() {
  const { kosId, session } = useKos();
  const uid = session?.user?.id;
  if (!uid || !kosId) return null;
  const accountKey = uid + ':' + kosId;
  return <KasirWorkspace key={accountKey} accountKey={accountKey} uid={uid} />;
}

function KasirWorkspace({ accountKey, uid: accountId }) {
  const { kos, kosId, ver, session } = useKos();
  const [raw, setD] = useState(null);
  const online = useNet();
  const queue = useQueue();
  const [antre, setAntre] = useState(false);
  const [err, setErr] = useState(null);
  const [q, setQ] = useState('');
  const [tier, setTier] = useState('ecer');
  const [cart, setCart] = useState([]);
  const [lead, setLead] = useState(null); // permintaan halaman bisnis yang sedang diproses {id, number, name, phone}
  const [done, setDone] = useState(null);
  const [shift, setShift] = useState(undefined);
  const [catF, setCatF] = useState('');   // saring per kategori
  // Pelanggan, diskon & catatan diatur dari bilah aksi (F2/F3/F4) dan ikut tersimpan bersama keranjang
  const [contact, setContact] = useState('');
  const [discount, setDiscount] = useState('');
  const [note, setNote] = useState('');
  const [held, setHeld] = useState([]);      // transaksi ditahan (di perangkat ini)
  const [sheet, setSheet] = useState(null);  // 'cust' | 'note' | 'held' | {units: product}
  const [cmd, setCmd] = useState({ k: '', n: 0 });  // perintah ke panel bayar: 'pay' | 'disc'
  const [lastSale, setLastSale] = useState(null);
  // nama kasir dari sesi (tetap ada saat offline)
  const who = (() => { const u = session?.user; return u?.user_metadata?.name || u?.user_metadata?.full_name || (u?.email || '').split('@')[0] || ''; })();
  // ≥1180px: katalog + keranjang berdampingan (gambar acuan Kasir). Lebih sempit (HP, tablet, laptop kecil dengan sidebar): katalog geser, keranjang di bawahnya + bilah Bayar.
  const desk = useMedia('(min-width: 1180px)');
  const [seq, setSeq] = useState(0); // naik setiap transaksi tersimpan → panel bayar dibuat ulang (nomor transaksi baru)
  const thumbs = useThumbs(kosId, 'product', ver);
  const searchRef = useRef(null);
  const cartRef = useRef(null);
  useEffect(() => { supabase.rpc('shift_current', { p_kos: kosId }).then(({ data, error }) => setShift(error ? undefined : data)); }, [kosId, ver, done]);

  const load = async () => {
    // katalog kasir dari database tanpa harga modal (aman untuk karyawan kasir); salinannya disimpan di HP untuk Kasir offline
    const { data, error } = await supabase.rpc('kasir_catalog', { p_kos: kosId });
    if (error) {
      if (isNetErr(error)) {
        const c = await loadCatalog(accountId, kosId);
        if (c?.data) { setErr(null); return setD({ ...c.data, offline: true, cachedAt: c.at }); }
        return setErr('OFFLINE_KOSONG');
      }
      return setErr(errMsg(error));
    }
    const c = await supabase.from('product_categories').select('id, name, sort').eq('kos_id', kosId).order('sort').order('name');
    const next = { products: data.products, units: data.units, contacts: data.customers, cats: c.data || [], breaks: data.breaks || [], policy: data.stock_policy || 'izinkan',
      listItems: data.list_items || [], pricePolicy: data.price_policy || {} };
    setErr(null); setD(next);
    saveCatalog(accountId, kosId, next);
  };
  useEffect(() => { load(); }, [kosId, ver]);
  // internet kembali / antrean terkirim → muat ulang katalog (stok terbaru dari server)
  const sentN = queue.filter((e) => e.kos === kosId && e.state !== 'antre').length;
  useEffect(() => { if (online && raw) load(); }, [online, sentN]); // eslint-disable-line react-hooks/exhaustive-deps
  // Stok yang tampil = stok terakhir − penjualan di HP yang belum terkirim; pelanggan baru buatan HP ikut terdaftar
  const pend = useMemo(() => pendingStock(queue, kosId), [queue, kosId]);
  const d = useMemo(() => {
    if (!raw) return raw;
    const extra = [];
    for (const e of pendingOf(queue, kosId)) {
      if (e.user !== accountId) continue;
      const nc = e.payload?.new_contact;
      if (nc?.key && !raw.contacts.some((x) => x.id === nc.key) && !extra.some((x) => x.id === nc.key)) extra.push({ id: nc.key, name: nc.name, phone: nc.phone, local: true });
    }
    return { ...raw, offline: raw.offline || !online, products: raw.products.map((p) => (pend[p.id] ? { ...p, stock: Number(p.stock) - pend[p.id] } : p)), contacts: [...raw.contacts, ...extra] };
  }, [raw, pend, online, queue, kosId, accountId]);
  const ownQueue = queue.filter((e) => e.kos === kosId && e.user === accountId);
  const waiting = pendingOf(ownQueue).length;
  const needsAttention = ownQueue.some((e) => e.state === 'gagal' || e.state === 'perlu_cek' || e.err);
  // Keranjang (dan pelanggan/diskon/catatan) disimpan di perangkat ini supaya tidak hilang saat pindah menu
  useEffect(() => {
    try {
      const s = JSON.parse(localStorage.getItem(cartKey(accountKey)) || 'null');
      if (s) { setCart(s.cart || []); setTier(s.tier || 'ecer'); setLead(s.lead || null); setContact(s.contact || ''); setDiscount(s.discount || ''); setNote(s.note || ''); }
      setHeld(JSON.parse(localStorage.getItem(heldKey(accountKey)) || '[]'));
      setLastSale(localStorage.getItem(lastKey(accountKey)) || null);
    } catch {}
  }, [accountKey]);
  useEffect(() => { try { localStorage.setItem(cartKey(accountKey), JSON.stringify({ cart, tier, lead, contact, discount, note })); } catch {} }, [cart, tier, lead, contact, discount, note, accountKey]);
  const saveHeld = (h) => { setHeld(h); try { localStorage.setItem(heldKey(accountKey), JSON.stringify(h)); } catch {} };

  const shown = useMemo(() => {
    if (!d) return [];
    const w = q.trim().toLowerCase().split(/\s+/).filter(Boolean);
    const codes = (p) => [p.sku, ...d.units.filter((u) => u.product_id === p.id).flatMap((u) => [u.barcode, ...(u.codes || [])])].filter(Boolean).map((x) => x.toLowerCase());
    const list = d.products.filter((p) => (!catF || (catF === '-' ? !p.category_id : p.category_id === catF))
      && (w.every((x) => (p.name + ' ' + (p.brand || '')).toLowerCase().includes(x)) || (w.length === 1 && codes(p).some((c) => c === w[0] || c.startsWith(w[0])))));
    // tanpa pencarian: barang favorit (☆) tampil paling depan
    if (!w.length) list.sort((a, b) => (b.favorite ? 1 : 0) - (a.favorite ? 1 : 0));
    return list.slice(0, catF || w.length ? 120 : 60);
  }, [d, q, catF]);

  const clearAll = () => { setCart([]); setLead(null); setContact(''); setDiscount(''); setNote(''); };
  // Tahan: keranjang disimpan di daftar tunggu perangkat ini, kasir bisa melayani pembeli berikutnya
  const hold = () => {
    if (!cart.length) return toast('Keranjang kosong — tidak ada yang ditahan.');
    const c = contact ? d?.contacts.find((x) => x.id === contact) : null;
    saveHeld([{ id: uid(), at: new Date().toISOString(), cart, tier, lead, contact, discount, note, label: c?.name || lead?.name || '' }, ...held].slice(0, 20));
    clearAll(); toast('Transaksi ditahan. Buka lagi lewat tombol Ditahan.');
  };
  const resume = (h) => {
    const rest = held.filter((x) => x.id !== h.id);
    if (cart.length) { const c = contact ? d?.contacts.find((x) => x.id === contact) : null; rest.unshift({ id: uid(), at: new Date().toISOString(), cart, tier, lead, contact, discount, note, label: c?.name || lead?.name || '' }); }
    saveHeld(rest); setCart(h.cart || []); setTier(h.tier || 'ecer'); setLead(h.lead || null); setContact(h.contact || ''); setDiscount(h.discount || ''); setNote(h.note || ''); setSheet(null);
    toast(cart.length ? 'Keranjang sebelumnya ikut ditahan.' : 'Transaksi dilanjutkan.');
  };

  // Pintasan keyboard (laptop): F2 pelanggan · F3 diskon · F4 catatan · F5 tahan · F6 riwayat · F10 bayar
  const keyRef = useRef(null);
  keyRef.current = (e) => {
    const map = { F2: () => setSheet('cust'), F3: () => cart.length && setCmd({ k: 'disc', n: Date.now() }), F4: () => setSheet('note'), F5: hold, F6: () => { window.location.href = '/penjualan'; }, F10: () => cart.length && setCmd({ k: 'pay', n: Date.now() }) };
    if (map[e.key] && !e.altKey && !e.ctrlKey && !e.metaKey) { e.preventDefault(); map[e.key](); }
  };
  useEffect(() => { const h = (e) => keyRef.current?.(e); window.addEventListener('keydown', h); return () => window.removeEventListener('keydown', h); }, []);

  if (err === 'OFFLINE_KOSONG') return <Empty title="Kasir belum siap offline di HP ini" text="Buka Kasir sekali saat ada internet supaya daftar barang & harga tersimpan di HP. Setelah itu Kasir bisa dipakai walau internet putus." />;
  if (err) return <div className="notice bad">{err.includes('kasir_catalog') ? 'Database sedang diperbarui. Coba lagi beberapa menit lagi.' : err}</div>;
  if (!d) return <Loading />;

  const add = (p, u) => {
    const key = p.id + '|' + u.name;
    const ex = cart.find((c) => c.key === key);
    if (ex) setCart(reprice(cart.map((c) => (c.key === key ? { ...c, qty: Math.round((c.qty + 1) * 1000) / 1000 } : c)), d, tier, contact || null));
    else setCart(reprice([...cart, { key, product_id: p.id, name: p.name, unit: u.name, unit_qty: Number(u.qty), qty: 1, price: unitPrice(u, tier), auto: true, ...(p.track_serial ? { serials: '' } : {}) }], d, tier, contact || null));
    const used = cart.filter((c) => c.product_id === p.id).reduce((t, c) => t + c.qty * Number(c.unit_qty || 1), 0) + Number(u.qty || 1);
    const bisa = Number(p.stock || 0) - Number(p.reserved || 0) - Number(p.held || 0);
    if (d.policy !== 'izinkan' && used > bisa) toast(d.policy === 'tolak' ? `Stok ${p.name} yang bisa dijual tinggal ${angka(Math.max(0, bisa))} ${p.base_unit} — tidak bisa dibayar melebihi itu.` : `Perhatian: ${p.name} yang bisa dijual tinggal ${angka(Math.max(0, bisa))} ${p.base_unit}${Number(p.reserved) > 0 ? ' (sebagian sudah dipesan pelanggan grosir)' : ''}.`);
    else toast(`+1 ${u.name} ${p.name}`);
  };
  // Scanner barcode (Bluetooth/USB mengetik kode lalu Enter) atau kamera: barcode cocok → langsung masuk keranjang
  const byCode = (code) => {
    const c = String(code || '').trim().toLowerCase();
    if (!c) return false;
    const u = d.units.find((x) => (x.barcode || '').toLowerCase() === c || (x.codes || []).some((k) => String(k).toLowerCase() === c));
    const p = u ? d.products.find((x) => x.id === u.product_id) : d.products.find((x) => (x.sku || '').toLowerCase() === c);
    if (!p) { toast(`Kode ${code} belum terdaftar. Tambahkan di Barang & stok.`); return false; }
    const unit = u || unitsOf(p, d.units)[0];
    if (!(unitPrice(unit, tier) > 0)) { toast(`Harga ${unit.name} ${p.name} belum diisi.`); return null; }
    add(p, unit); setQ(''); return true;
  };
  const switchTier = (t) => { setTier(t); setCart(reprice(cart, d, t, contact || null)); };
  const total = cart.reduce((s, c) => s + c.qty * c.price, 0);
  const count = cart.length;
  const cust = contact ? d.contacts.find((x) => x.id === contact) : null;

  if (d.products.length === 0) {
    return <Empty title="Belum ada barang" text="Masukkan barang dan harganya dulu, lalu kembali ke Kasir."><Link href="/barang"><button className="primary">Buka Barang & stok</button></Link></Empty>;
  }

  const actions = [
    { k: 'cust', icon: 'user', label: cust ? cust.name : 'Pelanggan', key: 'F2', on: () => setSheet('cust'), active: !!cust },
    { k: 'disc', icon: 'disc', label: parseRp(discount) > 0 ? `Diskon ${rp(parseRp(discount))}` : 'Diskon', key: 'F3', on: () => (cart.length ? setCmd({ k: 'disc', n: Date.now() }) : toast('Tambahkan barang dulu.')), active: parseRp(discount) > 0 },
    { k: 'note', icon: 'note', label: note.trim() ? 'Catatan ✓' : 'Catatan', key: 'F4', on: () => setSheet('note'), active: !!note.trim() },
    { k: 'hold', icon: 'pause', label: 'Tahan', key: 'F5', on: hold },
    { k: 'hist', icon: 'clock', label: 'Riwayat', key: 'F6', href: '/penjualan' },
  ];
  const actBar = (
    <div className="pos-act" role="toolbar" aria-label="Aksi kasir">{actions.map((a) => {
      const inner = <><PosIcon n={a.icon} /><span><b>{a.label}</b>{desk && a.key && <small>{a.key}</small>}</span></>;
      return a.href ? <Link key={a.k} href={a.href} className="pos-actb">{inner}</Link>
        : <button key={a.k} type="button" className={'pos-actb' + (a.active ? ' on' : '')} onClick={a.on}>{inner}</button>;
    })}</div>
  );
  const camOk = typeof window !== 'undefined' && cameraScanSupported();

  const catalog = (
    <div className="stack pos-left" style={{ minWidth: 0 }}>
      <PageHeader title="Kasir" help={<PageHelp page="kasir" />} desc={false} actions={<>
        <span className={'chip ' + (online ? 'good' : 'bad')} title={online ? 'Tersambung ke internet' : 'Tidak ada internet — penjualan disimpan di HP dan dikirim otomatis'}>● {online && !d.offline ? 'Online' : 'Offline'}</span>
        {held.length > 0 && <button type="button" className="sm" onClick={() => setSheet('held')}>Ditahan ({held.length})</button>}
        {lastSale && <Link href={`/struk/${lastSale}`}><button type="button" className="sm ghost">Struk terakhir</button></Link>}
        {who && <span className="chip info" style={{ maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis' }}>Kasir: {who}</span>}
        <div className="seg">{[['ecer', 'Eceran'], ['grosir', 'Grosir']].map(([k, l]) => <button key={k} className={tier === k ? 'on' : ''} onClick={() => switchTier(k)} aria-pressed={tier === k}>{l}</button>)}</div>
      </>} />
      {d.offline ? <div className="offnote off"><span><b>Offline</b> · daftar barang & harga dari salinan di HP{raw.cachedAt ? ` (${waktu(raw.cachedAt)})` : ''}. Penjualan disimpan di HP dan dikirim otomatis saat internet kembali.</span>
        <button className="sm" onClick={() => setAntre(true)}>{waiting ? `${waiting} menunggu` : 'Antrean HP'}</button></div>
        : ownQueue.length > 0 ? <div className="offnote"><span>{waiting ? <><b>{waiting} transaksi offline</b> masih di antrean HP ini.</> : needsAttention ? 'Ada transaksi offline yang perlu diperiksa.' : 'Transaksi offline di HP ini sudah tersimpan.'}</span><button className="sm ghost" onClick={() => setAntre(true)}>Lihat</button></div> : null}
      {antre && <AntreanSheet kos={kos} onClose={() => setAntre(false)} />}
      <LokasiBar note="Stok yang tampil dan berkurang adalah stok di lokasi ini." />
      {lead && <div className="notice small" style={{ display: 'flex', gap: 8, alignItems: 'center', justifyContent: 'space-between' }}>
        <span>Dari permintaan <b>{lead.number}</b> · {lead.name}. Setelah dibayar, prospeknya otomatis <b>Jadi</b>.</span>
        <button className="sm ghost" aria-label="Lepaskan dari permintaan" onClick={() => setLead(null)}>✕</button></div>}
      {shift !== undefined && moduleOn(kos, 'r_shift') && <Link href="/shift" className="small">{shift ? `Shift berjalan · seharusnya di laci ${rp(shift.summary.expected)} · Tutup shift →` : 'Belum buka shift · Buka shift (hitung uang laci) →'}</Link>}
      {d.cats?.length > 0 && <div className="pos-tabs" role="tablist" aria-label="Kategori">
        {[['', 'Semua'], ...d.cats.map((c) => [c.id, c.name]), ...(d.products.some((p) => !p.category_id) ? [['-', 'Lainnya']] : [])].map(([id, nm]) => (
          <button key={id || 'all'} role="tab" aria-selected={catF === id} className={catF === id ? 'on' : ''} onClick={() => setCatF(id)}>{nm}</button>
        ))}</div>}
      <div className="pos-search">
        <label className="pos-q"><PosIcon n="search" /><input ref={searchRef} type="search" enterKeyHint="search" value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); byCode(q); } }} placeholder="Cari produk (nama, kode, atau barcode)…" aria-label="Cari barang" /></label>
        {camOk ? <ScanButton onCode={byCode} label={desk ? 'Scan Barcode' : 'Scan'} className="pos-scan" />
          : <button type="button" className="pos-scan" onClick={() => { searchRef.current?.focus(); toast('Arahkan scanner ke barcode — kode masuk ke kotak cari lalu otomatis ditambahkan.'); }}><PosIcon n="barcode" /> {desk ? 'Scan Barcode' : 'Scan'}</button>}
      </div>
      {shown.length === 0 ? <Empty title="Barang tidak ditemukan" /> : (
        <div className={desk ? 'pos-grid' : 'pos-grid pos-slide'}>{shown.map((p) => {
          const us = unitsOf(p, d.units);
          const u = us.find((x) => unitPrice(x, tier) > 0) || us[0];
          const pr = u ? unitPrice(u, tier) : 0;
          const out = Number(p.stock) <= 0;
          return (
            <article className="pos-prod" key={p.id}>
              <button type="button" className="pos-pic" onClick={() => (us.length > 1 ? setSheet({ units: p }) : u && pr > 0 && add(p, u))} aria-label={us.length > 1 ? `Pilih satuan ${p.name}` : `Tambah ${p.name}`}>
                {thumbs[p.id] ? <ListThumb path={thumbs[p.id]} radius={0} style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <span className="pos-ini" aria-hidden="true">{p.name.trim().slice(0, 1).toUpperCase()}</span>}
                {p.favorite && <span className="pos-fav" aria-label="Favorit">★</span>}
              </button>
              <div className="pos-pi">
                <b className="pos-pn">{p.name}</b>
                <span className="pos-pu">{u?.name}{us.length > 1 ? ` · ${us.length} satuan ›` : ''}</span>
                <span className="pos-ps" style={{ color: out || isLow(p) ? 'var(--bad)' : undefined }}>{out ? 'stok habis' : 'stok ' + stockText(p.stock, us, p.base_unit)}</span>
                <div className="pos-pr"><b>{pr > 0 ? rp(pr) : 'harga kosong'}</b>
                  <button type="button" className="pos-add" disabled={!(pr > 0)} onClick={() => (us.length > 1 ? setSheet({ units: p }) : add(p, u))} aria-label={`Tambah ${p.name}`}>+</button></div>
              </div>
            </article>
          );
        })}</div>
      )}
      {!q.trim() && !catF && !d.products.some((p) => p.favorite) && <span className="small muted">Tip: beri tanda ☆ di Barang & stok untuk barang yang sering dijual — tampil paling depan di sini.</span>}
      {desk && actBar}
    </div>
  );

  const panelProps = { kos, kosId, d, tier, cart, setCart, lead, contact, setContact, discount, setDiscount, note, setNote, cmd, thumbs, onHold: hold, reloadContacts: load, offline: d.offline,
    onDone: (r) => { clearAll(); setDone(r); setSeq((x) => x + 1); if (!r.offline) { setLastSale(r.id); try { localStorage.setItem(lastKey(accountKey), r.id); } catch {} } load(); } };
  const emptyPanel = (
    <aside className="pos-cart panel" aria-label="Keranjang">
      <div className="pos-ch"><h3><PosIcon n="cart" /> Keranjang (0)</h3></div>
      <p className="small muted" style={{ margin: 0 }}>Belum ada barang. Ketuk <b>+</b> pada barang, ketik nama, atau scan barcode.</p>
      {held.length > 0 && <button className="sm" onClick={() => setSheet('held')}>Lanjutkan transaksi ditahan ({held.length})</button>}
    </aside>
  );

  return (
    <div className={desk ? 'pos' : 'stack'} style={!desk && cart.length ? { paddingBottom: 90 } : undefined}>
      {catalog}
      {!desk && actBar}
      <div ref={cartRef} style={desk ? { display: 'contents' } : { minWidth: 0, scrollMarginTop: 72 }}>
        {cart.length > 0 ? <Checkout key={seq} {...panelProps} /> : desk ? emptyPanel : null}
      </div>
      {cart.length > 0 && !desk && (
        <div className="cartbar pos-bar">
          <button type="button" onClick={() => cartRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })}><span>Keranjang ({count})</span><b>{rp(total)}</b></button>
          <button type="button" className="pos-bayar" onClick={() => setCmd({ k: 'pay', n: Date.now() })}>Bayar</button>
        </div>
      )}
      {sheet === 'cust' && <Sheet title="Pelanggan" onClose={() => setSheet(null)}>
        <CustPick contacts={d.contacts} value={contact} onPick={(id) => { setContact(id); setSheet(null); }} />
        <span className="small muted">Pelanggan wajib untuk kasbon. Untuk cara bayar lain opsional: harga khusus pelanggan (daftar harga) dan riwayat belanja ikut tercatat. Pelanggan baru bisa ditambah saat Bayar dengan Kasbon, atau di menu Pelanggan.</span>
      </Sheet>}
      {sheet === 'note' && <Sheet title="Catatan transaksi" onClose={() => setSheet(null)}>
        <Field label="Catatan (tercetak di struk)"><textarea rows={3} value={note} onChange={(e) => setNote(e.target.value)} placeholder="mis. titip, diambil sore" /></Field>
        <button className="primary" onClick={() => setSheet(null)}>Selesai</button>
      </Sheet>}
      {sheet === 'held' && <Sheet title="Transaksi ditahan" onClose={() => setSheet(null)}>
        <span className="small muted">Tersimpan di perangkat ini saja (belum tercatat sebagai penjualan, stok belum berkurang).</span>
        {held.length === 0 ? <Empty title="Tidak ada" /> : <div className="list">{held.map((h) => (
          <div className="li" key={h.id}>
            <div className="main"><b className="small">{h.label || `${h.cart.length} barang`}</b><span className="small muted">{new Date(h.at).toLocaleString('id-ID', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })} · {h.cart.length} barang · {rp(h.cart.reduce((s, c) => s + c.qty * c.price, 0))}</span></div>
            <div className="row" style={{ gap: 6, flexWrap: 'nowrap' }}><button className="sm primary" onClick={() => resume(h)}>Lanjutkan</button>
              <button className="sm ghost" aria-label="Hapus transaksi ditahan" onClick={() => saveHeld(held.filter((x) => x.id !== h.id))}>✕</button></div>
          </div>))}</div>}
      </Sheet>}
      {sheet?.units && <Sheet title={sheet.units.name} onClose={() => setSheet(null)}>
        <span className="small muted">Pilih satuan yang dijual.</span>
        <div className="unitbtns">{unitsOf(sheet.units, d.units).map((u) => (
          <button key={u.name} onClick={() => { add(sheet.units, u); setSheet(null); }} disabled={!(unitPrice(u, tier) > 0)}>{u.name} · {unitPrice(u, tier) > 0 ? rp(unitPrice(u, tier)) : 'harga kosong'}</button>
        ))}</div>
      </Sheet>}
      {done && <Done r={done} kos={kos} onClose={() => setDone(null)} />}
    </div>
  );
}

// Pilih pelanggan dengan pencarian (daftar bisa panjang)
function CustPick({ contacts, value, onPick }) {
  const [w, setW] = useState('');
  const list = contacts.filter((c) => !w.trim() || (c.name + ' ' + (c.phone || '')).toLowerCase().includes(w.trim().toLowerCase())).slice(0, 50);
  return <>
    <input type="search" value={w} onChange={(e) => setW(e.target.value)} placeholder="Cari nama atau No. HP" aria-label="Cari pelanggan" autoFocus />
    <div className="list">
      <button type="button" className="li click" onClick={() => onPick('')} style={LI}><b className="small">Tanpa pelanggan</b>{!value && <span className="chip good">dipilih</span>}</button>
      {list.map((c) => <button type="button" key={c.id} className="li click" onClick={() => onPick(c.id)} style={LI}>
        <div className="main"><b className="small">{c.name}{c.local ? ' · baru (di HP)' : ''}</b>{(c.phone || c.price_list) && <span className="small muted">{[c.phone, c.price_list && `harga ${c.price_list}`].filter(Boolean).join(' · ')}</span>}</div>
        {value === c.id && <span className="chip good">dipilih</span>}</button>)}
    </div>
    {contacts.length === 0 && <span className="small muted">Belum ada pelanggan tersimpan.</span>}
  </>;
}
const LI = { background: 'none', border: 0, borderTop: '1px solid var(--line)', borderRadius: 0, width: '100%', textAlign: 'left', font: 'inherit', color: 'inherit' };

// Ikon garis sederhana untuk Kasir (tanpa pustaka)
function PosIcon({ n }) {
  const P = {
    user: <><circle cx="12" cy="8" r="4" /><path d="M4 21c0-4 4-6 8-6s8 2 8 6" /></>,
    disc: <><path d="M5 19 19 5" /><circle cx="7" cy="7" r="2.5" /><circle cx="17" cy="17" r="2.5" /></>,
    note: <><rect x="5" y="3" width="14" height="18" rx="2" /><path d="M9 8h6M9 12h6M9 16h4" /></>,
    pause: <><path d="M9 5v14M15 5v14" /></>,
    clock: <><circle cx="12" cy="12" r="8" /><path d="M12 8v4l3 2" /></>,
    list: <><path d="M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01" /></>,
    print: <><path d="M7 9V3h10v6" /><rect x="4" y="9" width="16" height="8" rx="2" /><path d="M7 14h10v7H7z" /></>,
    search: <><circle cx="11" cy="11" r="6" /><path d="m20 20-4-4" /></>,
    barcode: <><path d="M4 6v12M7 6v12M10 6v12M14 6v12M17 6v12M20 6v12" /></>,
    cart: <><path d="M3 4h2l2 11h11l2-8H6" /><circle cx="9" cy="19" r="1.5" /><circle cx="17" cy="19" r="1.5" /></>,
    trash: <><path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13" /></>,
    card: <><rect x="3" y="6" width="18" height="12" rx="2" /><path d="M3 10h18" /></>,
  };
  return <svg className="pos-ic" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{P[n]}</svg>;
}

function Checkout({ kos, kosId, d, tier, cart, setCart, lead, contact, setContact, discount, setDiscount, note, setNote, cmd, thumbs, onHold, onDone, reloadContacts, offline }) {
  const { session } = useKos();
  const [offReason, setOffReason] = useState('');   // offline: alasan diskon di atas batas (dicatat untuk pemilik)
  const [payOpen, setPayOpen] = useState(false);  // lembar Pembayaran (cara bayar, uang diterima, simpan)
  const [discOpen, setDiscOpen] = useState(!!discount);
  const [lineOpen, setLineOpen] = useState(null); // baris yang sedang dibuka menu ⋯ (ubah harga, nomor seri, hapus)
  const discRef = useRef(null);
  const [method, setMethod] = useState('tunai');
  const [paid, setPaid] = useState('');
  const [newName, setNewName] = useState(lead?.name || '');
  const [newPhone, setNewPhone] = useState(lead?.phone || '');
  const [dueDate, setDue] = useState('');
  const [busy, setBusy] = useState(false);
  const [txId] = useState(uid);
  const [split, setSplit] = useState({ tunai: '', transfer: '', kasbon: '' });   // bayar campuran
  const [promo, setPromo] = useState({ total: 0, items: [] });   // promo otomatis: dihitung server, di sini hanya pratinjau
  const [promoBusy, setPromoBusy] = useState(false);
  // baris berharga otomatis tidak mengirim harga (server memakai harga resmi → ikut promo); harga yang diubah manual dikirim & tidak ikut promo
  const lineOut = (c) => ({ product_id: c.product_id, unit: c.unit, qty: c.qty, ...(c.auto ? {} : { price: c.price }), ...(splitSerials(c.serials).length ? { serials: splitSerials(c.serials) } : {}) });
  const [nota, setNota] = useState(null);   // nota kredit dipakai {id, number, balance, customer}
  const [notaOpen, setNotaOpen] = useState(false);
  const [notaNo, setNotaNo] = useState('');
  const [kw, setKw] = useState([]);   // peringatan kasbon (tidak memblokir)
  const [ov, setOv] = useState(null);  // diskon/margin melewati batas → izin pemilik/pengelola {msg, reason}
  // Pilih pelanggan → harga dasar ikut daftar harganya (bila ada)
  // Harga otomatis selalu mengikuti pelanggan terpilih — juga untuk barang yang ditambahkan setelahnya (panel bayar laptop tetap terbuka)
  useEffect(() => { const r = reprice(cart, d, tier, contact || null); if (r.some((x, i) => x.price !== cart[i].price)) setCart(r); }, [contact, cart]);
  const cartKey = JSON.stringify(cart.map((c) => [c.product_id, c.unit, c.qty, c.auto ? null : c.price])) + tier + (contact || '');
  useEffect(() => {
    if (offline || !cart.length || cart.some((c) => !(c.qty > 0))) { setPromo({ total: 0, items: [] }); setPromoBusy(false); return undefined; }
    setPromoBusy(true);
    const t = setTimeout(async () => {
      const { data, error } = await supabase.rpc('promo_preview', { p_kos: kosId, p_tier: tier, p_lines: cart.map(lineOut), ...(contact ? { p_contact: contact } : {}) });
      setPromo(error || !data ? { total: 0, items: [] } : { total: Number(data.total) || 0, items: data.items || [] });
      setPromoBusy(false);
    }, 350);
    return () => clearTimeout(t);
  }, [cartKey, offline]);

  const sub = cart.reduce((s, c) => s + Math.round(c.qty * c.price), 0);
  const disc = parseRp(discount);
  const pro = Math.min(promo.total, sub);
  const total = Math.max(0, sub - pro - disc);
  const notaAmt = nota ? Math.min(Number(nota.balance) || 0, total) : 0;
  const due = total - notaAmt;   // sisa yang dibayar dengan cara bayar biasa
  // Bayar campuran: bagian tunai/transfer/kasbon harus berjumlah sama dengan total
  const sp = { tunai: parseRp(split.tunai), transfer: parseRp(split.transfer), kasbon: parseRp(split.kasbon) };
  const spSum = sp.tunai + sp.transfer + sp.kasbon;
  const cashPart = method === 'campuran' ? sp.tunai : due;
  const paidN = paid.trim() ? parseRp(paid) : cashPart;
  const change = paidN - cashPart;
  const needContact = due > 0 && (method === 'kasbon' || (method === 'campuran' && sp.kasbon > 0));
  // Perkiraan PPN (harga termasuk PPN); angka resmi dihitung server saat disimpan
  const tax = kos?.profile?.tax;
  const rate = tax?.aktif ? Number(tax.rate) || 0 : 0;
  const taxable = cart.filter((c) => !d.products.find((p) => p.id === c.product_id)?.tax_exempt).reduce((s, c) => s + Math.round(c.qty * c.price), 0);
  const ppn = rate && sub ? Math.round(((taxable - ((disc + pro) * taxable) / sub) * rate) / (100 + rate)) : 0;
  const setLine = (key, patch) => setCart(reprice(cart.map((c) => (c.key === key ? { ...c, ...patch } : c)), d, tier, contact || null));
  // bisa dijual = stok − dipesan pelanggan grosir − ditahan (rusak/karantina)
  const stockOf = (id) => { const p = d.products.find((x) => x.id === id); return Number(p?.stock || 0) - Number(p?.reserved || 0) - Number(p?.held || 0); };
  const baseUsed = (id) => cart.filter((c) => c.product_id === id).reduce((s, c) => s + toBase(c.qty, c.unit_qty), 0);
  const base = (c) => { const u = d.units.find((x) => x.product_id === c.product_id && x.name === c.unit); return u ? basePrice(d, u, tier, contact || null) : 0; };
  const cust = contact ? d.contacts.find((x) => x.id === contact) : null;
  // Batas diskon (pratinjau; server yang memutuskan, termasuk margin minimum yang butuh harga modal)
  const pol = d.pricePolicy || {};
  const discPct = sub > 0 ? Math.round((disc * 10000) / sub) / 100 : 0;
  const overDisc = pol.max_disc != null && discPct > Number(pol.max_disc);
  const canAllow = canArea(kos, 'settings');
  // Peringatan kasbon melewati batas kredit / piutang lewat jatuh tempo — tidak memblokir (keputusan pemilik)
  const kasbonAmt = due <= 0 ? 0 : method === 'kasbon' ? due : method === 'campuran' ? sp.kasbon : 0;
  const checkNota = async () => {
    if (!notaNo.trim()) return toast('Ketik nomor nota kredit (mis. NK-261121-001).');
    const { data, error } = await supabase.rpc('credit_note_check', { p_kos: kosId, p_number: notaNo.trim() });
    if (error) return toast(errMsg(error));
    if (!data?.found) return toast('Nota kredit tidak ditemukan.');
    if (!data.usable) return toast(`${data.number}: ${data.reason}`);
    setNota(data); setNotaOpen(false);
  };
  const serialProblem = (c) => { const n = splitSerials(c.serials).length; return n > toBase(c.qty, c.unit_qty) ? `Nomor seri ${c.name} (${n}) lebih banyak dari jumlahnya.` : null; };
  useEffect(() => {
    if (offline || !contact || String(contact).startsWith('new:') || !(kasbonAmt > 0)) { setKw([]); return undefined; }
    const t = setTimeout(async () => {
      const { data, error } = await supabase.rpc('kasbon_check', { p_kos: kosId, p_contact: contact, p_amount: kasbonAmt });
      setKw(error ? [] : data?.warnings || []);
    }, 400);
    return () => clearTimeout(t);
  }, [contact, kasbonAmt]);
  useEffect(() => { setOv(null); }, [cartKey, discount]);
  useEffect(() => { if (offline) { setNota(null); setNotaOpen(false); } }, [offline]);

  // Offline (atau internet putus saat menyimpan): simpan di HP. Harga = harga yang ditagih sekarang; server mencatat temuan untuk pemilik.
  const saveOffline = async (cid) => {
    const dev = deviceId();
    const local = cid && String(cid).startsWith('new:') ? d.contacts.find((x) => x.id === cid) : null;
    const nc = local ? { key: cid, name: local.name, phone: local.phone || '' }
      : !cid && needContact ? { key: 'new:' + txId, name: newName.trim(), phone: newPhone.trim() } : null;
    const restPay = method === 'campuran' ? Object.entries(sp).filter(([, v]) => v > 0).map(([m, a]) => ({ method: m, amount: a })) : null;
    const cashIn = method === 'tunai' || (method === 'campuran' && sp.tunai > 0);
    const at = new Date().toISOString();
    const payload = {
      id: txId, client_at: at, device: dev, tier, total,
      lines: cart.map((c) => ({ product_id: c.product_id, unit: c.unit, qty: c.qty, price: c.price, ...(c.auto ? {} : { manual: true }), ...(splitSerials(c.serials).length ? { serials: splitSerials(c.serials) } : {}) })),
      discount: disc, method: total > 0 ? method : 'tunai', paid: total > 0 && cashIn ? paidN : null,
      contact: local ? null : cid || null, ...(nc ? { new_contact: nc } : {}),
      due: needContact && dueDate ? dueDate : null, note,
      ...(restPay ? { payments: restPay } : {}),
      ...(overDisc && offReason.trim() ? { override_reason: offReason.trim() } : {}),
      ...(lead ? { lead_id: lead.id } : {}),
      ...(kos?.locs?.current ? { branch_id: kos.locs.current } : {}),
    };
    const whoC = (local || (cid && d.contacts.find((x) => x.id === cid))) || (nc ? { name: nc.name, phone: nc.phone } : null);
    const entry = { id: txId, kos: kosId, user: session?.user?.id, userName: (session?.user?.email || '').split('@')[0], at, payload,
      view: { number: localNumber(dev), total, sub, contact: whoC?.name || '', phone: whoC?.phone || '',
        lines: cart.map((c) => ({ product_id: c.product_id, name: c.name, unit: c.unit, unit_qty: c.unit_qty, qty: c.qty, price: c.price, serials: splitSerials(c.serials) })) } };
    await enqueue(entry);
    setPayOpen(false);
    onDone({ offline: true, entry, number: entry.view.number, total, method: payload.method, change: total > 0 && cashIn ? Math.max(0, change) : 0 });
  };
  // Perintah dari bilah aksi / keyboard: F10 bayar, F3 diskon
  const cmd0 = useRef(cmd?.n);   // perintah lama (sebelum panel ini dibuat) diabaikan
  useEffect(() => {
    if (!cmd?.n || cmd.n === cmd0.current) return;
    if (cmd.k === 'pay') { if (payOpen) pay(); else setPayOpen(true); }
    if (cmd.k === 'disc') { setDiscOpen(true); setTimeout(() => discRef.current?.focus(), 30); }
  }, [cmd?.n]);

  const pay = async (override) => {
    if (!cart.length) return toast('Keranjang kosong.');
    if (cart.some((c) => !(c.qty > 0))) return toast('Ada jumlah yang belum benar.');
    if (promoBusy) return toast('Sebentar, promo sedang dihitung.');
    if (d.policy === 'tolak') { const kurang = cart.find((c) => baseUsed(c.product_id) > stockOf(c.product_id)); if (kurang) return toast(`Stok ${kurang.name} tidak cukup. Catat stok masuk dulu (aturan stok minus: tolak).`); }
    if (disc > sub - pro) return toast(pro > 0 ? `Diskon melebihi sisa setelah promo (${rp(sub - pro)}).` : 'Diskon melebihi subtotal.');
    const sErr = cart.map(serialProblem).find(Boolean); if (sErr) return toast(sErr);
    if (due > 0 && method === 'tunai' && paid.trim() && paidN < due) return toast('Uang diterima kurang dari total.');
    if (due > 0 && method === 'campuran') {
      if (spSum !== due) return toast(`Rincian bayar ${rp(spSum)} belum sama dengan ${notaAmt ? 'sisa setelah nota ' : 'total '}${rp(due)}.`);
      if (paid.trim() && paidN < sp.tunai) return toast('Uang tunai diterima kurang dari bagian tunai.');
    }
    let cid = contact || null;
    if (offline || !isOnline()) {
      if (needContact && due > 0 && !cid && !newName.trim()) return toast('Pilih pelanggan atau isi nama pelanggan baru.');
      if (overDisc && offReason.trim().length < 3) return toast('Diskon melewati batas pemilik — tulis alasan singkat (dicatat untuk dicek pemilik).');
      setBusy(true);
      try { await saveOffline(cid); } catch (e) { toast('Gagal menyimpan di HP: ' + errMsg(e) + '. Pastikan memori HP tidak penuh.'); }
      setBusy(false);
      return;
    }
    setBusy(true);
    try {
      if (cid && String(cid).startsWith('new:')) {
        // pelanggan baru yang dibuat saat offline dan belum terkirim → lewat jalur offline supaya tidak jadi dua pelanggan
        await saveOffline(cid); setBusy(false); return;
      }
      if (needContact && due > 0 && !cid) {
        if (!newName.trim()) { toast('Pilih pelanggan atau isi nama pelanggan baru.'); setBusy(false); return; }
        const { data, error } = await supabase.rpc('contact_save', { p_kos: kosId, p_id: null, p_kind: 'pelanggan', p_name: newName, p_phone: newPhone });
        if (error) throw error;
        cid = data; setContact(data); reloadContacts();
      }
      // Diskon/margin melewati batas: pemilik/pengelola mengizinkan dengan alasan (sale_create_ov); selain itu sale_create biasa
      // Nota kredit menutup sebagian/seluruh total; sisanya lewat cara bayar yang dipilih (jadi Campuran bila ada sisa)
      const notaPay = notaAmt > 0 ? [{ method: 'nota', amount: notaAmt, note_id: nota.id }] : [];
      const restPay = due <= 0 ? [] : method === 'campuran' ? Object.entries(sp).filter(([, v]) => v > 0).map(([m, a]) => ({ method: m, amount: a })) : [{ method, amount: due }];
      const pMethod = notaAmt > 0 ? (due <= 0 ? 'nota' : 'campuran') : method;
      const cashIn = due > 0 && (method === 'tunai' || (method === 'campuran' && sp.tunai > 0));
      const { data, error } = await supabase.rpc(override ? 'sale_create_ov' : 'sale_create', {
        ...(override ? { p_override: override } : {}),
        p_id: txId, p_kos: kosId, p_tier: tier,
        p_lines: cart.map(lineOut),
        p_discount: disc, p_method: pMethod, p_paid: cashIn ? paidN : null, p_contact: cid, p_due: needContact && due > 0 && dueDate ? dueDate : null, p_note: note,
        // dikirim hanya untuk Campuran / nota: penjualan biasa tetap jalan walau database belum diperbarui
        ...(pMethod === 'campuran' || pMethod === 'nota' ? { p_payments: [...notaPay, ...restPay] } : {}),
      });
      if (error) throw error;
      if (lead) { const r2 = await supabase.rpc('lead_mark_sold', { p_lead: lead.id, p_sale: txId }); if (r2.error) toast('Penjualan tersimpan, tetapi prospek belum ditandai Jadi: ' + errMsg(r2.error)); }
      onDone({ ...data, change: due > 0 && (method === 'tunai' || method === 'campuran') ? Math.max(0, change) : 0, method: data.method || pMethod, nota: notaAmt > 0 ? { number: nota.number, amount: notaAmt, left: Number(nota.balance) - notaAmt } : null });
    } catch (e) {
      if (/BATAS_DISKON/.test(e?.message || '')) setOv({ msg: errMsg(e), reason: '' });
      else if (isNetErr(e) && notaAmt === 0) {
        // Internet putus saat menyimpan: simpan di HP dengan nomor transaksi yang SAMA — bila ternyata sudah masuk server, tidak dobel
        try { await saveOffline(cid); toast('Internet putus — transaksi disimpan di HP dan dikirim otomatis nanti.'); } catch (e2) { toast(errMsg(e2)); }
      } else toast(errMsg(e));
    }
    setBusy(false);
  };

  const thumbOf = (id) => thumbs?.[id];
  const delLine = (key) => { setCart(cart.filter((x) => x.key !== key)); setLineOpen(null); };
  const tierLabel = tier === 'grosir' ? 'harga grosir' : 'harga eceran';
  // Panel keranjang (laptop: kanan, lengket · HP: di bawah katalog)
  const cartPanel = (
    <aside className="pos-cart panel" aria-label="Keranjang">
      <div className="pos-ch">
        <h3><PosIcon n="cart" /> Keranjang ({cart.length})</h3>
        <button type="button" className="sm ghost pos-clear" onClick={() => { if (window.confirm('Kosongkan keranjang?')) setCart([]); }}><PosIcon n="trash" /> Kosongkan</button>
      </div>
      {cust && <span className="small">Pelanggan: <b>{cust.name}</b>{cust.price_list ? ` · harga ${cust.price_list}` : ''}</span>}
      <div className="pos-items">{cart.map((c) => {
        const over = baseUsed(c.product_id) > stockOf(c.product_id);
        const opened = lineOpen === c.key;
        return (
          <div className="pos-item" key={c.key}>
            <div className="pos-irow">
              <span className="pos-ith">{thumbOf(c.product_id) ? <ListThumb path={thumbOf(c.product_id)} size={44} radius={8} /> : <span className="pos-ini sm" aria-hidden="true">{c.name.trim().slice(0, 1).toUpperCase()}</span>}</span>
              <div className="pos-iname"><b>{c.name}</b><span>{angka(c.qty)} {c.unit} × {rp(c.price)}{!c.auto && ' · manual'}</span></div>
              <b className="pos-isum">{rp(c.qty * c.price)}</b>
            </div>
            <div className="pos-irow pos-ictl">
              <div className="qtybox">
                <button aria-label={`Kurangi ${c.name}`} onClick={() => (c.qty <= 1 ? delLine(c.key) : setLine(c.key, { qty: Math.round((c.qty - 1) * 1000) / 1000 }))}>−</button>
                <QtyInput label={`Jumlah ${c.name}`} value={c.qty} onChange={(n) => setLine(c.key, { qty: n })} />
                <button aria-label={`Tambah ${c.name}`} onClick={() => setLine(c.key, { qty: Math.round((c.qty + 1) * 1000) / 1000 })}>+</button>
              </div>
              <button type="button" className="sm ghost pos-more" aria-expanded={opened} aria-label={`Pilihan lain ${c.name}`} onClick={() => setLineOpen(opened ? null : c.key)}>⋯</button>
            </div>
            {opened && <div className="pos-iopt">
              <Field label={`Harga per ${c.unit}`}><input inputMode="numeric" aria-label={`Harga ${c.name}`} value={angka(c.price)} onChange={(e) => setLine(c.key, { price: parseRp(e.target.value), auto: false })} /></Field>
              {!c.auto && <button type="button" className="sm" onClick={() => setLine(c.key, { auto: true })}>Kembalikan harga otomatis</button>}
              <span className="small muted">Harga yang diubah manual tidak ikut promo & harga khusus.</span>
              <button type="button" className="sm ghost" style={{ color: 'var(--bad)' }} onClick={() => delLine(c.key)}>Hapus dari keranjang</button>
            </div>}
            {c.auto && listPrice(d, contact || null, c.product_id, c.unit) != null && <span className="small" style={{ color: 'var(--good)' }}>Harga khusus pelanggan{cust?.price_list ? ` (${cust.price_list})` : ''}</span>}
            {c.auto && c.price < (base(c) || 0) && <span className="small" style={{ color: 'var(--good)' }}>Harga beli banyak: {rp(c.price)} per {c.unit} (biasa {rp(base(c))})</span>}
            {c.serials !== undefined && <div className="row" style={{ flexWrap: 'nowrap', alignItems: 'flex-end', gap: 6 }}>
              <Field label={`Nomor seri / IMEI (${splitSerials(c.serials).length}/${angka(toBase(c.qty, c.unit_qty))}, boleh menyusul)`}><input value={c.serials} onChange={(e) => setLine(c.key, { serials: e.target.value })} placeholder="scan atau ketik, pisahkan koma" /></Field>
              <ScanButton onCode={(code) => { setLine(c.key, { serials: (c.serials.trim() ? c.serials.trim() + ', ' : '') + code }); return true; }} />
            </div>}
            {c.serials !== undefined && serialProblem(c) && <span className="small" style={{ color: 'var(--bad)' }}>{serialProblem(c)}</span>}
            {over && <span className="small" style={{ color: d.policy === 'tolak' ? 'var(--bad)' : 'var(--warn)' }}>{d.policy === 'tolak' ? `Melebihi stok yang bisa dijual (${angka(Math.max(0, stockOf(c.product_id)))}) — tidak bisa dibayar.` : 'Melebihi stok yang bisa dijual (sudah dikurangi pesanan grosir & barang ditahan). Tetap bisa dijual; periksa stok nanti.'}</span>}
          </div>
        );
      })}</div>
      <div className="pos-sum">
        <div className="row between"><span>Subtotal ({cart.length} item)</span><b>{rp(sub)}</b></div>
        {promo.items.map((x) => <div className="row between small" key={x.id} style={{ color: 'var(--good)', flexWrap: 'nowrap', gap: 8 }}><span style={{ minWidth: 0 }}>Promo · {x.name}</span><b style={{ whiteSpace: 'nowrap' }}>−{rp(x.amount)}</b></div>)}
        {promo.items.length > 0 && cart.some((c) => !c.auto) && <span className="small muted">Barang yang harganya diubah manual tidak ikut promo.</span>}
        <div className="row between" style={{ flexWrap: 'nowrap' }}>
          <span className="row" style={{ gap: 8, flexWrap: 'nowrap' }}>{pro > 0 ? 'Diskon tambahan' : 'Diskon'}
            <button type="button" className="pos-pct" aria-label="Isi diskon" aria-pressed={discOpen} onClick={() => { setDiscOpen(!discOpen); setTimeout(() => discRef.current?.focus(), 30); }}>%</button></span>
          {discOpen ? <input ref={discRef} inputMode="numeric" aria-label="Diskon (rupiah)" style={{ maxWidth: 140, textAlign: 'right' }} value={discount} onChange={(e) => setDiscount(e.target.value)} placeholder="0" /> : <span>{disc > 0 ? '−' + rp(disc) : rp(0)}</span>}
        </div>
        {overDisc && <span className="small" style={{ color: 'var(--warn)' }}>Diskon {angka(discPct)}% melewati batas {angka(pol.max_disc)}% dari pemilik. {offline ? 'Saat offline tetap bisa disimpan dengan alasan; pemilik akan memeriksanya.' : canAllow ? 'Anda bisa mengizinkannya dengan alasan saat menyimpan.' : 'Perlu izin pemilik/pengelola, atau kurangi diskon.'}</span>}
        {rate > 0 && <div className="row between"><span>PPN {rate}% (termasuk harga)</span><span>{rp(ppn)}</span></div>}
        {note.trim() && <span className="small muted">Catatan: {note}</span>}
      </div>
      <div className="pos-total"><span>Total Bayar</span><b>{rp(total)}</b></div>
      <div className="pos-btns">
        <button type="button" className="pos-sec" onClick={onHold}><PosIcon n="pause" /><span><b>Tahan</b><small>simpan dulu</small></span></button>
        <button type="button" className="pos-pay" onClick={() => setPayOpen(true)} disabled={busy}><PosIcon n="card" /><span><b>Bayar</b><small>{tierLabel}</small></span></button>
      </div>
    </aside>
  );

  const paySheet = payOpen && (
    <Sheet title={`Pembayaran · ${rp(total)}`} onClose={() => setPayOpen(false)}>
      <div className="pos-total"><span>Total Bayar</span><b>{rp(total)}</b></div>
      {ppn > 0 && <span className="small muted">Termasuk PPN {rate}% ± {rp(ppn)} (dihitung pasti saat disimpan; barang bebas PPN tidak dikenai)</span>}
      {offline ? <span className="small muted">Saat offline: promo otomatis & nota kredit tidak bisa dihitung/dipakai, batas kredit dicek setelah terkirim. Harga mengikuti salinan di HP.</span> : nota ? <div className="notice small" style={{ display: 'grid', gap: 4 }}>
        <div className="row between" style={{ flexWrap: 'nowrap', gap: 8 }}><span>Nota kredit <b>{nota.number}</b>{nota.customer ? ` · ${nota.customer}` : ''}</span><button className="sm ghost" aria-label="Lepas nota kredit" onClick={() => setNota(null)}>✕</button></div>
        <div className="row between"><span>Dipakai</span><b>−{rp(notaAmt)}</b></div>
        {Number(nota.balance) - notaAmt > 0 && <span className="muted">Sisa nota {rp(Number(nota.balance) - notaAmt)} tetap bisa dipakai lain kali.</span>}
        <div className="row between" style={{ fontSize: 18 }}><b>Sisa dibayar</b><b>{rp(due)}</b></div>
      </div> : notaOpen ? <div className="row" style={{ flexWrap: 'nowrap', alignItems: 'flex-end' }}>
        <Field label="Nomor nota kredit"><input value={notaNo} autoCapitalize="characters" onChange={(e) => setNotaNo(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); checkNota(); } }} placeholder="NK-…" /></Field>
        <ScanButton onCode={(c) => { setNotaNo(c); return true; }} />
        <button className="sm primary" style={{ flex: 'none' }} onClick={checkNota}>Pakai</button>
      </div> : <button className="sm ghost" style={{ alignSelf: 'flex-start' }} onClick={() => setNotaOpen(true)}>Pakai nota kredit ›</button>}
      {due > 0 && <div className="seg">{Object.entries({ ...PAY, campuran: 'Campuran' }).map(([k, l]) => <button key={k} className={method === k ? 'on' : ''} onClick={() => setMethod(k)} aria-pressed={method === k}>{l}</button>)}</div>}
      {due > 0 && method === 'campuran' && <>
        <span className="small muted">Bagi {notaAmt ? 'sisa setelah nota' : 'total'} ke beberapa cara bayar. Jumlahnya harus sama dengan {rp(due)}.</span>
        {[['tunai', 'Tunai'], ['transfer', 'Transfer / QRIS'], ['kasbon', 'Kasbon (utang pelanggan)']].map(([k, l]) => (
          <div className="row" key={k} style={{ flexWrap: 'nowrap', gap: 6 }}>
            <Field label={l}><input inputMode="numeric" value={split[k]} placeholder="0" onChange={(e) => setSplit({ ...split, [k]: e.target.value })} /></Field>
            {due - spSum + sp[k] > 0 && sp[k] !== due - spSum + sp[k] && <button className="sm" style={{ alignSelf: 'flex-end' }} onClick={() => setSplit({ ...split, [k]: angka(due - spSum + sp[k]) })}>Sisa</button>}
          </div>
        ))}
        <div className="row between"><span>Terbagi</span><b style={{ color: spSum === due ? 'var(--good)' : 'var(--bad)' }}>{rp(spSum)} dari {rp(due)}{spSum !== due ? ` · ${spSum < due ? 'kurang' : 'lebih'} ${rp(Math.abs(due - spSum))}` : ' ✓'}</b></div>
        {sp.tunai > 0 && <>
          <Field label="Uang tunai diterima (opsional)"><input inputMode="numeric" value={paid} onChange={(e) => setPaid(e.target.value)} placeholder={angka(sp.tunai)} /></Field>
          {paid.trim() && <div className="row between"><span>Kembalian</span><b style={{ color: change < 0 ? 'var(--bad)' : 'var(--good)' }}>{change < 0 ? 'kurang ' + rp(-change) : rp(change)}</b></div>}
        </>}
      </>}
      {due > 0 && method === 'tunai' && <>
        <Field label="Uang diterima"><input inputMode="numeric" autoFocus value={paid} onChange={(e) => setPaid(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); pay(); } }} placeholder={angka(due)} /></Field>
        <div className="row">{[due, 20000, 50000, 100000].filter((v, i, a) => v >= due && a.indexOf(v) === i).map((v) => <button key={v} className="sm" onClick={() => setPaid(angka(v))}>{v === due ? 'Uang pas' : rp(v)}</button>)}</div>
        {paid.trim() && <div className="row between" style={{ fontSize: 18 }}><span>Kembalian</span><b style={{ color: change < 0 ? 'var(--bad)' : 'var(--good)' }}>{change < 0 ? 'kurang ' + rp(-change) : rp(change)}</b></div>}
      </>}
      {due > 0 && method === 'transfer' && <p className="small muted" style={{ margin: 0 }}>Simpan setelah uang masuk ke rekening atau QRIS terkonfirmasi.</p>}
      {/* Pelanggan: wajib untuk kasbon; untuk cara bayar lain opsional (bisa juga dipilih lewat tombol Pelanggan) */}
      {(needContact || d.contacts.length > 0) && <Field label={needContact ? 'Pelanggan' : 'Pelanggan (opsional)'}>
        <select value={contact} onChange={(e) => setContact(e.target.value)}>
          <option value="">{needContact ? '+ Pelanggan baru' : 'Tanpa pelanggan'}</option>
          {d.contacts.map((c) => <option key={c.id} value={c.id}>{c.name}{c.price_list ? ` · ${c.price_list}` : ''}{c.local ? ' · baru (di HP)' : ''}</option>)}
        </select></Field>}
      {!needContact && cust?.price_list && <span className="small muted">Harga mengikuti daftar harga <b>{cust.price_list}</b> untuk barang yang ada di daftar itu.</span>}
      {needContact && <>
        {!contact && <div className="row"><Field label="Nama pelanggan baru"><input value={newName} onChange={(e) => setNewName(e.target.value)} /></Field><Field label="No. HP (opsional)"><input inputMode="tel" value={newPhone} onChange={(e) => setNewPhone(e.target.value)} /></Field></div>}
        <Field label="Janji bayar (opsional)"><input type="date" min={today()} value={dueDate} onChange={(e) => setDue(e.target.value)} /></Field>
      </>}
      {kw.map((w) => <div key={w} className="notice small" style={{ borderColor: 'var(--warn)', color: 'var(--warn)' }}>{w}</div>)}
      <Field label="Catatan (opsional)"><input value={note} onChange={(e) => setNote(e.target.value)} /></Field>
      {ov && <div className="notice small" style={{ display: 'grid', gap: 8 }}>
        <span>{ov.msg}</span>
        {canAllow ? <>
          <Field label="Alasan mengizinkan"><input value={ov.reason} onChange={(e) => setOv({ ...ov, reason: e.target.value })} placeholder="mis. pelanggan langganan, barang hampir kedaluwarsa" /></Field>
          <button className="primary" disabled={busy || ov.reason.trim().length < 3} onClick={() => pay(ov.reason.trim())}>Izinkan & simpan</button>
        </> : <span className="muted">Kurangi diskon, atau minta pemilik/pengelola menyimpan transaksi ini dari akun mereka.</span>}
      </div>}
      {overDisc && offline && <Field label="Alasan diskon (wajib saat offline)"><input value={offReason} onChange={(e) => setOffReason(e.target.value)} placeholder="mis. pelanggan langganan, barang hampir kedaluwarsa" /></Field>}
      <button className="cta" onClick={() => pay()} disabled={busy}>{busy ? 'Menyimpan…' : `${offline ? 'Simpan di HP' : 'Simpan'} · ${rp(total)}`}</button>
    </Sheet>
  );
  return <>{cartPanel}{paySheet}</>;
}

// Kolom jumlah yang bisa diisi desimal (mis. 1,5 kg) tanpa melompat saat mengetik koma
function QtyInput({ value, onChange, label }) {
  const [t, setT] = useState(String(value).replace('.', ','));
  useEffect(() => { if (qtyNum(t) !== value) setT(String(value).replace('.', ',')); }, [value]);
  return <input inputMode="decimal" aria-label={label} value={t} onChange={(e) => { setT(e.target.value); const n = qtyNum(e.target.value); if (isFinite(n)) onChange(n); }} />;
}

function Done({ r, kos, onClose }) {
  const [struk, setStruk] = useState(false);
  if (r.offline) return (
    <Sheet title="Tersimpan di HP" onClose={onClose}>
      <div className="notice">{r.number} · {rp(r.total)} · {PAY_ALL[r.method] || 'Campuran'}<br /><span className="small">Dikirim otomatis saat internet kembali. Nomor TRX resmi muncul setelah terkirim.</span></div>
      {r.change > 0 && <div className="row between" style={{ fontSize: 22 }}><span>Kembalian</span><b>{rp(r.change)}</b></div>}
      <button className="primary" style={{ width: '100%' }} onClick={() => setStruk(true)}>Lihat / cetak struk</button>
      <button className="cta" onClick={onClose}>Transaksi baru</button>
      {struk && <OfflineStrukSheet kos={kos} entry={r.entry} onClose={() => setStruk(false)} />}
    </Sheet>
  );
  return (
    <Sheet title="Transaksi tersimpan" onClose={onClose}>
      <div className="notice good">{r.number} · {rp(r.total)} · {PAY_ALL[r.method] || 'Campuran'}{Number(r.promo) > 0 ? ` · hemat promo ${rp(r.promo)}` : ''}{Number(r.tax) > 0 ? ` · termasuk PPN ${rp(r.tax)}` : ''}</div>
      {r.change > 0 && <div className="row between" style={{ fontSize: 22 }}><span>Kembalian</span><b>{rp(r.change)}</b></div>}
      {r.nota && <span className="small">Nota {r.nota.number} dipakai {rp(r.nota.amount)}{r.nota.left > 0 ? ` · sisa ${rp(r.nota.left)}` : ' · habis'}</span>}
      <Link href={`/struk/${r.id}`}><button className="primary" style={{ width: '100%' }}>Lihat / kirim struk</button></Link>
      <button className="cta" onClick={onClose}>Transaksi baru</button>
    </Sheet>
  );
}
