-- Aturan yang terlalu kaku dilonggarkan (keluhan pemilik 14 Nov 2026) + cara bayar di halaman bisnis untuk semua jenis bisnis.
-- 1. end_lease: penghuni bisa diakhiri kapan pun.
--    - tanggal keluar di masa depan  → disimpan sebagai Rencana selesai (kamar tetap terisi), bukan ditolak
--    - tanggal keluar sebelum tanggal masuk (batal masuk / sewa yang tanggal masuknya belum tiba) → sewa ditutup, end_date = tanggal masuk
--    - mengembalikan ringkasan: tagihan dibatalkan otomatis & tagihan sesudah tanggal keluar yang sudah dibayar (perlu dikembalikan/diputuskan)
-- 2. lease_set_end: tagihan sesudah rencana selesai yang BELUM dibayar dibatalkan otomatis (sebelumnya pemilik disuruh membatalkan satu per satu);
--    memperpanjang lagi memulihkan tagihan yang tadi dibatalkan otomatis; periode tagihan terakhir menyesuaikan.
-- 3. booking_create: tanggal masuk boleh sampai 31 hari ke belakang (sebelumnya 7).
-- 4. lead_move_in: langsung huni boleh sampai 90 hari ke depan (sebelumnya 7); tagihan pertama diterbitkan sampai tanggal masuk.
-- 5. Jasa: pesanan berstatus "siap" masih bisa diubah (mis. koreksi berat/jumlah sebelum diserahkan; pendapatan baru diakui saat selesai).
--    Jemput: tindakan baru "sendiri" = pelanggan mengantar sendiri (tidak perlu pura-pura "Sudah dijemput").
-- 6. Reservasi kuliner: tamu yang ditandai tidak datang lalu datang terlambat → bisa ditandai Datang; permintaan → Datang langsung.
-- 7. public_pay_info: cara bayar (rekening/QRIS/metode) untuk SEMUA jenis bisnis, tetap hanya bila pemilik menyalakan "Tampilkan cara bayar".

create or replace function public._prasara_patch(p_sig text, p_old text, p_new text)
returns void language plpgsql as $$
declare d text;
begin
  d := pg_get_functiondef(p_sig::regprocedure);
  if position(p_old in d) = 0 then raise exception 'patch %: potongan tidak ditemukan', p_sig; end if;
  execute replace(d, p_old, p_new);
end $$;

-- ===== 2. Rencana selesai =====
create or replace function public.lease_set_end(p_lease uuid, p_end date)
returns void language plpgsql security definer set search_path = public as $$
declare l leases; v_paid text;
begin
  select * into l from leases where id = p_lease for update;
  if l.id is null or not member_in('rent', l.kos_id) then raise exception 'Sewa tidak ditemukan'; end if;
  if l.status <> 'aktif' then raise exception 'Sewa ini sudah berakhir'; end if;
  if p_end is not null and p_end < l.start_date then
    raise exception 'Rencana selesai tidak boleh sebelum tanggal masuk. Bila penghuni batal masuk, pakai tombol Akhiri sewa.'; end if;
  if p_end is not null then
    -- tagihan sesudah tanggal itu yang sudah (atau sedang) dibayar: pemilik yang memutuskan
    select string_agg(to_char(i.period_start, 'DD-MM-YYYY'), ', ' order by i.period_start) into v_paid from invoices i
    where i.lease_id = l.id and i.kind = 'sewa' and i.status <> 'batal' and i.period_start >= p_end
      and exists (select 1 from payments p where p.invoice_id = i.id and p.status in ('terverifikasi', 'menunggu'));
    if v_paid is not null then
      raise exception 'Tagihan sewa periode mulai % sudah dibayar penghuni. Pilih tanggal sesudah periode itu, atau batalkan pembayarannya dulu bila uangnya dikembalikan.', v_paid; end if;
    if exists (select 1 from bookings where room_id = l.room_id and status = 'aktif' and check_in <= p_end) then
      raise exception 'Kamar ini sudah dibooking dengan tanggal masuk sebelum/sama dengan tanggal itu. Ubah tanggal booking-nya dulu di menu Booking.'; end if;
  elsif exists (select 1 from bookings where room_id = l.room_id and status = 'aktif') then
    raise exception 'Kamar ini sudah dibooking orang lain; rencana selesai tidak bisa dikosongkan. Ubah atau batalkan booking-nya dulu.';
  end if;
  update leases set end_date = p_end where id = l.id;
  -- tagihan belum dibayar sesudah rencana selesai → dibatalkan otomatis
  if p_end is not null then
    update invoices i set status = 'batal', cancel_reason = 'Otomatis: rencana selesai sewa ' || to_char(p_end, 'DD-MM-YYYY')
    where i.lease_id = l.id and i.kind = 'sewa' and i.status <> 'batal' and i.period_start >= p_end
      and not exists (select 1 from payments p where p.invoice_id = i.id and p.status in ('terverifikasi', 'menunggu'));
  end if;
  -- diperpanjang/dikosongkan → pulihkan tagihan yang tadi dibatalkan otomatis
  update invoices i set status = 'terbit', cancel_reason = null
  where i.lease_id = l.id and i.kind = 'sewa' and i.status = 'batal' and i.cancel_reason like 'Otomatis: rencana selesai sewa%'
    and (p_end is null or i.period_start < p_end);
  -- akhir periode tiap tagihan mengikuti rencana selesai yang baru
  update invoices i set period_end = case when p_end is not null and p_end < x.nxt then p_end else x.nxt - 1 end
  from (select i2.id, (select (l.billing_start + make_interval(months => g + 1))::date from generate_series(0, 239) g
                        where (l.billing_start + make_interval(months => g))::date = i2.period_start) nxt
        from invoices i2 where i2.lease_id = l.id and i2.kind = 'sewa') x
  where i.id = x.id and x.nxt is not null and i.status <> 'batal';
