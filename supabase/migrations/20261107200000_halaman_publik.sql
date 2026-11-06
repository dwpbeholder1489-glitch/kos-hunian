-- Halaman bisnis publik (blueprint 24, Phase 1 — Public Presence & Lead MVP):
-- profil publik yang disetujui pemilik, katalog sederhana (tanpa harga modal/stok persis), tautan yang bisa dibagikan,
-- formulir permintaan → menjadi Prospek di CRM (bukan penjualan final), anti-spam, persetujuan data, jejak audit.
-- Plus: laba rugi per lokasi di Pembukuan (dimensi lokasi diambil dari dokumen sumber jurnal).

create or replace function public._prasara_patch(p_sig text, p_old text, p_new text)
returns void language plpgsql as $$
declare d text;
begin
  d := pg_get_functiondef(p_sig::regprocedure);
  if position(p_old in d) = 0 then raise exception 'patch % : potongan tidak ditemukan: %', p_sig, left(p_old, 80); end if;
  execute replace(d, p_old, p_new);
end $$;

create table if not exists public.public_pages (
  kos_id uuid primary key references public.kos(id) on delete cascade,
  slug text not null unique check (slug ~ '^[a-z0-9]([a-z0-9-]{1,38}[a-z0-9])$'),
  enabled boolean not null default false,
  tagline text check (length(tagline) <= 120),
  about text check (length(about) <= 1000),
  address text check (length(address) <= 200),
  hours text check (length(hours) <= 200),
  wa_phone text check (length(wa_phone) <= 20),
  catalog_mode text not null default 'favorit' check (catalog_mode in ('semua', 'favorit', 'tidak')),
  show_prices boolean not null default true,
  policy text check (length(policy) <= 1000),
  form_intro text check (length(form_intro) <= 300),
  email_notify boolean not null default true,
  published_at timestamptz,
  updated_at timestamptz not null default now(),
  updated_by text
);
alter table public.public_pages enable row level security;
drop policy if exists public_pages_select on public.public_pages;
create policy public_pages_select on public.public_pages for select using (public.member_can(kos_id, 'settings'));
grant select on public.public_pages to authenticated;
drop trigger if exists zz_kos_open_guard on public.public_pages;
create trigger zz_kos_open_guard before insert or update or delete on public.public_pages for each row execute function public.kos_open_guard();

create table if not exists public.public_submissions (
  id bigserial primary key,
  kos_id uuid not null references public.kos(id) on delete cascade,
  ip_hash text not null,
  outcome text not null,
  created_at timestamptz not null default now()
);
create index if not exists public_submissions_kos on public.public_submissions(kos_id, created_at);
alter table public.public_submissions enable row level security;  -- tanpa policy: hanya fungsi server

alter table public.crm_leads add column if not exists items jsonb;
alter table public.crm_leads add column if not exists consent_at timestamptz;
alter table public.crm_leads add column if not exists number text;
alter table public.crm_leads drop constraint if exists crm_leads_source_check;
alter table public.crm_leads add constraint crm_leads_source_check check (source in ('wa', 'datang', 'telepon', 'rekomendasi', 'media_sosial', 'lainnya', 'halaman'));

insert into public.modules(code, name, description, applies_to, core, depends_on, entitlement, paths, data_used, status, sort)
values ('u_halaman', 'Halaman bisnis & formulir', 'Tautan publik berisi profil, katalog/kamar tersedia, dan formulir permintaan yang masuk ke Prospek.', '{properti,retail}', false, '{u_crm}', null, '{/halaman}',
        'Profil publik yang Anda isi; nama, No. HP, dan pesan dari pengunjung', 'available', 26)
on conflict (code) do nothing;
insert into public.business_modules(kos_id, module_code, active, updated_by) select id, 'u_halaman', true, 'sistem' from public.kos on conflict do nothing;

