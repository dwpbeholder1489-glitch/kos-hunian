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
  const [printing, setPrinting] = useState(false);
  useEffect(() => { setOrigin(window.location.origin); supabase.rpc('share_info', { p_kos: kosId }).then(({ data, error }) => (error ? setErr(errMsg(error)) : setI(data))); }, [kosId]);
  const url = i?.slug ? `${origin}/b/${i.slug}` : '';
  const svg = useMemo(() => (url ? qrSvg(url) : ''), [url]);
  if (err) return <div className="notice bad">{/share_info/.test(err) ? 'Database sedang diperbarui. Coba lagi beberapa menit lagi.' : err}</div>;
  if (!i) return <Loading />;
  if (!i.module) return <div className="notice">Modul <b>Halaman bisnis</b> belum aktif. {i.can_edit ? <>Aktifkan di <Link href="/konfigurasi">Konfigurasi</Link>.</> : 'Minta pemilik mengaktifkannya.'}</div>;
  if (!i.live) return (
    <div className="notice">Halaman bisnis <b>belum terbit</b>, jadi belum ada tautan & QR untuk dibagikan.
      {i.can_edit ? <> <Link href="/halaman"><button className="sm primary" style={{ marginTop: 8 }}>Atur & terbitkan halaman</button></Link></> : ' Minta pemilik menerbitkannya di menu Halaman bisnis.'}</div>
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
  const print = () => {
    setPrinting(true);
    setTimeout(() => {
      document.body.classList.add('pq');
      const done = () => { document.body.classList.remove('pq'); setPrinting(false); window.removeEventListener('afterprint', done); };
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
        <button onClick={print}>Cetak poster QR</button>
        <a href={url} target="_blank" rel="noreferrer"><button className="ghost">Lihat halaman</button></a>
      </div>
      <span className="small muted">Tempel poster di meja kasir, etalase, pintu, atau kirim gambarnya ke grup WhatsApp/status. Pelanggan cukup memindai dengan kamera HP.</span>
      {printing && typeof document !== 'undefined' && createPortal(
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
