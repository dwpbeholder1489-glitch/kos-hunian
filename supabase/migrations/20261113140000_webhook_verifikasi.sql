-- Webhook pembayaran, Tahap D (verifikasi tanda tangan, TETAP TANPA AKTIVASI):
-- rumus resmi Lynk: X-Lynk-Signature = sha256(amount + refId + message_id + merchant_key), hex.
-- Server memverifikasi lalu memanggil fungsi ini:
--   tanda tangan cocok   → status 'diterima' (tersimpan, BELUM diproses; aktivasi hanya lewat pay_event_ingest setelah uji transaksi nyata)
--   tanda tangan tidak cocok → status 'ditolak' + antrean rekonsiliasi (reason 'tanda_tangan')
--   belum bisa diverifikasi (kunci belum dipasang) → status 'diabaikan' (seperti sebelumnya)
-- Tidak menyentuh pay_transactions, plan_requests, maupun paket (kos).

drop function if exists public.pay_event_catat(text, text, jsonb, jsonb);

create or replace function public.pay_event_catat(p_provider text, p_event_key text, p_payload jsonb, p_headers jsonb,
  p_signature_ok boolean default null, p_norm jsonb default null)
returns text language plpgsql security definer set search_path = public as $$
declare pr pay_providers; ev pay_events; v_hari int;
begin
  select * into pr from pay_providers where code = p_provider;
  if pr.code is null or pr.kind <> 'gateway' then raise exception 'Penyedia pembayaran tidak dikenal'; end if;
  if coalesce(length(p_event_key), 0) < 6 then raise exception 'Kunci notifikasi tidak valid'; end if;

  select count(*) into v_hari from pay_events where provider = p_provider and received_at > now() - interval '1 day';
  if v_hari >= 500 then return 'batas'; end if;

  insert into pay_events(provider, event_key, signature_ok, payload, headers, norm, status, note)
  values (p_provider, p_event_key, p_signature_ok, coalesce(p_payload, '{}'), p_headers, p_norm,
          case when p_signature_ok is true then 'diterima' when p_signature_ok is false then 'ditolak' else 'diabaikan' end,
          case when p_signature_ok is true then 'Tanda tangan cocok; belum diproses (aktivasi menunggu uji transaksi nyata)'
               when p_signature_ok is false then 'Tanda tangan tidak cocok; tidak diproses'
               else 'Dicatat saja: belum diverifikasi, tidak mengaktifkan apa pun' end)
  on conflict (provider, event_key) do update set seen = pay_events.seen + 1
  returning * into ev;

  if ev.seen = 1 and p_signature_ok is false then
    insert into pay_recon(event_id, reason, detail) values (ev.id, 'tanda_tangan', p_norm);
  end if;

  return case when ev.seen > 1 then 'duplikat' else 'dicatat' end;
end $$;

revoke execute on function public.pay_event_catat(text, text, jsonb, jsonb, boolean, jsonb) from public, anon, authenticated;
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant execute on function public.pay_event_catat(text, text, jsonb, jsonb, boolean, jsonb) to service_role;
  end if;
end $$;
