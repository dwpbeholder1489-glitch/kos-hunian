// Rekap Bisnis — logika murni (tanpa React/jaringan), diuji dengan node (supabase/tests/rekap_js.mjs).
// Semua angka masukan dari RPC biz_recap / recap_get (jurnal + transaksi; sumber sama dengan Pembukuan, Laporan, Analisis Bisnis).
// Rumus kelompok (kas, piutang, utang, pajak, modal, persediaan) HANYA di sini — halaman & ekspor memakai fungsi ini.

const n = (v) => Number(v || 0);
const p2 = (v) => String(v).padStart(2, '0');
const iso = (d) => `${d.getUTCFullYear()}-${p2(d.getUTCMonth() + 1)}-${p2(d.getUTCDate())}`;
const D = (s) => new Date(s + 'T00:00:00Z');
export const addDays = (s, k) => { const d = D(s); d.setUTCDate(d.getUTCDate() + k); return iso(d); };
export const daysBetween = (a, b) => Math.round((D(b) - D(a)) / 86400000);
const addMonths = (s, k) => { const d = D(s); const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + k, 1));
  const last = new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth() + 1, 0)).getUTCDate(); t.setUTCDate(Math.min(d.getUTCDate(), last)); return iso(t); };
const monthLast = (s) => iso(new Date(Date.UTC(+s.slice(0, 4), +s.slice(5, 7), 0)));
export const isDate = (s) => /^\d{4}-\d{2}-\d{2}$/.test(s || '') && iso(D(s)) === s;
const BLN = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
const BLNL = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
const HARI = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
const tgl = (s) => `${+s.slice(8, 10)} ${BLN[+s.slice(5, 7) - 1]} ${s.slice(0, 4)}`;

// ---------- Periode ----------
export const KINDS = [['harian', 'Harian'], ['mingguan', 'Mingguan'], ['bulanan', 'Bulanan'], ['kuartalan', 'Kuartalan'], ['tahunan', 'Tahunan'], ['kustom', 'Kustom']];
export const COMPARE = [['prev', 'Periode sebelumnya'], ['yoy', 'Tahun lalu'], ['none', 'Tanpa pembanding']];
const NOUN = { harian: 'kemarin', mingguan: 'minggu lalu', bulanan: 'bulan lalu', kuartalan: 'kuartal lalu', tahunan: 'tahun lalu', kustom: 'periode sebelumnya' };

// Periode penuh yang memuat tanggal acuan. Batas = tanggal Jakarta (zona waktu bisnis); to dipotong di hari ini (periode berjalan).
export function periodOf(kind, anchor, today, custom = {}) {
  let from, end;
  if (kind === 'kustom') {
    from = isDate(custom.from) ? custom.from : anchor.slice(0, 8) + '01';
    end = isDate(custom.to) ? custom.to : today;
    if (end < from) [from, end] = [end, from];
    if (end > today) end = today;
    if (from > end) from = end;
    if (daysBetween(from, end) > 400) from = addDays(end, -400);
  } else if (kind === 'harian') { from = anchor; end = anchor; }
  else if (kind === 'mingguan') { const dow = (D(anchor).getUTCDay() + 6) % 7; from = addDays(anchor, -dow); end = addDays(from, 6); }
  else if (kind === 'kuartalan') { const m = Math.floor((+anchor.slice(5, 7) - 1) / 3) * 3 + 1; from = `${anchor.slice(0, 4)}-${p2(m)}-01`; end = monthLast(addMonths(from, 2)); }
  else if (kind === 'tahunan') { from = `${anchor.slice(0, 4)}-01-01`; end = `${anchor.slice(0, 4)}-12-31`; }
  else { from = anchor.slice(0, 8) + '01'; end = monthLast(from); }
  const to = end > today ? today : end;
  return { kind, from, to, end, running: end >= today, label: periodLabel(kind, from, end) };
}

