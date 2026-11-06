'use client';
import { useEffect, useRef, useState } from 'react';

// Pindai barcode dengan kamera. Memakai BarcodeDetector bawaan browser bila ada (Chrome Android);
// di iPhone/Safari memakai pustaka ZXing yang dimuat saat tombol pertama kali ditekan.
const ZXING = ['https://unpkg.com/@zxing/library@0.20.0/umd/index.min.js', 'https://cdn.jsdelivr.net/npm/@zxing/library@0.20.0/umd/index.min.js'];
let zxingLoad = null;
function loadZxing() {
  if (typeof window === 'undefined') return Promise.reject(new Error('no window'));
  if (window.ZXing) return Promise.resolve(window.ZXing);
  if (zxingLoad) return zxingLoad;
  const tryUrl = (i) => new Promise((ok, fail) => {
    const s = document.createElement('script'); s.src = ZXING[i]; s.async = true;
    s.onload = () => (window.ZXing ? ok(window.ZXing) : fail(new Error('ZXing kosong')));
    s.onerror = () => { s.remove(); i + 1 < ZXING.length ? tryUrl(i + 1).then(ok, fail) : fail(new Error('Gagal memuat pemindai')); };
    document.head.appendChild(s);
  });
  zxingLoad = tryUrl(0).catch((e) => { zxingLoad = null; throw e; });
  return zxingLoad;
}

export const cameraScanSupported = () => typeof window !== 'undefined' && !!navigator.mediaDevices?.getUserMedia;

export function ScanButton({ onCode, label = 'Pindai', className = 'sm' }) {
  const [ok, setOk] = useState(false);
  const [open, setOpen] = useState(false);
  useEffect(() => { setOk(cameraScanSupported()); }, []);
  if (!ok) return null;
  return <>
    <button type="button" className={className} onClick={() => setOpen(true)} aria-label="Pindai barcode dengan kamera">📷 {label}</button>
    {open && <Scanner onClose={() => setOpen(false)} onCode={(c) => { setOpen(false); onCode(c); }} />}
  </>;
}

function Scanner({ onCode, onClose }) {
  const video = useRef(null);
  const [err, setErr] = useState(null);
  const [msg, setMsg] = useState('Membuka kamera…');
  useEffect(() => {
    let stop = false, stream, timer, reader;
    const found = (code) => { if (stop || !code) return; stop = true; if (navigator.vibrate) navigator.vibrate(60); onCode(String(code).trim()); };
    const fail = (e) => setErr(/NotAllowed|denied|Permission/i.test(String(e?.name || e)) ? 'Izin kamera ditolak. Di iPhone: Pengaturan › Safari › Kamera › Izinkan, lalu coba lagi.' : 'Kamera tidak bisa dibuka. Ketik kodenya atau pakai scanner Bluetooth.');
    (async () => {
      try {
        if ('BarcodeDetector' in window) {
          const det = new window.BarcodeDetector({ formats: ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128', 'code_39', 'qr_code'] });
          stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
          if (stop) return;
          video.current.srcObject = stream; await video.current.play(); setMsg('Arahkan kamera ke barcode');
          const tick = async () => { if (stop) return; try { const r = await det.detect(video.current); if (r[0]?.rawValue) return found(r[0].rawValue); } catch {} timer = setTimeout(tick, 200); };
          tick();
        } else {
          const ZX = await loadZxing();
          if (stop) return;
          const hints = new Map();
          hints.set(ZX.DecodeHintType.POSSIBLE_FORMATS, [ZX.BarcodeFormat.EAN_13, ZX.BarcodeFormat.EAN_8, ZX.BarcodeFormat.UPC_A, ZX.BarcodeFormat.UPC_E, ZX.BarcodeFormat.CODE_128, ZX.BarcodeFormat.CODE_39, ZX.BarcodeFormat.QR_CODE]);
          reader = new ZX.BrowserMultiFormatReader(hints, 250);
          setMsg('Arahkan kamera ke barcode');
          await reader.decodeFromVideoDevice(null, video.current, (res) => { if (res) found(res.getText ? res.getText() : res.text); });
        }
      } catch (e) { if (!stop) fail(e); }
    })();
    return () => { stop = true; clearTimeout(timer); try { reader?.reset(); } catch {} stream?.getTracks().forEach((t) => t.stop()); };
  }, []);
  return (
    <div role="dialog" aria-label="Pindai barcode" style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.85)', zIndex: 80, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12, padding: 16 }}>
      {err ? <div className="notice bad" style={{ maxWidth: 420 }}>{err}</div> : <div style={{ position: 'relative', width: '100%', maxWidth: 420 }}>
        <video ref={video} playsInline muted autoPlay style={{ width: '100%', borderRadius: 12, background: '#000', display: 'block' }} />
        <div aria-hidden="true" style={{ position: 'absolute', left: '10%', right: '10%', top: '45%', height: 2, background: '#ff4d4d', boxShadow: '0 0 8px #ff4d4d' }} />
      </div>}
      {!err && <span style={{ color: '#fff' }} className="small">{msg}</span>}
      <button onClick={onClose}>Tutup</button>
    </div>
  );
}
