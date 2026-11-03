-- =====================================================================
-- KOS HUNIAN — skema database (Supabase / PostgreSQL)
-- Cara pakai: buka Supabase → SQL Editor → New query → tempel SEMUA isi
-- file ini → Run. Aman dijalankan sekali pada proyek yang masih kosong.
-- =====================================================================

create extension if not exists pgcrypto;

-- ---------- Kos (satu akun bisa punya beberapa kos) ----------
create table public.kos (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  address text,
  owner_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table public.kos_members (
  kos_id uuid not null references public.kos(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'pemilik' check (role in ('pemilik','pengelola')),
  created_at timestamptz not null default now(),
  primary key (kos_id, user_id)
);

-- Apakah user yang sedang login anggota kos ini?
create or replace function public.is_member(p_kos uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from kos_members where kos_id = p_kos and user_id = auth.uid());
$$;

-- ---------- Data operasional ----------
create table public.rooms (
  id uuid primary key default gen_random_uuid(),
  kos_id uuid not null references public.kos(id) on delete cascade,
  code text not null,
  name text,
  rent numeric(14,2),
  status text not null default 'tersedia'
    check (status in ('tersedia','terisi','perbaikan','tidak_disewakan')),
  facilities text[] not null default '{}',
  notes text,
  created_at timestamptz not null default now(),
  unique (kos_id, code)
);

create table public.occupants (
  id uuid primary key default gen_random_uuid(),
  kos_id uuid not null references public.kos(id) on delete cascade,
  name text not null,
  phone text,
  emergency text,
  notes text,
  created_at timestamptz not null default now()
);

create table public.leases (
  id uuid primary key default gen_random_uuid(),
  kos_id uuid not null references public.kos(id) on delete cascade,
  room_id uuid not null references public.rooms(id) on delete restrict,
  occupant_id uuid not null references public.occupants(id) on delete restrict,
  start_date date not null,
  end_date date,
  rent numeric(14,2) not null check (rent > 0),
  billing_start date not null,
  status text not null default 'aktif' check (status in ('aktif','selesai')),
  end_reason text,
  created_at timestamptz not null default now(),
  check (billing_start >= start_date),
  check (end_date is null or end_date >= start_date)
);
-- satu kamar / satu penghuni hanya boleh punya satu sewa aktif
create unique index leases_one_active_room on public.leases(room_id) where status = 'aktif';
create unique index leases_one_active_occ on public.leases(occupant_id) where status = 'aktif';

create table public.invoices (
  id uuid primary key default gen_random_uuid(),
  kos_id uuid not null references public.kos(id) on delete cascade,
  lease_id uuid not null references public.leases(id) on delete cascade,
  room_id uuid not null references public.rooms(id) on delete restrict,
  occupant_id uuid not null references public.occupants(id) on delete restrict,
  kind text not null default 'sewa' check (kind in ('sewa','tambahan')),
  period_start date not null,
  period_end date not null,
  due_date date not null,
  amount numeric(14,2) not null check (amount > 0),
  description text,
  status text not null default 'terbit' check (status in ('terbit','batal')),
  cancel_reason text,
  created_at timestamptz not null default now()
);
-- tagihan sewa tidak boleh dobel untuk periode yang sama
create unique index invoices_one_rent_period on public.invoices(lease_id, period_start) where kind = 'sewa';

create table public.payments (
  id uuid primary key default gen_random_uuid(),
  kos_id uuid not null references public.kos(id) on delete cascade,
  invoice_id uuid not null references public.invoices(id) on delete cascade,
  amount numeric(14,2) not null check (amount > 0),
  paid_at date not null,
  method text not null default 'tunai' check (method in ('tunai','transfer','ewallet','lainnya')),
  ref text,
  notes text,
  status text not null default 'terverifikasi'
    check (status in ('menunggu','terverifikasi','ditolak','dibatalkan')),
  verified_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.expense_categories (
  id uuid primary key default gen_random_uuid(),
  kos_id uuid not null references public.kos(id) on delete cascade,
  name text not null,
  kind text not null default 'operasional' check (kind in ('operasional','modal','non_operasional')),
  unique (kos_id, name)
);

create table public.expenses (
  id uuid primary key default gen_random_uuid(),
  kos_id uuid not null references public.kos(id) on delete cascade,
  date date not null,
  category_id uuid references public.expense_categories(id) on delete set null,
  kind text not null default 'operasional' check (kind in ('operasional','modal','non_operasional')),
  amount numeric(14,2) not null check (amount > 0),
  description text,
  created_at timestamptz not null default now()
);

create index on public.rooms(kos_id);
create index on public.occupants(kos_id);
create index on public.leases(kos_id);
create index on public.invoices(kos_id, due_date);
create index on public.payments(kos_id, paid_at);
create index on public.payments(invoice_id);
create index on public.expenses(kos_id, date);

-- pembayaran selalu ikut kos dari tagihannya (mencegah data nyasar ke kos lain)
create or replace function public.payments_set_kos() returns trigger language plpgsql as $$
begin
  select kos_id into new.kos_id from public.invoices where id = new.invoice_id;
  return new;
end $$;
create trigger payments_set_kos before insert or update of invoice_id on public.payments
  for each row execute function public.payments_set_kos();

-- ---------- Keamanan: setiap pemilik hanya melihat data kosnya ----------
alter table public.kos enable row level security;
alter table public.kos_members enable row level security;
alter table public.rooms enable row level security;
alter table public.occupants enable row level security;
alter table public.leases enable row level security;
alter table public.invoices enable row level security;
alter table public.payments enable row level security;
alter table public.expense_categories enable row level security;
alter table public.expenses enable row level security;

create policy kos_select on public.kos for select using (public.is_member(id));
create policy kos_update on public.kos for update using (owner_id = auth.uid());
create policy kos_delete on public.kos for delete using (owner_id = auth.uid());
create policy members_select on public.kos_members for select using (user_id = auth.uid() or public.is_member(kos_id));

do $$
declare t text;
begin
  foreach t in array array['rooms','occupants','leases','invoices','payments','expense_categories','expenses'] loop
    execute format('create policy %1$s_all on public.%1$s for all using (public.is_member(kos_id)) with check (public.is_member(kos_id))', t);
  end loop;
end $$;

-- ---------- Ringkasan status tiap tagihan ----------
create or replace view public.invoice_summary with (security_invoker = true) as
select i.*,
  coalesce(sum(p.amount) filter (where p.status = 'terverifikasi'), 0)::numeric(14,2) as paid,
  coalesce(sum(p.amount) filter (where p.status = 'menunggu'), 0)::numeric(14,2) as pending,
  case when i.status = 'batal' then 0
       else greatest(0, i.amount - coalesce(sum(p.amount) filter (where p.status = 'terverifikasi'), 0)) end::numeric(14,2) as outstanding,
  case when i.status = 'batal' then 'batal'
       when coalesce(sum(p.amount) filter (where p.status = 'terverifikasi'), 0) >= i.amount then 'lunas'
       when coalesce(sum(p.amount) filter (where p.status = 'terverifikasi'), 0) > 0 then 'sebagian'
       else 'belum' end as pay_state,
  (i.status <> 'batal'
    and coalesce(sum(p.amount) filter (where p.status = 'terverifikasi'), 0) < i.amount
    and i.due_date < (now() at time zone 'Asia/Jakarta')::date) as overdue
from public.invoices i
left join public.payments p on p.invoice_id = i.id
group by i.id;

-- ---------- Membuat kos baru beserta kamar & kategori awal ----------
create or replace function public.create_kos(p_name text, p_address text, p_room_count int, p_prefix text default 'A')
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid; n int;
begin
  if auth.uid() is null then raise exception 'Harus login terlebih dahulu'; end if;
  if coalesce(trim(p_name),'') = '' then raise exception 'Nama kos wajib diisi'; end if;
  if p_room_count < 0 or p_room_count > 300 then raise exception 'Jumlah kamar 0–300'; end if;
  insert into kos(name, address, owner_id) values (trim(p_name), nullif(trim(p_address),''), auth.uid()) returning id into v_id;
  insert into kos_members(kos_id, user_id, role) values (v_id, auth.uid(), 'pemilik');
  for n in 1..p_room_count loop
    insert into rooms(kos_id, code) values (v_id, coalesce(nullif(trim(p_prefix),''),'A') || lpad(n::text, 2, '0'));
  end loop;
  insert into expense_categories(kos_id, name, kind) values
    (v_id,'Listrik dan air','operasional'),(v_id,'Internet','operasional'),(v_id,'Perbaikan','operasional'),
    (v_id,'Perlengkapan','operasional'),(v_id,'Kebersihan','operasional'),(v_id,'Renovasi','modal'),
    (v_id,'Pengembalian deposit','non_operasional');
  return v_id;
end $$;

-- ---------- Tagihan sewa otomatis (aman dipanggil berulang) ----------
create or replace function public.generate_invoices(p_kos uuid, p_days_ahead int default 7)
returns int language plpgsql security definer set search_path = public as $$
declare l record; k int; v_start date; v_next date; v_end date; v_until date; v_count int := 0; v_rows int;
begin
  if not is_member(p_kos) then raise exception 'Tidak punya akses ke kos ini'; end if;
  v_until := (now() at time zone 'Asia/Jakarta')::date + p_days_ahead;
  for l in select * from leases where kos_id = p_kos and status = 'aktif' loop
    for k in 0..239 loop
      v_start := (l.billing_start + make_interval(months => k))::date;
      exit when v_start > v_until;
      exit when l.end_date is not null and v_start >= l.end_date;
      v_next := (l.billing_start + make_interval(months => k + 1))::date;
      v_end := case when l.end_date is not null and l.end_date < v_next then l.end_date else v_next - 1 end;
      insert into invoices(kos_id, lease_id, room_id, occupant_id, kind, period_start, period_end, due_date, amount, description)
      values (p_kos, l.id, l.room_id, l.occupant_id, 'sewa', v_start, v_end, v_start, l.rent, 'Sewa bulanan')
      on conflict (lease_id, period_start) where kind = 'sewa' do nothing;
      get diagnostics v_rows = row_count;
      v_count := v_count + v_rows;
    end loop;
  end loop;
  return v_count;
end $$;

-- ---------- Mulai sewa: kamar jadi "terisi" ----------
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
  insert into leases(kos_id, room_id, occupant_id, start_date, end_date, rent, billing_start)
  values (v_kos, p_room, p_occupant, p_start, p_end, p_rent, coalesce(p_billing_start, p_start)) returning id into v_id;
  update rooms set status = 'terisi', rent = coalesce(rent, p_rent) where id = p_room;
  perform generate_invoices(v_kos, 7);
  return v_id;
end $$;

-- ---------- Akhiri sewa: kamar kembali "tersedia", tagihan masa depan dibatalkan ----------
create or replace function public.end_lease(p_lease uuid, p_end date, p_reason text default null)
returns void language plpgsql security definer set search_path = public as $$
declare l record;
begin
  select * into l from leases where id = p_lease for update;
  if l.id is null or not is_member(l.kos_id) then raise exception 'Sewa tidak ditemukan'; end if;
  if l.status <> 'aktif' then raise exception 'Sewa ini sudah berakhir'; end if;
  if p_end < l.start_date then raise exception 'Tanggal keluar tidak boleh sebelum tanggal masuk'; end if;
  update leases set status = 'selesai', end_date = p_end, end_reason = nullif(trim(p_reason),'') where id = p_lease;
  update rooms set status = 'tersedia' where id = l.room_id and status = 'terisi';
  update invoices i set status = 'batal', cancel_reason = 'Otomatis: sewa berakhir sebelum periode ini'
  where i.lease_id = p_lease and i.kind = 'sewa' and i.status = 'terbit' and i.period_start >= p_end
    and not exists (select 1 from payments p where p.invoice_id = i.id and p.status in ('terverifikasi','menunggu'));
end $$;

grant execute on function public.create_kos, public.generate_invoices, public.start_lease, public.end_lease to authenticated;
grant select on public.invoice_summary to authenticated;
