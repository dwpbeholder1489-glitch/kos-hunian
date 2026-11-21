-- Tahap 3 Retail · Katalog lanjutan (2): BARANG PAKET (kit) yang memotong stok komponen.
-- Barang paket = barang biasa (punya satuan & harga jual sendiri) dengan products.is_kit = true dan daftar komponen.
-- Paket TIDAK punya stok sendiri: saat dijual, stok komponen yang berkurang (gerak 'jual' per komponen, ref = penjualan),
-- komposisi saat itu disimpan di sale_line_parts sehingga batal/retur mengembalikan komponen yang sama walau resep paket diubah.
-- Modal paket = jumlah nilai komponen yang keluar (sales.cost_total) → jurnal HPP/Persediaan mesin lama tetap benar.

create or replace function public._prasara_patch(p_sig text, p_old text, p_new text)
returns void language plpgsql as $$
declare v_def text;
begin
  v_def := pg_get_functiondef(p_sig::regprocedure);
  if position(p_old in v_def) = 0 then raise exception 'Patch % tidak menemukan teks: %', p_sig, left(p_old, 80); end if;
  execute replace(v_def, p_old, p_new);
end $$;

alter table public.products add column if not exists is_kit boolean not null default false;
-- dipakai juga oleh nomor seri (migrasi berikutnya); dibuat di sini agar pemeriksaan paket bisa membacanya
alter table public.products add column if not exists track_serial boolean not null default false;

create table if not exists public.product_kits (
  id uuid primary key default gen_random_uuid(),
  kos_id uuid not null references public.kos(id) on delete cascade,
  kit_id uuid not null references public.products(id) on delete cascade,
  product_id uuid not null references public.products(id),
  unit text not null,
  qty numeric(14,3) not null check (qty > 0),          -- isian pengguna, dalam satuan di atas
  base_qty numeric(14,3) not null check (base_qty > 0), -- hasil unit_to_base (satuan utama komponen) per 1 satuan utama paket
  sort int not null default 0,
  unique (kit_id, product_id)
);
create index if not exists product_kits_product on public.product_kits(product_id);
alter table public.product_kits enable row level security;
drop policy if exists product_kits_select on public.product_kits;
create policy product_kits_select on public.product_kits for select using (is_member(kos_id));
drop trigger if exists zz_kos_open_guard on public.product_kits;
create trigger zz_kos_open_guard before insert or update or delete on public.product_kits for each row execute function public.kos_open_guard();

create table if not exists public.sale_line_parts (
  id uuid primary key default gen_random_uuid(),
  kos_id uuid not null references public.kos(id) on delete cascade,
  sale_id uuid not null references public.sales(id) on delete cascade,
  sale_line_id uuid not null references public.sale_lines(id) on delete cascade,
  product_id uuid not null references public.products(id),
  base_qty numeric(14,3) not null,
  cost numeric(14,2) not null default 0,     -- modal per satuan utama komponen saat dijual
  value numeric(14,2) not null default 0     -- nilai yang keluar = round(base_qty × cost, 2)
);
create index if not exists sale_line_parts_line on public.sale_line_parts(sale_line_id);
-- komponen yang sudah kembali lewat retur (agar retur terakhir mengembalikan tepat sisanya)
create table if not exists public.sale_return_parts (
  id uuid primary key default gen_random_uuid(),
  kos_id uuid not null references public.kos(id) on delete cascade,
  return_id uuid not null references public.sale_returns(id) on delete cascade,
  part_id uuid not null references public.sale_line_parts(id) on delete cascade,
  base_qty numeric(14,3) not null,
  value numeric(14,2) not null default 0
);
create index if not exists sale_return_parts_part on public.sale_return_parts(part_id);
alter table public.sale_return_parts enable row level security;
drop policy if exists sale_return_parts_select on public.sale_return_parts;
create policy sale_return_parts_select on public.sale_return_parts for select using (member_can(kos_id, 'stock,finance'));
drop trigger if exists zz_kos_open_guard on public.sale_return_parts;
create trigger zz_kos_open_guard before insert or update or delete on public.sale_return_parts for each row execute function public.kos_open_guard();
alter table public.sale_line_parts enable row level security;
drop policy if exists sale_line_parts_select on public.sale_line_parts;
create policy sale_line_parts_select on public.sale_line_parts for select using (member_can(kos_id, 'stock,finance'));
drop trigger if exists zz_kos_open_guard on public.sale_line_parts;
create trigger zz_kos_open_guard before insert or update or delete on public.sale_line_parts for each row execute function public.kos_open_guard();

