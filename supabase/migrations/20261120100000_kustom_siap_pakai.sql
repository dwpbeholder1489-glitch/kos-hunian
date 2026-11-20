-- Bisnis kustom SIAP PAKAI (permintaan pemilik 20 Nov 2026: "pelanggan jangan bingung di awal").
-- 1) Bisnis yang dibuat dari template jenis usaha (Event, Pendidikan, Klinik, Bengkel, Salon, Proyek, Rental, Travel,
--    Produksi, Pertanian, Komunitas, Ekspedisi) langsung bisa diaktifkan dari Pusat Konfirmasi — TIDAK wajib lagi masuk
--    Business Builder untuk "Validasi & aktifkan". Validasi tetap dijalankan (bb_ready); Builder menjadi opsional.
-- 2) Tata letak dashboard per jenis usaha: bb_workspace.layout (kotak angka, daftar, tombol buat) + RPC bb_home.
-- 3) Template Event diperkaya (Tugas persiapan & Vendor) untuk bisnis baru.
-- 4) Pilih template siap pakai untuk bisnis yang belum punya catatan (bb_use_template) — terutama "Usaha lain".
-- Tidak mengubah data catatan, uang masuk, jurnal, peran, maupun izin.

-- ================= helper =================
create or replace function public.bb_num(p text) returns numeric language sql immutable as $$
  select case when p ~ '^-?[0-9]+(\.[0-9]+)?$' then p::numeric end $$;
create or replace function public.bb_day(p text) returns date language sql immutable as $$
  select case when p ~ '^\d{4}-\d{2}-\d{2}' then left(p, 10)::date end $$;

-- Template siap dipakai? = workspace sudah aktif, atau struktur lolos validasi (sama dengan tombol Validasi di Builder)
create or replace function public.bb_ready(p_kos uuid) returns boolean language plpgsql stable security definer set search_path = public as $$
begin
  if exists (select 1 from bb_workspace where kos_id = p_kos and status = 'aktif') then return true; end if;
  if not exists (select 1 from bb_objects where kos_id = p_kos and active) then return false; end if;
  return coalesce((bb_validate(p_kos)->>'ok')::boolean, false);
exception when others then return false;
end $$;
revoke all on function public.bb_ready(uuid) from public, anon;
grant execute on function public.bb_ready(uuid) to authenticated;

-- ================= tata letak per template =================
alter table public.bb_workspace add column if not exists layout jsonb;

-- Format: {kpis:[{label, object, agg:'count'|'sum', field?, status?[], not?[], open?, date?('field'|'@created'|'@since'), range?, money?, sub?, tone?}],
--          lists:[{title, object, status?, not?, open?, date?, range?, sort:'date'|'since'|'created', show:[field], limit}],
--          create:[object key]}. range: today | nextN (hari ini s.d. +N) | uptoN (s.d. +N, termasuk yang terlewat) | month
create or replace function public.bb_layout_default(p_tpl text) returns jsonb language sql immutable as $$
select case p_tpl
when 'bb_event' then $j${
  "kpis": [
    {"label": "Acara bulan ini", "object": "acara", "agg": "count", "date": "tanggal", "range": "month", "not": ["Batal"], "sub": "sesuai tanggal acara"},
    {"label": "Nilai kontrak bulan ini", "object": "acara", "agg": "sum", "field": "nilai", "date": "tanggal", "range": "month", "not": ["Batal"], "money": true, "sub": "acara bulan ini, tanpa yang batal"},
    {"label": "Penawaran berjalan", "object": "acara", "agg": "count", "status": ["Penawaran"], "sub": "belum deal"},
    {"label": "Acara 7 hari ke depan", "object": "acara", "agg": "count", "date": "tanggal", "range": "next7", "open": true, "tone": "gold"},
    {"label": "Tugas terlambat", "object": "tugas", "agg": "count", "date": "tenggat", "range": "upto-1", "open": true, "tone": "bad", "sub": "lewat tenggat, belum selesai"}],
  "lists": [
    {"title": "Acara terdekat", "object": "acara", "date": "tanggal", "range": "next60", "open": true, "sort": "date", "show": ["klien", "lokasi", "paket"], "limit": 8},
    {"title": "Tugas persiapan", "object": "tugas", "date": "tenggat", "range": "upto14", "open": true, "sort": "date", "show": ["acara", "pj"], "limit": 8},
    {"title": "Penawaran perlu ditindaklanjuti", "object": "acara", "status": ["Penawaran"], "sort": "since", "show": ["klien", "tanggal", "nilai"], "limit": 6}],
  "create": ["acara", "klien", "tugas"]}$j$::jsonb
