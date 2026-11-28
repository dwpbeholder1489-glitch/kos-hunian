// Property Intelligence — rumus & aturan TERTULIS atas keluaran RPC property_intel (migrasi 20261128160000).
// Diuji: node supabase/tests/properti_adaptif_js.mjs. Satu-satunya tempat rumus NOI, rental yield, ROI, balik modal, proyeksi sewa.
// Jenis angka: AKTUAL (tercatat di jurnal/sewa), ESTIMASI (disetahunkan dari < 12 bulan data), PROYEKSI (sewa ke depan dengan asumsi tertulis).
// Nilai investasi & nilai pasar DIISI PEMILIK — tanpa angka bawaan. Tanpa nilai → ROI/yield tidak dihitung (alasan ditulis).
import { incomeStatement } from './finRatios.js';

const n = (v) => (v == null || v === '' || !Number.isFinite(Number(v)) ? 0 : Number(v));
const div = (a, b) => (n(b) !== 0 ? n(a) / n(b) : null);

export const RULES = {
  occGood: 0.9,      // hunian ≥ 90% = sehat
  occWarn: 0.7,      // < 70% = perlu perhatian
  collectGood: 0.95, // tagihan periode terbayar ≥ 95% = sehat
  arrearsWarn: 0.1,  // tunggakan ≥ 10% sewa bulanan berjalan = peringatan
  arrearsRisk: 0.3,
  oldDebtDays: 60,   // tunggakan > 60 hari = prioritas tagih
  opexWarn: 0.5,     // biaya operasional ≥ 50% pendapatan = peringatan
};

// ---------- NOI (Net Operating Income) ----------
// NOI = pendapatan usaha bersih − HPP − beban operasional. TIDAK termasuk penyusutan, bunga pinjaman, pajak, pendapatan/beban lain,
// dan belanja modal (aset tetap). Sama dengan EBITDA di laporan keuangan PRASARA.
export function noi(pnl) {
  const s = incomeStatement(pnl || {});
  return { revenue: s.net, opex: s.hpp + s.opex, noi: s.ebitda, margin: s.net > 0 ? s.ebitda / s.net : null, netIncome: s.netIncome };
}

export function delta(cur, prev) {
  if (prev == null || !Number.isFinite(prev) || prev === 0 || cur == null) return null;
  return (cur - prev) / Math.abs(prev);
}

// Angka tahunan dari 12 bulan penuh terakhir. < 12 bulan data → disetahunkan (ESTIMASI); 0 bulan → null.
export function annual(d) {
  const m = n(d?.t12_period?.bulan);
  if (!d?.t12 || m < 1) return { ok: false, reason: 'Belum ada satu bulan penuh data keuangan.' };
  const x = noi(d.t12); const f = 12 / m;
  return { ok: true, months: m, estimated: m < 12, revenue: x.revenue * f, noi: x.noi * f, opex: x.opex * f, from: d.t12_period.from, to: d.t12_period.to };
}

// Nilai properti (diisi pemilik): investasi = harga perolehan + renovasi; pasar = taksiran nilai sekarang.
export function values(props) {
  const list = props || [];
  const invest = list.reduce((s, p) => s + n(p.invest), 0);
  const market = list.reduce((s, p) => s + n(p.market), 0);
  const missingInvest = list.filter((p) => !(n(p.invest) > 0)).map((p) => p.name);
  const missingMarket = list.filter((p) => !(n(p.market) > 0)).map((p) => p.name);
  return { invest, market, missingInvest, missingMarket, assets: list.reduce((s, p) => s + n(p.aset), 0) };
}

// Rental yield, ROI, balik modal. Basis tertulis di `basis`.
export function returns(d) {
  const a = annual(d);
  const v = values(d?.props);
  const out = { annual: a, values: v, grossYield: null, netYield: null, roi: null, payback: null, reasons: {} };
  if (!a.ok) { out.reasons.all = a.reason; return out; }
  const partialInv = v.missingInvest.length > 0 && v.invest > 0;
  // yield memakai nilai pasar; tanpa nilai pasar memakai nilai investasi (ditandai)
  const base = v.market > 0 && !v.missingMarket.length ? v.market : v.invest > 0 && !v.missingInvest.length ? v.invest : 0;
  out.yieldBasis = base === v.market && v.market > 0 ? 'nilai pasar' : base > 0 ? 'nilai investasi' : null;
  if (base > 0) { out.grossYield = a.revenue / base; out.netYield = a.noi / base; }
  else out.reasons.yield = 'Isi nilai pasar atau nilai investasi semua properti untuk menghitung rental yield.';
  if (v.invest > 0 && !partialInv) {
    out.roi = a.noi / v.invest;
    if (a.noi > 0) out.payback = v.invest / a.noi;
    else out.reasons.payback = 'NOI tahunan belum positif — modal belum kembali dari operasional.';
  } else out.reasons.roi = partialInv ? `Nilai investasi belum diisi untuk: ${v.missingInvest.join(', ')}.` : 'Isi nilai investasi properti (harga beli/bangun + renovasi) untuk menghitung ROI & balik modal.';
  return out;
}

