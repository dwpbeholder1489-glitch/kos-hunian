-- Tahap F Master Blueprint BI V2.0: daftar (register) risiko.
-- Keputusan pemilik 27 Nov 2026: dikelola area finance ATAU settings (pemilik/pengelola); PIC (anggota mana pun) melihat risiko
-- miliknya & memperbarui status penanganan; saran risiko dari data hanya DISARANKAN — masuk daftar bila diterima (tidak ada yang
-- tercatat otomatis); Paket Bisnis & Pro (fitur laporan_lanjutan).
-- Skor = kemungkinan × dampak (1–5 × 1–5). Tingkat: 1–4 rendah, 5–9 sedang, 10–14 tinggi, 15–25 sangat tinggi (lib/risk.js).

create table public.risks (
  id uuid primary key default gen_random_uuid(),
  kos_id uuid not null references public.kos(id) on delete cascade,
  number text not null,
  title text not null check (length(trim(title)) between 3 and 120),
  category text not null default 'operasional' check (category in ('keuangan', 'operasional', 'pasar', 'hukum', 'sdm', 'teknologi', 'reputasi', 'lainnya')),
  description text check (description is null or length(description) <= 1000),
  likelihood smallint not null check (likelihood between 1 and 5),
  impact smallint not null check (impact between 1 and 5),
  res_likelihood smallint check (res_likelihood between 1 and 5),
  res_impact smallint check (res_impact between 1 and 5),
  strategy text not null default 'kurangi' check (strategy in ('kurangi', 'hindari', 'alihkan', 'terima')),
  mitigation text check (mitigation is null or length(mitigation) <= 1000),
  owner_user uuid references auth.users(id) on delete set null,
  due_date date,
  review_days smallint not null default 30 check (review_days between 7 and 365),
  last_review date,
  next_review date not null,
  status text not null default 'terbuka' check (status in ('terbuka', 'ditangani', 'dipantau', 'ditutup')),
  source text not null default 'manual',
  log jsonb not null default '[]',
  created_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  closed_at timestamptz,
  unique (kos_id, number),
  check ((res_likelihood is null) = (res_impact is null))
);
create index risks_kos on public.risks(kos_id, status);
alter table public.risks enable row level security;
revoke all on public.risks from anon, authenticated;
create trigger zz_kos_open_guard before insert or update or delete on public.risks for each row execute function public.kos_open_guard();

-- Saran yang diabaikan pemilik (tidak muncul lagi sampai tanggal `until`)
create table public.risk_dismissals (
  kos_id uuid not null references public.kos(id) on delete cascade,
  code text not null check (code ~ '^[a-z_]{2,40}$'),
  until date not null,
  by_email text,
  at timestamptz not null default now(),
  primary key (kos_id, code)
);
alter table public.risk_dismissals enable row level security;
revoke all on public.risk_dismissals from anon, authenticated;
create trigger zz_kos_open_guard before insert or update or delete on public.risk_dismissals for each row execute function public.kos_open_guard();

