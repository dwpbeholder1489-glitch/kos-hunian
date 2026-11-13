'use client';
// Tombol cepat "Bagikan": tautan halaman bisnis + QR code, satu ketukan dari mana saja (pojok kanan atas).
// Salin, WhatsApp, menu Bagikan bawaan HP, simpan gambar QR, dan cetak poster QR.
import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { useKos } from '@/components/KosProvider';
import { Sheet, Loading, toast } from '@/components/ui';
import { errMsg, waLink } from '@/lib/format';
import { qrMatrix, qrSvg } from '@/lib/qr';
import { isDraft } from '@/lib/business';
import { hasFeature } from '@/lib/plan';
import FiturUpgrade from '@/components/FiturUpgrade';

const ajakan = (i) => (i.kuliner ? 'Pindai untuk lihat menu & pesan' : i.type === 'retail' ? 'Pindai untuk lihat barang & pesan' : i.type === 'jasa' ? 'Pindai untuk lihat layanan & pesan' : i.type === 'properti' ? 'Pindai untuk lihat kamar tersedia' : 'Pindai untuk info & pesan');

// Gambar PNG (kartu QR dengan nama bisnis) untuk disimpan / dikirim
export async function qrPng(url, name, line) {
  const m = qrMatrix(url); const n = m.length; const cell = Math.max(8, Math.floor(720 / (n + 8)));
  const q = (n + 8) * cell; const W = q + 80, H = q + 260;
  const c = document.createElement('canvas'); c.width = W; c.height = H; const g = c.getContext('2d');
  g.fillStyle = '#fff'; g.fillRect(0, 0, W, H);
  g.fillStyle = '#0f1b2d'; g.textAlign = 'center'; g.font = '800 44px "Plus Jakarta Sans", system-ui, sans-serif';
  g.fillText(name.length > 28 ? name.slice(0, 27) + '…' : name, W / 2, 70);
  g.fillStyle = '#5b5b5b'; g.font = '600 28px "Plus Jakarta Sans", system-ui, sans-serif'; g.fillText(line, W / 2, 115);
  g.fillStyle = '#000';
  m.forEach((row, y) => row.forEach((v, x) => { if (v) g.fillRect(40 + (x + 4) * cell, 140 + (y + 4) * cell, cell, cell); }));
  g.fillStyle = '#5b5b5b'; g.font = '500 22px system-ui, sans-serif'; g.fillText(url.replace(/^https?:\/\//, ''), W / 2, H - 40);
  return new Promise((res) => c.toBlob(res, 'image/png'));
}

export function SharePanel({ kosId, compact }) {
  const [i, setI] = useState(null);
  const [err, setErr] = useState(null);
  const [origin, setOrigin] = useState('');
  const [printing, setPrinting] = useState(null); // null | {mode:'poster'} | {mode:'meja', tables:[n…]}
  const [one, setOne] = useState('');
  const [busy, setBusy] = useState(false);
  const { kos, loadKos } = useKos();
  const fetchInfo = () => supabase.rpc('share_info', { p_kos: kosId }).then(({ data, error }) => (error ? setErr(errMsg(error)) : setI(data)));
  useEffect(() => { setOrigin(window.location.origin); fetchInfo(); }, [kosId]);
  const publish = async () => {
    if (!window.confirm(`Terbitkan halaman ${i.name}?\n\nSiapa saja yang membuka tautan bisa melihat nama, alamat, WhatsApp, dan ${i.type === 'retail' ? 'barang' : i.type === 'jasa' ? 'layanan/menu' : i.type === 'properti' ? 'kamar yang tersedia' : 'informasi bisnis'} beserta harganya.\nHarga modal, laba, dan data pelanggan/penghuni tidak pernah ditampilkan.\n\nIsi lengkap (tagline, foto, tautan, jam buka) bisa diatur nanti di menu Halaman bisnis.`)) return;
    setBusy(true);
    const { error } = await supabase.rpc('public_page_quick_publish', { p_kos: kosId });
    setBusy(false);
    if (error) return toast(/public_page_quick_publish/.test(error.message || '') ? 'Database sedang diperbarui. Coba lagi beberapa menit lagi.' : errMsg(error));
    toast('Halaman terbit — siap dibagikan'); loadKos?.(); fetchInfo();
  };
  const url = i?.slug ? `${origin}/b/${i.slug}` : '';
  const svg = useMemo(() => (url ? qrSvg(url) : ''), [url]);
  if (isDraft(kos)) return (
    <div className="stack" style={{ gap: 10 }}>
      <div className="notice">Bisnis <b>{kos.name}</b> masih <b>draf</b>. Tautan & QR bisa dibagikan setelah bisnis diaktifkan.</div>
      <Link href="/konfirmasi"><button className="cta" style={{ width: '100%' }}>Buka Pusat Konfirmasi</button></Link>
    </div>
  );
  if (err) return <div className="notice bad">{/share_info/.test(err) ? 'Database sedang diperbarui. Coba lagi beberapa menit lagi.' : err}</div>;
  if (!i) return <Loading />;
  if (!i.module || !i.live) return (
    <div className="stack" style={{ gap: 10 }}>
      <div className="notice">Halaman bisnis <b>{i.name}</b> belum terbit, jadi belum ada tautan & QR untuk dibagikan.</div>
      {i.can_edit && !hasFeature(kos, 'portal_bisnis') ? <FiturUpgrade kosId={kos?.id} event="PORTAL.PUBLIC_PAGE.REQUESTED" title="Halaman bisnis publik tersedia di Paket Pro" text="Portal PRASARA: katalog, pendaftaran, dan pemesanan pelanggan secara online, lengkap dengan tautan & QR. Isi halaman bisa disiapkan dulu di menu Halaman bisnis." />
      : i.can_edit ? <>
        <button className="cta" disabled={busy} onClick={publish}>{busy ? 'Menerbitkan…' : 'Terbitkan sekarang & dapatkan tautan'}</button>
        <Link href="/halaman"><button className="ghost" style={{ width: '100%' }}>Atur isi halaman dulu</button></Link>
        <span className="small muted">Satu ketukan: halaman diterbitkan dengan nama, alamat & WhatsApp bisnis{i.type === 'properti' ? ' serta kamar yang tersedia (calon penghuni bisa langsung daftar)' : ''}. Bisa disembunyikan lagi kapan saja di menu Halaman bisnis.</span>
      </> : <span className="small muted">Minta pemilik menerbitkannya (ikon Bagikan › Terbitkan sekarang).</span>}
    </div>
  );
  const line = ajakan(i);
  const msg = `${i.name} — ${line.replace('Pindai untuk', 'Klik untuk')}: ${url}`;
  const copy = async () => { try { await navigator.clipboard.writeText(url); toast('Tautan disalin'); } catch { window.prompt('Salin tautan ini:', url); } };
  const share = async () => {
    if (navigator.share) { try { await navigator.share({ title: i.name, text: msg.replace(url, '').trim(), url }); } catch {} } else copy();
  };
  const saveImg = async () => {
    const blob = await qrPng(url, i.name, line); if (!blob) return toast('Gagal membuat gambar');
    const file = new File([blob], `QR-${i.slug}.png`, { type: 'image/png' });
    try { if (navigator.canShare?.({ files: [file] })) { await navigator.share({ files: [file], title: i.name }); return; } } catch (e) { if (e?.name === 'AbortError') return; }
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = file.name; document.body.appendChild(a); a.click(); a.remove();
    toast('Gambar QR diunduh');
  };
  const print = (job = { mode: 'poster' }) => {
    setPrinting(job);
    setTimeout(() => {
      document.body.classList.add('pq');
      const done = () => { document.body.classList.remove('pq'); setPrinting(null); window.removeEventListener('afterprint', done); };
      window.addEventListener('afterprint', done);
      window.print();
      setTimeout(done, 1500); // Safari iPhone kadang tidak mengirim afterprint
    }, 50);
  };
  return (
    <div className="stack" style={{ gap: 10 }}>
      <div className="qrbox" aria-label={`QR code ${url}`} dangerouslySetInnerHTML={{ __html: svg }} style={{ maxWidth: compact ? 220 : 260 }} />
      <span className="small" style={{ textAlign: 'center', wordBreak: 'break-all' }}><b>{url.replace(/^https?:\/\//, '')}</b></span>
      <div className="sharegrid">
        <button className="primary" onClick={share}>Bagikan…</button>
        <a href={waLink('', msg)} target="_blank" rel="noreferrer"><button>WhatsApp</button></a>
        <button onClick={copy}>Salin tautan</button>
        <button onClick={saveImg}>Simpan gambar QR</button>
        <button onClick={() => print()}>Cetak poster QR</button>
        <a href={url} target="_blank" rel="noreferrer"><button className="ghost">Lihat halaman</button></a>
      </div>
      <span className="small muted">Tempel poster di meja kasir, etalase, pintu, atau kirim gambarnya ke grup WhatsApp/status. Pelanggan cukup memindai dengan kamera HP.</span>
      {i.kuliner && (i.tables > 0 ? (
        <div className="unitbox">
          <b className="small">QR per meja ({i.tables} meja)</b>
          <span className="small muted">Pelanggan memindai QR di mejanya → pesanan otomatis tercatat untuk meja itu (makan di tempat). Kasir tetap mengonfirmasi dulu.</span>
          <button className="primary" onClick={() => print({ mode: 'meja', tables: Array.from({ length: i.tables }, (_, k) => k + 1) })}>Cetak QR semua meja</button>
          <div className="row" style={{ flexWrap: 'nowrap' }}>
            <select value={one} onChange={(e) => setOne(e.target.value)} aria-label="Pilih meja" style={{ flex: 1 }}><option value="">Satu meja saja…</option>{Array.from({ length: i.tables }, (_, k) => <option key={k} value={k + 1}>Meja {k + 1}</option>)}</select>
            <button className="sm" disabled={!one} onClick={() => print({ mode: 'meja', tables: [Number(one)] })}>Cetak</button>
          </div>
        </div>
      ) : <span className="small muted">QR per meja: {i.can_edit ? <>isi <b>Jumlah meja</b> di <Link href="/layanan">Menu & tahap</Link> dulu.</> : 'minta pemilik mengisi jumlah meja.'}</span>)}
      {printing?.mode === 'meja' && typeof document !== 'undefined' && createPortal(
        <div className="qrprint meja">{printing.tables.map((n) => (
          <div className="card" key={n}>
            <span className="biz">{i.name}</span>
            <b className="no">MEJA {n}</b>
            <div className="q" dangerouslySetInnerHTML={{ __html: qrSvg(`${url}?meja=${n}`) }} />
            <span className="cta">Pindai untuk lihat menu & pesan dari meja ini</span>
            <span className="pay">Bayar di kasir</span>
          </div>
        ))}</div>, document.body)}
      {printing?.mode === 'poster' && typeof document !== 'undefined' && createPortal(
        <div className="qrprint">
          <h1>{i.name}</h1>
          <p className="sub">{line}</p>
          <div className="q" dangerouslySetInnerHTML={{ __html: svg }} />
          <p className="u">{url.replace(/^https?:\/\//, '')}</p>
          <p className="f">Pesan & tanya langsung dari HP — tanpa aplikasi.</p>
        </div>, document.body)}
    </div>
  );
}

// Tombol ikon di header + lembar Bagikan
export default function Bagikan() {
  const { kosId } = useKos();
  const [open, setOpen] = useState(false);
  return (
    <>
      <button className="helpbtn" onClick={() => setOpen(true)} aria-label="Bagikan tautan & QR" title="Bagikan & QR">
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 3v12M7 8l5-5 5 5" /><path d="M5 13v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6" /></svg>
      </button>
      {open && <Sheet title="Bagikan & QR" onClose={() => setOpen(false)}><SharePanel kosId={kosId} /></Sheet>}
    </>
  );
}
