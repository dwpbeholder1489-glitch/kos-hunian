-- Kontrak sewa digital (Properti Tahap 2, permintaan pemilik 28 Nov 2026).
-- • Template per bisnis (contract_templates) dengan isian {kunci}; bawaan = contract_default_body() bila pemilik belum membuat template.
-- • Kontrak (lease_contracts): draf (boleh diubah) → menunggu (isi DIBEKUKAN: sha256 + token link penyewa) → aktif (penyewa setuju DAN
--   pemilik menandatangani) / ditolak / batal; berakhir otomatis saat sewa selesai. Revisi = kontrak baru, yang lama batal (riwayat utuh).
-- • Persetujuan elektronik INTERNAL: penyewa membuka link pribadi, mengetik nama lengkap & menyetujui; dicatat waktu, nama, hash IP
--   (tanpa IP asli), dan hash isi. Ini bukti persetujuan internal, BUKAN tanda tangan elektronik tersertifikasi (PSrE) — ditulis di layar.
-- • Jejak audit = kolom log (jsonb) + config/peristiwa. Lampiran (scan KTP/kontrak bertanda tangan basah) = mesin attachments, entity 'contract'.
-- • PDF = halaman cetak A4 (Cetak/Simpan PDF browser).

create table if not exists public.contract_templates (
  id uuid primary key default gen_random_uuid(),
  kos_id uuid not null references public.kos(id) on delete cascade,
  name text not null check (length(trim(name)) between 3 and 80),
  body text not null check (length(body) between 50 and 30000),
  is_default boolean not null default false,
  active boolean not null default true,
  created_by uuid default auth.uid(),
  updated_at timestamptz not null default now()
);
create unique index if not exists contract_templates_default on public.contract_templates(kos_id) where is_default and active;
create table if not exists public.lease_contracts (
  id uuid primary key default gen_random_uuid(),
  kos_id uuid not null references public.kos(id) on delete cascade,
  number text not null,
  lease_id uuid references public.leases(id) on delete set null,
  occupant_id uuid references public.occupants(id) on delete set null,
  room_id uuid references public.rooms(id) on delete set null,
  template_id uuid references public.contract_templates(id) on delete set null,
  title text not null check (length(trim(title)) between 3 and 120),
  body text not null check (length(body) between 50 and 40000),
  body_hash text,
  status text not null default 'draf' check (status in ('draf', 'menunggu', 'aktif', 'ditolak', 'batal', 'berakhir')),
  token text unique,
  sent_at timestamptz,
  tenant_name text,
  tenant_approved_at timestamptz,
  tenant_ip_hash text,
  tenant_note text,
  owner_name text,
  owner_signed_by uuid,
  owner_signed_at timestamptz,
  revision_of uuid references public.lease_contracts(id) on delete set null,
  log jsonb not null default '[]',
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (kos_id, number)
);
create index if not exists lease_contracts_lease on public.lease_contracts(kos_id, lease_id);
alter table public.contract_templates enable row level security;
alter table public.lease_contracts enable row level security;
drop policy if exists contract_templates_read on public.contract_templates;
create policy contract_templates_read on public.contract_templates for select using (public.member_can(kos_id, 'rent') or public.member_can(kos_id, 'settings'));
drop policy if exists lease_contracts_read on public.lease_contracts;
create policy lease_contracts_read on public.lease_contracts for select using (public.member_can(kos_id, 'rent'));
grant select on public.contract_templates to authenticated;
-- token link penyewa tidak boleh terbaca dari tabel (hanya lewat contract_link untuk pengelola)
revoke all on public.lease_contracts from anon, authenticated;
grant select (id, kos_id, number, lease_id, occupant_id, room_id, template_id, title, body, body_hash, status, sent_at, tenant_name, tenant_approved_at, tenant_note,
  owner_name, owner_signed_at, revision_of, log, created_at, updated_at) on public.lease_contracts to authenticated;
do $$ declare t text; begin
  foreach t in array array['contract_templates', 'lease_contracts'] loop
    execute format('drop trigger if exists zz_kos_open_guard on public.%I', t);
    execute format('create trigger zz_kos_open_guard before insert or update or delete on public.%I for each row execute function public.kos_open_guard()', t);
  end loop;
end $$;

