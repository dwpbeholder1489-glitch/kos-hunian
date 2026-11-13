-- Harga V2 (keputusan pemilik 13 Nov 2026): Dasar, Bisnis, Pro + Pro Tahunan; harga normal vs harga promosi;
-- masa coba 14 hari di Paket Dasar; pelanggan Standar pindah ke Bisnis tanpa memotong masa aktif; mode Gratis tetap ada.
-- Semua angka di bawah = nilai awal yang bisa diubah Super Admin (Paket & harga). Tidak ada tanggal akhir promosi bawaan.

create or replace function public._prasara_patch(p_sig text, p_old text, p_new text)
returns void language plpgsql as $$
declare d text;
begin
  d := pg_get_functiondef(p_sig::regprocedure);
  if position(p_old in d) = 0 then raise exception 'patch %: potongan tidak ditemukan', p_sig; end if;
  execute replace(d, p_old, p_new);
end $$;

-- ---------- Harga normal (dicoret) & paket jangka panjang ----------
alter table public.plan_versions add column if not exists list_price numeric(14,2) check (list_price is null or list_price >= 0);

create table if not exists public.plan_terms (
  plan_key text not null references public.plans(key) on update cascade,
  months int not null check (months in (3, 6, 12)),
  price numeric(14,2) not null check (price >= 0),            -- total yang dibayar untuk seluruh jangka
  list_price numeric(14,2) check (list_price is null or list_price >= price),  -- harga pembanding (dicoret)
  active boolean not null default true,
  note text,
  updated_by text,
  updated_at timestamptz not null default now(),
  primary key (plan_key, months)
);
alter table public.plan_terms enable row level security;   -- dibaca lewat fungsi saja

insert into public.plans(key, name, tagline, is_free, sort) values
  ('dasar', 'Dasar', 'Usaha satu lokasi yang ingin rapi dan tercatat', false, 1),
  ('bisnis', 'Bisnis', 'Bisnis berkembang dengan tim dan laporan lengkap', false, 2)
on conflict (key) do nothing;
update public.plans set sort = 3, tagline = 'Digitalisasi lebih luas: portal, tim besar, kapasitas besar' where key = 'pro';
update public.plans set active = false, public = false, sort = 9 where key = 'standar';   -- tidak dijual lagi; riwayat tetap terbaca

insert into public.plan_versions(plan_key, version, price, list_price, limits, features, note, created_by)
select 'dasar', 1, 49000, 69000, '{"karyawan": 1, "lampiran_mb": 500}'::jsonb, '{laporan_lengkap,ekspor,kwitansi,pengingat_email,email_toko}'::text[], 'Harga V2 (peluncuran)', 'sistem'
where not exists (select 1 from public.plan_versions where plan_key = 'dasar');
insert into public.plan_versions(plan_key, version, price, list_price, limits, features, note, created_by)
select 'bisnis', 1, 99000, 139000, '{"karyawan": 5, "lampiran_mb": 2000}'::jsonb, '{laporan_lengkap,ekspor,kwitansi,pengingat_email,email_toko}'::text[], 'Harga V2 (peluncuran)', 'sistem'
where not exists (select 1 from public.plan_versions where plan_key = 'bisnis');
insert into public.plan_versions(plan_key, version, price, list_price, limits, features, note, created_by)
select 'pro', (select max(version) + 1 from public.plan_versions where plan_key = 'pro'), 149000, 199000, '{"karyawan": 15, "lampiran_mb": 10000}'::jsonb,
       '{laporan_lengkap,ekspor,kwitansi,pengingat_email,email_toko,portal_penghuni}'::text[], 'Harga V2 (peluncuran)', 'sistem'
where not exists (select 1 from public.plan_versions where plan_key = 'pro' and note = 'Harga V2 (peluncuran)');

-- Pro Tahunan: Rp1.072.800 sekali bayar untuk 12 bulan; pembanding Rp1.788.000 (= 12 × Rp149.000)
insert into public.plan_terms(plan_key, months, price, list_price, note, updated_by)
values ('pro', 12, 1072800, 1788000, 'Pro Tahunan V2 (hemat 40% dari 12 × harga bulanan)', 'sistem')
on conflict (plan_key, months) do nothing;

insert into public.platform_settings(key, value) values ('trial_days', '14'), ('promo_until', 'null')
on conflict (key) do nothing;

-- ---------- Masa coba: 14 hari Paket Dasar untuk bisnis baru; masa coba yang sedang berjalan tidak dipotong ----------
alter table public.kos add column if not exists trial_plan text references public.plans(key) on update cascade;
update public.kos set trial_plan = 'pro'
where trial_plan is null and trial_until is not null and trial_until >= (now() at time zone 'Asia/Jakarta')::date;
update public.platform_settings set value = '"dasar"', updated_at = now() where key = 'trial_plan';
alter table public.kos alter column trial_until set default ((now() at time zone 'Asia/Jakarta')::date + public.setting_int('trial_days', 14));

