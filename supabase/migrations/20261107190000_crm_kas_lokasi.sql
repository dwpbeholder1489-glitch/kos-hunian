-- (1) CRM sederhana (blueprint 5.4): prospek + tahapan (pipeline), riwayat komunikasi & catatan layanan, tindak lanjut.
--     Memakai tabel kontak yang sudah ada (satu sumber data pelanggan); prospek yang jadi dicocokkan berdasarkan No. HP, bukan nama.
--     Data dibatasi seperlunya: nama, No. HP, kebutuhan — tanpa data sensitif.
-- (2) Kas & biaya per lokasi: biaya, kas lain, dan bayar kasbon/utang tercatat di lokasi kerja; saldo kas per lokasi;
--     pindah uang kas antar lokasi; laporan per lokasi dengan biaya & kontribusi.

create or replace function public._prasara_patch(p_sig text, p_old text, p_new text)
returns void language plpgsql as $$
declare d text;
begin
  d := pg_get_functiondef(p_sig::regprocedure);
  if position(p_old in d) = 0 then raise exception 'patch % : potongan tidak ditemukan: %', p_sig, left(p_old, 80); end if;
  execute replace(d, p_old, p_new);
end $$;

-- ================= (1) CRM =================
create table if not exists public.crm_leads (
  id uuid primary key default gen_random_uuid(),
  kos_id uuid not null references public.kos(id) on delete cascade,
  name text not null check (length(trim(name)) between 2 and 80),
  phone text,
  need text,
  source text not null default 'lainnya' check (source in ('wa', 'datang', 'telepon', 'rekomendasi', 'media_sosial', 'lainnya')),
  est_value numeric(14,2) check (est_value is null or est_value >= 0),
  stage text not null default 'baru' check (stage in ('baru', 'dihubungi', 'penawaran', 'jadi', 'batal')),
  lost_reason text,
  contact_id uuid references public.contacts(id),
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  closed_at timestamptz
);
create index if not exists crm_leads_kos on public.crm_leads(kos_id, stage);
create table if not exists public.crm_activities (
  id uuid primary key default gen_random_uuid(),
  kos_id uuid not null references public.kos(id) on delete cascade,
  lead_id uuid references public.crm_leads(id) on delete cascade,
  contact_id uuid references public.contacts(id) on delete cascade,
  kind text not null check (kind in ('catatan', 'telepon', 'wa', 'kunjungan', 'layanan', 'tahap')),
  body text not null check (length(trim(body)) between 1 and 1000),
  created_email text,
  created_at timestamptz not null default now(),
  check (lead_id is not null or contact_id is not null)
);
create index if not exists crm_activities_lead on public.crm_activities(lead_id, created_at desc);
create index if not exists crm_activities_contact on public.crm_activities(contact_id, created_at desc);
create table if not exists public.crm_tasks (
  id uuid primary key default gen_random_uuid(),
  kos_id uuid not null references public.kos(id) on delete cascade,
  lead_id uuid references public.crm_leads(id) on delete cascade,
  contact_id uuid references public.contacts(id) on delete cascade,
  title text not null check (length(trim(title)) between 2 and 200),
  due_date date not null,
  done_at timestamptz,
  done_by text,
  created_email text,
  created_at timestamptz not null default now(),
  check (lead_id is not null or contact_id is not null)
);
create index if not exists crm_tasks_open on public.crm_tasks(kos_id, due_date) where done_at is null;
alter table public.crm_leads enable row level security;
alter table public.crm_activities enable row level security;
alter table public.crm_tasks enable row level security;
drop policy if exists crm_leads_select on public.crm_leads;
create policy crm_leads_select on public.crm_leads for select using (public.member_can(kos_id, 'sell,rent'));
drop policy if exists crm_activities_select on public.crm_activities;
create policy crm_activities_select on public.crm_activities for select using (public.member_can(kos_id, 'sell,rent'));
drop policy if exists crm_tasks_select on public.crm_tasks;
create policy crm_tasks_select on public.crm_tasks for select using (public.member_can(kos_id, 'sell,rent'));
grant select on public.crm_leads, public.crm_activities, public.crm_tasks to authenticated;
-- Bisnis yang ditutup: hanya-baca (aturan tetap untuk tabel baru ber-kos_id)
drop trigger if exists zz_kos_open_guard on public.crm_leads;
create trigger zz_kos_open_guard before insert or update or delete on public.crm_leads for each row execute function public.kos_open_guard();
drop trigger if exists zz_kos_open_guard on public.crm_activities;
create trigger zz_kos_open_guard before insert or update or delete on public.crm_activities for each row execute function public.kos_open_guard();
drop trigger if exists zz_kos_open_guard on public.crm_tasks;
create trigger zz_kos_open_guard before insert or update or delete on public.crm_tasks for each row execute function public.kos_open_guard();

