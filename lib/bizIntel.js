// Analisis Bisnis — logika murni (tanpa React/jaringan) agar bisa diuji dengan node (scripts di supabase/tests/analisis_intel_js.mjs).
// Semua angka masukan berasal dari RPC biz_intel / retail_kpi / stock_health (sumber yang sama dengan laporan).
// Aturan tertulis di sini adalah SATU-SATUNYA dasar skor kesehatan, insight, dan proyeksi — tidak ada AI generatif.

const n = (v) => Number(v || 0);
const clamp = (v, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, v));
const p2 = (v) => String(v).padStart(2, '0');
const iso = (d) => `${d.getUTCFullYear()}-${p2(d.getUTCMonth() + 1)}-${p2(d.getUTCDate())}`;
const D = (s) => new Date(s + 'T00:00:00Z');
export const addDays = (s, k) => { const d = D(s); d.setUTCDate(d.getUTCDate() + k); return iso(d); };
export const daysBetween = (a, b) => Math.round((D(b) - D(a)) / 86400000);
const addMonths = (s, k) => { const d = D(s); const day = d.getUTCDate(); const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + k, 1));
  const last = new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth() + 1, 0)).getUTCDate(); t.setUTCDate(Math.min(day, last)); return iso(t); };
const monthStart = (s) => s.slice(0, 8) + '01';
const monthLast = (s) => iso(new Date(Date.UTC(+s.slice(0, 4), +s.slice(5, 7), 0)));

// ---------- Periode ----------
export const PRESETS = [
  ['hari', 'Hari ini'], ['minggu', 'Minggu ini'], ['bulan', 'Bulan ini'], ['bulan_lalu', 'Bulan lalu'],
  ['kuartal', 'Kuartal ini'], ['tahun', 'Tahun ini'], ['kustom', 'Kustom'],
];
export const COMPARE = [['prev', 'Periode sebelumnya'], ['yoy', 'Tahun lalu'], ['none', 'Tanpa pembanding']];

// Rentang dari preset. today = tanggal Jakarta (YYYY-MM-DD).
export function presetRange(preset, today, custom = {}) {
  switch (preset) {
    case 'hari': return { from: today, to: today };
    case 'minggu': { const dow = (D(today).getUTCDay() + 6) % 7; return { from: addDays(today, -dow), to: today }; }
    case 'bulan_lalu': { const s = addMonths(monthStart(today), -1); return { from: s, to: monthLast(s) }; }
    case 'kuartal': { const m = Math.floor((+today.slice(5, 7) - 1) / 3) * 3 + 1; return { from: `${today.slice(0, 4)}-${p2(m)}-01`, to: today }; }
    case 'tahun': return { from: `${today.slice(0, 4)}-01-01`, to: today };
    case 'kustom': {
      const from = /^\d{4}-\d{2}-\d{2}$/.test(custom.from || '') ? custom.from : monthStart(today);
      let to = /^\d{4}-\d{2}-\d{2}$/.test(custom.to || '') ? custom.to : today;
      if (to > today) to = today;
      return from <= to ? { from, to } : { from: to, to: from };
    }
    default: return { from: monthStart(today), to: today };
  }
}

// Pembanding sepadan: 'prev' = periode tepat sebelumnya dengan panjang sama (bulan berjalan → hari yang sama di bulan lalu),
// 'yoy' = tanggal yang sama tahun lalu, 'none' = tanpa pembanding.
export function compareRange(range, mode, preset) {
  if (mode === 'none') return null;
  if (mode === 'yoy') return { from: addMonths(range.from, -12), to: addMonths(range.to, -12) };
  const len = daysBetween(range.from, range.to);
  if (['bulan', 'bulan_lalu'].includes(preset) || (range.from.endsWith('-01') && range.to.slice(0, 7) === range.from.slice(0, 7))) {
    const from = addMonths(range.from, -1);
    return { from, to: preset === 'bulan_lalu' || range.to === monthLast(range.to) ? monthLast(from) : addMonths(range.to, -1) };
  }
  if (['kuartal', 'tahun'].includes(preset)) {
    const k = preset === 'kuartal' ? 3 : 12;
    return { from: addMonths(range.from, -k), to: addMonths(range.to, -k) };
  }
  return { from: addDays(range.from, -(len + 1)), to: addDays(range.from, -1) };
}