-- Paket tidak punya stok sendiri dan tidak dibeli dari supplier
create or replace function public.kit_moves_guard() returns trigger language plpgsql as $$
begin
  if exists (select 1 from products where id = new.product_id and is_kit) then
    raise exception 'Barang paket tidak punya stok sendiri — stoknya diambil dari barang komponennya. Ubah stok komponennya.';
  end if;
  return new;
end $$;
drop trigger if exists kit_moves_guard on public.stock_moves;
create trigger kit_moves_guard before insert on public.stock_moves for each row execute function public.kit_moves_guard();
drop trigger if exists kit_moves_guard on public.purchase_lines;
create trigger kit_moves_guard before insert on public.purchase_lines for each row execute function public.kit_moves_guard();

-- Modal 1 satuan utama paket = Σ isi komponen × modal komponen (tampilan; saat dijual dihitung per baris)
create or replace function public.kit_cost(p_kit uuid) returns numeric language sql stable security definer set search_path = public as $$
  select coalesce(round(sum(k.base_qty * p.cost), 2), 0) from product_kits k join products p on p.id = k.product_id where k.kit_id = p_kit;
$$;

-- Bisa dibuat berapa paket dari stok komponen yang bisa dijual (stok − dipesan − ditahan) di lokasi itu (null = semua lokasi)
create or replace function public.kit_avail(p_kit uuid, p_branch uuid default null) returns numeric language sql stable security definer set search_path = public as $$
  select coalesce(min(floor(greatest(
           (case when p_branch is null then p.stock else coalesce((select l.qty from stock_levels l where l.product_id = p.id and l.branch_id = p_branch), 0) end)
           - stock_reserved_at(p.id, p_branch) - stock_held_at(p.id, p_branch), 0) / k.base_qty)), 0)
  from product_kits k join products p on p.id = k.product_id where k.kit_id = p_kit;
$$;

