'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { Sheet } from '@/components/ui';
import { rp } from '@/lib/format';
import { KEMBALI_KEY } from '@/components/UpgradeSukses';

// Penawaran upgrade (Growth Trigger Engine). Server yang memutuskan kapan penawaran boleh tampil (growth_offer);
// komponen ini hanya menampilkan, mencatat tampil/tolak/klik, lalu mengarahkan ke Langganan dengan paket terpilih.
export function GrowthSheet({ offer, kosId, onDone }) {
  const router = useRouter();
  const track = (action) => supabase.rpc('growth_track', { p_kos: kosId, p_rule: offer.id, p_action: action, p_event: null }).then(() => {}, () => {});
  const tutup = () => { track('dismissed'); onDone(); };
  const lanjut = () => {
    track('clicked');
    // Setelah upgrade berhasil, pemilik dikembalikan ke aktivitas yang tadi tertahan (V2 §10)
    const here = typeof window !== 'undefined' ? window.location.pathname : '/';
    const kembali = offer.context === 'karyawan' ? { href: '/karyawan?tambah=1', label: 'Lanjut tambah karyawan' }
      : offer.context === 'cabang' ? { href: '/konfigurasi?tab=cabang&baru=1', label: 'Lanjut tambah cabang' }
      : { href: here, label: 'Kembali ke halaman sebelumnya' };
    try { localStorage.setItem(KEMBALI_KEY(kosId), JSON.stringify({ ...kembali, at: Date.now(), trig: offer.id })); } catch {}
    onDone();
    router.push(`/langganan?paket=${offer.to_plan}&bulan=${offer.to_months}&trig=${encodeURIComponent(offer.id)}`);
  };
  const tahunan = offer.kind === 'tahunan';
  const hematPersen = !tahunan && offer.list_price > offer.price ? Math.round(((offer.list_price - offer.price) * 100) / offer.list_price) : null;
  return (
    <Sheet title={offer.title} onClose={tutup}>
      <p className="small" style={{ margin: 0 }}>{offer.message}</p>
      <div className="tile">
        <span className="label">Paket saat ini</span>
        <span className="v">{offer.from_name}{tahunan ? ' (bulanan)' : ''}</span>
        {offer.context === 'karyawan' && <span className="s">{offer.karyawan_dipakai} dari {offer.karyawan_batas} karyawan</span>}
        {offer.context === 'cabang' && <span className="s">{offer.cabang_dipakai} dari {offer.cabang_batas} cabang</span>}
      </div>
      <div className="tile" style={{ borderColor: 'var(--gold)', borderWidth: 2 }}>
        <span className="label">Paket {offer.to_name}{tahunan ? ' Tahunan' : ''}</span>
        {offer.list_price > offer.price && <span className="small"><s>{rp(offer.list_price)}</s>{tahunan ? ' /tahun' : ' /bulan'}{hematPersen ? ` · hemat ${hematPersen}%` : ''}</span>}
        <span className="v">{rp(offer.price)}<span className="small muted">{tahunan ? ' /tahun' : ' /bulan'}</span></span>
        {tahunan && <span className="s">Bayar sekali untuk 12 bulan · setara {rp(offer.monthly)} per bulan · hemat {rp(offer.saving)}</span>}
        {offer.context === 'karyawan' && offer.karyawan_batas_baru && <span className="s">Hingga {offer.karyawan_batas_baru} akun karyawan</span>}
        {offer.context === 'cabang' && offer.cabang_batas_baru && <span className="s">Hingga {offer.cabang_batas_baru} cabang (gudang tidak dihitung)</span>}
      </div>
      <button className="cta" style={{ width: '100%' }} onClick={lanjut}>{offer.cta}</button>
      <button className="ghost" style={{ width: '100%' }} onClick={tutup}>{offer.cta_secondary}</button>
      <span className="small muted">Anda bisa menutup penawaran ini kapan saja. Data dan paket Anda tidak berubah sebelum pembayaran disetujui.</span>
    </Sheet>
  );
}

// Penawaran otomatis: berbasis aktivitas (event: LAPORAN.DIBUKA / TRANSAKSI.PERTAMA) lalu penawaran umum
// (mis. Pro bulanan → tahunan, atau paket Gratis → Dasar). Server membatasi: paling banyak satu pop-up umum per 7 hari.
// Dilewati di halaman yang sedang dipakai untuk transaksi agar tidak mengganggu (V2 §8).
export default function GrowthAuto({ kosId, skip, event }) {
  const [offer, setOffer] = useOffer(kosId, skip, event);
  if (!offer) return null;
  return <GrowthSheet offer={offer} kosId={kosId} onDone={() => setOffer(null)} />;
}

export function useOffer(kosId, skip, event) {
  const [offer, setOffer] = useState(null);
  useEffect(() => {
    if (skip || !kosId) return undefined;
    let on = true;
    const minta = (ctx, ev) => supabase.rpc('growth_offer', { p_kos: kosId, p_context: ctx, p_event: ev || null }).then(({ data, error }) => (error ? null : data));
    (async () => {
      const data = (event && await minta('aktivitas', event)) || await minta('umum', null);
      if (!on || !data) return;
      setOffer(data);
      supabase.rpc('growth_track', { p_kos: kosId, p_rule: data.id, p_action: 'shown', p_event: data.context === 'aktivitas' ? event : null }).then(() => {}, () => {});
    })();
    return () => { on = false; };
  }, [kosId, skip, event]);
  return [offer, setOffer];
}
