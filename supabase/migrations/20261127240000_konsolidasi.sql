-- Tahap I Master Blueprint BI V2.0: konsolidasi formal (Mode B) — beberapa bisnis milik sendiri digabung dengan ELIMINASI
-- transaksi antarbisnis dan KEPENTINGAN NONPENGENDALI (bagian pemilik lain bila kepemilikan < 100%).
-- Keputusan pemilik 27 Nov 2026: persen kepemilikan per bisnis; transaksi antarbisnis dikenali dari kontak yang DITAUTKAN ke bisnis
-- sendiri (contacts.related_kos_id) + eliminasi manual wajib alasan; Paket Pro (fitur gabungan_bisnis: minimal satu bisnis Pro di grup,
-- sama dengan Ringkasan multi-bisnis). Grup milik AKUN (seperti portfolio_settings), anggota wajib bisa diakses keuangannya.
-- Angka per bisnis = biz_financials (jurnal); penggabungan, eliminasi & nonpengendali dihitung di lib/consolidation.js (rumus tertulis).

-- ---------- Kontak = bisnis sendiri ----------
alter table public.contacts add column if not exists related_kos_id uuid references public.kos(id) on delete set null;
alter table public.contacts drop constraint if exists contacts_related_kos_check;
alter table public.contacts add constraint contacts_related_kos_check check (related_kos_id is null or related_kos_id <> kos_id);