// Batas paket (sama dengan biz_intel): Dasar hanya mulai awal bulan lalu
export const dasarFloor = (today) => addMonths(monthStart(today), -1);

// ---------- Indikator ----------
export const pct = (a, b) => (n(b) === 0 ? null : ((n(a) - n(b)) / Math.abs(n(b))) * 100);
export const ratio = (a, b) => (n(b) === 0 ? null : (n(a) / n(b)) * 100);
export function kpis(d) {
  const c = d.cur || {}; const p = d.cmp || null;
  const margin = (x) => ratio(n(x.laba), x.pendapatan);
  const gross = (x) => ratio(n(x.pendapatan) - n(x.hpp), x.pendapatan);
  const eff = (x) => (n(x.pendapatan) > 0 ? 100 - (n(x.biaya) / n(x.pendapatan)) * 100 : null);
  const avg = (x) => (n(x.transaksi) > 0 ? n(x.pendapatan) / n(x.transaksi) : null);
  return {
    pendapatan: n(c.pendapatan), pendapatan_lalu: p ? n(p.pendapatan) : null, growth: p ? pct(c.pendapatan, p.pendapatan) : null,
    laba: n(c.laba), laba_lalu: p ? n(p.laba) : null,
    margin: margin(c), margin_lalu: p ? margin(p) : null,
    gross: gross(c), gross_lalu: p ? gross(p) : null,
    eff: eff(c), eff_lalu: p ? eff(p) : null,
    avg: avg(c), avg_lalu: p ? avg(p) : null,
    trx: n(c.transaksi), trx_lalu: p ? n(p.transaksi) : null,
  };
}

// ---------- Skor kesehatan bisnis (0–100) ----------
// Bobot: Profitabilitas 25, Likuiditas 20, Pertumbuhan 20, Efisiensi operasional 15, Risiko 20.
// Komponen tanpa data cukup TIDAK dinilai (bukan dianggap 0); skor total = rata-rata berbobot komponen yang dinilai,
// dan hanya ditampilkan bila ada pendapatan pada periode ini DAN minimal 3 komponen dinilai.
// Skor juga tidak dihitung bila transaksi periode < MIN_TRX (terlalu sedikit untuk menilai kesehatan bisnis).
export const MIN_TRX = 5;
export const HEALTH_RULES = [
  ['profit', 'Profitabilitas', 25, 'Margin laba bersih: −5% atau lebih rendah = 0, 20% atau lebih = 100 (garis lurus di antaranya).'],
  ['likuid', 'Likuiditas', 20, 'Saldo kas & bank dibanding rata-rata uang keluar per bulan (90 hari terakhir): 0 bulan = 0, 3 bulan atau lebih = 100.'],
  ['tumbuh', 'Pertumbuhan', 20, 'Perubahan pendapatan dibanding pembanding: −20% = 0, tetap = 50, +20% atau lebih = 100.'],
  ['efisien', 'Efisiensi operasional', 15, 'Efisiensi = 100% − biaya operasional ÷ pendapatan: 50% = 0, 90% atau lebih = 100.'],
  ['risiko', 'Risiko', 20, '100 dikurangi faktor risiko: kas minus (40), rugi (25), pendapatan turun >20% (15), piutang lewat tempo >20% pendapatan (20; ada tapi lebih kecil 10), stok mati >25% nilai stok (10).'],
];

export function riskFactors(d, extra = {}) {
  const k = kpis(d); const out = [];
  const kas = n(d.posisi?.kas);
  if (d.posisi && kas < 0) out.push({ key: 'kas', w: 40, text: `Saldo kas & bank minus (${fmtRp(kas)}).` });
  if (k.pendapatan > 0 && k.laba < 0) out.push({ key: 'rugi', w: 25, text: `Periode ini rugi ${fmtRp(-k.laba)}.` });
  if (k.growth != null && k.growth < -20) out.push({ key: 'turun', w: 15, text: `Pendapatan turun ${Math.round(-k.growth)}% dari pembanding.` });
  const lewat = n(d.piutang_lewat?.nilai);
  if (lewat > 0) {
    const big = k.pendapatan > 0 ? lewat / k.pendapatan > 0.2 : true;
    out.push({ key: 'piutang', w: big ? 20 : 10, text: `Piutang lewat jatuh tempo ${fmtRp(lewat)} (${d.piutang_lewat.dokumen} dokumen).` });
  }
  const sh = extra.stock?.ringkas;
  if (sh) {
    const total = Object.values(sh).reduce((t, x) => t + n(x.nilai), 0);
    const mati = n(sh.mati?.nilai);
    if (total > 0 && mati / total > 0.25) out.push({ key: 'stok', w: 10, text: `Stok tidak bergerak ${fmtRp(mati)} (${Math.round((mati * 100) / total)}% nilai stok).` });
  }
  return out;
}

