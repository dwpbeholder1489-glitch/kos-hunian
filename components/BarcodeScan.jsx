'use client';
import { useEffect, useRef, useState } from 'react';

// Pindai barcode dengan kamera memakai BarcodeDetector bawaan browser (Chrome Android dan sejenisnya).
// iPhone (Safari) belum menyediakan fitur ini: tombol tidak tampil; pakai scanner barcode Bluetooth atau ketik kodenya.
export const cameraScanSupported = () => typeof window !== 'undefined' && 'BarcodeDetector' in window && !!navigator.mediaDevices?.getUserMedia;

export function ScanButton({ onCode, label = 'Pindai', className = 'sm' }) {
  const [ok, setOk] = useState(false);
  const [open, setOpen] = useState(false);
  useEffect(() => { setOk(cameraScanSupported()); }, []);
  if (!ok) return null;
  return <>
    <button type="button" className={className} onClick={() => setOpen(true)}>📷 {label}</button>
    {open && <Scanner onClose={() => setOpen(false)} onCode={(c) => { setOpen(false); onCode(c); }} />}
  </>;
}

function Scanner({ onCode, onClose }) {
  const video = useRef(null);
  const [err, setErr] = useState(null);
  useEffect(() => {
    let stream, timer, stop = false;
    (async () => {
      try {
        const det = new window.BarcodeDetector({ formats: ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128', 'code_39', 'qr_code'] });
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
        if (stop) return;
        video.current.srcObject = stream;
        await video.current.play();
        const tick = async () => {
          if (stop) return;
          try { const r = await det.detect(video.current); if (r[0]?.rawValue) { if (navigator.vibrate) navigator.vibrate(60); return onCode(r[0].rawValue.trim()); } } catch {}
          timer = setTimeout(tick, 250);
        };
        tick();
      } catch (e) { setErr(/denied|Permission/i.test(String(e)) ? 'Izin kamera ditolak. Izinkan kamera untuk situs ini di pengaturan browser.' : 'Kamera tidak bisa dibuka di perangkat ini.'); }
    })();
    return () => { stop = true; clearTimeout(timer); stream?.getTracks().forEach((t) => t.stop()); };
  }, []);
  return (
    <div className="sheet-bg" onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.8)', zIndex: 80, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12, padding: 16 }}>
      {err ? <div className="notice bad">{err}</div> : <video ref={video} playsInline muted style={{ width: '100%', maxWidth: 420, borderRadius: 12, background: '#000' }} onClick={(e) => e.stopPropagation()} />}
      <span style={{ color: '#fff' }} className="small">Arahkan kamera ke barcode</span>
      <button onClick={onClose}>Tutup</button>
    </div>
  );
}
