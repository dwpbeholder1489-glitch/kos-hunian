-- Make gateway retries recoverable and take the existing sales lock before reading a transaction ID.

create function public._prasara_patch(p_sig text, p_old text, p_new text)
returns void language plpgsql as $$
declare v_def text;
begin
  v_def := pg_get_functiondef(p_sig::regprocedure);
  if position(p_old in v_def) = 0 then
    raise exception 'Patch % tidak menemukan teks: %', p_sig, left(p_old, 80);
  end if;
  execute replace(v_def, p_old, p_new);
end $$;

select public._prasara_patch('public.pay_event_ingest(text,text,boolean,jsonb,jsonb,jsonb)',
$o$  on conflict (provider, event_key) do nothing returning * into ev;$o$,
$n$  on conflict (provider, event_key) do update
  set signature_ok = excluded.signature_ok, payload = excluded.payload,
      headers = excluded.headers, norm = excluded.norm, seen = pay_events.seen + 1
  where pay_events.signature_ok is not true and excluded.signature_ok is true
  returning * into ev;$n$);

-- Without a checkout reference, only consider invoices explicitly opened for this provider.
select public._prasara_patch('public.pay_event_ingest(text,text,boolean,jsonb,jsonb,jsonb)',
$o$        or (v_code is null and v_email is not null and exists$o$,
$n$        or (v_code is null and pt.provider = p_provider and pt.method = 'gateway'
          and v_email is not null and exists$n$);

-- Serialize notifications carrying the same provider reference before looking for a payment.
select public._prasara_patch('public.pay_event_ingest(text,text,boolean,jsonb,jsonb,jsonb)',
$o$  if v_ref is not null and exists$o$,
$n$  if v_ref is not null then
    perform pg_advisory_xact_lock(hashtextextended('payment:' || p_provider || ':' || v_ref, 0));
  end if;
  if v_ref is not null and exists$n$);

-- Lock the invoice first (the same order as confirmation and cancellation).
select public._prasara_patch('public.pay_event_ingest(text,text,boolean,jsonb,jsonb,jsonb)',
$o$  select * into t from pay_transactions where invoice_id = v_inv and status in ('pending', 'processing') order by created_at desc limit 1 for update;$o$,
$n$  perform 1 from plan_requests where id = v_inv and status = 'menunggu' for update;
  if found then
    select * into t from pay_transactions
    where invoice_id = v_inv and status in ('pending', 'processing')
      and ((v_code is not null and code = v_code)
        or (v_code is null and provider = p_provider and method = 'gateway'))
    order by created_at desc limit 1 for update;
  end if;
  if t.id is null then
    update pay_events set status = 'tidak_cocok', note = 'Tagihan sudah berubah saat diproses', processed_at = now() where id = ev.id;
    insert into pay_recon(event_id, reason, detail) values (ev.id, 'tidak_ada_tagihan', p_norm);
    return jsonb_build_object('status', 'tidak_cocok', 'event', ev.id, 'calon', 0);
  end if;$n$);

-- Clear the old signature review once this same event has been verified.
select public._prasara_patch('public.pay_event_ingest(text,text,boolean,jsonb,jsonb,jsonb)',
$o$  if coalesce((p_norm->>'paid')::boolean, false) is not true then$o$,
$n$  update pay_recon set status = 'diabaikan', resolved_at = now(), resolved_by = 'sistem',
    resolution = 'Tanda tangan terverifikasi pada pengiriman ulang'
  where event_id = ev.id and reason = 'tanda_tangan' and status = 'terbuka';
  if coalesce((p_norm->>'paid')::boolean, false) is not true then$n$);

select public._prasara_patch('public.pos_offline_submit(uuid,jsonb)',
$o$  -- Kiriman ulang → hasil yang sama$o$,
$n$  perform pg_advisory_xact_lock(hashtext('sale:' || p_kos::text));
  -- Kiriman ulang → hasil yang sama$n$);

select public._prasara_patch('public.sale_create(uuid,uuid,text,jsonb,numeric,text,numeric,uuid,date,text,jsonb)',
$o$  perform pg_advisory_xact_lock(hashtext('sale:' || p_kos::text));
  select count(*)$o$,
$n$  select count(*)$n$);
select public._prasara_patch('public.sale_create(uuid,uuid,text,jsonb,numeric,text,numeric,uuid,date,text,jsonb)',
$o$  select * into v_existing from sales where id = p_id;$o$,
$n$  perform pg_advisory_xact_lock(hashtext('sale:' || p_kos::text));
  select * into v_existing from sales where id = p_id;$n$);

-- The override path writes before calling sale_create. Keep its lock order consistent.
select public._prasara_patch('public.sale_create_ov(uuid,uuid,text,jsonb,numeric,text,numeric,uuid,date,text,jsonb,text)',
$o$    insert into discount_overrides(sale_id, kos_id, reason, by_email, at)$o$,
$n$    perform pg_advisory_xact_lock(hashtext('sale:' || p_kos::text));
    insert into discount_overrides(sale_id, kos_id, reason, by_email, at)$n$);

drop function public._prasara_patch(text,text,text);
