'use client';
// Alur aktivasi bertahap: manfaat → deteksi perangkat → (iPhone: pasang ke Layar Utama) → izin → berhasil.
// Izin browser BARU diminta setelah pengguna menekan tombol (tidak pernah otomatis saat login).
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { PageHeader } from '@/components/Page';
import { useKos } from '@/components/KosProvider';
import { homeOf } from '@/lib/business';
import { toast } from '@/components/ui';
import { errMsg } from '@/lib/format';
import { enablePush, guideFor, pushStatus } from '@/lib/notif';
import { BellIcon, InstallGuide, STATUS_TEXT } from '@/components/NotifCenter';

const BENEFITS = ['Pesanan & permintaan baru', 'Stok menipis atau habis', 'Bukti pembayaran & tagihan jatuh tempo', 'Persetujuan yang menunggu Anda', 'Tugas untuk karyawan', 'Keamanan akun (perangkat baru, hak akses berubah)'];

export default function Aktifkan() {
  const { kos } = useKos();
  const [step, setStep] = useState('manfaat');
  const [st, setSt] = useState(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { pushStatus().then((s) => { setSt(s); if (s.code === 'aktif') setStep('berhasil'); }); }, []);
  const go = async () => {
    setBusy(true);
    try { await enablePush(); setSt(await pushStatus()); setStep('berhasil'); }
    catch (e) { toast(errMsg(e)); setSt(await pushStatus()); }
    setBusy(false);
  };
  const next = () => setStep(st?.code === 'perlu_pasang' ? 'pasang' : ['tidak_didukung', 'hanya_aplikasi', 'ditolak'].includes(st?.code) ? 'deteksi' : 'izin');
  return (
    <div className="stack">
      <PageHeader title="Aktifkan notifikasi" desc={false} />
      <section className="panel nt-flow">
        {step === 'manfaat' && <>
          <span className="nt-hero"><BellIcon size={34} /></span>
          <h3>Informasi penting bisnis, langsung di perangkat Anda</h3>
          <ul className="nt-ben">{BENEFITS.map((b) => <li key={b}>{b}</li>)}</ul>
          <p className="small muted">Tidak perlu email atau WhatsApp. Anda bisa mengatur kategori, jam tenang, dan mematikannya kapan saja.</p>
          <button className="primary" disabled={!st} onClick={() => setStep('deteksi')}>Lanjut</button>
          <Link href="/pusat-notifikasi" className="small">Nanti saja</Link>
        </>}
        {step === 'deteksi' && st && <>
          <h3>Perangkat Anda</h3>
          <div className="nt-devcard"><b>{st.label}</b><span className="small muted">{st.iosVer ? `iOS ${Math.floor(st.iosVer)}.${Math.round((st.iosVer % 1) * 100)} · ` : ''}{st.standalone ? 'dibuka dari Layar Utama' : 'dibuka di browser'}</span></div>
          <div className={'notice ' + (STATUS_TEXT[st.code]?.[1] === 'good' ? 'good' : '')}><b>{STATUS_TEXT[st.code]?.[0]}</b><br />{STATUS_TEXT[st.code]?.[2]}</div>
          {st.code === 'perlu_pasang' && <p className="small">Untuk iPhone, pasang PRASARA ke Layar Utama dulu: 1) Pasang · 2) Buka dari ikon · 3) Aktifkan notifikasi.</p>}
          {['tidak_didukung', 'hanya_aplikasi'].includes(st.code) ? <Link href="/pusat-notifikasi/bantuan" className="nt-btn">Lihat perangkat yang didukung</Link>
            : st.code === 'ditolak' ? <Link href="/pusat-notifikasi/bantuan#izin" className="nt-btn primary">Cara mengizinkan</Link>
            : <button className="primary" onClick={next}>{st.code === 'perlu_pasang' ? 'Lihat panduan' : 'Lanjut'}</button>}
          <Link href="/pusat-notifikasi/bantuan" className="small">Perangkat lain? Ganti panduan</Link>
        </>}
        {step === 'pasang' && <>
          <h3>Pasang PRASARA di Layar Utama ({st?.platformName})</h3>
          <InstallGuide which="ios" />
          <p className="small muted">Setelah dibuka dari ikon Layar Utama, halaman ini akan menampilkan tombol Aktifkan Notifikasi.</p>
          <button className="primary" onClick={() => pushStatus().then((s) => { setSt(s); if (s.code === 'perlu_pasang') toast('PRASARA masih dibuka dari Safari. Buka dari ikon di Layar Utama.'); else next(); })}>Saya sudah memasang</button>
        </>}
        {step === 'izin' && <>
          <span className="nt-hero"><BellIcon size={34} /></span>
          <h3>Izinkan notifikasi PRASARA</h3>
          <p>PRASARA siap mengirim notifikasi ke {st?.platformName}. Setelah Anda menekan tombol, browser akan bertanya sekali — pilih <b>Izinkan</b>.</p>
          {guideFor(st || {}) === 'desktop' && <p className="small muted">Kotak izin muncul di dekat kolom alamat browser.</p>}
          <button className="primary" disabled={busy} onClick={go}>{busy ? 'Menunggu izin…' : 'Izinkan Notifikasi'}</button>
          <Link href="/pusat-notifikasi" className="small">Nanti saja</Link>
        </>}
        {step === 'berhasil' && <>
          <span className="nt-hero ok"><svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m5 12 5 5 9-10" /></svg></span>
          <h3>Notifikasi berhasil diaktifkan</h3>
          <ul className="nt-ben ok"><li>Perangkat terdaftar</li><li>Notifikasi aktif</li><li>Pesan uji "perangkat baru" segera masuk</li></ul>
          <Link href={kos ? homeOf(kos) : '/buka'} className="nt-btn primary">Mulai ke dashboard</Link>
          <Link href="/pusat-notifikasi/pengaturan" className="small">Atur kategori & jam tenang →</Link>
        </>}
      </section>
    </div>
  );
}
