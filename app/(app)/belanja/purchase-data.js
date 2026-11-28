import { supabase } from '@/lib/supabase';
import { allRows } from '@/lib/useData';
import { uid } from '@/lib/retail';

export const BUY = { tunai: 'Tunai', transfer: 'Transfer', utang: 'Utang ke supplier' };

export async function loadPurchaseCatalog(kosId, { picker = false } = {}) {
  const query = (table, cols = '*') => supabase.from(table).select(cols).eq('kos_id', kosId);
  const [b, p, u, c, pl, si, cats, barcodes] = await Promise.all([
    query('purchases').order('purchase_date', { ascending: false }).order('created_at', { ascending: false }).limit(60),
    allRows(() => query('products').eq('active', true).order('name')),
    allRows(() => query('product_units')),
    allRows(() => query('contacts').eq('kind', 'supplier').order('name')),
    query('purchase_lines', 'product_id,unit,price,purchase_id').limit(2000),
    allRows(() => query('supplier_items', 'contact_id,product_id,unit,price,moq,preferred,lead_days')),
    picker ? allRows(() => query('product_categories', 'id,name').order('name')) : {},
    picker ? allRows(() => query('product_barcodes', 'product_id,unit,code')) : {},
  ]);
  const error = b.error || p.error || u.error || c.error || pl.error;
  if (error) throw error;
  return { purchases: b.data, products: p.data.filter((x) => !x.is_kit), units: u.data, suppliers: c.data, lines: pl.data, supItems: si.data || [], categories: cats.data || [], barcodes: barcodes.data || [] };
}

export function purchasePath({ month, draft } = {}) {
  const params = new URLSearchParams();
  if (month) params.set('bulan', month);
  if (draft) params.set('draf', draft);
  const query = params.toString();
  return '/belanja/baru' + (query ? '?' + query : '');
}

const keyFor = (kosId, draft) => `prasara:belanja:${kosId}:${draft}`;
export function storePurchasePrefill(kosId, init) {
  const draft = uid();
  sessionStorage.setItem(keyFor(kosId, draft), JSON.stringify(init));
  return draft;
}
export function readPurchasePrefill(kosId, draft) {
  try { return JSON.parse(sessionStorage.getItem(keyFor(kosId, draft)) || 'null'); } catch { return null; }
}
export function clearPurchasePrefill(kosId, draft) {
  try { if (draft) sessionStorage.removeItem(keyFor(kosId, draft)); } catch { /* session storage is optional */ }
}
