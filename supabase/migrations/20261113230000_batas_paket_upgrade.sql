-- Batas paket V2 §4.2 + UX setelah upgrade §10 + trigger cabang §6.2/§6.3.
--  1) Batas baru di plan_versions.limits: produk (produk/layanan aktif), pelanggan, supplier, cabang, ekspor_bulan.
--     Dicek di database saat MEMBUAT data baru atau MENGAKTIFKAN lagi; data lama tidak pernah dihapus/dinonaktifkan.
--     Masukan tanpa pengguna (halaman publik dengan kunci server) dan setup otomatis tidak dibatasi.
--  2) export_take: kuota ekspor laporan per bulan (Asia/Jakarta), tercatat di export_log.
--  3) kuota_status ikut menampilkan batas baru (peringatan 80%/100%).
--  4) upgrade_notice / upgrade_notice_seen: "Upgrade Berhasil!" setelah pembayaran terverifikasi.
--  5) Growth: konteks 'cabang' (BRANCH.CREATE_REQUESTED / BRANCH.LIMIT_REACHED).

-- ---------- 1) Batas awal (bisa diubah Super Admin lewat Paket & harga) ----------
update public.plan_versions v set limits = v.limits || x.l
from (values
  ('gratis', '{"produk": 100, "pelanggan": 500, "supplier": 100, "cabang": 1}'::jsonb),
  ('dasar',  '{"produk": 100, "pelanggan": 500, "supplier": 100, "cabang": 1, "ekspor_bulan": 10}'::jsonb),
  ('bisnis', '{"produk": 1000, "pelanggan": 5000, "supplier": 1000, "cabang": 3, "ekspor_bulan": 100}'::jsonb),
  ('pro',    '{"produk": 5000, "pelanggan": 20000, "supplier": 5000, "cabang": 10, "ekspor_bulan": 500}'::jsonb)
) as x(k, l)
where v.plan_key = x.k and v.id = (public.plan_current(x.k)).id;

-- Dikecualikan: sistem/halaman publik (tanpa pengguna) dan setup otomatis
create or replace function public.limit_exempt()
returns boolean language sql stable security definer set search_path = public as $$
  select auth.uid() is null or coalesce(current_setting('prasara.setup_ok', true), '') = '1';
$$;

create or replace function public.limit_plan_name(p_kos uuid)
returns text language sql stable security definer set search_path = public as $$
  select coalesce((select name from plans where key = kos_plan(p_kos)), 'ini');
$$;

-- Cabang terpakai = cabang aktif (termasuk lokasi utama, juga bila barisnya belum dibuat)
create or replace function public.branch_cabang_used(p_kos uuid, p_except uuid default null)
returns int language sql stable security definer set search_path = public as $$
  select (select count(*) from branches where kos_id = p_kos and kind = 'cabang' and active and id is distinct from p_except)::int
       + case when exists (select 1 from branches where kos_id = p_kos and is_main) then 0 else 1 end;
$$;

-- Produk & layanan aktif (toko memakai products, jasa/kuliner memakai svc_services)
create or replace function public.limit_produk_guard()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_lim int; v_used int;
begin
  if limit_exempt() or not new.active then return new; end if;
  if tg_op = 'UPDATE' and old.active then return new; end if;            -- hanya pembuatan baru / aktif lagi
  v_lim := plan_limit(new.kos_id, 'produk');
  if v_lim is null then return new; end if;
  v_used := (select count(*) from products where kos_id = new.kos_id and active and id <> new.id)
          + (select count(*) from svc_services where kos_id = new.kos_id and active and id <> new.id);
  if v_used >= v_lim then
    raise exception 'BATAS_PAKET: Paket % maksimal % produk/layanan aktif. Nonaktifkan yang tidak dipakai, atau upgrade paket di Langganan.', limit_plan_name(new.kos_id), v_lim;
  end if;
  return new;
