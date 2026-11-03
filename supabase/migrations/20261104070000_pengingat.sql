-- =====================================================================
-- Pengingat jatuh tempo: email otomatis ke penghuni & daftar tagih harian ke pemilik
-- =====================================================================

alter table public.occupants
  add column if not exists email text,
  add column if not exists email_reminders boolean not null default true;

alter table public.kos add column if not exists daily_digest boolean not null default true;
grant update (name, address, contact_phone, payment_info, house_rules, notify_email, daily_digest) on public.kos to authenticated;

-- Catatan pengiriman agar email yang sama tidak terkirim dua kali
create table if not exists public.reminder_log (
  invoice_id uuid not null references public.invoices(id) on delete cascade,
  kind text not null check (kind in ('h-3','h0','h+3')),
  sent_at timestamptz not null default now(),
  primary key (invoice_id, kind)
);
alter table public.reminder_log enable row level security;

create table if not exists public.digest_log (
  kos_id uuid not null references public.kos(id) on delete cascade,
  day date not null,
  sent_at timestamptz not null default now(),
  primary key (kos_id, day)
);
alter table public.digest_log enable row level security;

-- Penghuni mengisi / menghapus email pengingat sendiri lewat portal
create or replace function public.portal_set_email(p_token text, p_email text)
returns text language plpgsql security definer set search_path = public as $$
declare o record; v text := nullif(lower(trim(p_email)), '');
begin
  select * into o from occupants where portal_token = p_token and length(p_token) >= 20;
  if o.id is null then raise exception 'Link tidak valid'; end if;
  if v is not null and v !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'Format email tidak valid'; end if;
  update occupants set email = coalesce(v, email), email_reminders = (v is not null) where id = o.id;
  return v;
end $$;
grant execute on function public.portal_set_email(text, text) to anon, authenticated;

-- portal_get: tambahkan info email pengingat penghuni
create or replace function public.portal_get(p_token text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare o record; k record; l record; v_today date := (now() at time zone 'Asia/Jakarta')::date;
begin
  if coalesce(length(p_token), 0) < 20 then return null; end if;
  select * into o from occupants where portal_token = p_token;
  if o.id is null then return null; end if;
  select * into k from kos where id = o.kos_id;
  if kos_plan(k.id) <> 'pro' then
    return jsonb_build_object('locked', true, 'kos', jsonb_build_object('name', k.name, 'contact_phone', k.contact_phone));
  end if;
  select le.*, r.code as room_code, r.facilities into l
    from leases le join rooms r on r.id = le.room_id
    where le.occupant_id = o.id order by (le.status = 'aktif') desc, le.start_date desc limit 1;
  return jsonb_build_object(
    'locked', false,
    'today', v_today,
    'kos', jsonb_build_object('name', k.name, 'address', k.address, 'contact_phone', k.contact_phone,
                              'payment_info', k.payment_info, 'house_rules', k.house_rules),
    'occupant', jsonb_build_object('name', o.name, 'email', case when o.email_reminders then o.email end),
    'lease', case when l.id is null then null else jsonb_build_object(
        'room', l.room_code, 'rent', l.rent, 'start_date', l.start_date, 'end_date', l.end_date,
        'status', l.status, 'facilities', l.facilities) end,
    'invoices', coalesce((select jsonb_agg(x order by x.due_date desc) from (
        select s.id, s.kind, s.period_start, s.period_end, s.due_date, s.amount, s.description,
               s.paid, s.pending, s.outstanding, s.pay_state, s.overdue
        from invoice_summary s where s.occupant_id = o.id and s.status <> 'batal'
        order by s.due_date desc limit 24) x), '[]'::jsonb),
    'payments', coalesce((select jsonb_agg(y order by y.paid_at desc) from (
        select p.id, p.invoice_id, p.amount, p.paid_at, p.method, p.status, p.source
        from payments p join invoices i on i.id = p.invoice_id
        where i.occupant_id = o.id order by p.paid_at desc limit 24) y), '[]'::jsonb),
    'vacant_rooms', coalesce((select jsonb_agg(z order by z.code) from (
        select r.code, r.rent, r.facilities from rooms r where r.kos_id = k.id and r.status = 'tersedia') z), '[]'::jsonb)
  );
end $$;

-- Data untuk pengiriman harian (dipanggil server dengan kunci rahasia)
create or replace function public.reminder_batch()
returns jsonb language sql stable security definer set search_path = public, auth as $$
  with t as (select (now() at time zone 'Asia/Jakarta')::date as d)
  select coalesce(jsonb_agg(row_to_json(x)), '[]'::jsonb) from (
    select s.id as invoice_id, s.kos_id, s.kind, s.description, s.period_start, s.period_end, s.due_date,
           s.amount, s.outstanding, (s.due_date - t.d) as days_left,
           o.id as occupant_id, o.name as occupant_name, o.phone as occupant_phone,
           case when o.email_reminders then o.email end as occupant_email, o.portal_token,
           r.code as room_code,
           k.name as kos_name, k.contact_phone, k.payment_info, k.daily_digest,
           kos_plan(k.id) as plan, u.email as owner_email
    from invoice_summary s
    cross join t
    join occupants o on o.id = s.occupant_id
    join rooms r on r.id = s.room_id
    join kos k on k.id = s.kos_id
    join auth.users u on u.id = k.owner_id
    where s.status <> 'batal' and s.outstanding > 0 and s.due_date <= t.d + 3
  ) x;
$$;
revoke execute on function public.reminder_batch() from public, anon, authenticated;
grant execute on function public.reminder_batch() to service_role;
