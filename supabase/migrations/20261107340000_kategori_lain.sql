-- Automatic Business Setup tahap 4 — kategori lain:
-- * template Business Builder berbasis data (biz_templates.spec.builder_spec) untuk Pendidikan, Event, Konstruksi/proyek,
--   Rental kendaraan, Travel, Produksi, Pertanian, Klinik/praktik, Komunitas/koperasi, Ekspedisi — tanpa ubah kode inti
-- * Kuliner dasar memakai mesin Jasa: menu (harga per porsi), pesanan makan di tempat (meja) / bungkus / antar, dapur (tahap),
--   bahan baku, pesanan dari halaman bisnis. Istilah di aplikasi menyesuaikan (template_code 'kuliner').

-- ================= Seeder Business Builder dari JSON =================
-- spec: {description, revenue_model, main_process, objects:[{key,name,prefix,icon,workflow,title,
--         fields:[[key,label,type,required,choices[]|null,ref_object_key|null,in_list,filterable]],
--         flow:{st:[[label,tone,initial,final,sla]], rules:[[from|null,to,note,approval]]}, money:{field, statuses:[label]},
--         reports:[[name,metric,field|null,group_by,period_days|null]]}]}
create or replace function public.bb_seed_spec(p_kos uuid, p_tpl text, p_spec jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare ob jsonb; f jsonb; r jsonb; v_obj uuid; i int := 0; j int; k int;
begin
  update bb_workspace set template = p_tpl, description = p_spec->>'description', revenue_model = p_spec->>'revenue_model', main_process = p_spec->>'main_process' where kos_id = p_kos;
  for ob in select * from jsonb_array_elements(p_spec->'objects') loop
    i := i + 1;
    insert into bb_objects(kos_id, key, name, prefix, icon, workflow, sort) values (p_kos, ob->>'key', ob->>'name', ob->>'prefix', coalesce(ob->>'icon', '📋'), coalesce((ob->>'workflow')::boolean, false), i)
    returning id into v_obj;
    j := 0;
    for f in select * from jsonb_array_elements(ob->'fields') loop
      j := j + 1;
      insert into bb_fields(kos_id, object_id, key, label, type, required, choices, ref_object, sort, searchable, filterable, in_list)
      values (p_kos, v_obj, f->>0, f->>1, f->>2, coalesce((f->>3)::boolean, false),
        coalesce((select array_agg(x) from jsonb_array_elements_text(case when jsonb_typeof(f->4) = 'array' then f->4 else '[]' end) x), '{}'),
        case when f->>5 is not null then (select id from bb_objects where kos_id = p_kos and key = f->>5) end,
        j, f->>2 in ('text', 'phone', 'longtext'), coalesce((f->>7)::boolean, false), coalesce((f->>6)::boolean, j <= 4));
    end loop;
    update bb_objects set title_field = ob->>'title' where id = v_obj;
    if ob ? 'flow' then perform bb_seed_flow(p_kos, v_obj, ob->'flow'->'st', ob->'flow'->'rules'); end if;
    if ob ? 'money' then
      update bb_objects set money_field = ob->'money'->>'field', money_account = 'kas',
        money_statuses = array(select id from bb_statuses where object_id = v_obj and label in (select jsonb_array_elements_text(ob->'money'->'statuses')))
      where id = v_obj;
    end if;
    k := 0;
    for r in select * from jsonb_array_elements(coalesce(ob->'reports', '[]')) loop
      k := k + 1;
      insert into bb_reports(kos_id, object_id, name, metric, field_key, group_by, period_days, sort) values (p_kos, v_obj, r->>0, r->>1, r->>2, r->>3, nullif(r->>4, '')::int, k);
    end loop;
  end loop;
end $$;
revoke all on function public.bb_seed_spec(uuid, text, jsonb) from public, anon, authenticated;

create or replace function public._prasara_patch(p_sig text, p_old text, p_new text)
returns void language plpgsql as $$
declare d text;
begin
  d := pg_get_functiondef(p_sig::regprocedure);
  if position(p_old in d) = 0 then raise exception 'patch %: potongan tidak ditemukan', p_sig; end if;
  execute replace(d, p_old, p_new);
end $$;
select public._prasara_patch('public.bb_seed_template(uuid,text)',
  '  else
    update bb_workspace set template = ''kosong'' where kos_id = p_kos;',
  '  elsif exists (select 1 from biz_templates where code = p_tpl and spec ? ''builder_spec'') then
    perform bb_seed_spec(p_kos, p_tpl, (select spec->''builder_spec'' from biz_templates where code = p_tpl));
  else
    update bb_workspace set template = ''kosong'' where kos_id = p_kos;');

-- ================= Template Builder per kategori =================
insert into public.biz_templates(code, name, engine, spec) values
('bb_pendidikan', 'Bimbel & kursus (Business Builder)', 'kustom', $j${
  "questions": [{"key": "hours", "label": "Jam operasional", "type": "text", "placeholder": "mis. 14.00–20.00"}],
  "builder": "bb_pendidikan",
  "items": [{"code": "jam", "kind": "info", "label": "Jam operasional", "input": "hours", "must": "approve", "prefill": "hours", "apply": "profile.hours"},
            {"code": "pembayaran", "kind": "info", "label": "Metode pembayaran", "input": "multi", "choices": ["Tunai", "Transfer bank", "QRIS", "E-wallet"], "must": "optional", "apply": "profile.payment_methods"}],
  "modules": ["u_akuntansi"],
  "builder_spec": {"description": "Bimbel / kursus", "revenue_model": "Biaya les per bulan / per paket", "main_process": "Siswa daftar → ikut kelas → tagihan bulanan → lunas",
    "objects": [
      {"key": "siswa", "name": "Siswa", "prefix": "SSW", "icon": "🎓", "title": "nama", "fields": [["nama", "Nama siswa", "text", true], ["wali", "Nama orang tua/wali", "text"], ["no_hp", "No. WhatsApp", "phone"], ["kelas", "Kelas / program", "text", false, null, null, true, true], ["mulai", "Mulai belajar", "date"]]},
      {"key": "tagihan", "name": "Tagihan les", "prefix": "TGL", "icon": "🧾", "workflow": true, "title": "siswa",
       "fields": [["siswa", "Siswa", "reference", true, null, "siswa", true], ["periode", "Periode (mis. Nov 2026)", "text", true, null, null, true], ["jumlah", "Jumlah", "currency", true, null, null, true], ["jatuh_tempo", "Jatuh tempo", "date"]],
       "flow": {"st": [["Belum bayar", "gold", true, false, 168], ["Lunas", "good", false, true, null], ["Dibebaskan", "void", false, true, null]], "rules": [[0, 1, false, false], [0, 2, true, true]]},
       "money": {"field": "jumlah", "statuses": ["Lunas"]},
       "reports": [["Tagihan per status", "count", null, "status", null], ["Pembayaran per bulan", "sum", "jumlah", "month", 365]]}]}
}$j$::jsonb),
('bb_event', 'Event & wedding organizer (Business Builder)', 'kustom', $j${
  "questions": [{"key": "hours", "label": "Jam kantor", "type": "text", "placeholder": "opsional"}],
  "builder": "bb_event",
  "items": [{"code": "jam", "kind": "info", "label": "Jam kantor", "input": "hours", "must": "optional", "prefill": "hours", "apply": "profile.hours"},
            {"code": "pembayaran", "kind": "info", "label": "Metode pembayaran", "input": "multi", "choices": ["Tunai", "Transfer bank", "QRIS"], "must": "optional", "apply": "profile.payment_methods"}],
  "modules": ["u_akuntansi"],
  "builder_spec": {"description": "Event / wedding organizer", "revenue_model": "Nilai kontrak per acara", "main_process": "Penawaran → deal (DP) → persiapan → hari H → selesai (pelunasan)",
    "objects": [
      {"key": "klien", "name": "Klien", "prefix": "KLN", "icon": "👤", "title": "nama", "fields": [["nama", "Nama", "text", true], ["no_hp", "No. WhatsApp", "phone"], ["catatan", "Catatan", "longtext"]]},
      {"key": "acara", "name": "Acara", "prefix": "ACR", "icon": "🎉", "workflow": true, "title": "nama_acara",
       "fields": [["nama_acara", "Nama acara", "text", true, null, null, true], ["klien", "Klien", "reference", true, null, "klien", true], ["tanggal", "Tanggal acara", "date", true, null, null, true], ["lokasi", "Lokasi", "text"],
                  ["paket", "Paket", "select", false, ["Basic", "Standar", "Premium", "Custom"], null, false, true], ["nilai", "Nilai kontrak", "currency", false, null, null, true], ["dp", "DP diterima", "currency"], ["pj", "Penanggung jawab", "text", false, null, null, false, true]],
       "flow": {"st": [["Penawaran", "info", true, false, 72], ["Deal", "gold", false, false, null], ["Persiapan", "gold", false, false, null], ["Hari H", "gold", false, false, 24], ["Selesai", "good", false, true, null], ["Batal", "void", false, true, null]],
                "rules": [[0, 1, false, false], [1, 2, false, false], [2, 3, false, false], [3, 4, false, false], [null, 5, true, true]]},
       "money": {"field": "nilai", "statuses": ["Selesai"]},
       "reports": [["Acara per status", "count", null, "status", null], ["Nilai kontrak per bulan", "sum", "nilai", "month", 365], ["Per paket", "count", null, "field:paket", 365]]}]}
}$j$::jsonb),
('bb_proyek', 'Kontraktor & proyek (Business Builder)', 'kustom', $j${
  "questions": [{"key": "hours", "label": "Jam kantor", "type": "text", "placeholder": "opsional"}],
  "builder": "bb_proyek",
  "items": [{"code": "jam", "kind": "info", "label": "Jam kantor", "input": "hours", "must": "optional", "prefill": "hours", "apply": "profile.hours"},
            {"code": "pembayaran", "kind": "info", "label": "Metode pembayaran", "input": "multi", "choices": ["Tunai", "Transfer bank"], "must": "optional", "apply": "profile.payment_methods"}],
  "modules": ["u_akuntansi"],
  "builder_spec": {"description": "Kontraktor / renovasi", "revenue_model": "Nilai kontrak per proyek (termin)", "main_process": "Survei → penawaran → dikerjakan → serah terima → selesai",
    "objects": [
      {"key": "klien", "name": "Klien", "prefix": "KLN", "icon": "👤", "title": "nama", "fields": [["nama", "Nama", "text", true], ["no_hp", "No. WhatsApp", "phone"], ["alamat", "Alamat", "text"]]},
      {"key": "proyek", "name": "Proyek", "prefix": "PRY", "icon": "🛠️", "workflow": true, "title": "nama_proyek",
       "fields": [["nama_proyek", "Nama proyek", "text", true, null, null, true], ["klien", "Klien", "reference", true, null, "klien", true], ["lokasi", "Lokasi", "text"], ["nilai", "Nilai kontrak", "currency", false, null, null, true],
                  ["progres", "Progres (%)", "number", false, null, null, true], ["mulai", "Mulai", "date"], ["target", "Target selesai", "date", false, null, null, true], ["mandor", "Mandor / PJ", "text", false, null, null, false, true]],
       "flow": {"st": [["Survei", "info", true, false, 72], ["Penawaran", "info", false, false, 168], ["Dikerjakan", "gold", false, false, null], ["Serah terima", "gold", false, false, 168], ["Selesai", "good", false, true, null], ["Batal", "void", false, true, null]],
                "rules": [[0, 1, false, false], [1, 2, false, false], [2, 3, false, false], [3, 4, false, false], [null, 5, true, true]]},
       "money": {"field": "nilai", "statuses": ["Selesai"]},
       "reports": [["Proyek per status", "count", null, "status", null], ["Nilai kontrak selesai per bulan", "sum", "nilai", "month", 365]]}]}
}$j$::jsonb),
('bb_rental', 'Rental kendaraan / alat (Business Builder)', 'kustom', $j${
  "questions": [{"key": "hours", "label": "Jam operasional", "type": "text", "placeholder": "mis. 07.00–21.00"}],
  "builder": "bb_rental",
  "items": [{"code": "jam", "kind": "info", "label": "Jam operasional", "input": "hours", "must": "approve", "prefill": "hours", "apply": "profile.hours"},
            {"code": "pembayaran", "kind": "info", "label": "Metode pembayaran", "input": "multi", "choices": ["Tunai", "Transfer bank", "QRIS"], "must": "optional", "apply": "profile.payment_methods"}],
  "modules": ["u_akuntansi"],
  "builder_spec": {"description": "Rental kendaraan / alat", "revenue_model": "Sewa per hari", "main_process": "Booking → diambil/berjalan → dikembalikan & dicek → selesai",
    "objects": [
      {"key": "unit", "name": "Kendaraan / alat", "prefix": "UNT", "icon": "🚗", "title": "nama", "fields": [["nama", "Nama / plat", "text", true], ["jenis", "Jenis", "select", false, ["Mobil", "Motor", "Alat", "Lainnya"], null, true, true], ["tarif", "Tarif per hari", "currency", false, null, null, true]]},
      {"key": "penyewa", "name": "Penyewa", "prefix": "PNY", "icon": "👤", "title": "nama", "fields": [["nama", "Nama", "text", true], ["no_hp", "No. WhatsApp", "phone"], ["alamat", "Alamat", "text"]]},
      {"key": "sewa", "name": "Sewa", "prefix": "SWA", "icon": "📅", "workflow": true, "title": "unit",
       "fields": [["unit", "Kendaraan / alat", "reference", true, null, "unit", true], ["penyewa", "Penyewa", "reference", true, null, "penyewa", true], ["mulai", "Mulai", "datetime", true, null, null, true], ["selesai", "Rencana kembali", "datetime", true, null, null, true],
                  ["harga", "Total sewa", "currency", false, null, null, true], ["jaminan", "Jaminan (mis. KTP/SIM ditahan)", "text"], ["kondisi", "Catatan kondisi saat kembali", "longtext"]],
       "flow": {"st": [["Booking", "info", true, false, null], ["Berjalan", "gold", false, false, null], ["Dikembalikan", "good", false, true, null], ["Batal", "void", false, true, null]],
                "rules": [[0, 1, false, false], [1, 2, false, false], [0, 3, true, false]]},
       "money": {"field": "harga", "statuses": ["Dikembalikan"]},
       "reports": [["Sewa per status", "count", null, "status", null], ["Pendapatan sewa per bulan", "sum", "harga", "month", 365], ["Per kendaraan/alat (90 hari)", "sum", "harga", "field:unit", 90]]}]}
}$j$::jsonb),
('bb_travel', 'Agen travel & wisata (Business Builder)', 'kustom', $j${
  "questions": [{"key": "hours", "label": "Jam operasional", "type": "text", "placeholder": "opsional"}],
  "builder": "bb_travel",
  "items": [{"code": "jam", "kind": "info", "label": "Jam operasional", "input": "hours", "must": "optional", "prefill": "hours", "apply": "profile.hours"},
            {"code": "pembayaran", "kind": "info", "label": "Metode pembayaran", "input": "multi", "choices": ["Tunai", "Transfer bank", "QRIS"], "must": "optional", "apply": "profile.payment_methods"}],
  "modules": ["u_akuntansi"],
  "builder_spec": {"description": "Agen travel / paket wisata", "revenue_model": "Harga paket per peserta", "main_process": "Booking → DP → lunas → berangkat → selesai",
    "objects": [
      {"key": "pelanggan", "name": "Pelanggan", "prefix": "PLG", "icon": "👤", "title": "nama", "fields": [["nama", "Nama", "text", true], ["no_hp", "No. WhatsApp", "phone"]]},
      {"key": "pemesanan", "name": "Pemesanan", "prefix": "PMS", "icon": "📅", "workflow": true, "title": "pelanggan",
       "fields": [["pelanggan", "Pelanggan", "reference", true, null, "pelanggan", true], ["paket", "Paket / tujuan", "text", true, null, null, true], ["berangkat", "Tanggal berangkat", "date", true, null, null, true], ["peserta", "Jumlah peserta", "number"],
                  ["total", "Total harga", "currency", false, null, null, true], ["dp", "DP diterima", "currency"]],
       "flow": {"st": [["Booking", "info", true, false, 48], ["DP", "gold", false, false, null], ["Lunas", "good", false, false, null], ["Berangkat", "gold", false, false, null], ["Selesai", "good", false, true, null], ["Batal", "void", false, true, null]],
                "rules": [[0, 1, false, false], [1, 2, false, false], [0, 2, false, false], [2, 3, false, false], [3, 4, false, false], [null, 5, true, true]]},
       "money": {"field": "total", "statuses": ["Lunas"]},
       "reports": [["Pemesanan per status", "count", null, "status", null], ["Penjualan paket per bulan", "sum", "total", "month", 365]]}]}
}$j$::jsonb),
('bb_produksi', 'Produksi pesanan (Business Builder)', 'kustom', $j${
  "questions": [{"key": "hours", "label": "Jam kerja", "type": "text", "placeholder": "mis. 08.00–16.00"}],
  "builder": "bb_produksi",
  "items": [{"code": "jam", "kind": "info", "label": "Jam kerja", "input": "hours", "must": "optional", "prefill": "hours", "apply": "profile.hours"},
            {"code": "pembayaran", "kind": "info", "label": "Metode pembayaran", "input": "multi", "choices": ["Tunai", "Transfer bank", "QRIS"], "must": "optional", "apply": "profile.payment_methods"}],
  "modules": ["u_akuntansi"],
  "builder_spec": {"description": "Produksi berdasarkan pesanan (konveksi, makanan, kerajinan)", "revenue_model": "Harga per pesanan produksi", "main_process": "Pesanan → antre → produksi → cek mutu → selesai → dikirim",
    "objects": [
      {"key": "pelanggan", "name": "Pelanggan", "prefix": "PLG", "icon": "👤", "title": "nama", "fields": [["nama", "Nama", "text", true], ["no_hp", "No. WhatsApp", "phone"], ["alamat", "Alamat", "text"]]},
      {"key": "order", "name": "Order produksi", "prefix": "ORP", "icon": "📦", "workflow": true, "title": "produk",
       "fields": [["produk", "Produk", "text", true, null, null, true], ["pelanggan", "Pelanggan", "reference", false, null, "pelanggan", true], ["jumlah", "Jumlah", "number", true, null, null, true], ["spesifikasi", "Spesifikasi", "longtext"],
                  ["harga", "Total harga", "currency", false, null, null, true], ["target", "Target selesai", "date", false, null, null, true], ["pj", "Penanggung jawab", "text", false, null, null, false, true]],
       "flow": {"st": [["Antre", "info", true, false, 48], ["Produksi", "gold", false, false, null], ["Cek mutu", "gold", false, false, 24], ["Selesai", "good", false, false, null], ["Dikirim", "good", false, true, null], ["Batal", "void", false, true, null]],
                "rules": [[0, 1, false, false], [1, 2, false, false], [2, 1, true, false], [2, 3, false, false], [3, 4, false, false], [null, 5, true, true]]},
       "money": {"field": "harga", "statuses": ["Dikirim"]},
       "reports": [["Order per status", "count", null, "status", null], ["Penjualan per bulan", "sum", "harga", "month", 365], ["Jumlah unit per produk (90 hari)", "sum", "jumlah", "field:produk", 90]]}]}
}$j$::jsonb),
('bb_tani', 'Pertanian & peternakan (Business Builder)', 'kustom', $j${
  "questions": [],
  "builder": "bb_tani",
  "items": [{"code": "pembayaran", "kind": "info", "label": "Metode pembayaran", "input": "multi", "choices": ["Tunai", "Transfer bank"], "must": "optional", "apply": "profile.payment_methods"}],
  "modules": ["u_akuntansi"],
  "builder_spec": {"description": "Pertanian / peternakan", "revenue_model": "Penjualan hasil panen / ternak", "main_process": "Catat hasil → dijual → dibayar",
    "objects": [
      {"key": "lahan", "name": "Lahan / kandang", "prefix": "LHN", "icon": "🌾", "title": "nama", "fields": [["nama", "Nama", "text", true], ["luas", "Luas / kapasitas", "text"], ["komoditas", "Komoditas", "text", false, null, null, true, true]]},
      {"key": "penjualan", "name": "Penjualan hasil", "prefix": "PJH", "icon": "🧾", "workflow": true, "title": "komoditas",
       "fields": [["komoditas", "Komoditas", "text", true, null, null, true, true], ["lahan", "Dari lahan/kandang", "reference", false, null, "lahan"], ["jumlah", "Jumlah (kg/ekor)", "number", true, null, null, true], ["pembeli", "Pembeli", "text", false, null, null, true],
                  ["total", "Total harga", "currency", false, null, null, true]],
       "flow": {"st": [["Dicatat", "info", true, false, null], ["Terjual", "good", false, true, null], ["Batal", "void", false, true, null]], "rules": [[0, 1, false, false], [0, 2, true, false]]},
       "money": {"field": "total", "statuses": ["Terjual"]},
       "reports": [["Penjualan per bulan", "sum", "total", "month", 365], ["Jumlah per komoditas (90 hari)", "sum", "jumlah", "field:komoditas", 90]]}]}
}$j$::jsonb),
('bb_klinik', 'Klinik & praktik (Business Builder)', 'kustom', $j${
  "questions": [{"key": "hours", "label": "Jam praktik", "type": "text", "placeholder": "mis. 16.00–21.00"}],
  "builder": "bb_klinik",
  "items": [{"code": "jam", "kind": "info", "label": "Jam praktik", "input": "hours", "must": "approve", "prefill": "hours", "apply": "profile.hours"},
            {"code": "pembayaran", "kind": "info", "label": "Metode pembayaran", "input": "multi", "choices": ["Tunai", "Transfer bank", "QRIS"], "must": "optional", "apply": "profile.payment_methods"}],
  "modules": ["u_akuntansi"],
  "builder_spec": {"description": "Klinik / praktik (antrean & pembayaran — bukan rekam medis)", "revenue_model": "Biaya per kunjungan", "main_process": "Janji temu → datang → dilayani → selesai & bayar",
    "objects": [
      {"key": "pasien", "name": "Pasien", "prefix": "PSN", "icon": "👤", "title": "nama", "fields": [["nama", "Nama", "text", true], ["no_hp", "No. WhatsApp", "phone"]]},
      {"key": "kunjungan", "name": "Kunjungan", "prefix": "KJG", "icon": "🏥", "workflow": true, "title": "pasien",
       "fields": [["pasien", "Pasien", "reference", true, null, "pasien", true], ["waktu", "Waktu", "datetime", true, null, null, true], ["layanan", "Layanan", "text", false, null, null, true, true], ["petugas", "Dokter / petugas", "text", false, null, null, true, true], ["biaya", "Biaya", "currency", false, null, null, true]],
       "flow": {"st": [["Dijadwalkan", "info", true, false, null], ["Datang", "gold", false, false, 4], ["Selesai", "good", false, true, null], ["Tidak datang", "bad", false, true, null], ["Batal", "void", false, true, null]],
                "rules": [[0, 1, false, false], [1, 2, false, false], [0, 3, false, false], [null, 4, true, false]]},
       "money": {"field": "biaya", "statuses": ["Selesai"]},
       "reports": [["Kunjungan per status (30 hari)", "count", null, "status", 30], ["Pendapatan per bulan", "sum", "biaya", "month", 365], ["Per petugas (30 hari)", "count", null, "field:petugas", 30]]}]}
}$j$::jsonb),
('bb_anggota', 'Komunitas & koperasi (Business Builder)', 'kustom', $j${
  "questions": [],
  "builder": "bb_anggota",
  "items": [{"code": "pembayaran", "kind": "info", "label": "Metode pembayaran iuran", "input": "multi", "choices": ["Tunai", "Transfer bank", "QRIS"], "must": "optional", "apply": "profile.payment_methods"}],
  "modules": ["u_akuntansi"],
  "builder_spec": {"description": "Komunitas / koperasi / organisasi", "revenue_model": "Iuran anggota", "main_process": "Anggota terdaftar → tagihan iuran → lunas",
    "objects": [
      {"key": "anggota", "name": "Anggota", "prefix": "AGT", "icon": "👤", "title": "nama", "fields": [["nama", "Nama", "text", true], ["no_hp", "No. WhatsApp", "phone"], ["bergabung", "Tanggal bergabung", "date"], ["status_anggota", "Status", "select", false, ["Aktif", "Cuti", "Keluar"], null, true, true]]},
      {"key": "iuran", "name": "Iuran", "prefix": "IUR", "icon": "🧾", "workflow": true, "title": "anggota",
       "fields": [["anggota", "Anggota", "reference", true, null, "anggota", true], ["periode", "Periode", "text", true, null, null, true], ["jumlah", "Jumlah", "currency", true, null, null, true]],
       "flow": {"st": [["Belum bayar", "gold", true, false, 336], ["Lunas", "good", false, true, null], ["Dibebaskan", "void", false, true, null]], "rules": [[0, 1, false, false], [0, 2, true, true]]},
       "money": {"field": "jumlah", "statuses": ["Lunas"]},
       "reports": [["Iuran per status", "count", null, "status", null], ["Iuran masuk per bulan", "sum", "jumlah", "month", 365]]}]}
}$j$::jsonb),
('bb_kirim', 'Ekspedisi & kurir (Business Builder)', 'kustom', $j${
  "questions": [{"key": "hours", "label": "Jam operasional", "type": "text", "placeholder": "mis. 08.00–17.00"}],
  "builder": "bb_kirim",
  "items": [{"code": "jam", "kind": "info", "label": "Jam operasional", "input": "hours", "must": "approve", "prefill": "hours", "apply": "profile.hours"},
            {"code": "pembayaran", "kind": "info", "label": "Metode pembayaran", "input": "multi", "choices": ["Tunai", "Transfer bank", "QRIS"], "must": "optional", "apply": "profile.payment_methods"}],
  "modules": ["u_akuntansi"],
  "builder_spec": {"description": "Ekspedisi / kurir", "revenue_model": "Ongkos kirim per paket", "main_process": "Paket diterima → dalam perjalanan → terkirim",
    "objects": [
      {"key": "kiriman", "name": "Kiriman", "prefix": "KRM", "icon": "📦", "workflow": true, "title": "penerima",
       "fields": [["pengirim", "Pengirim", "text", true, null, null, true], ["no_hp_pengirim", "No. HP pengirim", "phone"], ["penerima", "Penerima", "text", true, null, null, true], ["no_hp_penerima", "No. HP penerima", "phone"],
                  ["tujuan", "Alamat tujuan", "text", true, null, null, true], ["berat", "Berat (kg)", "number"], ["ongkir", "Ongkos kirim", "currency", false, null, null, true], ["kurir", "Kurir", "text", false, null, null, false, true]],
       "flow": {"st": [["Diterima", "info", true, false, 24], ["Dalam perjalanan", "gold", false, false, 72], ["Terkirim", "good", false, true, null], ["Gagal / retur", "bad", false, true, null]],
                "rules": [[0, 1, false, false], [1, 2, false, false], [1, 3, true, false]]},
       "money": {"field": "ongkir", "statuses": ["Terkirim"]},
       "reports": [["Kiriman per status", "count", null, "status", null], ["Ongkir per bulan", "sum", "ongkir", "month", 365], ["Per kurir (30 hari)", "count", null, "field:kurir", 30]]}]}
}$j$::jsonb),
-- ================= Kuliner dasar (mesin Jasa) =================
('kuliner', 'Kuliner (menu, pesanan, dapur)', 'jasa', $j${
  "questions": [
    {"key": "hours", "label": "Jam buka", "type": "text", "placeholder": "mis. 10.00–22.00"},
    {"key": "tables", "label": "Jumlah meja (0 bila hanya bungkus)", "type": "number", "placeholder": "mis. 8"},
    {"key": "delivery", "label": "Melayani antar?", "type": "yesno"}
  ],
  "services": {},
  "items": [
    {"code": "jam", "kind": "info", "label": "Jam buka", "input": "hours", "must": "approve", "prefill": "hours", "apply": "profile.hours"},
    {"code": "pembayaran", "kind": "info", "label": "Metode pembayaran", "input": "multi", "choices": ["Tunai", "Transfer bank", "QRIS", "E-wallet"], "must": "approve", "apply": "profile.payment_methods"},
    {"code": "meja", "kind": "info", "label": "Jumlah meja", "help": "Untuk pilihan nomor meja saat mencatat pesanan makan di tempat. Isi 0 bila hanya bungkus/antar.", "input": "number", "unit": "meja", "min": 0, "must": "optional", "prefill": "tables", "apply": "profile.tables"},
    {"code": "alur", "kind": "alur", "label": "Alur dapur", "help": "Tahap pesanan di dapur. Bisa diubah di Menu & tahap.", "input": "stages", "must": "approve", "default": {"stages": ["Dimasak", "Siap saji"]}, "apply": "stages"},
    {"code": "logo", "kind": "info", "label": "Logo", "help": "Unggah logo (foto/gambar persegi). Tampil di halaman bisnis dan aplikasi.", "input": "logo", "must": "optional", "apply": "none"}
  ],
  "modules": ["j_bahan", "r_kontak", "u_crm", "u_halaman", "u_akuntansi"],
  "portal": true
}$j$::jsonb)
on conflict (code) do nothing;

-- Kategori & subkategori memakai template baru (hanya bila belum diubah admin dari bawaan)
update public.biz_categories set engine = 'jasa', template = 'kuliner', note = 'Kuliner dasar: menu & harga, pesanan makan di tempat/bungkus/antar, dapur, bahan baku, pesan dari halaman bisnis. Reservasi meja & split bill dalam rencana.'
  where code = 'kuliner' and template = 'kosong' and engine = 'kustom';
update public.biz_categories set template = 'bb_pendidikan', note = 'Template siswa & tagihan les (Business Builder) — bisa diubah sesuai kebutuhan.' where code = 'pendidikan' and template = 'kosong';
update public.biz_categories set template = 'bb_event', note = 'Template acara & klien (Business Builder) — bisa diubah.' where code = 'event' and template = 'kosong';
update public.biz_categories set template = 'bb_proyek', note = 'Template proyek & klien (Business Builder) — bisa diubah.' where code = 'konstruksi' and template = 'kosong';
update public.biz_categories set template = 'bb_travel', note = 'Template pemesanan paket (Business Builder) — bisa diubah.' where code = 'travel' and template = 'kosong';
update public.biz_categories set template = 'bb_produksi', note = 'Template order produksi (Business Builder). Mesin produksi khusus (BOM, bahan baku otomatis) dalam rencana.' where code = 'manufaktur' and template = 'kosong';
update public.biz_categories set template = 'bb_tani', note = 'Template lahan & penjualan hasil (Business Builder) — bisa diubah.' where code = 'pertanian' and template = 'kosong';
update public.biz_categories set template = 'bb_anggota', note = 'Template anggota & iuran (Business Builder) — bisa diubah.' where code = 'lainnya' and template = 'kosong';
update public.biz_subcategories set template = 'bb_rental' where code = 'travel_rental' and template is null;
update public.biz_subcategories set template = 'bb_klinik', note = 'Untuk antrean & pembayaran; jangan menyimpan diagnosis/rekam medis.' where code = 'kesehatan_klinik' and template = 'kosong';
update public.biz_subcategories set template = 'bb_kirim', note = null where code = 'distribusi_ekspedisi' and template = 'kosong';
update public.biz_subcategories set template = 'bb_rental' where code = 'event_sewa' and template is null;
update public.biz_subcategories set template = 'kosong', note = 'Susun sendiri di Business Builder.' where code = 'lainnya_lain' and template is null;
update public.biz_subcategories set template = 'bb_anggota' where code in ('lainnya_komunitas', 'lainnya_koperasi') and template is null;

-- ================= Kuliner di mesin Jasa: meja / bungkus =================
alter table public.svc_orders add column if not exists dine text check (dine in ('tempat', 'bungkus'));
alter table public.svc_orders add column if not exists table_no text check (table_no is null or length(table_no) <= 20);
select public._prasara_patch('public.svc_order_create(uuid,uuid,jsonb)',
  '  if coalesce((p->>''pickup'')::boolean, false) or coalesce((p->>''deliver'')::boolean, false) then perform svc_logistics_apply(p_id, p); end if;',
  '  if coalesce((p->>''pickup'')::boolean, false) or coalesce((p->>''deliver'')::boolean, false) then perform svc_logistics_apply(p_id, p); end if;
  if p->>''dine'' in (''tempat'', ''bungkus'') then
    update svc_orders set dine = p->>''dine'', table_no = case when p->>''dine'' = ''tempat'' then nullif(left(trim(coalesce(p->>''table_no'', '''')), 20), '''') end where id = p_id;
  end if;');
select public._prasara_patch('public.svc_board(uuid)',
  'o.source, o.confirmed_at,',
  'o.source, o.confirmed_at, o.dine, o.table_no,');
-- Pesanan dari halaman bisnis untuk kuliner = bungkus (atau antar)
select public._prasara_patch('public.public_order_create(text,jsonb,text,integer)',
  '  insert into svc_events(order_id, kos_id, kind, text, actor) values (v_id, k.id, ''status'', ''Permintaan masuk dari halaman bisnis''',
  '  if k.template_code = ''kuliner'' and not v_del then update svc_orders set dine = ''bungkus'' where id = v_id; end if;
  insert into svc_events(order_id, kos_id, kind, text, actor) values (v_id, k.id, ''status'', ''Permintaan masuk dari halaman bisnis''');
-- Kuliner tidak punya "jemput"
select public._prasara_patch('public.public_order_create(text,jsonb,text,integer)',
  'v_pick boolean := coalesce((p->>''pickup'')::boolean, false);',
  'v_pick boolean := coalesce((p->>''pickup'')::boolean, false) and coalesce((select template_code from kos k2 join public_pages pg2 on pg2.kos_id = k2.id where pg2.slug = lower(p_slug)), '''') <> ''kuliner'';');
select public._prasara_patch('public.public_page_view(text)',
  '''logistics'', module_on(k.id, ''j_antar''),',
  '''logistics'', module_on(k.id, ''j_antar''), ''kuliner'', k.template_code = ''kuliner'',');
select public._prasara_patch('public.public_order_status(text,text,text)',
  '''deliver'', o.deliver,',
  '''deliver'', o.deliver, ''dine'', o.dine, ''kuliner'', (select template_code from kos where id = o.kos_id) = ''kuliner'',');

-- draf yang sudah ditolak tidak dihitung dalam batas 10 draf
select public._prasara_patch('public.setup_create(jsonb)',
  'setup_status not in (''active'')) >= 10',
  'setup_status not in (''active'', ''rejected'')) >= 10');
drop function public._prasara_patch(text, text, text);
