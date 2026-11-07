// Portal penghuni bersifat pribadi: jangan diindeks mesin pencari, dan pratinjau link tidak memuat data penghuni.
export const metadata = {
  title: 'Portal penghuni · PRASARA',
  description: 'Lihat tagihan, kirim bukti transfer, dan tanya asisten kos.',
  robots: { index: false, follow: false },
  openGraph: { title: 'Portal penghuni · PRASARA', description: 'Lihat tagihan, kirim bukti transfer, dan tanya asisten kos.', images: [{ url: '/og.jpg?v=3', width: 1200, height: 630 }] },
};
export default function PortalLayout({ children }) { return children; }
