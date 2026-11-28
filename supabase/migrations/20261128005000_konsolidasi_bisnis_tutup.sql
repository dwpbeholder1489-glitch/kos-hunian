-- Perbaikan Tahap I (konsolidasi): grup konsolidasi berisi bisnis yang SUDAH DITUTUP tidak bisa diubah/dihapus karena
-- zz_kos_open_guard di consol_members menolak tulis. consol_members adalah PENGATURAN MILIK AKUN (bukan data operasional bisnis),
-- jadi pengaman bisnis-tutup tidak berlaku — sama seperti tabel penagihan platform (pay_*) yang sengaja tanpa guard.
-- Menambah bisnis tutup ke grup tetap ditolak oleh consol_group_save (k.closed_at is null); laporan hanya membaca.
drop trigger if exists zz_kos_open_guard on public.consol_members;