export function periodLabel(kind, from, end) {
  if (kind === 'harian') return `${HARI[D(from).getUTCDay()]}, ${tgl(from)}`;
  if (kind === 'bulanan') return `${BLNL[+from.slice(5, 7) - 1]} ${from.slice(0, 4)}`;
  if (kind === 'kuartalan') return `Kuartal ${Math.floor((+from.slice(5, 7) - 1) / 3) + 1} ${from.slice(0, 4)}`;
  if (kind === 'tahunan') return `Tahun ${from.slice(0, 4)}`;
  return rangeLabel(from, end);
}
export function rangeLabel(a, b) {
  if (a === b) return tgl(a);
  if (a.slice(0, 7) === b.slice(0, 7)) return `${+a.slice(8)} – ${tgl(b)}`;
  if (a.slice(0, 4) === b.slice(0, 4)) return `${+a.slice(8)} ${BLN[+a.slice(5, 7) - 1]} – ${tgl(b)}`;
  return `${tgl(a)} – ${tgl(b)}`;
}
// Label pendek untuk sumbu grafik
export function shortLabel(kind, from) {
  if (kind === 'bulanan') return BLN[+from.slice(5, 7) - 1];
  if (kind === 'kuartalan') return `K${Math.floor((+from.slice(5, 7) - 1) / 3) + 1} ${from.slice(2, 4)}`;
  if (kind === 'tahunan') return from.slice(0, 4);
  return `${+from.slice(8)} ${BLN[+from.slice(5, 7) - 1]}`;
}

// Geser periode (‹ ›). Kustom bergeser sepanjang rentangnya. Mengembalikan acuan & rentang baru, atau null bila melewati hari ini.
export function shiftPeriod(per, dir, today) {
  if (per.kind === 'kustom') {
    const len = daysBetween(per.from, per.end) + 1;
    const from = addDays(per.from, dir * len); const end = addDays(per.end, dir * len);
    if (from > today) return null;
    return { anchor: from, custom: { from, to: end > today ? today : end } };
  }
  const step = { harian: [0, 1], mingguan: [0, 7], bulanan: [1, 0], kuartalan: [3, 0], tahunan: [12, 0] }[per.kind];
  const anchor = step[0] ? addMonths(per.from, dir * step[0]) : addDays(per.from, dir * step[1]);
  if (anchor > today) return null;
  return { anchor };
}

// Pembanding: periode sebelumnya yang sepadan. Periode berjalan dibandingkan dengan panjang hari yang sama (1–27 Nov vs 1–27 Okt).
export function compareOf(per, mode) {
  if (mode === 'none') return null;
  const elapsed = daysBetween(per.from, per.to);
  if (mode === 'yoy') {
    const from = addMonths(per.from, -12);
    const priorMonthEnd = per.to === monthLast(per.to) && !per.running && per.kind !== 'harian' && per.kind !== 'mingguan' && per.kind !== 'kustom';
    const to = addMonths(per.to, -12);
    return { from, to: priorMonthEnd ? monthLast(to) : to, label: 'tahun lalu' };
  }
  let from, end;
  if (per.kind === 'kustom') { const len = daysBetween(per.from, per.end) + 1; from = addDays(per.from, -len); end = addDays(per.from, -1); }
  else { const prev = shiftPeriod(per, -1, '9999-12-31'); const p = periodOf(per.kind, prev.anchor, '9999-12-31'); from = p.from; end = p.end; }
  const to = per.running ? (addDays(from, elapsed) < end ? addDays(from, elapsed) : end) : end;
  return { from, to, label: NOUN[per.kind] };
}

// Seri historis: N periode terakhir sejenis (termasuk periode ini), untuk grafik tren antarperiode
export const SERIES_N = { harian: 7, mingguan: 8, bulanan: 6, kuartalan: 4, tahunan: 3 };
export function seriesOf(per, today) {
  const cnt = SERIES_N[per.kind]; if (!cnt) return [];
  const out = []; let cur = per;
  for (let i = 0; i < cnt; i++) {
    out.unshift({ from: cur.from, to: cur.end > today ? today : cur.end, label: shortLabel(per.kind, cur.from), title: cur.label });
    const prev = shiftPeriod(cur, -1, '9999-12-31'); cur = periodOf(per.kind, prev.anchor, '9999-12-31');
  }
  return out;
}

