-- Approval Engine (blueprint Bagian 11, 20.4) dan Automation Engine (blueprint 7).
-- Persetujuan: tindakan berisiko oleh non-pemilik menjadi permintaan; pemilik menyetujui lalu sistem menjalankan dan mencatat hasilnya.
-- Otomatisasi: resep deterministik (pemicu jadwal → syarat → tindakan) per bisnis, dengan log, anti-dobel, jeda, dan persetujuan.

-- =====================================================================
-- APPROVAL ENGINE
-- =====================================================================
create table if not exists public.approval_actions (
  code text primary key,
  label text not null,
  risk text not null check (risk in ('rendah', 'menengah', 'tinggi')),
  request_area text not null,          -- siapa boleh meminta (area peran)
  default_required boolean not null,
  applies_to text[] not null,
  sort int not null default 0
);
alter table public.approval_actions enable row level security;
drop policy if exists approval_actions_read on public.approval_actions;
create policy approval_actions_read on public.approval_actions for select using (true);
grant select on public.approval_actions to authenticated;

insert into public.approval_actions(code, label, risk, request_area, default_required, applies_to, sort) values
  ('batal_penjualan', 'Membatalkan penjualan', 'tinggi', 'sell,finance', true, '{retail}', 1),
  ('retur_penjualan', 'Retur penjualan (uang/kasbon kembali)', 'menengah', 'sell,finance', false, '{retail}', 2),
  ('batal_belanja', 'Membatalkan belanja ke supplier', 'tinggi', 'stock,finance', true, '{retail}', 3),
  ('batal_pelunasan', 'Membatalkan pelunasan kasbon/utang', 'tinggi', 'finance', true, '{retail}', 4),
  ('penyesuaian_stok', 'Menyesuaikan stok (hitung ulang, rusak, hilang)', 'menengah', 'stock', false, '{retail}', 5),
  ('hapus_kontak', 'Menghapus pelanggan/supplier', 'menengah', 'stock,finance', true, '{retail}', 6),
  ('ubah_modul', 'Mengaktifkan/menonaktifkan modul', 'menengah', 'settings', true, '{properti,retail}', 7),
  ('buat_pesanan_supplier', 'Membuat pesanan ke supplier (dari otomatisasi)', 'menengah', 'stock', true, '{retail}', 8)
on conflict (code) do nothing;

create table if not exists public.approval_rules (
  kos_id uuid not null references public.kos(id) on delete cascade,
  action_code text not null references public.approval_actions(code),
  required boolean not null,
  updated_by text,
  updated_at timestamptz not null default now(),
  primary key (kos_id, action_code)
);

create table if not exists public.approvals (
  id uuid primary key default gen_random_uuid(),
  number text not null,
  kos_id uuid not null references public.kos(id) on delete cascade,
  action_code text not null references public.approval_actions(code),
  payload jsonb not null default '{}',
  target text,                             -- untuk mencegah permintaan ganda
  summary text not null,
  impact jsonb not null default '{}',      -- data terdampak
  est_cost numeric(14,2),                  -- estimasi uang yang keluar/berubah
  reason text,
  requested_by uuid,
  requested_email text,
  requested_via text not null default 'pengguna' check (requested_via in ('pengguna', 'otomatisasi')),
  automation_rule uuid,
  status text not null default 'menunggu' check (status in ('menunggu', 'ditolak', 'dibatalkan', 'dijalankan', 'gagal')),
  decided_by text,
  decided_at timestamptz,
  decision_note text,
  result jsonb,
  executed_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists approvals_kos on public.approvals(kos_id, status, created_at desc);
alter table public.approval_rules enable row level security;
alter table public.approvals enable row level security;
drop policy if exists approval_rules_select on public.approval_rules;
create policy approval_rules_select on public.approval_rules for select using (public.is_member(kos_id));
drop policy if exists approvals_select on public.approvals;
create policy approvals_select on public.approvals for select using (public.member_can(kos_id, 'team') or requested_by = auth.uid());
grant select on public.approval_rules, public.approvals to authenticated;

create or replace function public.approval_required(p_kos uuid, p_action text)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select required from approval_rules where kos_id = p_kos and action_code = p_action),
                  (select default_required from approval_actions where code = p_action), false);
$$;
-- Perlu persetujuan bila aturan aktif dan yang melakukan bukan pemilik
create or replace function public.approval_needed(p_kos uuid, p_action text)
returns boolean language sql stable security definer set search_path = public as $$
  select approval_required(p_kos, p_action) and not member_can(p_kos, 'team');
$$;

create or replace function public.approval_number(p_kos uuid)
returns text language plpgsql security definer set search_path = public as $$
declare v_day date := (now() at time zone 'Asia/Jakarta')::date; n int;
begin
  perform pg_advisory_xact_lock(hashtext('approval:' || p_kos::text));
  select count(*) + 1 into n from approvals where kos_id = p_kos and (created_at at time zone 'Asia/Jakarta')::date = v_day;
  return 'REQ-' || to_char(v_day, 'YYMMDD') || '-' || lpad(n::text, 3, '0');
end $$;

