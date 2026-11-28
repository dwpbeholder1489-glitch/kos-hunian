-- Adaptive Property & Rental Management — Tahap 1 (permintaan pemilik 28 Nov 2026; audit & roadmap docs/AUDIT_PROPERTI_ADAPTIF.md).
-- Prinsip: MEMAKAI mesin bersama yang sudah ada, tidak menduplikasi modul.
--   • Multi-properti = tabel `branches` (kind 'cabang') yang sama dengan toko → batas paket `cabang` (limit_cabang) berlaku apa adanya.
--     rooms.branch_id null = lokasi utama (TIDAK di-backfill; bisnis lama tetap berjalan tanpa perubahan).
--   • Uang tetap dari jurnal (acct_lines). acct_line_branch kini mengenali pembayaran/deposit/booking kos lewat kamar → laporan per lokasi
--     (Analisis Bisnis, Profitabilitas, Rekap) ikut benar untuk properti.
--   • Inventaris per kamar (`room_items`) + pemeriksaan masuk/keluar/rutin (`room_inspections`, tidak bisa diubah setelah disimpan).
--   • Nilai investasi & nilai pasar per properti (`property_values`) DIISI PEMILIK — tanpa angka bawaan.
--   • `property_intel` = SATU sumber angka Property Intelligence; rumus NOI/ROI/yield/balik modal/proyeksi HANYA di lib/propertyIntel.js.

-- ---------- 1. Kamar/unit: lokasi properti, lantai, luas, kapasitas ----------
alter table public.rooms add column if not exists branch_id uuid references public.branches(id) on delete set null;
alter table public.rooms add column if not exists floor text;
alter table public.rooms add column if not exists size_m2 numeric(8,2);
alter table public.rooms add column if not exists capacity int;
do $$ begin
  alter table public.rooms add constraint rooms_floor_len check (floor is null or length(floor) <= 20);
  alter table public.rooms add constraint rooms_size_pos check (size_m2 is null or (size_m2 > 0 and size_m2 <= 100000));
  alter table public.rooms add constraint rooms_capacity_rng check (capacity is null or capacity between 1 and 50);
exception when duplicate_object then null; end $$;
create index if not exists rooms_branch on public.rooms(kos_id, branch_id);

create or replace function public.rooms_branch_check()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.branch_id is not null and (tg_op = 'INSERT' or new.branch_id is distinct from old.branch_id) then
    if not exists (select 1 from branches b where b.id = new.branch_id and b.kos_id = new.kos_id and b.kind = 'cabang' and b.active) then
      raise exception 'Properti/lokasi tidak ditemukan atau sudah nonaktif';
    end if;
  end if;
  return new;
end $$;
drop trigger if exists rooms_branch_check on public.rooms;
create trigger rooms_branch_check before insert or update of branch_id on public.rooms for each row execute function public.rooms_branch_check();
revoke execute on function public.rooms_branch_check() from public, anon, authenticated;

-- Lokasi utama (bila ada) & lokasi efektif sebuah kamar (null = utama)
create or replace function public.prop_main(p_kos uuid)
returns uuid language sql stable security definer set search_path = public as $$
  select id from branches where kos_id = p_kos and is_main;
$$;
create or replace function public.prop_room_branch(p_room uuid)
returns uuid language sql stable security definer set search_path = public as $$
  select coalesce(r.branch_id, (select id from branches b where b.kos_id = r.kos_id and b.is_main)) from rooms r where r.id = p_room;
$$;
revoke execute on function public.prop_main(uuid), public.prop_room_branch(uuid) from public, anon, authenticated;