create or replace function public.contact_link_business(p_contact uuid, p_target uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare c contacts;
begin
  select * into c from contacts where id = p_contact;
  if c.id is null or not member_in('finance', c.kos_id) then raise exception 'Kontak tidak ditemukan'; end if;
  if p_target is not null then
    if p_target = c.kos_id then raise exception 'Tidak bisa menautkan kontak ke bisnis yang sama'; end if;
    if not member_in('finance', p_target) then raise exception 'Bisnis tujuan harus bisnis Anda sendiri dengan akses keuangan'; end if;
  end if;
  update contacts set related_kos_id = p_target where id = c.id;
  perform config_log(c.kos_id, 'tautan_kontak_bisnis', c.name, jsonb_build_object('bisnis', c.related_kos_id), jsonb_build_object('bisnis', p_target), null, 'rendah', null);
  return jsonb_build_object('id', c.id, 'related_kos_id', p_target, 'related_name', (select name from kos where id = p_target));
end $$;

-- Bisnis yang bisa dipilih sebagai tujuan tautan (akses keuangan, selain bisnis kontak itu)
create or replace function public.my_finance_businesses()
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', k.id, 'name', k.name, 'type', k.business_type, 'pro', plan_has(k.id, 'gabungan_bisnis')) order by k.name), '[]')
  from kos k join kos_members m on m.kos_id = k.id and m.user_id = auth.uid() and m.active
  where k.closed_at is null and k.suspended_at is null and member_in('finance', k.id);
$$;

-- ---------- Grup konsolidasi (milik akun) ----------
create table public.consol_groups (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (length(trim(name)) between 2 and 80),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table public.consol_members (
  group_id uuid not null references public.consol_groups(id) on delete cascade,
  kos_id uuid not null references public.kos(id) on delete cascade,
  pct numeric(5,2) not null default 100 check (pct > 0 and pct <= 100),
  primary key (group_id, kos_id)
);
create table public.consol_elims (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.consol_groups(id) on delete cascade,
  date date not null,
  kind text not null check (kind in ('jual_beli', 'piutang_utang', 'pinjaman', 'lainnya')),
  debit_class text not null,
  credit_class text not null,
  amount numeric(14,2) not null check (amount > 0),
  reason text not null check (length(trim(reason)) between 5 and 300),
  created_by text,
  created_at timestamptz not null default now(),
  voided_at timestamptz,
  void_reason text
);
alter table public.consol_groups enable row level security;
alter table public.consol_members enable row level security;
alter table public.consol_elims enable row level security;
revoke all on public.consol_groups, public.consol_members, public.consol_elims from anon, authenticated;
create trigger zz_kos_open_guard before insert or update or delete on public.consol_members for each row execute function public.kos_open_guard();

-- Kelas yang boleh dieliminasi: satu sisi "normal debit" (beban/aset) dan satu sisi "normal kredit" (pendapatan/kewajiban), keduanya DIKURANGI
-- dengan jumlah yang sama → neraca gabungan tetap seimbang.
create or replace function public.consol_elim_sides()
returns jsonb language sql immutable as $$
  select '{"debit": ["hpp", "beban_operasional", "beban_lain", "piutang", "aset_lancar_lain", "persediaan"],
           "credit": ["pendapatan_usaha", "pendapatan_lain", "utang_usaha", "kewajiban_lain", "pinjaman"]}'::jsonb;
$$;

create or replace function public.consol_own(p_group uuid)
returns consol_groups language plpgsql stable security definer set search_path = public as $$
declare g consol_groups;
begin
  select * into g from consol_groups where id = p_group and user_id = auth.uid();
  if g.id is null then raise exception 'Grup konsolidasi tidak ditemukan'; end if;
  return g;
end $$;

create or replace function public.consol_group_save(p_id uuid, p_name text, p_members jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_id uuid := coalesce(p_id, gen_random_uuid()); m jsonb; v_kos uuid; v_pct numeric; v_seen uuid[] := '{}';
begin
  if auth.uid() is null then raise exception 'Harus login'; end if;
  if length(trim(coalesce(p_name, ''))) not between 2 and 80 then raise exception 'Nama grup wajib diisi'; end if;
  if jsonb_typeof(p_members) <> 'array' or jsonb_array_length(p_members) < 2 or jsonb_array_length(p_members) > 20 then
    raise exception 'Grup berisi 2–20 bisnis'; end if;
  for m in select * from jsonb_array_elements(p_members) loop
    v_kos := (m ->> 'kos_id')::uuid; v_pct := coalesce((m ->> 'pct')::numeric, 100);
    if v_kos = any(v_seen) then raise exception 'Bisnis ganda di grup'; end if;
    if not exists (select 1 from kos k join kos_members km on km.kos_id = k.id and km.user_id = auth.uid() and km.active where k.id = v_kos and k.closed_at is null)
       or not member_in('finance', v_kos) then raise exception 'Semua bisnis di grup harus bisnis Anda dengan akses keuangan'; end if;
    if v_pct <= 0 or v_pct > 100 then raise exception 'Persen kepemilikan 0–100'; end if;
    v_seen := v_seen || v_kos;
  end loop;
  if not exists (select 1 from unnest(v_seen) x where plan_has(x, 'gabungan_bisnis')) then
    raise exception 'BATAS_PAKET: Konsolidasi butuh minimal satu bisnis Paket Pro di grup.'; end if;
  if p_id is not null then perform consol_own(p_id); update consol_groups set name = trim(p_name), updated_at = now() where id = p_id;
  else insert into consol_groups(id, user_id, name) values (v_id, auth.uid(), trim(p_name)); end if;
  delete from consol_members where group_id = v_id and not (kos_id = any(v_seen));
  for m in select * from jsonb_array_elements(p_members) loop
    insert into consol_members(group_id, kos_id, pct) values (v_id, (m ->> 'kos_id')::uuid, round(coalesce((m ->> 'pct')::numeric, 100), 2))
    on conflict (group_id, kos_id) do update set pct = excluded.pct;
  end loop;
  return jsonb_build_object('id', v_id);
end $$;

create or replace function public.consol_group_delete(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform consol_own(p_id);
  delete from consol_groups where id = p_id;
end $$;

create or replace function public.consol_groups_list()
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', g.id, 'name', g.name, 'updated_at', g.updated_at,
    'members', (select coalesce(jsonb_agg(jsonb_build_object('kos_id', m.kos_id, 'pct', m.pct, 'name', k.name, 'type', k.business_type,
                  'access', member_in('finance', m.kos_id), 'pro', plan_has(m.kos_id, 'gabungan_bisnis')) order by m.pct desc, k.name), '[]')
                from consol_members m join kos k on k.id = m.kos_id where m.group_id = g.id)) order by g.created_at), '[]')
  from consol_groups g where g.user_id = auth.uid();
$$;

