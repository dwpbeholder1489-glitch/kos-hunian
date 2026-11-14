-- Toko lanjutan 1 (audit ulang V2.0, 15 Nov 2026): kategori barang, varian produk, tutup harian, KPI toko.
-- Prinsip:
--   * Varian = barang biasa (stok, modal, harga, barcode, SKU sendiri) yang dikelompokkan lewat products.variant_group_id.
--     Semua mesin lama (Kasir, Belanja, stok, batch, promo, laporan) tidak berubah. Nama barang = "Nama grup — label varian".
--     Setiap varian dihitung 1 barang untuk batas paket (limit_produk), sama seperti barang biasa.
--   * Tutup harian = rekap + bukti, BUKAN kunci: transaksi tanggal itu tetap boleh dikoreksi (jangan menghalangi kenyataan);
--     bila berubah setelah ditutup, daftar menandai "berubah setelah ditutup" dan pemilik bisa tutup ulang (riwayat tersimpan).
--   * KPI dihitung server dari data nyata (sales, sale_returns, stock_moves, cash_shifts).

-- ---------- Kategori ----------
create table if not exists public.product_categories (
  id uuid primary key default gen_random_uuid(),
  kos_id uuid not null references public.kos(id) on delete cascade,
  name text not null check (length(trim(name)) between 1 and 40),
  sort int not null default 0,
  created_at timestamptz not null default now()
);
create unique index if not exists product_categories_name on public.product_categories(kos_id, lower(name));
alter table public.products add column if not exists category_id uuid references public.product_categories(id) on delete set null;
create index if not exists products_category on public.products(category_id) where category_id is not null;

-- ---------- Varian ----------
create table if not exists public.product_variant_groups (
  id uuid primary key default gen_random_uuid(),
  kos_id uuid not null references public.kos(id) on delete cascade,
  name text not null check (length(trim(name)) between 1 and 80),
  attrs jsonb not null default '[]'::jsonb,      -- [{name:'Ukuran', values:['S','M','L']}, ...] (untuk membuat kombinasi baru)
  created_at timestamptz not null default now()
);
alter table public.products add column if not exists variant_group_id uuid references public.product_variant_groups(id) on delete set null;
alter table public.products add column if not exists variant_label text;
create index if not exists products_variant on public.products(variant_group_id) where variant_group_id is not null;
create unique index if not exists products_variant_label on public.products(variant_group_id, lower(variant_label)) where variant_group_id is not null;

-- ---------- Tutup harian ----------
create table if not exists public.day_closings (
  id uuid primary key default gen_random_uuid(),
  kos_id uuid not null references public.kos(id) on delete cascade,
  branch_id uuid references public.branches(id),   -- null = semua lokasi (bisnis satu lokasi)
  day date not null,
  snapshot jsonb not null,
  cash_book numeric(14,2),        -- saldo kas menurut catatan di akhir hari
  cash_counted numeric(14,2),     -- uang dihitung (opsional)
  note text,
  log jsonb not null default '[]'::jsonb,   -- penutupan sebelumnya (tutup ulang)
  closed_by uuid default auth.uid(), closed_at timestamptz not null default now()
);
create unique index if not exists day_closings_day on public.day_closings(kos_id, coalesce(branch_id, '00000000-0000-0000-0000-000000000000'::uuid), day);

do $$
declare t text; a text;
begin
  foreach t in array array['product_categories', 'product_variant_groups', 'day_closings'] loop
    a := case t when 'day_closings' then 'finance' else 'stock,sell,finance' end;
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists %I on public.%I', t || '_select', t);
    execute format('create policy %I on public.%I for select using (member_can(kos_id, %L))', t || '_select', t, a);
    execute format('grant select on public.%I to authenticated', t);
    execute format('drop trigger if exists zz_kos_open_guard on public.%I', t);
    execute format('create trigger zz_kos_open_guard before insert or update or delete on public.%I for each row execute function public.kos_open_guard()', t);
  end loop;
end $$;

