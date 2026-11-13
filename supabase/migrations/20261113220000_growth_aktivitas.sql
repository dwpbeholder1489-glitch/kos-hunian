-- Growth Trigger Engine tahap 2 (Master Prompt V2 §6.1, §7, §8): penawaran berbasis aktivitas & pengguna Gratis.
--  • context 'aktivitas' + trigger_event: penawaran yang muncul setelah kejadian nyata di aplikasi
--      TRANSAKSI.PERTAMA (ada penjualan/pembayaran/pesanan) dan LAPORAN.DIBUKA (halaman laporan dibuka).
--  • Penawaran Gratis memakai context 'umum' dengan from_plan 'gratis' (tanpa kolom baru).
--  • Frekuensi & batas pop-up umum 7 hari tetap berlaku (general = true).
-- Pembayaran TIDAK diaktifkan dari sini.

-- 1) Kolom & batasan ------------------------------------------------------------------
alter table public.growth_rules add column if not exists trigger_event text;
alter table public.growth_rules drop constraint if exists growth_rules_trigger_event_check;
alter table public.growth_rules add constraint growth_rules_trigger_event_check
  check (trigger_event is null or trigger_event in ('LAPORAN.DIBUKA', 'TRANSAKSI.PERTAMA'));
alter table public.growth_rules drop constraint if exists growth_rules_context_check;
alter table public.growth_rules add constraint growth_rules_context_check
  check (context in ('karyawan', 'portal', 'umum', 'aktivitas'));
alter table public.growth_rules drop constraint if exists growth_rules_aktivitas_check;
alter table public.growth_rules add constraint growth_rules_aktivitas_check
  check ((context = 'aktivitas') = (trigger_event is not null));

-- 2) Data awal ----------------------------------------------------------------------
insert into public.growth_rules(id, name, context, kind, from_plan, to_plan, to_months, trigger_event, title, message, cta, cta_secondary,
  priority, frequency_days, general, updated_by)
values
  ('UPGRADE.ACTIVITY.TRANSAKSI', 'Transaksi pertama tercatat (paket Gratis)', 'aktivitas', 'upgrade', 'gratis', 'dasar', 1, 'TRANSAKSI.PERTAMA',
   'Transaksi pertama sudah tercatat.',
   'Paket Dasar menyediakan fitur untuk mencatat dan memantau usaha Anda secara lengkap. Lihat rinciannya di menu Langganan.',
   'Lihat Paket Dasar', 'Nanti saja', 30, 30, true, 'sistem'),
  ('UPGRADE.FREE.DASAR', 'Pengguna Gratis ke Paket Dasar', 'umum', 'upgrade', 'gratis', 'dasar', 1, null,
   'Bisnis Anda siap naik kelas.',
   'Paket Dasar membuka fitur lengkap untuk usaha yang sudah berjalan. Pilih paket dari menu Langganan kapan saja.',
   'Lihat Paket Dasar', 'Nanti saja', 60, 30, true, 'sistem'),
  ('UPGRADE.ACTIVITY.LAPORAN', 'Laporan dibuka (paket Dasar)', 'aktivitas', 'upgrade', 'dasar', 'bisnis', 1, 'LAPORAN.DIBUKA',
   'Anda sudah rutin memantau laporan.',
   'Paket Bisnis memberi batas hingga 5 akun karyawan, sehingga pekerjaan harian bisa dibagi. Upgrade kapan saja dari menu Langganan.',
   'Upgrade ke Paket Bisnis', 'Nanti saja', 40, 14, true, 'sistem')
on conflict (id) do nothing;

-- 3) Penentu penawaran: tambah parameter peristiwa (default null = penawaran umum/karyawan/portal) ----
drop function if exists public.growth_offer(uuid, text);
create or replace function public.growth_offer(p_kos uuid, p_context text, p_event text default null)
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
      and (p_context <> 'aktivitas' or trigger_event = p_event)
      and (starts_on is null or starts_on <= v_today) and (ends_on is null or ends_on >= v_today)
    order by priority, id
  loop
    -- Batas pop-up umum: paling banyak satu tiap 7 hari untuk semua penawaran umum (termasuk aktivitas)
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
    elsif v_r.context = 'aktivitas' and v_r.trigger_event = 'TRANSAKSI.PERTAMA' then
      -- Hanya setelah ada transaksi nyata (penjualan, pembayaran terverifikasi, atau pesanan jasa)
      if not (exists (select 1 from sales s where s.kos_id = p_kos)
           or exists (select 1 from payments p where p.kos_id = p_kos and p.status = 'terverifikasi')
           or exists (select 1 from svc_orders o where o.kos_id = p_kos)) then continue; end if;
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

