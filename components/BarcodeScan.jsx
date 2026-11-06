'use client';
import { useEffect, useRef, useState } from 'react';

// Pindai barcode dengan kamera.
// - Chrome Android: BarcodeDetector bawaan browser.
// - iPhone/Safari: pustaka ZXing (ikut terpasang di aplikasi; cadangan dari CDN).
// onCode(code) boleh mengembalikan false bila kode tidak dikenal → pemindai tetap terbuka dan menampilkan kodenya.
const CDN = ['https://cdn.jsdelivr.net/npm/@zxing/library@0.20.0/umd/index.min.js', 'https://unpkg.com/@zxing/library@0.20.0/umd/index.min.js'];
let zxPromise = null;
function loadZxing() {
  if (zxPromise) return zxPromise;
  const fromCdn = (i) => new Promise((ok, fail) => {
    if (window.ZXing) return ok(window.ZXing);
    const s = document.createElement('script'); s.src = CDN[i]; s.async = true;
    s.onload = () => (window.ZXing ? ok(window.ZXing) : fail(new Error('kosong')));
    s.onerror = () => { s.remove(); i + 1 < CDN.length ? fromCdn(i + 1).then(ok, fail) : fail(new Error('Pemindai gagal dimuat. Periksa internet.')); };
    document.head.appendChild(s);
  });
  zxPromise = import('@zxing/library').then((m) => (m.BrowserMultiFormatReader ? m : m.default)).catch(() => fromCdn(0)).catch((e) => { zxPromise = null; throw e; });
  return zxPromise;
}

export const cameraScanSupported = () => typeof window !== 'undefined' && !!navigator.mediaDevices?.getUserMedia;

export function ScanButton({ onCode, label = 'Pindai', className = 'sm' }) {
  const [ok, setOk] = useState(false);
  const [open, setOpen] = useState(false);
  useEffect(() => { setOk(cameraScanSupported()); }, []);
  if (!ok) return null;
  return <>
    <button type="button" className={className} onClick={() => setOpen(true)} aria-label="Pindai barcode dengan kamera">📷 {label}</button>
    {open && <Scanner onClose={() => setOpen(false)} onCode={async (c) => { const r = await onCode(c); if (r !== false) setOpen(false); return r; }} />}
  </>;
}

const VIDEO = { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } };

function Scanner({ onCode, onClose }) {
  const video = useRef(null);
  const [err, setErr] = useState(null);
  const [msg, setMsg] = useState('Membuka kamera…');
  const [last, setLast] = useState(null);
  const [typed, setTyped] = useState('');
  const busy = useRef(false);
  const lastCode = useRef({ code: null, at: 0 });

  const handle = async (code) => {
    code = String(code || '').trim();
    if (!code || busy.current) return;
    const now = Date.now();
    if (lastCode.current.code === code && now - lastCode.current.at < 2500) return; // kode yang sama berulang
    lastCode.current = { code, at: now };
    busy.current = true;
    if (navigator.vibrate) navigator.vibrate(60);
    const r = await onCode(code);
    busy.current = false;
    if (r === false) setLast(code);
  };

  useEffect(() => {
    let stop = false, stream, timer, reader;
    const fail = (e) => {
      const n = String(e?.name || e?.message || e);
      setErr(/NotAllowed|denied|Permission/i.test(n) ? 'Izin kamera ditolak. iPhone: Pengaturan › Safari › Kamera › Izinkan (atau ketuk "aA" di bilah alamat › Pengaturan Situs Web › Kamera), lalu coba lagi.'
        : /NotFound|Overconstrained/i.test(n) ? 'Kamera belakang tidak ditemukan.'
        : /gagal dimuat|internet/i.test(n) ? 'Pemindai gagal dimuat. Periksa koneksi internet, lalu coba lagi.'
        : `Kamera tidak bisa dibuka (${n.slice(0, 60)}). Ketik kodenya di bawah atau pakai scanner Bluetooth.`);
    };
    (async () => {
      try {
        if ('BarcodeDetector' in window) {
          const det = new window.BarcodeDetector({ formats: ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128', 'code_39', 'qr_code'] });
          stream = await navigator.mediaDevices.getUserMedia({ video: VIDEO, audio: false });
          if (stop) return;
          video.current.srcObject = stream; await video.current.play();
          setMsg('Arahkan garis merah ke barcode, jarak ±10–15 cm');
          const tick = async () => { if (stop) return; try { const r = await det.detect(video.current); if (r[0]?.rawValue) await handle(r[0].rawValue); } catch {} timer = setTimeout(tick, 200); };
          tick();
        } else {
          setMsg('Menyiapkan pemindai…');
          const ZX = await loadZxing();
          if (stop) return;
          const hints = new Map();
          hints.set(ZX.DecodeHintType.POSSIBLE_FORMATS, [ZX.BarcodeFormat.EAN_13, ZX.BarcodeFormat.EAN_8, ZX.BarcodeFormat.UPC_A, ZX.BarcodeFormat.UPC_E, ZX.BarcodeFormat.CODE_128, ZX.BarcodeFormat.CODE_39, ZX.BarcodeFormat.QR_CODE]);
          hints.set(ZX.DecodeHintType.TRY_HARDER, true);
          reader = new ZX.BrowserMultiFormatReader(hints, 150);
          const cb = (res) => { if (res && !stop) handle(res.getText ? res.getText() : res.text); };
          setMsg('Membuka kamera…');
          if (reader.decodeFromConstraints) await reader.decodeFromConstraints({ video: VIDEO, audio: false }, video.current, cb);
          else await reader.decodeFromVideoDevice(null, video.current, cb);
          if (!stop) setMsg('Arahkan garis merah ke barcode, jarak ±10–15 cm');
        }
      } catch (e) { if (!stop) fail(e); }
    })();
    return () => { stop = true; clearTimeout(timer); try { reader?.reset(); } catch {} stream?.getTracks().forEach((t) => t.stop()); };
  }, []);

  return (
    <div role="dialog" aria-label="Pindai barcode" style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.88)', zIndex: 80, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12, padding: 16, overflowY: 'auto' }}>
      {err ? <div className="notice bad" style={{ maxWidth: 420 }}>{err}</div> : <div style={{ position: 'relative', width: '100%', maxWidth: 420 }}>
        <video ref={video} playsInline muted autoPlay style={{ width: '100%', borderRadius: 12, background: '#000', display: 'block' }} />
        <div aria-hidden="true" style={{ position: 'absolute', left: '8%', right: '8%', top: '50%', height: 2, background: '#ff4d4d', boxShadow: '0 0 8px #ff4d4d' }} />
      </div>}
      {!err && <span style={{ color: '#fff', textAlign: 'center' }} className="small">{msg}</span>}
      {last && <div className="notice" style={{ maxWidth: 420 }}>Terbaca <b>{last}</b>, tetapi belum terdaftar di barang mana pun. Daftarkan di Barang & stok › Ubah barang › Barcode.</div>}
      <form className="row" style={{ width: '100%', maxWidth: 420, flexWrap: 'nowrap' }} onSubmit={(e) => { e.preventDefault(); if (typed.trim()) { handle(typed); setTyped(''); } }}>
        <input value={typed} onChange={(e) => setTyped(e.target.value)} inputMode="numeric" placeholder="atau ketik angka barcode" aria-label="Ketik kode" style={{ flex: 1 }} />
        <button className="primary">OK</button>
      </form>
      <button onClick={onClose}>Tutup</button>
    </div>
  );
}
