-- Mesin konversi satuan (Retail & Grosir + bahan Jasa): SATUAN UTAMA + SATUAN JUAL.
-- Prinsip:
--   * Stok, modal (HPP), dan semua pergerakan stok disimpan dalam satuan utama (products.base_unit).
--   * product_units.qty = isi 1 satuan jual dalam satuan utama = SATU-SATUNYA faktor konversi yang dipakai
--     kasir, belanja, retur, mutasi, grosir, penyesuaian, HPP, laporan (sudah begitu sejak awal; baris transaksi
--     menyimpan salinan unit_qty sehingga riwayat tidak berubah).
--   * Faktor dihitung SERVER dari "isi" yang diisi pengguna (content_qty + content_unit), bukan rumus manual:
--     1 kg = 1.000 gram, 1 ons = 100 gram, 1 kuintal = 100 kg, 1 ton = 1.000 kg, 1 liter = 1.000 ml (cc = ml).
--   * Berat ↔ volume TIDAK dikonversi otomatis; hanya bila barang punya products.density (kg per liter).
--   * Satuan utama tidak bisa diganti ke ukuran lain bila barang sudah punya stok/transaksi.
-- Migrasi ini tidak mengubah data produk atau transaksi yang sudah ada.

alter table public.products add column if not exists density numeric(10,4) check (density is null or (density >= 0.01 and density <= 100));
comment on column public.products.density is 'Berat 1 liter dalam kg (densitas). Hanya untuk konversi berat <-> volume; kosong = tidak boleh.';
alter table public.product_units add column if not exists content_qty numeric(14,3) check (content_qty is null or content_qty > 0);
alter table public.product_units add column if not exists content_unit text check (content_unit is null or length(trim(content_unit)) between 1 and 20);
comment on column public.product_units.content_qty is 'Isi seperti diisi pengguna (mis. 250), bersama content_unit (mis. gram). qty = hasil konversinya ke satuan utama.';

-- ---------- Ukuran satuan: berat dalam gram, volume dalam ml; null bila bukan satuan berat/volume ----------
-- Menerima: "kg", "250 gram", "½ kg", "1,5 liter", "Kemasan 250 gram", "Sak 25 kg", "Botol 600 ml".
create or replace function public.unit_measure(p_name text, out dim text, out size numeric)
language plpgsql immutable as $$
declare s text := lower(regexp_replace(trim(coalesce(p_name, '')), '\s+', ' ', 'g')); m text[]; n numeric; u text;
begin
  -- [awalan kata] [angka/pecahan] satuan  — awalan hanya boleh bila ada angka (mis. "Kemasan 250 gram")
  m := regexp_match(s, '^(?:([^0-9¼½¾]*[^0-9¼½¾ ]) )?(¼|½|¾|1/4|1/2|3/4|setengah|seperempat|[0-9]+(?:[.,][0-9]+)?)? ?([a-z]+)$');
  if m is null then return; end if;
  if m[1] is not null and m[2] is null then return; end if;
  u := m[3];
  n := case m[2] when '¼' then 0.25 when '1/4' then 0.25 when 'seperempat' then 0.25 when '½' then 0.5 when '1/2' then 0.5 when 'setengah' then 0.5
         when '¾' then 0.75 when '3/4' then 0.75 else null end;
  if n is null then n := coalesce(replace(m[2], ',', '.')::numeric, 1); end if;
  if n <= 0 then return; end if;
  if u in ('kg', 'kilo', 'kilogram') then dim := 'm'; size := n * 1000;
  elsif u in ('gram', 'gr', 'g') then dim := 'm'; size := n;
  elsif u = 'ons' then dim := 'm'; size := n * 100;
  elsif u in ('kuintal', 'kwintal', 'kw') then dim := 'm'; size := n * 100000;
  elsif u = 'ton' then dim := 'm'; size := n * 1000000;
  elsif u in ('liter', 'ltr', 'l') then dim := 'v'; size := n * 1000;
  elsif u in ('ml', 'mililiter', 'cc') then dim := 'v'; size := n;
  end if;
end $$;

-- Faktor: 1 p_from = ? p_to. Berat↔volume hanya dengan densitas (kg per liter = gram per ml). null = tidak bisa.
create or replace function public.unit_factor(p_from text, p_to text, p_density numeric default null)
returns numeric language plpgsql immutable as $$
declare a record; b record;
begin
  select * into a from unit_measure(p_from);
  select * into b from unit_measure(p_to);
  if a.dim is null or b.dim is null then return null; end if;
  if a.dim = b.dim then return a.size / b.size; end if;
  if p_density is null or p_density <= 0 then return null; end if;
  if a.dim = 'm' then return (a.size / p_density) / b.size; end if;   -- gram → ml
  return (a.size * p_density) / b.size;                                 -- ml → gram
