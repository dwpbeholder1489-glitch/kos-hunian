-- Master Prompt V2 §4.1: "Hak akses karyawan: Dasar | Per modul | Granular", "Persetujuan transaksi: - | ✓ | Multi-level",
-- "Otomatisasi: - | Dasar | Lanjutan", §6.3 (event Bisnis→Pro) & §6.4 (syarat penawaran Pro Tahunan).
-- Fitur BARU (seperti rekonsiliasi) → tanpa pengecualian bisnis lama:
--   akses_modul            (Bisnis, Pro) pemilik memilih modul/area tiap karyawan (bukan hanya peran tetap)
--   akses_granular         (Pro)  izin per tindakan tiap karyawan: boleh langsung / perlu persetujuan / tidak boleh
--   persetujuan_bertingkat (Pro)  penyetuju tingkat 1 (karyawan yang ditunjuk) + tingkat 2 (pemilik) per aturan, opsional di atas nominal
--   otomatisasi_lanjutan   (Pro)  resep lanjutan + hari jalan per aturan
-- Turun paket: pengaturan TIDAK dihapus; hanya tidak berlaku (kembali ke peran bawaan / 1 tingkat / resep dasar) sampai naik lagi.

create or replace function public._prasara_patch(p_sig text, p_old text, p_new text)
returns void language plpgsql as $$
declare d text;
begin
  d := pg_get_functiondef(p_sig::regprocedure);
  if position(p_old in d) = 0 then raise exception 'patch % : potongan tidak ditemukan: %', p_sig, left(p_old, 80); end if;
  execute replace(d, p_old, p_new);
end $$;

-- ---------- 0) Kode fitur ----------
update public.plan_versions v
set features = (select array_agg(distinct f order by f) from unnest(v.features || '{akses_modul}'::text[]) f)
where v.plan_key in ('bisnis', 'pro') and v.id = (public.plan_current(v.plan_key)).id;
update public.plan_versions v
set features = (select array_agg(distinct f order by f) from unnest(v.features || '{akses_granular,persetujuan_bertingkat,otomatisasi_lanjutan}'::text[]) f)
where v.plan_key = 'pro' and v.id = (public.plan_current(v.plan_key)).id;

-- Daftar kode fitur yang dikenal (Paket & harga di Management Center memvalidasi dengan ini — sebelumnya belum memuat fitur V2)
create or replace function public.plan_feature_codes()
returns text[] language sql immutable as $$
  select array['laporan_lengkap', 'ekspor', 'kwitansi', 'pengingat_email', 'portal_penghuni', 'email_toko',
               'portal_bisnis', 'jurnal_manual', 'anggaran', 'rekonsiliasi', 'laporan_lanjutan', 'persetujuan', 'otomatisasi',
               'akses_modul', 'akses_granular', 'persetujuan_bertingkat', 'otomatisasi_lanjutan'];
$$;

-- ---------- 1) Hak akses per modul & per tindakan ----------
alter table public.kos_members add column if not exists areas text[];                       -- null = sesuai peran
alter table public.kos_members add column if not exists perms jsonb not null default '{}';  -- {kode_tindakan: izinkan|persetujuan|larang}
alter table public.kos_members add column if not exists can_approve boolean not null default false;

-- Area yang bisa dipilih per jenis bisnis ('team' = Karyawan & Langganan, selalu khusus pemilik)
create or replace function public.team_areas(p_type text)
returns text[] language sql immutable as $$
  select case when p_type = 'retail' then array['sell', 'stock', 'finance', 'settings']
              when p_type = 'jasa' then array['sell', 'ops', 'stock', 'finance', 'settings']
              when p_type = 'kustom' then array['ops', 'finance', 'settings']
              else array['rent', 'finance', 'settings'] end;
$$;

-- member_can / member_in: area khusus karyawan berlaku hanya bila bisnis punya fitur akses_modul
create or replace function public.member_can(p_kos uuid, p_areas text)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((
    select case when m.role = 'pemilik' then true
                when coalesce(p_areas, '') = '' then true
                when m.areas is not null and plan_has(p_kos, 'akses_modul')
                  then exists (select 1 from unnest(string_to_array(p_areas, ',')) a where a <> 'team' and a = any (m.areas))
                else role_allows(m.role, p_areas) end
    from kos_members m join kos k on k.id = m.kos_id
    where m.kos_id = p_kos and m.user_id = auth.uid() and m.active and k.suspended_at is null), false);
