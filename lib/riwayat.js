// Ringkasan riwayat pengaturan (config_history) — dipakai Konfigurasi › Riwayat dan Syarat pelanggan.
import { rp } from '@/lib/format';

// Sebelum → sesudah untuk perubahan harga & kredit (nilai dari config_history.before/after)
const DIFF_ACT = ['batas_harga', 'daftar_harga_berlaku', 'syarat_pelanggan', 'profil_pelanggan'];
const DIFF_LABEL = { batas_kredit: 'Batas kredit', tempo: 'Tempo', daftar_harga: 'Daftar harga', max_disc: 'Diskon maks.', min_margin: 'Margin min.', mulai: 'Mulai', selesai: 'Berakhir', tipe: 'Tipe', sales: 'Sales' };
const diffVal = (k, v) => (v == null || v === '' ? 'kosong' : k === 'batas_kredit' ? rp(v) : k === 'tempo' ? `${v} hari` : ['max_disc', 'min_margin'].includes(k) ? `${String(v).replace('.', ',')}%` : ['daftar_harga', 'sales'].includes(k) ? 'dipilih' : String(v));
export function diffText(h) {
  if (!DIFF_ACT.includes(h.action) || !h.after) return '';
  const b = h.before || {}, a = h.after || {};
  return Object.keys({ ...b, ...a }).filter((k) => DIFF_LABEL[k] && JSON.stringify(b[k] ?? null) !== JSON.stringify(a[k] ?? null))
    .map((k) => (['daftar_harga', 'sales'].includes(k) && b[k] && a[k] ? `${DIFF_LABEL[k]}: diganti`
      : `${DIFF_LABEL[k]}: ${h.before ? diffVal(k, b[k]) + ' → ' : ''}${diffVal(k, a[k])}`)).join(' · ');
}