when 'bb_proyek' then $j${
  "kpis": [
    {"label": "Proyek berjalan", "object": "proyek", "agg": "count", "status": ["Dikerjakan", "Serah terima"]},
    {"label": "Nilai proyek berjalan", "object": "proyek", "agg": "sum", "field": "nilai", "status": ["Dikerjakan", "Serah terima"], "money": true},
    {"label": "Survei & penawaran", "object": "proyek", "agg": "count", "status": ["Survei", "Penawaran"], "sub": "belum dikerjakan"},
    {"label": "Target selesai 14 hari", "object": "proyek", "agg": "count", "date": "target", "range": "upto14", "open": true, "tone": "gold", "sub": "termasuk yang lewat target"}],
  "lists": [
    {"title": "Proyek berjalan", "object": "proyek", "status": ["Dikerjakan", "Serah terima"], "sort": "date", "date": "target", "show": ["klien", "progres", "mandor"], "limit": 8},
    {"title": "Survei & penawaran", "object": "proyek", "status": ["Survei", "Penawaran"], "sort": "since", "show": ["klien", "lokasi", "nilai"], "limit": 6}],
  "create": ["proyek", "klien"]}$j$::jsonb
when 'bb_pendidikan' then $j${
  "kpis": [
    {"label": "Siswa", "object": "siswa", "agg": "count"},
    {"label": "Tagihan belum dibayar", "object": "tagihan", "agg": "count", "status": ["Belum bayar"], "tone": "gold"},
    {"label": "Total belum dibayar", "object": "tagihan", "agg": "sum", "field": "jumlah", "status": ["Belum bayar"], "money": true},
    {"label": "Jatuh tempo 7 hari", "object": "tagihan", "agg": "count", "status": ["Belum bayar"], "date": "jatuh_tempo", "range": "upto7", "tone": "bad", "sub": "termasuk yang terlewat"}],
  "lists": [
    {"title": "Tagihan jatuh tempo", "object": "tagihan", "status": ["Belum bayar"], "date": "jatuh_tempo", "range": "upto14", "sort": "date", "show": ["siswa", "periode", "jumlah"], "limit": 8},
    {"title": "Siswa terbaru", "object": "siswa", "sort": "created", "show": ["kelas", "no_hp"], "limit": 6}],
  "create": ["siswa", "tagihan"]}$j$::jsonb
when 'bb_rental' then $j${
  "kpis": [
    {"label": "Sewa berjalan", "object": "sewa", "agg": "count", "status": ["Berjalan"]},
    {"label": "Booking", "object": "sewa", "agg": "count", "status": ["Booking"], "sub": "belum diambil"},
    {"label": "Harus kembali hari ini", "object": "sewa", "agg": "count", "status": ["Berjalan"], "date": "selesai", "range": "upto0", "tone": "bad", "sub": "termasuk yang terlambat"},
    {"label": "Unit", "object": "unit", "agg": "count"}],
  "lists": [
    {"title": "Harus kembali", "object": "sewa", "status": ["Berjalan"], "date": "selesai", "range": "upto3", "sort": "date", "show": ["unit", "penyewa", "selesai"], "limit": 8},
    {"title": "Booking mendatang", "object": "sewa", "status": ["Booking"], "date": "mulai", "range": "upto30", "sort": "date", "show": ["unit", "penyewa", "mulai"], "limit": 8}],
  "create": ["sewa", "penyewa", "unit"]}$j$::jsonb
