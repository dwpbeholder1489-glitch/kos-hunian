-- Tahap 1 Tata kelola harga & kredit (bagian 1): tanggal berlaku daftar harga, riwayat perubahan harga,
-- peringatan kasbon melewati batas kredit (TIDAK memblokir — keputusan pemilik 15 Nov 2026).
-- Bagian lain Tahap 1 (harga per outlet, batas diskon & margin, grup/sales rep) menyusul di migrasi berikutnya.

-- 1. Tanggal berlaku daftar harga -------------------------------------------------------------
alter table public.price_lists add column if not exists valid_from date;
alter table public.price_lists add column if not exists valid_to date;

-- Daftar harga dipakai hanya bila hari ini berada dalam rentang berlakunya (kosong = tanpa batas).
create or replace function public.price_list_live(p_list uuid, p_kos uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from price_lists pl
    where pl.id = p_list and pl.kos_id = p_kos and pl.archived_at is null
      and (pl.valid_from is null or pl.valid_from <= (now() at time zone 'Asia/Jakarta')::date)
      and (pl.valid_to is null or pl.valid_to >= (now() at time zone 'Asia/Jakarta')::date));
$$;

-- Harga untuk pelanggan: daftar harga aktif (dalam rentang tanggal) → harga grosir → harga eceran
create or replace function public.price_for(p_kos uuid, p_contact uuid, p_product uuid, p_unit text, p_tier text default 'grosir')
returns jsonb language sql stable security definer set search_path = public as $$
  select case
    when li.price is not null then jsonb_build_object('price', li.price, 'source', 'daftar', 'list', pl.name)
    when p_tier = 'grosir' and u.price_wholesale > 0 then jsonb_build_object('price', u.price_wholesale, 'source', 'grosir')
    else jsonb_build_object('price', u.price_retail, 'source', 'eceran') end
  from product_units u
  left join contacts c on c.id = p_contact and c.kos_id = p_kos
  left join price_lists pl on pl.id = c.price_list_id and public.price_list_live(pl.id, p_kos)
  left join price_list_items li on li.list_id = pl.id and li.product_id = u.product_id and li.unit = u.name
  where u.product_id = p_product and u.name = p_unit and u.kos_id = p_kos and member_in('sell,finance', p_kos);
$$;

