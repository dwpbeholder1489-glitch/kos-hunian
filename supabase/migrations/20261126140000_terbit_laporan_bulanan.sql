alter table public.acct_monthly_drafts
  add column published_at timestamptz,
  add constraint acct_monthly_drafts_publish_approved check (published_at is null or status = 'approved');

create function public.acct_monthly_publish(p_kos uuid, p_month date, p_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_report jsonb;
  v_closed_at timestamptz;
begin
  if auth.uid() is null or not coalesce(member_in('team', p_kos), false) then
    raise exception 'Hanya pemilik yang dapat menerbitkan laporan';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('acct_monthly_draft:' || p_kos::text || ':' || p_month::text, 0));
  -- Reuse the finance, scope, and plan checks and lock the requested version.
  v_report := acct_monthly_draft(p_kos, p_month, 'read', p_id);
  if v_report->>'published_at' is not null then return v_report; end if;
  if v_report->>'status' <> 'approved' then
    raise exception 'Setujui laporan sebelum menerbitkannya';
  end if;
  select closed_at into v_closed_at from acct_periods
    where kos_id = p_kos and month = p_month for share;
  if v_closed_at is null or v_closed_at is distinct from (v_report->'snapshot'->>'closed_at')::timestamptz then
    raise exception 'Status tutup buku berubah. Buat dan setujui versi baru sebelum menerbitkan laporan';
  end if;
  if exists (
    select 1 from acct_monthly_drafts where kos_id = p_kos and month = p_month
      and version > (v_report->>'version')::integer and published_at is not null
  ) then raise exception 'Versi final yang lebih baru sudah diterbitkan'; end if;
  update acct_monthly_drafts set published_at = now() where id = p_id;
  return acct_monthly_draft(p_kos, p_month, 'read', p_id);
end;
$$;

revoke execute on function public.acct_monthly_publish(uuid, date, uuid) from public, anon;
grant execute on function public.acct_monthly_publish(uuid, date, uuid) to authenticated;