// ---------- Hunian ----------
export function occupancySeries(d) {
  return (d?.occ || []).map((m) => ({ key: m.bulan, value: n(m.hari) > 0 ? n(m.terisi) / n(m.hari) : null, terisi: n(m.terisi), hari: n(m.hari) }));
}
export function roomStatus(rooms) {
  const list = rooms || [];
  const c = { total: list.length, terisi: 0, kosong: 0, booking: 0, perawatan: 0, tidak: 0 };
  for (const r of list) {
    if (r.status === 'terisi') c.terisi++;
    else if (r.status === 'perbaikan') c.perawatan++;
    else if (r.status === 'tidak_disewakan') c.tidak++;
    else if (r.booked) c.booking++;
    else c.kosong++;
  }
  c.rentable = c.total - c.tidak;
  c.occ = c.rentable > 0 ? c.terisi / c.rentable : null;
  c.rentRoll = list.filter((r) => r.status === 'terisi').reduce((s, r) => s + n(r.lease_rent ?? r.rent), 0);
  c.vacantRent = list.filter((r) => r.status === 'tersedia' && !r.booked).reduce((s, r) => s + n(r.rent), 0);
  return c;
}
export function occLevel(v) { return v == null ? 'data' : v >= RULES.occGood ? 'sehat' : v < RULES.occWarn ? 'risiko' : 'peringatan'; }

// ---------- Tunggakan & penagihan ----------
export function collection(d) {
  const ar = d?.arrears || {};
  const rate = n(d?.billed) > 0 ? n(d.collected) / n(d.billed) : null;
  const rr = roomStatus(d?.rooms).rentRoll;
  const ratio = rr > 0 ? n(ar.total) / rr : null;
  return { rate, billed: n(d?.billed), collected: n(d?.collected), arrears: n(ar.total), count: n(ar.count), tenants: n(ar.penghuni), ratio,
    buckets: [['≤ 30 hari', n(ar.b30)], ['31–60 hari', n(ar.b60)], ['61–90 hari', n(ar.b90)], ['> 90 hari', n(ar.b90p)]], old: n(ar.b90) + n(ar.b90p),
    due30: n(d?.due30), level: ratio == null ? (n(ar.total) > 0 ? 'peringatan' : 'sehat') : ratio >= RULES.arrearsRisk ? 'risiko' : ratio >= RULES.arrearsWarn ? 'peringatan' : 'sehat' };
}

// ---------- Profitabilitas per unit (kontribusi langsung) ----------
// Kontribusi = uang sewa masuk kamar itu − biaya perbaikan kamar itu. Biaya bersama (listrik gedung, gaji) TIDAK dibagi ke kamar.
export function units(d) {
  const rows = (d?.units || []).map((u) => ({ ...u, masuk: n(u.masuk), rawat: n(u.rawat), occ: n(u.hari) > 0 ? n(u.hari_terisi) / n(u.hari) : null,
    contribution: n(u.masuk) - n(u.rawat) })).sort((a, b) => b.contribution - a.contribution);
  const total = rows.reduce((s, r) => s + r.masuk, 0);
  return { rows, total, revPau: rows.length ? total / rows.length : null, idle: rows.filter((r) => r.occ != null && r.occ < 0.5) };
}

// ---------- Proyeksi pendapatan sewa 12 bulan (PROYEKSI) ----------
// Konservatif = sewa bertanggal selesai yang masih berjalan + booking; Dasar = + sewa tanpa tanggal selesai (diasumsikan berlanjut);
// Potensi penuh = Dasar + tarif semua kamar kosong (bila semuanya tersewa). Tidak menghitung kenaikan harga atau penghuni keluar mendadak.
export function forecast(d) {
  const rows = (d?.forward || []).map((m) => {
    const kons = n(m.kontrak) + n(m.booking);
    const dasar = kons + n(m.berjalan);
    return { key: m.bulan, konservatif: kons, dasar, penuh: dasar + n(m.potensi) };
  });
  const sum = (k) => rows.reduce((s, r) => s + r[k], 0);
  return { rows, konservatif: sum('konservatif'), dasar: sum('dasar'), penuh: sum('penuh') };
}

