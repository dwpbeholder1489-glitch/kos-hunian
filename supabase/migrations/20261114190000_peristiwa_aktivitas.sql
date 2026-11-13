-- Domain events + riwayat aktivitas (Master Prompt Modul V2.0 Bab 8, 49 "Activity History", 51 audit).
-- • domain_events = OUTBOX transaksional: ditulis trigger di transaksi yang SAMA dengan perubahan sumbernya (atomik:
--   bila transaksi gagal, peristiwanya ikut batal). Tidak dipakai untuk memproses hal yang harus konsisten.
-- • Idempoten: idempotency_key unik (jenis:dokumen:keadaan) → peristiwa yang sama tidak tercatat dua kali.
-- • Setiap peristiwa: event_id, event_type, kos_id (tenant), aggregate, occurred_at, event_version, correlation_id
--   (sama untuk satu transaksi database), actor_id, payload ringkas tanpa data pribadi berlebih, area izin baca.
-- • processed_at/attempts/last_error disiapkan untuk penangan (integrasi, notifikasi) berikutnya.
-- • Pemeriksaan kelengkapan (event_reconcile) untuk Management Center: dokumen tanpa peristiwa = trigger bermasalah.
-- Riwayat dimulai sejak migrasi ini dipasang (data lama tidak dibuat ulang).

create table if not exists public.domain_events (
  id bigserial primary key,
  event_id uuid not null default gen_random_uuid() unique,
  kos_id uuid not null references public.kos(id) on delete cascade,
  event_type text not null,
  aggregate_type text not null,
  aggregate_id uuid not null,
  event_version int not null default 1,
  occurred_at timestamptz not null default now(),
  correlation_id uuid not null,
  idempotency_key text not null unique,
  actor_id uuid,
  area text not null,                       -- area izin untuk membaca (sell/stock/finance/rent/ops)
  summary text not null,
  amount numeric(14,2),
  payload jsonb not null default '{}',
  processed_at timestamptz,
  attempts int not null default 0,
  last_error text
);
create index if not exists domain_events_kos on public.domain_events(kos_id, occurred_at desc);
create index if not exists domain_events_agg on public.domain_events(aggregate_type, aggregate_id);
alter table public.domain_events enable row level security;   -- tanpa policy: dibaca lewat RPC yang memeriksa area
drop trigger if exists zz_kos_open_guard on public.domain_events;
create trigger zz_kos_open_guard before insert or update or delete on public.domain_events for each row execute function public.kos_open_guard();

create or replace function public.dom_emit(p_kos uuid, p_type text, p_agg_type text, p_agg_id uuid, p_key text, p_area text,
                                           p_summary text, p_amount numeric, p_payload jsonb)
returns void language plpgsql security definer set search_path = public as $$
begin
  insert into domain_events(kos_id, event_type, aggregate_type, aggregate_id, correlation_id, idempotency_key, actor_id, area, summary, amount, payload)
  values (p_kos, p_type, p_agg_type, p_agg_id, md5('tx' || txid_current()::text)::uuid, p_type || ':' || p_key, auth.uid(), p_area,
          left(p_summary, 200), p_amount, coalesce(p_payload, '{}'))
  on conflict (idempotency_key) do nothing;
end $$;
revoke execute on function public.dom_emit(uuid, text, text, uuid, text, text, text, numeric, jsonb) from public, anon, authenticated;

create or replace function public.dom_rp(n numeric) returns text language sql immutable as $$
  select 'Rp ' || replace(to_char(coalesce(n, 0), 'FM999,999,999,990'), ',', '.');
$$;

-- ---------- Penjualan & retur (toko) ----------
create or replace function public.dom_sales() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' and new.status = 'selesai' then
    perform dom_emit(new.kos_id, 'SaleCreated', 'sale', new.id, new.id::text, 'sell', 'Penjualan ' || new.number || ' · ' || dom_rp(new.total) || ' · ' || new.pay_method,
      new.total, jsonb_build_object('number', new.number, 'pay_method', new.pay_method, 'branch_id', new.branch_id));
  elsif tg_op = 'UPDATE' and new.status = 'batal' and old.status <> 'batal' then
    perform dom_emit(new.kos_id, 'SaleVoided', 'sale', new.id, new.id::text, 'sell', 'Penjualan ' || new.number || ' dibatalkan' || coalesce(' · ' || new.void_reason, ''),
      new.total, jsonb_build_object('number', new.number));
  end if;
  return null;
