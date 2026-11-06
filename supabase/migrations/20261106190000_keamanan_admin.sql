-- PRASARA Management Center bagian 3: MFA Super Admin, tangguhkan bisnis, akses bantuan (diagnostik, dengan izin pelanggan),
-- catatan jadwal otomatis untuk halaman status sistem.

-- ---------- MFA: Super Admin yang sudah mengaktifkan verifikasi dua langkah wajib masuk dengan kode (aal2) ----------
create or replace function public.admin_mfa_state()
returns jsonb language sql stable security definer set search_path = public, auth as $$
  select jsonb_build_object(
    'enrolled', exists (select 1 from auth.mfa_factors f where f.user_id = auth.uid() and f.status = 'verified'),
    'aal', coalesce(auth.jwt() ->> 'aal', 'aal1'));
$$;

-- Izin tetap dari peran, tetapi ditolak bila MFA aktif dan sesi ini belum diverifikasi kode
create or replace function public.admin_can(p_perm text)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(p_perm = any(role_perms(admin_role())), false)
     and not ((admin_mfa_state() ->> 'enrolled')::boolean and admin_mfa_state() ->> 'aal' <> 'aal2');
$$;
create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select admin_role() = 'super_admin' and not ((admin_mfa_state() ->> 'enrolled')::boolean and admin_mfa_state() ->> 'aal' <> 'aal2');
$$;
create or replace function public.admin_me()
returns jsonb language sql stable security definer set search_path = public, auth as $$
  select case when admin_role() is null then null else
    jsonb_build_object('role', admin_role(), 'perms', to_jsonb(role_perms(admin_role())), 'email', (select email from auth.users where id = auth.uid()),
      'mfa', admin_mfa_state(),
      'needs_code', (admin_mfa_state() ->> 'enrolled')::boolean and admin_mfa_state() ->> 'aal' <> 'aal2') end;
$$;

-- Izin baru: tangguhkan bisnis & akses bantuan
create or replace function public.role_perms(p_role text)
returns text[] language sql immutable as $$
  select case p_role
    when 'super_admin' then array['dashboard.view','finance.view','customers.view','customers.note','customers.message','customers.override',
                                  'customers.suspend','customers.assist','payments.view','payments.verify','audit.view','staff.manage','system.view',
                                  'tickets.view','tickets.reply','announce.manage','templates.manage']
    when 'support'     then array['customers.view','customers.note','customers.message','customers.assist','payments.view','tickets.view','tickets.reply']
    when 'operations'  then array['dashboard.view','customers.view','customers.note','customers.message','tickets.view','tickets.reply','announce.manage','templates.manage']
    when 'finance'     then array['dashboard.view','finance.view','payments.view','payments.verify','customers.view']
    when 'developer'   then array['system.view','audit.view','tickets.view']
    else array[]::text[] end;
$$;

-- ---------- Tangguhkan bisnis ----------
alter table public.kos add column if not exists suspended_at timestamptz;
alter table public.kos add column if not exists suspend_reason text;

-- Anggota bisnis yang ditangguhkan tidak bisa membuka/mengubah data (data tidak dihapus).
create or replace function public.is_member(p_kos uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from kos_members m join kos k on k.id = m.kos_id where m.kos_id = p_kos and m.user_id = auth.uid() and k.suspended_at is null);
$$;
-- Daftar bisnis tetap terlihat (dengan tanda ditangguhkan) agar pemilik tahu alasannya
create or replace function public.is_member_any(p_kos uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from kos_members where kos_id = p_kos and user_id = auth.uid());
$$;
drop policy if exists kos_select on public.kos;
create policy kos_select on public.kos for select using (public.is_member_any(id));

create or replace function public.admin_suspend(p_kos uuid, p_suspend boolean, p_reason text)
returns void language plpgsql security definer set search_path = public as $$
declare k kos;
begin
  if not admin_can('customers.suspend') then raise exception 'Khusus Super Admin'; end if;
  if p_suspend and coalesce(length(trim(p_reason)), 0) < 5 then raise exception 'Tuliskan alasan (minimal 5 huruf)'; end if;
  select * into k from kos where id = p_kos for update;
  if k.id is null then raise exception 'Bisnis tidak ditemukan'; end if;
  if is_admin_owner(k.id) then raise exception 'Bisnis milik admin tidak bisa ditangguhkan'; end if;
  update kos set suspended_at = case when p_suspend then now() else null end, suspend_reason = case when p_suspend then trim(p_reason) else null end where id = p_kos;
  insert into admin_log(actor_email, action, kos_id, kos_name, detail)
  values (actor_email(), case when p_suspend then 'tangguhkan' else 'aktifkan_lagi' end, p_kos, k.name, jsonb_build_object('alasan', nullif(trim(coalesce(p_reason, '')), '')));
end $$;

