-- Tahap E Master Blueprint BI V2.0: skenario Pesimis/Dasar/Optimis & stress test, TERSIMPAN BERVERSI.
-- Keputusan pemilik 27 Nov 2026: variabel umum + khusus jenis bisnis; akses bagian keuangan (area finance);
-- Paket Bisnis & Pro (fitur `laporan_lanjutan`, bisnis lama lewat legacy_features).
-- Mesin proyeksi = rumus tertulis di lib/scenario.js (deterministik). Database hanya menyediakan TITIK AWAL dari jurnal
-- (scenario_baseline) dan menyimpan versi: setiap simpan = baris baru berisi salinan titik awal + asumsi (versi lama tidak
-- bisa diubah), sehingga hasil versi lama bisa dihitung ulang persis.

-- ---------- Titik awal dari Pembukuan ----------
-- Rata-rata bulanan laba rugi dari bulan penuh terakhir (maks. 3, mulai bulan pertama yang punya transaksi), posisi neraca hari ini.
create or replace function public.scenario_baseline_core(p_kos uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_today date := (now() at time zone 'Asia/Jakarta')::date; v_cm date; v_from date; v_first date; v_n int; v_pl jsonb; v_pos jsonb;
        v_type text; v_tpl text; v_end date;
begin
  select business_type, template_code into v_type, v_tpl from kos where id = p_kos;
  v_cm := date_trunc('month', v_today)::date; v_from := (v_cm - interval '3 months')::date; v_end := v_cm - 1;
  select min(date_trunc('month', e.entry_date))::date into v_first
  from acct_lines l join acct_entries e on e.id = l.entry_id join acct_accounts a on a.id = l.account_id
  where l.kos_id = p_kos and a.type in ('pendapatan', 'beban') and e.entry_date between v_from and v_end;
  v_n := case when v_first is null then 0 else ((extract(year from v_cm) - extract(year from v_first)) * 12 + extract(month from v_cm) - extract(month from v_first))::int end;
  select jsonb_object_agg(k, round(v / greatest(v_n, 1), 2)) into v_pl from (
    select biz_fin_class(a.type, coalesce(a.sys_key, '')) k,
           sum(case when a.type = 'pendapatan' then l.credit - l.debit else l.debit - l.credit end) v
    from acct_lines l join acct_entries e on e.id = l.entry_id join acct_accounts a on a.id = l.account_id
    where l.kos_id = p_kos and a.type in ('pendapatan', 'beban') and e.entry_date between coalesce(v_first, v_cm) and v_end
    group by 1) q;
  select jsonb_object_agg(k, round(v, 2)) into v_pos from (
    select biz_fin_class(a.type, coalesce(a.sys_key, '')) k,
           sum(case when a.type = 'aset' then l.debit - l.credit else l.credit - l.debit end) v
    from acct_lines l join acct_entries e on e.id = l.entry_id join acct_accounts a on a.id = l.account_id
    where l.kos_id = p_kos and a.type in ('aset', 'kewajiban') and e.entry_date <= v_today
    group by 1) q;
  return jsonb_build_object(
    'model', 'v1', 'tanggal', v_today, 'jenis', v_type, 'template', v_tpl,
    'bulan_dari', v_first, 'bulan_sampai', case when v_first is not null then date_trunc('month', v_end)::date end, 'bulan_data', v_n,
    'pendapatan', coalesce((v_pl ->> 'pendapatan_usaha')::numeric, 0) - coalesce((v_pl ->> 'retur')::numeric, 0),
    'hpp', coalesce((v_pl ->> 'hpp')::numeric, 0),
    'beban_operasional', coalesce((v_pl ->> 'beban_operasional')::numeric, 0),
    'penyusutan', coalesce((v_pl ->> 'penyusutan')::numeric, 0),
    'bunga', coalesce((v_pl ->> 'bunga')::numeric, 0),
    'pendapatan_lain', coalesce((v_pl ->> 'pendapatan_lain')::numeric, 0),
    'beban_lain', coalesce((v_pl ->> 'beban_lain')::numeric, 0),
    'pajak', coalesce((v_pl ->> 'pajak')::numeric, 0),
    'kas', coalesce((v_pos ->> 'kas')::numeric, 0),
    'piutang', coalesce((v_pos ->> 'piutang')::numeric, 0),
    'persediaan', coalesce((v_pos ->> 'persediaan')::numeric, 0),
    'aset_lancar_lain', coalesce((v_pos ->> 'aset_lancar_lain')::numeric, 0),
    'utang_usaha', coalesce((v_pos ->> 'utang_usaha')::numeric, 0),
    'kewajiban_lain', coalesce((v_pos ->> 'kewajiban_lain')::numeric, 0),
    'pinjaman', coalesce((v_pos ->> 'pinjaman')::numeric, 0),
    'pinjaman_lancar', coalesce((loan_current_portion(p_kos, v_today) ->> 'lancar')::numeric, 0),
    'pokok_bulanan', round(coalesce((select sum(amount - coalesce(interest, 0)) from cash_entries
                      where kos_id = p_kos and kind = 'bayar_pinjaman' and date between coalesce(v_first, v_cm) and v_end), 0) / greatest(v_n, 1), 2),
    'hunian', case when v_type = 'properti' then jsonb_build_object(
      'kamar', (select count(*) from rooms where kos_id = p_kos),
      'terisi', (select count(distinct room_id) from leases where kos_id = p_kos and status = 'aktif')) end,
    'pesanan', case when v_type = 'jasa' then round((select count(*) from svc_orders where kos_id = p_kos and status = 'selesai'
                      and completed_date between coalesce(v_first, v_cm) and v_end)::numeric / greatest(v_n, 1), 1) end);
end $$;

create or replace function public.scenario_baseline(p_kos uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  if not member_in('finance', p_kos) then raise exception 'Tidak punya akses keuangan bisnis ini'; end if;
  if not plan_has(p_kos, 'laporan_lanjutan') then return jsonb_build_object('aktif', false); end if;
  perform acct_sync_internal(p_kos);
  return scenario_baseline_core(p_kos) || jsonb_build_object('aktif', true);
end $$;

-- ---------- Versi tersimpan ----------
create table public.fin_scenarios (
  id uuid primary key default gen_random_uuid(),
  kos_id uuid not null references public.kos(id) on delete cascade,
  group_id uuid not null,
  version int not null check (version >= 1),
  name text not null check (length(trim(name)) between 1 and 80),
  assumptions jsonb not null,
  baseline jsonb not null,
  model text not null default 'v1',
  note text check (note is null or length(note) <= 500),
  created_by text,
  created_at timestamptz not null default now(),
  archived_at timestamptz,
  unique (group_id, version)
);
create index fin_scenarios_kos on public.fin_scenarios(kos_id, created_at desc);
alter table public.fin_scenarios enable row level security;
create policy fin_scenarios_read on public.fin_scenarios for select using (member_can(kos_id, 'finance'));
revoke insert, update, delete on public.fin_scenarios from anon, authenticated;
grant select on public.fin_scenarios to authenticated;
create trigger zz_kos_open_guard before insert or update or delete on public.fin_scenarios for each row execute function public.kos_open_guard();

-- Validasi asumsi (batas sama dengan lib/scenario.js). Variabel khusus: hunian (properti), pesanan (jasa), margin_pp (bukan properti).
create or replace function public.scenario_clean(p_type text, p_a jsonb)
returns jsonb language plpgsql immutable as $$
declare s jsonb; v_out jsonb := '[]'; v_keys text[] := '{}'; v_k text; v_one jsonb; f record;
begin
  if jsonb_typeof(p_a -> 'skenario') <> 'array' or jsonb_array_length(p_a -> 'skenario') <> 3 then raise exception 'Harus ada tepat 3 skenario'; end if;
  for s in select * from jsonb_array_elements(p_a -> 'skenario') loop
    v_k := s ->> 'key';
    if v_k is null or v_k not in ('pesimis', 'dasar', 'optimis') or v_k = any(v_keys) then raise exception 'Skenario tidak valid'; end if;
    v_keys := v_keys || v_k; v_one := jsonb_build_object('key', v_k);
    for f in select * from (values ('pendapatan', -100, 300), ('biaya', -100, 300), ('margin_pp', -50, 50), ('piutang_hari', 0, 365),
                                   ('bunga_pp', 0, 50), ('kejutan', 0, 999999999999), ('kejutan_bulan', 1, 12), ('hunian', 0, 100), ('pesanan', -100, 300)) x(k, lo, hi) loop
      if s ? f.k and jsonb_typeof(s -> f.k) <> 'null' then
        if jsonb_typeof(s -> f.k) <> 'number' or (s ->> f.k)::numeric < f.lo or (s ->> f.k)::numeric > f.hi then
          raise exception 'Nilai % di skenario % di luar batas (% sampai %)', f.k, v_k, f.lo, f.hi; end if;
        if f.k = 'hunian' and p_type <> 'properti' then continue; end if;
        if f.k = 'pesanan' and p_type <> 'jasa' then continue; end if;
        if f.k = 'margin_pp' and p_type = 'properti' then continue; end if;
        v_one := v_one || jsonb_build_object(f.k, round((s ->> f.k)::numeric, case when f.k in ('piutang_hari', 'kejutan_bulan', 'kejutan') then 0 else 2 end));
      end if;
    end loop;
    v_out := v_out || jsonb_build_array(v_one);
  end loop;
  return jsonb_build_object('skenario', v_out);
end $$;

create or replace function public.scenario_save(p_kos uuid, p_group uuid, p_name text, p_assumptions jsonb, p_note text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_type text; v_group uuid := coalesce(p_group, gen_random_uuid()); v_ver int; v_id uuid; v_base jsonb;
begin
  if not member_in('finance', p_kos) then raise exception 'Tidak punya akses keuangan bisnis ini'; end if;
  if not plan_has(p_kos, 'laporan_lanjutan') then raise exception 'BATAS_PAKET: Skenario & stress test tersedia mulai Paket Bisnis.'; end if;
  if length(trim(coalesce(p_name, ''))) not between 1 and 80 then raise exception 'Nama skenario wajib diisi (maks. 80 huruf)'; end if;
  select business_type into v_type from kos where id = p_kos;
  perform pg_advisory_xact_lock(hashtext('fin_scenario:' || p_kos));
  if p_group is not null and not exists (select 1 from fin_scenarios where kos_id = p_kos and group_id = p_group) then raise exception 'Skenario tidak ditemukan'; end if;
  if (select count(distinct group_id) from fin_scenarios where kos_id = p_kos and archived_at is null) >= 20 and p_group is null then
    raise exception 'Maksimal 20 skenario aktif. Arsipkan skenario lama dulu.'; end if;
  select coalesce(max(version), 0) + 1 into v_ver from fin_scenarios where group_id = v_group;
  perform acct_sync_internal(p_kos);
  v_base := scenario_baseline_core(p_kos);
  insert into fin_scenarios(kos_id, group_id, version, name, assumptions, baseline, model, note, created_by)
  values (p_kos, v_group, v_ver, trim(p_name), scenario_clean(v_type, p_assumptions), v_base, v_base ->> 'model', nullif(trim(coalesce(p_note, '')), ''), actor_email())
  returning id into v_id;
  perform config_log(p_kos, 'simpan_skenario', trim(p_name) || ' · versi ' || v_ver, null, jsonb_build_object('versi', v_ver), null, 'rendah', null);
  return jsonb_build_object('id', v_id, 'group_id', v_group, 'version', v_ver);
end $$;

create or replace function public.scenario_list(p_kos uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if not member_in('finance', p_kos) then raise exception 'Tidak punya akses keuangan bisnis ini'; end if;
  return coalesce((select jsonb_agg(g order by g ->> 'archived' , g ->> 'updated_at' desc) from (
    select jsonb_build_object('group_id', group_id, 'name', (array_agg(name order by version desc))[1],
      'archived', bool_or(archived_at is not null)::text, 'updated_at', max(created_at),
      'versions', jsonb_agg(jsonb_build_object('id', id, 'version', version, 'name', name, 'note', note, 'by', created_by, 'at', created_at,
                 'base_date', baseline ->> 'tanggal') order by version desc)) g
    from fin_scenarios where kos_id = p_kos group by group_id) q), '[]');
end $$;

create or replace function public.scenario_get(p_kos uuid, p_id uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare r fin_scenarios;
begin
  if not member_in('finance', p_kos) then raise exception 'Tidak punya akses keuangan bisnis ini'; end if;
  select * into r from fin_scenarios where id = p_id and kos_id = p_kos;
  if r.id is null then raise exception 'Skenario tidak ditemukan'; end if;
  return to_jsonb(r);
end $$;

create or replace function public.scenario_archive(p_kos uuid, p_group uuid, p_archive boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not member_in('finance', p_kos) then raise exception 'Tidak punya akses keuangan bisnis ini'; end if;
  update fin_scenarios set archived_at = case when p_archive then now() end where kos_id = p_kos and group_id = p_group;
  if not found then raise exception 'Skenario tidak ditemukan'; end if;
  perform config_log(p_kos, case when p_archive then 'arsip_skenario' else 'pulihkan_skenario' end, p_group::text, null, null, null, 'rendah', null);
end $$;

-- Hanya archived_at yang boleh berubah (versi tidak bisa diubah isinya)
create or replace function public.fin_scenarios_immutable()
returns trigger language plpgsql as $$
begin
  if (new.assumptions, new.baseline, new.name, new.version, new.group_id, new.kos_id, new.note, new.model)
     is distinct from (old.assumptions, old.baseline, old.name, old.version, old.group_id, old.kos_id, old.note, old.model) then
    raise exception 'Versi skenario tidak bisa diubah. Simpan sebagai versi baru.'; end if;
  return new;
end $$;
create trigger fin_scenarios_immutable before update on public.fin_scenarios for each row execute function public.fin_scenarios_immutable();

-- Penawaran upgrade memakai event yang sudah ada REPORT.ADVANCED_REQUESTED (fitur laporan_lanjutan).

revoke execute on function public.scenario_baseline_core(uuid) from public, anon, authenticated;
revoke execute on function public.scenario_baseline(uuid), public.scenario_save(uuid, uuid, text, jsonb, text), public.scenario_list(uuid),
  public.scenario_get(uuid, uuid), public.scenario_archive(uuid, uuid, boolean) from public, anon;
grant execute on function public.scenario_baseline(uuid), public.scenario_save(uuid, uuid, text, jsonb, text), public.scenario_list(uuid),
  public.scenario_get(uuid, uuid), public.scenario_archive(uuid, uuid, boolean) to authenticated;
