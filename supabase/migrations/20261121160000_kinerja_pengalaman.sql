-- Adaptive Experience Fase 7 (§28 Experience performance): pemakaian fitur, aksi cepat, dan hasil rekomendasi diukur di SERVER.
-- Prinsip:
--  • Yang dicatat HANYA jumlah per hari: menu yang dibuka (path tanpa query) dan aksi cepat yang diketuk. Tanpa isi transaksi,
--    tanpa IP, tanpa perangkat. Data milik bisnis itu sendiri; disimpan 180 hari.
--  • Pemilik/pengelola melihat ringkasan (berapa kali, berapa orang) — BUKAN rincian per karyawan, agar bukan alat mengawasi orang.
--  • Urutan tombol (+) "paling sering dipakai" kini dari server (semua perangkat orang itu), cadangan per perangkat bila jaringan putus.
--  • Mencatat tidak pernah boleh mengganggu pekerjaan: exp_track menelan semua galat dan mengembalikan 0.
--  • Super Admin hanya melihat angka agregat lintas bisnis (tanpa nama bisnis).

create table if not exists public.exp_usage (
  kos_id uuid not null references public.kos(id) on delete cascade,
  user_id uuid not null,
  day date not null,
  kind text not null check (kind in ('menu', 'aksi')),
  key text not null check (char_length(key) between 2 and 81),
  n int not null default 1 check (n between 1 and 5000),
  primary key (kos_id, user_id, day, kind, key)
);
create index if not exists exp_usage_kos_day on public.exp_usage(kos_id, day);
alter table public.exp_usage enable row level security;
revoke all on public.exp_usage from public, anon, authenticated;
drop trigger if exists zz_kos_open_guard on public.exp_usage;
create trigger zz_kos_open_guard before insert or update or delete on public.exp_usage for each row execute function public.kos_open_guard();

-- Catat sekumpulan kejadian [{k:'menu'|'aksi', key, n}] untuk pengguna yang login. Selalu aman: galat apa pun → 0.
create or replace function public.exp_track(p_kos uuid, p_events jsonb)
returns int language plpgsql security definer set search_path = public as $$
declare e jsonb; v_k text; v_key text; v_n int; v_day date := (now() at time zone 'Asia/Jakarta')::date; v_ok int := 0; v_rows int;
begin
  if auth.uid() is null or p_kos is null or not is_member_any(p_kos) then return 0; end if;
  if jsonb_typeof(p_events) <> 'array' then return 0; end if;
  select count(*) into v_rows from exp_usage where kos_id = p_kos and user_id = auth.uid() and day = v_day;
  for e in select * from jsonb_array_elements(p_events) limit 50 loop
    v_k := e->>'k'; v_key := e->>'key';
    v_n := case when (e->>'n') ~ '^[0-9]{1,3}$' then least(greatest((e->>'n')::int, 1), 20) else 1 end;
    if v_k = 'menu' and v_key ~ '^/[a-z0-9-]{1,40}(/[a-z0-9_-]{1,40})?$' then null;
    elsif v_k = 'aksi' and v_key ~ '^[a-z0-9_.:-]{2,60}$' then null;
    else continue; end if;
    begin
      if not exists (select 1 from exp_usage where kos_id = p_kos and user_id = auth.uid() and day = v_day and kind = v_k and key = v_key) then
        if v_rows >= 300 then continue; end if;   -- batas jenis kunci per orang per hari
        v_rows := v_rows + 1;
      end if;
      insert into exp_usage(kos_id, user_id, day, kind, key, n) values (p_kos, auth.uid(), v_day, v_k, v_key, v_n)
      on conflict (kos_id, user_id, day, kind, key) do update set n = least(exp_usage.n + excluded.n, 5000);
      v_ok := v_ok + 1;
    exception when others then return v_ok;   -- bisnis ditutup/draf atau galat lain: jangan ganggu pengguna
    end;
  end loop;
  return v_ok;
exception when others then return 0;
end $$;
revoke execute on function public.exp_track(uuid, jsonb) from public, anon;
grant execute on function public.exp_track(uuid, jsonb) to authenticated;

