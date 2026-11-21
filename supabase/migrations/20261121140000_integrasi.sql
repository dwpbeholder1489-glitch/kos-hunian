-- Adaptive Experience Fase 6 — Integrasi: registry konektor, sambungan per bisnis, log, webhook masuk.
-- Prinsip (Blueprint Culinary §12.1, IBOS Bab 9.2): setiap integrasi bisa dinyalakan/dijeda sendiri, kunci hanya di server,
-- kiriman divalidasi, kegagalan tercatat, dan tidak ada integrasi yang menjadi ketergantungan seluruh sistem.
-- Yang TERSEDIA hanya "Prospek masuk (webhook)". Yang lain tampil jujur sebagai "Dalam rencana" beserta syaratnya.
-- Kode sambungan (token) hanya disimpan sebagai hash SHA-256; nilai asli ditampilkan SEKALI saat dibuat / diganti.

-- ================= Registry konektor (global) =================
create table if not exists public.integration_catalog (
  code text primary key,
  name text not null,
  description text not null,
  direction text not null check (direction in ('masuk', 'keluar', 'dua_arah')),
  impl_status text not null default 'planned' check (impl_status in ('planned', 'production_ready', 'deprecated')),
  needs text,                       -- syarat agar bisa dipakai (diisi untuk yang belum tersedia)
  sort int not null default 100
);
alter table public.integration_catalog enable row level security;
revoke all on public.integration_catalog from anon, authenticated;

insert into public.integration_catalog(code, name, description, direction, impl_status, needs, sort) values
  ('webhook_masuk', 'Prospek masuk (webhook)',
   'Terima pendaftaran atau pertanyaan dari formulir website, Google Form (lewat Apps Script), bot WhatsApp, atau aplikasi lain. Setiap kiriman menjadi Prospek di CRM.',
   'masuk', 'production_ready', null, 10),
  ('webhook_keluar', 'Kabar keluar ke aplikasi lain (webhook keluar)',
   'Kirim kabar otomatis (penjualan baru, pembayaran, pesanan selesai) ke aplikasi milik Anda.',
   'keluar', 'planned', 'Butuh penjadwal yang berjalan tiap menit; jadwal otomatis PRASARA saat ini hanya harian. Menunggu keputusan pemilik.', 20),
  ('whatsapp_api', 'WhatsApp resmi',
   'Pengingat tagihan, status pesanan, dan percakapan lewat WhatsApp Business API.',
   'dua_arah', 'planned', 'Butuh akun WhatsApp Business API, nomor terverifikasi, dan template pesan yang disetujui penyedia.', 30),
  ('gateway_bayar', 'Pembayaran online untuk pelanggan bisnis',
   'Pelanggan membayar lewat QRIS/transfer virtual dan status lunas masuk otomatis.',
   'dua_arah', 'planned', 'Butuh akun penyedia pembayaran milik bisnis dan webhook dari penyedia tersebut.', 40),
  ('marketplace', 'Marketplace & aplikasi pesan-antar',
   'Pesanan dari marketplace atau aplikasi pesan-antar masuk langsung ke PRASARA.',
   'masuk', 'planned', 'Butuh akses API dari penyedia (umumnya hanya untuk mitra resmi) dan persetujuan masing-masing penyedia.', 50)
on conflict (code) do update set name = excluded.name, description = excluded.description, direction = excluded.direction,
  impl_status = excluded.impl_status, needs = excluded.needs, sort = excluded.sort;

