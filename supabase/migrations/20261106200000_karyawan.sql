-- Karyawan per bisnis: undang lewat email, peran (pengelola / kasir / gudang / penjaga), nonaktifkan, hapus.
-- Izin ditegakkan di database:
--   * kebijakan RLS tabel memakai member_can(kos_id, 'area')
--   * fungsi RPC yang ada ditulis ulang otomatis: is_member(x) -> member_in('area', x)
--   PENTING: bila fungsi di daftar bawah didefinisikan ulang, pakai member_in('area', ...) bukan is_member(...).
-- Area: sell (kasir), stock (barang & belanja), finance (uang, laba, laporan), rent (kamar, penghuni, tagihan), team (karyawan & langganan).

-- ---------- Peran ----------
alter table public.kos_members drop constraint if exists kos_members_role_check;
alter table public.kos_members add constraint kos_members_role_check check (role in ('pemilik', 'pengelola', 'kasir', 'gudang', 'penjaga'));
alter table public.kos_members add column if not exists active boolean not null default true;
alter table public.kos_members add column if not exists added_at timestamptz not null default now();

create or replace function public.role_allows(p_role text, p_areas text)
returns boolean language sql immutable as $$
  select case
    when p_role is null then false
    when p_role = 'pemilik' then true
    when coalesce(p_areas, '') = '' then true
    else exists (select 1 from unnest(string_to_array(p_areas, ',')) a
                 where (p_role = 'pengelola' and a <> 'team')
                    or (p_role = 'kasir' and a = 'sell')
                    or (p_role = 'gudang' and a = 'stock')
                    or (p_role = 'penjaga' and a = 'rent'))
  end;
$$;

create or replace function public.member_role(p_kos uuid)
returns text language sql stable security definer set search_path = public as $$
  select m.role from kos_members m join kos k on k.id = m.kos_id
  where m.kos_id = p_kos and m.user_id = auth.uid() and m.active and k.suspended_at is null;
$$;

create or replace function public.member_can(p_kos uuid, p_areas text)
returns boolean language sql stable security definer set search_path = public as $$
  select role_allows(member_role(p_kos), p_areas);
$$;

