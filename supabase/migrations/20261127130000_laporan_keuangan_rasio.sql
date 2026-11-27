-- Laporan keuangan bertingkat & dasar rasio keuangan (Master Blueprint BI V2.0 §7.1, §7.2, §32.4) — tanpa tabel baru.
-- SATU sumber: saldo & mutasi akun di jurnal (acct_lines), sama dengan Pembukuan dan biz_intel.
-- Laba rugi: pendapatan usaha − retur = pendapatan bersih; − HPP (sys_key hpp) = laba kotor; − beban operasional
--   (semua beban selain HPP, penyusutan, beban non-operasional) = EBITDA; − penyusutan = EBIT;
--   + pendapatan lain − beban non-operasional = laba sebelum pajak. Laba bersih = laba sebelum pajak karena
--   pajak penghasilan & beban bunga BELUM punya akun sendiri (dicatat sebagai gap, ditampilkan apa adanya).
--   Laba bersih = Σ pendapatan − Σ beban = sama dengan biz_figures / Laba Rugi Pembukuan.
-- Neraca per tanggal: kas & bank, piutang, persediaan, aset lancar lain, aset tetap bersih; kewajiban lancar
--   (semua kewajiban selain pinjaman), pinjaman; ekuitas = akun ekuitas + laba ditahan (akumulasi laba rugi).
-- Gate paket sama dengan Laporan lanjutan (Neraca per akun): tanpa `laporan_lanjutan` hanya laba rugi.

create or replace function public.biz_fin_class(p_type text, p_sys text)
returns text language sql immutable as $$
  select case
    when p_type = 'pendapatan' and p_sys = 'retur_penjualan' then 'retur'
    when p_type = 'pendapatan' and p_sys = 'pendapatan_lain' then 'pendapatan_lain'
    when p_type = 'pendapatan' then 'pendapatan_usaha'
    when p_type = 'beban' and p_sys = 'hpp' then 'hpp'
    when p_type = 'beban' and p_sys = 'beban_penyusutan' then 'penyusutan'
    when p_type = 'beban' and p_sys = 'beban_lain' then 'beban_lain'
    when p_type = 'beban' then 'beban_operasional'
    when p_type = 'aset' and p_sys in ('kas', 'bank') then 'kas'
    when p_type = 'aset' and p_sys like 'piutang%' then 'piutang'
    when p_type = 'aset' and p_sys = 'persediaan' then 'persediaan'
    when p_type = 'aset' and p_sys in ('aset_tetap', 'akum_penyusutan') then 'aset_tetap'
    when p_type = 'aset' then 'aset_lancar_lain'
    when p_type = 'kewajiban' and p_sys = 'pinjaman' then 'pinjaman'
    when p_type = 'kewajiban' and p_sys = 'utang' then 'utang_usaha'
    when p_type = 'kewajiban' then 'kewajiban_lain'
    when p_type = 'ekuitas' then 'ekuitas'
  end;
$$;