-- Lokasi baris jurnal: tambah pembayaran sewa, deposit, DP booking (lewat kamar). Jenis lain tidak berubah.
create or replace function public.acct_line_branch(p_type text, p_id uuid)
returns uuid language sql stable security definer set search_path = public as $$
  select case p_type
    when 'sale' then (select branch_id from sales where id = p_id)
    when 'return' then (select s.branch_id from sale_returns r join sales s on s.id = r.sale_id where r.id = p_id)
    when 'purchase' then (select branch_id from purchases where id = p_id)
    when 'purchase_return' then (select b.branch_id from purchase_returns r join purchases b on b.id = r.purchase_id where r.id = p_id)
    when 'stock_move' then (select branch_id from stock_moves where id = p_id)
    when 'expense' then (select branch_id from expenses where id = p_id)
    when 'cash_entry' then (select branch_id from cash_entries where id = p_id)
    when 'debt_payment' then (select branch_id from debt_payments where id = p_id)
    when 'payment' then (select prop_room_branch(i.room_id) from payments p join invoices i on i.id = p.invoice_id where p.id = p_id)
    when 'deposit' then (select prop_room_branch(coalesce(l.room_id, bk.room_id)) from deposits d left join leases l on l.id = d.lease_id
                          left join bookings bk on bk.id = d.booking_id where d.id = p_id)
    when 'booking' then (select prop_room_branch(room_id) from bookings where id = p_id)
  end;
$$;
revoke execute on function public.acct_line_branch(text, uuid) from public, anon, authenticated;

-- Pengeluaran & kas properti: lokasi kerja pengguna (bila ada lokasi) — sama dengan toko, tanpa membuat lokasi otomatis
create or replace function public.doc_loc()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_type text;
begin
  if new.branch_id is null then
    select business_type into v_type from kos where id = new.kos_id;
    if v_type = 'retail' then new.branch_id := coalesce(stock_loc(new.kos_id), branch_main_ensure(new.kos_id));
    elsif v_type = 'properti' then new.branch_id := stock_loc(new.kos_id);
    end if;
  end if;
  return new;
end $$;

-- Daftar lokasi untuk aplikasi: properti ikut (tanpa membuat lokasi utama otomatis)
create or replace function public.my_locations()
returns jsonb language plpgsql security definer set search_path = public as $$
declare k record; r jsonb := '{}';
begin
  for k in select id, business_type, closed_at from kos where business_type in ('retail', 'properti')
             and (owner_id = auth.uid() or exists (select 1 from kos_members m where m.kos_id = kos.id and m.user_id = auth.uid() and m.active)) loop
    if k.business_type = 'retail' then perform branch_main_ensure(k.id); end if;
    r := r || jsonb_build_object(k.id::text, jsonb_build_object(
      'list', coalesce((select jsonb_agg(jsonb_build_object('id', b.id, 'name', b.name, 'kind', b.kind, 'is_main', b.is_main, 'address', b.address) order by b.is_main desc, b.name)
                        from branches b where b.kos_id = k.id and b.active), '[]'::jsonb),
      'current', stock_loc(k.id),
      'locked', coalesce((select locked from member_locations where kos_id = k.id and user_id = auth.uid()), false) and not member_can(k.id, 'team')));
  end loop;
  return r;
end $$;

-- Tambah/ubah properti (pemilik). Lokasi utama dibuat dulu agar kamar lama tetap punya rumah.
create or replace function public.property_save(p_kos uuid, p_id uuid, p_name text, p_address text, p_active boolean default true)
returns uuid language plpgsql security definer set search_path = public as $$
begin
  if (select business_type from kos where id = p_kos) is distinct from 'properti' then raise exception 'Hanya untuk bisnis properti'; end if;
  if not member_can(p_kos, 'team') then raise exception 'Properti hanya bisa ditambah atau diubah oleh pemilik'; end if;
  if length(trim(coalesce(p_name, ''))) < 2 then raise exception 'Nama properti minimal 2 huruf'; end if;
  perform branch_main_ensure(p_kos);
  if p_id is not null and p_active is false and exists (select 1 from rooms where branch_id = p_id and status = 'terisi') then
    raise exception 'Masih ada kamar terisi di properti ini. Pindahkan atau akhiri sewanya dulu.';
  end if;
  return branch_save(p_kos, p_id, p_name, 'cabang', p_address, p_active);
end $$;
revoke execute on function public.property_save(uuid, uuid, text, text, boolean) from public, anon;
grant execute on function public.property_save(uuid, uuid, text, text, boolean) to authenticated;

