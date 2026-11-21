-- Tahap 4 Retail · KASIR OFFLINE (Master Retail Bagian 18, ADR-003).
-- Penjualan yang dicatat saat internet putus disimpan di HP (antrean), lalu dikirim lewat SATU pintu pos_offline_submit.
-- Prinsip:
--   * Idempoten: id transaksi dibuat di HP; kiriman ulang mengembalikan hasil yang sama (tidak pernah dobel).
--   * Waktu asli: tanggal, nomor TRX hari itu, jam jual (sold_at → shift), dan kartu stok memakai waktu transaksi di HP.
--   * Uang sudah diterima → transaksi TIDAK ditolak karena aturan yang tak bisa dicek offline (stok minus 'tolak',
--     batas diskon/margin). Semuanya disimpan dan DITANDAI untuk dicek pemilik (pos_offline.issues).
--   * Harga yang tercatat = harga yang ditagih di HP (baris dikirim dengan price). Selisih dengan harga resmi sekarang,
--     promo yang tidak terhitung, stok jadi minus, kasbon lewat batas, shift/tutup harian yang sudah ditutup → issues.
--   * Yang tidak bisa disimpan (mis. barang sudah dihapus) → status 'gagal' + isi lengkap disimpan untuk pemilik.
-- Yang TIDAK boleh offline (dijaga di HP & server): nota kredit (saldo harus dicek server).

create or replace function public._prasara_patch(p_sig text, p_old text, p_new text)
returns void language plpgsql as $$
declare v_def text;
begin
  v_def := pg_get_functiondef(p_sig::regprocedure);
  if position(p_old in v_def) = 0 then raise exception 'Patch % tidak menemukan teks: %', p_sig, left(p_old, 80); end if;
  execute replace(v_def, p_old, p_new);
end $$;

-- ---------- tabel catatan kiriman offline ----------
create table if not exists public.pos_offline (
  id uuid primary key,                       -- = id transaksi dari HP (= sales.id bila tersimpan)
  kos_id uuid not null references public.kos(id) on delete cascade,
  user_id uuid not null,                     -- akun yang mengirim
  device text,
  client_at timestamptz not null,            -- waktu transaksi di HP
  used_at timestamptz not null,              -- waktu yang dipakai (client_at, kecuali jam HP di masa depan)
  received_at timestamptz not null default now(),
  status text not null check (status in ('tersimpan', 'perlu_cek', 'gagal')),
  sale_id uuid references public.sales(id) on delete set null,
  total numeric,
  issues jsonb not null default '[]'::jsonb, -- [{code, text}]
  error text,
  payload jsonb not null,
  reviewed_at timestamptz,
  reviewed_by text,
  review_note text
);
create index if not exists pos_offline_kos on public.pos_offline(kos_id, received_at desc);
create index if not exists pos_offline_open on public.pos_offline(kos_id) where status <> 'tersimpan' and reviewed_at is null;
alter table public.pos_offline enable row level security;
revoke all on public.pos_offline from anon, authenticated;
drop trigger if exists zz_kos_open_guard on public.pos_offline;
create trigger zz_kos_open_guard before insert or update or delete on public.pos_offline for each row execute function public.kos_open_guard();

-- ---------- patch mesin lama (hanya aktif di dalam pos_offline_submit lewat flag transaksi) ----------
-- 1) Tanggal & nomor TRX mengikuti waktu transaksi di HP
select public._prasara_patch('public.sale_create(uuid,uuid,text,jsonb,numeric,text,numeric,uuid,date,text,jsonb)',
  $o$v_day date := (now() at time zone 'Asia/Jakarta')::date;$o$,
  $n$v_day date := (coalesce(nullif(current_setting('prasara.sale_at', true), '')::timestamptz, now()) at time zone 'Asia/Jakarta')::date;$n$);
-- 2) Batas diskon/margin: transaksi offline sudah terjadi → dicatat sebagai temuan, bukan ditolak
select public._prasara_patch('public.discount_guard(uuid,uuid,numeric,numeric,numeric,numeric)',
  $o$  if exists (select 1 from discount_overrides where sale_id = p_id) then return; end if;$o$,
  $n$  if exists (select 1 from discount_overrides where sale_id = p_id) then return; end if;
  if coalesce(current_setting('prasara.offline_ok', true), '') = '1' then
    perform set_config('prasara.offline_disc', concat_ws(' · ',
      case when v_max is not null and v_pct > v_max then 'diskon ' || pct_txt(v_pct) || ' (batas ' || pct_txt(v_max) || ')' end,
      case when v_minm is not null and v_margin is not null and v_margin < v_minm then 'margin ' || pct_txt(v_margin) || ' (minimum ' || pct_txt(v_minm) || ')' end), true);
    return;
  end if;$n$);
