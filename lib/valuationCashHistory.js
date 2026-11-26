export function valuationCashHistory(report) {
  if (!report?.lengkap || report.cocok !== true || !Array.isArray(report.kelompok)) return null;
  const operations = report.kelompok.find((group) => group.kelompok === 'operasi');
  const investments = report.kelompok.find((group) => group.kelompok === 'investasi');
  if ((operations && operations.bersih == null) || (investments && investments.keluar == null)) return null;
  const operationCash = operations ? Number(operations.bersih) : 0;
  const assetSpend = investments ? Number(investments.keluar) : 0;
  if (!Number.isFinite(operationCash) || !Number.isFinite(assetSpend) || assetSpend < 0) return null;
  return { operationCash, assetSpend, reference: Math.round(operationCash - assetSpend) };
}
