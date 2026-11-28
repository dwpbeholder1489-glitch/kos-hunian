// Daftar risiko (Tahap F Master Blueprint BI). Aturan TERTULIS — tingkat risiko & saran dari data.
// Skor = kemungkinan × dampak (skala 1–5). Saran hanya DISARANKAN: masuk daftar bila pemilik/pengelola menerimanya.
import { monthlyBurn, runStress, defaults } from './scenario.js';

export const CATEGORIES = { keuangan: 'Keuangan', operasional: 'Operasional', pasar: 'Pasar & pelanggan', hukum: 'Hukum & perizinan', sdm: 'SDM', teknologi: 'Teknologi & data', reputasi: 'Reputasi', lainnya: 'Lainnya' };
export const STRATEGIES = { kurangi: 'Kurangi (cegah / perkecil)', hindari: 'Hindari (hentikan kegiatannya)', alihkan: 'Alihkan (asuransi / kontrak)', terima: 'Terima (pantau saja)' };
export const STATUSES = { terbuka: 'Terbuka', ditangani: 'Sedang ditangani', dipantau: 'Dipantau', ditutup: 'Ditutup' };
export const LIKELIHOOD = ['', 'Sangat jarang', 'Jarang', 'Mungkin', 'Sering', 'Hampir pasti'];
export const IMPACT = ['', 'Sangat kecil', 'Kecil', 'Sedang', 'Besar', 'Sangat besar'];

// 1–4 rendah, 5–9 sedang, 10–14 tinggi, 15–25 sangat tinggi
export function level(score) {
  const s = Number(score) || 0;
  if (s >= 15) return { key: 'kritis', label: 'Sangat tinggi', tone: 'bad' };
  if (s >= 10) return { key: 'tinggi', label: 'Tinggi', tone: 'bad' };
  if (s >= 5) return { key: 'sedang', label: 'Sedang', tone: 'warn' };
  return { key: 'rendah', label: 'Rendah', tone: 'good' };
}

const rp = (v) => 'Rp ' + Math.round(Number(v) || 0).toLocaleString('id-ID');

