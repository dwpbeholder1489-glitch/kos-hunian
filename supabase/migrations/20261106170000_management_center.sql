-- PRASARA Management Center bagian 1: peran admin (RBAC), dashboard bisnis, data pelanggan + kronologi + skor kesehatan,
-- override akses dengan alasan, catatan audit. Hak akses selalu diperiksa di database, bukan hanya di tampilan.

-- ---------- Staf & peran ----------
create table if not exists public.admin_staff (
  email text primary key check (email = lower(trim(email)) and position('@' in email) > 1),
  role text not null check (role in ('super_admin', 'support', 'operations', 'finance', 'developer')),
  active boolean not null default true,
  added_by text,
  created_at timestamptz not null default now()
);
alter table public.admin_staff enable row level security;   -- hanya lewat fungsi
insert into public.admin_staff(email, role, added_by)
select lower(email), 'super_admin', 'sistem' from public.app_admins on conflict (email) do nothing;

-- Peran pengguna yang sedang login (null = bukan staf)
create or replace function public.admin_role()
returns text language sql stable security definer set search_path = public, auth as $$
  select s.role from admin_staff s join auth.users u on lower(u.email) = s.email where u.id = auth.uid() and s.active
  union all
  select 'super_admin' from app_admins a join auth.users u on lower(u.email) = lower(a.email) where u.id = auth.uid()
  limit 1;
$$;

-- Izin per modul & tindakan. Tambah peran baru cukup di sini.
create or replace function public.role_perms(p_role text)
returns text[] language sql immutable as $$
  select case p_role
    when 'super_admin' then array['dashboard.view','finance.view','customers.view','customers.note','customers.message','customers.override',
                                  'payments.view','payments.verify','audit.view','staff.manage','system.view']
    when 'support'     then array['customers.view','customers.note','customers.message','payments.view']
    when 'operations'  then array['dashboard.view','customers.view','customers.note','customers.message']
    when 'finance'     then array['dashboard.view','finance.view','payments.view','payments.verify','customers.view']
    when 'developer'   then array['system.view','audit.view']
    else array[]::text[] end;
$$;

create or replace function public.admin_can(p_perm text)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(p_perm = any(role_perms(admin_role())), false);
$$;

create or replace function public.admin_me()
returns jsonb language sql stable security definer set search_path = public, auth as $$
  select case when admin_role() is null then null else
    jsonb_build_object('role', admin_role(), 'perms', to_jsonb(role_perms(admin_role())), 'email', (select email from auth.users where id = auth.uid())) end;
$$;

-- is_admin() tetap berarti Super Admin (fungsi lama: ubah paket, verifikasi pembayaran, dll.)
create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select admin_role() = 'super_admin';
$$;

create or replace function public.admin_staff_list()
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if not admin_can('staff.manage') then raise exception 'Khusus Super Admin'; end if;
  return (select coalesce(jsonb_agg(row_to_json(s) order by s.created_at), '[]'::jsonb) from admin_staff s);
end $$;

create or replace function public.admin_staff_save(p_email text, p_role text, p_active boolean)
returns void language plpgsql security definer set search_path = public as $$
declare v_email text := lower(trim(p_email)); v_old admin_staff;
begin
  if not admin_can('staff.manage') then raise exception 'Khusus Super Admin'; end if;
  if v_email = lower((select email from auth.users where id = auth.uid())) then raise exception 'Tidak bisa mengubah peran Anda sendiri'; end if;
  if v_email in (select lower(email) from app_admins) then raise exception 'Pemilik platform selalu Super Admin'; end if;
  select * into v_old from admin_staff where email = v_email;
  insert into admin_staff(email, role, active, added_by) values (v_email, p_role, coalesce(p_active, true), actor_email())
  on conflict (email) do update set role = excluded.role, active = excluded.active;
  insert into admin_log(actor_email, action, detail)
  values (actor_email(), 'ubah_staf', jsonb_build_object('email', v_email, 'sebelum', case when v_old.email is null then null else jsonb_build_object('peran', v_old.role, 'aktif', v_old.active) end,
                                                          'sesudah', jsonb_build_object('peran', p_role, 'aktif', coalesce(p_active, true))));
end $$;