create or replace function public.kos_plan(p_kos uuid)
returns text language sql stable security definer set search_path = public as $$
  with t as (select (now() at time zone 'Asia/Jakarta')::date as d, setting_int('grace_days', 0) as g)
  select case
    when is_admin_owner(k.id) then 'pro'
    when k.paid_until is not null and k.plan <> free_plan() and k.paid_until >= t.d then k.plan
    when k.next_until is not null and k.next_plan is not null and k.next_until >= t.d and k.paid_until < t.d then k.next_plan
    when k.paid_until is not null and k.plan <> free_plan() and coalesce(k.next_until, k.paid_until) + t.g >= t.d then coalesce(case when k.next_until is not null then k.next_plan end, k.plan)
    when k.trial_until is not null and k.trial_until >= t.d then coalesce(k.trial_plan, setting_text('trial_plan', 'dasar'))
    else free_plan() end
  from kos k, t where k.id = p_kos;
$$;

-- Masa coba dihitung sejak bisnis diaktifkan (bukan sejak draf dibuat)
select public._prasara_patch('public.setup_activate(uuid)',
  'update kos set setup_status = ''active'', activated_at = now() where id = p_kos;',
  'update kos set setup_status = ''active'', activated_at = now(),
    trial_until = case when k.activated_at is null and paid_until is null then (now() at time zone ''Asia/Jakarta'')::date + setting_int(''trial_days'', 14) else trial_until end
  where id = p_kos;');

-- ---------- Harga yang berlaku ----------
-- Promosi berakhir otomatis hanya bila Super Admin mengisi tanggal 'promo_until'; tanpa tanggal, harga promosi berlaku sampai diubah.
create or replace function public.promo_until()
returns date language sql stable security definer set search_path = public as $$
  select nullif(value #>> '{}', '')::date from platform_settings where key = 'promo_until';
$$;
create or replace function public.plan_eff_price(p_plan text)
returns numeric language sql stable security definer set search_path = public as $$
  select case when v.list_price is not null and promo_until() is not null and (now() at time zone 'Asia/Jakarta')::date > promo_until() then v.list_price else v.price end
  from plan_current(p_plan) v;
$$;

create or replace function public.plan_unit_price(p_kos uuid, p_plan text)
returns numeric language sql stable security definer set search_path = public as $$
  select case
    when k.plan = p_plan and k.plan_version_id is not null and (plan_current(p_plan)).renewal = 'harga_lama'
      then (select price from plan_versions where id = k.plan_version_id)
    else plan_eff_price(p_plan) end
  from kos k where k.id = p_kos;
$$;
create or replace function public.plan_price(p_plan text, p_months integer)
returns numeric language sql stable security definer set search_path = public as $$
  select plan_eff_price(p_plan) * p_months;
$$;
-- Total untuk satu pembelian: paket jangka panjang (bila ada & aktif) atau harga bulanan × bulan
create or replace function public.plan_total(p_kos uuid, p_plan text, p_months integer)
returns numeric language sql stable security definer set search_path = public as $$
  select coalesce((select price from plan_terms where plan_key = p_plan and months = p_months and active), plan_unit_price(p_kos, p_plan) * p_months);
$$;

create or replace function public.plan_terms_json(p_plan text)
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object('months', months, 'price', price, 'list_price', list_price) order by months), '[]')
  from plan_terms where plan_key = p_plan and active;
$$;

create or replace function public.plans_public()
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object('key', p.key, 'name', p.name, 'tagline', p.tagline, 'is_free', p.is_free, 'active', p.active,
    'price', plan_eff_price(p.key), 'list_price', case when v.list_price > plan_eff_price(p.key) then v.list_price end,
    'limits', v.limits, 'features', v.features, 'terms', plan_terms_json(p.key),
    'trial', (not p.is_free and p.key = setting_text('trial_plan', 'dasar')), 'trial_days', setting_int('trial_days', 14), 'promo_until', promo_until()) order by p.sort, v.price), '[]')
  from plans p, lateral (select * from plan_current(p.key)) v
  where p.public and (p.active or p.is_free);
$$;