// Saran dari data. base = scenario_baseline (aktif), sig = risk_signals. Hasil: [{code, title, category, likelihood, impact, why, mitigation}]
// Tanpa titik awal Pembukuan (mis. pengelola bagian Pengaturan saja, tanpa akses keuangan) → saran dari sinyal yang boleh dibaca saja.
export function suggestions(base, sig, jenis) {
  if (!base || !base.aktif) return signalSuggestions(sig, jenis);
  const out = [];
  const burn = monthlyBurn(base);
  const kas = Number(base.kas) || 0, rev = Number(base.pendapatan) || 0;
  const profit = rev - (Number(base.hpp) || 0) - (Number(base.beban_operasional) || 0) - (Number(base.penyusutan) || 0) - (Number(base.bunga) || 0)
    + (Number(base.pendapatan_lain) || 0) - (Number(base.beban_lain) || 0) - (Number(base.pajak) || 0);
  if (Number(base.bulan_data) > 0 && burn > 0 && kas < burn) out.push({ code: 'kas_tipis', category: 'keuangan', likelihood: 4, impact: 4,
    title: 'Kas tidak cukup untuk biaya sebulan', why: `Kas & bank ${rp(kas)} lebih kecil dari biaya tunai sebulan ${rp(burn)}.`,
    mitigation: 'Tagih piutang, tunda belanja yang bisa ditunda, siapkan dana cadangan minimal satu bulan biaya.' });
  if (Number(base.bulan_data) > 0 && profit < 0) out.push({ code: 'rugi_berulang', category: 'keuangan', likelihood: 4, impact: 4,
    title: 'Usaha merugi rata-rata per bulan', why: `Rata-rata ${base.bulan_data} bulan terakhir rugi ${rp(-profit)} per bulan.`,
    mitigation: 'Periksa harga jual, harga pokok, dan biaya terbesar di Analisis › Laporan Keuangan.' });
  if (Number(base.pinjaman_lancar) > 0 && Number(base.pinjaman_lancar) > kas) out.push({ code: 'pinjaman_jatuh_tempo', category: 'keuangan', likelihood: 4, impact: 5,
    title: 'Cicilan pinjaman 12 bulan melebihi kas', why: `Pokok jatuh tempo ≤ 12 bulan ${rp(base.pinjaman_lancar)}, kas & bank ${rp(kas)}.`,
    mitigation: 'Susun jadwal setoran cicilan dari arus kas bulanan atau bicarakan penjadwalan ulang dengan pemberi pinjaman.' });
  const lewat = Number(sig?.piutang_lewat) || 0;
  if (lewat > 0 && (rev <= 0 || lewat >= rev * 0.1)) out.push({ code: 'piutang_lewat', category: 'keuangan', likelihood: 3, impact: lewat >= rev * 0.5 ? 4 : 3,
    title: base.jenis === 'properti' ? 'Tagihan sewa menunggak' : 'Piutang pelanggan lewat jatuh tempo',
    why: `${rp(lewat)} dari ${Number(sig?.piutang_lewat_n) || 0} ${base.jenis === 'properti' ? 'tagihan' : 'faktur'} sudah lewat jatuh tempo${rev > 0 ? ` (${Math.round((lewat * 100) / rev)}% dari pendapatan sebulan)` : ''}.`,
    mitigation: 'Hubungi pelanggan yang menunggak, beri batas kasbon/kredit, dan tagih rutin setiap minggu.' });
  if (base.jenis !== 'properti' && rev > 0 && Number(base.hpp) / rev > 0.85) out.push({ code: 'margin_tipis', category: 'pasar', likelihood: 3, impact: 3,
    title: 'Margin kotor sangat tipis', why: `Harga pokok ${Math.round((Number(base.hpp) * 100) / rev)}% dari pendapatan — sisa untuk biaya & laba kurang dari 15%.`,
    mitigation: 'Tinjau harga jual, cari pemasok lebih murah, dorong produk dengan margin lebih tinggi.' });
  if (Number(base.bulan_data) > 0 && rev > 0) {
    const dasar = defaults(base).find((d) => d.key === 'dasar');
    const fail = runStress(base, dasar).filter((s) => s.result.negMonth);
    if (fail.length) out.push({ code: 'stress_kas_minus', category: 'keuangan', likelihood: 2, impact: 5,
      title: 'Kas habis bila terjadi guncangan', why: `Stress test: ${fail.slice(0, 3).map((s) => `${s.label.toLowerCase()} → kas minus bulan ke-${s.result.negMonth}`).join('; ')}.`,
      mitigation: 'Siapkan dana cadangan sebesar kebutuhan dana terbesar di Analisis › Skenario, atau batas pinjaman yang bisa dipakai sewaktu-waktu.' });
  }
  return out;
}

function signalSuggestions(sig, jenis) {
  const lewat = Number(sig?.piutang_lewat) || 0;
  if (!(lewat > 0)) return [];
  return [{ code: 'piutang_lewat', category: 'keuangan', likelihood: 3, impact: 3,
    title: jenis === 'properti' ? 'Tagihan sewa menunggak' : 'Piutang pelanggan lewat jatuh tempo',
    why: `${rp(lewat)} dari ${Number(sig?.piutang_lewat_n) || 0} ${jenis === 'properti' ? 'tagihan' : 'faktur'} sudah lewat jatuh tempo.`,
    mitigation: 'Hubungi pelanggan yang menunggak, beri batas kasbon/kredit, dan tagih rutin setiap minggu.' }];
}

// Saran yang ditampilkan: belum diabaikan & belum ada risiko terbuka dari saran yang sama
export function openSuggestions(list, risks, dismissed) {
  const taken = new Set((risks || []).filter((r) => r.status !== 'ditutup' && String(r.source).startsWith('saran:')).map((r) => r.source.slice(6)));
  const skip = new Set(dismissed || []);
  return list.filter((s) => !taken.has(s.code) && !skip.has(s.code));
}

// Peta panas 5×5: jumlah risiko terbuka per (kemungkinan, dampak)
export function heat(risks) {
  const g = Array.from({ length: 6 }, () => Array(6).fill(0));
  for (const r of risks || []) if (r.status !== 'ditutup') g[r.likelihood][r.impact] += 1;
  return g;
}
