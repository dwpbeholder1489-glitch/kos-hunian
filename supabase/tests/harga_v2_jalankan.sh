#!/bin/bash
# Menjalankan supabase/tests/harga_v2_pembayaran.sql dengan benar (dua tahap):
#   1) database berisi migrasi SEBELUM Harga V2 (< 20261113100000) + data lama (BAGIAN 1),
#   2) migrasi sisanya dipasang, lalu BAGIAN 2 diuji.
# Pemakaian: bash supabase/tests/harga_v2_jalankan.sh [nama_db]   (PostgreSQL uji lokal di /var/tmp/pgtest, port 5499)
# Hasil lulus (Nov 2026): tepat 15 baris ERROR, semuanya penolakan yang DIHARAPKAN — isian tidak valid (2), paket Standar
# tidak dijual, tagihan kedua saat masih menunggu, 4 fungsi internal tertutup + RLS pay_transactions, invoice orang lain,
# persetujuan dobel, alasan terlalu pendek, tanda tangan tidak sah, nominal beda, harga normal < harga berlaku.
# Tidak boleh ada "syntax error" (tanda variabel uji kosong karena langkah sebelumnya gagal).
set -u
D=${1:-hv2}
REPO=$(cd "$(dirname "$0")/../.." && pwd)
P="psql -p 5499 -h /var/tmp/pgtest"
T=/var/tmp/pgtest/hv2_tmp.sql
run() { cp "$1" "$T"; chmod 644 "$T"; su postgres -c "$P -d $D -q -1 -v ON_ERROR_STOP=1 -f $T" 2>&1 | grep -i "error"; }

su postgres -c "$P -d postgres -qc 'drop database if exists $D' -c 'create database $D'"
su postgres -c "$P -d $D -q -f /var/tmp/pgtest/mock2.sql -f /var/tmp/pgtest/mock3.sql" >/dev/null 2>&1
for f in "$REPO"/supabase/migrations/*.sql; do
  [[ "$(basename "$f")" > "20261113100000" ]] && break
  out=$(run "$f"); [ -n "$out" ] && { echo "FAIL $f: $out"; exit 1; }
done
# BAGIAN 1: data lama
sed -n '1,/===== BAGIAN 2/p' "$REPO/supabase/tests/harga_v2_pembayaran.sql" > /var/tmp/pgtest/hv2_1.sql
su postgres -c "$P -d $D -q -f /var/tmp/pgtest/hv2_1.sql" 2>&1 | grep -E "ERROR" && { echo "BAGIAN 1 gagal"; exit 1; }
# Migrasi Harga V2 dan sesudahnya
for f in "$REPO"/supabase/migrations/*.sql; do
  [[ "$(basename "$f")" < "20261113100000" ]] && continue
  out=$(run "$f"); [ -n "$out" ] && { echo "FAIL $f: $out"; exit 1; }
done
# BAGIAN 2
sed -n '/===== BAGIAN 2/,$p' "$REPO/supabase/tests/harga_v2_pembayaran.sql" > /var/tmp/pgtest/hv2_2.sql
su postgres -c "$P -d $D -f /var/tmp/pgtest/hv2_2.sql" 2>&1
