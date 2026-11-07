-- PRASARA · Properti & Sewa: booking / reservasi kamar dengan uang tanda jadi (DP).
-- DP = uang muka (kewajiban) sampai: check-in (pindah jadi deposit, bisa dipotong untuk tagihan pertama),
-- dikembalikan (refund), atau hangus (pendapatan lain). Kamar yang dibooking tidak bisa diisi orang lain.

create or replace function public._prasara_patch(p_sig text, p_old text, p_new text)
returns void language plpgsql as $$
declare d text;
begin
  d := pg_get_functiondef(p_sig::regprocedure);
  if position(p_old in d) = 0 then raise exception 'patch % : potongan tidak ditemukan: %', p_sig, left(p_old, 80); end if;
  execute replace(d, p_old, p_new);
end $$;

create table if not exists public.bookings (
  id uuid primary key,
  kos_id uuid not null references public.kos(id) on delete cascade,
  number text not null,
  room_id uuid not null references public.rooms(id) on delete restrict,
  name text not null check (length(trim(name)) between 2 and 80),
  phone text,
  lead_id uuid references public.crm_leads(id) on delete set null,
  occupant_id uuid references public.occupants(id) on delete set null,
  check_in date not null,
  months int check (months is null or months between 1 and 120),
  rent numeric(14,2) not null check (rent >= 0),
  expires_on date,
  dp_amount numeric(14,2) not null default 0 check (dp_amount >= 0),
  dp_date date,
  dp_account text check (dp_account in ('kas', 'bank')),
  status text not null default 'aktif' check (status in ('aktif', 'selesai', 'batal')),
  refund_amount numeric(14,2) not null default 0 check (refund_amount >= 0),
  refund_account text check (refund_account in ('kas', 'bank')),
  forfeit_amount numeric(14,2) not null default 0 check (forfeit_amount >= 0),
  lease_id uuid references public.leases(id) on delete set null,
  close_reason text,
  closed_at timestamptz,
  closed_date date,
  closed_by text,
  note text,
  created_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (kos_id, number),
  check (dp_amount = 0 or (dp_account is not null and dp_date is not null)),
  check (refund_amount + forfeit_amount <= dp_amount)
);
create index if not exists bookings_kos on public.bookings(kos_id, status, check_in);
create index if not exists bookings_room on public.bookings(room_id) where status = 'aktif';

alter table public.bookings enable row level security;
drop policy if exists bookings_select on public.bookings;
create policy bookings_select on public.bookings for select using (public.member_can(kos_id, 'rent'));
grant select on public.bookings to authenticated;
drop trigger if exists zz_kos_open_guard on public.bookings;
create trigger zz_kos_open_guard before insert or update or delete on public.bookings for each row execute function public.kos_open_guard();

-- deposit yang berasal dari DP booking (bukan uang masuk baru)
alter table public.deposits add column if not exists booking_id uuid references public.bookings(id) on delete restrict;

insert into public.modules(code, name, description, applies_to, core, depends_on, entitlement, paths, data_used, status, sort) values
  ('p_booking', 'Booking kamar', 'Pesan kamar untuk tanggal masuk tertentu dengan uang tanda jadi; check-in menjadikan DP deposit, batal bisa dikembalikan atau hangus.', '{properti}', false, '{p_kamar}', null, '{/booking}', 'Kamar, calon penghuni, uang tanda jadi', 'available', 7)
on conflict (code) do nothing;
insert into public.business_modules(kos_id, module_code, active, updated_by)
select k.id, 'p_booking', true, 'sistem' from public.kos k where k.business_type = 'properti' on conflict do nothing;

-- ================= Fungsi =================
create or replace function public.booking_number(p_kos uuid)
returns text language sql stable security definer set search_path = public as $$
  select 'BKG-' || to_char((now() at time zone 'Asia/Jakarta')::date, 'YYMMDD') || '-' ||
    lpad(((select count(*) from bookings where kos_id = p_kos and number like 'BKG-' || to_char((now() at time zone 'Asia/Jakarta')::date, 'YYMMDD') || '-%') + 1)::text, 3, '0');
$$;

