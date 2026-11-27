-- Perbaikan hasil audit BI Tahap A–J (audit pengembang lain, 27 Nov 2026; serah-terima docs/AUDIT_HANDOFF_BI_A-J.md).
-- Setiap butir di bawah dibuktikan dulu dengan uji yang gagal, lalu diperbaiki. Uji: supabase/tests/audit_bi_perbaikan.sql + audit_bi_js.mjs.
-- Keputusan pemilik di handoff §3 TIDAK diubah (paket, peran, alur persetujuan, kelipatan diisi pemilik, dst.).

create or replace function public._prasara_patch(p_sig text, p_old text, p_new text)
returns void language plpgsql as $$
declare d text;
begin
  d := pg_get_functiondef(p_sig::regprocedure);
  if position(p_old in d) = 0 then raise exception 'patch %: potongan tidak ditemukan', p_sig; end if;
  execute replace(d, p_old, p_new);
end $$;

-- ===================== B · PPh final UMKM =====================
-- Sebelumnya grup wajib pajak menyaring bisnis yang SEKARANG ditutup → omzet historisnya hilang dan pajak bulan-bulan lama
-- bisnis lain berubah (contoh uji: Toko A April 450.000 → 250.000 setelah Toko B ditutup). Bisnis tutup tetap anggota grup untuk
-- bulan-bulan yang omzetnya tercatat (jurnalnya tidak berubah setelah ditutup); sesudah tutup omzetnya 0 dengan sendirinya.
create or replace function public.pph_group(p_kos uuid)
returns setof uuid language sql stable security definer set search_path = public as $$
  select g.id from kos g join tax_profiles tg on tg.kos_id = g.id
  where tg.regime = 'pph_final_umkm'
    and exists (select 1 from kos k join tax_profiles tk on tk.kos_id = k.id
                where k.id = p_kos and tk.npwp is not null and tg.npwp = tk.npwp and g.owner_id = k.owner_id and tg.wp_type = tk.wp_type)
  union select p_kos;
$$;
revoke execute on function public.pph_group(uuid) from public, anon, authenticated;
-- Ditemukan saat menguji butir ini (bukan dari laporan audit): SEMUA laporan berbasis jurnal (Pembukuan, Analisis, Laporan Keuangan,
-- PPh, Skenario, …) GAGAL untuk bisnis yang sudah ditutup, karena acct_sync_internal → acct_ensure mencoba menulis dan ditolak
-- zz_kos_open_guard. Bisnis tutup = arsip hanya-baca → jurnal dibaca apa adanya (sinkron lagi otomatis setelah dibuka kembali;
-- cron acct_sync_all memang sudah melewati bisnis tutup).
select public._prasara_patch('public.acct_sync_internal(uuid)',
  $x$  perform acct_ensure(p_kos);
  perform pg_advisory_xact_lock(hashtext('acct:' || p_kos::text));$x$,
  $x$  if exists (select 1 from kos where id = p_kos and closed_at is not null) then return 0; end if;
  perform acct_ensure(p_kos);
  perform pg_advisory_xact_lock(hashtext('acct:' || p_kos::text));$x$);
-- Bisnis tutup = arsip hanya-baca: jurnalnya tidak disinkronkan ulang (dibaca apa adanya).
select public._prasara_patch('public.pph_overview(uuid,integer)',
  $x$for g in select pph_group(p_kos) loop perform acct_sync_internal(g); end loop;$x$,
  $x$for g in select x from pph_group(p_kos) x join kos k on k.id = x where k.closed_at is null loop perform acct_sync_internal(g); end loop;$x$);

