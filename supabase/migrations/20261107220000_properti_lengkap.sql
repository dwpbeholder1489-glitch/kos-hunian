-- PRASARA · Properti & Sewa lengkap (tahap 1): deposit/jaminan penghuni, keluhan & perbaikan, meteran listrik/air.
-- Standar kelengkapan setara (blueprint bagian 5.2 & 6): Deposits, Maintenance, Complaints, Utilities.

create or replace function public._prasara_patch(p_sig text, p_old text, p_new text)
returns void language plpgsql as $$
declare d text;
begin
  d := pg_get_functiondef(p_sig::regprocedure);
  if position(p_old in d) = 0 then raise exception 'patch % : potongan tidak ditemukan: %', p_sig, left(p_old, 80); end if;
  execute replace(d, p_old, p_new);
end $$;

-- ================= Tabel =================
-- Deposit (uang jaminan) per sewa. Saldo = terima − kembali − potong (yang aktif).
create table if not exists public.deposits (
  id uuid primary key,
  kos_id uuid not null references public.kos(id) on delete cascade,
  lease_id uuid not null references public.leases(id) on delete restrict,
  occupant_id uuid not null references public.occupants(id) on delete restrict,
  kind text not null check (kind in ('terima', 'kembali', 'potong')),
  amount numeric(14,2) not null check (amount > 0),
  date date not null default (now() at time zone 'Asia/Jakarta')::date,
  account text check (account in ('kas', 'bank')),
  reason text,
  invoice_id uuid references public.invoices(id) on delete restrict,
  payment_id uuid references public.payments(id) on delete restrict,
  status text not null default 'aktif' check (status in ('aktif', 'batal')),
  void_reason text,
  voided_at timestamptz,
  voided_by text,
  created_by text,
  created_at timestamptz not null default now(),
  check (kind = 'potong' or account is not null)
);
create index if not exists deposits_lease on public.deposits(lease_id);
create index if not exists deposits_kos on public.deposits(kos_id, date);

-- Keluhan & perbaikan (dari pengelola atau penghuni lewat portal)
create table if not exists public.maint_tickets (
  id uuid primary key,
  kos_id uuid not null references public.kos(id) on delete cascade,
  number text not null,
  room_id uuid references public.rooms(id) on delete set null,
  occupant_id uuid references public.occupants(id) on delete set null,
  category text not null default 'lainnya' check (category in ('listrik', 'air', 'bangunan', 'perabot', 'kebersihan', 'internet', 'keamanan', 'lainnya')),
  title text not null check (length(title) between 2 and 120),
  detail text check (detail is null or length(detail) <= 1000),
  priority text not null default 'sedang' check (priority in ('rendah', 'sedang', 'tinggi')),
  status text not null default 'baru' check (status in ('baru', 'dikerjakan', 'menunggu', 'selesai', 'batal')),
  source text not null default 'pengelola' check (source in ('pengelola', 'penghuni')),
  assigned_to text,
  room_blocked boolean not null default false,
  cost numeric(14,2) not null default 0 check (cost >= 0),
  expense_id uuid references public.expenses(id) on delete set null,
  resolution text,
  resolved_at timestamptz,
  created_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (kos_id, number)
);
create index if not exists maint_tickets_kos on public.maint_tickets(kos_id, status, created_at desc);

create table if not exists public.maint_events (
  id bigserial primary key,
  kos_id uuid not null references public.kos(id) on delete cascade,
  ticket_id uuid not null references public.maint_tickets(id) on delete cascade,
  kind text not null,
  text text not null,
  actor text,
  created_at timestamptz not null default now()
);
create index if not exists maint_events_ticket on public.maint_events(ticket_id, created_at);

-- Meteran: jenis (listrik/air) dengan tarif, dan catatan angka meter per kamar per bulan
create table if not exists public.utility_types (
  id uuid primary key default gen_random_uuid(),
  kos_id uuid not null references public.kos(id) on delete cascade,
  name text not null check (length(name) between 2 and 40),
  unit text not null default 'kWh' check (length(unit) between 1 and 12),
  price numeric(14,2) not null check (price >= 0),
  min_charge numeric(14,2) not null default 0 check (min_charge >= 0),
  active boolean not null default true,
  sort int not null default 0,
  created_at timestamptz not null default now(),
  unique (kos_id, name)
);

create table if not exists public.meter_readings (
  id uuid primary key default gen_random_uuid(),
  kos_id uuid not null references public.kos(id) on delete cascade,
  room_id uuid not null references public.rooms(id) on delete restrict,
  type_id uuid not null references public.utility_types(id) on delete restrict,
  period date not null check (extract(day from period) = 1),
  reading numeric(14,3) not null check (reading >= 0),
  prev_reading numeric(14,3),
  usage numeric(14,3),
  price numeric(14,2),
  amount numeric(14,2) not null default 0,
  lease_id uuid references public.leases(id) on delete set null,
  invoice_id uuid references public.invoices(id) on delete set null,
  note text,
  status text not null default 'aktif' check (status in ('aktif', 'batal')),
  void_reason text,
  created_by text,
  created_at timestamptz not null default now()
);
create unique index if not exists meter_one_per_period on public.meter_readings(room_id, type_id, period) where status = 'aktif';
create index if not exists meter_kos on public.meter_readings(kos_id, period);