insert into public.modules(code, name, description, applies_to, core, depends_on, entitlement, paths, data_used, status, sort)
values ('u_crm', 'Prospek & tindak lanjut (CRM)', 'Catat calon pelanggan/penghuni, tahapannya, catatan komunikasi, dan jadwal tindak lanjut.', '{properti,retail}', false, '{}', null, '{/crm}', 'Nama, No. HP, kebutuhan prospek; catatan komunikasi', 'available', 25)
on conflict (code) do nothing;
insert into public.business_modules(kos_id, module_code, active, updated_by) select id, 'u_crm', true, 'sistem' from public.kos on conflict do nothing;

create or replace function public.crm_phone(p text)
returns text language sql immutable as $$
  select nullif(regexp_replace(regexp_replace(coalesce(p, ''), '[^0-9]', '', 'g'), '^(62|0)', ''), '');
$$;

create or replace function public.crm_guard(p_kos uuid)
returns void language plpgsql stable security definer set search_path = public as $$
begin
  if not member_in('sell,rent', p_kos) then raise exception 'Tidak punya akses ke bisnis ini'; end if;
  if not module_on(p_kos, 'u_crm') then raise exception 'Modul ini sedang nonaktif. Aktifkan di Pusat konfigurasi.'; end if;
end $$;

create or replace function public.crm_lead_save(p_kos uuid, p_id uuid, p_name text, p_phone text, p_need text, p_source text, p_est numeric)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v uuid := p_id; v_dup text; v_ph text := crm_phone(p_phone);
begin
  perform crm_guard(p_kos);
  if coalesce(length(trim(p_name)), 0) < 2 then raise exception 'Isi nama prospek'; end if;
  if v_ph is not null then
    select name into v_dup from contacts where kos_id = p_kos and archived_at is null and crm_phone(phone) = v_ph limit 1;
    if v_dup is null then select name || ' (prospek)' into v_dup from crm_leads where kos_id = p_kos and crm_phone(phone) = v_ph and stage not in ('jadi', 'batal') and id is distinct from p_id limit 1; end if;
  end if;
  if v is null then
    insert into crm_leads(kos_id, name, phone, need, source, est_value)
    values (p_kos, trim(p_name), nullif(trim(coalesce(p_phone, '')), ''), nullif(trim(coalesce(p_need, '')), ''), coalesce(p_source, 'lainnya'), p_est) returning id into v;
    insert into crm_activities(kos_id, lead_id, kind, body, created_email) values (p_kos, v, 'tahap', 'Prospek dicatat', actor_email());
  else
    update crm_leads set name = trim(p_name), phone = nullif(trim(coalesce(p_phone, '')), ''), need = nullif(trim(coalesce(p_need, '')), ''), source = coalesce(p_source, source), est_value = p_est, updated_at = now()
    where id = v and kos_id = p_kos;
    if not found then raise exception 'Prospek tidak ditemukan'; end if;
  end if;
  return jsonb_build_object('id', v, 'duplicate', v_dup);
end $$;