-- ---------- Akses bantuan (Assisted Access) — diagnostik lihat-saja, hanya dengan izin pemilik ----------
create table if not exists public.support_access (
  id uuid primary key default gen_random_uuid(),
  kos_id uuid not null references public.kos(id) on delete cascade,
  granted_by uuid default auth.uid(),
  granted_at timestamptz not null default now(),
  expires_at timestamptz not null,
  revoked_at timestamptz
);
create index if not exists support_access_kos on public.support_access(kos_id, expires_at desc);
alter table public.support_access enable row level security;

create or replace function public.support_access_grant(p_kos uuid, p_hours int)
returns timestamptz language plpgsql security definer set search_path = public as $$
declare v_until timestamptz := now() + make_interval(hours => least(greatest(coalesce(p_hours, 24), 1), 72));
begin
  if not exists (select 1 from kos where id = p_kos and owner_id = auth.uid()) then raise exception 'Hanya pemilik bisnis yang bisa memberi izin'; end if;
  update support_access set revoked_at = now() where kos_id = p_kos and revoked_at is null and expires_at > now();
  insert into support_access(kos_id, expires_at) values (p_kos, v_until);
  return v_until;
end $$;

create or replace function public.support_access_revoke(p_kos uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from kos where id = p_kos and owner_id = auth.uid()) then raise exception 'Hanya pemilik bisnis'; end if;
  update support_access set revoked_at = now() where kos_id = p_kos and revoked_at is null and expires_at > now();
end $$;