create or replace function public.contract_default_body()
returns text language sql immutable as $$
  select $b$PERJANJIAN SEWA {unit_kata}
Nomor: {nomor_kontrak}

Pada tanggal {tanggal_hari_ini}, yang bertanda tangan di bawah ini:
1. {nama_pemilik}, selaku pengelola {nama_bisnis}, beralamat di {alamat_bisnis}, selanjutnya disebut PIHAK PERTAMA.
2. {nama_penyewa}, nomor HP {hp_penyewa}, alamat {alamat_penyewa}, selanjutnya disebut PIHAK KEDUA.

Kedua pihak sepakat mengadakan perjanjian sewa dengan ketentuan berikut:

Pasal 1 — Objek sewa
PIHAK PERTAMA menyewakan {unit_kata} {kode_kamar} {properti} kepada PIHAK KEDUA untuk tempat tinggal/penggunaan yang wajar. Fasilitas: {fasilitas}.

Pasal 2 — Jangka waktu
Sewa dimulai {tanggal_mulai} dan berakhir {tanggal_selesai}. Perpanjangan dibicarakan paling lambat 7 hari sebelum berakhir.

Pasal 3 — Harga & pembayaran
Harga sewa {harga_sewa} per {siklus}. Tagihan pertama jatuh tempo {jatuh_tempo_pertama}; tagihan berikutnya dibayar di awal setiap periode. Cara bayar: {cara_bayar}.

Pasal 4 — Deposit
PIHAK KEDUA menyerahkan deposit sebesar {deposit}. Deposit dikembalikan saat sewa berakhir setelah dikurangi kewajiban yang belum dibayar dan biaya kerusakan di luar pemakaian wajar sesuai hasil pemeriksaan kamar.

Pasal 5 — Kewajiban & tata tertib
PIHAK KEDUA menjaga kebersihan, keamanan, dan perlengkapan {unit_kata}, serta mematuhi peraturan berikut:
{peraturan}

Pasal 6 — Lain-lain
Hal yang belum diatur diselesaikan secara musyawarah. Perjanjian ini disetujui secara elektronik melalui PRASARA; jejak persetujuan (nama, waktu, dan kode isi dokumen) tersimpan sebagai bukti.
$b$;
$$;

