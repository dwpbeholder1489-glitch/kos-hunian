import { riskFactors } from './bizIntel.js';

const number = (value) => value == null || value === '' ? NaN : Number(value);
const nonnegative = (value) => Number.isFinite(number(value)) && number(value) >= 0;
const MAX_RUPIAH = 1e12;

export const INVESTMENT_GOALS = [
  ['growth', 'Tambah penjualan'],
  ['capacity', 'Tambah kapasitas'],
  ['savings', 'Hemat biaya'],
];

export function plannerGuide(category, goal) {
  const operation = { retail: 'barang', jasa: 'pesanan jasa', properti: 'unit sewa' }[category] || 'produk atau layanan';
  const capital = category === 'retail' ? 'Jumlahkan harga alat, pemasangan, dan stok awal dari penawaran pemasok.'
    : category === 'properti' ? 'Jumlahkan biaya renovasi, perlengkapan, dan biaya awal unit sewa.'
      : 'Jumlahkan biaya alat, pemasangan, dan kebutuhan awal lainnya.';
  const cash = goal === 'savings' ? 'Masukkan pembayaran lama yang dapat dihindari sebagai penghematan, lalu masukkan biaya baru untuk menjalankan proyek.'
    : 'Perkirakan jumlah ' + operation + ' yang akan terjual dan dibayar setiap bulan. ' +
      (goal === 'capacity' ? 'Batasi target sesuai kapasitas tambahan dan permintaan yang sudah dikonfirmasi.' : 'Gunakan transaksi pembanding atau hasil uji pasar.');
  return { operation, capital, cash };
}

// Historical figures are business-wide. Only apply cash totals after the owner
// supplies the comparable share of activity for the project.
export function investmentEvidence({ intel, cash = [], expectedMonths, stock }, { share, goal, asset, setup, openingStock, life, category }) {
  const suggestions = {};
  const add = (key, value, source, reason) => {
    if (Number.isFinite(value) && value >= 0 && value <= MAX_RUPIAH) {
      suggestions[key] = { value: String(value), source, reason };
    }
  };
  const capitalParts = category === 'retail' ? [asset, setup, openingStock] : [asset, setup];
  if (capitalParts.every(nonnegative)) {
    add('capital', Math.round(capitalParts.reduce((sum, value) => sum + number(value), 0)), 'Rincian proyek dari pemilik',
      category === 'retail' ? 'Harga aset + pemasangan + stok awal.' : 'Harga aset + pemasangan.');
  }
  if (Number.isInteger(number(life)) && number(life) <= 60 && number(life) >= 1) {
    add('months', number(life), 'Rincian proyek dari pemilik', 'Masa penggunaan yang Anda masukkan.');
  }

  const trend = (intel?.tren || []).filter((row) => expectedMonths.includes(row.mulai?.slice(0, 7)) && number(row.transaksi) > 0);
  const matched = expectedMonths.map((month) => cash.find((row) => row.month === month)?.report);
  const ops = matched.map((report) => report?.lengkap && report.cocok ? report.kelompok?.find((row) => row.kelompok === 'operasi') : null);
  const coverage = ops.filter((row) => nonnegative(row?.masuk) && nonnegative(row?.keluar)).length;
  const sufficient = expectedMonths.length === 3 && coverage === 3;
  const scale = number(share) / 100;
  const period = expectedMonths.join(', ');
  const source = 'Laporan Arus Kas · operasi · ' + period;
  const average = (key) => ops.reduce((sum, row) => sum + number(row[key]), 0) / ops.length;
  if (sufficient && goal !== 'savings') {
    const incoming = average('masuk');
    if (incoming > 0 && scale > 0 && scale <= 1) {
      const reason = 'Rata-rata kas operasi bulanan × porsi proyek ' + share + '%.';
      add('revenue', Math.round(incoming * scale), source, reason);
      add('cost', Math.round(average('keluar') * scale), source, reason);
    }
    if (incoming > 0) {
      const swing = Math.max(...ops.map((row) => Math.abs(number(row.masuk) / incoming - 1)));
      add('change', Math.round(Math.min(1, swing) * 1000) / 10, source,
        'Simpangan terbesar penerimaan bulanan dari rata-ratanya, dibatasi 100%.');
    }
  }
  const sum = (key) => trend.reduce((total, row) => total + number(row[key]), 0);
  const revenue = sum('pendapatan');
  const cogs = sum('hpp');
  const gross = revenue > 0 && cogs > 0 && trend.every((row) => number(row.hpp) > 0) ? (revenue - cogs) / revenue * 100 : null;
  const expense = trend.length && trend.every((row) => nonnegative(row.biaya)) ? sum('biaya') / trend.length : null;
  const inventory = trend.length && category === 'retail' && nonnegative(intel?.posisi?.persediaan) ? number(intel.posisi.persediaan) : null;
  const risks = intel && trend.length ? riskFactors(intel, { stock }).map((risk) => risk.text) : [];
  if (sufficient) {
    const negative = ops.filter((row) => number(row.masuk) < number(row.keluar)).length;
    if (negative) risks.push(negative + ' dari 3 bulan memiliki arus kas operasi negatif (Laporan Arus Kas).');
  }
  return { suggestions, coverage, sufficient, trendCount: trend.length, gross, expense, inventory, risks };
}

export function investmentDecision(scenarios) {
  const [downside, base] = scenarios;
  if (base.npv <= 0 || base.payback == null) return ['Belum layak', 'NPV dasar harus positif dan modal perlu kembali dalam durasi proyek.'];
  if (downside.npv <= 0 || downside.payback == null) return ['Layak bersyarat', 'Skenario dasar memenuhi target. Skenario lesu perlu ditinjau sebelum berinvestasi.'];
  return ['Layak berdasarkan asumsi', 'NPV dasar dan lesu positif serta modal kembali dalam durasi proyek.'];
}