-- ---------- 2. Inventaris per kamar ----------
create table if not exists public.room_items (
  id uuid primary key default gen_random_uuid(),
  kos_id uuid not null references public.kos(id) on delete cascade,
  room_id uuid not null references public.rooms(id) on delete cascade,
  name text not null check (length(trim(name)) between 1 and 80),
  qty int not null default 1 check (qty between 1 and 999),
  condition text not null default 'baik' check (condition in ('baik', 'perlu_perbaikan', 'rusak', 'hilang')),
  value numeric(14,2) check (value is null or value >= 0),
  asset_id uuid references public.fixed_assets(id) on delete set null,
  note text check (note is null or length(note) <= 300),
  checked_at date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists room_items_room on public.room_items(kos_id, room_id);
alter table public.room_items enable row level security;
drop policy if exists room_items_all on public.room_items;
create policy room_items_all on public.room_items for all using (public.member_can(kos_id, 'rent')) with check (public.member_can(kos_id, 'rent'));
grant select, insert, update, delete on public.room_items to authenticated;
drop trigger if exists zz_kos_open_guard on public.room_items;
create trigger zz_kos_open_guard before insert or update or delete on public.room_items for each row execute function public.kos_open_guard();

create or replace function public.room_items_check()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from rooms where id = new.room_id and kos_id = new.kos_id) then raise exception 'Kamar tidak ditemukan'; end if;
  if new.asset_id is not null and not exists (select 1 from fixed_assets where id = new.asset_id and kos_id = new.kos_id) then raise exception 'Aset tetap tidak ditemukan'; end if;
  new.name := trim(new.name); new.updated_at := now();
  return new;
end $$;
drop trigger if exists room_items_check on public.room_items;
create trigger room_items_check before insert or update on public.room_items for each row execute function public.room_items_check();
revoke execute on function public.room_items_check() from public, anon, authenticated;

-- ---------- 3. Pemeriksaan kamar (check-in / check-out / rutin) ----------
create table if not exists public.room_inspections (
  id uuid primary key default gen_random_uuid(),
  kos_id uuid not null references public.kos(id) on delete cascade,
  room_id uuid not null references public.rooms(id) on delete cascade,
  lease_id uuid references public.leases(id) on delete set null,
  kind text not null check (kind in ('masuk', 'keluar', 'rutin')),
  date date not null,
  items jsonb not null default '[]'::jsonb check (jsonb_typeof(items) = 'array'),
  note text check (note is null or length(note) <= 1000),
  damage numeric(14,2) not null default 0 check (damage >= 0),
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now()
);
create index if not exists room_inspections_room on public.room_inspections(kos_id, room_id, date desc);
alter table public.room_inspections enable row level security;
drop policy if exists room_inspections_read on public.room_inspections;
create policy room_inspections_read on public.room_inspections for select using (public.member_can(kos_id, 'rent'));
grant select on public.room_inspections to authenticated;
drop trigger if exists zz_kos_open_guard on public.room_inspections;
create trigger zz_kos_open_guard before insert or update or delete on public.room_inspections for each row execute function public.kos_open_guard();