$$;
create or replace function public.member_in(p_areas text, p_kos uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select member_can(p_kos, p_areas);
$$;

-- Izin per tindakan untuk pengguna saat ini (null = ikut aturan persetujuan bisnis)
create or replace function public.approval_perm(p_kos uuid, p_action text)
returns text language sql stable security definer set search_path = public as $$
  select case when plan_has(p_kos, 'akses_granular') then
    (select m.perms ->> p_action from kos_members m where m.kos_id = p_kos and m.user_id = auth.uid() and m.active and m.role <> 'pemilik') end;
$$;

-- Perlu persetujuan? Pemilik tidak; eksekusi dari keputusan persetujuan tidak; izin granular (Pro) didahulukan.
create or replace function public.approval_needed(p_kos uuid, p_action text)
returns boolean language plpgsql stable security definer set search_path = public as $$
declare v_perm text;
begin
  if member_can(p_kos, 'team') then return false; end if;
  if coalesce(current_setting('prasara.approval_exec', true), '') <> '' then return false; end if;
  v_perm := approval_perm(p_kos, p_action);
  if v_perm = 'larang' then raise exception 'Tindakan ini tidak diizinkan untuk akun Anda. Hubungi pemilik bisnis.'; end if;
  if v_perm = 'izinkan' then return false; end if;
  if v_perm = 'persetujuan' then return true; end if;
  return approval_required(p_kos, p_action);
end $$;

select public._prasara_patch('public.approval_request(uuid,text,jsonb,text)',
  'if not member_in(a.request_area, p_kos) then raise exception ''Tidak punya akses untuk meminta tindakan ini''; end if;',
  'if not member_in(a.request_area, p_kos) then raise exception ''Tidak punya akses untuk meminta tindakan ini''; end if;
  if approval_perm(p_kos, p_action) = ''larang'' then raise exception ''Tindakan ini tidak diizinkan untuk akun Anda. Hubungi pemilik bisnis.''; end if;');

-- Simpan hak akses satu karyawan (pemilik). p_areas null = kembali ke peran; p_perms {} = ikut aturan bisnis.
create or replace function public.team_access_set(p_kos uuid, p_user uuid, p_areas text[], p_perms jsonb, p_approver boolean)
returns void language plpgsql security definer set search_path = public as $$
declare m kos_members; v_type text; v_areas text[]; v_perms jsonb := coalesce(p_perms, '{}'); r record;
begin
  if not member_can(p_kos, 'team') then raise exception 'Khusus pemilik bisnis'; end if;
  select * into m from kos_members where kos_id = p_kos and user_id = p_user for update;
  if m.user_id is null then raise exception 'Karyawan tidak ditemukan'; end if;
  if m.role = 'pemilik' then raise exception 'Hak akses pemilik tidak bisa diubah'; end if;
  select business_type into v_type from kos where id = p_kos;

  -- Pengaturan yang tidak berubah boleh disimpan ulang walau paket turun (tidak memaksa pemilik menghapusnya)
  if p_areas is not null then
    select coalesce(array_agg(distinct a order by a), '{}') into v_areas from unnest(p_areas) a;
    if v_areas is distinct from m.areas and not plan_has(p_kos, 'akses_modul') then raise exception 'BATAS_PAKET: Mengatur akses per modul tersedia mulai Paket Bisnis.'; end if;
    if cardinality(v_areas) = 0 then raise exception 'Pilih minimal satu modul, atau nonaktifkan karyawan ini'; end if;
    if not (v_areas <@ team_areas(v_type)) then raise exception 'Ada modul yang tidak tersedia untuk jenis bisnis ini'; end if;
  end if;

  if jsonb_typeof(v_perms) <> 'object' then raise exception 'Format izin tidak valid'; end if;
  if v_perms <> '{}'::jsonb then
    if v_perms is distinct from m.perms and not plan_has(p_kos, 'akses_granular') then raise exception 'BATAS_PAKET: Izin per tindakan tersedia di Paket Pro.'; end if;
    for r in select key, value from jsonb_each_text(v_perms) loop
      if not exists (select 1 from approval_actions where code = r.key and v_type = any (applies_to) and code <> 'buat_pesanan_supplier') then
        raise exception 'Tindakan tidak dikenal: %', r.key; end if;
      if r.value not in ('izinkan', 'persetujuan', 'larang') then raise exception 'Pilihan izin tidak valid'; end if;
    end loop;
  end if;

  if coalesce(p_approver, false) and not m.can_approve and not plan_has(p_kos, 'persetujuan_bertingkat') then
    raise exception 'BATAS_PAKET: Penyetuju tingkat 1 (persetujuan bertingkat) tersedia di Paket Pro.'; end if;

  update kos_members set areas = v_areas, perms = v_perms, can_approve = coalesce(p_approver, false)
  where kos_id = p_kos and user_id = p_user;
  perform config_log(p_kos, 'ubah_hak_akses', (select email from auth.users where id = p_user),
    jsonb_build_object('modul', m.areas, 'izin', m.perms, 'penyetuju', m.can_approve),
    jsonb_build_object('modul', v_areas, 'izin', v_perms, 'penyetuju', coalesce(p_approver, false)), null, 'menengah', actor_email());
end $$;
revoke execute on function public.team_access_set(uuid, uuid, text[], jsonb, boolean) from public, anon;
grant execute on function public.team_access_set(uuid, uuid, text[], jsonb, boolean) to authenticated;

-- team_list: ikut kirim hak akses, modul yang bisa dipilih, dan daftar tindakan
create or replace function public.team_list(p_kos uuid)
returns jsonb language plpgsql stable security definer set search_path = public, auth as $$
declare v_type text;
begin
  if not member_can(p_kos, 'team') then raise exception 'Khusus pemilik bisnis'; end if;
  select business_type into v_type from kos where id = p_kos;
  return jsonb_build_object(
    'limit', team_limit(p_kos), 'used', team_used(p_kos),
    'roles', team_roles(v_type), 'areas', team_areas(v_type),
    'fitur', jsonb_build_object('modul', plan_has(p_kos, 'akses_modul'), 'granular', plan_has(p_kos, 'akses_granular'), 'bertingkat', plan_has(p_kos, 'persetujuan_bertingkat')),
    'actions', (select coalesce(jsonb_agg(jsonb_build_object('code', a.code, 'label', a.label, 'risk', a.risk, 'area', a.request_area, 'required', approval_required(p_kos, a.code)) order by a.sort), '[]')
                from approval_actions a where v_type = any (a.applies_to) and a.code <> 'buat_pesanan_supplier'),
    'members', (select coalesce(jsonb_agg(jsonb_build_object('user_id', m.user_id, 'email', u.email, 'role', m.role, 'active', m.active, 'added_at', m.added_at, 'me', m.user_id = auth.uid(),
                                         'areas', m.areas, 'perms', m.perms, 'can_approve', m.can_approve)
                                         order by m.role = 'pemilik' desc, m.active desc, m.added_at), '[]')
                from kos_members m join auth.users u on u.id = m.user_id where m.kos_id = p_kos),
    'invites', (select coalesce(jsonb_agg(jsonb_build_object('id', i.id, 'email', i.email, 'role', i.role, 'created_at', i.created_at, 'expired', i.created_at <= now() - interval '14 days') order by i.created_at desc), '[]')
                from kos_invites i where i.kos_id = p_kos));
end $$;

-- Untuk menu di aplikasi: area khusus & status penyetuju pengguna saat ini (hanya yang berlaku menurut paket)
create or replace function public.my_access()
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_object_agg(m.kos_id, jsonb_build_object(
    'areas', case when m.areas is not null and plan_has(m.kos_id, 'akses_modul') then to_jsonb(m.areas) end,
    'approver', m.can_approve and plan_has(m.kos_id, 'persetujuan_bertingkat'))), '{}'::jsonb)
  from kos_members m where m.user_id = auth.uid() and m.active and m.role <> 'pemilik'
    and ((m.areas is not null and plan_has(m.kos_id, 'akses_modul')) or (m.can_approve and plan_has(m.kos_id, 'persetujuan_bertingkat')));
$$;
revoke execute on function public.my_access() from public, anon;
grant execute on function public.my_access() to authenticated;

-- ---------- 2) Persetujuan bertingkat ----------
alter table public.approval_rules add column if not exists levels smallint not null default 1;
alter table public.approval_rules drop constraint if exists approval_rules_levels_check;
alter table public.approval_rules add constraint approval_rules_levels_check check (levels in (1, 2));
alter table public.approval_rules add column if not exists level2_min numeric(14,2);
alter table public.approvals add column if not exists level smallint not null default 1;
alter table public.approvals add column if not exists levels_needed smallint not null default 1;
alter table public.approvals add column if not exists steps jsonb not null default '[]';