// ---------- Angka turunan ----------
export const pct = (a, b) => (b == null || n(b) === 0 ? null : ((n(a) - n(b)) / Math.abs(n(b))) * 100);
export const share = (a, b) => (n(b) === 0 ? null : (n(a) / n(b)) * 100);
const STOCK_IN = ['beli', 'retur_jual', 'titip', 'awal', 'batal'];
const STOCK_OUT = ['jual', 'pakai', 'retur_beli', 'titip_kembali'];
export const STOCK_ADJ = ['opname', 'rusak', 'kedaluwarsa', 'koreksi'];
export const STOCK_GROUPS = { masuk: STOCK_IN, keluar: STOCK_OUT, penyesuaian: STOCK_ADJ };

// Saldo akhir akun dengan tanda alami: aset/beban = debit − kredit; kewajiban/ekuitas/pendapatan = kredit − debit
const natural = (a) => (['aset', 'beban'].includes(a.type) ? 1 : -1);
const row = (a) => { const s = natural(a); const awal = s * n(a.open); const tambah = s > 0 ? n(a.dr) : n(a.cr); const kurang = s > 0 ? n(a.cr) : n(a.dr);
  return { name: a.name, sys: a.sys, kelas: a.kelas, awal, tambah, kurang, akhir: awal + tambah - kurang }; };
const group = (rows) => rows.reduce((t, r) => ({ awal: t.awal + r.awal, tambah: t.tambah + r.tambah, kurang: t.kurang + r.kurang, akhir: t.akhir + r.akhir }),
  { awal: 0, tambah: 0, kurang: 0, akhir: 0 });

export function derive(c) {
  if (!c) return null;
  const akun = c.akun || []; const kelas = c.kelas || {}; const r = c.ringkas || {};
  const of = (pred) => akun.filter(pred).map(row);
  const kasRows = of((a) => a.kelas === 'kas');
  const kas = { ...group(kasRows), akun: kasRows, masuk: n(c.kas?.masuk), keluar: n(c.kas?.keluar) };
  kas.cocok = Math.abs(kas.awal + kas.masuk - kas.keluar - kas.akhir) < 1;
  const piutangRows = of((a) => a.kelas === 'piutang');
  const utangRows = of((a) => a.kelas === 'utang_usaha');
  const pinjamanRows = of((a) => a.kelas === 'pinjaman');
  // Laba rugi bertingkat (jurnal)
  const pendapatan = n(r.pendapatan); const hpp = n(r.hpp); const biaya = n(r.biaya);
  const profit = {
    pendapatan, usaha: n(kelas.pendapatan_usaha), retur: n(kelas.retur), lain: n(kelas.pendapatan_lain),
    hpp, laba_kotor: pendapatan - hpp, biaya,
    operasional: n(kelas.beban_operasional), penyusutan: n(kelas.penyusutan), bunga: n(kelas.bunga), pajak: n(kelas.pajak), beban_lain: n(kelas.beban_lain),
    laba: n(r.laba), transaksi: n(r.transaksi), pelanggan: n(r.pelanggan),
  };
  profit.margin = share(profit.laba, pendapatan); profit.margin_kotor = share(profit.laba_kotor, pendapatan);
  profit.hpp_pct = share(hpp, pendapatan); profit.biaya_pct = share(biaya, pendapatan);
  profit.rata = profit.transaksi ? pendapatan / profit.transaksi : null;
  // Modal: ekuitas termasuk laba ditahan (akumulasi pendapatan − beban). awal + setoran − prive + laba + lain = akhir
  const eqPl = akun.filter((a) => ['ekuitas', 'pendapatan', 'beban'].includes(a.type));
  const modal = {
    awal: -eqPl.reduce((t, a) => t + n(a.open), 0),
    akhir: -eqPl.reduce((t, a) => t + n(a.open) + n(a.dr) - n(a.cr), 0),
    setoran: akun.filter((a) => a.sys === 'modal').reduce((t, a) => t + n(a.cr) - n(a.dr), 0),
    prive: akun.filter((a) => a.sys === 'prive').reduce((t, a) => t + n(a.dr) - n(a.cr), 0),
    laba: -akun.filter((a) => ['pendapatan', 'beban'].includes(a.type)).reduce((t, a) => t + n(a.dr) - n(a.cr), 0),
  };
  modal.lain = modal.akhir - modal.awal - modal.setoran + modal.prive - modal.laba;
  // Pajak (akun PPN & PPh). Kewajiban akhir = utang PPh + PPN keluaran − PPN masukan
  const sysRow = (k) => of((a) => a.sys === k);
  const ppnK = group(sysRow('ppn_keluaran')); const ppnM = group(sysRow('ppn_masukan')); const pph = group(sysRow('utang_pph'));
  const pajak = { ppn_keluaran: ppnK.tambah - ppnK.kurang, ppn_masukan: ppnM.tambah - ppnM.kurang, pph: profit.pajak, setor: n(c.setor_pajak),
    kewajiban_akhir: pph.akhir + ppnK.akhir - ppnM.akhir };
  pajak.ada = [pajak.ppn_keluaran, pajak.ppn_masukan, pajak.pph, pajak.setor, pajak.kewajiban_akhir].some((v) => Math.abs(v) >= 1);
  // Persediaan (kartu stok)
  const per = c.persediaan;
  let stok = null;
  if (per) {
    const sum = (kinds, key) => (per.jenis || []).filter((j) => kinds.includes(j.kind)).reduce((t, j) => t + n(j[key]), 0);
    stok = { awal: n(per.awal?.nilai), awal_qty: n(per.awal?.qty), akhir: n(per.akhir?.nilai), akhir_qty: n(per.akhir?.qty),
      masuk: sum(STOCK_IN, 'nilai'), masuk_qty: sum(STOCK_IN, 'qty'), keluar: sum(STOCK_OUT, 'nilai'), keluar_qty: sum(STOCK_OUT, 'qty'),
      penyesuaian: sum(STOCK_ADJ, 'nilai'), penyesuaian_qty: sum(STOCK_ADJ, 'qty'),
      buku: group(of((a) => a.kelas === 'persediaan')).akhir };
    stok.cocok = Math.abs(stok.awal + stok.masuk + stok.keluar + stok.penyesuaian - stok.akhir) < 1;
  }
  const asetRows = of((a) => a.kelas === 'aset_tetap');
  const seimbang = Math.abs(akun.reduce((t, a) => t + n(a.open) + n(a.dr) - n(a.cr), 0)) < 1;
  return { profit, kas, piutang: { ...group(piutangRows), akun: piutangRows }, utang: { ...group(utangRows), akun: utangRows },
    pinjaman: { ...group(pinjamanRows), akun: pinjamanRows }, modal, pajak, stok, aset_buku: group(asetRows).akhir, seimbang };
}

