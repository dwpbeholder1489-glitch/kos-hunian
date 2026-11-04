-- Notifikasi pemilik (ringkasan mingguan & bulanan, riwayat) + admin ringan (catatan internal, catatan aktivitas, detail pelanggan).

-- ---------- Preferensi ringkasan ----------
alter table public.kos add column if not exists weekly_summary boolean not null default false;
alter table public.kos add column if not exists monthly_summary boolean not null default true;
grant update (name, address, contact_phone, payment_info, house_rules, notify_email, daily_digest, qris_image, wa_reminder_tpl, wa_portal_tpl, onboarding_emails, weekly_summary, monthly_summary) on public.kos to authenticated;

-- Ringkasan yang sudah terkirim (satu per kos per jenis per periode)
create table if not exists public.summary_log (
  kos_id uuid not null references public.kos(id) on delete cascade,
  kind text not null check (kind in ('mingguan','bulanan')),
  period text not null,
  sent_at timestamptz not null default now(),
  primary key (kos_id, kind, period)
);
alter table public.summary_log enable row level security;

-- Angka ringkasan untuk satu rentang tanggal (sama dengan perhitungan menu Laporan). Hanya untuk server.
create or replace function public.summary_batch(p_kind text, p_from date, p_to date, p_prev_from date, p_prev_to date)
returns jsonb language sql stable security definer set search_path = public, auth as $$
  with t as (select (now() at time zone 'Asia/Jakarta')::date as d),
  money as (
    select k.id as kos_id,
      coalesce((select sum(p.amount) from payments p where p.kos_id = k.id and p.status = 'terverifikasi' and p.paid_at between p_from and p_to), 0)
        + coalesce((select sum(c.amount) from cash_entries c where c.kos_id = k.id and c.kind = 'pendapatan_lain' and c.date between p_from and p_to), 0) as income,
      (select count(*) from payments p where p.kos_id = k.id and p.status = 'terverifikasi' and p.paid_at between p_from and p_to)::int as pay_count,
      coalesce((select sum(e.amount) from expenses e where e.kos_id = k.id and e.kind = 'operasional' and e.date between p_from and p_to), 0) as ops,
      coalesce((select sum(e.amount) from expenses e where e.kos_id = k.id and e.kind <> 'operasional' and e.date between p_from and p_to), 0) as other_exp,
      (select count(*) from expenses e where e.kos_id = k.id and e.date between p_from and p_to)::int as exp_count,
      coalesce((select sum(p.amount) from payments p where p.kos_id = k.id and p.status = 'terverifikasi' and p.paid_at between p_prev_from and p_prev_to), 0)
        + coalesce((select sum(c.amount) from cash_entries c where c.kos_id = k.id and c.kind = 'pendapatan_lain' and c.date between p_prev_from and p_prev_to), 0) as prev_income,
      coalesce((select sum(e.amount) from expenses e where e.kos_id = k.id and e.kind = 'operasional' and e.date between p_prev_from and p_prev_to), 0) as prev_ops,
      exists (select 1 from payments p where p.kos_id = k.id and p.paid_at between p_prev_from and p_prev_to)
        or exists (select 1 from expenses e where e.kos_id = k.id and e.date between p_prev_from and p_prev_to) as has_prev
    from kos k
  )
  select coalesce(jsonb_agg(row_to_json(x)), '[]'::jsonb) from (
    select k.id as kos_id, k.name as kos_name, u.email::text as owner_email, k.email_token,
      m.income, m.pay_count, m.ops, m.other_exp, m.exp_count, m.prev_income, m.prev_ops, m.has_prev,
      (select count(*) from rooms r where r.kos_id = k.id and r.status <> 'tidak_disewakan')::int as rooms,
      (select count(*) from leases l where l.kos_id = k.id and l.status = 'aktif')::int as occupied,
      (select count(*) from payments p where p.kos_id = k.id and p.status = 'menunggu')::int as pending,
      (select count(*) from invoice_summary s where s.kos_id = k.id and s.overdue)::int as overdue_count,
      coalesce((select sum(s.outstanding) from invoice_summary s where s.kos_id = k.id and s.status <> 'batal' and s.outstanding > 0 and s.due_date <= t.d), 0) as outstanding,
      (select coalesce(jsonb_agg(row_to_json(o)), '[]'::jsonb) from (
         select oc.name, r.code as room, sum(s.outstanding) as amount, min(s.due_date) as since
         from invoice_summary s join occupants oc on oc.id = s.occupant_id join rooms r on r.id = s.room_id
         where s.kos_id = k.id and s.status <> 'batal' and s.outstanding > 0 and s.due_date <= t.d
         group by oc.name, r.code order by min(s.due_date) limit 10) o) as unpaid
    from kos k
    join auth.users u on u.id = k.owner_id
    join money m on m.kos_id = k.id
    cross join t
    where (p_kind = 'mingguan' and k.weekly_summary) or (p_kind = 'bulanan' and k.monthly_summary)
  ) x;