-- Atur komponen paket (ganti seluruh daftar). Barang hanya bisa dijadikan paket bila belum punya riwayat stok.
create or replace function public.kit_save(p_product uuid, p_components jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare p products; c jsonb; cp products; v_base numeric; v_n int := 0; v_ids uuid[] := '{}';
begin
  select * into p from products where id = p_product for update;
  if p.id is null or not member_in('stock', p.kos_id) then raise exception 'Barang tidak ditemukan'; end if;
  if (select business_type from kos where id = p.kos_id) <> 'retail' then raise exception 'Barang paket hanya untuk bisnis Retail & Grosir'; end if;
  if not p.is_kit then
    if p.stock <> 0 or exists (select 1 from stock_moves where product_id = p.id) then
      raise exception 'Barang ini sudah punya riwayat stok, jadi tidak bisa dijadikan paket. Buat barang baru untuk paketnya (mis. "Paket Sembako Hemat").';
    end if;
    if p.consign_contact_id is not null then raise exception 'Barang titipan tidak bisa dijadikan paket'; end if;
    if p.track_expiry then raise exception 'Matikan dulu "Catat tanggal kedaluwarsa" pada barang ini — kedaluwarsa dicatat di komponennya'; end if;
    if p.track_serial then raise exception 'Matikan dulu "Catat nomor seri" pada barang ini — nomor seri dicatat di komponennya'; end if;
  end if;
  if jsonb_typeof(p_components) <> 'array' or jsonb_array_length(p_components) = 0 then raise exception 'Pilih minimal satu barang komponen'; end if;
  if jsonb_array_length(p_components) > 30 then raise exception 'Maksimal 30 komponen per paket'; end if;
  delete from product_kits where kit_id = p.id;
  for c in select * from jsonb_array_elements(p_components) loop
    select * into cp from products where id = (c->>'product_id')::uuid and kos_id = p.kos_id;
    if cp.id is null then raise exception 'Barang komponen tidak ditemukan'; end if;
    if cp.id = p.id then raise exception 'Paket tidak bisa berisi dirinya sendiri'; end if;
    if cp.is_kit then raise exception '% adalah barang paket — paket tidak bisa berisi paket lain', cp.name; end if;
    if cp.id = any(v_ids) then raise exception '% tertulis dua kali', cp.name; end if;
    if (c->>'qty') is null or (c->>'qty')::numeric <= 0 then raise exception 'Isi jumlah %', cp.name; end if;
    v_base := unit_to_base(cp.id, coalesce(nullif(c->>'unit', ''), cp.base_unit), (c->>'qty')::numeric);
    if v_base is null or v_base <= 0 then raise exception 'Jumlah % tidak valid', cp.name; end if;
    if v_base <> round(v_base, 3) then raise exception 'Jumlah % terlalu kecil (maksimal 3 angka di belakang koma dalam %)', cp.name, cp.base_unit; end if;
    insert into product_kits(kos_id, kit_id, product_id, unit, qty, base_qty, sort)
    values (p.kos_id, p.id, cp.id, coalesce(nullif(c->>'unit', ''), cp.base_unit), (c->>'qty')::numeric, v_base, v_n);
    v_ids := v_ids || cp.id; v_n := v_n + 1;
  end loop;
  update products set is_kit = true where id = p.id;
  return jsonb_build_object('product_id', p.id, 'components', v_n, 'cost', kit_cost(p.id));
end $$;

create or replace function public.kit_unset(p_product uuid)
returns void language plpgsql security definer set search_path = public as $$
declare p products;
begin
  select * into p from products where id = p_product for update;
  if p.id is null or not member_in('stock', p.kos_id) then raise exception 'Barang tidak ditemukan'; end if;
  if not p.is_kit then return; end if;
  delete from product_kits where kit_id = p.id;
  update products set is_kit = false where id = p.id;   -- riwayat penjualan paket (sale_line_parts) tetap utuh
end $$;

create or replace function public.kit_overview(p_kos uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_loc uuid := case when loc_multi(p_kos) then stock_loc(p_kos) end; v_fin boolean := member_in('finance', p_kos) or member_in('stock', p_kos);
begin
  if not is_member(p_kos) then raise exception 'Tidak punya akses ke bisnis ini'; end if;
  return (select coalesce(jsonb_agg(jsonb_build_object('product_id', p.id, 'name', p.name, 'base_unit', p.base_unit,
      'cost', case when v_fin then kit_cost(p.id) end, 'avail', kit_avail(p.id, v_loc), 'avail_total', kit_avail(p.id, null),
      'components', (select coalesce(jsonb_agg(jsonb_build_object('product_id', c.id, 'name', c.name, 'unit', k.unit, 'qty', k.qty, 'base_qty', k.base_qty, 'base_unit', c.base_unit,
          'stock', c.stock, 'cost', case when v_fin then c.cost end) order by k.sort), '[]'::jsonb)
        from product_kits k join products c on c.id = k.product_id where k.kit_id = p.id)) order by p.name), '[]'::jsonb)
    from products p where p.kos_id = p_kos and p.is_kit);
end $$;

-- Mengeluarkan komponen untuk satu baris penjualan paket. Mengembalikan total nilai (= modal baris).
create or replace function public.kit_consume(p_kos uuid, p_sale uuid, p_line uuid, p_kit uuid, p_base numeric, p_no text)
returns numeric language plpgsql security definer set search_path = public as $$
declare k record; cp products; v_b numeric; v_val numeric; v_sum numeric := 0; v_name text;
begin
  select name into v_name from products where id = p_kit;
  if not exists (select 1 from product_kits where kit_id = p_kit) then raise exception 'Paket % belum punya komponen. Atur komponennya di Barang & stok.', v_name; end if;
  for k in select * from product_kits where kit_id = p_kit order by sort loop
    select * into cp from products where id = k.product_id for update;
    v_b := round(p_base * k.base_qty, 3);
    v_val := round(v_b * cp.cost, 2);
    update products set stock = stock - v_b where id = cp.id;
    insert into stock_moves(kos_id, product_id, kind, delta, stock_after, value, ref_id, note)
    values (p_kos, cp.id, 'jual', -v_b, cp.stock - v_b, -v_val, p_sale, p_no || ' · paket ' || v_name);
    insert into sale_line_parts(kos_id, sale_id, sale_line_id, product_id, base_qty, cost, value) values (p_kos, p_sale, p_line, cp.id, v_b, cp.cost, v_val);
    v_sum := v_sum + v_val;
  end loop;
  return v_sum;
end $$;

-- ---------- sale_create: baris paket memotong komponen ----------
select public._prasara_patch('public.sale_create(uuid,uuid,text,jsonb,numeric,text,numeric,uuid,date,text,jsonb)',
  $x$  v_tax jsonb; v_promo jsonb;$x$,
  $x$  v_line uuid; v_kc numeric;
  v_tax jsonb; v_promo jsonb;$x$);
select public._prasara_patch('public.sale_create(uuid,uuid,text,jsonb,numeric,text,numeric,uuid,date,text,jsonb)',
  $x$    values (p_id, p_kos, p.id, p.name, u.name, u.qty, v_qty, v_price, p.cost, round(v_qty * v_price, 2), (l->>'price') is not null);
    update products set stock = stock - v_base where id = p.id;
    insert into stock_moves(kos_id, product_id, kind, delta, stock_after, value, ref_id, note)
    values (p_kos, p.id, 'jual', -v_base, p.stock - v_base, round(-v_base * p.cost, 2), p_id, v_no);
    v_sub := v_sub + round(v_qty * v_price, 2);
    v_cost := v_cost + round(v_base * p.cost, 2);$x$,
  $x$    values (p_id, p_kos, p.id, p.name, u.name, u.qty, v_qty, v_price, case when p.is_kit then 0 else p.cost end, round(v_qty * v_price, 2), (l->>'price') is not null)
    returning id into v_line;
    if p.is_kit then
      v_kc := kit_consume(p_kos, p_id, v_line, p.id, v_base, v_no);
      update sale_lines set cost = round(v_kc / nullif(v_base, 0), 2) where id = v_line;
      v_cost := v_cost + v_kc;
    else
      update products set stock = stock - v_base where id = p.id;
      insert into stock_moves(kos_id, product_id, kind, delta, stock_after, value, ref_id, note)
      values (p_kos, p.id, 'jual', -v_base, p.stock - v_base, round(-v_base * p.cost, 2), p_id, v_no);
      v_cost := v_cost + round(v_base * p.cost, 2);
    end if;
    v_sub := v_sub + round(v_qty * v_price, 2);$x$);

-- ---------- sale_void: paket mengembalikan komponen yang sama persis ----------
create or replace function public.sale_void(p_sale uuid, p_reason text)
returns void language plpgsql security definer set search_path = public as $function$
declare s sales; l sale_lines; v_stock numeric; pt sale_line_parts;
begin
  select * into s from sales where id = p_sale for update;
  if s.id is null or not member_in('finance', s.kos_id) then raise exception 'Transaksi tidak ditemukan'; end if;
  if approval_needed(s.kos_id, 'batal_penjualan') then raise exception 'PERLU_PERSETUJUAN: Tindakan ini perlu persetujuan pemilik. Kirim permintaan dari aplikasi.'; end if;
  if s.status = 'batal' then raise exception 'Transaksi sudah dibatalkan'; end if;
  if exists (select 1 from sale_returns where sale_id = s.id) then raise exception 'Penjualan ini sudah ada retur; pakai Retur untuk sisa barangnya'; end if;
  if coalesce(trim(p_reason), '') = '' then raise exception 'Isi alasan pembatalan'; end if;
  for l in select * from sale_lines where sale_id = s.id loop
    if exists (select 1 from sale_line_parts where sale_line_id = l.id) then
      for pt in select * from sale_line_parts where sale_line_id = l.id loop
        update products set stock = stock + pt.base_qty where id = pt.product_id returning stock into v_stock;
        insert into stock_moves(kos_id, product_id, kind, delta, stock_after, value, ref_id, note)
        values (s.kos_id, pt.product_id, 'batal', pt.base_qty, v_stock, pt.value, s.id, 'Batal ' || s.number || ' · paket ' || l.name);
      end loop;
    else
      update products set stock = stock + round(l.qty * l.unit_qty, 3) where id = l.product_id returning stock into v_stock;
      insert into stock_moves(kos_id, product_id, kind, delta, stock_after, value, ref_id, note)
      values (s.kos_id, l.product_id, 'batal', round(l.qty * l.unit_qty, 3), v_stock, round(l.qty * l.unit_qty * l.cost, 2), s.id, 'Batal ' || s.number);
    end if;
  end loop;
  update sales set status = 'batal', void_reason = trim(p_reason), voided_at = now() where id = s.id;
end $function$;

-- ---------- sale_return_create: retur paket mengembalikan komponen sebanding ----------
create or replace function public.sale_return_create(p_id uuid, p_sale uuid, p_lines jsonb, p_refund text, p_reason text)
returns jsonb language plpgsql security definer set search_path = public as $function$
declare s sales; l sale_lines; x jsonb; v_qty numeric; v_done numeric; v_base numeric; v_amt numeric; v_stock numeric;
        v_total numeric := 0; v_cost numeric := 0; v_no text; v_seq int; v_day date := (now() at time zone 'Asia/Jakarta')::date;
        v_factor numeric; v_existing sale_returns; v_hb uuid; pt sale_line_parts; v_pb numeric; v_pv numeric; v_lc numeric; v_rl uuid;
begin
  select * into v_existing from sale_returns where id = p_id;
  if v_existing.id is not null then return jsonb_build_object('id', v_existing.id, 'number', v_existing.number, 'total', v_existing.total, 'duplicate', true); end if;
  select * into s from sales where id = p_sale for update;
  if s.id is null or not member_in('finance', s.kos_id) then raise exception 'Penjualan tidak ditemukan'; end if;
  if approval_needed(s.kos_id, 'retur_penjualan') then raise exception 'PERLU_PERSETUJUAN: Tindakan ini perlu persetujuan pemilik. Kirim permintaan dari aplikasi.'; end if;
  if s.status <> 'selesai' then raise exception 'Penjualan yang dibatalkan tidak bisa diretur'; end if;
  if coalesce(trim(p_reason), '') = '' then raise exception 'Isi alasan retur'; end if;
  if p_refund not in ('tunai', 'transfer', 'kasbon') then raise exception 'Pilih cara pengembalian uang'; end if;
  if p_refund = 'kasbon' and (s.contact_id is null or s.amt_kasbon <= 0) then raise exception 'Potong kasbon hanya untuk penjualan kasbon'; end if;
  if jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) = 0 then raise exception 'Pilih barang yang diretur'; end if;
  v_factor := case when s.subtotal > 0 then s.total / s.subtotal else 1 end;

  perform pg_advisory_xact_lock(hashtext('retur:' || s.kos_id::text));
  select count(*) + 1 into v_seq from sale_returns where kos_id = s.kos_id and return_date = v_day;
  v_no := 'RTR-' || to_char(v_day, 'YYMMDD') || '-' || lpad(v_seq::text, 3, '0');
  insert into sale_returns(id, kos_id, sale_id, contact_id, number, return_date, total, refund_method, reason)
  values (p_id, s.kos_id, s.id, s.contact_id, v_no, v_day, 0, p_refund, trim(p_reason));

  for x in select * from jsonb_array_elements(p_lines) loop
    v_qty := (x->>'qty')::numeric;
    if v_qty is null or v_qty <= 0 then continue; end if;
    select * into l from sale_lines where id = (x->>'line_id')::uuid and sale_id = s.id;
    if l.id is null then raise exception 'Baris penjualan tidak ditemukan'; end if;
    select coalesce(sum(qty), 0) into v_done from sale_return_lines where sale_line_id = l.id;
    if v_qty > l.qty - v_done then raise exception 'Retur % melebihi jumlah yang dibeli (sisa %)', l.name, trim_scale(l.qty - v_done); end if;
    v_base := round(v_qty * l.unit_qty, 3);
    v_amt := round(v_qty * l.price * v_factor, 2);
    if exists (select 1 from sale_line_parts where sale_line_id = l.id) then
      -- paket: komponen kembali sebanding jumlah yang diretur; sisa terakhir mengembalikan seluruh sisa komponen
      v_lc := 0;
      for pt in select * from sale_line_parts where sale_line_id = l.id loop
        v_pb := pt.base_qty - coalesce((select sum(rp.base_qty) from sale_return_parts rp where rp.part_id = pt.id), 0);
        if v_qty < l.qty - v_done then v_pb := least(v_pb, round(pt.base_qty * v_qty / l.qty, 3)); end if;
        continue when v_pb <= 0;
        v_pv := round(v_pb * pt.cost, 2);
        update products set stock = stock + v_pb where id = pt.product_id returning stock into v_stock;
        insert into stock_moves(kos_id, product_id, kind, delta, stock_after, value, ref_id, note)
        values (s.kos_id, pt.product_id, 'retur_jual', v_pb, v_stock, v_pv, p_id, v_no || ' dari ' || s.number || ' · paket ' || l.name) returning branch_id into v_hb;
        if coalesce((x->>'rusak')::boolean, false) then
          insert into stock_holds(kos_id, product_id, branch_id, qty, reason, note, ref_id) values (s.kos_id, pt.product_id, v_hb, v_pb, 'retur_rusak', 'Retur ' || v_no || ' (paket ' || l.name || ') · ' || trim(p_reason), p_id);
        end if;
        insert into sale_return_parts(kos_id, return_id, part_id, base_qty, value) values (s.kos_id, p_id, pt.id, v_pb, v_pv);
        v_lc := v_lc + v_pv;
      end loop;
      insert into sale_return_lines(return_id, kos_id, sale_line_id, product_id, name, unit, unit_qty, qty, amount, cost)
      values (p_id, s.kos_id, l.id, l.product_id, l.name, l.unit, l.unit_qty, v_qty, v_amt, round(v_lc / nullif(v_base, 0), 2)) returning id into v_rl;
      v_cost := v_cost + v_lc;
    else
      insert into sale_return_lines(return_id, kos_id, sale_line_id, product_id, name, unit, unit_qty, qty, amount, cost)
      values (p_id, s.kos_id, l.id, l.product_id, l.name, l.unit, l.unit_qty, v_qty, v_amt, l.cost) returning id into v_rl;
      update products set stock = stock + v_base where id = l.product_id returning stock into v_stock;
      insert into stock_moves(kos_id, product_id, kind, delta, stock_after, value, ref_id, note)
      values (s.kos_id, l.product_id, 'retur_jual', v_base, v_stock, round(v_base * l.cost, 2), p_id, v_no || ' dari ' || s.number) returning branch_id into v_hb;
      if coalesce((x->>'rusak')::boolean, false) then
        insert into stock_holds(kos_id, product_id, branch_id, qty, reason, note, ref_id) values (s.kos_id, l.product_id, v_hb, v_base, 'retur_rusak', 'Retur ' || v_no || ' · ' || trim(p_reason), p_id);
      end if;
      v_cost := v_cost + round(v_base * l.cost, 2);
    end if;
    v_total := v_total + v_amt;
  end loop;
  if v_total = 0 and v_cost = 0 and not exists (select 1 from sale_return_lines where return_id = p_id) then raise exception 'Isi jumlah barang yang diretur'; end if;
  update sale_returns set total = v_total, cost_total = v_cost where id = p_id;
  return jsonb_build_object('id', p_id, 'number', v_no, 'total', v_total, 'duplicate', false);
end $function$;

-- ---------- Kasir: stok paket = bisa dibuat berapa dari komponen ----------
select public._prasara_patch('public.kasir_catalog(uuid)',
  $x$'held', stock_held_at(p.id, case when loc_multi(p_kos) then stock_loc(p_kos) end)) order by p.name)$x$,
  $x$'held', stock_held_at(p.id, case when loc_multi(p_kos) then stock_loc(p_kos) end))
      || case when p.is_kit then jsonb_build_object('stock', kit_avail(p.id, case when loc_multi(p_kos) then stock_loc(p_kos) end), 'stock_total', kit_avail(p.id, null), 'reserved', 0, 'held', 0) else '{}'::jsonb end order by p.name)$x$);

-- ---------- Paket tidak ikut saran belanja, kesehatan stok, dan hitungan stok habis ----------
select public._prasara_patch('public.reorder_suggest(uuid,integer,integer,integer)',
  $x$    where p.kos_id = p_kos and p.active
  ), rec as ($x$,
  $x$    where p.kos_id = p_kos and p.active and not p.is_kit
  ), rec as ($x$);
select public._prasara_patch('public.stock_health(uuid)',
  $x$      where p.kos_id = p_kos and p.active),$x$,
  $x$      where p.kos_id = p_kos and p.active and not p.is_kit),$x$);
select public._prasara_patch('public.retail_kpi(uuid,date,date)',
  $x$act as (select * from products where kos_id = p_kos and active)$x$,
  $x$act as (select * from products where kos_id = p_kos and active and not is_kit)$x$);

drop function public._prasara_patch(text, text, text);
