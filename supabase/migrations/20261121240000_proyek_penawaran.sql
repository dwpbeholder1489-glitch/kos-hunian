-- Penawaran proyek & scope — Tahap 1B blueprint Event, Media & Creative (§13 CRM & Sales, §13.1 Scope management, §6.5 Revision policy).
-- Alur: draf → terkirim (bisa direvisi; revisi bernomor + riwayat isi lama) → disetujui / ditolak / batal.
--   * Penawaran AWAL disetujui → proyek dibuat (atau proyek berstatus 'penawaran' dijalankan): nilai kontrak = total penawaran,
--     batas revisi, jadwal, dan milestone dari termin pembayaran (rencana nilai termin).
--   * PERUBAHAN SCOPE (change request) pada proyek berjalan disetujui → nilai kontrak bertambah, batas revisi bertambah,
--     tanggal selesai bisa digeser, milestone termin tambahan dibuat.
-- Tetap TIDAK ada uang yang bergerak: penawaran & termin = rencana. Penagihan termin + jurnal (uang muka → pendapatan) = Tahap 1D.
-- Tanpa PPN: mesin jasa belum punya PPN keluaran (lihat AUDIT_MODUL_V2). Harga = harga akhir.
-- Persetujuan klien dicatat oleh pemilik/pengelola (nama & tanggal persetujuan klien). Persetujuan lewat portal klien menyusul.
-- Izin: membuat/mengubah/mengirim = settings atau finance; memutuskan (disetujui/ditolak) = settings (keputusan komersial).

alter table public.prj_projects add column if not exists quote_id uuid;
alter table public.prj_projects add column if not exists revision_limit int check (revision_limit is null or revision_limit between 0 and 999);

create table if not exists public.prj_quotes (
  id uuid primary key default gen_random_uuid(),
  kos_id uuid not null references public.kos(id) on delete cascade,
  number text not null,
  kind text not null default 'awal' check (kind in ('awal', 'perubahan')),
  project_id uuid references public.prj_projects(id) on delete set null,
  contact_id uuid references public.contacts(id) on delete set null,
  title text not null check (length(trim(title)) between 2 and 120),
  project_kind text not null default 'umum' check (project_kind in ('event', 'kreatif', 'produksi', 'umum')),
  status text not null default 'draf' check (status in ('draf', 'terkirim', 'disetujui', 'ditolak', 'batal')),
  quote_date date not null default ((now() at time zone 'Asia/Jakarta')::date),
  valid_until date,
  start_date date, end_date date,                      -- awal: jadwal proyek; perubahan: end_date = tanggal selesai baru (opsional)
  revision int not null default 0,                     -- revisi penawaran ke-n (0 = asli)
  subtotal numeric(14,2) not null default 0, discount numeric(14,2) not null default 0 check (discount >= 0), total numeric(14,2) not null default 0 check (total >= 0),
  scope_in text check (scope_in is null or length(scope_in) <= 3000),
  scope_out text check (scope_out is null or length(scope_out) <= 3000),
  client_duties text check (client_duties is null or length(client_duties) <= 2000),
  revision_limit int check (revision_limit is null or revision_limit between 0 and 99),
  extra_revision text check (extra_revision is null or length(extra_revision) <= 300),   -- ketentuan revisi tambahan berbayar
  terms jsonb not null default '[]',                   -- [{name, pct?, amount}] — amount dihitung server, Σ = total
  note text check (note is null or length(note) <= 1000),
  sent_at timestamptz, decided_at timestamptz, decided_by uuid, decision_note text check (decision_note is null or length(decision_note) <= 300),
  client_approver text check (client_approver is null or length(client_approver) <= 80), client_approved_on date,
  history jsonb not null default '[]',                 -- isi sebelum tiap revisi
  created_by uuid default auth.uid(), created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  check (end_date is null or start_date is null or end_date >= start_date),
  unique (kos_id, number)
);
create index if not exists prj_quotes_kos on public.prj_quotes(kos_id, status);
create index if not exists prj_quotes_project on public.prj_quotes(project_id) where project_id is not null;

