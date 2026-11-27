-- Tahap H Master Blueprint BI V2.0 §32: laporan investor profesional (A4 bersampul, daftar isi, ringkasan eksekutif & MD&A,
-- laporan keuangan, rasio, perubahan ekuitas, arus kas, KPI industri, skenario, risiko, valuasi, metodologi) BERVERSI & ARSIP.
-- Keputusan pemilik 27 Nov 2026: PDF A4 + arsip versi; keuangan (area finance) menyusun & mengajukan, HANYA pemilik (area team)
-- memfinalkan/menolak (pemilik boleh langsung memfinalkan draf); Paket Pro saja (fitur BARU `laporan_investor`, tanpa pengecualian bisnis lama).
-- SATU sumber data: investor_snapshot (memanggil biz_financials, acct_cashflow, industry_kpi_period, risks, fin_scenarios, valuations).
-- Draf = data terkini; final = salinan snapshot dibekukan (tidak bisa diubah). Susunan & rumus tampilan di lib/investorReport.js.

-- ---------- Fitur Pro baru (dinamis agar tidak menimpa daftar dari migrasi lain) ----------
update public.plan_versions v
set features = (select array_agg(distinct f order by f) from unnest(v.features || '{laporan_investor}'::text[]) f)
where v.plan_key = 'pro' and v.id = (public.plan_current(v.plan_key)).id;

do $$ begin
  execute format('create or replace function public.plan_feature_codes() returns text[] language sql immutable as $f$ select %L::text[] $f$',
    (select array_agg(distinct x) from unnest(public.plan_feature_codes() || '{laporan_investor}'::text[]) x));
end $$;

do $$ declare d text; begin
  select pg_get_constraintdef(oid) into d from pg_constraint where conname = 'growth_rules_trigger_event_check';
  if position('REPORT.INVESTOR.REQUESTED' in d) = 0 then
    alter table public.growth_rules drop constraint growth_rules_trigger_event_check;
    execute 'alter table public.growth_rules add constraint growth_rules_trigger_event_check ' || replace(d, ']))))', ', ''REPORT.INVESTOR.REQUESTED''::text]))))');
  end if;
end $$;

do $$ declare d text; begin
  d := pg_get_functiondef('public.growth_event_feature(text)'::regprocedure);
  if position('REPORT.INVESTOR.REQUESTED' in d) = 0 then
    if position(' end;' in d) = 0 then raise exception 'growth_event_feature: pola tidak ditemukan'; end if;
    execute regexp_replace(d, ' end;(\s*\$function\$)', ' when ''REPORT.INVESTOR.REQUESTED'' then ''laporan_investor'' end;\1');
  end if;
end $$;

insert into public.growth_rules(id, name, context, kind, from_plan, to_plan, to_months, trigger_event, title, message, cta, cta_secondary, priority, frequency_days, general, updated_by)
select 'UPGRADE.INVESTOR_REPORT.' || upper(p.k), 'Laporan investor (' || p.n || ')', 'fitur', 'upgrade', p.k, 'pro', 1, 'REPORT.INVESTOR.REQUESTED',
  'Laporan investor profesional siap dikirim.',
  'Paket Pro menyusun laporan A4 bersampul berisi laporan keuangan, rasio, KPI, skenario, risiko, dan valuasi dari data Anda — disetujui pemilik lalu diarsip berversi.',
  'Upgrade ke Paket Pro', 'Nanti saja', 25, 7, false, 'sistem'
from (values ('gratis', 'Gratis'), ('dasar', 'Dasar'), ('bisnis', 'Bisnis')) as p(k, n)
on conflict (id) do nothing;