end $$;
revoke execute on function public.lease_set_end(uuid, date) from public, anon;
grant execute on function public.lease_set_end(uuid, date) to authenticated;

-- ===== 1. Akhiri sewa =====
drop function if exists public.end_lease(uuid, date, text);
create function public.end_lease(p_lease uuid, p_end date, p_reason text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare l leases; v_today date := (now() at time zone 'Asia/Jakarta')::date; v_end date; v_before boolean; v_cancel int; v_paid_after numeric;
        v_reason text := nullif(trim(coalesce(p_reason, '')), '');
begin
  select * into l from leases where id = p_lease for update;
  if l.id is null or not member_in('rent', l.kos_id) then raise exception 'Sewa tidak ditemukan'; end if;
  if l.status <> 'aktif' then raise exception 'Sewa ini sudah berakhir'; end if;
  if p_end is null then raise exception 'Isi tanggal keluar'; end if;
  if p_end > v_today then
    -- penghuni masih tinggal sampai tanggal itu: simpan sebagai rencana selesai, kamar tetap terisi
    perform lease_set_end(p_lease, p_end);
    return jsonb_build_object('planned', true, 'end_date', p_end);
  end if;
  v_before := p_end < l.start_date;              -- batal masuk / tanggal masuk belum tiba
  v_end := greatest(p_end, l.start_date);         -- constraint: end_date >= start_date
  update leases set status = 'selesai', end_date = v_end,
    end_reason = case when v_before then 'Batal sebelum masuk' || coalesce(': ' || v_reason, '') else v_reason end
  where id = p_lease;
  update rooms set status = 'tersedia' where id = l.room_id and status = 'terisi';
  update invoices i set status = 'batal', cancel_reason = case when v_before then 'Otomatis: penghuni batal masuk' else 'Otomatis: sewa berakhir sebelum periode ini' end
  where i.lease_id = p_lease and i.kind = 'sewa' and i.status <> 'batal' and i.period_start >= v_end
    and not exists (select 1 from payments p where p.invoice_id = i.id and p.status in ('terverifikasi', 'menunggu'));
  get diagnostics v_cancel = row_count;
  select coalesce(sum(p.amount), 0) into v_paid_after from invoices i join payments p on p.invoice_id = i.id and p.status = 'terverifikasi'
  where i.lease_id = p_lease and i.kind = 'sewa' and i.status <> 'batal' and i.period_start >= v_end;
  return jsonb_build_object('planned', false, 'end_date', v_end, 'before_start', v_before, 'cancelled', v_cancel, 'paid_after', v_paid_after);
end $$;
revoke execute on function public.end_lease(uuid, date, text) from public, anon;
grant execute on function public.end_lease(uuid, date, text) to authenticated;

-- ===== 3–4. Booking & langsung huni =====
select public._prasara_patch('public.booking_create(uuid,uuid,jsonb)',
  'if v_in < v_today - 7 then raise exception ''Tanggal masuk terlalu lama di belakang. Untuk penghuni yang sudah masuk, pakai Kamar › Isi kamar.''; end if;',
  'if v_in < v_today - 31 then raise exception ''Tanggal masuk lebih dari sebulan yang lalu. Untuk penghuni yang sudah masuk, pakai Kamar › Isi kamar.''; end if;');
select public._prasara_patch('public.lead_move_in(uuid,jsonb)',
  'if v_start > v_day + 7 then raise exception ''Tanggal masuk lebih dari 7 hari lagi — konfirmasi sebagai Booking''; end if;',
  'if v_start > v_day + 90 then raise exception ''Tanggal masuk lebih dari 90 hari lagi — konfirmasi sebagai Booking''; end if;');
select public._prasara_patch('public.lead_move_in(uuid,jsonb)',
  'perform generate_invoices(l.kos_id, 7);',
  'perform generate_invoices(l.kos_id, greatest(7, v_start - v_day));');

-- ===== 5. Jasa =====
select public._prasara_patch('public.svc_order_edit(uuid,jsonb)',
  'if o.status not in (''permintaan'', ''diterima'', ''proses'') then raise exception ''Pesanan yang sudah siap/selesai/batal tidak bisa diubah''; end if;',
  'if o.status not in (''permintaan'', ''diterima'', ''proses'', ''siap'') then raise exception ''Pesanan yang sudah selesai/batal tidak bisa diubah''; end if;');
select public._prasara_patch('public.svc_pickup(uuid,text,text)',
  '  else raise exception ''Tindakan tidak dikenal''; end if;',
  '  elsif p_action = ''sendiri'' then
    if o.pickup_status = ''dijemput'' then raise exception ''Sudah dijemput''; end if;
    update svc_orders set pickup_status = ''dijemput'', picked_at = now() where id = o.id;
    perform svc_event(o.id, ''antar'', ''Pelanggan mengantar sendiri'' || coalesce('' · '' || nullif(trim(coalesce(p_note, '''')), ''''), ''''));
  else raise exception ''Tindakan tidak dikenal''; end if;');
select public._prasara_patch('public.svc_order_move(uuid,text,text)',
  'raise exception ''Cucian belum dijemput. Tandai "Sudah dijemput" dulu.'';',
  'raise exception ''Cucian belum dijemput. Ketuk "Sudah dijemput", atau "Diantar pelanggan sendiri" bila pelanggan datang membawa sendiri.'';');

-- ===== 6. Reservasi kuliner =====
select public._prasara_patch('public.kul_resv_status(uuid,text,text,text)',
  'if not (r.status = ''permintaan'' and p_status in (''dipesan'', ''batal'') or r.status = ''dipesan'' and p_status in (''datang'', ''batal'', ''tidak_datang'') or r.status = ''datang'' and p_status = ''selesai'') then',
  'if not (r.status = ''permintaan'' and p_status in (''dipesan'', ''datang'', ''batal'') or r.status = ''dipesan'' and p_status in (''datang'', ''batal'', ''tidak_datang'')
          or r.status = ''tidak_datang'' and p_status = ''datang'' or r.status = ''datang'' and p_status = ''selesai'') then');
select public._prasara_patch('public.kul_resv_status(uuid,text,text,text)',
  'when ''datang'' then ''Tamu datang''',
  'when ''datang'' then case when r.status = ''tidak_datang'' then ''Tamu datang (terlambat)'' else ''Tamu datang'' end');

-- ===== 7. Cara bayar di halaman bisnis: semua jenis =====
create or replace function public.public_pay_info(p_slug text)
returns jsonb language sql stable security definer set search_path = public as $$
  select case when pg.show_payment and pg.enabled and k.closed_at is null and k.setup_status = 'active'
              and (nullif(trim(coalesce(k.payment_info, '')), '') is not null or k.qris_image is not null) then jsonb_build_object(
    'payment_info', k.payment_info, 'qris', k.qris_image, 'methods', k.profile->'payment_methods', 'rules', k.profile->>'payment_rules') end
  from public_pages pg join kos k on k.id = pg.kos_id where pg.slug = lower(p_slug);
$$;
grant execute on function public.public_pay_info(text) to anon, authenticated;

drop function public._prasara_patch(text, text, text);
