import { hasFeature } from '@/lib/plan';
import { supabase } from '@/lib/supabase';
import { kwitansiText } from '@/lib/kwitansi';
import { autoPrint } from '@/lib/printer';

export function printVerifiedPayment(kos, d, payment, onError) {
  if (!hasFeature(kos, 'kwitansi')) return;
  autoPrint(kos.id, async () => {
    const { data: invoice, error } = await supabase.from('invoice_summary').select('*')
      .eq('kos_id', kos.id).eq('id', payment.invoice_id).single();
    if (error) throw error;
    return kwitansiText(kos, payment, invoice, d.occName(invoice.occupant_id), d.roomCode(invoice.room_id));
  }, onError);
}
