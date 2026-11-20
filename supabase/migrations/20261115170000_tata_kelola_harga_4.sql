-- Tahap 1 Tata kelola harga & kredit (bagian 4): tipe pelanggan (umum/reseller/distributor/institusi) dan
-- sales yang memegang pelanggan (RET-004, RET-009). Laporan kinerja sales menyusul di tahap KPI grosir.

alter table public.contacts add column if not exists tipe text;
alter table public.contacts add column if not exists sales_user uuid references auth.users(id) on delete set null;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'contacts_tipe_check') then
    alter table public.contacts add constraint contacts_tipe_check check (tipe is null or tipe in ('umum', 'reseller', 'distributor', 'institusi'));
  end if;
end $$;

-- Atur tipe & sales pelanggan (keuangan/pemilik). Sales harus anggota bisnis itu.
create or replace function public.customer_profile_set(p_contact uuid, p_tipe text, p_sales uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare c contacts; v_old jsonb;
begin
  select * into c from contacts where id = p_contact for update;
  if c.id is null or not member_in('finance', c.kos_id) then raise exception 'Pelanggan tidak ditemukan'; end if;
  if c.kind <> 'pelanggan' then raise exception 'Pengaturan ini hanya untuk pelanggan'; end if;
  if p_tipe is not null and p_tipe not in ('umum', 'reseller', 'distributor', 'institusi') then raise exception 'Tipe pelanggan tidak dikenal'; end if;
  if p_sales is not null and not exists (select 1 from kos_members where kos_id = c.kos_id and user_id = p_sales) then
    raise exception 'Sales harus anggota bisnis ini';
  end if;
  v_old := jsonb_build_object('tipe', c.tipe, 'sales', c.sales_user);
  update contacts set tipe = p_tipe, sales_user = p_sales where id = c.id;
  perform config_log(c.kos_id, 'profil_pelanggan', 'Profil pelanggan ' || c.name, v_old,
    jsonb_build_object('tipe', p_tipe, 'sales', p_sales), null, 'rendah', actor_email());
  return jsonb_build_object('tipe', p_tipe, 'sales', p_sales);
end $$;
revoke execute on function public.customer_profile_set(uuid, text, uuid) from public, anon;
grant execute on function public.customer_profile_set(uuid, text, uuid) to authenticated;

-- Daftar kontak membawa tipe & sales agar formulir Syarat pelanggan menampilkan nilai tersimpan
create or replace function public._prasara_patch(p_sig text, p_old text, p_new text)
returns void language plpgsql as $$
declare v_def text;
begin
  v_def := pg_get_functiondef(p_sig::regprocedure);
  if position(p_old in v_def) = 0 then raise exception 'Patch % tidak menemukan teks: %', p_sig, left(p_old, 80); end if;
  execute replace(v_def, p_old, p_new);
end $$;
select public._prasara_patch('public.contacts_overview(uuid)',
  $x$select c.id, c.kind, c.name, c.phone, c.created_at, c.archived_at,$x$,
  $x$select c.id, c.kind, c.name, c.phone, c.created_at, c.archived_at, c.tipe, c.sales_user,$x$);
-- Riwayat syarat pelanggan menyimpan nilai SEBELUM (batas kredit, tempo, daftar harga) — riwayat limit kredit (RET-014)
select public._prasara_patch('public.customer_terms_set(uuid, jsonb)',
  $x$'Syarat pelanggan ' || c.name, null,$x$,
  $x$'Syarat pelanggan ' || c.name, jsonb_build_object('batas_kredit', c.credit_limit, 'tempo', c.terms_days, 'daftar_harga', c.price_list_id),$x$);
drop function if exists public._prasara_patch(text, text, text);
