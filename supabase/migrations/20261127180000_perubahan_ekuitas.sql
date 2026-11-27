-- Tahap C Master Blueprint BI V2.0: laporan perubahan ekuitas (ROIC & cakupan bunga sudah aktif sejak Tahap A/B).
-- Tanpa tabel baru. biz_financials (hanya dengan laporan_lanjutan, sama dengan neraca) kini mengirim `neraca.ekuitas_mutasi`:
-- per akun ekuitas (modal, prive, ekuitas saldo awal, akun ekuitas buatan sendiri) saldo awal periode, penambahan (kredit),
-- pengurangan (debit), saldo akhir — dari jurnal yang sama. Laba ditahan = akumulasi laba rugi (open/close sudah ada);
-- mutasinya = laba bersih periode. Disusun di lib/finRatios.js (equityChanges) dan diuji: total akhir = total ekuitas neraca.

create or replace function public._prasara_patch(p_sig text, p_old text, p_new text)
returns void language plpgsql as $$
declare d text;
begin
  d := pg_get_functiondef(p_sig::regprocedure);
  if position(p_old in d) = 0 then raise exception 'patch %: potongan tidak ditemukan', p_sig; end if;
  execute replace(d, p_old, p_new);
end $$;

select public._prasara_patch('public.biz_financials(uuid,date,date,date,date)',
  $x$'pinjaman_close', loan_current_portion(p_kos, p_to), 'pinjaman_open', loan_current_portion(p_kos, p_from - 1)) end$x$,
  $x$'pinjaman_close', loan_current_portion(p_kos, p_to), 'pinjaman_open', loan_current_portion(p_kos, p_from - 1),
      'ekuitas_mutasi', (select coalesce(jsonb_agg(jsonb_build_object('id', q.id, 'code', q.code, 'name', q.name, 'sys_key', q.sys_key,
                           'open', round(q.op, 2), 'tambah', round(q.cr, 2), 'kurang', round(q.dr, 2), 'close', round(q.op + q.cr - q.dr, 2)) order by q.code), '[]')
        from (select a.id, a.code, a.name, a.sys_key,
                     coalesce(sum(l.credit - l.debit) filter (where e.entry_date < p_from), 0) as op,
                     coalesce(sum(l.credit) filter (where e.entry_date between p_from and p_to), 0) as cr,
                     coalesce(sum(l.debit) filter (where e.entry_date between p_from and p_to), 0) as dr
              from acct_accounts a left join acct_lines l on l.account_id = a.id left join acct_entries e on e.id = l.entry_id and e.entry_date <= p_to
              where a.kos_id = p_kos and a.type = 'ekuitas'
              group by a.id) q
        where q.op <> 0 or q.cr <> 0 or q.dr <> 0)) end$x$);

drop function public._prasara_patch(text, text, text);
