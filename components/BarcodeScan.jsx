'use client';

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { playScanSuccess, prepareScanSound } from '@/lib/scan-sound';
import { createBarcodeReader, loadFallbackDecoder, openBarcodeCamera, previewBarcodeCamera, readBarcodePhoto, stopCamera } from '@/lib/barcode-scanner.mjs';
import styles from './barcode-scan.module.css';

const NO_READ_MS = 8000;
const READ_INTERVAL_MS = 220;

export function ScanButton({ onCode, label = 'Pindai', icon = '📷', className = 'sm', productUnit }) {
  const [open, setOpen] = useState(false);
  return <>
    <button type="button" className={className} onClick={() => { prepareScanSound(); setOpen(true); }} aria-label="Pindai barcode atau ketik kodenya">{icon} {label}</button>
    {open && <Scanner onClose={() => setOpen(false)} onCode={onCode} productUnit={productUnit} />}
  </>;
}

function cameraMessage(error) {
  const name = error?.name;
  if (['NotAllowedError', 'SecurityError'].includes(name)) {
    return 'Izin kamera belum diberikan. Di Safari iPhone, buka menu halaman → Pengaturan Situs Web → Kamera, lalu izinkan akses dan coba lagi.';
  }
  if (name === 'NotSupportedError') return 'Kamera tidak tersedia di browser ini. Ketik kode atau gunakan scanner Bluetooth/USB.';
  if (name === 'NotFoundError') return 'Kamera tidak ditemukan. Ketik kode atau gunakan scanner Bluetooth/USB.';
  if (name === 'NotReadableError') return 'Kamera tidak bisa dipakai. Tutup aplikasi atau tab lain yang memakai kamera, lalu coba lagi.';
  return 'Tampilan kamera tidak bisa dimulai. Coba buka kamera lagi atau ketik kode di bawah.';
}

