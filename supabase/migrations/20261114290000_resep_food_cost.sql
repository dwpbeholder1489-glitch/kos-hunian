-- Resep & food cost (Modul V2.0 Bab 19; backlog P2). Modul j_resep untuk bisnis jasa (Kuliner: resep per menu;
-- jasa lain mis. laundry: bahan per layanan, mis. deterjen per kg).
-- Prinsip:
--   * Resep = daftar bahan (products) per layanan/menu, jumlah dalam satuan bahan (dikonversi ke satuan utama oleh unit_to_base).
--   * Saat pesanan SELESAI (diserahkan), bahan terpotong otomatis: stock_moves jenis 'pakai' (ref_id = pesanan) → stok, batch FEFO,
--     dan jurnal Beban bahan ↔ Persediaan mengikuti mesin yang sudah ada. Stok bahan kurang TIDAK menghalangi pesanan selesai
--     (stok boleh minus, ditandai di daftar agar dibelanjakan/diopname).
--   * Biaya bahan yang benar-benar dipakai disimpan per baris pesanan (svc_order_lines.recipe_cost) → laporan food cost per menu
--     memakai modal SAAT ITU, bukan modal hari ini.
--   * Bahan terbuang (waste) = penyesuaian stok rusak/kedaluwarsa yang sudah ada.