end $$;
drop trigger if exists dom_sales on public.sales;
create trigger dom_sales after insert or update of status on public.sales for each row execute function public.dom_sales();

create or replace function public.dom_sale_returns() returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform dom_emit(new.kos_id, 'SaleReturned', 'sale', new.sale_id, new.id::text, 'sell',
    'Retur ' || new.number || ' dari ' || coalesce((select number from sales where id = new.sale_id), '-') || ' · ' || dom_rp(new.total),
    new.total, jsonb_build_object('return_id', new.id, 'number', new.number, 'refund', new.refund_method));
  return null;
end $$;
drop trigger if exists dom_sale_returns on public.sale_returns;
create trigger dom_sale_returns after insert on public.sale_returns for each row execute function public.dom_sale_returns();

-- ---------- Belanja ----------
create or replace function public.dom_purchases() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    perform dom_emit(new.kos_id, case when new.status = 'dipesan' then 'PurchaseOrdered' else 'GoodsReceived' end, 'purchase', new.id, new.id::text || ':' || new.status, 'stock',
      case when new.status = 'dipesan' then 'Pesanan ke supplier ' else 'Belanja diterima ' end || new.number || ' · ' || dom_rp(greatest(new.total, coalesce(new.order_total, 0))),
      greatest(new.total, coalesce(new.order_total, 0)), jsonb_build_object('number', new.number, 'status', new.status));
  elsif new.status is distinct from old.status then
    perform dom_emit(new.kos_id, case when new.status = 'batal' then 'PurchaseVoided' else 'GoodsReceived' end, 'purchase', new.id, new.id::text || ':' || new.status, 'stock',
      case new.status when 'batal' then 'Belanja ' || new.number || ' dibatalkan' when 'sebagian' then 'Barang diterima sebagian · ' || new.number
        else 'Barang diterima lengkap · ' || new.number end || ' · ' || dom_rp(new.total),
      new.total, jsonb_build_object('number', new.number, 'status', new.status));
  end if;
  return null;
end $$;
drop trigger if exists dom_purchases on public.purchases;
create trigger dom_purchases after insert or update of status on public.purchases for each row execute function public.dom_purchases();

-- ---------- Stok: penyesuaian & mutasi ----------
create or replace function public.dom_stock_moves() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.kind in ('opname', 'rusak', 'kedaluwarsa', 'koreksi') then
    perform dom_emit(new.kos_id, 'InventoryAdjusted', 'product', new.product_id, new.id::text, 'stock',
      'Stok ' || coalesce((select name from products where id = new.product_id), '-') || ' ' || new.kind || ' ' ||
        case when new.delta > 0 then '+' else '' end || trim(to_char(new.delta, 'FM999999990.###')) || ' → ' || trim(to_char(new.stock_after, 'FM999999990.###')),
      abs(new.value), jsonb_build_object('kind', new.kind, 'delta', new.delta, 'note', new.note));
  end if;
  return null;
end $$;
drop trigger if exists dom_stock_moves on public.stock_moves;
create trigger dom_stock_moves after insert on public.stock_moves for each row execute function public.dom_stock_moves();

create or replace function public.dom_stock_transfers() returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform dom_emit(new.kos_id, 'StockTransferred', 'stock_transfer', new.id, new.id::text, 'stock',
    'Mutasi ' || new.number || ' · ' || coalesce((select name from branches where id = new.from_branch), '-') || ' → ' || coalesce((select name from branches where id = new.to_branch), '-'),
    null, jsonb_build_object('number', new.number, 'lines', jsonb_array_length(coalesce(new.lines, '[]'))));
  return null;
end $$;
drop trigger if exists dom_stock_transfers on public.stock_transfers;
create trigger dom_stock_transfers after insert on public.stock_transfers for each row execute function public.dom_stock_transfers();

