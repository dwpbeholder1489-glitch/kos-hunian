-- Analisis bisnis bertingkat (Master Prompt V2 §4.1 "Analisis bisnis: Dasar | Lanjutan | Mendalam", §6.3 ANALYTICS.MULTI_BRANCH.REQUESTED).
-- Satu sumber data: angka uang dari jurnal (acct_lines, diposting acct_sync_internal) — sama dengan Pembukuan; jumlah transaksi dari
-- tabel operasional. Fitur BARU tanpa pengecualian bisnis lama:
--   Dasar (semua paket)          : bulan ini vs bulan lalu (pendapatan, HPP, laba kotor, biaya, laba, margin, transaksi, rata-rata, hunian)
--   analisis_lanjutan (Bisnis/Pro): + tren 12 bulan, rata-rata 3 bulan, biaya & pendapatan per akun, 5 barang/layanan teratas
--   analisis_mendalam (Pro)       : + perbandingan antar-cabang (bulan ini vs lalu, tren 6 bulan, kontribusi, barang teratas per cabang),
--                                   bulan yang sama tahun lalu, pola hari dalam seminggu (90 hari)

create or replace function public._prasara_patch(p_sig text, p_old text, p_new text)
returns void language plpgsql as $$
declare d text;
begin
  d := pg_get_functiondef(p_sig::regprocedure);
  if position(p_old in d) = 0 then raise exception 'patch % : potongan tidak ditemukan: %', p_sig, left(p_old, 80); end if;
  execute replace(d, p_old, p_new);
end $$;

update public.plan_versions v
set features = (select array_agg(distinct f order by f) from unnest(v.features || '{analisis_lanjutan}'::text[]) f)
where v.plan_key in ('bisnis', 'pro') and v.id = (public.plan_current(v.plan_key)).id;
update public.plan_versions v
set features = (select array_agg(distinct f order by f) from unnest(v.features || '{analisis_mendalam}'::text[]) f)
where v.plan_key = 'pro' and v.id = (public.plan_current(v.plan_key)).id;

create or replace function public.plan_feature_codes()
returns text[] language sql immutable as $$
  select array['laporan_lengkap', 'ekspor', 'kwitansi', 'pengingat_email', 'portal_penghuni', 'email_toko',
               'portal_bisnis', 'jurnal_manual', 'anggaran', 'rekonsiliasi', 'laporan_lanjutan', 'persetujuan', 'otomatisasi',
               'akses_modul', 'akses_granular', 'persetujuan_bertingkat', 'otomatisasi_lanjutan', 'analisis_lanjutan', 'analisis_mendalam'];
$$;

-- Angka per bulan (opsional per lokasi) dari jurnal + transaksi operasional
create or replace function public.biz_month_figures(p_kos uuid, p_from date, p_to date, p_by_branch boolean)
returns table(bulan date, branch_id uuid, pendapatan numeric, hpp numeric, biaya numeric, transaksi bigint)
language sql stable security definer set search_path = public as $$
  with j as (
    select date_trunc('month', e.entry_date)::date as bulan,
           case when p_by_branch then acct_line_branch(l.source_type, l.source_id) end as branch_id,
           -sum(l.debit - l.credit) filter (where a.type = 'pendapatan') as pendapatan,
           sum(l.debit - l.credit) filter (where a.sys_key = 'hpp') as hpp,
           sum(l.debit - l.credit) filter (where a.type = 'beban' and coalesce(a.sys_key, '') <> 'hpp') as biaya
    from acct_lines l join acct_entries e on e.id = l.entry_id join acct_accounts a on a.id = l.account_id
    where l.kos_id = p_kos and e.entry_date between p_from and p_to and a.type in ('pendapatan', 'beban')
    group by 1, 2),
  t as (
    select date_trunc('month', s.sale_date)::date as bulan, case when p_by_branch then s.branch_id end as branch_id, count(*) as n
    from sales s where s.kos_id = p_kos and s.status = 'selesai' and s.sale_date between p_from and p_to group by 1, 2
    union all
    select date_trunc('month', o.completed_date)::date, null, count(*)
    from svc_orders o where o.kos_id = p_kos and o.status = 'selesai' and o.completed_date between p_from and p_to group by 1
    union all
    select date_trunc('month', p.paid_at)::date, null, count(*)
    from payments p where p.kos_id = p_kos and p.status = 'terverifikasi' and p.paid_at between p_from and p_to group by 1),
  tt as (select bulan, branch_id, sum(n) as n from t group by 1, 2)
  select coalesce(j.bulan, tt.bulan), coalesce(j.branch_id, tt.branch_id),
         round(coalesce(j.pendapatan, 0), 2), round(coalesce(j.hpp, 0), 2), round(coalesce(j.biaya, 0), 2), coalesce(tt.n, 0)::bigint
  from j full join tt on tt.bulan = j.bulan and tt.branch_id is not distinct from j.branch_id;
