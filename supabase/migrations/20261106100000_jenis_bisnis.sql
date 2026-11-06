-- PRASARA Langkah 1: satu akun, banyak bisnis. Tabel kos dipakai sebagai "bisnis" dengan kolom jenis.
-- Data lama otomatis menjadi bisnis Properti & Sewa; semua fungsi kos tetap seperti sebelumnya.

alter table public.kos add column if not exists business_type text not null default 'properti';
do $$ begin
  alter table public.kos add constraint kos_business_type_check check (business_type in ('properti', 'retail'));
exception when duplicate_object then null; end $$;

-- Membuat bisnis baru sesuai jenisnya
create or replace function public.create_business(p_type text, p_name text, p_address text, p_room_count int default 0, p_prefix text default 'A')
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if auth.uid() is null then raise exception 'Harus login terlebih dahulu'; end if;
  if p_type = 'properti' then
    return create_kos(p_name, p_address, p_room_count, p_prefix);
  elsif p_type = 'retail' then
    if coalesce(trim(p_name), '') = '' then raise exception 'Nama usaha wajib diisi'; end if;
    insert into kos(name, address, owner_id, business_type) values (trim(p_name), nullif(trim(p_address), ''), auth.uid(), 'retail') returning id into v_id;
    insert into kos_members(kos_id, user_id, role) values (v_id, auth.uid(), 'pemilik');
    insert into expense_categories(kos_id, name, kind) values
      (v_id, 'Listrik dan air', 'operasional'), (v_id, 'Gaji karyawan', 'operasional'), (v_id, 'Sewa tempat', 'operasional'),
      (v_id, 'Transportasi', 'operasional'), (v_id, 'Kemasan / plastik', 'operasional'), (v_id, 'Perbaikan', 'operasional'),
      (v_id, 'Peralatan toko', 'modal');
    return v_id;
  else
    raise exception 'Jenis bisnis tidak dikenal';
  end if;
end $$;
revoke execute on function public.create_business(text, text, text, int, text) from public, anon;
grant execute on function public.create_business(text, text, text, int, text) to authenticated;

-- Ringkasan semua bisnis yang bisa diakses pengguna ini (halaman "Semua bisnis")
create or replace function public.owner_overview()
returns jsonb language sql stable security definer set search_path = public as $$
  with t as (select (now() at time zone 'Asia/Jakarta')::date as d),
  m as (select date_trunc('month', d)::date as m0, (date_trunc('month', d) + interval '1 month - 1 day')::date as m1, d from t)
  select coalesce(jsonb_agg(row_to_json(x) order by x.created_at), '[]'::jsonb) from (
    select k.id, k.name, k.business_type, k.created_at, kos_plan(k.id) as plan,
      (select count(*) from rooms r where r.kos_id = k.id and r.status <> 'tidak_disewakan')::int as rooms,
      (select count(*) from leases l where l.kos_id = k.id and l.status = 'aktif')::int as occupied,
      coalesce((select sum(s.outstanding) from invoice_summary s where s.kos_id = k.id and s.status <> 'batal' and s.outstanding > 0 and s.due_date <= m.d), 0) as outstanding,
      (select count(*) from invoice_summary s where s.kos_id = k.id and s.overdue)::int as overdue,
      (select count(*) from payments p where p.kos_id = k.id and p.status = 'menunggu')::int as pending,
      coalesce((select sum(p.amount) from payments p where p.kos_id = k.id and p.status = 'terverifikasi' and p.paid_at between m.m0 and m.m1), 0)
        + coalesce((select sum(c.amount) from cash_entries c where c.kos_id = k.id and c.kind = 'pendapatan_lain' and c.date between m.m0 and m.m1), 0) as income,
      coalesce((select sum(e.amount) from expenses e where e.kos_id = k.id and e.kind = 'operasional' and e.date between m.m0 and m.m1), 0) as ops
    from kos k cross join m
    where is_member(k.id)
  ) x;
$$;
revoke execute on function public.owner_overview() from public, anon;
grant execute on function public.owner_overview() to authenticated;

-- Email arahan & status pelanggan: tambahkan jenis bisnis (email arahan kos hanya untuk bisnis Properti)
drop function if exists public.onboarding_rows();
create function public.onboarding_rows()
returns table(kos_id uuid, kos_name text, owner_email text, email_token text, onboarding_emails boolean,
              age_days int, trial_left int, paid boolean, plan text,
              rooms_priced boolean, has_lease boolean, has_payment boolean, has_expense boolean, has_info boolean,
              active_leases int, last_activity timestamptz, idle_days int,
              sent_kinds text[], last_sent timestamptz, business_type text)
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
    (select max(g.sent_at) from onboarding_email_log g where g.kos_id = k.id),
    k.business_type
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