create or replace function public.support_access_status(p_kos uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object('active_until', (select max(expires_at) from support_access where kos_id = p_kos and revoked_at is null and expires_at > now()),
    'views', (select coalesce(jsonb_agg(jsonb_build_object('at', l.created_at, 'by', l.actor_email) order by l.created_at desc), '[]'::jsonb)
              from (select * from admin_log where kos_id = p_kos and action = 'akses_bantuan' order by created_at desc limit 10) l))
  where is_member_any(p_kos);
$$;

-- Ringkasan diagnostik tanpa data pribadi penghuni / pelanggan toko. Setiap pembukaan tercatat.
create or replace function public.admin_assist(p_kos uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare k kos; v_until timestamptz; v_today date := (now() at time zone 'Asia/Jakarta')::date; r jsonb;
begin
  if not admin_can('customers.assist') then raise exception 'Tidak punya izin akses bantuan'; end if;
  select * into k from kos where id = p_kos;
  if k.id is null then raise exception 'Bisnis tidak ditemukan'; end if;
  select max(expires_at) into v_until from support_access where kos_id = p_kos and revoked_at is null and expires_at > now();
  if v_until is null then raise exception 'Pemilik belum memberi izin akses bantuan (Pusat bantuan › Izinkan tim PRASARA membantu)'; end if;
  if k.business_type = 'retail' then
    r := jsonb_build_object(
      'Barang aktif', (select count(*) from products where kos_id = k.id and active),
      'Barang tanpa harga modal', (select count(*) from products where kos_id = k.id and active and cost = 0),
      'Barang stok minus', (select count(*) from products where kos_id = k.id and stock < 0),
      'Barang tanpa harga jual', (select count(distinct product_id) from product_units u where u.kos_id = k.id and u.price_retail = 0),
      'Penjualan hari ini', (select count(*) from sales where kos_id = k.id and sale_date = v_today and status = 'selesai'),
      'Penjualan dibatalkan 30 hari', (select count(*) from sales where kos_id = k.id and status = 'batal' and sold_at > now() - interval '30 days'),
      'Pesanan belum diterima', (select count(*) from purchases where kos_id = k.id and status in ('dipesan', 'sebagian')),
      'Saldo kas tercatat', (retail_ledger_internal(k.id) ->> 'kas'),
      'Jumlah pelanggan kasbon', (select count(*) from contacts where kos_id = k.id and kind = 'pelanggan'),
      'Catatan terakhir', (select max(created_at) from stock_moves where kos_id = k.id));
  else
    r := jsonb_build_object(
      'Kamar', (select count(*) from rooms where kos_id = k.id),
      'Kamar tanpa harga', (select count(*) from rooms where kos_id = k.id and coalesce(rent, 0) = 0 and status <> 'tidak_disewakan'),
      'Penghuni aktif', (select count(*) from leases where kos_id = k.id and status = 'aktif'),
      'Penghuni aktif tanpa nomor WA', (select count(*) from leases l join occupants o on o.id = l.occupant_id where l.kos_id = k.id and l.status = 'aktif' and coalesce(o.phone, '') = ''),
      'Sewa aktif tanpa tagihan', (select count(*) from leases l where l.kos_id = k.id and l.status = 'aktif' and not exists (select 1 from invoices i where i.lease_id = l.id)),
      'Tagihan telat', (select count(*) from invoice_summary where kos_id = k.id and overdue),
      'Bukti transfer menunggu', (select count(*) from payments where kos_id = k.id and status = 'menunggu'),
      'Pembayaran 30 hari', (select count(*) from payments where kos_id = k.id and created_at > now() - interval '30 days'),
      'Catatan terakhir', (select max(created_at) from payments where kos_id = k.id));
  end if;
  insert into admin_log(actor_email, action, kos_id, kos_name) values (actor_email(), 'akses_bantuan', k.id, k.name);
  return jsonb_build_object('until', v_until, 'type', k.business_type, 'data', r);
end $$;

-- Saldo kas toko untuk diagnostik (tanpa cek anggota; hanya dipanggil fungsi admin di atas)
create or replace function public.retail_ledger_internal(p_kos uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  with m as (
    select 'kas' as acc, total as amt from sales where kos_id = p_kos and status = 'selesai' and pay_method = 'tunai'
    union all select case when pay_method = 'tunai' then 'kas' else 'bank' end, -total from purchases where kos_id = p_kos and status in ('selesai', 'sebagian') and pay_method in ('tunai', 'transfer')
    union all select account, case when kind = 'piutang' then amount else -amount end from debt_payments where kos_id = p_kos and status = 'selesai'
    union all select account, -amount from expenses where kos_id = p_kos
    union all select account, case when kind in ('pendapatan_lain', 'setoran_modal', 'pinjaman_masuk', 'tarik_bank') then amount
                                   when kind in ('prive', 'bayar_pinjaman', 'setor_bank') then -amount else 0 end from cash_entries where kos_id = p_kos
  ) select jsonb_build_object('kas', coalesce(sum(amt) filter (where acc = 'kas'), 0)) from m;
$$;
revoke execute on function public.retail_ledger_internal(uuid) from public, anon, authenticated;

-- ---------- Catatan jadwal otomatis (untuk halaman Status sistem) ----------
create table if not exists public.cron_runs (
  id bigint generated always as identity primary key,
  ran_at timestamptz not null default now(),
  ok boolean not null,
  result jsonb
);
alter table public.cron_runs enable row level security;

create or replace function public.admin_system()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_today date := (now() at time zone 'Asia/Jakarta')::date;
begin
  if not admin_can('system.view') then raise exception 'Tidak punya izin melihat status sistem'; end if;
  return jsonb_build_object(
    'db_time', now(),
    'cron', (select coalesce(jsonb_agg(row_to_json(c) order by c.ran_at desc), '[]'::jsonb) from (select ran_at, ok, result from cron_runs order by ran_at desc limit 7) c),
    'emails_today', (select count(*) from digest_log where day = v_today)
      + (select count(*) from onboarding_email_log where sent_at >= v_today::timestamp at time zone 'Asia/Jakarta')
      + (select count(*) from summary_log where sent_at >= v_today::timestamp at time zone 'Asia/Jakarta')
      + (select count(*) from announcement_sends where sent_at >= v_today::timestamp at time zone 'Asia/Jakarta'),
    'tables', jsonb_build_object('bisnis', (select count(*) from kos), 'transaksi_toko', (select count(*) from sales), 'tagihan_kos', (select count(*) from invoices),
                                 'pembayaran_kos', (select count(*) from payments), 'tiket', (select count(*) from support_tickets)));
end $$;

revoke execute on function public.admin_mfa_state(), public.admin_suspend(uuid, boolean, text), public.support_access_grant(uuid, int), public.support_access_revoke(uuid),
  public.support_access_status(uuid), public.admin_assist(uuid), public.admin_system(), public.is_member_any(uuid) from public, anon;
grant execute on function public.admin_mfa_state(), public.admin_suspend(uuid, boolean, text), public.support_access_grant(uuid, int), public.support_access_revoke(uuid),
  public.support_access_status(uuid), public.admin_assist(uuid), public.admin_system(), public.is_member_any(uuid) to authenticated;

-- Profil pelanggan: tambah status penangguhan & izin akses bantuan (membungkus versi sebelumnya)
alter function public.admin_customer(uuid) rename to admin_customer_base;
revoke execute on function public.admin_customer_base(uuid) from public, anon, authenticated;
create or replace function public.admin_customer(p_kos uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v jsonb; k kos;
begin
  v := admin_customer_base(p_kos);
  select * into k from kos where id = p_kos;
  return jsonb_set(v, '{kos}', (v->'kos') || jsonb_build_object('suspended_at', k.suspended_at, 'suspend_reason', k.suspend_reason))
         || jsonb_build_object('access_until', (select max(expires_at) from support_access where kos_id = p_kos and revoked_at is null and expires_at > now()));
end $$;
revoke execute on function public.admin_customer(uuid) from public, anon;
grant execute on function public.admin_customer(uuid) to authenticated;
