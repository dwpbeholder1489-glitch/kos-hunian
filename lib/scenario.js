// Mesin skenario & stress test (Tahap E Master Blueprint BI). Model 'v1' — rumus TERTULIS, deterministik.
// Titik awal = scenario_baseline (rata-rata bulanan dari jurnal + posisi neraca hari ini). Versi tersimpan menyimpan salinan
// titik awal + asumsi, jadi hasil versi lama selalu dihitung ulang dengan rumus yang sama (bila rumus berubah → model 'v2').
//
// Per bulan i = 1..12 (perubahan berlaku sejak bulan 1, tanpa musim):
//   pendapatan = P0 × (1 + pendapatan%) × faktor volume     [kos: hunian target ÷ hunian sekarang; jasa: 1 + pesanan%]
//   HPP        = pendapatan × (HPP0/P0 − margin_pp/100)       [margin_pp + = margin kotor membaik]
//   biaya ops  = O0 × (1 + biaya%)
//   bunga      = B0 + sisa pinjaman × bunga_pp% ÷ 12
//   pajak      = pendapatan × (pajak0/P0)                    [rasio pajak 3 bulan terakhir]
//   laba       = pendapatan − HPP − biaya ops − penyusutan − bunga + (pendapatan lain − beban lain) − pajak − biaya mendadak
//   piutang    = pendapatan × (hari piutang0 + piutang_hari) ÷ 30   [hari piutang0 = piutang ÷ P0 × 30]
//   kas        = kas sebelumnya + laba + penyusutan − kenaikan piutang − cicilan pokok
//   rasio lancar = (kas + piutang + persediaan + aset lancar lain) ÷ (utang usaha + kewajiban lain + pinjaman ≤ 12 bulan)
// TIDAK dihitung: persediaan & utang usaha dianggap tetap, setoran modal/prive, pembelian aset, musim.

export const MODEL = 'v1';
export const HORIZON = 12;
export const KEYS = ['pesimis', 'dasar', 'optimis'];
export const KEY_LABEL = { pesimis: 'Pesimis', dasar: 'Dasar', optimis: 'Optimis' };

// Batas sama dengan scenario_clean di database
export const LIMITS = {
  pendapatan: [-100, 300], biaya: [-100, 300], margin_pp: [-50, 50], piutang_hari: [0, 365], bunga_pp: [0, 50],
  kejutan: [0, 999999999999], kejutan_bulan: [1, 12], hunian: [0, 100], pesanan: [-100, 300],
};

const n = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
const r2 = (v) => Math.round(v * 100) / 100;

export function occupancy(base) {
  const h = base?.hunian;
  return h && n(h.kamar) > 0 ? r2((n(h.terisi) * 100) / n(h.kamar)) : null;
}

// Variabel yang tampil per jenis bisnis (label menyesuaikan)
export function fieldsFor(type) {
  const f = [];
  if (type === 'properti') {
    f.push({ key: 'hunian', label: 'Tingkat hunian', unit: '%', hint: 'Persen kamar terisi (target), bukan perubahan' });
    f.push({ key: 'pendapatan', label: 'Perubahan harga sewa', unit: '%' });
  } else if (type === 'jasa') {
    f.push({ key: 'pesanan', label: 'Perubahan jumlah pesanan', unit: '%' });
    f.push({ key: 'pendapatan', label: 'Perubahan nilai per pesanan', unit: '%' });
  } else {
    f.push({ key: 'pendapatan', label: type === 'retail' ? 'Perubahan penjualan' : 'Perubahan pendapatan', unit: '%' });
  }
  if (type !== 'properti') f.push({ key: 'margin_pp', label: 'Perubahan margin kotor', unit: 'poin %', hint: '+ = harga pokok lebih murah / margin membaik' });
  f.push({ key: 'biaya', label: 'Perubahan biaya operasional', unit: '%' });
  f.push({ key: 'piutang_hari', label: 'Piutang terlambat', unit: 'hari', hint: 'Tambahan hari sampai pelanggan membayar' });
  f.push({ key: 'bunga_pp', label: 'Kenaikan bunga pinjaman', unit: 'poin %/tahun' });
  f.push({ key: 'kejutan', label: 'Biaya mendadak sekali', unit: 'Rp' });
  f.push({ key: 'kejutan_bulan', label: 'Bulan biaya mendadak', unit: 'bulan ke-' });
  return f;
}