when 'bb_travel' then $j${
  "kpis": [
    {"label": "Pemesanan aktif", "object": "pemesanan", "agg": "count", "open": true},
    {"label": "Berangkat 30 hari", "object": "pemesanan", "agg": "count", "date": "berangkat", "range": "next30", "open": true, "tone": "gold"},
    {"label": "Peserta 30 hari", "object": "pemesanan", "agg": "sum", "field": "peserta", "date": "berangkat", "range": "next30", "open": true},
    {"label": "Belum lunas", "object": "pemesanan", "agg": "count", "status": ["Booking", "DP"], "tone": "bad"}],
  "lists": [
    {"title": "Keberangkatan terdekat", "object": "pemesanan", "date": "berangkat", "range": "next60", "open": true, "sort": "date", "show": ["pelanggan", "paket", "peserta"], "limit": 8},
    {"title": "Belum lunas", "object": "pemesanan", "status": ["Booking", "DP"], "sort": "date", "date": "berangkat", "show": ["pelanggan", "total", "dp"], "limit": 8}],
  "create": ["pemesanan", "pelanggan"]}$j$::jsonb
when 'bb_produksi' then $j${
  "kpis": [
    {"label": "Order berjalan", "object": "order", "agg": "count", "open": true},
    {"label": "Dalam produksi", "object": "order", "agg": "count", "status": ["Produksi", "Cek mutu"]},
    {"label": "Target 7 hari", "object": "order", "agg": "count", "date": "target", "range": "upto7", "open": true, "tone": "bad", "sub": "termasuk yang terlambat"},
    {"label": "Nilai order berjalan", "object": "order", "agg": "sum", "field": "harga", "open": true, "money": true}],
  "lists": [
    {"title": "Target terdekat", "object": "order", "date": "target", "range": "upto14", "open": true, "sort": "date", "show": ["pelanggan", "jumlah", "pj"], "limit": 8},
    {"title": "Antrean", "object": "order", "status": ["Antre"], "sort": "since", "show": ["pelanggan", "jumlah", "target"], "limit": 8}],
  "create": ["order", "pelanggan"]}$j$::jsonb
when 'bb_tani' then $j${
  "kpis": [
    {"label": "Lahan / kandang", "object": "lahan", "agg": "count"},
    {"label": "Hasil belum terjual", "object": "penjualan", "agg": "count", "status": ["Dicatat"], "tone": "gold"},
    {"label": "Penjualan bulan ini", "object": "penjualan", "agg": "sum", "field": "total", "status": ["Terjual"], "date": "@since", "range": "month", "money": true}],
  "lists": [
    {"title": "Hasil belum terjual", "object": "penjualan", "status": ["Dicatat"], "sort": "created", "show": ["lahan", "jumlah"], "limit": 8},
    {"title": "Penjualan terakhir", "object": "penjualan", "status": ["Terjual"], "sort": "since", "show": ["pembeli", "total"], "limit": 6}],
  "create": ["penjualan", "lahan"]}$j$::jsonb
when 'bb_klinik' then $j${
  "kpis": [
    {"label": "Kunjungan hari ini", "object": "kunjungan", "agg": "count", "date": "waktu", "range": "today", "not": ["Batal"]},
    {"label": "Menunggu dilayani", "object": "kunjungan", "agg": "count", "status": ["Datang"], "tone": "gold"},
    {"label": "Dijadwalkan 7 hari", "object": "kunjungan", "agg": "count", "status": ["Dijadwalkan"], "date": "waktu", "range": "next7"},
    {"label": "Pasien", "object": "pasien", "agg": "count"}],
  "lists": [
    {"title": "Jadwal hari ini", "object": "kunjungan", "date": "waktu", "range": "today", "open": true, "sort": "date", "show": ["pasien", "layanan", "petugas"], "limit": 12},
    {"title": "Jadwal mendatang", "object": "kunjungan", "status": ["Dijadwalkan"], "date": "waktu", "range": "next7", "sort": "date", "show": ["pasien", "layanan"], "limit": 8}],
  "create": ["kunjungan", "pasien"]}$j$::jsonb
