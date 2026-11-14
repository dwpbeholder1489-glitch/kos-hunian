-- Promosi & bundling di Kasir toko (Modul V2.0 Bab 17; backlog P2). Modul r_promo (retail).
-- Prinsip:
--   * Promo dihitung SERVER (promo_calc) dari harga resmi barang; kasir hanya melihat pratinjau (promo_preview).
--   * Hasil promo = potongan otomatis yang ditambahkan ke sales.discount (jadi PPN proporsional, retur, laporan, dan jurnal
--     tetap memakai mesin yang ada), rinciannya disimpan di sales.promos + sales.promo_discount.
--   * Baris yang harganya diubah manual di kasir (atau harga pesanan grosir) TIDAK ikut promo.
--   * Satu barang di keranjang hanya kena satu promo. Urutan: paket → beli X gratis Y → diskon barang → diskon minimal belanja.
-- Jenis: 'diskon' (persen untuk barang tertentu / semua), 'gratis' (beli X gratis Y, barang & satuan yang sama),
--        'paket' (bundling beberapa barang dengan harga paket), 'belanja' (minimal belanja → persen / potongan rupiah).

create table if not exists public.promos (
  id uuid primary key default gen_random_uuid(),
  kos_id uuid not null references public.kos(id) on delete cascade,
  name text not null check (length(trim(name)) between 2 and 60),
  kind text not null check (kind in ('diskon', 'gratis', 'paket', 'belanja')),
  percent numeric(5,2) check (percent is null or (percent > 0 and percent <= 100)),
  amount numeric(14,2) check (amount is null or amount > 0),
  min_spend numeric(14,2) check (min_spend is null or min_spend >= 0),
  product_ids uuid[],                                    -- diskon: null = semua barang
  product_id uuid references public.products(id) on delete cascade,   -- gratis
  unit text, buy_qty numeric(10,3) check (buy_qty is null or buy_qty > 0), free_qty numeric(10,3) check (free_qty is null or free_qty > 0),
  items jsonb,                                           -- paket: [{product_id, unit, qty, name}]
  bundle_price numeric(14,2) check (bundle_price is null or bundle_price >= 0),
  tier text not null default 'semua' check (tier in ('semua', 'ecer', 'grosir')),
  start_date date not null, end_date date, days int[],   -- days: 1 (Senin) … 7 (Minggu); null = setiap hari
  active boolean not null default true,
  created_by uuid default auth.uid(), created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  check (end_date is null or end_date >= start_date)
);
create index if not exists promos_kos on public.promos(kos_id, active);
alter table public.promos enable row level security;
drop policy if exists promos_select on public.promos;
create policy promos_select on public.promos for select using (member_can(kos_id, 'sell,finance'));
grant select on public.promos to authenticated;
drop trigger if exists zz_kos_open_guard on public.promos;
create trigger zz_kos_open_guard before insert or update or delete on public.promos for each row execute function public.kos_open_guard();

alter table public.sales add column if not exists promo_discount numeric(14,2) not null default 0;
alter table public.sales add column if not exists promos jsonb;
alter table public.sale_lines add column if not exists price_manual boolean not null default false;

-- ---------- Mesin promo ----------
-- p_lines: [{product_id, unit, qty, price, manual}] → {total, items: [{id, name, kind, amount}]}
create or replace function public.promo_calc(p_kos uuid, p_tier text, p_day date, p_lines jsonb)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare pr promos; n int := coalesce(jsonb_array_length(p_lines), 0); i int; it jsonb;
        pid uuid[] := '{}'; un text[] := '{}'; avail numeric[] := '{}'; price numeric[] := '{}';
        v_items jsonb := '[]'; v_total numeric := 0; v_d numeric; v_sets numeric; v_need numeric; v_have numeric; v_normal numeric; v_take numeric;
        v_elig numeric := 0; v_best numeric := 0; v_best_id uuid; v_best_name text; v_tier text := coalesce(nullif(p_tier, ''), 'ecer');