end $$;

-- Jumlah dalam satuan jual → satuan utama (satu-satunya rumus; dibulatkan 3 angka seperti kolom stok)
create or replace function public.unit_to_base(p_product uuid, p_unit text, p_qty numeric)
returns numeric language plpgsql stable set search_path = public as $$
declare v_f numeric; v_name text;
begin
  select name into v_name from products where id = p_product;
  if v_name is null then raise exception 'Barang tidak ditemukan'; end if;
  select qty into v_f from product_units where product_id = p_product and lower(name) = lower(trim(coalesce(p_unit, '')));
  if v_f is null then raise exception 'Satuan "%" untuk % tidak ada', p_unit, v_name; end if;
  return round(coalesce(p_qty, 0) * v_f, 3);
end $$;

create or replace function public.unit_num(n numeric) returns text language sql immutable as $$
  select replace(rtrim(rtrim(to_char(n, 'FM999999990.999999'), '0'), '.'), '.', ',');
$$;

-- ---------- Simpan barang (menggantikan versi lama; tambahan p_density) ----------
drop function if exists public.product_save(uuid, uuid, text, text, numeric, numeric, jsonb, numeric, text);
create or replace function public.product_save(p_kos uuid, p_id uuid, p_name text, p_base text, p_cost numeric, p_min numeric, p_units jsonb,
                                               p_initial_stock numeric default 0, p_sku text default null, p_density numeric default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid; u jsonb; i int := 0; v_base text := nullif(trim(coalesce(p_base, '')), ''); v_names text[] := '{}';
        v_sku text := nullif(trim(coalesce(p_sku, '')), ''); v_code text; v_other text; v_q numeric; v_cq numeric; v_cu text; v_f numeric; v_exp numeric;
        v_nm text; mb record; mu record; mc record; v_dens numeric := case when p_density > 0 then round(p_density, 4) end;
        v_old products; v_rows jsonb := '[]'; v_map jsonb := '{}'; r jsonb;
begin
  if not member_in('stock', p_kos) then raise exception 'Tidak punya akses ke bisnis ini'; end if;
  if (select business_type from kos where id = p_kos) not in ('retail', 'jasa') then raise exception 'Barang hanya untuk bisnis Retail & Grosir atau Jasa (bahan)'; end if;
  if coalesce(trim(p_name), '') = '' then raise exception 'Nama barang wajib diisi'; end if;
  if v_base is null then raise exception 'Isi satuan utama (mis. pcs, kg, liter)'; end if;
  if length(v_base) > 20 then raise exception 'Nama satuan utama maksimal 20 huruf'; end if;
  select * into mb from unit_measure(v_base);
  if coalesce(p_cost, 0) < 0 or coalesce(p_min, 0) < 0 or coalesce(p_initial_stock, 0) < 0 then raise exception 'Angka tidak boleh minus'; end if;
  if v_dens is not null and (v_dens < 0.01 or v_dens > 100) then raise exception 'Berat per liter tidak wajar (isi dalam kg, mis. 0,9 untuk minyak goreng)'; end if;
  if jsonb_typeof(p_units) <> 'array' or jsonb_array_length(p_units) = 0 then raise exception 'Isi minimal satu satuan jual'; end if;
  if jsonb_array_length(p_units) > 8 then raise exception 'Maksimal 8 satuan per barang'; end if;
  if v_sku is not null then
    select name into v_other from products where kos_id = p_kos and lower(sku) = lower(v_sku) and id is distinct from p_id;
    if v_other is not null then raise exception 'Kode barang "%" sudah dipakai %', v_sku, v_other; end if;
  end if;

  -- Satuan utama tidak boleh berubah arti bila sudah ada stok/transaksi (stok, modal & riwayat tercatat dalam satuan lama)
  if p_id is not null then
    select * into v_old from products where id = p_id and kos_id = p_kos;
    if v_old.id is null then raise exception 'Barang tidak ditemukan'; end if;
    if lower(trim(v_old.base_unit)) <> lower(v_base) and coalesce(unit_factor(v_old.base_unit, v_base), 0) <> 1
       and (v_old.stock <> 0 or exists (select 1 from stock_moves where product_id = p_id)) then
      raise exception 'Satuan utama "%" tidak bisa diganti menjadi "%": barang ini sudah punya stok/riwayat yang tercatat dalam %. Tambahkan "%" sebagai satuan jual, atau buat barang baru.',
        v_old.base_unit, v_base, v_old.base_unit, v_base;
    end if;
  end if;

  -- 1) Hitung & periksa semua satuan lebih dulu
  for u in select * from jsonb_array_elements(p_units) loop
    v_nm := case when i = 0 then v_base else trim(coalesce(u->>'name', '')) end;
    if v_nm = '' then raise exception 'Nama satuan wajib diisi'; end if;
    if length(v_nm) > 20 then raise exception 'Nama satuan "%" maksimal 20 huruf', v_nm; end if;
    if i > 0 and lower(v_nm) = lower(v_base) then raise exception 'Nama satuan "%" sama dengan satuan utama. Beri nama lain, mis. "½ %" atau "Dus"', v_nm, v_base; end if;
    if lower(v_nm) = any(v_names) then raise exception 'Nama satuan "%" dobel', v_nm; end if;
    v_names := v_names || lower(v_nm);
    v_cq := null; v_cu := null;
    if i = 0 then
      v_q := 1;
    else
      if nullif(trim(coalesce(u->>'content_qty', '')), '') is not null then
        v_cq := (u->>'content_qty')::numeric;
        if v_cq <= 0 then raise exception 'Jumlah isi "%" harus lebih dari 0', v_nm; end if;
        if v_cq <> round(v_cq, 3) then raise exception 'Jumlah isi "%" maksimal 3 angka di belakang koma', v_nm; end if;
        v_cu := coalesce(nullif(trim(coalesce(u->>'content_unit', '')), ''), v_base);
        if lower(v_cu) = lower(v_base) then v_f := 1;
        elsif v_map ? lower(v_cu) then v_f := (v_map->>lower(v_cu))::numeric;
        else
          v_f := unit_factor(v_cu, v_base, v_dens);
          if v_f is null then
            select * into mc from unit_measure(v_cu);
            if mc.dim is not null and mb.dim is not null then
              raise exception 'Tidak bisa mengubah % ke % secara otomatis — berat dan volume berbeda. Isi "Berat 1 liter" barang ini, atau tulis isinya dalam %.', v_cu, v_base, v_base;
            elsif mc.dim is not null then
              raise exception 'Satuan utama "%" bukan satuan berat/volume, jadi isi "% %" tidak bisa dihitung. Tulis isinya dalam % (mis. 24 %).', v_base, unit_num(v_cq), v_cu, v_base, v_base;
            else
              raise exception 'Satuan isi "%" tidak dikenal. Pilih % atau satuan lain barang ini yang ada di atasnya.', v_cu, v_base;
            end if;
          end if;
        end if;
        v_q := v_cq * v_f;
        -- lewat densitas (berat <-> volume) hasilnya perkiraan: dibulatkan 3 angka
        select * into mc from unit_measure(v_cu);
        if mc.dim is not null and mb.dim is not null and mc.dim <> mb.dim then v_q := round(v_q, 3); end if;
      else
        v_q := coalesce((u->>'qty')::numeric, 0);
      end if;
      if v_q <= 0 then raise exception 'Isi satuan "%" harus lebih dari 0 %', v_nm, v_base; end if;
      if v_q = 1 then raise exception 'Isi 1 "%" = 1 % sama dengan satuan utama. Hapus satuan ini atau ubah isinya.', v_nm, v_base; end if;
      if v_q > 1000000 then raise exception 'Isi satuan "%" terlalu besar', v_nm; end if;
      if v_q <> round(v_q, 3) then
        raise exception '1 % = % % — terlalu kecil untuk dicatat (stok disimpan sampai 3 angka di belakang koma). Pakai satuan utama yang lebih kecil, mis. gram atau ml.', v_nm, unit_num(v_q), v_base;
      end if;
      -- Nama yang berupa ukuran (mis. "250 gram", "Kemasan 1 liter") harus cocok dengan isinya
      select * into mu from unit_measure(v_nm);
      if mu.dim is not null and mb.dim is not null then
        v_exp := unit_factor(v_nm, v_base, v_dens);
        if v_exp is not null and mu.dim <> mb.dim then v_exp := round(v_exp, 3); end if;
        if v_exp is null then
          raise exception '"%" adalah volume/berat yang berbeda dari satuan utama %. Isi "Berat 1 liter" barang ini agar bisa dihitung, atau ganti nama satuannya.', v_nm, v_base;
        elsif abs(v_exp - v_q) > greatest(0.001, v_exp * 0.005) then
          raise exception 'Satuan "%" = % %, bukan % %. Perbaiki isinya.', v_nm, unit_num(round(v_exp, 3)), v_base, unit_num(v_q), v_base;
        end if;
      end if;
    end if;
    v_map := v_map || jsonb_build_object(lower(v_nm), v_q);
    v_rows := v_rows || jsonb_build_object('name', v_nm, 'qty', v_q, 'cq', v_cq, 'cu', v_cu,
      'pr', greatest(0, coalesce((u->>'price_retail')::numeric, 0)), 'pw', greatest(0, coalesce((u->>'price_wholesale')::numeric, 0)),
      'bc', nullif(trim(coalesce(u->>'barcode', '')), ''));
    i := i + 1;
  end loop;

  -- 2) Simpan
  if p_id is null then
    insert into products(kos_id, name, base_unit, cost, min_stock, sku, density) values (p_kos, trim(p_name), v_base, coalesce(p_cost, 0), coalesce(p_min, 0), v_sku, v_dens) returning id into v_id;
  else
    update products set name = trim(p_name), base_unit = v_base, cost = coalesce(p_cost, 0), min_stock = coalesce(p_min, 0), sku = v_sku, density = v_dens
      where id = p_id and kos_id = p_kos returning id into v_id;
  end if;

  delete from product_units where product_id = v_id;
  i := 0;
  for r in select * from jsonb_array_elements(v_rows) loop
    v_code := r->>'bc';
    if v_code is not null then
      select p.name into v_other from product_units pu join products p on p.id = pu.product_id where pu.kos_id = p_kos and pu.barcode = v_code;
      if v_other is not null then raise exception 'Barcode % sudah dipakai %', v_code, v_other; end if;
    end if;
    insert into product_units(product_id, kos_id, name, qty, price_retail, price_wholesale, sort, barcode, content_qty, content_unit)
    values (v_id, p_kos, r->>'name', (r->>'qty')::numeric, (r->>'pr')::numeric, (r->>'pw')::numeric, i, v_code, (r->>'cq')::numeric, r->>'cu');
    i := i + 1;
  end loop;

  if p_id is null and coalesce(p_initial_stock, 0) > 0 then
    if p_initial_stock <> round(p_initial_stock, 3) then raise exception 'Stok awal maksimal 3 angka di belakang koma'; end if;
    update products set stock = p_initial_stock where id = v_id;
    insert into stock_moves(kos_id, product_id, kind, delta, stock_after, value, note)
    values (p_kos, v_id, 'awal', p_initial_stock, p_initial_stock, round(p_initial_stock * coalesce(p_cost, 0), 2), 'Stok awal');
  end if;
  return v_id;
