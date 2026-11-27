-- Tahap A Master Blueprint BI V2.0: pinjaman & beban bunga lewat menu Kas (keputusan pemilik 27 Nov 2026).
-- • Daftar pinjaman `loans` (pemberi, pokok, bunga %/tahun, tenor, cicilan, jatuh tempo) — informasi rencana, BUKAN jurnal.
-- • Uang tetap lewat `cash_entries` (mesin lama): pinjaman_masuk / bayar_pinjaman + kolom baru `loan_id` & `interest`.
--   Bayar pinjaman = pokok (mengurangi akun Pinjaman) + bunga (akun baru Beban bunga 6-3000), kas keluar = jumlah total.
--   Catatan lama tanpa bunga tidak berubah jurnalnya (baris bernilai 0 tidak dibuat).
-- • Sisa pokok per pinjaman = Σ diterima − Σ pokok dibayar (dari cash_entries) — satu sumber dengan akun Pinjaman di jurnal.
-- • Porsi lancar (jatuh tempo ≤ 12 bulan) per tanggal: `loan_current_portion` untuk neraca & rasio.

create or replace function public._prasara_patch(p_sig text, p_old text, p_new text)
returns void language plpgsql as $$
declare d text;
begin
  d := pg_get_functiondef(p_sig::regprocedure);
  if position(p_old in d) = 0 then raise exception 'patch %: potongan tidak ditemukan', p_sig; end if;
  execute replace(d, p_old, p_new);
end $$;

-- ---------- Akun beban bunga ----------
select public._prasara_patch('public.acct_ensure(uuid)',
  $x$('6-2000', 'Beban penyusutan', 'beban', 'beban_penyusutan')$x$,
  $x$('6-2000', 'Beban penyusutan', 'beban', 'beban_penyusutan'),
    ('6-3000', 'Beban bunga pinjaman', 'beban', 'beban_bunga')$x$);
select public.acct_ensure(id) from public.kos;

-- ---------- Daftar pinjaman ----------
create table public.loans (
  id uuid primary key default gen_random_uuid(),
  kos_id uuid not null references public.kos(id) on delete cascade,
  lender text not null check (length(trim(lender)) between 2 and 120),
  principal numeric(14,2) not null check (principal > 0),
  rate_year numeric(6,3) check (rate_year is null or (rate_year >= 0 and rate_year <= 100)),
  start_date date not null,
  term_months int check (term_months is null or term_months between 1 and 600),
  installment numeric(14,2) check (installment is null or installment > 0),
  due_date date,
  note text check (note is null or length(note) <= 500),
  status text not null default 'aktif' check (status in ('aktif', 'lunas', 'batal')),
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (due_date is null or due_date >= start_date)
);
create index loans_kos on public.loans(kos_id, status);
alter table public.loans enable row level security;
create policy loans_read on public.loans for select using (member_can(kos_id, 'finance'));
revoke insert, update, delete on public.loans from anon, authenticated;
create trigger zz_kos_open_guard before insert or update or delete on public.loans for each row execute function public.kos_open_guard();

alter table public.cash_entries
  add column loan_id uuid references public.loans(id) on delete restrict,
  add column interest numeric(14,2) not null default 0,
  add constraint cash_entries_interest_ok check (interest >= 0 and interest <= amount and (interest = 0 or kind = 'bayar_pinjaman')),
  add constraint cash_entries_loan_kind check (loan_id is null or kind in ('pinjaman_masuk', 'bayar_pinjaman'));
create index cash_entries_loan on public.cash_entries(loan_id) where loan_id is not null;

-- Pinjaman satu bisnis dengan catatan kasnya
create or replace function public.cash_entries_loan_check() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.loan_id is not null and not exists (select 1 from loans where id = new.loan_id and kos_id = new.kos_id) then
    raise exception 'Pinjaman tidak ditemukan di bisnis ini';
  end if;
  return new;
end $$;
create trigger cash_entries_loan_check before insert or update of loan_id, kos_id on public.cash_entries for each row execute function public.cash_entries_loan_check();

-- ---------- Jurnal: bayar pinjaman = pokok + bunga ----------
select public._prasara_patch('public.acct_desired(uuid)',
  $x$(case c.kind when 'prive' then 'prive' when 'bayar_pinjaman' then 'pinjaman' when 'setor_bank' then 'bank' when 'tarik_bank' then 'kas' else c.account end, c.amount),$x$,
  $x$(case c.kind when 'prive' then 'prive' when 'bayar_pinjaman' then 'pinjaman' when 'setor_bank' then 'bank' when 'tarik_bank' then 'kas' else c.account end, c.amount - c.interest),
      ('beban_bunga', c.interest),$x$);
