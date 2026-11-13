-- Audit onboarding & pembayaran (PRASARA_Customer_Journey..., Bab 11.3, Bab 19):
--  1) Batas waktu bayar invoice (plan_requests.due_at). Hanya untuk tampilan: invoice yang lewat batas
--     TIDAK dibatalkan otomatis, dan pembayaran Lynk yang masuk tetap dicocokkan (uang tidak boleh hilang).
--  2) Permintaan hapus akun (Bab 19: mekanisme penghapusan akun). Permintaan masuk antrean admin;
--     data bisnis yang wajib disimpan menurut ketentuan retensi TIDAK dihapus otomatis.

-- 1) Batas waktu bayar ---------------------------------------------------------
alter table public.plan_requests add column if not exists due_at timestamptz;
update public.plan_requests set due_at = created_at + interval '3 days' where due_at is null;
alter table public.plan_requests alter column due_at set default (now() + interval '3 days');

-- 2) Permintaan hapus akun -----------------------------------------------------
create table if not exists public.account_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  email text,
  kind text not null default 'hapus_akun' check (kind in ('hapus_akun')),
  status text not null default 'menunggu' check (status in ('menunggu','diproses','selesai','ditolak')),
  note text,
  created_at timestamptz not null default now(),
  handled_at timestamptz,
  handled_by text
);
alter table public.account_requests enable row level security;
-- Tanpa policy: tabel hanya diakses lewat fungsi di bawah.

create or replace function public.account_request_my()
returns jsonb language plpgsql stable security definer set search_path = public, auth as $$
declare v uuid := auth.uid();
begin
  if v is null then raise exception 'Masuk dulu'; end if;
  return (select to_jsonb(r) from public.account_requests r where r.user_id = v order by r.created_at desc limit 1);
end $$;

create or replace function public.account_request_delete()
returns jsonb language plpgsql security definer set search_path = public, auth as $$
declare v uuid := auth.uid(); v_email text; v_id uuid;
begin
  if v is null then raise exception 'Masuk dulu'; end if;
  select r.id into v_id from public.account_requests r where r.user_id = v and r.status in ('menunggu','diproses') limit 1;
  if v_id is null then
    select u.email into v_email from auth.users u where u.id = v;
    insert into public.account_requests(user_id, email) values (v, v_email) returning id into v_id;
    insert into public.admin_log(actor_email, action, detail)
      values (coalesce(v_email, 'pengguna'), 'minta_hapus_akun', jsonb_build_object('request', v_id));
  end if;
  return (select to_jsonb(r) from public.account_requests r where r.id = v_id);
end $$;

create or replace function public.admin_account_requests()
returns jsonb language plpgsql stable security definer set search_path = public, auth as $$
begin
  if not admin_can('customers.view') then raise exception 'Tidak punya izin melihat pelanggan'; end if;
  return (select coalesce(jsonb_agg(to_jsonb(x) order by x.created_at), '[]'::jsonb) from (
    select r.id, r.email, r.status, r.created_at, r.note,
      (select string_agg(k.name, ', ' order by k.name) from public.kos k join public.kos_members m on m.kos_id = k.id
         where m.user_id = r.user_id and m.role = 'pemilik') as bisnis
    from public.account_requests r where r.status in ('menunggu','diproses')) x);
end $$;

create or replace function public.admin_account_resolve(p_id uuid, p_status text, p_note text default null)
returns void language plpgsql security definer set search_path = public, auth as $$
declare v_email text := auth.jwt()->>'email';
begin
  if not admin_can('customers.override') then raise exception 'Khusus Super Admin'; end if;
  if p_status not in ('diproses','selesai','ditolak') then raise exception 'Status tidak dikenal'; end if;
  update public.account_requests set status = p_status, note = nullif(trim(coalesce(p_note, '')), ''),
      handled_at = now(), handled_by = v_email
    where id = p_id;
  if not found then raise exception 'Permintaan tidak ditemukan'; end if;
  insert into public.admin_log(actor_email, action, detail)
    values (v_email, 'hapus_akun_' || p_status, jsonb_build_object('request', p_id, 'catatan', p_note));
end $$;

revoke execute on function public.account_request_my(), public.account_request_delete(),
  public.admin_account_requests(), public.admin_account_resolve(uuid, text, text) from public, anon;
grant execute on function public.account_request_my(), public.account_request_delete() to authenticated;
grant execute on function public.admin_account_requests(), public.admin_account_resolve(uuid, text, text) to authenticated;