end $$;
revoke execute on function public.product_save(uuid, uuid, text, text, numeric, numeric, jsonb, numeric, text, numeric) from public, anon;
grant execute on function public.product_save(uuid, uuid, text, text, numeric, numeric, jsonb, numeric, text, numeric) to authenticated;
grant execute on function public.unit_measure(text), public.unit_factor(text, text, numeric), public.unit_to_base(uuid, text, numeric), public.unit_num(numeric) to authenticated;

-- ---------- Mutasi stok: boleh mengirim jumlah dalam satuan jual; dikonversi di server ----------
create or replace function public._prasara_patch(p_sig text, p_old text, p_new text)
returns void language plpgsql as $$
declare d text;
begin
  d := pg_get_functiondef(p_sig::regprocedure);
  if position(p_old in d) = 0 then raise exception 'patch %: potongan tidak ditemukan', p_sig; end if;
  execute replace(d, p_old, p_new);
end $$;
select public._prasara_patch('public.stock_transfer(uuid,uuid,uuid,uuid,jsonb,text)',
  'v_qty := round(coalesce((x->>''qty'')::numeric, 0), 3);',
  'v_qty := case when nullif(trim(coalesce(x->>''unit'', '''')), '''') is not null then unit_to_base(p.id, x->>''unit'', (x->>''qty'')::numeric)
                  else round(coalesce((x->>''qty'')::numeric, 0), 3) end;');
drop function public._prasara_patch(text, text, text);