create or replace function public.risk_manager(p_kos uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select member_in('finance', p_kos) or member_in('settings', p_kos);
$$;

create or replace function public.risk_guard(p_kos uuid)
returns void language plpgsql stable security definer set search_path = public as $$
begin
  if not risk_manager(p_kos) then raise exception 'Hanya pemilik atau pengelola (izin Keuangan/Pengaturan) yang mengelola daftar risiko'; end if;
  if not plan_has(p_kos, 'laporan_lanjutan') then raise exception 'BATAS_PAKET: Daftar risiko tersedia mulai Paket Bisnis.'; end if;
end $$;

create or replace function public.risk_row(r risks)
returns jsonb language sql stable security definer set search_path = public as $$
  select to_jsonb(r) - 'log' || jsonb_build_object('log', r.log, 'owner_label', case when r.owner_user is not null then prj_user_label(r.owner_user) end,
    'score', r.likelihood * r.impact, 'res_score', r.res_likelihood * r.res_impact,
    'review_due', r.status <> 'ditutup' and r.next_review <= (now() at time zone 'Asia/Jakarta')::date);
$$;

-- Simpan (buat bila p_id baru). p: title, category, description, likelihood, impact, res_likelihood, res_impact, strategy, mitigation,
-- owner_user, due_date, review_days, status, source ('manual' | 'saran:<kode>')
create or replace function public.risk_save(p_kos uuid, p_id uuid, p jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_today date := (now() at time zone 'Asia/Jakarta')::date; o risks; r risks; v_owner uuid := nullif(p ->> 'owner_user', '')::uuid;
        v_days int := coalesce(nullif(p ->> 'review_days', '')::int, 30); v_status text := coalesce(nullif(p ->> 'status', ''), 'terbuka');
        v_src text := coalesce(nullif(p ->> 'source', ''), 'manual');
begin
  perform risk_guard(p_kos);
  if v_owner is not null and not exists (select 1 from kos_members where kos_id = p_kos and user_id = v_owner and active) then
    raise exception 'Penanggung jawab harus anggota aktif bisnis ini'; end if;
  if v_src !~ '^(manual|saran:[a-z_]{2,40})$' then raise exception 'Sumber tidak valid'; end if;
  if v_days not between 7 and 365 then raise exception 'Jarak tinjau 7–365 hari'; end if;
  if (nullif(p ->> 'res_likelihood', '') is null) <> (nullif(p ->> 'res_impact', '') is null) then
    raise exception 'Isi kemungkinan DAN dampak setelah penanganan, atau kosongkan keduanya'; end if;
  select * into o from risks where id = p_id;
  if o.id is not null and o.kos_id <> p_kos then raise exception 'Risiko tidak ditemukan'; end if;
  if o.id is null then
    insert into risks(id, kos_id, number, title, category, description, likelihood, impact, res_likelihood, res_impact, strategy, mitigation,
                      owner_user, due_date, review_days, next_review, status, source, log, created_by, closed_at)
    values (coalesce(p_id, gen_random_uuid()), p_kos, prj_next_number(p_kos, 'RSK', 'risks'), trim(p ->> 'title'), coalesce(nullif(p ->> 'category', ''), 'operasional'),
            nullif(trim(coalesce(p ->> 'description', '')), ''), (p ->> 'likelihood')::smallint, (p ->> 'impact')::smallint,
            nullif(p ->> 'res_likelihood', '')::smallint, nullif(p ->> 'res_impact', '')::smallint, coalesce(nullif(p ->> 'strategy', ''), 'kurangi'),
            nullif(trim(coalesce(p ->> 'mitigation', '')), ''), v_owner, nullif(p ->> 'due_date', '')::date, v_days, v_today + v_days, v_status, v_src,
            jsonb_build_array(jsonb_build_object('at', now(), 'by', actor_email(), 'ev', 'dibuat', 'skor', (p ->> 'likelihood')::int * (p ->> 'impact')::int)),
            actor_email(), case when v_status = 'ditutup' then now() end)
    returning * into r;
    perform config_log(p_kos, 'buat_risiko', r.number || ' · ' || r.title, null, jsonb_build_object('skor', r.likelihood * r.impact, 'sumber', v_src), null, 'rendah', null);
  else
    update risks set title = trim(p ->> 'title'), category = coalesce(nullif(p ->> 'category', ''), category),
      description = nullif(trim(coalesce(p ->> 'description', '')), ''), likelihood = (p ->> 'likelihood')::smallint, impact = (p ->> 'impact')::smallint,
      res_likelihood = nullif(p ->> 'res_likelihood', '')::smallint, res_impact = nullif(p ->> 'res_impact', '')::smallint,
      strategy = coalesce(nullif(p ->> 'strategy', ''), strategy), mitigation = nullif(trim(coalesce(p ->> 'mitigation', '')), ''),
      owner_user = v_owner, due_date = nullif(p ->> 'due_date', '')::date, review_days = v_days,
      next_review = case when v_days <> o.review_days then coalesce(o.last_review, (o.created_at at time zone 'Asia/Jakarta')::date) + v_days else o.next_review end,
      status = v_status, closed_at = case when v_status = 'ditutup' then coalesce(o.closed_at, now()) end, updated_at = now(),
      log = o.log || jsonb_build_array(jsonb_build_object('at', now(), 'by', actor_email(), 'ev', 'diubah',
              'skor', case when (p ->> 'likelihood')::int * (p ->> 'impact')::int <> o.likelihood * o.impact then (p ->> 'likelihood')::int * (p ->> 'impact')::int end,
              'status', case when v_status <> o.status then v_status end,
              'pic', case when v_owner is distinct from o.owner_user then coalesce(prj_user_label(v_owner), '—') end))
    where id = o.id returning * into r;
    if v_status = 'ditutup' and o.status <> 'ditutup' then
      perform config_log(p_kos, 'tutup_risiko', r.number || ' · ' || r.title, jsonb_build_object('status', o.status), jsonb_build_object('status', 'ditutup'), null, 'rendah', null); end if;
  end if;
  return risk_row(r);
end $$;

-- Tinjauan berkala (pengelola): nilai ulang kemungkinan & dampak, jadwal tinjau berikutnya bergeser
create or replace function public.risk_review(p_kos uuid, p_id uuid, p_likelihood int, p_impact int, p_note text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_today date := (now() at time zone 'Asia/Jakarta')::date; o risks; r risks;
begin
  perform risk_guard(p_kos);
  select * into o from risks where id = p_id and kos_id = p_kos for update;
  if o.id is null then raise exception 'Risiko tidak ditemukan'; end if;
  if o.status = 'ditutup' then raise exception 'Risiko sudah ditutup. Buka lagi bila perlu ditinjau.'; end if;
  if p_likelihood not between 1 and 5 or p_impact not between 1 and 5 then raise exception 'Nilai 1–5'; end if;
  update risks set likelihood = p_likelihood, impact = p_impact, last_review = v_today, next_review = v_today + review_days, updated_at = now(),
    log = log || jsonb_build_array(jsonb_build_object('at', now(), 'by', actor_email(), 'ev', 'ditinjau', 'skor', p_likelihood * p_impact,
            'skor_lama', o.likelihood * o.impact, 'catatan', nullif(trim(coalesce(p_note, '')), '')))
  where id = o.id returning * into r;
  return risk_row(r);
end $$;

-- Perkembangan penanganan: PIC risiko itu atau pengelola. PIC tidak bisa menutup risiko (keputusan pengelola).
create or replace function public.risk_progress(p_kos uuid, p_id uuid, p_status text, p_note text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare o risks; r risks; v_mgr boolean := risk_manager(p_kos);
begin
  select * into o from risks where id = p_id and kos_id = p_kos for update;
  if o.id is null or not (v_mgr or coalesce(o.owner_user = auth.uid(), false)) then raise exception 'Risiko tidak ditemukan'; end if;
  if not plan_has(p_kos, 'laporan_lanjutan') then raise exception 'BATAS_PAKET: Daftar risiko tersedia mulai Paket Bisnis.'; end if;
  if p_status not in ('terbuka', 'ditangani', 'dipantau', 'ditutup') then raise exception 'Status tidak valid'; end if;
  if p_status = 'ditutup' and not v_mgr then raise exception 'Hanya pengelola yang menutup risiko'; end if;
  if o.status = 'ditutup' and not v_mgr then raise exception 'Risiko sudah ditutup'; end if;
  if p_status = o.status and length(trim(coalesce(p_note, ''))) < 3 then raise exception 'Tulis catatan perkembangan'; end if;
  update risks set status = p_status, closed_at = case when p_status = 'ditutup' then coalesce(closed_at, now()) end, updated_at = now(),
    log = log || jsonb_build_array(jsonb_build_object('at', now(), 'by', actor_email(), 'ev', 'perkembangan',
            'status', case when p_status <> o.status then p_status end, 'catatan', nullif(trim(coalesce(p_note, '')), '')))
  where id = o.id returning * into r;
  if p_status = 'ditutup' and o.status <> 'ditutup' then
    perform config_log(p_kos, 'tutup_risiko', r.number || ' · ' || r.title, jsonb_build_object('status', o.status), jsonb_build_object('status', 'ditutup'), nullif(trim(coalesce(p_note, '')), ''), 'rendah', null); end if;
  return risk_row(r);
end $$;

create or replace function public.risk_dismiss(p_kos uuid, p_code text, p_days int)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform risk_guard(p_kos);
  if p_days not between 7 and 365 then raise exception 'Jangka 7–365 hari'; end if;
  insert into risk_dismissals(kos_id, code, until, by_email) values (p_kos, p_code, (now() at time zone 'Asia/Jakarta')::date + p_days, actor_email())
  on conflict (kos_id, code) do update set until = excluded.until, by_email = excluded.by_email, at = now();
end $$;

-- Sinyal data untuk saran (dihitung server, dipakai lib/risk.js bersama scenario_baseline): tagihan/piutang lewat jatuh tempo
create or replace function public.risk_signals(p_kos uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_today date := (now() at time zone 'Asia/Jakarta')::date; v_type text;
begin
  if not risk_manager(p_kos) then raise exception 'Tidak punya akses'; end if;
  select business_type into v_type from kos where id = p_kos;
  return jsonb_build_object(
    'piutang_lewat', case when v_type = 'properti' then
        (select coalesce(sum(i.amount - coalesce((select sum(p.amount) from payments p where p.invoice_id = i.id and p.status = 'terverifikasi'), 0)), 0)
         from invoices i where i.kos_id = p_kos and i.status = 'terbit' and i.due_date < v_today)
      else (select coalesce(sum(open_amount), 0) from receivable_open_core(p_kos) where due_date < v_today) end,
    'piutang_lewat_n', case when v_type = 'properti' then
        (select count(*) from invoices i where i.kos_id = p_kos and i.status = 'terbit' and i.due_date < v_today
           and i.amount > coalesce((select sum(p.amount) from payments p where p.invoice_id = i.id and p.status = 'terverifikasi'), 0))
      else (select count(*) from receivable_open_core(p_kos) where due_date < v_today and open_amount > 0) end);
end $$;

create or replace function public.risk_list(p_kos uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_mgr boolean := risk_manager(p_kos); v_today date := (now() at time zone 'Asia/Jakarta')::date;
begin
  if not v_mgr and not exists (select 1 from kos_members where kos_id = p_kos and user_id = auth.uid() and active) then raise exception 'Tidak punya akses'; end if;
  return jsonb_build_object('manager', v_mgr, 'aktif', plan_has(p_kos, 'laporan_lanjutan'), 'hari_ini', v_today,
    'risks', (select coalesce(jsonb_agg(risk_row(r) order by r.status = 'ditutup', r.likelihood * r.impact desc, r.number), '[]') from risks r
              where r.kos_id = p_kos and (v_mgr or r.owner_user = auth.uid())),
    'members', case when v_mgr then (select coalesce(jsonb_agg(jsonb_build_object('user_id', m.user_id, 'label', prj_user_label(m.user_id), 'role', m.role) order by m.role = 'pemilik' desc), '[]')
                                     from kos_members m where m.kos_id = p_kos and m.active) end,
    'dismissed', case when v_mgr then (select coalesce(jsonb_agg(code), '[]') from risk_dismissals where kos_id = p_kos and until > v_today) end);
end $$;

-- Menu: PIC tanpa izin Keuangan/Pengaturan melihat menu Daftar risiko bila punya risiko terbuka
create or replace function public.my_access()
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_object_agg(m.kos_id, jsonb_build_object(
    'areas', case when m.areas is not null and plan_has(m.kos_id, 'akses_modul') then to_jsonb(m.areas) end,
    'approver', m.can_approve and plan_has(m.kos_id, 'persetujuan_bertingkat'),
    'risks', (select count(*) from risks r where r.kos_id = m.kos_id and r.owner_user = m.user_id and r.status <> 'ditutup'))), '{}'::jsonb)
  from kos_members m where m.user_id = auth.uid() and m.active and m.role <> 'pemilik'
    and ((m.areas is not null and plan_has(m.kos_id, 'akses_modul')) or (m.can_approve and plan_has(m.kos_id, 'persetujuan_bertingkat'))
         or exists (select 1 from risks r where r.kos_id = m.kos_id and r.owner_user = m.user_id and r.status <> 'ditutup'));
$$;

revoke execute on function public.risk_manager(uuid), public.risk_guard(uuid), public.risk_row(risks) from public, anon, authenticated;
revoke execute on function public.risk_save(uuid, uuid, jsonb), public.risk_review(uuid, uuid, int, int, text), public.risk_progress(uuid, uuid, text, text),
  public.risk_dismiss(uuid, text, int), public.risk_signals(uuid), public.risk_list(uuid) from public, anon;
grant execute on function public.risk_save(uuid, uuid, jsonb), public.risk_review(uuid, uuid, int, int, text), public.risk_progress(uuid, uuid, text, text),
  public.risk_dismiss(uuid, text, int), public.risk_signals(uuid), public.risk_list(uuid) to authenticated;
