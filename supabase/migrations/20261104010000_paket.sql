-- =====================================================================
-- Paket langganan: Gratis / Standar / Pro, masa coba 30 hari, admin
-- =====================================================================

-- ---------- Paket per kos ----------
alter table public.kos
  add column if not exists plan text not null default 'gratis' check (plan in ('gratis','standar','pro')),
  add column if not exists trial_until date,
  add column if not exists paid_until date;

-- kos yang sudah ada mendapat masa coba 30 hari sejak dibuat
update public.kos set trial_until = (created_at at time zone 'Asia/Jakarta')::date + 30 where trial_until is null;

-- kos baru otomatis mendapat masa coba 30 hari
alter table public.kos alter column trial_until set default ((now() at time zone 'Asia/Jakarta')::date + 30);

-- pemilik hanya boleh mengubah nama & alamat, bukan paket
revoke update on public.kos from authenticated;
grant update (name, address) on public.kos to authenticated;

-- Paket yang sedang berlaku: berbayar aktif → paket itu; masih masa coba → pro; selain itu → gratis
create or replace function public.kos_plan(p_kos uuid)
returns text language sql stable security definer set search_path = public as $$
  select case
    when k.paid_until is not null and k.paid_until >= (now() at time zone 'Asia/Jakarta')::date and k.plan <> 'gratis' then k.plan
    when k.trial_until is not null and k.trial_until >= (now() at time zone 'Asia/Jakarta')::date then 'pro'
    else 'gratis' end
  from kos k where k.id = p_kos;
$$;

