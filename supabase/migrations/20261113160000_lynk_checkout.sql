-- Pembayaran lewat Lynk dari menu Langganan.
--   plan_pay_link : link checkout Lynk untuk paket & durasi, HANYA bila aktif dan nominalnya persis = total tagihan saat ini.
--   request_plan  : menerima metode 'gateway' (Lynk). Tagihan dibuat sebagai transaksi provider 'lynk' (pending),
--                   sehingga notifikasi Lynk yang cocok (email pemilik + nominal + tepat satu tagihan) diaktifkan oleh pay_event_ingest.
-- Metode qris & transfer tidak berubah.

create or replace function public.plan_pay_link(p_kos uuid, p_plan text, p_months integer)
returns text language plpgsql stable security definer set search_path = public as $$
declare v_total numeric; v_url text;
begin
  if not member_in('team', p_kos) then return null; end if;
  if p_months not in (1, 3, 6, 12) then return null; end if;
  if not exists (select 1 from plans where key = p_plan and not is_free and active) then return null; end if;
  v_total := plan_total(p_kos, p_plan, p_months);
  select l.url into v_url from pay_links l join pay_providers pr on pr.code = l.provider
  where l.provider = 'lynk' and pr.active and l.active and l.plan_key = p_plan and l.months = p_months and l.amount = v_total;
  return v_url;
end $$;

create or replace function public.request_plan(p_kos uuid, p_plan text, p_months integer, p_method text, p_note text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid; pl plans; k kos; v_unit numeric; v_total numeric; v_kind text; v_today date := (now() at time zone 'Asia/Jakarta')::date; v_seq int; v_no text;
        v_method text := coalesce(p_method, 'qris'); v_term boolean;
begin
  if not member_in('team', p_kos) then raise exception 'Khusus pemilik bisnis'; end if;
  select * into pl from plans where key = p_plan;
  if pl.key is null or pl.is_free or not pl.active then raise exception 'Paket tidak tersedia'; end if;
  if p_months not in (1, 3, 6, 12) then raise exception 'Durasi tidak valid'; end if;
  if v_method not in ('qris', 'transfer', 'gateway') then raise exception 'Metode pembayaran belum tersedia'; end if;
  if v_method = 'gateway' and plan_pay_link(p_kos, p_plan, p_months) is null then
    raise exception 'Pembayaran Lynk untuk pilihan ini belum tersedia. Pilih QRIS atau transfer.'; end if;
  if exists (select 1 from plan_requests where kos_id = p_kos and status = 'menunggu') then
    raise exception 'Masih ada tagihan yang menunggu diperiksa. Batalkan dulu bila ingin mengganti paket.'; end if;
  perform plan_roll(p_kos);
  select * into k from kos where id = p_kos;
  v_unit := plan_unit_price(p_kos, p_plan);
  v_total := plan_total(p_kos, p_plan, p_months);                 -- snapshot harga saat tagihan dibuat
  v_term := exists (select 1 from plan_terms where plan_key = p_plan and months = p_months and active);
  v_kind := case when k.paid_until is null or k.paid_until < v_today or k.plan = free_plan() then 'baru'
                 when k.plan = p_plan then 'perpanjang'
                 when v_unit >= coalesce((select price from plan_versions where id = k.plan_version_id), (plan_current(k.plan)).price) then 'upgrade'
                 else 'downgrade' end;
  perform pg_advisory_xact_lock(hashtext('invoice'));
  select count(*) + 1 into v_seq from plan_requests where number like 'INV-' || to_char(v_today, 'YYMM') || '-%';
  v_no := 'INV-' || to_char(v_today, 'YYMM') || '-' || lpad(v_seq::text, 4, '0');
  insert into plan_requests(kos_id, user_id, plan, months, amount, method, note, number, version_id, unit_price, kind)
  values (p_kos, auth.uid(), p_plan, p_months, v_total, v_method, nullif(trim(p_note), ''), v_no,
          case when v_unit = (plan_current(p_plan)).price or v_term then (plan_current(p_plan)).id else coalesce(k.plan_version_id, (plan_current(p_plan)).id) end,
          round(v_total / p_months, 2), v_kind)
  returning id into v_id;
  insert into pay_transactions(code, invoice_id, kos_id, provider, method, amount, payer_email)
  values (trx_code(), v_id, p_kos, case when v_method = 'gateway' then 'lynk' else 'manual' end, v_method, v_total, actor_email());
  update kos set cancel_at_end = false where id = p_kos;
  return v_id;
end $$;
