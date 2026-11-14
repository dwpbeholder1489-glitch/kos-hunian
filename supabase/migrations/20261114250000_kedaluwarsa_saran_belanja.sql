-- Batch & kedaluwarsa + saran belanja ulang (Modul V2.0 Bab 11; backlog P1; modul r_batch).
-- Barang yang dicatat kedaluwarsanya (products.track_expiry) punya stok per batch (stock_batches) per lokasi.
--   * Masuk dengan tanggal: belanja/terima barang (purchase_lines.expiry/lot) atau batch_add (stok awal/koreksi).
--   * Keluar: semua stock_moves negatif (jual, pakai, rusak, retur supplier, mutasi keluar, opname kurang) memotong batch
--     yang PALING CEPAT kedaluwarsa dulu (FEFO) — kasir tidak perlu memilih batch.
--   * Mutasi antar lokasi: batch ikut pindah (tanggal yang sama).
--   * Masuk tanpa tanggal (retur penjualan, batal, koreksi tambah, opname lebih): masuk ke batch terbaru di lokasi itu,
--     atau batch "tanpa tanggal" bila belum ada.
--   * Membuang batch tertentu: batch_writeoff (penyesuaian 'kedaluwarsa'/'rusak', izin & persetujuan sama dengan Barang).
-- Saran belanja: reorder_suggest = rata-rata keluar per hari × (waktu tunggu + cadangan) dibanding stok + pesanan yang belum datang.

alter table public.products add column if not exists track_expiry boolean not null default false;
alter table public.products add column if not exists lead_days int check (lead_days is null or lead_days between 0 and 120);
alter table public.purchase_lines add column if not exists expiry date;
alter table public.purchase_lines add column if not exists lot text check (lot is null or length(lot) <= 40);

