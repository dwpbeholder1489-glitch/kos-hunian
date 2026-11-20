-- Adaptive Business Experience v3.0 — Fase 3: Adaptive Dashboard.
-- • Pengaturan dashboard pemilik kini juga menyimpan KPI pilihan (urutan) & periode bawaan per dashboard
--   (experience_configs.dash.<id> = { hidden[], order[], kpis[], period }) — divalidasi server, berversi seperti sebelumnya.
-- • cost_changes: perubahan harga modal dari penerimaan barang nyata (stock_moves jenis 'beli'), untuk sinyal toko.
-- Tidak mengubah tabel/transaksi apa pun.

create or replace function public.exp_clean(p_part text, p jsonb)
returns jsonb language plpgsql immutable as $$
declare path_re text := '^/[a-z0-9/_-]{0,80}$'; id_re text := '^[a-z0-9_-]{1,60}$'; key_re text := '^[a-z0-9_]{1,30}$'; r jsonb := '{}'; d text;
begin
  if p is null or jsonb_typeof(p) <> 'object' then raise exception 'Konfigurasi tidak valid'; end if;
  if p_part = 'nav' then
    if nullif(p->>'main', '') is not null and (p->>'main') !~ path_re then raise exception 'Menu utama tidak valid'; end if;
    r := jsonb_build_object('main', nullif(p->>'main', ''), 'hidden', exp_str_list(p->'hidden', path_re, 80, 'menu tersembunyi'),
      'pins', exp_str_list(p->'pins', path_re, 8, 'pintasan'), 'order', exp_str_list(p->'order', key_re, 30, 'urutan kelompok'));
  elsif p_part = 'quick' then
    r := jsonb_build_object('order', exp_str_list(p->'order', id_re, 60, 'urutan'), 'hidden', exp_str_list(p->'hidden', id_re, 60, 'disembunyikan'),
      'fav', exp_str_list(p->'fav', id_re, 6, 'favorit'));
  elsif p_part = 'dash' then
    for d in select jsonb_object_keys(p) loop
      if d not in ('kos', 'toko', 'jasa', 'kerja') then raise exception 'Dashboard tidak dikenal'; end if;
      if jsonb_typeof(p->d) <> 'object' then raise exception 'Konfigurasi dashboard tidak valid'; end if;
      if nullif(p->d->>'period', '') is not null and p->d->>'period' not in ('hari', '7hari', 'bulan') then raise exception 'Periode dashboard tidak dikenal'; end if;
      r := r || jsonb_build_object(d, jsonb_strip_nulls(jsonb_build_object(
        'hidden', exp_str_list(p->d->'hidden', id_re, 40, 'widget'), 'order', exp_str_list(p->d->'order', id_re, 40, 'urutan widget'),
        'kpis', case when p->d ? 'kpis' then exp_str_list(p->d->'kpis', id_re, 16, 'angka utama') end,
        'period', nullif(p->d->>'period', ''))));
    end loop;
  else raise exception 'Bagian konfigurasi tidak dikenal'; end if;
  return r;
end $$;

-- Perubahan harga modal: dua penerimaan barang terakhir per barang (harga per satuan utama = nilai ÷ jumlah).
-- Hanya bila penerimaan terakhir dalam p_days hari dan berubah ≥ 0,5%.
create or replace function public.cost_changes(p_kos uuid, p_days int default 30)
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if not member_in('stock,finance', p_kos) then raise exception 'Khusus bagian stok atau keuangan'; end if;
  return (with m as (
      select sm.product_id, sm.created_at, sm.value / nullif(sm.delta, 0) unit_cost,
             row_number() over (partition by sm.product_id order by sm.created_at desc, sm.id desc) rn
      from stock_moves sm where sm.kos_id = p_kos and sm.kind = 'beli' and sm.delta > 0 and sm.value > 0
    ), x as (
      select a.product_id, a.created_at, round(a.unit_cost, 2) new_cost, round(b.unit_cost, 2) old_cost
      from m a join m b on b.product_id = a.product_id and b.rn = 2
      where a.rn = 1 and a.created_at >= now() - make_interval(days => greatest(1, least(coalesce(p_days, 30), 365)))
        and abs(a.unit_cost - b.unit_cost) >= 0.005 * b.unit_cost
    )
    select coalesce(jsonb_agg(jsonb_build_object('product_id', x.product_id, 'name', p.name, 'unit', p.base_unit, 'old', x.old_cost, 'new', x.new_cost,
             'pct', round(100 * (x.new_cost - x.old_cost) / nullif(x.old_cost, 0), 1), 'at', x.created_at)
           order by abs(x.new_cost - x.old_cost) / nullif(x.old_cost, 0) desc), '[]')
    from x join products p on p.id = x.product_id);
