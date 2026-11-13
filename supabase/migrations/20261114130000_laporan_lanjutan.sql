-- Laporan lanjutan (Master Prompt V2 §4.1: Neraca & General Ledger "Ringkasan" di Dasar, "Lengkap" di Bisnis/Pro).
-- Keputusan pemilik 14 Nov 2026: seperti fitur Bisnis lain → dikunci HANYA untuk bisnis baru (bisnis lama tetap lengkap).
-- Fitur `laporan_lanjutan` (Bisnis/Pro):
--   • neraca rinci per akun (tanpa fitur: total aset / kewajiban / ekuitas saja),
--   • buku besar rinci = mutasi per akun (acct_ledger),
--   • laba rugi per lokasi,
--   • laporan gabungan seluruh badan usaha (acct_report p_entity).
-- Tetap untuk semua paket: laba rugi lengkap per akun, neraca ringkas, daftar jurnal, cek kecocokan.
-- Disaring di SERVER (data rinci tidak dikirim), bukan sekadar disembunyikan di tampilan.

update public.plan_versions v
set features = (select array_agg(distinct f order by f) from unnest(v.features || '{laporan_lanjutan}'::text[]) f)
where v.plan_key in ('bisnis', 'pro') and v.id = (public.plan_current(v.plan_key)).id;
update public.kos set legacy_features = (select array_agg(distinct f order by f) from unnest(legacy_features || '{laporan_lanjutan}'::text[]) f)
where created_at < now() and not ('laporan_lanjutan' = any(legacy_features));

-- Ringkas isi laporan bila fitur tidak dimiliki
create or replace function public.acct_report_scope(p_kos uuid, d jsonb)
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if plan_has(p_kos, 'laporan_lanjutan') then return d || jsonb_build_object('ringkas', false); end if;
  return d || jsonb_build_object(
    'ringkas', true,
    'per_lokasi', null,
    'accounts', (
      select coalesce(jsonb_agg(x order by x->>'code'), '[]'::jsonb) from (
        select a as x from jsonb_array_elements(d->'accounts') a where a->>'type' in ('pendapatan', 'beban')
        union all
        select jsonb_build_object('code', case t when 'aset' then '1' when 'kewajiban' then '2' else '3' end,
                 'name', case t when 'aset' then 'Seluruh aset' when 'kewajiban' then 'Seluruh kewajiban' else 'Seluruh ekuitas (modal)' end,
                 'type', t, 'sys_key', null, 'ringkas', true,
                 'period', round(coalesce(sum((a->>'period')::numeric), 0), 2),
                 'balance', round(coalesce(sum((a->>'balance')::numeric), 0), 2))
        from (values ('aset'), ('kewajiban'), ('ekuitas')) v(t)
        left join jsonb_array_elements(d->'accounts') a on a->>'type' = v.t
        group by t) q));
end $$;

create or replace function public._prasara_patch(p_sig text, p_old text, p_new text)
returns void language plpgsql as $$
declare d text;
begin
  d := pg_get_functiondef(p_sig::regprocedure);
  if position(p_old in d) = 0 then raise exception 'patch % : potongan tidak ditemukan: %', p_sig, left(p_old, 80); end if;
  execute replace(d, p_old, p_new);
end $$;

select public._prasara_patch('public.acct_report(uuid,boolean,date,date)',
  'declare v_ids uuid[]; v_posted int := 0;',
  'declare v_out jsonb; v_ids uuid[]; v_posted int := 0;');
select public._prasara_patch('public.acct_report(uuid,boolean,date,date)',
  '  v_ids := acct_scope(p_kos, p_entity);',
  '  v_ids := acct_scope(p_kos, p_entity);
  if p_entity and not plan_has(p_kos, ''laporan_lanjutan'') then
    raise exception ''BATAS_PAKET: Laporan gabungan seluruh badan usaha tersedia mulai Paket Bisnis.'';
  end if;');
select public._prasara_patch('public.acct_report(uuid,boolean,date,date)',
  '  return jsonb_build_object(
    ''from'', p_from,',
  '  v_out := jsonb_build_object(
    ''from'', p_from,');
select public._prasara_patch('public.acct_report(uuid,boolean,date,date)',
  'and active and stock < 0)));
end',
  'and active and stock < 0)));
  return acct_report_scope(p_kos, v_out);
end');

select public._prasara_patch('public.acct_ledger(uuid,boolean,text,date,date)',
  '  v_ids := acct_scope(p_kos, p_entity);',
  '  v_ids := acct_scope(p_kos, p_entity);
  if not plan_has(p_kos, ''laporan_lanjutan'') then
    raise exception ''BATAS_PAKET: Rincian buku besar per akun tersedia mulai Paket Bisnis.'';
  end if;');
drop function public._prasara_patch(text, text, text);

-- Growth: penawaran saat laporan lanjutan dibuka
alter table public.growth_rules drop constraint if exists growth_rules_trigger_event_check;
alter table public.growth_rules add constraint growth_rules_trigger_event_check
  check (trigger_event is null or trigger_event in ('LAPORAN.DIBUKA', 'TRANSAKSI.PERTAMA', 'REPORT.ADVANCED_REQUESTED',
    'FINANCE.MANUAL_JOURNAL_REQUESTED', 'FINANCE.RECONCILIATION_REQUESTED', 'BUDGET.CREATE_REQUESTED', 'TRANSACTION.APPROVAL_REQUESTED', 'WORKFLOW.REQUESTED'));
create or replace function public.growth_event_feature(p_event text)
returns text language sql immutable as $$
  select case p_event when 'FINANCE.MANUAL_JOURNAL_REQUESTED' then 'jurnal_manual' when 'FINANCE.RECONCILIATION_REQUESTED' then 'rekonsiliasi'
    when 'BUDGET.CREATE_REQUESTED' then 'anggaran' when 'TRANSACTION.APPROVAL_REQUESTED' then 'persetujuan' when 'WORKFLOW.REQUESTED' then 'otomatisasi'
    when 'REPORT.ADVANCED_REQUESTED' then 'laporan_lanjutan' end;
$$;
insert into public.growth_rules(id, name, context, kind, from_plan, to_plan, to_months, trigger_event, title, message, cta, cta_secondary, priority, frequency_days, general, updated_by)
select 'UPGRADE.REPORT.ADVANCED.' || upper(p.k), 'Laporan lanjutan (' || p.n || ')', 'fitur', 'upgrade', p.k, 'bisnis', 1, 'REPORT.ADVANCED_REQUESTED',
  'Lihat keuangan bisnis sampai rinci.',
  'Paket Bisnis membuka neraca per akun, rincian buku besar, laba rugi per lokasi, dan laporan gabungan badan usaha.',
  'Upgrade ke Paket Bisnis', 'Nanti saja', 30, 7, false, 'sistem'
from (values ('dasar', 'Dasar'), ('gratis', 'Gratis')) as p(k, n)
on conflict (id) do nothing;

revoke execute on function public.acct_report_scope(uuid, jsonb) from public, anon, authenticated;