-- ===================== I · Konsolidasi =====================
-- (1) Batas periode sama dengan biz_financials (400 hari) — sebelumnya 731 lolos di sini lalu ditolak biz_financials.
-- (2) Per anggota: 'neraca_ada' (bisnis tanpa laporan_lanjutan tidak punya neraca → JS menahan neraca gabungan & ekuitas KNP).
-- (3) Penjualan antarbisnis + 'bought' = pembelian (menu Belanja) pembeli dari kontak penjual pada periode yang sama. Eliminasi
--     pendapatan ↔ HPP otomatis hanya sebesar yang tercatat sebagai pembelian barang; sisanya (mis. dicatat pembeli sebagai
--     pengeluaran/beban) TIDAK ditebak dan ditampilkan sebagai "perlu eliminasi manual" (lib/consolidation.js).
create or replace function public.consol_report(p_group uuid, p_from date, p_to date)
returns jsonb language plpgsql security definer set search_path = public as $$
declare g consol_groups; v_today date := (now() at time zone 'Asia/Jakarta')::date; v_members jsonb; v_sales jsonb; v_arap jsonb; v_bad text;
begin
  g := consol_own(p_group);
  if p_from is null or p_to is null or p_to < p_from or p_to - p_from > 400 then raise exception 'Periode tidak valid (maks. sekitar 1 tahun / 400 hari)'; end if;
  select string_agg(k.name, ', ') into v_bad from consol_members m join kos k on k.id = m.kos_id where m.group_id = g.id and not member_in('finance', m.kos_id);
  if v_bad is not null then raise exception 'Akses keuangan ke % sudah tidak ada. Keluarkan dari grup atau minta akses lagi.', v_bad; end if;
  if not exists (select 1 from consol_members m where m.group_id = g.id and plan_has(m.kos_id, 'gabungan_bisnis')) then
    return jsonb_build_object('aktif', false, 'name', g.name); end if;
  select jsonb_agg(jsonb_build_object('kos_id', m.kos_id, 'name', k.name, 'type', k.business_type, 'pct', m.pct,
           'fin', (select jsonb_build_object('laba_rugi', f -> 'laba_rugi' -> 'cur', 'close', f -> 'neraca' -> 'close', 'open', f -> 'neraca' -> 'open',
                                             'seimbang', f -> 'neraca' -> 'seimbang', 'lengkap', f -> 'lengkap',
                                             'neraca_ada', coalesce(jsonb_typeof(f -> 'neraca') = 'object', false))
                   from (select biz_financials(m.kos_id, p_from, p_to, null, null) f) z)) order by m.pct desc, k.name)
    into v_members from consol_members m join kos k on k.id = m.kos_id where m.group_id = g.id;
  -- (1) penjualan & pesanan jasa antarbisnis + pembelian yang dicatat pembeli
  with mem as (select kos_id from consol_members where group_id = g.id),
  sal as (
    select s.kos_id a, c.related_kos_id b, s.total - s.tax_amount
           - coalesce((select sum(r.total - r.tax_amount) from sale_returns r where r.sale_id = s.id and r.return_date between p_from and p_to), 0) v,
           s.cost_total - coalesce((select sum(r.cost_total) from sale_returns r where r.sale_id = s.id and r.return_date between p_from and p_to), 0) k
    from sales s join contacts c on c.id = s.contact_id
    where s.kos_id in (select kos_id from mem) and c.related_kos_id in (select kos_id from mem) and s.status = 'selesai' and s.sale_date between p_from and p_to
    union all
    select o.kos_id, c.related_kos_id, o.total, o.total from svc_orders o join contacts c on c.id = o.contact_id
    where o.kos_id in (select kos_id from mem) and c.related_kos_id in (select kos_id from mem) and o.status = 'selesai' and o.completed_date between p_from and p_to),
  buy as (
    select c.related_kos_id a, p.kos_id b, sum(p.total) v
    from purchases p join contacts c on c.id = p.contact_id
    where p.kos_id in (select kos_id from mem) and c.related_kos_id in (select kos_id from mem) and p.status in ('selesai', 'sebagian')
      and p.purchase_date between p_from and p_to
    group by 1, 2)
  select coalesce(jsonb_agg(jsonb_build_object('from', z.a, 'to', z.b, 'amount', round(z.t, 2), 'cost', round(least(greatest(z.kc, 0), z.t), 2),
           'bought', round(coalesce(buy.v, 0), 2))), '[]') into v_sales
  from (select a, b, sum(v) t, sum(k) kc from sal group by a, b having sum(v) <> 0) z
  left join buy on buy.a = z.a and buy.b = z.b;
  -- (2) piutang/utang antarbisnis terbuka (posisi hari ini)
  if p_to >= v_today then
    with mem as (select kos_id from consol_members where group_id = g.id),
    ar as (select x.kos_id a, c.related_kos_id b, sum(r.open_amount) v
           from mem x cross join lateral receivable_open_core(x.kos_id) r join contacts c on c.id = r.contact_id
           where c.related_kos_id in (select kos_id from mem) group by 1, 2),
    ap as (select x.kos_id b, c.related_kos_id a, sum(p.open_amount) v
           from mem x cross join lateral payable_open(x.kos_id) p join contacts c on c.id = p.contact_id
           where c.related_kos_id in (select kos_id from mem) group by 1, 2)
    select coalesce(jsonb_agg(jsonb_build_object('creditor', coalesce(ar.a, ap.a), 'debtor', coalesce(ar.b, ap.b), 'piutang', round(coalesce(ar.v, 0), 2),
             'utang', round(coalesce(ap.v, 0), 2))), '[]') into v_arap
    from ar full join ap on ap.a = ar.a and ap.b = ar.b
    where coalesce(ar.v, 0) <> 0 or coalesce(ap.v, 0) <> 0;
  end if;
  return jsonb_build_object('aktif', true, 'id', g.id, 'name', g.name, 'from', p_from, 'to', p_to, 'hari_ini', v_today,
    'members', coalesce(v_members, '[]'), 'auto_sales', v_sales, 'auto_arap', v_arap, 'arap_dilewati', p_to < v_today,
    'manual', (select coalesce(jsonb_agg(to_jsonb(e) - 'group_id' order by e.date, e.created_at), '[]') from consol_elims e
               where e.group_id = g.id and e.voided_at is null and e.date between p_from and p_to),
    'contacts_linked', (select count(*) from contacts c join consol_members m on m.kos_id = c.kos_id and m.group_id = g.id
                        where c.related_kos_id in (select kos_id from consol_members where group_id = g.id)));
