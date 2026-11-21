-- Anggaran, biaya & laba proyek — Tahap 1C blueprint Event, Media & Creative (§5.6 Event budgeting, §12.2–12.3 Project costing, §12.6).
-- Prinsip (satu fondasi uang, aturan implementasi #5 & #6):
--   * TIDAK ada jalur uang baru. Biaya nyata proyek = pengeluaran (expenses) atau belanja (purchases) yang SUDAH ada di mesin lama
--     (sudah dijurnal), lalu DITANDAI untuk proyek lewat `prj_cost_links` (alokasi; satu pengeluaran boleh dibagi ke beberapa proyek,
--     jumlah alokasi ≤ nilai sumbernya). Menandai tidak mengubah jurnal, kas, atau laporan lama.
--   * "Catat biaya proyek" dari halaman proyek = membuat pengeluaran biasa (sama seperti menu Kas) + menandainya.
--   * Komitmen (committed cost) = belanja bertanda proyek yang masih 'dipesan' + kesepakatan vendor yang belum dibayar (`prj_commitments`).
--   * Anggaran per kategori (`prj_budget_lines`); "Setujui anggaran" menyimpan salinan (anggaran disetujui) di prj_projects.budget_approved.
--   * Rumus per kategori: sisa = anggaran − realisasi − komitmen; perkiraan akhir = max(anggaran, realisasi + komitmen);
--     selisih = anggaran disetujui − perkiraan akhir. Laba: nilai kontrak − realisasi (sementara) dan nilai kontrak − perkiraan akhir.
--   * Nilai kontrak masih rencana sampai Tahap 1D (penagihan termin). Biaya tenaga kerja dari gaji karyawan BELUM dialokasikan otomatis.
--   * Semua angka uang = area finance. Mengubah anggaran/biaya = finance; menyetujui anggaran = settings.

alter table public.prj_projects add column if not exists budget_approved jsonb;   -- {at, by, total, lines:[{category, amount}]}

create table if not exists public.prj_budget_lines (
  id uuid primary key default gen_random_uuid(),
  kos_id uuid not null references public.kos(id) on delete cascade,
  project_id uuid not null references public.prj_projects(id) on delete cascade,
  category text not null check (length(trim(category)) between 1 and 60),
  description text check (description is null or length(description) <= 200),
  amount numeric(14,2) not null check (amount >= 0 and amount <= 999999999999),
  sort int not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists prj_budget_lines_p on public.prj_budget_lines(project_id, sort);

create table if not exists public.prj_cost_links (
  id uuid primary key default gen_random_uuid(),
  kos_id uuid not null references public.kos(id) on delete cascade,
  project_id uuid not null references public.prj_projects(id) on delete cascade,
  source_type text not null check (source_type in ('expense', 'purchase')),
  expense_id uuid references public.expenses(id) on delete cascade,
  purchase_id uuid references public.purchases(id) on delete cascade,
  category text not null check (length(trim(category)) between 1 and 60),
  amount numeric(14,2) not null check (amount > 0),
  note text check (note is null or length(note) <= 200),
  created_by uuid default auth.uid(), created_at timestamptz not null default now(),
  check ((source_type = 'expense' and expense_id is not null and purchase_id is null) or (source_type = 'purchase' and purchase_id is not null and expense_id is null))
);
create index if not exists prj_cost_links_p on public.prj_cost_links(project_id);
create index if not exists prj_cost_links_e on public.prj_cost_links(expense_id) where expense_id is not null;
create index if not exists prj_cost_links_pu on public.prj_cost_links(purchase_id) where purchase_id is not null;

create table if not exists public.prj_commitments (
  id uuid primary key default gen_random_uuid(),
  kos_id uuid not null references public.kos(id) on delete cascade,
  project_id uuid not null references public.prj_projects(id) on delete cascade,
  contact_id uuid references public.contacts(id) on delete set null,      -- vendor (supplier)
  category text not null check (length(trim(category)) between 1 and 60),
  description text not null check (length(trim(description)) between 2 and 200),
  amount numeric(14,2) not null check (amount > 0 and amount <= 999999999999),
  status text not null default 'terbuka' check (status in ('terbuka', 'selesai', 'batal')),
  due_date date,
  note text check (note is null or length(note) <= 300),
  closed_at timestamptz,
  created_by uuid default auth.uid(), created_at timestamptz not null default now()
);
create index if not exists prj_commitments_p on public.prj_commitments(project_id, status);

do $$ declare t text; begin
  foreach t in array array['prj_budget_lines', 'prj_cost_links', 'prj_commitments'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
    execute format('drop trigger if exists zz_kos_open_guard on public.%I', t);
    execute format('create trigger zz_kos_open_guard before insert or update or delete on public.%I for each row execute function public.kos_open_guard()', t);
  end loop;
end $$;

-- Nilai sumber biaya (pengeluaran = amount; belanja dipesan = nilai pesanan; selain itu total; batal = 0)
create or replace function public.prj_source_value(p_type text, p_id uuid)
returns numeric language sql stable security definer set search_path = public as $$
  select case p_type
    when 'expense' then (select amount from expenses where id = p_id)
    when 'purchase' then (select case when status = 'batal' then 0 when status = 'dipesan' then coalesce(order_total, total) else total end from purchases where id = p_id)
  end;
$$;

-- Penjaga alokasi: satu bisnis, jumlah semua alokasi atas satu sumber ≤ nilai sumbernya
create or replace function public.prj_cost_links_check() returns trigger language plpgsql security definer set search_path = public as $$
declare v_src numeric; v_used numeric; v_kos uuid;
begin
  if new.source_type = 'expense' then select kos_id into v_kos from expenses where id = new.expense_id;
  else select kos_id into v_kos from purchases where id = new.purchase_id; end if;
  if v_kos is distinct from new.kos_id or (select kos_id from prj_projects where id = new.project_id) is distinct from new.kos_id then
    raise exception 'Biaya & proyek harus dari bisnis yang sama';
  end if;
  v_src := prj_source_value(new.source_type, coalesce(new.expense_id, new.purchase_id));
  select coalesce(sum(amount), 0) into v_used from prj_cost_links
  where id <> new.id and coalesce(expense_id, purchase_id) = coalesce(new.expense_id, new.purchase_id);
  if v_used + new.amount > coalesce(v_src, 0) then
    raise exception 'Jumlah yang ditandai (%) melebihi sisa nilai biaya ini (%)', dom_rp(new.amount), dom_rp(greatest(coalesce(v_src, 0) - v_used, 0));
  end if;
  return new;
end $$;
drop trigger if exists prj_cost_links_check on public.prj_cost_links;
create trigger prj_cost_links_check before insert or update on public.prj_cost_links for each row execute function public.prj_cost_links_check();

create or replace function public.prj_cost_guard(p_project uuid, p_write boolean)
returns prj_projects language plpgsql stable security definer set search_path = public as $$
declare p prj_projects;
begin
  select * into p from prj_projects where id = p_project;
  if p.id is null or prj_access(p.id) is null then raise exception 'Proyek tidak ditemukan'; end if;
  perform prj_guard(p.kos_id, p_write);
  if not member_in('finance', p.kos_id) then raise exception 'Anggaran & biaya proyek hanya untuk pemilik atau bagian keuangan'; end if;
  return p;
end $$;

-- ---------- Ringkasan biaya per proyek (dipakai detail & laporan laba) ----------
create or replace function public.prj_cost_summary(p_project uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  with p as (select * from prj_projects where id = p_project),
  bud as (select trim(category) cat, sum(amount) amt from prj_budget_lines where project_id = p_project group by 1),
  lk as (select l.*, (case when l.source_type = 'purchase' then (select status from purchases where id = l.purchase_id) end) pst,
                prj_source_value(l.source_type, coalesce(l.expense_id, l.purchase_id)) src
         from prj_cost_links l where l.project_id = p_project),
  act as (select trim(category) cat, sum(amount) amt from lk where coalesce(pst, 'selesai') not in ('dipesan', 'batal') group by 1),
  com as (select cat, sum(amt) amt from (
            select trim(category) cat, amount amt from lk where pst = 'dipesan'
            union all select trim(category), amount from prj_commitments where project_id = p_project and status = 'terbuka') z group by 1),
  appr as (select trim(x->>'category') cat, sum((x->>'amount')::numeric) amt from p, jsonb_array_elements(coalesce(p.budget_approved->'lines', '[]')) x group by 1),
  cats as (select cat from bud union select cat from act union select cat from com union select cat from appr),
  rows as (select c.cat, coalesce(b.amt, 0) budget, a2.amt approved, coalesce(a.amt, 0) actual, coalesce(m.amt, 0) committed
           from cats c left join bud b using (cat) left join act a using (cat) left join com m using (cat) left join appr a2 using (cat)),
  calc as (select *, budget - actual - committed remaining, greatest(budget, actual + committed) forecast from rows)
  select jsonb_build_object(
    'categories', coalesce((select jsonb_agg(jsonb_build_object('category', cat, 'budget', budget, 'approved', approved, 'actual', actual, 'committed', committed,
                    'remaining', remaining, 'forecast', forecast, 'variance', coalesce(approved, budget) - forecast, 'over', actual + committed > budget)
                  order by budget desc, cat) from calc), '[]'),
    'budget', (select coalesce(sum(budget), 0) from calc),
    'approved', (select (budget_approved->>'total')::numeric from p),
    'approved_at', (select budget_approved->>'at' from p),
    'actual', (select coalesce(sum(actual), 0) from calc),
    'committed', (select coalesce(sum(committed), 0) from calc),
    'forecast', (select coalesce(sum(forecast), 0) from calc),
    'value', (select value from p),
    'profit_now', (select value from p) - (select coalesce(sum(actual), 0) from calc),
    'profit_forecast', (select value from p) - (select coalesce(sum(forecast), 0) from calc),
    'margin_forecast', case when coalesce((select value from p), 0) > 0
      then round(100 * ((select value from p) - (select coalesce(sum(forecast), 0) from calc)) / (select value from p), 1) end,
    -- peringatan: alokasi melebihi nilai sumber (sumber diubah/dibatalkan setelah ditandai)
    'mismatch', (select count(*) from (select coalesce(expense_id, purchase_id) s, sum(amount) a, max(src) src from lk group by 1) z where z.a > coalesce(z.src, 0)));
$$;

-- ---------- Detail anggaran & biaya satu proyek ----------
create or replace function public.prj_costs(p_project uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare p prj_projects;
begin
  p := prj_cost_guard(p_project, false);
  return prj_cost_summary(p.id) || jsonb_build_object(
    'allowed', plan_has(p.kos_id, 'proyek'), 'can_approve', member_in('settings', p.kos_id), 'kind', p.kind,
    'budget_lines', (select coalesce(jsonb_agg(jsonb_build_object('id', b.id, 'category', b.category, 'description', b.description, 'amount', b.amount) order by b.sort, b.created_at), '[]')
                     from prj_budget_lines b where b.project_id = p.id),
    'links', (select coalesce(jsonb_agg(jsonb_build_object('id', l.id, 'source_type', l.source_type, 'source_id', coalesce(l.expense_id, l.purchase_id), 'category', l.category,
                'amount', l.amount, 'note', l.note,
                'date', coalesce(e.date, pu.purchase_date), 'label', coalesce(e.description, (select name from expense_categories where id = e.category_id), pu.number || coalesce(' · ' || (select name from contacts where id = pu.contact_id), '')),
                'source_value', prj_source_value(l.source_type, coalesce(l.expense_id, l.purchase_id)), 'purchase_status', pu.status)
              order by coalesce(e.date, pu.purchase_date) desc, l.created_at desc), '[]')
              from prj_cost_links l left join expenses e on e.id = l.expense_id left join purchases pu on pu.id = l.purchase_id where l.project_id = p.id),
    'commitments', (select coalesce(jsonb_agg(jsonb_build_object('id', c.id, 'vendor', (select name from contacts where id = c.contact_id), 'contact_id', c.contact_id,
                     'category', c.category, 'description', c.description, 'amount', c.amount, 'status', c.status, 'due_date', c.due_date, 'note', c.note)
                   order by c.status = 'terbuka' desc, c.due_date nulls last, c.created_at), '[]') from prj_commitments c where c.project_id = p.id),
    -- pilihan formulir
    'expense_categories', (select coalesce(jsonb_agg(jsonb_build_object('id', id, 'name', name, 'kind', kind) order by name), '[]') from expense_categories where kos_id = p.kos_id),
    'vendors', (select coalesce(jsonb_agg(jsonb_build_object('id', id, 'name', name) order by name), '[]') from contacts where kos_id = p.kos_id and kind = 'supplier' and archived_at is null),
    -- pengeluaran & belanja 120 hari terakhir yang masih punya sisa untuk ditandai
    'candidates', (select coalesce(jsonb_agg(x order by x->>'date' desc), '[]') from (
        select jsonb_build_object('source_type', 'expense', 'id', e.id, 'date', e.date, 'label', coalesce(e.description, (select name from expense_categories where id = e.category_id), 'Pengeluaran'),
                 'value', e.amount, 'free', e.amount - coalesce((select sum(amount) from prj_cost_links where expense_id = e.id), 0)) x
        from expenses e where e.kos_id = p.kos_id and e.date >= (now() at time zone 'Asia/Jakarta')::date - 120 and e.kind <> 'modal'
          and e.amount > coalesce((select sum(amount) from prj_cost_links where expense_id = e.id), 0)
        union all
        select jsonb_build_object('source_type', 'purchase', 'id', pu.id, 'date', pu.purchase_date, 'label', pu.number || coalesce(' · ' || (select name from contacts where id = pu.contact_id), '') || case when pu.status = 'dipesan' then ' (dipesan)' else '' end,
                 'value', prj_source_value('purchase', pu.id), 'free', prj_source_value('purchase', pu.id) - coalesce((select sum(amount) from prj_cost_links where purchase_id = pu.id), 0))
        from purchases pu where pu.kos_id = p.kos_id and pu.status <> 'batal' and pu.purchase_date >= (now() at time zone 'Asia/Jakarta')::date - 120
          and prj_source_value('purchase', pu.id) > coalesce((select sum(amount) from prj_cost_links where purchase_id = pu.id), 0)
        limit 200) z));
end $$;

-- ---------- Anggaran ----------
-- Ganti seluruh daftar anggaran proyek. p_lines: [{category, description, amount}]
create or replace function public.prj_budget_save(p_project uuid, p_lines jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare p prj_projects; l jsonb; i int := 0; v_total numeric := 0;
begin
  p := prj_cost_guard(p_project, true);
  if p.status in ('selesai', 'batal') then raise exception 'Proyek sudah %', p.status; end if;
  if jsonb_typeof(coalesce(p_lines, '[]')) <> 'array' then raise exception 'Daftar anggaran tidak valid'; end if;
  if jsonb_array_length(coalesce(p_lines, '[]')) > 60 then raise exception 'Maksimal 60 baris anggaran'; end if;
  delete from prj_budget_lines where project_id = p.id;
  for l in select * from jsonb_array_elements(coalesce(p_lines, '[]')) loop
    i := i + 1;
    if length(trim(coalesce(l->>'category', ''))) < 1 or length(trim(l->>'category')) > 60 then raise exception 'Kategori anggaran wajib (maks. 60 huruf)'; end if;
    if coalesce(nullif(l->>'amount', '')::numeric, -1) < 0 then raise exception 'Nominal anggaran tidak valid (%)', l->>'category'; end if;
    insert into prj_budget_lines(kos_id, project_id, category, description, amount, sort)
    values (p.kos_id, p.id, trim(l->>'category'), nullif(left(trim(coalesce(l->>'description', '')), 200), ''), (l->>'amount')::numeric, i);
    v_total := v_total + (l->>'amount')::numeric;
  end loop;
  perform dom_emit(p.kos_id, 'BudgetChanged', 'project', p.id, p.id::text || ':anggaran:' || extract(epoch from clock_timestamp())::text, 'finance',
    p.number || ' · Anggaran disimpan · ' || dom_rp(v_total) || case when p.budget_approved is not null and (p.budget_approved->>'total')::numeric <> v_total
      then ' (disetujui ' || dom_rp((p.budget_approved->>'total')::numeric) || ')' else '' end, v_total, '{}'::jsonb);
  return prj_cost_summary(p.id);
end $$;

-- Setujui anggaran (pemilik/pengelola): simpan salinan sebagai "anggaran disetujui" (pembanding selisih)
create or replace function public.prj_budget_approve(p_project uuid)
returns void language plpgsql security definer set search_path = public as $$
declare p prj_projects; v jsonb;
begin
  p := prj_cost_guard(p_project, true);
  if not member_in('settings', p.kos_id) then raise exception 'Anggaran disetujui oleh pemilik atau pengelola'; end if;
  if not exists (select 1 from prj_budget_lines where project_id = p.id) then raise exception 'Isi anggaran dulu'; end if;
  select jsonb_build_object('at', now(), 'by', actor_email(), 'total', sum(amount),
           'lines', jsonb_agg(jsonb_build_object('category', category, 'amount', amount) order by sort)) into v
  from prj_budget_lines where project_id = p.id;
  update prj_projects set budget_approved = v, updated_at = now() where id = p.id;
  perform dom_emit(p.kos_id, 'BudgetApproved', 'project', p.id, p.id::text || ':setuju:' || extract(epoch from clock_timestamp())::text, 'finance',
    p.number || ' · Anggaran disetujui · ' || dom_rp((v->>'total')::numeric), (v->>'total')::numeric, '{}'::jsonb);
end $$;

-- ---------- Biaya nyata ----------
-- Catat pengeluaran baru (sama dengan menu Kas) dan langsung tandai untuk proyek. p: {date, amount, category_id, account, description, category}
create or replace function public.prj_cost_add(p_project uuid, p jsonb)
returns uuid language plpgsql security definer set search_path = public as $$
declare pr prj_projects; v_exp uuid; v_amt numeric := nullif(p->>'amount', '')::numeric; v_cat uuid; v_kind text := 'operasional';
        v_date date := coalesce(nullif(p->>'date', '')::date, (now() at time zone 'Asia/Jakarta')::date); v_bcat text := trim(coalesce(p->>'category', ''));
begin
  pr := prj_cost_guard(p_project, true);
  if pr.status = 'batal' then raise exception 'Proyek sudah batal'; end if;
  if v_amt is null or v_amt <= 0 or v_amt > 999999999999 then raise exception 'Isi nominal biaya'; end if;
  if length(v_bcat) < 1 or length(v_bcat) > 60 then raise exception 'Pilih kategori anggaran proyek'; end if;
  if v_date > (now() at time zone 'Asia/Jakarta')::date then raise exception 'Tanggal biaya tidak boleh di masa depan'; end if;
  if coalesce(p->>'account', 'kas') not in ('kas', 'bank') then raise exception 'Akun tidak dikenal'; end if;
  if nullif(p->>'category_id', '') is not null then
    select id, kind into v_cat, v_kind from expense_categories where id = (p->>'category_id')::uuid and kos_id = pr.kos_id;
    if v_cat is null then raise exception 'Kategori pengeluaran tidak ditemukan'; end if;
  end if;
  insert into expenses(kos_id, date, category_id, kind, amount, description, account)
  values (pr.kos_id, v_date, v_cat, coalesce(v_kind, 'operasional'), v_amt,
          left(coalesce(nullif(trim(p->>'description'), ''), v_bcat) || ' · ' || pr.number, 300), coalesce(p->>'account', 'kas'))
  returning id into v_exp;
  insert into prj_cost_links(kos_id, project_id, source_type, expense_id, category, amount)
  values (pr.kos_id, pr.id, 'expense', v_exp, v_bcat, v_amt);
  return v_exp;
end $$;

-- Tandai pengeluaran/belanja yang sudah ada (boleh sebagian nilainya)
create or replace function public.prj_cost_link(p_project uuid, p_type text, p_source uuid, p_amount numeric, p_category text, p_note text)
returns uuid language plpgsql security definer set search_path = public as $$
declare pr prj_projects; v_id uuid; v_amt numeric;
begin
  pr := prj_cost_guard(p_project, true);
  if pr.status = 'batal' then raise exception 'Proyek sudah batal'; end if;
  if p_type not in ('expense', 'purchase') then raise exception 'Sumber biaya tidak dikenal'; end if;
  if length(trim(coalesce(p_category, ''))) < 1 or length(trim(p_category)) > 60 then raise exception 'Pilih kategori anggaran proyek'; end if;
  v_amt := coalesce(p_amount, prj_source_value(p_type, p_source) - coalesce((select sum(amount) from prj_cost_links where coalesce(expense_id, purchase_id) = p_source), 0));
  if v_amt is null or v_amt <= 0 then raise exception 'Tidak ada sisa nilai untuk ditandai'; end if;
  insert into prj_cost_links(kos_id, project_id, source_type, expense_id, purchase_id, category, amount, note)
  values (pr.kos_id, pr.id, p_type, case when p_type = 'expense' then p_source end, case when p_type = 'purchase' then p_source end,
          trim(p_category), v_amt, nullif(left(trim(coalesce(p_note, '')), 200), ''))
  returning id into v_id;
  return v_id;
end $$;

-- Lepas tanda (pengeluaran/belanjanya TIDAK dihapus — tetap di Kas/Pembukuan)
create or replace function public.prj_cost_unlink(p_link uuid)
returns void language plpgsql security definer set search_path = public as $$
declare l prj_cost_links;
begin
  select * into l from prj_cost_links where id = p_link;
  if l.id is null then raise exception 'Biaya tidak ditemukan'; end if;
  perform prj_cost_guard(l.project_id, false);
  delete from prj_cost_links where id = l.id;
end $$;

-- ---------- Komitmen vendor ----------
create or replace function public.prj_commit_save(p_project uuid, p_id uuid, p jsonb)
returns uuid language plpgsql security definer set search_path = public as $$
declare pr prj_projects; c prj_commitments; v_id uuid := coalesce(p_id, gen_random_uuid()); v_vendor uuid; v_amt numeric := nullif(p->>'amount', '')::numeric;
begin
  pr := prj_cost_guard(p_project, true);
  if pr.status in ('selesai', 'batal') then raise exception 'Proyek sudah %', pr.status; end if;
  if p_id is not null then
    select * into c from prj_commitments where id = p_id and project_id = pr.id;
    if c.id is null then raise exception 'Komitmen tidak ditemukan'; end if;
    if c.status <> 'terbuka' then raise exception 'Komitmen sudah %', c.status; end if;
  elsif (select count(*) from prj_commitments where project_id = pr.id) >= 200 then raise exception 'Maksimal 200 komitmen per proyek';
  end if;
  if v_amt is null or v_amt <= 0 then raise exception 'Isi nilai kesepakatan'; end if;
  if length(trim(coalesce(p->>'description', ''))) < 2 then raise exception 'Isi uraian (mis. Sewa sound system 2 hari)'; end if;
  if length(trim(coalesce(p->>'category', ''))) < 1 then raise exception 'Pilih kategori anggaran proyek'; end if;
  if nullif(p->>'contact_id', '') is not null then
    select id into v_vendor from contacts where id = (p->>'contact_id')::uuid and kos_id = pr.kos_id and kind = 'supplier';
    if v_vendor is null then raise exception 'Vendor tidak ditemukan'; end if;
  elsif length(trim(coalesce(p->>'vendor_name', ''))) >= 1 then
    insert into contacts(kos_id, kind, name, phone) values (pr.kos_id, 'supplier', left(trim(p->>'vendor_name'), 80), nullif(trim(coalesce(p->>'vendor_phone', '')), '')) returning id into v_vendor;
  end if;
  insert into prj_commitments(id, kos_id, project_id, contact_id, category, description, amount, due_date, note)
  values (v_id, pr.kos_id, pr.id, v_vendor, left(trim(p->>'category'), 60), left(trim(p->>'description'), 200), v_amt, nullif(p->>'due_date', '')::date, nullif(left(trim(coalesce(p->>'note', '')), 300), ''))
  on conflict (id) do update set contact_id = excluded.contact_id, category = excluded.category, description = excluded.description, amount = excluded.amount,
    due_date = excluded.due_date, note = excluded.note;
  return v_id;
end $$;

-- Tutup komitmen: 'selesai' (sudah dibayar — catat/tandai pengeluarannya agar menjadi realisasi) atau 'batal'
create or replace function public.prj_commit_close(p_id uuid, p_status text)
returns void language plpgsql security definer set search_path = public as $$
declare c prj_commitments;
begin
  select * into c from prj_commitments where id = p_id;
  if c.id is null then raise exception 'Komitmen tidak ditemukan'; end if;
  perform prj_cost_guard(c.project_id, false);
  if p_status not in ('selesai', 'batal', 'terbuka') then raise exception 'Status tidak dikenal'; end if;
  update prj_commitments set status = p_status, closed_at = case when p_status = 'terbuka' then null else now() end where id = c.id;
end $$;

-- ---------- Laporan laba proyek (semua proyek) ----------
create or replace function public.prj_profit_report(p_kos uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  perform prj_guard(p_kos, false);
  if not member_in('finance', p_kos) then raise exception 'Laba proyek hanya untuk pemilik atau bagian keuangan'; end if;
  return jsonb_build_object('rows', (select coalesce(jsonb_agg(jsonb_build_object('id', p.id, 'number', p.number, 'name', p.name, 'kind', p.kind, 'status', p.status,
             'client', (select name from contacts where id = p.contact_id), 'end_date', p.end_date) || s.x
           order by case p.status when 'berjalan' then 0 when 'ditunda' then 1 when 'selesai' then 2 else 3 end, p.end_date desc nulls last), '[]')
         from prj_projects p cross join lateral (select prj_cost_summary(p.id) x) s
         where p.kos_id = p_kos and p.status <> 'penawaran'));
end $$;

-- Ringkasan biaya di detail proyek (finance) + label peristiwa
create or replace function public._prasara_patch(p_sig text, p_old text, p_new text)
returns void language plpgsql as $$
declare d text;
begin
  d := pg_get_functiondef(p_sig::regprocedure);
  if position(p_old in d) = 0 then raise exception 'patch %: potongan tidak ditemukan: %', p_sig, left(p_old, 80); end if;
  execute replace(d, p_old, p_new);
end $$;
select public._prasara_patch('public.prj_get(uuid)',
  '''revision_limit'', p.revision_limit,',
  '''revision_limit'', p.revision_limit, ''cost'', case when v_fin then prj_cost_summary(p.id) - ''categories'' end,');
select public._prasara_patch('public.event_label(text)',
  'else p_type end;',
  'when ''BudgetChanged'' then ''Anggaran proyek'' when ''BudgetApproved'' then ''Anggaran disetujui'' else p_type end;');
drop function public._prasara_patch(text, text, text);

revoke execute on function public.prj_source_value(text, uuid), public.prj_cost_links_check(), public.prj_cost_guard(uuid, boolean), public.prj_cost_summary(uuid)
  from public, anon, authenticated;
revoke execute on function public.prj_costs(uuid), public.prj_budget_save(uuid, jsonb), public.prj_budget_approve(uuid), public.prj_cost_add(uuid, jsonb),
  public.prj_cost_link(uuid, text, uuid, numeric, text, text), public.prj_cost_unlink(uuid), public.prj_commit_save(uuid, uuid, jsonb), public.prj_commit_close(uuid, text),
  public.prj_profit_report(uuid) from public, anon;
grant execute on function public.prj_costs(uuid), public.prj_budget_save(uuid, jsonb), public.prj_budget_approve(uuid), public.prj_cost_add(uuid, jsonb),
  public.prj_cost_link(uuid, text, uuid, numeric, text, text), public.prj_cost_unlink(uuid), public.prj_commit_save(uuid, uuid, jsonb), public.prj_commit_close(uuid, text),
  public.prj_profit_report(uuid) to authenticated;
