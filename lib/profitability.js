// Analisis Kinerja & Profitabilitas (Analisis Bisnis › Profitabilitas) — rumus & aturan TERTULIS atas keluaran profit_analysis.
// Diuji: node supabase/tests/profitabilitas_js.mjs. Tanpa AI generatif: semua rekomendasi = aturan tetap di file ini, selalu dengan angka buktinya.
// Jenis angka: 'aktual' (tercatat), 'estimasi' (dihitung dari catatan dengan asumsi tertulis), 'proyeksi' (laju periode berjalan s.d. akhir periode).
// Keputusan pemilik 28 Nov 2026: biaya TETAP = kategori pengeluaran bertanda "Biaya tetap bulanan" + penyusutan + bunga; sisanya variabel.
import { incomeStatement } from './finRatios.js';

const n = (v) => (v == null || v === '' || !Number.isFinite(Number(v)) ? 0 : Number(v));
const has = (v) => v != null && v !== '' && Number.isFinite(Number(v));
const div = (a, b) => (n(b) !== 0 ? n(a) / n(b) : null);
const rp = (v) => (n(v) < 0 ? '−' : '') + 'Rp ' + Math.round(Math.abs(n(v))).toLocaleString('id-ID');
const pct = (v, d = 1) => (v == null ? '—' : (v * 100).toFixed(d).replace('.', ',') + '%');

// Ambang aturan (tertulis; dipakai juga sebagai teks "cara hitung" di layar)
export const RULES = {
  minTrx: 5,                 // < 5 transaksi → data belum cukup
  safetyOk: 0.2,             // margin keamanan BEP ≥ 20% = sehat; 0–20% = peringatan; < 0 = risiko
  leakWarn: 0.01, leakRisk: 0.03, // kebocoran aktual ÷ pendapatan bersih
  lowMarginShare: 0.05,      // produk/kategori ≥ 5% omzet dengan margin < ½ margin kotor rata-rata = peringatan
  costGrowthGap: 0.1,        // kategori biaya tumbuh ≥ 10 poin persen lebih cepat dari pendapatan & ≥ 2% pendapatan
  costShareMin: 0.02,
  opexStep: 0.03,            // rasio biaya operasional naik ≥ 3 poin persen = peringatan
  minInStockDays: 3,         // estimasi stok habis butuh ≥ 3 hari tersedia untuk laju jual
  idleBufferMonths: 1,       // kas menganggur = saldo rata-rata − 1 bulan uang keluar
  pareto: 0.8,
};

export const LEVEL = { sehat: 'Sehat', peringatan: 'Peringatan', risiko: 'Risiko', info: 'Info', data: 'Data belum cukup' };

// ---------- Laba rugi & margin ----------
export function summary(t) {
  if (!t) return null;
  const s = incomeStatement(t);
  return { ...s, trx: n(t.transaksi), customers: n(t.pelanggan), fixed: n(t.tetap), fixedExpense: n(t.tetap_biaya),
    grossMargin: s.net > 0 ? s.gp / s.net : null, opMargin: s.net > 0 ? s.ebit / s.net : null, netMargin: s.net > 0 ? s.netIncome / s.net : null,
    opexRatio: s.net > 0 ? s.opex / s.net : null, hppRatio: s.net > 0 ? s.hpp / s.net : null, avgTicket: n(t.transaksi) > 0 ? s.net / n(t.transaksi) : null };
}

// Proyeksi akhir periode (hanya periode berjalan): pendapatan & biaya variabel × hari ÷ hari berjalan; biaya tetap tidak dikalikan.
export function projection(d) {
  const days = n(d?.hari), run = n(d?.hari_berjalan);
  if (!d?.cur || !run || run >= days) return null;
  const s = summary(d.cur); const f = days / run; const be = breakEven(d.cur);
  const net = s.net * f;
  const variable = (s.hpp + s.opex + s.dep + s.interest - s.fixed) * f;
  return { factor: f, net, profitOp: net - variable - s.fixed, reachBep: be.bep != null ? net >= be.bep : null, days, run };
}

