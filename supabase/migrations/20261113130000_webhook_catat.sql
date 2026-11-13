-- Webhook pembayaran, Tahap D (MODE CATAT SAJA):
-- notifikasi gateway yang BELUM diverifikasi hanya dicatat ke pay_events dengan status 'diabaikan' dan signature_ok = null.
-- Fungsi ini tidak menyentuh pay_transactions, plan_requests, maupun paket (kos). Tidak ada aktivasi.
-- Setelah format dan tanda tangan penyedia terverifikasi dari notifikasi nyata, adaptor baru memanggil pay_event_ingest
-- (satu-satunya jalur yang bisa mengaktifkan paket, dan hanya untuk kecocokan yang sah).
-- Dipanggil server (service role) dari /api/bayar/[provider]. Batas 500 catatan per penyedia per hari agar tidak bisa dibanjiri.

create or replace function public.pay_event_catat(p_provider text, p_event_key text, p_payload jsonb, p_headers jsonb)
returns text language plpgsql security definer set search_path = public as $$
declare pr pay_providers; ev pay_events; v_hari int;
begin
  select * into pr from pay_providers where code = p_provider;
  if pr.code is null or pr.kind <> 'gateway' then raise exception 'Penyedia pembayaran tidak dikenal'; end if;
  if coalesce(length(p_event_key), 0) < 6 then raise exception 'Kunci notifikasi tidak valid'; end if;

  select count(*) into v_hari from pay_events where provider = p_provider and received_at > now() - interval '1 day';
  if v_hari >= 500 then return 'batas'; end if;

  insert into pay_events(provider, event_key, signature_ok, payload, headers, status, note)
  values (p_provider, p_event_key, null, coalesce(p_payload, '{}'), p_headers, 'diabaikan',
          'Dicatat saja: belum diverifikasi, tidak mengaktifkan apa pun')
  on conflict (provider, event_key) do update set seen = pay_events.seen + 1
  returning * into ev;

  return case when ev.seen > 1 then 'duplikat' else 'dicatat' end;
end $$;

revoke execute on function public.pay_event_catat(text, text, jsonb, jsonb) from public, anon, authenticated;
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant execute on function public.pay_event_catat(text, text, jsonb, jsonb) to service_role;
  end if;
end $$;
