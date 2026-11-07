-- Permintaan dari Halaman bisnis: cek otomatis (kamar kosong / stok cukup / harga sama / No. HP ganda)
-- lalu pemilik cukup menekan Konfirmasi:
--   kos   → booking kamar (booking_create, terhubung ke prospek)
--   jasa  → pesanan jasa (svc_order_create, harga dihitung server)
--   toko  → keranjang Kasir terisi; prospek "Jadi" setelah penjualan tersimpan (lead_mark_sold)
-- Semua lewat fungsi lama yang sudah memeriksa hak akses & aturan; tidak ada jalan pintas.

alter table public.crm_leads add column if not exists req_date date;          -- tanggal yang diminta pengunjung (mulai sewa / jemput)
alter table public.crm_leads add column if not exists ref_kind text;
alter table public.crm_leads add column if not exists ref_id uuid;
alter table public.crm_leads add column if not exists ref_number text;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'crm_leads_ref_kind_check') then
    alter table public.crm_leads add constraint crm_leads_ref_kind_check check (ref_kind is null or ref_kind in ('booking', 'svc_order', 'sale'));
  end if;
end $$;

-- Dipanggil server formulir (kunci server) tepat setelah public_submit
create or replace function public.lead_set_req(p_lead uuid, p_date date)
returns void language sql security definer set search_path = public as $$
  update crm_leads set req_date = p_date
  where id = p_lead and source = 'halaman' and created_at > now() - interval '5 minutes'
    and p_date between (now() at time zone 'Asia/Jakarta')::date - 1 and (now() at time zone 'Asia/Jakarta')::date + 366;
$$;
revoke all on function public.lead_set_req(uuid, date) from public, anon, authenticated;
grant execute on function public.lead_set_req(uuid, date) to service_role;

