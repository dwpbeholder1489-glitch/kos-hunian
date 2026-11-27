// Custom status definitions can vary by business, even when the label is shared.
export const comparableBasis = (basis) => ['kas', 'penjualan', 'pesanan selesai'].includes(basis);
export const portfolioBasisKey = (basis, id) => comparableBasis(basis) ? 'basis:' + basis : 'business:' + id;
