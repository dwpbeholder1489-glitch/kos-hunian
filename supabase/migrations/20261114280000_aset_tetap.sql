-- Aset tetap & penyusutan (Modul V2.0 Bab 12; backlog P1). Modul u_aset, semua jenis bisnis, area finance.
-- Prinsip:
--   * Pembelian aset = pengeluaran jenis "modal" (sudah menjurnal Aset tetap ↔ Kas/Bank). Daftar aset menautkan pengeluaran itu
--     (dibuat dari sini, atau "jadikan aset" dari pengeluaran modal yang sudah ada). Aset yang sudah dimiliki sebelum memakai
--     PRASARA dicatat dengan nilai saat ini (Aset tetap ↔ Ekuitas saldo awal) dan sisa umur manfaat.
--   * Penyusutan garis lurus per bulan, mulai bulan perolehan, HANYA untuk bulan yang sudah lewat. Tidak ada tabel penyusutan:
--     jadwal dihitung dari data aset (asset_dep_rows) dan masuk jurnal lewat acct_desired (Beban penyusutan ↔ Akumulasi penyusutan),
--     sehingga perubahan nilai/umur otomatis menjadi jurnal koreksi (acct_sync), dan periode tertutup tetap terlindungi.
--   * Pelepasan (dijual/dibuang/hilang): kas masuk, aset & akumulasi dikeluarkan, selisih = pendapatan lain / beban non-operasional.
--   * Penyusutan bukan uang keluar: tidak mengubah saldo kas dan tidak muncul di menu Pengeluaran; tampil di Pembukuan & Analisis.

create table if not exists public.fixed_assets (
  id uuid primary key default gen_random_uuid(),
  kos_id uuid not null references public.kos(id) on delete cascade,
  name text not null check (length(trim(name)) between 2 and 100),
  category text check (category is null or length(category) <= 40),
  source text not null check (source in ('beli', 'awal')),             -- beli = dari pengeluaran modal; awal = sudah dimiliki sebelumnya
  expense_id uuid references public.expenses(id) on delete set null,
  own_expense boolean not null default false,                           -- pengeluarannya dibuat dari menu Aset (ikut dihapus bila aset dihapus)
  start_date date not null,                                             -- tanggal perolehan / tanggal mulai dicatat
  cost numeric(14,2) not null check (cost > 0),                         -- harga perolehan (atau nilai saat mulai dicatat)
  salvage numeric(14,2) not null default 0 check (salvage >= 0),        -- perkiraan nilai sisa
  life_months int check (life_months is null or life_months between 1 and 600),  -- null = tidak disusutkan (mis. tanah)
  branch_id uuid references public.branches(id),
  status text not null default 'aktif' check (status in ('aktif', 'dilepas')),
  disposed_date date, disposal_kind text check (disposal_kind is null or disposal_kind in ('dijual', 'dibuang', 'hilang')),
  disposal_amount numeric(14,2) check (disposal_amount is null or disposal_amount >= 0),
  disposal_account text check (disposal_account is null or disposal_account in ('kas', 'bank')),
  disposal_note text check (disposal_note is null or length(disposal_note) <= 300),
  note text check (note is null or length(note) <= 300),
  created_by uuid default auth.uid(), created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  check (salvage < cost)
);
create index if not exists fixed_assets_kos on public.fixed_assets(kos_id, status);
create unique index if not exists fixed_assets_expense on public.fixed_assets(expense_id) where expense_id is not null;

alter table public.fixed_assets enable row level security;
drop policy if exists fixed_assets_select on public.fixed_assets;
create policy fixed_assets_select on public.fixed_assets for select using (member_can(kos_id, 'finance'));
grant select on public.fixed_assets to authenticated;
drop trigger if exists zz_kos_open_guard on public.fixed_assets;
create trigger zz_kos_open_guard before insert or update or delete on public.fixed_assets for each row execute function public.kos_open_guard();

