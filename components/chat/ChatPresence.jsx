'use client';
// Denyut kehadiran: selama aplikasi terbuka & terlihat, catat "aktif" tiap 60 detik (cx_ping). Inilah dasar status "Online"
// yang dilihat pelanggan di chat — bukan saklar manual. Galat diabaikan (tidak mengganggu kerja).
import { useEffect } from 'react';
import { supabase } from '@/lib/supabase';

export default function ChatPresence({ kosId }) {
  useEffect(() => {
    if (!kosId) return;
    const ping = () => { if (!document.hidden && navigator.onLine !== false) supabase.rpc('cx_ping', { p_kos: kosId }).then(() => {}, () => {}); };
    ping();
    const t = setInterval(ping, 60000);
    document.addEventListener('visibilitychange', ping);
    return () => { clearInterval(t); document.removeEventListener('visibilitychange', ping); };
  }, [kosId]);
  return null;
}
