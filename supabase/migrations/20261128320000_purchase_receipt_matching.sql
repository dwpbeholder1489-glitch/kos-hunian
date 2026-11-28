-- Stok disimpan sampai 3 desimal. Jumlah dalam satuan pesanan perlu presisi
-- lebih tinggi saat, misalnya, satu pcs diterima untuk dus berisi 24 pcs.
drop trigger so_purchase_receipt_guard on public.purchase_lines;
alter table public.purchase_lines alter column qty_received type numeric;
create trigger so_purchase_receipt_guard before update of qty_received on public.purchase_lines
  for each row execute function public.so_purchase_receipt_guard();

create table public.purchase_receipts (
  purchase_id uuid not null references public.purchases(id) on delete cascade,
  id uuid not null,
  kos_id uuid not null references public.kos(id) on delete cascade,
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid(),
  lines jsonb not null,
  primary key (purchase_id, id)
);
alter table public.purchase_receipts enable row level security;
create policy purchase_receipts_select on public.purchase_receipts for select to authenticated
  using (public.member_can(kos_id, 'stock,finance'));
revoke all on public.purchase_receipts from public, anon, authenticated;
grant select on public.purchase_receipts to authenticated;
create trigger zz_kos_open_guard before insert or update or delete on public.purchase_receipts
  for each row execute function public.kos_open_guard();

-- Harga nol tetap merupakan penerimaan bila ada kuantitas yang masuk.
do $$
declare
  definition text := pg_get_functiondef('public.purchase_receive(uuid,jsonb,date,boolean)'::regprocedure);
  previous text := 'total + v_add = 0 and (b.so_order_id is null or not exists (select 1 from purchase_lines where purchase_id = b.id and qty_received > 0))';
begin
  if strpos(definition, previous) = 0 then raise exception 'Penentuan status penerimaan tidak ditemukan'; end if;
  execute replace(definition, previous, 'total + v_add = 0 and not exists (select 1 from purchase_lines where purchase_id = b.id and qty_received > 0)');
end $$;

