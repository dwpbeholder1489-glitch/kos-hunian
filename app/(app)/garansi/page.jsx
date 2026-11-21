'use client';
// Garansi & nomor seri (Tahap 3 Retail). Server: serial_lookup (cek garansi), claim_create/claim_status/claims_list (klaim).
// Nomor seri dicatat per barang di Barang & stok › Ubah › Nomor seri & garansi, dan diisi saat dijual di Kasir.
import Link from 'next/link';
import { useKos } from '@/components/KosProvider';
import PageHelp from '@/components/PageHelp';
import { PageHeader } from '@/components/Page';
import { WarrantyDesk } from '@/components/KatalogLanjut';

export default function Garansi() {
  const { kosId, ver } = useKos();
  return (
    <div className="stack">
      <PageHeader title="Garansi & nomor seri" help={<PageHelp page="garansi" />} desc="Cek garansi dari nomor seri/IMEI dan catat klaim pelanggan sampai selesai."
        actions={<Link href="/barang"><button className="sm">Barang & stok</button></Link>} />
      <WarrantyDesk kosId={kosId} ver={ver} />
    </div>
  );
}
