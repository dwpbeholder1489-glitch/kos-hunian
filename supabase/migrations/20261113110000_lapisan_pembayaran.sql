-- Lapisan pembayaran (Payment Gateway Layer), terpisah dari pengelolaan paket:
--   tagihan (plan_requests)  →  transaksi (pay_transactions, ID internal unik)  →  aktivasi paket (plan_activate, satu pintu)
--   notifikasi gateway (pay_events, idempoten)  →  cocok = lunas & aktif;  tidak cocok = antrean rekonsiliasi (pay_recon)
-- Lapisan ini TIDAK tahu format gateway mana pun: adaptor di server (tahap berikutnya) memverifikasi tanda tangan dan
-- menormalkan notifikasi, lalu memanggil pay_event_ingest. Tabel-tabel ini catatan penagihan platform (seperti plan_requests):
-- tidak diberi zz_kos_open_guard karena hanya ditulis oleh fungsi platform, bukan oleh pengguna bisnis.

-- ---------- Penyedia pembayaran ----------
create table if not exists public.pay_providers (
  code text primary key check (code ~ '^[a-z][a-z0-9_]{1,20}$'),
  name text not null,
  kind text not null default 'gateway' check (kind in ('manual', 'gateway')),
  active boolean not null default false,          -- gateway baru aktif setelah adaptor & notifikasi uji terverifikasi
  verified_at timestamptz,
  note text,
  created_at timestamptz not null default now()
);
insert into public.pay_providers(code, name, kind, active, note) values
  ('manual', 'QRIS / transfer (verifikasi admin)', 'manual', true, 'Pembayaran dicocokkan admin dengan mutasi rekening'),
  ('lynk', 'Lynk.id', 'gateway', false, 'Belum aktif: format notifikasi & tanda tangan belum diverifikasi dengan transaksi nyata')
on conflict (code) do nothing;

-- Link checkout tetap per paket & jangka (untuk gateway tanpa link dinamis)
create table if not exists public.pay_links (
  provider text not null references public.pay_providers(code) on update cascade,
  plan_key text not null references public.plans(key) on update cascade,
  months int not null check (months between 1 and 12),
  url text not null check (url ~ '^https://'),
  amount numeric(14,2) not null check (amount > 0),       -- nominal yang dipasang di gateway; harus sama dengan harga paket saat itu
  active boolean not null default true,
  updated_at timestamptz not null default now(),
  primary key (provider, plan_key, months)
);
insert into public.pay_links(provider, plan_key, months, url, amount) values
  ('lynk', 'dasar', 1, 'https://lynk.id/dewxyz55/regq4qeqe19l/checkout', 49000),
  ('lynk', 'bisnis', 1, 'https://lynk.id/dewxyz55/jk30n04y3jpx/checkout', 99000),
  ('lynk', 'pro', 1, 'https://lynk.id/dewxyz55/j4yr3rlk78lr/checkout', 149000),
  ('lynk', 'pro', 12, 'https://lynk.id/dewxyz55/5ml351rmw4r6/checkout', 1072800)
on conflict (provider, plan_key, months) do nothing;

-- ---------- Tagihan: status tambahan ----------
alter table public.plan_requests drop constraint if exists plan_requests_status_check;
alter table public.plan_requests add constraint plan_requests_status_check check (status in ('menunggu', 'disetujui', 'ditolak', 'batal', 'kedaluwarsa'));
alter table public.plan_requests drop constraint if exists plan_requests_method_check;
alter table public.plan_requests add constraint plan_requests_method_check check (method in ('qris', 'transfer', 'gateway'));