-- Tahapan prospek; transisi yang tidak masuk akal ditolak di server
create or replace function public.crm_lead_stage(p_lead uuid, p_stage text, p_reason text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare l crm_leads; k kos; v_contact uuid; v_note text; v_ok boolean;
begin
  select * into l from crm_leads where id = p_lead for update;
  if l.id is null then raise exception 'Prospek tidak ditemukan'; end if;
  perform crm_guard(l.kos_id);
  if p_stage = l.stage then return jsonb_build_object('stage', l.stage); end if;
  v_ok := case l.stage
    when 'baru' then p_stage in ('dihubungi', 'penawaran', 'jadi', 'batal')
    when 'dihubungi' then p_stage in ('penawaran', 'jadi', 'batal')
    when 'penawaran' then p_stage in ('dihubungi', 'jadi', 'batal')
    else p_stage = 'dihubungi' end;  -- jadi/batal hanya bisa dibuka lagi ke "dihubungi"
  if not v_ok then raise exception 'Tahap tidak bisa diubah dari % ke %', l.stage, p_stage; end if;
  if p_stage = 'batal' and coalesce(length(trim(p_reason)), 0) < 3 then raise exception 'Tuliskan alasan tidak jadi'; end if;
  if l.stage in ('jadi', 'batal') and coalesce(length(trim(p_reason)), 0) < 3 then raise exception 'Tuliskan alasan membuka kembali'; end if;
  select * into k from kos where id = l.kos_id;
  -- Toko: prospek yang jadi menjadi pelanggan (dicocokkan lewat No. HP; nama saja tidak cukup)
  if p_stage = 'jadi' and k.business_type = 'retail' and l.contact_id is null then
    if crm_phone(l.phone) is not null then
      select id into v_contact from contacts where kos_id = l.kos_id and kind = 'pelanggan' and archived_at is null and crm_phone(phone) = crm_phone(l.phone) limit 1;
    end if;
    if v_contact is null then
      insert into contacts(kos_id, kind, name, phone) values (l.kos_id, 'pelanggan', l.name, l.phone) returning id into v_contact;
      v_note := ' — ditambahkan sebagai pelanggan baru';
    else
      v_note := ' — dihubungkan ke pelanggan yang sudah ada (No. HP sama)';
    end if;
  end if;
  update crm_leads set stage = p_stage, lost_reason = case when p_stage = 'batal' then trim(p_reason) else null end,
    contact_id = coalesce(contact_id, v_contact), updated_at = now(), closed_at = case when p_stage in ('jadi', 'batal') then now() end
  where id = l.id;
  insert into crm_activities(kos_id, lead_id, contact_id, kind, body, created_email)
  values (l.kos_id, l.id, coalesce(l.contact_id, v_contact), 'tahap', 'Tahap: ' || l.stage || ' → ' || p_stage || coalesce(v_note, '') || coalesce(' · ' || nullif(trim(coalesce(p_reason, '')), ''), ''), actor_email());
  return jsonb_build_object('stage', p_stage, 'contact_id', coalesce(l.contact_id, v_contact));
end $$;

create or replace function public.crm_note(p_kos uuid, p_lead uuid, p_contact uuid, p_kind text, p_body text)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform crm_guard(p_kos);
  if p_kind not in ('catatan', 'telepon', 'wa', 'kunjungan', 'layanan') then raise exception 'Jenis catatan tidak dikenal'; end if;
  if p_lead is not null and not exists (select 1 from crm_leads where id = p_lead and kos_id = p_kos) then raise exception 'Prospek tidak ditemukan'; end if;
  if p_contact is not null and not exists (select 1 from contacts where id = p_contact and kos_id = p_kos) then raise exception 'Kontak tidak ditemukan'; end if;
  if p_lead is null and p_contact is null then raise exception 'Pilih prospek atau pelanggan'; end if;
  insert into crm_activities(kos_id, lead_id, contact_id, kind, body, created_email) values (p_kos, p_lead, p_contact, p_kind, trim(p_body), actor_email());
end $$;

create or replace function public.crm_task_add(p_kos uuid, p_lead uuid, p_contact uuid, p_title text, p_due date)
returns uuid language plpgsql security definer set search_path = public as $$
declare v uuid;
begin
  perform crm_guard(p_kos);
  if p_lead is not null and not exists (select 1 from crm_leads where id = p_lead and kos_id = p_kos) then raise exception 'Prospek tidak ditemukan'; end if;
  if p_contact is not null and not exists (select 1 from contacts where id = p_contact and kos_id = p_kos) then raise exception 'Kontak tidak ditemukan'; end if;
  if p_lead is null and p_contact is null then raise exception 'Pilih prospek atau pelanggan'; end if;
  if p_due is null then raise exception 'Isi tanggal tindak lanjut'; end if;
  insert into crm_tasks(kos_id, lead_id, contact_id, title, due_date, created_email) values (p_kos, p_lead, p_contact, trim(p_title), p_due, actor_email()) returning id into v;
  return v;
end $$;

create or replace function public.crm_task_done(p_task uuid, p_done boolean)
returns void language plpgsql security definer set search_path = public as $$
declare t crm_tasks;
begin
  select * into t from crm_tasks where id = p_task for update;
  if t.id is null then raise exception 'Tindak lanjut tidak ditemukan'; end if;
  perform crm_guard(t.kos_id);
  update crm_tasks set done_at = case when p_done then now() end, done_by = case when p_done then actor_email() end where id = t.id;
  if p_done then
    insert into crm_activities(kos_id, lead_id, contact_id, kind, body, created_email) values (t.kos_id, t.lead_id, t.contact_id, 'catatan', 'Selesai: ' || t.title, actor_email());
  end if;
end $$;

-- Ringkasan CRM: tahapan, tindak lanjut terbuka, konversi 90 hari (definisi: jadi ÷ (jadi + batal) yang ditutup 90 hari terakhir)
create or replace function public.crm_overview(p_kos uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare t date := (now() at time zone 'Asia/Jakarta')::date;
begin
  perform crm_guard(p_kos);
  return jsonb_build_object(
    'leads', (select coalesce(jsonb_agg(x order by x.stage_order, x.updated_at desc), '[]') from (
      select l.*, case l.stage when 'baru' then 1 when 'dihubungi' then 2 when 'penawaran' then 3 when 'jadi' then 4 else 5 end as stage_order,
        (select a.created_at from crm_activities a where a.lead_id = l.id order by a.created_at desc limit 1) as last_at,
        (select min(due_date) from crm_tasks k where k.lead_id = l.id and k.done_at is null) as next_due
      from crm_leads l where l.kos_id = p_kos and (l.stage not in ('jadi', 'batal') or l.closed_at > now() - interval '90 days')) x),
    'tasks', (select coalesce(jsonb_agg(jsonb_build_object('id', k.id, 'title', k.title, 'due_date', k.due_date, 'lead_id', k.lead_id, 'contact_id', k.contact_id,
        'name', coalesce(l.name, c.name), 'phone', coalesce(l.phone, c.phone), 'created_email', k.created_email) order by k.due_date, k.created_at), '[]')
      from crm_tasks k left join crm_leads l on l.id = k.lead_id left join contacts c on c.id = k.contact_id where k.kos_id = p_kos and k.done_at is null),
    'due', (select count(*) from crm_tasks where kos_id = p_kos and done_at is null and due_date <= t),
    'won90', (select count(*) from crm_leads where kos_id = p_kos and stage = 'jadi' and closed_at > now() - interval '90 days'),
    'lost90', (select count(*) from crm_leads where kos_id = p_kos and stage = 'batal' and closed_at > now() - interval '90 days'),
    'open_value', (select coalesce(sum(est_value), 0) from crm_leads where kos_id = p_kos and stage not in ('jadi', 'batal')));
end $$;

create or replace function public.crm_timeline(p_kos uuid, p_lead uuid, p_contact uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  perform crm_guard(p_kos);
  return jsonb_build_object(
    'activities', (select coalesce(jsonb_agg(jsonb_build_object('kind', a.kind, 'body', a.body, 'by', a.created_email, 'at', a.created_at) order by a.created_at desc), '[]')
      from crm_activities a where a.kos_id = p_kos and ((p_lead is not null and a.lead_id = p_lead) or (p_contact is not null and a.contact_id = p_contact))),
    'tasks', (select coalesce(jsonb_agg(jsonb_build_object('id', k.id, 'title', k.title, 'due_date', k.due_date, 'done_at', k.done_at, 'done_by', k.done_by) order by k.done_at nulls first, k.due_date), '[]')
      from crm_tasks k where k.kos_id = p_kos and ((p_lead is not null and k.lead_id = p_lead) or (p_contact is not null and k.contact_id = p_contact))));
end $$;

-- ================= (2) KAS & BIAYA PER LOKASI =================
alter table public.expenses add column if not exists branch_id uuid references public.branches(id);
alter table public.cash_entries add column if not exists branch_id uuid references public.branches(id);
alter table public.cash_entries add column if not exists to_branch uuid references public.branches(id);
alter table public.debt_payments add column if not exists branch_id uuid references public.branches(id);
alter table public.cash_entries drop constraint if exists cash_entries_kind_check;
alter table public.cash_entries add constraint cash_entries_kind_check check (kind in ('pendapatan_lain', 'setoran_modal', 'prive', 'pinjaman_masuk', 'bayar_pinjaman', 'setor_bank', 'tarik_bank', 'pindah_kas'));
drop trigger if exists expenses_loc on public.expenses;
create trigger expenses_loc before insert on public.expenses for each row execute function public.doc_loc();
drop trigger if exists cash_entries_loc on public.cash_entries;
create trigger cash_entries_loc before insert on public.cash_entries for each row execute function public.doc_loc();
drop trigger if exists debt_payments_loc on public.debt_payments;
create trigger debt_payments_loc before insert on public.debt_payments for each row execute function public.doc_loc();
-- pindah kas hanya lewat fungsi khusus (tidak lewat isian bebas)
create or replace function public.cash_entries_kind_guard()
returns trigger language plpgsql as $$
begin
  if new.kind = 'pindah_kas' and coalesce(current_setting('prasara.cash_move', true), '') <> '1' then raise exception 'Pindah kas antar lokasi lewat menu Kas › Pindahkan uang kas'; end if;
  return new;
end $$;
drop trigger if exists cash_entries_kind_guard on public.cash_entries;
create trigger cash_entries_kind_guard before insert or update on public.cash_entries for each row execute function public.cash_entries_kind_guard();

do $$
declare k record; v uuid;
begin
  for k in select id from kos where business_type = 'retail' loop
    v := branch_main_ensure(k.id);
    update expenses set branch_id = v where kos_id = k.id and branch_id is null;
    update cash_entries set branch_id = v where kos_id = k.id and branch_id is null;
    update debt_payments set branch_id = v where kos_id = k.id and branch_id is null;
  end loop;
end $$;

-- Saldo uang kas per lokasi (bank tetap satu untuk seluruh bisnis)
create or replace function public.cash_by_location_internal(p_kos uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  with m as (
    select branch_id b, total amt from sales where kos_id = p_kos and status = 'selesai' and pay_method = 'tunai'
    union all select s.branch_id, -r.total from sale_returns r join sales s on s.id = r.sale_id where r.kos_id = p_kos and r.refund_method = 'tunai'
    union all select branch_id, -total from purchases where kos_id = p_kos and status in ('selesai', 'sebagian') and pay_method = 'tunai'
    union all select b.branch_id, r.total from purchase_returns r join purchases b on b.id = r.purchase_id where r.kos_id = p_kos and r.refund_method = 'tunai'
    union all select branch_id, case when kind = 'piutang' then amount else -amount end from debt_payments where kos_id = p_kos and status = 'selesai' and account = 'kas'
    union all select branch_id, -amount from expenses where kos_id = p_kos and account = 'kas'
    union all select branch_id, case when kind in ('pendapatan_lain', 'setoran_modal', 'pinjaman_masuk', 'tarik_bank') then amount
                                     when kind in ('prive', 'bayar_pinjaman', 'setor_bank', 'pindah_kas') then -amount else 0 end from cash_entries where kos_id = p_kos and account = 'kas'
    union all select to_branch, amount from cash_entries where kos_id = p_kos and kind = 'pindah_kas'
  )
  select coalesce(jsonb_agg(jsonb_build_object('id', b.id, 'name', b.name, 'is_main', b.is_main, 'active', b.active, 'kas', coalesce(x.kas, 0)) order by b.is_main desc, b.name), '[]')
  from branches b left join (select coalesce(m.b, (select id from branches where kos_id = p_kos and is_main)) bid, sum(amt) kas from m group by 1) x on x.bid = b.id
  where b.kos_id = p_kos and (b.active or coalesce(x.kas, 0) <> 0);
$$;
create or replace function public.cash_by_location(p_kos uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if not member_in('finance', p_kos) then raise exception 'Tidak punya akses ke kas'; end if;
  return cash_by_location_internal(p_kos);
end $$;

create or replace function public.cash_move(p_kos uuid, p_from uuid, p_to uuid, p_amount numeric, p_date date, p_note text)
returns void language plpgsql security definer set search_path = public as $$
declare v_have numeric;
begin
  if not member_in('finance', p_kos) then raise exception 'Tidak punya akses ke kas'; end if;
  if p_from = p_to then raise exception 'Lokasi asal dan tujuan harus berbeda'; end if;
  if (select count(*) from branches where id in (p_from, p_to) and kos_id = p_kos and active) <> 2 then raise exception 'Lokasi tidak ditemukan atau nonaktif'; end if;
  if coalesce(p_amount, 0) <= 0 then raise exception 'Isi jumlah uang'; end if;
  if p_date is null or p_date > (now() at time zone 'Asia/Jakarta')::date then raise exception 'Tanggal tidak valid'; end if;
  select (x->>'kas')::numeric into v_have from jsonb_array_elements(cash_by_location_internal(p_kos)) x where (x->>'id')::uuid = p_from;
  if coalesce(v_have, 0) < p_amount then raise exception 'Uang kas tercatat di lokasi asal hanya Rp %', replace(to_char(coalesce(v_have, 0), 'FM999,999,999,999'), ',', '.'); end if;
  perform set_config('prasara.cash_move', '1', true);
  insert into cash_entries(kos_id, kind, date, amount, account, description, branch_id, to_branch)
  values (p_kos, 'pindah_kas', p_date, p_amount, 'kas', nullif(trim(coalesce(p_note, '')), ''), p_from, p_to);
  perform set_config('prasara.cash_move', '', true);
end $$;

-- Laporan per lokasi: penjualan, laba kotor, biaya operasional yang dicatat di lokasi itu, dan kontribusi
select public._prasara_patch('public.retail_report(uuid,date,date)',
  '''lokasi'', (select coalesce(jsonb_agg(row_to_json(z) order by z.omzet desc), ''[]''::jsonb) from (
        select coalesce(br.name, ''Lokasi utama'') as name, count(*)::int as trx, sum(s.total) as omzet, sum(s.total - s.cost_total) as laba
        from s left join branches br on br.id = s.branch_id group by 1) z),',
  '''lokasi'', (select coalesce(jsonb_agg(row_to_json(z) order by z.omzet desc), ''[]''::jsonb) from (
        select b.name, coalesce(x.trx, 0) as trx, coalesce(x.omzet, 0) as omzet, coalesce(x.laba, 0) as laba, coalesce(e.biaya, 0) as biaya, coalesce(x.laba, 0) - coalesce(e.biaya, 0) as kontribusi
        from branches b
        left join (select branch_id, count(*)::int as trx, sum(total) as omzet, sum(total - cost_total) as laba from s group by 1) x on x.branch_id = b.id
        left join (select branch_id, sum(amount) as biaya from expenses where kos_id = p_kos and kind = ''operasional'' and date between p_from and p_to group by 1) e on e.branch_id = b.id
        where b.kos_id = p_kos and (x.trx is not null or e.biaya is not null)) z),');

-- Ekspor Excel/PDF: ikut memuat lokasi pada biaya/kas dan data CRM
select public._prasara_patch('public.business_export_sheets(uuid)',
  '  s := s || xs(''Pengeluaran'', array[''Tanggal'', ''Kategori'', ''Jenis'', ''Jumlah'', ''Dari'', ''Keterangan''], array[''d'', ''t'', ''t'', ''r'', ''t'', ''t''],
    (select jsonb_agg(jsonb_build_array(e.date, c.name, e.kind, e.amount, e.account, e.description) order by e.date) from expenses e left join expense_categories c on c.id = e.category_id where e.kos_id = p_kos));
  s := s || xs(''Kas lainnya'', array[''Tanggal'', ''Jenis'', ''Jumlah'', ''Akun'', ''Keterangan''], array[''d'', ''t'', ''r'', ''t'', ''t''],
    (select jsonb_agg(jsonb_build_array(date, replace(kind, ''_'', '' ''), amount, account, description) order by date) from cash_entries where kos_id = p_kos));',
  '  s := s || xs(''Pengeluaran'', array[''Tanggal'', ''Kategori'', ''Jenis'', ''Jumlah'', ''Dari'', ''Lokasi'', ''Keterangan''], array[''d'', ''t'', ''t'', ''r'', ''t'', ''t'', ''t''],
    (select jsonb_agg(jsonb_build_array(e.date, c.name, e.kind, e.amount, e.account, b.name, e.description) order by e.date) from expenses e left join expense_categories c on c.id = e.category_id left join branches b on b.id = e.branch_id where e.kos_id = p_kos));
  s := s || xs(''Kas lainnya'', array[''Tanggal'', ''Jenis'', ''Jumlah'', ''Akun'', ''Lokasi'', ''Ke lokasi'', ''Keterangan''], array[''d'', ''t'', ''r'', ''t'', ''t'', ''t'', ''t''],
    (select jsonb_agg(jsonb_build_array(x.date, replace(x.kind, ''_'', '' ''), x.amount, x.account, b.name, t2.name, x.description) order by x.date) from cash_entries x left join branches b on b.id = x.branch_id left join branches t2 on t2.id = x.to_branch where x.kos_id = p_kos));
  if exists (select 1 from crm_leads where kos_id = p_kos) or exists (select 1 from crm_activities where kos_id = p_kos) then
    s := s || xs(''Prospek'', array[''Dicatat'', ''Nama'', ''No. HP'', ''Kebutuhan'', ''Sumber'', ''Perkiraan nilai'', ''Tahap'', ''Alasan tidak jadi''], array[''d'', ''t'', ''t'', ''t'', ''t'', ''r'', ''t'', ''t''],
      (select jsonb_agg(jsonb_build_array(created_at::date, name, phone, need, source, est_value, stage, lost_reason) order by created_at) from crm_leads where kos_id = p_kos));
    s := s || xs(''Catatan pelanggan'', array[''Waktu'', ''Prospek/pelanggan'', ''Jenis'', ''Isi'', ''Oleh''], array[''t'', ''t'', ''t'', ''t'', ''t''],
      (select jsonb_agg(jsonb_build_array(xs_time(a.created_at), coalesce(l.name, c.name), a.kind, a.body, a.created_email) order by a.created_at) from crm_activities a left join crm_leads l on l.id = a.lead_id left join contacts c on c.id = a.contact_id where a.kos_id = p_kos));
    s := s || xs(''Tindak lanjut'', array[''Jadwal'', ''Prospek/pelanggan'', ''Tugas'', ''Selesai'', ''Oleh''], array[''d'', ''t'', ''t'', ''t'', ''t''],
      (select jsonb_agg(jsonb_build_array(tk.due_date, coalesce(l.name, c.name), tk.title, xs_time(tk.done_at), coalesce(tk.done_by, tk.created_email)) order by tk.due_date) from crm_tasks tk left join crm_leads l on l.id = tk.lead_id left join contacts c on c.id = tk.contact_id where tk.kos_id = p_kos));
  end if;');

revoke execute on function public.crm_phone(text), public.crm_guard(uuid), public.cash_by_location_internal(uuid), public.cash_entries_kind_guard() from public, anon, authenticated;
revoke execute on function public.crm_lead_save(uuid, uuid, text, text, text, text, numeric), public.crm_lead_stage(uuid, text, text), public.crm_note(uuid, uuid, uuid, text, text),
  public.crm_task_add(uuid, uuid, uuid, text, date), public.crm_task_done(uuid, boolean), public.crm_overview(uuid), public.crm_timeline(uuid, uuid, uuid),
  public.cash_by_location(uuid), public.cash_move(uuid, uuid, uuid, numeric, date, text) from public, anon;
grant execute on function public.crm_lead_save(uuid, uuid, text, text, text, text, numeric), public.crm_lead_stage(uuid, text, text), public.crm_note(uuid, uuid, uuid, text, text),
  public.crm_task_add(uuid, uuid, uuid, text, date), public.crm_task_done(uuid, boolean), public.crm_overview(uuid), public.crm_timeline(uuid, uuid, uuid),
  public.cash_by_location(uuid), public.cash_move(uuid, uuid, uuid, numeric, date, text) to authenticated;

drop function public._prasara_patch(text, text, text);