when 'bb_anggota' then $j${
  "kpis": [
    {"label": "Anggota", "object": "anggota", "agg": "count"},
    {"label": "Iuran belum dibayar", "object": "iuran", "agg": "count", "status": ["Belum bayar"], "tone": "gold"},
    {"label": "Total iuran tertunggak", "object": "iuran", "agg": "sum", "field": "jumlah", "status": ["Belum bayar"], "money": true},
    {"label": "Iuran lunas bulan ini", "object": "iuran", "agg": "sum", "field": "jumlah", "status": ["Lunas"], "date": "@since", "range": "month", "money": true}],
  "lists": [
    {"title": "Iuran belum dibayar", "object": "iuran", "status": ["Belum bayar"], "sort": "since", "show": ["anggota", "periode", "jumlah"], "limit": 8},
    {"title": "Anggota terbaru", "object": "anggota", "sort": "created", "show": ["no_hp", "status_anggota"], "limit": 6}],
  "create": ["iuran", "anggota"]}$j$::jsonb
when 'bb_kirim' then $j${
  "kpis": [
    {"label": "Diterima hari ini", "object": "kiriman", "agg": "count", "date": "@created", "range": "today"},
    {"label": "Belum dikirim", "object": "kiriman", "agg": "count", "status": ["Diterima"], "tone": "gold"},
    {"label": "Dalam perjalanan", "object": "kiriman", "agg": "count", "status": ["Dalam perjalanan"]},
    {"label": "Terkirim hari ini", "object": "kiriman", "agg": "count", "status": ["Terkirim"], "date": "@since", "range": "today"}],
  "lists": [
    {"title": "Dalam perjalanan", "object": "kiriman", "status": ["Dalam perjalanan"], "sort": "since", "show": ["penerima", "tujuan", "kurir"], "limit": 10},
    {"title": "Belum dikirim", "object": "kiriman", "status": ["Diterima"], "sort": "since", "show": ["penerima", "tujuan"], "limit": 8}],
  "create": ["kiriman"]}$j$::jsonb
when 'bengkel' then $j${
  "kpis": [
    {"label": "Antre", "object": "servis", "agg": "count", "status": ["Antre"]},
    {"label": "Dikerjakan", "object": "servis", "agg": "count", "status": ["Dikerjakan"], "tone": "gold"},
    {"label": "Menunggu spare part", "object": "servis", "agg": "count", "status": ["Menunggu spare part"]},
    {"label": "Siap diambil", "object": "servis", "agg": "count", "status": ["Selesai"], "tone": "good"}],
  "lists": [
    {"title": "Antrean & dikerjakan", "object": "servis", "status": ["Antre", "Dikerjakan", "Menunggu spare part"], "sort": "since", "show": ["kendaraan", "jenis_servis", "mekanik"], "limit": 10},
    {"title": "Siap diambil", "object": "servis", "status": ["Selesai"], "sort": "since", "show": ["kendaraan", "biaya_jasa"], "limit": 8}],
  "create": ["servis", "kendaraan", "pelanggan"]}$j$::jsonb
when 'salon' then $j${
  "kpis": [
    {"label": "Janji hari ini", "object": "janji_temu", "agg": "count", "date": "waktu", "range": "today", "not": ["Batal"]},
    {"label": "Sedang dilayani", "object": "janji_temu", "agg": "count", "status": ["Datang"], "tone": "gold"},
    {"label": "Dijadwalkan 7 hari", "object": "janji_temu", "agg": "count", "status": ["Dijadwalkan"], "date": "waktu", "range": "next7"},
    {"label": "Pelanggan", "object": "pelanggan", "agg": "count"}],
  "lists": [
    {"title": "Jadwal hari ini", "object": "janji_temu", "date": "waktu", "range": "today", "open": true, "sort": "date", "show": ["pelanggan", "layanan", "stylist"], "limit": 12},
    {"title": "Jadwal mendatang", "object": "janji_temu", "status": ["Dijadwalkan"], "date": "waktu", "range": "next7", "sort": "date", "show": ["pelanggan", "layanan"], "limit": 8}],
  "create": ["janji_temu", "pelanggan"]}$j$::jsonb
else null end $$;

-- layout terisi otomatis saat template dipasang/diganti (bb_seed_template & bb_seed_spec mengubah kolom template)
create or replace function public.bb_workspace_layout() returns trigger language plpgsql as $$
begin
  if tg_op = 'INSERT' or new.template is distinct from old.template then new.layout := bb_layout_default(new.template); end if;
  return new;
