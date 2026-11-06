'use client';
import { useKos } from '@/components/KosProvider';
import { BUSINESS_TYPES } from '@/lib/business';

// Retail & Grosir: modul sedang dibangun (Langkah 2). Halaman ini jujur soal statusnya.
export default function Toko() {
  const { kos } = useKos();
  const t = BUSINESS_TYPES.retail;
  return (
    <div className="stack">
      <h2>{kos.name}</h2>
      <div className="empty">
        <span style={{ fontSize: 40 }} aria-hidden="true">{t.icon}</span>
        <h3>Modul {t.name} sedang dibangun</h3>
        <p className="muted" style={{ margin: 0 }}>Yang akan tersedia: kasir (eceran & grosir), barang dengan banyak satuan (dus/pak/pcs), stok, belanja ke supplier, kas & bank, kasbon pelanggan, utang supplier, dan laporan laba.</p>
        <p className="small muted" style={{ margin: 0 }}>Bisnis ini sudah tersimpan. Menu baru akan muncul di sini begitu siap diuji.</p>
      </div>
    </div>
  );
}
