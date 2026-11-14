-- Tagihan pertama penghuni baru (keluhan pemilik 14 Nov 2026: "baru di-ACC masuk, langsung muncul tagihan jatuh tempo hari ini").
-- Masalah: tagihan pertama selalu jatuh tempo = tanggal masuk, dan satu-satunya kolom yang bisa diubah ("Tagihan pertama jatuh tempo"
-- = billing_start) ikut MENGGESER awal periode sewa, sehingga hari-hari pertama tidak tertagih.
-- Perbaikan: batas bayar tagihan pertama dipisah dari awal periode.
--   leases.first_due   = batas bayar tagihan pertama (null = sama dengan awal periode, perilaku lama)
--   lease_first_due()  = mengubahnya (sekaligus memperbarui tagihan pertama yang sudah terbit & belum lunas)
--   generate_invoices  = tagihan pertama memakai first_due
--   booking_checkin    = menerima first_due + pembayaran sewa pertama yang diterima saat check-in (paid_amount/paid_method)
--   lead_move_in       = menerima first_due

alter table public.leases add column if not exists first_due date;
alter table public.leases drop constraint if exists leases_first_due_check;
alter table public.leases add constraint leases_first_due_check check (first_due is null or first_due >= start_date);

create or replace function public._prasara_patch(p_sig text, p_old text, p_new text)
returns void language plpgsql as $$
declare d text;
begin
  d := pg_get_functiondef(p_sig::regprocedure);
  if position(p_old in d) = 0 then raise exception 'patch %: potongan tidak ditemukan', p_sig; end if;
  execute replace(d, p_old, p_new);
end $$;

-- tagihan bulan pertama (periode = billing_start) memakai batas bayar first_due
select public._prasara_patch('public.generate_invoices(uuid,integer)',
  'values (p_kos, l.id, l.room_id, l.occupant_id, ''sewa'', v_start, v_end, v_start, l.rent, ''Sewa bulanan'')',
  'values (p_kos, l.id, l.room_id, l.occupant_id, ''sewa'', v_start, v_end, case when k = 0 and l.first_due is not null then greatest(l.first_due, v_start) else v_start end, l.rent, ''Sewa bulanan'')');

create or replace function public.lease_first_due(p_lease uuid, p_due date)
returns void language plpgsql security definer set search_path = public as $$
declare l leases;
begin
  select * into l from leases where id = p_lease for update;
  if l.id is null or not member_in('rent', l.kos_id) then raise exception 'Sewa tidak ditemukan'; end if;
  if l.status <> 'aktif' then raise exception 'Sewa ini sudah berakhir'; end if;
  if p_due is not null and p_due < l.billing_start then raise exception 'Batas bayar tidak boleh sebelum awal periode sewa (%)', to_char(l.billing_start, 'DD-MM-YYYY'); end if;
  if p_due is not null and p_due > l.billing_start + 60 then raise exception 'Batas bayar tagihan pertama paling lambat 60 hari setelah awal sewa'; end if;
  update leases set first_due = p_due where id = l.id;
  update invoices set due_date = coalesce(p_due, period_start)
  where lease_id = l.id and kind = 'sewa' and period_start = l.billing_start and status <> 'batal';
end $$;
revoke execute on function public.lease_first_due(uuid, date) from public, anon;
grant execute on function public.lease_first_due(uuid, date) to authenticated;

-- check-in booking: batas bayar tagihan pertama + pembayaran sewa pertama yang diterima saat itu
select public._prasara_patch('public.booking_checkin(uuid,jsonb)',
  '  perform set_config(''prasara.booking_ok'', '''', true);',
  '  perform set_config(''prasara.booking_ok'', '''', true);
  if nullif(p->>''first_due'', '''') is not null then perform lease_first_due(v_lease, (p->>''first_due'')::date); end if;');
select public._prasara_patch('public.booking_checkin(uuid,jsonb)',
  '  update bookings set status = ''selesai'', occupant_id = v_occ,',
  '  -- sewa bulan pertama yang dibayar saat check-in (uang sudah diterima pemilik)
  if round(coalesce(nullif(p->>''paid_amount'', '''')::numeric, 0)) > 0 then
    perform generate_invoices(b.kos_id, greatest(7, v_bill - (now() at time zone ''Asia/Jakarta'')::date));
    select * into v_inv from invoice_summary where lease_id = v_lease and status <> ''batal'' and outstanding > 0 order by due_date limit 1;
    if v_inv.id is null then raise exception ''Tagihan pertama sudah lunas (dari DP); pembayaran tambahan catat sebagai deposit''; end if;
    if round((p->>''paid_amount'')::numeric) > v_inv.outstanding then
      raise exception ''Pembayaran Rp% melebihi sisa tagihan pertama Rp%. Kelebihan catat sebagai deposit di detail penghuni.'',
        replace(to_char(round((p->>''paid_amount'')::numeric), ''FM999,999,999''), '','', ''.''), replace(to_char(v_inv.outstanding, ''FM999,999,999''), '','', ''.''); end if;
    insert into payments(id, kos_id, invoice_id, amount, paid_at, method, notes, status, verified_at, source, created_by)
    values (gen_random_uuid(), b.kos_id, v_inv.id, round((p->>''paid_amount'')::numeric), (now() at time zone ''Asia/Jakarta'')::date,
      case when p->>''paid_method'' in (''tunai'', ''transfer'', ''ewallet'') then p->>''paid_method'' else ''tunai'' end,
      ''Dibayar saat check-in '' || b.number, ''terverifikasi'', now(), ''pengelola'', auth.uid());
  end if;
  update bookings set status = ''selesai'', occupant_id = v_occ,');

-- langsung huni dari pendaftaran online: batas bayar tagihan pertama
select public._prasara_patch('public.lead_move_in(uuid,jsonb)',
  '  v_lease := start_lease(v_room, v_occ, v_start, v_rent, v_start, nullif(p->>''end'', '''')::date);',
  '  v_lease := start_lease(v_room, v_occ, v_start, v_rent, v_start, nullif(p->>''end'', '''')::date);
  if nullif(p->>''first_due'', '''') is not null then perform lease_first_due(v_lease, (p->>''first_due'')::date); end if;');

drop function public._prasara_patch(text, text, text);