-- ---------- Kategori: RPC ----------
create or replace function public.category_save(p_kos uuid, p_id uuid, p_name text)
returns uuid language plpgsql security definer set search_path = public as $$
declare v uuid; v_name text := trim(coalesce(p_name, ''));
begin
  if not member_in('stock', p_kos) then raise exception 'Tidak punya akses ke bisnis ini'; end if;
  if length(v_name) < 1 or length(v_name) > 40 then raise exception 'Nama kategori 1–40 huruf'; end if;
  if exists (select 1 from product_categories where kos_id = p_kos and lower(name) = lower(v_name) and id is distinct from p_id) then raise exception 'Kategori "%" sudah ada', v_name; end if;
  if p_id is null then
    insert into product_categories(kos_id, name, sort) values (p_kos, v_name, coalesce((select max(sort) + 1 from product_categories where kos_id = p_kos), 0)) returning id into v;
  else
    update product_categories set name = v_name where id = p_id and kos_id = p_kos returning id into v;
    if v is null then raise exception 'Kategori tidak ditemukan'; end if;
  end if;
  return v;
end $$;

create or replace function public.category_delete(p_id uuid)
returns int language plpgsql security definer set search_path = public as $$
declare c product_categories; n int;
begin
  select * into c from product_categories where id = p_id;
  if c.id is null or not member_in('stock', c.kos_id) then raise exception 'Kategori tidak ditemukan'; end if;
  select count(*) into n from products where category_id = c.id;
  update products set category_id = null where category_id = c.id;
  delete from product_categories where id = c.id;
  return n;   -- jumlah barang yang kini tanpa kategori
end $$;

-- Pasang kategori ke satu atau banyak barang sekaligus (null = lepaskan)
create or replace function public.product_set_category(p_products uuid[], p_category uuid)
returns int language plpgsql security definer set search_path = public as $$
declare v_kos uuid; n int;
begin
  select kos_id into v_kos from products where id = any(p_products) limit 1;
  if v_kos is null or not member_in('stock', v_kos) then raise exception 'Barang tidak ditemukan'; end if;
  if exists (select 1 from products where id = any(p_products) and kos_id <> v_kos) then raise exception 'Barang tidak valid'; end if;
  if p_category is not null and not exists (select 1 from product_categories where id = p_category and kos_id = v_kos) then raise exception 'Kategori tidak ditemukan'; end if;
  update products set category_id = p_category where id = any(p_products);
  get diagnostics n = row_count;
  return n;
end $$;

