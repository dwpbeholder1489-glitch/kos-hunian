-- Pengaturan toko (catatan kaki struk), pengelola boleh mengubah pengaturan bisnis,
-- halaman Pelanggan & supplier (saldo + riwayat), dan pencatatan "dicatat oleh".

-- ---------- Pengaturan ----------
alter table public.kos add column if not exists receipt_footer text check (receipt_footer is null or length(receipt_footer) <= 200);
grant update (name, address, contact_phone, payment_info, house_rules, notify_email, daily_digest, qris_image, wa_reminder_tpl, wa_portal_tpl,
              onboarding_emails, weekly_summary, monthly_summary, receipt_footer) on public.kos to authenticated;

-- Pemilik atau pengelola (area settings) boleh mengubah pengaturan; kolom paket tetap terkunci lewat hak kolom di atas
drop policy if exists kos_update on public.kos;
create policy kos_update on public.kos for update using (owner_id = auth.uid() or public.member_can(id, 'settings'))
  with check (owner_id = auth.uid() or public.member_can(id, 'settings'));

-- Email yang dikirim ke pemilik hanya bisa diatur oleh pemilik sendiri
create or replace function public.kos_owner_prefs_guard()
returns trigger language plpgsql as $$
begin
  if new.owner_id is distinct from auth.uid() and auth.uid() is not null
     and (new.onboarding_emails, new.weekly_summary, new.monthly_summary, new.daily_digest, new.notify_email)
         is distinct from (old.onboarding_emails, old.weekly_summary, old.monthly_summary, old.daily_digest, old.notify_email) then
    raise exception 'Pengaturan email pemilik hanya bisa diubah oleh pemilik';
  end if;
  return new;
end $$;
drop trigger if exists kos_owner_prefs_guard on public.kos;
create trigger kos_owner_prefs_guard before update on public.kos for each row execute function public.kos_owner_prefs_guard();

-- ---------- Dicatat oleh (baris baru) ----------
alter table public.payments add column if not exists created_by uuid default auth.uid();
alter table public.expenses add column if not exists created_by uuid default auth.uid();
alter table public.cash_entries add column if not exists created_by uuid default auth.uid();

-- Nama (email) anggota bisnis untuk label "dicatat oleh"
create or replace function public.member_names(p_kos uuid)
returns jsonb language plpgsql stable security definer set search_path = public, auth as $$
begin
  if not member_in('stock,finance,rent', p_kos) then raise exception 'Tidak punya akses ke bisnis ini'; end if;
  return (select coalesce(jsonb_object_agg(u.id, u.email), '{}') from kos_members m join auth.users u on u.id = m.user_id where m.kos_id = p_kos);
end $$;

-- ---------- Pelanggan & supplier ----------
create or replace function public.contacts_overview(p_kos uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_fin boolean := member_in('finance', p_kos);
begin
  if not member_in('stock,finance', p_kos) then raise exception 'Tidak punya akses ke bisnis ini'; end if;
  return (select coalesce(jsonb_agg(x order by x.kind, x.name), '[]') from (
    select c.id, c.kind, c.name, c.phone, c.created_at,
      case when v_fin then contact_balance(c.id) end as balance,
      case when c.kind = 'pelanggan' then (select count(*) from sales s where s.contact_id = c.id and s.status = 'selesai')
           else (select count(*) from purchases p where p.contact_id = c.id and p.status <> 'batal') end as trx,
      greatest((select max(s.sold_at) from sales s where s.contact_id = c.id), (select max(p.created_at) from purchases p where p.contact_id = c.id),
               (select max(d.created_at) from debt_payments d where d.contact_id = c.id)) as last_at
    from contacts c where c.kos_id = p_kos and (v_fin or c.kind = 'supplier')) x);
end $$;

create or replace function public.contact_history(p_contact uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare c contacts;
begin
  select * into c from contacts where id = p_contact;
  if c.id is null or not member_in(case when c.kind = 'supplier' then 'stock,finance' else 'finance' end, c.kos_id) then raise exception 'Kontak tidak ditemukan'; end if;
  return (select coalesce(jsonb_agg(h order by h.at desc), '[]') from (
    select s.sold_at as at, s.sale_date as date, 'Penjualan ' || s.number || case when s.pay_method = 'kasbon' then ' (kasbon)' else '' end as what,
           s.total as amount, s.status, s.id as sale_id
      from sales s where s.contact_id = c.id
    union all select p.created_at, p.purchase_date, 'Belanja ' || p.number || case when p.pay_method = 'utang' then ' (utang)' else '' end, p.total, p.status, null
      from purchases p where p.contact_id = c.id
    union all select d.created_at, d.date, case when d.kind = 'piutang' then 'Bayar kasbon' else 'Bayar utang' end, d.amount, d.status, null
      from debt_payments d where d.contact_id = c.id
    order by 1 desc limit 60) h);
end $$;

revoke execute on function public.member_names(uuid), public.contacts_overview(uuid), public.contact_history(uuid) from public, anon;
grant execute on function public.member_names(uuid), public.contacts_overview(uuid), public.contact_history(uuid) to authenticated;