end $$;
drop trigger if exists bb_workspace_layout on public.bb_workspace;
create trigger bb_workspace_layout before insert or update of template on public.bb_workspace for each row execute function public.bb_workspace_layout();
update public.bb_workspace set layout = bb_layout_default(template) where layout is null;

-- ================= cocokkan catatan dengan aturan kotak/daftar =================
create or replace function public.bb_match(r bb_records, p jsonb, p_today date) returns boolean language plpgsql stable security definer set search_path = public as $$
declare s bb_statuses; d date; rg text; n int;
begin
  if r.archived_at is not null then return false; end if;
  if r.status_id is not null then select * into s from bb_statuses where id = r.status_id; end if;
  if p ? 'status' and not coalesce(s.label = any(array(select jsonb_array_elements_text(p->'status'))), false) then return false; end if;
  if p ? 'not' and coalesce(s.label = any(array(select jsonb_array_elements_text(p->'not'))), false) then return false; end if;
  if coalesce((p->>'open')::boolean, false) and coalesce(s.is_final, false) then return false; end if;
  if p ? 'date' and p ? 'range' then
    d := case p->>'date' when '@created' then (r.created_at at time zone 'Asia/Jakarta')::date when '@since' then (r.status_since at time zone 'Asia/Jakarta')::date
           else bb_day(r.data->>(p->>'date')) end;
    if d is null then return false; end if;
    rg := p->>'range';
    if rg = 'today' then return d = p_today;
    elsif rg = 'month' then return date_trunc('month', d) = date_trunc('month', p_today);
    elsif rg ~ '^next[0-9]+$' then n := substr(rg, 5)::int; return d between p_today and p_today + n;
    elsif rg ~ '^upto-?[0-9]+$' then n := substr(rg, 5)::int; return d <= p_today + n;
    end if;
  end if;
  return true;
end $$;
revoke all on function public.bb_match(bb_records, jsonb, date) from public, anon, authenticated;

-- ================= data dashboard sesuai tata letak (izin = sama dengan bb_dashboard/bb_list) =================
create or replace function public.bb_home(p_kos uuid) returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_role text := bb_role(p_kos); v_fin boolean := member_in('finance', p_kos); lay jsonb; k jsonb; l jsonb; o bb_objects;
  v numeric; res_k jsonb := '[]'; res_l jsonb := '[]'; res_c jsonb := '[]'; v_rows jsonb; v_today date := (now() at time zone 'Asia/Jakarta')::date; x text;
  hidden text[];
begin
  perform bb_kustom(p_kos, 'ops');
  select layout into lay from bb_workspace where kos_id = p_kos;
  if lay is null then return jsonb_build_object('layout', false); end if;
  for k in select * from jsonb_array_elements(coalesce(lay->'kpis', '[]')) loop
    select * into o from bb_objects where kos_id = p_kos and key = k->>'object' and active;
    if not found then continue; end if;
    if coalesce((k->>'money')::boolean, false) and not v_fin then continue; end if;
    if k->>'agg' = 'sum' and not exists (select 1 from bb_fields f where f.object_id = o.id and f.key = k->>'field' and f.active and not (v_role = any(f.hidden_roles))) then continue; end if;
    if k ? 'date' and left(k->>'date', 1) <> '@' and not exists (select 1 from bb_fields f where f.object_id = o.id and f.key = k->>'date' and f.active) then continue; end if;
    select case when k->>'agg' = 'sum' then coalesce(sum(bb_num(r.data->>(k->>'field'))), 0) else count(*) end into v
      from bb_records r where r.kos_id = p_kos and r.object_id = o.id and bb_match(r, k, v_today);
    res_k := res_k || jsonb_build_object('label', k->>'label', 'value', v, 'money', coalesce((k->>'money')::boolean, false) or exists (select 1 from bb_fields f where f.object_id = o.id and f.key = k->>'field' and f.type = 'currency'),
      'sub', k->>'sub', 'tone', k->>'tone', 'object', o.key);
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

