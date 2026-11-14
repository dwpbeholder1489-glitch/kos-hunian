-- Konsinyasi / titip jual (Modul V2.0 Bab 17; backlog P2). Modul r_konsinyasi (retail).
-- Penitip = kontak supplier. Barang titipan = products.consign_contact_id terisi; products.cost = HARGA TITIP per satuan utama.
-- Prinsip (mesin lama tidak diubah — Kasir, retur, batal, opname, mutasi tetap sama):
--   * Terima titipan  = stock_moves 'titip' (+)          → jurnal Persediaan ↔ Titipan konsinyasi (kewajiban, 2-1600). BUKAN utang, bukan belanja.
--   * Kembalikan      = stock_moves 'titip_kembali' (−)  → jurnal kebalikannya.
--   * Setiap gerak stok LAIN pada barang titipan (jual, retur jual, batal, rusak, kedaluwarsa, opname, koreksi) memindahkan nilainya
--     dari Titipan konsinyasi ke Utang usaha: terjual/hilang/rusak = toko wajib menyetor harga titipnya ke penitip.
--     Jadi utang ke penitip = −Σ value gerak stok itu, otomatis masuk contact_balance → dilunasi lewat Kas › Utang supplier (debt_pay).
--   * Laba toko = harga jual − harga titip (HPP penjualan memakai products.cost seperti biasa).
--   * Barang titipan tidak boleh dibeli lewat Belanja / diberi stok awal; harga titip hanya berubah lewat Terima titipan (rata-rata).

alter table public.products add column if not exists consign_contact_id uuid references public.contacts(id);
create index if not exists products_consign on public.products(consign_contact_id) where consign_contact_id is not null;

alter table public.stock_moves drop constraint if exists stock_moves_kind_check;
alter table public.stock_moves add constraint stock_moves_kind_check check (kind in ('awal', 'opname', 'rusak', 'kedaluwarsa', 'koreksi', 'jual', 'beli', 'retur_jual', 'retur_beli', 'batal', 'transfer', 'pakai', 'titip', 'titip_kembali'));

create table if not exists public.consign_docs (
  id uuid primary key default gen_random_uuid(),
  kos_id uuid not null references public.kos(id) on delete cascade,
  number text not null,
  kind text not null check (kind in ('terima', 'kembali')),
  contact_id uuid not null references public.contacts(id),
  doc_date date not null,
  total numeric(14,2) not null default 0,
  note text,
  created_by uuid default auth.uid(), created_at timestamptz not null default now()
);
create index if not exists consign_docs_kos on public.consign_docs(kos_id, contact_id, created_at desc);
create table if not exists public.consign_doc_lines (
  id uuid primary key default gen_random_uuid(),
  doc_id uuid not null references public.consign_docs(id) on delete cascade,
  kos_id uuid not null references public.kos(id) on delete cascade,
  product_id uuid not null references public.products(id),
  name text not null, unit text not null, unit_qty numeric(14,3) not null,
  qty numeric(14,3) not null check (qty > 0),
  price numeric(14,2) not null default 0,     -- harga titip per satuan ini
  line_total numeric(14,2) not null default 0
);
create index if not exists consign_doc_lines_doc on public.consign_doc_lines(doc_id);