-- ---------- Jadwal penyusutan (dihitung, bukan disimpan) ----------
-- Satu baris per aset per bulan yang SUDAH LEWAT (dan sebelum bulan pelepasan). Pembulatan kumulatif: total selalu = cost − salvage.
create or replace function public.asset_dep_rows(p_kos uuid)
returns table(asset_id uuid, period date, period_end date, amount numeric, dep_id uuid)
language sql stable security definer set search_path = public as $$
  select a.id, (date_trunc('month', a.start_date) + make_interval(months => i - 1))::date,
         (date_trunc('month', a.start_date) + make_interval(months => i) - interval '1 day')::date,
         round((a.cost - a.salvage) * i / a.life_months, 2) - round((a.cost - a.salvage) * (i - 1) / a.life_months, 2),
         md5(a.id::text || ':' || i::text)::uuid
  from fixed_assets a
  cross join lateral generate_series(1, least(a.life_months,
    -- jumlah bulan penuh dari bulan perolehan sampai bulan lalu (atau sampai bulan sebelum dilepas)
    (extract(year from age(date_trunc('month', coalesce(case when a.status = 'dilepas' then a.disposed_date end, (now() at time zone 'Asia/Jakarta')::date)),
                           date_trunc('month', a.start_date))) * 12
     + extract(month from age(date_trunc('month', coalesce(case when a.status = 'dilepas' then a.disposed_date end, (now() at time zone 'Asia/Jakarta')::date)),
                              date_trunc('month', a.start_date))))::int)) i
  where a.kos_id = p_kos and a.life_months is not null;
$$;

create or replace function public.asset_accumulated(p_asset uuid)
returns numeric language sql stable security definer set search_path = public as $$
  select coalesce((select sum(d.amount) from fixed_assets a, asset_dep_rows(a.kos_id) d where a.id = p_asset and d.asset_id = a.id), 0);
$$;

-- ---------- Akun & jurnal ----------
create or replace function public._prasara_patch(p_sig text, p_old text, p_new text)
returns void language plpgsql as $$
declare d text;
begin
  d := pg_get_functiondef(p_sig::regprocedure);
  if position(p_old in d) = 0 then raise exception 'patch %: potongan tidak ditemukan', p_sig; end if;
  execute replace(d, p_old, p_new);
end $$;

select public._prasara_patch('public.acct_ensure(uuid)',
  $x$('2-1500', 'PPN keluaran', 'kewajiban', 'ppn_keluaran')$x$,
  $x$('2-1500', 'PPN keluaran', 'kewajiban', 'ppn_keluaran'),
    ('1-2900', 'Akumulasi penyusutan aset', 'aset', 'akum_penyusutan'),
    ('6-2000', 'Beban penyusutan', 'beban', 'beban_penyusutan')$x$);
select public.acct_ensure(id) from public.kos;

select public._prasara_patch('public.acct_desired(uuid)',
  $x$where r.kos_id = p_kos;$x$,
  $x$where r.kos_id = p_kos
  union all
  -- aset yang sudah dimiliki sebelumnya: Aset tetap ↔ Ekuitas saldo awal
  select 'asset_open', fa.id, fa.start_date, 'Aset tetap (sudah dimiliki) · ' || fa.name, x.k, x.v from fixed_assets fa
    cross join lateral (values ('aset_tetap', fa.cost), ('saldo_awal', -fa.cost)) x(k, v)
    where fa.kos_id = p_kos and fa.source = 'awal'
  union all
  -- penyusutan bulanan
  select 'asset_dep', d.dep_id, d.period_end, 'Penyusutan ' || to_char(d.period, 'MM/YYYY') || ' · ' || fa.name, x.k, x.v
  from asset_dep_rows(p_kos) d join fixed_assets fa on fa.id = d.asset_id
    cross join lateral (values ('beban_penyusutan', d.amount), ('akum_penyusutan', -d.amount)) x(k, v)
    where d.amount <> 0
  union all
  -- pelepasan aset
  select 'asset_disposal', fa.id, fa.disposed_date,
         case fa.disposal_kind when 'dijual' then 'Aset dijual' when 'hilang' then 'Aset hilang' else 'Aset dibuang' end || ' · ' || fa.name, x.k, x.v
  from fixed_assets fa cross join lateral (select asset_accumulated(fa.id) acc) ac
    cross join lateral (values
      (coalesce(fa.disposal_account, 'kas'), coalesce(fa.disposal_amount, 0)),
      ('akum_penyusutan', ac.acc),
      ('aset_tetap', -fa.cost),
      ('pendapatan_lain', -greatest(coalesce(fa.disposal_amount, 0) + ac.acc - fa.cost, 0)),
      ('beban_lain', greatest(fa.cost - ac.acc - coalesce(fa.disposal_amount, 0), 0))) x(k, v)
    where fa.kos_id = p_kos and fa.status = 'dilepas' and x.v <> 0;$x$);
