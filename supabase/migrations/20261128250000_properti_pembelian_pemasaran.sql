-- Properti Tahap 2 (permintaan pemilik 28 Nov 2026): pembelian & supplier HYBRID, potongan tagihan bersama, referral, kampanye.
-- Mesin bersama dipakai ulang:
--   • Persediaan = mesin Belanja + Barang (purchases/products/stock_moves) — kini boleh untuk bisnis properti (modul r_belanja).
--   • Biaya langsung = expenses (+ contact_id supplier). Aset tetap = asset_save (mode beli) + supplier di pengeluarannya.
--   • Potongan tagihan (diskon referral, voucher, promo) = SATU mekanisme invoice_discount_apply: nilai tagihan diturunkan +
--     catatan invoice_discounts. Laporan kos berbasis kas → pendapatan otomatis lebih kecil, tanpa jurnal baru.
--   • Komisi referral tunai = pengeluaran kategori "Komisi referral" (mesin Pengeluaran lama).
--   • Notifikasi kampanye = Notification Engine (notif_emit_safe) untuk tim; ke penghuni lewat template WhatsApp MANUAL (wa.me).

-- ================= 1. Pembelian hybrid =================
create or replace function public._prasara_patch(p_sig text, p_old text, p_new text)
returns void language plpgsql as $$
declare d text;
begin
  d := pg_get_functiondef(p_sig::regprocedure);
  if position(p_old in d) = 0 then raise exception 'patch %: potongan tidak ditemukan', p_sig; end if;
  execute replace(d, p_old, p_new);
end $$;
do $$ declare f text; begin
  for f in select p.oid::regprocedure::text from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public' and p.proname in ('product_save', 'purchase_order_create') and p.prosrc like '%not in (''retail'', ''jasa'')%' loop
    perform public._prasara_patch(f, 'not in (''retail'', ''jasa'')', 'not in (''retail'', ''jasa'', ''properti'')');
  end loop;
end $$;
drop function public._prasara_patch(text, text, text);
update public.modules set applies_to = array_append(applies_to, 'properti') where code in ('r_belanja', 'r_kontak') and not 'properti' = any(applies_to);

alter table public.expenses add column if not exists contact_id uuid references public.contacts(id) on delete set null;
create index if not exists expenses_contact on public.expenses(kos_id, contact_id) where contact_id is not null;
create or replace function public.expenses_contact_check()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.contact_id is not null and not exists (select 1 from contacts where id = new.contact_id and kos_id = new.kos_id) then raise exception 'Supplier tidak ditemukan'; end if;
  return new;
end $$;
drop trigger if exists expenses_contact_check on public.expenses;
create trigger expenses_contact_check before insert or update of contact_id on public.expenses for each row execute function public.expenses_contact_check();
revoke execute on function public.expenses_contact_check() from public, anon, authenticated;

