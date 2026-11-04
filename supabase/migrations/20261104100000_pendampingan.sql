-- Pendampingan pengguna baru: email arahan otomatis selama masa coba + status pelanggan untuk admin.

alter table public.kos add column if not exists onboarding_emails boolean not null default true;
alter table public.kos add column if not exists email_token text not null default replace(gen_random_uuid()::text, '-', '');
create unique index if not exists kos_email_token_idx on public.kos (email_token);

grant update (name, address, contact_phone, payment_info, house_rules, notify_email, daily_digest, qris_image, wa_reminder_tpl, wa_portal_tpl, onboarding_emails) on public.kos to authenticated;

-- Catatan email arahan yang sudah terkirim (satu jenis sekali per kos). Hanya dibaca server.
create table if not exists public.onboarding_email_log (
  kos_id uuid not null references public.kos(id) on delete cascade,
  kind text not null,
  sent_at timestamptz not null default now(),
  primary key (kos_id, kind)
);
alter table public.onboarding_email_log enable row level security;

-- Ringkasan kemajuan setiap kos (dipakai cron & halaman admin). Tidak bisa dipanggil langsung dari aplikasi.
create or replace function public.onboarding_rows()
returns table(kos_id uuid, kos_name text, owner_email text, email_token text, onboarding_emails boolean,
              age_days int, trial_left int, paid boolean, plan text,
              rooms_priced boolean, has_lease boolean, has_payment boolean, has_expense boolean, has_info boolean,
              active_leases int, last_activity timestamptz, idle_days int,
              sent_kinds text[], last_sent timestamptz)
language sql stable security definer set search_path = public, auth as $$
  with t as (select (now() at time zone 'Asia/Jakarta')::date as d)
  select k.id, k.name, u.email::text, k.email_token, k.onboarding_emails,
    (t.d - (k.created_at at time zone 'Asia/Jakarta')::date)::int,
    case when k.trial_until is null then null else (k.trial_until - t.d)::int end,
    (k.paid_until is not null and k.paid_until >= t.d and k.plan <> 'gratis'),
    kos_plan(k.id),
    exists (select 1 from rooms r where r.kos_id = k.id and coalesce(r.rent, 0) > 0),
    exists (select 1 from leases l where l.kos_id = k.id),
    exists (select 1 from payments p where p.kos_id = k.id),
    exists (select 1 from expenses e where e.kos_id = k.id),
    (nullif(trim(coalesce(k.contact_phone, '')), '') is not null or nullif(trim(coalesce(k.payment_info, '')), '') is not null),
    (select count(*)::int from leases l where l.kos_id = k.id and l.status = 'aktif'),
    a.last_at,
    (t.d - (a.last_at at time zone 'Asia/Jakarta')::date)::int,
    coalesce((select array_agg(g.kind order by g.sent_at) from onboarding_email_log g where g.kos_id = k.id), '{}'),
    (select max(g.sent_at) from onboarding_email_log g where g.kos_id = k.id)
  from kos k
  join auth.users u on u.id = k.owner_id
  cross join t
  cross join lateral (
    select greatest(k.created_at,
      (select max(created_at) from leases where kos_id = k.id),
      (select max(created_at) from payments where kos_id = k.id),
      (select max(created_at) from expenses where kos_id = k.id),
      (select max(created_at) from cash_entries where kos_id = k.id),
      (select max(created_at) from occupants where kos_id = k.id)) as last_at
  ) a
  where not is_admin_owner(k.id);
$$;
revoke execute on function public.onboarding_rows() from public, anon, authenticated;

-- Untuk cron (kunci server)
create or replace function public.onboarding_batch()
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(row_to_json(x)), '[]'::jsonb) from onboarding_rows() x;
$$;
revoke execute on function public.onboarding_batch() from public, anon, authenticated;
grant execute on function public.onboarding_batch() to service_role;

-- Untuk halaman admin
create or replace function public.admin_onboarding()
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if not is_admin() then raise exception 'Khusus admin'; end if;
  return (select coalesce(jsonb_agg(row_to_json(x) order by x.age_days), '[]'::jsonb) from onboarding_rows() x);
end $$;
revoke execute on function public.admin_onboarding() from public, anon;
grant execute on function public.admin_onboarding() to authenticated;

-- Tautan "berhenti terima email arahan" (tanpa login)
create or replace function public.onboarding_unsubscribe(p_token text)
returns text language plpgsql security definer set search_path = public as $$
declare v_name text;
begin
  if p_token is null or length(p_token) < 20 then return null; end if;
  update kos set onboarding_emails = false where email_token = p_token returning name into v_name;
  return v_name;
end $$;
revoke execute on function public.onboarding_unsubscribe(text) from public;
grant execute on function public.onboarding_unsubscribe(text) to anon, authenticated;