end $$;
revoke execute on function public.cost_changes(uuid, int) from public, anon;
grant execute on function public.cost_changes(uuid, int) to authenticated;

-- ================= Konstruksi & proyek: RAB, material, tenaga kerja, realisasi vs RAB (§11.2 G) =================
-- Template bb_proyek mendapat jenis data RAB, Material, Tenaga kerja (bisnis BARU; bisnis lama bisa menambah lewat Builder).
update public.biz_templates set spec = jsonb_set(spec, '{builder_spec,objects}', (spec->'builder_spec'->'objects') || $j$[
  {"key": "rab", "name": "RAB", "prefix": "RAB", "icon": "📐", "title": "pekerjaan",
   "fields": [["proyek", "Proyek", "reference", true, null, "proyek", true, true], ["pekerjaan", "Uraian pekerjaan", "text", true, null, null, true], ["kategori", "Kategori", "select", false, ["Material", "Tenaga kerja", "Alat", "Lainnya"], null, true, true],
              ["volume", "Volume", "number"], ["satuan", "Satuan", "text"], ["anggaran", "Anggaran", "currency", true, null, null, true]],
   "reports": [["RAB per proyek", "sum", "anggaran", "field:proyek", null]]},
  {"key": "material", "name": "Material", "prefix": "MAT", "icon": "🧱", "title": "nama",
   "fields": [["proyek", "Proyek", "reference", true, null, "proyek", true, true], ["tanggal", "Tanggal", "date", true, null, null, true], ["nama", "Nama material", "text", true, null, null, true],
              ["jumlah", "Jumlah", "number"], ["satuan", "Satuan", "text"], ["total", "Total harga", "currency", true, null, null, true], ["supplier", "Toko / supplier", "text"]],
   "reports": [["Material per proyek", "sum", "total", "field:proyek", null], ["Material per bulan", "sum", "total", "month", 365]]},
  {"key": "tenaga", "name": "Tenaga kerja", "prefix": "TK", "icon": "👷", "title": "nama",
   "fields": [["proyek", "Proyek", "reference", true, null, "proyek", true, true], ["nama", "Nama pekerja", "text", true, null, null, true], ["peran", "Peran", "select", false, ["Mandor", "Tukang", "Kenek", "Lainnya"], null, true, true],
              ["tanggal", "Tanggal / periode", "date", false, null, null, true], ["hari_kerja", "Hari kerja", "number"], ["upah", "Upah dibayar", "currency", true, null, null, true]],
   "reports": [["Upah per proyek", "sum", "upah", "field:proyek", null]]}]$j$::jsonb)
where code = 'bb_proyek' and not (spec->'builder_spec'->'objects') @> '[{"key": "rab"}]';

create or replace function public._prasara_patch(p_sig text, p_old text, p_new text)
returns void language plpgsql as $$
declare d text;
begin
  d := pg_get_functiondef(p_sig::regprocedure);
  if position(p_old in d) = 0 then raise exception 'patch %: potongan tidak ditemukan', p_sig; end if;
  execute replace(d, p_old, p_new);