-- ---------- Dashboard bisnis ----------
create or replace function public.admin_overview()
returns jsonb language plpgsql stable security definer set search_path = public, auth as $$
declare v_today date := (now() at time zone 'Asia/Jakarta')::date; r jsonb; v_fin boolean := admin_can('finance.view');
begin
  if not admin_can('dashboard.view') then raise exception 'Tidak punya izin melihat dashboard'; end if;
  with b as (
    select k.*, kos_plan(k.id) as eff, (k.paid_until is not null and k.paid_until >= v_today and k.plan in ('standar', 'pro')) as paying,
           (k.trial_until is not null and k.trial_until >= v_today and not (k.paid_until is not null and k.paid_until >= v_today)) as trial
    from kos k where not is_admin_owner(k.id))
  select jsonb_build_object(
    'accounts', (select count(distinct owner_id) from b),
    'businesses', (select count(*) from b),
    'by_type', (select coalesce(jsonb_object_agg(business_type, n), '{}'::jsonb) from (select business_type, count(*) n from b group by 1) t),
    'plans', jsonb_build_object('trial', (select count(*) from b where trial), 'gratis', (select count(*) from b where not trial and not paying),
                                'standar', (select count(*) from b where paying and plan = 'standar'), 'pro', (select count(*) from b where paying and plan = 'pro')),
    'new_30', (select count(*) from b where created_at >= now() - interval '30 days'),
    'new_prev_30', (select count(*) from b where created_at >= now() - interval '60 days' and created_at < now() - interval '30 days'),
    'trial_ending', (select count(*) from b where trial and trial_until - v_today <= 3),
    'expiring', (select count(*) from b where paying and paid_until - v_today <= 7),
    'expired', (select count(*) from b where paid_until is not null and paid_until < v_today),
    'pending_payments', (select count(*) from plan_requests where status = 'menunggu'),
    'pending_old', (select count(*) from plan_requests where status = 'menunggu' and created_at < now() - interval '24 hours'),
    'rooms', (select count(*) from rooms r join b on b.id = r.kos_id where r.status <> 'tidak_disewakan'),
    'occupied', (select count(*) from leases l join b on b.id = l.kos_id where l.status = 'aktif'),
    'products', (select count(*) from products p join b on b.id = p.kos_id where p.active),
    'mrr', case when v_fin then (select coalesce(sum(plan_price(plan, 1)), 0) from b where paying) end,
    'revenue_30', case when v_fin then (select coalesce(sum(amount), 0) from plan_requests where status = 'disetujui' and decided_at >= now() - interval '30 days') end,
    'revenue_prev_30', case when v_fin then (select coalesce(sum(amount), 0) from plan_requests where status = 'disetujui' and decided_at >= now() - interval '60 days' and decided_at < now() - interval '30 days') end
  ) into r;
  return r;
end $$;

-- ---------- Pelanggan (per bisnis), sinyal untuk skor kesehatan ----------
create or replace function public.admin_customers()
returns jsonb language plpgsql stable security definer set search_path = public, auth as $$
declare v_today date := (now() at time zone 'Asia/Jakarta')::date;
begin
  if not admin_can('customers.view') then raise exception 'Tidak punya izin melihat pelanggan'; end if;
  return (select coalesce(jsonb_agg(row_to_json(x) order by x.created_at desc), '[]'::jsonb) from (
    select k.id, k.name, k.business_type, k.created_at, u.email::text as owner_email, k.contact_phone,
      kos_plan(k.id) as plan, (k.paid_until is not null and k.paid_until >= v_today and k.plan <> 'gratis') as paid,
      case when k.trial_until is null then null else (k.trial_until - v_today)::int end as trial_left, k.paid_until,
      (v_today - (k.created_at at time zone 'Asia/Jakarta')::date)::int as age_days,
      a.last_at as last_activity, (v_today - (a.last_at at time zone 'Asia/Jakarta')::date)::int as idle_days,
      -- Properti
      exists (select 1 from rooms r where r.kos_id = k.id and coalesce(r.rent, 0) > 0) as rooms_priced,
      exists (select 1 from leases l where l.kos_id = k.id) as has_lease,
      exists (select 1 from payments p where p.kos_id = k.id and p.created_at >= now() - interval '30 days') as pay_30,
      exists (select 1 from payments p where p.kos_id = k.id) as has_payment,
      (select count(*)::int from leases l where l.kos_id = k.id and l.status = 'aktif') as active_leases,
      (select count(*)::int from rooms r where r.kos_id = k.id) as rooms,
      -- Retail
      (select count(*)::int from products p where p.kos_id = k.id and p.active) as products,
      exists (select 1 from sales s where s.kos_id = k.id and s.sold_at >= now() - interval '30 days') as sale_30,
      exists (select 1 from sales s where s.kos_id = k.id) as has_sale,
      exists (select 1 from purchases b2 where b2.kos_id = k.id) as has_purchase,
      -- Bersama
      exists (select 1 from expenses e where e.kos_id = k.id) or exists (select 1 from cash_entries c where c.kos_id = k.id) as has_money,
      (select count(*)::int from admin_notes n where n.kos_id = k.id) as notes
    from kos k
    join auth.users u on u.id = k.owner_id
    cross join lateral (select greatest(k.created_at,
        (select max(created_at) from leases where kos_id = k.id), (select max(created_at) from payments where kos_id = k.id),
        (select max(created_at) from expenses where kos_id = k.id), (select max(created_at) from cash_entries where kos_id = k.id),
        (select max(created_at) from occupants where kos_id = k.id), (select max(sold_at) from sales where kos_id = k.id),
        (select max(created_at) from purchases where kos_id = k.id), (select max(created_at) from stock_moves where kos_id = k.id),
        (select max(created_at) from products where kos_id = k.id)) as last_at) a
    where not is_admin_owner(k.id)
  ) x);