$$;
revoke execute on function public.biz_month_figures(uuid, date, date, boolean) from public, anon, authenticated;

create or replace function public.biz_analysis(p_kos uuid, p_month date)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_level text; v_m0 date; v_m1 date; v_from date; v_type text; v_n int; v_res jsonb; v_multi boolean;
        v_rooms int; v_occ int;
begin
  if not member_in('finance', p_kos) then raise exception 'Tidak punya akses keuangan'; end if;
  v_m0 := date_trunc('month', coalesce(p_month, (now() at time zone 'Asia/Jakarta')::date))::date;
  v_m1 := (v_m0 + interval '1 month - 1 day')::date;
  if v_m0 > date_trunc('month', (now() at time zone 'Asia/Jakarta')::date) then raise exception 'Bulan belum berjalan'; end if;
  perform acct_sync_internal(p_kos);
  v_level := case when plan_has(p_kos, 'analisis_mendalam') then 'mendalam' when plan_has(p_kos, 'analisis_lanjutan') then 'lanjutan' else 'dasar' end;
  select business_type into v_type from kos where id = p_kos;
  v_n := case when v_level = 'dasar' then 2 else 13 end;                       -- 13 = 12 bulan + bulan yang sama tahun lalu
  v_from := (v_m0 - make_interval(months => v_n - 1))::date;

  v_res := jsonb_build_object('level', v_level, 'bulan', v_m0, 'jenis', v_type,
    'per_bulan', (select coalesce(jsonb_agg(jsonb_build_object('bulan', m.b, 'pendapatan', coalesce(f.pendapatan, 0), 'hpp', coalesce(f.hpp, 0),
                     'biaya', coalesce(f.biaya, 0), 'transaksi', coalesce(f.transaksi, 0)) order by m.b), '[]')
                  from generate_series(v_from, v_m0, interval '1 month') m(b)
                  left join (select x.bulan, sum(x.pendapatan) pendapatan, sum(x.hpp) hpp, sum(x.biaya) biaya, sum(x.transaksi) transaksi
                             from biz_month_figures(p_kos, v_from, v_m1, false) x group by x.bulan) f on f.bulan = m.b::date));

  if v_type = 'properti' then
    select count(*) into v_rooms from rooms where kos_id = p_kos;
    select count(distinct room_id) into v_occ from leases where kos_id = p_kos and status = 'aktif';
    v_res := v_res || jsonb_build_object('hunian', jsonb_build_object('kamar', v_rooms, 'terisi', v_occ));
  end if;

  if v_level in ('lanjutan', 'mendalam') then
    v_res := v_res || jsonb_build_object(
      'per_akun', (select coalesce(jsonb_agg(z order by z.jenis, z.ini desc), '[]') from (
          select a.name as akun, case when a.type = 'pendapatan' then 'pendapatan' when a.sys_key = 'hpp' then 'hpp' else 'biaya' end as jenis,
                 round(sum(case when a.type = 'pendapatan' then l.credit - l.debit else l.debit - l.credit end) filter (where e.entry_date between v_m0 and v_m1), 2) as ini,
                 round(sum(case when a.type = 'pendapatan' then l.credit - l.debit else l.debit - l.credit end) filter (where e.entry_date < v_m0), 2) as lalu
          from acct_lines l join acct_entries e on e.id = l.entry_id join acct_accounts a on a.id = l.account_id
          where l.kos_id = p_kos and e.entry_date between (v_m0 - interval '1 month')::date and v_m1 and a.type in ('pendapatan', 'beban')
          group by a.name, 2) z where coalesce(z.ini, 0) <> 0 or coalesce(z.lalu, 0) <> 0),
      'teratas', case
        when v_type = 'retail' then (select coalesce(jsonb_agg(z order by z.nilai desc), '[]') from (
          select sl.name as nama, sum(sl.qty) as jumlah, sl.unit as satuan, round(sum(sl.line_total), 2) as nilai, round(sum(sl.line_total - sl.cost * sl.qty), 2) as laba
          from sale_lines sl join sales s on s.id = sl.sale_id
          where s.kos_id = p_kos and s.status = 'selesai' and s.sale_date between v_m0 and v_m1 group by sl.name, sl.unit order by 4 desc limit 5) z)
        when v_type = 'jasa' then (select coalesce(jsonb_agg(z order by z.nilai desc), '[]') from (
          select ol.name as nama, sum(ol.charge_qty) as jumlah, ol.unit as satuan, round(sum(ol.line_total), 2) as nilai, null::numeric as laba
          from svc_order_lines ol join svc_orders o on o.id = ol.order_id
          where o.kos_id = p_kos and o.status = 'selesai' and o.completed_date between v_m0 and v_m1 group by ol.name, ol.unit order by 4 desc limit 5) z)
        end);
  end if;

  if v_level = 'mendalam' then
    v_multi := (select count(*) from branches where kos_id = p_kos and active) > 1;
    v_res := v_res || jsonb_build_object(
      'multi_lokasi', v_multi,
      'per_lokasi', case when v_multi then (
        select coalesce(jsonb_agg(jsonb_build_object('lokasi', coalesce(b.name, 'Bersama / tanpa lokasi'), 'id', x.branch_id, 'gudang', b.kind = 'gudang',
                 'bulan', x.bulan, 'pendapatan', x.pendapatan, 'hpp', x.hpp, 'biaya', x.biaya, 'transaksi', x.transaksi) order by b.name nulls last, x.bulan), '[]')
        from biz_month_figures(p_kos, (v_m0 - interval '5 month')::date, v_m1, true) x left join branches b on b.id = x.branch_id) end,
      'teratas_lokasi', case when v_multi and v_type = 'retail' then (
        select coalesce(jsonb_agg(z order by z.lokasi, z.nilai desc), '[]') from (
          select coalesce(b.name, 'Tanpa lokasi') as lokasi, sl.name as nama, round(sum(sl.line_total), 2) as nilai,
                 row_number() over (partition by s.branch_id order by sum(sl.line_total) desc) as rn
          from sale_lines sl join sales s on s.id = sl.sale_id left join branches b on b.id = s.branch_id
          where s.kos_id = p_kos and s.status = 'selesai' and s.sale_date between v_m0 and v_m1 group by b.name, s.branch_id, sl.name) z where z.rn <= 3) end,
      'hari', case when v_type in ('retail', 'jasa') then (
        select jsonb_agg(jsonb_build_object('hari', d, 'rata', round(coalesce(t.total, 0) / greatest(c.n, 1), 2)) order by d)
        from generate_series(1, 7) d
        left join (select extract(isodow from dt)::int as dw, sum(v) as total from (
                     select s.sale_date as dt, s.total as v from sales s where s.kos_id = p_kos and s.status = 'selesai' and s.sale_date between v_m1 - 89 and v_m1
                     union all
                     select o.completed_date, o.total from svc_orders o where o.kos_id = p_kos and o.status = 'selesai' and o.completed_date between v_m1 - 89 and v_m1) q
                   group by 1) t on t.dw = d
        left join (select extract(isodow from g)::int as dw, count(*) as n from generate_series(v_m1 - 89, v_m1, interval '1 day') g group by 1) c on c.dw = d) end);
  end if;
  return v_res;