-- Pemakaian SAYA sendiri (60 hari) → urutan tombol (+) di semua perangkat
create or replace function public.exp_usage_mine(p_kos uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if auth.uid() is null or not is_member_any(p_kos) then return jsonb_build_object('aksi', '{}'::jsonb, 'menu', '{}'::jsonb); end if;
  return jsonb_build_object(
    'aksi', (select coalesce(jsonb_object_agg(key, n), '{}') from (select key, sum(n)::int n from exp_usage
             where kos_id = p_kos and user_id = auth.uid() and kind = 'aksi' and day > (now() at time zone 'Asia/Jakarta')::date - 60 group by key) z),
    'menu', (select coalesce(jsonb_object_agg(key, n), '{}') from (select key, sum(n)::int n from exp_usage
             where kos_id = p_kos and user_id = auth.uid() and kind = 'menu' and day > (now() at time zone 'Asia/Jakarta')::date - 60 group by key) z));
end $$;
revoke execute on function public.exp_usage_mine(uuid) from public, anon;
grant execute on function public.exp_usage_mine(uuid) to authenticated;

-- path modul tanpa query (mis. '/barang?tab=kedaluwarsa' → '/barang')
create or replace function public.exp_mod_paths(p_code text)
returns text[] language sql stable set search_path = public as $$
  select coalesce(array_agg(distinct split_part(p, '?', 1)), '{}') from modules m, unnest(m.paths) p where m.code = p_code and p like '/%';
$$;

-- Kinerja pengalaman satu bisnis (pemilik/pengelola)
create or replace function public.exp_performance(p_kos uuid, p_days int default 30)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_days int := case when p_days in (7, 30, 90) then p_days else 30 end;
  v_to date := (now() at time zone 'Asia/Jakarta')::date; v_from date; res jsonb;
begin
  if not member_in('settings', p_kos) then raise exception 'Khusus pemilik atau pengelola'; end if;
  v_from := v_to - v_days + 1;
  with u as (select * from exp_usage where kos_id = p_kos and day between v_from and v_to),
  mods as (
    select m.code, m.name, m.core, exp_mod_paths(m.code) paths from modules m
    where m.impl_status = 'production_ready' and module_on(p_kos, m.code) and cardinality(exp_mod_paths(m.code)) > 0),
  mu as (
    select md.code, md.name, md.core,
      coalesce(sum(u.n), 0)::int n, count(distinct u.user_id)::int users, count(distinct u.day)::int days, max(u.day) last_day,
      (select max(x.day) from exp_usage x where x.kos_id = p_kos and x.kind = 'menu'
         and exists (select 1 from unnest(md.paths) p where x.key = p or x.key like p || '/%')) last_ever
    from mods md left join u on u.kind = 'menu' and exists (select 1 from unnest(md.paths) p where u.key = p or u.key like p || '/%')
    group by md.code, md.name, md.core, md.paths),
  rec as (
    select r.*, (select exists (select 1 from exp_usage x where x.kos_id = p_kos and x.kind = 'menu' and x.day >= (r.decided_at at time zone 'Asia/Jakarta')::date
                   and exists (select 1 from unnest(exp_mod_paths(r.module_code)) p where x.key = p or x.key like p || '/%'))) adopted
    -- keputusan PEMILIK dalam periode (decided_at terisi) + saran yang masih terbuka/kedaluwarsa dari periode itu.
    -- Saran yang ditandai 'activated' oleh SISTEM (modulnya sudah menyala; decided_at kosong) bukan keputusan, tidak dihitung.
    from feature_recommendations r where r.kos_id = p_kos
      and ((r.decided_at is not null and (r.decided_at at time zone 'Asia/Jakarta')::date >= v_from)
        or (r.decided_at is null and r.status in ('recommended', 'deferred', 'expired') and (r.created_at at time zone 'Asia/Jakarta')::date >= v_from)))
  select jsonb_build_object(
    'days', v_days, 'from', v_from, 'to', v_to,
    'since', (select min(day) from exp_usage where kos_id = p_kos),
    'people', jsonb_build_object(
      'aktif', (select count(distinct user_id) from u),
      'anggota', (select count(*) from kos_members where kos_id = p_kos and active)),
    'total', jsonb_build_object('menu', (select coalesce(sum(n), 0) from u where kind = 'menu'), 'aksi', (select coalesce(sum(n), 0) from u where kind = 'aksi'),
                                'hari', (select count(distinct day) from u)),
    'menus', (select coalesce(jsonb_agg(jsonb_build_object('path', key, 'n', n, 'users', users, 'days', days) order by n desc, key), '[]') from (
               select key, sum(n)::int n, count(distinct user_id)::int users, count(distinct day)::int days from u where kind = 'menu' group by key order by 2 desc limit 15) z),
    'aksi', (select coalesce(jsonb_agg(jsonb_build_object('id', key, 'n', n, 'users', users) order by n desc, key), '[]') from (
               select key, sum(n)::int n, count(distinct user_id)::int users from u where kind = 'aksi' group by key) z),
    'modules', (select coalesce(jsonb_agg(jsonb_build_object('code', code, 'name', name, 'core', core, 'n', n, 'users', users, 'days', days,
                  'last', last_ever, 'idle', not core and n = 0) order by n desc, name), '[]') from mu),
    'recos', jsonb_build_object(
      'by_status', (select coalesce(jsonb_object_agg(status, c), '{}') from (select status, count(*) c from rec group by status) z),
      'decided', (select count(*) from rec where status in ('accepted', 'activated', 'rejected', 'dismissed')),
      'taken', (select count(*) from rec where status in ('accepted', 'activated')),
      'adopted', (select count(*) from rec where status in ('accepted', 'activated') and adopted),
      'items', (select coalesce(jsonb_agg(jsonb_build_object('module', r.module_code, 'name', m.name, 'status', r.status, 'at', coalesce(r.decided_at, r.created_at),
                  'reason', r.reason, 'adopted', r.adopted) order by coalesce(r.decided_at, r.created_at) desc), '[]')
                from (select * from rec order by coalesce(decided_at, created_at) desc limit 20) r join modules m on m.code = r.module_code)),
    'workflow_recos', (select coalesce(jsonb_object_agg(decision, c), '{}') from (select decision, count(*) c from workflow_reco_decisions
                        where kos_id = p_kos and (decided_at at time zone 'Asia/Jakarta')::date >= v_from group by decision) z),
    'config', jsonb_build_object(
      'ubah', (select count(*) from config_history where kos_id = p_kos and action in ('ubah_tampilan', 'ubah_dna') and (created_at at time zone 'Asia/Jakarta')::date >= v_from),
      'reset', (select count(*) from config_history where kos_id = p_kos and action = 'reset_tampilan' and (created_at at time zone 'Asia/Jakarta')::date >= v_from),
      'pulihkan', (select count(*) from config_history where kos_id = p_kos and action = 'pulihkan_tampilan' and (created_at at time zone 'Asia/Jakarta')::date >= v_from))
  ) into res;
  return res;
end $$;
revoke execute on function public.exp_performance(uuid, int) from public, anon;
grant execute on function public.exp_performance(uuid, int) to authenticated;

-- Super Admin: angka lintas bisnis tanpa nama bisnis/pengguna
create or replace function public.admin_experience_overview()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_from date := (now() at time zone 'Asia/Jakarta')::date - 29;
begin
  if not coalesce(admin_can('system.view'), false) then raise exception 'Tidak punya izin'; end if;
  return jsonb_build_object(
    'bisnis_tercatat', (select count(distinct kos_id) from exp_usage where day >= v_from),
    'pengguna_tercatat', (select count(distinct user_id) from exp_usage where day >= v_from),
    'since', (select min(day) from exp_usage),
    'menu_teratas', (select coalesce(jsonb_agg(jsonb_build_object('path', key, 'bisnis', b, 'n', n) order by b desc, n desc), '[]') from (
        select key, count(distinct kos_id)::int b, sum(n)::int n from exp_usage where kind = 'menu' and day >= v_from group by key order by 2 desc, 3 desc limit 12) z),
    'aksi_teratas', (select coalesce(jsonb_agg(jsonb_build_object('id', key, 'bisnis', b, 'n', n) order by b desc, n desc), '[]') from (
        select key, count(distinct kos_id)::int b, sum(n)::int n from exp_usage where kind = 'aksi' and day >= v_from group by key order by 2 desc, 3 desc limit 12) z),
    'rekomendasi', (select coalesce(jsonb_agg(jsonb_build_object('module', module_code, 'name', name, 'total', t, 'diterima', a, 'ditolak', r) order by t desc), '[]') from (
        select fr.module_code, m.name, count(*)::int t, count(*) filter (where fr.status in ('accepted', 'activated') and fr.decided_at is not null)::int a,
               count(*) filter (where fr.status in ('rejected', 'dismissed') and fr.decided_at is not null)::int r
        from feature_recommendations fr join modules m on m.code = fr.module_code
        where fr.created_at >= now() - interval '90 days' and not (fr.status = 'activated' and fr.decided_at is null)   -- tanpa tanda otomatis sistem
        group by fr.module_code, m.name order by 3 desc limit 15) z));
end $$;
revoke execute on function public.admin_experience_overview() from public, anon;
grant execute on function public.admin_experience_overview() to authenticated;

-- Disimpan 180 hari; dipanggil jadwal harian
create or replace function public.exp_usage_purge()
returns int language plpgsql security definer set search_path = public as $$
declare n int;
begin
  delete from exp_usage where day < (now() at time zone 'Asia/Jakarta')::date - 180;
  get diagnostics n = row_count;
  return n;
end $$;
revoke execute on function public.exp_usage_purge() from public, anon, authenticated;
grant execute on function public.exp_usage_purge() to service_role;
