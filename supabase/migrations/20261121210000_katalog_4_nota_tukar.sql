-- Tahap 3 Retail · Katalog lanjutan (4): NOTA KREDIT (saldo belanja pelanggan) & TUKAR BARANG.
-- Retur bisa dikembalikan sebagai nota kredit (refund_method 'nota') → kewajiban "Nota kredit pelanggan" (2-1700).
-- Nota dipakai membayar di Kasir (cara bayar 'nota', boleh campuran) → kolom HASIL sales.amt_nota; jurnal Nota kredit ↔ Penjualan.
-- Sisa nota yang hangus (atas keputusan pemilik) → Pendapatan lain. Tukar barang = retur + penjualan baru dalam SATU transaksi
-- (sale_exchange); selisih dibayar/dikembalikan lewat cara bayar biasa sehingga laci & kas tetap benar tanpa rumus baru.

create or replace function public._prasara_patch(p_sig text, p_old text, p_new text)
returns void language plpgsql as $$
declare v_def text;
begin
  v_def := pg_get_functiondef(p_sig::regprocedure);
  if position(p_old in v_def) = 0 then raise exception 'Patch % tidak menemukan teks: %', p_sig, left(p_old, 80); end if;
  execute replace(v_def, p_old, p_new);
end $$;

-- ---------- kolom & batasan ----------
alter table public.sales drop constraint if exists sales_pay_method_check;
alter table public.sales add constraint sales_pay_method_check check (pay_method in ('tunai', 'transfer', 'kasbon', 'campuran', 'nota'));
alter table public.sales drop constraint if exists sales_split_ok;
alter table public.sales add constraint sales_split_ok check (pay_method <> 'campuran' or total = 0 or
  (coalesce((pay_split->>'tunai')::numeric, 0) + coalesce((pay_split->>'transfer')::numeric, 0) + coalesce((pay_split->>'kasbon')::numeric, 0) + coalesce((pay_split->>'nota')::numeric, 0)) = total);
alter table public.sales add column if not exists amt_nota numeric(14,2) generated always as (
  case pay_method when 'nota' then total when 'campuran' then coalesce((pay_split->>'nota')::numeric, 0) else 0 end) stored;
alter table public.sales add column if not exists exchange_return_id uuid references public.sale_returns(id) on delete set null;

alter table public.sale_returns drop constraint if exists sale_returns_refund_method_check;
alter table public.sale_returns add constraint sale_returns_refund_method_check check (refund_method in ('tunai', 'transfer', 'kasbon', 'nota'));
alter table public.sale_returns add column if not exists exchange_sale_id uuid references public.sales(id) on delete set null;

create table if not exists public.credit_notes (
  id uuid primary key default gen_random_uuid(),
  kos_id uuid not null references public.kos(id) on delete cascade,
  number text not null,
  contact_id uuid references public.contacts(id) on delete set null,
  return_id uuid unique references public.sale_returns(id) on delete restrict,
  amount numeric(14,2) not null check (amount > 0),
  issued_date date not null default (now() at time zone 'Asia/Jakarta')::date,
  valid_until date,
  status text not null default 'aktif' check (status in ('aktif', 'hangus')),
  forfeit_amount numeric(14,2) not null default 0 check (forfeit_amount >= 0),
  forfeit_date date,
  forfeit_reason text,
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid(),
  unique (kos_id, number)
);
alter table public.credit_notes enable row level security;
drop policy if exists credit_notes_select on public.credit_notes;
create policy credit_notes_select on public.credit_notes for select using (member_can(kos_id, 'sell,finance'));
drop trigger if exists zz_kos_open_guard on public.credit_notes;
create trigger zz_kos_open_guard before insert or update or delete on public.credit_notes for each row execute function public.kos_open_guard();

create table if not exists public.credit_note_uses (
  id uuid primary key default gen_random_uuid(),
  kos_id uuid not null references public.kos(id) on delete cascade,
  note_id uuid not null references public.credit_notes(id) on delete restrict,
  sale_id uuid not null references public.sales(id) on delete cascade,
  amount numeric(14,2) not null check (amount > 0),
  created_at timestamptz not null default now()
);
create index if not exists credit_note_uses_note on public.credit_note_uses(note_id);
create index if not exists credit_note_uses_sale on public.credit_note_uses(sale_id);
alter table public.credit_note_uses enable row level security;
drop policy if exists credit_note_uses_select on public.credit_note_uses;
create policy credit_note_uses_select on public.credit_note_uses for select using (member_can(kos_id, 'sell,finance'));
drop trigger if exists zz_kos_open_guard on public.credit_note_uses;
create trigger zz_kos_open_guard before insert or update or delete on public.credit_note_uses for each row execute function public.kos_open_guard();