end $$;
revoke execute on function public.biz_analysis(uuid, date) from public, anon;
grant execute on function public.biz_analysis(uuid, date) to authenticated;

-- Growth: penawaran analisis
alter table public.growth_rules drop constraint if exists growth_rules_trigger_event_check;
alter table public.growth_rules add constraint growth_rules_trigger_event_check
  check (trigger_event is null or trigger_event in ('LAPORAN.DIBUKA', 'TRANSAKSI.PERTAMA', 'REPORT.ADVANCED_REQUESTED', 'PORTAL.PUBLIC_PAGE.REQUESTED',
    'PORTAL.CATALOG.REQUESTED', 'PORTAL.REGISTRATION.REQUESTED', 'PORTAL.BOOKING.REQUESTED', 'PORTAL.SYNC.REQUESTED',
    'FINANCE.MANUAL_JOURNAL_REQUESTED', 'FINANCE.RECONCILIATION_REQUESTED', 'BUDGET.CREATE_REQUESTED', 'TRANSACTION.APPROVAL_REQUESTED', 'WORKFLOW.REQUESTED',
    'ACCESS.MODULE.REQUESTED', 'ACCESS.GRANULAR.REQUESTED', 'APPROVAL.MULTILEVEL.REQUESTED', 'WORKFLOW.ADVANCED.REQUESTED',
    'ANALYTICS.ADVANCED.REQUESTED', 'ANALYTICS.MULTI_BRANCH.REQUESTED'));
