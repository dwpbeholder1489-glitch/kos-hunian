// Tampilan dokumen kontrak sewa (dipakai halaman cetak pengelola /dokumen/kontrak/[id] dan halaman penyewa /k/[token]).
// Isi = teks yang dibekukan saat dikirim (body + kode isi sha256). Cetak A4 lewat Cetak/Simpan PDF browser.
import styles from './KontrakDoc.module.css';

const waktu = (ts) => (ts ? new Date(ts).toLocaleString('id-ID', { timeZone: 'Asia/Jakarta', dateStyle: 'long', timeStyle: 'short' }) + ' WIB' : null);

export default function KontrakDoc({ c, business }) {
  return <article className={styles.doc}>
    <header><b>{business}</b><span>{c.number}</span></header>
    <h1>{c.title}</h1>
    <div className={styles.body}>{c.body}</div>
    <section className={styles.sign}>
      <div><span>PIHAK PERTAMA</span>{c.owner_signed_at ? <><b>{c.owner_name}</b><small>Disetujui elektronik {waktu(c.owner_signed_at)}</small></> : <small>Belum ditandatangani</small>}</div>
      <div><span>PIHAK KEDUA</span>{c.tenant_approved_at ? <><b>{c.tenant_name}</b><small>Disetujui elektronik {waktu(c.tenant_approved_at)}</small></>
        : c.status === 'ditolak' ? <small>Ditolak: {c.tenant_note}</small> : <small>Belum disetujui</small>}</div>
    </section>
    {c.body_hash && <footer>Kode isi dokumen (SHA-256): <code>{c.body_hash}</code>. Persetujuan dicatat oleh PRASARA sebagai bukti internal (bukan tanda tangan elektronik tersertifikasi).</footer>}
  </article>;
}
