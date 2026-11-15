-- Toko lanjutan 3 (audit Retail & Wholesale v1.0, RET-002 / aturan keras #12): stok TERSEDIA ≠ stok fisik.
-- Prinsip:
--   * Satu buku stok tetap `stock_moves` (RET-007). Tidak ada tabel saldo baru yang ditulis manual.
--   * Dipesan (reservasi) = DIHITUNG dari sisa pesanan grosir dikonfirmasi/sebagian (so_lines qty − qty_sent) → tidak bisa "lupa dilepas".
--   * Ditahan (rusak/karantina/periksa/retur rusak) = `stock_holds` — barang masih fisik ada (masih di stok & nilai persediaan), tetapi tidak dijual.
--     Keputusan: dilepas (kembali dijual) / dibuang (gerak stok rusak, nilai jadi beban) / diretur ke supplier (ditutup; retur dicatat lewat Belanja).
--   * Dalam perjalanan = mutasi "kirim": stok keluar dari asal saat dikirim (value 0), masuk tujuan saat diterima. Total stok & nilai tidak berubah.
--     Kurang terima → kembali ke asal ATAU hilang di jalan (gerak rusak, perlu izin penyesuaian stok).
--   * Tersedia = stok lokasi − dipesan − ditahan. Aturan stok minus 'tolak' memakai angka tersedia.
--   * Stok maksimum + kesehatan stok (cepat/normal/lambat/mati/baru/habis) dengan aturan tertulis.

-- ---------- Barang ditahan ----------
create table if not exists public.stock_holds (
  id uuid primary key default gen_random_uuid(),
  kos_id uuid not null references public.kos(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  branch_id uuid not null references public.branches(id),
  qty numeric(14,3) not null check (qty > 0),
  reason text not null check (reason in ('rusak', 'karantina', 'periksa', 'retur_rusak')),
  note text check (note is null or length(note) <= 200),
  ref_id uuid,
  status text not null default 'ditahan' check (status in ('ditahan', 'dilepas', 'dibuang', 'diretur')),
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  closed_by uuid,
  closed_at timestamptz,
  close_note text check (close_note is null or length(close_note) <= 200)
);
create index if not exists stock_holds_open on public.stock_holds(product_id, branch_id) where status = 'ditahan';
alter table public.stock_holds enable row level security;
drop policy if exists stock_holds_select on public.stock_holds;
create policy stock_holds_select on public.stock_holds for select using (member_can(kos_id, 'stock') or member_can(kos_id, 'finance'));
drop trigger if exists zz_kos_open_guard on public.stock_holds;
create trigger zz_kos_open_guard before insert or update or delete on public.stock_holds for each row execute function public.kos_open_guard();
grant select on public.stock_holds to authenticated;

-- ---------- Mutasi dalam perjalanan ----------
alter table public.stock_transfers add column if not exists status text not null default 'selesai';
alter table public.stock_transfers drop constraint if exists stock_transfers_status_check;
alter table public.stock_transfers add constraint stock_transfers_status_check check (status in ('dikirim', 'selesai', 'batal'));
alter table public.stock_transfers add column if not exists received_at timestamptz;
alter table public.stock_transfers add column if not exists received_email text;
alter table public.stock_transfers add column if not exists receive_note text check (receive_note is null or length(receive_note) <= 200);
alter table public.stock_transfers add column if not exists received jsonb;

-- ---------- Stok maksimum ----------
alter table public.products add column if not exists max_stock numeric(14,3);
alter table public.products drop constraint if exists products_max_stock_check;
alter table public.products add constraint products_max_stock_check check (max_stock is null or max_stock > 0);

-- ---------- Angka dasar ----------
create or replace function public.branch_main_id(p_kos uuid) returns uuid language sql stable security definer set search_path = public as $$
  select id from branches where kos_id = p_kos and is_main limit 1;
$$;

-- dipesan pelanggan grosir (satuan utama); p_branch null = semua lokasi
create or replace function public.stock_reserved_at(p_product uuid, p_branch uuid default null, p_except uuid default null)
returns numeric language sql stable security definer set search_path = public as $$
  select coalesce(sum(greatest(l.qty - l.qty_sent, 0) * l.unit_qty), 0)
  from so_lines l join so_orders o on o.id = l.order_id
  where l.product_id = p_product and o.status in ('dikonfirmasi', 'sebagian') and o.id is distinct from p_except
    and (p_branch is null or coalesce(o.branch_id, branch_main_id(o.kos_id)) = p_branch);
$$;

create or replace function public.stock_held_at(p_product uuid, p_branch uuid default null)
returns numeric language sql stable security definer set search_path = public as $$
  select coalesce(sum(qty), 0) from stock_holds where product_id = p_product and status = 'ditahan' and (p_branch is null or branch_id = p_branch);
$$;

-- dalam perjalanan menuju lokasi (null = semua)
create or replace function public.stock_transit_at(p_product uuid, p_branch uuid default null)
returns numeric language sql stable security definer set search_path = public as $$
  select coalesce(sum((x->>'qty')::numeric), 0)
  from stock_transfers t, jsonb_array_elements(t.lines) x
  where t.status = 'dikirim' and (x->>'product_id')::uuid = p_product and (p_branch is null or t.to_branch = p_branch);
$$;
revoke execute on function public.stock_reserved_at(uuid, uuid, uuid), public.stock_held_at(uuid, uuid), public.stock_transit_at(uuid, uuid), public.branch_main_id(uuid) from public, anon, authenticated;

-- Ringkasan per barang (+ per lokasi bila multi-lokasi): fisik, dipesan, ditahan, dalam perjalanan, tersedia
create or replace function public.stock_avail(p_kos uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if not member_in('stock,finance,sell', p_kos) then raise exception 'Tidak punya akses ke stok'; end if;
  return jsonb_build_object(
    'products', (select coalesce(jsonb_agg(x), '[]'::jsonb) from (
      select p.id as product_id, p.stock, p.max_stock,
             stock_reserved_at(p.id) as reserved, stock_held_at(p.id) as held, stock_transit_at(p.id) as transit,
             p.stock - stock_transit_at(p.id) - stock_reserved_at(p.id) - stock_held_at(p.id) as available
      from products p where p.kos_id = p_kos and p.active
        and (stock_reserved_at(p.id) > 0 or stock_held_at(p.id) > 0 or stock_transit_at(p.id) > 0)) x),
    'levels', case when loc_multi(p_kos) then (select coalesce(jsonb_agg(y), '[]'::jsonb) from (
      select k.product_id, k.branch_id, coalesce(sl.qty, 0) as qty, stock_reserved_at(k.product_id, k.branch_id) as reserved, stock_held_at(k.product_id, k.branch_id) as held,
             stock_transit_at(k.product_id, k.branch_id) as incoming,
             coalesce(sl.qty, 0) - stock_reserved_at(k.product_id, k.branch_id) - stock_held_at(k.product_id, k.branch_id) as available
      from (select product_id, branch_id from stock_levels where kos_id = p_kos
            union select (x->>'product_id')::uuid, t.to_branch from stock_transfers t, jsonb_array_elements(t.lines) x where t.kos_id = p_kos and t.status = 'dikirim') k
      join products p on p.id = k.product_id
      left join stock_levels sl on sl.product_id = k.product_id and sl.branch_id = k.branch_id
      where p.active and (stock_reserved_at(k.product_id, k.branch_id) > 0 or stock_held_at(k.product_id, k.branch_id) > 0 or stock_transit_at(k.product_id, k.branch_id) > 0)) y) else '[]'::jsonb end);
end $$;

-- ---------- Tahan / lepas / buang ----------
create or replace function public.hold_create(p_kos uuid, p_product uuid, p_unit text, p_qty numeric, p_reason text, p_note text default null, p_branch uuid default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare p products; v_b uuid; v_qty numeric; v_level numeric; v_id uuid;
begin
  if not member_in('stock', p_kos) then raise exception 'Tidak punya akses ke stok'; end if;
  select * into p from products where id = p_product and kos_id = p_kos;
  if p.id is null then raise exception 'Barang tidak ditemukan'; end if;
  if p_reason not in ('rusak', 'karantina', 'periksa') then raise exception 'Pilih alasan: rusak, karantina, atau perlu diperiksa'; end if;
  v_b := coalesce(p_branch, stock_loc(p_kos), branch_main_ensure(p_kos));
  if not exists (select 1 from branches where id = v_b and kos_id = p_kos) then raise exception 'Lokasi tidak ditemukan'; end if;
  v_qty := case when nullif(trim(coalesce(p_unit, '')), '') is not null then unit_to_base(p.id, p_unit, p_qty) else round(coalesce(p_qty, 0), 3) end;
  if v_qty is null or v_qty <= 0 then raise exception 'Isi jumlah yang ditahan'; end if;
  v_level := coalesce((select qty from stock_levels where product_id = p.id and branch_id = v_b), 0) - stock_held_at(p.id, v_b);
  if v_qty > v_level + 0.0005 then
    raise exception 'Stok % yang belum ditahan di lokasi ini hanya % %', p.name, trim(to_char(greatest(v_level, 0), 'FM999999990.###'), '.'), p.base_unit; end if;
  insert into stock_holds(kos_id, product_id, branch_id, qty, reason, note) values (p_kos, p.id, v_b, v_qty, p_reason, nullif(trim(coalesce(p_note, '')), ''))
  returning id into v_id;
  return v_id;
end $$;

-- p_action: lepas (kembali bisa dijual) / buang (rusak/kedaluwarsa → keluar stok) / diretur (sudah diretur ke supplier lewat Belanja, hanya menutup)
create or replace function public.hold_decide(p_hold uuid, p_action text, p_qty numeric default null, p_note text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare h stock_holds; p products; v_qty numeric; v_status text; v_kind text;
begin
  select * into h from stock_holds where id = p_hold for update;
  if h.id is null or not member_in('stock', h.kos_id) then raise exception 'Data tidak ditemukan'; end if;
  if h.status <> 'ditahan' then raise exception 'Barang ini sudah diputuskan'; end if;
  v_qty := coalesce(round(p_qty, 3), h.qty);
  if v_qty <= 0 or v_qty > h.qty + 0.0005 then raise exception 'Jumlah 0 sampai %', trim(to_char(h.qty, 'FM999999990.###'), '.'); end if;
  v_status := case p_action when 'lepas' then 'dilepas' when 'buang' then 'dibuang' when 'buang_exp' then 'dibuang' when 'diretur' then 'diretur' end;
  if v_status is null then raise exception 'Pilihan tidak dikenal'; end if;
  if v_status = 'dibuang' then
    if approval_needed(h.kos_id, 'penyesuaian_stok') then raise exception 'PERLU_PERSETUJUAN: Membuang barang perlu persetujuan pemilik (aturan Penyesuaian stok).'; end if;
    v_kind := case when p_action = 'buang_exp' then 'kedaluwarsa' else 'rusak' end;
    select * into p from products where id = h.product_id for update;
    update products set stock = stock - v_qty where id = p.id;
    insert into stock_moves(kos_id, product_id, kind, delta, stock_after, value, note, branch_id, ref_id)
    values (h.kos_id, p.id, v_kind, -v_qty, p.stock - v_qty, round(-v_qty * p.cost, 2),
            'Dibuang dari barang ditahan' || coalesce(' · ' || nullif(trim(coalesce(p_note, '')), ''), coalesce(' · ' || h.note, '')), h.branch_id, h.id);
  end if;
  if v_qty < h.qty - 0.0005 then   -- sebagian: sisa tetap ditahan, bagian yang diputuskan dicatat sebagai baris tertutup
    update stock_holds set qty = qty - v_qty where id = h.id;
    insert into stock_holds(kos_id, product_id, branch_id, qty, reason, note, ref_id, status, created_by, created_at, closed_by, closed_at, close_note)
    values (h.kos_id, h.product_id, h.branch_id, v_qty, h.reason, h.note, h.ref_id, v_status, h.created_by, h.created_at, auth.uid(), now(), nullif(trim(coalesce(p_note, '')), ''));
  else
    update stock_holds set status = v_status, closed_by = auth.uid(), closed_at = now(), close_note = nullif(trim(coalesce(p_note, '')), '') where id = h.id;
  end if;
  return jsonb_build_object('status', v_status, 'qty', v_qty);
end $$;

create or replace function public.hold_list(p_kos uuid, p_all boolean default false)
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if not member_in('stock,finance', p_kos) then raise exception 'Tidak punya akses ke stok'; end if;
  return (select coalesce(jsonb_agg(jsonb_build_object('id', h.id, 'product_id', h.product_id, 'name', p.name, 'base_unit', p.base_unit, 'branch_id', h.branch_id,
      'qty', h.qty, 'value', round(h.qty * p.cost, 0), 'reason', h.reason, 'note', h.note, 'status', h.status, 'created_at', h.created_at, 'closed_at', h.closed_at,
      'close_note', h.close_note, 'ref', (select number from sale_returns where id = h.ref_id)) order by (h.status = 'ditahan') desc, h.created_at desc), '[]'::jsonb)
    from stock_holds h join products p on p.id = h.product_id
    where h.kos_id = p_kos and (h.status = 'ditahan' or (p_all and h.closed_at > now() - interval '60 days')));
end $$;

create or replace function public.product_set_max(p_product uuid, p_max numeric)
returns void language plpgsql security definer set search_path = public as $$
declare p products;
begin
  select * into p from products where id = p_product;
  if p.id is null or not member_in('stock', p.kos_id) then raise exception 'Barang tidak ditemukan'; end if;
  if p_max is not null and p_max <= 0 then raise exception 'Stok maksimum harus lebih dari 0 (kosongkan bila tidak dipakai)'; end if;
  if p_max is not null and p_max < coalesce(p.min_stock, 0) then raise exception 'Stok maksimum tidak boleh lebih kecil dari stok minimum'; end if;
  update products set max_stock = round(p_max, 3) where id = p.id;
end $$;

-- ---------- Mutasi: kirim → terima / batal ----------
-- sisa daftar batch setelah diambil p_qty dari depan
create or replace function public.batch_list_rest(p_list jsonb, p_qty numeric)
returns jsonb language plpgsql immutable as $$
declare x jsonb; v_left numeric := coalesce(p_qty, 0); v_out jsonb := '[]'; v_q numeric;
begin
  for x in select * from jsonb_array_elements(coalesce(p_list, '[]'::jsonb)) loop
    v_q := (x->>'qty')::numeric;
    if v_left >= v_q then v_left := v_left - v_q;
    elsif v_left > 0 then v_out := v_out || jsonb_build_array(jsonb_set(x, '{qty}', to_jsonb(v_q - v_left))); v_left := 0;
    else v_out := v_out || jsonb_build_array(x); end if;
  end loop;
  return v_out;
end $$;

create or replace function public.stock_transfer_send(p_id uuid, p_kos uuid, p_from uuid, p_to uuid, p_lines jsonb, p_note text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_day date := (now() at time zone 'Asia/Jakarta')::date; v_no text; x jsonb; p products; v_qty numeric; v_have numeric; v_ex stock_transfers; v_lines jsonb := '[]'; v_bt jsonb;
begin
  if not member_in('stock', p_kos) then raise exception 'Tidak punya akses ke stok'; end if;
  select * into v_ex from stock_transfers where id = p_id;
  if v_ex.id is not null then return jsonb_build_object('id', v_ex.id, 'number', v_ex.number, 'duplicate', true); end if;
  if p_from = p_to then raise exception 'Lokasi asal dan tujuan harus berbeda'; end if;
  if (select count(*) from branches where id in (p_from, p_to) and kos_id = p_kos and active) <> 2 then raise exception 'Lokasi tidak ditemukan atau nonaktif'; end if;
  if not member_can(p_kos, 'team') and exists (select 1 from member_locations where kos_id = p_kos and user_id = auth.uid() and locked and branch_id <> p_from) then
    raise exception 'Anda hanya bisa mengirim barang dari lokasi kerja Anda'; end if;
  if jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) = 0 then raise exception 'Pilih barang yang dikirim'; end if;
  perform pg_advisory_xact_lock(hashtext('mutasi:' || p_kos::text));
  v_no := 'MUT-' || to_char(v_day, 'YYMMDD') || '-' || lpad(((select count(*) from stock_transfers where kos_id = p_kos and created_at >= v_day) + 1)::text, 3, '0');
  insert into stock_transfers(id, kos_id, number, from_branch, to_branch, lines, note, created_email, status)
  values (p_id, p_kos, v_no, p_from, p_to, '[]', nullif(trim(coalesce(p_note, '')), ''), actor_email(), 'dikirim');
  for x in select * from jsonb_array_elements(p_lines) loop
    select * into p from products where id = (x->>'product_id')::uuid and kos_id = p_kos for update;
    if p.id is null then raise exception 'Barang tidak ditemukan'; end if;
    v_qty := case when nullif(trim(coalesce(x->>'unit', '')), '') is not null then unit_to_base(p.id, x->>'unit', (x->>'qty')::numeric)
                  else round(coalesce((x->>'qty')::numeric, 0), 3) end;
    if v_qty <= 0 then raise exception 'Jumlah % harus lebih dari 0', p.name; end if;
    select coalesce(qty, 0) into v_have from stock_levels where product_id = p.id and branch_id = p_from;
    if coalesce(v_have, 0) < v_qty then raise exception 'Stok % di lokasi asal hanya % %', p.name, trim(to_char(coalesce(v_have, 0), 'FM999999990.###')), p.base_unit; end if;
    perform set_config('prasara.batch_out', '', true);
    insert into stock_moves(kos_id, product_id, kind, delta, stock_after, value, ref_id, note, branch_id)
    values (p_kos, p.id, 'transfer', -v_qty, p.stock, 0, p_id, v_no || ' dikirim', p_from);
    v_bt := nullif(current_setting('prasara.batch_out', true), '')::jsonb;
    perform set_config('prasara.batch_out', '', true);
    v_lines := v_lines || jsonb_build_object('product_id', p.id, 'name', p.name, 'qty', v_qty, 'unit', p.base_unit, 'batches', coalesce(v_bt, '[]'::jsonb));
  end loop;
  update stock_transfers set lines = v_lines where id = p_id;
  return jsonb_build_object('id', p_id, 'number', v_no, 'duplicate', false);
end $$;

-- p_lines: [{product_id, qty}] jumlah yang DITERIMA (satuan utama); barang yang tidak disebut = diterima penuh.
-- p_short: 'kembali' (kurangnya balik ke lokasi asal) | 'hilang' (hilang/rusak di jalan → keluar stok)
create or replace function public.stock_transfer_receive(p_id uuid, p_lines jsonb, p_short text default 'kembali', p_note text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare t stock_transfers; x jsonb; r jsonb; p products; v_rec numeric; v_short numeric; v_out jsonb := '[]'; v_lost numeric := 0; v_rest jsonb; v_any boolean := false;
begin
  select * into t from stock_transfers where id = p_id for update;
  if t.id is null or not member_in('stock', t.kos_id) then raise exception 'Mutasi tidak ditemukan'; end if;
  if t.status <> 'dikirim' then raise exception 'Mutasi ini sudah % ', case t.status when 'selesai' then 'diterima' else 'dibatalkan' end; end if;
  if not member_can(t.kos_id, 'team') and exists (select 1 from member_locations where kos_id = t.kos_id and user_id = auth.uid() and locked and branch_id <> t.to_branch) then
    raise exception 'Hanya lokasi tujuan yang bisa menerima kiriman ini'; end if;
  if coalesce(p_short, 'kembali') not in ('kembali', 'hilang') then raise exception 'Pilih: kekurangan kembali ke asal atau hilang di jalan'; end if;
  for x in select * from jsonb_array_elements(t.lines) loop
    select e.value into r from jsonb_array_elements(coalesce(p_lines, '[]'::jsonb)) e where (e.value->>'product_id')::uuid = (x->>'product_id')::uuid limit 1;
    v_rec := coalesce(round((r->>'qty')::numeric, 3), (x->>'qty')::numeric);
    if v_rec < 0 or v_rec > (x->>'qty')::numeric + 0.0005 then raise exception 'Jumlah diterima % antara 0 dan %', x->>'name', x->>'qty'; end if;
    v_short := (x->>'qty')::numeric - v_rec;
    if v_short > 0.0005 and p_short = 'hilang' then v_lost := v_lost + 1; end if;
    r := null;
  end loop;
  if v_lost > 0 and approval_needed(t.kos_id, 'penyesuaian_stok') then
    raise exception 'PERLU_PERSETUJUAN: Mencatat barang hilang di jalan perlu persetujuan pemilik (aturan Penyesuaian stok). Pilih "kembali ke asal" atau minta pemilik menerima kiriman ini.'; end if;
  for x in select * from jsonb_array_elements(t.lines) loop
    select * into p from products where id = (x->>'product_id')::uuid for update;
    select e.value into r from jsonb_array_elements(coalesce(p_lines, '[]'::jsonb)) e where (e.value->>'product_id')::uuid = p.id limit 1;
    v_rec := coalesce(round((r->>'qty')::numeric, 3), (x->>'qty')::numeric);
    v_short := round((x->>'qty')::numeric - v_rec, 3);
    r := null;
    if v_rec > 0 then
      perform set_config('prasara.batch_out', coalesce(x->'batches', '[]'::jsonb)::text, true);
      insert into stock_moves(kos_id, product_id, kind, delta, stock_after, value, ref_id, note, branch_id)
      values (t.kos_id, p.id, 'transfer', v_rec, p.stock, 0, t.id, t.number || ' diterima', t.to_branch);
    end if;
    v_rest := batch_list_rest(x->'batches', v_rec);
    if v_short > 0 then
      perform set_config('prasara.batch_out', v_rest::text, true);
      if p_short = 'kembali' then
        insert into stock_moves(kos_id, product_id, kind, delta, stock_after, value, ref_id, note, branch_id)
        values (t.kos_id, p.id, 'transfer', v_short, p.stock, 0, t.id, t.number || ' kembali ke asal', t.from_branch);
      else
        insert into stock_moves(kos_id, product_id, kind, delta, stock_after, value, ref_id, note, branch_id)
        values (t.kos_id, p.id, 'transfer', v_short, p.stock, 0, t.id, t.number || ' (hilang di jalan)', t.to_branch);
        update products set stock = stock - v_short where id = p.id;
        insert into stock_moves(kos_id, product_id, kind, delta, stock_after, value, ref_id, note, branch_id)
        values (t.kos_id, p.id, 'rusak', -v_short, p.stock - v_short, round(-v_short * p.cost, 2), t.id, t.number || ' hilang/rusak di perjalanan', t.to_branch);
      end if;
    end if;
    perform set_config('prasara.batch_out', '', true);
    if v_short > 0 then v_any := true; end if;
    v_out := v_out || jsonb_build_object('product_id', p.id, 'name', x->>'name', 'sent', (x->>'qty')::numeric, 'received', v_rec, 'short', v_short);
  end loop;
  update stock_transfers set status = 'selesai', received_at = now(), received_email = actor_email(), received = v_out,
         receive_note = nullif(concat_ws(' · ', nullif(trim(coalesce(p_note, '')), ''),
           case when v_any then 'kekurangan ' || case when p_short = 'hilang' then 'dicatat hilang di jalan' else 'kembali ke lokasi asal' end end), '')
  where id = t.id;
  return jsonb_build_object('number', t.number, 'lines', v_out);
end $$;

create or replace function public.stock_transfer_cancel(p_id uuid, p_reason text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare t stock_transfers; x jsonb; p products;
begin
  select * into t from stock_transfers where id = p_id for update;
  if t.id is null or not member_in('stock', t.kos_id) then raise exception 'Mutasi tidak ditemukan'; end if;
  if t.status <> 'dikirim' then raise exception 'Hanya kiriman yang belum diterima yang bisa dibatalkan'; end if;
  if coalesce(length(trim(p_reason)), 0) < 3 then raise exception 'Tuliskan alasan pembatalan'; end if;
  for x in select * from jsonb_array_elements(t.lines) loop
    select * into p from products where id = (x->>'product_id')::uuid for update;
    perform set_config('prasara.batch_out', coalesce(x->'batches', '[]'::jsonb)::text, true);
    insert into stock_moves(kos_id, product_id, kind, delta, stock_after, value, ref_id, note, branch_id)
    values (t.kos_id, p.id, 'transfer', (x->>'qty')::numeric, p.stock, 0, t.id, t.number || ' batal, kembali ke asal', t.from_branch);
    perform set_config('prasara.batch_out', '', true);
  end loop;
  update stock_transfers set status = 'batal', received_at = now(), received_email = actor_email(), receive_note = 'Dibatalkan: ' || trim(p_reason) where id = t.id;
  return jsonb_build_object('number', t.number);
end $$;

-- ---------- Cek stok pesanan grosir ----------
create or replace function public.so_stock_check(p_order uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare o so_orders; v_b uuid;
begin
  select * into o from so_orders where id = p_order;
  if o.id is null or not member_in('sell,finance', o.kos_id) then raise exception 'Pesanan tidak ditemukan'; end if;
  v_b := coalesce(o.branch_id, branch_main_id(o.kos_id));
  return (select coalesce(jsonb_agg(z order by z.sort), '[]'::jsonb) from (
    select l.id as line_id, l.sort, l.name, l.unit, l.unit_qty, p.base_unit,
           greatest(l.qty - l.qty_sent, 0) * l.unit_qty as need,
           coalesce((select qty from stock_levels where product_id = l.product_id and branch_id = v_b), 0)
             - stock_held_at(l.product_id, v_b) - stock_reserved_at(l.product_id, v_b, o.id) as available,
           stock_transit_at(l.product_id, v_b) as incoming
    from so_lines l join products p on p.id = l.product_id where l.order_id = o.id and l.qty > l.qty_sent) z);
end $$;

-- ---------- Kesehatan stok (aturan tertulis, bisa dicek) ----------
-- cepat  : terjual 30 hari terakhir dan stok cukup ≤ 30 hari
-- normal : stok cukup 31–90 hari
-- lambat : stok cukup > 90 hari, atau belum terjual sejak masuk 30–89 hari lalu
-- mati   : ada stok, tidak terjual 90 hari, stok sudah ≥ 90 hari
-- baru   : stok masuk < 30 hari dan belum terjual
-- habis  : stok ≤ 0
-- "stok cukup" = stok ÷ rata-rata terjual per hari (90 hari). Umur stok = batch tertua yang masih ada, atau sejak barang terakhir masuk.
create or replace function public.stock_health(p_kos uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if not member_in('stock,finance', p_kos) then raise exception 'Tidak punya akses ke stok'; end if;
  return (with mv as (
      select m.product_id,
             max(m.created_at) filter (where m.kind = 'jual') as last_sale,
             max(m.created_at) filter (where m.delta > 0 and m.kind in ('beli', 'awal', 'titip', 'koreksi', 'opname')) as last_in,
             min(m.created_at) filter (where m.delta > 0) as first_in,
             coalesce(-sum(m.delta) filter (where m.kind = 'jual' and m.created_at >= now() - interval '90 days'), 0) as sold90,
             coalesce(-sum(m.delta) filter (where m.kind = 'jual' and m.created_at >= now() - interval '30 days'), 0) as sold30
      from stock_moves m where m.kos_id = p_kos group by m.product_id
    ), bt as (select product_id, min(received_at) as oldest from stock_batches where kos_id = p_kos and qty > 0 group by 1),
    base as (
      select p.id, p.name, p.base_unit, p.stock, p.cost, p.min_stock, p.max_stock, p.consign_contact_id is not null as consign,
             mv.last_sale, coalesce(mv.sold30, 0) as sold30, coalesce(mv.sold90, 0) as sold90,
             floor(extract(epoch from now() - coalesce(bt.oldest, mv.last_in, mv.first_in, p.created_at)) / 86400)::int as age,
             case when coalesce(mv.sold90, 0) > 0 then round(p.stock / (mv.sold90 / 90.0)) end as cover
      from products p left join mv on mv.product_id = p.id left join bt on bt.product_id = p.id
      where p.kos_id = p_kos and p.active),
    cls as (
      select b.*, case
        when b.stock <= 0 then 'habis'
        when b.sold90 = 0 and b.age < 30 then 'baru'
        when b.sold90 = 0 and b.age >= 90 and (b.last_sale is null or b.last_sale < now() - interval '90 days') then 'mati'
        when b.sold90 = 0 then 'lambat'
        when b.cover > 90 then 'lambat'
        when b.sold30 > 0 and b.cover <= 30 then 'cepat'
        else 'normal' end as kelas,
        (b.max_stock is not null and b.stock > b.max_stock) as over_max
      from base b)
    select jsonb_build_object(
      'aturan', jsonb_build_object('cepat_hari', 30, 'lambat_hari', 90, 'mati_hari', 90, 'baru_hari', 30),
      'ringkas', (select jsonb_object_agg(k, v) from (select kelas as k, jsonb_build_object('n', count(*), 'nilai', round(sum(greatest(stock, 0) * cost), 0)) as v from cls group by kelas) s),
      'over_max', (select count(*) from cls where over_max),
      'rows', (select coalesce(jsonb_agg(jsonb_build_object('product_id', id, 'name', name, 'base_unit', base_unit, 'stock', stock, 'value', round(greatest(stock, 0) * cost, 0),
          'sold30', sold30, 'sold90', sold90, 'cover', cover, 'age', age, 'last_sale', last_sale, 'kelas', kelas, 'over_max', over_max, 'max_stock', max_stock, 'consign', consign)
          order by case kelas when 'mati' then 0 when 'lambat' then 1 when 'habis' then 2 when 'cepat' then 3 when 'baru' then 4 else 5 end, greatest(stock, 0) * cost desc), '[]'::jsonb) from cls)) );
end $$;

-- ---------- Aturan stok minus memakai stok TERSEDIA (perbaikan: trigger lokasi sudah memotong stok lokasi sebelum aturan ini) ----------
create or replace function public.stock_moves_policy() returns trigger language plpgsql security definer set search_path = public as $$
declare v_mode text; v_after numeric; v_res numeric; v_held numeric; p products; v_b uuid;
begin
  if new.kind <> 'jual' or new.delta >= 0 then return new; end if;
  select profile->>'stock_policy' into v_mode from kos where id = new.kos_id;
  if coalesce(v_mode, 'izinkan') <> 'tolak' then return new; end if;
  select * into p from products where id = new.product_id;
  if loc_multi(new.kos_id) and new.branch_id is not null then
    v_b := new.branch_id;
    v_after := coalesce((select qty from stock_levels where product_id = new.product_id and branch_id = new.branch_id), 0);   -- sudah termasuk gerak ini
  else
    v_b := null;
    v_after := new.stock_after;
  end if;
  if v_after < -0.0005 then
    raise exception 'STOK_KURANG: Stok % % tinggal % %, tidak cukup. Catat dulu barang masuk/mutasi, atau ubah aturan stok minus di Pengaturan.',
      p.name, case when v_b is not null then 'di lokasi ini' else '' end, trim(to_char(v_after - new.delta, 'FM999999990.###'), '.'), p.base_unit;
  end if;
  v_res := stock_reserved_at(p.id, v_b);
  v_held := stock_held_at(p.id, v_b);
  if v_after - v_res - v_held < -0.0005 then
    raise exception 'STOK_KURANG: Stok % tinggal % %, tetapi % % sedang % — yang bisa dijual hanya % %. Kirim dulu pesanan grosir/putuskan barang ditahan, atau ubah aturan stok minus di Pengaturan.',
      p.name, trim(to_char(v_after - new.delta, 'FM999999990.###'), '.'), p.base_unit,
      trim(to_char(v_res + v_held, 'FM999999990.###'), '.'), p.base_unit,
      concat_ws(' & ', case when v_res > 0 then 'dipesan pelanggan grosir' end, case when v_held > 0 then 'ditahan (rusak/karantina)' end),
      trim(to_char(greatest(v_after - new.delta - v_res - v_held, 0), 'FM999999990.###'), '.'), p.base_unit;
  end if;
  return new;
end $$;

-- ---------- Peristiwa (riwayat aktivitas) ----------
create or replace function public.dom_stock_holds() returns trigger language plpgsql security definer set search_path = public as $$
declare v_name text := (select name from products where id = new.product_id);
begin
  if tg_op = 'INSERT' and new.status = 'ditahan' then
    perform dom_emit(new.kos_id, 'StockHeld', 'stock_hold', new.id, new.id::text, 'stock',
      'Ditahan ' || v_name || ' ' || trim(to_char(new.qty, 'FM999999990.###'), '.') || ' (' || new.reason || ')', null, jsonb_build_object('qty', new.qty, 'reason', new.reason));
  elsif new.status <> 'ditahan' and (tg_op = 'INSERT' or old.status = 'ditahan') then
    perform dom_emit(new.kos_id, 'StockHoldClosed', 'stock_hold', new.id, new.id::text || ':' || new.status, 'stock',
      v_name || ' ' || trim(to_char(new.qty, 'FM999999990.###'), '.') || ' ' || new.status, null, jsonb_build_object('qty', new.qty, 'status', new.status));
  end if;
  return null;
end $$;
drop trigger if exists dom_stock_holds on public.stock_holds;
create trigger dom_stock_holds after insert or update of status on public.stock_holds for each row execute function public.dom_stock_holds();

create or replace function public.dom_stock_transfers_status() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status is distinct from old.status and new.status in ('selesai', 'batal') and old.status = 'dikirim' then
    perform dom_emit(new.kos_id, case when new.status = 'selesai' then 'StockTransferReceived' else 'StockTransferCancelled' end, 'stock_transfer', new.id, new.id::text || ':' || new.status, 'stock',
      'Mutasi ' || new.number || case when new.status = 'selesai' then ' diterima' else ' dibatalkan' end || coalesce(' · ' || new.receive_note, ''), null, jsonb_build_object('number', new.number));
  end if;
  return null;
end $$;
drop trigger if exists dom_stock_transfers_status on public.stock_transfers;
create trigger dom_stock_transfers_status after update of status on public.stock_transfers for each row execute function public.dom_stock_transfers_status();

-- ---------- Patch fungsi lama ----------
create or replace function public._prasara_patch(p_sig text, p_old text, p_new text)
returns void language plpgsql as $$
declare v_def text;
begin
  v_def := pg_get_functiondef(p_sig::regprocedure);
  if position(p_old in v_def) = 0 then raise exception 'Patch % tidak menemukan teks: %', p_sig, left(p_old, 80); end if;
  execute replace(v_def, p_old, p_new);
end $$;

-- retur barang rusak: stok tetap masuk (barang fisik kembali), lalu langsung DITAHAN agar tidak terjual
select public._prasara_patch('public.sale_return_create(uuid, uuid, jsonb, text, text)',
  $x$v_factor numeric; v_existing sale_returns;$x$, $x$v_factor numeric; v_existing sale_returns; v_hb uuid;$x$);
select public._prasara_patch('public.sale_return_create(uuid, uuid, jsonb, text, text)',
  $x$values (s.kos_id, l.product_id, 'retur_jual', v_base, v_stock, round(v_base * l.cost, 2), p_id, v_no || ' dari ' || s.number);$x$,
  $x$values (s.kos_id, l.product_id, 'retur_jual', v_base, v_stock, round(v_base * l.cost, 2), p_id, v_no || ' dari ' || s.number) returning branch_id into v_hb;
    if coalesce((x->>'rusak')::boolean, false) then
      insert into stock_holds(kos_id, product_id, branch_id, qty, reason, note, ref_id) values (s.kos_id, l.product_id, v_hb, v_base, 'retur_rusak', 'Retur ' || v_no || ' · ' || trim(p_reason), p_id);
    end if;$x$);

-- katalog kasir: dipesan & ditahan per barang (lokasi kerja bila multi-lokasi)
select public._prasara_patch('public.kasir_catalog(uuid)',
  $x$'stock_total', p.stock) else '{}'::jsonb end order by p.name)$x$,
  $x$'stock_total', p.stock) else '{}'::jsonb end || jsonb_build_object('reserved', stock_reserved_at(p.id, case when loc_multi(p_kos) then stock_loc(p_kos) end), 'held', stock_held_at(p.id, case when loc_multi(p_kos) then stock_loc(p_kos) end)) order by p.name)$x$);

-- saran belanja: hitung yang sudah dipesan pelanggan & batasi sampai stok maksimum
select public._prasara_patch('public.reorder_suggest(uuid, integer, integer, integer)',
  $x$select p.id, p.name, p.base_unit, p.stock, p.min_stock, coalesce(p.lead_days, 3) lead, p.cost,$x$,
  $x$select p.id, p.name, p.base_unit, p.stock, p.min_stock, p.max_stock, stock_reserved_at(p.id) + stock_held_at(p.id) reserved, coalesce(p.lead_days, 3) lead, p.cost,$x$);
select public._prasara_patch('public.reorder_suggest(uuid, integer, integer, integer)',
  $x$greatest(0, round(c.per_day * (c.lead + p_cover) + c.min_stock - c.stock - c.on_order, 3)) need$x$,
  $x$greatest(0, least(round(c.per_day * (c.lead + p_cover) + c.min_stock + c.reserved - c.stock - c.on_order, 3),
      case when c.max_stock is not null then round(c.max_stock + c.reserved - c.stock - c.on_order, 3) else 1e12 end)) need$x$);
select public._prasara_patch('public.reorder_suggest(uuid, integer, integer, integer)',
  $x$'on_order', r.on_order,$x$, $x$'on_order', r.on_order, 'reserved', r.reserved, 'max_stock', r.max_stock,$x$);
select public._prasara_patch('public.reorder_suggest(uuid, integer, integer, integer)',
  $x$from rec r where r.need > 0 and r.stock + r.on_order <= r.rop and (r.per_day > 0 or r.min_stock > 0);$x$,
  $x$from rec r where r.need > 0 and r.stock - r.reserved + r.on_order <= r.rop and (r.per_day > 0 or r.min_stock > 0 or r.reserved > 0);$x$);
select public._prasara_patch('public.reorder_suggest(uuid, integer, integer, integer)',
  $x$'reason', case when r.stock <= 0 then 'habis'$x$,
  $x$'reason', case when r.stock <= 0 then 'habis' when r.reserved > 0 and r.stock - r.reserved <= r.min_stock then 'sudah dipesan/ditahan ' || trim(to_char(r.reserved, 'FM999999990.###'), '.') || ' ' || r.base_unit$x$);

drop function public._prasara_patch(text, text, text);

revoke execute on function public.stock_avail(uuid), public.hold_create(uuid, uuid, text, numeric, text, text, uuid), public.hold_decide(uuid, text, numeric, text),
  public.hold_list(uuid, boolean), public.product_set_max(uuid, numeric), public.stock_transfer_send(uuid, uuid, uuid, uuid, jsonb, text),
  public.stock_transfer_receive(uuid, jsonb, text, text), public.stock_transfer_cancel(uuid, text), public.so_stock_check(uuid), public.stock_health(uuid) from public, anon;
grant execute on function public.stock_avail(uuid), public.hold_create(uuid, uuid, text, numeric, text, text, uuid), public.hold_decide(uuid, text, numeric, text),
  public.hold_list(uuid, boolean), public.product_set_max(uuid, numeric), public.stock_transfer_send(uuid, uuid, uuid, uuid, jsonb, text),
  public.stock_transfer_receive(uuid, jsonb, text, text), public.stock_transfer_cancel(uuid, text), public.so_stock_check(uuid), public.stock_health(uuid) to authenticated;
revoke execute on function public.batch_list_rest(jsonb, numeric), public.dom_stock_holds(), public.dom_stock_transfers_status() from public, anon, authenticated;
