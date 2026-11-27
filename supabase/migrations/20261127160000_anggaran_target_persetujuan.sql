-- Tahap D Master Blueprint BI V2.0 (§13): target pendapatan, status persetujuan anggaran, proyeksi akhir bulan.
-- Di ATAS modul Anggaran lama (budgets per kategori biaya, budget_save/budget_copy/budget_report) — tidak menggantinya.
-- • budget_plans (kos × bulan): target pendapatan, catatan, status draf → diajukan → disetujui / ditolak, revisi, log.
--   Mengubah anggaran yang sudah diajukan/disetujui/ditolak = REVISI: status kembali draf (+ log), tidak diam-diam.
--   Bulan yang sudah tutup buku (acct_periods.closed_at) TERKUNCI untuk perubahan anggaran.
-- • Alur bawaan (usulan, belum diputuskan pemilik): bagian keuangan menyusun & mengajukan, pemilik (area team) menyetujui/menolak;
--   pemilik boleh langsung menyetujui draf.
-- • budget_summary: realisasi pendapatan dari jurnal (pph_gross = pendapatan selain pendapatan lain, sumber sama dengan
--   Laporan Keuangan), realisasi biaya dari expenses (sama dengan budget_report), proyeksi akhir bulan = laju harian
--   (PROYEKSI, ditandai), dampak ke laba.

create or replace function public._prasara_patch(p_sig text, p_old text, p_new text)
returns void language plpgsql as $$
declare d text;
begin
  d := pg_get_functiondef(p_sig::regprocedure);
  if position(p_old in d) = 0 then raise exception 'patch %: potongan tidak ditemukan', p_sig; end if;
  execute replace(d, p_old, p_new);
end $$;

create table public.budget_plans (
  kos_id uuid not null references public.kos(id) on delete cascade,
  month date not null check (month = date_trunc('month', month)::date),
  revenue_target numeric(14,2) check (revenue_target is null or revenue_target > 0),
  note text check (note is null or length(note) <= 500),
  status text not null default 'draf' check (status in ('draf', 'diajukan', 'disetujui', 'ditolak')),
  revision int not null default 0,
  submitted_by text, submitted_at timestamptz,
  decided_by text, decided_at timestamptz, decision_note text,
  log jsonb not null default '[]',
  updated_at timestamptz not null default now(),
  primary key (kos_id, month)
);
alter table public.budget_plans enable row level security;
create policy budget_plans_read on public.budget_plans for select using (member_can(kos_id, 'finance'));
revoke insert, update, delete on public.budget_plans from anon, authenticated;
grant select on public.budget_plans to authenticated;
create trigger zz_kos_open_guard before insert or update or delete on public.budget_plans for each row execute function public.kos_open_guard();

-- Bulan tutup buku = terkunci
create or replace function public.budget_editable(p_kos uuid, p_month date)
returns void language plpgsql stable security definer set search_path = public as $$
begin
  if exists (select 1 from acct_periods where kos_id = p_kos and month = date_trunc('month', p_month)::date and closed_at is not null) then
    raise exception 'Bulan ini sudah tutup buku, jadi anggarannya terkunci. Buka periode di Pembukuan bila memang perlu diubah.';
  end if;
end $$;

-- Setiap perubahan isi anggaran: buat rencana bila belum ada; yang sudah diajukan/disetujui/ditolak kembali draf (revisi)
create or replace function public.budget_touch(p_kos uuid, p_month date, p_what text)
returns void language plpgsql security definer set search_path = public as $$
declare v_m date := date_trunc('month', p_month)::date; v_status text;
begin
  insert into budget_plans(kos_id, month) values (p_kos, v_m) on conflict do nothing;
  select status into v_status from budget_plans where kos_id = p_kos and month = v_m for update;
  update budget_plans set
    status = 'draf',
    revision = revision + case when v_status in ('diajukan', 'disetujui', 'ditolak') then 1 else 0 end,
    log = log || case when v_status in ('diajukan', 'disetujui', 'ditolak')
                  then jsonb_build_array(jsonb_build_object('at', now(), 'by', actor_email(), 'ev', 'revisi', 'dari', v_status, 'apa', p_what)) else '[]'::jsonb end,
    updated_at = now()
  where kos_id = p_kos and month = v_m;
end $$;

select public._prasara_patch('public.budget_save(uuid,date,uuid,numeric)',
  $x$  select amount into v_old from budgets where kos_id = p_kos and month = v_m and category_id = p_category;$x$,
  $x$  perform budget_editable(p_kos, v_m);
  select amount into v_old from budgets where kos_id = p_kos and month = v_m and category_id = p_category;$x$);
select public._prasara_patch('public.budget_save(uuid,date,uuid,numeric)',
  $x$  if v_old is distinct from nullif(round(coalesce(p_amount, 0), 2), 0) then$x$,
  $x$  if v_old is distinct from nullif(round(coalesce(p_amount, 0), 2), 0) then
    perform budget_touch(p_kos, v_m, 'biaya ' || v_name);$x$);