select public._prasara_patch('public.acct_desired(uuid)',
  $x$when 'tarik_bank' then 'bank' else c.account end, -c.amount)) x(k, v)
    where c.kos_id = p_kos$x$,
  $x$when 'tarik_bank' then 'bank' else c.account end, -c.amount)) x(k, v)
    where c.kos_id = p_kos and x.v <> 0$x$);

-- ---------- Sisa pokok & porsi lancar ----------
-- Sisa pokok per pinjaman per tanggal (dari cash_entries tertaut)
create or replace function public.loan_balance(p_loan uuid, p_asof date)
returns numeric language sql stable security definer set search_path = public as $$
  select coalesce(sum(case kind when 'pinjaman_masuk' then amount else -(amount - interest) end), 0)
  from cash_entries where loan_id = p_loan and date <= p_asof;
$$;

-- Pokok yang jatuh tempo dalam 12 bulan setelah p_asof (porsi lancar), per pinjaman aktif:
--   jatuh tempo akhir ≤ 12 bulan → seluruh sisa; ada cicilan & bunga → pokok dari jadwal anuitas 12 cicilan berikutnya;
--   ada cicilan tanpa bunga → min(sisa, 12 × cicilan); selain itu → tidak terjadwal (dilaporkan terpisah, tidak ditebak).
create or replace function public.loan_current_portion(p_kos uuid, p_asof date)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare r record; v_bal numeric; v_cur numeric := 0; v_unsched numeric := 0; v_total numeric := 0; v_r numeric; v_p numeric; i int;
begin
  for r in select * from loans where kos_id = p_kos and status <> 'batal' and start_date <= p_asof loop
    v_bal := loan_balance(r.id, p_asof);
    if v_bal <= 0 then continue; end if;
    v_total := v_total + v_bal;
    if r.due_date is not null and r.due_date <= p_asof + 365 then v_cur := v_cur + v_bal;
    elsif r.installment is not null and coalesce(r.rate_year, 0) > 0 then
      v_r := r.rate_year / 1200; v_p := 0;
      for i in 1..12 loop
        exit when v_bal - v_p <= 0;
        v_p := v_p + least(v_bal - v_p, greatest(r.installment - (v_bal - v_p) * v_r, 0));
      end loop;
      v_cur := v_cur + v_p;
    elsif r.installment is not null then v_cur := v_cur + least(v_bal, r.installment * 12);
    else v_unsched := v_unsched + v_bal;
    end if;
  end loop;
  return jsonb_build_object('lancar', round(v_cur, 2), 'tidak_terjadwal', round(v_unsched, 2), 'terdaftar', round(v_total, 2));
end $$;

-- Status lunas/aktif selalu mengikuti catatan uang (juga saat catatan dihapus/diubah dari riwayat Kas)
create or replace function public.cash_entries_loan_status() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if (tg_op <> 'DELETE' and new.loan_id is null) and (tg_op = 'INSERT' or old.loan_id is null) then return null; end if;
  if tg_op = 'DELETE' and old.loan_id is null then return null; end if;
  update loans l set status = case when exists (select 1 from cash_entries c where c.loan_id = l.id) and loan_balance(l.id, '9999-12-31') <= 0.5 then 'lunas' else 'aktif' end,
                     updated_at = now()
  where l.status <> 'batal' and l.id in (case when tg_op <> 'DELETE' then new.loan_id end, case when tg_op <> 'INSERT' then old.loan_id end);
  return null;
end $$;
create trigger cash_entries_loan_status after insert or update or delete on public.cash_entries
  for each row execute function public.cash_entries_loan_status();

-- ---------- RPC pengelola (area finance) ----------
create or replace function public.loan_save(p_id uuid, p_kos uuid, p_data jsonb)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid := coalesce(p_id, gen_random_uuid());
begin
  if not member_in('finance', p_kos) then raise exception 'Tidak punya akses keuangan'; end if;
  if exists (select 1 from loans where id = v_id and kos_id <> p_kos) then raise exception 'Pinjaman tidak ditemukan'; end if;
  insert into loans(id, kos_id, lender, principal, rate_year, start_date, term_months, installment, due_date, note)
  values (v_id, p_kos, trim(p_data->>'lender'), (p_data->>'principal')::numeric, nullif(p_data->>'rate_year', '')::numeric,
          (p_data->>'start_date')::date, nullif(p_data->>'term_months', '')::int, nullif(p_data->>'installment', '')::numeric,
          nullif(p_data->>'due_date', '')::date, nullif(trim(coalesce(p_data->>'note', '')), ''))
  on conflict (id) do update set lender = excluded.lender, principal = excluded.principal, rate_year = excluded.rate_year,
    start_date = excluded.start_date, term_months = excluded.term_months, installment = excluded.installment,
    due_date = excluded.due_date, note = excluded.note, updated_at = now();
  return v_id;
