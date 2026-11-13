-- Growth Trigger Engine (Master Prompt V2 §6–8, §12–13).
--  • growth_rules  : aturan penawaran upgrade/tahunan. Dikelola Super Admin tanpa ubah kode (kampanye).
--  • growth_log    : catatan tampil / ditolak / diklik / checkout per bisnis (data untuk analitik & frekuensi).
--  • growth_offer  : SATU-SATUNYA penentu penawaran untuk pemilik (server membaca paket & batas terbaru).
--  • growth_track  : mencatat interaksi pemilik.
--  • growth_rules_list / growth_rule_save / growth_analytics : Management Center (audit lewat admin_log).
-- Frekuensi (V2 §8): satu pop-up umum tiap 7 hari; penawaran yang sudah tampil/ditolak tidak diulang sebelum
-- frequency_days habis. Pembayaran TIDAK diaktifkan dari sini (tetap lewat plan_activate).

-- 1) Aturan penawaran ------------------------------------------------------------
create table if not exists public.growth_rules (
  id text primary key check (id ~ '^[A-Z0-9_.]{3,60}$'),
  name text not null check (char_length(name) between 3 and 120),
  context text not null check (context in ('karyawan', 'portal', 'umum')),   -- kapan dicek: batas tercapai / fitur portal / otomatis
  kind text not null check (kind in ('upgrade', 'tahunan')),
  from_plan text not null references public.plans(key) on update cascade,
  to_plan text not null references public.plans(key) on update cascade,
  to_months int not null default 1 check (to_months in (1, 12)),
  title text not null check (char_length(title) between 3 and 80),
  message text not null check (char_length(message) between 10 and 400),
  cta text not null check (char_length(cta) between 2 and 40),
  cta_secondary text not null default 'Nanti saja' check (char_length(cta_secondary) between 2 and 40),
  priority int not null default 100,
  frequency_days int not null default 7 check (frequency_days between 1 and 90),
  general boolean not null default false,                                      -- ikut batas pop-up umum 7 hari
  active boolean not null default true,
  starts_on date,
  ends_on date,
  updated_by text,
  updated_at timestamptz not null default now(),
  check (ends_on is null or starts_on is null or ends_on >= starts_on)
);
alter table public.growth_rules enable row level security;   -- tanpa policy: hanya lewat fungsi

-- 2) Catatan interaksi (ber-kos_id → wajib zz_kos_open_guard) ---------------------
create table if not exists public.growth_log (
  id uuid primary key default gen_random_uuid(),
  kos_id uuid not null references public.kos(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  rule_id text not null references public.growth_rules(id) on update cascade on delete restrict,
  action text not null check (action in ('shown', 'dismissed', 'clicked', 'checkout')),
  event text check (event is null or char_length(event) <= 60),                 -- mis. EMPLOYEE.CREATE_REQUESTED
  plan_from text,
  plan_to text,
  created_at timestamptz not null default now()
);
create index if not exists growth_log_kos on public.growth_log(kos_id, rule_id, created_at desc);
create index if not exists growth_log_rule on public.growth_log(rule_id, action, created_at desc);
alter table public.growth_log enable row level security;     -- tanpa policy
drop trigger if exists zz_kos_open_guard on public.growth_log;
create trigger zz_kos_open_guard before insert or update or delete on public.growth_log
  for each row execute function public.kos_open_guard();

-- 3) Data awal: tiga penawaran dari V2 (harga selalu dibaca dari paket, tidak ditulis di sini) -----
insert into public.growth_rules(id, name, context, kind, from_plan, to_plan, to_months, title, message, cta, cta_secondary, priority, frequency_days, general, updated_by)
values
  ('UPGRADE.EMPLOYEE.LIMIT', 'Tambah karyawan melebihi batas paket', 'karyawan', 'upgrade', 'dasar', 'bisnis', 1,
   'Bisnis Anda mulai berkembang!',
   'Anda sudah menggunakan seluruh kapasitas karyawan Paket Dasar. Upgrade ke Paket Bisnis untuk mengelola hingga 5 akun karyawan.',
   'Upgrade ke Paket Bisnis', 'Tetap menggunakan Paket Dasar', 10, 7, false, 'sistem'),
  ('UPGRADE.PORTAL.BISNIS_PRO', 'Fitur Portal bisnis (Paket Pro)', 'portal', 'upgrade', 'bisnis', 'pro', 1,
   'Bisnis Anda siap go digital.',
   'Gunakan Portal PRASARA untuk menampilkan katalog, menerima pendaftaran, dan mengelola pemesanan pelanggan secara online.',
   'Upgrade ke Paket Pro', 'Nanti saja', 20, 14, false, 'sistem'),
  ('UPGRADE.ANNUAL.PRO', 'Pro bulanan ke Pro tahunan', 'umum', 'tahunan', 'pro', 'pro', 12,
   'Hemat dengan Paket Pro Tahunan',
   'Gunakan seluruh kemampuan PRASARA selama satu tahun. Bayar sekali untuk 12 bulan.',
   'Pilih Pro Tahunan', 'Nanti saja', 50, 30, true, 'sistem')