begin
  if n = 0 or not module_on(p_kos, 'r_promo') then return jsonb_build_object('total', 0, 'items', '[]'::jsonb); end if;
  for i in 0 .. n - 1 loop
    it := p_lines -> i;
    pid := pid || (it->>'product_id')::uuid; un := un || lower(it->>'unit'); price := price || (it->>'price')::numeric;
    avail := avail || case when coalesce((it->>'manual')::boolean, false) then 0 else (it->>'qty')::numeric end;
    if not coalesce((it->>'manual')::boolean, false) then v_elig := v_elig + round((it->>'qty')::numeric * (it->>'price')::numeric, 2); end if;
  end loop;

  for pr in select * from promos where kos_id = p_kos and active and kind <> 'belanja' and start_date <= p_day and (end_date is null or end_date >= p_day)
              and (days is null or extract(isodow from p_day)::int = any(days)) and (tier = 'semua' or tier = v_tier)
            order by case kind when 'paket' then 1 when 'gratis' then 2 else 3 end, created_at loop
    v_d := 0;
    if pr.kind = 'paket' then
      -- berapa paket penuh yang bisa dibentuk dari sisa barang
      v_sets := null;
      for it in select * from jsonb_array_elements(pr.items) loop
        v_have := 0;
        for i in 1 .. n loop if pid[i] = (it->>'product_id')::uuid and un[i] = lower(it->>'unit') then v_have := v_have + avail[i]; end if; end loop;
        v_sets := least(coalesce(v_sets, 1e9), floor(v_have / (it->>'qty')::numeric));
      end loop;
      if coalesce(v_sets, 0) >= 1 then
        v_normal := 0;
        for it in select * from jsonb_array_elements(pr.items) loop
          v_need := v_sets * (it->>'qty')::numeric;
          for i in 1 .. n loop
            if v_need > 0 and pid[i] = (it->>'product_id')::uuid and un[i] = lower(it->>'unit') and avail[i] > 0 then
              v_take := least(avail[i], v_need); v_normal := v_normal + v_take * price[i]; v_need := v_need - v_take;
            end if;
          end loop;
        end loop;
        v_d := round(v_normal - v_sets * pr.bundle_price, 2);
        if v_d > 0 then  -- baru dipakai bila memang lebih murah
          for it in select * from jsonb_array_elements(pr.items) loop
            v_need := v_sets * (it->>'qty')::numeric;
            for i in 1 .. n loop
              if v_need > 0 and pid[i] = (it->>'product_id')::uuid and un[i] = lower(it->>'unit') and avail[i] > 0 then
                v_take := least(avail[i], v_need); avail[i] := avail[i] - v_take; v_need := v_need - v_take;
              end if;
            end loop;
          end loop;
        end if;
      end if;
    elsif pr.kind = 'gratis' then
      for i in 1 .. n loop
        if pid[i] = pr.product_id and un[i] = lower(pr.unit) and avail[i] > 0 then
          v_sets := floor(avail[i] / (pr.buy_qty + pr.free_qty));
          if v_sets >= 1 then
            v_d := v_d + round(v_sets * pr.free_qty * price[i], 2);
            avail[i] := avail[i] - v_sets * (pr.buy_qty + pr.free_qty);
          end if;
        end if;
      end loop;
    else  -- diskon persen barang
      for i in 1 .. n loop
        if avail[i] > 0 and (pr.product_ids is null or pid[i] = any(pr.product_ids)) then
          v_d := v_d + round(avail[i] * price[i] * pr.percent / 100, 2);
          avail[i] := 0;
        end if;
      end loop;
    end if;
    if v_d > 0 then
      v_total := v_total + v_d;
      v_items := v_items || jsonb_build_object('id', pr.id, 'name', pr.name, 'kind', pr.kind, 'amount', v_d);
    end if;
  end loop;

  -- minimal belanja: satu saja, yang paling menguntungkan pembeli; dihitung dari belanja (tanpa harga manual) setelah promo lain
  v_elig := v_elig - v_total;
  for pr in select * from promos where kos_id = p_kos and active and kind = 'belanja' and start_date <= p_day and (end_date is null or end_date >= p_day)
              and (days is null or extract(isodow from p_day)::int = any(days)) and (tier = 'semua' or tier = v_tier) order by created_at loop
    if v_elig > 0 and v_elig >= coalesce(pr.min_spend, 0) then
      v_d := case when pr.percent is not null then round(v_elig * pr.percent / 100, 2) else least(pr.amount, v_elig) end;
      if v_d > v_best then v_best := v_d; v_best_id := pr.id; v_best_name := pr.name; end if;
    end if;
  end loop;
  if v_best > 0 then
    v_total := v_total + v_best;
    v_items := v_items || jsonb_build_object('id', v_best_id, 'name', v_best_name, 'kind', 'belanja', 'amount', v_best);
  end if;
  return jsonb_build_object('total', v_total, 'items', v_items);