end $$;
drop trigger if exists limit_produk on public.products;
create trigger limit_produk before insert or update of active on public.products for each row execute function public.limit_produk_guard();
drop trigger if exists limit_produk on public.svc_services;
create trigger limit_produk before insert or update of active on public.svc_services for each row execute function public.limit_produk_guard();

-- Pelanggan & supplier (kontak yang tidak diarsipkan)
create or replace function public.limit_kontak_guard()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_lim int; v_used int;
begin
  if limit_exempt() or new.archived_at is not null then return new; end if;
  if tg_op = 'UPDATE' and old.archived_at is null and old.kind = new.kind then return new; end if;
  v_lim := plan_limit(new.kos_id, new.kind);
  if v_lim is null then return new; end if;
  v_used := (select count(*) from contacts where kos_id = new.kos_id and kind = new.kind and archived_at is null and id <> new.id);
  if v_used >= v_lim then
    raise exception 'BATAS_PAKET: Paket % maksimal % %. Arsipkan yang tidak dipakai, atau upgrade paket di Langganan.', limit_plan_name(new.kos_id), v_lim, new.kind;
  end if;
  return new;
end $$;
drop trigger if exists limit_kontak on public.contacts;
create trigger limit_kontak before insert or update of archived_at, kind on public.contacts for each row execute function public.limit_kontak_guard();

-- Cabang (gudang tidak dihitung; lokasi utama selalu boleh)
create or replace function public.limit_cabang_guard()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_lim int;
begin
  if limit_exempt() or new.is_main or new.kind <> 'cabang' or not new.active then return new; end if;
  if tg_op = 'UPDATE' and old.kind = 'cabang' and old.active then return new; end if;
  v_lim := plan_limit(new.kos_id, 'cabang');
  if v_lim is null then return new; end if;
  if branch_cabang_used(new.kos_id, new.id) >= v_lim then
    raise exception 'BATAS_PAKET: Paket % maksimal % cabang (termasuk lokasi utama). Gudang tidak dihitung. Upgrade paket di Langganan untuk menambah cabang.', limit_plan_name(new.kos_id), v_lim;
  end if;
  return new;
end $$;
drop trigger if exists limit_cabang on public.branches;
create trigger limit_cabang before insert or update of kind, active on public.branches for each row execute function public.limit_cabang_guard();

