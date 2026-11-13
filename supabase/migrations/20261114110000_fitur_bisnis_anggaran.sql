-- Fitur Paket Bisnis (Master Prompt V2 §4.1, §6.2) + Anggaran & realisasi.
-- Keputusan pemilik 14 Nov 2026: fitur dikunci HANYA untuk bisnis baru; bisnis yang sudah ada tetap memakainya.
--  • Kode fitur baru di paket Bisnis & Pro: jurnal_manual, persetujuan (mengatur aturan persetujuan sendiri),
--    otomatisasi (menyalakan resep), anggaran.
--  • kos.legacy_features = fitur yang dipertahankan untuk bisnis lama (diisi sekali di migrasi ini; bisnis baru kosong).
--    plan_has & my_entitlements ikut membacanya, jadi semua pemeriksaan lama otomatis benar.
--  • Pengaman persetujuan BAWAAN (mis. batal penjualan wajib disetujui) tetap berlaku untuk semua paket.
--  • Otomatisasi milik bisnis tanpa fitur ini tidak dijalankan jadwal harian (mis. setelah turun paket); mematikan selalu boleh.
--  • Growth: konteks 'fitur' (FINANCE.MANUAL_JOURNAL_REQUESTED, BUDGET.CREATE_REQUESTED, TRANSACTION.APPROVAL_REQUESTED,
--    WORKFLOW.REQUESTED) hanya ditawarkan bila fitur itu memang belum dimiliki.

-- ---------- 1) Fitur di paket & bisnis lama ----------
update public.plan_versions v
set features = (select array_agg(distinct f order by f) from unnest(v.features || '{jurnal_manual,persetujuan,otomatisasi,anggaran}'::text[]) f)
where v.plan_key in ('bisnis', 'pro') and v.id = (public.plan_current(v.plan_key)).id;

alter table public.kos add column if not exists legacy_features text[] not null default '{}';
update public.kos set legacy_features = '{jurnal_manual,persetujuan,otomatisasi}' where legacy_features = '{}';

create or replace function public.plan_has(p_kos uuid, p_feature text)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(p_feature = any ((plan_current(kos_plan(p_kos))).features), false)
      or coalesce((select p_feature = any (legacy_features) from kos where id = p_kos), false);
$$;

create or replace function public.my_entitlements()
returns jsonb language sql stable security definer set search_path = public as $$
  with t as (select (now() at time zone 'Asia/Jakarta')::date as d, setting_int('grace_days', 0) as g)
  select coalesce(jsonb_object_agg(k.id, jsonb_build_object(
    'plan', kos_plan(k.id), 'name', p.name,
    'features', (select coalesce(array_agg(distinct f), '{}') from unnest(coalesce(v.features, '{}') || k.legacy_features) f),
    'legacy_features', k.legacy_features, 'limits', v.limits,
    'grace', (k.paid_until is not null and k.plan <> free_plan() and coalesce(k.next_until, k.paid_until) < t.d and coalesce(k.next_until, k.paid_until) + t.g >= t.d),
    'grace_until', case when k.paid_until is not null then coalesce(k.next_until, k.paid_until) + t.g end,
    'next_plan', k.next_plan, 'next_name', (select name from plans where key = k.next_plan), 'next_until', k.next_until,
    'cancel_at_end', k.cancel_at_end)), '{}')
  from kos k join kos_members m on m.kos_id = k.id and m.user_id = auth.uid() and m.active, t,
    lateral (select * from plan_current(kos_plan(k.id))) v
    join plans p on p.key = v.plan_key;
$$;

-- ---------- 2) Pemeriksaan di server ----------
create or replace function public._prasara_patch(p_sig text, p_old text, p_new text)
returns void language plpgsql as $$
declare d text;
begin
  d := pg_get_functiondef(p_sig::regprocedure);
  if position(p_old in d) = 0 then raise exception 'patch % : potongan tidak ditemukan: %', p_sig, left(p_old, 80); end if;
  execute replace(d, p_old, p_new);
end $$;