end $$;
revoke execute on function public.consol_report(uuid, date, date) from public, anon;
grant execute on function public.consol_report(uuid, date, date) to authenticated;

-- ===================== Analisis Bisnis · tren mengikuti batas paket =====================
-- Paket Dasar (bulan ini & bulan lalu): tren 2 bulan dari periode yang berakhir bulan lalu sempat memuat bulan sebelumnya.
select public._prasara_patch('public.biz_intel(uuid,date,date,date,date,uuid,uuid)',
  $x$v_tfrom := (v_m1 - make_interval(months => v_n - 1))::date;$x$,
  $x$v_tfrom := greatest((v_m1 - make_interval(months => v_n - 1))::date,
                     case when v_level = 'dasar' then v_floor else (date_trunc('month', v_today) - interval '24 month')::date end);$x$);

-- ===================== Laporan keuangan · riwayat bulanan berhenti di akhir periode =====================
select public._prasara_patch('public.biz_financials(uuid,date,date,date,date)',
  $x$and e.entry_date between m.b::date and (m.b + interval '1 month - 1 day')::date$x$,
  $x$and e.entry_date between m.b::date and least((m.b + interval '1 month - 1 day')::date, p_to)$x$);

-- ===================== A · Pinjaman jatuh tempo ≤ 12 bulan kalender =====================
-- 365 hari gagal pada tahun kabisat (28 Nov 2027 → 28 Nov 2028 = 366 hari).
select public._prasara_patch('public.loan_current_portion(uuid,date)',
  $x$r.due_date <= p_asof + 365$x$,
  $x$r.due_date <= (p_asof + interval '12 month')::date$x$);

-- ===================== D · Anggaran · biaya tetap bulanan =====================
-- Biaya tetap (sewa, gaji tetap, langganan) dibayar sekali sebulan: proyeksi = max(realisasi, anggaran), BUKAN realisasi × hari ÷ hari berjalan
-- (sewa 3 jt dibayar tanggal 10 sempat diproyeksikan 9 jt). Tanda per kategori pengeluaran, bawaan tidak (perilaku lama).
alter table public.expense_categories add column if not exists fixed_monthly boolean not null default false;

create or replace function public.expense_category_fixed_set(p_kos uuid, p_category uuid, p_fixed boolean)
returns void language plpgsql security definer set search_path = public as $$
declare c expense_categories;
begin
  if not member_in('finance', p_kos) then raise exception 'Tidak punya akses keuangan bisnis ini'; end if;
  select * into c from expense_categories where id = p_category and kos_id = p_kos for update;
  if c.id is null then raise exception 'Kategori tidak ditemukan'; end if;
  if c.fixed_monthly is distinct from coalesce(p_fixed, false) then
    update expense_categories set fixed_monthly = coalesce(p_fixed, false) where id = c.id;
    perform config_log(p_kos, 'ubah_biaya_tetap', c.name, jsonb_build_object('tetap', c.fixed_monthly), jsonb_build_object('tetap', coalesce(p_fixed, false)), null, 'rendah', null);
  end if;
end $$;
revoke execute on function public.expense_category_fixed_set(uuid, uuid, boolean) from public, anon;
grant execute on function public.expense_category_fixed_set(uuid, uuid, boolean) to authenticated;

