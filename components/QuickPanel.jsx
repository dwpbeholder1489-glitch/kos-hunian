'use client';
// Isi panel tombol (+) — sama untuk HP (lembar bawah) dan desktop (menu tarik-turun).
// Urutan & isi: lib/quick.js (Business DNA, peran, modul aktif, halaman saat ini, pengaturan pemilik).
// Tombol (+) SELALU ada; bila belum ada aksi yang bisa dipakai, panel menjelaskan alasannya (§13.4).
import Link from 'next/link';
import NavIcon from '@/components/NavIcon';
import { quickFor, quickUsage, quickUsed } from '@/lib/quick';
import { isDraft, canArea } from '@/lib/business';
import { track, mineAksi } from '@/lib/usage';

export function useQuick(kos, path) {
  // urutan "paling sering dipakai": dari server (semua perangkat, 60 hari); cadangan per perangkat bila belum termuat
  return quickFor(kos, path, typeof window === 'undefined' ? {} : mineAksi(kos.id) || quickUsage(kos.id));
}

export default function QuickPanel({ kos, path, onPick, menu = false }) {
  const list = useQuick(kos, path);
  const settings = canArea(kos, 'settings');
  const pick = (a) => { quickUsed(kos.id, a.id); track(kos.id, 'aksi', a.id); onPick?.(); };
  if (!list.length) {
    return (
      <div className="qp-empty" role={menu ? 'none' : undefined}>
        <NavIcon name="/layers" size={26} />
        {kos.suspended_at || kos.closed_at ? <>
          <b>Aksi cepat tidak tersedia</b>
          <span className="small muted">{kos.suspended_at ? 'Bisnis ini sedang ditangguhkan.' : 'Bisnis ini sudah ditutup dan tersedia sebagai arsip.'}</span>
        </> : isDraft(kos) ? <>
          <b>Aksi cepat siap setelah bisnis aktif</b>
          <span className="small muted">Selesaikan peninjauan di Pusat Konfirmasi. Setelah aktif, tombol ini berisi tindakan utama bisnis Anda.</span>
          {settings && <Link href="/konfirmasi" className="sm" onClick={onPick} role={menu ? 'menuitem' : undefined}>Buka Pusat Konfirmasi</Link>}
        </> : <>
          <b>Belum ada aksi cepat untuk Anda</b>
          <span className="small muted">{settings ? 'Semua aksi sedang disembunyikan atau modulnya belum aktif.' : 'Peran Anda belum punya tindakan yang bisa dipercepat di bisnis ini. Hubungi pemilik bila perlu akses.'}</span>
          {settings && <Link href="/pengalaman?tab=aksi" className="sm" onClick={onPick} role={menu ? 'menuitem' : undefined}>Atur aksi cepat</Link>}
        </>}
      </div>
    );
  }
  return (
    <>
      <div className={menu ? '' : 'morelist qp-list'}>
        {list.map((a) => (
          <Link key={a.id} href={a.href} onClick={() => pick(a)} role={menu ? 'menuitem' : undefined} className={a.context ? 'qp-ctx' : undefined}>
            <NavIcon name={a.base} size={menu ? 18 : 22} /><span className="qp-t">{a.label}</span>
            {a.fav && <span className="qp-star" aria-label="Favorit" title="Favorit">★</span>}
          </Link>
        ))}
      </div>
      {settings && <Link href="/pengalaman?tab=aksi" className="qp-set small" onClick={onPick} role={menu ? 'menuitem' : undefined}>Atur aksi cepat</Link>}
    </>
  );
}