end $$;

-- ---------- Detail pelanggan + kronologi (tanpa data pribadi penghuni/pelanggan toko) ----------
create or replace function public.admin_customer(p_kos uuid)
returns jsonb language plpgsql security definer set search_path = public, auth as $$
declare v jsonb;
begin
  if not admin_can('customers.view') then raise exception 'Tidak punya izin melihat pelanggan'; end if;
  select jsonb_build_object(
    'kos', jsonb_build_object('id', k.id, 'name', k.name, 'address', k.address, 'created_at', k.created_at, 'plan', k.plan, 'business_type', k.business_type,
           'effective_plan', kos_plan(k.id), 'trial_until', k.trial_until, 'paid_until', k.paid_until,
           'contact_phone', k.contact_phone, 'owner_email', u.email, 'onboarding_emails', k.onboarding_emails,
           'weekly_summary', k.weekly_summary, 'monthly_summary', k.monthly_summary, 'daily_digest', k.daily_digest),
    'counts', jsonb_build_object(
           'rooms', (select count(*) from rooms where kos_id = k.id),
           'active_leases', (select count(*) from leases where kos_id = k.id and status = 'aktif'),
           'occupants', (select count(*) from occupants where kos_id = k.id),
           'payments', (select count(*) from payments where kos_id = k.id),
           'expenses', (select count(*) from expenses where kos_id = k.id),
           'products', (select count(*) from products where kos_id = k.id and active),
           'sales', (select count(*) from sales where kos_id = k.id and status = 'selesai'),
           'purchases', (select count(*) from purchases where kos_id = k.id and status <> 'batal'),
           'other_businesses', (select count(*) from kos k2 where k2.owner_id = k.owner_id and k2.id <> k.id)),
    'requests', (select coalesce(jsonb_agg(jsonb_build_object('plan', r.plan, 'months', r.months, 'amount', r.amount, 'status', r.status, 'created_at', r.created_at) order by r.created_at desc), '[]') from plan_requests r where r.kos_id = k.id),
    'notes', (select coalesce(jsonb_agg(jsonb_build_object('body', n.body, 'author', n.author_email, 'created_at', n.created_at) order by n.created_at desc), '[]') from admin_notes n where n.kos_id = k.id),
    'emails', (select coalesce(jsonb_agg(row_to_json(e) order by e.at desc), '[]') from (
                 select 'Email arahan (' || kind || ')' as what, sent_at as at from onboarding_email_log where kos_id = k.id
                 union all select 'Ringkasan ' || kind || ' ' || period, sent_at from summary_log where kos_id = k.id) e),
    'timeline', (select coalesce(jsonb_agg(row_to_json(t) order by t.at), '[]') from (
                 select k.created_at as at, 'Mendaftar & membuat bisnis' as what
                 union all select min(created_at), 'Penghuni pertama dimasukkan' from leases where kos_id = k.id having min(created_at) is not null
                 union all select min(created_at), 'Pembayaran pertama dicatat' from payments where kos_id = k.id having min(created_at) is not null
                 union all select min(created_at), 'Barang pertama ditambahkan' from products where kos_id = k.id having min(created_at) is not null
                 union all select min(sold_at), 'Penjualan pertama di kasir' from sales where kos_id = k.id having min(sold_at) is not null
                 union all select min(created_at), 'Belanja pertama dicatat' from purchases where kos_id = k.id having min(created_at) is not null
                 union all select min(created_at), 'Pengeluaran pertama dicatat' from expenses where kos_id = k.id having min(created_at) is not null
                 union all select created_at, 'Mengajukan langganan ' || plan || ' ' || months || ' bln (' || status || ')' from plan_requests where kos_id = k.id
                 union all select created_at, case action when 'ubah_paket' then 'Paket diubah' when 'override' then 'Override akses: ' || coalesce(detail->>'alasan', '') else action end
                   from admin_log where kos_id = k.id and action in ('ubah_paket', 'override')
                 union all select sent_at, 'Email arahan terkirim (' || kind || ')' from onboarding_email_log where kos_id = k.id) t),
    'log', (select coalesce(jsonb_agg(jsonb_build_object('action', l.action, 'actor', l.actor_email, 'detail', l.detail, 'created_at', l.created_at) order by l.created_at desc), '[]')
            from (select * from admin_log where kos_id = k.id and action <> 'buka_profil' order by created_at desc limit 30) l)
  ) into v
  from kos k join auth.users u on u.id = k.owner_id where k.id = p_kos;
  if v is null then raise exception 'Bisnis tidak ditemukan'; end if;
  insert into admin_log(actor_email, action, kos_id, kos_name) values (actor_email(), 'buka_profil', p_kos, v->'kos'->>'name');
  return v;
