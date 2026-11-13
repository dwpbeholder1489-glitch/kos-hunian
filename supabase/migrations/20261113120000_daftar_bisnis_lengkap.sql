-- Pendaftaran bisnis lengkap: deskripsi, kontak, jam buka, nama pemilik, cara kelola, dan kebutuhan operasional
-- ikut tersimpan saat draf dibuat (tidak perlu diisi ulang), plus checklist persiapan setelah bisnis aktif.

create or replace function public._prasara_patch(p_sig text, p_old text, p_new text)
returns void language plpgsql as $$
declare d text;
begin
  d := pg_get_functiondef(p_sig::regprocedure);
  if position(p_old in d) = 0 then raise exception 'patch %: potongan tidak ditemukan', p_sig; end if;
  execute replace(d, p_old, p_new);
end $$;

create or replace function public.setup_need_codes()
returns text[] language sql immutable as $$
  select array['penjualan', 'pembelian', 'stok', 'keuangan', 'pelanggan', 'karyawan', 'cabang'];
$$;

-- Isian tambahan (semua opsional) → kos.contact_phone, kos.profile (description, hours), kos.setup_meta (owner_name, managed, needs)
select public._prasara_patch('public.setup_create(jsonb)', 'returning id into v_id;', 'returning id into v_id;
  if coalesce(p->>''phone'', '''') <> '''' and regexp_replace(p->>''phone'', ''[^0-9]'', '''', ''g'') !~ ''^[0-9]{8,15}$'' then raise exception ''Nomor kontak bisnis tidak valid (8–15 angka)''; end if;
  if coalesce(nullif(p->>''managed'', ''''), ''sendiri'') not in (''sendiri'', ''tim'') then raise exception ''Pilih dikelola sendiri atau bersama tim''; end if;
  if p ? ''needs'' and jsonb_typeof(p->''needs'') = ''array'' and exists (select 1 from jsonb_array_elements_text(p->''needs'') x where x <> all (setup_need_codes())) then raise exception ''Ada kebutuhan yang tidak dikenal''; end if;
  update kos set
    contact_phone = nullif(regexp_replace(coalesce(p->>''phone'', ''''), ''[^0-9+]'', '''', ''g''), ''''),
    profile = coalesce(profile, ''{}'') || jsonb_strip_nulls(jsonb_build_object(
      ''description'', nullif(left(trim(coalesce(p->>''description'', '''')), 300), ''''),
      ''hours'', nullif(left(trim(coalesce(p->>''hours'', '''')), 120), ''''))),
    setup_meta = setup_meta || jsonb_strip_nulls(jsonb_build_object(
      ''owner_name'', nullif(left(trim(coalesce(p->>''owner_name'', '''')), 80), ''''),
      ''managed'', coalesce(nullif(p->>''managed'', ''''), ''sendiri''),
      ''needs'', case when jsonb_typeof(p->''needs'') = ''array'' then p->''needs'' end))
  where id = v_id;');

-- Checklist persiapan: dihitung dari data nyata; tiap butir punya tujuan (href); butir bisa dilewati sementara
create or replace function public.setup_checklist(p_kos uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare k kos; v_type text; v_kul boolean; v_skip jsonb; v jsonb := '[]';
begin
  if not member_in('settings', p_kos) then raise exception 'Khusus pemilik atau pengelola'; end if;
  select * into k from kos where id = p_kos;
  v_type := coalesce(k.business_type, 'properti'); v_kul := k.template_code = 'kuliner';
  v_skip := coalesce(k.setup_meta->'checklist_skip', '[]');
  v := jsonb_build_array(
    jsonb_build_object('code', 'profil', 'label', 'Lengkapi profil bisnis', 'hint', 'Alamat, nomor kontak, dan jam buka', 'href', '/pengaturan', 'optional', false,
      'done', k.contact_phone is not null and k.address is not null),
    jsonb_build_object('code', 'modul', 'label', 'Periksa konfigurasi modul', 'hint', 'Setujui atau ubah yang disiapkan PRASARA', 'href', '/konfirmasi', 'optional', false,
      'done', coalesce(k.setup_status, 'active') = 'active'),
    jsonb_build_object('code', 'isi', 'optional', false,
      'label', case v_type when 'properti' then 'Masukkan kamar atau unit' when 'retail' then 'Masukkan barang' when 'jasa' then case when v_kul then 'Masukkan menu' else 'Masukkan layanan' end else 'Isi data pertama' end,
      'hint', case v_type when 'properti' then 'Nama kamar dan harga sewa' when 'retail' then 'Nama, satuan, dan harga jual' when 'jasa' then 'Nama dan harga' else 'Catatan pertama di bisnis Anda' end,
      'href', case v_type when 'properti' then '/kamar' when 'retail' then '/barang' when 'jasa' then '/layanan' else '/catatan' end,
      'done', case v_type when 'properti' then exists (select 1 from rooms where kos_id = p_kos) when 'retail' then exists (select 1 from products where kos_id = p_kos)
                when 'jasa' then exists (select 1 from svc_services where kos_id = p_kos) else exists (select 1 from bb_records where kos_id = p_kos) end),
    jsonb_build_object('code', 'bayar', 'label', 'Atur cara pembayaran', 'hint', 'Rekening atau metode yang Anda terima', 'href', case when v_type = 'properti' then '/pengaturan' else '/konfirmasi' end, 'optional', false,
      'done', k.payment_info is not null or coalesce(jsonb_typeof(k.profile->'payment_methods') = 'array', false)),
    jsonb_build_object('code', 'karyawan', 'label', 'Tambahkan karyawan', 'hint', 'Hanya bila Anda dibantu orang lain', 'href', '/karyawan', 'optional', true,
      'done', (select count(*) from kos_members where kos_id = p_kos and active) > 1));
  if v_type <> 'kustom' then
    v := v || jsonb_build_array(jsonb_build_object('code', 'transaksi', 'optional', false,
      'label', case v_type when 'properti' then 'Catat pembayaran sewa pertama' when 'retail' then 'Catat penjualan pertama' else 'Catat pesanan pertama' end,
      'hint', 'Lihat panduan langkah demi langkah di tombol ? pada halamannya',
      'href', case v_type when 'properti' then '/tagihan' when 'retail' then '/kasir' else '/pesanan' end,
      'done', case v_type when 'properti' then exists (select 1 from payments where kos_id = p_kos) when 'retail' then exists (select 1 from sales where kos_id = p_kos)
                else exists (select 1 from svc_orders where kos_id = p_kos) end));
  end if;
  return jsonb_build_object('active', coalesce(k.setup_status, 'active') = 'active', 'hidden', coalesce((k.setup_meta->>'checklist_hidden')::boolean, false),
    'items', (select jsonb_agg(x || jsonb_build_object('skipped', v_skip ? (x->>'code')) order by ord) from jsonb_array_elements(v) with ordinality t(x, ord)));
end $$;

-- p_code = butir yang dilewati/dibuka lagi; p_code = 'semua' menyembunyikan/menampilkan seluruh checklist
create or replace function public.setup_checklist_skip(p_kos uuid, p_code text, p_skip boolean)
returns void language plpgsql security definer set search_path = public as $$
declare v jsonb;
begin
  if not member_in('settings', p_kos) then raise exception 'Khusus pemilik atau pengelola'; end if;
  if p_code not in ('semua', 'profil', 'modul', 'isi', 'bayar', 'karyawan', 'transaksi') then raise exception 'Butir tidak dikenal'; end if;
  perform set_config('prasara.setup_ok', '1', true);
  if p_code = 'semua' then
    update kos set setup_meta = coalesce(setup_meta, '{}') || jsonb_build_object('checklist_hidden', coalesce(p_skip, true)) where id = p_kos;
  else
    select coalesce(setup_meta->'checklist_skip', '[]') into v from kos where id = p_kos;
    v := (select coalesce(jsonb_agg(x), '[]') from jsonb_array_elements_text(v) x where x <> p_code);
    if coalesce(p_skip, true) then v := v || to_jsonb(p_code); end if;
    update kos set setup_meta = coalesce(setup_meta, '{}') || jsonb_build_object('checklist_skip', v) where id = p_kos;
  end if;
end $$;

revoke execute on function public.setup_need_codes(), public.setup_checklist(uuid), public.setup_checklist_skip(uuid, text, boolean) from public, anon;
grant execute on function public.setup_checklist(uuid), public.setup_checklist_skip(uuid, text, boolean) to authenticated;

drop function public._prasara_patch(text, text, text);