-- ================= Pusat Konfirmasi: template siap pakai tidak perlu Builder =================
create or replace function public._prasara_patch(p_sig text, p_old text, p_new text)
returns void language plpgsql as $$
declare d text;
begin
  d := pg_get_functiondef(p_sig::regprocedure);
  if position(p_old in d) = 0 then raise exception 'patch %: potongan tidak ditemukan', p_sig; end if;
  execute replace(d, p_old, p_new);
end $$;
select public._prasara_patch('public.setup_activate(uuid)',
  'if k.business_type = ''kustom'' and not exists (select 1 from bb_workspace where kos_id = p_kos and status = ''aktif'') then raise exception ''Selesaikan Validasi & aktifkan di Business Builder dulu''; end if;',
  'if k.business_type = ''kustom'' and not exists (select 1 from bb_workspace where kos_id = p_kos and status = ''aktif'') then
    if not bb_ready(p_kos) then raise exception ''Susun minimal satu jenis data di Business Builder dulu, atau pilih template siap pakai di sana.''; end if;
    update bb_workspace set status = ''aktif'', activated_at = coalesce(activated_at, now()), activated_by = actor_email(), updated_at = now() where kos_id = p_kos;
    perform config_log(p_kos, ''builder_aktifkan'', ''Aktifkan tampilan siap pakai (otomatis dari Pusat Konfirmasi)'', null, jsonb_build_object(''template'', (select template from bb_workspace where kos_id = p_kos)), null, ''rendah'', actor_email());
  end if;');
select public._prasara_patch('public.setup_refresh(uuid)',
  'update setup_items set complete = exists (select 1 from bb_workspace where kos_id = p_kos and status = ''aktif''),
    status = case when exists (select 1 from bb_workspace where kos_id = p_kos and status = ''aktif'') then ''approved'' else ''needs_information'' end',
  'update setup_items set complete = bb_ready(p_kos),
    status = case when bb_ready(p_kos) then ''approved'' else ''needs_information'' end');
select public._prasara_patch('public.setup_clean(text,jsonb,jsonb,uuid)',
  'v := ''{}''; ok := exists (select 1 from bb_workspace where kos_id = p_kos and status = ''aktif'');',
  'v := ''{}''; ok := bb_ready(p_kos);');
select public._prasara_patch('public.setup_generate(uuid)',
  '''Data & alur kerja (Business Builder)'', ''Sesuaikan jenis data, formulir, status, dan laporan, lalu Validasi & aktifkan di Business Builder.''',
  '''Tampilan & alur kerja siap pakai'', ''Sudah disiapkan otomatis sesuai jenis usaha: menu, formulir, status, laporan, dan dashboard. Tidak wajib diubah — sesuaikan kapan saja di Business Builder.''');
update public.setup_items set label = 'Tampilan & alur kerja siap pakai',
  help = 'Sudah disiapkan otomatis sesuai jenis usaha: menu, formulir, status, laporan, dan dashboard. Tidak wajib diubah — sesuaikan kapan saja di Business Builder.'
  where input = 'builder' and status <> 'active';
drop function public._prasara_patch(text, text, text);

-- ================= ganti ke template siap pakai (selama belum ada catatan) =================
create or replace function public.bb_templates() returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object('code', code, 'name', regexp_replace(name, ' \(Business Builder\)$', ''), 'description',
      coalesce(spec->'builder_spec'->>'main_process', case code when 'bengkel' then 'Motor masuk → dicek → dikerjakan → selesai → diambil & dibayar' when 'salon' then 'Janji temu → datang → dilayani → selesai & bayar' end)) order by name), '[]')
  from biz_templates where engine = 'kustom' and code <> 'kosong' and (spec ? 'builder_spec' or code in ('bengkel', 'salon'));
$$;
grant execute on function public.bb_templates() to authenticated;