-- Nilai isian dari data sewa (tanpa angka yang ditebak: kosong ditulis "—")
create or replace function public.contract_vars(p_lease uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare l leases; o occupants; r rooms; k kos; v_dep numeric; v_first date; v_prop text;
begin
  select * into l from leases where id = p_lease;
  select * into o from occupants where id = l.occupant_id;
  select * into r from rooms where id = l.room_id;
  select * into k from kos where id = l.kos_id;
  v_dep := coalesce((select sum(case kind when 'terima' then amount else -amount end) from deposits where lease_id = l.id and status = 'aktif'), 0);
  v_first := coalesce(l.first_due, (select min(due_date) from invoices where lease_id = l.id and kind = 'sewa' and status <> 'batal'), l.billing_start);
  v_prop := (select name from branches where id = r.branch_id);
  return jsonb_build_object(
    'nama_bisnis', k.name, 'alamat_bisnis', coalesce(k.address, '—'), 'nama_pemilik', coalesce((select raw_user_meta_data ->> 'name' from auth.users where id = k.owner_id), 'Pemilik'),
    'nama_penyewa', o.name, 'hp_penyewa', coalesce(o.phone, '—'), 'alamat_penyewa', coalesce(o.address, '—'),
    'kode_kamar', r.code, 'properti', coalesce('di ' || v_prop, ''), 'fasilitas', coalesce(nullif(array_to_string(r.facilities, ', '), ''), '—'),
    'tanggal_mulai', to_char(coalesce(l.start_at at time zone 'Asia/Jakarta', l.start_date::timestamp), case when l.start_at is not null then 'DD-MM-YYYY HH24:MI' else 'DD-MM-YYYY' end),
    'tanggal_selesai', case when coalesce(l.end_at::text, l.end_date::text) is null then 'tanpa tanggal selesai (berlaku sampai salah satu pihak mengakhiri dengan pemberitahuan)'
                            else to_char(coalesce(l.end_at at time zone 'Asia/Jakarta', l.end_date::timestamp), case when l.end_at is not null then 'DD-MM-YYYY HH24:MI' else 'DD-MM-YYYY' end) end,
    'harga_sewa', 'Rp' || replace(to_char(case when l.cycle in ('jam', 'hari', 'khusus') then coalesce(l.stay_total, l.rent) else l.rent end, 'FM999,999,999,999'), ',', '.'),
    'siklus', case l.cycle when 'bulan' then 'bulan' when 'minggu' then 'minggu' when 'tahun' then 'tahun' else 'seluruh masa sewa' end,
    'jatuh_tempo_pertama', to_char(v_first, 'DD-MM-YYYY'),
    'deposit', case when v_dep > 0 then 'Rp' || replace(to_char(v_dep, 'FM999,999,999,999'), ',', '.') else 'Rp0 (tanpa deposit)' end,
    'cara_bayar', coalesce(nullif(trim(k.payment_info), ''), 'sesuai informasi dari PIHAK PERTAMA'),
    'peraturan', coalesce(nullif(trim(k.house_rules), ''), '—'),
    'unit_kata', case when k.subcategory_code in ('properti_kontrakan', 'properti_rumah') then 'RUMAH' when k.subcategory_code in ('properti_ruko', 'properti_gedung') then 'UNIT'
                      when k.subcategory_code in ('properti_apartemen', 'hospitality_serviced') then 'UNIT APARTEMEN' else 'KAMAR' end,
    'tanggal_hari_ini', to_char(now() at time zone 'Asia/Jakarta', 'DD-MM-YYYY'));
end $$;
create or replace function public.contract_render(p_body text, p_vars jsonb)
returns text language plpgsql immutable as $$
declare k text; v text := p_body;
begin
  for k in select jsonb_object_keys(p_vars) loop v := replace(v, '{' || k || '}', coalesce(p_vars ->> k, '—')); end loop;
  return v;
end $$;
revoke execute on function public.contract_vars(uuid) from public, anon, authenticated;

create or replace function public.contract_log(c lease_contracts, p_action text, p_note text)
returns jsonb language sql stable as $$
  select c.log || jsonb_build_object('at', now(), 'by', coalesce(actor_email(), 'sistem'), 'action', p_action, 'note', p_note, 'hash', c.body_hash);
$$;

create or replace function public.contract_template_save(p_kos uuid, p_id uuid, p jsonb)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if not member_in('settings', p_kos) then raise exception 'Template kontrak hanya bisa diatur pemilik/pengelola'; end if;
  if coalesce((p ->> 'is_default')::boolean, false) then update contract_templates set is_default = false where kos_id = p_kos and id is distinct from p_id; end if;
  if p_id is null then
    insert into contract_templates(kos_id, name, body, is_default, active) values (p_kos, trim(p ->> 'name'), p ->> 'body', coalesce((p ->> 'is_default')::boolean, false), true) returning id into v_id;
  else
    update contract_templates set name = trim(p ->> 'name'), body = p ->> 'body', is_default = coalesce((p ->> 'is_default')::boolean, false),
      active = coalesce((p ->> 'active')::boolean, true), updated_at = now() where id = p_id and kos_id = p_kos returning id into v_id;
    if v_id is null then raise exception 'Template tidak ditemukan'; end if;
  end if;
  perform config_log(p_kos, 'ubah_template_kontrak', trim(p ->> 'name'), null, jsonb_build_object('panjang', length(p ->> 'body')), null, 'rendah', null);
  return v_id;
end $$;

create or replace function public.contract_create(p_kos uuid, p_lease uuid, p_template uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare l leases; t contract_templates; v_id uuid := gen_random_uuid(); v_no text; v_body text;
begin
  if not member_in('rent', p_kos) then raise exception 'Tidak punya akses ke bisnis ini'; end if;
  select * into l from leases where id = p_lease and kos_id = p_kos;
  if l.id is null then raise exception 'Sewa tidak ditemukan'; end if;
  if exists (select 1 from lease_contracts where lease_id = l.id and status in ('draf', 'menunggu', 'aktif')) then
    raise exception 'Sewa ini sudah punya kontrak yang berjalan. Buka kontraknya, atau revisi/batalkan dulu.'; end if;
  select * into t from contract_templates where kos_id = p_kos and active and (id = p_template or (p_template is null and is_default)) limit 1;
  v_body := contract_render(coalesce(t.body, contract_default_body()), contract_vars(l.id));
  perform pg_advisory_xact_lock(hashtext('ktr_number:' || p_kos::text));
  v_no := 'KTR-' || to_char(now() at time zone 'Asia/Jakarta', 'YYMM') || '-' || lpad((select count(*) + 1 from lease_contracts where kos_id = p_kos)::text, 3, '0');
  v_body := replace(v_body, '{nomor_kontrak}', v_no);
  insert into lease_contracts(id, kos_id, number, lease_id, occupant_id, room_id, template_id, title, body, log)
  values (v_id, p_kos, v_no, l.id, l.occupant_id, l.room_id, t.id, 'Perjanjian sewa ' || (select code from rooms where id = l.room_id) || ' · ' || (select name from occupants where id = l.occupant_id),
    v_body, jsonb_build_array(jsonb_build_object('at', now(), 'by', actor_email(), 'action', 'dibuat', 'note', coalesce(t.name, 'template bawaan'))));
  return v_id;
end $$;

create or replace function public.contract_update(p_id uuid, p_title text, p_body text)
returns void language plpgsql security definer set search_path = public as $$
declare c lease_contracts;
begin
  select * into c from lease_contracts where id = p_id for update;
  if c.id is null or not member_in('rent', c.kos_id) then raise exception 'Kontrak tidak ditemukan'; end if;
  if c.status <> 'draf' then raise exception 'Kontrak yang sudah dikirim tidak bisa diubah. Pakai Revisi untuk membuat versi baru.'; end if;
  update lease_contracts set title = trim(p_title), body = p_body, updated_at = now(), log = contract_log(c, 'diubah', null) where id = c.id;
end $$;

create or replace function public.contract_send(p_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare c lease_contracts; v_hash text; v_tok text;
begin
  select * into c from lease_contracts where id = p_id for update;
  if c.id is null or not member_in('rent', c.kos_id) then raise exception 'Kontrak tidak ditemukan'; end if;
  if c.status = 'menunggu' then return jsonb_build_object('token', c.token, 'hash', c.body_hash); end if;
  if c.status <> 'draf' then raise exception 'Hanya kontrak draf yang bisa dikirim'; end if;
  if c.body ~ '\{[a-z_]+\}' then raise exception 'Masih ada isian yang belum terisi: %', substring(c.body from '\{[a-z_]+\}'); end if;
  v_hash := encode(extensions.digest(convert_to(c.title || E'\n' || c.body, 'UTF8'), 'sha256'), 'hex');
  v_tok := replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');
  c.body_hash := v_hash;
  update lease_contracts set status = 'menunggu', body_hash = v_hash, token = v_tok, sent_at = now(), updated_at = now(), log = contract_log(c, 'dikirim', 'isi dibekukan') where id = c.id;
  return jsonb_build_object('token', v_tok, 'hash', v_hash);
end $$;

-- Token untuk membagikan link ulang (hanya pengelola sewa)
create or replace function public.contract_link(p_id uuid)
returns text language plpgsql stable security definer set search_path = public as $$
declare c lease_contracts;
begin
  select * into c from lease_contracts where id = p_id;
  if c.id is null or not member_in('rent', c.kos_id) then raise exception 'Kontrak tidak ditemukan'; end if;
  return case when c.status in ('menunggu', 'aktif', 'ditolak', 'berakhir') then c.token end;
end $$;

create or replace function public.contract_owner_sign(p_id uuid, p_name text)
returns text language plpgsql security definer set search_path = public as $$
declare c lease_contracts; v_status text;
begin
  select * into c from lease_contracts where id = p_id for update;
  if c.id is null or not member_in('settings', c.kos_id) then raise exception 'Hanya pemilik/pengelola yang bisa menandatangani kontrak'; end if;
  if c.status <> 'menunggu' then raise exception 'Kontrak harus dikirim dulu (status sekarang: %)', c.status; end if;
  if c.owner_signed_at is not null then return c.status; end if;
  if length(trim(coalesce(p_name, ''))) < 3 then raise exception 'Ketik nama lengkap penandatangan'; end if;
  v_status := case when c.tenant_approved_at is not null then 'aktif' else 'menunggu' end;
  update lease_contracts set owner_name = trim(p_name), owner_signed_by = auth.uid(), owner_signed_at = now(), status = v_status, updated_at = now(),
    log = contract_log(c, 'ditandatangani_pengelola', trim(p_name)) where id = c.id;
  return v_status;
end $$;

create or replace function public.contract_cancel(p_id uuid, p_reason text)
returns void language plpgsql security definer set search_path = public as $$
declare c lease_contracts;
begin
  select * into c from lease_contracts where id = p_id for update;
  if c.id is null or not member_in('rent', c.kos_id) then raise exception 'Kontrak tidak ditemukan'; end if;
  if c.status in ('batal', 'berakhir') then raise exception 'Kontrak sudah %', c.status; end if;
  if c.status = 'aktif' and not member_in('settings', c.kos_id) then raise exception 'Kontrak aktif hanya bisa dibatalkan pemilik/pengelola'; end if;
  if length(trim(coalesce(p_reason, ''))) < 3 then raise exception 'Tulis alasan pembatalan'; end if;
  update lease_contracts set status = 'batal', updated_at = now(), log = contract_log(c, 'dibatalkan', trim(p_reason)) where id = c.id;
end $$;

-- Revisi: salin isi ke draf baru (nomor baru), yang lama dibatalkan dengan catatan
create or replace function public.contract_revise(p_id uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare c lease_contracts; v_id uuid := gen_random_uuid(); v_no text;
begin
  select * into c from lease_contracts where id = p_id for update;
  if c.id is null or not member_in('rent', c.kos_id) then raise exception 'Kontrak tidak ditemukan'; end if;
  if c.status not in ('menunggu', 'ditolak', 'aktif') then raise exception 'Kontrak draf bisa langsung diubah'; end if;
  if c.status = 'aktif' and not member_in('settings', c.kos_id) then raise exception 'Kontrak aktif hanya bisa direvisi pemilik/pengelola'; end if;
  perform pg_advisory_xact_lock(hashtext('ktr_number:' || c.kos_id::text));
  v_no := 'KTR-' || to_char(now() at time zone 'Asia/Jakarta', 'YYMM') || '-' || lpad((select count(*) + 1 from lease_contracts where kos_id = c.kos_id)::text, 3, '0');
  update lease_contracts set status = 'batal', updated_at = now(), log = contract_log(c, 'diganti_revisi', v_no) where id = c.id;
  insert into lease_contracts(id, kos_id, number, lease_id, occupant_id, room_id, template_id, title, body, revision_of, log)
  values (v_id, c.kos_id, v_no, c.lease_id, c.occupant_id, c.room_id, c.template_id, c.title, replace(c.body, c.number, v_no), c.id,
    jsonb_build_array(jsonb_build_object('at', now(), 'by', actor_email(), 'action', 'revisi_dari', 'note', c.number)));
  return v_id;
end $$;

-- Sewa selesai → kontrak aktif berakhir
create or replace function public.leases_contract_end()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'selesai' and old.status = 'aktif' then
    update lease_contracts c set status = 'berakhir', updated_at = now(), log = c.log || jsonb_build_object('at', now(), 'by', 'sistem', 'action', 'berakhir', 'note', 'sewa selesai ' || to_char(new.end_date, 'DD-MM-YYYY'))
    where c.lease_id = new.id and c.status = 'aktif';
  end if;
  return null;
end $$;
drop trigger if exists leases_contract_end on public.leases;
create trigger leases_contract_end after update of status on public.leases for each row execute function public.leases_contract_end();
revoke execute on function public.leases_contract_end() from public, anon, authenticated;

-- ---------- Penyewa (publik, lewat token) ----------
create or replace function public.contract_public_get(p_token text)
returns jsonb language sql stable security definer set search_path = public as $$
  select case when c.id is null then null else jsonb_build_object('number', c.number, 'title', c.title, 'body', c.body, 'hash', c.body_hash, 'status', c.status,
    'business', k.name, 'tenant', o.name, 'tenant_name', c.tenant_name, 'tenant_approved_at', c.tenant_approved_at, 'tenant_note', c.tenant_note,
    'owner_name', c.owner_name, 'owner_signed_at', c.owner_signed_at, 'sent_at', c.sent_at) end
  from (select 1) d left join lease_contracts c on c.token = p_token and length(p_token) >= 40 and c.status in ('menunggu', 'aktif', 'ditolak', 'berakhir')
  left join kos k on k.id = c.kos_id left join occupants o on o.id = c.occupant_id;
$$;
-- Hanya server (kunci rahasia) — /api/kontrak menghitung hash IP
create or replace function public.contract_public_respond(p_token text, p_decision text, p_name text, p_note text, p_ip_hash text, p_hash text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare c lease_contracts;
begin
  select * into c from lease_contracts where token = p_token and length(p_token) >= 40 for update;
  if c.id is null then return jsonb_build_object('ok', false, 'error', 'Link kontrak tidak berlaku'); end if;
  if c.status <> 'menunggu' or c.tenant_approved_at is not null then return jsonb_build_object('ok', false, 'error', 'Kontrak ini sudah ditanggapi'); end if;
  if p_hash is distinct from c.body_hash then return jsonb_build_object('ok', false, 'error', 'Isi kontrak berubah. Muat ulang halaman.'); end if;
  if p_decision not in ('setuju', 'tolak') then return jsonb_build_object('ok', false, 'error', 'Pilih setuju atau tolak'); end if;
  if length(trim(coalesce(p_name, ''))) < 3 then return jsonb_build_object('ok', false, 'error', 'Ketik nama lengkap Anda'); end if;
  if p_decision = 'tolak' and length(trim(coalesce(p_note, ''))) < 3 then return jsonb_build_object('ok', false, 'error', 'Tulis alasan atau bagian yang perlu diubah'); end if;
  if p_decision = 'setuju' then
    update lease_contracts set tenant_name = left(trim(p_name), 80), tenant_approved_at = now(), tenant_ip_hash = left(p_ip_hash, 80), tenant_note = nullif(left(trim(coalesce(p_note, '')), 500), ''),
      status = case when owner_signed_at is not null then 'aktif' else 'menunggu' end, updated_at = now(),
      log = log || jsonb_build_object('at', now(), 'by', 'penyewa', 'action', 'disetujui_penyewa', 'note', left(trim(p_name), 80), 'hash', c.body_hash) where id = c.id;
  else
    update lease_contracts set tenant_name = left(trim(p_name), 80), tenant_ip_hash = left(p_ip_hash, 80), tenant_note = left(trim(p_note), 500), status = 'ditolak', updated_at = now(),
      log = log || jsonb_build_object('at', now(), 'by', 'penyewa', 'action', 'ditolak_penyewa', 'note', left(trim(p_note), 200), 'hash', c.body_hash) where id = c.id;
  end if;
  perform notif_emit_safe(c.kos_id, case when p_decision = 'setuju' then 'ContractApproved' else 'ContractRejected' end, 'contract:' || c.id || ':' || p_decision, 'rent',
    'Kontrak ' || c.number || case when p_decision = 'setuju' then ' disetujui ' else ' ditolak ' end || left(trim(p_name), 60), null, jsonb_build_object('contract_id', c.id), null, 'contract', c.id);
  return jsonb_build_object('ok', true);
end $$;
revoke execute on function public.contract_public_get(text) from public;
grant execute on function public.contract_public_get(text) to anon, authenticated;
revoke execute on function public.contract_public_respond(text, text, text, text, text, text) from public, anon, authenticated;
grant execute on function public.contract_public_respond(text, text, text, text, text, text) to service_role;
revoke execute on function public.contract_template_save(uuid, uuid, jsonb), public.contract_create(uuid, uuid, uuid), public.contract_update(uuid, text, text), public.contract_send(uuid),
  public.contract_link(uuid), public.contract_owner_sign(uuid, text), public.contract_cancel(uuid, text), public.contract_revise(uuid) from public, anon;
grant execute on function public.contract_template_save(uuid, uuid, jsonb), public.contract_create(uuid, uuid, uuid), public.contract_update(uuid, text, text), public.contract_send(uuid),
  public.contract_link(uuid), public.contract_owner_sign(uuid, text), public.contract_cancel(uuid, text), public.contract_revise(uuid) to authenticated;
grant execute on function public.contract_default_body() to authenticated;

insert into public.notif_event_types(code, category, priority, audience, area, title, push_default, link, module) values
  ('ContractApproved', 'pelanggan', 'normal', 'area', 'rent', 'Kontrak disetujui penyewa', true, '/kontrak', 'p_kontrak'),
  ('ContractRejected', 'pelanggan', 'tinggi', 'area', 'rent', 'Kontrak ditolak penyewa', true, '/kontrak', 'p_kontrak')
on conflict (code) do nothing;

-- ---------- Lampiran kontrak (mesin attachments) ----------
alter table public.attachments drop constraint if exists attachments_entity_check;
alter table public.attachments add constraint attachments_entity_check check (entity in ('bb_record', 'svc_order', 'maint_ticket', 'occupant', 'expense', 'project', 'room_item', 'room_inspection', 'contract'));
create or replace function public._prasara_patch(p_sig text, p_old text, p_new text)
returns void language plpgsql as $$
declare d text;
begin
  d := pg_get_functiondef(p_sig::regprocedure);
  if position(p_old in d) = 0 then raise exception 'patch %: potongan tidak ditemukan', p_sig; end if;
  execute replace(d, p_old, p_new);
end $$;
select public._prasara_patch('public.att_target(text,uuid)', $o$  elsif p_entity = 'project' then$o$,
  $n$  elsif p_entity = 'contract' then
    select c.kos_id, 'rent', 'rent' into kos_id, read_area, write_area from lease_contracts c where c.id = p_id;
  elsif p_entity = 'project' then$n$);
select public._prasara_patch('public.att_target(text,uuid)', $o$if p_entity in ('maint_ticket', 'occupant') and$o$, $n$if p_entity in ('maint_ticket', 'occupant', 'contract') and$n$);
drop function public._prasara_patch(text, text, text);
drop trigger if exists att_gone on public.lease_contracts;
create trigger att_gone after delete on public.lease_contracts for each row execute function public.att_parent_gone('contract');

insert into public.modules(code, name, description, applies_to, core, depends_on, entitlement, paths, data_used, status, version, sort, module_type, category, impl_status, feature_keys, area, optional_deps, owner_approval, config_path)
select 'p_kontrak', 'Kontrak sewa digital', 'Kontrak dari template otomatis, persetujuan elektronik penyewa lewat link pribadi, tanda tangan pengelola, jejak audit, lampiran dokumen, dan cetak/PDF.',
       '{properti}', false, '{p_kamar}', null, '{/kontrak}', 'contract_templates, lease_contracts, attachments', 'available', '1.0', 14, 'operational', category, 'production_ready', '{}', 'rent', '{}', false, '/kontrak'
from public.modules where code = 'p_booking'
on conflict (code) do nothing;
insert into public.business_modules(kos_id, module_code, active, updated_by)
select k.id, 'p_kontrak', true, 'sistem' from public.kos k where k.business_type = 'properti' on conflict do nothing;
update public.biz_templates set spec = jsonb_set(spec, '{modules}', coalesce(spec -> 'modules', '[]'::jsonb) || '["p_kontrak"]'::jsonb)
where code = 'kos' and not coalesce(spec -> 'modules', '[]'::jsonb) ? 'p_kontrak';

-- Tarif & kalender (p_tarif) otomatis aktif untuk jenis penginapan/apartemen saat jenis bisnis dipilih/diubah (jenis lain: aktifkan di Konfigurasi › Modul)
create or replace function public.kos_rental_module()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.business_type = 'properti' and (new.category_code = 'hospitality' or new.subcategory_code in ('properti_homestay', 'properti_apartemen', 'kuliner_penginapan', 'travel_penginapan', 'hospitality_serviced')) then
    begin
      insert into business_modules(kos_id, module_code, active, updated_by) values (new.id, 'p_tarif', true, 'sistem') on conflict do nothing;
    exception when others then null; -- jangan pernah menggagalkan simpan profil bisnis
    end;
  end if;
  return null;
end $$;
drop trigger if exists kos_rental_module on public.kos;
create trigger kos_rental_module after insert or update of subcategory_code, category_code on public.kos for each row execute function public.kos_rental_module();
revoke execute on function public.kos_rental_module() from public, anon, authenticated;