-- RLS: baca untuk anggota bagian sewa; tulis hanya lewat fungsi
alter table public.deposits enable row level security;
alter table public.maint_tickets enable row level security;
alter table public.maint_events enable row level security;
alter table public.utility_types enable row level security;
alter table public.meter_readings enable row level security;
do $$ declare t text; begin
  foreach t in array array['deposits', 'maint_tickets', 'maint_events', 'utility_types', 'meter_readings'] loop
    execute format('drop policy if exists %I on public.%I', t || '_select', t);
    execute format('create policy %I on public.%I for select using (public.member_can(kos_id, %L))', t || '_select', t, 'rent');
    execute format('grant select on public.%I to authenticated', t);
    execute format('drop trigger if exists zz_kos_open_guard on public.%I', t);
    execute format('create trigger zz_kos_open_guard before insert or update or delete on public.%I for each row execute function public.kos_open_guard()', t);
  end loop;
end $$;

-- ================= Modul =================
insert into public.modules(code, name, description, applies_to, core, depends_on, entitlement, paths, data_used, status, sort) values
  ('p_perbaikan', 'Keluhan & perbaikan', 'Catat keluhan/kerusakan per kamar, tugaskan, tandai selesai, biaya perbaikan masuk pengeluaran. Penghuni bisa melapor lewat portal.', '{properti}', false, '{p_kamar}', null, '{/perbaikan}', 'Kamar, penghuni, keluhan, biaya', 'available', 8),
  ('p_meteran', 'Meteran listrik & air', 'Catat angka meter per kamar tiap bulan; pemakaian × tarif otomatis jadi tagihan tambahan.', '{properti}', false, '{p_tagihan}', null, '{/meteran}', 'Kamar, angka meter, tagihan', 'available', 9)
on conflict (code) do nothing;
-- bisnis kos yang sudah ada: modul baru langsung aktif (bisa dimatikan di Pusat konfigurasi)
insert into public.business_modules(kos_id, module_code, active, updated_by)
select k.id, m.code, true, 'sistem' from public.kos k join public.modules m on m.code in ('p_perbaikan', 'p_meteran')
where k.business_type = 'properti' on conflict do nothing;

-- ================= Deposit =================
alter table public.payments drop constraint if exists payments_method_check;
alter table public.payments add constraint payments_method_check check (method in ('tunai', 'transfer', 'ewallet', 'lainnya', 'deposit'));

create or replace function public.deposit_balance(p_lease uuid)
returns numeric language sql stable security definer set search_path = public as $$
  select coalesce(sum(case when kind = 'terima' then amount else -amount end), 0) from deposits where lease_id = p_lease and status = 'aktif';
$$;

-- Pembayaran "dari deposit" hanya boleh dibuat lewat fungsi deposit; membatalkannya ikut membatalkan potongan deposit
create or replace function public.payments_deposit_guard()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'DELETE' then
    if old.method = 'deposit' then raise exception 'Pembayaran dari deposit tidak bisa dihapus. Batalkan lewat Penghuni › Deposit.'; end if;
    return old;
  end if;
  if coalesce(current_setting('prasara.deposit_ok', true), '') <> '1' then
    if tg_op = 'INSERT' and new.method = 'deposit' then raise exception 'Bayar dari deposit lewat Penghuni › Deposit › Potong untuk tagihan'; end if;
    if tg_op = 'UPDATE' and (new.method = 'deposit') <> (old.method = 'deposit') then raise exception 'Cara bayar deposit tidak bisa diubah'; end if;
    if tg_op = 'UPDATE' and old.method = 'deposit' and (new.amount <> old.amount or new.invoice_id <> old.invoice_id) then raise exception 'Pembayaran dari deposit tidak bisa diubah. Batalkan lalu catat ulang.'; end if;
  end if;
  if tg_op = 'UPDATE' and old.method = 'deposit' and old.status = 'terverifikasi' and new.status in ('dibatalkan', 'ditolak') then
    update deposits set status = 'batal', void_reason = coalesce(void_reason, 'Pembayaran tagihannya dibatalkan'), voided_at = coalesce(voided_at, now()), voided_by = coalesce(voided_by, actor_email())
    where payment_id = new.id and status = 'aktif';
  end if;
  return new;
end $$;
drop trigger if exists payments_deposit_guard on public.payments;
create trigger payments_deposit_guard before insert or update or delete on public.payments for each row execute function public.payments_deposit_guard();

