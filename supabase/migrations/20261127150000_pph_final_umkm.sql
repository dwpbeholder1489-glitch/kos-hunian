-- Tahap B Master Blueprint BI V2.0 (§10): PPh final UMKM 0,5% (keputusan pemilik 27 Nov 2026).
-- • Aturan BERVERSI `tax_rules` (tanggal berlaku; dasar hukum tertulis). Perhitungan bulan lama memakai versi yang berlaku
--   pada bulan itu — mengubah aturan tidak mengubah periode lama diam-diam.
-- • Profil per bisnis `tax_profiles` (jenis WP, NPWP, tahun terdaftar, mulai dihitung) lewat `tax_profile_set` (settings, tercatat
--   di config_history). Bisnis kos wajib konfirmasi karena penghasilan sewa bangunan dapat dikenai PPh final 10% (PP 34/2017).
-- • Dasar pengenaan = pendapatan usaha bersih per bulan dari jurnal (tanpa PPN; tanpa pendapatan lain). Orang pribadi:
--   omzet kumulatif setahun s.d. Rp500 jt tidak dikenai — DIGABUNG untuk semua bisnis milik pemilik yang sama dengan NPWP sama.
-- • Jurnal otomatis per bulan yang SUDAH LEWAT: Beban PPh final (7-1000) ↔ Utang PPh (2-1800). Setoran = cash_entries
--   kind 'bayar_pajak' (+ tax_period) → Utang PPh ↔ Kas/Bank. Peringatan (bukan pemblokiran): omzet > Rp4,8 M, jangka fasilitas.
-- PRASARA menghitung estimasi untuk catatan internal; bukan pengganti pelaporan/penyetoran resmi DJP.

create or replace function public._prasara_patch(p_sig text, p_old text, p_new text)
returns void language plpgsql as $$
declare d text;
begin
  d := pg_get_functiondef(p_sig::regprocedure);
  if position(p_old in d) = 0 then raise exception 'patch %: potongan tidak ditemukan', p_sig; end if;
  execute replace(d, p_old, p_new);
end $$;

-- ---------- Akun ----------
select public._prasara_patch('public.acct_ensure(uuid)',
  $x$('6-3000', 'Beban bunga pinjaman', 'beban', 'beban_bunga')$x$,
  $x$('6-3000', 'Beban bunga pinjaman', 'beban', 'beban_bunga'),
    ('2-1800', 'Utang pajak penghasilan (PPh)', 'kewajiban', 'utang_pph'),
    ('7-1000', 'Beban pajak penghasilan (PPh final)', 'beban', 'beban_pph')$x$);
select public.acct_ensure(id) from public.kos;

-- ---------- Aturan berversi ----------
create table public.tax_rules (
  id text primary key,
  code text not null,
  effective_from date not null,
  effective_to date,
  params jsonb not null,
  legal_basis text not null,
  note text,
  created_at timestamptz not null default now(),
  check (effective_to is null or effective_to >= effective_from)
);
alter table public.tax_rules enable row level security;
create policy tax_rules_read on public.tax_rules for select using (true);
revoke insert, update, delete on public.tax_rules from anon, authenticated;
insert into public.tax_rules(id, code, effective_from, effective_to, params, legal_basis, note) values
  ('pph_final_umkm@2018-07', 'pph_final_umkm', '2018-07-01', '2021-12-31',
   '{"rate": 0.005, "omzet_bebas_op": 0, "batas_omzet": 4800000000, "jangka": {"op": 7, "cv": 4, "firma": 4, "koperasi": 4, "pt": 3}}',
   'PP 23 Tahun 2018', 'Tarif 0,5% dari peredaran bruto per bulan; disetor paling lambat tanggal 15 bulan berikutnya.'),
  ('pph_final_umkm@2022-01', 'pph_final_umkm', '2022-01-01', null,
   '{"rate": 0.005, "omzet_bebas_op": 500000000, "batas_omzet": 4800000000, "jangka": {"op": 7, "cv": 4, "firma": 4, "koperasi": 4, "pt": 3}}',
   'UU 7/2021 (HPP) & PP 55 Tahun 2022', 'Wajib pajak orang pribadi: peredaran bruto sampai Rp500 juta setahun tidak dikenai pajak. Periksa perpanjangan jangka waktu terbaru dari DJP.');