end $$;

-- Dipanggil sale_create setelah baris penjualan tersimpan
create or replace function public.promo_for_sale(p_sale uuid, p_kos uuid, p_tier text)
returns jsonb language sql stable security definer set search_path = public as $$
  select promo_calc(p_kos, p_tier, (now() at time zone 'Asia/Jakarta')::date,
    coalesce((select jsonb_agg(jsonb_build_object('product_id', product_id, 'unit', unit, 'qty', qty, 'price', price, 'manual', price_manual) order by id) from sale_lines where sale_id = p_sale), '[]'));
$$;

-- Pratinjau untuk Kasir: harga resmi dihitung server (baris tanpa 'price' = harga otomatis)
create or replace function public.promo_preview(p_kos uuid, p_tier text, p_lines jsonb)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare l jsonb; u product_units; v jsonb := '[]'; v_sub numeric := 0; v_price numeric; r jsonb;
begin
  if not member_in('sell', p_kos) then raise exception 'Tidak punya akses ke bisnis ini'; end if;
  if jsonb_typeof(coalesce(p_lines, '[]')) <> 'array' then raise exception 'Keranjang tidak valid'; end if;
  for l in select * from jsonb_array_elements(coalesce(p_lines, '[]')) loop
    select pu.* into u from product_units pu join products p on p.id = pu.product_id where p.kos_id = p_kos and pu.product_id = (l->>'product_id')::uuid and pu.name = l->>'unit';
    if u.id is null then continue; end if;
    v_price := coalesce((l->>'price')::numeric, case when p_tier = 'grosir' and u.price_wholesale > 0 then u.price_wholesale else u.price_retail end);
    v := v || jsonb_build_object('product_id', u.product_id, 'unit', u.name, 'qty', (l->>'qty')::numeric, 'price', v_price, 'manual', (l->>'price') is not null);
    v_sub := v_sub + round((l->>'qty')::numeric * v_price, 2);
  end loop;
  r := promo_calc(p_kos, p_tier, (now() at time zone 'Asia/Jakarta')::date, v);
  return r || jsonb_build_object('subtotal', v_sub);
end $$;

-- ---------- Pasang ke sale_create ----------
create or replace function public._prasara_patch(p_sig text, p_old text, p_new text)
returns void language plpgsql as $$
declare d text;
begin
  d := pg_get_functiondef(p_sig::regprocedure);
  if position(p_old in d) = 0 then raise exception 'patch %: potongan tidak ditemukan: %', p_sig, left(p_old, 60); end if;
  execute replace(d, p_old, p_new);
