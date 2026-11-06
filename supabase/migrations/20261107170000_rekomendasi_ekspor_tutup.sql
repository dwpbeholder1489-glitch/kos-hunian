-- (1) Recommendation Engine (blueprint 20.3, 23.1 Langkah 7): rekomendasi berbasis bukti dari data bisnis sendiri,
--     dengan alasan + angka + periode, dampak, risiko, dan tindakan; pemilik menerima atau mengabaikan (tercatat).
-- (2) Ekspor seluruh data bisnis (blueprint 10.1) dan (3) penutupan bisnis terkontrol (21.5): cek transaksi terbuka,
--     wajib ekspor, data tidak dihapus, bisnis menjadi arsip hanya-baca, bisa dibuka kembali.

create or replace function public._prasara_patch(p_sig text, p_old text, p_new text)
returns void language plpgsql as $$
declare d text;
begin
  d := pg_get_functiondef(p_sig::regprocedure);
  if position(p_old in d) = 0 then raise exception 'patch % : potongan tidak ditemukan: %', p_sig, left(p_old, 80); end if;
  execute replace(d, p_old, p_new);
end $$;

-- ================= (1) REKOMENDASI =================
create table if not exists public.recommendation_state (
  kos_id uuid not null references public.kos(id) on delete cascade,
  code text not null,
  status text not null check (status in ('diterima', 'diabaikan')),
  until date not null,
  reason text,
  decided_by text,
  decided_at timestamptz not null default now(),
  primary key (kos_id, code)
);
alter table public.recommendation_state enable row level security;
drop policy if exists recommendation_state_select on public.recommendation_state;
create policy recommendation_state_select on public.recommendation_state for select using (public.member_can(kos_id, 'settings'));
grant select on public.recommendation_state to authenticated;

create or replace function public.rec_item(p_code text, p_kind text, p_title text, p_why text, p_benefit text, p_impact text, p_risk text, p_action jsonb, p_evidence jsonb)
returns jsonb language sql immutable as $$
  select jsonb_build_object('code', p_code, 'kind', p_kind, 'title', p_title, 'why', p_why, 'benefit', p_benefit, 'impact', p_impact, 'risk', p_risk, 'action', p_action, 'evidence', p_evidence);
$$;

create or replace function public.rec_rule_on(p_kos uuid, p_recipe text)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from automation_rules where kos_id = p_kos and recipe = p_recipe and enabled);
$$;

