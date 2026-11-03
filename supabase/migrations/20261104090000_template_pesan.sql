-- Teks pesan WhatsApp yang bisa diubah pemilik kos (kosong = pakai teks bawaan aplikasi)
alter table public.kos add column if not exists wa_reminder_tpl text;
alter table public.kos add column if not exists wa_portal_tpl text;
alter table public.kos drop constraint if exists kos_wa_tpl_size;
alter table public.kos add constraint kos_wa_tpl_size check (
  (wa_reminder_tpl is null or length(wa_reminder_tpl) <= 2000) and
  (wa_portal_tpl is null or length(wa_portal_tpl) <= 2000));
grant update (name, address, contact_phone, payment_info, house_rules, notify_email, daily_digest, qris_image, wa_reminder_tpl, wa_portal_tpl) on public.kos to authenticated;

-- Data pengiriman harian: tambah teks pengingat milik kos untuk tombol "Kirim WA" di email daftar tagih
create or replace function public.reminder_batch()
returns jsonb language sql stable security definer set search_path = public, auth as $$
  with t as (select (now() at time zone 'Asia/Jakarta')::date as d)
  select coalesce(jsonb_agg(row_to_json(x)), '[]'::jsonb) from (
    select s.id as invoice_id, s.kos_id, s.kind, s.description, s.period_start, s.period_end, s.due_date,
           s.amount, s.outstanding, (s.due_date - t.d) as days_left,
           o.id as occupant_id, o.name as occupant_name, o.phone as occupant_phone,
           case when o.email_reminders then o.email end as occupant_email, o.portal_token,
           r.code as room_code,
           k.name as kos_name, k.contact_phone, k.payment_info, k.daily_digest, k.wa_reminder_tpl,
           kos_plan(k.id) as plan, u.email as owner_email
    from invoice_summary s
    cross join t
    join occupants o on o.id = s.occupant_id
    join rooms r on r.id = s.room_id
    join kos k on k.id = s.kos_id
    join auth.users u on u.id = k.owner_id
    where s.status <> 'batal' and s.outstanding > 0 and s.due_date <= t.d + 3
  ) x;
$$;
revoke execute on function public.reminder_batch() from public, anon, authenticated;
grant execute on function public.reminder_batch() to service_role;