-- ---------- Profil pajak per bisnis ----------
create table public.tax_profiles (
  kos_id uuid primary key references public.kos(id) on delete cascade,
  regime text not null default 'belum' check (regime in ('belum', 'pph_final_umkm', 'lainnya')),
  wp_type text check (wp_type in ('op', 'cv', 'firma', 'koperasi', 'pt')),
  npwp text check (npwp is null or npwp ~ '^[0-9]{15,16}$'),
  registered_year int check (registered_year is null or registered_year between 1980 and 2100),
  start_month date,
  rent_ack boolean not null default false,
  updated_by uuid default auth.uid(),
  updated_at timestamptz not null default now(),
  check (regime <> 'pph_final_umkm' or (wp_type is not null and start_month is not null))
);
alter table public.tax_profiles enable row level security;
create policy tax_profiles_read on public.tax_profiles for select using (member_can(kos_id, 'finance'));
revoke insert, update, delete on public.tax_profiles from anon, authenticated;
create trigger zz_kos_open_guard before insert or update or delete on public.tax_profiles for each row execute function public.kos_open_guard();

-- ---------- Setoran pajak lewat Kas ----------
alter table public.cash_entries add column tax_period date;
alter table public.cash_entries drop constraint cash_entries_kind_check;
alter table public.cash_entries add constraint cash_entries_kind_check
  check (kind in ('pendapatan_lain', 'setoran_modal', 'prive', 'pinjaman_masuk', 'bayar_pinjaman', 'setor_bank', 'tarik_bank', 'pindah_kas', 'bayar_pajak'));
alter table public.cash_entries add constraint cash_entries_tax_period check ((kind = 'bayar_pajak') = (tax_period is not null));

-- Saldo kas: setor pajak = uang keluar (semua fungsi saldo yang menjumlah jenis transaksi Kas)
select public._prasara_patch('public.cash_book_until(uuid,date,uuid)', $x$'prive', 'bayar_pinjaman'$x$, $x$'prive', 'bayar_pinjaman', 'bayar_pajak'$x$);
select public._prasara_patch('public.cash_by_location_internal(uuid)', $x$'prive', 'bayar_pinjaman'$x$, $x$'prive', 'bayar_pinjaman', 'bayar_pajak'$x$);
select public._prasara_patch('public.retail_ledger(uuid)', $x$'prive', 'bayar_pinjaman'$x$, $x$'prive', 'bayar_pinjaman', 'bayar_pajak'$x$);
select public._prasara_patch('public.retail_ledger_internal(uuid)', $x$'prive', 'bayar_pinjaman'$x$, $x$'prive', 'bayar_pinjaman', 'bayar_pajak'$x$);

-- ---------- Perhitungan ----------
-- Pendapatan usaha bersih per bulan (pendapatan selain pendapatan lain; retur sudah negatif) dari jurnal
create or replace function public.pph_gross(p_kos uuid, p_from date, p_to date)
returns table(bulan date, bruto numeric) language sql stable security definer set search_path = public as $$
  select date_trunc('month', e.entry_date)::date, sum(l.credit - l.debit)
  from acct_lines l join acct_entries e on e.id = l.entry_id join acct_accounts a on a.id = l.account_id
  where l.kos_id = p_kos and a.type = 'pendapatan' and coalesce(a.sys_key, '') <> 'pendapatan_lain' and e.entry_date between p_from and p_to
  group by 1;
$$;

-- Bisnis dalam satu "wajib pajak": pemilik sama + NPWP sama + rezim UMKM. Tanpa NPWP = bisnis itu sendiri.
create or replace function public.pph_group(p_kos uuid)
returns setof uuid language sql stable security definer set search_path = public as $$
  select g.id from kos g join tax_profiles tg on tg.kos_id = g.id
  where tg.regime = 'pph_final_umkm' and g.closed_at is null
    and exists (select 1 from kos k join tax_profiles tk on tk.kos_id = k.id
                where k.id = p_kos and tk.npwp is not null and tg.npwp = tk.npwp and g.owner_id = k.owner_id and tg.wp_type = tk.wp_type)
  union select p_kos;
$$;

-- Baris per bulan sejak mulai dihitung s.d. bulan ini (bulan berjalan = estimasi, tidak dijurnal)
create or replace function public.pph_rows(p_kos uuid)
returns table(bulan date, bruto numeric, grup_bruto numeric, kum_sebelum numeric, kena numeric, pajak numeric, rule_id text,
              lewat_batas boolean, lewat_jangka boolean, berjalan boolean)
