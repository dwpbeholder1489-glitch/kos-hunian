-- PRASARA Management Center bagian 2: tiket bantuan, pengumuman (banner + email), template balasan yang bisa diedit.

-- ---------- Izin peran (ditambah tiket, pengumuman, template) ----------
create or replace function public.role_perms(p_role text)
returns text[] language sql immutable as $$
  select case p_role
    when 'super_admin' then array['dashboard.view','finance.view','customers.view','customers.note','customers.message','customers.override',
                                  'payments.view','payments.verify','audit.view','staff.manage','system.view',
                                  'tickets.view','tickets.reply','announce.manage','templates.manage']
    when 'support'     then array['customers.view','customers.note','customers.message','payments.view','tickets.view','tickets.reply']
    when 'operations'  then array['dashboard.view','customers.view','customers.note','customers.message','tickets.view','tickets.reply','announce.manage','templates.manage']
    when 'finance'     then array['dashboard.view','finance.view','payments.view','payments.verify','customers.view']
    when 'developer'   then array['system.view','audit.view','tickets.view']
    else array[]::text[] end;
$$;

-- ---------- Tiket bantuan ----------
create table if not exists public.support_tickets (
  id uuid primary key default gen_random_uuid(),
  kos_id uuid not null references public.kos(id) on delete cascade,
  user_id uuid default auth.uid(),
  number text not null unique,
  category text not null check (category in ('login','data','langganan','fitur','bug','bantuan')),
  subject text not null check (length(trim(subject)) between 3 and 120),
  status text not null default 'open' check (status in ('open','in_progress','waiting','resolved','closed')),
  priority text not null default 'normal' check (priority in ('low','normal','high','urgent')),
  assigned_to text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  first_response_at timestamptz,
  resolved_at timestamptz
);
create index if not exists support_tickets_status on public.support_tickets(status, updated_at desc);
create index if not exists support_tickets_kos on public.support_tickets(kos_id, created_at desc);

create table if not exists public.ticket_messages (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references public.support_tickets(id) on delete cascade,
  author_kind text not null check (author_kind in ('customer','staff','note')),
  author_email text,
  body text not null check (length(trim(body)) between 1 and 4000),
  created_at timestamptz not null default now()
);
create index if not exists ticket_messages_ticket on public.ticket_messages(ticket_id, created_at);
alter table public.support_tickets enable row level security;
alter table public.ticket_messages enable row level security;   -- akses hanya lewat fungsi