-- ---------- 2) Kuota ekspor laporan per bulan ----------
create table if not exists public.export_log (
  id uuid primary key default gen_random_uuid(),
  kos_id uuid not null references public.kos(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  kind text not null check (char_length(kind) between 2 and 40),
  created_at timestamptz not null default now()
);
create index if not exists export_log_kos on public.export_log(kos_id, created_at desc);
alter table public.export_log enable row level security;   -- tanpa policy: hanya lewat fungsi
drop trigger if exists zz_kos_open_guard on public.export_log;
create trigger zz_kos_open_guard before insert or update or delete on public.export_log
  for each row execute function public.kos_open_guard();

create or replace function public.export_month_used(p_kos uuid)
returns int language sql stable security definer set search_path = public as $$
  select count(*)::int from export_log
  where kos_id = p_kos and created_at >= (date_trunc('month', now() at time zone 'Asia/Jakarta') at time zone 'Asia/Jakarta');
$$;

-- Sisa kuota (hanya baca) agar tombol ekspor bisa dikunci sebelum diketuk
create or replace function public.export_quota(p_kos uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_lim int; v_used int; k kos;
begin
  if auth.uid() is null or not is_member_any(p_kos) then raise exception 'Tidak punya akses ke bisnis ini'; end if;
  select * into k from kos where id = p_kos;
  if k.closed_at is not null or coalesce(k.setup_status, 'active') <> 'active' then
    return jsonb_build_object('allowed', true, 'used', null, 'limit', null);
  end if;
  if not plan_has(p_kos, 'ekspor') then
    return jsonb_build_object('allowed', false, 'used', 0, 'limit', 0, 'message', 'Ekspor laporan tersedia mulai Paket Dasar.');
  end if;
  v_lim := plan_limit(p_kos, 'ekspor_bulan');
  v_used := export_month_used(p_kos);
  return jsonb_build_object('allowed', v_lim is null or v_used < v_lim, 'used', v_used, 'limit', v_lim,
    'message', case when v_lim is not null and v_used >= v_lim then
      format('Paket %s maksimal %s ekspor laporan per bulan. Kuota terisi lagi tanggal 1, atau upgrade paket di Langganan.', limit_plan_name(p_kos), v_lim) end);
end $$;

create or replace function public.export_take(p_kos uuid, p_kind text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_lim int; v_used int; k kos;
begin
  if auth.uid() is null or not is_member_any(p_kos) then raise exception 'Tidak punya akses ke bisnis ini'; end if;
  select * into k from kos where id = p_kos;
  -- Arsip (bisnis ditutup) & draf: ekspor tetap boleh, tidak dihitung (data milik pemilik, tidak boleh dikunci)
  if k.closed_at is not null or coalesce(k.setup_status, 'active') <> 'active' then return jsonb_build_object('used', null, 'limit', null); end if;
  if not plan_has(p_kos, 'ekspor') then raise exception 'BATAS_PAKET: Ekspor laporan tersedia mulai Paket Dasar.'; end if;
  perform pg_advisory_xact_lock(hashtext('ekspor:' || p_kos::text));
  v_lim := plan_limit(p_kos, 'ekspor_bulan');
  v_used := export_month_used(p_kos);
  if v_lim is not null and v_used >= v_lim then
    raise exception 'BATAS_PAKET: Paket % maksimal % ekspor laporan per bulan (sudah %). Kuota terisi lagi tanggal 1, atau upgrade paket di Langganan.', limit_plan_name(p_kos), v_lim, v_used;
  end if;
  insert into export_log(kos_id, user_id, kind) values (p_kos, auth.uid(), left(coalesce(nullif(trim(p_kind), ''), 'laporan'), 40));
  return jsonb_build_object('used', v_used + 1, 'limit', v_lim);
end $$;

-- ---------- 3) Kuota: tambah batas baru ----------
create or replace function public.kuota_status(p_kos uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v jsonb := '[]'::jsonb; lim int; used numeric; t text := (select business_type from kos where id = p_kos);
begin
  if not member_in('team', p_kos) then raise exception 'Khusus pemilik bisnis'; end if;

  lim := team_limit(p_kos);
  if lim is not null and lim < 1000 then
    v := v || jsonb_build_array(jsonb_build_object('key', 'karyawan', 'label', 'Akun karyawan', 'used', team_used(p_kos), 'limit', lim));
  end if;

  lim := plan_limit(p_kos, 'kamar_terisi');
  if lim is not null then
    used := (select count(*) from leases where kos_id = p_kos and status = 'aktif');
    v := v || jsonb_build_array(jsonb_build_object('key', 'kamar_terisi', 'label', 'Kamar terisi', 'used', used, 'limit', lim));
  end if;

  lim := plan_limit(p_kos, 'lampiran_mb');
  if lim is not null then
    used := round(att_usage(p_kos) / 1048576.0, 1);
    v := v || jsonb_build_array(jsonb_build_object('key', 'lampiran_mb', 'label', 'Ruang foto & lampiran (MB)', 'used', used, 'limit', lim));
  end if;

  if t in ('retail', 'jasa') then
    lim := plan_limit(p_kos, 'produk');
    if lim is not null then
      used := (select count(*) from products where kos_id = p_kos and active) + (select count(*) from svc_services where kos_id = p_kos and active);
      v := v || jsonb_build_array(jsonb_build_object('key', 'produk', 'label', 'Produk/layanan aktif', 'used', used, 'limit', lim));
    end if;
    lim := plan_limit(p_kos, 'pelanggan');
    if lim is not null then
      used := (select count(*) from contacts where kos_id = p_kos and kind = 'pelanggan' and archived_at is null);
      v := v || jsonb_build_array(jsonb_build_object('key', 'pelanggan', 'label', 'Pelanggan', 'used', used, 'limit', lim));
    end if;
    lim := plan_limit(p_kos, 'supplier');
    if lim is not null then
      used := (select count(*) from contacts where kos_id = p_kos and kind = 'supplier' and archived_at is null);
      v := v || jsonb_build_array(jsonb_build_object('key', 'supplier', 'label', 'Supplier', 'used', used, 'limit', lim));
    end if;
  end if;

  if t = 'retail' then
    lim := plan_limit(p_kos, 'cabang');
    if lim is not null then
      v := v || jsonb_build_array(jsonb_build_object('key', 'cabang', 'label', 'Cabang', 'used', branch_cabang_used(p_kos), 'limit', lim));
    end if;
  end if;

  lim := plan_limit(p_kos, 'ekspor_bulan');
  if lim is not null and plan_has(p_kos, 'ekspor') then
    v := v || jsonb_build_array(jsonb_build_object('key', 'ekspor_bulan', 'label', 'Ekspor laporan bulan ini', 'used', export_month_used(p_kos), 'limit', lim));
  end if;

  return (select coalesce(jsonb_agg(x || jsonb_build_object('pct', floor(100 * (x->>'used')::numeric / nullif((x->>'limit')::numeric, 0))::int)), '[]'::jsonb)
          from jsonb_array_elements(v) x);
end $$;

-- ---------- 4) "Upgrade Berhasil!" (hanya setelah aktivasi tercatat = pembayaran terverifikasi) ----------
alter table public.plan_activations add column if not exists owner_seen_at timestamptz;
update public.plan_activations set owner_seen_at = created_at where owner_seen_at is null;   -- aktivasi lama tidak dimunculkan

create or replace function public.upgrade_notice(p_kos uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare a plan_activations; v_before text; v_new plan_versions; v_old plan_versions; v_amount numeric;
begin
  if auth.uid() is null or not _growth_owner(p_kos) then return null; end if;
  select * into a from plan_activations
   where kos_id = p_kos and months > 0 and owner_seen_at is null and created_at > now() - interval '30 days'
   order by created_at desc limit 1;
  if a.id is null then return null; end if;
  v_before := coalesce(nullif(a.before->>'berlaku', ''), free_plan());
  v_new := plan_current(a.plan);
  v_old := plan_current(v_before);
  select amount into v_amount from plan_requests where id = a.invoice_id;
  return jsonb_build_object(
    'id', a.id, 'jenis', case when v_before = a.plan then 'perpanjang' else 'upgrade' end,
    'plan', a.plan, 'plan_name', (select name from plans where key = a.plan),
    'before_plan', v_before, 'before_name', (select name from plans where key = v_before),
    'months', a.months, 'active_until', a.active_until, 'amount', v_amount,
    'limits', coalesce(v_new.limits, '{}'::jsonb), 'limits_before', coalesce(v_old.limits, '{}'::jsonb),
    'fitur_baru', (select coalesce(jsonb_agg(f), '[]'::jsonb) from unnest(coalesce(v_new.features, '{}')) f
                   where not (f = any (coalesce(v_old.features, '{}')))));
end $$;

create or replace function public.upgrade_notice_seen(p_kos uuid, p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or not _growth_owner(p_kos) then raise exception 'Khusus pemilik bisnis'; end if;
  update plan_activations set owner_seen_at = now() where id = p_id and kos_id = p_kos and owner_seen_at is null;
end $$;

-- ---------- 5) Growth: konteks cabang ----------
alter table public.growth_rules drop constraint if exists growth_rules_context_check;
alter table public.growth_rules add constraint growth_rules_context_check
  check (context in ('karyawan', 'portal', 'umum', 'aktivitas', 'cabang'));

insert into public.growth_rules(id, name, context, kind, from_plan, to_plan, to_months, title, message, cta, cta_secondary, priority, frequency_days, general, updated_by)
values
  ('UPGRADE.BRANCH.LIMIT', 'Tambah cabang melebihi batas paket (Dasar)', 'cabang', 'upgrade', 'dasar', 'bisnis', 1,
   'Bisnis Anda siap membuka cabang.',
   'Paket Dasar mencakup satu lokasi usaha. Upgrade ke Paket Bisnis untuk mengelola hingga 3 cabang, lengkap dengan stok dan kas per lokasi.',
   'Upgrade ke Paket Bisnis', 'Tetap menggunakan Paket Dasar', 10, 7, false, 'sistem'),
  ('UPGRADE.BRANCH.PRO', 'Batas cabang Paket Bisnis tercapai', 'cabang', 'upgrade', 'bisnis', 'pro', 1,
   'Cabang Anda terus bertambah.',
   'Anda sudah memakai seluruh kapasitas cabang Paket Bisnis. Paket Pro menampung hingga 10 cabang untuk bisnis multi-cabang.',
   'Upgrade ke Paket Pro', 'Nanti saja', 15, 14, false, 'sistem')
on conflict (id) do nothing;

create or replace function public._prasara_patch(p_sig text, p_old text, p_new text)
returns void language plpgsql as $$
declare d text;
begin
  d := pg_get_functiondef(p_sig::regprocedure);
  if position(p_old in d) = 0 then raise exception 'patch % : potongan tidak ditemukan: %', p_sig, left(p_old, 80); end if;
  execute replace(d, p_old, p_new);
end $$;

-- growth_offer: cabang hanya ditawarkan saat batas cabang sudah penuh
select public._prasara_patch('public.growth_offer(uuid,text,text)',
  '    elsif v_r.context = ''aktivitas'' and v_r.trigger_event = ''TRANSAKSI.PERTAMA'' then',
  '    elsif v_r.context = ''cabang'' then
      v_used := branch_cabang_used(p_kos); v_lim := plan_limit(p_kos, ''cabang'');
      if v_lim is null or v_used < v_lim then continue; end if;
    elsif v_r.context = ''aktivitas'' and v_r.trigger_event = ''TRANSAKSI.PERTAMA'' then');
select public._prasara_patch('public.growth_offer(uuid,text,text)',
  '''karyawan_batas_baru'', (select (plan_current(v_r.to_plan)).limits ->> ''karyawan'')::int',
  '''karyawan_batas_baru'', (select (plan_current(v_r.to_plan)).limits ->> ''karyawan'')::int,
      ''cabang_dipakai'', case when v_r.context = ''cabang'' then v_used end,
      ''cabang_batas'', case when v_r.context = ''cabang'' then v_lim end,
      ''cabang_batas_baru'', (select (plan_current(v_r.to_plan)).limits ->> ''cabang'')::int');
select public._prasara_patch('public.growth_rule_save(text,jsonb)',
  'if v_new.context not in (''karyawan'', ''portal'', ''umum'', ''aktivitas'') then',
  'if v_new.context not in (''karyawan'', ''portal'', ''umum'', ''aktivitas'', ''cabang'') then');
drop function public._prasara_patch(text, text, text);

-- ---------- Hak akses ----------
revoke execute on function public.limit_exempt(), public.limit_plan_name(uuid), public.branch_cabang_used(uuid, uuid),
  public.export_month_used(uuid) from public, anon, authenticated;
revoke execute on function public.export_take(uuid, text), public.export_quota(uuid), public.upgrade_notice(uuid), public.upgrade_notice_seen(uuid, uuid) from public, anon;
grant execute on function public.export_take(uuid, text), public.export_quota(uuid), public.upgrade_notice(uuid), public.upgrade_notice_seen(uuid, uuid) to authenticated;