on conflict (id) do nothing;

-- 4) Helper: pemilik aktif bisnis ini ---------------------------------------------
create or replace function public._growth_owner(p_kos uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from kos_members m where m.kos_id = p_kos and m.user_id = auth.uid() and m.role = 'pemilik' and m.active);
$$;

-- 5) Penawaran untuk pemilik (server memutuskan; frontend hanya menampilkan) -----------
create or replace function public.growth_offer(p_kos uuid, p_context text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_today date := (now() at time zone 'Asia/Jakarta')::date;
  v_plan text := kos_plan(p_kos);
  v_r growth_rules;
  v_price numeric; v_list numeric; v_saving numeric; v_monthly numeric;
  v_used int; v_lim int; v_first_pro timestamptz; v_last_months int; v_paid_until date;
begin
  if auth.uid() is null or not _growth_owner(p_kos) then return null; end if;
  if (select closed_at is not null or suspended_at is not null from kos where id = p_kos) then return null; end if;

  for v_r in
    select * from growth_rules
    where active and context = p_context and from_plan = v_plan
      and (starts_on is null or starts_on <= v_today) and (ends_on is null or ends_on >= v_today)
    order by priority, id
  loop
    -- Batas pop-up umum: paling banyak satu tiap 7 hari untuk semua penawaran umum
    if v_r.general and exists (
         select 1 from growth_log g join growth_rules r on r.id = g.rule_id
         where g.kos_id = p_kos and g.action = 'shown' and r.general and g.created_at > now() - interval '7 days') then
      continue;
    end if;
    -- Penawaran yang sudah tampil atau ditolak tidak diulang sebelum frequency_days habis
    if exists (select 1 from growth_log g where g.kos_id = p_kos and g.rule_id = v_r.id
               and g.action in ('shown', 'dismissed') and g.created_at > now() - make_interval(days => v_r.frequency_days)) then
      continue;
    end if;

    v_used := null; v_lim := null;
    if v_r.context = 'karyawan' then
      -- Hanya saat batas karyawan paket sekarang sudah penuh
      v_used := team_used(p_kos); v_lim := team_limit(p_kos);
      if v_used < v_lim then continue; end if;
    elsif v_r.kind = 'tahunan' then
      -- Pro bulanan yang sudah aktif minimal 30 hari; paket bayar masih berjalan
      select min(created_at) into v_first_pro from plan_activations where kos_id = p_kos and plan = 'pro';
      select months into v_last_months from plan_activations where kos_id = p_kos order by created_at desc limit 1;
      select paid_until into v_paid_until from kos where id = p_kos;
      if v_first_pro is null or v_first_pro > now() - interval '30 days' then continue; end if;
      if coalesce(v_last_months, 0) <> 1 then continue; end if;
      if v_paid_until is null or v_paid_until < v_today then continue; end if;
    end if;

    -- Harga: selalu dari konfigurasi paket (plan_eff_price / plan_terms), bukan angka tetap
    if v_r.to_months = 12 then
      select price, list_price into v_price, v_list from plan_terms
        where plan_key = v_r.to_plan and months = 12 and active;
      if v_price is null then continue; end if;
      v_monthly := round(v_price / 12);
      v_saving := greatest(coalesce(v_list, 0) - v_price, 0);
    else
      v_price := plan_eff_price(v_r.to_plan);
      select case when v.list_price > v_price then v.list_price end into v_list from plan_current(v_r.to_plan) v;
      v_monthly := v_price;
      v_saving := null;
    end if;

    return jsonb_build_object(
      'id', v_r.id, 'kind', v_r.kind, 'context', v_r.context,
      'title', v_r.title, 'message', v_r.message, 'cta', v_r.cta, 'cta_secondary', v_r.cta_secondary,
      'from_plan', v_r.from_plan, 'from_name', (select name from plans where key = v_r.from_plan),
      'to_plan', v_r.to_plan, 'to_name', (select name from plans where key = v_r.to_plan),
      'to_months', v_r.to_months, 'price', v_price, 'list_price', v_list, 'saving', v_saving, 'monthly', v_monthly,
      'karyawan_dipakai', v_used, 'karyawan_batas', v_lim,
      'karyawan_batas_baru', (select (plan_current(v_r.to_plan)).limits ->> 'karyawan')::int
    );
  end loop;
  return null;
end $$;

-- 6) Catat interaksi pemilik: shown | dismissed | clicked | checkout --------------------
create or replace function public.growth_track(p_kos uuid, p_rule text, p_action text, p_event text default null)
returns void language plpgsql security definer set search_path = public as $$
declare v_to text;
begin
  if auth.uid() is null or not _growth_owner(p_kos) then raise exception 'Khusus pemilik bisnis'; end if;
  if p_action not in ('shown', 'dismissed', 'clicked', 'checkout') then raise exception 'Aksi tidak dikenal'; end if;
  select to_plan into v_to from growth_rules where id = p_rule;
  if v_to is null then raise exception 'Penawaran tidak dikenal'; end if;
  insert into growth_log(kos_id, user_id, rule_id, action, event, plan_from, plan_to)
  values (p_kos, auth.uid(), p_rule, p_action, left(nullif(trim(coalesce(p_event, '')), ''), 60), kos_plan(p_kos), v_to);
