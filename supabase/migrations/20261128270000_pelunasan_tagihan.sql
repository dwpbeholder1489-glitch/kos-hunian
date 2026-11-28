-- Gunakan kunci tagihan yang sama untuk pelunasan kelompok dan perubahan pembayaran biasa.
create function public.payment_invoice_lock() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    perform 1 from invoices where id = new.invoice_id for no key update;
  elsif tg_op = 'DELETE' then
    perform 1 from invoices where id = old.invoice_id for no key update;
    return old;
  else
    perform 1 from invoices where id in (old.invoice_id, new.invoice_id) order by id for no key update;
  end if;
  return new;
end $$;
revoke all on function public.payment_invoice_lock() from public, anon, authenticated;
create trigger aa_payment_invoice_lock before insert or update or delete on public.payments
for each row execute function public.payment_invoice_lock();

create function public.invoice_pay_batch(p_kos uuid, p_occupant uuid, p_entries jsonb, p_date date, p_method text, p_ref text)
returns int language plpgsql set search_path = public as $$
declare v_expected int; v_found int; v_written int;
begin
  if not member_in('rent', p_kos) then raise exception 'Tidak punya akses tagihan bisnis ini'; end if;
  if jsonb_typeof(p_entries) is distinct from 'array' then raise exception 'Daftar tagihan tidak valid'; end if;
  v_expected := jsonb_array_length(p_entries);
  if v_expected not between 2 and 100 or p_date is null or p_date > (now() at time zone 'Asia/Jakarta')::date
    or p_method is null or p_method not in ('tunai', 'transfer', 'ewallet', 'lainnya') then
    raise exception 'Pilihan tagihan, tanggal, atau metode pembayaran tidak valid';
  end if;
  if exists (select 1 from jsonb_to_recordset(p_entries) e(id uuid, invoice_id uuid, amount numeric)
    where e.id is null or e.invoice_id is null or e.amount is null or e.amount <= 0)
    or (select count(distinct e.id) from jsonb_to_recordset(p_entries) e(id uuid)) <> v_expected then
    raise exception 'Daftar pembayaran tidak valid';
  end if;

  perform 1 from invoices i where i.kos_id = p_kos and i.occupant_id = p_occupant
    and i.id in (select e.invoice_id from jsonb_to_recordset(p_entries) e(invoice_id uuid))
    order by i.id for no key update;
  get diagnostics v_found = row_count;
  if v_found <> v_expected then raise exception 'Pilih tagihan berbeda milik penghuni yang sama'; end if;

  select count(*) into v_written
    from jsonb_to_recordset(p_entries) e(id uuid, invoice_id uuid, amount numeric)
    join payments p on p.id = e.id and p.kos_id = p_kos and p.invoice_id = e.invoice_id and p.amount = e.amount;
  if v_written = v_expected then return v_written; end if;
  if v_written > 0 then raise exception 'Sebagian permintaan sudah tercatat. Periksa riwayat pembayaran'; end if;

  if exists (select 1 from jsonb_to_recordset(p_entries) e(invoice_id uuid, amount numeric)
    join invoice_summary i on i.id = e.invoice_id
    where i.status <> 'terbit' or i.outstanding is distinct from e.amount or i.pending > 0) then
    raise exception 'Ada tagihan yang berubah atau menunggu verifikasi. Periksa kembali sebelum melunasi';
  end if;

  insert into payments(id, kos_id, invoice_id, amount, paid_at, method, ref, status, verified_at)
    select e.id, p_kos, e.invoice_id, e.amount, p_date, p_method, nullif(trim(p_ref), ''), 'terverifikasi', now()
    from jsonb_to_recordset(p_entries) e(id uuid, invoice_id uuid, amount numeric)
    order by e.invoice_id;
  return v_expected;
end $$;
revoke all on function public.invoice_pay_batch(uuid,uuid,jsonb,date,text,text) from public, anon;
grant execute on function public.invoice_pay_batch(uuid,uuid,jsonb,date,text,text) to authenticated;
