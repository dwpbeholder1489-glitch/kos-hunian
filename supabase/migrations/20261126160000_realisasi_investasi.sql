create table public.acct_investment_tracking (
  version_id uuid primary key references public.acct_investment_simulations(id) on delete cascade,
  kos_id uuid not null references public.kos(id) on delete cascade,
  start_month date not null,
  created_at timestamptz not null default now()
);
create table public.acct_investment_links (
  kos_id uuid not null references public.kos(id) on delete cascade,
  source_type text not null,
  source_id uuid not null,
  version_id uuid not null references public.acct_investment_tracking(version_id) on delete cascade,
  category text not null check (category in ('capital', 'operating')),
  created_by uuid not null,
  created_at timestamptz not null default now(),
  primary key (kos_id, source_type, source_id)
);
create index acct_investment_links_version on public.acct_investment_links(version_id);
alter table public.acct_investment_tracking enable row level security;
alter table public.acct_investment_links enable row level security;
revoke all on public.acct_investment_tracking, public.acct_investment_links from public, anon, authenticated;

create function public.acct_investment_actual(p_kos uuid, p_version uuid, p_action text, p_data jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_actor uuid := auth.uid();
  v_today date := (now() at time zone 'Asia/Jakarta')::date;
  v_start date;
  v_month date;
  v_entry acct_entries%rowtype;
  v_category text := p_data->>'category';
  v_search text := left(trim(coalesce(p_data->>'query', '')),100);
  v_rows jsonb;
begin
  if v_actor is null or not coalesce(member_in('finance', p_kos), false) then
    raise exception 'Tidak punya akses keuangan';
  end if;
  if not exists(select 1 from acct_investment_simulations where id = p_version and kos_id = p_kos) then
    raise exception 'Versi investasi tidak ditemukan';
  end if;
  if p_action = 'start' then
    v_start := (p_data->>'month')::date;
    if v_start is null or extract(day from v_start) <> 1 or v_start > v_today then
      raise exception 'Bulan mulai tidak valid';
    end if;
    insert into acct_investment_tracking(version_id,kos_id,start_month)
    values(p_version,p_kos,v_start) on conflict(version_id) do nothing;
  end if;
  select start_month into v_start from acct_investment_tracking where version_id = p_version and kos_id = p_kos;
  if v_start is null then
    if p_action = 'read' then return null; end if;
    raise exception 'Tetapkan bulan mulai terlebih dahulu';
  end if;

  if p_action in ('link','unlink') then
    select * into v_entry from acct_entries where id = (p_data->>'entry_id')::uuid and kos_id = p_kos;
    if not found or v_entry.source_type is null or v_entry.source_id is null then raise exception 'Sumber jurnal tidak ditemukan'; end if;
    if p_action = 'link' then
      if v_category is null or v_category not in ('capital','operating') then raise exception 'Pilih kategori realisasi'; end if;
      if v_entry.entry_date < v_start or v_entry.entry_date > v_today or coalesce((
        select sum(l.debit-l.credit) from acct_lines l join acct_accounts a on a.id=l.account_id and a.kos_id=p_kos
        where l.entry_id=v_entry.id and l.kos_id=p_kos and a.sys_key in ('kas','bank')
      ),0)=0 then raise exception 'Pilih jurnal dengan mutasi Kas atau Bank dalam periode pelacakan'; end if;
      if exists (select 1 from acct_entries where kos_id=p_kos and source_type=v_entry.source_type and source_id=v_entry.source_id and entry_date<v_start) then
        raise exception 'Sumber transaksi ini tercatat sebelum bulan mulai';
      end if;
      insert into acct_investment_links(kos_id,source_type,source_id,version_id,category,created_by)
      values(p_kos,v_entry.source_type,v_entry.source_id,p_version,v_category,v_actor)
      on conflict (kos_id,source_type,source_id) do nothing;
      if not exists(select 1 from acct_investment_links where kos_id=p_kos and source_type=v_entry.source_type and source_id=v_entry.source_id
        and version_id=p_version and category=v_category) then raise exception 'Sumber ini sudah ditautkan. Lepas tautan lama untuk mengganti kategori'; end if;
    else
      delete from acct_investment_links where kos_id=p_kos and source_type=v_entry.source_type and source_id=v_entry.source_id and version_id=p_version;
    end if;
  elsif p_action not in ('read','start','candidates') then
    raise exception 'Tindakan realisasi tidak dikenal';
  end if;

  if p_action = 'candidates' then
    v_month := (p_data->>'month')::date;
    if v_month is null or extract(day from v_month)<>1 or v_month<v_start or v_month>v_today then raise exception 'Bulan pencarian tidak valid'; end if;
    select coalesce(jsonb_agg(to_jsonb(r) order by r.entry_date desc, r.number desc, r.id),'[]'::jsonb) into v_rows
    from (
      select e.id,e.number,e.entry_date,e.description,sum(l.debit-l.credit) amount
      from acct_entries e join acct_lines l on l.entry_id=e.id and l.kos_id=p_kos
      join acct_accounts a on a.id=l.account_id and a.kos_id=p_kos
      where e.kos_id=p_kos and e.entry_date>=v_month and e.entry_date<v_month+interval '1 month'
        and e.entry_date<=v_today and e.source_type is not null and e.source_id is not null and a.sys_key in ('kas','bank')
        and (v_search='' or strpos(lower(e.description || ' ' || e.number),lower(v_search))>0)
        and not exists(select 1 from acct_investment_links x where x.kos_id=p_kos and x.source_type=e.source_type and x.source_id=e.source_id)
      group by e.id having sum(l.debit-l.credit)<>0
      order by e.entry_date desc,e.number desc,e.id limit 50
    ) r;
    return v_rows;
  end if;

  -- Same source identity includes all posting corrections and reversals, without editing the ledger.
  select coalesce(jsonb_agg(to_jsonb(r) order by r.entry_date,r.number,r.id),'[]'::jsonb) into v_rows
  from (
    select e.id,e.number,e.entry_date,e.description,x.category,sum(l.debit-l.credit) amount
    from acct_investment_links x join acct_entries e on e.kos_id=x.kos_id and e.source_type=x.source_type and e.source_id=x.source_id
    join acct_lines l on l.entry_id=e.id and l.kos_id=p_kos
    join acct_accounts a on a.id=l.account_id and a.kos_id=p_kos
    where x.kos_id=p_kos and x.version_id=p_version and e.entry_date between v_start and v_today
      and a.sys_key in ('kas','bank')
    group by e.id,x.category having sum(l.debit-l.credit)<>0
  ) r;
  return jsonb_build_object('start_month',v_start,'as_of',v_today,'entries',v_rows);
end;
$$;
revoke execute on function public.acct_investment_actual(uuid,uuid,text,jsonb) from public,anon;
grant execute on function public.acct_investment_actual(uuid,uuid,text,jsonb) to authenticated;