create or replace function public.consol_elim_add(p_group uuid, p_date date, p_kind text, p_debit text, p_credit text, p_amount numeric, p_reason text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_d text := p_debit; v_c text := p_credit; v_id uuid;
begin
  perform consol_own(p_group);
  if p_kind = 'jual_beli' then v_d := 'hpp'; v_c := 'pendapatan_usaha';
  elsif p_kind = 'piutang_utang' then v_d := 'piutang'; v_c := 'utang_usaha';
  elsif p_kind = 'pinjaman' then v_d := 'aset_lancar_lain'; v_c := 'pinjaman';
  elsif p_kind <> 'lainnya' then raise exception 'Jenis eliminasi tidak valid'; end if;
  if not (consol_elim_sides() -> 'debit') ? v_d or not (consol_elim_sides() -> 'credit') ? v_c then raise exception 'Pasangan pos eliminasi tidak valid'; end if;
  if coalesce(p_amount, 0) <= 0 or p_amount > 999999999999 then raise exception 'Jumlah tidak valid'; end if;
  if length(trim(coalesce(p_reason, ''))) < 5 then raise exception 'Tulis alasan eliminasi (min. 5 huruf)'; end if;
  insert into consol_elims(group_id, date, kind, debit_class, credit_class, amount, reason, created_by)
  values (p_group, p_date, p_kind, v_d, v_c, round(p_amount, 2), trim(p_reason), actor_email()) returning id into v_id;
  return jsonb_build_object('id', v_id);
end $$;

create or replace function public.consol_elim_void(p_id uuid, p_reason text)
returns void language plpgsql security definer set search_path = public as $$
declare e consol_elims;
begin
  select * into e from consol_elims where id = p_id;
  if e.id is null then raise exception 'Eliminasi tidak ditemukan'; end if;
  perform consol_own(e.group_id);
  if e.voided_at is not null then raise exception 'Sudah dibatalkan'; end if;
  if length(trim(coalesce(p_reason, ''))) < 3 then raise exception 'Tulis alasan pembatalan'; end if;
  update consol_elims set voided_at = now(), void_reason = trim(p_reason) where id = p_id;
end $$;

-- ---------- Laporan konsolidasi ----------
-- Otomatis: (1) penjualan/pesanan jasa selesai bisnis A ke kontak yang ditautkan ke bisnis B dalam grup (tanpa PPN, dikurangi retur; `cost` =
-- harga pokok A, jasa = nilai penuh) → eliminasi pendapatan ↔ HPP, laba belum terjadi di persediaan pembeli dihitung di lib/consolidation.js; (2) piutang A ke kontak-B & utang B ke kontak-A yang MASIH TERBUKA (hanya bila periode berakhir ≥ hari ini,
-- karena saldo terbuka adalah posisi hari ini) → eliminasi sebesar yang lebih kecil, selisih dilaporkan.
create or replace function public.consol_report(p_group uuid, p_from date, p_to date)
returns jsonb language plpgsql security definer set search_path = public as $$
declare g consol_groups; v_today date := (now() at time zone 'Asia/Jakarta')::date; v_members jsonb; v_sales jsonb; v_arap jsonb; v_bad text;
begin
  g := consol_own(p_group);
  if p_from is null or p_to is null or p_to < p_from or p_to - p_from > 731 then raise exception 'Periode tidak valid (maks. 2 tahun)'; end if;
  select string_agg(k.name, ', ') into v_bad from consol_members m join kos k on k.id = m.kos_id where m.group_id = g.id and not member_in('finance', m.kos_id);
  if v_bad is not null then raise exception 'Akses keuangan ke % sudah tidak ada. Keluarkan dari grup atau minta akses lagi.', v_bad; end if;
  if not exists (select 1 from consol_members m where m.group_id = g.id and plan_has(m.kos_id, 'gabungan_bisnis')) then
    return jsonb_build_object('aktif', false, 'name', g.name); end if;
  select jsonb_agg(jsonb_build_object('kos_id', m.kos_id, 'name', k.name, 'type', k.business_type, 'pct', m.pct,
           'fin', (select jsonb_build_object('laba_rugi', f -> 'laba_rugi' -> 'cur', 'close', f -> 'neraca' -> 'close', 'open', f -> 'neraca' -> 'open',
                                             'seimbang', f -> 'neraca' -> 'seimbang', 'lengkap', f -> 'lengkap')
                   from (select biz_financials(m.kos_id, p_from, p_to, null, null) f) z)) order by m.pct desc, k.name)
    into v_members from consol_members m join kos k on k.id = m.kos_id where m.group_id = g.id;
  -- (1) penjualan & pesanan jasa antarbisnis
  with mem as (select kos_id from consol_members where group_id = g.id),
  sal as (
    select s.kos_id a, c.related_kos_id b, s.total - s.tax_amount
           - coalesce((select sum(r.total - r.tax_amount) from sale_returns r where r.sale_id = s.id and r.return_date between p_from and p_to), 0) v,
           s.cost_total - coalesce((select sum(r.cost_total) from sale_returns r where r.sale_id = s.id and r.return_date between p_from and p_to), 0) k
    from sales s join contacts c on c.id = s.contact_id
    where s.kos_id in (select kos_id from mem) and c.related_kos_id in (select kos_id from mem) and s.status = 'selesai' and s.sale_date between p_from and p_to
    union all
    select o.kos_id, c.related_kos_id, o.total, o.total from svc_orders o join contacts c on c.id = o.contact_id
    where o.kos_id in (select kos_id from mem) and c.related_kos_id in (select kos_id from mem) and o.status = 'selesai' and o.completed_date between p_from and p_to)
  select coalesce(jsonb_agg(jsonb_build_object('from', a, 'to', b, 'amount', round(t, 2), 'cost', round(least(greatest(kc, 0), t), 2))), '[]') into v_sales
  from (select a, b, sum(v) t, sum(k) kc from sal group by a, b having sum(v) <> 0) z;
  -- (2) piutang/utang antarbisnis terbuka (posisi hari ini)
  if p_to >= v_today then
    with mem as (select kos_id from consol_members where group_id = g.id),
    ar as (select x.kos_id a, c.related_kos_id b, sum(r.open_amount) v
           from mem x cross join lateral receivable_open_core(x.kos_id) r join contacts c on c.id = r.contact_id
           where c.related_kos_id in (select kos_id from mem) group by 1, 2),
    ap as (select x.kos_id b, c.related_kos_id a, sum(p.open_amount) v
           from mem x cross join lateral payable_open(x.kos_id) p join contacts c on c.id = p.contact_id
           where c.related_kos_id in (select kos_id from mem) group by 1, 2)
    select coalesce(jsonb_agg(jsonb_build_object('creditor', coalesce(ar.a, ap.a), 'debtor', coalesce(ar.b, ap.b), 'piutang', round(coalesce(ar.v, 0), 2),
             'utang', round(coalesce(ap.v, 0), 2))), '[]') into v_arap
    from ar full join ap on ap.a = ar.a and ap.b = ar.b
    where coalesce(ar.v, 0) <> 0 or coalesce(ap.v, 0) <> 0;
  end if;
  return jsonb_build_object('aktif', true, 'id', g.id, 'name', g.name, 'from', p_from, 'to', p_to, 'hari_ini', v_today,
    'members', coalesce(v_members, '[]'), 'auto_sales', v_sales, 'auto_arap', v_arap, 'arap_dilewati', p_to < v_today,
    'manual', (select coalesce(jsonb_agg(to_jsonb(e) - 'group_id' order by e.date, e.created_at), '[]') from consol_elims e
               where e.group_id = g.id and e.voided_at is null and e.date between p_from and p_to),
    'contacts_linked', (select count(*) from contacts c join consol_members m on m.kos_id = c.kos_id and m.group_id = g.id
                        where c.related_kos_id in (select kos_id from consol_members where group_id = g.id)));
end $$;

revoke execute on function public.consol_own(uuid), public.consol_elim_sides() from public, anon, authenticated;
revoke execute on function public.contact_link_business(uuid, uuid), public.my_finance_businesses(), public.consol_group_save(uuid, text, jsonb), public.consol_group_delete(uuid),
  public.consol_groups_list(), public.consol_elim_add(uuid, date, text, text, text, numeric, text), public.consol_elim_void(uuid, text), public.consol_report(uuid, date, date) from public, anon;
grant execute on function public.contact_link_business(uuid, uuid), public.my_finance_businesses(), public.consol_group_save(uuid, text, jsonb), public.consol_group_delete(uuid),
  public.consol_groups_list(), public.consol_elim_add(uuid, date, text, text, text, numeric, text), public.consol_elim_void(uuid, text), public.consol_report(uuid, date, date) to authenticated;