-- ---------- Varian: RPC ----------
-- Membuat grup baru (p_group null) atau menambah varian ke grup yang ada.
-- p_template: {base, cost, min, category_id, units:[{name, content_qty, content_unit, price_retail, price_wholesale}] (satuan selain satuan utama)}
-- p_variants: [{label, sku, barcode, price_retail, price_wholesale, cost, stock}]  (harga/modal kosong = dari template)
create or replace function public.variant_save(p_kos uuid, p_group uuid, p_name text, p_attrs jsonb, p_template jsonb, p_variants jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare g product_variant_groups; v jsonb; u jsonb; v_label text; v_units jsonb; v_pid uuid; v_cost numeric; v_name text := trim(coalesce(p_name, ''));
        v_base text := trim(coalesce(p_template->>'base', '')); v_made jsonb := '[]'::jsonb; v_cat uuid := nullif(p_template->>'category_id', '')::uuid;
begin
  if not member_in('stock', p_kos) then raise exception 'Tidak punya akses ke bisnis ini'; end if;
  if jsonb_typeof(p_variants) <> 'array' or jsonb_array_length(p_variants) = 0 then raise exception 'Isi minimal satu varian'; end if;
  if jsonb_array_length(p_variants) > 60 then raise exception 'Maksimal 60 varian sekali simpan'; end if;
  if v_cat is not null and not exists (select 1 from product_categories where id = v_cat and kos_id = p_kos) then raise exception 'Kategori tidak ditemukan'; end if;
  if p_group is null then
    if length(v_name) < 1 or length(v_name) > 80 then raise exception 'Isi nama barang (grup varian)'; end if;
    insert into product_variant_groups(kos_id, name, attrs) values (p_kos, v_name, coalesce(p_attrs, '[]'::jsonb)) returning * into g;
  else
    select * into g from product_variant_groups where id = p_group and kos_id = p_kos for update;
    if g.id is null then raise exception 'Grup varian tidak ditemukan'; end if;
    if p_attrs is not null and jsonb_typeof(p_attrs) = 'array' then update product_variant_groups set attrs = p_attrs where id = g.id; end if;
  end if;
  if v_base = '' then raise exception 'Isi satuan utama'; end if;
  for v in select * from jsonb_array_elements(p_variants) loop
    v_label := trim(coalesce(v->>'label', ''));
    if length(v_label) < 1 or length(v_label) > 60 then raise exception 'Label varian 1–60 huruf'; end if;
    if exists (select 1 from products where variant_group_id = g.id and lower(variant_label) = lower(v_label)) then raise exception 'Varian "%" sudah ada di %', v_label, g.name; end if;
    v_cost := coalesce(nullif(v->>'cost', '')::numeric, nullif(p_template->>'cost', '')::numeric, 0);
    v_units := jsonb_build_array(jsonb_build_object('name', v_base,
                 'price_retail', coalesce(nullif(v->>'price_retail', '')::numeric, 0), 'price_wholesale', coalesce(nullif(v->>'price_wholesale', '')::numeric, 0),
                 'barcode', nullif(trim(coalesce(v->>'barcode', '')), '')));
    for u in select * from jsonb_array_elements(coalesce(p_template->'units', '[]'::jsonb)) loop
      v_units := v_units || jsonb_build_array(u - 'barcode');   -- barcode satuan lain tidak disalin (harus unik per varian)
    end loop;
    v_pid := product_save(p_kos, null, g.name || ' — ' || v_label, v_base, v_cost, coalesce(nullif(p_template->>'min', '')::numeric, 0), v_units,
                          coalesce(nullif(v->>'stock', '')::numeric, 0), nullif(trim(coalesce(v->>'sku', '')), ''), nullif(p_template->>'density', '')::numeric);
    update products set variant_group_id = g.id, variant_label = v_label, category_id = coalesce(v_cat, category_id) where id = v_pid;
    v_made := v_made || jsonb_build_array(jsonb_build_object('id', v_pid, 'label', v_label));
  end loop;
  return jsonb_build_object('group', g.id, 'name', g.name, 'made', v_made);
end $$;

-- Gabungkan barang yang sudah ada menjadi varian (mis. toko dulu membuat "Kaos M" dan "Kaos L" terpisah)
create or replace function public.variant_link(p_product uuid, p_group uuid, p_label text)
returns void language plpgsql security definer set search_path = public as $$
declare p products; g product_variant_groups; v_label text := trim(coalesce(p_label, ''));
begin
  select * into p from products where id = p_product for update;
  if p.id is null or not member_in('stock', p.kos_id) then raise exception 'Barang tidak ditemukan'; end if;
  if p_group is null then   -- lepaskan dari grup; nama tetap
    update products set variant_group_id = null, variant_label = null where id = p.id;
    return;
  end if;
  select * into g from product_variant_groups where id = p_group and kos_id = p.kos_id;
  if g.id is null then raise exception 'Grup varian tidak ditemukan'; end if;
  if length(v_label) < 1 or length(v_label) > 60 then raise exception 'Label varian 1–60 huruf'; end if;
  if exists (select 1 from products where variant_group_id = g.id and lower(variant_label) = lower(v_label) and id <> p.id) then raise exception 'Varian "%" sudah ada', v_label; end if;
  update products set variant_group_id = g.id, variant_label = v_label, name = g.name || ' — ' || v_label where id = p.id;
end $$;

-- Ganti nama grup → nama semua varian ikut
create or replace function public.variant_group_rename(p_group uuid, p_name text)
returns void language plpgsql security definer set search_path = public as $$
declare g product_variant_groups; v_name text := trim(coalesce(p_name, ''));
begin
  select * into g from product_variant_groups where id = p_group for update;
  if g.id is null or not member_in('stock', g.kos_id) then raise exception 'Grup varian tidak ditemukan'; end if;
  if length(v_name) < 1 or length(v_name) > 80 then raise exception 'Nama 1–80 huruf'; end if;
  update product_variant_groups set name = v_name where id = g.id;
  update products set name = v_name || ' — ' || variant_label where variant_group_id = g.id;
end $$;

-- ---------- Saldo kas menurut catatan per tanggal (sama dengan rumus Kas per lokasi, tetapi bertanggal) ----------
create or replace function public.cash_book_until(p_kos uuid, p_day date, p_branch uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  with main as (select id from branches where kos_id = p_kos and is_main limit 1),
  m as (
    select branch_id b, sale_date d, amt_tunai amt from sales where kos_id = p_kos and status = 'selesai' and amt_tunai <> 0
    union all select s.branch_id, r.return_date, -r.total from sale_returns r join sales s on s.id = r.sale_id where r.kos_id = p_kos and r.refund_method = 'tunai'
    union all select branch_id, purchase_date, -total from purchases where kos_id = p_kos and status in ('selesai', 'sebagian') and pay_method = 'tunai'
    union all select b.branch_id, r.return_date, r.total from purchase_returns r join purchases b on b.id = r.purchase_id where r.kos_id = p_kos and r.refund_method = 'tunai'
    union all select branch_id, date, case when kind = 'piutang' then amount else -amount end from debt_payments where kos_id = p_kos and status = 'selesai' and account = 'kas'
    union all select branch_id, (paid_at at time zone 'Asia/Jakarta')::date, case when kind = 'bayar' then amount else -amount end from svc_payments where kos_id = p_kos and status = 'selesai' and account = 'kas'
    union all select branch_id, date, -amount from expenses where kos_id = p_kos and account = 'kas'
    union all select branch_id, date, case when kind in ('pendapatan_lain', 'setoran_modal', 'pinjaman_masuk', 'tarik_bank') then amount
                                     when kind in ('prive', 'bayar_pinjaman', 'setor_bank', 'pindah_kas') then -amount else 0 end from cash_entries where kos_id = p_kos and account = 'kas'
    union all select to_branch, date, amount from cash_entries where kos_id = p_kos and kind = 'pindah_kas'
  ), f as (select amt, d from m where p_branch is null or coalesce(b, (select id from main)) = p_branch)
  select jsonb_build_object('akhir', coalesce(sum(amt) filter (where d <= p_day), 0), 'awal', coalesce(sum(amt) filter (where d < p_day), 0),
                            'masuk', coalesce(sum(amt) filter (where d = p_day and amt > 0), 0), 'keluar', coalesce(-sum(amt) filter (where d = p_day and amt < 0), 0))
  from f;
$$;

-- ---------- Tutup harian ----------
create or replace function public.day_close_summary(p_kos uuid, p_day date, p_branch uuid default null)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_main uuid; r jsonb;
begin
  if not member_in('finance', p_kos) then raise exception 'Tidak punya akses keuangan'; end if;
  if p_day is null or p_day > (now() at time zone 'Asia/Jakarta')::date then raise exception 'Tanggal tidak boleh di masa depan'; end if;
  if p_branch is not null and not exists (select 1 from branches where id = p_branch and kos_id = p_kos) then raise exception 'Lokasi tidak ditemukan'; end if;
  select id into v_main from branches where kos_id = p_kos and is_main limit 1;
  with s as (select * from sales where kos_id = p_kos and sale_date = p_day and (p_branch is null or coalesce(branch_id, v_main) = p_branch)),
  ok as (select * from s where status = 'selesai'),
  rt as (select r.* from sale_returns r join sales x on x.id = r.sale_id where r.kos_id = p_kos and r.return_date = p_day and (p_branch is null or coalesce(x.branch_id, v_main) = p_branch)),
  ppl as (select created_by u from ok union select created_by from rt union select created_by from s where status = 'batal')
  select jsonb_build_object(
    'day', p_day, 'branch', p_branch,
    'trx', (select count(*) from ok),
    'subtotal', (select coalesce(sum(subtotal), 0) from ok),
    'diskon', (select coalesce(sum(discount - promo_discount), 0) from ok),
    'promo', (select coalesce(sum(promo_discount), 0) from ok),
    'total', (select coalesce(sum(total), 0) from ok),
    'ppn', (select coalesce(sum(tax_amount), 0) from ok) - (select coalesce(sum(tax_amount), 0) from rt),
    'retur', (select coalesce(sum(total), 0) from rt), 'retur_n', (select count(*) from rt),
    'omzet', (select coalesce(sum(total - tax_amount), 0) from ok) - (select coalesce(sum(total - tax_amount), 0) from rt),
    'hpp', (select coalesce(sum(cost_total), 0) from ok) - (select coalesce(sum(cost_total), 0) from rt),
    'batal_n', (select count(*) from s where status = 'batal'), 'batal', (select coalesce(sum(total), 0) from s where status = 'batal'),
    'bayar', jsonb_build_object('tunai', (select coalesce(sum(amt_tunai), 0) from ok), 'transfer', (select coalesce(sum(amt_transfer), 0) from ok),
               'kasbon', (select coalesce(sum(amt_kasbon), 0) from ok),
               'retur_tunai', (select coalesce(sum(total), 0) from rt where refund_method = 'tunai')),
    'kasbon_diterima', (select coalesce(sum(amount), 0) from debt_payments where kos_id = p_kos and kind = 'piutang' and status = 'selesai' and date = p_day
                          and (p_branch is null or coalesce(branch_id, v_main) = p_branch)),
    'jam', (select jsonb_build_object('pertama', min(sold_at), 'terakhir', max(sold_at)) from ok),
    'kasir', (select coalesce(jsonb_agg(k order by k.omzet desc), '[]'::jsonb) from (
        select p.u as user_id,
               (select count(*) from ok where created_by is not distinct from p.u) as trx,
               (select coalesce(sum(total - tax_amount), 0) from ok where created_by is not distinct from p.u)
                 - (select coalesce(sum(total - tax_amount), 0) from rt where created_by is not distinct from p.u) as omzet,
               (select coalesce(sum(amt_tunai), 0) from ok where created_by is not distinct from p.u) as tunai,
               (select count(*) from rt where created_by is not distinct from p.u) as retur_n,
               (select count(*) from s where status = 'batal' and created_by is not distinct from p.u) as batal_n
        from ppl p) k),
    'shift', (select coalesce(jsonb_agg(jsonb_build_object('user_id', c.user_id, 'opened_at', c.opened_at, 'closed_at', c.closed_at, 'expected', c.expected_cash,
                 'counted', c.counted_cash, 'diff', c.counted_cash - c.expected_cash) order by c.opened_at), '[]'::jsonb)
              from cash_shifts c where c.kos_id = p_kos and (c.opened_at at time zone 'Asia/Jakarta')::date = p_day),
    'shift_terbuka', (select count(*) from cash_shifts c where c.kos_id = p_kos and c.closed_at is null and (c.opened_at at time zone 'Asia/Jakarta')::date <= p_day),
    'susut', (select coalesce(-sum(m.value), 0) from stock_moves m where m.kos_id = p_kos and m.kind in ('rusak', 'kedaluwarsa', 'opname', 'koreksi')
                and (m.created_at at time zone 'Asia/Jakarta')::date = p_day and (p_branch is null or coalesce(m.branch_id, v_main) = p_branch)),
    'kas', cash_book_until(p_kos, p_day, p_branch)
  ) into r;
  return r || jsonb_build_object('laba_kotor', (r->>'omzet')::numeric - (r->>'hpp')::numeric,
                                 'rata_keranjang', case when (r->>'trx')::int > 0 then round((r->>'omzet')::numeric / (r->>'trx')::int) else 0 end);
end $$;

create or replace function public.day_close(p_kos uuid, p_day date, p_branch uuid default null, p_counted numeric default null, p_note text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_sum jsonb; c day_closings; v_book numeric;
begin
  if not member_in('finance', p_kos) then raise exception 'Tidak punya akses keuangan'; end if;
  if p_counted is not null and p_counted < 0 then raise exception 'Uang dihitung tidak boleh minus'; end if;
  v_sum := day_close_summary(p_kos, p_day, p_branch);
  v_book := (v_sum->'kas'->>'akhir')::numeric;
  select * into c from day_closings where kos_id = p_kos and coalesce(branch_id, '00000000-0000-0000-0000-000000000000'::uuid) = coalesce(p_branch, '00000000-0000-0000-0000-000000000000'::uuid) and day = p_day for update;
  if c.id is null then
    insert into day_closings(kos_id, branch_id, day, snapshot, cash_book, cash_counted, note)
    values (p_kos, p_branch, p_day, v_sum, v_book, p_counted, nullif(trim(coalesce(p_note, '')), '')) returning * into c;
  else
    update day_closings set log = log || jsonb_build_array(jsonb_build_object('closed_at', c.closed_at, 'closed_by', c.closed_by, 'omzet', c.snapshot->'omzet', 'trx', c.snapshot->'trx',
             'cash_book', c.cash_book, 'cash_counted', c.cash_counted, 'note', c.note)),
           snapshot = v_sum, cash_book = v_book, cash_counted = p_counted, note = nullif(trim(coalesce(p_note, '')), ''), closed_by = auth.uid(), closed_at = now()
    where id = c.id returning * into c;
  end if;
  return jsonb_build_object('id', c.id, 'reclosed', jsonb_array_length(c.log) > 0, 'cash_book', v_book, 'diff', case when p_counted is null then null else p_counted - v_book end);
end $$;

-- Daftar penutupan + tanda "berubah setelah ditutup" (dibandingkan dengan hitungan sekarang)
create or replace function public.day_close_list(p_kos uuid, p_branch uuid default null)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_main uuid;
begin
  if not member_in('finance', p_kos) then raise exception 'Tidak punya akses keuangan'; end if;
  select id into v_main from branches where kos_id = p_kos and is_main limit 1;
  return (select coalesce(jsonb_agg(x order by x.day desc), '[]'::jsonb) from (
    select c.id, c.day, c.branch_id, c.cash_book, c.cash_counted, c.note, c.closed_by, c.closed_at, jsonb_array_length(c.log) as reclosed,
           (c.snapshot->>'omzet')::numeric as omzet, (c.snapshot->>'trx')::int as trx,
           l.trx <> (c.snapshot->>'trx')::int or abs(l.omzet - (c.snapshot->>'omzet')::numeric) > 0.5 as berubah, l.trx as trx_now, l.omzet as omzet_now
    from day_closings c
    cross join lateral (
      select count(*) filter (where s.status = 'selesai')::int as trx,
             coalesce(sum(s.total - s.tax_amount) filter (where s.status = 'selesai'), 0)
               - coalesce((select sum(r.total - r.tax_amount) from sale_returns r join sales x on x.id = r.sale_id
                           where r.kos_id = p_kos and r.return_date = c.day and (c.branch_id is null or coalesce(x.branch_id, v_main) = c.branch_id)), 0) as omzet
      from sales s where s.kos_id = p_kos and s.sale_date = c.day and (c.branch_id is null or coalesce(s.branch_id, v_main) = c.branch_id)) l
    where c.kos_id = p_kos and (p_branch is null or c.branch_id is not distinct from p_branch)
    order by c.day desc limit 62) x);
end $$;

-- ---------- KPI toko ----------
create or replace function public.retail_kpi(p_kos uuid, p_from date, p_to date)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare r jsonb; v_days int; v_inv0 numeric; v_inv1 numeric; v_hpp numeric; v_omzet numeric; v_trx int;
begin
  if not member_in('finance', p_kos) then raise exception 'Tidak punya akses keuangan'; end if;
  if p_from is null or p_to is null or p_from > p_to then raise exception 'Periode tidak valid'; end if;
  v_days := p_to - p_from + 1;
  -- nilai persediaan menurut kartu stok (barang milik toko; titipan konsinyasi tidak dihitung)
  select coalesce(sum(m.value) filter (where (m.created_at at time zone 'Asia/Jakarta')::date < p_from), 0),
         coalesce(sum(m.value) filter (where (m.created_at at time zone 'Asia/Jakarta')::date <= p_to), 0)
    into v_inv0, v_inv1
  from stock_moves m join products p on p.id = m.product_id where m.kos_id = p_kos and p.consign_contact_id is null;
  with s as (select * from sales where kos_id = p_kos and status = 'selesai' and sale_date between p_from and p_to),
  rt as (select * from sale_returns where kos_id = p_kos and return_date between p_from and p_to),
  ln as (
    select l.product_id, l.line_total * case when s.subtotal > 0 then s.total / s.subtotal else 1 end - l.tax_amount as omzet, l.qty * l.unit_qty * l.cost as hpp
    from sale_lines l join s on s.id = l.sale_id
    union all select x.product_id, -x.amount, -x.qty * x.unit_qty * x.cost from sale_return_lines x join rt on rt.id = x.return_id),
  act as (select * from products where kos_id = p_kos and active)
  select jsonb_build_object(
    'from', p_from, 'to', p_to, 'hari', v_days,
    'trx', (select count(*) from s),
    'omzet', (select coalesce(sum(total - tax_amount), 0) from s) - (select coalesce(sum(total - tax_amount), 0) from rt),
    'hpp', (select coalesce(sum(cost_total), 0) from s) - (select coalesce(sum(cost_total), 0) from rt),
    'jenis_per_trx', (select round(avg(n), 1) from (select count(*) n from sale_lines l join s on s.id = l.sale_id group by l.sale_id) z),
    'retur', (select coalesce(sum(total), 0) from rt),
    'batal_n', (select count(*) from sales where kos_id = p_kos and status = 'batal' and sale_date between p_from and p_to),
    'batal', (select coalesce(sum(total), 0) from sales where kos_id = p_kos and status = 'batal' and sale_date between p_from and p_to),
    'stok_habis', (select count(*) from act where stock <= 0),
    'barang_aktif', (select count(*) from act),
    'sempat_habis', (select count(distinct m.product_id) from stock_moves m where m.kos_id = p_kos and m.kind = 'jual' and m.stock_after <= 0
                       and (m.created_at at time zone 'Asia/Jakarta')::date between p_from and p_to),
    'susut', (select coalesce(-sum(value), 0) from stock_moves where kos_id = p_kos and kind in ('rusak', 'kedaluwarsa') and (created_at at time zone 'Asia/Jakarta')::date between p_from and p_to),
    'selisih_hitung', (select coalesce(-sum(value), 0) from stock_moves where kos_id = p_kos and kind in ('opname', 'koreksi') and (created_at at time zone 'Asia/Jakarta')::date between p_from and p_to),
    'persediaan_awal', v_inv0, 'persediaan_akhir', v_inv1,
    'kasir', (select coalesce(jsonb_agg(k order by k.omzet desc), '[]'::jsonb) from (
        select u.u as user_id,
               (select count(*) from s where created_by is not distinct from u.u) as trx,
               (select coalesce(sum(total - tax_amount), 0) from s where created_by is not distinct from u.u)
                 - (select coalesce(sum(total - tax_amount), 0) from rt where created_by is not distinct from u.u) as omzet,
               (select count(*) from rt where created_by is not distinct from u.u) as retur_n,
               (select coalesce(sum(total), 0) from rt where created_by is not distinct from u.u) as retur,
               (select count(*) from sales where kos_id = p_kos and status = 'batal' and sale_date between p_from and p_to and created_by is not distinct from u.u) as batal_n,
               (select coalesce(sum(total), 0) from sales where kos_id = p_kos and status = 'batal' and sale_date between p_from and p_to and created_by is not distinct from u.u) as batal,
               (select count(*) from cash_shifts c where c.kos_id = p_kos and c.user_id = u.u and c.closed_at is not null and abs(c.counted_cash - c.expected_cash) >= 1
                  and (c.opened_at at time zone 'Asia/Jakarta')::date between p_from and p_to) as shift_selisih_n,
               (select coalesce(sum(c.counted_cash - c.expected_cash), 0) from cash_shifts c where c.kos_id = p_kos and c.user_id = u.u and c.closed_at is not null
                  and (c.opened_at at time zone 'Asia/Jakarta')::date between p_from and p_to) as shift_selisih
        from (select created_by u from s union select created_by from rt union select created_by from sales where kos_id = p_kos and status = 'batal' and sale_date between p_from and p_to) u) k),
    'kategori', (select coalesce(jsonb_agg(c order by c.omzet desc), '[]'::jsonb) from (
        select coalesce(pc.name, 'Tanpa kategori') as name, pc.id, round(sum(ln.omzet), 2) as omzet, round(sum(ln.omzet) - sum(ln.hpp), 2) as laba
        from ln join products p on p.id = ln.product_id left join product_categories pc on pc.id = p.category_id
        group by pc.id, pc.name) c),
    'varian', (select coalesce(jsonb_agg(v order by v.omzet desc), '[]'::jsonb) from (
        select g.name, round(sum(ln.omzet), 2) as omzet,
               (select jsonb_agg(jsonb_build_object('label', z.label, 'omzet', z.omzet) order by z.omzet desc) from (
                  select p2.variant_label as label, round(sum(l2.omzet), 2) as omzet from ln l2 join products p2 on p2.id = l2.product_id
                  where p2.variant_group_id = g.id group by p2.variant_label) z) as rinci
        from ln join products p on p.id = ln.product_id join product_variant_groups g on g.id = p.variant_group_id
        group by g.id, g.name) v)
  ) into r;
  v_hpp := (r->>'hpp')::numeric; v_omzet := (r->>'omzet')::numeric; v_trx := (r->>'trx')::int;
  return r || jsonb_build_object(
    'rata_keranjang', case when v_trx > 0 then round(v_omzet / v_trx) end,
    'margin_pct', case when v_omzet > 0 then round(100 * (v_omzet - v_hpp) / v_omzet, 1) end,
    'perputaran', case when (v_inv0 + v_inv1) > 0 then round(v_hpp / ((v_inv0 + v_inv1) / 2), 2) end,
    'hari_persediaan', case when v_hpp > 0 and (v_inv0 + v_inv1) > 0 then round(((v_inv0 + v_inv1) / 2) / (v_hpp / v_days)) end,
    'susut_pct', case when v_omzet > 0 then round(100 * (r->>'susut')::numeric / v_omzet, 2) end,
    'stok_habis_pct', case when (r->>'barang_aktif')::int > 0 then round(100.0 * (r->>'stok_habis')::int / (r->>'barang_aktif')::int, 1) end);
end $$;

-- ---------- Riwayat aktivitas: tutup harian ----------
create or replace function public.dom_day_closings() returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform dom_emit(new.kos_id, 'DayClosed', 'day_closing', new.id, new.id::text || ':' || extract(epoch from new.closed_at)::bigint, 'finance',
    'Tutup harian ' || to_char(new.day, 'DD-MM-YYYY') || ' · omzet ' || dom_rp((new.snapshot->>'omzet')::numeric)
      || case when new.cash_counted is not null then ' · selisih kas ' || dom_rp(new.cash_counted - new.cash_book) else '' end,
    (new.snapshot->>'omzet')::numeric, jsonb_build_object('day', new.day, 'reclosed', jsonb_array_length(new.log)));
  return null;
end $$;
drop trigger if exists dom_day_closings on public.day_closings;
create trigger dom_day_closings after insert or update on public.day_closings for each row execute function public.dom_day_closings();

revoke execute on function public.cash_book_until(uuid, date, uuid), public.dom_day_closings() from public, anon, authenticated;
revoke execute on function public.category_save(uuid, uuid, text), public.category_delete(uuid), public.product_set_category(uuid[], uuid),
  public.variant_save(uuid, uuid, text, jsonb, jsonb, jsonb), public.variant_link(uuid, uuid, text), public.variant_group_rename(uuid, text),
  public.day_close_summary(uuid, date, uuid), public.day_close(uuid, date, uuid, numeric, text), public.day_close_list(uuid, uuid), public.retail_kpi(uuid, date, date) from public, anon;
grant execute on function public.category_save(uuid, uuid, text), public.category_delete(uuid), public.product_set_category(uuid[], uuid),
  public.variant_save(uuid, uuid, text, jsonb, jsonb, jsonb), public.variant_link(uuid, uuid, text), public.variant_group_rename(uuid, text),
  public.day_close_summary(uuid, date, uuid), public.day_close(uuid, date, uuid, numeric, text), public.day_close_list(uuid, uuid), public.retail_kpi(uuid, date, date) to authenticated;
