-- Tahap G Master Blueprint BI V2.0: valuasi multiple & berbasis aset (melengkapi DCF yang sudah ada di Pembukuan).
-- Keputusan pemilik 27 Nov 2026: kelipatan pembanding DIISI PEMILIK dengan SUMBER WAJIB (PRASARA tidak punya data pasar —
-- tidak boleh mengarang); valuasi aset dari neraca (penyesuaian opsional oleh pemilik); Paket Bisnis & Pro (laporan_lanjutan); area finance.
-- Rumus di lib/valuation.js. Simpan = versi baru berisi salinan dasar perhitungan (seperti fin_scenarios), versi lama tidak bisa diubah.

-- Dasar perhitungan: 12 bulan penuh terakhir dari jurnal (disetahunkan bila data < 12 bulan) + posisi neraca hari ini
create or replace function public.valuation_basis_core(p_kos uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_today date := (now() at time zone 'Asia/Jakarta')::date; v_cm date; v_from date; v_first date; v_n int; v_pl jsonb; v_pos jsonb;
begin
  v_cm := date_trunc('month', v_today)::date; v_from := (v_cm - interval '12 months')::date;
  select min(date_trunc('month', e.entry_date))::date into v_first
  from acct_lines l join acct_entries e on e.id = l.entry_id join acct_accounts a on a.id = l.account_id
  where l.kos_id = p_kos and a.type in ('pendapatan', 'beban') and e.entry_date between v_from and v_cm - 1;
  v_n := case when v_first is null then 0 else ((extract(year from v_cm) - extract(year from v_first)) * 12 + extract(month from v_cm) - extract(month from v_first))::int end;
  select jsonb_object_agg(k, round(v, 2)) into v_pl from (
    select biz_fin_class(a.type, coalesce(a.sys_key, '')) k, sum(case when a.type = 'pendapatan' then l.credit - l.debit else l.debit - l.credit end) v
    from acct_lines l join acct_entries e on e.id = l.entry_id join acct_accounts a on a.id = l.account_id
    where l.kos_id = p_kos and a.type in ('pendapatan', 'beban') and e.entry_date between coalesce(v_first, v_cm) and v_cm - 1
    group by 1) q;
  select jsonb_object_agg(k, round(v, 2)) into v_pos from (
    select biz_fin_class(a.type, coalesce(a.sys_key, '')) k, sum(case when a.type = 'aset' then l.debit - l.credit else l.credit - l.debit end) v
    from acct_lines l join acct_entries e on e.id = l.entry_id join acct_accounts a on a.id = l.account_id
    where l.kos_id = p_kos and a.type in ('aset', 'kewajiban', 'ekuitas') and e.entry_date <= v_today
    group by 1) q;
  return jsonb_build_object('model', 'v1', 'tanggal', v_today, 'bulan_dari', v_first, 'bulan_data', v_n,
    'laba_rugi', coalesce(v_pl, '{}'), 'neraca', coalesce(v_pos, '{}'),
    'laba_ditahan', round(coalesce((select sum(l.credit - l.debit)
                        from acct_lines l join acct_entries e on e.id = l.entry_id join acct_accounts a on a.id = l.account_id
                        where l.kos_id = p_kos and a.type in ('pendapatan', 'beban') and e.entry_date <= v_today), 0), 2));
end $$;

-- Daftar aset tetap dengan nilai buku (dari asset_list) — dipakai untuk penyesuaian nilai pasar per aset
create or replace function public.valuation_assets(p_kos uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', id, 'name', name, 'book', book) order by book desc, name), '[]') from (
    select f.id, f.name, round(f.cost - asset_accumulated(f.id), 2) book from fixed_assets f where f.kos_id = p_kos and f.status = 'aktif') z;
$$;

create or replace function public.valuation_basis(p_kos uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  if not member_in('finance', p_kos) then raise exception 'Tidak punya akses keuangan bisnis ini'; end if;
  if not plan_has(p_kos, 'laporan_lanjutan') then return jsonb_build_object('aktif', false); end if;
  perform acct_sync_internal(p_kos);
  return (valuation_basis_core(p_kos) - 'aset_tetap') || jsonb_build_object('aktif', true, 'aset_tetap', valuation_assets(p_kos));
end $$;

create table public.valuations (
  id uuid primary key default gen_random_uuid(),
  kos_id uuid not null references public.kos(id) on delete cascade,
  group_id uuid not null,
  version int not null check (version >= 1),
  name text not null check (length(trim(name)) between 1 and 80),
  assumptions jsonb not null,
  basis jsonb not null,
  model text not null default 'v1',
  note text check (note is null or length(note) <= 500),
  created_by text,
  created_at timestamptz not null default now(),
  archived_at timestamptz,
  unique (group_id, version)
);
create index valuations_kos on public.valuations(kos_id, created_at desc);
alter table public.valuations enable row level security;
create policy valuations_read on public.valuations for select using (member_can(kos_id, 'finance'));
revoke insert, update, delete on public.valuations from anon, authenticated;
grant select on public.valuations to authenticated;
create trigger zz_kos_open_guard before insert or update or delete on public.valuations for each row execute function public.kos_open_guard();

create or replace function public.valuations_immutable()
returns trigger language plpgsql as $$
begin
  if (new.assumptions, new.basis, new.name, new.version, new.group_id, new.kos_id, new.note, new.model)
     is distinct from (old.assumptions, old.basis, old.name, old.version, old.group_id, old.kos_id, old.note, old.model) then
    raise exception 'Versi valuasi tidak bisa diubah. Simpan sebagai versi baru.'; end if;
  return new;
end $$;
create trigger valuations_immutable before update on public.valuations for each row execute function public.valuations_immutable();

-- Validasi asumsi. multiple: {basis: pendapatan|ebitda|laba_bersih, low, mid, high (0 < low ≤ mid ≤ high ≤ 100), source (wajib), source_date}
-- aset: {inv_pct, ar_pct (0–100 = persen yang dianggap bernilai), assets [{id, market ≥ 0}], other_adj (Rp, boleh negatif), note}
create or replace function public.valuation_clean(p_a jsonb)
returns jsonb language plpgsql immutable as $$
declare m jsonb := p_a -> 'multiple'; s jsonb := p_a -> 'aset'; v_out jsonb := '{}'; a jsonb; v_assets jsonb := '[]';
begin
  if m is not null and jsonb_typeof(m) = 'object' then
    if coalesce(m ->> 'basis', '') not in ('pendapatan', 'ebitda', 'laba_bersih') then raise exception 'Dasar kelipatan tidak valid'; end if;
    if jsonb_typeof(m -> 'low') <> 'number' or jsonb_typeof(m -> 'mid') <> 'number' or jsonb_typeof(m -> 'high') <> 'number'
       or not ((m ->> 'low')::numeric > 0 and (m ->> 'low')::numeric <= (m ->> 'mid')::numeric and (m ->> 'mid')::numeric <= (m ->> 'high')::numeric and (m ->> 'high')::numeric <= 100) then
      raise exception 'Kelipatan harus 0 < bawah ≤ tengah ≤ atas ≤ 100'; end if;
    if length(trim(coalesce(m ->> 'source', ''))) < 5 then raise exception 'Tulis sumber kelipatan (mis. penawaran pembeli, konsultan, data transaksi)'; end if;
    v_out := v_out || jsonb_build_object('multiple', jsonb_build_object('basis', m ->> 'basis', 'low', round((m ->> 'low')::numeric, 2), 'mid', round((m ->> 'mid')::numeric, 2),
      'high', round((m ->> 'high')::numeric, 2), 'source', left(trim(m ->> 'source'), 300), 'source_date', nullif(m ->> 'source_date', '')::date,
      'note', nullif(left(trim(coalesce(m ->> 'note', '')), 300), '')));
  end if;
  if s is not null and jsonb_typeof(s) = 'object' then
    for a in select * from jsonb_array_elements(coalesce(s -> 'assets', '[]')) loop
      if jsonb_typeof(a -> 'market') <> 'number' or (a ->> 'market')::numeric < 0 then raise exception 'Nilai pasar aset harus angka ≥ 0'; end if;
      v_assets := v_assets || jsonb_build_array(jsonb_build_object('id', (a ->> 'id')::uuid, 'market', round((a ->> 'market')::numeric, 2)));
    end loop;
    if coalesce((s ->> 'inv_pct')::numeric, 100) not between 0 and 100 or coalesce((s ->> 'ar_pct')::numeric, 100) not between 0 and 100 then
      raise exception 'Persen persediaan/piutang 0–100'; end if;
    if abs(coalesce((s ->> 'other_adj')::numeric, 0)) > 999999999999 then raise exception 'Penyesuaian lain terlalu besar'; end if;
    v_out := v_out || jsonb_build_object('aset', jsonb_build_object('inv_pct', coalesce((s ->> 'inv_pct')::numeric, 100), 'ar_pct', coalesce((s ->> 'ar_pct')::numeric, 100),
      'assets', v_assets, 'other_adj', round(coalesce((s ->> 'other_adj')::numeric, 0), 2), 'note', nullif(left(trim(coalesce(s ->> 'note', '')), 300), '')));
  end if;
  if v_out = '{}' then raise exception 'Isi valuasi multiple atau berbasis aset'; end if;
  return v_out;
end $$;

create or replace function public.valuation_save(p_kos uuid, p_group uuid, p_name text, p_assumptions jsonb, p_note text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_group uuid := coalesce(p_group, gen_random_uuid()); v_ver int; v_id uuid; v_basis jsonb;
begin
  if not member_in('finance', p_kos) then raise exception 'Tidak punya akses keuangan bisnis ini'; end if;
  if not plan_has(p_kos, 'laporan_lanjutan') then raise exception 'BATAS_PAKET: Valuasi multiple & aset tersedia mulai Paket Bisnis.'; end if;
  if length(trim(coalesce(p_name, ''))) not between 1 and 80 then raise exception 'Nama valuasi wajib diisi (maks. 80 huruf)'; end if;
  perform pg_advisory_xact_lock(hashtext('valuation:' || p_kos));
  if p_group is not null and not exists (select 1 from valuations where kos_id = p_kos and group_id = p_group) then raise exception 'Valuasi tidak ditemukan'; end if;
  if p_group is null and (select count(distinct group_id) from valuations where kos_id = p_kos and archived_at is null) >= 20 then
    raise exception 'Maksimal 20 valuasi aktif. Arsipkan yang lama dulu.'; end if;
  select coalesce(max(version), 0) + 1 into v_ver from valuations where group_id = v_group;
  perform acct_sync_internal(p_kos);
  v_basis := (valuation_basis_core(p_kos) - 'aset_tetap') || jsonb_build_object('aset_tetap', valuation_assets(p_kos));
  insert into valuations(kos_id, group_id, version, name, assumptions, basis, model, note, created_by)
  values (p_kos, v_group, v_ver, trim(p_name), valuation_clean(p_assumptions), v_basis, 'v1', nullif(trim(coalesce(p_note, '')), ''), actor_email())
  returning id into v_id;
  perform config_log(p_kos, 'simpan_valuasi', trim(p_name) || ' · versi ' || v_ver, null, jsonb_build_object('versi', v_ver), null, 'rendah', null);
  return jsonb_build_object('id', v_id, 'group_id', v_group, 'version', v_ver);
end $$;

create or replace function public.valuation_list(p_kos uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if not member_in('finance', p_kos) then raise exception 'Tidak punya akses keuangan bisnis ini'; end if;
  return coalesce((select jsonb_agg(g order by g ->> 'archived', g ->> 'updated_at' desc) from (
    select jsonb_build_object('group_id', group_id, 'name', (array_agg(name order by version desc))[1],
      'archived', bool_or(archived_at is not null)::text, 'updated_at', max(created_at),
      'versions', jsonb_agg(jsonb_build_object('id', id, 'version', version, 'note', note, 'by', created_by, 'at', created_at) order by version desc)) g
    from valuations where kos_id = p_kos group by group_id) q), '[]');
end $$;

create or replace function public.valuation_get(p_kos uuid, p_id uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare r valuations;
begin
  if not member_in('finance', p_kos) then raise exception 'Tidak punya akses keuangan bisnis ini'; end if;
  select * into r from valuations where id = p_id and kos_id = p_kos;
  if r.id is null then raise exception 'Valuasi tidak ditemukan'; end if;
  return to_jsonb(r);
end $$;

create or replace function public.valuation_archive(p_kos uuid, p_group uuid, p_archive boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not member_in('finance', p_kos) then raise exception 'Tidak punya akses keuangan bisnis ini'; end if;
  update valuations set archived_at = case when p_archive then now() end where kos_id = p_kos and group_id = p_group;
  if not found then raise exception 'Valuasi tidak ditemukan'; end if;
end $$;

revoke execute on function public.valuation_basis_core(uuid), public.valuation_assets(uuid) from public, anon, authenticated;
revoke execute on function public.valuation_basis(uuid), public.valuation_save(uuid, uuid, text, jsonb, text), public.valuation_list(uuid),
  public.valuation_get(uuid, uuid), public.valuation_archive(uuid, uuid, boolean) from public, anon;
grant execute on function public.valuation_basis(uuid), public.valuation_save(uuid, uuid, text, jsonb, text), public.valuation_list(uuid),
  public.valuation_get(uuid, uuid), public.valuation_archive(uuid, uuid, boolean) to authenticated;