do $$
declare t text;
begin
  foreach t in array array['consign_docs', 'consign_doc_lines'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists %I on public.%I', t || '_select', t);
    execute format('create policy %I on public.%I for select using (member_can(kos_id, %L))', t || '_select', t, 'stock,finance');
    execute format('grant select on public.%I to authenticated', t);
    execute format('drop trigger if exists zz_kos_open_guard on public.%I', t);
    execute format('create trigger zz_kos_open_guard before insert or update or delete on public.%I for each row execute function public.kos_open_guard()', t);
  end loop;
end $$;

-- ---------- Pengaman barang titipan ----------
create or replace function public.consign_products_guard() returns trigger language plpgsql as $$
begin
  if coalesce(current_setting('prasara.consign_ok', true), '') = '1' then return new; end if;
  if old.consign_contact_id is not null and new.cost is distinct from old.cost then
    raise exception 'Harga titip % hanya berubah lewat Konsinyasi › Terima titipan (isi harga titip yang baru di sana).', old.name;
  end if;
  if new.consign_contact_id is distinct from old.consign_contact_id then
    raise exception 'Status barang titipan diatur lewat menu Konsinyasi.';
  end if;
  return new;
end $$;
drop trigger if exists consign_products_guard on public.products;
create trigger consign_products_guard before update on public.products for each row execute function public.consign_products_guard();

create or replace function public.consign_moves_guard() returns trigger language plpgsql as $$
declare v uuid;
begin
  select consign_contact_id into v from products where id = new.product_id;
  if v is not null and new.kind in ('awal', 'beli', 'retur_beli', 'pakai') then
    raise exception 'Barang titipan tidak dicatat lewat Belanja atau stok awal. Pakai Konsinyasi › Terima titipan / Kembalikan.';
  end if;
  if v is null and new.kind in ('titip', 'titip_kembali') then raise exception 'Barang ini bukan barang titipan'; end if;
  return new;
end $$;
drop trigger if exists consign_moves_guard on public.stock_moves;
create trigger consign_moves_guard before insert on public.stock_moves for each row execute function public.consign_moves_guard();

create or replace function public.consign_purchase_guard() returns trigger language plpgsql as $$
begin
  if exists (select 1 from products where id = new.product_id and consign_contact_id is not null) then
    raise exception '% adalah barang titipan: tidak dibeli lewat Belanja. Catat di Konsinyasi › Terima titipan.', new.name;
  end if;
  return new;
end $$;
drop trigger if exists consign_purchase_guard on public.purchase_lines;
create trigger consign_purchase_guard before insert on public.purchase_lines for each row execute function public.consign_purchase_guard();

create or replace function public.consign_guard(p_kos uuid, p_area text) returns void language plpgsql stable security definer set search_path = public as $$
begin
  if p_kos is null or not (member_in(p_area, p_kos)) then raise exception 'Tidak punya akses ke bisnis ini'; end if;
  if not module_on(p_kos, 'r_konsinyasi') then raise exception 'Modul Konsinyasi belum aktif (Konfigurasi › Modul)'; end if;
end $$;

-- ---------- Terima / kembalikan titipan ----------
-- p_lines: [{product_id, unit, qty, price}] — price = harga titip per satuan itu (wajib saat terima)
create or replace function public.consign_doc_create(p_id uuid, p_kos uuid, p_kind text, p_contact uuid, p_lines jsonb, p_date date default null, p_note text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare c contacts; d consign_docs; l jsonb; p products; u product_units; v_day date := coalesce(p_date, (now() at time zone 'Asia/Jakarta')::date);
        v_no text; v_seq int; v_qty numeric; v_price numeric; v_base numeric; v_unit_cost numeric; v_new numeric; v_val numeric; v_total numeric := 0;
begin
  perform consign_guard(p_kos, 'stock');
  select * into d from consign_docs where id = p_id;
  if d.id is not null then
    if d.kos_id <> p_kos then raise exception 'Dokumen tidak valid'; end if;
    return jsonb_build_object('id', d.id, 'number', d.number, 'total', d.total, 'duplicate', true);
  end if;
  if p_kind not in ('terima', 'kembali') then raise exception 'Jenis dokumen tidak dikenal'; end if;
  select * into c from contacts where id = p_contact and kos_id = p_kos and kind = 'supplier';
  if c.id is null then raise exception 'Pilih penitip (supplier) dulu'; end if;
  if v_day > (now() at time zone 'Asia/Jakarta')::date then raise exception 'Tanggal tidak boleh di masa depan'; end if;
  if jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) = 0 then raise exception 'Isi barangnya dulu'; end if;
  perform pg_advisory_xact_lock(hashtext('consign:' || p_kos::text));
  select count(*) + 1 into v_seq from consign_docs where kos_id = p_kos and kind = p_kind and created_at::date = now()::date;
  v_no := case p_kind when 'terima' then 'TT-' else 'KT-' end || to_char(v_day, 'YYMMDD') || '-' || lpad(v_seq::text, 3, '0');
  insert into consign_docs(id, kos_id, number, kind, contact_id, doc_date, note) values (p_id, p_kos, v_no, p_kind, c.id, v_day, nullif(trim(coalesce(p_note, '')), ''));
  perform set_config('prasara.consign_ok', '1', true);
  for l in select * from jsonb_array_elements(p_lines) loop
    select * into p from products where id = (l->>'product_id')::uuid and kos_id = p_kos for update;
    if p.id is null then raise exception 'Barang tidak ditemukan'; end if;
    select * into u from product_units where product_id = p.id and name = l->>'unit';
    if u.product_id is null then raise exception 'Satuan "%" untuk % tidak ada', l->>'unit', p.name; end if;
    v_qty := (l->>'qty')::numeric;
    if v_qty is null or v_qty <= 0 then raise exception 'Jumlah % harus lebih dari 0', p.name; end if;
    v_base := round(v_qty * u.qty, 3);
    if p_kind = 'terima' then
      if p.consign_contact_id is null then
        if p.stock <> 0 or exists (select 1 from stock_moves where product_id = p.id) then
          raise exception '% sudah punya riwayat stok sebagai barang milik toko. Buat barang baru (stok awal 0) untuk barang titipan.', p.name;
        end if;
        update products set consign_contact_id = c.id where id = p.id;
      elsif p.consign_contact_id <> c.id then
        raise exception '% adalah titipan dari penitip lain', p.name;
      end if;
      v_price := nullif(l->>'price', '')::numeric;
      if v_price is null or v_price < 0 then raise exception 'Isi harga titip %', p.name; end if;
      v_unit_cost := v_price / u.qty;
      v_new := case when p.stock > 0 then (p.stock * p.cost + v_base * v_unit_cost) / (p.stock + v_base) else v_unit_cost end;
      v_val := round(v_qty * v_price, 2);
      update products set stock = stock + v_base, cost = round(v_new, 2) where id = p.id;
      perform set_config('prasara.batch', jsonb_build_object('expiry', nullif(l->>'expiry', ''), 'lot', nullif(l->>'lot', ''))::text, true);
      insert into stock_moves(kos_id, product_id, kind, delta, stock_after, value, ref_id, note) values (p_kos, p.id, 'titip', v_base, p.stock + v_base, v_val, p_id, v_no || ' · titipan ' || c.name);
    else
      if p.consign_contact_id is distinct from c.id then raise exception '% bukan titipan dari %', p.name, c.name; end if;
      if v_base > p.stock + 0.0005 then raise exception 'Stok % tinggal % %, tidak cukup untuk dikembalikan sebanyak itu', p.name, trim(to_char(p.stock, 'FM999999990.###'), '.'), p.base_unit; end if;
      v_price := round(p.cost * u.qty, 2);
      v_val := round(v_base * p.cost, 2);
      update products set stock = stock - v_base where id = p.id;
      insert into stock_moves(kos_id, product_id, kind, delta, stock_after, value, ref_id, note) values (p_kos, p.id, 'titip_kembali', -v_base, p.stock - v_base, -v_val, p_id, v_no || ' · kembali ke ' || c.name);
    end if;
    insert into consign_doc_lines(doc_id, kos_id, product_id, name, unit, unit_qty, qty, price, line_total) values (p_id, p_kos, p.id, p.name, u.name, u.qty, v_qty, v_price, v_val);
    v_total := v_total + v_val;
  end loop;
  perform set_config('prasara.batch', '', true);
  perform set_config('prasara.consign_ok', '', true);
  update consign_docs set total = v_total where id = p_id;
  return jsonb_build_object('id', p_id, 'number', v_no, 'total', v_total, 'duplicate', false);
end $$;

-- Nilai yang wajib disetor ke penitip dari gerak stok barang titipan (terjual, rusak, hilang; dikurangi retur/batal)
create or replace function public.consign_owed(p_contact uuid) returns numeric language sql stable security definer set search_path = public as $$
  select coalesce(sum(-m.value), 0) from stock_moves m join products p on p.id = m.product_id
  where p.consign_contact_id = p_contact and m.kind not in ('titip', 'titip_kembali', 'transfer');
$$;

-- Ringkasan konsinyasi: per penitip + per barang; p_from..p_to = rentang untuk angka terjual & laba
create or replace function public.consign_overview(p_kos uuid, p_from date default null, p_to date default null)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_to date := coalesce(p_to, (now() at time zone 'Asia/Jakarta')::date); v_from date; v_fin boolean := member_in('finance', p_kos);
begin
  if not (member_in('stock', p_kos) or v_fin) then raise exception 'Tidak punya akses ke bisnis ini'; end if;
  if not module_on(p_kos, 'r_konsinyasi') then raise exception 'Modul Konsinyasi belum aktif (Konfigurasi › Modul)'; end if;
  v_from := coalesce(p_from, date_trunc('month', v_to)::date);
  return jsonb_build_object('from', v_from, 'to', v_to, 'can_pay', v_fin,
    'penitip', (select coalesce(jsonb_agg(x order by x.name), '[]'::jsonb) from (
      select c.id, c.name, c.phone,
             case when v_fin then contact_balance(c.id) end as saldo,
             (select coalesce(sum(p.stock * p.cost), 0) from products p where p.consign_contact_id = c.id and p.stock > 0) as nilai_stok,
             (select coalesce(jsonb_agg(jsonb_build_object('id', p.id, 'name', p.name, 'base_unit', p.base_unit, 'stock', p.stock, 'cost', p.cost, 'active', p.active,
                 'price', (select price_retail from product_units pu where pu.product_id = p.id order by pu.qty limit 1),
                 'diterima', (select coalesce(sum(m.delta), 0) from stock_moves m where m.product_id = p.id and m.kind = 'titip'),
                 'dikembalikan', (select coalesce(-sum(m.delta), 0) from stock_moves m where m.product_id = p.id and m.kind = 'titip_kembali'),
                 'terjual', (select coalesce(-sum(m.delta), 0) from stock_moves m where m.product_id = p.id and m.kind in ('jual', 'retur_jual', 'batal')),
                 'susut', (select coalesce(-sum(m.delta), 0) from stock_moves m where m.product_id = p.id and m.kind in ('rusak', 'kedaluwarsa', 'opname', 'koreksi')),
                 'terjual_periode', (select coalesce(-sum(m.delta), 0) from stock_moves m where m.product_id = p.id and m.kind in ('jual', 'retur_jual', 'batal')
                                     and (m.created_at at time zone 'Asia/Jakarta')::date between v_from and v_to),
                 'setor_periode', (select coalesce(-sum(m.value), 0) from stock_moves m where m.product_id = p.id and m.kind not in ('titip', 'titip_kembali', 'transfer')
                                   and (m.created_at at time zone 'Asia/Jakarta')::date between v_from and v_to),
                 'omzet_periode', case when v_fin then (select coalesce(sum(sl.line_total), 0) from sale_lines sl join sales s on s.id = sl.sale_id
                                   where sl.product_id = p.id and s.status = 'selesai' and s.sale_date between v_from and v_to) end) order by p.name), '[]'::jsonb)
              from products p where p.consign_contact_id = c.id) as barang,
             (select coalesce(jsonb_agg(jsonb_build_object('id', d.id, 'number', d.number, 'kind', d.kind, 'date', d.doc_date, 'total', d.total, 'note', d.note,
                 'lines', (select jsonb_agg(jsonb_build_object('name', l.name, 'unit', l.unit, 'qty', l.qty, 'price', l.price) order by l.name) from consign_doc_lines l where l.doc_id = d.id)) order by d.created_at desc), '[]'::jsonb)
              from (select * from consign_docs d where d.contact_id = c.id order by d.created_at desc limit 20) d) as dokumen
      from contacts c where c.kos_id = p_kos and c.kind = 'supplier'
        and (exists (select 1 from products p where p.consign_contact_id = c.id) or exists (select 1 from consign_docs d where d.contact_id = c.id))) x));
end $$;

-- ---------- Utang ke penitip & jurnal ----------
create or replace function public._prasara_patch(p_sig text, p_old text, p_new text)
returns void language plpgsql as $$
declare d text;
begin
  d := pg_get_functiondef(p_sig::regprocedure);
  if position(p_old in d) = 0 then raise exception 'patch %: potongan tidak ditemukan', p_sig; end if;
  execute replace(d, p_old, p_new);
end $$;

select public._prasara_patch('public.contact_balance(uuid)',
  $x$+ coalesce((select sum(variance + tax_amount) from supplier_invoices where contact_id = c.id and status = 'diposting'), 0)$x$,
  $x$+ coalesce((select sum(variance + tax_amount) from supplier_invoices where contact_id = c.id and status = 'diposting'), 0)
       + consign_owed(c.id)$x$);

select public._prasara_patch('public.contact_history(uuid)',
  $x$from purchase_returns r where r.contact_id = c.id$x$,
  $x$from purchase_returns r where r.contact_id = c.id
    union all select max(m.created_at), (m.created_at at time zone 'Asia/Jakarta')::date, 'Barang titipan terjual/susut (wajib disetor)', sum(-m.value), 'selesai', null
      from stock_moves m join products p on p.id = m.product_id
      where p.consign_contact_id = c.id and m.kind not in ('titip', 'titip_kembali', 'transfer') and m.value <> 0
      group by (m.created_at at time zone 'Asia/Jakarta')::date having sum(-m.value) <> 0$x$);

select public._prasara_patch('public.acct_ensure(uuid)',
  $x$('5-2100', 'Selisih harga pembelian', 'beban', 'selisih_beli')$x$,
  $x$('5-2100', 'Selisih harga pembelian', 'beban', 'selisih_beli'),
    ('2-1600', 'Titipan konsinyasi (belum terjual)', 'kewajiban', 'titipan')$x$);
select public.acct_ensure(k.id) from public.kos k;

select public._prasara_patch('public.acct_desired(uuid)',
  $x$where si.kos_id = p_kos and si.status = 'diposting' and x.v <> 0;$x$,
  $x$where si.kos_id = p_kos and si.status = 'diposting' and x.v <> 0
  union all
  -- konsinyasi: terima/kembali titipan = Persediaan ↔ Titipan; gerak stok lain pada barang titipan = Titipan → Utang ke penitip
  select 'consign_move', m.id, (m.created_at at time zone 'Asia/Jakarta')::date,
         case m.kind when 'titip' then 'Terima titipan' when 'titip_kembali' then 'Kembalikan titipan' else 'Titipan terjual/susut' end || ' · ' || p.name, x.k, x.v
    from stock_moves m join products p on p.id = m.product_id
    cross join lateral (values (case when m.kind in ('titip', 'titip_kembali') then 'persediaan' else 'titipan' end, case when m.kind in ('titip', 'titip_kembali') then m.value else -m.value end),
                               (case when m.kind in ('titip', 'titip_kembali') then 'titipan' else 'utang' end, case when m.kind in ('titip', 'titip_kembali') then -m.value else m.value end)) x(k, v)
    where m.kos_id = p_kos and p.consign_contact_id is not null and m.kind <> 'transfer' and m.value <> 0;$x$);
drop function public._prasara_patch(text, text, text);

-- ---------- Riwayat aktivitas ----------
create or replace function public.dom_consign_docs() returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform dom_emit(new.kos_id, case new.kind when 'terima' then 'ConsignmentReceived' else 'ConsignmentReturned' end, 'consign_doc', new.id, new.id::text, 'stock',
    case new.kind when 'terima' then 'Terima titipan ' else 'Kembalikan titipan ' end || new.number || ' · ' || coalesce((select name from contacts where id = new.contact_id), '') || ' · ' || dom_rp(new.total),
    new.total, jsonb_build_object('number', new.number, 'kind', new.kind));
  return null;
end $$;
drop trigger if exists dom_consign_docs on public.consign_docs;
create constraint trigger dom_consign_docs after insert on public.consign_docs deferrable initially deferred for each row execute function public.dom_consign_docs();

-- ---------- Module Registry ----------
insert into public.modules(code, name, description, applies_to, core, depends_on, entitlement, paths, data_used, status, version, sort, module_type, category, impl_status, feature_keys, area, optional_deps, owner_approval, config_path)
select 'r_konsinyasi', 'Konsinyasi (titip jual)', 'Barang titipan dari penitip: terima & kembalikan titipan, dijual lewat Kasir seperti biasa, yang terjual otomatis menjadi utang setoran ke penitip, laba toko = harga jual − harga titip.',
       '{retail}', false, '{r_barang}', null, '{/konsinyasi}', 'products.consign_contact_id, consign_docs, stock_moves (titip, titip_kembali)', 'available', '1.0', 68, 'operational', category, 'production_ready', '{}', 'stock', '{}', true, '/konsinyasi'
from public.modules where code = 'r_promo'
on conflict (code) do nothing;
-- bisnis toko baru mendapat modul ini otomatis saat dibuat; samakan untuk toko yang sudah ada (bisa dimatikan di Konfigurasi › Modul)
insert into public.business_modules(kos_id, module_code, active, updated_by)
select k.id, 'r_konsinyasi', true, 'sistem' from public.kos k where k.business_type = 'retail' on conflict do nothing;

revoke execute on function public.consign_guard(uuid, text), public.consign_owed(uuid), public.consign_products_guard(), public.consign_moves_guard(), public.consign_purchase_guard(), public.dom_consign_docs() from public, anon, authenticated;
revoke execute on function public.consign_doc_create(uuid, uuid, text, uuid, jsonb, date, text), public.consign_overview(uuid, date, date) from public, anon;
grant execute on function public.consign_doc_create(uuid, uuid, text, uuid, jsonb, date, text), public.consign_overview(uuid, date, date) to authenticated;