-- Pengecekan di fungsi yang sudah ada: non-pemilik ditolak bila aturan persetujuan aktif
do $$
declare r record; v_def text; v_check text;
begin
  for r in select * from (values
    ('public.sale_void(uuid,text)', 'if s.id is null or not member_in(''finance'', s.kos_id) then raise exception ''Transaksi tidak ditemukan''; end if;', 's.kos_id', 'batal_penjualan'),
    ('public.sale_return_create(uuid,uuid,jsonb,text,text)', 'if s.id is null or not member_in(''finance'', s.kos_id) then raise exception ''Penjualan tidak ditemukan''; end if;', 's.kos_id', 'retur_penjualan'),
    ('public.purchase_void(uuid,text)', 'if b.id is null or not member_in(''stock'', b.kos_id) then raise exception ''Belanja tidak ditemukan''; end if;', 'b.kos_id', 'batal_belanja'),
    ('public.stock_adjust(uuid,text,numeric,text)', 'if p.id is null or not member_in(''stock'', p.kos_id) then raise exception ''Barang tidak ditemukan''; end if;', 'p.kos_id', 'penyesuaian_stok'),
    ('public.contact_delete(uuid)', 'if c.id is null or not member_in(case when c.kind = ''supplier'' then ''stock,finance'' else ''finance'' end, c.kos_id) then raise exception ''Kontak tidak ditemukan''; end if;', 'c.kos_id', 'hapus_kontak'),
    ('public.debt_payment_void(uuid,text)', '  update debt_payments set status = ''batal'', void_reason = trim(p_reason)', '(select kos_id from debt_payments where id = p_payment)', 'batal_pelunasan')
  ) t(fn, line, kos, act) loop
    v_def := pg_get_functiondef(r.fn::regprocedure);
    if position(r.line in v_def) = 0 then raise exception 'Baris tidak ditemukan di %', r.fn; end if;
    v_check := 'if approval_needed(' || r.kos || ', ' || quote_literal(r.act) || ') then raise exception ''PERLU_PERSETUJUAN: Tindakan ini perlu persetujuan pemilik. Kirim permintaan dari aplikasi.''; end if;';
    if r.fn like 'public.debt_payment_void%' then
      v_def := replace(v_def, r.line, '  ' || v_check || E'\n' || r.line);
    else
      v_def := replace(v_def, r.line, r.line || E'\n  ' || v_check);
    end if;
    execute v_def;
  end loop;
end $$;

-- Buat permintaan (oleh pengguna)
create or replace function public.approval_request(p_kos uuid, p_action text, p_payload jsonb, p_reason text)
returns uuid language plpgsql security definer set search_path = public, auth as $$
declare a approval_actions; v_id uuid; v_sum text; v_imp jsonb := '{}'; v_cost numeric; v_target text; s sales; b purchases; d debt_payments; pr products; c contacts; v_type text;
begin
  select * into a from approval_actions where code = p_action;
  select business_type into v_type from kos where id = p_kos;
  if a.code is null or not (v_type = any(a.applies_to)) or p_action = 'buat_pesanan_supplier' then raise exception 'Jenis permintaan tidak dikenal'; end if;
  if not member_in(a.request_area, p_kos) then raise exception 'Tidak punya akses untuk meminta tindakan ini'; end if;
  if coalesce(length(trim(p_reason)), 0) < 3 then raise exception 'Tuliskan alasan permintaan'; end if;

  if p_action in ('batal_penjualan', 'retur_penjualan') then
    select * into s from sales where id = (p_payload->>'sale_id')::uuid and kos_id = p_kos;
    if s.id is null or s.status <> 'selesai' then raise exception 'Penjualan tidak ditemukan atau sudah dibatalkan'; end if;
    if not member_in('finance', p_kos) and s.created_by is distinct from auth.uid() then raise exception 'Kasir hanya bisa meminta untuk penjualannya sendiri'; end if;
    v_target := s.id::text;
    if p_action = 'batal_penjualan' then
      v_sum := 'Batalkan penjualan ' || s.number || ' (' || replace(to_char(s.total, 'FM999,999,999,999'), ',', '.') || ')';
      v_imp := jsonb_build_object('penjualan', s.number, 'tanggal', s.sale_date, 'total', s.total, 'cara_bayar', s.pay_method,
        'barang', (select jsonb_agg(jsonb_build_object('nama', l.name, 'jumlah', l.qty, 'satuan', l.unit)) from sale_lines l where l.sale_id = s.id), 'stok', 'dikembalikan');
      v_cost := s.total;
    else
      if jsonb_typeof(p_payload->'lines') <> 'array' then raise exception 'Isi barang yang diretur'; end if;
      v_cost := (select coalesce(sum(round((x->>'qty')::numeric * l.price * case when s.subtotal > 0 then s.total / s.subtotal else 1 end, 2)), 0)
                 from jsonb_array_elements(p_payload->'lines') x join sale_lines l on l.id = (x->>'line_id')::uuid and l.sale_id = s.id);
      v_sum := 'Retur dari penjualan ' || s.number || ' (' || replace(to_char(v_cost, 'FM999,999,999,999'), ',', '.') || ', ' || coalesce(p_payload->>'refund', 'tunai') || ')';
      v_imp := jsonb_build_object('penjualan', s.number, 'barang', (select jsonb_agg(jsonb_build_object('nama', l.name, 'jumlah', (x->>'qty')::numeric, 'satuan', l.unit))
        from jsonb_array_elements(p_payload->'lines') x join sale_lines l on l.id = (x->>'line_id')::uuid), 'pengembalian', p_payload->>'refund');
      v_target := null;  -- retur boleh beberapa kali
    end if;
  elsif p_action = 'batal_belanja' then
    select * into b from purchases where id = (p_payload->>'purchase_id')::uuid and kos_id = p_kos;
    if b.id is null or b.status = 'batal' then raise exception 'Belanja tidak ditemukan atau sudah dibatalkan'; end if;
    v_target := b.id::text; v_cost := greatest(b.total, b.order_total);
    v_sum := 'Batalkan belanja ' || b.number;
    v_imp := jsonb_build_object('belanja', b.number, 'tanggal', b.purchase_date, 'total', b.total, 'status', b.status);
  elsif p_action = 'batal_pelunasan' then
    select * into d from debt_payments where id = (p_payload->>'payment_id')::uuid and kos_id = p_kos;
    if d.id is null or d.status <> 'selesai' then raise exception 'Pelunasan tidak ditemukan'; end if;
    v_target := d.id::text; v_cost := d.amount;
    v_sum := 'Batalkan ' || case when d.kind = 'piutang' then 'pembayaran kasbon' else 'pembayaran utang' end || ' ' || replace(to_char(d.amount, 'FM999,999,999,999'), ',', '.');
    v_imp := jsonb_build_object('kontak', (select name from contacts where id = d.contact_id), 'tanggal', d.date, 'jumlah', d.amount);
  elsif p_action = 'penyesuaian_stok' then
    select * into pr from products where id = (p_payload->>'product_id')::uuid and kos_id = p_kos;
    if pr.id is null then raise exception 'Barang tidak ditemukan'; end if;
    v_target := null;
    v_cost := round(abs(coalesce((p_payload->>'qty')::numeric, 0)) * pr.cost, 2);
    v_sum := 'Sesuaikan stok ' || pr.name || ' (' || coalesce(p_payload->>'reason', '-') || ' ' || coalesce(p_payload->>'qty', '?') || ' ' || pr.base_unit || ')';
    v_imp := jsonb_build_object('barang', pr.name, 'stok_sekarang', pr.stock, 'alasan', p_payload->>'reason', 'jumlah', p_payload->>'qty', 'nilai_modal', v_cost);
  elsif p_action = 'hapus_kontak' then
    select * into c from contacts where id = (p_payload->>'contact_id')::uuid and kos_id = p_kos;
    if c.id is null then raise exception 'Kontak tidak ditemukan'; end if;
    v_target := c.id::text; v_sum := 'Hapus ' || c.kind || ' ' || c.name;
    v_imp := jsonb_build_object('kontak', c.name, 'jenis', c.kind);
  elsif p_action = 'ubah_modul' then
    v_target := p_payload->>'code';
    v_sum := case when (p_payload->>'on')::boolean then 'Aktifkan' else 'Nonaktifkan' end || ' modul ' || coalesce((select name from modules where code = p_payload->>'code'), p_payload->>'code');
    v_imp := jsonb_build_object('modul', p_payload->>'code', 'aktif', (p_payload->>'on')::boolean, 'data_lama', 'tidak dihapus');
  end if;

  if v_target is not null and exists (select 1 from approvals where kos_id = p_kos and action_code = p_action and target = v_target and status = 'menunggu') then
    raise exception 'Sudah ada permintaan yang sama dan masih menunggu';
  end if;
  insert into approvals(number, kos_id, action_code, payload, target, summary, impact, est_cost, reason, requested_by, requested_email)
  values (approval_number(p_kos), p_kos, p_action, coalesce(p_payload, '{}'), v_target, v_sum, v_imp, v_cost, trim(p_reason), auth.uid(), actor_email())
  returning id into v_id;
  return v_id;