end $$;

-- 7) Management Center: daftar, simpan (buat/ubah), dan audit --------------------------
create or replace function public.growth_rules_list()
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if not admin_can('finance.view') then raise exception 'Tidak punya izin melihat pertumbuhan'; end if;
  return jsonb_build_object(
    'aturan', (select coalesce(jsonb_agg(to_jsonb(r) order by r.priority, r.id), '[]'::jsonb) from growth_rules r),
    'paket', (select coalesce(jsonb_agg(jsonb_build_object('key', key, 'name', name) order by sort), '[]'::jsonb) from plans where key <> 'standar'),
    -- Harga yang berlaku sekarang (dari konfigurasi paket), dipakai untuk pratinjau kampanye
    'harga', (select coalesce(jsonb_object_agg(p.key, jsonb_build_object(
        'bulan', plan_eff_price(p.key),
        'bulan_normal', (select case when v.list_price > plan_eff_price(p.key) then v.list_price end from plan_current(p.key) v),
        'tahunan', (select t.price from plan_terms t where t.plan_key = p.key and t.months = 12 and t.active),
        'tahunan_normal', (select t.list_price from plan_terms t where t.plan_key = p.key and t.months = 12 and t.active))), '{}'::jsonb)
      from plans p where p.key <> 'standar'));