-- ---------- Tabel ----------
create table public.investor_reports (
  id uuid primary key default gen_random_uuid(),
  kos_id uuid not null references public.kos(id) on delete cascade,
  number text not null,
  title text not null check (length(trim(title)) between 3 and 120),
  period_from date not null,
  period_to date not null,
  cmp_from date,
  cmp_to date,
  scenario_id uuid references public.fin_scenarios(id) on delete set null,
  valuation_id uuid references public.valuations(id) on delete set null,
  sections jsonb not null default '{}',
  include jsonb not null default '{}',
  status text not null default 'draf' check (status in ('draf', 'diajukan', 'final', 'ditolak')),
  revision_of uuid references public.investor_reports(id) on delete set null,
  snapshot jsonb,
  log jsonb not null default '[]',
  created_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  submitted_by text, submitted_at timestamptz,
  finalized_by text, finalized_at timestamptz,
  decision_note text,
  unique (kos_id, number),
  check (period_to >= period_from and period_to - period_from <= 731),
  check ((cmp_from is null) = (cmp_to is null) and (cmp_to is null or cmp_to >= cmp_from)),
  check ((status = 'final') = (snapshot is not null))
);
create index investor_reports_kos on public.investor_reports(kos_id, created_at desc);
alter table public.investor_reports enable row level security;
revoke all on public.investor_reports from anon, authenticated;
create trigger zz_kos_open_guard before insert or update or delete on public.investor_reports for each row execute function public.kos_open_guard();

create or replace function public.investor_reports_final_lock()
returns trigger language plpgsql as $$
begin
  if tg_op = 'DELETE' and old.status = 'final' then raise exception 'Laporan final tidak bisa dihapus (arsip).'; end if;
  if tg_op = 'UPDATE' and old.status = 'final' then raise exception 'Laporan final terkunci. Buat revisi untuk perubahan.'; end if;
  return case when tg_op = 'DELETE' then old else new end;
end $$;
create trigger investor_reports_final_lock before update or delete on public.investor_reports for each row execute function public.investor_reports_final_lock();