create table if not exists public.svc_recipes (
  id uuid primary key default gen_random_uuid(),
  kos_id uuid not null references public.kos(id) on delete cascade,
  service_id uuid not null references public.svc_services(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  unit text not null,                                   -- satuan bahan seperti dipilih pengguna (mis. gram)
  qty numeric(14,3) not null check (qty > 0),           -- jumlah dalam satuan itu, per 1 satuan layanan (1 porsi / 1 kg)
  base_qty numeric(14,3) not null check (base_qty > 0), -- jumlah dalam satuan utama bahan
  sort int not null default 0,
  unique (service_id, product_id)
);
create index if not exists svc_recipes_kos on public.svc_recipes(kos_id, service_id);
alter table public.svc_recipes enable row level security;
drop policy if exists svc_recipes_select on public.svc_recipes;
create policy svc_recipes_select on public.svc_recipes for select using (member_can(kos_id, 'stock,finance'));
grant select on public.svc_recipes to authenticated;
drop trigger if exists zz_kos_open_guard on public.svc_recipes;
create trigger zz_kos_open_guard before insert or update or delete on public.svc_recipes for each row execute function public.kos_open_guard();

alter table public.svc_order_lines add column if not exists recipe_cost numeric(14,2);
alter table public.svc_orders add column if not exists recipe_done_at timestamptz;

create or replace function public.recipe_guard(p_kos uuid)
returns void language plpgsql stable security definer set search_path = public as $$
begin
  if not member_in('stock,finance', p_kos) then raise exception 'Hanya pemilik, bagian stok, atau keuangan yang bisa mengatur resep'; end if;
  if not module_on(p_kos, 'j_resep') then raise exception 'Modul Resep & biaya bahan belum aktif (Konfigurasi › Modul)'; end if;
end $$;

-- Resep satu menu/layanan + pilihan bahan
create or replace function public.recipe_get(p_service uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare s svc_services;
begin
  select * into s from svc_services where id = p_service;
  if s.id is null then raise exception 'Layanan tidak ditemukan'; end if;
  perform recipe_guard(s.kos_id);
  return jsonb_build_object('service', jsonb_build_object('id', s.id, 'name', s.name, 'unit', s.unit, 'price', s.price),
    'lines', coalesce((select jsonb_agg(jsonb_build_object('product_id', r.product_id, 'name', p.name, 'unit', r.unit, 'qty', r.qty, 'base_qty', r.base_qty,
        'base_unit', p.base_unit, 'cost', p.cost, 'line_cost', round(r.base_qty * p.cost, 2), 'stock', p.stock, 'active', p.active) order by r.sort, p.name)
      from svc_recipes r join products p on p.id = r.product_id where r.service_id = s.id), '[]'),
    'products', coalesce((select jsonb_agg(jsonb_build_object('id', p.id, 'name', p.name, 'base_unit', p.base_unit, 'cost', p.cost, 'stock', p.stock,
        'units', (select jsonb_agg(jsonb_build_object('name', u.name, 'qty', u.qty) order by u.sort) from product_units u where u.product_id = p.id)) order by p.name)
      from products p where p.kos_id = s.kos_id and p.active), '[]'));
end $$;

-- Simpan resep (mengganti seluruh daftar). p_lines: [{product_id, unit, qty}]
create or replace function public.recipe_save(p_service uuid, p_lines jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare s svc_services; x jsonb; p products; v_unit text; v_qty numeric; v_base numeric; i int := 0; v_cost numeric := 0;
begin
  select * into s from svc_services where id = p_service;
  if s.id is null then raise exception 'Layanan tidak ditemukan'; end if;
  perform recipe_guard(s.kos_id);
  if jsonb_typeof(coalesce(p_lines, '[]')) <> 'array' then raise exception 'Daftar bahan tidak valid'; end if;
  if jsonb_array_length(coalesce(p_lines, '[]')) > 40 then raise exception 'Maksimal 40 bahan per resep'; end if;
  delete from svc_recipes where service_id = s.id;
  for x in select * from jsonb_array_elements(coalesce(p_lines, '[]')) loop
    select * into p from products where id = nullif(x->>'product_id', '')::uuid and kos_id = s.kos_id;
    if p.id is null then raise exception 'Bahan tidak ditemukan'; end if;
    v_unit := coalesce(nullif(trim(coalesce(x->>'unit', '')), ''), p.base_unit);
    v_qty := nullif(x->>'qty', '')::numeric;
    if v_qty is null or v_qty <= 0 then raise exception 'Isi jumlah % yang dipakai', p.name; end if;
    if v_qty <> round(v_qty, 3) then raise exception 'Jumlah % maksimal 3 angka di belakang koma', p.name; end if;
    v_base := unit_to_base(p.id, v_unit, v_qty);
    if v_base <= 0 then
      raise exception '% % % terlalu kecil untuk dicatat dalam % (stok disimpan 3 angka di belakang koma). Tambahkan satuan yang lebih kecil di bahan itu, atau ubah satuan utamanya.', unit_num(v_qty), v_unit, p.name, p.base_unit;
    end if;
    if exists (select 1 from svc_recipes where service_id = s.id and product_id = p.id) then raise exception 'Bahan % dobel di resep ini', p.name; end if;
    insert into svc_recipes(kos_id, service_id, product_id, unit, qty, base_qty, sort) values (s.kos_id, s.id, p.id, v_unit, round(v_qty, 3), v_base, i);
    v_cost := v_cost + round(v_base * p.cost, 2);
    i := i + 1;
  end loop;
  return jsonb_build_object('lines', i, 'cost', v_cost, 'price', s.price);
end $$;

-- Potong bahan saat pesanan selesai (sekali per pesanan)
create or replace function public.recipe_consume()
returns trigger language plpgsql security definer set search_path = public as $$
declare r record; p products; l record; v_cost numeric;
begin
  if new.status <> 'selesai' or old.status = 'selesai' or new.recipe_done_at is not null then return new; end if;
  if not module_on(new.kos_id, 'j_resep') then return new; end if;
  if not exists (select 1 from svc_order_lines ol join svc_recipes rc on rc.service_id = ol.service_id where ol.order_id = new.id) then return new; end if;
  -- biaya bahan per baris pesanan (modal saat ini)
  for l in select ol.id, ol.qty, ol.service_id from svc_order_lines ol where ol.order_id = new.id and ol.service_id is not null loop
    select round(sum(round(l.qty * rc.base_qty, 3) * pr.cost), 2) into v_cost from svc_recipes rc join products pr on pr.id = rc.product_id where rc.service_id = l.service_id;
    if v_cost is not null then update svc_order_lines set recipe_cost = v_cost where id = l.id; end if;
  end loop;
  -- satu pergerakan stok per bahan
  for r in select rc.product_id, sum(round(ol.qty * rc.base_qty, 3)) need
           from svc_order_lines ol join svc_recipes rc on rc.service_id = ol.service_id where ol.order_id = new.id group by rc.product_id order by rc.product_id loop
    select * into p from products where id = r.product_id for update;
    if r.need > 0 then
      update products set stock = stock - r.need where id = p.id;
      insert into stock_moves(kos_id, product_id, kind, delta, stock_after, value, note, ref_id)
      values (new.kos_id, p.id, 'pakai', -r.need, p.stock - r.need, round(-r.need * p.cost, 2), 'Resep · pesanan ' || coalesce(new.number, ''), new.id);
    end if;
  end loop;
  update svc_orders set recipe_done_at = now() where id = new.id;
  return new;
end $$;
drop trigger if exists zy_recipe_consume on public.svc_orders;
create trigger zy_recipe_consume after update of status on public.svc_orders for each row execute function public.recipe_consume();

-- Ringkasan: biaya bahan & margin per menu (modal hari ini) + berapa porsi bisa dibuat dari stok
create or replace function public.recipe_overview(p_kos uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  perform recipe_guard(p_kos);
  return coalesce((select jsonb_agg(jsonb_build_object('id', s.id, 'name', s.name, 'category', s.category, 'unit', s.unit, 'price', s.price, 'active', s.active,
      'n', x.n, 'cost', x.cost, 'pct', case when x.n > 0 and s.price > 0 then round(x.cost * 100 / s.price, 1) end,
      'margin', case when x.n > 0 then s.price - x.cost end, 'can_make', x.can_make, 'short', x.short) order by s.active desc, s.sort, s.name)
    from svc_services s
    left join lateral (select count(*) n, coalesce(sum(round(r.base_qty * p.cost, 2)), 0) cost,
        floor(min(greatest(p.stock, 0) / r.base_qty)) can_make,
        (select string_agg(p2.name, ', ' order by p2.name) from svc_recipes r2 join products p2 on p2.id = r2.product_id where r2.service_id = s.id and p2.stock < r2.base_qty) short
      from svc_recipes r join products p on p.id = r.product_id where r.service_id = s.id) x on true
    where s.kos_id = p_kos), '[]');
end $$;

-- Laporan food cost periode: per menu dari pesanan selesai (biaya bahan saat dipakai) + bahan terbuang
create or replace function public.food_cost_report(p_kos uuid, p_from date, p_to date)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v jsonb;
begin
  perform recipe_guard(p_kos);
  if not member_in('finance', p_kos) then raise exception 'Laporan biaya bahan hanya untuk pemilik atau keuangan'; end if;
  with l as (select ol.service_id, ol.name, ol.qty, ol.line_total, ol.recipe_cost
             from svc_order_lines ol join svc_orders o on o.id = ol.order_id
             where o.kos_id = p_kos and o.status = 'selesai' and o.completed_date between p_from and p_to),
  m as (select coalesce(service_id::text, name) k, max(name) name, sum(qty) qty, sum(line_total) revenue, sum(recipe_cost) cost, count(*) filter (where recipe_cost is null) tanpa
        from l group by 1)
  select jsonb_build_object(
    'menus', coalesce((select jsonb_agg(jsonb_build_object('name', name, 'qty', qty, 'revenue', revenue, 'cost', cost,
        'pct', case when cost is not null and revenue > 0 then round(cost * 100 / revenue, 1) end, 'margin', case when cost is not null then revenue - cost end) order by revenue desc) from m), '[]'),
    'revenue', coalesce((select sum(revenue) from m where cost is not null), 0),
    'cost', coalesce((select sum(cost) from m), 0),
    'revenue_no_recipe', coalesce((select sum(revenue) from m where cost is null), 0),
    'waste', coalesce((select -sum(value) from stock_moves where kos_id = p_kos and kind in ('rusak', 'kedaluwarsa') and (created_at at time zone 'Asia/Jakarta')::date between p_from and p_to), 0),
    'manual_use', coalesce((select -sum(value) from stock_moves where kos_id = p_kos and kind = 'pakai' and coalesce(note, '') not like 'Resep · pesanan%' and (created_at at time zone 'Asia/Jakarta')::date between p_from and p_to), 0)) into v;
  return v;
end $$;

revoke execute on function public.recipe_guard(uuid), public.recipe_consume() from public, anon, authenticated;
revoke execute on function public.recipe_get(uuid), public.recipe_save(uuid, jsonb), public.recipe_overview(uuid), public.food_cost_report(uuid, date, date) from public, anon;
grant execute on function public.recipe_get(uuid), public.recipe_save(uuid, jsonb), public.recipe_overview(uuid), public.food_cost_report(uuid, date, date) to authenticated;

-- Module Registry: tersedia untuk semua bisnis jasa; langsung aktif untuk Kuliner
update public.modules set impl_status = 'production_ready', paths = '{/resep}', config_path = '/resep', area = 'stock', name = 'Resep & biaya bahan',
  description = 'Resep per menu / bahan per layanan: bahan terpotong otomatis saat pesanan selesai, biaya bahan (food cost) & margin per menu, porsi yang bisa dibuat dari stok, bahan terbuang.',
  data_used = 'svc_recipes, products, stock_moves, svc_order_lines'
where code = 'j_resep';
insert into public.business_modules(kos_id, module_code, active, updated_by)
select k.id, 'j_resep', true, 'sistem' from public.kos k where k.business_type = 'jasa' and k.template_code = 'kuliner' on conflict do nothing;
