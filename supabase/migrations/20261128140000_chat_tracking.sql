-- Chat & Tracking Pelanggan (Customer Experience V3 tahap 2; gambar acuan pemilik 28 Nov 2026).
-- Di atas customer_messages (migrasi 20261128130000), tidak menggantinya:
--   • customer_conversations = satu percakapan per transaksi (so_order toko/grosir, svc_order jasa/laundry/kuliner)
--     ATAU chat umum per pelanggan (kontak portal grosir / sesi tamu toko). Status, prioritas, penugasan staf.
--   • customer_messages + jenis pesan: teks, gambar, dokumen (bucket privat customer-chat lewat server), kartu produk,
--     kartu penawaran, kartu cara bayar, catatan internal (tidak pernah terlihat pelanggan).
--   • Status online & waktu respons DIHITUNG dari data nyata (cx_presence + riwayat balasan), tidak pernah diisi tangan.
--   • Tracking toko: so_orders.prepared_at ("Disiapkan") + kurir/resi/estimasi tiba per surat jalan (diisi penjual;
--     kosong = "belum ditentukan", tidak ditebak). Tracking jasa tetap dari svc_orders/svc_stages (public_order_status).
--   • Pelanggan HANYA lewat server (service_role) dengan kredensial portal yang sudah ada: cookie tamu (toko), token
--     pribadi /c (grosir), nomor pesanan + No. HP (jasa). Tabel tanpa policy + revoke.
-- Fungsi lama cx_exchange/cx_owner_exchange/cx_owner_inbox/cx_guest_unread DIGANTI (frontend ikut diganti di commit yang sama).

