-- Tagihan termin, pembayaran klien & jurnal proyek — Tahap 1D blueprint Event, Media & Creative (§12.4–12.5, keputusan K3).
-- K3 (pemilik, 21 Nov 2026): uang klien sebelum serah terima = UANG MUKA; pendapatan diakui per termin/milestone yang diserahkan.
-- Rancangan (mengikuti pola mesin Jasa — akun yang SAMA: 'uang_muka' 2-1300, 'piutang_jasa' 1-1310, 'pendapatan_jasa' 4-3000):
--   * prj_invoices = dokumen tagihan ke klien (cetak/WA) — TIDAK menjurnal (tagihan DP bukan pendapatan & bukan piutang).
--   * prj_payments = uang nyata: 'bayar' (terima), 'kembali' (uang muka dikembalikan), 'hangus' (uang muka hangus → pendapatan lain).
--   * Pengakuan pendapatan: milestone ber-nilai yang ditandai SELESAI (tanggal = done_at), dan saat proyek SELESAI sisa
--     (nilai kontrak − Σ milestone selesai) ikut diakui (bisa negatif bila milestone melebihi kontrak).
--   * prj_rev_events(kos) mengurutkan semua kejadian per proyek (tanggal, jenis, waktu catat) dan menghitung posisi bersih
--     N = Σ bayar − kembali − hangus − diakui. Posisi N > 0 = uang muka (kewajiban), N < 0 = piutang. Tiap kejadian menjurnal:
--       (akun utama, Δ) + ('uang_muka', −Δuang_muka) + ('piutang_jasa', +Δpiutang)   dengan Δ = perubahan N → selalu seimbang.
--     Akun utama: bayar/kembali = kas/bank, hangus = pendapatan_lain, pengakuan = pendapatan_jasa.
--   * Kejadian yang diubah/dibatalkan belakangan → jurnal koreksi otomatis (acct_sync), periode tertutup tetap aman.
-- Izin: semua uang = finance. Membuat tagihan butuh paket (fitur proyek); mencatat/membatalkan pembayaran tetap boleh walau
-- paket turun (uang nyata tidak boleh tertahan).

create table if not exists public.prj_invoices (
  id uuid primary key default gen_random_uuid(),
  kos_id uuid not null references public.kos(id) on delete cascade,
  project_id uuid not null references public.prj_projects(id) on delete cascade,
  milestone_id uuid references public.prj_milestones(id) on delete set null,
  number text not null,
  issue_date date not null default ((now() at time zone 'Asia/Jakarta')::date),
  due_date date,
  amount numeric(14,2) not null check (amount > 0 and amount <= 999999999999),
  description text not null check (length(trim(description)) between 2 and 200),
  note text check (note is null or length(note) <= 500),
  status text not null default 'terbit' check (status in ('terbit', 'batal')),
  void_reason text check (void_reason is null or length(void_reason) <= 300), voided_at timestamptz,
  created_by uuid default auth.uid(), created_at timestamptz not null default now(),
  check (due_date is null or due_date >= issue_date),
  unique (kos_id, number)
);
create index if not exists prj_invoices_p on public.prj_invoices(project_id, status);

create table if not exists public.prj_payments (
  id uuid primary key default gen_random_uuid(),
  kos_id uuid not null references public.kos(id) on delete cascade,
  project_id uuid not null references public.prj_projects(id) on delete cascade,
  invoice_id uuid references public.prj_invoices(id) on delete set null,
  kind text not null default 'bayar' check (kind in ('bayar', 'kembali', 'hangus')),
  pay_date date not null,
  amount numeric(14,2) not null check (amount > 0 and amount <= 999999999999),
  account text check (account is null or account in ('kas', 'bank')),
  note text check (note is null or length(note) <= 300),
  status text not null default 'selesai' check (status in ('selesai', 'batal')),
  void_reason text check (void_reason is null or length(void_reason) <= 300), voided_at timestamptz,
  created_by uuid default auth.uid(), created_at timestamptz not null default now(),
  check ((kind = 'hangus' and account is null) or (kind <> 'hangus' and account is not null)),
  check (kind = 'bayar' or invoice_id is null)
);
create index if not exists prj_payments_p on public.prj_payments(project_id, status);
create index if not exists prj_payments_i on public.prj_payments(invoice_id) where invoice_id is not null;

