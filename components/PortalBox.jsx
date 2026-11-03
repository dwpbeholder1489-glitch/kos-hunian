'use client';
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useKos } from '@/components/KosProvider';
import { toast } from '@/components/ui';
import Locked from '@/components/Locked';
import { hasPlan } from '@/lib/plan';
import { waLink, errMsg } from '@/lib/format';
import { message } from '@/lib/templates';

// Bagian "Portal penghuni" di detail penghuni: kirim / salin / ganti link pribadi
export default function PortalBox({ occ, room }) {
  const { kos } = useKos();
  const pro = hasPlan(kos, 'pro');
  const [token, setToken] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!pro) return;
    supabase.rpc('portal_link', { p_occupant: occ.id, p_reset: false }).then(({ data, error }) => { if (error) toast(errMsg(error)); else setToken(data); });
  }, [occ.id, pro]);

  if (!pro) return <Locked need="pro" title="Portal penghuni" text="Penghuni bisa melihat tagihan sendiri, mengirim bukti transfer, dan bertanya ke asisten 24 jam lewat link pribadi." />;
  const url = token ? `${window.location.origin}/p/${token}` : '';
  const msg = message('portal', kos.wa_portal_tpl, { nama: occ.name, kos: kos.name, kamar: room || '', link: url });

  async function reset() {
    if (!confirm('Ganti link? Link lama tidak bisa dipakai lagi. Gunakan ini jika link tersebar ke orang lain.')) return;
    setBusy(true);
    const { data, error } = await supabase.rpc('portal_link', { p_occupant: occ.id, p_reset: true });
    setBusy(false);
    if (error) return toast(errMsg(error));
    setToken(data); toast('Link baru dibuat. Kirim ulang ke penghuni.');
  }
  const copy = () => { try { navigator.clipboard.writeText(url); toast('Link disalin'); } catch { toast('Tidak bisa menyalin otomatis'); } };

  return (
    <section className="panel">
      <span className="label">Portal penghuni</span>
      <p className="small muted" style={{ margin: 0 }}>Link pribadi untuk {occ.name}: lihat tagihan, kirim bukti transfer, dan tanya asisten kos. Tanpa perlu daftar atau login.</p>
      {!token ? <p className="small muted" style={{ margin: 0 }}>Menyiapkan link…</p> : (
        <>
          {occ.phone
            ? <a href={waLink(occ.phone, msg)} target="_blank" rel="noreferrer"><button className="primary" style={{ width: '100%' }}>Kirim link via WhatsApp</button></a>
            : <p className="small" style={{ margin: 0 }}>Isi nomor WhatsApp penghuni untuk mengirim link langsung.</p>}
          <div className="row">
            <button className="sm" onClick={copy}>Salin link</button>
            <a href={url} target="_blank" rel="noreferrer"><button className="sm">Lihat portal</button></a>
            <button className="sm ghost danger" onClick={reset} disabled={busy}>Ganti link</button>
          </div>
        </>
      )}
    </section>
  );
}