-- Biaya langsung atau aset tetap dari supplier (persediaan tetap lewat menu Belanja)
-- p: {mode:'biaya'|'aset', contact_id, date, amount, account, category_id, description, branch_id, name, life_months, salvage}
create or replace function public.purchase_direct(p_kos uuid, p jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_mode text := p ->> 'mode'; v_exp uuid; v_asset uuid; v_amt numeric := round(nullif(p ->> 'amount', '')::numeric, 2);
        v_contact uuid := nullif(p ->> 'contact_id', '')::uuid; v_date date := coalesce(nullif(p ->> 'date', '')::date, (now() at time zone 'Asia/Jakarta')::date);
begin
  if not member_in('finance', p_kos) then raise exception 'Tidak punya akses keuangan bisnis ini'; end if;
  if v_mode not in ('biaya', 'aset') then raise exception 'Pilih jenis pembelian'; end if;
  if not (v_amt > 0) then raise exception 'Isi nilai pembelian'; end if;
  if coalesce(p ->> 'account', '') not in ('kas', 'bank') then raise exception 'Pilih dibayar dari kas atau bank'; end if;
  if v_contact is not null and not exists (select 1 from contacts where id = v_contact and kos_id = p_kos and kind = 'supplier') then raise exception 'Supplier tidak ditemukan'; end if;
  if v_mode = 'biaya' then
    insert into expenses(kos_id, date, category_id, kind, amount, description, account, contact_id, branch_id)
    values (p_kos, v_date, nullif(p ->> 'category_id', '')::uuid, 'operasional', v_amt, nullif(trim(p ->> 'description'), ''), p ->> 'account', v_contact, nullif(p ->> 'branch_id', '')::uuid)
    returning id into v_exp;
  else
    v_asset := asset_save(p_kos, null, jsonb_build_object('mode', 'beli', 'name', p ->> 'name', 'date', v_date, 'cost', v_amt, 'account', p ->> 'account',
      'life_months', nullif(p ->> 'life_months', ''), 'salvage', coalesce(nullif(p ->> 'salvage', ''), '0'), 'category', nullif(p ->> 'category', ''), 'note', nullif(p ->> 'description', '')));
    select expense_id into v_exp from fixed_assets where id = v_asset;
    update expenses set contact_id = v_contact, branch_id = coalesce(nullif(p ->> 'branch_id', '')::uuid, branch_id) where id = v_exp;
    update fixed_assets set branch_id = coalesce(nullif(p ->> 'branch_id', '')::uuid, branch_id) where id = v_asset;
  end if;
  return jsonb_build_object('expense_id', v_exp, 'asset_id', v_asset);
end $$;
revoke execute on function public.purchase_direct(uuid, jsonb) from public, anon;
grant execute on function public.purchase_direct(uuid, jsonb) to authenticated;

-- Ringkasan per supplier: persediaan (Belanja diterima), biaya langsung, aset tetap
create or replace function public.supplier_spend(p_kos uuid, p_from date, p_to date)
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if not member_in('finance', p_kos) then raise exception 'Tidak punya akses keuangan bisnis ini'; end if;
  return coalesce((select jsonb_agg(x order by (x ->> 'total')::numeric desc) from (
    select jsonb_build_object('id', c.id, 'name', c.name, 'phone', c.phone,
      'persediaan', coalesce((select sum(total) from purchases pu where pu.kos_id = p_kos and pu.contact_id = c.id and pu.status not in ('batal', 'dipesan') and pu.purchase_date between p_from and p_to), 0),
      'biaya', coalesce((select sum(amount) from expenses e where e.kos_id = p_kos and e.contact_id = c.id and e.kind <> 'modal' and e.date between p_from and p_to), 0),
      'aset', coalesce((select sum(amount) from expenses e where e.kos_id = p_kos and e.contact_id = c.id and e.kind = 'modal' and e.date between p_from and p_to), 0)) x
    from contacts c where c.kos_id = p_kos and c.kind = 'supplier' and c.archived_at is null) q
    where (x ->> 'persediaan')::numeric + (x ->> 'biaya')::numeric + (x ->> 'aset')::numeric > 0), '[]');
end $$;
revoke execute on function public.supplier_spend(uuid, date, date) from public, anon;
grant execute on function public.supplier_spend(uuid, date, date) to authenticated;

-- ================= 2. Potongan tagihan (bersama) =================
create table if not exists public.invoice_discounts (
  id uuid primary key default gen_random_uuid(),
  kos_id uuid not null references public.kos(id) on delete cascade,
  invoice_id uuid not null references public.invoices(id) on delete cascade,
  source text not null check (source in ('referral', 'voucher', 'promo', 'manual')),
  source_id uuid,
  amount numeric(14,2) not null check (amount > 0),
  before_amount numeric(14,2) not null,
  reason text not null check (length(reason) between 3 and 200),
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now()
);
create index if not exists invoice_discounts_inv on public.invoice_discounts(kos_id, invoice_id);
alter table public.invoice_discounts enable row level security;
drop policy if exists invoice_discounts_read on public.invoice_discounts;
create policy invoice_discounts_read on public.invoice_discounts for select using (public.member_can(kos_id, 'rent'));
grant select on public.invoice_discounts to authenticated;
drop trigger if exists zz_kos_open_guard on public.invoice_discounts;
create trigger zz_kos_open_guard before insert or update or delete on public.invoice_discounts for each row execute function public.kos_open_guard();

-- Potong nilai tagihan yang belum lunas (sisa setelah potongan > 0). Internal; dipanggil referral/voucher/promo.
create or replace function public.invoice_discount_apply(p_invoice uuid, p_amount numeric, p_source text, p_source_id uuid, p_reason text)
returns numeric language plpgsql security definer set search_path = public as $$
declare i invoice_summary; v numeric;
begin
  select * into i from invoice_summary where id = p_invoice;
  if i.id is null or i.status <> 'terbit' then raise exception 'Tagihan tidak ditemukan atau sudah batal'; end if;
  v := least(round(p_amount), i.amount - coalesce(i.paid, 0) - coalesce(i.pending, 0) - 1);
  if v <= 0 then return 0; end if;
  update invoices set amount = amount - v, description = left(coalesce(description, '') || ' · potongan ' || p_source, 200) where id = p_invoice;
  insert into invoice_discounts(kos_id, invoice_id, source, source_id, amount, before_amount, reason) values (i.kos_id, p_invoice, p_source, p_source_id, v, i.amount, left(p_reason, 200));
  return v;
end $$;
revoke execute on function public.invoice_discount_apply(uuid, numeric, text, uuid, text) from public, anon, authenticated;

-- ================= 3. Referral =================
alter table public.occupants add column if not exists ref_code text;
create unique index if not exists occupants_ref_code on public.occupants(kos_id, ref_code) where ref_code is not null;
create table if not exists public.referrals (
  id uuid primary key default gen_random_uuid(),
  kos_id uuid not null references public.kos(id) on delete cascade,
  number text not null,
  referrer_occupant_id uuid references public.occupants(id) on delete set null,
  referrer_name text not null check (length(trim(referrer_name)) between 2 and 80),
  referrer_phone text,
  referred_occupant_id uuid references public.occupants(id) on delete set null,
  referred_lease_id uuid references public.leases(id) on delete set null,
  referred_booking_id uuid references public.bookings(id) on delete set null,
  referred_name text not null check (length(trim(referred_name)) between 2 and 80),
  status text not null default 'tercatat' check (status in ('tercatat', 'memenuhi', 'diberikan', 'batal')),
  reward_kind text check (reward_kind in ('diskon', 'komisi')),
  amount numeric(14,2) check (amount is null or amount > 0),
  invoice_id uuid references public.invoices(id) on delete set null,
  expense_id uuid references public.expenses(id) on delete set null,
  log jsonb not null default '[]',
  created_at timestamptz not null default now(),
  unique (kos_id, number)
);
alter table public.referrals enable row level security;
drop policy if exists referrals_read on public.referrals;
create policy referrals_read on public.referrals for select using (public.member_can(kos_id, 'rent'));
grant select on public.referrals to authenticated;
drop trigger if exists zz_kos_open_guard on public.referrals;
create trigger zz_kos_open_guard before insert or update or delete on public.referrals for each row execute function public.kos_open_guard();

-- Setelan pemilik: kos.profile.referral {aktif, reward 'diskon'|'komisi', amount, syarat 'bayar_pertama'|'masuk'}
create or replace function public.referral_settings_set(p_kos uuid, p jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v jsonb;
begin
  if not member_in('settings', p_kos) then raise exception 'Hanya pemilik/pengelola yang bisa mengatur referral'; end if;
  if coalesce(p ->> 'reward', '') not in ('diskon', 'komisi') then raise exception 'Pilih imbalan: potongan tagihan atau komisi tunai'; end if;
  if not (nullif(p ->> 'amount', '')::numeric > 0) then raise exception 'Isi nilai imbalan'; end if;
  if coalesce(p ->> 'syarat', 'bayar_pertama') not in ('bayar_pertama', 'masuk') then raise exception 'Syarat tidak dikenal'; end if;
  v := jsonb_build_object('aktif', coalesce((p ->> 'aktif')::boolean, true), 'reward', p ->> 'reward', 'amount', round((p ->> 'amount')::numeric),
                          'syarat', coalesce(p ->> 'syarat', 'bayar_pertama'), 'note', left(coalesce(p ->> 'note', ''), 300));
  perform config_log(p_kos, 'ubah_referral', 'Program referral', (select profile -> 'referral' from kos where id = p_kos), v, null, 'rendah', null);
  update kos set profile = jsonb_set(coalesce(profile, '{}'), '{referral}', v) where id = p_kos;
  return v;
end $$;

create or replace function public.referral_code(p_occupant uuid)
returns text language plpgsql security definer set search_path = public as $$
declare o occupants; v text;
begin
  select * into o from occupants where id = p_occupant;
  if o.id is null or not member_in('rent', o.kos_id) then raise exception 'Penghuni tidak ditemukan'; end if;
  if o.ref_code is not null then return o.ref_code; end if;
  loop
    v := upper(left(regexp_replace(o.name, '[^A-Za-z]', '', 'g') || 'XXX', 3)) || lpad((floor(random() * 10000))::int::text, 4, '0');
    exit when not exists (select 1 from occupants where kos_id = o.kos_id and ref_code = v);
  end loop;
  update occupants set ref_code = v where id = o.id;
  return v;
end $$;

-- Catat referral. p: {referrer_occupant_id | referrer_name+phone | code, referred_occupant_id/lease_id/booking_id/name}
create or replace function public.referral_add(p_kos uuid, p jsonb)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid := gen_random_uuid(); v_ref occupants; v_lease leases; v_bk bookings; v_occ occupants; v_name text; v_no text;
begin
  if not member_in('rent', p_kos) then raise exception 'Tidak punya akses ke bisnis ini'; end if;
  if nullif(p ->> 'code', '') is not null then
    select * into v_ref from occupants where kos_id = p_kos and ref_code = upper(trim(p ->> 'code'));
    if v_ref.id is null then raise exception 'Kode referral % tidak ditemukan', upper(trim(p ->> 'code')); end if;
  elsif nullif(p ->> 'referrer_occupant_id', '') is not null then
    select * into v_ref from occupants where id = (p ->> 'referrer_occupant_id')::uuid and kos_id = p_kos;
    if v_ref.id is null then raise exception 'Pemberi referral tidak ditemukan'; end if;
  end if;
  select * into v_lease from leases where id = nullif(p ->> 'referred_lease_id', '')::uuid and kos_id = p_kos;
  select * into v_bk from bookings where id = nullif(p ->> 'referred_booking_id', '')::uuid and kos_id = p_kos;
  select * into v_occ from occupants where id = coalesce(nullif(p ->> 'referred_occupant_id', '')::uuid, v_lease.occupant_id, v_bk.occupant_id) and kos_id = p_kos;
  v_name := coalesce(v_occ.name, v_bk.name, nullif(trim(p ->> 'referred_name'), ''));
  if v_name is null then raise exception 'Pilih penghuni/booking yang direferensikan'; end if;
  if v_ref.id is not null and v_ref.id = v_occ.id then raise exception 'Penghuni tidak bisa mereferensikan dirinya sendiri'; end if;
  if coalesce(v_ref.name, nullif(trim(p ->> 'referrer_name'), '')) is null then raise exception 'Isi pemberi referral'; end if;
  if v_occ.id is not null and exists (select 1 from referrals where kos_id = p_kos and referred_occupant_id = v_occ.id and status <> 'batal') then
    raise exception 'Penghuni ini sudah tercatat sebagai referral'; end if;
  perform pg_advisory_xact_lock(hashtext('ref_number:' || p_kos::text));
  v_no := 'REF-' || to_char(now() at time zone 'Asia/Jakarta', 'YYMM') || '-' || lpad((select count(*) + 1 from referrals where kos_id = p_kos)::text, 3, '0');
  insert into referrals(id, kos_id, number, referrer_occupant_id, referrer_name, referrer_phone, referred_occupant_id, referred_lease_id, referred_booking_id, referred_name, log)
  values (v_id, p_kos, v_no, v_ref.id, coalesce(v_ref.name, trim(p ->> 'referrer_name')), coalesce(v_ref.phone, nullif(trim(p ->> 'referrer_phone'), '')),
    v_occ.id, coalesce(v_lease.id, (select id from leases where occupant_id = v_occ.id and status = 'aktif' limit 1)), v_bk.id, v_name,
    jsonb_build_array(jsonb_build_object('at', now(), 'by', actor_email(), 'action', 'tercatat')));
  perform referral_refresh(p_kos);
  return v_id;
end $$;

-- Syarat terpenuhi: penghuni yang direferensikan sudah masuk (syarat 'masuk') atau sudah membayar tagihan sewa (syarat 'bayar_pertama')
create or replace function public.referral_refresh(p_kos uuid)
returns int language plpgsql security definer set search_path = public as $$
declare v_syarat text := coalesce((select profile -> 'referral' ->> 'syarat' from kos where id = p_kos), 'bayar_pertama'); n int;
begin
  if not member_in('rent', p_kos) then raise exception 'Tidak punya akses ke bisnis ini'; end if;
  update referrals r set referred_lease_id = coalesce(r.referred_lease_id, (select lease_id from bookings where id = r.referred_booking_id)),
    referred_occupant_id = coalesce(r.referred_occupant_id, (select occupant_id from bookings where id = r.referred_booking_id))
  where r.kos_id = p_kos and r.status = 'tercatat' and r.referred_booking_id is not null;
  update referrals r set status = 'memenuhi', log = r.log || jsonb_build_object('at', now(), 'by', 'sistem', 'action', 'memenuhi', 'note', v_syarat)
  where r.kos_id = p_kos and r.status = 'tercatat' and r.referred_lease_id is not null
    and (v_syarat = 'masuk' or exists (select 1 from payments pa join invoices i on i.id = pa.invoice_id
                                       where i.lease_id = r.referred_lease_id and i.kind = 'sewa' and pa.status = 'terverifikasi' and pa.method <> 'deposit'));
  get diagnostics n = row_count;
  return n;
end $$;

-- Berikan imbalan. p: {kind 'diskon'|'komisi' (bawaan setelan), amount (bawaan setelan), account (komisi), invoice_id (diskon, opsional)}
create or replace function public.referral_reward(p_ref uuid, p jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare r referrals; s jsonb; v_kind text; v_amt numeric; v_inv uuid; v_got numeric; v_exp uuid; v_cat uuid;
begin
  select * into r from referrals where id = p_ref for update;
  if r.id is null or not member_in('finance', r.kos_id) then raise exception 'Referral tidak ditemukan'; end if;
  if r.status <> 'memenuhi' then raise exception 'Imbalan hanya untuk referral yang sudah memenuhi syarat (status sekarang: %)', r.status; end if;
  s := (select profile -> 'referral' from kos where id = r.kos_id);
  v_kind := coalesce(nullif(p ->> 'kind', ''), s ->> 'reward');
  v_amt := round(coalesce(nullif(p ->> 'amount', '')::numeric, (s ->> 'amount')::numeric));
  if v_kind not in ('diskon', 'komisi') then raise exception 'Atur program referral dulu (imbalan diskon atau komisi)'; end if;
  if not (v_amt > 0) then raise exception 'Isi nilai imbalan'; end if;
  if v_kind = 'diskon' then
    if r.referrer_occupant_id is null then raise exception 'Pemberi referral bukan penghuni — pakai komisi tunai'; end if;
    v_inv := coalesce(nullif(p ->> 'invoice_id', '')::uuid, (select i.id from invoice_summary i join leases l on l.id = i.lease_id
              where l.occupant_id = r.referrer_occupant_id and i.status = 'terbit' and i.kind = 'sewa' and i.outstanding > 1 and coalesce(i.pending, 0) = 0
              order by i.due_date limit 1));
    if v_inv is null or not exists (select 1 from invoices i join leases l on l.id = i.lease_id where i.id = v_inv and l.occupant_id = r.referrer_occupant_id) then
      raise exception 'Belum ada tagihan sewa % yang belum dibayar untuk dipotong. Tunggu tagihan berikutnya terbit atau pakai komisi tunai.', r.referrer_name; end if;
    v_got := invoice_discount_apply(v_inv, v_amt, 'referral', r.id, 'Referral ' || r.number || ' · ' || r.referred_name);
    if v_got <= 0 then raise exception 'Tagihan itu sudah hampir lunas; pilih tagihan lain atau komisi tunai'; end if;
    update referrals set status = 'diberikan', reward_kind = 'diskon', amount = v_got, invoice_id = v_inv,
      log = log || jsonb_build_object('at', now(), 'by', actor_email(), 'action', 'diskon', 'amount', v_got) where id = r.id;
    return jsonb_build_object('kind', 'diskon', 'amount', v_got, 'invoice_id', v_inv);
  end if;
  if coalesce(p ->> 'account', '') not in ('kas', 'bank') then raise exception 'Pilih komisi dibayar dari kas atau bank'; end if;
  insert into expense_categories(kos_id, name, kind) values (r.kos_id, 'Komisi referral', 'operasional') on conflict (kos_id, name) do nothing;
  select id into v_cat from expense_categories where kos_id = r.kos_id and name = 'Komisi referral';
  insert into expenses(kos_id, date, category_id, kind, amount, description, account)
  values (r.kos_id, (now() at time zone 'Asia/Jakarta')::date, v_cat, 'operasional', v_amt, 'Komisi referral ' || r.number || ' · ' || r.referrer_name || ' → ' || r.referred_name, p ->> 'account')
  returning id into v_exp;
  update referrals set status = 'diberikan', reward_kind = 'komisi', amount = v_amt, expense_id = v_exp,
    log = log || jsonb_build_object('at', now(), 'by', actor_email(), 'action', 'komisi', 'amount', v_amt) where id = r.id;
  return jsonb_build_object('kind', 'komisi', 'amount', v_amt, 'expense_id', v_exp);
end $$;
create or replace function public.referral_cancel(p_ref uuid, p_reason text)
returns void language plpgsql security definer set search_path = public as $$
declare r referrals;
begin
  select * into r from referrals where id = p_ref for update;
  if r.id is null or not member_in('rent', r.kos_id) then raise exception 'Referral tidak ditemukan'; end if;
  if r.status = 'diberikan' then raise exception 'Imbalan sudah diberikan; batalkan potongan/pengeluarannya secara terpisah bila perlu'; end if;
  if length(trim(coalesce(p_reason, ''))) < 3 then raise exception 'Tulis alasan pembatalan'; end if;
  update referrals set status = 'batal', log = log || jsonb_build_object('at', now(), 'by', actor_email(), 'action', 'batal', 'note', trim(p_reason)) where id = r.id;
end $$;
revoke execute on function public.referral_settings_set(uuid, jsonb), public.referral_code(uuid), public.referral_add(uuid, jsonb), public.referral_refresh(uuid),
  public.referral_reward(uuid, jsonb), public.referral_cancel(uuid, text) from public, anon;
grant execute on function public.referral_settings_set(uuid, jsonb), public.referral_code(uuid), public.referral_add(uuid, jsonb), public.referral_refresh(uuid),
  public.referral_reward(uuid, jsonb), public.referral_cancel(uuid, text) to authenticated;

-- ================= 4. Kampanye: promosi, voucher, pengumuman =================
create table if not exists public.campaigns (
  id uuid primary key default gen_random_uuid(),
  kos_id uuid not null references public.kos(id) on delete cascade,
  name text not null check (length(trim(name)) between 3 and 80),
  kind text not null check (kind in ('promo', 'voucher', 'pengumuman')),
  status text not null default 'draf' check (status in ('draf', 'aktif', 'selesai', 'batal')),
  start_date date, end_date date,
  discount_kind text check (discount_kind in ('persen', 'nominal')),
  discount_value numeric(14,2),
  max_discount numeric(14,2) check (max_discount is null or max_discount > 0),
  months int not null default 1 check (months between 1 and 12),
  code text,
  quota int check (quota is null or quota > 0),
  used int not null default 0,
  publish_portal boolean not null default false,
  portal_text text check (portal_text is null or length(portal_text) <= 500),
  wa_template text check (wa_template is null or length(wa_template) <= 1000),
  notify_team boolean not null default true,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (end_date is null or start_date is null or end_date >= start_date),
  check (kind = 'pengumuman' or (discount_kind is not null and discount_value > 0)),
  check (discount_kind <> 'persen' or discount_value <= 100),
  check (kind <> 'voucher' or code is not null)
);
create unique index if not exists campaigns_code on public.campaigns(kos_id, upper(code)) where code is not null and status <> 'batal';
create table if not exists public.campaign_redemptions (
  id uuid primary key default gen_random_uuid(),
  kos_id uuid not null references public.kos(id) on delete cascade,
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  lease_id uuid not null references public.leases(id) on delete cascade,
  months_left int not null check (months_left >= 0),
  total numeric(14,2) not null default 0,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  unique (campaign_id, lease_id)
);
create table if not exists public.campaign_sends (
  id uuid primary key default gen_random_uuid(),
  kos_id uuid not null references public.kos(id) on delete cascade,
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  target_kind text not null check (target_kind in ('penghuni', 'prospek', 'mantan', 'lainnya')),
  target_id uuid,
  target_name text,
  channel text not null default 'wa' check (channel in ('wa')),
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now()
);
alter table public.campaigns enable row level security;
alter table public.campaign_redemptions enable row level security;
alter table public.campaign_sends enable row level security;
drop policy if exists campaigns_read on public.campaigns;
create policy campaigns_read on public.campaigns for select using (public.member_can(kos_id, 'rent') or public.member_can(kos_id, 'settings'));
drop policy if exists campaign_redemptions_read on public.campaign_redemptions;
create policy campaign_redemptions_read on public.campaign_redemptions for select using (public.member_can(kos_id, 'rent'));
drop policy if exists campaign_sends_read on public.campaign_sends;
create policy campaign_sends_read on public.campaign_sends for select using (public.member_can(kos_id, 'rent') or public.member_can(kos_id, 'settings'));
grant select on public.campaigns, public.campaign_redemptions, public.campaign_sends to authenticated;
do $$ declare t text; begin
  foreach t in array array['campaigns', 'campaign_redemptions', 'campaign_sends'] loop
    execute format('drop trigger if exists zz_kos_open_guard on public.%I', t);
    execute format('create trigger zz_kos_open_guard before insert or update or delete on public.%I for each row execute function public.kos_open_guard()', t);
  end loop;
end $$;

create or replace function public.campaign_save(p_kos uuid, p_id uuid, p jsonb)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid; c campaigns; v_code text := nullif(upper(regexp_replace(coalesce(p ->> 'code', ''), '[^A-Za-z0-9]', '', 'g')), '');
begin
  if not member_in('settings', p_kos) then raise exception 'Hanya pemilik/pengelola yang bisa mengatur kampanye'; end if;
  if (select business_type from kos where id = p_kos) <> 'properti' then raise exception 'Kampanye sewa hanya untuk bisnis properti'; end if;
  if v_code is not null and length(v_code) not between 3 and 20 then raise exception 'Kode voucher 3–20 huruf/angka'; end if;
  if p_id is not null then
    select * into c from campaigns where id = p_id and kos_id = p_kos;
    if c.id is null then raise exception 'Kampanye tidak ditemukan'; end if;
    if c.used > 0 and (p ->> 'discount_value')::numeric is distinct from c.discount_value then raise exception 'Nilai potongan tidak bisa diubah setelah dipakai; buat kampanye baru'; end if;
  end if;
  if p_id is null then
    insert into campaigns(kos_id, name, kind, start_date, end_date, discount_kind, discount_value, max_discount, months, code, quota, publish_portal, portal_text, wa_template, notify_team)
    values (p_kos, trim(p ->> 'name'), p ->> 'kind', nullif(p ->> 'start_date', '')::date, nullif(p ->> 'end_date', '')::date,
      case when p ->> 'kind' <> 'pengumuman' then p ->> 'discount_kind' end, case when p ->> 'kind' <> 'pengumuman' then nullif(p ->> 'discount_value', '')::numeric end,
      nullif(p ->> 'max_discount', '')::numeric, coalesce(nullif(p ->> 'months', '')::int, 1), v_code, nullif(p ->> 'quota', '')::int,
      coalesce((p ->> 'publish_portal')::boolean, false), nullif(trim(p ->> 'portal_text'), ''), nullif(trim(p ->> 'wa_template'), ''), coalesce((p ->> 'notify_team')::boolean, true))
    returning id into v_id;
  else
    update campaigns set name = trim(p ->> 'name'), kind = p ->> 'kind', start_date = nullif(p ->> 'start_date', '')::date, end_date = nullif(p ->> 'end_date', '')::date,
      discount_kind = case when p ->> 'kind' <> 'pengumuman' then p ->> 'discount_kind' end, discount_value = case when p ->> 'kind' <> 'pengumuman' then nullif(p ->> 'discount_value', '')::numeric end,
      max_discount = nullif(p ->> 'max_discount', '')::numeric, months = coalesce(nullif(p ->> 'months', '')::int, 1), code = v_code, quota = nullif(p ->> 'quota', '')::int,
      publish_portal = coalesce((p ->> 'publish_portal')::boolean, false), portal_text = nullif(trim(p ->> 'portal_text'), ''), wa_template = nullif(trim(p ->> 'wa_template'), ''),
      notify_team = coalesce((p ->> 'notify_team')::boolean, true), updated_at = now()
    where id = p_id returning id into v_id;
  end if;
  perform config_log(p_kos, 'ubah_kampanye_sewa', trim(p ->> 'name'), null, p, null, 'rendah', null);
  return v_id;
end $$;

create or replace function public.campaign_set_status(p_id uuid, p_status text)
returns void language plpgsql security definer set search_path = public as $$
declare c campaigns;
begin
  select * into c from campaigns where id = p_id for update;
  if c.id is null or not member_in('settings', c.kos_id) then raise exception 'Kampanye tidak ditemukan'; end if;
  if p_status not in ('aktif', 'selesai', 'batal', 'draf') then raise exception 'Status tidak dikenal'; end if;
  if c.status in ('selesai', 'batal') and p_status = 'aktif' and c.used > 0 then raise exception 'Kampanye yang sudah dipakai tidak bisa diaktifkan lagi; salin jadi kampanye baru'; end if;
  update campaigns set status = p_status, updated_at = now() where id = c.id;
  if p_status = 'aktif' and c.notify_team then
    perform notif_emit_safe(c.kos_id, 'CampaignActivated', 'campaign:' || c.id || ':' || extract(epoch from now())::bigint, 'rent',
      'Kampanye aktif · ' || c.name || coalesce(' · kode ' || c.code, ''), null, jsonb_build_object('campaign_id', c.id), auth.uid(), 'campaign', c.id);
  end if;
end $$;

-- Potongan per tagihan sesuai kampanye
create or replace function public.campaign_cut(c campaigns, p_amount numeric)
returns numeric language sql immutable as $$
  select round(case when c.discount_kind = 'persen' then least(p_amount * c.discount_value / 100, coalesce(c.max_discount, p_amount)) else least(c.discount_value, p_amount) end);
$$;

-- Pakai promo/voucher untuk sebuah sewa: tagihan sewa yang sudah terbit & belum dibayar langsung dipotong, sisanya otomatis saat terbit
create or replace function public.campaign_redeem(p_kos uuid, p_lease uuid, p_campaign uuid, p_code text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare c campaigns; l leases; v_today date := (now() at time zone 'Asia/Jakarta')::date; v_red uuid; i record; v_left int; v_total numeric := 0; v_got numeric;
begin
  if not member_in('rent', p_kos) then raise exception 'Tidak punya akses ke bisnis ini'; end if;
  select * into l from leases where id = p_lease and kos_id = p_kos;
  if l.id is null then raise exception 'Sewa tidak ditemukan'; end if;
  if nullif(p_code, '') is not null then
    select * into c from campaigns where kos_id = p_kos and upper(code) = upper(regexp_replace(p_code, '[^A-Za-z0-9]', '', 'g')) and status <> 'batal' for update;
  else select * into c from campaigns where id = p_campaign and kos_id = p_kos for update; end if;
  if c.id is null then raise exception 'Kode/kampanye tidak ditemukan'; end if;
  if c.kind = 'pengumuman' then raise exception 'Kampanye pengumuman tidak memberi potongan'; end if;
  if c.status <> 'aktif' then raise exception 'Kampanye % tidak aktif', c.name; end if;
  if (c.start_date is not null and v_today < c.start_date) or (c.end_date is not null and v_today > c.end_date) then raise exception 'Kampanye % di luar masa berlaku', c.name; end if;
  if c.quota is not null and c.used >= c.quota then raise exception 'Kuota kampanye % sudah habis', c.name; end if;
  if exists (select 1 from campaign_redemptions where campaign_id = c.id and lease_id = l.id) then raise exception 'Kampanye ini sudah dipakai untuk sewa tersebut'; end if;
  insert into campaign_redemptions(kos_id, campaign_id, lease_id, months_left) values (p_kos, c.id, l.id, c.months) returning id into v_red;
  update campaigns set used = used + 1, updated_at = now() where id = c.id;
  v_left := c.months;
  for i in select * from invoice_summary where lease_id = l.id and kind = 'sewa' and status = 'terbit' and outstanding > 1 and coalesce(paid, 0) = 0 and coalesce(pending, 0) = 0 order by period_start loop
    exit when v_left <= 0;
    v_got := invoice_discount_apply(i.id, campaign_cut(c, i.amount), case when c.kind = 'voucher' then 'voucher' else 'promo' end, c.id, c.name);
    v_total := v_total + v_got; v_left := v_left - 1;
  end loop;
  update campaign_redemptions set months_left = v_left, total = v_total where id = v_red;
  return jsonb_build_object('campaign', c.name, 'applied', v_total, 'months_left', v_left);
end $$;

-- Tagihan sewa baru dari sewa yang masih punya sisa bulan promo → dipotong otomatis
create or replace function public.invoices_campaign_apply()
returns trigger language plpgsql security definer set search_path = public as $$
declare rd record; c campaigns; v numeric;
begin
  if new.kind <> 'sewa' or new.status <> 'terbit' then return null; end if;
  for rd in select r.id, r.campaign_id from campaign_redemptions r where r.lease_id = new.lease_id and r.months_left > 0 order by r.created_at for update of r loop
    select * into c from campaigns where id = rd.campaign_id;
    begin
      v := invoice_discount_apply(new.id, campaign_cut(c, (select amount from invoices where id = new.id)), case when c.kind = 'voucher' then 'voucher' else 'promo' end, c.id, c.name);
    exception when others then v := 0; end;
    if v > 0 then update campaign_redemptions set months_left = months_left - 1, total = total + v where id = rd.id; end if;
  end loop;
  return null;
end $$;
drop trigger if exists invoices_campaign_apply on public.invoices;
create trigger invoices_campaign_apply after insert on public.invoices for each row execute function public.invoices_campaign_apply();
revoke execute on function public.invoices_campaign_apply() from public, anon, authenticated;

create or replace function public.campaign_send_log(p_id uuid, p_targets jsonb)
returns int language plpgsql security definer set search_path = public as $$
declare c campaigns; n int;
begin
  select * into c from campaigns where id = p_id;
  if c.id is null or not (member_in('rent', c.kos_id) or member_in('settings', c.kos_id)) then raise exception 'Kampanye tidak ditemukan'; end if;
  if jsonb_array_length(coalesce(p_targets, '[]')) > 200 then raise exception 'Maksimal 200 penerima sekali catat'; end if;
  insert into campaign_sends(kos_id, campaign_id, target_kind, target_id, target_name)
  select c.kos_id, c.id, coalesce(t ->> 'kind', 'lainnya'), nullif(t ->> 'id', '')::uuid, left(t ->> 'name', 80) from jsonb_array_elements(coalesce(p_targets, '[]')) t;
  get diagnostics n = row_count;
  return n;
end $$;

-- Halaman bisnis publik: kampanye aktif yang dipublikasikan (tanpa angka pemakaian)
create or replace function public.public_campaigns(p_slug text)
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object('name', c.name, 'kind', c.kind, 'text', c.portal_text, 'discount_kind', c.discount_kind, 'discount_value', c.discount_value,
           'max_discount', c.max_discount, 'months', c.months, 'code', case when c.kind = 'voucher' then c.code end, 'end_date', c.end_date) order by c.end_date nulls last), '[]')
  from campaigns c join public_pages pp on pp.kos_id = c.kos_id join kos k on k.id = c.kos_id
  where pp.slug = p_slug and pp.enabled and k.closed_at is null and c.status = 'aktif' and c.publish_portal
    and (c.start_date is null or c.start_date <= (now() at time zone 'Asia/Jakarta')::date) and (c.end_date is null or c.end_date >= (now() at time zone 'Asia/Jakarta')::date)
    and (c.quota is null or c.used < c.quota);
$$;
revoke execute on function public.campaign_save(uuid, uuid, jsonb), public.campaign_set_status(uuid, text), public.campaign_redeem(uuid, uuid, uuid, text), public.campaign_send_log(uuid, jsonb) from public, anon;
grant execute on function public.campaign_save(uuid, uuid, jsonb), public.campaign_set_status(uuid, text), public.campaign_redeem(uuid, uuid, uuid, text), public.campaign_send_log(uuid, jsonb) to authenticated;
revoke execute on function public.public_campaigns(text) from public;
grant execute on function public.public_campaigns(text) to anon, authenticated;

insert into public.notif_event_types(code, category, priority, audience, area, title, push_default, link, module)
values ('CampaignActivated', 'pelanggan', 'info', 'area', 'rent', 'Kampanye diaktifkan', true, '/kampanye', 'p_kampanye')
on conflict (code) do nothing;

-- ================= 5. Modul =================
insert into public.modules(code, name, description, applies_to, core, depends_on, entitlement, paths, data_used, status, version, sort, module_type, category, impl_status, feature_keys, area, optional_deps, owner_approval, config_path)
select x.code, x.name, x.descr, '{properti}', false, '{p_kamar}', null, x.paths, x.data, 'available', '1.0', x.sort, 'operational', m.category, 'production_ready', '{}', x.area, '{}', false, x.paths[1]
from public.modules m, (values
  ('p_referral', 'Referral penghuni', 'Penghuni mengajak calon penghuni; imbalan potongan tagihan atau komisi tunai sesuai setelan pemilik, diberikan setelah syarat terpenuhi.', '{/referral}'::text[], 'referrals, invoice_discounts, expenses', 11, 'rent'),
  ('p_kampanye', 'Kampanye & voucher', 'Promosi & voucher potongan sewa, publikasi di halaman bisnis, notifikasi tim, dan template WhatsApp manual ke penghuni/calon penghuni.', '{/kampanye}'::text[], 'campaigns, invoice_discounts', 12, 'settings'),
  ('p_pembelian', 'Pembelian & supplier', 'Pembelian hybrid: persediaan (Belanja & stok), biaya langsung, atau aset tetap, dengan rekap per supplier.', '{/pembelian}'::text[], 'purchases, expenses.contact_id, fixed_assets', 13, 'finance')
) as x(code, name, descr, paths, data, sort, area)
where m.code = 'p_booking'
on conflict (code) do nothing;
insert into public.business_modules(kos_id, module_code, active, updated_by)
select k.id, m, true, 'sistem' from public.kos k cross join unnest(array['p_referral', 'p_kampanye', 'p_pembelian']) m where k.business_type = 'properti'
on conflict do nothing;
update public.biz_templates set spec = jsonb_set(spec, '{modules}', coalesce(spec -> 'modules', '[]'::jsonb) || '["p_referral","p_kampanye","p_pembelian"]'::jsonb)
where code = 'kos' and not coalesce(spec -> 'modules', '[]'::jsonb) ? 'p_kampanye';