export function defaults(base) {
  const type = base?.jenis;
  const occ = occupancy(base);
  const mk = (key, o) => ({ key, pendapatan: 0, biaya: 0, piutang_hari: 0, bunga_pp: 0, kejutan: 0, kejutan_bulan: 1,
    ...(type !== 'properti' ? { margin_pp: 0 } : {}), ...(type === 'jasa' ? { pesanan: 0 } : {}),
    ...(type === 'properti' ? { hunian: occ ?? 0 } : {}), ...o });
  const vol = type === 'properti' ? 'hunian' : type === 'jasa' ? 'pesanan' : 'pendapatan';
  const down = vol === 'hunian' ? { hunian: Math.max(0, r2((occ ?? 0) - 15)) } : { [vol]: -15 };
  const up = vol === 'hunian' ? { hunian: Math.min(100, r2((occ ?? 0) + 10)) } : { [vol]: 10 };
  return [
    mk('pesimis', { ...down, biaya: 5, piutang_hari: 15, bunga_pp: 2, ...(type !== 'properti' ? { margin_pp: -2 } : {}) }),
    mk('dasar', {}),
    mk('optimis', { ...up, ...(type !== 'properti' ? { margin_pp: 1 } : {}) }),
  ];
}

export function validate(a) {
  for (const [k, [lo, hi]] of Object.entries(LIMITS)) {
    if (a[k] == null || a[k] === '') continue;
    const v = Number(a[k]);
    if (!Number.isFinite(v) || v < lo || v > hi) return `${k} harus antara ${lo} dan ${hi}`;
  }
  return null;
}

export function project(base, a) {
  const P0 = n(base.pendapatan), O0 = n(base.beban_operasional), D0 = n(base.penyusutan), B0 = n(base.bunga);
  const other = n(base.pendapatan_lain) - n(base.beban_lain);
  const hppR0 = P0 > 0 ? n(base.hpp) / P0 : 0;
  const taxR = P0 > 0 ? n(base.pajak) / P0 : 0;
  const dso0 = P0 > 0 ? (n(base.piutang) / P0) * 30 : 0;
  const occ = occupancy(base);
  let vol = 1; const notes = [];
  if (base.jenis === 'properti' && a.hunian != null) {
    if (occ > 0) vol = n(a.hunian) / occ;
    else if (n(a.hunian) > 0) notes.push('Belum ada kamar terisi, jadi perubahan hunian tidak bisa dihitung dari pendapatan saat ini.');
  }
  if (base.jenis === 'jasa') vol = 1 + n(a.pesanan) / 100;
  const hppR = Math.max(0, hppR0 - n(a.margin_pp) / 100);
  const CL = n(base.utang_usaha) + n(base.kewajiban_lain) + n(base.pinjaman_lancar);
  const fixedCA = n(base.persediaan) + n(base.aset_lancar_lain);
  let cash = n(base.kas), ar = n(base.piutang), loan = Math.max(0, n(base.pinjaman));
  const months = [];
  for (let i = 1; i <= HORIZON; i++) {
    const rev = P0 * (1 + n(a.pendapatan) / 100) * vol;
    const hpp = rev * hppR;
    const opex = O0 * (1 + n(a.biaya) / 100);
    const interest = B0 + (loan * n(a.bunga_pp)) / 100 / 12;
    const tax = Math.max(0, rev * taxR);
    const shock = i === (n(a.kejutan_bulan) || 1) ? n(a.kejutan) : 0;
    const profit = rev - hpp - opex - D0 - interest + other - tax - shock;
    const arNew = (rev * (dso0 + n(a.piutang_hari))) / 30;
    const principal = Math.min(n(base.pokok_bulanan), loan);
    cash = cash + profit + D0 - (arNew - ar) - principal;
    ar = arNew; loan -= principal;
    const ca = cash + ar + fixedCA;
    months.push({ i, rev: r2(rev), hpp: r2(hpp), opex: r2(opex), interest: r2(interest), tax: r2(tax), shock, profit: r2(profit),
      ar: r2(ar), principal: r2(principal), cash: r2(cash), ratio: CL > 0 ? r2(ca / CL) : null });
  }
  return { months, notes, ...summarize(base, months) };
}

