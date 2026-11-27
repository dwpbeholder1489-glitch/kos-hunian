-- Rekap Bisnis: kelengkapan saat arsip disimpan, versi pembanding, dan status jadwal arsip.
-- Data transaksi dan kalkulasi jurnal tetap bersumber dari fungsi Rekap yang sudah ada.

create or replace function public.recap_quality(p_kos uuid, p_from date, p_to date, p_branch uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'menunggu_verifikasi', (select count(*) from payments where kos_id = p_kos and status = 'menunggu' and paid_at <= p_to),
    'pos_offline_cek', (select count(*) from pos_offline where kos_id = p_kos and status in ('perlu_cek', 'gagal')
      and reviewed_at is null and (used_at at time zone 'Asia/Jakarta')::date between p_from and p_to),
    'tanpa_modal', (select count(*) from sales s where s.kos_id = p_kos and s.status = 'selesai'
      and s.sale_date between p_from and p_to and (p_branch is null or s.branch_id = p_branch)
      and exists (select 1 from sale_lines l where l.sale_id = s.id and l.cost = 0 and l.line_total > 0)));
$$;
revoke execute on function public.recap_quality(uuid, date, date, uuid) from public, anon, authenticated;

create or replace function public.recap_auto_periods(p_today date)
returns table(kind text, period_from date, period_to date) language sql immutable set search_path = public as $$
  values
    ('mingguan', date_trunc('week', p_today::timestamp)::date - 7, date_trunc('week', p_today::timestamp)::date - 1),
    ('bulanan', (date_trunc('month', p_today::timestamp) - interval '1 month')::date, date_trunc('month', p_today::timestamp)::date - 1),
    ('kuartalan', (date_trunc('quarter', p_today::timestamp) - interval '3 months')::date, date_trunc('quarter', p_today::timestamp)::date - 1),
    ('tahunan', (date_trunc('year', p_today::timestamp) - interval '1 year')::date, date_trunc('year', p_today::timestamp)::date - 1);
$$;
revoke execute on function public.recap_auto_periods(date) from public, anon, authenticated;

create or replace function public.recap_archive_schedule(p_kos uuid, p_from date, p_to date, p_branch uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  with jam as (select now() at time zone 'Asia/Jakarta' as lokal),
  kandidat as (
    select p.kind
    from jam, lateral recap_auto_periods(jam.lokal::date) p
    where p_branch is null and p.period_from = p_from and p.period_to = p_to
      and exists (select 1 from kos k where k.id = p_kos and k.closed_at is null and coalesce(k.setup_status, 'active') = 'active')
      and exists (select 1 from acct_entries e where e.kos_id = p_kos and e.entry_date >= jam.lokal::date - 400)
      and (exists (select 1 from acct_entries e where e.kos_id = p_kos and e.entry_date between p_from and p_to)
        or exists (select 1 from domain_events d where d.kos_id = p_kos
                   and (d.occurred_at at time zone 'Asia/Jakarta')::date between p_from and p_to))
      and not exists (select 1 from recap_snapshots s where s.kos_id = p_kos and s.kind = p.kind
        and s.period_from = p_from and s.period_to = p_to and s.branch_id is null)
  )
  select jsonb_build_object('kind', k.kind,
    'terlambat', jam.lokal::date > p_to + 1 or jam.lokal::time >= time '08:00',
    'terakhir', (select max(s.created_at) from recap_snapshots s
      where s.kos_id = p_kos and s.kind = k.kind and s.source in ('otomatis', 'koreksi') and s.branch_id is null))
  from kandidat k cross join jam;
$$;
revoke execute on function public.recap_archive_schedule(uuid, date, date, uuid) from public, anon, authenticated;

create or replace function public.recap_now(p_kos uuid, p_from date, p_to date)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'piutang_pelanggan', case when k.business_type = 'retail' then (select count(distinct contact_id) from receivable_open_core(p_kos, null) where open_amount > 0) end,
    'utang_supplier', case when exists (select 1 from purchases where kos_id = p_kos) then (select count(distinct contact_id) from payable_open(p_kos, null) where open_amount > 0) end,
    'produk_aktif', (select count(*) from products where kos_id = p_kos and active and not coalesce(is_kit, false)),
    'stok_habis', (select count(*) from products where kos_id = p_kos and active and not coalesce(is_kit, false) and stock <= 0),
    'di_bawah_min', (select count(*) from products where kos_id = p_kos and active and not coalesce(is_kit, false) and min_stock > 0 and stock > 0 and stock < min_stock),
    'jurnal_koreksi', (select count(*) from acct_entries where kos_id = p_kos and kind = 'koreksi' and entry_date between p_from and p_to),
    'proyek_berjalan', (select count(*) from prj_projects where kos_id = p_kos and status = 'berjalan'))
    || recap_quality(p_kos, p_from, p_to, null)
  from kos k where k.id = p_kos;