create or replace function public.deposit_add(p_id uuid, p_lease uuid, p_kind text, p_amount numeric, p_date date, p_account text, p_reason text, p_invoice uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare l leases; v_bal numeric; s record; v_pay uuid; v_date date := coalesce(p_date, (now() at time zone 'Asia/Jakarta')::date);
begin
  if p_id is null then raise exception 'ID wajib'; end if;
  if exists (select 1 from deposits where id = p_id) then
    select * into l from leases where id = (select lease_id from deposits where id = p_id);
    return jsonb_build_object('id', p_id, 'balance', deposit_balance(l.id), 'duplikat', true);
  end if;
  select * into l from leases where id = p_lease for update;
  if l.id is null or not member_in('rent', l.kos_id) then raise exception 'Sewa tidak ditemukan'; end if;
  if (select business_type from kos where id = l.kos_id) <> 'properti' then raise exception 'Deposit hanya untuk bisnis Properti & Sewa'; end if;
  if p_kind not in ('terima', 'kembali', 'potong') then raise exception 'Jenis deposit tidak dikenal'; end if;
  if not (p_amount > 0) then raise exception 'Isi jumlah'; end if;
  if v_date > (now() at time zone 'Asia/Jakarta')::date then raise exception 'Tanggal tidak boleh di masa depan'; end if;
  -- uang keluar (dikembalikan) & potongan non-tagihan: hanya pemilik/pengelola
  if (p_kind = 'kembali' or (p_kind = 'potong' and p_invoice is null)) and not member_in('finance', l.kos_id) then
    raise exception 'Mengembalikan atau memotong deposit hanya oleh pemilik/pengelola'; end if;
  if p_kind in ('terima', 'kembali') and coalesce(p_account, '') not in ('kas', 'bank') then raise exception 'Pilih kas atau bank'; end if;
  v_bal := deposit_balance(l.id);
  if p_kind in ('kembali', 'potong') and p_amount > v_bal then
    raise exception 'Melebihi saldo deposit (Rp %)', replace(to_char(v_bal, 'FM999,999,999,999'), ',', '.'); end if;
  if p_kind = 'potong' and p_invoice is null and coalesce(trim(p_reason), '') = '' then raise exception 'Tulis alasan potongan (mis. kerusakan kunci)'; end if;
  if p_kind = 'potong' and p_invoice is not null then
    select * into s from invoice_summary where id = p_invoice;
    if s.id is null or s.occupant_id <> l.occupant_id or s.kos_id <> l.kos_id or s.status = 'batal' then raise exception 'Tagihan tidak ditemukan'; end if;
    if p_amount > s.outstanding then raise exception 'Melebihi sisa tagihan'; end if;
    perform set_config('prasara.deposit_ok', '1', true);
    insert into payments(kos_id, invoice_id, amount, paid_at, method, notes, status, verified_at, source)
    values (l.kos_id, p_invoice, p_amount, v_date, 'deposit', 'Dipotong dari deposit', 'terverifikasi', now(), 'pengelola') returning id into v_pay;
    perform set_config('prasara.deposit_ok', '', true);
  end if;
  insert into deposits(id, kos_id, lease_id, occupant_id, kind, amount, date, account, reason, invoice_id, payment_id, created_by)
  values (p_id, l.kos_id, l.id, l.occupant_id, p_kind, p_amount, v_date, case when p_kind = 'potong' then null else p_account end,
          nullif(trim(p_reason), ''), case when p_kind = 'potong' then p_invoice end, v_pay, actor_email());
  return jsonb_build_object('id', p_id, 'balance', deposit_balance(l.id), 'payment_id', v_pay);
end $$;

create or replace function public.deposit_void(p_id uuid, p_reason text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare x deposits; v_after numeric;
begin
  select * into x from deposits where id = p_id for update;
  if x.id is null or not member_in('finance', x.kos_id) then raise exception 'Hanya pemilik/pengelola yang bisa membatalkan catatan deposit'; end if;
  if x.status <> 'aktif' then raise exception 'Catatan ini sudah dibatalkan'; end if;
  if coalesce(trim(p_reason), '') = '' then raise exception 'Tulis alasan pembatalan'; end if;
  if x.kind = 'terima' then
    v_after := deposit_balance(x.lease_id) - x.amount;
    if v_after < 0 then raise exception 'Deposit ini sudah dipakai/dikembalikan. Batalkan catatan pengembalian/potongannya dulu.'; end if;
  end if;
  update deposits set status = 'batal', void_reason = trim(p_reason), voided_at = now(), voided_by = actor_email() where id = x.id;
  if x.payment_id is not null then
    perform set_config('prasara.deposit_ok', '1', true);
    update payments set status = 'dibatalkan', notes = coalesce(notes, '') || ' · dibatalkan: ' || trim(p_reason) where id = x.payment_id and status = 'terverifikasi';
    perform set_config('prasara.deposit_ok', '', true);
  end if;
  return jsonb_build_object('balance', deposit_balance(x.lease_id));
end $$;

-- ================= Keluhan & perbaikan =================
create or replace function public.maint_event(p_ticket uuid, p_kind text, p_text text, p_actor text default null)
returns void language sql security definer set search_path = public as $$
  insert into maint_events(kos_id, ticket_id, kind, text, actor) select kos_id, id, p_kind, p_text, coalesce(p_actor, actor_email(), 'sistem') from maint_tickets where id = p_ticket;
$$;

create or replace function public.maint_number(p_kos uuid)
returns text language sql stable security definer set search_path = public as $$
  select 'KLH-' || to_char((now() at time zone 'Asia/Jakarta')::date, 'YYMMDD') || '-' ||
    lpad(((select count(*) from maint_tickets where kos_id = p_kos and number like 'KLH-' || to_char((now() at time zone 'Asia/Jakarta')::date, 'YYMMDD') || '-%') + 1)::text, 3, '0');
$$;

create or replace function public.maint_create(p_id uuid, p_kos uuid, p jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_room uuid := nullif(p->>'room_id', '')::uuid; v_occ uuid; r rooms; v_no text; v_block boolean := coalesce((p->>'room_blocked')::boolean, false);
begin
  if p_id is null then raise exception 'ID wajib'; end if;
  if exists (select 1 from maint_tickets where id = p_id) then return jsonb_build_object('id', p_id, 'number', (select number from maint_tickets where id = p_id), 'duplikat', true); end if;
  if not member_in('rent', p_kos) then raise exception 'Tidak punya akses ke bisnis ini'; end if;
  if (select business_type from kos where id = p_kos) <> 'properti' then raise exception 'Menu ini untuk bisnis Properti & Sewa'; end if;
  if coalesce(length(trim(p->>'title')), 0) < 2 then raise exception 'Tulis keluhan/kerusakannya'; end if;
  if v_room is not null then
    select * into r from rooms where id = v_room and kos_id = p_kos;
    if r.id is null then raise exception 'Kamar tidak ditemukan'; end if;
    select occupant_id into v_occ from leases where room_id = r.id and status = 'aktif';
  end if;
  perform pg_advisory_xact_lock(hashtext('maint' || p_kos::text));
  v_no := maint_number(p_kos);
  insert into maint_tickets(id, kos_id, number, room_id, occupant_id, category, title, detail, priority, source, assigned_to, room_blocked, created_by)
  values (p_id, p_kos, v_no, v_room, v_occ, coalesce(nullif(p->>'category', ''), 'lainnya'), trim(p->>'title'), nullif(trim(p->>'detail'), ''),
          coalesce(nullif(p->>'priority', ''), 'sedang'), 'pengelola', nullif(trim(p->>'assigned_to'), ''), v_block and r.id is not null and r.status = 'tersedia', actor_email());
  if v_block and r.id is not null and r.status = 'tersedia' then
    update rooms set status = 'perbaikan' where id = r.id;
    perform maint_event(p_id, 'kamar', 'Kamar ' || r.code || ' ditandai Perbaikan (tidak bisa diisi sementara)');
  end if;
  perform maint_event(p_id, 'dibuat', 'Keluhan dicatat: ' || trim(p->>'title'));
  return jsonb_build_object('id', p_id, 'number', v_no);
end $$;

-- Ubah status/penanggung jawab/prioritas + catatan
create or replace function public.maint_update(p_ticket uuid, p jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare t maint_tickets; v_status text := nullif(p->>'status', ''); v_note text := nullif(trim(p->>'note'), '');
begin
  select * into t from maint_tickets where id = p_ticket for update;
  if t.id is null or not member_in('rent', t.kos_id) then raise exception 'Keluhan tidak ditemukan'; end if;
  if v_status is not null and v_status not in ('baru', 'dikerjakan', 'menunggu', 'batal') then raise exception 'Gunakan tombol Selesai untuk menutup keluhan'; end if;
  if t.status in ('selesai', 'batal') and v_status is not null and v_status <> 'dikerjakan' then raise exception 'Keluhan ini sudah ditutup. Buka kembali dengan status Dikerjakan.'; end if;
  if v_status = 'batal' and v_note is null then raise exception 'Tulis alasan pembatalan'; end if;
  if v_status = 'dikerjakan' and t.status in ('selesai', 'batal') and v_note is null then raise exception 'Tulis alasan membuka kembali'; end if;
  update maint_tickets set
    status = coalesce(v_status, status),
    priority = coalesce(nullif(p->>'priority', ''), priority),
    assigned_to = case when p ? 'assigned_to' then nullif(trim(p->>'assigned_to'), '') else assigned_to end,
    resolved_at = case when v_status = 'batal' then now() when v_status is not null then null else resolved_at end,
    updated_at = now()
  where id = t.id;
  if v_status is not null and v_status <> t.status then
    perform maint_event(t.id, 'status', 'Status: ' || v_status || coalesce(' · ' || v_note, ''));
  elsif v_note is not null then
    perform maint_event(t.id, 'catatan', v_note);
  end if;
  if p ? 'assigned_to' and nullif(trim(p->>'assigned_to'), '') is distinct from t.assigned_to then
    perform maint_event(t.id, 'tugas', 'Ditangani: ' || coalesce(nullif(trim(p->>'assigned_to'), ''), '—'));
  end if;
  if nullif(p->>'priority', '') is not null and p->>'priority' <> t.priority then perform maint_event(t.id, 'prioritas', 'Prioritas: ' || (p->>'priority')); end if;
  -- kamar yang ditutup sementara dibuka lagi bila keluhan dibatalkan
  if v_status = 'batal' and t.room_blocked then
    update rooms set status = 'tersedia' where id = t.room_id and status = 'perbaikan' and not exists (select 1 from leases where room_id = t.room_id and status = 'aktif')
      and not exists (select 1 from maint_tickets o where o.room_id = t.room_id and o.id <> t.id and o.room_blocked and o.status not in ('selesai', 'batal'));
  end if;
  return jsonb_build_object('status', coalesce(v_status, t.status));
end $$;

-- Selesai: penyelesaian wajib; biaya opsional dicatat sebagai pengeluaran (pemilik/pengelola)
create or replace function public.maint_finish(p_ticket uuid, p_resolution text, p_cost numeric, p_record_expense boolean, p_account text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare t maint_tickets; v_cat uuid; v_exp uuid; v_code text; v_cost numeric := greatest(coalesce(p_cost, 0), 0);
begin
  select * into t from maint_tickets where id = p_ticket for update;
  if t.id is null or not member_in('rent', t.kos_id) then raise exception 'Keluhan tidak ditemukan'; end if;
  if t.status in ('selesai', 'batal') then raise exception 'Keluhan ini sudah ditutup'; end if;
  if coalesce(length(trim(p_resolution)), 0) < 2 then raise exception 'Tulis apa yang sudah dikerjakan'; end if;
  if p_record_expense and v_cost > 0 then
    if not member_in('finance', t.kos_id) then raise exception 'Mencatat biaya ke pengeluaran hanya oleh pemilik/pengelola. Simpan tanpa mencatat biaya, lalu minta pemilik mencatatnya.'; end if;
    if coalesce(p_account, '') not in ('kas', 'bank') then raise exception 'Pilih dibayar dari kas atau bank'; end if;
    select id into v_cat from expense_categories where kos_id = t.kos_id and lower(name) = 'perbaikan';
    if v_cat is null then insert into expense_categories(kos_id, name, kind) values (t.kos_id, 'Perbaikan', 'operasional') returning id into v_cat; end if;
    select code into v_code from rooms where id = t.room_id;
    insert into expenses(kos_id, date, category_id, kind, amount, description, account)
    values (t.kos_id, (now() at time zone 'Asia/Jakarta')::date, v_cat, 'operasional', v_cost, 'Perbaikan ' || t.number || coalesce(' · kamar ' || v_code, '') || ' · ' || t.title, p_account)
    returning id into v_exp;
  end if;
  update maint_tickets set status = 'selesai', resolution = trim(p_resolution), cost = v_cost, expense_id = coalesce(v_exp, expense_id), resolved_at = now(), updated_at = now() where id = t.id;
  perform maint_event(t.id, 'selesai', 'Selesai: ' || trim(p_resolution) || case when v_cost > 0 then ' · biaya ' || replace(to_char(v_cost, 'FM999,999,999'), ',', '.') || case when v_exp is not null then ' (tercatat di Pengeluaran)' else ' (belum dicatat di Pengeluaran)' end else '' end);
  if t.room_blocked then
    update rooms set status = 'tersedia' where id = t.room_id and status = 'perbaikan' and not exists (select 1 from leases where room_id = t.room_id and status = 'aktif')
      and not exists (select 1 from maint_tickets o where o.room_id = t.room_id and o.id <> t.id and o.room_blocked and o.status not in ('selesai', 'batal'));
  end if;
  return jsonb_build_object('expense_id', v_exp);
end $$;

-- Penghuni melapor lewat portal (tanpa login; dibatasi agar tidak disalahgunakan)
create or replace function public.portal_report_issue(p_token text, p_category text, p_title text, p_detail text)
returns text language plpgsql security definer set search_path = public as $$
declare o occupants; l leases; k kos; v_id uuid := gen_random_uuid(); v_no text;
begin
  select * into o from occupants where portal_token = p_token and length(p_token) >= 20;
  if o.id is null then raise exception 'Link tidak valid'; end if;
  select * into k from kos where id = o.kos_id;
  if k.closed_at is not null then raise exception 'Kos ini tidak lagi menerima laporan'; end if;
  if not (plan_has(k.id, 'portal_penghuni') and module_on(k.id, 'p_portal') and module_on(k.id, 'p_perbaikan')) then raise exception 'Laporan keluhan belum diaktifkan pengelola'; end if;
  select * into l from leases where occupant_id = o.id and status = 'aktif';
  if l.id is null then raise exception 'Hanya penghuni aktif yang bisa melapor'; end if;
  if coalesce(length(trim(p_title)), 0) < 3 then raise exception 'Tulis keluhannya (minimal 3 huruf)'; end if;
  if length(p_title) > 120 or length(coalesce(p_detail, '')) > 1000 then raise exception 'Tulisan terlalu panjang'; end if;
  if (select count(*) from maint_tickets where occupant_id = o.id and source = 'penghuni' and status in ('baru', 'dikerjakan', 'menunggu')) >= 3 then
    raise exception 'Masih ada 3 laporan Anda yang belum selesai. Tunggu ditangani dulu ya.'; end if;
  if (select count(*) from maint_tickets where occupant_id = o.id and source = 'penghuni' and created_at > now() - interval '1 day') >= 5 then
    raise exception 'Terlalu banyak laporan hari ini. Hubungi pengelola lewat WhatsApp.'; end if;
  perform pg_advisory_xact_lock(hashtext('maint' || k.id::text));
  v_no := maint_number(k.id);
  insert into maint_tickets(id, kos_id, number, room_id, occupant_id, category, title, detail, priority, source, created_by)
  values (v_id, k.id, v_no, l.room_id, o.id, case when p_category in ('listrik', 'air', 'bangunan', 'perabot', 'kebersihan', 'internet', 'keamanan') then p_category else 'lainnya' end,
          trim(p_title), nullif(trim(p_detail), ''), 'sedang', 'penghuni', 'penghuni: ' || o.name);
  perform maint_event(v_id, 'dibuat', 'Dilaporkan penghuni lewat portal: ' || trim(p_title), 'penghuni: ' || o.name);
  return v_no;
end $$;

-- ================= Meteran listrik & air =================
create or replace function public.utility_type_save(p_kos uuid, p_id uuid, p jsonb)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid := p_id; v_old jsonb;
begin
  if not member_in('settings', p_kos) then raise exception 'Hanya pemilik/pengelola yang bisa mengatur tarif'; end if;
  if (select business_type from kos where id = p_kos) <> 'properti' then raise exception 'Menu ini untuk bisnis Properti & Sewa'; end if;
  if coalesce(length(trim(p->>'name')), 0) < 2 then raise exception 'Isi nama (mis. Listrik)'; end if;
  if not ((p->>'price')::numeric >= 0) then raise exception 'Isi tarif per satuan'; end if;
  if v_id is null then
    insert into utility_types(kos_id, name, unit, price, min_charge, active, sort)
    values (p_kos, trim(p->>'name'), coalesce(nullif(trim(p->>'unit'), ''), 'kWh'), (p->>'price')::numeric, greatest(coalesce((p->>'min_charge')::numeric, 0), 0), true,
            (select coalesce(max(sort), 0) + 1 from utility_types where kos_id = p_kos)) returning id into v_id;
  else
    select to_jsonb(u) into v_old from utility_types u where id = v_id and kos_id = p_kos;
    if v_old is null then raise exception 'Jenis meteran tidak ditemukan'; end if;
    update utility_types set name = trim(p->>'name'), unit = coalesce(nullif(trim(p->>'unit'), ''), unit), price = (p->>'price')::numeric,
      min_charge = greatest(coalesce((p->>'min_charge')::numeric, 0), 0), active = coalesce((p->>'active')::boolean, active) where id = v_id;
  end if;
  perform config_log(p_kos, 'ubah_tarif_meteran', trim(p->>'name'), v_old, p, null, 'rendah', actor_email());
  return v_id;
end $$;

-- Catat angka meter beberapa kamar sekaligus; pemakaian × tarif → tagihan tambahan untuk penghuni aktif
create or replace function public.meter_record(p_kos uuid, p_type uuid, p_period date, p_due date, p_rows jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare u utility_types; x jsonb; r rooms; v_prev numeric; v_read numeric; v_use numeric; v_amt numeric; l leases; v_inv uuid; v_id uuid;
        v_per date := date_trunc('month', p_period)::date; v_end date; out jsonb := '[]'; n_bill int := 0; v_total numeric := 0;
        v_bln text;
begin
  if not member_in('rent', p_kos) then raise exception 'Tidak punya akses ke bisnis ini'; end if;
  select * into u from utility_types where id = p_type and kos_id = p_kos;
  if u.id is null or not u.active then raise exception 'Jenis meteran tidak ditemukan'; end if;
  if p_due is null then raise exception 'Isi tanggal jatuh tempo tagihan'; end if;
  if jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) = 0 then raise exception 'Isi angka meter minimal satu kamar'; end if;
  v_end := (v_per + interval '1 month - 1 day')::date;
  v_bln := (array['Januari','Februari','Maret','April','Mei','Juni','Juli','Agustus','September','Oktober','November','Desember'])[extract(month from v_per)::int] || ' ' || extract(year from v_per)::int;
  perform pg_advisory_xact_lock(hashtext('meter' || p_kos::text));
  for x in select * from jsonb_array_elements(p_rows) loop
    select * into r from rooms where id = (x->>'room_id')::uuid and kos_id = p_kos;
    if r.id is null then raise exception 'Kamar tidak ditemukan'; end if;
    v_read := (x->>'reading')::numeric;
    if v_read is null or v_read < 0 then raise exception 'Angka meter kamar % tidak valid', r.code; end if;
    if exists (select 1 from meter_readings where room_id = r.id and type_id = u.id and period = v_per and status = 'aktif') then
      raise exception 'Meter % kamar % untuk % sudah dicatat. Batalkan catatan lama dulu bila ingin mengganti.', u.name, r.code, v_bln; end if;
    select reading into v_prev from meter_readings where room_id = r.id and type_id = u.id and status = 'aktif' and period < v_per order by period desc limit 1;
    if exists (select 1 from meter_readings where room_id = r.id and type_id = u.id and status = 'aktif' and period > v_per) then
      raise exception 'Kamar % sudah punya catatan bulan setelah %', r.code, v_bln; end if;
    if v_prev is not null and v_read < v_prev and not coalesce((x->>'reset')::boolean, false) then
      raise exception 'Angka meter kamar % (%) lebih kecil dari bulan lalu (%). Bila meteran diganti, centang "Meteran baru".', r.code, v_read, v_prev; end if;
    v_use := case when v_prev is null or coalesce((x->>'reset')::boolean, false) then null else v_read - v_prev end;
    v_amt := case when v_use is null then 0 else round(greatest(v_use * u.price, u.min_charge)) end;
    select * into l from leases where room_id = r.id and status = 'aktif';
    v_inv := null;
    if v_amt > 0 and l.id is not null then
      insert into invoices(kos_id, lease_id, room_id, occupant_id, kind, period_start, period_end, due_date, amount, description)
      values (p_kos, l.id, r.id, l.occupant_id, 'tambahan', v_per, v_end, greatest(p_due, v_per), v_amt,
              u.name || ' ' || v_bln || ': ' || trim(to_char(v_prev, 'FM999999990.###')) || ' → ' || trim(to_char(v_read, 'FM999999990.###')) || ' = ' ||
              trim(to_char(v_use, 'FM999999990.###')) || ' ' || u.unit || ' × Rp' || replace(to_char(u.price, 'FM999,999,999'), ',', '.') ||
              case when v_use * u.price < u.min_charge then ' (minimal Rp' || replace(to_char(u.min_charge, 'FM999,999,999'), ',', '.') || ')' else '' end)
      returning id into v_inv;
      n_bill := n_bill + 1; v_total := v_total + v_amt;
    end if;
    insert into meter_readings(kos_id, room_id, type_id, period, reading, prev_reading, usage, price, amount, lease_id, invoice_id, note, created_by)
    values (p_kos, r.id, u.id, v_per, v_read, v_prev, v_use, u.price, case when v_inv is null then 0 else v_amt end, l.id, v_inv,
            case when coalesce((x->>'reset')::boolean, false) then 'Meteran baru / diganti' when v_prev is null then 'Angka awal' when l.id is null then 'Kamar kosong (tanpa tagihan)' end, actor_email())
    returning id into v_id;
    out := out || jsonb_build_object('room', r.code, 'usage', v_use, 'amount', case when v_inv is null then 0 else v_amt end, 'invoice', v_inv is not null);
  end loop;
  return jsonb_build_object('rows', out, 'billed', n_bill, 'total', v_total);
end $$;

-- Batalkan catatan meter (tagihannya ikut dibatalkan bila belum ada pembayaran)
create or replace function public.meter_void(p_reading uuid, p_reason text)
returns void language plpgsql security definer set search_path = public as $$
declare m meter_readings; s record;
begin
  select * into m from meter_readings where id = p_reading for update;
  if m.id is null or not member_in('rent', m.kos_id) then raise exception 'Catatan tidak ditemukan'; end if;
  if m.status <> 'aktif' then raise exception 'Sudah dibatalkan'; end if;
  if coalesce(trim(p_reason), '') = '' then raise exception 'Tulis alasan'; end if;
  if exists (select 1 from meter_readings where room_id = m.room_id and type_id = m.type_id and status = 'aktif' and period > m.period) then
    raise exception 'Batalkan dulu catatan bulan setelahnya'; end if;
  if m.invoice_id is not null then
    select * into s from invoice_summary where id = m.invoice_id;
    if s.paid > 0 or s.pending > 0 then raise exception 'Tagihan meter ini sudah ada pembayarannya. Batalkan pembayarannya dulu.'; end if;
    update invoices set status = 'batal', cancel_reason = 'Catatan meter dibatalkan: ' || trim(p_reason) where id = m.invoice_id and status = 'terbit';
  end if;
  update meter_readings set status = 'batal', void_reason = trim(p_reason) where id = m.id;
end $$;

-- ================= Integrasi =================
-- Pembukuan: akun deposit (kewajiban), posting deposit & pembayaran dari deposit
select public._prasara_patch('public.acct_ensure(uuid)',
  '    (''5-3000'', ''Pemakaian bahan'', ''beban'', ''beban_bahan'')',
  '    (''5-3000'', ''Pemakaian bahan'', ''beban'', ''beban_bahan''),
    (''2-1400'', ''Deposit penghuni'', ''kewajiban'', ''deposit_penghuni'')');
select public._prasara_patch('public.acct_desired(uuid)',
  '(''ewallet'', ''bank''), (''lainnya'', ''bank''))',
  '(''ewallet'', ''bank''), (''lainnya'', ''bank''), (''deposit'', ''deposit_penghuni''))');
select public._prasara_patch('public.acct_desired(uuid)',
  '  union all
  select ''purchase_return'',',
  '  union all
  select ''deposit'', dp.id, dp.date,
         case dp.kind when ''terima'' then ''Terima deposit'' when ''kembali'' then ''Kembalikan deposit'' else ''Potong deposit'' end || '' · '' || coalesce((select name from occupants where id = dp.occupant_id), '''') || coalesce('' · '' || dp.reason, ''''), x.k, x.v from deposits dp
    cross join lateral (values
      (case dp.kind when ''terima'' then dp.account else ''deposit_penghuni'' end, dp.amount),
      (case dp.kind when ''terima'' then ''deposit_penghuni'' when ''kembali'' then dp.account else ''pendapatan_lain'' end, -dp.amount)) x(k, v)
    where dp.kos_id = p_kos and dp.status = ''aktif'' and dp.payment_id is null
  union all
  select ''purchase_return'',');

-- Portal penghuni: saldo deposit & laporan keluhan milik penghuni
select public._prasara_patch('public.portal_get(text)',
  '    ''vacant_rooms'', coalesce(',
  '    ''deposit'', (select deposit_balance(le.id) from leases le where le.occupant_id = o.id and le.status = ''aktif'' limit 1),
    ''can_report'', module_on(k.id, ''p_perbaikan''),
    ''tickets'', case when module_on(k.id, ''p_perbaikan'') then coalesce((select jsonb_agg(t order by t.created_at desc) from (
        select number, category, title, status, resolution, created_at, resolved_at from maint_tickets
        where occupant_id = o.id order by created_at desc limit 10) t), ''[]''::jsonb) else ''[]''::jsonb end,
    ''vacant_rooms'', coalesce(');

-- Tutup bisnis: deposit yang belum diselesaikan & keluhan terbuka
select public._prasara_patch('public.business_close_check(uuid)',
  '  if module_on(p_kos, ''u_akuntansi'')',
  '  select count(*), coalesce(sum(z.bal), 0) into n, v from (select deposit_balance(id) as bal from leases where kos_id = p_kos) z where z.bal > 0;
  if n > 0 then w := w || jsonb_build_object(''label'', format(''%s deposit penghuni belum dikembalikan/diselesaikan, total Rp %s'', n, replace(to_char(v, ''FM999,999,999,999''), '','', ''.'')), ''href'', ''/penghuni''); end if;
  select count(*) into n from maint_tickets where kos_id = p_kos and status in (''baru'', ''dikerjakan'', ''menunggu'');
  if n > 0 then w := w || jsonb_build_object(''label'', format(''%s keluhan/perbaikan belum selesai'', n), ''href'', ''/perbaikan''); end if;
  if module_on(p_kos, ''u_akuntansi'')');
-- bisnis jasa: piutang pelanggan sebagai peringatan (sebelumnya terbaca sebagai tagihan sewa)
select public._prasara_patch('public.business_close_check(uuid)',
  '  else
    select count(*), coalesce(sum(outstanding), 0) into n, v from invoice_summary',
  '  elsif k.business_type = ''jasa'' then
    select count(*), coalesce(sum(o.total - svc_paid(o.id)), 0) into n, v from svc_orders o where o.kos_id = p_kos and o.status = ''selesai'' and o.total > svc_paid(o.id);
    if n > 0 then w := w || jsonb_build_object(''label'', format(''%s pesanan jasa belum lunas, total Rp %s'', n, replace(to_char(v, ''FM999,999,999,999''), '','', ''.'')), ''href'', ''/pesanan''); end if;
  else
    select count(*), coalesce(sum(outstanding), 0) into n, v from invoice_summary');

-- Ringkasan pemilik: keluhan prioritas tinggi & keluhan baru dari penghuni
select public._prasara_patch('public.owner_overview2(date)',
  '    else
      v_rev := coalesce((select sum(amount) from payments where kos_id = k.id and status = ''terverifikasi'' and paid_at between m0 and m1), 0)',
  '    else
      v_att := v_att
        || coalesce((select jsonb_agg(jsonb_build_object(''text'', n || '' keluhan baru dari penghuni'', ''href'', ''/perbaikan'', ''tone'', ''gold'')) from (select count(*) n from maint_tickets where kos_id = k.id and status = ''baru'' and source = ''penghuni'') z where n > 0), ''[]'')
        || coalesce((select jsonb_agg(jsonb_build_object(''text'', n || '' perbaikan prioritas tinggi belum selesai'', ''href'', ''/perbaikan'', ''tone'', ''bad'')) from (select count(*) n from maint_tickets where kos_id = k.id and priority = ''tinggi'' and status in (''baru'', ''dikerjakan'', ''menunggu'')) z where n > 0), ''[]'');
      v_rev := coalesce((select sum(amount) from payments where kos_id = k.id and status = ''terverifikasi'' and paid_at between m0 and m1), 0)');

-- Unduh semua data: deposit, keluhan, meteran
select public._prasara_patch('public.business_export_sheets(uuid)',
  '       from payments p left join invoices i on i.id = p.invoice_id left join occupants o on o.id = i.occupant_id where p.kos_id = p_kos));
  end if;',
  '       from payments p left join invoices i on i.id = p.invoice_id left join occupants o on o.id = i.occupant_id where p.kos_id = p_kos));
    s := s || xs(''Deposit'', array[''Tanggal'', ''Penghuni'', ''Kamar'', ''Jenis'', ''Jumlah'', ''Akun'', ''Alasan'', ''Status'', ''Alasan batal'', ''Oleh''], array[''d'', ''t'', ''t'', ''t'', ''r'', ''t'', ''t'', ''t'', ''t'', ''t''],
      (select jsonb_agg(jsonb_build_array(dp.date, o.name, r.code, dp.kind, dp.amount, dp.account, dp.reason, dp.status, dp.void_reason, dp.created_by) order by dp.created_at)
       from deposits dp join occupants o on o.id = dp.occupant_id join leases l on l.id = dp.lease_id join rooms r on r.id = l.room_id where dp.kos_id = p_kos));
    s := s || xs(''Keluhan & perbaikan'', array[''Nomor'', ''Dicatat'', ''Kamar'', ''Kategori'', ''Keluhan'', ''Prioritas'', ''Status'', ''Dari'', ''Ditangani'', ''Penyelesaian'', ''Biaya'', ''Selesai''], array[''t'', ''t'', ''t'', ''t'', ''t'', ''t'', ''t'', ''t'', ''t'', ''t'', ''r'', ''t''],
      (select jsonb_agg(jsonb_build_array(t.number, xs_time(t.created_at), r.code, t.category, t.title, t.priority, t.status, t.source, t.assigned_to, t.resolution, t.cost, xs_time(t.resolved_at)) order by t.created_at)
       from maint_tickets t left join rooms r on r.id = t.room_id where t.kos_id = p_kos));
    s := s || xs(''Meteran'', array[''Bulan'', ''Kamar'', ''Jenis'', ''Angka lalu'', ''Angka sekarang'', ''Pemakaian'', ''Tarif'', ''Tagihan'', ''Status'', ''Catatan''], array[''d'', ''t'', ''t'', ''n'', ''n'', ''n'', ''r'', ''r'', ''t'', ''t''],
      (select jsonb_agg(jsonb_build_array(m.period, r.code, u.name, m.prev_reading, m.reading, m.usage, m.price, m.amount, m.status, coalesce(m.void_reason, m.note)) order by m.period, r.code)
       from meter_readings m join rooms r on r.id = m.room_id join utility_types u on u.id = m.type_id where m.kos_id = p_kos));
  end if;');

-- Management Center: aktivitas properti juga dari keluhan & meteran
select public._prasara_patch('public.admin_customers()',
  '(select max(created_at) from svc_orders where kos_id = k.id),',
  '(select max(created_at) from svc_orders where kos_id = k.id), (select max(created_at) from maint_tickets where kos_id = k.id),
        (select max(created_at) from meter_readings where kos_id = k.id), (select max(created_at) from deposits where kos_id = k.id),');

-- ================= Hak akses fungsi =================
revoke execute on function public.deposit_balance(uuid), public.maint_event(uuid, text, text, text), public.maint_number(uuid), public.payments_deposit_guard() from public, anon, authenticated;
grant execute on function public.deposit_balance(uuid) to authenticated;
revoke execute on function public.deposit_add(uuid, uuid, text, numeric, date, text, text, uuid), public.deposit_void(uuid, text),
  public.maint_create(uuid, uuid, jsonb), public.maint_update(uuid, jsonb), public.maint_finish(uuid, text, numeric, boolean, text),
  public.utility_type_save(uuid, uuid, jsonb), public.meter_record(uuid, uuid, date, date, jsonb), public.meter_void(uuid, text) from public, anon;
grant execute on function public.deposit_add(uuid, uuid, text, numeric, date, text, text, uuid), public.deposit_void(uuid, text),
  public.maint_create(uuid, uuid, jsonb), public.maint_update(uuid, jsonb), public.maint_finish(uuid, text, numeric, boolean, text),
  public.utility_type_save(uuid, uuid, jsonb), public.meter_record(uuid, uuid, date, date, jsonb), public.meter_void(uuid, text) to authenticated;
revoke execute on function public.portal_report_issue(text, text, text, text) from public;
grant execute on function public.portal_report_issue(text, text, text, text) to anon, authenticated;

drop function public._prasara_patch(text, text, text);
