'use client';
// Saklar "Tampilkan cara bayar di halaman bisnis" (public_pages.show_payment) — untuk SEMUA jenis bisnis.
// Isi cara bayar (kos.payment_info) & gambar QRIS (kos.qris_image) diisi di Pengaturan; halaman publik membacanya lewat public_pay_info.
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { toast } from '@/components/ui';
import { errMsg } from '@/lib/format';

const WHERE = {
  properti: 'formulir pendaftaran penghuni',
  retail: 'halaman bisnis & setelah pelanggan mengirim permintaan',
  jasa: 'halaman bisnis, setelah pesanan terkirim, dan di Cek status pesanan',
};

export default function CaraBayarToggle({ kos, owner, page, onDone, showEditLink = true, ver }) {
  const [p, setP] = useState(page);
  const [busy, setBusy] = useState(false);
  const [empty, setEmpty] = useState(false); // saklar menyala tapi tidak ada yang bisa ditampilkan
  useEffect(() => {
    if (page !== undefined) { setP(page); return; }
    supabase.from('public_pages').select('show_payment, enabled, slug').eq('kos_id', kos.id).maybeSingle().then(({ data }) => setP(data || null));
  }, [kos.id, page]);
  const on = Boolean(p?.show_payment);
  useEffect(() => {
    if (!on || !p?.enabled || !p?.slug) { setEmpty(false); return; }
    supabase.rpc('public_pay_info', { p_slug: p.slug }).then(({ data, error }) => setEmpty(!error && !data));
  }, [on, p?.enabled, p?.slug, ver]);
  const flip = async () => {
    setBusy(true);
    const { error } = await supabase.rpc('public_page_set_payment', { p_kos: kos.id, p_on: !on });
    setBusy(false);
    if (error) return toast(errMsg(error));
    toast(!on ? 'Cara bayar tampil di halaman bisnis' : 'Cara bayar disembunyikan dari halaman bisnis');
    setP({ ...(p || {}), show_payment: !on }); onDone && onDone();
  };
  if (p === undefined) return null;
  return (
    <div className="unitbox" style={{ gap: 6 }}>
      <label className="row small" style={{ flexWrap: 'nowrap', fontWeight: 700 }}>
        <input type="checkbox" style={{ width: 22, minHeight: 22, flex: 'none' }} checked={on} onChange={flip} disabled={!owner || busy || !p} />
        Tampilkan rekening/QRIS di halaman bisnis
      </label>
      <span className="small muted">
        {!p ? <>Simpan <Link href="/halaman">Halaman bisnis</Link> dulu, lalu nyalakan saklar ini.</>
          : <>Tampil di {WHERE[kos.business_type] || 'halaman bisnis'}. Matikan bila Anda lebih suka mengirim nomor rekening lewat WhatsApp.</>}
      </span>
      {on && empty && <span className="small" style={{ color: 'var(--att)' }}>Cara bayar & QRIS masih kosong, jadi belum ada yang tampil. {showEditLink && <Link href="/pengaturan#cara-bayar">Isi di Pengaturan →</Link>}</span>}
      {!owner && <span className="small muted">Hanya pemilik yang bisa mengubah saklar ini.</span>}
    </div>
  );
}
