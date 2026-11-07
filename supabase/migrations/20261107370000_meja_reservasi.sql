-- Kuliner: reservasi meja + tagihan per meja (bayar semua / bagi rata / per item) + tutup meja.
-- Reservasi tidak memakai uang (DP reservasi: dalam rencana). Pembayaran tetap lewat svc_payment_add (satu per pesanan),
-- dibungkus satu transaksi agar bayar gabungan beberapa pesanan tidak tercatat setengah.

create table if not exists public.kul_reservations (
  id uuid primary key default gen_random_uuid(),
  kos_id uuid not null references public.kos(id) on delete cascade,
  number text not null,
  name text not null,
  phone text,
  party int not null default 2 check (party between 1 and 500),
  table_no text,
  starts_at timestamptz not null,
  minutes int not null default 90 check (minutes between 15 and 720),
  status text not null default 'dipesan' check (status in ('permintaan', 'dipesan', 'datang', 'selesai', 'batal', 'tidak_datang')),
  note text,
  source text not null default 'kasir' check (source in ('kasir', 'portal')),
  portal_ip text,
  log jsonb not null default '[]',
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid()
);
create index if not exists kul_resv_kos_time on public.kul_reservations(kos_id, starts_at);
alter table public.kul_reservations enable row level security;
drop policy if exists kul_resv_select on public.kul_reservations;
create policy kul_resv_select on public.kul_reservations for select using (public.member_can(kos_id, 'sell'));
grant select on public.kul_reservations to authenticated;
drop trigger if exists zz_kos_open_guard on public.kul_reservations;
create trigger zz_kos_open_guard before insert or update or delete on public.kul_reservations for each row execute function public.kos_open_guard();

-- bisnis kuliner + hak kasir
create or replace function public.kul_guard(p_kos uuid)
returns void language plpgsql stable security definer set search_path = public as $$
begin
  perform svc_guard(p_kos, 'sell');
  if not exists (select 1 from kos where id = p_kos and template_code = 'kuliner') then raise exception 'Khusus bisnis Kuliner'; end if;
end $$;

create or replace function public.kul_tables(p_kos uuid)
returns int language sql stable security definer set search_path = public as $$
  select case when coalesce(profile->>'tables', '') ~ '^\d{1,3}$' then (profile->>'tables')::int else 0 end from kos where id = p_kos;
$$;

-- reservasi lain yang bentrok di meja yang sama (dipesan/datang, waktu bertumpuk)
create or replace function public.kul_resv_clash(p_kos uuid, p_table text, p_start timestamptz, p_minutes int, p_except uuid)
returns text language sql stable security definer set search_path = public as $$
  select number || ' (' || name || ', ' || to_char(starts_at at time zone 'Asia/Jakarta', 'HH24.MI') || ')' from kul_reservations
  where kos_id = p_kos and table_no = p_table and status in ('dipesan', 'datang') and id is distinct from p_except
    and starts_at < p_start + make_interval(mins => p_minutes) and p_start < starts_at + make_interval(mins => minutes)
  order by starts_at limit 1;
$$;

create or replace function public.kul_resv_number(p_kos uuid, p_day date)
returns text language sql volatile security definer set search_path = public as $$
  select 'RSV-' || to_char(p_day, 'YYMMDD') || '-' || lpad(((select count(*) from kul_reservations where kos_id = p_kos and number like 'RSV-' || to_char(p_day, 'YYMMDD') || '-%') + 1)::text, 3, '0');
$$;

create or replace function public.kul_resv_log(p_old jsonb, p_text text, p_actor text)
returns jsonb language sql immutable as $$
  select coalesce(p_old, '[]'::jsonb) || jsonb_build_array(jsonb_build_object('at', now(), 'text', p_text, 'actor', p_actor));
$$;