-- Pemilik menyimpan & menerbitkan halaman (informasi publik harus disetujui pemilik)
create or replace function public.public_page_save(p_kos uuid, p jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare v_old public_pages; v_slug text := lower(trim(coalesce(p->>'slug', ''))); v_on boolean := coalesce((p->>'enabled')::boolean, false);
begin
  if not member_can(p_kos, 'team') then raise exception 'Hanya pemilik yang bisa mengubah dan menerbitkan halaman bisnis'; end if;
  if not module_on(p_kos, 'u_halaman') then raise exception 'Modul Halaman bisnis sedang nonaktif. Aktifkan di Pusat konfigurasi.'; end if;
  if v_slug !~ '^[a-z0-9]([a-z0-9-]{1,38}[a-z0-9])$' then raise exception 'Alamat halaman 3–40 huruf kecil/angka/tanda minus, tanpa spasi'; end if;
  if v_slug in ('admin', 'api', 'masuk', 'mulai', 'panduan', 'bantuan', 'prasara', 'login', 'daftar', 'toko', 'kos', 'demo', 'contoh', 'www', 'app') then raise exception 'Alamat "%" tidak boleh dipakai', v_slug; end if;
  if exists (select 1 from public_pages where slug = v_slug and kos_id <> p_kos) then raise exception 'Alamat "%" sudah dipakai bisnis lain', v_slug; end if;
  if v_on and (select closed_at from kos where id = p_kos) is not null then raise exception 'Bisnis ditutup tidak bisa diterbitkan'; end if;
  select * into v_old from public_pages where kos_id = p_kos;
  insert into public_pages(kos_id, slug, enabled, tagline, about, address, hours, wa_phone, catalog_mode, show_prices, policy, form_intro, email_notify, published_at, updated_at, updated_by)
  values (p_kos, v_slug, v_on, nullif(trim(p->>'tagline'), ''), nullif(trim(p->>'about'), ''), nullif(trim(p->>'address'), ''), nullif(trim(p->>'hours'), ''),
          nullif(regexp_replace(coalesce(p->>'wa_phone', ''), '[^0-9+]', '', 'g'), ''), coalesce(p->>'catalog_mode', 'favorit'), coalesce((p->>'show_prices')::boolean, true),
          nullif(trim(p->>'policy'), ''), nullif(trim(p->>'form_intro'), ''), coalesce((p->>'email_notify')::boolean, true), case when v_on then now() end, now(), actor_email())
  on conflict (kos_id) do update set slug = excluded.slug, enabled = excluded.enabled, tagline = excluded.tagline, about = excluded.about, address = excluded.address,
    hours = excluded.hours, wa_phone = excluded.wa_phone, catalog_mode = excluded.catalog_mode, show_prices = excluded.show_prices, policy = excluded.policy,
    form_intro = excluded.form_intro, email_notify = excluded.email_notify, published_at = case when excluded.enabled and not public_pages.enabled then now() when excluded.enabled then public_pages.published_at end,
    updated_at = now(), updated_by = excluded.updated_by;
  perform config_log(p_kos, case when v_on and not coalesce(v_old.enabled, false) then 'terbitkan_halaman' when not v_on and coalesce(v_old.enabled, false) then 'sembunyikan_halaman' else 'ubah_halaman' end,
    v_slug, case when v_old.kos_id is null then null else to_jsonb(v_old) - 'kos_id' - 'updated_at' - 'updated_by' end, p, null, case when v_on then 'menengah' else 'rendah' end, actor_email());
end $$;

-- Data publik: hanya yang boleh dilihat pengunjung (tanpa harga modal, margin, stok persis, catatan staf)
create or replace function public.public_page_view(p_slug text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare pg public_pages; k kos;
begin
  select * into pg from public_pages where slug = lower(p_slug) and enabled;
  if pg.kos_id is null then return null; end if;
  select * into k from kos where id = pg.kos_id;
  if k.closed_at is not null or k.suspended_at is not null or not module_on(k.id, 'u_halaman') or not module_on(k.id, 'u_crm') then return null; end if;
  return jsonb_build_object(
    'slug', pg.slug, 'name', k.name, 'type', k.business_type, 'tagline', pg.tagline, 'about', pg.about, 'address', coalesce(pg.address, k.address), 'hours', pg.hours,
    'wa_phone', pg.wa_phone, 'policy', pg.policy, 'form_intro', pg.form_intro, 'show_prices', pg.show_prices, 'updated_at', pg.updated_at,
    'items', case
      when pg.catalog_mode = 'tidak' then '[]'::jsonb
      when k.business_type = 'retail' then (select coalesce(jsonb_agg(jsonb_build_object('id', p.id, 'name', p.name,
          'available', p.stock > 0,
          'units', (select jsonb_agg(jsonb_build_object('name', u.name, 'price', case when pg.show_prices then u.price_retail end) order by u.sort, u.qty) from product_units u where u.product_id = p.id))
          order by p.name), '[]') from products p where p.kos_id = k.id and p.active and (pg.catalog_mode = 'semua' or p.favorite))
      else (select coalesce(jsonb_agg(jsonb_build_object('id', r.id, 'name', coalesce(nullif(r.name, ''), 'Kamar ' || r.code), 'code', r.code,
          'available', true, 'facilities', r.facilities, 'units', jsonb_build_array(jsonb_build_object('name', 'bulan', 'price', case when pg.show_prices then r.rent end))) order by r.code), '[]')
        from rooms r where r.kos_id = k.id and r.status = 'tersedia') end);
end $$;

-- Kiriman formulir: dipanggil HANYA oleh server aplikasi (kunci rahasia) agar pembatasan per perangkat tidak bisa dipalsukan
create or replace function public.public_submit(p_slug text, p_name text, p_phone text, p_message text, p_items jsonb, p_consent boolean, p_ip_hash text, p_elapsed int)
returns jsonb language plpgsql security definer set search_path = public as $$
declare pg public_pages; k kos; v_ph text := regexp_replace(coalesce(p_phone, ''), '[^0-9]', '', 'g'); v_items jsonb := '[]'; x jsonb; v_q numeric; v_name text; v_lead uuid; v_no text;
        v_dup text; v_need text; v_day date := (now() at time zone 'Asia/Jakarta')::date; v_ex crm_leads;
begin
  select * into pg from public_pages where slug = lower(p_slug) and enabled;
  select * into k from kos where id = pg.kos_id;
  if pg.kos_id is null or k.closed_at is not null or k.suspended_at is not null or not module_on(k.id, 'u_halaman') or not module_on(k.id, 'u_crm') then
    return jsonb_build_object('ok', false, 'error', 'Halaman ini sedang tidak menerima permintaan.'); end if;
  -- anti-spam
  if coalesce(p_elapsed, 0) < 3 then insert into public_submissions(kos_id, ip_hash, outcome) values (k.id, p_ip_hash, 'terlalu_cepat'); return jsonb_build_object('ok', false, 'error', 'Mohon isi formulir dengan lengkap lalu kirim lagi.'); end if;
  if (select count(*) from public_submissions where kos_id = k.id and ip_hash = p_ip_hash and created_at > now() - interval '1 hour') >= 5
     or (select count(*) from public_submissions where kos_id = k.id and created_at > now() - interval '1 day' and outcome = 'ok') >= 60 then
    insert into public_submissions(kos_id, ip_hash, outcome) values (k.id, p_ip_hash, 'dibatasi');
    return jsonb_build_object('ok', false, 'error', 'Terlalu banyak permintaan. Coba lagi nanti atau hubungi lewat WhatsApp.'); end if;
  -- validasi
  if coalesce(length(trim(p_name)), 0) not between 2 and 80 then return jsonb_build_object('ok', false, 'error', 'Isi nama Anda (2–80 huruf).'); end if;
  if length(v_ph) not between 9 and 15 then return jsonb_build_object('ok', false, 'error', 'Isi nomor WhatsApp yang benar.'); end if;
  if coalesce(length(p_message), 0) > 500 then return jsonb_build_object('ok', false, 'error', 'Pesan terlalu panjang (maks. 500 huruf).'); end if;
  if not coalesce(p_consent, false) then return jsonb_build_object('ok', false, 'error', 'Centang persetujuan agar kami bisa menghubungi Anda.'); end if;
  if jsonb_typeof(coalesce(p_items, '[]')) <> 'array' or jsonb_array_length(coalesce(p_items, '[]')) > 30 then return jsonb_build_object('ok', false, 'error', 'Pilihan barang tidak valid.'); end if;
  for x in select * from jsonb_array_elements(coalesce(p_items, '[]')) loop
    v_q := round(coalesce((x->>'qty')::numeric, 0), 3);
    if v_q <= 0 or v_q > 9999 then return jsonb_build_object('ok', false, 'error', 'Jumlah barang tidak valid.'); end if;
    if k.business_type = 'retail' then
      select p.name into v_name from products p where p.id = (x->>'id')::uuid and p.kos_id = k.id and p.active and (pg.catalog_mode = 'semua' or p.favorite) and pg.catalog_mode <> 'tidak';
      if v_name is null or not exists (select 1 from product_units u where u.product_id = (x->>'id')::uuid and u.name = x->>'unit') then return jsonb_build_object('ok', false, 'error', 'Barang yang dipilih tidak tersedia lagi. Muat ulang halaman.'); end if;
      v_items := v_items || jsonb_build_object('id', x->>'id', 'name', v_name, 'unit', x->>'unit', 'qty', v_q,
        'price', case when pg.show_prices then (select price_retail from product_units u where u.product_id = (x->>'id')::uuid and u.name = x->>'unit') end);
    else
      select coalesce(nullif(r.name, ''), 'Kamar ' || r.code) into v_name from rooms r where r.id = (x->>'id')::uuid and r.kos_id = k.id and r.status = 'tersedia' and pg.catalog_mode <> 'tidak';
      if v_name is null then return jsonb_build_object('ok', false, 'error', 'Kamar yang dipilih sudah tidak tersedia. Muat ulang halaman.'); end if;
      v_items := v_items || jsonb_build_object('id', x->>'id', 'name', v_name, 'unit', 'bulan', 'qty', v_q, 'price', case when pg.show_prices then (select rent from rooms where id = (x->>'id')::uuid) end);
    end if;
  end loop;
  if jsonb_array_length(v_items) = 0 and coalesce(length(trim(p_message)), 0) < 3 then return jsonb_build_object('ok', false, 'error', 'Pilih barang/kamar atau tulis kebutuhan Anda.'); end if;
  -- kirim ulang yang sama dalam 10 menit dianggap satu permintaan
  select * into v_ex from crm_leads where kos_id = k.id and source = 'halaman' and crm_phone(phone) = crm_phone(v_ph) and created_at > now() - interval '10 minutes' order by created_at desc limit 1;
  if v_ex.id is not null then return jsonb_build_object('ok', true, 'number', v_ex.number, 'duplicate', true); end if;

  v_need := left(concat_ws(' · ', nullif(trim(coalesce(p_message, '')), ''),
              (select string_agg((i->>'name') || ' ' || trim(to_char((i->>'qty')::numeric, 'FM999990.###')) || ' ' || (i->>'unit'), ', ') from jsonb_array_elements(v_items) i)), 500);
  perform pg_advisory_xact_lock(hashtext('publik:' || k.id::text));
  v_no := 'PRM-' || to_char(v_day, 'YYMMDD') || '-' || lpad(((select count(*) from crm_leads where kos_id = k.id and number like 'PRM-' || to_char(v_day, 'YYMMDD') || '-%') + 1)::text, 3, '0');
  insert into crm_leads(kos_id, name, phone, need, source, est_value, items, consent_at, number, created_by)
  values (k.id, trim(p_name), v_ph, v_need, 'halaman',
          nullif((select sum((i->>'qty')::numeric * (i->>'price')::numeric) from jsonb_array_elements(v_items) i where i->>'price' is not null), 0), v_items, now(), v_no, null)
  returning id into v_lead;
  select name into v_dup from contacts where kos_id = k.id and archived_at is null and crm_phone(phone) = crm_phone(v_ph) limit 1;
  insert into crm_activities(kos_id, lead_id, kind, body, created_email)
  values (k.id, v_lead, 'tahap', 'Permintaan ' || v_no || ' dari halaman bisnis' || coalesce(' · No. HP sama dengan pelanggan ' || v_dup, ''), 'halaman bisnis');
  insert into public_submissions(kos_id, ip_hash, outcome) values (k.id, p_ip_hash, 'ok');
  return jsonb_build_object('ok', true, 'number', v_no, 'kos_id', k.id, 'lead_id', v_lead, 'business', k.name);
end $$;

create or replace function public.public_page_stats(p_kos uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if not member_in('settings', p_kos) then raise exception 'Tidak punya akses'; end if;
  return jsonb_build_object(
    'd30', (select count(*) from crm_leads where kos_id = p_kos and source = 'halaman' and created_at > now() - interval '30 days'),
    'baru', (select count(*) from crm_leads where kos_id = p_kos and source = 'halaman' and stage = 'baru'),
    'jadi30', (select count(*) from crm_leads where kos_id = p_kos and source = 'halaman' and stage = 'jadi' and created_at > now() - interval '30 days'),
    'ditolak7', (select count(*) from public_submissions where kos_id = p_kos and outcome <> 'ok' and created_at > now() - interval '7 days'));
end $$;

-- ================= Pembukuan: laba rugi per lokasi =================
create or replace function public.acct_line_branch(p_type text, p_id uuid)
returns uuid language sql stable security definer set search_path = public as $$
  select case p_type
    when 'sale' then (select branch_id from sales where id = p_id)
    when 'return' then (select s.branch_id from sale_returns r join sales s on s.id = r.sale_id where r.id = p_id)
    when 'purchase' then (select branch_id from purchases where id = p_id)
    when 'purchase_return' then (select b.branch_id from purchase_returns r join purchases b on b.id = r.purchase_id where r.id = p_id)
    when 'stock_move' then (select branch_id from stock_moves where id = p_id)
    when 'expense' then (select branch_id from expenses where id = p_id)
    when 'cash_entry' then (select branch_id from cash_entries where id = p_id)
    when 'debt_payment' then (select branch_id from debt_payments where id = p_id)
  end;
$$;
select public._prasara_patch('public.acct_report(uuid,boolean,date,date)',
  '''recon'', v_recon,',
  '''recon'', v_recon,
    ''per_lokasi'', case when (select count(*) from branches where kos_id = any(v_ids)) > 1 then (
      select coalesce(jsonb_agg(z order by z.lokasi), ''[]'') from (
        select coalesce(b.name, ''Bersama / tanpa lokasi'') as lokasi,
          round(-sum(l.debit - l.credit) filter (where a.type = ''pendapatan''), 2) as pendapatan,
          round(sum(l.debit - l.credit) filter (where a.sys_key = ''hpp''), 2) as hpp,
          round(sum(l.debit - l.credit) filter (where a.type = ''beban'' and a.sys_key <> ''hpp''), 2) as beban,
          round(-sum(l.debit - l.credit) filter (where a.type in (''pendapatan'', ''beban'')), 2) as laba
        from acct_lines l join acct_accounts a on a.id = l.account_id join acct_entries e on e.id = l.entry_id
        left join branches b on b.id = acct_line_branch(l.source_type, l.source_id)
        where l.kos_id = any(v_ids) and e.entry_date between p_from and p_to and a.type in (''pendapatan'', ''beban'')
        group by 1) z) end,');

revoke execute on function public.acct_line_branch(text, uuid), public.public_submit(text, text, text, text, jsonb, boolean, text, int) from public, anon, authenticated;
grant execute on function public.public_submit(text, text, text, text, jsonb, boolean, text, int) to service_role;
revoke execute on function public.public_page_save(uuid, jsonb), public.public_page_stats(uuid) from public, anon;
grant execute on function public.public_page_save(uuid, jsonb), public.public_page_stats(uuid) to authenticated;
grant execute on function public.public_page_view(text) to anon, authenticated;

drop function public._prasara_patch(text, text, text);