-- Penyetuju tingkat 1 (Pro): karyawan yang ditunjuk pemilik, punya area tindakan itu, bukan peminta sendiri.
create or replace function public.approval_is_approver(p_kos uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select plan_has(p_kos, 'persetujuan_bertingkat') and exists (
    select 1 from kos_members m where m.kos_id = p_kos and m.user_id = auth.uid() and m.active and m.can_approve and m.role <> 'pemilik');
$$;
create or replace function public.approval_can_decide(p_id uuid)
returns boolean language plpgsql stable security definer set search_path = public as $$
declare ap approvals; a approval_actions;
begin
  select * into ap from approvals where id = p_id;
  if ap.id is null then return false; end if;
  if member_can(ap.kos_id, 'team') then return true; end if;
  select * into a from approval_actions where code = ap.action_code;
  return ap.level = 1 and approval_is_approver(ap.kos_id) and ap.requested_by is distinct from auth.uid()
     and ap.action_code <> 'ubah_modul' and member_in(a.request_area, ap.kos_id);
end $$;

-- Jumlah tingkat ditentukan saat permintaan dibuat (snapshot aturan saat itu)
create or replace function public.approvals_levels_default()
returns trigger language plpgsql security definer set search_path = public as $$
declare ru approval_rules;
begin
  select * into ru from approval_rules where kos_id = new.kos_id and action_code = new.action_code;
  new.levels_needed := case when ru.levels = 2 and plan_has(new.kos_id, 'persetujuan_bertingkat')
                             and (ru.level2_min is null or coalesce(new.est_cost, 0) >= ru.level2_min) then 2 else 1 end;
  new.level := 1;
  return new;
end $$;
drop trigger if exists approvals_levels on public.approvals;
create trigger approvals_levels before insert on public.approvals for each row execute function public.approvals_levels_default();

-- Penyetuju ikut melihat permintaan di area kerjanya
drop policy if exists approvals_select on public.approvals;
create policy approvals_select on public.approvals for select using (
  public.member_can(kos_id, 'team') or requested_by = auth.uid()
  or (public.approval_is_approver(kos_id) and public.member_can(kos_id, (select a.request_area from public.approval_actions a where a.code = action_code))));

-- Inti eksekusi lama menjadi fungsi internal; pintu baru mengatur tingkat lalu menjalankannya
alter function public.approval_decide(uuid, boolean, text) rename to approval_decide_core;
select public._prasara_patch('public.approval_decide_core(uuid,boolean,text)',
  'if ap.id is null or not member_can(ap.kos_id, ''team'') then raise exception ''Permintaan tidak ditemukan''; end if;',
  'if ap.id is null or not (member_can(ap.kos_id, ''team'') or current_setting(''prasara.approval_exec'', true) = ap.id::text) then raise exception ''Permintaan tidak ditemukan''; end if;');
revoke execute on function public.approval_decide_core(uuid, boolean, text) from public, anon, authenticated;

create or replace function public.approval_decide(p_id uuid, p_approve boolean, p_note text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare ap approvals; v_owner boolean; v_note text := nullif(trim(coalesce(p_note, '')), ''); v_res jsonb;
begin
  select * into ap from approvals where id = p_id for update;
  if ap.id is null or not approval_can_decide(p_id) then raise exception 'Permintaan tidak ditemukan'; end if;
  if ap.status <> 'menunggu' then raise exception 'Permintaan sudah diproses'; end if;
  v_owner := member_can(ap.kos_id, 'team');
  update approvals set steps = steps || jsonb_build_array(jsonb_build_object('level', ap.level, 'oleh', actor_email(), 'peran', case when v_owner then 'pemilik' else 'penyetuju' end,
    'keputusan', case when p_approve then 'setuju' else 'tolak' end, 'catatan', v_note, 'pada', now())) where id = p_id;
  -- Tingkat 1 disetujui penyetuju, masih perlu pemilik
  if p_approve and not v_owner and ap.levels_needed > 1 then
    update approvals set level = 2 where id = p_id;
    return jsonb_build_object('status', 'menunggu', 'level', 2);
  end if;
  perform set_config('prasara.approval_exec', p_id::text, true);
  v_res := approval_decide_core(p_id, p_approve, p_note);
  perform set_config('prasara.approval_exec', '', true);
  return v_res;
end $$;
revoke execute on function public.approval_decide(uuid, boolean, text) from public, anon;
grant execute on function public.approval_decide(uuid, boolean, text) to authenticated;

-- Aturan tingkat (Pro)
create or replace function public.approval_levels_set(p_kos uuid, p_action text, p_levels int, p_min numeric)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not member_can(p_kos, 'team') then raise exception 'Khusus pemilik bisnis'; end if;
  if not plan_has(p_kos, 'persetujuan_bertingkat') then raise exception 'BATAS_PAKET: Persetujuan bertingkat tersedia di Paket Pro.'; end if;
  if p_levels not in (1, 2) then raise exception 'Tingkat persetujuan 1 atau 2'; end if;
  if p_min is not null and p_min < 0 then raise exception 'Nominal tidak valid'; end if;
  if not exists (select 1 from approval_actions where code = p_action) then raise exception 'Tindakan tidak dikenal'; end if;
  insert into approval_rules(kos_id, action_code, required, levels, level2_min, updated_by)
  values (p_kos, p_action, approval_required(p_kos, p_action), p_levels, case when p_levels = 2 then p_min end, actor_email())
  on conflict (kos_id, action_code) do update set levels = excluded.levels, level2_min = excluded.level2_min, updated_by = excluded.updated_by, updated_at = now();
  perform config_log(p_kos, 'ubah_tingkat_persetujuan', p_action, null, jsonb_build_object('tingkat', p_levels, 'mulai_nominal', p_min), null, 'menengah', actor_email());
end $$;
revoke execute on function public.approval_levels_set(uuid, text, int, numeric) from public, anon;
grant execute on function public.approval_levels_set(uuid, text, int, numeric) to authenticated;

create or replace function public.approval_rules_list(p_kos uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare t text;
begin
  if not is_member(p_kos) then raise exception 'Tidak punya akses'; end if;
  select business_type into t from kos where id = p_kos;
  return (select coalesce(jsonb_agg(jsonb_build_object('code', a.code, 'label', a.label, 'risk', a.risk, 'required', approval_required(p_kos, a.code),
            'levels', coalesce(r.levels, 1), 'level2_min', r.level2_min) order by a.sort), '[]')
          from approval_actions a left join approval_rules r on r.kos_id = p_kos and r.action_code = a.code where t = any(a.applies_to));
end $$;
revoke execute on function public.approval_is_approver(uuid), public.approval_can_decide(uuid), public.approval_perm(uuid, text) from public, anon;
grant execute on function public.approval_can_decide(uuid) to authenticated;

-- ---------- 3) Otomatisasi lanjutan ----------
alter table public.automation_recipes add column if not exists tier text not null default 'dasar';
alter table public.automation_recipes drop constraint if exists automation_recipes_tier_check;
alter table public.automation_recipes add constraint automation_recipes_tier_check check (tier in ('dasar', 'lanjutan'));

insert into public.automation_recipes(code, name, applies_to, trigger_text, condition_text, action_text, default_params, sends_email, needs_approval, sort, tier) values
  ('pesanan_terlambat', 'Pesanan lewat janji selesai', '{jasa}', 'Setiap pagi 07.00', 'Ada pesanan belum diserahkan yang sudah lewat waktu janji selesai',
     'Buat pemberitahuan berisi daftar pesanan', '{}', false, false, 30, 'dasar'),
  ('sewa_berakhir', 'Sewa segera berakhir', '{properti}', 'Setiap pagi 07.00', 'Ada sewa dengan rencana selesai dalam N hari',
     'Buat pemberitahuan agar sempat menawarkan perpanjangan atau menyiapkan kamar', '{"hari": 14}', false, false, 40, 'lanjutan'),
  ('penjualan_turun', 'Penjualan turun', '{retail,jasa}', 'Setiap pagi 07.00 (paling banyak sekali seminggu)', 'Penjualan 7 hari terakhir turun minimal N% dibanding 7 hari sebelumnya',
     'Buat pemberitahuan berisi perbandingan; kirim email ke pemilik', '{"persen": 30}', true, false, 41, 'lanjutan'),
  ('anggaran_lewat', 'Biaya mendekati anggaran', '{properti,retail,jasa,kustom}', 'Setiap pagi 07.00', 'Biaya bulan ini di suatu kategori sudah mencapai N% dari anggarannya',
     'Buat pemberitahuan berisi kategori yang hampir/sudah melewati anggaran; kirim email ke pemilik', '{"persen": 90}', true, false, 42, 'lanjutan'),
  ('ringkasan_mingguan', 'Ringkasan mingguan', '{properti,retail,jasa}', 'Setiap Senin 07.00', 'Selalu (minggu sebelumnya, Senin–Minggu)',
     'Buat pemberitahuan pendapatan & pengeluaran minggu lalu dibanding minggu sebelumnya; kirim email ke pemilik', '{}', true, false, 43, 'lanjutan')
on conflict (code) do nothing;

-- Resep baru di mesin aturan
select public._prasara_patch('public.automation_run_rule(uuid,text)',
  '        v_email boolean;',
  '        v_email boolean; v_prev numeric; v_pct numeric; v_w0 date;');
select public._prasara_patch('public.automation_run_rule(uuid,text)',
  E'    end if;\n\n    update automation_runs set status = ''ok''',
  E'    elsif ru.recipe = ''pesanan_terlambat'' then
      select jsonb_agg(jsonb_build_object(''nama'', o.number || '' · '' || coalesce(o.customer_name, ''-''), ''due'', (o.due_at at time zone ''Asia/Jakarta'')::date) order by o.due_at), count(*)
        into v_items, v_n from svc_orders o where o.kos_id = k.id and o.status in (''diterima'', ''proses'', ''siap'') and o.due_at is not null and o.due_at < now();
      if v_n > 0 then
        insert into automation_notices(kos_id, rule_id, title, body, items, href) values (k.id, ru.id, v_n || '' pesanan lewat janji selesai'', ''Kabari pelanggan atau percepat prosesnya.'', v_items, ''/pesanan'');
        v_out := jsonb_build_object(''jumlah'', v_n);
      end if;
    elsif ru.recipe = ''sewa_berakhir'' then
      select jsonb_agg(jsonb_build_object(''kamar'', r.code, ''penghuni'', o.name, ''due'', l.end_date) order by l.end_date), count(*) into v_items, v_n
      from leases l join rooms r on r.id = l.room_id join occupants o on o.id = l.occupant_id
      where l.kos_id = k.id and l.status = ''aktif'' and l.end_date between v_today and v_today + coalesce((ru.params->>''hari'')::int, 14);
      if v_n > 0 then
        insert into automation_notices(kos_id, rule_id, title, body, items, href) values (k.id, ru.id, v_n || '' sewa segera berakhir'', ''Tawarkan perpanjangan atau siapkan kamar untuk penghuni baru.'', v_items, ''/penghuni'');
        v_out := jsonb_build_object(''jumlah'', v_n);
      end if;
    elsif ru.recipe = ''penjualan_turun'' then
      v_key := ru.recipe || '':'' || to_char(v_today, ''IYYY-IW'');   -- paling banyak sekali seminggu
      if p_trigger = ''jadwal'' and exists (select 1 from automation_runs where rule_id = ru.id and dedupe_key = v_key and status = ''ok'') then
        update automation_runs set status = ''dilewati'', output = ''{"alasan": "sudah diberitahukan minggu ini"}'', finished_at = now() where id = v_run;
        return jsonb_build_object(''status'', ''dilewati'');
      end if;
      if k.business_type = ''retail'' then
        v_rev := coalesce((select sum(total) from sales where kos_id = k.id and status = ''selesai'' and sale_date between v_today - 7 and v_today - 1), 0);
        v_prev := coalesce((select sum(total) from sales where kos_id = k.id and status = ''selesai'' and sale_date between v_today - 14 and v_today - 8), 0);
      else
        v_rev := coalesce((select sum(total) from svc_orders where kos_id = k.id and status = ''selesai'' and completed_date between v_today - 7 and v_today - 1), 0);
        v_prev := coalesce((select sum(total) from svc_orders where kos_id = k.id and status = ''selesai'' and completed_date between v_today - 14 and v_today - 8), 0);
      end if;
      v_pct := case when v_prev > 0 then round((v_prev - v_rev) / v_prev * 100) end;
      if v_pct is not null and v_pct >= coalesce((ru.params->>''persen'')::numeric, 30) then
        insert into automation_notices(kos_id, rule_id, title, body, items, href, email_to)
        values (k.id, ru.id, ''Penjualan turun '' || v_pct || ''%'',
                ''7 hari terakhir '' || replace(to_char(v_rev, ''FM999,999,999,990''), '','', ''.'') || '' · 7 hari sebelumnya '' || replace(to_char(v_prev, ''FM999,999,999,990''), '','', ''.''),
                jsonb_build_object(''sekarang'', v_rev, ''sebelumnya'', v_prev, ''turun_persen'', v_pct), case when k.business_type = ''retail'' then ''/laporan-toko'' else ''/laporan-jasa'' end,
                case when v_email then v_owner end);
        v_out := jsonb_build_object(''turun_persen'', v_pct);
      else
        v_key := null;   -- tidak ada pemberitahuan: boleh diperiksa lagi besok
        v_out := jsonb_build_object(''turun_persen'', coalesce(v_pct, 0));
      end if;
    elsif ru.recipe = ''anggaran_lewat'' then
      v_m0 := date_trunc(''month'', v_today)::date;
      select jsonb_agg(jsonb_build_object(''nama'', z.name, ''sisa'', z.real, ''anggaran'', z.amount, ''persen'', z.pct) order by z.pct desc), count(*) into v_items, v_n
      from (select c.name, b.amount, coalesce(sum(e.amount), 0) as real, round(coalesce(sum(e.amount), 0) / b.amount * 100) as pct
            from budgets b join expense_categories c on c.id = b.category_id
            left join expenses e on e.kos_id = b.kos_id and e.category_id = b.category_id and e.date between v_m0 and v_today
            where b.kos_id = k.id and b.month = v_m0 and b.amount > 0
            group by c.name, b.amount
            having coalesce(sum(e.amount), 0) >= b.amount * coalesce((ru.params->>''persen'')::numeric, 90) / 100) z;
      -- sekali per bulan untuk tiap jumlah kategori (kategori baru yang melewati batas memicu pemberitahuan lagi)
      v_key := ru.recipe || '':'' || to_char(v_m0, ''YYYY-MM'') || '':'' || coalesce(v_n, 0);
      if v_n > 0 and not exists (select 1 from automation_runs where rule_id = ru.id and dedupe_key = v_key and status = ''ok'') then
        insert into automation_notices(kos_id, rule_id, title, body, items, href, email_to)
        values (k.id, ru.id, v_n || '' kategori biaya mendekati/lewat anggaran'', ''Bulan '' || to_char(v_m0, ''MM/YYYY'') || ''. Periksa pengeluaran atau sesuaikan anggaran.'', v_items, ''/anggaran'',
                case when v_email then v_owner end);
        v_out := jsonb_build_object(''kategori'', v_n);
      else
        if v_n = 0 then v_key := null; end if;
        v_out := jsonb_build_object(''kategori'', coalesce(v_n, 0));
        if p_trigger = ''jadwal'' and v_n > 0 then
          update automation_runs set status = ''dilewati'', output = ''{"alasan": "sudah diberitahukan"}'', finished_at = now() where id = v_run;
          return jsonb_build_object(''status'', ''dilewati'');
        end if;
      end if;
    elsif ru.recipe = ''ringkasan_mingguan'' then
      if p_trigger = ''jadwal'' and extract(isodow from v_today) <> 1 then
        update automation_runs set status = ''dilewati'', output = ''{"alasan": "bukan hari Senin"}'', finished_at = now() where id = v_run;
        return jsonb_build_object(''status'', ''dilewati'');
      end if;
      v_w0 := (date_trunc(''week'', v_today) - interval ''7 day'')::date;   -- Senin minggu lalu
      v_key := ru.recipe || '':'' || to_char(v_w0, ''IYYY-IW'');
      if k.business_type = ''retail'' then
        v_rev := coalesce((select sum(total) from sales where kos_id = k.id and status = ''selesai'' and sale_date between v_w0 and v_w0 + 6), 0);
        v_prev := coalesce((select sum(total) from sales where kos_id = k.id and status = ''selesai'' and sale_date between v_w0 - 7 and v_w0 - 1), 0);
      elsif k.business_type = ''jasa'' then
        v_rev := coalesce((select sum(total) from svc_orders where kos_id = k.id and status = ''selesai'' and completed_date between v_w0 and v_w0 + 6), 0);
        v_prev := coalesce((select sum(total) from svc_orders where kos_id = k.id and status = ''selesai'' and completed_date between v_w0 - 7 and v_w0 - 1), 0);
      else
        v_rev := coalesce((select sum(amount) from payments where kos_id = k.id and status = ''terverifikasi'' and paid_at between v_w0 and v_w0 + 6), 0);
        v_prev := coalesce((select sum(amount) from payments where kos_id = k.id and status = ''terverifikasi'' and paid_at between v_w0 - 7 and v_w0 - 1), 0);
      end if;
      v_prof := coalesce((select sum(amount) from expenses where kos_id = k.id and date between v_w0 and v_w0 + 6), 0);
      insert into automation_notices(kos_id, rule_id, title, body, items, href, email_to)
      values (k.id, ru.id, ''Ringkasan minggu '' || to_char(v_w0, ''DD/MM'') || ''–'' || to_char(v_w0 + 6, ''DD/MM''),
              ''Pendapatan '' || replace(to_char(v_rev, ''FM999,999,999,990''), '','', ''.'') || '' (minggu sebelumnya '' || replace(to_char(v_prev, ''FM999,999,999,990''), '','', ''.'') || '') · pengeluaran '' || replace(to_char(v_prof, ''FM999,999,999,990''), '','', ''.''),
              jsonb_build_object(''pendapatan'', v_rev, ''pendapatan_sebelumnya'', v_prev, ''pengeluaran'', v_prof, ''dari'', v_w0, ''sampai'', v_w0 + 6), ''/bisnis'', case when v_email then v_owner end);
      v_out := jsonb_build_object(''pendapatan'', v_rev, ''pengeluaran'', v_prof);
    end if;

    update automation_runs set status = ''ok''');

-- Jadwal harian: resep lanjutan hanya untuk Pro; "hari jalan" (Pro) membatasi hari dalam seminggu
create or replace function public.automation_day_ok(p_kos uuid, p_params jsonb)
returns boolean language sql stable security definer set search_path = public as $$
  select jsonb_typeof(p_params -> 'hari_jalan') is distinct from 'array' or jsonb_array_length(p_params -> 'hari_jalan') = 0
      or not plan_has(p_kos, 'otomatisasi_lanjutan')
      or (p_params -> 'hari_jalan') @> to_jsonb(extract(isodow from (now() at time zone 'Asia/Jakarta'))::int);
$$;
revoke execute on function public.automation_day_ok(uuid, jsonb) from public, anon, authenticated;

create or replace function public.automation_tick()
returns jsonb language plpgsql security definer set search_path = public as $$
declare r record; v_res jsonb; n_ok int := 0; n_fail int := 0; n_skip int := 0;
begin
  for r in select ru.id from automation_rules ru join kos k on k.id = ru.kos_id join automation_recipes rc on rc.code = ru.recipe
           where ru.enabled and k.suspended_at is null and k.closed_at is null and plan_has(k.id, 'otomatisasi')
             and (rc.tier = 'dasar' or plan_has(k.id, 'otomatisasi_lanjutan'))
             and automation_day_ok(k.id, ru.params) loop
    v_res := automation_run_rule(r.id, 'jadwal');
    if v_res->>'status' = 'ok' then n_ok := n_ok + 1; elsif v_res->>'status' = 'gagal' then n_fail := n_fail + 1; else n_skip := n_skip + 1; end if;
  end loop;
  return jsonb_build_object('ok', n_ok, 'gagal', n_fail, 'dilewati', n_skip);
end $$;
revoke execute on function public.automation_tick() from public, anon, authenticated;
grant execute on function public.automation_tick() to service_role;

select public._prasara_patch('public.automation_set(uuid,text,boolean,jsonb)',
  'if p_enabled and not plan_has(p_kos, ''otomatisasi'') then raise exception ''BATAS_PAKET: Otomatisasi tersedia mulai Paket Bisnis.''; end if;',
  'if p_enabled and not plan_has(p_kos, ''otomatisasi'') then raise exception ''BATAS_PAKET: Otomatisasi tersedia mulai Paket Bisnis.''; end if;
  if p_enabled and not plan_has(p_kos, ''otomatisasi_lanjutan'') and (select tier from automation_recipes where code = p_recipe) = ''lanjutan'' then
    raise exception ''BATAS_PAKET: Otomatisasi lanjutan tersedia di Paket Pro.''; end if;
  if jsonb_typeof(p_params -> ''hari_jalan'') = ''array'' and jsonb_array_length(p_params -> ''hari_jalan'') > 0 then
    if not plan_has(p_kos, ''otomatisasi_lanjutan'')
       and (p_params -> ''hari_jalan'') is distinct from (select params -> ''hari_jalan'' from automation_rules where kos_id = p_kos and recipe = p_recipe) then
      raise exception ''BATAS_PAKET: Memilih hari jalan otomatisasi tersedia di Paket Pro.''; end if;
    if exists (select 1 from jsonb_array_elements(p_params -> ''hari_jalan'') d where jsonb_typeof(d) <> ''number'' or d::int not between 1 and 7) then
      raise exception ''Hari jalan tidak valid''; end if;
  end if;');
select public._prasara_patch('public.automation_run_now(uuid)',
  'if not plan_has(ru.kos_id, ''otomatisasi'') then raise exception ''BATAS_PAKET: Otomatisasi tersedia mulai Paket Bisnis.''; end if;',
  'if not plan_has(ru.kos_id, ''otomatisasi'') then raise exception ''BATAS_PAKET: Otomatisasi tersedia mulai Paket Bisnis.''; end if;
  if not plan_has(ru.kos_id, ''otomatisasi_lanjutan'') and (select tier from automation_recipes where code = ru.recipe) = ''lanjutan'' then
    raise exception ''BATAS_PAKET: Otomatisasi lanjutan tersedia di Paket Pro.''; end if;');

-- ---------- 4) Growth: event & penawaran fitur Pro, syarat Pro Tahunan ----------
alter table public.growth_rules drop constraint if exists growth_rules_trigger_event_check;
alter table public.growth_rules add constraint growth_rules_trigger_event_check
  check (trigger_event is null or trigger_event in ('LAPORAN.DIBUKA', 'TRANSAKSI.PERTAMA', 'REPORT.ADVANCED_REQUESTED', 'PORTAL.PUBLIC_PAGE.REQUESTED',
    'PORTAL.CATALOG.REQUESTED', 'PORTAL.REGISTRATION.REQUESTED', 'PORTAL.BOOKING.REQUESTED', 'PORTAL.SYNC.REQUESTED',
    'FINANCE.MANUAL_JOURNAL_REQUESTED', 'FINANCE.RECONCILIATION_REQUESTED', 'BUDGET.CREATE_REQUESTED', 'TRANSACTION.APPROVAL_REQUESTED', 'WORKFLOW.REQUESTED',
    'ACCESS.MODULE.REQUESTED', 'ACCESS.GRANULAR.REQUESTED', 'APPROVAL.MULTILEVEL.REQUESTED', 'WORKFLOW.ADVANCED.REQUESTED'));
create or replace function public.growth_event_feature(p_event text)
returns text language sql immutable as $$
  select case p_event when 'FINANCE.MANUAL_JOURNAL_REQUESTED' then 'jurnal_manual' when 'FINANCE.RECONCILIATION_REQUESTED' then 'rekonsiliasi'
    when 'BUDGET.CREATE_REQUESTED' then 'anggaran' when 'TRANSACTION.APPROVAL_REQUESTED' then 'persetujuan' when 'WORKFLOW.REQUESTED' then 'otomatisasi'
    when 'REPORT.ADVANCED_REQUESTED' then 'laporan_lanjutan'
    when 'PORTAL.PUBLIC_PAGE.REQUESTED' then 'portal_bisnis' when 'PORTAL.CATALOG.REQUESTED' then 'portal_bisnis'
    when 'PORTAL.REGISTRATION.REQUESTED' then 'portal_bisnis' when 'PORTAL.BOOKING.REQUESTED' then 'portal_bisnis' when 'PORTAL.SYNC.REQUESTED' then 'portal_bisnis'
    when 'ACCESS.MODULE.REQUESTED' then 'akses_modul' when 'ACCESS.GRANULAR.REQUESTED' then 'akses_granular'
    when 'APPROVAL.MULTILEVEL.REQUESTED' then 'persetujuan_bertingkat' when 'WORKFLOW.ADVANCED.REQUESTED' then 'otomatisasi_lanjutan' end;
$$;

insert into public.growth_rules(id, name, context, kind, from_plan, to_plan, to_months, trigger_event, title, message, cta, cta_secondary, priority, frequency_days, general, updated_by)
select 'UPGRADE.ACCESS.MODULE.' || upper(p.k), 'Akses karyawan per modul (' || p.n || ')', 'fitur', 'upgrade', p.k, 'bisnis', 1, 'ACCESS.MODULE.REQUESTED',
  'Atur akses tiap karyawan per modul.',
  'Di Paket Bisnis Anda memilih sendiri modul yang boleh dibuka setiap karyawan, misalnya kasir yang juga boleh mengurus stok, tanpa membuka laporan keuangan.',
  'Upgrade ke Paket Bisnis', 'Nanti saja', 30, 7, false, 'sistem'
from (values ('gratis', 'Gratis'), ('dasar', 'Dasar')) as p(k, n)
on conflict (id) do nothing;
insert into public.growth_rules(id, name, context, kind, from_plan, to_plan, to_months, trigger_event, title, message, cta, cta_secondary, priority, frequency_days, general, updated_by)
select f.id || '.' || upper(p.k), f.name || ' (' || p.n || ')', 'fitur', 'upgrade', p.k, 'pro', 1, f.ev, f.title, f.msg, 'Upgrade ke Paket Pro', 'Nanti saja', 25, 7, false, 'sistem'
from (values ('gratis', 'Gratis'), ('dasar', 'Dasar'), ('bisnis', 'Bisnis')) as p(k, n),
     (values ('UPGRADE.ACCESS.GRANULAR', 'Izin per tindakan', 'ACCESS.GRANULAR.REQUESTED', 'Kendalikan setiap tindakan karyawan.',
              'Paket Pro mengatur izin per tindakan untuk tiap karyawan: boleh langsung, perlu persetujuan, atau tidak boleh sama sekali.'),
             ('UPGRADE.APPROVAL.MULTI', 'Persetujuan bertingkat', 'APPROVAL.MULTILEVEL.REQUESTED', 'Bagi tugas persetujuan dengan tim Anda.',
              'Paket Pro memungkinkan pengelola menyetujui tingkat pertama, dan transaksi bernilai besar tetap menunggu keputusan Anda.'),
             ('UPGRADE.WORKFLOW.ADV', 'Otomatisasi lanjutan', 'WORKFLOW.ADVANCED.REQUESTED', 'Biarkan sistem mengawasi bisnis untuk Anda.',
              'Paket Pro menambah otomatisasi lanjutan: peringatan penjualan turun, biaya mendekati anggaran, sewa segera berakhir, ringkasan mingguan, dan pilihan hari jalan.')) as f(id, name, ev, title, msg)
on conflict (id) do nothing;

-- Pro Tahunan (§6.4): Pro bulanan berbayar + salah satu syarat: aktif ≥30 hari, memakai Portal, mendekati perpanjangan (≤7 hari),
-- atau sudah beberapa kali memperpanjang (≥2 aktivasi Pro berbayar). Frekuensi tetap maks. sekali per 30 hari (frequency_days).
select public._prasara_patch('public.growth_offer(uuid,text,text)',
  'if v_first_pro is null or v_first_pro > now() - interval ''30 days'' then continue; end if;',
  'if v_first_pro is null then continue; end if;
      if not (v_first_pro <= now() - interval ''30 days''
              or exists (select 1 from public_pages pg where pg.kos_id = p_kos and pg.enabled)
              or (select paid_until from kos where id = p_kos) <= v_today + 7
              or (select count(*) from plan_activations pa where pa.kos_id = p_kos and pa.plan = ''pro'' and pa.months > 0) >= 2) then continue; end if;');

drop function public._prasara_patch(text, text, text);