// ---------- Status periode ----------
// status = recap_status (server); kini = recap_now (dokumen terbuka & kelengkapan)
export function statusOf(status, kini, archived) {
  if (!status) return null;
  const flags = [];
  if (kini?.tanpa_modal > 0) flags.push(['tanpa_modal', `${kini.tanpa_modal} penjualan tanpa harga modal — HPP & laba belum lengkap`]);
  if (kini?.menunggu_verifikasi > 0) flags.push(['menunggu', `${kini.menunggu_verifikasi} pembayaran hingga akhir periode masih menunggu verifikasi`]);
  if (kini?.pos_offline_cek > 0) flags.push(['offline', `${kini.pos_offline_cek} transaksi kasir offline perlu dicek`]);
  const bulan = status.bulan || [];
  const rekonBelum = bulan.filter((b) => b.rekon === 'belum' || b.rekon === 'draf').length;
  const hariBelum = n(status.hari_jual) - n(status.hari_ditutup);
  let main;
  if (status.berjalan) main = ['berjalan', 'Periode berjalan', 'Angka sementara — bertambah selama periode berjalan.', 'warn'];
  else if (status.ditutup) main = ['ditutup', 'Sudah ditutup', 'Semua bulan di periode ini sudah tutup buku di Pembukuan.', 'good'];
  else if (status.direkonsiliasi) main = ['direkonsiliasi', 'Sudah direkonsiliasi', 'Rekening bank & tutup harian sudah dicocokkan; belum tutup buku.', 'good'];
  else main = ['belum', 'Belum direkonsiliasi', [rekonBelum ? `${rekonBelum} bulan rekonsiliasi bank belum selesai` : null, hariBelum > 0 ? `${hariBelum} hari berjualan belum ditutup` : null].filter(Boolean).join(' · ') || 'Periode selesai, belum tutup buku.', 'warn'];
  const data = flags.length ? ['belum_lengkap', 'Belum lengkap'] : archived && !kini ? ['tidak_tercatat', 'Kelengkapan tidak tercatat'] : ['lengkap', 'Tidak ada masalah kelengkapan terdeteksi'];
  const bank = rekonBelum ? `${rekonBelum} bulan belum selesai` : bulan.some((b) => b.rekon === 'selesai') ? 'Selesai' : 'Tidak diperlukan';
  return { main, flags, data, bank, rekonBelum, hariBelum: Math.max(0, hariBelum) };
}

