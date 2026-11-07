-- Pendaftaran calon penghuni dari halaman kos (/b/[slug]):
-- calon penghuni mengisi data diri + kamar + Booking/Langsung huni + DP/Lunas (+ bukti transfer opsional)
-- → masuk Prospek (crm_leads.apply) → pemilik cek & Konfirmasi:
--   * Booking      → booking (data diri ikut, DP yang sudah diterima dicatat sebagai uang muka)
--   * Langsung huni → penghuni dibuat dari isian, sewa dimulai di kamar itu, tagihan terbit, pembayaran yang sudah masuk dicatat.
-- Pembayaran hanya dicatat bila pemilik menyatakan uangnya sudah masuk (bukti transfer bukan bukti sah sebelum dicek).

alter table public.crm_leads add column if not exists apply jsonb;
alter table public.bookings add column if not exists applicant jsonb;
alter table public.occupants add column if not exists address text;
alter table public.public_pages add column if not exists show_payment boolean not null default false;

alter table public.crm_leads drop constraint if exists crm_leads_ref_kind_check;
alter table public.crm_leads add constraint crm_leads_ref_kind_check check (ref_kind is null or ref_kind in ('booking', 'svc_order', 'sale', 'lease'));

-- bukti transfer dari formulir (gambar kecil, dikompres di HP). Dibaca hanya lewat lead_proof() oleh bagian sewa.
create table if not exists public.lead_proofs (
  lead_id uuid primary key references public.crm_leads(id) on delete cascade,
  kos_id uuid not null references public.kos(id) on delete cascade,
  image text not null check (length(image) <= 1500000 and image like 'data:image/%'),
  created_at timestamptz not null default now()
);
alter table public.lead_proofs enable row level security;
drop trigger if exists zz_kos_open_guard on public.lead_proofs;
create trigger zz_kos_open_guard before insert or update or delete on public.lead_proofs for each row execute function public.kos_open_guard();

create or replace function public.lead_proof(p_lead uuid)
returns text language plpgsql stable security definer set search_path = public as $$
declare v_kos uuid;
begin
  select kos_id into v_kos from crm_leads where id = p_lead;
  if v_kos is null or not member_in('rent', v_kos) then raise exception 'Tidak berwenang'; end if;
  return (select image from lead_proofs where lead_id = p_lead);
end $$;

-- rekening/QRIS di formulir pendaftaran: hanya bila pemilik mengizinkan (Halaman bisnis › Tampilkan cara bayar)
create or replace function public.public_page_set_payment(p_kos uuid, p_on boolean)
returns boolean language plpgsql security definer set search_path = public as $$
begin
  if not member_in('settings', p_kos) then raise exception 'Tidak berwenang'; end if;
  update public_pages set show_payment = coalesce(p_on, false), updated_at = now(), updated_by = actor_email() where kos_id = p_kos;
  if not found then raise exception 'Simpan halaman bisnis dulu'; end if;
  perform config_log(p_kos, 'halaman_cara_bayar', 'Cara bayar di formulir', null, to_jsonb(p_on), null, 'rendah', actor_email());
  return p_on;
end $$;

create or replace function public.public_pay_info(p_slug text)
returns jsonb language sql stable security definer set search_path = public as $$
  select case when pg.show_payment and pg.enabled and k.business_type = 'properti' then jsonb_build_object(
    'payment_info', k.payment_info, 'qris', k.qris_image, 'methods', k.profile->'payment_methods', 'rules', k.profile->>'payment_rules') end
  from public_pages pg join kos k on k.id = pg.kos_id where pg.slug = lower(p_slug);
$$;