end $$;

-- Pinjaman diterima (kas/bank masuk, utang bertambah) atau dibayar (pokok + bunga)
create or replace function public.loan_move(p_id uuid, p_kos uuid, p_loan uuid, p_kind text, p_amount numeric, p_interest numeric,
                                            p_date date, p_account text, p_note text)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_loan loans; v_bal numeric; v_int numeric := coalesce(p_interest, 0);
begin
  if not member_in('finance', p_kos) then raise exception 'Tidak punya akses keuangan'; end if;
  if exists (select 1 from cash_entries where id = p_id) then return p_id; end if;   -- idempoten (ketuk dua kali)
  select * into v_loan from loans where id = p_loan and kos_id = p_kos for update;
  if v_loan.id is null then raise exception 'Pinjaman tidak ditemukan'; end if;
  if v_loan.status = 'batal' then raise exception 'Pinjaman sudah dibatalkan'; end if;
  if p_kind not in ('pinjaman_masuk', 'bayar_pinjaman') then raise exception 'Jenis tidak valid'; end if;
  if p_account not in ('kas', 'bank') then raise exception 'Pilih kas atau bank'; end if;
  if coalesce(p_amount, 0) <= 0 then raise exception 'Isi jumlahnya'; end if;
  if p_date is null or p_date > (now() at time zone 'Asia/Jakarta')::date then raise exception 'Tanggal tidak boleh di masa depan'; end if;
  if v_int < 0 or v_int > p_amount then raise exception 'Bunga harus antara 0 dan jumlah yang dibayar'; end if;
  if p_kind = 'pinjaman_masuk' and v_int > 0 then raise exception 'Bunga hanya untuk pembayaran'; end if;
  if p_kind = 'bayar_pinjaman' then
    v_bal := loan_balance(p_loan, '9999-12-31');
    if p_amount - v_int > v_bal + 0.5 then
      raise exception 'Pokok yang dibayar (%) melebihi sisa pinjaman (%). Bagian lebihnya isi sebagai bunga/denda bila memang begitu.',
        to_char(p_amount - v_int, 'FM999G999G999G999'), to_char(v_bal, 'FM999G999G999G999');
    end if;
  end if;
  insert into cash_entries(id, kos_id, kind, date, amount, interest, account, description, loan_id)
  values (p_id, p_kos, p_kind, p_date, p_amount, v_int, p_account,
          coalesce(nullif(trim(coalesce(p_note, '')), ''), v_loan.lender), p_loan);
  update loans set status = case when p_kind = 'bayar_pinjaman' and loan_balance(p_loan, '9999-12-31') <= 0.5 then 'lunas' else 'aktif' end,
                   updated_at = now() where id = p_loan;
  return p_id;
end $$;