// ---------- Bagian yang tampil per jenis bisnis ----------
// Hanya bagian yang punya sumber data di bisnis ini (server hanya mengirim bagian yang relevan) — tidak ada indikator kosong/palsu.
export function sectionsFor(c, dv) {
  if (!c) return [];
  const s = [];
  const j = c.jenis; const kuliner = c.operasional?.kuliner;
  if (j === 'retail' && c.penjualan) s.push(['penjualan', 'Rekap penjualan', 'Omzet, kategori, retur, diskon, cara bayar']);
  if (j === 'jasa') s.push(['pesanan', kuliner ? 'Rekap pesanan & menu' : 'Rekap pesanan & layanan', kuliner ? 'Pesanan, menu terjual, meja, bahan' : 'Pesanan selesai, layanan, antar-jemput']);
  if (j === 'properti') s.push(['sewa', 'Rekap sewa & hunian', 'Hunian, tagihan, pembayaran, tunggakan']);
  if (c.pembelian && (n(c.pembelian.n) || n(c.pembelian.retur) || n(c.pembelian.dipesan_n))) s.push(['pembelian', 'Rekap pembelian', 'Belanja per supplier, retur, pesanan']);
  if (dv?.stok) s.push(['persediaan', 'Rekap persediaan', 'Stok awal, masuk, keluar, penyesuaian, akhir']);
  s.push(['laba', 'Laba rugi', 'Pendapatan, HPP, biaya, laba per kelompok']);
  if (c.pengeluaran && n(c.pengeluaran.n)) s.push(['pengeluaran', 'Rekap pengeluaran', 'Biaya per kategori']);
  s.push(['kas', 'Rekap kas & bank', 'Saldo awal, masuk, keluar, saldo akhir']);
  if (dv && (Math.abs(dv.piutang.awal) + dv.piutang.tambah + dv.piutang.kurang + Math.abs(dv.utang.awal) + dv.utang.tambah + dv.utang.kurang + Math.abs(dv.pinjaman.akhir)) >= 1) s.push(['utang', 'Rekap utang & piutang', 'Baru, dibayar, saldo akhir']);
  if (j !== 'properti' && c.pelanggan && (n(c.pelanggan.aktif) || n(c.pelanggan.terdaftar))) s.push(['pelanggan', 'Aktivitas pelanggan', 'Baru, aktif, berulang, tidak aktif']);
  if (c.karyawan) s.push(['karyawan', 'Rekap karyawan', 'Kehadiran, jam kerja, gaji, komisi']);
  if (c.aset || (dv && (Math.abs(dv.aset_buku) >= 1 || dv.profit.penyusutan))) s.push(['aset', 'Rekap aset', 'Penambahan, pelepasan, penyusutan']);
  if (dv?.pajak?.ada) s.push(['pajak', 'Rekap pajak', 'PPN, PPh, setoran, kewajiban']);
  s.push(['modal', 'Perubahan modal', 'Setoran, prive, laba, ekuitas akhir']);
  if (c.proyek) s.push(['proyek', 'Rekap proyek', 'Proyek mulai/selesai, tagihan, uang diterima']);
  s.push(['aktivitas', 'Aktivitas operasional', 'Timeline transaksi & penutupan periode']);
  return s;
}

export function orderedSections(sections, jenis) {
  const order = {
    retail: ['penjualan', 'persediaan', 'laba', 'pembelian'],
    properti: ['sewa', 'kas', 'laba'],
    jasa: ['pesanan', 'laba', 'kas', 'persediaan'],
    kustom: ['proyek', 'laba', 'kas'],
  }[jenis] || [];
  const ids = sections.map(([id]) => id);
  return [...order.filter((id) => ids.includes(id)), ...ids.filter((id) => !order.includes(id))];
}

const RECAP_METRICS = [
  ['pendapatan', 'Total pendapatan'], ['hpp', 'HPP'], ['laba_kotor', 'Laba kotor'],
  ['biaya', 'Total beban selain HPP'], ['laba', 'Laba bersih'], ['transaksi', 'Total transaksi'],
];