$$;

create or replace function public.recap_status(p_kos uuid, p_from date, p_to date)
returns jsonb language sql stable security definer set search_path = public as $$
  with m as (select g::date b from generate_series(date_trunc('month', p_from)::date, date_trunc('month', p_to)::date, interval '1 month') g),
  mm as (
    select m.b,
      (select closed_at from acct_periods p where p.kos_id = p_kos and p.month = m.b) closed_at,
      (select status from bank_recons r where r.kos_id = p_kos and r.month = m.b) rekon,
      exists (select 1 from acct_lines l join acct_entries e on e.id = l.entry_id join acct_accounts a on a.id = l.account_id
              where l.kos_id = p_kos and a.sys_key = 'bank' and e.entry_date between m.b and (m.b + interval '1 month - 1 day')::date) perlu_rekon
    from m),
  lokasi_utama as (select id from branches where kos_id = p_kos and is_main limit 1),
  hari as (
    select s.sale_date, bool_and(exists (
      select 1 from day_closings c where c.kos_id = p_kos and c.day = s.sale_date
        and coalesce(c.branch_id, u.id) is not distinct from coalesce(s.branch_id, u.id)
    )) selesai
    from sales s left join lokasi_utama u on true
    where s.kos_id = p_kos and s.status = 'selesai' and s.sale_date between p_from and p_to
    group by s.sale_date
  ),
  dy as (select count(*) jual, count(*) filter (where selesai) tutup from hari)
  select jsonb_build_object(
    'berjalan', p_to >= (now() at time zone 'Asia/Jakarta')::date,
    'bulan', (select jsonb_agg(jsonb_build_object('bulan', b, 'ditutup', closed_at is not null, 'ditutup_at', closed_at,
                'rekon', case when not perlu_rekon then 'tidak_perlu' else coalesce(rekon, 'belum') end) order by b) from mm),
    'hari_jual', (select jual from dy), 'hari_ditutup', (select tutup from dy),
    'ditutup', (select bool_and(closed_at is not null) from mm),
    'direkonsiliasi', (select bool_and(not perlu_rekon or coalesce(rekon = 'selesai', false)) from mm) and (select jual = tutup from dy));
$$;