end $$;

create or replace function public.growth_rule_save(p_id text, p_data jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_old growth_rules; v_new growth_rules; v_email text := actor_email();
begin
  if is_admin() is not true then raise exception 'Khusus Super Admin'; end if;   -- is_admin() bisa NULL (bukan staf): jangan pakai 'not'
  if p_id is null or p_id !~ '^[A-Z0-9_.]{3,60}$' then raise exception 'ID penawaran hanya huruf besar, angka, titik, atau garis bawah'; end if;
  select * into v_old from growth_rules where id = p_id;
  v_new.id := p_id;
  v_new.name := trim(coalesce(p_data->>'name', v_old.name, ''));
  v_new.context := coalesce(p_data->>'context', v_old.context, 'umum');
  v_new.kind := coalesce(p_data->>'kind', v_old.kind, 'upgrade');
  v_new.from_plan := coalesce(p_data->>'from_plan', v_old.from_plan);
  v_new.to_plan := coalesce(p_data->>'to_plan', v_old.to_plan);
  v_new.to_months := coalesce(nullif(p_data->>'to_months', '')::int, v_old.to_months, 1);
  v_new.title := trim(coalesce(p_data->>'title', v_old.title, ''));
  v_new.message := trim(coalesce(p_data->>'message', v_old.message, ''));
  v_new.cta := trim(coalesce(p_data->>'cta', v_old.cta, ''));
  v_new.cta_secondary := trim(coalesce(p_data->>'cta_secondary', v_old.cta_secondary, 'Nanti saja'));
  v_new.priority := coalesce(nullif(p_data->>'priority', '')::int, v_old.priority, 100);
  v_new.frequency_days := coalesce(nullif(p_data->>'frequency_days', '')::int, v_old.frequency_days, 7);
  v_new.general := coalesce((p_data->>'general')::boolean, v_old.general, false);
  v_new.active := coalesce((p_data->>'active')::boolean, v_old.active, true);
  v_new.starts_on := case when p_data ? 'starts_on' then nullif(p_data->>'starts_on', '')::date else v_old.starts_on end;
  v_new.ends_on := case when p_data ? 'ends_on' then nullif(p_data->>'ends_on', '')::date else v_old.ends_on end;
  if v_new.context not in ('karyawan', 'portal', 'umum') then raise exception 'Konteks tidak dikenal'; end if;
  if v_new.kind not in ('upgrade', 'tahunan') then raise exception 'Jenis tidak dikenal'; end if;
  if not exists (select 1 from plans where key = v_new.from_plan) or not exists (select 1 from plans where key = v_new.to_plan) then
    raise exception 'Paket asal/tujuan tidak dikenal';
  end if;
  if v_new.kind = 'tahunan' and (v_new.to_months <> 12 or v_new.to_plan <> v_new.from_plan) then
    raise exception 'Penawaran tahunan hanya untuk paket yang sama dengan jangka 12 bulan';
  end if;
  if v_new.kind = 'upgrade' and v_new.to_months <> 1 then raise exception 'Penawaran upgrade memakai harga bulanan'; end if;
  if v_new.kind = 'upgrade' and v_new.to_plan = v_new.from_plan then raise exception 'Paket tujuan harus berbeda'; end if;
  if v_new.frequency_days < 1 or v_new.frequency_days > 90 then raise exception 'Frekuensi 1–90 hari'; end if;

  insert into growth_rules(id, name, context, kind, from_plan, to_plan, to_months, title, message, cta, cta_secondary,
      priority, frequency_days, general, active, starts_on, ends_on, updated_by, updated_at)
  values (v_new.id, v_new.name, v_new.context, v_new.kind, v_new.from_plan, v_new.to_plan, v_new.to_months, v_new.title, v_new.message,
      v_new.cta, v_new.cta_secondary, v_new.priority, v_new.frequency_days, v_new.general, v_new.active, v_new.starts_on, v_new.ends_on,
      v_email, now())
  on conflict (id) do update set name = excluded.name, context = excluded.context, kind = excluded.kind, from_plan = excluded.from_plan,
      to_plan = excluded.to_plan, to_months = excluded.to_months, title = excluded.title, message = excluded.message, cta = excluded.cta,
      cta_secondary = excluded.cta_secondary, priority = excluded.priority, frequency_days = excluded.frequency_days, general = excluded.general,
      active = excluded.active, starts_on = excluded.starts_on, ends_on = excluded.ends_on, updated_by = excluded.updated_by, updated_at = now()
  returning * into v_new;

  insert into admin_log(actor_email, action, detail)
  values (v_email, case when v_old.id is null then 'buat_kampanye' else 'ubah_kampanye' end,
          jsonb_build_object('penawaran', p_id, 'sebelum', to_jsonb(v_old), 'sesudah', to_jsonb(v_new)));
  return to_jsonb(v_new);
end $$;

-- 8) Analitik Growth: angka nyata dari tabel; tanpa data tiruan --------------------
create or replace function public.growth_analytics(p_days int default 30)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_days int := greatest(1, least(coalesce(p_days, 30), 365));
  v_since timestamptz; v_today date := (now() at time zone 'Asia/Jakarta')::date;
  v_coba int; v_coba_bayar int; v_bayar int; v_mrr numeric; v_aktif int;
  v_berakhir int; v_diperpanjang int;