export function recapChanges(current, previous) {
  if (!previous) return [];
  return RECAP_METRICS.map(([key, label]) => {
    const value = key === 'laba_kotor' ? n(current.pendapatan) - n(current.hpp) : n(current[key]);
    const before = key === 'laba_kotor' ? n(previous.pendapatan) - n(previous.hpp) : n(previous[key]);
    return { key, label, value, before, change: value - before, percent: pct(value, before) };
  });
}

// ---------- Ekspor (Excel & PDF memakai lembar yang sama) ----------
const N = (v) => Math.round(n(v) * 100) / 100;
export function exportSheets(d, dv, cmpDv, ctx) {
  const c = d.cur; const p = dv.profit; const cp = cmpDv?.profit;
  const out = [{ name: 'Ringkasan', cols: ['Indikator', 'Periode ini', ctx.cmpLabel ? `Pembanding (${ctx.cmpLabel})` : 'Pembanding', 'Selisih', 'Perubahan %'], types: ['t', 'r', 'r', 'r', 'n'],
    rows: [
      ['Periode', ctx.periodLabel, ctx.cmpRange || '', null, null],
      ['Lokasi', ctx.location || 'Semua lokasi', '', null, null],
      ['Status periode', ctx.status || '', '', null, null],
      ['Rekonsiliasi bank', ctx.reconciliation || '', '', null, null],
      ['Tutup buku', ctx.closed || '', '', null, null],
      ['Kelengkapan', ctx.completeness || '', '', null, null],
      ['Versi arsip', ctx.version == null ? 'Data terkini' : `Versi ${ctx.version}`, '', null, null],
      ['Waktu pembuatan (WIB)', ctx.createdAt || '', '', null, null],
      ...(ctx.flags || []).map((flag) => ['Kelengkapan', flag, '', null, null]),
      ...RECAP_METRICS.map(([key, label]) => {
        const value = p[key]; const before = cp?.[key]; const percent = ctx.hppIncomplete && ['hpp', 'laba_kotor', 'laba'].includes(key) ? null : pct(value, before);
        return [label, N(value), before == null ? null : N(before), before == null ? null : N(value - before), percent == null ? null : N(percent)];
      }),
      ['Kas & bank awal', N(dv.kas.awal), null, null, null], ['Kas masuk', N(dv.kas.masuk), null, null, null], ['Kas keluar', N(dv.kas.keluar), null, null, null], ['Kas & bank akhir', N(dv.kas.akhir), null, null, null],
    ] }];
  out.push({ name: 'Laba rugi', cols: ['Kelompok', 'Nilai'], types: ['t', 'r'], rows: [['Pendapatan usaha', N(p.usaha)], ['Retur penjualan', N(p.retur)], ['Pendapatan lain', N(p.lain)],
    ['Total pendapatan', N(p.pendapatan)], ['HPP', N(p.hpp)], ['Laba kotor', N(p.laba_kotor)], ['Beban operasional', N(p.operasional)], ['Penyusutan', N(p.penyusutan)],
    ['Bunga', N(p.bunga)], ['Pajak penghasilan', N(p.pajak)], ['Beban lain', N(p.beban_lain)], ['Laba bersih', N(p.laba)]] });
  if (c.beban_akun?.length) out.push({ name: 'Beban per akun', cols: ['Akun', 'Kelompok', 'Nilai'], types: ['t', 't', 'r'], rows: c.beban_akun.map((b) => [b.akun, b.kelas, N(b.nilai)]) });
  out.push({ name: 'Tren', cols: [d.cur.grain === 'day' ? 'Tanggal' : 'Bulan', 'Pendapatan', 'HPP', 'Biaya', 'Laba', 'Transaksi'], types: ['d', 'r', 'r', 'r', 'r', 'n'],
    rows: (c.tren || []).map((t) => [t.mulai, N(t.pendapatan), N(t.hpp), N(t.biaya), N(n(t.pendapatan) - n(t.hpp) - n(t.biaya)), t.transaksi]) });
  if (d.seri?.length) out.push({ name: 'Antarperiode', cols: ['Dari', 'Sampai', 'Pendapatan', 'HPP', 'Biaya', 'Laba', 'Transaksi'], types: ['d', 'd', 'r', 'r', 'r', 'r', 'n'],
    rows: d.seri.map((s) => [s.from, s.to, N(s.v.pendapatan), N(s.v.hpp), N(s.v.biaya), N(s.v.laba), s.v.transaksi]) });
  out.push({ name: 'Kas & bank', cols: ['Akun', 'Saldo awal', 'Masuk (debit)', 'Keluar (kredit)', 'Saldo akhir'], types: ['t', 'r', 'r', 'r', 'r'],
    rows: [...dv.kas.akun.map((a) => [a.name, N(a.awal), N(a.tambah), N(a.kurang), N(a.akhir)]), ['Total (tanpa pindah kas↔bank)', N(dv.kas.awal), N(dv.kas.masuk), N(dv.kas.keluar), N(dv.kas.akhir)]] });
  if (c.penjualan) {
    const s = c.penjualan;
    out.push({ name: 'Penjualan', cols: ['Indikator', 'Nilai'], types: ['t', 'r'], rows: [['Penjualan kotor (sebelum diskon, tanpa PPN)', N(s.bruto)], ['Diskon', N(s.diskon)], ['Retur', N(s.retur)],
      ['Omzet bersih', N(s.omzet)], ['PPN keluaran', N(s.ppn)], ['Tunai', N(s.bayar?.tunai)], ['Transfer', N(s.bayar?.transfer)], ['Kasbon', N(s.bayar?.kasbon)], ['Nota kredit', N(s.bayar?.nota)],
      ['Jumlah transaksi', s.trx], ['Transaksi batal', s.batal_n], ['Retur (dokumen)', s.retur_n]] });
    out.push({ name: 'Per kategori', cols: ['Kategori', 'Jumlah', 'Omzet', 'Laba kotor'], types: ['t', 'n', 'r', 'r'], rows: (s.kategori || []).map((k) => [k.name, k.qty, N(k.omzet), N(k.laba)]) });
    out.push({ name: 'Produk teratas', cols: ['Produk', 'Jumlah', 'Omzet', 'Laba kotor'], types: ['t', 'n', 'r', 'r'], rows: (s.produk || []).map((k) => [k.name, k.qty, N(k.omzet), N(k.laba)]) });
  }
  if (c.layanan) out.push({ name: 'Layanan', cols: ['Layanan/menu', 'Jumlah', 'Satuan', 'Pesanan', 'Nilai'], types: ['t', 'n', 't', 'n', 'r'], rows: c.layanan.map((l) => [l.name, l.qty, l.unit, l.pesanan, N(l.nilai)]) });
  if (c.operasional) out.push({ name: 'Operasional', cols: ['Indikator', 'Nilai'], types: ['t', 'n'], rows: Object.entries(c.operasional).filter(([, v]) => typeof v === 'number').map(([k, v]) => [k, v]) });
  if (c.sewa) out.push({ name: 'Sewa', cols: ['Indikator', 'Nilai'], types: ['t', 'n'], rows: Object.entries(c.sewa).map(([k, v]) => [k, n(v)]) });
  if (c.pembelian) out.push({ name: 'Pembelian', cols: ['Supplier', 'Transaksi', 'Nilai'], types: ['t', 'n', 'r'],
    rows: [...(c.pembelian.supplier || []).map((x) => [x.name, x.n, N(x.total)]), ['Total', c.pembelian.n, N(c.pembelian.total)], ['Retur ke supplier', c.pembelian.retur_n, N(c.pembelian.retur)]] });
  if (dv.stok) out.push({ name: 'Persediaan', cols: ['Aktivitas', 'Jumlah (satuan dasar)', 'Nilai'], types: ['t', 'n', 'r'],
    rows: [['Stok awal', dv.stok.awal_qty, N(dv.stok.awal)], ['Masuk', dv.stok.masuk_qty, N(dv.stok.masuk)], ['Keluar', dv.stok.keluar_qty, N(dv.stok.keluar)],
      ['Penyesuaian', dv.stok.penyesuaian_qty, N(dv.stok.penyesuaian)], ['Stok akhir', dv.stok.akhir_qty, N(dv.stok.akhir)], ['Saldo akun Persediaan (jurnal)', null, N(dv.stok.buku)]] });
  if (c.pengeluaran?.kategori?.length) out.push({ name: 'Pengeluaran', cols: ['Kategori', 'Jenis', 'Catatan', 'Nilai'], types: ['t', 't', 'n', 'r'], rows: c.pengeluaran.kategori.map((k) => [k.name, k.kind, k.n, N(k.total)]) });
  out.push({ name: 'Utang & piutang', cols: ['Kelompok', 'Saldo awal', 'Bertambah', 'Berkurang', 'Saldo akhir'], types: ['t', 'r', 'r', 'r', 'r'],
    rows: [['Piutang', N(dv.piutang.awal), N(dv.piutang.tambah), N(dv.piutang.kurang), N(dv.piutang.akhir)], ['Utang usaha', N(dv.utang.awal), N(dv.utang.tambah), N(dv.utang.kurang), N(dv.utang.akhir)],
      ['Pinjaman', N(dv.pinjaman.awal), N(dv.pinjaman.tambah), N(dv.pinjaman.kurang), N(dv.pinjaman.akhir)]] });
  if (c.pelanggan) out.push({ name: 'Pelanggan', cols: ['Indikator', 'Jumlah'], types: ['t', 'n'], rows: [['Aktif', c.pelanggan.aktif], ['Baru', c.pelanggan.baru], ['Berulang (≥2 transaksi)', c.pelanggan.berulang],
    ['Setia', c.pelanggan.setia], ['Tidak aktif (180 hari)', c.pelanggan.tidak_aktif], ['Terdaftar', c.pelanggan.terdaftar], ['Terdaftar baru', c.pelanggan.terdaftar_baru]] });
  if (c.karyawan) { const k = c.karyawan; out.push({ name: 'Karyawan', cols: ['Indikator', 'Nilai'], types: ['t', 'n'], rows: [['Karyawan aktif', k.aktif], ...Object.entries(k.kehadiran || {}).map(([s, v]) => [`Absensi: ${s}`, v]),
    ['Jam kerja', k.jam], ['Jam lembur', k.lembur], ['Gaji dibayar (Rp)', N(k.gaji)], ['Kasbon karyawan (Rp)', N(k.kasbon)], ['Komisi (Rp)', N(k.komisi)]] }); }
  if (c.aset || dv.aset_buku) out.push({ name: 'Aset', cols: ['Indikator', 'Nilai'], types: ['t', 'n'], rows: [['Aset baru (jumlah)', c.aset?.baru_n || 0], ['Aset baru (Rp)', N(c.aset?.baru)],
    ['Aset dilepas (jumlah)', c.aset?.lepas_n || 0], ['Hasil pelepasan (Rp)', N(c.aset?.lepas)], ['Penyusutan (Rp)', N(p.penyusutan)], ['Nilai buku akhir (Rp)', N(dv.aset_buku)]] });
  out.push({ name: 'Pajak & modal', cols: ['Indikator', 'Nilai'], types: ['t', 'r'], rows: [['PPN keluaran', N(dv.pajak.ppn_keluaran)], ['PPN masukan', N(dv.pajak.ppn_masukan)], ['PPh final tercatat', N(dv.pajak.pph)],
    ['Setoran pajak', N(dv.pajak.setor)], ['Kewajiban pajak akhir', N(dv.pajak.kewajiban_akhir)], ['Modal awal', N(dv.modal.awal)], ['Setoran modal', N(dv.modal.setoran)], ['Prive', N(dv.modal.prive)],
    ['Laba periode', N(dv.modal.laba)], ['Mutasi ekuitas lain', N(dv.modal.lain)], ['Modal akhir', N(dv.modal.akhir)]] });
  if (c.proyek) out.push({ name: 'Proyek', cols: ['Indikator', 'Nilai'], types: ['t', 'n'], rows: [['Proyek mulai', c.proyek.mulai], ['Proyek selesai', c.proyek.selesai], ['Ditagih (Rp)', N(c.proyek.ditagih)], ['Diterima (Rp)', N(c.proyek.diterima)]] });
  if (c.aktivitas?.jenis?.length) out.push({ name: 'Aktivitas', cols: ['Jenis aktivitas', 'Jumlah'], types: ['t', 'n'], rows: c.aktivitas.jenis.map((a) => [a.label || a.type, a.n]) });
  return out;
}