-- items: [{item_id, condition, note}] — nama & jumlah disalin dari inventaris saat itu (riwayat tetap utuh walau barang dihapus)
create or replace function public.room_inspection_save(p_kos uuid, p_room uuid, p_lease uuid, p_kind text, p_date date, p_items jsonb, p_note text, p_damage numeric)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_items jsonb := '[]'::jsonb; x jsonb; it room_items; v_cond text;
begin
  if not member_in('rent', p_kos) then raise exception 'Tidak punya akses kamar bisnis ini'; end if;
  if not exists (select 1 from rooms where id = p_room and kos_id = p_kos) then raise exception 'Kamar tidak ditemukan'; end if;
  if p_kind not in ('masuk', 'keluar', 'rutin') then raise exception 'Jenis pemeriksaan tidak dikenal'; end if;
  if p_date is null or p_date > (now() at time zone 'Asia/Jakarta')::date then raise exception 'Tanggal pemeriksaan tidak boleh di masa depan'; end if;
  if p_lease is not null and not exists (select 1 from leases where id = p_lease and kos_id = p_kos and room_id = p_room) then raise exception 'Sewa tidak cocok dengan kamar ini'; end if;
  if coalesce(p_damage, 0) < 0 then raise exception 'Nilai kerusakan tidak boleh minus'; end if;
  if jsonb_typeof(coalesce(p_items, '[]')) <> 'array' then raise exception 'Daftar barang tidak valid'; end if;
  for x in select * from jsonb_array_elements(coalesce(p_items, '[]')) loop
    select * into it from room_items where id = nullif(x ->> 'item_id', '')::uuid and room_id = p_room and kos_id = p_kos;
    if it.id is null then raise exception 'Barang inventaris tidak ditemukan di kamar ini'; end if;
    v_cond := coalesce(x ->> 'condition', it.condition);
    if v_cond not in ('baik', 'perlu_perbaikan', 'rusak', 'hilang') then raise exception 'Kondisi barang tidak dikenal'; end if;
    v_items := v_items || jsonb_build_object('item_id', it.id, 'name', it.name, 'qty', it.qty, 'before', it.condition, 'condition', v_cond,
                                             'note', nullif(left(coalesce(x ->> 'note', ''), 200), ''));
    if it.checked_at is null or it.checked_at <= p_date then
      update room_items set condition = v_cond, checked_at = p_date where id = it.id;
    end if;
  end loop;
  insert into room_inspections(kos_id, room_id, lease_id, kind, date, items, note, damage)
  values (p_kos, p_room, p_lease, p_kind, p_date, v_items, nullif(trim(coalesce(p_note, '')), ''), coalesce(p_damage, 0)) returning id into v_id;
  return v_id;
end $$;
revoke execute on function public.room_inspection_save(uuid, uuid, uuid, text, date, jsonb, text, numeric) from public, anon;
grant execute on function public.room_inspection_save(uuid, uuid, uuid, text, date, jsonb, text, numeric) to authenticated;

-- ---------- 4. Nilai investasi & nilai pasar per properti (diisi pemilik) ----------
create table if not exists public.property_values (
  id uuid primary key default gen_random_uuid(),
  kos_id uuid not null references public.kos(id) on delete cascade,
  branch_id uuid not null references public.branches(id) on delete cascade,
  invest numeric(16,2) check (invest is null or invest > 0),
  invest_date date,
  market_value numeric(16,2) check (market_value is null or market_value > 0),
  market_date date,
  note text check (note is null or length(note) <= 300),
  updated_by uuid default auth.uid(),
  updated_at timestamptz not null default now(),
  unique (kos_id, branch_id)
);
alter table public.property_values enable row level security;
drop policy if exists property_values_read on public.property_values;
create policy property_values_read on public.property_values for select using (public.member_can(kos_id, 'finance'));
grant select on public.property_values to authenticated;
drop trigger if exists zz_kos_open_guard on public.property_values;
create trigger zz_kos_open_guard before insert or update or delete on public.property_values for each row execute function public.kos_open_guard();