-- ---------- Uang: pengeluaran & pelunasan ----------
create or replace function public.dom_expenses() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    perform dom_emit(new.kos_id, 'ExpenseRecorded', 'expense', new.id, new.id::text, 'finance',
      'Pengeluaran ' || coalesce((select name from expense_categories where id = new.category_id), 'lainnya') || ' · ' || dom_rp(new.amount), new.amount,
      jsonb_build_object('kind', new.kind, 'date', new.date));
  elsif tg_op = 'DELETE' then
    perform dom_emit(old.kos_id, 'ExpenseDeleted', 'expense', old.id, old.id::text, 'finance', 'Pengeluaran dihapus · ' || dom_rp(old.amount), old.amount, jsonb_build_object('date', old.date));
  end if;
  return null;
end $$;
drop trigger if exists dom_expenses on public.expenses;
create trigger dom_expenses after insert or delete on public.expenses for each row execute function public.dom_expenses();

create or replace function public.dom_debt_payments() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' and new.status = 'selesai' then
    perform dom_emit(new.kos_id, case when new.kind = 'piutang' then 'ReceivableCollected' else 'PayablePaid' end, 'contact', new.contact_id, new.id::text, 'finance',
      case when new.kind = 'piutang' then 'Pelunasan kasbon ' else 'Bayar utang ' end || coalesce((select name from contacts where id = new.contact_id), '-') || ' · ' || dom_rp(new.amount),
      new.amount, jsonb_build_object('payment_id', new.id, 'kind', new.kind));
  elsif tg_op = 'UPDATE' and new.status = 'batal' and old.status <> 'batal' then
    perform dom_emit(new.kos_id, 'DebtPaymentVoided', 'contact', new.contact_id, new.id::text, 'finance',
      'Pelunasan dibatalkan · ' || dom_rp(new.amount), new.amount, jsonb_build_object('payment_id', new.id));
  end if;
  return null;
end $$;
drop trigger if exists dom_debt_payments on public.debt_payments;
create trigger dom_debt_payments after insert or update of status on public.debt_payments for each row execute function public.dom_debt_payments();

-- ---------- Kos: tagihan, pembayaran, sewa, booking ----------
create or replace function public.dom_invoices() returns trigger language plpgsql security definer set search_path = public as $$
declare v_who text := (select o.name || ' (' || coalesce(r.code, '-') || ')' from occupants o left join rooms r on r.id = new.room_id where o.id = new.occupant_id);
begin
  if tg_op = 'INSERT' and new.status = 'terbit' then
    perform dom_emit(new.kos_id, case when new.kind = 'sewa' then 'RentalInvoiceGenerated' else 'InvoiceIssued' end, 'invoice', new.id, new.id::text, 'rent',
      'Tagihan ' || new.kind || ' ' || coalesce(v_who, '') || ' · ' || dom_rp(new.amount) || ' · jatuh tempo ' || to_char(new.due_date, 'DD/MM/YYYY'),
      new.amount, jsonb_build_object('kind', new.kind, 'due_date', new.due_date, 'lease_id', new.lease_id));
  elsif tg_op = 'UPDATE' and new.status = 'batal' and old.status <> 'batal' then
    perform dom_emit(new.kos_id, 'InvoiceVoided', 'invoice', new.id, new.id::text, 'rent', 'Tagihan dibatalkan ' || coalesce(v_who, '') || coalesce(' · ' || new.cancel_reason, ''),
      new.amount, '{}');
  end if;
  return null;
end $$;
drop trigger if exists dom_invoices on public.invoices;
create trigger dom_invoices after insert or update of status on public.invoices for each row execute function public.dom_invoices();

create or replace function public.dom_payments() returns trigger language plpgsql security definer set search_path = public as $$
declare v_type text;
begin
  if tg_op = 'UPDATE' and new.status is not distinct from old.status then return null; end if;
  v_type := case new.status when 'terverifikasi' then 'InvoicePaid' when 'ditolak' then 'PaymentRejected' when 'dibatalkan' then 'PaymentVoided' when 'menunggu' then 'PaymentSubmitted' end;
  perform dom_emit(new.kos_id, v_type, 'invoice', new.invoice_id, new.id::text || ':' || new.status, 'rent',
    case new.status when 'terverifikasi' then 'Pembayaran diterima ' when 'ditolak' then 'Bukti bayar ditolak ' when 'dibatalkan' then 'Pembayaran dibatalkan ' else 'Bukti bayar masuk ' end ||
      coalesce((select o.name from invoices i join occupants o on o.id = i.occupant_id where i.id = new.invoice_id), '') || ' · ' || dom_rp(new.amount) || ' · ' || new.method,
    new.amount, jsonb_build_object('payment_id', new.id, 'method', new.method, 'source', new.source));
  return null;