end $$;

create or replace function public.admin_add_note(p_kos uuid, p_body text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not admin_can('customers.note') then raise exception 'Tidak punya izin menulis catatan'; end if;
  if coalesce(trim(p_body), '') = '' then raise exception 'Catatan kosong'; end if;
  insert into admin_notes(kos_id, author_email, body) values (p_kos, actor_email(), trim(p_body));
  insert into admin_log(actor_email, action, kos_id, kos_name) select actor_email(), 'tambah_catatan', p_kos, name from kos where id = p_kos;
end $$;

create or replace function public.admin_record(p_action text, p_kos uuid, p_detail jsonb default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not admin_can('customers.message') then raise exception 'Tidak punya izin menghubungi pelanggan'; end if;
  if p_action not in ('kirim_wa', 'kirim_email') then raise exception 'Tindakan tidak dikenal'; end if;
  insert into admin_log(actor_email, action, kos_id, kos_name, detail) select actor_email(), p_action, p_kos, name, p_detail from kos where id = p_kos;
end $$;

create or replace function public.admin_log_list(p_limit int default 100)
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if not admin_can('audit.view') then raise exception 'Tidak punya izin melihat catatan audit'; end if;
  return (select coalesce(jsonb_agg(row_to_json(l) order by l.created_at desc), '[]'::jsonb)
          from (select actor_email, action, kos_id, kos_name, detail, created_at from admin_log order by created_at desc limit least(greatest(p_limit, 1), 500)) l);
end $$;

-- ---------- Override akses manual (wajib alasan, tercatat) ----------
-- p_action: 'tambah_coba' (p_value = hari), 'beri_paket' (p_plan standar/pro, p_value = bulan), 'jadikan_gratis'
create or replace function public.admin_override(p_kos uuid, p_action text, p_plan text, p_value int, p_reason text)
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
    if p_plan not in ('standar', 'pro') or p_value is null or p_value < 1 or p_value > 24 then raise exception 'Paket atau durasi tidak valid'; end if;
    perform admin_set_plan(p_kos, p_plan, p_value);
  elsif p_action = 'jadikan_gratis' then
    perform admin_set_plan(p_kos, 'gratis', 0);
  else raise exception 'Tindakan tidak dikenal'; end if;
  insert into admin_log(actor_email, action, kos_id, kos_name, detail)
  values (actor_email(), 'override', p_kos, k.name, jsonb_build_object('tindakan', p_action, 'paket', p_plan, 'nilai', p_value, 'alasan', trim(p_reason)));
end $$;

revoke execute on function public.admin_role(), public.admin_can(text), public.role_perms(text) from public, anon;
grant execute on function public.admin_role(), public.admin_can(text), public.admin_me(), public.admin_staff_list(), public.admin_staff_save(text, text, boolean),
  public.admin_overview(), public.admin_customers(), public.admin_customer(uuid), public.admin_override(uuid, text, text, int, text) to authenticated;
revoke execute on function public.admin_me(), public.admin_staff_list(), public.admin_staff_save(text, text, boolean), public.admin_overview(),
  public.admin_customers(), public.admin_override(uuid, text, text, int, text) from anon;
