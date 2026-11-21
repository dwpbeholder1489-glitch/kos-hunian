-- Fase 5 Adaptive Experience: ringkasan multi-bisnis lanjutan (konsolidasi hanya atas pilihan eksplisit pemilik).
-- Blueprint: "Konsolidasi data hanya dapat dilakukan apabila pemilik secara eksplisit mengaktifkannya" (Bab 16);
-- "Data antarbisnis tidak boleh tercampur" dan dasar pencatatan tiap bisnis tetap dibedakan.
-- Prinsip migrasi ini:
--  • Angka TIDAK dihitung ulang di sini: angka tiap bisnis tetap dari owner_overview2 (sumber yang sama dengan Laporan).
--  • Yang disimpan hanya PILIHAN akun: bisnis mana yang ingin digabung. Bawaan = kosong (tidak ada penggabungan).
--  • Pilihan hanya boleh memuat bisnis yang aktif, belum ditangguhkan, dan yang akun ini punya akses keuangan (member_in 'finance').
--  • Pilihan lama yang kehilangan akses diabaikan saat dibaca (tidak dihapus diam-diam dari data, tidak pernah menampilkan angka).

create table if not exists public.portfolio_settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  include uuid[] not null default '{}',
  updated_at timestamptz not null default now()
);
-- Tanpa policy: klien tidak bisa membaca/menulis langsung; hanya lewat RPC security definer di bawah.
alter table public.portfolio_settings enable row level security;
revoke all on public.portfolio_settings from public, anon, authenticated;

create or replace function public.portfolio_get()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_raw uuid[]; v_out uuid[] := '{}'; v_id uuid;
begin
  if auth.uid() is null then return jsonb_build_object('include', '[]'::jsonb); end if;
  select include into v_raw from public.portfolio_settings where user_id = auth.uid();
  foreach v_id in array coalesce(v_raw, '{}') loop
    if exists (select 1 from kos k join kos_members km on km.kos_id = k.id and km.user_id = auth.uid() and km.active
               where k.id = v_id and k.suspended_at is null)
       and member_in('finance', v_id) then
      v_out := v_out || v_id;
    end if;
  end loop;
  return jsonb_build_object('include', to_jsonb(v_out));
end $$;

create or replace function public.portfolio_set(p_include uuid[])
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_ids uuid[] := '{}'; v_id uuid;
begin
  if auth.uid() is null then raise exception 'Harus login'; end if;
  if coalesce(array_length(p_include, 1), 0) > 50 then raise exception 'Terlalu banyak bisnis dipilih (maks. 50).'; end if;
  foreach v_id in array coalesce(p_include, '{}') loop
    if v_id = any(v_ids) then continue; end if;
    if not exists (select 1 from kos k join kos_members km on km.kos_id = k.id and km.user_id = auth.uid() and km.active
                   where k.id = v_id and k.suspended_at is null) then
      raise exception 'Bisnis tidak ditemukan di akun Anda.';
    end if;
    if not member_in('finance', v_id) then
      raise exception 'Anda tidak punya akses keuangan ke salah satu bisnis yang dipilih.';
    end if;
    v_ids := v_ids || v_id;
  end loop;
  insert into public.portfolio_settings(user_id, include, updated_at) values (auth.uid(), v_ids, now())
  on conflict (user_id) do update set include = excluded.include, updated_at = now();
  return portfolio_get();
end $$;

revoke execute on function public.portfolio_get() from public, anon;
grant execute on function public.portfolio_get() to authenticated;
revoke execute on function public.portfolio_set(uuid[]) from public, anon;
grant execute on function public.portfolio_set(uuid[]) to authenticated;
