'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';

// Daftar "Mulai di sini" untuk pengguna baru — tercentang otomatis dari data, bisa disembunyikan
export default function Checklist({ d, kosId }) {
  const key = 'koshunian.checklist.' + kosId;
  const [hidden, setHidden] = useState(true);
  useEffect(() => { try { setHidden(localStorage.getItem(key) === '1'); } catch { setHidden(false); } }, [key]);

  const steps = [
    ['Isi harga sewa kamar', 'Kamar → ketuk kamar → Ubah data kamar', '/kamar', d.rooms.some((r) => r.rent > 0)],
    ['Masukkan penghuni pertama', 'Kamar → ketuk kamar kosong → Isi kamar ini', '/kamar', d.leases.length > 0],
    ['Catat pembayaran pertama', 'Tagihan → ketuk tagihan → Catat pembayaran', '/tagihan', d.payments.length > 0],
    ['Catat pengeluaran', 'Pengeluaran → + Catat', '/pengeluaran', d.expenses.length > 0],
  ];
  const done = steps.filter((s) => s[3]).length;
  if (hidden || done === steps.length) return null;
  const hide = () => { try { localStorage.setItem(key, '1'); } catch {} setHidden(true); };

  return (
    <section className="panel">
      <div className="row between"><h3>Mulai di sini · {done}/{steps.length}</h3><button className="sm ghost" onClick={hide}>Sembunyikan</button></div>
      <div className="progress" aria-hidden="true"><i style={{ width: `${(done / steps.length) * 100}%` }} /></div>
      <div className="list check">
        {steps.map(([t, how, href, ok], i) => (
          <Link key={t} href={href} className={'li' + (ok ? ' done' : '')}>
            <span className="box">{ok ? '✓' : i + 1}</span>
            <div className="main" style={{ flex: 1 }}><b>{t}</b><span className="small muted">{how}</span></div>
            {!ok && <span className="muted">›</span>}
          </Link>
        ))}
      </div>
      <Link href="/panduan" className="small">Baca panduan lengkap →</Link>
    </section>
  );
}