create or replace function public.recommendations(p_kos uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare k kos; t date := (now() at time zone 'Asia/Jakarta')::date; d30 date; r jsonb := '[]'; n int; n2 int; v numeric; staff int; pm date;
begin
  if not member_in('settings', p_kos) then raise exception 'Tidak punya akses'; end if;
  select * into k from kos where id = p_kos;
  if k.closed_at is not null then return '[]'; end if;
  d30 := t - 30;
  select count(*) into staff from kos_members where kos_id = p_kos and role <> 'pemilik' and active;

  if k.business_type = 'retail' then
    -- Pelanggan & supplier
    if not module_on(p_kos, 'r_kontak') then
      select count(*) into n from sales where kos_id = p_kos and status = 'selesai' and pay_method = 'kasbon' and sale_date >= d30;
      if n >= 3 then r := r || rec_item('modul_r_kontak', 'modul', 'Aktifkan modul Pelanggan & supplier',
        format('Ada %s penjualan kasbon dalam 30 hari terakhir.', n), 'Lihat sisa kasbon per pelanggan, riwayat transaksinya, dan kirim pengingat WA.',
        'Menu Pelanggan & supplier muncul. Data lama tidak berubah; bisa dinonaktifkan lagi.', 'menengah', jsonb_build_object('type', 'modul', 'code', 'r_kontak'), jsonb_build_object('kasbon_30_hari', n)); end if;
    end if;
    -- Shift kasir
    if not module_on(p_kos, 'r_shift') then
      select count(*), count(distinct sale_date) into n, n2 from sales where kos_id = p_kos and status = 'selesai' and sale_date >= d30;
      if staff >= 1 and n >= 30 and n2 >= 10 then r := r || rec_item('modul_r_shift', 'modul', 'Aktifkan modul Shift kasir',
        format('Ada %s karyawan dan %s penjualan di %s hari berbeda dalam 30 hari terakhir.', staff, n, n2), 'Uang laci dihitung saat buka & tutup shift, selisih lebih/kurang langsung terlihat per kasir.',
        'Menu Shift kasir muncul; shift tidak wajib dipakai.', 'menengah', jsonb_build_object('type', 'modul', 'code', 'r_shift'), jsonb_build_object('karyawan', staff, 'penjualan_30_hari', n, 'hari_aktif', n2)); end if;
    end if;
    -- Barang menipis
    select count(*) into n from products where kos_id = p_kos and active and min_stock > 0 and stock <= min_stock;
    if n >= 3 and not module_on(p_kos, 'r_pengingat') then r := r || rec_item('modul_r_pengingat', 'modul', 'Aktifkan modul Pengingat toko',
      format('%s barang stoknya sudah di bawah batas minimum.', n), 'Lonceng pengingat di aplikasi untuk stok menipis, kasbon & utang jatuh tempo.',
      'Menu Pengingat muncul. Email pagi hanya untuk paket berbayar.', 'menengah', jsonb_build_object('type', 'modul', 'code', 'r_pengingat'), jsonb_build_object('barang_menipis', n)); end if;
    if n >= 3 and module_on(p_kos, 'r_belanja') and not rec_rule_on(p_kos, 'stok_minimum') then r := r || rec_item('auto_stok_minimum', 'otomatisasi', 'Nyalakan otomatisasi "Stok menipis → draf pesanan"',
      format('%s barang stoknya sudah di bawah batas minimum.', n), 'Setiap pagi sistem menyiapkan draf pesanan ke supplier terakhir; Anda tinggal menyetujui.',
      'Hanya membuat draf yang menunggu persetujuan Anda; tidak memesan sendiri.', 'menengah', jsonb_build_object('type', 'otomatisasi', 'recipe', 'stok_minimum'), jsonb_build_object('barang_menipis', n)); end if;
    -- Barcode & label
    if not module_on(p_kos, 'r_label') then
      select count(distinct p.id) into n from products p join sale_lines l on l.product_id = p.id join sales s on s.id = l.sale_id
      where p.kos_id = p_kos and p.active and p.sku is null and s.status = 'selesai' and s.sale_date >= d30
        and not exists (select 1 from product_units u where u.product_id = p.id and coalesce(u.barcode, '') <> '');
      if n >= 5 then r := r || rec_item('modul_r_label', 'modul', 'Aktifkan modul Barcode & label',
        format('%s barang yang laku 30 hari terakhir belum punya barcode maupun kode barang.', n), 'Cetak label barcode sendiri agar kasir cukup scan, lebih cepat dan tidak salah pilih barang.',
        'Menu Cetak label muncul.', 'menengah', jsonb_build_object('type', 'modul', 'code', 'r_label'), jsonb_build_object('barang_tanpa_kode', n)); end if;
    end if;
    -- Belanja ke supplier
    if not module_on(p_kos, 'r_belanja') then
      select count(*) into n from stock_moves where kos_id = p_kos and kind = 'koreksi' and delta > 0 and created_at >= d30;
      if n >= 5 then r := r || rec_item('modul_r_belanja', 'modul', 'Aktifkan modul Belanja ke supplier',
        format('Stok ditambah lewat koreksi manual %s kali dalam 30 hari terakhir.', n), 'Barang masuk dicatat sebagai belanja: harga modal rata-rata, utang supplier, dan kas ikut benar.',
        'Menu Belanja muncul.', 'menengah', jsonb_build_object('type', 'modul', 'code', 'r_belanja'), jsonb_build_object('koreksi_tambah_30_hari', n)); end if;
    end if;
    -- Kasbon jatuh tempo
    if not rec_rule_on(p_kos, 'kasbon_jatuh_tempo') then
      select count(*) into n from jsonb_array_elements(retail_ledger_internal_full(p_kos)->'kasbon') x where (x->>'due') is not null and (x->>'due')::date < t;
      if n >= 2 then r := r || rec_item('auto_kasbon', 'otomatisasi', 'Nyalakan otomatisasi "Kasbon jatuh tempo"',
        format('%s pelanggan kasbonnya sudah lewat jatuh tempo.', n), 'Setiap pagi muncul daftar pelanggan yang perlu ditagih, lengkap dengan tombol Ingatkan WA.',
        'Hanya membuat pemberitahuan; tidak mengirim pesan sendiri.', 'menengah', jsonb_build_object('type', 'otomatisasi', 'recipe', 'kasbon_jatuh_tempo'), jsonb_build_object('pelanggan_lewat_tempo', n)); end if;
    end if;
    -- Pembatalan oleh karyawan tanpa persetujuan
    if staff >= 1 and not coalesce((select required from approval_rules where kos_id = p_kos and action_code = 'batal_penjualan'), (select default_required from approval_actions where code = 'batal_penjualan')) then
      select count(*) into n from sales s where s.kos_id = p_kos and s.status = 'batal' and s.voided_at >= d30 and s.created_by is distinct from k.owner_id;
      if n >= 2 then r := r || rec_item('aturan_batal_penjualan', 'persetujuan', 'Wajibkan persetujuan untuk pembatalan penjualan',
        format('%s penjualan oleh karyawan dibatalkan dalam 30 hari terakhir tanpa persetujuan.', n), 'Setiap pembatalan oleh karyawan menunggu keputusan Anda dan tercatat alasannya.',
        'Karyawan tetap bisa meminta; pemilik tetap bisa langsung membatalkan.', 'menengah', jsonb_build_object('type', 'persetujuan', 'action', 'batal_penjualan'), jsonb_build_object('pembatalan_30_hari', n)); end if;
    end if;
    -- Harga modal kosong
    select count(distinct l.product_id) into n from sale_lines l join sales s on s.id = l.sale_id where s.kos_id = p_kos and s.status = 'selesai' and s.sale_date >= d30 and l.cost = 0;
    if n >= 1 then r := r || rec_item('data_harga_modal', 'data', 'Lengkapi harga modal barang',
      format('%s barang terjual 30 hari terakhir tanpa harga modal, sehingga laba terlihat lebih tinggi dari sebenarnya.', n), 'Laba, HPP, dan pembukuan menjadi akurat.',
      'Hanya mengubah data barang; penjualan lama tetap memakai modal saat itu.', 'rendah', jsonb_build_object('type', 'link', 'href', '/barang'), jsonb_build_object('barang_tanpa_modal', n)); end if;
  else
    -- Properti
    select count(*) into n from invoice_summary where kos_id = p_kos and overdue;
    if n >= 3 and not module_on(p_kos, 'p_pengingat') then r := r || rec_item('modul_p_pengingat', 'modul', 'Aktifkan modul Pengingat & notifikasi tagihan',
      format('%s tagihan sudah lewat jatuh tempo.', n), 'Daftar tagih pagi dan pengingat jatuh tempo ke penghuni.',
      'Menu Pengingat muncul.' || case when plan_has(p_kos, 'pengingat_email') then '' else ' Email otomatis perlu paket Standar.' end, 'menengah', jsonb_build_object('type', 'modul', 'code', 'p_pengingat'), jsonb_build_object('tagihan_telat', n)); end if;
    if n >= 2 and not rec_rule_on(p_kos, 'tagihan_telat') then r := r || rec_item('auto_tagihan_telat', 'otomatisasi', 'Nyalakan otomatisasi "Tagihan telat"',
      format('%s tagihan sudah lewat jatuh tempo.', n), 'Setiap pagi muncul daftar penghuni yang telat bayar dengan tombol Kirim WA.',
      'Hanya membuat pemberitahuan.', 'menengah', jsonb_build_object('type', 'otomatisasi', 'recipe', 'tagihan_telat'), jsonb_build_object('tagihan_telat', n)); end if;
    select count(*) into n from payments where kos_id = p_kos and status = 'menunggu' and created_at < now() - interval '3 days';
    if n >= 2 and not rec_rule_on(p_kos, 'pembayaran_menunggu') then r := r || rec_item('auto_pembayaran_menunggu', 'otomatisasi', 'Nyalakan otomatisasi "Pembayaran menunggu diperiksa"',
      format('%s pembayaran menunggu verifikasi lebih dari 3 hari.', n), 'Pengingat harian agar transfer penghuni segera diperiksa.',
      'Hanya membuat pemberitahuan.', 'menengah', jsonb_build_object('type', 'otomatisasi', 'recipe', 'pembayaran_menunggu'), jsonb_build_object('menunggu_lebih_3_hari', n)); end if;
  end if;

  -- Pembukuan (semua jenis)
  if not module_on(p_kos, 'u_akuntansi') then
    select (select count(*) from sales where kos_id = p_kos and status = 'selesai' and sale_date >= d30) + (select count(*) from payments where kos_id = p_kos and status = 'terverifikasi' and paid_at >= d30) into n;
    if n >= 30 then r := r || rec_item('modul_u_akuntansi', 'modul', 'Aktifkan modul Pembukuan',
      format('%s transaksi uang masuk dalam 30 hari terakhir.', n), 'Jurnal, buku besar, laba rugi, dan neraca dibuat otomatis dari transaksi yang sudah dicatat.',
      'Menu Pembukuan muncul; tidak perlu mencatat ulang.', 'menengah', jsonb_build_object('type', 'modul', 'code', 'u_akuntansi'), jsonb_build_object('transaksi_30_hari', n)); end if;
  elsif extract(day from t) >= 10 then
    pm := (date_trunc('month', t) - interval '1 month')::date;
    if not acct_period_closed(p_kos, pm) and exists (select 1 from acct_entries where kos_id = p_kos and entry_date >= pm and entry_date < date_trunc('month', t)::date) then
      r := r || rec_item('tutup_periode_' || to_char(pm, 'YYYYMM'), 'pembukuan', 'Periksa lalu tutup buku ' || to_char(pm, 'MM/YYYY'),
        'Sudah lewat tanggal 10 dan bulan lalu belum ditutup.', 'Angka bulan lalu terkunci; koreksi berikutnya tercatat di bulan berjalan.',
        'Risiko tinggi: lakukan sendiri setelah memeriksa laporan. Bisa dibuka kembali dengan alasan.', 'tinggi', jsonb_build_object('type', 'link', 'href', '/pembukuan'), jsonb_build_object('bulan', to_char(pm, 'YYYY-MM')));
    end if;
  end if;

  -- yang diabaikan/diterima disembunyikan sampai tanggalnya
  return (select coalesce(jsonb_agg(x || jsonb_build_object('basis', 'Data bisnis ini, 30 hari terakhir (dihitung ' || to_char(now() at time zone 'Asia/Jakarta', 'DD/MM/YYYY HH24:MI') || ')')), '[]')
          from jsonb_array_elements(r) x
          where not exists (select 1 from recommendation_state s where s.kos_id = p_kos and s.code = x->>'code' and s.until >= t));
end $$;

create or replace function public.recommendation_decide(p_kos uuid, p_code text, p_status text, p_days int, p_reason text)
returns void language plpgsql security definer set search_path = public as $$
declare v_until date := (now() at time zone 'Asia/Jakarta')::date + greatest(coalesce(p_days, 30), 1);
begin
  if not member_in('settings', p_kos) then raise exception 'Tidak punya akses'; end if;
  if p_status not in ('diterima', 'diabaikan') then raise exception 'Status tidak dikenal'; end if;
  insert into recommendation_state(kos_id, code, status, until, reason, decided_by) values (p_kos, p_code, p_status, v_until, nullif(trim(coalesce(p_reason, '')), ''), actor_email())
  on conflict (kos_id, code) do update set status = excluded.status, until = excluded.until, reason = excluded.reason, decided_by = excluded.decided_by, decided_at = now();
  perform config_log(p_kos, case when p_status = 'diterima' then 'rekomendasi_diterima' else 'rekomendasi_diabaikan' end, p_code, null,
    jsonb_build_object('sampai', v_until), nullif(trim(coalesce(p_reason, '')), ''), 'rendah', actor_email());
end $$;

-- ================= (2) EKSPOR DATA =================
alter table public.kos add column if not exists last_export_at timestamptz;
alter table public.kos add column if not exists closed_at timestamptz;
alter table public.kos add column if not exists closed_by text;
alter table public.kos add column if not exists close_reason text;

-- Semua tabel milik bisnis, tanpa token/rahasia dan tanpa catatan internal staf PRASARA
create or replace function public.business_export(p_kos uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare t record; v jsonb := '{}'; rows jsonb;
begin
  if not member_can(p_kos, 'team') then raise exception 'Ekspor seluruh data hanya oleh pemilik'; end if;
  for t in select c.table_name from information_schema.columns c join information_schema.tables tb using (table_schema, table_name)
           where c.table_schema = 'public' and c.column_name = 'kos_id' and tb.table_type = 'BASE TABLE'
             and c.table_name not in ('admin_log', 'admin_notes', 'announcement_sends', 'support_access', 'digest_log', 'onboarding_email_log', 'summary_log', 'recommendation_state')
           order by 1 loop
    execute format('select coalesce(jsonb_agg(to_jsonb(x) - ''portal_token'' - ''email_token'' - ''token''), ''[]'') from %I x where kos_id = $1', t.table_name) into rows using p_kos;
    if jsonb_array_length(rows) > 0 then v := v || jsonb_build_object(t.table_name, rows); end if;
  end loop;
  v := v || jsonb_build_object('kos', (select jsonb_build_array(to_jsonb(k) - 'email_token') from kos k where k.id = p_kos));
  update kos set last_export_at = now() where id = p_kos;
  perform config_log(p_kos, 'ekspor_data', 'semua tabel', null, jsonb_build_object('tabel', (select count(*) from jsonb_object_keys(v))), null, 'menengah', actor_email());
  return jsonb_build_object('exported_at', now(), 'business', (select name from kos where id = p_kos), 'tables', v);
end $$;

-- ================= (3) TUTUP BISNIS =================
-- Bisnis yang ditutup = arsip hanya-baca: semua perubahan dari pengguna ditolak di database, data tidak dihapus
create or replace function public.kos_open_guard()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null and exists (select 1 from kos where id = coalesce(case when tg_op = 'DELETE' then null else new.kos_id end, old.kos_id) and closed_at is not null) then
    raise exception 'Bisnis ini sudah ditutup (arsip hanya-baca). Pemilik bisa membukanya kembali di Pengaturan.';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end $$;
do $$
declare t record;
begin
  for t in select c.table_name from information_schema.columns c join information_schema.tables tb using (table_schema, table_name)
           where c.table_schema = 'public' and c.column_name = 'kos_id' and tb.table_type = 'BASE TABLE'
             and c.table_name not in ('admin_log', 'admin_notes', 'announcement_sends', 'support_access', 'support_tickets', 'config_history', 'digest_log', 'onboarding_email_log',
                                      'summary_log', 'kos_members', 'kos_invites', 'plan_requests', 'recommendation_state') loop
    execute format('drop trigger if exists zz_kos_open_guard on public.%I', t.table_name);
    execute format('create trigger zz_kos_open_guard before insert or update or delete on public.%I for each row execute function public.kos_open_guard()', t.table_name);
  end loop;
end $$;
drop policy if exists kos_update on public.kos;
create policy kos_update on public.kos for update using (((owner_id = auth.uid()) or member_can(id, 'settings')) and closed_at is null)
  with check ((owner_id = auth.uid()) or member_can(id, 'settings'));

-- Pemeriksaan sebelum menutup (blueprint 21.5)
create or replace function public.business_close_check(p_kos uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare k kos; b jsonb := '[]'; w jsonb := '[]'; n int; v numeric;
begin
  if not member_can(p_kos, 'team') then raise exception 'Hanya pemilik'; end if;
  select * into k from kos where id = p_kos;
  -- penghalang
  select count(*) into n from cash_shifts where kos_id = p_kos and closed_at is null;
  if n > 0 then b := b || jsonb_build_object('label', format('%s shift kasir belum ditutup', n), 'href', '/shift'); end if;
  select count(*) into n from purchases where kos_id = p_kos and status in ('dipesan', 'sebagian');
  if n > 0 then b := b || jsonb_build_object('label', format('%s pesanan ke supplier belum selesai diterima/ditutup', n), 'href', '/belanja'); end if;
  select count(*) into n from approvals where kos_id = p_kos and status = 'menunggu';
  if n > 0 then b := b || jsonb_build_object('label', format('%s permintaan persetujuan masih menunggu', n), 'href', '/persetujuan'); end if;
  select count(*) into n from payments where kos_id = p_kos and status = 'menunggu';
  if n > 0 then b := b || jsonb_build_object('label', format('%s pembayaran belum diverifikasi', n), 'href', '/pembayaran'); end if;
  select count(*) into n from leases where kos_id = p_kos and status = 'aktif';
  if n > 0 then b := b || jsonb_build_object('label', format('%s penghuni masih aktif (akhiri sewanya dulu)', n), 'href', '/penghuni'); end if;
  if k.last_export_at is null or k.last_export_at < now() - interval '7 days' then
    b := b || jsonb_build_object('label', 'Unduh dulu semua data (ekspor) — wajib dalam 7 hari terakhir', 'href', null); end if;
  -- peringatan (boleh lanjut setelah dipahami)
  if k.business_type = 'retail' then
    select coalesce(sum((x->>'sisa')::numeric), 0), count(*) into v, n from jsonb_array_elements(retail_ledger_internal_full(p_kos)->'kasbon') x;
    if n > 0 then w := w || jsonb_build_object('label', format('%s pelanggan masih punya kasbon, total Rp %s', n, replace(to_char(v, 'FM999,999,999,999'), ',', '.')), 'href', '/kas'); end if;
    select coalesce(sum((x->>'sisa')::numeric), 0), count(*) into v, n from jsonb_array_elements(retail_ledger_internal_full(p_kos)->'utang') x;
    if n > 0 then w := w || jsonb_build_object('label', format('Masih ada utang ke %s supplier, total Rp %s', n, replace(to_char(v, 'FM999,999,999,999'), ',', '.')), 'href', '/kas'); end if;
    select count(*) into n from products where kos_id = p_kos and active and stock > 0;
    if n > 0 then w := w || jsonb_build_object('label', format('%s barang masih punya stok', n), 'href', '/barang'); end if;
  else
    select count(*), coalesce(sum(outstanding), 0) into n, v from invoice_summary where kos_id = p_kos and status <> 'batal' and outstanding > 0;
    if n > 0 then w := w || jsonb_build_object('label', format('%s tagihan belum lunas, total Rp %s', n, replace(to_char(v, 'FM999,999,999,999'), ',', '.')), 'href', '/tagihan'); end if;
  end if;
  if module_on(p_kos, 'u_akuntansi') and not acct_period_closed(p_kos, (date_trunc('month', now() at time zone 'Asia/Jakarta') - interval '1 month')::date)
     and exists (select 1 from acct_entries where kos_id = p_kos and entry_date < date_trunc('month', now() at time zone 'Asia/Jakarta')::date) then
    w := w || jsonb_build_object('label', 'Periode pembukuan bulan lalu belum ditutup', 'href', '/pembukuan'); end if;
  select count(*) into n from kos_members where kos_id = p_kos and role <> 'pemilik' and active;
  if n > 0 then w := w || jsonb_build_object('label', format('%s karyawan aktif — setelah ditutup mereka hanya bisa melihat (tidak bisa mencatat)', n), 'href', '/karyawan'); end if;
  return jsonb_build_object('blocking', b, 'warnings', w, 'last_export_at', k.last_export_at, 'name', k.name, 'closed_at', k.closed_at);
end $$;

create or replace function public.business_close(p_kos uuid, p_confirm_name text, p_reason text)
returns void language plpgsql security definer set search_path = public as $$
declare k kos; c jsonb;
begin
  if not member_can(p_kos, 'team') then raise exception 'Hanya pemilik yang bisa menutup bisnis'; end if;
  select * into k from kos where id = p_kos for update;
  if k.closed_at is not null then raise exception 'Bisnis sudah ditutup'; end if;
  if trim(coalesce(p_confirm_name, '')) <> trim(k.name) then raise exception 'Nama bisnis yang diketik tidak sama'; end if;
  if coalesce(length(trim(p_reason)), 0) < 5 then raise exception 'Tuliskan alasan (minimal 5 huruf)'; end if;
  c := business_close_check(p_kos);
  if jsonb_array_length(c->'blocking') > 0 then raise exception 'Belum bisa ditutup: %', (select string_agg(x->>'label', '; ') from jsonb_array_elements(c->'blocking') x); end if;
  update automation_rules set enabled = false, updated_by = actor_email(), updated_at = now() where kos_id = p_kos and enabled;
  delete from kos_invites where kos_id = p_kos;
  update kos set closed_at = now(), closed_by = actor_email(), close_reason = trim(p_reason) where id = p_kos;
  perform config_log(p_kos, 'tutup_bisnis', k.name, null, jsonb_build_object('peringatan', c->'warnings', 'ekspor_terakhir', k.last_export_at), trim(p_reason), 'tinggi', actor_email());
end $$;

create or replace function public.business_reopen(p_kos uuid, p_reason text)
returns void language plpgsql security definer set search_path = public as $$
declare k kos;
begin
  if not member_can(p_kos, 'team') then raise exception 'Hanya pemilik yang bisa membuka kembali'; end if;
  select * into k from kos where id = p_kos for update;
  if k.closed_at is null then raise exception 'Bisnis ini tidak dalam keadaan ditutup'; end if;
  if coalesce(length(trim(p_reason)), 0) < 5 then raise exception 'Tuliskan alasan (minimal 5 huruf)'; end if;
  update kos set closed_at = null, closed_by = null, close_reason = null where id = p_kos;
  perform config_log(p_kos, 'buka_bisnis', k.name, jsonb_build_object('ditutup', k.closed_at, 'alasan_tutup', k.close_reason), null, trim(p_reason), 'tinggi', actor_email());
end $$;

-- Jadwal harian & ringkasan tidak memproses bisnis yang ditutup
select public._prasara_patch('public.automation_tick()', 'where ru.enabled and k.suspended_at is null', 'where ru.enabled and k.suspended_at is null and k.closed_at is null');
select public._prasara_patch('public.acct_sync_all()', 'for k in select id from kos where suspended_at is null loop', 'for k in select id from kos where suspended_at is null and closed_at is null loop');
select public._prasara_patch('public.retail_alert_batch()', 'and k.suspended_at is null', 'and k.suspended_at is null and k.closed_at is null');
select public._prasara_patch('public.reminder_batch()', 'where s.status <> ''batal'' and s.outstanding > 0 and s.due_date <= t.d + 3', 'where s.status <> ''batal'' and s.outstanding > 0 and s.due_date <= t.d + 3 and k.closed_at is null and k.suspended_at is null');
select public._prasara_patch('public.summary_batch(text,date,date,date,date)', 'where (p_kind = ''mingguan'' and k.weekly_summary) or (p_kind = ''bulanan'' and k.monthly_summary)',
  'where ((p_kind = ''mingguan'' and k.weekly_summary) or (p_kind = ''bulanan'' and k.monthly_summary)) and k.closed_at is null and k.suspended_at is null');
select public._prasara_patch('public.owner_overview2(date)', 'where kk.suspended_at is null', 'where kk.suspended_at is null and kk.closed_at is null');

revoke execute on function public.rec_item(text, text, text, text, text, text, text, jsonb, jsonb), public.rec_rule_on(uuid, text), public.kos_open_guard() from public, anon, authenticated;
revoke execute on function public.recommendations(uuid), public.recommendation_decide(uuid, text, text, int, text), public.business_export(uuid),
  public.business_close_check(uuid), public.business_close(uuid, text, text), public.business_reopen(uuid, text) from public, anon;
grant execute on function public.recommendations(uuid), public.recommendation_decide(uuid, text, text, int, text), public.business_export(uuid),
  public.business_close_check(uuid), public.business_close(uuid, text, text), public.business_reopen(uuid, text) to authenticated;

drop function public._prasara_patch(text, text, text);