// ---------- Per properti (Pro) ----------
export function perProperty(d) {
  const per = new Map((d?.per_prop || []).map((x) => [x.id, x]));
  const rooms = d?.rooms || [];
  return (d?.props || []).map((p) => {
    const x = per.get(p.id);
    const cur = x ? noi(x.pnl) : null;
    const m = n(d?.t12_period?.bulan);
    const yr = x && m >= 1 ? noi(x.t12).noi * 12 / m : null;
    const st = roomStatus(rooms.filter((r) => r.branch === p.id));
    return { ...p, noi: cur?.noi ?? null, revenue: cur?.revenue ?? null, occ: st.occ, annualNoi: yr,
      roi: yr != null && n(p.invest) > 0 ? yr / n(p.invest) : null, yield: yr != null && n(p.market || p.invest) > 0 ? yr / n(p.market || p.invest) : null };
  });
}

// ---------- Temuan (aturan tetap, selalu dengan angka) ----------
export function insights(d) {
  if (!d?.aktif) return [];
  const out = [];
  const st = roomStatus(d.rooms); const col = collection(d); const cur = noi(d.pnl);
  if (st.occ != null && st.occ < RULES.occWarn) out.push({ tone: 'warn', text: `Hunian ${Math.round(st.occ * 100)}% (${st.terisi}/${st.rentable}). Potensi sewa kamar kosong Rp ${Math.round(st.vacantRent).toLocaleString('id-ID')}/bulan — pertimbangkan promosi atau halaman bisnis.`, href: '/kamar' });
  if (col.old > 0) out.push({ tone: 'bad', text: `Tunggakan lebih dari ${RULES.oldDebtDays} hari Rp ${Math.round(col.old).toLocaleString('id-ID')} — prioritaskan penagihan atau potong deposit sesuai perjanjian.`, href: '/tagihan' });
  else if (col.level !== 'sehat' && col.arrears > 0) out.push({ tone: 'warn', text: `Tunggakan Rp ${Math.round(col.arrears).toLocaleString('id-ID')} dari ${col.tenants} penghuni.`, href: '/tagihan' });
  if (col.rate != null && col.rate < RULES.collectGood && col.billed > 0) out.push({ tone: 'info', text: `Tagihan jatuh tempo di periode ini baru terbayar ${Math.round(col.rate * 100)}%.`, href: '/tagihan' });
  if (cur.revenue > 0 && cur.opex / cur.revenue >= RULES.opexWarn) out.push({ tone: 'warn', text: `Biaya operasional ${Math.round((cur.opex / cur.revenue) * 100)}% dari pendapatan — periksa rincian di Analisis › Profitabilitas.`, href: '/analisis?m=profit' });
  if (n(d.maint?.open) > 0) out.push({ tone: 'info', text: `${n(d.maint.open)} keluhan/perbaikan belum selesai.`, href: '/perbaikan' });
  const u = units(d); if (u.idle.length) out.push({ tone: 'info', text: `${u.idle.length} unit terisi kurang dari 50% hari pada periode ini: ${u.idle.slice(0, 5).map((r) => r.code).join(', ')}.`, href: '/kamar' });
  return out;
}

export const pct = (v, dgt = 1) => (v == null ? '—' : (v * 100).toFixed(dgt).replace('.', ',') + '%');
export const years = (v) => (v == null ? '—' : v.toFixed(1).replace('.', ',') + ' tahun');

// Hunian per bulan dari data sewa di browser (Beranda) — rumus SAMA dengan prop_occupancy di database:
// hari kamar terisi (sewa beririsan, sampai hari ini, kamar dihitung sekali per hari) ÷ (hari × kamar yang disewakan sekarang).
export function occFromLeases(rooms, leases, months, todayStr) {
  const rentable = (rooms || []).filter((r) => r.status !== 'tidak_disewakan');
  const ids = new Set(rentable.map((r) => r.id));
  const t = new Date(todayStr + 'T00:00:00Z');
  const out = [];
  for (let k = months - 1; k >= 0; k--) {
    const a = new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth() - k, 1));
    const endM = new Date(Date.UTC(a.getUTCFullYear(), a.getUTCMonth() + 1, 0));
    const b = endM < t ? endM : t;
    const days = Math.round((b - a) / 864e5) + 1;
    const byRoom = new Map();
    for (const l of leases || []) {
      if (!ids.has(l.room_id)) continue;
      const s = new Date(l.start_date + 'T00:00:00Z'); const e = l.end_date ? new Date(l.end_date + 'T00:00:00Z') : b;
      const lo = s > a ? s : a; const hi = e < b ? e : b;
      if (hi < lo) continue;
      const set = byRoom.get(l.room_id) || new Set();
      for (let x = lo.getTime(); x <= hi.getTime(); x += 864e5) set.add(x);
      byRoom.set(l.room_id, set);
    }
    const filled = [...byRoom.values()].reduce((s, v) => s + v.size, 0);
    const avail = days * rentable.length;
    out.push({ key: a.toISOString().slice(0, 7), value: avail > 0 ? filled / avail : null, terisi: filled, hari: avail });
  }
  return out;
}
