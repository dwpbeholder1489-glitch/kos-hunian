alter table public.payments
  add column verified_by uuid,
  add column resolved_at timestamptz,
  add column resolved_by uuid,
  add column cancel_reason text;

create function public.payment_review_guard() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'UPDATE' then
    new.verified_by := old.verified_by;
    new.resolved_at := old.resolved_at;
    new.resolved_by := old.resolved_by;
    if new.status = old.status then new.cancel_reason := old.cancel_reason; new.verified_at := old.verified_at; return new; end if;
    if old.status = 'terverifikasi' and new.status <> 'dibatalkan' then raise exception 'Pembayaran terverifikasi harus dibatalkan melalui alur koreksi'; end if;
    if old.status in ('ditolak','dibatalkan') then raise exception 'Pembayaran sudah selesai ditinjau'; end if;
  else
    new.verified_by := null;
    new.resolved_at := null;
    new.resolved_by := null;
    new.cancel_reason := null;
  end if;
  if new.status = 'terverifikasi' then
    if exists (select 1 from payments p where p.invoice_id = new.invoice_id and p.id <> new.id
      and p.status = 'terverifikasi' and p.method = new.method
      and nullif(lower(trim(new.ref)), '') = nullif(lower(trim(p.ref)), '')) then
      raise exception 'Referensi ini sudah digunakan untuk pembayaran tagihan tersebut';
    end if;
    if tg_op = 'UPDATE' and old.status = 'menunggu' and not exists (
      select 1 from invoice_summary s where s.id = new.invoice_id and s.status = 'terbit' and s.outstanding >= new.amount
    ) then raise exception 'Tagihan sudah dibayar atau sisa tagihan berubah. Periksa pembayaran yang sudah tercatat'; end if;
    new.verified_at := coalesce(new.verified_at, now());
    new.verified_by := auth.uid();
  elsif new.status = 'menunggu' and new.source = 'penghuni' then
    if exists (select 1 from payments p where p.invoice_id = new.invoice_id and p.id <> new.id and p.source = 'penghuni'
      and p.status = 'menunggu' and p.amount = new.amount and p.paid_at = new.paid_at and p.method = new.method) then
      raise exception 'Konfirmasi yang sama masih menunggu verifikasi';
    end if;
  elsif new.status in ('ditolak','dibatalkan') then
    new.resolved_at := now();
    new.resolved_by := auth.uid();
    if tg_op = 'UPDATE' then new.verified_at := old.verified_at; end if;
    if new.status = 'dibatalkan' then
      if new.method = 'deposit' and current_setting('prasara.deposit_ok',true) = '1' then
        select left(d.void_reason,500) into new.cancel_reason from deposits d where d.payment_id = new.id and d.status = 'batal' limit 1;
      elsif coalesce(current_setting('prasara.payment_cancel',true),'') <> '1'
        or nullif(trim(new.cancel_reason),'') is null then
        raise exception 'Batalkan dari detail pembayaran dan isi alasan pembatalan';
      end if;
    end if;
  end if;
  return new;
end $$;
revoke all on function public.payment_review_guard() from public, anon, authenticated;
-- aa_payment_invoice_lock mengunci tagihan terlebih dahulu.
create trigger ab_payment_review_guard before insert or update on public.payments
for each row execute function public.payment_review_guard();

create function public.rent_payment_cancel(p_kos uuid, p_payment uuid, p_reason text)
returns uuid language plpgsql security definer set search_path = public as $$
declare p payments; v_journal uuid;
begin
  if auth.uid() is null or not member_in('rent',p_kos) then raise exception 'Tidak punya akses pembayaran bisnis ini'; end if;
  if length(coalesce(trim(p_reason),'')) not between 1 and 500 then raise exception 'Isi alasan pembatalan (maksimal 500 karakter)'; end if;
  select * into p from payments where id = p_payment and kos_id = p_kos for update;
  if not found then raise exception 'Pembayaran tidak ditemukan'; end if;
  if p.method = 'deposit' then raise exception 'Batalkan potongan melalui Penghuni › Deposit'; end if;
  if p.status = 'dibatalkan' then
    return (select id from acct_entries where kos_id = p_kos and source_type = 'payment' and source_id = p.id and kind = 'koreksi' order by created_at desc limit 1);
  end if;
  if p.status <> 'terverifikasi' then raise exception 'Pembayaran belum terverifikasi'; end if;
  perform pg_advisory_xact_lock(hashtext('acct:' || p_kos::text));
  perform set_config('prasara.payment_cancel','1',true);
  update payments set status = 'dibatalkan', cancel_reason = trim(p_reason) where id = p.id;
  perform set_config('prasara.payment_cancel','',true);
  if exists (select 1 from acct_lines where kos_id = p_kos and source_type = 'payment' and source_id = p.id) then
    perform acct_sync_internal(p_kos);
    select id into v_journal from acct_entries where kos_id = p_kos and source_type = 'payment' and source_id = p.id
      and kind = 'koreksi' order by created_at desc limit 1;
  end if;
  return v_journal;
end $$;
revoke all on function public.rent_payment_cancel(uuid,uuid,text) from public, anon;
grant execute on function public.rent_payment_cancel(uuid,uuid,text) to authenticated;
