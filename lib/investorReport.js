// Laporan investor (Tahap H Master Blueprint BI §32): menyusun BAGIAN dokumen dari data investor_snapshot (beku bila final).
// Logika murni (tanpa React) — memakai rumus yang sama dengan layar: finRatios, industryKpi, scenario, risk, valuation.
// Bagian: {id, title, blocks: [{t:'text'|'note'|'kv'|'table', ...}]}. Diuji: node supabase/tests/laporan_investor_js.mjs
import { incomeStatement, incomeLines, balanceSheet, balanceLines, ratios, fmtRatio, equityChanges } from './finRatios.js';
import { industryKpis, fmtKpi } from './industryKpi.js';
import { KEYS, KEY_LABEL, project, runStress, defaults } from './scenario.js';
import { level, CATEGORIES, STATUSES } from './risk.js';
import { BASES, multipleValuation, assetValuation } from './valuation.js';

const n = (v) => Number(v) || 0;
export const rpx = (v) => (n(v) < 0 ? '−Rp ' : 'Rp ') + Math.abs(Math.round(n(v))).toLocaleString('id-ID');
const num = (v) => (n(v) < 0 ? '−' : '') + Math.abs(Math.round(n(v))).toLocaleString('id-ID');
const pct = (a, b) => (n(b) !== 0 ? `${((n(a) - n(b)) / Math.abs(n(b)) * 100).toLocaleString('id-ID', { maximumFractionDigits: 1 })}%` : '—');
const BLN = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
export const tglx = (d) => { if (!d) return '—'; const [y, m, x] = String(d).slice(0, 10).split('-'); return `${+x} ${BLN[+m - 1]} ${y}`; };
const CASH_LABEL = { operasi: 'Aktivitas operasi', investasi: 'Aktivitas investasi', pendanaan: 'Aktivitas pendanaan', saldo_awal: 'Saldo awal & pembukaan' };

export const SECTION_KEYS = [
  ['ringkasan', 'Ringkasan eksekutif'], ['mdna', 'Pembahasan & analisis manajemen'], ['keuangan', 'Laporan keuangan'], ['ekuitas', 'Perubahan ekuitas'],
  ['kas', 'Arus kas'], ['rasio', 'Rasio keuangan'], ['kpi', 'Indikator kinerja industri'], ['skenario', 'Skenario & stress test'], ['risiko', 'Risiko utama'],
  ['valuasi', 'Valuasi'], ['prospek', 'Prospek & rencana'], ['metodologi', 'Metodologi & catatan'],
];
export const REPORT_STATUS = { draf: ['Draf', 'void'], diajukan: ['Menunggu persetujuan', 'warn'], ditolak: ['Ditolak', 'bad'], final: ['Final', 'good'] };
export const TOGGLES = ['keuangan', 'ekuitas', 'kas', 'rasio', 'kpi', 'skenario', 'risiko', 'valuasi', 'metodologi'];

