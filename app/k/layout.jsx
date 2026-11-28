// Link pribadi kontrak sewa untuk penyewa: jangan diindeks, pratinjau link tidak memuat isi kontrak.
export const metadata = {
  title: 'Kontrak sewa · PRASARA',
  description: 'Baca dan setujui perjanjian sewa Anda.',
  robots: { index: false, follow: false },
};
export default function KontrakLayout({ children }) { return children; }
