'use client';
import { useState } from 'react';
import Icon from '@/components/landing/Icon';

const N = [
  { k: 'inti', ic: 'layers', n: 'Sistem Inti', h: 'Sistem Inti', p: 'Akun, bisnis, cabang, peran karyawan, dan pemisahan data. Semua modul berdiri di atasnya.', rel: ['trx', 'ops', 'fin', 'cus', 'bi', 'auto'], out: ['Multi-bisnis', 'Peran & hak akses', 'Riwayat aktivitas'] },
  { k: 'trx', ic: 'receipt', n: 'Transaksi', h: 'Mesin Transaksi', p: 'Kasir, pesanan, tagihan, dan pembayaran. Setiap transaksi otomatis mengubah stok dan pembukuan.', rel: ['inti', 'ops', 'fin', 'cus'], out: ['Kasir eceran & grosir', 'Tagihan & pembayaran', 'Retur & pembatalan'] },
  { k: 'ops', ic: 'flow', n: 'Operasional', h: 'Mesin Operasional', p: 'Stok, tahap proses, antar-jemput, keluhan, dan perbaikan — pekerjaan harian yang terpantau.', rel: ['inti', 'trx', 'fin', 'auto'], out: ['Stok per lokasi', 'Tahap pesanan', 'Resep & bahan'] },
  { k: 'fin', ic: 'wallet', n: 'Keuangan', h: 'Mesin Keuangan', p: 'Jurnal berpasangan tersusun dari transaksi. Laba rugi, neraca, dan arus kas memakai angka yang sama.', rel: ['inti', 'trx', 'ops', 'bi'], out: ['Kas & bank', 'Utang-piutang', 'Laporan keuangan'] },
  { k: 'cus', ic: 'users', n: 'Pelanggan', h: 'Mesin Pelanggan', p: 'Kontak, riwayat, kasbon, batas kredit, dan prospek dari halaman bisnis.', rel: ['inti', 'trx', 'bi'], out: ['Data pelanggan', 'Kasbon & kredit', 'Portal bisnis (Pro)'] },
  { k: 'bi', ic: 'chart', n: 'Analisis', h: 'Mesin Analisis', p: 'Membaca data transaksi dan keuangan menjadi tren, perbandingan, dan temuan dengan aturan tetap.', rel: ['inti', 'fin', 'cus', 'trx'], out: ['Tren & perbandingan', 'Per akun & per lokasi', 'Temuan dari data'] },
  { k: 'auto', ic: 'clock', n: 'Otomatisasi', h: 'Lapisan Otomatisasi', p: 'Tagihan berkala, pengingat, dan resep otomatisasi. Anda yang menyalakan; setiap jalan tercatat.', rel: ['inti', 'ops', 'trx'], out: ['Tagihan berkala', 'Pengingat', 'Resep otomatisasi'] },
];
const R = 37;
const pos = (i) => { if (i === 0) return [50, 50]; const a = ((-90 + (i - 1) * 60) * Math.PI) / 180; return [50 + R * Math.cos(a), 50 + R * Math.sin(a)]; };
const PAIRS = [];
N.forEach((a, i) => a.rel.forEach((r) => { const j = N.findIndex((x) => x.k === r); if (j > i) PAIRS.push([i, j]); }));

export default function Eco() {
  const [k, setK] = useState('inti');
  const cur = N.find((x) => x.k === k);
  const ci = N.indexOf(cur);
  return (
    <div className="cx-eco">
      <div className="cx-eco-map" data-rv="">
        <svg viewBox="0 0 100 100" aria-hidden="true">
          {PAIRS.map(([i, j]) => { const [x1, y1] = pos(i), [x2, y2] = pos(j); const on = i === ci || j === ci; return <line key={i + '-' + j} x1={x1} y1={y1} x2={x2} y2={y2} className={on ? 'on' : 'off'} vectorEffect="non-scaling-stroke" />; })}
        </svg>
        {N.map((x, i) => { const [nx, ny] = pos(i); const on = x.k === k, rel = cur.rel.includes(x.k);
          return <button key={x.k} type="button" aria-pressed={on} className={'cx-node' + (i === 0 ? ' core' : '') + (on ? ' on' : rel ? ' rel' : ' dim')} style={{ '--nx': nx + '%', '--ny': ny + '%' }} onClick={() => setK(x.k)}><Icon name={x.ic} size={20} />{x.n}</button>; })}
      </div>
      <div className="cx-eco-info" key={k} aria-live="polite">
        <span className="cx-kick">Terhubung dengan {cur.rel.length} modul</span>
        <h3 style={{ fontSize: 'clamp(22px,4.6vw,30px)' }}>{cur.h}</h3>
        <p>{cur.p}</p>
        <ul>{cur.out.map((t) => <li key={t}>{t}</li>)}</ul>
        <p className="cx-note" style={{ marginTop: 16 }}>Ketuk modul lain untuk melihat hubungannya. Modul bisa dinyalakan atau dimatikan per bisnis.</p>
      </div>
    </div>
  );
}
