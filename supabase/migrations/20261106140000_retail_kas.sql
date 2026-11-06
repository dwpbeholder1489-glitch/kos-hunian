-- PRASARA Langkah 2 bagian 4: Kas & bank, biaya, uang pemilik, pelunasan kasbon pelanggan & utang supplier (Retail).
-- Memakai tabel bersama expenses & cash_entries (ditambah kolom akun kas/bank); bisnis Properti tidak terpengaruh.

alter table public.expenses add column if not exists account text not null default 'kas';
alter table public.cash_entries add column if not exists account text not null default 'kas';
do $$ begin
  alter table public.expenses add constraint expenses_account_check check (account in ('kas', 'bank'));
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.cash_entries add constraint cash_entries_account_check check (account in ('kas', 'bank'));
exception when duplicate_object then null; end $$;
-- Pindah uang antar akun: setor kas ke bank / tarik dari bank ke kas
alter table public.cash_entries drop constraint if exists cash_entries_kind_check;
alter table public.cash_entries add constraint cash_entries_kind_check
  check (kind in ('pendapatan_lain','setoran_modal','prive','pinjaman_masuk','bayar_pinjaman','setor_bank','tarik_bank'));

-- Pelunasan kasbon pelanggan (piutang) dan pembayaran utang ke supplier
create table if not exists public.debt_payments (
  id uuid primary key default gen_random_uuid(),
  kos_id uuid not null references public.kos(id) on delete cascade,
  contact_id uuid not null references public.contacts(id),
  kind text not null check (kind in ('piutang', 'utang')),
  date date not null,
  amount numeric(14,2) not null check (amount > 0),
  account text not null default 'kas' check (account in ('kas', 'bank')),
  note text,
  status text not null default 'selesai' check (status in ('selesai', 'batal')),
  void_reason text,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now()
);
create index if not exists debt_payments_kos on public.debt_payments(kos_id, contact_id);
alter table public.debt_payments enable row level security;
create policy debt_payments_select on public.debt_payments for select using (public.is_member(kos_id));
grant select on public.debt_payments to authenticated;

-- Sisa kasbon / utang per kontak
create or replace function public.contact_balance(p_contact uuid)
returns numeric language sql stable security definer set search_path = public as $$
  select case c.kind
    when 'pelanggan' then coalesce((select sum(total) from sales where contact_id = c.id and pay_method = 'kasbon' and status = 'selesai'), 0)
                        - coalesce((select sum(amount) from debt_payments where contact_id = c.id and kind = 'piutang' and status = 'selesai'), 0)
    else coalesce((select sum(total) from purchases where contact_id = c.id and pay_method = 'utang' and status = 'selesai'), 0)
       - coalesce((select sum(amount) from debt_payments where contact_id = c.id and kind = 'utang' and status = 'selesai'), 0)
  end
  from contacts c where c.id = p_contact;
$$;
revoke execute on function public.contact_balance(uuid) from public, anon, authenticated;