function Scanner({ onCode, onClose, productUnit }) {
  const dialog = useRef(null);
  const video = useRef(null);
  const switchDecoder = useRef(null);
  const lastCameraCode = useRef({ code: null, at: 0 });
  const busy = useRef(false);
  const readingPhoto = useRef(false);
  const active = useRef(false);
  const [attempt, setAttempt] = useState(0);
  const [typed, setTyped] = useState('');
  const [unknown, setUnknown] = useState(null);
  const [submitError, setSubmitError] = useState(null);
  const [checking, setChecking] = useState(false);
  const [photoPending, setPhotoPending] = useState(false);
  const [format, setFormat] = useState(productUnit ? 'linear' : undefined);
  const [camera, setCamera] = useState({ mode: 'loading', message: 'Membuka kamera…' });
  const [preview, setPreview] = useState(false);

  useEffect(() => {
    active.current = true;
    const element = dialog.current;
    element.showModal();
    return () => {
      element.close();
      active.current = false;
    };
  }, []);

  async function handle(raw, source) {
    const code = String(raw ?? '').trim();
    if (!code || busy.current || !active.current) return;
    if (source === 'camera') {
      const now = Date.now();
      const last = lastCameraCode.current;
      if (last.code === code && now - last.at < 2500) return;
      lastCameraCode.current = { code, at: now };
    }
    busy.current = true;
    setChecking(true);
    setUnknown(null);
    setSubmitError(null);
    try {
      const result = await onCode(code);
      if (!active.current) return;
      if (result === false) {
        setUnknown(code);
        if (source !== 'manual') setTyped((value) => value || code);
      } else {
        if (source !== 'manual' && result !== null) playScanSuccess();
        onClose();
      }
    } catch {
      if (active.current) setSubmitError('Kode gagal diproses. Coba lagi atau ketik kodenya.');
    } finally {
      busy.current = false;
      if (active.current) setChecking(false);
    }
  }

  const handleLatest = useRef(handle);
  handleLatest.current = handle;

  async function fromPhoto(event) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file || busy.current || readingPhoto.current) return;
    readingPhoto.current = true;
    setPhotoPending(true);
    setSubmitError(null);
    try {
      const code = await readBarcodePhoto(file, format);
      if (!active.current) return;
      if (!code) {
        setSubmitError('Kode di foto belum terbaca. Coba foto lebih dekat, ratakan kemasan, dan hindari pantulan.');
        return;
      }
      await handleLatest.current(code, 'photo');
    } catch {
      if (active.current) setSubmitError('Foto gagal dibuka. Pilih foto lain atau ketik kodenya.');
    } finally {
      readingPhoto.current = false;
      if (active.current) setPhotoPending(false);
    }
  }

  useEffect(() => {
    const controller = new AbortController();
    const { signal } = controller;
    const element = video.current;
    let stream;
    let timer;
    let reader;
    let lastNativeRead;
    let track;

    function release() {
      controller.abort();
      clearTimeout(timer);
      switchDecoder.current = null;
      track?.removeEventListener('ended', ended);
      stopCamera(stream);
      if (element.srcObject === stream) element.srcObject = null;
      stream = null;
    }

    function fail(message) {
      if (signal.aborted) return;
      release();
      setPreview(false);
      setCamera({ mode: 'error', message });
    }

    function ended() {
      fail('Koneksi kamera terputus. Coba buka kamera lagi atau ketik kode di bawah.');
    }

    async function tick() {
      if (signal.aborted) return;
      try {
        if (!busy.current && !readingPhoto.current && element.readyState >= 2 && element.videoWidth > 0) {
          if (reader.usingNative && Date.now() - lastNativeRead >= NO_READ_MS) await reader.useFallback();
          const code = await reader.read(element);
          if (signal.aborted) return;
          if (code && !readingPhoto.current) {
            lastNativeRead = Date.now();
            await handleLatest.current(code, 'camera');
          }
        }
      } catch {
        fail('Pemindai cadangan gagal membaca kamera. Coba lagi atau ketik kode di bawah.');
      }
      if (!signal.aborted) timer = setTimeout(tick, READ_INTERVAL_MS);
    }

    async function start() {
      setPreview(false);
      setCamera({ mode: 'loading', message: 'Membuka kamera…' });
      try {
        stream = await openBarcodeCamera(navigator.mediaDevices, signal, { detailed: format === 'linear' });
        if (signal.aborted) { stopCamera(stream); return; }
        track = stream.getVideoTracks()[0];
        track?.addEventListener('ended', ended);
        if (format === 'linear' && track?.getCapabilities?.().focusMode?.includes('continuous')) {
          track.applyConstraints({ advanced: [{ focusMode: 'continuous' }] }).catch(() => {});
        }
        await previewBarcodeCamera(element, stream, signal);
        if (signal.aborted) return;
        setPreview(true);
      } catch (error) {
        fail(cameraMessage(error));
        return;
      }

      try {
        reader = await createBarcodeReader({
          Detector: window.BarcodeDetector,
          loadFallback: () => loadFallbackDecoder({ format }),
          format,
          onFallback: (state) => {
            if (signal.aborted) return;
            setCamera(state === 'loading'
              ? { mode: 'loading', message: 'Menyiapkan pemindai cadangan…' }
              : { mode: 'fallback', message: 'Pemindai cadangan aktif. Arahkan kamera ke barcode.' });
          },
        });
        if (signal.aborted) return;
        if (reader.usingNative) setCamera({ mode: 'native', message: 'Arahkan kamera ke barcode sampai terlihat jelas.' });
        lastNativeRead = Date.now();
        switchDecoder.current = () => {
          reader.useFallback().catch(() => fail('Pemindai cadangan gagal dimuat. Coba lagi atau ketik kode di bawah.'));
        };
        tick();
      } catch {
        fail('Pemindai cadangan gagal dimuat. Periksa koneksi atau ketik kode di bawah.');
      }
    }

    start();
    return release;
  }, [attempt, format]);

  return createPortal(
    <dialog ref={dialog} className={styles.dialog} aria-label="Pindai barcode"
      onCancel={(event) => { event.preventDefault(); event.stopPropagation(); onClose(); }}
      onKeyDown={(event) => {
        event.stopPropagation();
        if (event.key === 'Escape') { event.preventDefault(); onClose(); }
      }}>
      <div className="row between">
        <h2>Pindai barcode</h2>
        <button type="button" className="sm ghost" onClick={onClose}>Tutup</button>
      </div>
      {productUnit && <div className="row between">
        <span className="small muted">Satuan {productUnit}</span>
        <div className="seg" role="group" aria-label="Jenis kode">
          <button type="button" aria-pressed={format === 'linear'} disabled={photoPending || checking} className={format === 'linear' ? 'on' : ''} onClick={() => setFormat('linear')}>Barcode garis</button>
          <button type="button" aria-pressed={format === 'qr'} disabled={photoPending || checking} className={format === 'qr' ? 'on' : ''} onClick={() => setFormat('qr')}>QR</button>
        </div>
      </div>}
      <div className={styles.preview} hidden={!preview && camera.mode === 'error'}>
        <video ref={video} muted autoPlay playsInline aria-label="Pratinjau kamera" />
        {preview && <span className={format === 'linear' ? styles.frame : styles.guide} aria-hidden="true" />}
      </div>
      <div className={camera.mode === 'error' ? 'notice bad' : 'small muted'} role="status">{camera.message}</div>
      {productUnit && format === 'linear' && <p className="small muted" style={{ margin: 0 }}>Penuhi kotak dengan barcode garis. Ratakan kemasan dan miringkan sedikit jika ada pantulan.</p>}
      {camera.mode === 'native' && <button type="button" className="sm ghost" onClick={() => switchDecoder.current?.()}>Pakai pemindai cadangan</button>}
      {camera.mode === 'error' && <button type="button" className="sm ghost" onClick={() => setAttempt((value) => value + 1)}>Coba kamera lagi</button>}
      {unknown && <div className="notice" role="status"><b>{unknown}</b> belum terdaftar. Periksa kodenya atau daftarkan melalui Barang &amp; stok.</div>}
      {submitError && <div className="notice bad" role="alert">{submitError}</div>}
      {productUnit && <label className={styles.photo}>
        <span>{photoPending ? 'Membaca foto…' : 'Pindai dari foto'}</span>
        <input type="file" accept="image/*" disabled={photoPending || checking} onChange={fromPhoto} />
      </label>}
      <form className={styles.manual} onSubmit={(event) => {
        event.preventDefault();
        event.stopPropagation();
        handle(typed, 'manual');
      }}>
        <label className="f">Ketik kode barcode
          <input value={typed} onChange={(event) => setTyped(event.target.value)} autoCapitalize="none"
            autoCorrect="off" spellCheck={false} autoComplete="off" enterKeyHint="done" placeholder="Masukkan atau pindai kode" />
        </label>
        <button type="submit" className="primary" disabled={checking || photoPending || !typed.trim()}>{checking ? 'Memeriksa…' : 'Gunakan kode'}</button>
      </form>
    </dialog>,
    document.body,
  );
}
