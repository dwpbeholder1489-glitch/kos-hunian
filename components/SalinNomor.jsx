'use client';
// Tombol salin nomor (pendaftaran/pesanan) di halaman publik.
import { useState } from 'react';

export default function SalinNomor({ text }) {
  const [ok, setOk] = useState(false);
  const copy = async () => {
    try { await navigator.clipboard.writeText(text); setOk(true); setTimeout(() => setOk(false), 2000); }
    catch { try { window.prompt('Salin nomor ini:', text); } catch {} }
  };
  return <button type="button" className="sm" onClick={copy}>{ok ? '✓ Tersalin' : 'Salin nomor'}</button>;
}