export function healthScore(d, extra = {}) {
  const k = kpis(d); const comps = {};
  const set = (key, score, value, reason) => { comps[key] = { score: score == null ? null : Math.round(clamp(score)), value, reason }; };
  set('profit', k.pendapatan > 0 ? ((k.margin + 5) / 25) * 100 : null, k.margin, k.pendapatan > 0 ? null : 'Belum ada pendapatan pada periode ini.');
  const out90 = n(d.posisi?.kas_keluar_90); const days = n(d.posisi?.hari_data);
  if (d.posisi && out90 > 0 && days >= 30) {
    const monthly = out90 / Math.min(3, days / 30); const runway = n(d.posisi.kas) / monthly;
    set('likuid', n(d.posisi.kas) <= 0 ? 0 : (runway / 3) * 100, runway, null);
  } else set('likuid', null, null, days < 30 ? 'Data kas kurang dari 30 hari.' : 'Belum ada uang keluar 90 hari terakhir.');
  set('tumbuh', k.growth == null ? null : 50 + k.growth * 2.5, k.growth, k.growth == null ? 'Pembanding belum punya pendapatan atau tidak dipilih.' : null);
  set('efisien', k.eff == null ? null : ((k.eff - 50) / 40) * 100, k.eff, k.eff == null ? 'Belum ada pendapatan pada periode ini.' : null);
  const risks = riskFactors(d, extra);
  const riskOk = k.pendapatan > 0 || n(d.posisi?.kas) !== 0;
  set('risiko', riskOk ? 100 - risks.reduce((t, r) => t + r.w, 0) : null, risks.length, riskOk ? null : 'Belum ada transaksi.');
  const list = HEALTH_RULES.map(([key, label, weight, basis]) => ({ key, label, weight, basis, ...comps[key] }));
  const used = list.filter((c) => c.score != null);
  const enough = k.pendapatan > 0 && k.trx >= MIN_TRX && used.length >= 3;
  const wsum = used.reduce((t, c) => t + c.weight, 0);
  const score = enough ? Math.round(used.reduce((t, c) => t + c.score * c.weight, 0) / wsum) : null;
  const best = [...used].sort((a, b) => b.score - a.score)[0];
  const worst = [...used].sort((a, b) => a.score - b.score)[0];
  const status = score == null ? null : score >= 80 ? ['Bisnis dalam kondisi sehat', 'good'] : score >= 65 ? ['Bisnis cukup sehat', 'good']
    : score >= 45 ? ['Bisnis perlu perhatian', 'warn'] : ['Kondisi bisnis kritis', 'bad'];
  const word = (s) => (s >= 70 ? 'baik' : s >= 45 ? 'cukup' : 'lemah');
  const summary = score == null ? null : best && worst && best.key !== worst.key
    ? `${best.label} ${word(best.score)}${worst.score < 60 ? `, tetapi ${worst.label.toLowerCase()} perlu ditingkatkan.` : `; ${worst.label.toLowerCase()} ${word(worst.score)}.`}`
    : `${best.label} ${word(best.score)}.`;
  const riskLevel = comps.risiko.score == null ? null : comps.risiko.score >= 75 ? 'Rendah' : comps.risiko.score >= 50 ? 'Sedang' : 'Tinggi';
  return { score, status, summary, components: list, used: used.length, risks, riskLevel,
    reason: enough ? null : k.pendapatan <= 0 ? 'Belum ada pendapatan pada periode ini, jadi skor tidak dihitung.'
      : k.trx < MIN_TRX ? `Data belum cukup: baru ${k.trx} transaksi pada periode ini (minimal ${MIN_TRX}). Pilih periode lebih panjang.` : 'Data belum cukup: kurang dari 3 komponen bisa dinilai.' };
}