-- ---------- Transaksi pembayaran ----------
create table if not exists public.pay_transactions (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,                                -- ID transaksi internal, mis. TRX-261113-7K2M9QXA4D
  invoice_id uuid not null references public.plan_requests(id) on delete cascade,
  kos_id uuid not null references public.kos(id) on delete cascade,
  provider text not null references public.pay_providers(code) on update cascade,
  method text,
  amount numeric(14,2) not null check (amount >= 0),
  currency text not null default 'IDR',
  status text not null default 'pending' check (status in ('draft', 'pending', 'processing', 'paid', 'failed', 'expired', 'cancelled', 'refunded')),
  provider_ref text,                                        -- nomor transaksi di sisi gateway
  payer_email text,
  payer_name text,
  paid_at timestamptz,
  expires_at timestamptz,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists pay_trx_provider_ref on public.pay_transactions(provider, provider_ref) where provider_ref is not null;
create index if not exists pay_trx_invoice on public.pay_transactions(invoice_id);
create index if not exists pay_trx_kos on public.pay_transactions(kos_id, created_at desc);

-- ---------- Riwayat aktivasi paket ----------
create table if not exists public.plan_activations (
  id uuid primary key default gen_random_uuid(),
  kos_id uuid not null references public.kos(id) on delete cascade,
  invoice_id uuid references public.plan_requests(id) on delete set null,
  transaction_id uuid references public.pay_transactions(id) on delete set null,
  source text not null check (source in ('admin', 'gateway', 'rekonsiliasi', 'override', 'sistem')),
  plan text not null,
  months int not null,
  version_id uuid,
  before jsonb not null,
  after jsonb not null,
  active_until date,
  actor text,
  reason text,
  created_at timestamptz not null default now()
);
create index if not exists plan_act_kos on public.plan_activations(kos_id, created_at desc);

-- ---------- Notifikasi gateway (webhook) & rekonsiliasi ----------
create table if not exists public.pay_events (
  id uuid primary key default gen_random_uuid(),
  provider text not null references public.pay_providers(code) on update cascade,
  event_key text not null check (length(event_key) between 6 and 200),   -- kunci idempotensi dari gateway (atau hash isi)
  signature_ok boolean,                                   -- null = tidak bisa diverifikasi
  payload jsonb not null,
  headers jsonb,
  norm jsonb,
  status text not null default 'diterima' check (status in ('diterima', 'cocok', 'lunas_belum_aktif', 'tidak_cocok', 'ditolak', 'diabaikan')),
  transaction_id uuid references public.pay_transactions(id) on delete set null,
  note text,
  seen int not null default 1,                            -- berapa kali notifikasi yang sama dikirim
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  unique (provider, event_key)
);

create table if not exists public.pay_recon (
  id uuid primary key default gen_random_uuid(),
  event_id uuid references public.pay_events(id) on delete cascade,
  transaction_id uuid references public.pay_transactions(id) on delete set null,
  reason text not null check (reason in ('tanda_tangan', 'tidak_ada_tagihan', 'lebih_dari_satu', 'nominal_beda', 'aktivasi_gagal', 'ref_ganda')),
  detail jsonb,
  status text not null default 'terbuka' check (status in ('terbuka', 'selesai', 'diabaikan')),
  resolved_by text,
  resolved_at timestamptz,
  resolution text,
  created_at timestamptz not null default now()
);
create index if not exists pay_recon_open on public.pay_recon(status, created_at desc);

alter table public.pay_providers enable row level security;
alter table public.pay_links enable row level security;
alter table public.pay_transactions enable row level security;
alter table public.plan_activations enable row level security;
alter table public.pay_events enable row level security;
alter table public.pay_recon enable row level security;
-- Pemilik melihat transaksi & riwayat aktivasi bisnisnya; isi notifikasi gateway & rekonsiliasi hanya lewat fungsi admin
drop policy if exists pay_trx_select on public.pay_transactions;
create policy pay_trx_select on public.pay_transactions for select using (public.member_can(kos_id, 'team') or public.admin_can('payments.view'));
drop policy if exists plan_act_select on public.plan_activations;
create policy plan_act_select on public.plan_activations for select using (public.member_can(kos_id, 'team') or public.admin_can('payments.view'));

create or replace function public.trx_code()
returns text language plpgsql volatile as $$
declare v text; v_abc text := '23456789ABCDEFGHJKLMNPQRSTUVWXYZ'; i int; b bytea;
begin
  loop
    b := decode(replace(gen_random_uuid()::text, '-', ''), 'hex'); v := '';
    for i in 0..9 loop v := v || substr(v_abc, (get_byte(b, i) % 32) + 1, 1); end loop;
    v := 'TRX-' || to_char(now() at time zone 'Asia/Jakarta', 'YYMMDD') || '-' || v;
    exit when not exists (select 1 from public.pay_transactions where code = v);
  end loop;
  return v;
end $$;

-- Tagihan lama → satu transaksi masing-masing
insert into public.pay_transactions(code, invoice_id, kos_id, provider, method, amount, status, paid_at, created_at, updated_at)
select public.trx_code(), r.id, r.kos_id, 'manual', r.method, r.amount,
       case r.status when 'disetujui' then 'paid' when 'ditolak' then 'failed' else 'pending' end,
       case when r.status = 'disetujui' then r.decided_at end, r.created_at, coalesce(r.decided_at, r.created_at)
from public.plan_requests r where not exists (select 1 from public.pay_transactions t where t.invoice_id = r.id);

-- ---------- Aktivasi paket: SATU pintu ----------
-- plan_apply = aturan masa aktif (baru / perpanjang / naik / turun). Tanpa pemeriksaan izin: hanya dipanggil plan_activate.
create or replace function public.plan_apply(p_kos uuid, p_plan text, p_months integer, p_version uuid default null)
returns date language plpgsql security definer set search_path = public as $$
declare v_today date := (now() at time zone 'Asia/Jakarta')::date; k kos; v_until date; v_ver uuid; v_cur numeric; v_new numeric; v_credit int; pl plans;
begin
  perform plan_roll(p_kos);
  select * into k from kos where id = p_kos for update;
  if k.id is null then raise exception 'Bisnis tidak ditemukan'; end if;
  select * into pl from plans where key = p_plan;
  if pl.key is null then raise exception 'Paket tidak dikenal'; end if;
  if pl.is_free then
    update kos set plan = p_plan, paid_until = null, plan_version_id = null, next_plan = null, next_until = null, next_version_id = null,
      trial_until = least(coalesce(trial_until, v_today - 1), v_today - 1), cancel_at_end = false where id = p_kos;
    return null;
  end if;
  if p_months is null or p_months < 1 then raise exception 'Durasi tidak valid'; end if;
  v_ver := coalesce(p_version, (plan_current(p_plan)).id);
  if k.paid_until is null or k.paid_until < v_today or k.plan = free_plan() then
    v_until := (v_today + make_interval(months => p_months))::date;
    update kos set plan = p_plan, paid_until = v_until, plan_version_id = v_ver, next_plan = null, next_until = null, next_version_id = null, cancel_at_end = false where id = p_kos;
  elsif k.plan = p_plan then
    v_until := (greatest(k.paid_until, coalesce(k.next_until, k.paid_until)) + make_interval(months => p_months))::date;
    if k.next_plan is not null then
      update kos set next_until = v_until, cancel_at_end = false where id = p_kos;
    else
      update kos set paid_until = v_until, plan_version_id = v_ver, cancel_at_end = false where id = p_kos;
    end if;
  else
    v_cur := coalesce((select price from plan_versions where id = k.plan_version_id), (plan_current(k.plan)).price);
    v_new := (select price from plan_versions where id = v_ver);
    if v_new >= v_cur then
      v_credit := floor((k.paid_until - v_today) * v_cur / greatest(v_new, 1))::int;
      v_until := (v_today + v_credit + make_interval(months => p_months))::date;
      update kos set plan = p_plan, paid_until = v_until, plan_version_id = v_ver, next_plan = null, next_until = null, next_version_id = null, cancel_at_end = false where id = p_kos;
    else
      v_until := (k.paid_until + make_interval(months => p_months))::date;
      update kos set next_plan = p_plan, next_until = v_until, next_version_id = v_ver, cancel_at_end = false where id = p_kos;
    end if;
  end if;
  return v_until;
end $$;

create or replace function public.plan_snapshot(p_kos uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object('paket', k.plan, 'bayar_sampai', k.paid_until, 'coba_sampai', k.trial_until, 'berikutnya', k.next_plan, 'berikutnya_sampai', k.next_until, 'berlaku', kos_plan(k.id))
  from kos k where k.id = p_kos;
$$;

-- Semua jalur (admin, gateway, rekonsiliasi, override) lewat sini; setiap aktivasi tercatat sebelum/sesudahnya
create or replace function public.plan_activate(p_kos uuid, p_plan text, p_months integer, p_version uuid, p_source text, p_invoice uuid default null, p_trx uuid default null, p_reason text default null)
returns date language plpgsql security definer set search_path = public as $$
declare v_before jsonb; v_until date;
begin
  v_before := plan_snapshot(p_kos);
  v_until := plan_apply(p_kos, p_plan, p_months, p_version);
  insert into plan_activations(kos_id, invoice_id, transaction_id, source, plan, months, version_id, before, after, active_until, actor, reason)
  values (p_kos, p_invoice, p_trx, p_source, p_plan, coalesce(p_months, 0), p_version, v_before, plan_snapshot(p_kos), v_until, coalesce(actor_email(), 'sistem'), nullif(trim(coalesce(p_reason, '')), ''));
  return v_until;
end $$;

-- Melunasi satu tagihan: idempoten (tagihan yang sudah lunas tidak diaktifkan dua kali)
create or replace function public.invoice_settle(p_request uuid, p_source text, p_trx uuid default null, p_reason text default null)
returns boolean language plpgsql security definer set search_path = public as $$
declare r plan_requests; v_trx uuid;
begin
  select * into r from plan_requests where id = p_request for update;
  if r.id is null then raise exception 'Tagihan tidak ditemukan'; end if;
  if r.status = 'disetujui' then return false; end if;
  if r.status <> 'menunggu' then raise exception 'Tagihan ini sudah %', r.status; end if;
  v_trx := coalesce(p_trx, (select id from pay_transactions where invoice_id = r.id and status in ('pending', 'processing', 'paid') order by created_at desc limit 1));
  perform plan_activate(r.kos_id, r.plan, r.months, r.version_id, p_source, r.id, v_trx, p_reason);
  update plan_requests set status = 'disetujui', decided_at = now() where id = r.id;
  update pay_transactions set status = 'paid', paid_at = coalesce(paid_at, now()), updated_at = now() where id = v_trx and status <> 'paid';
  update pay_transactions set status = 'cancelled', updated_at = now() where invoice_id = r.id and id <> v_trx and status in ('draft', 'pending', 'processing');
  return true;
end $$;

drop function if exists public.admin_set_plan(uuid, text, integer, uuid);
create or replace function public.admin_set_plan(p_kos uuid, p_plan text, p_months integer, p_version uuid default null, p_reason text default null)
returns date language plpgsql security definer set search_path = public as $$
begin
  if not (admin_can('payments.verify') or admin_can('customers.override')) then raise exception 'Tidak punya izin'; end if;
  return plan_activate(p_kos, p_plan, p_months, p_version, case when p_reason is null then 'admin' else 'override' end, null, null, p_reason);
end $$;

create or replace function public.admin_decide_request(p_request uuid, p_approve boolean)
returns void language plpgsql security definer set search_path = public as $$
declare r plan_requests;
begin
  if not admin_can('payments.verify') then raise exception 'Tidak punya izin memverifikasi pembayaran'; end if;
  select * into r from plan_requests where id = p_request for update;
  if r.id is null then raise exception 'Permintaan tidak ditemukan'; end if;
  if r.status <> 'menunggu' then raise exception 'Permintaan ini sudah diproses'; end if;
  if p_approve then
    perform invoice_settle(p_request, 'admin');
  else
    update plan_requests set status = 'ditolak', decided_at = now() where id = p_request;
    update pay_transactions set status = 'failed', updated_at = now(), note = 'Ditolak admin' where invoice_id = p_request and status in ('draft', 'pending', 'processing');
  end if;
end $$;

-- admin_override: alasan ikut tercatat di riwayat aktivasi
do $$
declare d text := pg_get_functiondef('public.admin_override(uuid,text,text,integer,text)'::regprocedure);
begin
  if position('perform admin_set_plan(p_kos, p_plan, p_value);' in d) = 0 or position('perform admin_set_plan(p_kos, free_plan(), 0);' in d) = 0 then raise exception 'admin_override: potongan tidak ditemukan'; end if;
  d := replace(d, 'perform admin_set_plan(p_kos, p_plan, p_value);', 'perform admin_set_plan(p_kos, p_plan, p_value, null, trim(p_reason));');
  d := replace(d, 'perform admin_set_plan(p_kos, free_plan(), 0);', 'perform admin_set_plan(p_kos, free_plan(), 0, null, trim(p_reason));');
  execute d;
end $$;

create or replace function public.log_plan_request() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if old.status is distinct from new.status then
    insert into admin_log(actor_email, action, kos_id, kos_name, detail)
    select coalesce(actor_email(), 'sistem'), case new.status when 'disetujui' then 'setujui_pembayaran' when 'batal' then 'batal_tagihan' when 'kedaluwarsa' then 'tagihan_kedaluwarsa' else 'tolak_pembayaran' end, new.kos_id, k.name,
      jsonb_build_object('nomor', new.number, 'paket', new.plan, 'bulan', new.months, 'jumlah', new.amount, 'metode', new.method)
    from kos k where k.id = new.kos_id;
  end if;
  return new;
end $$;

-- ---------- Tagihan baru: harga dari server + transaksi dengan ID internal ----------
create or replace function public.request_plan(p_kos uuid, p_plan text, p_months integer, p_method text, p_note text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid; pl plans; k kos; v_unit numeric; v_total numeric; v_kind text; v_today date := (now() at time zone 'Asia/Jakarta')::date; v_seq int; v_no text;
        v_method text := coalesce(p_method, 'qris'); v_term boolean;
begin
  if not member_in('team', p_kos) then raise exception 'Khusus pemilik bisnis'; end if;
  select * into pl from plans where key = p_plan;
  if pl.key is null or pl.is_free or not pl.active then raise exception 'Paket tidak tersedia'; end if;
  if p_months not in (1, 3, 6, 12) then raise exception 'Durasi tidak valid'; end if;
  if v_method not in ('qris', 'transfer') then raise exception 'Metode pembayaran belum tersedia'; end if;
  if exists (select 1 from plan_requests where kos_id = p_kos and status = 'menunggu') then
    raise exception 'Masih ada tagihan yang menunggu diperiksa. Batalkan dulu bila ingin mengganti paket.'; end if;
  perform plan_roll(p_kos);
  select * into k from kos where id = p_kos;
  v_unit := plan_unit_price(p_kos, p_plan);
  v_total := plan_total(p_kos, p_plan, p_months);                 -- snapshot harga saat tagihan dibuat
  v_term := exists (select 1 from plan_terms where plan_key = p_plan and months = p_months and active);
  v_kind := case when k.paid_until is null or k.paid_until < v_today or k.plan = free_plan() then 'baru'
                 when k.plan = p_plan then 'perpanjang'
                 when v_unit >= coalesce((select price from plan_versions where id = k.plan_version_id), (plan_current(k.plan)).price) then 'upgrade'
                 else 'downgrade' end;
  perform pg_advisory_xact_lock(hashtext('invoice'));
  select count(*) + 1 into v_seq from plan_requests where number like 'INV-' || to_char(v_today, 'YYMM') || '-%';
  v_no := 'INV-' || to_char(v_today, 'YYMM') || '-' || lpad(v_seq::text, 4, '0');
  insert into plan_requests(kos_id, user_id, plan, months, amount, method, note, number, version_id, unit_price, kind)
  values (p_kos, auth.uid(), p_plan, p_months, v_total, v_method, nullif(trim(p_note), ''), v_no,
          case when v_unit = (plan_current(p_plan)).price or v_term then (plan_current(p_plan)).id else coalesce(k.plan_version_id, (plan_current(p_plan)).id) end,
          round(v_total / p_months, 2), v_kind)
  returning id into v_id;
  insert into pay_transactions(code, invoice_id, kos_id, provider, method, amount, payer_email)
  values (trx_code(), v_id, p_kos, 'manual', v_method, v_total, actor_email());
  update kos set cancel_at_end = false where id = p_kos;
  return v_id;
end $$;

-- Pemilik membatalkan tagihannya sendiri yang belum diperiksa
create or replace function public.plan_request_cancel(p_request uuid)
returns void language plpgsql security definer set search_path = public as $$
declare r plan_requests;
begin
  select * into r from plan_requests where id = p_request for update;
  if r.id is null or not member_in('team', r.kos_id) then raise exception 'Tagihan tidak ditemukan'; end if;
  if r.status <> 'menunggu' then raise exception 'Tagihan ini sudah diproses'; end if;
  if exists (select 1 from pay_transactions where invoice_id = r.id and status = 'paid') then raise exception 'Pembayaran untuk tagihan ini sudah diterima dan sedang diproses. Hubungi admin.'; end if;
  update plan_requests set status = 'batal', decided_at = now() where id = r.id;
  update pay_transactions set status = 'cancelled', updated_at = now() where invoice_id = r.id and status in ('draft', 'pending', 'processing');
end $$;

-- Rincian pembayaran sebuah tagihan untuk pemilik (ID transaksi & statusnya dari server)
create or replace function public.my_invoices(p_kos uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if not member_in('team', p_kos) then raise exception 'Khusus pemilik bisnis'; end if;
  return (select coalesce(jsonb_agg(to_jsonb(r) || jsonb_build_object('plan_name', (select name from plans where key = r.plan),
      'trx', (select jsonb_build_object('code', t.code, 'status', t.status, 'provider', t.provider, 'paid_at', t.paid_at) from pay_transactions t where t.invoice_id = r.id order by (t.status = 'paid') desc, t.created_at desc limit 1),
      'active_until', (select a.active_until from plan_activations a where a.invoice_id = r.id order by a.created_at desc limit 1)) order by r.created_at desc), '[]')
    from (select * from plan_requests where kos_id = p_kos order by created_at desc limit 36) r);
end $$;

-- ---------- Notifikasi gateway ----------
-- Dipanggil HANYA oleh server (service role) setelah adaptor memeriksa tanda tangan dan menormalkan isi notifikasi:
--   p_norm = {paid: true/false, amount, email, ref, code?, plan?, months?}
-- Aturan: tanda tangan tidak sah / tidak cocok / lebih dari satu calon → TIDAK mengaktifkan apa pun, masuk rekonsiliasi.
create or replace function public.pay_event_ingest(p_provider text, p_event_key text, p_signature_ok boolean, p_payload jsonb, p_headers jsonb, p_norm jsonb)
returns jsonb language plpgsql security definer set search_path = public, auth as $$
declare ev pay_events; pr pay_providers; v_amount numeric; v_email text; v_ref text; v_code text; t pay_transactions; v_n int; v_inv uuid; v_err text;
begin
  select * into pr from pay_providers where code = p_provider;
  if pr.code is null or pr.kind <> 'gateway' then raise exception 'Penyedia pembayaran tidak dikenal'; end if;
  if coalesce(length(p_event_key), 0) < 6 then raise exception 'Kunci notifikasi tidak valid'; end if;

  insert into pay_events(provider, event_key, signature_ok, payload, headers, norm)
  values (p_provider, p_event_key, p_signature_ok, coalesce(p_payload, '{}'), p_headers, p_norm)
  on conflict (provider, event_key) do nothing returning * into ev;
  if ev.id is null then      -- notifikasi yang sama dikirim ulang: tidak diproses dua kali
    update pay_events set seen = seen + 1 where provider = p_provider and event_key = p_event_key returning * into ev;
    return jsonb_build_object('status', 'duplikat', 'event', ev.id, 'hasil_pertama', ev.status);
  end if;

  if not pr.active then
    update pay_events set status = 'diabaikan', note = 'Penyedia belum diaktifkan', processed_at = now() where id = ev.id;
    return jsonb_build_object('status', 'diabaikan', 'event', ev.id);
  end if;
  if p_signature_ok is not true then
    update pay_events set status = 'ditolak', note = 'Tanda tangan tidak sah / tidak bisa diverifikasi', processed_at = now() where id = ev.id;
    insert into pay_recon(event_id, reason, detail) values (ev.id, 'tanda_tangan', p_norm);
    return jsonb_build_object('status', 'ditolak', 'event', ev.id);
  end if;
  if coalesce((p_norm->>'paid')::boolean, false) is not true then
    update pay_events set status = 'diabaikan', note = 'Bukan notifikasi pembayaran berhasil', processed_at = now() where id = ev.id;
    return jsonb_build_object('status', 'diabaikan', 'event', ev.id);
  end if;

  v_amount := nullif(p_norm->>'amount', '')::numeric; v_email := lower(nullif(trim(p_norm->>'email'), '')); v_ref := nullif(trim(p_norm->>'ref'), ''); v_code := nullif(trim(p_norm->>'code'), '');
  if v_ref is not null and exists (select 1 from pay_transactions where provider = p_provider and provider_ref = v_ref) then
    update pay_events set status = 'tidak_cocok', note = 'Nomor transaksi gateway sudah pernah dipakai', processed_at = now() where id = ev.id;
    insert into pay_recon(event_id, reason, detail) values (ev.id, 'ref_ganda', p_norm);
    return jsonb_build_object('status', 'tidak_cocok', 'event', ev.id, 'alasan', 'ref_ganda');
  end if;

  -- calon: tagihan yang masih menunggu, nominal persis sama, dan (kode transaksi kita ATAU email pemesan/pemilik)
  select count(*), min(x.id::text)::uuid into v_n, v_inv from (
    select r.id from plan_requests r join pay_transactions pt on pt.invoice_id = r.id and pt.status in ('pending', 'processing')
    join kos k on k.id = r.kos_id
    where r.status = 'menunggu' and v_amount is not null and r.amount = v_amount
      and (p_norm->>'plan' is null or r.plan = p_norm->>'plan') and (p_norm->>'months' is null or r.months = (p_norm->>'months')::int)
      and ((v_code is not null and pt.code = v_code)
        or (v_code is null and v_email is not null and exists (select 1 from auth.users u where u.id in (r.user_id, k.owner_id) and lower(u.email) = v_email)))
    group by r.id) x;
  if v_n <> 1 then
    update pay_events set status = 'tidak_cocok', note = case when v_n = 0 then 'Tidak ada tagihan yang cocok (email + nominal + paket)' else 'Lebih dari satu tagihan cocok' end, processed_at = now() where id = ev.id;
    insert into pay_recon(event_id, reason, detail) values (ev.id, case when v_n = 0 then 'tidak_ada_tagihan' else 'lebih_dari_satu' end, p_norm);
    return jsonb_build_object('status', 'tidak_cocok', 'event', ev.id, 'calon', v_n);
  end if;

  -- pembayaran sah: catat lunas dulu, baru aktifkan. Bila aktivasi gagal, pembayaran tetap tercatat & bisa diulang admin.
  select * into t from pay_transactions where invoice_id = v_inv and status in ('pending', 'processing') order by created_at desc limit 1 for update;
  update pay_transactions set provider = p_provider, method = 'gateway', provider_ref = v_ref, payer_email = coalesce(v_email, payer_email), payer_name = nullif(p_norm->>'name', ''),
    status = 'paid', paid_at = now(), updated_at = now() where id = t.id;
  begin
    perform invoice_settle(v_inv, 'gateway', t.id);
    update pay_events set status = 'cocok', transaction_id = t.id, processed_at = now() where id = ev.id;
    return jsonb_build_object('status', 'cocok', 'event', ev.id, 'transaksi', t.code);
  exception when others then
    get stacked diagnostics v_err = message_text;
    update pay_events set status = 'lunas_belum_aktif', transaction_id = t.id, note = v_err, processed_at = now() where id = ev.id;
    insert into pay_recon(event_id, transaction_id, reason, detail) values (ev.id, t.id, 'aktivasi_gagal', jsonb_build_object('galat', v_err) || coalesce(p_norm, '{}'));
    return jsonb_build_object('status', 'lunas_belum_aktif', 'event', ev.id, 'transaksi', t.code);
  end;
end $$;

-- ---------- Rekonsiliasi (admin, wajib alasan, tercatat) ----------
create or replace function public.admin_recon_list()
returns jsonb language plpgsql stable security definer set search_path = public, auth as $$
begin
  if not admin_can('payments.view') then raise exception 'Tidak punya izin melihat pembayaran'; end if;
  return (select coalesce(jsonb_agg(jsonb_build_object('id', c.id, 'reason', c.reason, 'status', c.status, 'created_at', c.created_at, 'detail', c.detail,
      'resolved_by', c.resolved_by, 'resolved_at', c.resolved_at, 'resolution', c.resolution,
      'provider', e.provider, 'event_status', e.status, 'event_note', e.note, 'received_at', e.received_at, 'seen', e.seen,
      'trx', (select jsonb_build_object('code', t.code, 'status', t.status, 'amount', t.amount, 'invoice_id', t.invoice_id) from pay_transactions t where t.id = c.transaction_id))
      order by (c.status = 'terbuka') desc, c.created_at desc), '[]')
    from (select * from pay_recon order by (status = 'terbuka') desc, created_at desc limit 200) c left join pay_events e on e.id = c.event_id);
end $$;

-- p_action: 'cocokkan' (ke tagihan p_request; atau ulangi aktivasi yang gagal) | 'abaikan'
create or replace function public.admin_recon_resolve(p_recon uuid, p_action text, p_request uuid, p_reason text)
returns void language plpgsql security definer set search_path = public as $$
declare c pay_recon; ev pay_events; r plan_requests; t pay_transactions; v_ref text; v_amount numeric;
begin
  if not admin_can('payments.verify') then raise exception 'Tidak punya izin memverifikasi pembayaran'; end if;
  if coalesce(length(trim(p_reason)), 0) < 5 then raise exception 'Tuliskan alasan (minimal 5 huruf)'; end if;
  select * into c from pay_recon where id = p_recon for update;
  if c.id is null then raise exception 'Data rekonsiliasi tidak ditemukan'; end if;
  if c.status <> 'terbuka' then raise exception 'Sudah diselesaikan'; end if;
  select * into ev from pay_events where id = c.event_id;
  if p_action = 'abaikan' then
    update pay_recon set status = 'diabaikan', resolved_by = actor_email(), resolved_at = now(), resolution = trim(p_reason) where id = c.id;
  elsif p_action = 'cocokkan' then
    if c.reason = 'tanda_tangan' then raise exception 'Notifikasi tanpa tanda tangan sah tidak bisa dicocokkan. Periksa pembayaran di dasbor gateway, lalu verifikasi tagihan secara manual.'; end if;
    if c.reason = 'aktivasi_gagal' then
      select * into t from pay_transactions where id = c.transaction_id;
      perform invoice_settle(t.invoice_id, 'rekonsiliasi', t.id, trim(p_reason));
      update pay_events set status = 'cocok', processed_at = now() where id = ev.id;
    else
      select * into r from plan_requests where id = p_request for update;
      if r.id is null or r.status <> 'menunggu' then raise exception 'Pilih tagihan yang masih menunggu'; end if;
      v_ref := nullif(trim(ev.norm->>'ref'), ''); v_amount := nullif(ev.norm->>'amount', '')::numeric;
      if v_amount is distinct from r.amount then raise exception 'Nominal pembayaran (%) tidak sama dengan tagihan (%). Selesaikan selisihnya dulu.', v_amount, r.amount; end if;
      select * into t from pay_transactions where invoice_id = r.id and status in ('pending', 'processing') order by created_at desc limit 1 for update;
      if t.id is null then raise exception 'Transaksi tagihan tidak ditemukan'; end if;
      update pay_transactions set provider = ev.provider, method = 'gateway', provider_ref = v_ref, payer_email = lower(nullif(trim(ev.norm->>'email'), '')), status = 'paid', paid_at = now(), updated_at = now() where id = t.id;
      perform invoice_settle(r.id, 'rekonsiliasi', t.id, trim(p_reason));
      update pay_events set status = 'cocok', transaction_id = t.id, processed_at = now() where id = ev.id;
    end if;
    update pay_recon set status = 'selesai', transaction_id = coalesce(t.id, transaction_id), resolved_by = actor_email(), resolved_at = now(), resolution = trim(p_reason) where id = c.id;
  else raise exception 'Tindakan tidak dikenal'; end if;
  insert into admin_log(actor_email, action, kos_id, detail)
  values (actor_email(), 'rekonsiliasi', coalesce(r.kos_id, t.kos_id), jsonb_build_object('tindakan', p_action, 'sebab', c.reason, 'transaksi', t.code, 'alasan', trim(p_reason)));
end $$;

-- Daftar admin ikut membawa ID transaksi
drop function if exists public.admin_list_requests();
create or replace function public.admin_list_requests()
returns table(id uuid, kos_id uuid, kos_name text, owner_email text, plan text, plan_name text, months integer, amount numeric, method text, note text,
              status text, created_at timestamptz, number text, kind text, decided_at timestamptz, trx_code text, trx_status text, provider text)
language plpgsql stable security definer set search_path = public, auth as $$
begin
  if not admin_can('payments.view') then raise exception 'Tidak punya izin melihat pembayaran'; end if;
  return query
  select r.id, r.kos_id, k.name, u.email::text, r.plan, p.name, r.months, r.amount, r.method, r.note, r.status, r.created_at, r.number, r.kind, r.decided_at, t.code, t.status, t.provider
  from plan_requests r join kos k on k.id = r.kos_id left join auth.users u on u.id = r.user_id left join plans p on p.key = r.plan
    left join lateral (select x.code, x.status, x.provider from pay_transactions x where x.invoice_id = r.id order by (x.status = 'paid') desc, x.created_at desc limit 1) t on true
  order by (r.status = 'menunggu') desc, r.created_at desc
  limit 300;
end $$;

-- ---------- Izin ----------
revoke execute on function public.trx_code(), public.plan_apply(uuid, text, integer, uuid), public.plan_snapshot(uuid),
  public.plan_activate(uuid, text, integer, uuid, text, uuid, uuid, text), public.invoice_settle(uuid, text, uuid, text),
  public.pay_event_ingest(text, text, boolean, jsonb, jsonb, jsonb), public.admin_set_plan(uuid, text, integer, uuid, text),
  public.plan_request_cancel(uuid), public.my_invoices(uuid), public.admin_recon_list(), public.admin_recon_resolve(uuid, text, uuid, text),
  public.admin_list_requests() from public, anon, authenticated;
grant execute on function public.admin_set_plan(uuid, text, integer, uuid, text), public.plan_request_cancel(uuid), public.my_invoices(uuid),
  public.admin_recon_list(), public.admin_recon_resolve(uuid, text, uuid, text), public.admin_list_requests() to authenticated;
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant execute on function public.pay_event_ingest(text, text, boolean, jsonb, jsonb, jsonb) to service_role;
  end if;
end $$;