create or replace function public.debt_pay(p_id uuid, p_kos uuid, p_contact uuid, p_amount numeric, p_account text, p_date date, p_note text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare c contacts; v_sisa numeric; v_day date := coalesce(p_date, (now() at time zone 'Asia/Jakarta')::date);
begin
  if not is_member(p_kos) then raise exception 'Tidak punya akses ke bisnis ini'; end if;
  if exists (select 1 from debt_payments where id = p_id) then return jsonb_build_object('id', p_id, 'duplicate', true); end if;
  select * into c from contacts where id = p_contact and kos_id = p_kos for update;
  if c.id is null then raise exception 'Kontak tidak ditemukan'; end if;
  if v_day > (now() at time zone 'Asia/Jakarta')::date then raise exception 'Tanggal tidak boleh di masa depan'; end if;
  v_sisa := contact_balance(c.id);
  if p_amount is null or p_amount <= 0 then raise exception 'Isi jumlah pembayaran'; end if;
  if p_amount > v_sisa + 0.5 then raise exception 'Jumlah melebihi sisa (Rp %)', replace(to_char(round(v_sisa), 'FM999,999,999,999'), ',', '.'); end if;
  insert into debt_payments(id, kos_id, contact_id, kind, date, amount, account, note)
  values (p_id, p_kos, c.id, case when c.kind = 'pelanggan' then 'piutang' else 'utang' end, v_day, p_amount, coalesce(nullif(p_account, ''), 'kas'), nullif(trim(coalesce(p_note, '')), ''));
  return jsonb_build_object('id', p_id, 'sisa', v_sisa - p_amount, 'duplicate', false);
end $$;

create or replace function public.debt_payment_void(p_payment uuid, p_reason text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if coalesce(trim(p_reason), '') = '' then raise exception 'Isi alasan pembatalan'; end if;
  update debt_payments set status = 'batal', void_reason = trim(p_reason)
  where id = p_payment and status = 'selesai' and is_member(kos_id);
  if not found then raise exception 'Pembayaran tidak ditemukan atau sudah dibatalkan'; end if;
end $$;

-- Saldo kas & bank + daftar kasbon dan utang (semua dihitung dari catatan, tidak disimpan terpisah)
create or replace function public.retail_ledger(p_kos uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_kas numeric; v_bank numeric;
begin
  if not is_member(p_kos) then raise exception 'Tidak punya akses ke bisnis ini'; end if;
  with m as (
    select 'kas' as acc, total as amt from sales where kos_id = p_kos and status = 'selesai' and pay_method = 'tunai'
    union all select 'bank', total from sales where kos_id = p_kos and status = 'selesai' and pay_method = 'transfer'
    union all select case when pay_method = 'tunai' then 'kas' else 'bank' end, -total from purchases where kos_id = p_kos and status = 'selesai' and pay_method in ('tunai', 'transfer')
    union all select account, case when kind = 'piutang' then amount else -amount end from debt_payments where kos_id = p_kos and status = 'selesai'
    union all select account, -amount from expenses where kos_id = p_kos
    union all select account, case when kind in ('pendapatan_lain', 'setoran_modal', 'pinjaman_masuk') then amount
                                   when kind in ('prive', 'bayar_pinjaman') then -amount
                                   when kind = 'setor_bank' then -amount      -- keluar dari kas
                                   when kind = 'tarik_bank' then amount       -- masuk ke kas
                                   else 0 end from cash_entries where kos_id = p_kos
    union all select 'bank', amount from cash_entries where kos_id = p_kos and kind = 'setor_bank'
    union all select 'bank', -amount from cash_entries where kos_id = p_kos and kind = 'tarik_bank'
  )
  select coalesce(sum(amt) filter (where acc = 'kas'), 0), coalesce(sum(amt) filter (where acc = 'bank'), 0) into v_kas, v_bank from m;

  return jsonb_build_object('kas', v_kas, 'bank', v_bank,
    'kasbon', (select coalesce(jsonb_agg(row_to_json(x) order by x.sisa desc), '[]'::jsonb) from (
      select c.id, c.name, c.phone, contact_balance(c.id) as sisa,
        (select min(due_date) from sales s where s.contact_id = c.id and s.pay_method = 'kasbon' and s.status = 'selesai' and s.due_date is not null) as due,
        (select min(sale_date) from sales s where s.contact_id = c.id and s.pay_method = 'kasbon' and s.status = 'selesai') as since
      from contacts c where c.kos_id = p_kos and c.kind = 'pelanggan') x where x.sisa > 0.5),
    'utang', (select coalesce(jsonb_agg(row_to_json(x) order by x.sisa desc), '[]'::jsonb) from (
      select c.id, c.name, c.phone, contact_balance(c.id) as sisa,
        (select min(due_date) from purchases b where b.contact_id = c.id and b.pay_method = 'utang' and b.status = 'selesai' and b.due_date is not null) as due,
        (select min(purchase_date) from purchases b where b.contact_id = c.id and b.pay_method = 'utang' and b.status = 'selesai') as since
      from contacts c where c.kos_id = p_kos and c.kind = 'supplier') x where x.sisa > 0.5));
end $$;

revoke execute on function public.debt_pay(uuid, uuid, uuid, numeric, text, date, text), public.debt_payment_void(uuid, text), public.retail_ledger(uuid) from public, anon;
grant execute on function public.debt_pay(uuid, uuid, uuid, numeric, text, date, text), public.debt_payment_void(uuid, text), public.retail_ledger(uuid) to authenticated;