-- tambah / ubah reservasi (kasir/pemilik)
create or replace function public.kul_resv_save(p_kos uuid, p_id uuid, p jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare r kul_reservations; v_name text := left(trim(coalesce(p->>'name', '')), 80); v_phone text := nullif(left(trim(coalesce(p->>'phone', '')), 20), '');
        v_party int; v_start timestamptz; v_min int := coalesce(nullif(p->>'minutes', '')::int, 90); v_tbl text := nullif(trim(coalesce(p->>'table_no', '')), '');
        v_clash text; v_ntab int; v_new boolean := p_id is null or not exists (select 1 from kul_reservations where id = p_id);
begin
  perform kul_guard(p_kos);
  if length(v_name) < 2 then raise exception 'Isi nama pemesan'; end if;
  if v_phone is not null and crm_phone(v_phone) is null then raise exception 'No. WhatsApp tidak valid'; end if;
  v_party := coalesce(nullif(p->>'party', '')::int, 0);
  if v_party < 1 or v_party > 500 then raise exception 'Jumlah orang 1–500'; end if;
  begin v_start := (p->>'starts_at')::timestamptz; exception when others then v_start := null; end;
  if v_start is null then raise exception 'Isi tanggal & jam'; end if;
  if v_start > now() + interval '366 days' then raise exception 'Tanggal terlalu jauh'; end if;
  if v_new and v_start < now() - interval '12 hours' then raise exception 'Tanggal sudah lewat'; end if;
  if v_min < 15 or v_min > 720 then raise exception 'Lama 15–720 menit'; end if;
  v_ntab := kul_tables(p_kos);
  if v_tbl is not null then
    if v_tbl !~ '^\d{1,3}$' or v_tbl::int < 1 or v_tbl::int > v_ntab then raise exception 'Meja tidak ada (jumlah meja %)', v_ntab; end if;
    v_tbl := (v_tbl::int)::text;
  end if;
  if v_new then
    if v_tbl is not null then v_clash := kul_resv_clash(p_kos, v_tbl, v_start, v_min, null); if v_clash is not null then raise exception 'Meja % sudah dipesan pada jam itu: %', v_tbl, v_clash; end if; end if;
    perform pg_advisory_xact_lock(hashtext('rsv:' || p_kos::text));
    insert into kul_reservations(id, kos_id, number, name, phone, party, table_no, starts_at, minutes, status, note, source, log)
    values (coalesce(p_id, gen_random_uuid()), p_kos, kul_resv_number(p_kos, (v_start at time zone 'Asia/Jakarta')::date), v_name, v_phone, v_party, v_tbl, v_start, v_min, 'dipesan',
            nullif(left(trim(coalesce(p->>'note', '')), 300), ''), 'kasir', kul_resv_log(null, 'Reservasi dicatat', actor_email()))
    returning * into r;
  else
    select * into r from kul_reservations where id = p_id and kos_id = p_kos for update;
    if r.status not in ('permintaan', 'dipesan') then raise exception 'Reservasi yang sudah datang/selesai/batal tidak bisa diubah'; end if;
    if v_tbl is not null and r.status = 'dipesan' then v_clash := kul_resv_clash(p_kos, v_tbl, v_start, v_min, r.id); if v_clash is not null then raise exception 'Meja % sudah dipesan pada jam itu: %', v_tbl, v_clash; end if; end if;
    update kul_reservations set name = v_name, phone = v_phone, party = v_party, table_no = v_tbl, starts_at = v_start, minutes = v_min,
      note = nullif(left(trim(coalesce(p->>'note', '')), 300), ''),
      log = kul_resv_log(log, 'Diubah: ' || to_char(v_start at time zone 'Asia/Jakarta', 'DD/MM HH24.MI') || ', ' || v_party || ' orang' || coalesce(', meja ' || v_tbl, ''), actor_email())
    where id = r.id returning * into r;
  end if;
  return to_jsonb(r) - 'portal_ip';
end $$;

-- ubah status: permintaan→dipesan/batal, dipesan→datang/batal/tidak_datang, datang→selesai
create or replace function public.kul_resv_status(p_id uuid, p_status text, p_note text, p_table text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare r kul_reservations; v_tbl text := nullif(trim(coalesce(p_table, '')), ''); v_clash text;
begin
  select * into r from kul_reservations where id = p_id for update;
  if r.id is null then raise exception 'Reservasi tidak ditemukan'; end if;
  perform kul_guard(r.kos_id);
  if not (r.status = 'permintaan' and p_status in ('dipesan', 'batal') or r.status = 'dipesan' and p_status in ('datang', 'batal', 'tidak_datang') or r.status = 'datang' and p_status = 'selesai') then
    raise exception 'Status tidak bisa diubah dari % ke %', r.status, p_status;
  end if;
  if p_status = 'batal' and length(trim(coalesce(p_note, ''))) < 3 then raise exception 'Isi alasan pembatalan'; end if;
  if v_tbl is not null then
    if v_tbl !~ '^\d{1,3}$' or v_tbl::int < 1 or v_tbl::int > kul_tables(r.kos_id) then raise exception 'Meja tidak ada'; end if;
    v_tbl := (v_tbl::int)::text;
  else v_tbl := r.table_no; end if;
  if p_status in ('dipesan', 'datang') and v_tbl is not null then
    v_clash := kul_resv_clash(r.kos_id, v_tbl, r.starts_at, r.minutes, r.id);
    if v_clash is not null and p_status = 'dipesan' then raise exception 'Meja % sudah dipesan pada jam itu: %', v_tbl, v_clash; end if;
  end if;
  update kul_reservations set status = p_status, table_no = v_tbl,
    log = kul_resv_log(log, case p_status when 'dipesan' then 'Dikonfirmasi' when 'datang' then 'Tamu datang' when 'selesai' then 'Selesai' when 'tidak_datang' then 'Tidak datang' else 'Dibatalkan' end
      || coalesce(' · meja ' || v_tbl, '') || coalesce(': ' || nullif(trim(p_note), ''), ''), actor_email())
  where id = r.id returning * into r;
  return to_jsonb(r) - 'portal_ip';
end $$;

-- Bayar gabungan untuk beberapa pesanan satu meja (bayar semua / bagi rata / per item). p_key = kunci anti dobel-ketuk.
create or replace function public.kul_table_pay(p_kos uuid, p_key uuid, p_parts jsonb, p_method text, p_label text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare x jsonb; o svc_orders; v_sum numeric := 0; v_n int := 0;
begin
  perform kul_guard(p_kos);
  if jsonb_typeof(p_parts) <> 'array' or jsonb_array_length(p_parts) = 0 or jsonb_array_length(p_parts) > 30 then raise exception 'Tidak ada yang dibayar'; end if;
  for x in select * from jsonb_array_elements(p_parts) loop
    select * into o from svc_orders where id = nullif(x->>'order_id', '')::uuid and kos_id = p_kos;
    if o.id is null then raise exception 'Pesanan tidak ditemukan'; end if;
    if coalesce((x->>'amount')::numeric, 0) <= 0 then continue; end if;
    perform svc_payment_add(md5(p_key::text || o.id::text)::uuid, o.id, round((x->>'amount')::numeric, 2), p_method, 'bayar');
    if nullif(trim(coalesce(p_label, '')), '') is not null then perform svc_event(o.id, 'bayar', left(trim(p_label), 120)); end if;
    v_sum := v_sum + round((x->>'amount')::numeric, 2); v_n := v_n + 1;
  end loop;
  if v_n = 0 then raise exception 'Tidak ada yang dibayar'; end if;
  return jsonb_build_object('paid', v_sum, 'orders', v_n);
end $$;

-- Tutup meja: serahkan semua pesanan meja ini yang sudah Siap (pendapatan diakui), tamu reservasi yang datang → selesai
create or replace function public.kul_table_close(p_kos uuid, p_table text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare o record; v_done int := 0; v_wait int := 0;
begin
  perform kul_guard(p_kos);
  for o in select id, status from svc_orders where kos_id = p_kos and dine = 'tempat' and table_no = p_table and status in ('permintaan', 'diterima', 'proses', 'siap') order by received_at loop
    if o.status = 'siap' then perform svc_order_move(o.id, 'selesai', 'Meja ' || p_table || ' ditutup'); v_done := v_done + 1; else v_wait := v_wait + 1; end if;
  end loop;
  update kul_reservations set status = 'selesai', log = kul_resv_log(log, 'Selesai (meja ditutup)', actor_email())
  where kos_id = p_kos and table_no = p_table and status = 'datang';
  return jsonb_build_object('closed', v_done, 'waiting', v_wait);
end $$;

-- Reservasi dari halaman bisnis (kunci server): masuk sebagai "permintaan", dikonfirmasi kasir
create or replace function public.public_resv_create(p_slug text, p jsonb, p_ip_hash text, p_elapsed integer)
returns jsonb language plpgsql security definer set search_path = public as $$
declare pg public_pages; k kos; v_name text := left(trim(coalesce(p->>'name', '')), 80); v_phone text := left(trim(coalesce(p->>'phone', '')), 20);
        v_party int; v_start timestamptz; r kul_reservations;
begin
  select * into pg from public_pages where slug = lower(p_slug) and enabled;
  select * into k from kos where id = pg.kos_id;
  if pg.kos_id is null or k.closed_at is not null or k.setup_status <> 'active' or k.suspended_at is not null or not module_on(k.id, 'u_halaman') or not module_on(k.id, 'u_crm')
     or coalesce(k.template_code, '') <> 'kuliner' or kul_tables(k.id) = 0 then
    return jsonb_build_object('ok', false, 'error', 'Reservasi online belum tersedia di sini. Hubungi lewat WhatsApp.');
  end if;
  if coalesce(p_elapsed, 0) < 3 then return jsonb_build_object('ok', false, 'error', 'Mohon isi formulir dengan lengkap lalu kirim lagi.'); end if;
  if (select count(*) from kul_reservations where kos_id = k.id and source = 'portal' and portal_ip = p_ip_hash and created_at > now() - interval '1 hour') >= 3
     or (select count(*) from kul_reservations where kos_id = k.id and source = 'portal' and created_at > now() - interval '1 day') >= 60 then
    return jsonb_build_object('ok', false, 'error', 'Terlalu banyak permintaan dari perangkat ini. Coba lagi nanti atau hubungi lewat WhatsApp.');
  end if;
  if not coalesce((p->>'consent')::boolean, false) then return jsonb_build_object('ok', false, 'error', 'Centang persetujuan agar kami bisa menghubungi Anda.'); end if;
  if length(v_name) < 2 then return jsonb_build_object('ok', false, 'error', 'Isi nama Anda.'); end if;
  if crm_phone(v_phone) is null then return jsonb_build_object('ok', false, 'error', 'Isi No. WhatsApp yang benar.'); end if;
  v_party := coalesce(nullif(regexp_replace(coalesce(p->>'party', ''), '\D', '', 'g'), '')::int, 0);
  if v_party < 1 or v_party > 200 then return jsonb_build_object('ok', false, 'error', 'Isi jumlah orang (1–200).'); end if;
  begin v_start := (p->>'starts_at')::timestamptz; exception when others then v_start := null; end;
  if v_start is null or v_start < now() + interval '30 minutes' or v_start > now() + interval '60 days' then
    return jsonb_build_object('ok', false, 'error', 'Pilih tanggal & jam minimal 30 menit dari sekarang (paling jauh 60 hari).');
  end if;
  perform pg_advisory_xact_lock(hashtext('rsv:' || k.id::text));
  insert into kul_reservations(kos_id, number, name, phone, party, starts_at, status, note, source, portal_ip, created_by, log)
  values (k.id, kul_resv_number(k.id, (v_start at time zone 'Asia/Jakarta')::date), v_name, v_phone, v_party, v_start, 'permintaan',
          nullif(left(trim(coalesce(p->>'note', '')), 300), ''), 'portal', p_ip_hash, null, kul_resv_log(null, 'Permintaan dari halaman bisnis', 'pelanggan (halaman bisnis)'))
  returning * into r;
  return jsonb_build_object('ok', true, 'number', r.number, 'kos_id', k.id, 'starts_at', r.starts_at, 'party', r.party);
end $$;

revoke all on function public.kul_guard(uuid), public.kul_tables(uuid), public.kul_resv_clash(uuid, text, timestamptz, int, uuid), public.kul_resv_number(uuid, date),
  public.kul_resv_save(uuid, uuid, jsonb), public.kul_resv_status(uuid, text, text, text), public.kul_table_pay(uuid, uuid, jsonb, text, text),
  public.kul_table_close(uuid, text), public.public_resv_create(text, jsonb, text, integer) from public, anon;
grant execute on function public.kul_resv_save(uuid, uuid, jsonb), public.kul_resv_status(uuid, text, text, text), public.kul_table_pay(uuid, uuid, jsonb, text, text),
  public.kul_table_close(uuid, text) to authenticated;
grant execute on function public.public_resv_create(text, jsonb, text, integer) to service_role;

-- catatan kategori Kuliner (hanya bila belum diubah Super Admin)
update public.biz_categories set note = 'Kuliner: menu & harga, pesanan makan di tempat/bungkus/antar, dapur, QR per meja, tagihan per meja & split bill, reservasi meja, bahan baku, pesan dari halaman bisnis.'
  where code = 'kuliner' and note = 'Kuliner dasar: menu & harga, pesanan makan di tempat/bungkus/antar, dapur, bahan baku, pesan dari halaman bisnis. Reservasi meja & split bill dalam rencana.';
