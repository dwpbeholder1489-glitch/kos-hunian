#!/usr/bin/env bash
# Menjalankan SEMUA migrasi di database PostgreSQL baru (dengan stub Supabase) lalu uji SQL & JS modul Business Intelligence (Tahap A–J).
# Pakai: PSQL="psql -h localhost -p 5432 -U postgres" bash supabase/tests/harness/run_bi.sh [nama_db]
# Butuh: PostgreSQL 15+ (superuser), Node 18+. Lulus = tidak ada baris "GAGAL", tidak ada kolom boolean 'f', tidak ada ERROR tak terduga.
set -u
ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
DB="${1:-prasara_bi_audit}"
PSQL="${PSQL:-psql}"
run() { $PSQL -X -v ON_ERROR_STOP=1 -q "$@"; }
echo "== Database baru: $DB"
$PSQL -X -q -d postgres -c "drop database if exists $DB" -c "create database $DB" || exit 1
run -d "$DB" -f "$ROOT/supabase/tests/harness/mock_supabase.sql" >/dev/null || exit 1
for f in "$ROOT"/supabase/migrations/*.sql; do
  if ! out=$(run -d "$DB" -1 -f "$f" 2>&1); then echo "MIGRASI GAGAL: $(basename "$f")"; echo "$out" | grep -i error | head -5; exit 1; fi
done
echo "== $(ls "$ROOT"/supabase/migrations/*.sql | wc -l) migrasi terpasang"
fail=0
# Uji SQL BI (urutan bebas; tiap uji memakai id sendiri). rekap_bisnis.sql milik sesi lain: 7 ERROR penolakan memang diharapkan.
for t in analisis_intel laporan_keuangan_rasio pinjaman_bunga pph_final_umkm anggaran_target_persetujuan skenario_stress_test perubahan_ekuitas \
         daftar_risiko kpi_industri valuasi_multiple_aset laporan_investor konsolidasi; do
  out=$($PSQL -X -A -d "$DB" -f "$ROOT/supabase/tests/$t.sql" 2>&1)
  bad=$(echo "$out" | grep -E "GAGAL|ERROR:|\|f\||\|f$|^f\||^f$" | grep -v "^NOTICE:  OK" )
  if [ -n "$bad" ]; then echo "✗ $t"; echo "$bad" | head -8; fail=1; else echo "✓ $t"; fi
done
# Isolasi antar bisnis (selalu di-ROLLBACK): K = bisnis uji, U = pengguna luar
iso=$($PSQL -X -A -d "$DB" -v K=cdcdcdcd-0000-0000-0000-00000000000a -v U=adadadad-9999-0000-0000-000000000001 -f "$ROOT/supabase/tests/isolasi.sql" 2>&1 | grep -A1 "status|jumlah" | tail -1)
echo "isolasi: $iso"; case "$iso" in LULUS*) ;; *) fail=1;; esac
# Uji JS (rumus tertulis)
for t in analisis_intel_js laporan_rasio_js skenario_js perubahan_ekuitas_js daftar_risiko_js kpi_industri_js valuasi_js laporan_investor_js konsolidasi_js; do
  r=$(cd "$ROOT" && node "supabase/tests/$t.mjs" 2>/dev/null | tail -1); echo "$t: $r"
  case "$r" in *"0 gagal"*|*"SEMUA LULUS"*) ;; *) fail=1;; esac
done
[ $fail = 0 ] && echo "== SEMUA LULUS" || echo "== ADA YANG GAGAL (lihat di atas)"
exit $fail
