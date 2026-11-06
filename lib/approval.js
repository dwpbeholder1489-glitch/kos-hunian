// Pusat Persetujuan: bila server menjawab PERLU_PERSETUJUAN, tawarkan mengirim permintaan ke pemilik.
import { supabase } from '@/lib/supabase';
import { toast } from '@/components/ui';
import { errMsg } from '@/lib/format';

export async function requestApproval(req) {
  let reason = req.reason;
  if (!reason || reason.trim().length < 3) reason = window.prompt('Tulis alasan permintaan (wajib):') || '';
  if (reason.trim().length < 3) { toast('Dibatalkan — alasan wajib diisi.'); return false; }
  const r = await supabase.rpc('approval_request', { p_kos: req.kos, p_action: req.action, p_payload: req.payload, p_reason: reason.trim() });
  if (r.error) { toast(errMsg(r.error)); return false; }
  toast('Permintaan dikirim. Menunggu persetujuan pemilik di menu Persetujuan.');
  return true;
}

// Jalankan; bila perlu persetujuan → kirim permintaan. Hasil: 'ok' | 'diminta' | false
export async function withApproval(call, okMsg, req) {
  const { data, error } = await call();
  if (!error) { if (okMsg) toast(okMsg); return 'ok'; }
  if (/PERLU_PERSETUJUAN/.test(error.message || '')) {
    if (!window.confirm('Tindakan ini perlu persetujuan pemilik. Kirim permintaan sekarang?')) return false;
    return (await requestApproval(req)) ? 'diminta' : false;
  }
  toast(errMsg(error));
  return false;
}