// ---------- Titik impas (BEP) ----------
export function breakEven(t) {
  const s = incomeStatement(t || {});
  const R = s.net; const F = n(t?.tetap);
  const C = s.hpp + s.opex + s.dep + s.interest;
  const V = C - F;
  const base = { revenue: R, fixed: F, variable: V, cost: C };
  if (!(R > 0)) return { ...base, status: 'data', reason: 'Belum ada pendapatan pada periode ini.' };
  if (!(F > 0)) return { ...base, status: 'data', reason: 'Belum ada biaya tetap. Tandai kategori pengeluaran seperti sewa atau gaji tetap sebagai "Biaya tetap bulanan" (Anggaran › Atur Anggaran).' };
  const cm = R - V; const cmr = cm / R;
  if (!(cmr > 0)) return { ...base, cm, cmr, status: 'risiko', bep: null, reason: 'Biaya variabel sudah sama atau lebih besar dari pendapatan — setiap penjualan tambahan tidak menutup biaya tetap.' };
  const bep = F / cmr; const safety = (R - bep) / R;
  const status = safety < 0 ? 'risiko' : safety < RULES.safetyOk ? 'peringatan' : 'sehat';
  return { ...base, cm, cmr, bep, safety, achieved: R / bep, gap: R - bep, status };
}

// ---------- Profitabilitas & margin per produk / kategori / layanan / kamar / cabang ----------
export function products(d) {
  const rows = (d?.produk || []).map((p) => {
    const omzet = n(p.omzet), hpp = n(p.hpp), laba = omzet - hpp;
    return { id: p.id, name: p.nama, cat: p.kategori, catId: p.kategori_id, omzet, hpp, laba, qty: n(p.qty), margin: omzet > 0 ? laba / omzet : null,
      noCost: n(p.tanpa_modal) > 0, prev: has(p.omzet_lalu) ? n(p.omzet_lalu) : null, prevLaba: has(p.omzet_lalu) ? n(p.omzet_lalu) - n(p.hpp_lalu) : null };
  });
  const omzet = rows.reduce((a, x) => a + x.omzet, 0); const laba = rows.reduce((a, x) => a + x.laba, 0);
  const avgMargin = omzet > 0 ? laba / omzet : null;
  rows.forEach((x) => {
    x.share = omzet > 0 ? x.omzet / omzet : null; x.profitShare = laba > 0 ? x.laba / laba : null;
    x.status = x.margin == null ? 'data' : x.margin < 0 ? 'risiko'
      : avgMargin != null && x.margin < avgMargin / 2 && (x.share || 0) >= RULES.lowMarginShare ? 'peringatan' : 'sehat';
  });
  const byLaba = [...rows].sort((a, b) => b.laba - a.laba);
  let acc = 0; let k = 0;
  if (laba > 0) for (const x of byLaba) { if (acc >= RULES.pareto * laba) break; acc += Math.max(0, x.laba); k += 1; }
  return { rows: byLaba, omzet, laba, avgMargin, pareto: laba > 0 && rows.length ? { count: k, of: rows.length, share: k / rows.length } : null };
}

export function categories(prod) {
  const m = new Map();
  for (const x of prod.rows) {
    const key = x.catId || 'none';
    const c = m.get(key) || { id: x.catId, name: x.cat || 'Tanpa kategori', omzet: 0, hpp: 0, laba: 0, prev: 0, prevLaba: 0, n: 0 };
    c.omzet += x.omzet; c.hpp += x.hpp; c.laba += x.laba; c.prev += n(x.prev); c.prevLaba += n(x.prevLaba); c.n += 1; m.set(key, c);
  }
  const rows = [...m.values()].map((c) => ({ ...c, margin: c.omzet > 0 ? c.laba / c.omzet : null, profitShare: prod.laba > 0 ? c.laba / prod.laba : null, share: prod.omzet > 0 ? c.omzet / prod.omzet : null }));
  rows.forEach((c) => { c.status = c.margin == null ? 'data' : c.margin < 0 ? 'risiko' : prod.avgMargin != null && c.margin < prod.avgMargin / 2 && (c.share || 0) >= RULES.lowMarginShare ? 'peringatan' : 'sehat'; });
  return rows.sort((a, b) => b.laba - a.laba);
}