end $$;

-- Pemilik memutuskan; bila disetujui sistem menjalankan tindakan dan mencatat hasil eksekusinya
create or replace function public.approval_decide(p_id uuid, p_approve boolean, p_note text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare ap approvals; v_res jsonb; v_err text;
begin
  select * into ap from approvals where id = p_id for update;
  if ap.id is null or not member_can(ap.kos_id, 'team') then raise exception 'Permintaan tidak ditemukan'; end if;
  if ap.status <> 'menunggu' then raise exception 'Permintaan sudah diproses'; end if;
  if not p_approve then
    update approvals set status = 'ditolak', decided_by = actor_email(), decided_at = now(), decision_note = nullif(trim(coalesce(p_note, '')), '') where id = p_id;
    return jsonb_build_object('status', 'ditolak');
  end if;
  begin
    v_res := case ap.action_code
      when 'batal_penjualan' then (select jsonb_build_object('ok', true) from (select sale_void((ap.payload->>'sale_id')::uuid, coalesce(ap.reason, 'disetujui pemilik'))) z)
      when 'retur_penjualan' then sale_return_create(gen_random_uuid(), (ap.payload->>'sale_id')::uuid, ap.payload->'lines', coalesce(ap.payload->>'refund', 'tunai'), coalesce(ap.reason, 'disetujui pemilik'))
      when 'batal_belanja' then (select jsonb_build_object('ok', true) from (select purchase_void((ap.payload->>'purchase_id')::uuid, coalesce(ap.reason, 'disetujui pemilik'))) z)
      when 'batal_pelunasan' then (select jsonb_build_object('ok', true) from (select debt_payment_void((ap.payload->>'payment_id')::uuid, coalesce(ap.reason, 'disetujui pemilik'))) z)
      when 'penyesuaian_stok' then (select jsonb_build_object('ok', true) from (select stock_adjust((ap.payload->>'product_id')::uuid, ap.payload->>'reason', (ap.payload->>'qty')::numeric, coalesce(ap.payload->>'note', ap.reason))) z)
      when 'hapus_kontak' then jsonb_build_object('hasil', contact_delete((ap.payload->>'contact_id')::uuid))
      when 'ubah_modul' then jsonb_build_object('hasil', module_set(ap.kos_id, ap.payload->>'code', (ap.payload->>'on')::boolean, coalesce(ap.reason, 'disetujui') || ' (diminta ' || coalesce(ap.requested_email, '-') || ')'))
      when 'buat_pesanan_supplier' then purchase_order_create(gen_random_uuid(), ap.kos_id, (now() at time zone 'Asia/Jakarta')::date, nullif(ap.payload->>'contact_id', '')::uuid,
                                         ap.payload->'lines', 'tunai', null, 'Dibuat dari otomatisasi ' || ap.number, null)
      end;
    update approvals set status = 'dijalankan', decided_by = actor_email(), decided_at = now(), executed_at = now(), result = coalesce(v_res, '{"ok": true}'),
      decision_note = nullif(trim(coalesce(p_note, '')), '') where id = p_id;
    return jsonb_build_object('status', 'dijalankan', 'hasil', v_res);
  exception when others then
    v_err := regexp_replace(sqlerrm, '^.*PERLU_PERSETUJUAN: ', '');
    update approvals set status = 'gagal', decided_by = actor_email(), decided_at = now(), result = jsonb_build_object('error', v_err) where id = p_id;
    return jsonb_build_object('status', 'gagal', 'error', v_err);
  end;
end $$;

create or replace function public.approval_cancel(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  update approvals set status = 'dibatalkan', decided_at = now(), decided_by = actor_email()
  where id = p_id and status = 'menunggu' and (requested_by = auth.uid() or member_can(kos_id, 'team'));
  if not found then raise exception 'Permintaan tidak ditemukan atau sudah diproses'; end if;
end $$;

create or replace function public.approval_rule_set(p_kos uuid, p_action text, p_required boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not member_can(p_kos, 'team') then raise exception 'Khusus pemilik bisnis'; end if;
  insert into approval_rules(kos_id, action_code, required, updated_by) values (p_kos, p_action, p_required, actor_email())
  on conflict (kos_id, action_code) do update set required = excluded.required, updated_by = excluded.updated_by, updated_at = now();
  perform config_log(p_kos, 'ubah_aturan_persetujuan', p_action, null, jsonb_build_object('wajib', p_required), null, 'menengah', actor_email());
end $$;

create or replace function public.approval_rules_list(p_kos uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare t text;
begin
  if not is_member(p_kos) then raise exception 'Tidak punya akses'; end if;
  select business_type into t from kos where id = p_kos;
  return (select coalesce(jsonb_agg(jsonb_build_object('code', a.code, 'label', a.label, 'risk', a.risk, 'required', approval_required(p_kos, a.code)) order by a.sort), '[]')
          from approval_actions a where t = any(a.applies_to));
end $$;

-- Modul: permintaan pengelola kini masuk Pusat Persetujuan
do $$
declare v text;
begin
  v := pg_get_functiondef('public.module_set(uuid,text,boolean,text)'::regprocedure);
  if position('if exists (select 1 from config_requests where kos_id = p_kos and module_code = p_code and status = ''menunggu'') then raise exception ''Sudah ada permintaan yang menunggu persetujuan pemilik''; end if;' in v) = 0 then raise exception 'module_set berubah'; end if;
  v := replace(v, 'if exists (select 1 from config_requests where kos_id = p_kos and module_code = p_code and status = ''menunggu'') then raise exception ''Sudah ada permintaan yang menunggu persetujuan pemilik''; end if;
    insert into config_requests(kos_id, module_code, action, reason, risk, requested_by)
    values (p_kos, p_code, case when p_on then ''aktifkan'' else ''nonaktifkan'' end, nullif(trim(coalesce(p_reason, '''')), ''''), v_risk, actor_email());',
    'perform approval_request(p_kos, ''ubah_modul'', jsonb_build_object(''code'', p_code, ''on'', p_on), coalesce(nullif(trim(coalesce(p_reason, '''')), ''''), ''permintaan pengelola''));');
  if position('approval_request' in v) = 0 then raise exception 'module_set tidak terganti'; end if;
  execute v;

  v := pg_get_functiondef('public.module_catalog(uuid)'::regprocedure);
  v := replace(v, '(select r.action from config_requests r where r.kos_id = p_kos and r.module_code = m.code and r.status = ''menunggu'' limit 1)',
    '(select case when (a.payload->>''on'')::boolean then ''aktifkan'' else ''nonaktifkan'' end from approvals a where a.kos_id = p_kos and a.action_code = ''ubah_modul'' and a.payload->>''code'' = m.code and a.status = ''menunggu'' limit 1)');
  if position('from approvals a' in v) = 0 then raise exception 'module_catalog tidak terganti'; end if;
  execute v;

  v := pg_get_functiondef('public.owner_overview2(date)'::regprocedure);
  v := replace(v, '(select jsonb_agg(jsonb_build_object(''text'', n || '' permintaan konfigurasi menunggu persetujuan'', ''href'', ''/konfigurasi'', ''tone'', ''gold'')) from (select count(*) n from config_requests where kos_id = k.id and status = ''menunggu'') z',
    '(select jsonb_agg(jsonb_build_object(''text'', n || '' permintaan menunggu persetujuan'', ''href'', ''/persetujuan'', ''tone'', ''gold'')) from (select count(*) n from approvals where kos_id = k.id and status = ''menunggu'') z');
  if position('from approvals where kos_id = k.id' in v) = 0 then raise exception 'owner_overview2 tidak terganti'; end if;
  execute v;
end $$;

-- =====================================================================
-- AUTOMATION ENGINE
-- =====================================================================
create table if not exists public.automation_recipes (
  code text primary key,
  name text not null,
  applies_to text[] not null,
  trigger_text text not null,
  condition_text text not null,
  action_text text not null,
  default_params jsonb not null default '{}',
  sends_email boolean not null default false,
  needs_approval boolean not null default false,
  sort int not null default 0
);
alter table public.automation_recipes enable row level security;
drop policy if exists automation_recipes_read on public.automation_recipes;
create policy automation_recipes_read on public.automation_recipes for select using (true);
grant select on public.automation_recipes to authenticated;

insert into public.automation_recipes(code, name, applies_to, trigger_text, condition_text, action_text, default_params, sends_email, needs_approval, sort) values
  ('stok_minimum', 'Stok menipis → draf pesanan', '{retail}', 'Setiap pagi 07.00', 'Ada barang dengan stok di bawah batas minimum',
     'Buat pemberitahuan; bila "buat draf" menyala, buat draf pesanan ke supplier terakhir yang menunggu persetujuan pemilik', '{"buat_draf": true, "kelipatan": 2}', false, true, 1),
  ('kasbon_jatuh_tempo', 'Kasbon jatuh tempo', '{retail}', 'Setiap pagi 07.00', 'Ada kasbon pelanggan yang lewat/tepat jatuh tempo',
     'Buat pemberitahuan berisi daftar & tombol Ingatkan WA; kirim email ke pemilik', '{}', true, false, 2),
  ('utang_jatuh_tempo', 'Utang supplier jatuh tempo', '{retail}', 'Setiap pagi 07.00', 'Ada utang ke supplier yang jatuh tempo dalam N hari',
     'Buat pemberitahuan', '{"hari": 3}', false, false, 3),
  ('shift_lama', 'Shift kasir lupa ditutup', '{retail}', 'Setiap pagi 07.00', 'Ada shift terbuka lebih dari N jam',
     'Buat pemberitahuan', '{"jam": 12}', false, false, 4),
  ('pembayaran_menunggu', 'Pembayaran menunggu diperiksa', '{properti}', 'Setiap pagi 07.00', 'Ada pembayaran/bukti transfer menunggu lebih dari 1 hari',
     'Buat pemberitahuan', '{}', false, false, 11),
  ('tagihan_telat', 'Tagihan telat', '{properti}', 'Setiap pagi 07.00', 'Ada tagihan sewa lewat jatuh tempo yang belum lunas',
     'Buat pemberitahuan berisi daftar; kirim email ke pemilik', '{}', true, false, 12),
  ('ringkasan_bulanan', 'Ringkasan awal bulan', '{properti,retail}', 'Tanggal 1 setiap bulan, 07.00', 'Selalu (bulan sebelumnya)',
     'Buat pemberitahuan ringkasan pendapatan & laba bulan lalu; kirim email ke pemilik', '{}', true, false, 20)
on conflict (code) do nothing;

create table if not exists public.automation_rules (
  id uuid primary key default gen_random_uuid(),
  kos_id uuid not null references public.kos(id) on delete cascade,
  recipe text not null references public.automation_recipes(code),
  enabled boolean not null default false,
  params jsonb not null default '{}',
  fail_count int not null default 0,
  paused_reason text,
  last_run_at timestamptz,
  updated_by text,
  updated_at timestamptz not null default now(),
  unique (kos_id, recipe)
);
create table if not exists public.automation_runs (
  id bigserial primary key,
  rule_id uuid not null references public.automation_rules(id) on delete cascade,
  kos_id uuid not null references public.kos(id) on delete cascade,
  trigger text not null,                    -- jadwal / manual
  dedupe_key text,
  status text not null check (status in ('ok', 'dilewati', 'gagal')),
  input jsonb,
  output jsonb,
  error text,
  started_at timestamptz not null default now(),
  finished_at timestamptz
);
create unique index if not exists automation_runs_dedupe on public.automation_runs(rule_id, dedupe_key) where dedupe_key is not null and status = 'ok';
create index if not exists automation_runs_rule on public.automation_runs(rule_id, started_at desc);
create table if not exists public.automation_notices (
  id bigserial primary key,
  kos_id uuid not null references public.kos(id) on delete cascade,
  rule_id uuid references public.automation_rules(id) on delete set null,
  title text not null,
  body text,
  items jsonb,
  href text,
  email_to text,
  emailed_at timestamptz,
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists automation_notices_kos on public.automation_notices(kos_id, created_at desc);
alter table public.automation_rules enable row level security;
alter table public.automation_runs enable row level security;
alter table public.automation_notices enable row level security;
drop policy if exists automation_rules_select on public.automation_rules;
create policy automation_rules_select on public.automation_rules for select using (public.member_can(kos_id, 'settings'));
drop policy if exists automation_runs_select on public.automation_runs;
create policy automation_runs_select on public.automation_runs for select using (public.member_can(kos_id, 'settings'));
drop policy if exists automation_notices_select on public.automation_notices;
create policy automation_notices_select on public.automation_notices for select using (public.member_can(kos_id, 'settings'));
grant select on public.automation_rules, public.automation_runs, public.automation_notices to authenticated;

-- Menjalankan satu aturan. Hanya membaca data & membuat pemberitahuan/permintaan persetujuan — tidak memicu aturan lain (anti-siklus).
create or replace function public.automation_run_rule(p_rule uuid, p_trigger text)
returns jsonb language plpgsql security definer set search_path = public, auth as $$
declare ru automation_rules; k kos; v_today date := (now() at time zone 'Asia/Jakarta')::date; v_key text; v_items jsonb; v_out jsonb := '{}';
        v_owner text; v_led jsonb; v_run bigint; v_n int; v_sup record; v_lines jsonb; v_aid uuid; v_m0 date; v_m1 date; v_rev numeric; v_prof numeric;
        v_email boolean;
begin
  select * into ru from automation_rules where id = p_rule for update;
  if ru.id is null then raise exception 'Aturan tidak ditemukan'; end if;
  select * into k from kos where id = ru.kos_id;
  select email into v_owner from auth.users where id = k.owner_id;
  v_email := kos_plan(k.id) <> free_plan();   -- email otomatis hanya untuk paket berbayar/masa coba
  v_key := ru.recipe || ':' || v_today;
  if p_trigger = 'jadwal' and exists (select 1 from automation_runs where rule_id = ru.id and dedupe_key = v_key and status = 'ok') then
    return jsonb_build_object('status', 'dilewati', 'alasan', 'sudah berjalan hari ini');
  end if;
  insert into automation_runs(rule_id, kos_id, trigger, dedupe_key, status, input) values (ru.id, ru.kos_id, p_trigger, null, 'dilewati', ru.params) returning id into v_run;

  begin
    if ru.recipe = 'stok_minimum' then
      select jsonb_agg(jsonb_build_object('id', p.id, 'nama', p.name, 'stok', p.stock, 'min', p.min_stock, 'satuan', p.base_unit) order by p.name), count(*)
        into v_items, v_n from products p where p.kos_id = k.id and p.active and p.min_stock > 0 and p.stock <= p.min_stock;
      if v_n > 0 then
        insert into automation_notices(kos_id, rule_id, title, body, items, href)
        values (k.id, ru.id, v_n || ' barang stok menipis', 'Stok di bawah batas minimum.', v_items, '/barang');
        v_out := jsonb_build_object('barang', v_n);
        if coalesce((ru.params->>'buat_draf')::boolean, true) and module_on(k.id, 'r_belanja')
           and not exists (select 1 from approvals where kos_id = k.id and action_code = 'buat_pesanan_supplier' and status = 'menunggu') then
          -- satu draf per supplier terakhir barang tersebut
          for v_sup in
            select ls.contact_id, jsonb_agg(jsonb_build_object('product_id', p.id, 'unit', p.base_unit,
                     'qty', greatest(ceil(p.min_stock * coalesce((ru.params->>'kelipatan')::numeric, 2) - p.stock), 1), 'price', p.cost)) as lines,
                   sum(greatest(ceil(p.min_stock * coalesce((ru.params->>'kelipatan')::numeric, 2) - p.stock), 1) * p.cost) as est, count(*) n
            from products p
            left join lateral (select b.contact_id from purchase_lines pl join purchases b on b.id = pl.purchase_id
                               where pl.product_id = p.id and b.status <> 'batal' order by b.created_at desc limit 1) ls on true
            where p.kos_id = k.id and p.active and p.min_stock > 0 and p.stock <= p.min_stock
              -- jangan pesan lagi barang yang masih ada di pesanan terbuka
              and not exists (select 1 from purchase_lines pl join purchases b on b.id = pl.purchase_id where pl.product_id = p.id and b.status in ('dipesan', 'sebagian'))
            group by ls.contact_id
          loop
            insert into approvals(number, kos_id, action_code, payload, summary, impact, est_cost, reason, requested_via, automation_rule, requested_email)
            values (approval_number(k.id), k.id, 'buat_pesanan_supplier', jsonb_build_object('contact_id', v_sup.contact_id, 'lines', v_sup.lines),
                    'Draf pesanan ' || v_sup.n || ' barang ke ' || coalesce((select name from contacts where id = v_sup.contact_id), 'supplier (belum ditentukan)'),
                    jsonb_build_object('barang', v_sup.lines, 'supplier', (select name from contacts where id = v_sup.contact_id)), v_sup.est,
                    'Stok di bawah minimum (otomatisasi)', 'otomatisasi', ru.id, 'otomatisasi')
            returning id into v_aid;
          end loop;
          v_out := v_out || jsonb_build_object('draf_pesanan', true);
        end if;
      end if;
    elsif ru.recipe in ('kasbon_jatuh_tempo', 'utang_jatuh_tempo') then
      v_led := retail_ledger_internal_full(k.id);
      select jsonb_agg(x), count(*) into v_items, v_n from jsonb_array_elements(v_led -> case when ru.recipe = 'kasbon_jatuh_tempo' then 'kasbon' else 'utang' end) x
      where (x->>'due') is not null and (x->>'due')::date <= v_today + case when ru.recipe = 'utang_jatuh_tempo' then coalesce((ru.params->>'hari')::int, 3) else 0 end;
      if v_n > 0 then
        insert into automation_notices(kos_id, rule_id, title, body, items, href, email_to)
        values (k.id, ru.id, v_n || case when ru.recipe = 'kasbon_jatuh_tempo' then ' kasbon jatuh tempo' else ' utang supplier jatuh tempo' end,
                'Total ' || replace(to_char((select sum((x->>'sisa')::numeric) from jsonb_array_elements(v_items) x), 'FM999,999,999,999'), ',', '.'),
                v_items, '/kas', case when ru.recipe = 'kasbon_jatuh_tempo' and v_email then v_owner end);
        v_out := jsonb_build_object('jumlah', v_n);
      end if;
    elsif ru.recipe = 'shift_lama' then
      select jsonb_agg(jsonb_build_object('kasir', u.email, 'sejak', sh.opened_at)), count(*) into v_items, v_n
      from cash_shifts sh join auth.users u on u.id = sh.user_id
      where sh.kos_id = k.id and sh.closed_at is null and sh.opened_at < now() - make_interval(hours => coalesce((ru.params->>'jam')::int, 12));
      if v_n > 0 then
        insert into automation_notices(kos_id, rule_id, title, body, items, href) values (k.id, ru.id, v_n || ' shift kasir belum ditutup', 'Ingatkan kasir menutup shift dan menghitung laci.', v_items, '/shift');
        v_out := jsonb_build_object('jumlah', v_n);
      end if;
    elsif ru.recipe = 'pembayaran_menunggu' then
      select jsonb_agg(jsonb_build_object('jumlah', p.amount, 'tanggal', p.paid_at)), count(*) into v_items, v_n
      from payments p where p.kos_id = k.id and p.status = 'menunggu' and p.created_at < now() - interval '1 day';
      if v_n > 0 then
        insert into automation_notices(kos_id, rule_id, title, body, items, href) values (k.id, ru.id, v_n || ' pembayaran menunggu diperiksa', 'Sudah lebih dari 1 hari.', v_items, '/pembayaran');
        v_out := jsonb_build_object('jumlah', v_n);
      end if;
    elsif ru.recipe = 'tagihan_telat' then
      select jsonb_agg(jsonb_build_object('kamar', r.code, 'penghuni', o.name, 'sisa', s.outstanding, 'jatuh_tempo', s.due_date) order by s.due_date), count(*) into v_items, v_n
      from invoice_summary s join occupants o on o.id = s.occupant_id join rooms r on r.id = s.room_id where s.kos_id = k.id and s.overdue;
      if v_n > 0 then
        insert into automation_notices(kos_id, rule_id, title, body, items, href, email_to)
        values (k.id, ru.id, v_n || ' tagihan telat', 'Total ' || replace(to_char((select sum((x->>'sisa')::numeric) from jsonb_array_elements(v_items) x), 'FM999,999,999,999'), ',', '.'),
                v_items, '/tagihan', case when v_email then v_owner end);
        v_out := jsonb_build_object('jumlah', v_n);
      end if;
    elsif ru.recipe = 'ringkasan_bulanan' then
      if p_trigger = 'jadwal' and extract(day from v_today) <> 1 then
        update automation_runs set status = 'dilewati', output = '{"alasan": "bukan tanggal 1"}', finished_at = now() where id = v_run;
        return jsonb_build_object('status', 'dilewati');
      end if;
      v_m0 := (date_trunc('month', v_today) - interval '1 month')::date; v_m1 := (date_trunc('month', v_today) - interval '1 day')::date;
      v_key := ru.recipe || ':' || to_char(v_m0, 'YYYY-MM');
      if k.business_type = 'retail' then
        v_rev := coalesce((select sum(total) from sales where kos_id = k.id and status = 'selesai' and sale_date between v_m0 and v_m1), 0)
               - coalesce((select sum(total) from sale_returns where kos_id = k.id and return_date between v_m0 and v_m1), 0);
        v_prof := v_rev - coalesce((select sum(cost_total) from sales where kos_id = k.id and status = 'selesai' and sale_date between v_m0 and v_m1), 0)
               + coalesce((select sum(cost_total) from sale_returns where kos_id = k.id and return_date between v_m0 and v_m1), 0);
      else
        v_rev := coalesce((select sum(amount) from payments where kos_id = k.id and status = 'terverifikasi' and paid_at between v_m0 and v_m1), 0);
        v_prof := v_rev;
      end if;
      v_prof := v_prof - coalesce((select sum(amount) from expenses where kos_id = k.id and kind = 'operasional' and date between v_m0 and v_m1), 0);
      insert into automation_notices(kos_id, rule_id, title, body, items, href, email_to)
      values (k.id, ru.id, 'Ringkasan ' || to_char(v_m0, 'MM/YYYY'),
              'Pendapatan ' || replace(to_char(v_rev, 'FM999,999,999,990'), ',', '.') || ' · laba operasional ' || replace(to_char(v_prof, 'FM999,999,999,990'), ',', '.'),
              jsonb_build_object('pendapatan', v_rev, 'laba', v_prof, 'dari', v_m0, 'sampai', v_m1), '/bisnis', case when v_email then v_owner end);
      v_out := jsonb_build_object('pendapatan', v_rev, 'laba', v_prof);
    end if;

    update automation_runs set status = 'ok', dedupe_key = case when p_trigger = 'jadwal' then v_key end, output = v_out, finished_at = now() where id = v_run;
    update automation_rules set last_run_at = now(), fail_count = 0 where id = ru.id;
    return jsonb_build_object('status', 'ok', 'hasil', v_out);
  exception when others then
    update automation_runs set status = 'gagal', error = sqlerrm, finished_at = now() where id = v_run;
    update automation_rules set fail_count = fail_count + 1, last_run_at = now(),
      enabled = case when fail_count + 1 >= 3 then false else enabled end,
      paused_reason = case when fail_count + 1 >= 3 then 'Dijeda otomatis setelah 3 kali gagal: ' || sqlerrm else paused_reason end where id = ru.id;
    return jsonb_build_object('status', 'gagal', 'error', sqlerrm);
  end;
end $$;
revoke execute on function public.automation_run_rule(uuid, text) from public, anon, authenticated;

-- Saldo kasbon/utang tanpa pemeriksaan peran (dipakai jadwal otomatis; tidak bisa dipanggil pengguna)
create or replace function public.retail_ledger_internal_full(p_kos uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'kasbon', (select coalesce(jsonb_agg(row_to_json(x)), '[]'::jsonb) from (
      select c.id, c.name, c.phone, contact_balance(c.id) as sisa,
        (select min(due_date) from sales s where s.contact_id = c.id and s.pay_method = 'kasbon' and s.status = 'selesai' and s.due_date is not null) as due
      from contacts c where c.kos_id = p_kos and c.kind = 'pelanggan') x where x.sisa > 0.5),
    'utang', (select coalesce(jsonb_agg(row_to_json(x)), '[]'::jsonb) from (
      select c.id, c.name, contact_balance(c.id) as sisa,
        (select min(due_date) from purchases b where b.contact_id = c.id and b.pay_method = 'utang' and b.status in ('selesai', 'sebagian') and b.due_date is not null) as due
      from contacts c where c.kos_id = p_kos and c.kind = 'supplier') x where x.sisa > 0.5));
$$;
revoke execute on function public.retail_ledger_internal_full(uuid) from public, anon, authenticated;

-- Jadwal harian (kunci server): jalankan semua aturan aktif
create or replace function public.automation_tick()
returns jsonb language plpgsql security definer set search_path = public as $$
declare r record; v_res jsonb; n_ok int := 0; n_fail int := 0; n_skip int := 0;
begin
  for r in select ru.id from automation_rules ru join kos k on k.id = ru.kos_id where ru.enabled and k.suspended_at is null loop
    v_res := automation_run_rule(r.id, 'jadwal');
    if v_res->>'status' = 'ok' then n_ok := n_ok + 1; elsif v_res->>'status' = 'gagal' then n_fail := n_fail + 1; else n_skip := n_skip + 1; end if;
  end loop;
  return jsonb_build_object('ok', n_ok, 'gagal', n_fail, 'dilewati', n_skip);
end $$;
revoke execute on function public.automation_tick() from public, anon, authenticated;
grant execute on function public.automation_tick() to service_role;

create or replace function public.automation_email_queue()
returns table(id bigint, email_to text, kos_name text, title text, body text, items jsonb, href text)
language sql stable security definer set search_path = public as $$
  select n.id, n.email_to, k.name, n.title, n.body, n.items, n.href from automation_notices n join kos k on k.id = n.kos_id
  where n.email_to is not null and n.emailed_at is null and n.created_at > now() - interval '2 days' order by n.id limit 200;
$$;
create or replace function public.automation_email_done(p_id bigint)
returns void language sql security definer set search_path = public as $$
  update automation_notices set emailed_at = now() where id = p_id;
$$;
revoke execute on function public.automation_email_queue(), public.automation_email_done(bigint) from public, anon, authenticated;
grant execute on function public.automation_email_queue(), public.automation_email_done(bigint) to service_role;

-- Untuk aplikasi
create or replace function public.automation_list(p_kos uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare t text;
begin
  if not member_in('settings', p_kos) then raise exception 'Khusus pemilik atau pengelola'; end if;
  select business_type into t from kos where id = p_kos;
  return (select coalesce(jsonb_agg(jsonb_build_object(
      'recipe', to_jsonb(rc), 'rule', to_jsonb(ru),
      'runs', (select coalesce(jsonb_agg(to_jsonb(x) order by x.started_at desc), '[]') from (select * from automation_runs where rule_id = ru.id order by started_at desc limit 10) x)
    ) order by rc.sort), '[]')
    from automation_recipes rc left join automation_rules ru on ru.recipe = rc.code and ru.kos_id = p_kos where t = any(rc.applies_to));
end $$;

create or replace function public.automation_set(p_kos uuid, p_recipe text, p_enabled boolean, p_params jsonb)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid; rc automation_recipes;
begin
  if not member_can(p_kos, 'team') then raise exception 'Hanya pemilik yang bisa menyalakan/mengubah otomatisasi'; end if;
  select * into rc from automation_recipes where code = p_recipe;
  if rc.code is null or not ((select business_type from kos where id = p_kos) = any(rc.applies_to)) then raise exception 'Resep tidak tersedia'; end if;
  insert into automation_rules(kos_id, recipe, enabled, params, updated_by) values (p_kos, p_recipe, p_enabled, coalesce(rc.default_params || coalesce(p_params, '{}'), '{}'), actor_email())
  on conflict (kos_id, recipe) do update set enabled = excluded.enabled, params = rc.default_params || coalesce(p_params, automation_rules.params),
    fail_count = case when excluded.enabled then 0 else automation_rules.fail_count end, paused_reason = case when excluded.enabled then null else automation_rules.paused_reason end,
    updated_by = excluded.updated_by, updated_at = now()
  returning id into v_id;
  perform config_log(p_kos, case when p_enabled then 'nyalakan_otomatisasi' else 'matikan_otomatisasi' end, p_recipe, null, p_params, null, 'menengah', actor_email());
  return v_id;
end $$;

create or replace function public.automation_run_now(p_rule uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare ru automation_rules;
begin
  select * into ru from automation_rules where id = p_rule;
  if ru.id is null or not member_can(ru.kos_id, 'team') then raise exception 'Aturan tidak ditemukan'; end if;
  if exists (select 1 from automation_runs where rule_id = ru.id and trigger = 'manual' and started_at > now() - interval '5 minutes') then
    raise exception 'Tunggu 5 menit sebelum menjalankan lagi';
  end if;
  return automation_run_rule(p_rule, 'manual');
end $$;

create or replace function public.automation_notice_read(p_kos uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not member_in('settings', p_kos) then raise exception 'Tidak punya akses'; end if;
  update automation_notices set read_at = now() where kos_id = p_kos and read_at is null;
end $$;

-- Pemberitahuan otomatisasi yang belum dibaca muncul di Ringkasan pemilik
do $$
declare v text;
begin
  v := pg_get_functiondef('public.owner_overview2(date)'::regprocedure);
  v := replace(v, '    -- hal umum: persetujuan konfigurasi & langganan
    v_att := v_att', '    -- hal umum: persetujuan, otomatisasi & langganan
    v_att := v_att
      || coalesce((select jsonb_agg(jsonb_build_object(''text'', n || '' pemberitahuan otomatisasi belum dibaca'', ''href'', ''/otomatisasi'', ''tone'', ''gold'')) from (select count(*) n from automation_notices where kos_id = k.id and read_at is null) z where n > 0 and member_in(''settings'', k.id)), ''[]'')');
  if position('pemberitahuan otomatisasi' in v) = 0 then raise exception 'owner_overview2 tidak terganti (otomatisasi)'; end if;
  execute v;
end $$;

revoke execute on function public.approval_required(uuid, text), public.approval_needed(uuid, text), public.approval_number(uuid), public.approval_request(uuid, text, jsonb, text),
  public.approval_decide(uuid, boolean, text), public.approval_cancel(uuid), public.approval_rule_set(uuid, text, boolean), public.approval_rules_list(uuid),
  public.automation_list(uuid), public.automation_set(uuid, text, boolean, jsonb), public.automation_run_now(uuid), public.automation_notice_read(uuid) from public, anon;
grant execute on function public.approval_required(uuid, text), public.approval_needed(uuid, text), public.approval_request(uuid, text, jsonb, text),
  public.approval_decide(uuid, boolean, text), public.approval_cancel(uuid), public.approval_rule_set(uuid, text, boolean), public.approval_rules_list(uuid),
  public.automation_list(uuid), public.automation_set(uuid, text, boolean, jsonb), public.automation_run_now(uuid), public.automation_notice_read(uuid) to authenticated;
