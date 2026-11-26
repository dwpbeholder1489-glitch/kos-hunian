create table public.acct_monthly_drafts (
  id uuid primary key default gen_random_uuid(),
  kos_id uuid not null references public.kos(id) on delete cascade,
  month date not null,
  version integer not null check (version > 0),
  status text not null default 'draft' check (status in ('draft', 'review', 'approved')),
  snapshot jsonb not null,
  created_at timestamptz not null default now(),
  created_by uuid not null,
  submitted_at timestamptz,
  submitted_by uuid,
  approved_at timestamptz,
  approved_by uuid,
  unique (kos_id, month, version)
);

alter table public.acct_monthly_drafts enable row level security;
revoke all on public.acct_monthly_drafts from public, anon, authenticated;

create function public.acct_monthly_draft(
  p_kos uuid, p_month date, p_action text, p_id uuid default null
)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_actor uuid := auth.uid();
  v_end date;
  v_prior date;
  v_report jsonb;
  v_cash jsonb;
  v_prior_report jsonb;
  v_row acct_monthly_drafts%rowtype;
  v_closed_at timestamptz;
begin
  if v_actor is null or not coalesce(member_in('finance', p_kos), false) then
    raise exception 'Tidak punya akses keuangan';
  end if;
  if p_month is null or extract(day from p_month) <> 1 or p_month > (now() at time zone 'Asia/Jakarta')::date then
    raise exception 'Periode laporan tidak valid';
  end if;

  if p_action = 'list' then
    return coalesce((select jsonb_agg(to_jsonb(d) - 'snapshot' - 'created_by' - 'submitted_by' - 'approved_by' order by d.version desc)
      from acct_monthly_drafts d where d.kos_id = p_kos and d.month = p_month), '[]'::jsonb);
  end if;

  if p_action = 'create' then
    perform pg_advisory_xact_lock(hashtextextended('acct_monthly_draft:' || p_kos::text || ':' || p_month::text, 0));
    v_end := (p_month + interval '1 month - 1 day')::date;
    v_prior := (p_month - interval '1 month')::date;
    select closed_at into v_closed_at from acct_periods where kos_id = p_kos and month = p_month for share;
    v_report := acct_report(p_kos, false, p_month, v_end);
    v_cash := acct_cashflow(p_kos, p_month, v_end);
    v_prior_report := acct_report(p_kos, false, v_prior, p_month - 1);
    insert into acct_monthly_drafts(kos_id, month, version, snapshot, created_by)
    select p_kos, p_month, coalesce(max(version), 0) + 1,
      jsonb_build_object('report', v_report, 'cash', v_cash, 'previous', v_prior_report, 'closed_at', v_closed_at), v_actor
    from acct_monthly_drafts where kos_id = p_kos and month = p_month
    returning * into v_row;
  elsif p_action in ('read', 'submit', 'approve') then
    select * into v_row from acct_monthly_drafts
    where id = p_id and kos_id = p_kos and month = p_month for update;
    if not found then raise exception 'Laporan tidak ditemukan'; end if;
    if coalesce((v_row.snapshot->'cash'->>'lengkap')::boolean, false)
       and not coalesce(plan_has(p_kos, 'laporan_lanjutan'), false) then
      raise exception 'Rincian snapshot membutuhkan akses laporan lanjutan';
    end if;
    if p_action = 'submit' then
      if v_row.status = 'draft' then
        update acct_monthly_drafts set status = 'review', submitted_at = now(), submitted_by = v_actor
        where id = v_row.id returning * into v_row;
      elsif v_row.status <> 'review' then raise exception 'Hanya draf yang dapat diajukan';
      end if;
    elsif p_action = 'approve' then
      if not coalesce(member_in('team', p_kos), false) then raise exception 'Hanya pemilik yang dapat menyetujui'; end if;
      if v_row.status = 'review' then
        select closed_at into v_closed_at from acct_periods where kos_id = p_kos and month = p_month for share;
        if v_closed_at is null or v_closed_at is distinct from (v_row.snapshot->>'closed_at')::timestamptz
           or not coalesce((v_row.snapshot->'report'->'checks'->>'balanced')::boolean, false)
           or not coalesce((v_row.snapshot->'cash'->>'cocok')::boolean, false)
           or exists (select 1 from jsonb_each(coalesce(v_row.snapshot->'report'->'checks', '{}'::jsonb)) as item where key in ('no_cost_sales', 'pending_payments') and value::text::numeric > 0) then
          raise exception 'Setujui snapshot dari periode yang sudah ditutup dan lolos pemeriksaan pembukuan';
        end if;
        update acct_monthly_drafts set status = 'approved', approved_at = now(), approved_by = v_actor
        where id = v_row.id returning * into v_row;
      elsif v_row.status <> 'approved' then raise exception 'Ajukan draf untuk peninjauan terlebih dahulu';
      end if;
    end if;
  else raise exception 'Tindakan laporan tidak dikenal';
  end if;
  return to_jsonb(v_row) - 'created_by' - 'submitted_by' - 'approved_by';
end;
$$;

revoke execute on function public.acct_monthly_draft(uuid, date, text, uuid) from public, anon;
grant execute on function public.acct_monthly_draft(uuid, date, text, uuid) to authenticated;
