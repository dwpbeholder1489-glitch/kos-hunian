import { SITE_URL } from '@/lib/plan';
// Teks pesan WhatsApp yang bisa diubah pemilik kos di Pengaturan › Teks pesan WhatsApp.
// Kata dalam kurung kurawal, mis. {nama}, diganti otomatis saat pesan dibuat.

export const TPL = {
  reminder: {
    title: 'Pengingat tagihan',
    where: 'Tombol "Kirim pengingat via WhatsApp" di detail penghuni, dan tombol "Kirim WA" di email daftar tagih.',
    def: 'Halo {nama}, ini pengingat dari {kos}. Tagihan yang belum dibayar:\n{rincian}\nTotal {total}.\n\n{cara_bayar}\n\nTerima kasih 🙏',
    vars: [
      ['nama', 'Nama penghuni'],
      ['kos', 'Nama kos'],
      ['kamar', 'Kode kamar'],
      ['rincian', 'Daftar tagihan yang belum dibayar'],
      ['total', 'Total belum dibayar'],
      ['cara_bayar', 'Cara bayar dari Info untuk penghuni'],
    ],
    sample: { nama: 'Budi Santoso', kos: 'Kos Melati', kamar: 'A02', rincian: '• Sewa 4 Nov – 3 Des: Rp 750.000', total: 'Rp 750.000', cara_bayar: 'Cara bayar:\nTransfer BRI 1234-5678 a.n. Pemilik Kos' },
  },
  portal: {
    title: 'Link portal penghuni',
    where: 'Tombol "Kirim link via WhatsApp" di detail penghuni (paket Pro).',
    def: 'Halo {nama}, ini link portal penghuni {kos}. Di sini Anda bisa melihat tagihan, mengirim bukti transfer, dan bertanya ke asisten kos kapan saja:\n{link}\n\nMohon link ini tidak dibagikan ke orang lain.',
    vars: [
      ['nama', 'Nama penghuni'],
      ['kos', 'Nama kos'],
      ['kamar', 'Kode kamar'],
      ['link', 'Link pribadi penghuni (wajib)'],
    ],
    sample: { nama: 'Budi Santoso', kos: 'Kos Melati', kamar: 'A02', link: `${SITE_URL}/p/contoh` },
  },
};

export const MAX_TPL = 2000;

// Isi template. Kata yang tidak dikenal dibiarkan apa adanya; baris kosong berlebih dirapikan.
export function fill(tpl, vals) {
  const out = String(tpl).replace(/\{([a-z_]+)\}/gi, (m, k) => {
    const v = vals[k.toLowerCase()];
    return v === undefined ? m : String(v ?? '');
  });
  return out.replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
}

// Pesan akhir: pakai teks milik kos bila ada, kalau tidak teks bawaan.
// Link portal selalu ikut walau {link} terhapus dari template.
export function message(kind, custom, vals) {
  const tpl = (custom && custom.trim()) || TPL[kind].def;
  let msg = fill(tpl, vals);
  if (kind === 'portal' && vals.link && !msg.includes(vals.link)) msg += '\n\n' + vals.link;
  return msg;
}

export const caraBayar = (info) => (info && info.trim() ? 'Cara bayar:\n' + info.trim() : '');