-- ================= Sambungan per bisnis =================
create table if not exists public.integration_connections (
  id uuid primary key default gen_random_uuid(),
  kos_id uuid not null references public.kos(id) on delete cascade,
  kind text not null references public.integration_catalog(code),
  name text not null check (length(trim(name)) between 2 and 60),
  token_hash text not null unique,
  token_hint text not null,
  status text not null default 'aktif' check (status in ('aktif', 'dijeda')),
  mapping jsonb not null default '{}',     -- pemetaan kolom: {name, phone, message, email} → nama kolom di kiriman
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  rotated_at timestamptz,
  last_used_at timestamptz,
  paused_at timestamptz
);
create unique index if not exists integration_connections_name on public.integration_connections(kos_id, lower(name));
create index if not exists integration_connections_kos on public.integration_connections(kos_id);
alter table public.integration_connections enable row level security;
revoke all on public.integration_connections from anon, authenticated;

-- ================= Log koneksi =================
create table if not exists public.integration_logs (
  id bigint generated always as identity primary key,
  kos_id uuid references public.kos(id) on delete cascade,          -- kosong = tautan tidak dikenal
  connection_id uuid references public.integration_connections(id) on delete set null,
  kind text,
  direction text not null default 'masuk',
  outcome text not null check (outcome in ('ok', 'duplikat', 'tidak_valid', 'dibatasi', 'dijeda', 'token_salah', 'nonaktif', 'galat')),
  detail text,                      -- alasan singkat (tanpa isi data pelanggan)
  ref text,                         -- nomor prospek yang dibuat
  idem_key text,
  ip_hash text,
  created_at timestamptz not null default now()
);
create index if not exists integration_logs_kos on public.integration_logs(kos_id, created_at desc);
create index if not exists integration_logs_conn on public.integration_logs(connection_id, created_at desc);
create index if not exists integration_logs_salah on public.integration_logs(ip_hash, created_at) where outcome = 'token_salah';
create unique index if not exists integration_logs_idem on public.integration_logs(connection_id, idem_key) where idem_key is not null and outcome = 'ok';
alter table public.integration_logs enable row level security;
revoke all on public.integration_logs from anon, authenticated;

-- Tabel ber-kos_id: bisnis ditutup / masih draf menolak tulis dari pengguna (server/kunci rahasia dikecualikan di dalam fungsinya)
drop trigger if exists zz_kos_open_guard on public.integration_connections;
create trigger zz_kos_open_guard before insert or update or delete on public.integration_connections for each row execute function public.kos_open_guard();
drop trigger if exists zz_kos_open_guard on public.integration_logs;
create trigger zz_kos_open_guard before insert or update or delete on public.integration_logs for each row execute function public.kos_open_guard();

-- ================= Pembantu =================
create or replace function public.integ_hash(p_token text)
returns text language sql immutable set search_path = public as $$
  select encode(sha256(convert_to(coalesce(p_token, ''), 'UTF8')), 'hex');
$$;

-- Token acak: 2 UUID v4 dari pembangkit acak kuat Postgres → "prs_" + 48 heksa (±186 bit)
create or replace function public.integ_new_token()
returns text language sql volatile set search_path = public as $$
  select 'prs_' || left(replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''), 48);
$$;

-- Pemetaan kolom milik pemilik: hanya 4 kunci, nama kolom sederhana
create or replace function public.integ_map_clean(p jsonb)
returns jsonb language plpgsql immutable set search_path = public as $$
declare k text; v text; o jsonb := '{}';
begin
  if p is null or jsonb_typeof(p) = 'null' then return '{}'; end if;
  if jsonb_typeof(p) <> 'object' then raise exception 'Pemetaan kolom tidak valid'; end if;
  for k, v in select key, value from jsonb_each_text(p) loop
    if k not in ('name', 'phone', 'message', 'email') then raise exception 'Kolom "%" tidak dikenal. Pilihan: name, phone, message, email.', k; end if;
    v := trim(coalesce(v, ''));
    if v = '' then continue; end if;
    if v !~ '^[A-Za-z0-9_. -]{1,40}$' then
      raise exception 'Nama kolom "%" hanya boleh huruf, angka, spasi, titik, garis bawah atau strip (maks. 40 huruf).', v; end if;
    o := o || jsonb_build_object(k, v);
  end loop;
  return o;
end $$;

