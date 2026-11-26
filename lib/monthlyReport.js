export function income(report) {
  // Match Pembukuan: group account codes before excluding insignificant balances.
  const accounts = new Map();
  for (const account of report.accounts) {
    const previous = accounts.get(account.code);
    accounts.set(account.code, { type: previous?.type ?? account.type, amount: (previous?.amount ?? 0) + Number(account.period) });
  }
  let revenue = 0;
  let expense = 0;
  for (const { type, amount } of accounts.values()) {
    if (Math.abs(amount) < 0.005) continue;
    if (type === 'pendapatan') revenue -= amount;
    if (type === 'beban') expense += amount;
  }
  return { revenue, profit: revenue - expense, margin: revenue > 0 ? (revenue - expense) / revenue * 100 : null };
}

export function monthlyReportExport(version, exportedAt = new Date()) {
  if (version?.status !== 'approved' || !version.snapshot?.report || !version.snapshot?.cash) {
    throw new Error('Ekspor tersedia setelah laporan disetujui.');
  }
  const { report, cash, previous } = version.snapshot;
  const business = report.businesses?.[0]?.name || 'Bisnis';
  const timestamp = (date) => date ? new Date(date).toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' }) : '';
  const period = version.month.slice(0, 7);
  const title = 'PRASARA | Laporan Bulanan';
  const subtitle = business + ' · ' + period + ' · Versi ' + version.version + ' · Disetujui';
  const current = income(report);
  const accounts = report.accounts;
  const amount = (row, field) => Number(row[field] || 0);
  const accountRows = (types, field, reverse) => accounts.filter((row) => types.includes(row.type) && Math.abs(amount(row, field)) >= 0.005)
    .map((row) => [row.code, row.name, row.type, (reverse.includes(row.type) ? -1 : 1) * amount(row, field)]);
  const resultRows = accountRows(['pendapatan', 'beban'], 'period', ['pendapatan']);
  const positionRows = accountRows(['aset', 'kewajiban', 'ekuitas'], 'balance', ['kewajiban', 'ekuitas']);
  const retained = -accounts.filter((row) => ['pendapatan','beban'].includes(row.type)).reduce((sum, row) => sum + amount(row, 'balance'), 0);
  const total = (rows, type) => rows.reduce((sum, row) => sum + (row[2] === type ? row[3] : 0), 0);
  const comparison = previous ? income(previous) : null;

  return {
    title, subtitle, business, exported_at: timestamp(exportedAt),
    note: 'Gunakan versi Excel untuk mengolah angka dari snapshot yang sama.',
    sheets: [
      { name: 'Informasi Laporan', cols: ['Keterangan', 'Nilai'], types: ['t', 't'], rows: [
        ['Bisnis', business], ['Periode', report.from + ' - ' + report.to], ['Versi', version.version],
        ['Status', 'Disetujui'], ['Mata uang', 'IDR'], ['Basis', report.businesses?.[0]?.basis || 'Tidak tercatat'],
        ['Snapshot dibuat (WIB)', timestamp(version.created_at)], ['Disetujui (WIB)', timestamp(version.approved_at)],
        ['Referensi laporan', version.id],
      ] },
      { name: 'Ringkasan dan Tren', cols: ['Metrik', 'Periode ini', 'Periode pembanding', 'Satuan'], types: ['t', 'n', 'n', 't'], rows: [
        ['Pendapatan bersih', current.revenue, comparison?.revenue, 'IDR'],
        ['Laba / rugi bersih', current.profit, comparison?.profit, 'IDR'],
        ['Margin laba', current.margin, comparison?.margin, '%'],
        ['Saldo akhir kas dan bank', Number(cash.saldo_akhir), null, 'IDR'],
      ] },
      { name: 'Laba Rugi', cols: ['Kode', 'Akun', 'Kategori', 'Nilai (IDR)'], types: ['t', 't', 't', 'n'], rows: [
        ...resultRows, ['', 'Pendapatan bersih', '', current.revenue],
        ['', 'HPP dan beban', '', total(resultRows, 'beban')], ['', 'Laba / rugi bersih', '', current.profit],
      ] },
      { name: 'Neraca', cols: ['Kode', 'Akun', 'Kategori', 'Saldo (IDR)'], types: ['t', 't', 't', 'n'], rows: [
        ...positionRows, ['', 'Laba ditahan & laba berjalan', '', retained], ['', 'Total aset', '', total(positionRows, 'aset')],
        ['', 'Total kewajiban + ekuitas', '', total(positionRows, 'kewajiban') + total(positionRows, 'ekuitas') + retained],
      ] },
      { name: 'Arus Kas', cols: ['Uraian', 'Nilai (IDR)'], types: ['t', 'n'], rows: [
        ['Saldo awal', Number(cash.saldo_awal)], ['Uang masuk', Number(cash.masuk)], ['Uang keluar', Number(cash.keluar)],
        ...(cash.lengkap ? (cash.kelompok || []).map((row) => ['Arus bersih · ' + row.kelompok, Number(row.bersih)]) : []),
        ['Saldo akhir', Number(cash.saldo_akhir)],
      ] },
    ],
  };
}
