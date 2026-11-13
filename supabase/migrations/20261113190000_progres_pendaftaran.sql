-- Progres pendaftaran bisnis disimpan di server (Bab 5 & 6.5 dokumen Customer Journey):
-- pengguna bisa melanjutkan dari perangkat lain dan tidak kehilangan isian bila ganti HP.
-- Satu draf per pengguna. Isi = {sel, biz, step, sub}. Tabel tanpa policy: hanya lewat fungsi di bawah.
create table if not exists public.reg_drafts (
  user_id uuid primary key references auth.users(id) on delete cascade,
  data jsonb not null,
  updated_at timestamptz not null default now()
);
alter table public.reg_drafts enable row level security;

create or replace function public.reg_draft_get()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v uuid := auth.uid();
begin
  if v is null then raise exception 'Masuk dulu'; end if;
  return (select data from public.reg_drafts where user_id = v);
end $$;

create or replace function public.reg_draft_save(p_data jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare v uuid := auth.uid();
begin
  if v is null then raise exception 'Masuk dulu'; end if;
  if p_data is null or jsonb_typeof(p_data) <> 'object' then raise exception 'Isian tidak valid'; end if;
  if length(p_data::text) > 200000 then raise exception 'Isian terlalu besar'; end if;
  insert into public.reg_drafts(user_id, data, updated_at) values (v, p_data, now())
    on conflict (user_id) do update set data = excluded.data, updated_at = now();
end $$;

create or replace function public.reg_draft_clear()
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'Masuk dulu'; end if;
  delete from public.reg_drafts where user_id = auth.uid();
end $$;

revoke execute on function public.reg_draft_get(), public.reg_draft_save(jsonb), public.reg_draft_clear() from public, anon;
grant execute on function public.reg_draft_get(), public.reg_draft_save(jsonb), public.reg_draft_clear() to authenticated;