-- is_member: anggota aktif (peran apa pun); member_in: anggota dengan peran yang boleh untuk salah satu area
create or replace function public.is_member(p_kos uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select member_role(p_kos) is not null;
$$;

create or replace function public.member_in(p_areas text, p_kos uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select role_allows(member_role(p_kos), p_areas);
$$;

create or replace function public.is_member_any(p_kos uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from kos_members where kos_id = p_kos and user_id = auth.uid() and active);
$$;

-- ---------- Kebijakan tabel per area ----------
do $$
declare t text;
begin
  foreach t in array array['rooms', 'occupants', 'leases', 'invoices', 'payments'] loop
    execute format('drop policy if exists %1$s_all on public.%1$s', t);
    execute format('create policy %1$s_all on public.%1$s for all using (public.member_can(kos_id, ''rent'')) with check (public.member_can(kos_id, ''rent''))', t);
  end loop;
  foreach t in array array['expense_categories', 'expenses', 'cash_entries'] loop
    execute format('drop policy if exists %1$s_all on public.%1$s', t);
    execute format('create policy %1$s_all on public.%1$s for all using (public.member_can(kos_id, ''finance'')) with check (public.member_can(kos_id, ''finance''))', t);
  end loop;
end $$;

drop policy if exists payment_proofs_select on public.payment_proofs;
create policy payment_proofs_select on public.payment_proofs for select using (public.member_can(kos_id, 'rent'));
drop policy if exists products_select on public.products;
create policy products_select on public.products for select using (public.member_can(kos_id, 'stock,finance'));
drop policy if exists stock_moves_select on public.stock_moves;
create policy stock_moves_select on public.stock_moves for select using (public.member_can(kos_id, 'stock,finance'));
drop policy if exists contacts_select on public.contacts;
create policy contacts_select on public.contacts for select using (public.member_can(kos_id, 'stock,finance'));
drop policy if exists sales_select on public.sales;
create policy sales_select on public.sales for select using (public.member_can(kos_id, 'finance'));
drop policy if exists sale_lines_select on public.sale_lines;
create policy sale_lines_select on public.sale_lines for select using (public.member_can(kos_id, 'finance'));
drop policy if exists purchases_select on public.purchases;
create policy purchases_select on public.purchases for select using (public.member_can(kos_id, 'stock,finance'));
drop policy if exists purchase_lines_select on public.purchase_lines;
create policy purchase_lines_select on public.purchase_lines for select using (public.member_can(kos_id, 'stock,finance'));
drop policy if exists debt_payments_select on public.debt_payments;
create policy debt_payments_select on public.debt_payments for select using (public.member_can(kos_id, 'finance'));
drop policy if exists members_select on public.kos_members;
create policy members_select on public.kos_members for select using (user_id = auth.uid() or public.member_can(kos_id, 'team'));

-- ---------- Area pada fungsi yang sudah ada: is_member(...) diganti member_in('area', ...) ----------
do $$
declare r record; v_def text;
begin
  for r in select * from (values
    ('public.contact_save(uuid, uuid, text, text, text)', 'sell,stock,finance'),
    ('public.debt_pay(uuid, uuid, uuid, numeric, text, date, text)', 'finance'),
    ('public.debt_payment_void(uuid, text)', 'finance'),
    ('public.end_lease(uuid, date, text)', 'rent'),
    ('public.start_lease(uuid, uuid, date, numeric, date, date)', 'rent'),
    ('public.generate_invoices(uuid, integer)', 'rent'),
    ('public.portal_link(uuid, boolean)', 'rent'),
    ('public.owner_overview()', 'finance'),
    ('public.product_save(uuid, uuid, text, text, numeric, numeric, jsonb, numeric)', 'stock'),
    ('public.product_set_active(uuid, boolean)', 'stock'),
    ('public.stock_adjust(uuid, text, numeric, text)', 'stock'),
    ('public.purchase_order_create(uuid, uuid, date, uuid, jsonb, text, date, text, date)', 'stock'),
    ('public.purchase_receive(uuid, jsonb, date, boolean)', 'stock'),
    ('public.purchase_void(uuid, text)', 'stock'),
    ('public.request_plan(uuid, text, integer, text, text)', 'team'),
    ('public.retail_ledger(uuid)', 'finance'),
    ('public.retail_report(uuid, date, date)', 'finance'),
    ('public.sale_create(uuid, uuid, text, jsonb, numeric, text, numeric, uuid, date, text)', 'sell'),
    ('public.sale_void(uuid, text)', 'finance')
  ) t(fn, area) loop
    v_def := pg_get_functiondef(r.fn::regprocedure);
    if position('is_member(' in v_def) = 0 then raise exception 'is_member tidak ditemukan di %', r.fn; end if;
    execute replace(v_def, 'is_member(', format('member_in(%L, ', r.area));
  end loop;
end $$;

-- ---------- Data untuk kasir tanpa harga modal ----------
create or replace function public.kasir_catalog(p_kos uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if not member_can(p_kos, 'sell') then raise exception 'Tidak punya akses kasir di bisnis ini'; end if;
  return jsonb_build_object(
    'products', (select coalesce(jsonb_agg(to_jsonb(p) - 'cost' order by p.name), '[]') from products p where p.kos_id = p_kos and p.active),
    'units', (select coalesce(jsonb_agg(to_jsonb(u)), '[]') from product_units u where u.kos_id = p_kos),
    'customers', (select coalesce(jsonb_agg(jsonb_build_object('id', c.id, 'name', c.name, 'phone', c.phone) order by c.name), '[]') from contacts c where c.kos_id = p_kos and c.kind = 'pelanggan'));
end $$;

-- Penjualan per hari: kasir hanya melihat penjualannya sendiri dan tanpa harga modal
create or replace function public.sales_day(p_kos uuid, p_date date)
returns jsonb language plpgsql stable security definer set search_path = public, auth as $$
declare v_fin boolean := member_can(p_kos, 'finance');
begin
  if not member_can(p_kos, 'sell,finance') then raise exception 'Tidak punya akses penjualan'; end if;
  return (select coalesce(jsonb_agg(case when v_fin then to_jsonb(s) else to_jsonb(s) - 'cost_total' end
                                    || jsonb_build_object('cashier', u.email, 'contact_name', c.name) order by s.sold_at desc), '[]')
          from sales s left join auth.users u on u.id = s.created_by left join contacts c on c.id = s.contact_id
          where s.kos_id = p_kos and s.sale_date = p_date and (v_fin or s.created_by = auth.uid()));
end $$;

create or replace function public.sale_detail(p_sale uuid)
returns jsonb language plpgsql stable security definer set search_path = public, auth as $$
declare s sales; v_fin boolean;
begin
  select * into s from sales where id = p_sale;
  if s.id is null or not member_can(s.kos_id, 'sell,finance') then raise exception 'Penjualan tidak ditemukan'; end if;
  v_fin := member_can(s.kos_id, 'finance');
  if not v_fin and s.created_by is distinct from auth.uid() then raise exception 'Penjualan tidak ditemukan'; end if;
  return jsonb_build_object(
    'sale', (case when v_fin then to_jsonb(s) else to_jsonb(s) - 'cost_total' end) || jsonb_build_object('cashier', (select email from auth.users where id = s.created_by)),
    'lines', (select coalesce(jsonb_agg(case when v_fin then to_jsonb(l) else to_jsonb(l) - 'cost' - 'cost_total' end), '[]') from sale_lines l where l.sale_id = s.id),
    'contact', (select to_jsonb(c) from contacts c where c.id = s.contact_id));
end $$;

-- ---------- Undangan & pengelolaan karyawan ----------
create table if not exists public.kos_invites (
  id uuid primary key default gen_random_uuid(),
  kos_id uuid not null references public.kos(id) on delete cascade,
  email text not null,
  role text not null,
  invited_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  unique (kos_id, email)
);
alter table public.kos_invites enable row level security; -- hanya lewat fungsi di bawah

create or replace function public.team_roles(p_type text)
returns text[] language sql immutable as $$
  select case when p_type = 'retail' then array['pengelola', 'kasir', 'gudang'] else array['pengelola', 'penjaga'] end;
$$;

-- Batas karyawan per paket (masa coba = Pro)
create or replace function public.team_limit(p_kos uuid)
returns int language sql stable security definer set search_path = public as $$
  select case kos_plan(p_kos) when 'gratis' then 1 when 'standar' then 3 else 1000 end;
$$;

create or replace function public.team_used(p_kos uuid)
returns int language sql stable security definer set search_path = public as $$
  select ((select count(*) from kos_members where kos_id = p_kos and role <> 'pemilik' and active)
        + (select count(*) from kos_invites where kos_id = p_kos and created_at > now() - interval '14 days'))::int;
$$;

create or replace function public.team_list(p_kos uuid)
returns jsonb language plpgsql stable security definer set search_path = public, auth as $$
begin
  if not member_can(p_kos, 'team') then raise exception 'Khusus pemilik bisnis'; end if;
  return jsonb_build_object(
    'limit', team_limit(p_kos), 'used', team_used(p_kos),
    'roles', team_roles((select business_type from kos where id = p_kos)),
    'members', (select coalesce(jsonb_agg(jsonb_build_object('user_id', m.user_id, 'email', u.email, 'role', m.role, 'active', m.active, 'added_at', m.added_at, 'me', m.user_id = auth.uid())
                                         order by m.role = 'pemilik' desc, m.active desc, m.added_at), '[]')
                from kos_members m join auth.users u on u.id = m.user_id where m.kos_id = p_kos),
    'invites', (select coalesce(jsonb_agg(jsonb_build_object('id', i.id, 'email', i.email, 'role', i.role, 'created_at', i.created_at, 'expired', i.created_at <= now() - interval '14 days') order by i.created_at desc), '[]')
                from kos_invites i where i.kos_id = p_kos));
end $$;

create or replace function public.team_invite(p_kos uuid, p_email text, p_role text)
returns void language plpgsql security definer set search_path = public, auth as $$
declare v_email text := lower(trim(coalesce(p_email, ''))); k kos;
begin
  if not member_can(p_kos, 'team') then raise exception 'Khusus pemilik bisnis'; end if;
  select * into k from kos where id = p_kos;
  if v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'Email tidak valid'; end if;
  if not (p_role = any (team_roles(k.business_type))) then raise exception 'Peran tidak tersedia untuk jenis bisnis ini'; end if;
  if exists (select 1 from kos_members m join auth.users u on u.id = m.user_id where m.kos_id = p_kos and lower(u.email) = v_email) then
    raise exception 'Email ini sudah terdaftar sebagai karyawan/pemilik. Ubah perannya di daftar.';
  end if;
  if not exists (select 1 from kos_invites where kos_id = p_kos and email = v_email and created_at > now() - interval '14 days')
     and team_used(p_kos) >= team_limit(p_kos) then
    raise exception 'Batas karyawan paket ini (%) sudah tercapai. Hapus yang tidak dipakai atau upgrade paket.', team_limit(p_kos);
  end if;
  insert into kos_invites(kos_id, email, role) values (p_kos, v_email, p_role)
  on conflict (kos_id, email) do update set role = excluded.role, created_at = now(), invited_by = auth.uid();
end $$;

create or replace function public.team_update(p_kos uuid, p_user uuid, p_role text, p_active boolean)
returns void language plpgsql security definer set search_path = public as $$
declare m kos_members;
begin
  if not member_can(p_kos, 'team') then raise exception 'Khusus pemilik bisnis'; end if;
  select * into m from kos_members where kos_id = p_kos and user_id = p_user for update;
  if m.user_id is null then raise exception 'Karyawan tidak ditemukan'; end if;
  if m.role = 'pemilik' then raise exception 'Pemilik tidak bisa diubah'; end if;
  if not (p_role = any (team_roles((select business_type from kos where id = p_kos)))) then raise exception 'Peran tidak tersedia'; end if;
  if p_active and not m.active and team_used(p_kos) >= team_limit(p_kos) then raise exception 'Batas karyawan paket ini sudah tercapai'; end if;
  update kos_members set role = p_role, active = p_active where kos_id = p_kos and user_id = p_user;
end $$;

-- Hapus email karyawan dari bisnis (akun login milik karyawan sendiri tidak dihapus)
create or replace function public.team_remove(p_kos uuid, p_user uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not member_can(p_kos, 'team') then raise exception 'Khusus pemilik bisnis'; end if;
  if exists (select 1 from kos_members where kos_id = p_kos and user_id = p_user and role = 'pemilik') then raise exception 'Pemilik tidak bisa dihapus'; end if;
  delete from kos_members where kos_id = p_kos and user_id = p_user;
end $$;

create or replace function public.team_invite_delete(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_kos uuid;
begin
  select kos_id into v_kos from kos_invites where id = p_id;
  if v_kos is null or not member_can(v_kos, 'team') then raise exception 'Undangan tidak ditemukan'; end if;
  delete from kos_invites where id = p_id;
end $$;

-- Bersihkan: hapus semua karyawan nonaktif dan undangan kedaluwarsa
create or replace function public.team_cleanup(p_kos uuid)
returns int language plpgsql security definer set search_path = public as $$
declare a int; b int;
begin
  if not member_can(p_kos, 'team') then raise exception 'Khusus pemilik bisnis'; end if;
  delete from kos_members where kos_id = p_kos and role <> 'pemilik' and not active; get diagnostics a = row_count;
  delete from kos_invites where kos_id = p_kos and created_at <= now() - interval '14 days'; get diagnostics b = row_count;
  return a + b;
end $$;

-- Dipanggil aplikasi setiap masuk: undangan untuk email ini otomatis diterima
create or replace function public.accept_invites()
returns int language plpgsql security definer set search_path = public, auth as $$
declare v_email text := lower((select email from auth.users where id = auth.uid())); n int;
begin
  if v_email is null then return 0; end if;
  insert into kos_members(kos_id, user_id, role, active)
  select i.kos_id, auth.uid(), i.role, true from kos_invites i
  where lower(i.email) = v_email and i.created_at > now() - interval '14 days'
  on conflict (kos_id, user_id) do update set role = case when kos_members.role = 'pemilik' then 'pemilik' else excluded.role end, active = true;
  get diagnostics n = row_count;
  delete from kos_invites where lower(email) = v_email and created_at > now() - interval '14 days';
  return n;
end $$;

-- Peran saya di setiap bisnis (untuk menu aplikasi)
create or replace function public.my_roles()
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_object_agg(kos_id, role), '{}'::jsonb) from kos_members where user_id = auth.uid() and active;
$$;

revoke execute on function public.role_allows(text, text), public.member_role(uuid), public.member_can(uuid, text), public.member_in(text, uuid), public.kasir_catalog(uuid), public.sales_day(uuid, date),
  public.sale_detail(uuid), public.team_roles(text), public.team_limit(uuid), public.team_used(uuid), public.team_list(uuid), public.team_invite(uuid, text, text),
  public.team_update(uuid, uuid, text, boolean), public.team_remove(uuid, uuid), public.team_invite_delete(uuid), public.team_cleanup(uuid), public.accept_invites(), public.my_roles() from public, anon;
grant execute on function public.role_allows(text, text), public.member_role(uuid), public.member_can(uuid, text), public.member_in(text, uuid), public.kasir_catalog(uuid), public.sales_day(uuid, date),
  public.sale_detail(uuid), public.team_roles(text), public.team_limit(uuid), public.team_used(uuid), public.team_list(uuid), public.team_invite(uuid, text, text),
  public.team_update(uuid, uuid, text, boolean), public.team_remove(uuid, uuid), public.team_invite_delete(uuid), public.team_cleanup(uuid), public.accept_invites(), public.my_roles() to authenticated;