begin
  if not admin_can('finance.view') then raise exception 'Tidak punya izin melihat pertumbuhan'; end if;
  v_since := now() - make_interval(days => v_days);

  select count(*) into v_coba from kos where trial_until is not null and activated_at >= v_since;
  select count(*) into v_coba_bayar from kos k where k.trial_until is not null and k.activated_at >= v_since
    and exists (select 1 from plan_activations pa where pa.kos_id = k.id and pa.months > 0);
  select count(distinct kos_id) into v_bayar from plan_activations where created_at >= v_since and months > 0;

  select count(*) into v_aktif from kos k where k.paid_until >= v_today and k.plan in ('dasar', 'bisnis', 'pro') and k.closed_at is null;

  select coalesce(sum(
      case when (select pa.months from plan_activations pa where pa.kos_id = k.id order by pa.created_at desc limit 1) = 12
           then coalesce((select t.price from plan_terms t where t.plan_key = k.plan and t.months = 12 and t.active), plan_unit_price(k.id, k.plan)) / 12
           else plan_unit_price(k.id, k.plan) end), 0)
    into v_mrr
  from kos k where k.paid_until >= v_today and k.plan in ('dasar', 'bisnis', 'pro') and k.closed_at is null;

  -- Perpanjangan: bisnis yang masa bayarnya berakhir dalam periode, lalu tercatat aktivasi lagi (±3 hari)
  select count(*) into v_berakhir from kos k
    where k.paid_until is not null and k.paid_until >= v_since::date and k.paid_until < v_today and k.plan in ('dasar', 'bisnis', 'pro');
  select count(*) into v_diperpanjang from kos k
    where k.paid_until is not null and k.paid_until >= v_since::date and k.paid_until < v_today and k.plan in ('dasar', 'bisnis', 'pro')
      and exists (select 1 from plan_activations pa where pa.kos_id = k.id and pa.months > 0 and pa.created_at::date >= k.paid_until - 3);

  return jsonb_build_object(
    'hari', v_days,
    'akuisisi', jsonb_build_object(
      'pemilik_baru', (select count(distinct user_id) from kos_members where role = 'pemilik' and added_at >= v_since),
      'bisnis_baru', (select count(*) from kos where created_at >= v_since),
      'pengunjung', null),
    'aktivasi', jsonb_build_object(
      'bisnis_aktif', (select count(*) from kos where activated_at >= v_since),
      'masa_coba', v_coba),
    'konversi', jsonb_build_object(
      'bisnis_bayar', v_bayar,
      'masa_coba_ke_bayar', v_coba_bayar,
      'rasio_masa_coba', case when v_coba > 0 then round(v_coba_bayar::numeric * 100 / v_coba, 1) end,
      'pendapatan', (select coalesce(sum(amount), 0) from plan_requests where status = 'disetujui' and decided_at >= v_since),
      'per_paket', (select coalesce(jsonb_agg(x order by x->>'paket'), '[]'::jsonb) from (
          select jsonb_build_object('paket', plan, 'bulan', months, 'jumlah', count(*)) x, plan, months
          from plan_activations where created_at >= v_since and months > 0 group by plan, months) q)),
    'upgrade', jsonb_build_object(
      'dasar_ke_bisnis', (select count(*) from plan_activations where created_at >= v_since and before->>'paket' = 'dasar' and after->>'paket' = 'bisnis'),
      'bisnis_ke_pro', (select count(*) from plan_activations where created_at >= v_since and before->>'paket' = 'bisnis' and after->>'paket' = 'pro'),
      'pro_bulanan_ke_tahunan', (select count(*) from plan_activations where created_at >= v_since and months = 12 and before->>'paket' = 'pro' and after->>'paket' = 'pro')),
    'retensi', jsonb_build_object(
      'pelanggan_aktif', v_aktif,
      'jatuh_tempo_7_hari', (select count(*) from kos where paid_until between v_today and v_today + 7 and plan in ('dasar', 'bisnis', 'pro') and closed_at is null),
      'berakhir_periode', v_berakhir,
      'diperpanjang', v_diperpanjang,
      'tingkat_perpanjangan', case when v_berakhir > 0 then round(v_diperpanjang::numeric * 100 / v_berakhir, 1) end),
    'pendapatan', jsonb_build_object(
      'mrr', round(v_mrr),
      'arr', round(v_mrr * 12),
      'arpa', case when v_aktif > 0 then round(v_mrr / v_aktif) end,
      'catatan', 'MRR = harga paket per bulan dari bisnis yang masih aktif (Pro Tahunan dibagi 12). Perkiraan, bukan laporan keuangan.'),
    'pemicu', (select coalesce(jsonb_agg(x order by (x->>'tampil')::int desc, x->>'id'), '[]'::jsonb) from (
        select jsonb_build_object(
          'id', r.id, 'nama', r.name, 'aktif', r.active,
          'tampil', count(*) filter (where g.action = 'shown'),
          'diklik', count(*) filter (where g.action = 'clicked'),
          'ditolak', count(*) filter (where g.action = 'dismissed'),
          'checkout', count(*) filter (where g.action = 'checkout'),
          'bayar', (select count(distinct c.kos_id) from growth_log c
                      join plan_activations pa on pa.kos_id = c.kos_id and pa.months > 0
                        and pa.created_at >= c.created_at and pa.created_at <= c.created_at + interval '7 days'
                    where c.rule_id = r.id and c.action = 'checkout' and c.created_at >= v_since)) x
        from growth_rules r left join growth_log g on g.rule_id = r.id and g.created_at >= v_since
        group by r.id, r.name, r.active) q));
end $$;

-- 9) Hak akses -----------------------------------------------------------------------
revoke execute on function public._growth_owner(uuid) from public, anon, authenticated;
revoke execute on function public.growth_offer(uuid, text), public.growth_track(uuid, text, text, text), public.growth_rules_list(),
  public.growth_rule_save(text, jsonb), public.growth_analytics(int) from public, anon;
grant execute on function public.growth_offer(uuid, text), public.growth_track(uuid, text, text, text), public.growth_rules_list(),
  public.growth_rule_save(text, jsonb), public.growth_analytics(int) to authenticated;