end $$;
drop trigger if exists dom_payments on public.payments;
create trigger dom_payments after insert or update of status on public.payments for each row execute function public.dom_payments();

create or replace function public.dom_leases() returns trigger language plpgsql security definer set search_path = public as $$
declare v_who text := (select o.name || ' · kamar ' || coalesce(r.code, '-') from occupants o left join rooms r on r.id = new.room_id where o.id = new.occupant_id);
begin
  if tg_op = 'INSERT' then
    perform dom_emit(new.kos_id, 'LeaseStarted', 'lease', new.id, new.id::text, 'rent', 'Sewa mulai ' || coalesce(v_who, '') || ' · ' || dom_rp(new.rent) || '/bulan', new.rent,
      jsonb_build_object('start', new.start_date));
  elsif new.status = 'selesai' and old.status <> 'selesai' then
    perform dom_emit(new.kos_id, 'LeaseEnded', 'lease', new.id, new.id::text, 'rent', 'Sewa selesai ' || coalesce(v_who, '') || coalesce(' · ' || new.end_reason, ''), null,
      jsonb_build_object('end', new.end_date));
  end if;
  return null;
end $$;
drop trigger if exists dom_leases on public.leases;
create trigger dom_leases after insert or update of status on public.leases for each row execute function public.dom_leases();

create or replace function public.dom_bookings() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'UPDATE' and new.status is not distinct from old.status then return null; end if;
  perform dom_emit(new.kos_id, case new.status when 'aktif' then 'BookingCreated' when 'selesai' then 'BookingCheckedIn' else 'BookingCancelled' end, 'booking', new.id,
    new.id::text || ':' || new.status, 'rent',
    case new.status when 'aktif' then 'Booking kamar ' when 'selesai' then 'Check-in dari booking ' else 'Booking dibatalkan ' end || coalesce((select code from rooms where id = new.room_id), ''),
    null, '{}');
  return null;
end $$;
drop trigger if exists dom_bookings on public.bookings;
create trigger dom_bookings after insert or update of status on public.bookings for each row execute function public.dom_bookings();

-- ---------- Jasa / kuliner ----------
create or replace function public.dom_svc_orders() returns trigger language plpgsql security definer set search_path = public as $$
declare v_type text;
begin
  if tg_op = 'UPDATE' and new.status is not distinct from old.status then return null; end if;
  v_type := case when tg_op = 'INSERT' and new.status = 'permintaan' then 'ServiceOrderRequested'
                 when tg_op = 'INSERT' then 'ServiceOrderCreated'
                 when new.status = 'selesai' then 'ServiceOrderCompleted'
                 when new.status = 'batal' then 'ServiceOrderCancelled'
                 else 'ServiceOrderStatusChanged' end;
  perform dom_emit(new.kos_id, v_type, 'svc_order', new.id, new.id::text || ':' || new.status, 'sell',
    'Pesanan ' || new.number || ' · ' || coalesce(new.customer_name, '-') || ' · ' || new.status || case when new.status in ('selesai', 'diterima', 'permintaan') then ' · ' || dom_rp(new.total) else '' end,
    new.total, jsonb_build_object('number', new.number, 'status', new.status, 'from', case when tg_op = 'UPDATE' then old.status end, 'source', new.source));
  return null;
end $$;
drop trigger if exists dom_svc_orders on public.svc_orders;
create trigger dom_svc_orders after insert or update of status on public.svc_orders for each row execute function public.dom_svc_orders();

create or replace function public.dom_svc_payments() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' and new.status = 'selesai' then
    perform dom_emit(new.kos_id, 'PaymentReceived', 'svc_order', new.order_id, new.id::text, 'finance',
      'Pembayaran ' || coalesce((select number from svc_orders where id = new.order_id), '-') || ' · ' || dom_rp(new.amount) || ' · ' || new.method, new.amount,
      jsonb_build_object('payment_id', new.id, 'kind', new.kind, 'method', new.method));
  elsif tg_op = 'UPDATE' and new.status = 'batal' and old.status <> 'batal' then
    perform dom_emit(new.kos_id, 'PaymentVoided', 'svc_order', new.order_id, new.id::text, 'finance',
      'Pembayaran dibatalkan ' || coalesce((select number from svc_orders where id = new.order_id), '-') || ' · ' || dom_rp(new.amount), new.amount, jsonb_build_object('payment_id', new.id));
  end if;
  return null;