-- Sisa nota = nilai − dipakai di penjualan yang tidak dibatalkan − yang dihanguskan
create or replace function public.credit_note_balance(p_note uuid) returns numeric language sql stable security definer set search_path = public as $$
  select n.amount - coalesce((select sum(u.amount) from credit_note_uses u join sales s on s.id = u.sale_id where u.note_id = n.id and s.status = 'selesai'), 0) - n.forfeit_amount
  from credit_notes n where n.id = p_note;
$$;

-- Masa berlaku nota (opsional, hari) diisi pemilik; kosong = tanpa batas
create or replace function public.credit_note_policy_set(p_kos uuid, p_days int)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not member_in('settings', p_kos) then raise exception 'Hanya pemilik/pengelola yang bisa mengubah aturan ini'; end if;
  if p_days is not null and (p_days < 1 or p_days > 3650) then raise exception 'Masa berlaku 1–3650 hari, atau kosongkan'; end if;
  update kos set profile = case when p_days is null then coalesce(profile, '{}'::jsonb) - 'credit_note_days' else coalesce(profile, '{}'::jsonb) || jsonb_build_object('credit_note_days', p_days) end where id = p_kos;
end $$;

-- ---------- akun & jurnal ----------
select public._prasara_patch('public.acct_ensure(uuid)',
  $x$('2-1600', 'Titipan konsinyasi (belum terjual)', 'kewajiban', 'titipan')$x$,
  $x$('2-1600', 'Titipan konsinyasi (belum terjual)', 'kewajiban', 'titipan'),
    ('2-1700', 'Nota kredit pelanggan', 'kewajiban', 'nota_kredit')$x$);
select public.acct_ensure(k.id) from public.kos k;

select public._prasara_patch('public.acct_desired(uuid)',
  $x$('deposit', 'deposit_penghuni'))$x$,
  $x$('deposit', 'deposit_penghuni'), ('nota', 'nota_kredit'))$x$);
select public._prasara_patch('public.acct_desired(uuid)',
  $x$('piutang', s.amt_kasbon),$x$,
  $x$('piutang', s.amt_kasbon), ('nota_kredit', s.amt_nota),$x$);
select public._prasara_patch('public.acct_desired(uuid)',
  $x$    where m.kos_id = p_kos and p.consign_contact_id is not null and m.kind <> 'transfer' and m.value <> 0;$x$,
  $x$    where m.kos_id = p_kos and p.consign_contact_id is not null and m.kind <> 'transfer' and m.value <> 0
  union all
  -- nota kredit yang dihanguskan pemilik: kewajiban berkurang, menjadi pendapatan lain
  select 'credit_note_forfeit', n.id, n.forfeit_date, 'Nota kredit hangus ' || n.number, x.k, x.v from credit_notes n
    cross join lateral (values ('nota_kredit', n.forfeit_amount), ('pendapatan_lain', -n.forfeit_amount)) x(k, v)
    where n.kos_id = p_kos and n.forfeit_amount > 0;$x$);

-- ---------- terbit dari retur ----------
create or replace function public.credit_note_issue(p_kos uuid, p_return uuid, p_contact uuid, p_amount numeric, p_day date)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_seq int; v_no text; v_id uuid; v_days int;
begin
  perform pg_advisory_xact_lock(hashtext('nota:' || p_kos::text));
  select count(*) + 1 into v_seq from credit_notes where kos_id = p_kos and issued_date = p_day;
  v_no := 'NK-' || to_char(p_day, 'YYMMDD') || '-' || lpad(v_seq::text, 3, '0');
  select (profile->>'credit_note_days')::int into v_days from kos where id = p_kos;
  insert into credit_notes(kos_id, number, contact_id, return_id, amount, issued_date, valid_until)
  values (p_kos, v_no, p_contact, p_return, p_amount, p_day, case when v_days > 0 then p_day + v_days end) returning id into v_id;
  return v_id;
end $$;

