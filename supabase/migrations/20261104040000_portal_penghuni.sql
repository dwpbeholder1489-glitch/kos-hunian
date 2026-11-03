-- =====================================================================
-- Portal penghuni: link pribadi tiap penghuni (tanpa login) untuk melihat
-- tagihan, mengirim bukti transfer, dan bertanya ke asisten. Khusus paket Pro.
-- =====================================================================

-- Info kos untuk penghuni (diisi pengelola di Pengaturan)
alter table public.kos
  add column if not exists contact_phone text,
  add column if not exists payment_info text,
  add column if not exists house_rules text;
grant update (name, address, contact_phone, payment_info, house_rules) on public.kos to authenticated;

-- Link rahasia per penghuni
alter table public.occupants add column if not exists portal_token text unique;

-- Asal pembayaran: dicatat pengelola atau dikirim penghuni lewat portal
alter table public.payments add column if not exists source text not null default 'pengelola'
  check (source in ('pengelola','penghuni'));

-- Foto bukti transfer (disimpan terkompresi)
create table if not exists public.payment_proofs (
  payment_id uuid primary key references public.payments(id) on delete cascade,
  kos_id uuid not null references public.kos(id) on delete cascade,
  image text not null,
  created_at timestamptz not null default now()
);
alter table public.payment_proofs enable row level security;
create policy payment_proofs_select on public.payment_proofs for select using (public.is_member(kos_id));
grant select on public.payment_proofs to authenticated;

-- Batas tanya asisten per penghuni per hari
create table if not exists public.portal_ai_usage (
  occupant_id uuid not null references public.occupants(id) on delete cascade,
  day date not null,
  count int not null default 0,
  primary key (occupant_id, day)
);
alter table public.portal_ai_usage enable row level security;

-- ---------- Pengelola: buat / ganti link portal ----------
create or replace function public.portal_link(p_occupant uuid, p_reset boolean default false)
returns text language plpgsql security definer set search_path = public as $$
declare o record; v_token text;
begin
  select * into o from occupants where id = p_occupant for update;
  if o.id is null or not is_member(o.kos_id) then raise exception 'Penghuni tidak ditemukan'; end if;
  if o.portal_token is not null and not p_reset then return o.portal_token; end if;
  v_token := encode(gen_random_bytes(18), 'hex');
  update occupants set portal_token = v_token where id = p_occupant;
  return v_token;
end $$;

-- ---------- Penghuni: data portal (hanya milik penghuni pemegang link) ----------
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
                              'payment_info', k.payment_info, 'house_rules', k.house_rules),
    'occupant', jsonb_build_object('name', o.name),
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

-- ---------- Penghuni: kirim konfirmasi pembayaran + bukti ----------
create or replace function public.portal_submit_payment(p_token text, p_invoice uuid, p_amount numeric, p_paid_at date,
  p_method text, p_note text, p_proof text)
returns uuid language plpgsql security definer set search_path = public as $$
declare o record; s record; v_id uuid;
begin
  select * into o from occupants where portal_token = p_token and length(p_token) >= 20;
  if o.id is null then raise exception 'Link tidak valid'; end if;
  if kos_plan(o.kos_id) <> 'pro' then raise exception 'Portal tidak aktif'; end if;
  select * into s from invoice_summary where id = p_invoice;
  if s.id is null or s.occupant_id <> o.id or s.status = 'batal' then raise exception 'Tagihan tidak ditemukan'; end if;
  if not (p_amount > 0) then raise exception 'Isi jumlah yang dibayar'; end if;
  if p_amount > s.outstanding + 1 then raise exception 'Jumlah melebihi sisa tagihan'; end if;
  if p_method not in ('transfer','ewallet','tunai','lainnya') then raise exception 'Metode tidak dikenal'; end if;
  if p_paid_at > (now() at time zone 'Asia/Jakarta')::date then raise exception 'Tanggal bayar tidak boleh di masa depan'; end if;
  if (select count(*) from payments p join invoices i on i.id = p.invoice_id
      where i.occupant_id = o.id and p.status = 'menunggu') >= 5 then
    raise exception 'Masih ada beberapa konfirmasi yang menunggu diperiksa pengelola.'; end if;
  if p_proof is not null and length(p_proof) > 1500000 then raise exception 'Foto bukti terlalu besar'; end if;
  insert into payments(kos_id, invoice_id, amount, paid_at, method, notes, status, source)
  values (o.kos_id, p_invoice, p_amount, p_paid_at, p_method, nullif(trim(p_note), ''), 'menunggu', 'penghuni')
  returning id into v_id;
  if p_proof is not null and length(p_proof) > 0 then
    insert into payment_proofs(payment_id, kos_id, image) values (v_id, o.kos_id, p_proof);
  end if;
  return v_id;
end $$;

-- ---------- Asisten: batas pertanyaan harian (kembalikan sisa kuota, -1 jika habis/tidak valid) ----------
create or replace function public.portal_ai_tick(p_token text, p_limit int default 30)
returns int language plpgsql security definer set search_path = public as $$
declare o record; v_day date := (now() at time zone 'Asia/Jakarta')::date; v_count int;
begin
  select * into o from occupants where portal_token = p_token and length(p_token) >= 20;
  if o.id is null or kos_plan(o.kos_id) <> 'pro' then return -1; end if;
  insert into portal_ai_usage(occupant_id, day, count) values (o.id, v_day, 1)
  on conflict (occupant_id, day) do update set count = portal_ai_usage.count + 1
  returning count into v_count;
  if v_count > p_limit then return -1; end if;
  return p_limit - v_count;
end $$;

grant execute on function public.portal_get(text), public.portal_submit_payment(text, uuid, numeric, date, text, text, text),
  public.portal_ai_tick(text, int) to anon, authenticated;
grant execute on function public.portal_link(uuid, boolean) to authenticated;