select public._prasara_patch('public.budget_copy(uuid,date,date)',
  $x$  if v_from = v_to then raise exception 'Bulan asal dan tujuan sama'; end if;$x$,
  $x$  if v_from = v_to then raise exception 'Bulan asal dan tujuan sama'; end if;
  perform budget_editable(p_kos, v_to);$x$);
select public._prasara_patch('public.budget_copy(uuid,date,date)',
  $x$  if v_n > 0 then perform config_log($x$,
  $x$  if v_n > 0 then perform budget_touch(p_kos, v_to, 'salin dari ' || to_char(v_from, 'MM/YYYY')); end if;
  if v_n > 0 then perform config_log($x$);

-- Target pendapatan & catatan
create or replace function public.budget_target_save(p_kos uuid, p_month date, p_target numeric, p_note text)
returns void language plpgsql security definer set search_path = public as $$
declare v_m date := date_trunc('month', p_month)::date; v_old budget_plans;
begin
  if not member_can(p_kos, 'finance') then raise exception 'Tidak punya akses keuangan bisnis ini'; end if;
  if not plan_has(p_kos, 'anggaran') then raise exception 'BATAS_PAKET: Anggaran & realisasi tersedia mulai Paket Bisnis.'; end if;
  perform budget_editable(p_kos, v_m);
  if p_target is not null and (p_target < 0 or p_target > 999999999999) then raise exception 'Target pendapatan tidak valid'; end if;
  select * into v_old from budget_plans where kos_id = p_kos and month = v_m;
  if v_old.kos_id is not null and v_old.revenue_target is not distinct from nullif(round(coalesce(p_target, 0), 2), 0)
     and coalesce(v_old.note, '') = coalesce(nullif(trim(coalesce(p_note, '')), ''), '') then return; end if;
  perform budget_touch(p_kos, v_m, 'target pendapatan');
  update budget_plans set revenue_target = nullif(round(coalesce(p_target, 0), 2), 0), note = nullif(trim(coalesce(p_note, '')), ''), updated_at = now()
  where kos_id = p_kos and month = v_m;
  perform config_log(p_kos, 'ubah_target_pendapatan', to_char(v_m, 'YYYY-MM'), jsonb_build_object('target', v_old.revenue_target),
    jsonb_build_object('target', nullif(round(coalesce(p_target, 0), 2), 0)), null, 'rendah', null);
end $$;

create or replace function public.budget_submit(p_kos uuid, p_month date, p_note text)
returns void language plpgsql security definer set search_path = public as $$
declare v_m date := date_trunc('month', p_month)::date; v_p budget_plans;
begin
  if not member_can(p_kos, 'finance') then raise exception 'Tidak punya akses keuangan bisnis ini'; end if;
  if not plan_has(p_kos, 'anggaran') then raise exception 'BATAS_PAKET: Anggaran & realisasi tersedia mulai Paket Bisnis.'; end if;
  perform budget_editable(p_kos, v_m);
  insert into budget_plans(kos_id, month) values (p_kos, v_m) on conflict do nothing;
  select * into v_p from budget_plans where kos_id = p_kos and month = v_m for update;
  if v_p.status not in ('draf', 'ditolak') then raise exception 'Anggaran ini sudah %', v_p.status; end if;
  if v_p.revenue_target is null and not exists (select 1 from budgets where kos_id = p_kos and month = v_m) then
    raise exception 'Isi target pendapatan atau minimal satu anggaran biaya sebelum mengajukan';
  end if;
  update budget_plans set status = 'diajukan', submitted_by = actor_email(), submitted_at = now(), decided_by = null, decided_at = null, decision_note = null,
    log = log || jsonb_build_array(jsonb_build_object('at', now(), 'by', actor_email(), 'ev', 'diajukan', 'catatan', nullif(trim(coalesce(p_note, '')), ''))), updated_at = now()
  where kos_id = p_kos and month = v_m;
end $$;

-- Keputusan pemilik: setujui (dari draf/diajukan) atau tolak (dari diajukan, alasan wajib)
create or replace function public.budget_decide(p_kos uuid, p_month date, p_decision text, p_note text)
returns void language plpgsql security definer set search_path = public as $$
declare v_m date := date_trunc('month', p_month)::date; v_p budget_plans;
begin
  if not member_in('team', p_kos) then raise exception 'Hanya pemilik yang menyetujui atau menolak anggaran'; end if;
  if not plan_has(p_kos, 'anggaran') then raise exception 'BATAS_PAKET: Anggaran & realisasi tersedia mulai Paket Bisnis.'; end if;
  perform budget_editable(p_kos, v_m);
  select * into v_p from budget_plans where kos_id = p_kos and month = v_m for update;
  if v_p.kos_id is null then raise exception 'Belum ada anggaran untuk bulan ini'; end if;
  if p_decision = 'setujui' then
    if v_p.status not in ('draf', 'diajukan') then raise exception 'Anggaran ini sudah %', v_p.status; end if;
    if v_p.revenue_target is null and not exists (select 1 from budgets where kos_id = p_kos and month = v_m) then
      raise exception 'Anggaran masih kosong'; end if;
  elsif p_decision = 'tolak' then
    if v_p.status <> 'diajukan' then raise exception 'Hanya anggaran yang diajukan yang bisa ditolak'; end if;
    if length(trim(coalesce(p_note, ''))) < 3 then raise exception 'Tulis alasan penolakan'; end if;
  else raise exception 'Keputusan tidak valid';
  end if;
  update budget_plans set status = case p_decision when 'setujui' then 'disetujui' else 'ditolak' end,
    decided_by = actor_email(), decided_at = now(), decision_note = nullif(trim(coalesce(p_note, '')), ''),
    log = log || jsonb_build_array(jsonb_build_object('at', now(), 'by', actor_email(), 'ev', case p_decision when 'setujui' then 'disetujui' else 'ditolak' end,
                                                      'catatan', nullif(trim(coalesce(p_note, '')), ''))), updated_at = now()
  where kos_id = p_kos and month = v_m;
  perform config_log(p_kos, case p_decision when 'setujui' then 'setujui_anggaran' else 'tolak_anggaran' end, to_char(v_m, 'YYYY-MM'),
    jsonb_build_object('status', v_p.status), jsonb_build_object('status', case p_decision when 'setujui' then 'disetujui' else 'ditolak' end), nullif(trim(coalesce(p_note, '')), ''), 'sedang', null);
end $$;

-- Ringkasan anggaran vs realisasi + proyeksi akhir bulan (laju harian)
create or replace function public.budget_summary(p_kos uuid, p_month date)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_m date := date_trunc('month', p_month)::date; v_end date; v_today date := (now() at time zone 'Asia/Jakarta')::date;
        v_days int; v_elapsed int; v_fac numeric; v_p budget_plans; v_rev numeric; v_bud numeric; v_exp numeric; v_out numeric; v_rows jsonb;
begin
  if not member_can(p_kos, 'finance') then raise exception 'Tidak punya akses keuangan bisnis ini'; end if;
  perform acct_sync_internal(p_kos);
  v_end := (v_m + interval '1 month - 1 day')::date; v_days := v_end - v_m + 1;
  v_elapsed := greatest(0, least(v_today, v_end) - v_m + 1);
  v_fac := case when v_elapsed = 0 then null when v_today >= v_end then 1 else v_days::numeric / v_elapsed end;   -- null = bulan belum mulai
  select * into v_p from budget_plans where kos_id = p_kos and month = v_m;
  select coalesce(sum(bruto), 0) into v_rev from pph_gross(p_kos, v_m, v_end);
  select coalesce(jsonb_agg(jsonb_build_object('id', c.id, 'nama', c.name, 'kind', c.kind, 'anggaran', b.amount, 'realisasi', x.real,
           'proyeksi', case when v_fac is not null then round(x.real * v_fac, 2) end) order by c.name), '[]'),
         coalesce(sum(b.amount), 0), coalesce(sum(x.real) filter (where b.amount is not null), 0), coalesce(sum(x.real) filter (where b.amount is null), 0)
    into v_rows, v_bud, v_exp, v_out
  from expense_categories c
  left join budgets b on b.kos_id = p_kos and b.month = v_m and b.category_id = c.id
  cross join lateral (select coalesce(sum(e.amount), 0) as real from expenses e where e.kos_id = p_kos and e.category_id = c.id and e.date between v_m and v_end) x
  where c.kos_id = p_kos;
  v_out := v_out + coalesce((select sum(amount) from expenses where kos_id = p_kos and category_id is null and date between v_m and v_end), 0);
  return jsonb_build_object(
    'bulan', v_m, 'aktif', plan_has(p_kos, 'anggaran'), 'hari', v_days, 'hari_berjalan', v_elapsed, 'final', v_today >= v_end,
    'terkunci', exists (select 1 from acct_periods where kos_id = p_kos and month = v_m and closed_at is not null),
    'boleh_putuskan', member_in('team', p_kos),
    'rencana', case when v_p.kos_id is not null then to_jsonb(v_p) end,
    'pendapatan', jsonb_build_object('target', v_p.revenue_target, 'realisasi', round(v_rev, 2), 'proyeksi', case when v_fac is not null then round(v_rev * v_fac, 2) end),
    'biaya', jsonb_build_object('anggaran', v_bud, 'realisasi', round(v_exp, 2), 'proyeksi', case when v_fac is not null then round(v_exp * v_fac, 2) end,
                               'di_luar_anggaran', round(v_out, 2), 'total', round(v_exp + v_out, 2),
                               'total_proyeksi', case when v_fac is not null then round((v_exp + v_out) * v_fac, 2) end),
    'kategori', v_rows);
end $$;

drop function public._prasara_patch(text, text, text);

revoke execute on function public.budget_editable(uuid, date), public.budget_touch(uuid, date, text) from public, anon, authenticated;
revoke execute on function public.budget_target_save(uuid, date, numeric, text), public.budget_submit(uuid, date, text), public.budget_decide(uuid, date, text, text), public.budget_summary(uuid, date) from public, anon;
grant execute on function public.budget_target_save(uuid, date, numeric, text), public.budget_submit(uuid, date, text), public.budget_decide(uuid, date, text, text), public.budget_summary(uuid, date) to authenticated;
