'use client';
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useKos } from '@/components/KosProvider';
import { toast } from '@/components/ui';
import { tgl, errMsg } from '@/lib/format';

const when = (ts) => { const s = String(ts); return `${tgl(s.slice(0, 10))} ${new Date(s).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Jakarta' })}`; };

// Izin akses bantuan: pemilik mengizinkan tim PRASARA melihat ringkasan diagnostik (tanpa data pribadi), dengan batas waktu
export default function SupportAccess() {
  const { kos, user } = useKos();
  const [s, setS] = useState(null);
  const load = () => supabase.rpc('support_access_status', { p_kos: kos.id }).then(({ data }) => setS(data || { views: [] }));
  useEffect(() => { if (kos) load(); }, [kos?.id]);
  if (!kos || kos.owner_id !== user?.id || !s) return null;
  const grant = async () => { const { error } = await supabase.rpc('support_access_grant', { p_kos: kos.id, p_hours: 24 }); if (error) return toast(errMsg(error)); toast('Izin diberikan selama 24 jam'); load(); };
  const revoke = async () => { const { error } = await supabase.rpc('support_access_revoke', { p_kos: kos.id }); if (error) return toast(errMsg(error)); toast('Izin dicabut'); load(); };
  return (
    <section className="panel">
      <h3>Izinkan tim PRASARA membantu</h3>
      <p className="small muted" style={{ margin: 0 }}>Bila Anda melapor masalah, tim bisa melihat <b>ringkasan diagnostik</b> bisnis ini (jumlah data dan pemeriksaan kejanggalan) selama 24 jam. Tim <b>tidak</b> melihat nama/nomor penghuni atau pelanggan, tidak bisa mengubah data, dan tidak pernah meminta kata sandi.</p>
      {s.active_until ? <>
        <div className="notice good">Izin aktif sampai {when(s.active_until)}.</div>
        <button className="danger" onClick={revoke}>Cabut izin sekarang</button>
      </> : <button onClick={grant}>Izinkan selama 24 jam</button>}
      {s.views?.length > 0 && <span className="small muted">Dibuka tim: {s.views.map((v) => when(v.at)).join(', ')}</span>}
    </section>
  );
}
