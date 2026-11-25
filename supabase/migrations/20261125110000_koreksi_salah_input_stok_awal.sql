-- Reclassify an opname that already corrected an erroneous opening balance.
-- Neither the physical balance nor the original inventory movements are edited.
create table public.stock_opening_corrections (
  id uuid primary key default gen_random_uuid(),
  kos_id uuid not null references public.kos(id) on delete cascade,
  opening_id uuid not null unique references public.stock_moves(id),
  opname_id uuid not null unique references public.stock_moves(id),
  corrected_qty numeric not null check (corrected_qty >= 0),
  value numeric not null,
  entry_date date not null,
  reason text not null,
  created_by uuid not null,
  created_at timestamptz not null default now()
);
create index stock_opening_corrections_kos on public.stock_opening_corrections(kos_id);
alter table public.stock_opening_corrections enable row level security;
revoke all on public.stock_opening_corrections from anon, authenticated;
grant select on public.stock_opening_corrections to authenticated;
create policy stock_opening_corrections_read on public.stock_opening_corrections
  for select to authenticated using (public.member_can(kos_id, 'team'));
create trigger zz_kos_open_guard before insert or update or delete on public.stock_opening_corrections
  for each row execute function public.kos_open_guard();

create function public.stock_correct_opening(p_opening uuid, p_opname uuid, p_qty numeric, p_reason text)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  a stock_moves; o stock_moves; v_id uuid; v_day date;
begin
  select * into a from stock_moves where id = p_opening and kind = 'awal';
  if a.id is null or not member_in('team', a.kos_id) then raise exception 'Stok awal tidak ditemukan atau akses ditolak'; end if;
  perform 1 from products where id = a.product_id for update;
  select * into o from stock_moves where id = p_opname and kind = 'opname'
    and kos_id = a.kos_id and product_id = a.product_id and branch_id is not distinct from a.branch_id;
  if o.id is null or o.created_at <= a.created_at then raise exception 'Opname terkait tidak valid'; end if;
  select id into v_id from stock_opening_corrections
  where opening_id = a.id and opname_id = o.id and corrected_qty = p_qty;
  if v_id is not null then return v_id; end if;
  if length(btrim(coalesce(p_reason, ''))) < 3 or length(p_reason) > 500 then raise exception 'Isi alasan koreksi (3–500 karakter)'; end if;
  if p_qty is null or p_qty < 0 or p_qty <> a.delta + o.delta or a.delta <= 0 or a.stock_after <> a.delta
     or o.stock_after <> p_qty or a.stock_after <> o.stock_after - o.delta
     or abs(o.value - round(a.value * o.delta / a.delta, 2)) > 0.01 then
    raise exception 'Jumlah atau nilai opname tidak cocok dengan saldo awal. Periksa riwayat stok.';
  end if;
  perform pg_advisory_xact_lock(hashtext('acct:' || a.kos_id::text));
  v_day := (o.created_at at time zone 'Asia/Jakarta')::date;
  if v_day <> (a.created_at at time zone 'Asia/Jakarta')::date or acct_period_closed(a.kos_id, v_day) then
    raise exception 'Koreksi ini memerlukan stok awal dan opname pada tanggal yang sama di periode terbuka';
  end if;
  if exists (select 1 from stock_moves m where m.product_id = a.product_id
    and m.id not in (a.id, o.id) and m.created_at between a.created_at and o.created_at) then
    raise exception 'Ada mutasi lain antara stok awal dan opname. Periksa riwayat secara manual.';
  end if;
  insert into stock_opening_corrections(kos_id, opening_id, opname_id, corrected_qty, value, entry_date, reason, created_by)
    values (a.kos_id, a.id, o.id, p_qty, o.value, v_day, btrim(p_reason), auth.uid())
    returning id into v_id;
  perform acct_sync_internal(a.kos_id);
  return v_id;
end $$;
revoke execute on function public.stock_correct_opening(uuid,uuid,numeric,text) from public, anon;
grant execute on function public.stock_correct_opening(uuid,uuid,numeric,text) to authenticated;

do $$
declare d text; old text; new text;
begin
  d := pg_get_functiondef('public.acct_desired(uuid)'::regprocedure);
  old := $o$  select 'stock_move', m.id,$o$;
  new := $n$  select 'stock_opening_correction', c.id, c.entry_date, 'Koreksi salah input stok awal · ' || p.name, x.k, x.v
    from stock_opening_corrections c join stock_moves m on m.id = c.opening_id join products p on p.id = m.product_id
    cross join lateral (values ('saldo_awal', -c.value), ('selisih_persediaan', c.value)) x(k, v)
    where c.kos_id = p_kos and c.value <> 0
  union all
  select 'stock_move', m.id,$n$;
  if position(old in d) = 0 then raise exception 'Sumber jurnal stok tidak ditemukan'; end if;
  execute replace(d, old, new);

  d := pg_get_functiondef('public.retail_report(uuid,date,date)'::regprocedure);
  old := $o$from stock_moves where kos_id = p_kos and kind in ('opname', 'rusak', 'kedaluwarsa', 'koreksi')$o$;
  new := $n$from stock_moves where kos_id = p_kos and kind in ('opname', 'rusak', 'kedaluwarsa', 'koreksi')
      and not exists (select 1 from stock_opening_corrections c where c.opname_id = stock_moves.id)$n$;
  if position(old in d) = 0 then raise exception 'Selisih stok laporan tidak ditemukan'; end if;
  execute replace(d, old, new);
end $$;
