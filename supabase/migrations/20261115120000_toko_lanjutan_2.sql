-- Toko lanjutan 2 (audit ulang V2.0): harga per jumlah beli, komisi kasir, pemeriksaan kehilangan, kebijakan stok minus.
-- Prinsip:
--   * Harga per jumlah beli (price_breaks) dipakai server di sale_create & promo_preview: harga = yang TERENDAH antara harga satuan biasa dan
--     harga jumlah yang memenuhi syarat. Baris berharga manual tidak terpengaruh. Promo tetap dihitung sesudahnya seperti biasa.
--   * Komisi dihitung dari penjualan bersih (tanpa PPN, setelah retur) yang dicatat tiap kasir; dibayar lewat Gaji (bonus) agar
--     kas & jurnal tetap satu pintu (pengeluaran "Gaji karyawan"). Tidak ada utang komisi terpisah (akrual BELUM).
--   * Pemeriksaan kehilangan = daftar temuan dengan aturan tetap & terbuka, BUKAN tuduhan; tidak memblokir transaksi.
--   * Stok minus: bawaan 'izinkan' (seperti sebelumnya). 'tolak' menolak penjualan yang membuat stok lokasi minus (pesan STOK_KURANG:).

-- ---------- Harga per jumlah beli ----------
create table if not exists public.price_breaks (
  id uuid primary key default gen_random_uuid(),
  kos_id uuid not null references public.kos(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  unit text not null,
  tier text not null default 'semua' check (tier in ('semua', 'ecer', 'grosir')),
  min_qty numeric(14,3) not null check (min_qty > 1),
  price numeric(14,2) not null check (price >= 0)
);
create unique index if not exists price_breaks_uq on public.price_breaks(product_id, unit, tier, min_qty);

-- harga jumlah yang berlaku untuk qty ini (null = tidak ada)
create or replace function public.price_break(p_product uuid, p_unit text, p_tier text, p_qty numeric)
returns numeric language sql stable security definer set search_path = public as $$
  select b.price from price_breaks b
  where b.product_id = p_product and b.unit = p_unit and b.tier in ('semua', coalesce(nullif(p_tier, ''), 'ecer')) and b.min_qty <= p_qty
  order by b.min_qty desc, b.price limit 1;
$$;

create or replace function public.price_breaks_set(p_product uuid, p_unit text, p_rows jsonb)
returns int language plpgsql security definer set search_path = public as $$
declare p products; r jsonb; n int := 0; v_min numeric; v_price numeric; v_tier text;
begin
  select * into p from products where id = p_product;
  if p.id is null or not member_in('finance', p.kos_id) then raise exception 'Barang tidak ditemukan'; end if;
  if not exists (select 1 from product_units where product_id = p.id and name = p_unit) then raise exception 'Satuan tidak ditemukan'; end if;
  if jsonb_typeof(coalesce(p_rows, '[]'::jsonb)) <> 'array' or jsonb_array_length(coalesce(p_rows, '[]'::jsonb)) > 10 then raise exception 'Maksimal 10 tingkat harga per satuan'; end if;
  delete from price_breaks where product_id = p.id and unit = p_unit;
  for r in select * from jsonb_array_elements(coalesce(p_rows, '[]'::jsonb)) loop
    v_min := nullif(r->>'min_qty', '')::numeric; v_price := nullif(r->>'price', '')::numeric; v_tier := coalesce(nullif(r->>'tier', ''), 'semua');
    if v_min is null and v_price is null then continue; end if;
    if v_min is null or v_min <= 1 then raise exception 'Jumlah minimal harus lebih dari 1 %', p_unit; end if;
    if v_price is null or v_price < 0 then raise exception 'Isi harga untuk beli ≥ % %', trim(to_char(v_min, 'FM999999990.###'), '.'), p_unit; end if;
    if exists (select 1 from price_breaks where product_id = p.id and unit = p_unit and tier = v_tier and min_qty = v_min) then raise exception 'Jumlah minimal % tertulis dua kali', v_min; end if;
    insert into price_breaks(kos_id, product_id, unit, tier, min_qty, price) values (p.kos_id, p.id, p_unit, v_tier, v_min, v_price);
    n := n + 1;
  end loop;
  return n;
end $$;

-- ---------- Komisi ----------
create table if not exists public.commission_rules (
  id uuid primary key default gen_random_uuid(),
  kos_id uuid not null references public.kos(id) on delete cascade,
  user_id uuid,                                            -- null = semua kasir
  category_id uuid references public.product_categories(id) on delete cascade,   -- null = semua barang
  rate numeric(5,2) not null check (rate > 0 and rate <= 50),   -- persen dari penjualan bersih
  created_at timestamptz not null default now()
);
create unique index if not exists commission_rules_uq on public.commission_rules(kos_id, coalesce(user_id, '00000000-0000-0000-0000-000000000000'::uuid), coalesce(category_id, '00000000-0000-0000-0000-000000000000'::uuid));
create table if not exists public.commission_payouts (
  id uuid primary key default gen_random_uuid(),
  kos_id uuid not null references public.kos(id) on delete cascade,
  month date not null,
  user_id uuid not null,
  amount numeric(14,2) not null,
  payroll_line_id uuid references public.payroll_lines(id) on delete cascade,
  created_by uuid default auth.uid(), created_at timestamptz not null default now()
);
create unique index if not exists commission_payouts_uq on public.commission_payouts(kos_id, month, user_id);

do $$
declare t text;
begin
  foreach t in array array['price_breaks', 'commission_rules', 'commission_payouts'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists %I on public.%I', t || '_select', t);
    execute format('create policy %I on public.%I for select using (member_can(kos_id, %L))', t || '_select', t, case when t = 'price_breaks' then 'sell,stock,finance' else 'finance' end);
    execute format('grant select on public.%I to authenticated', t);
    execute format('drop trigger if exists zz_kos_open_guard on public.%I', t);
    execute format('create trigger zz_kos_open_guard before insert or update or delete on public.%I for each row execute function public.kos_open_guard()', t);
  end loop;
end $$;

create or replace function public.commission_rule_save(p_kos uuid, p_user uuid, p_category uuid, p_rate numeric)
returns uuid language plpgsql security definer set search_path = public as $$
declare v uuid;
begin
  if not member_in('finance', p_kos) then raise exception 'Tidak punya akses keuangan'; end if;
  if p_user is not null and not exists (select 1 from kos_members where kos_id = p_kos and user_id = p_user) and not exists (select 1 from kos where id = p_kos and owner_id = p_user) then raise exception 'Karyawan tidak ditemukan'; end if;
  if p_category is not null and not exists (select 1 from product_categories where id = p_category and kos_id = p_kos) then raise exception 'Kategori tidak ditemukan'; end if;
  if p_rate is null or p_rate <= 0 then   -- 0/kosong = hapus aturan
    delete from commission_rules where kos_id = p_kos and user_id is not distinct from p_user and category_id is not distinct from p_category;
    return null;
  end if;
  if p_rate > 50 then raise exception 'Komisi maksimal 50%%'; end if;
  insert into commission_rules(kos_id, user_id, category_id, rate) values (p_kos, p_user, p_category, p_rate)
  on conflict (kos_id, coalesce(user_id, '00000000-0000-0000-0000-000000000000'::uuid), coalesce(category_id, '00000000-0000-0000-0000-000000000000'::uuid)) do update set rate = excluded.rate
  returning id into v;
  return v;
end $$;

-- Komisi per orang: basis = penjualan bersih per baris (tanpa PPN, diskon proporsional) − retur; tarif = aturan paling khusus
create or replace function public.commission_report(p_kos uuid, p_from date, p_to date)
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if not member_in('finance', p_kos) then raise exception 'Tidak punya akses keuangan'; end if;
  if p_from is null or p_to is null or p_from > p_to then raise exception 'Periode tidak valid'; end if;
  return jsonb_build_object('from', p_from, 'to', p_to,
    'rules', (select coalesce(jsonb_agg(jsonb_build_object('id', id, 'user_id', user_id, 'category_id', category_id, 'rate', rate) order by user_id nulls first, category_id nulls first), '[]'::jsonb) from commission_rules where kos_id = p_kos),
    'rows', (select coalesce(jsonb_agg(x order by x.komisi desc), '[]'::jsonb) from (
      with ln as (
        select s.created_by as u, p.category_id as c, l.line_total * case when s.subtotal > 0 then s.total / s.subtotal else 1 end - l.tax_amount as basis
        from sale_lines l join sales s on s.id = l.sale_id join products p on p.id = l.product_id
        where s.kos_id = p_kos and s.status = 'selesai' and s.sale_date between p_from and p_to and s.created_by is not null
        union all
        select r.created_by, p.category_id, -(x.amount - case when s.tax_rate > 0 then round(x.amount * s.tax_rate / (100 + s.tax_rate), 2) else 0 end)
        from sale_return_lines x join sale_returns r on r.id = x.return_id join sales s on s.id = r.sale_id join products p on p.id = x.product_id
        where r.kos_id = p_kos and r.return_date between p_from and p_to and r.created_by is not null
      ), rated as (
        select ln.u, ln.basis, (select cr.rate from commission_rules cr where cr.kos_id = p_kos and (cr.user_id = ln.u or cr.user_id is null) and (cr.category_id = ln.c or cr.category_id is null)
                                order by (cr.user_id is not null) desc, (cr.category_id is not null) desc limit 1) as rate
        from ln)
      select u as user_id, round(sum(basis), 2) as basis, round(sum(basis * coalesce(rate, 0) / 100), 0) as komisi,
             (select st.id from staff st where st.kos_id = p_kos and st.member_user_id = rated.u limit 1) as staff_id,
             (select cp.amount from commission_payouts cp where cp.kos_id = p_kos and cp.user_id = rated.u and cp.month = date_trunc('month', p_from)::date) as dibayar
      from rated group by u) x));
end $$;

-- Masukkan komisi bulan itu ke gaji (bonus) karyawan yang tertaut akunnya. Sekali per orang per bulan.
create or replace function public.commission_to_payroll(p_kos uuid, p_month date)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_m0 date := date_trunc('month', p_month)::date; v_m1 date; r jsonb; x jsonb; run payroll_runs; pl payroll_lines; n int := 0; v_skip jsonb := '[]'::jsonb;
begin
  if not member_in('finance', p_kos) then raise exception 'Tidak punya akses keuangan'; end if;
  v_m1 := (v_m0 + interval '1 month - 1 day')::date;
  select * into run from payroll_runs where kos_id = p_kos and period = v_m0 and status = 'draf' limit 1;
  if run.id is null then raise exception 'Buat dulu draf gaji bulan itu di SDM & gaji › Gaji, lalu masukkan komisi.'; end if;
  r := commission_report(p_kos, v_m0, v_m1);
  for x in select * from jsonb_array_elements(r->'rows') loop
    if (x->>'komisi')::numeric <= 0 then continue; end if;
    if x->>'dibayar' is not null then v_skip := v_skip || jsonb_build_array(jsonb_build_object('user_id', x->>'user_id', 'alasan', 'sudah dimasukkan')); continue; end if;
    select l.* into pl from payroll_lines l join staff st on st.id = l.staff_id where l.run_id = run.id and st.member_user_id = (x->>'user_id')::uuid limit 1;
    if pl.id is null then v_skip := v_skip || jsonb_build_array(jsonb_build_object('user_id', x->>'user_id', 'alasan', 'akun belum ditautkan ke data karyawan di gaji ini')); continue; end if;
    perform payroll_line_set(pl.id, jsonb_build_object('bonus', pl.bonus + (x->>'komisi')::numeric,
              'note', trim(coalesce(pl.note, '') || ' Komisi ' || to_char(v_m0, 'MM/YYYY') || ' Rp' || replace(to_char((x->>'komisi')::numeric, 'FM999,999,999'), ',', '.'))));
    insert into commission_payouts(kos_id, month, user_id, amount, payroll_line_id) values (p_kos, v_m0, (x->>'user_id')::uuid, (x->>'komisi')::numeric, pl.id);
    n := n + 1;
  end loop;
  return jsonb_build_object('masuk', n, 'dilewati', v_skip, 'run', run.id);
end $$;

-- ---------- Kebijakan stok minus ----------
create or replace function public.stock_policy_set(p_kos uuid, p_mode text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not member_in('settings', p_kos) then raise exception 'Hanya pemilik/pengelola yang bisa mengubah aturan ini'; end if;
  if p_mode not in ('izinkan', 'peringatkan', 'tolak') then raise exception 'Pilihan tidak dikenal'; end if;
  update kos set profile = coalesce(profile, '{}'::jsonb) || jsonb_build_object('stock_policy', p_mode) where id = p_kos;
end $$;

create or replace function public.stock_moves_policy() returns trigger language plpgsql security definer set search_path = public as $$
declare v_mode text; v_have numeric; p products;
begin
  if new.kind <> 'jual' or new.delta >= 0 then return new; end if;
  select profile->>'stock_policy' into v_mode from kos where id = new.kos_id;
  if coalesce(v_mode, 'izinkan') <> 'tolak' then return new; end if;
  select * into p from products where id = new.product_id;
  if loc_multi(new.kos_id) and new.branch_id is not null then
    v_have := coalesce((select qty from stock_levels where product_id = new.product_id and branch_id = new.branch_id), 0);
    if v_have + new.delta < -0.0005 then
      raise exception 'STOK_KURANG: Stok % di lokasi ini tinggal % %, tidak cukup. Catat dulu barang masuk/mutasi, atau ubah aturan stok minus di Pengaturan.', p.name, trim(to_char(v_have, 'FM999999990.###'), '.'), p.base_unit;
    end if;
  elsif new.stock_after < -0.0005 then
    raise exception 'STOK_KURANG: Stok % tinggal % %, tidak cukup. Catat dulu barang masuk, atau ubah aturan stok minus di Pengaturan.', p.name, trim(to_char(new.stock_after - new.delta, 'FM999999990.###'), '.'), p.base_unit;
  end if;
  return new;
end $$;
drop trigger if exists stock_moves_policy on public.stock_moves;
create trigger stock_moves_policy before insert on public.stock_moves for each row execute function public.stock_moves_policy();

-- ---------- Pemeriksaan kehilangan (aturan tetap, terbuka) ----------
create or replace function public.loss_watch(p_kos uuid, p_from date, p_to date)
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if not member_in('finance', p_kos) then raise exception 'Tidak punya akses keuangan'; end if;
  return jsonb_build_object('from', p_from, 'to', p_to,
    'aturan', jsonb_build_object('diskon_pct', 20, 'batal_pct', 5, 'batal_min', 3, 'shift_min', 2),
    -- harga diubah manual di bawah modal
    'di_bawah_modal', (select coalesce(jsonb_agg(x order by x.rugi desc), '[]'::jsonb) from (
        select s.number, s.sale_date, s.created_by as user_id, l.name, l.unit, l.qty, l.price, round(l.cost * l.unit_qty, 2) as modal, round(l.qty * (l.cost * l.unit_qty - l.price), 0) as rugi
        from sale_lines l join sales s on s.id = l.sale_id
        where s.kos_id = p_kos and s.status = 'selesai' and s.sale_date between p_from and p_to and l.price_manual and l.price < l.cost * l.unit_qty - 0.5
        order by 9 desc limit 30) x),
    -- diskon manual besar (> 20% subtotal)
    'diskon_besar', (select coalesce(jsonb_agg(x order by x.diskon desc), '[]'::jsonb) from (
        select number, sale_date, created_by as user_id, subtotal, discount - promo_discount as diskon, round(100 * (discount - promo_discount) / nullif(subtotal, 0), 1) as pct
        from sales where kos_id = p_kos and status = 'selesai' and sale_date between p_from and p_to and subtotal > 0 and (discount - promo_discount) > 0.2 * subtotal
        order by 5 desc limit 30) x),
    -- per kasir: pembatalan, retur, selisih laci
    'kasir', (select coalesce(jsonb_agg(k), '[]'::jsonb) from (
        select u.u as user_id,
               (select count(*) from sales where kos_id = p_kos and sale_date between p_from and p_to and created_by is not distinct from u.u and status in ('selesai', 'batal')) as trx,
               (select count(*) from sales where kos_id = p_kos and sale_date between p_from and p_to and created_by is not distinct from u.u and status = 'batal') as batal_n,
               (select coalesce(sum(total), 0) from sales where kos_id = p_kos and sale_date between p_from and p_to and created_by is not distinct from u.u and status = 'batal') as batal,
               (select count(*) from sale_returns where kos_id = p_kos and return_date between p_from and p_to and created_by is not distinct from u.u and refund_method = 'tunai') as retur_tunai_n,
               (select count(*) from cash_shifts c where c.kos_id = p_kos and c.user_id = u.u and c.closed_at is not null and c.counted_cash - c.expected_cash <= -1
                  and (c.opened_at at time zone 'Asia/Jakarta')::date between p_from and p_to) as laci_kurang_n,
               (select coalesce(-sum(c.counted_cash - c.expected_cash), 0) from cash_shifts c where c.kos_id = p_kos and c.user_id = u.u and c.closed_at is not null and c.counted_cash - c.expected_cash <= -1
                  and (c.opened_at at time zone 'Asia/Jakarta')::date between p_from and p_to) as laci_kurang
        from (select distinct created_by u from sales where kos_id = p_kos and sale_date between p_from and p_to
              union select distinct user_id from cash_shifts where kos_id = p_kos and (opened_at at time zone 'Asia/Jakarta')::date between p_from and p_to) u) k
      where (k.batal_n >= 3 and k.batal_n > 0.05 * greatest(k.trx, 1)) or k.laci_kurang_n >= 2),
    -- barang dengan susut/selisih hitung terbesar
    'susut_barang', (select coalesce(jsonb_agg(x order by x.nilai desc), '[]'::jsonb) from (
        select p.name, p.base_unit, round(-sum(m.delta), 3) as qty, round(-sum(m.value), 0) as nilai, count(*) as kali
        from stock_moves m join products p on p.id = m.product_id
        where m.kos_id = p_kos and m.kind in ('rusak', 'kedaluwarsa', 'opname', 'koreksi') and (m.created_at at time zone 'Asia/Jakarta')::date between p_from and p_to
        group by p.id, p.name, p.base_unit having sum(m.value) < 0 order by 4 desc limit 10) x),
    -- hari yang berubah setelah ditutup
    'berubah_setelah_tutup', (select coalesce(jsonb_agg(d.day order by d.day), '[]'::jsonb) from jsonb_to_recordset(day_close_list(p_kos, null)) as d(day date, berubah boolean)
                              where d.berubah and d.day between p_from and p_to));
end $$;

-- ---------- Patch: harga per jumlah di sale_create & promo_preview; tingkat harga di katalog kasir ----------
create or replace function public._prasara_patch(p_sig text, p_old text, p_new text)
returns void language plpgsql as $$
declare d text;
begin
  d := pg_get_functiondef(p_sig::regprocedure);
  if position(p_old in d) = 0 then raise exception 'patch %: potongan tidak ditemukan', p_sig; end if;
  execute replace(d, p_old, p_new);
end $$;

select public._prasara_patch((select oid::regprocedure::text from pg_proc where proname = 'sale_create' and pronamespace = 'public'::regnamespace),
  $x$v_price := coalesce((l->>'price')::numeric, case when p_tier = 'grosir' and u.price_wholesale > 0 then u.price_wholesale else u.price_retail end);$x$,
  $x$v_price := coalesce((l->>'price')::numeric, case when p_tier = 'grosir' and u.price_wholesale > 0 then u.price_wholesale else u.price_retail end);
    if (l->>'price') is null then v_price := least(v_price, coalesce(price_break(p.id, u.name, p_tier, v_qty), v_price)); end if;$x$);

select public._prasara_patch('public.promo_preview(uuid,text,jsonb)',
  $x$v_price := coalesce((l->>'price')::numeric, case when p_tier = 'grosir' and u.price_wholesale > 0 then u.price_wholesale else u.price_retail end);$x$,
  $x$v_price := coalesce((l->>'price')::numeric, case when p_tier = 'grosir' and u.price_wholesale > 0 then u.price_wholesale else u.price_retail end);
    if (l->>'price') is null then v_price := least(v_price, coalesce(price_break(u.product_id, u.name, p_tier, (l->>'qty')::numeric), v_price)); end if;$x$);

select public._prasara_patch('public.kasir_catalog(uuid)',
  $x$'location', (select name from branches where id = stock_loc(p_kos)),$x$,
  $x$'location', (select name from branches where id = stock_loc(p_kos)),
    'breaks', (select coalesce(jsonb_agg(jsonb_build_object('product_id', b.product_id, 'unit', b.unit, 'tier', b.tier, 'min_qty', b.min_qty, 'price', b.price) order by b.min_qty), '[]') from price_breaks b where b.kos_id = p_kos),
    'stock_policy', (select coalesce(profile->>'stock_policy', 'izinkan') from kos where id = p_kos),$x$);
drop function public._prasara_patch(text, text, text);

revoke execute on function public.price_break(uuid, text, text, numeric), public.stock_moves_policy() from public, anon, authenticated;
revoke execute on function public.price_breaks_set(uuid, text, jsonb), public.commission_rule_save(uuid, uuid, uuid, numeric), public.commission_report(uuid, date, date),
  public.commission_to_payroll(uuid, date), public.stock_policy_set(uuid, text), public.loss_watch(uuid, date, date) from public, anon;
grant execute on function public.price_breaks_set(uuid, text, jsonb), public.commission_rule_save(uuid, uuid, uuid, numeric), public.commission_report(uuid, date, date),
  public.commission_to_payroll(uuid, date), public.stock_policy_set(uuid, text), public.loss_watch(uuid, date, date) to authenticated;
