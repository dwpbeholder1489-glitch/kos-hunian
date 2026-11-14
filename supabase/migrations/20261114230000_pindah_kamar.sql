-- Pindah kamar penghuni (celah audit 14 Nov 2026): satu langkah, tanpa mengakhiri lalu memulai sewa manual.
-- Aturan:
--   * sewa lama ditutup pada tanggal pindah (end_reason "Pindah ke kamar …"), kamar lama kembali Tersedia
--   * sewa baru di kamar tujuan dengan harga baru; SIKLUS TAGIHAN DILANJUTKAN (tanggal tagihan sama seperti sebelumnya):
--       periode yang sedang berjalan tetap di tagihan kamar lama; harga baru berlaku mulai periode berikutnya
--       (pindah tepat di awal periode → harga baru langsung berlaku untuk periode itu)
--   * tagihan sewa lama sesudah tanggal pindah yang belum dibayar → dibatalkan (diterbitkan ulang dengan harga baru)
--   * tagihan sewa lama yang SUDAH dibayar di muka (periode sesudahnya) → dipindah ke sewa baru (uangnya tidak hilang)
--   * deposit ikut pindah ke sewa baru; selisih harga bulan berjalan opsional sebagai tagihan tambahan
--   * tanggal pindah: antara tanggal masuk dan hari ini (dicatat saat benar-benar pindah)

alter table public.leases add column if not exists prev_lease_id uuid references public.leases(id) on delete set null;

create or replace function public.lease_move_room(p_lease uuid, p jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare l leases; r rooms; v_today date := (now() at time zone 'Asia/Jakarta')::date;
        v_room uuid := nullif(p->>'room_id', '')::uuid; v_date date := coalesce(nullif(p->>'date', '')::date, v_today);
        v_rent numeric; v_extra numeric := round(coalesce(nullif(p->>'extra', '')::numeric, 0)); v_next date; v_new uuid;
        v_old_code text; v_cancel int := 0; v_moved int := 0; v_dep numeric := 0; v_end date; v_reason text := nullif(trim(coalesce(p->>'reason', '')), '');
begin
  select * into l from leases where id = p_lease for update;
  if l.id is null or not member_in('rent', l.kos_id) then raise exception 'Sewa tidak ditemukan'; end if;
  if l.status <> 'aktif' then raise exception 'Sewa ini sudah berakhir'; end if;
  if v_room is null then raise exception 'Pilih kamar tujuan'; end if;
  if v_room = l.room_id then raise exception 'Kamar tujuan sama dengan kamar sekarang'; end if;
  select * into r from rooms where id = v_room and kos_id = l.kos_id for update;
  if r.id is null then raise exception 'Kamar tujuan tidak ditemukan'; end if;
  if r.status <> 'tersedia' then raise exception 'Kamar % sedang tidak tersedia (terisi atau tidak disewakan)', r.code; end if;
  if exists (select 1 from bookings where room_id = r.id and status = 'aktif') then
    raise exception 'Kamar % sudah dibooking (%). Pilih kamar lain atau batalkan booking-nya dulu.', r.code, (select name || ' · ' || number from bookings where room_id = r.id and status = 'aktif' limit 1); end if;
  if v_date < l.start_date then raise exception 'Tanggal pindah tidak boleh sebelum tanggal masuk (%)', to_char(l.start_date, 'DD-MM-YYYY'); end if;
  if v_date > v_today then raise exception 'Tanggal pindah belum tiba. Catat pindah kamar saat penghuni benar-benar pindah (kamar tujuan bisa dibooking dulu bila perlu dikunci).'; end if;
  v_rent := coalesce(nullif(p->>'rent', '')::numeric, r.rent, l.rent);
  if v_rent is null or v_rent <= 0 then raise exception 'Isi harga sewa kamar tujuan'; end if;
  if v_extra < 0 then raise exception 'Tagihan selisih tidak valid'; end if;
  select code into v_old_code from rooms where id = l.room_id;

  -- awal periode tagihan pertama yang dimulai pada/sesudah tanggal pindah (siklus lama dilanjutkan)
  select (l.billing_start + make_interval(months => g))::date into v_next from generate_series(0, 600) g
  where (l.billing_start + make_interval(months => g))::date >= v_date order by g limit 1;
  if v_next is null then v_next := v_date; end if;

  -- 1. tutup sewa lama (rencana selesai lama ikut berakhir)
  v_end := l.end_date;
  update leases set status = 'selesai', end_date = v_date,
    end_reason = 'Pindah ke kamar ' || r.code || coalesce(': ' || v_reason, '') where id = l.id;
  update rooms set status = 'tersedia' where id = l.room_id and status = 'terisi';
  update invoices i set status = 'batal', cancel_reason = 'Otomatis: pindah ke kamar ' || r.code
  where i.lease_id = l.id and i.kind = 'sewa' and i.status <> 'batal' and i.period_start >= v_date
    and not exists (select 1 from payments p where p.invoice_id = i.id and p.status in ('terverifikasi', 'menunggu'));
  get diagnostics v_cancel = row_count;

  -- 2. sewa baru (siklus tagihan dilanjutkan; rencana selesai lama dibawa bila masih di depan).
  --    Langsung insert (bukan start_lease) agar tagihan dibuat SESUDAH tagihan lunas dipindah — jumlah kamar terisi tidak berubah.
  insert into leases(kos_id, room_id, occupant_id, start_date, end_date, rent, billing_start, prev_lease_id)
  values (l.kos_id, r.id, l.occupant_id, v_date, case when v_end is not null and v_end > v_date then v_end end, v_rent, greatest(v_next, v_date), l.id)
  returning id into v_new;
  update rooms set status = 'terisi', rent = coalesce(rent, v_rent) where id = r.id;

  -- 3. tagihan yang sudah dibayar di muka pindah ke sewa baru (periode sama, harga lama tetap karena sudah dibayar)
  update invoices i set lease_id = v_new, room_id = r.id
  where i.lease_id = l.id and i.kind = 'sewa' and i.status <> 'batal' and i.period_start >= v_next;
  get diagnostics v_moved = row_count;
  perform generate_invoices(l.kos_id, 7);

  -- 4. deposit ikut pindah
  select coalesce(sum(case when kind = 'terima' then amount else -amount end), 0) into v_dep from deposits where lease_id = l.id and status = 'aktif';
  update deposits set lease_id = v_new where lease_id = l.id;

  -- 5. selisih harga bulan berjalan (opsional, ditentukan pemilik)
  if v_extra > 0 then
    insert into invoices(kos_id, lease_id, room_id, occupant_id, kind, period_start, period_end, due_date, amount, description)
    values (l.kos_id, v_new, r.id, l.occupant_id, 'tambahan', v_date, greatest(v_next - 1, v_date), v_today, v_extra,
      'Selisih sewa pindah kamar ' || v_old_code || ' → ' || r.code);
  end if;

  return jsonb_build_object('lease_id', v_new, 'from', v_old_code, 'to', r.code, 'next_period', greatest(v_next, v_date),
    'cancelled', v_cancel, 'moved_paid', v_moved, 'deposit', v_dep, 'extra', v_extra);
end $$;
revoke execute on function public.lease_move_room(uuid, jsonb) from public, anon;
grant execute on function public.lease_move_room(uuid, jsonb) to authenticated;