create function public.purchase_receive_matched(p_purchase uuid, p_receipt uuid, p_lines jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  b purchases;
  l purchase_lines;
  x jsonb;
  v_unit text;
  v_factor numeric;
  v_stock_unit text;
  v_good numeric;
  v_damaged numeric;
  v_good_base numeric;
  v_damaged_base numeric;
  v_pending_base numeric;
  v_accepted numeric;
  v_accepted_qty numeric;
  v_order_qty_left numeric;
  v_left numeric;
  v_price numeric;
  v_expected_price numeric;
  v_expiry date;
  v_lot text;
  v_post jsonb := '[]';
  v_details jsonb := '[]';
  v_planned_qty jsonb := '{}';
  v_key text;
begin
  -- Pemeriksaan idempotensi dilakukan setelah kunci pesanan, sebelum status.
  select * into b from purchases where id = p_purchase for update;
  if b.id is null or not member_in('stock', b.kos_id) then raise exception 'Belanja tidak ditemukan'; end if;
  if p_receipt is null then raise exception 'ID penerimaan wajib diisi'; end if;
  if exists (select 1 from purchase_receipts where purchase_id = b.id and id = p_receipt) then
    return jsonb_build_object('id', p_receipt, 'duplicate', true);
  end if;
  if not module_on(b.kos_id, 'r_belanja') then raise exception 'Modul Belanja sedang nonaktif'; end if;
  if b.status not in ('dipesan', 'sebagian') then raise exception 'Pesanan ini sudah selesai atau dibatalkan'; end if;
  if jsonb_typeof(p_lines) is distinct from 'array' then raise exception 'Isi rincian penerimaan'; end if;
  if jsonb_array_length(p_lines) not between 1 and 100 then raise exception 'Isi 1–100 baris penerimaan'; end if;

  for x in select value from jsonb_array_elements(p_lines) loop
    select * into l from purchase_lines where id = (x->>'line_id')::uuid and purchase_id = b.id;
    if l.id is null then raise exception 'Baris pesanan tidak ditemukan'; end if;
    select base_unit into v_stock_unit from products where id = l.product_id;
    v_unit := nullif(trim(x->>'unit'), '');
    if v_unit = l.unit then
      -- Gunakan isi kemasan saat PO dibuat meski katalog kemudian berubah.
      v_factor := l.unit_qty;
    elsif v_unit = v_stock_unit then
      v_factor := 1;
    else
      select qty into v_factor from product_units where product_id = l.product_id and name = v_unit;
    end if;
    if v_factor is null or v_factor <= 0 then raise exception 'Satuan untuk % tidak ditemukan', l.name; end if;
    v_good := coalesce((x->>'good')::numeric, 0);
    v_damaged := coalesce((x->>'damaged')::numeric, 0);
    v_price := (x->>'price')::numeric;
    if not (v_good between 0 and 99999999999.999 and v_damaged between 0 and 99999999999.999)
      or v_good <> round(v_good, 3) or v_damaged <> round(v_damaged, 3) then
      raise exception 'Jumlah harus positif atau nol, maksimal 3 angka desimal';
    end if;
    if v_price is not null and (not (v_price between 0 and 999999999999.99) or v_price <> round(v_price, 2)) then
      raise exception 'Harga barang tidak valid';
    end if;
    v_good_base := round(v_good * v_factor, 3);
    v_damaged_base := round(v_damaged * v_factor, 3);
    if v_good_base + v_damaged_base = 0 or (v_good > 0 and v_good_base = 0) or (v_damaged > 0 and v_damaged_base = 0) then
      raise exception 'Jumlah penerimaan terlalu kecil atau kosong untuk %', l.name;
    end if;
    v_key := l.id::text;
    v_order_qty_left := greatest(l.qty - l.qty_received - coalesce((v_planned_qty->>v_key)::numeric, 0), 0);
    v_pending_base := round(v_order_qty_left * l.unit_qty, 3);
    v_accepted := least(v_good_base, v_pending_base);
    v_left := v_pending_base - v_accepted;
    v_expected_price := coalesce(l.order_price, l.price) * v_factor / l.unit_qty;
    v_expiry := coalesce(nullif(x->>'expiry', '')::date, l.expiry);
    v_lot := coalesce(nullif(trim(x->>'lot'), ''), l.lot);
    if length(v_lot) > 40 then raise exception 'No. batch maksimal 40 karakter'; end if;

    if v_accepted > 0 then
      v_accepted_qty := case when v_left = 0 then v_order_qty_left
        else round(v_accepted::numeric(40,20) / l.unit_qty, 20) end;
      v_planned_qty := jsonb_set(v_planned_qty, array[v_key], to_jsonb(coalesce((v_planned_qty->>v_key)::numeric, 0) + v_accepted_qty));
      v_post := v_post || jsonb_build_array(jsonb_build_object(
        'line_id', l.id, 'qty', v_accepted_qty,
        'price', coalesce(v_price, v_expected_price) * v_accepted / v_factor / v_accepted_qty,
        'expiry', v_expiry, 'lot', v_lot
      ));
    end if;

    v_details := v_details || jsonb_build_array(jsonb_build_object(
      'line_id', l.id, 'product_id', l.product_id, 'name', l.name,
      'unit', v_unit, 'unit_qty', v_factor, 'stock_unit', v_stock_unit,
      'good', v_good, 'damaged', v_damaged, 'damaged_base', v_damaged_base,
      'accepted_base', v_accepted, 'excess_base', v_good_base - v_accepted,
      'remaining_base', v_left, 'expected_price', round(v_expected_price, 2),
      'received_price', coalesce(v_price, round(v_expected_price, 2)),
      'price_difference', coalesce(v_price - round(v_expected_price, 2), 0),
      'expiry', v_expiry, 'lot', v_lot
    ));
  end loop;

  if jsonb_array_length(v_post) > 0 then
    perform purchase_receive(b.id, v_post, null, false);
  end if;
  insert into purchase_receipts(purchase_id, id, kos_id, lines) values (b.id, p_receipt, b.kos_id, v_details);
  return jsonb_build_object('id', p_receipt, 'duplicate', false);
end $$;

revoke execute on function public.purchase_receive_matched(uuid, uuid, jsonb) from public, anon;
grant execute on function public.purchase_receive_matched(uuid, uuid, jsonb) to authenticated;