$$;
revoke execute on function public.summary_batch(text, date, date, date, date) from public, anon, authenticated;
grant execute on function public.summary_batch(text, date, date, date, date) to service_role;

-- Riwayat email yang dikirim Kos Hunian ke pemilik kos ini (untuk halaman Notifikasi)
create or replace function public.notification_history(p_kos uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if not is_member(p_kos) then raise exception 'Akses ditolak'; end if;
  return (select coalesce(jsonb_agg(row_to_json(h) order by h.at desc), '[]'::jsonb) from (
    select * from (
      select 'Daftar tagih harian' as what, (day::timestamp + interval '7 hours') at time zone 'Asia/Jakarta' as at from digest_log where kos_id = p_kos
      union all select 'Ringkasan ' || kind || ' ' || period, sent_at from summary_log where kos_id = p_kos
      union all select 'Email arahan (' || kind || ')', sent_at from onboarding_email_log where kos_id = p_kos
    ) a order by at desc limit 30) h);
end $$;
revoke execute on function public.notification_history(uuid) from public, anon;
grant execute on function public.notification_history(uuid) to authenticated;

-- ---------- Admin: catatan internal & catatan aktivitas ----------
create table if not exists public.admin_notes (
  id uuid primary key default gen_random_uuid(),
  kos_id uuid not null references public.kos(id) on delete cascade,
  author_email text,
  body text not null check (length(body) between 1 and 2000),
  created_at timestamptz not null default now()
);
alter table public.admin_notes enable row level security;

create table if not exists public.admin_log (
  id bigint generated always as identity primary key,
  actor_email text,
  action text not null,
  kos_id uuid references public.kos(id) on delete set null,
  kos_name text,
  detail jsonb,
  created_at timestamptz not null default now()
);
create index if not exists admin_log_kos on public.admin_log(kos_id, created_at desc);
alter table public.admin_log enable row level security;

create or replace function public.actor_email()
returns text language sql stable security definer set search_path = public, auth as $$
  select coalesce((select email::text from auth.users where id = auth.uid()), 'sistem');
$$;
revoke execute on function public.actor_email() from public, anon, authenticated;

-- Setiap perubahan paket kos tercatat otomatis (dari admin maupun persetujuan pembayaran)
create or replace function public.log_kos_plan() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if (old.plan, old.paid_until, old.trial_until) is distinct from (new.plan, new.paid_until, new.trial_until) then
    insert into admin_log(actor_email, action, kos_id, kos_name, detail) values (actor_email(), 'ubah_paket', new.id, new.name,
      jsonb_build_object('sebelum', jsonb_build_object('paket', old.plan, 'bayar_sampai', old.paid_until, 'coba_sampai', old.trial_until),
                         'sesudah', jsonb_build_object('paket', new.plan, 'bayar_sampai', new.paid_until, 'coba_sampai', new.trial_until)));
  end if;
  return new;
end $$;
drop trigger if exists kos_plan_log on public.kos;
create trigger kos_plan_log after update on public.kos for each row execute function public.log_kos_plan();

create or replace function public.log_plan_request() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if old.status is distinct from new.status then
    insert into admin_log(actor_email, action, kos_id, kos_name, detail)
    select actor_email(), case when new.status = 'disetujui' then 'setujui_pembayaran' else 'tolak_pembayaran' end, new.kos_id, k.name,
      jsonb_build_object('paket', new.plan, 'bulan', new.months, 'jumlah', new.amount, 'metode', new.method)
    from kos k where k.id = new.kos_id;
  end if;
  return new;
end $$;
drop trigger if exists plan_request_log on public.plan_requests;
create trigger plan_request_log after update on public.plan_requests for each row execute function public.log_plan_request();

-- Detail satu pelanggan (tanpa data pribadi penghuni). Membuka profil ikut tercatat.
create or replace function public.admin_customer(p_kos uuid)
returns jsonb language plpgsql security definer set search_path = public, auth as $$
declare v jsonb;
begin
  if not is_admin() then raise exception 'Khusus admin'; end if;
  select jsonb_build_object(
    'kos', jsonb_build_object('id', k.id, 'name', k.name, 'address', k.address, 'created_at', k.created_at, 'plan', k.plan,
           'effective_plan', kos_plan(k.id), 'trial_until', k.trial_until, 'paid_until', k.paid_until,
           'contact_phone', k.contact_phone, 'owner_email', u.email, 'onboarding_emails', k.onboarding_emails,
           'weekly_summary', k.weekly_summary, 'monthly_summary', k.monthly_summary, 'daily_digest', k.daily_digest),
    'counts', jsonb_build_object(
           'rooms', (select count(*) from rooms where kos_id = k.id),
           'active_leases', (select count(*) from leases where kos_id = k.id and status = 'aktif'),
           'occupants', (select count(*) from occupants where kos_id = k.id),
           'payments', (select count(*) from payments where kos_id = k.id),
           'expenses', (select count(*) from expenses where kos_id = k.id)),
    'requests', (select coalesce(jsonb_agg(jsonb_build_object('plan', r.plan, 'months', r.months, 'amount', r.amount, 'status', r.status, 'created_at', r.created_at) order by r.created_at desc), '[]') from plan_requests r where r.kos_id = k.id),
    'notes', (select coalesce(jsonb_agg(jsonb_build_object('body', n.body, 'author', n.author_email, 'created_at', n.created_at) order by n.created_at desc), '[]') from admin_notes n where n.kos_id = k.id),
    'emails', (select coalesce(jsonb_agg(row_to_json(e) order by e.at desc), '[]') from (
                 select 'Email arahan (' || kind || ')' as what, sent_at as at from onboarding_email_log where kos_id = k.id
                 union all select 'Ringkasan ' || kind || ' ' || period, sent_at from summary_log where kos_id = k.id) e),
    'log', (select coalesce(jsonb_agg(jsonb_build_object('action', l.action, 'actor', l.actor_email, 'detail', l.detail, 'created_at', l.created_at) order by l.created_at desc), '[]')
            from (select * from admin_log where kos_id = k.id and action <> 'buka_profil' order by created_at desc limit 20) l)
  ) into v
  from kos k join auth.users u on u.id = k.owner_id where k.id = p_kos;
  if v is null then raise exception 'Kos tidak ditemukan'; end if;
  insert into admin_log(actor_email, action, kos_id, kos_name) values (actor_email(), 'buka_profil', p_kos, v->'kos'->>'name');
  return v;
end $$;

create or replace function public.admin_add_note(p_kos uuid, p_body text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not is_admin() then raise exception 'Khusus admin'; end if;
  if coalesce(trim(p_body), '') = '' then raise exception 'Catatan kosong'; end if;
  insert into admin_notes(kos_id, author_email, body) values (p_kos, actor_email(), trim(p_body));
  insert into admin_log(actor_email, action, kos_id, kos_name) select actor_email(), 'tambah_catatan', p_kos, name from kos where id = p_kos;
end $$;

-- Dipanggil saat admin membuka WhatsApp/email ke pelanggan dari aplikasi
create or replace function public.admin_record(p_action text, p_kos uuid, p_detail jsonb default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not is_admin() then raise exception 'Khusus admin'; end if;
  if p_action not in ('kirim_wa', 'kirim_email') then raise exception 'Tindakan tidak dikenal'; end if;
  insert into admin_log(actor_email, action, kos_id, kos_name, detail) select actor_email(), p_action, p_kos, name, p_detail from kos where id = p_kos;
end $$;

create or replace function public.admin_log_list(p_limit int default 100)
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if not is_admin() then raise exception 'Khusus admin'; end if;
  return (select coalesce(jsonb_agg(row_to_json(l) order by l.created_at desc), '[]'::jsonb)
          from (select actor_email, action, kos_id, kos_name, detail, created_at from admin_log order by created_at desc limit least(greatest(p_limit, 1), 500)) l);
end $$;

revoke execute on function public.admin_customer(uuid), public.admin_add_note(uuid, text), public.admin_record(text, uuid, jsonb), public.admin_log_list(int) from public, anon;
grant execute on function public.admin_customer(uuid), public.admin_add_note(uuid, text), public.admin_record(text, uuid, jsonb), public.admin_log_list(int) to authenticated;
