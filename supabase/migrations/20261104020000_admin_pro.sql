-- Kos milik admin aplikasi (pemilik Kos Hunian) selalu mendapat paket Pro, tanpa langganan.

create or replace function public.is_admin_owner(p_kos uuid)
returns boolean language sql stable security definer set search_path = public, auth as $$
  select exists (
    select 1 from kos k
    join auth.users u on u.id = k.owner_id
    join app_admins a on lower(a.email) = lower(u.email)
    where k.id = p_kos
  );
$$;

create or replace function public.kos_plan(p_kos uuid)
returns text language sql stable security definer set search_path = public as $$
  select case
    when is_admin_owner(k.id) then 'pro'
    when k.paid_until is not null and k.paid_until >= (now() at time zone 'Asia/Jakarta')::date and k.plan <> 'gratis' then k.plan
    when k.trial_until is not null and k.trial_until >= (now() at time zone 'Asia/Jakarta')::date then 'pro'
    else 'gratis' end
  from kos k where k.id = p_kos;
$$;

-- Kolom hitungan yang bisa dibaca aplikasi: select('..., effective_plan, owner_is_admin')
create or replace function public.effective_plan(k public.kos)
returns text language sql stable security definer set search_path = public as $$
  select kos_plan(k.id);
$$;

create or replace function public.owner_is_admin(k public.kos)
returns boolean language sql stable security definer set search_path = public as $$
  select is_admin_owner(k.id);
$$;

grant execute on function public.is_admin_owner, public.effective_plan(public.kos), public.owner_is_admin(public.kos) to authenticated;