create or replace function public.ticket_create(p_kos uuid, p_category text, p_subject text, p_body text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_no text; v_seq int; v_day date := (now() at time zone 'Asia/Jakarta')::date;
begin
  if not is_member(p_kos) then raise exception 'Tidak punya akses ke bisnis ini'; end if;
  if coalesce(length(trim(p_body)), 0) < 5 then raise exception 'Ceritakan masalahnya (minimal 5 huruf)'; end if;
  if (select count(*) from support_tickets where user_id = auth.uid() and created_at > now() - interval '1 hour') >= 5 then raise exception 'Terlalu banyak tiket dalam 1 jam. Coba lagi nanti.'; end if;
  perform pg_advisory_xact_lock(hashtext('ticket'));
  select count(*) + 1 into v_seq from support_tickets where (created_at at time zone 'Asia/Jakarta')::date = v_day;
  v_no := 'TK-' || to_char(v_day, 'YYMMDD') || '-' || lpad(v_seq::text, 3, '0');
  insert into support_tickets(kos_id, number, category, subject, priority) values (p_kos, v_no, p_category, trim(p_subject),
    case when p_category in ('login','bug') then 'high' else 'normal' end) returning id into v_id;
  insert into ticket_messages(ticket_id, author_kind, author_email, body) values (v_id, 'customer', actor_email(), trim(p_body));
  return jsonb_build_object('id', v_id, 'number', v_no);
end $$;

create or replace function public.ticket_reply(p_ticket uuid, p_body text)
returns void language plpgsql security definer set search_path = public as $$
declare t support_tickets;
begin
  select * into t from support_tickets where id = p_ticket;
  if t.id is null or not is_member(t.kos_id) then raise exception 'Tiket tidak ditemukan'; end if;
  if t.status = 'closed' then raise exception 'Tiket sudah ditutup. Buat tiket baru bila masih ada masalah.'; end if;
  if coalesce(trim(p_body), '') = '' then raise exception 'Pesan kosong'; end if;
  insert into ticket_messages(ticket_id, author_kind, author_email, body) values (t.id, 'customer', actor_email(), trim(p_body));
  update support_tickets set status = case when status in ('waiting','resolved') then 'open' else status end, updated_at = now() where id = t.id;
end $$;

-- Tiket milik bisnis ini (tanpa catatan internal staf)
create or replace function public.my_tickets(p_kos uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if not is_member(p_kos) then raise exception 'Tidak punya akses ke bisnis ini'; end if;
  return (select coalesce(jsonb_agg(row_to_json(x) order by x.updated_at desc), '[]'::jsonb) from (
    select t.id, t.number, t.category, t.subject, t.status, t.created_at, t.updated_at,
      (select coalesce(jsonb_agg(jsonb_build_object('kind', m.author_kind, 'body', m.body, 'at', m.created_at) order by m.created_at), '[]')
         from ticket_messages m where m.ticket_id = t.id and m.author_kind <> 'note') as messages
    from support_tickets t where t.kos_id = p_kos limit 50) x);
end $$;

create or replace function public.admin_tickets()
returns jsonb language plpgsql stable security definer set search_path = public, auth as $$
begin
  if not admin_can('tickets.view') then raise exception 'Tidak punya izin melihat tiket'; end if;
  return (select coalesce(jsonb_agg(row_to_json(x) order by x.updated_at desc), '[]'::jsonb) from (
    select t.*, k.name as kos_name, k.business_type, u.email::text as owner_email,
      (select m.author_kind from ticket_messages m where m.ticket_id = t.id and m.author_kind <> 'note' order by m.created_at desc limit 1) as last_from,
      (select left(m.body, 140) from ticket_messages m where m.ticket_id = t.id and m.author_kind <> 'note' order by m.created_at desc limit 1) as last_body
    from support_tickets t join kos k on k.id = t.kos_id join auth.users u on u.id = k.owner_id
    order by t.updated_at desc limit 300) x);
end $$;

create or replace function public.admin_ticket(p_ticket uuid)
returns jsonb language plpgsql stable security definer set search_path = public, auth as $$
begin
  if not admin_can('tickets.view') then raise exception 'Tidak punya izin melihat tiket'; end if;
  return (select jsonb_build_object('ticket', row_to_json(t)::jsonb || jsonb_build_object('kos_name', k.name, 'business_type', k.business_type, 'owner_email', u.email, 'contact_phone', k.contact_phone),
      'messages', (select coalesce(jsonb_agg(jsonb_build_object('kind', m.author_kind, 'author', m.author_email, 'body', m.body, 'at', m.created_at) order by m.created_at), '[]') from ticket_messages m where m.ticket_id = t.id))
    from support_tickets t join kos k on k.id = t.kos_id join auth.users u on u.id = k.owner_id where t.id = p_ticket);
end $$;

create or replace function public.admin_ticket_reply(p_ticket uuid, p_body text, p_internal boolean)
returns void language plpgsql security definer set search_path = public as $$
declare t support_tickets;
begin
  if not admin_can('tickets.reply') then raise exception 'Tidak punya izin membalas tiket'; end if;
  select * into t from support_tickets where id = p_ticket for update;
  if t.id is null then raise exception 'Tiket tidak ditemukan'; end if;
  if coalesce(trim(p_body), '') = '' then raise exception 'Pesan kosong'; end if;
  insert into ticket_messages(ticket_id, author_kind, author_email, body) values (t.id, case when p_internal then 'note' else 'staff' end, actor_email(), trim(p_body));
  if not p_internal then
    update support_tickets set first_response_at = coalesce(first_response_at, now()), updated_at = now(),
      status = case when status in ('open','in_progress') then 'waiting' else status end,
      assigned_to = coalesce(assigned_to, actor_email()) where id = t.id;
    insert into admin_log(actor_email, action, kos_id, kos_name, detail) select actor_email(), 'balas_tiket', t.kos_id, name, jsonb_build_object('tiket', t.number) from kos where id = t.kos_id;
  end if;
end $$;

create or replace function public.admin_ticket_update(p_ticket uuid, p_status text, p_priority text, p_assign text)
returns void language plpgsql security definer set search_path = public as $$
declare t support_tickets;
begin
  if not admin_can('tickets.reply') then raise exception 'Tidak punya izin mengubah tiket'; end if;
  select * into t from support_tickets where id = p_ticket for update;
  if t.id is null then raise exception 'Tiket tidak ditemukan'; end if;
  update support_tickets set status = coalesce(p_status, status), priority = coalesce(p_priority, priority),
    assigned_to = case when p_assign = '' then null else coalesce(p_assign, assigned_to) end,
    resolved_at = case when coalesce(p_status, status) in ('resolved','closed') then coalesce(resolved_at, now()) else null end,
    updated_at = now() where id = t.id;
  insert into admin_log(actor_email, action, kos_id, kos_name, detail) select actor_email(), 'ubah_tiket', t.kos_id, name,
    jsonb_build_object('tiket', t.number, 'status', p_status, 'prioritas', p_priority) from kos where id = t.kos_id;
end $$;

-- ---------- Pengumuman ----------
create table if not exists public.announcements (
  id uuid primary key default gen_random_uuid(),
  title text not null check (length(trim(title)) between 3 and 120),
  body text not null check (length(trim(body)) between 3 and 2000),
  kind text not null default 'info' check (kind in ('layanan','info')),   -- layanan = penting (pemeliharaan, perubahan layanan); info = fitur/tips
  plans text[] not null default '{}',     -- kosong = semua paket (gratis, coba, standar, pro)
  types text[] not null default '{}',     -- kosong = semua jenis bisnis
  banner boolean not null default true,
  email boolean not null default false,
  ends_at date,
  created_by text,
  created_at timestamptz not null default now(),
  email_sent_at timestamptz,
  email_count int not null default 0,
  status text not null default 'aktif' check (status in ('aktif','berakhir'))
);
create table if not exists public.announcement_sends (
  announcement_id uuid not null references public.announcements(id) on delete cascade,
  kos_id uuid not null references public.kos(id) on delete cascade,
  sent_at timestamptz not null default now(),
  primary key (announcement_id, kos_id)
);
alter table public.announcements enable row level security;
alter table public.announcement_sends enable row level security;

create or replace function public.plan_bucket(p_kos uuid)
returns text language sql stable security definer set search_path = public as $$
  select case when k.paid_until is not null and k.paid_until >= (now() at time zone 'Asia/Jakarta')::date and k.plan in ('standar','pro') then k.plan
              when k.trial_until is not null and k.trial_until >= (now() at time zone 'Asia/Jakarta')::date then 'coba'
              else 'gratis' end from kos k where k.id = p_kos;
$$;

-- Bisnis yang menjadi sasaran pengumuman (bisnis admin tidak termasuk)
create or replace function public.announcement_targets(p_plans text[], p_types text[])
returns setof uuid language sql stable security definer set search_path = public as $$
  select k.id from kos k
  where not is_admin_owner(k.id)
    and (coalesce(array_length(p_types, 1), 0) = 0 or k.business_type = any(p_types))
    and (coalesce(array_length(p_plans, 1), 0) = 0 or plan_bucket(k.id) = any(p_plans));
$$;
revoke execute on function public.announcement_targets(text[], text[]), public.plan_bucket(uuid) from public, anon, authenticated;

create or replace function public.admin_announce_count(p_plans text[], p_types text[])
returns int language plpgsql stable security definer set search_path = public as $$
begin
  if not admin_can('announce.manage') then raise exception 'Tidak punya izin membuat pengumuman'; end if;
  return (select count(*) from announcement_targets(p_plans, p_types));
end $$;

create or replace function public.admin_announcement_save(p_title text, p_body text, p_kind text, p_plans text[], p_types text[], p_banner boolean, p_email boolean, p_ends date)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if not admin_can('announce.manage') then raise exception 'Tidak punya izin membuat pengumuman'; end if;
  if not coalesce(p_banner, false) and not coalesce(p_email, false) then raise exception 'Pilih minimal satu saluran: banner atau email'; end if;
  insert into announcements(title, body, kind, plans, types, banner, email, ends_at, created_by)
  values (trim(p_title), trim(p_body), p_kind, coalesce(p_plans, '{}'), coalesce(p_types, '{}'), coalesce(p_banner, false), coalesce(p_email, false), p_ends, actor_email())
  returning id into v_id;
  insert into admin_log(actor_email, action, detail) values (actor_email(), 'buat_pengumuman', jsonb_build_object('judul', trim(p_title), 'jenis', p_kind, 'email', p_email,
    'sasaran', (select count(*) from announcement_targets(p_plans, p_types))));
  return v_id;
end $$;

create or replace function public.admin_announcement_end(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not admin_can('announce.manage') then raise exception 'Tidak punya izin'; end if;
  update announcements set status = 'berakhir' where id = p_id;
  insert into admin_log(actor_email, action, detail) select actor_email(), 'akhiri_pengumuman', jsonb_build_object('judul', title) from announcements where id = p_id;
end $$;

create or replace function public.admin_announcements()
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if not admin_can('announce.manage') then raise exception 'Tidak punya izin'; end if;
  return (select coalesce(jsonb_agg(row_to_json(a) order by a.created_at desc), '[]'::jsonb) from (select *, (select count(*) from announcement_targets(plans, types)) as targets from announcements limit 100) a);
end $$;

-- Pengumuman aktif untuk bisnis ini (banner di aplikasi)
create or replace function public.my_announcements(p_kos uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if not is_member(p_kos) then return '[]'::jsonb; end if;
  return (select coalesce(jsonb_agg(jsonb_build_object('id', a.id, 'title', a.title, 'body', a.body, 'kind', a.kind) order by a.created_at desc), '[]'::jsonb)
    from announcements a
    where a.banner and a.status = 'aktif' and (a.ends_at is null or a.ends_at >= (now() at time zone 'Asia/Jakarta')::date)
      and p_kos in (select announcement_targets(a.plans, a.types)));
end $$;

-- Untuk server pengirim email (kunci server). Pengumuman info hanya ke yang tidak mematikan email dari PRASARA,
-- dan paling banyak 1 email pengumuman info per bisnis per 7 hari. Pengumuman layanan (penting) tetap terkirim.
create or replace function public.announcement_email_batch(p_id uuid)
returns jsonb language sql stable security definer set search_path = public, auth as $$
  select coalesce(jsonb_agg(jsonb_build_object('kos_id', k.id, 'kos_name', k.name, 'email', u.email, 'token', k.email_token)), '[]'::jsonb)
  from announcements a
  join kos k on k.id in (select announcement_targets(a.plans, a.types))
  join auth.users u on u.id = k.owner_id
  where a.id = p_id and a.email
    and not exists (select 1 from announcement_sends s where s.announcement_id = a.id and s.kos_id = k.id)
    and (a.kind = 'layanan' or (k.onboarding_emails and not exists (
         select 1 from announcement_sends s2 join announcements a2 on a2.id = s2.announcement_id
         where s2.kos_id = k.id and a2.kind = 'info' and s2.sent_at > now() - interval '7 days')));
$$;
revoke execute on function public.announcement_email_batch(uuid) from public, anon, authenticated;
grant execute on function public.announcement_email_batch(uuid) to service_role;

-- ---------- Template balasan cepat (bisa diedit admin) ----------
create table if not exists public.admin_templates (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) between 2 and 60),
  category text not null default 'umum',
  body text not null check (length(trim(body)) between 2 and 2000),
  sort int not null default 0,
  updated_by text,
  updated_at timestamptz not null default now()
);
alter table public.admin_templates enable row level security;

create or replace function public.admin_template_list()
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if not (admin_can('customers.message') or admin_can('tickets.reply') or admin_can('templates.manage')) then raise exception 'Tidak punya izin'; end if;
  return (select coalesce(jsonb_agg(row_to_json(t) order by t.category, t.sort, t.name), '[]'::jsonb) from admin_templates t);
end $$;

create or replace function public.admin_template_save(p_id uuid, p_name text, p_category text, p_body text, p_delete boolean default false)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if not admin_can('templates.manage') then raise exception 'Tidak punya izin mengubah template'; end if;
  if p_delete then delete from admin_templates where id = p_id; return p_id; end if;
  if p_id is null then
    insert into admin_templates(name, category, body, sort, updated_by) values (trim(p_name), coalesce(nullif(trim(p_category), ''), 'umum'), trim(p_body),
      (select coalesce(max(sort), 0) + 1 from admin_templates), actor_email()) returning id into v_id;
  else
    update admin_templates set name = trim(p_name), category = coalesce(nullif(trim(p_category), ''), 'umum'), body = trim(p_body), updated_by = actor_email(), updated_at = now()
    where id = p_id returning id into v_id;
  end if;
  return v_id;
end $$;

insert into public.admin_templates(name, category, body, sort)
select * from (values
  ('Sambutan pelanggan baru', 'Pendampingan', 'Halo, saya Dewo dari PRASARA. Terima kasih sudah mendaftar untuk {nama_kos}. Kalau ada yang membingungkan saat mulai, balas saja pesan ini, saya bantu. Panduan bergambar: {situs}/panduan', 1),
  ('Bantuan isi kamar', 'Properti', 'Halo, untuk {nama_kos}: buka menu Kamar, ketuk kamarnya, lalu Ubah data kamar. Isi harga sewa (boleh ditulis 750rb), lalu Simpan.', 2),
  ('Bantuan masukkan penghuni', 'Properti', 'Halo, untuk memasukkan penghuni di {nama_kos}: menu Kamar → ketuk kamar Tersedia → Isi kamar ini. Untuk penghuni lama, isi "Tagihan pertama jatuh tempo" dengan jatuh tempo berikutnya yang belum dibayar.', 3),
  ('Bantuan catat pembayaran', 'Properti', 'Halo, saat penghuni membayar: menu Tagihan → ketuk tagihannya → Catat pembayaran. Boleh dicatat sebagian.', 4),
  ('Bantuan barang & kasir', 'Retail', 'Halo, untuk {nama_kos}: masukkan barang di menu Barang & stok (satuan pcs/dus dan harganya), catat uang awal laci di Kas & kasbon › Setor modal, lalu mulai jualan di Kasir.', 5),
  ('Bantuan melihat laporan', 'Umum', 'Halo, laba dan pengeluaran {nama_kos} bisa dilihat di menu Laporan, pilih bulannya dengan tombol ‹ ›.', 6),
  ('Sapa pelanggan tidak aktif', 'Pendampingan', 'Halo, saya Dewo dari PRASARA. Data {nama_kos} tetap tersimpan aman. Kalau ada kendala atau ada yang kurang cocok, saya ingin dengar supaya bisa diperbaiki.', 7),
  ('Info masa coba', 'Langganan', 'Halo, masa coba {nama_kos} di PRASARA akan berakhir. Setelahnya akun otomatis menjadi paket Gratis dan semua data tetap tersimpan. Pilihan paket ada di menu Langganan. Ada yang ingin ditanyakan dulu?', 8),
  ('Tindak lanjut keluhan', 'Dukungan', 'Halo, terima kasih sudah memberi tahu masalahnya. Sudah kami cek dan perbaiki. Boleh dicoba lagi? Kalau masih ada kendala, balas pesan ini.', 9),
  ('Terima kasih berlangganan', 'Langganan', 'Halo, terima kasih sudah berlangganan PRASARA untuk {nama_kos}. Paket sudah aktif. Kalau butuh bantuan apa pun, hubungi kami di nomor ini.', 10)
) v(name, category, body, sort)
where not exists (select 1 from public.admin_templates);

revoke execute on function public.ticket_create(uuid, text, text, text), public.ticket_reply(uuid, text), public.my_tickets(uuid), public.admin_tickets(), public.admin_ticket(uuid),
  public.admin_ticket_reply(uuid, text, boolean), public.admin_ticket_update(uuid, text, text, text), public.admin_announce_count(text[], text[]),
  public.admin_announcement_save(text, text, text, text[], text[], boolean, boolean, date), public.admin_announcement_end(uuid), public.admin_announcements(),
  public.my_announcements(uuid), public.admin_template_list(), public.admin_template_save(uuid, text, text, text, boolean) from public, anon;
grant execute on function public.ticket_create(uuid, text, text, text), public.ticket_reply(uuid, text), public.my_tickets(uuid), public.admin_tickets(), public.admin_ticket(uuid),
  public.admin_ticket_reply(uuid, text, boolean), public.admin_ticket_update(uuid, text, text, text), public.admin_announce_count(text[], text[]),
  public.admin_announcement_save(text, text, text, text[], text[], boolean, boolean, date), public.admin_announcement_end(uuid), public.admin_announcements(),
  public.my_announcements(uuid), public.admin_template_list(), public.admin_template_save(uuid, text, text, text, boolean) to authenticated;