-- 3) Aturan stok minus 'tolak': barang sudah keluar dari toko → tidak ditolak; stok minus dicatat sebagai temuan
select public._prasara_patch('public.stock_moves_policy()',
  $o$  if new.kind <> 'jual' or new.delta >= 0 then return new; end if;$o$,
  $n$  if new.kind <> 'jual' or new.delta >= 0 then return new; end if;
  if coalesce(current_setting('prasara.offline_ok', true), '') = '1' then return new; end if;$n$);

-- ---------- pintu kirim ----------
create or replace function public.pos_offline_submit(p_kos uuid, p_tx jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_id uuid; v_prev pos_offline; v_sale sales;
  v_client timestamptz; v_at timestamptz; v_day date;
  v_issues jsonb := '[]'::jsonb; v_lines jsonb; v_contact uuid; v_nc jsonb; v_key text;
  v_res jsonb; v_status text; v_err text; v_tier text; v_method text; v_kasbon numeric := 0;
  v_promo jsonb; l jsonb; p products; u product_units; v_official numeric; v_price numeric;
  r record; v_branch uuid; v_locked boolean; v_disc text; v_reason text; v_settings boolean;
  v_total numeric; v_payload jsonb := p_tx;
begin
  if v_uid is null then raise exception 'Masuk dulu untuk mengirim transaksi'; end if;
  if jsonb_typeof(p_tx) <> 'object' then raise exception 'Data transaksi tidak valid'; end if;
  if length(p_tx::text) > 65536 then raise exception 'Data transaksi terlalu besar'; end if;
  begin v_id := (p_tx->>'id')::uuid; exception when others then raise exception 'Nomor transaksi tidak valid'; end;
  if v_id is null then raise exception 'Nomor transaksi tidak valid'; end if;
  if not exists (select 1 from kos where id = p_kos and business_type = 'retail') then raise exception 'Bisnis tidak ditemukan'; end if;

  -- Kiriman ulang → hasil yang sama (hanya untuk kasir bisnis ini atau akun yang dulu mengirimnya)
  select * into v_prev from pos_offline where id = v_id;
  if v_prev.id is not null then
    if v_prev.kos_id <> p_kos then raise exception 'Transaksi tidak valid'; end if;
    if not member_in('sell', p_kos) and v_prev.user_id <> v_uid then raise exception 'Tidak punya akses ke bisnis ini'; end if;
    return jsonb_build_object('status', v_prev.status, 'sale_id', v_prev.sale_id, 'total', v_prev.total, 'issues', v_prev.issues, 'error', v_prev.error,
      'number', (select number from sales where id = v_prev.sale_id), 'duplicate', true);
  end if;
  -- Sudah tersimpan lewat jalur online (jawaban server tidak sampai ke HP) → cukup kabari
  select * into v_sale from sales where id = v_id;
  if v_sale.id is not null then
    if v_sale.kos_id <> p_kos then raise exception 'Transaksi tidak valid'; end if;
    if not member_in('sell', p_kos) and v_sale.created_by is distinct from v_uid then raise exception 'Tidak punya akses ke bisnis ini'; end if;
    return jsonb_build_object('status', 'tersimpan', 'sale_id', v_sale.id, 'number', v_sale.number, 'total', v_sale.total, 'issues', '[]'::jsonb, 'duplicate', true);
  end if;

  -- Akses: kasir aktif boleh menyimpan. Akses sudah dicabut → TIDAK disimpan sebagai penjualan, tetapi isinya dicatat untuk
  -- pemilik (hanya bila akun ini memang pernah bekerja di bisnis ini, supaya orang asing tidak bisa mengisi catatan).
  if not member_in('sell', p_kos) then
    if not (exists (select 1 from sales where kos_id = p_kos and created_by = v_uid)
         or exists (select 1 from pos_offline where kos_id = p_kos and user_id = v_uid)
         or exists (select 1 from cash_shifts where kos_id = p_kos and user_id = v_uid)) then
      raise exception 'Tidak punya akses ke bisnis ini';
    end if;
    if (select count(*) from pos_offline where kos_id = p_kos and user_id = v_uid and status = 'gagal' and received_at > now() - interval '1 day') >= 300 then
      raise exception 'Terlalu banyak kiriman ditolak hari ini';
    end if;
  end if;

  -- Waktu transaksi
  begin v_client := (p_tx->>'client_at')::timestamptz; exception when others then v_client := null; end;
  if v_client is null then raise exception 'Waktu transaksi tidak valid'; end if;
  v_at := v_client;
  if v_client > now() + interval '10 minutes' then
    v_at := now();
    v_issues := v_issues || jsonb_build_array(jsonb_build_object('code', 'jam', 'text',
      'Jam di HP lebih maju dari jam server (' || to_char(v_client at time zone 'Asia/Jakarta', 'DD/MM HH24:MI') || '). Transaksi dicatat dengan waktu terkirim.'));
  elsif v_client < now() - interval '3 days' then
    v_issues := v_issues || jsonb_build_array(jsonb_build_object('code', 'lama', 'text',
      'Transaksi dari ' || (now()::date - v_client::date) || ' hari lalu baru terkirim. Periksa laporan & tutup harian tanggal itu.'));
  end if;
  v_day := (v_at at time zone 'Asia/Jakarta')::date;

  if not member_in('sell', p_kos) then
    v_status := 'gagal';
    v_err := 'Akses kasir akun ini sudah dicabut sebelum transaksi terkirim. Transaksi belum masuk penjualan — periksa dan catat ulang bila benar.';
  else
    v_tier := coalesce(nullif(p_tx->>'tier', ''), 'ecer');
    v_method := coalesce(p_tx->>'method', 'tunai');
    v_lines := coalesce(p_tx->'lines', '[]'::jsonb);
    v_settings := member_in('settings', p_kos);
    v_reason := nullif(trim(coalesce(p_tx->>'override_reason', '')), '');
    begin
      if v_method = 'nota' or (jsonb_typeof(p_tx->'payments') = 'array' and exists (select 1 from jsonb_array_elements(p_tx->'payments') x where x->>'method' = 'nota')) then
        raise exception 'Nota kredit tidak bisa dipakai saat offline';
      end if;
      if jsonb_typeof(v_lines) <> 'array' or jsonb_array_length(v_lines) = 0 then raise exception 'Keranjang kosong'; end if;

      -- Lokasi saat transaksi (bila masih aktif & boleh dipakai akun ini)
      begin v_branch := nullif(p_tx->>'branch_id', '')::uuid; exception when others then v_branch := null; end;
      if v_branch is not null then
        select coalesce((select locked from member_locations where kos_id = p_kos and user_id = v_uid), false) and not member_can(p_kos, 'team') into v_locked;
        if exists (select 1 from branches where id = v_branch and kos_id = p_kos and active)
           and (not v_locked or v_branch = (select branch_id from member_locations where kos_id = p_kos and user_id = v_uid)) then
          perform set_config('prasara.branch', v_branch::text, true);
        else
          v_issues := v_issues || jsonb_build_array(jsonb_build_object('code', 'lokasi', 'text', 'Lokasi saat transaksi tidak aktif lagi / tidak boleh dipakai akun ini — dicatat di lokasi kerja sekarang.'));
        end if;
      end if;

      -- Pelanggan: yang sudah ada, atau pelanggan baru yang dibuat di HP (kunci yang sama = satu pelanggan)
      begin v_contact := nullif(p_tx->>'contact', '')::uuid; exception when others then v_contact := null; end;
      v_nc := p_tx->'new_contact';
      if v_contact is null and jsonb_typeof(v_nc) = 'object' and coalesce(trim(v_nc->>'name'), '') <> '' then
        v_key := left(coalesce(v_nc->>'key', ''), 80);
        if v_key <> '' then
          select (o.payload->>'_contact')::uuid into v_contact from pos_offline o
          where o.kos_id = p_kos and o.payload->'new_contact'->>'key' = v_key and o.payload ? '_contact'
            and exists (select 1 from contacts c where c.id = (o.payload->>'_contact')::uuid)
          limit 1;
        end if;
        if v_contact is null then
          v_contact := contact_save(p_kos, null, 'pelanggan', left(v_nc->>'name', 120), left(coalesce(v_nc->>'phone', ''), 30));
        end if;
        v_payload := v_payload || jsonb_build_object('_contact', v_contact);
      end if;

      -- Pemeriksaan sebelum disimpan (pembanding = harga & promo resmi SEKARANG)
      for l in select * from jsonb_array_elements(v_lines) loop
        select * into p from products where id = (l->>'product_id')::uuid and kos_id = p_kos;
        if p.id is null then continue; end if;
        select * into u from product_units where product_id = p.id and name = l->>'unit';
        if u.id is null or (l->>'price') is null then continue; end if;
        v_price := (l->>'price')::numeric;
        v_official := price_resolve(p_kos, v_contact, p.id, u.name, v_tier, u.price_retail, u.price_wholesale);
        v_official := least(v_official, coalesce(price_break(p.id, u.name, v_tier, (l->>'qty')::numeric), v_official));
        if abs(coalesce(v_official, 0) - v_price) >= 1 and coalesce(l->>'manual', 'false') <> 'true' then
          v_issues := v_issues || jsonb_build_array(jsonb_build_object('code', 'harga', 'text',
            p.name || ' (' || u.name || '): dijual ' || rp_txt(v_price) || ', harga sekarang ' || rp_txt(v_official) || '.'));
        end if;
      end loop;
      begin
        v_promo := promo_preview(p_kos, v_tier,
          (select jsonb_agg(x - 'price' - 'serials' - 'manual') from jsonb_array_elements(v_lines) x where coalesce(x->>'manual', 'false') <> 'true'), v_contact);
        if coalesce((v_promo->>'total')::numeric, 0) > 0 then
          v_issues := v_issues || jsonb_build_array(jsonb_build_object('code', 'promo', 'text',
            'Promo yang berlaku (' || rp_txt((v_promo->>'total')::numeric) || ') tidak terhitung karena offline — pelanggan membayar tanpa potongan promo.'));
        end if;
      exception when others then null;
      end;
      v_kasbon := case when v_method = 'kasbon' then coalesce((p_tx->>'total')::numeric, 0)
                       else coalesce((select sum((x->>'amount')::numeric) from jsonb_array_elements(case when jsonb_typeof(p_tx->'payments') = 'array' then p_tx->'payments' else '[]'::jsonb end) x where x->>'method' = 'kasbon'), 0) end;
      if v_kasbon > 0 and v_contact is not null then
        begin
          select v_issues || coalesce((select jsonb_agg(jsonb_build_object('code', 'kasbon', 'text', w)) from jsonb_array_elements_text(kasbon_check(p_kos, v_contact, v_kasbon)->'warnings') w), '[]'::jsonb) into v_issues;
        exception when others then null;
        end;
      end if;

      -- Simpan lewat mesin Kasir yang sama (stok, HPP, PPN, piutang, jurnal, seri, paket)
      perform set_config('prasara.offline_ok', '1', true);
      perform set_config('prasara.offline_disc', '', true);
      perform set_config('prasara.sale_at', v_at::text, true);
      begin
        v_res := case when v_reason is not null and v_settings
          then sale_create_ov(v_id, p_kos, v_tier, v_lines, coalesce((p_tx->>'discount')::numeric, 0), v_method, (p_tx->>'paid')::numeric, v_contact,
                              nullif(p_tx->>'due', '')::date, p_tx->>'note', case when jsonb_typeof(p_tx->'payments') = 'array' then p_tx->'payments' end, v_reason)
          else sale_create(v_id, p_kos, v_tier, v_lines, coalesce((p_tx->>'discount')::numeric, 0), v_method, (p_tx->>'paid')::numeric, v_contact,
                           nullif(p_tx->>'due', '')::date, p_tx->>'note', case when jsonb_typeof(p_tx->'payments') = 'array' then p_tx->'payments' end) end;
      exception when others then
        -- Nomor seri bentrok (sudah terjual/rusak) → simpan tanpa nomor seri, nomor bisa diisi menyusul dari detail penjualan
        if v_lines::text like '%"serials"%' and sqlerrm ilike '%nomor seri%' then
          v_issues := v_issues || jsonb_build_array(jsonb_build_object('code', 'nomor_seri', 'text', sqlerrm || ' — disimpan tanpa nomor seri; isi menyusul di detail penjualan.'));
          v_lines := (select jsonb_agg(x - 'serials') from jsonb_array_elements(v_lines) x);
          perform set_config('prasara.offline_ok', '1', true);
          perform set_config('prasara.offline_disc', '', true);
          perform set_config('prasara.sale_at', v_at::text, true);
          if v_branch is not null and not exists (select 1 from jsonb_array_elements(v_issues) i where i->>'code' = 'lokasi') then perform set_config('prasara.branch', v_branch::text, true); end if;
          v_res := sale_create(v_id, p_kos, v_tier, v_lines, coalesce((p_tx->>'discount')::numeric, 0), v_method, (p_tx->>'paid')::numeric, v_contact,
                               nullif(p_tx->>'due', '')::date, p_tx->>'note', case when jsonb_typeof(p_tx->'payments') = 'array' then p_tx->'payments' end);
        else
          raise;
        end if;
      end;
      v_disc := nullif(current_setting('prasara.offline_disc', true), '');
      perform set_config('prasara.offline_ok', '', true);
      perform set_config('prasara.offline_disc', '', true);
      perform set_config('prasara.sale_at', '', true);
      perform set_config('prasara.branch', '', true);
      if v_disc is not null then
        v_issues := v_issues || jsonb_build_array(jsonb_build_object('code', 'batas_diskon', 'text',
          'Melewati batas harga pemilik: ' || v_disc || '.' || coalesce(' Alasan kasir: ' || v_reason || '.', ' Tanpa alasan dari kasir.')));
      end if;

      -- Jam jual & kartu stok = waktu transaksi di HP (shift, laporan per jam, urutan kartu stok)
      update sales set sold_at = v_at where id = v_id;
      update stock_moves set created_at = v_at where ref_id = v_id and kos_id = p_kos;
      select * into v_sale from sales where id = v_id;
      v_total := v_sale.total;

      -- Pemeriksaan sesudah disimpan
      for r in
        select pr.name, pr.base_unit,
               case when loc_multi(p_kos) and v_sale.branch_id is not null
                    then coalesce((select qty from stock_levels where product_id = pr.id and branch_id = v_sale.branch_id), 0) else pr.stock end as qty
        from products pr
        where pr.id in (select product_id from stock_moves where ref_id = v_id and kos_id = p_kos)
      loop
        if r.qty < -0.0005 then
          v_issues := v_issues || jsonb_build_array(jsonb_build_object('code', 'stok', 'text',
            'Stok ' || r.name || ' tercatat ' || trim(to_char(r.qty, 'FM999999990.###'), '.') || ' ' || r.base_unit || ' setelah transaksi ini — hitung ulang / catat barang masuk.'));
        end if;
      end loop;
      if exists (select 1 from cash_shifts where kos_id = p_kos and user_id = v_uid and closed_at is not null and v_at >= opened_at and v_at < closed_at) then
        v_issues := v_issues || jsonb_build_array(jsonb_build_object('code', 'shift', 'text',
          'Shift kasir pada jam itu sudah ditutup sebelum transaksi terkirim — uang laci seharusnya bertambah ' || rp_txt(coalesce(v_sale.amt_tunai, 0)) || '.'));
      end if;
      if exists (select 1 from day_closings where kos_id = p_kos and day = v_day and (v_sale.branch_id is null or branch_id is null or branch_id = v_sale.branch_id)) then
        v_issues := v_issues || jsonb_build_array(jsonb_build_object('code', 'tutup_hari', 'text',
          'Hari ' || to_char(v_day, 'DD/MM/YYYY') || ' sudah ditutup — rekap tutup harian berubah, tutup ulang bila perlu.'));
      end if;
      begin
        if nullif(p_tx->>'lead_id', '') is not null then perform lead_mark_sold((p_tx->>'lead_id')::uuid, v_id); end if;
      exception when others then
        v_issues := v_issues || jsonb_build_array(jsonb_build_object('code', 'prospek', 'text', 'Prospek terkait belum ditandai Jadi: ' || sqlerrm));
      end;
      v_status := case when jsonb_array_length(v_issues) = 0 then 'tersimpan' else 'perlu_cek' end;
    exception when others then
      v_status := 'gagal';
      v_err := regexp_replace(sqlerrm, '^[A-Z_]+:\s*', '');
      v_sale := null; v_total := null;
      v_payload := p_tx;
      perform set_config('prasara.offline_ok', '', true);
      perform set_config('prasara.sale_at', '', true);
      perform set_config('prasara.branch', '', true);
    end;
  end if;

  insert into pos_offline(id, kos_id, user_id, device, client_at, used_at, status, sale_id, total, issues, error, payload)
  values (v_id, p_kos, v_uid, left(p_tx->>'device', 60), v_client, v_at, v_status, v_sale.id,
          coalesce(v_total, nullif(p_tx->>'total', '')::numeric), case when v_status = 'gagal' then '[]'::jsonb else v_issues end, v_err, v_payload);
  return jsonb_build_object('status', v_status, 'sale_id', v_sale.id, 'number', v_sale.number, 'total', coalesce(v_total, nullif(p_tx->>'total', '')::numeric),
    'issues', case when v_status = 'gagal' then '[]'::jsonb else v_issues end, 'error', v_err, 'duplicate', false);
end $$;
revoke execute on function public.pos_offline_submit(uuid, jsonb) from public, anon;
grant execute on function public.pos_offline_submit(uuid, jsonb) to authenticated;

-- Rupiah ringkas untuk pesan temuan (Rp 12.500)
create or replace function public.rp_txt(p numeric) returns text language sql immutable as $$
  select case when p is null then '—' else 'Rp ' || replace(to_char(round(p), 'FM999,999,999,990'), ',', '.') end;
$$;

-- ---------- pemilik: daftar & tandai sudah dicek ----------
create or replace function public.pos_offline_list(p_kos uuid, p_filter text default 'perlu', p_limit int default 100)
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if not member_in('finance', p_kos) then raise exception 'Tidak punya akses ke bisnis ini'; end if;
  return jsonb_build_object(
    'open', (select count(*) from pos_offline where kos_id = p_kos and status <> 'tersimpan' and reviewed_at is null),
    'week', (select count(*) from pos_offline where kos_id = p_kos and received_at > now() - interval '7 days'),
    'rows', coalesce((select jsonb_agg(x order by x.received_at desc) from (
      select o.id, o.status, o.client_at, o.used_at, o.received_at, o.sale_id, o.total, o.issues, o.error, o.device,
             o.reviewed_at, o.reviewed_by, o.review_note, s.number, s.status as sale_status,
             (select email from auth.users where id = o.user_id) as cashier,
             case when o.status = 'gagal' then (
               select jsonb_agg(jsonb_build_object('name', coalesce(pr.name, x->>'name', 'Barang terhapus'), 'unit', x->>'unit', 'qty', (x->>'qty')::numeric, 'price', (x->>'price')::numeric))
               from jsonb_array_elements(o.payload->'lines') x left join products pr on pr.id = (x->>'product_id')::uuid and pr.kos_id = o.kos_id) end as lines,
             case when o.status = 'gagal' then o.payload->>'method' end as method
      from pos_offline o left join sales s on s.id = o.sale_id
      where o.kos_id = p_kos and case coalesce(p_filter, 'perlu') when 'perlu' then o.status <> 'tersimpan' and o.reviewed_at is null
                                                            when 'cek' then o.status <> 'tersimpan' else true end
      order by o.received_at desc limit least(greatest(coalesce(p_limit, 100), 1), 300)) x), '[]'::jsonb));
end $$;
revoke execute on function public.pos_offline_list(uuid, text, int) from public, anon;
grant execute on function public.pos_offline_list(uuid, text, int) to authenticated;

create or replace function public.pos_offline_review(p_id uuid, p_note text default null)
returns void language plpgsql security definer set search_path = public as $$
declare o pos_offline;
begin
  select * into o from pos_offline where id = p_id;
  if o.id is null or not member_in('finance', o.kos_id) then raise exception 'Catatan tidak ditemukan'; end if;
  if o.status = 'tersimpan' then raise exception 'Transaksi ini tidak perlu dicek'; end if;
  update pos_offline set reviewed_at = now(), reviewed_by = actor_email(), review_note = nullif(trim(coalesce(p_note, '')), '') where id = p_id;
end $$;
revoke execute on function public.pos_offline_review(uuid, text) from public, anon;
grant execute on function public.pos_offline_review(uuid, text) to authenticated;

-- Lonceng toko: jumlah kiriman offline yang perlu dicek (hanya pemegang keuangan)
create or replace function public.retail_alerts(p_kos uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if not member_in('stock,finance', p_kos) then raise exception 'Tidak punya akses ke bisnis ini'; end if;
  if not module_on(p_kos, 'r_pengingat') then raise exception 'Modul ini sedang nonaktif. Aktifkan di Pusat konfigurasi.'; end if;
  return retail_alerts_internal(p_kos, member_in('finance', p_kos))
    || case when member_in('finance', p_kos) then jsonb_build_object('offline', coalesce((
         select jsonb_agg(jsonb_build_object('id', o.id, 'status', o.status, 'at', o.used_at, 'total', o.total, 'n', jsonb_array_length(o.issues)) order by o.received_at desc)
         from (select * from pos_offline where kos_id = p_kos and status <> 'tersimpan' and reviewed_at is null order by received_at desc limit 20) o), '[]'::jsonb))
       else '{}'::jsonb end;
end $$;

drop function public._prasara_patch(text, text, text);