export function services(d) {
  const rows = (d?.layanan || []).map((x) => {
    const omzet = n(x.omzet); const known = n(x.beresep) > 0 && n(x.beresep) === n(x.baris);
    const bahan = has(x.bahan) ? n(x.bahan) : null;
    return { name: x.nama, omzet, qty: n(x.qty), bahan, laba: known ? omzet - bahan : null, margin: known && omzet > 0 ? (omzet - bahan) / omzet : null,
      partial: n(x.beresep) > 0 && !known, prev: has(x.omzet_lalu) ? n(x.omzet_lalu) : null };
  });
  const omzet = rows.reduce((a, x) => a + x.omzet, 0);
  rows.forEach((x) => { x.share = omzet > 0 ? x.omzet / omzet : null; x.status = x.margin == null ? 'data' : x.margin < 0 ? 'risiko' : 'sehat'; });
  return { rows: rows.sort((a, b) => b.omzet - a.omzet), omzet };
}

export function rooms(d) {
  const rows = (d?.kamar || []).map((r) => {
    const days = n(r.hari), occ = n(r.hari_terisi);
    return { id: r.id, name: r.nama, rent: n(r.tarif), status: r.status, revenue: n(r.masuk), occDays: occ, days, occupancy: days > 0 ? occ / days : null,
      perDay: occ > 0 ? n(r.masuk) / occ : null, prev: has(r.masuk_lalu) ? n(r.masuk_lalu) : null,
      prevOcc: has(r.hari_lalu) && n(r.hari_lalu) > 0 ? n(r.hari_terisi_lalu) / n(r.hari_lalu) : null };
  });
  const tot = rows.reduce((a, r) => ({ rev: a.rev + r.revenue, occ: a.occ + r.occDays, days: a.days + r.days }), { rev: 0, occ: 0, days: 0 });
  return { rows: rows.sort((a, b) => b.revenue - a.revenue), revenue: tot.rev, occupancy: tot.days > 0 ? tot.occ / tot.days : null, perDay: tot.occ > 0 ? tot.rev / tot.occ : null };
}

// Per cabang (Pro): laba rugi tiap lokasi + baris "tanpa lokasi" = total − Σ cabang (biaya yang tidak dicatat per lokasi)
export function branches(d) {
  if (!Array.isArray(d?.cabang)) return null;
  const rows = d.cabang.map((b) => ({ id: b.id, name: b.nama, gudang: b.gudang, ...summary(b.v), be: breakEven(b.v) }));
  const t = summary(d.cur);
  const sum = (k) => rows.reduce((a, r) => a + n(r[k]), 0);
  const rest = { id: null, name: 'Tanpa lokasi (biaya bersama)', net: t.net - sum('net'), gp: t.gp - sum('gp'), opex: t.opex - sum('opex'), netIncome: t.netIncome - sum('netIncome') };
  if (Math.abs(rest.net) >= 1 || Math.abs(rest.opex) >= 1 || Math.abs(rest.netIncome) >= 1) rows.push(rest);
  return rows;
}

// ---------- Pendorong omzet ----------
// Pendapatan = transaksi × nilai rata-rata. Selisih = efek volume (Δtransaksi × rata-rata lama) + efek nilai (transaksi baru × Δrata-rata).
export function drivers(d) {
  const c = summary(d?.cur), p = d?.cmp ? summary(d.cmp) : null;
  if (!c) return null;
  const out = { revenue: c.net, prev: p ? p.net : null, change: p ? c.net - p.net : null, growth: p && p.net > 0 ? (c.net - p.net) / p.net : null, parts: [], movers: [] };
  if (p && c.trx > 0 && p.trx > 0) {
    const a0 = p.net / p.trx, a1 = c.net / c.trx;
    out.parts = [
      { key: 'volume', label: 'Jumlah transaksi', from: p.trx, to: c.trx, effect: (c.trx - p.trx) * a0, fmt: 'num' },
      { key: 'nilai', label: 'Nilai rata-rata per transaksi', from: a0, to: a1, effect: c.trx * (a1 - a0), fmt: 'rp' },
    ];
  }
  if (d?.jenis === 'properti' && d.kamar) {
    const r = rooms(d); const pOcc = (d.kamar || []).reduce((a, x) => ({ o: a.o + n(x.hari_terisi_lalu), h: a.h + n(x.hari_lalu), m: a.m + n(x.masuk_lalu) }), { o: 0, h: 0, m: 0 });
    out.occupancy = { now: r.occupancy, prev: pOcc.h > 0 ? pOcc.o / pOcc.h : null, perDay: r.perDay, prevPerDay: pOcc.o > 0 ? pOcc.m / pOcc.o : null };
  }
  const list = d?.produk ? products(d).rows.map((x) => ({ name: x.name, change: x.omzet - n(x.prev), now: x.omzet, prev: x.prev }))
    : d?.layanan ? services(d).rows.map((x) => ({ name: x.name, change: x.omzet - n(x.prev), now: x.omzet, prev: x.prev }))
    : d?.kamar ? rooms(d).rows.map((x) => ({ name: x.name, change: x.revenue - n(x.prev), now: x.revenue, prev: x.prev })) : [];
  if (p) {
    out.movers = { up: list.filter((x) => x.change > 0).sort((a, b) => b.change - a.change).slice(0, 5), down: list.filter((x) => x.change < 0).sort((a, b) => a.change - b.change).slice(0, 5) };
  }
  return out;
}