-- 4) Management Center: validasi konteks aktivitas & peristiwanya ----------------------
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
  v_new.trigger_event := case when p_data ? 'trigger_event' then nullif(p_data->>'trigger_event', '') else v_old.trigger_event end;
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
  if v_new.context not in ('karyawan', 'portal', 'umum', 'aktivitas') then raise exception 'Konteks tidak dikenal'; end if;
  if v_new.kind not in ('upgrade', 'tahunan') then raise exception 'Jenis tidak dikenal'; end if;
  if v_new.context = 'aktivitas' and (v_new.trigger_event is null or v_new.trigger_event not in ('LAPORAN.DIBUKA', 'TRANSAKSI.PERTAMA')) then
    raise exception 'Pilih peristiwa: laporan dibuka atau transaksi pertama';
  end if;
  if v_new.context <> 'aktivitas' then v_new.trigger_event := null; end if;
  if not exists (select 1 from plans where key = v_new.from_plan) or not exists (select 1 from plans where key = v_new.to_plan) then
    raise exception 'Paket asal/tujuan tidak dikenal';
  end if;
  if v_new.kind = 'tahunan' and (v_new.to_months <> 12 or v_new.to_plan <> v_new.from_plan) then
    raise exception 'Penawaran tahunan hanya untuk paket yang sama dengan jangka 12 bulan';
  end if;
  if v_new.kind = 'upgrade' and v_new.to_months <> 1 then raise exception 'Penawaran upgrade memakai harga bulanan'; end if;
  if v_new.kind = 'upgrade' and v_new.to_plan = v_new.from_plan then raise exception 'Paket tujuan harus berbeda'; end if;
  if v_new.frequency_days < 1 or v_new.frequency_days > 90 then raise exception 'Frekuensi 1–90 hari'; end if;

  insert into growth_rules(id, name, context, kind, from_plan, to_plan, to_months, trigger_event, title, message, cta, cta_secondary,
      priority, frequency_days, general, active, starts_on, ends_on, updated_by, updated_at)
  values (v_new.id, v_new.name, v_new.context, v_new.kind, v_new.from_plan, v_new.to_plan, v_new.to_months, v_new.trigger_event,
      v_new.title, v_new.message, v_new.cta, v_new.cta_secondary, v_new.priority, v_new.frequency_days, v_new.general, v_new.active,
      v_new.starts_on, v_new.ends_on, v_email, now())
  on conflict (id) do update set name = excluded.name, context = excluded.context, kind = excluded.kind, from_plan = excluded.from_plan,
      to_plan = excluded.to_plan, to_months = excluded.to_months, trigger_event = excluded.trigger_event, title = excluded.title,
      message = excluded.message, cta = excluded.cta, cta_secondary = excluded.cta_secondary, priority = excluded.priority,
      frequency_days = excluded.frequency_days, general = excluded.general, active = excluded.active, starts_on = excluded.starts_on,
      ends_on = excluded.ends_on, updated_by = excluded.updated_by, updated_at = now()
  returning * into v_new;

  insert into admin_log(actor_email, action, detail)
  values (v_email, case when v_old.id is null then 'buat_kampanye' else 'ubah_kampanye' end,
          jsonb_build_object('penawaran', p_id, 'sebelum', to_jsonb(v_old), 'sesudah', to_jsonb(v_new)));
  return to_jsonb(v_new);
end $$;

-- 5) Hak akses (signature baru) -----------------------------------------------------
revoke execute on function public.growth_offer(uuid, text, text) from public, anon;
grant execute on function public.growth_offer(uuid, text, text) to authenticated;