select public._prasara_patch('public.sale_return_create(uuid,uuid,jsonb,text,text)',
  $x$  if p_refund not in ('tunai', 'transfer', 'kasbon') then raise exception 'Pilih cara pengembalian uang'; end if;$x$,
  $x$  if p_refund not in ('tunai', 'transfer', 'kasbon', 'nota') then raise exception 'Pilih cara pengembalian uang'; end if;$x$);
select public._prasara_patch('public.sale_return_create(uuid,uuid,jsonb,text,text)',
  $x$  update sale_returns set total = v_total, cost_total = v_cost where id = p_id;
  return jsonb_build_object('id', p_id, 'number', v_no, 'total', v_total, 'duplicate', false);$x$,
  $x$  update sale_returns set total = v_total, cost_total = v_cost where id = p_id;
  if p_refund = 'nota' and v_total > 0 then perform credit_note_issue(s.kos_id, p_id, s.contact_id, v_total, v_day); end if;
  return jsonb_build_object('id', p_id, 'number', v_no, 'total', v_total, 'duplicate', false,
    'credit_note', (select jsonb_build_object('id', n.id, 'number', n.number, 'amount', n.amount, 'valid_until', n.valid_until) from credit_notes n where n.return_id = p_id));$x$);

-- ---------- pakai di Kasir ----------
-- p_payments berisi baris {method:'nota', amount, note_id}; jumlahnya harus = bagian nota penjualan
create or replace function public.credit_note_redeem(p_kos uuid, p_sale uuid, p_payments jsonb, p_expected numeric)
returns void language plpgsql security definer set search_path = public as $$
declare x jsonb; n credit_notes; v_sum numeric := 0; v_amt numeric; v_bal numeric; v_day date := (now() at time zone 'Asia/Jakarta')::date;
begin
  if p_payments is null or jsonb_typeof(p_payments) <> 'array' then raise exception 'Pilih nota kredit yang dipakai'; end if;
  for x in select * from jsonb_array_elements(p_payments) where value->>'method' = 'nota' loop
    if nullif(x->>'note_id', '') is null then raise exception 'Pilih nota kredit yang dipakai'; end if;
    select * into n from credit_notes where id = (x->>'note_id')::uuid and kos_id = p_kos for update;
    if n.id is null then raise exception 'Nota kredit tidak ditemukan'; end if;
    if n.status <> 'aktif' then raise exception 'Nota kredit % sudah hangus', n.number; end if;
    if n.valid_until is not null and n.valid_until < v_day then raise exception 'Nota kredit % sudah lewat masa berlaku (%)', n.number, to_char(n.valid_until, 'DD-MM-YYYY'); end if;
    v_amt := round((x->>'amount')::numeric, 2);
    v_bal := credit_note_balance(n.id);
    if v_amt > v_bal then raise exception 'Sisa nota kredit % tinggal %', n.number, replace(to_char(v_bal, 'FM999,999,999'), ',', '.'); end if;
    insert into credit_note_uses(kos_id, note_id, sale_id, amount) values (p_kos, n.id, p_sale, v_amt);
    v_sum := v_sum + v_amt;
  end loop;
  if v_sum <> p_expected then raise exception 'Jumlah dari nota kredit (%) tidak sama dengan bagian nota (%)', v_sum, p_expected; end if;
end $$;

select public._prasara_patch('public.sale_create(uuid,uuid,text,jsonb,numeric,text,numeric,uuid,date,text,jsonb)',
  $x$x->>'method' not in ('tunai', 'transfer', 'kasbon')$x$,
  $x$x->>'method' not in ('tunai', 'transfer', 'kasbon', 'nota')$x$);
select public._prasara_patch('public.sale_create(uuid,uuid,text,jsonb,numeric,text,numeric,uuid,date,text,jsonb)',
  $x$  if v_method not in ('tunai', 'transfer', 'kasbon', 'campuran') then raise exception 'Cara bayar tidak dikenal'; end if;$x$,
  $x$  if v_method not in ('tunai', 'transfer', 'kasbon', 'campuran', 'nota') then raise exception 'Cara bayar tidak dikenal'; end if;$x$);
select public._prasara_patch('public.sale_create(uuid,uuid,text,jsonb,numeric,text,numeric,uuid,date,text,jsonb)',
  $x$coalesce((v_split->>'kasbon')::numeric, 0)) <> v_total then$x$,
  $x$coalesce((v_split->>'kasbon')::numeric, 0) + coalesce((v_split->>'nota')::numeric, 0)) <> v_total then$x$);
