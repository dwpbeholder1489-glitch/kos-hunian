-- PRASARA · Business Builder tahap 2
-- (1) Uang & pembukuan bisnis kustom: tiap jenis data bisa punya "uang masuk" (field uang + status kapan dihitung + kas/bank)
--     → Kas, Pembukuan, Ringkasan pemilik ikut menghitung. Biaya lewat Kas (+ Biaya) seperti bisnis lain.
-- (2) Custom Field Builder untuk menu bawaan: Penghuni, Barang, Pesanan jasa, Kontak (isian tambahan tervalidasi server).

create or replace function public._prasara_patch(p_sig text, p_old text, p_new text)
returns void language plpgsql as $$
declare d text;
begin
  d := pg_get_functiondef(p_sig::regprocedure);
  if position(p_old in d) = 0 then raise exception 'patch % : potongan tidak ditemukan: %', p_sig, left(p_old, 80); end if;
  execute replace(d, p_old, p_new);
end $$;

-- ================= (1) Uang masuk bisnis kustom =================
alter table public.bb_objects add column if not exists money_field text;
alter table public.bb_objects add column if not exists money_statuses uuid[] not null default '{}';
alter table public.bb_objects add column if not exists money_account text not null default 'kas' check (money_account in ('kas', 'bank'));
alter table public.bb_records add column if not exists money_at timestamptz;
create index if not exists bb_records_money on public.bb_records(kos_id, money_at) where money_at is not null;

-- Kapan sebuah catatan dihitung sebagai uang masuk: jenis data punya field uang, dan (tanpa alur) sejak dibuat / (dengan alur) selama statusnya termasuk daftar
create or replace function public.bb_money_sync(p_record uuid)
returns void language plpgsql security definer set search_path = public as $$
declare r bb_records; o bb_objects; v_in boolean;
begin
  select * into r from bb_records where id = p_record;
  select * into o from bb_objects where id = r.object_id;
  v_in := o.money_field is not null and r.archived_at is null and (not o.workflow or r.status_id = any(o.money_statuses));
  update bb_records set money_at = case when v_in then coalesce(money_at, now()) else null end where id = r.id and (money_at is null) = v_in;
end $$;

-- Sesudah simpan/pindah/arsip: hitung ulang status uang (dibungkus agar fungsi lama tidak perlu diubah strukturnya)
create or replace function public.bb_records_money_trg()
returns trigger language plpgsql security definer set search_path = public as $$
declare o bb_objects; v_in boolean;
begin
  select * into o from bb_objects where id = new.object_id;
  v_in := o.money_field is not null and new.archived_at is null and (not o.workflow or new.status_id = any(o.money_statuses));
  if v_in and new.money_at is null then new.money_at := now();
  elsif not v_in then new.money_at := null; end if;
  return new;
end $$;
drop trigger if exists bb_records_money on public.bb_records;
create trigger bb_records_money before insert or update of status_id, archived_at, data on public.bb_records for each row execute function public.bb_records_money_trg();

