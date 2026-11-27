import { portfolioBasisKey } from './portfolioBasis.js';

const amount = (value) => value != null && value !== '' && Number.isFinite(Number(value)) ? Number(value) : null;
const subtotal = (rows, field) => rows.every((row) => amount(row[field]) != null)
  ? rows.reduce((total, row) => total + amount(row[field]), 0)
  : null;

export function portfolioReport({ selected, previous, from, to, sourceAt, priorLabel, basisLabels, typeLabel, exportedAt = new Date() }) {
  const rows = selected.filter((business) => business.access && amount(business.revenue) != null);
  const history = new Map((previous || []).filter((business) => business.access).map((business) => [business.id, business]));
  const groups = new Map();
  for (const row of rows) {
    const basis = row.basis || '';
    const key = portfolioBasisKey(basis, row.id);
    if (!groups.has(key)) groups.set(key, { basis, items: [] });
    groups.get(key).items.push(row);
  }
  const basisName = (basis) => basisLabels[basis] || basis || 'Basis belum tercatat';
  const timestamp = exportedAt.toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' });
  const summaries = [...groups.values()].map(({ basis, items }) => [
    basisName(basis) + (basis === 'status catatan' ? ' · ' + items[0].name : ''), items.length, basis ? subtotal(items, 'revenue') : null,
    basis ? subtotal(items, 'profit') : null, items.every((item) => item.complete) ? 'Lengkap' : 'Perkiraan',
  ]);
  const currentRows = rows.map((row) => [
    row.name, basisName(row.basis), row.complete ? 'Lengkap' : 'Perkiraan',
    amount(row.revenue), amount(row.cogs), amount(row.ops), amount(row.profit),
  ]);
  const comparison = rows.map((row) => {
    const prior = history.get(row.id);
    const compatible = Boolean(row.basis && prior?.basis === row.basis);
    return [row.name, amount(row.revenue), compatible ? amount(prior?.revenue) : null,
      amount(row.profit), compatible ? amount(prior?.profit) : null];
  });
  return {
    title: 'PRASARA | Laporan Portofolio Bisnis',
    business: 'Portofolio Bisnis',
    subtitle: from + ' sampai ' + to + ' · ' + rows.length + ' bisnis · Ringkasan operasional',
    exported_at: timestamp,
    note: 'Angka dikelompokkan menurut basis pencatatan. Transaksi antar bisnis tidak dieliminasi.',
    sheets: [
      { name: 'Ringkasan per Basis', cols: ['Basis', 'Bisnis', 'Pendapatan (IDR)', 'Laba operasional (IDR)', 'Kualitas'], types: ['t','n','n','n','t'], rows: summaries },
      { name: 'Kinerja per Bisnis', cols: ['Bisnis','Basis','Kualitas','Pendapatan (IDR)','HPP (IDR)','Biaya (IDR)','Laba operasional (IDR)'], types: ['t','t','t','n','n','n','n'], rows: currentRows },
      { name: 'Perbandingan Bulanan', cols: ['Bisnis','Pendapatan saat ini (IDR)', 'Pendapatan ' + priorLabel + ' (IDR)', 'Laba saat ini (IDR)', 'Laba ' + priorLabel + ' (IDR)'], types: ['t','n','n','n','n'], rows: comparison },
      { name: 'Posisi Kas dan Piutang', cols: ['Bisnis','Jenis','Badan usaha','Kas (IDR)','Bank (IDR)','Belum diterima (IDR)'], types: ['t','t','t','n','n','n'], rows: rows.map((row) => [row.name,typeLabel(row),row.legal_entity?.name || 'Belum diatur',amount(row.cash),amount(row.bank),amount(row.receivables)]) },
      { name: 'Catatan', cols: ['Keterangan','Nilai'], types: ['t','t'], rows: [
        ['Periode', from + ' sampai ' + to], ['Dibuat (WIB)', timestamp], ['Sumber', 'Ringkasan operasional per bisnis dari Ringkasan Pemilik'],
        ['Data diambil (WIB)', sourceAt ? new Date(sourceAt).toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' }) : ''],
        ['Basis', 'Subtotal tersedia per basis yang diketahui; total lintas basis tidak disajikan.'],
        ['Perbandingan', 'Bulan pembanding ditampilkan jika data tersedia dengan basis yang sama.'],
        ['Kas, bank dan piutang', 'Saldo saat data diambil, bukan saldo historis akhir periode.'],
        ['Cakupan', 'Agregasi portofolio tanpa eliminasi transaksi antar bisnis.'],
      ] },
    ],
  };
}