create table if not exists public.prj_quote_lines (
  id uuid primary key default gen_random_uuid(),
  kos_id uuid not null references public.kos(id) on delete cascade,
  quote_id uuid not null references public.prj_quotes(id) on delete cascade,
  sort int not null default 0,
  description text not null check (length(trim(description)) between 1 and 300),
  qty numeric(12,3) not null check (qty > 0 and qty <= 1000000),
  unit text check (unit is null or length(unit) <= 20),
  price numeric(14,2) not null check (price >= 0 and price <= 999999999999),
  amount numeric(14,2) not null
);
create index if not exists prj_quote_lines_q on public.prj_quote_lines(quote_id, sort);

do $$ declare t text; begin
  foreach t in array array['prj_quotes', 'prj_quote_lines'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
    execute format('drop trigger if exists zz_kos_open_guard on public.%I', t);
    execute format('create trigger zz_kos_open_guard before insert or update or delete on public.%I for each row execute function public.kos_open_guard()', t);
  end loop;
end $$;

-- ---------- Bantu ----------
create or replace function public.prj_next_number(p_kos uuid, p_prefix text, p_table text)
returns text language plpgsql security definer set search_path = public as $$
declare v_today date := (now() at time zone 'Asia/Jakarta')::date; v_pre text; v_n int;
begin
  -- kunci sama dengan prj_save ('prj_number:<kos>') agar nomor proyek dari dua jalur tidak bentrok
  perform pg_advisory_xact_lock(hashtext(lower(p_prefix) || '_number:' || p_kos::text));
  v_pre := p_prefix || '-' || to_char(v_today, 'YYMM') || '-';
  execute format('select coalesce(max(substring(number from ''\d+$'')::int), 0) + 1 from %I where kos_id = $1 and number like $2', p_table)
    into v_n using p_kos, v_pre || '%';
  return v_pre || lpad(v_n::text, 3, '0');
end $$;

create or replace function public.quote_guard(p_kos uuid, p_write boolean)
returns void language plpgsql stable security definer set search_path = public as $$
begin
  perform prj_guard(p_kos, p_write);
  if not member_in('settings,finance', p_kos) then raise exception 'Penawaran hanya untuk pemilik, pengelola, atau bagian keuangan'; end if;
end $$;

create or replace function public.quote_emit(q prj_quotes, p_type text, p_summary text)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform dom_emit(q.kos_id, p_type, case when q.project_id is not null then 'project' else 'quote' end, coalesce(q.project_id, q.id),
    q.id::text || ':' || p_type || ':' || extract(epoch from clock_timestamp())::text, 'finance',
    coalesce((select number || ' · ' from prj_projects where id = q.project_id), '') || q.number || ' · ' || p_summary, q.total,
    jsonb_build_object('quote_id', q.id, 'kind', q.kind));
end $$;

-- ---------- Simpan (buat / revisi) ----------
create or replace function public.prj_quote_save(p_kos uuid, p_id uuid, p_data jsonb)
returns uuid language plpgsql security definer set search_path = public as $$
declare q prj_quotes; p prj_projects; v_id uuid := coalesce(p_id, gen_random_uuid()); v_new boolean; v_kind text := coalesce(nullif(p_data->>'kind', ''), 'awal');
        v_contact uuid; v_project uuid; v_title text := trim(coalesce(p_data->>'title', '')); v_pkind text := coalesce(nullif(p_data->>'project_kind', ''), 'umum');
        l jsonb; i int := 0; v_sub numeric := 0; v_disc numeric := coalesce(nullif(p_data->>'discount', '')::numeric, 0); v_total numeric;
        t jsonb; v_terms jsonb := '[]'; v_pct numeric := 0; v_sum numeric := 0; v_amt numeric; v_n int; v_has_pct boolean; v_rev int;
        v_start date := nullif(p_data->>'start_date', '')::date; v_end date := nullif(p_data->>'end_date', '')::date; v_rl int := nullif(p_data->>'revision_limit', '')::int;
begin
  perform quote_guard(p_kos, true);
  select * into q from prj_quotes where id = p_id and kos_id = p_kos;
  v_new := q.id is null;
  if v_new and p_id is not null and exists (select 1 from prj_quotes where id = p_id) then raise exception 'Penawaran tidak ditemukan'; end if;
  if not v_new then
    if q.status not in ('draf', 'terkirim') then raise exception 'Penawaran sudah %; buat penawaran perubahan bila ada tambahan pekerjaan.', q.status; end if;
    v_kind := q.kind; v_project := q.project_id;                     -- jenis & proyek tidak berubah setelah dibuat
    if nullif(p_data->>'project_kind', '') is null then v_pkind := q.project_kind; end if;   -- tidak dikirim = pakai yang lama (bukan 'umum')
  end if;
  if v_kind not in ('awal', 'perubahan') then raise exception 'Jenis penawaran tidak dikenal'; end if;
  if v_pkind not in ('event', 'kreatif', 'produksi', 'umum') then raise exception 'Jenis proyek tidak dikenal'; end if;
  if length(v_title) < 2 or length(v_title) > 120 then raise exception 'Judul penawaran 2–120 huruf'; end if;
  if v_start is not null and v_end is not null and v_end < v_start then raise exception 'Tanggal selesai tidak boleh sebelum tanggal mulai'; end if;
  if v_rl is not null and (v_rl < 0 or v_rl > 99) then raise exception 'Batas revisi 0–99'; end if;
  -- proyek
  if v_new and nullif(p_data->>'project_id', '') is not null then
    select * into p from prj_projects where id = (p_data->>'project_id')::uuid and kos_id = p_kos;
    if p.id is null then raise exception 'Proyek tidak ditemukan'; end if;
    v_project := p.id;
  elsif v_project is not null then
    select * into p from prj_projects where id = v_project;
  end if;
  if v_kind = 'perubahan' then
    if p.id is null then raise exception 'Perubahan scope harus untuk proyek yang sudah ada'; end if;
    if p.status = 'batal' then raise exception 'Proyek sudah batal'; end if;
    if p.quote_id is null and p.status = 'penawaran' then raise exception 'Proyek ini masih penawaran — ubah penawaran awalnya saja'; end if;
  elsif p.id is not null and v_new then
    if p.quote_id is not null then raise exception 'Proyek ini sudah punya penawaran yang disetujui. Pakai Perubahan scope untuk tambahan pekerjaan.'; end if;
    if p.status not in ('penawaran', 'berjalan', 'ditunda') then raise exception 'Proyek sudah %', p.status; end if;
  end if;
  -- klien
  if nullif(p_data->>'contact_id', '') is not null then
    select id into v_contact from contacts where id = (p_data->>'contact_id')::uuid and kos_id = p_kos and kind = 'pelanggan';
    if v_contact is null then raise exception 'Pelanggan tidak ditemukan'; end if;
  elsif length(trim(coalesce(p_data->>'client_name', ''))) >= 1 then
    if length(trim(p_data->>'client_name')) > 80 then raise exception 'Nama klien maks. 80 huruf'; end if;
    insert into contacts(kos_id, kind, name, phone) values (p_kos, 'pelanggan', trim(p_data->>'client_name'), nullif(trim(coalesce(p_data->>'client_phone', '')), ''))
    returning id into v_contact;
  else
    v_contact := coalesce(q.contact_id, p.contact_id);
  end if;
  -- baris
  if jsonb_typeof(p_data->'lines') <> 'array' or jsonb_array_length(p_data->'lines') = 0 then raise exception 'Isi minimal satu baris pekerjaan'; end if;
  if jsonb_array_length(p_data->'lines') > 100 then raise exception 'Maksimal 100 baris'; end if;
  for l in select * from jsonb_array_elements(p_data->'lines') loop
    if length(trim(coalesce(l->>'description', ''))) < 1 then raise exception 'Setiap baris harus punya uraian'; end if;
    if coalesce(nullif(l->>'qty', '')::numeric, 0) <= 0 then raise exception 'Jumlah harus lebih dari 0 (%)', l->>'description'; end if;
    if coalesce(nullif(l->>'price', '')::numeric, -1) < 0 then raise exception 'Harga tidak valid (%)', l->>'description'; end if;
    v_sub := v_sub + round((l->>'qty')::numeric * (l->>'price')::numeric, 2);
  end loop;
  if v_disc < 0 or v_disc > v_sub then raise exception 'Potongan harus antara 0 dan subtotal'; end if;
  v_total := v_sub - v_disc;
  if v_total > 999999999999 then raise exception 'Total terlalu besar'; end if;
  -- termin: semua pakai persen (Σ = 100) ATAU semua nominal (Σ = total). Pembulatan persen masuk termin terakhir.
  if jsonb_typeof(coalesce(p_data->'terms', '[]')) <> 'array' then raise exception 'Termin tidak valid'; end if;
  v_n := jsonb_array_length(coalesce(p_data->'terms', '[]'));
  if v_n > 12 then raise exception 'Maksimal 12 termin'; end if;
  if v_n > 0 then
    v_has_pct := (p_data->'terms'->0) ? 'pct' and nullif(p_data->'terms'->0->>'pct', '') is not null;
    i := 0;
    for t in select * from jsonb_array_elements(p_data->'terms') loop
      i := i + 1;
      if length(trim(coalesce(t->>'name', ''))) < 1 or length(t->>'name') > 80 then raise exception 'Nama termin wajib (maks. 80 huruf)'; end if;
      if v_has_pct then
        if coalesce(nullif(t->>'pct', '')::numeric, -1) <= 0 then raise exception 'Persen termin harus lebih dari 0'; end if;
        v_pct := v_pct + (t->>'pct')::numeric;
        v_amt := case when i = v_n then v_total - v_sum else round(v_total * (t->>'pct')::numeric / 100, 0) end;
        v_terms := v_terms || jsonb_build_object('name', trim(t->>'name'), 'pct', (t->>'pct')::numeric, 'amount', v_amt);
      else
        v_amt := coalesce(nullif(t->>'amount', '')::numeric, -1);
        if v_amt < 0 then raise exception 'Nominal termin tidak valid'; end if;
        v_terms := v_terms || jsonb_build_object('name', trim(t->>'name'), 'amount', v_amt);
      end if;
      v_sum := v_sum + v_amt;
    end loop;
    if v_has_pct and abs(v_pct - 100) > 0.01 then raise exception 'Jumlah persen termin harus 100%% (sekarang % persen)', v_pct; end if;
    if not v_has_pct and v_sum <> v_total then raise exception 'Jumlah termin (%) harus sama dengan total penawaran (%)', dom_rp(v_sum), dom_rp(v_total); end if;
  end if;

  if v_new then
    insert into prj_quotes(id, kos_id, number, kind, project_id, contact_id, title, project_kind, valid_until, start_date, end_date, subtotal, discount, total,
      scope_in, scope_out, client_duties, revision_limit, extra_revision, terms, note)
    values (v_id, p_kos, prj_next_number(p_kos, 'PNW', 'prj_quotes'), v_kind, v_project, v_contact, v_title, coalesce(p.kind, v_pkind),
      nullif(p_data->>'valid_until', '')::date, v_start, v_end, v_sub, v_disc, v_total,
      nullif(left(trim(coalesce(p_data->>'scope_in', '')), 3000), ''), nullif(left(trim(coalesce(p_data->>'scope_out', '')), 3000), ''),
      nullif(left(trim(coalesce(p_data->>'client_duties', '')), 2000), ''), v_rl, nullif(left(trim(coalesce(p_data->>'extra_revision', '')), 300), ''),
      v_terms, nullif(left(trim(coalesce(p_data->>'note', '')), 1000), ''));
    select * into q from prj_quotes where id = v_id;
    perform quote_emit(q, case when v_kind = 'perubahan' then 'ChangeRequested' else 'QuoteCreated' end,
      case when v_kind = 'perubahan' then 'Perubahan scope diajukan' else 'Penawaran dibuat' end || ' · ' || dom_rp(v_total));
  else
    -- penawaran yang sudah dikirim lalu diubah = revisi; isi lama disimpan
    v_rev := q.revision + case when q.status = 'terkirim' then 1 else 0 end;
    update prj_quotes set contact_id = v_contact, title = v_title, project_kind = coalesce(p.kind, v_pkind), valid_until = nullif(p_data->>'valid_until', '')::date,
      start_date = v_start, end_date = v_end, subtotal = v_sub, discount = v_disc, total = v_total,
      scope_in = nullif(left(trim(coalesce(p_data->>'scope_in', '')), 3000), ''), scope_out = nullif(left(trim(coalesce(p_data->>'scope_out', '')), 3000), ''),
      client_duties = nullif(left(trim(coalesce(p_data->>'client_duties', '')), 2000), ''), revision_limit = v_rl,
      extra_revision = nullif(left(trim(coalesce(p_data->>'extra_revision', '')), 300), ''), terms = v_terms, note = nullif(left(trim(coalesce(p_data->>'note', '')), 1000), ''),
      revision = v_rev, status = 'draf',
      history = case when q.status = 'terkirim' then history || jsonb_build_object('revision', q.revision, 'at', now(), 'by', actor_email(), 'total', q.total,
        'terms', q.terms, 'lines', (select coalesce(jsonb_agg(jsonb_build_object('description', description, 'qty', qty, 'unit', unit, 'price', price) order by sort), '[]')
                                    from prj_quote_lines where quote_id = q.id)) else history end,
      updated_at = now()
    where id = q.id;
    delete from prj_quote_lines where quote_id = q.id;
    if q.status = 'terkirim' then
      select * into q from prj_quotes where id = q.id;
      perform quote_emit(q, 'QuoteRevised', 'Revisi ' || q.revision || ' · ' || dom_rp(v_total));
    end if;
  end if;
  i := 0;
  for l in select * from jsonb_array_elements(p_data->'lines') loop
    i := i + 1;
    insert into prj_quote_lines(kos_id, quote_id, sort, description, qty, unit, price, amount)
    values (p_kos, v_id, i, left(trim(l->>'description'), 300), (l->>'qty')::numeric, nullif(left(trim(coalesce(l->>'unit', '')), 20), ''), (l->>'price')::numeric,
            round((l->>'qty')::numeric * (l->>'price')::numeric, 2));
  end loop;
  return v_id;
end $$;

-- ---------- Kirim (tanda saja; pesan WA dibuat di halaman dokumen) ----------
create or replace function public.prj_quote_send(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare q prj_quotes;
begin
  select * into q from prj_quotes where id = p_id;
  if q.id is null then raise exception 'Penawaran tidak ditemukan'; end if;
  perform quote_guard(q.kos_id, true);
  if q.status not in ('draf', 'terkirim') then raise exception 'Penawaran sudah %', q.status; end if;
  update prj_quotes set status = 'terkirim', sent_at = now(), updated_at = now() where id = q.id;
  if q.status = 'draf' then perform quote_emit(q, 'QuoteSent', 'Penawaran dikirim ke klien' || case when q.revision > 0 then ' (revisi ' || q.revision || ')' else '' end); end if;
end $$;

-- ---------- Keputusan klien ----------
-- p: {note, client_approver, client_approved_on}. Lewat masa berlaku tetap boleh (kenyataan: klien setuju terlambat) — hasil 'expired' true.
create or replace function public.prj_quote_decide(p_id uuid, p_decision text, p jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare q prj_quotes; pr prj_projects; v_proj uuid; t jsonb; i int := 0; v_on date := coalesce(nullif(p->>'client_approved_on', '')::date, (now() at time zone 'Asia/Jakarta')::date);
        v_note text := nullif(trim(coalesce(p->>'note', '')), ''); v_expired boolean;
begin
  select * into q from prj_quotes where id = p_id for update;
  if q.id is null then raise exception 'Penawaran tidak ditemukan'; end if;
  perform quote_guard(q.kos_id, true);
  if not member_in('settings', q.kos_id) then raise exception 'Keputusan penawaran dicatat oleh pemilik atau pengelola'; end if;
  if p_decision not in ('disetujui', 'ditolak') then raise exception 'Keputusan tidak dikenal'; end if;
  if q.status not in ('draf', 'terkirim') then raise exception 'Penawaran sudah %', q.status; end if;
  if v_note is not null and length(v_note) > 300 then raise exception 'Catatan maks. 300 huruf'; end if;
  if v_on > (now() at time zone 'Asia/Jakarta')::date then raise exception 'Tanggal persetujuan klien tidak boleh di masa depan'; end if;
  v_expired := q.valid_until is not null and q.valid_until < v_on;

  if p_decision = 'ditolak' then
    update prj_quotes set status = 'ditolak', decided_at = now(), decided_by = auth.uid(), decision_note = v_note, updated_at = now() where id = q.id;
    perform quote_emit(q, case when q.kind = 'perubahan' then 'ChangeRejected' else 'QuoteRejected' end, 'Ditolak klien' || coalesce(' · ' || v_note, ''));
    return jsonb_build_object('ok', true, 'project_id', q.project_id);
  end if;

  if q.kind = 'awal' then
    if q.project_id is null then
      v_proj := gen_random_uuid();
      insert into prj_projects(id, kos_id, number, name, kind, status, contact_id, manager_user, start_date, end_date, value, revision_limit, quote_id)
      values (v_proj, q.kos_id, prj_next_number(q.kos_id, 'PRJ', 'prj_projects'), q.title, q.project_kind, 'berjalan', q.contact_id, auth.uid(),
              q.start_date, q.end_date, q.total, q.revision_limit, q.id);
      update prj_quotes set project_id = v_proj where id = q.id;
      q.project_id := v_proj;
    else
      select * into pr from prj_projects where id = q.project_id for update;
      if pr.quote_id is not null then raise exception 'Proyek ini sudah punya penawaran yang disetujui'; end if;
      if pr.status not in ('penawaran', 'berjalan', 'ditunda') then raise exception 'Proyek sudah %', pr.status; end if;
      update prj_projects set value = q.total, revision_limit = q.revision_limit, quote_id = q.id,
        status = case when pr.status = 'penawaran' then 'berjalan' else pr.status end,
        status_note = case when pr.status = 'penawaran' then 'Penawaran ' || q.number || ' disetujui klien' else pr.status_note end,
        contact_id = coalesce(pr.contact_id, q.contact_id), start_date = coalesce(pr.start_date, q.start_date), end_date = coalesce(pr.end_date, q.end_date),
        updated_at = now()
      where id = pr.id;
    end if;
  else
    select * into pr from prj_projects where id = q.project_id for update;
    if pr.id is null or pr.status = 'batal' then raise exception 'Proyek tidak ditemukan atau sudah batal'; end if;
    update prj_projects set value = coalesce(value, 0) + q.total,
      revision_limit = case when q.revision_limit is null then revision_limit else coalesce(revision_limit, 0) + q.revision_limit end,
      end_date = coalesce(q.end_date, end_date), updated_at = now()
    where id = pr.id;
  end if;
  -- milestone dari termin
  for t in select * from jsonb_array_elements(q.terms) loop
    i := i + 1;
    insert into prj_milestones(kos_id, project_id, name, amount, note, sort)
    values (q.kos_id, q.project_id, left(case when q.kind = 'perubahan' then 'Perubahan ' || q.number || ' · ' else '' end || (t->>'name'), 120), (t->>'amount')::numeric,
            'Termin dari penawaran ' || q.number, coalesce((select max(sort) from prj_milestones where project_id = q.project_id), 0) + 1);
  end loop;
  update prj_quotes set status = 'disetujui', decided_at = now(), decided_by = auth.uid(), decision_note = v_note,
    client_approver = nullif(left(trim(coalesce(p->>'client_approver', '')), 80), ''), client_approved_on = v_on, updated_at = now()
  where id = q.id;
  perform quote_emit(q, case when q.kind = 'perubahan' then 'ChangeApproved' else 'QuoteApproved' end,
    'Disetujui klien' || coalesce(' (' || nullif(trim(p->>'client_approver'), '') || ')', '') || ' · ' || dom_rp(q.total));
  return jsonb_build_object('ok', true, 'project_id', q.project_id, 'expired', v_expired, 'milestones', i);
end $$;

create or replace function public.prj_quote_cancel(p_id uuid, p_reason text)
returns void language plpgsql security definer set search_path = public as $$
declare q prj_quotes;
begin
  select * into q from prj_quotes where id = p_id;
  if q.id is null then raise exception 'Penawaran tidak ditemukan'; end if;
  perform quote_guard(q.kos_id, false);
  if q.status not in ('draf', 'terkirim') then raise exception 'Penawaran sudah %', q.status; end if;
  if coalesce(length(trim(p_reason)), 0) < 3 then raise exception 'Tuliskan alasan membatalkan (min. 3 huruf)'; end if;
  update prj_quotes set status = 'batal', decided_at = now(), decided_by = auth.uid(), decision_note = left(trim(p_reason), 300), updated_at = now() where id = q.id;
  perform quote_emit(q, 'QuoteCancelled', 'Penawaran dibatalkan · ' || trim(p_reason));
end $$;

-- ---------- Baca ----------
create or replace function public.prj_quote_row(q prj_quotes)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object('id', q.id, 'number', q.number, 'kind', q.kind, 'title', q.title, 'status', q.status, 'project_id', q.project_id,
    'project', (select number || ' · ' || name from prj_projects where id = q.project_id), 'contact_id', q.contact_id,
    'client', (select name from contacts where id = q.contact_id), 'quote_date', q.quote_date, 'valid_until', q.valid_until, 'total', q.total,
    'revision', q.revision, 'sent_at', q.sent_at, 'decided_at', q.decided_at,
    'expired', q.status in ('draf', 'terkirim') and q.valid_until is not null and q.valid_until < (now() at time zone 'Asia/Jakarta')::date);
$$;

create or replace function public.prj_quote_list(p_kos uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  perform quote_guard(p_kos, false);
  return jsonb_build_object('can_decide', member_in('settings', p_kos), 'allowed', plan_has(p_kos, 'proyek'),
    'quotes', (select coalesce(jsonb_agg(prj_quote_row(q) order by case q.status when 'terkirim' then 0 when 'draf' then 1 else 2 end, q.created_at desc), '[]')
               from prj_quotes q where q.kos_id = p_kos));
end $$;

create or replace function public.prj_quote_get(p_id uuid)
returns jsonb language plpgsql stable security definer set search_path = public, auth as $$
declare q prj_quotes; k kos;
begin
  select * into q from prj_quotes where id = p_id;
  if q.id is null then raise exception 'Penawaran tidak ditemukan'; end if;
  perform quote_guard(q.kos_id, false);
  select * into k from kos where id = q.kos_id;
  return prj_quote_row(q) || jsonb_build_object(
    'project_kind', q.project_kind, 'start_date', q.start_date, 'end_date', q.end_date, 'subtotal', q.subtotal, 'discount', q.discount,
    'scope_in', q.scope_in, 'scope_out', q.scope_out, 'client_duties', q.client_duties, 'revision_limit', q.revision_limit, 'extra_revision', q.extra_revision,
    'terms', q.terms, 'note', q.note, 'decision_note', q.decision_note, 'client_approver', q.client_approver, 'client_approved_on', q.client_approved_on,
    'history', q.history, 'can_decide', member_in('settings', q.kos_id), 'allowed', plan_has(q.kos_id, 'proyek'),
    'lines', (select coalesce(jsonb_agg(jsonb_build_object('id', l.id, 'description', l.description, 'qty', l.qty, 'unit', l.unit, 'price', l.price, 'amount', l.amount) order by l.sort), '[]')
              from prj_quote_lines l where l.quote_id = q.id),
    'business', jsonb_build_object('name', k.name, 'address', k.address, 'phone', k.contact_phone, 'logo', k.profile->>'logo_path', 'footer', k.receipt_footer),
    'customer', (select jsonb_build_object('name', c.name, 'phone', c.phone, 'address', c.address) from contacts c where c.id = q.contact_id));
end $$;

-- Detail proyek: daftar penawaran & perubahan (hanya untuk yang boleh melihat penawaran) + batas revisi
create or replace function public._prasara_patch(p_sig text, p_old text, p_new text)
returns void language plpgsql as $$
declare d text;
begin
  d := pg_get_functiondef(p_sig::regprocedure);
  if position(p_old in d) = 0 then raise exception 'patch %: potongan tidak ditemukan: %', p_sig, left(p_old, 80); end if;
  execute replace(d, p_old, p_new);
end $$;
select public._prasara_patch('public.prj_get(uuid)',
  '    ''access'', v_acc, ''fin'', v_fin,',
  '    ''access'', v_acc, ''fin'', v_fin, ''revision_limit'', p.revision_limit, ''quote_id'', p.quote_id,
    ''can_quote'', member_in(''settings,finance'', p.kos_id),
    ''quotes'', case when member_in(''settings,finance'', p.kos_id) then (select coalesce(jsonb_agg(prj_quote_row(q) order by q.created_at), ''[]'')
                  from prj_quotes q where q.project_id = p.id) end,');
select public._prasara_patch('public.prj_list(uuid)',
  '    ''fin'', v_fin,',
  '    ''fin'', v_fin, ''can_quote'', member_in(''settings,finance'', p_kos),
    ''quotes_open'', case when member_in(''settings,finance'', p_kos) then (select count(*) from prj_quotes where kos_id = p_kos and status in (''draf'', ''terkirim'')) end,');
select public._prasara_patch('public.event_label(text)',
  'else p_type end;',
  'when ''QuoteCreated'' then ''Penawaran dibuat'' when ''QuoteSent'' then ''Penawaran dikirim'' when ''QuoteRevised'' then ''Penawaran direvisi''
    when ''QuoteApproved'' then ''Penawaran disetujui'' when ''QuoteRejected'' then ''Penawaran ditolak'' when ''QuoteCancelled'' then ''Penawaran batal''
    when ''ChangeRequested'' then ''Perubahan scope diajukan'' when ''ChangeApproved'' then ''Perubahan scope disetujui'' when ''ChangeRejected'' then ''Perubahan scope ditolak''
    else p_type end;');
drop function public._prasara_patch(text, text, text);

-- prj_get: riwayat proyek memakai domain_events area 'ops'; peristiwa penawaran ber-area finance (berisi nilai) hanya untuk finance/settings
-- (prj_get membaca langsung domain_events tanpa filter area, jadi disaring di sini)
create or replace function public.prj_history(p_project uuid, p_kos uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object('label', event_label(e.event_type), 'summary', e.summary, 'at', e.occurred_at,
           'actor', coalesce(prj_user_label(e.actor_id), 'sistem')) order by e.id desc), '[]')
  from (select * from domain_events where kos_id = p_kos and aggregate_type = 'project' and aggregate_id = p_project
          and (area = 'ops' or member_in(area, p_kos)) order by id desc limit 100) e;
$$;
create or replace function public._prasara_patch(p_sig text, p_old text, p_new text)
returns void language plpgsql as $$
declare d text;
begin
  d := pg_get_functiondef(p_sig::regprocedure);
  if position(p_old in d) = 0 then raise exception 'patch %: potongan tidak ditemukan: %', p_sig, left(p_old, 80); end if;
  execute replace(d, p_old, p_new);
end $$;
select public._prasara_patch('public.prj_get(uuid)',
  '''history'', (select coalesce(jsonb_agg(jsonb_build_object(''label'', event_label(e.event_type), ''summary'', e.summary, ''at'', e.occurred_at,
                  ''actor'', coalesce(prj_user_label(e.actor_id), ''sistem'')) order by e.id desc), ''[]'')
                from (select * from domain_events where kos_id = p.kos_id and aggregate_type = ''project'' and aggregate_id = p.id order by id desc limit 100) e),',
  '''history'', prj_history(p.id, p.kos_id),');
drop function public._prasara_patch(text, text, text);

-- ---------- Hak eksekusi ----------
revoke execute on function public.prj_next_number(uuid, text, text), public.quote_guard(uuid, boolean), public.quote_emit(public.prj_quotes, text, text),
  public.prj_quote_row(public.prj_quotes), public.prj_history(uuid, uuid) from public, anon, authenticated;
revoke execute on function public.prj_quote_save(uuid, uuid, jsonb), public.prj_quote_send(uuid), public.prj_quote_decide(uuid, text, jsonb),
  public.prj_quote_cancel(uuid, text), public.prj_quote_list(uuid), public.prj_quote_get(uuid) from public, anon;
grant execute on function public.prj_quote_save(uuid, uuid, jsonb), public.prj_quote_send(uuid), public.prj_quote_decide(uuid, text, jsonb),
  public.prj_quote_cancel(uuid, text), public.prj_quote_list(uuid), public.prj_quote_get(uuid) to authenticated;