end $$;
drop trigger if exists dom_svc_payments on public.svc_payments;
create trigger dom_svc_payments after insert or update of status on public.svc_payments for each row execute function public.dom_svc_payments();

-- ---------- Persetujuan ----------
create or replace function public.dom_approvals() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'UPDATE' and new.status is not distinct from old.status then return null; end if;
  perform dom_emit(new.kos_id, case when tg_op = 'INSERT' then 'ApprovalRequested' else 'ApprovalDecided' end, 'approval', new.id, new.id::text || ':' || new.status, 'finance',
    case when tg_op = 'INSERT' then 'Minta persetujuan ' else 'Persetujuan ' || new.status || ' · ' end || new.number || ' · ' || new.summary, new.est_cost,
    jsonb_build_object('action', new.action_code, 'status', new.status));
  return null;
end $$;
drop trigger if exists dom_approvals on public.approvals;
create trigger dom_approvals after insert or update of status on public.approvals for each row execute function public.dom_approvals();

-- ---------- Membaca riwayat ----------
create or replace function public.event_label(p_type text) returns text language sql immutable as $$
  select case p_type
    when 'SaleCreated' then 'Penjualan' when 'SaleVoided' then 'Penjualan batal' when 'SaleReturned' then 'Retur penjualan'
    when 'PurchaseOrdered' then 'Pesan ke supplier' when 'GoodsReceived' then 'Barang diterima' when 'PurchaseVoided' then 'Belanja batal'
    when 'InventoryAdjusted' then 'Penyesuaian stok' when 'StockTransferred' then 'Mutasi stok'
    when 'ExpenseRecorded' then 'Pengeluaran' when 'ExpenseDeleted' then 'Pengeluaran dihapus'
    when 'ReceivableCollected' then 'Pelunasan kasbon' when 'PayablePaid' then 'Bayar utang' when 'DebtPaymentVoided' then 'Pelunasan batal'
    when 'RentalInvoiceGenerated' then 'Tagihan sewa' when 'InvoiceIssued' then 'Tagihan' when 'InvoiceVoided' then 'Tagihan batal'
    when 'InvoicePaid' then 'Pembayaran diterima' when 'PaymentSubmitted' then 'Bukti bayar masuk' when 'PaymentRejected' then 'Bukti ditolak' when 'PaymentVoided' then 'Pembayaran batal'
    when 'LeaseStarted' then 'Sewa mulai' when 'LeaseEnded' then 'Sewa selesai'
    when 'BookingCreated' then 'Booking' when 'BookingCheckedIn' then 'Check-in' when 'BookingCancelled' then 'Booking batal'
    when 'ServiceOrderRequested' then 'Permintaan pesanan' when 'ServiceOrderCreated' then 'Pesanan baru' when 'ServiceOrderCompleted' then 'Pesanan selesai'
    when 'ServiceOrderCancelled' then 'Pesanan batal' when 'ServiceOrderStatusChanged' then 'Tahap pesanan' when 'PaymentReceived' then 'Pembayaran diterima'
    when 'ApprovalRequested' then 'Minta persetujuan' when 'ApprovalDecided' then 'Keputusan persetujuan' else p_type end;
$$;

-- Daftar aktivitas: hanya peristiwa di area yang boleh dibaca pengguna (pemilik semua). Kursor = id terakhir.
create or replace function public.activity_feed(p_kos uuid, p_from date default null, p_to date default null, p_group text default null, p_before bigint default null, p_limit int default 50)
returns jsonb language plpgsql stable security definer set search_path = public, auth as $$
declare v_rows jsonb;
begin
  if not is_member(p_kos) then raise exception 'Tidak punya akses'; end if;
  select coalesce(jsonb_agg(jsonb_build_object('id', e.id, 'type', e.event_type, 'label', event_label(e.event_type), 'agg', e.aggregate_type, 'agg_id', e.aggregate_id,
           'at', e.occurred_at, 'summary', e.summary, 'amount', e.amount, 'area', e.area, 'actor', coalesce(u.email, case when e.actor_id is null then 'sistem / pelanggan' end),
           'corr', e.correlation_id) order by e.id desc), '[]')
    into v_rows
  from (select * from domain_events d
        where d.kos_id = p_kos and member_in(d.area, p_kos)
          and (p_from is null or (d.occurred_at at time zone 'Asia/Jakarta')::date >= p_from)
          and (p_to is null or (d.occurred_at at time zone 'Asia/Jakarta')::date <= p_to)
          and (p_before is null or d.id < p_before)
          and (p_group is null or d.area = p_group)
        order by d.id desc limit least(greatest(coalesce(p_limit, 50), 1), 200)) e
  left join auth.users u on u.id = e.actor_id;
  return jsonb_build_object('rows', v_rows, 'sejak', (select min(occurred_at) from domain_events where kos_id = p_kos));