select public._prasara_patch('public.acct_manual(uuid,date,text,jsonb)',
  'if not member_can(p_kos, ''team'') then raise exception ''Jurnal manual hanya oleh pemilik''; end if;',
  'if not member_can(p_kos, ''team'') then raise exception ''Jurnal manual hanya oleh pemilik''; end if;
  if not plan_has(p_kos, ''jurnal_manual'') then raise exception ''BATAS_PAKET: Jurnal manual tersedia mulai Paket Bisnis.''; end if;');

select public._prasara_patch('public.approval_rule_set(uuid,text,boolean)',
  'if not member_can(p_kos, ''team'') then raise exception ''Khusus pemilik bisnis''; end if;',
  'if not member_can(p_kos, ''team'') then raise exception ''Khusus pemilik bisnis''; end if;
  if not plan_has(p_kos, ''persetujuan'') then raise exception ''BATAS_PAKET: Mengatur aturan persetujuan sendiri tersedia mulai Paket Bisnis. Pengaman bawaan tetap berlaku.''; end if;');

select public._prasara_patch('public.automation_set(uuid,text,boolean,jsonb)',
  'if not member_can(p_kos, ''team'') then raise exception ''Hanya pemilik yang bisa menyalakan/mengubah otomatisasi''; end if;',
  'if not member_can(p_kos, ''team'') then raise exception ''Hanya pemilik yang bisa menyalakan/mengubah otomatisasi''; end if;
  if p_enabled and not plan_has(p_kos, ''otomatisasi'') then raise exception ''BATAS_PAKET: Otomatisasi tersedia mulai Paket Bisnis.''; end if;');

select public._prasara_patch('public.automation_run_now(uuid)',
  'if ru.id is null or not member_can(ru.kos_id, ''team'') then raise exception ''Aturan tidak ditemukan''; end if;',
  'if ru.id is null or not member_can(ru.kos_id, ''team'') then raise exception ''Aturan tidak ditemukan''; end if;
  if not plan_has(ru.kos_id, ''otomatisasi'') then raise exception ''BATAS_PAKET: Otomatisasi tersedia mulai Paket Bisnis.''; end if;');

select public._prasara_patch('public.automation_tick()',
  'where ru.enabled and k.suspended_at is null and k.closed_at is null',
  'where ru.enabled and k.suspended_at is null and k.closed_at is null and plan_has(k.id, ''otomatisasi'')');

-- ---------- 3) Anggaran & realisasi ----------
create table if not exists public.budgets (
  kos_id uuid not null references public.kos(id) on delete cascade,
  month date not null check (month = date_trunc('month', month)::date),
  category_id uuid not null references public.expense_categories(id) on delete cascade,
  amount numeric(14,2) not null check (amount > 0),
  updated_by text,
  updated_at timestamptz not null default now(),
  primary key (kos_id, month, category_id)
);
alter table public.budgets enable row level security;
drop policy if exists budgets_select on public.budgets;
create policy budgets_select on public.budgets for select using (public.member_can(kos_id, 'finance'));
grant select on public.budgets to authenticated;
drop trigger if exists zz_kos_open_guard on public.budgets;
create trigger zz_kos_open_guard before insert or update or delete on public.budgets
  for each row execute function public.kos_open_guard();

create or replace function public.budget_save(p_kos uuid, p_month date, p_category uuid, p_amount numeric)
returns void language plpgsql security definer set search_path = public as $$
declare v_m date := date_trunc('month', p_month)::date; v_old numeric; v_name text;
begin
  if not member_can(p_kos, 'finance') then raise exception 'Tidak punya akses keuangan bisnis ini'; end if;
  if not plan_has(p_kos, 'anggaran') then raise exception 'BATAS_PAKET: Anggaran & realisasi tersedia mulai Paket Bisnis.'; end if;
  select name into v_name from expense_categories where id = p_category and kos_id = p_kos;
  if v_name is null then raise exception 'Kategori biaya tidak ditemukan'; end if;
  if p_amount is not null and (p_amount < 0 or p_amount > 999999999999) then raise exception 'Nominal anggaran tidak valid'; end if;
  select amount into v_old from budgets where kos_id = p_kos and month = v_m and category_id = p_category;
  if coalesce(p_amount, 0) = 0 then
    delete from budgets where kos_id = p_kos and month = v_m and category_id = p_category;
  else
    insert into budgets(kos_id, month, category_id, amount, updated_by) values (p_kos, v_m, p_category, round(p_amount, 2), actor_email())
    on conflict (kos_id, month, category_id) do update set amount = excluded.amount, updated_by = excluded.updated_by, updated_at = now();
  end if;
  if v_old is distinct from nullif(round(coalesce(p_amount, 0), 2), 0) then
    perform config_log(p_kos, 'ubah_anggaran', to_char(v_m, 'YYYY-MM') || ' · ' || v_name,
      jsonb_build_object('anggaran', v_old), jsonb_build_object('anggaran', nullif(round(coalesce(p_amount, 0), 2), 0)), null, 'rendah', null);
  end if;
end $$;

-- Salin anggaran satu bulan ke bulan lain (hanya kategori yang belum punya anggaran di bulan tujuan)
create or replace function public.budget_copy(p_kos uuid, p_from date, p_to date)
returns int language plpgsql security definer set search_path = public as $$
declare v_from date := date_trunc('month', p_from)::date; v_to date := date_trunc('month', p_to)::date; v_n int;
begin
  if not member_can(p_kos, 'finance') then raise exception 'Tidak punya akses keuangan bisnis ini'; end if;
  if not plan_has(p_kos, 'anggaran') then raise exception 'BATAS_PAKET: Anggaran & realisasi tersedia mulai Paket Bisnis.'; end if;
  if v_from = v_to then raise exception 'Bulan asal dan tujuan sama'; end if;
  insert into budgets(kos_id, month, category_id, amount, updated_by)
  select kos_id, v_to, category_id, amount, actor_email() from budgets where kos_id = p_kos and month = v_from
  on conflict (kos_id, month, category_id) do nothing;
  get diagnostics v_n = row_count;
  if v_n > 0 then perform config_log(p_kos, 'salin_anggaran', to_char(v_from, 'YYYY-MM') || ' → ' || to_char(v_to, 'YYYY-MM'), null, jsonb_build_object('kategori', v_n), null, 'rendah', null); end if;
  return v_n;
end $$;

-- Anggaran vs realisasi satu bulan: realisasi = pengeluaran tercatat per kategori pada bulan itu
create or replace function public.budget_report(p_kos uuid, p_month date)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_m date := date_trunc('month', p_month)::date; v_e date; v_p date;
begin
  if not member_can(p_kos, 'finance') then raise exception 'Tidak punya akses keuangan bisnis ini'; end if;
  v_e := (v_m + interval '1 month')::date; v_p := (v_m - interval '1 month')::date;
  return jsonb_build_object(
    'bulan', v_m, 'aktif', plan_has(p_kos, 'anggaran'),
    'ada_bulan_lalu', exists (select 1 from budgets where kos_id = p_kos and month = v_p),
    'baris', (select coalesce(jsonb_agg(x order by (x->>'anggaran') is null, x->>'kind', x->>'nama'), '[]'::jsonb) from (
      select jsonb_build_object('id', c.id, 'nama', c.name, 'kind', c.kind,
        'anggaran', b.amount,
        'realisasi', coalesce((select sum(e.amount) from expenses e where e.kos_id = p_kos and e.category_id = c.id and e.date >= v_m and e.date < v_e), 0),
        'bulan_lalu', coalesce((select sum(e.amount) from expenses e where e.kos_id = p_kos and e.category_id = c.id and e.date >= v_p and e.date < v_m), 0)) x
      from expense_categories c left join budgets b on b.kos_id = p_kos and b.month = v_m and b.category_id = c.id
      where c.kos_id = p_kos) q),
    'tanpa_kategori', coalesce((select sum(amount) from expenses where kos_id = p_kos and category_id is null and date >= v_m and date < v_e), 0));
end $$;

-- ---------- 4) Growth: konteks fitur ----------
alter table public.growth_rules drop constraint if exists growth_rules_context_check;
alter table public.growth_rules add constraint growth_rules_context_check
  check (context in ('karyawan', 'portal', 'umum', 'aktivitas', 'cabang', 'fitur'));
alter table public.growth_rules drop constraint if exists growth_rules_trigger_event_check;
alter table public.growth_rules add constraint growth_rules_trigger_event_check
  check (trigger_event is null or trigger_event in ('LAPORAN.DIBUKA', 'TRANSAKSI.PERTAMA',
    'FINANCE.MANUAL_JOURNAL_REQUESTED', 'BUDGET.CREATE_REQUESTED', 'TRANSACTION.APPROVAL_REQUESTED', 'WORKFLOW.REQUESTED'));
alter table public.growth_rules drop constraint if exists growth_rules_aktivitas_check;
alter table public.growth_rules add constraint growth_rules_aktivitas_check
  check ((context in ('aktivitas', 'fitur')) = (trigger_event is not null));

create or replace function public.growth_event_feature(p_event text)
returns text language sql immutable as $$
  select case p_event when 'FINANCE.MANUAL_JOURNAL_REQUESTED' then 'jurnal_manual' when 'BUDGET.CREATE_REQUESTED' then 'anggaran'
    when 'TRANSACTION.APPROVAL_REQUESTED' then 'persetujuan' when 'WORKFLOW.REQUESTED' then 'otomatisasi' end;
$$;

insert into public.growth_rules(id, name, context, kind, from_plan, to_plan, to_months, trigger_event, title, message, cta, cta_secondary, priority, frequency_days, general, updated_by)
select r.id || '.' || upper(p.k), r.name || ' (' || p.n || ')', 'fitur', 'upgrade', p.k, 'bisnis', 1, r.ev, r.title, r.msg, 'Upgrade ke Paket Bisnis', 'Nanti saja', r.prio, 7, false, 'sistem'
from (values
  ('UPGRADE.FINANCE.MANUAL_JOURNAL', 'Jurnal manual', 'FINANCE.MANUAL_JOURNAL_REQUESTED', 'Rapikan pembukuan dengan jurnal manual.',
   'Paket Bisnis memungkinkan Anda mencatat jurnal penyesuaian dan saldo awal sendiri, di samping jurnal otomatis dari transaksi.', 30),
  ('UPGRADE.BUDGET', 'Anggaran & realisasi', 'BUDGET.CREATE_REQUESTED', 'Kendalikan biaya dengan anggaran.',
   'Paket Bisnis memungkinkan Anda menetapkan anggaran biaya per bulan dan membandingkannya dengan pengeluaran nyata.', 30),
  ('UPGRADE.APPROVAL', 'Atur persetujuan transaksi', 'TRANSACTION.APPROVAL_REQUESTED', 'Atur sendiri tindakan yang perlu persetujuan.',
   'Paket Bisnis memungkinkan Anda menentukan tindakan karyawan mana yang wajib menunggu persetujuan pemilik. Pengaman bawaan tetap berlaku di semua paket.', 30),
  ('UPGRADE.WORKFLOW', 'Otomatisasi', 'WORKFLOW.REQUESTED', 'Biarkan pekerjaan rutin berjalan sendiri.',
   'Paket Bisnis menyalakan otomatisasi operasional: pengingat dan pemeriksaan rutin setiap pagi.', 30)
) as r(id, name, ev, title, msg, prio),
(values ('dasar', 'Dasar'), ('gratis', 'Gratis')) as p(k, n)
on conflict (id) do nothing;

select public._prasara_patch('public.growth_offer(uuid,text,text)',
  'and (p_context <> ''aktivitas'' or trigger_event = p_event)',
  'and (p_context not in (''aktivitas'', ''fitur'') or trigger_event = p_event)');
select public._prasara_patch('public.growth_offer(uuid,text,text)',
  '    elsif v_r.context = ''cabang'' then',
  '    elsif v_r.context = ''fitur'' then
      -- jangan menawarkan fitur yang sudah dimiliki (termasuk fitur bisnis lama)
      if growth_event_feature(v_r.trigger_event) is null or plan_has(p_kos, growth_event_feature(v_r.trigger_event)) then continue; end if;
    elsif v_r.context = ''cabang'' then');
select public._prasara_patch('public.growth_rule_save(text,jsonb)',
  'if v_new.context not in (''karyawan'', ''portal'', ''umum'', ''aktivitas'', ''cabang'') then',
  'if v_new.context not in (''karyawan'', ''portal'', ''umum'', ''aktivitas'', ''cabang'', ''fitur'') then');
select public._prasara_patch('public.growth_rule_save(text,jsonb)',
  'if v_new.context <> ''aktivitas'' then v_new.trigger_event := null; end if;',
  'if v_new.context = ''fitur'' and growth_event_feature(v_new.trigger_event) is null then
    raise exception ''Pilih fitur: jurnal manual, anggaran, persetujuan, atau otomatisasi'';
  end if;
  if v_new.context not in (''aktivitas'', ''fitur'') then v_new.trigger_event := null; end if;');
drop function public._prasara_patch(text, text, text);

-- ---------- Hak akses ----------
revoke execute on function public.budget_save(uuid, date, uuid, numeric), public.budget_copy(uuid, date, date), public.budget_report(uuid, date) from public, anon;
grant execute on function public.budget_save(uuid, date, uuid, numeric), public.budget_copy(uuid, date, date), public.budget_report(uuid, date) to authenticated;
