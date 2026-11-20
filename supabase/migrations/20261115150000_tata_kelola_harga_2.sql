-- Tahap 1 Tata kelola harga & kredit (bagian 2): batas diskon kasir & margin minimum (keputusan pemilik 15 Nov 2026).
-- Aturan: bawaan KOSONG = tanpa batas. Pemilik mengisi batas di Pengaturan. Penjualan yang melewati batas
-- ditolak (BATAS_DISKON) kecuali pemilik/pengelola yang sedang login mengizinkannya dengan alasan (tercatat),
-- mengikuti pola BATAS_KREDIT di pesanan grosir. Diskon promo otomatis TIDAK dihitung sebagai diskon manual.
-- Margin kotor = (total jual − HPP) ÷ total jual, total sudah termasuk PPN.

-- 1. Pengaturan batas (pemilik/pengelola) ---------------------------------------------------------
create or replace function public.price_policy_set(p_kos uuid, p_max_disc numeric, p_min_margin numeric)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_old jsonb; v_new jsonb;
begin
  if not member_in('settings', p_kos) then raise exception 'Hanya pemilik/pengelola yang bisa mengatur batas diskon'; end if;
  if p_max_disc is not null and (p_max_disc < 0 or p_max_disc > 100) then raise exception 'Batas diskon harus 0–100 persen'; end if;
  if p_min_margin is not null and (p_min_margin < 0 or p_min_margin > 100) then raise exception 'Margin minimum harus 0–100 persen'; end if;
  select coalesce(profile -> 'price_policy', '{}'::jsonb) into v_old from kos where id = p_kos for update;
  v_new := jsonb_strip_nulls(jsonb_build_object('max_disc', p_max_disc, 'min_margin', p_min_margin));
  update kos set profile = jsonb_set(coalesce(profile, '{}'::jsonb), '{price_policy}', v_new) where id = p_kos;
  perform config_log(p_kos, 'batas_harga', 'Batas diskon & margin kasir', v_old, v_new, null, 'tinggi', actor_email());
  return v_new;
end $$;
revoke execute on function public.price_policy_set(uuid, numeric, numeric) from public, anon;
grant execute on function public.price_policy_set(uuid, numeric, numeric) to authenticated;

-- 2. Pengecualian yang diizinkan (per transaksi) ---------------------------------------------------
create table if not exists public.discount_overrides (
  sale_id uuid primary key,
  kos_id uuid not null references public.kos(id) on delete cascade,
  reason text not null,
  disc_pct numeric,
  margin_pct numeric,
  by_email text,
  at timestamptz not null default now()
);
create index if not exists discount_overrides_kos on public.discount_overrides(kos_id, at desc);
alter table public.discount_overrides enable row level security;
drop policy if exists discount_overrides_select on public.discount_overrides;
create policy discount_overrides_select on public.discount_overrides for select using (member_can(kos_id, 'finance'));
grant select on public.discount_overrides to authenticated;
drop trigger if exists zz_kos_open_guard on public.discount_overrides;
create trigger zz_kos_open_guard before insert or update or delete on public.discount_overrides for each row execute function public.kos_open_guard();

-- Teks persen gaya Indonesia (18,37% · 10%)
create or replace function public.pct_txt(n numeric)
returns text language sql immutable as $$
  select replace(rtrim(to_char(round(coalesce(n, 0), 2), 'FM999990.99'), '.'), '.', ',') || '%';
$$;