create or replace function public.recap_store(p_kos uuid, p_kind text, p_from date, p_to date, p_branch uuid, p_source text, p_actor uuid, p_note text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_data jsonb; v_hash text; v_last recap_snapshots%rowtype; v_row recap_snapshots%rowtype;
begin
  perform pg_advisory_xact_lock(hashtextextended('recap:' || p_kos || ':' || p_kind || ':' || p_from || ':' || p_to || ':' || coalesce(p_branch::text, ''), 0));
  v_data := biz_recap_core(p_kos, p_from, p_to, p_branch);
  v_hash := recap_hash(v_data);
  select * into v_last from recap_snapshots where kos_id = p_kos and kind = p_kind and period_from = p_from and period_to = p_to
    and branch_id is not distinct from p_branch order by version desc limit 1;
  if found and v_last.data_hash = v_hash then
    return jsonb_build_object('id', v_last.id, 'version', v_last.version, 'baru', false);
  end if;
  insert into recap_snapshots(kos_id, kind, period_from, period_to, branch_id, version, source, data, data_hash, note, created_by)
  values (p_kos, p_kind, p_from, p_to, p_branch, coalesce(v_last.version, 0) + 1,
          case when v_last.id is not null and p_source = 'otomatis' then 'koreksi' else p_source end,
          v_data || jsonb_build_object('status', recap_status(p_kos, p_from, p_to),
            'kelengkapan', recap_quality(p_kos, p_from, p_to, p_branch),
            'nama_lokasi', (select b.name from branches b where b.id = p_branch and b.kos_id = p_kos),
            'dibuat', now()), v_hash, nullif(trim(coalesce(p_note, '')), ''), p_actor)
  returning * into v_row;
  return jsonb_build_object('id', v_row.id, 'version', v_row.version, 'baru', true, 'source', v_row.source);
end $$;

create or replace function public.biz_recap(p_kos uuid, p_from date, p_to date, p_cmp_from date default null, p_cmp_to date default null,
                                            p_branch uuid default null, p_series jsonb default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_today date := (now() at time zone 'Asia/Jakarta')::date; v_cur jsonb; v_res jsonb; v_hash text; v_last recap_snapshots%rowtype;
  v_archives jsonb; v_deep boolean; v_branch_name text; s jsonb; v_seri jsonb := '[]';
begin
  if auth.uid() is null or not member_in('finance', p_kos) then raise exception 'Tidak punya akses keuangan'; end if;
  if p_from is null or p_to is null or p_to < p_from then raise exception 'Periode tidak valid'; end if;
  if p_from > v_today then raise exception 'Periode belum berjalan'; end if;
  if p_to - p_from > 400 then raise exception 'Periode maksimal sekitar 1 tahun (400 hari)'; end if;
  if (p_cmp_from is null) <> (p_cmp_to is null) or p_cmp_to < p_cmp_from or p_cmp_to - p_cmp_from > 400 then raise exception 'Periode pembanding tidak valid'; end if;
  if p_series is not null and (jsonb_typeof(p_series) <> 'array' or jsonb_array_length(p_series) > 12) then raise exception 'Seri periode tidak valid'; end if;
  v_deep := plan_has(p_kos, 'analisis_mendalam');
  if p_branch is not null then
    if not v_deep then raise exception 'BATAS_PAKET: Rekap per cabang tersedia di Paket Pro.'; end if;
    select name into v_branch_name from branches where id = p_branch and kos_id = p_kos;
    if v_branch_name is null then raise exception 'Lokasi tidak ditemukan'; end if;
  end if;
  perform acct_sync_internal(p_kos);

  v_cur := biz_recap_core(p_kos, p_from, p_to, p_branch);
  v_hash := recap_hash(v_cur);
  for s in select * from jsonb_array_elements(coalesce(p_series, '[]')) loop
    if (s ->> 'from')::date is null or (s ->> 'to')::date < (s ->> 'from')::date or (s ->> 'to')::date - (s ->> 'from')::date > 400 then
      raise exception 'Seri periode tidak valid'; end if;
    v_seri := v_seri || jsonb_build_array(jsonb_build_object('from', s ->> 'from', 'to', s ->> 'to',
      'v', biz_figures_total(p_kos, (s ->> 'from')::date, least((s ->> 'to')::date, v_today), p_branch)));
  end loop;
  select * into v_last from recap_snapshots where kos_id = p_kos and period_from = p_from and period_to = p_to
    and branch_id is not distinct from p_branch order by created_at desc, version desc limit 1;

  select coalesce(jsonb_object_agg(a.kind, jsonb_build_object('id', a.id, 'version', a.version, 'kind', a.kind,
      'source', a.source, 'created_at', a.created_at, 'berubah', a.data_hash <> v_hash)), '{}')
    into v_archives
    from (select distinct on (kind) id, version, kind, source, created_at, data_hash
      from recap_snapshots where kos_id = p_kos and period_from = p_from and period_to = p_to
        and branch_id is not distinct from p_branch order by kind, version desc) a;

  v_res := jsonb_build_object('cur', v_cur, 'hari_ini', v_today, 'branch_name', v_branch_name, 'mendalam', v_deep,
    'status', recap_status(p_kos, p_from, p_to),
    'cmp', case when p_cmp_from is not null then biz_recap_core(p_kos, p_cmp_from, least(p_cmp_to, v_today), p_branch) end,
    'seri', v_seri,
    'lokasi', (select coalesce(jsonb_agg(jsonb_build_object('id', id, 'name', name, 'gudang', kind = 'gudang') order by is_main desc, name), '[]') from branches where kos_id = p_kos and active),
    'kini', recap_now(p_kos, p_from, p_to) || case when p_branch is not null
      then recap_quality(p_kos, p_from, p_to, p_branch) else '{}'::jsonb end,
    'cmp_kelengkapan', case when p_cmp_from is not null then recap_quality(p_kos, p_cmp_from, least(p_cmp_to, v_today), p_branch) end,
    'arsip_per_jenis', v_archives, 'jadwal_arsip', recap_archive_schedule(p_kos, p_from, p_to, p_branch),
    'arsip', case when v_last.id is not null then jsonb_build_object('id', v_last.id, 'version', v_last.version, 'kind', v_last.kind, 'source', v_last.source,
               'created_at', v_last.created_at, 'berubah', v_last.data_hash <> v_hash) end);

  -- Peta aktivitas hari × jam (Paket Pro, sama dengan heatmap Analisis Bisnis)
  if v_deep then
    v_res := v_res || jsonb_build_object('heatmap', (
      select coalesce(jsonb_agg(jsonb_build_object('h', dw, 'j', jm, 'n', n)), '[]') from (
        select extract(isodow from occurred_at at time zone 'Asia/Jakarta')::int dw, extract(hour from occurred_at at time zone 'Asia/Jakarta')::int jm, count(*) n
        from domain_events where kos_id = p_kos and member_in(area, p_kos) and (occurred_at at time zone 'Asia/Jakarta')::date between p_from and p_to group by 1, 2) z));
  end if;
  return v_res;
end $$;

create or replace function public.recap_get(p_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v recap_snapshots%rowtype; v_now text;
begin
  select * into v from recap_snapshots where id = p_id;
  if v.id is null or auth.uid() is null or not member_in('finance', v.kos_id) then raise exception 'Arsip tidak ditemukan'; end if;
  perform acct_sync_internal(v.kos_id);
  v_now := recap_hash(biz_recap_core(v.kos_id, v.period_from, v.period_to, v.branch_id));
  return jsonb_build_object('id', v.id, 'kind', v.kind, 'from', v.period_from, 'to', v.period_to, 'branch_id', v.branch_id, 'version', v.version,
    'branch_name', coalesce(v.data ->> 'nama_lokasi', (select b.name from branches b where b.id = v.branch_id and b.kos_id = v.kos_id)),
    'versi_sebelumnya', (select jsonb_build_object('version', s.version, 'created_at', s.created_at, 'ringkas', s.data -> 'ringkas')
      from recap_snapshots s where s.kos_id = v.kos_id and s.kind = v.kind and s.period_from = v.period_from and s.period_to = v.period_to
        and s.branch_id is not distinct from v.branch_id and s.version = v.version - 1),
    'source', v.source, 'note', v.note, 'created_at', v.created_at, 'data', v.data, 'berubah', v_now <> v.data_hash,
    'versi', (select jsonb_agg(jsonb_build_object('id', id, 'version', version, 'source', source, 'created_at', created_at) order by version desc)
              from recap_snapshots where kos_id = v.kos_id and kind = v.kind and period_from = v.period_from and period_to = v.period_to and branch_id is not distinct from v.branch_id));
end $$;

create or replace function public.recap_auto_tick(p_limit int default 300)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_today date := (now() at time zone 'Asia/Jakarta')::date; k record; p record; v_new int := 0; v_fix int := 0; v_err int := 0; v_n int := 0; x jsonb;
begin
  for k in select id from kos where closed_at is null and coalesce(setup_status, 'active') = 'active'
             and exists (select 1 from acct_entries e where e.kos_id = kos.id and e.entry_date >= v_today - 400)
           order by id limit greatest(coalesce(p_limit, 300), 1) loop
    v_n := v_n + 1;
    begin
      perform acct_sync_internal(k.id);
    exception when others then
      v_err := v_err + 1;
      continue;
    end;
    for p in
      select kind, period_from as f, period_to as t from recap_auto_periods(v_today)
      union all
      select 'bulanan', (date_trunc('month', v_today) - interval '2 months')::date,
        (date_trunc('month', v_today) - interval '1 month')::date - 1
    loop
      begin
        -- tanpa aktivitas di periode itu → tidak diarsipkan
        if not exists (select 1 from acct_entries e where e.kos_id = k.id and e.entry_date between p.f and p.t)
           and not exists (select 1 from domain_events d where d.kos_id = k.id and (d.occurred_at at time zone 'Asia/Jakarta')::date between p.f and p.t) then
          continue;
        end if;
        -- periode bulan ke-2 ke belakang hanya diperiksa ulang (koreksi), tidak dibuat baru bila belum pernah ada
        if p.kind = 'bulanan' and p.t < (date_trunc('month', v_today)::date - 1)
           and not exists (select 1 from recap_snapshots s where s.kos_id = k.id and s.kind = 'bulanan' and s.period_from = p.f and s.period_to = p.t and s.branch_id is null) then
          continue;
        end if;
        x := recap_store(k.id, p.kind, p.f, p.t, null, 'otomatis', null, null);
        if (x ->> 'baru')::boolean then
          if x ->> 'source' = 'koreksi' then v_fix := v_fix + 1; else v_new := v_new + 1; end if;
        end if;
      exception when others then v_err := v_err + 1;
      end;
    end loop;
  end loop;
  return jsonb_build_object('bisnis', v_n, 'arsip_baru', v_new, 'versi_koreksi', v_fix, 'gagal', v_err);
end $$;
