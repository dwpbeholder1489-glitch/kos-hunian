'use client';
// Tombol "Chat pelanggan" di detail pesanan: membuka (atau membuat, tanpa mengirim apa pun) percakapan transaksi di /chat.
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { supabase } from '@/lib/supabase';
import { toast } from '@/components/ui';
import { errMsg } from '@/lib/format';

export default function ChatButton({ kosId, type, id, label = 'Chat pelanggan' }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  return <button type="button" className="sm" disabled={busy} onClick={async () => {
    setBusy(true);
    const { data, error } = await supabase.rpc('cx_open_ref', { p_kos: kosId, p_type: type, p_ref: id });
    setBusy(false);
    if (error) return toast(errMsg(error));
    router.push('/chat?c=' + data);
  }}>{label}</button>;
}
