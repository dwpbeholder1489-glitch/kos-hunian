-- Laporan arus kas (Master Prompt V2 §4.1: "Arus kas" Ringkasan di Dasar, Lengkap di Bisnis/Pro).
-- Kas = akun Kas + Bank (sys_key 'kas','bank'). Disusun dari jurnal (metode langsung):
--   • tiap jurnal: arus kas = jumlah (debit − kredit) baris kas/bank; pindah kas↔bank tidak dihitung,
--   • dikelompokkan menurut AKUN LAWAN di jurnal yang sama (bila lebih dari satu: berurutan pendapatan/beban →
--     ekuitas/kewajiban → lainnya sampai nilai kas habis, agar pasangan HPP↔persediaan tidak ikut menyerap kas):
--       pendanaan = modal, prive, pinjaman (& ekuitas lain); investasi = aset tetap;
--       saldo_awal = ekuitas saldo awal (pencatatan saldo pembuka); operasi = selain itu.
-- Lengkap (fitur `laporan_lanjutan`): per kelompok & per akun lawan. Ringkas: saldo awal, masuk, keluar, saldo akhir.

create or replace function public.acct_cash_class(p_sys text, p_type text)
returns text language sql immutable as $$
  select case
    when p_sys in ('kas', 'bank') then 'internal'
    when p_sys = 'saldo_awal' then 'saldo_awal'
    when p_sys in ('modal', 'prive', 'pinjaman') or p_type = 'ekuitas' then 'pendanaan'
    when p_sys = 'aset_tetap' then 'investasi'
    else 'operasi' end;
$$;

create or replace function public.acct_cashflow(p_kos uuid, p_from date, p_to date)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_open numeric; v_close numeric; v_in numeric; v_out numeric; v_rows jsonb; v_lengkap boolean;
begin
  if not member_in('finance', p_kos) then raise exception 'Tidak punya akses keuangan'; end if;
  if p_from is null or p_to is null or p_to < p_from or p_to - p_from > 400 then raise exception 'Periode tidak valid (maks. sekitar 1 tahun)'; end if;
  perform acct_sync_internal(p_kos);
  v_lengkap := plan_has(p_kos, 'laporan_lanjutan');

  select coalesce(sum(l.debit - l.credit) filter (where e.entry_date < p_from), 0),
         coalesce(sum(l.debit - l.credit) filter (where e.entry_date <= p_to), 0)
    into v_open, v_close
  from acct_lines l join acct_entries e on e.id = l.entry_id join acct_accounts a on a.id = l.account_id
  where l.kos_id = p_kos and a.sys_key in ('kas', 'bank');

  -- Arus kas per jurnal dalam periode, dialokasikan ke akun lawan
  with ent as (
    select e.id, sum(l.debit - l.credit) filter (where a.sys_key in ('kas', 'bank')) as kas
    from acct_entries e join acct_lines l on l.entry_id = e.id join acct_accounts a on a.id = l.account_id
    where e.kos_id = p_kos and e.entry_date between p_from and p_to
    group by e.id
    having coalesce(sum(l.debit - l.credit) filter (where a.sys_key in ('kas', 'bank')), 0) <> 0
  ),
  lawan as (   -- baris non-kas yang berlawanan arah dengan arus kas jurnal itu, diurutkan prioritas
    select ent.id, ent.kas, a.name, a.sys_key, a.type, abs(l.debit - l.credit) as w,
           row_number() over (partition by ent.id order by case when a.type in ('pendapatan', 'beban') then 1
                                                               when a.type in ('ekuitas', 'kewajiban') then 2 else 3 end, l.id) as rn
    from ent join acct_lines l on l.entry_id = ent.id join acct_accounts a on a.id = l.account_id
    where coalesce(a.sys_key, '') not in ('kas', 'bank') and sign(l.debit - l.credit) = -sign(ent.kas)
  ),
  -- Alokasi berurutan sampai nilai kas habis (pasangan non-kas seperti HPP ↔ persediaan tidak ikut menyerap kas)
  bagi as (
    select id, kas, name, sys_key, type,
           sign(kas) * greatest(0, least(w, abs(kas) - coalesce(sum(w) over (partition by id order by rn rows between unbounded preceding and 1 preceding), 0))) as nilai
    from lawan
  ),
  alok as (
    select acct_cash_class(sys_key, type) as kelompok, name as akun, nilai from bagi where nilai <> 0
    union all   -- sisa yang tidak punya akun lawan (seharusnya tidak ada; tetap dicatat agar total cocok)
    select 'operasi', 'Lain-lain', ent.kas - coalesce((select sum(nilai) from bagi where bagi.id = ent.id), 0)
    from ent where ent.kas - coalesce((select sum(nilai) from bagi where bagi.id = ent.id), 0) <> 0
  )
  select coalesce(sum(nilai) filter (where nilai > 0), 0), coalesce(-sum(nilai) filter (where nilai < 0), 0),
         (select coalesce(jsonb_agg(jsonb_build_object('kelompok', k, 'masuk', round(m, 2), 'keluar', round(o, 2), 'bersih', round(m - o, 2), 'akun', ak)
                   order by array_position(array['operasi', 'investasi', 'pendanaan', 'saldo_awal'], k)), '[]'::jsonb)
          from (select kelompok k, coalesce(sum(nilai) filter (where nilai > 0), 0) m, coalesce(-sum(nilai) filter (where nilai < 0), 0) o,
                       (select jsonb_agg(jsonb_build_object('akun', akun, 'bersih', round(b, 2)) order by abs(b) desc)
                        from (select akun, sum(nilai) b from alok a2 where a2.kelompok = a1.kelompok group by akun) z) ak
                from alok a1 group by kelompok) g)
    into v_in, v_out, v_rows
  from alok;

  return jsonb_build_object(
    'from', p_from, 'to', p_to, 'lengkap', v_lengkap,
    'saldo_awal', round(v_open, 2), 'masuk', round(v_in, 2), 'keluar', round(v_out, 2), 'saldo_akhir', round(v_close, 2),
    'cocok', round(v_open + v_in - v_out, 2) = round(v_close, 2),
    'kelompok', case when v_lengkap then v_rows end);
end $$;

-- Penawaran memakai event laporan lanjutan yang sudah ada (REPORT.ADVANCED_REQUESTED)
revoke execute on function public.acct_cash_class(text, text) from public, anon;
revoke execute on function public.acct_cashflow(uuid, date, date) from public, anon;
grant execute on function public.acct_cashflow(uuid, date, date) to authenticated;
