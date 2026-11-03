const fmt = new Intl.NumberFormat('id-ID');
export const BLN = ['Jan','Feb','Mar','Apr','Mei','Jun','Jul','Agu','Sep','Okt','Nov','Des'];
export const BLNL = ['Januari','Februari','Maret','April','Mei','Juni','Juli','Agustus','September','Oktober','November','Desember'];

export const rp = (n) => (n < 0 ? '−' : '') + 'Rp ' + fmt.format(Math.abs(Math.round(Number(n) || 0)));
export const angka = (n) => fmt.format(Number(n) || 0);
const p2 = (n) => String(n).padStart(2, '0');

// Tanggal hari ini menurut zona waktu Indonesia bagian barat
export function today() {
  const d = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Jakarta' }));
  return d.getFullYear() + '-' + p2(d.getMonth() + 1) + '-' + p2(d.getDate());
}
export const thisMonth = () => today().slice(0, 7);
export function tgl(k) { if (!k) return '—'; const [y, m, d] = k.split('-'); return +d + ' ' + BLN[+m - 1] + ' ' + y; }
export function tglShort(k) { if (!k) return '—'; const [, m, d] = k.split('-'); return +d + ' ' + BLN[+m - 1]; }
export function bulan(ym) { const [y, m] = ym.split('-'); return BLNL[+m - 1] + ' ' + y; }
export function monthEnd(ym) { const [y, m] = ym.split('-').map(Number); return ym + '-' + p2(new Date(Date.UTC(y, m, 0)).getUTCDate()); }
export function addMonthsYm(ym, n) { const [y, m] = ym.split('-').map(Number); const t = new Date(Date.UTC(y, m - 1 + n, 1)); return t.getUTCFullYear() + '-' + p2(t.getUTCMonth() + 1); }

// "750.000" / "750rb" / "Rp 1.250.000" → angka
export function parseRp(v) {
  let s = String(v ?? '').trim().toLowerCase();
  let mult = 1;
  if (/(rb|ribu|k)$/.test(s)) { mult = 1000; s = s.replace(/(rb|ribu|k)$/, ''); }
  else if (/(jt|juta)$/.test(s)) { mult = 1e6; s = s.replace(/(jt|juta)$/, ''); }
  s = s.replace(/[^\d,]/g, '').replace(',', '.');
  const n = parseFloat(s);
  return isFinite(n) ? Math.round(n * mult) : 0;
}

export const ROOM_ST = { tersedia: 'Tersedia', terisi: 'Terisi', perbaikan: 'Dalam perbaikan', tidak_disewakan: 'Tidak disewakan' };
export const PAY_ST = { menunggu: ['Menunggu verifikasi', 'gold'], terverifikasi: ['Terverifikasi', 'good'], ditolak: ['Ditolak', 'bad'], dibatalkan: ['Dibatalkan', 'void'] };
export const METHOD = { tunai: 'Tunai', transfer: 'Transfer bank', ewallet: 'E-wallet / QRIS', lainnya: 'Lainnya' };
export const KIND = { operasional: 'Operasional', modal: 'Modal / investasi', non_operasional: 'Non-operasional' };

export function invTitle(i) {
  return i.kind === 'sewa' ? 'Sewa ' + tglShort(i.period_start) + ' – ' + tglShort(i.period_end) : (i.description || 'Tagihan tambahan');
}

// Pesan error dari database → bahasa manusia
export function errMsg(e) {
  const m = e?.message || String(e || '');
  if (/BATAS_GRATIS: /.test(m)) return m.replace(/^.*BATAS_GRATIS: /, '');
  if (/leases_one_active_room/.test(m)) return 'Kamar ini sudah punya penghuni aktif.';
  if (/leases_one_active_occ/.test(m)) return 'Penghuni ini masih punya sewa aktif.';
  if (/rooms_kos_id_code_key|duplicate key.*code/.test(m)) return 'Kode kamar sudah dipakai.';
  if (/violates foreign key/.test(m)) return 'Data ini masih dipakai di catatan lain, jadi tidak bisa dihapus.';
  if (/Failed to fetch|NetworkError/.test(m)) return 'Gagal terhubung. Periksa internet lalu coba lagi.';
  return m || 'Terjadi kesalahan.';
}

export const waLink = (phone, text) => `https://wa.me/${String(phone || '').replace(/\D/g, '').replace(/^0/, '62')}?text=${encodeURIComponent(text)}`;