-- Daftar harga pelanggan (form pesanan & Kasir): hanya bila daftar sedang berlaku
create or replace function public.price_list_for_contact(p_kos uuid, p_contact uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object('list', pl.name, 'list_id', pl.id, 'valid_from', pl.valid_from, 'valid_to', pl.valid_to,
    'items', coalesce((select jsonb_agg(jsonb_build_object('product_id', li.product_id, 'unit', li.unit, 'price', li.price)) from price_list_items li where li.list_id = pl.id), '[]'))
  from contacts c join price_lists pl on pl.id = c.price_list_id
  where c.id = p_contact and c.kos_id = p_kos and public.price_list_live(pl.id, p_kos) and member_in('sell,finance', p_kos);
$$;

-- Atur rentang berlaku (kosong = tanpa batas). Berakhir sebelum mulai ditolak.
create or replace function public.price_list_dates_set(p_list uuid, p_from date, p_to date)
returns void language plpgsql security definer set search_path = public as $$
declare pl price_lists;
begin
  select * into pl from price_lists where id = p_list for update;
  if pl.id is null or not member_in('finance', pl.kos_id) then raise exception 'Daftar harga tidak ditemukan'; end if;
  if p_from is not null and p_to is not null and p_to < p_from then raise exception 'Tanggal selesai harus sama atau sesudah tanggal mulai'; end if;
  update price_lists set valid_from = p_from, valid_to = p_to, updated_at = now() where id = pl.id;
  perform config_log(pl.kos_id, 'daftar_harga_berlaku', 'Daftar harga ' || pl.name,
    jsonb_build_object('mulai', pl.valid_from, 'selesai', pl.valid_to), jsonb_build_object('mulai', p_from, 'selesai', p_to), null, 'rendah', actor_email());
end $$;
revoke execute on function public.price_list_dates_set(uuid, date, date) from public, anon;
grant execute on function public.price_list_dates_set(uuid, date, date) to authenticated;

-- 2. Riwayat perubahan harga jual ----------------------------------------------------------------
-- Dicatat otomatis: harga eceran/grosir (product_units) dan harga daftar (price_list_items).
create table if not exists public.price_history (
  id uuid primary key default gen_random_uuid(),
  kos_id uuid not null references public.kos(id) on delete cascade,
  product_id uuid references public.products(id) on delete set null,
  product_name text,
  unit text,
  kind text not null check (kind in ('eceran', 'grosir', 'daftar')),
  list_id uuid,
  list_name text,
  old_price numeric,
  new_price numeric,
  changed_at timestamptz not null default now(),
  changed_by text
);
create index if not exists price_history_kos on public.price_history(kos_id, changed_at desc);
create index if not exists price_history_product on public.price_history(product_id, changed_at desc);
alter table public.price_history enable row level security;
drop policy if exists price_history_select on public.price_history;
create policy price_history_select on public.price_history for select using (member_can(kos_id, 'finance'));
grant select on public.price_history to authenticated;
drop trigger if exists zz_kos_open_guard on public.price_history;
create trigger zz_kos_open_guard before insert or update or delete on public.price_history for each row execute function public.kos_open_guard();

create or replace function public.price_history_units()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.price_retail is distinct from old.price_retail then
    insert into price_history(kos_id, product_id, product_name, unit, kind, old_price, new_price, changed_by)
    select new.kos_id, new.product_id, p.name, new.name, 'eceran', old.price_retail, new.price_retail, actor_email() from products p where p.id = new.product_id;
  end if;
  if new.price_wholesale is distinct from old.price_wholesale then
    insert into price_history(kos_id, product_id, product_name, unit, kind, old_price, new_price, changed_by)
    select new.kos_id, new.product_id, p.name, new.name, 'grosir', old.price_wholesale, new.price_wholesale, actor_email() from products p where p.id = new.product_id;
  end if;
  return new;
end $$;
drop trigger if exists product_units_price_history on public.product_units;
create trigger product_units_price_history after update of price_retail, price_wholesale on public.product_units
  for each row execute function public.price_history_units();

create or replace function public.price_history_list_items()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_name text; v_prod text;
begin
  if tg_op = 'DELETE' then
    select name into v_name from price_lists where id = old.list_id;
    select name into v_prod from products where id = old.product_id;
    insert into price_history(kos_id, product_id, product_name, unit, kind, list_id, list_name, old_price, new_price, changed_by)
    values (old.kos_id, old.product_id, v_prod, old.unit, 'daftar', old.list_id, v_name, old.price, null, actor_email());
    return old;
  end if;
  if tg_op = 'UPDATE' and new.price is not distinct from old.price then return new; end if;
  select name into v_name from price_lists where id = new.list_id;
  select name into v_prod from products where id = new.product_id;
  insert into price_history(kos_id, product_id, product_name, unit, kind, list_id, list_name, old_price, new_price, changed_by)
  values (new.kos_id, new.product_id, v_prod, new.unit, 'daftar', new.list_id, v_name, case when tg_op = 'UPDATE' then old.price end, new.price, actor_email());
  return new;
end $$;
drop trigger if exists price_list_items_history on public.price_list_items;
create trigger price_list_items_history after insert or update or delete on public.price_list_items
  for each row execute function public.price_history_list_items();

-- Riwayat harga: finance saja. p_product kosong = semua barang, terbaru dulu.
create or replace function public.price_history_list(p_kos uuid, p_product uuid default null, p_limit int default 200)
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if not member_in('finance', p_kos) then raise exception 'Tidak punya akses ke riwayat harga'; end if;
  return coalesce((select jsonb_agg(x order by x.changed_at desc) from (
    select h.* from price_history h where h.kos_id = p_kos and (p_product is null or h.product_id = p_product)
    order by h.changed_at desc limit greatest(1, least(coalesce(p_limit, 200), 500))) x), '[]'::jsonb);
end $$;
revoke execute on function public.price_history_list(uuid, uuid, int) from public, anon;
grant execute on function public.price_history_list(uuid, uuid, int) to authenticated;

-- 3. Peringatan kasbon melewati batas kredit (Kasir) ---------------------------------------------
-- Tidak memblokir. Hanya mengembalikan peringatan agar Kasir bisa menampilkannya; transaksi tetap bisa disimpan
-- dan tercatat di riwayat pelanggan (sales.contact_id).
create or replace function public.kasbon_check(p_kos uuid, p_contact uuid, p_amount numeric)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare cr jsonb; v_bal numeric; v_limit numeric; v_after numeric; v_warn jsonb := '[]'::jsonb;
begin
  if not member_in('sell,finance', p_kos) then raise exception 'Tidak punya akses ke bisnis ini'; end if;
  if p_contact is null or coalesce(p_amount, 0) <= 0 then return jsonb_build_object('warnings', v_warn); end if;
  if not exists (select 1 from contacts where id = p_contact and kos_id = p_kos and kind = 'pelanggan') then raise exception 'Pelanggan tidak ditemukan'; end if;
  cr := customer_credit(p_contact);
  v_bal := coalesce((cr->>'balance')::numeric, 0);
  v_limit := nullif(cr->>'limit', '')::numeric;
  v_after := v_bal + p_amount;
  if v_limit is not null and v_after > v_limit then
    v_warn := v_warn || jsonb_build_array('Kasbon ini membuat piutang ' || dom_rp(v_after) || ' melewati batas kredit ' || dom_rp(v_limit) || '. Transaksi tetap bisa disimpan.');
  end if;
  if coalesce((cr->>'overdue')::numeric, 0) > 0 then
    v_warn := v_warn || jsonb_build_array('Pelanggan ini punya piutang lewat jatuh tempo ' || dom_rp((cr->>'overdue')::numeric) || ' (terlama ' || (cr->>'overdue_days') || ' hari).');
  end if;
  return jsonb_build_object('warnings', v_warn, 'balance', v_bal, 'limit', v_limit, 'after', v_after);
end $$;
revoke execute on function public.kasbon_check(uuid, uuid, numeric) from public, anon;
grant execute on function public.kasbon_check(uuid, uuid, numeric) to authenticated;