-- ---------- Data laporan (satu sumber untuk draf & final) ----------
create or replace function public.investor_snapshot(p_kos uuid, p_from date, p_to date, p_cmp_from date, p_cmp_to date, p_scenario uuid, p_valuation uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare k kos; v_today date := (now() at time zone 'Asia/Jakarta')::date;
begin
  select * into k from kos where id = p_kos;
  return jsonb_build_object(
    'dibuat', now(), 'model', 'v1',
    'bisnis', jsonb_build_object('nama', k.name, 'jenis', k.business_type, 'template', k.template_code, 'alamat', k.profile ->> 'address',
                                 'logo_path', k.profile ->> 'logo_path'),
    'periode', jsonb_build_object('from', p_from, 'to', p_to, 'cmp_from', p_cmp_from, 'cmp_to', p_cmp_to),
    'keuangan', biz_financials(p_kos, p_from, p_to, p_cmp_from, p_cmp_to),
    'kas', acct_cashflow(p_kos, p_from, p_to),
    'kpi', case when k.business_type in ('jasa', 'properti') then jsonb_build_object('cur', industry_kpi_period(p_kos, p_from, p_to),
             'cmp', case when p_cmp_from is not null then industry_kpi_period(p_kos, p_cmp_from, p_cmp_to) end) end,
    'risiko', (select coalesce(jsonb_agg(jsonb_build_object('number', r.number, 'title', r.title, 'category', r.category, 'likelihood', r.likelihood, 'impact', r.impact,
                 'res_likelihood', r.res_likelihood, 'res_impact', r.res_impact, 'strategy', r.strategy, 'mitigation', r.mitigation, 'status', r.status,
                 'owner_label', case when r.owner_user is not null then prj_user_label(r.owner_user) end, 'next_review', r.next_review)
                 order by r.likelihood * r.impact desc, r.number), '[]')
               from risks r where r.kos_id = p_kos and (r.status <> 'ditutup' or (r.closed_at at time zone 'Asia/Jakarta')::date between p_from and p_to)),
    'skenario', (select to_jsonb(s) - 'kos_id' from fin_scenarios s where s.id = p_scenario and s.kos_id = p_kos),
    'valuasi', (select to_jsonb(v) - 'kos_id' from valuations v where v.id = p_valuation and v.kos_id = p_kos));
end $$;

create or replace function public.investor_guard(p_kos uuid)
returns void language plpgsql stable security definer set search_path = public as $$
begin
  if not member_in('finance', p_kos) then raise exception 'Tidak punya akses keuangan bisnis ini'; end if;
  if not plan_has(p_kos, 'laporan_investor') then raise exception 'BATAS_PAKET: Laporan investor tersedia di Paket Pro.'; end if;
end $$;

create or replace function public.investor_report_row(r investor_reports, p_full boolean)
returns jsonb language sql stable security definer set search_path = public as $$
  select (to_jsonb(r) - 'snapshot') || jsonb_build_object('has_snapshot', r.snapshot is not null) || case when p_full then jsonb_build_object('snapshot', r.snapshot) else '{}'::jsonb end;
$$;

-- Simpan draf. p: title, period_from, period_to, cmp_from, cmp_to, scenario_id, valuation_id, sections {ringkasan, mdna, prospek, catatan}, include {kode: bool}
create or replace function public.investor_report_save(p_kos uuid, p_id uuid, p jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare o investor_reports; r investor_reports; v_sec jsonb := '{}'; v_inc jsonb := '{}'; k text;
        v_scn uuid := nullif(p ->> 'scenario_id', '')::uuid; v_val uuid := nullif(p ->> 'valuation_id', '')::uuid;
begin
  perform investor_guard(p_kos);
  foreach k in array array['ringkasan', 'mdna', 'prospek', 'catatan'] loop
    if length(coalesce(p -> 'sections' ->> k, '')) > 6000 then raise exception 'Teks % terlalu panjang (maks. 6000 huruf)', k; end if;
    v_sec := v_sec || jsonb_build_object(k, nullif(trim(coalesce(p -> 'sections' ->> k, '')), ''));
  end loop;
  foreach k in array array['keuangan', 'ekuitas', 'kas', 'rasio', 'kpi', 'skenario', 'risiko', 'valuasi', 'metodologi'] loop
    v_inc := v_inc || jsonb_build_object(k, coalesce((p -> 'include' ->> k)::boolean, true));
  end loop;
  if v_scn is not null and not exists (select 1 from fin_scenarios where id = v_scn and kos_id = p_kos) then raise exception 'Skenario tidak ditemukan'; end if;
  if v_val is not null and not exists (select 1 from valuations where id = v_val and kos_id = p_kos) then raise exception 'Valuasi tidak ditemukan'; end if;
  select * into o from investor_reports where id = p_id;
  if o.id is not null and o.kos_id <> p_kos then raise exception 'Laporan tidak ditemukan'; end if;
  if o.id is null then
    insert into investor_reports(id, kos_id, number, title, period_from, period_to, cmp_from, cmp_to, scenario_id, valuation_id, sections, include, log, created_by)
    values (coalesce(p_id, gen_random_uuid()), p_kos, prj_next_number(p_kos, 'LIN', 'investor_reports'), trim(p ->> 'title'), (p ->> 'period_from')::date, (p ->> 'period_to')::date,
            nullif(p ->> 'cmp_from', '')::date, nullif(p ->> 'cmp_to', '')::date, v_scn, v_val, v_sec, v_inc,
            jsonb_build_array(jsonb_build_object('at', now(), 'by', actor_email(), 'ev', 'dibuat')), actor_email())
    returning * into r;
  else
    if o.status not in ('draf', 'ditolak', 'diajukan') then raise exception 'Laporan ini sudah %', o.status; end if;
    update investor_reports set title = trim(p ->> 'title'), period_from = (p ->> 'period_from')::date, period_to = (p ->> 'period_to')::date,
      cmp_from = nullif(p ->> 'cmp_from', '')::date, cmp_to = nullif(p ->> 'cmp_to', '')::date, scenario_id = v_scn, valuation_id = v_val,
      sections = v_sec, include = v_inc, status = 'draf', updated_at = now(),
      log = log || case when o.status <> 'draf' then jsonb_build_array(jsonb_build_object('at', now(), 'by', actor_email(), 'ev', 'revisi', 'dari', o.status)) else '[]'::jsonb end
    where id = o.id returning * into r;
  end if;
  return investor_report_row(r, false);
end $$;

create or replace function public.investor_report_submit(p_kos uuid, p_id uuid, p_note text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare r investor_reports;
begin
  perform investor_guard(p_kos);
  update investor_reports set status = 'diajukan', submitted_by = actor_email(), submitted_at = now(), decision_note = null, updated_at = now(),
    log = log || jsonb_build_array(jsonb_build_object('at', now(), 'by', actor_email(), 'ev', 'diajukan', 'catatan', nullif(trim(coalesce(p_note, '')), '')))
  where id = p_id and kos_id = p_kos and status in ('draf', 'ditolak') returning * into r;
  if r.id is null then raise exception 'Hanya draf atau laporan yang ditolak yang bisa diajukan'; end if;
  return investor_report_row(r, false);
end $$;

-- Keputusan pemilik: final (dari draf/diajukan; angka DIBEKUKAN) atau tolak (dari diajukan, alasan wajib)
create or replace function public.investor_report_decide(p_kos uuid, p_id uuid, p_decision text, p_note text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare o investor_reports; r investor_reports;
begin
  perform investor_guard(p_kos);
  if not member_in('team', p_kos) then raise exception 'Hanya pemilik yang memfinalkan atau menolak laporan investor'; end if;
  select * into o from investor_reports where id = p_id and kos_id = p_kos for update;
  if o.id is null then raise exception 'Laporan tidak ditemukan'; end if;
  if p_decision = 'final' then
    if o.status not in ('draf', 'diajukan') then raise exception 'Laporan ini sudah %', o.status; end if;
    perform acct_sync_internal(p_kos);
    update investor_reports set status = 'final', finalized_by = actor_email(), finalized_at = now(), decision_note = nullif(trim(coalesce(p_note, '')), ''),
      snapshot = investor_snapshot(p_kos, o.period_from, o.period_to, o.cmp_from, o.cmp_to, o.scenario_id, o.valuation_id), updated_at = now(),
      log = log || jsonb_build_array(jsonb_build_object('at', now(), 'by', actor_email(), 'ev', 'final', 'catatan', nullif(trim(coalesce(p_note, '')), '')))
    where id = o.id returning * into r;
    perform config_log(p_kos, 'final_laporan_investor', o.number || ' · ' || o.title, jsonb_build_object('status', o.status), jsonb_build_object('status', 'final'), nullif(trim(coalesce(p_note, '')), ''), 'sedang', null);
  elsif p_decision = 'tolak' then
    if o.status <> 'diajukan' then raise exception 'Hanya laporan yang diajukan yang bisa ditolak'; end if;
    if length(trim(coalesce(p_note, ''))) < 3 then raise exception 'Tulis alasan penolakan'; end if;
    update investor_reports set status = 'ditolak', decision_note = trim(p_note), updated_at = now(),
      log = log || jsonb_build_array(jsonb_build_object('at', now(), 'by', actor_email(), 'ev', 'ditolak', 'catatan', trim(p_note)))
    where id = o.id returning * into r;
  else raise exception 'Keputusan tidak valid';
  end if;
  return investor_report_row(r, false);
end $$;

-- Revisi laporan final = draf baru yang menyalin isi (laporan final tetap utuh di arsip)
create or replace function public.investor_report_revise(p_kos uuid, p_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare o investor_reports; r investor_reports;
begin
  perform investor_guard(p_kos);
  select * into o from investor_reports where id = p_id and kos_id = p_kos;
  if o.id is null or o.status <> 'final' then raise exception 'Hanya laporan final yang bisa direvisi'; end if;
  insert into investor_reports(kos_id, number, title, period_from, period_to, cmp_from, cmp_to, scenario_id, valuation_id, sections, include, revision_of, log, created_by)
  values (p_kos, prj_next_number(p_kos, 'LIN', 'investor_reports'), o.title, o.period_from, o.period_to, o.cmp_from, o.cmp_to, o.scenario_id, o.valuation_id,
          o.sections, o.include, o.id, jsonb_build_array(jsonb_build_object('at', now(), 'by', actor_email(), 'ev', 'dibuat', 'revisi_dari', o.number)), actor_email())
  returning * into r;
  return investor_report_row(r, false);
end $$;

create or replace function public.investor_report_delete(p_kos uuid, p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform investor_guard(p_kos);
  delete from investor_reports where id = p_id and kos_id = p_kos and status in ('draf', 'ditolak');
  if not found then raise exception 'Hanya draf yang bisa dihapus'; end if;
end $$;

create or replace function public.investor_report_list(p_kos uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if not member_in('finance', p_kos) then raise exception 'Tidak punya akses keuangan bisnis ini'; end if;
  return jsonb_build_object('aktif', plan_has(p_kos, 'laporan_investor'), 'boleh_final', member_in('team', p_kos),
    'reports', (select coalesce(jsonb_agg(investor_report_row(r, false) order by r.created_at desc), '[]') from investor_reports r where r.kos_id = p_kos),
    'skenario', (select coalesce(jsonb_agg(jsonb_build_object('id', id, 'label', name || ' · versi ' || version) order by created_at desc), '[]') from fin_scenarios where kos_id = p_kos and archived_at is null),
    'valuasi', (select coalesce(jsonb_agg(jsonb_build_object('id', id, 'label', name || ' · versi ' || version) order by created_at desc), '[]') from valuations where kos_id = p_kos and archived_at is null));
end $$;

-- Satu laporan + datanya: final = snapshot beku; selain itu = investor_snapshot terkini (pratinjau)
create or replace function public.investor_report_get(p_kos uuid, p_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare r investor_reports;
begin
  if not member_in('finance', p_kos) then raise exception 'Tidak punya akses keuangan bisnis ini'; end if;
  select * into r from investor_reports where id = p_id and kos_id = p_kos;
  if r.id is null then raise exception 'Laporan tidak ditemukan'; end if;
  if r.status <> 'final' then
    if not plan_has(p_kos, 'laporan_investor') then raise exception 'BATAS_PAKET: Laporan investor tersedia di Paket Pro.'; end if;
    perform acct_sync_internal(p_kos);
  end if;
  return investor_report_row(r, false) || jsonb_build_object('boleh_final', member_in('team', p_kos), 'beku', r.status = 'final',
    'data', case when r.status = 'final' then r.snapshot else investor_snapshot(p_kos, r.period_from, r.period_to, r.cmp_from, r.cmp_to, r.scenario_id, r.valuation_id) end);
end $$;

revoke execute on function public.investor_snapshot(uuid, date, date, date, date, uuid, uuid), public.investor_guard(uuid), public.investor_report_row(investor_reports, boolean)
  from public, anon, authenticated;
revoke execute on function public.investor_report_save(uuid, uuid, jsonb), public.investor_report_submit(uuid, uuid, text), public.investor_report_decide(uuid, uuid, text, text),
  public.investor_report_revise(uuid, uuid), public.investor_report_delete(uuid, uuid), public.investor_report_list(uuid), public.investor_report_get(uuid, uuid) from public, anon;
grant execute on function public.investor_report_save(uuid, uuid, jsonb), public.investor_report_submit(uuid, uuid, text), public.investor_report_decide(uuid, uuid, text, text),
  public.investor_report_revise(uuid, uuid), public.investor_report_delete(uuid, uuid), public.investor_report_list(uuid), public.investor_report_get(uuid, uuid) to authenticated;