// ---------- Efisiensi biaya ----------
export function costs(d) {
  const c = summary(d?.cur), p = d?.cmp ? summary(d.cmp) : null;
  if (!c) return null;
  const revGrowth = p && p.net > 0 ? (c.net - p.net) / p.net : null;
  const cats = (d?.kategori_biaya || []).map((x) => {
    const cur = n(x.cur), prev = n(x.cmp);
    const growth = prev > 0 ? (cur - prev) / prev : null;
    const share = c.net > 0 ? cur / c.net : null;
    const flag = growth != null && revGrowth != null && growth - revGrowth >= RULES.costGrowthGap && (share || 0) >= RULES.costShareMin;
    return { id: x.id, name: x.nama, kind: x.kind, fixed: !!x.tetap, cur, prev, growth, share, budget: has(x.anggaran) ? n(x.anggaran) : null,
      overBudget: has(x.anggaran) && n(x.anggaran) > 0 && cur > n(x.anggaran), status: flag ? 'peringatan' : 'sehat', n: n(x.n) };
  });
  const accounts = (d?.akun || []).map((a) => ({ id: a.id, name: a.nama, cls: a.cls, cur: n(a.cur), prev: n(a.cmp), fixed: n(a.tetap), share: c.net > 0 ? n(a.cur) / c.net : null }));
  const total = c.hpp + c.opex + c.dep + c.interest;
  return {
    revGrowth, cats, accounts, total, fixed: c.fixed, variable: total - c.fixed, fixedShare: total > 0 ? c.fixed / total : null,
    opexRatio: c.opexRatio, prevOpexRatio: p?.opexRatio ?? null, hppRatio: c.hppRatio, prevHppRatio: p?.hppRatio ?? null,
    perTrx: c.trx > 0 ? c.opex / c.trx : null, prevPerTrx: p && p.trx > 0 ? p.opex / p.trx : null,
    status: c.opexRatio != null && p?.opexRatio != null && c.opexRatio - p.opexRatio >= RULES.opexStep ? 'peringatan' : 'sehat',
  };
}

