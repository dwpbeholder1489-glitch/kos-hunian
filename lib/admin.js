// Peran & izin staf PRASARA (izin sebenarnya diperiksa di database: role_perms / admin_can)
export const ROLE = { super_admin: 'Super Admin', support: 'Support', operations: 'Operasional', finance: 'Keuangan', developer: 'Developer' };
export const ROLE_DESC = {
  super_admin: 'Akses penuh: paket & harga, verifikasi pembayaran, override, staf, audit.',
  support: 'Melihat pelanggan, menulis catatan, menghubungi pelanggan. Tidak melihat keuangan platform.',
  operations: 'Dashboard, pelanggan, catatan, menghubungi pelanggan.',
  finance: 'Dashboard & keuangan platform, verifikasi pembayaran langganan.',
  developer: 'Status sistem dan catatan audit. Tanpa data pelanggan.',
};
export const can = (me, perm) => Boolean(me && (me.perms || []).includes(perm));
export const ACTION = {
  tangguhkan: 'Menangguhkan bisnis', aktifkan_lagi: 'Mengaktifkan lagi bisnis', akses_bantuan: 'Membuka diagnostik (akses bantuan)',
  balas_tiket: 'Membalas tiket', ubah_tiket: 'Mengubah tiket', buat_pengumuman: 'Membuat pengumuman', akhiri_pengumuman: 'Mengakhiri pengumuman',
  buka_profil: 'Membuka profil', ubah_paket: 'Paket berubah', setujui_pembayaran: 'Menyetujui pembayaran', tolak_pembayaran: 'Menolak pembayaran',
  tambah_catatan: 'Menambah catatan', kirim_wa: 'Membuka WhatsApp ke pelanggan', kirim_email: 'Membuka email ke pelanggan',
  override: 'Override akses', ubah_staf: 'Mengubah staf',
};
export const TYPE_ICON = { properti: '🏠', retail: '🛒' };
export const ADM_ST = { open: ['Baru', 'bad'], in_progress: ['Ditangani', 'info'], waiting: ['Menunggu pelanggan', 'gold'], resolved: ['Selesai', 'good'], closed: ['Ditutup', 'void'] };
export const PRIO = { urgent: ['Mendesak', 'bad'], high: ['Tinggi', 'warn'], normal: ['Normal', 'void'], low: ['Rendah', 'void'] };
// Template balasan dari database; isian {nama_kos} {email} {situs} diganti otomatis
export async function loadTemplates(supabase, fallback) {
  const { data, error } = await supabase.rpc('admin_template_list');
  if (error || !data?.length) return fallback.map(([id, name, body]) => ({ id, name, body, category: 'umum' }));
  return data;
}
