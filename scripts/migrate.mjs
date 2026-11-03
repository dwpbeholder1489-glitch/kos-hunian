// Memasang skema database otomatis saat Vercel membangun aplikasi.
// Butuh env DATABASE_URL (connection string Supabase, "Session pooler").
// Aman dijalankan berulang: kalau tabel sudah ada, dilewati.
import { readFileSync } from 'node:fs';
import pg from 'pg';

const url = process.env.DATABASE_URL;
if (!url) {
  console.log('[migrate] DATABASE_URL tidak diisi — lewati pemasangan skema.');
  process.exit(0);
}

const client = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
try {
  await client.connect();
  const { rows } = await client.query("select to_regclass('public.kos') as t");
  if (rows[0].t) {
    console.log('[migrate] Skema sudah terpasang — tidak ada yang diubah.');
  } else {
    const sql = readFileSync(new URL('../supabase/schema.sql', import.meta.url), 'utf8');
    await client.query('begin');
    await client.query(sql);
    await client.query('commit');
    console.log('[migrate] Skema database berhasil dipasang.');
  }
} catch (e) {
  try { await client.query('rollback'); } catch {}
  console.error('[migrate] GAGAL memasang skema:', e.message);
  if (/password authentication failed/i.test(e.message)) console.error('[migrate] Password di DATABASE_URL salah.');
  if (/ENOTFOUND|ENETUNREACH|EHOSTUNREACH/i.test(e.message)) console.error('[migrate] Pakai connection string "Session pooler", bukan "Direct connection".');
  process.exit(1);
} finally {
  await client.end().catch(() => {});
}