drop function public._prasara_patch(text, text, text);

-- ---------- Izin ----------
create or replace function public.asset_guard(p_kos uuid)
returns void language plpgsql stable security definer set search_path = public as $$
begin
  if not member_in('finance', p_kos) then raise exception 'Hanya pemilik atau bagian keuangan yang bisa mengelola aset'; end if;
  if not module_on(p_kos, 'u_aset') then raise exception 'Modul Aset tetap belum aktif (Konfigurasi › Modul)'; end if;
end $$;

create or replace function public.asset_category(p_kos uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare v uuid;
begin
  select id into v from expense_categories where kos_id = p_kos and name = 'Pembelian aset';
  if v is null then insert into expense_categories(kos_id, name, kind) values (p_kos, 'Pembelian aset', 'modal') on conflict (kos_id, name) do nothing returning id into v; end if;
  if v is null then select id into v from expense_categories where kos_id = p_kos and name = 'Pembelian aset'; end if;
  return v;
end $$;

-- ---------- Simpan aset ----------
-- p: {name, category, mode: 'beli'|'awal'|'tautkan', expense_id (tautkan), date, cost, account (beli), salvage, life_months (null = tidak disusutkan), note}
create or replace function public.asset_save(p_kos uuid, p_id uuid, p jsonb)
returns uuid language plpgsql security definer set search_path = public as $$
declare a fixed_assets; e expenses; v_id uuid := coalesce(p_id, gen_random_uuid()); v_today date := (now() at time zone 'Asia/Jakarta')::date;
        v_name text := trim(coalesce(p->>'name', '')); v_mode text := coalesce(p->>'mode', 'beli');
        v_date date := nullif(p->>'date', '')::date; v_cost numeric := round(nullif(p->>'cost', '')::numeric, 2);
        v_salv numeric := round(coalesce(nullif(p->>'salvage', '')::numeric, 0), 2); v_life int := nullif(p->>'life_months', '')::int;
        v_cat text := nullif(trim(coalesce(p->>'category', '')), ''); v_note text := nullif(trim(coalesce(p->>'note', '')), ''); v_exp uuid;
begin
  perform asset_guard(p_kos);
  if length(v_name) < 2 then raise exception 'Isi nama aset (mis. Kulkas showcase, Motor pengantar)'; end if;
  if v_life is not null and (v_life < 1 or v_life > 600) then raise exception 'Umur manfaat 1 bulan sampai 50 tahun'; end if;
  if v_salv < 0 then raise exception 'Nilai sisa tidak boleh minus'; end if;

  if p_id is not null then
    select * into a from fixed_assets where id = p_id and kos_id = p_kos for update;
    if a.id is null then raise exception 'Aset tidak ditemukan'; end if;
    if a.status = 'dilepas' then raise exception 'Aset ini sudah dilepas. Batalkan pelepasannya dulu bila ingin mengubah.'; end if;
    -- nilai & tanggal aset hasil pembelian mengikuti pengeluarannya; aset "sudah dimiliki" boleh diubah
    if a.source = 'awal' then
      v_date := coalesce(v_date, a.start_date); v_cost := coalesce(v_cost, a.cost);
      if v_cost <= 0 then raise exception 'Isi nilai aset'; end if;
      if v_date > v_today then raise exception 'Tanggal belum tiba'; end if;
    else
      v_date := a.start_date; v_cost := a.cost;
    end if;
    if v_salv >= v_cost then raise exception 'Nilai sisa harus lebih kecil dari nilai aset'; end if;
    update fixed_assets set name = v_name, category = v_cat, start_date = v_date, cost = v_cost, salvage = v_salv, life_months = v_life, note = v_note, updated_at = now() where id = a.id;
    return a.id;
  end if;

  if v_mode = 'tautkan' then
    select * into e from expenses where id = nullif(p->>'expense_id', '')::uuid and kos_id = p_kos;
    if e.id is null or e.kind <> 'modal' then raise exception 'Pengeluaran modal tidak ditemukan'; end if;
    if exists (select 1 from fixed_assets where expense_id = e.id) then raise exception 'Pengeluaran ini sudah dicatat sebagai aset'; end if;
    v_date := e.date; v_cost := e.amount; v_exp := e.id;
  elsif v_mode = 'beli' then
    if v_cost is null or v_cost <= 0 then raise exception 'Isi harga beli aset'; end if;
    v_date := coalesce(v_date, v_today);
    if v_date > v_today then raise exception 'Tanggal beli belum tiba — catat saat asetnya sudah dibeli'; end if;
    if coalesce(p->>'account', '') not in ('kas', 'bank') then raise exception 'Pilih dibayar dari kas atau bank'; end if;
    insert into expenses(kos_id, date, category_id, kind, amount, description, account)
    values (p_kos, v_date, asset_category(p_kos), 'modal', v_cost, 'Beli aset · ' || v_name, p->>'account') returning id into v_exp;
  elsif v_mode = 'awal' then
    if v_cost is null or v_cost <= 0 then raise exception 'Isi perkiraan nilai aset saat ini'; end if;
    v_date := coalesce(v_date, v_today);
    if v_date > v_today then raise exception 'Tanggal belum tiba'; end if;
  else
    raise exception 'Cara perolehan tidak dikenal';
  end if;
  if v_salv >= v_cost then raise exception 'Nilai sisa harus lebih kecil dari nilai aset'; end if;

  insert into fixed_assets(id, kos_id, name, category, source, expense_id, own_expense, start_date, cost, salvage, life_months, note)
  values (v_id, p_kos, v_name, v_cat, case when v_mode = 'awal' then 'awal' else 'beli' end, v_exp, v_mode = 'beli', v_date, v_cost, v_salv, v_life, v_note);
  perform dom_emit(p_kos, 'AssetRegistered', 'fixed_asset', v_id, v_id::text, 'finance', 'Aset dicatat · ' || v_name || ' · ' || dom_rp(v_cost), v_cost, jsonb_build_object('source', v_mode, 'life_months', v_life));
  return v_id;
end $$;

-- ---------- Lepas aset (dijual / dibuang / hilang) & batalkan ----------
create or replace function public.asset_dispose(p_asset uuid, p jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare a fixed_assets; v_today date := (now() at time zone 'Asia/Jakarta')::date; v_kind text := coalesce(p->>'kind', 'dijual');
        v_date date := coalesce(nullif(p->>'date', '')::date, v_today); v_amt numeric := round(coalesce(nullif(p->>'amount', '')::numeric, 0), 2); v_acc numeric; v_book numeric;
begin
  select * into a from fixed_assets where id = p_asset for update;
  if a.id is null then raise exception 'Aset tidak ditemukan'; end if;
  perform asset_guard(a.kos_id);
  if a.status = 'dilepas' then raise exception 'Aset ini sudah dilepas'; end if;
  if v_kind not in ('dijual', 'dibuang', 'hilang') then raise exception 'Pilih dijual, dibuang, atau hilang'; end if;
  if v_date > v_today then raise exception 'Tanggal belum tiba'; end if;
  if v_date < a.start_date then raise exception 'Tanggal pelepasan sebelum tanggal perolehan (%)', to_char(a.start_date, 'DD/MM/YYYY'); end if;
  if v_kind = 'dijual' then
    if v_amt <= 0 then raise exception 'Isi uang hasil penjualan aset'; end if;
    if coalesce(p->>'account', '') not in ('kas', 'bank') then raise exception 'Pilih uang masuk ke kas atau bank'; end if;
  else v_amt := 0;
  end if;
  update fixed_assets set status = 'dilepas', disposed_date = v_date, disposal_kind = v_kind, disposal_amount = v_amt,
    disposal_account = case when v_kind = 'dijual' then p->>'account' end, disposal_note = nullif(trim(coalesce(p->>'note', '')), ''), updated_at = now() where id = a.id;
  v_acc := asset_accumulated(a.id); v_book := a.cost - v_acc;
  perform dom_emit(a.kos_id, 'AssetDisposed', 'fixed_asset', a.id, a.id::text || ':lepas:' || v_date::text, 'finance',
    'Aset ' || v_kind || ' · ' || a.name || case when v_amt > 0 then ' · ' || dom_rp(v_amt) else '' end, v_amt, jsonb_build_object('book_value', v_book));
  return jsonb_build_object('book_value', v_book, 'amount', v_amt, 'gain', v_amt - v_book);
end $$;

create or replace function public.asset_dispose_undo(p_asset uuid, p_reason text)
returns void language plpgsql security definer set search_path = public as $$
declare a fixed_assets;
begin
  select * into a from fixed_assets where id = p_asset for update;
  if a.id is null then raise exception 'Aset tidak ditemukan'; end if;
  perform asset_guard(a.kos_id);
  if a.status <> 'dilepas' then raise exception 'Aset ini masih aktif'; end if;
  if length(trim(coalesce(p_reason, ''))) < 3 then raise exception 'Tulis alasan pembatalan'; end if;
  update fixed_assets set status = 'aktif', disposed_date = null, disposal_kind = null, disposal_amount = null, disposal_account = null,
    disposal_note = null, note = left(coalesce(note || ' · ', '') || 'Pelepasan dibatalkan: ' || trim(p_reason), 300), updated_at = now() where id = a.id;
end $$;

-- Hapus dari daftar aset (salah catat). Pengeluaran yang dibuat dari menu Aset ikut dihapus; yang ditautkan tetap ada di Pengeluaran.
create or replace function public.asset_delete(p_asset uuid, p_reason text)
returns void language plpgsql security definer set search_path = public as $$
declare a fixed_assets;
begin
  select * into a from fixed_assets where id = p_asset for update;
  if a.id is null then raise exception 'Aset tidak ditemukan'; end if;
  perform asset_guard(a.kos_id);
  if length(trim(coalesce(p_reason, ''))) < 3 then raise exception 'Tulis alasan menghapus aset ini'; end if;
  if a.status = 'dilepas' then raise exception 'Aset ini sudah dilepas. Batalkan pelepasannya dulu.'; end if;
  delete from fixed_assets where id = a.id;
  if a.own_expense and a.expense_id is not null then
    perform set_config('prasara.asset_ok', '1', true);
    delete from expenses where id = a.expense_id;
    perform set_config('prasara.asset_ok', '', true);
  end if;
  perform dom_emit(a.kos_id, 'AssetRemoved', 'fixed_asset', a.id, a.id::text || ':hapus', 'finance', 'Aset dihapus dari daftar · ' || a.name || ' · ' || trim(p_reason), a.cost, '{}'::jsonb);
end $$;

-- Pengeluaran pembelian aset tidak dihapus dari menu Pengeluaran selama asetnya masih terdaftar
create or replace function public.expenses_asset_guard()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if current_setting('prasara.asset_ok', true) = '1' then return old; end if;
  if exists (select 1 from fixed_assets where expense_id = old.id) then
    raise exception 'Pengeluaran ini adalah pembelian aset yang terdaftar di menu Aset tetap. Hapus asetnya dari menu Aset tetap lebih dulu.';
  end if;
  return old;
end $$;
drop trigger if exists expenses_asset_guard on public.expenses;
create trigger expenses_asset_guard before delete on public.expenses for each row execute function public.expenses_asset_guard();

-- ---------- Daftar & ringkasan ----------
create or replace function public.asset_list(p_kos uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v jsonb;
begin
  perform asset_guard(p_kos);
  with d as (select asset_id, sum(amount) acc, count(*) n, max(period) last_period from asset_dep_rows(p_kos) group by asset_id),
  x as (select a.*, coalesce(d.acc, 0) acc, coalesce(d.n, 0) n_done,
          case when a.life_months is not null then round((a.cost - a.salvage) / a.life_months, 2) else 0 end monthly
        from fixed_assets a left join d on d.asset_id = a.id where a.kos_id = p_kos)
  select jsonb_build_object(
    'assets', coalesce((select jsonb_agg(jsonb_build_object('id', x.id, 'name', x.name, 'category', x.category, 'source', x.source, 'start_date', x.start_date,
        'cost', x.cost, 'salvage', x.salvage, 'life_months', x.life_months, 'status', x.status, 'note', x.note, 'expense_id', x.expense_id,
        'accumulated', x.acc, 'book_value', x.cost - x.acc, 'monthly', case when x.status = 'aktif' and x.n_done < coalesce(x.life_months, 0) then x.monthly else 0 end,
        'months_done', x.n_done, 'months_left', case when x.life_months is null then null else greatest(x.life_months - x.n_done, 0) end,
        'disposed_date', x.disposed_date, 'disposal_kind', x.disposal_kind, 'disposal_amount', x.disposal_amount, 'disposal_note', x.disposal_note,
        'gain', case when x.status = 'dilepas' then coalesce(x.disposal_amount, 0) - (x.cost - x.acc) end)
        order by (x.status = 'aktif') desc, x.start_date desc, x.name) from x), '[]'),
    'total_cost', coalesce((select sum(cost) from x where status = 'aktif'), 0),
    'total_accumulated', coalesce((select sum(acc) from x where status = 'aktif'), 0),
    'total_book', coalesce((select sum(cost - acc) from x where status = 'aktif'), 0),
    'monthly', coalesce((select sum(monthly) from x where status = 'aktif' and n_done < coalesce(life_months, 0)), 0),
    -- pengeluaran modal 24 bulan terakhir yang belum dicatat sebagai aset
    'candidates', coalesce((select jsonb_agg(jsonb_build_object('id', e.id, 'date', e.date, 'amount', e.amount, 'description', e.description) order by e.date desc)
       from expenses e where e.kos_id = p_kos and e.kind = 'modal' and e.date >= (now() at time zone 'Asia/Jakarta')::date - 730
         and not exists (select 1 from fixed_assets f where f.expense_id = e.id)), '[]')) into v;
  return v;
end $$;

-- Rincian penyusutan satu aset (untuk layar detail)
create or replace function public.asset_schedule(p_asset uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare a fixed_assets;
begin
  select * into a from fixed_assets where id = p_asset;
  if a.id is null then raise exception 'Aset tidak ditemukan'; end if;
  perform asset_guard(a.kos_id);
  return coalesce((select jsonb_agg(jsonb_build_object('period', d.period, 'amount', d.amount) order by d.period desc) from asset_dep_rows(a.kos_id) d where d.asset_id = a.id), '[]');
end $$;

revoke execute on function public.asset_dep_rows(uuid), public.asset_accumulated(uuid), public.asset_guard(uuid), public.asset_category(uuid), public.expenses_asset_guard() from public, anon, authenticated;
revoke execute on function public.asset_save(uuid, uuid, jsonb), public.asset_dispose(uuid, jsonb), public.asset_dispose_undo(uuid, text), public.asset_delete(uuid, text),
  public.asset_list(uuid), public.asset_schedule(uuid) from public, anon;
grant execute on function public.asset_save(uuid, uuid, jsonb), public.asset_dispose(uuid, jsonb), public.asset_dispose_undo(uuid, text), public.asset_delete(uuid, text),
  public.asset_list(uuid), public.asset_schedule(uuid) to authenticated;

-- ---------- Module Registry ----------
update public.modules set impl_status = 'production_ready', paths = '{/aset}', config_path = '/aset', area = 'finance',
  description = 'Daftar aset (kendaraan, mesin, peralatan, bangunan), penyusutan garis lurus otomatis tiap bulan, nilai buku, dan pelepasan aset (dijual/dibuang) — semuanya masuk pembukuan.',
  data_used = 'fixed_assets, expenses (jenis modal), jurnal'
where code = 'u_aset';
insert into public.business_modules(kos_id, module_code, active, updated_by)
select k.id, 'u_aset', true, 'sistem' from public.kos k on conflict do nothing;
