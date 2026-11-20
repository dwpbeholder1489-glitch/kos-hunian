// Business DNA (Adaptive Business Experience §6) — label tampilan. Kode & validasi ada di server (biz_vocab, dna_clean).
import { supabase } from '@/lib/supabase';

export const DNA_DIMS = [
  ['models', 'model', 'Model bisnis', 'Cara bisnis menghasilkan uang. Boleh lebih dari satu (hybrid).'],
  ['revenue', 'revenue', 'Struktur pendapatan', 'Pola uang masuk.'],
  ['caps', 'cap', 'Karakter operasional', 'Centang yang benar-benar terjadi di bisnis Anda. Ini yang paling menentukan menu & fitur.'],
  ['channels', 'channel', 'Kanal penjualan', 'Dari mana pelanggan datang.'],
];

export const STAGES = {
  startup: ['Persiapan', 'Bisnis baru disiapkan atau belum ada transaksi.'],
  early: ['Awal operasional', 'Transaksi mulai berjalan.'],
  growing: ['Bertumbuh', 'Transaksi rutin atau sudah ada karyawan.'],
  established: ['Mapan', 'Berjalan ≥ 6 bulan dengan ≥ 100 transaksi per 30 hari.'],
  expansion: ['Ekspansi', 'Sudah ada 2 cabang/outlet.'],
  multi_branch: ['Multi-cabang', '3 cabang/outlet atau lebih.'],
  advanced: ['Operasi lanjutan', '≥ 3 cabang, ≥ 10 karyawan, ≥ 1.000 transaksi per 30 hari.'],
};
export const STAGE_ORDER = ['startup', 'early', 'growing', 'established', 'expansion', 'multi_branch', 'advanced'];

// Kelas relevansi (§8) & status fitur (§14)
export const RELEVANCE = {
  essential: ['Inti', 'info', 'Fondasi operasional — selalu aktif.'],
  highly: ['Sangat relevan', 'good', 'Sesuai profil & cara kerja bisnis Anda.'],
  optional: ['Opsional', 'void', 'Bisa dipakai bila dibutuhkan.'],
  not_relevant: ['Kurang relevan', 'void', 'Tidak ditampilkan sebagai saran untuk profil ini.'],
  restricted: ['Terkunci paket', 'warn', 'Butuh paket yang lebih tinggi.'],
  planned: ['Dalam rencana', 'void', 'Belum tersedia di PRASARA.'],
};
export const FEATURE_STATUS = {
  active: ['Aktif', 'good'], recommended: ['Direkomendasikan', 'info'], available: ['Tersedia', 'void'], disabled: ['Tidak aktif', 'void'],
  restricted: ['Terkunci paket', 'warn'], planned: ['Dalam rencana', 'void'],
};
export const RECO_STATUS = {
  recommended: ['Menunggu keputusan', 'info'], accepted: ['Diterima', 'warn'], rejected: ['Ditolak', 'void'], deferred: ['Ditunda', 'void'],
  activated: ['Diaktifkan', 'good'], dismissed: ['Diabaikan', 'void'], expired: ['Kedaluwarsa', 'void'],
};
export const EVENTS = {
  BUSINESS_PROFILE_UPDATED: 'Profil bisnis diperbarui', NEW_OUTLET_ADDED: 'Cabang/outlet bertambah', EMPLOYEE_COUNT_INCREASED: 'Karyawan bertambah',
  INVENTORY_USAGE_DETECTED: 'Persediaan bertambah', BOOKING_CAPABILITY_ENABLED: 'Mulai menerima booking', SUBSCRIPTION_CHANGED: 'Paket berubah',
  REVENUE_MODEL_CHANGED: 'Model pendapatan berubah', NEW_OPERATIONAL_CAPABILITY_ADDED: 'Karakter operasional bertambah', DAILY_EVALUATION: 'Evaluasi harian',
  BUSINESS_REVIEWED: 'Ditinjau di Pusat Pengalaman',
};
export const HISTORY_ACTION = {
  ubah_dna: 'Profil bisnis (DNA) diubah', ubah_tampilan: 'Tampilan diatur', reset_tampilan: 'Tampilan dikembalikan ke rekomendasi', pulihkan_tampilan: 'Tampilan dipulihkan',
  rekomendasi: 'Keputusan rekomendasi', tahap_bisnis: 'Tahap bisnis berubah', aktifkan_modul: 'Modul diaktifkan', nonaktifkan_modul: 'Modul dinonaktifkan', setup_draf: 'Bisnis didaftarkan',
};
export const PART_NAME = { nav: 'Navigasi', quick: 'Aksi cepat', dash: 'Dashboard' };

// Kosakata (kode stabil → label) dari server; dimuat sekali per sesi
let VOCAB = null;
export async function loadVocab() {
  if (VOCAB) return VOCAB;
  const [v, c] = await Promise.all([
    supabase.from('biz_vocab').select('dim,code,label,hint,sort').eq('active', true).order('sort'),
    supabase.from('biz_categories').select('code,name,icon').eq('active', true).order('sort'),
  ]);
  if (v.error) throw v.error;
  const by = {};
  for (const r of v.data || []) (by[r.dim] ||= []).push(r);
  VOCAB = { ...by, categories: c.data || [] };
  return VOCAB;
}
export const labelOf = (vocab, dim, code) => vocab?.[dim]?.find((x) => x.code === code)?.label || code;
export const emptyDna = () => ({ identity: { secondary_category: null, ownership: null, custom_label: '' }, models: [], revenue: [], caps: [], scale: 'mikro', indicators: { employees: null, outlets: 1, tx_month: null, omzet: null }, channels: [] });
