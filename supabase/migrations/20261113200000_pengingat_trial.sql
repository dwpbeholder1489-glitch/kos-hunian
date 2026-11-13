-- Pengingat masa coba (PRASARA_PAKET_HARGA_MASTER_PROMPT_V2 §5.1 & §8; event TRIAL.DAY_10/12/14, TRIAL.EXPIRED).
-- Aturan: tiap pengingat hanya sekali per bisnis; paling banyak dua pengingat dalam tiga hari terakhir.
-- Tampil hanya untuk pemilik dan hanya bila masa coba sedang berjalan / baru berakhir (dan belum berlangganan).
-- Tabel ber-kos_id: memakai trigger penjaga bisnis tutup (zz_kos_open_guard) seperti tabel lain.
create table if not exists public.trial_reminders (
  id bigserial primary key,
  kos_id uuid not null references public.kos(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null check (kind in ('hari10','hari12','hari14','habis')),
  shown_at timestamptz not null default now(),
  unique (kos_id, kind)
);
create index if not exists trial_reminders_kos_time on public.trial_reminders (kos_id, shown_at);
alter table public.trial_reminders enable row level security;
drop trigger if exists zz_kos_open_guard on public.trial_reminders;
create trigger zz_kos_open_guard before insert or update or delete on public.trial_reminders for each row execute function public.kos_open_guard();

create or replace function public.trial_reminder_next(p_kos uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare k record; today date := (now() at time zone 'Asia/Jakarta')::date; days int; kd text; recent int;
begin
  if auth.uid() is null or not member_in('team', p_kos) then return null; end if;
  select * into k from kos where id = p_kos;
  if not found or k.trial_until is null then return null; end if;
  if k.paid_until is not null and k.paid_until >= today then return null; end if;   -- sudah berlangganan
  days := k.trial_until - today;
  kd := case days when 4 then 'hari10' when 2 then 'hari12' when 0 then 'hari14' when -1 then 'habis' else null end;
  if kd is null then return null; end if;
  if exists (select 1 from trial_reminders where kos_id = p_kos and kind = kd) then return null; end if;
  select count(*) into recent from trial_reminders where kos_id = p_kos and shown_at > now() - interval '3 days';
  if recent >= 2 then return null; end if;
  insert into trial_reminders(kos_id, user_id, kind) values (p_kos, auth.uid(), kd);
  return jsonb_build_object('kind', kd, 'sisa', greatest(days, 0), 'sampai', k.trial_until);
end $$;

revoke execute on function public.trial_reminder_next(uuid) from public, anon;
grant execute on function public.trial_reminder_next(uuid) to authenticated;