select public._prasara_patch('public.sale_create(uuid,uuid,text,jsonb,numeric,text,numeric,uuid,date,text,jsonb)',
  $x$coalesce((v_split->>'kasbon')::numeric, 0), v_total;$x$,
  $x$coalesce((v_split->>'kasbon')::numeric, 0) + coalesce((v_split->>'nota')::numeric, 0), v_total;$x$);
select public._prasara_patch('public.sale_create(uuid,uuid,text,jsonb,numeric,text,numeric,uuid,date,text,jsonb)',
  $x$  update sales set promo_discount = (v_promo->>'total')::numeric,$x$,
  $x$  if v_method = 'nota' or coalesce((v_split->>'nota')::numeric, 0) > 0 then
    perform credit_note_redeem(p_kos, p_id, p_payments, case when v_method = 'nota' then v_total else (v_split->>'nota')::numeric end);
  end if;
  update sales set promo_discount = (v_promo->>'total')::numeric,$x$);

create or replace function public.credit_note_check(p_kos uuid, p_number text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare n credit_notes; v_bal numeric; v_day date := (now() at time zone 'Asia/Jakarta')::date;
begin
  if not (member_in('sell', p_kos) or member_in('finance', p_kos)) then raise exception 'Tidak punya akses'; end if;
  select * into n from credit_notes where kos_id = p_kos and upper(number) = upper(trim(p_number));
  if n.id is null then return jsonb_build_object('found', false); end if;
  v_bal := credit_note_balance(n.id);
  return jsonb_build_object('found', true, 'id', n.id, 'number', n.number, 'amount', n.amount, 'balance', v_bal, 'status', n.status, 'valid_until', n.valid_until,
    'customer', (select name from contacts where id = n.contact_id), 'contact_id', n.contact_id,
    'usable', n.status = 'aktif' and v_bal > 0 and (n.valid_until is null or n.valid_until >= v_day),
    'reason', case when n.status <> 'aktif' then 'Nota sudah hangus' when v_bal <= 0 then 'Saldo nota sudah habis' when n.valid_until < v_day then 'Lewat masa berlaku' end);
end $$;

create or replace function public.credit_notes_list(p_kos uuid, p_open boolean default true)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_day date := (now() at time zone 'Asia/Jakarta')::date;
begin
  if not (member_in('sell', p_kos) or member_in('finance', p_kos)) then raise exception 'Tidak punya akses'; end if;
  return (select coalesce(jsonb_agg(z order by z.issued_date desc, z.number desc), '[]'::jsonb) from (
    select n.id, n.number, n.issued_date, n.valid_until, n.amount, n.status, n.forfeit_amount, n.forfeit_reason, credit_note_balance(n.id) as balance,
           (select name from contacts where id = n.contact_id) as customer, (select number from sale_returns where id = n.return_id) as return_number,
           (n.valid_until is not null and n.valid_until < v_day) as expired,
           (select coalesce(jsonb_agg(jsonb_build_object('sale', s.number, 'date', s.sale_date, 'amount', u.amount, 'status', s.status) order by s.sold_at), '[]'::jsonb)
              from credit_note_uses u join sales s on s.id = u.sale_id where u.note_id = n.id) as uses
    from credit_notes n where n.kos_id = p_kos) z
    where not coalesce(p_open, true) or (z.status = 'aktif' and z.balance > 0));
end $$;

create or replace function public.credit_note_forfeit(p_note uuid, p_reason text)
returns numeric language plpgsql security definer set search_path = public as $$
declare n credit_notes; v_bal numeric;
begin
  select * into n from credit_notes where id = p_note for update;
  if n.id is null or not member_in('finance', n.kos_id) then raise exception 'Nota kredit tidak ditemukan'; end if;
  if n.status <> 'aktif' then raise exception 'Nota sudah hangus'; end if;
  if coalesce(length(trim(p_reason)), 0) < 3 then raise exception 'Isi alasan'; end if;
  v_bal := credit_note_balance(n.id);
  if v_bal <= 0 then raise exception 'Saldo nota sudah habis — tidak ada yang dihanguskan'; end if;
  update credit_notes set status = 'hangus', forfeit_amount = v_bal, forfeit_date = (now() at time zone 'Asia/Jakarta')::date, forfeit_reason = trim(p_reason) where id = n.id;
  return v_bal;
end $$;

-- ---------- tukar barang (retur + penjualan baru dalam satu transaksi) ----------
-- p_return: {id, sale_id, lines, refund, reason}; p_sale: {id, tier, lines, discount, method, paid, contact, due, note, payments}
-- Pada payments, note_id "$return" diganti nota kredit yang baru terbit dari retur ini.
create or replace function public.sale_exchange(p_return jsonb, p_sale jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_kos uuid; r jsonb; s jsonb; v_note uuid; v_pay jsonb;
begin
  select kos_id into v_kos from sales where id = (p_return->>'sale_id')::uuid;
  if v_kos is null then raise exception 'Penjualan asal tidak ditemukan'; end if;
  r := sale_return_create((p_return->>'id')::uuid, (p_return->>'sale_id')::uuid, p_return->'lines', p_return->>'refund', p_return->>'reason');
  select id into v_note from credit_notes where return_id = (r->>'id')::uuid;
  v_pay := p_sale->'payments';
  if v_pay is not null and jsonb_typeof(v_pay) = 'array' then
    select jsonb_agg(case when e->>'note_id' = '$return' then e || jsonb_build_object('note_id', v_note) else e end) into v_pay from jsonb_array_elements(v_pay) e;
    if v_note is null and v_pay @> '[{"note_id": "$return"}]' then raise exception 'Retur ini tidak menerbitkan nota kredit'; end if;
  end if;
  s := sale_create((p_sale->>'id')::uuid, v_kos, coalesce(p_sale->>'tier', 'ecer'), p_sale->'lines', coalesce((p_sale->>'discount')::numeric, 0),
    coalesce(p_sale->>'method', 'tunai'), nullif(p_sale->>'paid', '')::numeric, nullif(p_sale->>'contact', '')::uuid, nullif(p_sale->>'due', '')::date, p_sale->>'note', v_pay);
  update sale_returns set exchange_sale_id = (s->>'id')::uuid where id = (r->>'id')::uuid and exchange_sale_id is null;
  update sales set exchange_return_id = (r->>'id')::uuid where id = (s->>'id')::uuid and exchange_return_id is null;
  return jsonb_build_object('return', r, 'sale', s);
end $$;

-- ---------- detail penjualan: nomor seri, isi paket, nota kredit & tukar barang ----------
select public._prasara_patch('public.sale_detail(uuid)',
  $x$|| jsonb_build_object('returned', (select coalesce(sum(r.qty), 0) from sale_return_lines r where r.sale_line_id = l.id))$x$,
  $x$|| jsonb_build_object('returned', (select coalesce(sum(r.qty), 0) from sale_return_lines r where r.sale_line_id = l.id),
                  'track_serial', (select pr.track_serial from products pr where pr.id = l.product_id),
                  'serials', (select coalesce(jsonb_agg(ps.serial order by ps.serial), '[]'::jsonb) from product_serials ps where ps.sale_line_id = l.id and ps.status = 'terjual'),
                  'warranty_until', (select max(ps.warranty_until) from product_serials ps where ps.sale_line_id = l.id and ps.status = 'terjual'),
                  'parts', (select jsonb_agg(jsonb_build_object('name', p2.name, 'qty', sp.base_qty, 'unit', p2.base_unit)) from sale_line_parts sp join products p2 on p2.id = sp.product_id where sp.sale_line_id = l.id))$x$);
select public._prasara_patch('public.sale_detail(uuid)',
  $x$'refund_method', r.refund_method, 'reason', r.reason,$x$,
  $x$'refund_method', r.refund_method, 'reason', r.reason,
                  'credit_note', (select n.number from credit_notes n where n.return_id = r.id), 'exchange_sale', (select x2.number from sales x2 where x2.id = r.exchange_sale_id),$x$);
select public._prasara_patch('public.sale_detail(uuid)',
  $x$jsonb_build_object('cashier', (select email from auth.users where id = s.created_by))$x$,
  $x$jsonb_build_object('cashier', (select email from auth.users where id = s.created_by), 'exchange_return', (select rr.number from sale_returns rr where rr.id = s.exchange_return_id),
      'credit_notes', (select jsonb_agg(jsonb_build_object('number', n.number, 'amount', u.amount)) from credit_note_uses u join credit_notes n on n.id = u.note_id where u.sale_id = s.id))$x$);

drop function public._prasara_patch(text, text, text);