-- ============================ 1. Percakapan ============================
create table public.customer_conversations (
  id uuid primary key default gen_random_uuid(),
  kos_id uuid not null references public.kos(id) on delete cascade,
  kind text not null check (kind in ('transaksi', 'umum')),
  channel text not null check (channel in ('toko', 'grosir', 'jasa')),
  reference_type text check (reference_type in ('so_order', 'svc_order')),
  reference_id uuid,
  contact_id uuid references public.contacts(id) on delete set null,
  guest_hash text check (guest_hash is null or guest_hash ~ '^[a-f0-9]{64}$'),
  customer_name text check (customer_name is null or length(customer_name) <= 80),
  customer_phone text check (customer_phone is null or length(customer_phone) <= 20),
  status text not null default 'baru' check (status in ('baru', 'ditangani', 'menunggu_pelanggan', 'selesai')),
  priority text not null default 'normal' check (priority in ('normal', 'tinggi')),
  assigned_to uuid references auth.users(id) on delete set null,
  last_at timestamptz,
  last_sender text check (last_sender in ('customer', 'business')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((kind = 'transaksi') = (reference_id is not null and reference_type is not null)),
  check (kind = 'transaksi' or contact_id is not null or guest_hash is not null)
);
create unique index customer_conversations_ref on public.customer_conversations(kos_id, reference_type, reference_id) where kind = 'transaksi';
create unique index customer_conversations_contact on public.customer_conversations(kos_id, contact_id) where kind = 'umum' and guest_hash is null;
create unique index customer_conversations_guest on public.customer_conversations(kos_id, guest_hash) where kind = 'umum' and guest_hash is not null;
create index customer_conversations_inbox on public.customer_conversations(kos_id, last_at desc nulls last);
alter table public.customer_conversations enable row level security;
revoke all on public.customer_conversations from public, anon, authenticated;
create trigger zz_kos_open_guard before insert or update or delete on public.customer_conversations
for each row execute function public.kos_open_guard();

-- ============================ 2. Pesan: jenis, lampiran, catatan internal ============================
alter table public.customer_messages drop constraint customer_messages_reference_type_check;
alter table public.customer_messages drop constraint customer_messages_reference_id_fkey;
alter table public.customer_messages drop constraint customer_messages_body_check;
alter table public.customer_messages alter column reference_type drop not null, alter column reference_id drop not null;
alter table public.customer_messages
  add column conversation_id uuid references public.customer_conversations(id) on delete cascade,
  add column kind text not null default 'teks' check (kind in ('teks', 'gambar', 'dokumen', 'produk', 'penawaran', 'pembayaran', 'catatan')),
  add column payload jsonb,
  add column file_path text check (file_path is null or file_path ~ '^(pelanggan|[a-f0-9-]{36})/[a-f0-9]{64}$'),
  add column file_name text check (file_name is null or length(file_name) <= 160),
  add column file_mime text check (file_mime is null or file_mime in ('image/jpeg', 'image/png', 'image/webp', 'application/pdf')),
  add column file_size int check (file_size is null or file_size between 1 and 3000000);
alter table public.customer_messages
  add constraint customer_messages_reference_check check (reference_type is null or reference_type in ('so_order', 'svc_order')),
  add constraint customer_messages_body_len check (length(body) <= 2000),
  add constraint customer_messages_text_body check (kind not in ('teks', 'catatan') or length(trim(body)) >= 1),
  add constraint customer_messages_file_kind check ((kind in ('gambar', 'dokumen')) = (file_path is not null)),
  add constraint customer_messages_card check ((kind in ('produk', 'penawaran', 'pembayaran')) = (payload is not null)),
  add constraint customer_messages_note_side check (kind <> 'catatan' or sender = 'business'),
  add constraint customer_messages_card_side check (kind not in ('produk', 'penawaran', 'pembayaran') or sender = 'business');
alter table public.customer_messages alter column body set default '';

-- Riwayat tahap 1 (chat teks per pesanan toko) → percakapan transaksi
insert into public.customer_conversations(kos_id, kind, channel, reference_type, reference_id, contact_id, guest_hash,
  customer_name, customer_phone, status, last_at, last_sender, created_at)
select o.kos_id, 'transaksi', case when o.portal_guest_hash is not null then 'toko' else 'grosir' end, 'so_order', o.id,
  o.contact_id, o.portal_guest_hash, left(c.name, 80), left(c.phone, 20),
  case when l.sender = 'business' then 'menunggu_pelanggan' else 'baru' end, l.created_at, l.sender, f.first_at
from public.so_orders o
join lateral (select min(m.created_at) first_at from public.customer_messages m where m.reference_id = o.id and m.kos_id = o.kos_id) f on true
join lateral (select m.sender, m.created_at from public.customer_messages m where m.reference_id = o.id and m.kos_id = o.kos_id
  order by m.created_at desc, m.id desc limit 1) l on true
left join public.contacts c on c.id = o.contact_id
where f.first_at is not null;
update public.customer_messages m set conversation_id = v.id
from public.customer_conversations v
where v.kind = 'transaksi' and v.reference_type = 'so_order' and v.reference_id = m.reference_id and v.kos_id = m.kos_id;
alter table public.customer_messages alter column conversation_id set not null;
create index customer_messages_conv on public.customer_messages(conversation_id, created_at desc, id desc);

-- Transaksi dihapus (jarang; biasanya dibatalkan) → percakapannya ikut terhapus
create function public.cx_ref_deleted() returns trigger language plpgsql security definer set search_path = public as $$
begin
  delete from customer_conversations where kind = 'transaksi' and reference_id = old.id and reference_type = tg_argv[0];
  return null;
end $$;
create trigger cx_ref_deleted after delete on public.so_orders for each row execute function public.cx_ref_deleted('so_order');
create trigger cx_ref_deleted after delete on public.svc_orders for each row execute function public.cx_ref_deleted('svc_order');

-- Bucket privat lampiran chat (file hanya dibuka lewat URL bertanda tangan 2 menit dari server)
insert into storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
values ('customer-chat', 'customer-chat', false, 3000000, array['image/jpeg', 'image/png', 'image/webp', 'application/pdf'])
on conflict (id) do nothing;

-- ============================ 3. Tracking toko ============================
alter table public.so_orders add column prepared_at timestamptz;
alter table public.so_deliveries
  add column courier text check (courier is null or length(courier) <= 60),
  add column tracking_no text check (tracking_no is null or length(tracking_no) <= 60),
  add column eta_from timestamptz,
  add column eta_to timestamptz,
  add constraint so_deliveries_eta check (eta_to is null or eta_from is null or eta_to >= eta_from);

-- ============================ 4. Kehadiran staf (status online nyata) ============================
create table public.cx_presence (
  kos_id uuid not null references public.kos(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  seen_at timestamptz not null default now(),
  primary key (kos_id, user_id)
);
alter table public.cx_presence enable row level security;
revoke all on public.cx_presence from public, anon, authenticated;
create trigger zz_kos_open_guard before insert or update or delete on public.cx_presence
for each row execute function public.kos_open_guard();

-- Aplikasi terbuka & terlihat (setiap ±60 dtk). Galat ditelan: kehadiran tidak boleh mengganggu kerja.
create function public.cx_ping(p_kos uuid) returns boolean language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or not member_in('sell,ops', p_kos) then return false; end if;
  insert into cx_presence(kos_id, user_id, seen_at) values (p_kos, auth.uid(), now())
  on conflict (kos_id, user_id) do update set seen_at = now() where cx_presence.seen_at < now() - interval '30 seconds';
  return true;
exception when others then return false;
end $$;
revoke execute on function public.cx_ping(uuid) from public, anon;
grant execute on function public.cx_ping(uuid) to authenticated;

-- Info bisnis untuk pelanggan: online = ada anggota aktif (kasir/operasional) yang membuka aplikasi ≤ 3 menit terakhir;
-- waktu respons = median selisih pesan pelanggan pertama (setelah giliran bisnis) → balasan bisnis berikutnya, 30 hari,
-- hanya bila ≥ 3 contoh (kurang dari itu = tidak ditampilkan).
create function public.cx_business_info(p_kos uuid) returns jsonb language sql stable security definer set search_path = public as $$
  with turns as (
    select m.conversation_id, m.sender, m.created_at,
      lag(m.sender) over (partition by m.conversation_id order by m.created_at, m.id) prev
    from customer_messages m
    where m.kos_id = p_kos and m.kind <> 'catatan' and m.created_at > now() - interval '30 days'
  ), waits as (
    select extract(epoch from (
      select min(r.created_at) from customer_messages r where r.conversation_id = t.conversation_id
        and r.sender = 'business' and r.kind <> 'catatan' and r.created_at > t.created_at) - t.created_at) / 60.0 minutes
    from turns t where t.sender = 'customer' and t.prev is distinct from 'customer'
  ), ok as (select minutes from waits where minutes is not null)
  select jsonb_build_object(
    'online', exists (select 1 from cx_presence p join kos_members km on km.kos_id = p.kos_id and km.user_id = p.user_id and km.active
      where p.kos_id = p_kos and p.seen_at > now() - interval '3 minutes'),
    'last_seen', (select max(p.seen_at) from cx_presence p join kos_members km on km.kos_id = p.kos_id and km.user_id = p.user_id and km.active
      where p.kos_id = p_kos),
    'samples', (select count(*) from ok),
    'response_minutes', case when (select count(*) from ok) >= 3
      then round((select percentile_cont(0.5) within group (order by minutes) from ok)::numeric, 1) end);
$$;
revoke execute on function public.cx_business_info(uuid) from public, anon, authenticated;

-- ============================ 5. Setelan chat (pemilik) ============================
-- kos.profile.chat = {aktif: bool (bawaan true), balasan: [teks balasan cepat, maks 10 × 300 huruf]}
create function public.cx_chat_on(p_kos uuid) returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((profile #>> '{chat,aktif}')::boolean, true) from kos where id = p_kos;
$$;
revoke execute on function public.cx_chat_on(uuid) from public, anon, authenticated;

create function public.cx_settings_set(p_kos uuid, p_active boolean, p_replies jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_before jsonb; v_after jsonb; v_replies jsonb;
begin
  if not member_in('settings', p_kos) then raise exception 'Hanya pengelola pengaturan yang dapat mengubah setelan chat'; end if;
  if jsonb_typeof(coalesce(p_replies, '[]')) <> 'array' or jsonb_array_length(coalesce(p_replies, '[]')) > 10 then
    raise exception 'Balasan cepat maksimal 10';
  end if;
  select coalesce(jsonb_agg(left(trim(x), 300)), '[]') into v_replies
  from jsonb_array_elements_text(coalesce(p_replies, '[]')) x where length(trim(x)) > 0;
  select profile -> 'chat' into v_before from kos where id = p_kos;
  v_after := jsonb_build_object('aktif', coalesce(p_active, true), 'balasan', v_replies);
  update kos set profile = jsonb_set(coalesce(profile, '{}'), '{chat}', v_after) where id = p_kos;
  perform config_log(p_kos, 'ubah_setelan_chat', 'chat', v_before, v_after, null, 'rendah', null);
  return v_after;
end $$;
revoke execute on function public.cx_settings_set(uuid, boolean, jsonb) from public, anon;
grant execute on function public.cx_settings_set(uuid, boolean, jsonb) to authenticated;

-- ============================ 6. Inti bersama ============================
create function public.cx_area(c customer_conversations) returns text language sql immutable as $$
  select case when c.channel = 'jasa' then 'sell,ops' else 'sell' end;
$$;

create function public.cx_ref_number(c customer_conversations) returns text language sql stable security definer set search_path = public as $$
  select case c.reference_type
    when 'so_order' then (select number from so_orders where id = c.reference_id)
    when 'svc_order' then (select number from svc_orders where id = c.reference_id) end;
$$;

-- Pesan untuk ditampilkan (pelanggan: tanpa catatan internal)
create function public.cx_messages(p_conv uuid, p_internal boolean, p_before uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare v_at timestamptz;
begin
  if p_before is not null then
    select created_at into v_at from customer_messages where id = p_before and conversation_id = p_conv;
    if not found then return '[]'::jsonb; end if;
  end if;
  return (select coalesce(jsonb_agg(jsonb_build_object('id', m.id, 'sender', m.sender, 'kind', m.kind, 'body', m.body,
      'payload', m.payload, 'file', case when m.file_path is not null then jsonb_build_object('name', m.file_name, 'mime', m.file_mime, 'size', m.file_size) end,
      'created_at', m.created_at, 'read_at', m.read_at,
      'by', case when p_internal and m.sender = 'business' and m.actor_id is not null then prj_user_label(m.actor_id) end)
      order by m.created_at, m.id), '[]')
    from (select * from customer_messages m where m.conversation_id = p_conv and (p_internal or m.kind <> 'catatan')
      and (p_before is null or (m.created_at, m.id) < (v_at, p_before))
      order by m.created_at desc, m.id desc limit 40) m);
end $$;
revoke execute on function public.cx_messages(uuid, boolean, uuid) from public, anon, authenticated;

-- Ringkasan transaksi untuk kartu di atas chat & layar tracking (data nyata; kosong = belum ditentukan)
create function public.cx_track(p_kos uuid, p_type text, p_ref uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare o so_orders; s svc_orders; v_paid numeric;
begin
  if p_type = 'so_order' then
    select * into o from so_orders where id = p_ref and kos_id = p_kos;
    if o.id is null then return null; end if;
    return jsonb_build_object('type', 'so_order', 'id', o.id, 'number', o.number, 'status', o.status,
      'kind', o.portal_kind, 'fulfillment', o.portal_fulfillment, 'payment', o.portal_payment, 'total', o.total,
      'created_at', o.created_at, 'confirmed_at', o.confirmed_at, 'prepared_at', o.prepared_at, 'closed_at', o.closed_at,
      'valid_until', o.valid_until, 'ship_address', o.ship_address, 'quote_ready', o.quote_revision is not null and o.status = 'penawaran',
      'lines', coalesce((select jsonb_agg(jsonb_build_object('product_id', l.product_id, 'name', l.name, 'unit', l.unit, 'qty', l.qty,
        'total', l.line_total) order by l.sort) from so_lines l where l.order_id = o.id and l.kos_id = o.kos_id), '[]'),
      'deliveries', coalesce((select jsonb_agg(jsonb_build_object('id', d.id, 'number', d.number, 'status', d.status,
        'created_at', d.created_at, 'ship_date', d.ship_date, 'received_at', d.received_at, 'recipient', d.recipient,
        'driver', d.driver, 'vehicle', d.vehicle, 'courier', d.courier, 'tracking_no', d.tracking_no,
        'eta_from', d.eta_from, 'eta_to', d.eta_to) order by d.created_at) from so_deliveries d where d.order_id = o.id and d.kos_id = o.kos_id), '[]'));
  elsif p_type = 'svc_order' then
    select * into s from svc_orders where id = p_ref and kos_id = p_kos;
    if s.id is null then return null; end if;
    v_paid := svc_paid(s.id);
    return jsonb_build_object('type', 'svc_order', 'id', s.id, 'number', s.number, 'status', s.status,
      'stage', (select name from svc_stages where id = s.stage_id),
      'kuliner', exists (select 1 from kos k where k.id = s.kos_id and (k.template_code = 'kuliner' or k.category_code = 'kuliner')),
      'dine', s.dine, 'received_at', s.received_at, 'confirmed_at', s.confirmed_at, 'due_at', s.due_at, 'completed_at', s.completed_at,
      'pickup', s.pickup, 'pickup_status', s.pickup_status, 'pickup_date', s.pickup_date, 'pickup_slot', s.pickup_slot,
      'deliver', s.deliver, 'delivery_status', s.delivery_status, 'delivery_date', s.delivery_date, 'delivery_slot', s.delivery_slot,
      'total', s.total, 'paid', v_paid, 'lunas', v_paid >= s.total,
      'lines', coalesce((select jsonb_agg(jsonb_build_object('name', l.name, 'qty', l.qty, 'unit', l.unit, 'total', l.line_total))
        from svc_order_lines l where l.order_id = s.id), '[]'));
  end if;
  return null;
end $$;
revoke execute on function public.cx_track(uuid, text, uuid) from public, anon, authenticated;

-- Simpan pesan + perbarui percakapan + notifikasi (notifikasi tidak boleh menggagalkan pengiriman)
create function public.cx_post(c customer_conversations, p_side text, p_id uuid, p_kind text, p_body text, p_payload jsonb, p_file jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare m customer_messages; v_body text := coalesce(trim(p_body), ''); v_name text; v_ref text;
begin
  if p_id is null then return jsonb_build_object('error', 'Pesan tidak valid.'); end if;
  perform pg_advisory_xact_lock(hashtext('cx:' || c.id::text));
  select * into m from customer_messages where id = p_id;
  if found then  -- kirim ulang (jaringan putus) = idempoten, tidak dobel
    if m.conversation_id <> c.id or m.sender <> p_side or m.kind <> p_kind or m.body <> v_body then
      return jsonb_build_object('error', 'Pesan tidak valid.');
    end if;
    return jsonb_build_object('ok', true, 'id', m.id, 'duplicate', true);
  end if;
  if p_kind in ('teks', 'catatan') and length(v_body) not between 1 and 2000 then return jsonb_build_object('error', 'Tulis pesan (maks. 2.000 huruf).'); end if;
  if length(v_body) > 2000 then return jsonb_build_object('error', 'Keterangan maks. 2.000 huruf.'); end if;
  if (select count(*) from customer_messages x where x.conversation_id = c.id and x.sender = p_side
      and x.created_at > now() - interval '1 minute') >= 15 then
    return jsonb_build_object('error', 'Tunggu sebentar sebelum mengirim pesan lagi.');
  end if;
  if p_file is not null and (select count(*) from customer_messages x where x.conversation_id = c.id and x.sender = p_side
      and x.file_path is not null and x.created_at > now() - interval '1 day') >= 20 then
    return jsonb_build_object('error', 'Batas 20 lampiran per hari untuk percakapan ini tercapai.');
  end if;
  insert into customer_messages(id, kos_id, conversation_id, reference_type, reference_id, sender, actor_id, kind, body, payload,
    file_path, file_name, file_mime, file_size)
  values (p_id, c.kos_id, c.id, c.reference_type, c.reference_id, p_side, auth.uid(), p_kind, v_body, p_payload,
    p_file->>'path', left(p_file->>'name', 160), p_file->>'mime', (p_file->>'size')::int)
  returning * into m;
  if p_kind <> 'catatan' then
    update customer_conversations set last_at = m.created_at, last_sender = p_side, updated_at = now(),
      status = case when p_side = 'business' then 'menunggu_pelanggan'
                    when assigned_to is not null then 'ditangani' else 'baru' end
    where id = c.id;
  end if;
  if p_side = 'customer' then
    v_ref := cx_ref_number(c);
    v_name := coalesce(nullif(c.customer_name, ''), 'Pelanggan');
    -- isi pesan TIDAK ikut ke notifikasi (bisa muncul di layar kunci); hanya nama & nomor transaksi
    perform notif_emit_safe(c.kos_id, case when c.assigned_to is not null then 'CustomerChatAssigned' else 'CustomerChatMessage' end,
      m.id::text, cx_area(c), 'Dari ' || v_name || coalesce(' · ' || v_ref, ' · chat umum'), null,
      case when c.assigned_to is not null then jsonb_build_object('user_id', c.assigned_to) else '{}'::jsonb end,
      null, 'conversation', c.id);
  end if;
  return jsonb_build_object('ok', true, 'id', m.id);
end $$;
revoke execute on function public.cx_post(customer_conversations, text, uuid, text, text, jsonb, jsonb) from public, anon, authenticated;

insert into public.notif_event_types(code, category, priority, audience, area, title, title_many, group_minutes, push_default, link, module) values
  ('CustomerChatMessage',  'pelanggan', 'normal', 'area', null, 'Pesan pelanggan baru', '{n} pesan pelanggan baru', 10, true, '/chat?c={id}', 'Chat pelanggan'),
  ('CustomerChatAssigned', 'pelanggan', 'tinggi', 'self', null, 'Pesan pelanggan untuk Anda', '{n} pesan pelanggan untuk Anda', 10, true, '/chat?c={id}', 'Chat pelanggan')
on conflict (code) do nothing;
update public.notif_event_types set active = false where code = 'CustomerMessageReceived';

-- ============================ 7. Pintu pelanggan (HANYA service_role) ============================
-- p: {access: guest|private|svc, slug, credential, number, phone, ref: uuid|'umum', op: list|send|read|track|file,
--     id, kind (teks|gambar|dokumen), body, before, name, file{path,name,mime,size}}
create function public.cx_customer(p jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_access text := p->>'access'; v_cred text := p->>'credential'; v_slug text := lower(coalesce(p->>'slug', ''));
  v_ref uuid; v_umum boolean := p->>'ref' = 'umum'; v_op text := p->>'op';
  k kos; pg public_pages; ct contacts; o so_orders; s svc_orders; c customer_conversations; v_id uuid; v_before uuid;
  v_name text; v_phone text; v_res jsonb; v_kind text := coalesce(p->>'kind', 'teks'); m customer_messages; v_at timestamptz;
begin
  -- ref: id transaksi | 'umum' (chat umum) | 'nomor' (jasa: dicari dari nomor pesanan + No. HP)
  if not v_umum and not (v_access = 'svc' and p->>'ref' = 'nomor') then
    begin v_ref := (p->>'ref')::uuid; exception when others then return null; end;
    if v_ref is null then return null; end if;
  end if;
  if v_op not in ('list', 'send', 'read', 'track', 'file', 'upload') then return null; end if;
  begin v_id := nullif(p->>'id', '')::uuid; v_before := nullif(p->>'before', '')::uuid; exception when others then return null; end;

  -- 1. Kredensial → bisnis + (transaksi | identitas chat umum)
  if v_access = 'guest' then
    if coalesce(v_cred, '') !~ '^[a-f0-9]{64}$' then return null; end if;
    select pp.* into pg from public_pages pp join kos kk on kk.id = pp.kos_id
    where pp.slug = v_slug and pp.enabled and kk.business_type = 'retail' and module_on(kk.id, 'u_halaman') and module_on(kk.id, 'u_crm');
    if pg.kos_id is null then return null; end if;
    if v_umum then
      select * into c from customer_conversations where kos_id = pg.kos_id and kind = 'umum' and guest_hash = v_cred;
    else
      select * into o from so_orders where id = v_ref and kos_id = pg.kos_id and portal_guest_hash = v_cred;
      if o.id is null then return null; end if;
    end if;
    select * into k from kos where id = pg.kos_id;
  elsif v_access = 'private' then
    ct := cportal_contact(v_cred);
    if ct.id is null or cportal_block(ct.kos_id) is not null then return null; end if;
    if v_umum then
      select * into c from customer_conversations where kos_id = ct.kos_id and kind = 'umum' and contact_id = ct.id and guest_hash is null;
    else
      select * into o from so_orders where id = v_ref and kos_id = ct.kos_id and contact_id = ct.id and portal_guest_hash is null;
      if o.id is null then return null; end if;
    end if;
    select * into k from kos where id = ct.kos_id;
  elsif v_access = 'svc' then
    if v_umum then return null; end if;
    select pp.* into pg from public_pages pp join kos kk on kk.id = pp.kos_id where pp.slug = v_slug and pp.enabled and kk.business_type = 'jasa';
    if pg.kos_id is null or crm_phone(p->>'phone') is null then return null; end if;
    select * into s from svc_orders where (v_ref is null or id = v_ref) and kos_id = pg.kos_id
      and upper(number) = upper(trim(coalesce(p->>'number', ''))) and crm_phone(customer_phone) = crm_phone(p->>'phone');
    if s.id is null then return null; end if;
    select * into k from kos where id = pg.kos_id;
  else
    return null;
  end if;
  if k.id is null or k.closed_at is not null or k.suspended_at is not null or coalesce(k.setup_status, 'active') <> 'active' then return null; end if;

  if c.id is null and not v_umum then
    select * into c from customer_conversations where kos_id = k.id and kind = 'transaksi'
      and reference_type = case when s.id is not null then 'svc_order' else 'so_order' end and reference_id = coalesce(o.id, s.id);
  end if;

  -- 2. Operasi baca
  if v_op = 'upload' then  -- izin unggah SEBELUM file disimpan (akses + batas harian); path final dibuat server
    if not cx_chat_on(k.id) then return jsonb_build_object('error', 'Chat sedang dimatikan oleh bisnis.'); end if;
    if c.id is not null and (select count(*) from customer_messages x where x.conversation_id = c.id and x.sender = 'customer'
        and x.file_path is not null and x.created_at > now() - interval '1 day') >= 20 then
      return jsonb_build_object('error', 'Batas 20 lampiran per hari untuk percakapan ini tercapai.');
    end if;
    return jsonb_build_object('ok', true);
  end if;
  if v_op = 'track' then
    return cx_track(k.id, case when s.id is not null then 'svc_order' else 'so_order' end, coalesce(o.id, s.id));
  end if;
  if v_op = 'file' then
    if c.id is null or v_id is null then return null; end if;
    select * into m from customer_messages where id = v_id and conversation_id = c.id and kind <> 'catatan' and file_path is not null;
    if m.id is null then return null; end if;
    return jsonb_build_object('path', m.file_path, 'name', m.file_name, 'mime', m.file_mime);
  end if;
  if v_op = 'read' then
    if c.id is null or v_id is null then return jsonb_build_object('ok', true); end if;
    select created_at into v_at from customer_messages where id = v_id and conversation_id = c.id and sender = 'business';
    if found then
      update customer_messages set read_at = clock_timestamp() where conversation_id = c.id and sender = 'business'
        and read_at is null and kind <> 'catatan' and created_at <= v_at;
    end if;
    return jsonb_build_object('ok', true);
  end if;
  if v_op = 'list' then
    return jsonb_build_object(
      'enabled', cx_chat_on(k.id),
      'business', jsonb_build_object('name', k.name, 'logo', k.profile->>'logo_path') || cx_business_info(k.id),
      'conversation', case when c.id is not null then jsonb_build_object('id', c.id, 'status', c.status) end,
      'need_identity', v_umum and c.id is null and v_access = 'guest',
      'reference', case when not v_umum then cx_track(k.id, case when s.id is not null then 'svc_order' else 'so_order' end, coalesce(o.id, s.id)) end,
      'messages', case when c.id is null then '[]'::jsonb else cx_messages(c.id, false, v_before) end);
  end if;

  -- 3. Kirim (pelanggan: teks/gambar/dokumen)
  if not cx_chat_on(k.id) then return jsonb_build_object('error', 'Chat sedang dimatikan oleh bisnis. Gunakan kontak lain di halaman bisnis.'); end if;
  if v_kind not in ('teks', 'gambar', 'dokumen') or ((v_kind <> 'teks') <> (p->'file' is not null and jsonb_typeof(p->'file') = 'object'))
     or (v_kind <> 'teks' and coalesce(p#>>'{file,path}', '') !~ '^pelanggan/[a-f0-9]{64}$') then
    return jsonb_build_object('error', 'Pesan tidak valid.');
  end if;
  if c.id is null then
    if v_umum then
      v_name := left(trim(coalesce(p->>'name', '')), 80); v_phone := left(regexp_replace(coalesce(p->>'phone', ''), '[^0-9+]', '', 'g'), 20);
      if v_access = 'private' then v_name := coalesce(nullif(v_name, ''), ct.name); v_phone := coalesce(nullif(v_phone, ''), ct.phone);
      elsif length(v_name) < 2 or crm_phone(v_phone) is null then
        -- tamu toko: pakai nama & HP dari pesanan terakhir di sesi ini, bila ada
        select g.name, g.phone into v_name, v_phone from so_orders x join contacts g on g.id = x.contact_id
        where x.kos_id = k.id and x.portal_guest_hash = v_cred order by x.created_at desc limit 1;
        if length(coalesce(v_name, '')) < 2 then return jsonb_build_object('error', 'Isi nama dan No. WhatsApp agar toko bisa membalas.'); end if;
      end if;
      if v_access = 'guest' and (select count(*) from customer_conversations where kos_id = k.id and kind = 'umum'
          and guest_hash is not null and created_at > now() - interval '1 day') >= 200 then
        return jsonb_build_object('error', 'Chat sedang ramai. Coba lagi nanti atau hubungi lewat kontak toko.');
      end if;
      insert into customer_conversations(kos_id, kind, channel, contact_id, guest_hash, customer_name, customer_phone)
      values (k.id, 'umum', case when v_access = 'private' then 'grosir' else 'toko' end, ct.id,
        case when v_access = 'guest' then v_cred end, v_name, v_phone)
      on conflict do nothing returning * into c;
      if c.id is null then
        select * into c from customer_conversations where kos_id = k.id and kind = 'umum'
          and (case when v_access = 'guest' then guest_hash = v_cred else contact_id = ct.id and guest_hash is null end);
      end if;
    else
      insert into customer_conversations(kos_id, kind, channel, reference_type, reference_id, contact_id, guest_hash, customer_name, customer_phone)
      select k.id, 'transaksi', case when s.id is not null then 'jasa' when o.portal_guest_hash is not null then 'toko' else 'grosir' end,
        case when s.id is not null then 'svc_order' else 'so_order' end, coalesce(o.id, s.id), coalesce(o.contact_id, s.contact_id), o.portal_guest_hash,
        left(coalesce(s.customer_name, g.name), 80), left(coalesce(s.customer_phone, g.phone), 20)
      from (select 1) z left join contacts g on g.id = o.contact_id
      on conflict do nothing returning * into c;
      if c.id is null then
        select * into c from customer_conversations where kos_id = k.id and kind = 'transaksi'
          and reference_type = case when s.id is not null then 'svc_order' else 'so_order' end and reference_id = coalesce(o.id, s.id);
      end if;
    end if;
  end if;
  return cx_post(c, 'customer', v_id, v_kind, p->>'body', null,
    case when v_kind <> 'teks' then jsonb_build_object('path', p#>>'{file,path}', 'name', p#>>'{file,name}', 'mime', p#>>'{file,mime}', 'size', p#>>'{file,size}') end);
end $$;
revoke execute on function public.cx_customer(jsonb) from public, anon, authenticated;
grant execute on function public.cx_customer(jsonb) to service_role;

-- Jumlah balasan bisnis yang belum dibaca per transaksi tamu toko + chat umum (lencana di portal)
create or replace function public.cx_guest_unread(p_slug text, p_guest text) returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_object_agg(coalesce(v.reference_id::text, 'umum'), q.n), '{}'::jsonb)
  from public_pages pg join kos k on k.id = pg.kos_id
  join customer_conversations v on v.kos_id = k.id and (v.guest_hash = p_guest)
  join lateral (select count(*) n from customer_messages m where m.conversation_id = v.id and m.sender = 'business'
    and m.kind <> 'catatan' and m.read_at is null) q on q.n > 0
  where pg.slug = lower(p_slug) and pg.enabled and k.business_type = 'retail' and coalesce(p_guest, '') ~ '^[a-f0-9]{64}$';
$$;
revoke execute on function public.cx_guest_unread(text, text) from public, anon, authenticated;
grant execute on function public.cx_guest_unread(text, text) to service_role;

-- Sama untuk portal pribadi /c (per pesanan + 'umum')
create function public.cx_private_unread(p_token text) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare ct contacts;
begin
  ct := cportal_contact(p_token);
  if ct.id is null then return '{}'::jsonb; end if;
  return (select coalesce(jsonb_object_agg(coalesce(v.reference_id::text, 'umum'), q.n), '{}'::jsonb)
    from customer_conversations v
    join lateral (select count(*) n from customer_messages m where m.conversation_id = v.id and m.sender = 'business'
      and m.kind <> 'catatan' and m.read_at is null) q on q.n > 0
    where v.kos_id = ct.kos_id and v.contact_id = ct.id and v.guest_hash is null);
end $$;
revoke execute on function public.cx_private_unread(text) from public, anon, authenticated;
grant execute on function public.cx_private_unread(text) to service_role;

-- ============================ 8. Pemilik & staf (area sell / ops) ============================
create function public.cx_inbox(p_kos uuid, p_filter text default 'semua', p_search text default null) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare v_q text := lower(trim(coalesce(p_search, '')));
begin
  if not member_in('sell,ops', p_kos) then raise exception 'Tidak punya akses ke chat pelanggan'; end if;
  return jsonb_build_object(
    'enabled', cx_chat_on(p_kos),
    'counts', (select jsonb_build_object(
        'unread', count(*) filter (where exists (select 1 from customer_messages m where m.conversation_id = v.id and m.sender = 'customer' and m.read_at is null)),
        'baru', count(*) filter (where v.status = 'baru'), 'ditangani', count(*) filter (where v.status = 'ditangani'),
        'menunggu_pelanggan', count(*) filter (where v.status = 'menunggu_pelanggan'),
        'saya', count(*) filter (where v.assigned_to = auth.uid() and v.status <> 'selesai'))
      from customer_conversations v where v.kos_id = p_kos and v.last_at is not null),
    'rows', (select coalesce(jsonb_agg(r order by (r->>'last_at') desc nulls last), '[]') from (
      select jsonb_build_object('id', v.id, 'kind', v.kind, 'channel', v.channel, 'status', v.status, 'priority', v.priority,
        'ref_type', v.reference_type, 'ref_id', v.reference_id, 'number', cx_ref_number(v),
        'customer', coalesce(nullif(v.customer_name, ''), g.name, 'Pelanggan'), 'assigned_to', v.assigned_to,
        'assigned_name', case when v.assigned_to is not null then prj_user_label(v.assigned_to) end,
        'last_at', v.last_at, 'last_sender', v.last_sender,
        'preview', (select case m.kind when 'teks' then left(m.body, 90) when 'gambar' then '📷 Foto' when 'dokumen' then '📄 Dokumen'
            when 'produk' then '🛒 Kartu produk' when 'penawaran' then '🏷️ Penawaran' when 'pembayaran' then '💳 Cara bayar' end
          from customer_messages m where m.conversation_id = v.id and m.kind <> 'catatan' order by m.created_at desc, m.id desc limit 1),
        'unread', (select count(*) from customer_messages m where m.conversation_id = v.id and m.sender = 'customer' and m.read_at is null)) r
      from customer_conversations v left join contacts g on g.id = v.contact_id
      where v.kos_id = p_kos and v.last_at is not null
        and case coalesce(p_filter, 'semua')
          when 'belum_dibaca' then exists (select 1 from customer_messages m where m.conversation_id = v.id and m.sender = 'customer' and m.read_at is null)
          when 'saya' then v.assigned_to = auth.uid() and v.status <> 'selesai'
          when 'tinggi' then v.priority = 'tinggi' and v.status <> 'selesai'
          when 'semua' then true
          else v.status = p_filter end
        and (v_q = '' or lower(coalesce(v.customer_name, g.name, '')) like '%' || v_q || '%'
          or lower(coalesce(cx_ref_number(v), '')) like '%' || v_q || '%' or coalesce(v.customer_phone, '') like '%' || v_q || '%')
      order by v.last_at desc nulls last limit 100) x(r)));
end $$;
revoke execute on function public.cx_inbox(uuid, text, text) from public, anon;
grant execute on function public.cx_inbox(uuid, text, text) to authenticated;

-- Jumlah percakapan dengan pesan pelanggan belum dibaca (lencana menu)
create function public.cx_unread_count(p_kos uuid) returns int language sql stable security definer set search_path = public as $$
  select case when member_in('sell,ops', p_kos) then (select count(distinct m.conversation_id)::int from customer_messages m
    where m.kos_id = p_kos and m.sender = 'customer' and m.read_at is null) else 0 end;
$$;
revoke execute on function public.cx_unread_count(uuid) from public, anon;
grant execute on function public.cx_unread_count(uuid) to authenticated;

-- Buka percakapan transaksi dari halaman pesanan (dibuat bila belum ada; tidak mengirim apa pun ke pelanggan)
create function public.cx_open_ref(p_kos uuid, p_type text, p_ref uuid) returns uuid
language plpgsql security definer set search_path = public as $$
declare o so_orders; s svc_orders; v_id uuid; g contacts;
begin
  if not member_in('sell,ops', p_kos) then raise exception 'Tidak punya akses ke chat pelanggan'; end if;
  select id into v_id from customer_conversations where kos_id = p_kos and kind = 'transaksi' and reference_type = p_type and reference_id = p_ref;
  if v_id is not null then return v_id; end if;
  if p_type = 'so_order' then
    select * into o from so_orders where id = p_ref and kos_id = p_kos;
    if o.id is null then raise exception 'Pesanan tidak ditemukan'; end if;
    select * into g from contacts where id = o.contact_id;
    insert into customer_conversations(kos_id, kind, channel, reference_type, reference_id, contact_id, guest_hash, customer_name, customer_phone)
    values (p_kos, 'transaksi', case when o.portal_guest_hash is not null then 'toko' else 'grosir' end, 'so_order', o.id, o.contact_id,
      o.portal_guest_hash, left(g.name, 80), left(g.phone, 20))
    on conflict do nothing returning id into v_id;
  elsif p_type = 'svc_order' then
    select * into s from svc_orders where id = p_ref and kos_id = p_kos;
    if s.id is null then raise exception 'Pesanan tidak ditemukan'; end if;
    insert into customer_conversations(kos_id, kind, channel, reference_type, reference_id, contact_id, customer_name, customer_phone)
    values (p_kos, 'transaksi', 'jasa', 'svc_order', s.id, s.contact_id, left(s.customer_name, 80), left(s.customer_phone, 20))
    on conflict do nothing returning id into v_id;
  else
    raise exception 'Jenis transaksi tidak dikenal';
  end if;
  return coalesce(v_id, (select id from customer_conversations where kos_id = p_kos and kind = 'transaksi' and reference_type = p_type and reference_id = p_ref));
end $$;
revoke execute on function public.cx_open_ref(uuid, text, uuid) from public, anon;
grant execute on function public.cx_open_ref(uuid, text, uuid) to authenticated;

-- Kartu produk (harga eceran/grosir satuan saat dikirim = salinan; harga kasir tetap dihitung server saat transaksi)
create function public.cx_products(p_kos uuid, p_search text) returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not member_in('sell,ops', p_kos) then raise exception 'Tidak punya akses'; end if;
  return (select coalesce(jsonb_agg(x), '[]') from (
    select jsonb_build_object('id', pr.id, 'name', pr.name, 'units', (select jsonb_agg(jsonb_build_object('name', u.name,
      'price', u.price_retail, 'wholesale', u.price_wholesale) order by u.sort) from product_units u where u.product_id = pr.id)) x
    from products pr where pr.kos_id = p_kos and pr.active and lower(pr.name) like '%' || lower(trim(coalesce(p_search, ''))) || '%'
    order by pr.name limit 20) q);
end $$;
revoke execute on function public.cx_products(uuid, text) from public, anon;
grant execute on function public.cx_products(uuid, text) to authenticated;

-- Satu pintu staf: op list|send|read|status|priority|assign
create function public.cx_thread(p_conv uuid, p_op text, p jsonb default '{}') returns jsonb
language plpgsql security definer set search_path = public as $$
declare c customer_conversations; k kos; v_id uuid; v_kind text := coalesce(p->>'kind', 'teks'); v_payload jsonb;
  pr products; u product_units; o so_orders; v_at timestamptz; v_user uuid; v_res jsonb; v_before uuid; v_slug text;
begin
  select * into c from customer_conversations where id = p_conv;
  if c.id is null or not member_in(cx_area(c), c.kos_id) then raise exception 'Percakapan tidak ditemukan'; end if;
  select * into k from kos where id = c.kos_id;
  begin v_id := nullif(p->>'id', '')::uuid; v_before := nullif(p->>'before', '')::uuid; exception when others then raise exception 'Permintaan tidak valid'; end;

  if p_op = 'list' then
    return jsonb_build_object(
      'conversation', jsonb_build_object('id', c.id, 'kind', c.kind, 'channel', c.channel, 'status', c.status, 'priority', c.priority,
        'assigned_to', c.assigned_to, 'ref_type', c.reference_type, 'ref_id', c.reference_id, 'number', cx_ref_number(c),
        'customer', coalesce(nullif(c.customer_name, ''), (select name from contacts where id = c.contact_id), 'Pelanggan'),
        'phone', coalesce(c.customer_phone, (select phone from contacts where id = c.contact_id)), 'contact_id', c.contact_id,
        'created_at', c.created_at),
      'reference', cx_track(c.kos_id, c.reference_type, c.reference_id),
      'business', cx_business_info(c.kos_id),
      'replies', coalesce(k.profile #> '{chat,balasan}', '[]'),
      'enabled', cx_chat_on(c.kos_id),
      'can_pay', nullif(trim(coalesce(k.payment_info, '')), '') is not null or k.qris_image is not null,
      'members', (select coalesce(jsonb_agg(jsonb_build_object('id', km.user_id, 'name', prj_user_label(km.user_id)) order by km.role <> 'pemilik'), '[]')
        from kos_members km where km.kos_id = c.kos_id and km.active and notif_member_ok(c.kos_id, km.user_id, cx_area(c))),
      'messages', cx_messages(c.id, true, v_before));
  elsif p_op = 'read' then
    select created_at into v_at from customer_messages where id = v_id and conversation_id = c.id and sender = 'customer';
    if found then
      update customer_messages set read_at = clock_timestamp() where conversation_id = c.id and sender = 'customer'
        and read_at is null and created_at <= v_at;
    end if;
    return jsonb_build_object('ok', true);
  elsif p_op = 'status' then
    if p->>'value' not in ('baru', 'ditangani', 'menunggu_pelanggan', 'selesai') then raise exception 'Status tidak dikenal'; end if;
    update customer_conversations set status = p->>'value', updated_at = now() where id = c.id;
    return jsonb_build_object('ok', true);
  elsif p_op = 'priority' then
    if p->>'value' not in ('normal', 'tinggi') then raise exception 'Prioritas tidak dikenal'; end if;
    update customer_conversations set priority = p->>'value', updated_at = now() where id = c.id;
    return jsonb_build_object('ok', true);
  elsif p_op = 'assign' then
    begin v_user := nullif(p->>'user_id', '')::uuid; exception when others then raise exception 'Anggota tidak valid'; end;
    if v_user is not null and not exists (select 1 from kos_members km where km.kos_id = c.kos_id and km.user_id = v_user and km.active
        and notif_member_ok(c.kos_id, v_user, cx_area(c))) then
      raise exception 'Anggota ini tidak punya akses ke chat pelanggan';
    end if;
    update customer_conversations set assigned_to = v_user, updated_at = now(),
      status = case when v_user is not null and status = 'baru' then 'ditangani' else status end where id = c.id;
    if v_user is not null and v_user is distinct from auth.uid() then
      perform notif_emit_safe(c.kos_id, 'CustomerChatAssigned', 'tugas:' || c.id || ':' || v_user || ':' || extract(epoch from now())::bigint,
        cx_area(c), 'Ditugaskan: ' || coalesce(nullif(c.customer_name, ''), 'Pelanggan') || coalesce(' · ' || cx_ref_number(c), ''),
        null, jsonb_build_object('user_id', v_user), auth.uid(), 'conversation', c.id);
    end if;
    return jsonb_build_object('ok', true);
  elsif p_op <> 'send' then
    raise exception 'Operasi tidak dikenal';
  end if;

  -- Kirim: teks, catatan internal, gambar/dokumen (path dari server), kartu produk/penawaran/cara bayar (dibangun server)
  if v_kind not in ('teks', 'catatan', 'gambar', 'dokumen', 'produk', 'penawaran', 'pembayaran') then raise exception 'Jenis pesan tidak dikenal'; end if;
  if v_kind <> 'catatan' and not cx_chat_on(c.kos_id) then raise exception 'Chat pelanggan sedang dimatikan di setelan chat'; end if;
  if v_kind in ('gambar', 'dokumen') and coalesce(p#>>'{file,path}', '') !~ ('^' || c.kos_id || '/[a-f0-9]{64}$') then
    raise exception 'Lampiran tidak valid';
  end if;
  if v_kind = 'produk' then
    select * into pr from products where id = nullif(p->>'product_id', '')::uuid and kos_id = c.kos_id and active;
    if pr.id is null then raise exception 'Barang tidak ditemukan'; end if;
    select * into u from product_units where product_id = pr.id and name = p->>'unit';
    if u.id is null then select * into u from product_units where product_id = pr.id order by sort limit 1; end if;
    v_payload := jsonb_build_object('product_id', pr.id, 'name', pr.name, 'unit', u.name,
      'price', case when c.channel = 'grosir' and coalesce(u.price_wholesale, 0) > 0 then u.price_wholesale else u.price_retail end,
      'slug', (select slug from public_pages where kos_id = c.kos_id and enabled limit 1));
  elsif v_kind = 'penawaran' then
    if c.reference_type <> 'so_order' then raise exception 'Kartu penawaran hanya untuk pesanan toko/grosir'; end if;
    select * into o from so_orders where id = c.reference_id;
    if o.status <> 'penawaran' or o.portal_kind = 'pesanan' then raise exception 'Pesanan ini bukan penawaran yang menunggu persetujuan'; end if;
    v_payload := jsonb_build_object('order_id', o.id, 'number', o.number, 'total', o.total, 'valid_until', o.valid_until,
      'items', (select count(*) from so_lines where order_id = o.id), 'ready', o.quote_revision is not null or o.portal_guest_hash is null);
  elsif v_kind = 'pembayaran' then
    if nullif(trim(coalesce(k.payment_info, '')), '') is null and k.qris_image is null then
      raise exception 'Isi rekening/QRIS dulu di Pengaturan bisnis';
    end if;
    v_payload := jsonb_build_object('payment_info', k.payment_info, 'qris', k.qris_image, 'rules', k.profile->>'payment_rules',
      'total', case when c.reference_type is not null then (cx_track(c.kos_id, c.reference_type, c.reference_id)->>'total')::numeric end);
  end if;
  return cx_post(c, 'business', v_id, v_kind, p->>'body', v_payload,
    case when v_kind in ('gambar', 'dokumen') then jsonb_build_object('path', p#>>'{file,path}', 'name', p#>>'{file,name}',
      'mime', p#>>'{file,mime}', 'size', p#>>'{file,size}') end);
end $$;
revoke execute on function public.cx_thread(uuid, text, jsonb) from public, anon;
grant execute on function public.cx_thread(uuid, text, jsonb) to authenticated;

-- Lampiran untuk staf: path hanya bila boleh membaca percakapan (dipakai /api/chat-file untuk URL bertanda tangan)
create function public.cx_file_staff(p_message uuid) returns jsonb language plpgsql stable security definer set search_path = public as $$
declare m customer_messages; c customer_conversations;
begin
  select * into m from customer_messages where id = p_message and file_path is not null;
  select * into c from customer_conversations where id = m.conversation_id;
  if c.id is null or not member_in(cx_area(c), c.kos_id) then return null; end if;
  return jsonb_build_object('path', m.file_path, 'name', m.file_name, 'mime', m.file_mime);
end $$;
revoke execute on function public.cx_file_staff(uuid) from public, anon;
grant execute on function public.cx_file_staff(uuid) to authenticated;

-- Tracking toko: tandai disiapkan & isi kurir/resi/estimasi tiba per surat jalan (area sell)
create function public.so_track_set(p_order uuid, p jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare o so_orders; d so_deliveries; v_from timestamptz; v_to timestamptz;
begin
  select * into o from so_orders where id = p_order for update;
  if o.id is null or not member_in('sell', o.kos_id) then raise exception 'Pesanan tidak ditemukan'; end if;
  if p ? 'prepared' then
    if (p->>'prepared')::boolean then
      if o.status not in ('dikonfirmasi', 'sebagian') then raise exception 'Tandai disiapkan setelah pesanan dikonfirmasi'; end if;
      update so_orders set prepared_at = coalesce(prepared_at, now()), updated_at = now() where id = o.id;
    else
      update so_orders set prepared_at = null, updated_at = now() where id = o.id;
    end if;
  end if;
  if p ? 'delivery_id' then
    select * into d from so_deliveries where id = nullif(p->>'delivery_id', '')::uuid and order_id = o.id;
    if d.id is null then raise exception 'Surat jalan tidak ditemukan'; end if;
    v_from := nullif(p->>'eta_from', '')::timestamptz; v_to := nullif(p->>'eta_to', '')::timestamptz;
    if v_from is not null and v_to is not null and v_to < v_from then raise exception 'Batas akhir estimasi harus setelah awal'; end if;
    if coalesce(v_to, v_from) > now() + interval '60 days' then raise exception 'Estimasi tiba maksimal 60 hari ke depan'; end if;
    update so_deliveries set courier = nullif(left(trim(coalesce(p->>'courier', '')), 60), ''),
      tracking_no = nullif(left(trim(coalesce(p->>'tracking_no', '')), 60), ''), eta_from = v_from, eta_to = coalesce(v_to, v_from)
    where id = d.id;
  end if;
  return jsonb_build_object('ok', true);
end $$;
revoke execute on function public.so_track_set(uuid, jsonb) from public, anon;
grant execute on function public.so_track_set(uuid, jsonb) to authenticated;

-- Pembersihan lampiran yatim (upload berhasil tapi pesan gagal tersimpan) — dipanggil cron harian
create function public.cx_orphan_paths() returns setof text language sql stable security definer set search_path = public as $$
  select f.name from storage.objects f
  where f.bucket_id = 'customer-chat' and f.created_at < now() - interval '1 day'
    and not exists (select 1 from customer_messages m where m.file_path = f.name)
  order by f.created_at limit 500;
$$;
revoke execute on function public.cx_orphan_paths() from public, anon, authenticated;
grant execute on function public.cx_orphan_paths() to service_role;

-- ============================ 9. Fungsi tahap 1 diganti ============================
drop function public.cx_exchange(uuid, text, text, text, text, uuid, text, uuid);
drop function public.cx_owner_exchange(uuid, text, uuid, text, uuid);
drop function public.cx_owner_inbox(uuid);
drop function public.cx_order(uuid, text, text, text);