// ---------- Proyeksi (tren linier) ----------
// Pendapatan bulan berikutnya dari regresi linier 3–6 bulan PENUH terakhir (bulan berjalan yang belum selesai tidak dipakai).
// Rentang = ± simpangan baku sisa. Ditandai PROYEKSI, bukan angka aktual.
export function projection(tren, today, key = 'pendapatan') {
  const full = (tren || []).filter((r) => monthLast(r.mulai) < today);
  const pts = full.slice(-6);
  const firstNz = pts.findIndex((r) => n(r[key]) !== 0);
  const use = firstNz < 0 ? [] : pts.slice(firstNz);
  if (use.length < 3) return null;
  const xs = use.map((_, i) => i); const ys = use.map((r) => n(r[key]));
  const mx = xs.reduce((a, b) => a + b, 0) / xs.length; const my = ys.reduce((a, b) => a + b, 0) / ys.length;
  const sxx = xs.reduce((t, x) => t + (x - mx) ** 2, 0);
  const slope = xs.reduce((t, x, i) => t + (x - mx) * (ys[i] - my), 0) / sxx;
  const icpt = my - slope * mx;
  const resid = Math.sqrt(ys.reduce((t, y, i) => t + (y - (icpt + slope * xs[i])) ** 2, 0) / Math.max(1, ys.length - 2));
  const value = Math.max(0, icpt + slope * use.length);
  return { month: addMonths(use[use.length - 1].mulai, 1).slice(0, 7), value: Math.round(value), low: Math.round(Math.max(0, value - resid)),
    high: Math.round(value + resid), n: use.length, slope: Math.round(slope), basis: use.map((r) => [r.mulai.slice(0, 7), n(r[key])]) };
}

// ---------- Insight (aturan tetap) ----------
// Setiap insight: jenis (anomali/penurunan/pemborosan/peluang/masalah), tone, judul, penyebab berbasis data, tindakan, tautan sumber.
const fmtRp = (v) => (v < 0 ? '−' : '') + 'Rp ' + Math.abs(Math.round(n(v))).toLocaleString('id-ID');
const fp = (v) => `${Math.abs(v).toLocaleString('id-ID', { maximumFractionDigits: 1 })}%`;
const pp = (v) => `${v > 0 ? '+' : v < 0 ? '−' : ''}${Math.abs(v).toLocaleString('id-ID', { maximumFractionDigits: 1 })} p.p.`;