-- Ambil satu nilai dari kiriman: kolom pilihan pemilik dulu (boleh "a.b" untuk bersarang), lalu nama umum (tanpa membedakan huruf besar/kecil)
create or replace function public.hook_pick(p_body jsonb, p_custom text, p_aliases text[])
returns text language plpgsql immutable set search_path = public as $$
declare v text;
begin
  if coalesce(p_custom, '') <> '' then
    v := nullif(trim(coalesce(p_body ->> p_custom, '')), '');
    if v is null then v := nullif(trim(coalesce(p_body #>> string_to_array(p_custom, '.'), '')), ''); end if;
    if v is not null and v !~ '^[\[{]' then return v; end if;
  end if;
  select nullif(trim(e.value), '') into v from jsonb_each_text(p_body) e
   where lower(e.key) = any (p_aliases) and nullif(trim(e.value), '') is not null and trim(e.value) !~ '^[\[{]'
   order by array_position(p_aliases, lower(e.key)) limit 1;
  return v;
end $$;

create or replace function public.integ_guard(p_kos uuid)
returns void language plpgsql stable security definer set search_path = public as $$
begin
  if auth.uid() is null or not member_in('settings', p_kos) then raise exception 'Hanya pemilik atau pengelola yang bisa mengatur integrasi.'; end if;
end $$;

-- ================= Webhook masuk (HANYA dari server aplikasi, kunci rahasia) =================
-- Kiriman → Prospek (crm_leads, sumber 'webhook'). Aman diulang: kunci idempotensi (opsional) dan nomor HP sama dalam 10 menit = satu prospek.
-- Hasil: {ok, status (kode HTTP), number, duplicate, error}
create or replace function public.hook_inbound(p_token text, p_ip_hash text, p_body jsonb, p_idem text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  c integration_connections; k kos; v_hash text := integ_hash(p_token);
  v_name text; v_ph text; v_msg text; v_mail text; v_need text; v_keys text;
  v_idem text := nullif(left(trim(coalesce(p_idem, '')), 100), '');
  v_ex integration_logs; v_exl crm_leads; v_lead uuid; v_no text; v_dup text;
  v_day date := (now() at time zone 'Asia/Jakarta')::date;
begin
  select * into c from integration_connections where token_hash = v_hash;
  if c.id is null then
    if (select count(*) from integration_logs where outcome = 'token_salah' and ip_hash = p_ip_hash and created_at > now() - interval '1 hour') >= 30 then
      return jsonb_build_object('ok', false, 'status', 429, 'error', 'Terlalu banyak percobaan. Coba lagi nanti.');
    end if;
    insert into integration_logs(outcome, detail, ip_hash) values ('token_salah', 'Tautan tidak dikenal', p_ip_hash);
    return jsonb_build_object('ok', false, 'status', 401, 'error', 'Tautan integrasi tidak dikenal.');
  end if;

  perform pg_advisory_xact_lock(hashtext('hook:' || c.id::text));      -- satu kiriman sekali per sambungan (idempotensi & batas)
  select * into k from kos where id = c.kos_id;
  if k.closed_at is not null or k.suspended_at is not null or coalesce(k.setup_status, 'active') <> 'active' then
    if not exists (select 1 from integration_logs where connection_id = c.id and outcome = 'nonaktif' and created_at > now() - interval '10 minutes') then
      insert into integration_logs(kos_id, connection_id, kind, outcome, detail, ip_hash) values (c.kos_id, c.id, c.kind, 'nonaktif', 'Bisnis ditutup, ditangguhkan, atau belum aktif', p_ip_hash); end if;
    return jsonb_build_object('ok', false, 'status', 403, 'error', 'Bisnis ini sedang tidak menerima kiriman.');
  end if;
  if c.status <> 'aktif' then
    if not exists (select 1 from integration_logs where connection_id = c.id and outcome = 'dijeda' and created_at > now() - interval '10 minutes') then
      insert into integration_logs(kos_id, connection_id, kind, outcome, detail, ip_hash) values (c.kos_id, c.id, c.kind, 'dijeda', 'Sambungan dijeda pemilik', p_ip_hash); end if;
    return jsonb_build_object('ok', false, 'status', 409, 'error', 'Sambungan ini sedang dijeda oleh pemilik bisnis.');
  end if;
  if not module_on(k.id, 'u_crm') then
    if not exists (select 1 from integration_logs where connection_id = c.id and outcome = 'nonaktif' and created_at > now() - interval '10 minutes') then
      insert into integration_logs(kos_id, connection_id, kind, outcome, detail, ip_hash) values (c.kos_id, c.id, c.kind, 'nonaktif', 'Modul Prospek (CRM) nonaktif', p_ip_hash); end if;
    return jsonb_build_object('ok', false, 'status', 403, 'error', 'Fitur Prospek belum aktif di bisnis ini.');
  end if;

  -- batas pemakaian per sambungan (melindungi bisnis dari banjir kiriman)
  if (select count(*) from integration_logs where connection_id = c.id and created_at > now() - interval '1 hour' and outcome in ('ok', 'duplikat', 'tidak_valid')) >= 60
     or (select count(*) from integration_logs where connection_id = c.id and created_at > now() - interval '1 day' and outcome = 'ok') >= 300 then
    if not exists (select 1 from integration_logs where connection_id = c.id and outcome = 'dibatasi' and created_at > now() - interval '10 minutes') then
      insert into integration_logs(kos_id, connection_id, kind, outcome, detail, ip_hash) values (c.kos_id, c.id, c.kind, 'dibatasi', 'Melewati batas 60 kiriman/jam atau 300 prospek/hari', p_ip_hash); end if;
    return jsonb_build_object('ok', false, 'status', 429, 'error', 'Terlalu banyak kiriman. Coba lagi nanti.');
  end if;

  if p_body is null or jsonb_typeof(p_body) <> 'object' then
    insert into integration_logs(kos_id, connection_id, kind, outcome, detail, ip_hash) values (c.kos_id, c.id, c.kind, 'tidak_valid', 'Isi kiriman bukan objek JSON atau formulir', p_ip_hash);
    return jsonb_build_object('ok', false, 'status', 400, 'error', 'Isi kiriman harus berupa objek JSON atau formulir.');
  end if;
  v_keys := left((select string_agg(x, ', ' order by x) from jsonb_object_keys(p_body) x), 200);

  -- kunci idempotensi: kiriman ulang dengan kunci sama tidak membuat prospek kedua
  if v_idem is not null then
    select * into v_ex from integration_logs where connection_id = c.id and idem_key = v_idem and outcome = 'ok';
    if v_ex.id is not null then
      insert into integration_logs(kos_id, connection_id, kind, outcome, detail, ref, ip_hash) values (c.kos_id, c.id, c.kind, 'duplikat', 'Kunci idempotensi sama', v_ex.ref, p_ip_hash);
      return jsonb_build_object('ok', true, 'status', 200, 'number', v_ex.ref, 'duplicate', true);
    end if;
  end if;

  -- pemetaan kolom
  v_name := left(hook_pick(p_body, c.mapping ->> 'name', array['name', 'nama', 'full_name', 'fullname', 'nama_lengkap', 'customer_name']), 80);
  if coalesce(length(trim(v_name)), 0) < 2 then v_name := null; end if;
  v_ph := nullif(regexp_replace(coalesce(hook_pick(p_body, c.mapping ->> 'phone', array['phone', 'telepon', 'telp', 'hp', 'no_hp', 'nohp', 'whatsapp', 'wa', 'no_wa', 'mobile', 'tel', 'phone_number']), ''), '[^0-9]', '', 'g'), '');
  v_msg := left(hook_pick(p_body, c.mapping ->> 'message', array['message', 'pesan', 'need', 'kebutuhan', 'catatan', 'note', 'notes', 'keterangan', 'comment', 'komentar']), 500);
  v_mail := left(hook_pick(p_body, c.mapping ->> 'email', array['email', 'e-mail', 'surel']), 100);

  if v_ph is not null and length(v_ph) not between 9 and 15 then
    insert into integration_logs(kos_id, connection_id, kind, outcome, detail, ip_hash) values (c.kos_id, c.id, c.kind, 'tidak_valid', 'Nomor telepon tidak valid (harus 9–15 angka). Kolom diterima: ' || coalesce(v_keys, '-'), p_ip_hash);
    return jsonb_build_object('ok', false, 'status', 400, 'error', 'Nomor telepon tidak valid (harus 9–15 angka).');
  end if;
  if v_ph is null and (v_name is null or coalesce(length(v_msg), 0) < 3) then
    insert into integration_logs(kos_id, connection_id, kind, outcome, detail, ip_hash) values (c.kos_id, c.id, c.kind, 'tidak_valid', 'Tidak ada nomor telepon, atau nama + pesan, yang dikenali. Kolom diterima: ' || coalesce(v_keys, '-'), p_ip_hash);
    return jsonb_build_object('ok', false, 'status', 400, 'error', 'Kiriman harus memuat nomor telepon, atau nama dan pesan. Kolom diterima: ' || coalesce(v_keys, '-'));
  end if;
  v_need := nullif(left(concat_ws(' · ', nullif(v_msg, ''), case when v_mail is not null then 'Email: ' || v_mail end), 500), '');

  -- kiriman ulang dari nomor yang sama dalam 10 menit dianggap satu prospek
  if v_ph is not null then
    select * into v_exl from crm_leads where kos_id = k.id and source = 'webhook' and crm_phone(phone) = crm_phone(v_ph) and created_at > now() - interval '10 minutes' order by created_at desc limit 1;
    if v_exl.id is not null then
      insert into integration_logs(kos_id, connection_id, kind, outcome, detail, ref, ip_hash) values (c.kos_id, c.id, c.kind, 'duplikat', 'Nomor sama dalam 10 menit', v_exl.number, p_ip_hash);
      return jsonb_build_object('ok', true, 'status', 200, 'number', v_exl.number, 'duplicate', true);
    end if;
  end if;

  perform pg_advisory_xact_lock(hashtext('publik:' || k.id::text));       -- kunci penomoran yang sama dengan formulir halaman bisnis
  v_no := 'PRM-' || to_char(v_day, 'YYMMDD') || '-' || lpad(((select count(*) from crm_leads where kos_id = k.id and number like 'PRM-' || to_char(v_day, 'YYMMDD') || '-%') + 1)::text, 3, '0');
  insert into crm_leads(kos_id, name, phone, need, source, number, created_by)
  values (k.id, coalesce(v_name, 'Tanpa nama'), v_ph, v_need, 'webhook', v_no, null) returning id into v_lead;
  if v_ph is not null then
    select name into v_dup from contacts where kos_id = k.id and archived_at is null and crm_phone(phone) = crm_phone(v_ph) limit 1; end if;
  insert into crm_activities(kos_id, lead_id, kind, body, created_email)
  values (k.id, v_lead, 'tahap', 'Prospek ' || v_no || ' masuk lewat integrasi "' || c.name || '"' || coalesce(' · No. HP sama dengan pelanggan ' || v_dup, ''), 'integrasi');
  insert into integration_logs(kos_id, connection_id, kind, outcome, ref, idem_key, ip_hash) values (c.kos_id, c.id, c.kind, 'ok', v_no, v_idem, p_ip_hash);
  update integration_connections set last_used_at = now() where id = c.id;
  return jsonb_build_object('ok', true, 'status', 200, 'number', v_no);
exception when others then
  -- galat tak terduga: kiriman ini dibatalkan utuh, dicatat tanpa isi data, dan penyedia diminta mengulang
  insert into integration_logs(kos_id, connection_id, kind, outcome, detail, ip_hash) values (c.kos_id, c.id, c.kind, 'galat', left(sqlerrm, 200), p_ip_hash);
  return jsonb_build_object('ok', false, 'status', 500, 'error', 'Terjadi gangguan. Coba kirim lagi nanti.');
end $$;
revoke execute on function public.hook_inbound(text, text, jsonb, text) from public, anon, authenticated;
grant execute on function public.hook_inbound(text, text, jsonb, text) to service_role;
revoke execute on function public.integ_hash(text), public.integ_new_token(), public.integ_map_clean(jsonb), public.hook_pick(jsonb, text, text[]), public.integ_guard(uuid) from public, anon, authenticated;

-- ================= Pengelolaan oleh pemilik/pengelola =================
create or replace function public.integ_overview(p_kos uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  perform integ_guard(p_kos);
  return jsonb_build_object(
    'catalog', (select coalesce(jsonb_agg(jsonb_build_object('code', code, 'name', name, 'description', description, 'direction', direction,
                  'impl_status', impl_status, 'needs', needs) order by sort), '[]') from integration_catalog where impl_status <> 'deprecated'),
    'connections', (select coalesce(jsonb_agg(jsonb_build_object(
        'id', c.id, 'kind', c.kind, 'name', c.name, 'status', c.status, 'hint', c.token_hint, 'mapping', c.mapping,
        'created_at', c.created_at, 'rotated_at', c.rotated_at, 'last_used_at', c.last_used_at,
        'd7', jsonb_build_object(
          'ok', (select count(*) from integration_logs l where l.connection_id = c.id and l.outcome = 'ok' and l.created_at > now() - interval '7 days'),
          'duplikat', (select count(*) from integration_logs l where l.connection_id = c.id and l.outcome = 'duplikat' and l.created_at > now() - interval '7 days'),
          'gagal', (select count(*) from integration_logs l where l.connection_id = c.id and l.outcome in ('tidak_valid', 'dibatasi', 'galat') and l.created_at > now() - interval '7 days')),
        'last_problem', (select jsonb_build_object('at', l.created_at, 'outcome', l.outcome, 'detail', l.detail) from integration_logs l
                         where l.connection_id = c.id and l.outcome in ('tidak_valid', 'dibatasi', 'galat') order by l.created_at desc limit 1)
      ) order by c.created_at), '[]') from integration_connections c where c.kos_id = p_kos),
    'limits', jsonb_build_object('per_jam', 60, 'per_hari', 300, 'maks_sambungan', 5),
    'crm_on', module_on(p_kos, 'u_crm'));
end $$;

create or replace function public.integ_create(p_kos uuid, p_kind text, p_name text, p_mapping jsonb default '{}')
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_tok text; v_id uuid; v_map jsonb;
begin
  perform integ_guard(p_kos);
  if not exists (select 1 from integration_catalog where code = p_kind and impl_status = 'production_ready' and direction in ('masuk', 'dua_arah')) then
    raise exception 'Jenis integrasi ini belum tersedia.'; end if;
  if coalesce(length(trim(p_name)), 0) not between 2 and 60 then raise exception 'Beri nama sambungan (2–60 huruf), misalnya "Formulir website".'; end if;
  if not module_on(p_kos, 'u_crm') then
    raise exception 'Aktifkan modul "Prospek & tindak lanjut (CRM)" di Pusat konfigurasi dulu — kiriman dari luar masuk sebagai Prospek.'; end if;
  if (select count(*) from integration_connections where kos_id = p_kos) >= 5 then raise exception 'Maksimal 5 sambungan per bisnis. Hapus yang tidak dipakai.'; end if;
  v_map := integ_map_clean(p_mapping);
  v_tok := integ_new_token();
  insert into integration_connections(kos_id, kind, name, token_hash, token_hint, mapping)
  values (p_kos, p_kind, trim(p_name), integ_hash(v_tok), right(v_tok, 4), v_map) returning id into v_id;
  perform config_log(p_kos, 'integrasi_buat', trim(p_name), null, jsonb_build_object('jenis', p_kind, 'pemetaan', v_map), null, 'sedang', actor_email());
  return jsonb_build_object('id', v_id, 'token', v_tok);    -- satu-satunya saat token asli terlihat
exception when unique_violation then
  raise exception 'Nama sambungan itu sudah dipakai. Pakai nama lain.';
end $$;

create or replace function public.integ_rotate(p_conn uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare c integration_connections; v_tok text;
begin
  select * into c from integration_connections where id = p_conn;
  if c.id is null then raise exception 'Sambungan tidak ditemukan'; end if;
  perform integ_guard(c.kos_id);
  v_tok := integ_new_token();
  update integration_connections set token_hash = integ_hash(v_tok), token_hint = right(v_tok, 4), rotated_at = now() where id = p_conn;
  perform config_log(c.kos_id, 'integrasi_token_baru', c.name, null, null, 'Tautan lama langsung tidak berlaku', 'sedang', actor_email());
  return jsonb_build_object('token', v_tok);
end $$;

create or replace function public.integ_set_status(p_conn uuid, p_active boolean)
returns void language plpgsql security definer set search_path = public as $$
declare c integration_connections;
begin
  select * into c from integration_connections where id = p_conn;
  if c.id is null then raise exception 'Sambungan tidak ditemukan'; end if;
  perform integ_guard(c.kos_id);
  update integration_connections set status = case when p_active then 'aktif' else 'dijeda' end, paused_at = case when p_active then null else now() end where id = p_conn;
  perform config_log(c.kos_id, case when p_active then 'integrasi_aktif' else 'integrasi_jeda' end, c.name, null, null, null, 'rendah', actor_email());
end $$;

create or replace function public.integ_update(p_conn uuid, p_name text, p_mapping jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare c integration_connections; v_map jsonb;
begin
  select * into c from integration_connections where id = p_conn;
  if c.id is null then raise exception 'Sambungan tidak ditemukan'; end if;
  perform integ_guard(c.kos_id);
  if coalesce(length(trim(p_name)), 0) not between 2 and 60 then raise exception 'Beri nama sambungan (2–60 huruf).'; end if;
  v_map := integ_map_clean(p_mapping);
  update integration_connections set name = trim(p_name), mapping = v_map where id = p_conn;
  perform config_log(c.kos_id, 'integrasi_ubah', trim(p_name), jsonb_build_object('nama', c.name, 'pemetaan', c.mapping), jsonb_build_object('pemetaan', v_map), null, 'rendah', actor_email());
exception when unique_violation then
  raise exception 'Nama sambungan itu sudah dipakai. Pakai nama lain.';
end $$;

create or replace function public.integ_delete(p_conn uuid)
returns void language plpgsql security definer set search_path = public as $$
declare c integration_connections;
begin
  select * into c from integration_connections where id = p_conn;
  if c.id is null then raise exception 'Sambungan tidak ditemukan'; end if;
  perform integ_guard(c.kos_id);
  delete from integration_connections where id = p_conn;      -- tautan langsung tidak berlaku; riwayat kiriman tetap ada (tanpa sambungan)
  perform config_log(c.kos_id, 'integrasi_hapus', c.name, jsonb_build_object('jenis', c.kind), null, null, 'sedang', actor_email());
end $$;

-- Riwayat kiriman (terbaru dulu): semua sambungan bisnis, atau satu sambungan
create or replace function public.integ_logs(p_kos uuid, p_conn uuid default null, p_limit int default 50)
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  perform integ_guard(p_kos);
  return (select coalesce(jsonb_agg(x order by x.at desc), '[]') from (
    select l.created_at as at, l.outcome, l.detail, l.ref, c.name as sambungan
    from integration_logs l left join integration_connections c on c.id = l.connection_id
    where l.kos_id = p_kos and (p_conn is null or l.connection_id = p_conn)
    order by l.created_at desc limit greatest(1, least(coalesce(p_limit, 50), 100))) x);
end $$;

grant execute on function public.integ_overview(uuid), public.integ_create(uuid, text, text, jsonb), public.integ_rotate(uuid),
  public.integ_set_status(uuid, boolean), public.integ_update(uuid, text, jsonb), public.integ_delete(uuid), public.integ_logs(uuid, uuid, int) to authenticated;
revoke execute on function public.integ_overview(uuid), public.integ_create(uuid, text, text, jsonb), public.integ_rotate(uuid),
  public.integ_set_status(uuid, boolean), public.integ_update(uuid, text, jsonb), public.integ_delete(uuid), public.integ_logs(uuid, uuid, int) from anon;

-- ================= Pemantauan platform (Super Admin) & pembersihan =================
-- Hanya angka: tanpa token, tanpa isi kiriman, tanpa nama pelanggan.
create or replace function public.admin_integration_overview()
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if not coalesce(admin_can('system.view'), false) then raise exception 'Tidak punya izin'; end if;
  return jsonb_build_object(
    'sambungan', jsonb_build_object(
      'total', (select count(*) from integration_connections),
      'aktif', (select count(*) from integration_connections where status = 'aktif'),
      'dijeda', (select count(*) from integration_connections where status = 'dijeda'),
      'bisnis', (select count(distinct kos_id) from integration_connections)),
    'h1', (select coalesce(jsonb_object_agg(outcome, n), '{}') from (select outcome, count(*) n from integration_logs where created_at > now() - interval '1 day' group by 1) z),
    'h7', (select coalesce(jsonb_object_agg(outcome, n), '{}') from (select outcome, count(*) n from integration_logs where created_at > now() - interval '7 days' group by 1) z),
    'terakhir_ok', (select max(created_at) from integration_logs where outcome = 'ok'),
    'katalog', (select coalesce(jsonb_agg(jsonb_build_object('code', code, 'name', name, 'impl_status', impl_status) order by sort), '[]') from integration_catalog where impl_status <> 'deprecated'));
end $$;
revoke execute on function public.admin_integration_overview() from public, anon;
grant execute on function public.admin_integration_overview() to authenticated;

-- Riwayat kiriman disimpan 60 hari (percobaan tautan salah 7 hari); dipanggil jadwal harian
create or replace function public.integ_logs_purge()
returns int language plpgsql security definer set search_path = public as $$
declare n int;
begin
  delete from integration_logs where created_at < now() - interval '60 days' or (outcome = 'token_salah' and created_at < now() - interval '7 days');
  get diagnostics n = row_count;
  return n;
end $$;
revoke execute on function public.integ_logs_purge() from public, anon, authenticated;
grant execute on function public.integ_logs_purge() to service_role;

-- ================= Sumber prospek baru =================
alter table public.crm_leads drop constraint if exists crm_leads_source_check;
alter table public.crm_leads add constraint crm_leads_source_check check (source in ('wa', 'datang', 'telepon', 'rekomendasi', 'media_sosial', 'lainnya', 'halaman', 'webhook'));

-- ================= Registry modul =================
insert into public.modules(code, name, description, applies_to, core, depends_on, paths, data_used, status, sort, module_type, category, impl_status, area, owner_approval) values
  ('u_integrasi', 'Integrasi', 'Sambungkan formulir website atau aplikasi lain agar kiriman masuk sebagai Prospek; lihat riwayat dan jeda kapan saja.',
   '{properti,retail,jasa,kustom}', true, '{}', '{/integrasi}', 'Kode sambungan (disimpan sebagai hash) dan riwayat kiriman', 'available', 58, 'integration', 'kontrol', 'production_ready', 'settings', false)
on conflict (code) do nothing;