// ---------- Kebocoran laba ----------
// kind: aktual = uang/barang yang benar-benar hilang tercatat; risiko = belum hilang tapi berisiko; info = dicatat untuk konteks (bukan kebocoran).
const LEAKS = {
  retail: [
    ['diskon_manual', 'Diskon manual kasir', 'aktual', 'Diskon yang diketik kasir (di luar promo resmi).'],
    ['bawah_modal', 'Jual di bawah modal', 'aktual', 'Σ (modal − harga jual bersih) baris yang harganya di bawah modal.'],
    ['susut', 'Barang rusak / kedaluwarsa', 'aktual', 'Nilai modal barang yang dicatat rusak atau kedaluwarsa.'],
    ['selisih_stok', 'Selisih hitung stok (kurang)', 'aktual', 'Nilai modal stok yang berkurang saat opname/koreksi.'],
    ['laci_kurang', 'Kas laci kurang', 'aktual', 'Σ (uang seharusnya − uang dihitung) saat tutup shift kasir.'],
    ['retur', 'Retur penjualan', 'info', 'Nilai barang yang dikembalikan pelanggan (barang kembali ke stok; bukan seluruhnya rugi).'],
    ['batal', 'Penjualan dibatalkan', 'info', 'Penjualan yang dibatalkan setelah dicatat — periksa bila sering.'],
    ['promo', 'Potongan promo', 'info', 'Potongan dari promo resmi (biaya pemasaran yang disengaja).'],
    ['piutang_90', 'Piutang lewat 90 hari', 'risiko', 'Sisa piutang yang jatuh temponya lewat lebih dari 90 hari.'],
  ],
  jasa: [
    ['diskon', 'Diskon pesanan', 'aktual', 'Potongan harga pada pesanan selesai.'],
    ['ganti_rugi', 'Ganti rugi keluhan', 'aktual', 'Uang ganti rugi keluhan yang diselesaikan.'],
    ['susut', 'Bahan rusak / kedaluwarsa', 'aktual', 'Nilai modal bahan yang dicatat rusak atau kedaluwarsa.'],
    ['kerja_ulang', 'Kerja/cuci ulang', 'info', 'Jumlah pesanan ulang gratis karena keluhan (biaya tenaga & bahan tidak tercatat terpisah).'],
    ['batal', 'Pesanan batal', 'info', 'Nilai pesanan yang dibatalkan.'],
    ['piutang_90', 'Belum dibayar > 90 hari', 'risiko', 'Pesanan selesai yang belum lunas lebih dari 90 hari.'],
  ],
  properti: [
    ['tagihan_batal', 'Tagihan dibatalkan manual', 'aktual', 'Tagihan sewa yang dibatalkan pemilik (bukan pembatalan otomatis karena sewa berakhir).'],
    ['tunggakan', 'Tunggakan periode ini', 'risiko', 'Sisa tagihan jatuh tempo di periode ini yang belum dibayar.'],
    ['piutang_90', 'Tunggakan > 90 hari', 'risiko', 'Sisa tagihan yang jatuh temponya lewat lebih dari 90 hari.'],
  ],
};
export function leakage(d) {
  const net = summary(d?.cur)?.net || 0;
  const defs = LEAKS[d?.jenis] || [];
  const items = defs.map(([key, label, kind, formula]) => {
    const x = d?.bocor?.[key];
    if (!x) return null;
    return { key, label, kind, formula, value: n(x.nilai), n: n(x.n), share: net > 0 ? n(x.nilai) / net : null };
  }).filter((x) => x && (x.value !== 0 || x.n !== 0));
  const actual = items.filter((x) => x.kind === 'aktual').reduce((a, x) => a + x.value, 0);
  const risk = items.filter((x) => x.kind === 'risiko').reduce((a, x) => a + x.value, 0);
  const share = net > 0 ? actual / net : null;
  const status = !d?.bocor ? 'data' : share == null ? (actual > 0 ? 'peringatan' : 'sehat') : share >= RULES.leakRisk ? 'risiko' : share >= RULES.leakWarn ? 'peringatan' : 'sehat';
  const ord = { aktual: 0, risiko: 1, info: 2 };
  return { items: items.sort((a, b) => ord[a.kind] - ord[b.kind] || b.value - a.value), actual, risk, share, status, supported: defs.length > 0 };
}