-- ---------- Batas paket Gratis: maksimal 5 kamar terisi ----------
create or replace function public.start_lease(p_room uuid, p_occupant uuid, p_start date, p_rent numeric, p_billing_start date, p_end date default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_kos uuid; v_status text; v_id uuid;
begin
  select kos_id, status into v_kos, v_status from rooms where id = p_room for update;
  if v_kos is null or not is_member(v_kos) then raise exception 'Kamar tidak ditemukan'; end if;
  if v_status <> 'tersedia' then raise exception 'Kamar ini sedang tidak tersedia'; end if;
  if not exists (select 1 from occupants where id = p_occupant and kos_id = v_kos) then raise exception 'Penghuni tidak ditemukan'; end if;
  if exists (select 1 from leases where occupant_id = p_occupant and status = 'aktif') then
    raise exception 'Penghuni ini masih punya sewa aktif di kamar lain'; end if;
  if kos_plan(v_kos) = 'gratis' and (select count(*) from leases where kos_id = v_kos and status = 'aktif') >= 5 then
    raise exception 'BATAS_GRATIS: Paket Gratis maksimal 5 kamar terisi. Upgrade ke Standar untuk kamar tanpa batas.';
  end if;
  insert into leases(kos_id, room_id, occupant_id, start_date, end_date, rent, billing_start)
  values (v_kos, p_room, p_occupant, p_start, p_end, p_rent, coalesce(p_billing_start, p_start)) returning id into v_id;
  update rooms set status = 'terisi', rent = coalesce(rent, p_rent) where id = p_room;
  perform generate_invoices(v_kos, 7);
  return v_id;
end $$;

-- ---------- Admin aplikasi (pemilik SaaS) ----------
create table if not exists public.app_admins (
  email text primary key
);
alter table public.app_admins enable row level security;
insert into public.app_admins(email) values ('dwpbeholder1489@gmail.com') on conflict do nothing;

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public, auth as $$
  select exists (
    select 1 from app_admins a join auth.users u on lower(u.email) = lower(a.email)
    where u.id = auth.uid()
  );
$$;

-- ---------- Permintaan pembayaran langganan ----------
create table if not exists public.plan_requests (
  id uuid primary key default gen_random_uuid(),
  kos_id uuid not null references public.kos(id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  plan text not null check (plan in ('standar','pro')),
  months int not null check (months in (1,3,6,12)),
  amount numeric(14,2) not null,
  method text not null default 'qris' check (method in ('qris','transfer')),
  note text,
  status text not null default 'menunggu' check (status in ('menunggu','disetujui','ditolak')),
  created_at timestamptz not null default now(),
  decided_at timestamptz
);
alter table public.plan_requests enable row level security;
create policy plan_requests_select on public.plan_requests for select using (public.is_member(kos_id) or public.is_admin());
grant select on public.plan_requests to authenticated;

-- harga resmi dihitung di server, bukan dari aplikasi
create or replace function public.plan_price(p_plan text, p_months int)
returns numeric language sql immutable as $$
  select (case p_plan when 'standar' then 100000 when 'pro' then 150000 end) * p_months;
$$;

create or replace function public.request_plan(p_kos uuid, p_plan text, p_months int, p_method text, p_note text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if not is_member(p_kos) then raise exception 'Tidak punya akses ke kos ini'; end if;
  if p_plan not in ('standar','pro') then raise exception 'Paket tidak dikenal'; end if;
  if p_months not in (1,3,6,12) then raise exception 'Durasi tidak valid'; end if;
  if exists (select 1 from plan_requests where kos_id = p_kos and status = 'menunggu') then
    raise exception 'Masih ada konfirmasi pembayaran yang menunggu diperiksa.'; end if;
  insert into plan_requests(kos_id, user_id, plan, months, amount, method, note)
  values (p_kos, auth.uid(), p_plan, p_months, plan_price(p_plan, p_months), coalesce(p_method,'qris'), nullif(trim(p_note),''))
  returning id into v_id;
  return v_id;
end $$;

-- Admin: daftar semua kos beserta pemilik & paket
create or replace function public.admin_list_kos()
returns table(id uuid, name text, owner_email text, created_at timestamptz, plan text, trial_until date, paid_until date,
              effective_plan text, rooms int, active_leases int)
language plpgsql stable security definer set search_path = public, auth as $$
begin
  if not is_admin() then raise exception 'Khusus admin'; end if;
  return query
  select k.id, k.name, u.email::text, k.created_at, k.plan, k.trial_until, k.paid_until, kos_plan(k.id),
    (select count(*)::int from rooms r where r.kos_id = k.id),
    (select count(*)::int from leases l where l.kos_id = k.id and l.status = 'aktif')
  from kos k join auth.users u on u.id = k.owner_id
  order by k.created_at desc;
end $$;

-- Admin: daftar permintaan pembayaran
create or replace function public.admin_list_requests()
returns table(id uuid, kos_id uuid, kos_name text, owner_email text, plan text, months int, amount numeric,
              method text, note text, status text, created_at timestamptz)
language plpgsql stable security definer set search_path = public, auth as $$
begin
  if not is_admin() then raise exception 'Khusus admin'; end if;
  return query
  select r.id, r.kos_id, k.name, u.email::text, r.plan, r.months, r.amount, r.method, r.note, r.status, r.created_at
  from plan_requests r join kos k on k.id = r.kos_id left join auth.users u on u.id = r.user_id
  order by (r.status = 'menunggu') desc, r.created_at desc
  limit 200;
end $$;

-- Admin: perpanjang / ubah paket. Masa aktif ditambahkan dari sisa masa aktif yang masih berjalan.
create or replace function public.admin_set_plan(p_kos uuid, p_plan text, p_months int)
returns date language plpgsql security definer set search_path = public as $$
declare v_today date := (now() at time zone 'Asia/Jakarta')::date; v_base date; v_until date; k record;
begin
  if not is_admin() then raise exception 'Khusus admin'; end if;
  select * into k from kos where id = p_kos for update;
  if k.id is null then raise exception 'Kos tidak ditemukan'; end if;
  if p_plan = 'gratis' then
    update kos set plan = 'gratis', paid_until = null, trial_until = least(coalesce(trial_until, v_today - 1), v_today - 1) where id = p_kos;
    return null;
  end if;
  if p_plan not in ('standar','pro') or p_months < 1 then raise exception 'Paket atau durasi tidak valid'; end if;
  v_base := case when k.plan = p_plan and k.paid_until is not null and k.paid_until >= v_today then k.paid_until else v_today end;
  v_until := (v_base + make_interval(months => p_months))::date;
  update kos set plan = p_plan, paid_until = v_until where id = p_kos;
  return v_until;
end $$;

-- Admin: setujui / tolak permintaan
create or replace function public.admin_decide_request(p_request uuid, p_approve boolean)
returns void language plpgsql security definer set search_path = public as $$
declare r record;
begin
  if not is_admin() then raise exception 'Khusus admin'; end if;
  select * into r from plan_requests where id = p_request for update;
  if r.id is null then raise exception 'Permintaan tidak ditemukan'; end if;
  if r.status <> 'menunggu' then raise exception 'Permintaan ini sudah diproses'; end if;
  if p_approve then perform admin_set_plan(r.kos_id, r.plan, r.months); end if;
  update plan_requests set status = case when p_approve then 'disetujui' else 'ditolak' end, decided_at = now() where id = p_request;
end $$;

grant execute on function public.kos_plan, public.is_admin, public.request_plan, public.plan_price,
  public.admin_list_kos, public.admin_list_requests, public.admin_set_plan, public.admin_decide_request to authenticated;
