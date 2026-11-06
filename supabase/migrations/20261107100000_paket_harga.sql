-- Pengatur paket & harga (Pricing Plan Manager) dengan versi harga, entitlement (fitur & batas) yang diperiksa di database,
-- masa tenggang, upgrade/downgrade, berhenti perpanjang, nomor invoice, dan verifikasi pembayaran sesuai izin staf.

-- ---------- Katalog paket ----------
create table if not exists public.plans (
  key text primary key check (key ~ '^[a-z][a-z0-9_]{1,20}$'),
  name text not null check (length(trim(name)) between 2 and 30),
  tagline text,
  active boolean not null default true,          -- bisa dibeli/diperpanjang
  public boolean not null default true,          -- tampil di halaman depan & Langganan
  is_free boolean not null default false,
  sort int not null default 0,
  created_at timestamptz not null default now()
);
create unique index if not exists plans_one_free on public.plans(is_free) where is_free;

create table if not exists public.plan_versions (
  id uuid primary key default gen_random_uuid(),
  plan_key text not null references public.plans(key) on update cascade,
  version int not null,
  price numeric(14,2) not null check (price >= 0),           -- per bulan per bisnis
  limits jsonb not null default '{}',                         -- {kamar_terisi: n, karyawan: n}; tidak ada = tanpa batas
  features text[] not null default '{}',
  renewal text not null default 'harga_baru' check (renewal in ('harga_baru', 'harga_lama')),
  note text,
  created_by text,
  created_at timestamptz not null default now(),
  unique (plan_key, version)
);

create table if not exists public.platform_settings (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);

alter table public.plans enable row level security;
alter table public.plan_versions enable row level security;
alter table public.platform_settings enable row level security;
-- dibaca lewat fungsi saja

insert into public.plans(key, name, tagline, is_free, sort) values
  ('gratis', 'Gratis', 'Untuk usaha kecil dan mencoba', true, 0),
  ('standar', 'Standar', 'Inti pengelolaan bisnis, tanpa batas kamar', false, 1),
  ('pro', 'Pro', 'Untuk pemilik yang ingin serba otomatis', false, 2)
on conflict (key) do nothing;

insert into public.plan_versions(plan_key, version, price, limits, features, note, created_by)
select * from (values
  ('gratis', 1, 0::numeric, '{"kamar_terisi": 5, "karyawan": 1}'::jsonb, '{}'::text[], 'Harga awal', 'sistem'),
  ('standar', 1, 100000::numeric, '{"karyawan": 3}'::jsonb, '{laporan_lengkap,ekspor,kwitansi,pengingat_email,email_toko}'::text[], 'Harga awal', 'sistem'),
  ('pro', 1, 150000::numeric, '{}'::jsonb, '{laporan_lengkap,ekspor,kwitansi,pengingat_email,email_toko,portal_penghuni}'::text[], 'Harga awal', 'sistem')
) v(a, b, c, d, e, f, g)
where not exists (select 1 from public.plan_versions);

insert into public.platform_settings(key, value) values ('grace_days', '0'), ('trial_plan', '"pro"')
on conflict (key) do nothing;

create or replace function public.plan_feature_codes()
returns text[] language sql immutable as $$
  select array['laporan_lengkap', 'ekspor', 'kwitansi', 'pengingat_email', 'portal_penghuni', 'email_toko'];
$$;