// Biaya tunai sebulan saat ini (untuk menilai bantalan kas)
export const monthlyBurn = (base) => n(base.beban_operasional) + n(base.hpp) + n(base.bunga) + n(base.pokok_bulanan) + n(base.pajak);

function summarize(base, months) {
  const min = months.reduce((m, x) => (x.cash < m.cash ? x : m), months[0]);
  const neg = months.find((x) => x.cash < 0);
  const ratios = months.map((x) => x.ratio).filter((x) => x != null);
  const burn = monthlyBurn(base);
  const status = neg ? 'bahaya' : burn > 0 && min.cash < burn ? 'waspada' : 'aman';
  return {
    revenue: r2(months.reduce((t, x) => t + x.rev, 0)), profit: r2(months.reduce((t, x) => t + x.profit, 0)),
    cashEnd: months[months.length - 1].cash, cashMin: min.cash, cashMinMonth: min.i, negMonth: neg?.i ?? null,
    ratioEnd: months[months.length - 1].ratio, ratioMin: ratios.length ? Math.min(...ratios) : null,
    need: neg ? r2(-min.cash) : 0, status,
  };
}

// Stress test standar, diterapkan di atas skenario Dasar
const mul = (p, f) => r2(((1 + n(p) / 100) * f - 1) * 100);
export function stressTests(base) {
  const t = base?.jenis; const O0 = n(base?.beban_operasional);
  const list = [
    { code: 'turun30', label: t === 'properti' ? 'Harga sewa turun 30%' : t === 'jasa' ? 'Nilai pesanan turun 30%' : 'Pendapatan turun 30%', apply: (a) => ({ ...a, pendapatan: mul(a.pendapatan, 0.7) }) },
    ...(t === 'properti' ? [{ code: 'hunian20', label: 'Hunian turun 20 poin', apply: (a) => ({ ...a, hunian: Math.max(0, n(a.hunian) - 20) }) }] : []),
    ...(t === 'jasa' ? [{ code: 'pesanan30', label: 'Pesanan turun 30%', apply: (a) => ({ ...a, pesanan: mul(a.pesanan, 0.7) }) }] : []),
    ...(t !== 'properti' ? [{ code: 'margin5', label: 'Margin kotor turun 5 poin', apply: (a) => ({ ...a, margin_pp: n(a.margin_pp) - 5 }) }] : []),
    { code: 'biaya20', label: 'Biaya operasional naik 20%', apply: (a) => ({ ...a, biaya: mul(a.biaya, 1.2) }) },
    { code: 'telat60', label: 'Pelanggan bayar 60 hari lebih lambat', apply: (a) => ({ ...a, piutang_hari: n(a.piutang_hari) + 60 }) },
    { code: 'bunga5', label: 'Bunga pinjaman naik 5 poin', apply: (a) => ({ ...a, bunga_pp: n(a.bunga_pp) + 5 }) },
    { code: 'kejutan', label: 'Biaya mendadak = 3 bulan biaya operasional (bulan 1)', apply: (a) => ({ ...a, kejutan: n(a.kejutan) + Math.round(3 * O0), kejutan_bulan: 1 }) },
    { code: 'gabungan', label: 'Gabungan: pendapatan −20%, biaya +10%, bayar 30 hari lebih lambat', apply: (a) => ({ ...a, pendapatan: mul(a.pendapatan, 0.8), biaya: mul(a.biaya, 1.1), piutang_hari: n(a.piutang_hari) + 30 }) },
  ];
  return list;
}

export function runStress(base, dasar) {
  return stressTests(base).map((s) => ({ code: s.code, label: s.label, result: project(base, s.apply({ ...dasar })) }));
}

// Data dasar cukup? (aturan tetap)
export function baselineIssues(base) {
  const out = [];
  if (!base || !n(base.bulan_data)) out.push('Belum ada transaksi di Pembukuan pada 3 bulan penuh terakhir — proyeksi belum bisa dibuat.');
  else if (n(base.bulan_data) < 3) out.push(`Titik awal hanya dari ${base.bulan_data} bulan data; hasil bisa kurang mewakili.`);
  if (base && !n(base.pendapatan) && n(base.bulan_data)) out.push('Pendapatan rata-rata Rp 0 — perubahan persen pendapatan tidak berpengaruh.');
  return out;
}