create or replace function public.property_value_set(p_kos uuid, p_branch uuid, p_invest numeric, p_invest_date date, p_market numeric, p_market_date date, p_note text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_b uuid; v_old property_values; v_new property_values; v_today date := (now() at time zone 'Asia/Jakarta')::date;
begin
  if (select business_type from kos where id = p_kos) is distinct from 'properti' then raise exception 'Hanya untuk bisnis properti'; end if;
  if not member_in('finance', p_kos) then raise exception 'Tidak punya akses keuangan bisnis ini'; end if;
  if p_invest is not null and p_invest <= 0 then raise exception 'Nilai investasi harus lebih dari 0 (kosongkan bila belum diketahui)'; end if;
  if p_market is not null and p_market <= 0 then raise exception 'Nilai pasar harus lebih dari 0 (kosongkan bila belum diketahui)'; end if;
  if p_invest_date > v_today or p_market_date > v_today then raise exception 'Tanggal tidak boleh di masa depan'; end if;
  v_b := coalesce(p_branch, branch_main_ensure(p_kos));
  if not exists (select 1 from branches where id = v_b and kos_id = p_kos and kind = 'cabang') then raise exception 'Properti tidak ditemukan'; end if;
  select * into v_old from property_values where kos_id = p_kos and branch_id = v_b;
  insert into property_values(kos_id, branch_id, invest, invest_date, market_value, market_date, note, updated_by, updated_at)
  values (p_kos, v_b, p_invest, p_invest_date, p_market, p_market_date, nullif(trim(coalesce(p_note, '')), ''), auth.uid(), now())
  on conflict (kos_id, branch_id) do update set invest = excluded.invest, invest_date = excluded.invest_date, market_value = excluded.market_value,
    market_date = excluded.market_date, note = excluded.note, updated_by = excluded.updated_by, updated_at = now()
  returning * into v_new;
  perform config_log(p_kos, 'ubah_nilai_properti', (select name from branches where id = v_b),
    case when v_old.id is null then null else jsonb_build_object('investasi', v_old.invest, 'nilai_pasar', v_old.market_value) end,
    jsonb_build_object('investasi', v_new.invest, 'nilai_pasar', v_new.market_value), null, 'rendah', null);
  return to_jsonb(v_new);
end $$;
revoke execute on function public.property_value_set(uuid, uuid, numeric, date, numeric, date, text) from public, anon;
grant execute on function public.property_value_set(uuid, uuid, numeric, date, numeric, date, text) to authenticated;

-- ---------- 5. Property Intelligence ----------
-- Baris laba rugi jurnal dengan lokasi efektif (null → lokasi utama). Internal.
create or replace function public.prop_lines(p_kos uuid, p_from date, p_to date)
returns table(d date, cls text, br uuid, v numeric)
language sql stable security definer set search_path = public as $$
  select e.entry_date, biz_fin_class(a.type, coalesce(a.sys_key, '')),
         coalesce(acct_line_branch(l.source_type, l.source_id), (select id from branches b where b.kos_id = p_kos and b.is_main)),
         case when a.type = 'pendapatan' then l.credit - l.debit else l.debit - l.credit end
  from acct_lines l join acct_entries e on e.id = l.entry_id join acct_accounts a on a.id = l.account_id
  where l.kos_id = p_kos and a.type in ('pendapatan', 'beban') and e.entry_date between p_from and p_to;
$$;
revoke execute on function public.prop_lines(uuid, date, date) from public, anon, authenticated;

create or replace function public.prop_totals(p_kos uuid, p_from date, p_to date, p_branch uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_object_agg(cls, round(s, 2)), '{}'::jsonb)
  from (select cls, sum(v) s from prop_lines(p_kos, p_from, p_to) where p_branch is null or br = p_branch group by cls) z;
$$;
revoke execute on function public.prop_totals(uuid, date, date, uuid) from public, anon, authenticated;

-- Hunian per bulan: hari kamar terisi (sewa yang beririsan, sampai hari ini) ÷ hari kamar tersedia (kamar yang disewakan SEKARANG)
create or replace function public.prop_occupancy(p_kos uuid, p_to date, p_months int, p_branch uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  with today as (select (now() at time zone 'Asia/Jakarta')::date t),
  rm as (select r.id from rooms r where r.kos_id = p_kos and r.status <> 'tidak_disewakan'
           and (p_branch is null or coalesce(r.branch_id, (select id from branches b where b.kos_id = p_kos and b.is_main)) = p_branch)),
  mo as (select (date_trunc('month', p_to) - make_interval(months => g))::date a from generate_series(0, greatest(p_months, 1) - 1) g),
  per as (select a, least((a + interval '1 month - 1 day')::date, (select t from today)) b from mo where a <= (select t from today))
  select coalesce(jsonb_agg(jsonb_build_object('bulan', to_char(per.a, 'YYYY-MM'), 'hari', (per.b - per.a + 1) * (select count(*) from rm),
           'terisi', (select count(*) from (select distinct le.room_id, g.d from leases le
                        cross join lateral generate_series(greatest(le.start_date, per.a), least(coalesce(le.end_date, per.b), per.b), interval '1 day') g(d)
                        where le.kos_id = p_kos and le.room_id in (select id from rm) and le.start_date <= per.b and (le.end_date is null or le.end_date >= per.a)) q))
         order by per.a), '[]'::jsonb)
  from per;
$$;
revoke execute on function public.prop_occupancy(uuid, date, int, uuid) from public, anon, authenticated;

create or replace function public.property_intel(p_kos uuid, p_from date, p_to date, p_branch uuid default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_today date := (now() at time zone 'Asia/Jakarta')::date;
  v_lanjut boolean; v_dalam boolean; v_main uuid; v_days int; v_prev_from date; v_prev_to date;
  v_t12_to date; v_t12_from date; v_first date; v_months int; r jsonb;
begin
  if not member_in('finance', p_kos) then raise exception 'Tidak punya akses keuangan bisnis ini'; end if;
  if (select business_type from kos where id = p_kos) is distinct from 'properti' then raise exception 'Property Intelligence hanya untuk bisnis properti'; end if;
  if p_from is null or p_to is null or p_from > p_to then raise exception 'Periode tidak valid'; end if;
  if p_to - p_from > 400 then raise exception 'Periode maksimal 400 hari'; end if;
  v_lanjut := plan_has(p_kos, 'analisis_lanjutan');
  v_dalam := plan_has(p_kos, 'analisis_mendalam');
  if p_branch is not null and not v_dalam then raise exception 'BATAS_PAKET: Analisis per properti tersedia di Paket Pro.'; end if;
  if p_branch is not null and not exists (select 1 from branches where id = p_branch and kos_id = p_kos) then raise exception 'Properti tidak ditemukan'; end if;
  perform acct_sync_internal(p_kos);
  v_main := prop_main(p_kos);
  v_days := p_to - p_from + 1;
  v_prev_to := p_from - 1; v_prev_from := p_from - v_days;
  -- 12 bulan penuh terakhir untuk angka tahunan (dibatasi sejak jurnal pertama)
  v_t12_to := (date_trunc('month', v_today) - interval '1 day')::date;
  v_t12_from := (date_trunc('month', v_today) - interval '12 months')::date;
  select min(e.entry_date) into v_first from acct_entries e where e.kos_id = p_kos;
  if v_first is not null and v_first > v_t12_from then v_t12_from := date_trunc('month', v_first)::date; end if;
  v_months := greatest(0, (extract(year from age(v_t12_to + 1, v_t12_from)) * 12 + extract(month from age(v_t12_to + 1, v_t12_from)))::int);

  r := jsonb_build_object(
    'aktif', true, 'lanjut', v_lanjut, 'dalam', v_dalam, 'from', p_from, 'to', p_to, 'branch', p_branch, 'today', v_today,
    'main', v_main,
    'pnl', prop_totals(p_kos, p_from, p_to, p_branch),
    'prev', prop_totals(p_kos, v_prev_from, v_prev_to, p_branch),
    'prev_period', jsonb_build_object('from', v_prev_from, 'to', v_prev_to),
    'occ', prop_occupancy(p_kos, p_to, case when v_lanjut then 12 else 6 end, p_branch),
    'rooms', (select coalesce(jsonb_agg(jsonb_build_object('id', r2.id, 'code', r2.code, 'name', r2.name, 'status', r2.status, 'rent', r2.rent,
                 'branch', coalesce(r2.branch_id, v_main),
                 'lease_rent', (select rent from leases l where l.room_id = r2.id and l.status = 'aktif'),
                 'booked', exists (select 1 from bookings bk where bk.room_id = r2.id and bk.status = 'aktif'),
                 'tickets', (select count(*) from maint_tickets t where t.room_id = r2.id and t.status in ('baru', 'dikerjakan', 'menunggu'))) order by r2.code), '[]'::jsonb)
              from rooms r2 where r2.kos_id = p_kos and (p_branch is null or coalesce(r2.branch_id, v_main) = p_branch)),
    'arrears', (select jsonb_build_object(
                  'total', coalesce(sum(i.outstanding), 0), 'count', count(*), 'penghuni', count(distinct i.occupant_id),
                  'b30', coalesce(sum(i.outstanding) filter (where v_today - i.due_date <= 30), 0),
                  'b60', coalesce(sum(i.outstanding) filter (where v_today - i.due_date between 31 and 60), 0),
                  'b90', coalesce(sum(i.outstanding) filter (where v_today - i.due_date between 61 and 90), 0),
                  'b90p', coalesce(sum(i.outstanding) filter (where v_today - i.due_date > 90), 0))
                from invoice_summary i where i.kos_id = p_kos and i.status = 'terbit' and i.outstanding > 0 and i.due_date < v_today
                  and (p_branch is null or prop_room_branch(i.room_id) = p_branch)),
    'due30', (select coalesce(sum(i.outstanding), 0) from invoice_summary i where i.kos_id = p_kos and i.status = 'terbit' and i.outstanding > 0
                and i.due_date between v_today and v_today + 30 and (p_branch is null or prop_room_branch(i.room_id) = p_branch)),
    'billed', (select coalesce(sum(i.amount), 0) from invoice_summary i where i.kos_id = p_kos and i.status = 'terbit' and i.due_date between p_from and p_to
                 and (p_branch is null or prop_room_branch(i.room_id) = p_branch)),
    'collected', (select coalesce(sum(least(i.paid, i.amount)), 0) from invoice_summary i where i.kos_id = p_kos and i.status = 'terbit' and i.due_date between p_from and p_to
                 and (p_branch is null or prop_room_branch(i.room_id) = p_branch)),
    'maint', (select jsonb_build_object('open', count(*) filter (where t.status in ('baru', 'dikerjakan', 'menunggu')),
                 'cost', coalesce(sum(t.cost) filter (where (t.created_at at time zone 'Asia/Jakarta')::date between p_from and p_to), 0))
              from maint_tickets t where t.kos_id = p_kos and (p_branch is null or (t.room_id is not null and prop_room_branch(t.room_id) = p_branch)
                                                              or (t.room_id is null and p_branch = v_main))),
    'props', (select coalesce(jsonb_agg(jsonb_build_object('id', b.id, 'name', b.name, 'address', b.address, 'is_main', b.is_main,
                 'kamar', (select count(*) from rooms x where x.kos_id = p_kos and x.status <> 'tidak_disewakan' and coalesce(x.branch_id, v_main) = b.id),
                 'terisi', (select count(*) from rooms x where x.kos_id = p_kos and x.status = 'terisi' and coalesce(x.branch_id, v_main) = b.id),
                 'aset', (select coalesce(sum(fa.cost), 0) from fixed_assets fa where fa.kos_id = p_kos and fa.status = 'aktif' and coalesce(fa.branch_id, v_main) = b.id),
                 'invest', pv.invest, 'invest_date', pv.invest_date, 'market', pv.market_value, 'market_date', pv.market_date, 'note', pv.note)
                 order by b.is_main desc, b.name), '[]'::jsonb)
              from branches b left join property_values pv on pv.branch_id = b.id
              where b.kos_id = p_kos and b.kind = 'cabang' and b.active and (p_branch is null or b.id = p_branch)),
    'kamar_tanpa_lokasi', v_main is null,
    'aset_total', (select coalesce(sum(cost), 0) from fixed_assets where kos_id = p_kos and status = 'aktif'),
    'locked', jsonb_build_object('units', not v_lanjut, 'invest', not v_lanjut, 'proyeksi', not v_lanjut, 'properti', not v_dalam));

  if v_lanjut then
    r := r || jsonb_build_object(
      't12', prop_totals(p_kos, v_t12_from, v_t12_to, p_branch),
      't12_period', jsonb_build_object('from', v_t12_from, 'to', v_t12_to, 'bulan', v_months),
      'units', (select coalesce(jsonb_agg(jsonb_build_object('id', pr.room_id, 'code', pr.code, 'rent', pr.rent, 'status', pr.status, 'masuk', pr.masuk,
                   'hari_terisi', pr.hari_terisi, 'hari', pr.hari,
                   'rawat', (select coalesce(sum(t.cost), 0) from maint_tickets t where t.room_id = pr.room_id and (t.created_at at time zone 'Asia/Jakarta')::date between p_from and p_to)))
                   , '[]'::jsonb)
                from profit_rooms(p_kos, p_from, p_to) pr
                where p_branch is null or prop_room_branch(pr.room_id) = p_branch),
      -- Sewa ke depan 12 bulan (mulai bulan depan): kontrak = sewa aktif bertanggal selesai; berjalan = tanpa tanggal selesai (diasumsikan lanjut);
      -- potensi = tarif kamar tersedia tanpa sewa/booking. Jumlah per bulan; pengolahan skenario di lib.
      'forward', (select jsonb_agg(jsonb_build_object('bulan', to_char(m.a, 'YYYY-MM'),
                     'kontrak', coalesce((select sum(l.rent) from leases l join rooms x on x.id = l.room_id where l.kos_id = p_kos and l.status = 'aktif'
                                  and l.end_date is not null and l.end_date >= m.a and l.start_date <= (m.a + interval '1 month - 1 day')::date
                                  and (p_branch is null or coalesce(x.branch_id, v_main) = p_branch)), 0),
                     'berjalan', coalesce((select sum(l.rent) from leases l join rooms x on x.id = l.room_id where l.kos_id = p_kos and l.status = 'aktif'
                                  and l.end_date is null and l.start_date <= (m.a + interval '1 month - 1 day')::date
                                  and (p_branch is null or coalesce(x.branch_id, v_main) = p_branch)), 0),
                     'booking', coalesce((select sum(bk.rent) from bookings bk join rooms x on x.id = bk.room_id where bk.kos_id = p_kos and bk.status = 'aktif'
                                  and bk.check_in <= (m.a + interval '1 month - 1 day')::date
                                  and (bk.months is null or (bk.check_in + make_interval(months => bk.months))::date > m.a)
                                  and (p_branch is null or coalesce(x.branch_id, v_main) = p_branch)), 0),
                     'potensi', coalesce((select sum(x.rent) from rooms x where x.kos_id = p_kos and x.status = 'tersedia' and x.rent > 0
                                  and not exists (select 1 from bookings bk where bk.room_id = x.id and bk.status = 'aktif')
                                  and (p_branch is null or coalesce(x.branch_id, v_main) = p_branch)), 0)) order by m.a)
                  from (select (date_trunc('month', v_today) + make_interval(months => g))::date a from generate_series(1, 12) g) m));
  end if;

  if v_dalam and p_branch is null then
    r := r || jsonb_build_object('per_prop', (select coalesce(jsonb_agg(jsonb_build_object('id', b.id, 'pnl', prop_totals(p_kos, p_from, p_to, b.id),
               't12', prop_totals(p_kos, v_t12_from, v_t12_to, b.id))), '[]'::jsonb)
             from branches b where b.kos_id = p_kos and b.kind = 'cabang' and b.active));
  end if;
  return r;
end $$;
revoke execute on function public.property_intel(uuid, date, date, uuid) from public, anon;
grant execute on function public.property_intel(uuid, date, date, uuid) to authenticated;

-- ---------- 6. Module Registry: Inventaris & pemeriksaan kamar ----------
insert into public.modules(code, name, description, applies_to, core, depends_on, entitlement, paths, data_used, status, version, sort, module_type, category, impl_status, feature_keys, area, optional_deps, owner_approval, config_path)
select 'p_inventaris', 'Inventaris & pemeriksaan kamar', 'Daftar perlengkapan tiap kamar/unit beserta kondisinya, pemeriksaan saat penghuni masuk, keluar, atau rutin; kerusakan bisa dipotong dari deposit.',
       '{properti}', false, '{p_kamar}', null, '{/inventaris}', 'room_items, room_inspections', 'available', '1.0', 9, 'operational', category, 'production_ready', '{}', 'rent', '{}', false, '/inventaris'
from public.modules where code = 'p_perbaikan'
on conflict (code) do nothing;
insert into public.business_modules(kos_id, module_code, active, updated_by)
select k.id, 'p_inventaris', true, 'sistem' from public.kos k where k.business_type = 'properti' on conflict do nothing;
update public.modules set rel_models = '{rental,hospitality}', rel_caps = '{uses_asset_tracking,uses_maintenance}',
  benefit = 'Kondisi perlengkapan tiap kamar tercatat saat penghuni masuk & keluar — kerusakan jelas buktinya sebelum memotong deposit.'
where code = 'p_inventaris';
-- bisnis properti baru (template kos) mendapat modul ini saat diaktifkan
update public.biz_templates set spec = jsonb_set(spec, '{modules}', coalesce(spec -> 'modules', '[]'::jsonb) || '["p_inventaris"]'::jsonb)
where code = 'kos' and not coalesce(spec -> 'modules', '[]'::jsonb) ? 'p_inventaris';
