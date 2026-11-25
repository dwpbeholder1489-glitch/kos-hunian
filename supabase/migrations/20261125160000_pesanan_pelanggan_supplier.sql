-- Pesanan pelanggan -> pesanan supplier. Stok/kas tetap melalui penerimaan Belanja.
alter table public.purchases add column so_order_id uuid references public.so_orders(id) on delete set null;
alter table public.purchase_lines add column so_line_id uuid references public.so_lines(id) on delete set null;
create index purchases_so_order on public.purchases(so_order_id) where so_order_id is not null;
create index purchase_lines_so_line on public.purchase_lines(so_line_id) where so_line_id is not null;

create function public.so_procurement(p_order uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  o so_orders;
  v_branch uuid;
  v_active boolean;
  v_stock boolean;
  v_here boolean;
begin
  select * into o from so_orders where id = p_order;
  if o.id is null then raise exception 'Pesanan tidak ditemukan'; end if;
  perform so_guard(o.kos_id, 'sell,finance');
  v_branch := coalesce(o.branch_id, branch_main_id(o.kos_id));
  v_active := o.status in ('dikonfirmasi', 'sebagian') and o.closed_at is null;
  v_stock := coalesce(member_in('stock', o.kos_id) and module_on(o.kos_id, 'r_belanja'), false);
  v_here := v_branch is not null and stock_loc(o.kos_id) = v_branch;

  return jsonb_build_object(
    'active', v_active,
    'can_buy', v_active and v_here and v_stock and coalesce(member_in('sell', o.kos_id), false),
    'can_open_purchase', v_stock,
    'at_order_location', v_here,
    'location', (select name from branches where id = v_branch),
    'purchases', (select coalesce(jsonb_agg(jsonb_build_object(
      'id', b.id, 'number', b.number, 'status', b.status, 'supplier', c.name,
      'expected_date', b.expected_date, 'received_all', not exists (
        select 1 from purchase_lines pl where pl.purchase_id = b.id and pl.qty_received < pl.qty
      )
    ) order by b.created_at desc, b.id), '[]'::jsonb)
      from purchases b left join contacts c on c.id = b.contact_id
      where b.so_order_id = o.id and b.kos_id = o.kos_id),
    'lines', (with by_line as (
      select l.id, l.sort, l.name, l.unit, l.product_id, l.unit_qty, l.qty, l.qty_sent,
        pr.active and not pr.is_kit and u.qty = l.unit_qty as can_source,
        case when v_active then greatest(l.qty - l.qty_sent, 0) else 0 end as remaining,
        coalesce(a.received, 0) as received,
        coalesce(a.incoming, 0) as incoming,
        greatest(0, case when pr.is_kit then kit_avail(pr.id, v_branch)
          else coalesce(st.qty, 0) - stock_held_at(l.product_id, v_branch) end
          - stock_reserved_at(l.product_id, v_branch, o.id)) as available_base
      from so_lines l
      join products pr on pr.id = l.product_id
      left join product_units u on u.product_id = l.product_id and u.name = l.unit
      left join stock_levels st on st.product_id = l.product_id and st.branch_id = v_branch
      left join lateral (
        select
          sum(case when b.status <> 'batal' then
            greatest(pl.qty_received - coalesce((select sum(r.qty) from purchase_return_lines r where r.purchase_line_id = pl.id), 0), 0)
          else 0 end) as received,
          sum(case when b.status in ('dipesan', 'sebagian') then greatest(pl.qty - pl.qty_received, 0) else 0 end) as incoming
        from purchase_lines pl join purchases b on b.id = pl.purchase_id
        where pl.so_line_id = l.id and b.so_order_id = o.id
      ) a on true
      where l.order_id = o.id
    ), coverage as (
      select *, greatest(remaining - incoming, 0) * unit_qty as uncovered_base,
        least(remaining, incoming) * unit_qty as covered_base
      from by_line
    ), allocation as (
      select *,
        sum(uncovered_base) over (partition by product_id) as total_uncovered,
        coalesce(sum(uncovered_base) over prior_lines, 0) as prior_uncovered,
        coalesce(sum(covered_base) over prior_lines, 0) as prior_covered
      from coverage
      window prior_lines as (partition by product_id order by sort, id rows between unbounded preceding and 1 preceding)
    ), progress as (
      select *,
        trunc((least(uncovered_base, greatest(available_base - prior_uncovered, 0))
          + least(covered_base, greatest(available_base - total_uncovered - prior_covered, 0))) / unit_qty, 3) as ready
      from allocation
    )
    select coalesce(jsonb_agg(jsonb_build_object(
      'id', id, 'name', name, 'unit', unit, 'qty', qty, 'qty_sent', qty_sent, 'remaining', remaining,
      'received', received, 'incoming', incoming, 'ready', ready,
      'unplaced', greatest(remaining - ready - incoming, 0), 'can_source', coalesce(can_source, false)
    ) order by sort, id), '[]'::jsonb) from progress)
  );
end $$;

create function public.so_purchase_create(p_id uuid, p_order uuid, p_supplier uuid, p_lines jsonb, p_method text,
  p_due date default null, p_expected date default null, p_note text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  o so_orders;
  b purchases;
  v_line record;
  v_requested jsonb;
  v_status jsonb;
  v_lines jsonb := '[]'::jsonb;
  v_map jsonb := '[]'::jsonb;
  v_result jsonb;
  v_qty numeric;
  v_price numeric;
  v_linked integer;
begin
  select * into o from so_orders where id = p_order for update;
  if o.id is null then raise exception 'Pesanan tidak ditemukan'; end if;
  perform so_guard(o.kos_id);
  if not member_in('stock', o.kos_id) then raise exception 'Akses Belanja diperlukan untuk membuat pesanan supplier'; end if;
  if p_id is null then raise exception 'ID pesanan supplier wajib'; end if;
  perform pg_advisory_xact_lock(hashtextextended('so-purchase:' || p_id::text, 0));
  select * into b from purchases where id = p_id;
  if b.id is not null then
    if b.kos_id <> o.kos_id or b.so_order_id is distinct from o.id or b.contact_id is distinct from p_supplier then
      raise exception 'ID pesanan supplier sudah digunakan';
    end if;
    return jsonb_build_object('id', b.id, 'number', b.number, 'duplicate', true);
  end if;

  v_status := so_procurement(o.id);
  if not (v_status->>'active')::boolean then raise exception 'Pesanan pelanggan harus dikonfirmasi dan masih berjalan'; end if;
  if not coalesce((v_status->>'at_order_location')::boolean, false) then
    raise exception 'Pindah ke lokasi pesanan pelanggan sebelum membuat pesanan supplier';
  end if;
  if not (v_status->>'can_buy')::boolean then raise exception 'Aktifkan modul Belanja untuk membuat pesanan supplier'; end if;
  if not exists (select 1 from contacts where id = p_supplier and kos_id = o.kos_id and kind = 'supplier' and archived_at is null) then
    raise exception 'Pilih supplier aktif dari bisnis ini';
  end if;
  if p_method is null or p_method not in ('tunai', 'transfer', 'utang') then raise exception 'Pilih cara bayar supplier'; end if;
  if jsonb_typeof(p_lines) is distinct from 'array' then raise exception 'Pilih barang yang akan dipesan'; end if;
  if jsonb_array_length(p_lines) not between 1 and 100 then raise exception 'Pilih 1–100 baris barang'; end if;

  for v_requested in select value from jsonb_array_elements(p_lines) loop
    select l.id, l.product_id, l.name, l.unit, l.unit_qty, x.unplaced, x.can_source
      into v_line
    from so_lines l
    join jsonb_to_recordset(v_status->'lines') as x(id uuid, unplaced numeric, can_source boolean) on x.id = l.id
    where l.order_id = o.id and l.id = (v_requested->>'line_id')::uuid;
    if not found then raise exception 'Baris barang bukan bagian dari pesanan pelanggan ini'; end if;
    if not v_line.can_source then raise exception '%: periksa barang aktif dan konversi satuan sebelum memesan', v_line.name; end if;
    if exists (select 1 from jsonb_array_elements(v_map) x where x->>'so_line_id' = v_line.id::text) then
      raise exception 'Baris % dipilih lebih dari sekali', v_line.name;
    end if;

    v_qty := (v_requested->>'qty')::numeric;
    v_price := (v_requested->>'price')::numeric;
    if v_qty is null or not (v_qty > 0 and v_qty <= v_line.unplaced and v_qty = trunc(v_qty, 3)) then
      raise exception '%: jumlah maksimum yang masih perlu dipesan % %', v_line.name, trim_scale(v_line.unplaced), v_line.unit;
    end if;
    if v_price is null or not (v_price between 0 and 999999999999.99 and v_price = trunc(v_price, 2)) then
      raise exception 'Isi harga beli yang valid untuk %', v_line.name;
    end if;
    v_lines := v_lines || jsonb_build_array(jsonb_build_object('product_id', v_line.product_id, 'unit', v_line.unit, 'qty', v_qty, 'price', v_price));
    v_map := v_map || jsonb_build_array(jsonb_build_object('so_line_id', v_line.id, 'product_id', v_line.product_id, 'unit', v_line.unit, 'qty', v_qty, 'price', v_price));
  end loop;

  v_result := purchase_order_create(p_id, o.kos_id, null, p_supplier, v_lines, p_method, p_due,
    concat_ws(' · ', 'Dari pesanan ' || o.number, nullif(trim(p_note), '')), p_expected);
  if (v_result->>'duplicate')::boolean then raise exception 'ID pesanan supplier sudah digunakan'; end if;
  update purchases set so_order_id = o.id where id = p_id;

  -- PO memakai fungsi yang sama dengan Belanja. Pasangkan baris identik 1:1 agar
  -- beberapa baris dengan produk, satuan, jumlah, dan harga sama tetap terlacak.
  with requested as (
    select x.*, row_number() over (partition by product_id, unit, qty, price order by so_line_id) as n
    from jsonb_to_recordset(v_map) x(so_line_id uuid, product_id uuid, unit text, qty numeric, price numeric)
  ), created as (
    select id, product_id, unit, qty, price, row_number() over (partition by product_id, unit, qty, price order by id) as n
    from purchase_lines where purchase_id = p_id
  )
  update purchase_lines pl set so_line_id = r.so_line_id
  from requested r join created c using (product_id, unit, qty, price, n)
  where pl.id = c.id;
  get diagnostics v_linked = row_count;
  if v_linked <> jsonb_array_length(v_map) then raise exception 'Baris pesanan supplier tidak berhasil dipasangkan'; end if;

  return v_result;
end $$;

-- Historis PO tetap merujuk barang yang dijanjikan. Kuantitas masih bisa
-- diperbarui, selama mencakup barang yang telah dikirim dan PO yang masih ditunggu.
create function public.so_line_purchase_guard()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_incoming numeric;
begin
  if not exists (select 1 from purchase_lines where so_line_id = old.id) then
    if tg_op = 'DELETE' then return old; end if;
    return new;
  end if;

  if tg_op = 'DELETE' then
    if not exists (select 1 from so_orders where id = old.order_id) then return old; end if;
    raise exception '% sudah terhubung ke pesanan supplier dan tidak bisa dihapus', old.name;
  end if;

  if (new.product_id, new.unit, new.unit_qty) is distinct from (old.product_id, old.unit, old.unit_qty) then
    raise exception 'Barang dan satuan % sudah terhubung ke pesanan supplier', old.name;
  end if;
  if new.qty < old.qty then
    select coalesce(sum(greatest(l.qty - l.qty_received, 0)), 0) into v_incoming
    from purchase_lines l join purchases b on b.id = l.purchase_id
    where l.so_line_id = old.id and b.status in ('dipesan', 'sebagian');
    if new.qty < old.qty_sent + v_incoming then
      raise exception 'Tutup sisa pesanan supplier untuk % sebelum mengurangi jumlah pesanan pelanggan', old.name;
    end if;
  end if;
  return new;
end $$;
create trigger so_line_purchase_guard before delete or update of product_id, unit, unit_qty, qty on public.so_lines
for each row execute function public.so_line_purchase_guard();

create function public.so_purchase_receipt_guard()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.so_line_id is not null and new.qty_received > new.qty then
    raise exception 'Jumlah diterima untuk % melebihi jumlah pesanan supplier', new.name;
  end if;
  return new;
end $$;
create trigger so_purchase_receipt_guard before update of qty_received on public.purchase_lines
for each row execute function public.so_purchase_receipt_guard();

-- Kuantitas diterima, bukan nominalnya, menentukan apakah PO berisi penerimaan.
do $$
declare
  v_sql text := pg_get_functiondef('public.purchase_receive(uuid,jsonb,date,boolean)'::regprocedure);
  v_old text := 'total + v_add = 0';
  v_new text := 'total + v_add = 0 and (b.so_order_id is null or not exists (select 1 from purchase_lines where purchase_id = b.id and qty_received > 0))';
begin
  if strpos(v_sql, v_old) = 0 then raise exception 'Tidak menemukan penentuan status penerimaan'; end if;
  execute replace(v_sql, v_old, v_new);
end $$;

-- Pesanan yang dipenuhi dari supplier hanya bisa diserahkan sebatas stok siap
-- pada lokasi pesanannya. Pesanan lain memakai aturan pengiriman sebelumnya.
do $$
declare
  v_sql text := pg_get_functiondef('public.so_deliver(uuid,uuid,jsonb)'::regprocedure);
  v_before text := $anchor$  if v_method not in ('kasbon', 'tunai', 'transfer')$anchor$;
  v_check text := $anchor$    if sl.qty_sent + v_qty > sl.qty then$anchor$;
begin
  if strpos(v_sql, 'v_ex so_deliveries;') = 0 or strpos(v_sql, v_before) = 0 or strpos(v_sql, v_check) = 0 then
    raise exception 'Tidak menemukan titik verifikasi surat jalan';
  end if;
  v_sql := replace(v_sql, 'v_ex so_deliveries;', 'v_ex so_deliveries; v_procurement jsonb; v_ready numeric;');
  v_sql := replace(v_sql, v_before, $patch$
  if exists (select 1 from purchases where so_order_id = o.id) then
    if stock_loc(o.kos_id) is distinct from coalesce(o.branch_id, branch_main_id(o.kos_id)) then
      raise exception 'Pindah ke lokasi pesanan pelanggan sebelum membuat surat jalan';
    end if;
    perform 1 from products p where exists (
      select 1 from so_lines l where l.order_id = o.id and l.product_id = p.id
    ) order by p.id for update;
    v_procurement := so_procurement(o.id);
  end if;
$patch$ || v_before);
  v_sql := replace(v_sql, v_check, $patch$
    if v_procurement is not null then
      select x.ready into v_ready from jsonb_to_recordset(v_procurement->'lines') x(id uuid, ready numeric) where x.id = sl.id;
      if v_qty > coalesce(v_ready, 0) then
        raise exception '%: jumlah yang siap diserahkan saat ini % %', sl.name, trim_scale(coalesce(v_ready, 0)), sl.unit;
      end if;
    end if;
$patch$ || v_check);
  execute v_sql;
end $$;

revoke execute on function public.so_procurement(uuid),
  public.so_purchase_create(uuid, uuid, uuid, jsonb, text, date, date, text),
  public.so_line_purchase_guard(), public.so_purchase_receipt_guard() from public, anon, authenticated;
grant execute on function public.so_procurement(uuid),
  public.so_purchase_create(uuid, uuid, uuid, jsonb, text, date, date, text) to authenticated;
