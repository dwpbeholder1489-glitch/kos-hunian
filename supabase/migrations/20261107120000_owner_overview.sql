-- Owner Overview (blueprint 21.3, 22.2, 22.3, 12.3): ringkasan lintas bisnis per periode dengan definisi metrik,
-- basis pencatatan, status kelengkapan, pengelompokan per badan usaha, hal yang perlu ditindaklanjuti, dan tautan ke sumber.
-- Bukan laporan konsolidasi formal: angka antar badan usaha tidak dieliminasi dan diberi label "ringkasan manajemen".

create or replace function public.owner_overview2(p_month date default null)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_today date := (now() at time zone 'Asia/Jakarta')::date;
  m0 date := date_trunc('month', coalesce(p_month, v_today))::date;
  m1 date := (date_trunc('month', coalesce(p_month, v_today)) + interval '1 month - 1 day')::date;
  v_rows jsonb := '[]';
  k record; r jsonb; v_led jsonb;
  v_rev numeric; v_ops numeric; v_cogs numeric; v_recv numeric; v_pay numeric; v_kas numeric; v_bank numeric;
  v_flags jsonb; v_att jsonb; v_last timestamptz;
begin
  if auth.uid() is null then raise exception 'Harus login'; end if;
  for k in
    select kk.*, km.role, le.name as le_name, le.kind as le_kind
    from kos kk join kos_members km on km.kos_id = kk.id and km.user_id = auth.uid() and km.active
    left join legal_entities le on le.id = kk.legal_entity_id
    where kk.suspended_at is null
    order by kk.created_at
  loop
    if not member_in('finance', k.id) then
      v_rows := v_rows || jsonb_build_array(jsonb_build_object('id', k.id, 'name', k.name, 'business_type', k.business_type, 'role', k.role, 'access', false));
      continue;
    end if;
    v_flags := '[]'; v_att := '[]';
    if k.business_type = 'retail' then
      v_rev := coalesce((select sum(total) from sales where kos_id = k.id and status = 'selesai' and sale_date between m0 and m1), 0)
             - coalesce((select sum(total) from sale_returns where kos_id = k.id and return_date between m0 and m1), 0)
             + coalesce((select sum(amount) from cash_entries where kos_id = k.id and kind = 'pendapatan_lain' and date between m0 and m1), 0);
      v_cogs := coalesce((select sum(cost_total) from sales where kos_id = k.id and status = 'selesai' and sale_date between m0 and m1), 0)
              - coalesce((select sum(cost_total) from sale_returns where kos_id = k.id and return_date between m0 and m1), 0);
      v_ops := coalesce((select sum(amount) from expenses where kos_id = k.id and kind = 'operasional' and date between m0 and m1), 0);
      v_led := retail_ledger(k.id);
      v_kas := (v_led ->> 'kas')::numeric; v_bank := (v_led ->> 'bank')::numeric;
      v_recv := coalesce((select sum((x ->> 'sisa')::numeric) from jsonb_array_elements(v_led -> 'kasbon') x), 0);
      v_pay := coalesce((select sum((x ->> 'sisa')::numeric) from jsonb_array_elements(v_led -> 'utang') x), 0);
      if exists (select 1 from sale_lines l join sales s on s.id = l.sale_id where s.kos_id = k.id and s.status = 'selesai' and s.sale_date between m0 and m1 and l.cost = 0) then
        v_flags := v_flags || '["Ada barang terjual tanpa harga modal — laba masih perkiraan"]';
      end if;
      if exists (select 1 from cash_shifts where kos_id = k.id and closed_at is null and opened_at < now() - interval '24 hours') then
        v_flags := v_flags || '["Ada shift kasir terbuka lebih dari 24 jam"]';
      end if;
      v_att := v_att
        || coalesce((select jsonb_agg(jsonb_build_object('text', n || ' barang stok menipis/habis', 'href', '/pengingat', 'tone', 'gold')) from (select count(*) n from products where kos_id = k.id and active and min_stock > 0 and stock <= min_stock) z where n > 0), '[]')
        || coalesce((select jsonb_agg(jsonb_build_object('text', n || ' kasbon jatuh tempo', 'href', '/kas', 'tone', 'bad')) from (
             select count(*) n from jsonb_array_elements(v_led -> 'kasbon') x where (x ->> 'due') is not null and (x ->> 'due')::date <= v_today) z where n > 0), '[]')
        || coalesce((select jsonb_agg(jsonb_build_object('text', n || ' utang supplier jatuh tempo', 'href', '/kas', 'tone', 'bad')) from (
             select count(*) n from jsonb_array_elements(v_led -> 'utang') x where (x ->> 'due') is not null and (x ->> 'due')::date <= v_today) z where n > 0), '[]')
        || coalesce((select jsonb_agg(jsonb_build_object('text', n || ' pesanan belum datang (lewat perkiraan)', 'href', '/belanja', 'tone', 'gold')) from (
             select count(*) n from purchases where kos_id = k.id and status in ('dipesan', 'sebagian') and expected_date < v_today) z where n > 0), '[]');
      v_last := greatest((select max(sold_at) from sales where kos_id = k.id), (select max(created_at) from purchases where kos_id = k.id), (select max(created_at) from expenses where kos_id = k.id));
    else
      v_rev := coalesce((select sum(amount) from payments where kos_id = k.id and status = 'terverifikasi' and paid_at between m0 and m1), 0)
             + coalesce((select sum(amount) from cash_entries where kos_id = k.id and kind = 'pendapatan_lain' and date between m0 and m1), 0);
      v_cogs := 0;
      v_ops := coalesce((select sum(amount) from expenses where kos_id = k.id and kind = 'operasional' and date between m0 and m1), 0);
      v_recv := coalesce((select sum(outstanding) from invoice_summary where kos_id = k.id and status <> 'batal' and outstanding > 0 and due_date <= v_today), 0);
      v_pay := null; v_kas := null; v_bank := null;
      if exists (select 1 from payments where kos_id = k.id and status = 'menunggu' and paid_at between m0 and m1) then
        v_flags := v_flags || '["Ada pembayaran menunggu verifikasi — pendapatan belum final"]';
      end if;
      v_att := v_att
        || coalesce((select jsonb_agg(jsonb_build_object('text', n || ' tagihan telat', 'href', '/tagihan', 'tone', 'bad')) from (select count(*) n from invoice_summary where kos_id = k.id and overdue) z where n > 0), '[]')
        || coalesce((select jsonb_agg(jsonb_build_object('text', n || ' pembayaran menunggu diperiksa', 'href', '/pembayaran', 'tone', 'gold')) from (select count(*) n from payments where kos_id = k.id and status = 'menunggu') z where n > 0), '[]')
        || coalesce((select jsonb_agg(jsonb_build_object('text', n || ' tagihan jatuh tempo hari ini', 'href', '/tagihan', 'tone', 'gold')) from (select count(*) n from invoice_summary where kos_id = k.id and status <> 'batal' and outstanding > 0 and due_date = v_today) z where n > 0), '[]');
      v_last := greatest((select max(created_at) from payments where kos_id = k.id), (select max(created_at) from expenses where kos_id = k.id));
    end if;
    -- hal umum: persetujuan konfigurasi & langganan
    v_att := v_att
      || coalesce((select jsonb_agg(jsonb_build_object('text', n || ' permintaan konfigurasi menunggu persetujuan', 'href', '/konfigurasi', 'tone', 'gold')) from (select count(*) n from config_requests where kos_id = k.id and status = 'menunggu') z where n > 0 and member_can(k.id, 'team')), '[]');
    if member_can(k.id, 'team') and k.paid_until is not null and kos_plan(k.id) <> free_plan() and coalesce(k.next_until, k.paid_until) between v_today and v_today + 7 and not k.cancel_at_end then
      v_att := v_att || jsonb_build_array(jsonb_build_object('text', 'Paket berakhir ' || to_char(coalesce(k.next_until, k.paid_until), 'DD-MM-YYYY'), 'href', '/langganan', 'tone', 'gold'));
    end if;

    r := jsonb_build_object(
      'id', k.id, 'name', k.name, 'business_type', k.business_type, 'role', k.role, 'access', true,
      'legal_entity', case when k.legal_entity_id is null then null else jsonb_build_object('id', k.legal_entity_id, 'name', k.le_name, 'kind', k.le_kind) end,
      'plan', kos_plan(k.id), 'plan_name', (select name from plans where key = kos_plan(k.id)),
      'basis', case when k.business_type = 'retail' then 'penjualan' else 'kas' end,
      'revenue', v_rev, 'cogs', v_cogs, 'ops', v_ops, 'profit', v_rev - v_cogs - v_ops,
      'receivables', v_recv, 'payables', v_pay, 'cash', v_kas, 'bank', v_bank,
      'flags', v_flags, 'complete', jsonb_array_length(v_flags) = 0, 'attention', v_att, 'last_activity', v_last,
      'occupied', case when k.business_type = 'properti' then (select count(*) from leases where kos_id = k.id and status = 'aktif') end,
      'rooms', case when k.business_type = 'properti' then (select count(*) from rooms where kos_id = k.id and status <> 'tidak_disewakan') end);
    v_rows := v_rows || jsonb_build_array(r);
  end loop;

  return jsonb_build_object(
    'from', m0, 'to', m1, 'generated_at', now(), 'businesses', v_rows,
    'activity', (select coalesce(jsonb_agg(a order by a.created_at desc), '[]') from (
        select h.kos_id, kk.name as business, h.action, h.target, h.actor, h.created_at from config_history h join kos kk on kk.id = h.kos_id
        where member_can(h.kos_id, 'settings') order by h.created_at desc limit 8) a));
end $$;

revoke execute on function public.owner_overview2(date) from public, anon;
grant execute on function public.owner_overview2(date) to authenticated;