select public._prasara_patch('public.budget_report(uuid,date)',
  $x$jsonb_build_object('id', c.id, 'nama', c.name, 'kind', c.kind,$x$,
  $x$jsonb_build_object('id', c.id, 'nama', c.name, 'kind', c.kind, 'tetap', c.fixed_monthly,$x$);

create or replace function public.budget_summary(p_kos uuid, p_month date)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_m date := date_trunc('month', p_month)::date; v_end date; v_today date := (now() at time zone 'Asia/Jakarta')::date;
        v_days int; v_elapsed int; v_fac numeric; v_final boolean; v_p budget_plans; v_rev numeric; v_bud numeric; v_exp numeric; v_out numeric;
        v_rows jsonb; v_proj numeric; v_proj_all numeric; v_nocat numeric;
begin
  if not member_can(p_kos, 'finance') then raise exception 'Tidak punya akses keuangan bisnis ini'; end if;
  perform acct_sync_internal(p_kos);
  v_end := (v_m + interval '1 month - 1 day')::date; v_days := v_end - v_m + 1;
  v_elapsed := greatest(0, least(v_today, v_end) - v_m + 1);
  v_final := v_today >= v_end;
  v_fac := case when v_elapsed = 0 then null when v_final then 1 else v_days::numeric / v_elapsed end;   -- null = bulan belum mulai
  select * into v_p from budget_plans where kos_id = p_kos and month = v_m;
  select coalesce(sum(bruto), 0) into v_rev from pph_gross(p_kos, v_m, v_end);
  with k as (
    select c.id, c.name, c.kind, c.fixed_monthly, b.amount, x.real,
           case when v_fac is null then null when v_final then x.real
                when c.fixed_monthly then greatest(x.real, coalesce(b.amount, 0)) else x.real * v_fac end as proj
    from expense_categories c
    left join budgets b on b.kos_id = p_kos and b.month = v_m and b.category_id = c.id
    cross join lateral (select coalesce(sum(e.amount), 0) as real from expenses e where e.kos_id = p_kos and e.category_id = c.id and e.date between v_m and v_end) x
    where c.kos_id = p_kos)
  select coalesce(jsonb_agg(jsonb_build_object('id', id, 'nama', name, 'kind', kind, 'tetap', fixed_monthly, 'anggaran', amount, 'realisasi', real,
           'proyeksi', round(proj, 2)) order by name), '[]'),
         coalesce(sum(amount), 0), coalesce(sum(real) filter (where amount is not null), 0), coalesce(sum(real) filter (where amount is null), 0),
         sum(proj) filter (where amount is not null), sum(proj)
    into v_rows, v_bud, v_exp, v_out, v_proj, v_proj_all
  from k;
  v_nocat := coalesce((select sum(amount) from expenses where kos_id = p_kos and category_id is null and date between v_m and v_end), 0);
  v_out := v_out + v_nocat;
  return jsonb_build_object(
    'bulan', v_m, 'aktif', plan_has(p_kos, 'anggaran'), 'hari', v_days, 'hari_berjalan', v_elapsed, 'final', v_final,
    'terkunci', exists (select 1 from acct_periods where kos_id = p_kos and month = v_m and closed_at is not null),
    'boleh_putuskan', member_in('team', p_kos),
    'rencana', case when v_p.kos_id is not null then to_jsonb(v_p) end,
    'pendapatan', jsonb_build_object('target', v_p.revenue_target, 'realisasi', round(v_rev, 2), 'proyeksi', case when v_fac is not null then round(v_rev * v_fac, 2) end),
    'biaya', jsonb_build_object('anggaran', v_bud, 'realisasi', round(v_exp, 2), 'proyeksi', case when v_fac is not null then round(coalesce(v_proj, 0), 2) end,
                               'di_luar_anggaran', round(v_out, 2), 'total', round(v_exp + v_out, 2),
                               'total_proyeksi', case when v_fac is not null then round(coalesce(v_proj_all, 0) + v_nocat * v_fac, 2) end,
                               'sumber', 'pengeluaran'),
    'kategori', v_rows);
end $$;
revoke execute on function public.budget_summary(uuid, date) from public, anon;
grant execute on function public.budget_summary(uuid, date) to authenticated;

-- ===================== E · Skenario · titik awal model v2 =====================
-- Retur tersimpan bertanda negatif (credit − debit) → pendapatan = usaha + retur (v1 menulis usaha − retur → retur 20 tanpa penjualan = +20).
-- Versi tersimpan v1 tetap dihitung dengan rumus v1 dari salinannya (lib/scenario.js); baru = v2 (bunga & pinjaman lancar mengikuti sisa pinjaman).
select public._prasara_patch('public.scenario_baseline_core(uuid)', $x$'model', 'v1'$x$, $x$'model', 'v2'$x$);
select public._prasara_patch('public.scenario_baseline_core(uuid)',
  $x$coalesce((v_pl ->> 'pendapatan_usaha')::numeric, 0) - coalesce((v_pl ->> 'retur')::numeric, 0)$x$,
  $x$coalesce((v_pl ->> 'pendapatan_usaha')::numeric, 0) + coalesce((v_pl ->> 'retur')::numeric, 0)$x$);

-- ===================== F · Risiko · PIC harus masih anggota aktif =====================
select public._prasara_patch('public.risk_progress(uuid,uuid,text,text)',
  $x$not (v_mgr or coalesce(o.owner_user = auth.uid(), false))$x$,
  $x$not (v_mgr or (coalesce(o.owner_user = auth.uid(), false)
                   and exists (select 1 from kos_members m where m.kos_id = p_kos and m.user_id = auth.uid() and m.active)))$x$);

-- ===================== G · Valuasi · presisi kelipatan 2 desimal =====================
-- 0,001 lolos "> 0" lalu tersimpan 0,00. Sekarang: maks. 2 angka di belakang koma dan bawah ≥ 0,01 (sama dengan lib/valuation.js).
select public._prasara_patch('public.valuation_clean(jsonb)',
  $x$    if length(trim(coalesce(m ->> 'source', ''))) < 5 then$x$,
  $x$    if (m ->> 'low')::numeric <> round((m ->> 'low')::numeric, 2) or (m ->> 'mid')::numeric <> round((m ->> 'mid')::numeric, 2)
       or (m ->> 'high')::numeric <> round((m ->> 'high')::numeric, 2) or (m ->> 'low')::numeric < 0.01 then
      raise exception 'Kelipatan paling kecil 0,01 dan maks. 2 angka di belakang koma'; end if;
    if length(trim(coalesce(m ->> 'source', ''))) < 5 then$x$);

-- ===================== H · Laporan investor · batas periode satu sumber (400 hari) =====================
-- Draf 500 hari sempat tersimpan lalu pratinjau/final gagal di biz_financials (maks. 400). Berlaku untuk simpan, revisi, dan pembanding.
create or replace function public.investor_reports_period_check()
returns trigger language plpgsql as $$
begin
  if new.period_to - new.period_from > 400 then raise exception 'Periode laporan maksimal sekitar 1 tahun (400 hari)'; end if;
  if (new.cmp_from is null) <> (new.cmp_to is null) or new.cmp_to < new.cmp_from or new.cmp_to - new.cmp_from > 400 then
    raise exception 'Periode pembanding tidak valid (maks. 400 hari)'; end if;
  return new;
end $$;
drop trigger if exists investor_reports_period on public.investor_reports;
create trigger investor_reports_period before insert or update of period_from, period_to, cmp_from, cmp_to on public.investor_reports
  for each row execute function public.investor_reports_period_check();

-- ===================== J · KPI industri =====================
-- Hunian: hari-kamar UNIK (dua sewa di kamar & tanggal yang sama — mis. hari pindah kamar — tidak dihitung dua kali → tidak lewat 100%).
select public._prasara_patch('public.industry_kpi_period(uuid,date,date)',
  $x$'kamar_hari', (select coalesce(sum(least(coalesce(end_date, p_to), p_to) - greatest(start_date, p_from) + 1), 0) from lz),$x$,
  $x$'kamar_hari', (select count(*) from (select distinct lz.room_id, g.d from lz
                     cross join lateral generate_series(greatest(lz.start_date, p_from), least(coalesce(lz.end_date, p_to), p_to), interval '1 day') g(d)) q),$x$);
-- Antar-jemput & pesanan bermeja memakai himpunan yang sama dengan penyebutnya (pesanan selesai tanpa kerja ulang).
select public._prasara_patch('public.industry_kpi_period(uuid,date,date)',
  $x$'antar_jemput', (select count(*) from d where pickup or deliver),$x$,
  $x$'antar_jemput', (select count(*) from d where (pickup or deliver) and rework_of is null),$x$);
select public._prasara_patch('public.industry_kpi_period(uuid,date,date)',
  $x$'meja_pesanan', (select count(*) from d where table_no is not null),$x$,
  $x$'meja_pesanan', (select count(*) from d where table_no is not null and rework_of is null),$x$);

drop function public._prasara_patch(text, text, text);