export function buildReport(report, data) {
  const inc = report.include || {}; const on = (k) => inc[k] !== false;
  const sec = report.sections || {};
  const fin = data?.keuangan || {}; const p = data?.periode || {};
  const s = incomeStatement(fin.laba_rugi?.cur || {}); const s0 = fin.laba_rugi?.cmp ? incomeStatement(fin.laba_rugi.cmp) : null;
  const out = [];
  const add = (id, title, blocks) => { if (blocks.length) out.push({ id, title, blocks }); };

  // 1. Ringkasan
  const b1 = fin.neraca ? balanceSheet(fin.neraca.close, fin.neraca.pinjaman_close) : null;
  const hl = [['Pendapatan bersih', rpx(s.net), s0 ? pct(s.net, s0.net) : null], ['Laba kotor', rpx(s.gp), s0 ? pct(s.gp, s0.gp) : null],
    ['Laba bersih', rpx(s.netIncome), s0 ? pct(s.netIncome, s0.netIncome) : null],
    ['Margin laba bersih', s.net > 0 ? `${(s.netIncome / s.net * 100).toLocaleString('id-ID', { maximumFractionDigits: 1 })}%` : '—', null],
    ...(b1 ? [['Kas & bank akhir periode', rpx(b1.cash), null], ['Total ekuitas', rpx(b1.equity), null]] : [])];
  add('ringkasan', 'Ringkasan eksekutif', [
    ...(sec.ringkasan ? [{ t: 'text', v: sec.ringkasan }] : [{ t: 'note', v: 'Ringkasan eksekutif belum ditulis.' }]),
    { t: 'kv', rows: hl.map(([l, v, d]) => [l, v, d ? `vs pembanding ${d}` : null]) },
  ]);
  if (sec.mdna) add('mdna', 'Pembahasan & analisis manajemen', [{ t: 'text', v: sec.mdna }]);

  // 3. Laporan keuangan
  if (on('keuangan')) {
    const L0 = s0 ? Object.fromEntries(incomeLines(s0).map((l) => [l[0], l[2]])) : {};
    const blocks = [{ t: 'table', caption: `Laba rugi ${tglx(p.from)} – ${tglx(p.to)}`, head: ['Pos (Rp)', 'Periode ini', ...(s0 ? ['Pembanding'] : [])],
      rows: incomeLines(s).map(([k, l, v, kind]) => ({ cells: [l, num(v), ...(s0 ? [num(L0[k])] : [])], sub: kind === 'sub' })) }];
    if (fin.neraca) {
      const b0 = balanceSheet(fin.neraca.open, fin.neraca.pinjaman_open); const o = balanceLines(b0);
      blocks.push({ t: 'table', caption: `Neraca per ${tglx(p.to)}`, head: ['Pos (Rp)', 'Akhir', 'Awal'],
        rows: balanceLines(b1).map(([k, l, v, kind], i) => (kind === 'head' ? { head: l } : { cells: [l, num(v), num(o[i][2])], sub: kind === 'sub' })) });
      blocks.push({ t: 'note', v: fin.neraca.seimbang ? 'Neraca seimbang (aset = kewajiban + ekuitas).' : 'PERHATIAN: neraca tidak seimbang — periksa jurnal sebelum laporan dikirim.' });
    }
    add('keuangan', 'Laporan keuangan', blocks);
  }
  if (on('ekuitas')) {
    const e = equityChanges(fin);
    if (e) add('ekuitas', 'Perubahan ekuitas', [{ t: 'table', head: ['Mutasi (Rp)', 'Jumlah'], rows: [
      { cells: ['Ekuitas awal periode', num(e.open)], sub: true }, ...e.lines.map(([, l, v]) => ({ cells: [l, (v > 0 ? '+' : '') + num(v)] })),
      { cells: ['Ekuitas akhir periode', num(e.close)], sub: true }] }, { t: 'note', v: e.cocok ? 'Cocok dengan neraca.' : 'Tidak cocok dengan neraca — periksa jurnal.' }]);
  }
  if (on('kas') && data?.kas) {
    const k = data.kas;
    add('kas', 'Arus kas', [{ t: 'table', head: ['Arus kas (Rp)', 'Masuk', 'Keluar', 'Bersih'], rows: [
      { cells: ['Saldo awal kas & bank', '', '', num(k.saldo_awal)], sub: true },
      ...(k.kelompok || []).map((g) => ({ cells: [CASH_LABEL[g.kelompok] || g.kelompok, num(g.masuk), num(g.keluar), num(g.bersih)] })),
      ...(!k.kelompok ? [{ cells: ['Total', num(k.masuk), num(k.keluar), num(n(k.masuk) - n(k.keluar))] }] : []),
      { cells: ['Saldo akhir kas & bank', '', '', num(k.saldo_akhir)], sub: true }] }]);
  }
  if (on('rasio') && fin.lengkap) {
    const rs = ratios(fin);
    add('rasio', 'Rasio keuangan', [{ t: 'table', head: ['Rasio', 'Nilai', 'Kelompok'], rows: rs.map((r) => ({ cells: [r.label, fmtRatio(r, rpx), r.group] })) },
      { t: 'note', v: 'Rasio bertanda “—” tidak dihitung karena komponennya belum tersedia atau tidak valid.' }]);
  }
  if (on('kpi') && data?.kpi) {
    const kp = industryKpis(data.kpi);
    if (kp.length) add('kpi', 'Indikator kinerja industri', [{ t: 'table', head: ['Indikator', 'Periode ini', ...(data.kpi.cmp ? ['Pembanding'] : [])],
      rows: kp.map((x) => ({ cells: [x.label, fmtKpi(x), ...(data.kpi.cmp ? [fmtKpi(x, x.prev)] : [])] })) }]);
  }
  if (on('skenario') && data?.skenario) {
    const sc = data.skenario; const base = sc.baseline;
    const res = Object.fromEntries(KEYS.map((k) => [k, project(base, { ...defaults(base).find((d) => d.key === k), ...(sc.assumptions.skenario.find((x) => x.key === k) || {}) })]));
    const st = runStress(base, { ...defaults(base).find((d) => d.key === 'dasar'), ...(sc.assumptions.skenario.find((x) => x.key === 'dasar') || {}) });
    add('skenario', 'Skenario & stress test', [
      { t: 'note', v: `${sc.name} · versi ${sc.version} · titik awal per ${tglx(base.tanggal)}. PROYEKSI 12 bulan, bukan angka aktual.` },
      { t: 'table', head: ['12 bulan (Rp)', ...KEYS.map((k) => KEY_LABEL[k])], rows: [
        { cells: ['Pendapatan', ...KEYS.map((k) => num(res[k].revenue))] }, { cells: ['Laba bersih', ...KEYS.map((k) => num(res[k].profit))], sub: true },
        { cells: ['Kas akhir', ...KEYS.map((k) => num(res[k].cashEnd))] }, { cells: ['Kas terendah', ...KEYS.map((k) => num(res[k].cashMin))] },
        { cells: ['Kebutuhan dana', ...KEYS.map((k) => (res[k].need ? num(res[k].need) : '—'))] }] },
      { t: 'table', head: ['Stress test (di atas Dasar)', 'Laba 12 bln', 'Kas terendah'], rows: st.map((x) => ({ cells: [x.label, num(x.result.profit), num(x.result.cashMin)] })) },
    ]);
  }
  if (on('risiko')) {
    const rk = data?.risiko || [];
    add('risiko', 'Risiko utama', rk.length ? [{ t: 'table', textual: true, head: ['Risiko', 'Skor', 'Penanganan', 'Status'],
      rows: rk.map((r) => ({ cells: [`${r.title} (${CATEGORIES[r.category] || r.category})`, `${r.likelihood * r.impact} · ${level(r.likelihood * r.impact).label}`,
        r.mitigation || '—', STATUSES[r.status] || r.status] })) }, { t: 'note', v: 'Skor = kemungkinan × dampak (1–5). Sumber: Daftar risiko.' }]
      : [{ t: 'note', v: 'Belum ada risiko tercatat di Daftar risiko.' }]);
  }
  if (on('valuasi') && data?.valuasi) {
    const v = data.valuasi; const a = v.assumptions || {};
    const blocks = [{ t: 'note', v: `${v.name} · versi ${v.version} · dasar per ${tglx(v.basis?.tanggal)}. ESTIMASI berdasarkan asumsi pemilik, bukan penilaian resmi.` }];
    if (a.multiple) {
      const mv = multipleValuation(v.basis, a.multiple);
      blocks.push(mv.reason ? { t: 'note', v: mv.reason } : { t: 'table', caption: `Kelipatan atas ${BASES[a.multiple.basis].label.toLowerCase()} · sumber: ${a.multiple.source}`,
        head: ['(Rp)', 'Bawah', 'Tengah', 'Atas'], rows: [{ cells: ['Kelipatan', `${mv.low.multiple}×`, `${mv.mid.multiple}×`, `${mv.high.multiple}×`] },
          { cells: ['Nilai usaha', num(mv.low.ev), num(mv.mid.ev), num(mv.high.ev)] }, { cells: ['Nilai ekuitas', num(mv.low.equity), num(mv.mid.equity), num(mv.high.equity)], sub: true }] });
    }
    if (a.aset) { const av = assetValuation(v.basis, a.aset); blocks.push({ t: 'kv', rows: [['Nilai buku ekuitas', rpx(av.book)], ['Nilai aset disesuaikan', rpx(av.adjusted)]] }); }
    add('valuasi', 'Valuasi', blocks);
  }
  if (sec.prospek) add('prospek', 'Prospek & rencana', [{ t: 'text', v: sec.prospek }]);
  if (on('metodologi')) add('metodologi', 'Metodologi & catatan', [
    { t: 'text', v: 'Angka keuangan berasal dari jurnal Pembukuan PRASARA (pencatatan otomatis dari transaksi). Kos dicatat saat uang diterima (basis kas); toko & jasa saat transaksi terjadi. Proyeksi, skenario, dan valuasi adalah ESTIMASI dengan rumus tertulis, bukan janji hasil. Laporan ini bukan laporan keuangan yang diaudit.' },
    ...(sec.catatan ? [{ t: 'text', v: sec.catatan }] : []),
  ]);
  return out;
}