language plpgsql stable security definer set search_path = public as $$
declare v_p tax_profiles; v_today date := (now() at time zone 'Asia/Jakarta')::date; v_m date; v_rule tax_rules;
        v_bruto numeric; v_grup numeric; v_kum numeric; v_bebas numeric; v_taxg numeric; v_y int := -1; v_last int;
begin
  select * into v_p from tax_profiles where kos_id = p_kos;
  if v_p.kos_id is null or v_p.regime <> 'pph_final_umkm' then return; end if;
  v_m := date_trunc('month', v_p.start_month)::date;
  while v_m <= date_trunc('month', v_today)::date loop
    select * into v_rule from tax_rules r where r.code = 'pph_final_umkm' and r.effective_from <= v_m and (r.effective_to is null or r.effective_to >= v_m)
      order by r.effective_from desc limit 1;
    if v_rule.id is not null then
      if extract(year from v_m)::int <> v_y then v_y := extract(year from v_m)::int; end if;
      select coalesce(sum(x.bruto), 0) into v_bruto from pph_gross(p_kos, v_m, (v_m + interval '1 month - 1 day')::date) x;
      select coalesce(sum(x.bruto), 0) into v_grup from pph_group(p_kos) g, lateral pph_gross(g, v_m, (v_m + interval '1 month - 1 day')::date) x;
      select coalesce(sum(x.bruto), 0) into v_kum from pph_group(p_kos) g, lateral pph_gross(g, make_date(v_y, 1, 1), v_m - 1) x;
      v_bebas := case when v_p.wp_type = 'op' then coalesce((v_rule.params->>'omzet_bebas_op')::numeric, 0) else 0 end;
      -- bagian grup yang kena pajak bulan ini, dibagi ke bisnis ini sebanding omzetnya
      v_taxg := greatest(0, v_kum + v_grup - v_bebas) - greatest(0, v_kum - v_bebas);
      kena := case when v_grup > 0 and v_bruto > 0 then round(v_taxg * v_bruto / v_grup, 2) else 0 end;
      v_last := v_p.registered_year + coalesce((v_rule.params->'jangka'->>v_p.wp_type)::int, 0) - 1;
      bulan := v_m; bruto := round(v_bruto, 2); grup_bruto := round(v_grup, 2); kum_sebelum := round(v_kum, 2);
      pajak := floor(kena * (v_rule.params->>'rate')::numeric); rule_id := v_rule.id;
      lewat_batas := v_kum + v_grup > (v_rule.params->>'batas_omzet')::numeric;
      lewat_jangka := v_p.registered_year is not null and extract(year from v_m)::int > v_last;
      berjalan := (v_m + interval '1 month - 1 day')::date >= v_today;
      return next;
    end if;
    v_m := (v_m + interval '1 month')::date;
  end loop;
end $$;