create or replace function public.setting_int(p_key text, p_default int)
returns int language sql stable security definer set search_path = public as $$
  select coalesce((select (value #>> '{}')::int from platform_settings where key = p_key), p_default);
$$;
create or replace function public.setting_text(p_key text, p_default text)
returns text language sql stable security definer set search_path = public as $$
  select coalesce((select value #>> '{}' from platform_settings where key = p_key), p_default);
$$;

create or replace function public.plan_current(p_plan text)
returns plan_versions language sql stable security definer set search_path = public as $$
  select * from plan_versions where plan_key = p_plan order by version desc limit 1;
$$;
create or replace function public.free_plan()
returns text language sql stable security definer set search_path = public as $$
  select coalesce((select key from plans where is_free limit 1), 'gratis');
$$;

-- ---------- Kolom langganan di bisnis ----------
alter table public.kos drop constraint if exists kos_plan_check;
alter table public.kos add column if not exists plan_version_id uuid references public.plan_versions(id);
alter table public.kos add column if not exists next_plan text references public.plans(key) on update cascade;
alter table public.kos add column if not exists next_until date;
alter table public.kos add column if not exists next_version_id uuid references public.plan_versions(id);
alter table public.kos add column if not exists cancel_at_end boolean not null default false;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'kos_plan_fkey') then
    alter table public.kos add constraint kos_plan_fkey foreign key (plan) references public.plans(key) on update cascade;
  end if;
end $$;
update public.kos k set plan_version_id = (plan_current(k.plan)).id where plan_version_id is null and k.plan <> 'gratis';

alter table public.plan_requests drop constraint if exists plan_requests_plan_check;
alter table public.plan_requests add column if not exists number text;
alter table public.plan_requests add column if not exists version_id uuid references public.plan_versions(id);
alter table public.plan_requests add column if not exists unit_price numeric(14,2);
alter table public.plan_requests add column if not exists kind text;   -- baru / perpanjang / upgrade / downgrade
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'plan_requests_plan_fkey') then
    alter table public.plan_requests add constraint plan_requests_plan_fkey foreign key (plan) references public.plans(key) on update cascade;
  end if;
end $$;
update public.plan_requests r set number = 'INV-' || to_char(r.created_at at time zone 'Asia/Jakarta', 'YYMM') || '-' || lpad(x.n::text, 4, '0')
from (select id, row_number() over (partition by to_char(created_at at time zone 'Asia/Jakarta', 'YYMM') order by created_at) n from public.plan_requests) x
where x.id = r.id and r.number is null;
create unique index if not exists plan_requests_number on public.plan_requests(number) where number is not null;

-- ---------- Paket yang berlaku (dengan masa tenggang & downgrade terjadwal) ----------
create or replace function public.kos_plan(p_kos uuid)
returns text language sql stable security definer set search_path = public as $$
  with t as (select (now() at time zone 'Asia/Jakarta')::date as d, setting_int('grace_days', 0) as g)
  select case
    when is_admin_owner(k.id) then 'pro'
    when k.paid_until is not null and k.plan <> free_plan() and k.paid_until >= t.d then k.plan
    when k.next_until is not null and k.next_plan is not null and k.next_until >= t.d and k.paid_until < t.d then k.next_plan
    when k.paid_until is not null and k.plan <> free_plan() and coalesce(k.next_until, k.paid_until) + t.g >= t.d then coalesce(case when k.next_until is not null then k.next_plan end, k.plan)
    when k.trial_until is not null and k.trial_until >= t.d then setting_text('trial_plan', 'pro')
    else free_plan() end
  from kos k, t where k.id = p_kos;
$$;

-- Fitur & batas mengikuti versi terbaru paket yang berlaku
create or replace function public.plan_has(p_kos uuid, p_feature text)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(p_feature = any ((plan_current(kos_plan(p_kos))).features), false);
$$;
create or replace function public.plan_limit(p_kos uuid, p_key text)
returns int language sql stable security definer set search_path = public as $$
  select nullif((plan_current(kos_plan(p_kos))).limits ->> p_key, '')::int;
$$;

create or replace function public.plan_bucket(p_kos uuid)
returns text language sql stable security definer set search_path = public as $$
  with t as (select (now() at time zone 'Asia/Jakarta')::date as d, setting_int('grace_days', 0) as g)
  select case
    when k.paid_until is not null and k.plan <> free_plan() and coalesce(k.next_until, k.paid_until) + t.g >= t.d then kos_plan(k.id)
    when k.trial_until is not null and k.trial_until >= t.d then 'coba'
    else free_plan() end
  from kos k, t where k.id = p_kos;
$$;

-- Entitlement untuk aplikasi (menu terkunci/terbuka). Database tetap pemeriksa akhir.
create or replace function public.my_entitlements()
returns jsonb language sql stable security definer set search_path = public as $$
  with t as (select (now() at time zone 'Asia/Jakarta')::date as d, setting_int('grace_days', 0) as g)
  select coalesce(jsonb_object_agg(k.id, jsonb_build_object(
    'plan', kos_plan(k.id), 'name', p.name, 'features', v.features, 'limits', v.limits,
    'grace', (k.paid_until is not null and k.plan <> free_plan() and coalesce(k.next_until, k.paid_until) < t.d and coalesce(k.next_until, k.paid_until) + t.g >= t.d),
    'grace_until', case when k.paid_until is not null then coalesce(k.next_until, k.paid_until) + t.g end,
    'next_plan', k.next_plan, 'next_name', (select name from plans where key = k.next_plan), 'next_until', k.next_until,
    'cancel_at_end', k.cancel_at_end)), '{}')
  from kos k join kos_members m on m.kos_id = k.id and m.user_id = auth.uid() and m.active, t,
    lateral (select * from plan_current(kos_plan(k.id))) v
    join plans p on p.key = v.plan_key;
$$;

-- Paket untuk halaman depan & Langganan (boleh dibaca tanpa masuk)
create or replace function public.plans_public()
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object('key', p.key, 'name', p.name, 'tagline', p.tagline, 'is_free', p.is_free, 'active', p.active,
    'price', v.price, 'limits', v.limits, 'features', v.features) order by p.sort, v.price), '[]')
  from plans p, lateral (select * from plan_current(p.key)) v
  where p.public and (p.active or p.is_free);
$$;

-- Harga untuk bisnis tertentu (berlaku "harga lama" bila versi terbaru mengizinkan)
create or replace function public.plan_unit_price(p_kos uuid, p_plan text)
returns numeric language sql stable security definer set search_path = public as $$
  select case
    when k.plan = p_plan and k.plan_version_id is not null and (plan_current(p_plan)).renewal = 'harga_lama'
      then (select price from plan_versions where id = k.plan_version_id)
    else (plan_current(p_plan)).price end
  from kos k where k.id = p_kos;
$$;
create or replace function public.plan_price(p_plan text, p_months integer)
returns numeric language sql stable security definer set search_path = public as $$
  select (plan_current(p_plan)).price * p_months;
$$;

create or replace function public.plan_quote(p_kos uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if not member_in('team', p_kos) then raise exception 'Khusus pemilik bisnis'; end if;
  return (select coalesce(jsonb_agg(jsonb_build_object('key', p.key, 'name', p.name, 'tagline', p.tagline, 'price', plan_unit_price(p_kos, p.key),
            'list_price', v.price, 'limits', v.limits, 'features', v.features) order by p.sort, v.price), '[]')
          from plans p, lateral (select * from plan_current(p.key)) v where p.active and not p.is_free);
end $$;

-- Gulirkan downgrade terjadwal bila masa paket lama sudah habis
create or replace function public.plan_roll(p_kos uuid)
returns void language sql security definer set search_path = public as $$
  update kos set plan = next_plan, paid_until = next_until, plan_version_id = next_version_id, next_plan = null, next_until = null, next_version_id = null
  where id = p_kos and next_plan is not null and paid_until < (now() at time zone 'Asia/Jakarta')::date;
$$;

-- ---------- Permintaan langganan (invoice) ----------
create or replace function public.request_plan(p_kos uuid, p_plan text, p_months integer, p_method text, p_note text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid; pl plans; k kos; v_unit numeric; v_kind text; v_today date := (now() at time zone 'Asia/Jakarta')::date; v_seq int; v_no text;
begin
  if not member_in('team', p_kos) then raise exception 'Khusus pemilik bisnis'; end if;
  select * into pl from plans where key = p_plan;
  if pl.key is null or pl.is_free or not pl.active then raise exception 'Paket tidak tersedia'; end if;
  if p_months not in (1, 3, 6, 12) then raise exception 'Durasi tidak valid'; end if;
  if exists (select 1 from plan_requests where kos_id = p_kos and status = 'menunggu') then
    raise exception 'Masih ada konfirmasi pembayaran yang menunggu diperiksa.'; end if;
  perform plan_roll(p_kos);
  select * into k from kos where id = p_kos;
  v_unit := plan_unit_price(p_kos, p_plan);
  v_kind := case when k.paid_until is null or k.paid_until < v_today or k.plan = free_plan() then 'baru'
                 when k.plan = p_plan then 'perpanjang'
                 when v_unit >= coalesce((select price from plan_versions where id = k.plan_version_id), (plan_current(k.plan)).price) then 'upgrade'
                 else 'downgrade' end;
  perform pg_advisory_xact_lock(hashtext('invoice'));
  select count(*) + 1 into v_seq from plan_requests where number like 'INV-' || to_char(v_today, 'YYMM') || '-%';
  v_no := 'INV-' || to_char(v_today, 'YYMM') || '-' || lpad(v_seq::text, 4, '0');
  insert into plan_requests(kos_id, user_id, plan, months, amount, method, note, number, version_id, unit_price, kind)
  values (p_kos, auth.uid(), p_plan, p_months, v_unit * p_months, coalesce(p_method, 'qris'), nullif(trim(p_note), ''), v_no,
          case when v_unit = (plan_current(p_plan)).price then (plan_current(p_plan)).id else k.plan_version_id end, v_unit, v_kind)
  returning id into v_id;
  update kos set cancel_at_end = false where id = p_kos;
  return v_id;
end $$;

-- Pemilik: berhenti perpanjang (tercatat); bisa dibatalkan
create or replace function public.plan_cancel(p_kos uuid, p_cancel boolean)
returns void language plpgsql security definer set search_path = public as $$
declare k kos;
begin
  if not member_in('team', p_kos) then raise exception 'Khusus pemilik bisnis'; end if;
  select * into k from kos where id = p_kos;
  update kos set cancel_at_end = p_cancel where id = p_kos;
  insert into admin_log(actor_email, action, kos_id, kos_name, detail)
  values (actor_email(), case when p_cancel then 'batal_langganan' else 'lanjut_langganan' end, p_kos, k.name,
          jsonb_build_object('paket', k.plan, 'sampai', k.paid_until));
end $$;

-- ---------- Penerapan paket (verifikasi / override) ----------
drop function if exists public.admin_set_plan(uuid, text, integer);
create or replace function public.admin_set_plan(p_kos uuid, p_plan text, p_months integer, p_version uuid default null)
returns date language plpgsql security definer set search_path = public as $$
declare v_today date := (now() at time zone 'Asia/Jakarta')::date; k kos; v_until date; v_ver uuid; v_cur numeric; v_new numeric; v_credit int; pl plans;
begin
  if not (admin_can('payments.verify') or admin_can('customers.override')) then raise exception 'Tidak punya izin'; end if;
  perform plan_roll(p_kos);
  select * into k from kos where id = p_kos for update;
  if k.id is null then raise exception 'Bisnis tidak ditemukan'; end if;
  select * into pl from plans where key = p_plan;
  if pl.key is null then raise exception 'Paket tidak dikenal'; end if;
  if pl.is_free then
    update kos set plan = p_plan, paid_until = null, plan_version_id = null, next_plan = null, next_until = null, next_version_id = null,
      trial_until = least(coalesce(trial_until, v_today - 1), v_today - 1), cancel_at_end = false where id = p_kos;
    return null;
  end if;
  if p_months < 1 then raise exception 'Durasi tidak valid'; end if;
  v_ver := coalesce(p_version, (plan_current(p_plan)).id);
  if k.paid_until is null or k.paid_until < v_today or k.plan = free_plan() then
    v_until := (v_today + make_interval(months => p_months))::date;
    update kos set plan = p_plan, paid_until = v_until, plan_version_id = v_ver, next_plan = null, next_until = null, next_version_id = null, cancel_at_end = false where id = p_kos;
  elsif k.plan = p_plan then
    v_until := (greatest(k.paid_until, coalesce(k.next_until, k.paid_until)) + make_interval(months => p_months))::date;
    if k.next_plan is not null then
      update kos set next_until = v_until, cancel_at_end = false where id = p_kos;  -- perpanjang setelah jadwal yang ada
    else
      update kos set paid_until = v_until, plan_version_id = v_ver, cancel_at_end = false where id = p_kos;
    end if;
  else
    v_cur := coalesce((select price from plan_versions where id = k.plan_version_id), (plan_current(k.plan)).price);
    v_new := (select price from plan_versions where id = v_ver);
    if v_new >= v_cur then
      -- upgrade: mulai sekarang; sisa hari paket lama dikonversi sesuai perbandingan harga
      v_credit := floor((k.paid_until - v_today) * v_cur / greatest(v_new, 1))::int;
      v_until := (v_today + v_credit + make_interval(months => p_months))::date;
      update kos set plan = p_plan, paid_until = v_until, plan_version_id = v_ver, next_plan = null, next_until = null, next_version_id = null, cancel_at_end = false where id = p_kos;
    else
      -- downgrade: mulai setelah paket sekarang berakhir
      v_until := (k.paid_until + make_interval(months => p_months))::date;
      update kos set next_plan = p_plan, next_until = v_until, next_version_id = v_ver, cancel_at_end = false where id = p_kos;
    end if;
  end if;
  return v_until;
end $$;

create or replace function public.admin_decide_request(p_request uuid, p_approve boolean)
returns void language plpgsql security definer set search_path = public as $$
declare r plan_requests;
begin
  if not admin_can('payments.verify') then raise exception 'Tidak punya izin memverifikasi pembayaran'; end if;
  select * into r from plan_requests where id = p_request for update;
  if r.id is null then raise exception 'Permintaan tidak ditemukan'; end if;
  if r.status <> 'menunggu' then raise exception 'Permintaan ini sudah diproses'; end if;
  if p_approve then perform admin_set_plan(r.kos_id, r.plan, r.months, r.version_id); end if;
  update plan_requests set status = case when p_approve then 'disetujui' else 'ditolak' end, decided_at = now() where id = p_request;
end $$;

create or replace function public.admin_override(p_kos uuid, p_action text, p_plan text, p_value integer, p_reason text)
returns void language plpgsql security definer set search_path = public as $$
declare v_today date := (now() at time zone 'Asia/Jakarta')::date; k kos;
begin
  if not admin_can('customers.override') then raise exception 'Khusus Super Admin'; end if;
  if coalesce(length(trim(p_reason)), 0) < 5 then raise exception 'Tuliskan alasan (minimal 5 huruf)'; end if;
  select * into k from kos where id = p_kos for update;
  if k.id is null then raise exception 'Bisnis tidak ditemukan'; end if;
  if p_action = 'tambah_coba' then
    if p_value is null or p_value < 1 or p_value > 90 then raise exception 'Tambahan masa coba 1–90 hari'; end if;
    update kos set trial_until = greatest(coalesce(trial_until, v_today), v_today) + p_value where id = p_kos;
  elsif p_action = 'beri_paket' then
    if not exists (select 1 from plans where key = p_plan and not is_free) or p_value is null or p_value < 1 or p_value > 24 then raise exception 'Paket atau durasi tidak valid'; end if;
    perform admin_set_plan(p_kos, p_plan, p_value);
  elsif p_action = 'jadikan_gratis' then
    perform admin_set_plan(p_kos, free_plan(), 0);
  else raise exception 'Tindakan tidak dikenal'; end if;
  insert into admin_log(actor_email, action, kos_id, kos_name, detail)
  values (actor_email(), 'override', p_kos, k.name, jsonb_build_object('tindakan', p_action, 'paket', p_plan, 'nilai', p_value, 'alasan', trim(p_reason)));
end $$;

-- Daftar untuk Management Center (izin pembayaran, bukan hanya Super Admin)
drop function if exists public.admin_list_requests();
create or replace function public.admin_list_requests()
returns table(id uuid, kos_id uuid, kos_name text, owner_email text, plan text, plan_name text, months integer, amount numeric, method text, note text,
              status text, created_at timestamptz, number text, kind text, decided_at timestamptz)
language plpgsql stable security definer set search_path = public, auth as $$
begin
  if not admin_can('payments.view') then raise exception 'Tidak punya izin melihat pembayaran'; end if;
  return query
  select r.id, r.kos_id, k.name, u.email::text, r.plan, p.name, r.months, r.amount, r.method, r.note, r.status, r.created_at, r.number, r.kind, r.decided_at
  from plan_requests r join kos k on k.id = r.kos_id left join auth.users u on u.id = r.user_id left join plans p on p.key = r.plan
  order by (r.status = 'menunggu') desc, r.created_at desc
  limit 300;
end $$;

drop function if exists public.admin_list_kos();
create or replace function public.admin_list_kos()
returns table(id uuid, name text, owner_email text, created_at timestamptz, plan text, trial_until date, paid_until date, effective_plan text, plan_name text,
              rooms integer, active_leases integer, business_type text, next_plan text, next_until date, cancel_at_end boolean)
language plpgsql stable security definer set search_path = public, auth as $$
begin
  if not admin_can('payments.view') then raise exception 'Tidak punya izin melihat langganan'; end if;
  return query
  select k.id, k.name, u.email::text, k.created_at, k.plan, k.trial_until, k.paid_until, kos_plan(k.id), (select pp.name from plans pp where pp.key = kos_plan(k.id)),
    (select count(*)::int from rooms r where r.kos_id = k.id),
    (select count(*)::int from leases l where l.kos_id = k.id and l.status = 'aktif'),
    k.business_type, k.next_plan, k.next_until, k.cancel_at_end
  from kos k join auth.users u on u.id = k.owner_id
  order by k.created_at desc;
end $$;

-- ---------- Pricing Plan Manager (Super Admin) ----------
create or replace function public.role_perms(p_role text)
returns text[] language sql immutable as $$
  select case p_role
    when 'super_admin' then array['dashboard.view','finance.view','customers.view','customers.note','customers.message','customers.override',
                                  'customers.suspend','customers.assist','payments.view','payments.verify','audit.view','staff.manage','system.view',
                                  'tickets.view','tickets.reply','announce.manage','templates.manage','plans.manage']
    when 'support'     then array['customers.view','customers.note','customers.message','customers.assist','payments.view','tickets.view','tickets.reply']
    when 'operations'  then array['dashboard.view','customers.view','customers.note','customers.message','tickets.view','tickets.reply','announce.manage','templates.manage']
    when 'finance'     then array['dashboard.view','finance.view','payments.view','payments.verify','customers.view']
    when 'developer'   then array['system.view','audit.view','tickets.view']
    else array[]::text[] end;
$$;

create or replace function public.admin_plans()
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if not admin_can('payments.view') then raise exception 'Tidak punya izin'; end if;
  return jsonb_build_object(
    'grace_days', setting_int('grace_days', 0),
    'trial_plan', setting_text('trial_plan', 'pro'),
    'codes', to_jsonb(plan_feature_codes()),
    'plans', (select coalesce(jsonb_agg(jsonb_build_object('key', p.key, 'name', p.name, 'tagline', p.tagline, 'active', p.active, 'public', p.public,
        'is_free', p.is_free, 'sort', p.sort,
        'subscribers', (select count(*) from kos k where kos_plan(k.id) = p.key and (k.paid_until is not null or p.is_free)),
        'versions', (select jsonb_agg(to_jsonb(v) order by v.version desc) from plan_versions v where v.plan_key = p.key)) order by p.sort), '[]') from plans p));
end $$;

create or replace function public.admin_plan_save(p_key text, p_name text, p_tagline text, p_active boolean, p_public boolean, p_sort int)
returns void language plpgsql security definer set search_path = public as $$
declare v_old plans; v_key text := lower(trim(p_key));
begin
  if not admin_can('plans.manage') then raise exception 'Khusus Super Admin'; end if;
  select * into v_old from plans where key = v_key;
  if v_old.key is null then
    insert into plans(key, name, tagline, active, public, sort) values (v_key, trim(p_name), nullif(trim(p_tagline), ''), coalesce(p_active, true), coalesce(p_public, true), coalesce(p_sort, 9));
    insert into plan_versions(plan_key, version, price, note, created_by) values (v_key, 1, 0, 'Paket baru — atur harga & fitur', actor_email());
    insert into admin_log(actor_email, action, detail) values (actor_email(), 'paket_baru', jsonb_build_object('paket', v_key, 'nama', trim(p_name)));
  else
    if v_old.is_free and not coalesce(p_active, true) then raise exception 'Paket gratis tidak bisa dinonaktifkan'; end if;
    update plans set name = trim(p_name), tagline = nullif(trim(p_tagline), ''), active = coalesce(p_active, active), public = coalesce(p_public, public), sort = coalesce(p_sort, sort) where key = v_key;
    insert into admin_log(actor_email, action, detail) values (actor_email(), 'ubah_info_paket', jsonb_build_object('paket', v_key, 'nama', trim(p_name), 'aktif', p_active, 'tampil', p_public));
  end if;
end $$;

-- Perubahan harga/fitur/batas = versi baru (riwayat tersimpan). Pelanggan yang sudah bayar tetap sampai masa aktifnya habis.
create or replace function public.admin_plan_version(p_key text, p_price numeric, p_limits jsonb, p_features text[], p_renewal text, p_note text)
returns int language plpgsql security definer set search_path = public as $$
declare v_prev plan_versions; v_ver int; v_limits jsonb := '{}'; k text;
begin
  if not admin_can('plans.manage') then raise exception 'Khusus Super Admin'; end if;
  if not exists (select 1 from plans where key = p_key) then raise exception 'Paket tidak dikenal'; end if;
  if p_price is null or p_price < 0 then raise exception 'Harga tidak valid'; end if;
  if (select is_free from plans where key = p_key) and p_price <> 0 then raise exception 'Paket gratis harus Rp 0'; end if;
  if coalesce(length(trim(p_note)), 0) < 5 then raise exception 'Tuliskan alasan perubahan (minimal 5 huruf)'; end if;
  if not (coalesce(p_features, '{}') <@ plan_feature_codes()) then raise exception 'Ada fitur yang tidak dikenal'; end if;
  for k in select jsonb_object_keys(coalesce(p_limits, '{}')) loop
    if k not in ('kamar_terisi', 'karyawan') then raise exception 'Batas tidak dikenal: %', k; end if;
    if p_limits ->> k is not null and p_limits ->> k <> '' then
      if (p_limits ->> k)::int < 0 then raise exception 'Batas tidak boleh minus'; end if;
      v_limits := v_limits || jsonb_build_object(k, (p_limits ->> k)::int);
    end if;
  end loop;
  select * into v_prev from plan_versions where plan_key = p_key order by version desc limit 1;
  v_ver := coalesce(v_prev.version, 0) + 1;
  insert into plan_versions(plan_key, version, price, limits, features, renewal, note, created_by)
  values (p_key, v_ver, p_price, v_limits, coalesce(p_features, '{}'), coalesce(p_renewal, 'harga_baru'), trim(p_note), actor_email());
  insert into admin_log(actor_email, action, detail) values (actor_email(), 'ubah_harga',
    jsonb_build_object('paket', p_key, 'versi', v_ver, 'harga_lama', v_prev.price, 'harga_baru', p_price, 'perpanjangan', p_renewal, 'alasan', trim(p_note)));
  return v_ver;
end $$;

create or replace function public.admin_setting_save(p_key text, p_value jsonb)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not admin_can('plans.manage') then raise exception 'Khusus Super Admin'; end if;
  if p_key = 'grace_days' then
    if (p_value #>> '{}')::int not between 0 and 30 then raise exception 'Masa tenggang 0–30 hari'; end if;
  elsif p_key = 'trial_plan' then
    if not exists (select 1 from plans where key = p_value #>> '{}') then raise exception 'Paket masa coba tidak dikenal'; end if;
  else raise exception 'Pengaturan tidak dikenal'; end if;
  insert into platform_settings(key, value, updated_at) values (p_key, p_value, now()) on conflict (key) do update set value = excluded.value, updated_at = now();
  insert into admin_log(actor_email, action, detail) values (actor_email(), 'ubah_pengaturan', jsonb_build_object('kunci', p_key, 'nilai', p_value));
end $$;

-- ---------- Fitur/batas yang dulu tertulis langsung di fungsi → entitlement ----------
do $$
declare r record; v_def text; v_new text;
begin
  for r in select * from (values
    ('public.portal_get(text)', 'if kos_plan(k.id) <> ''pro'' then', 'if not plan_has(k.id, ''portal_penghuni'') then'),
    ('public.portal_submit_payment(text,uuid,numeric,date,text,text,text)', 'if kos_plan(o.kos_id) <> ''pro'' then', 'if not plan_has(o.kos_id, ''portal_penghuni'') then'),
    ('public.portal_ai_tick(text,integer)', 'kos_plan(o.kos_id) <> ''pro''', 'not plan_has(o.kos_id, ''portal_penghuni'')'),
    ('public.retail_alert_batch()', 'kos_plan(k.id) in (''standar'', ''pro'')', 'plan_has(k.id, ''email_toko'')'),
    ('public.start_lease(uuid,uuid,date,numeric,date,date)', 'if kos_plan(v_kos) = ''gratis'' and (select count(*) from leases where kos_id = v_kos and status = ''aktif'') >= 5 then
    raise exception ''BATAS_GRATIS: Paket Gratis maksimal 5 kamar terisi. Upgrade ke Standar untuk kamar tanpa batas.'';',
     'if plan_limit(v_kos, ''kamar_terisi'') is not null and (select count(*) from leases where kos_id = v_kos and status = ''aktif'') >= plan_limit(v_kos, ''kamar_terisi'') then
    raise exception ''BATAS_GRATIS: Paket % maksimal % kamar terisi. Upgrade paket untuk menambah kamar terisi.'', (select name from plans where key = kos_plan(v_kos)), plan_limit(v_kos, ''kamar_terisi'');'),
    ('public.reminder_batch()', 'kos_plan(k.id) as plan, u.email as owner_email', 'kos_plan(k.id) as plan, u.email as owner_email, plan_has(k.id, ''pengingat_email'') as can_remind, plan_has(k.id, ''portal_penghuni'') as can_portal')
  ) t(fn, old, new) loop
    v_def := pg_get_functiondef(r.fn::regprocedure);
    if position(r.old in v_def) = 0 then raise exception 'Potongan tidak ditemukan di %', r.fn; end if;
    v_new := replace(v_def, r.old, r.new);
    execute v_new;
  end loop;
end $$;

create or replace function public.team_limit(p_kos uuid)
returns int language sql stable security definer set search_path = public as $$
  select coalesce(plan_limit(p_kos, 'karyawan'), 1000);
$$;

revoke execute on function public.plan_feature_codes(), public.setting_int(text, int), public.setting_text(text, text), public.plan_current(text), public.free_plan(),
  public.plan_has(uuid, text), public.plan_limit(uuid, text), public.my_entitlements(), public.plan_unit_price(uuid, text), public.plan_quote(uuid), public.plan_roll(uuid),
  public.request_plan(uuid, text, integer, text, text), public.plan_cancel(uuid, boolean), public.admin_set_plan(uuid, text, integer, uuid),
  public.admin_list_requests(), public.admin_list_kos(), public.admin_plans(), public.admin_plan_save(text, text, text, boolean, boolean, int),
  public.admin_plan_version(text, numeric, jsonb, text[], text, text), public.admin_setting_save(text, jsonb) from public, anon;
grant execute on function public.plan_has(uuid, text), public.plan_limit(uuid, text), public.my_entitlements(), public.plan_quote(uuid),
  public.request_plan(uuid, text, integer, text, text), public.plan_cancel(uuid, boolean), public.admin_set_plan(uuid, text, integer, uuid),
  public.admin_list_requests(), public.admin_list_kos(), public.admin_plans(), public.admin_plan_save(text, text, text, boolean, boolean, int),
  public.admin_plan_version(text, numeric, jsonb, text[], text, text), public.admin_setting_save(text, jsonb), public.plan_feature_codes() to authenticated;
revoke execute on function public.plans_public() from public;
grant execute on function public.plans_public() to anon, authenticated;