end $$;
select public._prasara_patch('public.bb_layout_default(text)', 'when ''bb_proyek'' then $j${
  "kpis": [
    {"label": "Proyek berjalan", "object": "proyek", "agg": "count", "status": ["Dikerjakan", "Serah terima"]},
    {"label": "Nilai proyek berjalan", "object": "proyek", "agg": "sum", "field": "nilai", "status": ["Dikerjakan", "Serah terima"], "money": true},
    {"label": "Survei & penawaran", "object": "proyek", "agg": "count", "status": ["Survei", "Penawaran"], "sub": "belum dikerjakan"},
    {"label": "Target selesai 14 hari", "object": "proyek", "agg": "count", "date": "target", "range": "upto14", "open": true, "tone": "gold", "sub": "termasuk yang lewat target"}],
  "lists": [
    {"title": "Proyek berjalan", "object": "proyek", "status": ["Dikerjakan", "Serah terima"], "sort": "date", "date": "target", "show": ["klien", "progres", "mandor"], "limit": 8},
    {"title": "Survei & penawaran", "object": "proyek", "status": ["Survei", "Penawaran"], "sort": "since", "show": ["klien", "lokasi", "nilai"], "limit": 6}],
  "create": ["proyek", "klien"]}$j$::jsonb', 'when ''bb_proyek'' then $j${
  "kpis": [
    {"label": "Progres rata-rata", "object": "proyek", "agg": "avg", "field": "progres", "status": ["Dikerjakan", "Serah terima"], "suffix": "%", "sub": "proyek yang sedang dikerjakan"},
    {"label": "Proyek berjalan", "object": "proyek", "agg": "count", "status": ["Dikerjakan", "Serah terima"]},
    {"label": "Realisasi vs RAB", "object": "rab", "agg": "ratio", "field": "anggaran", "parts": [{"object": "material", "field": "total"}, {"object": "tenaga", "field": "upah"}], "money": true, "sub": "material + tenaga kerja dibanding total RAB"},
    {"label": "Nilai proyek berjalan", "object": "proyek", "agg": "sum", "field": "nilai", "status": ["Dikerjakan", "Serah terima"], "money": true},
    {"label": "Survei & penawaran", "object": "proyek", "agg": "count", "status": ["Survei", "Penawaran"], "sub": "belum dikerjakan"},
    {"label": "Target selesai 14 hari", "object": "proyek", "agg": "count", "date": "target", "range": "upto14", "open": true, "tone": "gold", "sub": "termasuk yang lewat target"}],
  "lists": [
    {"title": "Proyek berjalan", "object": "proyek", "status": ["Dikerjakan", "Serah terima"], "sort": "date", "date": "target", "show": ["klien", "progres", "mandor"], "limit": 8},
    {"title": "Pembelian material terbaru", "object": "material", "sort": "created", "show": ["proyek", "tanggal", "total"], "limit": 6},
    {"title": "Tenaga kerja terbaru", "object": "tenaga", "sort": "created", "show": ["proyek", "peran", "upah"], "limit": 6},
    {"title": "Survei & penawaran", "object": "proyek", "status": ["Survei", "Penawaran"], "sort": "since", "show": ["klien", "lokasi", "nilai"], "limit": 6}],
  "create": ["proyek", "rab", "material", "tenaga"]}$j$::jsonb');
-- workspace proyek lama memakai tata letak baru (kotak yang jenis datanya belum ada otomatis dilewati)
update public.bb_workspace set layout = public.bb_layout_default('bb_proyek') where template = 'bb_proyek';

-- bb_home: kotak angka 'avg' (rata-rata, mis. progres %) & 'ratio' (realisasi beberapa jenis data dibanding total, mis. RAB)
create or replace function public.bb_home(p_kos uuid) returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_role text := bb_role(p_kos); v_fin boolean := member_in('finance', p_kos); lay jsonb; k jsonb; l jsonb; o bb_objects;
  v numeric; res_k jsonb := '[]'; res_l jsonb := '[]'; res_c jsonb := '[]'; v_rows jsonb; v_today date := (now() at time zone 'Asia/Jakarta')::date; x text;
  hidden text[]; v_num numeric; pt jsonb; po bb_objects;
