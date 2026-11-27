-- Tahap J Master Blueprint BI V2.0: KPI industri tambahan — HANYA dari data yang sudah dicatat (tanpa pencatatan baru).
-- Jasa/laundry & kuliner dari svc_orders/svc_order_lines/svc_complaints/svc_events; kos dari rooms/leases/invoices/payments/bookings.
-- Fungsi ini mengirim ANGKA MENTAH per periode; rasio, satuan, dan rumus tertulis di lib/industryKpi.js (diuji node).
-- Paket Bisnis & Pro (fitur analisis_lanjutan, sama dengan analisis bisnis lanjutan). Retail tetap memakai retail_kpi (Laporan toko).

create or replace function public.industry_kpi_period(p_kos uuid, p_from date, p_to date)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_type text; v_tpl text; v_prof jsonb; r jsonb;
begin
  select business_type, template_code, profile into v_type, v_tpl, v_prof from kos where id = p_kos;
  if v_type = 'jasa' then
    with d as (select * from svc_orders where kos_id = p_kos and status = 'selesai' and completed_date between p_from and p_to),
         l as (select l.* from svc_order_lines l join d on d.id = l.order_id),
         kg as (select * from l where lower(trim(unit)) in ('kg', 'kilo', 'kilogram')),
         c as (select coalesce(contact_id::text, nullif(regexp_replace(coalesce(customer_phone, ''), '\D', '', 'g'), ''), lower(trim(customer_name))) k, count(*) n
               from d where rework_of is null group by 1)
    select jsonb_build_object(
      'pesanan', (select count(*) from d where rework_of is null),
      'ulang', (select count(*) from d where rework_of is not null),
      'pendapatan', (select coalesce(sum(total), 0) from d),
      'masuk', (select count(*) from svc_orders where kos_id = p_kos and (received_at at time zone 'Asia/Jakarta')::date between p_from and p_to),
      'batal', (select count(*) from svc_orders where kos_id = p_kos and status = 'batal' and (received_at at time zone 'Asia/Jakarta')::date between p_from and p_to),
      'online', (select count(*) from svc_orders where kos_id = p_kos and source = 'portal' and (received_at at time zone 'Asia/Jakarta')::date between p_from and p_to),
      'kg', (select coalesce(sum(qty), 0) from kg),
      'kg_pendapatan', (select coalesce(sum(line_total), 0) from kg),
      'kg_pesanan', (select count(distinct order_id) from kg),
      'proses_jam', (select round(avg(extract(epoch from completed_at - received_at) / 3600)::numeric, 1) from d where completed_at is not null and completed_at >= received_at),
      'dengan_janji', (select count(*) from d where due_at is not null),
      'tepat_waktu', (select count(*) from d where due_at is not null and exists (select 1 from svc_events e where e.order_id = d.id and e.kind = 'status' and e.text like 'Siap%' and e.created_at <= d.due_at)),
      'keluhan', (select count(*) from svc_complaints where kos_id = p_kos and (created_at at time zone 'Asia/Jakarta')::date between p_from and p_to),
      'antar_jemput', (select count(*) from d where pickup or deliver),
      'pelanggan', (select count(*) from c), 'pelanggan_ulang', (select count(*) from c where n >= 2),
      'kuliner', v_tpl = 'kuliner',
      'tempat', (select count(*) from d where dine = 'tempat'), 'bungkus', (select count(*) from d where dine = 'bungkus'),
      'meja_pesanan', (select count(*) from d where table_no is not null),
      'meja', nullif(v_prof ->> 'tables', '')::int,
      'biaya_resep', (select sum(recipe_cost) from l), 'pendapatan_resep', (select sum(line_total) from l where recipe_cost is not null))
    into r;
  elsif v_type = 'properti' then
    with lz as (select * from leases where kos_id = p_kos and start_date <= p_to and (end_date is null or end_date >= p_from)),
         inv as (select i.*, (select coalesce(sum(p.amount), 0) from payments p where p.invoice_id = i.id and p.status = 'terverifikasi') paid,
                        (select coalesce(sum(p.amount), 0) from payments p where p.invoice_id = i.id and p.status = 'terverifikasi' and p.paid_at <= i.due_date) paid_ontime
                 from invoices i where i.kos_id = p_kos and i.status = 'terbit' and i.due_date between p_from and p_to)
    select jsonb_build_object(
      'kamar', (select count(*) from rooms where kos_id = p_kos and status <> 'tidak_disewakan'),
      'kamar_hari', (select coalesce(sum(least(coalesce(end_date, p_to), p_to) - greatest(start_date, p_from) + 1), 0) from lz),
      'sewa_rata', (select round(avg(rent), 2) from leases where kos_id = p_kos and start_date <= p_to and (end_date is null or end_date >= p_to)),
      'terisi_akhir', (select count(distinct room_id) from leases where kos_id = p_kos and start_date <= p_to and (end_date is null or end_date >= p_to)),
      'uang_masuk', (select coalesce(sum(amount), 0) from payments where kos_id = p_kos and status = 'terverifikasi' and paid_at between p_from and p_to),
      'tagihan', (select coalesce(sum(amount), 0) from inv), 'tagihan_n', (select count(*) from inv),
      'tunggakan', (select coalesce(sum(greatest(amount - paid, 0)), 0) from inv),
      'tepat_bayar', (select count(*) from inv where paid_ontime >= amount),
      'masuk', (select count(*) from leases where kos_id = p_kos and start_date between p_from and p_to and prev_lease_id is null),
      'keluar', (select count(*) from leases where kos_id = p_kos and status <> 'aktif' and end_date between p_from and p_to and not exists (select 1 from leases n where n.prev_lease_id = leases.id)),
      'lama_tinggal_bln', (select round(avg((end_date - start_date + 1) / 30.4)::numeric, 1) from leases where kos_id = p_kos and status <> 'aktif' and end_date between p_from and p_to and end_date > start_date
                          and not exists (select 1 from leases n where n.prev_lease_id = leases.id)),
      'booking_selesai', (select count(*) from bookings where kos_id = p_kos and status <> 'aktif' and closed_date between p_from and p_to),
      'booking_masuk', (select count(*) from bookings where kos_id = p_kos and status = 'selesai' and lease_id is not null and closed_date between p_from and p_to))
    into r;
  else
    r := '{}';
  end if;
  return r || jsonb_build_object('jenis', v_type, 'dari', p_from, 'sampai', p_to, 'hari', p_to - p_from + 1);
end $$;

create or replace function public.industry_kpi(p_kos uuid, p_from date, p_to date, p_cmp_from date, p_cmp_to date)
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if not member_in('finance', p_kos) then raise exception 'Tidak punya akses keuangan bisnis ini'; end if;
  if p_from is null or p_to is null or p_to < p_from or p_to - p_from > 400 then raise exception 'Periode tidak valid (maks. 400 hari)'; end if;
  if (p_cmp_from is null) <> (p_cmp_to is null) or p_cmp_to < p_cmp_from then raise exception 'Periode pembanding tidak valid'; end if;
  if not plan_has(p_kos, 'analisis_lanjutan') then return jsonb_build_object('aktif', false); end if;
  return jsonb_build_object('aktif', true, 'cur', industry_kpi_period(p_kos, p_from, p_to),
    'cmp', case when p_cmp_from is not null then industry_kpi_period(p_kos, p_cmp_from, p_cmp_to) end);
end $$;

revoke execute on function public.industry_kpi_period(uuid, date, date) from public, anon, authenticated;
revoke execute on function public.industry_kpi(uuid, date, date, date, date) from public, anon;
grant execute on function public.industry_kpi(uuid, date, date, date, date) to authenticated;