end $$;
do $$ declare s text := 'public.sale_create(uuid,uuid,text,jsonb,numeric,text,numeric,uuid,date,text,jsonb)'; begin
  perform public._prasara_patch(s, 'v_tax jsonb;', 'v_tax jsonb; v_promo jsonb;');
  perform public._prasara_patch(s, 'price, cost, line_total)', 'price, cost, line_total, price_manual)');
  perform public._prasara_patch(s, 'p.cost, round(v_qty * v_price, 2));', 'p.cost, round(v_qty * v_price, 2), (l->>''price'') is not null);');
  perform public._prasara_patch(s,
    'if coalesce(p_discount, 0) < 0 or coalesce(p_discount, 0) > v_sub then raise exception ''Diskon tidak boleh melebihi subtotal''; end if;',
    'if coalesce(p_discount, 0) < 0 then raise exception ''Diskon tidak boleh minus''; end if;
  v_promo := promo_for_sale(p_id, p_kos, p_tier);
  if coalesce(p_discount, 0) + (v_promo->>''total'')::numeric > v_sub then
    raise exception ''Diskon tidak boleh melebihi subtotal%'', case when (v_promo->>''total'')::numeric > 0 then '' (promo otomatis sudah memotong '' || replace(to_char((v_promo->>''total'')::numeric, ''FM999,999,999''), '','', ''.'') || '')'' else '''' end;
  end if;
  p_discount := coalesce(p_discount, 0) + (v_promo->>''total'')::numeric;');
  perform public._prasara_patch(s, 'update sales set subtotal = v_sub,', 'update sales set promo_discount = (v_promo->>''total'')::numeric, promos = nullif(v_promo->''items'', ''[]''::jsonb), subtotal = v_sub,');
  perform public._prasara_patch(s, '''total'', v_total, ''tax''', '''total'', v_total, ''promo'', (v_promo->>''total'')::numeric, ''tax''');
end $$;
drop function public._prasara_patch(text, text, text);

-- ---------- Kelola promo ----------
create or replace function public.promo_guard(p_kos uuid)
returns void language plpgsql stable security definer set search_path = public as $$
begin
  if not member_in('finance', p_kos) then raise exception 'Hanya pemilik atau bagian keuangan yang bisa mengatur promo'; end if;
  if (select business_type from kos where id = p_kos) <> 'retail' then raise exception 'Promo kasir hanya untuk bisnis Retail & Grosir'; end if;
  if not module_on(p_kos, 'r_promo') then raise exception 'Modul Promosi & bundling belum aktif (Konfigurasi › Modul)'; end if;
end $$;

create or replace function public.promo_save(p_kos uuid, p_id uuid, p jsonb)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid := coalesce(p_id, gen_random_uuid()); v_kind text := p->>'kind'; v_name text := trim(coalesce(p->>'name', ''));
        v_pct numeric := nullif(p->>'percent', '')::numeric; v_amt numeric := nullif(p->>'amount', '')::numeric; v_min numeric := coalesce(nullif(p->>'min_spend', '')::numeric, 0);
        v_ids uuid[]; v_prod uuid := nullif(p->>'product_id', '')::uuid; v_unit text := nullif(trim(coalesce(p->>'unit', '')), '');
        v_buy numeric := nullif(p->>'buy_qty', '')::numeric; v_free numeric := nullif(p->>'free_qty', '')::numeric; v_items jsonb := '[]'; v_bp numeric := nullif(p->>'bundle_price', '')::numeric;
        v_tier text := coalesce(nullif(p->>'tier', ''), 'semua'); v_start date := coalesce(nullif(p->>'start_date', '')::date, (now() at time zone 'Asia/Jakarta')::date);
        v_end date := nullif(p->>'end_date', '')::date; v_days int[]; x jsonb; pr products; v_normal numeric := 0; v_u product_units;
begin
  perform promo_guard(p_kos);
  if p_id is not null and not exists (select 1 from promos where id = p_id and kos_id = p_kos) then raise exception 'Promo tidak ditemukan'; end if;
  if length(v_name) < 2 then raise exception 'Isi nama promo (tampil di struk)'; end if;
  if v_kind not in ('diskon', 'gratis', 'paket', 'belanja') then raise exception 'Pilih jenis promo'; end if;
  if v_tier not in ('semua', 'ecer', 'grosir') then raise exception 'Pilihan harga tidak dikenal'; end if;
  if v_end is not null and v_end < v_start then raise exception 'Tanggal selesai sebelum tanggal mulai'; end if;
  if jsonb_typeof(p->'days') = 'array' and jsonb_array_length(p->'days') between 1 and 6 then
    select array_agg(distinct d::int order by d::int) into v_days from jsonb_array_elements_text(p->'days') d where d::int between 1 and 7;
  end if;

  if v_kind = 'diskon' then
    if v_pct is null or v_pct <= 0 or v_pct > 90 then raise exception 'Isi persen diskon (1–90)'; end if;
    if jsonb_typeof(p->'product_ids') = 'array' and jsonb_array_length(p->'product_ids') > 0 then
      select array_agg(pp.id) into v_ids from products pp where pp.kos_id = p_kos and pp.id in (select y::uuid from jsonb_array_elements_text(p->'product_ids') y);
      if v_ids is null then raise exception 'Barang promo tidak ditemukan'; end if;
    end if;
    v_amt := null; v_min := null; v_prod := null; v_unit := null; v_buy := null; v_free := null; v_bp := null; v_items := null;
  elsif v_kind = 'gratis' then
    select * into pr from products where id = v_prod and kos_id = p_kos;
    if pr.id is null then raise exception 'Pilih barang untuk promo beli X gratis Y'; end if;
    v_unit := coalesce(v_unit, pr.base_unit);
    if not exists (select 1 from product_units where product_id = pr.id and name = v_unit) then raise exception 'Satuan "%" untuk % tidak ada', v_unit, pr.name; end if;
    if v_buy is null or v_free is null or v_buy <= 0 or v_free <= 0 or v_buy <> floor(v_buy) or v_free <> floor(v_free) then raise exception 'Isi jumlah beli dan jumlah gratis (angka bulat)'; end if;
    if v_free > v_buy then raise exception 'Jumlah gratis tidak boleh lebih banyak dari jumlah beli'; end if;
    v_pct := null; v_amt := null; v_min := null; v_ids := null; v_bp := null; v_items := null;
  elsif v_kind = 'paket' then
    if jsonb_typeof(p->'items') <> 'array' or jsonb_array_length(p->'items') < 1 then raise exception 'Isi barang dalam paket'; end if;
    if jsonb_array_length(p->'items') > 10 then raise exception 'Maksimal 10 barang dalam satu paket'; end if;
    for x in select * from jsonb_array_elements(p->'items') loop
      select * into pr from products where id = nullif(x->>'product_id', '')::uuid and kos_id = p_kos;
      if pr.id is null then raise exception 'Barang paket tidak ditemukan'; end if;
      select * into v_u from product_units where product_id = pr.id and name = coalesce(nullif(x->>'unit', ''), pr.base_unit);
      if v_u.id is null then raise exception 'Satuan "%" untuk % tidak ada', x->>'unit', pr.name; end if;
      if coalesce((x->>'qty')::numeric, 0) <= 0 then raise exception 'Isi jumlah % dalam paket', pr.name; end if;
      if exists (select 1 from jsonb_array_elements(v_items) y where y->>'product_id' = pr.id::text and y->>'unit' = v_u.name) then raise exception '% dobel di paket', pr.name; end if;
      v_items := v_items || jsonb_build_object('product_id', pr.id, 'unit', v_u.name, 'qty', (x->>'qty')::numeric, 'name', pr.name);
      v_normal := v_normal + (x->>'qty')::numeric * v_u.price_retail;
    end loop;
    if jsonb_array_length(v_items) = 1 and (v_items->0->>'qty')::numeric <= 1 then raise exception 'Paket minimal 2 barang, atau 1 barang dengan jumlah lebih dari 1'; end if;
    if v_bp is null or v_bp < 0 then raise exception 'Isi harga paket'; end if;
    if v_bp >= v_normal then raise exception 'Harga paket (%) harus lebih murah dari harga eceran biasa (%)', replace(to_char(v_bp, 'FM999,999,999'), ',', '.'), replace(to_char(v_normal, 'FM999,999,999'), ',', '.'); end if;
    v_pct := null; v_amt := null; v_min := null; v_ids := null; v_prod := null; v_unit := null; v_buy := null; v_free := null;
  else  -- belanja
    if (v_pct is null) = (v_amt is null) then raise exception 'Isi salah satu: persen ATAU potongan rupiah'; end if;
    if v_pct is not null and (v_pct <= 0 or v_pct > 90) then raise exception 'Isi persen diskon (1–90)'; end if;
    if v_amt is not null and v_amt <= 0 then raise exception 'Isi potongan rupiah'; end if;
    if v_amt is not null and v_min < v_amt * 2 then raise exception 'Minimal belanja harus sekurangnya 2× potongan (agar tidak menjual rugi)'; end if;
    v_ids := null; v_prod := null; v_unit := null; v_buy := null; v_free := null; v_bp := null; v_items := null;
  end if;

  insert into promos(id, kos_id, name, kind, percent, amount, min_spend, product_ids, product_id, unit, buy_qty, free_qty, items, bundle_price, tier, start_date, end_date, days, active)
  values (v_id, p_kos, v_name, v_kind, v_pct, v_amt, v_min, v_ids, v_prod, v_unit, v_buy, v_free, v_items, v_bp, v_tier, v_start, v_end, v_days, coalesce((p->>'active')::boolean, true))
  on conflict (id) do update set name = excluded.name, kind = excluded.kind, percent = excluded.percent, amount = excluded.amount, min_spend = excluded.min_spend,
    product_ids = excluded.product_ids, product_id = excluded.product_id, unit = excluded.unit, buy_qty = excluded.buy_qty, free_qty = excluded.free_qty, items = excluded.items,
    bundle_price = excluded.bundle_price, tier = excluded.tier, start_date = excluded.start_date, end_date = excluded.end_date, days = excluded.days, active = excluded.active, updated_at = now();
  return v_id;
end $$;

create or replace function public.promo_set_active(p_promo uuid, p_active boolean)
returns void language plpgsql security definer set search_path = public as $$
declare v_kos uuid;
begin
  select kos_id into v_kos from promos where id = p_promo;
  if v_kos is null then raise exception 'Promo tidak ditemukan'; end if;
  perform promo_guard(v_kos);
  update promos set active = p_active, updated_at = now() where id = p_promo;
end $$;

create or replace function public.promo_delete(p_promo uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_kos uuid;
begin
  select kos_id into v_kos from promos where id = p_promo;
  if v_kos is null then raise exception 'Promo tidak ditemukan'; end if;
  perform promo_guard(v_kos);
  delete from promos where id = p_promo;   -- riwayat di transaksi (sales.promos) tetap ada
end $$;

-- Daftar promo + pemakaian (dari transaksi yang tidak dibatalkan)
create or replace function public.promo_list(p_kos uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_today date := (now() at time zone 'Asia/Jakarta')::date;
begin
  perform promo_guard(p_kos);
  return jsonb_build_object(
    'promos', coalesce((select jsonb_agg(to_jsonb(pm) - 'kos_id' - 'created_by' || jsonb_build_object(
        'state', case when not pm.active then 'nonaktif' when pm.start_date > v_today then 'terjadwal' when pm.end_date is not null and pm.end_date < v_today then 'berakhir' else 'berjalan' end,
        'product_name', (select name from products where id = pm.product_id),
        'product_names', (select jsonb_agg(name order by name) from products where id = any(pm.product_ids)),
        'used', coalesce(us.n, 0), 'given', coalesce(us.amt, 0)) order by pm.active desc, pm.created_at desc)
      from promos pm left join lateral (select count(*) n, sum((x->>'amount')::numeric) amt from sales s, jsonb_array_elements(s.promos) x
        where s.kos_id = p_kos and s.status <> 'batal' and s.promos is not null and x->>'id' = pm.id::text) us on true
      where pm.kos_id = p_kos), '[]'),
    'month_given', coalesce((select sum(promo_discount) from sales where kos_id = p_kos and status <> 'batal' and sale_date >= date_trunc('month', v_today)::date), 0),
    'month_sales', coalesce((select count(*) from sales where kos_id = p_kos and status <> 'batal' and promo_discount > 0 and sale_date >= date_trunc('month', v_today)::date), 0));
end $$;

revoke execute on function public.promo_calc(uuid, text, date, jsonb), public.promo_for_sale(uuid, uuid, text), public.promo_guard(uuid) from public, anon, authenticated;
revoke execute on function public.promo_preview(uuid, text, jsonb), public.promo_save(uuid, uuid, jsonb), public.promo_set_active(uuid, boolean), public.promo_delete(uuid), public.promo_list(uuid) from public, anon;
grant execute on function public.promo_preview(uuid, text, jsonb), public.promo_save(uuid, uuid, jsonb), public.promo_set_active(uuid, boolean), public.promo_delete(uuid), public.promo_list(uuid) to authenticated;

-- ---------- Module Registry ----------
update public.modules set impl_status = 'production_ready', applies_to = '{retail}', paths = '{/promo}', config_path = '/promo', area = 'finance',
  description = 'Promo otomatis di Kasir: diskon persen per barang, beli X gratis Y, paket bundling, dan diskon minimal belanja — terjadwal per tanggal/hari, dihitung server, tercetak di struk.',
  data_used = 'promos, sales (promo_discount, promos)'
where code = 'r_promo';
insert into public.business_modules(kos_id, module_code, active, updated_by)
select k.id, 'r_promo', true, 'sistem' from public.kos k where k.business_type = 'retail' on conflict do nothing;