-- formulir pendaftaran calon penghuni (kunci server)
create or replace function public.public_apply(p_slug text, p jsonb, p_ip_hash text, p_elapsed integer)
returns jsonb language plpgsql security definer set search_path = public as $$
declare pg public_pages; k kos; r rooms; v_day date := (now() at time zone 'Asia/Jakarta')::date;
        v_name text := left(trim(coalesce(p->>'name', '')), 80); v_ph text := regexp_replace(coalesce(p->>'phone', ''), '[^0-9]', '', 'g');
        v_addr text := left(trim(coalesce(p->>'address', '')), 300); v_em_name text := left(trim(coalesce(p->>'emergency_name', '')), 80);
        v_em_rel text := left(trim(coalesce(p->>'emergency_rel', '')), 40); v_em_ph text := regexp_replace(coalesce(p->>'emergency_phone', ''), '[^0-9]', '', 'g');
        v_mode text := p->>'mode'; v_plan text := p->>'pay_plan'; v_method text := p->>'pay_method'; v_amt numeric; v_date date; v_msg text;
        v_lead uuid; v_no text; v_ex crm_leads; v_proof text := nullif(p->>'proof', '');
begin
  select * into pg from public_pages where slug = lower(p_slug) and enabled;
  select * into k from kos where id = pg.kos_id;
  if pg.kos_id is null or k.closed_at is not null or k.setup_status <> 'active' or k.suspended_at is not null or not module_on(k.id, 'u_halaman') or not module_on(k.id, 'u_crm') then
    return jsonb_build_object('ok', false, 'error', 'Halaman ini sedang tidak menerima pendaftaran.'); end if;
  if k.business_type <> 'properti' then return jsonb_build_object('ok', false, 'error', 'Pendaftaran penghuni hanya untuk kos/properti.'); end if;
  if coalesce(p_elapsed, 0) < 5 then insert into public_submissions(kos_id, ip_hash, outcome) values (k.id, p_ip_hash, 'terlalu_cepat'); return jsonb_build_object('ok', false, 'error', 'Mohon isi formulir dengan lengkap lalu kirim lagi.'); end if;
  if (select count(*) from public_submissions where kos_id = k.id and ip_hash = p_ip_hash and created_at > now() - interval '1 hour') >= 5
     or (select count(*) from public_submissions where kos_id = k.id and created_at > now() - interval '1 day' and outcome = 'ok') >= 60 then
    insert into public_submissions(kos_id, ip_hash, outcome) values (k.id, p_ip_hash, 'dibatasi');
    return jsonb_build_object('ok', false, 'error', 'Terlalu banyak pendaftaran dari perangkat ini. Coba lagi nanti atau hubungi lewat WhatsApp.'); end if;
  -- data diri
  if length(v_name) < 2 then return jsonb_build_object('ok', false, 'error', 'Isi nama lengkap.'); end if;
  if length(v_ph) not between 9 and 15 then return jsonb_build_object('ok', false, 'error', 'Isi No. WhatsApp yang benar.'); end if;
  if length(v_addr) < 8 then return jsonb_build_object('ok', false, 'error', 'Isi alamat asal (jalan, desa/kelurahan, kota).'); end if;
  if length(v_em_name) < 2 or length(v_em_ph) not between 9 and 15 then return jsonb_build_object('ok', false, 'error', 'Isi nama dan No. HP kontak darurat.'); end if;
  if crm_phone(v_em_ph) = crm_phone(v_ph) then return jsonb_build_object('ok', false, 'error', 'No. kontak darurat harus nomor orang lain (keluarga/kerabat).'); end if;
  if not coalesce((p->>'consent')::boolean, false) then return jsonb_build_object('ok', false, 'error', 'Centang persetujuan penyimpanan data.'); end if;
  -- kamar & tanggal
  select * into r from rooms where id = nullif(p->>'room_id', '')::uuid and kos_id = k.id and status = 'tersedia' and pg.catalog_mode <> 'tidak';
  if r.id is null then return jsonb_build_object('ok', false, 'error', 'Kamar yang dipilih sudah tidak tersedia. Muat ulang halaman.'); end if;
  if v_mode not in ('booking', 'huni') then return jsonb_build_object('ok', false, 'error', 'Pilih Booking atau Langsung huni.'); end if;
  begin v_date := (p->>'date')::date; exception when others then v_date := null; end;
  if v_date is null then return jsonb_build_object('ok', false, 'error', 'Isi tanggal mulai tinggal.'); end if;
  if v_mode = 'huni' and (v_date < v_day or v_date > v_day + 7) then return jsonb_build_object('ok', false, 'error', 'Langsung huni: tanggal masuk hari ini sampai 7 hari ke depan. Lebih dari itu pilih Booking.'); end if;
  if v_mode = 'booking' and (v_date < v_day or v_date > v_day + 180) then return jsonb_build_object('ok', false, 'error', 'Tanggal booking paling lambat 6 bulan dari hari ini.'); end if;
  v_msg := booking_room_check(r.id, v_date, null);
  if v_msg is not null then return jsonb_build_object('ok', false, 'error', 'Kamar ' || r.code || ' tidak bisa untuk tanggal itu. Pilih kamar atau tanggal lain.'); end if;
  -- pembayaran (klaim pendaftar; dicek pemilik)
  if v_plan not in ('dp', 'lunas') then return jsonb_build_object('ok', false, 'error', 'Pilih bayar DP atau lunas.'); end if;
  if v_method not in ('transfer', 'ewallet', 'tunai') then return jsonb_build_object('ok', false, 'error', 'Pilih cara bayar.'); end if;
  if v_plan = 'lunas' then v_amt := r.rent;
  else
    v_amt := round(coalesce(nullif(regexp_replace(coalesce(p->>'pay_amount', ''), '[^0-9]', '', 'g'), '')::numeric, 0));
    if v_amt <= 0 then return jsonb_build_object('ok', false, 'error', 'Isi jumlah DP.'); end if;
    if r.rent is not null and v_amt >= r.rent then v_plan := 'lunas'; v_amt := r.rent; end if;
  end if;
  if v_proof is not null and (length(v_proof) > 1500000 or v_proof not like 'data:image/%') then return jsonb_build_object('ok', false, 'error', 'Foto bukti tidak valid atau terlalu besar.'); end if;
  -- kirim ulang dalam 10 menit = satu pendaftaran
  select * into v_ex from crm_leads where kos_id = k.id and source = 'halaman' and crm_phone(phone) = crm_phone(v_ph) and apply is not null and created_at > now() - interval '10 minutes' order by created_at desc limit 1;
  if v_ex.id is not null then return jsonb_build_object('ok', true, 'number', v_ex.number, 'duplicate', true, 'kos_id', k.id, 'lead_id', v_ex.id); end if;

  perform pg_advisory_xact_lock(hashtext('publik:' || k.id::text));
  v_no := 'PRM-' || to_char(v_day, 'YYMMDD') || '-' || lpad(((select count(*) from crm_leads where kos_id = k.id and number like 'PRM-' || to_char(v_day, 'YYMMDD') || '-%') + 1)::text, 3, '0');
  insert into crm_leads(kos_id, name, phone, need, source, est_value, items, consent_at, number, req_date, apply, created_by)
  values (k.id, v_name, v_ph,
    left((case v_mode when 'huni' then 'Langsung huni ' else 'Booking ' end) || 'kamar ' || r.code || ' mulai ' || to_char(v_date, 'DD-MM-YYYY')
      || ' · ' || case v_plan when 'lunas' then 'bayar lunas' else 'DP' end || ' Rp' || replace(to_char(v_amt, 'FM999,999,999'), ',', '.')
      || ' (' || case v_method when 'transfer' then 'transfer' when 'ewallet' then 'QRIS/e-wallet' else 'tunai saat datang' end || ')'
      || coalesce(' · ' || nullif(left(trim(coalesce(p->>'note', '')), 200), ''), ''), 500),
    'halaman', r.rent,
    jsonb_build_array(jsonb_build_object('id', r.id, 'name', coalesce(nullif(r.name, ''), 'Kamar ' || r.code), 'unit', 'bulan', 'qty', 1, 'price', r.rent)),
    now(), v_no, v_date,
    jsonb_build_object('mode', v_mode, 'room_id', r.id, 'room', r.code, 'date', v_date, 'address', v_addr,
      'emergency_name', v_em_name, 'emergency_rel', nullif(v_em_rel, ''), 'emergency_phone', v_em_ph,
      'pay_plan', v_plan, 'pay_amount', v_amt, 'pay_method', v_method, 'has_proof', v_proof is not null,
      'note', nullif(left(trim(coalesce(p->>'note', '')), 300), '')),
    null)
  returning id into v_lead;
  if v_proof is not null then insert into lead_proofs(lead_id, kos_id, image) values (v_lead, k.id, v_proof); end if;
  insert into crm_activities(kos_id, lead_id, kind, body, created_email)
  values (k.id, v_lead, 'tahap', 'Pendaftaran ' || v_no || ' dari halaman kos (' || case v_mode when 'huni' then 'langsung huni' else 'booking' end || ', kamar ' || r.code || ')', 'halaman bisnis');
  insert into public_submissions(kos_id, ip_hash, outcome) values (k.id, p_ip_hash, 'ok');
  return jsonb_build_object('ok', true, 'number', v_no, 'kos_id', k.id, 'lead_id', v_lead, 'business', k.name, 'room', r.code, 'mode', v_mode, 'amount', v_amt);