// ---------- Peluang yang terlewat (ESTIMASI, adaptif per jenis bisnis) ----------
// Registry: jenis bisnis baru cukup menambah penghitung di sini (+ data mentahnya di profit_analysis.peluang).
const OPP = [
  { key: 'stok_habis', label: 'Penjualan hilang karena stok habis', types: ['retail'], calc: oppStock },
  { key: 'kamar_kosong', label: 'Sewa hilang karena kamar kosong', types: ['properti'], calc: oppRooms },
  { key: 'pesanan_batal', label: 'Laba hilang dari pesanan batal', types: ['jasa'], calc: oppCancel },
  { key: 'piutang_lambat', label: 'Biaya dana piutang terlambat', types: null, calc: oppReceivable },
  { key: 'kas_menganggur', label: 'Imbal hasil kas yang menganggur', types: null, calc: oppCash },
];
function oppStock(d) {
  const run = n(d.hari_berjalan);
  const items = (d.peluang?.stok_habis || []).map((x) => {
    const inStock = run - n(x.hari_habis); const q = n(x.qty);
    if (!(q > 0) || inStock < RULES.minInStockDays) return { name: x.nama, id: x.id, days: n(x.hari_habis), now: !!x.habis_sekarang, value: null, reason: q > 0 ? 'Hari tersedia terlalu sedikit untuk menghitung laju jual.' : 'Tidak ada penjualan pada periode ini untuk menghitung laju jual.' };
    const rate = q / inStock; const unitProfit = (n(x.omzet) - n(x.hpp)) / q; const lostQty = n(x.hari_habis) * rate;
    return { name: x.nama, id: x.id, days: n(x.hari_habis), now: !!x.habis_sekarang, rate, lostQty, lostRevenue: lostQty * (n(x.omzet) / q), value: Math.max(0, lostQty * unitProfit) };
  });
  const valued = items.filter((x) => x.value != null);
  return { items: items.sort((a, b) => n(b.value) - n(a.value)), value: valued.reduce((a, x) => a + x.value, 0), revenue: valued.reduce((a, x) => a + x.lostRevenue, 0),
    basis: 'laba', formula: 'Hari stok habis × rata-rata terjual per hari saat tersedia × laba per unit (periode ini).',
    reason: items.length && !valued.length ? 'Barang yang habis belum punya cukup data penjualan.' : null };
}
function oppRooms(d) {
  const items = (d.peluang?.kamar_kosong || []).map((x) => ({ name: x.nama, id: x.id, days: n(x.hari_kosong), status: x.status, value: n(x.hari_kosong) * n(x.tarif) / 30 }));
  return { items, value: items.reduce((a, x) => a + x.value, 0), basis: 'pendapatan', formula: 'Hari kamar kosong × tarif bulanan ÷ 30 (potensi sewa, sebelum biaya).' };
}
function oppCancel(d) {
  const x = d.peluang?.pesanan_batal; if (!x) return null;
  const s = summary(d.cur); const m = s.grossMargin;
  return { items: [], n: n(x.n), revenue: n(x.nilai), value: m != null ? n(x.nilai) * Math.max(0, m) : null, basis: 'laba',
    reason: m == null ? 'Margin kotor belum bisa dihitung (belum ada pendapatan).' : null, formula: 'Nilai pesanan batal × margin kotor periode ini.' };
}
function oppReceivable(d) {
  const x = d.peluang?.piutang_lambat; if (!x) return null;
  const rate = has(d.opp_rate) ? n(d.opp_rate) / 100 : null;
  return { items: [], n: n(x.n), outstanding: n(x.sisa), value: rate == null ? null : n(x.rupiah_hari) * rate / 365, basis: 'biaya dana',
    reason: rate == null ? 'Isi suku bunga acuan (mis. bunga pinjaman atau deposito Anda) untuk menghitungnya.' : null,
    formula: 'Σ (sisa piutang × hari terlambat di periode ini) × suku bunga acuan ÷ 365.' };
}
function oppCash(d) {
  const x = d.peluang?.kas; if (!x || !n(x.hari)) return null;
  const rate = has(d.opp_rate) ? n(d.opp_rate) / 100 : null;
  const monthlyOut = n(x.keluar) * 30 / n(x.hari);
  const idle = Math.max(0, n(x.rata_saldo) - RULES.idleBufferMonths * monthlyOut);
  return { items: [], avgBalance: n(x.rata_saldo), monthlyOut, idle, value: rate == null ? null : idle * rate * n(x.hari) / 365, basis: 'imbal hasil',
    reason: rate == null ? 'Isi suku bunga acuan untuk menghitungnya.' : null,
    formula: `Kas menganggur = saldo kas & bank rata-rata − ${RULES.idleBufferMonths} bulan uang keluar; × suku bunga acuan × hari ÷ 365.` };
}
export function opportunities(d) {
  if (!d?.peluang) return null;
  const list = OPP.filter((o) => !o.types || o.types.includes(d.jenis)).map((o) => {
    const r = o.calc(d); return r ? { key: o.key, label: o.label, ...r } : null;
  }).filter(Boolean);
  return { list, total: list.reduce((a, x) => a + n(x.value), 0), rate: has(d.opp_rate) ? n(d.opp_rate) : null };
}

// ---------- Kecukupan data ----------
export function dataIssues(d) {
  const out = []; const c = summary(d?.cur);
  if (!c || !(c.net > 0)) out.push({ code: 'tanpa_pendapatan', text: 'Belum ada pendapatan pada periode ini — analisis margin, BEP, dan kebocoran belum bisa dihitung.' });
  else if (c.trx < RULES.minTrx && d?.jenis !== 'properti') out.push({ code: 'sedikit', text: `Baru ${c.trx} transaksi pada periode ini (minimal ${RULES.minTrx}); hasil bisa belum mewakili.` });
  if (n(d?.data?.tanpa_modal) > 0) out.push({ code: 'tanpa_modal', text: `${n(d.data.tanpa_modal)} baris penjualan tanpa harga modal — HPP terlalu kecil sehingga margin terlihat lebih tinggi. Lengkapi modal di Barang & stok.` });
  if (n(d?.data?.layanan_tanpa_resep) > 0) out.push({ code: 'tanpa_resep', text: `${n(d.data.layanan_tanpa_resep)} baris layanan belum punya resep/bahan — laba per layanan belum bisa dihitung.` });
  if (!(n(d?.cur?.tetap) > 0)) out.push({ code: 'tanpa_tetap', text: 'Belum ada biaya tetap tercatat (kategori bertanda "Biaya tetap bulanan", penyusutan, atau bunga) — BEP belum dihitung.' });
  if (d?.data?.jurnal_pertama && d.data.jurnal_pertama > d.from) out.push({ code: 'awal', text: 'Pencatatan dimulai di tengah periode; pembanding dan tren awal bisa belum lengkap.' });
  return out;
}