-- Jurnal: akrual per bulan yang sudah lewat (tanggal = akhir bulan); setoran pajak lewat cash_entries
select public._prasara_patch('public.acct_desired(uuid)',
  $x$(case c.kind when 'prive' then 'prive' when 'bayar_pinjaman' then 'pinjaman' when 'setor_bank' then 'bank'$x$,
  $x$(case c.kind when 'prive' then 'prive' when 'bayar_pinjaman' then 'pinjaman' when 'bayar_pajak' then 'utang_pph' when 'setor_bank' then 'bank'$x$);
select public._prasara_patch('public.acct_desired(uuid)',
  $x$when 'bayar_pinjaman' then 'Bayar pinjaman'$x$,
  $x$when 'bayar_pinjaman' then 'Bayar pinjaman' when 'bayar_pajak' then 'Setor PPh final ' || to_char(c.tax_period, 'MM/YYYY')$x$);
select public._prasara_patch('public.acct_desired(uuid)',
  $x$    where x.v <> 0;
$function$$x$,
  $x$    where x.v <> 0
  union all
  -- PPh final UMKM (Tahap B): beban pajak ↔ utang PPh per bulan yang sudah lewat
  select 'pph_final', md5('pph:' || p_kos::text || ':' || r.bulan::text)::uuid, (r.bulan + interval '1 month - 1 day')::date,
         'PPh final UMKM ' || to_char(r.bulan, 'MM/YYYY'), x.k, x.v
  from pph_rows(p_kos) r
    cross join lateral (values ('beban_pph', r.pajak), ('utang_pph', -r.pajak)) x(k, v)
  where not r.berjalan and r.pajak > 0;
$function$$x$);

-- ---------- Laporan keuangan: pajak penghasilan di bawah laba sebelum pajak ----------
select public._prasara_patch('public.biz_fin_class(text,text)',
  $x$when p_type = 'beban' and p_sys = 'beban_bunga' then 'bunga'$x$,
  $x$when p_type = 'beban' and p_sys = 'beban_bunga' then 'bunga'
    when p_type = 'beban' and p_sys = 'beban_pph' then 'pajak'$x$);
select public._prasara_patch('public.biz_financials(uuid,date,date,date,date)',
  $x$'lengkap', v_full, 'hari', p_to - p_from + 1,$x$,
  $x$'lengkap', v_full, 'hari', p_to - p_from + 1,
    'pajak_profil', (select jsonb_build_object('regime', regime, 'wp_type', wp_type) from tax_profiles where kos_id = p_kos),$x$);

-- ---------- RPC ----------
create or replace function public.tax_profile_set(p_kos uuid, p_data jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_old jsonb; v_type text; v_regime text := coalesce(p_data->>'regime', 'belum'); v_npwp text;
begin
  if not member_in('settings', p_kos) then raise exception 'Hanya pemilik/pengelola pengaturan yang boleh mengatur profil pajak'; end if;
  select business_type into v_type from kos where id = p_kos;
  v_npwp := nullif(regexp_replace(coalesce(p_data->>'npwp', ''), '\D', '', 'g'), '');
  if v_npwp is not null and length(v_npwp) not in (15, 16) then raise exception 'NPWP harus 15 atau 16 digit (NIK untuk orang pribadi)'; end if;
  if v_regime = 'pph_final_umkm' then
    if coalesce(p_data->>'wp_type', '') not in ('op', 'cv', 'firma', 'koperasi', 'pt') then raise exception 'Pilih jenis wajib pajak'; end if;
    if nullif(p_data->>'start_month', '') is null then raise exception 'Isi bulan mulai dihitung'; end if;
    if v_type = 'properti' and not coalesce((p_data->>'rent_ack')::boolean, false) then
      raise exception 'Usaha kos: centang konfirmasi bahwa penghasilan Anda memang memakai PPh final UMKM (bukan PPh final sewa bangunan 10%%)';
    end if;
  end if;
  select to_jsonb(t) - 'updated_by' - 'updated_at' into v_old from tax_profiles t where kos_id = p_kos;
  insert into tax_profiles(kos_id, regime, wp_type, npwp, registered_year, start_month, rent_ack, updated_by, updated_at)
  values (p_kos, v_regime, nullif(p_data->>'wp_type', ''), v_npwp, nullif(p_data->>'registered_year', '')::int,
          date_trunc('month', nullif(p_data->>'start_month', '')::date)::date, coalesce((p_data->>'rent_ack')::boolean, false), auth.uid(), now())
  on conflict (kos_id) do update set regime = excluded.regime, wp_type = excluded.wp_type, npwp = excluded.npwp, registered_year = excluded.registered_year,
    start_month = excluded.start_month, rent_ack = excluded.rent_ack, updated_by = excluded.updated_by, updated_at = now();
  insert into config_history(kos_id, actor, action, target, before, after, reason, risk)
  values (p_kos, actor_email(), 'ubah_profil_pajak', 'tax_profiles', v_old,
          (select to_jsonb(t) - 'updated_by' - 'updated_at' from tax_profiles t where kos_id = p_kos), null, 'sedang');
  return (select to_jsonb(t) from tax_profiles t where kos_id = p_kos);
end $$;

-- Setor pajak (catatan kas keluar) untuk masa pajak tertentu
create or replace function public.tax_pay(p_id uuid, p_kos uuid, p_period date, p_amount numeric, p_date date, p_account text, p_note text)
returns uuid language plpgsql security definer set search_path = public as $$
begin
  if not member_in('finance', p_kos) then raise exception 'Tidak punya akses keuangan'; end if;
  if exists (select 1 from cash_entries where id = p_id) then return p_id; end if;
  if coalesce(p_amount, 0) <= 0 then raise exception 'Isi jumlah setoran'; end if;
  if p_account not in ('kas', 'bank') then raise exception 'Pilih kas atau bank'; end if;
  if p_date is null or p_date > (now() at time zone 'Asia/Jakarta')::date then raise exception 'Tanggal tidak boleh di masa depan'; end if;
  if p_period is null or date_trunc('month', p_period) > date_trunc('month', (now() at time zone 'Asia/Jakarta')::date) then raise exception 'Masa pajak tidak valid'; end if;
  insert into cash_entries(id, kos_id, kind, date, amount, account, description, tax_period)
  values (p_id, p_kos, 'bayar_pajak', p_date, p_amount, p_account, nullif(trim(coalesce(p_note, '')), ''), date_trunc('month', p_period)::date);
  return p_id;
end $$;

create or replace function public.pph_overview(p_kos uuid, p_year int default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_p tax_profiles; v_today date := (now() at time zone 'Asia/Jakarta')::date; v_year int; v_owner boolean; g uuid;
begin
  if not member_in('finance', p_kos) then raise exception 'Tidak punya akses keuangan'; end if;
  v_year := coalesce(p_year, extract(year from v_today)::int);
  select * into v_p from tax_profiles where kos_id = p_kos;
  -- jurnal semua bisnis dalam satu wajib pajak harus terbaru agar batas Rp500 jt benar
  for g in select pph_group(p_kos) loop perform acct_sync_internal(g); end loop;
  perform acct_sync_internal(p_kos);
  v_owner := exists (select 1 from kos where id = p_kos and owner_id = auth.uid());
  return jsonb_build_object(
    'tahun', v_year, 'hari_ini', v_today, 'jenis_bisnis', (select business_type from kos where id = p_kos),
    'profil', to_jsonb(v_p) - 'updated_by',
    'boleh_atur', member_in('settings', p_kos),
    'aturan', (select coalesce(jsonb_agg(to_jsonb(r) order by r.effective_from), '[]') from tax_rules r where r.code = 'pph_final_umkm'),
    'grup', case when v_owner then (select coalesce(jsonb_agg(jsonb_build_object('id', k.id, 'name', k.name)), '[]') from kos k where k.id in (select pph_group(p_kos)) and k.id <> p_kos)
                 else null end,
    'bulan', (select coalesce(jsonb_agg(jsonb_build_object('bulan', r.bulan, 'bruto', r.bruto, 'grup_bruto', case when v_owner then r.grup_bruto end,
                'kum_sebelum', case when v_owner then r.kum_sebelum end, 'kena', r.kena, 'pajak', r.pajak, 'aturan', r.rule_id,
                'lewat_batas', r.lewat_batas, 'lewat_jangka', r.lewat_jangka, 'berjalan', r.berjalan,
                'jatuh_tempo', (r.bulan + interval '1 month')::date + 14,
                'disetor', (select coalesce(sum(c.amount), 0) from cash_entries c where c.kos_id = p_kos and c.kind = 'bayar_pajak' and c.tax_period = r.bulan)) order by r.bulan), '[]')
              from pph_rows(p_kos) r where extract(year from r.bulan)::int = v_year),
    'setoran', (select coalesce(jsonb_agg(jsonb_build_object('id', c.id, 'masa', c.tax_period, 'tanggal', c.date, 'jumlah', c.amount, 'akun', c.account, 'catatan', c.description) order by c.date desc), '[]')
                from cash_entries c where c.kos_id = p_kos and c.kind = 'bayar_pajak' and extract(year from c.tax_period)::int = v_year),
    'utang_pph', (select round(coalesce(-sum(l.debit - l.credit), 0), 2) from acct_lines l join acct_accounts a on a.id = l.account_id where l.kos_id = p_kos and a.sys_key = 'utang_pph'),
    'beban_tahun_ini', (select round(coalesce(sum(l.debit - l.credit), 0), 2) from acct_lines l join acct_entries e on e.id = l.entry_id join acct_accounts a on a.id = l.account_id
                        where l.kos_id = p_kos and a.sys_key = 'beban_pph' and extract(year from e.entry_date)::int = v_year));
end $$;

drop function public._prasara_patch(text, text, text);

revoke execute on function public.pph_gross(uuid, date, date), public.pph_group(uuid), public.pph_rows(uuid) from public, anon, authenticated;
revoke execute on function public.tax_profile_set(uuid, jsonb), public.tax_pay(uuid, uuid, date, numeric, date, text, text), public.pph_overview(uuid, int) from public, anon;
grant execute on function public.tax_profile_set(uuid, jsonb), public.tax_pay(uuid, uuid, date, numeric, date, text, text), public.pph_overview(uuid, int) to authenticated;
grant select on public.tax_rules, public.tax_profiles to authenticated;
