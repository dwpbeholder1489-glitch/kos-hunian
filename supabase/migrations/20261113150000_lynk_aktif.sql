-- Aktivasi Lynk (aktivasi otomatis lewat pay_event_ingest), setelah format & tanda tangan terbukti dari transaksi nyata:
--   uji 1: Rp 2.000 via QRIS  (ref 060976c054ededaa2f8b928f56db2267, nominal webhook 2000, signature_ok true)
--   uji 2: Rp 49.000 via Mandiri VA (ref e163de3f427f59d773c89bf708f8d01e, nominal webhook 49000, email cocok, signature_ok true)
-- Nominal di notifikasi = harga produk; biaya layanan pembeli TIDAK ikut.
-- Notifikasi tetap hanya mengaktifkan paket bila lolos semua pemeriksaan di pay_event_ingest (tanda tangan, dibayar,
-- ref belum pernah dipakai, nominal = tagihan, email = pemilik, tepat satu tagihan menunggu). Sisanya masuk pay_recon.

update public.pay_providers
set active = true,
    verified_at = now(),
    note = 'Aktif: rumus tanda tangan & nominal terverifikasi dari transaksi nyata (13 Nov 2026). Aktivasi paket hanya bila tagihan cocok; selain itu antrean rekonsiliasi.'
where code = 'lynk';