end $$;

-- Konfirmasi "Langsung huni": penghuni + sewa + tagihan + pembayaran yang sudah diterima, sekaligus (satu transaksi)
create or replace function public.lead_move_in(p_lead uuid, p jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare l crm_leads; a jsonb; v_room uuid; v_start date; v_rent numeric; v_occ uuid; v_lease uuid; v_inv record; v_paid numeric; v_pay uuid;
        v_method text; v_em text; v_code text; v_day date := (now() at time zone 'Asia/Jakarta')::date;
begin
  select * into l from crm_leads where id = p_lead for update;
  if l.id is null then raise exception 'Prospek tidak ditemukan'; end if;
  if not member_in('rent', l.kos_id) then raise exception 'Hanya pemilik/penjaga yang bisa memasukkan penghuni'; end if;
  if l.ref_id is not null then raise exception 'Pendaftaran ini sudah dikonfirmasi (%)', l.ref_number; end if;
  a := coalesce(l.apply, '{}');
  v_room := coalesce(nullif(p->>'room_id', '')::uuid, nullif(a->>'room_id', '')::uuid);
  v_start := coalesce(nullif(p->>'check_in', '')::date, nullif(a->>'date', '')::date, v_day);
  v_rent := coalesce(nullif(p->>'rent', '')::numeric, (select rent from rooms where id = v_room));
  if v_room is null or not exists (select 1 from rooms where id = v_room and kos_id = l.kos_id) then raise exception 'Pilih kamar'; end if;
  if v_rent is null or v_rent <= 0 then raise exception 'Isi harga sewa yang disepakati'; end if;
  if v_start > v_day + 7 then raise exception 'Tanggal masuk lebih dari 7 hari lagi — konfirmasi sebagai Booking'; end if;
  select code into v_code from rooms where id = v_room;
  v_em := nullif(concat_ws(' · ', nullif(concat_ws(' ', a->>'emergency_name', '(' || nullif(a->>'emergency_rel', '') || ')'), ''), a->>'emergency_phone'), '');
  insert into occupants(kos_id, name, phone, emergency, address, notes)
  values (l.kos_id, l.name, l.phone, v_em, nullif(a->>'address', ''), 'Dari pendaftaran ' || coalesce(l.number, 'halaman kos') || coalesce(' · ' || nullif(a->>'note', ''), ''))
  returning id into v_occ;
  v_lease := start_lease(v_room, v_occ, v_start, v_rent, v_start, nullif(p->>'end', '')::date);
  perform generate_invoices(l.kos_id, 7);
  -- pembayaran yang sudah diterima pemilik (setelah cek mutasi / uang tunai)
  v_paid := round(coalesce(nullif(p->>'paid_amount', '')::numeric, 0));
  if v_paid > 0 then
    v_method := case when p->>'paid_method' in ('tunai', 'transfer', 'ewallet') then p->>'paid_method' else 'transfer' end;
    select * into v_inv from invoice_summary where lease_id = v_lease and status <> 'batal' and outstanding > 0 order by due_date limit 1;
    if v_inv.id is null then raise exception 'Tagihan pertama belum terbit, pembayaran tidak bisa dicatat'; end if;
    if v_paid > v_inv.outstanding then raise exception 'Pembayaran Rp% melebihi tagihan pertama Rp%', replace(to_char(v_paid, 'FM999,999,999'), ',', '.'), replace(to_char(v_inv.outstanding, 'FM999,999,999'), ',', '.'); end if;
    v_pay := gen_random_uuid();
    insert into payments(id, kos_id, invoice_id, amount, paid_at, method, notes, status, verified_at, source, created_by)
    values (v_pay, l.kos_id, v_inv.id, v_paid, v_day, v_method, 'Dari pendaftaran ' || coalesce(l.number, ''), 'terverifikasi', now(), 'penghuni', auth.uid());
    insert into payment_proofs(payment_id, kos_id, image) select v_pay, l.kos_id, image from lead_proofs where lead_id = l.id;
  end if;
  update crm_leads set ref_kind = 'lease', ref_id = v_lease, ref_number = 'Kamar ' || v_code, stage = 'jadi', closed_at = now(), updated_at = now() where id = l.id;
  insert into crm_activities(kos_id, lead_id, kind, body, created_email)
  values (l.kos_id, l.id, 'tahap', 'Dikonfirmasi → penghuni kamar ' || v_code || ' mulai ' || to_char(v_start, 'DD-MM-YYYY')
    || case when v_paid > 0 then ' · bayar diterima Rp' || replace(to_char(v_paid, 'FM999,999,999'), ',', '.') else '' end, actor_email());
  return jsonb_build_object('kind', 'lease', 'id', v_lease, 'occupant_id', v_occ, 'number', 'Kamar ' || v_code, 'paid', v_paid);
end $$;
revoke all on function public.lead_move_in(uuid, jsonb), public.lead_proof(uuid), public.public_page_set_payment(uuid, boolean), public.public_apply(text, jsonb, text, integer) from public, anon;
grant execute on function public.lead_move_in(uuid, jsonb), public.lead_proof(uuid), public.public_page_set_payment(uuid, boolean) to authenticated;
grant execute on function public.public_apply(text, jsonb, text, integer) to service_role;
grant execute on function public.public_pay_info(text) to anon, authenticated;

create or replace function public._prasara_patch(p_sig text, p_old text, p_new text)
returns void language plpgsql as $$
declare d text;
begin
  d := pg_get_functiondef(p_sig::regprocedure);
  if position(p_old in d) = 0 then raise exception 'patch %: potongan tidak ditemukan', p_sig; end if;
  execute replace(d, p_old, p_new);
end $$;
-- lead_confirm: Langsung huni → lead_move_in; Booking → data diri ikut ke booking
select public._prasara_patch('public.lead_confirm(uuid,jsonb)',
  '  if k.business_type = ''properti'' then',
  '  if k.business_type = ''properti'' and coalesce(p->>''mode'', l.apply->>''mode'') = ''huni'' then
    return lead_move_in(l.id, p);
  end if;
  if k.business_type = ''properti'' then');
select public._prasara_patch('public.lead_confirm(uuid,jsonb)',
  '    update crm_leads set ref_kind = ''booking'', ref_id = v_id, ref_number = v->>''number'', updated_at = now() where id = l.id;',
  '    if l.apply is not null then update bookings set applicant = l.apply - ''has_proof'' where id = v_id; end if;
    update crm_leads set ref_kind = ''booking'', ref_id = v_id, ref_number = v->>''number'', updated_at = now() where id = l.id;');
-- check-in booking: penghuni baru membawa alamat & kontak darurat dari pendaftaran
select public._prasara_patch('public.booking_checkin(uuid,jsonb)',
  '    insert into occupants(kos_id, name, phone) values (b.kos_id, b.name, b.phone) returning id into v_occ;',
  '    insert into occupants(kos_id, name, phone, emergency, address, notes)
    values (b.kos_id, b.name, b.phone,
      nullif(concat_ws('' · '', nullif(concat_ws('' '', b.applicant->>''emergency_name'', ''('' || nullif(b.applicant->>''emergency_rel'', '''') || '')''), ''''), b.applicant->>''emergency_phone''), ''''),
      nullif(b.applicant->>''address'', ''''), case when b.applicant is not null then ''Dari booking '' || b.number end)
    returning id into v_occ;');
drop function public._prasara_patch(text, text, text);