end $$;

-- Riwayat satu dokumen (penjualan, belanja, tagihan, pesanan, ...)
create or replace function public.activity_for(p_kos uuid, p_agg_type text, p_agg_id uuid)
returns jsonb language plpgsql stable security definer set search_path = public, auth as $$
begin
  if not is_member(p_kos) then raise exception 'Tidak punya akses'; end if;
  return (select coalesce(jsonb_agg(jsonb_build_object('type', e.event_type, 'label', event_label(e.event_type), 'at', e.occurred_at, 'summary', e.summary,
            'actor', coalesce(u.email, case when e.actor_id is null then 'sistem / pelanggan' end)) order by e.id), '[]')
          from domain_events e left join auth.users u on u.id = e.actor_id
          where e.kos_id = p_kos and e.aggregate_type = p_agg_type and e.aggregate_id = p_agg_id and member_in(e.area, p_kos));
end $$;
revoke execute on function public.activity_feed(uuid, date, date, text, bigint, int), public.activity_for(uuid, text, uuid) from public, anon;
grant execute on function public.activity_feed(uuid, date, date, text, bigint, int), public.activity_for(uuid, text, uuid) to authenticated;

-- Pemantauan platform (tanpa isi transaksi): jumlah per jenis 7 hari & dokumen 7 hari terakhir yang tidak punya peristiwa
create or replace function public.event_reconcile()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_since timestamptz := greatest(now() - interval '7 days', coalesce((select min(occurred_at) from domain_events), now()));
begin
  if not coalesce(admin_can('system.view'), false) then raise exception 'Tidak punya izin'; end if;
  return jsonb_build_object(
    'sejak', v_since,
    'per_jenis', (select coalesce(jsonb_object_agg(event_type, n), '{}') from (select event_type, count(*) n from domain_events where occurred_at >= now() - interval '7 days' group by 1) z),
    'belum_diproses', (select count(*) from domain_events where processed_at is null and attempts > 0),
    'celah', jsonb_build_object(
      'penjualan', (select count(*) from sales s where s.created_at >= v_since and s.status = 'selesai'
                    and not exists (select 1 from domain_events e where e.idempotency_key = 'SaleCreated:' || s.id)),
      'pembayaran_kos', (select count(*) from payments p where p.created_at >= v_since and p.status = 'terverifikasi'
                    and not exists (select 1 from domain_events e where e.idempotency_key = 'InvoicePaid:' || p.id || ':terverifikasi')),
      'pesanan_jasa', (select count(*) from svc_orders o where o.created_at >= v_since
                    and not exists (select 1 from domain_events e where e.aggregate_type = 'svc_order' and e.aggregate_id = o.id)),
      'pengeluaran', (select count(*) from expenses x where x.created_at >= v_since
                    and not exists (select 1 from domain_events e where e.idempotency_key = 'ExpenseRecorded:' || x.id))));
end $$;
revoke execute on function public.event_reconcile() from public, anon;
grant execute on function public.event_reconcile() to authenticated;

-- Registry: modul Riwayat aktivitas
insert into public.modules(code, name, description, applies_to, core, depends_on, paths, data_used, status, sort, module_type, category, impl_status, area, owner_approval) values
  ('u_aktivitas', 'Riwayat aktivitas', 'Siapa melakukan apa dan kapan: penjualan, pembayaran, stok, tagihan, pesanan, persetujuan — tercatat otomatis.',
   '{properti,retail,jasa,kustom}', true, '{}', '{/aktivitas}', 'Peristiwa transaksi', 'available', 57, 'administrative', 'kontrol', 'production_ready', '', false)
on conflict (code) do nothing;