-- 3. Penjaga batas (dipanggil sale_create) ---------------------------------------------------------
create or replace function public.discount_guard(p_id uuid, p_kos uuid, p_manual numeric, p_sub numeric, p_total numeric, p_cost numeric)
returns void language plpgsql security definer set search_path = public as $$
declare pp jsonb; v_max numeric; v_minm numeric; v_pct numeric := 0; v_margin numeric;
begin
  select coalesce(profile -> 'price_policy', '{}'::jsonb) into pp from kos where id = p_kos;
  v_max := nullif(pp->>'max_disc', '')::numeric;
  v_minm := nullif(pp->>'min_margin', '')::numeric;
  if v_max is null and v_minm is null then return; end if;
  if coalesce(p_sub, 0) > 0 then v_pct := round(greatest(coalesce(p_manual, 0), 0) * 100 / p_sub, 2); end if;
  if coalesce(p_total, 0) > 0 then v_margin := round((p_total - coalesce(p_cost, 0)) * 100 / p_total, 2); end if;
  if (v_max is null or v_pct <= v_max) and (v_minm is null or v_margin is null or v_margin >= v_minm) then return; end if;
  if exists (select 1 from discount_overrides where sale_id = p_id) then return; end if;
  -- Persen ditulis gaya Indonesia: 18,37% (koma, tanpa spasi)
  if v_max is not null and v_pct > v_max and v_minm is not null and v_margin is not null and v_margin < v_minm then
    raise exception 'BATAS_DISKON: Diskon % dan margin % melewati batas (diskon maks %, margin minimum %). Pemilik/pengelola bisa mengizinkan dengan alasan.',
      pct_txt(v_pct), pct_txt(v_margin), pct_txt(v_max), pct_txt(v_minm);
  elsif v_max is not null and v_pct > v_max then
    raise exception 'BATAS_DISKON: Diskon % melewati batas maks %. Pemilik/pengelola bisa mengizinkan dengan alasan.', pct_txt(v_pct), pct_txt(v_max);
  else
    raise exception 'BATAS_DISKON: Margin % di bawah minimum %. Pemilik/pengelola bisa mengizinkan dengan alasan.', pct_txt(v_margin), pct_txt(v_minm);
  end if;
end $$;
revoke execute on function public.discount_guard(uuid, uuid, numeric, numeric, numeric, numeric) from public, anon, authenticated;

-- 4. Patch sale_create: panggil penjaga sebelum PPN (setelah total final dan HPP terkumpul)
create or replace function public._prasara_patch(p_sig text, p_old text, p_new text)
returns void language plpgsql as $$
declare v_def text;
begin
  v_def := pg_get_functiondef(p_sig::regprocedure);
  if position(p_old in v_def) = 0 then raise exception 'Patch % tidak menemukan teks: %', p_sig, left(p_old, 80); end if;
  execute replace(v_def, p_old, p_new);
end $$;

select public._prasara_patch('public.sale_create(uuid, uuid, text, jsonb, numeric, text, numeric, uuid, date, text, jsonb)',
  $x$  -- PPN (harga sudah termasuk PPN): bagian PPN dari nilai kena pajak setelah diskon proporsional$x$,
  $x$  perform discount_guard(p_id, p_kos, coalesce(p_discount, 0) - (v_promo->>'total')::numeric, v_sub, v_total, v_cost);
  -- PPN (harga sudah termasuk PPN): bagian PPN dari nilai kena pajak setelah diskon proporsional$x$);

-- 5. Pintu Kasir: sama dengan sale_create, plus pengecualian dari pemilik/pengelola (alasan wajib)
create or replace function public.sale_create_ov(p_id uuid, p_kos uuid, p_tier text, p_lines jsonb, p_discount numeric, p_method text,
  p_paid numeric default null, p_contact uuid default null, p_due date default null, p_note text default null, p_payments jsonb default null,
  p_override text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  if nullif(trim(coalesce(p_override, '')), '') is not null then
    if not member_in('settings', p_kos) then raise exception 'Hanya pemilik/pengelola yang bisa mengizinkan diskon di atas batas'; end if;
    if length(trim(p_override)) < 3 then raise exception 'Tulis alasan singkat untuk pengecualian'; end if;
    insert into discount_overrides(sale_id, kos_id, reason, by_email, at)
    values (p_id, p_kos, trim(p_override), actor_email(), now())
    on conflict (sale_id) do nothing;
  end if;
  return sale_create(p_id, p_kos, p_tier, p_lines, p_discount, p_method, p_paid, p_contact, p_due, p_note, p_payments);
end $$;
revoke execute on function public.sale_create_ov(uuid, uuid, text, jsonb, numeric, text, numeric, uuid, date, text, jsonb, text) from public, anon;
grant execute on function public.sale_create_ov(uuid, uuid, text, jsonb, numeric, text, numeric, uuid, date, text, jsonb, text) to authenticated;

drop function if exists public._prasara_patch(text, text, text);