create or replace function public.lead_check(p_lead uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare l crm_leads; k kos; c jsonb := '[]'; x jsonb; v_today date := (now() at time zone 'Asia/Jakarta')::date; v_in date;
        r rooms; v_msg text; v_rooms jsonb := '[]'; v_first jsonb; v_months int; v_txt text; v_n int;
        s svc_services; v_lines jsonb := '[]'; v_priced jsonb; v_total numeric := 0; v_bad_line boolean := false;
        p products; u product_units; v_need numeric; v_cart jsonb := '[]'; v_kind text; v_prop jsonb;
begin
  select * into l from crm_leads where id = p_lead;
  if l.id is null then raise exception 'Prospek tidak ditemukan'; end if;
  perform crm_guard(l.kos_id);
  select * into k from kos where id = l.kos_id;
  if l.ref_id is not null then
    return jsonb_build_object('kind', l.ref_kind, 'verdict', 'selesai', 'done', jsonb_build_object('kind', l.ref_kind, 'id', l.ref_id, 'number', l.ref_number), 'checks',
      jsonb_build_array(jsonb_build_object('level', 'ok', 'text', 'Sudah dikonfirmasi: ' || coalesce(l.ref_number, '') ||
        coalesce(' · status ' || case l.ref_kind when 'booking' then (select status from bookings where id = l.ref_id) when 'svc_order' then (select status from svc_orders where id = l.ref_id) end, ''))));
  end if;
  if l.stage in ('jadi', 'batal') then
    c := c || jsonb_build_object('level', 'bad', 'text', 'Prospek ini sudah ditutup (' || case l.stage when 'jadi' then 'Jadi' else 'Tidak jadi' end || '). Buka lagi bila ingin memproses.');
  end if;
  if coalesce(jsonb_array_length(l.items), 0) = 0 then
    c := c || jsonb_build_object('level', 'bad', 'text', 'Pengunjung tidak memilih ' || case k.business_type when 'retail' then 'barang' when 'jasa' then 'layanan' else 'kamar' end || ' — balas lewat WhatsApp untuk menanyakan kebutuhannya.');
  end if;
  if crm_phone(l.phone) is null then
    c := c || jsonb_build_object('level', 'warn', 'text', 'No. WhatsApp kosong/tidak valid.');
  else
    select string_agg(number, ', ') into v_txt from crm_leads where kos_id = l.kos_id and id <> l.id and source = 'halaman' and stage not in ('jadi', 'batal')
      and crm_phone(phone) = crm_phone(l.phone) and created_at > now() - interval '14 days';
    if v_txt is not null then c := c || jsonb_build_object('level', 'warn', 'text', 'Nomor ini juga mengirim permintaan lain: ' || v_txt || ' (mungkin dobel).'); end if;
  end if;

  if k.business_type = 'properti' then
    v_kind := 'booking';
    v_in := coalesce(l.req_date, v_today);
    if l.req_date is null then c := c || jsonb_build_object('level', 'warn', 'text', 'Tanggal masuk tidak diisi pengunjung — dipakai hari ini; ubah di bawah bila perlu.');
    elsif l.req_date < v_today then v_in := v_today; c := c || jsonb_build_object('level', 'warn', 'text', 'Tanggal masuk yang diminta (' || to_char(l.req_date, 'DD-MM-YYYY') || ') sudah lewat — dipakai hari ini.');
    else c := c || jsonb_build_object('level', 'ok', 'text', 'Rencana masuk ' || to_char(l.req_date, 'DD-MM-YYYY') || '.'); end if;
    v_n := 0;
    for x in select * from jsonb_array_elements(coalesce(l.items, '[]')) loop
      select * into r from rooms where id = nullif(x->>'id', '')::uuid and kos_id = l.kos_id;
      if r.id is null then c := c || jsonb_build_object('level', 'bad', 'text', coalesce(x->>'name', 'Kamar') || ' sudah tidak ada.'); continue; end if;
      v_n := v_n + 1;
      v_msg := case when r.status = 'perbaikan' then 'Kamar ' || r.code || ' sedang dalam perbaikan.' else booking_room_check(r.id, v_in, null) end;
      if v_msg is null then c := c || jsonb_build_object('level', 'ok', 'text', 'Kamar ' || r.code || ' kosong untuk tanggal masuk ' || to_char(v_in, 'DD-MM-YYYY') || '.');
      else c := c || jsonb_build_object('level', 'room_bad', 'text', v_msg); end if;
      if x->>'price' is not null and r.rent is distinct from (x->>'price')::numeric then
        c := c || jsonb_build_object('level', 'warn', 'text', 'Harga sewa ' || r.code || ' sekarang Rp' || replace(to_char(coalesce(r.rent, 0), 'FM999,999,999'), ',', '.') || ' (saat dikirim Rp' || replace(to_char((x->>'price')::numeric, 'FM999,999,999'), ',', '.') || ').');
      elsif r.rent is not null then
        c := c || jsonb_build_object('level', 'ok', 'text', 'Harga sewa ' || r.code || ' Rp' || replace(to_char(r.rent, 'FM999,999,999'), ',', '.') || '/bulan' || case when x->>'price' is not null then ' (sama dengan di halaman).' else '.' end);
      end if;
      v_rooms := v_rooms || jsonb_build_object('id', r.id, 'code', r.code, 'rent', r.rent, 'ok', v_msg is null, 'months', greatest(1, round(coalesce((x->>'qty')::numeric, 1)))::int);
    end loop;
    -- kamar yang tidak bisa = penghalang hanya bila tidak ada satu pun kamar pilihan yang bisa
    select jsonb_agg(case when e->>'level' = 'room_bad' then jsonb_set(e, '{level}', to_jsonb(case when exists (select 1 from jsonb_array_elements(v_rooms) z where (z->>'ok')::boolean) then 'warn' else 'bad' end)) else e end)
      into c from jsonb_array_elements(c) e;
    c := coalesce(c, '[]');
    if v_n > 1 then c := c || jsonb_build_object('level', 'warn', 'text', 'Memilih ' || v_n || ' kamar. Konfirmasi membuat booking untuk satu kamar (pilih di bawah).'); end if;
    if crm_phone(l.phone) is not null then
      select string_agg(o.name || ' (kamar ' || rm.code || ')', ', ') into v_txt from occupants o join leases ls on ls.occupant_id = o.id and ls.status = 'aktif' join rooms rm on rm.id = ls.room_id
      where o.kos_id = l.kos_id and crm_phone(o.phone) = crm_phone(l.phone);
      if v_txt is not null then c := c || jsonb_build_object('level', 'warn', 'text', 'No. HP sama dengan penghuni aktif: ' || v_txt || '.'); end if;
      select string_agg(number, ', ') into v_txt from bookings where kos_id = l.kos_id and status = 'aktif' and crm_phone(phone) = crm_phone(l.phone);
      if v_txt is not null then c := c || jsonb_build_object('level', 'warn', 'text', 'Sudah ada booking aktif dengan No. HP ini: ' || v_txt || '.'); end if;
    end if;
    select e into v_first from jsonb_array_elements(v_rooms) e order by (e->>'ok')::boolean desc limit 1;
    v_prop := jsonb_build_object('rooms', v_rooms, 'room_id', v_first->>'id', 'check_in', v_in, 'rent', v_first->'rent', 'months', coalesce((v_first->>'months')::int, 1));

  elsif k.business_type = 'jasa' then
    v_kind := 'svc_order';
    for x in select * from jsonb_array_elements(coalesce(l.items, '[]')) loop
      select * into s from svc_services where id = nullif(x->>'id', '')::uuid and kos_id = l.kos_id;
      if s.id is null or not s.active then c := c || jsonb_build_object('level', 'bad', 'text', 'Layanan ' || coalesce(x->>'name', '') || ' sudah tidak tersedia.'); v_bad_line := true; continue; end if;
      if x->>'price' is not null and s.price <> (x->>'price')::numeric then
        c := c || jsonb_build_object('level', 'warn', 'text', 'Harga ' || s.name || ' sekarang Rp' || replace(to_char(s.price, 'FM999,999,999'), ',', '.') || '/' || s.unit || ' (saat dikirim Rp' || replace(to_char((x->>'price')::numeric, 'FM999,999,999'), ',', '.') || ').');
      end if;
      if (x->>'qty')::numeric < s.min_qty then
        c := c || jsonb_build_object('level', 'warn', 'text', s.name || ': minta ' || trim(to_char((x->>'qty')::numeric, 'FM999990.###')) || ' ' || s.unit || ', ditagih minimal ' || trim(to_char(s.min_qty, 'FM999990.###')) || ' ' || s.unit || '.');
      end if;
      v_lines := v_lines || jsonb_build_object('service_id', s.id, 'qty', (x->>'qty')::numeric);
    end loop;
    if jsonb_array_length(v_lines) > 0 and not v_bad_line then
      v_priced := svc_price_lines(l.kos_id, v_lines);
      v_total := (select sum((e->>'line_total')::numeric) from jsonb_array_elements(v_priced) e);
      c := c || jsonb_build_object('level', 'ok', 'text', 'Layanan tersedia. Perkiraan total Rp' || replace(to_char(v_total, 'FM999,999,999'), ',', '.') || ' (berat/jumlah pasti diisi saat barang diterima).');
    end if;
    if crm_phone(l.phone) is not null then
      select name into v_txt from contacts where kos_id = l.kos_id and kind = 'pelanggan' and archived_at is null and crm_phone(phone) = crm_phone(l.phone) limit 1;
      c := c || jsonb_build_object('level', 'ok', 'text', case when v_txt is null then 'Pelanggan baru — otomatis ditambahkan ke daftar pelanggan.' else 'Pelanggan lama: ' || v_txt || '.' end);
    end if;
    v_prop := jsonb_build_object('lines', coalesce(v_priced, '[]'), 'total', v_total, 'date', l.req_date);
    if l.req_date is not null then c := c || jsonb_build_object('level', 'ok', 'text', 'Tanggal diminta: ' || to_char(l.req_date, 'DD-MM-YYYY') || '.'); end if;

  elsif k.business_type = 'retail' then
    v_kind := 'kasir';
    for x in select * from jsonb_array_elements(coalesce(l.items, '[]')) loop
      select * into p from products where id = nullif(x->>'id', '')::uuid and kos_id = l.kos_id;
      select * into u from product_units where product_id = p.id and name = x->>'unit';
      if p.id is null or not p.active or u.id is null then c := c || jsonb_build_object('level', 'bad', 'text', coalesce(x->>'name', 'Barang') || ' (' || coalesce(x->>'unit', '') || ') sudah tidak dijual.'); continue; end if;
      v_need := (x->>'qty')::numeric * u.qty;
      if p.stock >= v_need then
        c := c || jsonb_build_object('level', 'ok', 'text', p.name || ' ' || trim(to_char((x->>'qty')::numeric, 'FM999990.###')) || ' ' || u.name || ': stok cukup.');
      else
        c := c || jsonb_build_object('level', 'warn', 'text', p.name || ': diminta ' || trim(to_char(v_need, 'FM999990.###')) || ' ' || p.base_unit || ', stok tercatat ' || trim(to_char(greatest(p.stock, 0), 'FM999990.###')) || ' ' || p.base_unit || '.');
      end if;
      if x->>'price' is not null and u.price_retail <> (x->>'price')::numeric then
        c := c || jsonb_build_object('level', 'warn', 'text', 'Harga ' || p.name || '/' || u.name || ' sekarang Rp' || replace(to_char(u.price_retail, 'FM999,999,999'), ',', '.') || ' (saat dikirim Rp' || replace(to_char((x->>'price')::numeric, 'FM999,999,999'), ',', '.') || ').');
      end if;
      v_cart := v_cart || jsonb_build_object('product_id', p.id, 'name', p.name, 'unit', u.name, 'unit_qty', u.qty, 'qty', (x->>'qty')::numeric, 'price', u.price_retail);
      v_total := v_total + (x->>'qty')::numeric * u.price_retail;
    end loop;
    v_prop := jsonb_build_object('cart', v_cart, 'total', v_total);
  end if;

  return jsonb_build_object('kind', v_kind, 'checks', c, 'proposal', v_prop,
    'verdict', case when exists (select 1 from jsonb_array_elements(c) e where e->>'level' = 'bad') then 'tidak_bisa'
                    when exists (select 1 from jsonb_array_elements(c) e where e->>'level' = 'warn') then 'perlu_cek' else 'cocok' end);
end $$;

-- Konfirmasi (kos → booking, jasa → pesanan). Toko memakai Kasir + lead_mark_sold.
create or replace function public.lead_confirm(p_lead uuid, p jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare l crm_leads; k kos; v_id uuid := gen_random_uuid(); v jsonb; v_lines jsonb; v_contact uuid;
begin
  select * into l from crm_leads where id = p_lead for update;
  if l.id is null then raise exception 'Prospek tidak ditemukan'; end if;
  perform crm_guard(l.kos_id);
  if l.ref_id is not null then raise exception 'Permintaan ini sudah dikonfirmasi (%)', l.ref_number; end if;
  if l.stage in ('jadi', 'batal') then raise exception 'Prospek sudah ditutup. Buka lagi dulu bila ingin memproses.'; end if;
  select * into k from kos where id = l.kos_id;
  if k.business_type = 'properti' then
    if not exists (select 1 from jsonb_array_elements(coalesce(l.items, '[]')) e where e->>'id' = p->>'room_id') and coalesce(jsonb_array_length(l.items), 0) > 0
       and not coalesce((p->>'other_room')::boolean, false) then
      raise exception 'Kamar berbeda dari yang diminta. Centang "kamar lain" bila memang sudah disepakati.';
    end if;
    v := booking_create(v_id, l.kos_id, jsonb_build_object('room_id', p->>'room_id', 'check_in', p->>'check_in', 'rent', p->>'rent', 'months', p->>'months',
      'name', l.name, 'phone', l.phone, 'lead_id', l.id, 'expires_on', p->>'expires_on', 'dp_amount', p->>'dp_amount', 'dp_account', p->>'dp_account',
      'note', 'Dari permintaan ' || coalesce(l.number, 'halaman bisnis')));
    update crm_leads set ref_kind = 'booking', ref_id = v_id, ref_number = v->>'number', updated_at = now() where id = l.id;
    return jsonb_build_object('kind', 'booking', 'id', v_id, 'number', v->>'number');
  elsif k.business_type = 'jasa' then
    select jsonb_agg(jsonb_build_object('service_id', e->>'id', 'qty', (e->>'qty')::numeric)) into v_lines from jsonb_array_elements(coalesce(l.items, '[]')) e;
    if v_lines is null then raise exception 'Permintaan ini tidak memilih layanan. Buat pesanan manual di menu Pesanan.'; end if;
    v := svc_order_create(v_id, l.kos_id, jsonb_build_object('name', l.name, 'phone', l.phone, 'lines', v_lines,
      'pickup', coalesce((p->>'pickup')::boolean, false), 'deliver', coalesce((p->>'deliver')::boolean, false), 'address', p->>'address',
      'delivery_fee', coalesce(nullif(p->>'delivery_fee', '')::numeric, 0),
      'note', left(concat_ws(' · ', 'Dari permintaan ' || coalesce(l.number, 'halaman bisnis'), nullif(trim(coalesce(p->>'note', '')), '')), 300)));
    select contact_id into v_contact from svc_orders where id = v_id;
    update crm_leads set ref_kind = 'svc_order', ref_id = v_id, ref_number = v->>'number', stage = 'jadi', closed_at = now(), updated_at = now(),
      contact_id = coalesce(contact_id, v_contact) where id = l.id;
    insert into crm_activities(kos_id, lead_id, contact_id, kind, body, created_email)
    values (l.kos_id, l.id, v_contact, 'tahap', 'Dikonfirmasi → pesanan ' || (v->>'number') || ' · total Rp' || replace(to_char((v->>'total')::numeric, 'FM999,999,999'), ',', '.') || ' · Tahap: ' || l.stage || ' → jadi', actor_email());
    return jsonb_build_object('kind', 'svc_order', 'id', v_id, 'number', v->>'number', 'total', v->'total');
  elsif k.business_type = 'retail' then
    if not member_in('sell', l.kos_id) then raise exception 'Hanya kasir/pemilik yang bisa memproses penjualan'; end if;
    update crm_leads set stage = case when stage in ('baru', 'dihubungi') then 'penawaran' else stage end, updated_at = now() where id = l.id;
    insert into crm_activities(kos_id, lead_id, kind, body, created_email) values (l.kos_id, l.id, 'catatan', 'Dikonfirmasi — diproses di Kasir', actor_email());
    return jsonb_build_object('kind', 'kasir');
  end if;
  raise exception 'Konfirmasi otomatis belum tersedia untuk jenis bisnis ini';
end $$;

-- Toko: setelah penjualan dari permintaan tersimpan di Kasir → prospek Jadi & terhubung ke penjualan
create or replace function public.lead_mark_sold(p_lead uuid, p_sale uuid)
returns void language plpgsql security definer set search_path = public as $$
declare l crm_leads; sl sales;
begin
  select * into l from crm_leads where id = p_lead;
  select * into sl from sales where id = p_sale;
  if l.id is null or sl.id is null or sl.kos_id <> l.kos_id then raise exception 'Data tidak cocok'; end if;
  if not member_in('sell', l.kos_id) then raise exception 'Tidak punya akses'; end if;
  if l.ref_id is not null then return; end if;
  if l.stage <> 'jadi' then perform crm_lead_stage(l.id, 'jadi', 'Penjualan ' || sl.number); end if;
  update crm_leads set ref_kind = 'sale', ref_id = sl.id, ref_number = sl.number, updated_at = now() where id = l.id;
end $$;