select public._prasara_patch('public.growth_event_feature(text)',
  'when ''WORKFLOW.ADVANCED.REQUESTED'' then ''otomatisasi_lanjutan'' end;',
  'when ''WORKFLOW.ADVANCED.REQUESTED'' then ''otomatisasi_lanjutan''
    when ''ANALYTICS.ADVANCED.REQUESTED'' then ''analisis_lanjutan'' when ''ANALYTICS.MULTI_BRANCH.REQUESTED'' then ''analisis_mendalam'' end;');

insert into public.growth_rules(id, name, context, kind, from_plan, to_plan, to_months, trigger_event, title, message, cta, cta_secondary, priority, frequency_days, general, updated_by)
select 'UPGRADE.ANALYTICS.ADV.' || upper(p.k), 'Analisis bisnis lanjutan (' || p.n || ')', 'fitur', 'upgrade', p.k, 'bisnis', 1, 'ANALYTICS.ADVANCED.REQUESTED',
  'Lihat arah bisnis Anda 12 bulan ke belakang.',
  'Paket Bisnis menampilkan tren 12 bulan, rata-rata 3 bulan, biaya per jenis, dan barang/layanan paling menghasilkan — semua dari data Anda sendiri.',
  'Upgrade ke Paket Bisnis', 'Nanti saja', 30, 7, false, 'sistem'
from (values ('gratis', 'Gratis'), ('dasar', 'Dasar')) as p(k, n)
on conflict (id) do nothing;
insert into public.growth_rules(id, name, context, kind, from_plan, to_plan, to_months, trigger_event, title, message, cta, cta_secondary, priority, frequency_days, general, updated_by)
select 'UPGRADE.ANALYTICS.DEEP.' || upper(p.k), 'Analisis mendalam & multi-cabang (' || p.n || ')', 'fitur', 'upgrade', p.k, 'pro', 1, 'ANALYTICS.MULTI_BRANCH.REQUESTED',
  'Bandingkan kinerja setiap cabang.',
  'Paket Pro membandingkan pendapatan, laba, dan transaksi antar-cabang, tren 6 bulan per cabang, barang teratas per cabang, bulan yang sama tahun lalu, dan pola hari ramai.',
  'Upgrade ke Paket Pro', 'Nanti saja', 25, 7, false, 'sistem'
from (values ('gratis', 'Gratis'), ('dasar', 'Dasar'), ('bisnis', 'Bisnis')) as p(k, n)
on conflict (id) do nothing;

drop function public._prasara_patch(text, text, text);