create or replace function public.bb_money_save(p_kos uuid, p_object uuid, p jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare o bb_objects; v_field text := nullif(p->>'money_field', ''); v_st uuid[]; v_acc text := coalesce(nullif(p->>'money_account', ''), 'kas');
begin
  perform bb_kustom(p_kos, 'settings');
  select * into o from bb_objects where id = p_object and kos_id = p_kos;
  if o.id is null then raise exception 'Jenis data tidak ditemukan'; end if;
  if v_field is not null and not exists (select 1 from bb_fields where object_id = o.id and key = v_field and active and type = 'currency') then
    raise exception 'Pilih field bertipe Uang (Rp)'; end if;
  select coalesce(array_agg(x::uuid), '{}') into v_st from jsonb_array_elements_text(coalesce(p->'money_statuses', '[]')) x;
  if exists (select 1 from unnest(v_st) s where not exists (select 1 from bb_statuses where id = s and object_id = o.id and active)) then raise exception 'Status tidak dikenal'; end if;
  if v_field is not null and o.workflow and cardinality(v_st) = 0 then raise exception 'Pilih minimal satu status kapan uang dihitung masuk (mis. Diambil)'; end if;
  if v_acc not in ('kas', 'bank') then raise exception 'Pilih kas atau bank'; end if;
  update bb_objects set money_field = v_field, money_statuses = case when v_field is null then '{}' else v_st end, money_account = v_acc where id = o.id;
  -- hitung ulang catatan lama: yang sudah memenuhi syarat dianggap masuk sejak status terakhirnya
  update bb_records r set money_at = case when v_field is not null and r.archived_at is null and (not o.workflow or r.status_id = any(v_st))
      then coalesce(r.money_at, case when o.workflow then r.status_since else r.created_at end) else null end
  where r.object_id = o.id;
  perform config_log(p_kos, 'builder_uang', o.name, jsonb_build_object('field', o.money_field, 'status', o.money_statuses, 'akun', o.money_account), p, null, 'menengah', actor_email());
end $$;

-- nilai uang masuk satu catatan (0 bila field kosong)
create or replace function public.bb_money(p_record bb_records)
returns numeric language sql stable security definer set search_path = public as $$
  select coalesce(case when (p_record.data->>o.money_field) ~ '^-?[0-9]+(\.[0-9]+)?$' then (p_record.data->>o.money_field)::numeric end, 0)
  from bb_objects o where o.id = p_record.object_id;
$$;

-- Kas: uang masuk catatan kustom ikut saldo kas/bank
select public._prasara_patch('public.retail_ledger(uuid)',
  '    union all select account, -amount from expenses where kos_id = p_kos',
  '    union all select o.money_account, bb_money(r) from bb_records r join bb_objects o on o.id = r.object_id where r.kos_id = p_kos and r.money_at is not null
    union all select account, -amount from expenses where kos_id = p_kos');
select public._prasara_patch('public.retail_ledger_internal(uuid)',
  '    union all select account, -amount from expenses where kos_id = p_kos',
  '    union all select o.money_account, bb_money(r) from bb_records r join bb_objects o on o.id = r.object_id where r.kos_id = p_kos and r.money_at is not null
    union all select account, -amount from expenses where kos_id = p_kos');

-- Pembukuan: uang masuk catatan → Kas/Bank vs Pendapatan jasa
select public._prasara_patch('public.acct_desired(uuid)',
  '  union all
  select ''purchase_return'',',
  '  union all
  select ''bb_record'', r.id, (r.money_at at time zone ''Asia/Jakarta'')::date, o.name || '' '' || r.number || '' · '' || r.title, x.k, x.v
  from bb_records r join bb_objects o on o.id = r.object_id
    cross join lateral (values (o.money_account, bb_money(r)), (''pendapatan_jasa'', -bb_money(r))) x(k, v)
  where r.kos_id = p_kos and r.money_at is not null and bb_money(r) <> 0
  union all
  select ''purchase_return'',');

-- Ringkasan pemilik: angka keuangan bisnis kustom (bila uang masuk sudah diatur)
select public._prasara_patch('public.owner_overview2(date)',
  '      v_rev := null; v_cogs := null; v_ops := null; v_recv := null; v_pay := null; v_kas := null; v_bank := null;
      v_flags := v_flags || ''["Bisnis kustom: angka keuangan belum dihitung PRASARA (lihat Laporan kustom)"]'';',
  '      if exists (select 1 from bb_objects where kos_id = k.id and active and money_field is not null) then
        v_rev := coalesce((select sum(bb_money(rec)) from bb_records rec where rec.kos_id = k.id and rec.money_at is not null and (rec.money_at at time zone ''Asia/Jakarta'')::date between m0 and m1), 0)
               + coalesce((select sum(amount) from cash_entries where kos_id = k.id and kind = ''pendapatan_lain'' and date between m0 and m1), 0);
        v_cogs := 0;
        v_ops := coalesce((select sum(amount) from expenses where kos_id = k.id and kind = ''operasional'' and date between m0 and m1), 0);
        v_led := retail_ledger(k.id);
        v_kas := (v_led ->> ''kas'')::numeric; v_bank := (v_led ->> ''bank'')::numeric;
        v_recv := null; v_pay := null;
      else
        v_rev := null; v_cogs := null; v_ops := null; v_recv := null; v_pay := null; v_kas := null; v_bank := null;
        v_flags := v_flags || ''["Bisnis kustom: uang masuk belum diatur di Business Builder (langkah Data & formulir › Uang masuk)"]'';
      end if;');
select public._prasara_patch('public.owner_overview2(date)',
  '''basis'', case when k.business_type = ''retail'' then ''penjualan'' when k.business_type = ''jasa'' then ''pesanan selesai'' else ''kas'' end,',
  '''basis'', case when k.business_type = ''retail'' then ''penjualan'' when k.business_type = ''jasa'' then ''pesanan selesai'' when k.business_type = ''kustom'' then ''status catatan'' else ''kas'' end,');

-- Ringkasan keuangan bisnis kustom (basis: uang masuk saat catatan mencapai status yang diatur)
create or replace function public.bb_finance(p_kos uuid, p_from date, p_to date)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_in numeric; v_lain numeric; v_ops numeric; v_modal numeric; v_non numeric; v_prive numeric;
begin
  perform bb_kustom(p_kos, 'finance');
  select coalesce(sum(bb_money(r)), 0) into v_in from bb_records r where r.kos_id = p_kos and r.money_at is not null and (r.money_at at time zone 'Asia/Jakarta')::date between p_from and p_to;
  select coalesce(sum(amount) filter (where kind = 'pendapatan_lain'), 0), coalesce(sum(amount) filter (where kind = 'prive'), 0) into v_lain, v_prive from cash_entries where kos_id = p_kos and date between p_from and p_to;
  select coalesce(sum(amount) filter (where kind = 'operasional'), 0), coalesce(sum(amount) filter (where kind = 'modal'), 0), coalesce(sum(amount) filter (where kind = 'non_operasional'), 0)
    into v_ops, v_modal, v_non from expenses where kos_id = p_kos and date between p_from and p_to;
  return jsonb_build_object('from', p_from, 'to', p_to, 'uang_masuk', v_in, 'pendapatan_lain', v_lain, 'biaya', v_ops, 'modal', v_modal, 'non_operasional', v_non, 'prive', v_prive,
    'laba', v_in + v_lain - v_ops, 'configured', exists (select 1 from bb_objects where kos_id = p_kos and active and money_field is not null),
    'per_jenis', coalesce((select jsonb_agg(jsonb_build_object('name', o.name, 'icon', o.icon, 'n', z.n, 'total', z.t) order by z.t desc) from (
      select r.object_id, count(*) n, sum(bb_money(r)) t from bb_records r where r.kos_id = p_kos and r.money_at is not null and (r.money_at at time zone 'Asia/Jakarta')::date between p_from and p_to group by 1) z
      join bb_objects o on o.id = z.object_id), '[]'),
    'biaya_per_kategori', coalesce((select jsonb_agg(jsonb_build_object('name', coalesce(c.name, 'Lainnya'), 'total', z.t) order by z.t desc) from (
      select category_id, sum(amount) t from expenses where kos_id = p_kos and kind = 'operasional' and date between p_from and p_to group by 1) z left join expense_categories c on c.id = z.category_id), '[]'));
end $$;
revoke execute on function public.bb_finance(uuid, date, date) from public, anon;
grant execute on function public.bb_finance(uuid, date, date) to authenticated;

-- Dashboard: uang masuk hari ini & bulan ini (hanya untuk yang boleh melihat uang)
select public._prasara_patch('public.bb_dashboard(uuid)',
  '''today'', (select count(*) from bb_records where kos_id = p_kos',
  '''money'', case when member_in(''finance'', p_kos) and exists (select 1 from bb_objects where kos_id = p_kos and active and money_field is not null) then jsonb_build_object(
        ''hari_ini'', (select coalesce(sum(bb_money(r)), 0) from bb_records r where r.kos_id = p_kos and r.money_at is not null and (r.money_at at time zone ''Asia/Jakarta'')::date = (now() at time zone ''Asia/Jakarta'')::date),
        ''bulan_ini'', (select coalesce(sum(bb_money(r)), 0) from bb_records r where r.kos_id = p_kos and r.money_at is not null and date_trunc(''month'', r.money_at at time zone ''Asia/Jakarta'') = date_trunc(''month'', now() at time zone ''Asia/Jakarta''))) end,
    ''today'', (select count(*) from bb_records where kos_id = p_kos');

-- Modul Kas & Pembukuan untuk bisnis kustom
insert into public.modules(code, name, description, applies_to, core, depends_on, entitlement, paths, data_used, status, sort) values
  ('k_kas', 'Kas & biaya', 'Saldo kas/bank dari uang masuk catatan, biaya, setoran modal, dan uang lain.', '{kustom}', true, '{}', null, '{/kas}', 'Uang masuk, biaya, kas', 'available', 5)
on conflict (code) do nothing;
update public.modules set applies_to = applies_to || '{kustom}'::text[] where code in ('u_akuntansi') and not ('kustom' = any(applies_to));
insert into public.business_modules(kos_id, module_code, active, updated_by)
select k.id, 'k_kas', true, 'sistem' from public.kos k where k.business_type = 'kustom' on conflict do nothing;
-- kategori biaya untuk bisnis kustom (yang baru dan yang sudah ada)
insert into public.expense_categories(kos_id, name, kind)
select k.id, x.n, x.k from public.kos k cross join (values ('Gaji karyawan', 'operasional'), ('Sewa tempat', 'operasional'), ('Listrik dan air', 'operasional'),
  ('Bahan / spare part', 'operasional'), ('Transportasi', 'operasional'), ('Perbaikan', 'operasional'), ('Peralatan', 'modal')) x(n, k)
where k.business_type = 'kustom' and not exists (select 1 from public.expense_categories c where c.kos_id = k.id);
select public._prasara_patch('public.create_business(text,text,text,integer,text)',
  '    perform bb_seed_template(v_id, case when p_prefix in (''bengkel'', ''salon'') then p_prefix else ''kosong'' end);',
  '    perform bb_seed_template(v_id, case when p_prefix in (''bengkel'', ''salon'') then p_prefix else ''kosong'' end);
    insert into expense_categories(kos_id, name, kind) values (v_id, ''Gaji karyawan'', ''operasional''), (v_id, ''Sewa tempat'', ''operasional''), (v_id, ''Listrik dan air'', ''operasional''),
      (v_id, ''Bahan / spare part'', ''operasional''), (v_id, ''Transportasi'', ''operasional''), (v_id, ''Perbaikan'', ''operasional''), (v_id, ''Peralatan'', ''modal'');');

-- Template: uang masuk langsung terisi (Bengkel: Biaya jasa saat Diambil; Salon: Harga saat Selesai)
select public._prasara_patch('public.bb_seed_template(uuid,text)',
  '    insert into bb_reports(kos_id, object_id, name, metric, field_key, group_by, period_days, sort) values
      (p_kos, o3, ''Servis per status'',',
  '    update bb_objects set money_field = ''biaya_jasa'', money_statuses = array(select id from bb_statuses where object_id = o3 and label = ''Diambil'') where id = o3;
    insert into bb_reports(kos_id, object_id, name, metric, field_key, group_by, period_days, sort) values
      (p_kos, o3, ''Servis per status'',');
select public._prasara_patch('public.bb_seed_template(uuid,text)',
  '    insert into bb_reports(kos_id, object_id, name, metric, field_key, group_by, period_days, sort) values
      (p_kos, o2, ''Janji temu per status (30 hari)'',',
  '    update bb_objects set money_field = ''harga'', money_statuses = array(select id from bb_statuses where object_id = o2 and label = ''Selesai'') where id = o2;
    insert into bb_reports(kos_id, object_id, name, metric, field_key, group_by, period_days, sort) values
      (p_kos, o2, ''Janji temu per status (30 hari)'',');

-- Field uang yang dipakai sebagai uang masuk tidak boleh dinonaktifkan/diganti tipe
select public._prasara_patch('public.bb_field_save(uuid,uuid,uuid,jsonb)',
  '    if coalesce((p->>''active'')::boolean, true) = false and exists (select 1 from bb_objects where id = p_object and title_field = f.key) then',
  '    if (coalesce((p->>''active'')::boolean, true) = false or v_type <> ''currency'') and exists (select 1 from bb_objects where id = p_object and money_field = f.key) then
      raise exception ''Field ini dipakai sebagai uang masuk. Ubah pengaturan Uang masuk dulu.''; end if;
    if coalesce((p->>''active'')::boolean, true) = false and exists (select 1 from bb_objects where id = p_object and title_field = f.key) then');

-- Validasi: uang masuk lengkap & saran bila belum diatur
select public._prasara_patch('public.bb_validate(uuid)',
  '  if not exists (select 1 from bb_reports where kos_id = p_kos) then',
  '  if exists (select 1 from bb_objects bo where bo.kos_id = p_kos and bo.active and bo.money_field is not null and (not exists (select 1 from bb_fields bf where bf.object_id = bo.id and bf.key = bo.money_field and bf.active and bf.type = ''currency'')
      or (bo.workflow and not exists (select 1 from bb_statuses bs where bs.id = any(bo.money_statuses) and bs.active)))) then
    e := e || jsonb_build_object(''area'', ''Uang masuk'', ''masalah'', ''Pengaturan uang masuk memakai field/status yang tidak aktif'', ''solusi'', ''Buka Data & formulir › Uang masuk dan pilih ulang.''); end if;
  if not exists (select 1 from bb_objects where kos_id = p_kos and active and money_field is not null) then
    w := w || jsonb_build_object(''area'', ''Uang masuk'', ''masalah'', ''Belum ada jenis data yang dihitung sebagai uang masuk'', ''solusi'', ''Bila usaha menerima uang (mis. biaya servis), atur di Data & formulir › Uang masuk agar Kas & laporan keuangan terisi.''); end if;
  if not exists (select 1 from bb_reports where kos_id = p_kos) then');

-- ================= (2) Isian tambahan (custom field) di menu bawaan =================
alter table public.occupants add column if not exists extra jsonb not null default '{}';
alter table public.products add column if not exists extra jsonb not null default '{}';
alter table public.svc_orders add column if not exists extra jsonb not null default '{}';
alter table public.contacts add column if not exists extra jsonb not null default '{}';

create table if not exists public.cf_fields (
  id uuid primary key default gen_random_uuid(),
  kos_id uuid not null references public.kos(id) on delete cascade,
  entity text not null check (entity in ('occupant', 'product', 'svc_order', 'contact')),
  key text not null check (key ~ '^[a-z][a-z0-9_]{1,30}$'),
  label text not null check (length(trim(label)) between 1 and 60),
  type text not null check (type in ('text', 'longtext', 'number', 'currency', 'date', 'select', 'multiselect', 'boolean', 'phone')),
  help text check (help is null or length(help) <= 200),
  required boolean not null default false,
  choices text[] not null default '{}',
  min_value numeric,
  max_value numeric,
  in_list boolean not null default false,
  sort int not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (kos_id, entity, key)
);
alter table public.cf_fields enable row level security;
drop policy if exists cf_fields_select on public.cf_fields;
create policy cf_fields_select on public.cf_fields for select using (public.is_member(kos_id));
grant select on public.cf_fields to authenticated;
drop trigger if exists zz_kos_open_guard on public.cf_fields;
create trigger zz_kos_open_guard before insert or update or delete on public.cf_fields for each row execute function public.kos_open_guard();

-- jenis bisnis yang memakai entitas ini & area aksesnya
create or replace function public.cf_entity_area(p_entity text, p_type text)
returns text language sql immutable as $$
  select case
    when p_entity = 'occupant' and p_type = 'properti' then 'rent'
    when p_entity = 'product' and p_type in ('retail', 'jasa') then 'stock'
    when p_entity = 'svc_order' and p_type = 'jasa' then 'sell'
    when p_entity = 'contact' and p_type in ('retail', 'jasa') then 'sell,stock,finance'
  end;
$$;

create or replace function public.cf_field_save(p_kos uuid, p_id uuid, p jsonb)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid := p_id; f cf_fields; v_ent text := p->>'entity'; v_type text := p->>'type'; v_key text; v_choices text[]; v_bt text;
begin
  if not member_in('settings', p_kos) then raise exception 'Hanya pemilik/pengelola yang bisa mengatur isian tambahan'; end if;
  select business_type into v_bt from kos where id = p_kos;
  if v_id is not null then select * into f from cf_fields where id = v_id and kos_id = p_kos; if f.id is null then raise exception 'Isian tidak ditemukan'; end if; v_ent := f.entity; end if;
  if cf_entity_area(v_ent, v_bt) is null then raise exception 'Menu ini tidak tersedia untuk jenis bisnis ini'; end if;
  if coalesce(length(trim(p->>'label')), 0) < 1 then raise exception 'Isi nama isian'; end if;
  if v_type not in ('text', 'longtext', 'number', 'currency', 'date', 'select', 'multiselect', 'boolean', 'phone') then raise exception 'Tipe isian tidak dikenal'; end if;
  select coalesce(array_agg(distinct trim(c)) filter (where trim(c) <> ''), '{}') into v_choices from jsonb_array_elements_text(coalesce(p->'choices', '[]')) c;
  if v_type in ('select', 'multiselect') and coalesce(array_length(v_choices, 1), 0) < 2 then raise exception 'Isi minimal 2 pilihan'; end if;
  if v_id is null then
    if (select count(*) from cf_fields where kos_id = p_kos and entity = v_ent and active) >= 20 then raise exception 'Maksimal 20 isian tambahan per menu'; end if;
    v_key := left(bb_slug(p->>'label'), 24);
    if v_key !~ '^[a-z]' then v_key := 'f_' || v_key; end if;
    if length(v_key) < 2 then v_key := 'f_' || (select count(*) + 1 from cf_fields where kos_id = p_kos and entity = v_ent); end if;
    if exists (select 1 from cf_fields where kos_id = p_kos and entity = v_ent and key = v_key) then raise exception 'Konflik: isian "%" sudah ada di menu ini', trim(p->>'label'); end if;
    insert into cf_fields(kos_id, entity, key, label, type, help, required, choices, min_value, max_value, in_list, sort)
    values (p_kos, v_ent, v_key, trim(p->>'label'), v_type, nullif(trim(p->>'help'), ''), coalesce((p->>'required')::boolean, false), v_choices,
            nullif(p->>'min_value', '')::numeric, nullif(p->>'max_value', '')::numeric, coalesce((p->>'in_list')::boolean, false),
            (select coalesce(max(sort), 0) + 1 from cf_fields where kos_id = p_kos and entity = v_ent)) returning id into v_id;
  else
    if v_type <> f.type and exists (select 1 from occupants where kos_id = p_kos and extra ? f.key union all select 1 from products where kos_id = p_kos and extra ? f.key
        union all select 1 from svc_orders where kos_id = p_kos and extra ? f.key union all select 1 from contacts where kos_id = p_kos and extra ? f.key) then
      raise exception 'Tipe tidak bisa diubah karena isian sudah berisi data'; end if;
    update cf_fields set label = trim(p->>'label'), type = v_type, help = nullif(trim(p->>'help'), ''), required = coalesce((p->>'required')::boolean, required), choices = v_choices,
      min_value = nullif(p->>'min_value', '')::numeric, max_value = nullif(p->>'max_value', '')::numeric, in_list = coalesce((p->>'in_list')::boolean, in_list),
      active = coalesce((p->>'active')::boolean, active), sort = coalesce((p->>'sort')::int, sort) where id = v_id;
  end if;
  perform config_log(p_kos, 'isian_tambahan', trim(p->>'label') || ' (' || v_ent || ')', case when f.id is not null then to_jsonb(f) end, p, null, 'rendah', actor_email());
  return v_id;
end $$;

-- Validasi isi (aturan sama dengan Business Builder, tanpa rujukan)
create or replace function public.cf_clean(p_kos uuid, p_entity text, p_data jsonb)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare f cf_fields; v jsonb; out jsonb := '{}'; t text; n numeric; arr jsonb;
begin
  for f in select * from cf_fields where kos_id = p_kos and entity = p_entity and active order by sort loop
    v := p_data->f.key;
    if v is null or v = 'null'::jsonb or (jsonb_typeof(v) = 'string' and trim(v #>> '{}') = '') or (jsonb_typeof(v) = 'array' and jsonb_array_length(v) = 0) then
      if f.required and f.type <> 'boolean' then raise exception '"%" wajib diisi', f.label; end if;
      if f.type = 'boolean' then out := out || jsonb_build_object(f.key, coalesce(v, 'false'::jsonb) = 'true'::jsonb); end if;
      continue;
    end if;
    t := v #>> '{}';
    case f.type
      when 'text' then if length(t) > 300 then raise exception '"%" terlalu panjang', f.label; end if; out := out || jsonb_build_object(f.key, trim(t));
      when 'longtext' then if length(t) > 2000 then raise exception '"%" terlalu panjang', f.label; end if; out := out || jsonb_build_object(f.key, trim(t));
      when 'phone' then t := regexp_replace(t, '[^0-9+]', '', 'g'); if length(t) < 6 or length(t) > 16 then raise exception '"%" bukan nomor HP yang valid', f.label; end if; out := out || jsonb_build_object(f.key, t);
      when 'number', 'currency' then
        begin n := replace(t, ',', '.')::numeric; exception when others then raise exception '"%" harus angka', f.label; end;
        if f.type = 'currency' and n < 0 and f.min_value is null then raise exception '"%" tidak boleh negatif', f.label; end if;
        if f.min_value is not null and n < f.min_value then raise exception '"%" minimal %', f.label, f.min_value; end if;
        if f.max_value is not null and n > f.max_value then raise exception '"%" maksimal %', f.label, f.max_value; end if;
        out := out || jsonb_build_object(f.key, n);
      when 'date' then begin out := out || jsonb_build_object(f.key, t::date::text); exception when others then raise exception '"%" bukan tanggal', f.label; end;
      when 'boolean' then out := out || jsonb_build_object(f.key, t in ('true', '1', 'ya'));
      when 'select' then if not (t = any(f.choices)) then raise exception 'Pilihan "%" tidak tersedia untuk %', t, f.label; end if; out := out || jsonb_build_object(f.key, t);
      when 'multiselect' then
        if jsonb_typeof(v) <> 'array' then raise exception '"%" harus daftar pilihan', f.label; end if;
        select coalesce(jsonb_agg(distinct c), '[]') into arr from jsonb_array_elements_text(v) c;
        if exists (select 1 from jsonb_array_elements_text(arr) c where not (c = any(f.choices))) then raise exception 'Ada pilihan yang tidak tersedia untuk %', f.label; end if;
        out := out || jsonb_build_object(f.key, arr);
    end case;
  end loop;
  return out;
end $$;

-- Simpan isian tambahan satu data (isian lama yang field-nya dinonaktifkan tetap disimpan)
create or replace function public.cf_set(p_kos uuid, p_entity text, p_id uuid, p_data jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_bt text; v_area text; v_new jsonb; v_old jsonb; v_keep jsonb;
begin
  select business_type into v_bt from kos where id = p_kos;
  v_area := cf_entity_area(p_entity, v_bt);
  if v_area is null then raise exception 'Menu ini tidak tersedia untuk jenis bisnis ini'; end if;
  if not member_in(v_area, p_kos) then raise exception 'Tidak punya akses untuk mengubah data ini'; end if;
  v_new := cf_clean(p_kos, p_entity, coalesce(p_data, '{}'));
  execute format('select extra from %I where id = $1 and kos_id = $2 for update', case p_entity when 'occupant' then 'occupants' when 'product' then 'products' when 'svc_order' then 'svc_orders' else 'contacts' end)
    into v_old using p_id, p_kos;
  if v_old is null then raise exception 'Data tidak ditemukan'; end if;
  -- simpan isi untuk field nonaktif agar tidak hilang
  select coalesce(jsonb_object_agg(k, v_old->k), '{}') into v_keep from jsonb_object_keys(v_old) k
  where not exists (select 1 from cf_fields where kos_id = p_kos and entity = p_entity and key = k and active);
  execute format('update %I set extra = $1 where id = $2 and kos_id = $3', case p_entity when 'occupant' then 'occupants' when 'product' then 'products' when 'svc_order' then 'svc_orders' else 'contacts' end)
    using v_keep || v_new, p_id, p_kos;
  if p_entity = 'svc_order' and v_old is distinct from (v_keep || v_new) then perform svc_event(p_id, 'isian', 'Isian tambahan diubah'); end if;
  return v_keep || v_new;
end $$;

-- Baca isian tambahan satu data (akses sama dengan menu datanya; pesanan jasa juga untuk petugas proses)
create or replace function public.cf_get(p_kos uuid, p_entity text, p_id uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_bt text; v_area text; v jsonb;
begin
  select business_type into v_bt from kos where id = p_kos;
  v_area := cf_entity_area(p_entity, v_bt);
  if v_area is null then raise exception 'Menu ini tidak tersedia untuk jenis bisnis ini'; end if;
  if p_entity = 'svc_order' then v_area := 'sell,ops,finance'; elsif p_entity = 'product' then v_area := 'stock,sell,finance'; end if;
  if not member_in(v_area, p_kos) then raise exception 'Tidak punya akses'; end if;
  execute format('select extra from %I where id = $1 and kos_id = $2', case p_entity when 'occupant' then 'occupants' when 'product' then 'products' when 'svc_order' then 'svc_orders' else 'contacts' end)
    into v using p_id, p_kos;
  return coalesce(v, '{}');
end $$;
revoke execute on function public.cf_get(uuid, text, uuid) from public, anon;
grant execute on function public.cf_get(uuid, text, uuid) to authenticated;

-- Unduh semua data: isian tambahan
select public._prasara_patch('public.business_export_sheets(uuid)',
  '  s := s || xs(''Persetujuan'',',
  '  if exists (select 1 from cf_fields where kos_id = p_kos) then
    s := s || xs(''Isian tambahan'', array[''Menu'', ''Data'', ''Isian'', ''Nilai''], array[''t'', ''t'', ''t'', ''t''],
      (select jsonb_agg(jsonb_build_array(z.menu, z.nama, coalesce(f.label, z.k), z.v) order by z.menu, z.nama)
       from (select ''Penghuni'' menu, ''occupant'' ent, name nama, e.key k, e.value #>> ''{}'' v from occupants, jsonb_each(extra) e where kos_id = p_kos
             union all select ''Barang'', ''product'', name, e.key, e.value #>> ''{}'' from products, jsonb_each(extra) e where kos_id = p_kos
             union all select ''Pesanan jasa'', ''svc_order'', number, e.key, e.value #>> ''{}'' from svc_orders, jsonb_each(extra) e where kos_id = p_kos
             union all select ''Kontak'', ''contact'', name, e.key, e.value #>> ''{}'' from contacts, jsonb_each(extra) e where kos_id = p_kos) z
       left join cf_fields f on f.kos_id = p_kos and f.entity = z.ent and f.key = z.k));
  end if;
  s := s || xs(''Persetujuan'',');

-- extra hanya boleh diubah lewat cf_set (bukan update langsung yang melewati validasi)
create or replace function public.cf_extra_guard()
returns trigger language plpgsql as $$
begin
  if tg_op = 'UPDATE' and new.extra is distinct from old.extra and pg_trigger_depth() = 1 and current_user in ('authenticated', 'anon') then
    -- update langsung dari aplikasi: pertahankan nilai lama (cf_set berjalan sebagai pemilik fungsi)
    new.extra := old.extra;
  elsif tg_op = 'INSERT' and current_user in ('authenticated', 'anon') then
    new.extra := '{}';
  end if;
  return new;
end $$;
do $$ declare t text; begin
  foreach t in array array['occupants', 'products', 'svc_orders', 'contacts'] loop
    execute format('drop trigger if exists cf_extra_guard on public.%I', t);
    execute format('create trigger cf_extra_guard before insert or update of extra on public.%I for each row execute function public.cf_extra_guard()', t);
  end loop;
end $$;

revoke execute on function public.bb_money_sync(uuid), public.bb_records_money_trg(), public.cf_clean(uuid, text, jsonb), public.cf_extra_guard() from public, anon, authenticated;
revoke execute on function public.bb_money_save(uuid, uuid, jsonb), public.cf_field_save(uuid, uuid, jsonb), public.cf_set(uuid, text, uuid, jsonb) from public, anon;
grant execute on function public.bb_money_save(uuid, uuid, jsonb), public.cf_field_save(uuid, uuid, jsonb), public.cf_set(uuid, text, uuid, jsonb) to authenticated;
grant execute on function public.bb_money(bb_records) to authenticated;

drop function public._prasara_patch(text, text, text);