create or replace function public.bb_use_template(p_kos uuid, p_code text) returns jsonb language plpgsql security definer set search_path = public as $$
begin
  if not member_can(p_kos, 'team') then raise exception 'Hanya pemilik yang bisa mengganti template'; end if;
  if (select business_type from kos where id = p_kos) <> 'kustom' then raise exception 'Bukan bisnis kustom'; end if;
  if exists (select 1 from bb_records where kos_id = p_kos) then raise exception 'Template hanya bisa diganti sebelum ada catatan. Sesuaikan lewat Business Builder.'; end if;
  if not exists (select 1 from biz_templates where code = p_code and engine = 'kustom' and code <> 'kosong' and (spec ? 'builder_spec' or code in ('bengkel', 'salon'))) then raise exception 'Template tidak dikenal'; end if;
  delete from bb_reports where kos_id = p_kos;
  delete from bb_transitions where kos_id = p_kos;
  update bb_fields set ref_object = null where kos_id = p_kos;
  delete from bb_statuses where kos_id = p_kos;
  delete from bb_fields where kos_id = p_kos;
  delete from bb_objects where kos_id = p_kos;
  -- template diganti lebih dulu → trigger mengisi tata letak; isi template lalu dipasang ulang
  update bb_workspace set template = p_code, status = 'draft', description = null, revenue_model = null, main_process = null, updated_at = now() where kos_id = p_kos;
  perform bb_seed_template(p_kos, p_code);
  -- bisnis yang sudah aktif langsung memakai tampilan baru; bisnis draf diaktifkan bersama Pusat Konfirmasi
  if coalesce((select setup_status from kos where id = p_kos), 'active') = 'active' then
    update bb_workspace set status = 'aktif', activated_at = coalesce(activated_at, now()), activated_by = actor_email() where kos_id = p_kos;
  end if;
  perform config_log(p_kos, 'builder_template', 'Pakai template siap pakai', null, jsonb_build_object('template', p_code), null, 'menengah', actor_email());
  return jsonb_build_object('template', p_code);
end $$;
revoke all on function public.bb_use_template(uuid, text) from public, anon;
grant execute on function public.bb_use_template(uuid, text) to authenticated;

-- ================= Template Event diperkaya (bisnis BARU): tugas persiapan & vendor =================
update public.biz_templates set spec = jsonb_set(spec, '{builder_spec,objects}', (spec->'builder_spec'->'objects') || $j$[
  {"key": "tugas", "name": "Tugas persiapan", "prefix": "TGS", "icon": "✅", "workflow": true, "title": "tugas",
   "fields": [["tugas", "Tugas", "text", true, null, null, true], ["acara", "Acara", "reference", true, null, "acara", true], ["tenggat", "Tenggat", "date", false, null, null, true], ["pj", "Penanggung jawab", "text", false, null, null, true, true], ["catatan", "Catatan", "longtext"]],
   "flow": {"st": [["Belum", "info", true, false, null], ["Dikerjakan", "gold", false, false, null], ["Selesai", "good", false, true, null], ["Batal", "void", false, true, null]],
            "rules": [[0, 1, false, false], [1, 2, false, false], [0, 2, false, false], [null, 3, false, false]]},
   "reports": [["Tugas per status", "count", null, "status", null], ["Tugas per penanggung jawab", "count", null, "field:pj", 90]]},
  {"key": "vendor", "name": "Vendor", "prefix": "VND", "icon": "🤝", "title": "nama",
   "fields": [["nama", "Nama vendor", "text", true], ["kategori", "Kategori", "select", false, ["Dekorasi", "Katering", "Dokumentasi", "Sound & lighting", "MC & hiburan", "Venue", "Lainnya"], null, true, true], ["no_hp", "No. WhatsApp", "phone"], ["catatan", "Catatan (harga, syarat)", "longtext"]]}
]$j$::jsonb)
where code = 'bb_event' and not exists (select 1 from jsonb_array_elements(spec->'builder_spec'->'objects') x where x->>'key' = 'tugas');

-- ================= bisnis aktif yang masih tertahan di draf Builder (belum bisa mencatat apa pun) =================
update public.bb_workspace w set status = 'aktif', activated_at = coalesce(activated_at, now()), activated_by = 'sistem (siap pakai)', updated_at = now()
where w.status <> 'aktif' and w.template <> 'kosong'
  and exists (select 1 from kos k where k.id = w.kos_id and k.business_type = 'kustom' and (k.setup_status is null or k.setup_status = 'active'))
  and not exists (select 1 from bb_records r where r.kos_id = w.kos_id)
  and exists (select 1 from bb_objects o where o.kos_id = w.kos_id and o.active);
