-- Gambar QRIS milik tiap kos, tampil di portal penghuni
alter table public.kos add column if not exists qris_image text;
alter table public.kos drop constraint if exists kos_qris_size;
alter table public.kos add constraint kos_qris_size check (qris_image is null or (qris_image like 'data:image/%' and length(qris_image) <= 1500000));
grant update (name, address, contact_phone, payment_info, house_rules, notify_email, daily_digest, qris_image) on public.kos to authenticated;

create or replace function public.portal_get(p_token text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare o record; k record; l record; v_today date := (now() at time zone 'Asia/Jakarta')::date;
begin
  if coalesce(length(p_token), 0) < 20 then return null; end if;
  select * into o from occupants where portal_token = p_token;
  if o.id is null then return null; end if;
  select * into k from kos where id = o.kos_id;
  if kos_plan(k.id) <> 'pro' then
    return jsonb_build_object('locked', true, 'kos', jsonb_build_object('name', k.name, 'contact_phone', k.contact_phone));
  end if;
  select le.*, r.code as room_code, r.facilities into l
    from leases le join rooms r on r.id = le.room_id
    where le.occupant_id = o.id order by (le.status = 'aktif') desc, le.start_date desc limit 1;
  return jsonb_build_object(
    'locked', false,
    'today', v_today,
    'kos', jsonb_build_object('name', k.name, 'address', k.address, 'contact_phone', k.contact_phone,
                              'payment_info', k.payment_info, 'house_rules', k.house_rules, 'qris', k.qris_image),
    'occupant', jsonb_build_object('name', o.name, 'email', case when o.email_reminders then o.email end),
    'lease', case when l.id is null then null else jsonb_build_object(
        'room', l.room_code, 'rent', l.rent, 'start_date', l.start_date, 'end_date', l.end_date,
        'status', l.status, 'facilities', l.facilities) end,
    'invoices', coalesce((select jsonb_agg(x order by x.due_date desc) from (
        select s.id, s.kind, s.period_start, s.period_end, s.due_date, s.amount, s.description,
               s.paid, s.pending, s.outstanding, s.pay_state, s.overdue
        from invoice_summary s where s.occupant_id = o.id and s.status <> 'batal'
        order by s.due_date desc limit 24) x), '[]'::jsonb),
    'payments', coalesce((select jsonb_agg(y order by y.paid_at desc) from (
        select p.id, p.invoice_id, p.amount, p.paid_at, p.method, p.status, p.source
        from payments p join invoices i on i.id = p.invoice_id
        where i.occupant_id = o.id order by p.paid_at desc limit 24) y), '[]'::jsonb),
    'vacant_rooms', coalesce((select jsonb_agg(z order by z.code) from (
        select r.code, r.rent, r.facilities from rooms r where r.kos_id = k.id and r.status = 'tersedia') z), '[]'::jsonb)
  );
end $$;
