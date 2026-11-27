'use client';
// Kontak = bisnis sendiri (Tahap I konsolidasi): transaksi dengan kontak ini dieliminasi otomatis di Konsolidasi.
// Server: contact_link_business (izin keuangan di kedua bisnis), my_finance_businesses. Hanya tampil bila pengguna punya > 1 bisnis.
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { toast } from '@/components/ui';
import { errMsg } from '@/lib/format';

export default function KontakBisnis({ contactId, kosId }) {
  const [biz, setBiz] = useState(null);
  const [cur, setCur] = useState(undefined);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let on = true;
    Promise.all([supabase.rpc('my_finance_businesses'), supabase.from('contacts').select('related_kos_id').eq('id', contactId).maybeSingle()]).then(([b, c]) => {
      if (!on) return;
      if (!b.error) setBiz((b.data || []).filter((x) => x.id !== kosId));
      if (!c.error) setCur(c.data?.related_kos_id ?? null);
    });
    return () => { on = false; };
  }, [contactId, kosId]);
  if (!biz || !biz.length || cur === undefined) return null;
  const set = async (v) => {
    if (busy) return; setBusy(true);
    const { error } = await supabase.rpc('contact_link_business', { p_contact: contactId, p_target: v || null });
    setBusy(false);
    if (error) return toast(errMsg(error));
    setCur(v || null); toast(v ? 'Kontak ditandai sebagai bisnis Anda sendiri' : 'Tautan dilepas');
  };
  return <div className="stack" style={{ gap: 6 }}>
    <label className="label" htmlFor={`kb-${contactId}`}>Kontak ini bisnis saya sendiri?</label>
    <select id={`kb-${contactId}`} value={cur || ''} disabled={busy} onChange={(e) => set(e.target.value)}>
      <option value="">Bukan — pihak luar</option>
      {biz.map((b) => <option key={b.id} value={b.id}>Ya: {b.name}</option>)}
    </select>
    <span className="small muted">Bila ya, penjualan/pembelian & piutang/utang dengan kontak ini dihapus dari laporan gabungan di <Link href="/konsolidasi">Konsolidasi</Link> agar uang yang hanya pindah kantong tidak terhitung dua kali.</span>
  </div>;
}