// ---------- Rekomendasi (aturan tetap, selalu dengan bukti angka) ----------
// Hasil: [{ level, title, text, action: { label, tab|href } }] — urutan risiko → peringatan → info → sehat
export function recommendations(d) {
  const out = []; const c = summary(d?.cur); if (!c) return out;
  const p = d?.cmp ? summary(d.cmp) : null;
  const be = breakEven(d.cur); const lk = d?.bocor ? leakage(d) : null; const ct = costs(d);
  if (c.net > 0 && c.netIncome < 0) out.push({ level: 'risiko', title: 'Usaha merugi pada periode ini', text: `Rugi bersih ${rp(-c.netIncome)} dari pendapatan ${rp(c.net)} (margin ${pct(c.netMargin)}).`, action: { label: 'Lihat struktur biaya', tab: 'biaya' } });
  if (be.status === 'risiko' && be.bep != null) out.push({ level: 'risiko', title: 'Pendapatan di bawah titik impas', text: `Pendapatan ${rp(be.revenue)} masih kurang ${rp(-be.gap)} dari BEP ${rp(be.bep)}.`, action: { label: 'Buka analisis BEP', tab: 'bep' } });
  else if (be.status === 'peringatan') out.push({ level: 'peringatan', title: 'Margin keamanan tipis', text: `Pendapatan hanya ${pct(be.safety)} di atas BEP ${rp(be.bep)} — penurunan kecil bisa membuat rugi.`, action: { label: 'Buka analisis BEP', tab: 'bep' } });
  if (lk && lk.status !== 'sehat' && lk.items[0]) {
    const top = lk.items.find((x) => x.kind === 'aktual') || lk.items[0];
    out.push({ level: lk.status === 'risiko' ? 'risiko' : 'peringatan', title: 'Kebocoran laba perlu diperiksa', text: `Kebocoran tercatat ${rp(lk.actual)} (${pct(lk.share)} pendapatan); terbesar: ${top.label} ${rp(top.value)}.`, action: { label: 'Telusuri kebocoran', tab: 'bocor' } });
  }
  if (lk && lk.risk > 0) { const r = lk.items.find((x) => x.kind === 'risiko'); out.push({ level: 'peringatan', title: r ? r.label : 'Piutang berisiko', text: `${rp(lk.risk)} belum tertagih dan berisiko tidak terbayar.`, action: { label: 'Lihat rinciannya', tab: 'bocor' } }); }
  if (d?.produk) {
    const pr = products(d);
    const neg = pr.rows.filter((x) => x.status === 'risiko');
    if (neg.length) out.push({ level: 'risiko', title: `${neg.length} produk rugi (margin minus)`, text: `${neg.slice(0, 3).map((x) => `${x.name} ${pct(x.margin)}`).join(', ')}. Periksa harga jual atau modal.`, action: { label: 'Lihat margin produk', tab: 'margin' } });
    const low = pr.rows.filter((x) => x.status === 'peringatan');
    if (low.length) out.push({ level: 'peringatan', title: 'Produk laris bermargin tipis', text: `${low.slice(0, 3).map((x) => `${x.name} (${pct(x.margin)}, ${pct(x.share)} omzet)`).join(', ')} — di bawah separuh margin rata-rata ${pct(pr.avgMargin)}.`, action: { label: 'Tinjau harga', tab: 'margin' } });
    if (pr.pareto && pr.pareto.of >= 5) out.push({ level: 'info', title: 'Sumber laba terkonsentrasi', text: `${pr.pareto.count} dari ${pr.pareto.of} produk menghasilkan ${pct(RULES.pareto, 0)} laba kotor. Jaga stok & harga produk-produk ini.`, action: { label: 'Lihat profitabilitas', tab: 'profit' } });
  }
  if (ct) {
    const grow = ct.cats.filter((x) => x.status === 'peringatan');
    if (grow.length) out.push({ level: 'peringatan', title: 'Biaya tumbuh lebih cepat dari pendapatan', text: `${grow.slice(0, 3).map((x) => `${x.name} ${pct(x.growth)}`).join(', ')} vs pendapatan ${pct(ct.revGrowth)}.`, action: { label: 'Lihat efisiensi biaya', tab: 'biaya' } });
    if (ct.status === 'peringatan') out.push({ level: 'peringatan', title: 'Rasio biaya operasional naik', text: `Dari ${pct(ct.prevOpexRatio)} menjadi ${pct(ct.opexRatio)} pendapatan.`, action: { label: 'Lihat efisiensi biaya', tab: 'biaya' } });
    else if (ct.opexRatio != null && ct.prevOpexRatio != null && ct.prevOpexRatio - ct.opexRatio >= RULES.opexStep) out.push({ level: 'sehat', title: 'Biaya operasional makin efisien', text: `Rasio turun dari ${pct(ct.prevOpexRatio)} menjadi ${pct(ct.opexRatio)} pendapatan.` });
  }
  const op = opportunities(d);
  if (op) for (const o of op.list) {
    if (o.key === 'stok_habis' && n(o.value) > 0) out.push({ level: c.net > 0 && o.value / c.net >= RULES.leakWarn ? 'peringatan' : 'info', title: 'Stok habis menahan penjualan', text: `Perkiraan laba hilang ${rp(o.value)} (ESTIMASI) dari ${o.items.filter((x) => x.value).length} barang; terbesar ${o.items[0]?.name}.`, action: { label: 'Lihat peluang', tab: 'peluang' } });
    if (o.key === 'kamar_kosong' && n(o.value) > 0) out.push({ level: 'peringatan', title: 'Kamar kosong', text: `Potensi sewa ${rp(o.value)} (ESTIMASI) dari ${o.items.length} kamar yang sempat kosong.`, action: { label: 'Lihat peluang', tab: 'peluang' } });
    if (o.key === 'pesanan_batal' && n(o.n) > 0) out.push({ level: 'info', title: 'Pesanan batal', text: `${o.n} pesanan batal senilai ${rp(o.revenue)}${o.value != null ? `; perkiraan laba hilang ${rp(o.value)} (ESTIMASI)` : ''}.`, action: { label: 'Lihat peluang', tab: 'peluang' } });
  }
  const dr = drivers(d);
  if (dr?.parts?.length && dr.change < 0) {
    const main = [...dr.parts].sort((a, b) => a.effect - b.effect)[0];
    out.push({ level: 'info', title: 'Penyebab utama turunnya omzet', text: `${main.label} berubah dari ${main.fmt === 'rp' ? rp(main.from) : Math.round(main.from)} ke ${main.fmt === 'rp' ? rp(main.to) : Math.round(main.to)} (dampak ${rp(main.effect)}).`, action: { label: 'Lihat pendorong omzet', tab: 'omzet' } });
  }
  if (p && c.netMargin != null && p.netMargin != null && c.netMargin - p.netMargin >= 0.02 && c.netIncome > 0) out.push({ level: 'sehat', title: 'Margin bersih membaik', text: `Dari ${pct(p.netMargin)} menjadi ${pct(c.netMargin)}.` });
  const ord = { risiko: 0, peringatan: 1, info: 2, sehat: 3 };
  return out.sort((a, b) => ord[a.level] - ord[b.level]);
}

// Status ringkas tiap bagian (penanda sehat / peringatan / risiko / data belum cukup)
export function sectionStatus(d) {
  const c = summary(d?.cur); const be = breakEven(d?.cur);
  const lk = d?.bocor ? leakage(d) : null; const ct = costs(d);
  const marginStatus = !c || !(c.net > 0) ? 'data' : c.netIncome < 0 ? 'risiko' : c.netMargin != null && c.netMargin < 0.05 ? 'peringatan' : 'sehat';
  return { margin: marginStatus, bep: be.status, bocor: lk ? lk.status : null, biaya: ct ? ct.status : null };
}

export const fmt = { rp, pct };