-- price = yang dibayar bisnis ini per bulan; current_price = harga umum sekarang; list_price = harga normal (dicoret)
create or replace function public.plan_quote(p_kos uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if not member_in('team', p_kos) then raise exception 'Khusus pemilik bisnis'; end if;
  return (select coalesce(jsonb_agg(jsonb_build_object('key', p.key, 'name', p.name, 'tagline', p.tagline, 'price', plan_unit_price(p_kos, p.key),
            'current_price', plan_eff_price(p.key), 'list_price', case when v.list_price > plan_eff_price(p.key) then v.list_price end,
            'limits', v.limits, 'features', v.features, 'terms', plan_terms_json(p.key), 'promo_until', promo_until()) order by p.sort, v.price), '[]')
          from plans p, lateral (select * from plan_current(p.key)) v where p.active and not p.is_free);
end $$;

-- ---------- Pelanggan lama: Standar → Bisnis (masa aktif tidak berubah) ----------
do $$
declare v_b uuid := (select id from plan_versions where plan_key = 'bisnis' order by version desc limit 1); n int;
begin
  update kos set plan = 'bisnis', plan_version_id = v_b where plan = 'standar';
  get diagnostics n = row_count;
  update kos set next_plan = 'bisnis', next_version_id = v_b where next_plan = 'standar';
  -- tagihan Standar yang masih menunggu: tetap dengan nominal yang sudah ditagihkan, mengaktifkan Bisnis
  update plan_requests set plan = 'bisnis', version_id = v_b where plan = 'standar' and status = 'menunggu';
  if n > 0 then
    insert into admin_log(actor_email, action, detail) values ('sistem', 'migrasi_paket', jsonb_build_object('dari', 'standar', 'ke', 'bisnis', 'bisnis', n, 'catatan', 'Harga V2: masa aktif tidak diubah'));
  end if;
end $$;

-- ---------- Management Center ----------
drop function if exists public.admin_plan_version(text, numeric, jsonb, text[], text, text);
create or replace function public.admin_plan_version(p_key text, p_price numeric, p_limits jsonb, p_features text[], p_renewal text, p_note text, p_list_price numeric default null)
returns int language plpgsql security definer set search_path = public as $$
declare v_prev plan_versions; v_ver int; v_limits jsonb := '{}'; k text;
begin
  if not admin_can('plans.manage') then raise exception 'Khusus Super Admin'; end if;
  if not exists (select 1 from plans where key = p_key) then raise exception 'Paket tidak dikenal'; end if;
  if p_price is null or p_price < 0 then raise exception 'Harga tidak valid'; end if;
  if (select is_free from plans where key = p_key) and p_price <> 0 then raise exception 'Paket gratis harus Rp 0'; end if;
  if p_list_price is not null and p_list_price < p_price then raise exception 'Harga normal tidak boleh lebih kecil dari harga yang berlaku'; end if;
  if coalesce(length(trim(p_note)), 0) < 5 then raise exception 'Tuliskan alasan perubahan (minimal 5 huruf)'; end if;
  if not (coalesce(p_features, '{}') <@ plan_feature_codes()) then raise exception 'Ada fitur yang tidak dikenal'; end if;
  for k in select jsonb_object_keys(coalesce(p_limits, '{}')) loop
    if k not in ('kamar_terisi', 'karyawan', 'lampiran_mb') then raise exception 'Batas tidak dikenal: %', k; end if;
    if p_limits ->> k is not null and p_limits ->> k <> '' then
      if (p_limits ->> k)::int < 0 then raise exception 'Batas tidak boleh minus'; end if;
      v_limits := v_limits || jsonb_build_object(k, (p_limits ->> k)::int);
    end if;
  end loop;
  select * into v_prev from plan_versions where plan_key = p_key order by version desc limit 1;
  v_ver := coalesce(v_prev.version, 0) + 1;
  insert into plan_versions(plan_key, version, price, list_price, limits, features, renewal, note, created_by)
  values (p_key, v_ver, p_price, nullif(p_list_price, p_price), v_limits, coalesce(p_features, '{}'), coalesce(p_renewal, 'harga_baru'), trim(p_note), actor_email());
  insert into admin_log(actor_email, action, detail) values (actor_email(), 'ubah_harga',
    jsonb_build_object('paket', p_key, 'versi', v_ver, 'harga_lama', v_prev.price, 'harga_baru', p_price, 'harga_normal', p_list_price, 'perpanjangan', p_renewal, 'alasan', trim(p_note)));
  return v_ver;
end $$;

create or replace function public.admin_plan_term_save(p_key text, p_months int, p_price numeric, p_list_price numeric, p_active boolean, p_note text)
returns void language plpgsql security definer set search_path = public as $$
declare v_old plan_terms;
begin
  if not admin_can('plans.manage') then raise exception 'Khusus Super Admin'; end if;
  if not exists (select 1 from plans where key = p_key and not is_free) then raise exception 'Paket tidak dikenal'; end if;
  if p_months not in (3, 6, 12) then raise exception 'Jangka 3, 6, atau 12 bulan'; end if;
  if p_price is null or p_price < 0 then raise exception 'Harga tidak valid'; end if;
  if p_list_price is not null and p_list_price < p_price then raise exception 'Harga pembanding tidak boleh lebih kecil dari harga jual'; end if;
  if coalesce(length(trim(p_note)), 0) < 5 then raise exception 'Tuliskan alasan perubahan (minimal 5 huruf)'; end if;
  select * into v_old from plan_terms where plan_key = p_key and months = p_months;
  insert into plan_terms(plan_key, months, price, list_price, active, note, updated_by, updated_at)
  values (p_key, p_months, p_price, p_list_price, coalesce(p_active, true), trim(p_note), actor_email(), now())
  on conflict (plan_key, months) do update set price = excluded.price, list_price = excluded.list_price, active = excluded.active, note = excluded.note, updated_by = excluded.updated_by, updated_at = now();
  insert into admin_log(actor_email, action, detail) values (actor_email(), 'ubah_harga',
    jsonb_build_object('paket', p_key, 'jangka_bulan', p_months, 'harga_lama', v_old.price, 'harga_baru', p_price, 'harga_normal', p_list_price, 'aktif', coalesce(p_active, true), 'alasan', trim(p_note)));
end $$;

create or replace function public.admin_setting_save(p_key text, p_value jsonb)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not admin_can('plans.manage') then raise exception 'Khusus Super Admin'; end if;
  if p_key = 'grace_days' then
    if (p_value #>> '{}')::int not between 0 and 30 then raise exception 'Masa tenggang 0–30 hari'; end if;
  elsif p_key = 'trial_days' then
    if (p_value #>> '{}')::int not between 0 and 90 then raise exception 'Masa coba 0–90 hari'; end if;
  elsif p_key = 'trial_plan' then
    if not exists (select 1 from plans where key = p_value #>> '{}') then raise exception 'Paket masa coba tidak dikenal'; end if;
  elsif p_key = 'promo_until' then
    if p_value is not null and jsonb_typeof(p_value) <> 'null' then perform (p_value #>> '{}')::date; else p_value := 'null'::jsonb; end if;
  else raise exception 'Pengaturan tidak dikenal'; end if;
  insert into platform_settings(key, value, updated_at) values (p_key, p_value, now()) on conflict (key) do update set value = excluded.value, updated_at = now();
  insert into admin_log(actor_email, action, detail) values (actor_email(), 'ubah_pengaturan', jsonb_build_object('kunci', p_key, 'nilai', p_value));
end $$;

create or replace function public.admin_plans()
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if not admin_can('payments.view') then raise exception 'Tidak punya izin'; end if;
  return jsonb_build_object(
    'grace_days', setting_int('grace_days', 0),
    'trial_days', setting_int('trial_days', 14),
    'trial_plan', setting_text('trial_plan', 'dasar'),
    'promo_until', promo_until(),
    'codes', to_jsonb(plan_feature_codes()),
    'plans', (select coalesce(jsonb_agg(jsonb_build_object('key', p.key, 'name', p.name, 'tagline', p.tagline, 'active', p.active, 'public', p.public,
        'is_free', p.is_free, 'sort', p.sort,
        'subscribers', (select count(*) from kos k where kos_plan(k.id) = p.key and (k.paid_until is not null or p.is_free)),
        'terms', (select coalesce(jsonb_agg(to_jsonb(t) order by t.months), '[]') from plan_terms t where t.plan_key = p.key),
        'versions', (select jsonb_agg(to_jsonb(v) order by v.version desc) from plan_versions v where v.plan_key = p.key)) order by p.sort), '[]') from plans p));
end $$;

-- Ringkasan admin: hitung per paket apa pun yang berbayar (bukan hanya standar/pro)
select public._prasara_patch('public.admin_overview()', 'k.plan in (''standar'', ''pro'')) as paying', 'k.plan <> free_plan()) as paying');
select public._prasara_patch('public.admin_overview()',
  '''standar'', (select count(*) from b where paying and plan = ''standar''), ''pro'', (select count(*) from b where paying and plan = ''pro'')),',
  '''standar'', (select count(*) from b where paying and plan = ''standar''), ''pro'', (select count(*) from b where paying and plan = ''pro''),
                                ''dasar'', (select count(*) from b where paying and plan = ''dasar''), ''bisnis'', (select count(*) from b where paying and plan = ''bisnis'')),');

revoke execute on function public.promo_until(), public.plan_eff_price(text), public.plan_total(uuid, text, integer), public.plan_terms_json(text),
  public.admin_plan_version(text, numeric, jsonb, text[], text, text, numeric), public.admin_plan_term_save(text, int, numeric, numeric, boolean, text) from public, anon;
grant execute on function public.admin_plan_version(text, numeric, jsonb, text[], text, text, numeric), public.admin_plan_term_save(text, int, numeric, numeric, boolean, text) to authenticated;

drop function public._prasara_patch(text, text, text);