-- kamar bisa dibooking untuk tanggal itu? (null = boleh, selain itu pesan penolakan)
create or replace function public.booking_room_check(p_room uuid, p_check_in date, p_except uuid)
returns text language plpgsql stable security definer set search_path = public as $$
declare r rooms; l leases; b bookings;
begin
  select * into r from rooms where id = p_room;
  if r.status = 'tidak_disewakan' then return 'Kamar ' || r.code || ' tidak disewakan'; end if;
  select * into b from bookings where room_id = p_room and status = 'aktif' and id is distinct from p_except limit 1;
  if b.id is not null then return 'Kamar ' || r.code || ' sudah dibooking ' || b.name || ' (' || b.number || ')'; end if;
  select * into l from leases where room_id = p_room and status = 'aktif';
  if l.id is not null and (l.end_date is null or l.end_date >= p_check_in) then
    return 'Kamar ' || r.code || ' masih terisi' || case when l.end_date is null then ' tanpa rencana selesai. Isi rencana selesai sewa penghuninya dulu (Penghuni › ketuk nama › Rencana selesai › ubah).' else ' sampai ' || to_char(l.end_date, 'DD-MM-YYYY') || '. Pilih tanggal masuk setelahnya.' end;
  end if;
  return null;
end $$;

create or replace function public.booking_create(p_id uuid, p_kos uuid, p jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_room uuid := (p->>'room_id')::uuid; v_in date := (p->>'check_in')::date; v_dp numeric := coalesce((p->>'dp_amount')::numeric, 0);
        v_msg text; v_no text; v_lead uuid := nullif(p->>'lead_id', '')::uuid; v_today date := (now() at time zone 'Asia/Jakarta')::date;
begin
  if p_id is null then raise exception 'ID wajib'; end if;
  if exists (select 1 from bookings where id = p_id) then return jsonb_build_object('id', p_id, 'number', (select number from bookings where id = p_id), 'duplikat', true); end if;
  if not member_in('rent', p_kos) then raise exception 'Tidak punya akses ke bisnis ini'; end if;
  if (select business_type from kos where id = p_kos) <> 'properti' then raise exception 'Booking hanya untuk bisnis Properti & Sewa'; end if;
  if not exists (select 1 from rooms where id = v_room and kos_id = p_kos) then raise exception 'Pilih kamar'; end if;
  if coalesce(length(trim(p->>'name')), 0) < 2 then raise exception 'Isi nama calon penghuni'; end if;
  if v_in is null then raise exception 'Isi tanggal masuk'; end if;
  if v_in < v_today - 7 then raise exception 'Tanggal masuk terlalu lama di belakang. Untuk penghuni yang sudah masuk, pakai Kamar › Isi kamar.'; end if;
  if not ((p->>'rent')::numeric >= 0) then raise exception 'Isi harga sewa yang disepakati'; end if;
  if v_dp < 0 then raise exception 'DP tidak valid'; end if;
  if v_dp > 0 and coalesce(p->>'dp_account', '') not in ('kas', 'bank') then raise exception 'Pilih DP masuk ke kas atau bank'; end if;
  if v_lead is not null and not exists (select 1 from crm_leads where id = v_lead and kos_id = p_kos) then v_lead := null; end if;
  perform pg_advisory_xact_lock(hashtext('booking' || v_room::text));
  v_msg := booking_room_check(v_room, v_in, null);
  if v_msg is not null then raise exception '%', v_msg; end if;
  perform pg_advisory_xact_lock(hashtext('bkgno' || p_kos::text));
  v_no := booking_number(p_kos);
  insert into bookings(id, kos_id, number, room_id, name, phone, lead_id, check_in, months, rent, expires_on, dp_amount, dp_date, dp_account, note, created_by)
  values (p_id, p_kos, v_no, v_room, trim(p->>'name'), nullif(regexp_replace(coalesce(p->>'phone', ''), '[^0-9+]', '', 'g'), ''), v_lead, v_in,
          nullif(p->>'months', '')::int, (p->>'rent')::numeric, nullif(p->>'expires_on', '')::date, v_dp,
          case when v_dp > 0 then coalesce(nullif(p->>'dp_date', '')::date, v_today) end, case when v_dp > 0 then p->>'dp_account' end,
          nullif(trim(p->>'note'), ''), actor_email());
  if v_lead is not null then
    insert into crm_activities(kos_id, lead_id, kind, body, created_email) values (p_kos, v_lead, 'catatan',
      'Booking ' || v_no || ' kamar ' || (select code from rooms where id = v_room) || ', masuk ' || to_char(v_in, 'DD-MM-YYYY') ||
      case when v_dp > 0 then ', DP ' || replace(to_char(v_dp, 'FM999,999,999'), ',', '.') else '' end, actor_email());
    update crm_leads set stage = case when stage in ('baru', 'dihubungi') then 'penawaran' else stage end, updated_at = now() where id = v_lead;
  end if;
  return jsonb_build_object('id', p_id, 'number', v_no);
end $$;

-- Ubah booking aktif (tanggal, kamar, harga, batas, catatan); DP tidak diubah di sini
create or replace function public.booking_update(p_booking uuid, p jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare b bookings; v_room uuid; v_in date; v_msg text;
begin
  select * into b from bookings where id = p_booking for update;
  if b.id is null or not member_in('rent', b.kos_id) then raise exception 'Booking tidak ditemukan'; end if;
  if b.status <> 'aktif' then raise exception 'Booking ini sudah ditutup'; end if;
  v_room := coalesce(nullif(p->>'room_id', '')::uuid, b.room_id);
  v_in := coalesce(nullif(p->>'check_in', '')::date, b.check_in);
  if not exists (select 1 from rooms where id = v_room and kos_id = b.kos_id) then raise exception 'Kamar tidak ditemukan'; end if;
  perform pg_advisory_xact_lock(hashtext('booking' || v_room::text));
  v_msg := booking_room_check(v_room, v_in, b.id);
  if v_msg is not null then raise exception '%', v_msg; end if;
  update bookings set room_id = v_room, check_in = v_in,
    name = coalesce(nullif(trim(p->>'name'), ''), name),
    phone = case when p ? 'phone' then nullif(regexp_replace(coalesce(p->>'phone', ''), '[^0-9+]', '', 'g'), '') else phone end,
    rent = coalesce(nullif(p->>'rent', '')::numeric, rent),
    months = case when p ? 'months' then nullif(p->>'months', '')::int else months end,
    expires_on = case when p ? 'expires_on' then nullif(p->>'expires_on', '')::date else expires_on end,
    note = case when p ? 'note' then nullif(trim(p->>'note'), '') else note end,
    updated_at = now()
  where id = b.id;
end $$;

-- Check-in: buat/ pilih penghuni, mulai sewa, DP → deposit (opsional langsung bayar tagihan pertama)
create or replace function public.booking_checkin(p_booking uuid, p jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare b bookings; v_occ uuid := nullif(p->>'occupant_id', '')::uuid; v_lease uuid; v_start date; v_bill date; v_end date;
        v_dep uuid := gen_random_uuid(); v_inv record; v_apply numeric := 0;
begin
  select * into b from bookings where id = p_booking for update;
  if b.id is null or not member_in('rent', b.kos_id) then raise exception 'Booking tidak ditemukan'; end if;
  if b.status <> 'aktif' then raise exception 'Booking ini sudah ditutup'; end if;
  v_start := coalesce(nullif(p->>'start', '')::date, b.check_in);
  v_bill := coalesce(nullif(p->>'billing_start', '')::date, v_start);
  v_end := coalesce(nullif(p->>'end', '')::date, case when b.months is not null then (v_start + make_interval(months => b.months) - interval '1 day')::date end);
  if v_occ is null then
    insert into occupants(kos_id, name, phone) values (b.kos_id, b.name, b.phone) returning id into v_occ;
  elsif not exists (select 1 from occupants where id = v_occ and kos_id = b.kos_id) then raise exception 'Penghuni tidak ditemukan';
  end if;
  perform set_config('prasara.booking_ok', b.id::text, true);
  v_lease := start_lease(b.room_id, v_occ, v_start, b.rent, v_bill, v_end);
  perform set_config('prasara.booking_ok', '', true);
  if b.dp_amount > 0 then
    insert into deposits(id, kos_id, lease_id, occupant_id, kind, amount, date, account, reason, booking_id, created_by)
    values (v_dep, b.kos_id, v_lease, v_occ, 'terima', b.dp_amount, (now() at time zone 'Asia/Jakarta')::date, b.dp_account, 'Dari DP booking ' || b.number, b.id, actor_email());
    if coalesce((p->>'dp_to_invoice')::boolean, false) then
      select * into v_inv from invoice_summary where lease_id = v_lease and status <> 'batal' and outstanding > 0 order by due_date limit 1;
      if v_inv.id is not null then
        v_apply := least(b.dp_amount, v_inv.outstanding);
        perform deposit_add(gen_random_uuid(), v_lease, 'potong', v_apply, (now() at time zone 'Asia/Jakarta')::date, null, 'DP booking ' || b.number, v_inv.id);
      end if;
    end if;
  end if;
  update bookings set status = 'selesai', occupant_id = v_occ, lease_id = v_lease, closed_at = now(), closed_date = (now() at time zone 'Asia/Jakarta')::date,
    closed_by = actor_email(), close_reason = 'Check-in', updated_at = now() where id = b.id;
  if b.lead_id is not null then
    update crm_leads set stage = 'jadi', closed_at = coalesce(closed_at, now()), updated_at = now() where id = b.lead_id;
    insert into crm_activities(kos_id, lead_id, kind, body, created_email) values (b.kos_id, b.lead_id, 'tahap', 'Check-in dari booking ' || b.number, actor_email());
  end if;
  return jsonb_build_object('lease_id', v_lease, 'occupant_id', v_occ, 'applied', v_apply);
end $$;

-- Batal: DP dikembalikan (sebagian/semua) dan sisanya hangus (pendapatan lain)
create or replace function public.booking_cancel(p_booking uuid, p_reason text, p_refund numeric, p_account text)
returns void language plpgsql security definer set search_path = public as $$
declare b bookings; v_ref numeric := greatest(coalesce(p_refund, 0), 0);
begin
  select * into b from bookings where id = p_booking for update;
  if b.id is null or not member_in('rent', b.kos_id) then raise exception 'Booking tidak ditemukan'; end if;
  if b.status <> 'aktif' then raise exception 'Booking ini sudah ditutup'; end if;
  if coalesce(trim(p_reason), '') = '' then raise exception 'Tulis alasan pembatalan'; end if;
  if b.dp_amount > 0 and not member_in('finance', b.kos_id) then raise exception 'Booking dengan DP hanya bisa dibatalkan pemilik/pengelola (menentukan DP dikembalikan atau hangus)'; end if;
  if v_ref > b.dp_amount then raise exception 'Pengembalian melebihi DP'; end if;
  if v_ref > 0 and coalesce(p_account, '') not in ('kas', 'bank') then raise exception 'Pilih dikembalikan dari kas atau bank'; end if;
  update bookings set status = 'batal', refund_amount = v_ref, refund_account = case when v_ref > 0 then p_account end,
    forfeit_amount = b.dp_amount - v_ref, close_reason = trim(p_reason), closed_at = now(), closed_date = (now() at time zone 'Asia/Jakarta')::date,
    closed_by = actor_email(), updated_at = now() where id = b.id;
  if b.lead_id is not null then
    insert into crm_activities(kos_id, lead_id, kind, body, created_email) values (b.kos_id, b.lead_id, 'catatan', 'Booking ' || b.number || ' dibatalkan: ' || trim(p_reason), actor_email());
  end if;
end $$;

-- Ubah rencana selesai sewa (perlu untuk booking kamar yang masih terisi)
create or replace function public.lease_set_end(p_lease uuid, p_end date)
returns void language plpgsql security definer set search_path = public as $$
declare l leases; v_inv text;
begin
  select * into l from leases where id = p_lease for update;
  if l.id is null or not member_in('rent', l.kos_id) then raise exception 'Sewa tidak ditemukan'; end if;
  if l.status <> 'aktif' then raise exception 'Sewa ini sudah berakhir'; end if;
  if p_end is not null and p_end < l.start_date then raise exception 'Rencana selesai tidak boleh sebelum tanggal masuk'; end if;
  if p_end is not null then
    select string_agg(to_char(period_start, 'DD-MM-YYYY'), ', ') into v_inv from invoices
    where lease_id = l.id and kind = 'sewa' and status <> 'batal' and period_start >= p_end;
    if v_inv is not null then raise exception 'Sudah ada tagihan sewa untuk periode mulai % (setelah tanggal itu). Batalkan tagihannya dulu di menu Tagihan.', v_inv; end if;
    if exists (select 1 from bookings where room_id = l.room_id and status = 'aktif' and check_in <= p_end) then
      raise exception 'Kamar ini sudah dibooking untuk tanggal masuk sebelum/sama dengan tanggal itu'; end if;
  elsif exists (select 1 from bookings where room_id = l.room_id and status = 'aktif') then
    raise exception 'Kamar ini sudah dibooking orang lain; rencana selesai tidak bisa dikosongkan';
  end if;
  update leases set end_date = p_end where id = l.id;
end $$;
revoke execute on function public.lease_set_end(uuid, date) from public, anon;
grant execute on function public.lease_set_end(uuid, date) to authenticated;

-- ================= Integrasi =================
-- Kamar yang dibooking tidak bisa diisi orang lain (kecuali lewat check-in booking itu)
select public._prasara_patch('public.start_lease(uuid,uuid,date,numeric,date,date)',
  '  if v_status <> ''tersedia'' then raise exception ''Kamar ini sedang tidak tersedia''; end if;',
  '  if v_status <> ''tersedia'' then raise exception ''Kamar ini sedang tidak tersedia''; end if;
  if exists (select 1 from bookings where room_id = p_room and status = ''aktif'' and id::text is distinct from nullif(current_setting(''prasara.booking_ok'', true), '''')) then
    raise exception ''Kamar ini sudah dibooking (%). Check-in lewat menu Booking, atau batalkan booking-nya dulu.'', (select name || '' · '' || number from bookings where room_id = p_room and status = ''aktif'' limit 1); end if;');

-- Deposit dari DP booking tidak bisa dibatalkan sendiri (uangnya sudah tercatat di booking)
select public._prasara_patch('public.deposit_void(uuid,text)',
  '  if x.status <> ''aktif'' then raise exception ''Catatan ini sudah dibatalkan''; end if;',
  '  if x.status <> ''aktif'' then raise exception ''Catatan ini sudah dibatalkan''; end if;
  if x.booking_id is not null then raise exception ''Deposit ini berasal dari DP booking dan tidak bisa dibatalkan. Bila perlu, kembalikan lewat tombol Kembalikan.''; end if;');

-- Pembukuan: DP booking = uang muka; refund keluar kas; hangus = pendapatan lain; deposit dari booking memindahkan uang muka
select public._prasara_patch('public.acct_desired(uuid)',
  '      (case dp.kind when ''terima'' then dp.account else ''deposit_penghuni'' end, dp.amount),',
  '      (case dp.kind when ''terima'' then case when dp.booking_id is not null then ''uang_muka'' else dp.account end else ''deposit_penghuni'' end, dp.amount),');
select public._prasara_patch('public.acct_desired(uuid)',
  '  union all
  select ''purchase_return'',',
  '  union all
  select ''booking'', bk.id, x.d, x.m || '' · '' || bk.name || '' · '' || bk.number, x.k, x.v from bookings bk
    cross join lateral (values
      (bk.dp_date, ''DP booking'', bk.dp_account, bk.dp_amount),
      (bk.dp_date, ''DP booking'', ''uang_muka'', -bk.dp_amount),
      (bk.closed_date, ''Pengembalian DP booking'', ''uang_muka'', bk.refund_amount),
      (bk.closed_date, ''Pengembalian DP booking'', bk.refund_account, -bk.refund_amount),
      (bk.closed_date, ''DP booking hangus'', ''uang_muka'', bk.forfeit_amount),
      (bk.closed_date, ''DP booking hangus'', ''pendapatan_lain'', -bk.forfeit_amount)) x(d, m, k, v)
    where bk.kos_id = p_kos and bk.dp_amount > 0 and x.v <> 0 and x.k is not null
  union all
  select ''purchase_return'',');

-- Halaman publik & portal: kamar yang sudah dibooking tidak ditawarkan
select public._prasara_patch('public.public_page_view(text)',
  'from rooms r where r.kos_id = k.id and r.status = ''tersedia'') end);',
  'from rooms r where r.kos_id = k.id and r.status = ''tersedia'' and not exists (select 1 from bookings bk where bk.room_id = r.id and bk.status = ''aktif'')) end);');
select public._prasara_patch('public.portal_get(text)',
  'select r.code, r.rent, r.facilities from rooms r where r.kos_id = k.id and r.status = ''tersedia'') z)',
  'select r.code, r.rent, r.facilities from rooms r where r.kos_id = k.id and r.status = ''tersedia'' and not exists (select 1 from bookings bk where bk.room_id = r.id and bk.status = ''aktif'')) z)');

-- Tutup bisnis: booking aktif harus diselesaikan (check-in atau batal)
select public._prasara_patch('public.business_close_check(uuid)',
  '  select count(*) into n from maint_tickets where kos_id = p_kos and status in (''baru'', ''dikerjakan'', ''menunggu'');',
  '  select count(*), coalesce(sum(dp_amount), 0) into n, v from bookings where kos_id = p_kos and status = ''aktif'';
  if n > 0 then b := b || jsonb_build_object(''label'', format(''%s booking kamar masih aktif (DP Rp %s). Check-in atau batalkan dulu.'', n, replace(to_char(v, ''FM999,999,999,999''), '','', ''.'')), ''href'', ''/booking''); end if;
  select count(*) into n from maint_tickets where kos_id = p_kos and status in (''baru'', ''dikerjakan'', ''menunggu'');');

-- Ringkasan pemilik: check-in booking hari ini / lewat
select public._prasara_patch('public.owner_overview2(date)',
  '        || coalesce((select jsonb_agg(jsonb_build_object(''text'', n || '' perbaikan prioritas tinggi belum selesai''',
  '        || coalesce((select jsonb_agg(jsonb_build_object(''text'', n || '' booking jadwal masuk hari ini/terlewat'', ''href'', ''/booking'', ''tone'', ''gold'')) from (select count(*) n from bookings where kos_id = k.id and status = ''aktif'' and check_in <= (now() at time zone ''Asia/Jakarta'')::date) z where n > 0), ''[]'')
        || coalesce((select jsonb_agg(jsonb_build_object(''text'', n || '' perbaikan prioritas tinggi belum selesai''');

-- Unduh semua data
select public._prasara_patch('public.business_export_sheets(uuid)',
  '    s := s || xs(''Keluhan & perbaikan'',',
  '    s := s || xs(''Booking'', array[''Nomor'', ''Dibuat'', ''Kamar'', ''Nama'', ''No. HP'', ''Tanggal masuk'', ''Sewa'', ''DP'', ''Tanggal DP'', ''Akun DP'', ''Status'', ''Dikembalikan'', ''Hangus'', ''Alasan/keterangan'', ''Oleh''],
      array[''t'', ''t'', ''t'', ''t'', ''t'', ''d'', ''r'', ''r'', ''d'', ''t'', ''t'', ''r'', ''r'', ''t'', ''t''],
      (select jsonb_agg(jsonb_build_array(bk.number, xs_time(bk.created_at), r.code, bk.name, bk.phone, bk.check_in, bk.rent, bk.dp_amount, bk.dp_date, bk.dp_account, bk.status, bk.refund_amount, bk.forfeit_amount, coalesce(bk.close_reason, bk.note), bk.created_by) order by bk.created_at)
       from bookings bk join rooms r on r.id = bk.room_id where bk.kos_id = p_kos));
    s := s || xs(''Keluhan & perbaikan'',');

select public._prasara_patch('public.admin_customers()',
  '(select max(created_at) from meter_readings where kos_id = k.id),',
  '(select max(created_at) from meter_readings where kos_id = k.id), (select max(created_at) from bookings where kos_id = k.id),');

revoke execute on function public.booking_number(uuid), public.booking_room_check(uuid, date, uuid) from public, anon, authenticated;
revoke execute on function public.booking_create(uuid, uuid, jsonb), public.booking_update(uuid, jsonb), public.booking_checkin(uuid, jsonb), public.booking_cancel(uuid, text, numeric, text) from public, anon;
grant execute on function public.booking_create(uuid, uuid, jsonb), public.booking_update(uuid, jsonb), public.booking_checkin(uuid, jsonb), public.booking_cancel(uuid, text, numeric, text) to authenticated;

drop function public._prasara_patch(text, text, text);