export function insights(d, extra = {}) {
  const k = kpis(d); const out = [];
  const add = (x) => out.push(x);
  const per = extra.cmpName || 'periode pembanding';
  const isRetail = d.jenis === 'retail'; const isKos = d.jenis === 'properti';
  // 1. Pendapatan naik/turun + penguraian volume × nilai
  if (k.growth != null && Math.abs(k.growth) >= 5) {
    const tg = pct(k.trx, k.trx_lalu); const ag = k.avg != null && k.avg_lalu ? pct(k.avg, k.avg_lalu) : null;
    const parts = [tg != null && `jumlah transaksi ${tg >= 0 ? 'naik' : 'turun'} ${fp(tg)} (${k.trx_lalu} → ${k.trx})`,
      ag != null && `rata-rata per transaksi ${ag >= 0 ? 'naik' : 'turun'} ${fp(ag)}`].filter(Boolean);
    add({ id: 'omzet', kind: k.growth > 0 ? 'peluang' : 'penurunan', tone: k.growth > 0 ? 'good' : k.growth < -20 ? 'bad' : 'warn', prio: k.growth < -20 ? 90 : k.growth < 0 ? 70 : 40,
      short: `Omzet ${k.growth > 0 ? 'naik' : 'turun'} ${k.growth > 0 ? '+' : '−'}${fp(k.growth)} dibanding ${per}.`,
      title: `Pendapatan ${k.growth > 0 ? 'naik' : 'turun'} ${fp(k.growth)}`,
      cause: `${fmtRp(k.pendapatan_lalu)} → ${fmtRp(k.pendapatan)}${parts.length ? '. Penyebab: ' + parts.join(', ') + '.' : '.'}`,
      action: k.growth > 0 ? 'Pertahankan pendorongnya: cek produk/layanan dan hari yang paling berkontribusi.' : (tg != null && tg < 0 ? 'Transaksi berkurang — cek pelanggan yang tidak kembali dan promosi yang berhenti.' : 'Nilai per transaksi turun — cek diskon, harga, dan campuran produk.'),
      metric: 'pendapatan' });
  }
  // 2. Margin laba bersih
  if (k.margin != null && k.margin_lalu != null && Math.abs(k.margin - k.margin_lalu) >= 1) {
    const c = d.cur; const p = d.cmp;
    const hppD = ratio(c.hpp, c.pendapatan) - (ratio(p.hpp, p.pendapatan) ?? 0); const biayaD = ratio(c.biaya, c.pendapatan) - (ratio(p.biaya, p.pendapatan) ?? 0);
    const dm = k.margin - k.margin_lalu;
    add({ id: 'margin', kind: dm > 0 ? 'peluang' : 'penurunan', tone: dm > 0 ? 'good' : 'warn', prio: dm < -5 ? 80 : dm < 0 ? 60 : 35,
      short: `Laba bersih ${fp(k.margin)} dari omzet (${pp(dm)}).`,
      title: `Margin laba bersih ${dm > 0 ? 'membaik' : 'menurun'} ${pp(dm)}`,
      cause: `Rasio HPP ${pp(-hppD)} pengaruhnya ke margin, rasio biaya operasional ${pp(-biayaD)}.`,
      action: dm > 0 ? 'Catat apa yang berubah (harga jual, supplier, efisiensi) agar bisa diulang.' : Math.abs(hppD) > Math.abs(biayaD) ? 'HPP naik lebih cepat dari harga jual — tinjau harga beli supplier atau harga jual.' : 'Biaya operasional naik — tinjau akun biaya yang meningkat.',
      metric: 'margin' });
  }
  if (k.pendapatan > 0 && k.laba < 0) add({ id: 'rugi', kind: 'masalah', tone: 'bad', prio: 100, short: `Periode ini rugi ${fmtRp(-k.laba)}.`, title: `Rugi ${fmtRp(-k.laba)}`,
    cause: `Pendapatan ${fmtRp(k.pendapatan)} lebih kecil dari HPP ${fmtRp(d.cur.hpp)} + biaya ${fmtRp(d.cur.biaya)}.`, action: 'Buka Laba Rugi dan periksa akun biaya terbesar.', metric: 'laba' });
  // 3. Pemborosan: akun biaya naik tajam
  (d.per_akun || []).filter((a) => a.jenis === 'biaya' && n(a.ini) - n(a.lalu) >= Math.max(100000, k.pendapatan * 0.02) && (n(a.lalu) === 0 || n(a.ini) >= n(a.lalu) * 1.3))
    .sort((a, b) => (n(b.ini) - n(b.lalu)) - (n(a.ini) - n(a.lalu))).slice(0, 2)
    .forEach((a) => add({ id: 'biaya:' + a.id, kind: 'pemborosan', tone: 'warn', prio: 65, short: `Biaya “${a.akun}” naik ${fmtRp(n(a.ini) - n(a.lalu))}.`,
      title: `Biaya “${a.akun}” naik`, cause: `${fmtRp(a.lalu)} → ${fmtRp(a.ini)}${n(a.lalu) > 0 ? ` (+${fp(pct(a.ini, a.lalu))})` : ' (sebelumnya tidak ada)'}.`,
      action: 'Telusuri transaksi akun ini dan pastikan tidak ada pengeluaran dobel atau salah akun.', account: a.akun, metric: 'biaya' }));
  // 4. Kas
  const kas = n(d.posisi?.kas); const out90 = n(d.posisi?.kas_keluar_90);
  if (d.posisi && kas < 0) add({ id: 'kasminus', kind: 'masalah', tone: 'bad', prio: 98, short: `Saldo kas & bank minus ${fmtRp(-kas)}.`, title: 'Saldo kas & bank minus',
    cause: 'Uang keluar yang tercatat lebih besar dari uang masuk + saldo awal. Biasanya ada setoran modal/saldo awal yang belum dicatat.', action: 'Catat saldo awal atau setoran modal di Kas, lalu cek ulang.', metric: 'kas' });
  else if (out90 > 0 && n(d.posisi?.hari_data) >= 30) {
    const runway = kas / (out90 / 3);
    if (runway < 1) add({ id: 'runway', kind: 'masalah', tone: 'warn', prio: 85, short: `Kas hanya cukup ±${runway.toLocaleString('id-ID', { maximumFractionDigits: 1 })} bulan.`,
      title: 'Cadangan kas tipis', cause: `Saldo ${fmtRp(kas)} vs rata-rata uang keluar ${fmtRp(out90 / 3)} per bulan (90 hari terakhir).`,
      action: 'Tagih piutang, tunda belanja yang tidak mendesak, atau tambah modal kerja.', metric: 'kas' });
  }
  if (d.kas && n(d.kas.keluar) > n(d.kas.masuk) && n(d.kas.masuk) > 0) add({ id: 'kasturun', kind: 'anomali', tone: 'info', prio: 30,
    short: `Kas bersih periode ini ${fmtRp(n(d.kas.masuk) - n(d.kas.keluar))}.`, title: 'Uang keluar lebih besar dari uang masuk',
    cause: `Masuk ${fmtRp(d.kas.masuk)}, keluar ${fmtRp(d.kas.keluar)} — termasuk belanja stok, aset, dan pengambilan pemilik.`, action: 'Lihat Arus Kas per minggu untuk menemukan pengeluaran terbesar.', metric: 'kas' });
  // 5. Piutang lewat tempo
  if (n(d.piutang_lewat?.nilai) > 0) add({ id: 'piutang', kind: 'masalah', tone: 'warn', prio: 75, short: `Piutang lewat tempo ${fmtRp(d.piutang_lewat.nilai)}.`,
    title: 'Ada piutang lewat jatuh tempo', cause: `${d.piutang_lewat.dokumen} ${isKos ? 'tagihan sewa' : 'nota kasbon'} belum lunas melewati jatuh tempo, total ${fmtRp(d.piutang_lewat.nilai)}.`,
    action: isKos ? 'Kirim pengingat dari menu Tagihan.' : 'Hubungi pelanggan dari menu Kas › Kasbon atau Umur piutang.', href: isKos ? '/tagihan' : '/pembukuan?tab=umur' });
  // 6. Persediaan
  const sh = extra.stock?.ringkas;
  if (isRetail && sh?.mati && n(sh.mati.n) > 0) add({ id: 'stokmati', kind: 'pemborosan', tone: 'warn', prio: 55, short: `${sh.mati.n} barang tidak bergerak (${fmtRp(sh.mati.nilai)}).`,
    title: 'Modal tertahan di stok mati', cause: `${sh.mati.n} barang tanpa penjualan 90 hari dengan nilai ${fmtRp(sh.mati.nilai)}${sh.lambat ? `; ${sh.lambat.n} barang lambat (${fmtRp(sh.lambat.nilai)})` : ''}.`,
    action: 'Buat promo/bundling atau retur ke supplier; kurangi pembelian barang ini.', href: '/barang' });
  const inv = (d.persediaan || []).filter((r) => r.perputaran != null);
  if (inv.length >= 2) { const a = inv[inv.length - 1].perputaran, b = inv[inv.length - 2].perputaran;
    if (b > 0 && a < b * 0.8) add({ id: 'putar', kind: 'penurunan', tone: 'warn', prio: 45, short: `Perputaran persediaan turun ke ${a}×.`, title: 'Perputaran persediaan melambat',
      cause: `${b}× → ${a}× per bulan: stok bertambah lebih cepat dari barang yang terjual.`, action: 'Sesuaikan jumlah belanja dengan Saran belanja di menu Belanja.', href: '/belanja' }); }
  // 7. Produk: konsentrasi & pertumbuhan
  const pr = d.produk; const items = pr?.items || [];
  if (items.length && n(pr.total) > 0) {
    const top = items[0]; const share = (n(top.nilai) / n(pr.total)) * 100;
    if (share >= 40 && items.length > 1) add({ id: 'konsentrasi', kind: 'masalah', tone: 'info', prio: 35, short: `${top.nama} = ${Math.round(share)}% penjualan.`,
      title: 'Penjualan bergantung pada satu item', cause: `${top.nama} menyumbang ${fp(share)} dari ${fmtRp(pr.total)}.`, action: 'Jaga stok & harga item ini, dan dorong item kedua/ketiga agar risiko tersebar.' });
    const grow = items.filter((x) => n(x.nilai_lalu) > 0).map((x) => ({ ...x, g: pct(x.nilai, x.nilai_lalu) })).sort((a, b) => b.g - a.g)[0];
    if (grow && grow.g >= 25) add({ id: 'tumbuh:' + grow.nama, kind: 'peluang', tone: 'good', prio: 30, short: `${grow.nama} naik ${fp(grow.g)}.`,
      title: `${grow.nama} tumbuh paling cepat`, cause: `${fmtRp(grow.nilai_lalu)} → ${fmtRp(grow.nilai)} dibanding ${per}.`, action: 'Pastikan stok cukup dan tampilkan di depan/halaman bisnis.' });
  }
  // 8. Pelanggan
  const cu = d.pelanggan;
  if (cu) {
    const pool = n(cu.aktif) + n(cu.tidak_aktif);
    if (pool >= 5 && n(cu.tidak_aktif) / pool >= 0.2) add({ id: 'reaktivasi', kind: 'peluang', tone: 'info', prio: 38, short: `${cu.tidak_aktif} pelanggan belum kembali.`,
      title: 'Pelanggan yang tidak kembali', cause: `${cu.tidak_aktif} dari ${pool} pelanggan (180 hari terakhir) tidak bertransaksi di periode ini.`, action: 'Hubungi lewat WhatsApp dengan penawaran khusus.', seg: 'tidak_aktif' });
    if (k.trx > 0 && n(cu.trx_kontak) / k.trx < 0.5 && (isRetail || d.jenis === 'jasa')) add({ id: 'kontak', kind: 'masalah', tone: 'info', prio: 20,
      short: `${Math.round((1 - n(cu.trx_kontak) / k.trx) * 100)}% transaksi tanpa nama pelanggan.`, title: 'Data pelanggan belum lengkap',
      cause: `Hanya ${cu.trx_kontak} dari ${k.trx} transaksi tercatat dengan nama pelanggan, jadi analisis pelanggan terbatas.`, action: 'Pilih pelanggan di Kasir/Pesanan untuk pembeli langganan.' });
    if (cu.baru_lalu != null && n(cu.baru) !== n(cu.baru_lalu) && Math.max(n(cu.baru), n(cu.baru_lalu)) >= 3) add({ id: 'baru', kind: n(cu.baru) > n(cu.baru_lalu) ? 'peluang' : 'penurunan',
      tone: n(cu.baru) > n(cu.baru_lalu) ? 'good' : 'warn', prio: 33, short: `Pelanggan baru ${cu.baru_lalu} → ${cu.baru}.`, title: `Pelanggan baru ${n(cu.baru) > n(cu.baru_lalu) ? 'bertambah' : 'berkurang'}`,
      cause: `${cu.baru} pelanggan pertama kali bertransaksi (pembanding ${cu.baru_lalu}).`, action: n(cu.baru) > n(cu.baru_lalu) ? 'Ajak mereka kembali dalam 30 hari pertama.' : 'Cek kanal promosi yang biasanya membawa pelanggan baru.', seg: 'baru' });
  }
  // 9. Kos: hunian & penagihan
  const h = d.hunian;
  if (h && n(h.kamar) > 0) {
    const occ = (n(h.terisi) / n(h.kamar)) * 100;
    if (occ < 80) add({ id: 'hunian', kind: 'peluang', tone: 'info', prio: 50, short: `Hunian ${Math.round(occ)}% (${h.kamar - h.terisi} kamar kosong).`, title: 'Kamar kosong bisa diisi',
      cause: `${h.terisi} dari ${h.kamar} kamar terisi.`, action: 'Terbitkan halaman bisnis & pendaftaran online, cek harga kamar kosong.', href: '/kamar' });
    if (n(h.tagihan) > 0 && n(h.tagihan_dibayar) / n(h.tagihan) < 0.9) add({ id: 'tagih', kind: 'masalah', tone: 'warn', prio: 70,
      short: `Tagihan terbayar ${Math.round((n(h.tagihan_dibayar) * 100) / n(h.tagihan))}%.`, title: 'Penagihan belum lancar',
      cause: `${fmtRp(h.tagihan_dibayar)} dari ${fmtRp(h.tagihan)} tagihan jatuh tempo periode ini sudah dibayar.`, action: 'Kirim pengingat dari menu Tagihan.', href: '/tagihan' });
  }
  // 10. Jam ramai (Pro)
  const cells = d.heatmap?.sel || [];
  if (cells.length >= 5) {
    const best = [...cells].sort((a, b) => n(b.n) - n(a.n))[0]; const total = cells.reduce((t, c) => t + n(c.n), 0);
    if (total >= 20) add({ id: 'jam', kind: 'peluang', tone: 'info', prio: 25, short: `Paling ramai ${HARI[best.h - 1]} pukul ${p2(best.j)}.00.`, title: 'Jam paling ramai',
      cause: `${best.n} dari ${total} transaksi terjadi ${HARI[best.h - 1]} pukul ${p2(best.j)}.00–${p2(best.j)}.59.`, action: 'Atur jadwal karyawan & stok siap jual sebelum jam ini.' });
  }
  // 11. Cabang rugi
  (d.per_lokasi || []).filter((l) => n(l.cur?.pendapatan) > 0 && n(l.cur?.laba) < 0).forEach((l) => add({ id: 'cabang:' + l.id, kind: 'masalah', tone: 'warn', prio: 72,
    short: `${l.lokasi} rugi ${fmtRp(-l.cur.laba)}.`, title: `${l.lokasi} rugi`, cause: `Pendapatan ${fmtRp(l.cur.pendapatan)}, HPP+biaya ${fmtRp(n(l.cur.hpp) + n(l.cur.biaya))}.`, action: 'Bandingkan harga, biaya sewa, dan jam buka dengan cabang lain.' }));
  // 12. Proyeksi
  const pj = extra.proj;
  if (pj) add({ id: 'proyeksi', kind: 'proyeksi', tone: 'info', prio: 15, short: `Proyeksi omzet ${monthName(pj.month)} ±${fmtRp(pj.value)}.`, title: `Proyeksi ${monthName(pj.month)}`,
    cause: `Tren linier ${pj.n} bulan penuh terakhir: perkiraan ${fmtRp(pj.low)}–${fmtRp(pj.high)}. Ini proyeksi, bukan angka aktual.`, action: pj.slope < 0 ? 'Tren menurun — siapkan rencana penjualan bulan depan.' : 'Siapkan stok & tenaga sesuai perkiraan.' });
  return out.sort((a, b) => b.prio - a.prio);
}
export const HARI = ['Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu', 'Minggu'];
const BLNL = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
export const monthName = (ym) => `${BLNL[+ym.slice(5, 7) - 1]} ${ym.slice(0, 4)}`;

// Istilah per jenis bisnis (Adaptive Business Engine)
export function terms(d, kuliner) {
  if (d.jenis === 'properti') return { omzet: 'Pendapatan sewa', trx: 'Pembayaran diterima', produk: 'Kamar', pelanggan: 'Penghuni', avg: 'Rata-rata pembayaran' };
  if (d.jenis === 'jasa') return kuliner ? { omzet: 'Omzet', trx: 'Pesanan selesai', produk: 'Menu', pelanggan: 'Pelanggan', avg: 'Rata-rata pesanan' }
    : { omzet: 'Omzet', trx: 'Pesanan selesai', produk: 'Layanan', pelanggan: 'Pelanggan', avg: 'Rata-rata pesanan' };
  if (d.jenis === 'kustom') return { omzet: 'Pendapatan', trx: 'Transaksi', produk: 'Pekerjaan', pelanggan: 'Klien', avg: 'Rata-rata transaksi' };
  return { omzet: 'Omzet', trx: 'Transaksi', produk: 'Produk', pelanggan: 'Pelanggan', avg: 'Rata-rata transaksi' };
}