create table if not exists public.stock_batches (
  id uuid primary key default gen_random_uuid(),
  kos_id uuid not null references public.kos(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  branch_id uuid not null,
  lot text check (lot is null or length(lot) <= 40),
  expiry date,
  qty numeric(14,3) not null default 0,
  received_qty numeric(14,3) not null default 0,
  received_at timestamptz not null default now(),
  ref_id uuid,
  note text,
  created_at timestamptz not null default now()
);
create index if not exists stock_batches_fefo on public.stock_batches(product_id, branch_id, expiry nulls last, received_at);
create index if not exists stock_batches_kos on public.stock_batches(kos_id, expiry);
alter table public.stock_batches enable row level security;
drop policy if exists stock_batches_select on public.stock_batches;
create policy stock_batches_select on public.stock_batches for select using (member_can(kos_id, 'stock,sell,finance'));
grant select on public.stock_batches to authenticated;
drop trigger if exists zz_kos_open_guard on public.stock_batches;
create trigger zz_kos_open_guard before insert or update or delete on public.stock_batches for each row execute function public.kos_open_guard();

-- Pergerakan stok → batch (setelah lokasi ditentukan stock_moves_loc)
create or replace function public.stock_moves_batch()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_track boolean; v_left numeric; b stock_batches; v_take numeric; v_out jsonb := '[]'; v_in jsonb; x jsonb; v_target uuid;
begin
  select track_expiry into v_track from products where id = new.product_id;
  if not coalesce(v_track, false) or new.delta = 0 then return null; end if;
  if new.delta < 0 then
    v_left := -new.delta;
    v_target := nullif(current_setting('prasara.batch_target', true), '')::uuid;
    for b in select * from stock_batches where product_id = new.product_id and branch_id = new.branch_id and qty > 0
             order by (id = v_target) desc, expiry nulls last, received_at for update loop
      exit when v_left <= 0;
      v_take := least(b.qty, v_left);
      update stock_batches set qty = qty - v_take where id = b.id;
      v_out := v_out || jsonb_build_array(jsonb_build_object('lot', b.lot, 'expiry', b.expiry, 'qty', v_take));
      v_left := v_left - v_take;
    end loop;
    -- mutasi: catat batch yang keluar untuk dipasangkan di lokasi tujuan
    if new.kind = 'transfer' then perform set_config('prasara.batch_out', v_out::text, true); end if;
    return null;
  end if;
  -- masuk
  v_in := nullif(current_setting('prasara.batch', true), '')::jsonb;
  if new.kind = 'transfer' and nullif(current_setting('prasara.batch_out', true), '') is not null then
    v_left := new.delta;
    for x in select * from jsonb_array_elements(current_setting('prasara.batch_out', true)::jsonb) loop
      exit when v_left <= 0;
      v_take := least((x->>'qty')::numeric, v_left);
      insert into stock_batches(kos_id, product_id, branch_id, lot, expiry, qty, received_qty, ref_id, note)
      values (new.kos_id, new.product_id, new.branch_id, x->>'lot', nullif(x->>'expiry', '')::date, v_take, v_take, new.ref_id, new.note);
      v_left := v_left - v_take;
    end loop;
    perform set_config('prasara.batch_out', '', true);
    if v_left > 0 then
      insert into stock_batches(kos_id, product_id, branch_id, qty, received_qty, ref_id, note) values (new.kos_id, new.product_id, new.branch_id, v_left, v_left, new.ref_id, new.note);
    end if;
  elsif v_in is not null and (nullif(v_in->>'expiry', '') is not null or nullif(v_in->>'lot', '') is not null or new.kind in ('beli', 'awal')) then
    insert into stock_batches(kos_id, product_id, branch_id, lot, expiry, qty, received_qty, ref_id, note)
    values (new.kos_id, new.product_id, new.branch_id, nullif(trim(coalesce(v_in->>'lot', '')), ''), nullif(v_in->>'expiry', '')::date, new.delta, new.delta, new.ref_id, new.note);
  elsif new.kind = 'beli' then
    insert into stock_batches(kos_id, product_id, branch_id, qty, received_qty, ref_id, note) values (new.kos_id, new.product_id, new.branch_id, new.delta, new.delta, new.ref_id, new.note);
  else
    -- retur/batal/koreksi/opname lebih: kembali ke batch terbaru di lokasi ini
    select * into b from stock_batches where product_id = new.product_id and branch_id = new.branch_id order by received_at desc limit 1 for update;
    if b.id is not null then update stock_batches set qty = qty + new.delta where id = b.id;
    else insert into stock_batches(kos_id, product_id, branch_id, qty, received_qty, ref_id, note) values (new.kos_id, new.product_id, new.branch_id, new.delta, new.delta, new.ref_id, new.note); end if;
  end if;
  perform set_config('prasara.batch', '', true);
  return null;
end $$;
drop trigger if exists stock_moves_batch on public.stock_moves;
create trigger stock_moves_batch after insert on public.stock_moves for each row execute function public.stock_moves_batch();

create or replace function public._prasara_patch(p_sig text, p_old text, p_new text)
returns void language plpgsql as $$
declare d text;
begin
  d := pg_get_functiondef(p_sig::regprocedure);
  if position(p_old in d) = 0 then raise exception 'patch %: potongan tidak ditemukan', p_sig; end if;
  execute replace(d, p_old, p_new);
end $$;

-- Belanja: tanggal kedaluwarsa & no. batch per baris
select public._prasara_patch('public.purchase_order_create(uuid,uuid,date,uuid,jsonb,text,date,text,date)',
  'insert into purchase_lines(purchase_id, kos_id, product_id, name, unit, unit_qty, qty, price, line_total, qty_received)
    values (p_id, p_kos, p.id, p.name, u.name, u.qty, v_qty, v_price, 0, 0);',
  'insert into purchase_lines(purchase_id, kos_id, product_id, name, unit, unit_qty, qty, price, line_total, qty_received, expiry, lot)
    values (p_id, p_kos, p.id, p.name, u.name, u.qty, v_qty, v_price, 0, 0, nullif(l->>''expiry'', '''')::date, nullif(trim(coalesce(l->>''lot'', '''')), ''''));');
select public._prasara_patch('public.purchase_receive(uuid,jsonb,date,boolean)',
  '    insert into stock_moves(kos_id, product_id, kind, delta, stock_after, value, ref_id, note)
    values (b.kos_id, p.id, ''beli'', v_base, p.stock + v_base, round(v_qty * v_price, 2), b.id, b.number);',
  '    perform set_config(''prasara.batch'', jsonb_build_object(''expiry'', coalesce(nullif(x->>''expiry'', ''''), l.expiry::text), ''lot'', coalesce(nullif(x->>''lot'', ''''), l.lot))::text, true);
    insert into stock_moves(kos_id, product_id, kind, delta, stock_after, value, ref_id, note)
    values (b.kos_id, p.id, ''beli'', v_base, p.stock + v_base, round(v_qty * v_price, 2), b.id, b.number);
    update purchase_lines set expiry = coalesce(nullif(x->>''expiry'', '''')::date, expiry), lot = coalesce(nullif(x->>''lot'', ''''), lot) where id = l.id;');

drop function public._prasara_patch(text, text, text);

-- Nyalakan/matikan pencatatan kedaluwarsa + waktu tunggu supplier (hari)
create or replace function public.product_set_tracking(p_product uuid, p_track boolean, p_lead_days int default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare p products; v_n int := 0;
begin
  select * into p from products where id = p_product for update;
  if p.id is null or not member_in('stock', p.kos_id) then raise exception 'Barang tidak ditemukan'; end if;
  if p_lead_days is not null and (p_lead_days < 0 or p_lead_days > 120) then raise exception 'Waktu tunggu 0–120 hari'; end if;
  update products set track_expiry = coalesce(p_track, track_expiry), lead_days = p_lead_days where id = p.id;
  -- baru dinyalakan: stok yang ada jadi batch "tanpa tanggal" per lokasi (tanggalnya bisa diisi di Kedaluwarsa)
  if coalesce(p_track, false) and not p.track_expiry then
    insert into stock_batches(kos_id, product_id, branch_id, qty, received_qty, note)
    select p.kos_id, p.id, sl.branch_id, sl.qty, sl.qty, 'Stok saat pencatatan kedaluwarsa dinyalakan'
    from stock_levels sl where sl.product_id = p.id and sl.qty > 0
      and not exists (select 1 from stock_batches b where b.product_id = p.id and b.branch_id = sl.branch_id and b.qty > 0);
    get diagnostics v_n = row_count;
  end if;
  return jsonb_build_object('track_expiry', coalesce(p_track, p.track_expiry), 'lead_days', p_lead_days, 'batches_created', v_n);
end $$;

-- Ubah tanggal/no. batch (mis. mengisi tanggal untuk batch "tanpa tanggal")
create or replace function public.batch_set(p_batch uuid, p_expiry date, p_lot text)
returns void language plpgsql security definer set search_path = public as $$
declare b stock_batches;
begin
  select * into b from stock_batches where id = p_batch for update;
  if b.id is null or not member_in('stock', b.kos_id) then raise exception 'Batch tidak ditemukan'; end if;
  update stock_batches set expiry = p_expiry, lot = nullif(trim(coalesce(p_lot, '')), '') where id = b.id;
end $$;

-- Pisahkan sebagian stok sebuah batch menjadi batch dengan tanggal lain (mis. stok lama berisi dua tanggal)
create or replace function public.batch_split(p_batch uuid, p_qty numeric, p_expiry date, p_lot text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare b stock_batches; v_id uuid;
begin
  select * into b from stock_batches where id = p_batch for update;
  if b.id is null or not member_in('stock', b.kos_id) then raise exception 'Batch tidak ditemukan'; end if;
  if p_qty is null or p_qty <= 0 or p_qty > b.qty then raise exception 'Jumlah dipisah harus 1 sampai %', trim(to_char(b.qty, 'FM999999990.###')); end if;
  update stock_batches set qty = qty - p_qty where id = b.id;
  insert into stock_batches(kos_id, product_id, branch_id, lot, expiry, qty, received_qty, received_at, ref_id, note)
  values (b.kos_id, b.product_id, b.branch_id, nullif(trim(coalesce(p_lot, '')), ''), p_expiry, p_qty, p_qty, b.received_at, b.ref_id, 'Dipisah dari batch ' || coalesce(b.lot, to_char(b.expiry, 'DD-MM-YYYY'), 'tanpa tanggal'))
  returning id into v_id;
  return v_id;
end $$;

-- Buang batch tertentu (kedaluwarsa/rusak): penyesuaian stok dari batch & lokasi batch itu
create or replace function public.batch_writeoff(p_batch uuid, p_qty numeric, p_reason text, p_note text default null)
returns numeric language plpgsql security definer set search_path = public as $$
declare b stock_batches; p products;
begin
  select * into b from stock_batches where id = p_batch for update;
  if b.id is null or not member_in('stock', b.kos_id) then raise exception 'Batch tidak ditemukan'; end if;
  if approval_needed(b.kos_id, 'penyesuaian_stok') then raise exception 'PERLU_PERSETUJUAN: Tindakan ini perlu persetujuan pemilik. Kirim permintaan dari aplikasi.'; end if;
  if p_reason not in ('kedaluwarsa', 'rusak') then raise exception 'Alasan: kedaluwarsa atau rusak'; end if;
  if p_qty is null or p_qty <= 0 or p_qty > b.qty then raise exception 'Jumlah dibuang 1 sampai %', trim(to_char(b.qty, 'FM999999990.###')); end if;
  select * into p from products where id = b.product_id for update;
  perform set_config('prasara.batch_target', b.id::text, true);
  update products set stock = stock - p_qty where id = p.id;
  insert into stock_moves(kos_id, product_id, kind, delta, stock_after, value, note, branch_id, ref_id)
  values (b.kos_id, p.id, p_reason, -p_qty, p.stock - p_qty, round(-p_qty * p.cost, 2),
    coalesce(nullif(trim(coalesce(p_note, '')), ''), 'Batch ' || coalesce(b.lot, '') || coalesce(' exp ' || to_char(b.expiry, 'DD-MM-YYYY'), '')), b.branch_id, b.id);
  perform set_config('prasara.batch_target', '', true);
  return p_qty;
end $$;

-- Daftar batch akan/sudah kedaluwarsa (dan semua batch bila p_days null)
create or replace function public.expiry_list(p_kos uuid, p_days int default 60)
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', b.id, 'product_id', b.product_id, 'name', p.name, 'unit', p.base_unit, 'lot', b.lot, 'expiry', b.expiry,
      'days', b.expiry - (now() at time zone 'Asia/Jakarta')::date, 'qty', b.qty, 'value', round(b.qty * p.cost, 2), 'branch_id', b.branch_id,
      'branch', (select name from branches where id = b.branch_id), 'received_at', b.received_at)
    order by b.expiry nulls last, p.name), '[]')
  from stock_batches b join products p on p.id = b.product_id
  where b.kos_id = p_kos and b.qty > 0 and p.track_expiry and member_in('stock,sell,finance', p_kos)
    and (p_days is null or b.expiry is null or b.expiry <= (now() at time zone 'Asia/Jakarta')::date + p_days);
$$;

-- Saran belanja ulang
-- rata-rata keluar/hari = (jual + pakai − retur jual) selama p_lookback hari; titik pesan = max(stok minimum, rata × (waktu tunggu + cadangan));
-- saran = rata × (waktu tunggu + p_cover) − stok − pesanan belum datang, dibulatkan ke satuan beli terbesar.
create or replace function public.reorder_suggest(p_kos uuid, p_cover int default 14, p_lookback int default 30, p_safety int default 2)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_res jsonb;
begin
  if not member_in('stock', p_kos) then raise exception 'Tidak punya akses ke bisnis ini'; end if;
  with usage as (
    select m.product_id, -sum(m.delta) filter (where m.kind in ('jual', 'pakai', 'retur_jual')) out_qty
    from stock_moves m where m.kos_id = p_kos and m.created_at >= now() - make_interval(days => greatest(p_lookback, 7)) group by 1
  ), onorder as (
    select l.product_id, sum(greatest(l.qty - l.qty_received, 0) * l.unit_qty) qty
    from purchase_lines l join purchases b on b.id = l.purchase_id where b.kos_id = p_kos and b.status in ('dipesan', 'sebagian') group by 1
  ), lastbuy as (
    select distinct on (l.product_id) l.product_id, b.contact_id, l.unit, l.unit_qty, l.price, b.purchase_date
    from purchase_lines l join purchases b on b.id = l.purchase_id where b.kos_id = p_kos and b.status in ('selesai', 'sebagian') and l.qty_received > 0
    order by l.product_id, b.purchase_date desc, b.created_at desc
  ), calc as (
    select p.id, p.name, p.base_unit, p.stock, p.min_stock, coalesce(p.lead_days, 3) lead, p.cost,
      round(coalesce(u.out_qty, 0) / greatest(p_lookback, 7), 3) per_day, coalesce(o.qty, 0) on_order, lb.contact_id, lb.unit buy_unit, lb.unit_qty buy_qty, lb.price buy_price,
      (select name from product_units pu where pu.product_id = p.id order by pu.qty desc limit 1) big_unit,
      (select qty from product_units pu where pu.product_id = p.id order by pu.qty desc limit 1) big_qty
    from products p left join usage u on u.product_id = p.id left join onorder o on o.product_id = p.id left join lastbuy lb on lb.product_id = p.id
    where p.kos_id = p_kos and p.active
  ), rec as (
    select c.*, greatest(c.min_stock, round(c.per_day * (c.lead + p_safety), 3)) rop,
      greatest(0, round(c.per_day * (c.lead + p_cover) + c.min_stock - c.stock - c.on_order, 3)) need
    from calc c
  )
  select coalesce(jsonb_agg(jsonb_build_object('product_id', r.id, 'name', r.name, 'base_unit', r.base_unit, 'stock', r.stock, 'min_stock', r.min_stock,
      'per_day', r.per_day, 'days_left', case when r.per_day > 0 then floor(r.stock / r.per_day) end, 'lead_days', r.lead, 'on_order', r.on_order, 'reorder_point', r.rop,
      'need', r.need, 'unit', coalesce(r.buy_unit, r.big_unit, r.base_unit), 'unit_qty', coalesce(r.buy_qty, r.big_qty, 1),
      'suggest', ceil(r.need / coalesce(nullif(r.buy_qty, 0), nullif(r.big_qty, 0), 1)), 'price', coalesce(r.buy_price, round(r.cost * coalesce(r.buy_qty, r.big_qty, 1), 2)),
      'supplier_id', r.contact_id, 'supplier', (select name from contacts where id = r.contact_id),
      'reason', case when r.stock <= 0 then 'habis' when r.stock + r.on_order <= r.min_stock then 'di bawah stok minimum' else 'akan habis dalam ' || floor(r.stock / nullif(r.per_day, 0)) || ' hari' end)
    order by case when r.stock <= 0 then 0 else 1 end, r.stock / nullif(r.per_day, 0) nulls last, r.name), '[]')
  into v_res
  from rec r where r.need > 0 and r.stock + r.on_order <= r.rop and (r.per_day > 0 or r.min_stock > 0);
  return v_res;
end $$;

revoke execute on function public.stock_moves_batch() from public, anon, authenticated;
revoke execute on function public.product_set_tracking(uuid, boolean, int), public.batch_set(uuid, date, text), public.batch_split(uuid, numeric, date, text),
  public.batch_writeoff(uuid, numeric, text, text), public.expiry_list(uuid, int), public.reorder_suggest(uuid, int, int, int) from public, anon;
grant execute on function public.product_set_tracking(uuid, boolean, int), public.batch_set(uuid, date, text), public.batch_split(uuid, numeric, date, text),
  public.batch_writeoff(uuid, numeric, text, text), public.expiry_list(uuid, int), public.reorder_suggest(uuid, int, int, int) to authenticated;

-- Module Registry: batch & kedaluwarsa siap dipakai (Retail + bahan Jasa/Kuliner)
update public.modules set impl_status = 'production_ready', applies_to = '{retail,jasa}', paths = '{/barang?tab=kedaluwarsa}',
  description = 'Tanggal kedaluwarsa & no. batch per barang (dicatat saat belanja), stok keluar otomatis dari yang paling cepat kedaluwarsa (FEFO), daftar barang mendekati/lewat kedaluwarsa, buang batch, dan saran belanja ulang.',
  data_used = 'stock_batches, purchase_lines (expiry, lot), stock_moves', config_path = '/barang', area = 'stock'
where code = 'r_batch';
insert into public.business_modules(kos_id, module_code, active, updated_by)
select k.id, 'r_batch', true, 'sistem' from public.kos k where k.business_type in ('retail', 'jasa') on conflict do nothing;