create or replace function public.biz_financials(p_kos uuid, p_from date, p_to date, p_cmp_from date default null, p_cmp_to date default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_full boolean; v_res jsonb; v_m1 date;
begin
  if not member_in('finance', p_kos) then raise exception 'Tidak punya akses keuangan'; end if;
  if p_from is null or p_to is null or p_to < p_from or p_to - p_from > 400 then raise exception 'Periode tidak valid (maks. sekitar 1 tahun)'; end if;
  if (p_cmp_from is null) <> (p_cmp_to is null) or p_cmp_to < p_cmp_from then raise exception 'Periode pembanding tidak valid'; end if;
  perform acct_sync_internal(p_kos);
  v_full := plan_has(p_kos, 'laporan_lanjutan');
  v_m1 := date_trunc('month', p_to)::date;

  with acc as (
    select a.id, a.code, a.name, a.type, a.sys_key, biz_fin_class(a.type, a.sys_key) as cls,
           coalesce(sum(l.debit - l.credit) filter (where e.entry_date between p_from and p_to), 0) as cur,
           coalesce(sum(l.debit - l.credit) filter (where p_cmp_from is not null and e.entry_date between p_cmp_from and p_cmp_to), 0) as cmp,
           coalesce(sum(l.debit - l.credit) filter (where e.entry_date < p_from), 0) as bal_open,
           coalesce(sum(l.debit - l.credit) filter (where e.entry_date <= p_to), 0) as bal_close
    from acct_accounts a
    left join acct_lines l on l.account_id = a.id
    left join acct_entries e on e.id = l.entry_id
    where a.kos_id = p_kos
    group by a.id)
  select jsonb_build_object(
    'from', p_from, 'to', p_to, 'cmp_from', p_cmp_from, 'cmp_to', p_cmp_to, 'lengkap', v_full, 'hari', p_to - p_from + 1,
    'cmp_hari', case when p_cmp_from is not null then p_cmp_to - p_cmp_from + 1 end,
    -- Laba rugi: nilai positif = menambah laba untuk pendapatan, nilai positif = beban untuk beban
    'laba_rugi', jsonb_build_object(
      'cur', (select jsonb_object_agg(k, round(v, 2)) from (
                select cls k, sum(case when type = 'pendapatan' then -cur else cur end) v from acc where type in ('pendapatan', 'beban') group by cls) z),
      'cmp', case when p_cmp_from is not null then (select jsonb_object_agg(k, round(v, 2)) from (
                select cls k, sum(case when type = 'pendapatan' then -cmp else cmp end) v from acc where type in ('pendapatan', 'beban') group by cls) z) end,
      'akun', (select coalesce(jsonb_agg(jsonb_build_object('id', id, 'code', code, 'name', name, 'cls', cls,
                 'cur', round(case when type = 'pendapatan' then -cur else cur end, 2), 'cmp', round(case when type = 'pendapatan' then -cmp else cmp end, 2)) order by code), '[]')
               from acc where type in ('pendapatan', 'beban') and (cur <> 0 or cmp <> 0))),
    -- Neraca (aset = saldo debit; kewajiban & ekuitas = saldo kredit) — hanya dengan laporan_lanjutan
    'neraca', case when v_full then jsonb_build_object(
      'close', (select jsonb_object_agg(k, round(v, 2)) from (
                  select cls k, sum(case when type = 'aset' then bal_close else -bal_close end) v from acc where type in ('aset', 'kewajiban', 'ekuitas') group by cls
                  union all select 'laba_ditahan', -sum(bal_close) from acc where type in ('pendapatan', 'beban')) z),
      'open', (select jsonb_object_agg(k, round(v, 2)) from (
                  select cls k, sum(case when type = 'aset' then bal_open else -bal_open end) v from acc where type in ('aset', 'kewajiban', 'ekuitas') group by cls
                  union all select 'laba_ditahan', -sum(bal_open) from acc where type in ('pendapatan', 'beban')) z),
      'akun', (select coalesce(jsonb_agg(jsonb_build_object('id', id, 'code', code, 'name', name, 'cls', cls, 'type', type,
                 'close', round(case when type = 'aset' then bal_close else -bal_close end, 2),
                 'open', round(case when type = 'aset' then bal_open else -bal_open end, 2)) order by code), '[]')
               from acc where type in ('aset', 'kewajiban', 'ekuitas') and (bal_close <> 0 or bal_open <> 0)),
      'seimbang', (select abs(sum(bal_close)) < 1 from acc)) end
  ) into v_res;

  -- Riwayat bulanan 12 bulan s.d. bulan akhir periode (EBITDA/EBIT/laba per bulan)
  if v_full then
    v_res := v_res || jsonb_build_object('bulanan', (
      select coalesce(jsonb_agg(jsonb_build_object('mulai', m.b::date, 'v', coalesce(x.v, '{}'::jsonb)) order by m.b), '[]')
      from generate_series((v_m1 - interval '11 month')::date, v_m1, interval '1 month') m(b)
      left join lateral (
        select jsonb_object_agg(cls, round(v, 2)) as v from (
          select biz_fin_class(a.type, a.sys_key) as cls, sum(case when a.type = 'pendapatan' then l.credit - l.debit else l.debit - l.credit end) as v
          from acct_lines l join acct_entries e on e.id = l.entry_id join acct_accounts a on a.id = l.account_id
          where l.kos_id = p_kos and a.type in ('pendapatan', 'beban')
            and e.entry_date between m.b::date and (m.b + interval '1 month - 1 day')::date
          group by 1) z) x on true));
  end if;
  return v_res;
end $$;
revoke execute on function public.biz_fin_class(text, text) from public, anon, authenticated;
revoke execute on function public.biz_financials(uuid, date, date, date, date) from public, anon;
grant execute on function public.biz_financials(uuid, date, date, date, date) to authenticated;