begin
  perform bb_kustom(p_kos, 'ops');
  select layout into lay from bb_workspace where kos_id = p_kos;
  if lay is null then return jsonb_build_object('layout', false); end if;
  for k in select * from jsonb_array_elements(coalesce(lay->'kpis', '[]')) loop
    select * into o from bb_objects where kos_id = p_kos and key = k->>'object' and active;
    if not found then continue; end if;
    if coalesce((k->>'money')::boolean, false) and not v_fin then continue; end if;
    if k->>'agg' in ('sum', 'avg', 'ratio') and not exists (select 1 from bb_fields f where f.object_id = o.id and f.key = k->>'field' and f.active and not (v_role = any(f.hidden_roles))) then continue; end if;
    if k ? 'date' and left(k->>'date', 1) <> '@' and not exists (select 1 from bb_fields f where f.object_id = o.id and f.key = k->>'date' and f.active) then continue; end if;
    select case when k->>'agg' in ('sum', 'ratio') then coalesce(sum(bb_num(r.data->>(k->>'field'))), 0)
                when k->>'agg' = 'avg' then coalesce(round(avg(bb_num(r.data->>(k->>'field'))), 1), 0) else count(*) end into v
      from bb_records r where r.kos_id = p_kos and r.object_id = o.id and bb_match(r, k, v_today);
    v_num := null;
    if k->>'agg' = 'ratio' then
      -- realisasi (jumlah beberapa jenis data, mis. material + tenaga kerja) dibanding total jenis data utama (mis. RAB)
      v_num := 0;
      for pt in select * from jsonb_array_elements(coalesce(k->'parts', '[]')) loop
        select * into po from bb_objects where kos_id = p_kos and key = pt->>'object' and active;
        if not found or not exists (select 1 from bb_fields f where f.object_id = po.id and f.key = pt->>'field' and f.active and not (v_role = any(f.hidden_roles))) then continue; end if;
        v_num := v_num + coalesce((select sum(bb_num(r.data->>(pt->>'field'))) from bb_records r where r.kos_id = p_kos and r.object_id = po.id and r.archived_at is null), 0);
      end loop;
    end if;
    res_k := res_k || jsonb_strip_nulls(jsonb_build_object('label', k->>'label', 'value', coalesce(v_num, v), 'money', coalesce((k->>'money')::boolean, false) or exists (select 1 from bb_fields f where f.object_id = o.id and f.key = k->>'field' and f.type = 'currency'),
      'sub', k->>'sub', 'tone', k->>'tone', 'object', o.key, 'suffix', k->>'suffix',
      'total', case when k->>'agg' = 'ratio' then v end, 'pct', case when k->>'agg' = 'ratio' and v > 0 then round(v_num * 100 / v, 1) end));
  end loop;
  for l in select * from jsonb_array_elements(coalesce(lay->'lists', '[]')) loop
    select * into o from bb_objects where kos_id = p_kos and key = l->>'object' and active;
    if not found then continue; end if;
    hidden := coalesce((select array_agg(key) from bb_fields where object_id = o.id and v_role = any(hidden_roles)), '{}');
    select coalesce(jsonb_agg(z.j order by z.ord1, z.ord2), '[]') into v_rows from (
      select jsonb_build_object('id', r.id, 'number', r.number, 'title', r.title, 'status', s.label, 'tone', s.tone, 'final', coalesce(s.is_final, false),
          'date', case when l ? 'date' and left(l->>'date', 1) <> '@' and not (l->>'date' = any(hidden)) then r.data->>(l->>'date') end,
          'late', s.sla_hours is not null and not s.is_final and r.status_since + make_interval(hours => s.sla_hours) < now(),
          'show', coalesce((select jsonb_agg(jsonb_build_array(f.label, f.type,
              case when f.type = 'reference' then to_jsonb((select rr.title from bb_records rr where rr.kos_id = p_kos and rr.id::text = r.data->>f.key)) else r.data->f.key end) order by array_position(array(select jsonb_array_elements_text(l->'show')), f.key))
            from bb_fields f where f.object_id = o.id and f.active and f.key in (select jsonb_array_elements_text(coalesce(l->'show', '[]'))) and not (f.key = any(hidden))
              and r.data ? f.key and coalesce(r.data->>f.key, '') <> '' and (f.type <> 'currency' or v_fin)), '[]')) j,
        case l->>'sort' when 'date' then coalesce(bb_day(r.data->>(l->>'date')), '9999-12-31') when 'since' then (r.status_since at time zone 'Asia/Jakarta')::date else null end ord1,
        case l->>'sort' when 'created' then -extract(epoch from r.created_at) when 'since' then extract(epoch from r.status_since) else extract(epoch from r.created_at) end ord2
      from bb_records r left join bb_statuses s on s.id = r.status_id
      where r.kos_id = p_kos and r.object_id = o.id and bb_match(r, l, v_today)
      order by 2, 3 limit greatest(1, least(coalesce((l->>'limit')::int, 8), 20))) z;
    res_l := res_l || jsonb_build_object('title', l->>'title', 'object', o.key, 'object_name', o.name, 'icon', o.icon, 'rows', v_rows,
      'total', (select count(*) from bb_records r where r.kos_id = p_kos and r.object_id = o.id and bb_match(r, l, v_today)));
  end loop;
  for x in select jsonb_array_elements_text(coalesce(lay->'create', '[]')) loop
    select * into o from bb_objects where kos_id = p_kos and key = x and active;
    if found then res_c := res_c || jsonb_build_object('key', o.key, 'name', o.name, 'icon', o.icon); end if;
  end loop;
  return jsonb_build_object('layout', true, 'kpis', res_k, 'lists', res_l, 'create', res_c);
end $$;
revoke all on function public.bb_home(uuid) from public, anon;
grant execute on function public.bb_home(uuid) to authenticated;

drop function public._prasara_patch(text, text, text);
