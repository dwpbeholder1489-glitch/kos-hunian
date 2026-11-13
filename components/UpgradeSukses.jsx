'use client';
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { Sheet } from '@/components/ui';
import { rp, tgl, angka } from '@/lib/format';
import { FEATURE_CODES, LIMIT_CODES } from '@/lib/plan';

// "Upgrade Berhasil!" (Paket V2 §10). Muncul sekali setelah aktivasi paket tercatat di server
// (= pembayaran sudah diverifikasi), bukan karena pengguna kembali ke halaman sukses.
// Bila upgrade dimulai dari penawaran (mis. karyawan penuh), tombol utama membawa kembali ke aktivitas itu.
export const KEMBALI_KEY = (kosId) => `prasara-kembali-${kosId}`;
const URUT = ['karyawan', 'cabang', 'produk', 'pelanggan', 'supplier', 'ekspor_bulan', 'lampiran_mb', 'kamar_terisi'];
const fmt = (k, v) => (v == null ? 'Tanpa batas' : k === 'lampiran_mb' ? (v >= 1000 ? `${angka(v / 1000)} GB` : `${angka(v)} MB`) : angka(v));

export default function UpgradeSukses({ kosId, skip }) {
  const [n, setN] = useState(null);
  const [kembali, setKembali] = useState(null);
  useEffect(() => {
    if (skip || !kosId) return undefined;
    let on = true;
    supabase.rpc('upgrade_notice', { p_kos: kosId }).then(({ data, error }) => {
      if (!on || error || !data) return;
      try {
        const k = JSON.parse(localStorage.getItem(KEMBALI_KEY(kosId)) || 'null');
        if (k && Date.now() - (k.at || 0) < 7 * 864e5) setKembali(k);   // hanya dari checkout 7 hari terakhir
      } catch {}
      setN(data);
    });
    return () => { on = false; };
  }, [kosId, skip]);
  if (!n) return null;

  const tandai = () => supabase.rpc('upgrade_notice_seen', { p_kos: kosId, p_id: n.id }).then(() => {}, () => {});
  const selesai = (href) => {
    tandai();
    try { localStorage.removeItem(KEMBALI_KEY(kosId)); } catch {}
    // muat ulang penuh agar menu & batas paket baru langsung terbaca
    window.location.href = href || window.location.pathname;
  };
  const upgrade = n.jenis === 'upgrade';
  const naik = URUT.filter((k) => n.limits?.[k] != null || n.limits_before?.[k] != null)
    .filter((k) => String(n.limits?.[k] ?? '∞') !== String(n.limits_before?.[k] ?? '∞'));
  const fitur = (n.fitur_baru || []).map((c) => FEATURE_CODES[c]).filter(Boolean);

  return (
    <Sheet title={upgrade ? 'Upgrade Berhasil!' : 'Perpanjangan berhasil'} onClose={() => selesai(null)}>
      <div className="notice good" style={{ margin: 0 }}>
        <b>Paket {n.plan_name}</b> sudah aktif{n.active_until ? ` sampai ${tgl(n.active_until)}` : ''}. Pembayaran Anda sudah diverifikasi.
      </div>
      <div className="tile">
        <span className="label">Paket baru</span>
        <span className="v">{n.plan_name}{n.months === 12 ? ' Tahunan' : ''}</span>
        <span className="s">{upgrade && n.before_name ? `Sebelumnya: ${n.before_name} · ` : ''}{n.months === 12 ? '12 bulan' : `${n.months} bulan`}{n.amount != null ? ` · dibayar ${rp(n.amount)}` : ''}</span>
      </div>
      {naik.length > 0 && (
        <div className="tile">
          <span className="label">Kapasitas baru</span>
          {naik.map((k) => (
            <span key={k} className="small">{LIMIT_CODES[k] || k}: <s className="muted">{fmt(k, n.limits_before?.[k])}</s> → <b>{fmt(k, n.limits?.[k])}</b></span>
          ))}
        </div>
      )}
      {fitur.length > 0 && (
        <div className="tile">
          <span className="label">Fitur baru yang tersedia</span>
          {fitur.map((f) => <span key={f} className="small">✓ {f}</span>)}
        </div>
      )}
      {kembali
        ? <button className="cta" style={{ width: '100%' }} onClick={() => selesai(kembali.href)}>{kembali.label}</button>
        : <button className="cta" style={{ width: '100%' }} onClick={() => selesai(null)}>Lanjutkan</button>}
      {kembali && <button className="ghost" style={{ width: '100%' }} onClick={() => selesai(null)}>Tutup</button>}
      <span className="small muted">Invoice ada di Langganan › Riwayat tagihan.</span>
    </Sheet>
  );
}