-- Tautkan catatan lama (tanpa daftar) ke pinjaman; boleh juga melepas (p_loan null)
create or replace function public.loan_link(p_kos uuid, p_entry uuid, p_loan uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not member_in('finance', p_kos) then raise exception 'Tidak punya akses keuangan'; end if;
  update cash_entries set loan_id = p_loan where id = p_entry and kos_id = p_kos and kind in ('pinjaman_masuk', 'bayar_pinjaman');
  if not found then raise exception 'Catatan pinjaman tidak ditemukan'; end if;
  update loans l set status = case when loan_balance(l.id, '9999-12-31') <= 0.5 and exists (select 1 from cash_entries c where c.loan_id = l.id) then 'lunas' else 'aktif' end
  where l.kos_id = p_kos and l.status <> 'batal';
end $$;

create or replace function public.loan_cancel(p_kos uuid, p_loan uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not member_in('finance', p_kos) then raise exception 'Tidak punya akses keuangan'; end if;
  if exists (select 1 from cash_entries where loan_id = p_loan) then
    raise exception 'Pinjaman sudah punya catatan uang. Hapus atau lepaskan catatannya dulu di riwayat.'; end if;
  update loans set status = 'batal', updated_at = now() where id = p_loan and kos_id = p_kos;
end $$;

-- Ringkasan untuk menu Kas & Analisis: daftar pinjaman + riwayat + catatan pinjaman yang belum tertaut
create or replace function public.loan_overview(p_kos uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_today date := (now() at time zone 'Asia/Jakarta')::date;
begin
  if not member_in('finance', p_kos) then raise exception 'Tidak punya akses keuangan'; end if;
  perform acct_sync_internal(p_kos);
  return jsonb_build_object(
    'hari_ini', v_today,
    'loans', (select coalesce(jsonb_agg(jsonb_build_object('id', l.id, 'lender', l.lender, 'principal', l.principal, 'rate_year', l.rate_year,
        'start_date', l.start_date, 'term_months', l.term_months, 'installment', l.installment, 'due_date', l.due_date, 'note', l.note, 'status', l.status,
        'received', (select coalesce(sum(amount), 0) from cash_entries where loan_id = l.id and kind = 'pinjaman_masuk'),
        'paid_principal', (select coalesce(sum(amount - interest), 0) from cash_entries where loan_id = l.id and kind = 'bayar_pinjaman'),
        'paid_interest', (select coalesce(sum(interest), 0) from cash_entries where loan_id = l.id and kind = 'bayar_pinjaman'),
        'balance', loan_balance(l.id, '9999-12-31'),
        'last_payment', (select max(date) from cash_entries where loan_id = l.id and kind = 'bayar_pinjaman'),
        'history', (select coalesce(jsonb_agg(jsonb_build_object('id', c.id, 'kind', c.kind, 'date', c.date, 'amount', c.amount, 'interest', c.interest,
                      'account', c.account, 'description', c.description) order by c.date desc, c.created_at desc), '[]') from cash_entries c where c.loan_id = l.id))
        order by l.status = 'batal', l.status = 'lunas', l.start_date desc), '[]') from loans l where l.kos_id = p_kos),
    'unlinked', (select coalesce(jsonb_agg(jsonb_build_object('id', c.id, 'kind', c.kind, 'date', c.date, 'amount', c.amount, 'description', c.description) order by c.date desc), '[]')
                 from cash_entries c where c.kos_id = p_kos and c.loan_id is null and c.kind in ('pinjaman_masuk', 'bayar_pinjaman')),
    'akun_pinjaman', (select round(coalesce(-sum(l.debit - l.credit), 0), 2) from acct_lines l join acct_accounts a on a.id = l.account_id
                      where l.kos_id = p_kos and a.sys_key = 'pinjaman'),
    'porsi', loan_current_portion(p_kos, v_today));
end $$;

-- ---------- Laporan keuangan: bunga di bawah EBIT, pinjaman lancar di neraca ----------
create or replace function public.biz_fin_class(p_type text, p_sys text)
returns text language sql immutable as $$
  select case
    when p_type = 'pendapatan' and p_sys = 'retur_penjualan' then 'retur'
    when p_type = 'pendapatan' and p_sys = 'pendapatan_lain' then 'pendapatan_lain'
    when p_type = 'pendapatan' then 'pendapatan_usaha'
    when p_type = 'beban' and p_sys = 'hpp' then 'hpp'
    when p_type = 'beban' and p_sys = 'beban_penyusutan' then 'penyusutan'
    when p_type = 'beban' and p_sys = 'beban_bunga' then 'bunga'
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

select public._prasara_patch('public.biz_financials(uuid,date,date,date,date)',
  $x$'seimbang', (select abs(sum(bal_close)) < 1 from acc)) end$x$,
  $x$'seimbang', (select abs(sum(bal_close)) < 1 from acc),
      'pinjaman_close', loan_current_portion(p_kos, p_to), 'pinjaman_open', loan_current_portion(p_kos, p_from - 1)) end$x$);

drop function public._prasara_patch(text, text, text);

revoke execute on function public.loan_balance(uuid, date), public.loan_current_portion(uuid, date), public.cash_entries_loan_check(), public.cash_entries_loan_status() from public, anon, authenticated;
revoke execute on function public.loan_save(uuid, uuid, jsonb), public.loan_move(uuid, uuid, uuid, text, numeric, numeric, date, text, text),
  public.loan_link(uuid, uuid, uuid), public.loan_cancel(uuid, uuid), public.loan_overview(uuid) from public, anon;
grant execute on function public.loan_save(uuid, uuid, jsonb), public.loan_move(uuid, uuid, uuid, text, numeric, numeric, date, text, text),
  public.loan_link(uuid, uuid, uuid), public.loan_cancel(uuid, uuid), public.loan_overview(uuid) to authenticated;
grant select on public.loans to authenticated;