do $$ declare t text; begin
  foreach t in array array['prj_invoices', 'prj_payments'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
    execute format('drop trigger if exists zz_kos_open_guard on public.%I', t);
    execute format('create trigger zz_kos_open_guard before insert or update or delete on public.%I for each row execute function public.kos_open_guard()', t);
  end loop;
end $$;

-- ---------- Mesin kejadian uang proyek (satu sumber untuk jurnal & ringkasan) ----------
create or replace function public.prj_rev_events(p_kos uuid)
returns table(project_id uuid, ev_type text, ev_id uuid, ev_date date, amount numeric, main_key text, delta numeric, adv_change numeric, rec_change numeric, descr text)
language sql stable security definer set search_path = public as $$
  with ev as (
    -- uang dari / ke klien
    select y.project_id, 'prj_payment'::text ev_type, y.id ev_id, y.pay_date ev_date, y.amount,
           case y.kind when 'hangus' then 'pendapatan_lain' else y.account end main_key,
           case y.kind when 'bayar' then y.amount else -y.amount end delta,
           case y.kind when 'bayar' then 1 when 'kembali' then 2 else 3 end ord, y.created_at,
           case y.kind when 'bayar' then 'Terima pembayaran proyek ' when 'kembali' then 'Uang muka dikembalikan ' else 'Uang muka hangus ' end || p.number descr
    from prj_payments y join prj_projects p on p.id = y.project_id
    where y.kos_id = p_kos and y.status = 'selesai'
    union all
    -- pengakuan pendapatan per milestone yang diserahkan
    select m.project_id, 'prj_recog', m.id, (m.done_at at time zone 'Asia/Jakarta')::date, m.amount, 'pendapatan_jasa', -m.amount, 4, m.done_at,
           'Pendapatan proyek ' || p.number || ' · ' || m.name
    from prj_milestones m join prj_projects p on p.id = m.project_id
    where m.kos_id = p_kos and m.status = 'selesai' and m.done_at is not null and coalesce(m.amount, 0) <> 0
    union all
    -- proyek selesai: sisa nilai kontrak yang belum diakui lewat milestone
    select p.id, 'prj_recog_rest', md5(p.id::text || ':sisa')::uuid, (p.closed_at at time zone 'Asia/Jakarta')::date, s.rest, 'pendapatan_jasa', -s.rest, 5, p.closed_at,
           'Pendapatan proyek ' || p.number || ' · selesai (sisa nilai kontrak)'
    from prj_projects p
    cross join lateral (select p.value - coalesce((select sum(amount) from prj_milestones where project_id = p.id and status = 'selesai' and done_at is not null), 0) rest) s
    where p.kos_id = p_kos and p.status = 'selesai' and p.closed_at is not null and p.value is not null and s.rest <> 0
  ),
  pos as (
    select ev.*, coalesce(sum(delta) over (partition by ev.project_id order by ev_date, ord, created_at, ev_id rows between unbounded preceding and 1 preceding), 0) n0
    from ev)
  select project_id, ev_type, ev_id, ev_date, amount, main_key, delta,
         greatest(n0 + delta, 0) - greatest(n0, 0),          -- perubahan uang muka (+ = bertambah)
         greatest(-(n0 + delta), 0) - greatest(-n0, 0),      -- perubahan piutang (+ = bertambah)
         descr
  from pos;
$$;

-- Jurnal: sambungkan ke acct_desired (tiga baris per kejadian, selalu seimbang)
create or replace function public._prasara_patch(p_sig text, p_old text, p_new text)
returns void language plpgsql as $$
declare d text;
begin
  d := pg_get_functiondef(p_sig::regprocedure);
  if position(p_old in d) = 0 then raise exception 'patch %: potongan tidak ditemukan: %', p_sig, left(p_old, 80); end if;
  execute replace(d, p_old, p_new);
end $$;
select public._prasara_patch('public.acct_desired(uuid)',
  $x$    where n.kos_id = p_kos and n.forfeit_amount > 0;$x$,
  $x$    where n.kos_id = p_kos and n.forfeit_amount > 0
  union all
  -- proyek (Tahap 1D): pembayaran klien & pengakuan pendapatan per milestone (uang muka → pendapatan, kekurangan = piutang)
  select e.ev_type, e.ev_id, e.ev_date, e.descr, x.k, x.v from prj_rev_events(p_kos) e
    cross join lateral (values (e.main_key, e.delta), ('uang_muka', -e.adv_change), ('piutang_jasa', e.rec_change)) x(k, v)
    where x.v <> 0;$x$);

-- ---------- Ringkasan tagihan per proyek ----------
create or replace function public.prj_bill_summary(p_project uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  with p as (select * from prj_projects where id = p_project),
  e as (select * from prj_rev_events((select kos_id from p)) where project_id = p_project),
  inv as (select i.*, coalesce((select sum(amount) from prj_payments y where y.invoice_id = i.id and y.status = 'selesai' and y.kind = 'bayar'), 0) paid
          from prj_invoices i where i.project_id = p_project and i.status = 'terbit')
  select jsonb_build_object(
    'value', (select value from p),
    'billed', (select coalesce(sum(amount), 0) from inv),
    'received', (select coalesce(sum(amount), 0) from prj_payments where project_id = p_project and status = 'selesai' and kind = 'bayar'),
    'refunded', (select coalesce(sum(amount), 0) from prj_payments where project_id = p_project and status = 'selesai' and kind = 'kembali'),
    'forfeited', (select coalesce(sum(amount), 0) from prj_payments where project_id = p_project and status = 'selesai' and kind = 'hangus'),
    'recognized', (select coalesce(-sum(delta), 0) from e where ev_type in ('prj_recog', 'prj_recog_rest')),
    'advance', greatest((select coalesce(sum(delta), 0) from e), 0),
    'receivable', greatest(-(select coalesce(sum(delta), 0) from e), 0),
    -- belum dibayar di tingkat proyek = ditagih − diterima bersih (pembayaran tanpa tagihan ikut mengurangi)
    'invoices_open', greatest((select coalesce(sum(amount), 0) from inv)
      - (select coalesce(sum(case kind when 'bayar' then amount when 'kembali' then -amount else 0 end), 0) from prj_payments where project_id = p_project and status = 'selesai'), 0),
    'unlinked', (select coalesce(sum(amount), 0) from prj_payments where project_id = p_project and status = 'selesai' and kind = 'bayar' and invoice_id is null),
    'overdue', least(
      (select coalesce(sum(amount - paid), 0) from inv where paid < amount and due_date < (now() at time zone 'Asia/Jakarta')::date),
      greatest((select coalesce(sum(amount), 0) from inv)
        - (select coalesce(sum(case kind when 'bayar' then amount when 'kembali' then -amount else 0 end), 0) from prj_payments where project_id = p_project and status = 'selesai'), 0)));
$$;

create or replace function public.prj_bill_guard(p_project uuid, p_write boolean)
returns prj_projects language plpgsql stable security definer set search_path = public as $$
declare p prj_projects;
begin
  select * into p from prj_projects where id = p_project;
  if p.id is null or prj_access(p.id) is null then raise exception 'Proyek tidak ditemukan'; end if;
  perform prj_guard(p.kos_id, p_write);
  if not member_in('finance', p.kos_id) then raise exception 'Tagihan & pembayaran proyek hanya untuk pemilik atau bagian keuangan'; end if;
  return p;
end $$;

create or replace function public.prj_inv_row(i prj_invoices)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object('id', i.id, 'number', i.number, 'milestone_id', i.milestone_id, 'milestone', (select name from prj_milestones where id = i.milestone_id),
    'issue_date', i.issue_date, 'due_date', i.due_date, 'amount', i.amount, 'description', i.description, 'note', i.note, 'status', i.status, 'void_reason', i.void_reason,
    'paid', x.paid, 'state', case when i.status = 'batal' then 'batal' when x.paid >= i.amount then 'lunas' when x.paid > 0 then 'sebagian' else 'belum' end,
    'overdue', i.status = 'terbit' and x.paid < i.amount and i.due_date < (now() at time zone 'Asia/Jakarta')::date)
  from (select coalesce((select sum(amount) from prj_payments y where y.invoice_id = i.id and y.status = 'selesai' and y.kind = 'bayar'), 0) paid) x;
$$;

-- ---------- Detail tagihan & pembayaran satu proyek ----------
create or replace function public.prj_billing(p_project uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare p prj_projects;
begin
  p := prj_bill_guard(p_project, false);
  return prj_bill_summary(p.id) || jsonb_build_object(
    'allowed', plan_has(p.kos_id, 'proyek'), 'status', p.status, 'client', (select name from contacts where id = p.contact_id),
    'invoices', (select coalesce(jsonb_agg(prj_inv_row(i) order by i.issue_date desc, i.created_at desc), '[]') from prj_invoices i where i.project_id = p.id),
    'payments', (select coalesce(jsonb_agg(jsonb_build_object('id', y.id, 'kind', y.kind, 'pay_date', y.pay_date, 'amount', y.amount, 'account', y.account, 'note', y.note,
                   'status', y.status, 'void_reason', y.void_reason, 'invoice_id', y.invoice_id, 'invoice', (select number from prj_invoices where id = y.invoice_id))
                 order by y.pay_date desc, y.created_at desc), '[]') from prj_payments y where y.project_id = p.id),
    -- milestone bernilai: sudah ditagih berapa (untuk tombol "Tagihkan")
    'milestones', (select coalesce(jsonb_agg(jsonb_build_object('id', m.id, 'name', m.name, 'amount', m.amount, 'status', m.status, 'due_date', m.due_date,
                     'billed', coalesce((select sum(amount) from prj_invoices i where i.milestone_id = m.id and i.status = 'terbit'), 0))
                   order by m.sort, m.created_at), '[]') from prj_milestones m where m.project_id = p.id and coalesce(m.amount, 0) > 0));
end $$;

-- ---------- Tagihan ----------
-- p: {milestone_id?, amount?, description?, issue_date?, due_date?, note?}. Nominal kosong + milestone = sisa termin yang belum ditagih.
create or replace function public.prj_invoice_create(p_project uuid, p jsonb)
returns uuid language plpgsql security definer set search_path = public as $$
declare pr prj_projects; m prj_milestones; v_id uuid := gen_random_uuid(); v_amt numeric := nullif(p->>'amount', '')::numeric; v_desc text := trim(coalesce(p->>'description', ''));
        v_issue date := coalesce(nullif(p->>'issue_date', '')::date, (now() at time zone 'Asia/Jakarta')::date); v_due date := nullif(p->>'due_date', '')::date; v_billed numeric;
begin
  pr := prj_bill_guard(p_project, true);
  if pr.status in ('batal', 'penawaran') then raise exception 'Tagihan dibuat untuk proyek yang berjalan (status sekarang: %)', pr.status; end if;
  if nullif(p->>'milestone_id', '') is not null then
    select * into m from prj_milestones where id = (p->>'milestone_id')::uuid and project_id = pr.id;
    if m.id is null then raise exception 'Milestone tidak ditemukan di proyek ini'; end if;
    select coalesce(sum(amount), 0) into v_billed from prj_invoices where milestone_id = m.id and status = 'terbit';
    if v_amt is null then v_amt := coalesce(m.amount, 0) - v_billed; end if;
    if v_desc = '' then v_desc := m.name; end if;
  end if;
  if v_amt is null or v_amt <= 0 then raise exception 'Isi nominal tagihan (termin ini mungkin sudah ditagih seluruhnya)'; end if;
  if v_amt > 999999999999 then raise exception 'Nominal terlalu besar'; end if;
  if length(v_desc) < 2 then raise exception 'Isi uraian tagihan (mis. DP 30%%, Pelunasan)'; end if;
  if v_due is not null and v_due < v_issue then raise exception 'Jatuh tempo tidak boleh sebelum tanggal tagihan'; end if;
  insert into prj_invoices(id, kos_id, project_id, milestone_id, number, issue_date, due_date, amount, description, note)
  values (v_id, pr.kos_id, pr.id, m.id, prj_next_number(pr.kos_id, 'TGP', 'prj_invoices'), v_issue, v_due, v_amt, left(v_desc, 200), nullif(left(trim(coalesce(p->>'note', '')), 500), ''));
  perform dom_emit(pr.kos_id, 'ProjectInvoiceIssued', 'project', pr.id, v_id::text, 'finance',
    pr.number || ' · Tagihan ' || (select number from prj_invoices where id = v_id) || ' · ' || left(v_desc, 60) || ' · ' || dom_rp(v_amt), v_amt, jsonb_build_object('invoice_id', v_id));
  return v_id;
end $$;

create or replace function public.prj_invoice_void(p_id uuid, p_reason text)
returns void language plpgsql security definer set search_path = public as $$
declare i prj_invoices; pr prj_projects;
begin
  select * into i from prj_invoices where id = p_id;
  if i.id is null then raise exception 'Tagihan tidak ditemukan'; end if;
  pr := prj_bill_guard(i.project_id, false);
  if i.status = 'batal' then raise exception 'Tagihan sudah dibatalkan'; end if;
  if coalesce(length(trim(p_reason)), 0) < 3 then raise exception 'Tuliskan alasan membatalkan (min. 3 huruf)'; end if;
  if exists (select 1 from prj_payments where invoice_id = i.id and status = 'selesai') then
    raise exception 'Tagihan ini sudah ada pembayarannya. Batalkan pembayarannya dulu bila memang salah catat.';
  end if;
  update prj_invoices set status = 'batal', void_reason = left(trim(p_reason), 300), voided_at = now() where id = i.id;
  perform dom_emit(i.kos_id, 'ProjectInvoiceVoided', 'project', i.project_id, i.id::text || ':batal', 'finance',
    pr.number || ' · Tagihan ' || i.number || ' dibatalkan · ' || trim(p_reason), i.amount, jsonb_build_object('invoice_id', i.id));
end $$;

-- ---------- Pembayaran ----------
-- p: {kind 'bayar'|'kembali'|'hangus', amount, pay_date?, account?, invoice_id?, note?}
create or replace function public.prj_payment_add(p_project uuid, p jsonb)
returns uuid language plpgsql security definer set search_path = public as $$
declare pr prj_projects; i prj_invoices; v_id uuid := gen_random_uuid(); v_kind text := coalesce(nullif(p->>'kind', ''), 'bayar'); v_amt numeric := nullif(p->>'amount', '')::numeric;
        v_date date := coalesce(nullif(p->>'pay_date', '')::date, (now() at time zone 'Asia/Jakarta')::date); v_acc text := nullif(p->>'account', ''); v_adv numeric; v_left numeric;
begin
  pr := prj_bill_guard(p_project, false);   -- uang nyata: tetap boleh dicatat walau paket turun
  if v_kind not in ('bayar', 'kembali', 'hangus') then raise exception 'Jenis tidak dikenal'; end if;
  if v_amt is null or v_amt <= 0 or v_amt > 999999999999 then raise exception 'Isi nominal'; end if;
  if v_date > (now() at time zone 'Asia/Jakarta')::date then raise exception 'Tanggal tidak boleh di masa depan'; end if;
  if v_kind = 'hangus' then v_acc := null;
  elsif coalesce(v_acc, '') not in ('kas', 'bank') then raise exception 'Pilih kas atau bank';
  end if;
  if v_kind = 'bayar' and pr.status = 'penawaran' then raise exception 'Jalankan proyek dulu (status masih penawaran) sebelum mencatat pembayaran'; end if;
  if v_kind = 'bayar' and nullif(p->>'invoice_id', '') is not null then
    select * into i from prj_invoices where id = (p->>'invoice_id')::uuid and project_id = pr.id;
    if i.id is null or i.status <> 'terbit' then raise exception 'Tagihan tidak ditemukan atau sudah dibatalkan'; end if;
    v_left := i.amount - coalesce((select sum(amount) from prj_payments where invoice_id = i.id and status = 'selesai' and kind = 'bayar'), 0);
    if v_amt > v_left then raise exception 'Pembayaran (%) melebihi sisa tagihan % (%). Catat kelebihannya tanpa memilih tagihan.', dom_rp(v_amt), i.number, dom_rp(v_left); end if;
  end if;
  if v_kind in ('kembali', 'hangus') then
    v_adv := (prj_bill_summary(pr.id)->>'advance')::numeric;
    if v_amt > v_adv then raise exception 'Maksimal % (uang muka yang belum menjadi pendapatan)', dom_rp(v_adv); end if;
  end if;
  insert into prj_payments(id, kos_id, project_id, invoice_id, kind, pay_date, amount, account, note)
  values (v_id, pr.kos_id, pr.id, i.id, v_kind, v_date, v_amt, v_acc, nullif(left(trim(coalesce(p->>'note', '')), 300), ''));
  perform dom_emit(pr.kos_id, case v_kind when 'bayar' then 'ProjectPaymentReceived' when 'kembali' then 'ProjectAdvanceRefunded' else 'ProjectAdvanceForfeited' end,
    'project', pr.id, v_id::text, 'finance',
    pr.number || ' · ' || case v_kind when 'bayar' then 'Terima pembayaran' when 'kembali' then 'Uang muka dikembalikan' else 'Uang muka hangus' end
      || coalesce(' (' || i.number || ')', '') || ' · ' || dom_rp(v_amt), v_amt, jsonb_build_object('payment_id', v_id));
  return v_id;
end $$;

create or replace function public.prj_payment_void(p_id uuid, p_reason text)
returns void language plpgsql security definer set search_path = public as $$
declare y prj_payments; pr prj_projects;
begin
  select * into y from prj_payments where id = p_id;
  if y.id is null then raise exception 'Pembayaran tidak ditemukan'; end if;
  pr := prj_bill_guard(y.project_id, false);
  if y.status = 'batal' then raise exception 'Sudah dibatalkan'; end if;
  if coalesce(length(trim(p_reason)), 0) < 3 then raise exception 'Tuliskan alasan membatalkan (min. 3 huruf)'; end if;
  update prj_payments set status = 'batal', void_reason = left(trim(p_reason), 300), voided_at = now() where id = y.id;
  perform dom_emit(y.kos_id, 'ProjectPaymentVoided', 'project', y.project_id, y.id::text || ':batal', 'finance',
    pr.number || ' · Pembayaran ' || dom_rp(y.amount) || ' dibatalkan · ' || trim(p_reason), y.amount, jsonb_build_object('payment_id', y.id));
end $$;

-- ---------- Dokumen tagihan (cetak / WA) ----------
create or replace function public.prj_invoice_get(p_id uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare i prj_invoices; pr prj_projects; k kos;
begin
  select * into i from prj_invoices where id = p_id;
  if i.id is null then raise exception 'Tagihan tidak ditemukan'; end if;
  pr := prj_bill_guard(i.project_id, false);
  select * into k from kos where id = i.kos_id;
  return prj_inv_row(i) || jsonb_build_object(
    'project', jsonb_build_object('id', pr.id, 'number', pr.number, 'name', pr.name, 'value', pr.value),
    'business', jsonb_build_object('name', k.name, 'address', k.address, 'phone', k.contact_phone, 'logo', k.profile->>'logo_path', 'payment_info', k.payment_info, 'footer', k.receipt_footer),
    'customer', (select jsonb_build_object('name', c.name, 'phone', c.phone, 'address', c.address) from contacts c where c.id = pr.contact_id),
    'payments', (select coalesce(jsonb_agg(jsonb_build_object('pay_date', y.pay_date, 'amount', y.amount, 'account', y.account) order by y.pay_date), '[]')
                 from prj_payments y where y.invoice_id = i.id and y.status = 'selesai' and y.kind = 'bayar'),
    'summary', prj_bill_summary(pr.id));
end $$;

-- ---------- Sambungan ke laporan laba & detail proyek ----------
select public._prasara_patch('public.prj_profit_report(uuid)',
  'cross join lateral (select prj_cost_summary(p.id) x) s',
  'cross join lateral (select prj_cost_summary(p.id) || jsonb_build_object(''bill'', prj_bill_summary(p.id)) x) s');
select public._prasara_patch('public.prj_get(uuid)',
  '''cost'', case when v_fin then prj_cost_summary(p.id) - ''categories'' end,',
  '''cost'', case when v_fin then prj_cost_summary(p.id) - ''categories'' end, ''bill'', case when v_fin then prj_bill_summary(p.id) end,');
select public._prasara_patch('public.event_label(text)',
  'else p_type end;',
  'when ''ProjectInvoiceIssued'' then ''Tagihan proyek'' when ''ProjectInvoiceVoided'' then ''Tagihan proyek batal''
    when ''ProjectPaymentReceived'' then ''Pembayaran proyek'' when ''ProjectPaymentVoided'' then ''Pembayaran proyek batal''
    when ''ProjectAdvanceRefunded'' then ''Uang muka dikembalikan'' when ''ProjectAdvanceForfeited'' then ''Uang muka hangus'' else p_type end;');
drop function public._prasara_patch(text, text, text);

revoke execute on function public.prj_rev_events(uuid), public.prj_bill_summary(uuid), public.prj_bill_guard(uuid, boolean), public.prj_inv_row(public.prj_invoices)
  from public, anon, authenticated;
revoke execute on function public.prj_billing(uuid), public.prj_invoice_create(uuid, jsonb), public.prj_invoice_void(uuid, text), public.prj_payment_add(uuid, jsonb),
  public.prj_payment_void(uuid, text), public.prj_invoice_get(uuid) from public, anon;
grant execute on function public.prj_billing(uuid), public.prj_invoice_create(uuid, jsonb), public.prj_invoice_void(uuid, text), public.prj_payment_add(uuid, jsonb),
  public.prj_payment_void(uuid, text), public.prj_invoice_get(uuid) to authenticated;
