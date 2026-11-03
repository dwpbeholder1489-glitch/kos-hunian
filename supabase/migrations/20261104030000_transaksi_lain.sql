-- Transaksi kas di luar sewa & biaya: pendapatan lain, setoran modal, prive (diambil pemilik), pinjaman
create table if not exists public.cash_entries (
  id uuid primary key default gen_random_uuid(),
  kos_id uuid not null references public.kos(id) on delete cascade,
  kind text not null check (kind in ('pendapatan_lain','setoran_modal','prive','pinjaman_masuk','bayar_pinjaman')),
  date date not null,
  amount numeric(14,2) not null check (amount > 0),
  description text,
  created_at timestamptz not null default now()
);
create index if not exists cash_entries_kos_date on public.cash_entries(kos_id, date);
alter table public.cash_entries enable row level security;
create policy cash_entries_all on public.cash_entries for all using (public.is_member(kos_id)) with check (public.is_member(kos_id));
grant select, insert, update, delete on public.cash_entries to authenticated;

-- Kategori gaji pengelola untuk kos yang sudah ada
insert into public.expense_categories(kos_id, name, kind)
select k.id, 'Gaji pengelola / penjaga', 'operasional' from public.kos k
on conflict (kos_id, name) do nothing;

-- Kos baru: kategori bawaan termasuk gaji pengelola
create or replace function public.create_kos(p_name text, p_address text, p_room_count int, p_prefix text default 'A')
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid; n int;
begin
  if auth.uid() is null then raise exception 'Harus login terlebih dahulu'; end if;
  if coalesce(trim(p_name),'') = '' then raise exception 'Nama kos wajib diisi'; end if;
  if p_room_count < 0 or p_room_count > 300 then raise exception 'Jumlah kamar 0–300'; end if;
  insert into kos(name, address, owner_id) values (trim(p_name), nullif(trim(p_address),''), auth.uid()) returning id into v_id;
  insert into kos_members(kos_id, user_id, role) values (v_id, auth.uid(), 'pemilik');
  for n in 1..p_room_count loop
    insert into rooms(kos_id, code) values (v_id, coalesce(nullif(trim(p_prefix),''),'A') || lpad(n::text, 2, '0'));
  end loop;
  insert into expense_categories(kos_id, name, kind) values
    (v_id,'Listrik dan air','operasional'),(v_id,'Internet','operasional'),(v_id,'Perbaikan','operasional'),
    (v_id,'Perlengkapan','operasional'),(v_id,'Kebersihan','operasional'),(v_id,'Gaji pengelola / penjaga','operasional'),
    (v_id,'Renovasi','modal'),(v_id,'Pengembalian deposit','non_operasional');
  return v_id;
end $$;
